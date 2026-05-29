// ABOUTME: Verifies the public `drwn skills list` command in human and JSON modes.
// ABOUTME: Ensures Clipanion command registration and skill inventory output are correct.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("drwn skills list", () => {
  test("lists repo skills with scope and curated state", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["skills", "list"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("alpha");
    expect(result.stdout).toContain("shared");
    expect(result.stdout).toContain("curated");
  });

  test("supports --json output", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["skills", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ name: string; scope: string; curated: boolean }>;
    expect(parsed.some((skill) => skill.name === "alpha" && skill.scope === "shared" && skill.curated)).toBe(true);
  });

  test("lists package-backed skills with source metadata", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    const packageRoot = join(fixture.agentsDir, "packages", "skills", "@acme", "skills-sample", "1.0.0");
    const packageSkillPath = join(packageRoot, "skills", "shared", "hello-skill");
    await mkdir(packageSkillPath, { recursive: true });
    await writeFile(join(packageSkillPath, "SKILL.md"), "---\nname: hello-skill\ndescription: hello\n---\n");
    await writeFile(
      join(packageRoot, "bundle.json"),
      JSON.stringify({
        schemaVersion: 1,
        bundleName: "@acme/skills-sample",
        version: "1.0.0",
        skills: [{ name: "hello-skill", scope: "shared", path: "skills/shared/hello-skill" }],
      }),
    );
    await symlink("1.0.0", join(dirname(packageRoot), "current"));

    const result = await runAgentsCli(["skills", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    const parsed = JSON.parse(result.stdout) as Array<{
      name: string;
      sourceType?: string;
      sourceId?: string;
      sourceVersion?: string;
    }>;
    expect(parsed.some((skill) =>
      skill.name === "hello-skill" &&
      skill.sourceType === "npm" &&
      skill.sourceId === "@acme/skills-sample" &&
      skill.sourceVersion === "1.0.0")).toBe(true);
  });
});
