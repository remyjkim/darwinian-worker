// ABOUTME: Proves the pinned Operator profile resolves once and projects exactly its machine-safe skills.
// ABOUTME: Uses isolated Stores and homes so profile installation and writes never touch developer state.

import { afterEach, expect, test } from "bun:test";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { resolveCard, writeMachineConfig } from "../cli/core/card-store";
import { resolveMachineCapabilities } from "../cli/core/defaults";
import {
  DARWINIAN_OPERATOR_PROFILE,
  DARWINIAN_OPERATOR_SKILL_IDS,
  createDarwinianOperatorPin,
} from "../cli/core/operator-profile-contract";
import {
  initializeMachineCapabilities,
  verifyMachineProfilePin,
  type MachineProfileDescriptor,
} from "../cli/core/machine-profiles";
import { readMachineConfigFile } from "../cli/core/machine-config";
import { resolveCardBareRepoPath, resolveMachineConfigPath } from "../cli/core/store-paths";
import {
  cleanupTempRoots,
  envFor,
  publishExactOperatorProfile,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("Recommended Operator resolves offline and projects exactly eight non-Mind skills", async () => {
  const source = await scaffoldCliFixture();
  const target = await scaffoldCliFixture();
  tempRoots.push(source.root, target.root);
  await publishExactOperatorProfile(source);
  const resolved = await resolveCard(source.agentsDir, `${DARWINIAN_OPERATOR_PROFILE.name}@${DARWINIAN_OPERATOR_PROFILE.version}`);
  const barePath = resolveCardBareRepoPath(source.agentsDir, DARWINIAN_OPERATOR_PROFILE.name);
  const descriptor: MachineProfileDescriptor = {
    ...DARWINIAN_OPERATOR_PROFILE,
    commit: resolved.git!.commit,
    treeSha: resolved.treeSha!,
    integrity: resolved.integrity as `sha256-${string}`,
    skills: [...DARWINIAN_OPERATOR_SKILL_IDS],
    mcpServers: [],
  };

  await initializeMachineCapabilities({
    agentsDir: target.agentsDir,
    repoRoot: target.repoRoot,
    guided: true,
    descriptor,
    resolutionRef: `git+file://${barePath}#v${DARWINIAN_OPERATOR_PROFILE.version}`,
  });
  const machine = await readMachineConfigFile(resolveMachineConfigPath(target.agentsDir));
  await expect(verifyMachineProfilePin(target.agentsDir, machine!.capabilities.profile!))
    .rejects.toMatchObject({ code: "MACHINE_PROFILE_INVALID" });
  await writeMachineConfig(target.agentsDir, {
    ...machine!,
    capabilities: { ...machine!.capabilities, profile: createDarwinianOperatorPin() },
  });
  await rm(resolveCardBareRepoPath(target.agentsDir, DARWINIAN_OPERATOR_PROFILE.name), { recursive: true, force: true });
  await verifyMachineProfilePin(target.agentsDir, createDarwinianOperatorPin());

  const capabilities = await resolveMachineCapabilities({ repoRoot: target.repoRoot, agentsDir: target.agentsDir });
  expect(capabilities.skills.map((skill) => skill.id)).toEqual([...DARWINIAN_OPERATOR_SKILL_IDS]);
  expect(capabilities.skills.every((skill) => skill.source === "profile")).toBe(true);
  expect(capabilities.mcpServers).toEqual([]);
  expect(capabilities.skills.some((skill) => /mind/i.test(skill.id))).toBe(false);

  const write = await runAgentsCli(
    ["write", "--scope", "machine", "--skills-only", "--target", "claude"],
    envFor(target),
  );
  expect(write.exitCode).toBe(0);
  expect((await readdir(join(target.homeDir, ".claude", "skills"))).sort())
    .toEqual([...DARWINIAN_OPERATOR_SKILL_IDS].sort());
});
