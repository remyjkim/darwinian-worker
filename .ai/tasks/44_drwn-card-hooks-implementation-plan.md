# Drwn Card Hooks Implementation Plan

> **For implementers:** Execute this plan task-by-task. Keep each task green before moving on; do not batch later-phase work into earlier commits.

**Goal:** Add a `hooks` artifact class to Darwinian Harness Cards so card authors can ship TypeScript policy modules that run at the tool-call boundary of Claude Code, Codex, and Mastra runtimes.

**Architecture:** Per analysis 60 (`.ai/analyses/60_drwn-card-hooks-target-architecture.md`). Card source ships named policy modules under `hooks/<name>/policy.ts`; drwn write generates per-runtime composer shims (`.mjs` for Claude/Codex, `.ts` for Mastra) bundled by Bun. Per-card hook consent is recorded in a lockfile v3 schema and gates code materialization. CCH integration is zero-coupling — drwn writes deterministic project-relative paths that CCH consumers pick up via existing `mountPreExecAssets` callbacks or Dockerfile COPY.

**Tech Stack:** Bun runtime, Clipanion 4 CLI, `bun:test` test runner, TypeScript, project-local subpath export `darwinian-harness/hook-policy`.

**Conventions:**
- Every new file starts with the two-line `// ABOUTME:` comment.
- Commits use `[type:scope] short imperative subject`, lowercase, no AI attribution.
- Path safety via exported `assertSafePathPart` (`cli/core/store-paths.ts`; Task 1.0 exports the existing private helper before hook commands use it).
- Store mutations gated by `assertStoreWritable` (`cli/core/store-paths.ts:17`).
- Atomic writes via `writeAtomically` (`cli/core/fs.ts:31`).

**Test runner**: `bun test` (from the repo root) or `bun test test/<file>.test.ts` for a single file.

---

## Phase 1 — Foundations

Backend-only. No CLI surface yet. All unit-testable. Land first because every later phase depends on this contract.

### Task 1.0 — Export the shared safe path-part validator

**Files:**
- Modify: `cli/core/store-paths.ts`
- Test: extend `test/core-store-paths.test.ts`

**Behavior**: export the existing `assertSafePathPart(value, label)` helper and strengthen it to reject forward slashes (`"/"`) as well as the unsafe values it rejects today. Existing callers pass individual path parts, so no valid call site should rely on slash acceptance. Hook policy names use this helper instead of duplicating path-safety rules.

Test asserts that safe names pass and unsafe values (`""`, `".."`, `".hidden"`, `"a/b"`, `"a\\b"`, `"/abs"`) fail with the existing error shape.

Commit: `[refactor:store-paths] export safe path-part validator`.

### Task 1.1 — Define the policy contract types

**Files:**
- Create: `cli/core/hook-policy/types.ts`
- Test: `test/core-hook-policy-types.test.ts`

**Step 1: Write the failing test**

```ts
// test/core-hook-policy-types.test.ts
// ABOUTME: Verifies the public hook-policy type contract remains importable.
// ABOUTME: Protects card-authored policy modules from accidental shape drift.

import { describe, expect, it } from "bun:test";
import type { ToolPolicy, ToolPolicyDecision, ToolPolicyEvent } from "../cli/core/hook-policy/types";

describe("hook-policy types", () => {
  it("ToolPolicyEvent carries runtime, phase, toolName", () => {
    const event: ToolPolicyEvent = { runtime: "claude-code", phase: "pre-tool", toolName: "Bash" };
    expect(event.runtime).toBe("claude-code");
  });

  it("ToolPolicyDecision union covers allow, deny, ask, log-only", () => {
    const decisions: ToolPolicyDecision[] = [
      { action: "allow" },
      { action: "allow", updatedInput: { command: "ls" }, additionalContext: "noted" },
      { action: "deny", reason: "blocked" },
      { action: "ask", reason: "confirm?" },
      { action: "log-only" },
    ];
    expect(decisions).toHaveLength(5);
  });

  it("ToolPolicy carries policyKind and optional handlers", () => {
    const policy: ToolPolicy = { policyKind: "enforcement" };
    expect(policy.policyKind).toBe("enforcement");
  });
});
```

**Step 2: Run test**

```bash
bun test test/core-hook-policy-types.test.ts
```
Expected: FAIL with "Cannot find module".

**Step 3: Implement**

```ts
// cli/core/hook-policy/types.ts
// ABOUTME: Runtime-agnostic policy contract types for Harness Card hooks.
// ABOUTME: Imported by author policy modules and the composition runtime.

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
  beforeToolCall?(event: ToolPolicyEvent):
    Promise<ToolPolicyDecision | void> | ToolPolicyDecision | void;
  afterToolCall?(event: ToolPolicyEvent): Promise<void> | void;
}
```

**Step 4: Verify pass**

```bash
bun test test/core-hook-policy-types.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add cli/core/hook-policy/types.ts test/core-hook-policy-types.test.ts
git commit -m "[feat:hook-policy] add ToolPolicy contract types"
```

### Task 1.2 — `defineToolPolicy` identity helper

**Files:**
- Create: `cli/core/hook-policy/define-tool-policy.ts`
- Test: `test/core-hook-policy-define.test.ts`

**Step 1: Write the failing test**

```ts
// ABOUTME: Verifies defineToolPolicy preserves policy specs unchanged.
// ABOUTME: Protects author-facing inference while keeping the helper trivial.

import { describe, expect, it } from "bun:test";
import { defineToolPolicy } from "../cli/core/hook-policy/define-tool-policy";

describe("defineToolPolicy", () => {
  it("returns its input untouched for type inference", () => {
    const policy = defineToolPolicy({
      policyKind: "observer",
      async afterToolCall() {},
    });
    expect(policy.policyKind).toBe("observer");
    expect(typeof policy.afterToolCall).toBe("function");
  });
});
```

**Step 2: Run** → FAIL.

**Step 3: Implement**

