// ABOUTME: Verifies a card whose skill names are NOT present in skills/shared/ materializes from the card store.
// ABOUTME: Direct regression for the 2026-05-26 Matt smoke-test findings B and C.

import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, installProjectWorkers, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

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
  await installProjectWorkers(
    projectDir,
    fixture.agentsDir,
    ["@me/frontend-design@^1.0.0"],
    "@me/frontend-design",
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
  await writeSupportedProjectConfig(projectDir, { skills: { include: ["ghost-skill"] } });

  const write = await runAgentsCli(["write"], envFor(fixture), projectDir);

  expect(write.exitCode).not.toBe(0);
  expect(write.stderr).toContain("ghost-skill");
  expect(write.stderr).toContain("not provided by the selected Worker closure");
});
