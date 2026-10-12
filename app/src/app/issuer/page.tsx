"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { entitlementFor } from "@morro/sdk/src/math";
import { ActionCard } from "@/components/action-card";
import { useMorro } from "@/components/providers";
import { Address, Badge, EntitlementBadge, Empty, Loading, PageHeader, Progress, Section, Spinner } from "@/components/ui";
import { fmtDate, int, isOpen, isoDay, kzt, kztPlain, relative, retires } from "@/lib/format";
import type { ActionKind, ActionView, BondView, RoleName, SettlementMode } from "@/lib/types";

// ------------------------------------------------------------------ announce

interface Draft {
  kind: ActionKind;
  mode: SettlementMode;
  recordInSec: number;
  paymentInSec: number;
  periodStart: string;
  periodEnd: string;
  redeemPct: number;
  newMaturity: string;
  quorumPct: number;
  thresholdPct: number;
  voteEndInSec: number;
}

const addMonths = (ts: number, months: number) => {
  const d = new Date(ts * 1000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return Math.floor(d.getTime() / 1000);
};

function presets(bond: BondView): { key: string; label: string; draft: Partial<Draft> }[] {
  return [
    { key: "coupon", label: "Coupon", draft: { kind: "coupon", periodStart: "2026-04-15", periodEnd: "2026-10-15" } },
    {
      key: "redemption",
      label: "Redemption at maturity",
      draft: { kind: "redemption", periodStart: isoDay(addMonths(bond.maturityTs, -6)), periodEnd: isoDay(bond.maturityTs) },
    },
    { key: "partial", label: "Partial redemption 25%", draft: { kind: "partialRedemption", redeemPct: 25, periodStart: "", periodEnd: "" } },
    {
      key: "vote",
      label: "Consent vote: extend 6 months",
      draft: { kind: "vote", newMaturity: isoDay(addMonths(bond.maturityTs, 6)), quorumPct: 50, thresholdPct: 66.67 },
    },
  ];
}

const DEFAULT_DRAFT: Draft = {
  kind: "coupon",
  mode: "onChain",
  recordInSec: 60,
  paymentInSec: 120,
  periodStart: "2026-04-15",
  periodEnd: "2026-10-15",
  redeemPct: 25,
  newMaturity: "2028-04-15",
  quorumPct: 50,
  thresholdPct: 66.67,
  voteEndInSec: 180,
};

const dayTs = (s: string) => (s ? Math.floor(Date.parse(`${s}T00:00:00Z`) / 1000) : 0);

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.7rem] text-faint">{hint}</span>}
    </label>
  );
}

