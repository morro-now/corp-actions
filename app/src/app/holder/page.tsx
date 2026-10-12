"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMorro } from "@/components/providers";
import { Address, Badge, Countdown, EntitlementBadge, Empty, Loading, PageHeader, Section, Spinner, StatusBadge, TxLink } from "@/components/ui";
import { preview } from "@/lib/entitlement";
import { actionTitle, explorerAddress, fmtDate, fmtDateTime, int, isOpen, kzt, kztPlain, pct, shortHash } from "@/lib/format";
import { HOLDER_ROLES, type ActionView, type RoleName } from "@/lib/types";

function TransferForm({ from }: { from: RoleName }) {
  const { state, run, busy, now } = useMorro();
  const options = (["holderA", "holderB", "holderC", "outsider", "issuer"] as RoleName[]).filter((r) => r !== from);
  const [to, setTo] = useState<RoleName>(options[0]);
  const [amount, setAmount] = useState(10);
  const [last, setLast] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  useEffect(() => {
    if (!options.includes(to)) setTo(options[0]);
    setLast(null);
  }, [from]);
  if (!state?.bond) return null;
  const lockTs = state.bond.transferLockTs;
  const locked = lockTs > 0 && now >= lockTs;
  const target = state.wallets.find((w) => w.role === to);

  const submit = async () => {
    const r = await run(
      "transfer",
      { from, to, amount },
      { label: `Transfer ${int(amount)} KZTB to ${state.config.roleLabels[to]}`, signer: from, busyKey: "transfer" },
    );
    setLast(
      r.ok
        ? { ok: true, text: `Transferred ${int(amount)} bonds to ${state.config.roleLabels[to]}.`, href: r.explorerUrl }
        : { ok: false, text: r.error ?? "Transfer failed" },
    );
  };

  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold tracking-tight">Transfer bonds</h3>
      <p className="text-xs text-muted">
        Token-2022 transfer through the Morro hook: receiver must be KYC-approved, sender not frozen, no redemption lock.
      </p>
      {locked && (
        <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          Transfers are locked since {fmtDateTime(lockTs)} for an open redemption. The hook will reject this transfer.
        </div>
      )}
      <div className="mt-4 grid grid-cols-[1fr_110px] gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">To</span>
          <select className="field" value={to} onChange={(e) => setTo(e.target.value as RoleName)}>
            {options.map((r) => (
              <option key={r} value={r}>
                {state.config.roleLabels[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Bonds</span>
          <input className="field num" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </label>
      </div>
      {target && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          Receiver status:
          {target.registered && target.kycApproved ? (
            <Badge tone="ok">KYC approved</Badge>
          ) : (
            <Badge tone="warn">{target.registered ? "KYC revoked" : "No KYC record"}</Badge>
          )}
          {target.frozen && <Badge tone="bad">Frozen</Badge>}
        </div>
      )}
      <button className="btn btn-primary mt-4 w-full" disabled={!!busy || amount < 1} onClick={submit}>
        {busy === "transfer" && <Spinner />} Send {int(Math.max(amount, 0))} KZTB
      </button>
      {last && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${last.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}
          role="status"
        >
          <div className={last.ok ? "" : "font-mono"}>
            {last.ok ? last.text : <>Rejected by the transfer hook: {last.text}</>}
          </div>
          {last.href && (
            <div className="mt-1">
              <TxLink href={last.href}>View transaction</TxLink>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MyAction({ action: a, role }: { action: ActionView; role: RoleName }) {
  const { state, run, busy, now } = useMorro();
  if (!state?.bond) return null;
  const me = state.config.roles[role];
  const mine = a.entitlements.find((e) => e.owner === me);
  const wallet = state.wallets.find((w) => w.role === role);
  const snapshotted = a.status !== "announced";
  const isVote = a.kind === "vote";
  const est = preview(state.bond, a, BigInt(wallet?.recordBalance ?? "0"));
  const k = `vote-${a.actionId}`;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-xs text-muted">#{a.actionId}</span>
            <span className="font-semibold">{actionTitle(a)}</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            Record {fmtDateTime(a.recordTs)} <Countdown ts={a.recordTs} />
            {!isVote && (
              <>
                {" · "}Payment {fmtDateTime(a.paymentTs)} <Countdown ts={a.paymentTs} />
              </>
            )}
            {isVote && (
              <>
                {" · "}Voting ends {fmtDateTime(a.voteEndTs)} <Countdown ts={a.voteEndTs} />
              </>
            )}
          </div>
        </div>
        <StatusBadge status={a.status} />
      </div>

      <div className="mt-4 rounded-lg bg-subtle p-4">
        {!snapshotted ? (
          isVote ? (
            <div className="text-sm">
              Voting weight if held at record: <span className="num font-semibold">{int(wallet?.recordBalance ?? "0")} votes</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="label">My entitlement (estimate)</div>
                <div className="num mt-1 text-xl font-semibold">{kzt(est.amount)}</div>
                <div className="mt-0.5 text-xs text-muted">
                  At my current {int(wallet?.recordBalance ?? "0")} bonds. Final once the record-date snapshot is taken.
                </div>
              </div>
              {est.retire > 0n && (
                <div className="text-right">
                  <div className="label">Bonds retired</div>
                  <div className="num mt-1 text-sm font-semibold">{int(est.retire)}</div>
                </div>
              )}
            </div>
          )
        ) : !mine ? (
          <div className="text-sm text-muted">Not entitled: no bonds held at the record date.</div>
        ) : isVote ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">My ballot</div>
              <div className="mt-1 text-sm">
                Weight <span className="num font-semibold">{int(mine.balanceAtRecord)} votes</span> · proposal: maturity to{" "}
                <span className="font-semibold">{fmtDate(a.newMaturityTs)}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted">
                Quorum {pct(a.quorumBps)} of supply, passes at {pct(a.thresholdBps)} yes.
              </div>
            </div>
            {mine.vote !== "none" ? (
              <Badge tone={mine.vote === "yes" ? "ok" : "bad"}>Voted {mine.vote.toUpperCase()}</Badge>
            ) : a.status === "voting" && now < a.voteEndTs ? (
              <div className="flex gap-2">
                <button
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={() =>
                    run("castVote", { role, actionId: a.actionId, yes: true }, { label: `Vote YES on #${a.actionId}`, signer: role, busyKey: k })
                  }
                >
                  {busy === k && <Spinner />} Vote yes
                </button>
                <button
                  className="btn btn-danger"
                  disabled={!!busy}
                  onClick={() =>
                    run("castVote", { role, actionId: a.actionId, yes: false }, { label: `Vote NO on #${a.actionId}`, signer: role, busyKey: k })
                  }
                >
                  Vote no
                </button>
              </div>
            ) : (
              <Badge tone="neutral">Voting closed</Badge>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="label">My entitlement</div>
              <div className="num mt-1 text-xl font-semibold">{kzt(mine.amount)}</div>
              <div className="mt-0.5 text-xs text-muted">
                On {int(mine.balanceAtRecord)} bonds held at the record date
                {BigInt(mine.bondsToRetire) > 0n && ` · ${int(mine.bondsToRetire)} bonds retired`}
              </div>
            </div>
            <EntitlementBadge status={mine.status} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function HolderPage() {
  const { state, role, setRole } = useMorro();
  const holder: RoleName = HOLDER_ROLES.includes(role) ? role : "holderA";
  useEffect(() => {
    if (!HOLDER_ROLES.includes(role)) setRole("holderA");
  }, [role, setRole]);

  if (!state) return <Loading />;
  if (!state.bond) return <Empty>No bond found. Run `npm run demo:setup`.</Empty>;
  const w = state.wallets.find((x) => x.role === holder)!;
  const me = w.address;
  const face = BigInt(state.bond.faceValue);
  const upcoming = state.actions.filter(isOpen).sort((a, b) => a.recordTs - b.recordTs);
  const history = state.actions
    .flatMap((a) => a.entitlements.filter((e) => e.owner === me && e.status !== "pending" && a.kind !== "vote").map((e) => ({ a, e })))
    .sort((x, y) => y.e.settledTs - x.e.settledTs);
  const votes = state.actions.flatMap((a) =>
    a.kind === "vote" ? a.entitlements.filter((e) => e.owner === me && e.vote !== "none").map((e) => ({ a, e })) : [],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Holder portal"
        title={state.config.roleLabels[holder]}
        sub="What this investor holds, what they are owed, and how they vote. Every action here is signed by this holder's demo key."
        right={
          <div className="flex rounded-lg border border-line bg-card p-0.5">
            {HOLDER_ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  holder === r ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
                }`}
              >
                {r === "outsider" ? "Outsider" : state.config.roleLabels[r].replace("Holder ", "")}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="label">KZTB-27 bonds</div>
          <div className="num mt-1 text-2xl font-semibold">{int(w.bondBalance)}</div>
          <div className="num mt-0.5 text-xs text-muted">{kzt(BigInt(w.bondBalance) * face)} at par</div>
        </div>
        <div className="card p-5">
          <div className="label">tKZT cash</div>
          <div className="num mt-1 text-2xl font-semibold">{kztPlain(w.cashBalance)}</div>
          <div className="mt-0.5 text-xs text-muted">received coupons and principal</div>
        </div>
        <div className="card p-5">
          <div className="label">Register status</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {w.registered ? (
              <>
                <Badge tone={w.kycApproved ? "ok" : "warn"} dot>
                  {w.kycApproved ? "KYC approved" : "KYC revoked"}
                </Badge>
                {w.frozen ? <Badge tone="bad">Frozen</Badge> : <Badge tone="neutral">Not frozen</Badge>}
              </>
            ) : (
              <Badge tone="warn" dot>
                No KYC record
              </Badge>
            )}
          </div>
          <div className="mt-2 text-xs text-muted">
            {w.registered ? "Can receive bonds" : "Transfers to this wallet are rejected"}
          </div>
        </div>
        <div className="card p-5">
          <div className="label">Wallet</div>
          <div className="mt-2">
            <Address value={me} chars={6} />
          </div>
          <div className="mt-2 text-xs text-muted">Server-held demo key</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-8">
          <Section title="Upcoming and open actions" sub="Estimates use your current balance until the record-date snapshot fixes them.">
            {upcoming.length === 0 ? (
              <Empty>No open corporate actions.</Empty>
            ) : (
              <div className="space-y-4">
                {upcoming.map((a) => (
                  <MyAction key={a.address} action={a} role={holder} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Payment history">
            {history.length === 0 ? (
              <Empty>No payments yet.</Empty>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="label px-4 py-2.5 font-semibold">Action</th>
                      <th className="label px-4 py-2.5 text-right font-semibold">Amount</th>
                      <th className="label px-4 py-2.5 font-semibold">Settled</th>
                      <th className="label px-4 py-2.5 font-semibold">Reference</th>
                      <th className="label px-4 py-2.5 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(({ a, e }) => (
                      <tr key={e.address} className="border-b border-line last:border-0">
                        <td className="px-4 py-3">
                          <Link href={`/audit/${a.actionId}`} className="font-medium hover:text-accent">
                            #{a.actionId} {actionTitle(a)}
                          </Link>
                          <div className="text-xs text-muted">
                            {a.settlementMode === "onChain" ? "tKZT on-chain" : "Off-chain rail"}
                            {BigInt(e.bondsToRetire) > 0n && ` · ${int(e.bondsToRetire)} bonds retired`}
                          </div>
                        </td>
                        <td className="num px-4 py-3 text-right font-medium">{kzt(e.amount)}</td>
                        <td className="num px-4 py-3 text-xs">{e.settledTs ? fmtDateTime(e.settledTs) : "—"}</td>
                        <td className="px-4 py-3 text-xs">
                          {e.paymentRef ? (
                            <span className="font-mono">{shortHash(e.paymentRef)}</span>
                          ) : (
                            <TxLink href={explorerAddress(state.config, e.address)}>Explorer</TxLink>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <EntitlementBadge status={e.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {votes.length > 0 && (
            <Section title="Votes cast">
              <ul className="card divide-y divide-line">
                {votes.map(({ a, e }) => (
                  <li key={e.address} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span>
                      #{a.actionId} Extend maturity to {fmtDate(a.newMaturityTs)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="num text-xs text-muted">{int(e.balanceAtRecord)} votes</span>
                      <Badge tone={e.vote === "yes" ? "ok" : "bad"}>{e.vote.toUpperCase()}</Badge>
                      <StatusBadge status={a.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <aside className="space-y-6">
          <TransferForm from={holder} />
        </aside>
      </div>
    </div>
  );
}
