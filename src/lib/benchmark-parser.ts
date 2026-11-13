export type GpuVendor = "NVIDIA" | "AMD" | "Intel";
export type HostOs = "Linux" | "Windows";
export type BenchmarkZkVm = "sp1" | "risc0";

/**
 * Protocol 12 (`zkminer-prover-protocol/src/suite.rs` & `types.rs`):
 * - `BENCH_ZKOP_MIX`: unweighted self-scored guest (`3,202` iterations = `50,007,139` SP1 cycles;
 *   1 warm-up at 200 iterations + up to 3 scored runs inside 60s budget, median STARK duration).
 * - 5 Canonical Suite Programs (weights sum to 1.0; `fibonacci` dropped in `f54b3b9`):
 *   - 40% pure compute: `chacha-mix` (0.20), `bigint-mul` (0.20)
 *   - 45% precompile:   `sha256-chain` (0.20), `ecdsa-verify` (0.25)
 *   - 15% mixed:        `memory-merkle` (0.15)
 */
export const ZKOP_MIX_ITERATIONS = 3202;
export const ZKOP_MIX_WARMUP_ITERATIONS = 200;
export const ZKOP_MIX_SP1_CYCLES = 50_007_139;
/** Forward-compatible blended scoring constant from `hemilabs/zk-miner` (`max/splash-progress-bars`). */
export const ZKOP_SP1_PER_RISC0 = 3.71;

export function zkopsFromStarkSecs(starkSecs: number): number {
  if (Number.isFinite(starkSecs) && starkSecs > 0) {
    return Math.round(ZKOP_MIX_SP1_CYCLES / starkSecs);
  }
  return 0;
}

export function computeBlendedZkops(sp1Zkops: number, risc0Zkops: number): number {
  if (
    Number.isFinite(sp1Zkops) &&
    Number.isFinite(risc0Zkops) &&
    sp1Zkops > 0 &&
    risc0Zkops > 0
  ) {
    return Math.round(Math.sqrt(sp1Zkops * (risc0Zkops * ZKOP_SP1_PER_RISC0)));
  }
  return 0;
}

function deterministicFingerprint(signature: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < signature.length; i++) {
    const code = signature.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + ((i << 3) & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function buildCommunityEntryId(
  format: "json" | "cli",
  parts: Array<string | number | undefined>
): string {
  return `community-${format}-${deterministicFingerprint(parts.join("|"))}`;
}

function normalizePositiveInt(value: number | undefined, max = 10_000): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(max, Math.round(value));
  }
  return undefined;
}

function parsePlainCountToken(token: string): number | null {
  const cleaned = token.replace(/,/g, "").trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const val = Number(cleaned);
  return Number.isFinite(val) && val > 0 ? val : null;
}

export interface WorkloadTimings {
  "zkop-mix": number;
  "chacha-mix": number;
  "sha256-chain": number;
  "ecdsa-verify": number;
  "bigint-mul": number;
  "memory-merkle": number;
}

export interface BenchmarkEntry {
  id: string;
  model: string;
  shortModel: string;
  vendor: GpuVendor;
  computeStack: string;
  arch: string;
  vramGb: number;
  os: HostOs;
  osDetail: string;
  zkvm: BenchmarkZkVm;
  optimalPo2: number;
  tdpWatts: number;
  msrpUsd: number;
  zkops: number;
  starkRateCyclesPerSec: number;
  groth16WrapSecs: number;
  workloads: WorkloadTimings;
  pciBusId?: string;
  pcieLink?: string;
  telemetrySource?: string;
  hostPeakBytes?: number;
  verified: boolean;
  submittedBy?: string;
  submittedAtIso?: string;
  notes: string;
}

export interface ParseBenchmarkOverrides {
  gpuModel?: string;
  vendor?: GpuVendor;
  os?: HostOs;
  vramGb?: number;
  tdpWatts?: number;
  submittedBy?: string;
}

export interface ParseBenchmarkResult {
  ok: boolean;
  entry?: BenchmarkEntry;
  error?: string;
  detectedFormat?: "json" | "cli";
}

function inferVendor(modelText: string): GpuVendor {
  const lower = modelText.toLowerCase();
  if (
    lower.includes("radeon") ||
    lower.includes("rx ") ||
    lower.includes("amd") ||
    lower.includes("gfx") ||
    lower.includes("adlx")
  ) {
    return "AMD";
  }
  if (
    lower.includes("arc") ||
    lower.includes("intel") ||
    lower.includes("sycl") ||
    lower.includes("b70") ||
    lower.includes("b60") ||
    lower.includes("b580") ||
    lower.includes("a770") ||
    lower.includes("bmg") ||
    lower.includes("igcl")
  ) {
    return "Intel";
  }
  return "NVIDIA";
}

