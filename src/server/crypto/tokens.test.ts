import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptJson, decryptSecret, encryptJson, encryptSecret, loadKeyring, secretVersion } from "./tokens";

const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");
const ring = (current: string, keys: Record<string, string>) => loadKeyring({ TOKEN_ENC_KEYS: JSON.stringify(keys), TOKEN_ENC_CURRENT: current });

describe("token encryption", () => {
  it("round-trips and never stores the plaintext", () => {
    const r = ring("v1", { v1: k1 });
    const blob = encryptSecret("refresh-token-123", r);
    expect(blob.toString("utf8")).not.toContain("refresh-token-123");
    expect(decryptSecret(blob, r)).toBe("refresh-token-123");
    expect(decryptJson(encryptJson({ a: 1 }, r), r)).toEqual({ a: 1 });
  });

  it("uses a fresh IV each time", () => {
    const r = ring("v1", { v1: k1 });
    expect(encryptSecret("same", r).equals(encryptSecret("same", r))).toBe(false);
  });

  it("rejects tampered data", () => {
    const r = ring("v1", { v1: k1 });
    const blob = encryptSecret("secret", r);
    blob[blob.length - 20] ^= 1;
    expect(() => decryptSecret(blob, r)).toThrow();
  });

  it("decrypts old versions after rotation and encrypts with the new one", () => {
    const old = encryptSecret("from v1", ring("v1", { v1: k1 }));
    const rotated = ring("v2", { v1: k1, v2: k2 });
    expect(decryptSecret(old, rotated)).toBe("from v1");
    expect(secretVersion(encryptSecret("x", rotated))).toBe("v2");
    expect(() => decryptSecret(old, ring("v2", { v2: k2 }))).toThrow(/No key for token version v1/);
  });

  it("refuses bad configuration", () => {
    expect(() => loadKeyring({})).toThrow(/must be set/);
    expect(() => ring("v1", { v1: Buffer.from("short").toString("base64") })).toThrow(/32 bytes/);
    expect(() => ring("v9", { v1: k1 })).toThrow(/not in TOKEN_ENC_KEYS/);
  });
});
