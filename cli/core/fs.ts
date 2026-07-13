// ABOUTME: Shared filesystem helpers for safe symlink management and path operations.
// ABOUTME: Centralizes lstat/realpath/parent-dir logic used by sync, skills, and diagnostics modules.

import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

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

export async function syncDirectory(path: string): Promise<void> {
  try {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Some platforms do not permit directory fsync. Atomic rename still provides correctness.
  }
}

export async function flushDirectoryTree(root: string): Promise<void> {
  const stats = await lstat(root);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Cannot flush non-directory tree: ${root}`);
  }
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Cannot flush tree containing symlink: ${path}`);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        const handle = await open(path, "r");
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
      } else {
        throw new Error(`Cannot flush unsupported filesystem entry: ${path}`);
      }
    }
    await syncDirectory(directory);
  }
  await walk(root);
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
    await syncDirectory(parent);
  } catch (error) {
    try {
      await rm(tempPath, { force: true });
    } catch {
      // Best-effort cleanup only; preserve the original write failure.
    }
    throw error;
  }
}