function inferDefaultComputeStack(vendor: GpuVendor, os: HostOs): string {
  if (vendor === "NVIDIA") return os === "Windows" ? "CUDA 12.8 / NVML" : "CUDA 12.9";
  if (vendor === "AMD") return os === "Windows" ? "HIP / Adrenalin ADLX" : "ROCm 10.1 / HIP";
  return os === "Windows" ? "oneAPI SYCL / IGCL" : "oneAPI SYCL 2026.0";
}

function inferTelemetrySource(vendor: GpuVendor, os: HostOs): string {
  if (os === "Windows") {
    if (vendor === "Intel") return "IGCL (ControlLib.dll)";
    if (vendor === "AMD") return "ADLX (amdadlx64.dll)";
    return "NVML (nvml.dll)";
  }
  if (vendor === "Intel") return "Linux sysfs (xe / i915)";
  if (vendor === "AMD") return "Linux sysfs (amdgpu / hwmon)";
  return "NVML + Linux sysfs";
}

function stripGpuOrdinalPrefix(rawLabel: string): string {
  return rawLabel.replace(/^GPU\d+\s+/i, "").trim();
}

function inferShortModel(model: string): string {
  return stripGpuOrdinalPrefix(model)
    .replace(/^NVIDIA\s+GeForce\s+/i, "")
    .replace(/^AMD\s+Radeon\s+/i, "")
    .replace(/^Intel\s+/i, "")
    .trim();
}

function parseDurationToken(token: string): number | null {
  const cleaned = token.trim().toLowerCase();
  if (cleaned === "-" || cleaned === "—") return null;
  if (cleaned.endsWith("ms")) {
    const val = parseFloat(cleaned.replace("ms", ""));
    return Number.isFinite(val) ? Number((val / 1000).toFixed(3)) : null;
  }
  if (cleaned.endsWith("s")) {
    const val = parseFloat(cleaned.replace("s", ""));
    return Number.isFinite(val) ? val : null;
  }
  const mMatch = cleaned.match(/^(\d+)m\s*(\d+(?:\.\d+)?)?s?$/);
  if (mMatch) {
    const mins = parseInt(mMatch[1], 10);
    const secs = mMatch[2] ? parseFloat(mMatch[2]) : 0;
    return mins * 60 + secs;
  }
  const plain = parseFloat(cleaned);
  return Number.isFinite(plain) ? plain : null;
}

function parseCycleRateToken(token: string): number | null {
  const cleaned = token.trim().toUpperCase();
  const mMatch = cleaned.match(/([\d,.]+)\s*M/);
  if (mMatch) {
    return Math.round(parseFloat(mMatch[1].replace(/,/g, "")) * 1_000_000);
  }
  const kMatch = cleaned.match(/([\d,.]+)\s*K/);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1].replace(/,/g, "")) * 1_000);
  }
  const plain = parseFloat(cleaned.replace(/,/g, ""));
  return Number.isFinite(plain) ? Math.round(plain) : null;
}

function extractDurationSecsFromResult(r: Record<string, unknown>): number {
  if (typeof r.stark_secs === "number" && r.stark_secs > 0) return r.stark_secs;
  if (typeof r.duration_secs === "number" && r.duration_secs > 0) return r.duration_secs;
  if (typeof r.prove_secs === "number" && r.prove_secs > 0) return r.prove_secs;
  if (r.duration && typeof r.duration === "object") {
    const d = r.duration as Record<string, unknown>;
    const secs = typeof d.secs === "number" ? d.secs : 0;
    const nanos = typeof d.nanos === "number" ? d.nanos : 0;
    const total = secs + nanos / 1e9;
    if (total > 0) return total;
  }
  return 0;
}

