"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHemiNetwork } from "@/components/providers";
import { cn } from "@/lib/utils";

export function OnboardingStrip() {
  const pathname = usePathname();
  const { guideDismissed, setGuideDismissed } = useHemiNetwork();

  if (guideDismissed) return null;

  return (
    <div className="bg-[#141412] border-b border-[#232320] px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[#9A9A94]">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#FF5500]">
          QUICKSTART //
        </span>
        <span>
          HemiProve matches ZK proof requests with staked GPU provers via escalating Dutch auctions.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] tabular-nums">
        <Link
          href="/"
          className={cn(
            "transition-colors hover:text-[#EDEDEC]",
            pathname === "/" ? "font-semibold text-[#EDEDEC]" : "text-[#9A9A94]"
          )}
        >
          [1. Inspect Live Auctions]
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
          [2. Calculate GPU Profit -&gt;]
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
          [3. Size an ELF Job -&gt;]
        </Link>
        <button
          type="button"
          onClick={() => setGuideDismissed(true)}
          title="Dismiss workflow guide"
          className="ml-1 text-[10px] uppercase tracking-wider text-[#63635E] transition-colors hover:text-[#EDEDEC]"
        >
          [×]
        </button>
      </div>
    </div>
  );
}
