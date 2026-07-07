// ABOUTME: Verifies a card whose skill names are NOT present in skills/shared/ materializes from the card store.
// ABOUTME: Direct regression for the 2026-05-26 Matt smoke-test findings B and C.

import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("cards bundle skills not in skills/shared/ and copy them into the project surface", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const versionDir = await publishCardWithSkills(fixture, {
    name: "@me/frontend-design",
    skills: ["polish", "animate", "alpha"],
  });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    JSON.stringify({ version: 1, cards: ["@me/frontend-design@^1.0.0"], activeWorkers: ["@me/frontend-design"] }, null, 2),
  );

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  for (const skill of ["polish", "animate", "alpha"]) {
    const linkPath = join(projectDir, ".claude", "skills", skill);
    expect(existsSync(linkPath)).toBe(true);
    expect(readFileSync(join(linkPath, "SKILL.md"), "utf8")).toBe(
      readFileSync(join(versionDir, "skills", skill, "SKILL.md"), "utf8"),
    );
  }
});

test("drwn write fails loud when a project skill include is not available from any layer", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    JSON.stringify({ version: 1, skills: { include: ["ghost-skill"] } }, null, 2),
  );

  const write = await runAgentsCli(["write"], envFor(fixture), projectDir);

  expect(write.exitCode).not.toBe(0);
  expect(write.stderr).toContain("ghost-skill");
  expect(write.stderr).toContain("not provided by any applied card");
});
