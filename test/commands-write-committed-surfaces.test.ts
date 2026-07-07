// ABOUTME: Verifies committedSurfaces writes projection paths that remain git-visible.
// ABOUTME: Ensures machine-local overlays and generated output stay ignored.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

async function initGitRepo(dir: string) {
  const { spawnSync } = await import("node:child_process");
  spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "ignore" });
}

test("committedSurfaces write leaves skills visible to git status porcelain", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/commit", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await initGitRepo(projectDir);
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    `${JSON.stringify({ version: 1, committedSurfaces: true, cards: ["@me/commit@1.0.0"], skills: { include: ["alpha"] } }, null, 2)}\n`,
  );

  const apply = await runAgentsCli(["card", "apply", "@me/commit@1.0.0"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(apply.exitCode).toBe(0);

  const write = await runAgentsCli(["write", "--skills-only"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectDir);
  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);

  const gitignore = await readFile(join(projectDir, ".gitignore"), "utf8");
  expect(gitignore).not.toContain(".claude/skills/");
  expect(gitignore).toContain("config.local.json");

  await writeFile(join(projectDir, ".agents", "drwn", "config.local.json"), `${JSON.stringify({ overrides: {} }, null, 2)}\n`);
  const { spawnSync } = await import("node:child_process");
  const ignoredSkill = spawnSync(
    "git",
    ["check-ignore", join(projectDir, ".claude", "skills", "alpha", "SKILL.md")],
    { cwd: projectDir, encoding: "utf8" },
  );
  expect(ignoredSkill.status).not.toBe(0);
  const ignoredLocal = spawnSync(
    "git",
    ["check-ignore", ".agents/drwn/config.local.json"],
    { cwd: projectDir, encoding: "utf8" },
  );
  expect(ignoredLocal.status).toBe(0);
  const status = spawnSync("git", ["status", "--porcelain", "--", ".claude/skills/"], { cwd: projectDir, encoding: "utf8" });
  expect(status.stdout).toMatch(/\.claude\/skills\//);
  expect(status.stdout).not.toMatch(/config\.local\.json/);
});
