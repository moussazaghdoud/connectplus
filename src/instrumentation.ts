/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts.
 * Used to initialize connectors and event listeners.
 *
 * @see https://nextjs.org/docs/app/guides/instrumentation
 */
export async function register() {
  // Only run on the server
  if (typeof window !== "undefined") return;

  try {
    const { initializeConnectors } = await import("@/lib/connectors");
    initializeConnectors();
  } catch (err) {
    console.error("[ConnectPlus] Connector initialization failed:", err);
  }
}
