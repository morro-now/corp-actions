import { BorshCoder, type Event } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { Connection, PublicKey } from "@solana/web3.js";
import type { CorpActions } from "./idl/corp_actions";
import idl from "./idl/corp_actions.json";
import { PROGRAM_ID, eventAuthorityPda } from "./pda";

// Anchor prefixes every self-CPI event with this tag (sha256("anchor:event")[..8], little-endian).
const EVENT_IX_TAG = Buffer.from([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d]);

const coder = new BorshCoder(idl as CorpActions);

export interface MorroEvent {
  name: string;
  data: Record<string, unknown>;
  signature: string;
  slot: number;
  blockTime: number | null;
}

const camel = (s: string) =>
  s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());

/**
 * Decodes one self-CPI event instruction's data, or null if it is not a Morro event.
 * Names and fields are camelCased to match account fields (e.g. `holderSnapshotted.balanceAtRecord`).
 */
export function decodeEventIx(data: Uint8Array): Event | null {
  const buf = Buffer.from(data);
  if (buf.length < 16 || !buf.subarray(0, 8).equals(EVENT_IX_TAG)) return null;
  const event = coder.events.decode(buf.subarray(8).toString("base64"));
  if (!event) return null;
  const fields = Object.fromEntries(Object.entries(event.data).map(([k, v]) => [camel(k), v]));
  return { name: camel(event.name), data: fields } as Event;
}

/**
 * Every Morro event emitted in transactions that touched `address` (an action, a bond, a holder),
 * oldest first. Events are read from the self-CPI inner instructions, so they survive log truncation.
 */
export async function fetchEvents(connection: Connection, address: PublicKey, limit = 500): Promise<MorroEvent[]> {
  const sigs = await connection.getSignaturesForAddress(address, { limit }, "confirmed");
  const ordered = sigs.filter((s) => !s.err).reverse();
  const out: MorroEvent[] = [];
  const authority = eventAuthorityPda();
  for (let i = 0; i < ordered.length; i += 50) {
    const batch = ordered.slice(i, i + 50);
    const txs = await connection.getTransactions(
      batch.map((s) => s.signature),
      { maxSupportedTransactionVersion: 0, commitment: "confirmed" },
    );
    txs.forEach((tx, j) => {
      if (!tx?.meta?.innerInstructions) return;
      const keys = tx.transaction.message.getAccountKeys({
        accountKeysFromLookups: tx.meta.loadedAddresses,
      });
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          const programId = keys.get(ix.programIdIndex);
          if (!programId?.equals(PROGRAM_ID)) continue;
          if (!ix.accounts.some((k) => keys.get(k)?.equals(authority))) continue;
          const event = decodeEventIx(bs58.decode(ix.data));
          if (event) {
            out.push({
              name: event.name,
              data: event.data as Record<string, unknown>,
              signature: batch[j].signature,
              slot: tx.slot,
              blockTime: tx.blockTime ?? null,
            });
          }
        }
      }
    });
  }
  return out;
}
