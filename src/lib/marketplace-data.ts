import {
  PROOF_SYSTEMS,
  computeEscalatingOffer,
  type HemiNetworkKey,
  type ZkVmBackend,
} from "@/lib/hemi-chain";

export type JobStatusLabel = "Open" | "Claimed" | "Verified";
export type RequesterType = "Smart Contract" | "EOA";
export type ElfSourceType = "Arweave" | "GitHub Release" | "IPFS";

export interface MarketplaceJob {
  jobId: string;
  shortNumericId: number;
  programName: string;
  programFamily: string;
  requester: string;
  requesterLabel?: string;
  requesterType: RequesterType;
  zkvm: ZkVmBackend;
  proofSystemId: string;
  proofSystemLabel: string;
  multiProofGroup?: string; // e.g. "2-of-3 Threshold #418"
  elfSourceType: ElfSourceType;
  elfUri: string;
  programId: string;
  minOfferHemi: number;
  maxOfferHemi: number;
  currentOfferHemi: number;
  settledPriceHemi?: number;
  rampUpPeriodSecs: number;
  elapsedSecs: number;
  curveType: 0 | 1; // 0 = Linear, 1 = Quadratic
  expectedCycles: number;
  status: JobStatusLabel;
  proverAddress: string | null;
  proverGpuHint?: string;
  settlementSecs?: number;
  submittedAtIso: string;
  txHash?: string;
  isSimulatedStream?: boolean;
}

export interface MarketplaceKpis {
  totalJobs: number;
  activeAuctions: number;
  proofsVerified: number;
  avgSettlementSecs: number;
  activeProvers: number;
  totalPaidHemi: number;
  diversitySplit: {
    risc0: number;
    sp1: number;
    openvm: number;
    multiProofBundles: number;
  };
}

export interface MarketplaceApiResponse {
  network: HemiNetworkKey;
  chainId: number;
  deployed: boolean;
  rpcConnected: boolean;
  blockscoutConnected: boolean;
  latestBlock: string | null;
  routerAddress: string | null;
  routerPaused: boolean;
  onChainJobIndex: number | null;
  totalPaidHemiOnChain: number | null;
  usingSimulatedFallback: boolean;
  fetchedAtIso: string;
  liveKpis: MarketplaceKpis;
  kpis: MarketplaceKpis;
  onChainJobs: MarketplaceJob[];
  jobs: MarketplaceJob[];
}

export function detectElfSource(uri: string): ElfSourceType {
  const lower = uri.toLowerCase();
  if (lower.startsWith("ar://") || lower.includes("arweave.net")) {
    return "Arweave";
  }
  if (lower.startsWith("ipfs://") || lower.includes("/ipfs/")) {
    return "IPFS";
  }
  return "GitHub Release";
}

