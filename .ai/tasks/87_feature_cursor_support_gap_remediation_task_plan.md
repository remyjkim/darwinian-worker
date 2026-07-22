# Cursor Support Gap Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the four verified gaps between drwn's cursor target and Cursor's native
configuration surfaces: false-positive MCP drift diagnostics, skills invisible to
cursor-only selections, no cursor hook runtime, and ambient-collision guidance that may
contradict Cursor's documented merge behavior.

**Architecture:** Skills become descriptor-driven — each target declares which skill
surface directories its harness reads (`skillSurfaces`), so cursor participates as a
reader of `.claude/skills/` and `.codex/skills/` without new directories or write-record
schema changes. Hooks gain a fourth command runtime ("cursor") reusing the existing
composer pipeline (decode → compose → encode over stdin/stdout) with a cursor-specific
encoder and a standalone `.cursor/hooks.json` config writer following the codex
precedent. Diagnostics drift moves from byte-exact to per-server hash comparison.

**Tech Stack:** Bun + TypeScript, bun:test, existing test helpers in `test/helpers.ts`
(`scaffoldCliFixture`, `runAgentsCli`, `envFor`).

**Background reading before starting:**
- `.ai/analyses/120_cursor-configuration-guide.md` — Cursor's native surfaces (source of truth for formats).
- `.ai/analyses/122_feature_opencode_target_support_target_architecture.md` §2 — the gap audit this plan remediates.
- `cli/core/targets.ts` — descriptor table pattern.
- `.ai/rules/02_tdd_practices.md` — RED → GREEN → REFACTOR is mandatory.

**Conventions:** All tests run with `bun test ./test/<file>.test.ts`. Every test file
pushes fixtures to `tempRoots` and cleans up in `afterEach` (copy the pattern from
`test/commands-write-cursor-conflict.test.ts`). Commit messages are plain human-style
conventional commits — no AI attribution of any kind.

---

## Part A — Diagnostics: per-server cursor MCP drift (Gap: false positives)

`detectMcpDrift` (`cli/core/diagnostics.ts:840`, used at `:1132`) compares
`.cursor/mcp.json` byte-exact against `renderCursorConfig(activeServers)`. The cursor
writer (`mergeCursorConfigText`, `cli/core/mcp.ts:447`) deliberately preserves
user-authored foreign servers, so any foreign server makes doctor report drift forever.
The codex branch directly above it already does per-server hash comparison — mirror it.

### Task A1: Failing test for foreign-server tolerance

**Files:**
- Test: `test/core-mcp-drift.test.ts` (create)

**Step 1:** Read `cli/core/diagnostics.ts:840-884` and the caller at `:1120-1140` to
confirm how `detectMcpDrift` is reached. It is module-private; export it (that is part of
Task A2 — the test imports it directly, which is why the test fails first).

**Step 2:** Write the failing test:

```ts
// ABOUTME: Pins per-server MCP drift detection semantics for doctor diagnostics.
// ABOUTME: Foreign servers in merged target configs must not report as drift.
import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectMcpDrift } from "../cli/core/diagnostics";
import { renderMcpServerForTarget } from "../cli/core/mcp";
import { createTempRoot, createFixtureConfig, createFixtureRegistry } from "./helpers";

describe("detectMcpDrift cursor", () => {
  test("foreign servers alongside in-sync managed servers report no drift", async () => {
    const root = await createTempRoot("mcp-drift-");
    const registry = createFixtureRegistry();
    const servers = registry.servers;
    const managed = Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [name, renderMcpServerForTarget("cursor", server)]),
    );
    await mkdir(join(root, ".cursor"), { recursive: true });
    await writeFile(
      join(root, ".cursor", "mcp.json"),
      `${JSON.stringify({ mcpServers: { ...managed, "user-own": { command: "my-tool" } } }, null, 2)}\n`,
    );
    const config = createFixtureConfig({
      claudeSettings: join(root, ".claude", "settings.json"),
      codexConfig: join(root, ".codex", "config.toml"),
      cursorConfig: join(root, ".cursor", "mcp.json"),
    });
    const drifts = await detectMcpDrift(config, servers, root);
    expect(drifts).toEqual([]);
  });

  test("a modified managed server still reports drift", async () => {
    // Same setup, but mutate one managed server's command before writing.
    // Expect drifts to contain a string starting with "cursor:".
  });
});
```

