// ABOUTME: Verifies the extracted MCP rendering and sync orchestration modules independent of the compat wrapper.
// ABOUTME: Protects the core sync logic while commands and the wrapper are layered on top.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { CanonicalConfig, CanonicalRegistry, RegistryServer } from "../cli/core/types";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-core-sync-"));
  tempRoots.push(root);
  return root;
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

function createConfig(parallelMcpEnabled = false): CanonicalConfig {
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
        mcpKey: "mcpServers",      },
      opencode: {
        enabled: false,
        configPath: "~/.config/opencode/opencode.json",
        format: "json-merge",
        mcpKey: "mcp",
      },
    },
    parallel: {
      cli: { enabled: true },
      mcp: { enabled: parallelMcpEnabled },
    },
    optional: {},
  };
}

describe("core MCP sync", () => {
  test("buildActiveServers excludes Parallel MCP by default", async () => {
    const { buildActiveServers } = await import("../cli/core/mcp");
    const active = buildActiveServers(createRegistry(), createConfig(false));

    expect(Object.keys(active)).toEqual(["context7"]);
  });

  test("buildActiveServers includes Parallel MCP when enabled", async () => {
    const { buildActiveServers } = await import("../cli/core/mcp");
    const active = buildActiveServers(createRegistry(), createConfig(true));

    expect(Object.keys(active)).toEqual(["context7", "parallel-search", "parallel-task"]);
  });

  test("syncMcp dry-run reports changes without mutating target files", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const claudeSettingsPath = join(homeDir, ".claude", "settings.json");
    const codexConfigPath = join(homeDir, ".codex", "config.toml");
    const cursorConfigPath = join(homeDir, ".cursor", "mcp.json");

    await mkdir(dirname(claudeSettingsPath), { recursive: true });
    await mkdir(dirname(codexConfigPath), { recursive: true });
    await mkdir(dirname(cursorConfigPath), { recursive: true });
    await mkdir(join(agentsDir, "generated"), { recursive: true });
    await writeFile(claudeSettingsPath, JSON.stringify({ model: "sonnet" }, null, 2));
    await writeFile(codexConfigPath, 'personality = "pragmatic"\n');
    await writeFile(cursorConfigPath, JSON.stringify({ mcpServers: {} }, null, 2));

    const beforeClaude = await readFile(claudeSettingsPath, "utf8");
    const { syncMcp } = await import("../cli/core/sync");

    const result = await syncMcp(
      {
        repoRoot: root,
        homeDir,
        agentsDir,
        dryRun: true,
        mcpOnly: false,
        skillsOnly: false,
      },
      createConfig(true),
      await (await import("../cli/core/mcp")).buildActiveServers(createRegistry(), createConfig(true)),
    );

    expect(result.changes.length).toBeGreaterThan(0);
    expect(await readFile(claudeSettingsPath, "utf8")).toBe(beforeClaude);
  });

  async function setupTargets() {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const paths = {
      claude: join(homeDir, ".claude", "settings.json"),
      codex: join(homeDir, ".codex", "config.toml"),
      cursor: join(homeDir, ".cursor", "mcp.json"),
    };
    await mkdir(dirname(paths.claude), { recursive: true });
    await mkdir(dirname(paths.codex), { recursive: true });
    await mkdir(dirname(paths.cursor), { recursive: true });
    await mkdir(join(agentsDir, "generated"), { recursive: true });
    await writeFile(paths.claude, JSON.stringify({ model: "sonnet" }, null, 2));
    await writeFile(paths.codex, 'personality = "pragmatic"\n');
    await writeFile(paths.cursor, JSON.stringify({ mcpServers: {} }, null, 2));
    return { root, homeDir, agentsDir, paths };
  }

  test("syncMcp materializes a header-auth HTTP server into all three target files", async () => {
    const { root, homeDir, agentsDir, paths } = await setupTargets();
    const activeServers: Record<string, RegistryServer> = {
      fal: {
        description: "fal.ai hosted MCP",
        transport: "http",
        url: "https://mcp.fal.ai/mcp",
        headers: { Authorization: "Bearer ${FAL_KEY}" },
        optional: false,
      },
    };

    const { syncMcp } = await import("../cli/core/sync");
    await syncMcp(
      { repoRoot: root, homeDir, agentsDir, dryRun: false, mcpOnly: false, skillsOnly: false },
      createConfig(false),
      activeServers,
    );

    const claude = JSON.parse(await readFile(paths.claude, "utf8")) as {
      mcpServers: Record<string, { type: string; url: string; headers?: Record<string, string> }>;
    };
    expect(claude.mcpServers.fal!.type).toBe("http");
    expect(claude.mcpServers.fal!.headers).toEqual({ Authorization: "Bearer ${FAL_KEY}" });

    const cursor = JSON.parse(await readFile(paths.cursor, "utf8")) as {
      mcpServers: Record<string, { headers?: Record<string, string> }>;
    };
    expect(cursor.mcpServers.fal!.headers).toEqual({ Authorization: "Bearer ${env:FAL_KEY}" });

    const codexText = await readFile(paths.codex, "utf8");
    expect(codexText).toContain('personality = "pragmatic"'); // user content preserved
    const codex = parseToml(codexText) as {
      mcp_servers: Record<string, { url: string; bearer_token_env_var?: string }>;
    };
    expect(codex.mcp_servers.fal!.url).toBe("https://mcp.fal.ai/mcp");
    expect(codex.mcp_servers.fal!.bearer_token_env_var).toBe("FAL_KEY");
    expect(codexText).not.toContain("${FAL_KEY}");
  });

  test("syncMcp warns and omits a Codex-incompatible header", async () => {
    const { root, homeDir, agentsDir, paths } = await setupTargets();
    const activeServers: Record<string, RegistryServer> = {
      custom: {
        description: "Custom MCP",
        transport: "http",
        url: "https://example.com/mcp",
        headers: { "X-Api-Key": "${SECRET}" },
        optional: false,
      },
    };

    const { syncMcp } = await import("../cli/core/sync");
    const result = await syncMcp(
      { repoRoot: root, homeDir, agentsDir, dryRun: false, mcpOnly: false, skillsOnly: false },
      createConfig(false),
      activeServers,
    );

    expect(result.warnings.some((w) => w.includes("X-Api-Key"))).toBe(true);
    const codexText = await readFile(paths.codex, "utf8");
    expect(codexText).not.toContain("${SECRET}");
  });
});
