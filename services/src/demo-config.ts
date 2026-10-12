import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import type { Sender } from "@morro/sdk";

export const ROLES = [
  "issuer",
  "registrar",
  "payingAgent",
  "crank",
  "holderA",
  "holderB",
  "holderC",
  "outsider",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  issuer: "Issuer",
  registrar: "Registrar",
  payingAgent: "Paying agent",
  crank: "Crank",
  holderA: "Holder A",
  holderB: "Holder B",
  holderC: "Holder C",
  outsider: "Outsider (no KYC)",
};

export interface DemoConfig {
  rpcUrl: string;
  cluster: "localnet" | "devnet" | "custom";
  programId: string;
  mint: string;
  settlementMint: string;
  settlementDecimals: number;
  roles: Record<Role, string>;
  createdAt: string;
}

/**
 * Demo state lives in `<repo>/.demo` (keys, config, simulated rail ledger); override with MORRO_DEMO_DIR.
 * On serverless hosts (Vercel) config and keys come from env vars and files go to /tmp.
 */
export function demoDir(): string {
  if (process.env.MORRO_DEMO_DIR) return process.env.MORRO_DEMO_DIR;
  if (process.env.VERCEL) return "/tmp/morro-demo";
  // Walk up from cwd to the repo root (the folder holding Anchor.toml).
  let dir = process.cwd();
  while (!fs.existsSync(path.join(dir, "Anchor.toml")) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  return path.join(dir, ".demo");
}

export function loadConfig(): DemoConfig {
  // MORRO_DEMO_CONFIG: the contents of config.json; MORRO_RPC_URL optionally overrides its RPC endpoint.
  if (process.env.MORRO_DEMO_CONFIG) {
    const config: DemoConfig = JSON.parse(process.env.MORRO_DEMO_CONFIG);
    return process.env.MORRO_RPC_URL ? { ...config, rpcUrl: process.env.MORRO_RPC_URL } : config;
  }
  const file = path.join(demoDir(), "config.json");
  if (!fs.existsSync(file)) throw new Error(`No demo config at ${file}. Run \`npm run demo:setup\` first.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveConfig(config: DemoConfig) {
  fs.mkdirSync(demoDir(), { recursive: true });
  fs.writeFileSync(path.join(demoDir(), "config.json"), JSON.stringify(config, null, 2));
}

export function loadOrCreateKey(role: Role): Keypair {
  const dir = path.join(demoDir(), "keys");
  const file = path.join(dir, `${role}.json`);
  if (fs.existsSync(file)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
  fs.mkdirSync(dir, { recursive: true });
  const kp = Keypair.generate();
  fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

export function loadKey(role: Role): Keypair {
  // MORRO_DEMO_KEYS: JSON object mapping each role to its secret key byte array.
  if (process.env.MORRO_DEMO_KEYS) {
    const keys: Record<string, number[]> = JSON.parse(process.env.MORRO_DEMO_KEYS);
    if (!keys[role]) throw new Error(`MORRO_DEMO_KEYS has no key for ${role}`);
    return Keypair.fromSecretKey(Uint8Array.from(keys[role]));
  }
  const file = path.join(demoDir(), "keys", `${role}.json`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}

/** A demo signer: pays for and signs transactions with one role's key (plus any extra signers). */
export class KeypairSender implements Sender {
  constructor(
    readonly connection: Connection,
    readonly keypair: Keypair,
    readonly extraSigners: Keypair[] = [],
  ) {}

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  async send(ixs: TransactionInstruction[]): Promise<string> {
    const tx = new Transaction().add(...ixs);
    return sendAndConfirmTransaction(this.connection, tx, [this.keypair, ...this.extraSigners], {
      commitment: "confirmed",
    });
  }
}

export function explorerTxUrl(config: Pick<DemoConfig, "cluster" | "rpcUrl">, signature: string): string {
  if (config.cluster === "devnet") return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(config.rpcUrl)}`;
}

export function explorerAddressUrl(config: Pick<DemoConfig, "cluster" | "rpcUrl">, address: string): string {
  if (config.cluster === "devnet") return `https://explorer.solana.com/address/${address}?cluster=devnet`;
  return `https://explorer.solana.com/address/${address}?cluster=custom&customUrl=${encodeURIComponent(config.rpcUrl)}`;
}

export function appendRailLedger(entries: unknown[]) {
  if (entries.length === 0) return;
  fs.mkdirSync(demoDir(), { recursive: true });
  const file = path.join(demoDir(), "rail-ledger.json");
  const existing: unknown[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  fs.writeFileSync(file, JSON.stringify([...existing, ...entries], null, 2));
}

export function readRailLedger(): unknown[] {
  const file = path.join(demoDir(), "rail-ledger.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
}
