// ABOUTME: Verifies composition order and error behavior for tool policies.
// ABOUTME: Protects the runtime contract used by generated hook composers.

import { describe, expect, it } from "bun:test";
import { composeToolHooks } from "../cli/core/hook-policy/compose-tool-hooks";
import type { ToolPolicy, ToolPolicyEvent } from "../cli/core/hook-policy/types";

const baseEvent: ToolPolicyEvent = {
  runtime: "claude-code",
  phase: "pre-tool",
  toolName: "Bash",
  input: { command: "ls" },
};

describe("composeToolHooks", () => {
  it("should short-circuit on first deny", async () => {
    let secondCalled = false;
    const policies: ToolPolicy[] = [
      { policyKind: "enforcement", beforeToolCall: async () => ({ action: "deny", reason: "no" }) },
      { policyKind: "enforcement", beforeToolCall: async () => { secondCalled = true; } },
    ];

    const result = await composeToolHooks(policies, { runtime: "claude-code" }).beforeToolCall(baseEvent);

    expect(result?.action).toBe("deny");
    expect(secondCalled).toBe(false);
  });

  it("should chain updated input across policies", async () => {
    const seen: unknown[] = [];
    const policies: ToolPolicy[] = [
      { policyKind: "observer", beforeToolCall: async () => ({ action: "allow", updatedInput: { command: "echo hi" } }) },
      { policyKind: "observer", beforeToolCall: async (event) => { seen.push(event.input); } },
    ];

    const result = await composeToolHooks(policies, { runtime: "claude-code" }).beforeToolCall(baseEvent);

    expect(seen[0]).toEqual({ command: "echo hi" });
    expect(result).toEqual({ action: "allow", updatedInput: { command: "echo hi" } });
  });

  it("should prioritize ask over allow when no deny occurs", async () => {
    const policies: ToolPolicy[] = [
      { policyKind: "observer", beforeToolCall: async () => ({ action: "ask", reason: "confirm?" }) },
      { policyKind: "observer", beforeToolCall: async () => ({ action: "allow" }) },
    ];

    const result = await composeToolHooks(policies, { runtime: "claude-code" }).beforeToolCall(baseEvent);

    expect(result).toEqual({ action: "ask", reason: "confirm?" });
  });

  it("should swallow observer afterToolCall failures", async () => {
    const policies: ToolPolicy[] = [
      { policyKind: "observer", afterToolCall: async () => { throw new Error("boom"); } },
    ];

    await expect(
      composeToolHooks(policies, { runtime: "claude-code" }).afterToolCall({ ...baseEvent, phase: "post-tool" }),
    ).resolves.toBeUndefined();
  });

  it("should propagate enforcement afterToolCall failures", async () => {
    const policies: ToolPolicy[] = [
      { policyKind: "enforcement", afterToolCall: async () => { throw new Error("boom"); } },
    ];

    await expect(
      composeToolHooks(policies, { runtime: "claude-code" }).afterToolCall({ ...baseEvent, phase: "post-tool" }),
    ).rejects.toThrow("boom");
  });

  it("should deny when enforcement beforeToolCall times out", async () => {
    const policies: ToolPolicy[] = [
      {
        policyKind: "enforcement",
        timeoutMs: 10,
        beforeToolCall: () => new Promise((resolve) => setTimeout(() => resolve({ action: "allow" }), 100)),
      },
    ];

    const result = await composeToolHooks(policies, { runtime: "claude-code" }).beforeToolCall(baseEvent);

    expect(result?.action).toBe("deny");
    expect((result as { reason?: string }).reason).toContain("policy timeout");
  });
});
