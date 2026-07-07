// ABOUTME: Verifies drwn use applies a card ref and materializes the project.
// ABOUTME: Covers the porcelain orchestration over card apply and write.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("use replaces existing project cards instead of merging", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/first", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/second", skills: ["beta"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1 }, null, 2)}\n`);

  const first = await runAgentsCli(["use", "@me/first@1.0.0"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(first.exitCode).toBe(0);

  const second = await runAgentsCli(["use", "@me/second@1.0.0"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(second.exitCode).toBe(0);

  const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8"));
  const lock = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "card.lock"), "utf8"));
  expect(config.cards).toEqual(["@me/second@1.0.0"]);
  expect(lock.cards.map((card: { name: string }) => card.name)).toEqual(["@me/second"]);
});

test("use applies card ref and writes materialization output", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/use", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1 }, null, 2)}\n`);

  const result = await runAgentsCli(["use", "@me/use@1.0.0"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(/Applied @me\/use@1\.0\.0/);
  expect(result.stdout).toMatch(/Cards: @me\/use/);
  const lock = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "card.lock"), "utf8"));
  expect(lock.cards.some((card: { name: string }) => card.name === "@me/use")).toBe(true);
});
