import type { Metadata } from "next";
import { ScreenPopProvider } from "@/components/screen-pop/ScreenPopProvider";

export const metadata: Metadata = {
  title: "ConnectPlus Agent",
  description: "Real-time screen pop notifications for incoming calls",
};

export default function AgentPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <ScreenPopProvider />
    </main>
  );
}
