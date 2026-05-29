import { afterEach, describe, expect, test } from "bun:test";
import {
  buildActiveServers,
  mergeClaudeSettingsText,
  mergeCodexTomlText,
  renderCursorConfig,
  syncRepository,
  type CanonicalConfig,
  type CanonicalRegistry,
} from "../sync-mcp";
import { parse as parseToml } from "smol-toml";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "darwinian-harness-"));
  tempRoots.push(root);
  return root;
}

function getServer(registry: CanonicalRegistry, name: string) {
  const server = registry.servers[name];
  if (!server) {
    throw new Error(`Missing fixture server: ${name}`);
  }
  return server;
}

function createRegistry(): CanonicalRegistry {
  return {
    version: 1,
    servers: {
      context7: {
        description: "Docs",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        optional: false,
      },
      "parallel-web-search": {
        description: "Platform",
        transport: "platform-provided",
        provider: "claude.ai",
        optional: false,
      },
      slack: {
        description: "Slack",
        transport: "http",
        url: "https://mcp.slack.com/mcp",
        optional: true,
      },
    },
  };
}

function createRegistryWithParallelMcp(): CanonicalRegistry {
  return {
    version: 1,
    servers: {
      ...createRegistry().servers,
      "parallel-search": {
        description: "Parallel Search MCP",
        transport: "http",
        url: "https://search.parallel.ai/mcp",
        optional: false,
      },
      "parallel-task": {
        description: "Parallel Task MCP",
        transport: "http",
        url: "https://task-mcp.parallel.ai/mcp",
        optional: false,
      },
    },
  };
}

function createConfig(optionalSlack = false, parallelMcpEnabled = false): CanonicalConfig {
  return {
    version: 1,
    targets: {
      claude: {
        enabled: true,
        configPath: "~/.claude/settings.json",
        format: "json-merge",
        mcpKey: "mcpServers",
      },
      codex: {
        enabled: true,
        configPath: "~/.codex/config.toml",
        format: "toml-merge",
        mcpKey: "mcp_servers",
      },
      cursor: {
        enabled: true,
        configPath: "~/.cursor/mcp.json",
        format: "json-standalone",
        mcpKey: "mcpServers",
        symlink: true,
      },
    },
    optional: {
      slack: optionalSlack,
    },
    parallel: {
      cli: {
        enabled: true,
      },
      mcp: {
        enabled: parallelMcpEnabled,
      },
    },
  };
}

describe("buildActiveServers", () => {
  test("filters platform-provided servers and disabled optional servers", () => {
    const active = buildActiveServers(createRegistry(), createConfig(false));

    expect(Object.keys(active)).toEqual(["context7"]);
  });

  test("includes optional servers when enabled", () => {
    const active = buildActiveServers(createRegistry(), createConfig(true));

    expect(Object.keys(active)).toEqual(["context7", "slack"]);
  });

  test("excludes Parallel MCP entries by default", () => {
    const active = buildActiveServers(createRegistryWithParallelMcp(), createConfig(false, false));

    expect(Object.keys(active)).toEqual(["context7"]);
  });

  test("includes Parallel MCP entries when globally enabled", () => {
    const active = buildActiveServers(createRegistryWithParallelMcp(), createConfig(false, true));

    expect(Object.keys(active)).toEqual(["context7", "parallel-search", "parallel-task"]);
  });

  test("real packaged registry includes Parallel MCP entries when globally enabled", async () => {
    const registry = JSON.parse(
      await readFile(join(import.meta.dir, "..", "registry", "mcp-servers.json"), "utf8"),
    ) as CanonicalRegistry;

    const active = buildActiveServers(registry, createConfig(false, true));

    expect(active["parallel-search"]).toBeDefined();
    expect(active["parallel-task"]).toBeDefined();
  });

  test("real packaged registry exposes notion via the hosted Streamable HTTP endpoint", async () => {
    const registry = JSON.parse(
      await readFile(join(import.meta.dir, "..", "registry", "mcp-servers.json"), "utf8"),
    ) as CanonicalRegistry;

    expect(registry.servers["notion"]).toMatchObject({
      transport: "http",
      url: "https://mcp.notion.com/mcp",
      optional: true,
    });
  });

  test("notion is excluded by default and included only when opted in via optional config", async () => {
    const registry = JSON.parse(
      await readFile(join(import.meta.dir, "..", "registry", "mcp-servers.json"), "utf8"),
    ) as CanonicalRegistry;

    const baseline = buildActiveServers(registry, createConfig(false, false));
    expect(baseline["notion"]).toBeUndefined();

    const optedIn: CanonicalConfig = {
      ...createConfig(false, false),
      optional: { notion: true },
    };
    const active = buildActiveServers(registry, optedIn);
    expect(active["notion"]).toMatchObject({
      transport: "http",
      url: "https://mcp.notion.com/mcp",
    });
  });
});

