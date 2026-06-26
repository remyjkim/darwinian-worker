// ABOUTME: Verifies portable policy decisions encode into runtime hook output.
// ABOUTME: Protects degradation behavior for unsupported runtime capabilities.

import { describe, expect, it } from "bun:test";
import { encodeForClaude, encodeForCodex, encodeForMastra } from "../cli/core/hook-generator/encode-decision";
import type { ToolPolicyEvent } from "../cli/core/hook-policy/types";

function event(runtime: ToolPolicyEvent["runtime"], toolName = "Bash"): ToolPolicyEvent {
  return {
    runtime,
    phase: "pre-tool",
    toolName,
    input: { command: "ls" },
  };
}

function captureLogger() {
  const warnings: unknown[] = [];
  return {
    warnings,
    logger: {
      warn(data: unknown) {
        warnings.push(data);
      },
    },
  };
}

function parseOutput(text: string) {
  return JSON.parse(text) as Record<string, unknown>;
}

describe("encodeForClaude", () => {
  it("emits no stdout for passthrough decisions", () => {
    expect(encodeForClaude(undefined, event("claude-code"))).toBe("");
    expect(encodeForClaude({ action: "allow" }, event("claude-code"))).toBe("");
    expect(encodeForClaude({ action: "log-only" }, event("claude-code"))).toBe("");
  });

  it("encodes deny, ask, context, and updated input", () => {
    expect(parseOutput(encodeForClaude({ action: "deny", reason: "blocked" }, event("claude-code")))).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "blocked",
      },
    });
    expect(parseOutput(encodeForClaude({ action: "ask", reason: "confirm?" }, event("claude-code")))).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "confirm?",
      },
    });
    expect(parseOutput(encodeForClaude(
      { action: "allow", additionalContext: "note", updatedInput: { command: "pwd" } },
      event("claude-code"),
    ))).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        additionalContext: "note",
        updatedInput: { command: "pwd" },
      },
    });
  });
});

describe("encodeForCodex", () => {
  it("degrades ask to deny instead of emitting unsupported permissionDecision ask", () => {
    const { logger } = captureLogger();
    const output = parseOutput(encodeForCodex({ action: "ask", reason: "confirm?" }, event("codex"), logger));
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Manual approval requested by policy but Codex hooks do not support ask: confirm?",
      },
    });
    expect(JSON.stringify(output)).not.toContain('"ask"');
  });

  it("allows safe Bash command rewrites", () => {
    const { logger } = captureLogger();
    expect(parseOutput(encodeForCodex({ action: "allow", updatedInput: { command: "pwd" } }, event("codex"), logger))).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { command: "pwd" },
      },
    });
  });

  it("omits and logs unsafe or unsupported Codex rewrites", () => {
    const { logger, warnings } = captureLogger();
    expect(encodeForCodex({ action: "allow", updatedInput: { path: "x" } }, event("codex", "Bash"), logger)).toBe("");
    expect(encodeForCodex({ action: "allow", updatedInput: { command: "x" } }, event("codex", "Read"), logger)).toBe("");
    expect(warnings).toHaveLength(2);
  });

  it("allows MCP argument replacement objects", () => {
    const { logger } = captureLogger();
    expect(parseOutput(encodeForCodex({ action: "allow", updatedInput: { query: "docs" } }, event("codex", "mcp__context7__query"), logger))).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { query: "docs" },
      },
    });
  });
});

describe("encodeForMastra", () => {
  it("blocks deny and ask decisions", () => {
    const { logger } = captureLogger();
    expect(encodeForMastra({ action: "deny", reason: "blocked", syntheticOutput: { ok: false } }, logger)).toEqual({
      proceed: false,
      output: { ok: false },
    });
    expect(encodeForMastra({ action: "ask", reason: "confirm?" }, logger)).toEqual({
      proceed: false,
      output: { reason: "confirm?" },
    });
  });

  it("logs unsupported allow enrichments and otherwise passes through", () => {
    const { logger, warnings } = captureLogger();
    expect(encodeForMastra({ action: "allow", updatedInput: { command: "pwd" }, additionalContext: "note" }, logger)).toBeUndefined();
    expect(encodeForMastra({ action: "log-only" }, logger)).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });
});
