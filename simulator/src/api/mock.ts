// ─────────────────────────────────────────────────────────────────────────────
// In-browser fake backend. Mirrors backend/routes/ussd.js (ZAKA menus, tiered
// KYC limits, SMS notifications) closely enough to demo the UI without a
// server. State is in memory only (reload = fresh).
// ─────────────────────────────────────────────────────────────────────────────

import type { Backend, Health, KycStatus, SmsList, SmsMessage, UssdRequest, UssdResult, WalletInfo } from "../types";
import { normalisePhone, sleep, ulid } from "../lib/util";

const SHORT_CODE = "40404";
const TIERS = {
  0: { name: "Level 0", daily: 50_000, monthly: 1_000_000 },
  1: { name: "Level 1", daily: 2_500_000, monthly: 10_000_000 },
} as const;

interface MockUser {
  pin: string;
  idMasked: string | null;
  level: 0 | 1 | null;
  method: string | null;
  reference: string | null;
  ownerAddress: string;
  walletAddress: string;
  cents: number;
  deployed: boolean;
}
interface MockTransfer { id: number; ref: string; from: string | null; to: string; cents: number; at: number; kind: string; status: "pending" | "success" }

const users = new Map<string, MockUser>();
const idsInUse = new Map<string, string>(); // id → phone
const transfers: MockTransfer[] = [];
const outbox: SmsMessage[] = [];
let transferSeq = 0;
let smsSeq = 0;

/** Deterministic fake 20-byte address from a seed (developer details only) */
function fakeAddress(seed: string): string {
  let out = "";
  let h = 0x811c9dc5;
  for (let round = 0; out.length < 40; round++) {
    for (const ch of seed + round) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return "0x" + out.slice(0, 40);
}

const fmt = (cents: number) =>
  "R" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (cents: number) => (cents % 100 === 0 ? "R" + (cents / 100).toLocaleString("en-US") : fmt(cents));
const latency = () => sleep(250 + Math.random() * 550);

// ── SA ID validation (same rules as kycService.validateSaId) ────────────────
export function validSaId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  const yy = +id.slice(0, 2), mm = +id.slice(2, 4), dd = +id.slice(4, 6);
  const year = yy <= new Date().getUTCFullYear() % 100 ? 2000 + yy : 1900 + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return false;
  if (!["0", "1"].includes(id[10])) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let n = +id[12 - i];
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

// ── KYC helpers ─────────────────────────────────────────────────────────────
const SAST = 2 * 3600_000;
function windows() {
  const l = new Date(Date.now() + SAST);
  return {
    day: Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - SAST,
    month: Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) - SAST,
  };
}
function kycStatus(phone: string): KycStatus | null {
  const u = users.get(phone);
  if (!u) return null;
  const tier = u.level === null ? null : TIERS[u.level];
  const w = windows();
  const sent = (since: number) =>
    transfers.filter((t) => t.kind === "transfer" && t.from === phone && t.at >= since).reduce((a, t) => a + t.cents, 0);
  const today = sent(w.day), month = sent(w.month);
  return {
    level: u.level,
    tierName: tier ? tier.name : "Not verified",
    canSend: u.level !== null,
    canUpgrade: u.level === 0,
    idNumberMasked: u.idMasked,
    method: u.method,
    reference: u.reference,
    limits: { dailyCents: tier?.daily ?? 0, monthlyCents: tier?.monthly ?? 0 },
    used: { todayCents: today, monthCents: month },
    remaining: tier
      ? { todayCents: Math.max(0, Math.min(tier.daily - today, tier.monthly - month)), monthCents: Math.max(0, tier.monthly - month) }
      : { todayCents: 0, monthCents: 0 },
  };
}
const limitSummary = (s: KycStatus) => `${fmtShort(s.limits.dailyCents)}/day, ${fmtShort(s.limits.monthlyCents)}/month`;

// ── SMS ─────────────────────────────────────────────────────────────────────
const SMS = {
  received: (cents: number, from: string) => `ZAKA notification: you have received ${fmt(cents)} from ${from}.`,
  sent: (cents: number, to: string, ref: string) => `ZAKA: you have sent ${fmt(cents)} to ${to}. Ref: ${ref}`,
  kycUnlock: () =>
    "From ZAKA: to unlock sending more ZAKA, report to any merchant or head to our website to complete your ZAKA validation.",
  kycComplete: (limits: string) => `From ZAKA: your ZAKA validation is complete. You can now send up to ${limits}.`,
};
function sendSms(to: string, message: string, category: string) {
  const now = Date.now();
  // Arrives a moment later, like a real SMS
  setTimeout(() => {
    outbox.push({ id: ++smsSeq, to, from: SHORT_CODE, message, category, provider: "simulated", status: "simulated", createdAt: now });
  }, 900);
}
function sendKycUnlock(phone: string) {
  const recent = outbox.some((m) => m.to === phone && m.category === "kyc" && m.createdAt > Date.now() - 3600_000);
  if (!recent) sendSms(phone, SMS.kycUnlock(), "kyc");
}

