import { parseAbi } from "viem";

/**
 * Exact HemiProve v2 ABI extracted from `hemilabs/zk-miner/hemiprove-abi/HemiProveRouter.abi.json`,
 * `HemiProveStaking.abi.json`, `HemiProveRegistry.abi.json`, and `ProgramRegistry.abi.json`
 * (zkmarket @ c8333aa, deployed on Hemi Sepolia 743111 on 2026-10-29).
 *
 * `HemiProve` is a diamond-lite router at a single stable proxy address that delegatecalls to
 * 5 audited facets: Core, Fulfill, FulfillCycle, Aux, and AuxGov.
 */
const JOB_DESCRIPTOR_COMPONENTS = [
  { name: "programId", type: "bytes32" },
  { name: "proofSystemId", type: "bytes32" },
  { name: "callbackContract", type: "address" },
  { name: "assignedProver", type: "address" },
  { name: "tag", type: "bytes32" },
  { name: "inputData", type: "bytes" },
  { name: "callbackExtraData", type: "bytes" },
  { name: "extraVerifierData", type: "bytes" },
  { name: "expectedJournalHash", type: "bytes32" },
  { name: "journalFields", type: "bytes32" },
] as const;

const HASHED_DESCRIPTOR_COMPONENTS = [
  { name: "programId", type: "bytes32" },
  { name: "proofSystemId", type: "bytes32" },
  { name: "callbackContract", type: "address" },
  { name: "assignedProver", type: "address" },
  { name: "tag", type: "bytes32" },
  { name: "inputDataHash", type: "bytes32" },
  { name: "expectedJournalHash", type: "bytes32" },
  { name: "journalFields", type: "bytes32" },
] as const;

const AUCTION_CONFIG_COMPONENTS = [
  { name: "minPrice", type: "uint96" },
  { name: "maxPrice", type: "uint96" },
  { name: "rampUpPeriod", type: "uint40" },
  { name: "curveType", type: "uint8" },
  { name: "fulfillmentTimeout", type: "uint40" },
  { name: "lockCollateralBps", type: "uint96" },
  { name: "speedPremium", type: "uint96" },
  { name: "exclusivityDuration", type: "uint40" },
  { name: "callbackGasLimit", type: "uint32" },
  { name: "excludeFromEwma", type: "bool" },
  { name: "laxCallbackMode", type: "bool" },
] as const;

const CYCLE_CONFIG_COMPONENTS = [
  { name: "expectedCycles", type: "uint64" },
  { name: "cycleCommitCollateral", type: "uint96" },
  { name: "snapshotMode", type: "uint8" },
  { name: "snapshotToleranceBps", type: "uint16" },
  { name: "snapshotFullBonusOvershootBps", type: "uint16" },
  { name: "snapshotUndershootPenaltyBps", type: "uint16" },
  { name: "snapshotFullPenaltyUndershootBps", type: "uint16" },
  { name: "snapshotResolverRewardBps", type: "uint16" },
] as const;

const BID_CONFIG_COMPONENTS = [
  { name: "underbidWindow", type: "uint40" },
  { name: "maxBiddingDuration", type: "uint40" },
  { name: "maxBidExtension", type: "uint40" },
  { name: "minBidDecrement", type: "uint96" },
  { name: "bidExtensionCurveType", type: "uint8" },
] as const;

