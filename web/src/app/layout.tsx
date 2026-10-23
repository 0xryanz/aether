import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReferralCatcher } from "@/components/ReferralCatcher";
import { NetworkBanner } from "@/components/NetworkBanner";

export const metadata: Metadata = {
  title: "Aether Forge · 以太熔炉",
  description:
    "Agent ID-native NFT mining on BNB Chain. Mint Relics, burn ten into a Loom, and mine $AETHER by holding.",
  applicationName: "Aether Forge",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Aether Forge · 以太熔炉",
    description: "Mint Relics. Forge Looms. Hold to mine $AETHER on BNB Chain.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Aether Forge" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aether Forge · 以太熔炉",
    description: "Mint Relics. Forge Looms. Hold to mine $AETHER on BNB Chain.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#070609",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ReferralCatcher />
          <Header />
          <NetworkBanner />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
