// ABOUTME: Enforces the global inventory-to-machine-to-project mutation lock order.
// ABOUTME: Supports reentrant same-operation calls without introducing per-record locks.

import { AsyncLocalStorage } from "node:async_hooks";
import { resolve } from "node:path";
import { DrwnError } from "./errors";
import { withOwnerLock, type OwnerLockOptions, type OwnerLockRecord } from "./owner-lock";
import { resolveInventoryLockPath, resolveMachineLockPath } from "./store-paths";

type LockLevel = 0 | 1 | 2;

interface HeldLock {
  level: LockLevel;
  path: string;
  owner: OwnerLockRecord;
}

const heldLocks = new AsyncLocalStorage<HeldLock[]>();

async function withOrderedOwnerLock<T>(
  level: LockLevel,
  options: OwnerLockOptions,
  operation: (owner: OwnerLockRecord) => Promise<T>,
): Promise<T> {
  const path = resolve(options.path);
  const held = heldLocks.getStore() ?? [];
  const reentrant = held.find((entry) => entry.path === path);
  if (reentrant) return operation(reentrant.owner);

  const previous = held.at(-1);
  if (previous && (previous.level > level || (previous.level === level && previous.path.localeCompare(path) > 0))) {
    throw new DrwnError(
      "INVENTORY_LOCK_ORDER_VIOLATION",
      `Lock order violation: cannot acquire ${path} while holding ${previous.path}`,
    );
  }

  return withOwnerLock(options, async (owner) =>
    heldLocks.run([...held, { level, path, owner }], () => operation(owner))
  );
}

export function withInventoryLock<T>(agentsDir: string, operation: (owner: OwnerLockRecord) => Promise<T>): Promise<T> {
  return withOrderedOwnerLock(0, {
    path: resolveInventoryLockPath(agentsDir),
    label: "Machine inventory transaction",
    busyCode: "INVENTORY_TRANSACTION_BUSY",
    unrecoverableCode: "INVENTORY_TRANSACTION_LOCK_UNRECOVERABLE",
  }, operation);
}

export function withMachineLock<T>(agentsDir: string, operation: (owner: OwnerLockRecord) => Promise<T>): Promise<T> {
  return withOrderedOwnerLock(1, {
    path: resolveMachineLockPath(agentsDir),
    label: "Machine config transaction",
    busyCode: "MACHINE_TRANSACTION_BUSY",
    unrecoverableCode: "MACHINE_TRANSACTION_LOCK_UNRECOVERABLE",
  }, operation);
}

export function withOrderedProjectOwnerLock<T>(
  lockPath: string,
  operation: (owner: OwnerLockRecord) => Promise<T>,
): Promise<T> {
  return withOrderedOwnerLock(2, {
    path: lockPath,
    label: "Project state transaction",
    busyCode: "PROJECT_STATE_TRANSACTION_BUSY",
    unrecoverableCode: "PROJECT_STATE_TRANSACTION_LOCK_UNRECOVERABLE",
  }, operation);
}

export function currentInventoryLockPaths(): string[] {
  return (heldLocks.getStore() ?? []).map((entry) => entry.path);
}
