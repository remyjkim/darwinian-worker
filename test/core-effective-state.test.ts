// ABOUTME: Verifies project effective state excludes machine-only defaults.
// ABOUTME: Protects the cards-era scope boundary for project materialization.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

test("project write does not include machine default skills", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const machinePath = join(fixture.agentsDir, "bgng", "machine.json");
  const machine = JSON.parse(await readFile(machinePath, "utf8"));
  machine.defaults = { skills: ["beta"] };
  await writeFile(machinePath, `${JSON.stringify(machine, null, 2)}\n`);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "bgng", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
  expect(existsSync(join(projectDir, ".claude", "skills", "beta"))).toBe(false);
});
