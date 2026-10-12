import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MorroClient, enumName, settlementAta, valueAt } from "./client";
import { actionPda } from "./pda";

/** Something that can pay for and sign transactions (a keypair wallet, a server-side demo signer). */
export interface Sender {
  publicKey: PublicKey;
  send(ixs: TransactionInstruction[], label?: string): Promise<string>;
}

/** Current cluster time (the latest block's timestamp), falling back to the local clock. */
export async function chainTime(connection: Connection): Promise<number> {
  try {
    const slot = await connection.getSlot("confirmed");
    const t = await connection.getBlockTime(slot);
    if (t) return t;
  } catch {
    /* fall through */
  }
  return Math.floor(Date.now() / 1000);
}

const chunk = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * One pass of the permissionless crank over every action of a bond:
 * snapshots holders once the record date passes, finalizes snapshots and votes,
 * and pushes payments once the payment date arrives. Returns what it did.
 * It holds no special authority: every instruction it sends could be sent by anyone.
 */
export async function crankOnce(
  client: MorroClient,
  mint: PublicKey,
  payer: Sender,
  log: (msg: string) => void = () => {},
): Promise<string[]> {
  const done: string[] = [];
  const note = (msg: string) => {
    done.push(msg);
    log(msg);
  };
  const bond = await client.fetchBond(mint);
  if (!bond) return done;
  const [actions, holders, now] = await Promise.all([
    client.fetchActions(mint),
    client.fetchHolders(mint),
    chainTime(client.connection),
  ]);

  for (const { publicKey: key, account: a } of actions) {
    const id = a.actionId;
    const status = enumName(a.status);
    const kind = enumName(a.kind);
    const onChain = enumName(a.settlementMode) === "onChain";
    const retires = kind === "redemption" || kind === "partialRedemption";

    if (status === "announced" && now > a.recordTs.toNumber()) {
      const existing = await client.fetchEntitlements(key);
      const done_ = new Set(existing.map((e) => e.account.owner.toBase58()));
      const owners = holders
        .filter((h) => valueAt(h.account.history, a.recordTs.toNumber()) > 0n)
        .map((h) => h.account.owner)
        .filter((o) => !done_.has(o.toBase58()));
      for (const group of chunk(owners, 4)) {
        const ixs = await Promise.all(
          group.map((owner) => client.snapshotHolder({ payer: payer.publicKey, mint, actionId: id, owner })),
        );
        await payer.send(ixs, `snapshot #${id}`);
        note(`Action #${id}: snapshotted ${group.length} holder(s)`);
      }
      await payer.send([await client.finalizeSnapshot({ mint, actionId: id })], `finalize snapshot #${id}`);
      note(`Action #${id}: snapshot finalized`);
      continue;
    }

    if (status === "voting" && now >= a.voteEndTs.toNumber()) {
      await payer.send([await client.finalizeVote({ mint, actionId: id })], `finalize vote #${id}`);
      note(`Action #${id}: vote finalized`);
      continue;
    }

    const payable = onChain ? ["funded", "paying"] : ["snapshotted", "paying"];
    if (kind !== "vote" && payable.includes(status) && now >= a.paymentTs.toNumber()) {
      const pending = (await client.fetchEntitlements(actionPda(mint, id))).filter(
        (e) => enumName(e.account.status) === "pending",
      );
      for (const group of chunk(pending, 2)) {
        const ixs: TransactionInstruction[] = [];
        for (const { account: e } of group) {
          if (onChain) {
            ixs.push(
              createAssociatedTokenAccountIdempotentInstruction(
                payer.publicKey,
                settlementAta(bond.settlementMint, e.owner),
                e.owner,
                bond.settlementMint,
                TOKEN_PROGRAM_ID,
              ),
            );
          }
          ixs.push(
            await client.distribute({
              payer: payer.publicKey,
              mint,
              actionId: id,
              owner: e.owner,
              settlementMint: bond.settlementMint,
              onChain,
              retires,
            }),
          );
        }
        await payer.send(ixs, `distribute #${id}`);
        note(`Action #${id}: ${onChain ? "paid" : "instructed"} ${group.length} holder(s)`);
      }
    }
  }
  return done;
}
