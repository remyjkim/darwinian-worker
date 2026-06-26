// ABOUTME: Verifies generated Claude registrations for first-party drwn session-signal hooks.
// ABOUTME: Protects opt-in materialization shape separately from hook producer behavior.

import { describe, expect, test } from "bun:test";
import { isAbsolute } from "node:path";
import { resolveDrwnHookCommand, signalHooksConfig } from "../cli/core/hook-generator/sync-signals";

describe("signalHooksConfig", () => {
  test("builds the validated signal hook registrations with absolute command path", () => {
    const bin = { command: "/abs/bun", args: ["run", "/repo/cli/index.ts"] };
    const config = signalHooksConfig(bin);

    expect(config.UserPromptSubmit?.[0]?.hooks[0]).toEqual({
      type: "command",
      command: "/abs/bun",
      args: ["run", "/repo/cli/index.ts", "hook", "card-usage"],
      timeout: 5,
    });
    expect(config.UserPromptExpansion?.[0]?.hooks[0]?.args).toEqual([
      "run",
      "/repo/cli/index.ts",
      "hook",
      "skill-marker",
      "--phase",
      "expansion",
    ]);
    expect(config.PreToolUse?.[0]).toMatchObject({
      matcher: "Skill",
      hooks: [{ args: ["run", "/repo/cli/index.ts", "hook", "skill-marker", "--phase", "pre"] }],
    });
    expect(config.PostToolUse?.[0]).toMatchObject({
      matcher: "Skill",
      hooks: [{ args: ["run", "/repo/cli/index.ts", "hook", "skill-marker", "--phase", "post"] }],
    });
    expect(config.PostToolUseFailure).toBeUndefined();
  });

  test("resolves the current drwn invocation through absolute bun and entrypoint paths", () => {
    const resolved = resolveDrwnHookCommand();

    expect(isAbsolute(resolved.command)).toBe(true);
    expect(resolved.args[0]).toBe("run");
    expect(isAbsolute(resolved.args[1] ?? "")).toBe(true);
    expect(resolved.args[1]).toEndWith("cli/index.ts");
  });
});
