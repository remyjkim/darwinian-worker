// ABOUTME: Tests per-OS keychain backend argv/stdin and platform selection for the secret store.
// ABOUTME: Includes real round-trips on macOS security, Windows DPAPI, and Linux secret-tool when available.

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as processModule from "../cli/core/process";
import {
  DpapiBackend,
  FileKeychainBackend,
  MacKeychainBackend,
  SecretToolBackend,
  defaultBackend,
} from "../cli/core/secret-store";

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
});

function mockRunProcess(result: { exitCode: number; stdout?: string; stderr?: string }) {
  return spyOn(processModule, "runProcess").mockResolvedValue({
    exitCode: result.exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  });
}

describe("keychain backend selection", () => {
  test("selects the file backend when the test env var is set", () => {
    expect(defaultBackend("/tmp/credentials.json")).toBeInstanceOf(FileKeychainBackend);
  });

  test("selects the platform backend when no test env var is set", () => {
    const saved = process.env.DRWN_TEST_KEYCHAIN_DIR;
    delete process.env.DRWN_TEST_KEYCHAIN_DIR;
    try {
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
      expect(defaultBackend("/tmp/credentials.json")).toBeInstanceOf(MacKeychainBackend);
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      expect(defaultBackend("/tmp/credentials.json")).toBeInstanceOf(DpapiBackend);
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      expect(defaultBackend("/tmp/credentials.json")).toBeInstanceOf(SecretToolBackend);
    } finally {
      if (saved !== undefined) process.env.DRWN_TEST_KEYCHAIN_DIR = saved;
    }
  });
});

describe("macOS security backend argv", () => {
  test("storeKey passes the key via -w to security add-generic-password", async () => {
    const spy = mockRunProcess({ exitCode: 0 });
    try {
      await new MacKeychainBackend("svc", "acct").storeKey(Buffer.from("key-bytes"));
      expect(spy.mock.calls[0]?.[0]).toEqual([
        "security", "add-generic-password", "-U", "-a", "acct", "-s", "svc", "-w", Buffer.from("key-bytes").toString("base64"),
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  test("loadKey returns null when security reports not-found", async () => {
    const spy = mockRunProcess({ exitCode: 44 });
    try {
      expect(await new MacKeychainBackend().loadKey()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("linux secret-tool backend", () => {
  test("storeKey passes the key over stdin, not argv", async () => {
    const spy = mockRunProcess({ exitCode: 0 });
    try {
      await new SecretToolBackend("svc", "acct").storeKey(Buffer.from("key-bytes"));
      const [argv, options] = spy.mock.calls[0] ?? [];
      expect(argv).toEqual(["secret-tool", "store", "--label=drwn credentials key", "service", "svc", "account", "acct"]);
      expect((options as { stdin?: string }).stdin).toBe(Buffer.from("key-bytes").toString("base64"));
    } finally {
      spy.mockRestore();
    }
  });

  test("loadKey returns null when secret-tool is unavailable (exit 127)", async () => {
    const spy = mockRunProcess({ exitCode: 127 });
    try {
      expect(await new SecretToolBackend().loadKey()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("real macOS keychain round-trip", () => {
  test.skipIf(process.platform !== "darwin")("stores, loads, and deletes a key via the real security CLI", async () => {
    const backend = new MacKeychainBackend(`drwn-test-${randomBytes(6).toString("hex")}`, "drwn-test-key");
    const key = randomBytes(32);
    try {
      await backend.storeKey(key);
      const loaded = await backend.loadKey();
      expect(loaded?.equals(key)).toBe(true);
    } finally {
      await backend.deleteKey();
    }
    expect(await backend.loadKey()).toBeNull();
  });
});

describe("real Windows DPAPI backend", () => {
  test.skipIf(process.platform !== "win32")("stores, loads, and deletes a key via real DPAPI", async () => {
    const dir = mkdtempSync(join(tmpdir(), "drwn-dpapi-"));
    try {
      const backend = new DpapiBackend(join(dir, "credentials.json.key"));
      const key = randomBytes(32);
      await backend.storeKey(key);
      expect((await backend.loadKey())?.equals(key)).toBe(true);
      await backend.deleteKey();
      expect(await backend.loadKey()).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("real Linux secret-tool backend", () => {
  test("stores, loads, and deletes a key via the Secret Service when available", async () => {
    const backend = new SecretToolBackend(`drwn-test-${randomBytes(6).toString("hex")}`, "drwn-test-key");
    // Runtime skip: no secret-tool / D-Bus session in this environment (macOS, headless CI).
    if (!(await backend.isAvailable())) {
      return;
    }
    const key = randomBytes(32);
    try {
      await backend.storeKey(key);
      expect((await backend.loadKey())?.equals(key)).toBe(true);
    } finally {
      await backend.deleteKey();
    }
    expect(await backend.loadKey()).toBeNull();
  });
});
