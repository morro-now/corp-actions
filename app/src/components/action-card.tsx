"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { preview } from "@/lib/entitlement";
import { actionTitle, fmtDate, fmtDateTime, int, kzt, pct } from "@/lib/format";
import type { ActionView, BondView } from "@/lib/types";
import { useMorro } from "./providers";
import { Badge, Countdown, Progress, StageBar, StatusBadge } from "./ui";

function DateCell({ label, ts, hint }: { label: string; ts: number; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className="num mt-1 text-sm font-medium">{fmtDateTime(ts)}</div>
      <div className="mt-0.5 flex items-center gap-2">
        <Countdown ts={ts} />
        {hint}
      </div>
    </div>
  );
}

export function VoteTally({ action }: { action: ActionView }) {
  const yes = BigInt(action.votesYes);
  const no = BigInt(action.votesNo);
  const supply = BigInt(action.supplyAtRecord || "0");
  const cast = yes + no;
  const share = (v: bigint) => (supply > 0n ? Number((v * 10_000n) / supply) / 100 : 0);
  const yesOfCast = cast > 0n ? Number((yes * 10_000n) / cast) / 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span>
          <span className="font-semibold text-ok">Yes {int(yes)}</span>
          <span className="mx-2 text-faint">·</span>
          <span className="font-semibold text-bad">No {int(no)}</span>
          <span className="mx-2 text-faint">·</span>
          <span className="text-muted">of {int(supply)} eligible bonds</span>
        </span>
        <span className="num text-xs text-muted">
          Turnout {share(cast).toFixed(2)}% (quorum {pct(action.quorumBps)}) · Yes {yesOfCast.toFixed(2)}% of cast (needs{" "}
          {pct(action.thresholdBps)})
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-subtle">
        <div className="absolute inset-y-0 left-0 bg-ok" style={{ width: `${share(yes)}%` }} />
        <div className="absolute inset-y-0 bg-bad" style={{ left: `${share(yes)}%`, width: `${share(no)}%` }} />
        <div
          className="absolute inset-y-0 w-0.5 bg-ink/60"
          style={{ left: `${action.quorumBps / 100}%` }}
          title={`Quorum ${pct(action.quorumBps)}`}
        />
      </div>
    </div>
  );
}

export function ActionTotals({ action, bond }: { action: ActionView; bond: BondView }) {
  const snapshotted = action.status !== "announced";
  if (action.kind === "vote") {
    return snapshotted ? (
      <VoteTally action={action} />
    ) : (
      <p className="text-sm text-muted">Voting weights are captured at the record date; one vote per bond held.</p>
    );
  }
  const total = BigInt(action.totalEntitlement);
  const paid = BigInt(action.totalPaid);
  const est = preview(bond, action, BigInt(bond.supply));
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div>
        <div className="label">{snapshotted ? "Total entitlement" : "Est. total"}</div>
        <div className="num mt-1 text-sm font-semibold">{kzt(snapshotted ? total : est.amount)}</div>
        {!snapshotted && <div className="mt-0.5 text-xs text-muted">at current supply</div>}
      </div>
      <div>
        <div className="label">Paid</div>
        <div className="num mt-1 text-sm font-semibold">{kzt(paid)}</div>
        {snapshotted && total > 0n && (
          <div className="mt-1.5">
            <Progress value={Number(paid)} max={Number(total)} tone={paid === total ? "ok" : "accent"} />
          </div>
        )}
      </div>
      <div>
        <div className="label">Holders settled</div>
        <div className="num mt-1 text-sm font-semibold">
          {snapshotted ? `${action.holdersSettled} / ${action.holdersSnapshotted}` : "—"}
        </div>
      </div>
      <div>
        <div className="label">{action.kind === "coupon" ? "Supply at record" : "Bonds retired"}</div>
        <div className="num mt-1 text-sm font-semibold">
          {action.kind === "coupon"
            ? snapshotted
              ? int(action.supplyAtRecord)
              : "—"
            : `${int(action.totalRetired)}${snapshotted ? ` / ${int(preview(bond, action, BigInt(action.supplyAtRecord)).retire)}` : ""}`}
        </div>
      </div>
    </div>
  );
}

export function ActionCard({ action, children, compact }: { action: ActionView; children?: ReactNode; compact?: boolean }) {
  const { state, now } = useMorro();
  const bond = state?.bond;
  if (!bond) return null;
  const isVote = action.kind === "vote";
  const terms: string[] = [];
  if (action.kind === "coupon" || ((action.kind === "redemption" || action.kind === "partialRedemption") && action.periodEndTs > action.periodStartTs)) {
    terms.push(`Coupon period ${fmtDate(action.periodStartTs)} – ${fmtDate(action.periodEndTs)}`);
  }
  if (action.kind === "partialRedemption") terms.push(`Retires ${pct(action.redeemBps)} of each holding at par`);
  if (action.kind === "redemption") terms.push("Pays principal plus final coupon; burns every bond");
  if (isVote) terms.push(`Proposal: extend maturity to ${fmtDate(action.newMaturityTs)}`);
  const locked = (action.kind === "redemption" || action.kind === "partialRedemption") && action.status !== "closed" && now >= action.recordTs;

  return (
    <article className="card overflow-hidden">
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num rounded-md bg-subtle px-1.5 py-0.5 font-mono text-xs text-muted">#{action.actionId}</span>
              <h3 className="text-base font-semibold tracking-tight">{actionTitle(action)}</h3>
              {!isVote && <Badge tone="neutral">{action.settlementMode === "onChain" ? "On-chain tKZT" : "Off-chain rail"}</Badge>}
              {locked && <Badge tone="warn">Transfers locked</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">{terms.join(" · ")}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={action.status} />
            <Link href={`/audit/${action.actionId}`} className="text-xs font-medium text-accent hover:underline">
              Audit
            </Link>
          </div>
        </div>

        <StageBar action={action} />

        {!compact && (
          <div className="grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-3">
            <DateCell label="Record date" ts={action.recordTs} />
            {isVote ? (
              <DateCell label="Voting ends" ts={action.voteEndTs} />
            ) : (
              <DateCell label="Payment date" ts={action.paymentTs} />
            )}
            <div className="min-w-0">
              <div className="label">Announced</div>
              <div className="num mt-1 text-sm font-medium">{fmtDateTime(action.announcedTs)}</div>
              {action.closedTs > 0 && <div className="num mt-0.5 text-xs text-muted">Closed {fmtDateTime(action.closedTs)}</div>}
            </div>
          </div>
        )}

        <div className={compact ? "" : "border-t border-line pt-5"}>
          <ActionTotals action={action} bond={bond} />
        </div>
      </div>
      {children && <div className="border-t border-line bg-subtle/50 p-5 sm:px-6">{children}</div>}
    </article>
  );
}
