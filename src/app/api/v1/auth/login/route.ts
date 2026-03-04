export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/utils/password";
import { createSession } from "@/lib/auth/session";
import { logger } from "@/lib/observability/logger";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/v1/auth/login
 * Authenticates a user with email + password, creates a session, sets cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = LoginSchema.parse(body);

    // Find user by email (search across all tenants — email is unique per tenant)
    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
      include: { tenant: true },
    });

    if (!user || user.tenant.status !== "ACTIVE") {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    // Create session + set cookie
    await createSession(user.id);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info({ userId: user.id, tenantId: user.tenantId }, "User logged in");

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantSlug: user.tenant.slug,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: err.issues } },
        { status: 400 }
      );
    }

    logger.error({ err }, "Login error");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Login failed" } },
      { status: 500 }
    );
  }
}
