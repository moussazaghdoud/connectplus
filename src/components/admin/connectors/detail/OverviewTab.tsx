"use client";

import { useEffect, useState } from "react";
import { HealthDot } from "../marketplace/HealthDot";
import type { ConnectorDetail } from "@/app/admin/connectors/[slug]/page";
import type { ConnectorDiagnostics, DiagnosticResult } from "@/lib/connectors/marketplace/types";

interface Props {
  detail: ConnectorDetail;
  apiKey: string;
}

export function OverviewTab({ detail, apiKey }: Props) {
  const [diagnostics, setDiagnostics] = useState<ConnectorDiagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const runDiag = () => {
    setDiagLoading(true);
    fetch(`/api/v1/admin/marketplace/connectors/${detail.slug}/diagnostics`, {
      headers: { "x-api-key": apiKey },
    })
      .then((r) => r.json())
      .then((data) => setDiagnostics(data))
      .catch(() => {})
      .finally(() => setDiagLoading(false));
  };

  useEffect(() => {
    if (detail.tenantConfigured) runDiag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const diagStatusIcon = (s: DiagnosticResult["status"]) =>
    s === "pass" ? "✓" : s === "fail" ? "✗" : s === "warn" ? "!" : "—";

  const diagStatusColor = (s: DiagnosticResult["status"]) =>
    s === "pass" ? "text-green-600" : s === "fail" ? "text-red-600" : s === "warn" ? "text-yellow-600" : "text-gray-400";

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Status" value={detail.status} />
        <StatCard label="Token" value={detail.tokenStatus} />
        <StatCard
          label="API Health"
          value={
            detail.lastHealthStatus === true
              ? `OK (${detail.lastHealthLatency}ms)`
              : detail.lastHealthStatus === false
                ? "Unhealthy"
                : "Unknown"
          }
        />
        <StatCard
          label="Last Webhook"
          value={detail.lastWebhookAt ? timeAgo(detail.lastWebhookAt) : "Never"}
        />
      </div>

      {/* Prerequisites */}
      {detail.prerequisites.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Prerequisites</h3>
          <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
            {detail.prerequisites.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Credential status */}
      {detail.tenantConfigured && Object.keys(detail.credentialStatus).length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Credential Status</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono space-y-1">
            {Object.entries(detail.credentialStatus).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-500">{key}</span>
                <span className="text-gray-700">{val}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Diagnostics */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Diagnostics</h3>
          <button
            onClick={runDiag}
            disabled={diagLoading}
            className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-50"
          >
            {diagLoading ? "Running..." : "Run Diagnostics"}
          </button>
        </div>

        {!diagnostics && !diagLoading && (
          <p className="text-sm text-gray-400">
            {detail.tenantConfigured
              ? "Loading diagnostics..."
              : "Configure this connector to run diagnostics."}
          </p>
        )}

        {diagnostics && (
          <div className="border rounded-lg overflow-hidden">
            <div className={`px-4 py-2 text-sm font-medium ${
              diagnostics.overall === "healthy" ? "bg-green-50 text-green-800" :
              diagnostics.overall === "degraded" ? "bg-yellow-50 text-yellow-800" :
              diagnostics.overall === "unhealthy" ? "bg-red-50 text-red-800" :
              "bg-gray-50 text-gray-600"
            }`}>
              Overall: {diagnostics.overall}
            </div>
            <div className="divide-y">
              {diagnostics.results.map((r, i) => (
                <div key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <span className={`font-bold w-4 text-center ${diagStatusColor(r.status)}`}>
                    {diagStatusIcon(r.status)}
                  </span>
                  <span className="font-medium text-gray-700 w-32">{r.check}</span>
                  <span className="text-gray-500 flex-1">{r.message}</span>
                  {r.latencyMs != null && (
                    <span className="text-xs text-gray-400">{r.latencyMs}ms</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Version info */}
      {detail.versions.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Versions</h3>
          <div className="text-xs text-gray-500 space-y-1">
            {detail.versions.slice(0, 5).map((v) => (
              <div key={v.version} className="flex gap-4">
                <span className="font-mono">v{v.version}</span>
                <span>{v.changedBy}</span>
                <span>{new Date(v.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-700">{value}</p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
