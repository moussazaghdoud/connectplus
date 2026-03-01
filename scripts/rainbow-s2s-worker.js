#!/usr/bin/env node
/**
 * Rainbow S2S Worker — standalone Node.js process (NOT bundled by Next.js).
 *
 * Connects to Rainbow via the official SDK in S2S mode, registers our
 * webhook callback URL, and forwards telephony events to the Next.js
 * webhook endpoint via local HTTP POST.
 *
 * Started by start.sh alongside server.js.
 */

const LOG = "[RainbowS2S]";

// ── Config from env ──────────────────────────────────────
const APP_ID = process.env.RAINBOW_APP_ID;
const APP_SECRET = process.env.RAINBOW_APP_SECRET;
const HOST_CALLBACK = process.env.RAINBOW_HOST_CALLBACK;
const LOGIN = process.env.RAINBOW_LOGIN;
const PASSWORD = process.env.RAINBOW_PASSWORD;
const HOST = process.env.RAINBOW_HOST || "official";
const WEBHOOK_URL = `http://localhost:${process.env.PORT || 8080}/api/v1/rainbow/webhooks`;

if (!APP_ID || !APP_SECRET || !HOST_CALLBACK || !LOGIN || !PASSWORD) {
  console.log(`${LOG} Missing Rainbow env vars — worker disabled`);
  console.log(`${LOG} Need: RAINBOW_APP_ID, RAINBOW_APP_SECRET, RAINBOW_HOST_CALLBACK, RAINBOW_LOGIN, RAINBOW_PASSWORD`);
  process.exit(0);
}

// ── Status mapping ───────────────────────────────────────
function mapCallStatus(statusValue) {
  const v = (statusValue || "").toLowerCase();
  if (v === "ringing_incoming" || v === "queued_incoming") return "ringing";
  if (v === "active" || v === "answering") return "active";
  if (v === "releasing" || v === "unknown" || v === "error") return "released";
  if (v === "put_on_hold" || v === "hold") return "held";
  if (v === "dialing" || v === "ringing_outgoing" || v === "connecting") return "dialing";
  return null;
}

function statusToEventType(mapped) {
  switch (mapped) {
    case "ringing": return "call.ringing";
    case "active": return "call.active";
    case "released": return "call.ended";
    case "held": return "call.held";
    default: return `call.${mapped}`;
  }
}

// ── Forward event to Next.js webhook ─────────────────────
async function forwardToWebhook(eventType, callData) {
  const body = JSON.stringify({
    eventType,
    callId: callData.callId,
    callerNumber: callData.callerNumber,
    calleeNumber: callData.calleeNumber,
    callerName: callData.callerName,
    status: callData.status,
    cause: callData.cause,
    deviceType: callData.deviceType,
  });

  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    console.log(`${LOG} Forwarded ${eventType} to webhook → ${resp.status}`);
  } catch (err) {
    console.error(`${LOG} Failed to forward to webhook:`, err.message);
  }
}

// ── Handle call events ───────────────────────────────────
function handleCallEvent(call) {
  const statusValue = call.status?.value || "unknown";
  const mapped = mapCallStatus(statusValue);

  if (!mapped) return; // Ignore unmapped statuses

  const callId = call.id || call.globalCallId || "unknown";
  const contact = call.contact || {};
  const callerNumber =
    call.phoneNumber ||
    (contact.phoneNumbers && contact.phoneNumbers[0]?.number) ||
    "";
  const callerName = contact.displayName || "";

  console.log(`${LOG} Call event: ${statusValue} → ${mapped} | callId=${callId} caller=${callerNumber}`);

  forwardToWebhook(statusToEventType(mapped), {
    callId,
    callerNumber,
    calleeNumber: call.currentCalled?.number || "",
    callerName,
    status: mapped,
    cause: call.cause || "",
    deviceType: call.deviceType || "",
  });
}

// ── Dummy Express engine ─────────────────────────────────
// The SDK tries to create a local Express server for S2S callbacks,
// but we handle callbacks via our own Next.js route. Passing a no-op
// Express app avoids the path-to-regexp v8 incompatibility in Express 4.x.
function createNoopExpress() {
  const noop = () => noop;
  const app = function () {};
  app.use = noop;
  app.get = noop;
  app.post = noop;
  app.put = noop;
  app.delete = noop;
  app.all = noop;
  app.listen = (port, cb) => { if (cb) cb(); return { close: noop }; };
  app.set = noop;
  app.engine = noop;
  return app;
}

// ── Start SDK ────────────────────────────────────────────
async function start() {
  console.log(`${LOG} Starting Rainbow SDK in S2S mode...`);
  console.log(`${LOG} Host: ${HOST}, Callback: ${HOST_CALLBACK}`);

  const RainbowSDK = require("rainbow-node-sdk").default || require("rainbow-node-sdk");

  const sdk = new RainbowSDK({
    rainbow: { host: HOST, mode: "s2s" },
    s2s: {
      hostCallback: HOST_CALLBACK,
      locallistenningport: "0",
      expressEngine: createNoopExpress(),
    },
    credentials: { login: LOGIN, password: PASSWORD },
    application: { appID: APP_ID, appSecret: APP_SECRET },
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

  // Event listeners
  sdk.events.on("rainbow_onready", () => {
    console.log(`${LOG} SDK ready — callback registered at ${HOST_CALLBACK}`);
    // Log connected user info (including phone/extension)
    const user = sdk.connectedUser;
    if (user) {
      console.log(`${LOG} Connected as: ${user.displayName || user.loginEmail || "unknown"}`);
      console.log(`${LOG} User ID: ${user.id}`);
      console.log(`${LOG} Email: ${user.loginEmail}`);
      console.log(`${LOG} JID: ${user.jid_im}`);
      if (user.phoneNumbers && user.phoneNumbers.length > 0) {
        user.phoneNumbers.forEach((p) => {
          console.log(`${LOG} Phone: ${p.number} (${p.type || "unknown"} / ${p.deviceType || ""})`);
        });
      } else {
        console.log(`${LOG} No phone numbers found on this account`);
      }
      if (user.phonePbx) console.log(`${LOG} PBX phone: ${user.phonePbx}`);
      if (user.phoneInternalNumber) console.log(`${LOG} Internal/Extension: ${user.phoneInternalNumber}`);
    }
  });

  sdk.events.on("rainbow_onconnected", () => {
    console.log(`${LOG} SDK connected`);
  });

  sdk.events.on("rainbow_oncallupdated", (call) => {
    try {
      handleCallEvent(call);
    } catch (err) {
      console.error(`${LOG} Error processing call event:`, err);
    }
  });

  sdk.events.on("rainbow_onstopped", () => {
    console.warn(`${LOG} SDK stopped unexpectedly — restarting in 30s`);
    setTimeout(() => start(), 30000);
  });

  sdk.events.on("rainbow_onfailed", () => {
    console.error(`${LOG} SDK login failed — retrying in 30s`);
    setTimeout(() => start(), 30000);
  });

  sdk.events.on("rainbow_onconnectionerror", () => {
    console.error(`${LOG} Connection error`);
  });

  sdk.events.on("rainbow_onreconnecting", () => {
    console.log(`${LOG} Reconnecting...`);
  });

  try {
    await sdk.start();
    console.log(`${LOG} SDK started successfully`);
  } catch (err) {
    console.error(`${LOG} Failed to start SDK:`, err.message);
    console.log(`${LOG} Retrying in 30s...`);
    setTimeout(() => start(), 30000);
  }
}

// Wait a few seconds for Next.js server to be ready before starting
setTimeout(() => start(), 5000);
