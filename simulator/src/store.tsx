// App-wide state: settings, phones, logs, wallet cache, scenarios.
// Settings, phones and scenarios persist to localStorage; logs stay in memory.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Backend, LogEntry, PhoneConfig, Scenario, Settings, Shell, SmsMessage, WalletInfo } from "./types";
import { getBackend } from "./api";
import { load, save, uid } from "./lib/util";

const K = { settings: "ussdsim.settings", phones: "ussdsim.phones", scenarios: "ussdsim.scenarios" };

const DEFAULT_SETTINGS: Settings = {
  baseUrl: "http://localhost:3000",
  mock: false,
  theme: "dark",
  muted: false,
  idleTimeoutSec: 60,
  serviceCode: "*384*123#",
  adminKey: "",
  showChainDetails: false,
};

const SMS_POLL_MS = 3_000;

const DEFAULT_PHONES: PhoneConfig[] = [
  { id: "phone-a", nickname: "User A", number: "+27821234567", shell: "graphite" },
  { id: "phone-b", nickname: "User B", number: "+27831234567", shell: "navy" },
];

// Valid (checksummed) test SA ID numbers – not real people
export const DEFAULT_SCENARIOS: Scenario[] = [
  { id: "sc-reg-a", name: "Register A", steps: ["dial", "1234", "1234", "9001015009086"], expect: "Wallet created" },
  { id: "sc-reg-b", name: "Register B", steps: ["dial", "1234", "1234", "8505055800080"], expect: "Wallet created" },
  { id: "sc-claim", name: "Claim R100", steps: ["dial", "3", "1234"], expect: "demo ZAKA added" },
  { id: "sc-send", name: "A sends R50 to B", steps: ["dial", "2", "0831234567", "50", "1234"], expect: "Sending R50.00" },
  { id: "sc-limit", name: "A goes over the R500 daily limit", steps: ["dial", "2", "0831234567", "600"], expect: "over your daily limit" },
  { id: "sc-bal", name: "Check balance", steps: ["dial", "1"], expect: "ZAKA balance" },
  { id: "sc-short", name: "Shortcut: A sends R20 to B", steps: ["dial *384*123*2*0831234567*20#", "1234"], expect: "Sending R20.00" },
  { id: "sc-drop", name: "Drop mid-send (then redial with 'Resume')", steps: ["dial", "2", "0831234567", "30"], expect: "PIN" },
  { id: "sc-resume", name: "Resume the dropped send", steps: ["dial", "1", "1234"], expect: "Sending R30.00" },
  { id: "sc-acct", name: "My account", steps: ["dial", "4"], expect: "Level" },
];

const SHELLS: Shell[] = ["graphite", "navy", "sand", "crimson"];
const MAX_LOG = 300;

export interface WalletState {
  info?: WalletInfo;
  error?: string;
  loading: boolean;
  updatedAt?: number;
}

type SessionEndListener = (phoneId: string) => void;

interface Store {
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  backend: Backend;

  phones: PhoneConfig[];
  addPhone: () => void;
  updatePhone: (id: string, patch: Partial<PhoneConfig>) => void;
  removePhone: (id: string) => void;
  selectedId: string;
  select: (id: string) => void;

  logs: Record<string, LogEntry[]>;
  addLog: (entry: LogEntry) => void;
  clearLog: (phoneId: string) => void;

  wallets: Record<string, WalletState>;
  refreshWallet: (phoneId: string) => Promise<void>;
  refreshAllWallets: () => void;

  onSessionEnd: (fn: SessionEndListener) => () => void;
  emitSessionEnd: (phoneId: string) => void;

  scenarios: Scenario[];
  setScenarios: (s: Scenario[]) => void;

  /** Every outbound SMS the backend reports, newest first */
  sms: SmsMessage[];
  smsMode: string;
  smsError?: string;
  /** Highest SMS id each phone has read */
  smsRead: Record<string, number>;
  markSmsRead: (phoneId: string, upToId: number) => void;
  refreshSms: () => void;

