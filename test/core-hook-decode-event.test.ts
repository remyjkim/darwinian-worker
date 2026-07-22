// ABOUTME: Verifies runtime hook payloads decode into portable ToolPolicyEvent values.
// ABOUTME: Keeps host-specific fields preserved under metadata for policy authors.

import { describe, expect, it } from "bun:test";
import { decodeClaudeEvent, decodeCodexEvent, decodeCursorEvent, decodeMastraEvent, decodeOpencodeEvent } from "../cli/core/hook-generator/decode-event";

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

describe("decodeCursorEvent", () => {
  it("maps cursor preToolUse payloads and sources the session from the conversation", () => {
    expect(decodeCursorEvent({
      hook_event_name: "preToolUse",
      tool_name: "Shell",
      tool_input: { command: "ls" },
      cwd: "/repo",
      conversation_id: "c1",
      workspace_roots: ["/repo"],
    })).toEqual({
      runtime: "cursor",
      phase: "pre-tool",
      toolName: "Bash",
      input: { command: "ls" },
      cwd: "/repo",
      sessionId: "c1",
      metadata: {
        hook_event_name: "preToolUse",
        workspace_roots: ["/repo"],
      },
    });
  });

  it("accepts PascalCase event names and maps post-tool output", () => {
    expect(decodeCursorEvent({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { path: "a.txt" },
      tool_response: "contents",
    })).toMatchObject({
      runtime: "cursor",
      phase: "post-tool",
      toolName: "Read",
      input: { path: "a.txt" },
      output: "contents",
    });
  });

  it("accepts camelCase postToolUse event names", () => {
    expect(decodeCursorEvent({
      hook_event_name: "postToolUse",
      tool_name: "Read",
      tool_input: {},
    }).phase).toBe("post-tool");
  });

  it("normalizes cursor tool types to canonical policy names", () => {
    expect(decodeCursorEvent({ hook_event_name: "preToolUse", tool_name: "Shell", tool_input: {} }).toolName).toBe("Bash");
    expect(decodeCursorEvent({ hook_event_name: "preToolUse", tool_name: "Read", tool_input: {} }).toolName).toBe("Read");
    expect(decodeCursorEvent({ hook_event_name: "preToolUse", tool_name: "MCP:notion-search", tool_input: {} }).toolName).toBe("MCP:notion-search");
  });
});

describe("decodeOpencodeEvent", () => {
  it("maps tool.execute.before payloads and normalizes built-in tool ids", () => {
    expect(decodeOpencodeEvent(
      { tool: "bash", sessionID: "s1", callID: "c1" },
      { args: { command: "ls" } },
      "pre-tool",
    )).toEqual({
      runtime: "opencode",
      phase: "pre-tool",
      toolName: "Bash",
      input: { command: "ls" },
      sessionId: "s1",
      metadata: { tool: "bash", callID: "c1" },
    });
  });

  it("passes through unknown tool ids and maps post-tool output", () => {
    expect(decodeOpencodeEvent(
      { tool: "mymcp_search" },
      { args: { q: "hooks" }, output: "results" },
      "post-tool",
    )).toMatchObject({
      runtime: "opencode",
      phase: "post-tool",
      toolName: "mymcp_search",
      input: { q: "hooks" },
      output: "results",
    });
  });

  it("normalizes the other built-in tool ids", () => {
    for (const [raw, canonical] of [["read", "Read"], ["edit", "Edit"], ["write", "Write"], ["glob", "Glob"], ["grep", "Grep"], ["task", "Task"], ["webfetch", "WebFetch"], ["skill", "Skill"]] as const) {
      expect(decodeOpencodeEvent({ tool: raw }, { args: {} }, "pre-tool").toolName).toBe(canonical);
    }
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
