// ABOUTME: Verifies the public hook-policy type contract remains importable.
// ABOUTME: Protects card-authored policy modules from accidental shape drift.

import { describe, expect, it } from "bun:test";
import type { ToolPolicy, ToolPolicyDecision, ToolPolicyEvent } from "../cli/core/hook-policy/types";

describe("hook-policy types", () => {
  it("ToolPolicyEvent carries runtime, phase, and toolName", () => {
    const event: ToolPolicyEvent = { runtime: "claude-code", phase: "pre-tool", toolName: "Bash" };

    expect(event.runtime).toBe("claude-code");
  });

  it("ToolPolicyDecision union covers allow, deny, ask, and log-only", () => {
    const decisions: ToolPolicyDecision[] = [
      { action: "allow" },
      { action: "allow", updatedInput: { command: "ls" }, additionalContext: "noted" },
      { action: "deny", reason: "blocked" },
      { action: "ask", reason: "confirm?" },
      { action: "log-only" },
    ];

    expect(decisions).toHaveLength(5);
  });

  it("ToolPolicy carries policyKind and optional handlers", () => {
    const policy: ToolPolicy = { policyKind: "enforcement" };

    expect(policy.policyKind).toBe("enforcement");
  });
});
