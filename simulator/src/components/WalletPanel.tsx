import { useEffect, useRef, useState } from "react";
import { useStore, type WalletState } from "../store";
import type { KycStatus } from "../types";
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
  const { phones, selectedId, wallets, refreshWallet, refreshAllWallets, onSessionEnd, backend, select, settings, verifyKyc } = useStore();
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
            <h2 className="text-sm font-semibold">Account</h2>
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
                This number isn't on ZAKA yet. Dial the USSD code on this phone and create a PIN to register.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="ok">Registered</Badge>
                <KycBadge kyc={info.kyc} />
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">ZAKA balance</div>
                <div
                  className={`mt-1 inline-block rounded-lg px-1 -mx-1 font-semibold tabular-nums tracking-tight transition-colors duration-700 text-[40px] leading-[1.1] ${
                    flash === "up" ? "bal-up" : flash === "down" ? "bal-down" : ""
                  }`}
                  aria-live="polite"
                >
                  {formatRand(value)}
                </div>
              </div>

              {info.kyc ? <Limits kyc={info.kyc} /> : <p className="text-xs text-zinc-500">This backend doesn't report KYC limits yet.</p>}

              {info.kyc?.canUpgrade && phone && <Validate onVerify={(m) => verifyKyc(phone.id, m)} />}

              {settings.showChainDetails && (
                <details className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-500">Developer details</summary>
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {info.deployed ? <Badge tone="ok">Deployed</Badge> : <Badge tone="warn">Counterfactual · activates on first tx</Badge>}
                    </div>
                    <AddressRow label="Wallet (smart account)" addr={info.walletAddress} />
                    <AddressRow label="Owner key" addr={info.ownerAddress} />
                    <div className="font-mono text-[11px] text-zinc-500">raw balance {info.balance?.raw ?? "0"}</div>
                  </div>
                </details>
              )}

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
                    <span className="text-right">
                      <span className={`block font-mono tabular-nums ${pw?.registered ? "" : "text-zinc-500"}`}>{bal}</span>
                      {pw?.kyc && <span className="block text-[10px] text-zinc-500">{pw.kyc.tierName}</span>}
                    </span>
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

function Badge({ tone, children }: { tone: "ok" | "warn" | "neutral" | "bad"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-accent-soft text-accent-strong dark:text-accent ring-accent/30"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-amber-500/30"
        : tone === "bad"
          ? "bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/30"
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

function KycBadge({ kyc }: { kyc?: KycStatus | null }) {
  if (!kyc) return null;
  if (kyc.level === null) return <Badge tone="bad">Not verified · can't send</Badge>;
  if (kyc.level === 0) return <Badge tone="warn">Level 0 · ID number</Badge>;
  return <Badge tone="ok">Level {kyc.level} · Validated</Badge>;
}

function Limits({ kyc }: { kyc: KycStatus }) {
  const rows = [
    { label: "Sent today", used: kyc.used.todayCents, limit: kyc.limits.dailyCents },
    { label: "Sent this month", used: kyc.used.monthCents, limit: kyc.limits.monthlyCents },
  ];
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Sending limits</span>
        {kyc.idNumberMasked && <span className="font-mono text-[11px] text-zinc-500">ID {kyc.idNumberMasked}</span>}
      </div>
      {rows.map((r) => {
        const pct = r.limit ? Math.min(100, (r.used / r.limit) * 100) : 0;
        const tone = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-accent";
        return (
          <div key={r.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-zinc-600 dark:text-zinc-400">{r.label}</span>
              <span className="font-mono tabular-nums">
                {formatRand(r.used / 100)} <span className="text-zinc-500">/ {formatRand(r.limit / 100)}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" role="progressbar" aria-label={r.label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full transition-[width] duration-700 ${tone}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Validate({ onVerify }: { onVerify: (method: "merchant" | "web") => Promise<void> }) {
  const [method, setMethod] = useState<"merchant" | "web">("merchant");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <div className="text-xs font-medium">Complete ZAKA validation</div>
      <p className="mt-0.5 text-[11px] text-zinc-500">Acts as the merchant or website confirming this person's ID. Moves them to Level 1 and texts them.</p>
      <div className="mt-2 flex items-center gap-2">
        <label htmlFor="kyc-method" className="sr-only">Validated at</label>
        <select id="kyc-method" className="field w-auto" value={method} onChange={(e) => setMethod(e.target.value as "merchant" | "web")}>
          <option value="merchant">At a merchant</option>
          <option value="web">On the website</option>
        </select>
        <button
          type="button"
          className="btn-primary text-xs"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onVerify(method);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Validating…" : "Validate"}
        </button>
      </div>
      {error && <div className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}{/x-admin-key/i.test(error) ? " – add the admin key in Settings." : ""}</div>}
    </div>
  );
}
