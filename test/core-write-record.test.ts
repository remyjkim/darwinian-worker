// ABOUTME: Verifies write-record validation, atomic save, and diffing.
// ABOUTME: Protects the ownership record used for safe cleanup and drift detection.

import { afterEach, expect, test } from "bun:test";
import { existsSync, lstatSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";
import { diffWriteRecord, loadWriteRecord, saveWriteRecord } from "../cli/core/write-record";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("loadWriteRecord returns null for missing file", async () => {
  const root = await createTempRoot("write-record-");
  tempRoots.push(root);

  expect(loadWriteRecord(join(root, "missing.json"))).toBeNull();
});

test("loadWriteRecord returns null for malformed JSON", async () => {
  const root = await createTempRoot("write-record-");
  tempRoots.push(root);
  const path = join(root, "write-record.json");
  await writeFile(path, "{nope");

  expect(loadWriteRecord(path)).toBeNull();
});

test("saveWriteRecord writes the record and leaves no tmp file", async () => {
  const root = await createTempRoot("write-record-");
  tempRoots.push(root);
  const path = join(root, ".agents", "bgng", "write-record.json");
  await mkdir(join(root, ".agents", "bgng"), { recursive: true });

  saveWriteRecord(path, {
    writeRecordVersion: 1,
    lastWriteAt: "2026-05-20T00:00:00.000Z",
    lastWriteHarnessVersion: "0.1.0",
    managedPaths: [{ path: ".claude/skills/alpha", kind: "symlink", target: "/tmp/alpha" }],
  });

  expect(existsSync(path)).toBe(true);
  expect(existsSync(`${path}.tmp`)).toBe(false);
  expect(lstatSync(path).isFile()).toBe(true);
  expect(loadWriteRecord(path)?.managedPaths[0]?.path).toBe(".claude/skills/alpha");
});

test("diffWriteRecord computes additions, removals, and retained entries", () => {
  const previous = {
    writeRecordVersion: 1 as const,
    lastWriteAt: "2026-05-20T00:00:00.000Z",
    lastWriteHarnessVersion: "0.1.0",
    managedPaths: [
      { path: ".claude/skills/alpha", kind: "symlink" as const, target: "/tmp/alpha" },
      { path: ".claude/skills/beta", kind: "symlink" as const, target: "/tmp/beta" },
    ],
  };
  const desired = [
    { path: ".claude/skills/beta", kind: "symlink" as const, target: "/tmp/beta" },
    { path: ".claude/skills/gamma", kind: "symlink" as const, target: "/tmp/gamma" },
  ];

  expect(diffWriteRecord(previous, desired)).toEqual({
    toRemove: [previous.managedPaths[0]!],
    toAdd: [desired[1]!],
    toVerify: [previous.managedPaths[1]!],
  });
});