function computeMedian(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 1 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

/**
 * Parses either `zkminer benchmark --json` (`BenchmarkSuite` schema from `crates/zkminer-prover/src/benchmark.rs`)
 * or raw CLI stdout from `zkminer benchmark` (`crates/zkminer-cli/src/commands/benchmark.rs`).
 */
export function parseZkMinerBenchmark(
  rawInput: string,
  overrides: ParseBenchmarkOverrides = {}
): ParseBenchmarkResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Paste raw CLI output or JSON from `zkminer benchmark` to validate.",
    };
  }

  // 1. JSON Format (`zkminer benchmark --json` BenchmarkSuite)
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;

      if (
        typeof parsed.zkops === "number" ||
        Array.isArray(parsed.results) ||
        Array.isArray(parsed.device_benchmarks)
      ) {
        const results = Array.isArray(parsed.results)
          ? (parsed.results as Array<Record<string, unknown>>)
          : [];
        const deviceBenchmarks = Array.isArray(parsed.device_benchmarks)
          ? (parsed.device_benchmarks as Array<Record<string, unknown>>)
          : [];

        const dev0 = deviceBenchmarks[0] ?? {};
        const rawDeviceLabel =
          overrides.gpuModel?.trim() ||
          (typeof dev0.device_label === "string" ? stripGpuOrdinalPrefix(dev0.device_label) : "") ||
          (typeof dev0.device_name === "string" ? stripGpuOrdinalPrefix(dev0.device_name) : "") ||
          (typeof parsed.gpu_model === "string" ? parsed.gpu_model : "") ||
          (typeof parsed.cpu_info === "string" ? parsed.cpu_info : "Custom Miner GPU");

        const vendor = overrides.vendor ?? inferVendor(rawDeviceLabel);
        const os: HostOs =
          overrides.os ??
          (String(parsed.os ?? parsed.telemetry_source ?? "").toLowerCase().includes("win") ||
          String(parsed.telemetry_source ?? "").toLowerCase().includes("igcl") ||
          String(parsed.telemetry_source ?? "").toLowerCase().includes("adlx")
            ? "Windows"
            : "Linux");

        const backendRaw = String(
          dev0.prover_backend ??
            dev0.backend ??
            results[0]?.prover_backend ??
            results[0]?.backend ??
            parsed.backend ??
            "sp1"
        ).toLowerCase();
        const zkvm: BenchmarkZkVm = backendRaw.includes("risc") ? "risc0" : "sp1";

        const workloads: WorkloadTimings = {
          "zkop-mix": 20.5,
          "chacha-mix": 16.8,
          "sha256-chain": 49.5,
          "ecdsa-verify": 5.6,
          "bigint-mul": 5.3,
          "memory-merkle": 7.4,
        };

        let avgRate = 0;
        let rateSamples = 0;
        let resultsCyclesSum = 0;
        let resultsStarkSecsSum = 0;

        for (const r of results) {
          const prog = String(r.program_name ?? r.program ?? "").toLowerCase();
          const starkSecs = extractDurationSecsFromResult(r);
          const cycles = typeof r.cycles === "number" && r.cycles > 0 ? r.cycles : 0;
          const rate = Number(r.throughput ?? r.cycle_rate ?? 0);
          if (prog !== "zkop-mix") {
            if (cycles > 0 && starkSecs > 0) {
              resultsCyclesSum += cycles;
              resultsStarkSecsSum += starkSecs;
            }
            if (rate > 0) {
              avgRate += rate;
              rateSamples += 1;
            }
          }
          if (starkSecs > 0 && prog in workloads) {
            workloads[prog as keyof WorkloadTimings] = Number(starkSecs.toFixed(2));
          }
        }

        // Inspect `program_stages` from DeviceBenchmark (`protocol v4..v12`)
        const programStages = Array.isArray(dev0.program_stages)
          ? (dev0.program_stages as Array<Record<string, unknown>>)
          : [];

        let pricedCyclesSum = 0;
        let pricedStarkSecsSum = 0;
        const wrapSamples: number[] = [];
        let stageZkopMixSecs = 0;

        for (const stage of programStages) {
          const prog = String(stage.program_name ?? stage.program ?? "").toLowerCase();
          const starkSecs = Number(stage.stark_secs ?? 0);
          const cycles = Number(stage.cycles ?? 0);
          const wrapSecs =
            typeof stage.wrap_secs === "number" && stage.wrap_secs > 0 ? stage.wrap_secs : null;

          if (starkSecs > 0 && prog in workloads) {
            workloads[prog as keyof WorkloadTimings] = Number(starkSecs.toFixed(2));
          }
          if (prog === "zkop-mix" && starkSecs > 0) {
            stageZkopMixSecs = starkSecs;
          } else if (cycles > 0 && starkSecs > 0) {
            pricedCyclesSum += cycles;
            pricedStarkSecsSum += starkSecs;
          }
          if (wrapSecs !== null) {
            wrapSamples.push(wrapSecs);
          }
        }

        const hasExplicitZkopMix =
          stageZkopMixSecs > 0 ||
          results.some((r) => String(r.program_name ?? r.program ?? "") === "zkop-mix");

        const rawJsonZkops =
          typeof parsed.zkops === "number" && parsed.zkops > 0
            ? Math.round(parsed.zkops)
            : typeof parsed.mzkops === "number" && parsed.mzkops > 0
              ? Math.round(parsed.mzkops * 1_000_000)
              : 0;

        const zkops =
          rawJsonZkops > 0
            ? rawJsonZkops
            : stageZkopMixSecs > 0
              ? zkopsFromStarkSecs(stageZkopMixSecs)
              : hasExplicitZkopMix && workloads["zkop-mix"] > 0
                ? zkopsFromStarkSecs(workloads["zkop-mix"])
                : 0;

        if (zkops <= 0) {
          return {
            ok: false,
            error:
              "JSON benchmark report is missing a positive `zkops` score or `zkop-mix` STARK duration.",
          };
        }

        if (!hasExplicitZkopMix) {
          workloads["zkop-mix"] = Number((ZKOP_MIX_SP1_CYCLES / zkops).toFixed(2));
        }

        // Cycle-weighted STARK rate (`DeviceBenchmark::stark_rate`) or fallback to `results` cycle sum / `throughput`
        const weightedStarkRate =
          pricedCyclesSum > 0 && pricedStarkSecsSum > 0
            ? Math.round(pricedCyclesSum / pricedStarkSecsSum)
            : resultsCyclesSum > 0 && resultsStarkSecsSum > 0
              ? Math.round(resultsCyclesSum / resultsStarkSecsSum)
              : 0;

        const devThroughput = Number(dev0.throughput ?? dev0.cycle_rate ?? 0);
        const starkRate =
          weightedStarkRate > 0
            ? weightedStarkRate
            : devThroughput > 0
              ? Math.round(devThroughput)
              : rateSamples > 0
                ? Math.round(avgRate / rateSamples)
                : zkops;

        const medianWrap = computeMedian(wrapSamples);
        const groth16WrapSecs =
          medianWrap !== null
            ? Number(medianWrap.toFixed(2))
            : typeof dev0.groth16_secs === "number" && dev0.groth16_secs > 0
              ? Number(dev0.groth16_secs.toFixed(2))
              : 3.5;

        const rawPo2 = Number(dev0.optimal_po2 ?? dev0.po2 ?? 20);
        const optimalPo2 = rawPo2 >= 16 && rawPo2 <= 24 ? rawPo2 : 20;

        const peakMemBytes = Number(
          dev0.memory_usage_bytes ?? dev0.peak_memory_bytes ?? 0
        );
        const overrideVramGb = normalizePositiveInt(overrides.vramGb, 512);
        const vramGb =
          overrideVramGb ??
          (peakMemBytes > 24 * 1024 ** 3
            ? 32
            : peakMemBytes > 16 * 1024 ** 3
              ? 24
              : peakMemBytes > 12 * 1024 ** 3
                ? 16
                : 16);

        const devPowerWatts = Number(dev0.power_watts ?? parsed.gpu_power_watts ?? 0);
        const overrideTdpWatts = normalizePositiveInt(overrides.tdpWatts, 2_000);
        const tdpWatts =
          overrideTdpWatts ?? (devPowerWatts > 0 ? Math.round(devPowerWatts) : 250);

        const pciBusId =
          typeof dev0.pci_bus_id === "string" && dev0.pci_bus_id.trim()
            ? dev0.pci_bus_id.trim()
            : undefined;

        const hostPeaksMap =
          parsed.host_peaks && typeof parsed.host_peaks === "object"
            ? (parsed.host_peaks as Record<string, unknown>)
            : {};
        const hostPeakBytes =
          typeof dev0.host_peak_bytes === "number"
            ? dev0.host_peak_bytes
            : typeof hostPeaksMap[zkvm] === "number"
              ? (hostPeaksMap[zkvm] as number)
              : undefined;

        const entryId = buildCommunityEntryId("json", [
          rawDeviceLabel,
          vendor,
          os,
          zkvm,
          optimalPo2,
          vramGb,
          tdpWatts,
          zkops,
          starkRate,
          groth16WrapSecs,
          workloads["sha256-chain"],
          workloads["chacha-mix"],
          overrides.submittedBy?.trim() || "Community Prover",
        ]);

        const entry: BenchmarkEntry = {
          id: entryId,
          model: rawDeviceLabel,
          shortModel: inferShortModel(rawDeviceLabel),
          vendor,
          computeStack: inferDefaultComputeStack(vendor, os),
          arch: typeof parsed.arch === "string" ? parsed.arch : "Community Submitted",
          vramGb,
          os,
          osDetail:
            typeof parsed.cpu_info === "string"
              ? `Host CPU: ${parsed.cpu_info}`
              : `${os} Worker`,
          zkvm,
          optimalPo2,
          tdpWatts,
          msrpUsd: 799,
          zkops,
          starkRateCyclesPerSec: starkRate,
          groth16WrapSecs,
          workloads,
          pciBusId,
          pcieLink: typeof dev0.pcie_link === "string" ? dev0.pcie_link : undefined,
          telemetrySource: inferTelemetrySource(vendor, os),
          hostPeakBytes,
          verified: false,
          submittedBy: overrides.submittedBy || "Community Prover",
          submittedAtIso: new Date().toISOString(),
          notes: "Validated from `zkminer benchmark --json` (Protocol 12 suite)",
        };

        return { ok: true, entry, detectedFormat: "json" };
      }

      return {
        ok: false,
        error:
          "Unrecognized JSON structure. Expected `zkminer benchmark --json` (`zkops`, `results`, `device_benchmarks`).",
      };
    } catch (err) {
      return {
        ok: false,
        error: `Invalid JSON syntax: ${err instanceof Error ? err.message : "parse failed"}`,
      };
    }
  }

  // 2. Raw CLI Text Output (`zkminer benchmark` stdout)
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let zkops: number | null = null;
  let detectedDeviceName: string | null = null;
  let detectedBackend: BenchmarkZkVm | null = null;
  let detectedPo2 = 20;
  let footerStarkRate: number | null = null;
  let tableStarkRate: number | null = null;
  let detectedGroth16Secs: number | null = null;
  let detectedPowerWatts: number | null = null;
  let detectedPcieLink: string | null = null;
  let detectedBlendedNote: string | null = null;

  const parsedWorkloads: Partial<WorkloadTimings> = {};
  const cliSuiteMetrics = new Map<
    string,
    { cycles?: number; starkSecs?: number; rate?: number }
  >();
  const workloadNames = [
    "zkop-mix",
    "sha256-chain",
    "ecdsa-verify",
    "bigint-mul",
    "memory-merkle",
    "chacha-mix",
  ] as const;

  for (const line of lines) {
    // Match `zkOP/s: 2793695  (SP1 cycles per second on a 50M-cycle program, all GPUs)`
    const zkopsMatch = line.match(/zkOP\/s\s*:\s*([\d,]+(?:\.\d+)?)/i);
    if (zkopsMatch && !/MzkOP\/s/i.test(line)) {
      zkops = Math.round(parseFloat(zkopsMatch[1].replace(/,/g, "")));
      continue;
    }

    // Match upcoming `max/splash-progress-bars` blended per-device line:
    // e.g. `GPU0 AMD Radeon RX 9070 XT: 2.18 MzkOP/s (sp1: 2.76M, risc0: 1.72M)`
    const blendedDeviceMatch = line.match(
      /^(?:GPU\d+\s+)?([^:/]+?):\s*([\d,]+(?:\.\d+)?)\s*MzkOP\/s(?:\s*\(([^)]+)\))?$/i
    );
    if (blendedDeviceMatch && !/all GPUs/i.test(blendedDeviceMatch[1])) {
      detectedDeviceName = stripGpuOrdinalPrefix(blendedDeviceMatch[1]);
      const cardScore = Math.round(
        parseFloat(blendedDeviceMatch[2].replace(/,/g, "")) * 1_000_000
      );
      if (!zkops && cardScore > 0) zkops = cardScore;
      if (blendedDeviceMatch[3]) {
        detectedBlendedNote = `Blended dual-zkVM score (${blendedDeviceMatch[3]})`;
      }
      continue;
    }

    // Match upcoming `max/splash-progress-bars` total line:
    // `2.18 MzkOP/s (all GPUs: each GPU's SP1 and RISC Zero scores blended, added up)`
    const blendedTotalMatch = line.match(
      /([\d,]+(?:\.\d+)?)\s*MzkOP\/s/i
    );
    if (blendedTotalMatch) {
      const totalScore = Math.round(
        parseFloat(blendedTotalMatch[1].replace(/,/g, "")) * 1_000_000
      );
      if (totalScore > 0) {
        zkops = totalScore;
        detectedBlendedNote ??= "Blended dual-zkVM MzkOP/s output";
      }
      continue;
    }

    // Match per-device zkOP/s breakdown line: `GPU0 AMD Radeon RX 9070 XT / sp1: 2793695`
    const perCardZkopsMatch = line.match(
      /^(?:GPU\d+\s+)?(.+?)\s*\/\s*(sp1|risc0)\s*:\s*([\d,]+(?:\.\d+)?)$/i
    );
    if (perCardZkopsMatch) {
      detectedDeviceName = stripGpuOrdinalPrefix(perCardZkopsMatch[1]);
      detectedBackend = perCardZkopsMatch[2].toLowerCase() === "risc0" ? "risc0" : "sp1";
      if (!zkops) {
        zkops = Math.round(parseFloat(perCardZkopsMatch[3].replace(/,/g, "")));
      }
      continue;
    }

    // Match Proving stages footer: `Groth16 wrap 3.85s (fixed; ...). A job of N cycles ≈ 3.9s + N / 2.8M c/s`
    const stageFooterMatch = line.match(
      /Groth16 wrap\s+(\d+(?:\.\d+)?)s.*?\+\s*N\s*\/\s*([\d.]+\s*[MK]?\s*c\/s)/i
    );
    if (stageFooterMatch) {
      detectedGroth16Secs = parseFloat(stageFooterMatch[1]);
      const weightedRate = parseCycleRateToken(stageFooterMatch[2]);
      if (weightedRate) footerStarkRate = weightedRate;
      continue;
    }

    // Match GPU power e.g. `GPU power: 285 W` or TUI telemetry `Power 285W ... PCIe Gen5 x8`
    const powerMatch = line.match(/(?:power\s*:?\s*)(\d+)\s*W/i);
    if (powerMatch) {
      const parsedPower = parseInt(powerMatch[1], 10);
      if (parsedPower > 0) detectedPowerWatts = parsedPower;
    }
    const pcieMatch = line.match(/PCIe\s+(Gen\d+\s*x\d+)/i);
    if (pcieMatch) {
      detectedPcieLink = `PCIe ${pcieMatch[1]}`;
    }

    // Match workload row in either top table or `Proving stages` sub-table
    for (const wName of workloadNames) {
      if (line.toLowerCase().startsWith(wName)) {
        const cols = line.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean);
        const existing = cliSuiteMetrics.get(wName) ?? {};
        if (cols.length >= 6) {
          // Top table: Program | Backend | Precompile | Weight | Cycles | STARK | STARK rate
          const backendCol = cols[1].toLowerCase();
          if (!detectedBackend && (backendCol.includes("risc") || backendCol.includes("sp1"))) {
            detectedBackend = backendCol.includes("risc") ? "risc0" : "sp1";
          }
          const cyclesCandidate = parsePlainCountToken(cols[4]);
          const timeCandidate = parseDurationToken(cols[5]) ?? parseDurationToken(cols[4]);
          if (timeCandidate !== null && timeCandidate > 0) {
            parsedWorkloads[wName] = timeCandidate;
            existing.starkSecs = timeCandidate;
          }
          if (cyclesCandidate) {
            existing.cycles = cyclesCandidate;
          }
          const rateCandidate = cols[6] ? parseCycleRateToken(cols[6]) : null;
          if (rateCandidate) existing.rate = rateCandidate;
          if (wName !== "zkop-mix") cliSuiteMetrics.set(wName, existing);
        } else if (cols.length >= 4) {
          // Proving stages table: Program | Cycles | STARK | STARK rate | Groth16
          const cyclesCandidate = parsePlainCountToken(cols[1]);
          const timeCandidate = parseDurationToken(cols[2]);
          if (timeCandidate !== null && timeCandidate > 0) {
            parsedWorkloads[wName] = timeCandidate;
            existing.starkSecs = timeCandidate;
          }
          if (cyclesCandidate) {
            existing.cycles = cyclesCandidate;
          }
          const rateCandidate = parseCycleRateToken(cols[3]);
          if (rateCandidate) existing.rate = rateCandidate;
          if (wName !== "zkop-mix") cliSuiteMetrics.set(wName, existing);
          if (cols[4]) {
            const wrapCandidate = parseDurationToken(cols[4]);
            if (wrapCandidate !== null && wrapCandidate > 0) {
              detectedGroth16Secs = wrapCandidate;
            }
          }
        } else {
          const simpleTime = line.match(/(\d+(?:\.\d+)?(?:ms|s))\s+([\d.]+\s*[MK]?\s*c\/s)/i);
          if (simpleTime) {
            const t = parseDurationToken(simpleTime[1]);
            if (t) {
              parsedWorkloads[wName] = t;
              existing.starkSecs = t;
            }
            const r = parseCycleRateToken(simpleTime[2]);
            if (r) existing.rate = r;
            if (wName !== "zkop-mix") cliSuiteMetrics.set(wName, existing);
          }
        }
      }
    }

    // Match Device Benchmarks table row:
    // `GPU0 NVIDIA GeForce RTX 4090  risc0  20  1M rows  12.1 GB  2.0M c/s  2.0s`
    if (
      (line.includes("c/s") || line.includes("GB") || line.includes("GiB") || line.includes("MB")) &&
      !line.toLowerCase().startsWith("device") &&
      !line.toLowerCase().startsWith("groth16 wrap") &&
      !workloadNames.some((w) => line.toLowerCase().startsWith(w))
    ) {
      const cols = line.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 5) {
        detectedDeviceName = stripGpuOrdinalPrefix(cols[0]);
        if (cols[1].toLowerCase().includes("risc")) detectedBackend = "risc0";
        else if (cols[1].toLowerCase().includes("sp1")) detectedBackend = "sp1";

        const po2Num = parseInt(cols[2], 10);
        if (po2Num >= 16 && po2Num <= 24) detectedPo2 = po2Num;

        for (const col of cols.slice(3)) {
          if (col.includes("c/s")) {
            const r = parseCycleRateToken(col);
            if (r) tableStarkRate = r;
          } else if (/^\d+(\.\d+)?s$/i.test(col)) {
            const g = parseDurationToken(col);
            if (g) detectedGroth16Secs = g;
          }
        }
      }
    }
  }

  let cliCyclesSum = 0;
  let cliStarkSecsSum = 0;
  let cliRateSum = 0;
  let cliRateCount = 0;
  for (const metrics of cliSuiteMetrics.values()) {
    if (metrics.cycles && metrics.starkSecs && metrics.cycles > 0 && metrics.starkSecs > 0) {
      cliCyclesSum += metrics.cycles;
      cliStarkSecsSum += metrics.starkSecs;
    }
    if (metrics.rate && metrics.rate > 0) {
      cliRateSum += metrics.rate;
      cliRateCount += 1;
    }
  }

  const cycleWeightedCliRate =
    cliCyclesSum > 0 && cliStarkSecsSum > 0
      ? Math.round(cliCyclesSum / cliStarkSecsSum)
      : cliRateCount > 0
        ? Math.round(cliRateSum / cliRateCount)
        : null;

  const detectedStarkRate = footerStarkRate ?? cycleWeightedCliRate ?? tableStarkRate;

  if (!zkops && parsedWorkloads["zkop-mix"] && parsedWorkloads["zkop-mix"] > 0) {
    zkops = zkopsFromStarkSecs(parsedWorkloads["zkop-mix"]);
  }

  if (!zkops || zkops <= 0) {
    return {
      ok: false,
      error:
        "Could not find `zkOP/s: <score>`, `MzkOP/s`, or `zkop-mix` timing in CLI output. Paste output from `zkminer benchmark` or `zkminer benchmark --json`.",
    };
  }

  const finalModel =
    overrides.gpuModel?.trim() || detectedDeviceName || "Custom Consumer GPU";
  const vendor = overrides.vendor ?? inferVendor(finalModel);
  const os: HostOs = overrides.os ?? "Linux";
  const zkvm: BenchmarkZkVm = detectedBackend ?? "sp1";

  const zkopMixSecs =
    parsedWorkloads["zkop-mix"] ?? Number((ZKOP_MIX_SP1_CYCLES / zkops).toFixed(2));

  const workloads: WorkloadTimings = {
    "zkop-mix": zkopMixSecs,
    "chacha-mix": parsedWorkloads["chacha-mix"] ?? Number((zkopMixSecs * 0.82).toFixed(2)),
    "sha256-chain":
      parsedWorkloads["sha256-chain"] ?? Number((zkopMixSecs * 2.55).toFixed(2)),
    "ecdsa-verify":
      parsedWorkloads["ecdsa-verify"] ?? Number((zkopMixSecs * 0.31).toFixed(2)),
    "bigint-mul":
      parsedWorkloads["bigint-mul"] ?? Number((zkopMixSecs * 0.29).toFixed(2)),
    "memory-merkle":
      parsedWorkloads["memory-merkle"] ?? Number((zkopMixSecs * 0.39).toFixed(2)),
  };

  const finalVramGb = normalizePositiveInt(overrides.vramGb, 512) ?? 16;
  const finalTdpWatts =
    normalizePositiveInt(overrides.tdpWatts, 2_000) ?? detectedPowerWatts ?? 260;
  const finalStarkRate = detectedStarkRate ?? zkops;
  const finalGroth16Secs = detectedGroth16Secs ?? 3.2;

  const entryId = buildCommunityEntryId("cli", [
    finalModel,
    vendor,
    os,
    zkvm,
    detectedPo2,
    finalVramGb,
    finalTdpWatts,
    zkops,
    finalStarkRate,
    finalGroth16Secs,
    workloads["sha256-chain"],
    workloads["chacha-mix"],
    overrides.submittedBy?.trim() || "Community Prover",
  ]);

  const entry: BenchmarkEntry = {
    id: entryId,
    model: finalModel,
    shortModel: inferShortModel(finalModel),
    vendor,
    computeStack: inferDefaultComputeStack(vendor, os),
    arch: "Community Verified CLI",
    vramGb: finalVramGb,
    os,
    osDetail: `${os} / zkminer CLI (Protocol 12)`,
    zkvm,
    optimalPo2: detectedPo2,
    tdpWatts: finalTdpWatts,
    msrpUsd: 699,
    zkops,
    starkRateCyclesPerSec: finalStarkRate,
    groth16WrapSecs: finalGroth16Secs,
    workloads,
    pcieLink: detectedPcieLink ?? undefined,
    telemetrySource: inferTelemetrySource(vendor, os),
    verified: false,
    submittedBy: overrides.submittedBy || "Community Prover",
    submittedAtIso: new Date().toISOString(),
    notes: detectedBlendedNote
      ? `Parsed from \`zkminer benchmark\` CLI output — ${detectedBlendedNote}`
      : "Parsed from `zkminer benchmark` CLI output (5-program suite + self-scored zkOP/s)",
  };

  return { ok: true, entry, detectedFormat: "cli" };
}

