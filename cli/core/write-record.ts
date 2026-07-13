// ABOUTME: Reads and writes drwn materialization records for drift detection and safe cleanup.
// ABOUTME: Records only drwn-owned paths so cleanup never guesses ownership.

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  writeFileSync,
} from "node:fs";
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
  | { path: string; kind: "generated-symlink"; generatedPath: string }
  | { path: string; kind: "managed-content"; contentHash: string }
  | { path: string; kind: "managed-directory"; contentHash: string };

export function hashManagedContent(content: string | Uint8Array) {
  return `sha256-${createHash("sha256").update(content).digest("hex")}`;
}

export function dedupeManagedPathsByPath(paths: ManagedPath[]) {
  const map = new Map<string, ManagedPath>();
  for (const entry of paths) {
    map.set(entry.path, entry);
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function hashManagedDirectory(dirPath: string) {
  const records: Array<{ path: string; kind: "file" | "dir" | "symlink"; hash?: string; target?: string }> = [];

  function walk(absPath: string, relPath: string) {
    const stats = lstatSync(absPath);
    if (stats.isSymbolicLink()) {
      records.push({ path: relPath, kind: "symlink", target: readlinkSync(absPath) });
      return;
    }
    if (stats.isDirectory()) {
      records.push({ path: relPath, kind: "dir" });
      for (const entry of readdirSync(absPath).sort((a, b) => a.localeCompare(b))) {
        walk(join(absPath, entry), relPath ? `${relPath}/${entry}` : entry);
      }
      return;
    }
    if (stats.isFile()) {
      records.push({ path: relPath, kind: "file", hash: hashManagedContent(readFileSync(absPath)) });
    }
  }

  walk(dirPath, "");
  return hashManagedContent(JSON.stringify(records));
}

export function resolveProjectWriteRecordPath(projectRoot: string) {
  return join(projectRoot, ".agents", "drwn", "write-record.json");
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

function bestEffortFsync(fd: number) {
  // Durability optimization only; some platforms (notably Windows) reject fsync on
  // certain handles. Correctness comes from the atomic rename, not the fsync.
  try {
    fsyncSync(fd);
  } catch {
    // ignore
  }
}

export function saveWriteRecord(recordPath: string, record: WriteRecord) {
  mkdirSync(dirname(recordPath), { recursive: true });
  const tmp = `${recordPath}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`);
    bestEffortFsync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, recordPath);
  // Directory fsync is unsupported on Windows (opening a directory handle fails outright).
  try {
    const dirFd = openSync(dirname(recordPath), "r");
    try {
      bestEffortFsync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
    // ignore
  }
}

export function diffWriteRecord(previous: WriteRecord | null, desired: ManagedPath[]) {
  const previousMap = new Map((previous?.managedPaths ?? []).map((entry) => [entry.path, entry]));
  const desiredMap = new Map(desired.map((entry) => [entry.path, entry]));
  const toRemove: ManagedPath[] = [];
  const toAdd: ManagedPath[] = [];
  const toVerify: ManagedPath[] = [];

  for (const [path, previousEntry] of previousMap) {
    const desiredEntry = desiredMap.get(path);
    if (!desiredEntry) {
      toRemove.push(previousEntry);
    } else if (previousEntry.kind === "managed-fields" && desiredEntry.kind === "managed-fields") {
      const previousFields = new Set(previousEntry.fields);
      const desiredFields = new Set(desiredEntry.fields);
      const removedFields = previousEntry.fields.filter((field) => !desiredFields.has(field));
      const addedFields = desiredEntry.fields.filter((field) => !previousFields.has(field));
      const retainedFields = previousEntry.fields.filter((field) => desiredFields.has(field));
      if (removedFields.length > 0) {
        toRemove.push(managedFieldsSubset(previousEntry, removedFields));
      }
      if (addedFields.length > 0) {
        toAdd.push(managedFieldsSubset(desiredEntry, addedFields));
      }
      if (retainedFields.length > 0) {
        toVerify.push(managedFieldsSubset(previousEntry, retainedFields));
      }
    } else if (previousEntry.kind !== desiredEntry.kind) {
      toRemove.push(previousEntry);
      toAdd.push(desiredEntry);
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

function managedFieldsSubset(
  entry: Extract<ManagedPath, { kind: "managed-fields" }>,
  fields: string[],
): Extract<ManagedPath, { kind: "managed-fields" }> {
  return {
    path: entry.path,
    kind: "managed-fields",
    fields,
    fieldHashes: Object.fromEntries(fields.map((field) => [field, entry.fieldHashes[field]!])),
  };
}
