import { eventBus } from "./event-bus";
import { interactionManager } from "./interaction-manager";
import { runWithTenant } from "./tenant-context";
import { sseManager } from "../sse";
import type { ScreenPopData } from "../sse/types";
import { normalizePhone } from "../utils/phone";
import { prisma } from "../db";
import { logger } from "../observability/logger";
import { crmService } from "../crm/service";
import { processEvent } from "../cti/bridge/event-processor";
import type { RawTelephonyEvent } from "../cti/bridge/event-processor";

/**
 * Inbound Call Handler — listens to Rainbow S2S callbacks for incoming calls,
 * creates INBOUND interactions, resolves callers, and pushes screen.pop events via SSE.
 */
class InboundCallHandler {
  private initialized = false;

  /** Start listening for inbound call events */
  initialize(): void {
    if (this.initialized) return;

    eventBus.on("rainbow.callback", async (event) => {
      try {
        await this.handleCallback(event);
      } catch (err) {
        logger.error({ err, event }, "Error handling inbound call event");
      }
    });

    this.initialized = true;
    logger.info("InboundCallHandler initialized");
  }

  private async handleCallback(event: {
    eventType: string;
    tenantId: string;
    payload: unknown;
  }): Promise<void> {
    const { eventType, tenantId, payload } = event;
    const body = payload as Record<string, unknown>;

    // Handle Rainbow S2S telephony sub-path events
    if (eventType === "telephony/rvcp" || eventType === "telephony/pcg") {
      await this.handleTelephonyEvent(tenantId, body);
      return;
    }

    // Handle different call lifecycle events
    switch (eventType) {
      case "call.ringing":
      case "call_ringing":
      case "ringing":
        await this.handleRinging(tenantId, body);
        break;

      case "call.active":
      case "call_active":
      case "active":
        await this.handleStatusChange(tenantId, body, "ACTIVE");
        break;

      case "call.ended":
      case "call_ended":
      case "released":
        await this.handleStatusChange(tenantId, body, "COMPLETED");
        break;

      default:
        logger.debug({ eventType, tenantId }, "Unhandled callback event type");
        break;
    }
  }

  /**
   * Forward a Rainbow event to the CTI bridge so /cti-widget subscribers also receive it.
   * Uses agentId "*" to broadcast to all CTI subscribers in the tenant.
   */
  private async forwardToCti(
    tenantId: string,
    callId: string,
    state: "ringing" | "connected" | "ended",
    callerNumber: string
  ): Promise<void> {
    try {
      const raw: RawTelephonyEvent = {
        callId,
        direction: "inbound",
        fromNumber: callerNumber,
        toNumber: "",
        timestamp: new Date().toISOString(),
        state,
        agentId: "*",
        tenantId,
      };
      await processEvent(raw);
      logger.debug({ tenantId, callId, state }, "Rainbow event forwarded to CTI bridge");
    } catch (err) {
      logger.warn({ err, tenantId, callId, state }, "Failed to forward Rainbow event to CTI bridge");
    }
  }