```ts
// cli/core/hook-policy/define-tool-policy.ts
// ABOUTME: Identity helper providing type inference for author policy modules.
// ABOUTME: Kept trivial so future runtime instrumentation can hook in centrally.

import type { ToolPolicy } from "./types";

export function defineToolPolicy(spec: ToolPolicy): ToolPolicy {
  return spec;
}
```

**Step 4: Verify** → PASS.

**Step 5: Commit**

```bash
git add cli/core/hook-policy/define-tool-policy.ts test/core-hook-policy-define.test.ts
git commit -m "[feat:hook-policy] add defineToolPolicy identity helper"
```

### Task 1.3 — Composition runtime: `composeToolHooks`, `safeHook`, `runWithTimeout`

**Files:**
- Create: `cli/core/hook-policy/safe-hook.ts`
- Create: `cli/core/hook-policy/run-with-timeout.ts`
- Create: `cli/core/hook-policy/compose-tool-hooks.ts`
- Test: `test/core-hook-policy-compose.test.ts`

**Behavior contract (from analysis 60 §2):**
- Iteration order = policy array order (lockfile-ordered upstream).
- `beforeToolCall`: each policy sees cumulative event with previous `updatedInput` merged. Collect all decisions, resolve in priority order **`deny > ask > allow+mutations > log-only`**. First `deny` wins outright and stops further iteration.
- `afterToolCall`: every policy runs in order. Observer throws are caught and logged via a sink; enforcement throws propagate.
- `runWithTimeout`: default 25s, configurable via `policy.timeoutMs`. Timeouts treated as thrown errors with the same observer/enforcement split.

**Step 1: Write the failing test** (representative cases — write all)

```ts
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
  it("first deny short-circuits and stops further iteration", async () => {
    let secondCalled = false;
    const policies: ToolPolicy[] = [
      { policyKind: "enforcement", beforeToolCall: async () => ({ action: "deny", reason: "no" }) },
      { policyKind: "enforcement", beforeToolCall: async () => { secondCalled = true; } },
    ];
    const result = await composeToolHooks(policies, { runtime: "claude-code" }).beforeToolCall!(baseEvent);
    expect(result?.action).toBe("deny");
    expect(secondCalled).toBe(false);
  });

  it("allow+updatedInput chains across policies", async () => {
    const seen: unknown[] = [];
    const policies: ToolPolicy[] = [
      { policyKind: "observer", beforeToolCall: async () => ({ action: "allow", updatedInput: { command: "echo hi" } }) },
      { policyKind: "observer", beforeToolCall: async (e) => { seen.push(e.input); } },
    ];
    await composeToolHooks(policies, { runtime: "claude-code" }).beforeToolCall!(baseEvent);
    expect(seen[0]).toEqual({ command: "echo hi" });
  });

  it("ask beats allow but loses to deny", async () => {
    const policies: ToolPolicy[] = [
      { policyKind: "observer", beforeToolCall: async () => ({ action: "ask", reason: "?" }) },
      { policyKind: "observer", beforeToolCall: async () => ({ action: "allow" }) },
    ];
    const result = await composeToolHooks(policies, { runtime: "claude-code" }).beforeToolCall!(baseEvent);
    expect(result?.action).toBe("ask");
  });

  it("observer afterToolCall throws are swallowed", async () => {
    const policies: ToolPolicy[] = [
      { policyKind: "observer", afterToolCall: async () => { throw new Error("boom"); } },
    ];
    await expect(
      composeToolHooks(policies, { runtime: "claude-code" }).afterToolCall!({ ...baseEvent, phase: "post-tool" }),
    ).resolves.toBeUndefined();
  });

  it("enforcement afterToolCall throws propagate", async () => {
    const policies: ToolPolicy[] = [
      { policyKind: "enforcement", afterToolCall: async () => { throw new Error("boom"); } },
    ];
    await expect(
      composeToolHooks(policies, { runtime: "claude-code" }).afterToolCall!({ ...baseEvent, phase: "post-tool" }),
    ).rejects.toThrow("boom");
  });

  it("timeout on enforcement beforeToolCall denies", async () => {
    const policies: ToolPolicy[] = [{
      policyKind: "enforcement",
      timeoutMs: 10,
      beforeToolCall: () => new Promise((r) => setTimeout(() => r({ action: "allow" }), 100)),
    }];
    const result = await composeToolHooks(policies, { runtime: "claude-code" }).beforeToolCall!(baseEvent);
    expect(result?.action).toBe("deny");
  });
});
```

**Step 2: Run** → FAIL.

**Step 3: Implement** (sketch — see types.ts for shapes)

```ts
// cli/core/hook-policy/run-with-timeout.ts
// ABOUTME: Promise timeout helper for hook composition.
// ABOUTME: Rejects with a typed error so the composer can differentiate.

export class HookTimeoutError extends Error { constructor(public ms: number) { super(`timeout after ${ms}ms`); } }

export async function runWithTimeout<T>(promise: Promise<T> | T, ms: number): Promise<T> {
  if (!(promise instanceof Promise)) return promise;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HookTimeoutError(ms)), ms);
  });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(timer!); }
}
```

```ts
// cli/core/hook-policy/safe-hook.ts
// ABOUTME: Wraps a side-effect hook so non-critical failures are logged, not thrown.

export interface HookLogger { error(data: unknown, message?: string): void; }

export function safeHook<Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => Promise<void> | void,
  logger: HookLogger,
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try { await fn(...args); }
    catch (error) { logger.error({ hook: name, error }, "hook failed"); }
  };
}
```

