"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { explorerTx } from "@/lib/format";
import type { RoleName, StateView, TxResult } from "@/lib/types";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  detail?: string;
  lines?: string[];
  href?: string;
}

interface MorroCtx {
  state: StateView | null;
  error: string | null;
  loading: boolean;
  /** Chain time in seconds, ticking locally between polls. */
  now: number;
  refresh: () => Promise<void>;
  role: RoleName;
  setRole: (r: RoleName) => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  busy: string | null;
  run: (op: string, params: Record<string, unknown>, opts: { label: string; signer: RoleName; busyKey?: string }) => Promise<TxResult>;
}

const Ctx = createContext<MorroCtx | null>(null);

export function useMorro(): MorroCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMorro outside provider");
  return c;
}

const POLL_MS = 3000;

export function MorroProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StateView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [role, setRoleState] = useState<RoleName>("issuer");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const toastId = useRef(0);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const s = body as StateView;
      setState(s);
      setOffset(s.chainTime - Date.now() / 1000);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    setTick(Math.floor(Date.now() / 1000));
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const clock = setInterval(() => setTick(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("morro.role") as RoleName | null;
      if (saved) setRoleState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setRole = useCallback((r: RoleName) => {
    setRoleState(r);
    try {
      localStorage.setItem("morro.role", r);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const pushToast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++toastId.current;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      setTimeout(() => dismissToast(id), t.kind === "error" ? 12000 : 8000);
    },
    [dismissToast],
  );

  const run = useCallback<MorroCtx["run"]>(
    async (op, params, { label, signer, busyKey }) => {
      setBusy(busyKey ?? op);
      setRole(signer);
      let result: TxResult;
      try {
        const res = await fetch("/api/tx", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ op, params }),
        });
        result = (await res.json()) as TxResult;
      } catch (e) {
        result = { ok: false, error: (e as Error).message };
      }
      setBusy(null);
      const signerLabel = state?.config.roleLabels[signer] ?? signer;
      if (result.ok) {
        const n = result.signatures?.length ?? (result.signature ? 1 : 0);
        pushToast({
          kind: n ? "success" : "info",
          title: label,
          detail: n ? `Signed by ${signerLabel} · ${n} transaction${n === 1 ? "" : "s"} confirmed` : `Signed by ${signerLabel}`,
          lines: result.log,
          href: result.signature && state ? explorerTx(state.config, result.signature) : result.explorerUrl,
        });
      } else {
        pushToast({ kind: "error", title: `${label} failed`, detail: result.error ?? "Unknown error" });
      }
      refresh();
      return result;
    },
    [pushToast, refresh, setRole, state],
  );

  const now = Math.floor(tick + offset);
  const value = useMemo<MorroCtx>(
    () => ({
      state,
      error,
      loading: !state && !error,
      now,
      refresh,
      role,
      setRole,
      toasts,
      pushToast,
      dismissToast,
      busy,
      run,
    }),
    [state, error, now, refresh, role, setRole, toasts, pushToast, dismissToast, busy, run],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
