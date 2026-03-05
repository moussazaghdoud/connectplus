import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cp_session";

/** Routes that require a session cookie (redirects to /login if missing) */
const PROTECTED_PATHS = ["/widget", "/agent", "/cti-widget"];

/**
 * Next.js middleware:
 * 1. Protect /widget and /agent — redirect to /login if no session cookie
 * 2. If logged in and hitting /login — redirect to /widget
 * 3. Rewrite Rainbow S2S callback sub-paths to the base webhook route
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasSession = request.cookies.has(COOKIE_NAME);

  // ── Protected routes: require session ──────────────────
  if (PROTECTED_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    if (!hasSession) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── Login page: redirect to /widget if already logged in ──
  if (path === "/login" && hasSession) {
    const widgetUrl = request.nextUrl.clone();
    widgetUrl.pathname = "/widget";
    widgetUrl.search = "";
    return NextResponse.redirect(widgetUrl);
  }

  // ── Rainbow webhook sub-path rewrite ───────────────────
  const webhookBase = "/api/v1/rainbow/webhooks";
  if (path.startsWith(webhookBase + "/")) {
    const subPath = path.slice(webhookBase.length + 1);
    const url = request.nextUrl.clone();
    url.pathname = webhookBase;
    url.searchParams.set("subpath", subPath);
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/widget/:path*",
    "/widget",
    "/agent/:path*",
    "/agent",
    "/cti-widget/:path*",
    "/cti-widget",
    "/login",
    "/api/v1/rainbow/webhooks/:path+",
  ],
};
