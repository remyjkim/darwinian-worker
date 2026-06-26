# ABOUTME: Target architecture for `drwn write --root` — materializing machine defaults into user-scope tool configs.
# ABOUTME: Documents the ~80% of infrastructure already built, the seven concrete remaining gaps, and a phased build plan.

# Analysis 66 — drwn write --root · Target Architecture

**Date**: 2026-06-18
**Author**: Claude + Remy
**Status**: Draft
**References**: [.ai/analyses/64_darwinian-notion-mcp-target-architecture.md, .ai/tasks/47_completion_claude-code-project-mcp-registry-fix.md, cli/core/paths.ts, cli/core/sync.ts, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/write-record.ts, cli/core/effective-state.ts, cli/core/user-config.ts, cli/core/diagnostics.ts, cli/core/types.ts, cli/core/store-paths.ts, cli/commands/write.ts, registry/config.json, test/scenarios-scope-isolation.test.ts]

---

## Executive Summary

Add a `--root` flag to `drwn write` so machine defaults can be materialized into **user-scope** tool configs — `~/.claude.json` (Claude Code), `~/.codex/config.toml` (Codex), `~/.cursor/mcp.json` (Cursor) — making MCP servers and skills available from every directory without per-project `drwn init`. This is the natural completion of the existing machine-defaults model: today, `drwn library defaults add mcp notion` registers a default that only takes effect on the next `drwn write` *inside a drwn-managed project*. The default has no path to user-scope tool configs, leaving Claude Code launches from any non-drwn-managed cwd unable to see the configured server.

The investigation found that **~80% of the required infrastructure already exists** and is currently dormant for the user-scope MCP case. The dormancy traces to one task-47-class bug — `registry/config.json` declares `targets.claude.configPath = "~/.claude/settings.json"`, but Claude Code reads **user-scope** `mcpServers` from `~/.claude.json` (different file), so the existing machine-scope code path writes to the wrong place and produces no user-visible effect. Fix the file path, expose an explicit `--root` invocation in the command surface (currently the machine branch is reachable only implicitly when `findProjectConfig` returns null), and add deletion semantics to the managed-fields write-record code path.

**Total estimated change**: ~225 LOC across 5 production files plus ~150 LOC of test coverage. Approximately 1–2 days of focused work, not 1–2 weeks. The hard problems (managed-region drift detection, scope-aware orchestration, partial file ownership) were already solved by the infrastructure that powered task 47.

What this **does** solve cleanly:

- Notion (and any other machine-default MCP) visible from every Claude Code, Codex, and Cursor session, including scratch directories and one-off project clones.
- Skills at user scope land in `~/.claude/skills/` and `~/.codex/skills/` (free win — `syncSkillsCore` is already scope-aware via the existing `toolRoot` parameter).
- Coexistence with project-scope writes: different scope roots, different write records, project precedence honored by the tools' own dedup rules.
- Drift detection across both scopes via a side-table model that's robust against tools rewriting their own user-scope files.

What this **does not** solve and is explicitly out of scope for v1:

- **Cards at root scope** — `drwn card apply --root @remyjkim/notion-agent` requires a card-lock at user scope plus card-skill-resolver scope awareness. Phase 2, deferred. Library defaults + machine defaults + `--root` are functionally equivalent for the MCP slice today.
- **Multi-machine sync** — `~/.agents/drwn/machine.json` is per-machine. Separate problem, predates `--root`.
- **Hooks at root scope** — `mergeClaudeSettingsText` manages both `mcpServers` and `hooks` today; at user scope these split across two files. Phase 1 ships MCP-only; hooks-at-root is a clean follow-up using the same primitives.

---

## Context

### What forced this analysis

A solo developer's task was "open Claude Code in any directory and have Notion just work." Empirical observation in this codebase as of 2026-06-18:

```
$ cd /tmp && claude mcp list
chrome-devtools-mcp:chrome-devtools (plugin)
context7 (user)
```

`notion` is missing. It's missing because the only place it's currently materialized is `/Users/pureicis/dev/beginning-db/.mcp.json` — the project-scope file written by `drwn write` from inside the beginning-db repo. Claude Code does not walk up the directory tree looking for `.mcp.json` (confirmed empirically from both `/tmp` and `/`); a non-drwn-managed cwd sees only plugin and user-scope MCPs. User-scope `context7` shows up because it was hand-added to `~/.claude.json` `mcpServers` long ago; `notion` was never put there.

The natural fix was to assume drwn would have a way to deliver machine defaults to user scope. Investigation revealed: it kind of does — but the code path is non-functional due to a file-path bug, and the CLI doesn't expose it explicitly.

### Why this is mostly plumbing

The "library defaults" mental model has been in place since at least `drwn 0.x`. Today:

- `drwn library add mcp <spec> --as <name>` registers an MCP server in `~/.agents/drwn/library/mcp-servers.json`.
- `drwn library defaults add mcp <name>` records the name in `~/.agents/drwn/machine.json` under `defaults.mcpServers`.
- `drwn write` from a drwn-managed project picks up that default and includes it in the project's `.mcp.json`.

The asymmetry: defaults are a *template for project writes*, but Claude Code's user scope (and Codex's, and Cursor's) is a separate runtime surface that no drwn command writes to. The library/defaults work doesn't complete the loop. `--root` closes it.

### What memo 64 said and what this builds on

Analysis 64 ("Darwinian Harness · Notion MCP Target Architecture") chose the **hosted Notion MCP** path and shipped the `@remyjkim/notion-agent` card. Task 47 ("Claude Code Project MCP Registry Fix") corrected the writer so project-scope materializations land in `.mcp.json` at the repo root, not `.claude/settings.json`. Both deliveries were project-scope. Analysis 66 is the user-scope companion: same hosted MCP, same writer infrastructure, applied at user scope.

