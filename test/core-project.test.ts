// ABOUTME: Verifies per-project config discovery, loading, merge behavior, and scaffolding.
// ABOUTME: Protects the project-override layer so write and diagnostics consume effective state safely.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFixtureConfig, createFixtureRegistry } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-core-project-"));
  tempRoots.push(root);
  return root;
}

async function writeProjectConfig(projectDir: string, contents: object) {
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(contents, null, 2));
  return configPath;
}

describe("core project", () => {
  test("findProjectConfig finds config in cwd", async () => {
    const root = await createTempRoot();
    const configPath = await writeProjectConfig(root, { version: 1 });

    const { findProjectConfig } = await import("../cli/core/project");
    expect(findProjectConfig(root)).toBe(configPath);
  });

  test("findProjectConfig finds config in ancestor directory", async () => {
    const root = await createTempRoot();
    const nested = join(root, "packages", "frontend");
    await mkdir(nested, { recursive: true });
    const configPath = await writeProjectConfig(root, { version: 1 });

    const { findProjectConfig } = await import("../cli/core/project");
    expect(findProjectConfig(nested)).toBe(configPath);
  });

  test("findProjectConfig returns nearest matching config", async () => {
    const root = await createTempRoot();
    const nested = join(root, "packages", "frontend");
    await mkdir(nested, { recursive: true });
    await writeProjectConfig(root, { version: 1 });
    const nestedConfigPath = await writeProjectConfig(nested, { version: 1 });

    const { findProjectConfig } = await import("../cli/core/project");
    expect(findProjectConfig(nested)).toBe(nestedConfigPath);
  });

  test("findProjectConfig returns null when no config exists", async () => {
    const root = await createTempRoot();
    const nested = join(root, "packages", "frontend");
    await mkdir(nested, { recursive: true });

    const { findProjectConfig } = await import("../cli/core/project");
    expect(findProjectConfig(nested)).toBeNull();
  });

  test("loadProjectConfig parses a minimal valid config", async () => {
    const root = await createTempRoot();
    const configPath = await writeProjectConfig(root, { version: 1 });

    const { loadProjectConfig } = await import("../cli/core/project");
    expect(await loadProjectConfig(configPath)).toEqual({ version: 1 });
  });

  test("loadProjectConfig throws for unknown version", async () => {
    const root = await createTempRoot();
    const configPath = await writeProjectConfig(root, { version: 99 });

    const { loadProjectConfig } = await import("../cli/core/project");
    await expect(loadProjectConfig(configPath)).rejects.toThrow(/version/i);
  });

  test("loadProjectConfig throws for malformed JSON", async () => {
    const root = await createTempRoot();
    const configPath = join(root, ".agents", "drwn", "config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, "{not-json");

    const { loadProjectConfig } = await import("../cli/core/project");
    await expect(loadProjectConfig(configPath)).rejects.toThrow();
  });

  test("mergeProjectConfig toggles existing servers and adds project-local servers", async () => {
    const configPaths = {
      claudeSettings: "/tmp/.claude/settings.json",
      codexConfig: "/tmp/.codex/config.toml",
      cursorConfig: "/tmp/.cursor/mcp.json",
    };
    const config = createFixtureConfig(configPaths, false);
    config.optional.markdownify = false;
    const registry = createFixtureRegistry();
    registry.servers.markdownify = {
      description: "Markdownify",
      transport: "stdio",
      command: "node",
      args: ["markdownify-mcp/dist/index.js"],
      optional: true,
    };

    const { mergeProjectConfig } = await import("../cli/core/project");
    const merged = mergeProjectConfig(config, registry, {
      version: 1,
      servers: {
        context7: { enabled: false },
        markdownify: { enabled: true },
        localdb: {
          description: "Project DB",
          transport: "stdio",
          command: "node",
          args: ["db-mcp.js"],
          optional: false,
        },
      },
    });

    expect(merged.config.optional.context7).toBe(false);
    expect(merged.config.optional.markdownify).toBe(true);
    expect(merged.registry.servers.localdb?.command).toBe("node");
  });

  test("mergeProjectConfig passes through skill include and exclude overrides", async () => {
    const config = createFixtureConfig({
      claudeSettings: "/tmp/.claude/settings.json",
      codexConfig: "/tmp/.codex/config.toml",
      cursorConfig: "/tmp/.cursor/mcp.json",
    });
    const registry = createFixtureRegistry();

    const { mergeProjectConfig } = await import("../cli/core/project");
    const merged = mergeProjectConfig(config, registry, {
      version: 1,
      skills: {
        include: ["alpha"],
        exclude: ["beta"],
      },
    });

    expect(merged.skills).toEqual({
      include: ["alpha"],
      exclude: ["beta"],
    });
  });

  test("mergeProjectConfig derives Parallel extension skills and MCP from project config", async () => {
    const config = createFixtureConfig({
      claudeSettings: "/tmp/.claude/settings.json",
      codexConfig: "/tmp/.codex/config.toml",
      cursorConfig: "/tmp/.cursor/mcp.json",
    });
    config.parallel!.mcp!.enabled = false;
    const registry = createFixtureRegistry();

    const { mergeProjectConfig } = await import("../cli/core/project");
    const merged = mergeProjectConfig(config, registry, {
      version: 1,
      extensions: {
        parallel: { enabled: true, skills: true, mcp: true },
      },
    });

    expect(merged.config.parallel?.cli?.enabled).toBe(true);
    expect(merged.config.parallel?.mcp?.enabled).toBe(true);
    expect(merged.skills?.include).toEqual([
      "parallel-web-search",
      "parallel-web-extract",
      "parallel-deep-research",
      "parallel-data-enrichment",
    ]);
    expect(config.parallel?.mcp?.enabled).toBe(false);
  });

  test("mergeProjectConfig can disable Parallel for one project", async () => {
    const config = createFixtureConfig({
      claudeSettings: "/tmp/.claude/settings.json",
      codexConfig: "/tmp/.codex/config.toml",
      cursorConfig: "/tmp/.cursor/mcp.json",
    }, true);
    const registry = createFixtureRegistry();

    const { mergeProjectConfig } = await import("../cli/core/project");
    const merged = mergeProjectConfig(config, registry, {
      version: 1,
      extensions: {
        parallel: { enabled: false },
      },
    });

    expect(merged.config.parallel?.cli?.enabled).toBe(false);
    expect(merged.config.parallel?.mcp?.enabled).toBe(false);
    expect(merged.skills?.exclude).toEqual([
      "parallel-web-search",
      "parallel-web-extract",
      "parallel-deep-research",
      "parallel-data-enrichment",
    ]);
  });

  test("mergeProjectConfig derives Beads includeSkill and lets explicit excludes win", async () => {
    const config = createFixtureConfig({
      claudeSettings: "/tmp/.claude/settings.json",
      codexConfig: "/tmp/.codex/config.toml",
      cursorConfig: "/tmp/.cursor/mcp.json",
    });
    const registry = createFixtureRegistry();

    const { mergeProjectConfig } = await import("../cli/core/project");
    const merged = mergeProjectConfig(config, registry, {
      version: 1,
      extensions: {
        beads: { enabled: true, includeSkill: true },
        parallel: { enabled: true },
      },
      skills: {
        exclude: ["parallel-web-extract"],
      },
    });

    expect(merged.skills?.include).toContain("beads-task-tracking");
    expect(merged.skills?.include).toContain("parallel-web-search");
    expect(merged.skills?.include).not.toContain("parallel-web-extract");
    expect(merged.skills?.exclude).toContain("parallel-web-extract");
  });

  test("mergeProjectConfig derives MarkItDown extension skill", async () => {
    const config = createFixtureConfig({
      claudeSettings: "/tmp/.claude/settings.json",
      codexConfig: "/tmp/.codex/config.toml",
      cursorConfig: "/tmp/.cursor/mcp.json",
    });
    const registry = createFixtureRegistry();

    const { mergeProjectConfig } = await import("../cli/core/project");
    const merged = mergeProjectConfig(config, registry, {
      version: 1,
      extensions: {
        markitdown: { enabled: true, skills: true },
      },
    });

    expect(merged.skills?.include).toContain("markitdown-document-conversion");
  });

  test("mergeProjectConfig lets explicit excludes override MarkItDown skill", async () => {
    const config = createFixtureConfig({
      claudeSettings: "/tmp/.claude/settings.json",
      codexConfig: "/tmp/.codex/config.toml",
      cursorConfig: "/tmp/.cursor/mcp.json",
    });
    const registry = createFixtureRegistry();

    const { mergeProjectConfig } = await import("../cli/core/project");
    const merged = mergeProjectConfig(config, registry, {
      version: 1,
      extensions: {
        markitdown: { enabled: true, skills: true },
      },
      skills: {
        exclude: ["markitdown-document-conversion"],
      },
    });

    expect(merged.skills?.include ?? []).not.toContain("markitdown-document-conversion");
    expect(merged.skills?.exclude).toContain("markitdown-document-conversion");
  });

  test("mergeProjectConfig applies target enabled overrides", async () => {
    const config = createFixtureConfig({
      claudeSettings: "/tmp/.claude/settings.json",
      codexConfig: "/tmp/.codex/config.toml",
      cursorConfig: "/tmp/.cursor/mcp.json",
    });
    config.targets.codex.enabled = false;
    const registry = createFixtureRegistry();

    const { mergeProjectConfig } = await import("../cli/core/project");
    const merged = mergeProjectConfig(config, registry, {
      version: 1,
      targets: {
        claude: { enabled: false },
        codex: { enabled: true },
      },
    });

    expect(merged.config.targets.claude.enabled).toBe(false);
    expect(merged.config.targets.codex.enabled).toBe(true);
  });

  test("scaffoldProjectConfig creates the initial config file", async () => {
    const root = await createTempRoot();

    const { scaffoldProjectConfig } = await import("../cli/core/project");
    const configPath = await scaffoldProjectConfig(root);
    const contents = await readFile(configPath, "utf8");

    expect(JSON.parse(contents)).toEqual({ version: 1 });
  });

  test("scaffoldProjectConfig throws when file exists without force", async () => {
    const root = await createTempRoot();
    const configPath = await writeProjectConfig(root, { version: 1, skills: { include: ["alpha"] } });

    const { scaffoldProjectConfig } = await import("../cli/core/project");
    await expect(scaffoldProjectConfig(root)).rejects.toThrow(/exists/i);
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({ version: 1, skills: { include: ["alpha"] } });
  });

  test("scaffoldProjectConfig overwrites when force is true", async () => {
    const root = await createTempRoot();
    await writeProjectConfig(root, { version: 1, skills: { include: ["alpha"] } });

    const { scaffoldProjectConfig } = await import("../cli/core/project");
    const configPath = await scaffoldProjectConfig(root, { force: true });
    const contents = await readFile(configPath, "utf8");

    expect(JSON.parse(contents)).toEqual({ version: 1 });
  });
});
