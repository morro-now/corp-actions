"use client";

import { useState, type ReactNode } from "react";
import { explorerAddress, relative, shortAddr } from "@/lib/format";
import type { ActionStatus, ActionView, EntitlementStatus } from "@/lib/types";
import { useMorro } from "./providers";

export function MorroMark({ size = 28 }: { size?: number }) {
  // A sea stack with an arch over a swell line: Morro's rock.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M5.5 23.5C5.5 16 8.5 9 14 8c3.2-.6 5.4 1 6.6 3.4 1.6-.4 3.6.6 4.6 3 .8 2 1.3 5.4 1.3 9.1H19.6v-3.4a3.6 3.6 0 0 0-7.2 0v3.4z"
        fill="var(--accent-ink)"
      />
      <path
        d="M4 27c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0 4 1.4 6 0"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Working" />;
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "bad" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-subtle text-muted",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<ActionStatus, Tone> = {
  announced: "info",
  snapshotted: "accent",
  funded: "accent",
  paying: "warn",
  closed: "ok",
  voting: "warn",
  passed: "ok",
  rejected: "bad",
};

export function StatusBadge({ status }: { status: ActionStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

const ENT_TONE: Record<EntitlementStatus, Tone> = { pending: "neutral", instructed: "warn", paid: "ok" };
export function EntitlementBadge({ status }: { status: EntitlementStatus }) {
  return <Badge tone={ENT_TONE[status]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

export function CopyButton({ text, title = "Copy" }: { text: string; title?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-subtle hover:text-ink"
    >
      {done ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
          <path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h7" />
        </svg>
      )}
    </button>
  );
}

export function ExternalIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M9 3h4v4M13 3L7 9M11 9.5V13H3V5h3.5" />
    </svg>
  );
}

export function Address({ value, link = true, chars = 4 }: { value: string; link?: boolean; chars?: number }) {
  const { state } = useMorro();
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[0.8rem]">
      {link && state ? (
        <a
          href={explorerAddress(state.config, value)}
          target="_blank"
          rel="noreferrer"
          className="hover:text-accent hover:underline"
          title={value}
        >
          {shortAddr(value, chars)}
        </a>
      ) : (
        <span title={value}>{shortAddr(value, chars)}</span>
      )}
      <CopyButton text={value} />
    </span>
  );
}

export function TxLink({ href, children = "View tx" }: { href: string; children?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
      {children}
      <ExternalIcon />
    </a>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className="num mt-1 truncate text-[0.95rem] font-medium text-ink">{value}</div>
      {sub && <div className="num mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Countdown({ ts }: { ts: number }) {
  const { now } = useMorro();
  if (!ts) return null;
  const future = ts > now;
  return <span className={`num text-xs ${future ? "text-accent" : "text-faint"}`}>{relative(ts, now)}</span>;
}

export function Progress({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "ok" | "warn" }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
      <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${p}%` }} />
    </div>
  );
}

export function Section({ title, sub, right, children }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow: string; title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="label text-accent!">{eyebrow}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.7rem]">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card border-dashed p-8 text-center text-sm text-muted">{children}</div>;
}

export function Loading() {
  const { error } = useMorro();
  return (
    <div className="card flex items-center gap-3 p-6 text-sm text-muted">
      {error ? (
        <span className="text-bad">Could not load chain state: {error}</span>
      ) : (
        <>
          <Spinner /> Reading chain state…
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- stage progress

export function stagesFor(a: ActionView): { key: string; label: string }[] {
  if (a.kind === "vote") {
    return [
      { key: "announced", label: "Announced" },
      { key: "voting", label: "Voting" },
      { key: a.status === "rejected" ? "rejected" : "passed", label: a.status === "rejected" ? "Rejected" : "Passed" },
    ];
  }
  const s = [
    { key: "announced", label: "Announced" },
    { key: "snapshotted", label: "Snapshotted" },
  ];
  if (a.settlementMode === "onChain") s.push({ key: "funded", label: "Funded" });
  s.push({ key: "paying", label: a.settlementMode === "onChain" ? "Paying" : "Instructed / paying" }, { key: "closed", label: "Closed" });
  return s;
}

export function StageBar({ action }: { action: ActionView }) {
  const stages = stagesFor(action);
  const current = stages.findIndex((s) => s.key === action.status);
  const final = ["closed", "passed", "rejected"].includes(action.status);
  return (
    <ol className="flex w-full items-start">
      {stages.map((s, i) => {
        const done = i < current || (final && i === current);
        const active = i === current && !final;
        const bad = action.status === "rejected" && i === current;
        const dot = bad
          ? "bg-bad border-bad"
          : done
            ? "bg-accent border-accent"
            : active
              ? "bg-card border-accent ring-4 ring-accent-soft"
              : "bg-card border-line";
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center text-center">
            {i < stages.length - 1 && (
              <span
                className={`absolute left-1/2 top-[7px] h-0.5 w-full ${i < current ? "bg-accent" : "bg-line"}`}
                aria-hidden="true"
              />
            )}
            <span className={`relative z-10 h-4 w-4 rounded-full border-2 ${dot}`} />
            <span
              className={`mt-1.5 hidden px-1 text-[0.7rem] font-medium sm:block ${
                active ? "text-accent" : done ? "text-ink" : "text-faint"
              }`}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
