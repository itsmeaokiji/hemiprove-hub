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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232320] bg-[#141412] px-2.5 py-1.5 text-xs sm:px-4">
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
          title="Dismiss workflow guide"
          className="ml-1 shrink-0 text-[10px] uppercase tracking-wider text-[#63635E] transition-colors hover:text-[#EDEDEC]"
        >
          [×]
        </button>
      </div>
    </div>
  );
}
