"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { connectorRegistry } from "@/lib/core/connector-registry";

interface ConnectorDef {
  slug: string;
  name: string;
  description: string;
  status: string;
  version: number;
  updatedAt: string;
}

export default function ConnectorListPage() {
  const [apiKey, setApiKey] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("connectplus_api_key") : "") ?? ""
  );
  const [inputKey, setInputKey] = useState(apiKey);
  const [definitions, setDefinitions] = useState<ConnectorDef[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    fetch("/api/v1/admin/connector-definitions", {
      headers: { "x-api-key": apiKey },
    })
      .then((r) => r.json())
      .then((data) => setDefinitions(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiKey]);

  if (!apiKey) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-xl font-bold mb-4">Connector Manager</h1>
        <form onSubmit={(e) => { e.preventDefault(); setApiKey(inputKey); localStorage.setItem("connectplus_api_key", inputKey); }}>
          <input type="text" value={inputKey} onChange={(e) => setInputKey(e.target.value)}
            placeholder="cp_xxxxxxxxxxxxxxxx"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono mb-3" />
          <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded">Continue</button>
        </form>
      </div>
    );
  }

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      ACTIVE: "bg-green-100 text-green-700",
      DRAFT: "bg-gray-100 text-gray-600",
      TESTING: "bg-yellow-100 text-yellow-700",
      DISABLED: "bg-red-100 text-red-600",
      ARCHIVED: "bg-gray-100 text-gray-400",
    };
    return colors[s] ?? "bg-gray-100 text-gray-500";
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Connectors</h1>
        <Link href="/admin/connectors/wizard"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700">
          + New Connector
        </Link>
      </div>

      {/* Built-in connectors */}
      <h2 className="text-sm font-semibold text-gray-500 mb-2">Built-in</h2>
      <div className="mb-6 border rounded-lg divide-y">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <span className="font-medium">HubSpot</span>
            <span className="text-xs text-gray-400 ml-2">hubspot v1.0.0</span>
          </div>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Code-based</span>
        </div>
      </div>

      {/* Config-driven connectors */}
      <h2 className="text-sm font-semibold text-gray-500 mb-2">Config-Driven</h2>
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : definitions.length === 0 ? (
        <p className="text-sm text-gray-400">No config-driven connectors yet. Click "New Connector" to create one.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {definitions.map((def) => (
            <div key={def.slug} className="px-4 py-3 flex items-center justify-between">
              <div>
                <Link href={`/admin/connectors/wizard?edit=${def.slug}`}
                  className="font-medium text-blue-600 hover:underline">
                  {def.name}
                </Link>
                <span className="text-xs text-gray-400 ml-2">{def.slug} v{def.version}</span>
                {def.description && <p className="text-xs text-gray-500 mt-0.5">{def.description}</p>}
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(def.status)}`}>
                {def.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
