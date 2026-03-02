// ─── Global test setup ──────────────────────────────────
// Set a deterministic encryption key (64 hex chars = 32 bytes)
process.env.ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Silence pino logger during tests
process.env.LOG_LEVEL = "silent";
