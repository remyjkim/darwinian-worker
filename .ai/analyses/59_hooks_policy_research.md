Yes — **but not by writing “Mastra hooks” once and expecting Claude Code or Codex to run them natively.** Mastra, Claude Code, and Codex each have their own hook runtime and event schema. The right design is:

> Put the real policy/business logic in a shared package or local HTTP service, then write thin adapters for Mastra, Claude Code, and Codex.

Mastra hooks run inside a Mastra `Agent` and apply before/after Mastra agent tool calls. Mastra’s documented hook surface is `beforeToolCall` and `afterToolCall`, where `beforeToolCall` can block a tool by returning `{ proceed: false, output }`, and `afterToolCall` observes success or error after the tool runs. ([Mastra][1])

Claude Code has its own hook system. Its hooks can be command, HTTP, prompt, agent, or MCP-tool based, and they receive JSON event payloads such as `PreToolUse` and `PostToolUse`. `PreToolUse` can allow, deny, ask, defer, modify input, and add context; `PostToolUse` can add context or replace what Claude sees after the tool has already run. ([Claude Code][2])

Codex also now has a hook system, but its current runtime is different again: Codex hooks are configured in `.codex/hooks.json` or `config.toml`, are enabled by default, require trust review for non-managed command hooks, and currently run command handlers. Its `PreToolUse` can intercept supported Bash, `apply_patch`, and MCP tool calls, but OpenAI’s docs explicitly call it a guardrail rather than a complete enforcement boundary because not every possible path is intercepted. ([OpenAI Developers][3])

## The practical answer

You should not make the reusable unit “a Mastra hook.” Make the reusable unit a **policy engine**.

For example:

```ts
// packages/agent-policy/src/index.ts

export type AgentRuntime = 'mastra' | 'claude-code' | 'codex'

export type ToolPolicyEvent = {
  runtime: AgentRuntime
  phase: 'pre-tool' | 'post-tool'
  toolName: string
  input?: unknown
  output?: unknown
  error?: unknown
  cwd?: string
  sessionId?: string
  userId?: string
  tenantId?: string
  metadata?: Record<string, unknown>
}

export type ToolPolicyDecision =
  | { action: 'allow'; additionalContext?: string; updatedInput?: unknown }
  | { action: 'deny'; reason: string; syntheticOutput?: unknown }
  | { action: 'ask'; reason: string }
  | { action: 'log-only' }

export async function evaluateToolPolicy(
  event: ToolPolicyEvent,
): Promise<ToolPolicyDecision> {
  if (
    event.phase === 'pre-tool' &&
    event.toolName.match(/Bash|execute_command|shell/i)
  ) {
    const command =
      typeof event.input === 'object' &&
      event.input !== null &&
      'command' in event.input
        ? String((event.input as { command?: unknown }).command ?? '')
        : ''

    if (/\brm\s+-rf\s+(\/|\*)/.test(command)) {
      return {
        action: 'deny',
        reason: 'Blocked destructive shell command.',
        syntheticOutput: {
          blocked: true,
          reason: 'Blocked destructive shell command.',
        },
      }
    }
  }

  return { action: 'allow' }
}
```

Then each runtime gets a small adapter.

## Mastra adapter

```ts
import type { ToolHooks } from '@mastra/core/tools'
import { evaluateToolPolicy } from '@acme/agent-policy'

export const mastraPolicyHooks: ToolHooks = {
  async beforeToolCall({ toolName, input, context, metadata }) {
    const decision = await evaluateToolPolicy({
      runtime: 'mastra',
      phase: 'pre-tool',
      toolName,
      input,
      userId: context?.requestContext?.get?.('user-id'),
      tenantId: context?.requestContext?.get?.('tenant-id'),
      metadata,
    })

    if (decision.action === 'deny') {
      return {
        proceed: false,
        output: decision.syntheticOutput ?? {
          blocked: true,
          reason: decision.reason,
        },
      }
    }

    // Mastra's documented hook contract does not rewrite input here.
    // Use tool wrappers/schemas/processors if you need input mutation.
  },

  async afterToolCall({ toolName, input, output, error, context, metadata }) {
    await evaluateToolPolicy({
      runtime: 'mastra',
      phase: 'post-tool',
      toolName,
      input,
      output,
      error,
      userId: context?.requestContext?.get?.('user-id'),
      tenantId: context?.requestContext?.get?.('tenant-id'),
      metadata,
    })
  },
}
```

Use it in Mastra like:

```ts
export const agent = new Agent({
  name: 'support-agent',
  instructions: 'Help safely.',
  model: 'openai/gpt-5.5',
  tools: {
    // tools here
  },
  hooks: mastraPolicyHooks,
})
```

## Claude Code adapter

Claude Code can call a local script or an HTTP endpoint directly from hooks. HTTP is especially clean if you want one shared policy service. Claude Code sends hook JSON to the HTTP endpoint as the POST body and expects the same JSON decision shape as command hooks. To block through an HTTP hook, the endpoint must return a 2xx response containing a blocking decision; non-2xx or timeout is treated as a non-blocking error and execution continues. ([Claude Code][2])

