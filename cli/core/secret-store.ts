// ABOUTME: Encrypts secrets at rest with AES-256-GCM under an OS-keychain-held key.
// ABOUTME: Refuses to persist without a keychain; an env-gated file backend exists only for tests.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { runProcess } from "./process";

const ALGO = "aes-256-gcm";
const KEY_REF = "drwn-credentials";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;

export class NoKeychainError extends Error {
  readonly code = "NO_KEYCHAIN";
  constructor(message = "No OS keychain is available to protect credentials. Set DRWN_TOKEN for headless environments.") {
    super(message);
    this.name = "NoKeychainError";
  }
}

export class CredentialIntegrityError extends Error {
  readonly code = "CREDENTIAL_INTEGRITY";
  constructor(message = "Stored credentials failed integrity verification (possible tampering or key mismatch).") {
    super(message);
    this.name = "CredentialIntegrityError";
  }
}

export interface KeychainBackend {
  isAvailable(): Promise<boolean>;
  loadKey(): Promise<Buffer | null>;
  storeKey(key: Buffer): Promise<void>;
  deleteKey(): Promise<void>;
}

interface Envelope {
  v: 1;
  algo: typeof ALGO;
  keyRef: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.v === 1 &&
    record.algo === ALGO &&
    typeof record.nonce === "string" &&
    typeof record.ciphertext === "string" &&
    typeof record.tag === "string"
  );
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function isExecutableOnPath(command: string): boolean {
  const isWindows = process.platform === "win32";
  const exts = isWindows ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(isWindows ? ";" : ":")) {
    if (!dir) continue;
    for (const ext of exts) {
      if (existsSync(join(dir, `${command}${ext}`))) return true;
    }
  }
  return false;
}

async function restrictFile(path: string): Promise<void> {
  if (process.platform === "win32") {
    await runProcess(["icacls", path, "/inheritance:r"]);
    const user = process.env.USERNAME;
    if (user) {
      await runProcess(["icacls", path, "/grant:r", `${user}:F`]);
    }
    return;
  }
  await fs.chmod(path, 0o600);
}

async function writeRestricted(path: string, content: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.secret.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await fs.writeFile(tmp, content, { mode: 0o600 });
    await fs.rename(tmp, path);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
  await restrictFile(path);
}

export async function encryptToDisk(path: string, plaintext: string, backend?: KeychainBackend): Promise<void> {
  const keychain = backend ?? defaultBackend(path);
  if (!(await keychain.isAvailable())) {
    throw new NoKeychainError();
  }
  let key = await keychain.loadKey();
  if (!key) {
    key = randomBytes(KEY_BYTES);
    await keychain.storeKey(key);
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: Envelope = {
    v: 1,
    algo: ALGO,
    keyRef: KEY_REF,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
  await writeRestricted(path, `${JSON.stringify(envelope, null, 2)}\n`);
}

export async function decryptFromDisk(path: string, backend?: KeychainBackend): Promise<string | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return null;
    throw error;
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isEnvelope(envelope)) {
    return null;
  }
  const keychain = backend ?? defaultBackend(path);
  const key = await keychain.loadKey();
  if (!key) {
    return null;
  }
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(envelope.nonce, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new CredentialIntegrityError();
  }
}

export async function clear(path: string, backend?: KeychainBackend): Promise<void> {
  try {
    await fs.unlink(path);
  } catch (error) {
    if (!isErrorCode(error, "ENOENT")) throw error;
  }
  const keychain = backend ?? defaultBackend(path);
  await keychain.deleteKey();
}

// --- Backends ---

/** Key persisted as an owner-only file. Production-safe only as a test/headless escape hatch. */
export class FileKeychainBackend implements KeychainBackend {
  constructor(private readonly keyPath: string) {}
  async isAvailable(): Promise<boolean> {
    return true;
  }
  async loadKey(): Promise<Buffer | null> {
    try {
      const text = (await fs.readFile(this.keyPath, "utf8")).trim();
      return text ? Buffer.from(text, "base64") : null;
    } catch (error) {
      if (isErrorCode(error, "ENOENT")) return null;
      throw error;
    }
  }
  async storeKey(key: Buffer): Promise<void> {
    await writeRestricted(this.keyPath, key.toString("base64"));
  }
  async deleteKey(): Promise<void> {
    try {
      await fs.unlink(this.keyPath);
    } catch (error) {
      if (!isErrorCode(error, "ENOENT")) throw error;
    }
  }
}

