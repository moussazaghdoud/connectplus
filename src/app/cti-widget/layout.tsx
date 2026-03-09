import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Rainbow CTI",
};

/**
 * Minimal layout for the embedded CTI widget.
 * No nav/footer — designed for CRM iframe embedding.
 * Loads Zoho Embedded SDK for PhoneBridge click-to-call.
 */
export default function CtiWidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-full bg-[#f8f9fa] overflow-hidden" style={{ fontFamily: "'Roboto', 'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <Script
        src="https://live.zwidgets.com/js-sdk/1.2/ZohoEmbeddedApp.min.js"
        strategy="beforeInteractive"
      />
      {children}
    </div>
  );
}
