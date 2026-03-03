"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CallNotification,
  type CallNotificationData,
} from "./CallNotification";
import { SoftphoneControls } from "./SoftphoneControls";
import { useRainbowWebSDK } from "@/hooks/useRainbowWebSDK";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
type RainbowStatus = "disconnected" | "connecting" | "connected" | "error";
type RainbowMode = "s2s" | "webrtc";

export function ScreenPopProvider() {
  const [apiKey, setApiKey] = useState("");
  const [inputKey, setInputKey] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [calls, setCalls] = useState<Map<string, CallNotificationData>>(
    new Map()
  );
  const eventSourceRef = useRef<EventSource | null>(null);

  // Rainbow credentials (in-memory only — password never persisted)
  const [rbLogin, setRbLogin] = useState("");
  const [rbPassword, setRbPassword] = useState("");
  const [rbStatus, setRbStatus] = useState<RainbowStatus>("disconnected");
  const [rbError, setRbError] = useState("");
  const [rbConnectedAs, setRbConnectedAs] = useState("");

  // Mode toggle: WebRTC (browser audio) vs S2S (notification only)
  const [rbMode, setRbMode] = useState<RainbowMode>("s2s");

  // WebRTC hook
  const webrtc = useRainbowWebSDK(apiKey || null);

  // Load saved preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("connectplus_api_key");
    if (saved) setInputKey(saved);

    const savedLogin = localStorage.getItem("connectplus_rb_login");
    if (savedLogin) setRbLogin(savedLogin);

    const savedMode = localStorage.getItem("connectplus_rb_mode");
    if (savedMode === "webrtc" || savedMode === "s2s") setRbMode(savedMode);
  }, []);

  // ── SSE connection ──────────────────────────────────────

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  const connect = useCallback(
    (key: string) => {
      disconnect();

      if (!key.trim()) return;

      setApiKey(key);
      localStorage.setItem("connectplus_api_key", key);
      setStatus("connecting");

      const es = new EventSource(
        `/api/v1/events/stream?key=${encodeURIComponent(key)}`
      );
      eventSourceRef.current = es;

      es.addEventListener("connected", () => {
        setStatus("connected");
      });

      es.addEventListener("screen.pop", (e) => {
        try {
          const data = JSON.parse(e.data);
          const callId = data.interactionId || data.callId || "unknown";

          // In WebRTC mode, skip SSE screen-pops if the hook already knows about this call
          // (the browser SDK will handle it directly)
          if (rbMode === "webrtc" && webrtc.currentCall?.callId === callId) {
            return;
          }

          const notification: CallNotificationData = {
            callId,
            callerNumber: data.callerNumber || data.caller || "Unknown",
            contactName: data.contact?.displayName || data.contactName,
            companyName: data.contact?.company || data.companyName,
            crmUrl: data.contact?.crmUrl || data.crmUrl,
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
            const existing = next.get(callId) ||
              (data.rainbowCallId ? Array.from(next.values()).find(c => c.callId === data.rainbowCallId) : undefined);
            if (existing) {
              const key = existing.callId;
              const newStatus = data.status === "ACTIVE" || data.state === "ACTIVE" ? "ACTIVE" : existing.status;
              next.set(key, {
                ...existing,
                status: newStatus,
                startedAt: newStatus === "ACTIVE" && existing.status !== "ACTIVE" ? Date.now() : existing.startedAt,
              });
            }
            return next;
          });
        } catch {
          // Ignore malformed events
        }
      });

      es.addEventListener("call.ended", (e) => {
        try {
          const data = JSON.parse(e.data);
          const callId = data.interactionId || data.callId || data.rainbowCallId;
          setCalls((prev) => {
            const next = new Map(prev);
            const existing = next.get(callId) ||
              (data.rainbowCallId ? Array.from(next.values()).find(c => c.callId === data.rainbowCallId) : undefined);
            if (existing) {
              const key = existing.callId;
              next.set(key, { ...existing, status: "COMPLETED" });
            }
            return next;
          });
        } catch {
          // Ignore malformed events
        }
      });

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          setStatus("error");
        } else {
          setStatus("connecting");
        }
      };
    },
    [disconnect, rbMode, webrtc.currentCall?.callId]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // ── Rainbow connection (S2S or WebRTC) ────────────────

  const connectRainbow = useCallback(async () => {
    if (!apiKey) return;

    setRbStatus("connecting");
    setRbError("");

    // Persist login + mode for convenience (password never saved)
    localStorage.setItem("connectplus_rb_login", rbLogin);
    localStorage.setItem("connectplus_rb_mode", rbMode);

    try {
      if (rbMode === "webrtc") {
        // WebRTC mode: get SDK creds from server, then init + login in browser
        const resp = await fetch("/api/v1/rainbow/connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            login: rbLogin,
            password: rbPassword,
            mode: "webrtc",
          }),
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

        // Initialize SDK via dynamic import and login
        try {
          await webrtc.initialize(data.webrtc.appId, data.webrtc.appSecret, data.webrtc.host);
          await webrtc.login(rbLogin, rbPassword);
          setRbStatus("connected");
          setRbConnectedAs(rbLogin);
        } catch (initErr) {
          setRbStatus("error");
          setRbError(initErr instanceof Error ? initErr.message : "WebRTC connection failed");
          return;
        }
      } else {
        // S2S mode: start server-side worker
        const resp = await fetch("/api/v1/rainbow/connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            login: rbLogin,
            password: rbPassword,
          }),
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
  }, [apiKey, rbLogin, rbPassword, rbMode, webrtc]);

  const disconnectRainbow = useCallback(async () => {
    // Logout from WebRTC if active
    if (rbMode === "webrtc") {
      await webrtc.logout();
    }

    if (!apiKey) return;

    try {
      await fetch("/api/v1/rainbow/connect", {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
      });
    } catch {
      // Ignore errors on disconnect
    }

    setRbStatus("disconnected");
    setRbConnectedAs("");
    setRbError("");
  }, [apiKey, rbMode, webrtc]);

  // Check Rainbow status when SSE connects
  useEffect(() => {
    if (status !== "connected" || !apiKey) return;

    fetch("/api/v1/rainbow/connect", {
      headers: { "x-api-key": apiKey },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.session?.status === "connected") {
          setRbStatus("connected");
          setRbConnectedAs(data.session.connectedAs || "");
        }
      })
      .catch(() => {});
  }, [status, apiKey]);

  // Sync WebRTC hook errors to UI
  useEffect(() => {
    if (webrtc.error && rbMode === "webrtc") {
      setRbError(webrtc.error);
      if (webrtc.status === "error") {
        setRbStatus("error");
      }
    }
  }, [webrtc.error, webrtc.status, rbMode]);

  // ── Handlers ────────────────────────────────────────────

  const handleDismiss = useCallback((callId: string) => {
    setCalls((prev) => {
      const next = new Map(prev);
      next.delete(callId);
      return next;
    });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "connected" || status === "connecting") {
      disconnectRainbow();
      disconnect();
    } else {
      connect(inputKey);
    }
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
    if (rbStatus === "connected") return; // Can't switch while connected
    setRbMode(mode);
    localStorage.setItem("connectplus_rb_mode", mode);
    // Proactively check mic permission when switching to WebRTC
    if (mode === "webrtc") {
      webrtc.checkMicPermission().catch(() => {});
    }
  };

  const isConnected = status === "connected" || status === "connecting";
  const callList = Array.from(calls.values());
  const isWebRTCActive = rbMode === "webrtc" && rbStatus === "connected";

  const rbCanConnect =
    status === "connected" &&
    rbStatus !== "connected" &&
    rbLogin.trim() &&
    rbPassword.trim();

  const statusIndicator = {
    disconnected: { color: "bg-gray-400", text: "Disconnected" },
    connecting: { color: "bg-yellow-400 animate-pulse", text: "Connecting…" },
    connected: { color: "bg-green-500", text: "Connected" },
    error: { color: "bg-red-500", text: "Connection error" },
  };

  const si = statusIndicator[status];

  const rbStatusIndicator = {
    disconnected: { color: "bg-gray-400", text: "Not connected" },
    connecting: { color: "bg-yellow-400 animate-pulse", text: "Connecting…" },
    connected: { color: "bg-green-500", text: rbConnectedAs ? `Connected as ${rbConnectedAs}` : "Connected" },
    error: { color: "bg-red-500", text: rbError || "Error" },
  };

  const rbSi = rbStatusIndicator[rbStatus];

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Header */}
      <h1 className="text-2xl font-bold mb-6">ConnectPlus Agent</h1>

      {/* Step 1: API Key */}
      <form onSubmit={handleSubmit} className="mb-6">
        <label className="block text-sm font-medium text-gray-600 mb-1">
          API Key
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            placeholder="cp_xxxxxxxxxxxxxxxx"
            disabled={isConnected}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                       disabled:bg-gray-100 disabled:text-gray-500"
          />
          <button
            type="submit"
            className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-colors
              ${
                isConnected
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-blue-600 hover:bg-blue-700"
              }
              disabled:opacity-50`}
            disabled={!inputKey.trim() && !isConnected}
          >
            {isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className={`w-2 h-2 rounded-full ${si.color}`} />
          <span className="text-xs text-gray-500">{si.text}</span>
        </div>
      </form>

      {/* Step 2: Rainbow credentials (only shown when SSE is connected) */}
      {status === "connected" && (
        <form onSubmit={handleRainbowSubmit} className="mb-6 p-4 rounded-lg border border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Rainbow Telephony
          </h2>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => handleModeChange("webrtc")}
              disabled={rbStatus === "connected"}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${rbMode === "webrtc"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                }
                disabled:opacity-70`}
            >
              WebRTC (Browser Audio)
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("s2s")}
              disabled={rbStatus === "connected"}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${rbMode === "s2s"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                }
                disabled:opacity-70`}
            >
              Notification Only
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rainbow Login (email)</label>
              <input
                type="email"
                value={rbLogin}
                onChange={(e) => setRbLogin(e.target.value)}
                placeholder="user@company.com"
                disabled={rbStatus === "connected"}
                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500
                           disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rainbow Password</label>
              <input
                type="password"
                value={rbPassword}
                onChange={(e) => setRbPassword(e.target.value)}
                placeholder="••••••••"
                disabled={rbStatus === "connected"}
                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500
                           disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${rbSi.color}`} />
              <span className="text-xs text-gray-500">{rbSi.text}</span>
            </div>
            <button
              type="submit"
              disabled={rbStatus === "connecting" || (!rbCanConnect && rbStatus !== "connected")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium text-white transition-colors
                ${
                  rbStatus === "connected"
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-purple-600 hover:bg-purple-700"
                }
                disabled:opacity-50`}
            >
              {rbStatus === "connected"
                ? "Disconnect Rainbow"
                : rbStatus === "connecting"
                  ? "Connecting…"
                  : "Connect Rainbow"}
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-2">
            {rbMode === "webrtc"
              ? "WebRTC mode: your browser handles calls directly. Microphone access required."
              : "Your password is sent to the server to authenticate with Rainbow but is never stored on disk."}
          </p>

          {/* Mic permission indicator for WebRTC mode */}
          {rbMode === "webrtc" && webrtc.micPermission !== "unknown" && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${
                webrtc.micPermission === "granted" ? "bg-green-500"
                : webrtc.micPermission === "denied" ? "bg-red-500"
                : "bg-yellow-400"
              }`} />
              <span className="text-xs text-gray-400">
                {webrtc.micPermission === "granted" && "Microphone access granted"}
                {webrtc.micPermission === "denied" && "Microphone blocked — check browser settings"}
                {webrtc.micPermission === "prompt" && "Microphone permission will be requested on connect"}
                {webrtc.micPermission === "unsupported" && "Microphone not available in this browser"}
              </span>
            </div>
          )}
        </form>
      )}

      {/* Empty state */}
      {status === "connected" && rbStatus === "connected" && callList.length === 0 && !webrtc.currentCall && (
        <p className="text-gray-400 text-sm text-center mt-12">
          {rbMode === "webrtc"
            ? "WebRTC ready — waiting for incoming calls…"
            : "Waiting for incoming calls…"}
        </p>
      )}

      {status === "connected" && rbStatus !== "connected" && (
        <p className="text-gray-400 text-sm text-center mt-12">
          Enter your Rainbow credentials above to receive call notifications.
        </p>
      )}

      {/* WebRTC softphone controls (shown for WebRTC calls) */}
      {isWebRTCActive && webrtc.currentCall && webrtc.callState !== "idle" && (
        <SoftphoneControls
          call={webrtc.currentCall}
          callQuality={webrtc.callQuality}
          onAnswer={webrtc.answer}
          onReject={webrtc.reject}
          onHangup={webrtc.hangup}
          onToggleMute={webrtc.toggleMute}
          onToggleHold={webrtc.toggleHold}
        />
      )}

      {/* SSE notification stack */}
      {callList.map((call, i) => (
        <CallNotification
          key={call.callId}
          call={call}
          index={i}
          onDismiss={handleDismiss}
          webrtcMode={isWebRTCActive}
          onAnswer={isWebRTCActive ? webrtc.answer : undefined}
          onReject={isWebRTCActive ? webrtc.reject : undefined}
        />
      ))}

      {/* Hidden audio element for WebRTC remote audio */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={webrtc.audioRef} autoPlay style={{ display: "none" }} />
    </div>
  );
}
