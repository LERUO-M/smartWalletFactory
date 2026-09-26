import { useState, type ReactNode } from "react";
import { copyText } from "../lib/util";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70 ${className}`}>
      {children}
    </section>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label ?? "Copy"}
      title="Copy"
      onClick={async (e) => {
        e.stopPropagation();
        await copyText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {done ? (
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden><path d="m5 12 5 5 9-10" stroke="currentColor" strokeWidth="2.2" fill="none" /></svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
          <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.8" fill="none" />
        </svg>
      )}
      {label && <span>{done ? "Copied" : label}</span>}
    </button>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</div>
      <p className="max-w-xs text-xs text-zinc-500">{body}</p>
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium">
      <span className="relative inline-flex">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-accent dark:bg-zinc-700 dark:peer-checked:bg-gold" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      {label}
    </label>
  );
}

export function IconButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-lg border text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white ${active ? "border-accent/60 bg-accent-soft" : "border-zinc-200 dark:border-zinc-800"}`}
    >
      {children}
    </button>
  );
}
