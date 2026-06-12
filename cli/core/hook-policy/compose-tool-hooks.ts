// ABOUTME: Composes multiple ToolPolicy modules into a single hook surface.
// ABOUTME: Implements deterministic decision priority and timeout handling.

import { HookTimeoutError, runWithTimeout } from "./run-with-timeout";
import type { Runtime, ToolPolicy, ToolPolicyDecision, ToolPolicyEvent } from "./types";

export interface ComposeOptions {
  runtime: Runtime;
  logger?: {
    error(data: unknown, message?: string): void;
    warn(data: unknown, message?: string): void;
  };
  defaultTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 25_000;

function errorReason(error: unknown) {
  if (error instanceof HookTimeoutError) {
    return `policy timeout (${error.ms}ms)`;
  }
  if (error instanceof Error) {
    return `policy error: ${error.message}`;
  }
  return `policy error: ${String(error)}`;
}

function matches(policy: ToolPolicy, event: ToolPolicyEvent) {
  return policy.matcher ? new RegExp(policy.matcher).test(event.toolName) : true;
}

function combineAllowDecisions(decisions: ToolPolicyDecision[]) {
  const allows = decisions.filter((decision): decision is Extract<ToolPolicyDecision, { action: "allow" }> =>
    decision.action === "allow"
  );
  if (allows.length === 0) {
    return null;
  }

  const lastMutation = [...allows].reverse().find((decision) => decision.updatedInput !== undefined);
  const additionalContext = allows.map((decision) => decision.additionalContext).filter(Boolean).join("\n");

  return {
    action: "allow" as const,
    ...(lastMutation ? { updatedInput: lastMutation.updatedInput } : {}),
    ...(additionalContext ? { additionalContext } : {}),
  };
}

export function composeToolHooks(policies: ToolPolicy[], options: ComposeOptions) {
  const logger = options.logger ?? { error: () => {}, warn: () => {} };
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async beforeToolCall(event: ToolPolicyEvent): Promise<ToolPolicyDecision | undefined> {
      let cumulativeEvent = { ...event, runtime: options.runtime };
      const decisions: ToolPolicyDecision[] = [];

      for (const policy of policies) {
        if (!policy.beforeToolCall) {
          continue;
        }

        try {
          if (!matches(policy, cumulativeEvent)) {
            continue;
          }
          const decision = await runWithTimeout(
            policy.beforeToolCall(cumulativeEvent),
            policy.timeoutMs ?? defaultTimeoutMs,
          );
          if (!decision) {
            continue;
          }
          decisions.push(decision);
          if (decision.action === "deny") {
            return decision;
          }
          if (decision.action === "allow" && decision.updatedInput !== undefined) {
            cumulativeEvent = { ...cumulativeEvent, input: decision.updatedInput };
          }
        } catch (error) {
          if (policy.policyKind === "enforcement") {
            return { action: "deny", reason: errorReason(error) };
          }
          logger.error({ error, policyKind: policy.policyKind }, "observer policy failed");
        }
      }

      const ask = decisions.find((decision) => decision.action === "ask");
      if (ask) {
        return ask;
      }

      const allow = combineAllowDecisions(decisions);
      if (allow) {
        return allow;
      }

      return decisions.some((decision) => decision.action === "log-only") ? { action: "log-only" } : undefined;
    },

    async afterToolCall(event: ToolPolicyEvent): Promise<void> {
      const runtimeEvent = { ...event, runtime: options.runtime };
      for (const policy of policies) {
        if (!policy.afterToolCall) {
          continue;
        }
        try {
          if (!matches(policy, runtimeEvent)) {
            continue;
          }
          await runWithTimeout(policy.afterToolCall(runtimeEvent), policy.timeoutMs ?? defaultTimeoutMs);
        } catch (error) {
          if (policy.policyKind === "enforcement") {
            throw error;
          }
          logger.error({ error, policyKind: policy.policyKind }, "observer afterToolCall failed");
        }
      }
    },
  };
}
