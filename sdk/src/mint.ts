import {
  AuthorityType,
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createSetAuthorityInstruction,
  getMintLen,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  createUpdateAuthorityInstruction,
  createUpdateFieldInstruction,
  pack,
  type TokenMetadata,
} from "@solana/spl-token-metadata";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { PROGRAM_ID, bondPda } from "./pda";

export const BOND_MINT_EXTENSIONS = [
  ExtensionType.TransferHook,
  ExtensionType.PermanentDelegate,
  ExtensionType.MetadataPointer,
];

export interface BondMintParams {
  payer: PublicKey;
  issuer: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  /** Extra metadata shown in wallets and explorers, e.g. coupon and maturity. */
  fields: [string, string][];
}

/** Account size of the mint before metadata, and total size once metadata is written. */
export function bondMintSizes(p: BondMintParams): { mintLen: number; totalLen: number } {
  const mintLen = getMintLen(BOND_MINT_EXTENSIONS);
  const metadata: TokenMetadata = {
    mint: p.mint,
    updateAuthority: p.issuer,
    name: p.name,
    symbol: p.symbol,
    uri: p.uri,
    additionalMetadata: p.fields,
  };
  return { mintLen, totalLen: mintLen + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length };
}

/**
 * Two transactions' worth of instructions that create the bond's Token-2022 mint:
 * 1. account + TransferHook (→ Morro program) + PermanentDelegate (→ bond PDA) + MetadataPointer + mint init;
 * 2. on-mint metadata, then hand the metadata update authority and mint authority to the bond PDA.
 * `lamports` must cover rent for `bondMintSizes(p).totalLen` bytes.
 */
export function createBondMintInstructions(p: BondMintParams, lamports: number): TransactionInstruction[][] {
  const bond = bondPda(p.mint);
  const { mintLen } = bondMintSizes(p);
  const tp = TOKEN_2022_PROGRAM_ID;

  const create = [
    SystemProgram.createAccount({
      fromPubkey: p.payer,
      newAccountPubkey: p.mint,
      space: mintLen,
      lamports,
      programId: tp,
    }),
    createInitializeTransferHookInstruction(p.mint, p.issuer, PROGRAM_ID, tp),
    createInitializePermanentDelegateInstruction(p.mint, bond, tp),
    createInitializeMetadataPointerInstruction(p.mint, p.issuer, p.mint, tp),
    createInitializeMintInstruction(p.mint, 0, p.issuer, null, tp),
  ];

  const metadata = [
    createInitializeInstruction({
      programId: tp,
      metadata: p.mint,
      updateAuthority: p.issuer,
      mint: p.mint,
      mintAuthority: p.issuer,
      name: p.name,
      symbol: p.symbol,
      uri: p.uri,
    }),
    ...p.fields.map(([field, value]) =>
      createUpdateFieldInstruction({ programId: tp, metadata: p.mint, updateAuthority: p.issuer, field, value }),
    ),
    createUpdateAuthorityInstruction({
      programId: tp,
      metadata: p.mint,
      oldAuthority: p.issuer,
      newAuthority: bond,
    }),
    createSetAuthorityInstruction(p.mint, p.issuer, AuthorityType.MintTokens, bond, [], tp),
  ];

  return [create, metadata];
}
