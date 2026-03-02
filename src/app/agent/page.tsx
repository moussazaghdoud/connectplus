import type { Metadata } from "next";
import Script from "next/script";
import { ScreenPopProvider } from "@/components/screen-pop/ScreenPopProvider";

export const metadata: Metadata = {
  title: "ConnectPlus Agent",
  description: "Real-time screen pop notifications for incoming calls",
};

export default function AgentPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Rainbow Web SDK loaded via CDN script to avoid Turbopack name-mangling */}
      <Script
        src="/lib/rainbow-sdk.min.js"
        strategy="beforeInteractive"
      />
      <ScreenPopProvider />
    </main>
  );
}
