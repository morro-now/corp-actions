"use client";

import Link from "next/link";
import { ActionCard } from "@/components/action-card";
import { useMorro } from "@/components/providers";
import { Address, Badge, Empty, Loading, PageHeader, Section, Stat } from "@/components/ui";
import { DAY_COUNT_LABEL, FREQ_LABEL, couponPerBond } from "@/lib/entitlement";
import { fmtDate, fmtDateTime, int, kzt, kztPlain, pct } from "@/lib/format";

const STEPS = [
  { n: "01", t: "Identify", d: "Transfer-hook checkpoints give every holder's balance as of the record date." },
  { n: "02", t: "Calculate", d: "Coupon, principal and retirements computed on-chain with 30/360 math." },
  { n: "03", t: "Settle", d: "tKZT from escrow, or a paying agent confirming off-chain rail payments." },
  { n: "04", t: "Record", d: "Snapshot digest and a hashed closing report anyone can verify." },
];

export default function OverviewPage() {
  const { state, now } = useMorro();
  if (!state) return <Loading />;
  const { bond, metadata, holders, actions } = state;
  if (!bond) return <Empty>No bond found for mint {state.config.mint}. Run `npm run demo:setup`.</Empty>;

  const supply = BigInt(bond.supply);
  const face = BigInt(bond.faceValue);
  const name = metadata?.name ?? "Bond";
  const symbol = metadata?.symbol ?? "";
  const locked = bond.transferLockTs > 0 && now >= bond.transferLockTs;
  const sorted = [...actions].sort((a, b) => b.actionId - a.actionId);
  const periodEnd = new Date(bond.issueTs * 1000);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + Math.round(12 / bond.couponFreq));
  const periodCoupon = couponPerBond(bond, bond.issueTs, Math.floor(periodEnd.getTime() / 1000));

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Overview"
        title={`${symbol} · ${name}`}
        sub="A tokenized tenge bond whose coupons, redemptions and consent votes run as on-chain corporate actions: identify holders at the record date, calculate entitlements, settle, and record."
        right={
          <div className="flex gap-2">
            <Link href="/issuer" className="btn btn-primary">
              Issuer console
            </Link>
            <Link href="/audit" className="btn btn-ghost">
              Audit trail
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-accent px-2 py-0.5 font-mono text-xs font-semibold text-accent-ink">{symbol}</span>
                <Badge tone={bond.status === "active" ? "ok" : "neutral"} dot>
                  {bond.status === "active" ? "Active" : "Redeemed"}
                </Badge>
                {locked ? <Badge tone="warn">Transfers locked</Badge> : <Badge tone="neutral">Transfers open</Badge>}
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{name}</h2>
              <p className="text-sm text-muted">{metadata?.fields.issuer ?? "Issuer"} · Token-2022 with KYC transfer hook</p>
            </div>
            <div className="text-right">
              <div className="label">Outstanding notional</div>
              <div className="num mt-1 text-xl font-semibold">{kzt(supply * face)}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5 sm:grid-cols-4">
            <Stat label="Face value" value={kzt(face)} sub="per bond" />
            <Stat
              label="Coupon"
              value={pct(bond.couponRateBps)}
              sub={`${FREQ_LABEL[bond.couponFreq] ?? `${bond.couponFreq}x/yr`} · ${kzt(periodCoupon)}/bond`}
            />
            <Stat label="Day count" value={DAY_COUNT_LABEL[bond.dayCount]} />
            <Stat label="Maturity" value={fmtDate(bond.maturityTs)} sub={`Issued ${fmtDate(bond.issueTs)}`} />
            <Stat label="Supply" value={`${int(supply)} bonds`} />
            <Stat label="Holders" value={int(bond.holderCount)} sub={`${holders.filter((h) => h.kycApproved).length} KYC-approved`} />
            <Stat
              label="Transfer lock"
              value={bond.transferLockTs ? (locked ? "Locked" : "Scheduled") : "None"}
              sub={bond.transferLockTs ? `from ${fmtDateTime(bond.transferLockTs)}` : "no open redemption"}
            />
            <Stat label="Settlement" value="tKZT" sub="2 decimals (tiyn)" />
          </div>

          <div className="mt-6 grid gap-3 border-t border-line pt-5 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Bond mint</span>
              <Address value={bond.mint} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Settlement mint</span>
              <Address value={bond.settlementMint} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Bond config</span>
              <Address value={bond.address} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Issuer</span>
              <Address value={bond.issuer} />
            </div>
          </div>
          {metadata && Object.keys(metadata.fields).length > 0 && (
            <div className="mt-5 rounded-lg bg-subtle p-3.5">
              <div className="label mb-2">On-mint token metadata</div>
              <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                {Object.entries(metadata.fields).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="font-mono text-faint">{k}</dt>
                    <dd className="truncate text-right text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="text-base font-semibold tracking-tight">Register of holders</h2>
          <p className="text-sm text-muted">Live balances from on-chain holder records.</p>
          <ul className="mt-5 space-y-4">
            {holders.map((h) => {
              const bal = BigInt(h.balance);
              const share = supply > 0n ? Number((bal * 10_000n) / supply) / 100 : 0;
              return (
                <li key={h.owner}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{h.label}</span>
                      {h.frozen && <Badge tone="bad">Frozen</Badge>}
                      {!h.kycApproved && <Badge tone="warn">KYC off</Badge>}
                    </span>
                    <span className="num font-medium">{int(bal)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                    </div>
                    <span className="num w-14 text-right text-xs text-muted">{share.toFixed(2)}%</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-faint">
                    <Address value={h.owner} />
                    <span className="num">{kztPlain(h.cashBalance)} tKZT</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <li key={s.n} className="card p-4">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs text-accent">{s.n}</span>
              <span className="text-sm font-semibold">{s.t}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{s.d}</p>
          </li>
        ))}
      </ol>

      <Section
        title="Corporate actions"
        sub={`${actions.length} action${actions.length === 1 ? "" : "s"} on record, newest first`}
        right={
          <Link href="/issuer" className="text-sm font-medium text-accent hover:underline">
            Announce an action
          </Link>
        }
      >
        {sorted.length === 0 ? (
          <Empty>No corporate actions yet. Announce a coupon from the issuer console.</Empty>
        ) : (
          <div className="space-y-4">
            {sorted.map((a) => (
              <ActionCard key={a.address} action={a} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