```ts
// cli/core/hook-policy/compose-tool-hooks.ts
// ABOUTME: Composes multiple ToolPolicy modules into a single hook surface.
// ABOUTME: Implements deny > ask > allow+mutations > log-only resolution.

import type { Runtime, ToolPolicy, ToolPolicyDecision, ToolPolicyEvent } from "./types";
import { HookTimeoutError, runWithTimeout } from "./run-with-timeout";

export interface ComposeOptions {
  runtime: Runtime;
  logger?: { error(data: unknown, message?: string): void; warn(data: unknown, message?: string): void; };
  defaultTimeoutMs?: number;
}

const DEFAULT_TIMEOUT = 25_000;

export function composeToolHooks(policies: ToolPolicy[], options: ComposeOptions) {
  const logger = options.logger ?? { error: () => {}, warn: () => {} };
  const defaultTimeout = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT;

  return {
    async beforeToolCall(event: ToolPolicyEvent): Promise<ToolPolicyDecision | undefined> {
      let cumulativeEvent = event;
      const decisions: ToolPolicyDecision[] = [];
      for (const policy of policies) {
        if (!policy.beforeToolCall) continue;
        if (policy.matcher && !new RegExp(policy.matcher).test(event.toolName)) continue;
        try {
          const decision = await runWithTimeout(policy.beforeToolCall(cumulativeEvent), policy.timeoutMs ?? defaultTimeout);
          if (!decision) continue;
          decisions.push(decision);
          if (decision.action === "deny") return decision;
          if (decision.action === "allow" && decision.updatedInput !== undefined) {
            cumulativeEvent = { ...cumulativeEvent, input: decision.updatedInput };
          }
        } catch (error) {
          if (policy.policyKind === "enforcement") {
            const reason = error instanceof HookTimeoutError ? `policy timeout (${error.ms}ms)` : `policy error: ${String(error)}`;
            return { action: "deny", reason };
          }
          logger.error({ error, policyKind: policy.policyKind }, "observer policy failed");
        }
      }
      const ask = decisions.find((d) => d.action === "ask");
      if (ask) return ask;
      const allowMutations = decisions.filter((d): d is Extract<ToolPolicyDecision, { action: "allow" }> => d.action === "allow");
      if (allowMutations.length > 0) {
        const additionalContext = allowMutations.map((d) => d.additionalContext).filter(Boolean).join("\n");
        const last = allowMutations[allowMutations.length - 1]!;
        return {
          action: "allow",
          ...(last.updatedInput !== undefined ? { updatedInput: last.updatedInput } : {}),
          ...(additionalContext ? { additionalContext } : {}),
        };
      }
      return decisions.length > 0 ? { action: "log-only" } : undefined;
    },

    async afterToolCall(event: ToolPolicyEvent): Promise<void> {
      for (const policy of policies) {
        if (!policy.afterToolCall) continue;
        if (policy.matcher && !new RegExp(policy.matcher).test(event.toolName)) continue;
        try {
          await runWithTimeout(policy.afterToolCall(event), policy.timeoutMs ?? defaultTimeout);
        } catch (error) {
          if (policy.policyKind === "enforcement") throw error;
          logger.error({ error }, "observer afterToolCall failed");
        }
      }
    },
  };
}
```

**Step 4: Verify** → PASS.

**Step 5: Commit**

```bash
git add cli/core/hook-policy/{safe-hook,run-with-timeout,compose-tool-hooks}.ts test/core-hook-policy-compose.test.ts
git commit -m "[feat:hook-policy] add composition runtime with timeout and safe-hook"
```

### Task 1.4 — Barrel export + package.json subpath

**Files:**
- Create: `cli/core/hook-policy/index.ts`
- Modify: `package.json` (add `"./hook-policy"` to `exports`)
- Test: `test/core-hook-policy-export.test.ts`

```ts
// cli/core/hook-policy/index.ts
// ABOUTME: Barrel export for the hook-policy module — author + composer surface.
// ABOUTME: Subpath-exported as `darwinian-harness/hook-policy` for card authors.

export { defineToolPolicy } from "./define-tool-policy";
export { composeToolHooks } from "./compose-tool-hooks";
export { safeHook } from "./safe-hook";
export { runWithTimeout, HookTimeoutError } from "./run-with-timeout";
export type { Runtime, ToolPolicy, ToolPolicyDecision, ToolPolicyEvent } from "./types";
```

```jsonc
// package.json — this package currently has no exports map. Add the subpath
// deliberately and include package.json so package metadata remains importable.
"exports": {
  "./hook-policy": {
    "types": "./cli/core/hook-policy/index.ts",
    "import": "./cli/core/hook-policy/index.ts",
    "default": "./cli/core/hook-policy/index.ts"
  },
  "./package.json": "./package.json"
}
```

Test asserts `import("darwinian-harness/hook-policy")` resolves and exposes the expected symbols. Also audit for any package-root imports before adding an `exports` map; do not add a root `"."` export unless there is an intentional public API to expose. Commit: `[feat:hook-policy] expose subpath export for card authors`.

### Task 1.5 — Extend card manifest schema

**Files:**
- Modify: `cli/core/card-manifest.ts`
- Test: `test/core-card-manifest-hooks.test.ts`

**Behavior**: add `hooks?: { include?: string[] }`. Validator rejects `hooks.exclude` and `hooks.shared` mirroring how `skills.exclude`/`skills.shared` are rejected today (`card-manifest.ts:91`).

Test asserts: (a) valid manifest with `hooks.include: ["x"]` passes; (b) `hooks.exclude` or `hooks.shared` produce explicit errors; (c) `hooks.include` must be an array; (d) round-trip JSON.parse → assertValidCardManifest works.

Commit: `[feat:card-manifest] accept hooks.include declaration`.

### Task 1.6 — Extend card-diff classification

**Files:**
- Modify: `cli/core/card-diff.ts`
- Test: `test/core-card-diff-hooks.test.ts`

`diffCards` adds `diffStringSet("hooks.include", before, after)` after the skills line. Adding a policy → minor; removing → major. Test asserts both directions plus a round-trip with the existing `assertSemverBumpMatchesClassification` against a forced-bump scenario.

Commit: `[feat:card-diff] classify hooks.include changes`.

### Task 1.7 — Publish-time hook directory validation

**Files:**
- Modify: `cli/core/card-store.ts` (add `validatePublishedHookDirs` near `validatePublishedSkillDirs` at line 359; call from `publishCard` source-side and after `ensureExtracted`)
- Test: `test/core-card-publish-hooks.test.ts`

**Behavior**: walk `manifest.hooks?.include`; each entry must have `hooks/<name>/policy.ts` in source AND in the extracted version dir. Mirrors `validatePublishedSkillDirs` exactly. Failure message names the missing path.

