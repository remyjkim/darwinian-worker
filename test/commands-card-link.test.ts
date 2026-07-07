// ABOUTME: Verifies drwn card link writes overrides only to config.local.json.
// ABOUTME: Covers single-card and --all-from bulk linking flows.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("card link bootstraps unpublished local source into card.lock.local", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1 }, null, 2)}\n`);
  const sourceDir = join(fixture.root, "unpublished");
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify({ name: "@me/local", version: "0.1.0", skills: { include: ["alpha"] } }, null, 2)}\n`);
  await writeFile(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");

  const result = await runAgentsCli(
    ["card", "link", "@me/local", `file:${sourceDir}`],
    {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    },
    projectDir,
  );
  expect(result.exitCode).toBe(0);
  const localLock = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "card.lock.local"), "utf8"));
  expect(localLock.cards.some((card: { name: string; origin: string }) => card.name === "@me/local" && card.origin === "file")).toBe(true);
  expect(localLock.cards[0]?.treeSha).toBeUndefined();
});

test("card link writes a single override to config.local.json", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/link", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1 }, null, 2)}\n`);
  const sourceDir = join(fixture.root, "source");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify({ name: "@me/link", version: "1.0.0" }, null, 2)}\n`);

  const result = await runAgentsCli(
    ["card", "link", "@me/link", `file:${sourceDir}`],
    {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    },
    projectDir,
  );
  expect(result.exitCode).toBe(0);
  const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8"));
  const local = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.local.json"), "utf8"));
  expect(config.overrides).toBeUndefined();
  expect(local.overrides["@me/link"]).toBe(`file:${sourceDir}`);
});

test("card link --all-from bulk links scoped card directories", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/bulk", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1 }, null, 2)}\n`);
  const sourcesRoot = join(fixture.root, "sources");
  const cardDir = join(sourcesRoot, "@me", "bulk");
  await mkdir(cardDir, { recursive: true });
  await writeFile(join(cardDir, "card.json"), `${JSON.stringify({ name: "@me/bulk", version: "1.0.0" }, null, 2)}\n`);

  const result = await runAgentsCli(
    ["card", "link", "--all-from", sourcesRoot],
    {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    },
    projectDir,
  );
  expect(result.exitCode).toBe(0);
  const local = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.local.json"), "utf8"));
  expect(local.overrides["@me/bulk"]).toBe(`file:${cardDir}`);
});
