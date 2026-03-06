"use client";

import { useState, useCallback } from "react";

interface ContactResult {
  displayName: string;
  email?: string;
  phone?: string;
  company?: string;
  externalId: string;
  source: string;
  metadata?: Record<string, unknown>;
}

interface Props {
  onClickToCall: (number: string) => void;
}

export function ContactSearch({ onClickToCall }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;

    setLoading(true);
    setSearched(true);
    try {
      const resp = await fetch("/api/v1/contacts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          query: q,
          limit: 15,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setResults(data.data ?? []);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-4 pt-4 pb-2">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, company..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400"
          />
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm rounded-lg transition-colors"
          >
            {loading ? "..." : "Search"}
          </button>
        </form>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!searched && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <div className="text-3xl mb-2">&#128269;</div>
            <p className="text-sm">Search CRM contacts</p>
            <p className="text-xs mt-1">Find contacts and click to call</p>
          </div>
        )}

        {searched && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <p className="text-sm">No contacts found</p>
          </div>
        )}

        {results.map((contact) => (
          <div
            key={`${contact.source}:${contact.externalId}`}
            className="flex items-center px-4 py-3 hover:bg-gray-50 border-b border-gray-100"
          >
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold mr-3 shrink-0">
              {contact.displayName?.charAt(0)?.toUpperCase() ?? "?"}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {contact.displayName}
              </p>
              <div className="flex flex-col gap-0.5">
                {contact.company && (
                  <span className="text-xs text-gray-500 truncate">{contact.company}</span>
                )}
                {contact.email && (
                  <span className="text-xs text-gray-400 truncate">{contact.email}</span>
                )}
                {contact.phone && (
                  <span className="text-xs text-gray-500 font-mono">{contact.phone}</span>
                )}
              </div>
            </div>

            {/* Click-to-call */}
            {contact.phone ? (
              <button
                onClick={() => onClickToCall(contact.phone!)}
                className="w-9 h-9 rounded-full bg-green-50 hover:bg-green-100 text-green-600 flex items-center justify-center text-base shrink-0 ml-2 transition-colors"
                title={`Call ${contact.phone}`}
              >
                &#128222;
              </button>
            ) : (
              <span className="text-xs text-gray-300 ml-2 shrink-0">No phone</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
