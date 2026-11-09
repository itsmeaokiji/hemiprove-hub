import { NextResponse } from "next/server";

const COINGECKO_HEMI_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=hemi&vs_currencies=usd&include_24hr_change=true";

const CACHE_TTL_MS = 60_000;
const FALLBACK_HEMI_USD = 0.14;

export interface HemiPriceApiResponse {
  ok: boolean;
  live: boolean;
  usd: number;
  usd24hChange: number | null;
  source: "coingecko" | "coingecko-stale-cache" | "fallback";
  fetchedAtIso: string;
}

interface CachedQuote {
  usd: number;
  usd24hChange: number | null;
  fetchedAtMs: number;
  fetchedAtIso: string;
}

let cachedQuote: CachedQuote | null = null;

export async function GET() {
  const now = Date.now();

  if (cachedQuote && now - cachedQuote.fetchedAtMs < CACHE_TTL_MS) {
    const payload: HemiPriceApiResponse = {
      ok: true,
      live: true,
      usd: cachedQuote.usd,
      usd24hChange: cachedQuote.usd24hChange,
      source: "coingecko",
      fetchedAtIso: cachedQuote.fetchedAtIso,
    };
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_500);

    const res = await fetch(COINGECKO_HEMI_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = (await res.json()) as {
        hemi?: {
          usd?: number;
          usd_24h_change?: number;
        };
      };

      const usd = json?.hemi?.usd;
      const change = json?.hemi?.usd_24h_change;

      if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) {
        const fetchedAtIso = new Date().toISOString();
        cachedQuote = {
          usd,
          usd24hChange:
            typeof change === "number" && Number.isFinite(change) ? change : null,
          fetchedAtMs: now,
          fetchedAtIso,
        };

        const payload: HemiPriceApiResponse = {
          ok: true,
          live: true,
          usd: cachedQuote.usd,
          usd24hChange: cachedQuote.usd24hChange,
          source: "coingecko",
          fetchedAtIso,
        };
        return NextResponse.json(payload, {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
          },
        });
      }
    }
  } catch {
    // Upstream unreachable or timed out; fall through to stale cache or fallback
  }

  if (cachedQuote) {
    const payload: HemiPriceApiResponse = {
      ok: true,
      live: true,
      usd: cachedQuote.usd,
      usd24hChange: cachedQuote.usd24hChange,
      source: "coingecko-stale-cache",
      fetchedAtIso: cachedQuote.fetchedAtIso,
    };
    return NextResponse.json(payload);
  }

  const fallbackPayload: HemiPriceApiResponse = {
    ok: true,
    live: false,
    usd: FALLBACK_HEMI_USD,
    usd24hChange: null,
    source: "fallback",
    fetchedAtIso: new Date().toISOString(),
  };
  return NextResponse.json(fallbackPayload);
}
