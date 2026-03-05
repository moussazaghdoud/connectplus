#!/usr/bin/env tsx
/**
 * Connector Generator — creates a new connector from a blueprint file.
 *
 * Usage:
 *   pnpm gen:connector <slug>
 *   npx tsx scripts/generate-connector.ts <slug>
 *
 * Reads:  connectors/blueprints/<slug>.json
 * Creates: src/lib/connectors/<slug>/{index.ts, types.ts, config.ts, diagnostics.ts, README.md}
 * Creates: tests/connectors/<slug>.test.ts
 * Updates: prisma/seed-marketplace.ts (appends registration)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { validateBlueprint, type Blueprint, type BlueprintSetting } from "../src/lib/connectors/blueprint/schema";

const ROOT = path.resolve(__dirname, "..");

// ── CLI ─────────────────────────────────────────────────────
const slug = process.argv[2];
if (!slug) {
  console.error("Usage: pnpm gen:connector <slug>");
  console.error("Example: pnpm gen:connector hubspot-crm");
  process.exit(1);
}

const blueprintPath = path.join(ROOT, "connectors", "blueprints", `${slug}.json`);
if (!fs.existsSync(blueprintPath)) {
  console.error(`Blueprint not found: ${blueprintPath}`);
  console.error(`Create it first: connectors/blueprints/${slug}.json`);
  process.exit(1);
}

// ── Load & validate ─────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(blueprintPath, "utf-8"));
let bp: Blueprint;
try {
  bp = validateBlueprint(raw);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

console.log(`\n  Generating connector: ${bp.displayName} (${bp.slug})\n`);

// ── Check for existing connector ────────────────────────────
const connectorDir = path.join(ROOT, "src", "lib", "connectors", bp.slug);
if (fs.existsSync(connectorDir)) {
  console.error(`  Connector directory already exists: ${connectorDir}`);
  console.error("  Remove it first or use a different slug.");
  process.exit(1);
}

// ── Create connector directory ──────────────────────────────
fs.mkdirSync(connectorDir, { recursive: true });

// ── Generate files ──────────────────────────────────────────
const camelSlug = slug.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const pascalSlug = camelSlug.charAt(0).toUpperCase() + camelSlug.slice(1);

// 1. types.ts
fs.writeFileSync(
  path.join(connectorDir, "types.ts"),
  generateTypes(bp, pascalSlug)
);
console.log("  Created types.ts");

// 2. config.ts
fs.writeFileSync(
  path.join(connectorDir, "config.ts"),
  generateConfig(bp, pascalSlug)
);
console.log("  Created config.ts");

// 3. diagnostics.ts
fs.writeFileSync(
  path.join(connectorDir, "diagnostics.ts"),
  generateDiagnostics(bp)
);
console.log("  Created diagnostics.ts");

// 4. index.ts
fs.writeFileSync(
  path.join(connectorDir, "index.ts"),
  generateIndex(bp, pascalSlug, camelSlug)
);
console.log("  Created index.ts");

// 5. README.md
fs.writeFileSync(
  path.join(connectorDir, "README.md"),
  generateReadme(bp)
);
console.log("  Created README.md");

// 6. Test file
const testDir = path.join(ROOT, "src", "__tests__", "connectors");
fs.mkdirSync(testDir, { recursive: true });
fs.writeFileSync(
  path.join(testDir, `${bp.slug}.test.ts`),
  generateTest(bp, pascalSlug)
);
console.log(`  Created src/__tests__/connectors/${bp.slug}.test.ts`);

// 7. Register in seed-marketplace.ts
registerInSeed(bp);
console.log("  Registered in prisma/seed-marketplace.ts");

console.log(`\n  Connector generated successfully!\n`);
console.log("  Next steps:");
console.log(`  1. Review generated files in src/lib/connectors/${bp.slug}/`);
console.log("  2. Implement connector-specific logic (API calls, field mapping)");
console.log(`  3. Run tests: npx vitest run src/__tests__/connectors/${bp.slug}.test.ts`);
console.log("  4. Seed marketplace: pnpm seed:marketplace");
console.log("");

// ── File generators ─────────────────────────────────────────

function generateTypes(bp: Blueprint, pascal: string): string {
  const settingTypes = bp.settings
    .map((s) => {
      const tsType = settingTsType(s);
      const opt = s.required ? "" : "?";
      return `  ${s.key}${opt}: ${tsType};`;
    })
    .join("\n");

  return `/**
 * Types for ${bp.displayName} connector.
 * Generated from blueprint: connectors/blueprints/${bp.slug}.json
 */

