// ABOUTME: Verifies guarded planning and pruning for standalone inventory garbage.
// ABOUTME: Ensures current inventory, young versions, foreign paths, and malformed state fail closed.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, symlink, utimes, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { planInventoryGc, pruneInventoryGc } from "../cli/core/inventory-gc";
import { tombstoneInventoryPath } from "../cli/core/inventory-tombstones";
import {
  resolveInventoryTombstonesRoot,
  resolveStoreMcpServersDir,
  resolveStoreRoot,
  resolveStoreSkillPackageRoot,
} from "../cli/core/store-paths";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const roots: string[] = [];
const NOW = new Date("2026-07-13T12:00:00.000Z");
const OLD_TEMP = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);
const OLD_VERSION = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000);
const YOUNG_VERSION = new Date(NOW.getTime() - 29 * 24 * 60 * 60 * 1000);

afterEach(async () => cleanupTempRoots(roots.splice(0)));

async function fixture() {
  const root = await createTempRoot("inventory-gc-");
  roots.push(root);
  return { root, agentsDir: join(root, ".agents") };
}

async function writeVersion(agentsDir: string, packageName: string, version: string, modified: Date) {
  const versionRoot = join(resolveStoreSkillPackageRoot(agentsDir, packageName), version);
  await mkdir(versionRoot, { recursive: true });
  await writeFile(join(versionRoot, "bundle.json"), `${JSON.stringify({
    schemaVersion: 1,
    bundleName: packageName,
    version,
    skills: [],
  }, null, 2)}\n`);
  await writeFile(join(versionRoot, "README.md"), `${packageName}@${version}\n`);
  await utimes(versionRoot, modified, modified);
  return versionRoot;
}

async function snapshot(root: string): Promise<Array<[string, string]>> {
  if (!existsSync(root)) return [];
  const result: Array<[string, string]> = [];
  async function walk(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true }).then((entries) => entries.sort((a, b) => a.name.localeCompare(b.name)))) {
      const child = join(path, entry.name);
      const key = relative(root, child).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        result.push([`${key}/`, ""]);
        await walk(child);
      } else if (entry.isFile()) {
        result.push([key, await readFile(child, "utf8")]);
      } else {
        result.push([key, "other"]);
      }
    }
  }
  await walk(root);
  return result;
}

