import "server-only";
import { sha256 } from "@noble/hashes/sha256";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import {
  actionPda,
  buildActionReport,
  escrowPda,
  fetchEvents,
  replaySnapshotDigest,
  reportHash,
} from "@morro/sdk";
import { readRailLedger } from "@morro/services/src/demo-config";
import type { AuditCheck, AuditView, RailEntry } from "../types";
import { ctx } from "./chain";
import { hex, plain } from "./serialize";
import { actionView } from "./state";

const big = (v: unknown) => BigInt(String(v ?? 0));
const fmt = (v: bigint) => v.toLocaleString("en-US");
const short = (h: string) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "none");

export async function buildAudit(actionId: number): Promise<AuditView | null> {
  const c = ctx();
  const key = actionPda(c.mint, actionId);
  const [bond, action, ents, events, escrowInfo] = await Promise.all([
    c.client.fetchBond(c.mint),
    c.client.fetchAction(key),
    c.client.fetchEntitlements(key),
    fetchEvents(c.connection, key),
    c.connection.getAccountInfo(escrowPda(key), "confirmed"),
  ]);
  if (!bond || !action) return null;

  const escrow = escrowInfo && escrowInfo.data.length >= 72 ? escrowInfo.data.readBigUInt64LE(64).toString() : null;
  const view = actionView(c, key, action, ents, escrow);
  const isVote = view.kind === "vote";
  const snapshotted = view.status !== "announced";
  const closed = view.status === "closed";
  const checks: AuditCheck[] = [];

  // 1. Snapshot completeness.
  const sumBal = view.entitlements.reduce((s, e) => s + big(e.balanceAtRecord), 0n);
  const supplyAtRecord = big(view.supplyAtRecord);
  checks.push({
    label: "Snapshot covers the full supply at the record date",
    pass: snapshotted ? sumBal === supplyAtRecord : null,
    detail: snapshotted
      ? `Σ balances ${fmt(sumBal)} vs supply at record ${fmt(supplyAtRecord)} across ${view.entitlements.length} holder(s)`
      : "Snapshot not taken yet",
  });

  // 2. Entitlement total.
  const sumAmt = view.entitlements.reduce((s, e) => s + big(e.amount), 0n);
  const total = big(view.totalEntitlement);
  checks.push({
    label: "Per-holder entitlements add up to the action total",
    pass: snapshotted ? sumAmt === total : null,
    detail: snapshotted ? `Σ amounts ${fmt(sumAmt)} tiyn vs total ${fmt(total)} tiyn` : "Snapshot not taken yet",
  });

  // 3. Fully paid.
  const paid = big(view.totalPaid);
  checks.push({
    label: "Everything owed was paid",
    pass: isVote ? null : closed ? paid === total : null,
    detail: isVote
      ? "Votes carry no cash entitlement"
      : closed
        ? `Paid ${fmt(paid)} of ${fmt(total)} tiyn`
        : `Paid ${fmt(paid)} of ${fmt(total)} tiyn so far (checked at close)`,
  });

  // 4. Snapshot digest replay from HolderSnapshotted events, in event order.
  const snapEvents = events.filter((e) => e.name === "holderSnapshotted");
  const rows = snapEvents.map((e) => ({
    owner: new PublicKey(String(plain(e.data.owner))),
    balance: big(plain(e.data.balanceAtRecord)),
    amount: big(plain(e.data.amount)),
  }));
  const replayed = hex(replaySnapshotDigest(rows));
  checks.push({
    label: "Snapshot digest replays from on-chain events",
    pass: snapshotted ? replayed === view.snapshotDigest : null,
    detail: snapshotted
      ? `Replayed ${short(replayed)} from ${rows.length} HolderSnapshotted event(s); on-chain ${short(view.snapshotDigest)}`
      : "Snapshot not taken yet",
  });

  // 5. Report hash.
  const recomputed = hex(reportHash(buildActionReport(bond, key, action, ents)));
  const file = c.reportPath(actionId);
  const reportAvailable = fs.existsSync(file);
  const savedFile = reportAvailable ? hex(sha256(fs.readFileSync(file))) : null;
  checks.push({
    label: "Closing report hash matches the chain",
    pass: closed ? recomputed === view.reportHash && (savedFile === null || savedFile === view.reportHash) : null,
    detail: closed
      ? `On-chain ${short(view.reportHash)}; recomputed ${short(recomputed)}${savedFile ? `; published file ${short(savedFile)}` : "; no published file on this server"}`
      : isVote
        ? "Votes finish without a closing report"
        : "Recorded when the action closes",
  });

  // 6. Off-chain payment references.
  const rail: RailEntry[] = (readRailLedger() as (RailEntry & { action?: string })[])
    .filter((r) => r.action === view.address)
    .map(({ ref, railReference, owner, amountMinor, paidAt, signature }) => ({ ref, railReference, owner, amountMinor, paidAt, signature }));
  if (view.settlementMode === "offChain" && !isVote) {
    const confirmed = view.entitlements.filter((e) => e.paymentRef);
    const mismatched = confirmed.filter(
      (e) => !rail.some((r) => r.ref === e.paymentRef && r.owner === e.owner && r.amountMinor === e.amount),
    );
    // On serverless hosts the simulated rail's ledger is per-instance and may be gone; say so rather than fail.
    const ledgerMissing = confirmed.length > 0 && rail.length === 0;
    checks.push({
      label: "Off-chain payment references match the rail ledger",
      pass: confirmed.length === 0 || ledgerMissing ? null : mismatched.length === 0,
      detail:
        confirmed.length === 0
          ? "No confirmed payments yet"
          : ledgerMissing
            ? `${confirmed.length} payment ref(s) on-chain; the simulated rail ledger is not available on this server`
            : `${confirmed.length - mismatched.length} of ${confirmed.length} on-chain payment refs found in the rail ledger with matching owner and amount`,
    });
  } else {
    checks.push({
      label: "Off-chain payment references match the rail ledger",
      pass: null,
      detail: isVote ? "Not a payment action" : "Settled on-chain in tKZT; no off-chain rail involved",
    });
  }

  return {
    action: view,
    events: events.map((e) => ({
      name: e.name,
      data: plain(e.data) as Record<string, unknown>,
      signature: e.signature,
      slot: e.slot,
      blockTime: e.blockTime,
      explorerUrl: c.txUrl(e.signature),
    })),
    checks,
    rail,
    hashes: { onChain: view.reportHash, recomputed: closed ? recomputed : null, savedFile },
    reportAvailable,
  };
}