export interface ${pascal}Config {
${settingTypes || "  // No custom settings"}
}

export interface ${pascal}Credentials {
${bp.auth.type === "oauth2" ? `  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;` : bp.auth.type === "api_key" ? `  apiKey: string;` : bp.auth.type === "basic" ? `  username: string;
  password: string;` : `  // No credentials required`}
${bp.auth.dcAware ? `  dc?: string;` : ""}
}

export const CONNECTOR_SLUG = "${bp.slug}" as const;
export const CONNECTOR_CATEGORY = "${bp.category}" as const;
export const CONNECTOR_CAPABILITIES = ${JSON.stringify(bp.capabilities, null, 2)} as const;
`;
}

function generateConfig(bp: Blueprint, pascal: string): string {
  const settingLines = bp.settings
    .map((s) => {
      let zodType: string;
      switch (s.type) {
        case "string":
        case "secret":
          zodType = "z.string()";
          break;
        case "url":
          zodType = "z.string().url()";
          break;
        case "number":
          zodType = "z.number()";
          break;
        case "boolean":
          zodType = "z.boolean()";
          break;
        case "select":
          zodType = `z.enum([${(s.options || []).map((o) => `"${o}"`).join(", ")}])`;
          break;
        default:
          zodType = "z.string()";
      }
      if (!s.required) zodType += ".optional()";
      if (s.default !== undefined) zodType += `.default(${JSON.stringify(s.default)})`;
      return `  ${s.key}: ${zodType},`;
    })
    .join("\n");

  return `/**
 * Configuration schema for ${bp.displayName} connector.
 * Generated from blueprint: connectors/blueprints/${bp.slug}.json
 */

import { z } from "zod";

export const ${pascal}ConfigSchema = z.object({
${settingLines || "  // No custom settings"}
});

export type ${pascal}ValidatedConfig = z.infer<typeof ${pascal}ConfigSchema>;

/**
 * Validate connector configuration.
 */
export function validateConfig(config: unknown): ${pascal}ValidatedConfig {
  return ${pascal}ConfigSchema.parse(config);
}
`;
}

function generateDiagnostics(bp: Blueprint): string {
  const checks: string[] = [];

  checks.push(`  // Check 1: Configuration
  results.push({
    name: "config_valid",
    status: config ? "pass" : "fail",
    message: config ? "Configuration present" : "No configuration found",
  });`);

  if (bp.auth.type === "oauth2") {
    checks.push(`  // Check 2: OAuth token
  const hasToken = !!(credentials as Record<string, unknown>)?.accessToken;
  results.push({
    name: "oauth_token",
    status: hasToken ? "pass" : "fail",
    message: hasToken ? "OAuth token present" : "No OAuth token — re-authenticate",
  });`);
  } else if (bp.auth.type === "api_key") {
    checks.push(`  // Check 2: API key
  const hasKey = !!(credentials as Record<string, unknown>)?.apiKey;
  results.push({
    name: "api_key",
    status: hasKey ? "pass" : "fail",
    message: hasKey ? "API key configured" : "No API key configured",
  });`);
  }

  if (bp.capabilities.includes("health_check")) {
    checks.push(`  // Check 3: API reachability
  try {
    const start = Date.now();
    // TODO: Implement vendor-specific health check
    const latencyMs = Date.now() - start;
    results.push({
      name: "api_reachable",
      status: "pass",
      message: \`API reachable (\${latencyMs}ms)\`,
    });
  } catch (err) {
    results.push({
      name: "api_reachable",
      status: "fail",
      message: \`API unreachable: \${(err as Error).message}\`,
    });
  }`);
  }

  return `/**
 * Diagnostics for ${bp.displayName} connector.
 * Generated from blueprint: connectors/blueprints/${bp.slug}.json
 */

export interface DiagnosticResult {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
}

/**
 * Run diagnostic checks for this connector.
 */
export async function runDiagnostics(
  config: unknown,
  credentials: unknown
): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

${checks.join("\n\n")}

  return results;
}
`;
}

