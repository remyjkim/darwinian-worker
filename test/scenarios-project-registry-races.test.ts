// ABOUTME: Verifies project registry writers participate in the global inventory lock protocol.
// ABOUTME: Prevents registration changes from racing reference-sensitive inventory removal.

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { withInventoryLock } from "../cli/core/inventory-lock";
import { listRegisteredProjects, registerProject } from "../cli/core/project-registry";
import { cleanupTempRoots, createTempRoot, writeSupportedProjectConfig } from "./helpers";

const roots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(roots.splice(0));
});

test("registerProject fails busy instead of writing outside a held inventory transaction", async () => {
  const root = await createTempRoot("project-registry-race-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  const projectRoot = join(root, "project");
  await writeSupportedProjectConfig(projectRoot);

  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const holder = withInventoryLock(agentsDir, async () => {
    acquired();
    await blocked;
  });
  await lockAcquired;

  await expect(registerProject(agentsDir, projectRoot)).rejects.toMatchObject({
    code: "INVENTORY_TRANSACTION_BUSY",
  });
  expect(await listRegisteredProjects(agentsDir)).toEqual([]);

  release();
  await holder;
  await registerProject(agentsDir, projectRoot);
  expect(await listRegisteredProjects(agentsDir)).toEqual([projectRoot]);
});
