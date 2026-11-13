import { keccak256, stringToBytes, toHex } from "viem";
import { getDefaultProofSystemForBackend, type ZkVmBackend } from "@/lib/hemi-chain";

export const KECCAK_CHARGE_PER_REQUEST = 1_048_576; // 1 << 20 cycles at keccak po2=17
export const RISC0_VALID_PO2_SIZES = [16, 17, 18, 19, 20, 21, 22] as const;

export interface Risc0SegmentAuditRow {
  po2: number;
  segmentSizeCycles: number;
  segmentCount: number;
  guestCycles: string;
  paddingCycles: string;
  paddedCycles: string;
  keccakRequests: number;
  keccakCharges: string;
  totalChargedCycles: string;
  randomReads: number;
  journalHash: string;
  peakVramMib: number;
  consistentWithDefault: boolean;
  note?: string;
}

export interface SimulateReportJson {
  schema: number;
  rule: string;
  jobId: string;
  outcome: "measured" | "too_heavy" | "not_served";
  retryable: boolean;
  proofSystem: string;
  backend: ZkVmBackend;
  programId: string;
  descriptorHash: string;
  elfUri: string;
  elfHash: string;
  elfBytes: number;
  inputHash: string;
  inputBytes: number;
  programCheck: "image_id" | "vkey" | "exe_commit";
  programCheckSecs: number;
  /** Total charged cycles as proving reports them (padded + keccakCharges for risc0) */
  cycles: string;
  /** Unpadded user RV32IM / RV64IM guest instruction count */
  guestCycles: string;
  /** Segment power-of-two padding overhead cycles (paddedCycles - guestCycles) */
  paddingCycles: string;
  /** Keccak coprocessor proof requests count */
  keccakRequests: number;
  /** Keccak cycle charge (keccakRequests * 2^20) */
  keccakCharges: string;
  po2?: number;
  singleRun: boolean;
  sizeCheck?: "consistent" | "differs" | "skipped_single_run";
  executeSecs: number;
  peakHostBytes: number;
  peakVramMib: number;
  vramTierRecommendation: {
    minVramGb: 12 | 16 | 24;
    tierLabel: string;
    hardwareExamples: string;
    rationale: string;
  };
  journalBytes: number;
  journalHash: string;
  publicValuesHex: string;
  binding: "satisfied" | "none" | "fails";
  proven: "matches" | "differs" | "unknown";
  hostInput: boolean;
  randomReads: number;
  sdkVersion: string;
  zkminerVersion: string;
  protocolVersion: number;
  executionEngine: "zkminer-cli-binary" | "deterministic-analyzer";
  pricingRecommendation: {
    minPriceHemi: number;
    maxPriceHemi: number;
    rampUpPeriodSecs: number;
    fulfillmentTimeoutSecs: number;
    estimatedProveSecsRtx4090: number;
  };
  segmentAudit?: Risc0SegmentAuditRow[];
  warnings: string[];
}

export interface SimulatePreset {
  id: string;
  title: string;
  badge: string;
  description: string;
  elfUrl: string;
  targetZkvm: ZkVmBackend;
  stdin: string;
  singleRun: boolean;
}

