/**
 * Simulated paying agent for off-chain settlement: settles each instructed entitlement
 * on a mock tenge rail, appends it to .demo/rail-ledger.json and confirms it on-chain.
 *
 *   npm run paying-agent            (loops every AGENT_INTERVAL_MS, default 4000)
 *   npm run paying-agent -- --once
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { MorroClient, payingAgentOnce } from "@morro/sdk";
import { KeypairSender, appendRailLedger, loadConfig, loadKey } from "./demo-config";

async function main() {
  const config = loadConfig();
  const connection = new Connection(config.rpcUrl, "confirmed");
  const client = new MorroClient(connection);
  const agent = new KeypairSender(connection, loadKey("payingAgent"));
  const mint = new PublicKey(config.mint);
  const once = process.argv.includes("--once");
  const interval = Number(process.env.AGENT_INTERVAL_MS ?? 4000);
  const log = (msg: string) => console.log(`[paying-agent ${new Date().toISOString().slice(11, 19)}] ${msg}`);

  log(`watching off-chain actions of ${config.mint}`);
  do {
    try {
      appendRailLedger(await payingAgentOnce(client, mint, agent, log));
    } catch (e) {
      log(`error: ${(e as Error).message.split("\n")[0]}`);
    }
    if (!once) await new Promise((r) => setTimeout(r, interval));
  } while (!once);
}

main();
