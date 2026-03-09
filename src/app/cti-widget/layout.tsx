import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rainbow CTI",
};

/**
 * Minimal layout for the embedded CTI widget.
 * No nav/footer — designed for CRM iframe embedding.
 * Zoho SDK is loaded in the static widget.html wrapper (public/cti-widget/app/widget.html),
 * which iframes this page and forwards PhoneBridge events via postMessage.
 */
export default function CtiWidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-full bg-[#f8f9fa] overflow-hidden" style={{ fontFamily: "'Roboto', 'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {children}
    </div>
  );
}
