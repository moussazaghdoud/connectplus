"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ConnectorCard } from "@/components/admin/connectors/marketplace/ConnectorCard";
import { ConnectorFilters } from "@/components/admin/connectors/marketplace/ConnectorFilters";

interface MarketplaceEntry {
  slug: string;
  name: string;
  shortDesc: string;
  category: string;
  tier: string;
  authType: string;
  status: string;
  lastHealthStatus: boolean | null;
  lastHealthLatency: number | null;
  tokenStatus: "valid" | "expired" | "missing";
  tenantConfigured: boolean;
  tenantEnabled: boolean;
}

export default function ConnectorMarketplacePage() {
  const [apiKey, setApiKey] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("connectplus_api_key") : "") ?? ""
  );
  const [inputKey, setInputKey] = useState(apiKey);
  const [connectors, setConnectors] = useState<MarketplaceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("category", categoryFilter);

    fetch(`/api/v1/admin/marketplace/connectors?${params.toString()}`, {
      headers: { "x-api-key": apiKey },
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error?.message ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => setConnectors(data.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiKey, statusFilter, categoryFilter]);

  // Client-side search filter (instant, no API call)
  const filtered = useMemo(() => {
    if (!search) return connectors;
    const q = search.toLowerCase();
    return connectors.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.shortDesc.toLowerCase().includes(q)
    );
  }, [connectors, search]);

  // Group: active first, then planned, then others
  const grouped = useMemo(() => {
    const active = filtered.filter((c) => c.status === "ACTIVE");
    const planned = filtered.filter((c) => c.status === "DRAFT");
    const other = filtered.filter((c) => c.status !== "ACTIVE" && c.status !== "DRAFT");
    return { active, planned, other };
  }, [filtered]);

  // API key prompt
  if (!apiKey) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-xl font-bold mb-2">Connector Marketplace</h1>
        <p className="text-sm text-gray-500 mb-4">Enter your API key to view connectors.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setApiKey(inputKey);
            localStorage.setItem("connectplus_api_key", inputKey);
          }}
        >
          <input
            type="text"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            placeholder="cp_xxxxxxxxxxxxxxxx"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono mb-3 focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          >
            Continue
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connector Marketplace</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure and manage integrations with CRMs, helpdesks, and collaboration tools.
          </p>
        </div>
        <Link
          href="/admin/connectors/wizard"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Custom Connector
        </Link>
      </div>

      {/* Filters */}
      <ConnectorFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
      />

      {/* Loading / Error */}
      {loading && (
        <div className="text-center py-12 text-gray-400 text-sm">Loading connectors...</div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-6">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => {
              localStorage.removeItem("connectplus_api_key");
              setApiKey("");
            }}
            className="text-xs text-red-500 underline mt-1"
          >
            Change API key
          </button>
        </div>
      )}

      {/* Connector Grid */}
      {!loading && !error && (
        <>
          {/* Active connectors */}
          {grouped.active.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Active ({grouped.active.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped.active.map((c) => (
                  <ConnectorCard key={c.slug} {...c} />
                ))}
              </div>
            </section>
          )}

          {/* Planned connectors */}
          {grouped.planned.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Planned ({grouped.planned.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped.planned.map((c) => (
                  <ConnectorCard key={c.slug} {...c} />
                ))}
              </div>
            </section>
          )}

          {/* Other statuses */}
          {grouped.other.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Other ({grouped.other.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped.other.map((c) => (
                  <ConnectorCard key={c.slug} {...c} />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">
                {search || statusFilter || categoryFilter
                  ? "No connectors match your filters."
                  : "No connectors found. Create one with the wizard above."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