  private async handleRinging(
    tenantId: string,
    body: Record<string, unknown>
  ): Promise<void> {
    const callId = (body.callId as string) ?? (body.call_id as string);
    const callerNumber =
      (body.callerNumber as string) ??
      (body.caller_number as string) ??
      (body.from as string) ??
      "";

    if (!callerNumber) {
      logger.warn({ tenantId, callId }, "Inbound call with no caller number, skipping screen pop");
      return;
    }

    const normalized = normalizePhone(callerNumber);

    // Forward to CTI bridge for /cti-widget subscribers
    await this.forwardToCti(tenantId, callId ?? "unknown", "ringing", normalized);
    logger.info(
      { tenantId, callId, rawCallerNumber: callerNumber, normalizedPhone: normalized },
      "[InboundCall] handleRinging: resolving contact"
    );

    // Resolve caller via CrmService (single entry point for all CRM operations)
    let contact: Awaited<ReturnType<typeof crmService.resolveCallerByPhone>> = null;
    try {
      contact = await crmService.resolveCallerByPhone(tenantId, normalized);
      logger.info(
        { tenantId, callId, contactFound: !!contact, contactName: contact?.displayName ?? null },
        "[InboundCall] Contact resolution result"
      );
    } catch (err) {
      logger.error({ err, tenantId, callId, normalizedPhone: normalized }, "[InboundCall] Contact resolution FAILED");
    }

    // Broadcast screen pop immediately (don't wait for DB interaction creation)
    const screenPopData: ScreenPopData = {
      interactionId: callId ?? "unknown",
      callerNumber: normalized,
      contact: contact
        ? {
            displayName: contact.displayName,
            email: contact.email ?? undefined,
            company: contact.company ?? undefined,
            phone: contact.phone ?? undefined,
            crmUrl: crmService.buildCrmLink(contact),
            avatarUrl: contact.avatarUrl ?? undefined,
          }
        : null,
    };

    sseManager.broadcast(tenantId, "screen.pop", screenPopData);
    eventBus.emit("screen.pop", { tenantId, data: screenPopData });

    logger.info(
      { tenantId, callId, callerNumber: normalized, contactFound: !!contact },
      "Screen pop event broadcast"
    );

    // Create interaction record in background (non-blocking for screen pop)
    try {
      const interaction = await runWithTenant(
        { tenantId, tenantSlug: tenantId, tenantStatus: "ACTIVE" },
        () =>
          interactionManager.createInbound({
            tenantId,
            type: "PHONE_CALL",
            callerPhone: normalized,
            contactId: contact?.id,
            rainbowCallId: callId,
            metadata: { originalCallerNumber: callerNumber },
          })
      );

      // Update the screen pop with the real interaction ID
      sseManager.broadcast(tenantId, "call.updated", {
        interactionId: interaction.id,
        status: "RINGING",
        rainbowCallId: callId,
      });
    } catch (err) {
      logger.error({ err, tenantId, callId }, "Failed to create inbound interaction");
    }
  }

  private async handleStatusChange(
    tenantId: string,
    body: Record<string, unknown>,
    newStatus: "ACTIVE" | "COMPLETED"
  ): Promise<void> {
    const callId = (body.callId as string) ?? (body.call_id as string);
    if (!callId) return;

    // Forward to CTI bridge for /cti-widget subscribers
    const ctiState = newStatus === "ACTIVE" ? "connected" : "ended";
    await this.forwardToCti(tenantId, callId, ctiState, "");

    // Find the interaction by rainbowCallId
    const interaction = await prisma.interaction.findFirst({
      where: { rainbowCallId: callId, tenantId },
    });

    if (!interaction) {
      logger.debug({ tenantId, callId, newStatus }, "No interaction found for call status change");
      return;
    }

    // Update interaction status
    await runWithTenant(
      { tenantId, tenantSlug: tenantId, tenantStatus: "ACTIVE" },
      () => interactionManager.updateStatus(interaction.id, { status: newStatus })
    );

    // Broadcast appropriate SSE event
    if (newStatus === "ACTIVE") {
      sseManager.broadcast(tenantId, "call.updated", {
        interactionId: interaction.id,
        status: "ACTIVE",
        rainbowCallId: callId,
      });
    } else if (newStatus === "COMPLETED") {
      const updated = await prisma.interaction.findFirst({
        where: { id: interaction.id },
      });
      sseManager.broadcast(tenantId, "call.ended", {
        interactionId: interaction.id,
        status: "COMPLETED",
        durationSecs: updated?.durationSecs ?? undefined,
        rainbowCallId: callId,
      });
    }

    eventBus.emit("call.status_changed", {
      tenantId,
      interactionId: interaction.id,
      status: newStatus,
      rainbowCallId: callId,
    });
  }

