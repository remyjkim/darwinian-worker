// ABOUTME: Verifies the public `bgng doctor` command stays report-only while surfacing drift and stale state.
// ABOUTME: Protects the safe-by-default diagnostics contract for the new CLI.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("bgng doctor", () => {
  test("reports stale downstream skill symlinks", async () => {
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

    const result = await runAgentsCli(["doctor"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Stale skill symlinks:");
    expect(result.stdout).toContain("alpha");
    expect(result.stdout).toMatch(/^\s*-\s/m);
  });

  test("reports broken symlinks and supports --json output", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const brokenDir = join(fixture.homeDir, ".codex", "skills");
    await mkdir(brokenDir, { recursive: true });
    await symlink(join(fixture.root, "missing-target"), join(brokenDir, "broken-link"), "dir");

    const result = await runAgentsCli(["doctor", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { brokenSymlinks: string[] };
    expect(parsed.brokenSymlinks.some((value) => value.includes("broken-link"))).toBe(true);
  });

  test("reports MCP drift and missing generated files", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    await writeFile(fixture.claudeSettings, JSON.stringify({ model: "sonnet", mcpServers: { rogue: { url: "x" } } }, null, 2));

    const result = await runAgentsCli(["doctor"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("MCP drift:");
    expect(result.stdout).toContain("Missing generated files:");
  });

  test("detects MCP drift when config uses tilde paths", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const configWithTildes = {
      version: 1,
      targets: {
        claude: {
          enabled: true,
          configPath: "~/.claude/settings.json",
          format: "json-merge",
          mcpKey: "mcpServers",
        },
        codex: {
          enabled: false,
          configPath: "~/.codex/config.toml",
          format: "toml-merge",
          mcpKey: "mcp_servers",
        },
        cursor: {
          enabled: false,
          configPath: "~/.cursor/mcp.json",
          format: "json-standalone",
          mcpKey: "mcpServers",
        },
      },
      optional: {},
      parallel: { cli: { enabled: true }, mcp: { enabled: false } },
    };

    await writeFile(join(fixture.repoRoot, "registry", "config.json"), JSON.stringify(configWithTildes, null, 2));
    await writeFile(
      join(fixture.homeDir, ".claude", "settings.json"),
      JSON.stringify({ model: "sonnet", mcpServers: { rogue: { url: "x" } } }, null, 2),
    );

    const result = await runAgentsCli(["doctor", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { mcpDrift: string[] };
    expect(parsed.mcpDrift.length).toBeGreaterThan(0);
  });

  test("reports project config issues for unknown references and stale overrides", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(
      projectConfigPath,
      JSON.stringify(
        {
          version: 1,
          servers: {
            missingServer: { enabled: true },
            "parallel-search": { enabled: false },
          },
          skills: {
            include: ["missing-skill"],
          },
          targets: {
            codex: { enabled: true },
          },
        },
        null,
        2,
      ),
    );

    const result = await runAgentsCli(["doctor"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Project config issues");
    expect(result.stdout).toContain("missingServer");
    expect(result.stdout).toContain("missing-skill");
    expect(result.stdout).toContain("parallel-search");
  });

  test("reports unknown global default references", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const config = JSON.parse(await Bun.file(join(fixture.repoRoot, "registry", "config.json")).text());
    config.defaults = { skills: ["missing-skill"], mcpServers: ["missing-mcp"] };
    await mkdir(join(fixture.agentsDir, "bgng"), { recursive: true });
    await writeFile(join(fixture.agentsDir, "bgng", "config.json"), JSON.stringify(config, null, 2));

    const result = await runAgentsCli(["doctor", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { projectConfigIssues: string[] };
    expect(parsed.projectConfigIssues).toContain('Unknown default skill: "missing-skill"');
    expect(parsed.projectConfigIssues).toContain('Unknown default MCP server: "missing-mcp"');
  });

  test("does not falsely report card-bundled-only skills as unknown", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/frontend", skills: ["polish"] });
    const projectDir = join(fixture.root, "project");
    const projectConfigPath = join(projectDir, ".agents", "bgng", "config.json");
    await mkdir(dirname(projectConfigPath), { recursive: true });
    await writeFile(
      projectConfigPath,
      JSON.stringify({ version: 1, cards: ["@me/frontend@^1.0.0"] }, null, 2),
    );
    expect((await runAgentsCli(["card", "update"], envFor(fixture), projectDir)).exitCode).toBe(0);

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      projectConfigIssues: string[];
      cards?: { warnings?: string[] };
    };
    expect(parsed.projectConfigIssues).not.toContain('Unknown skill reference: "polish"');
    expect(parsed.cards?.warnings ?? []).not.toContain("Card @me/frontend@1.0.0 references unavailable skills");
  });
});
