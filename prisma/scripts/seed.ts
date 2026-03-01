/**
 * Database seed script for development.
 * Creates two tenants with sample data to test tenant isolation.
 *
 * Run: npx tsx prisma/scripts/seed.ts
 * Requires: DATABASE_URL + ENCRYPTION_KEY env vars
 */

import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash, randomBytes } from "crypto";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): string {
  return `cp_${randomBytes(32).toString("hex")}`;
}

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  console.log("Seeding database...\n");

  // ── Tenant 1: Acme Corp ────────────────────────────
  const acmeKey = generateApiKey();
  const acmeTenant = await prisma.tenant.upsert({
    where: { slug: "acme" },
    create: {
      name: "Acme Corporation",
      slug: "acme",
      apiKey: hashApiKey(acmeKey),
      apiKeyHint: acmeKey.slice(-4),
      rainbowHost: "sandbox",
    },
    update: {},
  });

  console.log(`Tenant 1: ${acmeTenant.name} (${acmeTenant.slug})`);
  console.log(`  API Key: ${acmeKey}`);
  console.log(`  ID: ${acmeTenant.id}\n`);

  // ── Tenant 2: Globex Inc ───────────────────────────
  const globexKey = generateApiKey();
  const globexTenant = await prisma.tenant.upsert({
    where: { slug: "globex" },
    create: {
      name: "Globex Inc",
      slug: "globex",
      apiKey: hashApiKey(globexKey),
      apiKeyHint: globexKey.slice(-4),
      rainbowHost: "sandbox",
    },
    update: {},
  });

  console.log(`Tenant 2: ${globexTenant.name} (${globexTenant.slug})`);
  console.log(`  API Key: ${globexKey}`);
  console.log(`  ID: ${globexTenant.id}\n`);

  // ── Sample contacts for Tenant 1 ──────────────────
  const acmeContacts = [
    { displayName: "John Smith", email: "john@acme.com", phone: "+1-555-0101", company: "Acme Corp" },
    { displayName: "Jane Doe", email: "jane@acme.com", phone: "+1-555-0102", company: "Acme Corp" },
    { displayName: "Bob Wilson", email: "bob@partner.com", phone: "+1-555-0103", company: "Partner Inc" },
  ];

  for (const c of acmeContacts) {
    await prisma.contact.upsert({
      where: {
        tenantId_email: undefined, // Can't use composite key easily
      } as never, // Prisma doesn't have this composite unique — use create
      create: { ...c, tenantId: acmeTenant.id },
      update: {},
    }).catch(() => {
      // If already exists, skip
      return prisma.contact.create({ data: { ...c, tenantId: acmeTenant.id } }).catch(() => {});
    });
  }

  console.log(`  Created ${acmeContacts.length} contacts for Acme`);

  // ── Sample contacts for Tenant 2 ──────────────────
  const globexContacts = [
    { displayName: "Alice Johnson", email: "alice@globex.com", phone: "+44-20-7946-0958", company: "Globex Inc" },
    { displayName: "Charlie Brown", email: "charlie@globex.com", phone: "+44-20-7946-0959", company: "Globex Inc" },
  ];

  for (const c of globexContacts) {
    await prisma.contact.create({ data: { ...c, tenantId: globexTenant.id } }).catch(() => {});
  }

  console.log(`  Created ${globexContacts.length} contacts for Globex`);

  // ── Sample interactions for Tenant 1 ───────────────
  await prisma.interaction.create({
    data: {
      tenantId: acmeTenant.id,
      idempotencyKey: `seed_acme_${Date.now()}_1`,
      type: "AUDIO_CALL",
      status: "COMPLETED",
      direction: "OUTBOUND",
      targetPhone: "+1-555-0101",
      startedAt: new Date(Date.now() - 300000),
      endedAt: new Date(Date.now() - 60000),
      durationSecs: 240,
    },
  }).catch(() => {});

  console.log("  Created 1 sample interaction for Acme");

  // ── Verify counts ──────────────────────────────────
  const acmeContactCount = await prisma.contact.count({ where: { tenantId: acmeTenant.id } });
  const globexContactCount = await prisma.contact.count({ where: { tenantId: globexTenant.id } });
  const acmeInteractionCount = await prisma.interaction.count({ where: { tenantId: acmeTenant.id } });
  const globexInteractionCount = await prisma.interaction.count({ where: { tenantId: globexTenant.id } });

  console.log("\n── Verification ────────────────────────");
  console.log(`  Acme contacts: ${acmeContactCount}, interactions: ${acmeInteractionCount}`);
  console.log(`  Globex contacts: ${globexContactCount}, interactions: ${globexInteractionCount}`);
  console.log("\nSeed complete. Save the API keys above!\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
