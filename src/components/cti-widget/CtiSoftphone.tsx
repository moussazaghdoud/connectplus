"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DialPad } from "./DialPad";
import { ActiveCallPanel } from "./ActiveCallPanel";
import { RecentCalls } from "./RecentCalls";
import type { ScreenPopData } from "./ScreenPopup";
import { CallWrapUp } from "./CallWrapUp";
import { useRainbowWebSDK } from "@/hooks/useRainbowWebSDK";
import type { CtiCallEvent } from "@/lib/cti/types/call-event";

type Tab = "phone" | "active" | "recent";
type RainbowStatus = "disconnected" | "connecting" | "connected" | "error";

interface Props {
  agentId: string;
  agentEmail: string;
  tenantId: string;
}

interface ActiveCall {
  callId: string;
  correlationId: string;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  state: string;
  crmContext?: {
    recordId?: string;
    module?: string;
    displayName?: string;
    company?: string;
  };
  startedAt: string;
  isMuted: boolean;
  isOnHold: boolean;
}

export function CtiSoftphone({ agentId, agentEmail, tenantId }: Props) {
  const [tab, setTab] = useState<Tab>("phone");
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [recentCalls, setRecentCalls] = useState<CtiCallEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenPop, setScreenPop] = useState<ScreenPopData | null>(null);
  const [wrapUp, setWrapUp] = useState<{
    correlationId: string;
    direction: string;
    phone: string;
    contactName?: string;
    duration: number;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);

  // Rainbow connection state
  const [rbLogin, setRbLogin] = useState("");
  const [rbPassword, setRbPassword] = useState("");
  const [rbStatus, setRbStatus] = useState<RainbowStatus>("disconnected");
  const [rbError, setRbError] = useState("");
  const [showRbPopup, setShowRbPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const webrtc = useRainbowWebSDK(null);

  // Keep ref in sync with state
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Load saved Rainbow login from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("connectplus_rb_login");
    if (saved) setRbLogin(saved);
  }, []);

  // Close popup on outside click
  useEffect(() => {
    if (!showRbPopup) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowRbPopup(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showRbPopup]);

  // Check Rainbow status on mount
  useEffect(() => {
    fetch("/api/v1/rainbow/connect", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.session?.status === "connected") {
          setRbStatus("connected");
        }
      })
      .catch(() => {});
  }, []);

  // Sync WebRTC errors
  useEffect(() => {
    if (webrtc.error) {
      setRbError(webrtc.error);
      if (webrtc.status === "error") setRbStatus("error");
    }
  }, [webrtc.error, webrtc.status]);

  const connectRainbow = useCallback(async () => {
    setRbStatus("connecting");
    setRbError("");
    localStorage.setItem("connectplus_rb_login", rbLogin);
    try {
      const resp = await fetch("/api/v1/rainbow/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: rbLogin, password: rbPassword, mode: "webrtc" }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setRbStatus("error");
        setRbError(data.error?.message || `HTTP ${resp.status}`);
        return;
      }
      if (!data.webrtc) {
        setRbStatus("error");
        setRbError("Server did not return WebRTC credentials");
        return;
      }
      await webrtc.initialize(data.webrtc.appId, data.webrtc.appSecret, data.webrtc.host);
      await webrtc.login(rbLogin, rbPassword);
      setRbStatus("connected");
      setShowRbPopup(false);
    } catch (err) {
      setRbStatus("error");
      setRbError(err instanceof Error ? err.message : "Connection failed");
    }
  }, [rbLogin, rbPassword, webrtc]);

  const disconnectRainbow = useCallback(async () => {
    await webrtc.logout();
    try {
      await fetch("/api/v1/rainbow/connect", { method: "DELETE", credentials: "include" });
    } catch {}
    setRbStatus("disconnected");
    setRbError("");
  }, [webrtc]);

  const handleCallEvent = useCallback((event: CtiCallEvent) => {
    if (event.state === "ringing" || event.state === "connected" || event.state === "held") {
      setActiveCall({
        callId: event.callId,
        correlationId: event.correlationId,
        direction: event.direction,
        fromNumber: event.fromNumber,
        toNumber: event.toNumber,
        state: event.state,
        crmContext: event.crmContext,
        startedAt: event.timestamp,
        isMuted: false,
        isOnHold: event.state === "held",
      });
      setTab("active");
    } else if (event.state === "ended" || event.state === "missed" || event.state === "failed") {
      const endedCall = activeCallRef.current;
      setActiveCall(null);
      setRecentCalls((prev) => [event, ...prev].slice(0, 20));

      // Show wrap-up panel after call ends
      if (endedCall) {
        const phone = endedCall.direction === "inbound" ? endedCall.fromNumber : endedCall.toNumber;
        const startMs = new Date(endedCall.startedAt).getTime();
        const duration = Math.max(0, Math.round((Date.now() - startMs) / 1000));
        setWrapUp({
          correlationId: endedCall.correlationId,
          direction: endedCall.direction,
          phone,
          contactName: endedCall.crmContext?.displayName,
          duration,
        });
      }
      setTab("phone");
    }
  }, []);

  // Connect to CTI SSE stream
  useEffect(() => {
    const es = new EventSource(`/api/v1/cti/stream?agentId=${agentId}`);
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setConnected(true);
      setError(null);
    });

    es.addEventListener("state.sync", (e) => {
      const data = JSON.parse(e.data);
      if (data.activeCalls?.length > 0) {
        const call = data.activeCalls[0];
        setActiveCall(call);
        setTab("active");
      }
    });

    es.addEventListener("call.event", (e) => {
      const event: CtiCallEvent = JSON.parse(e.data);
      console.log("[CTI] call.event received:", event);
      handleCallEvent(event);
    });

    es.addEventListener("screen_pop", (e) => {
      const data: ScreenPopData = JSON.parse(e.data);
      console.log("[CTI] screen_pop received:", data);
      setScreenPop(data);
    });

    es.addEventListener("heartbeat", () => {
      setConnected(true);
    });

    es.onerror = () => {
      setConnected(false);
      setError("Connection lost. Reconnecting...");
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [agentId, handleCallEvent]);

  const callAction = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      try {
        const res = await fetch(`/api/v1/cti/call/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ agentId, ...body }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Action failed: ${action}`);
        }
      } catch {
        setError(`Failed to ${action}`);
      }
    },
    [agentId]
  );

  const handleDial = useCallback(
    (number: string) => {
      callAction("start", { number });
    },
    [callAction]
  );

  // BroadcastChannel to communicate with /widget tab for real Rainbow call control
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    channelRef.current = new BroadcastChannel("connectplus-cti");
    return () => { channelRef.current?.close(); };
  }, []);

  const handleAnswer = useCallback(() => {
    if (activeCall) {
      // Use local WebRTC SDK if connected, otherwise relay to /widget via BroadcastChannel
      if (rbStatus === "connected") {
        webrtc.answer();
      } else {
        channelRef.current?.postMessage({ action: "answer", callId: activeCall.callId });
      }
      callAction("answer", { callId: activeCall.callId });
    }
  }, [activeCall, callAction, rbStatus, webrtc]);

  const handleHangup = useCallback(() => {
    if (activeCall) {
      if (rbStatus === "connected") {
        webrtc.hangup();
      } else {
        channelRef.current?.postMessage({ action: "hangup", callId: activeCall.callId });
      }
      callAction("hangup", { callId: activeCall.callId });
    }
  }, [activeCall, callAction, rbStatus, webrtc]);

  const handleHold = useCallback(() => {
    if (activeCall)
      callAction("hold", {
        callId: activeCall.callId,
        on: !activeCall.isOnHold,
      });
  }, [activeCall, callAction]);

  const handleMute = useCallback(() => {
    if (activeCall) {
      callAction("mute", {
        callId: activeCall.callId,
        on: !activeCall.isMuted,
      });
      setActiveCall((prev) =>
        prev ? { ...prev, isMuted: !prev.isMuted } : null
      );
    }
  }, [activeCall, callAction]);

  const handleTransfer = useCallback(
    (target: string) => {
      if (activeCall)
        callAction("transfer", { callId: activeCall.callId, target });
    },
    [activeCall, callAction]
  );

  const handleDtmf = useCallback(
    (digits: string) => {
      if (activeCall)
        callAction("dtmf", { callId: activeCall.callId, digits });
    },
    [activeCall, callAction]
  );

  const handleWrapUpSave = useCallback(
    async (notes: string, disposition: string) => {
      if (!wrapUp) return;
      try {
        await fetch("/api/v1/cti/call-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            correlationId: wrapUp.correlationId,
            notes,
            disposition,
          }),
        });
      } catch {
        // Best effort
      }
      setWrapUp(null);
    },
    [wrapUp]
  );

  const rbDotColor = {
    disconnected: "bg-gray-400",
    connecting: "bg-yellow-400 animate-pulse",
    connected: "bg-green-400",
    error: "bg-red-400",
  }[rbStatus];

  return (
    <div className="flex flex-col h-screen w-full max-w-sm mx-auto bg-white relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
            R
          </div>
          <span className="text-sm font-semibold">Rainbow CTI</span>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowRbPopup(!showRbPopup)}
            className="flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <div className={`w-2.5 h-2.5 rounded-full ${rbDotColor}`} />
            <span className="text-xs opacity-90">{agentEmail}</span>
          </button>

          {/* Rainbow login popup */}
          {showRbPopup && (
            <div
              ref={popupRef}
              className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50"
            >
              {rbStatus === "connected" ? (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="text-sm text-gray-700 font-medium">Connected</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3 truncate">{rbLogin}</p>
                  <button
                    onClick={() => { disconnectRainbow(); setShowRbPopup(false); }}
                    className="w-full py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors border border-red-200"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => { e.preventDefault(); connectRainbow(); }}
                  className="p-4 space-y-3"
                >
                  <p className="text-sm font-medium text-gray-700">Rainbow Login</p>
                  <input
                    type="email"
                    value={rbLogin}
                    onChange={(e) => setRbLogin(e.target.value)}
                    placeholder="Rainbow email"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="password"
                    value={rbPassword}
                    onChange={(e) => setRbPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {rbError && (
                    <p className="text-xs text-red-500">{rbError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={rbStatus === "connecting" || !rbLogin.trim() || !rbPassword.trim()}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {rbStatus === "connecting" ? "Connecting..." : "Connect"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hidden audio element for WebRTC */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={webrtc.audioRef} autoPlay style={{ display: "none" }} />

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200">
          <p className="text-xs text-red-600">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-400 underline mt-0.5"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b">
        {(
          [
            { id: "phone" as Tab, label: "Dial", icon: "📞" },
            {
              id: "active" as Tab,
              label: "Active",
              icon: "🔔",
              badge: activeCall ? 1 : 0,
            },
            { id: "recent" as Tab, label: "Recent", icon: "📋" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-medium relative ${
              tab === t.id
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
            {"badge" in t && t.badge > 0 && (
              <span className="absolute top-1 right-1/4 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Call wrap-up panel (shown after call ends) */}
        {wrapUp && tab === "phone" && (
          <CallWrapUp
            correlationId={wrapUp.correlationId}
            direction={wrapUp.direction}
            phone={wrapUp.phone}
            contactName={wrapUp.contactName}
            duration={wrapUp.duration}
            onSave={handleWrapUpSave}
            onDismiss={() => setWrapUp(null)}
          />
        )}
        {tab === "phone" && !wrapUp && <DialPad onDial={handleDial} onDtmf={handleDtmf} hasActiveCall={!!activeCall} />}
        {tab === "active" && (
          <ActiveCallPanel
            call={activeCall}
            onAnswer={handleAnswer}
            onHangup={handleHangup}
            onHold={handleHold}
            onMute={handleMute}
            onTransfer={handleTransfer}
            onDtmf={handleDtmf}
          />
        )}
        {tab === "recent" && (
          <RecentCalls calls={recentCalls} onClickToCall={handleDial} />
        )}
      </div>
    </div>
  );
}