describe("renderCursorConfig", () => {
  test("renders the expected JSON structure", () => {
    const json = renderCursorConfig({
      context7: getServer(createRegistry(), "context7"),
      slack: getServer(createRegistry(), "slack"),
    });
    const parsed = JSON.parse(json) as { mcpServers: Record<string, unknown> };

    expect(parsed).toEqual({
      mcpServers: {
        context7: {
          command: "npx",
          args: ["-y", "@upstash/context7-mcp"],
        },
        slack: {
          type: "http",
          url: "https://mcp.slack.com/mcp",
        },
      },
    });
  });

  test("annotates http transports with type: 'http' for Claude Code-compatible clients", () => {
    const json = renderCursorConfig({
      slack: getServer(createRegistry(), "slack"),
    });
    const parsed = JSON.parse(json) as { mcpServers: Record<string, unknown> };

    expect(parsed.mcpServers["slack"]).toEqual({
      type: "http",
      url: "https://mcp.slack.com/mcp",
    });
  });
});

describe("Parallel MCP rendering", () => {
  test("renders Parallel MCP entries into JSON targets when enabled", () => {
    const json = renderCursorConfig({
      "parallel-search": getServer(createRegistryWithParallelMcp(), "parallel-search"),
      "parallel-task": getServer(createRegistryWithParallelMcp(), "parallel-task"),
    });
    const parsed = JSON.parse(json) as { mcpServers: Record<string, { type: string; url: string }> };

    expect(parsed.mcpServers["parallel-search"]).toEqual({
      type: "http",
      url: "https://search.parallel.ai/mcp",
    });
    expect(parsed.mcpServers["parallel-task"]).toEqual({
      type: "http",
      url: "https://task-mcp.parallel.ai/mcp",
    });
  });
});

describe("Parallel shared skills", () => {
  test("real repo contains the four Parallel CLI-backed skills", async () => {
    const skillNames = [
      "parallel-web-search",
      "parallel-web-extract",
      "parallel-deep-research",
      "parallel-data-enrichment",
    ] as const;

    for (const skillName of skillNames) {
      const skillPath = join(import.meta.dir, "..", "skills", "shared", skillName, "SKILL.md");
      const contents = await readFile(skillPath, "utf8");

      expect(contents.includes(`name: ${skillName}`)).toBe(true);
      expect(contents.includes("parallel-cli")).toBe(true);
      expect(contents.includes("--json")).toBe(true);
    }
  });
});

