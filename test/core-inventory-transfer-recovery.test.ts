// ABOUTME: Verifies interrupted additive inventory sync leaves only valid retryable records.
// ABOUTME: Exercises Task 81 package and MCP commit checkpoints under the global inventory lock.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createPortableInventoryBundle } from "../cli/core/inventory-bundle";
import { snapshotPortableInventory, syncPortableInventory } from "../cli/core/inventory-transfer";
import { cleanupTempRoots, createInstalledSkillBundle, scaffoldCliFixture } from "./helpers";
import { seedMcpInventory } from "./mcp-inventory-fixture";

const roots: string[] = [];

afterEach(async () => cleanupTempRoots(roots));

async function recoveryFixture() {
  const source = await scaffoldCliFixture();
  const target = await scaffoldCliFixture();
  roots.push(source.root, target.root);
  await createInstalledSkillBundle(source.agentsDir, {
    packageName: "recovery-package",
    version: "3.2.1",
    skillName: "recovery-skill",
  });
  await seedMcpInventory(source.agentsDir, {
    version: 1,
    servers: {
      "recovery-mcp": {
        description: "Recovery MCP",
        transport: "stdio",
        command: "recovery-mcp",
        optional: false,
      },
    },
  });
  const bundlePath = join(source.root, "recovery.tar.gz");
  await createPortableInventoryBundle({ agentsDir: source.agentsDir, outputPath: bundlePath });
  return { source, target, bundlePath };
}

test("interruption before the first commit installs no inventory entries", async () => {
  const { target, bundlePath } = await recoveryFixture();

  await expect(syncPortableInventory({
    agentsDir: target.agentsDir,
    repoRoot: target.repoRoot,
    sourcePath: bundlePath,
    checkpoint: ({ phase }) => {
      if (phase === "before-first-commit") throw new Error("interrupt-before-first");
    },
  })).rejects.toThrow("interrupt-before-first");

  expect((await snapshotPortableInventory({ agentsDir: target.agentsDir })).manifest.entries).toEqual([]);
});

test("interruption after package version rename leaves an inactive version and retry installs it", async () => {
  const { target, bundlePath } = await recoveryFixture();

  await expect(syncPortableInventory({
    agentsDir: target.agentsDir,
    repoRoot: target.repoRoot,
    sourcePath: bundlePath,
    checkpoint: ({ phase, checkpoint }) => {
      if (phase === "package-commit" && checkpoint === "after-version-rename") throw new Error("interrupt-after-version");
    },
  })).rejects.toThrow("interrupt-after-version");

  const packageRoot = join(target.agentsDir, "drwn", "skills", "recovery-package");
  expect(existsSync(join(packageRoot, "3.2.1"))).toBe(true);
  expect(existsSync(join(packageRoot, "current"))).toBe(false);

  const retry = await syncPortableInventory({ agentsDir: target.agentsDir, repoRoot: target.repoRoot, sourcePath: bundlePath });
  expect(retry.summary.installed).toBe(2);
  expect(existsSync(join(packageRoot, "current"))).toBe(true);
});

test("interruption after package pointer leaves a valid package and retry completes MCP", async () => {
  const { target, bundlePath } = await recoveryFixture();

  await expect(syncPortableInventory({
    agentsDir: target.agentsDir,
    repoRoot: target.repoRoot,
    sourcePath: bundlePath,
    checkpoint: ({ phase, checkpoint }) => {
      if (phase === "package-commit" && checkpoint === "after-pointer-write") throw new Error("interrupt-after-pointer");
    },
  })).rejects.toThrow("interrupt-after-pointer");

  expect((await snapshotPortableInventory({ agentsDir: target.agentsDir })).manifest.entries.map((entry) => entry.kind)).toEqual([
    "skill-package",
  ]);
  const retry = await syncPortableInventory({ agentsDir: target.agentsDir, repoRoot: target.repoRoot, sourcePath: bundlePath });
  expect(retry.actions.map((entry) => entry.action)).toEqual(["no-op", "installed"]);
});

test("interruption after one MCP write leaves a valid record and retry is idempotent", async () => {
  const { target, bundlePath } = await recoveryFixture();

  await expect(syncPortableInventory({
    agentsDir: target.agentsDir,
    repoRoot: target.repoRoot,
    sourcePath: bundlePath,
    checkpoint: ({ phase, checkpoint }) => {
      if (phase === "mcp-commit" && checkpoint === "after-record-write") throw new Error("interrupt-after-mcp");
    },
  })).rejects.toThrow("interrupt-after-mcp");

  expect((await snapshotPortableInventory({ agentsDir: target.agentsDir })).manifest.entries).toHaveLength(2);
  const retry = await syncPortableInventory({ agentsDir: target.agentsDir, repoRoot: target.repoRoot, sourcePath: bundlePath });
  expect(retry.actions.map((entry) => entry.action)).toEqual(["no-op", "no-op"]);
});
