import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  formatUnits,
  http,
  type Address,
  type Hex,
} from "viem";
import {
  HEMIPROVE_DEPLOYMENTS,
  hemiMainnet,
  hemiSepolia,
  resolveProofSystemById,
  type HemiNetworkKey,
} from "@/lib/hemi-chain";
import { HEMI_PROVE_ROUTER_ABI, PROGRAM_REGISTRY_ABI } from "@/lib/hemiprove-abi";
import {
  buildBaselineJobs,
  buildBaselineKpis,
  buildLiveKpis,
  detectElfSource,
  type ElfSourceType,
  type MarketplaceApiResponse,
  type MarketplaceJob,
} from "@/lib/marketplace-data";
import {
  ZERO_BYTES32,
  computeSettlementDurationSecs,
  extractRouterEventsFromBlockscoutLogs,
  toSafeCycleNumber,
  type BlockscoutLogItem,
  type ClaimedEventMeta,
  type FulfilledEventMeta,
  type RawSubmittedCandidate,
} from "@/lib/marketplace-events";

export const dynamic = "force-dynamic";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const MARKETPLACE_CACHE_TTL_MS = 15_000;
const MAX_CANDIDATE_SCAN = 36;
const TARGET_VALID_ONCHAIN_JOBS = 12;
const ENRICH_BATCH_SIZE = 12;
const MAX_BLOCK_TIMESTAMP_LOOKUPS = 12;

interface CachedMarketplaceEntry {
  expiresAtMs: number;
  payload: MarketplaceApiResponse;
}

const marketplaceCache = new Map<string, CachedMarketplaceEntry>();

interface ResolvedProgramMeta {
  name?: string;
  familyLabel?: string;
  estimatedCycles?: number;
  elfUri?: string;
  elfSourceType?: ElfSourceType;
}

function mapStorageType(storageType: number, uri: string): ElfSourceType {
  if (storageType === 0) return "IPFS";
  if (storageType === 1) return "Arweave";
  if (storageType === 2) return detectElfSource(uri);
  return detectElfSource(uri);
}

