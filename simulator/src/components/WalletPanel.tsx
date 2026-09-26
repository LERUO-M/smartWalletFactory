import { useEffect, useRef, useState } from "react";
import { useStore, type WalletState } from "../store";
import { formatRand, prettyPhone, rawToRand, shortAddr } from "../lib/util";
import { Card, CopyButton, EmptyState } from "./ui";

const REFRESH_MS = 10_000;

/** Count up/down to `target` and report which way it moved */
function useAnimatedNumber(target: number | undefined) {
  const [value, setValue] = useState(target ?? 0);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef<number | undefined>(target);

  useEffect(() => {
    if (target === undefined) return;
    const from = prev.current;
    prev.current = target;
    if (from === undefined || from === target) {
      setValue(target);
      return;
    }
    setFlash(target > from ? "up" : "down");
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(from + (target - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t = setTimeout(() => setFlash(null), 1400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [target]);

  return { value, flash };
}

export function WalletPanel() {
  const { phones, selectedId, wallets, refreshWallet, refreshAllWallets, onSessionEnd, backend, select } = useStore();
  const phone = phones.find((p) => p.id === selectedId);
  const w: WalletState | undefined = phone ? wallets[phone.id] : undefined;

  // First load, and whenever the selected phone / backend / number changes
  useEffect(() => {
    if (phone) void refreshWallet(phone.id);
  }, [phone?.id, phone?.number, backend, refreshWallet]); // eslint-disable-line

  // Every 10s while the tab is visible – all phones, so the mini list stays live
  useEffect(() => {
    refreshAllWallets();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refreshAllWallets();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [refreshAllWallets, backend]);

  // After any session ends: refresh now, and again shortly after (UserOps land asynchronously)
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const off = onSessionEnd(() => {
      refreshAllWallets();
      timers.push(setTimeout(refreshAllWallets, 5_000));
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, [onSessionEnd, refreshAllWallets]);

  const info = w?.info;
  const rand = info?.registered ? rawToRand(info.balance?.raw, info.balance?.formatted) : undefined;
  const { value, flash } = useAnimatedNumber(rand);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Wallet</h2>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {phone ? `${phone.nickname} · ${prettyPhone(phone.number)}` : "No phone selected"}
            </p>
          </div>
          <button type="button" onClick={() => phone && refreshWallet(phone.id)} className="btn-secondary text-xs" disabled={!phone || w?.loading}>
            <svg className={w?.loading ? "animate-spin" : ""} width="13" height="13" viewBox="0 0 24 24" aria-hidden>
              <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
            Refresh
          </button>
        </div>

        <div className="p-4">
          {!phone ? (
            <EmptyState title="No phone" body="Add a phone to see its wallet." />
          ) : w?.error && !info ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300">
              <div className="font-semibold">Couldn't load wallet</div>
              <div className="mt-1 font-mono">{w.error}</div>
            </div>
          ) : !info ? (
            <div className="space-y-3" aria-busy="true">
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-10 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ) : !info.registered ? (
            <div className="space-y-2">
              <Badge tone="neutral">Not registered</Badge>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                This number has no wallet yet. Dial the USSD code on this phone and create a PIN to register.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="ok">Registered</Badge>
                {info.deployed ? <Badge tone="ok">Deployed</Badge> : <Badge tone="warn">Counterfactual · activates on first tx</Badge>}
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Balance</div>
                <div
                  className={`mt-1 inline-block rounded-lg px-1 -mx-1 font-semibold tabular-nums tracking-tight transition-colors duration-700 text-[40px] leading-[1.1] ${
                    flash === "up" ? "bal-up" : flash === "down" ? "bal-down" : ""
                  }`}
                  aria-live="polite"
                >
                  {formatRand(value)}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                  ZAR token · raw {info.balance?.raw ?? "0"}
                </div>
              </div>

              <AddressRow label="Wallet (smart account)" addr={info.walletAddress} />
              <AddressRow label="Owner key" addr={info.ownerAddress} />

              {w?.error && <div className="text-[11px] text-red-600 dark:text-red-400">Last refresh failed: {w.error}</div>}
            </div>
          )}
          {w?.updatedAt && (
            <div className="mt-4 text-[11px] text-zinc-500">
              Updated {new Date(w.updatedAt).toLocaleTimeString()} · auto every 10s{backend.kind === "mock" ? " · mock data" : ""}
            </div>
          )}
        </div>
      </Card>

      {phones.length > 1 && (
        <Card>
          <div className="border-b border-zinc-200 px-4 py-2.5 text-xs font-semibold dark:border-zinc-800">All phones</div>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {phones.map((p) => {
              const pw = wallets[p.id]?.info;
              const bal = pw?.registered ? formatRand(rawToRand(pw.balance?.raw, pw.balance?.formatted)) : pw ? "not registered" : "…";
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => select(p.id)}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${p.id === selectedId ? "bg-accent-soft" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.nickname}</span>
                      <span className="block font-mono text-[10px] text-zinc-500">{p.number}</span>
                    </span>
                    <span className={`font-mono tabular-nums ${pw?.registered ? "" : "text-zinc-500"}`}>{bal}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-accent-soft text-accent-strong dark:text-accent ring-accent/30"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-amber-500/30"
        : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 ring-zinc-500/30";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>{children}</span>;
}

function AddressRow({ label, addr }: { label: string; addr?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 flex items-center gap-1">
        <span className="font-mono text-sm" title={addr}>{shortAddr(addr)}</span>
        {addr && (
          <>
            <CopyButton text={addr} />
            <a
              href={`https://sepolia.etherscan.io/address/${addr}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-accent-strong hover:bg-zinc-100 dark:text-accent dark:hover:bg-zinc-800"
            >
              Etherscan
              <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden><path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
