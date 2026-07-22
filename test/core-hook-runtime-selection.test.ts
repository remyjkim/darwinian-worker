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
      opencode: { enabled: targets?.opencode ?? false, configPath: "~/.config/opencode/opencode.json", format: "json-merge", mcpKey: "mcp" },
    },
    optional: {},
  };
}

function projectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: [],
    activeWorker: null,
    ...overrides,
  };
}

describe("resolveHookRuntimes", () => {
  it("defaults claude-code, codex, and cursor from existing targets", () => {
    expect(resolveHookRuntimes({ effectiveConfig: config() })).toEqual(["claude-code", "codex", "cursor"]);
    expect(resolveHookRuntimes({ effectiveConfig: config({ claude: false, codex: true, cursor: false }) })).toEqual(["codex"]);
    expect(resolveHookRuntimes({ effectiveConfig: config({ claude: true, codex: false, cursor: false }) })).toEqual(["claude-code"]);
  });

  it("maps cursor to the cursor command runtime", () => {
    expect(resolveHookRuntimes({ effectiveConfig: config({ claude: false, codex: false, cursor: true }) })).toEqual(["cursor"]);
  });

  it("maps opencode to the opencode plugin runtime when the target is enabled", () => {
    expect(resolveHookRuntimes({ effectiveConfig: config() })).not.toContain("opencode");
    expect(resolveHookRuntimes({ effectiveConfig: config({ claude: false, codex: false, cursor: false, opencode: true }) })).toEqual(["opencode"]);
    expect(resolveHookRuntimes({ effectiveConfig: config({ opencode: true }), target: "opencode" })).toEqual(["opencode"]);
  });

  it("tolerates a target map without opencode", () => {
    const partial = config();
    delete (partial.targets as Record<string, unknown>).opencode;
    expect(resolveHookRuntimes({ effectiveConfig: partial })).toEqual(["claude-code", "codex", "cursor"]);
  });

  it("enables mastra only by explicit hook runtime opt-in", () => {
    const project = projectConfig({
      hooks: { runtimes: { mastra: { enabled: true } } },
    });
    expect(resolveHookRuntimes({ effectiveConfig: config(), projectConfig: project })).toEqual(["claude-code", "codex", "cursor", "mastra"]);
  });

  it("lets hook runtime config override target-derived defaults", () => {
    const project = projectConfig({
      hooks: {
        runtimes: {
          "claude-code": { enabled: false },
          codex: { enabled: true },
        },
      },
    });
    expect(resolveHookRuntimes({ effectiveConfig: config({ claude: true, codex: false, cursor: false }), projectConfig: project })).toEqual(["codex"]);
  });

  it("honors drwn write --target for mapped hook runtimes only", () => {
    expect(resolveHookRuntimes({ effectiveConfig: config(), target: "claude" })).toEqual(["claude-code"]);
    expect(resolveHookRuntimes({ effectiveConfig: config(), target: "codex" })).toEqual(["codex"]);
    expect(resolveHookRuntimes({ effectiveConfig: config(), target: "cursor" })).toEqual(["cursor"]);
  });
});
