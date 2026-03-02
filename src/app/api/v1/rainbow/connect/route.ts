export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { s2sManager } from "@/lib/rainbow/s2s-connector";

/**
 * POST /api/v1/rainbow/connect — Start a Rainbow session.
 *
 * The agent provides their Rainbow login + password via the UI.
 * appId/appSecret/host come from server env vars (RAINBOW_APP_ID, etc.).
 * Login credentials are kept in memory only — never written to disk or DB.
 *
 * Body: { login, password, mode? }
 *   mode: "s2s" (default) — spawn S2S worker for notification-only
 *   mode: "webrtc" — stop S2S worker, return SDK credentials for browser WebRTC
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const { login, password, mode } = body as {
    login?: string;
    password?: string;
    mode?: "s2s" | "webrtc";
  };

  if (!login || !password) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "login and password are required",
        },
      },
      { status: 400 }
    );
  }

  const tenantId = ctx.tenant.tenantId;

  if (mode === "webrtc") {
    // WebRTC mode: stop any existing S2S worker (can't have both logged in)
    await s2sManager.disconnect(tenantId);

    const appId = process.env.RAINBOW_APP_ID;
    const appSecret = process.env.RAINBOW_APP_SECRET;
    const host = process.env.RAINBOW_HOST || "official";

    if (!appId || !appSecret) {
      return NextResponse.json(
        {
          error: {
            code: "CONFIG_ERROR",
            message: "Server missing RAINBOW_APP_ID / RAINBOW_APP_SECRET env vars",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "webrtc_ready",
      mode: "webrtc",
      webrtc: { appId, appSecret, host },
    });
  }

  // Default: S2S mode
  const info = await s2sManager.connect(tenantId, { login, password });
  return NextResponse.json({ status: info.status, session: info, mode: "s2s" });
});

/**
 * DELETE /api/v1/rainbow/connect — Stop the Rainbow S2S session.
 */
export const DELETE = apiHandler(async (_request: NextRequest, ctx) => {
  await s2sManager.disconnect(ctx.tenant.tenantId);
  return NextResponse.json({ status: "disconnected" });
});

/**
 * GET /api/v1/rainbow/connect — Check Rainbow session status.
 */
export const GET = apiHandler(async (_request: NextRequest, ctx) => {
  const info = s2sManager.getSessionInfo(ctx.tenant.tenantId);
  if (!info) {
    return NextResponse.json({ status: "disconnected", session: null });
  }
  return NextResponse.json({ status: info.status, session: info });
});
