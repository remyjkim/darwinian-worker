---
sidebar_position: 10
---

# Authoring Hook Policies

A hook policy intercepts tool calls at runtime — before execution (`beforeToolCall`) and after (`afterToolCall`). You can observe, block, approve, or redirect individual tool invocations. Policies are authored in TypeScript and bundled inside a card.

## Prerequisites

- An existing card source (`drwn card new @your-handle/backend` or similar)
- `drwn` 0.3.0 or later (hook support requires lockfile v3)

## 1. Scaffold a policy

```bash
drwn card source add-hook @your-handle/backend audit-tool-calls
```

This creates `hooks/audit-tool-calls/policy.ts` in the card source with an **observer stub** — the safest default:

```ts
import { defineToolPolicy } from "darwinian/hook-policy";

export default defineToolPolicy({
  policyKind: "observer",
  async afterToolCall(event) {
    // Observe tool results here; errors are swallowed.
  },
});
```

Observer policies swallow errors and never block tool calls, so a fresh policy cannot accidentally break anything.

## 2. Write a `beforeToolCall` handler

`beforeToolCall` runs before the tool executes. Return a decision to influence the outcome:

```ts
import { defineToolPolicy } from "darwinian/hook-policy";

export default defineToolPolicy({
  policyKind: "observer",
  matcher: "Bash",  // only intercept Bash tool calls

  async beforeToolCall(event) {
    const cmd = String(event.input ?? "");
    if (cmd.includes("rm -rf")) {
      // Log the attempt — observer mode won't block it
      console.warn("Observed rm -rf attempt:", cmd);
    }
    return { action: "allow" };
  },
});
```

### Switching to enforcement

Once the policy is stable and you want hard blocks, switch `policyKind`:

```ts
export default defineToolPolicy({
  policyKind: "enforcement",
  matcher: "Bash",

  async beforeToolCall(event) {
    const cmd = String(event.input ?? "");
    if (cmd.includes("rm -rf /")) {
      return {
        action: "deny",
        reason: "Destructive root-level deletion is not permitted.",
        syntheticOutput: "Command blocked by policy.",
      };
    }
    return { action: "allow" };
  },
});
```

With `policyKind: "enforcement"`, errors in the handler are treated as denials and the tool call is blocked.

## 3. Available decisions

| Decision | Effect |
|---|---|
| `{ action: "allow" }` | Proceed. May include `additionalContext` (string appended to input) or `updatedInput` (replaces tool input). |
| `{ action: "deny", reason }` | Block the call. `reason` is shown to the agent. `syntheticOutput` can substitute a fake result. |
| `{ action: "ask", reason }` | Pause for user approval. Not all runtimes support this. |
| `{ action: "log-only" }` | Proceed; note that the call was observed. |
| `undefined` | No decision — other policies in the stack decide. |

## 4. Add a `matcher`

Without `matcher`, the policy applies to every tool call. Use a string to match by tool name:

```ts
// Only match file-writing tools
matcher: "Write",

// Observer on all tools
// (omit matcher)
```

## 5. Set a timeout

```ts
export default defineToolPolicy({
  policyKind: "enforcement",
  timeoutMs: 3000,  // 3 seconds per callback; treated as deny on timeout
  async beforeToolCall(event) { ... },
});
```

## 6. Validate and publish

```bash
drwn card source doctor @your-handle/backend
drwn card push @your-handle/backend
```

## 7. Consumer trust

After consumers install the card, they must grant hook trust before policies activate:

```bash
drwn card trust @your-handle/backend --hooks
drwn write
```

Without this, `drwn write` materializes skills and MCP servers but leaves hook policies inactive. `drwn doctor` surfaces `hookIssues` for cards with pending hook trust.

## See also

- [Hook Policies](../concepts/hook-policies) — `ToolPolicy` interface reference
- [Minds](../concepts/minds) — hook policies in the context of mind cards
- [`drwn card source add-hook`](../reference/cli/card) — scaffolding and removing policies
- [`drwn card trust`](../reference/cli/card#hook-consent) — consumer trust flow
