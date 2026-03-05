/**
 * Rotate API key for an existing tenant.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx prisma/scripts/rotate-key.ts <tenant-slug>
 *
 * If no slug is provided, lists all tenants.
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

  const input = process.argv[2];

  if (!input) {
    // List all tenants
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, apiKeyHint: true, status: true },
    });
    console.log("\nExisting tenants:");
    for (const t of tenants) {
      console.log(`  ${t.id} | ${t.slug} — ${t.name} (hint: ...${t.apiKeyHint}, status: ${t.status})`);
    }
    console.log("\nTo rotate a key: npx tsx prisma/scripts/rotate-key.ts <slug-or-id>\n");
    await prisma.$disconnect();
    return;
  }

  // Support both slug and ID
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug: input }, { id: input }] },
  });
  if (!tenant) {
    console.error(`Tenant "${input}" not found.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const newKey = generateApiKey();
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      apiKey: hashApiKey(newKey),
      apiKeyHint: newKey.slice(-4),
    },
  });

  console.log(`\nAPI key rotated for tenant "${tenant.slug}" (${tenant.name})`);
  console.log(`  Tenant ID: ${tenant.id}`);
  console.log(`  New API Key: ${newKey}`);
  console.log(`  Hint: ...${newKey.slice(-4)}`);
  console.log("\nSave this key now — it will not be shown again.\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
