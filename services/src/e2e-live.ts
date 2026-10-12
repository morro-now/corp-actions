/**
 * Live end-to-end check against a running cluster (local validator by default), in real time:
 * coupon (on-chain settlement), consent vote, and partial redemption (off-chain settlement),
 * driven by the same crank and paying-agent code the services run. Uses its own fresh bond
 * and throwaway wallets, so it never touches the demo config.
 *
 *   RPC_URL=http://127.0.0.1:8899 npm run e2e:live
 */
import { BN } from "@coral-xyz/anchor";
import { getTokenMetadata, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import assert from "assert";
import {
  MorroClient,
  actionPda,
  bondAta,
  buildActionReport,
  chainTime,
  crankOnce,
  enumName,
  fetchEvents,
  payingAgentOnce,
  replaySnapshotDigest,
  reportHash,
  settlementAta,
  transferBondsIx,
  type AnnounceArgs,
} from "@morro/sdk";
import { createDemoBond, fundRoles } from "./bond-setup";
import { KeypairSender, ROLES, type Role } from "./demo-config";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const APR_15_2026 = 1_776_211_200;
const OCT_15_2026 = 1_792_022_400;
const APR_15_2028 = 1_839_369_600;

const blank = (): AnnounceArgs => ({
  kind: { coupon: {} },
  settlementMode: { onChain: {} },
  recordTs: new BN(0),
  paymentTs: new BN(0),
  periodStartTs: new BN(0),
  periodEndTs: new BN(0),
  redeemBps: 0,
  newMaturityTs: new BN(0),
  quorumBps: 0,
  thresholdBps: 0,
  voteEndTs: new BN(0),
});

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const client = new MorroClient(connection);
  const keys = Object.fromEntries(ROLES.map((r) => [r, Keypair.generate()])) as Record<Role, Keypair>;
  const as = (role: Role) => new KeypairSender(connection, keys[role]);
  const pk = (role: Role) => keys[role].publicKey;
  const log = (msg: string) => console.log(`  ${msg}`);
  const ok = (msg: string) => console.log(`  ✓ ${msg}`);
  const waitUntil = async (ts: number) => {
    while ((await chainTime(connection)) <= ts) await new Promise((r) => setTimeout(r, 1000));
  };
  const cash = async (role: Role, settlementMint: PublicKey) =>
    (await getAccount(connection, settlementAta(settlementMint, pk(role)), "confirmed", TOKEN_PROGRAM_ID)).amount;
  const bondsOf = async (role: Role, mint: PublicKey) =>
    (await getAccount(connection, bondAta(mint, pk(role)), "confirmed", TOKEN_2022_PROGRAM_ID)).amount;

  console.log(`Morro live e2e on ${RPC_URL}`);
  await fundRoles(connection, keys, true);
  const { mint, settlementMint } = await createDemoBond(connection, keys, log);
  const issuer = as("issuer");
  const crank = as("crank");
  const announce = async (args: AnnounceArgs) => {
    const bond = (await client.fetchBond(mint))!;
    await issuer.send([await client.announce({ issuer: issuer.publicKey, mint, actionId: bond.nextActionId, args })]);
    return bond.nextActionId;
  };

  // --- Coupon, settled on-chain --------------------------------------------------------
  console.log("Coupon payment");
  let now = await chainTime(connection);
  const couponId = await announce({
    ...blank(),
    recordTs: new BN(now + 10),
    paymentTs: new BN(now + 18),
    periodStartTs: new BN(APR_15_2026),
    periodEndTs: new BN(OCT_15_2026),
  });
  await as("holderA").send([transferBondsIx({ mint, from: pk("holderA"), to: pk("holderB"), amount: 2_000 })]);
  log("A sold 2,000 bonds to B before the record date");
  let rejected = false;
  try {
    await as("holderA").send([transferBondsIx({ mint, from: pk("holderA"), to: pk("outsider"), amount: 1 })]);
  } catch (e) {
    rejected = String(e).includes("ReceiverNotApproved");
  }
  assert(rejected, "transfer to a non-KYC wallet must fail");
  ok("transfer to a non-KYC wallet rejected by the hook");

  const couponAction = (await client.fetchAction(actionPda(mint, couponId)))!;
  await waitUntil(couponAction.recordTs.toNumber());
  await as("holderB").send([transferBondsIx({ mint, from: pk("holderB"), to: pk("holderC"), amount: 1_000 })]);
  log("B sold 1,000 bonds to C after the record date");
  await crankOnce(client, mint, crank, log);
  await issuer.send([await client.fundEscrow({ issuer: issuer.publicKey, mint, actionId: couponId, settlementMint })]);
  log("issuer funded the escrow");
  await waitUntil(couponAction.paymentTs.toNumber() - 1);
  await crankOnce(client, mint, crank, log);
  assert.equal(await cash("holderA", settlementMint), 72_500_000n);
  assert.equal(await cash("holderB", settlementMint), 50_750_000n);
  assert.equal(await cash("holderC", settlementMint), 21_750_000n);
  ok("paid 725,000.00 / 507,500.00 / 217,500.00 tKZT from record-date holdings 10,000 / 7,000 / 3,000");

  const key = actionPda(mint, couponId);
  const ents = await client.fetchEntitlements(key);
  const report = buildActionReport((await client.fetchBond(mint))!, key, (await client.fetchAction(key))!, ents);
  await issuer.send([
    await client.closeAction({
      issuer: issuer.publicKey,
      mint,
      actionId: couponId,
      settlementMint,
      onChain: true,
      reportHash: reportHash(report),
    }),
  ]);
  const closed = (await client.fetchAction(key))!;
  assert.equal(enumName(closed.status), "closed");
  const events = await fetchEvents(connection, key);
  const snaps = events.filter((e) => e.name === "holderSnapshotted");
  const replay = replaySnapshotDigest(
    snaps.map((e) => ({
      owner: e.data.owner as PublicKey,
      balance: BigInt((e.data.balanceAtRecord as BN).toString()),
      amount: BigInt((e.data.amount as BN).toString()),
    })),
  );
  assert(Buffer.from(replay).equals(Buffer.from(closed.snapshotDigest)), "digest replay must match");
  assert(Buffer.from(reportHash(report)).equals(Buffer.from(closed.reportHash)), "report hash must match");
  ok(`closed; ${events.length} events decoded, snapshot digest and report hash verified`);

  // --- Consent vote to extend maturity ----------------------------------------------------
  console.log("Consent vote");
  now = await chainTime(connection);
  const voteId = await announce({
    ...blank(),
    kind: { vote: {} },
    recordTs: new BN(now + 6),
    newMaturityTs: new BN(APR_15_2028),
    quorumBps: 5_000,
    thresholdBps: 6_667,
    voteEndTs: new BN(now + 20),
  });
  await waitUntil(now + 6);
  await crankOnce(client, mint, crank, log);
  for (const role of ["holderA", "holderB"] as Role[]) {
    await as(role).send([await client.castVote({ owner: pk(role), mint, actionId: voteId, yes: true })]);
  }
  log("A (10,000) and B (6,000) voted yes; C (4,000) abstained");
  await waitUntil(now + 20);
  await crankOnce(client, mint, crank, log);
  const vote = (await client.fetchAction(actionPda(mint, voteId)))!;
  assert.equal(enumName(vote.status), "passed");
  const metadata = await getTokenMetadata(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const maturity = metadata?.additionalMetadata.find(([k]) => k === "maturity")?.[1];
  assert.equal(maturity, "2028-04-15");
  ok("vote passed with 80% turnout; maturity now 2028-04-15 on-chain and in token metadata");

  // --- Partial redemption, settled off-chain via the paying agent ---------------------------
  console.log("Partial early redemption (off-chain settlement)");
  now = await chainTime(connection);
  const partialId = await announce({
    ...blank(),
    kind: { partialRedemption: {} },
    settlementMode: { offChain: {} },
    recordTs: new BN(now + 6),
    paymentTs: new BN(now + 10),
    redeemBps: 2_500,
  });
  await waitUntil(now + 10);
  rejected = false;
  try {
    await as("holderA").send([transferBondsIx({ mint, from: pk("holderA"), to: pk("holderB"), amount: 1 })]);
  } catch (e) {
    rejected = String(e).includes("TransfersLocked");
  }
  assert(rejected, "transfers must be locked during a redemption");
  ok("transfers locked from the redemption record date");
  await crankOnce(client, mint, crank, log); // snapshot + finalize
  await crankOnce(client, mint, crank, log); // instruct payments
  const payments = await payingAgentOnce(client, mint, as("payingAgent"), log);
  assert.equal(payments.length, 3);
  assert.equal(await bondsOf("holderA", mint), 7_500n);
  const partialKey = actionPda(mint, partialId);
  const partialEnts = await client.fetchEntitlements(partialKey);
  for (const p of payments) {
    const e = partialEnts.find((x) => x.account.owner.toBase58() === p.owner)!;
    assert.equal(Buffer.from(e.account.paymentRef).toString("hex"), p.ref);
  }
  await issuer.send([
    await client.closeAction({
      issuer: issuer.publicKey,
      mint,
      actionId: partialId,
      settlementMint,
      onChain: false,
      reportHash: new Uint8Array(32),
    }),
  ]);
  const bond = (await client.fetchBond(mint))!;
  assert.equal(bond.supply.toNumber(), 15_000);
  assert.equal(bond.transferLockTs.toNumber(), 0);
  ok("paying agent confirmed 3 rail payments; 25% of each holding burned; supply 15,000; transfers unlocked");

  console.log("All live checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
