import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ConnectPlus Widget",
  description: "Embeddable agent widget for CRM integration",
};

/**
 * Minimal layout for the embeddable widget.
 * No nav, no footer — designed for clean iframe embedding.
 */
export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full h-screen overflow-hidden bg-white">
      {children}
    </div>
  );
}
