"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CtiSoftphone } from "@/components/cti-widget/CtiSoftphone";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * CTI Widget page — embedded inside Zoho CRM (or any CRM iframe).
 *
 * Instead of relying on the Zoho Embedded App SDK (which doesn't initialize
 * for externally-hosted widgets), we replicate the SDK's postMessage handshake
 * natively. The protocol is:
 *
 * 1. Widget sends {type:"SDK.EVENT", eventName:"REGISTER", appOrigin:...}
 *    to window.parent using the serviceOrigin from the iframe URL query params.
 * 2. Zoho responds with {type:"FRAMEWORK.EVENT", eventName:"SET_CONTEXT", data:{uniqueID:...}}
 * 3. After init, Zoho sends FRAMEWORK.EVENT messages for Dial, DialerActive, PageLoad, etc.
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
  const zohoRegistered = useRef(false);
  const zohoUniqueID = useRef<string | null>(null);
  const zohoServiceOrigin = useRef<string | null>(null);

  // Native Zoho PhoneBridge postMessage integration
  useEffect(() => {
    if (zohoRegistered.current) return;

    // Extract serviceOrigin from URL query params (Zoho adds this to the iframe URL)
    const params = new URLSearchParams(window.location.search);
    const serviceOrigin = params.get("serviceOrigin");

    if (!serviceOrigin) {
      console.log("[CTI] No serviceOrigin in URL — not embedded in Zoho CRM");
      return;
    }

    const decodedOrigin = decodeURIComponent(serviceOrigin);
    zohoServiceOrigin.current = decodedOrigin;
    console.log("[CTI] Zoho serviceOrigin:", decodedOrigin);

    // Listen for messages from Zoho parent
    const handler = (e: MessageEvent) => {
      // Only process messages from the Zoho parent
      if (e.source !== window.parent || e.source === window) return;

      let msg: any;
      try {
        msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }

      if (msg?.type !== "FRAMEWORK.EVENT") return;

      console.log("[CTI] Zoho event:", msg.eventName, JSON.stringify(msg.data));

      switch (msg.eventName) {
        case "SET_CONTEXT":
          // Handshake complete — save uniqueID for future messages
          zohoUniqueID.current = msg.data?.uniqueID || null;
          zohoRegistered.current = true;
          console.log("[CTI] Zoho handshake complete, uniqueID:", zohoUniqueID.current);
          break;

        case "Dial": {
          // Click-to-call from Zoho CRM
          const data = msg.data || {};
          const num = data.number || data.Number || data.phoneNumber
            || data.phone || data.Phone || data.dialNumber || data.DialNumber
            || data.dialedNumber || data.DialedNumber || data.tonumber;
          console.log("[CTI] Zoho Dial event, number:", num, "full data:", JSON.stringify(data));
          if (num) setDialNumber(num);
          break;
        }

        case "DialerActive":
          console.log("[CTI] Zoho DialerActive — softphone panel toggled");
          break;

        case "PageLoad":
          console.log("[CTI] Zoho PageLoad:", JSON.stringify(msg.data));
          break;

        default:
          console.log("[CTI] Zoho unhandled event:", msg.eventName);
      }
    };

    window.addEventListener("message", handler);

    // Send REGISTER message to Zoho parent (replicates SDK's RegisterApp)
    const appOrigin = encodeURIComponent(
      window.location.protocol + "//" + window.location.host + window.location.pathname
    );

    const registerMsg = {
      type: "SDK.EVENT",
      eventName: "REGISTER",
      appOrigin,
    };

    console.log("[CTI] Sending REGISTER to Zoho parent at", decodedOrigin);
    window.parent.postMessage(registerMsg, decodedOrigin);

    return () => window.removeEventListener("message", handler);
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