function generateIndex(bp: Blueprint, pascal: string, camel: string): string {
  const isTelephony = bp.category === "telephony";

  return `/**
 * ${bp.displayName} Connector
 *
 * Category: ${bp.category}
 * Auth: ${bp.auth.type}
 * Capabilities: ${bp.capabilities.join(", ")}
 *
 * Generated from blueprint: connectors/blueprints/${bp.slug}.json
 */

import { CONNECTOR_SLUG, CONNECTOR_CATEGORY, CONNECTOR_CAPABILITIES } from "./types";
import type { ${pascal}Config, ${pascal}Credentials } from "./types";
import { validateConfig } from "./config";
import { runDiagnostics } from "./diagnostics";
import { logger } from "@/lib/observability/logger";
${isTelephony ? `import { isValidTransition, createSession, transitionSession } from "@/lib/cti/capabilities/call-session-manager";
import { isDuplicate, ensureCorrelationId } from "@/lib/cti/capabilities/idempotency";
` : ""}
const log = logger.child({ module: "${bp.slug}" });

/**
 * Activate the connector — validate config and register.
 */
async function activate(config: unknown, credentials: unknown): Promise<{ success: boolean; error?: string }> {
  try {
    validateConfig(config);
    log.info("${bp.displayName} connector activated");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err }, "Failed to activate ${bp.displayName}");
    return { success: false, error: message };
  }
}

/**
 * Deactivate the connector — clean up resources.
 */
async function deactivate(): Promise<void> {
  log.info("${bp.displayName} connector deactivated");
}

/**
 * Run diagnostics for this connector.
 */
async function diagnostics(config: unknown, credentials: unknown) {
  return runDiagnostics(config, credentials);
}

export default {
  slug: CONNECTOR_SLUG,
  category: CONNECTOR_CATEGORY,
  capabilities: CONNECTOR_CAPABILITIES,
  activate,
  deactivate,
  diagnostics,
};
`;
}

function generateReadme(bp: Blueprint): string {
  const caps = bp.capabilities.map((c) => `- ${c}`).join("\n");
  const prereqs = (bp.prerequisites || []).map((p) => `- ${p}`).join("\n");
  const settings = bp.settings
    .map((s) => `| \`${s.key}\` | ${s.type} | ${s.required ? "Yes" : "No"} | ${s.description || s.label || ""} |`)
    .join("\n");

  return `# ${bp.displayName}

${bp.description}

## Category
${bp.category}

## Authentication
${bp.auth.type}${bp.auth.dcAware ? " (multi-DC aware)" : ""}${bp.auth.scopes ? `\nScopes: ${bp.auth.scopes.join(", ")}` : ""}

## Capabilities
${caps}

${prereqs ? `## Prerequisites\n${prereqs}\n` : ""}
## Settings

| Key | Type | Required | Description |
|-----|------|----------|-------------|
${settings || "| — | — | — | No custom settings |"}

## Development

\`\`\`bash
# Run tests
npx vitest run tests/connectors/${bp.slug}.test.ts

# Run diagnostics
curl -X GET /api/v1/admin/marketplace/connectors/${bp.slug}/diagnostics
\`\`\`

${bp.notes ? `## Notes\n${bp.notes}\n` : ""}
---
Generated from blueprint: \`connectors/blueprints/${bp.slug}.json\`
`;
}

