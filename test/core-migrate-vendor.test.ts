// ABOUTME: Verifies legacy generated-symlink detection and vendor migration report.
// ABOUTME: Ensures migration surgically updates write-records without dropping unrelated ownership.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadWriteRecord } from "../cli/core/write-record";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("hasLegacyGeneratedSymlinks detects generated-symlink write-record entries", async () => {
  const root = await createTempRoot("migrate-vendor-");
  tempRoots.push(root);
  await mkdir(join(root, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(root, ".agents", "drwn", "write-record.json"),
    `${JSON.stringify({
      writeRecordVersion: 1,
      managedPaths: [{ path: ".agents/drwn/generated/workers/x/skills/a", kind: "generated-symlink", generatedPath: "/store/x" }],
    }, null, 2)}\n`,
  );
  const { hasLegacyGeneratedSymlinks } = await import("../cli/core/migrate-vendor");
  expect(hasLegacyGeneratedSymlinks(root)).toBe(true);
});

test("migrateSymlinkLayerToVendor returns structured report when no symlinks remain", async () => {
  const root = await createTempRoot("migrate-vendor-report-");
  tempRoots.push(root);
  await mkdir(join(root, ".agents", "drwn"), { recursive: true });
  await writeFile(join(root, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1 }, null, 2)}\n`);
  await writeFile(
    join(root, ".agents", "drwn", "write-record.json"),
    `${JSON.stringify({
      writeRecordVersion: 1,
      lastWriteAt: "2026-01-01T00:00:00.000Z",
      lastWriteHarnessVersion: "0.0.0",
      managedPaths: [{ path: ".agents/drwn/generated/workers/x", kind: "managed-directory", contentHash: "sha256-x" }],
    }, null, 2)}\n`,
  );
  const { migrateSymlinkLayerToVendor } = await import("../cli/core/migrate-vendor");
  const report = await migrateSymlinkLayerToVendor(root, {
    repoRoot: join(root, "repo"),
    agentsDir: join(root, "agents"),
    homeDir: join(root, "home"),
  });
  expect(report.migrated).toBe(false);
  expect(report.replacedSymlinks).toBe(0);
  expect(report.vendorTreesCreated).toBe(0);
  expect(loadWriteRecord(join(root, ".agents", "drwn", "write-record.json"))?.managedPaths.some((entry) => entry.kind === "generated-symlink")).toBe(false);
});

test("migrateSymlinkLayerToVendor preserves unrelated managed-path ownership", async () => {
  const root = await createTempRoot("migrate-vendor-preserve-");
  tempRoots.push(root);
  await mkdir(join(root, ".agents", "drwn"), { recursive: true });
  await writeFile(join(root, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1 }, null, 2)}\n`);
  await writeFile(
    join(root, ".agents", "drwn", "write-record.json"),
    `${JSON.stringify({
      writeRecordVersion: 1,
      lastWriteAt: "2026-01-01T00:00:00.000Z",
      lastWriteHarnessVersion: "0.0.0",
      managedPaths: [
        { path: ".agents/drwn/generated/workers/x/skills/a", kind: "generated-symlink", generatedPath: "/store/x" },
        { path: ".cursor/mcp.json", kind: "managed-content", contentHash: "sha256-mcp" },
        { path: ".claude/skills/alpha", kind: "managed-directory", contentHash: "sha256-skill" },
      ],
    }, null, 2)}\n`,
  );
  const { migrateSymlinkLayerToVendor } = await import("../cli/core/migrate-vendor");
  await expect(
    migrateSymlinkLayerToVendor(root, {
      repoRoot: join(root, "repo"),
      agentsDir: join(root, "agents"),
      homeDir: join(root, "home"),
    }),
  ).rejects.toThrow();
  const record = loadWriteRecord(join(root, ".agents", "drwn", "write-record.json"));
  expect(record?.managedPaths.some((entry) => entry.path === ".cursor/mcp.json")).toBe(true);
  expect(record?.managedPaths.some((entry) => entry.path === ".claude/skills/alpha")).toBe(true);
});
