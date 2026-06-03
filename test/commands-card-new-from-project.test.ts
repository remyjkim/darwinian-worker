// ABOUTME: Verifies the Wave 2 `drwn card new --from-project` authoring entry point.
// ABOUTME: Exercises capture through the CLI and proves captured sources can be published.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card new --from-project captures a project and the captured source can be published", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/base", skills: ["card-alpha"] });
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/base@1.0.0"], skills: { include: ["beta"] } }, null, 2));

  const capture = await runAgentsCli(["card", "new", "@me/captured", "--from-project", projectDir, "--no-git"], envFor(fixture));

  expect(capture.exitCode).toBe(0);
  expect(capture.stdout).toContain("Captured card source @me/captured");
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "captured");
  expect(existsSync(join(sourceDir, "skills", "card-alpha", "SKILL.md"))).toBe(true);
  expect(existsSync(join(sourceDir, "skills", "beta", "SKILL.md"))).toBe(true);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  expect(manifest.version).toBe("0.1.0");
  expect(manifest.skills.include).toEqual(["card-alpha", "beta"]);

  const publish = await runAgentsCli(["card", "publish", "@me/captured"], envFor(fixture));
  expect(publish.exitCode).toBe(0);
  expect(publish.stdout).toContain("Published @me/captured@0.1.0");
});

test("card new --from-project without a path captures the current project", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));

  const capture = await runAgentsCli(["card", "new", "@me/cwd-capture", "--from-project", "--no-git"], envFor(fixture), projectDir);

  expect(capture.exitCode).toBe(0);
  expect(existsSync(join(fixture.agentsDir, "drwn", "sources", "@me", "cwd-capture", "skills", "alpha", "SKILL.md"))).toBe(true);
});

test("card new --from-project fails clearly outside a drwn project", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const nonProjectDir = join(fixture.root, "not-project");
  await mkdir(nonProjectDir, { recursive: true });

  const capture = await runAgentsCli(["card", "new", "@me/missing", "--from-project", nonProjectDir, "--no-git"], envFor(fixture));

  expect(capture.exitCode).toBe(1);
  expect(capture.stderr).toContain("Not a drwn project");
});

test("card new rejects a project path positional without --from-project", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["card", "new", "@me/blank", fixture.root, "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Project path is only valid with --from-project");
});
