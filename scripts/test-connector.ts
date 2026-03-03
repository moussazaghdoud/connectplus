#!/usr/bin/env npx tsx
/**
 * CLI script to test a connector definition.
 *
 * Usage:
 *   npx tsx scripts/test-connector.ts <connectorSlug>
 *   npx tsx scripts/test-connector.ts <connectorSlug> --no-dry-run
 *
 * Requires DATABASE_URL environment variable.
 */

import "dotenv/config";

async function main() {
  const slug = process.argv[2];
  const noDryRun = process.argv.includes("--no-dry-run");

  if (!slug) {
    console.error("Usage: npx tsx scripts/test-connector.ts <connectorSlug> [--no-dry-run]");
    process.exit(1);
  }

  // Dynamic imports to avoid loading the full app
  const { prisma } = await import("../src/lib/db");
  const { connectorDefinitionConfigSchema } = await import("../src/lib/connectors/factory/config-schema");
  const { ConnectorTestRunner } = await import("../src/lib/connectors/testing/connector-test-runner");

  const definition = await prisma.connectorDefinition.findUnique({ where: { slug } });
  if (!definition) {
    console.error(`Connector "${slug}" not found in database.`);
    process.exit(1);
  }

  const configResult = connectorDefinitionConfigSchema.safeParse(definition.config);
  if (!configResult.success) {
    console.error("Invalid config:", configResult.error.issues);
    process.exit(1);
  }

  console.log(`\nTesting connector: ${definition.name} (${slug}) v${definition.version}\n`);

  const runner = new ConnectorTestRunner();
  const result = await runner.run(slug, configResult.data as never, { dryRun: !noDryRun });

  // Print results table
  const maxName = Math.max(...result.results.map((r) => r.name.length), 4);
  const maxCat = Math.max(...result.results.map((r) => r.category.length), 8);

  console.log(`${"Category".padEnd(maxCat)} ${"Test".padEnd(maxName)} Status   Duration  Message`);
  console.log("-".repeat(maxCat + maxName + 35));

  for (const r of result.results) {
    const icon = r.status === "passed" ? "OK" : r.status === "skipped" ? "--" : r.status === "failed" ? "FAIL" : "ERR";
    const color = r.status === "passed" ? "\x1b[32m" : r.status === "skipped" ? "\x1b[90m" : "\x1b[31m";
    console.log(
      `${r.category.padEnd(maxCat)} ${r.name.padEnd(maxName)} ${color}${icon.padEnd(8)}\x1b[0m ${String(r.durationMs).padStart(4)}ms   ${r.message ?? ""}`
    );
  }

  console.log("-".repeat(maxCat + maxName + 35));
  const passed = result.results.filter((r) => r.status === "passed").length;
  const failed = result.results.filter((r) => r.status === "failed").length;
  const skipped = result.results.filter((r) => r.status === "skipped").length;
  console.log(`\nTotal: ${result.results.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
  console.log(`Overall: ${result.passed ? "\x1b[32mPASSED\x1b[0m" : "\x1b[31mFAILED\x1b[0m"} (${result.totalDurationMs}ms)\n`);

  process.exit(result.passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
