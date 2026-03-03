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

function mapCallStatus(sdkStatus: RainbowCallStatus): CallState {
  switch (sdkStatus) {
    case "ringing-incoming":
      return "ringing_incoming";
    case "ringing-outgoing":
      return "ringing_outgoing";
    case "connecting":
      return "connecting";
    case "active":
      return "active";
    case "on-hold":
      return "on_hold";
    case "releasing":
    case "unknown":
    case "Unknown":
      return "ended";
    default:
      return "idle";
  }
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

      const newState = mapCallStatus(call.status);
      const callerNumber =
        call.callerNumber ??
        call.contact?.phoneNumbers?.[0]?.number ??
        "";

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

        console.log("[WebRTC] SDK module keys:", Object.keys(rainbowModule));

        if (!RainbowSDK?.create) {
          throw new Error("Rainbow Web SDK module did not export RainbowSDK.create. Keys: " + Object.keys(rainbowModule).join(", "));
        }

        // Map short host names to Rainbow server hostnames.
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
        setError(err instanceof Error ? err.message : "SDK initialization failed");
      }
    },
    []
  );

  // ── Login ──────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string) => {
      const sdk = sdkRef.current;
      if (!sdk) {
        setError("SDK not initialized. Call initialize() first.");
        setStatus("error");
        return;
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

        // Subscribe to call events via the callService
        sdk.callService.subscribe((event) => {
          if (event.name === "callChanged" || event.name === "callUpdated") {
            handleCallChanged(event.data as RainbowCall);
          }
        });

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
