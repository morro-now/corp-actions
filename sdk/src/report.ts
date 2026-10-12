import { sha256 } from "@noble/hashes/sha256";
import { PublicKey } from "@solana/web3.js";
import type { Account, BondConfig, CorporateAction, Entitlement } from "./client";
import { enumName } from "./client";
import { formatDate } from "./math";

export interface ActionReport {
  schema: "morro.action-report/v1";
  mint: string;
  action: string;
  actionId: number;
  kind: string;
  settlementMode: string;
  recordDate: string;
  paymentDate: string;
  supplyAtRecord: string;
  totalEntitlement: string;
  snapshotDigest: string;
  holders: {
    owner: string;
    balanceAtRecord: string;
    amount: string;
    bondsRetired: string;
    status: string;
    paymentRef: string;
  }[];
}

const hex = (bytes: Uint8Array | number[]) => Buffer.from(bytes).toString("hex");

/** Deterministic closing report for an action; its SHA-256 is stored on-chain at close. */
export function buildActionReport(
  bond: BondConfig,
  actionKey: PublicKey,
  action: CorporateAction,
  entitlements: Account<Entitlement>[],
): ActionReport {
  const holders = [...entitlements]
    .sort((a, b) => a.account.owner.toBase58().localeCompare(b.account.owner.toBase58()))
    .map(({ account: e }) => ({
      owner: e.owner.toBase58(),
      balanceAtRecord: e.balanceAtRecord.toString(),
      amount: e.amount.toString(),
      bondsRetired: e.bondsToRetire.toString(),
      status: enumName(e.status),
      paymentRef: hex(e.paymentRef),
    }));
  return {
    schema: "morro.action-report/v1",
    mint: bond.mint.toBase58(),
    action: actionKey.toBase58(),
    actionId: action.actionId,
    kind: enumName(action.kind),
    settlementMode: enumName(action.settlementMode),
    recordDate: new Date(action.recordTs.toNumber() * 1000).toISOString(),
    paymentDate: formatDate(action.paymentTs.toNumber()),
    supplyAtRecord: action.supplyAtRecord.toString(),
    totalEntitlement: action.totalEntitlement.toString(),
    snapshotDigest: hex(action.snapshotDigest),
    holders,
  };
}

export function reportHash(report: ActionReport): Uint8Array {
  return sha256(new TextEncoder().encode(JSON.stringify(report)));
}

/**
 * Replays the snapshot digest from (owner, balance, amount) rows in snapshot order:
 * digest = sha256(prev || owner || balance_le_u64 || amount_le_u64), starting from 32 zero bytes.
 */
export function replaySnapshotDigest(rows: { owner: PublicKey; balance: bigint; amount: bigint }[]): Uint8Array {
  let digest: Uint8Array = new Uint8Array(32);
  for (const r of rows) {
    const buf = Buffer.alloc(32 + 32 + 8 + 8);
    Buffer.from(digest).copy(buf, 0);
    r.owner.toBuffer().copy(buf, 32);
    buf.writeBigUInt64LE(r.balance, 64);
    buf.writeBigUInt64LE(r.amount, 72);
    digest = sha256(buf);
  }
  return digest;
}
