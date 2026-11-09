export type GpuVendor = "NVIDIA" | "AMD" | "Intel";
export type HostOs = "Linux" | "Windows";
export type BenchmarkZkVm = "sp1" | "risc0";

export interface WorkloadTimings {
  "zkop-mix": number;
  "chacha-mix": number;
  "sha256-chain": number;
  "ecdsa-verify": number;
  "bigint-mul": number;
  fibonacci: number;
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
  if (lower.includes("radeon") || lower.includes("rx ") || lower.includes("amd") || lower.includes("gfx")) {
    return "AMD";
  }
  if (lower.includes("arc") || lower.includes("intel") || lower.includes("sycl") || lower.includes("b580") || lower.includes("a770")) {
    return "Intel";
  }
  return "NVIDIA";
}

function inferDefaultComputeStack(vendor: GpuVendor, os: HostOs): string {
  if (vendor === "NVIDIA") return os === "Windows" ? "CUDA 12.8 (Win11)" : "CUDA 12.9";
  if (vendor === "AMD") return os === "Windows" ? "HIP / Adrenalin" : "ROCm 10.1 / HIP";
  return "oneAPI SYCL 2026.0";
}

function inferShortModel(model: string): string {
  return model
    .replace(/^NVIDIA\s+GeForce\s+/i, "")
    .replace(/^AMD\s+Radeon\s+/i, "")
    .replace(/^Intel\s+/i, "")
    .trim();
}

