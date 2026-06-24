# ABOUTME: Implementation plan for `drwn write --root` — user-scope materialization of machine defaults across Claude Code, Codex, Cursor.
# ABOUTME: Concrete file-by-file changes, code scaffolding, ordered phases, gating tests, scratch smoke.

# Task 49 — Implementation Plan: `drwn write --root`

**Status**: Completed
**Created**: 2026-06-19
**Updated**: 2026-06-24
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 1–2 days production code + tests + scratch smoke; small follow-on for managed-file hardening if Phase 5 ships separately
**Dependencies**: existing scope/writer/diagnostics infrastructure (paths.ts ToolScope, sync.ts writeScope branch, mcp.ts mergeClaudeSettingsText, write-record.ts managed-fields variant). All present; this task wires them together end-to-end and fixes the user-scope file path bug.
**References**: [analyses/66_drwn-write-root-target-architecture.md, tasks/47_completion_claude-code-project-mcp-registry-fix.md, tasks/46_darwinian-notion-mcp-implementation-plan.md, registry/config.json, cli/core/paths.ts, cli/core/sync.ts, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/managed-file.ts, cli/core/write-record.ts, cli/core/effective-state.ts, cli/core/user-config.ts, cli/core/diagnostics.ts, cli/core/types.ts, cli/core/store-paths.ts, cli/commands/write.ts, cli/core/hook-generator/sync-hooks.ts, test/scenarios-scope-isolation.test.ts, test/helpers.ts]

**Completion**: See [49_completion_drwn-write-root.md](49_completion_drwn-write-root.md).

---

## Objective

Ship a `drwn write --root` invocation that materializes machine-default MCP servers (and, by extension, skills) into user-scope tool configs — `~/.claude.json` for Claude Code, `~/.codex/config.toml` for Codex, `~/.cursor/mcp.json` for Cursor — so that machine defaults declared via `drwn library defaults add mcp <name>` become visible from every directory without per-project `drwn init`.

This completes the half-realized "machine defaults" feature: defaults today are a template for project writes only; after this task, they also flow to user-scope tool configs through a single explicit CLI invocation.

## Target State

After this task ships:

1. `drwn write --root` from any directory writes user-scope tool configs for every enabled target whose user-scope path drwn knows how to render.
2. `~/.claude.json` `mcpServers` map contains every entry in `~/.agents/drwn/machine.json` `defaults.mcpServers`, surgically merged with any hand-managed entries (e.g. `context7`) preserved untouched.
3. `~/.codex/config.toml` `[mcp_servers.*]` tables and `~/.cursor/mcp.json` `mcpServers` map are kept in lockstep with the same default set (these targets already resolve to correct user-scope paths via the existing `expandHomePath(target.configPath, homeDir)` plumbing).
4. Drift detection works at user scope: a hand-edit to a drwn-owned entry triggers a clear error on the next `drwn write --root` unless `--force` is set.
5. Removal works: `drwn library defaults remove mcp <name>` followed by `drwn write --root` deletes the entry from the user-scope file without touching any hand-managed siblings.
6. Project-scope `drwn write` is unchanged in behavior — same files, same drift detection, same write-record schema. No regressions.
7. `drwn doctor` correctly identifies drift at user scope (currently checks the wrong file).
8. `writeManagedFile` writes the user-scope `~/.claude.json` atomically (tmp + fsync + rename) — the blast radius of a corrupt write is unacceptably large at that file.
9. Test coverage gates the behavior: the seven scenarios from analysis 66 Appendix D, the Claude-Code-rewrite resilience case, and the hand-managed sibling edit case all pass; the existing 764-test suite remains green.
10. A scratch smoke proves the loop end-to-end: from `/tmp` with no project, `claude mcp list` shows `notion` after `drwn library defaults add mcp notion && drwn write --root && claude` (cold restart) and OAuth.

## Success Criteria

- [ ] `bun test` — full suite passes (currently 764 passing, 1 skipped, 0 failing — see task 47 baseline).
- [ ] `bun run typecheck` passes.
- [ ] `bun test test/scenarios-scope-isolation.test.ts test/core-mcp-sync.test.ts test/core-mcp-merge-hooks.test.ts test/commands-write.test.ts` passes with the new cases (Phase 6) added.
- [ ] `drwn write --root --dry-run --json` from `/tmp` (no project ancestor) produces a plan including a write to `~/.claude.json`, `~/.codex/config.toml`, and `~/.cursor/mcp.json` if those targets are enabled and a machine default exists.
- [ ] `drwn write --root` from `/tmp` materializes the writes; `claude mcp get notion` from `/tmp` reports `Scope: User config` and `Status: ! Needs authentication`.
- [ ] Drift smoke: hand-edit `~/.claude.json` `mcpServers.notion.url`; `drwn write --root` exits non-zero with a drift error; `drwn write --root --force` re-establishes the canonical value.
- [ ] Removal smoke: `drwn library defaults remove mcp notion && drwn write --root` removes `mcpServers.notion` from `~/.claude.json` without altering `mcpServers.context7` or any non-`mcpServers` top-level key.
- [ ] Coexistence smoke: `drwn write` from a drwn-managed project leaves `~/.claude.json` byte-identical; `drwn write --root` immediately afterward leaves the project's `.mcp.json` byte-identical.
- [ ] Atomic-write smoke: kill the process during `drwn write --root` (e.g. `SIGKILL` mid-write); `~/.claude.json` is either fully prior or fully new — never half-written.
- [ ] No `claude mcp add`, `codex mcp add`, or hand-editing of `~/.claude.json` are used during validation.
- [ ] Companion `49_completion_drwn-write-root.md` summarizing what shipped and any deviations from this plan.

## Alternatives Considered

### Option A — Build `--root` with side-table drift state (CHOSEN)

Add a `--root` boolean flag to `drwn write`. At user scope, write `~/.claude.json` via `mergeClaudeSettingsText` with a new `inlineMeta: false, mcpServerOwnership: "per-server"` mode that pulls prior per-server hashes from the global write-record (`~/.agents/drwn/store/global-write-record.json`) and does NOT inject a `_drwn` top-level key into `~/.claude.json`. Drift state lives in the write-record; the user-scope file stays free of drwn-specific markers.

- **Pro**: Robust against Claude Code's own UI-triggered writes to `~/.claude.json`. Claude Code may strip unfamiliar top-level keys when it writes; the side-table doesn't depend on the marker surviving.
- **Pro**: Doesn't pollute a heavily-shared user-state file (`~/.claude.json` carries `numStartups`, `projects`, `cachedDynamicConfigs`, `userID`, etc. — roughly a megabyte) with drwn-specific metadata.
- **Pro**: Reuses the already-existing `managed-fields` ManagedPath variant in `write-record.ts:17`. Currently that variant stores `fieldHashes: {}` (latent bug — Gap 7 in analysis 66); fixing it in this work eliminates a latent inconsistency at project scope too.
- **Pro**: Renderer's existing `mergeClaudeSettingsText` is ~95% reusable. The change is an additive option, not a rewrite.
- **Con**: Slightly more code than Option B (~25 LOC vs ~10 LOC for renderer changes); the side-table read+update flow must be threaded through `syncMcp`.
- **Con**: Two sources of truth — file content vs side-table hashes. If a user manually edits the write-record (unlikely) they could "trick" drwn into not detecting drift. The same risk exists for any side-table approach and is mitigated by the write-record's atomic-write pattern.

