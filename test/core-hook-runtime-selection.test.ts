// ABOUTME: Verifies hook runtime selection is separate from MCP target names.
// ABOUTME: Protects defaults and project overrides for generated hook adapters.

import { describe, expect, it } from "bun:test";
import { resolveHookRuntimes } from "../cli/core/hook-generator/runtime-selection";
import type { CanonicalConfig, ProjectConfig, TargetName } from "../cli/core/types";

function config(targets?: Partial<Record<TargetName, boolean>>): CanonicalConfig {
  return {
    version: 1,
    targets: {
      claude: { enabled: targets?.claude ?? true, configPath: "~/.claude/settings.json", format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: targets?.codex ?? true, configPath: "~/.codex/config.toml", format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: targets?.cursor ?? true, configPath: "~/.cursor/mcp.json", format: "json-standalone", mcpKey: "mcpServers" },
    },
    optional: {},
  };
}

describe("resolveHookRuntimes", () => {
  it("defaults claude-code and codex from existing targets", () => {
    expect(resolveHookRuntimes({ effectiveConfig: config() })).toEqual(["claude-code", "codex"]);
    expect(resolveHookRuntimes({ effectiveConfig: config({ claude: false, codex: true }) })).toEqual(["codex"]);
    expect(resolveHookRuntimes({ effectiveConfig: config({ claude: true, codex: false }) })).toEqual(["claude-code"]);
  });

  it("ignores cursor because it has no v1 hook runtime", () => {
    expect(resolveHookRuntimes({ effectiveConfig: config({ claude: false, codex: false, cursor: true }) })).toEqual([]);
  });

  it("enables mastra only by explicit hook runtime opt-in", () => {
    const projectConfig: ProjectConfig = {
      version: 2,
      hooks: { runtimes: { mastra: { enabled: true } } },
    };
    expect(resolveHookRuntimes({ effectiveConfig: config(), projectConfig })).toEqual(["claude-code", "codex", "mastra"]);
  });

  it("lets hook runtime config override target-derived defaults", () => {
    const projectConfig: ProjectConfig = {
      version: 2,
      hooks: {
        runtimes: {
          "claude-code": { enabled: false },
          codex: { enabled: true },
        },
      },
    };
    expect(resolveHookRuntimes({ effectiveConfig: config({ claude: true, codex: false }), projectConfig })).toEqual(["codex"]);
  });

  it("honors drwn write --target for mapped hook runtimes only", () => {
    expect(resolveHookRuntimes({ effectiveConfig: config(), target: "claude" })).toEqual(["claude-code"]);
    expect(resolveHookRuntimes({ effectiveConfig: config(), target: "codex" })).toEqual(["codex"]);
    expect(resolveHookRuntimes({ effectiveConfig: config(), target: "cursor" })).toEqual([]);
  });
});
