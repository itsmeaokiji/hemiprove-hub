import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mergeCliSimulateReport,
  runDeterministicSimulation,
  validateElfUri,
  type SimulateInputPayload,
} from "@/lib/simulate-engine";
import type { ZkVmBackend } from "@/lib/hemi-chain";

const execFileAsync = promisify(execFile);

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
