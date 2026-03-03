"use client";

import type { WizardState } from "../WizardShell";

interface StepProps {
  state: WizardState;
  dispatch: React.Dispatch<{ type: string; path?: string; value?: unknown }>;
  apiKey: string;
}

export function AuthSetupStep({ state, dispatch }: StepProps) {
  const auth = (state.config.auth as Record<string, unknown>) ?? {};
  const authType = (auth.type as string) ?? "api_key";
  const sub = (auth[authType] as Record<string, unknown>) ?? {};

  const setAuth = (subPath: string, value: unknown) =>
    dispatch({ type: "SET_CONFIG", path: `auth.${authType}.${subPath}`, value });

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Step 2: Authentication</h2>
      <p className="text-sm text-gray-500">
        Type: <span className="font-medium">{authType === "oauth2" ? "OAuth 2.0" : authType === "api_key" ? "API Key" : "Basic Auth"}</span>
        <span className="text-xs ml-2">(change in Step 1)</span>
      </p>

      {authType === "oauth2" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Authorize URL *</label>
            <input type="url" value={(sub.authorizeUrl as string) ?? ""} onChange={(e) => setAuth("authorizeUrl", e.target.value)}
              placeholder="https://login.example.com/oauth/authorize"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Token URL *</label>
            <input type="url" value={(sub.tokenUrl as string) ?? ""} onChange={(e) => setAuth("tokenUrl", e.target.value)}
              placeholder="https://login.example.com/oauth/token"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scopes (comma-separated) *</label>
            <input type="text" value={Array.isArray(sub.scopes) ? (sub.scopes as string[]).join(", ") : (sub.scopes as string) ?? ""}
              onChange={(e) => setAuth("scopes", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))}
              placeholder="api, contacts.read, contacts.write"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Token Placement</label>
              <select value={(sub.tokenPlacement as string) ?? "header"} onChange={(e) => setAuth("tokenPlacement", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                <option value="header">Authorization Header</option>
                <option value="query">Query Parameter</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Token Prefix</label>
              <input type="text" value={(sub.tokenPrefix as string) ?? "Bearer"} onChange={(e) => setAuth("tokenPrefix", e.target.value)}
                placeholder="Bearer"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
      )}

      {authType === "api_key" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Header Name *</label>
            <input type="text" value={(sub.headerName as string) ?? ""} onChange={(e) => setAuth("headerName", e.target.value)}
              placeholder="X-Api-Key or Authorization"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prefix (optional)</label>
            <input type="text" value={(sub.prefix as string) ?? ""} onChange={(e) => setAuth("prefix", e.target.value)}
              placeholder="e.g. Key  or Token "
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">Prepended before the key value. Include trailing space if needed.</p>
          </div>
        </div>
      )}

      {authType === "basic" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username Field Name</label>
            <input type="text" value={(sub.usernameField as string) ?? "username"} onChange={(e) => setAuth("usernameField", e.target.value)}
              placeholder="username"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">Key name in the credentials store for the username.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password Field Name</label>
            <input type="text" value={(sub.passwordField as string) ?? "password"} onChange={(e) => setAuth("passwordField", e.target.value)}
              placeholder="password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}
    </div>
  );
}
