// ABOUTME: Verifies the drwn init command scaffolds per-project config in the caller's working directory.
// ABOUTME: Protects the per-project bootstrap path and the safety semantics around overwriting config.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("drwn init", () => {
  test("creates .agents/drwn/config.json with version 1", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["init", "--non-interactive", "--no-default-catalogs"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({ version: 1 });
  });

  test("exits non-zero when config already exists without force", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));

    const result = await runAgentsCli(["init", "--non-interactive", "--no-default-catalogs"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({ version: 1, skills: { include: ["alpha"] } });
  });

  test("force overwrites existing config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));

    const result = await runAgentsCli(["init", "--non-interactive", "--force", "--no-default-catalogs"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({ version: 1 });
  });

  test("warns when .gitignore appears to exclude .agents", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, ".gitignore"), ".agents/\n");

    const result = await runAgentsCli(["init", "--non-interactive", "--no-default-catalogs"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Warning");
    expect(result.stdout).toContain(".agents");
  });

  test("bare init in non-TTY mode fails with explicit non-interactive guidance", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["init"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("--non-interactive");
  });

  test("guided init in non-TTY mode fails with TTY guidance", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["init", "--guided"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("TTY");
  });
});
