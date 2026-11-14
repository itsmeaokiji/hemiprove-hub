"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import seedBenchmarksJson from "@/data/seed-benchmarks.json";
import { useHemiNetwork } from "@/components/providers";
import type { HemiPriceApiResponse } from "@/app/api/hemi-price/route";
import {
  parseZkMinerBenchmark,
  SAMPLE_CLI_BENCHMARK_OUTPUT,
  SAMPLE_JSON_BENCHMARK_OUTPUT,
  type BenchmarkEntry,
  type BenchmarkZkVm,
  type GpuVendor,
  type HostOs,
} from "@/lib/benchmark-parser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { cn, formatCycleRate, formatZkops } from "@/lib/utils";

const LOCAL_STORAGE_BENCHMARKS_KEY = "hemiprove-hub:community-benchmarks:v1";
const SESSION_STORAGE_BENCHMARKS_STATE_KEY = "hemiprove-hub:benchmarks-session:v1";

type SortKey = "zkops" | "efficiency" | "chacha" | "sha256";
type RailMode = "roi" | "submit";

interface BenchmarksSessionState {
  railMode: RailMode;
  mobileView: "table" | "rail";
  vendorFilter: "ALL" | GpuVendor;
  osFilter: "ALL" | HostOs;
  zkvmFilter: "ALL" | BenchmarkZkVm;
  sortBy: SortKey;
  searchQuery: string;
  selectedGpuId: string;
  cardCount: number;
  electricityRateKwh: number;
  dailyRewardPoolHemi: number;
  networkTotalMzkops: number;
  hemiPriceUsd: number;
  hemiPriceInput: string;
  isCustomPrice: boolean;
  rawInput: string;
  overrideModel: string;
  overrideVendor: "" | GpuVendor;
  overrideOs: HostOs;
  overrideVram: string;
  overrideTdp: string;
  overrideMsrp: string;
  submittedBy: string;
}

function formatHemiUsdInput(usd: number): string {
  if (usd >= 1) return Number(usd.toFixed(4)).toString();
  if (usd >= 0.01) return Number(usd.toFixed(5)).toString();
  return Number(usd.toFixed(6)).toString();
}

function extractArchCode(arch: string): string {
  const match = arch.match(/^([a-z0-9_]+)/i);
  return match ? match[1] : arch;
}

function isValidBenchmarkEntry(raw: unknown): raw is BenchmarkEntry {
  if (!raw || typeof raw !== "object") return false;
  const e = raw as Partial<BenchmarkEntry>;
  const w = e.workloads;
  if (!w || typeof w !== "object") return false;
  return (
    typeof e.id === "string" &&
    typeof e.zkops === "number" &&
    Number.isFinite(e.zkops) &&
    typeof w["sha256-chain"] === "number" &&
    typeof w["chacha-mix"] === "number" &&
    typeof w["ecdsa-verify"] === "number" &&
    typeof w["bigint-mul"] === "number" &&
    typeof w["memory-merkle"] === "number" &&
    typeof w["zkop-mix"] === "number"
  );
}

function VendorIndicator({ vendor, stack }: { vendor: GpuVendor; stack: string }) {
  if (vendor === "NVIDIA") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase text-[#10B981]">
        <span aria-hidden="true">●</span>
        <span>{stack}</span>
      </span>
    );
  }
  if (vendor === "AMD") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase text-[#F43F5E]">
        <span aria-hidden="true">●</span>
        <span>{stack}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase text-[#38BDF8]">
      <span aria-hidden="true">●</span>
      <span>{stack}</span>
    </span>
  );
}

