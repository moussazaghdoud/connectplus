export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

/**
 * POST /api/v1/auth/logout
 * Destroys the current session and clears the cookie.
 */
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
