"use client";

import { useState } from "react";
import type { WizardState } from "../WizardShell";

interface StepProps {
  state: WizardState;
  dispatch: React.Dispatch<{ type: string; field?: string; value?: unknown }>;
  apiKey: string;
}

interface TestResult {
  category: string;
  name: string;
  status: "passed" | "failed" | "skipped" | "error";
  durationMs: number;
  message?: string;
}

interface TestSuiteResult {
  passed: boolean;
  results: TestResult[];
  totalDurationMs: number;
}

export function TestActivateStep({ state, apiKey }: StepProps) {
  const [testing, setTesting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [testResults, setTestResults] = useState<TestSuiteResult | null>(null);
  const [error, setError] = useState("");

  const slug = state.savedSlug;

  const runTests = async () => {
    if (!slug) { setError("Save the connector first (go back and click Next)"); return; }
    setTesting(true);
    setError("");
    try {
      const resp = await fetch(`/api/v1/admin/connector-definitions/${slug}/test`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error.message);
      } else {
        setTestResults(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const activate = async () => {
    if (!slug) return;
    setActivating(true);
    setError("");
    try {
      const resp = await fetch(`/api/v1/admin/connector-definitions/${slug}/activate`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error.message);
      } else {
        setError("");
        alert(`Connector "${state.name}" activated! It's now live in the registry.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setActivating(false);
    }
  };

  const statusIcon = (s: string) =>
    s === "passed" ? "✓" : s === "skipped" ? "—" : s === "failed" ? "✗" : "!";

  const statusColor = (s: string) =>
    s === "passed" ? "text-green-600" : s === "skipped" ? "text-gray-400" : "text-red-600";

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Step 6: Test & Activate</h2>

      {!slug && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
          Save your connector first by going back and clicking "Next" through the steps.
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
      )}

      <div className="flex gap-3">
        <button onClick={runTests} disabled={testing || !slug}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50">
          {testing ? "Running tests..." : "Run Test Suite"}
        </button>
        <button onClick={activate}
          disabled={activating || !slug || !testResults?.passed}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50">
          {activating ? "Activating..." : "Activate Connector"}
        </button>
      </div>

      {testResults && (
        <div className="border rounded-lg overflow-hidden">
          <div className={`px-4 py-2 text-sm font-medium ${testResults.passed ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {testResults.passed ? "All tests passed" : "Some tests failed"} — {testResults.totalDurationMs}ms
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Test</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Message</th>
              </tr>
            </thead>
            <tbody>
              {testResults.results.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-1.5 text-gray-500 text-xs">{r.category}</td>
                  <td className="px-4 py-1.5 font-mono text-xs">{r.name}</td>
                  <td className={`px-4 py-1.5 text-center font-bold ${statusColor(r.status)}`}>
                    {statusIcon(r.status)}
                  </td>
                  <td className="px-4 py-1.5 text-xs text-gray-500">{r.message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-400 mt-4">
        <p>Status: <span className="font-medium">{state.status}</span></p>
        <p>Slug: <span className="font-mono">{slug ?? "(not saved)"}</span></p>
      </div>
    </div>
  );
}
