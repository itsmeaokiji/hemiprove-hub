import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeBlendedZkops,
  parseZkMinerBenchmark,
  SAMPLE_CLI_BENCHMARK_OUTPUT,
  SAMPLE_JSON_BENCHMARK_OUTPUT,
  ZKOP_MIX_SP1_CYCLES,
  ZKOP_SP1_PER_RISC0,
} from "@/lib/benchmark-parser";
import {
  generateSolidityRequesterCode,
  generateViemSubmitterScript,
} from "@/lib/code-generator";
import {
  computeEscalatingOffer,
  HEMIPROVE_DEPLOYMENTS,
  PROOF_SYSTEMS,
} from "@/lib/hemi-chain";
import {
  buildBaselineJobs,
  buildBaselineKpis,
  buildLiveKpis,
} from "@/lib/marketplace-data";
import {
  KECCAK_CHARGE_PER_REQUEST,
  runDeterministicSimulation,
  SIMULATE_PRESETS,
} from "@/lib/simulate-engine";

describe("hemi-chain", () => {
  it("clamps computeEscalatingOffer at bounds and computes linear midpoint", () => {
    assert.equal(computeEscalatingOffer(1, 5, 100, -10, 0), 1);
    assert.equal(computeEscalatingOffer(1, 5, 100, 0, 0), 1);
    assert.equal(computeEscalatingOffer(1, 5, 100, 50, 0), 3);
    assert.equal(computeEscalatingOffer(1, 5, 100, 100, 0), 5);
    assert.equal(computeEscalatingOffer(1, 5, 100, 250, 0), 5);
    assert.equal(computeEscalatingOffer(1, 5, 0, 10, 0), 5);
  });

  it("keeps curveType 1 monotonic within [min, max]", () => {
    const q1 = computeEscalatingOffer(2, 10, 100, 25, 1);
    const mid = computeEscalatingOffer(2, 10, 100, 50, 1);
    const q3 = computeEscalatingOffer(2, 10, 100, 75, 1);
    assert.ok(q1 >= 2 && q1 <= mid && mid <= q3 && q3 <= 10);
    assert.equal(computeEscalatingOffer(2, 10, 100, 100, 1), 10);
  });

  it("exposes Sepolia and Mainnet deployments and proof systems", () => {
    assert.equal(HEMIPROVE_DEPLOYMENTS.sepolia.chainId, 743111);
    assert.equal(HEMIPROVE_DEPLOYMENTS.mainnet.chainId, 43111);
    assert.ok(Object.keys(PROOF_SYSTEMS).length > 0);
  });
});

describe("benchmark-parser", () => {
  it("parses bundled CLI and JSON benchmark samples cleanly", () => {
    const cliResult = parseZkMinerBenchmark(SAMPLE_CLI_BENCHMARK_OUTPUT);
    assert.equal(cliResult.ok, true);
    assert.equal(cliResult.detectedFormat, "cli");
    assert.ok(cliResult.entry);

    const jsonResult = parseZkMinerBenchmark(SAMPLE_JSON_BENCHMARK_OUTPUT);
    assert.equal(jsonResult.ok, true);
    assert.equal(jsonResult.detectedFormat, "json");
    assert.ok(jsonResult.entry);
  });

  it("produces deterministic community entry IDs across repeated parses", () => {
    const overrides = {
      gpuModel: "NVIDIA RTX 4090",
      vramGb: 24,
      tdpWatts: 450,
      submittedBy: "qa-tester",
    };
    const first = parseZkMinerBenchmark(SAMPLE_CLI_BENCHMARK_OUTPUT, overrides);
    const second = parseZkMinerBenchmark(SAMPLE_CLI_BENCHMARK_OUTPUT, overrides);
    const differentGpu = parseZkMinerBenchmark(SAMPLE_CLI_BENCHMARK_OUTPUT, {
      ...overrides,
      gpuModel: "NVIDIA RTX 4080",
    });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(differentGpu.ok, true);
    assert.equal(first.entry?.id, second.entry?.id);
    assert.notEqual(first.entry?.id, differentGpu.entry?.id);
  });

  it("rejects empty inputs and clamps non-positive hardware overrides", () => {
    const emptyRes = parseZkMinerBenchmark("   ");
    assert.equal(emptyRes.ok, false);
    assert.ok(emptyRes.error);

    const zeroTdp = parseZkMinerBenchmark(SAMPLE_CLI_BENCHMARK_OUTPUT, {
      tdpWatts: 0,
      vramGb: -4,
    });
    assert.equal(zeroTdp.ok, true);
    assert.ok(zeroTdp.entry);
    assert.ok(zeroTdp.entry.tdpWatts > 0);
    assert.ok(zeroTdp.entry.vramGb > 0);
  });

  it("supports MzkOP/s blended CLI output and cycle-weighted starkRate fallback", () => {
    assert.equal(ZKOP_MIX_SP1_CYCLES, 50_007_139);
    assert.equal(ZKOP_SP1_PER_RISC0, 3.71);

    const blended = computeBlendedZkops(37.1, 10);
    assert.ok(Number.isFinite(blended) && blended > 0);
    assert.equal(computeBlendedZkops(0, 10), 0);

    // Multi-row CLI stdout without footer summary: starkRateCyclesPerSec must reflect weighted total cycles/starkSecs, not just the last row.
    const multiRowCli = [
      "GPU0 NVIDIA GeForce RTX 4090 / sp1",
      "  Program                Cycles      STARK     STARK rate    Groth16",
      "  sha256-chain        200000000     20.00s      10.0M c/s          —",
      "  ecdsa-verify         10000000      5.00s       2.0M c/s          —",
      "  zkop-mix             50007139     10.00s       5.0M c/s          —",
    ].join("\n");

    const parsedNoFooter = parseZkMinerBenchmark(multiRowCli);
    assert.equal(parsedNoFooter.ok, true);
    assert.ok(parsedNoFooter.entry);
    // Weighted non-zkop-mix rate = (200M + 10M) / (20s + 5s) = 8,400,000 c/s, not 2,000,000 (last row).
    assert.ok(parsedNoFooter.entry.starkRateCyclesPerSec > 7_000_000);
    assert.notEqual(parsedNoFooter.entry.starkRateCyclesPerSec, 2_000_000);

    // Blended MzkOP/s format from max/splash-progress-bars.
    const blendedCli = [
      "GPU0 NVIDIA GeForce RTX 4090: 12.40 MzkOP/s (sp1: 14.10M, risc0: 10.90M)",
      "12.40 MzkOP/s (all GPUs: each GPU's SP1 and RISC Zero scores blended, added up)",
      "  sha256-chain        200000000     20.00s      10.0M c/s          —",
    ].join("\n");

    const parsedMzkop = parseZkMinerBenchmark(blendedCli);
    assert.equal(parsedMzkop.ok, true);
    assert.equal(parsedMzkop.entry?.zkops, 12_400_000);
    assert.match(parsedMzkop.entry?.model ?? "", /RTX 4090/);
  });
});

