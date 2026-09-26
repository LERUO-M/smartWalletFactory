export type Shell = "graphite" | "navy" | "sand" | "crimson";

export interface PhoneConfig {
  id: string;
  nickname: string;
  /** E.164, e.g. +27821234567 */
  number: string;
  shell: Shell;
}

export interface Settings {
  baseUrl: string;
  mock: boolean;
  theme: "dark" | "light";
  muted: boolean;
  /** 0 disables the idle auto-end */
  idleTimeoutSec: number;
  /** Code used by scenario "dial" steps */
  serviceCode: string;
}

// ── Backend contract ────────────────────────────────────────────────────────

export interface UssdRequest {
  sessionId: string;
  serviceCode: string;
  phoneNumber: string;
  text: string;
}

export interface UssdResult {
  ok: boolean;
  /** HTTP status, 0 for network errors / timeouts */
  status: number;
  raw: string;
  ms: number;
  error?: string;
}

export interface WalletInfo {
  registered: boolean;
  phoneNumber: string;
  ownerAddress?: string;
  walletAddress?: string;
  balance?: { raw: string; formatted: string };
  deployed?: boolean;
}

export interface Health {
  status: string;
  time: string;
  env: { factorySet: boolean; paymasterSet: boolean; tokenSet: boolean };
}

export interface Backend {
  readonly kind: "real" | "mock";
  ussd(req: UssdRequest, signal?: AbortSignal): Promise<UssdResult>;
  wallet(phoneNumber: string): Promise<WalletInfo>;
  health(): Promise<Health>;
}

// ── Inspector log ───────────────────────────────────────────────────────────

export type LogKind = "CON" | "END" | "ERROR" | "LOCAL";

export interface LogEntry {
  id: string;
  phoneId: string;
  ts: number;
  sessionId: string;
  serviceCode: string;
  phoneNumber: string;
  /** Real text sent (contains PINs – never render this) */
  text: string;
  /** Text with PIN segments masked – safe to render */
  maskedText: string;
  raw: string;
  kind: LogKind;
  status: number;
  ms: number;
  error?: string;
  /** Breadcrumb labels after this step (PINs already masked) */
  path: string[];
  sessionOpen: boolean;
  mock: boolean;
}

// ── Scenarios ───────────────────────────────────────────────────────────────

export interface Scenario {
  id: string;
  name: string;
  /** "dial", "dial *120*55#" or any input string */
  steps: string[];
  /** Optional: final screen must contain this (case-insensitive) */
  expect?: string;
}
