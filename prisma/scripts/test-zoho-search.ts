/**
 * Diagnostic: test Zoho CRM search directly.
 *
 * Usage: DATABASE_URL="..." npx tsx prisma/scripts/test-zoho-search.ts "+33612345678"
 */

import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDecipheriv } from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;

function decryptJson<T>(encrypted: string): T {
  const buf = Buffer.from(encrypted, "base64");
  const iv = buf.subarray(0, 16);
  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(16, buf.length - 16);
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

async function main() {
  const phone = process.argv[2] || "+33612345678";
  console.log("Testing Zoho search for phone:", phone);

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Get connector config
  const config = await prisma.connectorConfig.findFirst({
    where: { connectorId: "zoho-crm", enabled: true },
  });

  if (!config) {
    console.log("No zoho-crm ConnectorConfig found!");
    await prisma.$disconnect();
    return;
  }

  console.log("ConnectorConfig ID:", config.id, "Tenant:", config.tenantId);

  const creds = decryptJson<Record<string, string>>(config.credentials as string);
  console.log("Credential keys:", Object.keys(creds));
  console.log("Has accessToken:", !!creds.accessToken);
  console.log("Has refreshToken:", !!creds.refreshToken);
  console.log("Token expires at:", creds.tokenExpiresAt);
  // Show all keys and first 20 chars of values
  for (const [k, v] of Object.entries(creds)) {
    console.log(`  ${k}: ${String(v).slice(0, 30)}...`);
  }

  if (!creds.accessToken) {
    console.log("No access token! OAuth flow may not have completed.");
    await prisma.$disconnect();
    return;
  }

  const baseUrl = "https://www.zohoapis.eu/crm/v2";

  // Test 1: Search Contacts by word
  console.log("\n--- Test 1: /Contacts/search?word=" + phone);
  try {
    const url1 = `${baseUrl}/Contacts/search?word=${encodeURIComponent(phone)}`;
    const resp1 = await fetch(url1, {
      headers: { Authorization: `Zoho-oauthtoken ${creds.accessToken}` },
    });
    console.log("Status:", resp1.status);
    const body1 = await resp1.text();
    console.log("Response:", body1.slice(0, 1000));
  } catch (err) {
    console.log("Error:", err);
  }

  // Test 2: Search Contacts by phone param
  console.log("\n--- Test 2: /Contacts/search?phone=" + phone);
  try {
    const url2 = `${baseUrl}/Contacts/search?phone=${encodeURIComponent(phone)}`;
    const resp2 = await fetch(url2, {
      headers: { Authorization: `Zoho-oauthtoken ${creds.accessToken}` },
    });
    console.log("Status:", resp2.status);
    const body2 = await resp2.text();
    console.log("Response:", body2.slice(0, 1000));
  } catch (err) {
    console.log("Error:", err);
  }

  // Test 3: Search Contacts by criteria
  console.log("\n--- Test 3: /Contacts/search?criteria=(Phone:equals:" + phone + ")");
  try {
    const url3 = `${baseUrl}/Contacts/search?criteria=${encodeURIComponent(`(Phone:equals:${phone})`)}`;
    const resp3 = await fetch(url3, {
      headers: { Authorization: `Zoho-oauthtoken ${creds.accessToken}` },
    });
    console.log("Status:", resp3.status);
    const body3 = await resp3.text();
    console.log("Response:", body3.slice(0, 1000));
  } catch (err) {
    console.log("Error:", err);
  }

  // Test 4: Just list first 2 contacts to verify API works
  console.log("\n--- Test 4: GET /Contacts (list first 2)");
  try {
    const url4 = `${baseUrl}/Contacts?per_page=2`;
    const resp4 = await fetch(url4, {
      headers: { Authorization: `Zoho-oauthtoken ${creds.accessToken}` },
    });
    console.log("Status:", resp4.status);
    const body4 = await resp4.text();
    console.log("Response:", body4.slice(0, 1500));
  } catch (err) {
    console.log("Error:", err);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