describe("simulate-engine & code-generator", () => {
  it("runs deterministic simulation on all SIMULATE_PRESETS", () => {
    assert.ok(SIMULATE_PRESETS.length > 0);
    assert.ok(KECCAK_CHARGE_PER_REQUEST > 0);

    for (const preset of SIMULATE_PRESETS) {
      const report = runDeterministicSimulation({
        elfUrl: preset.elfUrl,
        targetZkvm: preset.targetZkvm,
        stdin: preset.stdin,
        singleRun: false,
      });
      assert.ok(report);
    }
  });

  it("generates hardened Solidity requester & standalone Viem script (C-1 fixes)", () => {
    const preset = SIMULATE_PRESETS[0];
    assert.ok(preset);

    const maliciousReport = runDeterministicSimulation({
      elfUrl: "https://example.com/prog.elf?q=*/;hack/*",
      targetZkvm: preset.targetZkvm,
      stdin: "0x1234",
      singleRun: false,
      jobId: "job*/attack/*comment",
      programId: "prog*/attack",
    });

    const sepoliaSol = generateSolidityRequesterCode(maliciousReport, "sepolia");
    assert.match(sepoliaSol, /onlyOwner/);
    assert.match(sepoliaSol, /transferFrom/);
    assert.match(sepoliaSol, /withdrawEscrow/);
    assert.match(sepoliaSol, /address\(0\)/);
    // Malicious NatSpec comment breakout payload must not survive raw.
    assert.equal(sepoliaSol.includes("job*/attack"), false);
    assert.equal(sepoliaSol.includes("?q=*/"), false);

    const mainnetSol = generateSolidityRequesterCode(maliciousReport, "mainnet");
    // Mainnet 43111 must guard staged router vs zero/placeholder address instead of reusing Sepolia router.
    assert.match(mainnetSol, /43111/);
    assert.match(mainnetSol, /address\(0\)/);

    const viemScriptOdd = generateViemSubmitterScript(maliciousReport, "sepolia", "0x123");
    assert.match(viemScriptOdd, /defineChain/);
    assert.equal(viemScriptOdd.includes("./hemi-chain"), false);
    assert.equal(viemScriptOdd.includes("./hemiprove-abi"), false);
    // Odd-length 0x123 must be encoded safely via toHex("0x123"), never cast raw as Hex.
    assert.match(viemScriptOdd, /toHex\("0x123"\)/);

    const viemScriptEven = generateViemSubmitterScript(maliciousReport, "sepolia", "0x1234");
    assert.match(viemScriptEven, /"0x1234" as Hex/);
  });

  it("includes OpenVM exe/vm commitment encoding when targeting OpenVM", () => {
    const openvmPreset = SIMULATE_PRESETS.find((p) =>
      String(p.targetZkvm).toLowerCase().includes("openvm"),
    );
    if (openvmPreset) {
      const report = runDeterministicSimulation({
        elfUrl: openvmPreset.elfUrl,
        targetZkvm: openvmPreset.targetZkvm,
        stdin: openvmPreset.stdin,
        singleRun: false,
      });
      const openvmSol = generateSolidityRequesterCode(report, "sepolia");
      assert.match(openvmSol, /abi\.encode\(/);
      assert.match(openvmSol, /appExeCommit/);
      assert.match(openvmSol, /appVmCommit/);
    }
  });
});

describe("marketplace-data", () => {
  it("computes consistent baseline KPIs from rendered demo jobs and handles empty state", () => {
    const now = 1_760_000_000_000;
    const jobs = buildBaselineJobs("sepolia", now);
    assert.ok(jobs.length > 0);

    const kpis = buildBaselineKpis("sepolia", jobs, null);
    assert.ok(Number.isFinite(kpis.totalPaidHemi));

    const emptyKpis = buildBaselineKpis("sepolia", [], 0);
    assert.equal(emptyKpis.totalPaidHemi, 0);

    const undeployedLive = buildLiveKpis(false, null, null, []);
    assert.equal(undeployedLive.totalJobs, 0);

    const deployedLive = buildLiveKpis(true, 12, 42.5, jobs);
    assert.equal(deployedLive.totalJobs, 12);
    assert.equal(deployedLive.totalPaidHemi, 42.5);
  });
});
