export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/middleware/api-handler";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/utils/password";
import { AuthorizationError } from "@/lib/core/errors";

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
  role: z.enum(["ADMIN", "AGENT"]).default("AGENT"),
});

/**
 * GET /api/v1/admin/users — List users for the current tenant.
 * Requires ADMIN role (session auth) or API key.
 */
export const GET = apiHandler(async (_request: NextRequest, ctx) => {
  // If session-based auth, require ADMIN role
  if (ctx.tenant.userId && ctx.tenant.userRole !== "ADMIN") {
    throw new AuthorizationError("Only admins can manage users");
  }

  const users = await prisma.user.findMany({
    where: { tenantId: ctx.tenant.tenantId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: users });
});

/**
 * POST /api/v1/admin/users — Create a new user for the current tenant.
 * Requires ADMIN role (session auth) or API key.
 */
export const POST = apiHandler(async (request: NextRequest, ctx) => {
  // If session-based auth, require ADMIN role
  if (ctx.tenant.userId && ctx.tenant.userRole !== "ADMIN") {
    throw new AuthorizationError("Only admins can create users");
  }

  const body = await request.json();
  const input = CreateUserSchema.parse(body);

  // Check for existing user with same email in this tenant
  const existing = await prisma.user.findUnique({
    where: {
      tenantId_email: {
        tenantId: ctx.tenant.tenantId,
        email: input.email,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "A user with this email already exists" } },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      tenantId: ctx.tenant.tenantId,
      email: input.email,
      passwordHash,
      name: input.name || null,
      role: input.role,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: user }, { status: 201 });
});
