"use client";

import { useState, useEffect } from "react";

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

interface Props {
  call: ActiveCall | null;
  onAnswer: () => void;
  onHangup: () => void;
  onHold: () => void;
  onMute: () => void;
  onTransfer: (target: string) => void;
  onDtmf: (digits: string) => void;
}

export function ActiveCallPanel({
  call,
  onAnswer,
  onHangup,
  onHold,
  onMute,
  onTransfer,
  onDtmf,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [showDtmf, setShowDtmf] = useState(false);

  // Call timer
  useEffect(() => {
    if (!call || call.state !== "connected") {
      setElapsed(0);
      return;
    }
    const start = new Date(call.startedAt).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [call?.state, call?.startedAt]);

  if (!call) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-white/30">
        <svg className="w-12 h-12 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
        </svg>
        <p className="text-sm">No active call</p>
        <p className="text-xs text-white/20 mt-1">Use the dial pad to make a call</p>
      </div>
    );
  }

  const displayNumber =
    call.direction === "inbound" ? call.fromNumber : call.toNumber;
  const displayName = call.crmContext?.displayName;
  const company = call.crmContext?.company;
  const isRinging = call.state === "ringing";
  const isActive = call.state === "connected" || call.state === "held";

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center py-6 px-4">
      {/* Avatar — glass circle with glow */}
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4 border transition-all ${
          isRinging
            ? "bg-yellow-500/20 border-yellow-400/40 shadow-lg shadow-yellow-500/20 animate-pulse"
            : call.isOnHold
              ? "bg-orange-500/20 border-orange-400/40 shadow-lg shadow-orange-500/20"
              : "bg-blue-500/20 border-blue-400/30 shadow-lg shadow-blue-500/20"
        }`}
      >
        {displayName ? displayName.charAt(0).toUpperCase() : "?"}
      </div>

      {displayName && (
        <h2 className="text-lg font-semibold text-white/90">{displayName}</h2>
      )}
      {company && <p className="text-sm text-white/50">{company}</p>}
      <p className="text-sm text-white/60 font-mono mt-1">{displayNumber}</p>

      {/* Status badge — glass pill */}
      <div className="flex items-center gap-2 mt-3">
        <span
          className={`text-xs font-medium px-3 py-1 rounded-full border backdrop-blur-sm ${
            isRinging
              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
              : call.isOnHold
                ? "bg-orange-500/10 text-orange-400 border-orange-500/30"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
          }`}
        >
          {isRinging
            ? call.direction === "inbound"
              ? "Incoming Call"
              : "Dialing..."
            : call.isOnHold
              ? "On Hold"
              : "Connected"}
        </span>
        {isActive && (
          <span className="text-sm font-mono text-white/40">
            {formatTime(elapsed)}
          </span>
        )}
      </div>

      {/* CRM link */}
      {call.crmContext?.recordId && (
        <button
          onClick={() => {
            window.parent?.postMessage(
              {
                type: "openCrmRecord",
                module: call.crmContext?.module,
                recordId: call.crmContext?.recordId,
              },
              "*"
            );
          }}
          className="mt-2 text-xs text-blue-400/70 hover:text-blue-400 transition-colors"
        >
          Open in CRM
        </button>
      )}

      {/* Call controls */}
      <div className="flex items-center gap-4 mt-8">
        {isRinging && call.direction === "inbound" && (
          <>
            <button
              onClick={onAnswer}
              className="w-14 h-14 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 transition-all"
              title="Answer"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
            </button>
            <button
              onClick={onHangup}
              className="w-14 h-14 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xl flex items-center justify-center shadow-lg shadow-red-500/20 transition-all"
              title="Reject"
            >
              <svg className="w-6 h-6 rotate-[135deg]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
            </button>
          </>
        )}

        {isActive && (
          <>
            <GlassControlButton
              onClick={onMute}
              active={call.isMuted}
              label={call.isMuted ? "Unmute" : "Mute"}
            >
              {call.isMuted ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                  <path d="M17 16.95A7 7 0 015 12" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </GlassControlButton>
            <GlassControlButton
              onClick={onHold}
              active={call.isOnHold}
              label={call.isOnHold ? "Resume" : "Hold"}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </GlassControlButton>
            <GlassControlButton
              onClick={() => setShowDtmf(!showDtmf)}
              active={showDtmf}
              label="Keypad"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="6" height="6" rx="1" />
                <rect x="9" y="2" width="6" height="6" rx="1" />
                <rect x="16" y="2" width="6" height="6" rx="1" />
                <rect x="2" y="9" width="6" height="6" rx="1" />
                <rect x="9" y="9" width="6" height="6" rx="1" />
                <rect x="16" y="9" width="6" height="6" rx="1" />
                <rect x="9" y="16" width="6" height="6" rx="1" />
              </svg>
            </GlassControlButton>
            <GlassControlButton
              onClick={() => setShowTransfer(!showTransfer)}
              active={showTransfer}
              label="Transfer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 14 20 9 15 4" />
                <path d="M4 20v-7a4 4 0 014-4h12" />
              </svg>
            </GlassControlButton>
            <button
              onClick={onHangup}
              className="w-14 h-14 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 flex items-center justify-center shadow-lg shadow-red-500/20 transition-all"
              title="Hang up"
            >
              <svg className="w-6 h-6 rotate-[135deg]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* DTMF mini-pad — glass */}
      {showDtmf && isActive && (
        <div className="mt-4 grid grid-cols-3 gap-2 w-48">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(
            (key) => (
              <button
                key={key}
                onClick={() => onDtmf(key)}
                className="py-2 bg-white/8 hover:bg-white/15 border border-white/10 rounded-xl text-sm font-mono text-white/80 transition-colors"
              >
                {key}
              </button>
            )
          )}
        </div>
      )}

      {/* Transfer input — glass */}
      {showTransfer && isActive && (
        <div className="mt-4 flex gap-2 w-full max-w-xs">
          <input
            type="tel"
            value={transferTarget}
            onChange={(e) => setTransferTarget(e.target.value)}
            placeholder="Transfer to..."
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-400/50"
          />
          <button
            onClick={() => {
              if (transferTarget) {
                onTransfer(transferTarget);
                setTransferTarget("");
                setShowTransfer(false);
              }
            }}
            className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-xl text-sm transition-colors"
          >
            Transfer
          </button>
        </div>
      )}
    </div>
  );
}

function GlassControlButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 ${
        active ? "text-blue-400" : "text-white/50"
      }`}
      title={label}
    >
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          active
            ? "bg-blue-500/20 border-2 border-blue-400/40 shadow-lg shadow-blue-500/20"
            : "bg-white/8 hover:bg-white/12 border border-white/10"
        }`}
      >
        {children}
      </div>
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
