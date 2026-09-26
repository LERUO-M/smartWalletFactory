// Small shared helpers: ids, storage, phone formatting, money formatting.

export const uid = (prefix = "") =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function newSessionId() {
  // Africa's Talking style: ATUid_<hex>
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "ATUid_" + hex;
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable – settings just won't persist */
  }
}

/** Same rules as the backend's normalisePhone() */
export function normalisePhone(phone: string): string {
  let p = phone.replace(/\s+/g, "").replace(/[^+\d]/g, "");
  if (p.startsWith("0") && p.length === 10) return "+27" + p.slice(1);
  if (p.startsWith("27") && !p.startsWith("+")) return "+" + p;
  return p;
}

export const digitsOnly = (phone: string) => phone.replace(/\D/g, "");

/** SA network by prefix – only used for the phone's home screen label */
export function networkFor(e164: string): string {
  const local = "0" + digitsOnly(e164).replace(/^27/, "");
  const p3 = local.slice(0, 3);
  if (["082", "072", "076", "079", "060", "066", "071"].includes(p3)) return "Vodacom";
  if (["083", "073", "078", "063", "081"].includes(p3)) return p3 === "081" ? "Telkom" : "MTN SA";
  if (["084", "074", "061", "062"].includes(p3)) return "Cell C";
  return "MTN SA";
}

export function prettyPhone(e164: string) {
  const d = digitsOnly(e164);
  if (d.startsWith("27") && d.length === 11)
    return `+27 ${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return e164;
}

/** Wei-style raw (18 decimals) → rand number */
export function rawToRand(raw: string | undefined, formatted?: string): number {
  if (raw) {
    try {
      const cents = BigInt(raw) / 10n ** 16n;
      return Number(cents) / 100;
    } catch {
      /* fall through */
    }
  }
  const n = parseFloat((formatted ?? "").replace(/[^\d.]/g, ""));
  return isNaN(n) ? 0 : n;
}

const zar = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 1234.56 → "R 1,234.56" */
export const formatRand = (n: number) => `R ${zar.format(n)}`;

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export function timeHMS(ts: number) {
  const d = new Date(ts);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** ULID (https://github.com/ulid/spec): 10 chars of time + 16 random, Crockford base32 */
export function ulid(ms = Date.now()) {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let t = Math.floor(ms);
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = A[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => A[b % 32]).join("");
  return time + rnd;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
