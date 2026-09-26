// Wallet helpers backed by the Express API. Session token + phone are
// persisted by AuthContext; these helpers just format requests and shape
// responses to the {phone, address, balance, deployed} objects the UI expects.

import { api, setToken } from './api';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const shortAddr = (a, s = 8, e = 6) => (a ? `${a.slice(0, s)}...${a.slice(-e)}` : '');

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
  phone: payload.phone,
  address: payload.walletAddress,
  ownerAddress: payload.ownerAddress,
  deployed: payload.deployed,
  balance: parseZAR(payload.balance?.formatted),
  balanceRaw: payload.balance?.raw,
});

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

// No-op — the on-chain welcome bonus is claimed via /claim once the user opts in.
export async function sendWelcomeBonus() {}

export async function claimFaucet(wallet, pin) {
  const res = await api('/api/tx/claim', {
    method: 'POST',
    auth: true,
    body: { pin, amountZAR: 100 },
  });
  return res.userOpHash;
}

export async function sendMoney(wallet, recipient, amount, pin) {
  const res = await api('/api/tx/send', {
    method: 'POST',
    auth: true,
    body: { recipientPhone: recipient.phone, amountZAR: amount, pin },
  });
  return res.userOpHash;
}
