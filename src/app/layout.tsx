import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConnectPlus",
  description: "ConnectPlus — CRM telephony integration platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Zoho Embedded SDK — must be in root <head> for PhoneBridge click-to-call */}
        <Script
          src="https://live.zwidgets.com/js-sdk/1.2/ZohoEmbeddedApp.min.js"
          strategy="beforeInteractive"
          id="zoho-embedded-sdk"
        />
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
