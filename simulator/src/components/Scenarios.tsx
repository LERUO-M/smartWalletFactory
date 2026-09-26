import { useRef, useState } from "react";
import type { Scenario } from "../types";
import { DEFAULT_SCENARIOS, useStore } from "../store";
import { controllers, type ScreenSnapshot } from "../lib/controllers";
import { sleep, uid } from "../lib/util";

const STEP_DELAY = 600;

type StepStatus = "pending" | "running" | "done" | "failed";
interface RunState {
  scenarioId: string;
  phoneId: string;
  steps: StepStatus[];
  result?: { pass: boolean; message: string };
}

export function ScenarioDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { scenarios, setScenarios, phones, selectedId, select, settings } = useStore();
  const [phoneId, setPhoneId] = useState(selectedId);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");

  const targetPhone = phones.find((p) => p.id === phoneId) ?? phones.find((p) => p.id === selectedId) ?? phones[0];
  const running = !!run && !run.result;

  async function runScenario(sc: Scenario) {
    if (!targetPhone) return;
    const ctl = controllers.get(targetPhone.id);
    if (!ctl) return;
    select(targetPhone.id);
    stopRef.current = false;
    const steps: StepStatus[] = sc.steps.map(() => "pending");
    const update = (patch: Partial<RunState>) => setRun((r) => (r ? { ...r, ...patch, steps: patch.steps ?? [...steps] } : r));
    setRun({ scenarioId: sc.id, phoneId: targetPhone.id, steps: [...steps] });

    const fail = (i: number, message: string) => {
      if (i >= 0) steps[i] = "failed";
      update({ result: { pass: false, message } });
    };

    ctl.reset();
    await sleep(400);
    let snap: ScreenSnapshot = ctl.snapshot();

    for (let i = 0; i < sc.steps.length; i++) {
      if (stopRef.current) return fail(i, "Stopped");
      const step = sc.steps[i].trim();
      steps[i] = "running";
      update({});
      if (/^dial\b/i.test(step)) {
        const code = step.slice(4).trim() || settings.serviceCode;
        snap = await ctl.dial(code);
      } else {
        if (snap.mode !== "con") return fail(i, `Session not open at step ${i + 1} (screen: ${snap.mode.toUpperCase()})`);
        snap = await ctl.enter(step);
      }
      if (snap.mode === "error") return fail(i, `Step ${i + 1}: ${snap.text}`);
      steps[i] = "done";
      update({});
      if (i < sc.steps.length - 1) await sleep(STEP_DELAY);
    }

    const expect = sc.expect?.trim();
    if (expect) {
      const ok = snap.text.toLowerCase().includes(expect.toLowerCase());
      update({ result: { pass: ok, message: ok ? `Final screen contains "${expect}"` : `Expected "${expect}" on final screen` } });
    } else {
      update({ result: { pass: true, message: "Completed (no expected text set)" } });
    }
  }

  const saveScenario = (sc: Scenario) => {
    const exists = scenarios.some((s) => s.id === sc.id);
    setScenarios(exists ? scenarios.map((s) => (s.id === sc.id ? sc : s)) : [...scenarios, sc]);
    setEditing(null);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, scenarios }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ussd-scenarios.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const list: unknown = Array.isArray(data) ? data : data.scenarios;
      if (!Array.isArray(list)) throw new Error("No scenarios array");
      const clean: Scenario[] = list
        .filter((s): s is Scenario => !!s && typeof s.name === "string" && Array.isArray(s.steps))
        .map((s) => ({ id: uid("sc-"), name: s.name, steps: s.steps.map(String), expect: s.expect ? String(s.expect) : undefined }));
      setScenarios([...scenarios, ...clean]);
      setNotice(`Imported ${clean.length} scenario${clean.length === 1 ? "" : "s"}`);
    } catch (err) {
      setNotice(`Import failed: ${(err as Error).message}`);
    }
    setTimeout(() => setNotice(""), 3000);
  };

  if (!open) return null;

  return (
    <aside
      aria-label="Scenario runner"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold">Scenario runner</h2>
          <p className="text-xs text-zinc-500">Scripted inputs, replayed on a phone at ~{STEP_DELAY}ms per step.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close scenarios" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 text-xs dark:border-zinc-800">
        <label htmlFor="run-phone" className="font-medium">Run on</label>
        <select id="run-phone" className="field flex-1" value={targetPhone?.id} onChange={(e) => setPhoneId(e.target.value)} disabled={running}>
          {phones.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname} · {p.number}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {editing ? (
          <ScenarioEditor initial={editing} onSave={saveScenario} onCancel={() => setEditing(null)} />
        ) : (
          <>
            {scenarios.length === 0 && <p className="py-6 text-center text-xs text-zinc-500">No scenarios yet.</p>}
            {scenarios.map((sc) => {
              const r = run?.scenarioId === sc.id ? run : null;
              return (
                <div key={sc.id} className={`rounded-xl border p-3 ${r ? "border-accent/50" : "border-zinc-200 dark:border-zinc-800"}`}>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-sm font-medium">{sc.name}</div>
                    {r?.result && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.result.pass ? "bg-accent-soft text-accent-strong dark:text-accent" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                        {r.result.pass ? "✓ Pass" : "✕ Fail"}
                      </span>
                    )}
                    {r && !r.result ? (
                      <button type="button" className="btn-secondary text-xs" onClick={() => (stopRef.current = true)}>Stop</button>
                    ) : (
                      <button type="button" className="btn-primary text-xs" disabled={running} onClick={() => void runScenario(sc)}>
                        Run
                      </button>
                    )}
                  </div>
                  <ol className="mt-2 flex flex-wrap gap-1">
                    {sc.steps.map((st, i) => {
                      const s = r?.steps[i];
                      const cls =
                        s === "running"
                          ? "bg-gold/25 ring-gold text-amber-900 dark:text-gold"
                          : s === "done"
                            ? "bg-accent-soft ring-accent/40 text-accent-strong dark:text-accent"
                            : s === "failed"
                              ? "bg-red-500/10 ring-red-500/50 text-red-600 dark:text-red-400"
                              : "ring-zinc-300 text-zinc-600 dark:ring-zinc-700 dark:text-zinc-400";
                      return (
                        <li key={i} className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-inset transition-colors ${cls}`}>
                          {/^dial\b/i.test(st) ? `dial ${st.slice(4).trim() || settings.serviceCode}` : `"${st}"`}
                        </li>
                      );
                    })}
                  </ol>
                  {sc.expect && <div className="mt-1.5 text-[11px] text-zinc-500">expects “{sc.expect}”</div>}
                  {r?.result && <div className={`mt-1 text-[11px] ${r.result.pass ? "text-zinc-500" : "text-red-600 dark:text-red-400"}`}>{r.result.message}</div>}
                  <div className="mt-2 flex gap-3 text-[11px]">
                    <button type="button" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => setEditing(sc)} disabled={running}>Edit</button>
                    <button type="button" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => setEditing({ ...sc, id: uid("sc-"), name: sc.name + " (copy)" })}>Duplicate</button>
                    <button type="button" className="text-zinc-500 hover:text-red-600" onClick={() => setScenarios(scenarios.filter((s) => s.id !== sc.id))} disabled={running}>Delete</button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {!editing && (
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button type="button" className="btn-primary text-xs" onClick={() => setEditing({ id: uid("sc-"), name: "New scenario", steps: ["dial"], expect: "" })}>
            New scenario
          </button>
          <button type="button" className="btn-secondary text-xs" onClick={exportJson}>Export</button>
          <button type="button" className="btn-secondary text-xs" onClick={() => fileRef.current?.click()}>Import</button>
          <button type="button" className="btn-ghost text-xs" onClick={() => setScenarios(DEFAULT_SCENARIOS)} title="Replace with the built-in examples">Reset</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ""; }} />
          {notice && <span className="w-full text-[11px] text-zinc-500">{notice}</span>}
        </div>
      )}
    </aside>
  );
}

function ScenarioEditor({ initial, onSave, onCancel }: { initial: Scenario; onSave: (s: Scenario) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial.name);
  const [steps, setSteps] = useState(initial.steps.join("\n"));
  const [expect, setExpect] = useState(initial.expect ?? "");
  const parsed = steps.split("\n").map((s) => s.trim()).filter(Boolean);
  const valid = name.trim() && parsed.length > 0 && /^dial\b/i.test(parsed[0]);

  return (
    <form
      className="space-y-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ id: initial.id, name: name.trim(), steps: parsed, expect: expect.trim() || undefined });
      }}
    >
      <div>
        <label htmlFor="sc-name" className="mb-1 block font-medium">Name</label>
        <input id="sc-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="sc-steps" className="mb-1 block font-medium">Steps · one per line</label>
        <textarea id="sc-steps" rows={7} className="field font-mono" value={steps} onChange={(e) => setSteps(e.target.value)} />
        <p className="mt-1 text-[11px] text-zinc-500">
          Start with <code className="font-mono">dial</code> (uses the service code from settings) or <code className="font-mono">dial *120*55#</code>. Every other line is typed and sent.
        </p>
      </div>
      <div>
        <label htmlFor="sc-expect" className="mb-1 block font-medium">Expected text on final screen (optional)</label>
        <input id="sc-expect" className="field" value={expect} onChange={(e) => setExpect(e.target.value)} placeholder="e.g. Sent R50.00" />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={!valid}>Save</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
