// Wallet helpers backed by the Express API. Session token + phone are
// persisted by AuthContext; these helpers just format requests and shape
// responses to the { phone, balance, kyc } objects the UI expects.
//
// The UI never shows blockchain details (addresses, hashes, networks): people
// only see ZAKA, Rand amounts, phone numbers and a reference number.

import { api, setToken } from './api';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// USSD code shown in copy ("works on any phone: dial …")
export const USSD_CODE = import.meta.env.VITE_USSD_CODE || '*384*123#';

export const zar = (n) =>
  'R' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// normalizePhone: converts any SA input to E.164 "+27XXXXXXXXX" for backend calls.
// Returns null if the input cannot be interpreted as a valid SA number.
export function normalizePhone(input) {
  const d = String(input || '').replace(/\D/g, '');
  // Local: 0821234567 → +27821234567
  if (/^0\d{9}$/.test(d)) return '+27' + d.slice(1);
  // Already has country code without +: 27821234567 → +27821234567
  if (/^27\d{9}$/.test(d)) return '+' + d;
  // Already E.164: +27821234567
  if (/^\+27\d{9}$/.test(input)) return input;
  return null;
}

// formatPhone: converts E.164 "+27821234567" to display format "082 123 4567"
export const formatPhone = (p) => {
  if (!p) return '';
  const local = p.startsWith('+27') ? '0' + p.slice(3) : p;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
};


// Parse the backend's "R1 234.56" into a JS number.
const parseZAR = (s) => Number(String(s || '0').replace(/[^\d.]/g, '')) || 0;

const shape = (payload) => ({
  phone: payload.phone || payload.phoneNumber,
  balance: parseZAR(payload.balance?.formatted),
  kyc: payload.kyc ?? null,
});

/** Level 1 = identity verified (Smile ID) — required to send from the web app */
export const isVerified = (wallet) => (wallet?.kyc?.level ?? -1) >= 1;

// Onboarding phone step: is this number already taken?
export async function findWalletByPhone(phone) {
  try {
    const res = await api(`/api/wallet/${encodeURIComponent(phone)}`);
    if (!res.registered) return null;
    return shape(res);
  } catch {
    return null;
  }
}

// Send flow recipient lookup: same call, different naming.
export const lookupRecipient = findWalletByPhone;

export async function createWallet(phone, pin) {
  const res = await api('/api/auth/register', {
    method: 'POST',
    body: { phone, pin },
  });
  setToken(res.token);
  return shape(res);
}

export async function loginWallet(phone, pin) {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { phone, pin },
  });
  setToken(res.token);
  return shape(res);
}

export async function logoutWallet() {
  try {
    await api('/api/auth/logout', { method: 'POST', auth: true });
  } catch {
    // Best-effort — clear the client session even if the server rejects the token.
  }
  setToken(null);
}

// Kept for backward compatibility with the UI. The mock accepted a wallet;
// we now just re-authenticate to verify the PIN.
export async function verifyPin(wallet, pin) {
  try {
    await loginWallet(wallet.phone, pin);
    return true;
  } catch {
    return false;
  }
}

export async function refreshWallet(phone) {
  const res = await api(`/api/wallet/${encodeURIComponent(phone)}`);
  return res.registered ? shape(res) : null;
}

// Returns the payment reference shown on the receipt
export async function claimFaucet(wallet, pin) {
  const res = await api('/api/tx/claim', {
    method: 'POST',
    auth: true,
    body: { pin, amountZAR: 100 },
  });
  return res.reference || '';
}

// Returns the payment reference shown on the receipt
export async function sendMoney(wallet, recipient, amount, pin) {
  const res = await api('/api/tx/send', {
    method: 'POST',
    auth: true,
    body: { recipientPhone: recipient.phone, amountZAR: amount, pin },
  });
  return res.reference || '';
}

// ── Identity verification (mock Smile ID) ───────────────────────────────────

/**
 * South African ID number check: 13 digits, real date of birth,
 * citizenship digit 0/1 and a valid Luhn check digit.
 */
export function isValidSaId(raw) {
  const id = String(raw || '').replace(/\s+/g, '');
  if (!/^\d{13}$/.test(id)) return false;
  const yy = +id.slice(0, 2), mm = +id.slice(2, 4), dd = +id.slice(4, 6);
  const year = yy <= new Date().getFullYear() % 100 ? 2000 + yy : 1900 + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return false;
  if (!['0', '1'].includes(id[10])) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let n = +id[12 - i];
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

/**
 * Submit the ID number (and, in a real integration, the selfie) for
 * verification. The backend mocks Smile ID's Biometric KYC and upgrades
 * the account to Level 1. Returns the new KYC status.
 */
export async function verifyIdentity(idNumber) {
  return api('/api/kyc/me/smile-id', {
    method: 'POST',
    auth: true,
    body: { idNumber: String(idNumber).replace(/\s+/g, '') },
  });
}

/** Cents → "R25 000" for limit copy */
export const zarShort = (cents) => zar(Number(cents || 0) / 100).replace(/\.00$/, '');
