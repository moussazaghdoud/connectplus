/**
 * StateStore — unified key-value store with optional Redis backend.
 *
 * Falls back to in-memory Map when REDIS_URL is not set.
 * Provides TTL support, JSON serialization, and prefix namespacing.
 *
 * Usage:
 *   const store = createStore<MyType>("cti:calls", { ttlMs: 4 * 60 * 60 * 1000 });
 *   await store.set("key", value);
 *   const val = await store.get("key");
 */

import { logger } from "../observability/logger";

const log = logger.child({ module: "state-store" });

// ── Interface ──────────────────────────────────────────────

export interface StateStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlMs?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  values(): Promise<T[]>;
  entries(): Promise<[string, T][]>;
  size(): Promise<number>;
  clear(): Promise<void>;
}

interface StoreOptions {
  /** Default TTL in milliseconds. Entries expire after this. */
  ttlMs?: number;
}

// ── In-Memory Implementation ───────────────────────────────

interface MemEntry<T> {
  value: T;
  expiresAt: number | null;
}

class InMemoryStore<T> implements StateStore<T> {
  private map = new Map<string, MemEntry<T>>();
  private prefix: string;
  private defaultTtl: number | null;

  constructor(prefix: string, opts?: StoreOptions) {
    this.prefix = prefix;
    this.defaultTtl = opts?.ttlMs ?? null;
  }

  private k(key: string) { return `${this.prefix}:${key}`; }

  private isExpired(entry: MemEntry<T>): boolean {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  async get(key: string): Promise<T | undefined> {
    const entry = this.map.get(this.k(key));
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.map.delete(this.k(key));
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtl;
    this.map.set(this.k(key), {
      value,
      expiresAt: ttl ? Date.now() + ttl : null,
    });
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.map.delete(this.k(key));
  }

  async keys(): Promise<string[]> {
    const result: string[] = [];
    const prefixLen = this.prefix.length + 1;
    for (const [k, entry] of this.map) {
      if (!this.isExpired(entry)) {
        result.push(k.slice(prefixLen));
      }
    }
    return result;
  }

  async values(): Promise<T[]> {
    const result: T[] = [];
    for (const entry of this.map.values()) {
      if (!this.isExpired(entry)) {
        result.push(entry.value);
      }
    }
    return result;
  }

  async entries(): Promise<[string, T][]> {
    const result: [string, T][] = [];
    const prefixLen = this.prefix.length + 1;
    for (const [k, entry] of this.map) {
      if (!this.isExpired(entry)) {
        result.push([k.slice(prefixLen), entry.value]);
      }
    }
    return result;
  }

  async size(): Promise<number> {
    return (await this.keys()).length;
  }

  async clear(): Promise<void> {
    const prefix = this.prefix + ":";
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) {
        this.map.delete(key);
      }
    }
  }
}

// ── Redis Implementation ───────────────────────────────────

class RedisStore<T> implements StateStore<T> {
  private prefix: string;
  private defaultTtl: number | null;
  private redis: import("ioredis").default;

  constructor(redis: import("ioredis").default, prefix: string, opts?: StoreOptions) {
    this.redis = redis;
    this.prefix = prefix;
    this.defaultTtl = opts?.ttlMs ?? null;
  }

  private k(key: string) { return `${this.prefix}:${key}`; }

  async get(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(this.k(key));
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtl;
    const raw = JSON.stringify(value);
    if (ttl) {
      await this.redis.set(this.k(key), raw, "PX", ttl);
    } else {
      await this.redis.set(this.k(key), raw);
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(this.k(key))) === 1;
  }

  async delete(key: string): Promise<boolean> {
    return (await this.redis.del(this.k(key))) > 0;
  }

  async keys(): Promise<string[]> {
    const pattern = `${this.prefix}:*`;
    const keys = await this.redis.keys(pattern);
    const prefixLen = this.prefix.length + 1;
    return keys.map(k => k.slice(prefixLen));
  }

  async values(): Promise<T[]> {
    const keys = await this.redis.keys(`${this.prefix}:*`);
    if (keys.length === 0) return [];
    const values = await this.redis.mget(...keys);
    return values
      .filter((v): v is string => v !== null)
      .map(v => { try { return JSON.parse(v) as T; } catch { return undefined; } })
      .filter((v): v is T => v !== undefined);
  }

  async entries(): Promise<[string, T][]> {
    const keys = await this.redis.keys(`${this.prefix}:*`);
    if (keys.length === 0) return [];
    const values = await this.redis.mget(...keys);
    const prefixLen = this.prefix.length + 1;
    const result: [string, T][] = [];
    for (let i = 0; i < keys.length; i++) {
      if (values[i] !== null) {
        try {
          result.push([keys[i].slice(prefixLen), JSON.parse(values[i]!) as T]);
        } catch { /* skip malformed */ }
      }
    }
    return result;
  }

  async size(): Promise<number> {
    const keys = await this.redis.keys(`${this.prefix}:*`);
    return keys.length;
  }

  async clear(): Promise<void> {
    const keys = await this.redis.keys(`${this.prefix}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// ── Factory ────────────────────────────────────────────────

let redisClient: import("ioredis").default | null = null;
let redisAttempted = false;

function getRedisClient(): import("ioredis").default | null {
  if (redisAttempted) return redisClient;
  redisAttempted = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    log.info("No REDIS_URL — using in-memory state stores");
    return null;
  }

  try {
    // Dynamic import to avoid bundling ioredis when not needed
    const Redis = require("ioredis") as typeof import("ioredis").default;
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    redisClient.on("connect", () => log.info("Redis connected"));
    redisClient.on("error", (err) => log.warn({ err }, "Redis error"));

    redisClient.connect().catch((err) => {
      log.warn({ err }, "Redis connection failed — falling back to in-memory");
      redisClient = null;
    });

    return redisClient;
  } catch (err) {
    log.warn({ err }, "Failed to initialize Redis — using in-memory");
    return null;
  }
}

/**
 * Create a namespaced state store.
 * Uses Redis if REDIS_URL is set, otherwise in-memory Map.
 */
export function createStore<T>(prefix: string, opts?: StoreOptions): StateStore<T> {
  const redis = getRedisClient();
  if (redis) {
    log.debug({ prefix }, "Creating Redis-backed store");
    return new RedisStore<T>(redis, prefix, opts);
  }
  return new InMemoryStore<T>(prefix, opts);
}

/**
 * Check if Redis is available.
 */
export function isRedisAvailable(): boolean {
  return redisClient !== null && redisClient.status === "ready";
}