describe("mergeClaudeSettingsText", () => {
  test("preserves unrelated keys and replaces mcpServers", () => {
    const merged = mergeClaudeSettingsText(
      JSON.stringify(
        {
          env: { A: "1" },
          model: "sonnet",
          mcpServers: {
            old: { command: "old" },
          },
        },
        null,
        2,
      ),
      {
        context7: getServer(createRegistry(), "context7"),
      },
    );

    expect(JSON.parse(merged)).toMatchObject({
      env: { A: "1" },
      model: "sonnet",
      mcpServers: {
        context7: {
          command: "npx",
          args: ["-y", "@upstash/context7-mcp"],
        },
      },
    });
  });

  test("renders Parallel MCP URLs into Claude settings", () => {
    const merged = mergeClaudeSettingsText(
      JSON.stringify({ model: "sonnet" }, null, 2),
      {
        "parallel-search": getServer(createRegistryWithParallelMcp(), "parallel-search"),
        "parallel-task": getServer(createRegistryWithParallelMcp(), "parallel-task"),
      },
    );

    expect(JSON.parse(merged)).toMatchObject({
      model: "sonnet",
      mcpServers: {
        "parallel-search": {
          url: "https://search.parallel.ai/mcp",
        },
        "parallel-task": {
          url: "https://task-mcp.parallel.ai/mcp",
        },
      },
    });
  });

  test("annotates http transports with type: 'http' so Claude Code recognizes them", () => {
    const merged = mergeClaudeSettingsText(
      JSON.stringify({ model: "sonnet" }, null, 2),
      {
        slack: getServer(createRegistry(), "slack"),
      },
    );
    const parsed = JSON.parse(merged) as { mcpServers: Record<string, unknown> };

    expect(parsed.mcpServers["slack"]).toEqual({
      type: "http",
      url: "https://mcp.slack.com/mcp",
    });
  });
});

describe("mergeCodexTomlText", () => {
  test("preserves non-MCP sections and replaces MCP sections", () => {
    const merged = mergeCodexTomlText(
      [
        'personality = "pragmatic"',
        "",
        '[projects."/tmp/example"]',
        'trust_level = "trusted"',
        "",
        "[mcp_servers.old]",
        'command = "legacy"',
        "",
        "[notice.model_migrations]",
        '"old" = "new"',
        "",
      ].join("\n"),
      {
        context7: getServer(createRegistry(), "context7"),
      },
    );

    const parsed = parseToml(merged) as Record<string, unknown>;

    expect(parsed.personality).toBe("pragmatic");
    expect(parsed.projects).toEqual({
      "/tmp/example": { trust_level: "trusted" },
    });
    expect(parsed.notice).toEqual({
      model_migrations: { old: "new" },
    });
    expect(parsed.mcp_servers).toEqual({
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        startup_timeout_sec: 30,
      },
    });
    expect(merged.includes("[mcp_servers.old]")).toBe(false);
  });

  test("renders Parallel MCP URLs into Codex TOML", () => {
    const merged = mergeCodexTomlText(
      'personality = "pragmatic"\n',
      {
        "parallel-search": getServer(createRegistryWithParallelMcp(), "parallel-search"),
        "parallel-task": getServer(createRegistryWithParallelMcp(), "parallel-task"),
      },
    );
    const parsed = parseToml(merged) as Record<string, unknown>;

    expect(parsed.mcp_servers).toEqual({
      "parallel-search": {
        url: "https://search.parallel.ai/mcp",
        enabled: true,
      },
      "parallel-task": {
        url: "https://task-mcp.parallel.ai/mcp",
        enabled: true,
      },
    });
  });

  test("marks http transports as enabled so Codex activates them", () => {
    const merged = mergeCodexTomlText(
      'personality = "pragmatic"\n',
      {
        slack: getServer(createRegistry(), "slack"),
      },
    );
    const parsed = parseToml(merged) as Record<string, unknown>;

    expect(parsed.mcp_servers).toEqual({
      slack: {
        url: "https://mcp.slack.com/mcp",
        enabled: true,
      },
    });
  });
});

