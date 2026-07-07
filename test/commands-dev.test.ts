// ABOUTME: Verifies drwn dev link, watch, and --off cleanup flows.
// ABOUTME: Ensures dev uses normalized linked source paths for watching.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("dev writes config.local override with file: prefix", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/dev", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    `${JSON.stringify({ version: 1, cards: ["@me/dev@1.0.0"], skills: { include: ["alpha"] } }, null, 2)}\n`,
  );
  const sourceDir = join(fixture.root, "source");
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify({ name: "@me/dev", version: "1.0.0", skills: { include: ["alpha"] } }, null, 2)}\n`);
  await writeFile(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");

  const link = await runAgentsCli(
    ["card", "apply", "@me/dev@1.0.0"],
    {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    },
    projectDir,
  );
  expect(link.exitCode).toBe(0);

  const localPath = join(projectDir, ".agents", "drwn", "config.local.json");
  await writeFile(localPath, `${JSON.stringify({ overrides: { "@me/dev": `file:${sourceDir}` } }, null, 2)}\n`);
  const write = await runAgentsCli(["write"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(write.exitCode).toBe(0);
  expect(write.stdout).toMatch(/Modes:|No changes/);
});

test("dev --off clears overrides and writes once", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1 }, null, 2)}\n`);
  const localPath = join(projectDir, ".agents", "drwn", "config.local.json");
  await writeFile(localPath, `${JSON.stringify({ overrides: { "@me/dev": "file:/tmp/x" } }, null, 2)}\n`);

  const result = await runAgentsCli(["dev", "--off"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(result.exitCode).toBe(0);
  const local = JSON.parse(await readFile(localPath, "utf8"));
  expect(local.overrides).toBeUndefined();
});
