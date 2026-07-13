// ABOUTME: Verifies the public `drwn doctor` command stays report-only while surfacing drift and stale state.
// ABOUTME: Protects the safe-by-default diagnostics contract for the new CLI.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("drwn doctor", () => {
  test("reports the supported error code for an invalid project schema", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ version: 1, cards: [] }, null, 2)}\n`);

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).not.toBe(0);
    expect(output).toContain("PROJECT_CONFIG_INVALID");
    expect(output.toLowerCase()).not.toContain("migrat");
  });

  test("surfaces the Cowork annotation and platform checks when claude is enabled", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const human = await runAgentsCli(["doctor"], envFor(fixture));
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("Cowork");
    expect(human.stdout).toContain("Platform checks:");

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture));
    const parsed = JSON.parse(json.stdout) as {
      surfaceNotes: string[];
      platformChecks: Array<{ name: string; ok: boolean }>;
    };
    expect(parsed.surfaceNotes.some((note) => note.includes("Cowork"))).toBe(true);
    expect(parsed.platformChecks.some((check) => check.name.includes("home directory"))).toBe(true);
  });

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

  test("reports MCP drift", async () => {
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
    const projectConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir, {
          mcpServers: {
            missingServer: { enabled: true },
            "parallel-search": { enabled: false },
          },
          skills: {
            include: ["missing-skill"],
          },
          targets: {
            codex: { enabled: true },
          },
        });

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
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(join(fixture.agentsDir, "drwn", "config.json"), JSON.stringify(config, null, 2));

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
    const projectConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["apply", "@me/frontend@^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      projectConfigIssues: string[];
      cards?: { warnings?: string[] };
    };
    expect(parsed.projectConfigIssues).not.toContain('Unknown skill reference: "polish"');
    expect(parsed.cards?.warnings ?? []).not.toContain("Card @me/frontend@1.0.0 references unavailable skills");
  });

  test("reports card hooks without valid consent", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
    expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
    expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
    const manifest = JSON.parse(await readFile(join(fixture.agentsDir, "drwn", "sources", "@me", "policy", "card.json"), "utf8"));
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir)).exitCode).toBe(0);

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { hookIssues: string[] };
    expect(parsed.hookIssues.join("\n")).toContain("drwn card trust @me/policy --hooks");
  });

  test("does not report MCP drift for a synced project with Claude hooks", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
    expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
    const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
    await writeFile(join(sourceDir, "hooks", "guard", "policy.ts"), `
      import { defineToolPolicy } from "darwinian/hook-policy";
      export default defineToolPolicy({
        policyKind: "enforcement",
        beforeToolCall() { return { action: "allow" }; },
      });
    `);
    expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
    const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir)).exitCode).toBe(0);
    expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
    expect((await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode).toBe(0);

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { mcpDrift: string[] };
    expect(parsed.mcpDrift).toEqual([]);
  });

  test("reports stale generated hook composers", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
    expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
    const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
    await writeFile(join(sourceDir, "hooks", "guard", "policy.ts"), `
      import { defineToolPolicy } from "darwinian/hook-policy";
      export default defineToolPolicy({ policyKind: "observer" });
    `);
    expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
    const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir)).exitCode).toBe(0);
    expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
    expect((await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode).toBe(0);
    const composerPath = join(projectDir, ".agents", "drwn", "generated", "workers", "@me", "policy", "hooks", "claude", "composer.mjs");
    const composer = await readFile(composerPath, "utf8");
    await writeFile(composerPath, composer.replace(/drwn-version:\s*[^\n]+/, "drwn-version: 0.0.0"));

    const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { hookIssues: string[] };
    expect(parsed.hookIssues.join("\n")).toContain("composer stale; rerun drwn write");
  });
});
