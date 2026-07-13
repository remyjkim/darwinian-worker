// ABOUTME: Verifies atomic config/lock commits, crash recovery, and project-state mutual exclusion.
// ABOUTME: Protects immutable recovery sources and fail-closed lock/journal handling.

import { afterEach, expect, test } from "bun:test";
import { hostname } from "node:os";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  commitProjectState,
  readProjectStateSnapshot,
  transactionPaths,
  type ProjectStateCheckpoint,
} from "../cli/core/project-state-transaction";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

async function projectFixture() {
  const root = await createTempRoot("state-transaction-");
  tempRoots.push(root);
  const paths = transactionPaths(root);
  await mkdir(paths.stateDir, { recursive: true });
  await writeFile(paths.configTarget, "config-old\n");
  await writeFile(paths.lockTarget, "lock-old\n");
  return { root, paths };
}

test("commits config and lock together and removes transaction evidence", async () => {
  const { root, paths } = await projectFixture();

  await commitProjectState(root, { configBytes: "config-new\n", lockBytes: "lock-new\n" });

  expect(await readFile(paths.configTarget, "utf8")).toBe("config-new\n");
  expect(await readFile(paths.lockTarget, "utf8")).toBe("lock-new\n");
  expect(await Bun.file(paths.journal).exists()).toBe(false);
  expect(await Bun.file(paths.lock).exists()).toBe(false);
  expect(await readdir(paths.transactionsDir).catch(() => [])).toEqual([]);
});

const recoverableCheckpoints: Array<[ProjectStateCheckpoint, string, string]> = [
  ["after-source-flush", "config-old\n", "lock-old\n"],
  ["after-journal-flush", "config-new\n", "lock-new\n"],
  ["after-config-rename", "config-new\n", "lock-new\n"],
  ["after-config-phase", "config-new\n", "lock-new\n"],
  ["after-lock-rename", "config-new\n", "lock-new\n"],
  ["after-lock-phase", "config-new\n", "lock-new\n"],
  ["after-committed-journal", "config-new\n", "lock-new\n"],
  ["after-journal-unlink", "config-new\n", "lock-new\n"],
  ["after-transaction-remove", "config-new\n", "lock-new\n"],
  ["after-lock-release", "config-new\n", "lock-new\n"],
];

test.each(recoverableCheckpoints)("recovers after injected failure at %s", async (checkpoint, configBytes, lockBytes) => {
  const { root, paths } = await projectFixture();
  await expect(commitProjectState(
    root,
    { configBytes: "config-new\n", lockBytes: "lock-new\n" },
    { checkpoint: (name) => { if (name === checkpoint) throw new Error(`crash:${name}`); } },
  )).rejects.toThrow(`crash:${checkpoint}`);

  const snapshot = await readProjectStateSnapshot(root);

  expect(snapshot.configBytes).toBe(configBytes);
  expect(snapshot.lockBytes).toBe(lockBytes);
  expect(await Bun.file(paths.journal).exists()).toBe(false);
  expect(await readdir(paths.transactionsDir).catch(() => [])).toEqual([]);
});

test("recovery trusts target hashes after rename even when journal phase is stale", async () => {
  const { root, paths } = await projectFixture();
  await expect(commitProjectState(
    root,
    { configBytes: "config-new\n", lockBytes: "lock-new\n" },
    { checkpoint: (name) => { if (name === "after-config-rename") throw new Error("crash"); } },
  )).rejects.toThrow("crash");
  expect(await readFile(paths.configTarget, "utf8")).toBe("config-new\n");
  expect(JSON.parse(await readFile(paths.journal, "utf8")).phase).toBe("prepared");

  const snapshot = await readProjectStateSnapshot(root);
  expect(snapshot).toMatchObject({ configBytes: "config-new\n", lockBytes: "lock-new\n" });
});

