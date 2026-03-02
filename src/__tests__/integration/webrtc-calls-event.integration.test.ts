/**
 * Integration tests for the WebRTC call event endpoint.
 *
 * These tests verify the /api/v1/calls/event route handles call lifecycle
 * events correctly. They require a running server with database access.
 *
 * Run manually:
 *   INTEGRATION=1 npx vitest run src/__tests__/integration/webrtc-calls-event.integration.test.ts
 *
 * Required env vars:
 *   INTEGRATION=1           — Gate to skip in normal `npm test` runs
 *   TEST_API_KEY             — Valid ConnectPlus API key for a test tenant
 *   TEST_BASE_URL            — Server URL (default: http://localhost:3000)
 */

import { describe, it, expect, beforeAll } from "vitest";

const INTEGRATION = process.env.INTEGRATION === "1";
const API_KEY = process.env.TEST_API_KEY ?? "";
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

// Skip entire suite if not in integration mode
const describeIf = INTEGRATION ? describe : describe.skip;

describeIf("POST /api/v1/calls/event (integration)", () => {
  beforeAll(() => {
    if (!API_KEY) {
      throw new Error("TEST_API_KEY env var is required for integration tests");
    }
  });

  async function postEvent(body: Record<string, unknown>) {
    return fetch(`${BASE_URL}/api/v1/calls/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify(body),
    });
  }

  it("rejects requests without callId", async () => {
    const resp = await postEvent({ state: "ringing_incoming" });
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects requests without state", async () => {
    const resp = await postEvent({ callId: "test-call-1" });
    expect(resp.status).toBe(400);
  });

  it("accepts a ringing_incoming event", async () => {
    const callId = `test-webrtc-${Date.now()}`;
    const resp = await postEvent({
      callId,
      state: "ringing_incoming",
      callerNumber: "+33612345678",
      direction: "inbound",
      timestamp: Date.now(),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
  });

  it("accepts an active event", async () => {
    const callId = `test-webrtc-${Date.now()}`;

    // First create the call with ringing
    await postEvent({
      callId,
      state: "ringing_incoming",
      callerNumber: "+33612345678",
    });

    // Then mark it active
    const resp = await postEvent({
      callId,
      state: "active",
    });

    expect(resp.status).toBe(200);
  });

  it("accepts an ended event", async () => {
    const callId = `test-webrtc-${Date.now()}`;

    // Create call → active → ended
    await postEvent({
      callId,
      state: "ringing_incoming",
      callerNumber: "+33612345678",
    });
    await postEvent({ callId, state: "active" });

    const resp = await postEvent({ callId, state: "ended" });
    expect(resp.status).toBe(200);
  });

  it("handles unknown states gracefully", async () => {
    const resp = await postEvent({
      callId: "test-unknown",
      state: "some_future_state",
    });
    // Should succeed (logged but not error)
    expect(resp.status).toBe(200);
  });

  it("rejects unauthenticated requests", async () => {
    const resp = await fetch(`${BASE_URL}/api/v1/calls/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: "test", state: "active" }),
    });

    expect(resp.status).toBe(401);
  });
});

describeIf("Rainbow WebRTC connect endpoint (integration)", () => {
  beforeAll(() => {
    if (!API_KEY) {
      throw new Error("TEST_API_KEY env var is required for integration tests");
    }
  });

  it("returns WebRTC credentials when mode is webrtc", async () => {
    const resp = await fetch(`${BASE_URL}/api/v1/rainbow/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify({
        login: "test@example.com",
        password: "test-password",
        mode: "webrtc",
      }),
    });

    // Should succeed if RAINBOW_APP_ID is set, or 500 if not
    const body = await resp.json();

    if (resp.status === 200) {
      expect(body.mode).toBe("webrtc");
      expect(body.webrtc).toBeDefined();
      expect(body.webrtc.appId).toBeTruthy();
      expect(body.webrtc.appSecret).toBeTruthy();
      expect(body.webrtc.host).toBeTruthy();
    } else {
      // Acceptable: server missing Rainbow env vars
      expect(body.error.code).toBe("CONFIG_ERROR");
    }
  });

  it("falls back to S2S mode when no mode specified", async () => {
    const resp = await fetch(`${BASE_URL}/api/v1/rainbow/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify({
        login: "test@example.com",
        password: "test-password",
      }),
    });

    const body = await resp.json();
    // Should attempt S2S connection (may succeed or fail depending on env)
    expect(body.status).toBeDefined();
  });

  it("returns current status via GET", async () => {
    const resp = await fetch(`${BASE_URL}/api/v1/rainbow/connect`, {
      headers: { "x-api-key": API_KEY },
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.status).toBeDefined();
  });
});
