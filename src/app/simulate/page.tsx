"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHemiNetwork } from "@/components/providers";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/ui/info-tip";
import type { ZkVmBackend } from "@/lib/hemi-chain";
import {
  generateSolidityRequesterCode,
  generateViemSubmitterScript,
  generateZkMinerCliScript,
} from "@/lib/code-generator";
import {
  runDeterministicSimulation,
  SIMULATE_PRESETS,
  validateElfUri,
  type SimulateInputPayload,
  type SimulatePreset,
  type SimulateReportJson,
} from "@/lib/simulate-engine";
import { cn, shortenHex } from "@/lib/utils";

type ArtifactTab = "json" | "solidity" | "viem" | "cli";

const SESSION_STORAGE_SIMULATE_KEY = "hemiprove-hub:simulate-session:v1";

interface SimulateSessionState {
  activePresetId: string | null;
  elfUrl: string;
  targetZkvm: ZkVmBackend;
  stdin: string;
  singleRun: boolean;
  declaredCycles?: number;
  jobIdHint?: string;
  programIdHint?: string;
  report: SimulateReportJson;
  artifactTab: ArtifactTab;
  mobileSimPane: "console" | "report";
}

const PRESET_DISPLAY_LABELS: Record<
  string,
  { title: string; tag: string; isAlert?: boolean }
> = {
  "btc-utxo-sp1": {
    title: "BTC UTXO History Verifier",
    tag: "SP1",
  },
  "defi-lp-risc0": {
    title: "DeFi LP Volatility Proof",
    tag: "RISC0",
  },
  "segment-inflation-risc0": {
    title: "Segment Inflation Warning Demo",
    tag: "RISC0 SIZECHECK DIFFERS",
    isAlert: true,
  },
};

function formatCompactCycles(cycles: number): string {
  if (!Number.isFinite(cycles) || cycles <= 0) return "0";
  if (cycles >= 1_000_000) {
    return `${(cycles / 1_000_000).toFixed(2)}M`;
  }
  if (cycles >= 1_000) {
    return `${(cycles / 1_000).toFixed(0)}K`;
  }
  return String(cycles);
}

