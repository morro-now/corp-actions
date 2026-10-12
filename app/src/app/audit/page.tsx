"use client";

import Link from "next/link";
import { useMorro } from "@/components/providers";
import { Empty, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { actionTitle, fmtDate, int, kzt, shortHash } from "@/lib/format";

export default function AuditListPage() {
  const { state } = useMorro();
  if (!state) return <Loading />;
  const actions = [...state.actions].sort((a, b) => b.actionId - a.actionId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Auditor view"
        title="Audit trail"
        sub="Every corporate action is reconstructable from chain data alone: the record-date snapshot, the per-holder entitlements, each payment, and the hashed closing report."
      />
      {actions.length === 0 ? (
        <Empty>No corporate actions yet.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label px-4 py-3 font-semibold">Action</th>
                <th className="label px-4 py-3 font-semibold">Settlement</th>
                <th className="label px-4 py-3 font-semibold">Record date</th>
                <th className="label px-4 py-3 text-right font-semibold">Holders</th>
                <th className="label px-4 py-3 text-right font-semibold">Entitlement</th>
                <th className="label px-4 py-3 text-right font-semibold">Paid</th>
                <th className="label px-4 py-3 font-semibold">Report hash</th>
                <th className="label px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.address} className="border-b border-line last:border-0 hover:bg-subtle/60">
                  <td className="px-4 py-3">
                    <span className="mr-2 font-mono text-xs text-muted">#{a.actionId}</span>
                    <span className="font-medium">{actionTitle(a)}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {a.kind === "vote" ? "—" : a.settlementMode === "onChain" ? "On-chain" : "Off-chain"}
                  </td>
                  <td className="num px-4 py-3">{fmtDate(a.recordTs)}</td>
                  <td className="num px-4 py-3 text-right">{a.holdersSnapshotted || "—"}</td>
                  <td className="num px-4 py-3 text-right">{a.kind === "vote" ? `${int(a.votesYes)} yes` : kzt(a.totalEntitlement)}</td>
                  <td className="num px-4 py-3 text-right">{a.kind === "vote" ? `${int(a.votesNo)} no` : kzt(a.totalPaid)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{a.reportHash ? shortHash(a.reportHash) : "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/audit/${a.actionId}`} className="font-medium text-accent hover:underline">
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
