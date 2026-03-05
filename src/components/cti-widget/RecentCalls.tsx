"use client";

import type { CtiCallEvent } from "@/lib/cti/types/call-event";

interface Props {
  calls: CtiCallEvent[];
  onClickToCall: (number: string) => void;
}

export function RecentCalls({ calls, onClickToCall }: Props) {
  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <div className="text-3xl mb-2">&#128203;</div>
        <p className="text-sm">No recent calls</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {calls.map((call) => {
        const isInbound = call.direction === "inbound";
        const displayNumber = isInbound ? call.fromNumber : call.toNumber;
        const displayName = call.crmContext?.displayName;
        const time = new Date(call.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <div
            key={call.correlationId}
            className="flex items-center px-4 py-3 hover:bg-gray-50"
          >
            {/* Direction icon */}
            <div className="mr-3">
              <span
                className={`text-lg ${
                  call.state === "missed"
                    ? "text-red-500"
                    : isInbound
                      ? "text-blue-500"
                      : "text-green-500"
                }`}
              >
                {call.state === "missed"
                  ? "↙"
                  : isInbound
                    ? "↙"
                    : "↗"}
              </span>
            </div>

            {/* Call info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {displayName || displayNumber}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {displayName && (
                  <span className="font-mono">{displayNumber}</span>
                )}
                <span>{time}</span>
                {call.durationSecs !== undefined && (
                  <span>{formatDuration(call.durationSecs)}</span>
                )}
              </div>
            </div>

            {/* Disposition badge */}
            <div className="flex items-center gap-2 ml-2">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  call.disposition === "answered"
                    ? "bg-green-100 text-green-700"
                    : call.disposition === "missed"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {call.disposition || call.state}
              </span>

              {/* Click-to-call button */}
              <button
                onClick={() => onClickToCall(displayNumber)}
                className="w-8 h-8 rounded-full bg-green-50 hover:bg-green-100 text-green-600 flex items-center justify-center text-sm"
                title={`Call ${displayNumber}`}
              >
                &#128222;
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}
