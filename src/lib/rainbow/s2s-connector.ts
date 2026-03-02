/**
 * Rainbow S2S Connection Manager — per-user SDK sessions.
 *
 * Each agent provides their own Rainbow login/password through the UI.
 * Credentials are kept in memory only — never persisted to disk or DB.
 * When the user disconnects (or the server restarts), credentials are gone.
 *
 * Flow:
 *   1. Agent enters Rainbow login + password on /agent page
 *   2. Frontend POSTs to /api/v1/rainbow/connect
 *   3. Server starts an SDK instance for that tenant (in memory)
 *   4. SDK registers our webhook URL with Rainbow
 *   5. Call events flow through event bus → SSE → agent UI
 *   6. Agent disconnects → SDK instance stopped, credentials wiped
 */

import { eventBus } from "../core/event-bus";
import { logger } from "../observability/logger";

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

// ── Status mapping ───────────────────────────────────────

function mapCallStatus(statusValue: string): string | null {
  const v = (statusValue || "").toLowerCase();
  if (v === "ringing_incoming" || v === "queued_incoming") return "ringing";
  if (v === "active" || v === "answering") return "active";
  if (v === "releasing" || v === "unknown" || v === "error") return "released";
  if (v === "put_on_hold" || v === "hold") return "held";
  if (v === "dialing" || v === "ringing_outgoing" || v === "connecting")
    return "dialing";
  return null;
}

function statusToEventType(mapped: string): string {
  switch (mapped) {
    case "ringing":
      return "call.ringing";
    case "active":
      return "call.active";
    case "released":
      return "call.ended";
    case "held":
      return "call.held";
    default:
      return `call.${mapped}`;
  }
}

// ── Noop Express shim ─────────────────────────────────────

function createNoopExpress(): unknown {
  const noop = () => noop;
  const app = function () {} as unknown as Record<string, unknown>;
  app.use = noop;
  app.get = noop;
  app.post = noop;
  app.put = noop;
  app.delete = noop;
  app.all = noop;
  app.listen = (_port: number, cb?: () => void) => {
    if (cb) cb();
    return { close: noop };
  };
  app.set = noop;
  app.engine = noop;
  return app;
}

// ── Call event handler ────────────────────────────────────

interface RainbowCallObject {
  id?: string;
  globalCallId?: string;
  status?: { value?: string };
  phoneNumber?: string;
  contact?: {
    displayName?: string;
    phoneNumbers?: Array<{ number: string }>;
  };
  currentCalled?: { number?: string };
  cause?: string;
  deviceType?: string;
}

function emitCallEvent(tenantId: string, call: RainbowCallObject): void {
  const statusValue = call.status?.value || "unknown";
  const mapped = mapCallStatus(statusValue);
  if (!mapped) return;

  const callId = call.id || call.globalCallId || "unknown";
  const contact = call.contact || {};
  const callerNumber =
    call.phoneNumber || contact.phoneNumbers?.[0]?.number || "";
  const callerName = contact.displayName || "";
  const eventType = statusToEventType(mapped);

  console.log(
    `${LOG_PREFIX} [${tenantId}] Call: ${statusValue} → ${mapped} | callId=${callId} caller=${callerNumber}`
  );

  eventBus.emit("rainbow.callback", {
    eventType,
    tenantId,
    payload: {
      eventType,
      callId,
      callerNumber,
      calleeNumber: call.currentCalled?.number || "",
      callerName,
      status: mapped,
      cause: call.cause || "",
      deviceType: call.deviceType || "",
    },
  });
}

// ── SDK instance type ─────────────────────────────────────

