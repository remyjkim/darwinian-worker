# Task 43: Make `drwn library defaults add/remove` Non-Destructive + Self-Healing Empty-Array Semantics

**Status**: Planning
**Created**: 2026-06-11
**Updated**: 2026-06-11
**Priority**: Medium-High (real data-integrity bug; misleading success message)
**Dependencies**: None (works against current `main`)
**References**: [GitHub issue remyjkim/darwinian-harness#11, cli/commands/library/defaults/add-mcp.ts, cli/commands/library/defaults/remove-mcp.ts, cli/commands/library/defaults/add-skill.ts, cli/commands/library/defaults/remove-skill.ts, cli/core/defaults.ts, cli/core/mcp.ts, cli/core/effective-state.ts, cli/core/diagnostics.ts, cli/core/user-config.ts, test/commands-library-defaults.test.ts]

---

## Objective

When `~/.agents/drwn/machine.json` exists but contains no `defaults.mcpServers` field — the common case for users running the packaged defaults — `drwn library defaults add mcp <name>` produces `defaults.mcpServers: ["<name>"]` (a single-element array) rather than appending to the user's currently-effective default set. Because every truthy-check site in the codebase (`if (config.defaults?.mcpServers) { ...explicit allowlist... }`) treats *any* defined value (including `[]`) as an explicit override, that one-element array now demotes every previously-active MCP out of the user's active set.

The same defect exists in `remove-mcp`, `add-skill`, and `remove-skill`. The truthy-check pattern is spread across six call sites in `cli/core/`, so even a user whose `defaults.mcpServers` got reset to `[]` (e.g. via an undo flow) silently loses every MCP.

Goal state, in two parts:

1. **Forward fix (commands):** A first add/remove against an uninitialized list seeds the list with the user's currently-effective default set (what `resolveDefaultMcpNames` / `resolveDefaultSkillNames` would return with no override), *then* mutates. Active set after one add equals previous-active + new entry.
2. **Self-healing semantic (γ):** Empty array (`[]`) is treated the same as `undefined` — "I haven't customized; use the resolved defaults." Encapsulated as `hasExplicitMcpDefaults(config)` and `hasExplicitSkillDefaults(config)` predicates, applied at every call site that branches on "is this explicit". Users already in the broken empty-array state self-heal on their next `drwn write`. Users whose `defaults.mcpServers` was truncated to a single non-empty entry stay in that state but can clear the field (or empty it to `[]`) to recover.

## Success Criteria

- [ ] `drwn library defaults add mcp <name>` from a `machine.json` with no `defaults.mcpServers` produces a `defaults.mcpServers` array equal to `resolveDefaultMcpNames(repoConfig, registry)` plus `<name>` (in order: resolved set first, new entry appended last; deduplicated).
- [ ] `drwn library defaults add mcp <name>` from a `machine.json` with `defaults.mcpServers: []` behaves the same as the previous case (seed-then-append).
- [ ] `drwn library defaults add mcp <name>` from a `machine.json` with a non-empty `defaults.mcpServers` array appends `<name>` to that array if not present, otherwise no-ops.
- [ ] `drwn library defaults remove mcp <name>` follows the same seed-when-uninitialized pattern.
- [ ] Same semantics applied to `add-skill` and `remove-skill` via `resolveDefaultSkillNames` + curated-skills initialization.
- [ ] A machine.json with `defaults.mcpServers: []` (no commands run since) produces the same `buildActiveServers` result as a machine.json without the `defaults.mcpServers` field at all. Verified by direct unit test of `buildActiveServers` and an end-to-end test of `drwn write --mcp-only --dry-run`.
- [ ] Same self-healing applied to `defaults.skills: []`. Skill sync produces the same selection as if the field were absent.
- [ ] Existing tests in `test/commands-library-defaults.test.ts` stay green. New tests cover the previously-undefined and explicitly-empty cases.
- [ ] `bun test` clean. `bun run typecheck` clean. No new npm dependencies.

## Strategy

Two viable strategies were considered:

**Strategy A — Initialize before mutate, at the command layer (forward fix).** In each of the four library-defaults commands, after loading the user config, seed `defaults.mcpServers` (or `defaults.skills`) from the resolved set if currently uninitialized. Then call `addDefaultValue` / `removeDefaultValue` as today.

- **Pros:** Smallest possible change. No behavior change for users with an explicit list.
- **Cons:** Doesn't help users *already* in the broken state. A doctor warning or reset command would be needed to give them an escape hatch.

**Strategy B — Change `buildActiveServers` to additive semantics for `defaults.mcpServers`.** Reinterpret the list as additive overrides on top of the optional-filter, never as a replacement allowlist.

- **Pros:** Eliminates the destructive-replace category entirely.
- **Cons:** Breaking change for users who today rely on the allowlist semantic (e.g., scripted setups that pin the active set to a specific list). Changes a stable config contract.

**Decision: Strategy A + γ.** A as the forward fix; γ — treat empty array as "no override" — as the self-heal for users already affected. Together they're additive and stable:

- A user who never customized: gets the resolved defaults, unchanged.
- A user with a deliberate explicit list: gets exactly their list, unchanged.
- A user who triggered the bug and ended up with `[]`: silently recovers on the next `drwn write`.
- A user who triggered the bug and ended up with `["<name>"]`: still gets only `<name>`, but can clear/empty the field to recover. The doctor and the help text point at this recovery.
- Future add/remove against any of these states behaves as the user expects (append/remove).

γ is a single-semantic shift: `defaults.mcpServers` is "explicit" iff it is a non-empty array. Encoded once as a predicate, applied at every branch. No new CLI surface, no migration, no reset command.

## Architecture

```
Predicate (new, in cli/core/defaults.ts):
  hasExplicitMcpDefaults(config) = (config.defaults?.mcpServers?.length ?? 0) > 0
  hasExplicitSkillDefaults(config) = (config.defaults?.skills?.length ?? 0) > 0

Six existing truthy-check sites refactored to use the predicates:
  1. cli/core/defaults.ts:15  resolveDefaultMcpNames
  2. cli/core/defaults.ts:33  applyMcpDefaultsToConfig
  3. cli/core/mcp.ts:9        buildActiveServers          ← the primary symptom
  4. cli/core/effective-state.ts:57  skillSelection
  5. cli/core/diagnostics.ts:523     defaultSkillOverrides
  6. cli/core/user-config.ts:45-46   initializeUserConfigFromPackagedDefaults (skills + mcpServers fall-throughs)

Forward fix (new helpers, in cli/core/defaults.ts):
  ensureMcpDefaultsInitialized(config, registry):
    if !hasExplicitMcpDefaults(config):
      config.defaults.mcpServers = resolveDefaultMcpNames(config, registry)
  ensureSkillDefaultsInitialized(config, curatedNames):
    if !hasExplicitSkillDefaults(config):
      config.defaults.skills = [...curatedNames]

Four command sites call the appropriate ensure-helper before mutating:
  cli/commands/library/defaults/add-mcp.ts
  cli/commands/library/defaults/remove-mcp.ts
  cli/commands/library/defaults/add-skill.ts
  cli/commands/library/defaults/remove-skill.ts
```

The `ensureXxxDefaultsInitialized` helpers are written to be consistent with γ: they use `hasExplicitXxxDefaults` so that a `[]` is treated the same as `undefined` — both paths re-seed from the resolved set.

## Implementation Plan

### Phase 0: Failing tests

#### Task 0.1: Destructive-add baseline
- In `test/commands-library-defaults.test.ts`, add `"adding an MCP to an uninitialized machine.json preserves the resolved defaults"`:
  1. Boot a fixture with packaged registry (`context7`, `chrome-devtools`, `notion` as resolved built-in defaults; `slack`, `markdownify` as opt-out optional) and `machine.json: {version:1, optional:{}, authoring:{scope:"@test"}}` (no `defaults`).
  2. Run `drwn library defaults add mcp slack`.
  3. Assert `JSON.parse(machine.json).defaults.mcpServers.sort()` equals `["chrome-devtools", "context7", "notion", "slack"]`.

#### Task 0.2: γ — empty array fallback
- In `test/core-mcp.test.ts` (or wherever `buildActiveServers` tests live; create new file if none), add `"buildActiveServers treats defaults.mcpServers as no-override when empty"`:
  1. Build a config with `defaults.mcpServers: []`, packaged optional flags.
  2. Call `buildActiveServers(registry, config)`.
  3. Assert the result equals what `buildActiveServers` produces against the same config with `defaults.mcpServers` deleted.

#### Task 0.3: γ via the CLI surface (regression-flavor)
- In `test/commands-write.test.ts` (or a new fixture test), add `"drwn write with defaults.mcpServers: [] uses the resolved defaults"`. Fixture: same as 0.2 but driven via `runAgentsCli(["write", "--mcp-only", "--dry-run", "--json"], env)`. Parse the JSON and assert the planned active set includes the resolved defaults.

#### Task 0.4: Skills counterparts
- `"adding a skill to an uninitialized machine.json preserves curated defaults"` and `"skill sync with defaults.skills: [] uses curated defaults"`. Two analogs of 0.1 and 0.2 for skills.

#### Task 0.5: No-regression lock-in
- Re-confirm the existing test `"adds and removes a built-in MCP global default"` (test/commands-library-defaults.test.ts:82-95) stays green after Phases 1–3. Its fixture starts with an explicit non-empty defaults list, which is the user-customized path the fix preserves.

All Phase-0 tests fail against `main` (or pass for trivially-unrelated reasons). Phase-1–3 work makes them green.

### Phase 1: Predicates and ensure-helpers in `cli/core/defaults.ts`

#### Task 1.1: Predicates

```typescript
export function hasExplicitMcpDefaults(config: CanonicalConfig): boolean {
  return (config.defaults?.mcpServers?.length ?? 0) > 0;
}

export function hasExplicitSkillDefaults(config: CanonicalConfig): boolean {
  return (config.defaults?.skills?.length ?? 0) > 0;
}
```

#### Task 1.2: Ensure-helpers

```typescript
export function ensureMcpDefaultsInitialized(
  config: CanonicalConfig,
  registry: CanonicalRegistry,
): string[] {
  config.defaults ??= {};
  if (!hasExplicitMcpDefaults(config)) {
    config.defaults.mcpServers = resolveDefaultMcpNames(config, registry);
  }
  return config.defaults.mcpServers!;
}

export function ensureSkillDefaultsInitialized(
  config: CanonicalConfig,
  curatedSkillNames: string[],
): string[] {
  config.defaults ??= {};
  if (!hasExplicitSkillDefaults(config)) {
    config.defaults.skills = [...curatedSkillNames];
  }
  return config.defaults.skills!;
}
```

#### Task 1.3: Unit tests
- `test/defaults-init.test.ts` (new):
  - `"hasExplicitMcpDefaults returns false for undefined / null / empty"` — three cases, all false.
  - `"hasExplicitMcpDefaults returns true for non-empty array"` — `["slack"]` → true.
  - `"ensureMcpDefaultsInitialized seeds from resolveDefaultMcpNames when undefined"` — seeded list matches resolver output.
  - `"ensureMcpDefaultsInitialized seeds from resolveDefaultMcpNames when empty"` — same outcome from `[]`.
  - `"ensureMcpDefaultsInitialized is a no-op when defaults.mcpServers is non-empty"` — `["foo"]` stays `["foo"]`.
  - `"ensureMcpDefaultsInitialized respects config.optional overrides"` — when `optional.notion: false`, seeded list excludes notion.
  - Three parallel cases for skill counterparts.

### Phase 2: γ — refactor the six truthy-check sites

#### Task 2.1: `cli/core/mcp.ts:9` — `buildActiveServers`

Current:
```typescript
if (config.defaults?.mcpServers) {
  const defaults = new Set(config.defaults.mcpServers);
  return Object.fromEntries(
    Object.entries(registry.servers).filter(([name, server]) =>
      defaults.has(name) && server.transport !== "platform-provided"
    ),
  );
}
```

After:
```typescript
if (hasExplicitMcpDefaults(config)) {
  const defaults = new Set(config.defaults!.mcpServers!);
  return Object.fromEntries(
    Object.entries(registry.servers).filter(([name, server]) =>
      defaults.has(name) && server.transport !== "platform-provided"
    ),
  );
}
```

Import `hasExplicitMcpDefaults` from `./defaults`.

#### Task 2.2: `cli/core/defaults.ts:15` — `resolveDefaultMcpNames`

Current:
```typescript
if (config.defaults?.mcpServers) {
  return [...config.defaults.mcpServers];
}
```

After:
```typescript
if (hasExplicitMcpDefaults(config)) {
  return [...config.defaults!.mcpServers!];
}
```

#### Task 2.3: `cli/core/defaults.ts:33` — `applyMcpDefaultsToConfig`

Current:
```typescript
if (!config.defaults?.mcpServers) {
  return config;
}
```

After:
```typescript
if (!hasExplicitMcpDefaults(config)) {
  return config;
}
```

#### Task 2.4: `cli/core/effective-state.ts:57` — skill selection

Current:
```typescript
let skillSelection: SkillSyncOverrides | undefined = baseConfig.defaults?.skills
  ? { include: [...baseConfig.defaults.skills] }
  : undefined;
```

After:
```typescript
let skillSelection: SkillSyncOverrides | undefined = hasExplicitSkillDefaults(baseConfig)
  ? { include: [...baseConfig.defaults!.skills!] }
  : undefined;
```

#### Task 2.5: `cli/core/diagnostics.ts:523`

Current:
```typescript
const defaultSkillOverrides = config.defaults?.skills ? { include: config.defaults.skills } : undefined;
```

After:
```typescript
const defaultSkillOverrides = hasExplicitSkillDefaults(config) ? { include: config.defaults!.skills! } : undefined;
```

#### Task 2.6: `cli/core/user-config.ts:45-46` — `initializeUserConfigFromPackagedDefaults`

This site uses `??` (nullish coalescing), which already treats `null`/`undefined` correctly but lets an empty array through unchanged. For γ-consistency:

Current:
```typescript
next.defaults = {
  ...(next.defaults ?? {}),
  skills: next.defaults?.skills ?? curated.map((skill) => skill.name),
  mcpServers: next.defaults?.mcpServers ?? resolveDefaultMcpNames(packagedConfig, registry),
  extensions: next.defaults?.extensions ?? {},
};
```

After:
```typescript
next.defaults = {
  ...(next.defaults ?? {}),
  skills: hasExplicitSkillDefaults(next) ? next.defaults!.skills! : curated.map((skill) => skill.name),
  mcpServers: hasExplicitMcpDefaults(next) ? next.defaults!.mcpServers! : resolveDefaultMcpNames(packagedConfig, registry),
  extensions: next.defaults?.extensions ?? {},
};
```

#### Task 2.7: Lint sweep
- Grep for any remaining `defaults?.mcpServers` and `defaults?.skills` truthy-checks in `cli/`. Anything that still uses raw truthy-on-array should either move to the predicate or use `?? []` / `?? 0` if the consumer is genuinely undefined-tolerant (count/spread/iterate).

### Phase 3: Wire `ensureXxxDefaultsInitialized` into the four commands

#### Task 3.1: `add-mcp.ts` and `remove-mcp.ts`
- Insert `ensureMcpDefaultsInitialized(config, registry)` immediately after the `loadOrInitializeUserConfig` call. Replace `config.defaults ??= {};` (now redundant — the helper does it).
- Use the helper's return value to drop the `!` non-null asserts on the subsequent `addDefaultValue` / `removeDefaultValue` call.

#### Task 3.2: `add-skill.ts` and `remove-skill.ts`
- Same pattern with `ensureSkillDefaultsInitialized(config, curatedSkillNames)`.
- Source of `curatedSkillNames`: reuse `listCuratedSkills(agentsDir)` (already called inside `initializeUserConfigFromPackagedDefaults`).

### Phase 4: Integration tests

#### Task 4.1: End-to-end active-set assertion (MCP)
- New `test/library-defaults-active-set.test.ts`:

```typescript
test("library defaults add mcp preserves the previously-active set", async () => {
  // Setup: packaged registry resolves to [context7, chrome-devtools, notion] as defaults.
  // machine.json has no defaults.mcpServers.
  const before = await snapshotActiveServers(env);
  expect(Object.keys(before).sort()).toEqual(["chrome-devtools", "context7", "notion"]);

  await runAgentsCli(["library", "defaults", "add", "mcp", "slack"], env);

  const after = await snapshotActiveServers(env);
  expect(Object.keys(after).sort()).toEqual(["chrome-devtools", "context7", "notion", "slack"]);
});

test("machine.json with defaults.mcpServers: [] resolves to built-in defaults", async () => {
  // Setup: machine.json contains defaults.mcpServers: []
  const active = await snapshotActiveServers(env);
  expect(Object.keys(active).sort()).toEqual(["chrome-devtools", "context7", "notion"]);
});
```

`snapshotActiveServers(env)` is a small helper that invokes `buildEffectiveState` (or `drwn write --json --dry-run` for full end-to-end).

#### Task 4.2: Skills counterpart
- Same shape, against skill defaults: pre-condition no `defaults.skills`, run `drwn library defaults add skill <name>`, assert post-condition matches `curated ∪ {<name>}`.

### Phase 5: Documentation

#### Task 5.1: CLI help text
- `drwn library defaults add mcp` details: append "On first use against a `machine.json` without an explicit non-empty `defaults.mcpServers` list, the list is seeded with the currently-resolved built-in defaults before appending."
- Same line on `add-skill`, `remove-mcp`, `remove-skill`.

#### Task 5.2: README / docs site
- Short subsection under "Machine-wide defaults": describe the predicate semantics. An empty array means "no override"; a non-empty array means "explicit allowlist". The phrasing makes it discoverable that clearing the array is a valid recovery action.

#### Task 5.3: Issue cross-link
- Update GitHub issue #11 body once this lands to reference this plan and the merge commit.

## Verification

- `bun test` clean.
- `bun run typecheck` clean.
- Manual smoke against a fresh `~/.agents/drwn/machine.json` (back it up first):
  1. Current state (existing affected case): `{version:1, optional:{}, authoring:{...}, defaults:{mcpServers:[]}}`.
  2. `drwn write --mcp-only --dry-run` → planned active MCP set should include `context7`, `chrome-devtools`, `notion` (was the broken state demoted them to none).
  3. `drwn library defaults add mcp slack` → `machine.json:defaults.mcpServers` should now be `["context7", "chrome-devtools", "notion", "slack"]`.
  4. `drwn library defaults list` → matches.
  5. Set `defaults.mcpServers` back to `[]` with `jq` and rerun step 2 — same self-heal outcome.

## Risks / Open Questions

- **Users with a single-element truncated `defaults.mcpServers` (e.g., `["slack"]`) don't auto-heal.** γ can't distinguish "user intentionally pinned to slack" from "user got truncated to slack". Documented recovery path (5.2) is to either clear the field or empty it to `[]`, which γ then heals. If issue #11 attracts complaints from such users, add a `drwn library defaults reset mcp` subcommand in a follow-up.
- **Semantic shift for `defaults.mcpServers: []`.** Before this change, empty array meant "active set is empty." After, it means "no override." A user who genuinely wants zero MCPs active today would express that as `optional.<name>: false` for every server (or disable the targets entirely). Worth a sentence in the docs.
- **Six refactor sites are all in `cli/core/`** — no command-layer code outside the four library-defaults files needs to change. Lint sweep (Task 2.7) is meant to catch any miss.
- **Skill `optional` filter.** Skills don't have a `config.optional[name]` analog the way MCPs do — `resolveDefaultSkillNames` just returns `config.defaults?.skills ?? []`. So `ensureSkillDefaultsInitialized` falls back to `listCuratedSkills(agentsDir)`, which is the same data source `initializeUserConfigFromPackagedDefaults` uses. Consistent, but worth verifying the helper signature lines up with the existing call site.

## Completion Criteria

- All Success Criteria checkboxes ticked.
- Phases 0–4 tests green; Phase 5 docs updated.
- A completion summary written at `43_completion_drwn-library-defaults-append-semantics.md` recording the verified manual smoke walkthrough and final commit hash.
