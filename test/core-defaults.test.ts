// ABOUTME: Verifies that profile and explicit selections are the only machine capability authority.
// ABOUTME: Protects provenance, deduplication, missing-capability errors, and ambient-directory isolation.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveMachineCapabilities } from "../cli/core/defaults";
import { writeMachineConfig } from "../cli/core/card-store";
import { createEmptyMachineConfig } from "../cli/core/machine-config";
import { DARWINIAN_OPERATOR_SKILL_IDS } from "../cli/core/operator-profile-contract";
import { cleanupTempRoots, publishExactOperatorProfile, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function installProfileFixture(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const { profile, resolved } = await publishExactOperatorProfile(fixture);
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    capabilities: { profile, skills: [], mcpServers: [] },
  });
  return { profile, resolved };
}

describe("machine capability resolution", () => {
  test("empty intent activates nothing despite packaged defaults and curated directories", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    await writeMachineConfig(fixture.agentsDir, createEmptyMachineConfig());

    const resolved = await resolveMachineCapabilities({
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
    });

    expect(resolved.skills).toEqual([]);
    expect(resolved.mcpServers).toEqual([]);
  });

  test("resolves explicit Library skills and MCP servers", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await writeMachineConfig(fixture.agentsDir, {
      ...createEmptyMachineConfig(),
      capabilities: { profile: null, skills: ["alpha"], mcpServers: ["context7"] },
    });

    const resolved = await resolveMachineCapabilities({
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
    });

    expect(resolved.skills).toEqual([expect.objectContaining({ id: "alpha", source: "explicit" })]);
    expect(resolved.mcpServers).toEqual([expect.objectContaining({ id: "context7", source: "explicit" })]);
  });

  test("attributes profile and explicit overlap to the profile once", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.repoRoot, "skills", "shared", "bootstrap-project"), { recursive: true });
    await writeFile(join(fixture.repoRoot, "skills", "shared", "bootstrap-project", "SKILL.md"), "---\nname: bootstrap-project\ndescription: explicit duplicate\n---\n");
    const { profile, resolved: profileCard } = await installProfileFixture(fixture);
    await writeMachineConfig(fixture.agentsDir, {
      ...createEmptyMachineConfig(),
      capabilities: { profile, skills: ["bootstrap-project"], mcpServers: [] },
    });

    const capabilities = await resolveMachineCapabilities({
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
    });

    expect(capabilities.skills).toContainEqual({
      id: "bootstrap-project",
      source: "profile",
      profileId: "darwinian-operator",
      path: join(profileCard.dir, "skills", "bootstrap-project"),
      scope: "shared",
    });
    expect(capabilities.skills.map((skill) => skill.id)).toEqual([...DARWINIAN_OPERATOR_SKILL_IDS]);
  });

  test("fails with stable errors for missing explicit capabilities", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await writeMachineConfig(fixture.agentsDir, {
      ...createEmptyMachineConfig(),
      capabilities: { profile: null, skills: ["missing-skill"], mcpServers: [] },
    });

    await expect(resolveMachineCapabilities({ repoRoot: fixture.repoRoot, agentsDir: fixture.agentsDir }))
      .rejects.toMatchObject({ code: "MACHINE_CAPABILITY_NOT_FOUND" });
  });

  test("fails when pinned profile bytes are missing instead of fetching", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { profile } = await installProfileFixture(fixture);
    await rm(join(fixture.agentsDir, "drwn", "extracted", profile.treeSha), { recursive: true, force: true });

    await expect(resolveMachineCapabilities({ repoRoot: fixture.repoRoot, agentsDir: fixture.agentsDir }))
      .rejects.toMatchObject({ code: "MACHINE_PROFILE_NOT_AVAILABLE" });
  });
});
