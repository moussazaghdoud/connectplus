"use client";

import { useState } from "react";
import type { ConnectorDetail } from "@/app/admin/connectors/[slug]/page";

interface Props {
  detail: ConnectorDetail;
  apiKey: string;
  onRefresh: () => void;
}

export function DeployTab({ detail, apiKey, onRefresh }: Props) {
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const activate = async () => {
    setActivating(true);
    setMessage(null);
    try {
      const resp = await fetch(`/api/v1/admin/marketplace/connectors/${detail.slug}/activate`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await resp.json();
      if (data.error) {
        setMessage({ ok: false, text: data.error.message });
      } else {
        setMessage({ ok: true, text: "Connector activated and loaded into registry." });
        onRefresh();
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setActivating(false);
    }
  };

  const deactivate = async () => {
    setDeactivating(true);
    setMessage(null);
    try {
      const resp = await fetch(`/api/v1/admin/marketplace/connectors/${detail.slug}/deactivate`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await resp.json();
      if (data.error) {
        setMessage({ ok: false, text: data.error.message });
      } else {
        setMessage({ ok: true, text: data.note ?? "Connector deactivated." });
        onRefresh();
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current status */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Deployment Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Status</p>
            <p className="text-sm font-medium text-gray-700">{detail.status}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Version</p>
            <p className="text-sm font-medium text-gray-700">v{detail.version}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Tier</p>
            <p className="text-sm font-medium text-gray-700">
              {detail.tier === "CODE_BASED" ? "Code-based" : "Config-driven"}
            </p>
          </div>
        </div>
      </section>

      {/* Actions */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Actions</h3>
        <div className="flex gap-3">
          {detail.status !== "ACTIVE" && (
            <button
              onClick={activate}
              disabled={activating}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50"
            >
              {activating ? "Activating..." : "Activate"}
            </button>
          )}
          {detail.status === "ACTIVE" && (
            <button
              onClick={deactivate}
              disabled={deactivating}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50"
            >
              {deactivating ? "Deactivating..." : "Deactivate"}
            </button>
          )}
        </div>
        {detail.status === "DRAFT" && (
          <p className="text-xs text-gray-400 mt-2">
            Complete the Setup wizard and run tests before activating.
          </p>
        )}
      </section>

      {/* Message */}
      {message && (
        <div className={`p-3 border rounded text-sm ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {/* Version history */}
      {detail.versions.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Version History</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Version</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Changed By</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {detail.versions.map((v) => (
                  <tr key={v.version} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono">v{v.version}</td>
                    <td className="px-4 py-2 text-gray-500">{v.changedBy}</td>
                    <td className="px-4 py-2 text-gray-400">{new Date(v.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Safety note */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
        <p className="font-medium mb-1">Deployment Safety</p>
        <ul className="text-xs space-y-1">
          <li>Deactivation does NOT delete credentials or config — you can re-activate anytime.</li>
          <li>Config-driven connectors are immediately unregistered from the runtime on deactivation.</li>
          <li>Code-based connectors remain in the registry until the next server restart.</li>
          <li>All activation/deactivation events are logged in the Audit tab.</li>
        </ul>
      </div>
    </div>
  );
}
