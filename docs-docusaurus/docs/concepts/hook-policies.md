---
sidebar_position: 14
---

# Hook Policies

A **hook policy** is a TypeScript module that intercepts tool calls at runtime, allowing a mind card author to observe, block, approve, or redirect individual tool invocations before and after they execute.

## The `ToolPolicy` interface

```ts
import { defineToolPolicy } from "darwinian/hook-policy";

export default defineToolPolicy({
  policyKind: "enforcement",  // or "observer"
  matcher: "Bash",            // optional glob pattern against tool name
  timeoutMs: 5000,            // optional; defaults applied by runtime

  async beforeToolCall(event) {
    // Inspect the call before execution
    return { action: "allow" };
  },

  async afterToolCall(event) {
    // Observe the result after execution
  },
});
```

### `policyKind`

Controls how the runtime handles failures and decisions.

| Value | Behavior |
|---|---|
| `"enforcement"` | Errors and `"deny"` decisions halt the tool call. A failing enforcement policy is treated as a denial. |
| `"observer"` | Errors are logged and swallowed — the tool call proceeds regardless. Decisions other than `"deny"` are advisory. |

Scaffold with `drwn card source add-hook` produces an observer stub by default. Switch to `"enforcement"` when the policy is stable and you want hard blocks.

### `matcher`

An optional string matched against the incoming tool name. When omitted, the policy applies to every tool call. When set, the policy is skipped if the tool name does not match.

### `timeoutMs`

Per-callback timeout in milliseconds. If a callback exceeds this, the runtime treats it as an enforcement failure or swallows it depending on `policyKind`.

## `ToolPolicyEvent`

Both callbacks receive a `ToolPolicyEvent`:

```ts
interface ToolPolicyEvent {
  runtime: "claude-code" | "codex" | "mastra";
  phase: "pre-tool" | "post-tool";
  toolName: string;
  input?: unknown;        // populated in pre-tool
  output?: unknown;       // populated in post-tool
  error?: { name: string; message: string };  // set when tool call failed
  cwd?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}
```

## Decisions (`beforeToolCall` return values)

`beforeToolCall` can return a decision or `undefined`/`void`. When multiple policies match, decisions are composed.

| Decision | Effect |
|---|---|
| `{ action: "allow" }` | Proceed with the tool call. May include `additionalContext` (string) appended to the input) or `updatedInput` (replaces the tool input). |
| `{ action: "deny", reason: string }` | Block the tool call. `reason` is returned to the agent. `syntheticOutput` can substitute a fake tool result. |
| `{ action: "ask", reason: string }` | Pause and ask the user for approval. Not all runtimes support this — unsupported runtimes fall through to `"allow"`. |
| `{ action: "log-only" }` | Proceed, but note that the call was observed. Useful in observer policies. |
| `undefined` / `void` | No opinion — other policies in the stack decide. |

`afterToolCall` returns `void` — it is observation only.

## Scaffolding a policy

```bash
# Scaffold an observer stub inside a card source
drwn card source add-hook @your-handle/backend audit-tool-calls

# Remove a policy
drwn card source remove-hook @your-handle/backend audit-tool-calls
drwn card source remove-hook @your-handle/backend audit-tool-calls --keep-files
```

The generated `hooks/audit-tool-calls/policy.ts` is a minimal observer template. Edit it directly to add logic.

## Trust and consent

A consumer project must grant trust before hook policies are active at runtime:

```bash
drwn card trust @your-handle/backend --hooks
drwn card trust @your-handle/backend --hooks --range "^1.0.0"
drwn card untrust @your-handle/backend --hooks
```

Without consent, `drwn write` materializes the card's skills and MCP servers but does not activate its hook policies. `drwn doctor` reports a `hookIssues` entry for cards with unapplied hooks.

## See also

- [Minds](./minds) — how hook policies compose with other mind content
- [`drwn card source`](../reference/cli/card) — scaffolding and removing policies
- [Guide: Authoring Hook Policies](../guides/authoring-hook-policies)
