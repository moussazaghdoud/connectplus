"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CtiSoftphone } from "@/components/cti-widget/CtiSoftphone";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    ZOHO?: any;
  }
}

/**
 * CTI Widget page — embedded inside Zoho CRM (or any CRM iframe).
 * Zoho SDK loaded via next/script in layout.tsx (afterInteractive).
 * Polls for ZOHO global, registers Dial event, forwards to CtiSoftphone.
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

  // Poll for Zoho SDK and register PhoneBridge events
  useEffect(() => {
    if (zohoInitialized.current) return;

    let attempts = 0;
    const maxAttempts = 50; // 5 seconds

    const interval = setInterval(() => {
      attempts++;

      if (window.ZOHO?.embeddedApp && !zohoInitialized.current) {
        zohoInitialized.current = true;
        clearInterval(interval);

        console.log("[CTI] Zoho SDK detected, registering events...");

        try {
          window.ZOHO.embeddedApp.on("PageLoad", function (data: any) {
            console.log("[CTI] Zoho PageLoad:", JSON.stringify(data));
          });

          window.ZOHO.embeddedApp.on("Dial", function (data: any) {
            console.log("[CTI] Zoho Dial event — full data:", JSON.stringify(data));
            // Try every possible field name
            const num = data?.number || data?.Number || data?.phoneNumber
              || data?.phone || data?.Phone || data?.dialNumber || data?.DialNumber
              || data?.dialedNumber || data?.DialedNumber;
            console.log("[CTI] Zoho Dial extracted number:", num);
            if (num) setDialNumber(num);
          });

          window.ZOHO.embeddedApp.on("DialerActive", function () {
            console.log("[CTI] Zoho DialerActive — softphone toggled");
          });

          window.ZOHO.embeddedApp.init()
            .then(function () { console.log("[CTI] Zoho SDK initialized OK"); })
            .catch(function (err: any) { console.warn("[CTI] Zoho SDK init error:", err); });
        } catch (e) {
          console.warn("[CTI] Zoho SDK registration error:", e);
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.log("[CTI] Zoho SDK not found after 5s (not in Zoho CRM?)");
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

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