Example `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Edit|Write|mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": [".agent-hooks/claude-pre-tool-use.mjs"],
            "timeout": 30
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash|Edit|Write|mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": [".agent-hooks/claude-post-tool-use.mjs"],
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Example `claude-pre-tool-use.mjs`:

```js
#!/usr/bin/env node
import { evaluateToolPolicy } from '@acme/agent-policy'

const input = JSON.parse(await new Promise((resolve) => {
  let data = ''
  process.stdin.on('data', chunk => (data += chunk))
  process.stdin.on('end', () => resolve(data))
}))

const decision = await evaluateToolPolicy({
  runtime: 'claude-code',
  phase: 'pre-tool',
  toolName: input.tool_name,
  input: input.tool_input,
  cwd: input.cwd,
  sessionId: input.session_id,
  metadata: input,
})

if (decision.action === 'deny') {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: decision.reason,
    },
  }))
  process.exit(0)
}

if (decision.action === 'allow' && decision.updatedInput) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: decision.updatedInput,
      additionalContext: decision.additionalContext,
    },
  }))
  process.exit(0)
}

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    additionalContext: decision.additionalContext,
  },
}))
```

Claude Code is more powerful than Mastra for hook-time mutation: `PreToolUse` can modify tool input with `updatedInput`, and `PostToolUse` can replace the tool output that Claude sees, although the side effect has already happened by then. ([Claude Code][2])

## Codex adapter

Codex is similar in spirit but different in details. Use `.codex/hooks.json` or inline TOML in `.codex/config.toml`. Codex loads all matching hooks from active config layers; matching hooks can run concurrently, and non-managed hooks need to be reviewed/trusted through `/hooks`. ([OpenAI Developers][3])

Example `.codex/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$|^apply_patch$|^mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node .agent-hooks/codex-pre-tool-use.mjs",
            "timeout": 30,
            "statusMessage": "Checking tool call policy"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "^Bash$|^apply_patch$|^mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node .agent-hooks/codex-post-tool-use.mjs",
            "timeout": 30,
            "statusMessage": "Recording tool result"
          }
        ]
      }
    ]
  }
}
```

Example `codex-pre-tool-use.mjs`:

```js
#!/usr/bin/env node
import { evaluateToolPolicy } from '@acme/agent-policy'

const input = JSON.parse(await new Promise((resolve) => {
  let data = ''
  process.stdin.on('data', chunk => (data += chunk))
  process.stdin.on('end', () => resolve(data))
}))

const decision = await evaluateToolPolicy({
  runtime: 'codex',
  phase: 'pre-tool',
  toolName: input.tool_name,
  input: input.tool_input,
  cwd: input.cwd,
  sessionId: input.session_id,
  metadata: input,
})

if (decision.action === 'deny') {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: decision.reason,
    },
  }))
  process.exit(0)
}

if (decision.action === 'allow' && decision.updatedInput) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: decision.updatedInput,
    },
  }))
  process.exit(0)
}

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    additionalContext: decision.additionalContext,
  },
}))
```

Codex supports denying supported `PreToolUse` calls, adding context, and rewriting supported calls with `permissionDecision: "allow"` plus `updatedInput`; for Bash and `apply_patch`, `updatedInput` must include a string `command`, while MCP tools use replacement argument objects. ([OpenAI Developers][3])

## How MCP fits in

There are two different things you may want to share:

| Goal                                                     | Best approach                                             |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Share guardrail/audit logic                              | Shared NPM package or HTTP policy service                 |
| Share actual tools/agents with Claude Code and Codex     | Expose them through MCP                                   |
| Make Mastra agents callable by external coding agents    | Mastra `MCPServer`                                        |
| Have Claude/Codex file edits and shell commands governed | Claude/Codex native hooks, plus sandbox/approval controls |

Mastra can expose tools, agents, workflows, prompts, and resources as an MCP server for MCP-compatible clients. That is the cleanest way to make Mastra capabilities available to Claude Code, Codex, Cursor, etc. ([Mastra][4])

But that does **not** mean Mastra hooks will automatically see everything Claude Code or Codex does. They will see only the work that flows through Mastra. If Claude Code runs `Bash`, edits a file, or calls its own MCP tool directly, Mastra hooks do not fire. For those actions, use Claude Code hooks or Codex hooks.

## Recommended architecture

```text
packages/
  agent-policy/
    src/
      evaluateToolPolicy.ts
      redact.ts
      audit.ts
      types.ts

apps/
  mastra/
    src/hooks/mastraPolicyHooks.ts

repo-hooks/
  claude/
    claude-pre-tool-use.mjs
    claude-post-tool-use.mjs

  codex/
    codex-pre-tool-use.mjs
    codex-post-tool-use.mjs

  policy-server/
    server.ts   # optional HTTP version for Claude Code HTTP hooks
