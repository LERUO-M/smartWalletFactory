// ─────────────────────────────────────────────────────────────────────────────
// In-browser fake backend. Mirrors backend/routes/ussd.js closely enough to
// demo the UI without a server. State is in memory only (reload = fresh).
// ─────────────────────────────────────────────────────────────────────────────

import type { Backend, Health, UssdRequest, UssdResult, WalletInfo } from "../types";
import { normalisePhone, sleep } from "../lib/util";

interface MockUser {
  pin: string;
  ownerAddress: string;
  walletAddress: string;
  cents: number;
  deployed: boolean;
}

const users = new Map<string, MockUser>();

/** Deterministic fake 20-byte address from a seed (not a real key!) */
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

const fmt = (cents: number) => `R${(cents / 100).toFixed(2)}`;
const fakeHash = () =>
  "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
const latency = () => sleep(250 + Math.random() * 550);

function handle(phone: string, inputs: string[]): string {
  const user = users.get(phone);

  // ── Registration ──────────────────────────────────────────────────────────
  if (!user) {
    if (inputs.length === 0)
      return `CON Welcome to ZAR Smart Wallet!\nNo bank account needed. You only need this phone.\n\nCreate a 4-digit PIN to secure your wallet:`;
    if (inputs.length === 1) {
      if (!/^\d{4,6}$/.test(inputs[0])) return `CON Invalid PIN. Please enter 4-6 digits:`;
      return `CON Confirm your PIN:\n(Enter the same PIN again)`;
    }
    if (inputs.length === 2) {
      const [pin, confirm] = inputs;
      if (!/^\d{4,6}$/.test(pin)) return `END Invalid PIN. Please dial again.`;
      if (pin !== confirm) return `END PINs do not match.\nPlease dial again to try again.`;
      const ownerAddress = fakeAddress("owner" + phone);
      const walletAddress = fakeAddress("wallet" + phone);
      const u: MockUser = { pin, ownerAddress, walletAddress, cents: 0, deployed: false };
      users.set(phone, u);
      // Welcome bonus lands a few seconds later, like the real background UserOp
      setTimeout(() => {
        u.cents += 10_000;
        u.deployed = true;
      }, 4_000);
      return `END Wallet created!\nYour wallet: ${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}\n\nWe are sending you a R100 welcome bonus.\nDial again to check your balance!`;
    }
    return "END Invalid input. Please dial again.";
  }

  // ── Main menu ─────────────────────────────────────────────────────────────
  if (inputs.length === 0)
    return `CON ZAR Smart Wallet\n1. Check Balance\n2. Send Money\n3. Claim R100 Demo Funds\n4. My Wallet Address`;

  const [choice] = inputs;

  if (choice === "1")
    return `END ZAR Wallet Balance: ${fmt(user.cents)}\n${user.deployed ? "Wallet is active on-chain." : "Wallet activates on first transaction."}\nAddr: ${user.walletAddress.slice(0, 8)}...`;

  if (choice === "2") {
    if (inputs.length === 1) return `CON Enter recipient phone number:\n(e.g. 0821234567 or +27821234567)`;
    if (inputs.length === 2) return `CON Enter amount in ZAR (whole number):\n(e.g. 25)`;
    const amount = parseFloat(inputs[2]);
    if (isNaN(amount) || amount <= 0) return `END Invalid amount. Please dial again.`;
    if (inputs.length === 3) return `CON Send R${amount.toFixed(2)} to ${inputs[1]}?\n\nEnter your 4-digit PIN to confirm:`;
    if (inputs.length === 4) {
      if (inputs[3] !== user.pin) return `END Incorrect PIN. Transaction cancelled.`;
      const cents = Math.round(amount * 100);
      if (user.cents < cents)
        return `END Insufficient balance.\nYour balance: ${fmt(user.cents)}\nYou tried to send: ${fmt(cents)}`;
      const to = users.get(normalisePhone(inputs[1]));
      if (!to)
        return `END Recipient ${normalisePhone(inputs[1])} has not registered yet.\nAsk them to dial *384# to create their wallet first.`;
      user.cents -= cents;
      to.cents += cents;
      user.deployed = true;
      const h = fakeHash();
      return `END Sent R${amount.toFixed(2)} to ${inputs[1]}!\n\nGas sponsored by ZARPaymaster.\nTx: ${h.slice(0, 12)}...\nTrack: jiffyscan.xyz/userOpHash/${h}`;
    }
    return "END Invalid input. Please dial again.";
  }

  if (choice === "3") {
    if (inputs.length === 1) return `CON Claim R100 demo ZAR to your wallet.\n\nEnter your 4-digit PIN to confirm:`;
    if (inputs.length === 2) {
      if (inputs[1] !== user.pin) return `END Incorrect PIN. Please dial again.`;
      user.cents += 10_000;
      user.deployed = true;
      return `END R100 ZAR claimed!\n\nGas sponsored by ZARPaymaster.\nTx: ${fakeHash().slice(0, 12)}...\nCheck balance by dialing *384# again.`;
    }
    return "END Invalid input. Please dial again.";
  }

  if (choice === "4")
    return `END Your ZAR Wallet Address:\n${user.walletAddress}\n\nShare this address or your phone number to receive ZAR.`;

  return `END Invalid option. Please dial again.`;
}

export const mockBackend: Backend = {
  kind: "mock",

  async ussd(req: UssdRequest, signal?: AbortSignal): Promise<UssdResult> {
    const t0 = performance.now();
    await latency();
    if (signal?.aborted) return { ok: false, status: 0, raw: "", ms: 0, error: "Cancelled by user" };
    const inputs = req.text === "" ? [] : req.text.split("*");
    const raw = handle(normalisePhone(req.phoneNumber), inputs);
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
      ownerAddress: u.ownerAddress,
      walletAddress: u.walletAddress,
      balance: { raw: (BigInt(u.cents) * 10n ** 16n).toString(), formatted: fmt(u.cents) },
      deployed: u.deployed,
    };
  },

  async health(): Promise<Health> {
    return { status: "ok", time: new Date().toISOString(), env: { factorySet: true, paymasterSet: true, tokenSet: true } };
  },
};

export function resetMock() {
  users.clear();
}
