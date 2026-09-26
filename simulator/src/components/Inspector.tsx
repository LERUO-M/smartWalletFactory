import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LogEntry, SmsMessage } from "../types";
import { toCurl } from "../api";
import { useStore } from "../store";
import { copyText, prettyPhone, timeHMS } from "../lib/util";
import { Card, CopyButton, EmptyState } from "./ui";

const BADGE: Record<LogEntry["kind"], string> = {
  CON: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/30",
  END: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 ring-zinc-500/30",
  ERROR: "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/40",
  LOCAL: "bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-amber-500/30",
};

export function Inspector() {
  const [tab, setTab] = useState<"ussd" | "sms">("ussd");
  const { sms, smsRead, phones } = useStore();
  const unreadTotal = phones.reduce((n, p) => n + sms.filter((m) => m.to === p.number && m.id > (smsRead[p.id] ?? 0)).length, 0);
  const tabs = (
    <div role="tablist" aria-label="Inspector view" className="flex rounded-lg bg-zinc-100 p-0.5 text-xs font-medium dark:bg-zinc-800">
      {(["ussd", "sms"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => setTab(t)}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${tab === t ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
        >
          {t === "ussd" ? "USSD" : "SMS"}
          {t === "sms" && sms.length > 0 && (
            <span className={`rounded-full px-1.5 text-[10px] ${unreadTotal ? "bg-accent text-white" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"}`}>{sms.length}</span>
          )}
        </button>
      ))}
    </div>
  );
  return tab === "ussd" ? <UssdInspector tabs={tabs} /> : <SmsLog tabs={tabs} />;
}