/** macOS Keychain via the `security` CLI. */
export class MacKeychainBackend implements KeychainBackend {
  constructor(private readonly service = "drwn", private readonly account = KEY_REF) {}
  async isAvailable(): Promise<boolean> {
    return isExecutableOnPath("security");
  }
  async loadKey(): Promise<Buffer | null> {
    const result = await runProcess(["security", "find-generic-password", "-a", this.account, "-s", this.service, "-w"]);
    if (result.exitCode !== 0) return null; // 44 == not found
    const value = result.stdout.trim();
    return value ? Buffer.from(value, "base64") : null;
  }
  async storeKey(key: Buffer): Promise<void> {
    const result = await runProcess([
      "security", "add-generic-password", "-U", "-a", this.account, "-s", this.service, "-w", key.toString("base64"),
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`security add-generic-password failed: ${result.stderr.trim()}`);
    }
  }
  async deleteKey(): Promise<void> {
    await runProcess(["security", "delete-generic-password", "-a", this.account, "-s", this.service]);
  }
}

/** Linux Secret Service via `secret-tool`. */
export class SecretToolBackend implements KeychainBackend {
  constructor(private readonly service = "drwn", private readonly account = KEY_REF) {}
  async isAvailable(): Promise<boolean> {
    if (!isExecutableOnPath("secret-tool")) return false;
    return Boolean(process.env.DBUS_SESSION_BUS_ADDRESS);
  }
  async loadKey(): Promise<Buffer | null> {
    const result = await runProcess(["secret-tool", "lookup", "service", this.service, "account", this.account]);
    if (result.exitCode !== 0) return null;
    const value = result.stdout.trim();
    return value ? Buffer.from(value, "base64") : null;
  }
  async storeKey(key: Buffer): Promise<void> {
    const result = await runProcess(
      ["secret-tool", "store", "--label=drwn credentials key", "service", this.service, "account", this.account],
      { stdin: key.toString("base64") },
    );
    if (result.exitCode !== 0) {
      throw new Error(`secret-tool store failed: ${result.stderr.trim()}`);
    }
  }
  async deleteKey(): Promise<void> {
    await runProcess(["secret-tool", "clear", "service", this.service, "account", this.account]);
  }
}

function powershellExe(): string | null {
  if (isExecutableOnPath("pwsh")) return "pwsh";
  if (isExecutableOnPath("powershell")) return "powershell";
  return null;
}

function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Windows DPAPI (CurrentUser) protecting a key stored in an ACL-restricted sibling file. */
export class DpapiBackend implements KeychainBackend {
  constructor(private readonly keyPath: string) {}
  async isAvailable(): Promise<boolean> {
    return powershellExe() !== null;
  }
  async loadKey(): Promise<Buffer | null> {
    if (!existsSync(this.keyPath)) return null;
    const exe = powershellExe();
    if (!exe) return null;
    const script =
      `$b=[IO.File]::ReadAllBytes(${psLiteral(this.keyPath)});` +
      `$u=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');` +
      `[Console]::Out.Write([Convert]::ToBase64String($u))`;
    const result = await runProcess([exe, "-NoProfile", "-NonInteractive", "-Command", script]);
    if (result.exitCode !== 0) return null;
    const value = result.stdout.trim();
    return value ? Buffer.from(value, "base64") : null;
  }
  async storeKey(key: Buffer): Promise<void> {
    const exe = powershellExe();
    if (!exe) throw new NoKeychainError();
    const script =
      `$k=[Convert]::FromBase64String(${psLiteral(key.toString("base64"))});` +
      `$p=[Security.Cryptography.ProtectedData]::Protect($k,$null,'CurrentUser');` +
      `[IO.File]::WriteAllBytes(${psLiteral(this.keyPath)},$p)`;
    const result = await runProcess([exe, "-NoProfile", "-NonInteractive", "-Command", script]);
    if (result.exitCode !== 0) {
      throw new Error(`DPAPI protect failed: ${result.stderr.trim()}`);
    }
    await restrictFile(this.keyPath);
  }
  async deleteKey(): Promise<void> {
    try {
      await fs.unlink(this.keyPath);
    } catch (error) {
      if (!isErrorCode(error, "ENOENT")) throw error;
    }
  }
}

class UnavailableBackend implements KeychainBackend {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async loadKey(): Promise<Buffer | null> {
    return null;
  }
  async storeKey(): Promise<void> {
    throw new NoKeychainError();
  }
  async deleteKey(): Promise<void> {}
}

export function defaultBackend(credentialsPath: string): KeychainBackend {
  const testDir = process.env.DRWN_TEST_KEYCHAIN_DIR;
  if (testDir) {
    return new FileKeychainBackend(join(testDir, "keychain.key"));
  }
  if (process.platform === "darwin") return new MacKeychainBackend();
  if (process.platform === "win32") return new DpapiBackend(`${credentialsPath}.key`);
  if (process.platform === "linux") return new SecretToolBackend();
  return new UnavailableBackend();
}
