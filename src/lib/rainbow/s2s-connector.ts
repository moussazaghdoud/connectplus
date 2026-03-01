import { logger } from "../observability/logger";
import { eventBus } from "../core/event-bus";

const LOG_TAG = "[RainbowS2S]";

/**
 * Maps Rainbow SDK call status values to our internal event types.
 * The SDK fires `rainbow_oncallupdated` with data.status.value being
 * one of: "dialing", "ringing_incoming", "active", "releasing", "put_on_hold", etc.
 */
function mapCallStatus(statusValue: string): string | null {
  const v = statusValue?.toLowerCase();
  if (v === "ringing_incoming" || v === "queued_incoming") return "ringing";
  if (v === "active" || v === "answering") return "active";
  if (v === "releasing" || v === "unknown" || v === "error") return "released";
  if (v === "put_on_hold" || v === "hold") return "held";
  if (v === "dialing" || v === "ringing_outgoing" || v === "connecting") return "dialing";
  return null;
}

/**
 * Rainbow S2S Connector — uses `rainbow-node-sdk` to:
 *  1. Log in with appId/appSecret and a bot user account
 *  2. Register our public webhook URL as the S2S callback (hostCallback)
 *  3. Listen for telephony events and emit them on the shared eventBus
 *
 * The SDK handles authentication, token refresh, and reconnection internally.
 *
 * Required env vars:
 *  - RAINBOW_APP_ID
 *  - RAINBOW_APP_SECRET
 *  - RAINBOW_HOST_CALLBACK  (public URL that Rainbow will POST events to)
 *  - RAINBOW_LOGIN           (bot user email)
 *  - RAINBOW_PASSWORD        (bot user password)
 *  - RAINBOW_HOST            ("sandbox" | "official", default "official")
 */
class RainbowS2SConnector {
  private sdk: InstanceType<typeof import("rainbow-node-sdk").default> | null = null;
  private started = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Start the SDK and register the S2S callback. */
  async start(): Promise<void> {
    if (this.started) return;

    const appId = process.env.RAINBOW_APP_ID;
    const appSecret = process.env.RAINBOW_APP_SECRET;
    const hostCallback = process.env.RAINBOW_HOST_CALLBACK;
    const login = process.env.RAINBOW_LOGIN;
    const password = process.env.RAINBOW_PASSWORD;
    const host = (process.env.RAINBOW_HOST as "sandbox" | "official") || "official";

    if (!appId || !appSecret || !hostCallback) {
      logger.warn(
        `${LOG_TAG} Missing RAINBOW_APP_ID, RAINBOW_APP_SECRET, or RAINBOW_HOST_CALLBACK — S2S connector disabled`
      );
      return;
    }

    if (!login || !password) {
      logger.warn(
        `${LOG_TAG} Missing RAINBOW_LOGIN or RAINBOW_PASSWORD — S2S connector disabled`
      );
      return;
    }

    logger.info(
      { host, hostCallback },
      `${LOG_TAG} Initializing Rainbow Node SDK in S2S mode`
    );

    try {
      // Dynamic require — hidden from Turbopack/webpack static analysis
      // so it doesn't try to bundle rainbow-node-sdk for Edge runtime
      const sdkPath = "rainbow-node-sdk";
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const RainbowSDK = require(sdkPath).default ?? require(sdkPath);

      this.sdk = new RainbowSDK({
        rainbow: {
          host,
          mode: "s2s",
        },
        s2s: {
          hostCallback,
          locallistenningport: "0", // We don't need a local listener — our Next.js route handles inbound
        },
        credentials: {
          login,
          password,
        },
        application: {
          appID: appId,
          appSecret: appSecret,
        },
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

      this.attachEventListeners();

      await this.sdk.start();
      this.started = true;
      logger.info(`${LOG_TAG} Rainbow S2S connected — callback registered at ${hostCallback}`);
    } catch (err) {
      logger.error({ err }, `${LOG_TAG} Failed to start Rainbow SDK`);
      this.scheduleReconnect();
    }
  }

  /** Graceful shutdown */
  async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sdk && this.started) {
      try {
        await this.sdk.stop();
        logger.info(`${LOG_TAG} Rainbow SDK stopped`);
      } catch (err) {
        logger.warn({ err }, `${LOG_TAG} Error stopping SDK`);
      }
    }

    this.started = false;
    this.sdk = null;
  }

