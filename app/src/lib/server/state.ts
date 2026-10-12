import "server-only";
import { TOKEN_2022_PROGRAM_ID, getTokenMetadata } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import {
  bondAta,
  bondPda,
  chainTime,
  enumName,
  escrowPda,
  settlementAta,
  type Account,
  type CorporateAction,
  type Entitlement,
} from "@morro/sdk";
import { ROLES } from "@morro/services/src/demo-config";
import type {
  ActionView,
  BondView,
  EntitlementView,
  HolderView,
  MetadataView,
  RoleName,
  StateView,
  WalletView,
} from "../types";
import { ROLE_LABELS, ctx, roleLabel, type Ctx } from "./chain";
import { hex, isZero } from "./serialize";

/** Token account amount (SPL and Token-2022 share the base layout: amount is a u64 at offset 64). */
const tokenAmount = (data: Buffer | null | undefined): bigint =>
  data && data.length >= 72 ? data.readBigUInt64LE(64) : 0n;

export function entitlementView(c: Ctx, { publicKey, account: e }: Account<Entitlement>): EntitlementView {
  const owner = e.owner.toBase58();
  const role = (c.roleByAddress.get(owner) ?? null) as RoleName | null;
  return {
    address: publicKey.toBase58(),
    owner,
    ownerRole: role,
    ownerLabel: roleLabel(role, owner),
    balanceAtRecord: e.balanceAtRecord.toString(),
    amount: e.amount.toString(),
    bondsToRetire: e.bondsToRetire.toString(),
    status: enumName(e.status) as EntitlementView["status"],
    settledTs: e.settledTs.toNumber(),
    paymentRef: isZero(e.paymentRef) ? "" : hex(e.paymentRef),
    vote: enumName(e.vote) as EntitlementView["vote"],
  };
}

export function actionView(
  c: Ctx,
  key: PublicKey,
  a: CorporateAction,
  ents: Account<Entitlement>[],
  escrowBalance: string | null,
): ActionView {
  const entitlements = ents
    .map((e) => entitlementView(c, e))
    .sort((x, y) => (x.ownerLabel < y.ownerLabel ? -1 : x.ownerLabel > y.ownerLabel ? 1 : 0));
  return {
    address: key.toBase58(),
    actionId: a.actionId,
    kind: enumName(a.kind) as ActionView["kind"],
    status: enumName(a.status) as ActionView["status"],
    settlementMode: enumName(a.settlementMode) as ActionView["settlementMode"],
    recordTs: a.recordTs.toNumber(),
    paymentTs: a.paymentTs.toNumber(),
    periodStartTs: a.periodStartTs.toNumber(),
    periodEndTs: a.periodEndTs.toNumber(),
    redeemBps: a.redeemBps,
    newMaturityTs: a.newMaturityTs.toNumber(),
    quorumBps: a.quorumBps,
    thresholdBps: a.thresholdBps,
    voteEndTs: a.voteEndTs.toNumber(),
    supplyAtRecord: a.supplyAtRecord.toString(),
    snapshottedBalance: a.snapshottedBalance.toString(),
    holdersSnapshotted: a.holdersSnapshotted,
    holdersSettled: a.holdersSettled,
    totalEntitlement: a.totalEntitlement.toString(),
    totalPaid: a.totalPaid.toString(),
    totalRetired: a.totalRetired.toString(),
    votesYes: a.votesYes.toString(),
    votesNo: a.votesNo.toString(),
    snapshotDigest: hex(a.snapshotDigest),
    reportHash: isZero(a.reportHash) ? "" : hex(a.reportHash),
    announcedTs: a.announcedTs.toNumber(),
    closedTs: a.closedTs.toNumber(),
    escrowBalance,
    reportAvailable: fs.existsSync(c.reportPath(a.actionId)),
    entitlements,
  };
}

