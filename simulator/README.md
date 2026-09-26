# ZAKA USSD Simulator

A browser stand-in for Africa's Talking. Feature phones dial a USSD code, the simulator
POSTs to the backend's `/ussd` webhook exactly like AT does, and shows every
request/response and the phone's on-chain wallet alongside.

## Run it

```bash
cd simulator
npm install
npm run dev          # http://localhost:5173
```

Start the backend too (`cd backend && npm start`). The default backend URL is
`http://localhost:3000`. You can paste an ngrok `https://…ngrok-free.app` URL in the top bar;
the simulator then sends the `ngrok-skip-browser-warning` header for you.

**No install?** `standalone.html` is a prebuilt, single-file copy. Open it directly in a
browser. You can also copy it to `backend/public/index.html` so the backend serves it at
`http://localhost:3000` (`server.js` already serves `public/`).

## What talks to what

| Call | Used for |
| --- | --- |
| `POST {base}/ussd`: JSON `{ sessionId, serviceCode, phoneNumber, text }` → plain text `CON …` / `END …` | every keypress that sends |
| `GET {base}/api/wallet/{digits}` | wallet panel: when a session ends, on Refresh, and every 10s while the tab is visible |
| `GET {base}/api/health` | status dot and config chips (Wallets / Fees / ZAKA / SMS), every 15s |
| `GET {base}/api/sms?limit=100` | SMS inbox on each phone + the inspector's SMS tab, every 3s |
| `POST {base}/api/kyc/{digits}/verify` | the account panel's **Validate** button (merchant / website KYC → Level 1) |

All backend calls live in `src/api/index.ts`. `src/api/mock.ts` is the in-browser fake
behind **Mock mode**, and it implements the same `Backend` interface.

- `text` is every input from this session joined with `*`. The first request is `""`.
- The client reads replies with `response.text()`. It never parses them as JSON.
- A network error, a non-200 status, a reply that doesn't start with `CON`/`END`, or no
  reply within 30s ends the session with "Connection problem or invalid MMI code."

## Using it

- **Phones**: click a phone (or Tab to it) and type on your keyboard. Digits, `*`, `#` type;
  Enter = call / Send / OK; Esc = end / Cancel; Backspace = clear; ↑/↓ scroll long menus;
  ←/→ = the soft keys.
- **Add phone** adds another handset with its own number. Nicknames and numbers are editable
  (`082…`, `27…` and `+27…` are all accepted). Phones are saved in localStorage.
- **Inspector**: shows each request with its `text`, raw reply, CON/END/ERR badge and
  latency. Local events such as cancels and idle timeouts get a LOCAL badge. Expand an entry
  for the JSON body and **Copy as cURL**. When a prompt mentions "PIN", the input that answers
  it is masked as `••••` everywhere on screen. The copied cURL command keeps the real
  value so you can replay it.
- **SMS**: when the backend texts a number that belongs to one of the phones, the phone beeps
  and shows "1 new message". Press the left soft key (**Read**) to open it; **Older** / **Back**
  page through the inbox. The inspector's **SMS** tab lists every SMS the backend sent, with
  Africa's Talking status, message id and cost.
- **Account panel**: balance, KYC level, and progress bars for today's and this month's sending
  limits. **Validate** plays the merchant/website and upgrades the person to Level 1 (set the
  admin key in Settings if the backend has `ADMIN_API_KEY`). Chain addresses are hidden unless
  you turn on *Show developer chain details* in Settings.
- **Masking**: inputs that answer a prompt mentioning "PIN" show as `••••`; SA ID numbers show as
  `900101•••••86`.
- **Scenarios**: scripted input lists replayed at about 600ms per step, with an optional
  "final screen contains" check. Each line is one step, and the first step must be `dial`
  (or `dial *120*55#`). Scenarios are stored in localStorage and can be imported and
  exported as JSON.
- **Settings** (sliders icon): the service code used by scenarios, and the idle timeout
  (default 60s, 0 = off).

## Files

```
src/api/index.ts        real backend + cURL + CON/END parser
src/api/mock.ts         fake backend for Mock mode
src/store.tsx           settings, phones, logs, wallet cache, scenarios
src/components/Phone.tsx       the handset and the USSD session engine
src/components/Inspector.tsx   request log + breadcrumbs
src/components/WalletPanel.tsx balance, addresses, deployed badge
src/components/Scenarios.tsx   scenario runner drawer
src/components/TopBar.tsx      URL, health, mock toggle, theme, sound
```