```

Use this split:

1. **Shared policy engine**: deterministic rules, audit redaction, allow/deny decisions.
2. **Mastra adapter**: converts policy decisions into `{ proceed: false, output }` or post-call logging.
3. **Claude Code adapter**: converts decisions into `hookSpecificOutput.permissionDecision`, `updatedInput`, `updatedToolOutput`, etc.
4. **Codex adapter**: converts decisions into Codex’s supported command-hook JSON shape.
5. **MCP server**: exposes Mastra tools/agents to external agent clients when you want shared capabilities, not just shared policy.

## Important caveats

Mastra’s `beforeToolCall` can block with synthetic output, but it is not the same as Claude/Codex `PreToolUse`. Claude Code and Codex can rewrite some tool inputs; Mastra’s documented hook contract is proceed/block, not input rewrite. ([Mastra][1])

Codex `PreToolUse` is useful but not a total security boundary. OpenAI’s docs say it currently intercepts supported Bash, `apply_patch`, and MCP tool calls, and does not intercept all shell or non-shell/non-MCP paths. Keep Codex sandboxing and approvals enabled for real enforcement. ([OpenAI Developers][3])

Claude Code HTTP hooks are convenient, but failed HTTP hooks are non-blocking. If the policy service is down and you need fail-closed behavior, use command hooks that call the policy engine locally, or make the command wrapper treat connection failure as a deny. ([Claude Code][2])

## Bottom line

Yes, make the same hook **logic** accessible to Mastra agents, Claude Code, and Codex. Do it by extracting the logic into a shared policy module or service, then writing runtime-specific hook adapters.

Do **not** assume Mastra hooks themselves are portable. They are Mastra-specific. The portable layer is your policy engine, audit logic, and optionally MCP-exposed tools/agents.

[1]: https://mastra.ai/docs/agents/using-tools?utm_source=chatgpt.com "Tools | Agents | Mastra Docs"
[2]: https://code.claude.com/docs/en/hooks "Hooks reference - Claude Code Docs"
[3]: https://developers.openai.com/codex/hooks "Hooks – Codex | OpenAI Developers"
[4]: https://mastra.ai/docs/mcp/overview?utm_source=chatgpt.com "MCP overview | MCP | Mastra Docs"


# Mastra hooks investigation report

**Audience:** engineering handoff
**Scope:** Mastra server-side hooks, tool-call hooks, hook-like lifecycle APIs, UI hooks, and related extension points for building production Mastra AI systems.
**Research basis:** current Mastra docs plus source-level behavior where the docs leave implementation details ambiguous. Mastra is moving quickly, so confirm the installed `@mastra/core` version before coding; the package source/docs I checked show current APIs around `Agent`, tools, processors, approvals, server routes, and UI integration. ([jsDelivr][1])

---

## 1. Executive summary

Mastra’s most direct “hooks” API is **Agent tool hooks**: `beforeToolCall` and `afterToolCall`. These let us run custom logic before and after every tool call made by an agent, including assigned tools, memory tools, toolsets, client tools, agent/workflow tools, workspace tools, and other generated tool sources. Primary use cases are audit logging, telemetry, validation, guardrails, cost controls, and deterministic blocking of unsafe tool invocations. ([Mastra][2])

The important implementation detail is that `beforeToolCall` can short-circuit a tool by returning `{ proceed: false, output }`. When it does, the original tool is not executed and the model receives `output` as the tool result. `afterToolCall` runs only after a real tool execution succeeds or fails; source inspection shows it is **not called** when `beforeToolCall` blocks the tool. ([Mastra][3])

Mastra also has several hook-like surfaces that should be considered part of the design:

| Need                                                          | Best Mastra surface                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| Log, audit, block, or validate every tool call                | Agent `hooks.beforeToolCall` / `hooks.afterToolCall`        |
| Modify or validate messages before/after model calls          | Agent processors                                            |
| Change model, tools, tool choice, or system messages per step | `processInputStep` or `prepareStep`                         |
| Inspect model request/response around provider call           | `processLLMRequest` / `processLLMResponse`                  |
| Filter or abort output stream                                 | output processors, especially `processOutputStream`         |
| Require human approval before a tool runs                     | `requireApproval`, tool suspension/resumption               |
| Emit custom events from inside tools                          | tool `context.writer` streaming                             |
| React frontend hooks                                          | AI SDK UI hooks via `@mastra/ai-sdk`                        |
| HTTP request lifecycle                                        | server middleware, route hooks, `onError`, validation hooks |
| Workspace/sandbox lifecycle                                   | workspace `onMount`, sandbox lifecycle hooks                |
| Remote agent trust checks                                     | A2A `verifyAgentCard`                                       |
| Dynamic tool discovery policy                                 | `ToolSearchProcessor` authorization/filter behavior         |

The engineering recommendation is to implement a **small internal hook framework** that composes multiple `ToolHooks` into one object, wraps side-effect hooks safely, centralizes audit logging, and prevents runtime hooks from accidentally replacing global policy hooks.

---

## 2. Mastra context: what we are building against

Mastra is a TypeScript/JavaScript framework for building AI agents and AI applications. It includes agents, workflows, memory, model routing, human-in-the-loop flows, observability, and deployment-oriented server primitives. ([GitHub][4])

For this investigation, “hooks” covers two categories:

1. **First-class APIs actually named hooks**, especially Agent `hooks`.
2. **Lifecycle extension points that behave like hooks**, such as processors, callbacks, route hooks, tool streaming callbacks, approval/suspension flows, and React UI hooks.

---

## 3. First-class Agent tool hooks

### 3.1 API shape

An agent can receive a `hooks` object:

```ts
import { Agent } from '@mastra/core/agent'

