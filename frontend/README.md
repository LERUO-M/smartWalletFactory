# ZAKA Web Wallet

Vite + React + Tailwind web app: a marketing landing page and a phone-shell wallet that talks
to the ZAKA backend. It never shows blockchain details. People see their phone number, balance,
verification status and a reference number for each payment.

## Run it

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL, optional VITE_USSD_CODE
npm run dev            # http://localhost:5173 (use another port if the simulator is running)
```

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | Backend URL, no trailing slash |
| `VITE_USSD_CODE` | `*384*123#` | Shown wherever the app mentions the USSD code |

Both are read when the app is **built**, so redeploy after changing them.

## Deploy (Railway)

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Start Command | `npm start` (`serve -s dist`, which sends every route to `index.html` so deep links work) |
| Variables | `VITE_API_URL=https://<backend-domain>` |

## Pages

| Route | Page |
|---|---|
| `/` | Landing page |
| `/onboarding` | Sign up: phone → PIN → wallet created |
| `/login` | Log in with phone + PIN |
| `/app` | Dashboard: balance, actions, "Verify your identity" card |
| `/balance` | Balance |
| `/send` | Send money (needs Level 1) |
| `/claim` | Claim demo ZAKA |
| `/receive` | Your phone number and a QR code of it (`/address` redirects here) |
| `/verify` | Identity check: ID number → selfie → checks → verified. A **mock of Smile ID Biometric KYC**; the selfie is never uploaded |
| `/export` | Export every page to a PDF |

**Sending from the web app requires Level 1.** `POST /api/tx/send` returns `403` with
`code: "kyc_level1_required"` until the person completes `/verify`. Receiving money and claiming
demo ZAKA work without it.

## Layout

```
src/
├── App.jsx                 routes
├── lib/api.js              backend client (VITE_API_URL)
├── lib/AuthContext.jsx     JWT session
├── lib/wallet.js           formatting, USSD code
├── pages/                  one file per route
└── components/
    ├── landing/            landing page sections
    └── zaka/               phone shell, PIN pad, dashboard, send flow, KYC card
```

`handoff.md` is the original design brief, written when the app ran on mock data only. It
doesn't describe the current backend integration.
