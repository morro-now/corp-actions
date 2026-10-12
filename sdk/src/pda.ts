import { PublicKey } from "@solana/web3.js";
import idl from "./idl/corp_actions.json";

export const PROGRAM_ID = new PublicKey(idl.address);

const enc = (s: string) => Buffer.from(s);

const u32le = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};

const find = (seeds: Buffer[], programId = PROGRAM_ID) =>
  PublicKey.findProgramAddressSync(seeds, programId)[0];

export const bondPda = (mint: PublicKey) => find([enc("bond"), mint.toBuffer()]);

export const holderPda = (mint: PublicKey, owner: PublicKey) =>
  find([enc("holder"), mint.toBuffer(), owner.toBuffer()]);

export const actionPda = (mint: PublicKey, actionId: number) =>
  find([enc("action"), mint.toBuffer(), u32le(actionId)]);

export const entitlementPda = (action: PublicKey, owner: PublicKey) =>
  find([enc("ent"), action.toBuffer(), owner.toBuffer()]);

export const escrowPda = (action: PublicKey) => find([enc("escrow"), action.toBuffer()]);

export const extraMetasPda = (mint: PublicKey) =>
  find([enc("extra-account-metas"), mint.toBuffer()]);

export const eventAuthorityPda = () => find([enc("__event_authority")]);