Fill in the second test body following the first (mutate `managed.<firstName>.command = "tampered"`).
Adjust helper argument shapes to what `createFixtureConfig`/`createFixtureRegistry`
actually accept — read their definitions in `test/helpers.ts` first.

**Step 3:** Run: `bun test ./test/core-mcp-drift.test.ts` — Expected: FAIL
(`detectMcpDrift` is not exported).

### Task A2: Export and fix the cursor branch

**Files:**
- Modify: `cli/core/diagnostics.ts:840` (add `export`), cursor branch at `:875-878`

**Step 1:** Export the function, then replace the cursor byte-compare with per-server
hashing (mirror the codex branch directly above it):

```ts
if (targetName === "cursor" && existsSync(configPath)) {
  const current = readFileSync(configPath, "utf8");
  const names = Object.keys(activeServers);
  const currentHashes = hashClaudeManagedServers(current, names);
  const expectedHashes = Object.fromEntries(
    names.map((name) => [
      claudeMcpServerHashKey(name),
      canonicalJsonHash(renderMcpServerForTarget("cursor", activeServers[name]!)),
    ]),
  );
  if (names.some((name) => currentHashes[claudeMcpServerHashKey(name)] !== expectedHashes[claudeMcpServerHashKey(name)])) {
    drifts.push(`cursor:${configPath}`);
  }
}
```

Import whatever is missing (`hashClaudeManagedServers`, `claudeMcpServerHashKey`,
`canonicalJsonHash`, `renderMcpServerForTarget`) from their existing modules.

**Step 2:** Run: `bun test ./test/core-mcp-drift.test.ts` — Expected: PASS.

**Step 3:** Run the full suite to catch doctor-adjacent regressions:
`bun test ./test/` — Expected: PASS (investigate any diagnostics test failures before
proceeding; do not weaken existing assertions).

**Step 4:** Commit:

```bash
git add cli/core/diagnostics.ts test/core-mcp-drift.test.ts
git commit -m "fix(diagnostics): compare cursor MCP drift per managed server"
```

---

## Part B — Skills: descriptor-driven surface readers (Gap: cursor selections get no skills)

Today `syncSkills` (`cli/core/skills.ts:276-338`) gates only on the `--target` flag and
ignores `targets.<name>.enabled` entirely: `--target=cursor` writes no skills at all, and
disabled targets still receive skill writes. Cursor natively discovers `.claude/skills/`
and `.codex/skills/` (guide 120 §3.1), so the fix is to model skill directories as
surfaces with a declared reader set.

**Behavior changes (deliberate, flag in the PR description):**
1. `drwn write --target=cursor` now materializes both `.claude/skills/` and `.codex/skills/`.
2. A target that is disabled no longer receives skill writes unless another enabled
   target reads the same surface (aligns skills with MCP enablement semantics).

### Task B1: Failing descriptor test

**Files:**
- Test: `test/core-targets.test.ts` (modify)

**Step 1:** Add:

```ts
test("targets declare which skill surface directories their harness reads", () => {
  expect(getTargetDescriptor("claude").skillSurfaces).toEqual(["claude"]);
  expect(getTargetDescriptor("codex").skillSurfaces).toEqual(["codex"]);
  expect(getTargetDescriptor("cursor").skillSurfaces).toEqual(["claude", "codex"]);
});
```

**Step 2:** Run: `bun test ./test/core-targets.test.ts` — Expected: FAIL (`skillSurfaces` undefined).

### Task B2: Add `skillSurfaces` to descriptors

**Files:**
- Modify: `cli/core/targets.ts`

**Step 1:**

```ts
export type SkillSurfaceDir = "claude" | "codex";

export interface TargetDescriptor {
  name: TargetName;
  family: TargetName;
  surfaces: Surface[];
  mcpFormat: McpFormat;
  hookRuntime: Runtime | null;
  skillSurfaces: SkillSurfaceDir[];
}
```

Set `skillSurfaces: ["claude"]` on claude, `["codex"]` on codex,
`["claude", "codex"]` on cursor.

**Step 2:** Run: `bun test ./test/core-targets.test.ts` — Expected: PASS.

**Step 3:** Commit:

```bash
git add cli/core/targets.ts test/core-targets.test.ts
git commit -m "feat(targets): declare skill surface readers per target"
```

### Task B3: Failing behavior test for cursor skill materialization

**Files:**
- Test: `test/commands-write-cursor-skills.test.ts` (create)

