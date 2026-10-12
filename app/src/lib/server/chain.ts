import "server-only";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { MorroClient, actionPda } from "@morro/sdk";
import {
  KeypairSender,
  ROLE_LABELS,
  demoDir,
  explorerAddressUrl,
  explorerTxUrl,
  loadConfig,
  loadKey,
  type DemoConfig,
  type Role,
} from "@morro/services/src/demo-config";
import path from "path";

export interface Ctx {
  config: DemoConfig;
  connection: Connection;
  client: MorroClient;
  mint: PublicKey;
  settlementMint: PublicKey;
  roleByAddress: Map<string, Role>;
  sender(role: Role): KeypairSender;
  key(role: Role): Keypair;
  txUrl(signature: string): string;
  addressUrl(address: string): string;
  reportPath(actionId: number): string;
}

let cached: { stamp: string; ctx: Ctx } | null = null;

/** Demo context: config, RPC connection, client and the server-held role keys. Rebuilt if the config changes. */
export function ctx(): Ctx {
  const config = loadConfig();
  const stamp = `${config.createdAt}|${config.mint}|${config.rpcUrl}`;
  if (cached && cached.stamp === stamp) return cached.ctx;

  const connection = new Connection(config.rpcUrl, "confirmed");
  const client = new MorroClient(connection);
  const mint = new PublicKey(config.mint);
  const keys = new Map<Role, Keypair>();
  const key = (role: Role) => {
    let k = keys.get(role);
    if (!k) {
      k = loadKey(role);
      keys.set(role, k);
    }
    return k;
  };
  const roleByAddress = new Map<string, Role>(
    (Object.entries(config.roles) as [Role, string][]).map(([r, a]) => [a, r]),
  );
  const c: Ctx = {
    config,
    connection,
    client,
    mint,
    settlementMint: new PublicKey(config.settlementMint),
    roleByAddress,
    key,
    sender: (role) => new KeypairSender(connection, key(role)),
    txUrl: (sig) => explorerTxUrl(config, sig),
    addressUrl: (a) => explorerAddressUrl(config, a),
    reportPath: (actionId) => path.join(demoDir(), "reports", `${actionPda(mint, actionId).toBase58()}.json`),
  };
  cached = { stamp, ctx: c };
  return c;
}

export const roleLabel = (role: Role | null | undefined, address: string) =>
  role ? ROLE_LABELS[role] : `${address.slice(0, 4)}…${address.slice(-4)}`;

export { ROLE_LABELS };
export type { Role };