export default function BenchmarksPage() {
  const { networkKey, deployment } = useHemiNetwork();

  const [communityEntries, setCommunityEntries] = useState<BenchmarkEntry[]>([]);
  const [railMode, setRailMode] = useState<RailMode>("roi");
  const [mobileView, setMobileView] = useState<"table" | "rail">("table");

  // Filters & Sorting
  const [vendorFilter, setVendorFilter] = useState<"ALL" | GpuVendor>("ALL");
  const [osFilter, setOsFilter] = useState<"ALL" | HostOs>("ALL");
  const [zkvmFilter, setZkvmFilter] = useState<"ALL" | BenchmarkZkVm>("ALL");
  const [sortBy, setSortBy] = useState<SortKey>("zkops");
  const [searchQuery, setSearchQuery] = useState("");

  // Docked Mode 1: ROI Calculator State
  const [selectedGpuId, setSelectedGpuId] = useState<string>("rtx-4090-cuda-sp1");
  const [cardCount, setCardCount] = useState<number>(2);
  const [electricityRateKwh, setElectricityRateKwh] = useState<number>(0.11);
  const [dailyRewardPoolHemi, setDailyRewardPoolHemi] = useState<number>(35_000);
  const [networkTotalMzkops, setNetworkTotalMzkops] = useState<number>(240);
  const [hemiPriceUsd, setHemiPriceUsd] = useState<number>(0.14);
  const [hemiPriceInput, setHemiPriceInput] = useState<string>("0.14");
  const [isCustomPrice, setIsCustomPrice] = useState<boolean>(false);

  const {
    data: priceData,
    isFetching: isPriceFetching,
    refetch: refetchHemiPrice,
  } = useQuery<HemiPriceApiResponse>({
    queryKey: ["hemi-price"],
    queryFn: async () => {
      const res = await fetch("/api/hemi-price");
      if (!res.ok) {
        throw new Error("HEMI price service unavailable");
      }
      return (await res.json()) as HemiPriceApiResponse;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!isCustomPrice && priceData?.live && priceData.usd > 0) {
      setHemiPriceUsd(priceData.usd);
      setHemiPriceInput(formatHemiUsdInput(priceData.usd));
    }
  }, [isCustomPrice, priceData]);

  const handlePriceInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setIsCustomPrice(true);
    setHemiPriceInput(raw);
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setHemiPriceUsd(parsed);
    } else if (raw.trim() === "") {
      setHemiPriceUsd(0);
    }
  };

  const handleResetToLivePrice = () => {
    setIsCustomPrice(false);
    if (priceData?.live && priceData.usd > 0) {
      setHemiPriceUsd(priceData.usd);
      setHemiPriceInput(formatHemiUsdInput(priceData.usd));
    } else {
      void refetchHemiPrice();
    }
  };

  // Docked Mode 2: Submit CLI Output State
  const [rawInput, setRawInput] = useState("");
  const [overrideModel, setOverrideModel] = useState("");
  const [overrideVendor, setOverrideVendor] = useState<"" | GpuVendor>("");
  const [overrideOs, setOverrideOs] = useState<HostOs>("Linux");
  const [overrideVram, setOverrideVram] = useState("16");
  const [overrideTdp, setOverrideTdp] = useState("");
  const [overrideMsrp, setOverrideMsrp] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const hasRestoredSessionRef = useRef(false);

  useEffect(() => {
    try {
      const savedSessionRaw = window.sessionStorage.getItem(
        SESSION_STORAGE_BENCHMARKS_STATE_KEY
      );
      if (savedSessionRaw) {
        const s = JSON.parse(savedSessionRaw) as Partial<BenchmarksSessionState>;
        if (s.railMode === "roi" || s.railMode === "submit") setRailMode(s.railMode);
        if (s.mobileView === "table" || s.mobileView === "rail")
          setMobileView(s.mobileView);
        if (s.vendorFilter) setVendorFilter(s.vendorFilter);
        if (s.osFilter) setOsFilter(s.osFilter);
        if (s.zkvmFilter) setZkvmFilter(s.zkvmFilter);
        if (s.sortBy) setSortBy(s.sortBy);
        if (typeof s.searchQuery === "string") setSearchQuery(s.searchQuery);
        if (typeof s.selectedGpuId === "string" && s.selectedGpuId)
          setSelectedGpuId(s.selectedGpuId);
        if (typeof s.cardCount === "number" && Number.isFinite(s.cardCount))
          setCardCount(s.cardCount);
        if (
          typeof s.electricityRateKwh === "number" &&
          Number.isFinite(s.electricityRateKwh)
        )
          setElectricityRateKwh(s.electricityRateKwh);
        if (
          typeof s.dailyRewardPoolHemi === "number" &&
          Number.isFinite(s.dailyRewardPoolHemi)
        )
          setDailyRewardPoolHemi(s.dailyRewardPoolHemi);
        if (
          typeof s.networkTotalMzkops === "number" &&
          Number.isFinite(s.networkTotalMzkops)
        )
          setNetworkTotalMzkops(s.networkTotalMzkops);
        if (typeof s.isCustomPrice === "boolean") {
          setIsCustomPrice(s.isCustomPrice);
          if (
            s.isCustomPrice &&
            typeof s.hemiPriceUsd === "number" &&
            Number.isFinite(s.hemiPriceUsd)
          ) {
            setHemiPriceUsd(s.hemiPriceUsd);
            setHemiPriceInput(
              typeof s.hemiPriceInput === "string"
                ? s.hemiPriceInput
                : String(s.hemiPriceUsd)
            );
          }
        }
        if (typeof s.rawInput === "string") setRawInput(s.rawInput);
        if (typeof s.overrideModel === "string") setOverrideModel(s.overrideModel);
        if (s.overrideVendor !== undefined) setOverrideVendor(s.overrideVendor);
        if (s.overrideOs) setOverrideOs(s.overrideOs);
        if (typeof s.overrideVram === "string") setOverrideVram(s.overrideVram);
        if (typeof s.overrideTdp === "string") setOverrideTdp(s.overrideTdp);
        if (typeof s.overrideMsrp === "string") setOverrideMsrp(s.overrideMsrp);
        if (typeof s.submittedBy === "string") setSubmittedBy(s.submittedBy);
      }
    } catch {
      // ignore
    } finally {
      hasRestoredSessionRef.current = true;
    }

    try {
      const saved = window.localStorage.getItem(LOCAL_STORAGE_BENCHMARKS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown[];
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(isValidBenchmarkEntry);
          setCommunityEntries(valid);
          if (valid.length !== parsed.length) {
            if (valid.length === 0) {
              window.localStorage.removeItem(LOCAL_STORAGE_BENCHMARKS_KEY);
            } else {
              window.localStorage.setItem(
                LOCAL_STORAGE_BENCHMARKS_KEY,
                JSON.stringify(valid)
              );
            }
          }
        }
      }
    } catch {
      // ignore
    }

    fetch("/api/benchmarks")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (payload?.entries && Array.isArray(payload.entries)) {
          const remoteCommunity = (payload.entries as unknown[])
            .filter(isValidBenchmarkEntry)
            .filter((e) => !e.verified);
          if (remoteCommunity.length > 0) {
            setCommunityEntries((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              return [
                ...prev,
                ...remoteCommunity.filter((r) => !existingIds.has(r.id)),
              ];
            });
          }
        }
      })
      .catch(() => {
        // ignore offline
      });
  }, []);

  useEffect(() => {
    if (!hasRestoredSessionRef.current) return;
    try {
      const payload: BenchmarksSessionState = {
        railMode,
        mobileView,
        vendorFilter,
        osFilter,
        zkvmFilter,
        sortBy,
        searchQuery,
        selectedGpuId,
        cardCount,
        electricityRateKwh,
        dailyRewardPoolHemi,
        networkTotalMzkops,
        hemiPriceUsd,
        hemiPriceInput,
        isCustomPrice,
        rawInput,
        overrideModel,
        overrideVendor,
        overrideOs,
        overrideVram,
        overrideTdp,
        overrideMsrp,
        submittedBy,
      };
      window.sessionStorage.setItem(
        SESSION_STORAGE_BENCHMARKS_STATE_KEY,
        JSON.stringify(payload)
      );
    } catch {
      // ignore storage quota errors
    }
  }, [
    railMode,
    mobileView,
    vendorFilter,
    osFilter,
    zkvmFilter,
    sortBy,
    searchQuery,
    selectedGpuId,
    cardCount,
    electricityRateKwh,
    dailyRewardPoolHemi,
    networkTotalMzkops,
    hemiPriceUsd,
    hemiPriceInput,
    isCustomPrice,
    rawInput,
    overrideModel,
    overrideVendor,
    overrideOs,
    overrideVram,
    overrideTdp,
    overrideMsrp,
    submittedBy,
  ]);

  const allEntries = useMemo<BenchmarkEntry[]>(() => {
    return [...(seedBenchmarksJson as BenchmarkEntry[]), ...communityEntries];
  }, [communityEntries]);

  const maxZkopsScore = useMemo(() => {
    return Math.max(1, ...allEntries.map((e) => e.zkops));
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allEntries.filter((item) => {
      if (vendorFilter !== "ALL" && item.vendor !== vendorFilter) return false;
      if (osFilter !== "ALL" && item.os !== osFilter) return false;
      if (zkvmFilter !== "ALL" && item.zkvm !== zkvmFilter) return false;
      if (!q) return true;
      return (
        item.model.toLowerCase().includes(q) ||
        item.computeStack.toLowerCase().includes(q) ||
        item.arch.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q)
      );
    });

    return list.sort((a, b) => {
      if (sortBy === "efficiency") {
        const effA = a.tdpWatts > 0 ? a.zkops / a.tdpWatts : 0;
        const effB = b.tdpWatts > 0 ? b.zkops / b.tdpWatts : 0;
        return effB - effA;
      }
      if (sortBy === "chacha") {
        return a.workloads["chacha-mix"] - b.workloads["chacha-mix"];
      }
      if (sortBy === "sha256") {
        return a.workloads["sha256-chain"] - b.workloads["sha256-chain"];
      }
      return b.zkops - a.zkops;
    });
  }, [allEntries, vendorFilter, osFilter, zkvmFilter, sortBy, searchQuery]);

  const selectedGpu = useMemo(() => {
    return allEntries.find((e) => e.id === selectedGpuId) ?? allEntries[0];
  }, [allEntries, selectedGpuId]);

  const roiStats = useMemo(() => {
    const safeCards = Math.max(1, Math.min(8, cardCount));
    const rigZkops = selectedGpu.zkops * safeCards;
    const rigMzkops = rigZkops / 1_000_000;
    const totalNetworkZkops = Math.max(rigZkops, networkTotalMzkops * 1_000_000);
    const networkShareRatio = rigZkops / totalNetworkZkops;

    const dailyHemiGross = dailyRewardPoolHemi * networkShareRatio;
    const monthlyHemiGross = dailyHemiGross * 30;
    const dailyRevenueUsd = dailyHemiGross * hemiPriceUsd;

    // 85% proving utilization + 65W host overhead
    const activeWatts = safeCards * selectedGpu.tdpWatts * 0.85 + 65;
    const dailyKwh = (activeWatts * 24) / 1000;
    const dailyPowerCostUsd = dailyKwh * Math.max(0, electricityRateKwh);
    const dailyNetUsd = dailyRevenueUsd - dailyPowerCostUsd;
    const monthlyNetUsd = dailyNetUsd * 30;

    const hardwareCapexUsd = safeCards * selectedGpu.msrpUsd;
    const breakEvenDays =
      dailyNetUsd > 0 ? Math.ceil(hardwareCapexUsd / dailyNetUsd) : null;

    return {
      safeCards,
      rigZkops,
      rigMzkops,
      networkSharePct: networkShareRatio * 100,
      dailyHemiGross,
      monthlyHemiGross,
      dailyKwh,
      dailyPowerCostUsd,
      dailyNetUsd,
      monthlyNetUsd,
      breakEvenDays,
    };
  }, [
    selectedGpu,
    cardCount,
    electricityRateKwh,
    dailyRewardPoolHemi,
    networkTotalMzkops,
    hemiPriceUsd,
  ]);

  const liveParsePreview = useMemo(() => {
    if (!rawInput.trim()) return null;
    const parsedTdp = Number(overrideTdp);
    const parsedMsrp = Number(overrideMsrp);
    return parseZkMinerBenchmark(rawInput, {
      gpuModel: overrideModel || undefined,
      vendor: overrideVendor || undefined,
      os: overrideOs,
      vramGb: Number(overrideVram) || 16,
      tdpWatts: parsedTdp > 0 ? parsedTdp : undefined,
      msrpUsd: parsedMsrp > 0 ? parsedMsrp : undefined,
      submittedBy: submittedBy || undefined,
    });
  }, [
    rawInput,
    overrideModel,
    overrideVendor,
    overrideOs,
    overrideVram,
    overrideTdp,
    overrideMsrp,
    submittedBy,
  ]);

  const handleBenchmarkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveParsePreview?.ok || !liveParsePreview.entry) return;

    let canonicalEntry = liveParsePreview.entry;
    const parsedTdp = Number(overrideTdp);
    const parsedMsrp = Number(overrideMsrp);

    try {
      const res = await fetch("/api/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawOutput: rawInput,
          overrides: {
            gpuModel: overrideModel || undefined,
            vendor: overrideVendor || undefined,
            os: overrideOs,
            vramGb: Number(overrideVram) || 16,
            tdpWatts: parsedTdp > 0 ? parsedTdp : undefined,
            msrpUsd: parsedMsrp > 0 ? parsedMsrp : undefined,
            submittedBy: submittedBy || undefined,
          },
        }),
      });
      if (res.ok) {
        const payload = (await res.json()) as { ok?: boolean; entry?: BenchmarkEntry };
        if (payload.ok && payload.entry) {
          canonicalEntry = payload.entry;
        }
      }
    } catch {
      // Fall back to deterministic client entry when offline
    }

    const updated = [
      canonicalEntry,
      ...communityEntries.filter((item) => item.id !== canonicalEntry.id),
    ];
    setCommunityEntries(updated);
    try {
      window.localStorage.setItem(LOCAL_STORAGE_BENCHMARKS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    setSelectedGpuId(canonicalEntry.id);
    setRawInput("");
    setStatusBanner(
      `● APPENDED: ${canonicalEntry.model.toUpperCase()} // ${canonicalEntry.zkops.toLocaleString()} zkOP/s`
    );
    setRailMode("roi");
    setMobileView("rail");
    setTimeout(() => setStatusBanner(null), 5000);
  };

  const tokenLabel = networkKey === "sepolia" ? "tHEMI" : "HEMI";

  return (
    <div className="w-full bg-[#0B0B0A]">
      {/* 1. Top Filter & Hardware Summary Strip (Swipeable filter pills on mobile, full-width search below) */}
      <section className="flex flex-col gap-2 border-b border-[#232320] bg-[#111110] px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4 sm:py-2.5">
        <div className="flex w-full items-center gap-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] sm:w-auto sm:flex-wrap">
          {/* Vendor Filter */}
          <div className="flex shrink-0 items-center gap-0.5">
            {(
              [
                { key: "ALL", label: "ALL" },
                { key: "NVIDIA", label: "NVIDIA CUDA" },
                { key: "AMD", label: "AMD ROCM/HIP" },
                { key: "Intel", label: "INTEL SYCL" },
              ] as const
            ).map((v) => {
              const active = vendorFilter === v.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVendorFilter(v.key)}
                  className={cn(
                    "shrink-0 rounded-[2px] px-2 py-1 uppercase tracking-wider transition-colors",
                    active
                      ? "bg-[#181816] font-semibold text-[#EDEDEC] shadow-[inset_0_-1px_0_0_#FF5500]"
                      : "text-[#63635E] hover:text-[#EDEDEC]"
                  )}
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          <span className="mx-1 h-3.5 w-px shrink-0 bg-[#232320] sm:mx-1.5" aria-hidden="true" />

          {/* OS Filter */}
          <div className="flex shrink-0 items-center gap-0.5">
            {(
              [
                { key: "ALL", label: "ALL OS" },
                { key: "Linux", label: "LINUX" },
                { key: "Windows", label: "WINDOWS" },
              ] as const
            ).map((os) => {
              const active = osFilter === os.key;
              return (
                <button
                  key={os.key}
                  type="button"
                  onClick={() => setOsFilter(os.key)}
                  className={cn(
                    "shrink-0 rounded-[2px] px-2 py-1 uppercase tracking-wider transition-colors",
                    active
                      ? "bg-[#181816] font-semibold text-[#EDEDEC] shadow-[inset_0_-1px_0_0_#FF5500]"
                      : "text-[#63635E] hover:text-[#EDEDEC]"
                  )}
                >
                  {os.label}
                </button>
              );
            })}
          </div>

          <span className="mx-1 h-3.5 w-px shrink-0 bg-[#232320] sm:mx-1.5" aria-hidden="true" />

          {/* zkVM Filter */}
          <div className="flex shrink-0 items-center gap-0.5">
            {(
              [
                { key: "ALL", label: "ALL ZKVM" },
                { key: "sp1", label: "SP1" },
                { key: "risc0", label: "RISC0" },
              ] as const
            ).map((vm) => {
              const active = zkvmFilter === vm.key;
              return (
                <button
                  key={vm.key}
                  type="button"
                  onClick={() => setZkvmFilter(vm.key)}
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

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="h-7 shrink-0 rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2 font-mono text-[11px] uppercase text-[#9A9A94] focus:border-[#FF5500] focus:outline-none"
          >
            <option value="zkops">SORT: ZKOP/S DESC</option>
            <option value="efficiency">SORT: ZKOP/WATT</option>
            <option value="chacha">SORT: CHACHA-MIX (S)</option>
            <option value="sha256">SORT: SHA256-CHAIN (S)</option>
          </select>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="SEARCH ARCH / GPU..."
            className="h-7 flex-1 sm:w-48 sm:flex-none text-[11px]"
          />
          {communityEntries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setCommunityEntries([]);
                try {
                  window.localStorage.removeItem(LOCAL_STORAGE_BENCHMARKS_KEY);
                } catch {
                  // ignore
                }
                setSelectedGpuId("rtx-4090-cuda-sp1");
                setStatusBanner("CLEARED LOCAL USER BENCHMARK SUBMISSIONS");
              }}
              title="Clear unverified user benchmark entries saved in this browser's localStorage"
              className="h-7 shrink-0 rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2 font-mono text-[10px] uppercase tracking-wider text-[#9A9A94] transition-colors hover:border-[#F43F5E] hover:text-[#F43F5E]"
            >
              [CLEAR USER ({communityEntries.length})]
            </button>
          )}
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => {
              setRailMode("submit");
              setMobileView("rail");
            }}
          >
            <span className="sm:hidden">[+ SUBMIT CLI]</span>
            <span className="hidden sm:inline">[+ SUBMIT ZKMINER BENCHMARK]</span>
          </Button>
        </div>
      </section>

      {statusBanner && (
        <div className="border-b border-[#232320] bg-[#181816] px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-[#10B981]">
          {statusBanner}
        </div>
      )}

      {/* Mobile Master-Detail Panel Switcher (< lg) */}
      <div className="grid grid-cols-3 divide-x divide-[#232320] border-b border-[#232320] bg-[#111110] font-mono text-[10px] sm:text-[11px] tabular-nums lg:hidden">
        <button
          type="button"
          onClick={() => setMobileView("table")}
          className={cn(
            "relative h-9 px-1.5 uppercase tracking-wider transition-colors",
            mobileView === "table"
              ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
              : "text-[#63635E] hover:text-[#EDEDEC]"
          )}
        >
          [01 // GPUS ({filteredEntries.length})]
        </button>
        <button
          type="button"
          onClick={() => {
            setRailMode("roi");
            setMobileView("rail");
          }}
          className={cn(
            "relative h-9 truncate px-1.5 uppercase tracking-wider transition-colors",
            mobileView === "rail" && railMode === "roi"
              ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
              : "text-[#63635E] hover:text-[#EDEDEC]"
          )}
        >
          [02 // ROI: {selectedGpu.shortModel}]
        </button>
        <button
          type="button"
          onClick={() => {
            setRailMode("submit");
            setMobileView("rail");
          }}
          className={cn(
            "relative h-9 px-1.5 uppercase tracking-wider transition-colors",
            mobileView === "rail" && railMode === "submit"
              ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
              : "text-[#63635E] hover:text-[#EDEDEC]"
          )}
        >
          [03 // SUBMIT CLI]
        </button>
      </div>

      {/* 2. Main Split Workbench (8 Cols GPU Datasheet Table / 4 Cols Docked Control Rail) */}
      <section className="grid min-h-[calc(100vh-10rem)] grid-cols-1 divide-y divide-[#232320] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Left 8 Columns: Geekbench/Oxide-Style GPU Datasheet Table */}
        <div
          className={cn(
            "overflow-x-auto bg-[#0B0B0A] lg:col-span-8",
            mobileView === "rail" && "hidden lg:block"
          )}
        >
          <table className="w-full border-collapse font-mono text-xs tabular-nums">
            <thead>
              <tr className="border-b border-[#232320] bg-[#111110] text-left text-[10px] uppercase tracking-[0.12em] text-[#63635E]">
                <th className="px-2.5 sm:px-3 py-2.5 font-medium">RANK</th>
                <th className="px-2.5 sm:px-3 py-2.5 font-medium">GPU MODEL &amp; ARCH</th>
                <th className="px-2.5 sm:px-3 py-2.5 font-medium">BACKEND / OS</th>
                <th className="min-w-[145px] sm:min-w-[195px] px-2.5 sm:px-3 py-2.5 font-medium">
                  <span className="inline-flex items-center">
                    <span>UNIFIED SCORE (zkOP/s)</span>
                    <InfoTip
                      label="Explain zkOP/s"
                      text="Miner-scored GPU proving speed (Protocol 12 measure_zkop_mix): 1 zkOP equals 1 SP1 RISC-V cycle on the 50,007,139-cycle zkop-mix guest (3,202 iterations, median of up to 3 runs after a 200-iter warm-up)."
                    />
                  </span>
                </th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-right font-medium">SHA256</th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-right font-medium">CHACHA</th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-right font-medium">ECDSA</th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-right font-medium">BIGINT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232320]">
              {filteredEntries.map((entry, idx) => {
                const isSelected = entry.id === selectedGpu.id;
                const pctOfMax = Math.max(
                  4,
                  Math.min(100, (entry.zkops / maxZkopsScore) * 100)
                );
                const archCode = extractArchCode(entry.arch);

                return (
                  <tr
                    key={entry.id}
                    onClick={() => {
                      setSelectedGpuId(entry.id);
                      if (railMode !== "roi") setRailMode("roi");
                      setMobileView("rail");
                    }}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-[#181816]",
                      isSelected
                        ? "bg-[#181816] shadow-[inset_2px_0_0_0_#FF5500]"
                        : "bg-[#0B0B0A]"
                    )}
                  >
                    {/* RANK */}
                    <td className="px-2.5 sm:px-3 py-3 align-top text-[#63635E]">
                      {String(idx + 1).padStart(2, "0")}
                    </td>

                    {/* GPU MODEL & ARCH (borderless datasheet metadata) */}
                    <td className="px-2.5 sm:px-3 py-3 align-top">
                      <div className="font-semibold text-[#EDEDEC]">
                        {entry.shortModel}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[#9A9A94]">
                        <span>{archCode}</span>
                        <span className="text-[#63635E]">•</span>
                        <span className="text-[#EDEDEC]">{entry.vramGb}GB</span>
                        {!entry.verified && (
                          <>
                            <span className="text-[#63635E]">•</span>
                            <span className="text-[#FF5500]">● USER</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* BACKEND / OS (borderless dot indicator) */}
                    <td className="px-2.5 sm:px-3 py-3 align-top">
                      <VendorIndicator vendor={entry.vendor} stack={entry.computeStack} />
                      <div className="mt-1 text-[10px] uppercase text-[#9A9A94]">
                        {entry.zkvm.toUpperCase()} • {entry.os.toUpperCase()} • PO2=
                        {entry.optimalPo2}
                      </div>
                    </td>

                    {/* UNIFIED SCORE (zkOP/s) + Inline Proportion Bar */}
                    <td className="px-2.5 sm:px-3 py-3 align-top">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-[#EDEDEC]">
                          {entry.zkops.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-[#63635E]">
                          {entry.tdpWatts > 0
                            ? `${Math.round(entry.zkops / entry.tdpWatts).toLocaleString()} /W`
                            : "—"}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full bg-[#232320]">
                        <div
                          className="h-full bg-[#FF5500]"
                          style={{ width: `${pctOfMax}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[9px] text-[#9A9A94] sm:hidden">
                        <span>SHA: {entry.workloads["sha256-chain"].toFixed(1)}s</span>
                        <span>CHACHA: {entry.workloads["chacha-mix"].toFixed(1)}s</span>
                      </div>
                    </td>

                    {/* Individual Workload Timings in Seconds */}
                    <td className="hidden sm:table-cell px-3 py-3 text-right align-top text-[#EDEDEC]">
                      {entry.workloads["sha256-chain"].toFixed(1)}s
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3 text-right align-top text-[#EDEDEC]">
                      {entry.workloads["chacha-mix"].toFixed(2)}s
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3 text-right align-top text-[#9A9A94]">
                      {entry.workloads["ecdsa-verify"].toFixed(2)}s
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3 text-right align-top text-[#9A9A94]">
                      {entry.workloads["bigint-mul"].toFixed(2)}s
                    </td>
                  </tr>
                );
              })}
              {filteredEntries.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="bg-[#0B0B0A] px-4 py-12 text-center font-mono text-xs text-[#9A9A94]"
                  >
                    <div className="uppercase tracking-wider text-[#EDEDEC]">
                      0 BENCHMARKS MATCH ACTIVE HARDWARE FILTERS
                    </div>
                    <p className="mt-1.5 font-sans text-[11px] text-[#63635E]">
                      Clear vendor, OS, zkVM, or search filters to view the 13 calibrated
                      baselines and community entries.
                    </p>
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setVendorFilter("ALL");
                          setOsFilter("ALL");
                          setZkvmFilter("ALL");
                          setSearchQuery("");
                        }}
                      >
                        [RESET BENCHMARK FILTERS]
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right 4 Columns: Docked Control Rail with Two Modes */}
        <aside
          className={cn(
            "flex flex-col bg-[#111110] lg:col-span-4",
            mobileView === "table" && "hidden lg:flex"
          )}
        >
          {/* Mode Switch Header */}
          <div className="grid grid-cols-2 divide-x divide-[#232320] border-b border-[#232320] font-mono text-[11px]">
            <button
              type="button"
              onClick={() => setRailMode("roi")}
              className={cn(
                "relative h-10 uppercase tracking-wider transition-colors",
                railMode === "roi"
                  ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
                  : "bg-[#111110] text-[#63635E] hover:bg-[#181816] hover:text-[#EDEDEC]"
              )}
            >
              [01 // ROI CALCULATOR]
            </button>
            <button
              type="button"
              onClick={() => setRailMode("submit")}
              className={cn(
                "relative h-10 uppercase tracking-wider transition-colors",
                railMode === "submit"
                  ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
                  : "bg-[#111110] text-[#63635E] hover:bg-[#181816] hover:text-[#EDEDEC]"
              )}
            >
              [02 // SUBMIT CLI OUTPUT]
            </button>
          </div>

          {railMode === "roi" ? (
            <div className="flex flex-col divide-y divide-[#232320] font-mono text-xs tabular-nums">
              {/* Selected Hardware Telemetry Header */}
              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                    01 // SELECTED HARDWARE UNIT
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#9A9A94]">
                      CHAIN: {deployment.chainId}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMobileView("table")}
                      className="rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#9A9A94] hover:text-[#EDEDEC] lg:hidden"
                    >
                      [&lt;- TABLE]
                    </button>
                  </div>
                </div>
                <select
                  value={selectedGpu.id}
                  onChange={(e) => setSelectedGpuId(e.target.value)}
                  className="h-8 w-full rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2.5 font-mono text-xs text-[#EDEDEC] focus:border-[#FF5500] focus:outline-none"
                >
                  {allEntries.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.shortModel} [{item.zkvm.toUpperCase()}] —{" "}
                      {formatZkops(item.zkops)} zkOP/s ({item.os})
                    </option>
                  ))}
                </select>

                <div className="divide-y divide-[#232320] border border-[#232320] bg-[#0B0B0A] text-[11px]">
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">ARCH / VRAM</span>
                    <span className="text-[#EDEDEC]">
                      {selectedGpu.arch} • {selectedGpu.vramGb}GB
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">STARK / GROTH16 WRAP</span>
                    <span className="text-[#9A9A94]">
                      {formatCycleRate(selectedGpu.starkRateCyclesPerSec)} •{" "}
                      {selectedGpu.groth16WrapSecs}s
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">TDP / MSRP</span>
                    <span className="text-[#9A9A94]">
                      {selectedGpu.tdpWatts}W • ${selectedGpu.msrpUsd}
                    </span>
                  </div>
                  {(selectedGpu.pcieLink || selectedGpu.telemetrySource) && (
                    <div className="flex items-center justify-between px-2.5 py-1.5">
                      <span className="text-[#63635E]">SLOT LINK / TELEMETRY</span>
                      <span className="text-[#EDEDEC]">
                        {[selectedGpu.pcieLink, selectedGpu.telemetrySource]
                          .filter(Boolean)
                          .join(" • ")}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-2.5 py-1.5">
                    <span className="text-[#63635E]">MERKLE (15%) / ZKOP-MIX</span>
                    <span className="text-[#9A9A94]">
                      {(selectedGpu.workloads?.["memory-merkle"] ?? 0).toFixed(2)}s •{" "}
                      {(selectedGpu.workloads?.["zkop-mix"] ?? 0).toFixed(2)}s
                    </span>
                  </div>
                </div>
              </div>

              {/* Rig & Power Parameters */}
              <div className="space-y-3 p-4">
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                  02 // RIG CONFIGURATION (1X–8X)
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-[#9A9A94]">
                    GPU CARD COUNT
                  </label>
                  <div className="grid grid-cols-8 divide-x divide-[#232320] border border-[#232320] bg-[#0B0B0A]">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCardCount(n)}
                        className={cn(
                          "h-7 text-[11px] transition-colors",
                          cardCount === n
                            ? "bg-[#FF5500] font-semibold text-[#0B0B0A]"
                            : "text-[#9A9A94] hover:bg-[#181816] hover:text-[#EDEDEC]"
                        )}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase text-[#63635E]">
                      $/KWH RATE
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={electricityRateKwh}
                      onChange={(e) => setElectricityRateKwh(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase text-[#63635E]">
                      POOL ({tokenLabel}/D)
                    </label>
                    <Input
                      type="number"
                      step="1000"
                      min={1000}
                      value={dailyRewardPoolHemi}
                      onChange={(e) =>
                        setDailyRewardPoolHemi(Number(e.target.value) || 1000)
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase text-[#63635E]">
                      NET (M zkOP)
                    </label>
                    <Input
                      type="number"
                      step="10"
                      min={10}
                      value={networkTotalMzkops}
                      onChange={(e) =>
                        setNetworkTotalMzkops(Number(e.target.value) || 50)
                      }
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label
                      htmlFor="hemi-price-usd-input"
                      className="text-[10px] uppercase text-[#63635E]"
                    >
                      HEMI TOKEN PRICE (USD)
                    </label>
                    {isCustomPrice ? (
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-mono tabular-nums">
                        <span className="text-[#9A9A94]">▲ CUSTOM</span>
                        <button
                          type="button"
                          onClick={handleResetToLivePrice}
                          className="rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#FF5500] transition-colors hover:border-[#FF5500] hover:bg-[#181816] hover:text-[#EDEDEC]"
                        >
                          [RESET TO LIVE]
                        </button>
                      </div>
                    ) : priceData?.live ? (
                      <span
                        title="Live HEMI/USD spot quote via CoinGecko (60s cache)"
                        className="inline-flex items-center gap-1 text-[10px] font-mono tabular-nums"
                      >
                        <span className="text-[#10B981]" aria-hidden="true">
                          ●
                        </span>
                        <span className="text-[#10B981]">LIVE</span>
                        {typeof priceData.usd24hChange === "number" && (
                          <span
                            className={cn(
                              priceData.usd24hChange >= 0
                                ? "text-[#10B981]"
                                : "text-[#F43F5E]"
                            )}
                          >
                            ({priceData.usd24hChange >= 0 ? "+" : ""}
                            {priceData.usd24hChange.toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    ) : isPriceFetching ? (
                      <span className="text-[10px] font-mono text-[#63635E]">
                        ◌ SYNCING...
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[#63635E]">
                        ◌ FALLBACK ($0.14)
                      </span>
                    )}
                  </div>
                  <Input
                    id="hemi-price-usd-input"
                    type="number"
                    step="any"
                    min={0}
                    value={hemiPriceInput}
                    onChange={handlePriceInputChange}
                  />
                </div>
              </div>

              {/* Datasheet Yield & Power Breakdown */}
              <div className="space-y-2.5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                    03 // TELEMETRY &amp; YIELD PROJECTION
                  </span>
                  <span className="text-[10px] text-[#9A9A94]">
                    {networkKey === "sepolia" ? "743111 REHEARSAL" : "43111 MODEL"}
                  </span>
                </div>
                <div className="divide-y divide-[#232320] border border-[#232320] bg-[#0B0B0A] text-[11px]">
                  <div className="flex items-center justify-between px-2.5 py-2">
                    <span className="inline-flex items-center text-[#63635E]">
                      <span>RIG THROUGHPUT ({roiStats.safeCards}X)</span>
                      <InfoTip
                        label="Explain Rig zkOP/s"
                        text="Miner-scored GPU proving speed (Protocol 12 measure_zkop_mix): 1 zkOP equals 1 SP1 RISC-V cycle on the 50,007,139-cycle zkop-mix guest (3,202 iterations, median of up to 3 runs after a 200-iter warm-up)."
                      />
                    </span>
                    <span className="font-semibold text-[#EDEDEC]">
                      {roiStats.rigZkops.toLocaleString()} zkOP/s
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-2">
                    <span className="text-[#63635E]">NETWORK ZKOP/S SHARE</span>
                    <span className="text-[#EDEDEC]">
                      {roiStats.networkSharePct.toFixed(3)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-2">
                    <span className="text-[#63635E]">DAILY POWER DRAW / COST</span>
                    <span className="text-[#9A9A94]">
                      {roiStats.dailyKwh.toFixed(1)} kWh • $
                      {roiStats.dailyPowerCostUsd.toFixed(2)}/d
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-2">
                    <span className="text-[#63635E]">PROJECTED DAILY {tokenLabel}</span>
                    <span className="font-semibold text-[#EDEDEC]">
                      {roiStats.dailyHemiGross.toFixed(2)} {tokenLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-2">
                    <span className="text-[#63635E]">PROJECTED 30D {tokenLabel}</span>
                    <span className="text-[#9A9A94]">
                      {Math.round(roiStats.monthlyHemiGross).toLocaleString()} {tokenLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-2">
                    <span className="text-[#63635E]">NET MARGIN (AFTER POWER)</span>
                    <span
                      className={cn(
                        "font-semibold",
                        roiStats.dailyNetUsd >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"
                      )}
                    >
                      ${roiStats.dailyNetUsd.toFixed(2)}/d ($
                      {roiStats.monthlyNetUsd.toFixed(0)}/mo)
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-2">
                    <span className="text-[#63635E]">EST. HARDWARE PAYBACK</span>
                    <span className="text-[#9A9A94]">
                      {roiStats.breakEvenDays ? `${roiStats.breakEvenDays} DAYS` : "N/A"}
                    </span>
                  </div>
                </div>

                {networkKey === "sepolia" && (
                  <p className="font-sans text-[11px] leading-relaxed text-[#9A9A94]">
                    Sepolia (<code className="font-mono text-[#EDEDEC]">743111</code>) settles
                    live rehearsal auctions in <code className="font-mono text-[#EDEDEC]">tHEMI</code>;
                    USD margin projects Mainnet HEMI parity at the reference rate above.
                  </p>
                )}

                <p className="font-sans text-[11px] leading-relaxed text-[#63635E]">
                  {selectedGpu.notes}
                </p>
              </div>
            </div>
          ) : (
            /* Mode 2: Docked CLI Benchmark Paste Parser */
            <form
              onSubmit={handleBenchmarkSubmit}
              className="flex flex-col divide-y divide-[#232320] font-mono text-xs tabular-nums"
            >
              <div className="space-y-2.5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                    01 // PASTE ZKMINER BENCHMARK STDOUT
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRawInput(SAMPLE_CLI_BENCHMARK_OUTPUT)}
                  >
                    LOAD CLI SAMPLE
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRawInput(SAMPLE_JSON_BENCHMARK_OUTPUT)}
                  >
                    LOAD --JSON SAMPLE
                  </Button>
                </div>
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  rows={9}
                  placeholder="PASTE `zkminer benchmark` TABLE OR `zkminer benchmark --json`..."
                  className="w-full rounded-[2px] border border-[#232320] bg-[#0B0B0A] p-2.5 font-mono text-[11px] text-[#EDEDEC] placeholder:text-[#63635E] focus:border-[#FF5500] focus:outline-none"
                />
              </div>

              <div className="space-y-2.5 p-4">
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                  02 // HOST METADATA OVERRIDES
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[#63635E]">
                    GPU MODEL (AUTO-DETECTED IF BLANK)
                  </label>
                  <Input
                    value={overrideModel}
                    onChange={(e) => setOverrideModel(e.target.value)}
                    placeholder="e.g. AMD Radeon RX 9070 XT"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] text-[#63635E]">
                      VENDOR
                    </label>
                    <select
                      value={overrideVendor}
                      onChange={(e) =>
                        setOverrideVendor(e.target.value as "" | GpuVendor)
                      }
                      className="h-8 w-full rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2 text-[11px] text-[#EDEDEC] focus:border-[#FF5500] focus:outline-none"
                    >
                      <option value="">AUTO</option>
                      <option value="NVIDIA">NVIDIA</option>
                      <option value="AMD">AMD</option>
                      <option value="Intel">INTEL</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-[#63635E]">
                      HOST OS
                    </label>
                    <select
                      value={overrideOs}
                      onChange={(e) => setOverrideOs(e.target.value as HostOs)}
                      className="h-8 w-full rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2 text-[11px] text-[#EDEDEC] focus:border-[#FF5500] focus:outline-none"
                    >
                      <option value="Linux">LINUX</option>
                      <option value="Windows">WINDOWS</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-[#63635E]">
                      VRAM (GB)
                    </label>
                    <Input
                      type="number"
                      min={8}
                      max={96}
                      value={overrideVram}
                      onChange={(e) => setOverrideVram(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] text-[#63635E]">
                      TDP (W, AUTO)
                    </label>
                    <Input
                      type="number"
                      min={30}
                      max={2000}
                      value={overrideTdp}
                      onChange={(e) => setOverrideTdp(e.target.value)}
                      placeholder="e.g. 300"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-[#63635E]">
                      MSRP ($, AUTO)
                    </label>
                    <Input
                      type="number"
                      min={50}
                      max={50000}
                      value={overrideMsrp}
                      onChange={(e) => setOverrideMsrp(e.target.value)}
                      placeholder="e.g. 599"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-[#63635E]">
                    PROVER HANDLE / ADDRESS (OPTIONAL)
                  </label>
                  <Input
                    value={submittedBy}
                    onChange={(e) => setSubmittedBy(e.target.value)}
                    placeholder="0x94D2...5109"
                  />
                </div>
              </div>

              {/* Parse Preview Datasheet */}
              <div className="space-y-3 p-4">
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                  03 // PARSER VALIDATION PREVIEW
                </div>

                {!liveParsePreview ? (
                  <div className="border border-[#232320] bg-[#0B0B0A] p-3 text-[11px] text-[#63635E]">
                    AWAITING CLI OR JSON INPUT...
                  </div>
                ) : liveParsePreview.ok && liveParsePreview.entry ? (
                  <div className="divide-y divide-[#232320] border border-[#232320] bg-[#0B0B0A] text-[11px]">
                    <div className="flex items-center justify-between px-2.5 py-1.5">
                      <span className="text-[#63635E]">STATUS</span>
                      <span className="inline-flex items-center gap-1 font-medium text-[#10B981]">
                        <span aria-hidden="true">●</span>
                        <span>VALID {liveParsePreview.detectedFormat?.toUpperCase()}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5">
                      <span className="text-[#63635E]">DEVICE</span>
                      <span className="text-[#EDEDEC]">{liveParsePreview.entry.model}</span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5">
                      <span className="text-[#63635E]">UNIFIED ZKOP/S</span>
                      <span className="font-semibold text-[#EDEDEC]">
                        {liveParsePreview.entry.zkops.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5">
                      <span className="text-[#63635E]">SHA256 / CHACHA</span>
                      <span className="text-[#9A9A94]">
                        {liveParsePreview.entry.workloads["sha256-chain"]}s /{" "}
                        {liveParsePreview.entry.workloads["chacha-mix"]}s
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="border border-[#F43F5E]/40 bg-[#F43F5E]/10 p-2.5 text-[11px] text-[#F43F5E]">
                    {liveParsePreview.error}
                  </div>
                )}

                <p className="font-sans text-[10px] leading-relaxed text-[#63635E]">
                  Submissions persist locally in your browser and in the active serverless instance
                  cache for session comparison.
                </p>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={!liveParsePreview?.ok}
                >
                  APPEND TO LEADERBOARD -&gt;
                </Button>
              </div>
            </form>
          )}
        </aside>
      </section>
    </div>
  );
}
