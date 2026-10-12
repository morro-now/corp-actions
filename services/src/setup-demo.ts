/**
 * Creates a ready-to-demo bond: role wallets, the tKZT settlement token, the KZTB-27
 * Token-2022 bond mint, three KYC-approved holders and 20,000 issued bonds.
 *
 *   RPC_URL=http://127.0.0.1:8899 npm run demo:setup          (local validator, airdrops)
 *   RPC_URL=https://api.devnet.solana.com npm run demo:setup  (devnet, funded from FUNDER_KEYPAIR)
 */
import { Connection, Keypair } from "@solana/web3.js";
import { PROGRAM_ID } from "@morro/sdk";
import { createDemoBond, fundRoles } from "./bond-setup";
import path from "path";
import { ROLES, demoDir, loadOrCreateKey, saveConfig, type Role } from "./demo-config";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const local = RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost");
  if (!(await connection.getAccountInfo(PROGRAM_ID))) {
    throw new Error(`Program ${PROGRAM_ID.toBase58()} is not deployed on ${RPC_URL}`);
  }

  console.log(`Morro demo setup on ${RPC_URL}`);
  const keys = Object.fromEntries(ROLES.map((r) => [r, loadOrCreateKey(r)])) as Record<Role, Keypair>;
  await fundRoles(connection, keys, local);
  const { mint, settlementMint } = await createDemoBond(connection, keys);

  saveConfig({
    rpcUrl: RPC_URL,
    cluster: local ? "localnet" : RPC_URL.includes("devnet") ? "devnet" : "custom",
    programId: PROGRAM_ID.toBase58(),
    mint: mint.toBase58(),
    settlementMint: settlementMint.toBase58(),
    settlementDecimals: 2,
    roles: Object.fromEntries(ROLES.map((r) => [r, keys[r].publicKey.toBase58()])) as Record<Role, string>,
    createdAt: new Date().toISOString(),
  });
  console.log(`Done. Config written to ${path.join(demoDir(), "config.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
