"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RainbowCall,
  RainbowCallStatus,
  RainbowSDKInstance,
} from "@/types/rainbow-web-sdk";

// ── Public types ─────────────────────────────────────────

export type WebRTCStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "logged_in"
  | "error";

export type CallState =
  | "idle"
  | "ringing_incoming"
  | "ringing_outgoing"
  | "connecting"
  | "active"
  | "on_hold"
  | "ended";

export type MicPermission = "unknown" | "granted" | "denied" | "prompt" | "unsupported";

export interface CallQualityStats {
  /** Round-trip time in milliseconds */
  roundTripTime: number | null;
  /** Fraction of packets lost (0–1) */
  packetLoss: number | null;
  /** Jitter in seconds */
  jitter: number | null;
  /** Audio codec in use */
  codec: string | null;
  /** Signal quality: good / fair / poor, derived from stats */
  quality: "good" | "fair" | "poor" | "unknown";
}

export interface WebRTCCallInfo {
  callId: string;
  callerNumber: string;
  state: CallState;
  isMuted: boolean;
  isOnHold: boolean;
  startedAt: number | null;
}

export interface UseRainbowWebSDKReturn {
  status: WebRTCStatus;
  error: string | null;
  callState: CallState;
  currentCall: WebRTCCallInfo | null;
  micPermission: MicPermission;
  callQuality: CallQualityStats | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  checkMicPermission: () => Promise<MicPermission>;
  requestMicAccess: () => Promise<boolean>;
  initialize: (appId: string, appSecret: string, host: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  answer: () => void;
  reject: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
}

// ── Helper: map SDK status to our CallState ──────────────

function mapCallStatus(sdkStatus: string): CallState {
  const s = (sdkStatus || "").toLowerCase().replace(/_/g, "-");
  if (s.includes("ringing") && (s.includes("incom") || s.includes("incom"))) return "ringing_incoming";
  if (s.includes("ringing") && s.includes("out")) return "ringing_outgoing";
  if (s.includes("ringing")) return "ringing_incoming"; // default ringing = incoming
  if (s.includes("connecting") || s.includes("dialing")) return "connecting";
  if (s.includes("active") || s.includes("answered") || s.includes("connected")) return "active";
  if (s.includes("hold") || s.includes("held")) return "on_hold";
  if (s.includes("releasing") || s.includes("ended") || s.includes("cleared")) return "ended";
  if (s === "unknown" || s === "") return "idle";
  console.log("[WebRTC] Unknown call status:", sdkStatus);
  return "idle";
}

// ── Helper: derive quality label from stats ──────────────

function deriveQuality(stats: CallQualityStats): CallQualityStats["quality"] {
  const { roundTripTime, packetLoss, jitter } = stats;
  if (roundTripTime === null && packetLoss === null && jitter === null) return "unknown";

  const rttBad = roundTripTime !== null && roundTripTime > 300;
  const rttFair = roundTripTime !== null && roundTripTime > 150;
  const lossBad = packetLoss !== null && packetLoss > 0.05;
  const lossFair = packetLoss !== null && packetLoss > 0.01;
  const jitterBad = jitter !== null && jitter > 0.05;
  const jitterFair = jitter !== null && jitter > 0.02;

  if (rttBad || lossBad || jitterBad) return "poor";
  if (rttFair || lossFair || jitterFair) return "fair";
  return "good";
}

// ── Hook ─────────────────────────────────────────────────

export function useRainbowWebSDK(
  apiKey: string | null
): UseRainbowWebSDKReturn {
  const [status, setStatus] = useState<WebRTCStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [currentCall, setCurrentCall] = useState<WebRTCCallInfo | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermission>("unknown");
  const [callQuality, setCallQuality] = useState<CallQualityStats | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rawCallRef = useRef<RainbowCall | null>(null);
  const sdkRef = useRef<RainbowSDKInstance | null>(null);
  const qualityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track whether we already reported each state to the server
  const reportedStatesRef = useRef<Set<string>>(new Set());

  // ── Microphone permission ──────────────────────────────

  const checkMicPermission = useCallback(async (): Promise<MicPermission> => {
    if (typeof navigator === "undefined" || !navigator.permissions) {
      setMicPermission("unsupported");
      return "unsupported";
    }

    try {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
      const perm = result.state === "granted" ? "granted"
        : result.state === "denied" ? "denied"
        : "prompt";
      setMicPermission(perm);
      return perm;
    } catch {
      // Firefox doesn't support querying microphone permission
      setMicPermission("prompt");
      return "prompt";
    }
  }, []);

  const requestMicAccess = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setMicPermission("unsupported");
      setError("Microphone not available in this browser.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Got access — stop the test stream immediately
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
      return true;
    } catch (err) {
      setMicPermission("denied");
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access denied. Allow microphone in browser settings to use WebRTC.");
      } else {
        setError("Could not access microphone. Check your audio device.");
      }
      return false;
    }
  }, []);

  // ── Call quality polling ───────────────────────────────

  const startQualityPolling = useCallback(() => {
    if (qualityIntervalRef.current) return;

    qualityIntervalRef.current = setInterval(async () => {
      const call = rawCallRef.current;
      if (!call?.remoteMedia) return;

      try {
        const audioTrack = call.remoteMedia.getAudioTracks()[0];
        if (!audioTrack) return;

        const pc = call._peerConnection;
        if (!pc) return;

        const stats = await pc.getStats();
        let rtt: number | null = null;
        let loss: number | null = null;
        let jitter: number | null = null;
        let codec: string | null = null;

        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.nominated) {
            rtt = report.currentRoundTripTime ?? null;
          }
          if (report.type === "inbound-rtp" && report.kind === "audio") {
            jitter = report.jitter ?? null;
            if (report.packetsLost != null && report.packetsReceived != null) {
              const total = report.packetsLost + report.packetsReceived;
              loss = total > 0 ? report.packetsLost / total : 0;
            }
          }
          if (report.type === "codec" && report.mimeType?.startsWith("audio/")) {
            codec = report.mimeType.replace("audio/", "");
          }
        });

        const newStats: CallQualityStats = {
          roundTripTime: rtt !== null ? Math.round(rtt * 1000) : null,
          packetLoss: loss,
          jitter,
          codec,
          quality: "unknown",
        };
        newStats.quality = deriveQuality(newStats);

        setCallQuality(newStats);
      } catch {
        // Stats collection is best-effort
      }
    }, 3000);
  }, []);

  const stopQualityPolling = useCallback(() => {
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current);
      qualityIntervalRef.current = null;
    }
    setCallQuality(null);
  }, []);

  // ── Event forwarding to server ─────────────────────────

  const reportCallEvent = useCallback(
    async (callId: string, state: string, callerNumber?: string) => {
      const dedupKey = `${callId}:${state}`;
      if (reportedStatesRef.current.has(dedupKey)) return;
      reportedStatesRef.current.add(dedupKey);

      if (!apiKey) return;

      try {
        await fetch("/api/v1/calls/event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            callId,
            state,
            callerNumber,
            direction: "inbound",
            timestamp: Date.now(),
          }),
        });
      } catch {
        // Best-effort — don't break the call flow
      }
    },
    [apiKey]
  );

  // ── Audio stream attachment ────────────────────────────

  const attachRemoteAudio = useCallback((stream: MediaStream | undefined) => {
    if (!audioRef.current || !stream) return;
    audioRef.current.srcObject = stream;
    audioRef.current.play().catch(() => {
      // Autoplay may be blocked; user interaction usually unblocks it
    });
  }, []);

  // ── SDK call change handler ────────────────────────────

  const handleCallChanged = useCallback(
    (call: RainbowCall) => {
      rawCallRef.current = call;

      // v5 SDK may use different property names and status formats
      const callAny = call as unknown as Record<string, unknown>;
      const rawStatus = (callAny.status ?? callAny.state ?? "") as string;
      const newState = mapCallStatus(rawStatus);
      const callerNumber =
        (callAny.callerNumber as string) ??
        (callAny.callingPartyNumber as string) ??
        (callAny.remotePartyNumber as string) ??
        call.contact?.phoneNumbers?.[0]?.number ??
        (callAny.displayName as string) ??
        "";

      console.log("[WebRTC] Call state change:", { id: call.id, rawStatus, mapped: newState, caller: callerNumber });

      setCallState(newState);
      setCurrentCall({
        callId: call.id,
        callerNumber,
        state: newState,
        isMuted: call.isMuted,
        isOnHold: call.isOnHold,
        startedAt:
          newState === "active" ? Date.now() : null,
      });

      // Attach remote audio when call becomes active
      if (newState === "active" && call.remoteMedia) {
        attachRemoteAudio(call.remoteMedia);
        startQualityPolling();
      }

      // Forward events to server
      if (newState === "ringing_incoming") {
        reportCallEvent(call.id, "ringing_incoming", callerNumber);
      } else if (newState === "active") {
        reportCallEvent(call.id, "active", callerNumber);
      } else if (newState === "ended") {
        reportCallEvent(call.id, "ended", callerNumber);
        stopQualityPolling();
        // Clear call after a brief delay so UI can show "Call Ended"
        setTimeout(() => {
          setCallState("idle");
          setCurrentCall(null);
          rawCallRef.current = null;
          reportedStatesRef.current.clear();
        }, 4000);
      }
    },
    [attachRemoteAudio, reportCallEvent, startQualityPolling, stopQualityPolling]
  );

  // ── Initialize ─────────────────────────────────────────

  const initialize = useCallback(
    async (appId: string, appSecret: string, host: string) => {
      setStatus("initializing");
      setError(null);

      try {
        // Load Rainbow Web SDK v5 from CDN at runtime (browser only).
        // Not bundled via npm because the SDK's native `canvas` dep
        // breaks Alpine Docker builds.
        const CDN_URL = "https://cdn.jsdelivr.net/npm/rainbow-web-sdk@5.0.43-sts/lib/index.js";
        const rainbowModule = await (Function(`return import("${CDN_URL}")`)() as Promise<Record<string, unknown>>);
        const RainbowSDK = (rainbowModule.RainbowSDK ?? rainbowModule.default) as { create?: (config: Record<string, string>) => RainbowSDKInstance };

        console.log("[WebRTC] SDK module keys:", Object.keys(rainbowModule).filter(k => /plugin|call|telephony|sdk/i.test(k)));

        if (!RainbowSDK?.create) {
          throw new Error("Rainbow Web SDK module did not export RainbowSDK.create");
        }

        // Resolve plugin classes from the module — pass them directly
        const CallsPlugin = rainbowModule.CallsPlugin;
        const TelephonyPlugin = rainbowModule.TelephonyPlugin;

        const plugins: unknown[] = [];
        if (CallsPlugin) plugins.push(CallsPlugin);
        if (TelephonyPlugin) plugins.push(TelephonyPlugin);

        console.log("[WebRTC] Plugins:", plugins.length, { hasCalls: !!CallsPlugin, hasTelephony: !!TelephonyPlugin });

        // The SDK prepends https:// itself, so only pass the hostname.
        const serverURL = host === "official" ? "openrainbow.com"
          : host === "sandbox" ? "sandbox.openrainbow.com"
          : host.replace(/^https?:\/\//, "");

        const instance = RainbowSDK.create({
          appConfig: {
            server: serverURL,
            applicationId: appId,
            secretKey: appSecret,
          },
          plugins,
          autoLogin: false,
        } as never);

        console.log("[WebRTC] SDK instance created, calling start()...");
        const startResult = await instance.start();
        console.log("[WebRTC] SDK start() result:", startResult);
        console.log("[WebRTC] SDK version:", instance.getVersion?.());

        sdkRef.current = instance;
        // Also set on window for legacy compat / debugging
        window.rainbowSDK = instance;

        setStatus("ready");
      } catch (err) {
        setStatus("error");
        const msg = err instanceof Error ? err.message : "SDK initialization failed";
        setError(msg);
        // Re-throw so callers can catch it
        throw err;
      }
    },
    []
  );

  // ── Login ──────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string) => {
      let sdk = sdkRef.current;

      // If SDK wasn't initialized yet (e.g. initialize threw), bail with clear error
      if (!sdk) {
        const errMsg = "SDK not initialized — check browser console for initialization errors.";
        setError(errMsg);
        setStatus("error");
        throw new Error(errMsg);
      }

      // Check microphone access before login
      const micOk = await requestMicAccess();
      if (!micOk) {
        setStatus("error");
        return;
      }

      try {
        // Log available methods for debugging
        console.log("[WebRTC] SDK connectionService methods:",
          Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.connectionService))
            .filter(m => m !== "constructor"));
        console.log("[WebRTC] Attempting logon for:", email);

        await sdk.connectionService.logon(email, password, false);
        console.log("[WebRTC] Login successful");

        // Find and subscribe to all services that handle calls
        const sdkAny = sdk as unknown as Record<string, unknown>;
        let lastCallId = "";

        // Discover all services on the SDK instance (including private ones)
        const allKeys = new Set<string>();
        let proto = Object.getPrototypeOf(sdk);
        while (proto && proto !== Object.prototype) {
          Object.getOwnPropertyNames(proto).forEach(k => allKeys.add(k));
          proto = Object.getPrototypeOf(proto);
        }
        Object.keys(sdk).forEach(k => allKeys.add(k));

        const serviceKeys = [...allKeys].filter(k =>
          /service|webrtc|telephony|call/i.test(k) && k !== "constructor"
        );
        console.log("[WebRTC] Available service-like properties:", serviceKeys);

        // Subscribe to every service that has a subscribe method
        for (const key of serviceKeys) {
          try {
            const svc = sdkAny[key] as Record<string, unknown> | undefined;
            if (svc && typeof svc === "object" && typeof svc.subscribe === "function") {
              (svc.subscribe as Function)((event: { name: string; data: unknown }) => {
                console.log(`[WebRTC] ${key} event:`, event.name);
                if (event.data && typeof event.data === "object") {
                  handleCallChanged(event.data as RainbowCall);
                }
              });
              console.log(`[WebRTC] Subscribed to ${key}`);
            }
          } catch { /* skip inaccessible */ }
        }

        // Poll: scan SDK for any call objects every 1.5s
        const pollId = setInterval(() => {
          try {
            // Try callService.getActiveCall()
            const cs = sdk.callService as unknown as Record<string, unknown> | undefined;
            if (cs?.getActiveCall) {
              const c = (cs.getActiveCall as Function)();
              if (c && (c as Record<string, unknown>).id !== lastCallId) {
                lastCallId = (c as Record<string, unknown>).id as string;
                console.log("[WebRTC] Poll (getActiveCall):", c);
                handleCallChanged(c as RainbowCall);
                return;
              }
            }

            // Try webrtcP2P service calls array
            for (const key of serviceKeys) {
              const svc = sdkAny[key] as Record<string, unknown> | undefined;
              if (!svc) continue;

              // Look for getCalls, getActiveCalls, getRingingIncomingCalls, calls
              for (const method of ["getCalls", "getActiveCalls", "getRingingIncomingCalls"]) {
                if (typeof svc[method] === "function") {
                  const calls = (svc[method] as Function)() as unknown[];
                  if (calls?.length > 0) {
                    const c = calls[0] as Record<string, unknown>;
                    if (c.id !== lastCallId) {
                      lastCallId = c.id as string;
                      console.log(`[WebRTC] Poll (${key}.${method}):`, c);
                      // Force ringing status
                      if (!c.status) c.status = "ringing-incoming";
                      handleCallChanged(c as unknown as RainbowCall);
                      return;
                    }
                  }
                }
              }

              // Check raw 'calls' property (Map or array)
              if (svc.calls && typeof svc.calls === "object") {
                const callsObj = svc.calls as Record<string, unknown> | Map<string, unknown>;
                const entries = callsObj instanceof Map
                  ? [...callsObj.values()]
                  : Object.values(callsObj);
                for (const c of entries) {
                  const call = c as Record<string, unknown>;
                  if (call?.id && call.id !== lastCallId) {
                    lastCallId = call.id as string;
                    console.log("[WebRTC] Poll (calls map):", call);
                    if (!call.status) call.status = "ringing-incoming";
                    handleCallChanged(call as unknown as RainbowCall);
                    return;
                  }
                }
              }
            }
          } catch (err) {
            // Don't break the poll on errors
          }
        }, 1500);

        (sdkAny as Record<string, unknown>)._callPollId = pollId;
        console.log("[WebRTC] Call monitoring started (poll + subscribe)");

        setStatus("logged_in");
        setError(null);
      } catch (err) {
        console.error("[WebRTC] Login failed:", err);
        setStatus("error");
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Login failed: ${msg}`);
      }
    },
    [handleCallChanged, requestMicAccess]
  );

  // ── Logout ─────────────────────────────────────────────

  const logout = useCallback(async () => {
    const sdk = sdkRef.current;
    stopQualityPolling();

    if (sdk) {
      // Clear polling fallback
      const pollId = (sdk as unknown as Record<string, unknown>)._callPollId;
      if (pollId) clearInterval(pollId as ReturnType<typeof setInterval>);

      try {
        await sdk.stop();
      } catch {
        // Ignore stop errors
      }
    }

    sdkRef.current = null;
    window.rainbowSDK = undefined;

    setStatus("idle");
    setCallState("idle");
    setCurrentCall(null);
    rawCallRef.current = null;
    reportedStatesRef.current.clear();
  }, [stopQualityPolling]);

  // ── Call control ───────────────────────────────────────

  const answer = useCallback(() => {
    const sdk = sdkRef.current;
    const call = rawCallRef.current;
    if (!sdk || !call) return;
    sdk.callService.answerCall(call, false);
  }, []);

  const reject = useCallback(() => {
    const sdk = sdkRef.current;
    const call = rawCallRef.current;
    if (!sdk || !call) return;
    sdk.callService.releaseCall(call, "rejected");
  }, []);

  const hangup = useCallback(() => {
    const sdk = sdkRef.current;
    const call = rawCallRef.current;
    if (!sdk || !call) return;
    sdk.callService.releaseCall(call);
  }, []);

  const toggleMute = useCallback(() => {
    const sdk = sdkRef.current;
    const call = rawCallRef.current;
    if (!sdk || !call) return;
    sdk.callService.muteCall(call, !call.isMuted);
    setCurrentCall((prev) =>
      prev ? { ...prev, isMuted: !prev.isMuted } : null
    );
  }, []);

  const toggleHold = useCallback(() => {
    const sdk = sdkRef.current;
    const call = rawCallRef.current;
    if (!sdk || !call) return;
    if (call.isOnHold) {
      sdk.callService.retrieveCall(call);
    } else {
      sdk.callService.holdCall(call);
    }
    setCurrentCall((prev) =>
      prev ? { ...prev, isOnHold: !prev.isOnHold } : null
    );
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────

  useEffect(() => {
    return () => {
      stopQualityPolling();
      const sdk = sdkRef.current;
      if (sdk) {
        sdk.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    error,
    callState,
    currentCall,
    micPermission,
    callQuality,
    audioRef,
    checkMicPermission,
    requestMicAccess,
    initialize,
    login,
    logout,
    answer,
    reject,
    hangup,
    toggleMute,
    toggleHold,
  };
}
