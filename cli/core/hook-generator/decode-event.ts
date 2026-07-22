// ABOUTME: Decodes runtime hook payloads into the portable ToolPolicyEvent shape.
// ABOUTME: Preserves runtime-specific fields under metadata for advanced policies.

import type { ToolPolicyEvent } from "../hook-policy/types";

type Phase = ToolPolicyEvent["phase"];

export interface MastraHookArgs {
  phase?: Phase;
  toolName: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  context?: unknown;
  metadata?: Record<string, unknown>;
}

const CLAUDE_KNOWN_FIELDS = new Set([
  "tool_name",
  "tool_input",
  "tool_response",
  "tool_error",
  "cwd",
  "session_id",
]);

const CODEX_KNOWN_FIELDS = new Set([
  "tool_name",
  "tool_input",
  "tool_response",
  "tool_error",
  "cwd",
]);

const CURSOR_KNOWN_FIELDS = new Set([
  "tool_name",
  "tool_input",
  "tool_response",
  "tool_error",
  "cwd",
  "conversation_id",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function eventPhase(payload: Record<string, unknown>, explicitPhase?: Phase): Phase {
  if (explicitPhase) {
    return explicitPhase;
  }
  if (payload.hook_event_name === "PreToolUse") {
    return "pre-tool";
  }
  if (payload.hook_event_name === "PostToolUse") {
    return "post-tool";
  }
  throw new Error(`Unsupported hook_event_name: ${String(payload.hook_event_name)}`);
}

function requireToolName(payload: Record<string, unknown>) {
  if (typeof payload.tool_name !== "string" || payload.tool_name.length === 0) {
    throw new Error("Hook payload missing tool_name");
  }
  return payload.tool_name;
}

function decodeError(value: unknown): ToolPolicyEvent["error"] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (isObject(value)) {
    return {
      name: typeof value.name === "string" ? value.name : "Error",
      message: typeof value.message === "string" ? value.message : JSON.stringify(value),
    };
  }
  return { name: "Error", message: String(value) };
}

function metadataFrom(payload: Record<string, unknown>, knownFields: Set<string>) {
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!knownFields.has(key)) {
      metadata[key] = value;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function decodeClaudeEvent(payload: Record<string, unknown>, phase?: Phase): ToolPolicyEvent {
  const decodedPhase = eventPhase(payload, phase);
  const event: ToolPolicyEvent = {
    runtime: "claude-code",
    phase: decodedPhase,
    toolName: requireToolName(payload),
    input: payload.tool_input,
    ...(payload.tool_response !== undefined ? { output: payload.tool_response } : {}),
    ...(decodeError(payload.tool_error) ? { error: decodeError(payload.tool_error) } : {}),
    ...(typeof payload.cwd === "string" ? { cwd: payload.cwd } : {}),
    ...(typeof payload.session_id === "string" ? { sessionId: payload.session_id } : {}),
    ...(metadataFrom(payload, CLAUDE_KNOWN_FIELDS) ? { metadata: metadataFrom(payload, CLAUDE_KNOWN_FIELDS) } : {}),
  };
  return event;
}

export function decodeCodexEvent(payload: Record<string, unknown>, phase?: Phase): ToolPolicyEvent {
  const decodedPhase = eventPhase(payload, phase);
  const event: ToolPolicyEvent = {
    runtime: "codex",
    phase: decodedPhase,
    toolName: requireToolName(payload),
    input: payload.tool_input,
    ...(payload.tool_response !== undefined ? { output: payload.tool_response } : {}),
    ...(decodeError(payload.tool_error) ? { error: decodeError(payload.tool_error) } : {}),
    ...(typeof payload.cwd === "string" ? { cwd: payload.cwd } : {}),
    ...(metadataFrom(payload, CODEX_KNOWN_FIELDS) ? { metadata: metadataFrom(payload, CODEX_KNOWN_FIELDS) } : {}),
  };
  return event;
}

// Cursor emits camelCase event names in hooks.json (preToolUse/postToolUse); payloads are
// normalized case-insensitively because Cursor also loads Claude-Code-style hooks.
function cursorEventPhase(payload: Record<string, unknown>, explicitPhase?: Phase): Phase {
  if (explicitPhase) {
    return explicitPhase;
  }
  const name = String(payload.hook_event_name ?? "").toLowerCase();
  if (name === "pretooluse") {
    return "pre-tool";
  }
  if (name === "posttooluse") {
    return "post-tool";
  }
  throw new Error(`Unsupported hook_event_name: ${String(payload.hook_event_name)}`);
}

// Cursor names its shell tool "Shell"; policies match the canonical "Bash" name shared
// by the other runtimes. Remaining cursor tool types already use canonical names.
const CURSOR_TOOL_NAMES: Record<string, string> = {
  Shell: "Bash",
};

export function decodeCursorEvent(payload: Record<string, unknown>, phase?: Phase): ToolPolicyEvent {
  const decodedPhase = cursorEventPhase(payload, phase);
  const rawToolName = requireToolName(payload);
  const event: ToolPolicyEvent = {
    runtime: "cursor",
    phase: decodedPhase,
    toolName: CURSOR_TOOL_NAMES[rawToolName] ?? rawToolName,
    input: payload.tool_input,
    ...(payload.tool_response !== undefined ? { output: payload.tool_response } : {}),
    ...(decodeError(payload.tool_error) ? { error: decodeError(payload.tool_error) } : {}),
    ...(typeof payload.cwd === "string" ? { cwd: payload.cwd } : {}),
    ...(typeof payload.conversation_id === "string" ? { sessionId: payload.conversation_id } : {}),
    ...(metadataFrom(payload, CURSOR_KNOWN_FIELDS) ? { metadata: metadataFrom(payload, CURSOR_KNOWN_FIELDS) } : {}),
  };
  return event;
}

// OpenCode plugin hooks receive (input, output) pairs in-process; tool ids are lowercase
// built-ins that normalize to the canonical names card policy matchers are written against.
const OPENCODE_TOOL_NAMES: Record<string, string> = {
  bash: "Bash",
  read: "Read",
  edit: "Edit",
  write: "Write",
  glob: "Glob",
  grep: "Grep",
  task: "Task",
  webfetch: "WebFetch",
  skill: "Skill",
  todowrite: "TodoWrite",
  todoread: "TodoRead",
};

const OPENCODE_KNOWN_INPUT_FIELDS = new Set(["sessionID"]);

export function decodeOpencodeEvent(
  hookInput: Record<string, unknown>,
  hookOutput: Record<string, unknown>,
  phase: Phase,
): ToolPolicyEvent {
  const rawTool = typeof hookInput.tool === "string" && hookInput.tool.length > 0
    ? hookInput.tool
    : (() => {
        throw new Error("Hook payload missing tool");
      })();
  const output = hookOutput.output ?? hookOutput.result;
  const event: ToolPolicyEvent = {
    runtime: "opencode",
    phase,
    toolName: OPENCODE_TOOL_NAMES[rawTool] ?? rawTool,
    input: hookOutput.args,
    ...(phase === "post-tool" && output !== undefined ? { output } : {}),
    ...(typeof hookInput.sessionID === "string" ? { sessionId: hookInput.sessionID } : {}),
    ...(metadataFrom(hookInput, OPENCODE_KNOWN_INPUT_FIELDS) ? { metadata: metadataFrom(hookInput, OPENCODE_KNOWN_INPUT_FIELDS) } : {}),
  };
  return event;
}

export function decodeMastraEvent(args: MastraHookArgs): ToolPolicyEvent {
  const metadata = {
    ...(args.context !== undefined ? { context: args.context } : {}),
    ...(args.metadata ?? {}),
  };

  return {
    runtime: "mastra",
    phase: args.phase ?? "pre-tool",
    toolName: args.toolName,
    ...(args.input !== undefined ? { input: args.input } : {}),
    ...(args.output !== undefined ? { output: args.output } : {}),
    ...(decodeError(args.error) ? { error: decodeError(args.error) } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}
