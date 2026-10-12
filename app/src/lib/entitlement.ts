import { dayCountFraction, entitlementFor } from "@morro/sdk/src/math";
import type { ActionView, BondView } from "./types";

/** Preview of cash (tiyn) and bonds retired for a balance, using the same math as the program. */
export function preview(bond: BondView, a: ActionView, balance: bigint) {
  return entitlementFor({
    kind: a.kind,
    balance,
    faceValue: BigInt(bond.faceValue),
    rateBps: bond.couponRateBps,
    dayCount: bond.dayCount,
    periodStartTs: a.periodStartTs,
    periodEndTs: a.periodEndTs,
    redeemBps: a.redeemBps,
  });
}

/** Coupon per bond (tiyn) over a period. */
export function couponPerBond(bond: BondView, start: number, end: number): bigint {
  const [num, den] = dayCountFraction(start, end, bond.dayCount);
  return (BigInt(bond.faceValue) * BigInt(bond.couponRateBps) * num) / (10_000n * den);
}

export const DAY_COUNT_LABEL = { thirty360: "30/360", act365: "Actual/365" } as const;
export const FREQ_LABEL: Record<number, string> = { 1: "annual", 2: "semi-annual", 4: "quarterly", 12: "monthly" };
