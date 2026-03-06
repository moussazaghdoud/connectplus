import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const def = await prisma.connectorDefinition.findUnique({
    where: { slug: "zoho-crm" },
  });

  if (!def) {
    console.log("NO zoho-crm ConnectorDefinition found!");
    await prisma.$disconnect();
    return;
  }

  const config = def.config as Record<string, unknown>;
  const strategies = config?.searchStrategies as Array<Record<string, unknown>> | undefined;

  console.log("apiBaseUrl:", config?.apiBaseUrl);
  console.log("Has searchStrategies:", !!strategies);
  console.log("Strategy count:", strategies?.length ?? 0);

  if (strategies) {
    for (const s of strategies) {
      console.log(`  ${s.label} → ${s.endpoint}`, JSON.stringify((s.request as Record<string, unknown>)?.queryParams));
    }
  } else {
    console.log("contactSearch:", JSON.stringify(config?.contactSearch, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