test("concurrent or live same-host owners fail busy without mutation", async () => {
  const { root, paths } = await projectFixture();
  await writeFile(paths.lock, `${JSON.stringify({
    version: 1,
    id: "live-owner",
    hostname: hostname(),
    pid: process.pid,
    startedAt: new Date().toISOString(),
  })}\n`);

  await expect(commitProjectState(root, { configBytes: "new\n", lockBytes: "new\n" })).rejects.toMatchObject({
    code: "PROJECT_STATE_TRANSACTION_BUSY",
  });
  expect(await readFile(paths.configTarget, "utf8")).toBe("config-old\n");
  expect(await readFile(paths.lockTarget, "utf8")).toBe("lock-old\n");
});

test("a dead same-host lock is quarantined before recovery and commit", async () => {
  const { root, paths } = await projectFixture();
  await writeFile(paths.lock, `${JSON.stringify({
    version: 1,
    id: "dead-owner",
    hostname: hostname(),
    pid: 999_999_999,
    startedAt: new Date(0).toISOString(),
  })}\n`);

  await commitProjectState(root, { configBytes: "config-new\n", lockBytes: "lock-new\n" });

  const stateEntries = await readdir(paths.stateDir);
  expect(stateEntries.some((entry) => entry.startsWith(".state-transaction.lock.stale.dead-owner."))).toBe(true);
  expect(await readFile(paths.configTarget, "utf8")).toBe("config-new\n");
});

test.each([
  ["foreign", { version: 1, id: "foreign", hostname: "remote-host", pid: 42, startedAt: new Date().toISOString() }],
  ["malformed", { invalid: true }],
] as const)("a %s lock fails conservatively", async (_label, owner) => {
  const { root, paths } = await projectFixture();
  await writeFile(paths.lock, `${JSON.stringify(owner)}\n`);

  await expect(commitProjectState(root, { configBytes: "new\n", lockBytes: "new\n" })).rejects.toMatchObject({
    code: "PROJECT_STATE_TRANSACTION_LOCK_UNRECOVERABLE",
  });
  expect(await readFile(paths.configTarget, "utf8")).toBe("config-old\n");
});

test("missing immutable recovery source preserves journal evidence and fails closed", async () => {
  const { root, paths } = await projectFixture();
  await expect(commitProjectState(
    root,
    { configBytes: "config-new\n", lockBytes: "lock-new\n" },
    { checkpoint: (name) => { if (name === "after-journal-flush") throw new Error("crash"); } },
  )).rejects.toThrow("crash");
  const journal = JSON.parse(await readFile(paths.journal, "utf8"));
  await Bun.file(join(paths.stateDir, journal.config.source)).delete();

  await expect(readProjectStateSnapshot(root)).rejects.toMatchObject({
    code: "PROJECT_STATE_TRANSACTION_RECOVERY_FAILED",
  });
  expect(await Bun.file(paths.journal).exists()).toBe(true);
});

test("an escaping journal path preserves evidence and fails closed", async () => {
  const { root, paths } = await projectFixture();
  await expect(commitProjectState(
    root,
    { configBytes: "config-new\n", lockBytes: "lock-new\n" },
    { checkpoint: (name) => { if (name === "after-journal-flush") throw new Error("crash"); } },
  )).rejects.toThrow("crash");
  const journal = JSON.parse(await readFile(paths.journal, "utf8"));
  journal.config.source = "../../outside";
  await writeFile(paths.journal, `${JSON.stringify(journal, null, 2)}\n`);

  await expect(readProjectStateSnapshot(root)).rejects.toMatchObject({
    code: "PROJECT_STATE_TRANSACTION_RECOVERY_FAILED",
  });
  expect(await Bun.file(paths.journal).exists()).toBe(true);
  expect(await readFile(paths.configTarget, "utf8")).toBe("config-old\n");
});

test("dry-run creates no state, lock, journal, staging, config, or lock mutation", async () => {
  const root = await createTempRoot("state-transaction-dry-");
  tempRoots.push(root);
  const paths = transactionPaths(root);

  const result = await commitProjectState(
    root,
    { configBytes: "config-new\n", lockBytes: "lock-new\n" },
    { dryRun: true },
  );

  expect(result.dryRun).toBe(true);
  expect(await Bun.file(paths.stateDir).exists()).toBe(false);
});
