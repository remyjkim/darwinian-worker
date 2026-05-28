// ABOUTME: Verifies `bgng skills curate`, `uncurate`, and write behavior against temp fixtures.
// ABOUTME: Locks in safe-by-default mutation semantics for the curated skill publication layer.

import { afterEach, describe, expect, test } from "bun:test";
import { access, lstat, mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function addParallelSkills(repoRoot: string) {
  for (const name of ["parallel-web-search", "parallel-web-extract", "parallel-deep-research", "parallel-data-enrichment"]) {
    const skillDir = join(repoRoot, "skills", "shared", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\n`);
  }
}

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

describe("bgng skills mutate", () => {
  test("skills curate --json emits a curatedPath payload", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["skills", "curate", "alpha", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { curatedPath: string };
    expect(parsed.curatedPath).toContain("alpha");
  });

  test("skills uncurate --json emits an uncuratedPath payload", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["skills", "uncurate", "alpha", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { uncuratedPath: string };
    expect(parsed.uncuratedPath).toContain("alpha");
  });

  test("curate creates the agents-layer symlink for a package-backed shared skill", async () => {
    const fixture = await scaffoldCliFixture();
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

    const result = await runAgentsCli(["skills", "curate", "hello-skill"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect((await lstat(join(fixture.agentsDir, "skills", "hello-skill"))).isSymbolicLink()).toBe(true);
  });

  test("curate creates the agents-layer symlink", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["skills", "curate", "alpha"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect((await lstat(join(fixture.agentsDir, "skills", "alpha"))).isSymbolicLink()).toBe(true);
  });

  test("uncurate removes the agents-layer symlink", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["skills", "uncurate", "alpha"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    await expect(access(join(fixture.agentsDir, "skills", "alpha"))).rejects.toThrow();
  });

  test("write --skills-only installs downstream skill symlinks", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["write", "--skills-only"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect((await lstat(join(fixture.homeDir, ".claude", "skills", "alpha"))).isSymbolicLink()).toBe(true);
    expect((await lstat(join(fixture.homeDir, ".codex", "skills", "alpha"))).isSymbolicLink()).toBe(true);
  });

  test("write --skills-only uses project extension-derived skill includes", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await addParallelSkills(fixture.repoRoot);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(
      projectConfigPath,
      JSON.stringify(
        {
          version: 1,
          extensions: {
            parallel: { enabled: true, skills: true, mcp: false },
          },
          skills: {
            exclude: ["parallel-web-extract"],
          },
        },
        null,
        2,
      ),
    );

    const result = await runAgentsCli(["write", "--skills-only"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect((await lstat(join(projectDir, ".claude", "skills", "parallel-web-search"))).isSymbolicLink()).toBe(true);
    await expect(access(join(projectDir, ".claude", "skills", "parallel-web-extract"))).rejects.toThrow();
  });

  test("write --skills-only installs downstream symlinks for curated package-backed skills", async () => {
    const fixture = await scaffoldCliFixture();
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

    await runAgentsCli(["skills", "curate", "hello-skill"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    const result = await runAgentsCli(["write", "--skills-only"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect((await lstat(join(fixture.homeDir, ".claude", "skills", "hello-skill"))).isSymbolicLink()).toBe(true);
    expect((await lstat(join(fixture.homeDir, ".codex", "skills", "hello-skill"))).isSymbolicLink()).toBe(true);
  });

  test("write --skills-only removes bgng-owned links that leave the effective state", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    await runAgentsCli(["write", "--skills-only"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    await runAgentsCli(["skills", "uncurate", "alpha"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    const result = await runAgentsCli(["write", "--skills-only"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("remove");
    await expect(access(join(fixture.homeDir, ".claude", "skills", "alpha"))).rejects.toThrow();
  });

  test("curate on an unknown skill exits non-zero", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["skills", "curate", "does-not-exist"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).not.toBe(0);
  });

  test("uncurate on a non-curated skill exits non-zero", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["skills", "uncurate", "beta"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).not.toBe(0);
  });
});
