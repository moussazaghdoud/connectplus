"use client";

import type { ConnectorDetail } from "@/app/admin/connectors/[slug]/page";

interface Props {
  detail: ConnectorDetail;
}

const CANONICAL_FIELDS = [
  { key: "displayName", label: "Display Name", description: "Contact's full name" },
  { key: "email", label: "Email", description: "Primary email address" },
  { key: "phone", label: "Phone", description: "Primary phone number" },
  { key: "company", label: "Company", description: "Organization or account name" },
  { key: "title", label: "Title", description: "Job title or role" },
  { key: "avatarUrl", label: "Avatar URL", description: "Profile picture URL" },
];

export function MappingTab({ detail }: Props) {
  // Try to extract field mapping from the config if available
  const config = (detail as unknown as { config?: Record<string, unknown> }).config;
  const fieldMapping = (config as Record<string, unknown>)?.contactFieldMapping as Record<string, string> | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Contact Field Mapping</h3>
        <p className="text-xs text-gray-400 mb-4">
          Maps external CRM fields to the canonical ConnectPlus contact model. Supports dot-path (e.g. <code>properties.email</code>),
          template interpolation (e.g. <code>{"{{First_Name}} {{Last_Name}}"}</code>), and fallback chains (e.g. <code>Phone || Mobile</code>).
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-2 font-medium text-gray-600">ConnectPlus Field</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">External Mapping</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Description</th>
            </tr>
          </thead>
          <tbody>
            {CANONICAL_FIELDS.map((field) => {
              const mapping = fieldMapping?.[field.key];
              return (
                <tr key={field.key} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium text-gray-700">{field.label}</td>
                  <td className="px-4 py-2">
                    {mapping ? (
                      <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-700">{mapping}</code>
                    ) : (
                      <span className="text-xs text-gray-400">Not mapped</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400">{field.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!fieldMapping && (
        <p className="text-sm text-gray-400">
          Field mapping is not available for display. {detail.tier === "CODE_BASED"
            ? "Code-based connectors define field mapping in their source code."
            : "Configure this connector via the Setup tab to define field mappings."}
        </p>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">Mapping Syntax Reference</p>
        <ul className="text-xs space-y-1 text-blue-600">
          <li><code className="bg-blue-100 px-1 rounded">Email</code> — Direct field name</li>
          <li><code className="bg-blue-100 px-1 rounded">properties.email</code> — Dot-path into nested object</li>
          <li><code className="bg-blue-100 px-1 rounded">{"{{First_Name}} {{Last_Name}}"}</code> — Template interpolation</li>
          <li><code className="bg-blue-100 px-1 rounded">Phone || Mobile</code> — Fallback chain (try Phone first)</li>
        </ul>
      </div>
    </div>
  );
}
