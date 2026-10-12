import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getExtensionData,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
import { unpack as unpackMetadata } from "@solana/spl-token-metadata";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Clock, FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";
import path from "path";
import { MorroClient, PROGRAM_ID, bondMintSizes, createBondMintInstructions, type BondMintParams } from "../sdk/src";

export class Harness {
  readonly svm: LiteSVM;
  readonly client: MorroClient;

  constructor() {
    this.svm = new LiteSVM();
    this.svm.addProgramFromFile(PROGRAM_ID, path.join(__dirname, "../target/deploy/corp_actions.so"));
    // Instruction builders never touch the connection; account reads go through `decode`.
    this.client = new MorroClient(new Connection("http://127.0.0.1:8899"));
  }

  now(): number {
    return Number(this.svm.getClock().unixTimestamp);
  }

  warpTo(ts: number) {
    const c = this.svm.getClock();
    this.svm.setClock(new Clock(c.slot + 1n, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, BigInt(ts)));
  }

  wallet(sol = 10): Keypair {
    const kp = Keypair.generate();
    this.svm.airdrop(kp.publicKey, BigInt(sol * LAMPORTS_PER_SOL));
    return kp;
  }

  /** Sends one transaction; throws with program logs on failure. */
  send(ixs: TransactionInstruction[], signers: Keypair[]): TransactionMetadata {
    const tx = new Transaction();
    tx.recentBlockhash = this.svm.latestBlockhash();
    tx.feePayer = signers[0].publicKey;
    tx.add(...ixs);
    tx.sign(...signers);
    const res = this.svm.sendTransaction(tx);
    this.svm.expireBlockhash();
    if (res instanceof FailedTransactionMetadata) {
      throw new Error(`${res.err()}\n${res.meta().logs().join("\n")}`);
    }
    return res;
  }

  /** Asserts the transaction fails with the given Anchor error name. */
  expectError(ixs: TransactionInstruction[], signers: Keypair[], errorName: string) {
    let logs = "";
    try {
      this.send(ixs, signers);
    } catch (e) {
      logs = String(e);
    }
    if (!logs.includes(errorName)) {
      throw new Error(`expected ${errorName}, got: ${logs ? logs.slice(-1500) : "success"}`);
    }
  }

  decode<T>(name: "bondConfig" | "holderRecord" | "corporateAction" | "entitlement", address: PublicKey): T {
    const acc = this.svm.getAccount(address);
    if (!acc) throw new Error(`account ${address.toBase58()} not found`);
    return this.client.program.coder.accounts.decode(name, Buffer.from(acc.data)) as T;
  }

  exists(address: PublicKey): boolean {
    const acc = this.svm.getAccount(address);
    return !!acc && acc.lamports > 0;
  }

  tokenBalance(account: PublicKey, programId: PublicKey): bigint {
    const acc = this.svm.getAccount(account);
    if (!acc) return 0n;
    return unpackAccount(account, { ...acc, data: Buffer.from(acc.data) }, programId).amount;
  }

  mintSupply(mint: PublicKey, programId = TOKEN_2022_PROGRAM_ID): bigint {
    const acc = this.svm.getAccount(mint)!;
    return unpackMint(mint, { ...acc, data: Buffer.from(acc.data) }, programId).supply;
  }

  metadataField(mint: PublicKey, key: string): string | undefined {
    const acc = this.svm.getAccount(mint)!;
    const m = unpackMint(mint, { ...acc, data: Buffer.from(acc.data) }, TOKEN_2022_PROGRAM_ID);
    const data = getExtensionData(ExtensionType.TokenMetadata, m.tlvData);
    if (!data) return undefined;
    return unpackMetadata(data).additionalMetadata.find(([k]) => k === key)?.[1];
  }

  createBondMint(params: BondMintParams, signers: { payer: Keypair; issuer: Keypair; mint: Keypair }) {
    const { totalLen } = bondMintSizes(params);
    const lamports = Number(this.svm.minimumBalanceForRentExemption(BigInt(totalLen)));
    const [create, metadata] = createBondMintInstructions(params, lamports);
    this.send(create, [signers.payer, signers.issuer, signers.mint]);
    this.send(metadata, [signers.payer, signers.issuer]);
  }

  /** Classic SPL token standing in for a tenge stablecoin (2 decimals = tiyn). */
  createSettlementMint(authority: Keypair): PublicKey {
    const mint = Keypair.generate();
    const lamports = Number(this.svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE)));
    this.send(
      [
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: mint.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mint.publicKey, 2, authority.publicKey, null, TOKEN_PROGRAM_ID),
      ],
      [authority, mint],
    );
    return mint.publicKey;
  }

  createAta(payer: Keypair, mint: PublicKey, owner: PublicKey, programId: PublicKey): PublicKey {
    const ata = getAssociatedTokenAddressSync(mint, owner, true, programId, ASSOCIATED_TOKEN_PROGRAM_ID);
    this.send(
      [createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, owner, mint, programId)],
      [payer],
    );
    return ata;
  }

  mintSettlement(authority: Keypair, mint: PublicKey, to: PublicKey, amount: bigint) {
    this.send([createMintToInstruction(mint, to, authority.publicKey, amount, [], TOKEN_PROGRAM_ID)], [authority]);
  }
}
