import { BN, Program, type IdlAccounts, type IdlTypes, type Provider } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { CorpActions } from "./idl/corp_actions";
import idl from "./idl/corp_actions.json";
import {
  PROGRAM_ID,
  actionPda,
  bondPda,
  entitlementPda,
  escrowPda,
  eventAuthorityPda,
  extraMetasPda,
  holderPda,
} from "./pda";

export type BondConfig = IdlAccounts<CorpActions>["bondConfig"];
export type HolderRecord = IdlAccounts<CorpActions>["holderRecord"];
export type CorporateAction = IdlAccounts<CorpActions>["corporateAction"];
export type Entitlement = IdlAccounts<CorpActions>["entitlement"];
export type AnnounceArgs = IdlTypes<CorpActions>["announceArgs"];
export type InitBondArgs = IdlTypes<CorpActions>["initBondArgs"];
export type Checkpoints = IdlTypes<CorpActions>["checkpoints"];

export interface Account<T> {
  publicKey: PublicKey;
  account: T;
}

/** Name of an Anchor enum value, e.g. `{ coupon: {} }` → "coupon". */
export const enumName = <T extends object>(value: T): string => Object.keys(value)[0];

/** Value of a checkpointed history as of `ts` (same rule as the program). */
export function valueAt(history: Checkpoints, ts: number): bigint {
  let result = 0n;
  for (const c of history.items.slice(0, history.len)) {
    if (c.ts.toNumber() <= ts) result = BigInt(c.value.toString());
    else break;
  }
  return result;
}

export const bondAta = (mint: PublicKey, owner: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID);

export const settlementAta = (settlementMint: PublicKey, owner: PublicKey, tokenProgram = TOKEN_PROGRAM_ID) =>
  getAssociatedTokenAddressSync(settlementMint, owner, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);

export class MorroClient {
  readonly program: Program<CorpActions>;

  constructor(readonly connection: Connection, provider?: Provider) {
    this.program = new Program(idl as CorpActions, provider ?? ({ connection } as Provider));
  }

  private get events() {
    return { eventAuthority: eventAuthorityPda(), program: PROGRAM_ID };
  }

  // ---------------------------------------------------------------- fetchers

  fetchBond(mint: PublicKey): Promise<BondConfig | null> {
    return this.program.account.bondConfig.fetchNullable(bondPda(mint));
  }

  fetchAction(action: PublicKey): Promise<CorporateAction | null> {
    return this.program.account.corporateAction.fetchNullable(action);
  }

  fetchHolder(mint: PublicKey, owner: PublicKey): Promise<HolderRecord | null> {
    return this.program.account.holderRecord.fetchNullable(holderPda(mint, owner));
  }

  async fetchHolders(mint: PublicKey): Promise<Account<HolderRecord>[]> {
    return this.program.account.holderRecord.all([{ memcmp: { offset: 8, bytes: mint.toBase58() } }]);
  }

  async fetchActions(mint: PublicKey): Promise<Account<CorporateAction>[]> {
    const all = await this.program.account.corporateAction.all([
      { memcmp: { offset: 8, bytes: mint.toBase58() } },
    ]);
    return all.sort((a, b) => a.account.actionId - b.account.actionId);
  }

  async fetchEntitlements(action: PublicKey): Promise<Account<Entitlement>[]> {
    return this.program.account.entitlement.all([{ memcmp: { offset: 8, bytes: action.toBase58() } }]);
  }

  /**
   * Bond, holders, actions and entitlements for one mint in a single getProgramAccounts call,
   * decoded locally by account discriminator. Much lighter on rate-limited RPCs than one query per type.
   */
  async fetchMintState(mint: PublicKey): Promise<{
    bond: BondConfig | null;
    holders: Account<HolderRecord>[];
    actions: Account<CorporateAction>[];
    entitlements: Account<Entitlement>[];
  }> {
    const raw = await this.connection.getProgramAccounts(PROGRAM_ID, { commitment: "confirmed" });
    const kinds = this.program.idl.accounts.map((a) => ({ name: a.name, disc: Buffer.from(a.discriminator) }));
    const decoded: { kind: string; publicKey: PublicKey; account: unknown }[] = [];
    for (const { pubkey, account } of raw) {
      const data = Buffer.from(account.data);
      const kind = kinds.find((k) => data.subarray(0, 8).equals(k.disc));
      if (!kind) continue;
      decoded.push({ kind: kind.name, publicKey: pubkey, account: this.program.coder.accounts.decode(kind.name, data) });
    }
    const of = <T>(kind: string) =>
      decoded.filter((d) => d.kind === kind).map((d) => ({ publicKey: d.publicKey, account: d.account as T }));
    const bond = of<BondConfig>("bondConfig").find((b) => b.account.mint.equals(mint))?.account ?? null;
    const holders = of<HolderRecord>("holderRecord").filter((h) => h.account.mint.equals(mint));
    const actions = of<CorporateAction>("corporateAction")
      .filter((a) => a.account.mint.equals(mint))
      .sort((a, b) => a.account.actionId - b.account.actionId);
    const actionKeys = new Set(actions.map((a) => a.publicKey.toBase58()));
    const entitlements = of<Entitlement>("entitlement").filter((e) => actionKeys.has(e.account.action.toBase58()));
    return { bond, holders, actions, entitlements };
  }

