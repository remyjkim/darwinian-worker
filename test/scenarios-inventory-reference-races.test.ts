// ABOUTME: Exercises inventory-to-project lock ordering for reference creation and removal.
// ABOUTME: Proves project intent cannot race into missing standalone inventory.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findStandaloneMcpRecord, findStandaloneSkillPackageBySkillId } from "../cli/core/inventory";
import { currentInventoryLockPaths } from "../cli/core/inventory-lock";
import { createMcpLibraryRecord, removeMcpLibraryRecord } from "../cli/core/mcp-library";
import { includeProjectSkill, setProjectServerOverride } from "../cli/core/project-writes";
import { registerProject } from "../cli/core/project-registry";
import { resolveInventoryLockPath } from "../cli/core/store-paths";
import { cleanupTempRoots, createInstalledSkillBundle, createTempRoot, writeSupportedProjectConfig } from "./helpers";

const roots: string[] = [];
afterEach(async () => cleanupTempRoots(roots.splice(0)));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("standalone skill reference creation holds inventory before project state", async () => {
  const root = await createTempRoot("inventory-reference-race-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  const projectRoot = join(root, "project");
  await createInstalledSkillBundle(agentsDir, { skillName: "hello-skill" });
  await writeSupportedProjectConfig(projectRoot);
  await registerProject(agentsDir, projectRoot);
  const acquired = deferred();
  const release = deferred();
  let observedLocks: string[] = [];

  const adding = includeProjectSkill(agentsDir, projectRoot, "hello-skill", {
    validate: async () => {
      expect(await findStandaloneSkillPackageBySkillId(agentsDir, "hello-skill")).not.toBeNull();
    },
    checkpoint: async (name) => {
      if (name === "after-project-lock") {
        observedLocks = currentInventoryLockPaths();
        acquired.resolve();
        await release.promise;
      }
    },
  });
  await acquired.promise;

  expect(observedLocks[0]).toBe(resolveInventoryLockPath(agentsDir));
  expect(observedLocks[1]).toContain(".state-transaction.lock");
  const removeWhileAdding = await import("../cli/core/skill-packages").then(({ uninstallSkillPackage }) =>
    uninstallSkillPackage(agentsDir, "@acme/skills-sample").then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    )
  );
  expect(removeWhileAdding).toMatchObject({ ok: false, error: { code: "INVENTORY_TRANSACTION_BUSY" } });

  release.resolve();
  await adding;
  const config = JSON.parse(await readFile(join(projectRoot, ".agents", "drwn", "config.json"), "utf8"));
  expect(config.skills.include).toEqual(["hello-skill"]);
});

test("a removed MCP record cannot gain a project reference", async () => {
  const root = await createTempRoot("inventory-reference-remove-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  const projectRoot = join(root, "project");
  await writeSupportedProjectConfig(projectRoot);
  await createMcpLibraryRecord(agentsDir, "ephemeral", {
    description: "Ephemeral",
    transport: "stdio",
    command: "ephemeral",
    optional: true,
  });
  await removeMcpLibraryRecord(agentsDir, "ephemeral");

  await expect(setProjectServerOverride(agentsDir, projectRoot, "ephemeral", { enabled: true }, {
    validate: async () => {
      if (!await findStandaloneMcpRecord(agentsDir, "ephemeral")) throw new Error("standalone MCP record disappeared");
    },
  })).rejects.toThrow("standalone MCP record disappeared");
  expect(existsSync(join(projectRoot, ".agents", "drwn", "config.json"))).toBe(true);
  const config = JSON.parse(await readFile(join(projectRoot, ".agents", "drwn", "config.json"), "utf8"));
  expect(config.mcpServers).toBeUndefined();
});

test("concurrent project capability writes preserve both updates", async () => {
  const root = await createTempRoot("inventory-reference-updates-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  const projectRoot = join(root, "project");
  await writeSupportedProjectConfig(projectRoot);

  const results = await Promise.allSettled([
    includeProjectSkill(agentsDir, projectRoot, "alpha"),
    setProjectServerOverride(agentsDir, projectRoot, "context7", { enabled: true }),
  ]);
  for (const result of results.filter((entry) => entry.status === "rejected")) {
    expect((result as PromiseRejectedResult).reason).toMatchObject({ code: "INVENTORY_TRANSACTION_BUSY" });
  }
  if (results[0]?.status === "rejected") await includeProjectSkill(agentsDir, projectRoot, "alpha");
  if (results[1]?.status === "rejected") await setProjectServerOverride(agentsDir, projectRoot, "context7", { enabled: true });

  const config = JSON.parse(await readFile(join(projectRoot, ".agents", "drwn", "config.json"), "utf8"));
  expect(config.skills.include).toEqual(["alpha"]);
  expect(config.mcpServers.context7).toEqual({ enabled: true });
});

test("concurrent project registry writers preserve both registrations", async () => {
  const root = await createTempRoot("inventory-registry-updates-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  const projects = [join(root, "project-a"), join(root, "project-b")];
  await Promise.all(projects.map((projectRoot) => writeSupportedProjectConfig(projectRoot)));

  const results = await Promise.allSettled(projects.map((projectRoot) => registerProject(agentsDir, projectRoot)));
  for (const result of results.filter((entry) => entry.status === "rejected")) {
    expect((result as PromiseRejectedResult).reason).toMatchObject({ code: "INVENTORY_TRANSACTION_BUSY" });
  }
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") await registerProject(agentsDir, projects[index]!);
  }

  const { listRegisteredProjects } = await import("../cli/core/project-registry");
  expect(await listRegisteredProjects(agentsDir)).toEqual([...projects].sort());
});
