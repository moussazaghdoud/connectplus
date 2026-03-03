"use client";

import { useState } from "react";
import type { WizardState } from "../WizardShell";

interface StepProps {
  state: WizardState;
  dispatch: never;
  apiKey: string;
}

export function ConnectAccountStep({ state, apiKey }: StepProps) {
  const slug = state.savedSlug;
  const authType = ((state.config.auth as Record<string, unknown>)?.type as string) ?? "api_key";

  // Credential fields based on auth type
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(
    typeof window !== "undefined" ? `${window.location.origin}/api/v1/auth/${slug}/callback` : ""
  );
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const save = async () => {
    if (!slug) { setResult({ ok: false, message: "Connector not saved yet" }); return; }
    setSaving(true);
    setResult(null);

    let credentials: Record<string, string> = {};
    if (authType === "oauth2") {
      credentials = { clientId, clientSecret, redirectUri };
    } else if (authType === "api_key") {
      credentials = { apiKey: apiKeyValue };
    } else if (authType === "basic") {
      credentials = { username, password };
    }

    try {
      const resp = await fetch("/api/v1/admin/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ connectorId: slug, credentials }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setResult({ ok: true, message: "Credentials saved! Connector is ready to use." });
      } else {
        setResult({ ok: false, message: data.error?.message ?? `HTTP ${resp.status}` });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Step 7: Connect Your Account</h2>
      <p className="text-sm text-gray-500">
        Enter your <span className="font-medium">{state.name}</span> credentials. These are encrypted and stored per-tenant.
      </p>

      {!slug && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
          Complete Steps 1-6 first and activate the connector.
        </div>
      )}

      {authType === "oauth2" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client ID *</label>
            <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)}
              placeholder="Your app's client ID from the CRM developer portal"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret *</label>
            <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Your app's client secret"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Redirect URI</label>
            <input type="text" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">Register this URL in your CRM app's OAuth settings.</p>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
            After saving, you'll need to complete the OAuth flow to get access/refresh tokens.
            The OAuth authorization URL will be available at: <code className="text-xs">/api/v1/auth/{slug}</code>
          </div>
        </div>
      )}

      {authType === "api_key" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key *</label>
            <input type="password" value={apiKeyValue} onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder="Your CRM API key or token"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}

      {authType === "basic" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="Your CRM username"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Your CRM password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}

      {result && (
        <div className={`p-3 border rounded text-sm ${result.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {result.message}
        </div>
      )}

      <button onClick={save} disabled={saving || !slug}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50">
        {saving ? "Saving..." : "Save Credentials"}
      </button>

      <p className="text-xs text-gray-400">
        Credentials are encrypted with AES-256-GCM and stored per-tenant. They are never logged or exposed in the API.
      </p>
    </div>
  );
}
