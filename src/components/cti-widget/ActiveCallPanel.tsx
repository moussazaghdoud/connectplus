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
      <div className="flex flex-col items-center justify-center h-full py-16 text-gray-400">
        <svg className="w-12 h-12 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
        </svg>
        <p className="text-sm">No active call</p>
        <p className="text-xs text-gray-300 mt-1">Use the dial pad to make a call</p>
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
      {/* Avatar */}
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4 transition-all ${
          isRinging
            ? "bg-yellow-500 animate-pulse"
            : call.isOnHold
              ? "bg-orange-500"
              : "bg-[#006cff]"
        }`}
      >
        {displayName ? displayName.charAt(0).toUpperCase() : "?"}
      </div>

      {displayName && (
        <h2 className="text-lg font-semibold text-gray-800">{displayName}</h2>
      )}
      {company && <p className="text-sm text-gray-500">{company}</p>}
      <p className="text-sm text-gray-600 font-mono mt-1">{displayNumber}</p>

      {/* Status badge */}
      <div className="flex items-center gap-2 mt-3">
        <span
          className={`text-xs font-medium px-3 py-1 rounded-full ${
            isRinging
              ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
              : call.isOnHold
                ? "bg-orange-50 text-orange-700 border border-orange-200"
                : "bg-green-50 text-green-700 border border-green-200"
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
          <span className="text-sm font-mono text-gray-400">
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
          className="mt-2 text-xs text-[#006cff] hover:underline transition-colors"
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
              className="w-14 h-14 rounded-full bg-[#2ecc71] hover:bg-[#27ae60] text-white text-xl flex items-center justify-center shadow-md transition-all"
              title="Answer"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
            </button>
            <button
              onClick={onHangup}
              className="w-14 h-14 rounded-full bg-[#e74c3c] hover:bg-[#c0392b] text-white text-xl flex items-center justify-center shadow-md transition-all"
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
            <ControlButton
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
            </ControlButton>
            <ControlButton
              onClick={onHold}
              active={call.isOnHold}
              label={call.isOnHold ? "Resume" : "Hold"}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </ControlButton>
            <ControlButton
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
            </ControlButton>
            <ControlButton
              onClick={() => setShowTransfer(!showTransfer)}
              active={showTransfer}
              label="Transfer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 14 20 9 15 4" />
                <path d="M4 20v-7a4 4 0 014-4h12" />
              </svg>
            </ControlButton>
            <button
              onClick={onHangup}
              className="w-14 h-14 rounded-full bg-[#e74c3c] hover:bg-[#c0392b] text-white flex items-center justify-center shadow-md transition-all"
              title="Hang up"
            >
              <svg className="w-6 h-6 rotate-[135deg]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* DTMF mini-pad */}
      {showDtmf && isActive && (
        <div className="mt-4 grid grid-cols-3 gap-2 w-48">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(
            (key) => (
              <button
                key={key}
                onClick={() => onDtmf(key)}
                className="py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-700 transition-colors shadow-sm"
              >
                {key}
              </button>
            )
          )}
        </div>
      )}

      {/* Transfer input */}
      {showTransfer && isActive && (
        <div className="mt-4 flex gap-2 w-full max-w-xs">
          <input
            type="tel"
            value={transferTarget}
            onChange={(e) => setTransferTarget(e.target.value)}
            placeholder="Transfer to..."
            className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006cff]/30 focus:border-[#006cff]"
          />
          <button
            onClick={() => {
              if (transferTarget) {
                onTransfer(transferTarget);
                setTransferTarget("");
                setShowTransfer(false);
              }
            }}
            className="px-4 py-2 bg-[#006cff] hover:bg-[#0047ff] text-white rounded-lg text-sm transition-colors"
          >
            Transfer
          </button>
        </div>
      )}
    </div>
  );
}

function ControlButton({
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
        active ? "text-[#006cff]" : "text-gray-500"
      }`}
      title={label}
    >
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          active
            ? "bg-blue-50 border-2 border-[#006cff]"
            : "bg-white hover:bg-gray-50 border border-gray-200 shadow-sm"
        }`}
      >
        {children}
      </div>
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
