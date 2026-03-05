/**
 * Zoho CRM call logging — creates call activities with idempotency.
 *
 * On call end, creates a Call record in Zoho CRM:
 * - direction, duration, start/end time
 * - from/to number, disposition
 * - linked to Contact/Lead/Account record
 * - optional recording URL
 *
 * Idempotent: uses correlationId to prevent duplicate logs.
 * Resilient: retry with exponential backoff on transient failures.
 */

import type { CtiCallEvent } from "../../cti/types/call-event";
import type { ZohoDc } from "./zoho-dc";
import { getCrmApiBase } from "./zoho-dc";
import { withRetry } from "../../queue/retry";
import { writeAuditLog } from "../../observability/audit-log";
import { metrics } from "../../observability/metrics";
import { logger } from "../../observability/logger";

const log = logger.child({ module: "zoho-call-logger" });

// Track logged calls to prevent duplicates (correlationId -> timestamp)
const loggedCalls = new Map<string, number>();

export interface ZohoCallLogConfig {
  accessToken: string;
  dc: ZohoDc;
  ownerZohoUserId?: string;
}

interface ZohoCallPayload {
  Subject: string;
  Call_Type: "Inbound" | "Outbound";
  Call_Start_Time: string;
  Call_Duration: string;
  Description: string;
  Who_Id?: string;
  What_Id?: string;
  $se_module?: string;
  Call_Result?: string;
}

/**
 * Log a completed call to Zoho CRM.
 * Idempotent — skips if the same correlationId was already logged.
 * Retries on transient failures with exponential backoff.
 */
export async function logCallToZoho(
  event: CtiCallEvent,
  config: ZohoCallLogConfig
): Promise<{ success: boolean; zohoCallId?: string; error?: string }> {
  // Idempotency check
  const idempotencyKey = `zoho-call-log:${event.correlationId}`;
  if (loggedCalls.has(event.correlationId)) {
    log.info(
      { correlationId: event.correlationId, idempotencyKey },
      "Call already logged — skipping duplicate"
    );
    metrics.increment("cti_call_log_deduplicated");

    writeAuditLog({
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      actor: `agent:${event.agentId}`,
      action: "cti.call_log_skipped",
      resource: `zoho_call:${idempotencyKey}`,
      detail: { reason: "duplicate" },
    });

    return { success: true, zohoCallId: "duplicate-skipped" };
  }

  const apiBase = getCrmApiBase(config.dc);
  const durationMins = formatDuration(event.durationSecs ?? 0);
  const startTime = Date.now();

  // Build subject with contact name if available
  const contactLabel = event.crmContext?.displayName || event.fromNumber;
  const dirLabel = event.direction === "inbound" ? "Inbound" : "Outbound";

  const payload: ZohoCallPayload = {
    Subject: `${dirLabel} call with ${contactLabel}`,
    Call_Type: event.direction === "inbound" ? "Inbound" : "Outbound",
    Call_Start_Time: event.timestamp,
    Call_Duration: durationMins,
    Description: buildDescription(event),
    Call_Result: mapDisposition(event.disposition),
  };

  // Link to CRM record if matched
  if (event.crmContext?.recordId) {
    if (
      event.crmContext.module === "Contacts" ||
      event.crmContext.module === "Leads"
    ) {
      payload.Who_Id = event.crmContext.recordId;
    } else if (event.crmContext.module === "Accounts") {
      payload.What_Id = event.crmContext.recordId;
      payload.$se_module = "Accounts";
    }
  }

  try {
    const result = await withRetry(
      async () => {
        const res = await fetch(`${apiBase}/Calls`, {
          method: "POST",
          headers: {
            Authorization: `Zoho-oauthtoken ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ data: [payload] }),
        });

        if (res.status === 429 || res.status >= 500) {
          const text = await res.text();
          throw new Error(`Zoho API ${res.status}: ${text}`);
        }

        if (!res.ok) {
          const text = await res.text();
          // Non-retryable client errors — throw without retry
          return { success: false as const, error: `Zoho API ${res.status}: ${text}` };
        }

        const data = await res.json();
        return { success: true as const, zohoCallId: data?.data?.[0]?.details?.id as string | undefined };
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        onRetry: (attempt, err) => {
          metrics.increment("cti_call_log_retry", { attempt: String(attempt) });
          log.warn(
            { correlationId: event.correlationId, attempt, error: err.message },
            "Retrying Zoho call log"
          );
        },
      }
    );

    const latencyMs = Date.now() - startTime;

    if (!result.success) {
      metrics.increment("cti_call_log_failed");
      log.error(
        { correlationId: event.correlationId, error: result.error, latencyMs },
        "Zoho call log failed (non-retryable)"
      );
      return result;
    }

    // Mark as logged
    loggedCalls.set(event.correlationId, Date.now());

    // Cleanup old entries (keep last 1000)
    if (loggedCalls.size > 1000) {
      const entries = [...loggedCalls.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < entries.length - 500; i++) {
        loggedCalls.delete(entries[i][0]);
      }
    }

    metrics.increment("cti_call_log_success");
    log.info(
      { correlationId: event.correlationId, zohoCallId: result.zohoCallId, latencyMs },
      "Call logged to Zoho CRM"
    );

    // Audit log
    writeAuditLog({
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      actor: `agent:${event.agentId}`,
      action: "cti.call_logged",
      resource: `zoho_call:${result.zohoCallId || "unknown"}`,
      detail: {
        direction: event.direction,
        disposition: event.disposition,
        durationSecs: event.durationSecs,
        fromNumber: event.fromNumber,
        toNumber: event.toNumber,
        crmRecordId: event.crmContext?.recordId,
      },
    });

    return { success: true, zohoCallId: result.zohoCallId };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    metrics.increment("cti_call_log_failed");
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    log.error(
      { err, correlationId: event.correlationId, latencyMs },
      "Failed to log call to Zoho after retries"
    );

    writeAuditLog({
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      actor: `agent:${event.agentId}`,
      action: "cti.call_log_failed",
      resource: `call:${event.callId}`,
      detail: { error: errorMsg, latencyMs },
    });

    return { success: false, error: errorMsg };
  }
}

function formatDuration(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remaining = secs % 60;
  return `${String(mins).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function mapDisposition(disposition?: string): string {
  switch (disposition) {
    case "answered":
      return "Call Completed";
    case "missed":
      return "Missed";
    case "voicemail":
      return "Voicemail";
    case "busy":
      return "Busy";
    case "no_answer":
      return "No Answer";
    case "transferred":
      return "Call Completed";
    default:
      return "Call Completed";
  }
}

function buildDescription(event: CtiCallEvent): string {
  const parts = [
    `Direction: ${event.direction}`,
    `From: ${event.fromNumber}`,
    `To: ${event.toNumber}`,
    `Duration: ${event.durationSecs ?? 0}s`,
    `Disposition: ${event.disposition ?? "unknown"}`,
  ];
  if (event.crmContext?.displayName) {
    parts.push(`Contact: ${event.crmContext.displayName}`);
  }
  if (event.crmContext?.company) {
    parts.push(`Company: ${event.crmContext.company}`);
  }
  if (event.recordingUrl) {
    parts.push(`Recording: ${event.recordingUrl}`);
  }
  if (event.notes) {
    parts.push(`\nAgent Notes:\n${event.notes}`);
  }
  parts.push(`\n---\nCorrelation ID: ${event.correlationId}`);
  parts.push(`Tag: Rainbow CTI`);
  return parts.join("\n");
}