  /** Attach event listeners to the SDK instance */
  private attachEventListeners(): void {
    if (!this.sdk) return;

    // SDK connected
    this.sdk.events.on("rainbow_onready", () => {
      logger.info(`${LOG_TAG} Rainbow SDK ready`);
    });

    this.sdk.events.on("rainbow_onconnected", () => {
      logger.info(`${LOG_TAG} Rainbow SDK connected`);
    });

    // Telephony call events
    this.sdk.events.on("rainbow_oncallupdated", (call: Record<string, unknown>) => {
      try {
        this.handleCallEvent(call);
      } catch (err) {
        logger.error({ err }, `${LOG_TAG} Error processing call event`);
      }
    });

    // Disconnection / error — schedule reconnect
    this.sdk.events.on("rainbow_onstopped", () => {
      logger.warn(`${LOG_TAG} Rainbow SDK stopped unexpectedly`);
      this.started = false;
      this.scheduleReconnect();
    });

    this.sdk.events.on("rainbow_onconnectionerror", () => {
      logger.error(`${LOG_TAG} Rainbow connection error`);
    });

    this.sdk.events.on("rainbow_onfailed", () => {
      logger.error(`${LOG_TAG} Rainbow SDK login failed`);
      this.started = false;
      this.scheduleReconnect();
    });

    this.sdk.events.on("rainbow_onreconnecting", () => {
      logger.info(`${LOG_TAG} Rainbow SDK reconnecting...`);
    });
  }

  /**
   * Handle a call event from the SDK and emit it on our eventBus
   * so the InboundCallHandler processes it (same as webhook-originated events).
   */
  private handleCallEvent(call: Record<string, unknown>): void {
    const status = call.status as { value?: string; key?: number } | undefined;
    const statusValue = status?.value ?? "unknown";
    const mapped = mapCallStatus(statusValue);

    if (!mapped) {
      logger.debug(
        { statusValue, callId: call.id },
        `${LOG_TAG} Ignoring unmapped call status`
      );
      return;
    }

    const callId = (call.id as string) ?? (call.globalCallId as string) ?? "unknown";
    const contact = call.contact as Record<string, unknown> | undefined;
    const callerNumber =
      (call.phoneNumber as string) ??
      (contact?.phoneNumbers as Array<{ number: string }> | undefined)?.[0]?.number ??
      "";
    const callerName = (contact?.displayName as string) ?? "";

    logger.info(
      { callId, statusValue, mapped, callerNumber, callerName },
      `${LOG_TAG} Call event received`
    );

    // Build an event type matching what InboundCallHandler expects
    let eventType: string;
    switch (mapped) {
      case "ringing":
        eventType = "call.ringing";
        break;
      case "active":
        eventType = "call.active";
        break;
      case "released":
        eventType = "call.ended";
        break;
      case "held":
        eventType = "call.held";
        break;
      default:
        eventType = `call.${mapped}`;
    }

    // Use a default tenant for single-tenant mode
    const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";

    eventBus.emit("rainbow.callback", {
      eventType,
      tenantId,
      payload: {
        callId,
        status: mapped,
        callerNumber,
        callerName,
        calleeNumber: (call.currentCalled as Record<string, unknown>)?.number ?? "",
        cause: call.cause ?? "",
        deviceType: call.deviceType ?? "",
        raw: call,
      },
    });
  }

  /** Schedule a reconnection attempt after a delay */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = 30_000; // 30 seconds
    logger.info(`${LOG_TAG} Will attempt reconnection in ${delay / 1000}s`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.sdk = null;
      this.started = false;
      logger.info(`${LOG_TAG} Attempting reconnection...`);
      await this.start();
    }, delay);
  }
}

/** Singleton stored on globalThis to survive Next.js module re-bundling */
const globalForS2S = globalThis as unknown as {
  rainbowS2SConnector: RainbowS2SConnector | undefined;
};

if (!globalForS2S.rainbowS2SConnector) {
  globalForS2S.rainbowS2SConnector = new RainbowS2SConnector();
}

export const rainbowS2SConnector = globalForS2S.rainbowS2SConnector;