export function buildBaselineJobs(
  network: HemiNetworkKey,
  nowMs = Date.now()
): MarketplaceJob[] {
  const baseIndex = network === "sepolia" ? 1420 : 8940;

  const rawTemplates: Omit<MarketplaceJob, "currentOfferHemi" | "submittedAtIso">[] = [
    {
      jobId: "0x8f21c9d431a8e09b77145dc2e819a03b54fa9210c78d1b4e2f90a6d438c705b1",
      shortNumericId: baseIndex + 8,
      programName: "HemiBtcTunnelHeaderVerifier",
      programFamily: "hemi.tunnel.btc-headers.v2",
      requester: "0x7A4c90D8E42f891b6C1E3208924dB5301f30E9A2",
      requesterLabel: "BtcTunnelSettlement.sol",
      requesterType: "Smart Contract",
      zkvm: "sp1",
      proofSystemId: PROOF_SYSTEMS.SP1_GROTH16_V1.id,
      proofSystemLabel: PROOF_SYSTEMS.SP1_GROTH16_V1.label,
      multiProofGroup: "2-of-3 Threshold #419",
      elfSourceType: "Arweave",
      elfUri: "ar://bTx9vK3HemiUtxoSp1VerifierElfV610x88f2a9c4d1",
      programId: "0x00519fd84c17a9b23e08f41d76c91ab34f209d117720ae93d184bc019f6a4102",
      minOfferHemi: 4.5,
      maxOfferHemi: 18.0,
      rampUpPeriodSecs: 300,
      elapsedSecs: 174,
      curveType: 0,
      expectedCycles: 68_420_800,
      status: "Open",
      proverAddress: null,
      txHash: "0x4e79c1129a8f5e03b210489d2f71c4a0b83e9f120048a7b6c5d12e8a90f31b24",
      isSimulatedStream: true,
    },
    {
      jobId: "0x3c94a802f71d5b6e0123a89d4e7f61209c8a4b5d6e7f8091a2b3c4d5e6f70892",
      shortNumericId: baseIndex + 7,
      programName: "HemiBtcTunnelHeaderVerifier",
      programFamily: "hemi.tunnel.btc-headers.v2",
      requester: "0x7A4c90D8E42f891b6C1E3208924dB5301f30E9A2",
      requesterLabel: "BtcTunnelSettlement.sol",
      requesterType: "Smart Contract",
      zkvm: "risc0",
      proofSystemId: PROOF_SYSTEMS.RISC_ZERO_GROTH16_V1.id,
      proofSystemLabel: PROOF_SYSTEMS.RISC_ZERO_GROTH16_V1.label,
      multiProofGroup: "2-of-3 Threshold #419",
      elfSourceType: "Arweave",
      elfUri: "https://arweave.net/Tx8kR0BtcHeaderGuestV302HemiAudit91f3c2d8e4a",
      programId: "0x9d41e820f7b3a10c5582d49e17b06a3f8821c4e9d0a5b731f62e84c901a7b3f5",
      minOfferHemi: 5.0,
      maxOfferHemi: 20.0,
      rampUpPeriodSecs: 300,
      elapsedSecs: 218,
      curveType: 0,
      expectedCycles: 74_448_896,
      status: "Open",
      proverAddress: null,
      txHash: "0x9a10b4c8e2d7f6315049a8b7c6d5e4f3a210987654321fedcba9876543210ab4",
      isSimulatedStream: true,
    },
    {
      jobId: "0xa17f6e23c9084d15b62e8903f41a7c2d8e9b0f123456789abcdef01234567803",
      shortNumericId: baseIndex + 6,
      programName: "OxygenCrossMarginSolvency",
      programFamily: "oxygen.margin.audit.v1",
      requester: "0x29F18d4C07bE6521A94e8C31d0B742f5E119A84C",
      requesterLabel: "OxygenConsumer.sol",
      requesterType: "Smart Contract",
      zkvm: "risc0",
      proofSystemId: PROOF_SYSTEMS.RISC_ZERO_GROTH16_V1.id,
      proofSystemLabel: PROOF_SYSTEMS.RISC_ZERO_GROTH16_V1.label,
      elfSourceType: "GitHub Release",
      elfUri:
        "https://github.com/hemilabs/zk-miner/releases/download/v0.4.2/lp-volatility-risc0.elf",
      programId: "0x52c8b910e4a7f31289d06c4b5a1e78f92301d4c6b8a9f012e3d4c5b6a79801d2",
      minOfferHemi: 3.2,
      maxOfferHemi: 14.5,
      settledPriceHemi: 9.84,
      rampUpPeriodSecs: 240,
      elapsedSecs: 141,
      curveType: 1,
      expectedCycles: 51_380_224,
      status: "Claimed",
      proverAddress: "0x94D281E7c6B0f4A31952D8e47C1A60f82B3E5109",
      proverGpuHint: "AMD RX 9070 XT (ROCm 10.1)",
      txHash: "0x72d4e8f1a09b3c56781234ef90ab12cd34ef567890abcdef1234567890abcd12",
      isSimulatedStream: true,
    },
    {
      jobId: "0x6d05e18b4a92c7f31048d6e2a9b5c1f70823e4d5c6b7a890123456789abcde04",
      shortNumericId: baseIndex + 5,
      programName: "OpenVmHalo2BatchAggregator",
      programFamily: "hemi.openvm.batch-rollup.v2",
      requester: "0xD81a43F9b027E61C4890A3d2F5b71E9c0482A671",
      requesterType: "EOA",
      zkvm: "openvm",
      proofSystemId: PROOF_SYSTEMS.OPENVM_HALO2_V1.id,
      proofSystemLabel: PROOF_SYSTEMS.OPENVM_HALO2_V1.label,
      multiProofGroup: "2-of-3 Threshold #418",
      elfSourceType: "Arweave",
      elfUri: "ar://oVm2Halo2AppExeCommitHemiRollupBatchV202x77c1",
      programId: "0x7c19e04a82b5d3f61904c8e2a7b1d5f93028c4e6a1b9d7f35042c8e1a6b3d904",
      minOfferHemi: 6.0,
      maxOfferHemi: 24.0,
      rampUpPeriodSecs: 360,
      elapsedSecs: 112,
      curveType: 0,
      expectedCycles: 92_100_000,
      status: "Open",
      proverAddress: null,
      txHash: "0x18f9e2d3c4b5a697880123456789abcdef0123456789abcdef0123456789ab05",
      isSimulatedStream: true,
    },
    {
      jobId: "0x4b82d19e7f03a6c51289e4d7b0a3c6f9182736455463728190abcdef12345605",
      shortNumericId: baseIndex + 4,
      programName: "HashChainEpochCheckpoint",
      programFamily: "hemi.consensus.hashchain.v1",
      requester: "0x5E12c8A940f3D71B6298E4a0C1d5F8b32904E71B",
      requesterLabel: "HashChainConsumer.sol",
      requesterType: "Smart Contract",
      zkvm: "sp1",
      proofSystemId: PROOF_SYSTEMS.SP1_GROTH16_V1.id,
      proofSystemLabel: PROOF_SYSTEMS.SP1_GROTH16_V1.label,
      elfSourceType: "GitHub Release",
      elfUri:
        "https://github.com/hemilabs/zk-miner/releases/download/v0.4.2/sha256-chain-sp1.elf",
      programId: "0x31a8f04e92c7b5d16083e4a9c2b7d0f518293a4b5c6d7e8f90123456789abc06",
      minOfferHemi: 7.5,
      maxOfferHemi: 22.0,
      settledPriceHemi: 13.42,
      rampUpPeriodSecs: 300,
      elapsedSecs: 122,
      curveType: 0,
      expectedCycles: 213_000_000,
      status: "Verified",
      proverAddress: "0xF108a9C3e72D41b68590E2f4A7c1D8e93025B64A",
      proverGpuHint: "NVIDIA RTX 4090 (CUDA 12.9)",
      settlementSecs: 46.8,
      txHash: "0x55a9c3e1d7f082b461928374655647382910abcdef1234567890abcdef123407",
      isSimulatedStream: true,
    },
    {
      jobId: "0x91e4c7a2d8f053b6192837465091a2b3c4d5e6f708192a3b4c5d6e7f8091a206",
      shortNumericId: baseIndex + 3,
      programName: "EcdsaBatchTxSignatureProof",
      programFamily: "hemi.aa.secp256k1-batch.v1",
      requester: "0xB390e1D4a82C75f61049B8e2D3a6F9c10284E53D",
      requesterType: "EOA",
      zkvm: "risc0",
      proofSystemId: PROOF_SYSTEMS.RISC_ZERO_GROTH16_V1.id,
      proofSystemLabel: PROOF_SYSTEMS.RISC_ZERO_GROTH16_V1.label,
      elfSourceType: "Arweave",
      elfUri: "ar://eCdSa8BatchVerifyRisc0V302GuestHemi901a4f7b2e",
      programId: "0x84d2b6f091a3e7c52048d9b1e6a3f7c0293847566574839201abcdef12345608",
      minOfferHemi: 2.0,
      maxOfferHemi: 9.0,
      settledPriceHemi: 4.85,
      rampUpPeriodSecs: 180,
      elapsedSecs: 73,
      curveType: 0,
      expectedCycles: 29_360_128,
      status: "Verified",
      proverAddress: "0x62C7d4E9a10F83b52941C7e0B8d2A5f91306D42E",
      proverGpuHint: "NVIDIA RTX 5080 (CUDA 12.9)",
      settlementSecs: 19.4,
      txHash: "0x88b1d4f7a2c903e651829374650192837465abcdef0123456789abcdef012309",
      isSimulatedStream: true,
    },
    {
      jobId: "0x27c9f04e81b3d6a59012e4f7c8a1b3d5e7f90123456789abcdef012345678907",
      shortNumericId: baseIndex + 2,
      programName: "OPSuccinctFaultDisputeStep",
      programFamily: "hemi.rollup.fault-proof.v2",
      requester: "0x14A8e9C2b70D53f68192C4e0A9b3D7f52018E63C",
      requesterLabel: "DisputeGameFactory.sol",
      requesterType: "Smart Contract",
      zkvm: "sp1",
      proofSystemId: PROOF_SYSTEMS.SP1_PLONK_V1.id,
      proofSystemLabel: PROOF_SYSTEMS.SP1_PLONK_V1.label,
      multiProofGroup: "2-of-3 Threshold #418",
      elfSourceType: "Arweave",
      elfUri: "https://arweave.net/OpSuccinctFaultGameSp1PlonkV610Hemi44d9a1e7",
      programId: "0x19f3c7e0a4b8d2f65109e3c7a2b6d8f01928374655647382910abcdef123450a",
      minOfferHemi: 5.5,
      maxOfferHemi: 19.5,
      settledPriceHemi: 11.2,
      rampUpPeriodSecs: 240,
      elapsedSecs: 98,
      curveType: 0,
      expectedCycles: 84_200_000,
      status: "Verified",
      proverAddress: "0x94D281E7c6B0f4A31952D8e47C1A60f82B3E5109",
      proverGpuHint: "AMD RX 9070 XT (ROCm 10.1)",
      settlementSecs: 34.2,
      txHash: "0x33e7a9c1f5b802d461928374650192837465abcdef0123456789abcdef01230b",
      isSimulatedStream: true,
    },
    {
      jobId: "0x5e18a3d9c07f42b6819203948576655443322110fedcba9876543210fedcba08",
      shortNumericId: baseIndex + 1,
      programName: "OpenVmStateTransitionProof",
      programFamily: "hemi.openvm.state-root.v2",
      requester: "0x8C02f7A4d91E63b52048F9c1E3b7A5d90214C86F",
      requesterLabel: "L2OutputOracle.sol",
      requesterType: "Smart Contract",
      zkvm: "openvm",
      proofSystemId: PROOF_SYSTEMS.OPENVM_HALO2_V1.id,
      proofSystemLabel: PROOF_SYSTEMS.OPENVM_HALO2_V1.label,
      elfSourceType: "GitHub Release",
      elfUri:
        "https://github.com/hemilabs/zk-miner/releases/download/v0.4.2/openvm-halo2-state.bin",
      programId: "0x66e2a8c4f019b7d35284e1a9c6b0d4f8293847566574839201abcdef1234560c",
      minOfferHemi: 4.8,
      maxOfferHemi: 16.0,
      settledPriceHemi: 9.15,
      rampUpPeriodSecs: 240,
      elapsedSecs: 93,
      curveType: 0,
      expectedCycles: 61_500_000,
      status: "Verified",
      proverAddress: "0x3D81f6C2a90E47b51829D3c7F0a4B8e91205A73B",
      proverGpuHint: "Intel Arc B580 (SYCL 2026.0)",
      settlementSecs: 58.6,
      txHash: "0x99f1c3e5a7b902d461829374650192837465abcdef0123456789abcdef01230d",
      isSimulatedStream: true,
    },
  ];

  return rawTemplates.map((job, idx) => {
    const currentOfferHemi =
      job.status === "Open"
        ? computeEscalatingOffer(
            job.minOfferHemi,
            job.maxOfferHemi,
            job.rampUpPeriodSecs,
            job.elapsedSecs,
            job.curveType
          )
        : job.settledPriceHemi ?? job.maxOfferHemi;

    return {
      ...job,
      currentOfferHemi: Number(currentOfferHemi.toFixed(2)),
      submittedAtIso: new Date(nowMs - (idx + 1) * 95_000).toISOString(),
    };
  });
}

