# SA Smart Wallet Factory — Setup Guide

This is an ERC-4337 Account Abstraction project with smart contracts (Hardhat/Solidity) and an Express.js backend. It deploys to Ethereum Sepolia testnet. It also includes a **USSD simulator**, a web app that stands in for Africa's Talking during development (in `simulator/`).

---

## Just want to see the USSD flow? (2 minutes, no blockchain setup)

Open `simulator/standalone.html` directly in your browser. It's an older single-file build of the simulator that still has **Mock mode**, a fake backend built in:

1. Turn on **Mock mode** in the top bar. A gold banner confirms it's on.
2. Click the first phone, type `*384*123#` and press the green key (or Enter).
3. Create a 4-digit PIN (e.g. `1234`), confirm it, then enter a test SA ID number such as `9001015009086`. Dial again to see the main menu.

The current simulator (`npm run dev` in `simulator/`) always talks to a real backend. To run against the real backend and Sepolia, follow Steps 1–8 below.

---

## Prerequisites

- **Node.js** >= 20
- **npm**
- **Git**
- A **Sepolia RPC endpoint** (free tier from [Alchemy](https://alchemy.com) or Infura)
- A **bundler RPC endpoint** (free tier from Stackup, Pimlico, or Alchemy)
- A wallet with **Sepolia ETH** for deployment (~0.1 ETH — get from a faucet)
- An **Etherscan API key** (optional, for contract verification)

---

## Step 1 — Install root dependencies

```bash
cd smartWalletFactory
npm install
```

---

## Step 2 — Configure root environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `SEPOLIA_RPC_URL` | Alchemy/Infura dashboard |
| `DEPLOYER_PRIVATE_KEY` | Your wallet private key (no `0x` prefix) |
| `PAYMASTER_SIGNER_PRIVATE_KEY` | Can be the same as deployer for testnet |
| `BUNDLER_RPC_URL` | Stackup/Pimlico/Alchemy bundler dashboard |
| `ETHERSCAN_API_KEY` | etherscan.io account (optional) |

Leave the `*_ADDRESS` fields blank — the deploy script fills them.

---

## Step 3 — Compile contracts

```bash
npm run compile
# Expected: "Compiled 37 Solidity files successfully"
```

---

## Step 4 — Deploy to Sepolia

```bash
npm run deploy:sepolia
```

The script deploys 4 contracts in order and prints their addresses. Copy them — you need them next.

---

## Step 5 — Install backend dependencies

```bash
cd backend
npm install
```

---

## Step 6 — Configure backend environment

```bash
cp .env.example .env
```

Edit `backend/.env` and fill in:

| Variable | Value |
|---|---|
| `RPC_URL` | Same Sepolia RPC as above |
| `BUNDLER_RPC_URL` | Same bundler URL |
| `ENTRY_POINT_ADDRESS` | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` (already in example) |
| `FACTORY_ADDRESS` | From deploy output |
| `PAYMASTER_ADDRESS` | From deploy output |
| `ZAR_TOKEN_ADDRESS` | From deploy output |
| `PAYMASTER_SIGNER_PRIVATE_KEY` | Must match what you used in root `.env` |
| `KEY_ENCRYPTION_SECRET` | Generate with the command below |
| `PORT` | `3000` (default) |
| `AT_USERNAME` | Africa's Talking username (`sandbox` for the AT sandbox) |
| `AT_API_KEY` | Africa's Talking API key (dashboard → Settings → API Key) |
| `SHORT_CODE` | Your AT short code; SMS notifications are sent from it |
| `ADMIN_API_KEY` | Any long random string. Protects the merchant/website KYC endpoints |
| `KYC_L0_DAILY_LIMIT` … | Optional. Limits in whole Rands (defaults below) |

Without `AT_USERNAME` + `AT_API_KEY`, the backend still works: every SMS is saved as **simulated** instead of being sent, and the simulator shows it on the phone. The full list of optional settings (premium SMS keyword, KYC limits, on-chain FICA sync) is in `backend/.env.example`.

Generate the encryption secret (and `ADMIN_API_KEY`, the same way):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 7 — Start the backend server

```bash
# Production
npm start

# Development (auto-restart on changes)
npm run dev
```

Server runs at `http://localhost:3000`. Verify with:

```bash
curl http://localhost:3000/api/health
```

---

## Step 8 — Run the USSD simulator

With the backend from Step 7 still running, open a **second terminal**:

```bash
cd simulator
npm install
npm run dev
```

Open http://localhost:5173. The simulator talks to `http://localhost:3000`. To point it somewhere else, start it with `VITE_API_URL=https://… npm run dev`.

Check that the backend is reachable before dialling: `curl http://localhost:3000/api/health` should return `"status": "ok"`, and the backend's startup log should show no `⚠️ Missing .env variables` line.

### Try it end to end

1. **Register User A.** Click the first phone, type `*384*123#` and press the green key. You'll see "Hello from ZAKA!". Enter a 4-digit PIN (`1234`), confirm it, then enter an SA ID number. You should see "Wallet created for +27821234567!". A R100 welcome bonus is sent in the background and shows up in the Account panel after a few seconds.
2. **Register User B** the same way on the second phone. Each ID number can only be used once, so use a different one.
3. **Send ZAKA.** On phone A, dial again, choose `2`, then enter `0831234567` (User B), `50`, and the PIN. The reply comes back straight away: "Sending R50.00 to 0831234567. You will receive an SMS from <SHORT_CODE> when funds are sent", with a reference such as `01J8ZK3V9Q7W2R5T6Y8B4N1M0C` (a ULID). The transfer is then submitted in the background. When it completes, both balances update, phone A gets "ZAKA: you have sent R50.00 to 0831234567. Ref: …", and phone B gets "ZAKA notification: you have received R50.00 from +27821234567." Press **Read** on each phone to see them.
4. **Hit the limit.** New users are on **Level 0** (ID number only): R500 a day, R10,000 a month. On phone A, try to send `600`. You'll get "Sorry, this is over your daily limit", plus an SMS telling you how to unlock more.
5. **Complete validation.** In the Account panel, click **Validate** (this plays the merchant or website). User A moves to **Level 1** (R25,000/day, R100,000/month) and gets an SMS confirming it. The simulator can't send an admin key, so this only works when `ADMIN_API_KEY` isn't set. Otherwise use the `curl` command under [New API endpoints](#new-api-endpoints).

**Test SA ID numbers** (valid format and checksum, not real people): `9001015009086`, `8505055800080`, `9503120123082`.

`GET http://localhost:3000/api/sms` lists every SMS the backend sent, with its Africa's Talking status, message id and cost.

### Controls

| Action | Keyboard (click a phone first) | On-screen |
|---|---|---|
| Type | `0`–`9`, `*`, `#` | keypad |
| Call / Send / OK | Enter | green key or left soft key |
| Cancel / End | Esc | red key or right soft key |
| Delete a character | Backspace | `C` |
| Scroll a long menu | ↑ / ↓ | arrow keys |

PINs and ID numbers are always masked on screen.

### Other ways to run the simulator

- **No npm install:** open `simulator/standalone.html` directly in a browser. It's an older build with the top bar, Mock mode and the session inspector.
- **Through ngrok:** start the simulator with `VITE_API_URL=https://xxxx.ngrok-free.app npm run dev`. It adds ngrok's browser-warning header for you.

Phones are saved in your browser (localStorage).

---

## ZAKA features: USSD menu, SMS and KYC

### USSD menu

New users see: **Hello from ZAKA!** → 4-digit PIN → confirm PIN → 13-digit SA ID number → **Wallet created for +27…**, with a R100 welcome bonus.

Registered users see:

```
ZAKA
1. Check Balance
2. Send ZAKA
3. Claim R100 Demo ZAKA
4. My Account
```

Nothing on USSD or SMS mentions blockchains or addresses. Transfers between ZAKA users have **R0 transfer fees**. ZAKA makes money on cash-ins and cash-outs at merchants, and the web app says so wherever fees come up. People only see ZAKA, Rand amounts and phone numbers.

**Sending never waits for the blockchain.** After the PIN, the backend checks limits and the available balance (on-chain balance minus transfers still in progress), saves the transfer as *pending* with a ULID reference, and replies at once. `services/transferService.js` then submits it and sends the SMS messages. Pending transfers count toward the sender's limits and balance, so a second send can't overspend while the first is still going through.

### Shortcut dialling and resuming dropped sessions

- **Shortcuts:** skip the menus by dialling everything at once:
  - `*384*123*2*0831234567*50#` goes straight to "Send R50.00 to 0831234567? Enter your PIN".
  - `*384*123*1#` shows your balance.
  - `*384*123*4#` opens My Account.

  PINs are never accepted in the dial code, because they would stay in the phone's call log. People get a safety message instead. Africa's Talking passes the extra digits in `text`, which works as-is. If your gateway puts them in `serviceCode` instead, set `USSD_SERVICE_CODE=*384*123#`.
- **Resume:** if a "Send ZAKA" session drops after the recipient or amount step, the progress is saved against the phone number, never the PIN. If they redial within `USSD_RESUME_MINUTES` (default 5), they see "Continue sending R50.00 to 0831234567? 1. Yes 2. No". **1** goes straight to the PIN screen. **2** clears it and shows the main menu. The saved progress is cleared when a session finishes, or when they dial a shortcut. The code is in `backend/services/ussdSessionService.js`.

### KYC tiers

| Level | How you get it | Daily limit | Monthly limit |
|---|---|---|---|
| Not verified | Registered before KYC existed | can't send | can't send |
| **0** | Enter your SA ID number on USSD | R500 | R10,000 |
| **1** | Validated at a merchant or on the website | R25,000 | R100,000 |

Only successful outgoing transfers count toward the limits (the welcome bonus and demo ZAKA don't). Days and months run on South African time. The ID number is never stored: only a keyed hash (so one ID can't be used on two phones) and a masked copy such as `900101•••••86`. Change the limits with `KYC_L0_DAILY_LIMIT`, `KYC_L0_MONTHLY_LIMIT`, `KYC_L1_DAILY_LIMIT` and `KYC_L1_MONTHLY_LIMIT` in `backend/.env` (whole Rands).

### SMS messages (sent from `SHORT_CODE` through Africa's Talking)

| When | Message |
|---|---|
| Someone receives ZAKA | ZAKA notification: you have received R50.00 from +27821234567. |
| The sender's transfer went through | ZAKA: you have sent R50.00 to 0831234567. Ref: 01J8ZK3V9Q7W2R5T6Y8B4N1M0C |
| The sender's transfer failed | ZAKA: your transfer of R50.00 to 0831234567 could not be completed. No money was sent. Ref: … |
| Registration, a Level 0 limit is hit, or "My Account → 1" | From ZAKA: to unlock sending more ZAKA, report to any merchant or head to our website to complete your ZAKA validation. (at most once an hour per phone) |
| Validation completed | From ZAKA: your ZAKA validation is complete. You can now send up to R25,000/day, R100,000/month. |

To get delivery reports, set the SMS delivery callback URL in the Africa's Talking dashboard to `https://<your-host>/api/sms/delivery`.

### Web app (`frontend/`)

The web wallet never shows blockchain details. People see their phone number, balance, verification status and a reference number for each payment. "My Wallet Address" is now **Receive money**, which shows your phone number and a QR code of it.

**Identity verification (Level 1) is required before sending from the web app.** A "Verify your identity" card appears on the dashboard, the balance page and in front of the send flow. The flow at `/verify` has four steps: SA ID number → selfie (uses the camera if there is one) → checks → verified. It is a **mock of Smile ID's Biometric KYC**. `POST /api/kyc/me/smile-id` validates the ID number and upgrades the signed-in user to Level 1. The selfie is never uploaded. To go live, send the ID number and selfie to Smile ID and upgrade the user from Smile ID's result callback instead. `POST /api/tx/send` returns `403` with `code: "kyc_level1_required"` until the user is verified. Receiving money and getting demo money work without verification.

Set `VITE_USSD_CODE` in `frontend/.env` if your USSD code isn't `*384*123#`.

### New API endpoints

| Endpoint | What it does |
|---|---|
| `GET /api/kyc/tiers` | Tier table and limits |
| `GET /api/kyc/:phone` | Level, limits, amount sent today / this month |
| `POST /api/kyc/:phone/id` `{ idNumber }` | Capture an ID number (Level 0), e.g. from the website * |
| `POST /api/kyc/:phone/verify` `{ method: "merchant"\|"web", reference }` | Complete ZAKA validation (Level 1) and text the user * |
| `GET /api/sms?phone=&limit=` | Log of sent SMS, newest first |
| `POST /api/sms/send` `{ to, message }` | Send a one-off SMS (for testing your AT setup) * |
| `POST /api/sms/delivery` | Africa's Talking delivery report callback |
| `GET /api/transactions/:phone` | Recent transfers in and out |
| `POST /api/kyc/me/smile-id` `{ idNumber }` | Web app identity check (mock Smile ID) → Level 1. Needs the web session token |

\* Send the header `x-admin-key: <ADMIN_API_KEY>` when `ADMIN_API_KEY` is set.

`GET /api/wallet/:phone` now includes a `kyc` object. `POST /api/auth/register` accepts an optional `idNumber`, and `POST /api/tx/send` enforces the same limits as USSD. It returns `403` with `code: "kyc_required"` or `"limit_exceeded"` when a send isn't allowed.

Try it with curl:

```bash
curl http://localhost:3000/api/kyc/0821234567
curl -X POST http://localhost:3000/api/kyc/0821234567/verify \
  -H "Content-Type: application/json" -H "x-admin-key: $ADMIN_API_KEY" \
  -d '{"method":"merchant","reference":"SPAR-0042"}'
curl -X POST http://localhost:3000/api/sms/send \
  -H "Content-Type: application/json" -H "x-admin-key: $ADMIN_API_KEY" \
  -d '{"to":"0821234567","message":"Test from ZAKA"}'
```

---

## Step 9 — (Optional) Test a UserOp

From the project root:

```bash
# Set OWNER_PRIVATE_KEY in root .env first
npm run sign:userop
```

---

## Step 10 — (Optional) Verify contracts on Etherscan

```bash
npx hardhat verify --network sepolia <FACTORY_ADDRESS> <ENTRY_POINT_ADDRESS>
npx hardhat verify --network sepolia <PAYMASTER_ADDRESS> <ENTRY_POINT_ADDRESS> <PAYMASTER_SIGNER_ADDRESS>
```

---

## Key Notes

- **Version lock:** Do not upgrade `@openzeppelin/contracts` to v5 or `@account-abstraction/contracts` to v0.7 — the structs are incompatible.
- **Paymaster funding:** The deploy script deposits 0.05 ETH into the paymaster. Monitor this balance — when it runs out, all sponsored transactions fail.
- **Key storage:** Backend stores user private keys encrypted in SQLite (`backend/data/users.db`). For production, replace with AWS KMS or similar.
- **USSD testing:** Expose the backend via ngrok (`ngrok http 3000`) and set the URL as your Africa's Talking webhook for `POST /ussd`.

---

## Troubleshooting the simulator

| Symptom | Fix |
|---|---|
| Every dial shows "Connection problem or invalid MMI code" | The backend isn't reachable, returned an error, or took over 30s. Check that `curl <backend>/api/health` works and that `VITE_API_URL` was set when the simulator was built. For HTTP 500, check the backend terminal. |
| "Sorry, something went wrong" on the phone | The backend threw an error. Usually an `.env` value is missing (`RPC_URL`, `KEY_ENCRYPTION_SECRET`, …). The backend prints missing variables at startup. |
| Balance stays at R 0.00 after registering | The welcome bonus UserOp failed. Check the backend logs for `[WELCOME BONUS]`, and that the paymaster still has ETH deposited. You can claim manually with menu option `3`. |
| "… is not on ZAKA yet" | Register the recipient's phone first. |
| Sender never got the "you have sent" SMS | Check the backend log for `[TRANSFER] <ref> failed`. The transfer is marked `failed` in `GET /api/transactions/:phone` and the sender gets the "could not be completed" SMS. |
| "Please add your ID number before sending" | That user registered before KYC existed. On USSD choose `4. My Account` → `1. Add ID number`. |
| "That ID number is not valid" | It must be 13 digits with a real date of birth and a valid checksum. Use one of the test ID numbers above. |
| "This ID number is already linked to another phone" | Each ID can be used on one phone only. Use a different test ID. |
| SMS show as *simulated* | `AT_USERNAME` / `AT_API_KEY` aren't set in `backend/.env`. That's fine for local testing. |
| SMS show as *failed* | Check the `error` field in `GET /api/sms` for Africa's Talking's error. Check the API key, that `SHORT_CODE` belongs to your account, and (for premium short codes) `AT_SMS_KEYWORD`. |
| **Validate** says "Missing or invalid x-admin-key" | The backend has `ADMIN_API_KEY` set and the simulator can't send it. Validate with `curl` and the `x-admin-key` header instead. |
| Phone numbers | Edit a phone's number or nickname above the handset. `082…`, `27…` and `+27…` formats all work. |
| Wallet panel shows a phone as unregistered, but it worked before | The backend keeps users in `backend/data/users.db`. Deleting that file resets everyone. |