function UssdInspector({ tabs }: { tabs: ReactNode }) {
  const { phones, selectedId, logs, clearLog, settings } = useStore();
  const phone = phones.find((p) => p.id === selectedId);
  const entries = (phone && logs[phone.id]) || [];
  const last = entries[entries.length - 1];
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, selectedId]);

  return (
    <Card className="flex min-h-[420px] flex-col lg:h-full">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Session inspector</h2>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {phone ? `${phone.nickname} · ${prettyPhone(phone.number)}` : "No phone selected"} · {entries.length} request{entries.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {entries.length > 0 && phone && (
            <button type="button" onClick={() => clearLog(phone.id)} className="btn-ghost text-xs">
              Clear
            </button>
          )}
          {tabs}
        </div>
      </div>

      {/* Breadcrumbs of the current / last session */}
      <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Session path
          {last && (
            <span className={`rounded-full px-1.5 py-px text-[9px] ${last.sessionOpen ? "bg-accent-soft text-accent" : "bg-zinc-500/15 text-zinc-500"}`}>
              {last.sessionOpen ? "open" : "closed"}
            </span>
          )}
        </div>
        <nav aria-label="Session path" className="flex flex-wrap items-center gap-1 font-mono text-xs">
          {last ? (
            ["Root", ...last.path].map((c, i, arr) => (
              <span key={i} className="flex items-center gap-1">
                <span className={i === arr.length - 1 ? "rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : "text-zinc-500"}>{c}</span>
                {i < arr.length - 1 && <span className="text-zinc-400">›</span>}
              </span>
            ))
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </nav>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-2 lg:max-h-none" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {entries.length === 0 ? (
          <EmptyState title="No requests yet" body={`Dial ${settings.serviceCode} on the phone and press the green key. Every request and response shows up here.`} />
        ) : (
          <ol className="flex flex-col gap-1.5">
            {entries.map((e, i) => {
              const newSession = i === 0 || entries[i - 1].sessionId !== e.sessionId;
              return (
                <li key={e.id}>
                  {newSession && i > 0 && <div className="my-2 border-t border-dashed border-zinc-200 dark:border-zinc-800" />}
                  <LogRow entry={e} baseUrl={settings.baseUrl} />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}

function LogRow({ entry: e, baseUrl }: { entry: LogEntry; baseUrl: string }) {
  const [open, setOpen] = useState(false);
  const isErr = e.kind === "ERROR";
  const maskedBody = { sessionId: e.sessionId, serviceCode: e.serviceCode, phoneNumber: e.phoneNumber, text: e.maskedText };
  const firstLine = e.kind === "LOCAL" ? e.error : e.raw.split("\n")[0] || e.error || "(empty response)";

  return (
    <div className={`rounded-lg border text-xs ${isErr ? "border-red-500/40 bg-red-500/5" : "border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full flex-col gap-1 px-3 py-2 text-left">
        <div className="flex w-full items-center gap-2">
          <span className={`rounded px-1.5 py-px font-mono text-[10px] font-bold ring-1 ring-inset ${BADGE[e.kind]}`}>{e.kind === "ERROR" ? "ERR" : e.kind}</span>
          <span className="font-mono text-[11px] text-zinc-500">{timeHMS(e.ts)}</span>
          {e.kind !== "LOCAL" && (
            <span className={`whitespace-nowrap font-mono text-[11px] ${e.ms > 5000 ? "text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}>{e.ms} ms</span>
          )}
          {e.status > 0 && e.status !== 200 && <span className="whitespace-nowrap font-mono text-[11px] text-red-600 dark:text-red-400">HTTP {e.status}</span>}
          {e.mock && <span className="rounded bg-gold/20 px-1 text-[9px] font-semibold uppercase text-amber-700 dark:text-gold">mock</span>}
          <svg className={`ml-auto shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} width="12" height="12" viewBox="0 0 24 24" aria-hidden>
            <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        </div>
        <div className="flex w-full items-baseline gap-2 font-mono">
          <span className="shrink-0 text-zinc-400">text</span>
          <span className="truncate text-zinc-900 dark:text-zinc-100">"{e.maskedText}"</span>
        </div>
        <div className={`w-full truncate font-mono ${isErr ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}>{firstLine}</div>
      </button>

      {open && (
        <div className="space-y-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <Field label="sessionId" value={e.sessionId} />
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Request · POST /ussd</span>
            </div>
            <pre className="code">{JSON.stringify(maskedBody, null, 2)}</pre>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Raw response {e.status ? `· ${e.status}` : ""} {e.error ? `· ${e.error}` : ""}
              </span>
              {e.raw && <CopyButton text={e.raw} label="Copy" />}
            </div>
            <pre className={`code ${isErr ? "text-red-700 dark:text-red-300" : ""}`}>{e.raw || "(no body)"}</pre>
          </div>
          {e.kind !== "LOCAL" && (
            <div className="flex flex-wrap items-center gap-2">
              {/* The copied command carries the real text (incl. PIN) so it replays exactly. */}
              <CurlButton curl={toCurl(baseUrl, { sessionId: e.sessionId, serviceCode: e.serviceCode, phoneNumber: e.phoneNumber, text: e.text })} />
              <span className="text-[10px] text-zinc-500">Copied command includes the real PIN so it can be replayed.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CurlButton({ curl }: { curl: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary text-xs"
      onClick={async () => {
        await copyText(curl);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? "Copied ✓" : "Copy as cURL"}
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <span className="text-zinc-500">{label}</span>
      <span className="truncate">{value}</span>
      <CopyButton text={value} />
    </div>
  );
}

// ── SMS log ─────────────────────────────────────────────────────────────────

const SMS_STATUS: Record<string, string> = {
  sent: "bg-accent-soft text-accent-strong dark:text-accent ring-accent/30",
  success: "bg-accent-soft text-accent-strong dark:text-accent ring-accent/30",
  queued: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/30",
  simulated: "bg-gold/20 text-amber-800 dark:text-gold ring-gold/40",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/40",
};

function SmsLog({ tabs }: { tabs: ReactNode }) {
  const { sms, smsMode, smsError, phones } = useStore();
  const nameFor = (to: string) => phones.find((p) => p.number === to)?.nickname;
  const modeLabel =
    smsMode === "live" ? "Africa's Talking (live)" : smsMode === "sandbox" ? "Africa's Talking sandbox" : smsMode === "simulated" ? "Simulated (no Africa's Talking keys)" : smsMode === "unavailable" ? "Backend has no /api/sms" : "…";

  return (
    <Card className="flex min-h-[420px] flex-col lg:h-full">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">SMS sent by the backend</h2>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {modeLabel} · {sms.length} message{sms.length === 1 ? "" : "s"}
          </p>
        </div>
        {tabs}
      </div>
      {smsError && <div className="border-b border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-600 dark:text-red-400">Couldn't load SMS: {smsError}</div>}
      <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 200px)" }}>
        {sms.length === 0 ? (
          <EmptyState title="No SMS yet" body="Send ZAKA between two phones, or go over a limit. The recipient's notification and ZAKA validation messages appear here and on the phones." />
        ) : (
          <ol className="flex flex-col gap-1.5">
            {sms.map((m) => (
              <SmsRow key={m.id} m={m} name={nameFor(m.to)} />
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

function SmsRow({ m, name }: { m: SmsMessage; name?: string }) {
  const [open, setOpen] = useState(false);
  const failed = m.status === "failed";
  return (
    <li className={`rounded-lg border text-xs ${failed ? "border-red-500/40 bg-red-500/5" : "border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full flex-col gap-1 px-3 py-2 text-left">
        <div className="flex w-full items-center gap-2">
          <span className={`rounded px-1.5 py-px font-mono text-[10px] font-bold uppercase ring-1 ring-inset ${SMS_STATUS[m.status] ?? SMS_STATUS.queued}`}>{m.status}</span>
          <span className="font-mono text-[11px] text-zinc-500">{timeHMS(m.createdAt)}</span>
          <span className="truncate font-mono text-[11px]">→ {m.to}</span>
          {name && <span className="truncate text-[11px] text-zinc-500">({name})</span>}
          {m.category && <span className="ml-auto shrink-0 rounded bg-zinc-200 px-1.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{m.category}</span>}
        </div>
        <div className="w-full whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{m.message}</div>
      </button>
      {open && (
        <div className="space-y-1 border-t border-zinc-200 px-3 py-2 font-mono text-[11px] text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <div>from: {m.from || "(none)"} · provider: {m.provider}</div>
          {m.messageId && <div>messageId: {m.messageId}</div>}
          {m.statusCode != null && <div>statusCode: {m.statusCode}</div>}
          {m.cost && <div>cost: {m.cost}</div>}
          {m.error && <div className="text-red-600 dark:text-red-400">error: {m.error}</div>}
        </div>
      )}
    </li>
  );
}