export const supportAgent = new Agent({
  name: 'support-agent',
  instructions: 'Help users with their questions.',
  model: 'openai/gpt-5.5',
  hooks: {
    beforeToolCall: async ({ toolName, input, context, metadata }) => {
      // pre-call logic
    },
    afterToolCall: async ({ toolName, input, output, error, context, metadata }) => {
      // post-call logic
    },
  },
})
```

The docs describe `beforeToolCall` as receiving the tool name, input, and execution context. It can return `{ proceed: false, output }` to skip the actual tool call. `afterToolCall` runs after execution and receives either `output` or `error`; when the tool fails, the error is re-thrown after the hook runs. ([Mastra][2])

The source types define the core context shape as:

```ts
type ToolHookContext = {
  toolName: string
  input: unknown
  context: MastraToolInvocationOptions
  metadata?: Record<string, unknown>
}

type ToolBeforeHookResult = {
  proceed: false
  output: unknown
}

type ToolAfterHookContext = ToolHookContext & {
  output?: unknown
  error?: Error
}
```

Mastra’s implementation adds metadata such as `agentId` and `agentName` to the hook context. ([GitHub][5])

### 3.2 Scope: which tools are covered

Agent tool hooks apply broadly. The docs say they cover assigned tools, memory tools, toolsets, client tools, agent and workflow tools, and workspace tools. Source inspection shows the agent converts many tool sources into a unified tool map before wrapping them with hooks, including assigned tools, memory tools, toolsets, client-side tools, agent tools, workflow tools, workspace tools, skill tools, channel tools, browser tools, and dynamically loaded input-processor tools. ([Mastra][2])

This broad coverage is important: a single global hook can enforce policy across internal tools, MCP/toolset tools, delegated agents exposed as tools, workflows exposed as tools, and runtime-loaded tools.

### 3.3 Lifecycle behavior

Source-level flow for each wrapped tool:

```text
tool selected by model
  -> build hook context
  -> await beforeToolCall
       -> if { proceed: false, output }, return output immediately
  -> execute original tool
       -> on success: await afterToolCall({ output })
       -> on error: await afterToolCall({ error }); rethrow original error
  -> return tool output