interface RainbowSDKInstance {
  events: {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  connectedUser?: {
    displayName?: string;
    loginEmail?: string;
    id?: string;
    jid_im?: string;
    phoneNumbers?: Array<{
      number: string;
      type?: string;
      deviceType?: string;
    }>;
    phonePbx?: string;
    phoneInternalNumber?: string;
  };
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

// ── Per-tenant session ────────────────────────────────────

interface S2SSession {
  sdk: RainbowSDKInstance;
  info: RainbowSessionInfo;
  retryTimer?: ReturnType<typeof setTimeout>;
}

// ── Connection Manager (singleton) ────────────────────────

class S2SConnectionManager {
  private sessions = new Map<string, S2SSession>();

  /** Get the webhook callback URL from env or derive it */
  private get hostCallback(): string {
    return (
      process.env.RAINBOW_HOST_CALLBACK ||
      `http://localhost:${process.env.PORT || 3000}/api/v1/rainbow/webhooks`
    );
  }

  /**
   * Connect a tenant to Rainbow.
   * Login/password come from the user; appId/appSecret/host from env vars.
   */
  async connect(
    tenantId: string,
    params: RainbowConnectParams
  ): Promise<RainbowSessionInfo> {
    const appId = process.env.RAINBOW_APP_ID;
    const appSecret = process.env.RAINBOW_APP_SECRET;
    const host = process.env.RAINBOW_HOST || "official";

    if (!appId || !appSecret) {
      return { status: "error", error: "Server missing RAINBOW_APP_ID / RAINBOW_APP_SECRET" };
    }

    // Stop existing session if any
    await this.disconnect(tenantId);

    const hostCallback = this.hostCallback;

    console.log(
      `${LOG_PREFIX} [${tenantId}] Connecting as ${params.login} (host: ${host})`
    );

    const session: S2SSession = {
      sdk: null as unknown as RainbowSDKInstance,
      info: { status: "connecting" },
    };
    this.sessions.set(tenantId, session);

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const RainbowSDK =
        require("rainbow-node-sdk").default || require("rainbow-node-sdk");

      const sdk: RainbowSDKInstance = new RainbowSDK({
        rainbow: { host, mode: "s2s" },
        s2s: {
          hostCallback,
          locallistenningport: "0",
          expressEngine: createNoopExpress(),
        },
        credentials: { login: params.login, password: params.password },
        application: { appID: appId, appSecret },
        logs: {
          enableConsoleLogs: false,
          enableFileLogs: false,
          color: false,
          level: "warn",
        },
        im: {
          sendReadReceipt: false,
          autoLoadConversations: false,
          autoLoadContacts: false,
          autoInitialGetBubbles: false,
          autoInitialBubblePresence: false,
        },
        servicesToStart: {
          telephony: { start_up: true },
          bubbles: { start_up: false },
          channels: { start_up: false },
          admin: { start_up: false },
          fileServer: { start_up: false },
          fileStorage: { start_up: false },
          calllog: { start_up: false },
          favorites: { start_up: false },
        },
      });

      session.sdk = sdk;

      // ── SDK event listeners ──────────────────────────────

      sdk.events.on("rainbow_onready", () => {
        console.log(
          `${LOG_PREFIX} [${tenantId}] SDK ready — callback: ${hostCallback}`
        );
        logger.info({ tenantId, hostCallback }, "Rainbow S2S connected");

        const user = sdk.connectedUser;
        session.info = {
          status: "connected",
          connectedAs:
            user?.displayName || user?.loginEmail || params.login,
          extension: user?.phoneInternalNumber || undefined,
          connectedAt: Date.now(),
        };

        if (user) {
          console.log(
            `${LOG_PREFIX} [${tenantId}] Connected as: ${user.displayName || user.loginEmail}`
          );
          if (user.phoneNumbers?.length) {
            for (const p of user.phoneNumbers) {
              console.log(
                `${LOG_PREFIX} [${tenantId}] Phone: ${p.number} (${p.type || ""} / ${p.deviceType || ""})`
              );
            }
          }
          if (user.phoneInternalNumber) {
            console.log(
              `${LOG_PREFIX} [${tenantId}] Extension: ${user.phoneInternalNumber}`
            );
          }
        }
      });

      sdk.events.on("rainbow_onconnected", () => {
        console.log(`${LOG_PREFIX} [${tenantId}] SDK connected`);
      });

      sdk.events.on("rainbow_oncallupdated", (call: unknown) => {
        try {
          emitCallEvent(tenantId, call as RainbowCallObject);
        } catch (err) {
          console.error(
            `${LOG_PREFIX} [${tenantId}] Error processing call:`,
            err
          );
        }
      });

      sdk.events.on("rainbow_onstopped", () => {
        console.warn(`${LOG_PREFIX} [${tenantId}] SDK stopped unexpectedly`);
        const s = this.sessions.get(tenantId);
        if (s) {
          s.info = { status: "stopped", error: "SDK stopped unexpectedly" };
        }
        // Don't auto-reconnect — user can reconnect manually from the UI
      });

      sdk.events.on("rainbow_onfailed", () => {
        console.error(`${LOG_PREFIX} [${tenantId}] SDK login failed`);
        const s = this.sessions.get(tenantId);
        if (s) {
          s.info = { status: "error", error: "Login failed — check credentials" };
        }
      });

      sdk.events.on("rainbow_onconnectionerror", () => {
        console.error(`${LOG_PREFIX} [${tenantId}] Connection error`);
      });

      sdk.events.on("rainbow_onreconnecting", () => {
        console.log(`${LOG_PREFIX} [${tenantId}] Reconnecting...`);
      });

      await sdk.start();
      console.log(`${LOG_PREFIX} [${tenantId}] SDK started`);

      return session.info;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      console.error(`${LOG_PREFIX} [${tenantId}] Failed to start:`, message);
      logger.error({ err, tenantId }, "Rainbow S2S startup failed");

      session.info = { status: "error", error: message };
      return session.info;
    }
  }

  /** Disconnect a tenant's Rainbow session */
  async disconnect(tenantId: string): Promise<void> {
    const session = this.sessions.get(tenantId);
    if (!session) return;

    if (session.retryTimer) {
      clearTimeout(session.retryTimer);
    }

    try {
      await session.sdk?.stop();
    } catch {
      // Ignore stop errors
    }

    this.sessions.delete(tenantId);
    console.log(`${LOG_PREFIX} [${tenantId}] Disconnected`);
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
