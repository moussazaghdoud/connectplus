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

  // Initialize CTI Event Bridge — wire Zoho CRM lookup and call logging
  try {
    const { setCrmLookup, setCallLogger } = await import("@/lib/cti");
    const { lookupCallerInZoho } = await import("@/lib/connectors/zoho-cti/crm-lookup");
    const { logCallToZoho } = await import("@/lib/connectors/zoho-cti/call-logger");
    const { prisma } = await import("@/lib/db");
    const { decrypt } = await import("@/lib/utils/crypto");

    setCrmLookup(async (phoneNumber, tenantId) => {
      const config = await prisma.connectorConfig.findFirst({
        where: { tenantId, connectorId: "zoho-crm", enabled: true },
      });
      if (!config?.credentials) return undefined;

      const creds = JSON.parse(decrypt(config.credentials as string));
      if (!creds.accessToken) return undefined;

      return lookupCallerInZoho(phoneNumber, {
        accessToken: creds.accessToken,
        dc: creds.zohoDc || "eu",
      });
    });

    setCallLogger(async (event) => {
      const config = await prisma.connectorConfig.findFirst({
        where: { tenantId: event.tenantId, connectorId: "zoho-crm", enabled: true },
      });
      if (!config?.credentials) return;

      const creds = JSON.parse(decrypt(config.credentials as string));
      if (!creds.accessToken) return;

      await logCallToZoho(event, {
        accessToken: creds.accessToken,
        dc: creds.zohoDc || "eu",
      });
    });

    console.log("[ConnectPlus] CTI Event Bridge initialized");
  } catch (err) {
    console.error("[ConnectPlus] CTI Bridge initialization failed:", err);
  }
}
