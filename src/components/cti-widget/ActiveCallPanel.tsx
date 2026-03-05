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
        <div className="text-4xl mb-3">&#128222;</div>
        <p className="text-sm">No active call</p>
        <p className="text-xs mt-1">Use the dial pad to make a call</p>
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
      {/* Caller info */}
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4 ${
          isRinging
            ? "bg-yellow-500 animate-pulse"
            : call.isOnHold
              ? "bg-orange-500"
              : "bg-blue-500"
        }`}
      >
        {displayName ? displayName.charAt(0).toUpperCase() : "?"}
      </div>

      {displayName && (
        <h2 className="text-lg font-semibold text-gray-800">{displayName}</h2>
      )}
      {company && <p className="text-sm text-gray-500">{company}</p>}
      <p className="text-sm text-gray-600 font-mono mt-1">{displayNumber}</p>

      {/* Status */}
      <div className="flex items-center gap-2 mt-3">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isRinging
              ? "bg-yellow-100 text-yellow-700"
              : call.isOnHold
                ? "bg-orange-100 text-orange-700"
                : "bg-green-100 text-green-700"
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
          <span className="text-sm font-mono text-gray-500">
            {formatTime(elapsed)}
          </span>
        )}
      </div>

      {/* CRM link */}
      {call.crmContext?.recordId && (
        <button
          onClick={() => {
            // Open CRM record — widget can use Zoho SDK to navigate
            window.parent?.postMessage(
              {
                type: "openCrmRecord",
                module: call.crmContext?.module,
                recordId: call.crmContext?.recordId,
              },
              "*"
            );
          }}
          className="mt-2 text-xs text-blue-600 underline"
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
              className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 text-white text-xl flex items-center justify-center shadow-lg transition-colors"
              title="Answer"
            >
              &#128222;
            </button>
            <button
              onClick={onHangup}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white text-xl flex items-center justify-center shadow-lg transition-colors"
              title="Reject"
            >
              &#128225;
            </button>
          </>
        )}

        {isActive && (
          <>
            <ControlButton
              onClick={onMute}
              active={call.isMuted}
              icon={call.isMuted ? "🔇" : "🎤"}
              label={call.isMuted ? "Unmute" : "Mute"}
            />
            <ControlButton
              onClick={onHold}
              active={call.isOnHold}
              icon="⏸"
              label={call.isOnHold ? "Resume" : "Hold"}
            />
            <ControlButton
              onClick={() => setShowDtmf(!showDtmf)}
              active={showDtmf}
              icon="⌨"
              label="Keypad"
            />
            <ControlButton
              onClick={() => setShowTransfer(!showTransfer)}
              active={showTransfer}
              icon="↗"
              label="Transfer"
            />
            <button
              onClick={onHangup}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white text-xl flex items-center justify-center shadow-lg transition-colors"
              title="Hang up"
            >
              &#128225;
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
                className="py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm font-mono text-gray-700"
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
            className="flex-1 px-3 py-2 border rounded text-sm"
          />
          <button
            onClick={() => {
              if (transferTarget) {
                onTransfer(transferTarget);
                setTransferTarget("");
                setShowTransfer(false);
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
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
  icon,
  label,
}: {
  onClick: () => void;
  active: boolean;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 ${
        active ? "text-blue-600" : "text-gray-500"
      }`}
      title={label}
    >
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-lg transition-colors ${
          active
            ? "bg-blue-100 border-2 border-blue-400"
            : "bg-gray-100 hover:bg-gray-200"
        }`}
      >
        {icon}
      </div>
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