Test: (a) publish succeeds when policy.ts exists; (b) publish fails with explicit error when `hooks/<name>/` dir is missing; (c) publish fails when dir exists but `policy.ts` is missing; (d) policy.ts in source but missing from extracted tree (simulate by deleting after `ensureExtracted`) fails.

Commit: `[feat:card-publish] validate hooks directories pre- and post-extract`.

### Task 1.8 — Lockfile v3 schema

**Files:**
- Modify: `cli/core/card-lock.ts` (bump `lockfileVersion: 2 | 3`; extend `CardLockEntry` with `hooks: string[]` and optional `hookConsent`; extend `validateCardLockEntry` to accept both)
- Test: `test/core-card-lock-v3.test.ts`

**Migration rules** (from analysis 60 §1):
- v2 input → `hooks: []`, `hookConsent: undefined`.
- v3 input → validate `hooks: string[]`; `hookConsent` optional but if present must have `consentedAt: ISO`, `consentedRange: string`.
- Writes always emit v3.
- `store.minDrwnVersion` (in the existing `store` field) bumps to the next drwn release version that introduces hooks; do not hardcode the current stale `0.1.0` write-record value.

Test: (a) v2 fixture loads with `hooks: []`; (b) v3 round-trip preserves consent; (c) invalid `hookConsent` shape rejected; (d) write of v2 cards re-emits as v3.

Commit: `[refactor:card-lock] bump lockfile to v3 with hooks and consent`.

### Task 1.9 — Propagate hooks through `resolveProjectCards`

**Files:**
- Modify: `cli/core/card-project.ts` (in the `resolveProjectCards` mapping at line 42, populate `hooks: card.manifest.hooks?.include ?? []`)
- Test: extend `test/commands-card-consumer.test.ts` or add `test/core-card-project-hooks.test.ts`

Test asserts that adding a card with `hooks.include: ["a", "b"]` produces a lockfile entry with `hooks: ["a", "b"]`.

Commit: `[feat:card-project] propagate manifest hooks into lockfile`.

### Task 1.10 — Project-side `hooks.exclude` merge

**Files:**
- Modify: `cli/core/types.ts` (`ProjectConfig` gains `hooks?: { exclude?: string[] }`)
- Modify: `cli/core/card-project.ts` (`mergeCardManifestsIntoProjectConfig` preserves project-side `hooks.exclude` into `next.hooks`)
- Test: `test/core-card-project-hooks-exclude.test.ts`

Format of `hooks.exclude` entries: `"@scope/card:policy-name"` or bare `"policy-name"`. Phase 1 only preserves and validates the project-side config shape; actual policy filtering happens in Task 3.8 where card identity and policy paths are available. Test asserts preservation and validation of scoped and bare entries.

Commit: `[feat:project-config] support project-side hooks.exclude`.

**End of Phase 1.** Run full test suite (`bun test`) → all green. Tag a development checkpoint commit: `[chore:phase] phase 1 foundations complete`.

---

## Phase 2 — Source-side authoring

Authors can scaffold and publish hooked cards; nothing materializes them yet.

### Task 2.1 — `drwn card source add-hook`

**Files:**
- Create: `cli/commands/card/source/add-hook.ts`
- Modify: `cli/core/card-source.ts` (add hook mutation helpers beside the existing skill/MCP mutation helpers; do not create a parallel core file unless the module becomes unwieldy)
- Test: `test/commands-card-source-hook-mutate.test.ts`

**Behavior**: `drwn card source add-hook <card> <policy-name>` does:
1. Validate `<policy-name>` via exported `assertSafePathPart`.
2. Reject if `hooks/<policy-name>/` already exists or `manifest.hooks.include` already contains the name.
3. Scaffold `hooks/<policy-name>/policy.ts` with a 12-line observer template (see template below).
4. Append to `manifest.hooks.include`; write manifest atomically.
5. Emit `{ action: "add-hook", path }` change record.

**Template** to scaffold (literal file contents):

```ts
// ABOUTME: Tool-call policy for <policy-name>.
// ABOUTME: Replace this stub with your enforcement or observer logic.

import { defineToolPolicy } from "darwinian-harness/hook-policy";

export default defineToolPolicy({
  policyKind: "observer",
  async afterToolCall(event) {
    // event.runtime, event.phase, event.toolName, event.input, event.output, ...
  },
});
```

Default `policyKind: "observer"` is deliberate — a fresh stub cannot fail-closed.

Test: (a) scaffolds the directory and template; (b) updates manifest; (c) rejects duplicate; (d) rejects unsafe name (`..`, `/`, `.hidden`, `a\\b`, `/abs`); (e) atomicity (manifest unchanged if scaffold write fails). Use `writeAtomically` for `policy.ts` and `card.json`; create directories only after validation passes.

Commit: `[feat:card-source] add `drwn card source add-hook` command`.

### Task 2.2 — `drwn card source remove-hook`

**Files:**
- Create: `cli/commands/card/source/remove-hook.ts`
- Modify: `cli/core/card-source.ts`
- Test: extend `test/commands-card-source-hook-mutate.test.ts`

**Behavior**: removes `hooks/<policy-name>/` and the manifest entry. Rejects if the manifest entry is not declared. Support a `--keep-files` flag matching `remove-skill` so authors can undeclare without deleting local policy work.

Commit: `[feat:card-source] add `drwn card source remove-hook` command`.

### Task 2.3 — Extend `card-source.ts` doctor with hook diagnostics

**Files:**
- Modify: `cli/core/card-source.ts` (new issue codes: `missing_hook_dir`, `missing_policy_ts`, `orphaned_hook_dir`, `invalid_policy_module`)
- Modify: `cli/commands/card/source/doctor.ts` (surface new codes)
- Test: `test/commands-card-source-doctor-hooks.test.ts`

**Behavior**: walk `manifest.hooks.include`; assert dir + policy.ts exist; flag undeclared `hooks/<x>/` directories as `orphaned_hook_dir`. `invalid_policy_module` is best-effort — try `Bun.build` with `entrypoints` set to the policy.ts, catch on syntax error.