  verifyKyc: (phoneId: string, method: "merchant" | "web") => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...load(K.settings, {}) }));
  const [phones, setPhones] = useState<PhoneConfig[]>(() => {
    const p = load<PhoneConfig[]>(K.phones, DEFAULT_PHONES);
    return p.length ? p : DEFAULT_PHONES;
  });
  const [selectedId, setSelectedId] = useState(() => phones[0]?.id ?? "");
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [wallets, setWallets] = useState<Record<string, WalletState>>({});
  const [scenarios, setScenariosState] = useState<Scenario[]>(() => load(K.scenarios, DEFAULT_SCENARIOS));

  useEffect(() => save(K.settings, settings), [settings]);
  useEffect(() => save(K.phones, phones), [phones]);
  useEffect(() => save(K.scenarios, scenarios), [scenarios]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme]);

  const backend = useMemo(() => getBackend(settings), [settings.mock, settings.baseUrl]); // eslint-disable-line

  // Wallet cache is backend-specific: wipe it when switching real ↔ mock / URL
  useEffect(() => setWallets({}), [backend]);

  const setSettings = useCallback((patch: Partial<Settings>) => setSettingsState((s) => ({ ...s, ...patch })), []);

  const phonesRef = useRef(phones);
  phonesRef.current = phones;

  const addPhone = useCallback(() => {
    const ps = phonesRef.current;
    const used = new Set(ps.map((p) => p.number));
    const letter = String.fromCharCode(65 + (ps.length % 26));
    // Pick a free, valid-looking SA number: +2784…, +2785…, …
    let number = "";
    for (let n = 4; n < 10 && (!number || used.has(number)); n++) number = `+278${n}1234567`;
    while (used.has(number)) number = `+2782${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    const p: PhoneConfig = { id: uid("phone-"), nickname: `User ${letter}`, number, shell: SHELLS[ps.length % SHELLS.length] };
    setPhones([...ps, p]);
    setSelectedId(p.id);
  }, []);

  const updatePhone = useCallback((id: string, patch: Partial<PhoneConfig>) => {
    setPhones((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    if (patch.number) setWallets((w) => ({ ...w, [id]: { loading: false } }));
  }, []);

  const removePhone = useCallback((id: string) => {
    const next = phonesRef.current.filter((p) => p.id !== id);
    setPhones(next);
    setSelectedId((sel) => (sel === id ? next[0]?.id ?? "" : sel));
  }, []);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((l) => ({ ...l, [entry.phoneId]: [...(l[entry.phoneId] ?? []), entry].slice(-MAX_LOG) }));
  }, []);
  const clearLog = useCallback((phoneId: string) => setLogs((l) => ({ ...l, [phoneId]: [] })), []);

  // Wallet fetching – keep latest phones/backend in refs so timers stay fresh
  const backendRef = useRef(backend);
  backendRef.current = backend;

  const refreshWallet = useCallback(async (phoneId: string) => {
    const phone = phonesRef.current.find((p) => p.id === phoneId);
    if (!phone) return;
    const be = backendRef.current;
    setWallets((w) => ({ ...w, [phoneId]: { ...w[phoneId], loading: true } }));
    try {
      const info = await be.wallet(phone.number);
      if (be !== backendRef.current) return;
      setWallets((w) => ({ ...w, [phoneId]: { info, loading: false, updatedAt: Date.now() } }));
    } catch (err) {
      if (be !== backendRef.current) return;
      setWallets((w) => ({ ...w, [phoneId]: { ...w[phoneId], loading: false, error: (err as Error).message, updatedAt: Date.now() } }));
    }
  }, []);

  const refreshAllWallets = useCallback(() => {
    phonesRef.current.forEach((p) => void refreshWallet(p.id));
  }, [refreshWallet]);

  const listeners = useRef(new Set<SessionEndListener>());
  const onSessionEnd = useCallback((fn: SessionEndListener) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);
  const emitSessionEnd = useCallback((phoneId: string) => listeners.current.forEach((fn) => fn(phoneId)), []);

  // ── SMS polling ───────────────────────────────────────────────────────────
  const [sms, setSms] = useState<SmsMessage[]>([]);
  const [smsMode, setSmsMode] = useState("");
  const [smsError, setSmsError] = useState<string | undefined>();
  const [smsRead, setSmsRead] = useState<Record<string, number>>({});
  const maxSmsId = useRef(-1);

  const refreshSms = useCallback(async () => {
    const be = backendRef.current;
    try {
      const list = await be.sms({ limit: 100 });
      if (be !== backendRef.current) return;
      setSms(list.messages);
      setSmsMode(list.mode);
      setSmsError(undefined);
      const top = list.messages[0]?.id ?? 0;
      // New SMS usually means money moved: refresh balances
      if (maxSmsId.current >= 0 && top > maxSmsId.current) refreshAllWallets();
      maxSmsId.current = top;
    } catch (err) {
      if (be === backendRef.current) setSmsError((err as Error).message);
    }
  }, [refreshAllWallets]);

  useEffect(() => {
    // New backend: forget what was read, but don't flag its existing history as new
    setSms([]);
    maxSmsId.current = -1;
    setSmsRead({});
    let first = true;
    const tick = async () => {
      await refreshSms();
      if (first) {
        first = false;
        const top = maxSmsId.current;
        setSmsRead(Object.fromEntries(phonesRef.current.map((p) => [p.id, top])));
      }
    };
    void tick();
    const t = setInterval(() => document.visibilityState === "visible" && void refreshSms(), SMS_POLL_MS);
    return () => clearInterval(t);
  }, [backend, refreshSms]);

  const markSmsRead = useCallback((phoneId: string, upToId: number) => {
    setSmsRead((r) => ((r[phoneId] ?? 0) >= upToId ? r : { ...r, [phoneId]: upToId }));
  }, []);

  const verifyKyc = useCallback(
    async (phoneId: string, method: "merchant" | "web") => {
      const phone = phonesRef.current.find((p) => p.id === phoneId);
      if (!phone) return;
      await backendRef.current.verifyKyc(phone.number, {
        method,
        reference: `SIM-${Date.now().toString(36).toUpperCase()}`,
        adminKey: settings.adminKey || undefined,
      });
      await refreshWallet(phoneId);
      setTimeout(() => void refreshSms(), 1200);
    },
    [refreshWallet, refreshSms, settings.adminKey],
  );

  const value: Store = {
    settings,
    setSettings,
    backend,
    phones,
    addPhone,
    updatePhone,
    removePhone,
    selectedId,
    select: setSelectedId,
    logs,
    addLog,
    clearLog,
    wallets,
    refreshWallet,
    refreshAllWallets,
    onSessionEnd,
    emitSessionEnd,
    scenarios,
    setScenarios: setScenariosState,
    sms,
    smsMode,
    smsError,
    smsRead,
    markSmsRead,
    refreshSms: () => void refreshSms(),
    verifyKyc,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
