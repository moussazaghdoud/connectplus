"use client";

import { useEffect, useState } from "react";
import { CtiSoftphone } from "@/components/cti-widget/CtiSoftphone";

/**
 * CTI Widget page — embedded inside Zoho CRM (or any CRM iframe).
 * Zoho SDK runs in the static widget.html wrapper which forwards
 * PhoneBridge click-to-call events via postMessage to this page.
 * Authenticates via session cookie, then renders the softphone.
 */
export default function CtiWidgetPage() {
  const [user, setUser] = useState<{
    id: string;
    email: string;
    role: string;
    tenantId: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/v1/auth/me", { credentials: "include" });
        if (!res.ok) {
          setError("Not authenticated. Please log in first.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setUser(data.user);
      } catch {
        setError("Failed to check authentication.");
      }
      setLoading(false);
    }
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8f9fa]">
        <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex items-center justify-center h-screen p-4 bg-[#f8f9fa]">
        <div className="text-center bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <p className="text-red-600 text-sm mb-3">{error || "Authentication required"}</p>
          <a
            href="/login"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#006cff] text-sm underline hover:text-[#0047ff] transition-colors"
          >
            Open login page
          </a>
        </div>
      </div>
    );
  }

  return (
    <CtiSoftphone
      agentId={user.id}
      agentEmail={user.email}
      tenantId={user.tenantId}
    />
  );
}
