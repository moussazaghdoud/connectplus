"use client";

import { useState, useCallback } from "react";

interface PhoneEntry {
  label: string;
  number: string;
}

interface ContactResult {
  displayName: string;
  email?: string;
  phone?: string;
  phones?: PhoneEntry[];
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
              </div>

              {/* All phone numbers with individual call buttons */}
              {(() => {
                const phones = contact.phones?.length
                  ? contact.phones
                  : contact.phone
                    ? [{ label: "Phone", number: contact.phone }]
                    : [];
                if (phones.length === 0) return (
                  <span className="text-xs text-gray-300 mt-1">No phone</span>
                );
                return (
                  <div className="flex flex-col gap-1 mt-1">
                    {phones.map((p) => (
                      <div key={`${p.label}:${p.number}`} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 w-10 shrink-0">{p.label}</span>
                        <span className="text-xs text-gray-600 font-mono flex-1 truncate">{p.number}</span>
                        <button
                          onClick={() => onClickToCall(p.number)}
                          className="w-7 h-7 rounded-full bg-green-50 hover:bg-green-100 text-green-600 flex items-center justify-center text-sm shrink-0 transition-colors"
                          title={`Call ${p.label}: ${p.number}`}
                        >
                          &#128222;
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
