"use client";

import { useCallback, useEffect, useState } from "react";

interface InteractionItem {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  targetPhone?: string;
  durationSecs?: number;
  createdAt: string;
  contact?: {
    displayName: string;
    phone?: string;
  } | null;
}

export function CallHistory() {
  const [interactions, setInteractions] = useState<InteractionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/interactions?limit=20");
      if (!res.ok) return;
      const data = await res.json();
      setInteractions(data.data || []);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      COMPLETED: "bg-green-100 text-green-700",
      ACTIVE: "bg-blue-100 text-blue-700",
      RINGING: "bg-yellow-100 text-yellow-700",
      FAILED: "bg-red-100 text-red-700",
      CANCELLED: "bg-gray-100 text-gray-500",
      PENDING: "bg-gray-100 text-gray-500",
      INITIATING: "bg-yellow-100 text-yellow-700",
    };
    return map[status] || "bg-gray-100 text-gray-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-xs text-gray-400">Loading...</span>
      </div>
    );
  }

  if (interactions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-gray-400">No call history yet</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {interactions.map((ix) => (
        <div key={ix.id} className="px-3 py-2 hover:bg-gray-50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Direction arrow */}
              <span className="text-xs shrink-0" title={ix.direction}>
                {ix.direction === "INBOUND" ? (
                  <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                      d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                      d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {ix.contact?.displayName || ix.targetPhone || ix.contact?.phone || "Unknown"}
                </p>
                {ix.contact?.phone && ix.contact.displayName && (
                  <p className="text-xs text-gray-400 font-mono truncate">{ix.contact.phone}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {ix.durationSecs != null && ix.durationSecs > 0 && (
                <span className="text-xs font-mono text-gray-500">
                  {formatDuration(ix.durationSecs)}
                </span>
              )}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusBadge(ix.status)}`}>
                {ix.status}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 ml-[18px]">
            {timeAgo(ix.createdAt)}
          </p>
        </div>
      ))}

      {/* Refresh button */}
      <div className="px-3 py-2">
        <button
          onClick={fetchHistory}
          className="w-full text-xs text-blue-600 hover:text-blue-800 font-medium py-1"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