When running the best-effort build, rewrite or alias `darwinian-harness/hook-policy` to the local repo helper path so sources do not need a published package install just to pass source doctor.

Commit: `[feat:card-source] surface hook directory diagnostics`.

### Task 2.4 — Register new commands

**Files:**
- Modify: `cli/index.ts` (register `CardSourceAddHookCommand`, `CardSourceRemoveHookCommand` near lines 125–129)
- Modify: `test/cli-help-shape.test.ts` (extend the expected help shape with the new entries)

Commit: `[chore:cli] register card source hook commands`.

**End of Phase 2.** Manual smoke: `drwn card source add-hook @your-handle/test myhook` in a temp source; `drwn card publish @your-handle/test` succeeds; bare repo at `~/.agents/drwn/cards/...` has the policy under the new tag's tree.

---

## Phase 3 — Adapter generators (the meat)

This is the most complex phase. It produces composer shims and updates settings files. Land the pieces incrementally.

### Task 3.0 — Define hook runtime selection without extending MCP targets

**Files:**
- Modify: `cli/core/types.ts`
- Create: `cli/core/hook-generator/runtime-selection.ts`
- Test: `test/core-hook-runtime-selection.test.ts`

**Behavior**:
- Keep `TargetName = "claude" | "codex" | "cursor"` unchanged unless a separate full-target migration is planned.
- Add hook-specific project config under `ProjectConfig.hooks`:

```ts
hooks?: {
  exclude?: string[];
  runtimes?: {
    "claude-code"?: { enabled: boolean };
    codex?: { enabled: boolean };
    mastra?: { enabled: boolean };
  };
}
```

- Default hook runtime selection:
  - `claude-code` follows `state.effectiveConfig.targets.claude.enabled`.
  - `codex` follows `state.effectiveConfig.targets.codex.enabled`.
  - `mastra` is disabled by default and only enabled by `projectConfig.hooks.runtimes.mastra.enabled === true`.
  - `cursor` has no hook runtime in v1.
- Explicit `hooks.runtimes.<runtime>.enabled` overrides the defaults for hook generation only; it does not alter MCP target behavior.

Commit: `[feat:hook-generator] add hook runtime selection helper`.

### Task 3.1 — `resolveGeneratedHooksDir` store-path helper

**Files:**
- Modify: `cli/core/store-paths.ts` (export `resolveGeneratedHooksDir(generatedDir: string, runtime: Runtime)`)
- Test: extend an existing `core-store-paths` test or add `test/core-store-paths-hooks.test.ts`

Use the generated root already computed by `buildEffectiveState` instead of re-deriving project vs machine scope:

```ts
export function resolveGeneratedHooksDir(generatedDir: string, runtime: Runtime): string;
```

Resolves `<generatedDir>/hooks/<slug>/`, where `claude-code` maps to the artifact slug `claude`, and `codex`/`mastra` map to themselves. Validate the runtime via the `Runtime` union. Tests cover both project generated roots (`<project>/.agents/drwn/generated`) and machine generated roots (`<agentsDir>/drwn/generated`).

Commit: `[feat:store-paths] add generated hooks directory resolver`.

### Task 3.2 — Decision encoder for each runtime

**Files:**
- Create: `cli/core/hook-generator/encode-decision.ts`
- Test: `test/core-hook-encode-decision.test.ts`

