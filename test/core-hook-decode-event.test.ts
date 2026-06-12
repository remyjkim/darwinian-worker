// ABOUTME: Verifies runtime hook payloads decode into portable ToolPolicyEvent values.
// ABOUTME: Keeps host-specific fields preserved under metadata for policy authors.

import { describe, expect, it } from "bun:test";
import { decodeClaudeEvent, decodeCodexEvent, decodeMastraEvent } from "../cli/core/hook-generator/decode-event";

describe("decodeClaudeEvent", () => {
  it("maps Claude PreToolUse payloads", () => {
    expect(decodeClaudeEvent({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      cwd: "/repo",
      session_id: "s1",
      transcript_path: "/tmp/transcript.jsonl",
    })).toEqual({
      runtime: "claude-code",
      phase: "pre-tool",
      toolName: "Bash",
      input: { command: "ls" },
      cwd: "/repo",
      sessionId: "s1",
      metadata: {
        hook_event_name: "PreToolUse",
        transcript_path: "/tmp/transcript.jsonl",
      },
    });
  });

  it("maps Claude PostToolUse output and error", () => {
    expect(decodeClaudeEvent({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "false" },
      tool_response: "failed",
      tool_error: { name: "Error", message: "exit 1" },
    })).toMatchObject({
      runtime: "claude-code",
      phase: "post-tool",
      toolName: "Bash",
      input: { command: "false" },
      output: "failed",
      error: { name: "Error", message: "exit 1" },
    });
  });
});

describe("decodeCodexEvent", () => {
  it("maps Codex PreToolUse payloads and preserves common fields", () => {
    expect(decodeCodexEvent({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "pwd" },
      cwd: "/repo",
      turn_id: "t1",
      permission_mode: "on-request",
      model: "gpt-5",
      transcript_path: "/tmp/t.jsonl",
      tool_use_id: "u1",
      extra: true,
    })).toEqual({
      runtime: "codex",
      phase: "pre-tool",
      toolName: "Bash",
      input: { command: "pwd" },
      cwd: "/repo",
      metadata: {
        hook_event_name: "PreToolUse",
        turn_id: "t1",
        permission_mode: "on-request",
        model: "gpt-5",
        transcript_path: "/tmp/t.jsonl",
        tool_use_id: "u1",
        extra: true,
      },
    });
  });

  it("maps Codex PostToolUse response", () => {
    expect(decodeCodexEvent({
      hook_event_name: "PostToolUse",
      tool_name: "mcp__docs__query",
      tool_input: { q: "hooks" },
      tool_response: { ok: true },
    })).toMatchObject({
      runtime: "codex",
      phase: "post-tool",
      toolName: "mcp__docs__query",
      input: { q: "hooks" },
      output: { ok: true },
    });
  });
});

describe("decodeMastraEvent", () => {
  it("maps Mastra beforeToolCall args", () => {
    expect(decodeMastraEvent({
      phase: "pre-tool",
      toolName: "search",
      input: { q: "hooks" },
      context: { requestId: "r1" },
      metadata: { agentName: "support" },
    })).toEqual({
      runtime: "mastra",
      phase: "pre-tool",
      toolName: "search",
      input: { q: "hooks" },
      metadata: {
        context: { requestId: "r1" },
        agentName: "support",
      },
    });
  });
});