  async fetchBondsList(): Promise<Account<BondConfig>[]> {
    return this.program.account.bondConfig.all();
  }

  // ----------------------------------------------------------- instructions

  initializeBond(p: {
    issuer: PublicKey;
    mint: PublicKey;
    settlementMint: PublicKey;
    args: InitBondArgs;
  }): Promise<TransactionInstruction> {
    return this.program.methods
      .initializeBond(p.args)
      .accountsStrict({
        issuer: p.issuer,
        mint: p.mint,
        settlementMint: p.settlementMint,
        bond: bondPda(p.mint),
        extraAccountMetaList: extraMetasPda(p.mint),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        ...this.events,
      })
      .instruction();
  }

  registerHolder(p: { registrar: PublicKey; mint: PublicKey; owner: PublicKey }) {
    return this.program.methods
      .registerHolder()
      .accountsStrict({
        registrar: p.registrar,
        bond: bondPda(p.mint),
        owner: p.owner,
        holder: holderPda(p.mint, p.owner),
        systemProgram: SystemProgram.programId,
        ...this.events,
      })
      .instruction();
  }

  setHolderStatus(p: { registrar: PublicKey; mint: PublicKey; owner: PublicKey; kycApproved: boolean; frozen: boolean }) {
    return this.program.methods
      .setHolderStatus(p.kycApproved, p.frozen)
      .accountsStrict({
        registrar: p.registrar,
        bond: bondPda(p.mint),
        holder: holderPda(p.mint, p.owner),
        ...this.events,
      })
      .instruction();
  }

  issue(p: { issuer: PublicKey; mint: PublicKey; owner: PublicKey; amount: number | bigint }) {
    return this.program.methods
      .issue(new BN(p.amount.toString()))
      .accountsStrict({
        issuer: p.issuer,
        bond: bondPda(p.mint),
        mint: p.mint,
        holder: holderPda(p.mint, p.owner),
        holderTokenAccount: bondAta(p.mint, p.owner),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        ...this.events,
      })
      .instruction();
  }

  /** `actionId` must be the bond's current `nextActionId`. */
  announce(p: { issuer: PublicKey; mint: PublicKey; actionId: number; args: AnnounceArgs }) {
    return this.program.methods
      .announce(p.args)
      .accountsStrict({
        issuer: p.issuer,
        bond: bondPda(p.mint),
        action: actionPda(p.mint, p.actionId),
        systemProgram: SystemProgram.programId,
        ...this.events,
      })
      .instruction();
  }

  snapshotHolder(p: { payer: PublicKey; mint: PublicKey; actionId: number; owner: PublicKey }) {
    const action = actionPda(p.mint, p.actionId);
    return this.program.methods
      .snapshotHolder()
      .accountsStrict({
        payer: p.payer,
        bond: bondPda(p.mint),
        action,
        mint: p.mint,
        holder: holderPda(p.mint, p.owner),
        entitlement: entitlementPda(action, p.owner),
        systemProgram: SystemProgram.programId,
        ...this.events,
      })
      .instruction();
  }

  finalizeSnapshot(p: { mint: PublicKey; actionId: number }) {
    return this.program.methods
      .finalizeSnapshot()
      .accountsStrict({ bond: bondPda(p.mint), action: actionPda(p.mint, p.actionId), ...this.events })
      .instruction();
  }

  fundEscrow(p: {
    issuer: PublicKey;
    mint: PublicKey;
    actionId: number;
    settlementMint: PublicKey;
    settlementTokenProgram?: PublicKey;
  }) {
    const action = actionPda(p.mint, p.actionId);
    const tp = p.settlementTokenProgram ?? TOKEN_PROGRAM_ID;
    return this.program.methods
      .fundEscrow()
      .accountsStrict({
        issuer: p.issuer,
        bond: bondPda(p.mint),
        action,
        settlementMint: p.settlementMint,
        issuerSettlementAccount: settlementAta(p.settlementMint, p.issuer, tp),
        escrow: escrowPda(action),
        settlementTokenProgram: tp,
        systemProgram: SystemProgram.programId,
        ...this.events,
      })
      .instruction();
  }

