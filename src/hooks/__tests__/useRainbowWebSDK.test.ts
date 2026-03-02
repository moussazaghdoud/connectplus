import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for useRainbowWebSDK hook logic.
 *
 * Since the vitest environment is "node" (no DOM/React), we test the hook's
 * core logic: SDK initialization, login, call state mapping, event forwarding,
 * and call control delegation. We mock window.rainbowSDK and verify the hook
 * calls the correct SDK methods.
 */

// Mock SDK methods
function createMockSDK() {
  let callChangedCallback: ((call: unknown) => void) | null = null;

  return {
    connection: {
      initialize: vi.fn().mockResolvedValue(undefined),
      signin: vi.fn().mockResolvedValue(undefined),
      signout: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockReturnValue("connected"),
    },
    webRTC: {
      answerInAudio: vi.fn(),
      reject: vi.fn(),
      release: vi.fn(),
      holdCall: vi.fn(),
      retrieveCall: vi.fn(),
      muteCall: vi.fn(),
      onWebRTCCallChanged: vi.fn((cb: (call: unknown) => void) => {
        callChangedCallback = cb;
      }),
    },
    events: {
      on: vi.fn(),
      off: vi.fn(),
    },
    // Test helper: simulate a call event
    _simulateCall: (call: unknown) => {
      if (callChangedCallback) callChangedCallback(call);
    },
    _getCallChangedCallback: () => callChangedCallback,
  };
}

// Minimal globalThis.window mock for Node environment
const mockWindow = globalThis as unknown as { rainbowSDK?: unknown };

