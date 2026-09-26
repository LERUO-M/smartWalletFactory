// ─────────────────────────────────────────────────────────────────────────────
// The one place the simulator talks to a backend.
// Real and mock backends share the `Backend` interface, so the UI never knows
// (or cares) which one it is talking to.
// ─────────────────────────────────────────────────────────────────────────────

import type { Backend, Health, UssdRequest, UssdResult, WalletInfo } from "../types";
import { digitsOnly } from "../lib/util";
import { mockBackend } from "./mock";

export const USSD_TIMEOUT_MS = 30_000;

const trimBase = (base: string) => base.trim().replace(/\/+$/, "");

/** ngrok's free tier shows an HTML interstitial unless this header is sent */
function extraHeaders(base: string): Record<string, string> {
  return /ngrok/i.test(base) ? { "ngrok-skip-browser-warning": "true" } : {};
}

export function realBackend(baseUrl: string): Backend {
  const base = trimBase(baseUrl);

  return {
    kind: "real",

    async ussd(req: UssdRequest, signal?: AbortSignal): Promise<UssdResult> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort("timeout"), USSD_TIMEOUT_MS);
      const onOuterAbort = () => ctrl.abort("cancelled");
      signal?.addEventListener("abort", onOuterAbort);
      const t0 = performance.now();
      try {
        const res = await fetch(`${base}/ussd`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...extraHeaders(base) },
          body: JSON.stringify(req),
          signal: ctrl.signal,
        });
        // Africa's Talking replies are plain text – never .json()
        const raw = await res.text();
        const ms = Math.round(performance.now() - t0);
        if (!res.ok) return { ok: false, status: res.status, raw, ms, error: `HTTP ${res.status}` };
        return { ok: true, status: res.status, raw, ms };
      } catch (err) {
        const ms = Math.round(performance.now() - t0);
        const reason = ctrl.signal.aborted ? String(ctrl.signal.reason) : "";
        const error =
          reason === "timeout"
            ? `Timed out after ${USSD_TIMEOUT_MS / 1000}s`
            : reason === "cancelled"
              ? "Cancelled by user"
              : `Network error: ${(err as Error).message}`;
        return { ok: false, status: 0, raw: "", ms, error };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onOuterAbort);
      }
    },

    async wallet(phoneNumber: string): Promise<WalletInfo> {
      const res = await fetch(`${base}/api/wallet/${digitsOnly(phoneNumber)}`, {
        headers: extraHeaders(base),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          msg = (await res.json()).error ?? msg;
        } catch {
          /* not json */
        }
        throw new Error(msg);
      }
      return res.json();
    },

    async health(): Promise<Health> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5_000);
      try {
        const res = await fetch(`${base}/api/health`, { headers: extraHeaders(base), signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function getBackend(opts: { mock: boolean; baseUrl: string }): Backend {
  return opts.mock ? mockBackend : realBackend(opts.baseUrl);
}

/** For the inspector's "Copy as cURL" */
export function toCurl(baseUrl: string, body: UssdRequest) {
  const base = trimBase(baseUrl);
  const json = JSON.stringify(body).replace(/'/g, `'\\''`);
  const ngrok = /ngrok/i.test(base) ? ` \\\n  -H 'ngrok-skip-browser-warning: true'` : "";
  return `curl -X POST '${base}/ussd' \\\n  -H 'Content-Type: application/json'${ngrok} \\\n  -d '${json}'`;
}

/** Parse an Africa's Talking style reply */
export function parseUssd(raw: string): { kind: "CON" | "END"; body: string } | null {
  const m = /^(CON|END)(?: |\n|$)([\s\S]*)$/.exec(raw.replace(/^﻿/, ""));
  if (!m) return null;
  return { kind: m[1] as "CON" | "END", body: m[2].replace(/\r\n/g, "\n") };
}
