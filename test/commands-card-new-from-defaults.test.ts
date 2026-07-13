// ABOUTME: Verifies card new --from-defaults captures machine skill defaults.
// ABOUTME: Guards profile card scaffolding from machine.json defaults.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeMachineConfig } from "../cli/core/card-store";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { createEmptyMachineConfig } from "../cli/core/machine-config";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card new --from-defaults captures machine default skills into a profile card", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    policy: { authoring: { scope: "@me" } },
    capabilities: { profile: null, skills: ["alpha"], mcpServers: [] },
  });

  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--no-git"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("@me/everyday");

  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "everyday");
  expect(existsSync(join(sourceDir, "skills", "alpha", "SKILL.md"))).toBe(true);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  expect(manifest.skills?.include).toEqual(["alpha"]);
});

test("card new --from-defaults fails when no skill defaults are configured", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    policy: { authoring: { scope: "@me" } },
  });
  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--no-git"], envFor(fixture));
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("default skill");
});
