import { BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  type AnnounceArgs,
  type BondConfig,
  type CorporateAction,
  type Entitlement,
  type HolderRecord,
  actionPda,
  bondAta,
  bondPda,
  buildActionReport,
  entitlementFor,
  entitlementPda,
  enumName,
  escrowPda,
  holderPda,
  replaySnapshotDigest,
  reportHash,
  settlementAta,
  transferBondsIx,
} from "../sdk/src";
import { Harness } from "./harness";

// Dates from the design doc's worked example.
const DAY = 86_400;
const APR_15_2026 = 1_776_211_200;
const OCT_12_2026 = 1_791_763_200;
const OCT_15_2026 = 1_792_022_400;
const OCT_15_2027 = OCT_15_2026 + 365 * DAY;
const APR_15_2028 = 1_839_369_600;

const FACE = 100_000n; // 1,000 KZT in tiyn
const RATE_BPS = 1_450; // 14.50%

const blankAnnounce = (): AnnounceArgs => ({
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

describe("Morro corporate actions", () => {
  const h = new Harness();
  const c = h.client;

  const issuer = h.wallet(100);
  const registrar = h.wallet();
  const payingAgent = h.wallet();
  const crank = h.wallet();
  const holderA = h.wallet();
  const holderB = h.wallet();
  const holderC = h.wallet();
  const outsider = h.wallet();
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  let tkzt: PublicKey;

  const bond = () => h.decode<BondConfig>("bondConfig", bondPda(mint));
  const holder = (kp: Keypair) => h.decode<HolderRecord>("holderRecord", holderPda(mint, kp.publicKey));
  const action = (id: number) => h.decode<CorporateAction>("corporateAction", actionPda(mint, id));
  const ent = (id: number, kp: Keypair) =>
    h.decode<Entitlement>("entitlement", entitlementPda(actionPda(mint, id), kp.publicKey));
  const bonds = (kp: Keypair) => h.tokenBalance(bondAta(mint, kp.publicKey), TOKEN_2022_PROGRAM_ID);
  const cash = (kp: Keypair) => h.tokenBalance(settlementAta(tkzt, kp.publicKey), TOKEN_PROGRAM_ID);
  const transfer = (from: Keypair, to: Keypair, amount: number) =>
    transferBondsIx({ mint, from: from.publicKey, to: to.publicKey, amount });

  const snapshotAll = async (id: number, holders: Keypair[]) => {
    for (const kp of holders) {
      h.send([await c.snapshotHolder({ payer: crank.publicKey, mint, actionId: id, owner: kp.publicKey })], [crank]);
    }
  };

  before(async () => {
    h.warpTo(OCT_12_2026);
    tkzt = h.createSettlementMint(issuer);
    h.createAta(issuer, tkzt, issuer.publicKey, TOKEN_PROGRAM_ID);
    h.mintSettlement(issuer, tkzt, settlementAta(tkzt, issuer.publicKey), 10_000_000_000n);
    for (const kp of [holderA, holderB, holderC]) h.createAta(issuer, tkzt, kp.publicKey, TOKEN_PROGRAM_ID);
  });

  describe("setup", () => {
    it("creates the KZTB-27 bond with hook, permanent delegate and metadata", async () => {
      h.createBondMint(
        {
          payer: issuer.publicKey,
          issuer: issuer.publicKey,
          mint,
          name: "Morro Test Bond 2027",
          symbol: "KZTB-27",
          uri: "",
          fields: [
            ["coupon", "14.50% semi-annual 30/360"],
            ["face_value", "1000 KZT"],
            ["maturity", "2027-10-15"],
          ],
        },
        { payer: issuer, issuer, mint: mintKp },
      );
      h.send(
        [
          await c.initializeBond({
            issuer: issuer.publicKey,
            mint,
            settlementMint: tkzt,
            args: {
              faceValue: new BN(FACE.toString()),
              couponRateBps: RATE_BPS,
              couponFreq: 2,
              dayCount: { thirty360: {} },
              issueTs: new BN(APR_15_2026),
              maturityTs: new BN(OCT_15_2027),
              registrar: registrar.publicKey,
              payingAgent: payingAgent.publicKey,
            },
          }),
        ],
        [issuer],
      );
      const b = bond();
      expect(b.faceValue.toString()).to.equal("100000");
      expect(enumName(b.status)).to.equal("active");
      expect(h.metadataField(mint, "maturity")).to.equal("2027-10-15");
    });

    it("onboards three KYC-approved holders and issues 20,000 bonds", async () => {
      for (const kp of [holderA, holderB, holderC]) {
        h.send([await c.registerHolder({ registrar: registrar.publicKey, mint, owner: kp.publicKey })], [registrar]);
        h.createAta(issuer, mint, kp.publicKey, TOKEN_2022_PROGRAM_ID);
      }
      h.createAta(issuer, mint, outsider.publicKey, TOKEN_2022_PROGRAM_ID);
      const issuance: [Keypair, number][] = [
        [holderA, 12_000],
        [holderB, 5_000],
        [holderC, 3_000],
      ];
      for (const [kp, amount] of issuance) {
        h.send([await c.issue({ issuer: issuer.publicKey, mint, owner: kp.publicKey, amount })], [issuer]);
      }
      expect(bond().supply.toNumber()).to.equal(20_000);
      expect(bond().holderCount).to.equal(3);
      expect(holder(holderA).balance.toNumber()).to.equal(12_000);
      expect(bonds(holderA)).to.equal(12_000n);
    });

    it("rejects issuance by anyone but the issuer", async () => {
      const ix = await c.issue({ issuer: outsider.publicKey, mint, owner: holderA.publicKey, amount: 1 });
      h.expectError([ix], [outsider], "NotIssuer");
    });

    it("rejects a transfer to a wallet that is not KYC-approved", () => {
      h.expectError([transfer(holderA, outsider, 10)], [holderA], "ReceiverNotApproved");
    });

    it("rejects a frozen holder, then allows them once unfrozen", async () => {
      const freeze = (frozen: boolean) =>
        c.setHolderStatus({ registrar: registrar.publicKey, mint, owner: holderC.publicKey, kycApproved: true, frozen });
      h.send([await freeze(true)], [registrar]);
      h.expectError([transfer(holderC, holderA, 1)], [holderC], "HolderFrozen");
      h.send([await freeze(false)], [registrar]);
    });
  });

  describe("scenario 1: coupon payment", () => {
    const ID = 0;
    const recordTs = OCT_12_2026 + 3_600;
    const paymentTs = OCT_15_2026;

    it("announces a coupon for the Apr 15 – Oct 15 period", async () => {
      h.warpTo(OCT_12_2026 + 60);
      h.send(
        [
          await c.announce({
            issuer: issuer.publicKey,
            mint,
            actionId: ID,
            args: {
              ...blankAnnounce(),
              kind: { coupon: {} },
              recordTs: new BN(recordTs),
              paymentTs: new BN(paymentTs),
              periodStartTs: new BN(APR_15_2026),
              periodEndTs: new BN(OCT_15_2026),
            },
          }),
        ],
        [issuer],
      );
      expect(enumName(action(ID).status)).to.equal("announced");
      expect(bond().pendingRecordTs.map((t) => t.toNumber())).to.include(recordTs);
    });

    it("counts a trade before the record date and ignores one after it", async () => {
      h.warpTo(recordTs - 600);
      h.send([transfer(holderA, holderB, 2_000)], [holderA]);
      const early = await c.snapshotHolder({ payer: crank.publicKey, mint, actionId: ID, owner: holderA.publicKey });
      h.expectError([early], [crank], "RecordDateNotReached");

      h.warpTo(recordTs + 600);
      h.send([transfer(holderB, holderC, 1_000)], [holderB]);
      expect(holder(holderB).balance.toNumber()).to.equal(6_000);
    });

    it("refuses to finalize until every bond outstanding at the record date is captured", async () => {
      await snapshotAll(ID, [holderA, holderB]);
      h.expectError([await c.finalizeSnapshot({ mint, actionId: ID })], [crank], "SnapshotIncomplete");
      await snapshotAll(ID, [holderC]);
      h.send([await c.finalizeSnapshot({ mint, actionId: ID })], [crank]);

      const a = action(ID);
      expect(enumName(a.status)).to.equal("snapshotted");
      expect(a.supplyAtRecord.toNumber()).to.equal(20_000);
      expect(a.holdersSnapshotted).to.equal(3);
      expect(bond().pendingRecordTs.map((t) => t.toNumber())).to.not.include(recordTs);
    });

    it("computes entitlements from record-date balances (72.50 KZT per bond)", () => {
      expect(ent(ID, holderA).balanceAtRecord.toNumber()).to.equal(10_000);
      expect(ent(ID, holderB).balanceAtRecord.toNumber()).to.equal(7_000);
      expect(ent(ID, holderC).balanceAtRecord.toNumber()).to.equal(3_000);
      expect(ent(ID, holderA).amount.toString()).to.equal("72500000"); // 725,000.00 KZT
      expect(ent(ID, holderB).amount.toString()).to.equal("50750000");
      expect(ent(ID, holderC).amount.toString()).to.equal("21750000");
      expect(action(ID).totalEntitlement.toString()).to.equal("145000000"); // 1,450,000.00 KZT

      const preview = entitlementFor({
        kind: "coupon",
        balance: 10_000n,
        faceValue: FACE,
        rateBps: RATE_BPS,
        dayCount: "thirty360",
        periodStartTs: APR_15_2026,
        periodEndTs: OCT_15_2026,
        redeemBps: 0,
      });
      expect(preview.amount).to.equal(72_500_000n);
    });

    it("has a snapshot digest that anyone can replay", () => {
      const rows = [holderA, holderB, holderC].map((kp) => {
        const e = ent(ID, kp);
        return { owner: kp.publicKey, balance: BigInt(e.balanceAtRecord.toString()), amount: BigInt(e.amount.toString()) };
      });
      expect(Buffer.from(replaySnapshotDigest(rows)).toString("hex")).to.equal(
        Buffer.from(action(ID).snapshotDigest).toString("hex"),
      );
    });

    it("blocks distribution until the escrow is funded and the payment date arrives", async () => {
      const pay = () =>
        c.distribute({
          payer: crank.publicKey,
          mint,
          actionId: ID,
          owner: holderA.publicKey,
          settlementMint: tkzt,
          onChain: true,
          retires: false,
        });
      h.warpTo(paymentTs);
      // The escrow only exists once funded, so an unfunded payout cannot even load it.
      h.expectError([await pay()], [crank], "AccountNotInitialized");
      h.warpTo(paymentTs - 60);
      h.send([await c.fundEscrow({ issuer: issuer.publicKey, mint, actionId: ID, settlementMint: tkzt })], [issuer]);
      expect(h.tokenBalance(escrowPda(actionPda(mint, ID)), TOKEN_PROGRAM_ID)).to.equal(145_000_000n);
      h.expectError([await pay()], [crank], "PaymentDateNotReached");
    });

    it("pushes each holder's coupon exactly once", async () => {
      h.warpTo(paymentTs);
      for (const kp of [holderA, holderB, holderC]) {
        h.send(
          [
            await c.distribute({
              payer: crank.publicKey,
              mint,
              actionId: ID,
              owner: kp.publicKey,
              settlementMint: tkzt,
              onChain: true,
              retires: false,
            }),
          ],
          [crank],
        );
      }
      expect(cash(holderA)).to.equal(72_500_000n);
      expect(cash(holderB)).to.equal(50_750_000n);
      expect(cash(holderC)).to.equal(21_750_000n);
      expect(enumName(ent(ID, holderA).status)).to.equal("paid");

      const again = await c.distribute({
        payer: crank.publicKey,
        mint,
        actionId: ID,
        owner: holderA.publicKey,
        settlementMint: tkzt,
        onChain: true,
        retires: false,
      });
      h.expectError([again], [crank], "InvalidEntitlementStatus");
    });

    it("closes with the report hash and an empty escrow", async () => {
      const key = actionPda(mint, ID);
      const ents = [holderA, holderB, holderC].map((kp) => ({
        publicKey: entitlementPda(key, kp.publicKey),
        account: ent(ID, kp),
      }));
      const hash = reportHash(buildActionReport(bond(), key, action(ID), ents));
      h.send(
        [
          await c.closeAction({
            issuer: issuer.publicKey,
            mint,
            actionId: ID,
            settlementMint: tkzt,
            onChain: true,
            reportHash: hash,
          }),
        ],
        [issuer],
      );
      const a = action(ID);
      expect(enumName(a.status)).to.equal("closed");
      expect(a.totalPaid.toString()).to.equal(a.totalEntitlement.toString());
      expect(Buffer.from(a.reportHash).equals(Buffer.from(hash))).to.equal(true);
      expect(h.exists(escrowPda(key))).to.equal(false);
    });
  });

  describe("scenario 3: bondholder consent vote to extend maturity", () => {
    const ID = 1;
    const start = OCT_15_2026 + DAY;
    const recordTs = start + 600;
    const voteEndTs = start + 3 * DAY;

    it("snapshots voting weights at the record date", async () => {
      h.warpTo(start);
      h.send(
        [
          await c.announce({
            issuer: issuer.publicKey,
            mint,
            actionId: ID,
            args: {
              ...blankAnnounce(),
              kind: { vote: {} },
              recordTs: new BN(recordTs),
              newMaturityTs: new BN(APR_15_2028),
              quorumBps: 5_000,
              thresholdBps: 6_667,
              voteEndTs: new BN(voteEndTs),
            },
          }),
        ],
        [issuer],
      );
      h.warpTo(recordTs + 1);
      await snapshotAll(ID, [holderA, holderB, holderC]);
      h.send([await c.finalizeSnapshot({ mint, actionId: ID })], [crank]);
      expect(enumName(action(ID).status)).to.equal("voting");
    });

    it("tallies one weighted vote per holder", async () => {
      const vote = (kp: Keypair, yes: boolean) => c.castVote({ owner: kp.publicKey, mint, actionId: ID, yes });
      h.send([await vote(holderA, true)], [holderA]); // 10,000
      h.send([await vote(holderB, true)], [holderB]); // 6,000
      h.send([await vote(holderC, false)], [holderC]); // 4,000
      h.expectError([await vote(holderC, true)], [holderC], "AlreadyVoted");
      h.expectError([await c.finalizeVote({ mint, actionId: ID })], [crank], "VotingOpen");
      expect(action(ID).votesYes.toNumber()).to.equal(16_000);
      expect(action(ID).votesNo.toNumber()).to.equal(4_000);
    });

    it("passes with 80% yes and moves maturity on-chain and in token metadata", async () => {
      h.warpTo(voteEndTs);
      h.send([await c.finalizeVote({ mint, actionId: ID })], [crank]);
      expect(enumName(action(ID).status)).to.equal("passed");
      expect(bond().maturityTs.toNumber()).to.equal(APR_15_2028);
      expect(h.metadataField(mint, "maturity")).to.equal("2028-04-15");
    });
  });

  describe("stretch: partial early redemption settled off-chain", () => {
    const ID = 2;
    const start = OCT_15_2026 + 10 * DAY;
    const recordTs = start + 600;
    const paymentTs = start + 2 * DAY;

    it("locks transfers from the record date", async () => {
      h.warpTo(start);
      h.send(
        [
          await c.announce({
            issuer: issuer.publicKey,
            mint,
            actionId: ID,
            args: {
              ...blankAnnounce(),
              kind: { partialRedemption: {} },
              settlementMode: { offChain: {} },
              recordTs: new BN(recordTs),
              paymentTs: new BN(paymentTs),
              redeemBps: 2_500,
            },
          }),
        ],
        [issuer],
      );
      h.send([transfer(holderA, holderB, 1)], [holderA]); // still allowed before the record date
      h.warpTo(recordTs);
      h.expectError([transfer(holderA, holderB, 1)], [holderA], "TransfersLocked");
      h.expectError(
        [await c.issue({ issuer: issuer.publicKey, mint, owner: holderA.publicKey, amount: 1 })],
        [issuer],
        "TransfersLocked",
      );
    });

    it("records payment instructions, then burns 25% when the paying agent confirms", async () => {
      h.warpTo(recordTs + 1);
      await snapshotAll(ID, [holderA, holderB, holderC]);
      h.send([await c.finalizeSnapshot({ mint, actionId: ID })], [crank]);

      h.warpTo(paymentTs);
      for (const kp of [holderA, holderB, holderC]) {
        h.send(
          [
            await c.distribute({
              payer: crank.publicKey,
              mint,
              actionId: ID,
              owner: kp.publicKey,
              settlementMint: tkzt,
              onChain: false,
              retires: true,
            }),
          ],
          [crank],
        );
      }
      expect(enumName(ent(ID, holderA).status)).to.equal("instructed");
      expect(bonds(holderA)).to.equal(9_999n); // nothing burned before confirmation

      const ref = Buffer.alloc(32, 7);
      const confirm = (kp: Keypair, signer: Keypair) =>
        c.confirmPayment({
          payingAgent: signer.publicKey,
          mint,
          actionId: ID,
          owner: kp.publicKey,
          paymentRef: ref,
          retires: true,
        });
      h.expectError([await confirm(holderA, outsider)], [outsider], "NotPayingAgent");
      for (const kp of [holderA, holderB, holderC]) h.send([await confirm(kp, payingAgent)], [payingAgent]);

      // A: 9,999 → retire floor(9,999 × 25%) = 2,499; B: 6,001 → 1,500; C: 4,000 → 1,000
      expect(bonds(holderA)).to.equal(7_500n);
      expect(bonds(holderB)).to.equal(4_501n);
      expect(bonds(holderC)).to.equal(3_000n);
      expect(ent(ID, holderA).amount.toString()).to.equal((2_499n * FACE).toString());
      expect(bond().supply.toNumber()).to.equal(15_001);
      expect(h.mintSupply(mint)).to.equal(15_001n);
      expect(holder(holderA).balance.toNumber()).to.equal(7_500);
    });

    it("closes and unlocks transfers", async () => {
      h.send(
        [
          await c.closeAction({
            issuer: issuer.publicKey,
            mint,
            actionId: ID,
            settlementMint: tkzt,
            onChain: false,
            reportHash: new Uint8Array(32),
          }),
        ],
        [issuer],
      );
      expect(bond().transferLockTs.toNumber()).to.equal(0);
      h.send([transfer(holderA, holderB, 1)], [holderA]);
    });
  });

  describe("scenario 2: redemption at maturity", () => {
    const ID = 3;
    const recordTs = APR_15_2028 - 2 * DAY;
    const paymentTs = APR_15_2028;

    it("pays principal plus the final coupon and burns every bond", async () => {
      h.warpTo(recordTs - DAY);
      h.send(
        [
          await c.announce({
            issuer: issuer.publicKey,
            mint,
            actionId: ID,
            args: {
              ...blankAnnounce(),
              kind: { redemption: {} },
              recordTs: new BN(recordTs),
              paymentTs: new BN(paymentTs),
              periodStartTs: new BN(OCT_15_2027),
              periodEndTs: new BN(APR_15_2028),
              redeemBps: 10_000,
            },
          }),
        ],
        [issuer],
      );
      h.warpTo(recordTs + 1);
      await snapshotAll(ID, [holderA, holderB, holderC]);
      h.send([await c.finalizeSnapshot({ mint, actionId: ID })], [crank]);
      h.send([await c.fundEscrow({ issuer: issuer.publicKey, mint, actionId: ID, settlementMint: tkzt })], [issuer]);

      // A holds 7,499 bonds: principal 749,900,000 + coupon 7,499 × 7,250 = 54,367,750 tiyn
      expect(ent(ID, holderA).balanceAtRecord.toNumber()).to.equal(7_499);
      expect(ent(ID, holderA).amount.toString()).to.equal((7_499n * FACE + 7_499n * 7_250n).toString());

      const before = cash(holderA);
      h.warpTo(paymentTs);
      for (const kp of [holderA, holderB, holderC]) {
        h.send(
          [
            await c.distribute({
              payer: crank.publicKey,
              mint,
              actionId: ID,
              owner: kp.publicKey,
              settlementMint: tkzt,
              onChain: true,
              retires: true,
            }),
          ],
          [crank],
        );
      }
      expect(cash(holderA) - before).to.equal(7_499n * FACE + 7_499n * 7_250n);
      expect(bonds(holderA)).to.equal(0n);
      expect(h.mintSupply(mint)).to.equal(0n);
      expect(action(ID).totalRetired.toNumber()).to.equal(15_001);
    });

    it("closes the action and marks the bond redeemed", async () => {
      h.send(
        [
          await c.closeAction({
            issuer: issuer.publicKey,
            mint,
            actionId: ID,
            settlementMint: tkzt,
            onChain: true,
            reportHash: new Uint8Array(32),
          }),
        ],
        [issuer],
      );
      expect(enumName(bond().status)).to.equal("redeemed");
      h.expectError(
        [await c.issue({ issuer: issuer.publicKey, mint, owner: holderA.publicKey, amount: 1 })],
        [issuer],
        "BondNotActive",
      );
    });
  });
});