export default function SimulateStudioPage() {
  const { networkKey, deployment } = useHemiNetwork();

  // Default to DeFi LP Volatility Proof [RISC0] so all 7 segments render immediately
  const defaultPreset = SIMULATE_PRESETS[1];
  const [activePresetId, setActivePresetId] = useState<string | null>(defaultPreset.id);
  const [elfUrl, setElfUrl] = useState<string>(defaultPreset.elfUrl);
  const [targetZkvm, setTargetZkvm] = useState<ZkVmBackend>(defaultPreset.targetZkvm);
  const [stdin, setStdin] = useState<string>(defaultPreset.stdin);
  const [singleRun, setSingleRun] = useState<boolean>(defaultPreset.singleRun);

  // Optional context preserved when deep-linking from `/` Marketplace Inspector
  const [declaredCycles, setDeclaredCycles] = useState<number | undefined>(undefined);
  const [jobIdHint, setJobIdHint] = useState<string | undefined>(undefined);
  const [programIdHint, setProgramIdHint] = useState<string | undefined>(undefined);

  const [report, setReport] = useState<SimulateReportJson>(() =>
    runDeterministicSimulation({
      elfUrl: defaultPreset.elfUrl,
      targetZkvm: defaultPreset.targetZkvm,
      stdin: defaultPreset.stdin,
      singleRun: defaultPreset.singleRun,
    })
  );
  const [isRunning, setIsRunning] = useState(false);
  const [justAnalyzed, setJustAnalyzed] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>("solidity");
  const [copiedArtifact, setCopiedArtifact] = useState(false);
  const [mobileSimPane, setMobileSimPane] = useState<"console" | "report">("console");
  const hasRestoredSessionRef = useRef(false);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const flashAnalyzed = useCallback(() => {
    setJustAnalyzed(true);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => setJustAnalyzed(false), 900);
  }, []);

  const executeSimulation = useCallback(
    async (params: SimulateInputPayload, withPulse = false) => {
      setIsRunning(true);
      setErrorMsg(null);
      try {
        const res = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setErrorMsg(json.error ?? "SIMULATION EXECUTION FAILED");
          return false;
        }
        setReport(json.report as SimulateReportJson);
        if (withPulse) flashAnalyzed();
        return true;
      } catch {
        setReport(runDeterministicSimulation(params));
        if (withPulse) flashAnalyzed();
        return true;
      } finally {
        setIsRunning(false);
      }
    },
    [flashAnalyzed]
  );

  // Support full job context deep links from `/` (`/simulate?elf=...&zkvm=...&cycles=...&jobId=...&program=...`)
  // or restore previous session state when switching back via navbar
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const qElf = params.get("elf");
      const qZkvm = params.get("zkvm");
      const qCycles = params.get("cycles");
      const qJobId = params.get("jobId") ?? undefined;
      const qProgram = params.get("program") ?? params.get("programId") ?? undefined;

      if (qElf) {
        const validZkvm: ZkVmBackend =
          qZkvm === "sp1" || qZkvm === "openvm" || qZkvm === "risc0" ? qZkvm : "risc0";
        const parsedCycles =
          qCycles && Number(qCycles) > 0 ? Math.round(Number(qCycles)) : undefined;
        const matchedPreset = SIMULATE_PRESETS.find((p) => p.elfUrl === qElf);
        const initialStdin = matchedPreset ? matchedPreset.stdin : "0x00000001";

        setActivePresetId(matchedPreset?.id ?? null);
        setElfUrl(qElf);
        setTargetZkvm(validZkvm);
        setStdin(initialStdin);
        setSingleRun(false);
        setDeclaredCycles(parsedCycles);
        setJobIdHint(qJobId);
        setProgramIdHint(qProgram);
        setMobileSimPane("report");
        hasRestoredSessionRef.current = true;

        executeSimulation({
          elfUrl: qElf,
          targetZkvm: validZkvm,
          stdin: initialStdin,
          singleRun: false,
          declaredCycles: parsedCycles,
          jobId: qJobId,
          programId: qProgram,
        });
        return;
      }

      const savedRaw = window.sessionStorage.getItem(SESSION_STORAGE_SIMULATE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw) as Partial<SimulateSessionState>;
        if (typeof saved.elfUrl === "string" && saved.elfUrl.length > 0) {
          setActivePresetId(saved.activePresetId ?? null);
          setElfUrl(saved.elfUrl);
          if (
            saved.targetZkvm === "sp1" ||
            saved.targetZkvm === "risc0" ||
            saved.targetZkvm === "openvm"
          ) {
            setTargetZkvm(saved.targetZkvm);
          }
          if (typeof saved.stdin === "string") setStdin(saved.stdin);
          if (typeof saved.singleRun === "boolean") setSingleRun(saved.singleRun);
          setDeclaredCycles(saved.declaredCycles);
          setJobIdHint(saved.jobIdHint);
          setProgramIdHint(saved.programIdHint);
          if (saved.report && typeof saved.report.cycles === "string") {
            setReport(saved.report);
          }
          if (
            saved.artifactTab === "json" ||
            saved.artifactTab === "solidity" ||
            saved.artifactTab === "viem" ||
            saved.artifactTab === "cli"
          ) {
            setArtifactTab(saved.artifactTab);
          }
          if (saved.mobileSimPane === "console" || saved.mobileSimPane === "report") {
            setMobileSimPane(saved.mobileSimPane);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      hasRestoredSessionRef.current = true;
    }
  }, [executeSimulation]);

  useEffect(() => {
    if (!hasRestoredSessionRef.current) return;
    try {
      const payload: SimulateSessionState = {
        activePresetId,
        elfUrl,
        targetZkvm,
        stdin,
        singleRun,
        declaredCycles,
        jobIdHint,
        programIdHint,
        report,
        artifactTab,
        mobileSimPane,
      };
      window.sessionStorage.setItem(
        SESSION_STORAGE_SIMULATE_KEY,
        JSON.stringify(payload)
      );
    } catch {
      // ignore storage quota errors
    }
  }, [
    activePresetId,
    elfUrl,
    targetZkvm,
    stdin,
    singleRun,
    declaredCycles,
    jobIdHint,
    programIdHint,
    report,
    artifactTab,
    mobileSimPane,
  ]);

  const handleLoadPreset = (preset: SimulatePreset) => {
    setActivePresetId(preset.id);
    setElfUrl(preset.elfUrl);
    setTargetZkvm(preset.targetZkvm);
    setStdin(preset.stdin);
    setSingleRun(preset.singleRun);
    setDeclaredCycles(undefined);
    setJobIdHint(undefined);
    setProgramIdHint(undefined);
    executeSimulation({
      elfUrl: preset.elfUrl,
      targetZkvm: preset.targetZkvm,
      stdin: preset.stdin,
      singleRun: preset.singleRun,
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateElfUri(elfUrl);
    if (!check.ok) {
      setErrorMsg(check.error);
      setMobileSimPane("console");
      return;
    }
    const ok = await executeSimulation(
      {
        elfUrl: check.normalized,
        targetZkvm,
        stdin,
        singleRun,
        declaredCycles,
        jobId: jobIdHint,
        programId: programIdHint,
      },
      true
    );
    if (ok) {
      setMobileSimPane("report");
    }
  };

  const solidityCode = useMemo(
    () => generateSolidityRequesterCode(report, networkKey),
    [report, networkKey]
  );

  const viemScriptCode = useMemo(
    () => generateViemSubmitterScript(report, networkKey, stdin),
    [report, networkKey, stdin]
  );

  const cliScriptCode = useMemo(
    () => generateZkMinerCliScript(report, networkKey, stdin, singleRun),
    [report, networkKey, stdin, singleRun]
  );

  const rawJsonString = useMemo(() => JSON.stringify(report, null, 2), [report]);

  const activeArtifactContent =
    artifactTab === "json"
      ? rawJsonString
      : artifactTab === "solidity"
        ? solidityCode
        : artifactTab === "viem"
          ? viemScriptCode
          : cliScriptCode;

  const activeArtifactLines = useMemo(
    () => activeArtifactContent.split("\n"),
    [activeArtifactContent]
  );

  const handleCopyArtifact = () => {
    navigator.clipboard?.writeText(activeArtifactContent);
    setCopiedArtifact(true);
    setTimeout(() => setCopiedArtifact(false), 1500);
  };

  const totalCyclesNum = Number(report.cycles);
  const rawGuestCyclesNum = Number(report.guestCycles);
  const paddingCyclesNum = Number(report.paddingCycles ?? "0");
  const keccakChargesNum = Number(report.keccakCharges);

  const cycleBreakdownLine = `${formatCompactCycles(
    rawGuestCyclesNum
  )} RAW GUEST + ${formatCompactCycles(
    paddingCyclesNum
  )} PO2 PAD + ${formatCompactCycles(keccakChargesNum)} KECCAK`;

  const recommendedMaxCyclesCap =
    Math.ceil((totalCyclesNum * 1.2) / 1_000_000) * 1_000_000;
  const hostRamMb = Math.round(report.peakHostBytes / (1024 * 1024));
  const isCliEngine = report.executionEngine === "zkminer-cli-binary";
  const hasConsistencyWarning = report.hostInput || report.sizeCheck === "differs";

  return (
    <div className="w-full bg-[#0B0B0A]">
      {/* Mobile-Only Console / Report Switcher (< lg) */}
      <div className="grid grid-cols-2 divide-x divide-[#232320] border-b border-[#232320] bg-[#111110] font-mono text-[11px] uppercase tracking-wider lg:hidden">
        <button
          type="button"
          onClick={() => setMobileSimPane("console")}
          className={cn(
            "relative h-9 px-3 text-left transition-colors",
            mobileSimPane === "console"
              ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
              : "text-[#63635E] hover:bg-[#181816] hover:text-[#EDEDEC]"
          )}
        >
          [01 // INPUT CONSOLE]
        </button>
        <button
          type="button"
          onClick={() => setMobileSimPane("report")}
          className={cn(
            "relative flex h-9 items-center justify-between px-3 text-left transition-colors",
            mobileSimPane === "report"
              ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
              : "text-[#63635E] hover:bg-[#181816] hover:text-[#EDEDEC]"
          )}
        >
          <span className="shrink-0">[02 // REPORT]</span>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-[#9A9A94] tabular-nums">
            <span>{formatCompactCycles(totalCyclesNum)} CYC</span>
            {report.sizeCheck === "differs" ? (
              <span className="text-[#F43F5E]" aria-hidden="true">
                ▲
              </span>
            ) : (
              <span className="text-[#10B981]" aria-hidden="true">
                ●
              </span>
            )}
          </span>
        </button>
      </div>

      {/* Compiler-Style Split Workbench (5 Cols Left Console / 7 Cols Right Diagnostic Report) */}
      <section className="grid min-h-[calc(100vh-7rem)] grid-cols-1 divide-y divide-[#232320] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Left 5 Columns: Job Input & Preset Console */}
        <div
          className={cn(
            "flex flex-col divide-y divide-[#232320] bg-[#111110] lg:col-span-5",
            mobileSimPane === "report" && "hidden lg:flex"
          )}
        >
          {/* Section 01 // LOAD PRESET WORKLOAD */}
          <div>
            <div className="flex items-center justify-between border-b border-[#232320] px-4 py-2.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                01 // LOAD PRESET WORKLOAD
              </span>
              <span className="font-mono text-[10px] tabular-nums text-[#9A9A94]">
                SCHEMA V{report.schema} • P{report.protocolVersion}
              </span>
            </div>

            <div className="divide-y divide-[#232320] border-b border-[#232320]">
              {SIMULATE_PRESETS.map((preset, index) => {
                const isSelected = activePresetId === preset.id;
                const meta = PRESET_DISPLAY_LABELS[preset.id] ?? {
                  title: preset.title,
                  tag: preset.targetZkvm.toUpperCase(),
                };
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleLoadPreset(preset)}
                    className={cn(
                      "group flex w-full flex-col gap-1 px-4 py-3 text-left font-mono transition-colors hover:bg-[#181816]",
                      isSelected
                        ? "bg-[#181816] shadow-[inset_2px_0_0_0_#FF5500]"
                        : "bg-[#111110]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={cn(
                          "font-semibold transition-colors",
                          isSelected
                            ? "text-[#EDEDEC]"
                            : "text-[#B8B8B2] group-hover:text-[#EDEDEC]"
                        )}
                      >
                        <span className="mr-2 text-[#63635E]">0{index + 1}</span>
                        {meta.title}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] uppercase tabular-nums",
                          meta.isAlert && isSelected
                            ? "font-semibold text-[#F43F5E]"
                            : "text-[#9A9A94]"
                        )}
                      >
                        <span aria-hidden="true">{meta.isAlert ? "▲" : "●"}</span>
                        <span>{meta.tag}</span>
                      </span>
                    </div>
                    <div
                      className={cn(
                        "truncate text-[11px] transition-colors",
                        isSelected
                          ? "text-[#9A9A94]"
                          : "text-[#7A7A74] group-hover:text-[#9A9A94]"
                      )}
                    >
                      {preset.elfUrl}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 02 // ELF BINARY & EXECUTION PARAMETERS */}
          <form
            onSubmit={handleFormSubmit}
            className="space-y-4 p-4 font-mono text-xs tabular-nums"
          >
            <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
              02 // ELF BINARY &amp; EXECUTION PARAMETERS
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-[#9A9A94]">
                ELF URI (ar:// or https://github.com/...)
              </label>
              <Input
                value={elfUrl}
                onChange={(e) => {
                  setActivePresetId(null);
                  setDeclaredCycles(undefined);
                  setJobIdHint(undefined);
                  setProgramIdHint(undefined);
                  setErrorMsg(null);
                  setElfUrl(e.target.value);
                }}
                placeholder="ar://... or https://github.com/.../releases/download/..."
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-[#9A9A94]">
                TARGET ZKVM
              </label>
              <div className="grid grid-cols-3 divide-x divide-[#232320] rounded-[2px] border border-[#232320] bg-[#0B0B0A]">
                {(
                  [
                    { id: "risc0", label: "RISC0" },
                    { id: "sp1", label: "SP1" },
                    { id: "openvm", label: "OPENVM" },
                  ] as const
                ).map((vm) => {
                  const active = targetZkvm === vm.id;
                  return (
                    <button
                      key={vm.id}
                      type="button"
                      onClick={() => {
                        setActivePresetId(null);
                        setDeclaredCycles(undefined);
                        setJobIdHint(undefined);
                        setProgramIdHint(undefined);
                        setTargetZkvm(vm.id);
                        executeSimulation({
                          elfUrl,
                          targetZkvm: vm.id,
                          stdin,
                          singleRun,
                        });
                      }}
                      className={cn(
                        "h-8 text-xs uppercase tracking-wider transition-colors",
                        active
                          ? "bg-[#181816] font-semibold text-[#EDEDEC] shadow-[inset_0_-2px_0_0_#FF5500]"
                          : "text-[#63635E] hover:bg-[#181816] hover:text-[#EDEDEC]"
                      )}
                    >
                      {vm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-[#9A9A94]">
                STDIN (HEX / UTF-8)
              </label>
              <textarea
                value={stdin}
                onChange={(e) => {
                  setActivePresetId(null);
                  setDeclaredCycles(undefined);
                  setJobIdHint(undefined);
                  setStdin(e.target.value);
                }}
                rows={4}
                placeholder="0x01000000... or UTF-8 / JSON input"
                className="w-full rounded-[2px] border border-[#232320] bg-[#0B0B0A] p-2.5 font-mono text-xs text-[#EDEDEC] placeholder:text-[#63635E] focus:border-[#FF5500] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-3 py-2.5">
              <div>
                <div className="text-[11px] font-medium uppercase text-[#EDEDEC]">
                  --single-run
                </div>
                <div className="text-[10px] text-[#63635E]">
                  {targetZkvm === "risc0"
                    ? "SKIP 7-SEGMENT SWEEP (MEASURE PO2=20 ONLY)"
                    : "UNSEGMENTED TRACE MEASUREMENT"}
                </div>
              </div>
              <Switch
                checked={singleRun}
                onCheckedChange={(checked) => {
                  setSingleRun(checked);
                  executeSimulation({
                    elfUrl,
                    targetZkvm,
                    stdin,
                    singleRun: checked,
                    declaredCycles,
                    jobId: jobIdHint,
                    programId: programIdHint,
                  });
                }}
              />
            </div>

            {errorMsg && (
              <div className="border border-[#F43F5E]/40 bg-[#F43F5E]/10 px-3 py-2 text-[11px] text-[#F43F5E]">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isRunning}
              className="h-10 w-full rounded-[2px] bg-[#FF5500] font-mono text-xs font-semibold uppercase tracking-wider text-[#0B0B0A] transition-colors hover:bg-[#E04800] disabled:opacity-50"
            >
              {isRunning
                ? "COMPUTING PRE-FLIGHT MODEL..."
                : justAnalyzed
                  ? "ANALYSIS UPDATED ●"
                  : "RUN PRE-FLIGHT ANALYSIS ->"}
            </button>

            <div className="flex items-center justify-between border border-[#232320] bg-[#0B0B0A] px-2.5 py-2 text-[10px]">
              <span className="text-[#63635E]">ACTIVE ENGINE</span>
              {isCliEngine ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#10B981]">
                  <span aria-hidden="true">●</span>
                  <span>ZKMINER-CLI BINARY</span>
                  <InfoTip
                    label="Simulation engine details"
                    text="Executed directly against the host ZKMINER_BIN CLI binary."
                  />
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[#FF5500]">
                  <span aria-hidden="true">◌</span>
                  <span>DETERMINISTIC MODEL (PREVIEW)</span>
                  <InfoTip
                    label="What is Deterministic Model Preview?"
                    text="Serverless preview models Protocol 12 cycles and VRAM without downloading or executing remote ELF binaries. Set ZKMINER_BIN on a prover host to run live zkminer simulate."
                  />
                </span>
              )}
            </div>
          </form>

          {/* Program Binding & Pricing Summary Datasheet */}
          <div className="space-y-2.5 p-4 font-mono text-xs tabular-nums">
            <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
              COMPILER BINDING &amp; AUCTION SIZING ({deployment.chainId})
            </div>
            <div className="divide-y divide-[#232320] border border-[#232320] bg-[#0B0B0A] text-[11px]">
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="text-[#63635E]">
                  PROGRAM_ID ({report.programCheck.toUpperCase()})
                </span>
                <span className="text-[#EDEDEC]">{shortenHex(report.programId, 8, 6)}</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="text-[#63635E]">
                  ELF_HASH ({Math.round(report.elfBytes / 1024)} KB)
                </span>
                <span className="text-[#9A9A94]">{shortenHex(report.elfHash, 8, 6)}</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="text-[#63635E]">INPUT_HASH ({report.inputBytes} B)</span>
                <span className="text-[#9A9A94]">{shortenHex(report.inputHash, 8, 6)}</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="text-[#63635E]">SUGGESTED OFFER RANGE</span>
                <span className="font-semibold text-[#EDEDEC]">
                  {report.pricingRecommendation.minPriceHemi} -&gt;{" "}
                  {report.pricingRecommendation.maxPriceHemi}{" "}
                  {networkKey === "sepolia" ? "tHEMI" : "HEMI"}
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="text-[#63635E]">EST. RTX 4090 PROVE TIME</span>
                <span className="text-[#9A9A94]">
                  ~{report.pricingRecommendation.estimatedProveSecsRtx4090}s (
                  {report.sdkVersion})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right 7 Columns: Diagnostic Report & Code Generator */}
        <div
          className={cn(
            "flex flex-col bg-[#0B0B0A] lg:col-span-7",
            mobileSimPane === "console" && "hidden lg:flex"
          )}
        >
          {/* Top 3-Cell Diagnostic Strip (Compact 2-col on mobile, 3-col on sm+) */}
          <div className="grid grid-cols-2 divide-x divide-y divide-[#232320] border-b border-[#232320] bg-[#111110] sm:grid-cols-3 sm:divide-y-0">
            {/* Cell 1: 01 // TOTAL CHARGED CYCLES (REPORT.CYCLES) */}
            <div className="col-span-2 p-3 font-mono tabular-nums sm:col-span-1 sm:p-4">
              <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                <span>01 // TOTAL CHARGED CYCLES (REPORT.CYCLES)</span>
                <button
                  type="button"
                  onClick={() => setMobileSimPane("console")}
                  className="rounded-[2px] border border-[#232320] bg-[#181816] px-2 py-0.5 text-[10px] text-[#EDEDEC] lg:hidden"
                >
                  [&lt;- CONSOLE]
                </button>
              </div>
              <div className="mt-1.5 text-lg font-semibold text-[#EDEDEC] sm:mt-2 sm:text-xl">
                {totalCyclesNum.toLocaleString()}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-[#9A9A94] sm:mt-1.5">
                {cycleBreakdownLine}
              </div>
              <div className="mt-0.5 text-[10px] text-[#63635E] sm:mt-1">
                REC. --max-cycles: {recommendedMaxCyclesCap.toLocaleString()}
              </div>
            </div>

            {/* Cell 2: 02 // PEAK MEMORY & VRAM TIER */}
            <div className="p-3 font-mono tabular-nums sm:p-4">
              <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#63635E] sm:text-[11px]">
                02 // PEAK MEMORY &amp; VRAM TIER
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5 sm:mt-2 sm:gap-2">
                <span className="text-base font-semibold text-[#EDEDEC] sm:text-xl">
                  {report.peakVramMib.toLocaleString()} MB
                </span>
                <span className="text-[10px] text-[#9A9A94] sm:text-[11px]">
                  • {report.vramTierRecommendation.minVramGb}GB TIER
                </span>
              </div>
              <div className="mt-1 text-[10px] text-[#9A9A94] sm:mt-1.5">
                HOST RAM PEAK: {hostRamMb.toLocaleString()} MB
              </div>
            </div>

            {/* Cell 3: 03 // KECCAK CHARGES & EVIDENCE */}
            <div className="p-3 font-mono tabular-nums sm:p-4">
              <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#63635E] sm:text-[11px]">
                03 // KECCAK CHARGES &amp; EVIDENCE
              </div>
              <div className="mt-1.5 text-base font-semibold text-[#EDEDEC] sm:mt-2 sm:text-xl">
                {keccakChargesNum.toLocaleString()}
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10px] sm:mt-1.5">
                <span className="text-[#9A9A94]">{report.keccakRequests} REQ</span>
                {hasConsistencyWarning ? (
                  <span className="inline-flex items-center gap-1 font-medium text-[#F43F5E]">
                    <span aria-hidden="true">▲</span>
                    <span className="sm:hidden">
                      {report.hostInput && report.keccakRequests > 0
                        ? "KECCAK WARN"
                        : "PO2 / ENTROPY ALERT"}
                    </span>
                    <span className="hidden sm:inline">
                      {report.hostInput && report.keccakRequests > 0
                        ? "UNPROVABLE KECCAK WARNING"
                        : report.sizeCheck === "differs"
                          ? "SIZECHECK DIFFERS ALERT"
                          : "HOST ENTROPY WARNING"}
                    </span>
                  </span>
                ) : isCliEngine ? (
                  <span className="inline-flex items-center gap-1 font-medium text-[#10B981]">
                    <span aria-hidden="true">●</span>
                    <span className="sm:hidden">VERIFIED</span>
                    <span className="hidden sm:inline">CLI VERIFIED</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-[#9A9A94]">
                    <span aria-hidden="true">◌</span>
                    <span className="sm:hidden">PREVIEW</span>
                    <span className="hidden sm:inline">DETERMINISTIC PREVIEW</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Inline Diagnostic Warning Row (if any) */}
          {report.warnings.length > 0 && (
            <div
              className={cn(
                "border-b border-[#232320] px-4 py-2.5 font-mono text-[11px] leading-relaxed",
                report.sizeCheck === "differs"
                  ? "bg-[#F43F5E]/10 text-[#F43F5E]"
                  : "bg-[#181816] text-[#9A9A94]"
              )}
            >
              {report.warnings.map((w, idx) => (
                <div key={idx}>
                  {report.sizeCheck === "differs" ? "▲ ALERT: " : "● DIAGNOSTIC: "}
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* Middle Section: 04 // RISC0-PUBLIC-V3 (PROTOCOL 12) 7-SEGMENT AUDIT MATRIX */}
          <div className="border-b border-[#232320]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232320] bg-[#111110] px-4 py-2.5 font-mono">
              <span className="inline-flex items-center text-[11px] uppercase tracking-[0.12em] text-[#63635E]">
                <span className="sm:hidden">04 // 7-SEGMENT AUDIT (P12)</span>
                <span className="hidden sm:inline">
                  04 // RISC0-PUBLIC-V3 (PROTOCOL 12) 7-SEGMENT AUDIT MATRIX
                </span>
                <InfoTip
                  label="What is the 7-Segment Audit (risc0-public-v3)?"
                  text="Pre-claim safety check that runs a RISC Zero guest across all 7 segment sizes (po2 16–22) to catch malicious binaries that inflate cycles or alter outputs."
                />
              </span>
              {report.backend === "risc0" ? (
                report.sizeCheck === "differs" ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase text-[#F43F5E] tabular-nums">
                    <span aria-hidden="true">▲</span>
                    <span>VERDICT: SIZECHECK DIFFERS</span>
                  </span>
                ) : report.sizeCheck === "consistent" ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase text-[#10B981] tabular-nums">
                    <span aria-hidden="true">●</span>
                    <span>VERDICT: 7/7 SEGMENTS PASS</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] uppercase text-[#9A9A94] tabular-nums">
                    <span aria-hidden="true">◌</span>
                    <span>SINGLE-RUN (PO2=20 ONLY)</span>
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] uppercase text-[#9A9A94]">
                  <span aria-hidden="true">●</span>
                  <span>BACKEND: {report.backend.toUpperCase()} (UNSEGMENTED)</span>
                </span>
              )}
            </div>

            {report.backend === "risc0" && report.segmentAudit ? (
              <div className="overflow-x-auto bg-[#0B0B0A]">
                <table className="w-full border-collapse font-mono text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-[#232320] bg-[#111110] text-left text-[10px] uppercase tracking-[0.12em] text-[#63635E]">
                      <th className="px-3 py-2 font-medium">SEGMENT PO2</th>
                      <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                        RAW GUEST CYCLES
                      </th>
                      <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                        KECCAK CHARGES
                      </th>
                      <th className="px-3 py-2 text-right font-medium">TOTAL CHARGED</th>
                      <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                        RAND
                      </th>
                      <th className="px-3 py-2 font-medium">JOURNAL HASH</th>
                      <th className="px-3 py-2 text-right font-medium">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232320]">
                    {report.segmentAudit.map((row, idx) => {
                      const isDivergent =
                        report.sizeCheck === "differs" &&
                        (row.po2 >= 20 || !row.consistentWithDefault);
                      const isDefaultPo2 = row.po2 === 20;

                      return (
                        <tr
                          key={row.po2}
                          className={cn(
                            "transition-colors hover:bg-[#181816]",
                            isDivergent
                              ? "bg-[#F43F5E]/[0.07]"
                              : isDefaultPo2
                                ? "bg-[#111110] shadow-[inset_2px_0_0_0_#FF5500]"
                                : "bg-[#0B0B0A]"
                          )}
                        >
                          <td className="px-3 py-2 text-[#EDEDEC]">
                            <span className="hidden text-[#63635E] sm:inline">
                              SEG 0{idx + 1} {"//"}{" "}
                            </span>
                            <span className="font-semibold">PO2={row.po2}</span>
                            <span className="ml-1 text-[10px] text-[#63635E]">
                              ({(row.segmentSizeCycles / 1024).toFixed(0)}K)
                            </span>
                          </td>
                          <td className="hidden px-3 py-2 text-right text-[#9A9A94] sm:table-cell">
                            {Number(row.guestCycles).toLocaleString()}
                          </td>
                          <td className="hidden px-3 py-2 text-right text-[#9A9A94] sm:table-cell">
                            {Number(row.keccakCharges).toLocaleString()}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right",
                              isDefaultPo2
                                ? "font-semibold text-[#EDEDEC]"
                                : "text-[#9A9A94]"
                            )}
                          >
                            {Number(row.totalChargedCycles).toLocaleString()}
                          </td>
                          <td
                            className={cn(
                              "hidden px-3 py-2 text-right sm:table-cell",
                              row.randomReads > 0
                                ? "font-semibold text-[#F43F5E]"
                                : "text-[#9A9A94]"
                            )}
                          >
                            {row.randomReads}
                          </td>
                          <td className="px-3 py-2 text-[#9A9A94]">
                            {shortenHex(row.journalHash, 5, 5)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isDivergent ? (
                              <span className="inline-flex items-center justify-end gap-1 font-medium text-[#F43F5E]">
                                <span aria-hidden="true">▲</span>
                                <span>DIFFERS</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-end gap-1 font-medium text-[#10B981]">
                                <span aria-hidden="true">●</span>
                                <span>PASS</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0B0B0A] px-4 py-5 font-mono text-xs text-[#9A9A94]">
                <div>
                  PROTOCOL 12 7-SEGMENT AUDIT APPLIES TO RISC0 (PO2 16..22). CURRENT{" "}
                  <span className="text-[#EDEDEC]">{report.backend.toUpperCase()}</span>{" "}
                  TRACE MEASURED AT {totalCyclesNum.toLocaleString()} RAW GUEST CYCLES.
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadPreset(SIMULATE_PRESETS[2])}
                  className="rounded-[2px] border border-[#232320] bg-[#111110] px-2.5 py-1 text-[11px] uppercase text-[#EDEDEC] hover:bg-[#181816]"
                >
                  LOAD RISC0 INFLATION AUDIT DEMO -&gt;
                </button>
              </div>
            )}
          </div>

          {/* Bottom Section: 05 // ARTIFACT & CONTRACT GENERATOR */}
          <div className="flex flex-1 flex-col">
            {/* Section Title + Flush Header Tabs + Copy Button */}
            <div className="flex flex-col divide-y divide-[#232320] border-b border-[#232320] bg-[#111110] xl:flex-row xl:items-center xl:justify-between xl:divide-y-0">
              <div className="flex items-center justify-between px-4 py-2 xl:border-r xl:border-[#232320] xl:py-2.5">
                <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                  05 // ARTIFACT &amp; CONTRACT GENERATOR
                </span>
                <button
                  type="button"
                  onClick={handleCopyArtifact}
                  className="h-7 rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2.5 font-mono text-[10px] uppercase tracking-wider text-[#EDEDEC] transition-colors hover:border-[#FF5500] hover:bg-[#181816] xl:hidden"
                >
                  {copiedArtifact ? "[COPIED]" : "[COPY]"}
                </button>
              </div>

              <div className="flex flex-1 items-center justify-between">
                <div className="grid w-full grid-cols-4 divide-x divide-[#232320] sm:flex sm:w-auto sm:items-center">
                  {(
                    [
                      {
                        id: "solidity",
                        shortLabel: "SOLIDITY",
                        label: "SOLIDITY CONTRACT",
                      },
                      {
                        id: "viem",
                        shortLabel: "VIEM SDK",
                        label: "VIEM TS SDK",
                      },
                      {
                        id: "cli",
                        shortLabel: "CLI",
                        label: "ZKMINER CLI",
                      },
                      {
                        id: "json",
                        shortLabel: "JSON",
                        label: "REPORT JSON",
                      },
                    ] as const
                  ).map((tab) => {
                    const active = artifactTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setArtifactTab(tab.id)}
                        className={cn(
                          "relative h-9 px-2 font-mono text-[11px] uppercase tracking-wider transition-colors sm:h-10 sm:px-3.5",
                          active
                            ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
                            : "text-[#63635E] hover:bg-[#181816] hover:text-[#EDEDEC]"
                        )}
                      >
                        <span className="sm:hidden">{tab.shortLabel}</span>
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="hidden px-3 py-1.5 xl:block">
                  <button
                    type="button"
                    onClick={handleCopyArtifact}
                    className="h-7 rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2.5 font-mono text-[11px] uppercase tracking-wider text-[#EDEDEC] transition-colors hover:border-[#FF5500] hover:bg-[#181816]"
                  >
                    {copiedArtifact ? "[COPIED TO CLIPBOARD]" : "[COPY ARTIFACT]"}
                  </button>
                </div>
              </div>
            </div>

            {/* Clean Line-Numbered Monospace Code Block */}
            <div className="max-h-[460px] flex-1 overflow-auto bg-[#0B0B0A] p-4 font-mono text-xs leading-relaxed tabular-nums">
              <table className="w-full border-collapse">
                <tbody>
                  {activeArtifactLines.map((line, i) => (
                    <tr key={i} className="hover:bg-[#111110]">
                      <td className="w-10 select-none pr-4 text-right align-top text-[11px] text-[#63635E]">
                        {i + 1}
                      </td>
                      <td className="whitespace-pre text-[#EDEDEC]">{line || " "}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
