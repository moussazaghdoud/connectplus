import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rainbow CTI",
};

/**
 * Minimal layout for the embedded CTI widget.
 * No nav/footer — designed for CRM iframe embedding.
 * Zoho SDK loaded via root layout's <head> (beforeInteractive).
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
