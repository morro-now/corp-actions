import "server-only";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import {
  actionPda,
  bondAta,
  buildActionReport,
  chainTime,
  crankOnce,
  enumName,
  payingAgentOnce,
  reportHash,
  settlementAta,
  transferBondsIx,
  type AnnounceArgs,
  type Sender,
} from "@morro/sdk";
import { ROLES, appendRailLedger } from "@morro/services/src/demo-config";
import type { TxResult } from "../types";
import { ctx, type Ctx, type Role } from "./chain";
import { parseTxError } from "./errors";

type Params = Record<string, unknown>;

class BadRequest extends Error {}

const role = (v: unknown, name = "role"): Role => {
  if (typeof v !== "string" || !(ROLES as readonly string[]).includes(v)) throw new BadRequest(`Unknown ${name}: ${String(v)}`);
  return v as Role;
};

const int = (v: unknown, name: string, { min = 0, fallback }: { min?: number; fallback?: number } = {}): number => {
  if ((v === undefined || v === null || v === "") && fallback !== undefined) return fallback;
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n) || n < min) {
    throw new BadRequest(`${name} must be an integer ≥ ${min}`);
  }
  return n;
};

/** Accepts unix seconds or a YYYY-MM-DD date (UTC midnight); empty means 0. */
const ts = (v: unknown, name: string): number => {
  if (v === undefined || v === null || v === "" || v === 0) return 0;
  if (typeof v === "number") return Math.floor(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return Math.floor(Date.parse(`${v}T00:00:00Z`) / 1000);
  throw new BadRequest(`${name} must be a date (YYYY-MM-DD) or unix seconds`);
};

const KINDS = ["coupon", "redemption", "partialRedemption", "vote"] as const;

/** Wraps a sender to remember every signature it produced. */
class RecordingSender implements Sender {
  readonly signatures: string[] = [];
  constructor(private readonly inner: Sender) {}
  get publicKey(): PublicKey {
    return this.inner.publicKey;
  }
  async send(ixs: TransactionInstruction[], label?: string) {
    const sig = await this.inner.send(ixs, label);
    this.signatures.push(sig);
    return sig;
  }
}

async function single(c: Ctx, signer: Role, ixs: TransactionInstruction[], extra: Partial<TxResult> = {}): Promise<TxResult> {
  const signature = await c.sender(signer).send(ixs);
  return { ok: true, signature, signatures: [signature], explorerUrl: c.txUrl(signature), ...extra };
}

async function announce(c: Ctx, p: Params): Promise<TxResult> {
  const kind = p.kind as (typeof KINDS)[number];
  if (!KINDS.includes(kind)) throw new BadRequest(`Unknown kind: ${String(p.kind)}`);
  const mode = p.settlementMode === "offChain" ? "offChain" : "onChain";
  const bond = await c.client.fetchBond(c.mint);
  if (!bond) throw new BadRequest("Bond not found");
  const now = await chainTime(c.connection);
  const recordTs = now + int(p.recordInSec, "recordInSec", { min: 1, fallback: 60 });
  const isVote = kind === "vote";

  const args: AnnounceArgs = {
    kind: { [kind]: {} } as unknown as AnnounceArgs["kind"],
    settlementMode: { [mode]: {} } as unknown as AnnounceArgs["settlementMode"],
    recordTs: new BN(recordTs),
    paymentTs: new BN(isVote ? 0 : now + int(p.paymentInSec, "paymentInSec", { min: 1, fallback: 120 })),
    periodStartTs: new BN(isVote ? 0 : ts(p.periodStart, "periodStart")),
    periodEndTs: new BN(isVote ? 0 : ts(p.periodEnd, "periodEnd")),
    redeemBps:
      kind === "redemption" ? 10_000 : kind === "partialRedemption" ? int(p.redeemBps, "redeemBps", { min: 1, fallback: 2_500 }) : 0,
    newMaturityTs: new BN(isVote ? ts(p.newMaturity, "newMaturity") : 0),
    quorumBps: isVote ? int(p.quorumBps, "quorumBps", { fallback: 5_000 }) : 0,
    thresholdBps: isVote ? int(p.thresholdBps, "thresholdBps", { fallback: 6_667 }) : 0,
    voteEndTs: new BN(isVote ? now + int(p.voteEndInSec, "voteEndInSec", { min: 1, fallback: 180 }) : 0),
  };
  const actionId = bond.nextActionId;
  const ix = await c.client.announce({ issuer: c.key("issuer").publicKey, mint: c.mint, actionId, args });
  return single(c, "issuer", [ix], { actionId });
}

async function closeAction(c: Ctx, p: Params): Promise<TxResult> {
  const actionId = int(p.actionId, "actionId");
  const key = actionPda(c.mint, actionId);
  const [bond, action, ents] = await Promise.all([
    c.client.fetchBond(c.mint),
    c.client.fetchAction(key),
    c.client.fetchEntitlements(key),
  ]);
  if (!bond || !action) throw new BadRequest(`Action #${actionId} not found`);
  const report = buildActionReport(bond, key, action, ents);
  const hash = reportHash(report);
  const ix = await c.client.closeAction({
    issuer: c.key("issuer").publicKey,
    mint: c.mint,
    actionId,
    settlementMint: bond.settlementMint,
    onChain: enumName(action.settlementMode) === "onChain",
    reportHash: hash,
  });
  const result = await single(c, "issuer", [ix], { actionId });
  // The file's bytes are exactly what was hashed, so `sha256sum` of the download matches the on-chain hash.
  const file = c.reportPath(actionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(report));
  return { ...result, log: [`Report hash ${Buffer.from(hash).toString("hex")}`] };
}

async function transfer(c: Ctx, p: Params): Promise<TxResult> {
  const from = role(p.from, "from");
  const to = role(p.to, "to");
  if (from === to) throw new BadRequest("Sender and receiver must differ");
  const amount = int(p.amount, "amount", { min: 1 });
  const fromPk = c.key(from).publicKey;
  const toPk = c.key(to).publicKey;
  return single(c, from, [
    createAssociatedTokenAccountIdempotentInstruction(fromPk, bondAta(c.mint, toPk), toPk, c.mint, TOKEN_2022_PROGRAM_ID),
    transferBondsIx({ mint: c.mint, from: fromPk, to: toPk, amount }),
  ]);
}

async function run(c: Ctx, op: string, p: Params): Promise<TxResult> {
  const issuer = () => c.key("issuer").publicKey;
  switch (op) {
    case "issue": {
      const owner = c.key(role(p.to, "to")).publicKey;
      const amount = int(p.amount, "amount", { min: 1 });
      return single(c, "issuer", [
        createAssociatedTokenAccountIdempotentInstruction(issuer(), bondAta(c.mint, owner), owner, c.mint, TOKEN_2022_PROGRAM_ID),
        await c.client.issue({ issuer: issuer(), mint: c.mint, owner, amount }),
      ]);
    }
    case "registerHolder": {
      const owner = c.key(role(p.owner, "owner")).publicKey;
      const registrar = c.key("registrar").publicKey;
      return single(c, "registrar", [
        await c.client.registerHolder({ registrar, mint: c.mint, owner }),
        createAssociatedTokenAccountIdempotentInstruction(registrar, bondAta(c.mint, owner), owner, c.mint, TOKEN_2022_PROGRAM_ID),
        createAssociatedTokenAccountIdempotentInstruction(
          registrar,
          settlementAta(c.settlementMint, owner),
          owner,
          c.settlementMint,
          TOKEN_PROGRAM_ID,
        ),
      ]);
    }
    case "setHolderStatus": {
      const owner = c.key(role(p.owner, "owner")).publicKey;
      return single(c, "registrar", [
        await c.client.setHolderStatus({
          registrar: c.key("registrar").publicKey,
          mint: c.mint,
          owner,
          kycApproved: !!p.kycApproved,
          frozen: !!p.frozen,
        }),
      ]);
    }
    case "announce":
      return announce(c, p);
    case "fundEscrow": {
      const actionId = int(p.actionId, "actionId");
      return single(
        c,
        "issuer",
        [await c.client.fundEscrow({ issuer: issuer(), mint: c.mint, actionId, settlementMint: c.settlementMint })],
        { actionId },
      );
    }
    case "closeAction":
      return closeAction(c, p);
    case "transfer":
      return transfer(c, p);
    case "castVote": {
      const voter = role(p.role);
      const actionId = int(p.actionId, "actionId");
      return single(
        c,
        voter,
        [await c.client.castVote({ owner: c.key(voter).publicKey, mint: c.mint, actionId, yes: !!p.yes })],
        { actionId },
      );
    }
    case "crank": {
      const s = new RecordingSender(c.sender("crank"));
      const log = await crankOnce(c.client, c.mint, s);
      const last = s.signatures.at(-1);
      return {
        ok: true,
        signature: last,
        signatures: s.signatures,
        explorerUrl: last ? c.txUrl(last) : undefined,
        log: log.length ? log : ["Nothing to do yet"],
      };
    }
    case "payingAgent": {
      const s = new RecordingSender(c.sender("payingAgent"));
      const payments = await payingAgentOnce(c.client, c.mint, s);
      appendRailLedger(payments);
      const last = s.signatures.at(-1);
      return {
        ok: true,
        signature: last,
        signatures: s.signatures,
        explorerUrl: last ? c.txUrl(last) : undefined,
        log: payments.length
          ? payments.map((x) => `Paid ${x.owner.slice(0, 6)}… via ${x.railReference}`)
          : ["No instructed payments to settle"],
      };
    }
    default:
      throw new BadRequest(`Unknown op: ${op}`);
  }
}

export async function executeOp(op: string, params: Params): Promise<{ status: number; body: TxResult }> {
  let c: Ctx;
  try {
    c = ctx();
  } catch (e) {
    return { status: 500, body: { ok: false, error: (e as Error).message, logs: [] } };
  }
  try {
    return { status: 200, body: await run(c, op, params ?? {}) };
  } catch (e) {
    if (e instanceof BadRequest) return { status: 400, body: { ok: false, error: e.message, logs: [] } };
    const parsed = await parseTxError(e, c.connection);
    return { status: 422, body: { ok: false, error: parsed.error, logs: parsed.logs } };
  }
}
