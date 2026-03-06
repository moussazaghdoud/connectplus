"use client";

import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { HealthDot } from "./HealthDot";

interface ConnectorCardProps {
  slug: string;
  name: string;
  shortDesc: string;
  category: string;
  tier: string;
  status: string;
  authType: string;
  lastHealthStatus: boolean | null;
  lastHealthLatency: number | null;
  tokenStatus: "valid" | "expired" | "missing";
  tenantConfigured: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  CRM: "CRM",
  HELPDESK: "Helpdesk",
  COLLABORATION: "Collaboration",
  OTHER: "Other",
};

/**
 * Local connector logos — served from /public/connectors/.
 * Guaranteed to load (no external CDN dependency).
 */
function getLogoUrl(slug: string): string {
  return `/connectors/${slug}.svg`;
}

/** Fallback letter + gradient when no logo is found */
const CONNECTOR_COLORS: Record<string, string> = {
  hubspot: "from-orange-500 to-orange-600",
  "zoho-crm": "from-red-500 to-red-600",
  salesforce: "from-blue-500 to-blue-600",
  "dynamics-365": "from-indigo-500 to-indigo-600",
  zendesk: "from-emerald-500 to-emerald-600",
  freshdesk: "from-green-500 to-green-600",
  servicenow: "from-teal-500 to-teal-600",
  pipedrive: "from-gray-700 to-gray-800",
  intercom: "from-blue-400 to-blue-500",
  "monday-crm": "from-pink-500 to-pink-600",
  copper: "from-orange-400 to-orange-500",
  freshsales: "from-blue-600 to-blue-700",
  close: "from-gray-800 to-gray-900",
  sugarcrm: "from-red-600 to-red-700",
  insightly: "from-indigo-400 to-indigo-500",
  nutshell: "from-yellow-500 to-yellow-600",
  capsule: "from-blue-500 to-blue-600",
  keap: "from-green-600 to-green-700",
  bitrix24: "from-sky-500 to-sky-600",
  "zoho-desk": "from-red-500 to-red-600",
  "jira-sm": "from-blue-600 to-blue-700",
  helpscout: "from-blue-500 to-blue-600",
  front: "from-rose-500 to-rose-600",
  happyfox: "from-yellow-500 to-yellow-600",
  kayako: "from-teal-500 to-teal-600",
  "sap-sales": "from-blue-700 to-blue-800",
  "oracle-cx": "from-red-700 to-red-800",
  odoo: "from-purple-600 to-purple-700",
  creatio: "from-blue-500 to-blue-600",
};

function ConnectorLogo({ slug, name }: { slug: string; name: string }) {
  const logoUrl = getLogoUrl(slug);
  const gradient = CONNECTOR_COLORS[slug] ?? "from-gray-500 to-gray-600";
  const fallbackLetter = name.charAt(0).toUpperCase();

  if (logoUrl) {
    return (
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white border border-gray-100 flex items-center justify-center p-1.5 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={`${name} logo`}
          width={28}
          height={28}
          className="object-contain w-7 h-7"
          loading="lazy"
          onError={(e) => {
            const target = e.currentTarget;
            target.style.display = "none";
            const parent = target.parentElement;
            if (parent) {
              parent.className = `flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-bold`;
              parent.textContent = fallbackLetter;
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className={`flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-bold`}>
      {fallbackLetter}
    </div>
  );
}

export function ConnectorCard({
  slug,
  name,
  shortDesc,
  category,
  tier,
  status,
  lastHealthStatus,
  lastHealthLatency,
  tokenStatus,
  tenantConfigured,
}: ConnectorCardProps) {
  const isActive = status === "ACTIVE";
  const isPlanned = status === "DRAFT";

  const ctaLabel = isActive
    ? tenantConfigured
      ? "Configure"
      : "Set Up"
    : isPlanned
      ? "View Details"
      : "Manage";

  return (
    <Link
      href={`/admin/connectors/${slug}`}
      className="group block rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:shadow-md transition-all duration-200"
    >
      <div className="p-5">
        {/* Header: logo + name + badges */}
        <div className="flex items-start gap-3 mb-3">
          <ConnectorLogo slug={slug} name={name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{name}</h3>
              <StatusBadge status={status} />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">{CATEGORY_LABELS[category] ?? category}</span>
              {tier === "CODE_BASED" && (
                <span className="text-xs text-purple-500 font-medium">Built-in</span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-gray-500 mb-3 line-clamp-2 min-h-[2rem]">
          {shortDesc || `${name} integration for Rainbow`}
        </p>

        {/* Health indicators (only for active + configured) */}
        {isActive && tenantConfigured && (
          <div className="flex items-center gap-3 mb-3 text-xs">
            <HealthDot
              status={lastHealthStatus}
              label={lastHealthLatency != null ? `${lastHealthLatency}ms` : undefined}
            />
            {tokenStatus === "valid" && (
              <span className="text-green-600">Token OK</span>
            )}
            {tokenStatus === "expired" && (
              <span className="text-yellow-600">Token expired</span>
            )}
            {tokenStatus === "missing" && (
              <span className="text-gray-400">No token</span>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-blue-600 group-hover:text-blue-700">
            {ctaLabel} &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
