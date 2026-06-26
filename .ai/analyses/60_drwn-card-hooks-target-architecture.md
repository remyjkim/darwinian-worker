# Drwn Card Hooks Target Architecture

**Date**: 2026-06-11
**Status**: Draft
**References**: [analyses/59_hooks_policy_research.md, analyses/56_drwn-cli-auth-target-architecture.md, analyses/55_card-catalog-publish-cli-target-architecture.md, knowledges/10_drwn-cli-architecture.md, cli/core/card-manifest.ts, cli/core/card-store.ts, cli/core/card-lock.ts, cli/core/card-project.ts, cli/core/card-diff.ts, cli/core/card-publish-guardrail.ts, cli/core/card-source.ts, cli/core/sync.ts, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/trusted-sources.ts, cli/core/store-paths.ts, cli/core/types.ts, cli/core/write-record.ts, cli/core/extensions/registry.ts, /Users/pureicis/dev/containerized-cli-harness/packages/runtime/src/container-cli-base.ts, /Users/pureicis/dev/containerized-cli-harness/packages/codex/src/codex-cli-runtime.ts, /Users/pureicis/dev/containerized-cli-harness/packages/mastra/src/mastra-cli-runtime.ts]

---

## Executive Summary

Drwn Harness Cards will gain a third bundled artifact class — **hooks** — alongside `skills` and `servers` (MCP). A hook is a TypeScript **policy module** that runs at the tool-call boundary of an LLM runtime. Three runtimes are targeted in v1: Claude Code (local), Codex (local and inside Cloudflare Sandbox containers via `containerized-cli-harness`), and Mastra (inside CCH containers). Card authors write one runtime-agnostic policy module per concern; `drwn write` materializes per-runtime **composer shims** that bundle every locked card's policies into a single executable (`.mjs` for Claude/Codex command hooks, `.ts` for Mastra agent-construction wiring).

The architecture is a direct application of the *shared policy engine + thin per-runtime adapters* pattern from analysis 59, adapted to the harness card lifecycle (`source → published → consumed`) already established by skills and MCP. The new surface preserves all existing invariants: store-path safety, content-addressed extraction, lockfile reproducibility, managed-fields drift detection, and the `trustedSources` gate. It adds one new gate — **per-card hook consent**, recorded in the lockfile — because executing third-party TypeScript inside the tool-call path is qualitatively riskier than installing Markdown skills or registering MCP server commands, and merits an explicit second consent step that does not silently piggyback on `card add`.

The Containerized-CLI-Harness integration is intentionally *zero-coupling*. CCH is harness-card-unaware today; drwn writes its hook artifacts to deterministic project-relative paths (`./.agents/drwn/generated/hooks/...`), and a CCH consumer's existing `mountPreExecAssets` callback or Dockerfile `COPY` ships those paths into the container. No coordinated release across the two repos is required for v1.

---

## Context

### Why now

The harness card has matured to the point where skills (Markdown content) and MCP servers (external processes) cover most of what a card needs to ship. The remaining gap is the *tool-call boundary*: there is no portable way for a card to express "block destructive shell commands" or "redact this output before the model sees it" or "log this tool call to a tenant audit sink". Each runtime (Claude Code, Codex, Mastra) provides a hook surface; without harness-level abstraction, every card author would have to author the same policy three times in three different formats. Analysis 59 establishes the portable-policy + runtime-adapter pattern; this document operationalizes it inside drwn.

### Why the policy-engine pattern, not declarative pass-through

A declarative-pass-through design (card manifest carries native Claude/Codex hook entries verbatim, harness writes them through) is simpler in the harness and fine for Claude+Codex, but it does not work for Mastra. Mastra hooks are *code*, not config — they are installed into the `Agent` constructor at build time by the consumer's bundler, not loaded from a settings file at runtime. To make the same policy portable across all three runtimes, the unit of authoring must be a code module with a runtime-agnostic contract, with adapters that translate to each runtime's native shape. This is the conclusion of analysis 59, and it is what this design adopts.

### Scope

This document specifies the target state of the hook surface as of v1, covering:

- Card manifest schema extension and validation.
- Source-tree layout for policy modules.
- Lockfile schema bump and consent storage.
- Per-runtime composer shim shape and generation pipeline.
- Drift detection extensions for Claude settings + new managed-content kind for Codex hooks.
- CLI command surface (authoring, consent, diagnostics).
- Testing strategy and phased rollout.

