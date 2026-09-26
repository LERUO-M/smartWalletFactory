// Fully static mock wallet layer — no database calls anywhere.

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const randomHex = (bytes) =>
  '0x' + Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

export const shortAddr = (a, s = 8, e = 6) => (a ? `${a.slice(0, s)}...${a.slice(-e)}` : '');

export const zar = (n) =>
  'R' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function normalizePhone(input) {
  const d = String(input).replace(/\D/g, '');
  const local = d.startsWith('27') && d.length === 11 ? '0' + d.slice(2) : d;
  return /^0\d{9}$/.test(local) ? local : null;
}

export const formatPhone = (p) => (p ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : '');

export const MOCK_WALLET = {
  id: 'mock-wallet-1',
  phone: '0721234567',
  address: '0x95e079ab3f5c2d14e0a8b7c6f9d8e1a2b3c4d5e6',
  pin_hash: 'mock',
  balance: 100,
  deployed: true,
};

export const refreshWallet = () => {};

export async function findWalletByPhone(phone) {
  await wait(400);
  return { id: 'mock-recipient', phone, address: randomHex(20), balance: 0, deployed: true };
}

export async function createWallet(phone, pin) {
  await wait(800);
  return { ...MOCK_WALLET, phone, pin_hash: 'mock' };
}

export const verifyPin = async () => true;

export async function sendWelcomeBonus() {
  await wait(600);
}

export async function claimFaucet() {
  await wait(1600);
  return randomHex(32);
}

export async function sendMoney() {
  await wait(1600);
  return randomHex(32);
}