```

Two subtle but important behaviors come from the source:

* `afterToolCall` is not called when `beforeToolCall` short-circuits a tool.
* Hook errors are not swallowed by the wrapper. A thrown error in `beforeToolCall` fails the tool call. A thrown error in `afterToolCall` can also fail the call; on the error path, a failing `afterToolCall` can mask the original tool error unless we wrap hook side effects defensively. ([GitHub][6])

### 3.4 Agent-level versus per-execution hooks

Hooks can be configured at the agent level or supplied per call to `.generate()` / `.stream()`. Per-execution hooks override matching agent-level hooks. Mastra merges hook objects by key: passing only `beforeToolCall` for one execution keeps the agent-level `afterToolCall`, but passing another `beforeToolCall` replaces the agent-level `beforeToolCall` for that run. ([Mastra][2])

Implication: do not rely on Mastra to compose multiple `beforeToolCall` handlers. If we need audit + policy + tenant-specific runtime behavior, we should compose them ourselves.

### 3.5 Tool names and naming policy

The `toolName` seen by hooks is the name exposed to the model. Mastra docs note that the stream response/tool name is determined by the object key, not necessarily the tool’s internal `id`; subagents and workflows can be converted into tools with prefixes such as `agent-` or `workflow-`. ([Mastra][2])

Source also sanitizes tool names to meet provider constraints and throws on name collisions. Hook policies should therefore be based on controlled tool registry keys, not fragile assumptions about internal IDs. ([GitHub][6])

---

## 4. What tool hooks can and cannot do

### Good fits

Tool hooks are a strong fit for:

* audit logs: who called which tool, with what input shape, from which agent;
* safety policies: block shell/database/email/payment tools unless inputs pass deterministic checks;
* tenant or user-level authorization;
* cost controls and rate limits;
* telemetry and latency measurement;
* sensitive-tool reports for SOC/compliance review;
* dry-run or mocked tool outputs during test/staging;
* blocking dangerous calls with a model-visible explanation.

Mastra explicitly lists logging, auditing, input validation, and blocking specific calls as common uses. ([Mastra][2])

### Poor fits

Tool hooks are not the right place for every lifecycle need:

* **Mutating tool input:** `beforeToolCall` is documented as allowing skip/block with replacement output, not input rewriting. If input normalization is required, wrap the tool implementation or define stricter schemas/transforms.
* **Changing tool output before the model sees it:** `afterToolCall` returns `void`; use the tool implementation or tool `toModelOutput` for model-facing output shaping.
* **UI/transcript redaction:** use tool `transform` options where the goal is display/transcript shaping rather than execution policy. Mastra docs distinguish transform logic from model output shaping. ([Mastra][2])
* **Human approval:** use `requireApproval`, `suspend()`, and resumption flows instead of writing a blocking hook that waits for a person. ([Mastra][7])
* **Message-level prompt/output guardrails:** use processors, not tool hooks. ([Mastra][8])

---

## 5. Related hook-like APIs in Mastra

### 5.1 Agent processors

Processors are Mastra’s main lifecycle pipeline for messages and model calls. They can transform, validate, or control messages as they pass through an agent. Mastra documents input processors before the LLM call, output processors after response generation and before the user, and error processors for failure handling. Use cases include normalization, guardrails, prompt-injection detection, token throttling, PII redaction, and custom business logic. ([Mastra][8])

Processor execution order matters. With memory enabled, memory processors run before custom input processors and after custom output processors; output guardrails that abort can skip memory persistence. ([Mastra][9])

Important processor methods:

| Processor method      | Use                                                               |
| --------------------- | ----------------------------------------------------------------- |
| `processInput`        | Once at the start, before the agent loop                          |
| `processInputStep`    | Before every LLM step, including tool-call continuations          |
| `processLLMRequest`   | After messages become provider prompt, right before provider call |
| `processLLMResponse`  | After step completion and stream chunk collection                 |
| `prepareStep`         | Shorthand for `processInputStep`                                  |
| `processOutputResult` | Final non-streaming result processing                             |
| `processOutputStream` | Streaming chunk processing/filtering                              |
| `processOutputStep`   | Step-level output processing                                      |
| `processAPIError`     | Provider/API error handling, including retry modification         |

Mastra documents `processInputStep` and `prepareStep` as ways to dynamically modify per-step behavior such as model selection, tool choice, tools, and system messages. `processLLMRequest` is later in the lifecycle and can alter the transient provider prompt without persisting those changes to the MessageList, memory, UI, or future calls. ([Mastra][9])

Processors can also abort with a tripwire. In streaming mode, Mastra emits a tripwire chunk; in generate mode, the result exposes tripwire information and a finish reason. ([Mastra][9])

### 5.2 Generate/stream callbacks

`Agent.generate()` and streaming options expose callbacks such as `onStepFinish`, `onIterationComplete`, delegation callbacks, `onChunk`, `onError`, and `onAbort`. `onStepFinish` is useful for progress and debugging because it receives step-level text, tool calls, tool results, finish reason, and usage. `onIterationComplete` can influence loop continuation by returning control instructions. ([Mastra][10])

Use these for orchestration and observability, not hard security. For hard allow/deny policy, prefer tool hooks or processors because they sit directly in the execution path.

### 5.3 Tool approval and suspension

Mastra supports human-in-the-loop tool approval through `requireApproval: true`. In streaming, approval requests appear as `tool-call-approval` chunks. Tools can also suspend execution and later resume manually or automatically. Automatic resumption requires memory, the same thread/resource identifiers, and a defined `resumeSchema`. ([Mastra][7])

Use approval/suspension when a tool needs human authorization or missing user input. Use `beforeToolCall` when the decision is deterministic and immediate.

### 5.4 Tool streaming hooks/callbacks

Tools can write custom stream events through `context.writer`. Mastra docs emphasize that `writer.write()` must be awaited to avoid locking the stream. `writer.custom()` can emit custom top-level stream chunks, and transient chunks can be streamed live without being persisted. ([Mastra][11])

The tool source types also expose lower-level AI-SDK-style callbacks such as `onInputStart`, `onInputDelta`, `onInputAvailable`, and `onOutput`. Treat these as per-tool streaming callbacks, not as a replacement for Agent-level policy hooks. ([GitHub][5])

### 5.5 Frontend/UI hooks

Mastra integrates with AI SDK UI through `@mastra/ai-sdk`. That package converts Mastra output into AI SDK-compatible formats and integrates with React hooks such as `useChat`, `useCompletion`, and `useObject`. These are frontend state/streaming hooks, not server-side execution hooks. ([Mastra][12])

### 5.6 Server and route hooks

Mastra server custom routes are registered with `registerApiRoute`; handlers receive a Hono context and can access the Mastra instance. Routes can define middleware arrays. ([Mastra][13])

Mastra also exposes server-level error/validation extension points. The Koa adapter documents a `server.onError` hook that runs before the error propagates through middleware, and route validation can use `onValidationError`, with route-level validation hooks overriding server-level behavior. ([Mastra][14])

Use server hooks for HTTP concerns: auth, request shaping, request context initialization, API errors, validation responses, and route-specific middleware.

### 5.7 Request context

Mastra `requestContext` is the right channel for per-request values such as user ID, tenant ID, plan/tier, trace ID, and authorization state. Docs show `requestContext.get()` being available in supported agent configuration options, workflow steps, and tool execution contexts. Reserved keys such as resource/thread ownership are security-sensitive and can be set by auth/middleware. ([Mastra][15])

Tool hooks receive the tool execution context, so hook code can read request-scoped values when present.

### 5.8 Workspace and sandbox lifecycle hooks

Workspace lifecycle includes `onMount`, a pre-mount hook called for each filesystem before sandbox mount. It can return `false` to skip mounting or indicate that the hook handled the mount. ([Mastra][16])

Modal sandbox lifecycle hooks include hooks such as `onStart`, `onStop`, and `onDestroy` around sandbox lifecycle events. ([Mastra][17])

Use these for filesystem/sandbox setup, security filtering, and lifecycle cleanup; do not mix them with agent tool-call policy.

### 5.9 A2A remote-agent verification hook

For Agent-to-Agent delegation, Mastra documents a `verifyAgentCard` hook that validates a remote agent card before delegation. This is the correct place to enforce trusted providers, expected endpoints, signed cards, certificate-bound identities, or other remote-agent trust rules. ([Mastra][18])

### 5.10 Dynamic tool discovery policy

`ToolSearchProcessor` is an input processor that gives the agent `search_tools` and `load_tool` meta-tools so it can discover and load tools on demand instead of receiving the whole tool library upfront. Its docs describe searchable tools, `topK`, `minScore`, and `autoLoad`. Mastra also documents authorization/filter behavior around tool search, and any hook that runs per candidate should be kept cheap and cacheable. ([Mastra][19])

For large tool libraries, combine `ToolSearchProcessor` with Agent tool hooks: the processor limits what gets loaded; hooks enforce final execution policy.

---

## 6. Recommended implementation design

### 6.1 Build an internal hook composition layer

Mastra does not compose same-key hooks for us. Create a local helper that composes multiple hook modules in order:

```ts
import type {
  ToolAfterHookContext,
  ToolBeforeHookResult,
  ToolHookContext,
  ToolHooks,
} from '@mastra/core/tools'

