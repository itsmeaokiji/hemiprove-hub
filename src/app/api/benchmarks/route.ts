import { NextRequest, NextResponse } from "next/server";
import seedBenchmarks from "@/data/seed-benchmarks.json";
import {
  parseZkMinerBenchmark,
  type BenchmarkEntry,
  type ParseBenchmarkOverrides,
} from "@/lib/benchmark-parser";

const MAX_RAW_OUTPUT_CHARS = 100_000;

// In-memory runtime store for submitted community benchmarks during server instance lifetime
const communitySubmissions: BenchmarkEntry[] = [];

function sanitizeOverrides(raw: ParseBenchmarkOverrides | undefined): ParseBenchmarkOverrides {
  if (!raw || typeof raw !== "object") return {};
  return {
    gpuModel:
      typeof raw.gpuModel === "string" ? raw.gpuModel.trim().slice(0, 80) || undefined : undefined,
    vendor:
      raw.vendor === "NVIDIA" || raw.vendor === "AMD" || raw.vendor === "Intel"
        ? raw.vendor
        : undefined,
    os: raw.os === "Linux" || raw.os === "Windows" ? raw.os : undefined,
    vramGb:
      typeof raw.vramGb === "number" && Number.isFinite(raw.vramGb) && raw.vramGb > 0
        ? Math.min(512, Math.round(raw.vramGb))
        : undefined,
    tdpWatts:
      typeof raw.tdpWatts === "number" && Number.isFinite(raw.tdpWatts) && raw.tdpWatts > 0
        ? Math.min(2_000, Math.round(raw.tdpWatts))
        : undefined,
    submittedBy:
      typeof raw.submittedBy === "string"
        ? raw.submittedBy.trim().slice(0, 64) || undefined
        : undefined,
  };
}

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
      rawOutput?: unknown;
      overrides?: ParseBenchmarkOverrides;
    };

    if (typeof body.rawOutput !== "string") {
      return NextResponse.json(
        { ok: false, error: "`rawOutput` string is required." },
        { status: 400 }
      );
    }

    if (body.rawOutput.length > MAX_RAW_OUTPUT_CHARS) {
      return NextResponse.json(
        {
          ok: false,
          error: `Benchmark payload exceeds ${MAX_RAW_OUTPUT_CHARS.toLocaleString()} character limit.`,
        },
        { status: 413 }
      );
    }

    const parsed = parseZkMinerBenchmark(body.rawOutput, sanitizeOverrides(body.overrides));
    if (!parsed.ok || !parsed.entry) {
      return NextResponse.json(
        { ok: false, error: parsed.error ?? "Validation failed" },
        { status: 400 }
      );
    }

    // Replace existing entry with the same fingerprint ID so repeat submissions never duplicate
    const existingIdx = communitySubmissions.findIndex((e) => e.id === parsed.entry!.id);
    if (existingIdx !== -1) {
      communitySubmissions.splice(existingIdx, 1);
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
