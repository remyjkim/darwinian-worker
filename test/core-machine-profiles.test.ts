// ABOUTME: Verifies packaged machine profile descriptors, one-time Git resolution, and offline pin validation.
// ABOUTME: Uses isolated local Git remotes while preserving the canonical source recorded in machine intent.

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeMachineConfig } from "../cli/core/card-store";
import { createEmptyMachineConfig } from "../cli/core/machine-config";
import { createDarwinianOperatorPin, DARWINIAN_OPERATOR_PROFILE, DARWINIAN_OPERATOR_REGISTRY, DARWINIAN_OPERATOR_SKILL_IDS } from "../cli/core/operator-profile-contract";
import {
  initializeMachineCapabilities,
  loadMachineProfileRegistry,
  verifyMachineProfilePin,
  type MachineProfileDescriptor,
} from "../cli/core/machine-profiles";
import { resolveCardBareRepoPath, resolveMachineConfigPath } from "../cli/core/store-paths";
import { readMachineConfigFile } from "../cli/core/machine-config";
import { cleanupTempRoots, publishExactOperatorProfile, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function localOperatorProfile() {
  const source = await scaffoldCliFixture();
  const target = await scaffoldCliFixture();
  tempRoots.push(source.root, target.root);
  const { resolved } = await publishExactOperatorProfile(source);
  const barePath = resolveCardBareRepoPath(source.agentsDir, "@darwinian/operator");
  const descriptor: MachineProfileDescriptor = {
    id: "darwinian-operator",
    displayName: "Recommended Darwinian Operator",
    source: DARWINIAN_OPERATOR_PROFILE.source,
    name: "@darwinian/operator",
    version: DARWINIAN_OPERATOR_PROFILE.version,
    commit: resolved.git!.commit,
    treeSha: resolved.treeSha!,
    integrity: resolved.integrity as `sha256-${string}`,
    skills: [...DARWINIAN_OPERATOR_SKILL_IDS],
    mcpServers: [],
  };
  return {
    source,
    target,
    descriptor,
    resolutionRef: `git+file://${barePath}#v${DARWINIAN_OPERATOR_PROFILE.version}`,
  };
}

describe("machine profiles", () => {
  test("loads the strict packaged Recommended Operator descriptor", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const registry = await loadMachineProfileRegistry(join(import.meta.dir, ".."));

    expect(registry).toEqual(JSON.parse(JSON.stringify(DARWINIAN_OPERATOR_REGISTRY)));
  });

  test("resolves once, verifies immutable coordinates, and writes the pin", async () => {
    const fixture = await localOperatorProfile();

    const result = await initializeMachineCapabilities({
      agentsDir: fixture.target.agentsDir,
      repoRoot: fixture.target.repoRoot,
      guided: true,
      promptRecommended: async () => true,
      descriptor: fixture.descriptor,
      resolutionRef: fixture.resolutionRef,
    });

    expect(result).toMatchObject({ created: true, selectedProfile: "darwinian-operator" });
    const machine = await readMachineConfigFile(resolveMachineConfigPath(fixture.target.agentsDir));
    expect(machine?.capabilities.profile).toEqual({
      id: fixture.descriptor.id,
      source: fixture.descriptor.source,
      name: fixture.descriptor.name,
      version: fixture.descriptor.version,
      commit: fixture.descriptor.commit,
      treeSha: fixture.descriptor.treeSha,
      integrity: fixture.descriptor.integrity,
      skills: fixture.descriptor.skills,
      mcpServers: fixture.descriptor.mcpServers,
    });
  });

  test("validates a pin offline after its bare Git repo is removed", async () => {
    const fixture = await localOperatorProfile();
    await initializeMachineCapabilities({
      agentsDir: fixture.target.agentsDir,
      repoRoot: fixture.target.repoRoot,
      guided: true,
      promptRecommended: async () => true,
      descriptor: fixture.descriptor,
      resolutionRef: fixture.resolutionRef,
    });
    await writeMachineConfig(fixture.target.agentsDir, {
      ...createEmptyMachineConfig(),
      capabilities: { profile: createDarwinianOperatorPin(), skills: [], mcpServers: [] },
    });
    const machine = await readMachineConfigFile(resolveMachineConfigPath(fixture.target.agentsDir));
    await rm(resolveCardBareRepoPath(fixture.target.agentsDir, "@darwinian/operator"), { recursive: true, force: true });

    const verified = await verifyMachineProfilePin(fixture.target.agentsDir, machine!.capabilities.profile!);

    expect(verified.manifest.name).toBe("@darwinian/operator");
    expect(verified.manifest.version).toBe(DARWINIAN_OPERATOR_PROFILE.version);
  });

  test("detects extracted profile byte mutation", async () => {
    const fixture = await localOperatorProfile();
    await initializeMachineCapabilities({
      agentsDir: fixture.target.agentsDir,
      repoRoot: fixture.target.repoRoot,
      guided: true,
      promptRecommended: async () => true,
      descriptor: fixture.descriptor,
      resolutionRef: fixture.resolutionRef,
    });
    await writeMachineConfig(fixture.target.agentsDir, {
      ...createEmptyMachineConfig(),
      capabilities: { profile: createDarwinianOperatorPin(), skills: [], mcpServers: [] },
    });
    const machine = await readMachineConfigFile(resolveMachineConfigPath(fixture.target.agentsDir));
    const skillPath = join(fixture.target.agentsDir, "drwn", "extracted", fixture.descriptor.treeSha, "skills", "bootstrap-project", "SKILL.md");
    await chmod(skillPath, 0o644);
    await writeFile(skillPath, "mutated\n");

    await expect(verifyMachineProfilePin(fixture.target.agentsDir, machine!.capabilities.profile!)).rejects.toMatchObject({
      code: "MACHINE_PROFILE_INVALID",
    });
  });

  test("does not write an unapproved profile pin", async () => {
    const fixture = await localOperatorProfile();
    const descriptor = { ...fixture.descriptor, skills: ["not-approved"] } as MachineProfileDescriptor;

    await expect(initializeMachineCapabilities({
      agentsDir: fixture.target.agentsDir,
      repoRoot: fixture.target.repoRoot,
      guided: true,
      promptRecommended: async () => true,
      descriptor,
      resolutionRef: fixture.resolutionRef,
    })).rejects.toMatchObject({ code: "MACHINE_PROFILE_INVALID" });

    expect((await readMachineConfigFile(resolveMachineConfigPath(fixture.target.agentsDir))) ?? createEmptyMachineConfig())
      .toEqual(createEmptyMachineConfig());
  });

  test("rejects a resolved Card that does not match the pinned commit", async () => {
    const fixture = await localOperatorProfile();
    const descriptor = { ...fixture.descriptor, commit: "0".repeat(40) } as MachineProfileDescriptor;

    await expect(initializeMachineCapabilities({
      agentsDir: fixture.target.agentsDir,
      repoRoot: fixture.target.repoRoot,
      guided: true,
      promptRecommended: async () => true,
      descriptor,
      resolutionRef: fixture.resolutionRef,
    })).rejects.toMatchObject({ code: "MACHINE_PROFILE_INVALID" });

    expect((await readMachineConfigFile(resolveMachineConfigPath(fixture.target.agentsDir))) ?? createEmptyMachineConfig())
      .toEqual(createEmptyMachineConfig());
  });

  test("guided opt-out writes empty intent and existing intent is never re-prompted", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    let prompts = 0;

    const first = await initializeMachineCapabilities({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      guided: true,
      promptRecommended: async () => {
        prompts += 1;
        return false;
      },
    });
    const second = await initializeMachineCapabilities({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      guided: true,
      promptRecommended: async () => {
        prompts += 1;
        return true;
      },
    });

    expect(first).toMatchObject({ created: true, selectedProfile: null });
    expect(second).toMatchObject({ created: false, selectedProfile: null });
    expect(prompts).toBe(1);
  });
});
