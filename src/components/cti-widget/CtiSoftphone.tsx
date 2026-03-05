"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DialPad } from "./DialPad";
import { ActiveCallPanel } from "./ActiveCallPanel";
import { RecentCalls } from "./RecentCalls";
import type { ScreenPopData } from "./ScreenPopup";
import { CallWrapUp } from "./CallWrapUp";
import type { CtiCallEvent } from "@/lib/cti/types/call-event";

type Tab = "phone" | "active" | "recent";

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
  }, [agentId]);

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
      const endedCall = activeCall;
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
  }, [activeCall]);

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
      // Tell /widget to answer via Rainbow SDK
      channelRef.current?.postMessage({ action: "answer", callId: activeCall.callId });
      callAction("answer", { callId: activeCall.callId });
    }
  }, [activeCall, callAction]);

  const handleHangup = useCallback(() => {
    if (activeCall) {
      channelRef.current?.postMessage({ action: "hangup", callId: activeCall.callId });
      callAction("hangup", { callId: activeCall.callId });
    }
  }, [activeCall, callAction]);

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

  return (
    <div className="flex flex-col h-screen w-full max-w-sm mx-auto bg-white relative">
      {/* Screen Pop Overlay */}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
            R
          </div>
          <span className="text-sm font-semibold">Rainbow CTI</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`}
          />
          <span className="text-xs opacity-80">{agentEmail}</span>
        </div>
      </div>

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
