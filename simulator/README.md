# ZAKA USSD Simulator

A browser stand-in for Africa's Talking. Feature phones dial a USSD code, the simulator
POSTs to the backend's `/ussd` webhook exactly like Africa's Talking does, and shows every SMS
the backend sends, plus each phone's balance and KYC limits.

The page is just the phones, centered, with an account panel underneath and a Scenarios drawer. There is no
settings bar: the backend URL is fixed when the app is built.

## Run it

```bash
cd simulator
npm install
npm run dev          # http://localhost:5173
```

Start the backend too (`cd backend && npm start`). The simulator talks to
`http://localhost:3000` unless you set `VITE_API_URL`:

```bash
VITE_API_URL=https://your-backend.example.com npm run dev
```

If the URL contains `ngrok`, the simulator sends the `ngrok-skip-browser-warning` header for you.

## Deploy it (Railway)

| Setting | Value |
|---|---|
| Root Directory | `simulator` |
| Build Command | `npm run build` (type-checks first) |
| Start Command | `npm start` (serves `dist/` with `serve` on Railway's `PORT`) |
| Variables | `VITE_API_URL=https://<backend-domain>` (no trailing slash) |

`VITE_API_URL` is read when the app is **built**, so redeploy after changing it.

## What talks to what

| Call | Used for |
| --- | --- |
| `POST {base}/ussd`: JSON `{ sessionId, serviceCode, phoneNumber, text }` → plain text `CON …` / `END …` | every keypress that sends |
| `GET {base}/api/wallet/{digits}` | account panel: when a session ends, on Refresh, and every 10s while the tab is visible |
| `GET {base}/api/sms?limit=100` | SMS inbox on each phone, every 3s |
| `POST {base}/api/kyc/{digits}/verify` | the account panel's **Validate** button (merchant / website KYC → Level 1) |

All backend calls live in `src/api/index.ts`.

- `text` is every input from this session joined with `*`. The first request is `""`.
- Replies are read with `response.text()`, never parsed as JSON.
- A network error, a non-200 status, a reply that doesn't start with `CON`/`END`, or no
  reply within 30s ends the session with "Connection problem or invalid MMI code."

## Using it

- **Phones:** click a phone (or Tab to it) and type on your keyboard. Digits, `*`, `#` type;
  Enter = call / Send / OK; Esc = end / Cancel; Backspace = clear; ↑/↓ scroll long menus;
  ←/→ = the soft keys.
- **Add phone** adds another handset with its own number. Nicknames and numbers are editable
  (`082…`, `27…` and `+27…` are all accepted). Phones are saved in localStorage.
- **SMS:** when the backend texts a number that belongs to one of the phones, the phone beeps
  and shows "1 new message". Press the left soft key (**Read**) to open it; **Older** / **Back**
  page through the inbox.
- **Account panel:** balance, KYC level, and progress bars for today's and this month's sending
  limits. **Validate** plays the merchant or website and upgrades the person to Level 1. The
  simulator no longer has an admin-key setting, so Validate only works when the backend has no
  `ADMIN_API_KEY` set.
- **Shortcut dialling:** dial `*384*123*2*0831234567*50#` and the simulator sends it the way
  Africa's Talking does (serviceCode `*384*123#`, first `text` `2*0831234567*50`), so you land
  on the PIN screen.
- **Resuming:** press Esc/red key mid-send, then redial: the backend offers
  "Continue sending R50.00 to 0831234567? 1. Yes 2. No".
- **Masking:** inputs that answer a prompt mentioning "PIN" show as `••••`; SA ID numbers show as
  `900101•••••86`.
- **Scenarios** (button next to "Add phone"): scripted inputs replayed on a phone at about 600ms
  per step, with an optional "final screen contains" check. Pick the phone under "Run on" first.
  Each line is one step, and the first must be `dial` (or `dial *120*55#`). Scenarios are saved in
  localStorage and can be imported and exported as JSON. **Reset** restores the built-in set.
- **Light / Dark** (next to Scenarios) switches the theme. The choice is saved in this browser.
- Idle sessions end after 60 seconds, like a real network.

**Test SA ID numbers** (valid format and checksum, not real people): `9001015009086`,
`8505055800080`, `9503120123082`.

## Files

```
src/App.tsx                    page layout (phones + account panel)
src/api/index.ts               real backend client + CON/END parser
src/api/mock.ts                in-browser fake backend (no longer reachable from the UI)
src/store.tsx                  settings, phones, wallet cache, SMS polling
src/components/Phone.tsx       the handset and the USSD session engine
src/components/WalletPanel.tsx balance, KYC level and limits, Validate
src/components/Scenarios.tsx   scenario runner drawer
standalone.html                older prebuilt single-file build (still has the top bar and Mock mode)
```
