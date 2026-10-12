"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ActionCard } from "@/components/action-card";
import { useMorro } from "@/components/providers";
import { Address, CopyButton, EntitlementBadge, Empty, PageHeader, Section, Spinner, TxLink } from "@/components/ui";
import { actionTitle, fmtDateTime, int, kzt, shortAddr, shortHash } from "@/lib/format";
import type { AuditEvent, AuditView } from "@/lib/types";

const EVENT_LABEL: Record<string, string> = {
  actionAnnounced: "Action announced",
  holderSnapshotted: "Holder snapshotted",
  snapshotFinalized: "Snapshot finalized",
  escrowFunded: "Escrow funded",
  entitlementPaid: "Entitlement paid",
  paymentInstructed: "Payment instructed",
  paymentConfirmed: "Payment confirmed",
  bondsRetired: "Bonds retired",
  voteCast: "Vote cast",
  voteFinalized: "Vote finalized",
  termsAmended: "Terms amended",
  actionClosed: "Action closed",
};

const AMOUNT_KEYS = new Set(["amount", "totalEntitlement", "totalPaid"]);
const TS_KEYS = new Set(["recordTs", "paymentTs", "oldMaturityTs", "newMaturityTs"]);
const SKIP_KEYS = new Set(["action", "mint"]);

function EventFields({ e, labelOf }: { e: AuditEvent; labelOf: (a: string) => string }) {
  const parts = Object.entries(e.data)
    .filter(([k]) => !SKIP_KEYS.has(k))
    .map(([k, v]) => {
      const s = String(v);
      let out: string;
      if (k === "owner") out = labelOf(s);
      else if (AMOUNT_KEYS.has(k) && /^\d+$/.test(s)) out = kzt(s);
      else if (TS_KEYS.has(k) && /^\d+$/.test(s)) out = fmtDateTime(Number(s));
      else if (/^[0-9a-f]{64}$/.test(s)) out = shortHash(s);
      else if (/^\d+$/.test(s)) out = int(s);
      else out = s;
      return { k, out };
    });
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
      {parts.map(({ k, out }) => (
        <span key={k}>
          <span className="text-faint">{k}</span> <span className="num font-medium text-ink">{out}</span>
        </span>
      ))}
    </div>
  );
}