---

## Current State Survey

This section catalogs precisely what exists. Where citations include line numbers, those are from `darwinian-harness` HEAD as of 2026-06-18.

### Scope is already first-class in the type system

`cli/core/paths.ts:9-11`:

```ts
export type ToolScope =
  | { kind: "project"; projectRoot: string }
  | { kind: "machine"; homeDir: string };
```

`cli/core/paths.ts:63-77` — `resolveToolPaths(scope: string | ToolScope)` resolves the same six tool artifact paths (`claudeSkills`, `claudeMcp`, `codexSkills`, `claudeSettings`, `codexConfig`, `cursorMcp`) under any root. Pass `homeDir` and you get `~/.claude/skills`, `~/.mcp.json`, `~/.codex/config.toml`, `~/.cursor/mcp.json` — most of which are already the correct user-scope paths. The one exception (`claudeMcp` resolving to `~/.mcp.json`) is unused at machine scope today; see Gap 1.

`cli/core/types.ts:182`:

```ts
export interface NormalizedSyncOptions {
  // ...
  writeScope?: "machine" | "project";
  // ...
}
```

`writeScope` is a public option on the sync pipeline, typed and accepted by `syncMcp`.

### The scope decision is already auto-derived

`cli/core/effective-state.ts:85-91`:

```ts
const scopeRoot = projectRoot ?? normalized.homeDir;
const scopedOptions: NormalizedSyncOptions = {
  ...normalized,
  toolRoot: scopeRoot,
  writeScope: projectRoot ? "project" : "machine",
  generatedDir: projectRoot ? join(projectRoot, ".agents", "drwn", "generated")
                            : resolveStoreGeneratedDir(normalized.agentsDir),
};
```

If `findProjectConfig(cwd)` (which walks up the tree looking for `.agents/drwn/config.json`) returns null, `writeScope` is set to `"machine"` and `scopeRoot` is `homeDir`. From `~/` with no parent project, `drwn write` already takes the machine path. The CLI command (`write.ts`) has no `--root` or `--scope` flag, so the machine path is reachable today *only* by running `drwn write` from a non-drwn-managed directory — and even then, the wrong file is written. See Gap 2.

### The Claude renderer already does partial-field merges

`cli/core/mcp.ts:97-139` — `mergeClaudeSettingsText`:

- Parses the existing file as JSON.
- Reads `parsed._drwn` (the inline meta block) to recover the list of previously managed keys and their content hashes.
- Calls `detectManagedFieldDrift` (`cli/core/managed-fields.ts:27-33`) to check whether any managed field has changed since drwn last wrote it.
- Surgically updates only the managed fields (`mcpServers`, optionally `hooks`), preserving all other top-level keys.
- Rebuilds the `_drwn` meta with new hashes; preserves `lastWriteAt` if unchanged.
- Returns the new full text.

This is precisely the primitive needed for `~/.claude.json`, which contains dozens of unrelated top-level keys (`numStartups`, `cachedDynamicConfigs`, `projects`, `customApiKeyResponses`, etc., totaling roughly a megabyte of user state).

### Drift detection is canonical-hash-based and format-agnostic

`cli/core/managed-fields.ts`:

```ts
function canonicalize(value: unknown): unknown { /* recursive sort */ }
export function canonicalJsonHash(value: unknown) {
  return `sha256-${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}
export function detectManagedFieldDrift(
  current: Record<string, unknown>,
  fields: string[],
  recordedHashes: Record<string, string>,
) {
  return fields.filter((field) =>
    recordedHashes[field] && canonicalJsonHash(current[field]) !== recordedHashes[field]
  );
}
```

Key formatting is irrelevant; whitespace is irrelevant; only semantic value matters. Stable across JSON re-serialization.

### Write-record already supports partial ownership

`cli/core/write-record.ts:15-19`:

```ts
export type ManagedPath =
  | { path: string; kind: "symlink"; target: string }
  | { path: string; kind: "managed-fields"; fields: string[]; fieldHashes: Record<string, string> }
  | { path: string; kind: "generated-symlink"; generatedPath: string }
  | { path: string; kind: "managed-content"; contentHash: string };
```

The `managed-fields` variant records exactly the JSON paths drwn owns and the hashes of their last-written content. It exists today for `.claude/settings.json` at project scope (see `cli/core/sync.ts:166`). The same primitive applies verbatim at user scope for `~/.claude.json`.

### Machine-scope write-record location is defined

`cli/core/store-paths.ts`:

```ts
export function resolveGlobalWriteRecordPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "global-write-record.json");
}
```

Resolves to `~/.agents/drwn/store/global-write-record.json`. Used by `buildEffectiveState` (`effective-state.ts:105`):

```ts
recordPath: projectRoot
  ? resolveProjectWriteRecordPath(projectRoot)
  : resolveGlobalWriteRecordPath(normalized.agentsDir),
