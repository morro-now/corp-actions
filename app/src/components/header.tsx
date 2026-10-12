"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fmtClock, fmtDate } from "@/lib/format";
import { ROLE_NAMES, type RoleName } from "@/lib/types";
import { useMorro } from "./providers";
import { ExternalIcon, MorroMark } from "./ui";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/issuer", label: "Issuer" },
  { href: "/holder", label: "Holder" },
  { href: "/audit", label: "Audit" },
];

const FALLBACK_LABELS: Record<RoleName, string> = {
  issuer: "Issuer",
  registrar: "Registrar",
  payingAgent: "Paying agent",
  crank: "Crank",
  holderA: "Holder A",
  holderB: "Holder B",
  holderC: "Holder C",
  outsider: "Outsider (no KYC)",
};

export function Header() {
  const path = usePathname();
  const { state, now, role, setRole, error } = useMorro();
  const labels = state?.config.roleLabels ?? FALLBACK_LABELS;
  const cluster = state?.config.cluster ?? "localnet";
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <MorroMark />
          <span className="leading-tight">
            <span className="block text-[1.05rem] font-semibold tracking-tight">Morro</span>
            <span className="hidden text-[0.7rem] text-muted sm:block">Corporate actions, on-chain.</span>
          </span>
        </Link>

        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active(n.href) ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span
            className="hidden items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-muted lg:inline-flex"
            title="Chain time from the latest confirmed block"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-bad" : state ? "bg-ok" : "bg-faint"}`} />
            <span className="num text-ink">{state ? fmtClock(now) : "--:--:--"} UTC</span>
            {state && <span className="text-faint">{fmtDate(now)}</span>}
          </span>
          <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold capitalize text-warn" title="Demo mode">
            {cluster} demo
          </span>
          <label className="flex items-center gap-2 rounded-lg border border-line bg-card py-1 pl-2.5 pr-1 text-xs">
            <span className="hidden text-faint sm:inline">Demo signer</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as RoleName)}
              className="cursor-pointer rounded-md bg-subtle px-1.5 py-1 text-xs font-semibold text-ink outline-none"
              aria-label="Demo signer"
            >
              {ROLE_NAMES.map((r) => (
                <option key={r} value={r}>
                  {labels[r]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}

export function DemoBanner() {
  const { state } = useMorro();
  return (
    <div className="border-b border-line bg-subtle/60">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs text-muted sm:px-6">
        <span className="font-semibold text-ink">Demo mode.</span>
        <span>
          Transactions are signed server-side with demo role keys on a {state?.config.cluster ?? "local"} cluster. tKZT is a test
          stand-in for a tenge stablecoin. Not for production use.
        </span>
        {state && (
          <a
            className="ml-auto hidden items-center gap-1 text-accent hover:underline md:inline-flex"
            href={`https://explorer.solana.com/address/${state.config.programId}?cluster=${
              state.config.cluster === "devnet" ? "devnet" : `custom&customUrl=${encodeURIComponent(state.config.rpcUrl)}`
            }`}
            target="_blank"
            rel="noreferrer"
          >
            Program {state.config.programId.slice(0, 4)}…{state.config.programId.slice(-4)} <ExternalIcon />
          </a>
        )}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useMorro();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`toast-in pointer-events-auto w-full max-w-sm rounded-xl border bg-card p-3.5 shadow-lg shadow-black/5 ${
            t.kind === "error" ? "border-bad/40" : "border-line"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                t.kind === "error" ? "bg-bad" : t.kind === "success" ? "bg-ok" : "bg-info"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.detail && (
                <div className={`mt-0.5 break-words text-xs ${t.kind === "error" ? "font-mono text-bad" : "text-muted"}`}>
                  {t.detail}
                </div>
              )}
              {t.lines && t.lines.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                  {t.lines.slice(0, 6).map((l, i) => (
                    <li key={i} className="truncate">
                      {l}
                    </li>
                  ))}
                </ul>
              )}
              {t.href && (
                <a
                  href={t.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  View on explorer <ExternalIcon />
                </a>
              )}
            </div>
            <button
              onClick={() => dismissToast(t.id)}
              className="rounded p-0.5 text-faint hover:text-ink"
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
