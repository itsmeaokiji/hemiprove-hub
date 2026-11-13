"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useHemiNetwork } from "@/components/providers";
import { InfoTip } from "@/components/ui/info-tip";
import { cn, shortenHex } from "@/lib/utils";
import type { HemiNetworkKey, VerifierStatusLabel } from "@/lib/hemi-chain";
import type { MarketplaceApiResponse } from "@/lib/marketplace-data";

const NAV_TABS = [
  { href: "/", label: "[01] MARKETPLACE", mobileLabel: "[01] MARKET" },
  { href: "/benchmarks", label: "[02] GPU BENCHMARKS", mobileLabel: "[02] GPUS" },
  { href: "/simulate", label: "[03] SIMULATE STUDIO", mobileLabel: "[03] SIMULATE" },
];

function VerifierStatusIndicator({
  name,
  status,
}: {
  name: string;
  status: VerifierStatusLabel;
}) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px]">
        <span className="text-[#10B981]" aria-hidden="true">
          ●
        </span>
        <span className="text-[#63635E]">{name}:</span>
        <span className="text-[#10B981]">ACTIVE</span>
      </span>
    );
  }
  if (status === "743111-ONLY") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px]">
        <span className="text-[#FF5500]" aria-hidden="true">
          ▲
        </span>
        <span className="text-[#63635E]">{name}:</span>
        <span className="text-[#9A9A94]">743111-ONLY</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px]">
      <span className="text-[#63635E]" aria-hidden="true">
        ◌
      </span>
      <span className="text-[#63635E]">{name}:</span>
      <span className="text-[#9A9A94]">STAGED</span>
    </span>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const {
    networkKey,
    setNetworkKey,
    deployment,
    liveStreamEnabled,
    setLiveStreamEnabled,
    guideDismissed,
    setGuideDismissed,
    hasHydrated,
  } = useHemiNetwork();

  const [copiedRouter, setCopiedRouter] = useState(false);
  const [apiLatencyMs, setApiLatencyMs] = useState<number>(42);

  const modeKey = liveStreamEnabled ? "demo" : "live";
  const { data: telemetry } = useQuery<MarketplaceApiResponse>({
    queryKey: ["marketplace", networkKey, modeKey],
    queryFn: async () => {
      const t0 = performance.now();
      const res = await fetch(`/api/marketplace?network=${networkKey}&mode=${modeKey}`);
      const elapsed = Math.max(8, Math.round(performance.now() - t0));
      setApiLatencyMs(elapsed);
      if (!res.ok) throw new Error("Telemetry fetch failed");
      return res.json();
    },
    enabled: hasHydrated,
    refetchInterval: 20_000,
  });

  const copyRouter = () => {
    if (!deployment.router) return;
    navigator.clipboard?.writeText(deployment.router);
    setCopiedRouter(true);
    setTimeout(() => setCopiedRouter(false), 1400);
  };

  const statusOnline = Boolean(telemetry?.rpcConnected);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0B0B0A]">
      {/* 1. Top Protocol Telemetry Bar */}
      <div className="flex h-7 sm:h-8 items-center justify-between overflow-x-auto border-b border-[#232320] bg-[#0B0B0A] px-2.5 sm:px-4 font-mono text-[10px] sm:text-[11px] tabular-nums text-[#9A9A94] whitespace-nowrap">
        {/* Left: Status dot, Active Chain, Router Address + Copy/Explorer, zkOP Baseline */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="inline-flex items-center gap-1.5 sm:gap-2 text-[#EDEDEC]">
            <span
              className={cn(
                "inline-block h-2 w-2 shrink-0 rounded-none",
                statusOnline ? "bg-[#10B981]" : "bg-[#FF5500]"
              )}
            />
            <span className="sm:hidden">
              {networkKey === "mainnet" ? "MAINNET [43111]" : "SEPOLIA [743111]"}
            </span>
            <span className="hidden sm:inline">
              {networkKey === "mainnet"
                ? "HEMI MAINNET [43111]"
                : "HEMI SEPOLIA [743111]"}
            </span>
          </span>

          <span className="text-[#232320]">|</span>

          <span className="inline-flex items-center gap-1.5">
            <span className="text-[#63635E]">ROUTER:</span>
            {deployment.router ? (
              <>
                <a
                  href={`${deployment.explorerUrl}/address/${deployment.router}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Inspect Router ${deployment.router} on ${deployment.explorerUrl}`}
                  className="text-[#EDEDEC] underline decoration-[#232320] transition-colors hover:text-[#FF5500] hover:decoration-[#FF5500]"
                >
                  <span>{shortenHex(deployment.router, 4, 4)}</span>
                  <span className="hidden sm:inline">
                    {" "}
                    ({deployment.routerStatusTag})
                  </span>{" "}
                  ↗
                </a>
                <button
                  type="button"
                  onClick={copyRouter}
                  title={`Copy HemiProve Router (${deployment.router})`}
                  className="inline-flex items-center rounded-[2px] border border-[#232320] bg-[#111110] px-1 py-0.5 text-[10px] text-[#9A9A94] hover:bg-[#181816] hover:text-[#EDEDEC]"
                >
                  {copiedRouter ? (
                    <Check className="h-2.5 w-2.5 text-[#10B981]" />
                  ) : (
                    <Copy className="h-2.5 w-2.5" />
                  )}
                </button>
              </>
            ) : (
              <span className="text-[#9A9A94]">
                <span className="sm:hidden">STAGED</span>
                <span className="hidden sm:inline">{deployment.routerStatusTag}</span>
              </span>
            )}
          </span>

          <span className="hidden text-[#232320] xl:inline">|</span>

          <span className="hidden items-center text-[#9A9A94] xl:inline-flex">
            <span className="text-[#63635E] mr-1">BASELINE:</span>
            <span>1 zkOP = 1 SP1 CYCLE (zkop-mix 50M)</span>
            <InfoTip
              label="What is zkOP/s?"
              text="Normalized GPU proving speed across workloads where 1 zkOP equals 1 Succinct SP1 RISC-V cycle on the 50M-cycle zkop-mix benchmark."
            />
          </span>
        </div>

        {/* Right: Borderless Verifier Status Indicators + RPC Latency / Block Indicator */}
        <div className="hidden items-center gap-3 md:flex">
          <VerifierStatusIndicator
            name="RISC0"
            status={deployment.verifierStatus.risc0}
          />
          <VerifierStatusIndicator
            name="SP1"
            status={deployment.verifierStatus.sp1}
          />
          <VerifierStatusIndicator
            name="OPENVM"
            status={deployment.verifierStatus.openvm}
          />

          <span className="text-[#232320]">|</span>

          <span
            className="text-[#9A9A94]"
            title="Full /api/marketplace round-trip latency (RPC + Blockscout + registry reads)"
          >
            {telemetry?.latestBlock ? (
              <>
                <span className="text-[#63635E]">HEAD:</span>{" "}
                <span className="text-[#EDEDEC]">
                  #{Number(telemetry.latestBlock).toLocaleString()}
                </span>{" "}
                <span className="text-[#63635E]">(API {apiLatencyMs}ms)</span>
              </>
            ) : (
              <>
                <span className="text-[#63635E]">API:</span>{" "}
                <span className="text-[#EDEDEC]">
                  {liveStreamEnabled ? `STREAM (${apiLatencyMs}ms)` : "STANDBY"}
                </span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* 2. Main Workbench Header */}
      <div className="flex min-h-10 md:min-h-12 items-center justify-between gap-1.5 border-b border-[#232320] bg-[#111110] px-2.5 sm:px-4 py-1 md:py-0">
        {/* Left: Wordmark + Flush Vertical-Divider Navigation Tabs */}
        <div className="flex h-full shrink-0 items-center">
          <Link
            href="/"
            title="Independent, unofficial open-source community workbench for hemiProve — not affiliated with Hemi Labs"
            className="flex h-8 items-center border-r border-[#232320] pr-2.5 font-mono text-[11px] font-semibold tracking-tight text-[#EDEDEC] sm:h-9 sm:pr-4 sm:text-sm md:h-12 md:pr-5"
          >
            <span>HEMIPROVE</span>
            <span className="mx-1 sm:mx-1.5 text-[#63635E]">{"//"}</span>
            <span className="text-[#EDEDEC]">HUB</span>
            <span className="ml-2 hidden rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[#9A9A94] xl:inline-block">
              COMMUNITY
            </span>
          </Link>

          <nav className="hidden h-12 items-center md:flex">
            {NAV_TABS.map((tab) => {
              const isActive =
                tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "relative flex h-12 items-center border-r border-[#232320] px-5 font-mono text-xs uppercase tracking-wider transition-colors",
                    isActive
                      ? "bg-[#181816] text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
                      : "text-[#9A9A94] hover:bg-[#181816] hover:text-[#EDEDEC]"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Physical-Style Segmented Hardware Switches (Single Compact Row on Mobile) */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Chain Switcher (Sepolia 743111 default first, Mainnet 43111 second) */}
          <div className="flex items-center rounded-[2px] border border-[#232320] bg-[#0B0B0A] p-0.5 font-mono text-[10px] sm:text-[11px] tabular-nums">
            {(["sepolia", "mainnet"] as HemiNetworkKey[]).map((key) => {
              const active = networkKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNetworkKey(key)}
                  className={cn(
                    "rounded-[2px] px-1.5 sm:px-2.5 py-1 uppercase tracking-wider transition-colors",
                    active
                      ? "bg-[#FF5500] font-semibold text-[#0B0B0A]"
                      : "text-[#9A9A94] hover:text-[#EDEDEC]"
                  )}
                >
                  <span className="sm:hidden">
                    {key === "sepolia" ? "743111" : "43111"}
                  </span>
                  <span className="hidden sm:inline">
                    {key === "sepolia" ? "SEPOLIA 743111" : "MAINNET 43111"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* DATA: LIVE / DEMO Switch (Visible on ALL screen sizes) */}
          <div className="flex items-center rounded-[2px] border border-[#232320] bg-[#0B0B0A] p-0.5 font-mono text-[10px] sm:text-[11px]">
            <span className="hidden px-1.5 text-[10px] uppercase tracking-wider text-[#63635E] sm:inline sm:px-2">
              DATA:
            </span>
            <button
              type="button"
              onClick={() => setLiveStreamEnabled(false)}
              className={cn(
                "rounded-[2px] px-1.5 sm:px-2 py-1 uppercase tracking-wider transition-colors",
                !liveStreamEnabled
                  ? "bg-[#181816] font-semibold text-[#EDEDEC] shadow-[inset_0_-1px_0_0_#FF5500]"
                  : "text-[#63635E] hover:text-[#9A9A94]"
              )}
            >
              LIVE
            </button>
            <button
              type="button"
              onClick={() => setLiveStreamEnabled(true)}
              className={cn(
                "rounded-[2px] px-1.5 sm:px-2 py-1 uppercase tracking-wider transition-colors",
                liveStreamEnabled
                  ? "bg-[#181816] font-semibold text-[#EDEDEC] shadow-[inset_0_-1px_0_0_#FF5500]"
                  : "text-[#63635E] hover:text-[#9A9A94]"
              )}
            >
              DEMO
            </button>
          </div>

          {guideDismissed && (
            <button
              type="button"
              onClick={() => setGuideDismissed(false)}
              title="Restore workflow guide bar"
              className="hidden h-7 items-center rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2 font-mono text-[11px] text-[#63635E] transition-colors hover:bg-[#181816] hover:text-[#EDEDEC] lg:inline-flex"
            >
              GUIDE [?]
            </button>
          )}

          <a
            href="https://github.com/hemilabs/zk-miner"
            target="_blank"
            rel="noreferrer"
            className="hidden h-7 items-center rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2.5 font-mono text-[11px] uppercase tracking-wider text-[#9A9A94] transition-colors hover:bg-[#181816] hover:text-[#EDEDEC] xl:inline-flex"
          >
            ZK-MINER ↗
          </a>
        </div>
      </div>

      {/* Mobile Tab Bar (flush structural hairline grid) */}
      <nav className="grid grid-cols-3 divide-x divide-[#232320] border-b border-[#232320] bg-[#111110] md:hidden">
        {NAV_TABS.map((tab) => {
          const isActive =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex h-9 items-center justify-center px-1 font-mono text-[10px] sm:text-[11px] uppercase tracking-wider",
                isActive
                  ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
                  : "text-[#9A9A94]"
              )}
            >
              <span className="sm:hidden">{tab.mobileLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
