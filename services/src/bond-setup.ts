/** Shared bond creation used by the demo setup and the live end-to-end check. */
import { BN } from "@coral-xyz/anchor";
import {
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";
import {
  MorroClient,
  bondAta,
  bondMintSizes,
  createBondMintInstructions,
  settlementAta,
  type BondMintParams,
} from "@morro/sdk";
import { KeypairSender, ROLES, type Role } from "./demo-config";

const APR_15_2026 = 1_776_211_200;
const OCT_15_2027 = 1_823_558_400;

const ISSUANCE: [Role, number][] = [
  ["holderA", 12_000],
  ["holderB", 5_000],
  ["holderC", 3_000],
];

export async function fundRoles(connection: Connection, keys: Record<Role, Keypair>, local: boolean) {
  // Devnet budget (SOL): enough for rent on accounts each role creates during a demo.
  const wanted: Partial<Record<Role, number>> = { issuer: 0.5, crank: 0.3, registrar: 0.1, payingAgent: 0.05 };
  for (const role of ROLES) {
    const pk = keys[role].publicKey;
    const target = Math.round((wanted[role] ?? 0.05) * LAMPORTS_PER_SOL);
    const balance = await connection.getBalance(pk);
    if (balance >= target / 2) continue;
    if (local) {
      const sig = await connection.requestAirdrop(pk, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    } else {
      const funderPath = process.env.FUNDER_KEYPAIR ?? path.join(os.homedir(), ".config/solana/id.json");
      const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(funderPath, "utf8"))));
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: pk, lamports: target })),
        [funder],
        { commitment: "confirmed" },
      );
    }
    console.log(`  funded ${role} ${pk.toBase58()}`);
  }
}

/** Creates tKZT, the KZTB-27 bond mint and bond, registers holders A/B/C and issues 12,000 / 5,000 / 3,000. */
export async function createDemoBond(
  connection: Connection,
  keys: Record<Role, Keypair>,
  log: (msg: string) => void = console.log,
): Promise<{ mint: PublicKey; settlementMint: PublicKey }> {
  const client = new MorroClient(connection);
  const issuer = keys.issuer;
  const send = (signers: Keypair[], ...ixs: Parameters<Transaction["add"]>) =>
    sendAndConfirmTransaction(connection, new Transaction().add(...ixs), signers, { commitment: "confirmed" });

  // tKZT: a classic SPL token with 2 decimals (tiyn), standing in for a tenge stablecoin.
  const tkzt = Keypair.generate();
  await send(
    [issuer, tkzt],
    SystemProgram.createAccount({
      fromPubkey: issuer.publicKey,
      newAccountPubkey: tkzt.publicKey,
      space: MINT_SIZE,
      lamports: await connection.getMinimumBalanceForRentExemption(MINT_SIZE),
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(tkzt.publicKey, 2, issuer.publicKey, null, TOKEN_PROGRAM_ID),
  );
  const issuerCash = settlementAta(tkzt.publicKey, issuer.publicKey);
  await send(
    [issuer],
    createAssociatedTokenAccountIdempotentInstruction(issuer.publicKey, issuerCash, issuer.publicKey, tkzt.publicKey),
    createMintToInstruction(tkzt.publicKey, issuerCash, issuer.publicKey, 10_000_000_000n), // 100,000,000.00 tKZT
  );
  log(`  tKZT settlement token ${tkzt.publicKey.toBase58()}`);

  // KZTB-27: Token-2022 bond mint with transfer hook, permanent delegate and on-mint metadata.
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const params: BondMintParams = {
    payer: issuer.publicKey,
    issuer: issuer.publicKey,
    mint,
    name: "Morro Test Bond 2027",
    symbol: "KZTB-27",
    uri: "",
    fields: [
      ["issuer", "Morro Demo Issuer JSC (test)"],
      ["coupon", "14.50% semi-annual, 30/360"],
      ["face_value", "1000 KZT"],
      ["maturity", "2027-10-15"],
    ],
  };
  const lamports = await connection.getMinimumBalanceForRentExemption(bondMintSizes(params).totalLen);
  const [create, metadata] = createBondMintInstructions(params, lamports);
  await send([issuer, mintKp], ...create);
  await send([issuer], ...metadata);
  await send(
    [issuer],
    await client.initializeBond({
      issuer: issuer.publicKey,
      mint,
      settlementMint: tkzt.publicKey,
      args: {
        faceValue: new BN(100_000),
        couponRateBps: 1_450,
        couponFreq: 2,
        dayCount: { thirty360: {} },
        issueTs: new BN(APR_15_2026),
        maturityTs: new BN(OCT_15_2027),
        registrar: keys.registrar.publicKey,
        payingAgent: keys.payingAgent.publicKey,
      },
    }),
  );
  log(`  KZTB-27 bond mint ${mint.toBase58()}`);

  const registrar = new KeypairSender(connection, keys.registrar);
  for (const role of ["holderA", "holderB", "holderC"] as Role[]) {
    const owner = keys[role].publicKey;
    await registrar.send([await client.registerHolder({ registrar: registrar.publicKey, mint, owner })]);
  }
  for (const role of ["holderA", "holderB", "holderC", "outsider"] as Role[]) {
    const owner = keys[role].publicKey;
    await send(
      [issuer],
      createAssociatedTokenAccountIdempotentInstruction(issuer.publicKey, bondAta(mint, owner), owner, mint, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(
        issuer.publicKey,
        settlementAta(tkzt.publicKey, owner),
        owner,
        tkzt.publicKey,
      ),
    );
  }
  for (const [role, amount] of ISSUANCE) {
    await send([issuer], await client.issue({ issuer: issuer.publicKey, mint, owner: keys[role].publicKey, amount }));
    log(`  issued ${amount.toLocaleString()} bonds to ${role}`);
  }

  return { mint, settlementMint: tkzt.publicKey };
}
