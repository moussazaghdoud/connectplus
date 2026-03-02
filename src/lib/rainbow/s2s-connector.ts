/**
 * Rainbow S2S Connection Manager — spawns the standalone worker as a child process.
 *
 * The rainbow-node-sdk doesn't work properly inside Next.js (bundling issues,
 * event loop interference). The proven approach is scripts/rainbow-s2s-worker.js
 * running as a separate Node.js process.
 *
 * This module spawns that worker with credentials passed as env vars to the
 * child process. Credentials exist only in the child's memory — never on disk.
 *
 * Flow:
 *   1. Agent enters Rainbow login + password on /agent page
 *   2. POST /api/v1/rainbow/connect → s2sManager.connect()
 *   3. Spawns scripts/rainbow-s2s-worker.js with credentials as env vars
 *   4. Worker connects to Rainbow, receives call events
 *   5. Worker forwards events via HTTP POST to /api/v1/rainbow/webhooks
 *   6. Webhook route → eventBus → inbound handler → SSE → screen pop
 *   7. Agent disconnects → child process killed, credentials gone
 */

import { logger } from "../observability/logger";

// Use eval("require") to completely hide from Turbopack static analysis
// eslint-disable-next-line no-eval
const _require = eval("require") as NodeRequire;
type ChildProcess = import("child_process").ChildProcess;

const LOG_PREFIX = "[RainbowS2S]";

// ── Public types ─────────────────────────────────────────

export interface RainbowConnectParams {
  login: string;
  password: string;
}

export type RainbowSessionStatus =
  | "connecting"
  | "connected"
  | "error"
  | "stopped";

export interface RainbowSessionInfo {
  status: RainbowSessionStatus;
  connectedAs?: string;
  extension?: string;
  error?: string;
  connectedAt?: number;
}

// ── Per-tenant session ────────────────────────────────────

interface S2SSession {
  process: ChildProcess;
  info: RainbowSessionInfo;
}

// ── Connection Manager (singleton) ────────────────────────

class S2SConnectionManager {
  private sessions = new Map<string, S2SSession>();

  /**
   * Connect a tenant to Rainbow by spawning the standalone worker.
   * Login/password come from the user; appId/appSecret/host from server env vars.
   */
  async connect(
    tenantId: string,
    params: RainbowConnectParams
  ): Promise<RainbowSessionInfo> {
    const appId = process.env.RAINBOW_APP_ID;
    const appSecret = process.env.RAINBOW_APP_SECRET;
    const host = process.env.RAINBOW_HOST || "official";
    const hostCallback =
      process.env.RAINBOW_HOST_CALLBACK ||
      `http://localhost:${process.env.PORT || 3000}/api/v1/rainbow/webhooks`;

    if (!appId || !appSecret) {
      return {
        status: "error",
        error: "Server missing RAINBOW_APP_ID / RAINBOW_APP_SECRET env vars",
      };
    }

    // Stop existing session if any
    await this.disconnect(tenantId);

    console.log(
      `${LOG_PREFIX} [${tenantId}] Spawning worker for ${params.login} (host: ${host})`
    );

    // Build path at runtime (string concat defeats Turbopack static analysis)
    const workerPath = process.cwd() + "/scripts/rainbow-s2s-worker.js";

    const { spawn } = _require("child_process") as typeof import("child_process");
    const child = spawn("node", [workerPath], {
      env: {
        ...process.env,
        RAINBOW_APP_ID: appId,
        RAINBOW_APP_SECRET: appSecret,
        RAINBOW_HOST: host,
        RAINBOW_HOST_CALLBACK: hostCallback,
        RAINBOW_LOGIN: params.login,
        RAINBOW_PASSWORD: params.password,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const session: S2SSession = {
      process: child,
      info: {
        status: "connecting",
        connectedAs: params.login,
      },
    };
    this.sessions.set(tenantId, session);

    // Parse stdout for status updates
    child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        console.log(line);

        if (line.includes("SDK ready")) {
          session.info.status = "connected";
          session.info.connectedAt = Date.now();
        }
        if (line.includes("Connected as:")) {
          const match = line.match(/Connected as:\s*(.+)/);
          if (match) session.info.connectedAs = match[1].trim();
        }
        if (line.includes("Internal/Extension:")) {
          const match = line.match(/Internal\/Extension:\s*(.+)/);
          if (match) session.info.extension = match[1].trim();
        }
        if (line.includes("login failed") || line.includes("Failed to start")) {
          session.info.status = "error";
          session.info.error = "Login failed — check credentials";
        }
        if (line.includes("Missing Rainbow env vars")) {
          session.info.status = "error";
          session.info.error = "Missing configuration";
        }
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      console.error(data.toString());
    });

    child.on("exit", (code) => {
      console.log(`${LOG_PREFIX} [${tenantId}] Worker exited (code: ${code})`);
      const s = this.sessions.get(tenantId);
      if (s && s.process === child) {
        if (s.info.status === "connecting") {
          s.info.status = "error";
          s.info.error = "Worker exited before connecting";
        } else if (s.info.status === "connected") {
          s.info.status = "stopped";
          s.info.error = "Worker stopped";
        }
      }
    });

    // Wait a bit for the worker to start and report status
    await new Promise((resolve) => setTimeout(resolve, 8000));

    logger.info(
      { tenantId, status: session.info.status },
      "Rainbow S2S worker spawned"
    );

    return session.info;
  }

  /** Disconnect a tenant's Rainbow session by killing the worker */
  async disconnect(tenantId: string): Promise<void> {
    const session = this.sessions.get(tenantId);
    if (!session) return;

    try {
      session.process.kill("SIGTERM");
    } catch {
      // Ignore kill errors
    }

    this.sessions.delete(tenantId);
    console.log(`${LOG_PREFIX} [${tenantId}] Worker killed`);
    logger.info({ tenantId }, "Rainbow S2S disconnected");
  }

  /** Get session info for a tenant */
  getSessionInfo(tenantId: string): RainbowSessionInfo | null {
    return this.sessions.get(tenantId)?.info ?? null;
  }

  /** Check if a tenant has an active session */
  isConnected(tenantId: string): boolean {
    return this.sessions.get(tenantId)?.info.status === "connected";
  }
}

// ── Singleton (survives Next.js HMR) ─────────────────────

const globalForS2S = globalThis as unknown as {
  s2sConnectionManager: S2SConnectionManager | undefined;
};

if (!globalForS2S.s2sConnectionManager) {
  globalForS2S.s2sConnectionManager = new S2SConnectionManager();
}

export const s2sManager = globalForS2S.s2sConnectionManager;
