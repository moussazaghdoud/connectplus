export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/utils/crypto";

/**
 * GET /api/v1/auth/rainbow-credentials
 * Returns saved Rainbow credentials for the current user (for auto-connect).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { rainbowLogin: true, rainbowPassword: true },
  });

  if (!user?.rainbowLogin || !user?.rainbowPassword) {
    return NextResponse.json({ saved: false });
  }

  try {
    const password = decrypt(user.rainbowPassword);
    return NextResponse.json({
      saved: true,
      login: user.rainbowLogin,
      password,
    });
  } catch {
    // Corrupted encrypted data — clear it
    await prisma.user.update({
      where: { id: session.userId },
      data: { rainbowLogin: null, rainbowPassword: null },
    });
    return NextResponse.json({ saved: false });
  }
}

/**
 * POST /api/v1/auth/rainbow-credentials
 * Save Rainbow credentials for auto-connect.
 * Body: { login, password }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
      { status: 401 }
    );
  }

  const { login, password } = (await request.json()) as {
    login?: string;
    password?: string;
  };

  if (!login || !password) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "login and password are required" } },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      rainbowLogin: login,
      rainbowPassword: encrypt(password),
    },
  });

  return NextResponse.json({ saved: true });
}

/**
 * DELETE /api/v1/auth/rainbow-credentials
 * Clear saved Rainbow credentials.
 */
export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
      { status: 401 }
    );
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { rainbowLogin: null, rainbowPassword: null },
  });

  return NextResponse.json({ saved: false });
}
