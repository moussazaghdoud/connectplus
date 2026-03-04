export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

/**
 * GET /api/v1/auth/me
 * Returns the currently logged-in user, or 401 if no valid session.
 */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
      { status: 401 }
    );
  }

  return NextResponse.json({
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      tenantSlug: session.tenantSlug,
    },
  });
}
