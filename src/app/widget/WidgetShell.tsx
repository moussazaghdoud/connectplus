"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CallNotification,
  type CallNotificationData,
} from "@/components/screen-pop/CallNotification";
import { SoftphoneControls } from "@/components/screen-pop/SoftphoneControls";
import { useRainbowWebSDK } from "@/hooks/useRainbowWebSDK";
import { CallHistory } from "./CallHistory";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
type RainbowStatus = "disconnected" | "connecting" | "connected" | "error";
type RainbowMode = "s2s" | "webrtc";
type Tab = "calls" | "history";

interface WidgetUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantSlug: string;
}

export function WidgetShell({ user }: { user: WidgetUser }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [calls, setCalls] = useState<Map<string, CallNotificationData>>(
    new Map()
  );
  const eventSourceRef = useRef<EventSource | null>(null);

  // Rainbow state
  const [rbLogin, setRbLogin] = useState("");
  const [rbPassword, setRbPassword] = useState("");
  const [rbStatus, setRbStatus] = useState<RainbowStatus>("disconnected");
  const [rbError, setRbError] = useState("");
  const [rbConnectedAs, setRbConnectedAs] = useState("");
  const [rbMode, setRbMode] = useState<RainbowMode>("s2s");

  // Refs to avoid stale closures in EventSource listeners
  const rbModeRef = useRef(rbMode);
  const rbStatusRef = useRef(rbStatus);
  rbModeRef.current = rbMode;
  rbStatusRef.current = rbStatus;

  // Tab
  const [activeTab, setActiveTab] = useState<Tab>("calls");

  // Resolved contact for WebRTC mode (populated from server-side CRM lookup via SSE)
  const [resolvedContact, setResolvedContact] = useState<{
    displayName?: string;
    company?: string;
    crmUrl?: string;
    avatarUrl?: string;
  } | null>(null);

  // WebRTC hook — pass null since widget uses session cookie, not API key
  const webrtc = useRainbowWebSDK(null);

  // Load saved preferences from localStorage
  useEffect(() => {
    const savedLogin = localStorage.getItem("connectplus_rb_login");
    if (savedLogin) setRbLogin(savedLogin);

    const savedMode = localStorage.getItem("connectplus_rb_mode");
    if (savedMode === "webrtc" || savedMode === "s2s") setRbMode(savedMode);
  }, []);

  // ── SSE connection (cookie-based auth, no API key needed) ──

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  const connect = useCallback(() => {
    disconnect();
    setStatus("connecting");

    // Session cookie is sent automatically with same-origin requests
    const es = new EventSource("/api/v1/events/stream");
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setStatus("connected");
    });

    es.addEventListener("screen.pop", (e) => {
      try {
        const data = JSON.parse(e.data);
        const callId = data.interactionId || data.callId || "unknown";

        console.log("[Widget] screen.pop received:", { callId, contact: data.contact, mode: rbModeRef.current, status: rbStatusRef.current });

        // In WebRTC mode, update the resolved contact info on the active WebRTC call
        // (the server resolved the contact from CRM after receiving the call event)
        // Use refs to get current values (avoids stale closure from useEffect mount)
        if (rbModeRef.current === "webrtc" && rbStatusRef.current === "connected") {
          if (data.contact) {
            console.log("[Widget] Setting resolved contact for WebRTC:", data.contact.displayName);
            setResolvedContact({
              displayName: data.contact.displayName,
              company: data.contact.company,
              crmUrl: data.contact.crmUrl,
              avatarUrl: data.contact.avatarUrl,
            });
          }
          return;
        }

        const notification: CallNotificationData = {
          callId,
          callerNumber: data.callerNumber || data.caller || "Unknown",
          contactName: data.contact?.displayName || data.contactName,
          companyName: data.contact?.company || data.companyName,
          crmUrl: data.contact?.crmUrl || data.crmUrl,
          avatarUrl: data.contact?.avatarUrl || data.avatarUrl,
          status: "RINGING",
          startedAt: Date.now(),
        };
        setCalls((prev) => new Map(prev).set(notification.callId, notification));
      } catch {
        // Ignore malformed events
      }
    });

    es.addEventListener("call.updated", (e) => {
      try {
        const data = JSON.parse(e.data);
        const callId = data.interactionId || data.callId || data.rainbowCallId;
        setCalls((prev) => {
          const next = new Map(prev);
          const existing =
            next.get(callId) ||
            (data.rainbowCallId
              ? Array.from(next.values()).find(
                  (c) => c.callId === data.rainbowCallId
                )
              : undefined);
          if (existing) {
            const key = existing.callId;
            const newStatus =
              data.status === "ACTIVE" || data.state === "ACTIVE"
                ? "ACTIVE"
                : existing.status;
            next.set(key, {
              ...existing,
              status: newStatus,
              startedAt:
                newStatus === "ACTIVE" && existing.status !== "ACTIVE"
                  ? Date.now()
                  : existing.startedAt,
            });
          }
          return next;
        });
      } catch {
        // Ignore
      }
    });

    es.addEventListener("call.ended", (e) => {
      try {
        const data = JSON.parse(e.data);
        const callId = data.interactionId || data.callId || data.rainbowCallId;
        setCalls((prev) => {
          const next = new Map(prev);
          const existing =
            next.get(callId) ||
            (data.rainbowCallId
              ? Array.from(next.values()).find(
                  (c) => c.callId === data.rainbowCallId
                )
              : undefined);
          if (existing) {
            next.set(existing.callId, { ...existing, status: "COMPLETED" });
          }
          return next;
        });
      } catch {
        // Ignore
      }
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus("error");
      } else {
        setStatus("connecting");
      }
    };
  }, [disconnect]); // rbMode/rbStatus accessed via refs to avoid stale closures

  // Auto-connect SSE on mount
  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rainbow connection ──────────────────────────────────

  const connectRainbow = useCallback(async () => {
    setRbStatus("connecting");
    setRbError("");
    localStorage.setItem("connectplus_rb_login", rbLogin);
    localStorage.setItem("connectplus_rb_mode", rbMode);

    try {
      if (rbMode === "webrtc") {
        const resp = await fetch("/api/v1/rainbow/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        try {
          await webrtc.initialize(data.webrtc.appId, data.webrtc.appSecret, data.webrtc.host);
          await webrtc.login(rbLogin, rbPassword);
          setRbStatus("connected");
          setRbConnectedAs(rbLogin);
        } catch (initErr) {
          setRbStatus("error");
          setRbError(initErr instanceof Error ? initErr.message : "WebRTC connection failed");
        }
      } else {
        const resp = await fetch("/api/v1/rainbow/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login: rbLogin, password: rbPassword }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          setRbStatus("error");
          setRbError(data.error?.message || `HTTP ${resp.status}`);
          return;
        }
        if (data.session?.status === "error") {
          setRbStatus("error");
          setRbError(data.session.error || "Connection failed");
        } else {
          setRbStatus("connected");
          setRbConnectedAs(data.session?.connectedAs || rbLogin);
        }
      }
    } catch (err) {
      setRbStatus("error");
      setRbError(err instanceof Error ? err.message : "Network error");
    }
  }, [rbLogin, rbPassword, rbMode, webrtc]);

  const disconnectRainbow = useCallback(async () => {
    if (rbMode === "webrtc") {
      await webrtc.logout();
    }
    try {
      await fetch("/api/v1/rainbow/connect", { method: "DELETE" });
    } catch {
      // Ignore
    }
    setRbStatus("disconnected");
    setRbConnectedAs("");
    setRbError("");
  }, [rbMode, webrtc]);

  // Check Rainbow status when SSE connects
  useEffect(() => {
    if (status !== "connected") return;
    fetch("/api/v1/rainbow/connect")
      .then((r) => r.json())
      .then((data) => {
        if (data.session?.status === "connected") {
          setRbStatus("connected");
          setRbConnectedAs(data.session.connectedAs || "");
        }
      })
      .catch(() => {});
  }, [status]);

  // Sync WebRTC errors
  useEffect(() => {
    if (webrtc.error && rbMode === "webrtc") {
      setRbError(webrtc.error);
      if (webrtc.status === "error") setRbStatus("error");
    }
  }, [webrtc.error, webrtc.status, rbMode]);

  // Clear resolved contact when WebRTC call ends
  useEffect(() => {
    if (webrtc.callState === "idle" || webrtc.callState === "ended") {
      setResolvedContact(null);
    }
  }, [webrtc.callState]);

  // ── Handlers ───────────────────────────────────────────

  const handleDismiss = useCallback((callId: string) => {
    setCalls((prev) => {
      const next = new Map(prev);
      next.delete(callId);
      return next;
    });
  }, []);

  const handleLogout = async () => {
    disconnect();
    await fetch("/api/v1/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handleRainbowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rbStatus === "connected") {
      disconnectRainbow();
    } else {
      connectRainbow();
    }
  };

  const handleModeChange = (mode: RainbowMode) => {
    if (rbStatus === "connected") return;
    setRbMode(mode);
    localStorage.setItem("connectplus_rb_mode", mode);
    if (mode === "webrtc") webrtc.checkMicPermission().catch(() => {});
  };

  const callList = Array.from(calls.values());
  const isWebRTCActive = rbMode === "webrtc" && rbStatus === "connected";
  const rbCanConnect =
    status === "connected" &&
    rbStatus !== "connected" &&
    rbLogin.trim() &&
    rbPassword.trim();

  const statusDot = {
    disconnected: "bg-gray-400",
    connecting: "bg-yellow-400 animate-pulse",
    connected: "bg-green-500",
    error: "bg-red-500",
  };

  return (
    <div className="flex flex-col h-screen w-full max-w-2xl mx-auto text-base">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${statusDot[status]}`} />
          <span className="font-semibold text-gray-900 text-sm">
            ConnectPlus
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 truncate max-w-[200px]">
            {user.name || user.email}
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
            title="Sign out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Rainbow connection (compact) ─────────────────── */}
      <div className="px-5 py-3 border-b border-gray-100 bg-white shrink-0">
        {rbStatus === "connected" ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-sm text-gray-600 truncate">
                {rbConnectedAs}
              </span>
            </div>
            <button
              onClick={() => disconnectRainbow()}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <form onSubmit={handleRainbowSubmit} className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleModeChange("webrtc")}
                disabled={rbStatus === "connecting"}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
                  ${rbMode === "webrtc" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                WebRTC (Browser Audio)
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("s2s")}
                disabled={rbStatus === "connecting"}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
                  ${rbMode === "s2s" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                Notification Only
              </button>
            </div>
            <p className="text-xs text-gray-400">
              {rbMode === "webrtc"
                ? "Calls handled in your browser — microphone required"
                : "Get notified of calls — audio stays on your desk phone"}
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={rbLogin}
                onChange={(e) => setRbLogin(e.target.value)}
                placeholder="Rainbow email"
                className="flex-1 min-w-0 rounded-md border border-gray-200 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                value={rbPassword}
                onChange={(e) => setRbPassword(e.target.value)}
                placeholder="Rainbow password"
                className="flex-1 min-w-0 rounded-md border border-gray-200 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={rbStatus === "connecting" || !rbCanConnect}
                className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium
                           transition-colors disabled:opacity-50 shrink-0"
              >
                {rbStatus === "connecting" ? "..." : "Connect"}
              </button>
            </div>
            {rbError && (
              <p className="text-sm text-red-500 truncate">{rbError}</p>
            )}
          </form>
        )}
      </div>

      {/* ── Tab bar ─────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={() => setActiveTab("calls")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors
            ${activeTab === "calls"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"}`}
        >
          Active Calls
          {callList.length > 0 && (
            <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">
              {callList.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors
            ${activeTab === "history"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"}`}
        >
          History
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "calls" && (
          <div className="p-5 space-y-3">
            {/* WebRTC softphone controls */}
            {isWebRTCActive && webrtc.currentCall && webrtc.callState !== "idle" && (
              <div className="relative">
                <SoftphoneControls
                  call={webrtc.currentCall}
                  callQuality={webrtc.callQuality}
                  contactName={resolvedContact?.displayName}
                  companyName={resolvedContact?.company}
                  crmUrl={resolvedContact?.crmUrl}
                  avatarUrl={resolvedContact?.avatarUrl}
                  onAnswer={webrtc.answer}
                  onReject={webrtc.reject}
                  onHangup={webrtc.hangup}
                  onToggleMute={webrtc.toggleMute}
                  onToggleHold={webrtc.toggleHold}
                />
              </div>
            )}

            {/* SSE call notifications (inline, not fixed position) */}
            {!isWebRTCActive &&
              callList.map((call, i) => (
                <CallNotificationInline
                  key={call.callId}
                  call={call}
                  onDismiss={handleDismiss}
                />
              ))}

            {/* Empty state */}
            {callList.length === 0 && !webrtc.currentCall && (
              <div className="text-center py-16">
                <p className="text-gray-400 text-sm">
                  {rbStatus === "connected"
                    ? "Waiting for incoming calls..."
                    : "Connect to Rainbow above to receive calls"}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && <CallHistory />}
      </div>

      {/* Hidden audio element for WebRTC */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={webrtc.audioRef} autoPlay style={{ display: "none" }} />
    </div>
  );
}

/**
 * Inline call notification card (not fixed-position — for widget layout).
 */
function CallNotificationInline({
  call,
  onDismiss,
}: {
  call: CallNotificationData;
  onDismiss: (callId: string) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (call.status !== "ACTIVE") return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - call.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [call.status, call.startedAt]);

  useEffect(() => {
    if (call.status !== "COMPLETED") return;
    const timer = setTimeout(() => onDismiss(call.callId), 8000);
    return () => clearTimeout(timer);
  }, [call.status, call.callId, onDismiss]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const statusConfig = {
    RINGING: {
      bg: "bg-blue-50 border-blue-200",
      badge: "bg-blue-100 text-blue-700",
      dot: "bg-blue-500 animate-pulse",
      label: "Ringing",
    },
    ACTIVE: {
      bg: "bg-green-50 border-green-200",
      badge: "bg-green-100 text-green-700",
      dot: "bg-green-500",
      label: "Active",
    },
    COMPLETED: {
      bg: "bg-gray-50 border-gray-200",
      badge: "bg-gray-100 text-gray-500",
      dot: "bg-gray-400",
      label: "Ended",
    },
  };

  const cfg = statusConfig[call.status];

  return (
    <div className={`rounded-lg border p-3 ${cfg.bg}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
        <button
          onClick={() => onDismiss(call.callId)}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex items-start gap-2">
        {call.avatarUrl ? (
          <img src={call.avatarUrl} alt={call.contactName || "Contact"}
            className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : call.contactName ? (
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
            {call.contactName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-mono font-semibold text-gray-900">
            {call.callerNumber}
          </p>
          {call.contactName && (
            <p className="text-xs text-gray-600">{call.contactName}</p>
          )}
          {call.companyName && (
            <p className="text-xs text-gray-500">{call.companyName}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-inherit">
        {call.status === "ACTIVE" && (
          <span className="text-xs font-mono text-green-700">{formatTime(elapsed)}</span>
        )}
        {call.status === "RINGING" && (
          <span className="text-xs text-blue-500">Ringing...</span>
        )}
        {call.status === "COMPLETED" && (
          <span className="text-xs text-gray-400">Ended</span>
        )}
        {call.crmUrl && (
          <a
            href={call.crmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Open CRM
          </a>
        )}
      </div>
    </div>
  );
}
