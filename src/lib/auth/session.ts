import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { prisma } from "../db";

const COOKIE_NAME = "cp_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionUser {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  name: string | null;
  role: string;
}

/** Hash a session token with SHA-256 for storage */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new session for a user.
 * Generates a random token, stores its SHA-256 hash in DB,
 * and sets an httpOnly cookie.
 */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.userSession.create({
    data: { userId, tokenHash, expiresAt },
  });

  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return token;
}

/**
 * Validate the current session cookie.
 * Returns the session user or null if invalid/expired.
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  const tokenHash = hashToken(token);

  const session = await prisma.userSession.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { tenant: true },
      },
    },
  });

  if (!session) return null;

  // Check expiry
  if (session.expiresAt < new Date()) {
    // Clean up expired session
    await prisma.userSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Check user is active
  if (!session.user.isActive) return null;

  // Check tenant is active
  if (session.user.tenant.status !== "ACTIVE") return null;

  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    tenantSlug: session.user.tenant.slug,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

/**
 * Destroy the current session — delete from DB and clear cookie.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    const tokenHash = hashToken(token);
    await prisma.userSession.deleteMany({ where: { tokenHash } });
  }

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Read session token from a raw cookie header string.
 * Used in middleware (where cookies() is not available).
 */
export function getSessionTokenFromCookieHeader(
  cookieHeader: string | null
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return match ? match.slice(COOKIE_NAME.length + 1) : null;
}