type MaybePromise<T> = T | Promise<T>

export function composeToolHooks(...hooks: Array<ToolHooks | undefined>): ToolHooks {
  const activeHooks = hooks.filter(Boolean) as ToolHooks[]

  return {
    async beforeToolCall(ctx: ToolHookContext): Promise<void | ToolBeforeHookResult> {
      for (const hook of activeHooks) {
        const result = await hook.beforeToolCall?.(ctx)

        // First blocking hook wins.
        if (result?.proceed === false) {
          return result
        }
      }
    },

    async afterToolCall(ctx: ToolAfterHookContext): Promise<void> {
      for (const hook of activeHooks) {
        await hook.afterToolCall?.(ctx)
      }
    },
  }
}
```

Recommended ordering:

1. correlation/trace setup;
2. authorization;
3. input validation;
4. dangerous-tool blocking;
5. audit logging;
6. metrics/latency;
7. test/staging overrides.

### 6.2 Wrap non-critical side effects safely

Because hook errors can fail the tool call, do not let logging/metrics outages break agent execution unless that is intentional. Wrap best-effort side effects:

```ts
function safeHook<T extends (...args: any[]) => any>(
  name: string,
  fn: T,
  logger: { error: (data: unknown, message?: string) => void },
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      logger.error({ hook: name, error }, 'Mastra hook failed')
      return undefined
    }
  }) as T
}
```

Use strict/failing hooks only for policy decisions where failure should block execution, such as missing tenant authorization for a destructive tool.

### 6.3 Central audit hook

```ts
import type { ToolHooks } from '@mastra/core/tools'

type AuditSink = {
  write: (event: Record<string, unknown>) => Promise<void>
}

export function auditToolCalls(auditSink: AuditSink): ToolHooks {
  const startedAt = new WeakMap<object, number>()

  return {
    async beforeToolCall({ toolName, input, context, metadata }) {
      if (context && typeof context === 'object') {
        startedAt.set(context as object, performance.now())
      }

      await auditSink.write({
        event: 'mastra.tool.before',
        toolName,
        agentId: metadata?.agentId,
        agentName: metadata?.agentName,
        userId: context?.requestContext?.get?.('user-id'),
        tenantId: context?.requestContext?.get?.('tenant-id'),
        inputPreview: redactForAudit(input),
        timestamp: new Date().toISOString(),
      })
    },

    async afterToolCall({ toolName, input, output, error, context, metadata }) {
      const durationMs =
        context && typeof context === 'object' && startedAt.has(context as object)
          ? performance.now() - startedAt.get(context as object)!
          : undefined

      await auditSink.write({
        event: 'mastra.tool.after',
        toolName,
        agentId: metadata?.agentId,
        agentName: metadata?.agentName,
        userId: context?.requestContext?.get?.('user-id'),
        tenantId: context?.requestContext?.get?.('tenant-id'),
        inputPreview: redactForAudit(input),
        outputPreview: error ? undefined : redactForAudit(output),
        errorName: error?.name,
        errorMessage: error?.message,
        durationMs,
        timestamp: new Date().toISOString(),
      })
    },
  }
}

function redactForAudit(value: unknown): unknown {
  // Replace with project-specific PII/secret redaction.
  // Keep audit records useful without storing raw credentials, tokens, emails, or full prompts.
  return value
}
```

### 6.4 Policy hook for dangerous tools

```ts
import type { ToolHooks } from '@mastra/core/tools'

const DESTRUCTIVE_TOOL_NAMES = new Set([
  'shell',
  'terminal',
  'execute_command',
  'delete_record',
  'send_email',
  'charge_card',
])

