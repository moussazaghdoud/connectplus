"use client";

import { useState } from "react";
import type { ConnectorDetail } from "@/app/admin/connectors/[slug]/page";
import type { SetupStep } from "@/lib/connectors/marketplace/types";

interface Props {
  detail: ConnectorDetail;
  apiKey: string;
  onRefresh: () => void;
}

export function SetupTab({ detail, apiKey, onRefresh }: Props) {
  const steps = (detail.setupSteps ?? []) as SetupStep[];
  const [currentStep, setCurrentStep] = useState(0);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ passed: boolean; message: string } | null>(null);

  if (steps.length === 0) {
    return (
      <div className="text-sm text-gray-400">
        {detail.tier === "CODE_BASED"
          ? "This is a built-in connector. Setup is done via the connector configuration API."
          : "No setup steps defined for this connector."}
      </div>
    );
  }

  const step = steps[currentStep];
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const resolveTemplate = (tmpl: string) =>
    tmpl.replace(/\{\{baseUrl\}\}/g, baseUrl).replace(/\{\{slug\}\}/g, detail.slug);

  const saveCredentials = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const redirectUri = `${baseUrl}/api/v1/auth/${detail.slug}/callback`;
      const resp = await fetch("/api/v1/admin/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          connectorId: detail.slug,
          credentials: { ...credentials, redirectUri },
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setMessage({ ok: true, text: "Credentials saved and encrypted." });
        onRefresh();
      } else {
        setMessage({ ok: false, text: data.error?.message ?? `HTTP ${resp.status}` });
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTestResult(null);
    try {
      const resp = await fetch(`/api/v1/admin/connector-definitions/${detail.slug}/test`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await resp.json();
      if (data.error) {
        setTestResult({ passed: false, message: data.error.message });
      } else {
        setTestResult({ passed: data.passed, message: data.passed ? "All tests passed" : "Some tests failed" });
      }
    } catch (err) {
      setTestResult({ passed: false, message: err instanceof Error ? err.message : "Test failed" });
    }
  };

  const activateConnector = async () => {
    setMessage(null);
    try {
      const resp = await fetch(`/api/v1/admin/marketplace/connectors/${detail.slug}/activate`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await resp.json();
      if (data.error) {
        setMessage({ ok: false, text: data.error.message });
      } else {
        setMessage({ ok: true, text: "Connector activated!" });
        onRefresh();
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Activation failed" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setCurrentStep(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              i === currentStep
                ? "bg-blue-100 text-blue-700"
                : i < currentStep
                  ? "bg-green-50 text-green-600"
                  : "bg-gray-100 text-gray-400"
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-current/10 flex items-center justify-center text-[10px]">
              {i < currentStep ? "✓" : i + 1}
            </span>
            {s.title}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-1">{step.title}</h3>
        {step.description && <p className="text-sm text-gray-500 mb-4">{step.description}</p>}

        {/* SELECT step */}
        {step.type === "select" && step.options && (
          <div>
            <select
              value={credentials[step.field ?? "region"] ?? step.default ?? ""}
              onChange={(e) => setCredentials({ ...credentials, [step.field ?? "region"]: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500"
            >
              {step.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* INSTRUCTION step */}
        {step.type === "instruction" && (
          <div>
            {step.content && (
              <div className="text-sm text-gray-600 whitespace-pre-wrap mb-4">{step.content}</div>
            )}
            {step.copyBlocks?.map((block) => (
              <div key={block.label} className="bg-gray-50 rounded-lg p-3 mb-3">
                <p className="text-xs text-gray-400 mb-1">{block.label}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-white px-2 py-1 rounded border text-gray-700 break-all">
                    {resolveTemplate(block.template)}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(resolveTemplate(block.template))}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CREDENTIALS step */}
        {step.type === "credentials" && step.fields && (
          <div className="space-y-4">
            {step.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label} {field.required && <span className="text-red-400">*</span>}
                </label>
                <input
                  type={field.type === "secret" ? "password" : "text"}
                  value={credentials[field.key] ?? ""}
                  onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <button
              onClick={saveCredentials}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Credentials"}
            </button>
          </div>
        )}

        {/* OAUTH step */}
        {step.type === "oauth" && (
          <div className="space-y-3">
            {!detail.tenantConfigured && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
                Complete the credentials step first before authorizing.
              </div>
            )}
            {detail.tenantConfigured && (
              <a
                href={`/api/v1/auth/${detail.slug}?key=${apiKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700"
              >
                {step.buttonLabel ?? `Connect ${detail.name}`}
              </a>
            )}
          </div>
        )}

        {/* TEST step */}
        {step.type === "test" && (
          <div className="space-y-3">
            <button
              onClick={runTest}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
            >
              Run Test
            </button>
            {testResult && (
              <div className={`p-3 border rounded text-sm ${testResult.passed ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                {testResult.message}
              </div>
            )}
          </div>
        )}

        {/* ACTIVATE step */}
        {step.type === "activate" && (
          <div className="space-y-3">
            <button
              onClick={activateConnector}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
            >
              Activate Connector
            </button>
            <p className="text-xs text-gray-400">
              Activation validates the config, registers the connector in the runtime, and makes it available to all agents.
            </p>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className={`mt-4 p-3 border rounded text-sm ${message.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {message.text}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          Previous
        </button>
        <button
          onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
          disabled={currentStep === steps.length - 1}
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