function summarizeJobsMetrics(jobs: MarketplaceJob[]) {
  const activeAuctions = jobs.filter((j) => j.status === "Open").length;
  const proofsVerified = jobs.filter((j) => j.status === "Verified").length;
  const proverSet = new Set(
    jobs
      .map((j) => j.proverAddress?.toLowerCase())
      .filter((addr): addr is string => Boolean(addr))
  );

  const n = jobs.length;
  const r0Count = jobs.filter((j) => j.zkvm === "risc0").length;
  const sp1Count = jobs.filter((j) => j.zkvm === "sp1").length;
  const ovmCount = jobs.filter((j) => j.zkvm === "openvm").length;
  const multiProofCount = jobs.filter((j) => Boolean(j.multiProofGroup)).length;

  let risc0Pct = 0;
  let sp1Pct = 0;
  let openvmPct = 0;

  if (n > 0) {
    risc0Pct = Math.round((r0Count / n) * 100);
    sp1Pct = Math.round((sp1Count / n) * 100);
    openvmPct = ovmCount > 0 ? Math.max(0, 100 - risc0Pct - sp1Pct) : 0;
    if (ovmCount === 0 && risc0Pct + sp1Pct !== 100) {
      if (r0Count >= sp1Count) risc0Pct = 100 - sp1Pct;
      else sp1Pct = 100 - risc0Pct;
    }
  }

  const settlementSamples = jobs
    .map((j) => j.settlementSecs)
    .filter((s): s is number => typeof s === "number" && Number.isFinite(s) && s > 0);
  const avgSettlementSecs =
    settlementSamples.length > 0
      ? Number(
          (
            settlementSamples.reduce((acc, s) => acc + s, 0) / settlementSamples.length
          ).toFixed(1)
        )
      : 0;

  return {
    activeAuctions,
    proofsVerified,
    activeProvers: proverSet.size,
    avgSettlementSecs,
    diversitySplit: {
      risc0: risc0Pct,
      sp1: sp1Pct,
      openvm: openvmPct,
      multiProofBundles: n > 0 ? Math.round((multiProofCount / n) * 100) : 0,
    },
  };
}

