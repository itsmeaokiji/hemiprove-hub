import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  decodeEventLog,
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

export const dynamic = "force-dynamic";

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const MARKETPLACE_CACHE_TTL_MS = 15_000;
const MAX_CANDIDATE_SCAN = 36;
const TARGET_VALID_ONCHAIN_JOBS = 12;
const ENRICH_BATCH_SIZE = 12;

interface CachedMarketplaceEntry {
  expiresAtMs: number;
  payload: MarketplaceApiResponse;
}

const marketplaceCache = new Map<string, CachedMarketplaceEntry>();

interface RawSubmittedCandidate {
  jobId: Hex;
  proofSystemId: Hex;
  caller: Address;
  programId: Hex;
  minPrice?: bigint;
  maxPrice?: bigint;
  txHash?: string;
  blockTimestamp?: string;
}

interface ResolvedProgramMeta {
  name?: string;
  familyLabel?: string;
  estimatedCycles?: number;
  elfUri?: string;
  elfSourceType?: ElfSourceType;
}

interface BlockscoutLogItem {
  data?: string;
  topics?: Array<string | null>;
  transaction_hash?: string;
  tx_hash?: string;
  block_timestamp?: string;
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

      // 1. Fast RPC scan over the latest 2,000 blocks (retain up to MAX_CANDIDATE_SCAN past cancelled bursts)
      const lookbackWindow = BigInt(2_000);
      const windowStart =
        headBlock > lookbackWindow ? headBlock - lookbackWindow : BigInt(0);
      const fromBlock =
        windowStart > deployment.scanFromBlock
          ? windowStart
          : deployment.scanFromBlock;

      if (headBlock >= fromBlock) {
        const submittedLogs = await client
          .getLogs({
            address: deployment.router,
            event: HEMI_PROVE_ROUTER_ABI[0],
            fromBlock,
            toBlock: headBlock,
          })
          .catch(() => []);

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

        for (const item of items) {
          if (rawCandidates.length >= MAX_CANDIDATE_SCAN) break;
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
              if (seenJobIds.has(lowerId)) continue;
              seenJobIds.add(lowerId);

              rawCandidates.push({
                jobId: args.jobId,
                proofSystemId: args.proofSystemId,
                caller: args.caller,
                programId: (args.programId ?? ZERO_BYTES32) as Hex,
                minPrice: args.minPrice,
                maxPrice: args.maxPrice,
                txHash: item.transaction_hash ?? item.tx_hash,
                blockTimestamp: item.block_timestamp,
              });
            }
          } catch {
            // Non-JobSubmitted event on router; continue scanning
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

    for (
      let offset = 0;
      offset < rawCandidates.length && onChainJobs.length < TARGET_VALID_ONCHAIN_JOBS;
      offset += ENRICH_BATCH_SIZE
    ) {
      const batch = rawCandidates.slice(offset, offset + ENRICH_BATCH_SIZE);
      const enrichedBatch = await Promise.all(
        batch.map(async (cand, batchIdx) => {
          const globalIdx = offset + batchIdx;
          const psSpec = resolveProofSystemById(cand.proofSystemId);
          const minPriceHemi = cand.minPrice
            ? Number(formatUnits(cand.minPrice, 18))
            : 1.0;
          const maxPriceHemi = cand.maxPrice
            ? Number(formatUnits(cand.maxPrice, 18))
            : Math.max(minPriceHemi * 2, 10.0);

          let statusLabel: MarketplaceJob["status"] = "Open";
          let currentOfferHemi = minPriceHemi;
          let settledPriceHemi: number | undefined;
          let proverAddr: string | null = null;
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
              const settled = Number(formatUnits(view.settledPrice, 18));
              currentOfferHemi =
                statusLabel === "Open"
                  ? auctionPrice
                  : settled > 0
                    ? settled
                    : maxPriceHemi;
              if (settled > 0) settledPriceHemi = Number(settled.toFixed(4));

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
          }

          const progMeta = programMetaMap.get(cand.programId.toLowerCase());
          if (expectedCycles === 50_000_000 && progMeta?.estimatedCycles) {
            expectedCycles = progMeta.estimatedCycles;
          }

          const resolvedElfUri =
            progMeta?.elfUri ?? `ar://program-${cand.programId.slice(2, 26)}`;
          const resolvedElfSource =
            progMeta?.elfSourceType ?? detectElfSource(resolvedElfUri);

          const job: MarketplaceJob = {
            jobId: cand.jobId,
            shortNumericId: Math.max(
              1,
              (onChainJobIndex ?? rawCandidates.length) - globalIdx
            ),
            programName:
              progMeta?.name ?? `OnChainProgram (${cand.programId.slice(0, 10)})`,
            programFamily: progMeta?.familyLabel ?? "hemiprove.onchain.v2",
            requester: cand.caller,
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
            status: statusLabel,
            proverAddress: proverAddr,
            submittedAtIso: cand.blockTimestamp ?? snapshotIso,
            txHash: cand.txHash,
            isSimulatedStream: false,
          };

          return job;
        })
      );

      for (const item of enrichedBatch) {
        if (item && onChainJobs.length < TARGET_VALID_ONCHAIN_JOBS) {
          onChainJobs.push(item);
        }
      }
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
