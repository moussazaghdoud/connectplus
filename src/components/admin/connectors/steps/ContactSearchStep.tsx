"use client";

import type { WizardState } from "../WizardShell";

interface StepProps {
  state: WizardState;
  dispatch: React.Dispatch<{ type: string; path?: string; value?: unknown }>;
  apiKey: string;
}

export function ContactSearchStep({ state, dispatch }: StepProps) {
  const cs = (state.config.contactSearch as Record<string, unknown>) ?? {};
  const req = (cs.request as Record<string, unknown>) ?? {};
  const resp = (cs.response as Record<string, unknown>) ?? {};
  const fm = (state.config.contactFieldMapping as Record<string, unknown>) ?? {};

  const setCS = (path: string, value: unknown) =>
    dispatch({ type: "SET_CONFIG", path: `contactSearch.${path}`, value });
  const setFM = (path: string, value: unknown) =>
    dispatch({ type: "SET_CONFIG", path: `contactFieldMapping.${path}`, value });

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Step 3: Contact Search</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint *</label>
          <input type="text" value={(cs.endpoint as string) ?? ""} onChange={(e) => setCS("endpoint", e.target.value)}
            placeholder="/contacts/search"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Method *</label>
          <select value={(cs.method as string) ?? "POST"} onChange={(e) => setCS("method", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
            <option value="POST">POST</option>
            <option value="GET">GET</option>
          </select>
        </div>
      </div>

      {(cs.method ?? "POST") === "POST" ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Request Body Template *
            <span className="text-xs text-gray-400 ml-2">Use {"{{query}}"}, {"{{email}}"}, {"{{phone}}"}</span>
          </label>
          <textarea value={(req.bodyTemplate as string) ?? ""} onChange={(e) => setCS("request.bodyTemplate", e.target.value)}
            rows={4} placeholder={'{"query":"{{query}}","limit":20}'}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Query Parameters</label>
          <input type="text" value={JSON.stringify(req.queryParams ?? {})} onChange={(e) => {
            try { setCS("request.queryParams", JSON.parse(e.target.value)); } catch { /* ignore */ }
          }}
            placeholder='{"q":"{{query}}","limit":"20"}'
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-400 mt-1">JSON object mapping param names to values.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Results Path *</label>
          <input type="text" value={(resp.resultsPath as string) ?? ""} onChange={(e) => setCS("response.resultsPath", e.target.value)}
            placeholder="data.contacts"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-400 mt-1">Dot-path to the array in the response JSON.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ID Field *</label>
          <input type="text" value={(resp.idField as string) ?? ""} onChange={(e) => setCS("response.idField", e.target.value)}
            placeholder="id"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-400 mt-1">Field name for the external contact ID.</p>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-700 mt-6 mb-2">Field Mapping</h3>
      <p className="text-xs text-gray-400 mb-3">
        Map external fields to ConnectPlus fields. Use dot-paths (e.g. <code>properties.email</code>) or templates (e.g. <code>{"{{first_name}} {{last_name}}"}</code>).
      </p>

      <div className="space-y-2">
        {[
          { key: "displayName", label: "Display Name *", placeholder: "{{properties.firstname}} {{properties.lastname}}" },
          { key: "email", label: "Email", placeholder: "properties.email" },
          { key: "phone", label: "Phone", placeholder: "properties.phone || properties.mobilephone" },
          { key: "company", label: "Company", placeholder: "properties.company" },
          { key: "title", label: "Job Title", placeholder: "properties.jobtitle" },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="grid grid-cols-[140px_1fr] gap-2 items-center">
            <label className="text-sm text-gray-600">{label}</label>
            <input type="text" value={(fm[key] as string) ?? ""} onChange={(e) => setFM(key, e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}
      </div>
    </div>
  );
}