**Behavior** (from analysis 60 §2 degradation table, corrected for Codex's current documented hook behavior):

```ts
// pseudo-API
export function encodeForClaude(decision: ToolPolicyDecision | undefined, event: ToolPolicyEvent): string;
export function encodeForCodex(decision: ToolPolicyDecision | undefined, event: ToolPolicyEvent, logger): string;
export function encodeForMastra(decision: ToolPolicyDecision | undefined, logger): { proceed: boolean; output?: unknown } | undefined;
```

Each returns the runtime's native shape from §2 of the design doc with these updates:
- Codex `ask` must **not** emit `permissionDecision: "ask"`; current OpenAI docs say that shape is parsed but unsupported and marks the hook run failed. Degrade `ask` to a deny/block with an explicit reason until Codex supports native ask.
- Mastra `ask` also degrades to `{ proceed: false, output: { reason } }` rather than silently allowing.
- Codex `updatedInput` is emitted only when `event.toolName` and the replacement shape are valid for current Codex support. For `Bash` and `apply_patch`, require `updatedInput.command` to be a string; for MCP tools, allow an object argument replacement. Log and omit unsafe/unsupported rewrites.
- `allow` without `updatedInput` or `additionalContext`, `log-only`, and `undefined` encode as no stdout for command-hook runtimes.

Test: round-trip each decision through each encoder and assert exact output shape per the table.

Commit: `[feat:hook-generator] encode policy decisions per runtime`.

### Task 3.3 — Event decoder for each runtime

**Files:**
- Create: `cli/core/hook-generator/decode-event.ts`
- Test: `test/core-hook-decode-event.test.ts`

Translate stdin JSON (Claude / Codex format) → `ToolPolicyEvent`. For Mastra, the event comes from in-process arguments to `beforeToolCall({ toolName, input, context, metadata })` — provide a `decodeMastraEvent(args)` helper.

Reference shapes:
- Claude Code: `{ tool_name, tool_input, cwd, session_id, hook_event_name }` (see analysis 59 example).
- Codex: current command-hook docs use common fields plus event-specific fields. `PreToolUse` includes `tool_name`, `tool_input`, and `tool_use_id`; `PostToolUse` includes `tool_response`. Preserve `turn_id`, `permission_mode`, `model`, `transcript_path`, and unknown fields under `metadata`.
- Mastra: positional args (analysis 59 §3.1).

Commit: `[feat:hook-generator] decode runtime hook payloads to portable event`.

### Task 3.4 — Composer bundler (Bun.build wrapper)

**Files:**
- Create: `cli/core/hook-generator/bundle-composer.ts`
- Test: `test/core-hook-bundle-composer.test.ts` (integration-style — writes to a temp dir and asserts the bundled output)

**Behavior**:
1. Take an array of `{ cardName, policyName, policyTsPath }` plus a runtime.
2. Generate an in-memory entrypoint TS that imports each policy and exports an executable that reads stdin, decodes, composes, encodes, writes stdout.
3. Run `Bun.build({ entrypoints: [...], target: "node", format: "esm", external: [] })` with a resolver plugin or equivalent temporary package mapping that rewrites `darwinian-harness/hook-policy` to this repo's absolute `cli/core/hook-policy/index.ts`. Do not rely on extracted card sources having `node_modules/darwinian-harness`.
4. Write the bundle to the resolved generated hooks dir.

Entry script template (Claude flavor):

```ts
import { composeToolHooks } from "darwinian-harness/hook-policy";
import policy0 from "<absolute path>/hooks/<policy0>/policy.ts";
// ...
import { decodeClaudeEvent } from "<...>/decode-event";
import { encodeForClaude } from "<...>/encode-decision";

const policies = [policy0, /* ... */];
const composed = composeToolHooks(policies, { runtime: "claude-code" });

(async () => {
  const stdin = await new Promise<string>((resolve) => {
    let data = ""; process.stdin.on("data", (c) => data += c); process.stdin.on("end", () => resolve(data));
  });
  const payload = JSON.parse(stdin);
  const phase = payload.hook_event_name === "PreToolUse" ? "pre-tool" : "post-tool";
  const event = decodeClaudeEvent(payload, phase);
  const decision = phase === "pre-tool"
    ? await composed.beforeToolCall(event)
    : (await composed.afterToolCall(event), undefined);
  process.stdout.write(encodeForClaude(decision, event));
})().catch((err) => { process.stderr.write(String(err)); process.exit(1); });
```

Test: generates a bundle, runs it as a Bun subprocess with fixed stdin payloads, asserts stdout matches expected decision encoding.

Commit: `[feat:hook-generator] bundle composer shims with Bun.build`.

### Task 3.5 — Mastra TS emitter

**Files:**
- Create: `cli/core/hook-generator/emit-mastra-composer.ts`
- Test: `test/core-hook-emit-mastra.test.ts`

**Behavior**: emit a `composer.ts` per analysis 60 §3 (TS re-export module). Uses absolute imports into `~/.agents/drwn/extracted/<sha>/...`. No bundling — consumer's TS toolchain handles it.

Commit: `[feat:hook-generator] emit Mastra composer.ts re-export module`.

### Task 3.6 — Extend `mergeClaudeSettingsText` for hooks

**Files:**
- Modify: `cli/core/mcp.ts:75` (`mergeClaudeSettingsText`)
- Test: `test/core-mcp-merge-hooks.test.ts`

**Behavior**: update `mergeClaudeSettingsText` to accept an optional hooks config:

```ts
mergeClaudeSettingsText(currentText, servers, { force, hooks })
```

Managed keys grow from `["mcpServers"]` to `["mcpServers", "hooks"]` whenever hooks are desired or a previous `_drwn.managedKeys` block already managed hooks. Build the `hooks` value from `{ PreToolUse: [{ matcher, hooks: [{ type: "command", command, args, timeout }] }], PostToolUse: [...] }` per Claude Code's schema (analysis 59). If no hooks are desired but hooks were previously managed, remove or empty the managed `hooks` field deterministically so stale composer entries are cleaned up. Drift detection via existing `detectManagedFieldDrift` already iterates the fields array. Update `buildDrwnMetaBlock` callers to include hooks values.

Test: (a) round-trip preserves existing `mcpServers`; (b) hooks key appears; (c) `_drwn` block records both fields' hashes; (d) hand-edit of `hooks` → drift error on next write unless `--force`.

Commit: `[feat:claude-settings] manage hooks alongside mcpServers`.

### Task 3.7 — Add `managed-content` write-record kind for Codex hooks.json

**Files:**
- Modify: `cli/core/write-record.ts` (extend `ManagedPath` union with `{ kind: "managed-content"; path: string; contentHash: string }`)
- Modify: `cli/core/sync.ts` (cleanup and verification logic for `managed-content` paths)
- Test: `test/core-write-record-managed-content.test.ts`

**Behavior**:
- Add a `verifyManagedPaths(scopeRoot, previous, desired, { force })` step before new writes. `diffWriteRecord` already returns `toVerify`; `syncRepository` currently ignores it, so this task must wire verification in.
- When a retained `managed-content` path exists on disk and its current hash doesn't match the recorded hash, the next sync refuses to overwrite without `--force`.
- When `--force` is set, overwrite and record the new content hash.
- Cleanup handles removed `managed-content` paths by deleting them only when the on-disk hash still matches the recorded hash; otherwise preserve and warn.
- Extract or export the shared managed-file writer so `syncHooks` does not depend on a private local function in `sync.ts`.

Mirrors managed-fields drift semantics.

Commit: `[feat:write-record] add managed-content kind for drwn-owned files`.

### Task 3.8 — `syncHooks` wired into `syncRepository`

**Files:**
- Create: `cli/core/hook-generator/sync-hooks.ts`
- Modify: `cli/core/sync.ts:syncRepository` (call `syncHooks(state)` after `syncSkillsCore`)
- Test: `test/cli-hook-write-e2e.test.ts` (the integration test from analysis 60 §6)

**Behavior**:
1. Pull policies from `state.lockedCards` (lockfile entries with non-empty `hooks` array) — Phase 4 will add the consent filter.
2. Use Task 3.0's runtime-selection helper; do not read `state.effectiveConfig.targets.mastra` because no such target exists. Collect policies for each enabled hook runtime; if zero, skip settings writes for that runtime and clean previously managed hook entries through the write-record path.
3. Update settings files: Claude via `mergeClaudeSettingsText`; Codex by writing `<scope>/.codex/hooks.json` through `writeManagedFile` with the `managed-content` kind.
4. Mastra: write `<scope>/.agents/drwn/generated/hooks/mastra/composer.ts` via the emitter. No settings file change.
5. Apply `hooks.exclude` filtering here. Scoped entries match only the named card's policy; bare entries match every policy with that name across cards.
6. Record managed paths in `result.managedPaths` so cleanup works on next sync.
7. For Codex project-local hooks, emit a warning that Codex may still require `/hooks` review/trust for the generated hook definition. Drwn lockfile consent gates materialization; it does not bypass Codex's own hook trust store.

Integration test asserts the full chain: scaffold → publish → add → write → composer file exists → composer subprocess returns expected decision for crafted stdin.

Commit: `[feat:sync] materialize hook composers per runtime`.

**End of Phase 3.** Run full suite + integration test. Manual smoke: in a temp project with one card declaring one policy, `drwn write` produces `composer.mjs` and `.claude/settings.json` / `.codex/hooks.json` entries; running the composer with `echo '{"hook_event_name":"PreToolUse",...}' | node composer.mjs` returns the expected JSON.

---

## Phase 4 — Consent

### Task 4.0 — Shared hook consent validation helper

**Files:**
- Create: `cli/core/hook-consent.ts`
- Test: `test/core-hook-consent.test.ts`

**Behavior**:
- Export `isHookConsentValid(entry: CardLockEntry): boolean`.
- A card with no hooks is valid regardless of consent.
- A card with hooks requires `hookConsent` and `semver.satisfies(entry.version, entry.hookConsent.consentedRange, { includePrerelease: true })`.
- Invalid ISO timestamps are rejected during lockfile validation in Task 1.8, so this helper only evaluates presence and version range.

Commit: `[feat:hook-consent] add shared consent validation helper`.

### Task 4.1 — `drwn card trust --hooks`

**Files:**
- Modify: `cli/commands/card/remote.ts` neighbors — actually create new file `cli/commands/card/trust.ts`
- Modify: `cli/core/card-project.ts` (new function `setHookConsent(projectRoot, cardName, range)`)
- Test: `test/commands-card-trust.test.ts`

**Behavior**: `drwn card trust @scope/name --hooks [--range R]` reads the lockfile, finds the card, writes `hookConsent: { consentedAt: new Date().toISOString(), consentedRange: R ?? "^<locked-version>" }`, atomically saves through `writeCardLock`, and preserves every other lock entry unchanged.

Test: (a) consent recorded with explicit range; (b) default range = `^<locked>`; (c) error when card not in lockfile; (d) idempotent re-trust updates timestamp.

Commit: `[feat:card-trust] add `drwn card trust --hooks` command`.

### Task 4.2 — `drwn card untrust --hooks`

**Files:**
- Create: `cli/commands/card/untrust.ts`
- Modify: `cli/core/card-project.ts` (add `clearHookConsent`)
- Test: extend `test/commands-card-trust.test.ts`

Commit: `[feat:card-trust] add `drwn card untrust --hooks` command`.

### Task 4.3 — `card add` warns when card has hooks and no consent

**Files:**
- Modify: `cli/commands/card/add.ts` (after `addProjectCardSpec`, inspect the resulting lockfile entry and emit warning if `hooks.length > 0 && !hookConsent`)
- Test: extend `test/commands-card-author.test.ts` or `test/commands-card-consumer.test.ts`

Commit: `[feat:card-add] warn when added card declares hooks without consent`.

### Task 4.4 — `card update` drops out-of-range consent

**Files:**
- Modify: `cli/core/card-project.ts:updateProjectCardLock` and `writeProjectCards`
- Test: extend `test/commands-card-outdated-fetch.test.ts`

**Behavior**:
- Before re-resolving, index existing lock entries by card name.
- After re-resolving, carry forward `hookConsent` only when the new locked version satisfies the old `consentedRange`.
- Drop out-of-range consent and return a warning that command layers can surface.
- Extend `CardProjectMutation` with `warnings: string[]` so `card update`, `card pin`, and `card add` can report consent invalidation consistently.

Commit: `[fix:card-update] drop hook consent when locked version exits range`.

### Task 4.5 — Filter sync by consent + `--strict-hooks`

**Files:**
- Modify: `cli/core/hook-generator/sync-hooks.ts` (filter cards lacking valid consent; add per-card warning to `SyncResult.warnings`)
- Modify: `cli/core/types.ts` (`SyncOptions` and `NormalizedSyncOptions` gain `strictHooks?: boolean`)
- Modify: the `drwn write` command surface to accept `--strict-hooks` and pass through
- Test: extend `test/cli-hook-write-e2e.test.ts`

**Behavior**: cards without valid consent are skipped from composer generation; warnings identify each skipped card and the exact `drwn card trust` command to fix. `--strict-hooks` flips these warnings to a hard failure (non-zero exit from `drwn write`). Codex may still require its own `/hooks` trust review after drwn materializes `.codex/hooks.json`; include that note in Codex-specific warnings and docs.

Commit: `[feat:sync] gate hook materialization on per-card consent`.

### Task 4.6 — Two new `drwn doctor` checks

**Files:**
- Modify: `cli/core/diagnostics.ts`
- Test: extend `test/commands-doctor.test.ts`

Checks: (1) any locked card with `hooks.length > 0 && !validConsent` → warning + fix command; (2) generated composer's embedded drwn-version meta != current binary → warning "composer stale; rerun drwn write".

Commit: `[feat:doctor] check hook consent and composer freshness`.

### Task 4.7 — Register new commands

**Files:** `cli/index.ts` registers `CardTrustCommand`, `CardUntrustCommand`. Update `test/cli-help-shape.test.ts`.

Commit: `[chore:cli] register card trust/untrust commands`.

**End of Phase 4.** Manual smoke: full loop on a real test card — `card add` warns; `card trust --hooks`; `drwn write` materializes; `card update` to incompatible version drops consent; `drwn write` skips; `card trust --hooks` re-consents; `drwn write --strict-hooks` succeeds.

---

## Phase 5 — Diagnostic polish

Small, parallelizable tasks.

### Task 5.1 — `card show` surfaces hooks

**Files:** `cli/commands/card/show.ts` and `test/commands-card-show-hooks.test.ts`.

Show `hooks` array; for each policy, show `policyKind` and first line of README.md if present.

Commit: `[feat:card-show] surface hook policies`.

### Task 5.2 — `card status` adds consent column

**Files:** `cli/commands/card/status.ts` and `test/commands-card-show-hooks.test.ts`.

Per-card row gains `hook-consent: granted (^0.1.0) | absent | out-of-range (consented: ^0.1.0, locked: 0.2.0)`. JSON output gains `hookConsent: object | null` per card.

Commit: `[feat:card-status] surface hook consent state`.

### Task 5.3 — `card validate` checks hook directories

**Files:** `cli/commands/card/validate.ts`.

Walk `hooks.include`; assert each `hooks/<name>/policy.ts` exists.

Commit: `[feat:card-validate] check hook directories`.

### Task 5.4 — `card outdated` notes consent invalidation

**Files:** `cli/commands/card/outdated.ts`.

When `latest > current` AND `latest` falls outside `consentedRange`, append `(hook consent will require re-grant)`.

Commit: `[feat:card-outdated] note hook consent invalidation`.

### Task 5.5 — `card audit` stub

**Files:** Create `cli/commands/card/audit.ts` registered as a no-op-with-help that prints "v1.1 feature: see analysis 60 §4". Register in `cli/index.ts`.

Commit: `[feat:card-audit] register stub for v1.1 audit command`.

**End of Phase 5.** Full test suite green.

---

## Phase 6 — Docs and dogfooding

### Task 6.1 — Update `docs/cli-quickref.md`

**Files:** `docs/cli-quickref.md`.

Add a "Card hooks" section after the existing "Card commands" section. Cover: scaffolding (`add-hook`), consenting (`trust --hooks`), hook runtime selection, Mastra opt-in via `hooks.runtimes.mastra.enabled`, the silent-skip default, and the `--strict-hooks` flag. Make clear that drwn hook consent gates materialization only; Codex project-local hooks may still require Codex's `/hooks` review/trust flow before they run. Mirror the prose style of the existing source/catalog sections.

Commit: `[docs:cli-quickref] document card hooks lifecycle`.

### Task 6.2 — Update architecture knowledge doc

**Files:** `.ai/knowledges/10_drwn-cli-architecture.md`.

Add a `## 3.x Hooks` subsection (numbered after the existing skills/MCP subsections). Reference analysis 60. Add a row to the "Per-user store topology" table for `generated/hooks/<runtime>/`.

Commit: `[docs:arch] add hooks section to drwn-cli-architecture knowledge doc`.

### Task 6.3 — Add a real hook to `@remyjkim/personal-harness`

**Files:** in the local source for that card (under `~/.agents/drwn/sources/@remyjkim/personal-harness/`), add `hooks/audit-tool-calls/policy.ts`; update `card.json` to bump version to `0.2.0` and add `hooks.include: ["audit-tool-calls"]`.

Run `drwn card source doctor @remyjkim/personal-harness` — clean. Run `drwn card publish @remyjkim/personal-harness` — succeeds at `0.2.0` with `minor` bump classification.

(This task is performed by Remy locally; not a code change in this repo. Record the publish hash in a follow-up commit message in the personal-harness card.)

### Task 6.4 — End-to-end dogfood

In a temp project: `drwn init`; `drwn card add @remyjkim/personal-harness@0.2.0`; observe warning about hooks; `drwn card trust @remyjkim/personal-harness --hooks`; `drwn write`; observe `.claude/settings.json` updated, `.codex/hooks.json` written, composer.mjs files exist; review/trust the generated Codex hook through Codex's native `/hooks` flow if Codex marks it untrusted; in a Claude Code and Codex session against this project, trigger a tool call and observe the audit policy fires.

This task validates the full loop. Capture any UX rough edges as follow-up issues; do **not** fix them inside this branch unless they are blocking.

---

## What's deferred (per analysis 60 §6)

Do not implement in this branch — file follow-up tasks if needed:

- Sandbox / worker_threads isolation (option C from Q5).
- `card audit --diff` body (stub-only here).
- `trustedSources.autoConsentHooks` config field.
- Non-tool-use hook events (UserPromptSubmit, SessionStart, Stop, etc.).
- Project-local policies (only card-supplied in v1).
- Inline-bundling Mastra composer (`--bundle` flag).
- Hot-reload during dev.

---

## Final acceptance checklist

Before opening the PR:

- [ ] `bun test` is fully green (no skips beyond `.skip(...)` marked deferred).
- [ ] `bun test test/cli-hook-write-e2e.test.ts` passes end-to-end.
- [ ] `bun run typecheck` clean.
- [ ] `drwn card source add-hook` / `remove-hook` / `card trust` / `card untrust` all show in `drwn --help`.
- [ ] Lockfile v3 fixtures committed under `test/fixtures/`.
- [ ] Hook runtime selection tests prove `claude-code` and `codex` follow existing targets, `cursor` is ignored, and `mastra` is opt-in via `hooks.runtimes.mastra.enabled`.
- [ ] Codex encoder tests prove `ask` does not emit unsupported `permissionDecision: "ask"` for `PreToolUse`.
- [ ] Managed-content drift tests prove edited `.codex/hooks.json` is refused without `--force` and cleaned only when hashes match.
- [ ] `docs/cli-quickref.md` and `.ai/knowledges/10_drwn-cli-architecture.md` updated.
- [ ] Codex project-local hook trust flow is documented and manually verified with `/hooks`, or explicitly recorded as a known external trust step.
- [ ] At least one `@remyjkim/*` card published with a real hook and used end-to-end on Remy's machine.
- [ ] One CCH dogfood: confirm `composer.ts` builds inside the consumer's Mastra bundle in a `containerized-cli-harness` test app, or document the path-rewriting steps required.
- [ ] No `[Co-Authored-By: Claude]` lines or AI attribution in any commit message.

---

## References

- Target architecture: `.ai/analyses/60_drwn-card-hooks-target-architecture.md`
- Research foundation: `.ai/analyses/59_hooks_policy_research.md`
- Architecture knowledge: `.ai/knowledges/10_drwn-cli-architecture.md`
- CCH integration boundary: `/Users/pureicis/dev/containerized-cli-harness/packages/runtime/src/container-cli-base.ts`
