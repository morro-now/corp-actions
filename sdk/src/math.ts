// Mirrors programs/corp_actions/src/math.rs so the UI can preview entitlements.
// The program is the source of truth; these values must match it exactly.

export type DayCountName = "thirty360" | "act365";
export type ActionKindName = "coupon" | "redemption" | "partialRedemption" | "vote";

const DAY = 86_400;
const BPS = 10_000n;

export function dateFromTs(ts: number): [number, number, number] {
  const d = new Date(ts * 1000);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

export function formatDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export function dayCountFraction(startTs: number, endTs: number, convention: DayCountName): [bigint, bigint] {
  if (endTs <= startTs) return [0n, 1n];
  if (convention === "act365") return [BigInt(Math.floor((endTs - startTs) / DAY)), 365n];
  const [y1, m1, d1Raw] = dateFromTs(startTs);
  const [y2, m2, d2Raw] = dateFromTs(endTs);
  const d1 = d1Raw === 31 ? 30 : d1Raw;
  const d2 = d2Raw === 31 && d1 === 30 ? 30 : d2Raw;
  const days = 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
  return [BigInt(Math.max(days, 0)), 360n];
}

export function couponAmount(bonds: bigint, faceValue: bigint, rateBps: number, num: bigint, den: bigint): bigint {
  return (bonds * faceValue * BigInt(rateBps) * num) / (BPS * den);
}

export interface EntitlementInput {
  kind: ActionKindName;
  balance: bigint;
  faceValue: bigint;
  rateBps: number;
  dayCount: DayCountName;
  periodStartTs: number;
  periodEndTs: number;
  redeemBps: number;
}

/** Cash owed (minor units) and bonds retired for one holder. */
export function entitlementFor(i: EntitlementInput): { amount: bigint; retire: bigint } {
  const [num, den] = dayCountFraction(i.periodStartTs, i.periodEndTs, i.dayCount);
  const coupon = (b: bigint) => couponAmount(b, i.faceValue, i.rateBps, num, den);
  switch (i.kind) {
    case "coupon":
      return { amount: coupon(i.balance), retire: 0n };
    case "redemption":
      return { amount: i.balance * i.faceValue + coupon(i.balance), retire: i.balance };
    case "partialRedemption": {
      const retire = (i.balance * BigInt(i.redeemBps)) / BPS;
      return { amount: retire * i.faceValue + coupon(i.balance), retire };
    }
    case "vote":
      return { amount: 0n, retire: 0n };
  }
}

/** Formats minor units (tiyn) as tenge, e.g. 87000000n → "870,000.00". */
export function formatKzt(minor: bigint | number, decimals = 2): string {
  const v = BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const scale = 10n ** BigInt(decimals);
  const whole = (abs / scale).toLocaleString("en-US");
  const frac = (abs % scale).toString().padStart(decimals, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}
