/**
 * CLI script to create a user account.
 *
 * Usage:
 *   npx tsx scripts/create-user.ts --tenant-slug demo --email admin@example.com --password secret123 --role ADMIN
 *   npx tsx scripts/create-user.ts --tenant-slug demo --email agent@example.com --password secret123 --role AGENT --name "Jane Doe"
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/utils/password";

async function main() {
  const args = process.argv.slice(2);

  function getArg(name: string): string | undefined {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  }

  const tenantSlug = getArg("tenant-slug");
  const email = getArg("email");
  const password = getArg("password");
  const role = (getArg("role") || "AGENT").toUpperCase();
  const name = getArg("name");

  if (!tenantSlug || !email || !password) {
    console.error("Usage: npx tsx scripts/create-user.ts --tenant-slug <slug> --email <email> --password <password> [--role ADMIN|AGENT] [--name <name>]");
    process.exit(1);
  }

  if (role !== "ADMIN" && role !== "AGENT") {
    console.error("Role must be ADMIN or AGENT");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    // Find tenant
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      console.error(`Tenant '${tenantSlug}' not found`);
      process.exit(1);
    }

    // Check for existing user
    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });

    if (existing) {
      console.error(`User '${email}' already exists for tenant '${tenantSlug}'`);
      process.exit(1);
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash,
        name: name || null,
        role: role as "ADMIN" | "AGENT",
      },
    });

    console.log(`User created successfully:`);
    console.log(`  ID:     ${user.id}`);
    console.log(`  Email:  ${user.email}`);
    console.log(`  Role:   ${user.role}`);
    console.log(`  Tenant: ${tenantSlug}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
