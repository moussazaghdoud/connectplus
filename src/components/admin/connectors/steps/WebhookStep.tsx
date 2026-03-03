"use client";

import type { WizardState } from "../WizardShell";

interface StepProps {
  state: WizardState;
  dispatch: React.Dispatch<{ type: string; path?: string; field?: string; value?: unknown }>;
  apiKey: string;
}

export function WebhookStep({ state, dispatch }: StepProps) {
  const wh = (state.config.webhook as Record<string, unknown>) ?? {};
  const enabled = !!state.config.webhook;
  const mapping = (wh.eventTypeMapping as Record<string, string>) ?? {};

  const setWH = (path: string, value: unknown) =>
    dispatch({ type: "SET_CONFIG", path: `webhook.${path}`, value });

  const toggleEnabled = () => {
    if (enabled) {
      const { webhook: _, ...rest } = state.config;
      dispatch({ type: "SET_FIELD", field: "config", value: rest });
    } else {
      setWH("signatureMethod", "hmac_sha256");
      setWH("signatureHeader", "X-Signature-256");
      setWH("eventTypeField", "event_type");
      setWH("eventTypeMapping", {});
      setWH("externalIdField", "data.id");
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Step 5: Webhooks (Optional)</h2>
      <p className="text-sm text-gray-500">Receive real-time events from the CRM (contact changes, click-to-call).</p>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={toggleEnabled}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <span className="text-sm font-medium text-gray-700">Enable webhooks</span>
      </label>

      {enabled && (
        <div className="space-y-4 pl-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Signature Method *</label>
            <select value={(wh.signatureMethod as string) ?? "hmac_sha256"} onChange={(e) => setWH("signatureMethod", e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="hmac_sha256">HMAC-SHA256</option>
              <option value="hmac_sha1">HMAC-SHA1</option>
              <option value="static_token">Static Token</option>
              <option value="none">None (no verification)</option>
            </select>
          </div>

          {((wh.signatureMethod as string) === "hmac_sha256" || (wh.signatureMethod as string) === "hmac_sha1") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Signature Header</label>
                <input type="text" value={(wh.signatureHeader as string) ?? ""} onChange={(e) => setWH("signatureHeader", e.target.value)}
                  placeholder="X-Signature-256"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Signature Prefix</label>
                <input type="text" value={(wh.signaturePrefix as string) ?? ""} onChange={(e) => setWH("signaturePrefix", e.target.value)}
                  placeholder="sha256="
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Type Field *</label>
              <input type="text" value={(wh.eventTypeField as string) ?? ""} onChange={(e) => setWH("eventTypeField", e.target.value)}
                placeholder="event_type"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">External ID Field *</label>
              <input type="text" value={(wh.externalIdField as string) ?? ""} onChange={(e) => setWH("externalIdField", e.target.value)}
                placeholder="data.id"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Event Type Mapping</label>
            <div className="space-y-1">
              {Object.entries(mapping).map(([ext, canon]) => (
                <div key={ext} className="flex gap-2 items-center">
                  <input type="text" value={ext} readOnly className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-mono bg-gray-50" />
                  <span className="text-gray-400 text-xs">&rarr;</span>
                  <input type="text" value={canon} readOnly className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-mono bg-gray-50" />
                  <button type="button" onClick={() => {
                    const { [ext]: _, ...rest } = mapping;
                    setWH("eventTypeMapping", rest);
                  }} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input type="text" placeholder="External type" id="wh-ext-type"
                className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-mono focus:ring-2 focus:ring-blue-500" />
              <select id="wh-canon-type" className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500">
                <option value="contact_created">contact_created</option>
                <option value="contact_updated">contact_updated</option>
                <option value="contact_deleted">contact_deleted</option>
                <option value="click_to_call">click_to_call</option>
                <option value="custom">custom</option>
              </select>
              <button type="button" onClick={() => {
                const ext = (document.getElementById("wh-ext-type") as HTMLInputElement).value.trim();
                const canon = (document.getElementById("wh-canon-type") as HTMLSelectElement).value;
                if (ext) setWH("eventTypeMapping", { ...mapping, [ext]: canon });
              }} className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
