// ABOUTME: Verifies typed, integrity-derived views of standalone machine inventory.
// ABOUTME: Keeps package and exported-skill identity lookups explicit and unambiguous.

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import {
  findStandaloneSkillPackageByName,
  findStandaloneSkillPackageBySkillId,
  listStandaloneSkillPackages,
} from "../cli/core/inventory";
import { cleanupTempRoots, createInstalledSkillBundle, createTempRoot } from "./helpers";

const roots: string[] = [];

afterEach(async () => cleanupTempRoots(roots.splice(0)));

test("standalone skill package views derive complete-tree integrity from validated bytes", async () => {
  const root = await createTempRoot("inventory-view-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  const installed = await createInstalledSkillBundle(agentsDir, {
    packageName: "@acme/toolkit",
    skillName: "toolkit-skill",
  });

  const records = await listStandaloneSkillPackages(agentsDir);

  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    kind: "skill-package",
    packageName: installed.packageName,
    activeVersion: installed.version,
    exportedSkillIds: [installed.skillName],
  });
  expect(records[0]?.integrity).toMatch(/^sha256-[a-f0-9]{64}$/);
});

test("package and exported-skill lookup use separate explicit APIs", async () => {
  const root = await createTempRoot("inventory-lookup-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  await createInstalledSkillBundle(agentsDir, {
    packageName: "same-name",
    skillName: "exported-skill",
  });

  expect((await findStandaloneSkillPackageByName(agentsDir, "same-name"))?.packageName).toBe("same-name");
  expect((await findStandaloneSkillPackageBySkillId(agentsDir, "exported-skill"))?.packageName).toBe("same-name");
  expect(await findStandaloneSkillPackageByName(agentsDir, "exported-skill")).toBeNull();
  expect(await findStandaloneSkillPackageBySkillId(agentsDir, "same-name")).toBeNull();
});
