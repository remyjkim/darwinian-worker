// ABOUTME: Commits project config and lock bytes through a recoverable local transaction.
// ABOUTME: Uses retained immutable sources, hash-authoritative roll-forward, and exclusive owner locks.

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { DrwnError } from "./errors";
import { withOrderedProjectOwnerLock } from "./inventory-lock";
import type { OwnerLockRecord } from "./owner-lock";

export type ProjectStateCheckpoint =
  | "after-source-flush"
  | "after-journal-flush"
  | "after-config-rename"
  | "after-config-phase"
  | "after-lock-rename"
  | "after-lock-phase"
  | "after-committed-journal"
  | "after-journal-unlink"
  | "after-transaction-remove"
  | "after-lock-release";

export interface ProjectStateBytes {
  configBytes: string;
  lockBytes: string;
}

export interface ProjectStateTransactionOptions {
  dryRun?: boolean;
  checkpoint?: (checkpoint: ProjectStateCheckpoint) => void | Promise<void>;
}

export interface ProjectStateSnapshot {
  configBytes: string | null;
  lockBytes: string | null;
}

interface JournalTarget {
  target: string;
  source: string;
  install: string;
  sha256: string;
}

interface ProjectStateJournal {
  version: 1;
  id: string;
  phase: "prepared" | "config-written" | "lock-written" | "committed";
  config: JournalTarget;
  lock: JournalTarget;
}

export function transactionPaths(projectRoot: string) {
  const stateDir = join(projectRoot, ".agents", "drwn");
  return {
    stateDir,
    configTarget: join(stateDir, "config.json"),
    lockTarget: join(stateDir, "card.lock"),
    lock: join(stateDir, ".state-transaction.lock"),
    journal: join(stateDir, ".state-transaction.json"),
    transactionsDir: join(stateDir, ".transactions"),
  };
}

