# ZAKA Backend

> Express server that runs the ZAKA USSD menu (an Africa's Talking-compatible webhook), sends SMS
> through Africa's Talking, enforces tiered KYC limits, and submits gasless ERC-4337 transfers
> on Sepolia. It also serves the REST API used by the web wallet (`frontend/`) and the USSD
> simulator (`simulator/`).

Users only ever see ZAKA, Rand amounts and phone numbers. Wallet addresses, gas and
blockchains never appear on USSD, SMS or in the web app.

---

## Quick start

```bash
cd backend
npm install                 # Node 20+ (better-sqlite3 v12)
cp .env.example .env        # fill in the values below
npm start                   # or: npm run dev (auto-restart)
curl http://localhost:3000/api/health
```

To reach it from Africa's Talking or a real phone during development, run `npx ngrok http 3000`
and use `https://<id>.ngrok-free.app/ussd` as the USSD callback URL.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `RPC_URL` | ✅ | Sepolia RPC |
| `BUNDLER_RPC_URL` | ✅ | ERC-4337 bundler (Pimlico, Alchemy, Stackup) |
| `ENTRY_POINT_ADDRESS` | ✅ | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` (v0.6) |
| `FACTORY_ADDRESS`, `PAYMASTER_ADDRESS`, `ZAR_TOKEN_ADDRESS` | ✅ | From `scripts/deploy.js` |
| `PAYMASTER_SIGNER_PRIVATE_KEY` | ✅ | Must match the paymaster's `verifyingSigner` |
| `KEY_ENCRYPTION_SECRET` | ✅ | 64 hex chars. **Never change it once users exist**: stored keys can't be decrypted without it |
| `JWT_SECRET` | ✅ | Signs web-app session tokens |
| `ADMIN_API_KEY` | recommended | Protects the admin endpoints marked * below |
| `AT_USERNAME`, `AT_API_KEY`, `SHORT_CODE` | optional | Africa's Talking SMS. Without them every SMS is stored as *simulated* |
| `AT_SMS_KEYWORD`, `AT_SMS_BULK_MODE`, `AT_SMS_RETRY_HOURS` | optional | Premium SMS settings |
| `KYC_L0_DAILY_LIMIT`, `KYC_L0_MONTHLY_LIMIT`, `KYC_L1_DAILY_LIMIT`, `KYC_L1_MONTHLY_LIMIT` | optional | Whole Rands. Defaults: 500 / 10,000 / 25,000 / 100,000 |
| `USSD_RESUME_MINUTES` | optional | How long a dropped send can be resumed. Default 5, `0` = off |
| `USSD_SERVICE_CODE` | optional | Only if your gateway puts shortcut digits in `serviceCode` instead of `text` |
| `FICA_SYNC`, `FICA_REGISTRY_ADDRESS`, `FICA_OPERATOR_PRIVATE_KEY` | optional | Also write Level 1 approvals to the on-chain `FICARegistry` |
| `PORT` | optional | Default 3000. Railway sets it for you |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Database

SQLite through `better-sqlite3`, stored at `backend/data/users.db` (created on first start,
git-ignored). Tables: `users` (PIN hash, encrypted owner key, KYC level, masked ID),
`transfers` (every value movement, with a ULID reference) and `sms_outbox` (every SMS sent or
simulated). New columns are added automatically when an older database is opened.

This file holds the encrypted private keys of every wallet. In production, keep it on a
persistent, backed-up disk. Losing it means losing access to those wallets.

## Deploy (Railway)

1. New service from this repo, **Root Directory** `backend`, **Start Command** `npm start`.
2. **Attach a volume** mounted at **`/app/data`** (that's where `db.js` writes).
3. Add the environment variables above (not `PORT`), plus `NODE_ENV=production`.
4. Generate a public domain, then check `https://<domain>/api/health`.
5. In Africa's Talking, set the USSD callback to `https://<domain>/ussd` and the SMS delivery
   report URL to `https://<domain>/api/sms/delivery`.

Keep the paymaster's EntryPoint deposit topped up (`npx hardhat run scripts/stakePaymaster.js
--network sepolia` from the repo root), or every transfer fails.

---

## USSD menu

```
Dial *384*123#
│
├── NEW USER → "Hello from ZAKA!"
│   PIN → confirm PIN → 13-digit SA ID number (KYC Level 0)
│   → "Wallet created for +27…" + R100 welcome bonus (sent in the background, SMS on arrival)
│
└── REGISTERED USER → ZAKA
    ├── 1. Check Balance
    ├── 2. Send ZAKA        recipient → amount (limit + balance check) → PIN
    │                       → instant reply with a ULID reference; the transfer is submitted
    │                         in the background and both people get an SMS
    ├── 3. Claim R100 Demo ZAKA   PIN
    └── 4. My Account       level, limits, add ID number, how to unlock more
```

- **Shortcuts:** `*384*123*2*0831234567*50#` lands on the PIN screen, `*384*123*1#` shows the
  balance, `*384*123*4#` opens My Account. A PIN in the dial code is refused, because it would stay in
  the call log.
- **Resume:** if a send drops after the recipient or amount step, redialling within
  `USSD_RESUME_MINUTES` offers "Continue sending R50.00 to 0831234567? 1. Yes 2. No". Progress
  is saved against the phone number, never the PIN.
- **Never waits for the chain:** the transfer is saved as *pending* and the reply goes out at
  once. Pending transfers count toward limits and the available balance, so a second send
  can't overspend while the first is in flight.

## KYC tiers

| Level | How you get it | Daily | Monthly |
|---|---|---|---|
| none | Registered before KYC existed | can't send | can't send |
| **0** | SA ID number entered on USSD (format, date of birth and checksum validated) | R500 | R10,000 |
| **1** | Validated at a merchant, on the website, or through the web app's identity check | R25,000 | R100,000 |

Only successful and pending outgoing transfers count. Days and months run on South African time.
The raw ID number is never stored: only a keyed hash (so one ID can't register two phones) and
a masked copy such as `900101•••••86`.

The web app's identity check (`POST /api/kyc/me/smile-id`) is a **mock of Smile ID Biometric
KYC**: it validates the ID number and upgrades to Level 1, and the selfie is never uploaded.

## SMS

Sent from `SHORT_CODE` through Africa's Talking, or stored as *simulated* when AT isn't
configured (the simulator still shows them on the phones).

| When | Message |
|---|---|
| Money received | ZAKA notification: you have received R50.00 from +27821234567. |
| Transfer succeeded (to sender) | ZAKA: you have sent R50.00 to 0831234567. Ref: 01J8ZK3V9Q7W2R5T6Y8B4N1M0C |
| Transfer failed (to sender) | ZAKA: your transfer of R50.00 to 0831234567 could not be completed. No money was sent. Ref: … |
| Welcome bonus arrived | From ZAKA: we have sent you some ZAKA as a welcome bonus! Check your balance! |
| Level 0 limit reached, registration, or My Account → 1 | how to unlock more (at most once an hour per phone) |
| Validation completed | From ZAKA: your ZAKA validation is complete. You can now send up to R25,000/day, R100,000/month. |

## Endpoints

| Method | Path | What it does |
|---|---|---|
| `POST` | `/ussd` | Africa's Talking USSD webhook (form or JSON body; plain-text `CON`/`END` reply) |
| `GET` | `/api/health` | Health plus which contracts and SMS mode are configured |
| `GET` | `/api/wallet/:phone` | Balance, wallet status and a `kyc` object |
| `GET` | `/api/transactions/:phone` | Recent transfers in and out |
| `POST` | `/api/auth/register` | Web sign-up `{ phone, pin, idNumber? }` → JWT |
| `POST` | `/api/auth/login` | Web login `{ phone, pin }` → JWT |
| `POST` | `/api/tx/send` | Web send (JWT). `403` with `kyc_required`, `kyc_level1_required` or `limit_exceeded` |
| `POST` | `/api/tx/claim` | Web demo-ZAKA claim (JWT) |
| `GET` | `/api/kyc/tiers` | Tier table and limits |
| `GET` | `/api/kyc/:phone` | Level, limits, amount sent today and this month |
| `POST` | `/api/kyc/:phone/id` * | Capture an ID number (Level 0) `{ idNumber }` |
| `POST` | `/api/kyc/:phone/verify` * | Complete validation (Level 1) `{ method: "merchant"\|"web", reference }` |
| `POST` | `/api/kyc/me/smile-id` | Web identity check, mock Smile ID (JWT) `{ idNumber }` |
| `GET` | `/api/sms?phone=&limit=` | SMS log, newest first |
| `POST` | `/api/sms/send` * | One-off test SMS `{ to, message }` |
| `POST` | `/api/sms/delivery` | Africa's Talking delivery report callback |

\* Needs the header `x-admin-key: <ADMIN_API_KEY>` when `ADMIN_API_KEY` is set.

## Files

```
backend/
├── server.js                    Express entry point, route mounting, startup config check
├── db.js                        SQLite schema + migrations
├── routes/
│   ├── ussd.js                  USSD menu state machine
│   ├── api.js                   health, wallet, web auth, web send/claim, transactions
│   ├── auth.js, transactions.js older web auth / tx routes (shadowed by api.js)
│   ├── kyc.js                   tiers, levels, mock Smile ID
│   └── sms.js                   SMS log, test send, delivery reports
├── services/
│   ├── authService.js           PIN hashing, key encryption, registration
│   ├── walletService.js         CREATE2 addresses, balances, calldata
│   ├── userOpService.js         UserOp builder, paymaster signature, bundler
│   ├── transferService.js       background transfer submission + SMS
│   ├── kycService.js            tiers, limits, ID hashing, transfer records
│   ├── smsService.js            Africa's Talking client + message templates
│   ├── ussdSessionService.js    shortcut dialling + resuming dropped sessions
│   └── ficaSync.js              optional on-chain FICARegistry sync
└── lib/                         phone normalising, JWT, admin auth, ULID
```

## Security notes

| Concern | How it's handled today |
|---|---|
| PIN | bcrypt-hashed; never sent by SMS, never accepted in a dial code, masked in the simulator |
| Private keys | AES-256-GCM, key derived with HKDF from `KEY_ENCRYPTION_SECRET` + phone + PIN. A key can only be decrypted with the right PIN |
| ID numbers | Only a keyed hash and a masked copy are stored |
| Gas | Sponsored by `ZARPaymaster`. Users hold no ETH |
| Exposure after a compromise | Capped by the KYC tier (Level 0: R500/day) |
| Not built yet | SIM-swap checks, double-send keys, PIN reset. See "Security and reliability design" in the root README |
| Production | Move key handling to a KMS/HSM and SQLite to a managed database |

Wallets are created with no guardians, so the contract's social recovery isn't used by ZAKA
accounts yet.
