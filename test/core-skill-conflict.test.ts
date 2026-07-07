// ABOUTME: Verifies duplicate skill conflict resolution across overlapping Mind Cards.
// ABOUTME: Ensures later-applied cards win, exclusions are honored, and drops are reported.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { syncSkills } from "../cli/core/skills";
import { normalizeSyncPathOptions } from "../cli/core/paths";
import { applyProjectCardSpecs } from "../cli/core/card-project";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishCardWithSharedSkill(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { name: string; skillName: string; marker: string },
) {
  const { runAgentsCli, envFor } = await import("./helpers");
  expect((await runAgentsCli(["card", "new", options.name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const match = options.name.match(/^(@[^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Use a scoped card name: ${options.name}`);
  }
  const [, scope, cardName] = match;
  const sourceRoot = join(fixture.agentsDir, "drwn", "sources", scope!, cardName!);
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.skills = { include: [options.skillName] };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const skillDir = join(sourceRoot, "skills", options.skillName);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${options.skillName}\ndescription: ${options.marker}\n---\n# ${options.marker}\n`,
  );
  expect((await runAgentsCli(["card", "publish", options.name], envFor(fixture))).exitCode).toBe(0);
}

async function createProjectDir(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  return projectDir;
}

test("duplicate skill from two cards keeps later-applied copy and warns", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const skillName = "apply-mind-card";
  await publishCardWithSharedSkill(fixture, { name: "@me/first", skillName, marker: "from-first" });
  await publishCardWithSharedSkill(fixture, { name: "@me/second", skillName, marker: "from-second" });
  const projectDir = await createProjectDir(fixture);
  await applyProjectCardSpecs(projectDir, fixture.agentsDir, ["@me/first@1.0.0", "@me/second@1.0.0"], {
    repoRoot: fixture.repoRoot,
    cwd: projectDir,
  });

  const normalized = normalizeSyncPathOptions(
    { repoRoot: fixture.repoRoot, agentsDir: fixture.agentsDir, homeDir: fixture.homeDir, cwd: projectDir },
    import.meta.path,
  );
  const lock = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "card.lock"), "utf8"));
  const result = await syncSkills(
    normalized,
    { include: [skillName] },
    lock.cards,
  );

  expect(result.warnings.some((w) => w.includes("duplicate skill") && w.includes("@me/first") && w.includes("@me/second"))).toBe(true);
  const claudeSkillPath = join(fixture.homeDir, ".claude", "skills", skillName, "SKILL.md");
  const content = await readFile(claudeSkillPath, "utf8");
  expect(content).toContain("from-second");
  expect(content).not.toContain("from-first");
});

test("skills.exclude drops a duplicate skill deterministically with a warning", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const skillName = "apply-mind-card";
  await publishCardWithSharedSkill(fixture, { name: "@me/first", skillName, marker: "from-first" });
  await publishCardWithSharedSkill(fixture, { name: "@me/second", skillName, marker: "from-second" });
  const projectDir = await createProjectDir(fixture);
  await applyProjectCardSpecs(projectDir, fixture.agentsDir, ["@me/first@1.0.0", "@me/second@1.0.0"], {
    repoRoot: fixture.repoRoot,
    cwd: projectDir,
  });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    JSON.stringify({ version: 1, cards: ["@me/first@1.0.0", "@me/second@1.0.0"], skills: { exclude: [skillName] } }, null, 2) + "\n",
  );

  const normalized = normalizeSyncPathOptions(
    { repoRoot: fixture.repoRoot, agentsDir: fixture.agentsDir, homeDir: fixture.homeDir, cwd: projectDir },
    import.meta.path,
  );
  const lock = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "card.lock"), "utf8"));
  const result = await syncSkills(normalized, { include: [skillName], exclude: [skillName] }, lock.cards);

  expect(result.warnings.some((w) => w.includes(skillName) && w.includes("excluded skill"))).toBe(true);
  expect(await Bun.file(join(fixture.homeDir, ".claude", "skills", skillName, "SKILL.md")).exists()).toBe(false);
});
