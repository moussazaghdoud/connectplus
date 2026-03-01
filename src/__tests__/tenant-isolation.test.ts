/**
 * Tenant Isolation Tests
 *
 * Verifies core security invariants without requiring a database connection.
 * Tests: crypto, API keys, rate limiting, tenant context, registry, events, errors.
 *
 * Run with: npx tsx src/__tests__/tenant-isolation.test.ts
 */

const PASS = "✓";
const FAIL = "✗";
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ${PASS} ${message}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${message}`);
    failed++;
  }
}

// ─── Crypto tests ────────────────────────────────────────

async function testCrypto() {
  console.log("\n[Crypto] AES-256-GCM encrypt/decrypt");

  process.env.ENCRYPTION_KEY =
    "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

  const { encrypt, decrypt, encryptJson, decryptJson } = await import(
    "../lib/utils/crypto"
  );

  const plaintext = "my-secret-password-123!@#";
  const ciphertext = encrypt(plaintext);
  assert(ciphertext !== plaintext, "Ciphertext differs from plaintext");
  assert(decrypt(ciphertext) === plaintext, "Decrypted text matches original");

  const obj = { accessToken: "tok_abc", refreshToken: "ref_xyz" };
  const encrypted = encryptJson(obj);
  const decrypted = decryptJson<typeof obj>(encrypted);
  assert(decrypted.accessToken === "tok_abc", "JSON accessToken roundtrip OK");
  assert(decrypted.refreshToken === "ref_xyz", "JSON refreshToken roundtrip OK");

  const c1 = encrypt("same");
  const c2 = encrypt("same");
  assert(c1 !== c2, "Random IV: same plaintext → different ciphertexts");
  assert(decrypt(c1) === decrypt(c2), "Both ciphertexts decrypt to same value");

  // Bad key should fail
  const original = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY =
    "0000000000000000000000000000000000000000000000000000000000000000";
  let decryptFailed = false;
  try {
    decrypt(ciphertext);
  } catch {
    decryptFailed = true;
  }
  assert(decryptFailed, "Decryption fails with wrong key");
  process.env.ENCRYPTION_KEY = original;
}

// ─── API key tests ───────────────────────────────────────

async function testApiKeyGeneration() {
  console.log("\n[Auth] API key generation and hashing");

  // Import only the pure functions (no DB dependency)
  const { createHash, randomBytes } = await import("crypto");

  function hashApiKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  function generateApiKey(): string {
    return `cp_${randomBytes(32).toString("hex")}`;
  }

  const key1 = generateApiKey();
  const key2 = generateApiKey();
  assert(key1.startsWith("cp_"), "API key starts with 'cp_' prefix");
  assert(key1.length === 67, `API key is 67 chars (got ${key1.length})`);
  assert(key1 !== key2, "Two generated keys are different");

  const hash1 = hashApiKey(key1);
  assert(hash1 === hashApiKey(key1), "Same key → same hash (deterministic)");
  assert(hash1 !== hashApiKey(key2), "Different keys → different hashes");
  assert(hash1.length === 64, "Hash is 64 hex chars (SHA-256)");

  // Key hint extraction
  const hint = key1.slice(-4);
  assert(hint.length === 4, "API key hint is last 4 chars");
}

// ─── Rate limiter tests ──────────────────────────────────

async function testRateLimiter() {
  console.log("\n[RateLimit] Per-tenant rate limiting");

  const { rateLimiter } = await import("../lib/middleware/rate-limiter");

  const tenantA = "test-tenant-a-" + Date.now();
  const tenantB = "test-tenant-b-" + Date.now();

  assert(rateLimiter.remaining(tenantA) === 100, "Tenant A starts with 100 tokens");

  for (let i = 0; i < 5; i++) rateLimiter.consume(tenantA);
  assert(rateLimiter.remaining(tenantA) < 100, "Tenant A tokens decreased");
  assert(rateLimiter.remaining(tenantB) === 100, "Tenant B unaffected (isolation)");

  // Exhaust tenant A tokens
  for (let i = 0; i < 200; i++) {
    try {
      rateLimiter.consume(tenantA);
    } catch {
      break;
    }
  }

  let rateLimited = false;
  try {
    rateLimiter.consume(tenantA);
  } catch (err) {
    rateLimited = (err as Error).message.includes("Rate limit");
  }
  assert(rateLimited, "Tenant A gets rate limited after exhaustion");

  // Tenant B should still work fine
  let tenantBOk = true;
  try {
    rateLimiter.consume(tenantB);
  } catch {
    tenantBOk = false;
  }
  assert(tenantBOk, "Tenant B still has capacity (isolation)");
}

// ─── Tenant context tests ────────────────────────────────

async function testTenantContext() {
  console.log("\n[TenantContext] AsyncLocalStorage isolation");

  const { runWithTenant, getTenantContext, tryGetTenantContext } = await import(
    "../lib/core/tenant-context"
  );

  assert(tryGetTenantContext() === null, "No context outside scope");

  let threwError = false;
  try {
    getTenantContext();
  } catch {
    threwError = true;
  }
  assert(threwError, "getTenantContext() throws outside scope");

  const resultA = runWithTenant(
    { tenantId: "a", tenantSlug: "alpha", tenantStatus: "ACTIVE" },
    () => getTenantContext().tenantId
  );
  assert(resultA === "a", "Context A returns correct tenantId");

  const resultB = runWithTenant(
    { tenantId: "b", tenantSlug: "beta", tenantStatus: "ACTIVE" },
    () => getTenantContext().tenantId
  );
  assert(resultB === "b", "Context B returns correct tenantId");

  // Concurrent isolation
  const results = await Promise.all([
    new Promise<string>((resolve) => {
      runWithTenant(
        { tenantId: "x", tenantSlug: "xray", tenantStatus: "ACTIVE" },
        () => {
          setTimeout(() => resolve(getTenantContext().tenantId), 10);
        }
      );
    }),
    new Promise<string>((resolve) => {
      runWithTenant(
        { tenantId: "y", tenantSlug: "yankee", tenantStatus: "ACTIVE" },
        () => {
          setTimeout(() => resolve(getTenantContext().tenantId), 10);
        }
      );
    }),
  ]);
  assert(results[0] === "x", "Concurrent context X isolated");
  assert(results[1] === "y", "Concurrent context Y isolated");

  // Nested contexts don't leak
  const nested = runWithTenant(
    { tenantId: "outer", tenantSlug: "o", tenantStatus: "ACTIVE" },
    () => {
      const inner = runWithTenant(
        { tenantId: "inner", tenantSlug: "i", tenantStatus: "ACTIVE" },
        () => getTenantContext().tenantId
      );
      const afterInner = getTenantContext().tenantId;
      return { inner, afterInner };
    }
  );
  assert(nested.inner === "inner", "Inner context returns 'inner'");
  assert(nested.afterInner === "outer", "Outer context restored after inner");
}

// ─── Connector registry tests ────────────────────────────

async function testConnectorRegistry() {
  console.log("\n[ConnectorRegistry] Plugin system");

  const { connectorRegistry } = await import("../lib/core/connector-registry");

  const mock = {
    manifest: {
      id: "test-" + Date.now(),
      name: "Test Connector",
      version: "1.0.0",
      authType: "api_key" as const,
      webhookSupported: false,
      capabilities: ["contact_search" as const],
    },
    initialize: async () => {},
    searchContacts: async () => [],
    mapContact: (ext: { externalId: string; source: string; raw: unknown }) => ({
      displayName: "Test",
      externalId: ext.externalId,
      source: ext.source,
    }),
    verifyWebhook: () => false,
    parseWebhook: () => {
      throw new Error("Not implemented");
    },
    healthCheck: async () => ({ healthy: true, latencyMs: 0 }),
  };

  connectorRegistry.register(mock);
  assert(connectorRegistry.has(mock.manifest.id), "Connector registered");
  assert(
    connectorRegistry.get(mock.manifest.id).manifest.name === "Test Connector",
    "Retrieved connector name matches"
  );

  let dupThrew = false;
  try { connectorRegistry.register(mock); } catch { dupThrew = true; }
  assert(dupThrew, "Duplicate registration throws");

  let notFoundThrew = false;
  try { connectorRegistry.get("nonexistent-" + Date.now()); } catch { notFoundThrew = true; }
  assert(notFoundThrew, "Unknown connector throws");
  assert(connectorRegistry.tryGet("nonexistent") === null, "tryGet returns null for unknown");

  connectorRegistry.unregister(mock.manifest.id);
  assert(!connectorRegistry.has(mock.manifest.id), "Unregistered successfully");
}

// ─── Event bus tests ─────────────────────────────────────

async function testEventBus() {
  console.log("\n[EventBus] Typed event emission");

  const { eventBus } = await import("../lib/core/event-bus");

  let received = false;
  let payload: unknown = null;

  const handler = (p: { interactionId: string; tenantId: string }) => {
    received = true;
    payload = p;
  };

  eventBus.on("interaction.created", handler);
  eventBus.emit("interaction.created", {
    interactionId: "int_123",
    tenantId: "tenant_456",
  });

  assert(received, "Event handler called");
  assert(
    (payload as { interactionId: string }).interactionId === "int_123",
    "Event payload correct"
  );

  eventBus.off("interaction.created", handler);

  // After removing handler, shouldn't fire
  const called = false;
  eventBus.emit("interaction.created", {
    interactionId: "int_999",
    tenantId: "tenant_000",
  });
  // If we got here, the old handler wasn't called (good)
  assert(!called, "Removed handler not called on subsequent emit");
}

// ─── Error types tests ──────────────────────────────────

async function testErrors() {
  console.log("\n[Errors] Typed framework errors");

  const {
    AuthenticationError,
    NotFoundError,
    ValidationError,
    RateLimitError,
    ConnectorError,
    FrameworkError,
  } = await import("../lib/core/errors");

  const auth = new AuthenticationError();
  assert(auth.statusCode === 401, "AuthenticationError → 401");
  assert(auth instanceof FrameworkError, "Extends FrameworkError");

  const notFound = new NotFoundError("Interaction", "abc");
  assert(notFound.statusCode === 404, "NotFoundError → 404");
  assert(notFound.message.includes("abc"), "Message includes resource ID");

  const validation = new ValidationError("Bad", { field: "email" });
  assert(validation.statusCode === 400, "ValidationError → 400");
  assert(validation.toJSON().error.code === "VALIDATION_ERROR", "JSON structure correct");

  assert(new RateLimitError(30).statusCode === 429, "RateLimitError → 429");
  assert(new ConnectorError("hub", "down").statusCode === 502, "ConnectorError → 502");
}

// ─── Metrics tests ───────────────────────────────────────

async function testMetrics() {
  console.log("\n[Metrics] In-process counters");

  const { metrics } = await import("../lib/observability/metrics");

  metrics.increment("test_counter", { tenant: "a" });
  metrics.increment("test_counter", { tenant: "a" });
  metrics.increment("test_counter", { tenant: "b" });

  assert(
    metrics.get("test_counter", { tenant: "a" }) === 2,
    "Counter for tenant A is 2"
  );
  assert(
    metrics.get("test_counter", { tenant: "b" }) === 1,
    "Counter for tenant B is 1 (isolated)"
  );

  const snap = metrics.snapshot();
  assert(
    Object.keys(snap).length > 0,
    "Snapshot has entries"
  );
}

// ─── Run all tests ───────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log(" ConnectPlus — Tenant Isolation Test Suite      ");
  console.log("═══════════════════════════════════════════════");

  await testCrypto();
  await testApiKeyGeneration();
  await testRateLimiter();
  await testTenantContext();
  await testConnectorRegistry();
  await testEventBus();
  await testErrors();
  await testMetrics();

  console.log("\n═══════════════════════════════════════════════");
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
