// backend/services/authService.js
// ─────────────────────────────────────────────────────────────────────────────
// User registration, PIN verification and signing-key management.
//
// KEY MANAGEMENT STRATEGY:
//   Each user gets a unique ECDSA keypair generated at registration time.
//   The private key is AES-256-GCM encrypted (using crypto.createCipheriv) with
//   a secret derived from:
//       HMAC-SHA256(KEY_ENCRYPTION_SECRET, phoneNumber + pin)
//   and stored in a local SQLite database.
//
//   This means:
//     • The server never stores the raw private key.
//     • An attacker who steals the database still cannot decrypt keys without
//       knowing the user's PIN AND the server's KEY_ENCRYPTION_SECRET.
//     • If a user forgets their PIN, the wallet can still be recovered via
//       the ERC-4337 social recovery mechanism (guardian quorum + 48 h timelock).
//
// PRODUCTION NOTE:
//   In production, replace the local SQLite store with a Cloud KMS (e.g. AWS KMS,
//   Google Cloud KMS, or HashiCorp Vault) so private keys never sit on disk
//   in any form on the backend host.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const crypto  = require("crypto");
const bcrypt  = require("bcryptjs");
const { ethers } = require("ethers");
const db      = require("../db");

// ── Constants ─────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS    = 10;
const AES_ALGORITHM    = "aes-256-gcm";
const AES_KEY_LENGTH   = 32; // bytes
const AES_IV_LENGTH    = 12; // bytes – GCM recommended nonce length
const AES_TAG_LENGTH   = 16; // bytes – GCM authentication tag
const WELCOME_AMOUNT   = ethers.parseEther("100"); // R100 welcome bonus

// ── Key Derivation ────────────────────────────────────────────────────────────

/**
 * Derive a 32-byte AES key from (server secret, phone, pin).
 * Using HKDF so that changing the PIN produces a completely different key.
 */
function deriveEncryptionKey(phoneNumber, pin) {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 64) {
    throw new Error("KEY_ENCRYPTION_SECRET must be a 64-character hex string in .env");
  }
  const secretBuffer = Buffer.from(secret, "hex");
  // hkdfSync returns an ArrayBuffer; wrap it in a Buffer for use with crypto APIs
  return Buffer.from(crypto.hkdfSync(
    "sha256",
    secretBuffer,
    Buffer.from(phoneNumber),  // salt = phone number (semi-public)
    Buffer.from(pin),           // info = pin (user's secret)
    AES_KEY_LENGTH
  ));
}

/**
 * AES-256-GCM encrypt a plaintext string.
 * @returns {{ iv: string, tag: string, ciphertext: string }} hex strings
 */
function encrypt(plaintext, aesKey) {
  const iv  = crypto.randomBytes(AES_IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, aesKey, iv, {
    authTagLength: AES_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    iv:         iv.toString("hex"),
    tag:        cipher.getAuthTag().toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

/**
 * AES-256-GCM decrypt back to plaintext.
 */
function decrypt(iv, tag, ciphertext, aesKey) {
  const decipher = crypto.createDecipheriv(
    AES_ALGORITHM,
    aesKey,
    Buffer.from(iv, "hex"),
    { authTagLength: AES_TAG_LENGTH }
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether a phone number is registered.
 *
 * @param {string} phoneNumber - Normalised phone number (e.g. "+27821234567").
 * @returns {boolean}
 */
function isRegistered(phoneNumber) {
  const row = db.prepare(
    "SELECT 1 FROM users WHERE phone = ?"
  ).get(phoneNumber);
  return !!row;
}

/**
 * Register a new user.
 * Generates a new Ethereum keypair, encrypts the private key, stores the
 * hashed PIN and encrypted key in the local DB.
 *
 * @param {string} phoneNumber - Normalised phone number.
 * @param {string} pin         - 4-6 digit PIN chosen by the user.
 * @returns {Promise<{walletKeyAddress: string}>} The address of the generated key.
 */
async function register(phoneNumber, pin) {
  if (isRegistered(phoneNumber)) {
    throw new Error("Phone number is already registered");
  }

  // 1. Generate a fresh Ethereum keypair for this user
  const wallet = ethers.Wallet.createRandom();

  // 2. Hash PIN for authentication
  const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

  // 3. Encrypt the private key with the derived AES key
  const aesKey     = deriveEncryptionKey(phoneNumber, pin);
  const encrypted  = encrypt(wallet.privateKey, aesKey);

  // 4. Persist to DB
  db.prepare(`
    INSERT INTO users (phone, pin_hash, encrypted_key_iv, encrypted_key_tag, encrypted_key_ciphertext, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    phoneNumber,
    pinHash,
    encrypted.iv,
    encrypted.tag,
    encrypted.ciphertext,
    Date.now()
  );

  return { walletKeyAddress: wallet.address };
}

/**
 * Verify a PIN and, if correct, return a live ethers.Wallet signer for this user.
 * The private key is decrypted in-memory and never written to disk again.
 *
 * @param {string} phoneNumber - Normalised phone number.
 * @param {string} pin         - PIN entered by the user.
 * @param {ethers.Provider} provider - Provider to attach the signer to.
 * @returns {Promise<ethers.Wallet|null>} Signer or null if PIN is wrong.
 */
async function getSignerForPin(phoneNumber, pin, provider) {
  const row = db.prepare(
    "SELECT * FROM users WHERE phone = ?"
  ).get(phoneNumber);

  if (!row) return null;

  const pinOk = await bcrypt.compare(pin, row.pin_hash);
  if (!pinOk) return null;

  // Decrypt the private key in memory only
  const aesKey     = deriveEncryptionKey(phoneNumber, pin);
  const privateKey = decrypt(
    row.encrypted_key_iv,
    row.encrypted_key_tag,
    row.encrypted_key_ciphertext,
    aesKey
  );

  return new ethers.Wallet(privateKey, provider);
}

/**
 * Return the stored public address (owner EOA) for a registered user.
 * Safe to call without PIN verification.
 *
 * @param {string} phoneNumber
 * @returns {string|null} Checksummed Ethereum address or null if not registered.
 */
function getOwnerAddress(phoneNumber) {
  const row = db.prepare(
    "SELECT owner_address FROM users WHERE phone = ?"
  ).get(phoneNumber);
  return row ? row.owner_address : null;
}

/**
 * Update the owner_address column after it is derived from the generated keypair.
 * Called once after register() returns so we can store the computed address.
 *
 * @param {string} phoneNumber
 * @param {string} address
 */
function setOwnerAddress(phoneNumber, address) {
  db.prepare(
    "UPDATE users SET owner_address = ? WHERE phone = ?"
  ).run(address, phoneNumber);
}

/**
 * Return the standard welcome bonus amount in ZAR wei.
 */
function getWelcomeBonus() {
  return WELCOME_AMOUNT;
}

module.exports = {
  isRegistered,
  register,
  getSignerForPin,
  getOwnerAddress,
  setOwnerAddress,
  getWelcomeBonus,
};