export const HEMI_PROVE_ROUTER_ABI = [
  // ─── Core Facet Events ─────────────────────────────────────────────────────
  {
    type: "event",
    name: "JobSubmitted",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "proofSystemId", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "programId", type: "bytes32", indexed: false },
      { name: "descriptorHash", type: "bytes32", indexed: false },
      { name: "depositedAmount", type: "uint96", indexed: false },
      { name: "minPrice", type: "uint96", indexed: false },
      { name: "maxPrice", type: "uint96", indexed: false },
      { name: "fulfillmentTimeout", type: "uint40", indexed: false },
      { name: "trust", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobClaimed",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "prover", type: "address", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "settledPrice", type: "uint96", indexed: false },
      { name: "bonusAmount", type: "uint96", indexed: false },
      { name: "lockDeadline", type: "uint40", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PayoutCredited",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "jobId", type: "bytes32", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  // ─── Fulfill & Lifecycle Events ────────────────────────────────────────────
  {
    type: "event",
    name: "JobFulfilled",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "prover", type: "address", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "settledPrice", type: "uint96", indexed: false },
      { name: "bonusAmount", type: "uint96", indexed: false },
      { name: "proverPayout", type: "uint256", indexed: false },
      { name: "callerRefund", type: "uint256", indexed: false },
      { name: "protocolFee", type: "uint256", indexed: false },
      { name: "speedBonus", type: "uint256", indexed: false },
      { name: "actualCycles", type: "uint64", indexed: false },
      { name: "publicValues", type: "bytes", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobReleased",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "prover", type: "address", indexed: true },
      { name: "penaltyAmount", type: "uint256", indexed: false },
      { name: "newBonusAmount", type: "uint96", indexed: false },
      { name: "timeHeld", type: "uint256", indexed: false },
      { name: "operator", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobReopened",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "slashedProver", type: "address", indexed: true },
      { name: "slashCaller", type: "address", indexed: true },
      { name: "slashedAmount", type: "uint128", indexed: false },
      { name: "keeperReward", type: "uint256", indexed: false },
      { name: "burnedAmount", type: "uint256", indexed: false },
      { name: "newBonusAmount", type: "uint96", indexed: false },
      { name: "reopenCount", type: "uint8", indexed: false },
      { name: "newRampUpStart", type: "uint40", indexed: false },
      { name: "elapsedAtLock", type: "uint40", indexed: false },
      { name: "operator", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobCancelled",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "refundAmount", type: "uint256", indexed: false },
      { name: "bonusBurned", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SlashExecutedCancelDeferred",
    inputs: [{ name: "jobId", type: "bytes32", indexed: true }],
  },
  {
    type: "event",
    name: "GraceReleased",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "prover", type: "address", indexed: true },
      { name: "proofSystemId", type: "bytes32", indexed: false },
      { name: "releasedCollateral", type: "uint128", indexed: false },
      { name: "operator", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "GracePauseReleased",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "prover", type: "address", indexed: true },
      { name: "releasedCollateral", type: "uint128", indexed: false },
      { name: "operator", type: "address", indexed: false },
    ],
  },

  // ─── Core & Convenience Submission Functions ───────────────────────────────
  {
    type: "function",
    name: "submitJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "descriptor", type: "tuple", components: JOB_DESCRIPTOR_COMPONENTS },
      { name: "config", type: "tuple", components: AUCTION_CONFIG_COMPONENTS },
      { name: "cycleConfig", type: "tuple", components: CYCLE_CONFIG_COMPONENTS },
      { name: "bidConfig", type: "tuple", components: BID_CONFIG_COMPONENTS },
    ],
    outputs: [{ name: "jobId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "submitJobDefault",
    stateMutability: "nonpayable",
    inputs: [
      { name: "programId", type: "bytes32" },
      { name: "proofSystemId", type: "bytes32" },
      { name: "inputData", type: "bytes" },
      { name: "callbackContract", type: "address" },
      { name: "expectedJournalHash", type: "bytes32" },
      { name: "journalFields", type: "bytes32" },
    ],
    outputs: [{ name: "jobId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "submitJobSimple",
    stateMutability: "nonpayable",
    inputs: [
      { name: "descriptor", type: "tuple", components: JOB_DESCRIPTOR_COMPONENTS },
      { name: "presetName", type: "bytes32" },
    ],
    outputs: [{ name: "jobId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "submitJobBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "descriptors", type: "tuple[]", components: JOB_DESCRIPTOR_COMPONENTS },
      { name: "configs", type: "tuple[]", components: AUCTION_CONFIG_COMPONENTS },
      { name: "cycleConfigs_", type: "tuple[]", components: CYCLE_CONFIG_COMPONENTS },
      { name: "bidConfigs_", type: "tuple[]", components: BID_CONFIG_COMPONENTS },
    ],
    outputs: [{ name: "jobIds", type: "bytes32[]" }],
  },

  // ─── Claim, Fulfillment, Release & Slash Functions ─────────────────────────
  {
    type: "function",
    name: "claimJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "priceFloor", type: "uint96" },
      { name: "premiumFloor", type: "uint96" },
    ],
    outputs: [{ name: "price", type: "uint96" }],
  },
  {
    type: "function",
    name: "claimJobDelegated",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "prover", type: "address" },
      { name: "priceFloor", type: "uint96" },
      { name: "premiumFloor", type: "uint96" },
    ],
    outputs: [{ name: "price", type: "uint96" }],
  },
  {
    type: "function",
    name: "claimAndFulfillAssigned",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "priceFloor", type: "uint96" },
      { name: "premiumFloor", type: "uint96" },
      { name: "descriptor", type: "tuple", components: JOB_DESCRIPTOR_COMPONENTS },
      { name: "publicValues", type: "bytes" },
      { name: "proofBytes", type: "bytes" },
    ],
    outputs: [{ name: "price", type: "uint96" }],
  },
  {
    type: "function",
    name: "fulfillJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "descriptor", type: "tuple", components: JOB_DESCRIPTOR_COMPONENTS },
      { name: "publicValues", type: "bytes" },
      { name: "proofBytes", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fulfillJobHashed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "hashedDesc", type: "tuple", components: HASHED_DESCRIPTOR_COMPONENTS },
      { name: "callbackExtraData", type: "bytes" },
      { name: "extraVerifierData", type: "bytes" },
      { name: "publicValues", type: "bytes" },
      { name: "proofBytes", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "releaseJob",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "graceRelease",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "graceReleaseWithDescriptor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "descriptor", type: "tuple", components: JOB_DESCRIPTOR_COMPONENTS },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "gracePauseRelease",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "slashAndReopen",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "slashAndClaim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "priceFloor", type: "uint96" },
    ],
    outputs: [{ name: "price", type: "uint96" }],
  },
  {
    type: "function",
    name: "cancelJob",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [],
  },

  // ─── Aux & FulfillCycle View Functions ─────────────────────────────────────
  {
    type: "function",
    name: "jobIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint48" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "totalPaidToProvers",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MIN_COLLATERAL_AMOUNT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getCurrentPrice",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint96" }],
  },
  {
    type: "function",
    name: "getJobExtras",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [
      { name: "pauseCredit", type: "uint256" },
      { name: "pauseBase", type: "uint40" },
      { name: "assignedOnly", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getJobSnapshots",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [
      { name: "releasePenaltyBps", type: "uint256" },
      { name: "minCollateral", type: "uint256" },
      { name: "collateralBps", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getJobStatusView",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [
      {
        name: "view_",
        type: "tuple",
        components: [
          { name: "status", type: "uint8" },
          { name: "caller", type: "address" },
          { name: "prover", type: "address" },
          { name: "currentAuctionPrice", type: "uint96" },
          { name: "depositedAmount", type: "uint96" },
          { name: "bonusAmount", type: "uint96" },
          { name: "settledPrice", type: "uint96" },
          { name: "speedPremium", type: "uint96" },
          { name: "lockDeadline", type: "uint40" },
          { name: "timeRemaining", type: "uint40" },
          { name: "auctionTimeElapsed", type: "uint40" },
          { name: "rampUpPeriod", type: "uint40" },
          { name: "reopenCount", type: "uint8" },
          { name: "callbackRejections", type: "uint8" },
          { name: "proofSystemId", type: "bytes32" },
          { name: "descriptorHash", type: "bytes32" },
          { name: "currentBidder", type: "address" },
          { name: "currentBid", type: "uint96" },
          { name: "bidDeadline", type: "uint40" },
          { name: "expectedCycles", type: "uint64" },
          { name: "verifierTrust", type: "uint8" },
          { name: "slashOpensAt", type: "uint40" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getProofNonce",
    stateMutability: "view",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "prover", type: "address" },
    ],
    outputs: [
      { name: "nonce", type: "uint256" },
      { name: "limbs", type: "uint32[4]" },
    ],
  },
  {
    type: "function",
    name: "suggestPriceRange",
    stateMutability: "view",
    inputs: [
      { name: "proofSystemId", type: "bytes32" },
      { name: "programId", type: "bytes32" },
    ],
    outputs: [
      { name: "suggestedMin", type: "uint96" },
      { name: "suggestedMax", type: "uint96" },
      { name: "stale", type: "bool" },
    ],
  },
] as const;

export const HEMI_PROVE_STAKING_ABI = parseAbi([
  "event Staked(address indexed prover, uint128 amount, uint128 newTotal)",
  "function stake(address prover, uint128 amount) external",
  "function requestUnstake(uint128 amount) external",
  "function withdrawUnstaked() external",
  "function getAvailableCollateral(address prover) external view returns (uint128)",
  "function getProverStake(address prover) external view returns ((uint128 totalStaked, uint128 lockedCollateral, uint128 unstakeAmount, uint40 unstakeRequestTime, uint40 depositBlock))",
  "function getProverStats(address prover) external view returns ((uint64 jobsFulfilled, uint64 jobsSlashed, uint64 jobsReleased, uint96 totalEarned, uint40 firstFulfillmentAt, uint40 lastFulfillmentAt))",
]);

export const PROGRAM_REGISTRY_ABI = [
  {
    type: "function",
    name: "getProgram",
    stateMutability: "view",
    inputs: [{ name: "programId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "programId", type: "bytes32" },
          { name: "proofSystemId", type: "bytes32" },
          { name: "familyId", type: "bytes32" },
          { name: "registrant", type: "address" },
          { name: "registeredAt", type: "uint40" },
          { name: "status", type: "uint8" },
          { name: "successorProgramId", type: "bytes32" },
          {
            name: "resources",
            type: "tuple",
            components: [
              { name: "estimatedCycles", type: "uint64" },
              { name: "peakMemoryBytes", type: "uint64" },
              { name: "estimatedWallTimeS", type: "uint32" },
            ],
          },
          { name: "name", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getStorageURIs",
    stateMutability: "view",
    inputs: [{ name: "programId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "storageType", type: "uint8" },
          { name: "uri", type: "string" },
          { name: "contentHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "registerProgram",
    stateMutability: "nonpayable",
    inputs: [
      { name: "programId", type: "bytes32" },
      { name: "proofSystemId", type: "bytes32" },
      { name: "familyId", type: "bytes32" },
      {
        name: "resources",
        type: "tuple",
        components: [
          { name: "estimatedCycles", type: "uint64" },
          { name: "peakMemoryBytes", type: "uint64" },
          { name: "estimatedWallTimeS", type: "uint32" },
        ],
      },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "inputSchemaURI", type: "string" },
      {
        name: "initialURIs",
        type: "tuple[]",
        components: [
          { name: "storageType", type: "uint8" },
          { name: "uri", type: "string" },
          { name: "contentHash", type: "bytes32" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = parseAbi([
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
]);