// ── USSD ────────────────────────────────────────────────────────────────────
function handle(phone: string, serviceCode: string, inputs: string[]): string {
  const user = users.get(phone);

  // Registration: PIN → confirm → ID number
  if (!user) {
    let step: "pin" | "confirm" | "id" = "pin";
    let pin = "";
    let err = false;
    for (const input of inputs) {
      err = false;
      if (step === "pin") {
        if (/^\d{4}$/.test(input)) { pin = input; step = "confirm"; } else err = true;
      } else if (step === "confirm") {
        if (input !== pin) return `END PINs do not match.\nPlease dial again to try again.`;
        step = "id";
      } else {
        if (!validSaId(input)) { err = true; continue; }
        if (idsInUse.has(input)) return `END This ID number is already linked to another phone.\nPlease visit a ZAKA merchant for help.`;
        const u: MockUser = {
          pin, idMasked: input.slice(0, 6) + "•••••" + input.slice(-2), level: 0, method: "ussd", reference: null,
          ownerAddress: fakeAddress("owner" + phone), walletAddress: fakeAddress("wallet" + phone), cents: 0, deployed: false,
        };
        users.set(phone, u);
        idsInUse.set(input, phone);
        setTimeout(() => {
          u.cents += 10_000;
          u.deployed = true;
          transfers.push({ id: ++transferSeq, ref: ulid(), from: null, to: phone, cents: 10_000, at: Date.now(), kind: "welcome", status: "success" });
        }, 3_000);
        sendKycUnlock(phone);
        return `END Wallet created for ${phone}!\n\nWe have sent you some ZAKA as a welcome bonus! Check your balance!`;
      }
    }
    if (step === "pin")
      return err ? `CON Invalid PIN. Please enter 4 digits:` : `CON Hello from ZAKA!\n\nEnter 4 digit pin to create your wallet for instant transfers!`;
    if (step === "confirm") return `CON Confirm your PIN:\n(Enter the same 4 digits again)`;
    return err
      ? `CON That ID number is not valid.\nPlease enter your 13-digit SA ID number:`
      : `CON Enter your 13-digit SA ID number:\n(Needed to keep your money safe)`;
  }

  if (inputs.length === 0) return `CON ZAKA\n1. Check Balance\n2. Send ZAKA\n3. Claim R100 Demo ZAKA\n4. My Account`;

  const kyc = kycStatus(phone)!;
  const [choice] = inputs;

  if (choice === "1") {
    const usage = kyc.canSend ? `\n\nSent today: ${fmt(kyc.used.todayCents)} of ${fmtShort(kyc.limits.dailyCents)}` : "";
    return `END Your ZAKA balance: ${fmt(user.cents)}${usage}`;
  }

  if (choice === "2") {
    if (!kyc.canSend) return `END Please add your ID number before sending.\nChoose 4. My Account.`;
    if (inputs.length === 1) return `CON Enter recipient phone number:\n(e.g. 0821234567)`;
    const to = normalisePhone(inputs[1]);
    if (!/^\+27\d{9}$/.test(to)) return `END Invalid phone number. Please dial again.`;
    if (to === phone) return `END You cannot send ZAKA to yourself.`;
    if (inputs.length === 2) return `CON Enter amount in Rand:\n(e.g. 25)`;
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(inputs[2]) || +inputs[2] <= 0) return `END Invalid amount. Please dial again.`;
    const cents = Math.round(parseFloat(inputs[2]) * 100);
    const over = kyc.used.todayCents + cents > kyc.limits.dailyCents ? "daily" : kyc.used.monthCents + cents > kyc.limits.monthlyCents ? "monthly" : null;
    if (over) {
      sendKycUnlock(phone);
      return `END Sorry, this is over your ${over} limit.\n${kyc.tierName} limit: ${limitSummary(kyc)}.\nYou can still send ${fmt(kyc.remaining.todayCents)} today.\n\nWe have sent you an SMS on how to unlock more.`;
    }
    if (inputs.length === 3) return `CON Send ${fmt(cents)} to ${inputs[1]}?\n\nEnter your 4-digit PIN to confirm:`;
    if (inputs.length !== 4) return "END Invalid input. Please dial again.";
    if (inputs[3] !== user.pin) return `END Incorrect PIN. Transaction cancelled.`;
    const recipient = users.get(to);
    if (!recipient) return `END ${inputs[1]} is not on ZAKA yet.\nAsk them to dial ${serviceCode} to join.`;
    const pending = transfers.filter((t) => t.from === phone && t.status === "pending").reduce((a, t) => a + t.cents, 0);
    const available = user.cents - pending;
    if (available < cents) return `END Insufficient balance.\nYour balance: ${fmt(Math.max(0, available))}\nYou tried to send: ${fmt(cents)}`;
    // Reply now; "submit" in the background like the real backend
    const t: MockTransfer = { id: ++transferSeq, ref: ulid(), from: phone, to, cents, at: Date.now(), kind: "transfer", status: "pending" };
    transfers.push(t);
    const typed = inputs[1];
    setTimeout(() => {
      user.cents -= cents;
      recipient.cents += cents;
      user.deployed = true;
      t.status = "success";
      sendSms(to, SMS.received(cents, phone), "received");
      sendSms(phone, SMS.sent(cents, typed, t.ref), "sent");
    }, 2_500);
    return `END Sending ${fmt(cents)} to ${typed}.\nYou will receive an SMS from ${SHORT_CODE} when funds are sent.\n\nRef: ${t.ref}`;
  }

  if (choice === "3") {
    if (inputs.length === 1) return `CON Claim R100 demo ZAKA.\n\nEnter your 4-digit PIN to confirm:`;
    if (inputs.length !== 2) return "END Invalid input. Please dial again.";
    if (inputs[1] !== user.pin) return `END Incorrect PIN. Please dial again.`;
    user.cents += 10_000;
    user.deployed = true;
    transfers.push({ id: ++transferSeq, ref: ulid(), from: null, to: phone, cents: 10_000, at: Date.now(), kind: "faucet", status: "success" });
    return `END R100 demo ZAKA added!\n\nDial again to check your balance.`;
  }

  if (choice === "4") {
    if (!kyc.canSend) {
      if (inputs.length === 1) return `CON My ZAKA account\n${phone}\nNot verified – you can't send yet.\n\n1. Add ID number`;
      if (inputs[1] !== "1") return `END Invalid option. Please dial again.`;
      if (inputs.length === 2) return `CON Enter your 13-digit SA ID number:`;
      const id = inputs[inputs.length - 1];
      if (idsInUse.has(id) && idsInUse.get(id) !== phone) return `END This ID number is already linked to another phone.\nPlease visit a ZAKA merchant for help.`;
      if (!validSaId(id)) return `CON That ID number is not valid.\nPlease enter your 13-digit SA ID number:`;
      user.idMasked = id.slice(0, 6) + "•••••" + id.slice(-2);
      user.level = 0;
      idsInUse.set(id, phone);
      sendKycUnlock(phone);
      return `END Thank you! You can now send ZAKA.\nYour limit: ${limitSummary(kycStatus(phone)!)}.`;
    }
    const summary = `My ZAKA account\n${phone}\n${kyc.tierName}: ${limitSummary(kyc)}\nSent today: ${fmt(kyc.used.todayCents)}\nThis month: ${fmt(kyc.used.monthCents)}`;
    if (!kyc.canUpgrade) return `END ${summary}`;
    if (inputs.length === 1) return `CON ${summary}\n\n1. Send more ZAKA`;
    if (inputs[1] !== "1") return `END Invalid option. Please dial again.`;
    sendKycUnlock(phone);
    return `END To send more ZAKA, visit any ZAKA merchant or our website to complete your ZAKA validation.\n\nWe have sent you an SMS with the details.`;
  }

  return `END Invalid option. Please dial again.`;
}

