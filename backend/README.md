# SA Smart Wallet – USSD Backend

> Express.js server providing an Africa's Talking-compatible USSD webhook and a REST API for the feature-phone web simulator.

---

## Quick Start

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Configure environment
cp .env.example .env
# → fill in RPC_URL, FACTORY_ADDRESS, PAYMASTER_ADDRESS, ZAR_TOKEN_ADDRESS,
#   PAYMASTER_SIGNER_PRIVATE_KEY, KEY_ENCRYPTION_SECRET

# 3. Start the server
npm start          # production
npm run dev        # development (auto-restart on changes)
```

The server starts on `http://localhost:3000` by default.

---

## Exposing to the Internet (for Africa's Talking / a Real Phone)

```bash
npx ngrok http 3000
# → you'll receive a public URL like: https://a1b2-3c4d.ngrok-free.app
```

Paste that URL as **`https://a1b2-3c4d.ngrok-free.app/ussd`** in your [Africa's Talking dashboard](https://account.africastalking.com/) under your USSD shortcode's callback URL.

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/ussd` | Africa's Talking USSD webhook |
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/wallet/:phone` | Wallet info for a phone number |
| `GET` | `/` | Feature-phone web simulator UI |

---

## USSD Menu Tree

```
Dial *384*XXXX#
│
├── NEW USER → Registration Flow
│   ├── Enter 4-digit PIN
│   └── Confirm PIN → wallet created + R100 welcome bonus
│
└── EXISTING USER → Main Menu
    ├── 1. Check Balance     → displays ZAR balance
    ├── 2. Send Money        → phone number → amount → PIN → UserOp submitted
    ├── 3. Claim R100 Funds  → PIN → faucet UserOp submitted
    └── 4. My Wallet Address → displays CREATE2 address
```

---

## File Structure

```
backend/
├── server.js                  # Express entry point
├── db.js                      # SQLite initialisation (better-sqlite3)
├── routes/
│   ├── ussd.js                # Africa's Talking webhook handler & menu state machine
│   └── api.js                 # REST API for the web simulator
├── services/
│   ├── walletService.js       # CREATE2 address derivation, balance queries, calldata encoding
│   ├── authService.js         # PIN hashing, AES-256-GCM key encryption, user registration
│   └── userOpService.js       # ERC-4337 UserOp builder, paymaster signer, bundler dispatcher
├── public/                    # Static files for the web simulator (see next task)
├── data/                      # SQLite DB (auto-created, git-ignored)
├── .env.example               # Environment variable template
└── package.json
```

---

## Security Notes

| Concern | How it is handled |
|---|---|
| PIN storage | Bcrypt-hashed (`cost=10`), never stored in plaintext |
| Private keys | AES-256-GCM encrypted with HKDF key derived from `KEY_ENCRYPTION_SECRET + phone + PIN` |
| Gas fees | Sponsored by `ZARPaymaster` – users need zero ETH |
| Key recovery | Wallet guardian social-recovery is inherited from `SAWallet.sol` |
| Production hardening | Replace local SQLite + in-process key decryption with Cloud KMS (AWS KMS / Google Cloud KMS / HashiCorp Vault) |
