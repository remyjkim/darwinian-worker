// ABOUTME: Encodes portable hook policy decisions into runtime-native outputs.
// ABOUTME: Centralizes runtime capability degradation and warning behavior.

import type { ToolPolicyDecision, ToolPolicyEvent } from "../hook-policy/types";

export interface HookAdapterLogger {
  warn(data: unknown, message?: string): void;
}

export interface MastraHookDecision {
  proceed: boolean;
  output?: unknown;
}

function hookEventName(event: ToolPolicyEvent) {
  return event.phase === "pre-tool" ? "PreToolUse" : "PostToolUse";
}

function stringifyOutput(value: unknown) {
  return `${JSON.stringify(value)}\n`;
}

function hasCommandRewrite(value: unknown): value is { command: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { command?: unknown }).command === "string",
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function encodeCommandRuntimeDecision(output: Record<string, unknown>) {
  return stringifyOutput({ hookSpecificOutput: output });
}

export function encodeForClaude(decision: ToolPolicyDecision | undefined, event: ToolPolicyEvent): string {
  if (!decision || decision.action === "log-only") {
    return "";
  }

  const hookEvent = hookEventName(event);
  if (decision.action === "deny") {
    return encodeCommandRuntimeDecision({
      hookEventName: hookEvent,
      permissionDecision: "deny",
      permissionDecisionReason: decision.reason,
    });
  }

  if (decision.action === "ask") {
    return encodeCommandRuntimeDecision({
      hookEventName: hookEvent,
      permissionDecision: "ask",
      permissionDecisionReason: decision.reason,
    });
  }

  const output: Record<string, unknown> = { hookEventName: hookEvent };
  if (decision.updatedInput !== undefined) {
    output.permissionDecision = "allow";
    output.updatedInput = decision.updatedInput;
  }
  if (decision.additionalContext) {
    output.additionalContext = decision.additionalContext;
  }

  return Object.keys(output).length > 1 ? encodeCommandRuntimeDecision(output) : "";
}

function codexUpdatedInput(decision: Extract<ToolPolicyDecision, { action: "allow" }>, event: ToolPolicyEvent, logger: HookAdapterLogger) {
  if (decision.updatedInput === undefined) {
    return undefined;
  }

  if (event.toolName === "Bash" || event.toolName === "apply_patch") {
    if (hasCommandRewrite(decision.updatedInput)) {
      return decision.updatedInput;
    }
    logger.warn(
      { runtime: "codex", toolName: event.toolName, updatedInput: decision.updatedInput },
      "omitted unsupported Codex command rewrite",
    );
    return undefined;
  }

  if (event.toolName.startsWith("mcp__")) {
    if (isPlainObject(decision.updatedInput)) {
      return decision.updatedInput;
    }
    logger.warn(
      { runtime: "codex", toolName: event.toolName, updatedInput: decision.updatedInput },
      "omitted unsupported Codex MCP argument rewrite",
    );
    return undefined;
  }

  logger.warn(
    { runtime: "codex", toolName: event.toolName, updatedInput: decision.updatedInput },
    "omitted unsupported Codex tool rewrite",
  );
  return undefined;
}

export function encodeForCodex(
  decision: ToolPolicyDecision | undefined,
  event: ToolPolicyEvent,
  logger: HookAdapterLogger,
): string {
  if (!decision || decision.action === "log-only") {
    return "";
  }

  const hookEvent = hookEventName(event);
  if (decision.action === "deny") {
    return encodeCommandRuntimeDecision({
      hookEventName: hookEvent,
      permissionDecision: "deny",
      permissionDecisionReason: decision.reason,
    });
  }

  if (decision.action === "ask") {
    return encodeCommandRuntimeDecision({
      hookEventName: hookEvent,
      permissionDecision: "deny",
      permissionDecisionReason: `Manual approval requested by policy but Codex hooks do not support ask: ${decision.reason}`,
    });
  }

  const output: Record<string, unknown> = { hookEventName: hookEvent };
  const updatedInput = codexUpdatedInput(decision, event, logger);
  if (updatedInput !== undefined) {
    output.permissionDecision = "allow";
    output.updatedInput = updatedInput;
  }
  if (decision.additionalContext) {
    output.additionalContext = decision.additionalContext;
  }

  return Object.keys(output).length > 1 ? encodeCommandRuntimeDecision(output) : "";
}

export function encodeForMastra(
  decision: ToolPolicyDecision | undefined,
  logger: HookAdapterLogger,
): MastraHookDecision | undefined {
  if (!decision || decision.action === "log-only") {
    return undefined;
  }
  if (decision.action === "deny") {
    return {
      proceed: false,
      output: decision.syntheticOutput ?? { blocked: true, reason: decision.reason },
    };
  }
  if (decision.action === "ask") {
    return { proceed: false, output: { reason: decision.reason } };
  }
  if (decision.updatedInput !== undefined || decision.additionalContext) {
    logger.warn(
      { runtime: "mastra", decision },
      "Mastra hooks do not support input rewrites or additional context",
    );
  }
  return undefined;
}