function AnnounceForm({ bond }: { bond: BondView }) {
  const { run, busy, now } = useMorro();
  const [d, setD] = useState<Draft>(DEFAULT_DRAFT);
  const [preset, setPreset] = useState("coupon");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const isVote = d.kind === "vote";
  const supply = BigInt(bond.supply);

  const est = useMemo(
    () =>
      entitlementFor({
        kind: d.kind,
        balance: supply,
        faceValue: BigInt(bond.faceValue),
        rateBps: bond.couponRateBps,
        dayCount: bond.dayCount,
        periodStartTs: dayTs(d.periodStart),
        periodEndTs: dayTs(d.periodEnd),
        redeemBps: d.kind === "redemption" ? 10_000 : Math.round(d.redeemPct * 100),
      }),
    [d, supply, bond],
  );

  const submit = async () => {
    await run(
      "announce",
      {
        kind: d.kind,
        settlementMode: d.mode,
        recordInSec: d.recordInSec,
        paymentInSec: d.paymentInSec,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        redeemBps: Math.round(d.redeemPct * 100),
        newMaturity: d.newMaturity,
        quorumBps: Math.round(d.quorumPct * 100),
        thresholdBps: Math.round(d.thresholdPct * 100),
        voteEndInSec: d.voteEndInSec,
      },
      { label: `Announce action #${bond.nextActionId}`, signer: "issuer" },
    );
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Announce a corporate action</h3>
          <p className="text-xs text-muted">Next action id #{bond.nextActionId} · signs as Issuer</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1.5">
        {presets(bond).map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setPreset(p.key);
              setD((x) => ({ ...x, ...p.draft }));
            }}
            className={`rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors ${
              preset === p.key ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-muted hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {!isVote && (
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Settlement</span>
            <div className="grid grid-cols-2 rounded-lg border border-line bg-subtle p-0.5 text-xs font-medium">
              {(["onChain", "offChain"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("mode", m)}
                  className={`rounded-md px-2 py-1.5 ${d.mode === m ? "bg-card text-ink shadow-sm" : "text-muted"}`}
                >
                  {m === "onChain" ? "On-chain tKZT escrow" : "Off-chain paying agent"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Record date in (s)" hint={`≈ ${relative(now + d.recordInSec, now).replace("in ", "")} from chain time`}>
            <input
              className="field num"
              type="number"
              min={5}
              value={d.recordInSec}
              onChange={(e) => set("recordInSec", Number(e.target.value))}
            />
          </Field>
          {isVote ? (
            <Field label="Voting ends in (s)">
              <input
                className="field num"
                type="number"
                min={10}
                value={d.voteEndInSec}
                onChange={(e) => set("voteEndInSec", Number(e.target.value))}
              />
            </Field>
          ) : (
            <Field label="Payment date in (s)">
              <input
                className="field num"
                type="number"
                min={10}
                value={d.paymentInSec}
                onChange={(e) => set("paymentInSec", Number(e.target.value))}
              />
            </Field>
          )}
        </div>

        {!isVote && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Coupon period start">
              <input className="field num" type="date" value={d.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
            </Field>
            <Field label="Coupon period end">
              <input className="field num" type="date" value={d.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
            </Field>
          </div>
        )}
        {d.kind === "partialRedemption" && (
          <Field label="Share retired (%)" hint="Leave the coupon period empty to redeem at par with no accrued coupon.">
            <input
              className="field num"
              type="number"
              min={1}
              max={99}
              step={1}
              value={d.redeemPct}
              onChange={(e) => set("redeemPct", Number(e.target.value))}
            />
          </Field>
        )}
        {isVote && (
          <>
            <Field label="Proposed new maturity" hint={`Current maturity ${fmtDate(bond.maturityTs)}`}>
              <input className="field num" type="date" value={d.newMaturity} onChange={(e) => set("newMaturity", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quorum (% of supply)">
                <input
                  className="field num"
                  type="number"
                  step={0.01}
                  value={d.quorumPct}
                  onChange={(e) => set("quorumPct", Number(e.target.value))}
                />
              </Field>
              <Field label="Pass threshold (% yes)">
                <input
                  className="field num"
                  type="number"
                  step={0.01}
                  value={d.thresholdPct}
                  onChange={(e) => set("thresholdPct", Number(e.target.value))}
                />
              </Field>
            </div>
          </>
        )}
      </div>

      {!isVote && (
        <div className="mt-4 rounded-lg bg-subtle p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">Est. cash at current supply</span>
            <span className="num font-semibold">{kzt(est.amount)}</span>
          </div>
          {est.retire > 0n && (
            <div className="mt-1 flex justify-between">
              <span className="text-muted">Bonds retired</span>
              <span className="num font-semibold">{int(est.retire)}</span>
            </div>
          )}
          {retires({ kind: d.kind } as ActionView) && (
            <p className="mt-2 text-warn">Bond transfers lock from the record date until this action closes.</p>
          )}
        </div>
      )}

      <button className="btn btn-primary mt-4 w-full" disabled={!!busy} onClick={submit}>
        {busy === "announce" && <Spinner />} Announce
      </button>
    </div>
  );
}

// ---------------------------------------------------------- issue + registrar

const HOLDER_ROLES: RoleName[] = ["holderA", "holderB", "holderC", "outsider"];

function IssueForm() {
  const { state, run, busy } = useMorro();
  const [to, setTo] = useState<RoleName>("holderC");
  const [amount, setAmount] = useState(500);
  if (!state) return null;
  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold tracking-tight">Issue bonds</h3>
      <p className="text-xs text-muted">Mints new KZTB to a registered holder · signs as Issuer</p>
      <div className="mt-4 grid grid-cols-[1fr_110px] gap-3">
        <Field label="To">
          <select className="field" value={to} onChange={(e) => setTo(e.target.value as RoleName)}>
            {HOLDER_ROLES.map((r) => (
              <option key={r} value={r}>
                {state.config.roleLabels[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bonds">
          <input className="field num" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
      </div>
      <button
        className="btn btn-ghost mt-3 w-full"
        disabled={!!busy || amount < 1}
        onClick={() =>
          run("issue", { to, amount }, { label: `Issue ${int(amount)} bonds to ${state.config.roleLabels[to]}`, signer: "issuer" })
        }
      >
        {busy === "issue" && <Spinner />} Issue {int(Math.max(amount, 0))} bonds
      </button>
    </div>
  );
}

function RegistrarPanel() {
  const { state, run, busy } = useMorro();
  if (!state) return null;
  const wallets = state.wallets.filter((w) => HOLDER_ROLES.includes(w.role));
  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold tracking-tight">Registrar</h3>
      <p className="text-xs text-muted">KYC register enforced by the transfer hook · signs as Registrar</p>
      <ul className="mt-4 divide-y divide-line">
        {wallets.map((w) => {
          const key = `reg-${w.role}`;
          const setStatus = (kycApproved: boolean, frozen: boolean, label: string) =>
            run("setHolderStatus", { owner: w.role, kycApproved, frozen }, { label, signer: "registrar", busyKey: key });
          return (
            <li key={w.role} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {w.label}
                  {busy === key && <Spinner />}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {w.registered ? (
                    <>
                      <Badge tone={w.kycApproved ? "ok" : "warn"}>{w.kycApproved ? "KYC approved" : "KYC revoked"}</Badge>
                      {w.frozen && <Badge tone="bad">Frozen</Badge>}
                    </>
                  ) : (
                    <Badge tone="neutral">Not registered</Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5">
                {!w.registered ? (
                  <button
                    className="btn btn-ghost px-2.5! py-1! text-xs!"
                    disabled={!!busy}
                    onClick={() => run("registerHolder", { owner: w.role }, { label: `Register ${w.label}`, signer: "registrar", busyKey: key })}
                  >
                    Register + KYC
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-ghost px-2.5! py-1! text-xs!"
                      disabled={!!busy}
                      onClick={() =>
                        setStatus(!w.kycApproved, w.frozen, `${w.kycApproved ? "Revoke" : "Approve"} KYC for ${w.label}`)
                      }
                    >
                      {w.kycApproved ? "Revoke KYC" : "Approve KYC"}
                    </button>
                    <button
                      className={`btn px-2.5! py-1! text-xs! ${w.frozen ? "btn-ghost" : "btn-danger"}`}
                      disabled={!!busy}
                      onClick={() => setStatus(w.kycApproved, !w.frozen, `${w.frozen ? "Unfreeze" : "Freeze"} ${w.label}`)}
                    >
                      {w.frozen ? "Unfreeze" : "Freeze"}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ action controls

function nextStep(a: ActionView, now: number): string {
  if (a.status === "announced") {
    return now > a.recordTs
      ? "Record date passed. Run the crank to snapshot holders and finalize."
      : `Waiting for the record date (${relative(a.recordTs, now)}). Trades until then count.`;
  }
  if (a.status === "voting") {
    return now >= a.voteEndTs
      ? "Voting closed. Run the crank to finalize the result."
      : `Holders can vote from the holder portal; voting ends ${relative(a.voteEndTs, now)}.`;
  }
  if (a.status === "snapshotted" && a.settlementMode === "onChain") return "Snapshot final. Fund the escrow with the total entitlement.";
  const due = now >= a.paymentTs;
  if ((a.status === "funded" || a.status === "snapshotted") && !due) return `Waiting for the payment date (${relative(a.paymentTs, now)}).`;
  if (a.status === "funded" || a.status === "snapshotted") return "Payment date reached. Run the crank to pay holders.";
  if (a.status === "paying") {
    if (a.holdersSettled >= a.holdersSnapshotted) return "Every entitlement settled. Close the action to publish the report hash.";
    if (a.settlementMode === "offChain") {
      const pending = a.entitlements.some((e) => e.status === "pending");
      return pending ? "Run the crank to instruct remaining payments." : "Payments instructed. Run the paying agent to settle on the rail.";
    }
    return "Run the crank to pay the remaining holders.";
  }
  return "";
}

function ActionControls({ action: a }: { action: ActionView }) {
  const { state, run, busy, now } = useMorro();
  if (!state?.bond) return null;
  const k = (op: string) => `${op}-${a.actionId}`;
  const issuerCash = BigInt(state.wallets.find((w) => w.role === "issuer")?.cashBalance ?? "0");
  const supplyAtRecord = BigInt(a.supplyAtRecord !== "0" ? a.supplyAtRecord : state.bond.supply);
  const snapBal = BigInt(a.snapshottedBalance);
  const canFund = a.kind !== "vote" && a.settlementMode === "onChain" && a.status === "snapshotted";
  const canAgent = a.settlementMode === "offChain" && a.status === "paying" && a.entitlements.some((e) => e.status === "instructed");
  const canClose = a.kind !== "vote" && a.status === "paying" && a.holdersSettled >= a.holdersSnapshotted;
  const step = nextStep(a, now);

  return (
    <div className="space-y-4">
      {step && (
        <div className="flex items-start gap-2 text-sm">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{step}</span>
        </div>
      )}
      <div className="space-y-3">
        <div>
          <div className="flex flex-wrap justify-between gap-x-3 text-xs">
            <span className="font-medium text-muted">Snapshot</span>
            <span className="num text-muted">
              {int(snapBal)} / {int(supplyAtRecord)} bonds · {a.holdersSnapshotted} holder{a.holdersSnapshotted === 1 ? "" : "s"} captured
            </span>
          </div>
          <div className="mt-1.5">
            <Progress value={Number(snapBal)} max={Number(supplyAtRecord)} tone={a.status !== "announced" ? "ok" : "accent"} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-ghost"
            disabled={!!busy}
            onClick={() => run("crank", {}, { label: "Crank pass", signer: "crank", busyKey: k("crank") })}
          >
            {busy === k("crank") && <Spinner />} Run crank now
          </button>
          {a.kind !== "vote" && a.settlementMode === "onChain" && (
            <button
              className="btn btn-primary"
              disabled={!!busy || !canFund}
              title={canFund ? `Issuer holds ${kztPlain(issuerCash)} tKZT` : "Available once the snapshot is final"}
              onClick={() =>
                run("fundEscrow", { actionId: a.actionId }, { label: `Fund escrow for #${a.actionId}`, signer: "issuer", busyKey: k("fund") })
              }
            >
              {busy === k("fund") && <Spinner />} Fund escrow{a.totalEntitlement !== "0" ? ` (${kztPlain(a.totalEntitlement)} tKZT)` : ""}
            </button>
          )}
          {a.settlementMode === "offChain" && a.kind !== "vote" && (
            <button
              className="btn btn-primary"
              disabled={!!busy || !canAgent}
              onClick={() =>
                run("payingAgent", {}, { label: "Paying agent pass", signer: "payingAgent", busyKey: k("agent") })
              }
            >
              {busy === k("agent") && <Spinner />} Run paying agent
            </button>
          )}
          {a.kind !== "vote" && (
            <button
              className="btn btn-primary"
              disabled={!!busy || !canClose}
              onClick={() =>
                run("closeAction", { actionId: a.actionId }, { label: `Close #${a.actionId} and publish report`, signer: "issuer", busyKey: k("close") })
              }
            >
              {busy === k("close") && <Spinner />} Close &amp; publish report
            </button>
          )}
        </div>
      </div>

      {a.entitlements.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label px-3 py-2 font-semibold">Holder</th>
                <th className="label px-3 py-2 text-right font-semibold">At record</th>
                <th className="label px-3 py-2 text-right font-semibold">{a.kind === "vote" ? "Vote" : "Amount"}</th>
                {retires(a) && <th className="label px-3 py-2 text-right font-semibold">Retire</th>}
                {a.kind !== "vote" && <th className="label px-3 py-2 text-right font-semibold">Status</th>}
              </tr>
            </thead>
            <tbody>
              {a.entitlements.map((e) => (
                <tr key={e.owner} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium">{e.ownerLabel}</td>
                  <td className="num px-3 py-2 text-right">{int(e.balanceAtRecord)}</td>
                  <td className="num px-3 py-2 text-right">
                    {a.kind === "vote" ? (
                      e.vote === "none" ? (
                        <span className="text-faint">not cast</span>
                      ) : (
                        <Badge tone={e.vote === "yes" ? "ok" : "bad"}>{e.vote.toUpperCase()}</Badge>
                      )
                    ) : (
                      kzt(e.amount)
                    )}
                  </td>
                  {retires(a) && <td className="num px-3 py-2 text-right">{int(e.bondsToRetire)}</td>}
                  {a.kind !== "vote" && (
                    <td className="px-3 py-2 text-right">
                      <EntitlementBadge status={e.status} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {a.status === "closed" && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>
            Report hash <span className="font-mono text-ink">{a.reportHash.slice(0, 16)}…</span>
          </span>
          <Link className="font-medium text-accent hover:underline" href={`/audit/${a.actionId}`}>
            Verify in audit view
          </Link>
          {a.reportAvailable && (
            <a className="font-medium text-accent hover:underline" href={`/api/reports/${a.actionId}`}>
              Download report JSON
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------- page

export default function IssuerPage() {
  const { state, run, busy, setRole } = useMorro();
  const [showClosed, setShowClosed] = useState(false);
  useEffect(() => setRole("issuer"), [setRole]);
  if (!state) return <Loading />;
  const { bond } = state;
  if (!bond) return <Empty>No bond found. Run `npm run demo:setup`.</Empty>;
  const issuer = state.wallets.find((w) => w.role === "issuer");
  const open = state.actions.filter(isOpen).sort((a, b) => b.actionId - a.actionId);
  const done = state.actions.filter((a) => !isOpen(a)).sort((a, b) => b.actionId - a.actionId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Issuer console"
        title="Run corporate actions"
        sub="Announce, snapshot, fund, settle and close. The crank and paying agent are run on demand here so each step is visible."
        right={
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right">
              <div className="label">Issuer tKZT</div>
              <div className="num text-sm font-semibold">{kztPlain(issuer?.cashBalance ?? "0")}</div>
            </div>
            <div className="text-right">
              <div className="label">Issuer</div>
              <Address value={issuer?.address ?? bond.issuer} />
            </div>
            <button
              className="btn btn-ghost"
              disabled={!!busy}
              onClick={() => run("crank", {}, { label: "Crank pass", signer: "crank", busyKey: "crank-all" })}
            >
              {busy === "crank-all" && <Spinner />} Run crank
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-8">
          <Section title="Open actions" sub={open.length ? `${open.length} in progress` : undefined}>
            {open.length === 0 ? (
              <Empty>No open actions. Pick a preset on the right and announce one.</Empty>
            ) : (
              <div className="space-y-4">
                {open.map((a) => (
                  <ActionCard key={a.address} action={a}>
                    <ActionControls action={a} />
                  </ActionCard>
                ))}
              </div>
            )}
          </Section>
          {done.length > 0 && (
            <Section
              title="Completed"
              sub={`${done.length} closed or decided`}
              right={
                <button className="text-sm font-medium text-accent hover:underline" onClick={() => setShowClosed((s) => !s)}>
                  {showClosed ? "Hide" : "Show"}
                </button>
              }
            >
              {showClosed && (
                <div className="space-y-4">
                  {done.map((a) => (
                    <ActionCard key={a.address} action={a} compact>
                      <ActionControls action={a} />
                    </ActionCard>
                  ))}
                </div>
              )}
            </Section>
          )}
        </div>
        <aside className="space-y-6">
          <AnnounceForm bond={bond} />
          <IssueForm />
          <RegistrarPanel />
        </aside>
      </div>
    </div>
  );
}