export function blockUnsafeToolCalls(): ToolHooks {
  return {
    async beforeToolCall({ toolName, input, context }) {
      if (!DESTRUCTIVE_TOOL_NAMES.has(toolName)) {
        return
      }

      const userRole = context?.requestContext?.get?.('role')
      const tenantId = context?.requestContext?.get?.('tenant-id')

      if (!tenantId) {
        return {
          proceed: false,
          output: {
            blocked: true,
            reason: 'Missing tenant context for sensitive tool call.',
          },
        }
      }

      if (userRole !== 'admin') {
        return {
          proceed: false,
          output: {
            blocked: true,
            reason: `Tool "${toolName}" requires admin authorization.`,
          },
        }
      }

      if (toolName === 'execute_command') {
        const command =
          typeof input === 'object' && input !== null && 'command' in input
            ? String((input as { command?: unknown }).command ?? '')
            : ''

        if (/\brm\s+-rf\s+(\/|\*)/.test(command)) {
          return {
            proceed: false,
            output: {
              blocked: true,
              reason: 'Command rejected by safety policy.',
            },
          }
        }
      }
    },
  }
}
```

### 6.5 Agent wiring

```ts
import { Agent } from '@mastra/core/agent'
import { composeToolHooks } from '../hooks/compose-tool-hooks'
import { auditToolCalls } from '../hooks/audit-tool-calls'
import { blockUnsafeToolCalls } from '../hooks/block-unsafe-tool-calls'

const baseHooks = composeToolHooks(
  blockUnsafeToolCalls(),
  auditToolCalls(auditSink),
)

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support Agent',
  instructions: 'Help support users safely.',
  model: 'openai/gpt-5.5',
  tools: {
    // project tools here
  },
  hooks: baseHooks,
})
```

### 6.6 Per-run hooks without losing global hooks

Because per-execution hooks override same-key agent hooks, do this:

```ts
await supportAgent.stream(userMessage, {
  hooks: composeToolHooks(
    baseHooks,
    {
      beforeToolCall: async ({ toolName }) => {
        console.log('run-specific hook', toolName)
      },
    },
  ),
})
```

Avoid this unless replacement is intentional:

```ts
await supportAgent.stream(userMessage, {
  hooks: {
    beforeToolCall: async () => {
      // This replaces the agent-level beforeToolCall for this run.
    },
  },
})
```

---

## 7. Architecture recommendation

### 7.1 Proposed file layout

```text
src/
  mastra/
    agents/
      support-agent.ts
    hooks/
      compose-tool-hooks.ts
      audit-tool-calls.ts
      block-unsafe-tool-calls.ts
      safe-hook.ts
      redact-for-audit.ts
      index.ts
    processors/
      pii-redaction-processor.ts
      prompt-injection-processor.ts
    server/
      request-context-middleware.ts
