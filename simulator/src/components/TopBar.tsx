import { useEffect, useState } from "react";
import type { Health } from "../types";
import { useStore } from "../store";
import { resetMock } from "../api/mock";
import { IconButton, Toggle } from "./ui";

type HealthState = { state: "checking" } | { state: "ok"; health: Health } | { state: "down"; error: string };

export function TopBar({ onOpenScenarios }: { onOpenScenarios: () => void }) {
  const { settings, setSettings, backend, refreshAllWallets } = useStore();
  const [url, setUrl] = useState(settings.baseUrl);
  const [health, setHealth] = useState<HealthState>({ state: "checking" });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => setUrl(settings.baseUrl), [settings.baseUrl]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const h = await backend.health();
        if (alive) setHealth(h.status === "ok" ? { state: "ok", health: h } : { state: "down", error: `status: ${h.status}` });
      } catch (err) {
        if (alive) setHealth({ state: "down", error: (err as Error).message || "unreachable" });
      }
    };
    setHealth({ state: "checking" });
    void check();
    const t = setInterval(check, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [backend]);

  const commitUrl = () => {
    let u = url.trim();
    if (u && !/^https?:\/\//i.test(u)) u = "http://" + u;
    u = u.replace(/\/+$/, "");
    if (u) setSettings({ baseUrl: u });
    setUrl(u || settings.baseUrl);
  };

  const env = health.state === "ok" ? health.health.env : undefined;

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">ZAKA USSD Simulator</div>
            <div className="text-[11px] text-zinc-500">USSD + SMS · Africa's Talking contract</div>
          </div>
        </div>

        <div className="order-3 flex w-full min-w-0 flex-1 items-center gap-2 md:order-none md:w-auto">
          <div className={`flex min-w-0 flex-1 items-center rounded-lg border bg-zinc-50 pl-3 dark:bg-zinc-900 ${settings.mock ? "border-zinc-200 opacity-60 dark:border-zinc-800" : "border-zinc-200 dark:border-zinc-800"}`}>
            <HealthDot state={settings.mock ? "mock" : health.state} title={health.state === "down" ? health.error : undefined} />
            <label htmlFor="base-url" className="sr-only">Backend base URL</label>
            <input
              id="base-url"
              value={url}
              disabled={settings.mock}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={commitUrl}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="http://localhost:3000 or https://xxxx.ngrok-free.app"
              className="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-xs outline-none"
              spellCheck={false}
            />
          </div>
          <div className="hidden items-center gap-1.5 xl:flex">
            <EnvChip label="Wallets" on={env?.factorySet} hint="FACTORY_ADDRESS" />
            <EnvChip label="Fees" on={env?.paymasterSet} hint="PAYMASTER_ADDRESS" />
            <EnvChip label="ZAKA" on={env?.tokenSet} hint="ZAR_TOKEN_ADDRESS" />
            <EnvChip
              label={(env?.smsMode === "live" ? "SMS live" : env?.smsMode === "sandbox" ? "SMS sandbox" : "SMS simulated") + (env?.shortCode ? ` · ${env.shortCode}` : "")}
              on={env ? (env.smsMode === undefined ? undefined : env.smsMode !== "simulated" || settings.mock) : undefined}
              hint="AT_USERNAME, AT_API_KEY, SHORT_CODE"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Toggle id="mock-toggle" label="Mock mode" checked={settings.mock} onChange={(v) => setSettings({ mock: v })} />
          <button type="button" onClick={onOpenScenarios} className="btn-secondary text-xs">
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden><path d="M7 5v14l11-7L7 5Z" fill="currentColor" /></svg>
            Scenarios
          </button>
          <IconButton label={settings.muted ? "Unmute key clicks" : "Mute key clicks"} onClick={() => setSettings({ muted: !settings.muted })}>
            {settings.muted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M4 9h4l5-4v14l-5-4H4V9Zm13 0 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M4 9h4l5-4v14l-5-4H4V9Zm12.5-.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round" /></svg>
            )}
          </IconButton>
          <IconButton label={settings.theme === "dark" ? "Light mode" : "Dark mode"} onClick={() => setSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}>
            {settings.theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" fill="none" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="1.8" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>
            )}
          </IconButton>
          <div className="relative">
            <IconButton label="Settings" onClick={() => setShowSettings((s) => !s)} active={showSettings}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="16" cy="6" r="2" stroke="currentColor" strokeWidth="1.8" fill="none" /><circle cx="10" cy="12" r="2" stroke="currentColor" strokeWidth="1.8" fill="none" /><circle cx="18" cy="18" r="2" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>
            </IconButton>
            {showSettings && (
              <div className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-zinc-200 bg-white p-4 text-xs shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-3 text-sm font-semibold">Settings</div>
                <label className="mb-1 block font-medium" htmlFor="svc">Service code for scenarios</label>
                <input id="svc" className="field mb-3" value={settings.serviceCode} onChange={(e) => setSettings({ serviceCode: e.target.value.trim() })} />
                <label className="mb-1 block font-medium" htmlFor="idle">Idle session timeout (seconds, 0 = off)</label>
                <input id="idle" type="number" min={0} max={600} className="field mb-3" value={settings.idleTimeoutSec} onChange={(e) => setSettings({ idleTimeoutSec: Math.max(0, Number(e.target.value) || 0) })} />
                <label className="mb-1 block font-medium" htmlFor="admin-key">Admin key (x-admin-key)</label>
                <input id="admin-key" type="password" autoComplete="off" className="field mb-1" value={settings.adminKey} onChange={(e) => setSettings({ adminKey: e.target.value.trim() })} placeholder="Only if ADMIN_API_KEY is set" />
                <p className="mb-3 text-[11px] text-zinc-500">Used by the "Validate" button (merchant / website KYC).</p>
                <label className="mb-3 flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={settings.showChainDetails} onChange={(e) => setSettings({ showChainDetails: e.target.checked })} />
                  Show developer chain details
                </label>
                {settings.mock && (
                  <button type="button" className="btn-secondary w-full justify-center" onClick={() => { resetMock(); refreshAllWallets(); }}>
                    Reset mock users &amp; balances
                  </button>
                )}
                <p className="mt-3 text-[11px] text-zinc-500">Settings, phones and scenarios are saved in this browser.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {settings.mock && (
        <div className="border-t border-gold/40 bg-gold/15 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:text-gold">
          Mock mode · replies come from a fake backend in this browser. Nothing is sent to your server or to Sepolia.
        </div>
      )}
    </header>
  );
}