### Option B — Build `--root` with inline `_drwn` meta in `~/.claude.json`

Use the existing `mergeClaudeSettingsText` semantics unchanged. At user scope, the `_drwn` block lands as a top-level key in `~/.claude.json` alongside `mcpServers`, `numStartups`, etc.

- **Pro**: Smallest possible renderer change (~5 LOC — just plug in the user-scope path).
- **Pro**: Drift state is self-contained in the file; no side-table to keep in sync.
- **Pro**: If we later add cards-at-root, every file Claude touches stays "self-describing."
- **Con**: Claude Code's behavior with unfamiliar top-level keys in `~/.claude.json` is empirically unverified. Some tools strip unknown keys on rewrite; if Claude Code does so during a UI settings change, drwn loses drift state on the next write and either reports phantom drift or silently re-establishes the marker without checking.
- **Con**: Visible "drwn-ness" in a user-state file may surprise users — `cat ~/.claude.json | jq keys` reveals the marker. Cosmetic but real.
- **Con**: Unknown forward-compatibility risk with Claude Code adding schema validation to `~/.claude.json`.
- **Verdict**: Lower-risk-to-implement, higher-risk-to-operate. The forces that pushed task 47 to fix the project file path (Claude Code's behavior around its own config files) are the same ones that recommend NOT writing drwn markers into a Claude-Code-shared file.

### Option C — Don't build `--root`; document hand-edit as the unblock

Treat `drwn library defaults` as a project-only mechanism. Document in the Notion-MCP setup guide that "for use everywhere, hand-add the entry to `~/.claude.json` `mcpServers`."

- **Pro**: Zero implementation effort. Zero test surface.
- **Pro**: No new schema, no new CLI flag, no new failure modes.
- **Con**: Forfeits drift detection on hand-managed entries; users can accidentally break their config and not know until Claude Code fails to connect.
- **Con**: Forfeits removal automation; `drwn library defaults remove mcp notion` becomes a documentation-only gesture.
- **Con**: Multi-tool fan-out is also forfeited; user must hand-edit three files (Claude, Codex, Cursor) to match.
- **Con**: New-machine setup is manual on each machine, even though `~/.agents/drwn/machine.json` is conceptually portable.
- **Verdict**: Adequate as a *bridge* (used today as the hand-edit unblock for the YouTube→Notion workflow), inadequate as a *primitive*. The library-defaults asymmetry that makes the user ask "why doesn't this work everywhere?" persists.

**Decision (2026-06-19): Option A.** Scope is bounded, infrastructure reuse is high, operational risk is lower than Option B, and the side-table fix also resolves the latent `fieldHashes: {}` inconsistency at project scope.

## Strategy

Eight phases. Each phase is a self-contained unit of work that compiles and tests cleanly. Order matters because later phases depend on the schema additions and renderer changes from earlier phases.

- **Phase 0** — Branch, baseline test pass, mark today's full-suite count for the completion doc.
- **Phase 1** — Schema additions and the wrong-file fix (Gaps 1, 5 in analysis 66).
- **Phase 2** — Renderer extension to side-table mode and write-record field-hash population (Gaps 3, 7).
- **Phase 3** — Sync orchestration: hook-MCP split at user scope and `forceMachineScope` plumbing (Gaps 2, 4).
- **Phase 4** — CLI surface: the `--root` flag.
- **Phase 5** — `writeManagedFile` atomicity hardening (open question #5 from analysis 66).
- **Phase 6** — Test coverage: the seven scenarios from analysis 66 Appendix D, plus Claude-Code-rewrite resilience and hand-managed sibling edit cases.
- **Phase 7** — Scratch smoke from `/tmp` end-to-end.
- **Phase 8** — Completion doc.

Each phase below lists: load-bearing files, exact code scaffolding, verification commands, acceptance criteria.

---

## Implementation Plan

### Phase 0 — Setup

**Tasks:**

- [ ] Create a feature branch: `git checkout -b feat/drwn-write-root` from `main`.
- [ ] Capture baseline test counts and store in a scratch note for the completion doc:
  ```bash
  bun test 2>&1 | tail -5      # expect ~764 pass / 1 skip / 0 fail
  bun run typecheck            # expect clean
  ```
- [ ] Confirm working tree is clean (`git status`).

**Acceptance:** baseline counts recorded; branch in place; no uncommitted changes.

---

### Phase 1 — Schema additions and the wrong-file fix

**Load-bearing files:** `cli/core/types.ts`, `registry/config.json`, `cli/core/sync.ts`, `cli/core/diagnostics.ts`.

**Tasks:**

- [ ] **types.ts** — extend `TargetConfig` with `userMcpPath?: string`:
  ```ts
  export interface TargetConfig {
    enabled: boolean;
    configPath: string;
    userMcpPath?: string;                          // NEW
    format: "json-merge" | "toml-merge" | "json-standalone";
    mcpKey: string;
    symlink?: boolean;
  }
  ```
- [ ] **registry/config.json** — populate the field for the Claude target only:
  ```json
  "claude": {
    "enabled": true,
    "configPath": "~/.claude/settings.json",
    "userMcpPath": "~/.claude.json",
    "format": "json-merge",
    "mcpKey": "mcpServers"
  }
  ```
  Codex and Cursor are unchanged — their `configPath` already resolves correctly at user scope (`~/.codex/config.toml`, `~/.cursor/mcp.json` are the right files for both project and user scope, since neither tool has the "two-file" split that Claude Code has between MCP and hooks).
- [ ] **sync.ts** — at the start of `syncMcp`, add a helper for the user-scope Claude MCP path resolution; thread it through the Claude branch. Sketch:
  ```ts
  function resolveClaudeMcpPath(target: TargetConfig, homeDir: string) {
    return expandHomePath(target.userMcpPath ?? target.configPath, homeDir);
  }

  // ...inside syncMcp, the Claude machine branch:
  if (targetName === "claude") {
    if (options.writeScope === "project") {
      /* unchanged */
    }
    const mcpPath = resolveClaudeMcpPath(target, options.homeDir);
    const current = await readTextIfExists(mcpPath, "{}\n");
    // ...continues in Phase 2 with the side-table call
  }
  ```
- [ ] **diagnostics.ts** — mirror the same path resolution in `detectMcpDrift`, and pass the relevant write-record entry into the Claude machine-scope comparison:
  ```ts
  // diagnostics.ts:455 — current behavior
  return expandHomePath(configuredPath, homeDir);

  // becomes:
  return expandHomePath(
    targetName === "claude" && scope === "machine"
      ? (target.userMcpPath ?? configuredPath)
      : configuredPath,
    homeDir,
  );
  ```
  Note: `target` is in scope at that point as `Object.entries(config.targets)`; if not, pass through.

  Load the global write record with `loadWriteRecord(resolveGlobalWriteRecordPath(agentsDir))` and thread it into `detectMcpDrift`. Then update the Claude machine-scope expected-text branch to use the same side-table mode as `syncMcp`:
  ```ts
  const prior = globalWriteRecord?.managedPaths.find((p) => p.path === ".claude.json");
  const priorHashes = prior?.kind === "managed-fields" ? prior.fieldHashes : {};
  const expected = scope === "project"
    ? renderJsonMcpConfig(activeServers)
    : mergeClaudeSettingsText(current, activeServers, {
        inlineMeta: false,
        mcpServerOwnership: "per-server",
        priorFieldHashes: priorHashes,
      }).text;
  ```
  If the merge throws a drift error, report the target as drifted instead of letting `doctor` crash. This keeps `doctor` diagnostic rather than destructive and avoids comparing against an inline `_drwn` block that user-scope Claude must never receive.

**Verification:**

```bash
bun run typecheck
bun test test/core-paths.test.ts test/core-mcp-sync.test.ts
```

**Acceptance:** typecheck passes; no test regressions (no new tests yet — those land in Phase 6).

---

### Phase 2 — Renderer extension to side-table per-server mode + write-record hashes

**Load-bearing files:** `cli/core/mcp.ts`, `cli/core/sync.ts`, `cli/core/write-record.ts`.

#### Sub-step 2a — extend `mergeClaudeSettingsText` with `inlineMeta` + per-server ownership options

Currently the function reads/writes `_drwn` inline and treats `mcpServers` as one managed field. Keep that behavior for project-scope / inline-meta callers. Add a user-scope mode that bypasses the inline block, treats individual `mcpServers.<name>` entries as owned units, and returns the new per-server hashes for the caller to persist.

**Ownership contract:**

- `inlineMeta: true` (default): legacy behavior. The whole `mcpServers` field is drwn-owned, `_drwn.fieldHashes.mcpServers` is written inline, and unrelated top-level Claude settings are preserved.
- `inlineMeta: false` + `mcpServerOwnership: "per-server"`: user-scope behavior. Only server names present in the prior side-table or the new desired server set are drwn-owned. Hand-managed siblings such as `mcpServers.context7` are preserved and are not drift-checked.
- `mcpServerOwnership: "none"`: hooks-only behavior for Claude settings files. The merge may manage `hooks`, but must not read, write, hash, or drift-check `mcpServers`.
- The side-table key format is `mcpServers:<serverName>`, e.g. `fieldHashes["mcpServers:notion"] = "sha256-..."`. This avoids changing the write-record schema while making ownership precise.
- Drift is checked only for previously drwn-owned server names. If a prior owned entry was hand-edited, `drwn write --root` fails unless `--force` is set. If a prior owned entry is no longer desired and still matches its prior hash, it is deleted. If it was already absent and is no longer desired, that is treated as already-clean.

**Sketch:**

```ts
// cli/core/mcp.ts

const MCP_SERVER_HASH_PREFIX = "mcpServers:";

function mcpServerHashKey(name: string) {
  return `${MCP_SERVER_HASH_PREFIX}${name}`;
}

function ownedMcpServerNames(fieldHashes: Record<string, string>) {
  return Object.keys(fieldHashes)
    .filter((key) => key.startsWith(MCP_SERVER_HASH_PREFIX))
    .map((key) => key.slice(MCP_SERVER_HASH_PREFIX.length));
}

export interface MergeClaudeSettingsOptions {
  force?: boolean;
  hooks?: ClaudeHooksConfig;
  inlineMeta?: boolean;                           // default true; legacy in-file marker
  mcpServerOwnership?: "field" | "per-server" | "none"; // default field; per-server for --root ~/.claude.json
  priorFieldHashes?: Record<string, string>;       // required when inlineMeta=false
}

export interface MergeClaudeSettingsResult {
  text: string;
  fieldHashes: Record<string, string>;             // field hashes or mcpServers:<name> hashes
}

export function mergeClaudeSettingsText(
  currentText: string,
  servers: Record<string, RegistryServer>,
  options: MergeClaudeSettingsOptions = {},
): MergeClaudeSettingsResult {
  const inlineMeta = options.inlineMeta ?? true;
  const mcpServerOwnership = options.mcpServerOwnership ?? "field";
  const parsed = JSON.parse(currentText) as Record<string, unknown>;
  const meta = inlineMeta ? readDrwnMetaBlock(parsed) : null;
  const recordedHashes = inlineMeta
    ? (meta?.fieldHashes ?? {})
    : (options.priorFieldHashes ?? {});

  const managesMcp = mcpServerOwnership !== "none";
  const previouslyManagedKeys = meta?.managedKeys ?? (managesMcp ? ["mcpServers"] : []);
  const shouldManageHooks = options.hooks !== undefined || previouslyManagedKeys.includes("hooks");
  const managedKeys = [
    ...(managesMcp ? ["mcpServers"] : []),
    ...(shouldManageHooks ? ["hooks"] : []),
  ];

  const fieldHashes: Record<string, string> = {};

  if (mcpServerOwnership === "per-server") {
    const currentServers = (
      parsed.mcpServers && typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers)
        ? parsed.mcpServers
        : {}
    ) as Record<string, unknown>;
    const desiredServers = Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
    );

    const driftedServers = options.force
      ? []
      : ownedMcpServerNames(recordedHashes).filter((name) => {
          const priorHash = recordedHashes[mcpServerHashKey(name)];
          const currentValue = currentServers[name];
          if (currentValue === undefined) return name in desiredServers;
          return Boolean(priorHash && canonicalJsonHash(currentValue) !== priorHash);
        });
    if (driftedServers.length > 0) {
      throw new Error(
        `Drift detected in Claude settings managed MCP server(s): ${driftedServers.join(", ")}. ` +
        `Rerun drwn write --root --force to overwrite.`,
      );
    }

    for (const name of ownedMcpServerNames(recordedHashes)) {
      if (!(name in desiredServers)) {
        delete currentServers[name];
      }
    }
    for (const [name, value] of Object.entries(desiredServers)) {
      currentServers[name] = value;
      fieldHashes[mcpServerHashKey(name)] = canonicalJsonHash(value);
    }
    parsed.mcpServers = currentServers;
  } else if (mcpServerOwnership === "field") {
    const driftedKeys = options.force ? [] : detectManagedFieldDrift(parsed, managedKeys, recordedHashes);
    if (driftedKeys.length > 0) {
      throw new Error(
        `Drift detected in Claude settings managed field(s): ${driftedKeys.join(", ")}. ` +
        `Move your change into .agents/drwn/config.json or rerun drwn write --force to overwrite.`,
      );
    }

    parsed.mcpServers = Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
    );
  }

  if (shouldManageHooks) {
    if (options.hooks !== undefined) {
      parsed.hooks = options.hooks;
    } else {
      delete parsed.hooks;
    }
  }

  const nextValues: Record<string, unknown> = {};
  if (managesMcp) {
    nextValues.mcpServers = parsed.mcpServers;
  }
  if (shouldManageHooks) {
    nextValues.hooks = parsed.hooks ?? null;
  }

  if (mcpServerOwnership === "field") {
    for (const key of managedKeys) {
      fieldHashes[key] = canonicalJsonHash(nextValues[key]);
    }
  } else if (shouldManageHooks) {
    fieldHashes.hooks = canonicalJsonHash(nextValues.hooks);
  }

  if (inlineMeta) {
    const nextMeta = buildDrwnMetaBlock(managedKeys, nextValues);
    const hashesUnchanged = managedKeys.every((key) => meta?.fieldHashes?.[key] === nextMeta.fieldHashes?.[key]);
    if (meta && hashesUnchanged) {
      nextMeta.lastWriteAt = meta.lastWriteAt;
    }
    parsed._drwn = nextMeta;
  } else {
    delete parsed._drwn; // if a stale inline marker is present at user scope, clean it up
  }

  return { text: `${JSON.stringify(parsed, null, 2)}\n`, fieldHashes };
}
```

`canonicalJsonHash` is already exported from `managed-fields.ts`. Existing callers (currently project-scope `.claude/settings.json` for hooks) get back `result.text` and ignore `result.fieldHashes` — or, better, we update them to persist the hashes correctly (Gap 7 cleanup). User-scope Claude stores only `mcpServers:<name>` hashes for the entries drwn owns; hand-managed sibling server entries never appear in the write record.

**Backwards-compat note:** existing callers pass `(currentText, servers, { force })` and expect a `string` return. The return shape changes to `{ text, fieldHashes }`. Update every call site in the same pass:

1. `cli/core/sync.ts:165` (project-scope Claude hook write today, MCP no longer goes here)
2. `cli/core/hook-generator/sync-hooks.ts` (Claude hook settings write)
3. `cli/core/diagnostics.ts:469` (drift comparison)
4. Tests in `test/core-mcp-merge-hooks.test.ts` and `test/sync-mcp.test.ts` (cosmetic update)

#### Sub-step 2b — populate `fieldHashes` in `syncMcp`'s `managedPaths.push`

Currently (`sync.ts:166`, `:173`) the push uses `fieldHashes: {}` — a latent inconsistency. With the new return shape, plumb the actual hashes:

```ts
// sync.ts inside the Claude user branch (Phase 3 expands this further)
const prior = (previousRecord?.managedPaths ?? []).find(p => p.path === ".claude.json");
const priorHashes = (prior?.kind === "managed-fields") ? prior.fieldHashes : {};
const merge = mergeClaudeSettingsText(current, servers, {
  inlineMeta: false,
  mcpServerOwnership: "per-server",
  priorFieldHashes: priorHashes,
  force: options.force ?? false,
});
writeManagedFile(mcpPath, merge.text, options.dryRun, result);
if (Object.keys(merge.fieldHashes).length > 0) {
  managedPaths.push({
    path: ".claude.json",
    kind: "managed-fields",
    fields: Object.keys(merge.fieldHashes),
    fieldHashes: merge.fieldHashes,
  });
}
```

For the project-scope hook case (existing code path), populate the hashes too:

```ts
// when shouldManageHooks at project scope (in syncHooks or its caller)
managedPaths.push({
  path: ".claude/settings.json",
  kind: "managed-fields",
  fields: Object.keys(merge.fieldHashes),
  fieldHashes: merge.fieldHashes,
});
```

**Required change to `syncMcp` signature:** it needs access to the loaded `previousRecord` (currently it doesn't — `syncRepository` reads the record but doesn't pass it down). Two clean options:

- Pass `previousRecord` into `syncMcp` as an extra parameter.
- Move the side-table read into `syncMcp` itself.

Recommend the former — keeps state-loading centralized in `syncRepository`.

**Verification:**

```bash
bun run typecheck
bun test test/core-mcp-merge-hooks.test.ts test/core-mcp-sync.test.ts
```

**Acceptance:** typecheck passes; existing merge-hook tests pass with updated return-shape destructuring; no behavior change at project scope (the project Claude branch in `syncMcp` still writes full-content `.mcp.json` via `renderJsonMcpConfig` and uses `managed-content`, not `managed-fields`).

---

### Phase 3 — Sync orchestration: hook-MCP split + `forceMachineScope`

**Load-bearing files:** `cli/core/sync.ts`, `cli/core/effective-state.ts`, `cli/core/types.ts`.

#### Sub-step 3a — `forceMachineScope` option

```ts
// types.ts — SyncOptions
export interface SyncOptions {
  // ...existing
  forceMachineScope?: boolean;                    // NEW: --root semantics
}

// effective-state.ts — buildEffectiveState
const projectConfigPath = options.forceMachineScope
  ? null
  : findProjectConfig(normalized.cwd ?? process.cwd());
```

Setting `projectConfigPath` to null makes the rest of `buildEffectiveState` route to machine scope automatically — no other change needed. `writeScope` becomes `"machine"`, `scopeRoot` becomes `homeDir`, `recordPath` becomes `resolveGlobalWriteRecordPath(agentsDir)`.

#### Sub-step 3b — user-scope Claude branch rewrite

Today's machine-scope branch in `syncMcp` (sync.ts:163-167):

```ts
const current = await readTextIfExists(configPath, "{}\n");
writeManagedFile(configPath, mergeClaudeSettingsText(current, servers, { force: options.force ?? false }), options.dryRun, result);
managedPaths.push({ path: ".claude/settings.json", kind: "managed-fields", fields: ["mcpServers"], fieldHashes: {} });
```

becomes (combining Phase 1's path resolution + Phase 2's side-table return shape):

```ts
const mcpPath = resolveClaudeMcpPath(target, options.homeDir);
const current = await readTextIfExists(mcpPath, "{}\n");
const prior = (previousRecord?.managedPaths ?? []).find(p => p.path === ".claude.json");
const priorHashes = (prior?.kind === "managed-fields") ? prior.fieldHashes : {};

const merge = mergeClaudeSettingsText(current, servers, {
  inlineMeta: false,
  mcpServerOwnership: "per-server",
  priorFieldHashes: priorHashes,
  force: options.force ?? false,
});

writeManagedFile(mcpPath, merge.text, options.dryRun, result);
if (Object.keys(merge.fieldHashes).length > 0) {
  managedPaths.push({
    path: ".claude.json",
    kind: "managed-fields",
    fields: Object.keys(merge.fieldHashes),
    fieldHashes: merge.fieldHashes,
  });
}
continue;
```

Note the `path: ".claude.json"` change — the write record now references the user-scope file relative to `scopeRoot` (which is `homeDir` at user scope). The `cleanupRemovedManagedPaths` and `verifyManagedPaths` callers compute absolute paths via `join(scopeRoot, pathValue)` — they already work with this convention.

If `merge.fieldHashes` is empty because the last drwn-owned MCP server was removed, do not push a new `.claude.json` managed path. The existing `cleanupRemovedManagedPaths` managed-fields case (added in this task) must then treat the previous `.claude.json` entry as already cleaned if all prior owned entries are absent, and must not delete or warn on the whole file.

#### Sub-step 3c — managed-fields cleanup for per-server ownership

Add a `managed-fields` branch to `cleanupRemovedManagedPaths`. This is required when a target is disabled or the last machine-default server is removed and the desired write record no longer contains `.claude.json`.

Behavior:

```ts
if (entry.kind === "managed-fields") {
  // For per-server Claude user-scope entries, fieldHashes keys are mcpServers:<name>.
  // Delete only still-matching drwn-owned server entries. Preserve drifted entries.
  // If a prior owned entry is already absent, treat it as already cleaned.
  // Never delete the containing ~/.claude.json file from a managed-fields cleanup.
}
```

Acceptance for this branch:

- `mcpServers.notion` matching its prior hash is removed.
- `mcpServers.context7` is preserved because it has no `mcpServers:context7` hash.
- If `mcpServers.notion` was edited before cleanup, preserve it and emit a warning unless `--force` is being used through the normal renderer path.
- If all prior owned entries are already absent, no warning is emitted.

#### Sub-step 3d — hooks split guard

`syncHooks` already targets `toolPaths.claudeSettings` (`hook-generator/sync-hooks.ts:40`), which resolves to `~/.claude/settings.json` at user scope via `resolveToolPaths(scopeRoot)` where `scopeRoot = homeDir`. However, the current helper also writes `mcpServers` whenever it merges hooks. At user scope that would put MCP data in the wrong file.

For this task, root-scope hooks are not the feature being shipped; the expected machine-scope `syncHooks` path usually has no card policies and returns early. Still, make the helper safe now: whenever `syncHooks` writes Claude settings at machine scope, call `mergeClaudeSettingsText` with `mcpServerOwnership: "none"` so it manages only `hooks` in `~/.claude/settings.json`. Project-scope hook writes keep the default `mcpServerOwnership: "field"` behavior because project Claude settings can carry both managed `mcpServers` metadata and hooks metadata.

**Verification:**

```bash
bun run typecheck
bun test test/core-mcp-sync.test.ts test/scenarios-scope-isolation.test.ts
```

**Acceptance:** typecheck passes; existing scope-isolation test still passes (`drwn write` from a project doesn't touch home); no new tests added yet.

---

### Phase 4 — CLI surface: `--root` flag

**Load-bearing files:** `cli/commands/write.ts`.

**Tasks:**

- [ ] Add the boolean flag and thread it through:
  ```ts
  // cli/commands/write.ts
  root = Option.Boolean("--root", false, {
    description: "Write to user-scope tool configs (~/.claude.json, ~/.codex/config.toml, ~/.cursor/mcp.json) using machine defaults. Ignores any ancestor .agents/drwn/config.json.",
  });

  async execute() {
    // ...existing validation
    result = await syncRepository({
      // ...existing
      forceMachineScope: this.root,
    });
    // ...
  }
  ```
- [ ] Add `--user` as an alias for compatibility with users who prefer the name (per open question #1 in analysis 66):
  ```ts
  user = Option.Boolean("--user", false, {
    description: "Alias for --root.",
  });

  // in execute():
  const forceMachineScope = this.root || this.user;
  if (this.root && this.user) {
    throw new UsageError("Use either --root or --user, not both.");
  }
  ```

**Verification:**

```bash
bun run typecheck
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts write --help     # confirms --root and --user in help text
```

**Acceptance:** typecheck passes; `drwn write --help` lists `--root` with a descriptive line; `--user` flagged as alias.

---

### Phase 5 — `writeManagedFile` atomicity hardening

**Load-bearing files:** `cli/core/managed-file.ts`.

The current `writeManagedFile` (managed-file.ts:26-42) uses `writeFileSync(pathValue, nextContent)`, which is not atomic. For `~/.claude.json` (size ~MB, contains user state used by every Claude Code session), a power loss or process kill mid-write can corrupt the file globally. The fix mirrors `saveWriteRecord`'s atomicity pattern (write-record.ts:44-61):

**Sketch:**

```ts
// cli/core/managed-file.ts

import { closeSync, fsyncSync, openSync, renameSync, writeFileSync } from "node:fs";

function atomicWriteFileSync(pathValue: string, content: string) {
  const tmp = `${pathValue}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, pathValue);
  // fsync the parent dir to durably commit the rename
  const dirFd = openSync(dirname(pathValue), "r");
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

export function writeManagedFile(pathValue: string, nextContent: string, dryRun: boolean, result: SyncResult) {
  const exists = existsSync(pathValue);
  const currentContent = exists ? readFileSync(pathValue, "utf8") : undefined;

  if (currentContent === nextContent) {
    return;
  }

  ensureParentDir(pathValue, dryRun);
  if (exists) {
    backupExistingPath(pathValue, dryRun, result);
  }
  result.changes.push(`write ${pathValue}`);
  if (!dryRun) {
    atomicWriteFileSync(pathValue, nextContent);
  }
}
```

Apply universally, not just at user scope. Project-scope writes also benefit (a corrupt `.mcp.json` is annoying; a corrupt `~/.claude.json` is catastrophic) and the cost is one extra `fsync` per write — negligible.

**Verification:**

```bash
bun run typecheck
bun test                          # full suite; atomicity change should not affect any test result
```

**Acceptance:** full suite passes; an atomicity smoke test (manual, in Phase 7) confirms behavior under `SIGKILL` mid-write.

---

### Phase 6 — Test coverage

**Load-bearing files:** `test/scenarios-scope-isolation.test.ts`, `test/helpers.ts`, plus a new file `test/scenarios-root-scope.test.ts`.

#### Sub-step 6a — fixture helper

Extend `scaffoldCliFixture` to also surface the user-scope MCP path:

```ts
// test/helpers.ts

export async function scaffoldCliFixture(options?: { /* existing */ }) {
  // ...existing setup
  const claudeUserMcp = join(homeDir, ".claude.json");           // NEW
  await writeFile(claudeUserMcp, JSON.stringify({ numStartups: 1 }, null, 2));  // NEW: realistic shape

  // ...also seed the user-scope config to include userMcpPath:
  await writeFile(
    join(repoRoot, "registry", "config.json"),
    JSON.stringify({
      ...createFixtureConfig({ claudeSettings, codexConfig, cursorConfig }, options?.parallelMcpEnabled ?? false),
      targets: {
        // override claude target to include userMcpPath using the fixture's homeDir
      },
    }, null, 2),
  );

  return { /* existing */, claudeUserMcp };                       // NEW
}
```

Also extend `createFixtureConfig` to accept an optional `claudeUserMcp` paramter:

```ts
export function createFixtureConfig(
  paths: { claudeSettings: string; codexConfig: string; cursorConfig: string; claudeUserMcp?: string },
  parallelMcpEnabled = false,
): CanonicalConfig {
  return {
    // ...existing
    targets: {
      claude: {
        enabled: true,
        configPath: paths.claudeSettings,
        userMcpPath: paths.claudeUserMcp,        // NEW: optional; tests may opt out
        format: "json-merge",
        mcpKey: "mcpServers",
      },
      // ...codex, cursor unchanged
    },
  };
}
```

#### Sub-step 6b — new test file

Create `test/scenarios-root-scope.test.ts` with the seven scenarios from analysis 66 Appendix D plus the two per-server hardening cases. Sketch of the first two (the rest follow the same pattern):

```ts
// ABOUTME: Verifies drwn write --root materializes machine defaults into user-scope tool configs.
// ABOUTME: Asserts surgical merge, drift detection, removal, atomic write, and coexistence with project scope.

import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => { await cleanupTempRoots(tempRoots); });

test("--root surgically adds notion to ~/.claude.json mcpServers without touching other top-level keys", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);

  // Seed the user-scope file with realistic non-drwn content.
  await writeFile(
    fixture.claudeUserMcp,
    JSON.stringify({
      numStartups: 482,
      mcpServers: { context7: { type: "http", url: "https://mcp.context7.com/mcp" } },
      projects: { "some-project": { lastActive: "..." } },
      userID: "user-abc",
    }, null, 2),
  );

  // Seed machine defaults with notion.
  const machineConfig = {
    version: 1,
    defaults: { mcpServers: ["notion"] },
  };
  await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
  await writeFile(join(fixture.agentsDir, "drwn", "machine.json"), JSON.stringify(machineConfig, null, 2));

  // Register notion in the local library so it's resolvable.
  await mkdir(join(fixture.agentsDir, "library"), { recursive: true });
  await writeFile(
    join(fixture.agentsDir, "library", "mcp-servers.json"),
    JSON.stringify({
      version: 1,
      servers: {
        notion: {
          description: "Notion hosted",
          transport: "http",
          url: "https://mcp.notion.com/mcp",
          optional: false,
        },
      },
    }, null, 2),
  );

  const result = await runAgentsCli(["write", "--root", "--json"], envFor(fixture), "/tmp");
  expect(result.exitCode).toBe(0);

  const after = JSON.parse(await readFile(fixture.claudeUserMcp, "utf8"));
  expect(after.numStartups).toBe(482);                                       // untouched
  expect(after.projects).toEqual({ "some-project": { lastActive: "..." } }); // untouched
  expect(after.userID).toBe("user-abc");                                     // untouched
  expect(after.mcpServers.context7).toEqual({ type: "http", url: "https://mcp.context7.com/mcp" });
  expect(after.mcpServers.notion).toEqual({ type: "http", url: "https://mcp.notion.com/mcp" });
  expect(after._drwn).toBeUndefined();                                       // side-table mode: no inline marker

  // Side-table records the per-server hash.
  const writeRecord = JSON.parse(
    await readFile(join(fixture.agentsDir, "drwn", "store", "global-write-record.json"), "utf8"),
  );
  const entry = writeRecord.managedPaths.find((p: any) => p.path === ".claude.json");
  expect(entry?.kind).toBe("managed-fields");
  expect(entry?.fields).toEqual(["mcpServers:notion"]);
  expect(entry?.fieldHashes?.["mcpServers:notion"]).toMatch(/^sha256-/);
});

