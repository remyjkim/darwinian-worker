// ABOUTME: Writes drwn-managed files with backups and dry-run change reporting.
// ABOUTME: Shared by MCP sync and hook materialization.

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureParentDir } from "./fs";
import type { SyncResult } from "./types";

function nextBackupPath(pathValue: string) {
  let candidate = `${pathValue}.bak`;
  let index = 1;
  while (existsSync(candidate)) {
    candidate = `${pathValue}.bak.${index}`;
    index += 1;
  }
  return candidate;
}

export function backupExistingPath(pathValue: string, dryRun: boolean, result: SyncResult) {
  const backupPath = nextBackupPath(pathValue);
  result.changes.push(`backup ${pathValue} -> ${backupPath}`);
  if (!dryRun) {
    renameSync(pathValue, backupPath);
  }
}

function atomicWriteFile(pathValue: string, content: string) {
  const tmpPath = `${pathValue}.tmp`;
  const fd = openSync(tmpPath, "w");
  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  renameSync(tmpPath, pathValue);
  const dirFd = openSync(dirname(pathValue), "r");
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

export function writeManagedFile(pathValue: string, nextContent: string, dryRun: boolean, result: SyncResult) {
  const exists = existsSync(pathValue);
  const currentContent = exists ? readFileSync(pathValue, "utf8") : undefined;

  if (currentContent === nextContent) {
    return;
  }

  ensureParentDir(pathValue, dryRun);
  if (exists) {
    backupExistingPath(pathValue, dryRun, result);
  }
  result.changes.push(`write ${pathValue}`);
  if (!dryRun) {
    atomicWriteFile(pathValue, nextContent);
  }
}
