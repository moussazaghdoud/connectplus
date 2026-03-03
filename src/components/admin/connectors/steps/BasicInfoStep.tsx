"use client";

import type { WizardState } from "../WizardShell";

interface StepProps {
  state: WizardState;
  dispatch: React.Dispatch<{ type: string; field?: string; path?: string; value?: unknown }>;
  apiKey: string;
}

export function BasicInfoStep({ state, dispatch }: StepProps) {
  const set = (field: keyof WizardState, value: string) =>
    dispatch({ type: "SET_FIELD", field, value });

  const setConfig = (path: string, value: unknown) =>
    dispatch({ type: "SET_CONFIG", path, value });

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Step 1: Basic Information</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Connector Name *</label>
        <input
          type="text"
          value={state.name}
          onChange={(e) => {
            set("name", e.target.value);
            if (!state.savedSlug) set("slug", autoSlug(e.target.value));
          }}
          placeholder="e.g. Salesforce, Zendesk, Pipedrive"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL-safe ID) *</label>
        <input
          type="text"
          value={state.slug}
          onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          disabled={!!state.savedSlug}
          placeholder="e.g. salesforce"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">Cannot be changed after first save.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={state.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          placeholder="Brief description of this CRM connector"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">API Base URL *</label>
        <input
          type="url"
          value={(state.config.apiBaseUrl as string) ?? ""}
          onChange={(e) => setConfig("apiBaseUrl", e.target.value)}
          placeholder="https://api.example-crm.com/v2"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">Base URL for all API calls. Must be HTTPS in production.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Authentication Type *</label>
        <div className="flex gap-3">
          {(["oauth2", "api_key", "basic"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setConfig("auth", { type: t, [t]: {} })}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
                ${(state.config.auth as Record<string, unknown>)?.type === t
                  ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {t === "oauth2" ? "OAuth 2.0" : t === "api_key" ? "API Key" : "Basic Auth"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL (optional)</label>
        <input
          type="url"
          value={state.logoUrl}
          onChange={(e) => set("logoUrl", e.target.value)}
          placeholder="https://example.com/logo.png"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
