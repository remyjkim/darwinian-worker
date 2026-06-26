// ABOUTME: Verifies drwn-owned Claude hook entries coexist with foreign settings hooks.
// ABOUTME: Protects session-signal and user-authored hook entries from card-hook materialization.

import { describe, expect, test } from "bun:test";
import { mergeClaudeSettingsText, type ClaudeHooksConfig } from "../cli/core/mcp";

const signalHooks = {
  UserPromptSubmit: [{ hooks: [{ type: "command", command: "drwn", args: ["hook", "card-usage"], timeout: 5 }] }],
  UserPromptExpansion: [
    { hooks: [{ type: "command", command: "drwn", args: ["hook", "skill-marker", "--phase", "expansion"], timeout: 5 }] },
  ],
  PreToolUse: [{ matcher: "Skill", hooks: [{ type: "command", command: "drwn", args: ["hook", "skill-marker", "--phase", "pre"], timeout: 5 }] }],
  PostToolUse: [{ matcher: "Skill", hooks: [{ type: "command", command: "drwn", args: ["hook", "skill-marker", "--phase", "post"], timeout: 5 }] }],
  PostToolUseFailure: [
    { matcher: "Skill", hooks: [{ type: "command", command: "drwn", args: ["hook", "skill-marker", "--phase", "fail"], timeout: 5 }] },
  ],
};

const userHook = {
  matcher: "Bash",
  hooks: [{ type: "command" as const, command: "/usr/local/bin/audit-tool", timeout: 10 }],
};

const cardHooks: ClaudeHooksConfig = {
  PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "node", args: ["/gen/composer.mjs"], timeout: 30 }] }],
  PostToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: "node", args: ["/gen/composer.mjs"], timeout: 30 }] }],
};

function settingsWith(value: Record<string, unknown>) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

describe("settings.json hook coexistence", () => {
  test("materializing card hooks preserves manually registered signal and user hooks", () => {
    const initial = settingsWith({
      hooks: {
        ...signalHooks,
        PreToolUse: [signalHooks.PreToolUse[0], userHook],
      },
    });

    const out = mergeClaudeSettingsText(initial, {}, { hooks: cardHooks });
    const parsed = JSON.parse(out.text) as { hooks: Record<string, unknown[]> };

    expect(parsed.hooks.UserPromptSubmit).toEqual(signalHooks.UserPromptSubmit);
    expect(parsed.hooks.UserPromptExpansion).toEqual(signalHooks.UserPromptExpansion);
    expect(parsed.hooks.PostToolUseFailure).toEqual(signalHooks.PostToolUseFailure);
    expect(parsed.hooks.PreToolUse).toEqual([signalHooks.PreToolUse[0], userHook, cardHooks.PreToolUse?.[0]]);
    expect(parsed.hooks.PostToolUse).toEqual([signalHooks.PostToolUse[0], cardHooks.PostToolUse?.[0]]);
  });

  test("foreign hook additions under a drwn-owned event do not trigger drift", () => {
    const materialized = mergeClaudeSettingsText(settingsWith({}), {}, { hooks: cardHooks });
    const edited = JSON.parse(materialized.text) as { hooks: Record<string, unknown[]> };
    edited.hooks.PreToolUse!.unshift(userHook);

    const out = mergeClaudeSettingsText(settingsWith(edited), {}, { hooks: cardHooks });
    const parsed = JSON.parse(out.text) as { hooks: Record<string, unknown[]> };

    expect(parsed.hooks.PreToolUse).toEqual([userHook, cardHooks.PreToolUse?.[0]]);
  });

  test("force overwrites only drifted drwn-owned hook entries and preserves foreign entries", () => {
    const materialized = mergeClaudeSettingsText(settingsWith({ hooks: signalHooks }), {}, { hooks: cardHooks });
    const edited = JSON.parse(materialized.text) as { hooks: Record<string, any[]> };
    edited.hooks.PreToolUse = [
      signalHooks.PreToolUse[0],
      { matcher: ".*", hooks: [{ type: "command", command: "node", args: ["/tmp/user-edited.mjs"], timeout: 30 }] },
    ];

    expect(() => mergeClaudeSettingsText(settingsWith(edited), {}, { hooks: cardHooks })).toThrow("drwn-owned Claude hook entries");

    const forced = mergeClaudeSettingsText(settingsWith(edited), {}, { force: true, hooks: cardHooks });
    const parsed = JSON.parse(forced.text) as { hooks: Record<string, unknown[]> };
    expect(parsed.hooks.UserPromptSubmit).toEqual(signalHooks.UserPromptSubmit);
    expect(parsed.hooks.PreToolUse).toEqual([signalHooks.PreToolUse[0], cardHooks.PreToolUse?.[0]]);
  });

  test("reordering hook arrays does not trigger false drift for unchanged owned entries", () => {
    const materialized = mergeClaudeSettingsText(
      settingsWith({ hooks: { PreToolUse: [signalHooks.PreToolUse[0], userHook] } }),
      {},
      { hooks: cardHooks },
    );
    const reordered = JSON.parse(materialized.text) as { hooks: Record<string, unknown[]> };
    reordered.hooks.PreToolUse!.reverse();

    expect(() => mergeClaudeSettingsText(settingsWith(reordered), {}, { hooks: cardHooks })).not.toThrow();
  });
});
