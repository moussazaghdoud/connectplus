"use client";

import { useEffect, useState } from "react";

export interface CallNotificationData {
  callId: string;
  callerNumber: string;
  contactName?: string;
  companyName?: string;
  crmUrl?: string;
  avatarUrl?: string;
  status: "RINGING" | "ACTIVE" | "COMPLETED";
  startedAt: number;
}

interface CallNotificationProps {
  call: CallNotificationData;
  index: number;
  onDismiss: (callId: string) => void;
  /** When true, show Answer/Reject buttons for RINGING calls */
  webrtcMode?: boolean;
  onAnswer?: () => void;
  onReject?: () => void;
}

export function CallNotification({
  call,
  index,
  onDismiss,
  webrtcMode,
  onAnswer,
  onReject,
}: CallNotificationProps) {
  const [elapsed, setElapsed] = useState(0);
  const [fading, setFading] = useState(false);

  // Live timer for ACTIVE calls
  useEffect(() => {
    if (call.status !== "ACTIVE") return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - call.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [call.status, call.startedAt]);

  // Auto-dismiss COMPLETED calls after 8s
  useEffect(() => {
    if (call.status !== "COMPLETED") return;
    setFading(false);
    const fadeTimer = setTimeout(() => setFading(true), 6000);
    const dismissTimer = setTimeout(() => onDismiss(call.callId), 8000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [call.status, call.callId, onDismiss]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const statusConfig = {
    RINGING: {
      label: "Ringing",
      bg: "bg-blue-50 border-blue-300",
      badge: "bg-blue-100 text-blue-700",
      dot: "bg-blue-500 animate-pulse",
    },
    ACTIVE: {
      label: "Active Call",
      bg: "bg-green-50 border-green-300",
      badge: "bg-green-100 text-green-700",
      dot: "bg-green-500",
    },
    COMPLETED: {
      label: "Call Ended",
      bg: "bg-gray-50 border-gray-300",
      badge: "bg-gray-100 text-gray-500",
      dot: "bg-gray-400",
    },
  };

  const config = statusConfig[call.status];

  return (
    <div
      className={`
        fixed right-4 w-80 rounded-lg border shadow-lg p-4
        transition-all duration-500 ease-in-out
        ${config.bg}
        ${fading ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"}
        animate-[slideIn_0.3s_ease-out]
      `}
      style={{ bottom: `${1 + index * 8.5}rem` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${config.dot}`} />
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.badge}`}>
            {config.label}
          </span>
        </div>
        <button
          onClick={() => onDismiss(call.callId)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Caller info */}
      <div className="space-y-1">
        <p className="text-sm font-mono font-semibold text-gray-900">
          {call.callerNumber}
        </p>
        {call.contactName && (
          <p className="text-sm font-medium text-gray-700">{call.contactName}</p>
        )}
        {call.companyName && (
          <p className="text-xs text-gray-500">{call.companyName}</p>
        )}
      </div>

      {/* WebRTC Answer/Reject buttons for ringing calls */}
      {webrtcMode && call.status === "RINGING" && (
        <div className="flex gap-2 mt-3 pt-2 border-t border-inherit">
          <button
            onClick={onAnswer}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md
                       bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Answer
          </button>
          <button
            onClick={onReject}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md
                       bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.516l2.257-1.13a1 1 0 00.502-1.21L8.228 3.684A1 1 0 007.28 3H5z" />
            </svg>
            Reject
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-inherit">
        {call.status === "ACTIVE" && (
          <span className="text-xs font-mono text-green-700">
            {formatTime(elapsed)}
          </span>
        )}
        {call.status === "COMPLETED" && (
          <span className="text-xs text-gray-400">Ended</span>
        )}
        {call.status === "RINGING" && !webrtcMode && (
          <span className="text-xs text-blue-500">Ringing…</span>
        )}
        {call.status === "RINGING" && webrtcMode && (
          <span className="text-xs text-blue-500">Answer from browser</span>
        )}

        {call.crmUrl && (
          <a
            href={call.crmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            Open CRM →
          </a>
        )}
      </div>
    </div>
  );
}
