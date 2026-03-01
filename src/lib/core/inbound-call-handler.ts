import { eventBus } from "./event-bus";
import { interactionManager } from "./interaction-manager";
import { runWithTenant } from "./tenant-context";
import { sseManager } from "../sse";
import type { ScreenPopData } from "../sse/types";
import { normalizePhone, phoneMatch } from "../utils/phone";
import { prisma } from "../db";
import { logger } from "../observability/logger";

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
        // Not an inbound call event we handle
        break;
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

    // Resolve caller from contacts DB (best-effort, non-blocking for screen pop)
    let contact: Awaited<ReturnType<typeof this.resolveCallerByPhone>> = null;
    try {
      contact = await this.resolveCallerByPhone(tenantId, normalized);
    } catch (err) {
      logger.warn({ err, tenantId }, "Contact resolution failed, proceeding without contact");
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
            crmUrl: this.buildCrmUrl(contact),
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
      });
    }

    eventBus.emit("call.status_changed", {
      tenantId,
      interactionId: interaction.id,
      status: newStatus,
      rainbowCallId: callId,
    });
  }

  /** Resolve a caller by phone number from the local contacts DB */
  private async resolveCallerByPhone(
    tenantId: string,
    normalizedPhone: string
  ) {
    if (!normalizedPhone) return null;

    // Try exact match first
    const exactMatch = await prisma.contact.findFirst({
      where: { tenantId, phone: normalizedPhone },
    });
    if (exactMatch) return exactMatch;

    // Fuzzy match: load contacts with phone numbers and compare trailing digits
    const candidates = await prisma.contact.findMany({
      where: { tenantId, phone: { not: null } },
      take: 500,
    });

    for (const c of candidates) {
      if (c.phone && phoneMatch(normalizedPhone, c.phone)) {
        return c;
      }
    }

    return null;
  }

  /** Build a CRM deep link from contact external links */
  private buildCrmUrl(
    contact: { id: string; metadata?: unknown }
  ): string | undefined {
    const meta = contact.metadata as Record<string, unknown> | null;
    return (meta?.crmUrl as string) ?? undefined;
  }
}

export const inboundCallHandler = new InboundCallHandler();
