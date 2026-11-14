"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { useHemiNetwork } from "@/components/providers";
import { cn } from "@/lib/utils";

const QUICK_CLI_COMMANDS = [
  {
    id: "benchmark",
    label: "BENCHMARK GPU",
    cmd: "zkminer benchmark --json",
  },
  {
    id: "simulate",
    label: "SIMULATE ELF",
    cmd: "zkminer simulate --elf <ELF_URI> --zkvm risc0 --json",
  },
] as const;

const FIELD_GUIDE_COLUMNS = [
  {
    index: "01 // DATA MODES & FLOW",
    items: [
      {
        term: "DEMO vs. LIVE",
        detail:
          "DEMO plays seeded Sepolia auction frames; LIVE queries Hemi RPC + Blockscout v2 logs (Mainnet 43111 stays cleanly STAGED).",
      },
      {
        term: "3-Step Workflow",
        detail:
          "[01] Inspect open/settled jobs -> [02] Model GPU zkOP/s & HEMI ROI -> [03] Size ELF cycles & export Solidity/Viem.",
      },
    ],
  },
  {
    index: "02 // AUCTION & SETTLEMENT",
    items: [
      {
        term: "Reverse Dutch Auction",
        detail:
          "Rewards escalate monotonically from minPrice to maxPrice (Linear or Quadratic curve) until a staked GPU prover claims.",
      },
      {
        term: "Verified Telemetry",
        detail:
          "SETTLEMENT TIME and ACTUAL_CYCLES correlate JobSubmitted, JobClaimed, and JobFulfilled receipts on Hemi Sepolia.",
      },
    ],
  },
  {
    index: "03 // ZKOP/S & PO2 SIZING",
    items: [
      {
        term: "1 zkOP Baseline",
        detail:
          "1 zkOP equals 1 SP1 RISC-V cycle on the 50M zkop-mix benchmark, normalized across CUDA, ROCm/HIP, and Intel SYCL GPUs.",
      },
      {
        term: "po2 Segment Audit",
        detail:
          "Sets 2^po2 cycles per RISC0 segment (default po2 = 20). Sweeping po2 16..22 catches cycle inflation before claiming.",
      },
    ],
  },
] as const;

export function OnboardingStrip() {
  const pathname = usePathname();
  const { guideDismissed, setGuideDismissed, fieldGuideOpen, setFieldGuideOpen } =
    useHemiNetwork();
  const [copiedCmdId, setCopiedCmdId] = useState<string | null>(null);

  const handleCopyCli = (id: string, cmd: string) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedCmdId(id);
    setTimeout(() => setCopiedCmdId(null), 1400);
  };

  if (guideDismissed && !fieldGuideOpen) return null;

  return (
    <div className="border-b border-[#232320] bg-[#141412]">
      {!guideDismissed && !fieldGuideOpen && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 text-xs sm:px-4">
          <div className="hidden items-center gap-x-2 gap-y-1 text-[#9A9A94] sm:flex sm:flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#FF5500]">
              QUICKSTART //
            </span>
            <span>
              Unofficial community workbench for hemiProve — explore live ZK auctions, GPU ROI &amp; sizing.
            </span>
          </div>

          <div className="flex w-full items-center justify-between gap-x-2 overflow-x-auto whitespace-nowrap font-mono text-[10px] tabular-nums sm:w-auto sm:justify-end sm:gap-x-2.5 sm:text-[11px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#FF5500] sm:hidden">
              FLOW //
            </span>
            <div className="flex items-center gap-x-1.5 sm:gap-x-2.5">
              <Link
                href="/"
                className={cn(
                  "transition-colors hover:text-[#EDEDEC]",
                  pathname === "/" ? "font-semibold text-[#EDEDEC]" : "text-[#9A9A94]"
                )}
              >
                <span className="sm:hidden">[1. Auctions]</span>
                <span className="hidden sm:inline">[1. Inspect Live Auctions]</span>
              </Link>
              <span className="text-[#232320]">|</span>
              <Link
                href="/benchmarks"
                className={cn(
                  "transition-colors hover:text-[#EDEDEC]",
                  pathname.startsWith("/benchmarks")
                    ? "font-semibold text-[#EDEDEC]"
                    : "text-[#9A9A94]"
                )}
              >
                <span className="sm:hidden">[2. GPU ROI]</span>
                <span className="hidden sm:inline">[2. Calculate GPU Profit -&gt;]</span>
              </Link>
              <span className="text-[#232320]">|</span>
              <Link
                href="/simulate"
                className={cn(
                  "transition-colors hover:text-[#EDEDEC]",
                  pathname.startsWith("/simulate")
                    ? "font-semibold text-[#EDEDEC]"
                    : "text-[#9A9A94]"
                )}
              >
                <span className="sm:hidden">[3. Size ELF]</span>
                <span className="hidden sm:inline">[3. Size an ELF Job -&gt;]</span>
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setGuideDismissed(true)}
              title="Dismiss quickstart bar"
              className="ml-1 shrink-0 text-[10px] uppercase tracking-wider text-[#63635E] transition-colors hover:text-[#EDEDEC]"
            >
              [×]
            </button>
          </div>
        </div>
      )}

      {fieldGuideOpen && (
        <section
          aria-label="HemiProve Hub Field Reference"
          className="bg-[#111110]"
        >
          <div className="flex items-center justify-between border-b border-[#232320] bg-[#141412] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] sm:px-4">
            <div className="flex items-center gap-2">
              <span className="text-[#FF5500]">FIELD REFERENCE //</span>
              <span className="text-[#9A9A94]">
                TERMINOLOGY, DATA MODES &amp; PROTOCOL SIZING QUICK GUIDE
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFieldGuideOpen(false)}
              className="text-[#9A9A94] transition-colors hover:text-[#EDEDEC]"
            >
              [CLOSE ×]
            </button>
          </div>

          <div className="grid grid-cols-1 divide-y divide-[#232320] md:grid-cols-3 md:divide-x md:divide-y-0">
            {FIELD_GUIDE_COLUMNS.map((col) => (
              <div key={col.index} className="space-y-2 px-3 py-3 sm:px-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#63635E]">
                  {col.index}
                </div>
                <div className="space-y-1.5 text-xs">
                  {col.items.map((item) => (
                    <div key={item.term} className="leading-relaxed">
                      <span className="font-mono text-[11px] font-medium text-[#EDEDEC]">
                        {item.term}:
                      </span>{" "}
                      <span className="text-[11px] text-[#9A9A94]">{item.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#232320] bg-[#0B0B0A] px-3 py-2 font-mono text-[11px] tabular-nums sm:px-4">
            <span className="text-[10px] uppercase tracking-[0.12em] text-[#63635E]">
              04 // ZKMINER CLI QUICK COPY
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_CLI_COMMANDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleCopyCli(item.id, item.cmd)}
                  className="inline-flex items-center gap-2 rounded-[2px] border border-[#232320] bg-[#111110] px-2.5 py-1 text-[11px] text-[#EDEDEC] transition-colors hover:border-[#FF5500] hover:bg-[#181816]"
                >
                  <span className="text-[10px] text-[#63635E]">{item.label}:</span>
                  <code>{item.cmd}</code>
                  {copiedCmdId === item.id ? (
                    <Check className="h-3 w-3 text-[#10B981]" />
                  ) : (
                    <Copy className="h-3 w-3 text-[#63635E]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
