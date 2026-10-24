import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope for OAuth tokens and secret calendar URLs: AES-256-GCM with a random 12-byte IV.
 * Stored bytes: [1-byte key-version length][version][12-byte IV][ciphertext][16-byte tag].
 * Keys come from TOKEN_ENC_KEYS (JSON {"v1": "<base64 32 bytes>", ...}); TOKEN_ENC_CURRENT
 * names the one used to encrypt. Old versions keep decrypting until rotated out.
 */

type Keyring = { current: string; keys: Map<string, Buffer> };

export function loadKeyring(env: Record<string, string | undefined> = process.env): Keyring {
  const raw = env.TOKEN_ENC_KEYS;
  const current = env.TOKEN_ENC_CURRENT;
  if (!raw || !current) throw new Error("TOKEN_ENC_KEYS and TOKEN_ENC_CURRENT must be set to store connected accounts.");
  const parsed = JSON.parse(raw) as Record<string, string>;
  const keys = new Map<string, Buffer>();
  for (const [version, b64] of Object.entries(parsed)) {
    const key = Buffer.from(b64, "base64");
    if (key.length !== 32) throw new Error(`Token key ${version} must be 32 bytes (base64).`);
    keys.set(version, key);
  }
  if (!keys.has(current)) throw new Error(`TOKEN_ENC_CURRENT (${current}) is not in TOKEN_ENC_KEYS.`);
  return { current, keys };
}

export function encryptSecret(plain: string, ring: Keyring = loadKeyring()): Buffer {
  const version = Buffer.from(ring.current, "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ring.keys.get(ring.current)!, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([version.length]), version, iv, body, cipher.getAuthTag()]);
}

export function decryptSecret(blob: Buffer, ring: Keyring = loadKeyring()): string {
  const vlen = blob[0];
  const version = blob.subarray(1, 1 + vlen).toString("utf8");
  const key = ring.keys.get(version);
  if (!key) throw new Error(`No key for token version ${version}.`);
  const iv = blob.subarray(1 + vlen, 13 + vlen);
  const tag = blob.subarray(blob.length - 16);
  const body = blob.subarray(13 + vlen, blob.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/** Which key version a blob was written with (for rotation sweeps). */
export const secretVersion = (blob: Buffer) => blob.subarray(1, 1 + blob[0]).toString("utf8");

export const encryptJson = (v: unknown, ring?: Keyring) => encryptSecret(JSON.stringify(v), ring);
export const decryptJson = <T,>(blob: Buffer, ring?: Keyring) => JSON.parse(decryptSecret(blob, ring)) as T;
