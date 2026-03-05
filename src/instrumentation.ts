/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts.
 * Used to initialize connectors, SSE manager, and inbound call handler.
 *
 * @see https://nextjs.org/docs/app/guides/instrumentation
 */
export async function register() {
  // Only run in the Node.js runtime (skip Edge runtime where node:path etc. are unavailable)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { initializeConnectors } = await import("@/lib/connectors");
    await initializeConnectors();
  } catch (err) {
    console.error("[ConnectPlus] Connector initialization failed:", err);
  }

  try {
    const { sseManager } = await import("@/lib/sse");
    sseManager.start();

    const { inboundCallHandler } = await import("@/lib/core/inbound-call-handler");
    inboundCallHandler.initialize();
  } catch (err) {
    console.error("[ConnectPlus] SSE/Inbound handler initialization failed:", err);
  }
}