test("--root throws drift error if a hand-edit changes notion.url; --force overrides", async () => {
  // ...setup as above, plus first drwn write --root to establish the side-table state...
  // Then hand-edit ~/.claude.json mcpServers.notion.url to "https://evil.example/mcp"
  // Then expect runAgentsCli(["write", "--root", "--json"], ...) to exit non-zero
  // with stderr containing "Drift detected"
  // Then runAgentsCli(["write", "--root", "--force", "--json"], ...) succeeds
  // and the file is back to the canonical notion URL.
});

// ...plus 7 more scenarios per the list below...
```

Full test list (one per scenario in analysis 66 Appendix D, plus two hardening cases):

1. **Surgical add** — covered above.
2. **Drift detection + recovery** — covered above.
3. **Removal** — `library defaults remove mcp notion`, then `write --root`, expect `mcpServers.notion` gone, `context7` preserved.
4. **Coexistence** — project write doesn't touch `~/.claude.json`; `--root` doesn't touch project `.mcp.json`.
5. **Project unaffected by `--root`** — verifies symmetric direction.
6. **Hooks regression** — project hook write still works as before.
7. **Empty defaults no-op** — `defaults.mcpServers: []` → `~/.claude.json` byte-identical, warning emitted.
8. **Claude Code rewrite resilience** — re-serialize `~/.claude.json` with different key ordering/whitespace; subsequent `--root` write detects no drift (canonical hash is order-independent).
9. **Hand-managed sibling edit ignored** — after `--root` owns `notion`, edit `mcpServers.context7.url`; subsequent `--root` succeeds, preserves the edited `context7`, and only verifies/updates `mcpServers:notion`.

**Verification:**

```bash
bun run typecheck
bun test test/scenarios-root-scope.test.ts
bun test                            # full suite still green
```

**Acceptance:** all 9 new scenarios pass; full suite green (~773 passing, 1 skipped, 0 failing).

---

### Phase 7 — Scratch smoke

Same shape as task 47's scratch validation, adapted for user-scope writes.

**Tasks:**

- [ ] Pre-flight state:
  ```bash
  # Confirm baseline: notion not visible from /tmp
  cd /tmp && claude mcp get notion        # expect "No MCP server found"
  ```
- [ ] Add `notion` to machine defaults (if not already there from prior session):
  ```bash
  drwn library show notion --json | jq -r '.id'    # confirm presence
  drwn library defaults add mcp notion              # idempotent
  drwn library defaults list --json                  # expect notion in mcpServers
  ```
- [ ] Run the new command from a non-drwn-managed dir:
  ```bash
  cd /tmp
  drwn write --root --dry-run --json
  # Inspect: expect a planned write to ~/.claude.json, ~/.codex/config.toml,
  # ~/.cursor/mcp.json (or its generated dir), each carrying notion.
  drwn write --root --json
  ```
- [ ] Verify per-file landings:
  ```bash
  jq '.mcpServers.notion' ~/.claude.json
  grep -A2 'mcp_servers.notion' ~/.codex/config.toml
  jq '.mcpServers.notion' ~/.cursor/mcp.json
  ```
- [ ] Verify side-table:
  ```bash
  jq '.managedPaths[] | select(.path == ".claude.json")' \
    ~/.agents/drwn/store/global-write-record.json
  ```
- [ ] Cold-restart Claude Code, run `claude mcp get notion` from `/tmp`:
  ```text
  Scope: User config
  Status: ! Needs authentication
  Type: http
  URL: https://mcp.notion.com/mcp
  ```
- [ ] Complete OAuth in Claude Code (`/mcp` → `notion` → browser flow) — same step as task 47.
- [ ] **Drift smoke**:
  ```bash
  jq '.mcpServers.notion.url = "https://evil.example/mcp"' ~/.claude.json > /tmp/c.json
  mv /tmp/c.json ~/.claude.json
  drwn write --root      # expect non-zero exit + drift error
  drwn write --root --force      # expect success
  jq '.mcpServers.notion.url' ~/.claude.json    # expect "https://mcp.notion.com/mcp"
  ```
- [ ] **Removal smoke**:
  ```bash
  drwn library defaults remove mcp notion
  drwn write --root
  jq '.mcpServers' ~/.claude.json   # notion gone; context7 (and any other hand-managed) preserved
  ```
- [ ] **Atomicity smoke** (manual, optional but high-confidence):
  ```bash
  # In one shell:
  drwn library defaults add mcp notion
  # In another shell, kill the write mid-execution
  drwn write --root &
  sleep 0.05   # may need to tune; the write is fast
  kill -KILL %1
  # Inspect ~/.claude.json: should be either fully old or fully new, never half-written.
  jq . ~/.claude.json   # if this parses without error, atomicity held
  ```
- [ ] Restore state for daily use:
  ```bash
  drwn library defaults add mcp notion
  drwn write --root
  ```

**Acceptance:** every step above completes as expected; `claude mcp get notion` from `/tmp` shows the server post-OAuth.

---

### Phase 8 — Completion doc

Create `.ai/tasks/49_completion_drwn-write-root.md` following the task 47 completion format:

- **Completed**: 2026-06-?? (the day Phase 8 lands)
- **Scope completed**: bullet list of the eight phases above.
- **Scope deferred**: hooks-at-root, cards-at-root (Phase 2/3 of analysis 66).
- **What Changed**: file list with one-liner per change.
- **Root Cause** section (parallel to task 47): the user-scope MCP read path is `~/.claude.json`, not `~/.claude/settings.json`; the existing machine-scope code path wrote to the wrong file and was non-functional in practice.
- **Files Updated**: same enumeration style as task 47, anchored to the eight phases.
- **Validation**: paste the actual `bun test` output (`~773 pass, 1 skip, 0 fail`) and `bun run typecheck` outcome.
- **Scratch Smoke**: capture the Phase 7 commands and observed outputs.
- **Remaining User Test**: any per-tool OAuth steps that require human action (Codex / Cursor parallel verification — same hooks as task 47).
- **Constraints Honored**: same shape as task 47 — "no `claude mcp add`, no hand-edit of `~/.claude.json` (the smokes use it to verify drift, but the actual install flow goes through `drwn write --root`)."

**Acceptance:** doc lands as a sibling of this plan; this plan's Status field flipped to "Completed."

---

## Test Plan Summary

The nine test cases from Phase 6 form the gating contract. Reproduced as a checklist for the completion doc:

| # | Scenario | Asserts |
| --- | --- | --- |
| 1 | Surgical add | drwn-owned `mcpServers.notion` lands; siblings (`context7`, `numStartups`, `projects`, `userID`) preserved; no `_drwn` block; side-table records `mcpServers:notion` hash |
| 2 | Drift detection + recovery | hand-edit triggers error; `--force` resolves; record's per-server hash updated |
| 3 | Removal | `library defaults remove` + `write --root` deletes the entry; siblings preserved |
| 4 | Coexistence | project write doesn't touch `~/.claude.json`; `--root` doesn't touch project `.mcp.json` |
| 5 | Project unaffected by `--root` | symmetric to 4 |
| 6 | Hooks regression | project hook write at `.claude/settings.json` still works identically |
| 7 | Empty defaults no-op | byte-identical user-scope files; warning emitted |
| 8 | Claude Code rewrite resilience | re-serialize `~/.claude.json` with different ordering/whitespace; `--root` detects no drift |
| 9 | Hand-managed sibling edit ignored | edit `mcpServers.context7`; `--root` succeeds and preserves it because only `mcpServers:notion` is owned |

The existing `scenarios-scope-isolation` test stays unchanged — it asserts project-scope writes don't touch home. After this work it still passes for the same reason (project branch is untouched).

---

## Risks and Mitigations

1. **Claude Code may strip unknown top-level keys when it rewrites `~/.claude.json` via its UI.** Mitigation: side-table drift state (Option A). The implementation does not depend on Claude Code preserving any drwn marker. Phase 7's drift smoke validates the read path even if Claude Code rewrites the file out-of-band.
2. **Race between `drwn write --root` and Claude Code's own write.** Mitigation: atomic writes in Phase 5; observable last-write-wins semantics. Document in the completion doc that operating both simultaneously may produce a drift error on the next `--root` invocation, recoverable with `--force`.
3. **Existing project-scope `fieldHashes: {}` callers regress when the return shape changes.** Mitigation: all call sites listed in sub-step 2a are updated in the same patch. Typecheck catches any miss.
4. **`drwn doctor` reports user-scope drift even when run from a project-scope cwd.** Today doctor's scope follows cwd. Phase 1 fixes the path for user-scope drift detection. If users find the auto-detection confusing, a follow-on `drwn doctor --root` flag is straightforward (~5 LOC, deferred).
5. **A user without machine defaults runs `drwn write --root` and gets surprising behavior.** With `defaults.mcpServers = []` (or absent), the active server set is empty. In the old whole-field model this would write `mcpServers: {}` and clear hand-added entries. In the per-server model, the command must distinguish "nothing has ever been owned" from "remove the last drwn-owned entry." Mitigation: warn-and-skip only when the active set is empty and there are no prior `mcpServers:<name>` hashes. If prior hashes exist, run the per-server merge with an empty desired set so the owned entries are pruned.
   ```ts
   // sync.ts user branch — before the merge
   const activeAtScope = Object.keys(servers).length;
   const priorOwnedServerCount = Object.keys(priorHashes).filter((key) => key.startsWith("mcpServers:")).length;
   if (activeAtScope === 0 && priorOwnedServerCount === 0) {
     result.warnings.push(
       "drwn write --root: no machine-default MCP servers configured. " +
       "Add servers with `drwn library defaults add mcp <name>` first. Skipping ~/.claude.json write.",
     );
     continue;
   }
   ```
6. **Backups proliferate.** `writeManagedFile` calls `backupExistingPath` on every write. At user scope, `~/.claude.json.bak`, `.bak.1`, `.bak.2`, ... will accumulate. Acceptable for v1; document a cleanup script in the completion doc, and consider in a future task whether to cap the backup chain at N (probably 3).

## Rollback Plan

If post-merge defects surface:

1. `git revert <merge commit>` — clean revert, all changes are additive.
2. Backup files (`~/.claude.json.bak*`) preserve the pre-`--root` state of any user-scope file `drwn write --root` modified. Recovery is `mv ~/.claude.json.bak ~/.claude.json` plus `rm ~/.agents/drwn/store/global-write-record.json` (or trim the `.claude.json` entry from `managedPaths`).
3. If a user is stuck mid-failure-mode, the temporary unblock remains hand-editing `~/.claude.json` directly — same as today.

## Open Questions

Carried verbatim from analysis 66 §Open Questions, recapped here for the implementer:

1. **Naming**: `--root` ships with `--user` as an alias per Phase 4. Final choice can be revisited based on user-feedback; both names are stable.
2. **Empty-defaults UX**: warn-and-skip vs warn-and-clear. This plan adopts warn-and-skip (Risk 5). Worth surfacing in the completion doc as a behavior commitment.
3. **`drwn doctor` scope auto-detection**: today doctor scopes its report to cwd. If users want to see user-scope drift from inside a project, a `drwn doctor --root` flag is a small follow-on. Not in scope for this task.
4. **Partial server-map ownership**: resolved in this plan as per-server ownership. The side-table records hashes using `mcpServers:<name>` keys. Drift detection applies only to previously drwn-owned server names; hand-managed siblings like `context7` are preserved and are not drift-checked.
5. **`writeManagedFile` atomicity**: Phase 5 makes it atomic across the board. If Phase 5 ships separately for risk-reduction, the user-scope work in Phases 1–4+6 still works correctly; atomicity becomes a safety upgrade rather than a correctness fix.
6. **Library defaults `next:` hint**: `drwn library defaults add/remove` could print a `"next": ["drwn write --root"]` JSON hint to remind users to materialize. Small UX win, ~10 LOC, deferred to a future polish pass.
7. **Discovery without explicit `--root`**: `drwn write` from a directory with no project ancestor still routes to machine scope automatically (the existing `findProjectConfig` returns null behavior). Verify no regression in Phase 6 test #5 ("project unaffected") which by exclusion confirms that the auto-detection path is unchanged.

---

## Appendix A — Full file change list (with LOC estimates)

| File | LOC | Phase | What changes |
| --- | --- | --- | --- |
| `cli/core/types.ts` | +2 | 1, 3 | Add `TargetConfig.userMcpPath?: string`; add `SyncOptions.forceMachineScope?: boolean` |
| `registry/config.json` | +1 | 1 | Add `targets.claude.userMcpPath: "~/.claude.json"` |
| `cli/core/mcp.ts` | +75 / -10 | 2 | `mergeClaudeSettingsText` returns `{ text, fieldHashes }`; supports `inlineMeta: false`, `mcpServerOwnership: "per-server"`, `mcpServerOwnership: "none"`, `priorFieldHashes`; cleans up stale `_drwn` at user scope |
| `cli/core/sync.ts` | +50 / -10 | 2, 3 | Pass `previousRecord` into `syncMcp`; rewrite Claude user-branch to use new renderer return; populate per-server `fieldHashes` in `managedPaths.push`; add managed-fields cleanup and empty-defaults warn-and-skip |
| `cli/core/effective-state.ts` | +3 | 3 | Honor `options.forceMachineScope` when computing `projectConfigPath` |
| `cli/core/diagnostics.ts` | +12 / -2 | 1 | Use `userMcpPath` and global write-record per-server hashes for machine-scope Claude drift checks |
| `cli/core/hook-generator/sync-hooks.ts` | +6 / -2 | 3 | Use `mcpServerOwnership: "none"` for machine-scope Claude hook settings writes |
| `cli/commands/write.ts` | +10 | 4 | `--root` and `--user` flags; thread `forceMachineScope` |
| `cli/core/managed-file.ts` | +25 / -3 | 5 | Atomic write via `tmp+fsync+rename+dir-fsync` |
| `test/helpers.ts` | +10 | 6 | Surface `claudeUserMcp` from fixture; allow `userMcpPath` in `createFixtureConfig` |
| `test/scenarios-root-scope.test.ts` | +230 | 6 | NEW: 9 scenarios |
| `test/core-mcp-merge-hooks.test.ts` | +10 / -5 | 2 | Destructure new `{ text, fieldHashes }` return shape |
| `.ai/tasks/49_completion_drwn-write-root.md` | +120 | 8 | Completion doc |
| **Total production** | **~300 LOC net add** | | |
| **Total test code** | **~240 LOC net add** | | |

## Appendix B — Smoke session log template (for completion doc)

```
$ cd /tmp
$ claude mcp get notion
No MCP server found with name: "notion". Configured servers: ...

