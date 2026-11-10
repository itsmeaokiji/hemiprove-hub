"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useHemiNetwork } from "@/components/providers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import {
  computeEscalatingOffer,
  type ZkVmBackend,
} from "@/lib/hemi-chain";
import {
  buildBaselineJobs,
  buildBaselineKpis,
  buildLiveKpis,
  type JobStatusLabel,
  type MarketplaceApiResponse,
  type MarketplaceJob,
} from "@/lib/marketplace-data";
import { runDeterministicSimulation } from "@/lib/simulate-engine";
import { cn, formatDurationSecs, shortenHex } from "@/lib/utils";

function renderAsciiBlocks(ratio: number, totalSegments = 10): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * totalSegments);
  return "■".repeat(filled) + "□".repeat(totalSegments - filled);
}

function StatusTag({ status }: { status: JobStatusLabel }) {
  if (status === "Open") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#FF5500] tabular-nums">
        <span aria-hidden="true">●</span>
        <span>OPEN</span>
      </span>
    );
  }
  if (status === "Claimed") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#38BDF8] tabular-nums">
        <span aria-hidden="true">●</span>
        <span>CLAIMED</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#10B981] tabular-nums">
      <span aria-hidden="true">●</span>
      <span>VERIFIED</span>
    </span>
  );
}

