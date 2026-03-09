"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CtiSoftphone } from "@/components/cti-widget/CtiSoftphone";

/* global ZOHO */
declare global {
  interface Window {
    ZOHO?: {
      embeddedApp: {
        on: (event: string, callback: (data: Record<string, string>) => void) => void;
        init: () => Promise<void>;
      };
      CRM?: {
        UI?: {
          Record?: {
            open: (opts: { Entity: string; RecordID: string }) => Promise<void>;
          };
        };
      };
    };
  }
}

/**
 * CTI Widget page — embedded inside Zoho CRM (or any CRM iframe).
 * Loads Zoho Embedded SDK for PhoneBridge click-to-call support.
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
  const [dialNumber, setDialNumber] = useState<string | null>(null);
  const zohoInitialized = useRef(false);

  // Load Zoho Embedded SDK and listen for PhoneBridge events
  useEffect(() => {
    if (zohoInitialized.current) return;
    zohoInitialized.current = true;

    const script = document.createElement("script");
    script.src = "https://live.zwidgets.com/js-sdk/1.2/ZohoEmbeddedApp.min.js";
    script.onload = () => {
      try {
        if (!window.ZOHO?.embeddedApp) return;

        window.ZOHO.embeddedApp.on("PageLoad", (data) => {
          console.log("[CTI] Zoho page context:", data);
        });

        // PhoneBridge: click-to-call from Zoho CRM contact fields
        window.ZOHO.embeddedApp.on("DialNumber", (data) => {
          const num = data.number || data.Number || data.phoneNumber;
          console.log("[CTI] Zoho DialNumber event:", num, data);
          if (num) setDialNumber(num);
        });

        window.ZOHO.embeddedApp.init()
          .then(() => console.log("[CTI] Zoho SDK initialized"))
          .catch((err: unknown) => console.warn("[CTI] Zoho SDK init failed:", err));
      } catch (e) {
        console.warn("[CTI] Zoho SDK not available:", e);
      }
    };
    script.onerror = () => {
      console.warn("[CTI] Failed to load Zoho SDK (not in Zoho CRM context)");
    };
    document.head.appendChild(script);
  }, []);

  // Clear dial number after it's been consumed
  const onDialNumberConsumed = useCallback(() => {
    setDialNumber(null);
  }, []);

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
      zohoDialNumber={dialNumber}
      onZohoDialConsumed={onDialNumberConsumed}
    />
  );
}
