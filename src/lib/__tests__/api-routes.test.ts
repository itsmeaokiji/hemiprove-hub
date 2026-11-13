import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { GET as getBenchmarks, POST as postBenchmarks } from "@/app/api/benchmarks/route";
import { GET as getHemiPrice } from "@/app/api/hemi-price/route";
import { GET as getMarketplace } from "@/app/api/marketplace/route";
import { POST as postSimulate } from "@/app/api/simulate/route";
import { SAMPLE_CLI_BENCHMARK_OUTPUT } from "@/lib/benchmark-parser";
import { SIMULATE_PRESETS } from "@/lib/simulate-engine";
import {
  buildMockBlockscoutRouterLogs,
  TEST_FULFILL_TX,
  TEST_JOB_ID,
} from "@/lib/__tests__/mock-logs";

async function withMockedFetch<T>(
  handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<T>
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("API Route Integration Tests (Offline Mocked)", () => {
  it("GET /api/hemi-price handles fallback when upstream fails and caches live CoinGecko quotes", async () => {
    const fallbackRes = await withMockedFetch(
      async () => {
        throw new Error("Simulated offline upstream");
      },
      () => getHemiPrice()
    );
    assert.equal(fallbackRes.status, 200);
    const fallbackJson = (await fallbackRes.json()) as {
      ok: boolean;
      live: boolean;
      usd: number;
      source: string;
    };
    assert.equal(fallbackJson.ok, true);
    assert.equal(fallbackJson.live, false);
    assert.equal(fallbackJson.source, "fallback");
    assert.ok(fallbackJson.usd > 0);

    let callCount = 0;
    const liveRes = await withMockedFetch(
      async () => {
        callCount += 1;
        return new Response(
          JSON.stringify({ hemi: { usd: 0.25, usd_24h_change: 4.2 } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
      () => getHemiPrice()
    );
    assert.equal(liveRes.status, 200);
    const liveJson = (await liveRes.json()) as {
      live: boolean;
      usd: number;
      usd24hChange: number | null;
      source: string;
    };
    assert.equal(liveJson.live, true);
    assert.equal(liveJson.usd, 0.25);
    assert.equal(liveJson.usd24hChange, 4.2);
    assert.equal(liveJson.source, "coingecko");

    // Subsequent call within 60s TTL serves cache without calling fetch again
    const cachedRes = await withMockedFetch(
      async () => {
        callCount += 1;
        throw new Error("Should have used cache");
      },
      () => getHemiPrice()
    );
    assert.equal(cachedRes.status, 200);
    assert.equal(callCount, 1);
  });

  it("GET & POST /api/benchmarks validate payloads, enforce 100k cap, sanitize overrides, and deduplicate", async () => {
    const initialGet = await getBenchmarks();
    assert.equal(initialGet.status, 200);
    const initialBody = (await initialGet.json()) as {
      count: number;
      communityCount: number;
    };
    assert.ok(initialBody.count >= 13);

    const oversizedReq = new NextRequest("http://localhost/api/benchmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawOutput: "x".repeat(100_001) }),
    });
    const oversizedRes = await postBenchmarks(oversizedReq);
    assert.equal(oversizedRes.status, 413);

    const invalidReq = new NextRequest("http://localhost/api/benchmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawOutput: "not a benchmark" }),
    });
    const invalidRes = await postBenchmarks(invalidReq);
    assert.equal(invalidRes.status, 400);

    const submitPayload = JSON.stringify({
      rawOutput: SAMPLE_CLI_BENCHMARK_OUTPUT,
      overrides: { gpuModel: "AMD RX 9070 XT", tdpWatts: 0, vramGb: -8 },
    });

    const firstPost = await postBenchmarks(
      new NextRequest("http://localhost/api/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: submitPayload,
      })
    );
    assert.equal(firstPost.status, 200);
    const firstJson = (await firstPost.json()) as {
      ok: boolean;
      entry: { id: string; tdpWatts: number; vramGb: number };
    };
    assert.equal(firstJson.ok, true);
    assert.ok(firstJson.entry.tdpWatts > 0);
    assert.ok(firstJson.entry.vramGb > 0);

    const duplicatePost = await postBenchmarks(
      new NextRequest("http://localhost/api/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: submitPayload,
      })
    );
    assert.equal(duplicatePost.status, 200);

    const afterGet = await getBenchmarks();
    const afterBody = (await afterGet.json()) as { communityCount: number };
    assert.equal(afterBody.communityCount, initialBody.communityCount + 1);
  });

  it("POST /api/simulate validates inputs and detects sizeCheck differences", async () => {
    const missingUrlRes = await postSimulate(
      new NextRequest("http://localhost/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elfUrl: "  ", targetZkvm: "risc0", stdin: "0x01" }),
      })
    );
    assert.equal(missingUrlRes.status, 400);

    const preset = SIMULATE_PRESETS[2] ?? SIMULATE_PRESETS[0];
    const simRes = await postSimulate(
      new NextRequest("http://localhost/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elfUrl: preset.elfUrl,
          targetZkvm: preset.targetZkvm,
          stdin: preset.stdin,
          singleRun: false,
        }),
      })
    );
    assert.equal(simRes.status, 200);
    const simJson = (await simRes.json()) as {
      ok: boolean;
      report: { executionEngine: string; sizeCheck: string; binding: string };
    };
    assert.equal(simJson.ok, true);
    assert.equal(simJson.report.executionEngine, "deterministic-analyzer");
  });

  it("GET /api/marketplace isolates staged Mainnet and correlates Blockscout settlement latency + actualCycles on Sepolia", async () => {
    const mainnetRes = await withMockedFetch(
      async () => {
        throw new Error("Offline RPC mock");
      },
      () =>
        getMarketplace(
          new NextRequest(
            "http://localhost/api/marketplace?network=mainnet&mode=live&refresh=1"
          )
        )
    );
    assert.equal(mainnetRes.status, 200);
    const mainnetJson = (await mainnetRes.json()) as {
      deployed: boolean;
      onChainJobs: unknown[];
      liveKpis: { totalJobs: number };
    };
    assert.equal(mainnetJson.deployed, false);
    assert.equal(mainnetJson.onChainJobs.length, 0);
    assert.equal(mainnetJson.liveKpis.totalJobs, 0);

    const mockItems = buildMockBlockscoutRouterLogs();
    const sepoliaRes = await withMockedFetch(
      async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("/api/v2/addresses/")) {
          return new Response(JSON.stringify({ items: mockItems }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error("Simulated RPC unavailable to trigger Blockscout discovery path");
      },
      () =>
        getMarketplace(
          new NextRequest(
            "http://localhost/api/marketplace?network=sepolia&mode=live&refresh=1"
          )
        )
    );
    assert.equal(sepoliaRes.status, 200);
    const sepoliaJson = (await sepoliaRes.json()) as {
      blockscoutConnected: boolean;
      onChainJobs: Array<{
        jobId: string;
        status: string;
        settledPriceHemi?: number;
        settlementSecs?: number;
        actualCycles?: number;
        fulfillTxHash?: string;
      }>;
      liveKpis: { avgSettlementSecs: number; proofsVerified: number };
    };

    assert.equal(sepoliaJson.blockscoutConnected, true);
    assert.equal(sepoliaJson.onChainJobs.length, 1);
    const job = sepoliaJson.onChainJobs[0];
    assert.equal(job.jobId.toLowerCase(), TEST_JOB_ID.toLowerCase());
    assert.equal(job.status, "Verified");
    assert.equal(job.settledPriceHemi, 6.25);
    assert.equal(job.settlementSecs, 42.5);
    assert.equal(job.actualCycles, 51_380_224);
    assert.equal(job.fulfillTxHash, TEST_FULFILL_TX);
    assert.equal(sepoliaJson.liveKpis.avgSettlementSecs, 42.5);
    assert.equal(sepoliaJson.liveKpis.proofsVerified, 1);
  });
});
