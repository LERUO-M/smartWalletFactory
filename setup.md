# SA Smart Wallet Factory — Setup Guide

This is an ERC-4337 Account Abstraction project with smart contracts (Hardhat/Solidity) and an Express.js backend. It deploys to Ethereum Sepolia testnet. It also includes a **USSD simulator**, a web app that stands in for Africa's Talking during development (in `simulator/`).

---

## Just want to see the USSD flow? (2 minutes, no blockchain setup)

The simulator has a **Mock mode** with a fake backend built in, so you can try the whole menu without deploying anything:

```bash
cd simulator
npm install
npm run dev
```

1. Open http://localhost:5173.
2. Turn on **Mock mode** in the top bar. A gold banner confirms it's on.
3. Click the first phone, type `*384*123#` and press the green key (or Enter).
4. Create a PIN (e.g. `1234`), confirm it, and dial again to see the main menu.

Or skip `npm install` altogether: open `simulator/standalone.html` directly in your browser.

To run against the real backend and Sepolia, follow Steps 1–8 below.

---

## Prerequisites

- **Node.js** >= 18
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

Generate the encryption secret:

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

Open http://localhost:5173. Check the top bar:

- The dot next to the backend URL (`http://localhost:3000` by default) should be **green**. Red means the simulator can't reach the backend (see Troubleshooting).
- The **Factory / Paymaster / Token** chips should all be green. A red chip means that address is missing from `backend/.env`.
- **Mock mode** must be **off**. Otherwise you're talking to the fake in-browser backend, not your server.

### Try it end to end

1. **Register User A.** Click the first phone, type `*384*123#` and press the green key. Enter a PIN (`1234`), then confirm it. You should see "Wallet created!". A R100 welcome bonus is sent in the background and shows up in the Wallet panel after a few seconds.
2. **Register User B** the same way on the second phone.
3. **Send money.** On phone A, dial again, choose `2`, then enter `0831234567` (User B), `50`, and the PIN. Both balances update in the Wallet panel on the right. Use the Etherscan links to see each wallet on Sepolia.

Or open **Scenarios** in the top bar and run "Register A", "Register B" and "A sends R50 to B". Choose the phone under "Run on" first.

### Controls

| Action | Keyboard (click a phone first) | On-screen |
|---|---|---|
| Type | `0`–`9`, `*`, `#` | keypad |
| Call / Send / OK | Enter | green key or left soft key |
| Cancel / End | Esc | red key or right soft key |
| Delete a character | Backspace | `C` |
| Scroll a long menu | ↑ / ↓ | arrow keys |

The **Session inspector** in the middle column logs every request and response. Expand an entry to see the JSON body or to use **Copy as cURL**. PINs are always masked on screen.

### Other ways to run the simulator

- **No npm install:** open `simulator/standalone.html` directly in a browser.
- **Served by the backend:** copy it to `backend/public/index.html`. The backend serves the `public/` folder, so the simulator loads at http://localhost:3000.
- **Through ngrok:** paste your `https://xxxx.ngrok-free.app` URL into the backend URL field. The simulator adds ngrok's browser-warning header for you.

Settings, phones and scenarios are saved in your browser (localStorage).

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
| Red dot in the top bar | Backend isn't running or the URL is wrong. Check that `curl http://localhost:3000/api/health` works. |
| Every dial shows "Connection problem or invalid MMI code" | Open the Session inspector. An `ERR` entry gives the reason: network error, HTTP 500 or a 30s timeout. For HTTP 500, check the backend terminal. |
| "Sorry, something went wrong" on the phone | The backend threw an error. Usually an `.env` value is missing (`RPC_URL`, `KEY_ENCRYPTION_SECRET`, …). The backend prints missing variables at startup. |
| Balance stays at R 0.00 after registering | The welcome bonus UserOp failed. Check the backend logs for `[WELCOME BONUS]`, and that the paymaster still has ETH deposited. You can claim manually with menu option `3`. |
| "Recipient … has not registered yet" | Register the recipient's phone first. |
| Phone numbers | Edit a phone's number or nickname above the handset. `082…`, `27…` and `+27…` formats all work. |
| Wallet panel shows a phone as unregistered, but it worked before | The backend keeps users in `backend/data/users.db`. Deleting that file resets everyone. |