$ drwn library defaults list --json
{ "skills": [], "mcpServers": ["notion"], "extensions": [] }

$ drwn write --root --dry-run --json
{
  "changes": [
    "write /Users/pureicis/.claude.json",
    "write /Users/pureicis/.codex/config.toml",
    "write /Users/pureicis/.agents/drwn/store/generated/cursor-mcp.json",
    "symlink /Users/pureicis/.cursor/mcp.json -> /Users/pureicis/.agents/drwn/store/generated/cursor-mcp.json"
  ],
  "warnings": [],
  ...
}

$ drwn write --root --json
{
  "changes": [...],
  "warnings": [],
  "managedPaths": [
    {
      "path": ".claude.json",
      "kind": "managed-fields",
      "fields": ["mcpServers:notion"],
      "fieldHashes": { "mcpServers:notion": "sha256-..." }
    },
    ...
  ]
}

$ jq '.mcpServers.notion' ~/.claude.json
{
  "type": "http",
  "url": "https://mcp.notion.com/mcp"
}

$ # Cold-restart Claude Code from /tmp.
$ claude mcp get notion
notion:
  Scope: User config
  Status: ! Needs authentication
  Type: http
  URL: https://mcp.notion.com/mcp

$ # /mcp → notion → browser OAuth complete

$ claude mcp get notion
notion:
  Scope: User config
  Status: ✓ Connected
  Type: http
  URL: https://mcp.notion.com/mcp