Out of scope for v1: sandbox/capability isolation; version-diff audit body (command shell ships, body deferred); non-tool-use events (UserPromptSubmit, SessionStart, Stop, etc.); project-local policies (only card-supplied in v1); inline-bundling the Mastra composer; auto-consent via `trustedSources`.

### Decisions log

Five decisions were taken to land on this architecture (see also the Q&A trail in the brainstorming session that produced this doc):

| # | Decision | Outcome |
|---|---|---|
| Q1 | Target runtimes | **Claude Code + Codex + Mastra**, with Mastra inside CCH containers. |
| Q2 | Source-of-truth shape | **Policy engine + runtime adapters**. Reject declarative-pass-through (cannot serve Mastra natively) and bundled-scripts-with-Mastra-subprocess-shim (Mastra latency hit + complexity). |
| Q3 | Authoring surface | **Policy-engine-only for v1**. No declarative shorthand; revisit if real-world authors demand it. |
| Q4 | Bundling unit per card | **Named policy modules under `hooks/<name>/policy.ts`**, manifest lists `hooks.include: string[]`. Mirrors skills convention exactly. |
| Q5 | Trust + consent | **Per-card explicit hook consent stored in lockfile**, with version-range scope and silent-skip default. Sandbox (option C) and audit-diff body (option D) are designed in but deferred. |

---

## Architecture

### 1. Manifest, store layout, lockfile

**Card manifest schema** (`cli/core/card-manifest.ts`). New field, sibling to `skills` and `servers`:

```ts
interface CardManifest {
  // ...existing v0.1 fields (name, version, skills, servers, extensions, targets, ...)
  hooks?: {
    include?: string[];  // policy names; mirrors skills.include
  };
}
```

`validateCardManifest` rejects `hooks.exclude` and `hooks.shared` for the same reasons it rejects `skills.exclude` and reserves `skills.shared`: cards declare *what they ship*; exclusions are a project-side concern (see §4). Hooks remain a first-class field rather than a sub-key of `extensions`, because the existing `extensions` field is a typed feature-toggle registry for known extension names (`beads`, `parallel`, `markitdown` — see `cli/core/extensions/registry.ts`), not a content carrier.

**Source layout** (`~/.agents/drwn/sources/<scope>/<name>/`):

```
sources/<scope>/<name>/
  card.json
  package.json                 — already optional; matches manifest name+version
  skills/<name>/SKILL.md        — existing
  hooks/<policy>/policy.ts      — NEW
  hooks/<policy>/README.md      — NEW, optional; surfaced by `card show`
```

A single per-card `package.json` continues to carry any deps the policies import; no per-policy `package.json`. This simplifies dependency resolution at materialization time.

**Publish-time validation** (`publishCard` in `cli/core/card-store.ts:620`). The existing `validatePublishedSkillDirs` walks `skills.include` and asserts the corresponding `skills/<name>/SKILL.md` exists in both source and extracted tree. We add a sibling `validatePublishedHookDirs` that does the same for `hooks.include` against `hooks/<name>/policy.ts`. Same two-phase check, same failure mode.

**Diff classification** (`diffCards` in `cli/core/card-diff.ts`). Add `diffStringSet("hooks.include", before, after)`: adding a policy is `minor`, removing is `major`. The existing `assertSemverBumpMatchesClassification` (`cli/core/card-publish-guardrail.ts`) enforces this for free, including the `--force-bump-mismatch` escape hatch.

**Store layout — no new top-level directories**:

| Stage | Path | Existing? |
|---|---|---|
| Source | `~/.agents/drwn/sources/<scope>/<name>/hooks/<policy>/policy.ts` | New leaf; existing root |
| Published bare repo | `~/.agents/drwn/cards/<scope>/<name>.git/` | Existing; tree captured by tag |
| Extracted | `~/.agents/drwn/extracted/<tree-sha>/hooks/<policy>/policy.ts` | New leaf; existing root |
| Generated composer shims | machine: `~/.agents/drwn/generated/hooks/<runtime>/`; project: `<project>/.agents/drwn/generated/hooks/<runtime>/` | New leaves; existing `generated/` scope split |

