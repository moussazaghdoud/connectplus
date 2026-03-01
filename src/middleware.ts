import { NextRequest, NextResponse } from "next/server";

/**
 * Rewrite Rainbow S2S callback sub-paths to the base webhook route.
 *
 * Rainbow appends sub-paths like /telephony/rvcp, /connection, /presence
 * to the registered callback URL. We rewrite these to our single webhook
 * handler and pass the sub-path as a query parameter.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const webhookBase = "/api/v1/rainbow/webhooks";

  // Only rewrite sub-paths under the webhook base
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
  matcher: "/api/v1/rainbow/webhooks/:path+",
};