**Step 1:** Model setup on `test/commands-write-partial-ownership.test.ts`
(`completeProject()` pattern: `scaffoldCliFixture` → `publishCardWithSkills` →
`installProjectWorkers`). Write three tests:

```ts
test("--target=cursor materializes claude and codex skill surfaces", async () => {
  // full-project fixture with one card skill "alpha"
  const result = await runAgentsCli(["write", "--json", "--target=cursor"], envFor(fixture), projectRoot);
  expect(result.exitCode).toBe(0);
  expect(existsSync(join(projectRoot, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);
  expect(existsSync(join(projectRoot, ".codex", "skills", "alpha", "SKILL.md"))).toBe(true);
});

test("skills for a surface with no enabled reader are not materialized", async () => {
  // project config disables claude and cursor (targets: { claude: {enabled:false}, cursor: {enabled:false} })
  // plain `drwn write` then expect .claude/skills NOT to exist, .codex/skills to exist
});

test("cursor-only project still receives claude-surface skills", async () => {
  // project config disables claude and codex, keeps cursor enabled
  // plain `drwn write` then expect .claude/skills AND .codex/skills to exist
});
```

Use `writeSupportedProjectConfig(projectDir, { targets: { ... } })` for the enablement
overrides (check the exact `ProjectConfig.targets` shape at `cli/core/types.ts:161`).

**Step 2:** Run: `bun test ./test/commands-write-cursor-skills.test.ts` — Expected: FAIL
(first and third tests: skills missing).

### Task B4: Compute desired surfaces from descriptors in syncSkills

**Files:**
- Modify: `cli/core/skills.ts` (the loop at `:288-311` and stale checks at `:327-334`)
- Modify: `cli/core/sync.ts:663` (call site — pass targets config)

**Step 1:** Give `syncSkills` access to target enablement. Add a parameter
`targetsConfig: Pick<CanonicalConfig, "targets">` and compute:

```ts
import { descriptorsFor, type SkillSurfaceDir } from "./targets";

const selectedSurfaces = new Set<SkillSurfaceDir>(
  descriptorsFor(targetsConfig, options.target).flatMap((descriptor) => descriptor.skillSurfaces),
);
```

`descriptorsFor` (`cli/core/targets.ts:52-59`) already filters by `enabled` and the
`--target` narrowing, so no other logic is needed.

**Step 2:** Replace the four gates:
- `if (!options.target || options.target === "claude")` → `if (selectedSurfaces.has("claude"))` (both at `:288` and the stale check at `:327`)
- `if (!options.target || options.target === "codex")` → `if (selectedSurfaces.has("codex"))` (both at `:300` and `:330`)

The `MaterializeIntent.target` field and write-record ownership stay `"claude"`/`"codex"`
(they name the surface directory, which is unchanged).

**Step 3:** Update the call site at `cli/core/sync.ts:663` to pass
`state.effectiveConfig`.

**Step 4:** Run: `bun test ./test/commands-write-cursor-skills.test.ts` — Expected: PASS.

### Task B5: Reconcile the partial-ownership matrix

**Files:**
- Test: `test/commands-write-partial-ownership.test.ts` (modify)

**Step 1:** Run: `bun test ./test/commands-write-partial-ownership.test.ts`. Rows
involving `--target=cursor` (and any row asserting skills are untouched by cursor
writes) will fail because cursor now materializes skill surfaces.

