import { prisma } from "../db";
import { encrypt, decrypt, encryptJson, decryptJson } from "./crypto";
import { logger } from "../observability/logger";

/**
 * Secrets Manager — centralized encrypted credential storage.
 * All secrets are AES-256-GCM encrypted at rest.
 * Encryption key comes from ENCRYPTION_KEY env var.
 */
export class SecretsManager {
  /**
   * Store Rainbow credentials for a tenant.
   * Password and appSecret are encrypted before storage.
   */
  async storeRainbowCredentials(
    tenantId: string,
    credentials: {
      login: string;
      password: string;
      appId: string;
      appSecret: string;
      host?: string;
    }
  ): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        rainbowLogin: credentials.login,
        rainbowPassword: encryptJson({ value: credentials.password }),
        rainbowAppId: credentials.appId,
        rainbowAppSecret: encryptJson({ value: credentials.appSecret }),
        rainbowHost: credentials.host ?? "sandbox",
      },
    });

    logger.info({ tenantId }, "Rainbow credentials stored (encrypted)");
  }

  /**
   * Retrieve decrypted Rainbow credentials for a tenant.
   */
  async getRainbowCredentials(tenantId: string): Promise<{
    login: string;
    password: string;
    appId: string;
    appSecret: string;
    host: string;
  } | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        rainbowLogin: true,
        rainbowPassword: true,
        rainbowAppId: true,
        rainbowAppSecret: true,
        rainbowHost: true,
      },
    });

    if (!tenant?.rainbowLogin || !tenant?.rainbowAppId) {
      return null;
    }

    return {
      login: tenant.rainbowLogin,
      password: tenant.rainbowPassword
        ? decryptJson<{ value: string }>(tenant.rainbowPassword).value
        : "",
      appId: tenant.rainbowAppId,
      appSecret: tenant.rainbowAppSecret
        ? decryptJson<{ value: string }>(tenant.rainbowAppSecret).value
        : "",
      host: tenant.rainbowHost,
    };
  }

  /**
   * Store connector credentials for a tenant (encrypted).
   */
  async storeConnectorCredentials(
    tenantId: string,
    connectorId: string,
    credentials: Record<string, string>
  ): Promise<void> {
    const encrypted = encryptJson(credentials);

    await prisma.connectorConfig.upsert({
      where: {
        tenantId_connectorId: { tenantId, connectorId },
      },
      create: {
        tenantId,
        connectorId,
        credentials: encrypted,
      },
      update: {
        credentials: encrypted,
      },
    });

    logger.info(
      { tenantId, connectorId },
      "Connector credentials stored (encrypted)"
    );
  }

  /**
   * Retrieve decrypted connector credentials.
   */
  async getConnectorCredentials(
    tenantId: string,
    connectorId: string
  ): Promise<Record<string, string> | null> {
    const config = await prisma.connectorConfig.findUnique({
      where: {
        tenantId_connectorId: { tenantId, connectorId },
      },
    });

    if (!config) return null;

    return decryptJson<Record<string, string>>(config.credentials);
  }

  /**
   * Rotate encryption key: re-encrypt all secrets with a new key.
   *
   * Process:
   * 1. Set OLD_ENCRYPTION_KEY=<current key>
   * 2. Set ENCRYPTION_KEY=<new key>
   * 3. Call this method
   * 4. Remove OLD_ENCRYPTION_KEY after verification
   */
  async rotateEncryptionKey(): Promise<{ rotated: number; errors: number }> {
    const oldKey = process.env.OLD_ENCRYPTION_KEY;
    if (!oldKey) {
      throw new Error(
        "OLD_ENCRYPTION_KEY must be set for key rotation"
      );
    }

    let rotated = 0;
    let errors = 0;

    // Rotate tenant Rainbow secrets
    const tenants = await prisma.tenant.findMany({
      where: {
        OR: [
          { rainbowPassword: { not: null } },
          { rainbowAppSecret: { not: null } },
        ],
      },
    });

    for (const tenant of tenants) {
      try {
        // Decrypt with old key
        const origKey = process.env.ENCRYPTION_KEY;
        process.env.ENCRYPTION_KEY = oldKey;

        const password = tenant.rainbowPassword
          ? decrypt(tenant.rainbowPassword)
          : null;
        const appSecret = tenant.rainbowAppSecret
          ? decrypt(tenant.rainbowAppSecret)
          : null;

        // Re-encrypt with new key
        process.env.ENCRYPTION_KEY = origKey;

        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            rainbowPassword: password ? encrypt(password) : null,
            rainbowAppSecret: appSecret ? encrypt(appSecret) : null,
          },
        });

        rotated++;
      } catch (err) {
        errors++;
        logger.error(
          { tenantId: tenant.id, err },
          "Failed to rotate tenant secrets"
        );
      }
    }

    // Rotate connector config secrets
    const configs = await prisma.connectorConfig.findMany();

    for (const config of configs) {
      try {
        const origKey = process.env.ENCRYPTION_KEY;
        process.env.ENCRYPTION_KEY = oldKey;
        const decrypted = decrypt(config.credentials);
        process.env.ENCRYPTION_KEY = origKey;

        await prisma.connectorConfig.update({
          where: { id: config.id },
          data: { credentials: encrypt(decrypted) },
        });

        rotated++;
      } catch (err) {
        errors++;
        logger.error(
          { configId: config.id, err },
          "Failed to rotate connector secrets"
        );
      }
    }

    logger.info({ rotated, errors }, "Encryption key rotation complete");
    return { rotated, errors };
  }
}

export const secretsManager = new SecretsManager();
