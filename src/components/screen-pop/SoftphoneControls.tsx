"use client";

import { useEffect, useState } from "react";
import type { CallState, WebRTCCallInfo, CallQualityStats } from "@/hooks/useRainbowWebSDK";

interface SoftphoneControlsProps {
  call: WebRTCCallInfo;
  callQuality?: CallQualityStats | null;
  contactName?: string;
  companyName?: string;
  crmUrl?: string;
  onAnswer: () => void;
  onReject: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleHold: () => void;
}

export function SoftphoneControls({
  call,
  callQuality,
  contactName,
  companyName,
  crmUrl,
  onAnswer,
  onReject,
  onHangup,
  onToggleMute,
  onToggleHold,
}: SoftphoneControlsProps) {
  const [elapsed, setElapsed] = useState(0);

  // Live timer for active calls
  useEffect(() => {
    if (call.state !== "active" && call.state !== "on_hold") return;
    if (!call.startedAt) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - call.startedAt!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [call.state, call.startedAt]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const stateConfig: Record<CallState, { label: string; bg: string; badge: string; dot: string }> = {
    idle: { label: "", bg: "", badge: "", dot: "" },
    ringing_incoming: {
      label: "Incoming Call",
      bg: "bg-blue-50 border-blue-300",
      badge: "bg-blue-100 text-blue-700",
      dot: "bg-blue-500 animate-pulse",
    },
    ringing_outgoing: {
      label: "Outgoing Call",
      bg: "bg-blue-50 border-blue-300",
      badge: "bg-blue-100 text-blue-700",
      dot: "bg-blue-500 animate-pulse",
    },
    connecting: {
      label: "Connecting",
      bg: "bg-yellow-50 border-yellow-300",
      badge: "bg-yellow-100 text-yellow-700",
      dot: "bg-yellow-500 animate-pulse",
    },
    active: {
      label: "Active Call",
      bg: "bg-green-50 border-green-300",
      badge: "bg-green-100 text-green-700",
      dot: "bg-green-500",
    },
    on_hold: {
      label: "On Hold",
      bg: "bg-amber-50 border-amber-300",
      badge: "bg-amber-100 text-amber-700",
      dot: "bg-amber-500 animate-pulse",
    },
    ended: {
      label: "Call Ended",
      bg: "bg-gray-50 border-gray-300",
      badge: "bg-gray-100 text-gray-500",
      dot: "bg-gray-400",
    },
  };

  if (call.state === "idle") return null;

  const config = stateConfig[call.state];

  return (
    <div
      className={`
        fixed bottom-4 right-4 w-80 rounded-lg border shadow-lg p-4
        transition-all duration-300 ease-in-out
        ${config.bg}
        animate-[slideIn_0.3s_ease-out]
      `}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.badge}`}>
          {config.label}
        </span>
        {(call.state === "active" || call.state === "on_hold") && (
          <span className="text-xs font-mono text-gray-600 ml-auto">
            {formatTime(elapsed)}
          </span>
        )}
      </div>

      {/* Caller info */}
      <p className="text-sm font-mono font-semibold text-gray-900">
        {call.callerNumber || "Unknown Caller"}
      </p>
      {contactName && (
        <p className="text-sm text-gray-700 font-medium">{contactName}</p>
      )}
      {companyName && (
        <p className="text-xs text-gray-500">{companyName}</p>
      )}
      <div className="mb-2">
        {crmUrl && (
          <a href={crmUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline">
            Open CRM
          </a>
        )}
      </div>

      {/* Call quality indicator (active calls only) */}
      {callQuality && (call.state === "active" || call.state === "on_hold") && (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <QualityBars quality={callQuality.quality} />
          <span className="font-medium">
            {callQuality.quality === "good" ? "Good" : callQuality.quality === "fair" ? "Fair" : callQuality.quality === "poor" ? "Poor" : ""}
          </span>
          {callQuality.roundTripTime !== null && (
            <span>{callQuality.roundTripTime}ms</span>
          )}
          {callQuality.packetLoss !== null && callQuality.packetLoss > 0 && (
            <span>{(callQuality.packetLoss * 100).toFixed(1)}% loss</span>
          )}
          {callQuality.codec && (
            <span className="ml-auto text-gray-400">{callQuality.codec}</span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Ringing: Answer + Reject */}
        {(call.state === "ringing_incoming" || call.state === "ringing_outgoing") && (
          <>
            <button
              onClick={onAnswer}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md
                         bg-green-600 hover:bg-green-700 text-white text-sm font-medium
                         transition-colors"
            >
              <PhoneIcon />
              Answer
            </button>
            <button
              onClick={onReject}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md
                         bg-red-600 hover:bg-red-700 text-white text-sm font-medium
                         transition-colors"
            >
              <PhoneOffIcon />
              Reject
            </button>
          </>
        )}

        {/* Active / On Hold: Mute + Hold + Hangup */}
        {(call.state === "active" || call.state === "on_hold") && (
          <>
            <button
              onClick={onToggleMute}
              className={`flex items-center justify-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
                ${call.isMuted
                  ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                  : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                }`}
              title={call.isMuted ? "Unmute" : "Mute"}
            >
              {call.isMuted ? <MicOffIcon /> : <MicIcon />}
            </button>
            <button
              onClick={onToggleHold}
              className={`flex items-center justify-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
                ${call.isOnHold
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                }`}
              title={call.isOnHold ? "Resume" : "Hold"}
            >
              {call.isOnHold ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button
              onClick={onHangup}
              className="flex items-center justify-center gap-1 px-3 py-2 rounded-md
                         bg-red-600 hover:bg-red-700 text-white text-sm font-medium
                         transition-colors ml-auto"
              title="Hang up"
            >
              <PhoneOffIcon />
            </button>
          </>
        )}

        {/* Ended */}
        {call.state === "ended" && (
          <span className="text-sm text-gray-500">Call ended</span>
        )}
      </div>
    </div>
  );
}

// ── Inline SVG icons (minimal, no extra deps) ───────────

function PhoneIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.516l2.257-1.13a1 1 0 00.502-1.21L8.228 3.684A1 1 0 007.28 3H5z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function QualityBars({ quality }: { quality: "good" | "fair" | "poor" | "unknown" }) {
  const bars = quality === "good" ? 3 : quality === "fair" ? 2 : quality === "poor" ? 1 : 0;
  const color = quality === "good" ? "bg-green-500" : quality === "fair" ? "bg-yellow-500" : quality === "poor" ? "bg-red-500" : "bg-gray-300";

  return (
    <div className="flex items-end gap-0.5 h-3" title={`Signal: ${quality}`}>
      {[1, 2, 3].map((level) => (
        <div
          key={level}
          className={`w-1 rounded-sm ${level <= bars ? color : "bg-gray-200"}`}
          style={{ height: `${level * 4 + 2}px` }}
        />
      ))}
    </div>
  );
}