```

## Appendix C — Helper diff sketch (for Phase 6a)

The minimum diff to `test/helpers.ts` so the new test file compiles:

```diff
 export function createFixtureConfig(
-  paths: { claudeSettings: string; codexConfig: string; cursorConfig: string },
+  paths: { claudeSettings: string; codexConfig: string; cursorConfig: string; claudeUserMcp?: string },
   parallelMcpEnabled = false,
 ): CanonicalConfig {
   return {
     version: 1,
     targets: {
-      claude: { enabled: true, configPath: paths.claudeSettings, format: "json-merge", mcpKey: "mcpServers" },
+      claude: {
+        enabled: true,
+        configPath: paths.claudeSettings,
+        ...(paths.claudeUserMcp ? { userMcpPath: paths.claudeUserMcp } : {}),
+        format: "json-merge",
+        mcpKey: "mcpServers",
+      },
       codex: { enabled: true, configPath: paths.codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
       cursor: { enabled: true, configPath: paths.cursorConfig, format: "json-standalone", mcpKey: "mcpServers", symlink: true },
     },
     ...
   };
 }

 export async function scaffoldCliFixture(options?: { /* unchanged */ }) {
   // ...existing setup
+  const claudeUserMcp = join(homeDir, ".claude.json");
+  await writeFile(claudeUserMcp, JSON.stringify({ numStartups: 1 }, null, 2));
   await writeFile(
     join(repoRoot, "registry", "config.json"),
     JSON.stringify(
-      createFixtureConfig({ claudeSettings, codexConfig, cursorConfig }, options?.parallelMcpEnabled ?? false),
+      createFixtureConfig({ claudeSettings, codexConfig, cursorConfig, claudeUserMcp }, options?.parallelMcpEnabled ?? false),
       null,
       2,
     ),
   );
   // ...rest unchanged
-  return { root, repoRoot, homeDir, agentsDir, claudeSettings, codexConfig, cursorConfig };
+  return { root, repoRoot, homeDir, agentsDir, claudeSettings, codexConfig, cursorConfig, claudeUserMcp };
 }
```

## Appendix D — Per-server ownership example

The user-scope merge must preserve non-owned siblings while checking and updating only owned server entries:

```ts
const priorHashes = {
  "mcpServers:notion": "sha256-previous-notion",
};

const before = {
  numStartups: 482,
  mcpServers: {
    context7: { type: "http", url: "https://mcp.context7.com/mcp" },
    notion: { type: "http", url: "https://mcp.notion.com/mcp" },
  },
};

const merge = mergeClaudeSettingsText(JSON.stringify(before), {}, {
  inlineMeta: false,
  mcpServerOwnership: "per-server",
  priorFieldHashes: priorHashes,
});

// Result:
// - before.mcpServers.notion is deleted because it was drwn-owned and no longer desired.
// - before.mcpServers.context7 is preserved because it has no side-table hash.
// - merge.fieldHashes is empty, so the next write record no longer includes .claude.json ownership.
```

## Appendix E — Manual cleanup commands for accumulated backups

If `~/.claude.json.bak*` grows large during development:

```bash
ls -la ~/.claude.json.bak* 2>/dev/null   # inspect first
# Trim all but the most recent two backups:
ls -t ~/.claude.json.bak* 2>/dev/null | tail -n +3 | xargs -r rm
```

Document this in the completion doc as a known operational quirk pending Risk 6's deferred fix.