/**
 * Strictly real on-chain KPIs for `DATA: LIVE` mode (zero mocked counts).
 */
export function buildLiveKpis(
  deployed: boolean,
  onChainJobIndex: number | null,
  totalPaidHemiOnChain: number | null,
  onChainJobs: MarketplaceJob[]
): MarketplaceKpis {
  if (!deployed) {
    return {
      totalJobs: 0,
      activeAuctions: 0,
      proofsVerified: 0,
      avgSettlementSecs: 0,
      activeProvers: 0,
      totalPaidHemi: 0,
      diversitySplit: {
        risc0: 0,
        sp1: 0,
        openvm: 0,
        multiProofBundles: 0,
      },
    };
  }

  const summary = summarizeJobsMetrics(onChainJobs);

  return {
    totalJobs: onChainJobIndex ?? onChainJobs.length,
    activeAuctions: summary.activeAuctions,
    proofsVerified: summary.proofsVerified,
    avgSettlementSecs: summary.avgSettlementSecs,
    activeProvers: summary.activeProvers,
    totalPaidHemi: Number((totalPaidHemiOnChain ?? 0).toFixed(4)),
    diversitySplit: summary.diversitySplit,
  };
}

/**
 * Computes consistent KPI totals for `DATA: DEMO` directly from the demo/merged jobs slice.
 */
export function buildBaselineKpis(
  _network: HemiNetworkKey,
  demoJobs: MarketplaceJob[],
  totalPaidHemiOnChain: number | null
): MarketplaceKpis {
  const summary = summarizeJobsMetrics(demoJobs);
  const simulatedSettledSum = demoJobs
    .filter((j) => j.isSimulatedStream && j.status === "Verified")
    .reduce((acc, j) => acc + (j.settledPriceHemi ?? 0), 0);

  return {
    totalJobs: demoJobs.length,
    activeAuctions: summary.activeAuctions,
    proofsVerified: summary.proofsVerified,
    avgSettlementSecs: summary.avgSettlementSecs,
    activeProvers: summary.activeProvers,
    totalPaidHemi: Number(((totalPaidHemiOnChain ?? 0) + simulatedSettledSum).toFixed(2)),
    diversitySplit: summary.diversitySplit,
  };
}
