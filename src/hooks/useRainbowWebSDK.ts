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
  makeCall: (phoneNumber: string) => Promise<void>;
}

// ── Helper: map SDK status to our CallState ──────────────

function mapCallStatus(sdkStatus: string): CallState {
  const s = (sdkStatus || "").toLowerCase().replace(/_/g, "-");
  if (s === "incommingcall" || s === "incomingcall") return "ringing_incoming";
  if (s.includes("ringing") && (s.includes("incom") || s.includes("incom"))) return "ringing_incoming";
  if (s.includes("ringing") && s.includes("out")) return "ringing_outgoing";
  if (s.includes("ringing")) return "ringing_incoming";
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
      // v5 SDK events may send Conversation objects instead of Call objects.
      // Extract the actual call from nested structures.
      const data = call as unknown as Record<string, unknown>;
      const actualCall = (
        (data.call as Record<string, unknown>) ??         // { call: CallRB }
        (data.activeCall as Record<string, unknown>) ??   // { activeCall: CallRB }
        (data.webrtcCall as Record<string, unknown>) ??   // { webrtcCall: CallRB }
        data                                               // direct call object
      );

      rawCallRef.current = actualCall as unknown as RainbowCall;

      const rawStatus = (
        (actualCall.status as string) ??
        (actualCall.state as string) ??
        (actualCall.callStatus as string) ??
        (data.status as string) ??
        ""
      );

      // If no status found but we have an id, assume ringing
      let newState = mapCallStatus(rawStatus);
      if (newState === "idle" && (actualCall.id || data.id)) {
        newState = "ringing_incoming";
      }

      const callerNumber =
        (actualCall.callerNumber as string) ??
        (actualCall.callingPartyNumber as string) ??
        (actualCall.remotePartyNumber as string) ??
        (actualCall.displayName as string) ??
        ((actualCall.contact as Record<string, unknown>)?.phoneNumbers as Array<{number: string}>)?.[0]?.number ??
        (data.callerNumber as string) ??
        "";

      const callId = (actualCall.id as string) ?? (data.id as string) ?? `call-${Date.now()}`;

      console.log("[WebRTC] Call state change:", { callId, rawStatus, mapped: newState, caller: callerNumber, keys: Object.keys(actualCall).slice(0, 15) });

      setCallState(newState);
      setCurrentCall({
        callId,
        callerNumber,
        state: newState,
        isMuted: !!(actualCall.isMuted ?? actualCall.muted),
        isOnHold: !!(actualCall.isOnHold ?? actualCall.held),
        startedAt:
          newState === "active" ? Date.now() : null,
      });

      // Attach remote audio when call becomes active
      const remoteMedia = (actualCall.remoteMedia ?? actualCall.remoteStream) as MediaStream | undefined;
      if (newState === "active" && remoteMedia) {
        attachRemoteAudio(remoteMedia);
        startQualityPolling();
      }

      // Forward events to server
      if (newState === "ringing_incoming") {
        reportCallEvent(callId, "ringing_incoming", callerNumber);
      } else if (newState === "active") {
        reportCallEvent(callId, "active", callerNumber);
      } else if (newState === "ended") {
        reportCallEvent(callId, "ended", callerNumber);
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

        // Subscribe to conversationService for call events — the official pattern
        // from Rainbow-CPaaS/Rainbow-Web-SDK-Samples-v2.
        // The call object from conversation.call has proper internal state and
        // can be answered with call.answer().
        const convSvc = sdkAny.conversationService as Record<string, unknown> | undefined;
        if (convSvc?.subscribe) {
          (convSvc.subscribe as Function)(
            (event: { name: string; data: Record<string, unknown> }) => {
              try {
                const conv = event.data?.conversation as Record<string, unknown> | undefined;
                const call = conv?.call as Record<string, unknown> | undefined;

                if (event.name === "ON_NEW_CALL_IN_CONVERSATION" && call) {
                  const statusVal = call.callStatus ?? call.status ?? "";
                  const rawStatus = typeof statusVal === "object" && statusVal !== null
                    ? String((statusVal as Record<string, unknown>).value ?? "")
                    : String(statusVal);
                  const mapped = mapCallStatus(rawStatus);
                  const state = mapped === "idle" ? "ringing_incoming" : mapped;
                  const contact = call.contact as Record<string, unknown> | undefined;
                  const caller = String(contact?.displayName ?? call.callerNumber ?? "");
                  const cid = String(call.id ?? conv?.id ?? `call-${Date.now()}`);

                  console.log("[WebRTC] NEW CALL via conversation:", {
                    id: cid, rawStatus, state, caller,
                    hasAnswer: typeof call.answer === "function",
                    capabilities: call.capabilities,
                  });

                  // Store the CONVERSATION call — this one can be answered
                  rawCallRef.current = call as unknown as RainbowCall;
                  lastCallId = cid;
                  setCallState(state as CallState);
                  setCurrentCall({
                    callId: cid,
                    callerNumber: caller,
                    state: state as CallState,
                    isMuted: false,
                    isOnHold: false,
                    startedAt: state === "active" ? Date.now() : null,
                  });
                  reportCallEvent(cid, "ringing_incoming", caller);

                  // Subscribe to call-level events for status updates
                  if (typeof call.subscribe === "function") {
                    (call.subscribe as Function)((ce: { name: string }) => {
                      const c = conv?.call as Record<string, unknown> | undefined;
                      if (!c) return;
                      const sv = c.callStatus ?? c.status ?? "";
                      const rs = typeof sv === "object" ? String((sv as Record<string, unknown>).value ?? "") : String(sv);
                      const ns = mapCallStatus(rs);
                      console.log("[WebRTC] Call update:", rs, "→", ns);

                      rawCallRef.current = c as unknown as RainbowCall;
                      setCallState(ns);
                      setCurrentCall(prev => prev ? {
                        ...prev, state: ns,
                        isMuted: !!(c.isMuted ?? c.muted),
                        isOnHold: !!(c.isOnHold ?? c.held),
                        startedAt: ns === "active" && !prev.startedAt ? Date.now() : prev.startedAt,
                      } : null);
                      if (ns === "active") reportCallEvent(cid, "active", caller);
                    });
                  }
                }

                if (event.name === "ON_REMOVE_CALL_IN_CONVERSATION") {
                  console.log("[WebRTC] Call removed");
                  reportCallEvent(lastCallId, "ended", "");
                  lastCallId = "";
                  setCallState("ended");
                  setCurrentCall(prev => prev ? { ...prev, state: "ended" } : null);
                  setTimeout(() => {
                    setCallState("idle");
                    setCurrentCall(null);
                    rawCallRef.current = null;
                    reportedStatesRef.current.clear();
                  }, 4000);
                }
              } catch (err) {
                console.error("[WebRTC] Event handler error:", err);
              }
            },
            ["ON_NEW_CALL_IN_CONVERSATION", "ON_REMOVE_CALL_IN_CONVERSATION"]
          );
          console.log("[WebRTC] Subscribed to conversationService (official pattern)");
        } else {
          console.warn("[WebRTC] conversationService not available");
        }

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

  const answer = useCallback(async () => {
    const call = rawCallRef.current;
    const callAny = call as unknown as Record<string, unknown> | null;
    console.log("[WebRTC] Answer clicked", {
      hasCall: !!call,
      hasAnswer: typeof callAny?.answer === "function",
      capabilities: callAny?.capabilities,
    });
    if (!callAny) return;

    // Official pattern: call.answer() on the conversation's call object
    if (typeof callAny.answer === "function") {
      try {
        await (callAny.answer as (withVideo?: boolean) => Promise<void>)(false);
        console.log("[WebRTC] call.answer() succeeded!");
      } catch (e) {
        console.error("[WebRTC] call.answer() failed:", e);
      }
    } else {
      console.error("[WebRTC] No answer() method on call object");
    }
  }, []);

  const reject = useCallback(async () => {
    const callAny = rawCallRef.current as unknown as Record<string, unknown> | null;
    if (!callAny) return;
    console.log("[WebRTC] Reject clicked");
    try {
      if (typeof callAny.release === "function") {
        await (callAny.release as () => Promise<void>)();
      } else if (typeof callAny.decline === "function") {
        await (callAny.decline as () => Promise<void>)();
      }
    } catch (e) { console.warn("[WebRTC] reject failed:", e); }
  }, []);

  const hangup = useCallback(async () => {
    const callAny = rawCallRef.current as unknown as Record<string, unknown> | null;
    if (!callAny) return;
    console.log("[WebRTC] Hangup clicked");
    try {
      if (typeof callAny.release === "function") {
        await (callAny.release as () => Promise<void>)();
      }
    } catch (e) { console.warn("[WebRTC] hangup failed:", e); }
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

  // ── Click-to-Call ───────────────────────────────────────

  const makeCall = useCallback(async (phoneNumber: string) => {
    const sdk = sdkRef.current;
    if (!sdk) {
      console.error("[WebRTC] Cannot make call — SDK not initialized");
      return;
    }
    console.log("[WebRTC] Making call to:", phoneNumber);
    try {
      const cs = sdk.callService as unknown as Record<string, unknown>;
      if (typeof cs.makePhoneCall === "function") {
        await (cs.makePhoneCall as (n: string) => Promise<void>)(phoneNumber);
        console.log("[WebRTC] makePhoneCall initiated");
      } else {
        console.error("[WebRTC] callService.makePhoneCall not available");
      }
    } catch (err) {
      console.error("[WebRTC] makePhoneCall failed:", err);
    }
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
    makeCall,
  };
}
