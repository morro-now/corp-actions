/**
 * Permissionless crank: snapshots holders after each record date, finalizes snapshots
 * and votes, and pushes payments on the payment date. Holds no special authority.
 *
 *   npm run crank            (loops every CRANK_INTERVAL_MS, default 4000)
 *   npm run crank -- --once
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { MorroClient, crankOnce } from "@morro/sdk";
import { KeypairSender, loadConfig, loadKey } from "./demo-config";

async function main() {
  const config = loadConfig();
  const connection = new Connection(config.rpcUrl, "confirmed");
  const client = new MorroClient(connection);
  const sender = new KeypairSender(connection, loadKey("crank"));
  const mint = new PublicKey(config.mint);
  const once = process.argv.includes("--once");
  const interval = Number(process.env.CRANK_INTERVAL_MS ?? 4000);
  const log = (msg: string) => console.log(`[crank ${new Date().toISOString().slice(11, 19)}] ${msg}`);

  log(`watching ${config.mint} on ${config.rpcUrl}`);
  do {
    try {
      await crankOnce(client, mint, sender, log);
    } catch (e) {
      log(`error: ${(e as Error).message.split("\n")[0]}`);
    }
    if (!once) await new Promise((r) => setTimeout(r, interval));
  } while (!once);
}

main();
