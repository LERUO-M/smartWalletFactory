# SA Smart Wallet Factory — Setup Guide

This is an ERC-4337 Account Abstraction project with smart contracts (Hardhat/Solidity) and an Express.js backend. It deploys to Ethereum Sepolia testnet.

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

## Step 8 — (Optional) Test a UserOp

From the project root:

```bash
# Set OWNER_PRIVATE_KEY in root .env first
npm run sign:userop
```

---

## Step 9 — (Optional) Verify contracts on Etherscan

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
