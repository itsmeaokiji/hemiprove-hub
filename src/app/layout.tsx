import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { OnboardingStrip } from "@/components/onboarding-strip";

export const metadata: Metadata = {
  title: "HEMIPROVE // HUB — Community ZK Marketplace Telemetry, GPU zkOP/s & Simulate Studio",
  description:
    "Independent, unofficial open-source community workbench, multi-vendor GPU zkOP/s benchmark datasheet, and zkminer simulate sizing diagnostic studio for Hemi Network's hemiProve marketplace. Not affiliated with Hemi Labs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-[#0B0B0A] text-[#EDEDEC]">
        <Providers>
          <Navbar />
          <OnboardingStrip />
          <main className="w-full flex-1 bg-[#0B0B0A]">{children}</main>
          <footer className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[#232320] bg-[#0B0B0A] px-4 py-1.5 sm:py-0 font-mono text-[11px] tabular-nums text-[#63635E]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="text-[#9A9A94]">HEMIPROVE // HUB</span>
              <span className="rounded-[2px] border border-[#232320] bg-[#111110] px-1.5 py-0.5 text-[10px] text-[#9A9A94]">
                UNOFFICIAL COMMUNITY WORKBENCH
              </span>
              <span className="hidden md:inline">|</span>
              <span className="hidden md:inline">STACK: ZKMARKET@C8333AA</span>
              <span className="hidden xl:inline">|</span>
              <span className="hidden xl:inline">PROTOCOL: V12 (RISC0-PUBLIC-V3)</span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://explorer.hemi.xyz"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-[#EDEDEC]"
              >
                <span>EXPLORER 43111</span>
                <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
              <a
                href="https://testnet.explorer.hemi.xyz/address/0xE1a492Dc6D57fCC2B6deb5B64087E69666cA470e"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-[#EDEDEC]"
              >
                <span>ROUTER 743111</span>
                <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
              <a
                href="https://github.com/hemilabs/zk-miner"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-[#EDEDEC]"
              >
                <span>HEMILABS/ZK-MINER</span>
                <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