function HealthDot({ state, title }: { state: "checking" | "ok" | "down" | "mock"; title?: string }) {
  const map = {
    ok: ["bg-accent", "Backend healthy"],
    down: ["bg-red-500", "Backend unreachable"],
    checking: ["bg-zinc-400 animate-pulse", "Checking backend…"],
    mock: ["bg-gold", "Mock mode"],
  } as const;
  const [cls, label] = map[state];
  return (
    <span className="flex items-center" title={title ? `${label}: ${title}` : label}>
      <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function EnvChip({ label, on, hint }: { label: string; on?: boolean; hint?: string }) {
  const cls =
    on === undefined
      ? "text-zinc-500 ring-zinc-300 dark:ring-zinc-700"
      : on
        ? "text-accent-strong dark:text-accent ring-accent/40 bg-accent-soft"
        : "text-red-600 dark:text-red-400 ring-red-500/40 bg-red-500/10";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${cls}`} title={(on === undefined ? "Unknown" : on ? "Configured" : "Not configured") + (hint ? ` (${hint})` : "")}>
      {on === undefined ? "–" : on ? "✓" : "✕"} {label}
    </span>
  );
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <rect x="7" y="2" width="18" height="28" rx="5" fill="#27272a" />
      <rect x="10" y="6" width="12" height="9" rx="1.5" fill="#b9c9a0" />
      <text x="16" y="13.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="#1f2a17" fontFamily="monospace">R</text>
      <circle cx="12" cy="20" r="1.3" fill="#00a86b" />
      <circle cx="20" cy="20" r="1.3" fill="#ef4444" />
      <circle cx="12" cy="25" r="1.1" fill="#a1a1aa" />
      <circle cx="16" cy="25" r="1.1" fill="#a1a1aa" />
      <circle cx="20" cy="25" r="1.1" fill="#a1a1aa" />
    </svg>
  );
}
