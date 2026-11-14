import { decodeEventLog, type Address, type Hex } from "viem";
import { HEMI_PROVE_ROUTER_ABI } from "@/lib/hemiprove-abi";

export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export interface RawSubmittedCandidate {
  jobId: Hex;
  proofSystemId: Hex;
  caller: Address;
  programId: Hex;
  minPrice?: bigint;
  maxPrice?: bigint;
  txHash?: string;
  blockNumber?: bigint;
  blockTimestamp?: string;
}

export interface ClaimedEventMeta {
  prover: Address;
  settledPrice?: bigint;
  txHash?: string;
  blockNumber?: bigint;
  blockTimestamp?: string;
}

export interface FulfilledEventMeta {
  prover: Address;
  settledPrice?: bigint;
  proverPayout?: bigint;
  actualCycles?: number;
  txHash?: string;
  blockNumber?: bigint;
  blockTimestamp?: string;
}

export interface BlockscoutLogItem {
  data?: string;
  topics?: Array<string | null>;
  transaction_hash?: string;
  tx_hash?: string;
  block_number?: number | string;
  block_timestamp?: string;
}

export function parseBlockNumber(raw: unknown): bigint | undefined {
  if (typeof raw === "bigint" && raw >= BigInt(0)) return raw;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
    return BigInt(raw);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed) || /^0x[0-9a-fA-F]+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
  }
  return undefined;
}

export function parseTimestampMs(raw?: string): number | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/**
 * Computes positive elapsed settlement time (in seconds, 0.1s precision) between
 * `JobSubmitted` and `JobFulfilled` block timestamps.
 */
export function computeSettlementDurationSecs(
  submittedAtIso?: string,
  fulfilledAtIso?: string
): number | undefined {
  const startMs = parseTimestampMs(submittedAtIso);
  const endMs = parseTimestampMs(fulfilledAtIso);
  if (startMs === undefined || endMs === undefined || endMs <= startMs) {
    return undefined;
  }
  const diffSecs = Number(((endMs - startMs) / 1_000).toFixed(1));
  return diffSecs > 0 ? diffSecs : undefined;
}

export function toSafeCycleNumber(raw?: bigint): number | undefined {
  if (raw === undefined || raw <= BigInt(0)) return undefined;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(raw > maxSafe ? maxSafe : raw);
}

function isNewerEventLog(
  candidateBlock?: bigint,
  candidateTimestamp?: string,
  existingBlock?: bigint,
  existingTimestamp?: string
): boolean {
  if (candidateBlock !== undefined && existingBlock !== undefined) {
    return candidateBlock > existingBlock;
  }
  const candMs = parseTimestampMs(candidateTimestamp);
  const existMs = parseTimestampMs(existingTimestamp);
  if (candMs !== undefined && existMs !== undefined) {
    return candMs > existMs;
  }
  return false;
}

/**
 * Decodes `JobSubmitted`, `JobClaimed`, and `JobFulfilled` logs returned by Blockscout v2
 * so live jobs can correlate claim/settlement latency and actual fulfilled cycles.
 */
export function extractRouterEventsFromBlockscoutLogs(
  items: BlockscoutLogItem[],
  maxSubmitted = 36
): {
  submittedCandidates: RawSubmittedCandidate[];
  claimsByJobId: Map<string, ClaimedEventMeta>;
  fulfillmentsByJobId: Map<string, FulfilledEventMeta>;
} {
  const submittedCandidates: RawSubmittedCandidate[] = [];
  const seenSubmitted = new Set<string>();
  const claimsByJobId = new Map<string, ClaimedEventMeta>();
  const fulfillmentsByJobId = new Map<string, FulfilledEventMeta>();

  for (const item of items) {
    if (!item.data || !item.data.startsWith("0x") || !Array.isArray(item.topics)) {
      continue;
    }
    const validTopics = item.topics.filter(
      (t): t is Hex => typeof t === "string" && t.startsWith("0x")
    );
    if (validTopics.length === 0) continue;

    try {
      const decoded = decodeEventLog({
        abi: HEMI_PROVE_ROUTER_ABI,
        data: item.data as Hex,
        topics: validTopics as [Hex, ...Hex[]],
        strict: false,
      });

      const txHash = item.transaction_hash ?? item.tx_hash;
      const blockNumber = parseBlockNumber(item.block_number);

      if (decoded.eventName === "JobSubmitted") {
        const args = decoded.args as {
          jobId?: Hex;
          proofSystemId?: Hex;
          caller?: Address;
          programId?: Hex;
          minPrice?: bigint;
          maxPrice?: bigint;
        };
        if (!args.jobId || !args.proofSystemId || !args.caller) continue;
        const lowerId = args.jobId.toLowerCase();
        if (seenSubmitted.has(lowerId)) continue;
        seenSubmitted.add(lowerId);
        if (submittedCandidates.length < maxSubmitted) {
          submittedCandidates.push({
            jobId: args.jobId,
            proofSystemId: args.proofSystemId,
            caller: args.caller,
            programId: (args.programId ?? ZERO_BYTES32) as Hex,
            minPrice: args.minPrice,
            maxPrice: args.maxPrice,
            txHash,
            blockNumber,
            blockTimestamp: item.block_timestamp,
          });
        }
      } else if (decoded.eventName === "JobClaimed") {
        const args = decoded.args as {
          jobId?: Hex;
          prover?: Address;
          settledPrice?: bigint;
        };
        if (!args.jobId || !args.prover) continue;
        const lowerId = args.jobId.toLowerCase();
        const existingClaim = claimsByJobId.get(lowerId);
        if (
          !existingClaim ||
          isNewerEventLog(
            blockNumber,
            item.block_timestamp,
            existingClaim.blockNumber,
            existingClaim.blockTimestamp
          )
        ) {
          claimsByJobId.set(lowerId, {
            prover: args.prover,
            settledPrice: args.settledPrice,
            txHash,
            blockNumber,
            blockTimestamp: item.block_timestamp,
          });
        }
      } else if (decoded.eventName === "JobFulfilled") {
        const args = decoded.args as {
          jobId?: Hex;
          prover?: Address;
          settledPrice?: bigint;
          proverPayout?: bigint;
          actualCycles?: bigint;
        };
        if (!args.jobId || !args.prover) continue;
        const lowerId = args.jobId.toLowerCase();
        const existingFulfill = fulfillmentsByJobId.get(lowerId);
        if (
          !existingFulfill ||
          isNewerEventLog(
            blockNumber,
            item.block_timestamp,
            existingFulfill.blockNumber,
            existingFulfill.blockTimestamp
          )
        ) {
          fulfillmentsByJobId.set(lowerId, {
            prover: args.prover,
            settledPrice: args.settledPrice,
            proverPayout: args.proverPayout,
            actualCycles: toSafeCycleNumber(args.actualCycles),
            txHash,
            blockNumber,
            blockTimestamp: item.block_timestamp,
          });
        }
      }
    } catch {
      // Unrelated event signature on router proxy; ignore and continue scanning
    }
  }

  return { submittedCandidates, claimsByJobId, fulfillmentsByJobId };
}
