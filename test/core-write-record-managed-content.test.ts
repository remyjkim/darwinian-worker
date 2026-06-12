// ABOUTME: Verifies write-record drift and cleanup semantics for managed content files.
// ABOUTME: Protects fully drwn-owned generated files such as .codex/hooks.json.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupRemovedManagedPaths, verifyManagedPaths } from "../cli/core/sync";
import type { SyncResult } from "../cli/core/types";
import { hashManagedContent, loadWriteRecord, saveWriteRecord } from "../cli/core/write-record";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("managed-content write records", () => {
  test("save/load preserves content hashes", async () => {
    const root = await createTempRoot("write-record-content-");
    tempRoots.push(root);
    const recordPath = join(root, "write-record.json");

    saveWriteRecord(recordPath, {
      writeRecordVersion: 1,
      lastWriteAt: "2026-06-11T00:00:00.000Z",
      lastWriteHarnessVersion: "0.1.0",
      managedPaths: [{ path: ".codex/hooks.json", kind: "managed-content", contentHash: hashManagedContent("{}\n") }],
    });

    expect(loadWriteRecord(recordPath)?.managedPaths).toEqual([
      { path: ".codex/hooks.json", kind: "managed-content", contentHash: hashManagedContent("{}\n") },
    ]);
  });

  test("verifyManagedPaths refuses drift without force", async () => {
    const root = await createTempRoot("write-record-content-");
    tempRoots.push(root);
    const hooksPath = join(root, ".codex", "hooks.json");
    await mkdir(dirname(hooksPath), { recursive: true });
    await writeFile(hooksPath, "{}\n");
    const entry = { path: ".codex/hooks.json", kind: "managed-content" as const, contentHash: hashManagedContent("{}\n") };

    verifyManagedPaths(root, [entry], { force: false });
    await writeFile(hooksPath, '{"hooks":{}}\n');

    expect(() => verifyManagedPaths(root, [entry], { force: false })).toThrow("managed content drift");
    expect(() => verifyManagedPaths(root, [entry], { force: true })).not.toThrow();
  });

  test("cleanup removes unchanged managed content and preserves drifted content", async () => {
    const root = await createTempRoot("write-record-content-");
    tempRoots.push(root);
    const stablePath = join(root, ".codex", "hooks.json");
    const editedPath = join(root, ".codex", "edited-hooks.json");
    await mkdir(dirname(stablePath), { recursive: true });
    await writeFile(stablePath, "{}\n");
    await writeFile(editedPath, '{"edited":true}\n');
    const result: SyncResult = { changes: [], warnings: [], managedPaths: [] };

    cleanupRemovedManagedPaths(root, [
      { path: ".codex/hooks.json", kind: "managed-content", contentHash: hashManagedContent("{}\n") },
      { path: ".codex/edited-hooks.json", kind: "managed-content", contentHash: hashManagedContent("{}\n") },
    ], false, result);

    expect(existsSync(stablePath)).toBe(false);
    expect(await readFile(editedPath, "utf8")).toBe('{"edited":true}\n');
    expect(result.warnings[0]).toContain("preserved user-owned path");
  });
});
