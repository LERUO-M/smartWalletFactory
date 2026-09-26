// ─────────────────────────────────────────────────────────────────────────────
// A feature phone that runs real USSD sessions against the configured backend.
// All session logic lives here; the UI is whatever the backend returns.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LogEntry, PhoneConfig, SmsMessage } from "../types";
import { parseUssd } from "../api";
import { useStore } from "../store";
import { keyClick, smsTone } from "../lib/sound";
import { controllers, type ScreenSnapshot } from "../lib/controllers";
import { networkFor, newSessionId, normalisePhone, prettyPhone, sleep, uid } from "../lib/util";

type Screen =
  | { mode: "home"; dial: string }
  | { mode: "loading" }
  | { mode: "con"; text: string; input: string }
  | { mode: "end"; text: string }
  | { mode: "error"; text: string }
  | { mode: "sms"; index: number };

interface Session {
  id: string;
  serviceCode: string;
  inputs: string[];
  /** Display value for sensitive inputs (PIN / ID number), null when not sensitive */
  masked: (string | null)[];
  path: string[];
  abort?: AbortController;
}

type Key =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "*" | "#"
  | "call" | "end" | "softL" | "softR" | "up" | "down" | "clear";

const MMI_ERROR = "Connection problem or invalid MMI code.";
const USSD_CODE = /^\*[0-9*]*#$/;
const PIN_MASK = "••••";

/** How to show an input on screen: PINs fully masked, ID numbers partly */
function maskFor(prompt: string, value: string): string | null {
  if (/\bPIN\b/i.test(prompt)) return PIN_MASK;
  if (/\bID number\b/i.test(prompt)) return value.length > 8 ? value.slice(0, 6) + "•••••" + value.slice(-2) : "•".repeat(value.length);
  return null;
}

/** Build a readable breadcrumb label for one input, based on the prompt that asked for it */
function labelFor(prompt: string, value: string, masked: string | null): string {
  if (masked) return /\bPIN\b/i.test(prompt) ? `PIN ${masked}` : `ID ${masked}`;
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const menu = new RegExp(`^\\s*${esc}[.)]\\s*(.+)$`, "m").exec(prompt);
  if (menu) return `${value} ${menu[1].trim()}`;
  if (/amount|\bZAR\b|\bRand\b/i.test(prompt) && /^\d+(\.\d+)?$/.test(value)) return `R${value}`;
  return value;
}

const LETTERS: Record<string, string> = {
  "1": "", "2": "abc", "3": "def", "4": "ghi", "5": "jkl", "6": "mno",
  "7": "pqrs", "8": "tuv", "9": "wxyz", "0": "␣", "*": "+", "#": "⇧",
};