function digest(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
    // Some platforms do not permit directory fsync. Atomic rename still provides correctness.
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

async function atomicWriteJson(path: string, value: unknown, stateDir: string, id: string) {
  const temporary = `${path}.tmp.${id}`;
  await rm(temporary, { force: true });
  await writeExclusive(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
  await syncDirectory(stateDir);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveJournalPath(stateDir: string, pathValue: unknown, label: string): string {
  if (typeof pathValue !== "string" || pathValue.length === 0 || isAbsolute(pathValue)) {
    throw new DrwnError("PROJECT_STATE_TRANSACTION_RECOVERY_FAILED", `Invalid ${label} path in project state journal`);
  }
  const absolute = resolve(stateDir, pathValue);
  const rel = relative(stateDir, absolute);
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) {
    throw new DrwnError("PROJECT_STATE_TRANSACTION_RECOVERY_FAILED", `${label} escapes the project state root`);
  }
  return absolute;
}

function validateJournal(value: unknown, stateDir: string): ProjectStateJournal {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !["prepared", "config-written", "lock-written", "committed"].includes(String(value.phase)) ||
    !isObject(value.config) ||
    !isObject(value.lock)
  ) {
    throw new DrwnError("PROJECT_STATE_TRANSACTION_RECOVERY_FAILED", "Malformed project state transaction journal");
  }
  for (const [label, target] of [["config", value.config], ["lock", value.lock]] as const) {
    resolveJournalPath(stateDir, target.target, `${label}.target`);
    resolveJournalPath(stateDir, target.source, `${label}.source`);
    resolveJournalPath(stateDir, target.install, `${label}.install`);
    if (typeof target.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(target.sha256)) {
      throw new DrwnError("PROJECT_STATE_TRANSACTION_RECOVERY_FAILED", `Invalid ${label} hash in project state journal`);
    }
  }
  return value as unknown as ProjectStateJournal;
}

async function readJournal(projectRoot: string): Promise<ProjectStateJournal | null> {
  const paths = transactionPaths(projectRoot);
  let bytes: string;
  try {
    bytes = await readFile(paths.journal, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  try {
    return validateJournal(JSON.parse(bytes), paths.stateDir);
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw new DrwnError("PROJECT_STATE_TRANSACTION_RECOVERY_FAILED", "Malformed project state transaction journal", undefined, error);
  }
}

async function hashFile(path: string): Promise<string | null> {
  try {
    return digest(await readFile(path));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function installTarget(
  stateDir: string,
  target: JournalTarget,
  afterRename?: () => void | Promise<void>,
) {
  const sourcePath = resolveJournalPath(stateDir, target.source, "source");
  const targetPath = resolveJournalPath(stateDir, target.target, "target");
  const installPath = resolveJournalPath(stateDir, target.install, "install");
  await rm(installPath, { force: true });
  await copyFile(sourcePath, installPath, constants.COPYFILE_EXCL);
  const handle = await open(installPath, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(installPath, targetPath);
  await syncDirectory(stateDir);
  await afterRename?.();
}

async function validateRecoverySources(stateDir: string, journal: ProjectStateJournal) {
  for (const [label, target] of [["config", journal.config], ["lock", journal.lock]] as const) {
    const sourcePath = resolveJournalPath(stateDir, target.source, `${label}.source`);
    if (await hashFile(sourcePath) !== target.sha256) {
      throw new DrwnError(
        "PROJECT_STATE_TRANSACTION_RECOVERY_FAILED",
        `Immutable ${label} recovery source is missing or does not match its journal hash`,
      );
    }
  }
}

async function advanceJournal(projectRoot: string, journal: ProjectStateJournal, phase: ProjectStateJournal["phase"]) {
  journal.phase = phase;
  const paths = transactionPaths(projectRoot);
  await atomicWriteJson(paths.journal, journal, paths.stateDir, journal.id);
}

async function finishCommittedTransaction(projectRoot: string, journal: ProjectStateJournal) {
  const paths = transactionPaths(projectRoot);
  await unlink(paths.journal);
  await syncDirectory(paths.stateDir);
  await rm(join(paths.transactionsDir, journal.id), { recursive: true, force: true });
  await syncDirectory(paths.transactionsDir);
}

async function recoverUnderLock(projectRoot: string) {
  const paths = transactionPaths(projectRoot);
  const journal = await readJournal(projectRoot);
  if (!journal) return;
  await validateRecoverySources(paths.stateDir, journal);
  if (await hashFile(resolveJournalPath(paths.stateDir, journal.config.target, "config.target")) !== journal.config.sha256) {
    await installTarget(paths.stateDir, journal.config);
  }
  await advanceJournal(projectRoot, journal, "config-written");
  if (await hashFile(resolveJournalPath(paths.stateDir, journal.lock.target, "lock.target")) !== journal.lock.sha256) {
    await installTarget(paths.stateDir, journal.lock);
  }
  await advanceJournal(projectRoot, journal, "lock-written");
  if (
    await hashFile(resolveJournalPath(paths.stateDir, journal.config.target, "config.target")) !== journal.config.sha256 ||
    await hashFile(resolveJournalPath(paths.stateDir, journal.lock.target, "lock.target")) !== journal.lock.sha256
  ) {
    throw new DrwnError("PROJECT_STATE_TRANSACTION_RECOVERY_FAILED", "Project state targets do not match recovery hashes");
  }
  await advanceJournal(projectRoot, journal, "committed");
  await finishCommittedTransaction(projectRoot, journal);
}

async function removeAbandonedTransactions(projectRoot: string) {
  const paths = transactionPaths(projectRoot);
  if (await readJournal(projectRoot)) return;
  await mkdir(paths.transactionsDir, { recursive: true });
  for (const entry of await readdir(paths.transactionsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      await rm(join(paths.transactionsDir, entry.name), { recursive: true, force: true });
    }
  }
  await syncDirectory(paths.transactionsDir);
}

export async function withProjectStateLock<T>(
  projectRoot: string,
  operation: (owner: OwnerLockRecord) => Promise<T>,
): Promise<T> {
  const paths = transactionPaths(projectRoot);
  await mkdir(paths.stateDir, { recursive: true });
  return withOrderedProjectOwnerLock(paths.lock, async (owner) => {
    await recoverUnderLock(projectRoot);
    await removeAbandonedTransactions(projectRoot);
    return await operation(owner);
  });
}

async function readSnapshotUnlocked(projectRoot: string): Promise<ProjectStateSnapshot> {
  const paths = transactionPaths(projectRoot);
  const readOptional = async (path: string) => {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  };
  return {
    configBytes: await readOptional(paths.configTarget),
    lockBytes: await readOptional(paths.lockTarget),
  };
}

async function commitUnderLock(
  projectRoot: string,
  owner: OwnerLockRecord,
  bytes: ProjectStateBytes,
  options: ProjectStateTransactionOptions,
) {
  const paths = transactionPaths(projectRoot);
  const id = owner.id;
  const transactionDir = join(paths.transactionsDir, id);
  await mkdir(transactionDir, { recursive: false });
  const configSource = join(transactionDir, "config.next");
  const lockSource = join(transactionDir, "lock.next");
  await writeExclusive(configSource, bytes.configBytes);
  await writeExclusive(lockSource, bytes.lockBytes);
  await syncDirectory(transactionDir);
  await options.checkpoint?.("after-source-flush");

  const journal: ProjectStateJournal = {
    version: 1,
    id,
    phase: "prepared",
    config: {
      target: "config.json",
      source: relative(paths.stateDir, configSource),
      install: relative(paths.stateDir, join(transactionDir, "config.install")),
      sha256: digest(bytes.configBytes),
    },
    lock: {
      target: "card.lock",
      source: relative(paths.stateDir, lockSource),
      install: relative(paths.stateDir, join(transactionDir, "lock.install")),
      sha256: digest(bytes.lockBytes),
    },
  };
  await atomicWriteJson(paths.journal, journal, paths.stateDir, id);
  await options.checkpoint?.("after-journal-flush");

  await installTarget(paths.stateDir, journal.config, () => options.checkpoint?.("after-config-rename"));
  await advanceJournal(projectRoot, journal, "config-written");
  await options.checkpoint?.("after-config-phase");
  await installTarget(paths.stateDir, journal.lock, () => options.checkpoint?.("after-lock-rename"));
  await advanceJournal(projectRoot, journal, "lock-written");
  await options.checkpoint?.("after-lock-phase");
  if (await hashFile(paths.configTarget) !== journal.config.sha256 || await hashFile(paths.lockTarget) !== journal.lock.sha256) {
    throw new DrwnError("PROJECT_STATE_TRANSACTION_RECOVERY_FAILED", "Committed project state hashes do not match prepared bytes");
  }
  await advanceJournal(projectRoot, journal, "committed");
  await options.checkpoint?.("after-committed-journal");
  await unlink(paths.journal);
  await syncDirectory(paths.stateDir);
  await options.checkpoint?.("after-journal-unlink");
  await rm(transactionDir, { recursive: true, force: true });
  await syncDirectory(paths.transactionsDir);
  await options.checkpoint?.("after-transaction-remove");
  return { dryRun: false as const, id };
}

export async function commitProjectState(
  projectRoot: string,
  bytes: ProjectStateBytes,
  options: ProjectStateTransactionOptions = {},
) {
  if (options.dryRun) return { dryRun: true, configBytes: bytes.configBytes, lockBytes: bytes.lockBytes };
  const result = await withProjectStateLock(projectRoot, (owner) => commitUnderLock(projectRoot, owner, bytes, options));
  await options.checkpoint?.("after-lock-release");
  return result;
}

export async function mutateProjectState<T>(
  projectRoot: string,
  prepare: (snapshot: ProjectStateSnapshot) => Promise<{ bytes: ProjectStateBytes; value: T }>,
  options: ProjectStateTransactionOptions = {},
): Promise<T> {
  if (options.dryRun) {
    return (await prepare(await readSnapshotUnlocked(projectRoot))).value;
  }
  const value = await withProjectStateLock(projectRoot, async (owner) => {
    const prepared = await prepare(await readSnapshotUnlocked(projectRoot));
    await commitUnderLock(projectRoot, owner, prepared.bytes, options);
    return prepared.value;
  });
  await options.checkpoint?.("after-lock-release");
  return value;
}

export async function readProjectStateSnapshot(projectRoot: string): Promise<ProjectStateSnapshot> {
  return withProjectStateLock(projectRoot, () => readSnapshotUnlocked(projectRoot));
}