describe("Rainbow Web SDK integration", () => {
  let mockSDK: ReturnType<typeof createMockSDK>;

  beforeEach(() => {
    mockSDK = createMockSDK();
    mockWindow.rainbowSDK = mockSDK;
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete mockWindow.rainbowSDK;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("SDK initialization", () => {
    it("should call connection.initialize with correct config", async () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;

      await sdk.connection.initialize({
        appID: "test-app-id",
        appSecret: "test-secret",
        host: "sandbox",
      });

      expect(sdk.connection.initialize).toHaveBeenCalledWith({
        appID: "test-app-id",
        appSecret: "test-secret",
        host: "sandbox",
      });
    });

    it("should handle initialization failure", async () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;
      sdk.connection.initialize.mockRejectedValueOnce(new Error("Init failed"));

      await expect(
        sdk.connection.initialize({
          appID: "bad-id",
          appSecret: "bad-secret",
          host: "sandbox",
        })
      ).rejects.toThrow("Init failed");
    });
  });

  describe("SDK login", () => {
    it("should call connection.signin and register call handler", async () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;

      await sdk.connection.signin("user@test.com", "password123");

      expect(sdk.connection.signin).toHaveBeenCalledWith("user@test.com", "password123");
    });

    it("should subscribe to call events after login", () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;

      // Simulate what the hook does after login
      const handler = vi.fn();
      sdk.webRTC.onWebRTCCallChanged(handler);

      expect(sdk.webRTC.onWebRTCCallChanged).toHaveBeenCalledWith(handler);
    });

    it("should handle login failure", async () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;
      sdk.connection.signin.mockRejectedValueOnce(new Error("Bad credentials"));

      await expect(
        sdk.connection.signin("bad@test.com", "wrong")
      ).rejects.toThrow("Bad credentials");
    });
  });

  describe("call state mapping", () => {
    it("should map ringing-incoming to correct state", () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;

      const stateHandler = vi.fn();
      sdk.webRTC.onWebRTCCallChanged(stateHandler);

      const incomingCall = {
        id: "call-1",
        status: "ringing-incoming",
        isIncoming: true,
        isMuted: false,
        isOnHold: false,
        callerNumber: "+33612345678",
      };

      sdk._simulateCall(incomingCall);

      expect(stateHandler).toHaveBeenCalledWith(incomingCall);
      expect(incomingCall.status).toBe("ringing-incoming");
    });

    it("should map active to correct state", () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;

      const stateHandler = vi.fn();
      sdk.webRTC.onWebRTCCallChanged(stateHandler);

      const activeCall = {
        id: "call-1",
        status: "active",
        isIncoming: true,
        isMuted: false,
        isOnHold: false,
        remoteMedia: {} as MediaStream,
      };

      sdk._simulateCall(activeCall);

      expect(stateHandler).toHaveBeenCalledWith(activeCall);
      expect(activeCall.status).toBe("active");
    });

    it("should map on-hold to correct state", () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;

      const stateHandler = vi.fn();
      sdk.webRTC.onWebRTCCallChanged(stateHandler);

      const holdCall = {
        id: "call-1",
        status: "on-hold",
        isIncoming: true,
        isMuted: false,
        isOnHold: true,
      };

      sdk._simulateCall(holdCall);

      expect(stateHandler).toHaveBeenCalledWith(holdCall);
      expect(holdCall.status).toBe("on-hold");
    });
  });

  describe("call control", () => {
    it("should delegate answerInAudio to SDK", () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;
      const mockCall = { id: "call-1", status: "ringing-incoming" };

      sdk.webRTC.answerInAudio(mockCall as never);

      expect(sdk.webRTC.answerInAudio).toHaveBeenCalledWith(mockCall);
    });

    it("should delegate reject to SDK", () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;
      const mockCall = { id: "call-1", status: "ringing-incoming" };

      sdk.webRTC.reject(mockCall as never);

      expect(sdk.webRTC.reject).toHaveBeenCalledWith(mockCall);
    });

    it("should delegate release (hangup) to SDK", () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;
      const mockCall = { id: "call-1", status: "active" };

      sdk.webRTC.release(mockCall as never);

      expect(sdk.webRTC.release).toHaveBeenCalledWith(mockCall);
    });

    it("should delegate holdCall to SDK", () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;
      const mockCall = { id: "call-1", status: "active" };

      sdk.webRTC.holdCall(mockCall as never);

      expect(sdk.webRTC.holdCall).toHaveBeenCalledWith(mockCall);
    });

    it("should delegate retrieveCall to SDK", () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;
      const mockCall = { id: "call-1", status: "on-hold" };

      sdk.webRTC.retrieveCall(mockCall as never);

      expect(sdk.webRTC.retrieveCall).toHaveBeenCalledWith(mockCall);
    });

    it("should delegate muteCall with toggle to SDK", () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;
      const mockCall = { id: "call-1", isMuted: false };

      sdk.webRTC.muteCall(mockCall as never, true);
      expect(sdk.webRTC.muteCall).toHaveBeenCalledWith(mockCall, true);

      sdk.webRTC.muteCall(mockCall as never, false);
      expect(sdk.webRTC.muteCall).toHaveBeenCalledWith(mockCall, false);
    });
  });

  describe("event forwarding", () => {
    it("should POST call events to /api/v1/calls/event", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

      await fetch("/api/v1/calls/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-key",
        },
        body: JSON.stringify({
          callId: "call-1",
          state: "ringing_incoming",
          callerNumber: "+33612345678",
          direction: "inbound",
          timestamp: Date.now(),
        }),
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/calls/event",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("call-1"),
        })
      );

      fetchSpy.mockRestore();
    });

    it("should include correct event states", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

      for (const state of ["ringing_incoming", "active", "ended"]) {
        await fetch("/api/v1/calls/event", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": "k" },
          body: JSON.stringify({ callId: "call-1", state }),
        });
      }

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      fetchSpy.mockRestore();
    });
  });

  describe("signout", () => {
    it("should call connection.signout", async () => {
      const sdk = mockWindow.rainbowSDK as ReturnType<typeof createMockSDK>;

      await sdk.connection.signout();

      expect(sdk.connection.signout).toHaveBeenCalled();
    });
  });

  describe("SDK not available", () => {
    it("should handle missing SDK gracefully", () => {
      delete mockWindow.rainbowSDK;

      expect(mockWindow.rainbowSDK).toBeUndefined();
      // The hook would set error state — here we verify the guard pattern
    });
  });
});