**Step 2:** Update only the affected matrix rows to the new intended behavior
(`--target=cursor` now touches `claudeSkill`/`codexSkill`, so remove them from that
row's "unselected must be byte-identical" set). Do not loosen any other row. If a failure
does not match this description, stop and investigate — do not adjust the test to pass.

**Step 3:** Run the full suite: `bun test ./test/` — Expected: PASS.

**Step 4:** Commit:

```bash
git add cli/core/skills.ts cli/core/sync.ts test/commands-write-cursor-skills.test.ts test/commands-write-partial-ownership.test.ts
git commit -m "feat(skills): materialize skill surfaces for every enabled reader target"
```

---

## Part C — Cursor hook runtime

Cursor 1.7+ runs command hooks from `hooks.json` — same spawn model as the claude-code
runtime (JSON on stdin, JSON on stdout). Reuse the composer pipeline end to end; only the
decoder tag, the output encoder, and the config writer are new. Native `ask` is supported
(unlike codex), so no degradation there.

**Schema caveat:** Cursor's `preToolUse`/`postToolUse` stdin payload field names are
inferred from guide 120 §2.5-2.7 plus Cursor's documented Claude-Code hook compatibility
(§2.10). The decoder is fixture-driven; before releasing, capture one real payload from a
Cursor install (Hooks output channel, guide 120 §2.11) and adjust fixtures if they
differ. Record the outcome in the PR.

### Task C1: Failing runtime-selection tests

**Files:**
- Test: `test/core-hook-runtime-selection.test.ts` (modify)

**Step 1:** Update the pinned expectations — these assert the old scoping and must change
deliberately:
- `resolveHookRuntimes({ ...cursor enabled })` now includes `"cursor"`.
- The test named "ignores cursor because it has no v1 hook runtime" becomes
  "maps cursor to the cursor command runtime" expecting `["cursor"]`.
- `resolveHookRuntimes({ target: "cursor" })` expects `["cursor"]`.

**Step 2:** Run: `bun test ./test/core-hook-runtime-selection.test.ts` — Expected: FAIL.

### Task C2: Register the runtime

**Files:**
- Modify: `cli/core/hook-policy/types.ts:4` — `export type Runtime = "claude-code" | "codex" | "cursor" | "mastra";`
- Modify: `cli/core/hook-generator/runtime-selection.ts:14` — `ORDERED_RUNTIMES` becomes `["claude-code", "codex", "cursor", "mastra"]`
- Modify: `cli/core/targets.ts` — cursor descriptor `hookRuntime: "cursor"`

**Step 1:** Make the three edits. **Step 2:** Run:
`bun test ./test/core-hook-runtime-selection.test.ts ./test/core-targets.test.ts` —
Expected: PASS. **Step 3:** Commit:

```bash
git add cli/core/hook-policy/types.ts cli/core/hook-generator/runtime-selection.ts cli/core/targets.ts test/core-hook-runtime-selection.test.ts
git commit -m "feat(hooks): register cursor as a command hook runtime"
```

### Task C3: Decoder (TDD)

**Files:**
- Test: find the existing decode/encode unit tests (`grep -l "decodeClaudeEvent\|encodeForClaude" test/`); add cursor cases there, or create `test/core-hook-cursor-codec.test.ts` if none exists.
- Modify: `cli/core/hook-generator/decode-event.ts`

**Step 1:** Failing tests:

```ts
test("decodeCursorEvent maps preToolUse payloads to pre-tool events", () => {
  const event = decodeCursorEvent({
    hook_event_name: "preToolUse",
    tool_name: "Shell",
    tool_input: { command: "ls" },
    cwd: "/tmp/w",
    conversation_id: "c-1",
  });
  expect(event).toMatchObject({
    runtime: "cursor",
    phase: "pre-tool",
    toolName: "Shell",
    input: { command: "ls" },
    cwd: "/tmp/w",
    sessionId: "c-1",
  });
});

test("decodeCursorEvent accepts PascalCase event names and keeps unknown fields as metadata", () => {
  const event = decodeCursorEvent({
    hook_event_name: "PostToolUse",
    tool_name: "Read",
    tool_input: {},
    workspace_roots: ["/tmp/w"],
  });
  expect(event.phase).toBe("post-tool");
  expect(event.metadata).toMatchObject({ workspace_roots: ["/tmp/w"] });
});
```

**Step 2:** Run — Expected: FAIL (`decodeCursorEvent` not exported).

**Step 3:** Implement in `decode-event.ts`, following `decodeClaudeEvent` exactly, with:
- `CURSOR_KNOWN_FIELDS = new Set(["tool_name", "tool_input", "tool_response", "tool_error", "cwd", "conversation_id"])`
- phase detection tolerant of `preToolUse`/`PreToolUse`/`postToolUse`/`PostToolUse`
  (extend `eventPhase` or add a small local normalizer — do not regress claude/codex
  strictness for other names).
- `runtime: "cursor"`, `sessionId` sourced from `conversation_id`.

**Step 4:** Run — Expected: PASS. Commit
(`git commit -m "feat(hooks): decode cursor hook payloads"` with both files).

### Task C4: Encoder (TDD)

**Files:**
- Test: same file as C3
- Modify: `cli/core/hook-generator/encode-decision.ts`

**Step 1:** Failing tests — behavior contract (guide 120 §2.6-2.7: preToolUse may return
`permission` + `updated_input`; postToolUse may return `additional_context`; ask is
native):

```ts
const preEvent = { runtime: "cursor", phase: "pre-tool", toolName: "Shell" } as ToolPolicyEvent;
const postEvent = { runtime: "cursor", phase: "post-tool", toolName: "Shell" } as ToolPolicyEvent;
const logger = { warn: () => {} };

test("deny encodes permission deny with messages", () => {
  expect(JSON.parse(encodeForCursor({ action: "deny", reason: "no" }, preEvent, logger)))
    .toEqual({ permission: "deny", agent_message: "no", user_message: "no" });
});

test("ask encodes native permission ask", () => {
  expect(JSON.parse(encodeForCursor({ action: "ask", reason: "confirm" }, preEvent, logger)))
    .toEqual({ permission: "ask", agent_message: "confirm", user_message: "confirm" });
});

test("allow with updatedInput rewrites input", () => {
  expect(JSON.parse(encodeForCursor({ action: "allow", updatedInput: { command: "ls -la" } }, preEvent, logger)))
    .toEqual({ permission: "allow", updated_input: { command: "ls -la" } });
});

test("post-tool additionalContext becomes additional_context", () => {
  expect(JSON.parse(encodeForCursor({ action: "allow", additionalContext: "note" }, postEvent, logger)))
    .toEqual({ additional_context: "note" });
});

test("log-only and bare allow emit nothing", () => {
  expect(encodeForCursor({ action: "log-only" }, preEvent, logger)).toBe("");
  expect(encodeForCursor({ action: "allow" }, preEvent, logger)).toBe("");
});

test("unsupported shapes degrade with a warning", () => {
  // deny on post-tool cannot block in Cursor: expect "" and one logger.warn call
  // additionalContext on pre-tool: expect it omitted from output and one logger.warn call
});
```

**Step 2:** Run — Expected: FAIL. **Step 3:** Implement `encodeForCursor(decision, event,
logger)` in `encode-decision.ts` following the codex encoder's degradation style
(`logger.warn` + omit for unsupported shapes). **Step 4:** Run — Expected: PASS. Commit:
`git commit -m "feat(hooks): encode cursor permission decisions"`.

### Task C5: Composer bundling

**Files:**
- Modify: `cli/core/hook-generator/bundle-composer.ts`

**Step 1:** Widen `BundleHookComposerOptions.runtime` to
`Extract<Runtime, "claude-code" | "codex" | "cursor">`. In `renderEntrypoint`:
- decode/encode name selection becomes a lookup:
  claude-code → `decodeClaudeEvent`/`encodeForClaude`, codex →
  `decodeCodexEvent`/`encodeForCodex`, cursor → `decodeCursorEvent`/`encodeForCursor`.
- Replace the phase sniff (`payload.hook_event_name === "PostToolUse"`, line 73) with a
  case-tolerant check: `const phase = /post/i.test(String(payload.hook_event_name ?? "")) ? "post-tool" : "pre-tool";`
- Cursor's encoder takes a logger like codex's — extend the ternary at line 78 so cursor
  passes `logger` too.

**Step 2:** No dedicated unit test — the e2e in Task C7 exercises the generated bundle.
Run the existing hook e2e to confirm no regression:
`bun test ./test/cli-hook-write-e2e.test.ts` — Expected: PASS.

**Step 3:** Commit: `git commit -m "feat(hooks): bundle composer for the cursor runtime"`.

### Task C6: hooks.json writer in syncHooks

**Files:**
- Modify: `cli/core/hook-generator/sync-hooks.ts`
- Modify: `cli/core/write-record.ts:82-88` — allow `surface: "hook"` with `target: "cursor"`

**Step 1:** In `write-record.ts`, extend the hook ownership rule to include `"cursor"`.
Check for a validation unit test (`grep -n "hook" test/core-*.test.ts` around write-record
validation) and extend it first if one pins the old rule.

**Step 2:** Add to `sync-hooks.ts` (after the codex branch, same shape):

```ts
function cursorHooksConfig(composerPath: string) {
  const hook = { command: `node ${JSON.stringify(composerPath)}`, timeout: COMMAND_TIMEOUT_SECONDS };
  return {
    version: 1,
    hooks: {
      preToolUse: [hook],
      postToolUse: [hook],
    },
  };
}
```

```ts
if (runtime === "cursor") {
  const composerPath = join(outputDir, "composer.mjs");
  const beforeContent = readExistingContent(composerPath);
  if (!state.scopedOptions.dryRun) {
    await bundleHookComposer({ runtime, outputDir, policies });
  } else {
    result.changes.push(`write ${composerPath}`);
    result.managedPaths?.push(recordManagedContent(state.scopeRoot, composerPath, "sha256-dry-run", "cursor"));
  }
  if (!state.scopedOptions.dryRun) {
    recordComposer(result, state.scopeRoot, composerPath, beforeContent, state.scopedOptions.dryRun, "cursor");
  }

  const cursorHooksPath = join(state.scopeRoot, ".cursor", "hooks.json");
  const priorOwned = state.previousManagedPaths?.some(
    (entry) => entry.kind === "managed-content" && entry.surface === "hook" && entry.target === "cursor" &&
      managedPath(state.scopeRoot, cursorHooksPath) === entry.path,
  );
  if (existsSync(cursorHooksPath) && !priorOwned && !state.scopedOptions.force) {
    result.warnings.push(
      `Skipping cursor hooks: ${cursorHooksPath} exists and is not drwn-owned. Merge manually or rerun with --force.`,
    );
    continue;
  }
  const content = `${JSON.stringify(cursorHooksConfig(composerPath), null, 2)}\n`;
  writeManagedFile(cursorHooksPath, content, state.scopedOptions.dryRun, result);
  result.managedPaths?.push(recordManagedContent(state.scopeRoot, cursorHooksPath, hashManagedContent(content), "cursor"));
  continue;
}
```

`state.previousManagedPaths` may not exist on `EffectiveState` — check how `syncMcp`
receives `previousManagedPaths` (`cli/core/sync.ts:463-468`) and thread the prior record
into `syncHooks` the same way (the caller is in `cli/core/sync.ts` near `:675`). This
foreign-file guard is the deliberate deviation from the codex branch (cursor users
commonly have their own `hooks.json`; codex's file is drwn-conventional).

Also fix `targetConfigPath` (`sync-hooks.ts:38-46`): the fallthrough `return
toolPaths.cursorMcp` is wrong for hooks — it is currently unreachable for cursor and
stays unused by this branch (we build the path directly); leave it but add
`if (targetName === "cursor") return join(state.scopeRoot, ".cursor", "hooks.json");`
only if you end up routing through it. Prefer the direct join as written above.

**Step 3:** Run: `bun test ./test/` — Expected: PASS (no cursor policies exist in
fixtures yet, so behavior is unchanged; failures here mean a regression).

**Step 4:** Commit: `git commit -m "feat(hooks): write cursor hooks.json from card policies"`.

### Task C7: End-to-end test

**Files:**
- Test: `test/cli-hook-write-e2e.test.ts` (modify — add a cursor case beside the claude one)

**Step 1:** Follow the existing claude e2e flow exactly (card new → add-hook → policy.ts
with `deny` returning `` `blocked by ${event.runtime}` `` → publish → install → trust
--hooks → write). Then assert:

```ts
const cursorComposer = join(projectDir, ".agents", "drwn", "generated", "hooks", "cursor", "composer.mjs");
expect(existsSync(cursorComposer)).toBe(true);
const cursorHooks = JSON.parse(await readFile(join(projectDir, ".cursor", "hooks.json"), "utf8"));
expect(cursorHooks.version).toBe(1);
expect(cursorHooks.hooks.preToolUse[0].command).toContain("composer.mjs");

const run = await runComposer(cursorComposer, {
  hook_event_name: "preToolUse",
  tool_name: "Bash",
  tool_input: { command: "rm -rf /" },
});
expect(run.exitCode).toBe(0);
expect(JSON.parse(run.stdout)).toMatchObject({ permission: "deny", agent_message: "blocked by cursor" });
```

Also add a foreign-file case: pre-seed `.cursor/hooks.json` with user content, run write,
assert the warning fires and the file is untouched.

**Step 2:** Run: `bun test ./test/cli-hook-write-e2e.test.ts` — Expected: PASS (iterate
on C3-C6 if not; do not weaken assertions).

**Step 3:** Full suite: `bun test ./test/` — Expected: PASS.

**Step 4:** Commit: `git commit -m "test(hooks): cover cursor runtime end to end"`.

---

## Part D — Ambient collision guidance correction

`classifyAmbientMcpCollisions`' cursor branch (`cli/core/ambient-policy.ts:215-225`)
warns that Cursor "inherits omitted same-ID user fields" into project definitions. Guide
120 §1.1 documents whole-server "project wins". Reason CODES are release-gate-pinned
(`scripts/verify-release-readiness.ts` checks them) and must not be renamed; only the
model/messages change.

### Task D1: Empirical verification (manual, blocking for D2)

Not automatable in CI. On a machine with Cursor installed:
1. Global `~/.cursor/mcp.json`: server `probe` = stdio with `env: {"MARKER": "user"}` and a distinguishable command.
2. Project `.cursor/mcp.json`: same-ID `probe` with a different command and no `env`.
3. In Cursor: `MCP: View Server Status` / Tools & MCP panel — observe whether the
   effective `probe` carries the user `env` (field inheritance) or not (project wins).
4. Repeat with differing transports (stdio vs url).
Record results in a short section appended to
`.ai/analyses/122_feature_opencode_target_support_target_architecture.md` §7 (V1/V2
items) — including the Cursor version. Also check whether a remote server entry with
`"type": "http"` is accepted (V1).

**If verification confirms field inheritance (current model): skip D2, close V2 as
"model verified", and only commit the analysis note.**

### Task D2: Correct the remediation texts (only if project-wins confirmed)

**Files:**
- Modify: `cli/core/ambient-policy.ts:215-225` (message strings only; keep
  `CURSOR_PROJECT_MERGES_USER` / `CURSOR_PROJECT_TRANSPORT_OVERRIDE` codes)
- Test: `test/commands-write-cursor-conflict.test.ts` (update message-dependent assertions only)

**Step 1:** Update the two remediation strings to describe project-wins semantics, e.g.
"Cursor uses the project definition for a same-ID server; the user-scope definition is
ignored. Align or rename the duplicate if unintended." Adjust the disposition only if
verification showed the current warning is misleading enough to matter — dispositions
stay `"warning"` unless Remy approves otherwise.

**Step 2:** Run: `bun test ./test/commands-write-cursor-conflict.test.ts ./test/release-readiness.test.ts` — Expected: PASS.

**Step 3:** Commit: `git commit -m "fix(ambient): describe cursor same-id precedence accurately"`.

---

## Part E — Optional: doctor advisory for Cursor's ~40-tool guidance

Cursor degrades beyond ~40 active MCP tools (guide 120 §1.5). drwn only knows server
counts, not tool counts, so this is a weak proxy — **confirm with Remy before building; skip freely.**
If built: in `cli/core/diagnostics.ts` where per-target findings are assembled (near the
target branch at `:730`), when cursor is enabled and `Object.keys(activeServers).length >= 8`,
push an advisory warning citing the 40-tool guidance. TDD via the diagnostics test file
from Task A1. Commit: `chore(doctor): advise on cursor tool budget`.

---

## Part F — Documentation sync

**Files:**
- Modify: `docs/cli-quickref.md:275` — replace "Cursor has no hook runtime in this
  release" with the new behavior (cursor hook runtime; consent via `drwn card trust --hooks`).
- Modify: `docs/presentations/harness-cards-seminar.md` (+ `.html`) — flow chart:
  Skills → Claude, Codex, Cursor; Hooks → Claude, Codex, Cursor.
- Modify: `docs-astro/src/content/docs/02-how-apply-works.md`,
  `04-mcp-registry.md`, `07-per-project-config.md` — mention `.cursor/hooks.json` and
  skill-surface readers where targets are enumerated.

**Steps:** Make edits → `bun test ./test/` (release-readiness may lint docs; check) →
Commit: `git commit -m "docs: describe cursor skills and hook coverage"`.

---

## Execution order & dependencies

A (independent) → B (independent) → C (C1→C7 strictly ordered) → D (D1 gates D2) → E
(optional, needs Remy) → F last. A and B can be done in either order; C depends on
nothing in A/B. Total: ~18 bite-sized tasks.

## Out of scope (deliberate)

- `.cursor/rules/*.mdc` instructions projection — blocked on the spine decision
  (analyses 100/101); tracked in design 122 §D8.
- Machine-scope cursor hooks (`~/.cursor/hooks.json`): syncHooks writes under
  `state.scopeRoot`, which already covers machine scope when writeScope is machine —
  verify during C6/C7 but do not build special handling.
- Renaming `mcpFormat: "json-standalone"` — cosmetic; the opencode plan touches the same
  code and handles naming there.
