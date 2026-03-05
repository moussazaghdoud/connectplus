import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rainbow CTI",
};

/**
 * Minimal layout for the embedded CTI widget.
 * No nav/footer — designed for CRM iframe embedding.
 */
export default function CtiWidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-full bg-white overflow-hidden">{children}</div>
  );
}
