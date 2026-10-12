import "server-only";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export const hex = (bytes: Uint8Array | number[]) => Buffer.from(bytes).toString("hex");
export const isZero = (bytes: Uint8Array | number[]) => Array.from(bytes).every((b) => b === 0);

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Converts decoded Anchor values (BN, PublicKey, byte arrays, enums) into plain JSON. */
export function plain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (BN.isBN(value)) return (value as BN).toString();
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return hex(value);
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((v) => typeof v === "number" && v >= 0 && v < 256) && value.length >= 16) {
      return hex(value as number[]);
    }
    return value.map(plain);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    // Anchor enums decode as `{ variant: {} }`.
    if (entries.length === 1) {
      const [k, v] = entries[0];
      if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0 && !BN.isBN(v)) {
        return lowerFirst(k);
      }
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, plain(v)]));
  }
  return value;
}
