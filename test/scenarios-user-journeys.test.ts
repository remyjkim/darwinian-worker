// ABOUTME: Models realistic first-time, migration, and drifted-environment user journeys against temp fixtures.
// ABOUTME: Protects the CLI against regressions in practical user workflows rather than isolated unit behavior alone.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, runSyncWrapper, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function createBundleFixture(root: string, options?: { packageName?: string; version?: string; skillName?: string }) {
  const packageName = options?.packageName ?? "@acme/skills-sample";
  const version = options?.version ?? "1.0.0";
  const skillName = options?.skillName ?? "hello-skill";
  const bundleRoot = join(root, "bundle");
  const skillDir = join(bundleRoot, "skills", "shared", skillName);

  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(bundleRoot, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        version,
        description: "fixture",
        license: "MIT",
        files: ["skills", "bundle.json", "README.md"],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(bundleRoot, "bundle.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        bundleName: packageName,
        version,
        displayName: "Sample Skills",
        skills: [{ name: skillName, scope: "shared", path: `skills/shared/${skillName}` }],
      },
      null,
      2,
    ),
  );
  await writeFile(join(bundleRoot, "README.md"), "# fixture\n");
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skillName}\ndescription: fixture\n---\n`);
  return { bundleRoot, packageName, version, skillName };
}

async function addParallelSkills(repoRoot: string) {
  for (const name of ["parallel-web-search", "parallel-web-extract", "parallel-deep-research", "parallel-data-enrichment"]) {
    const skillDir = join(repoRoot, "skills", "shared", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\n`);
  }
}

describe("user journeys", () => {
  test("first-time user can inspect, select, and write a skill downstream", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    let result = await runAgentsCli(["status"], env);
    expect(result.exitCode).toBe(0);

    result = await runAgentsCli(["machine", "skill", "list"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("alpha");

    result = await runAgentsCli(["machine", "skill", "enable", "alpha"], env);
    expect(result.exitCode).toBe(0);

    result = await runAgentsCli(["write", "--skills-only"], env);
    expect(result.exitCode).toBe(0);
  });

  test("legacy wrapper user sees plausible equivalent dry-run intent", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    expect((await runAgentsCli(["machine", "skill", "enable", "alpha"], env)).exitCode).toBe(0);

    const legacy = await runSyncWrapper(["--dry-run"], env);
    const modern = await runAgentsCli(["write", "--dry-run"], env);

    expect(legacy.exitCode).toBe(0);
    expect(modern.exitCode).toBe(0);
    expect(legacy.stdout).toContain("Changes:");
    expect(modern.stdout).toContain("Changes:");
  });

  test("drifted environment user gets drift, stale link, and missing generated file reports", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    await runAgentsCli(["machine", "skill", "enable", "alpha"], env);
    await runAgentsCli(["machine", "mcp", "enable", "context7"], env);
    await runAgentsCli(["write"], env);
    await runAgentsCli(["machine", "skill", "disable", "alpha"], env);
    const claudeMcp = JSON.parse(await readFile(fixture.claudeUserMcp, "utf8"));
    claudeMcp.mcpServers.context7.command = "node";
    await writeFile(
      fixture.claudeUserMcp,
      JSON.stringify(claudeMcp, null, 2),
    );

    const result = await runAgentsCli(["doctor", "--json"], env);
    const parsed = JSON.parse(result.stdout) as {
      staleSkillSymlinks: string[];
      mcpDrift: string[];
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.staleSkillSymlinks.length).toBeGreaterThan(0);
    expect(parsed.mcpDrift.length).toBeGreaterThan(0);
  });

  test("per-project user can init, override, preview, inspect, and diagnose", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    let result = await runAgentsCli(["init", "--non-interactive", "--no-default-catalogs"], env, projectDir);
    expect(result.exitCode).toBe(0);

    await writeSupportedProjectConfig(projectDir, {
      mcpServers: {
        localdb: {
          description: "Project DB",
          transport: "stdio",
          command: "node",
          args: ["db-mcp.js"],
          optional: false,
        },
      },
      skills: {
        include: ["beta"],
      },
    });

    result = await runAgentsCli(["write", "--dry-run"], env, projectDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(join(projectDir, ".mcp.json"));

    result = await runAgentsCli(["write"], env, projectDir);
    expect(result.exitCode).toBe(0);

    result = await runAgentsCli(["status"], env, projectDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Project");

    result = await runAgentsCli(["doctor"], env, projectDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No issues found");
  });

  test("per-project user can select Parallel extension and write its CLI-backed skills", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await addParallelSkills(fixture.repoRoot);
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir, {
      extensions: {
        parallel: { enabled: true, skills: true, mcp: false },
      },
      skills: {
        exclude: ["parallel-web-extract"],
      },
    });
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    const dryRun = await runAgentsCli(["write", "--dry-run"], env, projectDir);
    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.stdout).toContain("parallel-web-search");
    expect(dryRun.stdout).not.toContain("parallel-web-extract");

    const write = await runAgentsCli(["write"], env, projectDir);
    expect(write.exitCode).toBe(0);
    expect(existsSync(join(projectDir, ".claude", "skills", "parallel-web-search"))).toBe(true);
    expect(existsSync(join(projectDir, ".codex", "skills", "parallel-web-search"))).toBe(true);
    expect(existsSync(join(projectDir, ".claude", "skills", "parallel-web-extract"))).toBe(false);
  });

  test("invalid project skill references fail write and are surfaced by doctor", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir, {
      mcpServers: {
        nonexistentServer: { enabled: true },
      },
      skills: {
        include: ["deleted-skill"],
      },
    });
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    const writeResult = await runAgentsCli(["write", "--dry-run"], env, projectDir);
    expect(writeResult.exitCode).not.toBe(0);
    expect(writeResult.stderr).toContain("deleted-skill");

    const doctorResult = await runAgentsCli(["doctor"], env, projectDir);
    expect(doctorResult.exitCode).toBe(0);
    expect(doctorResult.stdout).toContain("nonexistentServer");
    expect(doctorResult.stdout).toContain("deleted-skill");
  });

  test("package-backed bundle user can add, inspect, select, and write a skill downstream", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { bundleRoot } = await createBundleFixture(fixture.root);
    const env = {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    };

    let result = await runAgentsCli(["machine", "skill", "install", bundleRoot], env);
    expect(result.exitCode).toBe(0);

    result = await runAgentsCli(["machine", "skill", "show", "--package", "@acme/skills-sample"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello-skill");

    result = await runAgentsCli(["machine", "skill", "enable", "hello-skill"], env);
    expect(result.exitCode).toBe(0);

    result = await runAgentsCli(["write", "--skills-only"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello-skill");
  });
});