export default function MarketplacePage() {
  const {
    networkKey,
    setNetworkKey,
    deployment,
    liveStreamEnabled,
    setLiveStreamEnabled,
  } = useHemiNetwork();

  const [tickSecs, setTickSecs] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"ALL" | JobStatusLabel>("ALL");
  const [zkvmFilter, setZkvmFilter] = useState<"ALL" | ZkVmBackend>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"table" | "inspector">("table");

  useEffect(() => {
    const interval = setInterval(() => {
      setTickSecs((prev) => prev + 1);
    }, 1_000);
    return () => clearInterval(interval);
  }, []);

  const { data, isFetching, refetch } = useQuery<MarketplaceApiResponse>({
    queryKey: ["marketplace", networkKey],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace?network=${networkKey}`);
      if (!res.ok) throw new Error("Failed to load marketplace feed");
      return res.json();
    },
    refetchInterval: 20_000,
  });

  const isMainnetStaged = networkKey === "mainnet" && !deployment.router;

  const kpis = useMemo(() => {
    if (!liveStreamEnabled) {
      return (
        data?.liveKpis ??
        buildLiveKpis(
          deployment.deployed,
          data?.onChainJobIndex ?? null,
          data?.totalPaidHemiOnChain ?? null,
          data?.onChainJobs ?? []
        )
      );
    }
    return data?.kpis ?? buildBaselineKpis(networkKey, null, null);
  }, [data, deployment.deployed, liveStreamEnabled, networkKey]);

  // Compute escalating Reverse Dutch Auction prices (strictly onChainJobs in LIVE mode)
  const liveJobs = useMemo(() => {
    const sourceJobs = liveStreamEnabled
      ? (data?.jobs ?? buildBaselineJobs(networkKey))
      : (data?.onChainJobs ?? []);

    return sourceJobs.map((job) => {
      if (job.status !== "Open") return job;
      const dynamicElapsed = liveStreamEnabled
        ? (job.elapsedSecs + tickSecs * 2) % (job.rampUpPeriodSecs + 20)
        : job.elapsedSecs;
      const clampedElapsed = Math.min(job.rampUpPeriodSecs, dynamicElapsed);
      const liveOffer = computeEscalatingOffer(
        job.minOfferHemi,
        job.maxOfferHemi,
        job.rampUpPeriodSecs,
        clampedElapsed,
        job.curveType
      );
      return {
        ...job,
        elapsedSecs: clampedElapsed,
        currentOfferHemi: Number(liveOffer.toFixed(2)),
      };
    });
  }, [data?.jobs, data?.onChainJobs, networkKey, liveStreamEnabled, tickSecs]);

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return liveJobs.filter((job) => {
      if (statusFilter !== "ALL" && job.status !== statusFilter) return false;
      if (zkvmFilter !== "ALL" && job.zkvm !== zkvmFilter) return false;
      if (!q) return true;
      return (
        job.jobId.toLowerCase().includes(q) ||
        job.programName.toLowerCase().includes(q) ||
        job.requester.toLowerCase().includes(q) ||
        (job.requesterLabel?.toLowerCase().includes(q) ?? false) ||
        job.elfUri.toLowerCase().includes(q) ||
        (job.proverAddress?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [liveJobs, statusFilter, zkvmFilter, searchQuery]);

  // Never fall back to mocked jobs when `DATA: LIVE` has 0 jobs
  const inspectedJob: MarketplaceJob | null = useMemo(() => {
    if (selectedJobId) {
      const found = filteredJobs.find((j) => j.jobId === selectedJobId);
      if (found) return found;
    }
    if (filteredJobs.length > 0) return filteredJobs[0];
    if (liveStreamEnabled) {
      return liveJobs[0] ?? buildBaselineJobs(networkKey)[0];
    }
    return null;
  }, [selectedJobId, filteredJobs, liveJobs, liveStreamEnabled, networkKey]);

  const simulatedJobSizing = useMemo(() => {
    if (!inspectedJob) return null;
    return runDeterministicSimulation({
      elfUrl: inspectedJob.elfUri,
      targetZkvm: inspectedJob.zkvm,
      stdin: "0x00000001",
      singleRun: true,
      declaredCycles: inspectedJob.expectedCycles,
      jobId: inspectedJob.jobId,
      programId: inspectedJob.programId,
    });
  }, [inspectedJob]);

  const copyValue = (key: string, val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1400);
  };

  const claimGateBlock = data?.latestBlock
    ? Number(data.latestBlock)
    : networkKey === "sepolia"
      ? 7_098_412
      : 4_182_904;

  const estimatedKeccakCharges = simulatedJobSizing
    ? Number(simulatedJobSizing.keccakCharges)
    : 0;

  const tokenSymbolLabel = networkKey === "sepolia" ? "tHEMI" : "HEMI";
  const isLiveStagedMainnet = !liveStreamEnabled && isMainnetStaged;

  const litSegments =
    kpis.activeAuctions <= 0
      ? 0
      : Math.min(12, Math.max(2, Math.round(kpis.activeAuctions * 0.65)));

  return (
    <div className="w-full bg-[#0B0B0A]">
      {/* 1. Top 4-Cell Flush Metric Strip (2x2 on mobile, 4-col on desktop, zero gaps, zero rounded corners) */}
      <section className="grid grid-cols-2 divide-x divide-y divide-[#232320] border-b border-[#232320] bg-[#111110] md:grid-cols-4 md:divide-y-0">
        {/* Cell 1: 01 // TOTAL PROVING JOBS */}
        <div className="p-3 sm:px-5 sm:py-4">
          <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
            01 // TOTAL PROVING JOBS
          </div>
          <div className="mt-1.5 sm:mt-2 font-mono text-lg sm:text-2xl font-semibold tabular-nums text-[#EDEDEC]">
            {isLiveStagedMainnet ? (
              <span>
                0 <span className="text-xs sm:text-sm font-normal text-[#63635E]">(STAGED)</span>
              </span>
            ) : (
              kpis.totalJobs.toLocaleString()
            )}
          </div>
          <div className="mt-1 sm:mt-1.5 flex flex-wrap items-center justify-between gap-1 font-mono text-[10px] sm:text-[11px] tabular-nums text-[#9A9A94]">
            <span>
              PAID: {kpis.totalPaidHemi.toLocaleString()} {tokenSymbolLabel}
            </span>
            <span className="text-[#63635E]">
              {isLiveStagedMainnet
                ? "PRE-DEPLOY"
                : `${kpis.activeProvers} PROVERS`}
            </span>
          </div>
        </div>

        {/* Cell 2: 02 // ACTIVE ESCALATING AUCTIONS */}
        <div className="p-3 sm:px-5 sm:py-4">
          <div className="flex items-center text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
            <span className="truncate">02 // ACTIVE AUCTIONS</span>
            <InfoTip
              label="What is an Escalating Offer (Dutch Ramp)?"
              text="Each job's HEMI reward starts at a minimum offer and ramps up over time until the first staked GPU prover claims and fulfills it."
            />
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-lg sm:text-2xl font-semibold tabular-nums text-[#EDEDEC]">
              {isLiveStagedMainnet ? (
                <span>
                  0 <span className="text-xs sm:text-sm font-normal text-[#63635E]">(STAGED)</span>
                </span>
              ) : (
                kpis.activeAuctions
              )}
            </span>
            <span className="hidden sm:inline font-mono text-[11px] uppercase tabular-nums text-[#9A9A94]">
              {isLiveStagedMainnet
                ? "ROUTER STAGED"
                : kpis.activeAuctions > 0
                  ? "DUTCH RAMP ACTIVE"
                  : "IDLE WINDOW"}
            </span>
          </div>
          {/* Inline segmented activity bar */}
          <div className="mt-2 sm:mt-2.5 grid grid-cols-12 gap-0.5 sm:gap-1">
            {Array.from({ length: 12 }, (_, idx) => {
              const activeSeg = idx < litSegments;
              return (
                <div
                  key={idx}
                  className={cn(
                    "h-1.5 rounded-none",
                    activeSeg ? "bg-[#FF5500]" : "bg-[#232320]"
                  )}
                />
              );
            })}
          </div>
        </div>

        {/* Cell 3: 03 // PROOF DIVERSITY (2-OF-3) */}
        <div className="p-3 sm:px-5 sm:py-4">
          <div className="flex items-center justify-between gap-1">
            <span className="inline-flex items-center text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
              <span className="truncate">03 // PROOF DIVERSITY</span>
              <InfoTip
                label="What is 2-of-3 Proof Diversity?"
                text="High-value settlements can require independent proofs from at least 2 of 3 zkVMs (RISC Zero, SP1, OpenVM) so no single prover bug compromises funds."
              />
            </span>
            <span className="hidden sm:inline font-mono text-[10px] tabular-nums text-[#9A9A94]">
              {isLiveStagedMainnet
                ? "STAGED"
                : `${kpis.diversitySplit.multiProofBundles}% MULTI`}
            </span>
          </div>
          {/* Compact horizontal stacked bar */}
          <div className="mt-2.5 sm:mt-3 flex h-2 w-full overflow-hidden rounded-none bg-[#232320]">
            <div
              style={{ width: `${kpis.diversitySplit.risc0}%` }}
              className="h-full bg-[#EDEDEC]"
              title={`RISC0: ${kpis.diversitySplit.risc0}%`}
            />
            <div
              style={{ width: `${kpis.diversitySplit.sp1}%` }}
              className="h-full bg-[#FF5500]"
              title={`SP1: ${kpis.diversitySplit.sp1}%`}
            />
            <div
              style={{ width: `${kpis.diversitySplit.openvm}%` }}
              className="h-full bg-[#63635E]"
              title={`OPENVM: ${kpis.diversitySplit.openvm}%`}
            />
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-center justify-between font-mono text-[9px] sm:text-[11px] tabular-nums text-[#9A9A94]">
            <span>
              <span className="mr-1 inline-block h-1.5 w-1.5 bg-[#EDEDEC] align-middle" />
              R0 {kpis.diversitySplit.risc0}%
            </span>
            <span>
              <span className="mr-1 inline-block h-1.5 w-1.5 bg-[#FF5500] align-middle" />
              SP1 {kpis.diversitySplit.sp1}%
            </span>
            <span>
              <span className="mr-1 inline-block h-1.5 w-1.5 bg-[#63635E] align-middle" />
              OVM {kpis.diversitySplit.openvm}%
            </span>
          </div>
        </div>

        {/* Cell 4: 04 // VERIFIED PROOFS & AVG SETTLEMENT */}
        <div className="p-3 sm:px-5 sm:py-4">
          <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
            04 // VERIFIED PROOFS
          </div>
          <div className="mt-1.5 sm:mt-2 font-mono text-lg sm:text-2xl font-semibold tabular-nums text-[#EDEDEC]">
            {isLiveStagedMainnet ? (
              <span>
                0 <span className="text-xs sm:text-sm font-normal text-[#63635E]">(STAGED)</span>
              </span>
            ) : (
              kpis.proofsVerified.toLocaleString()
            )}
          </div>
          <div className="mt-1 sm:mt-1.5 flex items-center justify-between font-mono text-[10px] sm:text-[11px] tabular-nums text-[#9A9A94]">
            <span className="truncate">
              {kpis.avgSettlementSecs > 0
                ? `AVG: ${kpis.avgSettlementSecs.toFixed(1)}s`
                : !liveStreamEnabled && deployment.router
                  ? "SEPOLIA 743111"
                  : "STAGED"}
            </span>
            <span
              className={cn(
                "shrink-0",
                isLiveStagedMainnet ? "text-[#63635E]" : "text-[#10B981]"
              )}
            >
              {isLiveStagedMainnet ? "STAGED" : "FINALIZED"}
            </span>
          </div>
        </div>
      </section>

      {/* Mobile Master-Detail Panel Switcher (< lg) */}
      <div className="grid grid-cols-2 divide-x divide-[#232320] border-b border-[#232320] bg-[#111110] font-mono text-[11px] tabular-nums lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePane("table")}
          className={cn(
            "relative h-9 px-2 uppercase tracking-wider transition-colors",
            mobilePane === "table"
              ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
              : "text-[#63635E] hover:text-[#EDEDEC]"
          )}
        >
          [01 // AUCTIONS ({filteredJobs.length})]
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("inspector")}
          className={cn(
            "relative h-9 px-2 uppercase tracking-wider transition-colors",
            mobilePane === "inspector"
              ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
              : "text-[#63635E] hover:text-[#EDEDEC]"
          )}
        >
          [02 // INSPECTOR {inspectedJob ? `#${inspectedJob.shortNumericId}` : "STANDBY"}]
        </button>
      </div>

      {/* 2. Main Split Workbench (8 Cols Auction Table / 4 Cols Docked Job Telemetry Inspector) */}
      <section className="grid min-h-[calc(100vh-12.5rem)] grid-cols-1 divide-y divide-[#232320] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Left 8 Columns: High-Density Auction Table */}
        <div
          className={cn(
            "flex flex-col bg-[#0B0B0A] lg:col-span-8",
            mobilePane === "inspector" && "hidden lg:flex"
          )}
        >
          {/* Quiet Filter Bar (Swipeable single line on mobile, full-width search below) */}
          <div className="flex flex-col gap-2 border-b border-[#232320] bg-[#0B0B0A] px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4 sm:py-2.5">
            <div className="flex w-full items-center gap-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] sm:w-auto">
              {/* zkVM Monospace Filter Pills */}
              <div className="flex shrink-0 items-center gap-0.5">
                {(
                  [
                    { id: "ALL", label: "ALL" },
                    { id: "risc0", label: "RISC0" },
                    { id: "sp1", label: "SP1" },
                    { id: "openvm", label: "OPENVM" },
                  ] as const
                ).map((vm) => {
                  const active = zkvmFilter === vm.id;
                  return (
                    <button
                      key={vm.id}
                      type="button"
                      onClick={() => setZkvmFilter(vm.id)}
                      className={cn(
                        "shrink-0 rounded-[2px] px-2 py-1 uppercase tracking-wider transition-colors",
                        active
                          ? "bg-[#181816] font-semibold text-[#EDEDEC] shadow-[inset_0_-1px_0_0_#FF5500]"
                          : "text-[#63635E] hover:text-[#EDEDEC]"
                      )}
                    >
                      {vm.label}
                    </button>
                  );
                })}
              </div>

              <span className="mx-1 h-3.5 w-px shrink-0 bg-[#232320] sm:mx-1.5" aria-hidden="true" />

              {/* Status Monospace Filter Pills */}
              <div className="flex shrink-0 items-center gap-0.5">
                {(
                  [
                    { id: "ALL", label: "ALL STATUS" },
                    { id: "Open", label: "OPEN" },
                    { id: "Claimed", label: "CLAIMED" },
                    { id: "Verified", label: "VERIFIED" },
                  ] as const
                ).map((st) => {
                  const active = statusFilter === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStatusFilter(st.id)}
                      className={cn(
                        "shrink-0 rounded-[2px] px-2 py-1 uppercase tracking-wider transition-colors",
                        active
                          ? "bg-[#181816] font-semibold text-[#EDEDEC] shadow-[inset_0_-1px_0_0_#FF5500]"
                          : "text-[#63635E] hover:text-[#EDEDEC]"
                      )}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="FILTER JOB / CALLER / ELF..."
                className="h-7 flex-1 sm:w-56 sm:flex-none text-[11px]"
              />
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                {isFetching ? "SYNCING..." : "SYNC RPC"}
              </Button>
            </div>
          </div>

          {/* Crisp Data Table or Honest Empty State */}
          {filteredJobs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center font-mono">
              {!liveStreamEnabled ? (
                isMainnetStaged ? (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#EDEDEC]">
                      HEMI MAINNET [43111] // ROUTER STAGED (PRE-DEPLOYMENT)
                    </div>
                    <div className="max-w-md font-sans text-xs leading-relaxed text-[#9A9A94]">
                      The audited <code className="font-mono text-[#EDEDEC]">HemiProve</code> v2
                      diamond router is currently active on Hemi Sepolia (
                      <code className="font-mono text-[#EDEDEC]">743111</code>) while Mainnet (
                      <code className="font-mono text-[#EDEDEC]">43111</code>) deployment is
                      staged. Switch to Sepolia live telemetry or preview the Demo stream.
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                      <Button size="sm" onClick={() => setNetworkKey("sepolia")}>
                        [SWITCH TO SEPOLIA 743111 LIVE DEPLOYMENT]
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setLiveStreamEnabled(true)}
                      >
                        [SWITCH TO DEMO TELEMETRY STREAM]
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#EDEDEC]">
                      0 LIVE ON-CHAIN JOBS IN ACTIVE FILTER WINDOW (SEPOLIA 743111)
                    </div>
                    <div className="max-w-md font-sans text-xs leading-relaxed text-[#9A9A94]">
                      Connected to live Sepolia router{" "}
                      <code className="font-mono text-[#EDEDEC]">
                        {deployment.router ? shortenHex(deployment.router, 6, 4) : ""}
                      </code>{" "}
                      (on-chain <code className="font-mono text-[#EDEDEC]">jobIndex</code>:{" "}
                      <code className="font-mono text-[#EDEDEC]">
                        {(data?.onChainJobIndex ?? 0).toLocaleString()}
                      </code>
                      ). Clear active filters or enable the Demo telemetry stream to inspect live
                      Dutch ramp simulations.
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                      {(statusFilter !== "ALL" || zkvmFilter !== "ALL" || searchQuery) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setStatusFilter("ALL");
                            setZkvmFilter("ALL");
                            setSearchQuery("");
                          }}
                        >
                          [RESET QUERY FILTERS]
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setLiveStreamEnabled(true)}>
                        [SWITCH TO DEMO TELEMETRY STREAM]
                      </Button>
                    </div>
                  </>
                )
              ) : (
                <>
                  <div className="text-xs uppercase tracking-wider text-[#9A9A94]">
                    NO PROVING JOBS MATCH ACTIVE QUERY PARAMETERS
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setStatusFilter("ALL");
                      setZkvmFilter("ALL");
                      setSearchQuery("");
                    }}
                  >
                    [RESET QUERY FILTERS]
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-[#232320] bg-[#111110] text-left text-[10px] uppercase tracking-[0.12em] text-[#63635E]">
                    <th className="px-2.5 sm:px-3.5 py-2.5 font-medium">JOB ID</th>
                    <th className="hidden md:table-cell px-3.5 py-2.5 font-medium">REQUESTER</th>
                    <th className="px-2.5 sm:px-3.5 py-2.5 font-medium">ZKVM</th>
                    <th className="hidden md:table-cell px-3.5 py-2.5 font-medium">ELF SOURCE</th>
                    <th className="px-2.5 sm:px-3.5 py-2.5 font-medium">
                      <span className="inline-flex items-center">
                        <span>ESCALATING OFFER</span>
                        <InfoTip
                          label="Explain Escalating Offer"
                          text="Each job's HEMI reward starts at a minimum offer and ramps up over time until the first staked GPU prover claims and fulfills it."
                        />
                      </span>
                    </th>
                    <th className="px-2.5 sm:px-3.5 py-2.5 font-medium">STATUS</th>
                    <th className="hidden md:table-cell px-3.5 py-2.5 font-medium">PROVER</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232320]">
                  {filteredJobs.map((job) => {
                    const isSelected = inspectedJob?.jobId === job.jobId;
                    const ratio =
                      job.maxOfferHemi > 0
                        ? Math.min(1, job.currentOfferHemi / job.maxOfferHemi)
                        : 1;
                    const asciiBar = renderAsciiBlocks(ratio, 10);

                    return (
                      <tr
                        key={job.jobId}
                        onClick={() => {
                          setSelectedJobId(job.jobId);
                          setMobilePane("inspector");
                        }}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-[#181816]",
                          isSelected
                            ? "bg-[#181816] shadow-[inset_2px_0_0_0_#FF5500]"
                            : "bg-[#0B0B0A]"
                        )}
                      >
                        {/* JOB ID */}
                        <td className="px-2.5 sm:px-3.5 py-3 align-top">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[#EDEDEC]">
                              #{job.shortNumericId}
                            </span>
                            {liveStreamEnabled && (
                              <span
                                className={cn(
                                  "text-[9px] uppercase",
                                  job.isSimulatedStream
                                    ? "text-[#63635E]"
                                    : "text-[#10B981]"
                                )}
                              >
                                {job.isSimulatedStream ? "DEMO" : "ON-CHAIN"}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] sm:text-[11px] text-[#63635E]">
                            {shortenHex(job.jobId, 4, 4)}
                          </div>
                          {/* Compact mobile sub-line for Requester & ELF Source */}
                          <div className="mt-0.5 flex items-center gap-1 text-[9px] uppercase text-[#9A9A94] md:hidden">
                            <span>
                              {job.requesterType === "Smart Contract" ? "[CONTRACT]" : "[EOA]"}
                            </span>
                            <span className="text-[#63635E]">•</span>
                            <span className="text-[#63635E]">
                              {job.elfSourceType === "Arweave"
                                ? "AR"
                                : job.elfSourceType === "IPFS"
                                  ? "IPFS"
                                  : "GH"}
                            </span>
                          </div>
                        </td>

                        {/* REQUESTER ([CONTRACT] vs [EOA] micro-tag) */}
                        <td className="hidden md:table-cell px-3.5 py-3 align-top">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "text-[10px]",
                                job.requesterType === "Smart Contract"
                                  ? "text-[#EDEDEC]"
                                  : "text-[#9A9A94]"
                              )}
                            >
                              {job.requesterType === "Smart Contract"
                                ? "[CONTRACT]"
                                : "[EOA]"}
                            </span>
                          </div>
                          <div className="mt-0.5 max-w-[140px] truncate text-[11px] text-[#9A9A94]">
                            {job.requesterLabel ?? shortenHex(job.requester, 5, 4)}
                          </div>
                        </td>

                        {/* ZKVM (borderless technical text) */}
                        <td className="px-2.5 sm:px-3.5 py-3 align-top">
                          <div className="text-[11px] font-semibold uppercase text-[#EDEDEC]">
                            {job.zkvm}
                          </div>
                          {job.multiProofGroup && (
                            <div className="mt-0.5 text-[10px] text-[#63635E]">
                              2-OF-3
                            </div>
                          )}
                        </td>

                        {/* ELF SOURCE */}
                        <td className="hidden md:table-cell px-3.5 py-3 align-top">
                          <div className="text-[10px] uppercase text-[#9A9A94]">
                            {job.elfSourceType === "Arweave"
                              ? "ARWEAVE"
                              : job.elfSourceType === "IPFS"
                                ? "IPFS"
                                : "GITHUB"}
                          </div>
                          <div className="mt-0.5 max-w-[120px] truncate text-[10px] text-[#63635E]">
                            {job.elfUri.replace(/^https?:\/\//, "")}
                          </div>
                        </td>

                        {/* ESCALATING OFFER (numeric + 10-segment ASCII progress indicator) */}
                        <td className="px-2.5 sm:px-3.5 py-3 align-top">
                          <div className="flex items-baseline justify-between gap-1.5 sm:gap-2">
                            <span className="font-semibold text-[#EDEDEC]">
                              {job.currentOfferHemi.toFixed(2)} {tokenSymbolLabel}
                            </span>
                            <span className="text-[10px] text-[#63635E]">
                              /{job.maxOfferHemi.toFixed(1)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[10px] sm:text-[11px] tracking-[0.06em]">
                            <span className="text-[#FF5500]">
                              {asciiBar.slice(0, Math.round(ratio * 10))}
                            </span>
                            <span className="text-[#63635E]">
                              {asciiBar.slice(Math.round(ratio * 10))}
                            </span>
                          </div>
                        </td>

                        {/* STATUS (borderless dot indicator) */}
                        <td className="px-2.5 sm:px-3.5 py-3 align-top">
                          <StatusTag status={job.status} />
                        </td>

                        {/* PROVER */}
                        <td className="hidden md:table-cell px-3.5 py-3 align-top text-[11px]">
                          {job.proverAddress ? (
                            <span className="text-[#9A9A94]">
                              {shortenHex(job.proverAddress, 4, 4)}
                            </span>
                          ) : (
                            <span className="text-[#63635E]">UNCLAIMED</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right 4 Columns: Docked Job Telemetry Inspector (Honest Standby in Empty LIVE Mode) */}
        <aside
          className={cn(
            "flex flex-col divide-y divide-[#232320] bg-[#111110] lg:col-span-4",
            mobilePane === "table" && "hidden lg:flex"
          )}
        >
          {!inspectedJob ? (
            <div className="flex flex-1 flex-col justify-between p-4 font-mono text-xs tabular-nums">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-[#63635E]">
                      INSPECTOR // LIVE TELEMETRY STANDBY
                    </span>
                    <button
                      type="button"
                      onClick={() => setMobilePane("table")}
                      className="rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#9A9A94] hover:text-[#EDEDEC] lg:hidden"
                    >
                      [&lt;- TABLE]
                    </button>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#EDEDEC]">
                    {isMainnetStaged
                      ? "Hemi Mainnet [43111] — Pre-Deployment"
                      : "No Active Live Job Selected"}
                  </div>
                  <p className="mt-1.5 font-sans text-xs leading-relaxed text-[#9A9A94]">
                    {isMainnetStaged
                      ? "HemiProve v2 Mainnet contracts are currently staged. No mocked or Sepolia jobs are shown in Mainnet LIVE mode."
                      : "0 on-chain proving jobs matched your current LIVE query window on Sepolia 743111."}
                  </p>
                </div>

                <div className="divide-y divide-[#232320] border border-[#232320] bg-[#0B0B0A] text-[11px]">
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">ACTIVE_CHAIN</span>
                    <span className="text-[#EDEDEC]">{deployment.shortName}</span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">ROUTER_STATUS</span>
                    <span className="text-[#9A9A94]">
                      {deployment.router
                        ? shortenHex(deployment.router, 6, 4)
                        : "STAGED (PRE-DEPLOYMENT)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">HEAD_BLOCK</span>
                    <span className="text-[#EDEDEC]">
                      {data?.latestBlock
                        ? `#${Number(data.latestBlock).toLocaleString()}`
                        : "SYNCING"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">ONCHAIN_JOB_INDEX</span>
                    <span className="text-[#EDEDEC]">
                      {deployment.router
                        ? (data?.onChainJobIndex ?? 0).toLocaleString()
                        : "0 (STAGED)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">TOTAL_PAID_TO_PROVERS</span>
                    <span className="text-[#9A9A94]">
                      {deployment.router
                        ? `${(data?.totalPaidHemiOnChain ?? 0).toLocaleString()} ${tokenSymbolLabel}`
                        : "0 HEMI"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  {isMainnetStaged && (
                    <Button
                      size="default"
                      className="w-full"
                      onClick={() => setNetworkKey("sepolia")}
                    >
                      [SWITCH TO SEPOLIA 743111 LIVE DEPLOYMENT]
                    </Button>
                  )}
                  <Button
                    variant={isMainnetStaged ? "secondary" : "default"}
                    size="default"
                    className="w-full"
                    onClick={() => setLiveStreamEnabled(true)}
                  >
                    [SWITCH TO DEMO TELEMETRY STREAM]
                  </Button>
                </div>
              </div>

              {deployment.router && (
                <div className="pt-4">
                  <a
                    href={`${deployment.explorerUrl}/address/${deployment.router}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-8 w-full items-center justify-center rounded-[2px] border border-[#232320] bg-[#0B0B0A] font-mono text-[11px] uppercase tracking-wider text-[#9A9A94] transition-colors hover:bg-[#181816] hover:text-[#EDEDEC]"
                  >
                    INSPECT ROUTER ON{" "}
                    {deployment.explorerUrl.replace("https://", "").toUpperCase()} ↗
                  </a>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Inspector Header */}
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                    INSPECTOR // JOB #{inspectedJob.shortNumericId}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusTag status={inspectedJob.status} />
                    <button
                      type="button"
                      onClick={() => setMobilePane("table")}
                      className="rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#9A9A94] hover:text-[#EDEDEC] lg:hidden"
                    >
                      [&lt;- TABLE]
                    </button>
                  </div>
                </div>
                <div className="mt-2 font-mono text-sm font-semibold text-[#EDEDEC]">
                  {inspectedJob.programName}
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[11px] tabular-nums text-[#9A9A94]">
                  <span>FAMILY: {inspectedJob.programFamily}</span>
                  {inspectedJob.multiProofGroup && (
                    <span className="text-[#EDEDEC]">[{inspectedJob.multiProofGroup}]</span>
                  )}
                </div>
                <div className="mt-3">
                  <Button asChild size="default" className="w-full">
                    <Link
                      href={`/simulate?elf=${encodeURIComponent(
                        inspectedJob.elfUri
                      )}&zkvm=${inspectedJob.zkvm}&cycles=${
                        inspectedJob.expectedCycles
                      }&jobId=${encodeURIComponent(
                        inspectedJob.jobId
                      )}&program=${encodeURIComponent(inspectedJob.programId)}`}
                    >
                      AUDIT IN SIMULATE STUDIO -&gt;
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Datasheet Section 1: ELF Binary URI & Program ID */}
              <div className="space-y-2.5 p-4 font-mono text-xs tabular-nums">
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                  01 // ELF BINARY &amp; PROGRAM BINDING
                </div>

                <div className="rounded-[2px] border border-[#232320] bg-[#0B0B0A] p-2.5">
                  <div className="flex items-center justify-between text-[10px] text-[#63635E]">
                    <span>
                      STORAGE SOURCE [{inspectedJob.elfSourceType.toUpperCase()}]
                    </span>
                    <button
                      type="button"
                      onClick={() => copyValue("elf", inspectedJob.elfUri)}
                      className="inline-flex items-center gap-1 text-[#9A9A94] hover:text-[#EDEDEC]"
                    >
                      {copiedField === "elf" ? (
                        <>
                          <Check className="h-3 w-3 text-[#10B981]" /> COPIED
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> COPY URI
                        </>
                      )}
                    </button>
                  </div>
                  <div className="mt-1 break-all text-[11px] text-[#EDEDEC]">
                    {inspectedJob.elfUri.startsWith("http") ? (
                      <a
                        href={inspectedJob.elfUri}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-[#232320] hover:decoration-[#FF5500]"
                      >
                        {inspectedJob.elfUri}
                      </a>
                    ) : (
                      inspectedJob.elfUri
                    )}
                  </div>
                </div>

                <div className="divide-y divide-[#232320] border border-[#232320] bg-[#0B0B0A] text-[11px]">
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">JOB_ID</span>
                    <button
                      type="button"
                      onClick={() => copyValue("jobId", inspectedJob.jobId)}
                      className="inline-flex items-center gap-1 text-[#EDEDEC] hover:text-[#FF5500]"
                    >
                      <span>{shortenHex(inspectedJob.jobId, 8, 6)}</span>
                      {copiedField === "jobId" ? (
                        <Check className="h-3 w-3 text-[#10B981]" />
                      ) : (
                        <Copy className="h-3 w-3 text-[#63635E]" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">PROGRAM_ID</span>
                    <span className="text-[#9A9A94]">
                      {shortenHex(inspectedJob.programId, 8, 6)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">PROOF_SYSTEM</span>
                    <span className="text-[#EDEDEC]">{inspectedJob.proofSystemLabel}</span>
                  </div>
                </div>
              </div>

              {/* Datasheet Section 2: Auction Curve Parameters */}
              <div className="space-y-2.5 p-4 font-mono text-xs tabular-nums">
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                  02 // AUCTION CURVE PARAMETERS
                </div>
                <div className="divide-y divide-[#232320] border border-[#232320] bg-[#0B0B0A] text-[11px]">
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">START OFFER (MIN)</span>
                    <span className="text-[#9A9A94]">
                      {inspectedJob.minOfferHemi.toFixed(4)} {tokenSymbolLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">CURRENT OFFER</span>
                    <span className="font-semibold text-[#EDEDEC]">
                      {inspectedJob.currentOfferHemi.toFixed(4)} {tokenSymbolLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">MAX CAP ESCROW</span>
                    <span className="text-[#9A9A94]">
                      {inspectedJob.maxOfferHemi.toFixed(4)} {tokenSymbolLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">RAMP CURVE / WINDOW</span>
                    <span className="text-[#EDEDEC]">
                      {inspectedJob.curveType === 1 ? "QUADRATIC [1]" : "LINEAR [0]"} •{" "}
                      {formatDurationSecs(inspectedJob.elapsedSecs)} /{" "}
                      {formatDurationSecs(inspectedJob.rampUpPeriodSecs)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">CLAIM GATE BLOCK</span>
                    <span className="text-[#9A9A94]">#{claimGateBlock.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Datasheet Section 3: Execution Constraints */}
              <div className="space-y-2.5 p-4 font-mono text-xs tabular-nums">
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                  03 // EXECUTION CONSTRAINTS
                </div>
                <div className="divide-y divide-[#232320] border border-[#232320] bg-[#0B0B0A] text-[11px]">
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">MAX_CYCLES (DECLARED)</span>
                    <span className="text-[#EDEDEC]">
                      {inspectedJob.expectedCycles.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">KECCAK_CHARGES</span>
                    <span className="text-[#9A9A94]">
                      {estimatedKeccakCharges > 0
                        ? `${estimatedKeccakCharges.toLocaleString()} CYC`
                        : "0 (NATIVE / PRECOMPILE)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">TARGET ROUTER</span>
                    <span className="text-[#9A9A94]">
                      {deployment.router
                        ? shortenHex(deployment.router, 6, 4)
                        : "STAGED (PRE-DEPLOYMENT)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">
                      CALLER ({inspectedJob.requesterType.toUpperCase()})
                    </span>
                    <span className="text-[#EDEDEC]">
                      {shortenHex(inspectedJob.requester, 6, 4)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Datasheet Section 4: On-Chain Verification Receipt */}
              <div className="space-y-2.5 p-4 font-mono text-xs tabular-nums">
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                  04 // ON-CHAIN VERIFICATION RECEIPT
                </div>
                <div className="divide-y divide-[#232320] border border-[#232320] bg-[#0B0B0A] text-[11px]">
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">ASSIGNED PROVER</span>
                    <span className="text-[#EDEDEC]">
                      {inspectedJob.proverAddress
                        ? shortenHex(inspectedJob.proverAddress, 6, 4)
                        : "AWAITING CLAIM"}
                    </span>
                  </div>
                  {inspectedJob.proverGpuHint && (
                    <div className="flex items-center justify-between px-2.5 py-1.5">
                      <span className="text-[#63635E]">WORKER TELEMETRY</span>
                      <span className="text-[#9A9A94]">{inspectedJob.proverGpuHint}</span>
                    </div>
                  )}
                  {inspectedJob.txHash && (
                    <div className="flex items-center justify-between px-2.5 py-1.5">
                      <span className="text-[#63635E]">SUBMIT_TX</span>
                      <span className="text-[#9A9A94]">
                        {shortenHex(inspectedJob.txHash, 6, 6)}
                      </span>
                    </div>
                  )}
                </div>

                {deployment.router ? (
                  <div className="pt-1">
                    <a
                      href={`${deployment.explorerUrl}/address/${deployment.router}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-8 w-full items-center justify-center rounded-[2px] border border-[#232320] bg-[#0B0B0A] font-mono text-[11px] uppercase tracking-wider text-[#9A9A94] transition-colors hover:bg-[#181816] hover:text-[#EDEDEC]"
                    >
                      INSPECT ON{" "}
                      {deployment.explorerUrl.replace("https://", "").toUpperCase()} ↗
                    </a>
                  </div>
                ) : (
                  <div className="pt-1 text-center text-[10px] uppercase tracking-wider text-[#63635E]">
                    MAINNET 43111 ROUTER LINK STAGED (PRE-DEPLOYMENT)
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </section>
    </div>
  );
}