`computeCardIntegrity` (`cli/core/card-store.ts:343`) already walks the entire extracted tree, so policy files are covered by the existing integrity hash without code change.

`assertStoreWritable` (`cli/core/store-paths.ts:17`) already guards all `generated/` writes; `DRWN_STORE_READONLY=1` correctly refuses to regenerate composer shims.

**Lockfile schema** (`cli/core/card-lock.ts`). Bumps to v3:

```ts
interface CardLockEntry {
  // ...existing v2 fields (name, requested, version, path, integrity, manifest,
  //                        skills, registry, origin, git?)
  hooks: string[];                  // v3+ required; v2 lockfiles read as []
  hookConsent?: {                   // v3+ optional; absent = no consent yet
    consentedAt: string;            // ISO timestamp
    consentedRange: string;         // semver range under which consent stays valid
  };
}

interface CardLockfile {
  lockfileVersion: 2 | 3;
  store?: { minDrwnVersion?: string };
  cards: CardLockEntry[];
}
```

`validateCardLockfile` accepts both versions. Reading v2 auto-fills `hooks: []`, omits `hookConsent`. Writing always emits v3. `store.minDrwnVersion` bumps to the drwn version that introduces hooks so older drwn binaries refuse to read forward-incompatible locks.

### 2. Policy contract, helper module, composition

**Authoring surface**. A policy module under `hooks/<name>/policy.ts` is a TS file with a default export produced by a defining helper:

```ts
import { defineToolPolicy } from "darwinian-harness/hook-policy";

export default defineToolPolicy({
  policyKind: "enforcement",     // "enforcement" | "observer"
  matcher: "Bash",               // optional regex on toolName; default ".*"
  timeoutMs: 25_000,             // optional per-policy timeout
  async beforeToolCall(event) {
    if (event.toolName === "Bash" && /\brm\s+-rf\s+(\/|\*)/.test(extractCommand(event.input))) {
      return { action: "deny", reason: "Destructive shell command blocked." };
    }
  },
  async afterToolCall(event) {
    // observer-style side effects, e.g. audit
  },
});
```

**Helper module location**: `cli/core/hook-policy/` inside the drwn CLI source tree, exposed to authors as a subpath export from the existing CLI package:

```json
// package.json (darwinian-harness)
{
  "exports": {
    "./hook-policy": "./cli/core/hook-policy/index.ts"
  }
}
```

Card sources add `"darwinian-harness": "^0.2.x"` as a dev dependency. The contract evolves in lockstep with the CLI — no separate `@curation-labs/*` package is published in v1. If/when an external community card author needs decoupled versioning, extracting to `@curation-labs/drwn-hook-policy` is a pure refactor (move files + re-export from CLI for back-compat). YAGNI for v1.

**Runtime-agnostic types**:

```ts
type Runtime = "claude-code" | "codex" | "mastra";

interface ToolPolicyEvent {
  runtime: Runtime;
  phase: "pre-tool" | "post-tool";
  toolName: string;
  input?: unknown;
  output?: unknown;
  error?: { name: string; message: string };
  cwd?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;   // runtime-specific extras pass through verbatim
}

type ToolPolicyDecision =
  | { action: "allow"; additionalContext?: string; updatedInput?: unknown }
  | { action: "deny"; reason: string; syntheticOutput?: unknown }
  | { action: "ask"; reason: string }
  | { action: "log-only" };

interface ToolPolicy {
  policyKind: "enforcement" | "observer";
  matcher?: string;
  timeoutMs?: number;
  beforeToolCall?(event: ToolPolicyEvent):
    Promise<ToolPolicyDecision | void> | ToolPolicyDecision | void;
  afterToolCall?(event: ToolPolicyEvent): Promise<void> | void;
}

export function defineToolPolicy(spec: ToolPolicy): ToolPolicy;
```

**Runtime capability degradation table**:

| Decision | Claude Code | Codex | Mastra |
|---|---|---|---|
| `allow` | passthrough | passthrough | passthrough |
| `allow + updatedInput` | `hookSpecificOutput.updatedInput` | `hookSpecificOutput.updatedInput` (Bash / apply_patch / MCP only) | logged, ignored (no input rewrite in Mastra) |
| `allow + additionalContext` | `hookSpecificOutput.additionalContext` | `additionalContext` | logged, ignored |
| `deny` | `permissionDecision: "deny"` | `permissionDecision: "deny"` | `{ proceed: false, output: syntheticOutput }` |
| `ask` | `permissionDecision: "ask"` | `permissionDecision: "ask"` | logged + treated as `allow` |
| `log-only` | no-op | no-op | no-op |

