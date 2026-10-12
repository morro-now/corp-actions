import { sha256 } from "@noble/hashes/sha256";
import { PublicKey } from "@solana/web3.js";
import { MorroClient, enumName } from "./client";
import type { Sender } from "./crank";

export interface RailPayment {
  /** Hex SHA-256 of the rail reference; this is what goes on-chain. */
  ref: string;
  railReference: string;
  action: string;
  actionId: number;
  owner: string;
  amountMinor: string;
  paidAt: string;
  signature?: string;
}

/**
 * Simulated tenge payment rail: "pays" one entitlement off-chain and returns a reference.
 * Stands in for an RTGS / bank transfer initiated by the paying agent.
 */
export function simulateRailPayment(action: PublicKey, actionId: number, owner: PublicKey, amount: bigint): RailPayment {
  const railReference = `KZT-RTGS-${Date.now()}-${owner.toBase58().slice(0, 6)}`;
  return {
    ref: Buffer.from(sha256(new TextEncoder().encode(railReference))).toString("hex"),
    railReference,
    action: action.toBase58(),
    actionId,
    owner: owner.toBase58(),
    amountMinor: amount.toString(),
    paidAt: new Date().toISOString(),
  };
}

/**
 * One pass of the simulated paying agent: for every off-chain action in Paying,
 * settles each Instructed entitlement on the mock rail and confirms it on-chain
 * (which also burns bonds for redemptions). Only the paying agent's key can confirm.
 */
export async function payingAgentOnce(
  client: MorroClient,
  mint: PublicKey,
  agent: Sender,
  log: (msg: string) => void = () => {},
): Promise<RailPayment[]> {
  const out: RailPayment[] = [];
  for (const { publicKey: key, account: a } of await client.fetchActions(mint)) {
    if (enumName(a.settlementMode) !== "offChain" || enumName(a.status) !== "paying") continue;
    const kind = enumName(a.kind);
    const retires = kind === "redemption" || kind === "partialRedemption";
    for (const { account: e } of await client.fetchEntitlements(key)) {
      if (enumName(e.status) !== "instructed") continue;
      const payment = simulateRailPayment(key, a.actionId, e.owner, BigInt(e.amount.toString()));
      const ix = await client.confirmPayment({
        payingAgent: agent.publicKey,
        mint,
        actionId: a.actionId,
        owner: e.owner,
        paymentRef: Buffer.from(payment.ref, "hex"),
        retires,
      });
      payment.signature = await agent.send([ix], `confirm payment #${a.actionId}`);
      log(`Action #${a.actionId}: paid ${e.owner.toBase58().slice(0, 6)}… via ${payment.railReference}`);
      out.push(payment);
    }
  }
  return out;
}
