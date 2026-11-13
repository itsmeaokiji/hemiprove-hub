import {
  encodeAbiParameters,
  encodeEventTopics,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { PROOF_SYSTEMS } from "@/lib/hemi-chain";
import { HEMI_PROVE_ROUTER_ABI } from "@/lib/hemiprove-abi";
import type { BlockscoutLogItem } from "@/lib/marketplace-events";

const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export const TEST_JOB_ID =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
export const TEST_PROGRAM_ID =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;
export const TEST_CALLER =
  "0x1111111111111111111111111111111111111111" as Address;
export const TEST_PROVER =
  "0x2222222222222222222222222222222222222222" as Address;
export const TEST_SUBMIT_TX =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Hex;
export const TEST_FULFILL_TX =
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as Hex;

function flattenTopics(
  topics: ReadonlyArray<string | string[] | null>
): Array<string | null> {
  return topics.map((t) => (Array.isArray(t) ? (t[0] ?? null) : t));
}

export function buildMockBlockscoutRouterLogs(): BlockscoutLogItem[] {
  const fulfillTopics = encodeEventTopics({
    abi: HEMI_PROVE_ROUTER_ABI,
    eventName: "JobFulfilled",
    args: {
      jobId: TEST_JOB_ID,
      prover: TEST_PROVER,
      caller: TEST_CALLER,
    },
  });
  const fulfillData = encodeAbiParameters(
    [
      { name: "settledPrice", type: "uint96" },
      { name: "bonusAmount", type: "uint96" },
      { name: "proverPayout", type: "uint256" },
      { name: "callerRefund", type: "uint256" },
      { name: "protocolFee", type: "uint256" },
      { name: "speedBonus", type: "uint256" },
      { name: "actualCycles", type: "uint64" },
      { name: "publicValues", type: "bytes" },
    ],
    [
      parseEther("6.25"),
      BigInt(0),
      parseEther("6.1"),
      parseEther("3.75"),
      parseEther("0.15"),
      BigInt(0),
      BigInt(51_380_224),
      "0x1234",
    ]
  );

  const claimTopics = encodeEventTopics({
    abi: HEMI_PROVE_ROUTER_ABI,
    eventName: "JobClaimed",
    args: {
      jobId: TEST_JOB_ID,
      prover: TEST_PROVER,
      operator: TEST_PROVER,
    },
  });
  const claimData = encodeAbiParameters(
    [
      { name: "settledPrice", type: "uint96" },
      { name: "bonusAmount", type: "uint96" },
      { name: "lockDeadline", type: "uint40" },
    ],
    [parseEther("6.25"), BigInt(0), 1_760_001_000]
  );

  const submitTopics = encodeEventTopics({
    abi: HEMI_PROVE_ROUTER_ABI,
    eventName: "JobSubmitted",
    args: {
      jobId: TEST_JOB_ID,
      proofSystemId: PROOF_SYSTEMS.RISC_ZERO_GROTH16_V1.id as Hex,
      caller: TEST_CALLER,
    },
  });
  const submitData = encodeAbiParameters(
    [
      { name: "programId", type: "bytes32" },
      { name: "descriptorHash", type: "bytes32" },
      { name: "depositedAmount", type: "uint96" },
      { name: "minPrice", type: "uint96" },
      { name: "maxPrice", type: "uint96" },
      { name: "fulfillmentTimeout", type: "uint40" },
      { name: "trust", type: "uint8" },
    ],
    [
      TEST_PROGRAM_ID,
      ZERO_HASH,
      parseEther("10"),
      parseEther("2"),
      parseEther("10"),
      300,
      1,
    ]
  );

  return [
    {
      topics: flattenTopics(fulfillTopics),
      data: fulfillData,
      transaction_hash: TEST_FULFILL_TX,
      block_number: 7_185_020,
      block_timestamp: "2026-11-13T00:00:42.500Z",
    },
    {
      topics: flattenTopics(claimTopics),
      data: claimData,
      transaction_hash:
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      block_number: 7_185_010,
      block_timestamp: "2026-11-13T00:00:15.000Z",
    },
    {
      topics: flattenTopics(submitTopics),
      data: submitData,
      transaction_hash: TEST_SUBMIT_TX,
      block_number: 7_185_000,
      block_timestamp: "2026-11-13T00:00:00.000Z",
    },
  ];
}
