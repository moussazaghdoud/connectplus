import { RainbowClient } from "./client";
import { RainbowCalls } from "./calls";
import { RainbowContacts } from "./contacts";
import { decryptJson } from "../utils/crypto";
import { prisma } from "../db";
import { logger } from "../observability/logger";

export { RainbowClient } from "./client";
export { RainbowCalls } from "./calls";
export { RainbowContacts } from "./contacts";
export * from "./types";

/**
 * Create a RainbowClient for a specific tenant using their stored credentials.
 */
export async function createRainbowClientForTenant(
  tenantId: string
): Promise<{ client: RainbowClient; calls: RainbowCalls; contacts: RainbowContacts }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  if (!tenant.rainbowLogin || !tenant.rainbowAppId) {
    throw new Error(`Tenant ${tenantId} has no Rainbow credentials configured`);
  }

  const client = new RainbowClient({
    host: tenant.rainbowHost as "sandbox" | "official",
    login: tenant.rainbowLogin,
    password: tenant.rainbowPassword ? decryptJson<{ value: string }>(tenant.rainbowPassword).value : "",
    appId: tenant.rainbowAppId,
    appSecret: tenant.rainbowAppSecret ? decryptJson<{ value: string }>(tenant.rainbowAppSecret).value : "",
  });

  await client.login();
  logger.info({ tenantId }, "Rainbow client initialized for tenant");

  return {
    client,
    calls: new RainbowCalls(client),
    contacts: new RainbowContacts(client),
  };
}
