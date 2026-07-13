// ABOUTME: Verifies recoverable standalone inventory removal tombstones.
// ABOUTME: Ensures interrupted deletion cannot restore, corrupt, or claim foreign state.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";
import { recoverInventoryTombstones, tombstoneInventoryPath } from "../cli/core/inventory-tombstones";
import { resolveInventoryTombstonesRoot } from "../cli/core/store-paths";

const roots: string[] = [];

afterEach(async () => cleanupTempRoots(roots.splice(0)));

async function fixture() {
  const root = await createTempRoot("inventory-tombstone-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  const sourcePath = join(agentsDir, "drwn", "skills", "sample");
  await mkdir(sourcePath, { recursive: true });
  await writeFile(join(sourcePath, "current"), "1.0.0\n");
  return { agentsDir, sourcePath };
}

describe("inventory tombstones", () => {
  test("atomically removes then cleans a managed path", async () => {
    const state = await fixture();

    const result = await tombstoneInventoryPath({ agentsDir: state.agentsDir, kind: "skill-package", sourcePath: state.sourcePath });

    expect(result).toMatchObject({ removed: true, cleanupPending: false });
    expect(existsSync(state.sourcePath)).toBe(false);
    expect(await readdir(resolveInventoryTombstonesRoot(state.agentsDir))).toEqual([]);
  });

  test.each(["after-metadata", "after-rename"] as const)("recovers an interruption at %s", async (checkpoint) => {
    const state = await fixture();
    await expect(tombstoneInventoryPath({
      agentsDir: state.agentsDir,
      kind: "skill-package",
      sourcePath: state.sourcePath,
      checkpoint: (name) => { if (name === checkpoint) throw new Error("crash"); },
    })).rejects.toThrow("crash");

    await recoverInventoryTombstones(state.agentsDir);

    expect(await readdir(resolveInventoryTombstonesRoot(state.agentsDir))).toEqual([]);
    expect(existsSync(state.sourcePath)).toBe(checkpoint === "after-metadata");
  });

  test("fails closed for a foreign tombstone entry", async () => {
    const state = await fixture();
    const root = resolveInventoryTombstonesRoot(state.agentsDir);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "foreign.txt"), "foreign\n");

    await expect(recoverInventoryTombstones(state.agentsDir)).rejects.toMatchObject({ code: "INVENTORY_TOMBSTONE_INVALID" });
    expect(existsSync(join(root, "foreign.txt"))).toBe(true);
    await rm(root, { recursive: true, force: true });
  });
});
