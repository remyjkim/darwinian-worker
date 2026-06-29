// ABOUTME: Tests the AES-256-GCM secret store envelope and keychain-gated persistence.
// ABOUTME: Uses an injected in-memory backend so no real OS keychain is touched.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clear,
  CredentialIntegrityError,
  decryptFromDisk,
  encryptToDisk,
  NoKeychainError,
  type KeychainBackend,
} from "../cli/core/secret-store";

class FakeKeychainBackend implements KeychainBackend {
  key: Buffer | null = null;
  available = true;
  async isAvailable(): Promise<boolean> {
    return this.available;
  }
  async loadKey(): Promise<Buffer | null> {
    return this.key;
  }
  async storeKey(key: Buffer): Promise<void> {
    this.key = key;
  }
  async deleteKey(): Promise<void> {
    this.key = null;
  }
}

let root: string;
let path: string;
let backend: FakeKeychainBackend;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "secret-store-"));
  path = join(root, "credentials.json");
  backend = new FakeKeychainBackend();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("secret store", () => {
  test("should round-trip a secret through encrypt and decrypt", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    expect(await decryptFromDisk(path, backend)).toBe("super-secret-token");
  });

  test("should write an envelope with no plaintext on disk", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    const raw = readFileSync(path, "utf8");
    expect(raw).not.toContain("super-secret-token");
    const parsed = JSON.parse(raw) as { algo: string; ciphertext: string; tag: string };
    expect(parsed.algo).toBe("aes-256-gcm");
    expect(parsed.ciphertext.length).toBeGreaterThan(0);
    expect(parsed.tag.length).toBeGreaterThan(0);
  });

  test("should throw NoKeychainError when no keychain is available", async () => {
    backend.available = false;
    await expect(encryptToDisk(path, "x", backend)).rejects.toBeInstanceOf(NoKeychainError);
  });

  test("should throw CredentialIntegrityError when the ciphertext is tampered", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    const envelope = JSON.parse(readFileSync(path, "utf8")) as { ciphertext: string };
    const bytes = Buffer.from(envelope.ciphertext, "base64");
    bytes[0] = bytes[0]! ^ 0xff;
    writeFileSync(path, JSON.stringify({ ...envelope, ciphertext: bytes.toString("base64") }));
    await expect(decryptFromDisk(path, backend)).rejects.toBeInstanceOf(CredentialIntegrityError);
  });

  test("should return null when the key is gone (treated as logged out)", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    backend.key = null;
    expect(await decryptFromDisk(path, backend)).toBeNull();
  });

  test("should return null when the credentials file is missing", async () => {
    expect(await decryptFromDisk(path, backend)).toBeNull();
  });

  test("clear should remove both the file and the key", async () => {
    await encryptToDisk(path, "super-secret-token", backend);
    await clear(path, backend);
    expect(existsSync(path)).toBe(false);
    expect(backend.key).toBeNull();
  });
});
