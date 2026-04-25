// ABOUTME: Shared filesystem helpers for safe symlink management and path operations.
// ABOUTME: Centralizes lstat/realpath/parent-dir logic used by sync, skills, and diagnostics modules.

import { lstatSync, mkdirSync, realpathSync } from "node:fs";
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
