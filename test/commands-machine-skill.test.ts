// ABOUTME: Verifies the first supported machine skill inventory lifecycle commands.
// ABOUTME: Pins inactive installation, explicit selection, references, and package-scoped removal.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createEmptyMachineConfig, initializeMachineConfig, readMachineConfigFile, writeMachineConfigFile } from "../cli/core/machine-config";
import { findStandaloneSkillPackageByName } from "../cli/core/inventory";
import { registerProject } from "../cli/core/project-registry";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import {
  cleanupTempRoots,
  createInstalledSkillBundle,
  createSkillBundleFixture,
  envFor,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";

const roots: string[] = [];

afterEach(async () => cleanupTempRoots(roots.splice(0)));

async function fixture() {
  const state = await scaffoldCliFixture();
  roots.push(state.root);
  await initializeMachineConfig(resolveMachineConfigPath(state.agentsDir));
  return state;
}

test("machine skill list and show distinguish package and skill identity", async () => {
  const state = await fixture();
  const installed = await createInstalledSkillBundle(state.agentsDir, {
    packageName: "@acme/toolkit",
    skillName: "toolkit-skill",
  });

  const listed = await runAgentsCli(["machine", "skill", "list", "--json"], envFor(state));
  expect(listed.exitCode).toBe(0);
  const entries = JSON.parse(listed.stdout) as Array<Record<string, unknown>>;
  expect(entries).toContainEqual(expect.objectContaining({
    kind: "skill-package",
    owner: "standalone",
    packageName: installed.packageName,
    exportedSkillIds: [installed.skillName],
  }));
  expect(entries).toContainEqual(expect.objectContaining({
    kind: "skill",
    id: installed.skillName,
    owner: "standalone",
    packageName: installed.packageName,
    enabled: false,
  }));

  const skill = await runAgentsCli(["machine", "skill", "show", installed.skillName, "--json"], envFor(state));
  expect(skill.exitCode).toBe(0);
  expect(JSON.parse(skill.stdout)).toMatchObject({ kind: "skill", id: installed.skillName });
  const packageResult = await runAgentsCli(["machine", "skill", "show", "--package", installed.packageName, "--json"], envFor(state));
  expect(packageResult.exitCode).toBe(0);
  expect(JSON.parse(packageResult.stdout)).toMatchObject({ kind: "skill-package", packageName: installed.packageName });

  const ambiguous = await runAgentsCli(["machine", "skill", "show", installed.packageName, "--json"], envFor(state));
  expect(ambiguous.exitCode).not.toBe(0);
});

test("machine skill install is inactive and dry-run leaves no managed package", async () => {
  const state = await fixture();
  const source = await createSkillBundleFixture(join(state.root, "source"), {
    packageName: "@acme/installable",
    version: "1.0.0",
    skillName: "installable-skill",
  });

  const preview = await runAgentsCli(["machine", "skill", "install", source.bundleRoot, "--dry-run", "--json"], envFor(state));
  expect(preview.exitCode).toBe(0);
  expect(JSON.parse(preview.stdout)).toMatchObject({
    action: "would-install",
    packageName: source.packageName,
    enabled: false,
  });
  expect(await findStandaloneSkillPackageByName(state.agentsDir, source.packageName)).toBeNull();

  const installed = await runAgentsCli(["machine", "skill", "install", source.bundleRoot, "--json"], envFor(state));
  expect(installed.exitCode).toBe(0);
  expect(JSON.parse(installed.stdout)).toMatchObject({ action: "installed", packageName: source.packageName, enabled: false });
  expect((await readMachineConfigFile(resolveMachineConfigPath(state.agentsDir)))?.capabilities.skills).toEqual([]);

  const invalidFlags = await runAgentsCli(["machine", "skill", "install", source.bundleRoot, "--as", "renamed"], envFor(state));
  expect(invalidFlags.exitCode).not.toBe(0);
});

test("machine skill references disclose known scope and uninstall blocks declared intent", async () => {
  const state = await fixture();
  const installed = await createInstalledSkillBundle(state.agentsDir, {
    packageName: "@acme/referenced",
    skillName: "referenced-skill",
  });
  const machinePath = resolveMachineConfigPath(state.agentsDir);
  const machine = createEmptyMachineConfig();
  machine.capabilities.skills = [installed.skillName];
  await writeMachineConfigFile(machinePath, machine);
  const projectRoot = join(state.root, "project");
  await writeSupportedProjectConfig(projectRoot, { skills: { include: [installed.skillName], exclude: [] } });
  await registerProject(state.agentsDir, projectRoot);

  const references = await runAgentsCli([
    "machine", "skill", "references", "--package", installed.packageName, "--json",
  ], envFor(state));
  expect(references.exitCode).toBe(0);
  expect(JSON.parse(references.stdout)).toMatchObject({
    resource: { kind: "skill-package", packageName: installed.packageName },
    scope: { kind: "declared-known-scope", projectRoots: [projectRoot] },
  });
  expect(JSON.parse(references.stdout).references).toHaveLength(2);

  const blocked = await runAgentsCli(["machine", "skill", "uninstall", installed.packageName, "--json"], envFor(state));
  expect(blocked.exitCode).not.toBe(0);
  expect(await findStandaloneSkillPackageByName(state.agentsDir, installed.packageName)).not.toBeNull();
});

test("machine skill update blocks dropping referenced IDs and switches current only after intent is cleared", async () => {
  const state = await fixture();
  const installed = await createInstalledSkillBundle(state.agentsDir, {
    packageName: "@acme/updatable",
    version: "1.0.0",
    skillName: "old-skill",
  });
  const replacement = await createSkillBundleFixture(join(state.root, "replacement"), {
    packageName: installed.packageName,
    version: "2.0.0",
    skillName: "new-skill",
  });
  const machinePath = resolveMachineConfigPath(state.agentsDir);
  const machine = createEmptyMachineConfig();
  machine.capabilities.skills = [installed.skillName];
  await writeMachineConfigFile(machinePath, machine);

  const blocked = await runAgentsCli([
    "machine", "skill", "update", installed.packageName, "--from", replacement.bundleRoot, "--json",
  ], envFor(state));
  expect(blocked.exitCode).not.toBe(0);
  expect((await findStandaloneSkillPackageByName(state.agentsDir, installed.packageName))?.activeVersion).toBe("1.0.0");

  machine.capabilities.skills = [];
  await writeMachineConfigFile(machinePath, machine);
  const updated = await runAgentsCli([
    "machine", "skill", "update", installed.packageName, "--from", replacement.bundleRoot, "--json",
  ], envFor(state));
  expect(updated.exitCode).toBe(0);
  expect(JSON.parse(updated.stdout)).toMatchObject({ action: "updated", fromVersion: "1.0.0", toVersion: "2.0.0" });
  expect((await findStandaloneSkillPackageByName(state.agentsDir, installed.packageName))?.exportedSkillIds).toEqual(["new-skill"]);
});

test("machine skill enable and disable mutate only explicit intent and report remaining profile provenance", async () => {
  const state = await fixture();
  const installed = await createInstalledSkillBundle(state.agentsDir, { skillName: "toggle-skill" });
  const enabled = await runAgentsCli(["machine", "skill", "enable", installed.skillName, "--json"], envFor(state));
  expect(enabled.exitCode).toBe(0);
  expect(JSON.parse(enabled.stdout)).toMatchObject({ action: "enabled", id: installed.skillName });

  const machinePath = resolveMachineConfigPath(state.agentsDir);
  const machine = (await readMachineConfigFile(machinePath))!;
  machine.capabilities.profile = {
    id: "darwinian-operator",
    source: "git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2",
    name: "@darwinian/operator",
    version: "1.0.2",
    commit: "6b2998c51b7c736c70c2e522cb8d7b3170e816d8",
    treeSha: "2297dfc30783200a2b6a0da1189d7de20a01f23c",
    integrity: "sha256-284cd3ba4880a60ba93b81c0be0dd15796b27a640ed697fdb1a18fe6b5ff30d9",
    skills: ["bootstrap-project"],
    mcpServers: [],
  };
  machine.capabilities.skills.push("bootstrap-project");
  await writeMachineConfigFile(machinePath, machine);
  const disabled = await runAgentsCli(["machine", "skill", "disable", "bootstrap-project", "--json"], envFor(state));
  expect(disabled.exitCode).toBe(0);
  expect(JSON.parse(disabled.stdout)).toMatchObject({
    action: "disabled",
    remainingProvenance: ["profile:darwinian-operator"],
  });
  expect((await readMachineConfigFile(machinePath))?.capabilities.skills).not.toContain("bootstrap-project");
  expect(existsSync(machinePath)).toBe(true);
});
