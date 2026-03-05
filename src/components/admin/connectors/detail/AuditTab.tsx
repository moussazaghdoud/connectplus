"use client";

import { useEffect, useState } from "react";
import type { ConnectorDetail } from "@/app/admin/connectors/[slug]/page";

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  resource: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

interface Props {
  detail: ConnectorDetail;
  apiKey: string;
}

export function AuditTab({ detail, apiKey }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // Build synthetic entries from metadata timestamps
      const synthetic: AuditEntry[] = [];
      if (detail.createdAt) {
        synthetic.push({
          id: "syn-created",
          action: "connector.created",
          actor: "system",
          resource: `connector_definition:${detail.slug}`,
          detail: { version: 1 },
          createdAt: detail.createdAt,
        });
      }
      if (detail.updatedAt && detail.updatedAt !== detail.createdAt) {
        synthetic.push({
          id: "syn-updated",
          action: "connector.updated",
          actor: "system",
          resource: `connector_definition:${detail.slug}`,
          detail: { version: detail.version },
          createdAt: detail.updatedAt,
        });
      }
      if (detail.lastHealthAt) {
        synthetic.push({
          id: "syn-health",
          action: "connector.health_check",
          actor: "system",
          resource: `connector_definition:${detail.slug}`,
          detail: {
            healthy: detail.lastHealthStatus,
            latencyMs: detail.lastHealthLatency,
          },
          createdAt: detail.lastHealthAt,
        });
      }
      if (detail.lastTokenRefreshAt) {
        synthetic.push({
          id: "syn-token",
          action: "connector.token_refresh",
          actor: "system",
          resource: `connector_config:${detail.slug}`,
          detail: {},
          createdAt: detail.lastTokenRefreshAt,
        });
      }
      if (detail.lastWebhookAt) {
        synthetic.push({
          id: "syn-webhook",
          action: "connector.webhook_received",
          actor: `webhook:${detail.slug}`,
          resource: `connector:${detail.slug}`,
          detail: {},
          createdAt: detail.lastWebhookAt,
        });
      }

      // Fetch real audit logs from API
      try {
        const res = await fetch(
          `/api/v1/admin/marketplace/connectors/${detail.slug}/audit-logs?limit=50`,
          { headers: { "x-api-key": apiKey } }
        );
        if (res.ok) {
          const data = await res.json();
          const real: AuditEntry[] = (data.entries || []).map(
            (e: AuditEntry) => ({
              ...e,
              detail:
                typeof e.detail === "object" && e.detail !== null
                  ? e.detail
                  : {},
            })
          );
          if (!cancelled) {
            // Merge: real logs first, then synthetic for timestamps not in real logs
            const realActions = new Set(real.map((r) => r.action));
            const unique = [
              ...real,
              ...synthetic.filter((s) => !realActions.has(s.action)),
            ];
            unique.sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            );
            setEntries(unique);
          }
        } else {
          // API failed — fall back to synthetic only
          if (!cancelled) setEntries(synthetic.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        }
      } catch {
        if (!cancelled) setEntries(synthetic.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [detail, apiKey]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Audit Log</h3>
        <p className="text-xs text-gray-400">
          Events related to this connector from the audit trail and operational metadata.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-gray-400 text-center py-8">Loading audit logs...</p>
      )}

      {entries.length === 0 && !loading && (
        <p className="text-sm text-gray-400 text-center py-8">No audit events recorded yet.</p>
      )}

      {entries.length > 0 && !loading && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2 font-medium text-gray-600">Time</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Action</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Actor</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex px-2 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-700">
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{e.actor}</td>
                  <td className="px-4 py-2 text-xs text-gray-400 font-mono">
                    {Object.keys(e.detail).length > 0 ? JSON.stringify(e.detail) : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
