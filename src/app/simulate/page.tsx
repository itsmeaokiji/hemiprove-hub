"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useHemiNetwork } from "@/components/providers";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/ui/info-tip";
import type { ZkVmBackend } from "@/lib/hemi-chain";
import {
  generateSolidityRequesterCode,
  generateViemSubmitterScript,
} from "@/lib/code-generator";
import {
  runDeterministicSimulation,
  SIMULATE_PRESETS,
  type SimulateInputPayload,
  type SimulatePreset,
  type SimulateReportJson,
} from "@/lib/simulate-engine";
import { cn, shortenHex } from "@/lib/utils";

type ArtifactTab = "json" | "solidity" | "viem";

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>("solidity");
  const [copiedArtifact, setCopiedArtifact] = useState(false);

  const executeSimulation = useCallback(async (params: SimulateInputPayload) => {
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
      } else {
        setReport(json.report as SimulateReportJson);
      }
    } catch {
      setReport(runDeterministicSimulation(params));
    } finally {
      setIsRunning(false);
    }
  }, []);

  // Support full job context deep links from `/` (`/simulate?elf=...&zkvm=...&cycles=...&jobId=...&program=...`)
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

        executeSimulation({
          elfUrl: qElf,
          targetZkvm: validZkvm,
          stdin: initialStdin,
          singleRun: false,
          declaredCycles: parsedCycles,
          jobId: qJobId,
          programId: qProgram,
        });
      }
    } catch {
      // ignore
    }
  }, [executeSimulation]);

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

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSimulation({
      elfUrl,
      targetZkvm,
      stdin,
      singleRun,
      declaredCycles,
      jobId: jobIdHint,
      programId: programIdHint,
    });
  };

  const solidityCode = useMemo(
    () => generateSolidityRequesterCode(report, networkKey),
    [report, networkKey]
  );

  const viemScriptCode = useMemo(
    () => generateViemSubmitterScript(report, networkKey, stdin),
    [report, networkKey, stdin]
  );

  const rawJsonString = useMemo(() => JSON.stringify(report, null, 2), [report]);

  const activeArtifactContent =
    artifactTab === "json"
      ? rawJsonString
      : artifactTab === "solidity"
        ? solidityCode
        : viemScriptCode;

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
  const hasKeccakOrEntropyWarning =
    report.hostInput || report.sizeCheck === "differs";

  return (
    <div className="w-full bg-[#0B0B0A]">
      {/* Compiler-Style Split Workbench (5 Cols Left Console / 7 Cols Right Diagnostic Report) */}
      <section className="grid min-h-[calc(100vh-7rem)] grid-cols-1 divide-y divide-[#232320] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Left 5 Columns: Job Input & Preset Console */}
        <div className="flex flex-col divide-y divide-[#232320] bg-[#111110] lg:col-span-5">
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
                      "flex w-full flex-col gap-1 px-4 py-3 text-left font-mono transition-all hover:bg-[#181816]",
                      isSelected
                        ? "bg-[#181816] opacity-100 shadow-[inset_2px_0_0_0_#FF5500]"
                        : "bg-[#111110] opacity-60 hover:opacity-100"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#EDEDEC]">
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
                    <div className="truncate text-[11px] text-[#63635E]">
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
                        setTargetZkvm(vm.id);
                        executeSimulation({
                          elfUrl,
                          targetZkvm: vm.id,
                          stdin,
                          singleRun,
                          declaredCycles,
                          jobId: jobIdHint,
                          programId: programIdHint,
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
              {isRunning ? "EXECUTING ZKMINER SIMULATE..." : "RUN ZKMINER SIMULATE ->"}
            </button>
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
        <div className="flex flex-col bg-[#0B0B0A] lg:col-span-7">
          {/* Top 3-Cell Diagnostic Strip */}
          <div className="grid grid-cols-1 divide-y divide-[#232320] border-b border-[#232320] bg-[#111110] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {/* Cell 1: 01 // TOTAL CHARGED CYCLES (REPORT.CYCLES) */}
            <div className="p-4 font-mono tabular-nums">
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                01 // TOTAL CHARGED CYCLES (REPORT.CYCLES)
              </div>
              <div className="mt-2 text-xl font-semibold text-[#EDEDEC]">
                {totalCyclesNum.toLocaleString()}
              </div>
              <div className="mt-1.5 text-[10px] leading-snug text-[#9A9A94]">
                {cycleBreakdownLine}
              </div>
              <div className="mt-1 text-[10px] text-[#63635E]">
                REC. --max-cycles: {recommendedMaxCyclesCap.toLocaleString()}
              </div>
            </div>

            {/* Cell 2: 02 // PEAK MEMORY & VRAM TIER */}
            <div className="p-4 font-mono tabular-nums">
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                02 // PEAK MEMORY &amp; VRAM TIER
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-semibold text-[#EDEDEC]">
                  {report.peakVramMib.toLocaleString()} MB
                </span>
                <span className="text-[11px] text-[#9A9A94]">
                  • {report.vramTierRecommendation.minVramGb}GB TIER
                </span>
              </div>
              <div className="mt-1.5 text-[10px] text-[#9A9A94]">
                HOST RAM PEAK: {hostRamMb.toLocaleString()} MB
              </div>
            </div>

            {/* Cell 3: 03 // KECCAK CHARGES & EVIDENCE */}
            <div className="p-4 font-mono tabular-nums">
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                03 // KECCAK CHARGES &amp; EVIDENCE
              </div>
              <div className="mt-2 text-xl font-semibold text-[#EDEDEC]">
                {keccakChargesNum.toLocaleString()}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                <span className="text-[#9A9A94]">{report.keccakRequests} REQ</span>
                {hasKeccakOrEntropyWarning ? (
                  <span className="inline-flex items-center gap-1 font-medium text-[#F43F5E]">
                    <span aria-hidden="true">▲</span>
                    <span>UNPROVABLE KECCAK WARNING</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-[#10B981]">
                    <span aria-hidden="true">●</span>
                    <span>HOST-INPUT VERIFIED</span>
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

          {/* Middle Section: 03 // RISC0-PUBLIC-V3 (PROTOCOL 12) 7-SEGMENT AUDIT MATRIX */}
          <div className="border-b border-[#232320]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232320] bg-[#111110] px-4 py-2.5 font-mono">
              <span className="inline-flex items-center text-[11px] uppercase tracking-[0.12em] text-[#63635E]">
                <span>03 // RISC0-PUBLIC-V3 (PROTOCOL 12) 7-SEGMENT AUDIT MATRIX</span>
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
                      <th className="px-3 py-2 text-right font-medium">RAW GUEST CYCLES</th>
                      <th className="px-3 py-2 text-right font-medium">KECCAK CHARGES</th>
                      <th className="px-3 py-2 text-right font-medium">TOTAL CHARGED</th>
                      <th className="px-3 py-2 text-right font-medium">RAND</th>
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
                            <span className="text-[#63635E]">SEG 0{idx + 1} // </span>
                            <span className="font-semibold">PO2={row.po2}</span>
                            <span className="ml-1 text-[10px] text-[#63635E]">
                              ({(row.segmentSizeCycles / 1024).toFixed(0)}K)
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-[#9A9A94]">
                            {Number(row.guestCycles).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right text-[#9A9A94]">
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
                              "px-3 py-2 text-right",
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

          {/* Bottom Section: 04 // ARTIFACT & CONTRACT GENERATOR */}
          <div className="flex flex-1 flex-col">
            {/* Section Title + Flush Header Tabs + Copy Button */}
            <div className="flex flex-wrap items-center justify-between border-b border-[#232320] bg-[#111110]">
              <div className="flex flex-wrap items-center divide-x divide-[#232320]">
                <span className="px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.12em] text-[#63635E]">
                  04 // ARTIFACT &amp; CONTRACT GENERATOR
                </span>

                {(
                  [
                    { id: "json", label: "RAW SIMULATE JSON" },
                    { id: "solidity", label: "SOLIDITY CONTRACT (hemiprove-abi)" },
                    { id: "viem", label: "VIEM TYPESCRIPT SDK" },
                  ] as const
                ).map((tab) => {
                  const active = artifactTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setArtifactTab(tab.id)}
                      className={cn(
                        "relative h-10 px-3.5 font-mono text-[11px] uppercase tracking-wider transition-colors",
                        active
                          ? "bg-[#181816] font-semibold text-[#EDEDEC] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#FF5500]"
                          : "text-[#63635E] hover:bg-[#181816] hover:text-[#EDEDEC]"
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="px-3 py-1.5">
                <button
                  type="button"
                  onClick={handleCopyArtifact}
                  className="h-7 rounded-[2px] border border-[#232320] bg-[#0B0B0A] px-2.5 font-mono text-[11px] uppercase tracking-wider text-[#EDEDEC] transition-colors hover:border-[#FF5500] hover:bg-[#181816]"
                >
                  {copiedArtifact ? "[COPIED TO CLIPBOARD]" : "[COPY ARTIFACT]"}
                </button>
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
