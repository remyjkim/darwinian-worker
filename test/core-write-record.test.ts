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

test("loadWriteRecord rejects malformed JSON", async () => {
  const root = await createTempRoot("write-record-");
  tempRoots.push(root);
  const path = join(root, "write-record.json");
  await writeFile(path, "{nope");

  expect(() => loadWriteRecord(path)).toThrow("Invalid JSON");
});

test("saveWriteRecord writes the record and leaves no tmp file", async () => {
  const root = await createTempRoot("write-record-");
  tempRoots.push(root);
  const path = join(root, ".agents", "drwn", "write-record.json");
  await mkdir(join(root, ".agents", "drwn"), { recursive: true });

  saveWriteRecord(path, {
    schema: "drwn.write-record",
    schemaVersion: 1,
    scope: "project",
    lastWriteAt: "2026-05-20T00:00:00.000Z",
    lastWriteHarnessVersion: "0.1.0",
    managedPaths: [{
      path: ".claude/skills/alpha",
      kind: "symlink",
      linkTarget: "/tmp/alpha",
      surface: "skill",
      target: "claude",
    }],
  });

  expect(existsSync(path)).toBe(true);
  expect(existsSync(`${path}.tmp`)).toBe(false);
  expect(lstatSync(path).isFile()).toBe(true);
  expect(loadWriteRecord(path)?.managedPaths[0]?.path).toBe(".claude/skills/alpha");
});

test("diffWriteRecord computes additions, removals, and retained entries", () => {
  const previous = {
    schema: "drwn.write-record" as const,
    schemaVersion: 1 as const,
    scope: "project" as const,
    lastWriteAt: "2026-05-20T00:00:00.000Z",
    lastWriteHarnessVersion: "0.1.0",
    managedPaths: [
      { path: ".claude/skills/alpha", kind: "symlink" as const, linkTarget: "/tmp/alpha", surface: "skill" as const, target: "claude" as const },
      { path: ".claude/skills/beta", kind: "symlink" as const, linkTarget: "/tmp/beta", surface: "skill" as const, target: "claude" as const },
    ],
  };
  const desired = [
    { path: ".claude/skills/beta", kind: "symlink" as const, linkTarget: "/tmp/beta", surface: "skill" as const, target: "claude" as const },
    { path: ".claude/skills/gamma", kind: "symlink" as const, linkTarget: "/tmp/gamma", surface: "skill" as const, target: "claude" as const },
  ];

  expect(diffWriteRecord(previous, desired)).toEqual({
    toRemove: [previous.managedPaths[0]!],
    toAdd: [desired[1]!],
    toVerify: [previous.managedPaths[1]!],
  });
});

test("diffWriteRecord diffs managed fields as independent ownership units", () => {
  const previous = {
    schema: "drwn.write-record" as const,
    schemaVersion: 1 as const,
    scope: "project" as const,
    lastWriteAt: "2026-05-20T00:00:00.000Z",
    lastWriteHarnessVersion: "0.1.0",
    managedPaths: [
      {
        path: ".cursor/mcp.json",
        kind: "managed-fields" as const,
        surface: "mcp" as const,
        target: "cursor" as const,
        fields: ["mcpServers:context7", "mcpServers:removed"],
        fieldHashes: {
          "mcpServers:context7": "sha256-context7",
          "mcpServers:removed": "sha256-removed",
        },
      },
    ],
  };
  const desired = [
    {
      path: ".cursor/mcp.json",
      kind: "managed-fields" as const,
      surface: "mcp" as const,
      target: "cursor" as const,
      fields: ["mcpServers:context7", "mcpServers:added"],
      fieldHashes: {
        "mcpServers:context7": "sha256-next-context7",
        "mcpServers:added": "sha256-added",
      },
    },
  ];

  expect(diffWriteRecord(previous, desired)).toEqual({
    toRemove: [{
      path: ".cursor/mcp.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "cursor",
      fields: ["mcpServers:removed"],
      fieldHashes: { "mcpServers:removed": "sha256-removed" },
    }],
    toAdd: [{
      path: ".cursor/mcp.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "cursor",
      fields: ["mcpServers:added"],
      fieldHashes: { "mcpServers:added": "sha256-added" },
    }],
    toVerify: [{
      path: ".cursor/mcp.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "cursor",
      fields: ["mcpServers:context7"],
      fieldHashes: { "mcpServers:context7": "sha256-context7" },
    }],
  });
});

test("diffWriteRecord hands off a still-desired path without whole-path cleanup", () => {
  const previous = {
    schema: "drwn.write-record" as const,
    schemaVersion: 1 as const,
    scope: "project" as const,
    lastWriteAt: "2026-07-13T00:00:00.000Z",
    lastWriteHarnessVersion: "0.8.0",
    managedPaths: [{
      path: ".cursor/mcp.json",
      kind: "managed-content" as const,
      surface: "mcp" as const,
      target: "cursor" as const,
      contentHash: "sha256-prior",
    }],
  };
  const desired = [{
    path: ".cursor/mcp.json",
    kind: "managed-fields" as const,
    surface: "mcp" as const,
    target: "cursor" as const,
    fields: ["mcpServers:notion"],
    fieldHashes: { "mcpServers:notion": "sha256-notion" },
  }];

  expect(diffWriteRecord(previous, desired)).toEqual({
    toRemove: [],
    toAdd: desired,
    toVerify: previous.managedPaths,
  });
});