export const SAMPLE_CLI_BENCHMARK_OUTPUT = `Program            Backend    Precompile   Weight       Cycles      STARK      STARK rate
--------------------------------------------------------------------------------------
sha256-chain       sp1        yes             20%    213000000     57.40s    3710801 c/s
ecdsa-verify       sp1        yes             25%     19400000      6.50s    2984615 c/s
bigint-mul         sp1        -               20%     18200000      6.10s    2983607 c/s
memory-merkle      sp1        yes             15%     21600000      7.15s    3020979 c/s
chacha-mix         sp1        -               20%     34800000     12.10s    2876033 c/s
zkop-mix           sp1        -                 -     50007139     17.90s    2793695 c/s
--------------------------------------------------------------------------------------

  zkOP/s: 2793695  (SP1 cycles per second on a 50M-cycle program, all GPUs)
    GPU0 AMD Radeon RX 9070 XT / sp1: 2793695

Device Benchmarks
------------------------------------------------------------------------------------------
Device                     Backend      po2    Segment     Memory      STARK rate   Groth16
------------------------------------------------------------------------------------------
GPU0 AMD Radeon RX 9070 XT sp1           20    1M rows    14.8 GB        3.0M c/s      3.8s
------------------------------------------------------------------------------------------

Proving stages (STARK = execution + core proofs + recursion; Groth16 = the on-chain wrap)
------------------------------------------------------------------------------------------
GPU0 AMD Radeon RX 9070 XT / sp1
  Program                Cycles      STARK     STARK rate    Groth16
  sha256-chain        213000000     57.40s       3.7M c/s          —
  ecdsa-verify         19400000      6.50s       3.0M c/s          —
  bigint-mul           18200000      6.10s       3.0M c/s          —
  memory-merkle        21600000      7.15s       3.0M c/s          —
  chacha-mix           34800000     12.10s       2.9M c/s      3.85s
  zkop-mix             50007139     17.90s       2.8M c/s          —
  Groth16 wrap 3.85s (fixed; measured on chacha-mix by difference). A job of N cycles ≈ 3.9s + N / 3.5M c/s (cycle-weighted STARK rate).`;

