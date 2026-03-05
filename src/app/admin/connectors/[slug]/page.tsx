"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/connectors/marketplace/StatusBadge";
import { OverviewTab } from "@/components/admin/connectors/detail/OverviewTab";
import { SetupTab } from "@/components/admin/connectors/detail/SetupTab";
import { MappingTab } from "@/components/admin/connectors/detail/MappingTab";
import { WebhooksTab } from "@/components/admin/connectors/detail/WebhooksTab";
import { TestTab } from "@/components/admin/connectors/detail/TestTab";
import { DeployTab } from "@/components/admin/connectors/detail/DeployTab";
import { AuditTab } from "@/components/admin/connectors/detail/AuditTab";

export interface ConnectorDetail {
  slug: string;
  name: string;
  shortDesc: string;
  description: string;
  category: string;
  tier: string;
  authType: string;
  status: string;
  version: number;
  vendorUrl: string | null;
  docsUrl: string | null;
  iconName: string | null;
  pricingTier: string | null;
  logoUrl: string | null;
  prerequisites: string[];
  setupSteps: unknown[];
  lastTestResult: unknown;
  lastHealthAt: string | null;
  lastHealthStatus: boolean | null;
  lastHealthLatency: number | null;
  lastTokenRefreshAt: string | null;
  lastWebhookAt: string | null;
  tenantConfigured: boolean;
  tenantEnabled: boolean;
  tokenStatus: "valid" | "expired" | "missing";
  credentialStatus: Record<string, string>;
  versions: { version: number; changedBy: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "setup", label: "Setup" },
  { id: "mapping", label: "Mapping" },
  { id: "webhooks", label: "Webhooks" },
  { id: "test", label: "Test" },
  { id: "deploy", label: "Deploy" },
  { id: "audit", label: "Audit" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ConnectorDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [apiKey, setApiKey] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("connectplus_api_key") : "") ?? ""
  );
  const [inputKey, setInputKey] = useState(apiKey);
  const [detail, setDetail] = useState<ConnectorDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const fetchDetail = useCallback(() => {
    if (!apiKey || !slug) return;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/admin/marketplace/connectors/${slug}`, {
      headers: { "x-api-key": apiKey },
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error?.message ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => setDetail(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiKey, slug]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // API key prompt
  if (!apiKey) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-xl font-bold mb-2">Connector Detail</h1>
        <p className="text-sm text-gray-500 mb-4">Enter your API key to continue.</p>
        <form onSubmit={(e) => { e.preventDefault(); setApiKey(inputKey); localStorage.setItem("connectplus_api_key", inputKey); }}>
          <input type="text" value={inputKey} onChange={(e) => setInputKey(e.target.value)}
            placeholder="cp_xxxxxxxxxxxxxxxx"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono mb-3 focus:ring-2 focus:ring-blue-500" />
          <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700">Continue</button>
        </form>
      </div>
    );
  }

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 text-gray-400 text-sm">Loading connector...</div>;
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700">{error}</p>
          <Link href="/admin/connectors" className="text-xs text-red-500 underline mt-2 inline-block">Back to marketplace</Link>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/admin/connectors" className="text-sm text-blue-600 hover:underline">&larr; Marketplace</Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{detail.name}</h1>
            <StatusBadge status={detail.status} />
            {detail.tier === "CODE_BASED" && (
              <span className="text-xs text-purple-500 font-medium bg-purple-50 px-2 py-0.5 rounded-full">Built-in</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">{detail.shortDesc || detail.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            <span>v{detail.version}</span>
            <span>{detail.category}</span>
            <span>Auth: {detail.authType}</span>
            {detail.vendorUrl && (
              <a href={detail.vendorUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                Vendor site
              </a>
            )}
            {detail.docsUrl && (
              <a href={detail.docsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                API docs
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab detail={detail} apiKey={apiKey} />}
      {activeTab === "setup" && <SetupTab detail={detail} apiKey={apiKey} onRefresh={fetchDetail} />}
      {activeTab === "mapping" && <MappingTab detail={detail} />}
      {activeTab === "webhooks" && <WebhooksTab detail={detail} />}
      {activeTab === "test" && <TestTab detail={detail} apiKey={apiKey} onRefresh={fetchDetail} />}
      {activeTab === "deploy" && <DeployTab detail={detail} apiKey={apiKey} onRefresh={fetchDetail} />}
      {activeTab === "audit" && <AuditTab detail={detail} apiKey={apiKey} />}
    </div>
  );
}
