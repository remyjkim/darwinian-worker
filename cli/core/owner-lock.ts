// ABOUTME: Provides exclusive owner-record locks with conservative stale-owner recovery.
// ABOUTME: Shares one lock protocol across inventory, machine, and project transactions.

import { randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { DrwnError } from "./errors";

export interface OwnerLockRecord {
  version: 1;
  id: string;
  hostname: string;
  pid: number;
  startedAt: string;
}

export interface OwnerLockOptions {
  path: string;
  label: string;
  busyCode: string;
  unrecoverableCode: string;
  id?: string;
  checkpoint?: (name: "acquired" | "quarantined" | "released") => void | Promise<void>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseOwnerLock(bytes: string): OwnerLockRecord | null {
  try {
    const value = JSON.parse(bytes) as unknown;
    if (
      !isObject(value) ||
      value.version !== 1 ||
      typeof value.id !== "string" ||
      value.id.length === 0 ||
      typeof value.hostname !== "string" ||
      value.hostname.length === 0 ||
      typeof value.pid !== "number" ||
      !Number.isInteger(value.pid) ||
      value.pid <= 0 ||
      typeof value.startedAt !== "string" ||
      Number.isNaN(Date.parse(value.startedAt))
    ) return null;
    return value as unknown as OwnerLockRecord;
  } catch {
    return null;
  }
}

export function ownerProcessIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "EPERM");
  }
}

async function syncDirectory(path: string) {
  try {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Some platforms do not permit directory fsync. Exclusive creation and rename remain atomic.
  }
}

async function writeExclusive(path: string, bytes: string) {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function isCode(error: unknown, code: string) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

export async function acquireOwnerLock(options: OwnerLockOptions): Promise<OwnerLockRecord> {
  const parent = dirname(options.path);
  await mkdir(parent, { recursive: true });
  while (true) {
    const owner: OwnerLockRecord = {
      version: 1,
      id: options.id ?? randomUUID(),
      hostname: hostname(),
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    try {
      await writeExclusive(options.path, `${JSON.stringify(owner, null, 2)}\n`);
      await syncDirectory(parent);
      await options.checkpoint?.("acquired");
      return owner;
    } catch (error) {
      if (!isCode(error, "EEXIST")) throw error;
    }

    let existing: OwnerLockRecord | null;
    try {
      existing = parseOwnerLock(await readFile(options.path, "utf8"));
    } catch (error) {
      if (isCode(error, "ENOENT")) continue;
      throw error;
    }
    if (!existing || existing.hostname !== hostname()) {
      throw new DrwnError(
        options.unrecoverableCode,
        `${options.label} lock is malformed or owned by another host: ${options.path}`,
      );
    }
    if (ownerProcessIsAlive(existing.pid)) {
      throw new DrwnError(
        options.busyCode,
        `${options.label} is owned by PID ${existing.pid} on ${existing.hostname}`,
      );
    }
    const quarantine = `${options.path}.stale.${existing.id}.${randomUUID()}`;
    try {
      await rename(options.path, quarantine);
      await syncDirectory(parent);
      await options.checkpoint?.("quarantined");
    } catch (error) {
      if (isCode(error, "ENOENT")) continue;
      throw error;
    }
  }
}

export async function releaseOwnerLock(options: OwnerLockOptions, owner: OwnerLockRecord): Promise<void> {
  let current: OwnerLockRecord | null;
  try {
    current = parseOwnerLock(await readFile(options.path, "utf8"));
  } catch (error) {
    throw new DrwnError(
      options.unrecoverableCode,
      `Refusing to release missing ${options.label} lock for operation ${owner.id}`,
      undefined,
      error,
    );
  }
  if (!current || current.id !== owner.id) {
    throw new DrwnError(
      options.unrecoverableCode,
      `Refusing to release ${options.label} lock not owned by operation ${owner.id}`,
    );
  }
  await unlink(options.path);
  await syncDirectory(dirname(options.path));
  await options.checkpoint?.("released");
}

export async function withOwnerLock<T>(
  options: OwnerLockOptions,
  operation: (owner: OwnerLockRecord) => Promise<T>,
): Promise<T> {
  const owner = await acquireOwnerLock(options);
  try {
    return await operation(owner);
  } finally {
    await releaseOwnerLock(options, owner);
  }
}