  distribute(p: {
    payer: PublicKey;
    mint: PublicKey;
    actionId: number;
    owner: PublicKey;
    settlementMint: PublicKey;
    onChain: boolean;
    retires: boolean;
    settlementTokenProgram?: PublicKey;
  }) {
    const action = actionPda(p.mint, p.actionId);
    const tp = p.settlementTokenProgram ?? TOKEN_PROGRAM_ID;
    return this.program.methods
      .distribute()
      .accountsStrict({
        payer: p.payer,
        bond: bondPda(p.mint),
        mint: p.mint,
        action,
        entitlement: entitlementPda(action, p.owner),
        holder: holderPda(p.mint, p.owner),
        holderBondAccount: p.retires && p.onChain ? bondAta(p.mint, p.owner) : null,
        settlementMint: p.settlementMint,
        escrow: p.onChain ? escrowPda(action) : null,
        holderSettlementAccount: p.onChain ? settlementAta(p.settlementMint, p.owner, tp) : null,
        bondTokenProgram: TOKEN_2022_PROGRAM_ID,
        settlementTokenProgram: tp,
        ...this.events,
      })
      .instruction();
  }

  confirmPayment(p: {
    payingAgent: PublicKey;
    mint: PublicKey;
    actionId: number;
    owner: PublicKey;
    paymentRef: Uint8Array;
    retires: boolean;
  }) {
    const action = actionPda(p.mint, p.actionId);
    return this.program.methods
      .confirmPayment(Array.from(p.paymentRef))
      .accountsStrict({
        payingAgent: p.payingAgent,
        bond: bondPda(p.mint),
        mint: p.mint,
        action,
        entitlement: entitlementPda(action, p.owner),
        holder: holderPda(p.mint, p.owner),
        holderBondAccount: p.retires ? bondAta(p.mint, p.owner) : null,
        bondTokenProgram: TOKEN_2022_PROGRAM_ID,
        ...this.events,
      })
      .instruction();
  }

  closeAction(p: {
    issuer: PublicKey;
    mint: PublicKey;
    actionId: number;
    settlementMint: PublicKey;
    onChain: boolean;
    reportHash: Uint8Array;
    settlementTokenProgram?: PublicKey;
  }) {
    const action = actionPda(p.mint, p.actionId);
    const tp = p.settlementTokenProgram ?? TOKEN_PROGRAM_ID;
    return this.program.methods
      .closeAction(Array.from(p.reportHash))
      .accountsStrict({
        issuer: p.issuer,
        bond: bondPda(p.mint),
        action,
        settlementMint: p.settlementMint,
        escrow: p.onChain ? escrowPda(action) : null,
        issuerSettlementAccount: p.onChain ? settlementAta(p.settlementMint, p.issuer, tp) : null,
        settlementTokenProgram: tp,
        ...this.events,
      })
      .instruction();
  }

  castVote(p: { owner: PublicKey; mint: PublicKey; actionId: number; yes: boolean }) {
    const action = actionPda(p.mint, p.actionId);
    return this.program.methods
      .castVote(p.yes)
      .accountsStrict({
        owner: p.owner,
        action,
        entitlement: entitlementPda(action, p.owner),
        ...this.events,
      })
      .instruction();
  }

  finalizeVote(p: { mint: PublicKey; actionId: number }) {
    return this.program.methods
      .finalizeVote()
      .accountsStrict({
        bond: bondPda(p.mint),
        mint: p.mint,
        action: actionPda(p.mint, p.actionId),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        ...this.events,
      })
      .instruction();
  }
}

/**
 * A Token-2022 transfer of bonds between holders' ATAs, with the accounts the
 * transfer hook needs appended (BondConfig, both HolderRecords, the hook program
 * and its ExtraAccountMetaList), so no RPC lookup is required.
 */
export function transferBondsIx(p: {
  mint: PublicKey;
  from: PublicKey;
  to: PublicKey;
  amount: number | bigint;
}): TransactionInstruction {
  const ix = createTransferCheckedInstruction(
    bondAta(p.mint, p.from),
    p.mint,
    bondAta(p.mint, p.to),
    p.from,
    BigInt(p.amount),
    0,
    [],
    TOKEN_2022_PROGRAM_ID,
  );
  ix.keys.push(
    { pubkey: bondPda(p.mint), isSigner: false, isWritable: false },
    { pubkey: holderPda(p.mint, p.from), isSigner: false, isWritable: true },
    { pubkey: holderPda(p.mint, p.to), isSigner: false, isWritable: true },
    { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: extraMetasPda(p.mint), isSigner: false, isWritable: false },
  );
  return ix;
}
