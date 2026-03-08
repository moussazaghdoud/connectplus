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
        <svg className="w-10 h-10 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <p className="text-sm">No recent calls</p>
      </div>
    );
  }

  return (
    <div>
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
            className="flex items-center px-4 py-3 hover:bg-white border-b border-gray-100 transition-colors"
          >
            {/* Direction icon */}
            <div className="mr-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  call.state === "missed"
                    ? "bg-red-50 text-red-500"
                    : isInbound
                      ? "bg-blue-50 text-[#1B6CE3]"
                      : "bg-green-50 text-[#2ecc71]"
                }`}
              >
                <svg className={`w-3.5 h-3.5 ${isInbound ? "" : "rotate-180"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
              </div>
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

            {/* Disposition badge + call button */}
            <div className="flex items-center gap-2 ml-2">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  call.disposition === "answered"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : call.disposition === "missed"
                      ? "bg-red-50 text-red-600 border border-red-200"
                      : "bg-gray-50 text-gray-500 border border-gray-200"
                }`}
              >
                {call.disposition || call.state}
              </span>

              <button
                onClick={() => onClickToCall(displayNumber)}
                className="w-8 h-8 rounded-full bg-green-50 hover:bg-green-100 border border-green-200 text-[#2ecc71] flex items-center justify-center transition-colors"
                title={`Call ${displayNumber}`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
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
