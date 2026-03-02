export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/middleware/api-handler";
import { s2sManager } from "@/lib/rainbow/s2s-connector";

/**
 * POST /api/v1/rainbow/connect — Start a Rainbow S2S session.
 *
 * The agent provides their Rainbow login + password via the UI.
 * appId/appSecret/host come from server env vars (RAINBOW_APP_ID, etc.).
 * Login credentials are kept in memory only — never written to disk or DB.
 *
 * Body: { login, password }
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const { login, password } = body as {
    login?: string;
    password?: string;
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

  const info = await s2sManager.connect(ctx.tenant.tenantId, {
    login,
    password,
  });

  return NextResponse.json({ status: info.status, session: info });
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
