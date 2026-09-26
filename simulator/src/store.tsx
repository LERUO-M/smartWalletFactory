// App-wide state: settings, phones, logs, wallet cache, scenarios.
// Settings, phones and scenarios persist to localStorage; logs stay in memory.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Backend, LogEntry, PhoneConfig, Scenario, Settings, Shell, WalletInfo } from "./types";
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
};

const DEFAULT_PHONES: PhoneConfig[] = [
  { id: "phone-a", nickname: "User A", number: "+27821234567", shell: "graphite" },
  { id: "phone-b", nickname: "User B", number: "+27831234567", shell: "navy" },
];

export const DEFAULT_SCENARIOS: Scenario[] = [
  { id: "sc-reg-a", name: "Register A", steps: ["dial", "1234", "1234"], expect: "Wallet created" },
  { id: "sc-reg-b", name: "Register B", steps: ["dial", "1234", "1234"], expect: "Wallet created" },
  { id: "sc-claim", name: "Claim R100", steps: ["dial", "3", "1234"], expect: "claimed" },
  { id: "sc-send", name: "A sends R50 to B", steps: ["dial", "2", "0831234567", "50", "1234"], expect: "Sent R50.00" },
  { id: "sc-bal", name: "Check balance", steps: ["dial", "1"], expect: "Balance" },
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
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