```

The orchestrator already routes the record location by scope.

### Machine-defaults overlay is already wired

`cli/core/user-config.ts:77-108` — `mergeMachineConfig` overlays `~/.agents/drwn/machine.json` onto the packaged repo config, merging `targets`, `optional`, `defaults`, `catalogs`, `parallel`, `analyzer`, `trustedSources`. The output is the effective `CanonicalConfig` used by everything downstream including `buildActiveServers`.

`cli/core/mcp.ts:26-53` — `buildActiveServers(registry, config)`:

```ts
if (config.defaults?.mcpServers) {
  const defaults = new Set(config.defaults.mcpServers);
  return Object.fromEntries(
    Object.entries(registry.servers).filter(([name, server]) =>
      defaults.has(name) && server.transport !== "platform-provided"
    ),
  );
}
```

When `defaults.mcpServers` is populated (the case after `drwn library defaults add mcp notion`), the active server set is *exactly* the defaults list. So at user scope, the active set is well-defined and stable.

### Diagnostics is scope-aware

`cli/core/diagnostics.ts:439-446`:

```ts
async function detectMcpDrift(
  config: CanonicalConfig,
  activeServers: Record<string, RegistryServer>,
  homeDir: string,
  toolRoot: string,
  generatedDir: string,
  scope: "machine" | "project" = "machine",
) {
```

The default is `"machine"`. The function already branches on scope to compute expected vs current content. It inherits the same file-path bug as `syncMcp` (see Gap 1) but the structure is in place.

### Scope-isolation test scaffold exists

`test/scenarios-scope-isolation.test.ts` opens with:

```ts
test("project write targets project-local agent files and leaves home files unchanged", async () => {
```

The harness for asserting scope isolation is built. New cases plug into it directly.

### Skills writer is already user-scope-correct

`syncSkillsCore` is called with the scoped `toolRoot`, so user-scope skill symlinks already land in `~/.claude/skills/<name>` and `~/.codex/skills/<name>` — the correct user-scope locations for both tools. No changes needed in the skills path.

---

## The Seven Concrete Gaps

These are the only things that don't work today.

### Gap 1 — User-scope Claude MCP is written to the wrong file

`registry/config.json` declares:

```json
"claude": { "configPath": "~/.claude/settings.json", "format": "json-merge", "mcpKey": "mcpServers" }
```

Claude Code's project-scope MCP reading lives in `<project>/.mcp.json` (the bug task 47 fixed). Claude Code's **user-scope** MCP reading lives in `~/.claude.json`'s top-level `mcpServers` map (empirically confirmed: removing entries from `~/.claude.json` `mcpServers` immediately removes them from `claude mcp list` user scope). Yet the current machine branch of `syncMcp` (`sync.ts:163-167`) writes to `expandHomePath("~/.claude/settings.json", homeDir)` and Claude Code does not read user-scope MCP from that file.

The wrinkle: `~/.claude/settings.json` *is* the correct user-scope file for hooks. So the fix is not just "swap the path." It's "split MCP and hooks to different files at user scope."

**Implementation**:

1. Extend the canonical config schema (`cli/core/types.ts`) to give the Claude target two write paths:
   ```ts
   export interface TargetConfig {
     enabled: boolean;
     configPath: string;        // hooks live here at user scope; legacy field name preserved
     userMcpPath?: string;      // NEW: where mcpServers go at user scope. Optional; falls back to configPath for backwards compat.
     format: "json-merge" | "toml-merge" | "json-standalone";
     mcpKey: string;
     symlink?: boolean;
   }
   ```
2. Update `registry/config.json`:
   ```json
   "claude": {
     "enabled": true,
     "configPath": "~/.claude/settings.json",
     "userMcpPath": "~/.claude.json",
     "format": "json-merge",
     "mcpKey": "mcpServers"
   }
   ```
3. Update `syncMcp` user branch to use `target.userMcpPath ?? target.configPath`. Same applies to `detectMcpDrift`.

LOC: ~15 across `types.ts`, `registry/config.json`, `sync.ts`, `diagnostics.ts`.

### Gap 2 — No CLI surface to invoke machine scope explicitly

The current command (`cli/commands/write.ts`) exposes `--dry-run`, `--json`, `--mcp-only`, `--skills-only`, `--target`, `--force`, `--strict-hooks` — no scope flag. The machine branch in `syncMcp` is reachable only implicitly when `findProjectConfig(cwd)` returns null. From `~/dev/beginning-db` (which has `.agents/drwn/config.json` after the work earlier in 2026-06), the project path is always taken; there's no way to say "this time, write user-scope."

**Implementation**: add a single boolean flag:

```ts
// cli/commands/write.ts
root = Option.Boolean("--root", false, {
  description: "Write to user-scope tool configs (~/.claude.json, etc.) using machine defaults. Ignores any ancestor .agents/drwn/config.json.",
});
```

And thread it through:

```ts
// SyncOptions
forceMachineScope?: boolean;

// effective-state.ts
const projectConfigPath = options.forceMachineScope ? null : findProjectConfig(normalized.cwd ?? process.cwd());
```

Setting `projectConfigPath` to null makes the rest of `buildEffectiveState` route to machine scope without any further branching. The auto-derivation does the work.

LOC: ~10 across `write.ts`, `types.ts`, `effective-state.ts`.

Naming alternatives considered: `--user` (clearer but conflicts with possible future `--user=<name>` for multi-user setups), `--global` (overloaded; `drwn library defaults` is global-ish), `--scope=root` (more typing). `--root` is short, distinctive, and doesn't conflict.

### Gap 3 — Side-table drift state for `~/.claude.json`

`mergeClaudeSettingsText` currently stores its `_drwn` meta block *inside* the file it writes. For `.claude/settings.json` (drwn-owned file), this is fine. For `~/.claude.json` (heavily shared user-state file), it carries non-trivial risk: Claude Code itself rewrites the file when the user changes settings via the UI, and an unfamiliar top-level key could be stripped, re-ordered, or trigger validation warnings. If `_drwn` is stripped between writes, drwn loses drift state and on the next `drwn write --root` either (a) reports phantom drift, or (b) silently re-establishes the marker as though no drift occurred — both surprising behaviors.

**Implementation**: extend `mergeClaudeSettingsText` to accept a per-call source for managed-field hashes:

```ts
export function mergeClaudeSettingsText(
  currentText: string,
  servers: Record<string, RegistryServer>,
  options?: {
    force?: boolean;
    hooks?: ClaudeHooksConfig;
    inlineMeta?: boolean;           // NEW: default true; pass false at user scope
    priorFieldHashes?: Record<string, string>;  // NEW: required when inlineMeta=false
  },
) {
  // ... when inlineMeta=false, skip readDrwnMetaBlock and use priorFieldHashes instead;
  //     skip writing parsed._drwn at the end.
  //     The new fieldHashes are returned alongside the new text so the caller (syncMcp) can persist them to the write-record.
}
```

This requires the function to return both `text` and `fieldHashes` when `inlineMeta=false`. In `syncMcp`'s user branch, hashes flow into the `managed-fields` ManagedPath:

```ts
const prior = previousRecord?.managedPaths.find(p => p.path === ".claude.json");
const priorHashes = (prior?.kind === "managed-fields") ? prior.fieldHashes : {};
const { text, fieldHashes } = mergeClaudeSettingsText(current, servers, {
  inlineMeta: false,
  priorFieldHashes: priorHashes,
  force: options.force ?? false,
});
writeManagedFile(configPath, text, options.dryRun, result);
managedPaths.push({ path: ".claude.json", kind: "managed-fields", fields: ["mcpServers"], fieldHashes });
```

The write-record already stores hashes in the `managed-fields` variant; this just starts populating them properly (currently they're written as `fieldHashes: {}` at `sync.ts:166`, which is a separate latent gap).

LOC: ~25 across `mcp.ts`, `sync.ts`. Plus a small refactor to populate `fieldHashes` correctly in the existing project-scope write (which is harmless to fix in the same pass).

### Gap 4 — Hook split at user scope

`mergeClaudeSettingsText` currently manages `mcpServers` and `hooks` in one call against one file. At user scope, MCP lives in `~/.claude.json` and hooks live in `~/.claude/settings.json`. The renderer must be called twice with different `managedKeys` and different file paths.

**Implementation**: in `syncMcp` user branch, separate the two writes. Phase 1 ships MCP-only; the hooks-at-root path is deferred. The split is straightforward:

```ts
// user scope, MCP only (Phase 1)
const mcpPath = expandHomePath(target.userMcpPath ?? target.configPath, options.homeDir);
const currentMcp = await readTextIfExists(mcpPath, "{}\n");
const { text: nextMcp, fieldHashes: mcpHashes } = mergeClaudeSettingsText(currentMcp, servers, {
  inlineMeta: false,
  priorFieldHashes: priorMcpHashes,
  force: options.force ?? false,
});
writeManagedFile(mcpPath, nextMcp, options.dryRun, result);
managedPaths.push({ path: ".claude.json", kind: "managed-fields", fields: ["mcpServers"], fieldHashes: mcpHashes });

// Phase 2: hooks at user scope to target.configPath, same pattern with managedKeys=["hooks"]
```

`syncHooks` (`cli/core/hook-generator/sync-hooks.ts`) likely already writes to the right user-scope hooks file today. Cross-check during implementation.

LOC: ~10 in `sync.ts` for Phase 1. Phase 2 hooks-at-root: estimated ~15 LOC additional.

### Gap 5 — `detectMcpDrift` inherits Gap 1

Same wrong-file path. Same fix — switch to `target.userMcpPath ?? target.configPath` for the Claude user-scope check (`diagnostics.ts:455`):

```ts
return expandHomePath(
  targetName === "claude" && scope === "machine" ? (target.userMcpPath ?? target.configPath) : configuredPath,
  homeDir,
);
```

LOC: ~5.

### Gap 6 — Deletion semantics for `managed-fields`

`cleanupRemovedManagedPaths` (`cli/core/sync.ts:68-102`) handles removal for `managed-content`, `symlink`, and `generated-symlink` variants. There's no case for `managed-fields`. Today this is latent — at project scope, `.claude/settings.json` `mcpServers` doesn't get cleaned up if the server list shrinks, but most projects don't run `library defaults remove` against project-scope configurations.

At user scope, removal matters: `drwn library defaults remove mcp notion` followed by `drwn write --root` should drop the `notion` key from `~/.claude.json` `mcpServers`. Without this, the user-scope file keeps the entry forever.

**Implementation**: extend `cleanupRemovedManagedPaths` to handle `managed-fields` by re-merging with an empty server map for the specific fields, or by deleting the entries:

```ts
if (entry.kind === "managed-fields") {
  const current = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(current) as Record<string, unknown>;
  // For each managed field, restore to "drwn does not own it" — which means delete it
  // if drwn was the sole writer, or set to empty if it had partial ownership semantics.
  // For mcpServers + the side-table approach: just delete it.
  for (const field of entry.fields) {
    delete parsed[field];
  }
  const next = `${JSON.stringify(parsed, null, 2)}\n`;
  if (next !== current) {
    result.changes.push(`prune-field ${absolutePath} ${entry.fields.join(",")}`);
    if (!dryRun) writeFileSync(absolutePath, next);
  }
  continue;
}
```

The subtle case is *partial* deletion within `mcpServers` — when the defaults set contracts but doesn't go to zero, the field stays but specific server entries vanish. That's already handled by re-running `mergeClaudeSettingsText` with the new (smaller) server set; no special prune step needed. The prune step only triggers when the whole `mcpServers` key should no longer be drwn-owned (e.g., user runs `drwn library defaults remove mcp` on every server).

LOC: ~15 in `sync.ts`.

### Gap 7 — Hashes that are recorded but never populated

`sync.ts:166` and `:173` record `fieldHashes: {}` — empty maps. This means the project-scope `managed-fields` write-record has stale-since-creation hashes. Drift detection on `.claude/settings.json` (hooks) at project scope still works because `mergeClaudeSettingsText` uses the inline `_drwn` block as the source of truth, but the write-record is *also* tracking these hashes ineffectively. With Gap 3's side-table approach, the write-record becomes the source of truth at user scope, and the hashes must be populated correctly. Side benefit: fixes a latent inconsistency at project scope too.

LOC: ~5 — already counted in Gap 3.

---

## Target Architecture

### Layer diagram

```
                +--------------------------------+
                |  ~/.agents/drwn/library/       |
                |    mcp-servers.json            |
                |    (registered MCP definitions)|
                +--------------------------------+
                                |
                                | drwn library defaults add mcp <name>
                                v
                +--------------------------------+
                |  ~/.agents/drwn/machine.json   |
                |    defaults.mcpServers: [...]  |
                +--------------------------------+
                                |
                                | drwn write --root
                                v
                +----------------------------------------+
                |  effective-state.buildEffectiveState   |
                |    options.forceMachineScope = true    |
                |    → projectConfigPath: null           |
                |    → writeScope: "machine"             |
                |    → scopeRoot: homeDir                |
                |    → recordPath: ~/.agents/drwn/store/ |
                |        global-write-record.json        |
                +----------------------------------------+
                                |
                                v
                +----------------------------------------+
                |  syncMcp (machine branch)              |
                |  for each enabled target:              |
                |    claude → managed-fields merge       |
                |             into ~/.claude.json        |
                |    codex  → managed-fields merge       |
                |             into ~/.codex/config.toml  |
                |    cursor → full-content write +       |
                |             symlink ~/.cursor/mcp.json |
                +----------------------------------------+
                                |
                                v
                +----------------------------------------+
                |  ~/.agents/drwn/store/                 |
                |    global-write-record.json            |
                |    (managed-fields with fieldHashes    |
                |     populated for drift detection)     |
                +----------------------------------------+
                                |
                                v
                  Claude Code reads ~/.claude.json
                  Codex reads ~/.codex/config.toml
                  Cursor reads ~/.cursor/mcp.json
                  → notion visible in every session
```

### Schema additions

Only one schema addition. `TargetConfig` in `cli/core/types.ts`:

```ts
export interface TargetConfig {
  enabled: boolean;
  configPath: string;
  userMcpPath?: string;   // NEW
  format: "json-merge" | "toml-merge" | "json-standalone";
  mcpKey: string;
  symlink?: boolean;
}
```

`userMcpPath` is optional; absent means "use `configPath` for everything" (preserves existing behavior for `codex` and `cursor` where the configured path already correctly resolves to a user-scope MCP file). Only `claude` populates it: `~/.claude.json`.

### CLI surface additions

```
drwn write [--root] [--dry-run] [--json] [--mcp-only] [--skills-only] [--target <name>] [--force]
```

Single new boolean. All other flags compose:

- `drwn write --root --dry-run` — preview user-scope writes
- `drwn write --root --mcp-only` — user-scope MCP without skill symlinks
- `drwn write --root --target=claude` — user-scope Claude only
- `drwn write --root --json` — machine-readable output (the `output.ts` renderer is scope-agnostic; no changes needed)

No new commands. No new init step (`~/.agents/drwn/machine.json` is created when the first `drwn library defaults add` runs; nothing else to bootstrap).

### Coexistence semantics

| Scenario | What happens |
| --- | --- |
| `drwn write` from a drwn-managed project (no `--root`) | Project-scope only. `~/.claude.json` untouched. |
| `drwn write --root` from anywhere | User-scope only. Project `.mcp.json` untouched. |
| Both run in sequence | Both files written. Claude Code's dedup applies (project wins on name collision; same endpoint = silent no-op). |
| Same server in machine defaults *and* a project card | Server appears in both `~/.claude.json` and `<project>/.mcp.json`. If endpoints match (typical for hosted MCPs), no `claude mcp list` warning. If endpoints differ, the existing dual-scope warning fires — same UX as the pre-existing `context7` dual-scope situation. |
| User edits `~/.claude.json` `mcpServers.notion` by hand | Next `drwn write --root` detects drift via the side-table hash, refuses to overwrite without `--force`. |
| `drwn library defaults remove mcp notion` then `drwn write --root` | Side-table sees no remaining ownership of `mcpServers.notion`; Gap 6 deletion semantics drop the key. Other user-managed entries (e.g. `context7`) are untouched. |

### Drift-state model at user scope

The side-table approach means the source of truth for "what does drwn own in `~/.claude.json` and what was the last-written content" is `~/.agents/drwn/store/global-write-record.json`. Concretely a managed-fields entry there looks like:

```json
{
  "path": ".claude.json",
  "kind": "managed-fields",
  "fields": ["mcpServers"],
  "fieldHashes": {
    "mcpServers": "sha256-<canonical hash of the mcpServers object as drwn last wrote it>"
  }
}
```

On the next `drwn write --root`:

1. Read `~/.claude.json`, parse, extract current `mcpServers`.
2. Canonical-hash current `mcpServers`. Compare to recorded hash.
3. If different and `--force` not set → throw drift error referencing both the file and the field.
4. If same → proceed: render new `mcpServers` from the active server set, write the file, persist new hash to the write record.

The `_drwn` inline block is NOT written into `~/.claude.json`. If a future call wants to revert to inline-meta semantics (e.g. for portability), the side-table → inline migration is a `mergeClaudeSettingsText` invocation with `inlineMeta=true` and the recorded hashes seeded from the side-table.

### Write-record co-residency

`~/.agents/drwn/store/global-write-record.json` already exists in the schema and is used by `buildEffectiveState`'s machine branch. The `managedPaths` array gains a new entry per user-scope materialization. Project write-records (`.agents/drwn/write-record.json` under each project) are unchanged.

---

## Phased Plan

### Phase 1 — Ship `--root` for MCP + skills (this analysis's primary delivery)

Goal: `drwn write --root` produces working user-scope MCP and skill materializations across Claude Code, Codex, Cursor.

Concrete tasks, in order:

1. **Schema**: add `userMcpPath?: string` to `TargetConfig` (`types.ts`). Update `registry/config.json` `targets.claude` to set `userMcpPath: "~/.claude.json"`. ~10 LOC.
2. **Renderer**: extend `mergeClaudeSettingsText` to support `inlineMeta=false` mode with caller-supplied `priorFieldHashes`. Return `{text, fieldHashes}` in that mode. ~20 LOC plus tests.
3. **Sync**: update `syncMcp` user branch to call the renderer with `inlineMeta=false`, write to `userMcpPath`, populate `managedPaths` with correct hashes. ~15 LOC.
4. **CLI flag**: add `--root` to `write.ts`, plumb `forceMachineScope` through `SyncOptions` and `buildEffectiveState`. ~10 LOC.
5. **Deletion**: extend `cleanupRemovedManagedPaths` for the `managed-fields` variant. ~15 LOC.
6. **Diagnostics**: update `detectMcpDrift` to use `userMcpPath` at machine scope. ~5 LOC.
7. **Tests** (gating, not optional):
   - "Adds mcpServers.notion to ~/.claude.json without touching other top-level keys"
   - "Preserves a hand-added context7 entry in mcpServers"
   - "Detects drift if the user hand-edits the drwn-owned mcpServers.notion URL"
   - "Removes the entry when machine defaults no longer include it"
   - "Coexists: project write doesn't touch ~/.claude.json; --root write doesn't touch project .mcp.json"
   - "Hooks at project scope still work unchanged" (regression test)
   - "Same endpoint dual-scope produces no drift warning" (regression test)
   Roughly 7 cases, ~150 LOC of test code.
8. **Empirical**: verify that Claude Code's own UI-triggered writes to `~/.claude.json` (e.g. theme change) preserve unfamiliar `mcpServers` entries. Test by hand-adding a sentinel server, triggering a UI write, confirming the entry survives. If it doesn't — Phase 1 still ships with side-table drift detection (which doesn't depend on Claude Code preserving anything), but we'd document a known caveat that drwn writes can race with UI writes and the last-write-wins outcome may differ from drwn's expectations.

Total LOC: ~225 production + ~150 test. Effort: 1–2 days.

**Acceptance**: from `/tmp`, `claude mcp list` shows `notion` after `drwn library defaults add mcp notion && drwn write --root && claude` (cold restart) and OAuth. Same for Codex (`codex mcp status` from anywhere). Same for Cursor.

### Phase 2 — Hooks at root scope

Goal: `drwn write --root` also materializes hook configurations into `~/.claude/settings.json`.

Concrete tasks:

1. Split the Claude user-scope write in `syncMcp` into two: MCP → `~/.claude.json`, hooks → `~/.claude/settings.json`. Both using the side-table approach.
2. `syncHooks` already may handle this — cross-check the existing project-scope hook write path and replicate at user scope.
3. Add hook-specific test cases.

LOC: ~15 production + ~50 test. Effort: half a day.

### Phase 3 — Cards at root scope

Goal: `drwn card apply --root @remyjkim/notion-agent` pins a card at user scope.

This is the meaningful expansion in surface — cards bundle MCP + skills + extensions + hooks + a card.lock. At user scope:

1. New `~/.agents/drwn/card.lock` for user-scope card pins.
2. `card-skill-resolver.ts` extended to consider user-scope card includes when no project context is present.
3. `card-project.ts` companion at user scope: machine-config absorbs card-derived defaults.
4. `drwn card apply` learns `--root`.
5. `drwn write --root` already does the right thing once the effective state includes user-scope cards.

LOC: ~200–400 production + ~150 test. Effort: ~1 week.

Deferred until at least one card other than the bundled Notion MCP exists at user scope. Library defaults + `--root` are functionally adequate for the single-server case.

### Phase 4 — Multi-machine sync

Out of scope. Naming for completeness: today `~/.agents/drwn/machine.json` is the source of truth and isn't synced. Options when this becomes a priority: dotfiles-style git sync of `~/.agents/drwn/`, a hosted "drwn sync" backend, or per-machine reconciliation against a shared catalog. Independent of `--root`.

---

## Findings

1. **The infrastructure for user-scope writes is ~80% built.** Scope is a first-class type, `writeScope` is a public option, the renderer supports partial-field merging, the write-record has a `managed-fields` variant, diagnostics already accepts a scope parameter, and the test scaffold has scope-isolation cases. None of this needs to be invented.
2. **The dormancy of the existing machine-scope code path traces to one task-47-class bug** — `registry/config.json` declares `targets.claude.configPath = "~/.claude/settings.json"`, but Claude Code reads user-scope MCP from `~/.claude.json`. The renderer is correct; the file path is wrong.
3. **The CLI does not expose machine-scope invocation explicitly.** The current machine branch is reachable only when `findProjectConfig(cwd)` returns null, which is increasingly rare as more directories get `drwn init`'d.
4. **The side-table approach for drift state is strongly preferable at user scope** to the inline `_drwn` marker. Robust against `~/.claude.json` being rewritten by Claude Code's own UI, doesn't pollute a heavily-shared user-state file with drwn-specific keys, and reuses the already-existing `managed-fields` ManagedPath variant (which is currently storing `{}` for hashes — a latent inconsistency this work also fixes).
5. **Hooks and MCP must split at user scope.** Today they share `.claude/settings.json` at both scopes. At user scope, MCP belongs in `~/.claude.json`. The split is mechanical — call the renderer twice with different `managedKeys` and different file paths.
6. **Deletion of managed-fields is not currently implemented anywhere.** Latent at project scope (rare in practice); load-bearing at user scope (the `library defaults remove` flow must propagate). Same primitive serves both.
7. **Skills, Codex, and Cursor at user scope are essentially free.** `syncSkillsCore` is already scope-aware via `toolRoot`. `expandHomePath(target.configPath, homeDir)` already resolves correctly to `~/.codex/config.toml` and `~/.cursor/mcp.json`. The work is concentrated on the Claude MCP path bug.
8. **Phase 1 is ~225 LOC + ~150 LOC test.** Not a rewrite. Not even a refactor — additive, mostly.
9. **Cards-at-root is a meaningful follow-up, not a Phase-1 prerequisite.** Library defaults + `--root` cover the immediate need (one or more MCPs available everywhere). Cards add bundled skills + version pinning + hooks; Phase 3 takes that on properly with its own card-lock semantics.
10. **The empirical question — does Claude Code preserve unknown top-level keys in `~/.claude.json` across its own writes — is the one Phase 1 risk.** Mitigation: the side-table approach makes drift detection independent of that preservation. The risk reduces to "race between drwn write and Claude Code UI write," which is the same race any tool writing a shared user file faces.

---

## Recommendations

1. **Adopt this architecture for Phase 1 as written.** The schema addition is minimal, the CLI surface is one flag, the rendering changes are additive. No breaking changes; no migration.
2. **Use the side-table drift model at user scope.** Skip the inline `_drwn` block in `~/.claude.json`. Cleaner separation, robust against external rewrites, doesn't add observable keys to the user's Claude config file.
3. **Fix the project-scope `fieldHashes: {}` inconsistency in the same pass** (Gap 7). Tiny cleanup, lives in the same code path, eliminates a class of latent bugs.
4. **Defer hooks-at-root (Phase 2) and cards-at-root (Phase 3)** until at least one concrete use case appears. The MCP slice is the immediate forcing function; carrying hooks and cards would triple Phase 1's surface for unclear marginal value today.
5. **Make the empirical Claude-Code-rewriting-`~/.claude.json` test a Phase 1 deliverable**, not an open question. A 5-minute smoke test will resolve whether unknown keys survive; the answer affects no Phase 1 code (side-table makes the answer cosmetic) but informs whether a future inline-meta variant remains viable.
6. **Ship Phase 1 from a feature branch with `bun test` green and one scratch smoke at `/tmp/root-scope-smoke`** before merging. The task 47 completion's smoke pattern (`/tmp/notion-card-test`) is the right precedent.

---

## Open Questions

1. **Naming.** `--root` is short and distinctive but a reader might assume "filesystem root." `--user` is clearer in isolation but conflicts with possible future `--user=<name>` parameterization. `--global` is overloaded already. `--scope=root` typewise verbose. Final choice: ship `--root` with `--user` as an alias. Cost is trivial.
2. **Does `drwn write --root` warn or error when `~/.agents/drwn/machine.json` has no `defaults.mcpServers` entries?** Today the active server set in that case would be empty, and `mergeClaudeSettingsText` would write an empty `mcpServers: {}` — actively clearing user-managed entries. Probably should be a no-op-with-warning instead. ("`drwn write --root` ran but machine defaults declare no MCP servers; nothing to write. Add servers with `drwn library defaults add mcp <name>`.")
3. **Should `drwn doctor` show user-scope drift even when run from a drwn-managed project?** Today doctor scopes its report to the current project. A user might want a `drwn doctor --root` or just have doctor surface both scopes when both are managed. Phase 1 ships with the current scoping; revisit if confusion accumulates.
4. **Coexistence of `drwn write --root` with hand-managed `~/.claude.json` `mcpServers`.** If a user has `mcpServers.context7` hand-added today and `drwn write --root` then takes ownership of `mcpServers.notion`, both must coexist. The side-table approach handles this correctly (drwn only owns the entries it added). Worth explicit test coverage to make sure the `mergeClaudeSettingsText` partial-field semantics extend to *partial server-map ownership* — i.e., drwn owns specific keys *within* `mcpServers`, not the whole map. Re-read the renderer to confirm.
5. **`writeManagedFile` atomicity at `~/.claude.json`.** The file is ~MB+ for active users. The current `writeManagedFile` implementation should be using atomic write (`fs.rename` from a `.tmp`); confirm in `cli/core/managed-file.ts`. If not atomic, a power loss mid-write breaks Claude Code globally. Easy fix if needed.
6. **`drwn library defaults remove mcp <name>` UX after Phase 1.** Currently it updates `machine.json` but doesn't tell the user "now run `drwn write --root` to propagate." Adding a `next: ["drwn write --root"]` hint to the JSON output is a small UX win.
7. **Discovery in the absence of a drwn-managed project.** A user who runs `drwn write --root` from a one-off directory should not need any project setup. Verify that the command flow tolerates `findProjectConfig` returning null even without `--root` set explicitly — it does today, but worth a regression test once `--root` becomes the recommended path.

---

## Appendix A — End-to-end command flow

```bash
# 1. One-time machine setup (already done in this environment).
drwn library add mcp ./notion-server-spec.json --as notion
drwn library defaults add mcp notion

# 2. The new step (Phase 1).
drwn write --root --dry-run --json   # preview
drwn write --root                    # materialize

# 3. Cold-restart Claude Code from anywhere.
# 4. /mcp → select notion → OAuth.

# 5. Verification.
cd /tmp && claude mcp list           # should show notion
cd ~/dev/some-non-drwn-project && claude mcp list  # should show notion
```

No `drwn init` anywhere. No project to manage. The machine defaults plus `--root` are sufficient.

## Appendix B — Worked example: ~/.claude.json before and after

Before `drwn write --root`:

```json
{
  "numStartups": 482,
  "mcpServers": {
    "context7": { "type": "http", "url": "https://mcp.context7.com/mcp" }
  },
  "projects": { "...large blob..." },
  "cachedDynamicConfigs": "...",
  "userID": "..."
}
```

After `drwn write --root` (with `defaults.mcpServers = ["notion"]`):

```json
{
  "numStartups": 482,
  "mcpServers": {
    "context7": { "type": "http", "url": "https://mcp.context7.com/mcp" },
    "notion": { "type": "http", "url": "https://mcp.notion.com/mcp" }
  },
  "projects": { "...large blob..." },
  "cachedDynamicConfigs": "...",
  "userID": "..."
}
```

Note the absence of any `_drwn` top-level key. Drift state lives in `~/.agents/drwn/store/global-write-record.json`:

```json
{
  "writeRecordVersion": 1,
  "lastWriteAt": "2026-06-18T...",
  "lastWriteHarnessVersion": "0.2.2",
  "managedPaths": [
    {
      "path": ".claude.json",
      "kind": "managed-fields",
      "fields": ["mcpServers"],
      "fieldHashes": {
        "mcpServers": "sha256-..."
      }
    },
    { "path": ".codex/config.toml", "kind": "managed-fields", "fields": ["mcp_servers"], "fieldHashes": { "...": "..." } },
    { "path": ".cursor/mcp.json", "kind": "generated-symlink", "generatedPath": "/Users/pureicis/.agents/drwn/store/generated/cursor-mcp.json" },
    { "path": ".claude/skills/notion-pull-spec", "kind": "symlink", "target": "/Users/pureicis/.agents/skills/notion-pull-spec" }
    // ... etc.
  ]
}
```

The hash for `mcpServers` was computed *after* the merge — over the full post-merge value including the hand-managed `context7`. This matters: it means drift detection on the next write sees "did the value of `mcpServers` change at all," not "did the notion entry specifically change." A subtle but defensible choice — alternative would be per-server-entry hashes, but that complicates the schema for marginal benefit at v1 scale.

## Appendix C — Why not just edit `~/.claude.json` by hand?

This was the obvious unblock path discussed before this analysis. Why build `--root` instead:

| Property | Hand-edit | `drwn write --root` |
| --- | --- | --- |
| Time to first effect | 30 seconds | 1–2 days build + 30 seconds run |
| Survives `drwn library defaults remove mcp notion` | No (manual cleanup) | Yes (Gap 6 deletion semantics) |
| Drift detection if you accidentally edit `mcpServers.notion` | No | Yes |
| Multi-tool fan-out (Codex + Cursor in same pass) | No (three separate edits) | Yes |
| Survives new machine setup | No (manual on each machine) | Yes (`drwn library defaults` is portable; one `drwn write --root` per machine) |
| Discoverable from `drwn doctor` / `drwn status` | No | Yes |
| Reversible from one command | No | Yes (`drwn library defaults remove` + `drwn write --root`) |

Hand-edit is the right *unblock today*. `--root` is the right *long-term primitive*. Both are compatible — `drwn write --root` will adopt any hand-added entry only by reading its current content as the baseline; it will not retroactively claim ownership of `context7` just because it materializes `notion` next to it (Open Question #4 verifies this).

## Appendix D — Test plan (Phase 1)

The seven scenarios from "Phase 1 task 7" elaborated:

1. **Surgical add**:
   - Setup: `~/.claude.json` with `{ numStartups: 1, mcpServers: { context7: {...} }, projects: {...} }`.
   - Action: `drwn write --root` with `defaults.mcpServers = ["notion"]`.
   - Assert: `mcpServers.notion` present; `mcpServers.context7` present; `numStartups`, `projects` byte-identical.
2. **Drift detection**:
   - Setup: run scenario 1, then `python -c "import json; d=json.load(open('~/.claude.json')); d['mcpServers']['notion']['url'] = 'https://evil.example/mcp'; json.dump(d, open('~/.claude.json','w'))"`.
   - Action: `drwn write --root`.
   - Assert: throws drift error; `~/.claude.json` unchanged.
   - Recovery action: `drwn write --root --force`.
   - Assert: re-establishes drwn's expected `mcpServers.notion`.
3. **Removal**:
   - Setup: scenario 1 complete.
   - Action: `drwn library defaults remove mcp notion && drwn write --root`.
   - Assert: `mcpServers.notion` gone; `mcpServers.context7` preserved.
4. **Coexistence**:
   - Setup: drwn-managed project with `defaults.mcpServers = ["notion"]`; project has its own card adding `notion`.
   - Action: `drwn write` (no `--root`) then `drwn write --root`.
   - Assert: project `.mcp.json` has `notion`; `~/.claude.json` `mcpServers.notion` present; both endpoints match; no drift in either write record.
5. **Project unaffected**:
   - Setup: drwn-managed project with `.mcp.json` containing `mcp.foo`.
   - Action: `drwn write --root` (different defaults, no foo).
   - Assert: project `.mcp.json` byte-identical; only `~/.claude.json` and friends change.
6. **Hooks regression**:
   - Setup: project with hooks in `.claude/settings.json`.
   - Action: `drwn write` (no `--root`).
   - Assert: project hooks unchanged from current behavior.
7. **Empty defaults no-op**:
   - Setup: `~/.agents/drwn/machine.json` with `defaults.mcpServers = []`.
   - Action: `drwn write --root`.
   - Assert: `~/.claude.json` byte-identical; warning emitted that no servers were configured (per Open Question #2).

A useful eighth case if implementation allows:

8. **Claude Code rewrite resilience**:
   - Setup: scenario 1 complete; simulate Claude Code rewriting `~/.claude.json` (load JSON, re-serialize with different key ordering and whitespace, write back).
   - Action: `drwn write --root` with the same defaults.
   - Assert: no drift error (canonical hash is order-independent); no spurious rewrite (content semantically unchanged).
