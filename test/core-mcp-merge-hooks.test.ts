// ABOUTME: Verifies Claude settings merge manages hook configuration safely.
// ABOUTME: Protects hook drift detection and cleanup alongside MCP servers.

import { describe, expect, test } from "bun:test";
import { mergeClaudeSettingsText } from "../cli/core/mcp";
import type { RegistryServer } from "../cli/core/types";

const server: RegistryServer = {
  description: "Docs",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@upstash/context7-mcp"],
  optional: false,
};

const hooks = {
  PreToolUse: [
    {
      matcher: "Bash",
      hooks: [{ type: "command" as const, command: "node", args: [".agents/drwn/generated/hooks/claude/composer.mjs"], timeout: 30 }],
    },
  ],
  PostToolUse: [
    {
      matcher: "Bash",
      hooks: [{ type: "command" as const, command: "node", args: [".agents/drwn/generated/hooks/claude/composer.mjs"], timeout: 30 }],
    },
  ],
};

describe("mergeClaudeSettingsText hooks", () => {
  test("adds hooks and records separate managed-field hashes", () => {
    const merged = mergeClaudeSettingsText(
      JSON.stringify({ model: "sonnet", mcpServers: { old: { command: "old" } } }, null, 2),
      { context7: server },
      { hooks },
    );
    const parsed = JSON.parse(merged.text);

    expect(parsed.model).toBe("sonnet");
    expect(parsed.mcpServers.context7.command).toBe("npx");
    expect(parsed.hooks).toEqual(hooks);
    expect(parsed._drwn.managedKeys).toEqual(["mcpServers", "hooks"]);
    expect(parsed._drwn.fieldHashes.mcpServers).toStartWith("sha256-");
    expect(parsed._drwn.fieldHashes.hooks).toStartWith("sha256-");
  });

  test("removes previously managed hooks when no hooks are desired", () => {
    const withHooks = mergeClaudeSettingsText("{}", { context7: server }, { hooks });
    const withoutHooks = mergeClaudeSettingsText(withHooks.text, { context7: server });
    const parsed = JSON.parse(withoutHooks.text);

    expect(parsed.hooks).toBeUndefined();
    expect(parsed._drwn.managedKeys).toEqual(["mcpServers", "hooks"]);
    expect(parsed._drwn.fieldHashes.hooks).toStartWith("sha256-");
  });

  test("refuses managed hook drift unless forced", () => {
    const merged = mergeClaudeSettingsText("{}", { context7: server }, { hooks });
    const edited = JSON.parse(merged.text);
    edited.hooks.PreToolUse[0].matcher = ".*";
    const editedText = `${JSON.stringify(edited, null, 2)}\n`;

    expect(() => mergeClaudeSettingsText(editedText, { context7: server }, { hooks })).toThrow("hooks");
    expect(() => mergeClaudeSettingsText(editedText, { context7: server }, { force: true, hooks })).not.toThrow();
  });
});