describe("syncRepository", () => {
  test("dry-run reports changes without mutating files", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const repoRoot = join(root, "repo");
    const agentsDir = join(homeDir, ".agents");
    const claudeSettingsPath = join(homeDir, ".claude", "settings.json");
    const codexConfigPath = join(homeDir, ".codex", "config.toml");
    const cursorConfigPath = join(homeDir, ".cursor", "mcp.json");

    await mkdir(join(repoRoot, "registry"), { recursive: true });
    await mkdir(join(repoRoot, "skills", "shared"), { recursive: true });
    await mkdir(dirname(claudeSettingsPath), { recursive: true });
    await mkdir(dirname(codexConfigPath), { recursive: true });
    await mkdir(dirname(cursorConfigPath), { recursive: true });
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    await writeFile(join(repoRoot, "registry", "mcp-servers.json"), JSON.stringify(createRegistry(), null, 2));
    await writeFile(
      join(repoRoot, "registry", "config.json"),
      JSON.stringify(
        {
          ...createConfig(false),
          targets: {
            claude: {
              enabled: true,
              configPath: claudeSettingsPath,
              format: "json-merge",
              mcpKey: "mcpServers",
            },
            codex: {
              enabled: true,
              configPath: codexConfigPath,
              format: "toml-merge",
              mcpKey: "mcp_servers",
            },
            cursor: {
              enabled: true,
              configPath: cursorConfigPath,
              format: "json-standalone",
              mcpKey: "mcpServers",
              symlink: true,
            },
          },
        },
        null,
        2,
      ),
    );
    await writeFile(claudeSettingsPath, JSON.stringify({ model: "sonnet" }, null, 2));
    await writeFile(codexConfigPath, 'personality = "pragmatic"\n');
    await writeFile(cursorConfigPath, JSON.stringify({ mcpServers: {} }, null, 2));

    const beforeClaude = await readFile(claudeSettingsPath, "utf8");
    const beforeCodex = await readFile(codexConfigPath, "utf8");
    const beforeCursor = await readFile(cursorConfigPath, "utf8");

    const result = await syncRepository({
      repoRoot,
      agentsDir,
      homeDir,
      dryRun: true,
    });

    expect(result.changes.length).toBeGreaterThan(0);
    expect(await readFile(claudeSettingsPath, "utf8")).toBe(beforeClaude);
    expect(await readFile(codexConfigPath, "utf8")).toBe(beforeCodex);
    expect(await readFile(cursorConfigPath, "utf8")).toBe(beforeCursor);
  });

  test("skills sync creates downstream symlink chains from curated shared skills", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const repoRoot = join(root, "repo");
    const agentsDir = join(homeDir, ".agents");
    const sharedSkillPath = join(repoRoot, "skills", "shared", "alpha");
    const agentsSkillPath = join(agentsDir, "skills", "alpha");
    const claudeSkillPath = join(homeDir, ".claude", "skills", "alpha");
    const codexSkillPath = join(homeDir, ".codex", "skills", "alpha");

    await mkdir(join(repoRoot, "registry"), { recursive: true });
    await mkdir(sharedSkillPath, { recursive: true });
    await mkdir(dirname(agentsSkillPath), { recursive: true });
    await mkdir(dirname(claudeSkillPath), { recursive: true });
    await mkdir(dirname(codexSkillPath), { recursive: true });

    await writeFile(join(sharedSkillPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
    await symlink(sharedSkillPath, agentsSkillPath, "dir");
    await writeFile(join(repoRoot, "registry", "mcp-servers.json"), JSON.stringify(createRegistry(), null, 2));
    await writeFile(
      join(repoRoot, "registry", "config.json"),
      JSON.stringify(
        {
          ...createConfig(false),
          targets: {
            claude: {
              enabled: false,
              configPath: join(homeDir, ".claude", "settings.json"),
              format: "json-merge",
              mcpKey: "mcpServers",
            },
            codex: {
              enabled: false,
              configPath: join(homeDir, ".codex", "config.toml"),
              format: "toml-merge",
              mcpKey: "mcp_servers",
            },
            cursor: {
              enabled: false,
              configPath: join(homeDir, ".cursor", "mcp.json"),
              format: "json-standalone",
              mcpKey: "mcpServers",
            },
          },
        },
        null,
        2,
      ),
    );

    await syncRepository({
      repoRoot,
      agentsDir,
      homeDir,
      skillsOnly: true,
    });

    expect(await realpath(claudeSkillPath)).toBe(await realpath(agentsSkillPath));
    expect(await realpath(codexSkillPath)).toBe(await realpath(agentsSkillPath));
  });
});
