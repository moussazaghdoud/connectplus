export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { interactionManager } from "@/lib/core/interaction-manager";
import { runWithTenant } from "@/lib/core/tenant-context";
import { sseManager } from "@/lib/sse";
import { resolveCallerByPhone, buildCrmUrl, normalizePhone } from "@/lib/core/contact-resolver-utils";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import type { ScreenPopData } from "@/lib/sse/types";

/**
 * POST /api/v1/calls/event — Browser reports WebRTC call events.
 *
 * The Rainbow Web SDK in the browser detects call state changes and POSTs
 * them here so the server can create interactions, resolve contacts, and
 * broadcast SSE events (same as S2S mode but driven from the client).
 *
 * Body: { callId, state, callerNumber?, direction?, timestamp? }
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const {
    callId,
    state,
    callerNumber,
    direction,
    timestamp,
  } = body as {
    callId?: string;
    state?: string;
    callerNumber?: string;
    direction?: string;
    timestamp?: number;
  };

  if (!callId || !state) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "callId and state are required" } },
      { status: 400 }
    );
  }

  const tenantId = ctx.tenant.tenantId;

  switch (state) {
    case "ringing_incoming": {
      const normalized = normalizePhone(callerNumber ?? "");

      // Resolve contact (best-effort)
      let contact: Awaited<ReturnType<typeof resolveCallerByPhone>> = null;
      try {
        contact = await resolveCallerByPhone(tenantId, normalized);
      } catch (err) {
        logger.warn({ err, tenantId }, "WebRTC contact resolution failed");
      }

      // Broadcast screen pop immediately
      const screenPopData: ScreenPopData = {
        interactionId: callId,
        callerNumber: normalized || callerNumber || "Unknown",
        contact: contact
          ? {
              displayName: contact.displayName,
              email: contact.email ?? undefined,
              company: contact.company ?? undefined,
              phone: contact.phone ?? undefined,
              crmUrl: buildCrmUrl(contact),
              avatarUrl: contact.avatarUrl ?? undefined,
            }
          : null,
      };

      sseManager.broadcast(tenantId, "screen.pop", screenPopData);

      // Create interaction record
      try {
        const interaction = await runWithTenant(
          { tenantId, tenantSlug: tenantId, tenantStatus: "ACTIVE" },
          () =>
            interactionManager.createInbound({
              tenantId,
              type: "PHONE_CALL",
              callerPhone: normalized || undefined,
              contactId: contact?.id,
              rainbowCallId: callId,
              metadata: {
                source: "webrtc",
                direction: direction ?? "inbound",
                ...(timestamp ? { browserTimestamp: String(timestamp) } : {}),
              },
            })
        );

        sseManager.broadcast(tenantId, "call.updated", {
          interactionId: interaction.id,
          status: "RINGING",
          rainbowCallId: callId,
        });
      } catch (err) {
        logger.error({ err, tenantId, callId }, "Failed to create WebRTC inbound interaction");
      }

      break;
    }

    case "active": {
      const interaction = await prisma.interaction.findFirst({
        where: { rainbowCallId: callId, tenantId },
      });

      if (interaction) {
        await runWithTenant(
          { tenantId, tenantSlug: tenantId, tenantStatus: "ACTIVE" },
          () => interactionManager.updateStatus(interaction.id, { status: "ACTIVE" })
        );

        sseManager.broadcast(tenantId, "call.updated", {
          interactionId: interaction.id,
          status: "ACTIVE",
          rainbowCallId: callId,
        });
      }
      break;
    }

    case "ended": {
      const interaction = await prisma.interaction.findFirst({
        where: { rainbowCallId: callId, tenantId },
      });

      if (interaction) {
        await runWithTenant(
          { tenantId, tenantSlug: tenantId, tenantStatus: "ACTIVE" },
          () => interactionManager.updateStatus(interaction.id, { status: "COMPLETED" })
        );

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
      break;
    }

    default:
      logger.debug({ tenantId, callId, state }, "Unhandled WebRTC call state");
  }

  return NextResponse.json({ ok: true });
});