export const SAMPLE_JSON_BENCHMARK_OUTPUT = JSON.stringify(
  {
    zkops: 2420481,
    cpu_info: "AMD Ryzen 9 9950X 16-Core Processor",
    gpu_power_watts: 265,
    timestamp: "2026-11-10T18:14:00Z",
    host_peaks: {
      risc0: 14820000000,
    },
    results: [
      {
        program_name: "sha256-chain",
        prover_backend: "risc0",
        cycles: 109051904,
        duration: { secs: 49, nanos: 500000000 },
        throughput: 2203069,
        weight: 0.2,
        precompile: true,
      },
      {
        program_name: "ecdsa-verify",
        prover_backend: "risc0",
        cycles: 12582912,
        duration: { secs: 5, nanos: 620000000 },
        throughput: 2238952,
        weight: 0.25,
        precompile: true,
      },
      {
        program_name: "bigint-mul",
        prover_backend: "risc0",
        cycles: 11534336,
        duration: { secs: 5, nanos: 340000000 },
        throughput: 2160000,
        weight: 0.2,
        precompile: false,
      },
      {
        program_name: "memory-merkle",
        prover_backend: "risc0",
        cycles: 16777216,
        duration: { secs: 7, nanos: 450000000 },
        throughput: 2251975,
        weight: 0.15,
        precompile: true,
      },
      {
        program_name: "chacha-mix",
        prover_backend: "risc0",
        cycles: 34603008,
        duration: { secs: 16, nanos: 900000000 },
        throughput: 2047515,
        weight: 0.2,
        precompile: false,
      },
    ],
    device_benchmarks: [
      {
        device_id: "gpu0",
        device_label: "GPU0 NVIDIA GeForce RTX 4080 SUPER",
        prover_backend: "risc0",
        throughput: 2180302,
        power_watts: 265,
        optimal_po2: 20,
        memory_usage_bytes: 13107200000,
        max_feasible_po2: 20,
        pci_bus_id: "0000:01:00.0",
        host_peak_bytes: 14820000000,
        program_stages: [
          {
            program_name: "sha256-chain",
            cycles: 109051904,
            stark_secs: 49.5,
            wrap_secs: 2.34,
          },
          {
            program_name: "ecdsa-verify",
            cycles: 12582912,
            stark_secs: 5.62,
            wrap_secs: 2.35,
          },
          {
            program_name: "bigint-mul",
            cycles: 11534336,
            stark_secs: 5.34,
            wrap_secs: 2.35,
          },
          {
            program_name: "memory-merkle",
            cycles: 16777216,
            stark_secs: 7.45,
            wrap_secs: 2.36,
          },
          {
            program_name: "chacha-mix",
            cycles: 34603008,
            stark_secs: 16.9,
            wrap_secs: 2.35,
          },
          {
            program_name: "zkop-mix",
            cycles: 50007139,
            stark_secs: 20.66,
            wrap_secs: null,
          },
        ],
      },
    ],
  },
  null,
  2
);
