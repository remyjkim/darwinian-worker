// ABOUTME: Reads and writes bgng materialization records for drift detection and safe cleanup.
// ABOUTME: Records only bgng-owned paths so cleanup never guesses ownership.

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface WriteRecord {
  writeRecordVersion: 1;
  lastWriteAt: string;
  lastWriteHarnessVersion: string;
  managedPaths: ManagedPath[];
}

export type ManagedPath =
  | { path: string; kind: "symlink"; target: string }
  | { path: string; kind: "managed-fields"; fields: string[]; fieldHashes: Record<string, string> }
  | { path: string; kind: "generated-symlink"; generatedPath: string };

export function resolveProjectWriteRecordPath(projectRoot: string) {
  return join(projectRoot, ".agents", "bgng", "write-record.json");
}

export function loadWriteRecord(recordPath: string): WriteRecord | null {
  if (!existsSync(recordPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(recordPath, "utf8")) as WriteRecord;
    if (parsed.writeRecordVersion !== 1 || !Array.isArray(parsed.managedPaths)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveWriteRecord(recordPath: string, record: WriteRecord) {
  mkdirSync(dirname(recordPath), { recursive: true });
  const tmp = `${recordPath}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, recordPath);
  const dirFd = openSync(dirname(recordPath), "r");
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

export function diffWriteRecord(previous: WriteRecord | null, desired: ManagedPath[]) {
  const previousMap = new Map((previous?.managedPaths ?? []).map((entry) => [entry.path, entry]));
  const desiredMap = new Map(desired.map((entry) => [entry.path, entry]));
  const toRemove: ManagedPath[] = [];
  const toAdd: ManagedPath[] = [];
  const toVerify: ManagedPath[] = [];

  for (const [path, previousEntry] of previousMap) {
    if (!desiredMap.has(path)) {
      toRemove.push(previousEntry);
    } else {
      toVerify.push(previousEntry);
    }
  }

  for (const [path, desiredEntry] of desiredMap) {
    if (!previousMap.has(path)) {
      toAdd.push(desiredEntry);
    }
  }

  return { toRemove, toAdd, toVerify };
}