export const mockBackend: Backend = {
  kind: "mock",

  async ussd(req: UssdRequest, signal?: AbortSignal): Promise<UssdResult> {
    const t0 = performance.now();
    await latency();
    if (signal?.aborted) return { ok: false, status: 0, raw: "", ms: 0, error: "Cancelled by user" };
    const inputs = req.text === "" ? [] : req.text.split("*");
    const raw = handle(normalisePhone(req.phoneNumber), req.serviceCode, inputs);
    return { ok: true, status: 200, raw, ms: Math.round(performance.now() - t0) };
  },

  async wallet(phoneNumber: string): Promise<WalletInfo> {
    await sleep(120);
    const phone = normalisePhone(phoneNumber.startsWith("+") ? phoneNumber : "+" + phoneNumber);
    const u = users.get(phone);
    if (!u) return { registered: false, phoneNumber: phone };
    return {
      registered: true,
      phoneNumber: phone,
      balance: { raw: (BigInt(u.cents) * 10n ** 16n).toString(), formatted: fmt(u.cents) },
      kyc: kycStatus(phone),
      ownerAddress: u.ownerAddress,
      walletAddress: u.walletAddress,
      deployed: u.deployed,
    };
  },

  async health(): Promise<Health> {
    return {
      status: "ok",
      time: new Date().toISOString(),
      env: { factorySet: true, paymasterSet: true, tokenSet: true, smsSet: false, shortCodeSet: true, shortCode: SHORT_CODE, smsMode: "simulated", adminKeySet: false },
    };
  },

  async sms(opts = {}): Promise<SmsList> {
    return { mode: "simulated", messages: [...outbox].reverse().slice(0, opts.limit ?? 100) };
  },

  async verifyKyc(phoneNumber, opts): Promise<KycStatus> {
    await sleep(200);
    const phone = normalisePhone(phoneNumber);
    const u = users.get(phone);
    if (!u) throw new Error("not_registered");
    if (!u.idMasked) throw new Error("An ID number must be captured first (Level 0)");
    u.level = 1;
    u.method = opts.method;
    u.reference = opts.reference ?? null;
    const s = kycStatus(phone)!;
    sendSms(phone, SMS.kycComplete(limitSummary(s)), "kyc");
    return s;
  },
};

export function resetMock() {
  users.clear();
  idsInUse.clear();
  transfers.length = 0;
  outbox.length = 0;
}