```

### 7.2 Policy layers

Use layered controls:

1. **Server middleware:** authenticate user, set `requestContext` keys.
2. **Tool schemas:** validate basic input shape.
3. **ToolSearchProcessor:** limit discoverable tools for large libraries.
4. **Agent tool hooks:** enforce final allow/deny and audit every tool call.
5. **Tool implementation:** enforce resource-level checks again near the side effect.
6. **Processors:** guard prompts, memory, and output.
7. **Approval/suspension:** require human approval for irreversible actions.

The critical security principle is defense in depth: never rely only on the model choosing safe tool calls.

---

## 8. Testing plan

### Unit tests

Test the hook modules directly:

* `composeToolHooks` calls `beforeToolCall` hooks in order.
* First `{ proceed: false, output }` stops later `beforeToolCall` hooks.
* `afterToolCall` hooks run in order.
* `blockUnsafeToolCalls` blocks missing tenant context.
* `blockUnsafeToolCalls` blocks non-admin sensitive tools.
* `auditToolCalls` redacts expected fields.
* safe wrappers log errors and do not throw for non-critical hooks.

### Integration tests with a fake tool

Create a test agent with one fake tool and assert:

* allowed call executes the tool;
* blocked call returns synthetic output and the fake tool is not invoked;
* `afterToolCall` runs on success;
* `afterToolCall` sees `error` when the tool throws;
* `afterToolCall` does not run for a `beforeToolCall` short-circuit;
* per-run `beforeToolCall` overrides agent-level `beforeToolCall`;
* per-run `beforeToolCall` plus agent-level `afterToolCall` still keeps `afterToolCall`;
* concurrent tool calls do not corrupt audit records.

### Manual smoke tests

Run these scenarios in development:

1. harmless tool call;
2. destructive tool call by non-admin user;
3. destructive tool call by admin user;
4. tool that throws;
5. tool requiring approval;
6. dynamically loaded tool via `ToolSearchProcessor`;
7. agent-to-agent/workflow tool invocation;
8. streaming tool that emits custom writer chunks.

---

## 9. Production checklist

Before handing this to production:

* Pin and record the exact Mastra package versions.
* Keep hook policies based on stable tool registry keys.
* Add deny-by-default handling for unknown sensitive tool categories.
* Ensure audit logging redacts secrets, credentials, PII, raw prompts, and large payloads.
* Make logging/metrics hooks best-effort unless failure should block execution.
* Make security hooks fail closed.
* Treat hook outputs returned to the model as user-visible/model-visible content.
* Add latency, success, failure, and blocked-call metrics.
* Include tenant ID, user ID, agent ID, agent name, tool name, run/thread identifiers where available.
* Avoid storing full tool outputs unless compliance explicitly approves it.
* Re-check behavior after Mastra upgrades, especially around hook merge semantics and tool wrapping.

---

## 10. Known limitations and risks

1. **Only two first-class Agent tool hooks are documented:** `beforeToolCall` and `afterToolCall`. There is no documented Agent-level `onToolStart`, `onToolComplete`, `onToolError`, or generic `onToolEvent` API, although a historical GitHub issue requested similar capability. ([GitHub][20])

2. **No documented input rewrite from `beforeToolCall`:** the supported control is proceed or block with replacement output. Use wrapper tools or processors for transformation.

3. **No documented output rewrite from `afterToolCall`:** it is post-call side-effect logic. Use tool implementation, `toModelOutput`, or transforms depending on whether the target is the model, UI, or transcript.

4. **`afterToolCall` is not called for blocked calls:** log blocked-call events inside `beforeToolCall` before returning `{ proceed: false, output }`. ([GitHub][6])

5. **Runtime hooks can accidentally replace global policy hooks:** always compose explicitly when adding per-run hooks. ([Mastra][3])

6. **Hook side-effect failures can break tool execution:** safe-wrap non-critical telemetry/audit sinks; let security hooks fail closed intentionally. ([GitHub][6])

7. **Mid-run external injection is not the same as hooks:** a historical issue requested webhook/push-style injection into an already-running agent loop. Processors and hooks operate at defined execution points; verify any newer signal/event APIs separately before designing long-running external event injection. ([GitHub][21])

---

## 11. Handoff recommendation

Build this in two phases.

**Phase 1: baseline hook framework**

Deliver:

* `composeToolHooks`
* `safeHook`
* `auditToolCalls`
* `blockUnsafeToolCalls`
* request-context middleware setting user/tenant/role/trace IDs
* integration tests for allowed, blocked, failing, and per-run override behavior

This gives immediate safety and observability coverage across all agent tool sources.

**Phase 2: broader lifecycle controls**

Add:

* prompt-injection and PII processors;
* `ToolSearchProcessor` policy for large tool catalogs;
* approval/suspension for irreversible actions;
* route/server validation hooks;
* frontend `useChat` integration if building UI;
* A2A `verifyAgentCard` for remote delegation;
* compliance dashboard from audit events.

The main engineering principle: use **Agent tool hooks** for tool execution policy, **processors** for message/model lifecycle policy, **approval/suspension** for human control, and **server hooks/middleware** for HTTP/auth context.

[1]: https://www.jsdelivr.com/package/npm/%40mastra/core "@mastra/core CDN by jsDelivr - A CDN for npm and GitHub"
[2]: https://mastra.ai/docs/agents/using-tools "Tools | Agents | Mastra Docs"
[3]: https://mastra.ai/reference/agents/agent "Reference: Agent class | Agents | Mastra Docs"
[4]: https://github.com/mastra-ai/mastra "GitHub - mastra-ai/mastra: From the team behind Gatsby, Mastra is a framework for building AI-powered applications and agents with a modern TypeScript stack. · GitHub"
[5]: https://github.com/mastra-ai/mastra/raw/refs/heads/main/packages/core/src/tools/types.ts "raw.githubusercontent.com"
[6]: https://github.com/mastra-ai/mastra/raw/refs/heads/main/packages/core/src/agent/agent.ts "raw.githubusercontent.com"
[7]: https://mastra.ai/docs/agents/agent-approval "Agent approval | Agents | Mastra Docs"
[8]: https://mastra.ai/docs/agents/processors/llms.txt "mastra.ai"
[9]: https://mastra.ai/docs/agents/response-caching "Processors | Agents | Mastra Docs"
[10]: https://mastra.ai/reference/agents/generate "Reference: Agent.generate() | Agents | Mastra Docs"
[11]: https://mastra.ai/docs/streaming/tool-streaming "Tool streaming | Streaming | Mastra Docs"
[12]: https://mastra.ai/guides/build-your-ui/ai-sdk-ui "Using AI SDK UI | Frameworks | Mastra Docs"
[13]: https://mastra.ai/docs/server/custom-api-routes "Custom API routes | Server | Mastra Docs"
[14]: https://mastra.ai/reference/server/koa-adapter "Reference: Koa adapter | Server | Mastra Docs"
[15]: https://mastra.ai/docs/server/request-context?utm_source=chatgpt.com "Request context | Server | Mastra Docs"
[16]: https://mastra.ai/reference/workspace/workspace-class "Reference: Workspace class | Workspace | Mastra Docs"
[17]: https://mastra.ai/reference/workspace/modal-sandbox?utm_source=chatgpt.com "Reference: ModalSandbox | Workspace | Mastra Docs"
[18]: https://mastra.ai/docs/agents/a2a "A2A | Agents | Mastra Docs"
[19]: https://mastra.ai/reference/processors/tool-search-processor?utm_source=chatgpt.com "Reference: ToolSearchProcessor | Processors"
[20]: https://github.com/mastra-ai/mastra/issues/7751 "[FEATURE] Tool hooks · Issue #7751 · mastra-ai/mastra · GitHub"
[21]: https://github.com/mastra-ai/mastra/issues/10078 "Hooks/Interceptors for Injecting Data into Agentic Loop During Execution · Issue #10078 · mastra-ai/mastra · GitHub"