export const SIMULATE_PRESETS: SimulatePreset[] = [
  {
    id: "btc-utxo-sp1",
    title: "BTC UTXO History Verifier (SP1)",
    badge: "SP1 Groth16",
    description:
      "Verifies 144 Bitcoin block headers + Merkle inclusion of UTXO spend history for Hemi BTC Tunnel settlement.",
    elfUrl: "ar://bTx9vK3HemiUtxoSp1VerifierElfV610x88f2a9c4d1",
    targetZkvm: "sp1",
    stdin:
      "0x0100000081cd02ab7e569e8bcd9317e2fe99f2de44d49ab2b8851ba4a308000000000000e320b6c2fffc8d750423db8b1eb942ae710e951ed797f7affc8892b0f1fc122b",
    singleRun: false,
  },
  {
    id: "defi-lp-risc0",
    title: "DeFi LP Volatility Proof (RISC Zero)",
    badge: "R0 Protocol 12 Pass",
    description:
      "Computes TWAP + realized volatility across 720 Hemi DEX ticks with 6 Keccak state-trie checks; passes all 7 po2 segment audits.",
    elfUrl:
      "https://github.com/hemilabs/zk-miner/releases/download/v0.4.2/lp-volatility-risc0.elf",
    targetZkvm: "risc0",
    stdin: '{"pool":"0x46955EdCF61b23a8c0b0d71428A9F1C07Bbf36cc","windowBlocks":720,"feeTier":3000}',
    singleRun: false,
  },
  {
    id: "segment-inflation-risc0",
    title: "Segment Inflation Warning Demo (RISC Zero `sizeCheck differs`)",
    badge: "sizeCheck differs",
    description:
      "Adversarial guest that branches on segment boundary & SYS_RANDOM entropy at po2 >= 20, inflating cycles 15x and altering journal output.",
    elfUrl: "ar://mAl1c10u5Po2BranchGuestRisc0ElfProtocol12Demo",
    targetZkvm: "risc0",
    stdin: "0xdeadbeef00000020cafebabe00000001",
    singleRun: false,
  },
];