export function Phone({ phone, index }: { phone: PhoneConfig; index: number }) {
  const { backend, settings, addLog, emitSessionEnd, selectedId, select, updatePhone, removePhone, phones, sms, smsRead, markSmsRead } = useStore();
  const selected = selectedId === phone.id;

  const [screen, setScreenState] = useState<Screen>({ mode: "home", dial: "" });
  const screenRef = useRef(screen);
  const setScreen = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const session = useRef<Session | null>(null);

  const [pressed, setPressed] = useState<Key | null>(null);
  const [activity, setActivity] = useState(0);
  const [lit, setLit] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ up: false, down: false });

  // keep latest deps visible to async code
  const live = useRef({ backend, settings, phone });
  live.current = { backend, settings, phone };

  // ── SMS inbox ──────────────────────────────────────────────────────────────
  const inbox: SmsMessage[] = sms.filter((m) => m.to === phone.number); // newest first
  const lastRead = smsRead[phone.id] ?? 0;
  const unread = inbox.filter((m) => m.id > lastRead).length;
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;
  const prevUnread = useRef(unread);
  useEffect(() => {
    if (unread > prevUnread.current) {
      if (!live.current.settings.muted) smsTone();
      setActivity((a) => a + 1); // light up the screen
    }
    prevUnread.current = unread;
  }, [unread]);

  const openInbox = useCallback(
    (index = 0) => {
      const box = inboxRef.current;
      if (!box.length) return;
      markSmsRead(live.current.phone.id, box[0].id);
      setScreen({ mode: "sms", index: Math.min(index, box.length - 1) });
    },
    [markSmsRead, setScreen],
  );

  // ── Clock & backlight ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (activity === 0) return;
    setLit(true);
    const t = setTimeout(() => setLit(false), 10_000);
    return () => clearTimeout(t);
  }, [activity]);
  useEffect(() => {
    if (screen.mode === "loading" || screen.mode === "con") setLit(true);
  }, [screen.mode]);

  // ── Logging ────────────────────────────────────────────────────────────────
  const log = useCallback(
    (s: Session, fields: Pick<LogEntry, "raw" | "kind" | "status" | "ms"> & { error?: string; sessionOpen: boolean }) => {
      const { phone: ph, backend: be } = live.current;
      addLog({
        id: uid("log-"),
        phoneId: ph.id,
        ts: Date.now(),
        sessionId: s.id,
        serviceCode: s.serviceCode,
        phoneNumber: ph.number,
        text: s.inputs.join("*"),
        maskedText: s.inputs.map((v, i) => s.masked[i] ?? v).join("*"),
        path: [...s.path],
        mock: be.kind === "mock",
        ...fields,
      });
    },
    [addLog],
  );

  const endSession = useCallback(
    (next: Screen) => {
      session.current = null;
      setScreen(next);
      emitSessionEnd(live.current.phone.id);
    },
    [emitSessionEnd, setScreen],
  );

  // ── One request/response round-trip ────────────────────────────────────────
  const request = useCallback(async (): Promise<Screen> => {
    const s = session.current;
    if (!s) return screenRef.current;
    const { backend: be, phone: ph } = live.current;
    const abort = new AbortController();
    s.abort = abort;
    setScreen({ mode: "loading" });

    const res = await be.ussd(
      { sessionId: s.id, serviceCode: s.serviceCode, phoneNumber: ph.number, text: s.inputs.join("*") },
      abort.signal,
    );
    if (session.current !== s) return screenRef.current; // cancelled meanwhile

    const parsed = res.ok ? parseUssd(res.raw) : null;
    if (!res.ok || !parsed) {
      log(s, {
        raw: res.raw,
        kind: "ERROR",
        status: res.status,
        ms: res.ms,
        error: res.error ?? "Response does not start with CON or END",
        sessionOpen: false,
      });
      const next: Screen = { mode: "error", text: MMI_ERROR };
      endSession(next);
      return next;
    }

    log(s, { raw: res.raw, kind: parsed.kind, status: res.status, ms: res.ms, sessionOpen: parsed.kind === "CON" });
    if (parsed.kind === "CON") {
      const next: Screen = { mode: "con", text: parsed.body, input: "" };
      setScreen(next);
      return next;
    }
    const next: Screen = { mode: "end", text: parsed.body };
    endSession(next);
    return next;
  }, [endSession, log, setScreen]);

  const startSession = useCallback(
    (code: string): Promise<Screen> => {
      if (!USSD_CODE.test(code)) {
        const next: Screen = { mode: "error", text: MMI_ERROR };
        setScreen(next);
        return Promise.resolve(next);
      }
      // Shortcut dialling, Africa's Talking style: *384*123*2*0831234567*50# is sent as
      // serviceCode "*384*123#" with the extra segments as the first `text`.
      const base = live.current.settings.serviceCode;
      const stem = base.replace(/#$/, "") + "*";
      let serviceCode = code;
      let extras: string[] = [];
      if (base && code !== base && code.startsWith(stem)) {
        serviceCode = base;
        extras = code.slice(stem.length).replace(/#$/, "").split("*").filter(Boolean);
      }
      session.current = {
        id: newSessionId(),
        serviceCode,
        inputs: extras,
        masked: extras.map(() => null),
        path: extras.map((v) => `${v} (dialled)`),
      };
      return request();
    },
    [request, setScreen],
  );

  const submitInput = useCallback((): Promise<Screen> => {
    const cur = screenRef.current;
    const s = session.current;
    if (cur.mode !== "con" || !s) return Promise.resolve(cur);
    const value = cur.input;
    const masked = maskFor(cur.text, value);
    s.inputs.push(value);
    s.masked.push(masked);
    s.path.push(labelFor(cur.text, value, masked));
    return request();
  }, [request]);

  const cancelSession = useCallback(
    (reason: string) => {
      const s = session.current;
      if (s) {
        s.abort?.abort();
        log(s, { raw: "", kind: "LOCAL", status: 0, ms: 0, error: reason, sessionOpen: false });
        session.current = null;
        emitSessionEnd(live.current.phone.id);
      }
      setScreen({ mode: "home", dial: "" });
    },
    [emitSessionEnd, log, setScreen],
  );

  // ── Idle timeout (real USSD sessions die after ~60s of silence) ───────────
  useEffect(() => {
    const secs = settings.idleTimeoutSec;
    if (screen.mode !== "con" || !secs) return;
    const t = setTimeout(() => {
      const s = session.current;
      if (!s) return;
      log(s, { raw: "", kind: "LOCAL", status: 0, ms: 0, error: `Session timed out after ${secs}s idle`, sessionOpen: false });
      endSession({ mode: "error", text: "USSD session timed out." });
    }, secs * 1000);
    return () => clearTimeout(t);
  }, [screen, activity, settings.idleTimeoutSec, log, endSession]);

  // ── Scroll handling ────────────────────────────────────────────────────────
  const updateScroll = useCallback(() => {
    const el = textRef.current;
    if (!el) return setScroll({ up: false, down: false });
    setScroll({ up: el.scrollTop > 2, down: el.scrollTop + el.clientHeight < el.scrollHeight - 2 });
  }, []);
  useLayoutEffect(() => {
    if (textRef.current) textRef.current.scrollTop = 0;
    updateScroll();
  }, [screen.mode, "text" in screen ? screen.text : "", screen.mode === "sms" ? screen.index : -1, updateScroll]); // eslint-disable-line

  // ── Key handling ───────────────────────────────────────────────────────────
  const flash = (k: Key) => {
    setPressed(k);
    setTimeout(() => setPressed((p) => (p === k ? null : p)), 110);
  };

  const press = useCallback(
    (k: Key): Promise<Screen> | void => {
      flash(k);
      setActivity((a) => a + 1);
      if (!live.current.settings.muted) keyClick(k === "call" ? "call" : k === "end" ? "end" : "key");

      const cur = screenRef.current;
      const isChar = /^[0-9*#]$/.test(k);

      if (k === "up" || k === "down") {
        textRef.current?.scrollBy({ top: k === "up" ? -18 : 18 });
        return;
      }

      switch (cur.mode) {
        case "home":
          if (isChar) return setScreen({ mode: "home", dial: (cur.dial + k).slice(0, 40) });
          if (k === "softR" || k === "clear") return setScreen({ mode: "home", dial: cur.dial.slice(0, -1) });
          if (k === "end") return setScreen({ mode: "home", dial: "" });
          if ((k === "call" || k === "softL") && cur.dial) return startSession(cur.dial);
          if ((k === "softL" || k === "call") && !cur.dial) return openInbox(0);
          return;
        case "sms":
          if (k === "softL" && cur.index < inboxRef.current.length - 1) return setScreen({ mode: "sms", index: cur.index + 1 });
          if (k === "softR" || k === "end" || k === "clear") return setScreen({ mode: "home", dial: "" });
          return;
        case "loading":
          if (k === "end" || k === "softR") cancelSession("Cancelled while waiting for reply");
          return;
        case "con":
          if (isChar) return setScreen({ ...cur, input: (cur.input + k).slice(0, 40) });
          if (k === "clear") return setScreen({ ...cur, input: cur.input.slice(0, -1) });
          if (k === "softL" || k === "call") return submitInput();
          if (k === "softR" || k === "end") return cancelSession("Session cancelled by user");
          return;
        case "end":
        case "error":
          if (k === "softL" || k === "softR" || k === "call" || k === "end") setScreen({ mode: "home", dial: "" });
          return;
      }
    },
    [cancelSession, setScreen, startSession, submitInput, openInbox],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const map: Record<string, Key> = {
      Enter: "call", Escape: "end", Backspace: "clear", Delete: "clear",
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "softL", ArrowRight: "softR",
    };
    const k: Key | undefined = /^[0-9*#]$/.test(e.key) ? (e.key as Key) : map[e.key];
    if (!k || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    void press(k);
  };

  // ── Controller for the scenario runner ─────────────────────────────────────
  useEffect(() => {
    const snap = (s: Screen): ScreenSnapshot => ({ mode: s.mode === "sms" ? "home" : s.mode, text: "text" in s ? s.text : "" });
    const typeChars = async (chars: string) => {
      for (const ch of chars) {
        if (/^[0-9*#]$/.test(ch)) press(ch as Key);
        await sleep(90);
      }
    };
    controllers.set(phone.id, {
      snapshot: () => snap(screenRef.current),
      reset: () => {
        if (session.current) cancelSession("Reset by scenario runner");
        setScreen({ mode: "home", dial: "" });
      },
      dial: async (code) => {
        setScreen({ mode: "home", dial: "" });
        await typeChars(code);
        await sleep(150);
        const r = press("call");
        return snap(r ? await r : screenRef.current);
      },
      enter: async (value) => {
        if (screenRef.current.mode !== "con") return snap(screenRef.current);
        await typeChars(value);
        await sleep(150);
        const r = press("softL");
        return snap(r ? await r : screenRef.current);
      },
    });
    return () => void controllers.delete(phone.id);
  }, [phone.id, press, cancelSession, setScreen]);

  // cancel open request if phone is removed
  useEffect(() => () => session.current?.abort?.abort(), []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const network = networkFor(phone.number);
  const hhmm = clock.toTimeString().slice(0, 5);

  let softL = "";
  let softC = "";
  let softR = "";
  if (screen.mode === "home") {
    softL = screen.dial ? "Call" : unread ? "Read" : inbox.length ? "Inbox" : "Menu";
    softR = screen.dial ? "Clear" : "Names";
  } else if (screen.mode === "sms") {
    softL = screen.index < inbox.length - 1 ? "Older" : "";
    softR = "Back";
  } else if (screen.mode === "loading") softR = "Cancel";
  else if (screen.mode === "con") {
    softL = "Send";
    softR = "Cancel";
  } else softC = "OK";

  return (
    <div className="flex flex-col items-center gap-3">
      <PhoneLabel phone={phone} index={index} canRemove={phones.length > 1} onChange={(p) => updatePhone(phone.id, p)} onRemove={() => removePhone(phone.id)} selected={selected} />

      <div
        ref={rootRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseDown={() => select(phone.id)}
        onFocus={() => select(phone.id)}
        aria-label={`${phone.nickname} phone. Type digits, Enter to send, Escape to cancel.`}
        className={`phone-shell shell-${phone.shell} ${selected ? "is-selected" : ""}`}
      >
        <div className="phone-earpiece" aria-hidden />
        <div className="phone-brand" aria-hidden>MZANSI&nbsp;1</div>

        {/* ── LCD ─────────────────────────────────────────────────────── */}
        <div className={`lcd ${lit ? "lcd-lit" : ""}`} role="region" aria-live="polite">
          <div className="lcd-inner font-lcd">
            {screen.mode === "home" && (
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between">
                  <SignalBars />
                  <Battery />
                </div>
                {screen.dial ? (
                  <div className="flex flex-1 items-end justify-end break-all pb-1 text-right text-[30px] leading-[28px]">
                    {screen.dial}
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center text-center leading-[18px]">
                    <div className="text-[20px] tracking-wide">{network}</div>
                    <div className="text-[34px] leading-[32px]">{hhmm}</div>
                    <div className="text-[15px] opacity-80">{prettyPhone(phone.number)}</div>
                    {unread > 0 && (
                      <div className="mt-1 flex items-center gap-1.5 text-[17px]" aria-live="polite">
                        <svg width="16" height="11" viewBox="0 0 16 11" aria-hidden className="lcd-blink">
                          <rect x="0.75" y="0.75" width="14.5" height="9.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M1 1l7 5 7-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        {unread} new message{unread > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {screen.mode === "loading" && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[19px] leading-[18px]">
                <div className="lcd-spinner" aria-hidden />
                <div>USSD code running...</div>
              </div>
            )}

            {screen.mode === "sms" && inbox[screen.index] && (
              <div className="relative flex h-full flex-col">
                <div className="flex justify-between border-b pb-0.5 text-[16px] leading-[16px]" style={{ borderColor: "rgba(31,42,23,.45)" }}>
                  <span>From {inbox[screen.index].from || "ZAKA"}</span>
                  <span>{screen.index + 1}/{inbox.length}</span>
                </div>
                <div className="text-[15px] leading-[16px] opacity-75">{new Date(inbox[screen.index].createdAt).toTimeString().slice(0, 5)}</div>
                <div
                  ref={textRef}
                  onScroll={updateScroll}
                  className="lcd-text flex-1 overflow-y-auto whitespace-pre-wrap break-words pr-2 text-[18px] leading-[17px]"
                >
                  {inbox[screen.index].message}
                </div>
                {(scroll.up || scroll.down) && (
                  <div className="pointer-events-none absolute bottom-0 right-0 flex flex-col text-[12px] leading-none">
                    <span className={scroll.up ? "" : "opacity-0"}>▲</span>
                    <span className={scroll.down ? "" : "opacity-0"}>▼</span>
                  </div>
                )}
              </div>
            )}

            {(screen.mode === "con" || screen.mode === "end" || screen.mode === "error") && (
              <div className="relative flex h-full flex-col">
                <div
                  ref={textRef}
                  onScroll={updateScroll}
                  className="lcd-text flex-1 overflow-y-auto whitespace-pre-wrap break-words pr-2 text-[18px] leading-[17px]"
                >
                  {screen.text}
                </div>
                {(scroll.up || scroll.down) && (
                  <div className="pointer-events-none absolute right-0 top-0 flex h-full flex-col justify-between text-[12px] leading-none">
                    <span className={scroll.up ? "" : "opacity-0"}>▲</span>
                    <span className={scroll.down ? "" : "opacity-0"} style={{ marginBottom: screen.mode === "con" ? 22 : 0 }}>▼</span>
                  </div>
                )}
                {screen.mode === "con" && (
                  <div className="mt-1 flex h-[20px] items-center border-t text-[19px] leading-[18px]" style={{ borderColor: "rgba(31,42,23,.45)" }}>
                    <span className="truncate">{screen.input}</span>
                    <span className="lcd-caret" aria-hidden />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="lcd-soft font-lcd">
            <span>{softL}</span>
            <span>{softC}</span>
            <span>{softR}</span>
          </div>
        </div>

        {/* ── Keypad ──────────────────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 px-1">
          <Pad k="softL" pressed={pressed} onPress={press} className="key-soft" label="Left soft key">
            <span className="block h-[3px] w-6 rounded bg-current opacity-70" />
          </Pad>
          <div className="key-nav">
            <Pad k="up" pressed={pressed} onPress={press} className="key-nav-btn" label="Scroll up">
              <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden><path d="M1 7 6 2l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
            </Pad>
            <Pad k="clear" pressed={pressed} onPress={press} className="key-nav-c" label="Clear">C</Pad>
            <Pad k="down" pressed={pressed} onPress={press} className="key-nav-btn" label="Scroll down">
              <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden><path d="m1 1 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
            </Pad>
          </div>
          <Pad k="softR" pressed={pressed} onPress={press} className="key-soft" label="Right soft key">
            <span className="block h-[3px] w-6 rounded bg-current opacity-70" />
          </Pad>
        </div>

        <div className="mt-2 flex justify-between px-1">
          <Pad k="call" pressed={pressed} onPress={press} className="key-call" label="Call / Send">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z" /></svg>
          </Pad>
          <Pad k="end" pressed={pressed} onPress={press} className="key-end" label="End / Cancel">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M12 9c-1.6 0-3.1.3-4.6.7v3.1c0 .4-.2.7-.6.9-1 .5-1.9 1.1-2.7 1.8-.2.2-.4.3-.7.3s-.5-.1-.7-.3L.3 13.1a1 1 0 0 1 0-1.4C3.4 8.8 7.5 7 12 7s8.6 1.8 11.7 4.7a1 1 0 0 1 0 1.4l-2.4 2.4c-.2.2-.4.3-.7.3s-.5-.1-.7-.3c-.8-.7-1.7-1.3-2.7-1.8a1 1 0 0 1-.6-.9V9.7C15.1 9.3 13.6 9 12 9Z" /></svg>
          </Pad>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 px-1">
          {(["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as Key[]).map((k) => (
            <Pad key={k} k={k} pressed={pressed} onPress={press} className="key-num" label={k}>
              <span className="text-[17px] font-semibold leading-none">{k}</span>
              <span className="text-[8.5px] uppercase leading-none tracking-wider opacity-60">{LETTERS[k]}</span>
            </Pad>
          ))}
        </div>
        <div className="phone-mic" aria-hidden />
      </div>
    </div>
  );
}

function Pad({
  k, pressed, onPress, className, label, children,
}: {
  k: Key;
  pressed: Key | null;
  onPress: (k: Key) => unknown;
  className: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault() /* keep focus on the phone */}
      onClick={() => void onPress(k)}
      className={`key ${className} ${pressed === k ? "is-pressed" : ""}`}
    >
      {children}
    </button>
  );
}

function SignalBars() {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" aria-label="Signal">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 5.5} y={10 - i * 3.2} width="4" height={4 + i * 3.2} fill="currentColor" />
      ))}
    </svg>
  );
}

function Battery() {
  return (
    <svg width="26" height="13" viewBox="0 0 26 13" aria-label="Battery">
      <rect x="0.75" y="0.75" width="21.5" height="11.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="22.5" y="4" width="3" height="5" fill="currentColor" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={3 + i * 6.3} y="3" width="5" height="7" fill="currentColor" />
      ))}
    </svg>
  );
}

function PhoneLabel({
  phone, index, canRemove, onChange, onRemove, selected,
}: {
  phone: PhoneConfig;
  index: number;
  canRemove: boolean;
  onChange: (p: Partial<PhoneConfig>) => void;
  onRemove: () => void;
  selected: boolean;
}) {
  const [num, setNum] = useState(phone.number);
  useEffect(() => setNum(phone.number), [phone.number]);
  const commitNumber = () => {
    const n = normalisePhone(num);
    if (/^\+\d{8,15}$/.test(n)) {
      setNum(n);
      if (n !== phone.number) onChange({ number: n });
    } else setNum(phone.number);
  };

  return (
    <div className={`w-[252px] rounded-xl border px-3 py-2 transition-colors ${selected ? "border-accent/60 bg-accent-soft" : "border-zinc-200 bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60"}`}>
      <div className="flex items-center gap-2">
        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${selected ? "bg-accent text-white" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
          {index + 1}
        </span>
        <label className="sr-only" htmlFor={`nick-${phone.id}`}>Nickname</label>
        <input
          id={`nick-${phone.id}`}
          value={phone.nickname}
          onChange={(e) => onChange({ nickname: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none focus:underline"
        />
        {canRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${phone.nickname}`} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200 hover:text-red-500 dark:hover:bg-zinc-800">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
          </button>
        )}
      </div>
      <label className="sr-only" htmlFor={`num-${phone.id}`}>Phone number</label>
      <input
        id={`num-${phone.id}`}
        value={num}
        onChange={(e) => setNum(e.target.value)}
        onBlur={commitNumber}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="mt-0.5 w-full bg-transparent font-mono text-xs text-zinc-500 outline-none focus:text-zinc-900 dark:text-zinc-400 dark:focus:text-zinc-100"
      />
    </div>
  );
}
