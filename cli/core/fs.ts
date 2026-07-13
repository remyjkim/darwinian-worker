// ABOUTME: Shared filesystem helpers for safe symlink management and path operations.
// ABOUTME: Centralizes lstat/realpath/parent-dir logic used by sync, skills, and diagnostics modules.

import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function lstatSafe(pathValue: string) {
  try {
    return lstatSync(pathValue);
  } catch {
    return null;
  }
}

export function realpathSafe(pathValue: string) {
  try {
    return realpathSync(pathValue);
  } catch {
    return resolve(pathValue);
  }
}

export function ensureParentDir(pathValue: string, dryRun: boolean) {
  if (!dryRun) {
    mkdirSync(dirname(pathValue), { recursive: true });
  }
}

export async function writeAtomically(targetPath: string, content: string | Uint8Array): Promise<void> {
  const parent = dirname(targetPath);
  await mkdir(parent, { recursive: true });
  const tempPath = `${targetPath}.tmp.${randomBytes(8).toString("hex")}`;
  try {
    const handle = await open(tempPath, "wx");
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tempPath, targetPath);
    try {
      const parentHandle = await open(parent, "r");
      try {
        await parentHandle.sync();
      } finally {
        await parentHandle.close();
      }
    } catch {
      // Some platforms do not permit directory fsync. Atomic rename still provides correctness.
    }
  } catch (error) {
    try {
      await rm(tempPath, { force: true });
    } catch {
      // Best-effort cleanup only; preserve the original write failure.
    }
    throw error;
  }
}
