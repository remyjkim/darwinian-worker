// ABOUTME: Verifies default resolution helpers for skills and MCP servers.
// ABOUTME: Protects explicit defaults while preserving legacy fallback behavior.

import { describe, expect, test } from "bun:test";
import { createFixtureConfig, createFixtureRegistry } from "./helpers";

function paths() {
  return {
    claudeSettings: "/tmp/claude.json",
    codexConfig: "/tmp/codex.toml",
    cursorConfig: "/tmp/cursor.json",
  };
}

describe("core defaults", () => {
  test("explicit default predicates treat empty arrays as uninitialized", async () => {
    const { hasExplicitMcpDefaults, hasExplicitSkillDefaults } = await import("../cli/core/defaults");
    const config = createFixtureConfig(paths(), false);

    expect(hasExplicitMcpDefaults(config)).toBe(false);
    expect(hasExplicitSkillDefaults(config)).toBe(false);

    config.defaults = { mcpServers: [], skills: [] };
    expect(hasExplicitMcpDefaults(config)).toBe(false);
    expect(hasExplicitSkillDefaults(config)).toBe(false);

    config.defaults = { mcpServers: ["context7"], skills: ["alpha"] };
    expect(hasExplicitMcpDefaults(config)).toBe(true);
    expect(hasExplicitSkillDefaults(config)).toBe(true);
  });

  test("falls back to current MCP activation when explicit defaults are absent", async () => {
    const { resolveDefaultMcpNames } = await import("../cli/core/defaults");
    const config = createFixtureConfig(paths(), false);
    const registry = createFixtureRegistry();

    expect(resolveDefaultMcpNames(config, registry)).toEqual(["context7"]);
  });

  test("empty MCP defaults fall back to current MCP activation", async () => {
    const { resolveDefaultMcpNames } = await import("../cli/core/defaults");
    const { buildActiveServers } = await import("../cli/core/mcp");
    const registry = createFixtureRegistry();
    const absent = createFixtureConfig(paths(), false);
    const empty = createFixtureConfig(paths(), false);
    empty.defaults = { mcpServers: [] };

    expect(resolveDefaultMcpNames(empty, registry)).toEqual(resolveDefaultMcpNames(absent, registry));
    expect(Object.keys(buildActiveServers(registry, empty))).toEqual(Object.keys(buildActiveServers(registry, absent)));
  });

  test("explicit MCP defaults control active MCP names", async () => {
    const { resolveDefaultMcpNames, applyMcpDefaultsToConfig } = await import("../cli/core/defaults");
    const { buildActiveServers } = await import("../cli/core/mcp");
    const config = createFixtureConfig(paths(), true);
    config.defaults = { mcpServers: ["parallel-search"] };
    const registry = createFixtureRegistry();

    expect(resolveDefaultMcpNames(config, registry)).toEqual(["parallel-search"]);
    expect(Object.keys(buildActiveServers(registry, applyMcpDefaultsToConfig(config)))).toEqual(["parallel-search"]);
  });

  test("ensure helpers seed empty defaults and preserve non-empty defaults", async () => {
    const { ensureMcpDefaultsInitialized, ensureSkillDefaultsInitialized } = await import("../cli/core/defaults");
    const config = createFixtureConfig(paths(), false);
    config.defaults = { mcpServers: [], skills: [] };

    expect(ensureMcpDefaultsInitialized(config, ["context7"])).toEqual(["context7"]);
    expect(ensureSkillDefaultsInitialized(config, ["alpha"])).toEqual(["alpha"]);

    expect(ensureMcpDefaultsInitialized(config, ["parallel-search"])).toEqual(["context7"]);
    expect(ensureSkillDefaultsInitialized(config, ["beta"])).toEqual(["alpha"]);
  });

  test("merges user MCP library entries without mutating built-in registry", async () => {
    const { mergeUserMcpLibrary } = await import("../cli/core/defaults");
    const registry = createFixtureRegistry();
    const merged = mergeUserMcpLibrary(registry, {
      version: 1,
      servers: {
        github: {
          description: "GitHub",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          optional: true,
        },
      },
    });

    expect(merged.servers.github?.command).toBe("npx");
    expect(registry.servers.github).toBeUndefined();
  });

  test("reports unknown default references", async () => {
    const { validateDefaultReferences } = await import("../cli/core/defaults");
    const config = createFixtureConfig(paths(), false);
    config.defaults = { skills: ["missing-skill"], mcpServers: ["missing-mcp"] };
    const issues = await validateDefaultReferences({
      config,
      registry: createFixtureRegistry(),
      skillNames: new Set(["alpha"]),
    });

    expect(issues).toContain('Unknown default skill: "missing-skill"');
    expect(issues).toContain('Unknown default MCP server: "missing-mcp"');
  });
});
