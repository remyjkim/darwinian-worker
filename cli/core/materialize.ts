// ABOUTME: Copy-based directory materialization and pointer-file writes for OS-uniform sync.
// ABOUTME: Replaces skill/cursor symlinks with plain copied directories and version pointer files.

import { cpSync, existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { ensureParentDir, lstatSafe } from "./fs";
import { hashManagedContent, hashManagedDirectory, type ManagedPath } from "./write-record";
import type { SyncResult } from "./types";

const DRY_RUN_HASH = "sha256-dry-run";

interface MaterializeDirOptions {
  dryRun: boolean;
  result: SyncResult;
  relPath: string;
  labelSuffix?: string;
}

/**
 * Materialize `source` into `dest` as a copied directory (dereferencing symlinks).
 * Idempotent: when `dest` already matches the copied snapshot, nothing is written.
 * The final rename is atomic; replacing an existing `dest` has a remove-then-rename
 * window, so drift safety is enforced separately by verifyManagedPaths.
 */
export function materializeDir(source: string, dest: string, options: MaterializeDirOptions): ManagedPath {
  const { dryRun, result, relPath, labelSuffix = "" } = options;

  if (dryRun) {
    const destStats = lstatSafe(dest);
    const matches = destStats?.isDirectory() === true && hashManagedDirectory(dest) === hashManagedDirectory(source);
    if (!matches) {
      result.changes.push(`copy ${dest}${labelSuffix}`);
    }
    return { path: relPath, kind: "managed-directory", contentHash: DRY_RUN_HASH };
  }

  ensureParentDir(dest, false);
  const tmp = `${dest}.tmp.${randomBytes(8).toString("hex")}`;
  rmSync(tmp, { recursive: true, force: true });
  try {
    cpSync(source, tmp, { recursive: true, dereference: true });
    const snapshotHash = hashManagedDirectory(tmp);
    const destStats = lstatSafe(dest);
    if (destStats?.isDirectory() === true && hashManagedDirectory(dest) === snapshotHash) {
      rmSync(tmp, { recursive: true, force: true });
      return { path: relPath, kind: "managed-directory", contentHash: snapshotHash };
    }
    result.changes.push(`copy ${dest}${labelSuffix}`);
    rmSync(dest, { recursive: true, force: true });
    renameSync(tmp, dest);
    return { path: relPath, kind: "managed-directory", contentHash: snapshotHash };
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}

interface WritePointerOptions {
  dryRun?: boolean;
}

/**
 * Write `value` as a single-line pointer file at `dest`, replacing any pre-existing
 * symlink or non-file. Returns the content hash of the pointer (or the dry-run sentinel).
 * Pure writer for code paths that have no SyncResult (e.g. skill-package install).
 */
export function writePointerFile(dest: string, value: string, options: WritePointerOptions = {}): string {
  const content = `${value}\n`;
  if (options.dryRun) {
    return DRY_RUN_HASH;
  }
  const stats = lstatSafe(dest);
  if (stats && !stats.isFile()) {
    rmSync(dest, { recursive: true, force: true });
  }
  ensureParentDir(dest, false);
  writeFileSync(dest, content);
  return hashManagedContent(content);
}

interface MaterializePointerOptions {
  dryRun: boolean;
  result: SyncResult;
  relPath: string;
}

/**
 * Reporting wrapper around writePointerFile for sync-style callers that record a SyncResult.
 */
export function materializePointer(dest: string, value: string, options: MaterializePointerOptions): ManagedPath {
  const { dryRun, result, relPath } = options;
  const existed = existsSync(dest);
  const contentHash = writePointerFile(dest, value, { dryRun });
  if (!existed || dryRun) {
    result.changes.push(`write ${dest}`);
  }
  return { path: relPath, kind: "managed-content", contentHash };
}
