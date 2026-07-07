// ABOUTME: Runtime-agnostic policy contract types for Card hooks.
// ABOUTME: Imported by author policy modules and generated composition runtimes.

export type Runtime = "claude-code" | "codex" | "mastra";

export interface ToolPolicyEvent {
  runtime: Runtime;
  phase: "pre-tool" | "post-tool";
  toolName: string;
  input?: unknown;
  output?: unknown;
  error?: { name: string; message: string };
  cwd?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export type ToolPolicyDecision =
  | { action: "allow"; additionalContext?: string; updatedInput?: unknown }
  | { action: "deny"; reason: string; syntheticOutput?: unknown }
  | { action: "ask"; reason: string }
  | { action: "log-only" };

export interface ToolPolicy {
  policyKind: "enforcement" | "observer";
  matcher?: string;
  timeoutMs?: number;
  beforeToolCall?(event: ToolPolicyEvent): Promise<ToolPolicyDecision | void> | ToolPolicyDecision | void;
  afterToolCall?(event: ToolPolicyEvent): Promise<void> | void;
}