function generateTest(bp: Blueprint, pascal: string): string {
  return `/**
 * Smoke tests for ${bp.displayName} connector.
 * Generated from blueprint: connectors/blueprints/${bp.slug}.json
 */

import { describe, it, expect } from "vitest";
import connector from "@/lib/connectors/${bp.slug}";
import { validateConfig } from "@/lib/connectors/${bp.slug}/config";
import { runDiagnostics } from "@/lib/connectors/${bp.slug}/diagnostics";

describe("${bp.displayName} connector", () => {
  it("exports correct slug", () => {
    expect(connector.slug).toBe("${bp.slug}");
  });

  it("exports correct category", () => {
    expect(connector.category).toBe("${bp.category}");
  });

  it("exports required capabilities", () => {
    expect(connector.capabilities).toContain("${bp.capabilities[0]}");
    expect(connector.capabilities.length).toBe(${bp.capabilities.length});
  });

  it("activate rejects invalid config", async () => {
    const result = await connector.activate(null, null);
    expect(result.success).toBe(false);
  });

${bp.settings.length > 0 ? `  it("validates config schema", () => {
    const validConfig = ${JSON.stringify(
      Object.fromEntries(
        bp.settings
          .filter((s) => s.required)
          .map((s) => [s.key, s.default ?? (s.type === "number" ? 0 : s.type === "boolean" ? true : s.type === "url" ? "https://example.com" : s.options?.[0] ?? "test")])
      ),
      null,
      4
    ).replace(/\n/g, "\n    ")};
    expect(() => validateConfig(validConfig)).not.toThrow();
  });

  it("rejects empty config", () => {
    expect(() => validateConfig({})).toThrow();
  });
` : ""}
  it("runs diagnostics without credentials", async () => {
    const results = await runDiagnostics(null, null);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty("name");
    expect(results[0]).toHaveProperty("status");
  });
});
`;
}

function registerInSeed(bp: Blueprint): void {
  const seedPath = path.join(ROOT, "prisma", "seed-marketplace.ts");
  if (!fs.existsSync(seedPath)) {
    console.warn("  WARNING: prisma/seed-marketplace.ts not found — skipping seed registration");
    return;
  }

  const content = fs.readFileSync(seedPath, "utf-8");

  // Check if already registered
  if (content.includes(`slug: "${bp.slug}"`)) {
    console.log(`  Already registered in seed: ${bp.slug}`);
    return;
  }

  // Find the main() function closing and insert before it
  const marker = "// --- END GENERATED CONNECTORS ---";
  const insertBefore = content.includes(marker)
    ? marker
    : "async function main()";

  const categoryEnum = bp.category.toUpperCase() === "TELEPHONY"
    ? "CRM" // Use CRM as fallback since enum may not have TELEPHONY
    : bp.category.toUpperCase();

  const upsertBlock = `
  // Generated from blueprint: ${bp.slug}
  await prisma.connectorDefinition.upsert({
    where: { slug: "${bp.slug}" },
    update: {
      name: "${bp.displayName}",
      shortDesc: "${bp.description.slice(0, 200)}",
      category: "${categoryEnum}",
      tier: "CONFIG_DRIVEN",
      authType: "${bp.auth.type}",
      vendorUrl: ${bp.vendorUrl ? `"${bp.vendorUrl}"` : "null"},
      docsUrl: ${bp.docsUrl ? `"${bp.docsUrl}"` : "null"},
      prerequisites: ${JSON.stringify(bp.prerequisites || [])},
    },
    create: {
      slug: "${bp.slug}",
      name: "${bp.displayName}",
      description: "${bp.description}",
      shortDesc: "${bp.description.slice(0, 200)}",
      status: "DRAFT",
      version: 1,
      config: {},
      category: "${categoryEnum}",
      tier: "CONFIG_DRIVEN",
      authType: "${bp.auth.type}",
      vendorUrl: ${bp.vendorUrl ? `"${bp.vendorUrl}"` : "null"},
      docsUrl: ${bp.docsUrl ? `"${bp.docsUrl}"` : "null"},
      prerequisites: ${JSON.stringify(bp.prerequisites || [])},
      setupSteps: [],
    },
  });
  console.log("  Upserted ${bp.slug}");
`;

  const updated = content.replace(insertBefore, upsertBlock + "\n  " + insertBefore);

  if (updated === content) {
    // Fallback: append before the last closing brace of main()
    const lastMainClose = content.lastIndexOf("}\n\nmain()");
    if (lastMainClose > 0) {
      const newContent =
        content.slice(0, lastMainClose) +
        upsertBlock +
        content.slice(lastMainClose);
      fs.writeFileSync(seedPath, newContent);
      return;
    }
    console.warn("  WARNING: Could not find insertion point in seed file — manual registration needed");
    return;
  }

  fs.writeFileSync(seedPath, updated);
}

function settingTsType(s: BlueprintSetting): string {
  switch (s.type) {
    case "string":
    case "secret":
    case "url":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "select":
      return s.options ? s.options.map((o) => `"${o}"`).join(" | ") : "string";
    default:
      return "string";
  }
}
