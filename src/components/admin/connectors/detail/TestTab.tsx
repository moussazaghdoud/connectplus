"use client";

import { useState } from "react";
import type { ConnectorDetail } from "@/app/admin/connectors/[slug]/page";

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

interface Props {
  detail: ConnectorDetail;
  apiKey: string;
  onRefresh: () => void;
}

export function TestTab({ detail, apiKey, onRefresh }: Props) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestSuiteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Show last saved test result if available
  const savedResult = detail.lastTestResult as TestSuiteResult | null;

  const runTests = async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const resp = await fetch(`/api/v1/admin/connector-definitions/${detail.slug}/test`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error.message);
      } else {
        setResults(data);
        onRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setRunning(false);
    }
  };

  const displayResults = results ?? savedResult;

  const statusIcon = (s: string) =>
    s === "passed" ? "✓" : s === "skipped" ? "—" : "✗";

  const statusColor = (s: string) =>
    s === "passed" ? "text-green-600" : s === "skipped" ? "text-gray-400" : "text-red-600";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Test Suite</h3>
          <p className="text-xs text-gray-400">
            Runs 16 validation and connectivity tests against the connector config.
          </p>
        </div>
        <button
          onClick={runTests}
          disabled={running}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "Running..." : "Run Tests"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
      )}

      {displayResults && (
        <div className="border rounded-lg overflow-hidden">
          <div className={`px-4 py-2 text-sm font-medium flex justify-between ${
            displayResults.passed ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}>
            <span>{displayResults.passed ? "All tests passed" : "Some tests failed"}</span>
            <span className="text-xs">{displayResults.totalDurationMs}ms</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2 font-medium text-gray-600 w-8"></th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Test</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Message</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Time</th>
              </tr>
            </thead>
            <tbody>
              {displayResults.results.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className={`px-4 py-1.5 text-center font-bold ${statusColor(r.status)}`}>
                    {statusIcon(r.status)}
                  </td>
                  <td className="px-4 py-1.5 text-gray-500 text-xs">{r.category}</td>
                  <td className="px-4 py-1.5 font-mono text-xs">{r.name}</td>
                  <td className="px-4 py-1.5 text-xs text-gray-500">{r.message ?? ""}</td>
                  <td className="px-4 py-1.5 text-right text-xs text-gray-400">{r.durationMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!displayResults && !running && !error && (
        <div className="text-sm text-gray-400 text-center py-8">
          {detail.status === "DRAFT"
            ? "This connector is in Planned status. Configure it first, then run tests."
            : "No test results yet. Click \"Run Tests\" to validate the connector."}
        </div>
      )}
    </div>
  );
}
