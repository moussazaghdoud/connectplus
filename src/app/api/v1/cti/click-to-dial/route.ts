export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { broadcastClickToDial } from "@/lib/cti/bridge/websocket-manager";
import { logger } from "@/lib/observability/logger";

const log = logger.child({ module: "click-to-dial" });

/**
 * POST /api/v1/cti/click-to-dial
 *
 * Zoho PhoneBridge Click-to-Dial endpoint.
 * When a user clicks a phone number in Zoho CRM, PhoneBridge POSTs
 * the number here. We broadcast it to the CTI widget via SSE.
 *
 * Zoho sends: ?tonumber=<phone> (default) or custom params.
 * Also accepts JSON body: { number: "<phone>" }
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const tenantId = ctx.tenant.tenantId;

  // Try query param first (Zoho's default: tonumber)
  const url = new URL(request.url);
  let number = url.searchParams.get("tonumber") || url.searchParams.get("number");

  // Fall back to JSON body
  if (!number) {
    try {
      const body = await request.json();
      number = body.tonumber || body.number || body.phoneNumber || body.phone;
    } catch {
      // Not JSON body, try form data
      try {
        const form = await request.formData();
        number = (form.get("tonumber") || form.get("number")) as string | null;
      } catch {
        // No parseable body
      }
    }
  }

  if (!number) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "No phone number provided" } },
      { status: 400 }
    );
  }

  // Clean the number
  const cleaned = number.replace(/[^0-9+*#]/g, "");
  if (cleaned.length < 3) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid phone number" } },
      { status: 400 }
    );
  }

  log.info({ tenantId, number: cleaned }, "Click-to-dial received from Zoho");

  const sent = broadcastClickToDial(tenantId, { number: cleaned });

  return NextResponse.json({
    status: "ok",
    number: cleaned,
    delivered: sent,
  });
});
