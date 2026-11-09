import type { Metadata } from "next";
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
  title: "HEMIPROVE // HUB — ZK Marketplace Telemetry, GPU zkOP/s Datasheet & Simulate Studio",
  description:
    "Precision hardware datasheet, multi-vendor GPU zkOP/s benchmark workbench (CUDA, ROCm/HIP, Intel SYCL), and zkminer simulate sizing diagnostic studio for Hemi Network's ZK proving marketplace.",
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
          <footer className="flex h-8 flex-wrap items-center justify-between border-t border-[#232320] bg-[#0B0B0A] px-4 font-mono text-[11px] tabular-nums text-[#63635E]">
            <div className="flex items-center gap-3">
              <span className="text-[#9A9A94]">HEMIPROVE // HUB</span>
              <span>|</span>
              <span>STACK: ZKMARKET@C8333AA</span>
              <span className="hidden sm:inline">|</span>
              <span className="hidden sm:inline">PROTOCOL: V12 (RISC0-PUBLIC-V3)</span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://explorer.hemi.xyz"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#EDEDEC] transition-colors"
              >
                EXPLORER 43111 ↗
              </a>
              <a
                href="https://testnet.explorer.hemi.xyz/address/0xE1a492Dc6D57fCC2B6deb5B64087E69666cA470e"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#EDEDEC] transition-colors"
              >
                ROUTER 743111 ↗
              </a>
              <a
                href="https://github.com/hemilabs/zk-miner"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#EDEDEC] transition-colors"
              >
                HEMILABS/ZK-MINER ↗
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