  /**
   * Handle Rainbow S2S telephony events (from /telephony/rvcp or /telephony/pcg sub-paths).
   * These contain call state in a nested event object with calls/legs/endpoints arrays.
   */
  private async handleTelephonyEvent(
    tenantId: string,
    body: Record<string, unknown>
  ): Promise<void> {
    const eventObj = body.event as Record<string, unknown> | undefined;
    if (!eventObj) {
      logger.debug({ tenantId, body }, "Telephony event with no event object");
      return;
    }

    const calls = eventObj.calls as Array<Record<string, unknown>> | undefined;
    const legs = eventObj.legs as Array<Record<string, unknown>> | undefined;

    const endpoints = eventObj.endpoints as Array<Record<string, unknown>> | undefined;

    // Build a map of callId → caller phone from endpoints (Rainbow puts phone numbers here)
    const endpointPhones = new Map<string, string>();
    if (endpoints) {
      for (const ep of endpoints) {
        const epCallId = (ep.callId as string) ?? "";
        const phone = String(ep.phoneNumber ?? ep.displayName ?? "");
        if (epCallId && phone) {
          endpointPhones.set(epCallId, phone);
        }
      }
    }

    // Extract call info from calls array
    if (calls && calls.length > 0) {
      for (const call of calls) {
        const callId = (call.callId as string) ?? (call.id as string) ?? "unknown";
        const status = (call.status as string) ?? "";
        const op = (call.op as string) ?? "";
        const callerNumber = (call.callingPartyNumber as string) ??
          (call.remotePartyNumber as string) ??
          endpointPhones.get(callId) ?? "";

        logger.info(
          { tenantId, callId, status, op, callerNumber },
          "Rainbow telephony call event"
        );

        if (status === "ringing" || status === "ringingIn" || status === "ringingOut" || status === "queued") {
          await this.handleRinging(tenantId, { callId, callerNumber, from: callerNumber });
        } else if (status === "active" || status === "activeIn" || status === "answered") {
          await this.handleStatusChange(tenantId, { callId }, "ACTIVE");
        } else if (status === "released" || status === "cleared" || op === "ended") {
          await this.handleStatusChange(tenantId, { callId }, "COMPLETED");
        }
      }
    }

    // Check legs for call state
    if (legs && legs.length > 0) {
      for (const leg of legs) {
        const callId = (leg.callId as string) ?? (leg.id as string) ?? "unknown";
        const state = (leg.state as string) ?? "";
        const op = (leg.op as string) ?? "";
        const callerNumber = (leg.callingPartyNumber as string) ??
          (leg.remotePartyNumber as string) ??
          endpointPhones.get(callId) ?? "";

        logger.info(
          { tenantId, callId, state, op, callerNumber },
          "Rainbow telephony leg event"
        );

        if (state === "ringing" || state === "ringingIn" || state === "ringingOut" || state === "queued") {
          await this.handleRinging(tenantId, { callId, callerNumber, from: callerNumber });
        } else if (state === "active" || state === "activeIn" || state === "answered" || state === "connected") {
          await this.handleStatusChange(tenantId, { callId }, "ACTIVE");
        } else if (state === "released" || state === "cleared" || state === "disconnected" || op === "ended") {
          await this.handleStatusChange(tenantId, { callId }, "COMPLETED");
        }
      }
    }

    // Check endpoints for ended events (when no legs/calls are present)
    if (!calls?.length && !legs?.length && endpoints && endpoints.length > 0) {
      for (const ep of endpoints) {
        const callId = (ep.callId as string) ?? "unknown";
        const op = (ep.op as string) ?? "";

        if (op === "ended" && callId !== "unknown") {
          logger.info({ tenantId, callId, op }, "Rainbow telephony endpoint ended");
          await this.handleStatusChange(tenantId, { callId }, "COMPLETED");
        }
      }
    }
  }

}

/** Singleton — stored on globalThis to survive Next.js module re-bundling */
const globalForHandler = globalThis as unknown as {
  inboundCallHandler: InboundCallHandler | undefined;
};

if (!globalForHandler.inboundCallHandler) {
  globalForHandler.inboundCallHandler = new InboundCallHandler();
}

export const inboundCallHandler = globalForHandler.inboundCallHandler;
