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
      {/* Search bar — glass */}
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
            className="flex-1 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-blue-400/50 focus:border-blue-400/30"
          />
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-white/5 disabled:text-white/20 text-blue-400 text-sm rounded-xl border border-blue-500/20 disabled:border-white/5 transition-colors"
          >
            {loading ? "..." : "Search"}
          </button>
        </form>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!searched && (
          <div className="flex flex-col items-center justify-center py-12 text-white/30">
            <svg className="w-10 h-10 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p className="text-sm">Search CRM contacts</p>
            <p className="text-xs text-white/20 mt-1">Find contacts and click to call</p>
          </div>
        )}

        {searched && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-white/30">
            <p className="text-sm">No contacts found</p>
          </div>
        )}

        {results.map((contact) => (
          <div
            key={`${contact.source}:${contact.externalId}`}
            className="flex items-center px-4 py-3 hover:bg-white/5 border-b border-white/5 transition-colors"
          >
            {/* Avatar — glass circle */}
            <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-400/20 text-blue-400 flex items-center justify-center text-sm font-bold mr-3 shrink-0">
              {contact.displayName?.charAt(0)?.toUpperCase() ?? "?"}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/85 truncate">
                {contact.displayName}
              </p>
              <div className="flex flex-col gap-0.5">
                {contact.company && (
                  <span className="text-xs text-white/40 truncate">{contact.company}</span>
                )}
                {contact.email && (
                  <span className="text-xs text-white/25 truncate">{contact.email}</span>
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
                  <span className="text-xs text-white/15 mt-1">No phone</span>
                );
                return (
                  <div className="flex flex-col gap-1 mt-1">
                    {phones.map((p) => (
                      <div key={`${p.label}:${p.number}`} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-white/30 w-10 shrink-0">{p.label}</span>
                        <span className="text-xs text-white/50 font-mono flex-1 truncate">{p.number}</span>
                        <button
                          onClick={() => onClickToCall(p.number)}
                          className="w-7 h-7 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 transition-colors"
                          title={`Call ${p.label}: ${p.number}`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                          </svg>
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
