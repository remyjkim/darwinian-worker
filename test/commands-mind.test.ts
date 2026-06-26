// ABOUTME: Verifies `drwn mind` activation commands over installed cards.
// ABOUTME: Protects ordered active stack persistence and projection workflow.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("mind list/use/clear manage the ordered active stack", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/base", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/overlay", skills: ["beta"] });
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/base@1.0.0", "@me/overlay@1.0.0"] }, null, 2));

  expect((await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const listed = await runAgentsCli(["mind", "list", "--json"], envFor(fixture), projectDir);

  expect(listed.exitCode).toBe(0);
  expect(JSON.parse(listed.stdout).minds.map((mind: { name: string }) => mind.name)).toEqual(["@me/base", "@me/overlay"]);
  expect(JSON.parse(listed.stdout).activeMinds).toEqual([]);

  const use = await runAgentsCli(["mind", "use", "@me/base", "@me/overlay", "--json"], envFor(fixture), projectDir);
  expect(use.exitCode).toBe(0);
  expect(JSON.parse(use.stdout).activeMinds).toEqual(["@me/base", "@me/overlay"]);
  expect(JSON.parse(await readFile(configPath, "utf8")).activeMinds).toEqual(["@me/base", "@me/overlay"]);

  expect((await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
  expect(existsSync(join(projectDir, ".claude", "skills", "beta"))).toBe(true);

  const clear = await runAgentsCli(["mind", "clear", "--json"], envFor(fixture), projectDir);
  expect(clear.exitCode).toBe(0);
  expect(JSON.parse(clear.stdout).activeMinds).toEqual([]);
  expect(JSON.parse(await readFile(configPath, "utf8")).activeMinds).toEqual([]);
});