describe("inventory GC", () => {
  test("planning is deterministic and read-only while classifying only approved paths", async () => {
    const state = await fixture();
    const packageName = "@acme/sample";
    const oldInactive = await writeVersion(state.agentsDir, packageName, "1.0.0", OLD_VERSION);
    const current = await writeVersion(state.agentsDir, packageName, "2.0.0", OLD_VERSION);
    const youngInactive = await writeVersion(state.agentsDir, packageName, "3.0.0", YOUNG_VERSION);
    await writeFile(join(resolveStoreSkillPackageRoot(state.agentsDir, packageName), "current"), "2.0.0\n");

    const mcpRoot = resolveStoreMcpServersDir(state.agentsDir);
    await mkdir(mcpRoot, { recursive: true });
    await writeFile(join(mcpRoot, "kept.json"), `${JSON.stringify({ description: "Kept", transport: "stdio", command: "kept", optional: true })}\n`);
    const oldTemp = join(mcpRoot, "kept.json.tmp.0123456789abcdef");
    await writeFile(oldTemp, "partial\n");
    await utimes(oldTemp, OLD_TEMP, OLD_TEMP);
    const foreign = join(mcpRoot, "README.txt");
    await writeFile(foreign, "foreign\n");

    const before = await snapshot(resolveStoreRoot(state.agentsDir));
    const first = await planInventoryGc(state.agentsDir, { now: NOW });
    const second = await planInventoryGc(state.agentsDir, { now: NOW });

    expect(second).toEqual(first);
    expect(await snapshot(resolveStoreRoot(state.agentsDir))).toEqual(before);
    expect(first.eligible.map((entry) => entry.path)).toEqual([
      relative(resolveStoreRoot(state.agentsDir), oldTemp).replaceAll("\\", "/"),
      relative(resolveStoreRoot(state.agentsDir), oldInactive).replaceAll("\\", "/"),
    ]);
    expect(first.kept).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "mcp-servers/kept.json", reason: "current-mcp-record" }),
      expect.objectContaining({ path: "mcp-servers/README.txt", reason: "foreign-path" }),
      expect.objectContaining({ path: relative(resolveStoreRoot(state.agentsDir), current).replaceAll("\\", "/"), reason: "current-package-version" }),
      expect.objectContaining({ path: relative(resolveStoreRoot(state.agentsDir), youngInactive).replaceAll("\\", "/"), reason: "retention-window" }),
    ]));
  });

  test("prune re-plans under the inventory lock and removes only eligible paths", async () => {
    const state = await fixture();
    const packageName = "sample";
    const inactive = await writeVersion(state.agentsDir, packageName, "1.0.0", OLD_VERSION);
    const current = await writeVersion(state.agentsDir, packageName, "2.0.0", OLD_VERSION);
    await writeFile(join(resolveStoreSkillPackageRoot(state.agentsDir, packageName), "current"), "2.0.0\n");
    const youngTemp = join(resolveStoreSkillPackageRoot(state.agentsDir, packageName), "current.tmp.0123456789abcdef");
    await writeFile(youngTemp, "3.0.0\n");

    const result = await pruneInventoryGc(state.agentsDir, { now: NOW });

    expect(result.mode).toBe("prune");
    expect(result.removed).toContain(relative(resolveStoreRoot(state.agentsDir), inactive).replaceAll("\\", "/"));
    expect(existsSync(inactive)).toBe(false);
    expect((await lstat(current)).isDirectory()).toBe(true);
    expect(await readFile(youngTemp, "utf8")).toBe("3.0.0\n");
  });

  test("malformed package state fails before deleting an otherwise eligible path", async () => {
    const state = await fixture();
    const validRoot = resolveStoreSkillPackageRoot(state.agentsDir, "valid");
    const eligible = await writeVersion(state.agentsDir, "valid", "1.0.0", OLD_VERSION);
    await mkdir(validRoot, { recursive: true });
    const brokenRoot = resolveStoreSkillPackageRoot(state.agentsDir, "broken");
    await mkdir(brokenRoot, { recursive: true });
    await writeFile(join(brokenRoot, "current"), "not-semver\n");

    await expect(pruneInventoryGc(state.agentsDir, { now: NOW })).rejects.toMatchObject({ code: "INVENTORY_GC_INVALID" });
    expect(existsSync(eligible)).toBe(true);
  });

  test("symlink current pointers fail closed", async () => {
    const state = await fixture();
    const packageRoot = resolveStoreSkillPackageRoot(state.agentsDir, "linked");
    await writeVersion(state.agentsDir, "linked", "1.0.0", OLD_VERSION);
    await symlink("1.0.0", join(packageRoot, "current"));

    await expect(planInventoryGc(state.agentsDir, { now: NOW })).rejects.toMatchObject({ code: "INVENTORY_GC_INVALID" });
  });

  test("valid interrupted tombstones are planned and recovered while malformed evidence is preserved", async () => {
    const state = await fixture();
    const source = resolveStoreSkillPackageRoot(state.agentsDir, "removed");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "current"), "1.0.0\n");
    await expect(tombstoneInventoryPath({
      agentsDir: state.agentsDir,
      kind: "skill-package",
      sourcePath: source,
      checkpoint: (name) => { if (name === "after-rename") throw new Error("crash"); },
    })).rejects.toThrow("crash");

    const planned = await planInventoryGc(state.agentsDir, { now: NOW });
    expect(planned.eligible).toContainEqual(expect.objectContaining({ kind: "tombstone" }));
    const pruned = await pruneInventoryGc(state.agentsDir, { now: NOW });
    expect(pruned.recoveredTombstones).toHaveLength(1);
    expect(await readdir(resolveInventoryTombstonesRoot(state.agentsDir))).toEqual([]);

    await writeFile(join(resolveInventoryTombstonesRoot(state.agentsDir), "foreign.txt"), "foreign\n");
    await expect(pruneInventoryGc(state.agentsDir, { now: NOW })).rejects.toMatchObject({ code: "INVENTORY_TOMBSTONE_INVALID" });
    expect(existsSync(join(resolveInventoryTombstonesRoot(state.agentsDir), "foreign.txt"))).toBe(true);
  });
});