export async function GET(request: NextRequest) {
  const networkParam = request.nextUrl.searchParams.get("network");
  const modeParam = request.nextUrl.searchParams.get("mode");
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

  const network: HemiNetworkKey = networkParam === "mainnet" ? "mainnet" : "sepolia";
  const mode = modeParam === "live" ? "live" : "demo";
  const cacheKey = `${network}:${mode}`;
  const nowMs = Date.now();

  if (!forceRefresh) {
    const cached = marketplaceCache.get(cacheKey);
    if (cached && cached.expiresAtMs > nowMs) {
      return NextResponse.json(cached.payload, {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        },
      });
    }
  }

  const deployment = HEMIPROVE_DEPLOYMENTS[network];
  const chain = network === "mainnet" ? hemiMainnet : hemiSepolia;
  const snapshotIso = new Date(nowMs).toISOString();

  let rpcConnected = false;
  let blockscoutConnected = false;
  let latestBlock: bigint | null = null;
  let routerPaused = false;
  let onChainJobIndex: number | null = null;
  let totalPaidHemi: number | null = null;
  const onChainJobs: MarketplaceJob[] = [];

  const client = createPublicClient({
    chain,
    transport: http(deployment.rpcUrl, {
      timeout: 4_500,
      retryCount: 0,
    }),
  });

  const rawCandidates: RawSubmittedCandidate[] = [];
  const seenJobIds = new Set<string>();
  const claimsByJobId = new Map<string, ClaimedEventMeta>();
  const fulfillmentsByJobId = new Map<string, FulfilledEventMeta>();

  try {
    const headBlock = await client.getBlockNumber();
    latestBlock = headBlock;
    rpcConnected = true;

    if (deployment.router) {
      const [jobIdxRes, pausedRes, paidRes] = await Promise.allSettled([
        client.readContract({
          address: deployment.router,
          abi: HEMI_PROVE_ROUTER_ABI,
          functionName: "jobIndex",
        }),
        client.readContract({
          address: deployment.router,
          abi: HEMI_PROVE_ROUTER_ABI,
          functionName: "paused",
        }),
        client.readContract({
          address: deployment.router,
          abi: HEMI_PROVE_ROUTER_ABI,
          functionName: "totalPaidToProvers",
        }),
      ]);

      if (jobIdxRes.status === "fulfilled") {
        onChainJobIndex = Number(jobIdxRes.value);
      }
      if (pausedRes.status === "fulfilled") {
        routerPaused = Boolean(pausedRes.value);
      }
      if (paidRes.status === "fulfilled") {
        totalPaidHemi = Number(formatUnits(paidRes.value, 18));
      }

      // 1. Fast RPC scan over the latest 2,000 blocks for JobSubmitted, JobClaimed & JobFulfilled
      const lookbackWindow = BigInt(2_000);
      const windowStart =
        headBlock > lookbackWindow ? headBlock - lookbackWindow : BigInt(0);
      const fromBlock =
        windowStart > deployment.scanFromBlock
          ? windowStart
          : deployment.scanFromBlock;

      if (headBlock >= fromBlock) {
        const [submittedLogs, claimedLogs, fulfilledLogs] = await Promise.all([
          client
            .getLogs({
              address: deployment.router,
              event: HEMI_PROVE_ROUTER_ABI[0],
              fromBlock,
              toBlock: headBlock,
            })
            .catch(() => []),
          client
            .getLogs({
              address: deployment.router,
              event: HEMI_PROVE_ROUTER_ABI[1],
              fromBlock,
              toBlock: headBlock,
            })
            .catch(() => []),
          client
            .getLogs({
              address: deployment.router,
              event: HEMI_PROVE_ROUTER_ABI[3],
              fromBlock,
              toBlock: headBlock,
            })
            .catch(() => []),
        ]);

        for (const log of claimedLogs.slice().reverse()) {
          const args = log.args;
          if (!args.jobId || !args.prover) continue;
          const lowerId = args.jobId.toLowerCase();
          if (!claimsByJobId.has(lowerId)) {
            claimsByJobId.set(lowerId, {
              prover: args.prover,
              settledPrice: args.settledPrice,
              txHash: log.transactionHash ?? undefined,
              blockNumber: log.blockNumber ?? undefined,
            });
          }
        }

        for (const log of fulfilledLogs.slice().reverse()) {
          const args = log.args;
          if (!args.jobId || !args.prover) continue;
          const lowerId = args.jobId.toLowerCase();
          if (!fulfillmentsByJobId.has(lowerId)) {
            fulfillmentsByJobId.set(lowerId, {
              prover: args.prover,
              settledPrice: args.settledPrice,
              proverPayout: args.proverPayout,
              actualCycles: toSafeCycleNumber(args.actualCycles),
              txHash: log.transactionHash ?? undefined,
              blockNumber: log.blockNumber ?? undefined,
            });
          }
        }

        const recentRpcLogs = submittedLogs.slice(-MAX_CANDIDATE_SCAN).reverse();
        for (const log of recentRpcLogs) {
          const args = log.args;
          if (!args.jobId || !args.proofSystemId || !args.caller) continue;
          const lowerId = args.jobId.toLowerCase();
          if (seenJobIds.has(lowerId)) continue;
          seenJobIds.add(lowerId);
          rawCandidates.push({
            jobId: args.jobId,
            proofSystemId: args.proofSystemId,
            caller: args.caller,
            programId: (args.programId ?? ZERO_BYTES32) as Hex,
            minPrice: args.minPrice,
            maxPrice: args.maxPrice,
            txHash: log.transactionHash ?? undefined,
            blockNumber: log.blockNumber ?? undefined,
          });
        }
      }
    }
  } catch {
    rpcConnected = false;
  }

  // 2. Historical Blockscout v2 `/logs` discovery when the 2,000-block RPC window has limited logs
  if (deployment.router && rawCandidates.length < TARGET_VALID_ONCHAIN_JOBS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4_500);
      const res = await fetch(
        `${deployment.blockscoutApiUrl}/addresses/${deployment.router}/logs`,
        { signal: controller.signal, cache: "no-store" }
      );
      clearTimeout(timer);

      if (res.ok) {
        blockscoutConnected = true;
        const json = (await res.json()) as { items?: BlockscoutLogItem[] };
        const items = Array.isArray(json?.items) ? json.items : [];
        const decoded = extractRouterEventsFromBlockscoutLogs(items, MAX_CANDIDATE_SCAN);

        for (const cand of decoded.submittedCandidates) {
          if (rawCandidates.length >= MAX_CANDIDATE_SCAN) break;
          const lowerId = cand.jobId.toLowerCase();
          if (seenJobIds.has(lowerId)) {
            const existing = rawCandidates.find((r) => r.jobId.toLowerCase() === lowerId);
            if (existing && !existing.blockTimestamp && cand.blockTimestamp) {
              existing.blockTimestamp = cand.blockTimestamp;
            }
            continue;
          }
          seenJobIds.add(lowerId);
          rawCandidates.push(cand);
        }

        for (const [jobKey, claim] of decoded.claimsByJobId) {
          const existing = claimsByJobId.get(jobKey);
          if (!existing) {
            claimsByJobId.set(jobKey, claim);
          } else if (!existing.blockTimestamp && claim.blockTimestamp) {
            existing.blockTimestamp = claim.blockTimestamp;
          }
        }

        for (const [jobKey, fulfill] of decoded.fulfillmentsByJobId) {
          const existing = fulfillmentsByJobId.get(jobKey);
          if (!existing) {
            fulfillmentsByJobId.set(jobKey, fulfill);
          } else if (!existing.blockTimestamp && fulfill.blockTimestamp) {
            existing.blockTimestamp = fulfill.blockTimestamp;
          }
        }
      }
    } catch {
      blockscoutConnected = false;
    }
  }

  // 3. Enrich discovered candidates in ordered batches, scanning past Cancelled/None jobs
  if (deployment.router && rawCandidates.length > 0) {
    const routerAddr = deployment.router;
    const programMetaMap = new Map<string, ResolvedProgramMeta>();

    if (rpcConnected && deployment.programRegistry) {
      const progRegistryAddr = deployment.programRegistry;
      const uniqueProgramIds = Array.from(
        new Set(
          rawCandidates
            .map((c) => c.programId)
            .filter((pid) => pid.toLowerCase() !== ZERO_BYTES32)
        )
      );

      await Promise.allSettled(
        uniqueProgramIds.map(async (pid) => {
          const [progRes, urisRes] = await Promise.allSettled([
            client.readContract({
              address: progRegistryAddr,
              abi: PROGRAM_REGISTRY_ABI,
              functionName: "getProgram",
              args: [pid],
            }),
            client.readContract({
              address: progRegistryAddr,
              abi: PROGRAM_REGISTRY_ABI,
              functionName: "getStorageURIs",
              args: [pid],
            }),
          ]);

          const meta: ResolvedProgramMeta = {};

          if (progRes.status === "fulfilled") {
            const prog = progRes.value;
            if (prog.name && prog.name.trim().length > 0) {
              meta.name = prog.name.trim();
            }
            if (
              prog.familyId &&
              prog.familyId.toLowerCase() !== ZERO_BYTES32
            ) {
              meta.familyLabel = `registry.family.${prog.familyId.slice(2, 10)}`;
            }
            if (prog.resources.estimatedCycles > BigInt(0)) {
              meta.estimatedCycles = Number(prog.resources.estimatedCycles);
            }
          }

          if (urisRes.status === "fulfilled" && urisRes.value.length > 0) {
            const firstUri = urisRes.value.find((u) => u.uri && u.uri.trim().length > 0);
            if (firstUri) {
              meta.elfUri = firstUri.uri.trim();
              meta.elfSourceType = mapStorageType(
                Number(firstUri.storageType),
                meta.elfUri
              );
            }
          }

          programMetaMap.set(pid.toLowerCase(), meta);
        })
      );
    }

    const pendingMatchedJobs: Array<{
      job: MarketplaceJob;
      cand: RawSubmittedCandidate;
      fulfillMeta?: FulfilledEventMeta;
    }> = [];

    for (
      let offset = 0;
      offset < rawCandidates.length && pendingMatchedJobs.length < TARGET_VALID_ONCHAIN_JOBS;
      offset += ENRICH_BATCH_SIZE
    ) {
      const batch = rawCandidates.slice(offset, offset + ENRICH_BATCH_SIZE);
      const enrichedBatch = await Promise.all(
        batch.map(async (cand, batchIdx) => {
          const globalIdx = offset + batchIdx;
          const lowerId = cand.jobId.toLowerCase();
          const claimMeta = claimsByJobId.get(lowerId);
          const fulfillMeta = fulfillmentsByJobId.get(lowerId);

          const psSpec = resolveProofSystemById(cand.proofSystemId);
          const minPriceHemi =
            cand.minPrice !== undefined ? Number(formatUnits(cand.minPrice, 18)) : 1.0;
          const maxPriceHemi =
            cand.maxPrice !== undefined
              ? Number(formatUnits(cand.maxPrice, 18))
              : Math.max(minPriceHemi * 2, 10.0);

          let statusLabel: MarketplaceJob["status"] = fulfillMeta
            ? "Verified"
            : claimMeta
              ? "Claimed"
              : "Open";
          let currentOfferHemi = minPriceHemi;
          let settledPriceHemi: number | undefined;
          let proverAddr: string | null =
            fulfillMeta?.prover ?? claimMeta?.prover ?? null;
          let rampUpSecs = 300;
          let elapsedSecs = 60;
          let expectedCycles = 50_000_000;
          let isContract = false;

          if (rpcConnected) {
            const [statusViewRes, codeRes] = await Promise.allSettled([
              client.readContract({
                address: routerAddr,
                abi: HEMI_PROVE_ROUTER_ABI,
                functionName: "getJobStatusView",
                args: [cand.jobId],
              }),
              client.getCode({ address: cand.caller }),
            ]);

            if (statusViewRes.status === "fulfilled") {
              const view = statusViewRes.value;
              // HemiProve JobStatus: 0 = None, 1 = Open, 2 = Claimed, 3 = Fulfilled, 4 = Cancelled
              if (view.status === 0 || view.status === 4) {
                return null;
              }
              if (view.status === 2) statusLabel = "Claimed";
              else if (view.status === 3) statusLabel = "Verified";
              else statusLabel = "Open";

              const auctionPrice = Number(formatUnits(view.currentAuctionPrice, 18));
              const viewSettled = Number(formatUnits(view.settledPrice, 18));
              const eventSettled = fulfillMeta?.settledPrice
                ? Number(formatUnits(fulfillMeta.settledPrice, 18))
                : claimMeta?.settledPrice
                  ? Number(formatUnits(claimMeta.settledPrice, 18))
                  : 0;
              const effectiveSettled = viewSettled > 0 ? viewSettled : eventSettled;

              currentOfferHemi =
                statusLabel === "Open"
                  ? auctionPrice
                  : effectiveSettled > 0
                    ? effectiveSettled
                    : maxPriceHemi;
              if (effectiveSettled > 0) {
                settledPriceHemi = Number(effectiveSettled.toFixed(4));
              }

              if (view.prover && view.prover.toLowerCase() !== ZERO_ADDRESS) {
                proverAddr = view.prover;
              }
              rampUpSecs = Number(view.rampUpPeriod) || 300;
              elapsedSecs = Number(view.auctionTimeElapsed) || 0;
              if (view.expectedCycles > BigInt(0)) {
                expectedCycles = Number(view.expectedCycles);
              }
            }

            isContract =
              codeRes.status === "fulfilled" &&
              Boolean(codeRes.value && codeRes.value !== "0x");
          } else {
            const eventSettled = fulfillMeta?.settledPrice
              ? Number(formatUnits(fulfillMeta.settledPrice, 18))
              : claimMeta?.settledPrice
                ? Number(formatUnits(claimMeta.settledPrice, 18))
                : 0;
            if (eventSettled > 0) {
              settledPriceHemi = Number(eventSettled.toFixed(4));
              currentOfferHemi = eventSettled;
            }
          }

          const progMeta = programMetaMap.get(cand.programId.toLowerCase());
          if (expectedCycles === 50_000_000 && progMeta?.estimatedCycles) {
            expectedCycles = progMeta.estimatedCycles;
          }

          const resolvedElfUri =
            progMeta?.elfUri ?? `ar://program-${cand.programId.slice(2, 26)}`;
          const resolvedElfSource =
            progMeta?.elfSourceType ?? detectElfSource(resolvedElfUri);

          const submittedAtIso = cand.blockTimestamp ?? snapshotIso;
          const job: MarketplaceJob = {
            jobId: cand.jobId,
            shortNumericId: Math.max(
              1,
              (onChainJobIndex ?? rawCandidates.length) - globalIdx
            ),
            programName:
              progMeta?.name ?? `OnChainProgram (${cand.programId.slice(0, 10)})`,
            programFamily: progMeta?.familyLabel ?? "hemiprove.onchain.v2",
            requester: cand.caller as Address,
            requesterType: isContract ? "Smart Contract" : "EOA",
            zkvm: psSpec?.backend ?? "risc0",
            proofSystemId: cand.proofSystemId,
            proofSystemLabel: psSpec?.label ?? "custom.verifier",
            elfSourceType: resolvedElfSource,
            elfUri: resolvedElfUri,
            programId: cand.programId,
            minOfferHemi: Number(minPriceHemi.toFixed(4)),
            maxOfferHemi: Number(maxPriceHemi.toFixed(4)),
            currentOfferHemi: Number(currentOfferHemi.toFixed(4)),
            settledPriceHemi,
            rampUpPeriodSecs: rampUpSecs,
            elapsedSecs,
            curveType: 0,
            expectedCycles,
            actualCycles: fulfillMeta?.actualCycles,
            status: statusLabel,
            proverAddress: proverAddr,
            settlementSecs: computeSettlementDurationSecs(
              cand.blockTimestamp,
              fulfillMeta?.blockTimestamp
            ),
            submittedAtIso,
            txHash: cand.txHash,
            fulfillTxHash: fulfillMeta?.txHash,
            isSimulatedStream: false,
          };

          return { job, cand, fulfillMeta };
        })
      );

      for (const item of enrichedBatch) {
        if (item && pendingMatchedJobs.length < TARGET_VALID_ONCHAIN_JOBS) {
          pendingMatchedJobs.push(item);
        }
      }
    }

    // Backfill missing block timestamps via deduplicated RPC `getBlock` for RPC-sourced logs
    if (rpcConnected && pendingMatchedJobs.length > 0) {
      const missingBlocks = new Set<bigint>();
      for (const entry of pendingMatchedJobs) {
        if (!entry.cand.blockTimestamp && entry.cand.blockNumber !== undefined) {
          missingBlocks.add(entry.cand.blockNumber);
        }
        if (
          entry.fulfillMeta &&
          !entry.fulfillMeta.blockTimestamp &&
          entry.fulfillMeta.blockNumber !== undefined
        ) {
          missingBlocks.add(entry.fulfillMeta.blockNumber);
        }
      }

      if (missingBlocks.size > 0) {
        const blockIsoMap = new Map<bigint, string>();
        const targets = Array.from(missingBlocks).slice(0, MAX_BLOCK_TIMESTAMP_LOOKUPS);
        await Promise.allSettled(
          targets.map(async (blockNumber) => {
            const block = await client.getBlock({ blockNumber });
            blockIsoMap.set(
              blockNumber,
              new Date(Number(block.timestamp) * 1_000).toISOString()
            );
          })
        );

        for (const entry of pendingMatchedJobs) {
          const submittedIso =
            entry.cand.blockTimestamp ??
            (entry.cand.blockNumber !== undefined
              ? blockIsoMap.get(entry.cand.blockNumber)
              : undefined);
          if (submittedIso) {
            entry.job.submittedAtIso = submittedIso;
          }

          const fulfilledIso =
            entry.fulfillMeta?.blockTimestamp ??
            (entry.fulfillMeta?.blockNumber !== undefined
              ? blockIsoMap.get(entry.fulfillMeta.blockNumber)
              : undefined);

          if (!entry.job.settlementSecs && submittedIso && fulfilledIso) {
            entry.job.settlementSecs = computeSettlementDurationSecs(
              submittedIso,
              fulfilledIso
            );
          }
        }
      }
    }

    for (const entry of pendingMatchedJobs) {
      onChainJobs.push(entry.job);
    }
  }

  const baselineJobs = buildBaselineJobs(network, nowMs);
  const usingSimulatedFallback = onChainJobs.length === 0;
  const liveKpis = buildLiveKpis(
    deployment.deployed,
    onChainJobIndex,
    totalPaidHemi,
    onChainJobs
  );

  const demoJobs =
    onChainJobs.length > 0 ? [...onChainJobs, ...baselineJobs] : baselineJobs;
  const responseJobs = mode === "live" ? onChainJobs : demoJobs;

  const response: MarketplaceApiResponse = {
    network,
    chainId: deployment.chainId,
    deployed: deployment.deployed,
    rpcConnected,
    blockscoutConnected,
    latestBlock: latestBlock ? latestBlock.toString() : null,
    routerAddress: deployment.router,
    routerPaused,
    onChainJobIndex,
    totalPaidHemiOnChain: totalPaidHemi,
    usingSimulatedFallback,
    fetchedAtIso: snapshotIso,
    liveKpis,
    kpis: buildBaselineKpis(network, demoJobs, totalPaidHemi),
    onChainJobs,
    jobs: responseJobs,
  };

  marketplaceCache.set(cacheKey, {
    expiresAtMs: Date.now() + MARKETPLACE_CACHE_TTL_MS,
    payload: response,
  });

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": forceRefresh
        ? "no-store"
        : "public, s-maxage=15, stale-while-revalidate=30",
    },
  });
}
