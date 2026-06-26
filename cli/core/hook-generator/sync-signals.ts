// ABOUTME: Builds Claude Code hook registrations for first-party drwn session-signal hooks.
// ABOUTME: Keeps signal materialization separate from card policy hook composer generation.

import { fileURLToPath } from "node:url";
import type { ClaudeHooksConfig } from "../mcp";

export interface DrwnHookCommand {
  command: string;
  args: string[];
}

const SIGNAL_TIMEOUT_SECONDS = 5;

export function resolveDrwnHookCommand(): DrwnHookCommand {
  return {
    command: process.execPath,
    args: ["run", fileURLToPath(new URL("../../index.ts", import.meta.url))],
  };
}

export function signalHooksConfig(drwnBin: DrwnHookCommand): ClaudeHooksConfig {
  const command = (args: string[]) => ({
    type: "command" as const,
    command: drwnBin.command,
    args: [...drwnBin.args, ...args],
    timeout: SIGNAL_TIMEOUT_SECONDS,
  });

  return {
    UserPromptSubmit: [{ hooks: [command(["hook", "card-usage"])] }],
    UserPromptExpansion: [{ hooks: [command(["hook", "skill-marker", "--phase", "expansion"])] }],
    PreToolUse: [{ matcher: "Skill", hooks: [command(["hook", "skill-marker", "--phase", "pre"])] }],
    PostToolUse: [{ matcher: "Skill", hooks: [command(["hook", "skill-marker", "--phase", "post"])] }],
  };
}
