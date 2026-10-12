// Browser-safe formatting helpers. The SDK's math module has no chain dependencies.
import { formatKzt as sdkFormatKzt } from "@morro/sdk/src/math";
import type { ActionKind, ActionStatus, ActionView, ConfigView, SettlementMode } from "./types";

export const kzt = (minor: string | bigint | number) => `${sdkFormatKzt(BigInt(minor))} KZT`;
export const kztPlain = (minor: string | bigint | number) => sdkFormatKzt(BigInt(minor));
export const int = (v: string | bigint | number) => BigInt(v).toLocaleString("en-US");

export const shortAddr = (a: string, n = 4) => (a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);
export const shortHash = (h: string) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "15 Oct 2027" (UTC). */
export function fmtDate(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "12 Oct 2026, 14:03:20 UTC". */
export function fmtDateTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return `${fmtDate(ts)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export function fmtClock(ts: number): string {
  const d = new Date(ts * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export const isoDay = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

/** "in 1m 05s" / "2m 10s ago". */
export function relative(target: number, now: number): string {
  const diff = target - now;
  const abs = Math.abs(diff);
  let s: string;
  if (abs < 60) s = `${abs}s`;
  else if (abs < 3600) s = `${Math.floor(abs / 60)}m ${pad(abs % 60)}s`;
  else if (abs < 86400) s = `${Math.floor(abs / 3600)}h ${pad(Math.floor((abs % 3600) / 60))}m`;
  else s = `${Math.floor(abs / 86400)}d ${Math.floor((abs % 86400) / 3600)}h`;
  return diff >= 0 ? `in ${s}` : `${s} ago`;
}

export const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.00$/, "")}%`;

export const KIND_LABEL: Record<ActionKind, string> = {
  coupon: "Coupon payment",
  redemption: "Redemption at maturity",
  partialRedemption: "Partial redemption",
  vote: "Consent vote",
};

export const STATUS_LABEL: Record<ActionStatus, string> = {
  announced: "Announced",
  snapshotted: "Snapshotted",
  funded: "Funded",
  paying: "Paying",
  closed: "Closed",
  voting: "Voting",
  passed: "Passed",
  rejected: "Rejected",
};

export const MODE_LABEL: Record<SettlementMode, string> = {
  onChain: "On-chain (tKZT escrow)",
  offChain: "Off-chain (paying agent)",
};

export const isOpen = (a: ActionView) => !["closed", "passed", "rejected"].includes(a.status);
export const retires = (a: ActionView) => a.kind === "redemption" || a.kind === "partialRedemption";

export function actionTitle(a: ActionView): string {
  if (a.kind === "partialRedemption") return `${KIND_LABEL[a.kind]} ${pct(a.redeemBps)}`;
  return KIND_LABEL[a.kind];
}

export function explorerTx(config: Pick<ConfigView, "cluster" | "rpcUrl">, sig: string) {
  if (config.cluster === "devnet") return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  return `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(config.rpcUrl)}`;
}

export function explorerAddress(config: Pick<ConfigView, "cluster" | "rpcUrl">, address: string) {
  if (config.cluster === "devnet") return `https://explorer.solana.com/address/${address}?cluster=devnet`;
  return `https://explorer.solana.com/address/${address}?cluster=custom&customUrl=${encodeURIComponent(config.rpcUrl)}`;
}
