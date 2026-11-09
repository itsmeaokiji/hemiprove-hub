import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenHex(hex: string, startChars = 6, endChars = 4): string {
  if (!hex) return "";
  if (hex.length <= startChars + endChars + 2) return hex;
  return `${hex.slice(0, startChars + 2)}…${hex.slice(-endChars)}`;
}

export function formatCycles(cycles: number | string): string {
  const num = typeof cycles === "string" ? Number(cycles) : cycles;
  if (!Number.isFinite(num)) return String(cycles);
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export function formatCycleRate(rate: number): string {
  if (rate >= 1_000_000) return `${(rate / 1_000_000).toFixed(2)}M c/s`;
  if (rate >= 1_000) return `${(rate / 1_000).toFixed(1)}K c/s`;
  return `${Math.round(rate)} c/s`;
}

export function formatZkops(zkops: number): string {
  if (zkops >= 1_000_000) {
    return `${(zkops / 1_000_000).toFixed(2)}M`;
  }
  return Math.round(zkops).toLocaleString();
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const gib = bytes / (1024 * 1024 * 1024);
  if (gib >= 1) return `${gib.toFixed(1)} GiB`;
  const mib = bytes / (1024 * 1024);
  if (mib >= 1) return `${mib.toFixed(0)} MiB`;
  const kib = bytes / 1024;
  return `${kib.toFixed(1)} KiB`;
}

export function formatDurationSecs(secs: number): string {
  if (secs < 1) return `${Math.round(secs * 1000)}ms`;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const rem = Math.round(secs % 60);
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}
