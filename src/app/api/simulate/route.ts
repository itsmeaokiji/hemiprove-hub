import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  runDeterministicSimulation,
  validateElfUri,
  type SimulateInputPayload,
  type SimulateReportJson,
} from "@/lib/simulate-engine";
import type { ZkVmBackend } from "@/lib/hemi-chain";

const execFileAsync = promisify(execFile);

function pickNonEmptyString(
  raw: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return undefined;
}

function pickFiniteNumber(
  raw: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === "number" && Number.isFinite(val) && val >= 0) {
      return val;
    }
    if (typeof val === "string" && /^\d+(\.\d+)?$/.test(val.trim())) {
      return Number(val.trim());
    }
  }
  return undefined;
}

function pickCycleString(
  raw: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === "number" && Number.isFinite(val) && val >= 0) {
      return String(Math.round(val));
    }
    if (typeof val === "string" && /^\d+$/.test(val.trim())) {
      return val.trim();
    }
  }
  return undefined;
}

function mergeCliSimulateReport(
  base: SimulateReportJson,
  raw: Record<string, unknown>
): SimulateReportJson {
  const outcomeVal = raw.outcome;
  const outcome: SimulateReportJson["outcome"] =
    outcomeVal === "measured" || outcomeVal === "too_heavy" || outcomeVal === "not_served"
      ? outcomeVal
      : base.outcome;

  const sizeCheckRaw = raw.sizeCheck ?? raw.size_check;
  const sizeCheck: SimulateReportJson["sizeCheck"] =
    sizeCheckRaw === "consistent" ||
    sizeCheckRaw === "differs" ||
    sizeCheckRaw === "skipped_single_run"
      ? sizeCheckRaw
      : base.sizeCheck;

  const bindingVal = raw.binding;
  const binding: SimulateReportJson["binding"] =
    bindingVal === "satisfied" || bindingVal === "none" || bindingVal === "fails"
      ? bindingVal
      : base.binding;

  const provenVal = raw.proven;
  const proven: SimulateReportJson["proven"] =
    provenVal === "matches" || provenVal === "differs" || provenVal === "unknown"
      ? provenVal
      : base.proven;

  const hostInputRaw = raw.hostInput ?? raw.host_input;
  const rawWarnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((w): w is string => typeof w === "string")
    : base.warnings;

  return {
    ...base,
    outcome,
    retryable: typeof raw.retryable === "boolean" ? raw.retryable : base.retryable,
    programId: pickNonEmptyString(raw, ["programId", "program_id"]) ?? base.programId,
    elfHash: pickNonEmptyString(raw, ["elfHash", "elf_hash"]) ?? base.elfHash,
    elfBytes: pickFiniteNumber(raw, ["elfBytes", "elf_bytes"]) ?? base.elfBytes,
    inputHash: pickNonEmptyString(raw, ["inputHash", "input_hash"]) ?? base.inputHash,
    inputBytes: pickFiniteNumber(raw, ["inputBytes", "input_bytes"]) ?? base.inputBytes,
    cycles: pickCycleString(raw, ["cycles"]) ?? base.cycles,
    guestCycles: pickCycleString(raw, ["guestCycles", "guest_cycles"]) ?? base.guestCycles,
    paddingCycles:
      pickCycleString(raw, ["paddingCycles", "padding_cycles"]) ?? base.paddingCycles,
    keccakRequests:
      pickFiniteNumber(raw, ["keccakRequests", "keccak_requests"]) ?? base.keccakRequests,
    keccakCharges:
      pickCycleString(raw, ["keccakCharges", "keccak_charges"]) ?? base.keccakCharges,
    sizeCheck,
    executeSecs:
      pickFiniteNumber(raw, ["executeSecs", "execute_secs"]) ?? base.executeSecs,
    peakHostBytes:
      pickFiniteNumber(raw, ["peakHostBytes", "peak_host_bytes"]) ?? base.peakHostBytes,
    peakVramMib:
      pickFiniteNumber(raw, ["peakVramMib", "peak_vram_mib"]) ?? base.peakVramMib,
    journalBytes:
      pickFiniteNumber(raw, ["journalBytes", "journal_bytes"]) ?? base.journalBytes,
    journalHash:
      pickNonEmptyString(raw, ["journalHash", "journal_hash"]) ?? base.journalHash,
    publicValuesHex:
      pickNonEmptyString(raw, ["publicValuesHex", "public_values_hex"]) ??
      base.publicValuesHex,
    binding,
    proven,
    hostInput: typeof hostInputRaw === "boolean" ? hostInputRaw : base.hostInput,
    randomReads:
      pickFiniteNumber(raw, ["randomReads", "random_reads"]) ?? base.randomReads,
    sdkVersion: pickNonEmptyString(raw, ["sdkVersion", "sdk_version"]) ?? base.sdkVersion,
    zkminerVersion:
      pickNonEmptyString(raw, ["zkminerVersion", "zkminer_version"]) ??
      base.zkminerVersion,
    warnings: rawWarnings,
    executionEngine: "zkminer-cli-binary",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<SimulateInputPayload> & {
      jobId?: string;
    };

    const targetZkvm: ZkVmBackend =
      body.targetZkvm === "sp1" || body.targetZkvm === "openvm" || body.targetZkvm === "risc0"
        ? body.targetZkvm
        : "risc0";

    const uriCheck = validateElfUri(body.elfUrl ?? "");
    if (!uriCheck.ok) {
      return NextResponse.json(
        { ok: false, error: uriCheck.error },
        { status: 400 }
      );
    }

    const payload: SimulateInputPayload = {
      elfUrl: uriCheck.normalized,
      targetZkvm,
      stdin: body.stdin ?? "",
      singleRun: Boolean(body.singleRun),
      declaredCycles:
        typeof body.declaredCycles === "number" && Number.isFinite(body.declaredCycles)
          ? body.declaredCycles
          : undefined,
      jobId: typeof body.jobId === "string" ? body.jobId : undefined,
      programId: typeof body.programId === "string" ? body.programId : undefined,
    };

    // Attempt local `zkminer simulate` binary if present and a 32-byte on-chain jobId is provided
    const zkminerBin = process.env.ZKMINER_BIN || "zkminer";
    if (body.jobId && /^0x[0-9a-fA-F]{64}$/.test(body.jobId)) {
      try {
        const args = ["simulate", body.jobId];
        if (payload.singleRun) {
          args.push("--po2", "20");
        }
        const { stdout } = await execFileAsync(zkminerBin, args, { timeout: 8_000 });
        const firstLine = stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.startsWith("{"));
        if (firstLine) {
          const cliReport = JSON.parse(firstLine) as Record<string, unknown>;
          const base = runDeterministicSimulation(payload);
          return NextResponse.json({
            ok: true,
            report: mergeCliSimulateReport(base, cliReport),
          });
        }
      } catch {
        // Binary not installed on host PATH; fall back seamlessly to deterministic simulation analysis
      }
    }

    const report = runDeterministicSimulation(payload);
    return NextResponse.json({
      ok: true,
      report,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Simulation request failed",
      },
      { status: 500 }
    );
  }
}