async function readMetadata(c: Ctx): Promise<MetadataView | null> {
  try {
    const m = await getTokenMetadata(c.connection, c.mint, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (!m) return null;
    return { name: m.name, symbol: m.symbol, uri: m.uri, fields: Object.fromEntries(m.additionalMetadata) };
  } catch {
    return null;
  }
}

export async function buildState(): Promise<StateView> {
  const c = ctx();
  const { config, client, connection, mint, settlementMint } = c;

  const [bond, holders, actions, now, metadata] = await Promise.all([
    client.fetchBond(mint),
    client.fetchHolders(mint),
    client.fetchActions(mint),
    chainTime(connection),
    readMetadata(c),
  ]);
  const entitlementsByAction = await Promise.all(actions.map((a) => client.fetchEntitlements(a.publicKey)));

  // One batched read for every token balance and SOL balance we show.
  const owners = new Set<string>([...ROLES.map((r) => config.roles[r]), ...holders.map((h) => h.account.owner.toBase58())]);
  const ownerList = [...owners];
  const addrs: PublicKey[] = [];
  for (const o of ownerList) {
    const pk = new PublicKey(o);
    addrs.push(pk, bondAta(mint, pk), settlementAta(settlementMint, pk));
  }
  const escrowStart = addrs.length;
  for (const a of actions) addrs.push(escrowPda(a.publicKey));
  const infos: Awaited<ReturnType<typeof connection.getMultipleAccountsInfo>> = [];
  for (let i = 0; i < addrs.length; i += 100) {
    infos.push(...(await connection.getMultipleAccountsInfo(addrs.slice(i, i + 100), "confirmed")));
  }
  const balances = new Map<string, { sol: number; bond: bigint; cash: bigint }>();
  ownerList.forEach((o, i) => {
    const [sys, b, s] = [infos[i * 3], infos[i * 3 + 1], infos[i * 3 + 2]];
    balances.set(o, { sol: (sys?.lamports ?? 0) / 1e9, bond: tokenAmount(b?.data), cash: tokenAmount(s?.data) });
  });

  const holderByOwner = new Map(holders.map((h) => [h.account.owner.toBase58(), h.account]));

  const bondView: BondView | null = bond
    ? {
        address: bondPda(mint).toBase58(),
        mint: bond.mint.toBase58(),
        issuer: bond.issuer.toBase58(),
        registrar: bond.registrar.toBase58(),
        payingAgent: bond.payingAgent.toBase58(),
        settlementMint: bond.settlementMint.toBase58(),
        faceValue: bond.faceValue.toString(),
        couponRateBps: bond.couponRateBps,
        couponFreq: bond.couponFreq,
        dayCount: enumName(bond.dayCount) as BondView["dayCount"],
        issueTs: bond.issueTs.toNumber(),
        maturityTs: bond.maturityTs.toNumber(),
        status: enumName(bond.status) as BondView["status"],
        transferLockTs: bond.transferLockTs.toNumber(),
        nextActionId: bond.nextActionId,
        supply: bond.supply.toString(),
        holderCount: bond.holderCount,
        pendingRecordTs: bond.pendingRecordTs.map((t) => t.toNumber()).filter((t) => t !== 0),
      }
    : null;

  const holderViews: HolderView[] = holders
    .map(({ publicKey, account: h }) => {
      const owner = h.owner.toBase58();
      const role = (c.roleByAddress.get(owner) ?? null) as RoleName | null;
      const bal = balances.get(owner);
      return {
        address: publicKey.toBase58(),
        owner,
        role,
        label: roleLabel(role, owner),
        kycApproved: h.kycApproved,
        frozen: h.frozen,
        balance: h.balance.toString(),
        bondBalance: (bal?.bond ?? 0n).toString(),
        cashBalance: (bal?.cash ?? 0n).toString(),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const wallets: WalletView[] = ROLES.map((role) => {
    const address = config.roles[role];
    const bal = balances.get(address);
    const rec = holderByOwner.get(address);
    return {
      role,
      label: ROLE_LABELS[role],
      address,
      sol: bal?.sol ?? 0,
      bondBalance: (bal?.bond ?? 0n).toString(),
      cashBalance: (bal?.cash ?? 0n).toString(),
      registered: !!rec,
      kycApproved: rec?.kycApproved ?? false,
      frozen: rec?.frozen ?? false,
      recordBalance: rec ? rec.balance.toString() : "0",
    };
  });

  const actionViews = actions.map((a, i) => {
    const escrow = infos[escrowStart + i];
    return actionView(c, a.publicKey, a.account, entitlementsByAction[i], escrow ? tokenAmount(escrow.data).toString() : null);
  });

  return {
    config: {
      rpcUrl: config.rpcUrl,
      cluster: config.cluster,
      programId: config.programId,
      mint: config.mint,
      settlementMint: config.settlementMint,
      settlementDecimals: config.settlementDecimals,
      roles: config.roles,
      roleLabels: ROLE_LABELS,
    },
    chainTime: now,
    serverTime: Math.floor(Date.now() / 1000),
    bond: bondView,
    metadata,
    holders: holderViews,
    wallets,
    actions: actionViews,
  };
}