function CheckRow({ label, pass, detail }: { label: string; pass: boolean | null; detail: string }) {
  const tone = pass === null ? "text-faint bg-subtle" : pass ? "text-ok bg-ok-soft" : "text-bad bg-bad-soft";
  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone}`}>
        {pass === null ? (
          <svg width="12" height="12" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2">
            <path d="M4 8h8" />
          </svg>
        ) : pass ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 8.5l3 3 7-7" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2.2">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className={`text-xs font-semibold ${pass === null ? "text-faint" : pass ? "text-ok" : "text-bad"}`}>
            {pass === null ? "Not yet applicable" : pass ? "Pass" : "Fail"}
          </span>
        </div>
        <div className="num mt-0.5 break-words font-mono text-xs text-muted">{detail}</div>
      </div>
    </li>
  );
}

function HashRow({ label, value, match }: { label: string; value: string | null; match?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="text-sm text-muted">{label}</span>
      {value ? (
        <span className="flex items-center gap-1.5">
          <span className={`font-mono text-xs ${match === false ? "text-bad" : "text-ink"}`} title={value}>
            {value.slice(0, 20)}…{value.slice(-8)}
          </span>
          <CopyButton text={value} />
        </span>
      ) : (
        <span className="text-xs text-faint">—</span>
      )}
    </div>
  );
}

export default function AuditDetailPage({ params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = use(params);
  const { state } = useMorro();
  const [audit, setAudit] = useState<AuditView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit/${actionId}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setAudit(body as AuditView);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [actionId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  const labelOf = (addr: string) => {
    if (!state) return shortAddr(addr);
    const role = (Object.entries(state.config.roles) as [string, string][]).find(([, a]) => a === addr)?.[0];
    return role ? state.config.roleLabels[role as keyof typeof state.config.roleLabels] : shortAddr(addr);
  };

  if (error && !audit) return <Empty>{error}</Empty>;
  if (!audit)
    return (
      <div className="card flex items-center gap-3 p-6 text-sm text-muted">
        <Spinner /> Rebuilding the audit trail from chain data…
      </div>
    );

  const a = audit.action;
  const passed = audit.checks.filter((c) => c.pass === true).length;
  const failed = audit.checks.filter((c) => c.pass === false).length;
  const applicable = audit.checks.filter((c) => c.pass !== null).length;
  const railByRef = new Map(audit.rail.map((r) => [r.ref, r]));
  const isVote = a.kind === "vote";

  return (
    <div className="space-y-8">
      <div className="text-sm">
        <Link href="/audit" className="text-muted hover:text-ink">
          Audit trail
        </Link>
        <span className="mx-2 text-faint">/</span>
        <span>Action #{a.actionId}</span>
      </div>
      <PageHeader
        eyebrow={`Audit · action #${a.actionId}`}
        title={actionTitle(a)}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            Action account <Address value={a.address} chars={6} />
          </span>
        }
        right={
          <div className="flex items-center gap-3">
            <div
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                failed ? "bg-bad-soft text-bad" : applicable ? "bg-ok-soft text-ok" : "bg-subtle text-muted"
              }`}
            >
              {failed ? `${failed} check${failed === 1 ? "" : "s"} failing` : `${passed} / ${applicable} checks pass`}
            </div>
            <button className="btn btn-ghost" onClick={load} disabled={loading}>
              {loading && <Spinner />} Re-verify
            </button>
          </div>
        }
      />

      <ActionCard action={a} compact />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Section title="Verification" sub="Recomputed independently from accounts and events on every load.">
          <ul className="card divide-y divide-line">
            {audit.checks.map((c) => (
              <CheckRow key={c.label} {...c} />
            ))}
          </ul>
        </Section>

        <Section title="Closing report">
          <div className="card p-5">
            <div className="divide-y divide-line">
              <HashRow label="On-chain report hash" value={audit.hashes.onChain || null} />
              <HashRow
                label="Recomputed from chain"
                value={audit.hashes.recomputed}
                match={audit.hashes.recomputed ? audit.hashes.recomputed === audit.hashes.onChain : undefined}
              />
              <HashRow
                label="SHA-256 of published file"
                value={audit.hashes.savedFile}
                match={audit.hashes.savedFile ? audit.hashes.savedFile === audit.hashes.onChain : undefined}
              />
              <HashRow label="Snapshot digest" value={a.snapshotDigest !== "0".repeat(64) ? a.snapshotDigest : null} />
            </div>
            {audit.reportAvailable ? (
              <a href={`/api/reports/${a.actionId}`} className="btn btn-primary mt-4 w-full">
                Download report JSON
              </a>
            ) : (
              <p className="mt-4 text-xs text-muted">
                {isVote
                  ? "Votes finish at the tally; the result and new maturity are recorded on-chain."
                  : "The report is published and its SHA-256 recorded on-chain when the issuer closes the action."}
              </p>
            )}
            <p className="mt-3 text-xs text-faint">
              The file is the exact byte string that was hashed: <span className="font-mono">sha256sum</span> of the download equals
              the on-chain value.
            </p>
          </div>
        </Section>
      </div>

      <Section title="Holder-by-holder" sub="Balances as of the record date, from the transfer hook's checkpoints.">
        {a.entitlements.length === 0 ? (
          <Empty>Snapshot not taken yet.</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="label px-4 py-3 font-semibold">Owner</th>
                  <th className="label px-4 py-3 text-right font-semibold">Balance at record</th>
                  <th className="label px-4 py-3 text-right font-semibold">{isVote ? "Vote" : "Amount"}</th>
                  {!isVote && <th className="label px-4 py-3 text-right font-semibold">Bonds retired</th>}
                  {!isVote && <th className="label px-4 py-3 font-semibold">Status</th>}
                  {!isVote && <th className="label px-4 py-3 font-semibold">Payment ref</th>}
                </tr>
              </thead>
              <tbody>
                {a.entitlements.map((e) => {
                  const rail = e.paymentRef ? railByRef.get(e.paymentRef) : undefined;
                  return (
                    <tr key={e.owner} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{e.ownerLabel}</div>
                        <Address value={e.owner} />
                      </td>
                      <td className="num px-4 py-3 text-right">{int(e.balanceAtRecord)}</td>
                      <td className="num px-4 py-3 text-right font-medium">
                        {isVote ? (e.vote === "none" ? "—" : e.vote.toUpperCase()) : kzt(e.amount)}
                      </td>
                      {!isVote && <td className="num px-4 py-3 text-right">{int(e.bondsToRetire)}</td>}
                      {!isVote && (
                        <td className="px-4 py-3">
                          <EntitlementBadge status={e.status} />
                          {e.settledTs > 0 && <div className="num mt-1 text-xs text-muted">{fmtDateTime(e.settledTs)}</div>}
                        </td>
                      )}
                      {!isVote && (
                        <td className="px-4 py-3 text-xs">
                          {e.paymentRef ? (
                            <>
                              <span className="font-mono" title={e.paymentRef}>
                                {shortHash(e.paymentRef)}
                              </span>
                              {rail && <div className="mt-0.5 text-muted">{rail.railReference}</div>}
                            </>
                          ) : (
                            <span className="text-faint">{a.settlementMode === "onChain" ? "tKZT transfer" : "—"}</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-subtle/60 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="num px-4 py-3 text-right">{int(a.supplyAtRecord)}</td>
                  <td className="num px-4 py-3 text-right">
                    {isVote ? `${int(a.votesYes)} yes / ${int(a.votesNo)} no` : kzt(a.totalEntitlement)}
                  </td>
                  {!isVote && <td className="num px-4 py-3 text-right">{int(a.totalRetired)}</td>}
                  {!isVote && <td className="px-4 py-3 text-xs font-normal text-muted">Paid {kzt(a.totalPaid)}</td>}
                  {!isVote && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>

      <Section title="Event timeline" sub={`${audit.events.length} program events decoded from transactions touching this action`}>
        {audit.events.length === 0 ? (
          <Empty>No events yet.</Empty>
        ) : (
          <ol className="card divide-y divide-line">
            {audit.events.map((e, i) => (
              <li key={`${e.signature}-${i}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <div className="text-sm font-medium">{EVENT_LABEL[e.name] ?? e.name}</div>
                  <div className="num text-xs text-faint">{e.blockTime ? fmtDateTime(e.blockTime) : `slot ${e.slot}`}</div>
                </div>
                <EventFields e={e} labelOf={labelOf} />
                <div className="text-xs">
                  <TxLink href={e.explorerUrl}>{shortAddr(e.signature, 5)}</TxLink>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
