import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { WidgetShell } from "./WidgetShell";

/**
 * Server component: validates session, passes user to WidgetShell.
 * Middleware already guards this route, but this is defense-in-depth.
 */
export default async function WidgetPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?redirect=/widget");
  }

  return (
    <WidgetShell
      user={{
        id: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
        tenantSlug: session.tenantSlug,
      }}
    />
  );
}