function parseDurationToken(token: string): number | null {
  const cleaned = token.trim().toLowerCase();
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

/**
 * Parses either `zkminer benchmark --json` (`BenchmarkSuite` schema) or raw CLI stdout
 * from `zkminer benchmark` (`crates/zkminer-cli/src/commands/benchmark.rs`).
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

  // 1. JSON Format (`zkminer benchmark --json` BenchmarkSuite or direct BenchmarkEntry)
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;

      // Case A: Standard `zkminer benchmark --json` BenchmarkSuite
      if (typeof parsed.zkops === "number" || Array.isArray(parsed.results)) {
        const results = Array.isArray(parsed.results)
          ? (parsed.results as Array<Record<string, unknown>>)
          : [];
        const deviceBenchmarks = Array.isArray(parsed.device_benchmarks)
          ? (parsed.device_benchmarks as Array<Record<string, unknown>>)
          : [];

        const dev0 = deviceBenchmarks[0] ?? {};
        const rawDeviceName =
          overrides.gpuModel?.trim() ||
          (typeof dev0.device_name === "string" ? dev0.device_name : "") ||
          (typeof parsed.gpu_model === "string" ? parsed.gpu_model : "") ||
          (typeof parsed.cpu_info === "string" ? parsed.cpu_info : "Custom Miner GPU");

        const vendor = overrides.vendor ?? inferVendor(rawDeviceName);
        const os: HostOs =
          overrides.os ??
          (String(parsed.os ?? "").toLowerCase().includes("win") ? "Windows" : "Linux");

        const backendRaw = String(
          dev0.backend ?? results[0]?.backend ?? parsed.backend ?? "sp1"
        ).toLowerCase();
        const zkvm: BenchmarkZkVm = backendRaw.includes("risc") ? "risc0" : "sp1";

        const workloads: WorkloadTimings = {
          "zkop-mix": 22.0,
          "chacha-mix": 18.5,
          "sha256-chain": 58.0,
          "ecdsa-verify": 6.8,
          "bigint-mul": 6.4,
          fibonacci: 0.6,
        };

        let avgRate = 0;
        let rateSamples = 0;

        for (const r of results) {
          const prog = String(r.program ?? "").toLowerCase();
          const starkSecs = Number(r.stark_secs ?? r.prove_secs ?? 0);
          const rate = Number(r.cycle_rate ?? 0);
          if (rate > 0) {
            avgRate += rate;
            rateSamples += 1;
          }
          if (starkSecs > 0 && prog in workloads) {
            workloads[prog as keyof WorkloadTimings] = Number(starkSecs.toFixed(2));
          }
        }

        const zkops =
          typeof parsed.zkops === "number" && parsed.zkops > 0
            ? Math.round(parsed.zkops)
            : workloads["zkop-mix"] > 0
              ? Math.round(50_000_000 / workloads["zkop-mix"])
              : 0;

        if (zkops <= 0) {
          return {
            ok: false,
            error: "JSON benchmark report is missing a positive `zkops` score or valid workload timings.",
          };
        }

        // Derive zkop-mix if omitted in results
        if (!results.some((r) => r.program === "zkop-mix")) {
          workloads["zkop-mix"] = Number((50_000_000 / zkops).toFixed(2));
        }

        const starkRate =
          typeof dev0.cycle_rate === "number" && dev0.cycle_rate > 0
            ? Math.round(dev0.cycle_rate)
            : rateSamples > 0
              ? Math.round(avgRate / rateSamples)
              : zkops;

        const groth16WrapSecs =
          typeof dev0.groth16_secs === "number" && dev0.groth16_secs > 0
            ? Number(dev0.groth16_secs.toFixed(2))
            : 3.5;

        const optimalPo2 =
          typeof dev0.po2 === "number" && dev0.po2 >= 16 && dev0.po2 <= 22 ? dev0.po2 : 20;

        const peakMemBytes = typeof dev0.peak_memory_bytes === "number" ? dev0.peak_memory_bytes : 0;
        const vramGb =
          overrides.vramGb ??
          (peakMemBytes > 16 * 1024 ** 3 ? 24 : peakMemBytes > 12 * 1024 ** 3 ? 16 : 16);

        const tdpWatts =
          overrides.tdpWatts ??
          (typeof parsed.gpu_power_watts === "number" && parsed.gpu_power_watts > 0
            ? Math.round(parsed.gpu_power_watts)
            : 250);

        const entry: BenchmarkEntry = {
          id: `community-${Date.now()}`,
          model: rawDeviceName,
          shortModel: inferShortModel(rawDeviceName),
          vendor,
          computeStack: inferDefaultComputeStack(vendor, os),
          arch: typeof parsed.arch === "string" ? parsed.arch : "Community Submitted",
          vramGb,
          os,
          osDetail: typeof parsed.cpu_info === "string" ? `Host CPU: ${parsed.cpu_info}` : `${os} Worker`,
          zkvm,
          optimalPo2,
          tdpWatts,
          msrpUsd: 799,
          zkops,
          starkRateCyclesPerSec: starkRate,
          groth16WrapSecs,
          workloads,
          verified: false,
          submittedBy: overrides.submittedBy || "Community Prover",
          submittedAtIso: new Date().toISOString(),
          notes: "Validated from `zkminer benchmark --json` report",
        };

        return { ok: true, entry, detectedFormat: "json" };
      }

      return {
        ok: false,
        error: "Unrecognized JSON structure. Expected `zkminer benchmark --json` (`zkops`, `results`, `device_benchmarks`).",
      };
    } catch (err) {
      return {
        ok: false,
        error: `Invalid JSON syntax: ${err instanceof Error ? err.message : "parse failed"}`,
      };
    }
  }

  // 2. Raw CLI Text Output (`zkminer benchmark`)
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let zkops: number | null = null;
  let detectedDeviceName: string | null = null;
  let detectedBackend: BenchmarkZkVm | null = null;
  let detectedPo2 = 20;
  let detectedStarkRate: number | null = null;
  let detectedGroth16Secs: number | null = null;
  let detectedPowerWatts: number | null = null;

  const parsedWorkloads: Partial<WorkloadTimings> = {};

  for (const line of lines) {
    // Match `zkOP/s: 2,540,000 (3970X baseline = 100,000)`
    const zkopsMatch = line.match(/zkOP\/s\s*:\s*([\d,]+(?:\.\d+)?)/i);
    if (zkopsMatch) {
      zkops = Math.round(parseFloat(zkopsMatch[1].replace(/,/g, "")));
      continue;
    }

    // Match GPU power e.g. `GPU power: 285 W`
    const powerMatch = line.match(/power\s*:\s*(\d+)\s*W/i);
    if (powerMatch) {
      detectedPowerWatts = parseInt(powerMatch[1], 10);
    }

    // Match workload row: `chacha-mix    sp1   ARX-only   25%   50.0M   12.4s   4.05M c/s`
    const workloadNames = [
      "zkop-mix",
      "ecdsa-verify",
      "bigint-mul",
      "chacha-mix",
      "sha256-chain",
      "fibonacci",
    ] as const;

    for (const wName of workloadNames) {
      if (line.toLowerCase().startsWith(wName)) {
        const cols = line.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean);
        if (cols.length >= 6) {
          const backendCol = cols[1].toLowerCase();
          if (!detectedBackend) {
            detectedBackend = backendCol.includes("risc") ? "risc0" : "sp1";
          }
          // STARK time is typically column 5 (index 5) or column 4
          const timeCandidate = parseDurationToken(cols[5]) ?? parseDurationToken(cols[4]);
          if (timeCandidate !== null && timeCandidate > 0) {
            parsedWorkloads[wName] = timeCandidate;
          }
          const rateCandidate = cols[6] ? parseCycleRateToken(cols[6]) : null;
          if (rateCandidate && (!detectedStarkRate || rateCandidate > detectedStarkRate)) {
            detectedStarkRate = rateCandidate;
          }
        } else {
          // Fallback whitespace regex
          const simpleTime = line.match(/(\d+(?:\.\d+)?(?:ms|s))\s+([\d.]+\s*[MK]?\s*c\/s)/i);
          if (simpleTime) {
            const t = parseDurationToken(simpleTime[1]);
            if (t) parsedWorkloads[wName] = t;
            const r = parseCycleRateToken(simpleTime[2]);
            if (r) detectedStarkRate = r;
          }
        }
      }
    }

    // Match Device Benchmarks table row:
    // `NVIDIA GeForce RTX 4090  risc0  20  1048576  12.1 GiB  2.02M c/s  2.0s`
    if (
      (line.includes("c/s") || line.includes("GiB") || line.includes("MiB")) &&
      !line.toLowerCase().startsWith("device") &&
      !workloadNames.some((w) => line.toLowerCase().startsWith(w))
    ) {
      const cols = line.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 5) {
        detectedDeviceName = cols[0];
        if (cols[1].toLowerCase().includes("risc")) detectedBackend = "risc0";
        else if (cols[1].toLowerCase().includes("sp1")) detectedBackend = "sp1";

        const po2Num = parseInt(cols[2], 10);
        if (po2Num >= 16 && po2Num <= 22) detectedPo2 = po2Num;

        for (const col of cols.slice(3)) {
          if (col.includes("c/s")) {
            const r = parseCycleRateToken(col);
            if (r) detectedStarkRate = r;
          } else if (/^\d+(\.\d+)?s$/i.test(col)) {
            const g = parseDurationToken(col);
            if (g) detectedGroth16Secs = g;
          }
        }
      }
    }
  }

  if (!zkops && parsedWorkloads["zkop-mix"] && parsedWorkloads["zkop-mix"] > 0) {
    zkops = Math.round(50_000_000 / parsedWorkloads["zkop-mix"]);
  }

  if (!zkops || zkops <= 0) {
    return {
      ok: false,
      error:
        "Could not find `zkOP/s: <score>` or `zkop-mix` timing in CLI output. Paste output from `zkminer benchmark` or `zkminer benchmark --json`.",
    };
  }

  const finalModel =
    overrides.gpuModel?.trim() || detectedDeviceName || "Custom Consumer GPU";
  const vendor = overrides.vendor ?? inferVendor(finalModel);
  const os: HostOs = overrides.os ?? "Linux";
  const zkvm: BenchmarkZkVm = detectedBackend ?? "sp1";

  const zkopMixSecs =
    parsedWorkloads["zkop-mix"] ?? Number((50_000_000 / zkops).toFixed(2));

  const workloads: WorkloadTimings = {
    "zkop-mix": zkopMixSecs,
    "chacha-mix": parsedWorkloads["chacha-mix"] ?? Number((zkopMixSecs * 0.85).toFixed(2)),
    "sha256-chain":
      parsedWorkloads["sha256-chain"] ?? Number((zkopMixSecs * 2.65).toFixed(2)),
    "ecdsa-verify":
      parsedWorkloads["ecdsa-verify"] ?? Number((zkopMixSecs * 0.31).toFixed(2)),
    "bigint-mul":
      parsedWorkloads["bigint-mul"] ?? Number((zkopMixSecs * 0.29).toFixed(2)),
    fibonacci: parsedWorkloads.fibonacci ?? Number((zkopMixSecs * 0.028).toFixed(2)),
  };

  const entry: BenchmarkEntry = {
    id: `community-cli-${Date.now()}`,
    model: finalModel,
    shortModel: inferShortModel(finalModel),
    vendor,
    computeStack: inferDefaultComputeStack(vendor, os),
    arch: "Community Verified CLI",
    vramGb: overrides.vramGb ?? 16,
    os,
    osDetail: `${os} / zkminer CLI v0.4.2`,
    zkvm,
    optimalPo2: detectedPo2,
    tdpWatts: overrides.tdpWatts ?? detectedPowerWatts ?? 260,
    msrpUsd: 699,
    zkops,
    starkRateCyclesPerSec: detectedStarkRate ?? zkops,
    groth16WrapSecs: detectedGroth16Secs ?? 3.2,
    workloads,
    verified: false,
    submittedBy: overrides.submittedBy || "Community Prover",
    submittedAtIso: new Date().toISOString(),
    notes: "Parsed from `zkminer benchmark` CLI output",
  };

  return { ok: true, entry, detectedFormat: "cli" };
}

export const SAMPLE_CLI_BENCHMARK_OUTPUT = `Program          Backend   Precompile               Weight     Cycles      STARK    STARK rate
-----------------------------------------------------------------------------------------------
zkop-mix         sp1       none (50M baseline)        --      50.0M      17.9s     2.79M c/s
ecdsa-verify     sp1       secp256k1 ECDSA            30%     19.4M       6.5s     2.98M c/s
bigint-mul       sp1       uint256 modmul             20%     18.2M       6.1s     2.98M c/s
chacha-mix       sp1       ARX-only (no precompile)   25%     34.8M      12.1s     2.88M c/s
sha256-chain     sp1       SHA-256 extend+compress    25%    213.0M      57.4s     3.71M c/s
fibonacci        sp1       pure ALU sanity            0%       1.2M     520ms      2.31M c/s

  zkOP/s: 2,793,296  (3970X baseline = 100,000)
  GPU power: 280 W

Device Benchmarks
Device                        Backend  po2     Segment      Memory    STARK rate   Groth16
-------------------------------------------------------------------------------------------
AMD Radeon RX 9070 XT (OC)    sp1       20     1048576    14.8 GiB    2.89M c/s     3.7s`;

export const SAMPLE_JSON_BENCHMARK_OUTPUT = JSON.stringify(
  {
    zkops: 2420000,
    cpu_info: "AMD Ryzen 9 9950X 16-Core Processor",
    gpu_power_watts: 265,
    timestamp: "2026-11-09T21:14:00Z",
    results: [
      {
        program: "zkop-mix",
        backend: "risc0",
        cycles: 50000000,
        stark_secs: 20.66,
        cycle_rate: 2420000,
      },
      {
        program: "ecdsa-verify",
        backend: "risc0",
        cycles: 19400000,
        stark_secs: 5.62,
        cycle_rate: 2150000,
      },
      {
        program: "bigint-mul",
        backend: "risc0",
        cycles: 18200000,
        stark_secs: 5.34,
        cycle_rate: 2190000,
      },
      {
        program: "chacha-mix",
        backend: "risc0",
        cycles: 34800000,
        stark_secs: 16.9,
        cycle_rate: 2059000,
      },
      {
        program: "sha256-chain",
        backend: "risc0",
        cycles: 213000000,
        stark_secs: 49.5,
        cycle_rate: 2210000,
      },
      {
        program: "fibonacci",
        backend: "risc0",
        cycles: 1200000,
        stark_secs: 0.49,
        cycle_rate: 2440000,
      },
    ],
    device_benchmarks: [
      {
        device_name: "NVIDIA GeForce RTX 4080 SUPER",
        backend: "risc0",
        po2: 20,
        segment_cycles: 1048576,
        peak_memory_bytes: 13107200000,
        cycle_rate: 2180000,
        groth16_secs: 2.35,
      },
    ],
  },
  null,
  2
);
