"use client";

import type { WizardState } from "../WizardShell";

interface StepProps {
  state: WizardState;
  dispatch: React.Dispatch<{ type: string; path?: string; field?: string; value?: unknown }>;
  apiKey: string;
}

export function WriteBackStep({ state, dispatch }: StepProps) {
  const wb = (state.config.writeBack as Record<string, unknown>) ?? {};
  const enabled = !!state.config.writeBack;

  const setWB = (path: string, value: unknown) =>
    dispatch({ type: "SET_CONFIG", path: `writeBack.${path}`, value });

  const toggleEnabled = () => {
    if (enabled) {
      // Remove writeBack from config
      const { writeBack: _, ...rest } = state.config;
      dispatch({ type: "SET_FIELD", field: "config", value: rest });
    } else {
      setWB("endpoint", "/calls");
      setWB("method", "POST");
      setWB("bodyTemplate", '{"type":"{{interaction.type}}","status":"{{interaction.status}}"}');
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Step 4: Write-Back (Optional)</h2>
      <p className="text-sm text-gray-500">Push call records back to the CRM after interactions complete.</p>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={toggleEnabled}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <span className="text-sm font-medium text-gray-700">Enable write-back</span>
      </label>

      {enabled && (
        <div className="space-y-4 pl-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint *</label>
              <input type="text" value={(wb.endpoint as string) ?? ""} onChange={(e) => setWB("endpoint", e.target.value)}
                placeholder="/calls"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Method *</label>
              <select value={(wb.method as string) ?? "POST"} onChange={(e) => setWB("method", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Body Template *
              <span className="text-xs text-gray-400 ml-2">JSON with {"{{interaction.*}}"} variables</span>
            </label>
            <textarea value={(wb.bodyTemplate as string) ?? ""} onChange={(e) => setWB("bodyTemplate", e.target.value)}
              rows={6}
              placeholder={'{\n  "type": "{{interaction.type}}",\n  "status": "{{interaction.status}}",\n  "duration": {{interaction.durationSecs}},\n  "direction": "{{interaction.direction}}"\n}'}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" />
            <div className="flex flex-wrap gap-1 mt-2">
              {["interaction.type", "interaction.status", "interaction.direction", "interaction.durationSecs", "interaction.targetPhone", "interaction.failureReason"].map((v) => (
                <button key={v} type="button"
                  onClick={() => {
                    const current = (wb.bodyTemplate as string) ?? "";
                    setWB("bodyTemplate", current + `{{${v}}}`);
                  }}
                  className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