Degradation logging flows through the adapter framework's audit sink. A policy that needs fidelity can branch on `event.runtime`.

**Composition rules** (`composeToolHooks` in `cli/core/hook-policy/`):

1. **Iteration order = lockfile card order × manifest `hooks.include` order.** Lockfile cards are alphabetically sorted by `resolveProjectCards` (`cli/core/card-project.ts:42`). Within a card, policies fire in declared order.
2. **`beforeToolCall`**: each policy sees the *cumulative* event (previous policies' `updatedInput` applied). All decisions are collected, then resolved in priority order: `deny` > `ask` > accumulated `allow+updatedInput` / `allow+additionalContext` > `log-only`. First `deny` wins outright.
3. **`afterToolCall`**: every policy runs in order. Observer throws are swallowed and logged; enforcement throws propagate (rare and deliberate).
4. **Project overrides**: project config gains `hooks: { exclude: ["@scope/card:policy-name"] }` to skip specific policies without removing the card. Mirrors how `skills.exclude` works at the project layer (`mergeCardManifestsIntoProjectConfig` in `card-project.ts:53`). v1 does not support project-local policies — only card-supplied.

**TS → JS transpilation**. Card authors ship `.ts`. At adapter generation time, drwn uses **Bun's bundler** (the CLI already runs on Bun per `package.json`) to bundle `policy.ts` plus the runtime helper module into a single ESM `.mjs` with deps inlined. This avoids per-card `node_modules` and avoids Node-vs-Bun-vs-Deno divergence in command-hook execution. The Mastra adapter, by contrast, emits a `.ts` re-export module — the consumer's existing TS toolchain handles transpilation as part of their bundle.

**Errors and timeouts**. Each policy is wrapped in `runWithTimeout` (default 25s, configurable via `defineToolPolicy({ timeoutMs })`). Timeouts are treated as thrown errors: enforcement → deny with explicit reason, observer → log + continue. Structured audit events fire whether the policy completed, denied, errored, or timed out.

### 3. Runtime adapters

**Coverage in v1: PreToolUse and PostToolUse only.** Mastra's hook surface is only `beforeToolCall`/`afterToolCall`; that is the binding constraint for portability across all three runtimes. Other events (UserPromptSubmit, SessionStart, Stop, SubagentStop, PreCompact, Notification) are added later by extending the contract with new optional handlers — no breaking change.

**One composer shim per runtime per scope, not one shim per policy.** Composition across all locked cards must be deterministic and short-circuit correctly, which is cleaner inside a single process than via N command hooks. Materialization emits:

| Runtime | Artifact | Location (project scope) | Wiring |
|---|---|---|---|
| Claude Code | `composer.mjs` | `<project>/.agents/drwn/generated/hooks/claude/composer.mjs` | `.claude/settings.json` `hooks.PreToolUse` + `hooks.PostToolUse` entries point at the shim |
| Codex | `composer.mjs` | `<project>/.agents/drwn/generated/hooks/codex/composer.mjs` | `.codex/hooks.json` (drwn-owned full file) points at the shim |
| Mastra | `composer.ts` | `<project>/.agents/drwn/generated/hooks/mastra/composer.ts` | Consumer's Mastra agent imports `composeToolHooks` from this module and assigns to `Agent({ hooks })` |

Machine-scope equivalents live under `~/.agents/drwn/generated/hooks/<runtime>/`, mirroring how `generated/cursor-mcp.json` works today.

**Composer shim shape (Claude/Codex)**. Bun bundles a single `.mjs` containing:
- The composition runtime (`composeToolHooks`, `safeHook`, `runWithTimeout`).
- Every locked policy's `policy.ts` (resolved from `~/.agents/drwn/extracted/<tree-sha>/hooks/<name>/policy.ts`).
- A runtime-specific I/O adapter that reads stdin, normalizes the runtime's hook payload into the portable `ToolPolicyEvent`, runs composition, and writes the runtime's expected JSON to stdout.

Exit code 0 on success; non-zero only on shim-internal failure (the host runtime then treats it as a non-blocking error — matches the research-doc note about HTTP hook failure modes).

**Composer shim shape (Mastra)**. Emits a TS file:

```ts
// Generated; do not edit. Source: <card refs>
import { defineToolPolicy } from "darwinian-harness/hook-policy";
import policy_remyjkim_personalHarness_audit
  from "/Users/.../extracted/<sha>/hooks/audit-tool-calls/policy.ts";
import policy_remyjkim_personalHarness_denyRm
  from "/Users/.../extracted/<sha>/hooks/deny-destructive-shell/policy.ts";

export const policies = [
  policy_remyjkim_personalHarness_denyRm,
  policy_remyjkim_personalHarness_audit,
];

export { composeToolHooks } from "darwinian-harness/hook-policy";
```

Consumer wiring:

```ts
import { policies, composeToolHooks } from "../.agents/drwn/generated/hooks/mastra/composer";
new Agent({ ..., hooks: composeToolHooks(policies, { runtime: "mastra" }) });
```

For **CCH builds**, the consumer's bundler (e.g., `tsup`) must rewrite the absolute extracted-store paths to relative paths inside their bundle output. This is a bundler-config concern, not a drwn responsibility. A `--bundle` flag on `drwn write` to emit a self-contained `composer.ts` with policy code inlined is a v1.1 candidate.

**Settings file rendering**:

- **Claude (`.claude/settings.json`)**: extends `mergeClaudeSettingsText` (`cli/core/mcp.ts:75`) to manage two keys: `mcpServers` (existing) and `hooks` (new). The `_drwn` meta block (`cli/core/managed-fields.ts`) becomes `managedKeys: ["mcpServers", "hooks"]` with separate `fieldHashes` for each. Drift detection (`detectManagedFieldDrift`) already iterates `fields: string[]` — works as-is. Existing `_drwn` blocks with only `mcpServers` get `hooks` added on the next write.

- **Codex (`.codex/hooks.json`)**: a new fully-drwn-owned file. New `ManagedPath` kind `"managed-content"` added to `cli/core/write-record.ts`, carrying a `contentHash: string`. Sync writes the file from scratch on every run, refuses to overwrite if its content hash drifts from what we last wrote (unless `--force`).

- **Mastra (`composer.ts`)**: no drift concept — drwn owns the path, no human edits expected. Recorded in write-record as a generated artifact for cleanup tracking when cards are removed.

**Matcher derivation**. Each `defineToolPolicy` accepts an optional `matcher` regex. The settings entry's matcher is the union of all included policies' matchers (joined `|`), defaulting to `.*` if any policy omits it. Pure optimization to avoid spawning the composer for every tool call when only a subset of tools is interesting. Correctness lives in the composer (re-checks per policy).

**Adapter regeneration triggers**. The composer is regenerated when: locked card list changes, any locked card's integrity hash changes (policy code edited), or the drwn CLI version changes (composition runtime updated). The existing `write-record` integrity tracking covers the first two; the third is handled by including the drwn version in the meta block so binary upgrades trigger re-bundle.

**CCH integration**. Verified by reading CCH at `/Users/pureicis/dev/containerized-cli-harness/packages/runtime/src/container-cli-base.ts`: CCH is *harness-card-unaware* — its `prepareWorkspace()` only sets up `/workspace/{prompt,output,schema,trajectory,logs,stderr}`; nothing reads `.agents/drwn/`. The CCH integration for hooks is therefore *no change to CCH*. Drwn writes per-runtime artifacts to deterministic project-relative paths; a CCH consumer's existing `mountPreExecAssets` callback (or Dockerfile `COPY`) ships them into `/workspace/` (Codex picks up `.codex/hooks.json` natively) or into the Mastra agent build (which imports `composer.ts`).

### 4. Trust, consent, gate chain

**Two independent gates**:

```
card source URL  ──[trustedSources policy]──▶  may be added to lockfile
locked card with hooks  ──[hookConsent in lockfile]──▶  policies materialize into composer
no consent  →  card's skills + MCP still install; hooks silently skipped (warning to stderr)
```

`trustedSources` (`cli/core/trusted-sources.ts:assertSourceTrusted`) gates *adoption* (source URL must satisfy catalog scope, git host, or git owner allowlist). `hookConsent` gates *code execution*. The two are orthogonal: a trusted publisher's hooks still require explicit consent because executing third-party TypeScript on every tool call is a qualitatively bigger commitment than installing a Markdown skill or registering an MCP server command.

**Storage**: `hookConsent` lives in `CardLockEntry.hookConsent` (Section 1's v3 lockfile addition):

```ts
hookConsent?: {
  consentedAt: string;      // ISO
  consentedRange: string;   // semver range
};
```

Consent is valid iff the locked version satisfies the range.

**CLI surface — explicit, non-interactive, matching `--allow-untrusted-source` style**:

```bash
drwn card trust   @scope/name --hooks [--range "^0.2.0"]   # writes hookConsent
drwn card untrust @scope/name --hooks                       # clears hookConsent
```

Default `--range` is `^<locked-version>` so a single `card trust --hooks` call gives a sensible, scoped consent. `card add` stays non-interactive; when the added card declares hooks, it emits a one-line warning to stderr:

```
Added @remyjkim/personal-harness@0.2.0. Card declares 2 hook policies; they will be skipped until you run:
  drwn card trust @remyjkim/personal-harness --hooks
```

`card update`: if the new locked version falls outside `consentedRange`, `hookConsent` is dropped from the lockfile entry (not silently kept). Next `drwn write` skips hooks and prints the same warning. Re-consenting is one command.

`drwn write`: materializes the composer using only cards with valid consent. New flag `--strict-hooks` turns the silent-skip into a hard failure — right for CI that wants to fail loudly if consent lapses.

**CCH parity is free**. Consent is a *build-time* gate; the composer shim is generated on the consumer's machine after the consent check. The composer that ships into a CCH container or bundles into a Mastra agent contains *only* policies for consented cards. Containers do not need a separate runtime consent check.

**Forward-compatible extension slots**:

- **D — version-diff audit**. A new `drwn card audit @scope/name` command resolves the consented version's tree-sha vs. the locked version's tree-sha, walks `hooks/<policy>/policy.ts` files in both, and emits a unified diff. Designed to run *before* `drwn card trust --hooks --range` on a bump. Pure additive command; the CLI registers it as a stub in v1 so docs/UX are forward-compatible.

- **C — capability declarations + sandbox**. The policy contract already accepts `policyKind`; later it gains optional `capabilities: { net, fs, env }`. The composition runtime grows a `worker_threads`-backed sandbox path for Claude/Codex `.mjs` and a Mastra-side wrapper. Consent gains an optional `capLimits`. None of this breaks v1.

**Diagnostics**:

- `drwn card status` gains a `hook-consent: granted | absent | out-of-range` per-card column.
- `drwn doctor` adds two checks: (1) card has hooks but no consent → warning, (2) composer is stale (mismatch between generated composer's drwn-version meta and current binary) → warning.

**Deferred**: `trustedSources.autoConsentHooks: boolean` (auto-consent for cards passing the trust gate). Useful for enterprise where the allowlist is already the trust boundary, but premature without a real user.

### 5. CLI surface and diagnostics

**New commands** (registered in `cli/index.ts`):

| Command | Purpose | Mirrors |
|---|---|---|
| `drwn card source add-hook <card> <policy>` | Scaffold `hooks/<policy>/policy.ts` from template + append to manifest | `card source add-skill` |
| `drwn card source remove-hook <card> <policy>` | Remove `hooks/<policy>/` + manifest entry | `card source remove-skill` |
| `drwn card trust <card> --hooks [--range R]` | Write `hookConsent` into lockfile entry | non-interactive, like `--allow-untrusted-source` |
| `drwn card untrust <card> --hooks` | Clear `hookConsent` | inverse of trust |
| `drwn card audit <card>` (stub in v1) | D-feature: diff consented vs locked policy modules | new; stub registered for forward UX |

`add-hook` scaffolds a 12-line `policy.ts` with `defineToolPolicy({ policyKind: "observer", async afterToolCall(event) { ... } })` — observer default so a freshly scaffolded policy cannot fail-closed by accident before the author writes anything.

**Extended commands** (modify existing):

- `cli/commands/card/show.ts`: include `hooks` array; show each policy's `policyKind` and README first line.
- `cli/commands/card/status.ts`: add `hook-consent` column; JSON output gains `hookConsent` object per card.
- `cli/commands/card/validate.ts`: walk `hooks.include` and assert each `hooks/<name>/policy.ts` exists.
- `cli/commands/card/outdated.ts`: when outdated AND new version falls outside `consentedRange`, append `(hook consent will require re-grant)`.
- `cli/commands/card/source/doctor.ts`: new issue codes `missing_hook_dir`, `missing_policy_ts`, `orphaned_hook_dir`, `invalid_policy_module`.
- `cli/commands/card/diff.ts`: classification gains `hooks.include` entries (covered by §1's `diffCards` extension).

**`drwn doctor` checks** (`cli/core/diagnostics.ts`):

1. Hook consent state: warning if `hooks.length > 0` and `hookConsent` is missing or out-of-range.
2. Composer integrity: after `drwn write`, verify the composer's `_drwn` integrity header matches the lockfile + drwn version.

**JSON output**: every command supports `--json` matching existing convention (`renderJson` in `cli/core/output.ts`).

### 6. Testing strategy and rollout

**Test coverage** (mirroring existing `test/` naming):

*Unit*:
- `core-hook-policy.test.ts` — `defineToolPolicy` identity helper, type assertions.
- `core-hook-composer.test.ts` — composition rules (deny short-circuit, ask resolution, updatedInput accumulation, observer/enforcement error handling, timeout treatment).
- `core-hook-runtime-adapters.test.ts` — decision-to-runtime translation tables and degradation paths.
- `core-card-manifest-hooks.test.ts` — manifest validation (include accepted, exclude/shared rejected).
- `core-card-diff-hooks.test.ts` — diff classification for hooks add/remove.
- `core-card-lock-v3.test.ts` — v2 read fills `hooks: []`, no consent; v3 round-trip preserves consent.
- `core-card-publish-hooks.test.ts` — publish validates `hooks/<name>/policy.ts` in source and extracted tree.

*Command*:
- `commands-card-source-hook-mutate.test.ts` — `add-hook` / `remove-hook` end-to-end.
- `commands-card-trust.test.ts` — consent grant/clear, out-of-range detection on update, `--strict-hooks` behavior.
- `commands-card-source-doctor-hooks.test.ts` — orphaned/missing/invalid policy detection.
- `commands-card-show-hooks.test.ts` — consent state in table + JSON.

*Integration*:
- `cli-hook-write-e2e.test.ts` — scaffold → publish → add → consent → `drwn write` → assert `.claude/settings.json`, `.codex/hooks.json`, and the composer artifacts. Subprocess the composer with crafted stdin and assert composition semantics in vitro.

*Deferred to v1.1*: real Claude Code / Codex subprocess fidelity tests (require external binaries); Mastra in-process composition (requires `@mastra/core` dev dep).

**Rollout phases (single feature branch)**:

1. **Foundations**. `cli/core/hook-policy/` (types, helpers, composition runtime); `darwinian-harness/hook-policy` subpath export; manifest schema, validation, diff, publish validation; lockfile v3 read/write. No CLI surface yet. All unit-testable.

2. **Source-side authoring**. `card source add-hook`, `card source remove-hook`, extended `card source doctor`. Authors can scaffold + publish hooked cards.

3. **Adapter generators**. Claude composer + `.claude/settings.json` managed-fields extension. Codex composer + `.codex/hooks.json` with new `managed-content` write-record kind. Mastra `composer.ts` emitter. Wired into `syncRepository`.

4. **Consent**. `card trust --hooks`, `card untrust --hooks`. `card add` warning, `card update` consent invalidation, `--strict-hooks` flag, two new `doctor` checks.

5. **Diagnostic polish**. `card show` / `status` / `outdated` extensions. `card audit` stub.

6. **Docs + dogfooding**. Update `docs/cli-quickref.md` and `.ai/knowledges/10_drwn-cli-architecture.md`. Add an `audit-tool-calls` policy to `@remyjkim/personal-harness` to validate the loop end-to-end.

### Deferred (in spec, not shipping v1)

- Sandbox / worker_threads isolation (C from Q5).
- `card audit --diff` body — command shell ships in Phase 5 as a no-op.
- `trustedSources.autoConsentHooks` — no enterprise user demand yet.
- Non-tool-use events (UserPromptSubmit, SessionStart, Stop, etc.).
- Project-local policies — only card-supplied in v1.
- Inline-bundling Mastra composer (`--bundle` flag for self-contained `composer.ts`).
- Hot-reload — dev loop is "edit `policy.ts`, run `drwn write`".

### Open risks

- **Mastra path rewriting in CCH containers**. The emitted Mastra `composer.ts` uses absolute `import` paths into `~/.agents/drwn/extracted/<sha>/`. CCH consumers must rewrite these in their bundler. If painful when first tried on `@beginning-agents`, prioritize the `--bundle` flag.
- **Composer startup latency**. Bun cold-starts a bundled `.mjs` in ~30–50ms. Heavy tool-call users (dozens of calls/minute) may notice. v1.1 candidate: persistent composer over a Unix socket (Claude Code supports `type: "http"` hooks).
- **`_drwn` meta-block schema bump**. Extending `managedKeys` from `["mcpServers"]` to `["mcpServers", "hooks"]` means a drwn binary downgrade no longer recognizes `hooks` as managed; on next downgrade-write, the user gets drift errors. Acceptable; documented escape via `store migrate --backward` later if needed.

---

## Constraints inherited from the project

- **Runtime**: Bun. Composer bundling uses `Bun.build`.
- **Command framework**: Clipanion 4 (all `cli/commands/**` follow this).
- **Context shape**: `AgentsContext { repoRoot, agentsDir, homeDir, cwd, projectConfigPath }`.
- **Store mutation chokepoint**: every write under `~/.agents/drwn/` goes through `assertStoreWritable` (`store-paths.ts:17`) and `writeAtomically` (`fs.ts:31`). New generators must comply.
- **Path safety**: `assertSafePathPart` (`store-paths.ts:41`) is the gate for any new path segment derived from user input (policy names included).
- **ABOUTME convention**: every new file starts with the two-line `// ABOUTME:` comment.
- **Lockfile is the contract**: no in-memory state outlives a process. The composer shim is regenerable from the lockfile + extracted store + drwn binary, full stop.

---

## Cross-cutting interactions with existing modules

| Module | Change |
|---|---|
| `cli/core/card-manifest.ts` | Add `hooks?: { include?: string[] }`; validation rejects `hooks.exclude` and `hooks.shared`. |
| `cli/core/card-store.ts` | Add `validatePublishedHookDirs`; called from `publishCard` and `ensureExtracted` paths. |
| `cli/core/card-diff.ts` | `diffCards` adds `diffStringSet("hooks.include", ...)`. |
| `cli/core/card-lock.ts` | Bump `lockfileVersion` to 3; `validateCardLockfile` accepts both; `validateCardLockEntry` validates `hooks: string[]` and optional `hookConsent`. |
| `cli/core/card-project.ts` | `resolveProjectCards` populates `hooks` from manifest; `mergeCardManifestsIntoProjectConfig` honors project-side `hooks.exclude`. |
| `cli/core/sync.ts` | `syncRepository` calls a new `syncHooks` after `syncMcp` + `syncSkillsCore`. |
| `cli/core/mcp.ts` | `mergeClaudeSettingsText` extends managed keys to `["mcpServers", "hooks"]`. |
| `cli/core/managed-fields.ts` | No change (already iterates `fields: string[]`). |
| `cli/core/write-record.ts` | Add `managed-content` kind with `contentHash: string`. |
| `cli/core/store-paths.ts` | Add `resolveGeneratedHooksDir(scope, runtime)` helper. |
| `cli/core/hook-policy/` | NEW module: types + helpers + composition runtime + Bun-build wrapper. |
| `cli/core/hook-generator/` | NEW module: per-runtime composer emitters. |
| `cli/commands/card/source/{add,remove}-hook.ts` | NEW. |
| `cli/commands/card/{trust,untrust,audit}.ts` | NEW. |
| `cli/commands/card/{show,status,validate,outdated,diff}.ts` | Extended. |
| `cli/commands/card/source/doctor.ts` | Extended with hook-specific issue codes. |
| `cli/core/diagnostics.ts` | Two new checks. |
| `package.json` | `exports` adds `./hook-policy` subpath. |

---

## References to implementation plan

The implementation plan for this design lives at `.ai/tasks/44_drwn-card-hooks-implementation-plan.md` (drafted via the writing-plans skill). It decomposes the six rollout phases above into concrete tasks with acceptance criteria, file lists, and test expectations.
