import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { DemoBanner, Header, Toasts } from "@/components/header";
import { MorroProvider } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Morro", template: "%s · Morro" },
  description: "Corporate actions, on-chain. Coupons, redemptions and consent votes for tokenized bonds on Solana.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1216" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <MorroProvider>
          <Header />
          <DemoBanner />
          <main className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10">{children}</main>
          <footer className="mx-auto max-w-[1240px] px-4 pb-10 text-xs text-faint sm:px-6">
            Morro · Superteam Kazakhstan x KASE · Corporate Actions on Blockchain. Test instruments only.
          </footer>
          <Toasts />
        </MorroProvider>
      </body>
    </html>
  );
}
