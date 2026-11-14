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
  generateZkMinerCliScript,
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
import { HEMI_PROVE_ROUTER_ABI } from "@/lib/hemiprove-abi";
import {
  computeSettlementDurationSecs,
  extractRouterEventsFromBlockscoutLogs,
} from "@/lib/marketplace-events";
import {
  buildMockBlockscoutRouterLogs,
  TEST_FULFILL_TX,
  TEST_JOB_ID,
  TEST_PROVER,
  TEST_SUBMIT_TX,
} from "@/lib/__tests__/mock-logs";
import {
  KECCAK_CHARGE_PER_REQUEST,
  mergeCliSimulateReport,
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

    const parsedMzkop = parseZkMinerBenchmark(blendedCli, { msrpUsd: 1599 });
    assert.equal(parsedMzkop.ok, true);
    assert.equal(parsedMzkop.entry?.zkops, 12_400_000);
    assert.equal(parsedMzkop.entry?.msrpUsd, 1599);
    assert.equal(parsedMzkop.entry?.starkRateCyclesPerSec, 10_000_000);
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

    const cliScript = generateZkMinerCliScript(maliciousReport, "sepolia", "0x1234", true);
    assert.match(cliScript, /zkminer simulate/);
    assert.match(cliScript, /--single/);
    assert.match(cliScript, /zkminer benchmark --json/);
    assert.match(cliScript, /zkminer prove/);
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

  it("merges upstream zkminer simulate Report JSON fields and recomputes derived sizing metrics", () => {
    const base = runDeterministicSimulation({
      elfUrl: SIMULATE_PRESETS[1].elfUrl,
      targetZkvm: "risc0",
      stdin: SIMULATE_PRESETS[1].stdin,
      singleRun: false,
    });

    const merged = mergeCliSimulateReport(base, {
      schema: 1,
      outcome: "measured",
      retryable: false,
      programCheck: "image_id",
      programCheckSecs: 0.19,
      cycles: "157286400",
      userCycles: 142000000,
      keccakCycles: 4194304,
      po2: 20,
      sizeCheck: "same",
      sysRandRule: "risc0-public-v3",
      hostInput: false,
      hostInputReads: 0,
      inputBytes: 128,
      elfBytes: 1500000,
      sdkVersion: "risc0-zkvm 3.0.6",
    });

    assert.equal(merged.executionEngine, "zkminer-cli-binary");
    assert.equal(merged.sizeCheck, "consistent");
    assert.equal(merged.cycles, "157286400");
    assert.equal(merged.guestCycles, "142000000");
    assert.equal(merged.keccakCharges, "4194304");
    assert.equal(merged.keccakRequests, 4);
    assert.equal(merged.paddingCycles, String(157286400 - 142000000 - 4194304));
    assert.equal(merged.inputBytes, 128);
    assert.equal(merged.vramTierRecommendation.minVramGb, 24);
    assert.equal(merged.segmentAudit?.length, 7);

    // Non-measured CLI outcome without cycles falls back cleanly to deterministic model with diagnostic warning
    const fallback = mergeCliSimulateReport(base, {
      schema: 1,
      outcome: "no_worker",
      retryable: true,
      reason: "no risc0 measure worker configured",
    });
    assert.equal(fallback.executionEngine, "deterministic-analyzer");
    assert.equal(fallback.cycles, base.cycles);
    assert.ok(fallback.warnings.some((w) => w.includes('outcome="no_worker"')));
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

describe("marketplace-events & expanded HemiProveRouter ABI", () => {
  it("exposes extended HemiProveRouter convenience, batch, slash, grace, and view ABIs", () => {
    assert.equal(HEMI_PROVE_ROUTER_ABI[0].name, "JobSubmitted");
    assert.equal(HEMI_PROVE_ROUTER_ABI[1].name, "JobClaimed");
    assert.equal(HEMI_PROVE_ROUTER_ABI[3].name, "JobFulfilled");

    const abiNames = new Set<string>(HEMI_PROVE_ROUTER_ABI.map((entry) => entry.name));
    const expected = [
      "submitJobSimple",
      "submitJobBatch",
      "claimJobDelegated",
      "claimAndFulfillAssigned",
      "fulfillJobHashed",
      "slashAndReopen",
      "slashAndClaim",
      "graceRelease",
      "graceReleaseWithDescriptor",
      "gracePauseRelease",
      "getJobExtras",
      "getJobSnapshots",
      "SlashExecutedCancelDeferred",
      "GraceReleased",
      "GracePauseReleased",
    ];
    for (const name of expected) {
      assert.ok(abiNames.has(name), `Missing ABI definition for ${name}`);
    }
  });

  it("computes positive settlement durations and guards invalid timestamps", () => {
    assert.equal(
      computeSettlementDurationSecs(
        "2026-11-13T00:00:00.000Z",
        "2026-11-13T00:00:42.500Z"
      ),
      42.5
    );
    assert.equal(
      computeSettlementDurationSecs(
        "2026-11-13T00:00:42.500Z",
        "2026-11-13T00:00:00.000Z"
      ),
      undefined
    );
    assert.equal(computeSettlementDurationSecs("bad-date", "2026-11-13T00:00:10Z"), undefined);
  });

  it("correlates JobSubmitted, JobClaimed, and JobFulfilled Blockscout logs", () => {
    const items = buildMockBlockscoutRouterLogs();
    const extracted = extractRouterEventsFromBlockscoutLogs(items);

    assert.equal(extracted.submittedCandidates.length, 1);
    assert.equal(extracted.submittedCandidates[0]?.txHash, TEST_SUBMIT_TX);

    const jobKey = TEST_JOB_ID.toLowerCase();
    const claim = extracted.claimsByJobId.get(jobKey);
    const fulfill = extracted.fulfillmentsByJobId.get(jobKey);

    assert.equal(claim?.prover.toLowerCase(), TEST_PROVER.toLowerCase());
    assert.equal(fulfill?.actualCycles, 51_380_224);
    assert.equal(fulfill?.txHash, TEST_FULFILL_TX);

    const secs = computeSettlementDurationSecs(
      extracted.submittedCandidates[0]?.blockTimestamp,
      fulfill?.blockTimestamp
    );
    assert.equal(secs, 42.5);
  });
});
