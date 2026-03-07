import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rainbow CTI",
};

/**
 * Minimal layout for the embedded CTI widget.
 * No nav/footer — designed for CRM iframe embedding.
 * Dark gradient background for glassmorphism style.
 */
export default function CtiWidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-full bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
      {children}
    </div>
  );
}
