import { NextRequest, NextResponse } from "next/server";
import seedBenchmarks from "@/data/seed-benchmarks.json";
import {
  parseZkMinerBenchmark,
  type BenchmarkEntry,
  type ParseBenchmarkOverrides,
} from "@/lib/benchmark-parser";

// In-memory runtime store for submitted community benchmarks during server lifetime
const communitySubmissions: BenchmarkEntry[] = [];

export async function GET() {
  const all = [...(seedBenchmarks as BenchmarkEntry[]), ...communitySubmissions].sort(
    (a, b) => b.zkops - a.zkops
  );
  return NextResponse.json({
    count: all.length,
    communityCount: communitySubmissions.length,
    entries: all,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      rawOutput?: string;
      overrides?: ParseBenchmarkOverrides;
    };

    const parsed = parseZkMinerBenchmark(body.rawOutput ?? "", body.overrides ?? {});
    if (!parsed.ok || !parsed.entry) {
      return NextResponse.json(
        { ok: false, error: parsed.error ?? "Validation failed" },
        { status: 400 }
      );
    }

    communitySubmissions.unshift(parsed.entry);
    if (communitySubmissions.length > 50) {
      communitySubmissions.pop();
    }

    return NextResponse.json({
      ok: true,
      detectedFormat: parsed.detectedFormat,
      entry: parsed.entry,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to parse request body",
      },
      { status: 400 }
    );
  }
}
