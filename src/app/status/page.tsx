"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const POLL_INTERVAL_MS = 15_000;
const STORAGE_KEY = "connectplus_api_key";

// ── Types ──────────────────────────────────────────────────

interface ConnectorStatus {
  id: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  health: { healthy: boolean; latencyMs: number; message?: string } | null;
}

interface StatusResponse {
  status: "healthy" | "degraded";
  version: string;
  uptime: number;
  timestamp: string;
  database: { status: string; latencyMs: number };
  rainbow: {
    status: string;
    connectedAs?: string;
    extension?: string;
    error?: string;
  };
  sse: { tenantConnections: number; totalConnections: number };
  connectors: ConnectorStatus[];
  dlq: { pending: number; resolved: number; total: number };
  metrics: Record<string, number>;
}

// ── Component ──────────────────────────────────────────────

export default function StatusPage() {
  const [apiKey, setApiKey] = useState(
    () =>
      (typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : "") ?? ""
  );
  const [inputKey, setInputKey] = useState(apiKey);
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/status", {
        headers: { "x-api-key": apiKey },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? `HTTP ${res.status}`
        );
      }
      setData(await res.json());
      setLastFetched(Date.now());
      setSecondsAgo(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  // Poll every 15s
  useEffect(() => {
    if (!apiKey) return;
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [apiKey, fetchStatus]);

  // Tick "last updated Xs ago" every second
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!lastFetched) return;
    timerRef.current = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastFetched) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lastFetched]);

  // ── API key gate ───────────────────────────────────────
  if (!apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setApiKey(inputKey);
            localStorage.setItem(STORAGE_KEY, inputKey);
          }}
          className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm"
        >
          <h1 className="text-xl font-bold mb-4">System Status</h1>
          <p className="text-sm text-gray-500 mb-4">
            Enter your API key to view system status.
          </p>
          <input
            type="text"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            placeholder="cp_xxxxxxxxxxxxxxxx"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Continue
          </button>
        </form>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">System Status</h1>
            {data && <HealthBadge status={data.status} />}
          </div>
          {data && (
            <div className="text-sm text-gray-500 text-right">
              <div>v{data.version}</div>
              <div>Uptime: {formatUptime(data.uptime)}</div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* Database */}
            <Card title="Database">
              <div className="flex items-center gap-2">
                <StatusDot
                  color={data.database.status === "healthy" ? "green" : "red"}
                />
                <span className="font-medium">PostgreSQL</span>
                <span className="text-sm text-gray-500 ml-auto">
                  {data.database.latencyMs}ms
                </span>
              </div>
            </Card>

            {/* Rainbow */}
            <Card title="Rainbow S2S">
              <div className="flex items-center gap-2">
                <StatusDot color={rainbowColor(data.rainbow.status)} />
                <span className="font-medium capitalize">
                  {data.rainbow.status}
                </span>
              </div>
              {data.rainbow.connectedAs && (
                <div className="text-sm text-gray-500 mt-1">
                  {data.rainbow.connectedAs}
                  {data.rainbow.extension && (
                    <span className="ml-2">ext. {data.rainbow.extension}</span>
                  )}
                </div>
              )}
              {data.rainbow.error && (
                <div className="text-sm text-red-600 mt-1">
                  {data.rainbow.error}
                </div>
              )}
            </Card>

            {/* SSE */}
            <Card title="SSE Connections">
              <div className="flex gap-6">
                <Stat label="Tenant" value={data.sse.tenantConnections} />
                <Stat label="Total" value={data.sse.totalConnections} />
              </div>
            </Card>

            {/* Connectors */}
            <Card title="Connectors">
              {data.connectors.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No connectors registered.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="pb-2 font-medium">Name</th>
                      <th className="pb-2 font-medium">Configured</th>
                      <th className="pb-2 font-medium">Enabled</th>
                      <th className="pb-2 font-medium">Health</th>
                      <th className="pb-2 font-medium text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.connectors.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100">
                        <td className="py-2 font-medium">{c.name}</td>
                        <td className="py-2">
                          <Badge
                            value={c.configured}
                            trueLabel="Yes"
                            falseLabel="No"
                          />
                        </td>
                        <td className="py-2">
                          <Badge
                            value={c.enabled}
                            trueLabel="On"
                            falseLabel="Off"
                          />
                        </td>
                        <td className="py-2">
                          {c.health ? (
                            <div className="flex items-center gap-1.5">
                              <StatusDot
                                color={c.health.healthy ? "green" : "red"}
                              />
                              <span>
                                {c.health.healthy ? "Healthy" : "Unhealthy"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right text-gray-500">
                          {c.health ? `${c.health.latencyMs}ms` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {/* DLQ */}
            <Card title="Dead Letter Queue">
              <div className="flex gap-6">
                <Stat
                  label="Pending"
                  value={data.dlq.pending}
                  warn={data.dlq.pending > 0}
                />
                <Stat label="Resolved" value={data.dlq.resolved} />
                <Stat label="Total" value={data.dlq.total} />
              </div>
            </Card>

            {/* Metrics */}
            <Card title="Metrics">
              {Object.keys(data.metrics).length === 0 ? (
                <p className="text-sm text-gray-500">No metrics recorded.</p>
              ) : (
                <div className="font-mono text-sm space-y-1">
                  {Object.entries(data.metrics).map(([key, val]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-600">{key}</span>
                      <span className="font-medium">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-2">
            {lastFetched && <span>Last updated {secondsAgo}s ago</span>}
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"
                title="Auto-refreshing"
              />
              Auto-refresh
            </span>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-lg border border-gray-200 bg-white">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatusDot({ color }: { color: "green" | "yellow" | "red" | "gray" }) {
  const colors = {
    green: "bg-green-500",
    yellow: "bg-yellow-400 animate-pulse",
    red: "bg-red-500",
    gray: "bg-gray-400",
  };
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colors[color]}`}
    />
  );
}

function HealthBadge({ status }: { status: "healthy" | "degraded" }) {
  const isHealthy = status === "healthy";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
        isHealthy
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isHealthy ? "bg-green-500" : "bg-red-500"
        }`}
      />
      {isHealthy ? "All Systems Operational" : "Degraded"}
    </span>
  );
}

function Badge({
  value,
  trueLabel,
  falseLabel,
}: {
  value: boolean;
  trueLabel: string;
  falseLabel: string;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
        value
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {value ? trueLabel : falseLabel}
    </span>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div>
      <div
        className={`text-2xl font-bold ${
          warn ? "text-yellow-600" : "text-gray-900"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

// ── Utilities ──────────────────────────────────────────────

function rainbowColor(
  status: string
): "green" | "yellow" | "red" | "gray" {
  switch (status) {
    case "connected":
      return "green";
    case "connecting":
      return "yellow";
    case "error":
      return "red";
    default:
      return "gray";
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
