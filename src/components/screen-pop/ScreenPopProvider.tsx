"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CallNotification,
  type CallNotificationData,
} from "./CallNotification";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export function ScreenPopProvider() {
  const [apiKey, setApiKey] = useState("");
  const [inputKey, setInputKey] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [calls, setCalls] = useState<Map<string, CallNotificationData>>(
    new Map()
  );
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load saved API key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("connectplus_api_key");
    if (saved) {
      setInputKey(saved);
    }
  }, []);

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
            // Try to find by callId, or by rainbowCallId match
            const existing = next.get(callId) ||
              (data.rainbowCallId ? Array.from(next.values()).find(c => c.callId === data.rainbowCallId) : undefined);
            if (existing) {
              const key = existing.callId;
              const newStatus = data.status === "ACTIVE" || data.state === "ACTIVE" ? "ACTIVE" : existing.status;
              next.set(key, {
                ...existing,
                callId: callId || key, // Update to real interaction ID if available
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
          const callId = data.interactionId || data.callId;
          setCalls((prev) => {
            const next = new Map(prev);
            const existing = next.get(callId);
            if (existing) {
              next.set(callId, { ...existing, status: "COMPLETED" });
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
          // Reconnecting
          setStatus("connecting");
        }
      };
    },
    [disconnect]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

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
      disconnect();
    } else {
      connect(inputKey);
    }
  };

  const isConnected = status === "connected" || status === "connecting";
  const callList = Array.from(calls.values());

  const statusIndicator = {
    disconnected: { color: "bg-gray-400", text: "Disconnected" },
    connecting: { color: "bg-yellow-400 animate-pulse", text: "Connecting…" },
    connected: { color: "bg-green-500", text: "Connected" },
    error: { color: "bg-red-500", text: "Connection error" },
  };

  const si = statusIndicator[status];

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Header */}
      <h1 className="text-2xl font-bold mb-6">ConnectPlus Agent</h1>

      {/* API Key Form */}
      <form onSubmit={handleSubmit} className="mb-4">
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
      </form>

      {/* Status */}
      <div className="flex items-center gap-2 mb-8">
        <span className={`w-2.5 h-2.5 rounded-full ${si.color}`} />
        <span className="text-sm text-gray-600">
          Status: <span className="font-medium">{si.text}</span>
        </span>
      </div>

      {/* Empty state */}
      {status === "connected" && callList.length === 0 && (
        <p className="text-gray-400 text-sm text-center mt-12">
          Waiting for incoming calls…
        </p>
      )}

      {/* Notification stack (rendered via fixed positioning) */}
      {callList.map((call, i) => (
        <CallNotification
          key={call.callId}
          call={call}
          index={i}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}