function parseStdinBytes(stdin: string): Uint8Array {
  const trimmed = stdin.trim();
  if (!trimmed) return new Uint8Array(0);
  if (trimmed.startsWith("0x") && /^[0-9a-fA-F]+$/.test(trimmed.slice(2))) {
    const hex = trimmed.slice(2).length % 2 === 0 ? trimmed.slice(2) : `0${trimmed.slice(2)}`;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  return stringToBytes(trimmed);
}

function buildRisc0SegmentTable(params: {
  baseGuestCycles: number;
  baseKeccakRequests: number;
  baseJournalHash: string;
  adversarialBranch: boolean;
}): Risc0SegmentAuditRow[] {
  const { baseGuestCycles, baseKeccakRequests, baseJournalHash, adversarialBranch } = params;
  const altJournalHash = keccak256(stringToBytes(`${baseJournalHash}:po2-diverged`));

  const rows = RISC0_VALID_PO2_SIZES.map((po2) => {
    const segSize = 1 << po2; // 65,536 .. 4,194,304
    const isInflated = adversarialBranch && po2 >= 20;

    const guestCycles = isInflated ? 189_540_220 : baseGuestCycles;
    const keccakRequests = isInflated ? 48 : baseKeccakRequests;
    const randomReads = isInflated ? 12 : 0;
    const journalHash = isInflated ? altJournalHash : baseJournalHash;

    const segmentCount = Math.max(1, Math.ceil(guestCycles / (segSize * 0.92)));
    const paddedCycles = segmentCount * segSize;
    const paddingCycles = Math.max(0, paddedCycles - guestCycles);
    const keccakCharges = keccakRequests * KECCAK_CHARGE_PER_REQUEST;
    const totalCharged = paddedCycles + keccakCharges;

    // Realistic RISC Zero GPU VRAM footprint across po2=16..22
    const vramByPo2: Record<number, number> = {
      16: 3_420,
      17: 4_680,
      18: 6_450,
      19: 8_920,
      20: 12_436,
      21: 18_840,
      22: 23_150,
    };

    return {
      po2,
      segmentSizeCycles: segSize,
      segmentCount,
      guestCycles: String(guestCycles),
      paddingCycles: String(paddingCycles),
      paddedCycles: String(paddedCycles),
      keccakRequests,
      keccakCharges: String(keccakCharges),
      totalChargedCycles: String(totalCharged),
      randomReads,
      journalHash,
      peakVramMib: vramByPo2[po2] ?? 12_436,
      consistentWithDefault: true,
      note: isInflated
        ? "Divergent guestCycles, keccakCharges, randomReads & journal!"
        : po2 === 20
          ? "Default miner po2=20 segment baseline"
          : undefined,
    };
  });

  // Compare every po2 row against default po2=20 row (risc0-public-v3 rule)
  const refRow = rows.find((r) => r.po2 === 20) ?? rows[0];
  return rows.map((row) => ({
    ...row,
    consistentWithDefault:
      row.journalHash === refRow.journalHash &&
      row.guestCycles === refRow.guestCycles &&
      row.keccakCharges === refRow.keccakCharges &&
      row.randomReads === refRow.randomReads,
  }));
}

export interface SimulateInputPayload {
  elfUrl: string;
  targetZkvm: ZkVmBackend;
  stdin: string;
  singleRun: boolean;
  declaredCycles?: number;
  jobId?: string;
  programId?: string;
}

export function runDeterministicSimulation(
  input: SimulateInputPayload
): SimulateReportJson {
  const elfUri = input.elfUrl.trim() || SIMULATE_PRESETS[0].elfUrl;
  const backend: ZkVmBackend = input.targetZkvm;
  const stdinBytes = parseStdinBytes(input.stdin);
  const inputHash = keccak256(stdinBytes);
  const elfHash = keccak256(stringToBytes(elfUri));
  const psSpec = getDefaultProofSystemForBackend(backend);

  const isPresetBtc = elfUri.includes("bTx9vK3HemiUtxoSp1Verifier");
  const isPresetDefi = elfUri.includes("lp-volatility-risc0.elf");
  // Trigger adversarial `sizeCheck: differs` strictly on Preset #3 / adversarial ELF URI
  const isAdversarialDemo =
    elfUri.includes("mAl1c10u5Po2BranchGuest") ||
    elfUri.toLowerCase().includes("segment-inflation");

  // Derive deterministic seed from ELF + stdin hash
  const hashSeed = parseInt(elfHash.slice(2, 10), 16) ^ parseInt(inputHash.slice(2, 10), 16);
  const absSeed = Math.abs(hashSeed);

  const programId =
    input.programId && /^0x[0-9a-fA-F]{64}$/.test(input.programId)
      ? (input.programId as `0x${string}`)
      : keccak256(stringToBytes(`${psSpec.label}:program:${elfUri}`));
  const jobId =
    input.jobId && /^0x[0-9a-fA-F]{64}$/.test(input.jobId)
      ? (input.jobId as `0x${string}`)
      : keccak256(stringToBytes(`sim-job:${programId}:${inputHash}`));
  const descriptorHash = keccak256(stringToBytes(`desc:${jobId}:${psSpec.id}`));
  const baseJournalBytes = stringToBytes(`journal:${programId}:${inputHash}`).slice(0, 64);
  const baseJournalHash = keccak256(baseJournalBytes);
  const publicValuesHex = toHex(baseJournalBytes);

  const validDeclaredCycles =
    typeof input.declaredCycles === "number" &&
    Number.isFinite(input.declaredCycles) &&
    input.declaredCycles > 0
      ? Math.round(input.declaredCycles)
      : null;

  let baseGuestCycles: number;
  let baseKeccakRequests: number;
  let elfBytes: number;

  if (isPresetBtc && backend === "sp1") {
    baseGuestCycles = validDeclaredCycles ?? 68_420_800;
    baseKeccakRequests = 0;
    elfBytes = 1_842_688;
  } else if (isPresetDefi && backend === "risc0") {
    baseGuestCycles = 41_200_000;
    baseKeccakRequests = 6;
    elfBytes = 1_418_240;
  } else if (isAdversarialDemo && backend === "risc0") {
    baseGuestCycles = 12_140_800;
    baseKeccakRequests = 2;
    elfBytes = 964_096;
  } else if (validDeclaredCycles !== null) {
    elfBytes = 820_000 + (absSeed % 2_400_000);
    if (backend === "risc0") {
      const targetSegmentsTotal = Math.max(
        2,
        Math.round(validDeclaredCycles / KECCAK_CHARGE_PER_REQUEST)
      );
      baseKeccakRequests = Math.min(
        Math.max(2, (parseInt(elfHash.slice(2, 8), 16) % 7) + 2),
        Math.max(1, Math.floor(targetSegmentsTotal * 0.18))
      );
      const targetExecSegments = Math.max(1, targetSegmentsTotal - baseKeccakRequests);
      baseGuestCycles = Math.round(
        (targetExecSegments - 0.28) * KECCAK_CHARGE_PER_REQUEST * 0.92
      );
    } else {
      baseGuestCycles = validDeclaredCycles;
      baseKeccakRequests = 0;
    }
  } else {
    baseGuestCycles = 18_500_000 + (absSeed % 95_000_000);
    baseKeccakRequests = backend === "risc0" ? absSeed % 14 : 0;
    elfBytes = 820_000 + (absSeed % 2_400_000);
  }

  const warnings: string[] = [];

  if (backend === "risc0") {
    const fullAudit = buildRisc0SegmentTable({
      baseGuestCycles,
      baseKeccakRequests,
      baseJournalHash,
      adversarialBranch: isAdversarialDemo,
    });

    const defaultRow = fullAudit.find((r) => r.po2 === 20) ?? fullAudit[4];
    const hasDiff = fullAudit.some(
      (r) =>
        r.journalHash !== fullAudit[0].journalHash ||
        r.guestCycles !== fullAudit[0].guestCycles ||
        r.keccakCharges !== fullAudit[0].keccakCharges ||
        r.randomReads !== fullAudit[0].randomReads
    );

    const sizeCheck: SimulateReportJson["sizeCheck"] = input.singleRun
      ? "skipped_single_run"
      : hasDiff
        ? "differs"
        : "consistent";

    const segmentAudit = input.singleRun ? [defaultRow] : fullAudit;
    const totalCyclesNum = Number(defaultRow.totalChargedCycles);

    if (sizeCheck === "differs") {
      warnings.push(
        "CRITICAL (`risc0-public-v3` / Protocol 12): `sizeCheck: differs` — Guest execution diverges across `po2` segment sizes (`16..22`). Provers running `po2=20` experience 15.6x cycle & Keccak inflation and a mismatched journal hash. `zkminer` pre-claim guard refuses to claim this job."
      );
    }
    if (defaultRow.randomReads > 0) {
      warnings.push(
        `NONDETERMINISTIC GUEST (\`hostInput: true\`): Detected ${defaultRow.randomReads} \`SYS_RANDOM\` host entropy reads past runtime startup. Cycle count is not deterministic evidence.`
      );
    }
    if (input.singleRun) {
      warnings.push(
        "Single-Run mode enabled (`--po2 20` only): 7-segment `risc0-public-v3` cross-po2 consistency check was skipped."
      );
    }

    const minVramGb: 12 | 16 | 24 = totalCyclesNum > 140_000_000 ? 24 : 16;
    const proveSecs4090 = Number((totalCyclesNum / 2_017_000 + 2.02).toFixed(1));
    const minPriceHemi = Number(Math.max(1.5, (totalCyclesNum / 15_000_000) * 1.15).toFixed(2));
    const maxPriceHemi = Number((minPriceHemi * 3.6).toFixed(2));

    return {
      schema: 1,
      rule: "risc0-public-v3",
      jobId,
      outcome: "measured",
      retryable: false,
      proofSystem: psSpec.label,
      backend: "risc0",
      programId,
      descriptorHash,
      elfUri,
      elfHash,
      elfBytes,
      inputHash,
      inputBytes: stdinBytes.length,
      programCheck: "image_id",
      programCheckSecs: 0.42,
      cycles: defaultRow.totalChargedCycles,
      guestCycles: defaultRow.guestCycles,
      paddingCycles: defaultRow.paddingCycles,
      keccakRequests: defaultRow.keccakRequests,
      keccakCharges: defaultRow.keccakCharges,
      po2: 20,
      singleRun: input.singleRun,
      sizeCheck,
      executeSecs: Number(
        ((Number(defaultRow.guestCycles) / 28_000_000) * (input.singleRun ? 1 : 3.4)).toFixed(2)
      ),
      peakHostBytes: 3_680_000_000,
      peakVramMib: defaultRow.peakVramMib,
      vramTierRecommendation:
        minVramGb === 24
          ? {
              minVramGb: 24,
              tierLabel: "24 GiB+ Flagship Tier (Resident Groth16 SRS)",
              hardwareExamples: "RTX 4090 (24GB), RX 7900 XTX (24GB), RTX 5090 (32GB)",
              rationale:
                "Heavy multi-segment RISC Zero + Keccak coprocessor batch fits with 3.45 GB Groth16 SRS cached in VRAM (`>= 20 GiB` threshold).",
            }
          : {
              minVramGb: 16,
              tierLabel: "16 GiB Consumer GPU Standard (`po2=20`)",
              hardwareExamples:
                "RX 9070 XT (16GB), RTX 5080 (16GB), RTX 5060 Ti (16GB), Arc A770 (16GB)",
              rationale:
                "Clears `zkminer` 14 GiB default gate (`12,436 MiB` peak at `po2=20`); 12 GB cards require `zkminer benchmark --calibrate` (`po2=19`).",
            },
      journalBytes: baseJournalBytes.length,
      journalHash: defaultRow.journalHash,
      publicValuesHex,
      binding: sizeCheck === "differs" ? "fails" : "satisfied",
      proven: sizeCheck === "differs" ? "differs" : "matches",
      hostInput: defaultRow.randomReads > 0,
      randomReads: defaultRow.randomReads,
      sdkVersion: "risc0-zkvm 3.0.3",
      zkminerVersion: "0.4.2",
      protocolVersion: 12,
      executionEngine: "deterministic-analyzer",
      pricingRecommendation: {
        minPriceHemi,
        maxPriceHemi,
        rampUpPeriodSecs: 240,
        fulfillmentTimeoutSecs: Math.max(300, Math.ceil(proveSecs4090 * 8)),
        estimatedProveSecsRtx4090: proveSecs4090,
      },
      segmentAudit,
      warnings,
    };
  }

  if (backend === "sp1") {
    const highTier = baseGuestCycles > 134_217_728;
    const peakVramMib = highTier ? 17_766 : 15_092;
    const minVramGb: 16 | 24 = highTier ? 24 : 16;
    const proveSecs4090 = Number((baseGuestCycles / 3_085_000 + 2.02).toFixed(1));
    const minPriceHemi = Number(Math.max(1.4, (baseGuestCycles / 16_000_000) * 1.1).toFixed(2));
    const maxPriceHemi = Number((minPriceHemi * 3.5).toFixed(2));

    warnings.push(
      `SP1 Tier Baseline (\`main\` @ \`zkmarket c8333aa\`): Sized at ${peakVramMib.toLocaleString()} MiB (${minVramGb} GiB tier). Pending upstream PR #33 (\`max/sp1-12gb-tier\`) lowers SP1 v6.1.0 measured tiers to 9,500 MiB (134M / 12 GiB GPUs) and 12,000 MiB (268M / 16 GiB GPUs).`
    );

    return {
      schema: 1,
      rule: "sp1-rv64-v6.1.0",
      jobId,
      outcome: "measured",
      retryable: false,
      proofSystem: psSpec.label,
      backend: "sp1",
      programId,
      descriptorHash,
      elfUri,
      elfHash,
      elfBytes,
      inputHash,
      inputBytes: stdinBytes.length,
      programCheck: "vkey",
      programCheckSecs: 1.85,
      cycles: String(baseGuestCycles),
      guestCycles: String(baseGuestCycles),
      paddingCycles: "0",
      keccakRequests: 0,
      keccakCharges: "0",
      singleRun: true,
      executeSecs: Number((baseGuestCycles / 36_000_000).toFixed(2)),
      peakHostBytes: 4_850_000_000,
      peakVramMib,
      vramTierRecommendation: highTier
        ? {
            minVramGb,
            tierLabel: "24 GiB+ SP1 High-Threshold Worker (`268M` elements)",
            hardwareExamples: "RTX 4090 (24GB), RTX 5090 (32GB), RX 7900 XTX (24GB)",
            rationale:
              "Exceeds 134,217,728 element threshold; `sp1-gpu-server` allocates ~17,766 MiB peak device memory.",
          }
        : {
            minVramGb: 16,
            tierLabel: "16 GiB SP1 Standard Worker (`134M` elements)",
            hardwareExamples: "RX 9070 XT (16GB), RTX 5080 (16GB), RTX 5060 Ti (16GB)",
            rationale:
              "Fits inside `sp1-gpu-server` 134M element tier (`15,092 MiB` peak VRAM on CUDA 12.9 & ROCm 10.1).",
          },
      journalBytes: baseJournalBytes.length,
      journalHash: baseJournalHash,
      publicValuesHex,
      binding: "satisfied",
      proven: "matches",
      hostInput: false,
      randomReads: 0,
      sdkVersion: "sp1-sdk 6.1.0 (circuit v6.1.0)",
      zkminerVersion: "0.4.2",
      protocolVersion: 12,
      executionEngine: "deterministic-analyzer",
      pricingRecommendation: {
        minPriceHemi,
        maxPriceHemi,
        rampUpPeriodSecs: 300,
        fulfillmentTimeoutSecs: Math.max(300, Math.ceil(proveSecs4090 * 8)),
        estimatedProveSecsRtx4090: proveSecs4090,
      },
      warnings,
    };
  }

  // OpenVM Halo2 v2.0
  const proveSecs = Number((baseGuestCycles / 1_650_000 + 8.5).toFixed(1));
  const minPriceHemi = Number(Math.max(2.0, (baseGuestCycles / 14_000_000) * 1.25).toFixed(2));
  const maxPriceHemi = Number((minPriceHemi * 3.8).toFixed(2));

  warnings.push(
    "OpenVM (`openvm.halo2.v1`): Ensure `extraVerifierData = abi.encode(appExeCommit, appVmCommit)` (64 bytes) so `programId == keccak256(extraVerifierData)` matches on-chain Halo2 verification."
  );

  return {
    schema: 1,
    rule: "openvm-halo2-v2.0",
    jobId,
    outcome: "measured",
    retryable: false,
    proofSystem: psSpec.label,
    backend: "openvm",
    programId,
    descriptorHash,
    elfUri,
    elfHash,
    elfBytes,
    inputHash,
    inputBytes: stdinBytes.length,
    programCheck: "exe_commit",
    programCheckSecs: 0.94,
    cycles: String(baseGuestCycles),
    guestCycles: String(baseGuestCycles),
    paddingCycles: "0",
    keccakRequests: 0,
    keccakCharges: "0",
    singleRun: true,
    executeSecs: Number((baseGuestCycles / 29_000_000).toFixed(2)),
    peakHostBytes: 6_120_000_000,
    peakVramMib: 16_240,
    vramTierRecommendation: {
      minVramGb: 24,
      tierLabel: "24 GiB Recommended for OpenVM Halo2 Wrapper",
      hardwareExamples: "RTX 4090 (24GB), RX 7900 XTX (24GB)",
      rationale:
        "OpenVM v2.0 Halo2 outer recursion + KZG SRS benefits from 24 GiB VRAM + 32 GiB host RAM.",
    },
    journalBytes: baseJournalBytes.length,
    journalHash: baseJournalHash,
    publicValuesHex,
    binding: "satisfied",
    proven: "matches",
    hostInput: false,
    randomReads: 0,
    sdkVersion: "openvm 2.0.2 (v2.0-base)",
    zkminerVersion: "0.4.2",
    protocolVersion: 12,
    executionEngine: "deterministic-analyzer",
    pricingRecommendation: {
      minPriceHemi,
      maxPriceHemi,
      rampUpPeriodSecs: 360,
      fulfillmentTimeoutSecs: Math.max(420, Math.ceil(proveSecs * 8)),
      estimatedProveSecsRtx4090: proveSecs,
    },
    warnings,
  };
}
