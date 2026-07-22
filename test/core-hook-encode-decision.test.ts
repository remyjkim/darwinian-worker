// ABOUTME: Verifies portable policy decisions encode into runtime hook output.
// ABOUTME: Protects degradation behavior for unsupported runtime capabilities.

import { describe, expect, it } from "bun:test";
import { encodeForClaude, encodeForCodex, encodeForCursor, encodeForMastra, encodeForOpencode } from "../cli/core/hook-generator/encode-decision";
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

describe("encodeForCursor", () => {
  function postEvent(): ToolPolicyEvent {
    return { runtime: "cursor", phase: "post-tool", toolName: "Bash", input: { command: "ls" } };
  }

  it("emits no stdout for passthrough decisions", () => {
    const { logger } = captureLogger();
    expect(encodeForCursor(undefined, event("cursor"), logger)).toBe("");
    expect(encodeForCursor({ action: "allow" }, event("cursor"), logger)).toBe("");
    expect(encodeForCursor({ action: "log-only" }, event("cursor"), logger)).toBe("");
  });

  it("encodes deny and native ask with messages", () => {
    const { logger } = captureLogger();
    expect(parseOutput(encodeForCursor({ action: "deny", reason: "no" }, event("cursor"), logger))).toEqual({
      permission: "deny",
      agent_message: "no",
      user_message: "no",
    });
    expect(parseOutput(encodeForCursor({ action: "ask", reason: "confirm" }, event("cursor"), logger))).toEqual({
      permission: "ask",
      agent_message: "confirm",
      user_message: "confirm",
    });
  });

  it("rewrites input on allow", () => {
    const { logger } = captureLogger();
    expect(parseOutput(encodeForCursor({ action: "allow", updatedInput: { command: "ls -la" } }, event("cursor"), logger))).toEqual({
      permission: "allow",
      updated_input: { command: "ls -la" },
    });
  });

  it("maps post-tool additional context and degrades post-tool blocking", () => {
    const { logger, warnings } = captureLogger();
    expect(parseOutput(encodeForCursor({ action: "allow", additionalContext: "note" }, postEvent(), logger))).toEqual({
      additional_context: "note",
    });
    expect(encodeForCursor({ action: "deny", reason: "late" }, postEvent(), logger)).toBe("");
    expect(warnings).toHaveLength(1);
  });

  it("degrades pre-tool additional context with a warning", () => {
    const { logger, warnings } = captureLogger();
    expect(encodeForCursor({ action: "allow", additionalContext: "note" }, event("cursor"), logger)).toBe("");
    expect(warnings).toHaveLength(1);
  });
});

describe("encodeForOpencode", () => {
  function postEvent(): ToolPolicyEvent {
    return { runtime: "opencode", phase: "post-tool", toolName: "Bash", input: { command: "ls" } };
  }

  it("returns nothing for passthrough decisions", () => {
    const { logger } = captureLogger();
    expect(encodeForOpencode(undefined, event("opencode"), logger)).toBeUndefined();
    expect(encodeForOpencode({ action: "allow" }, event("opencode"), logger)).toBeUndefined();
    expect(encodeForOpencode({ action: "log-only" }, event("opencode"), logger)).toBeUndefined();
  });

  it("blocks deny with the policy reason", () => {
    const { logger } = captureLogger();
    expect(encodeForOpencode({ action: "deny", reason: "no" }, event("opencode"), logger)).toEqual({ block: "no" });
  });

  it("fails closed on ask with an explanatory message", () => {
    const { logger } = captureLogger();
    const result = encodeForOpencode({ action: "ask", reason: "confirm" }, event("opencode"), logger);
    expect(result?.block).toContain("confirm");
    expect(result?.block).toContain("cannot ask");
  });

  it("rewrites args for allow with a plain-object updated input", () => {
    const { logger } = captureLogger();
    expect(encodeForOpencode({ action: "allow", updatedInput: { command: "ls -la" } }, event("opencode"), logger))
      .toEqual({ updatedArgs: { command: "ls -la" } });
  });

  it("degrades non-object rewrites and additional context with warnings", () => {
    const { logger, warnings } = captureLogger();
    expect(encodeForOpencode({ action: "allow", updatedInput: "raw" }, event("opencode"), logger)).toBeUndefined();
    expect(encodeForOpencode({ action: "allow", additionalContext: "note" }, event("opencode"), logger)).toBeUndefined();
    expect(warnings).toHaveLength(2);
  });

  it("cannot block after execution and warns instead", () => {
    const { logger, warnings } = captureLogger();
    expect(encodeForOpencode({ action: "deny", reason: "late" }, postEvent(), logger)).toBeUndefined();
    expect(encodeForOpencode({ action: "ask", reason: "late" }, postEvent(), logger)).toBeUndefined();
    expect(warnings).toHaveLength(2);
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
