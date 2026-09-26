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
  /** Sent as x-admin-key to merchant/admin endpoints */
  adminKey: string;
  /** Show wallet/owner addresses in the account panel */
  showChainDetails: boolean;
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

export interface KycStatus {
  /** null = no ID number captured yet (can't send) */
  level: number | null;
  tierName: string;
  canSend: boolean;
  canUpgrade: boolean;
  idNumberMasked: string | null;
  method: string | null;
  reference: string | null;
  limits: { dailyCents: number; monthlyCents: number };
  used: { todayCents: number; monthCents: number };
  remaining: { todayCents: number; monthCents: number };
}

export interface WalletInfo {
  registered: boolean;
  phoneNumber: string;
  balance?: { raw: string; formatted: string };
  kyc?: KycStatus | null;
  // developer-only chain details
  ownerAddress?: string;
  walletAddress?: string;
  deployed?: boolean;
}

export interface SmsMessage {
  id: number;
  to: string;
  from: string | null;
  message: string;
  category: string | null;
  provider: "africastalking" | "simulated" | string;
  status: string;
  statusCode?: number | null;
  messageId?: string | null;
  cost?: string | null;
  error?: string | null;
  createdAt: number;
}

export interface SmsList {
  mode: "live" | "sandbox" | "simulated" | string;
  messages: SmsMessage[];
}

export interface Health {
  status: string;
  time: string;
  env: {
    factorySet: boolean;
    paymasterSet: boolean;
    tokenSet: boolean;
    smsSet?: boolean;
    shortCodeSet?: boolean;
    shortCode?: string | null;
    smsMode?: "live" | "sandbox" | "simulated";
    adminKeySet?: boolean;
  };
}

export interface Backend {
  readonly kind: "real" | "mock";
  ussd(req: UssdRequest, signal?: AbortSignal): Promise<UssdResult>;
  wallet(phoneNumber: string): Promise<WalletInfo>;
  health(): Promise<Health>;
  /** Outbound SMS log, newest first. Older backends without /api/sms return an empty list. */
  sms(opts?: { limit?: number }): Promise<SmsList>;
  /** Complete "ZAKA validation" (merchant / website) → Level 1 */
  verifyKyc(phoneNumber: string, opts: { method: "merchant" | "web"; reference?: string; adminKey?: string }): Promise<KycStatus>;
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
