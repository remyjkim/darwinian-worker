// ABOUTME: Verifies the extracted MCP rendering and sync orchestration modules independent of the compat wrapper.
// ABOUTME: Protects the core sync logic while commands and the wrapper are layered on top.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CanonicalConfig, CanonicalRegistry } from "../cli/core/types";

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
});
