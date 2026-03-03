"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { WizardShell } from "@/components/admin/connectors/WizardShell";

function WizardContent() {
  const searchParams = useSearchParams();
  const editSlug = searchParams.get("edit") ?? undefined;
  const [apiKey, setApiKey] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("connectplus_api_key") : "") ?? ""
  );
  const [inputKey, setInputKey] = useState(apiKey);

  if (!apiKey) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-xl font-bold mb-4">Connector Wizard</h1>
        <p className="text-sm text-gray-500 mb-4">Enter your API key to continue.</p>
        <form onSubmit={(e) => { e.preventDefault(); setApiKey(inputKey); localStorage.setItem("connectplus_api_key", inputKey); }}>
          <input type="text" value={inputKey} onChange={(e) => setInputKey(e.target.value)}
            placeholder="cp_xxxxxxxxxxxxxxxx"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono mb-3 focus:ring-2 focus:ring-blue-500" />
          <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700">
            Continue
          </button>
        </form>
      </div>
    );
  }

  return <WizardShell apiKey={apiKey} editSlug={editSlug} />;
}

export default function ConnectorWizardPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-16 text-gray-400">Loading...</div>}>
      <WizardContent />
    </Suspense>
  );
}
