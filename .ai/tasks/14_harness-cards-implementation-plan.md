# Task 14: Harness Cards Implementation

**Status**: Ready for M0 baseline-sync PR
**Created**: 2026-05-20
**Updated**: 2026-05-20
**Assigned**: Remy + Claude
**Priority**: High
**Estimated Effort**: 8 milestones, expected 3–6 PRs across roughly 4–8 weeks of focused work
**Dependencies**: `.ai/analyses/29_harness-cards-target-architecture-v1_1.md` finalized
**References**: [analyses/29_harness-cards-target-architecture-v1_1.md, analyses/30_bgng-cli-usage-guide-cards-v1.md, analyses/28_harness-cards-architecture-assessment.md, analyses/27_cli_help_gap_analysis.md, analyses/26_harness-cards-target-architecture.md, tasks/15_harness-cards-execution-handoff.md, tasks/16_harness-cards-phase-m0-m1-foundation-handoff.md, tasks/17_harness-cards-phase-m2-m3-materialization-safety-handoff.md, tasks/18_harness-cards-phase-m4-m5-card-lifecycle-handoff.md, tasks/19_harness-cards-phase-m6-m7-scope-diagnostics-handoff.md, knowledges/02_per-project-config-guide.md, knowledges/03_npm-skill-bundles-guide.md, cli/index.ts, cli/context.ts, cli/commands/base.ts, cli/core/paths.ts, cli/core/sync.ts, cli/core/skills.ts, cli/core/mcp.ts, cli/core/project.ts, cli/core/diagnostics.ts, cli/core/types.ts, test/helpers.ts]

---

## Objective

Implement Harness Cards in the `bgng` CLI per `29_harness-cards-target-architecture-v1_1.md`: named, semver-versioned, reusable bundles of harness intent (skills, MCP servers, extensions, targets) that a project can pin to, with project-local materialization, write-record-backed drift detection and safe cleanup, and a `bgng card` / `bgng store` CLI surface.

The implementation is split into eight sequenced milestones (M0–M7); each maps to a PR-able unit of work, with explicit dependencies, code scaffoldings, and TDD entry points.

---

## Goal State

The end state matches the v1.1 architecture document. In summary:

- **Store**: `~/.agents/bgng/` houses `store.json`, `machine.json`, `cards/`, `sources/`, `skills/` (renamed from `~/.agents/packages/skills/`), `mcp-servers/<id>.json` (exploded from the single-file `~/.agents/library/mcp-servers.json`), `generated/`, `cache/`.
- **Project files**: `<project>/.agents/bgng/config.json` gains a `cards: []` field; `card.lock` (git-tracked) and `write-record.json` (gitignored) live alongside it.
- **Materialization**: project-local for project-configured directories (`<project>/.claude/`, `<project>/.codex/`, `<project>/.cursor/`); machine-scope for runs outside any project.
- **Three mechanisms**: directory symlinks (skills); `_bgng` meta-block + managed-key/section hashing (Claude `settings.json`, Codex `config.toml`); generated-file-plus-symlink preserved (Cursor `.cursor/mcp.json`).
- **Drift handling**: `bgng write` refuses on managed-region hand-edits; `--force` overwrites.
- **Cleanup**: write-record-backed safe removal of orphans.
- **CLI surface**: 13 `bgng card` subcommands, 2–6 `bgng store` subcommands (v1 = 2), 2 top-level aliases (`bgng apply`, `bgng update`), 1 renamed extension command (`bgng extensions add`).
- **MCP server resolution**: three-layer (card-inline > user library > packaged baseline); no `mcpBundles` field in v1.
- **Bundle conflicts**: intersect-and-pick-highest; fail loudly on empty intersection.

---

## Success Criteria

A PR for the final milestone (M7) is mergeable when every checkbox is true:

- [ ] All 8 milestones (M0–M7) merged, in sequence, each behind its own PR with passing tests and type-check.
- [ ] `bun test` passes; `tsc --noEmit` passes; `bun run scripts/verify-release-readiness.ts` passes.
- [ ] The full `bgng card` and `bgng store` command surfaces from v1.1 §6.3, §6.4 are registered and exercised by integration tests.
- [ ] Project-local materialization (v1.1 §8.3, §14.2 item 1) works end-to-end: `bgng write` inside a project writes to `<project>/.claude/skills/`, etc.; outside any project writes to `~/.claude/skills/`, etc.
- [ ] Drift detection (v1.1 §8.4) refuses managed-region hand-edits without `--force` and overwrites with it.
- [ ] Write-record (v1.1 §5.1) is created, updated atomically, validated by `bgng doctor`, and falls back safely when missing/corrupt.
- [ ] Migration command (v1.1 §4.5.2): a fresh fixture of the pre-cards layout becomes a valid post-cards layout byte-for-byte against an expected snapshot.
- [ ] Bundle conflict (v1.1 §7.7): tested for overlapping ranges resolving to highest, disjoint ranges failing with the prescribed error message.
- [ ] MCP server resolution (v1.1 §5.2.1): tested for all three layers and project overlay.
- [ ] Idempotency invariant (v1.1 §8.7, §11.4): `bgng write` twice in a row produces zero `result.changes` on the second call, for at least five fixture variants.
- [ ] Existing test suites continue to pass with no test deleted. New tests cover every new command, every new schema, every new mechanism.
- [ ] CLI help (per `27_cli_help_gap_analysis.md` recommendations) populates `usage.details` and `usage.examples` on `init`, `extensions add`, and every new `card`/`store` command.
- [ ] `27_cli_help_gap_analysis.md` orphan-flag bug fixed; `skills curate` / `skills uncurate` gain `--json`.
- [ ] `bgng extensions add <name>` replaces `bgng add extension <name>` with integration tests proving the new path works and the old path fails with a clear unknown-command error.
- [ ] `26_harness-cards-target-architecture.md` archived to `analyses/26_archive/` per `.ai/rules/00_docs_usage.md`; v1.1 doc status = Final.
- [ ] `02_per-project-config-guide.md` updated to reflect cards + project-local materialization + the verified Claude Code / Codex / Cursor read semantics (v1.1 §12 question 1).

---

## Approach Summary

The plan is **strictly sequential**: each milestone depends on prior milestones and is shipped behind a single PR with a complete test suite. No milestone is started before its dependency lands.

This document remains the canonical implementation plan. For execution handoff, use the smaller phase documents created after the readiness review:

- `15_harness-cards-execution-handoff.md` — readiness grade, missing detail register, execution order.
- `16_harness-cards-phase-m0-m1-foundation-handoff.md` — M0/M1 checklist and gates.
- `17_harness-cards-phase-m2-m3-materialization-safety-handoff.md` — M2/M3 checklist and gates.
- `18_harness-cards-phase-m4-m5-card-lifecycle-handoff.md` — M4/M5 checklist and gates.
- `19_harness-cards-phase-m6-m7-scope-diagnostics-handoff.md` — M6/M7 checklist and gates.

Each milestone follows the same internal cadence per `.ai/rules/02_tdd_practices.md`:

```text
1. Write the failing test(s) that pin the milestone's success criterion.
2. Run them; confirm failure.
3. Implement the smallest change that makes them pass.
4. Refactor if needed (tests stay green).
5. Add edge-case tests; iterate.
6. Type-check (`tsc --noEmit`), run full suite, write commit, open PR.
```

The plan is documented as eight phases below; within each phase, subtasks are checkboxes that map to the test-first sequence.

### Baseline notes from the readiness review

This revision assumes the current workspace already contains some M0 work:

- `search mcp --project` and `search skill --project` have been removed from the current command implementations.
- `skills curate --json` and `skills uncurate --json` exist and are covered by tests.
- Several existing commands already have `usage.details` and `usage.examples`.

M0 is therefore a **baseline-sync PR**, not a from-scratch cleanup PR. Its first job is to run the relevant tests and preserve the already-landed behavior, then finish the remaining CLI surface/document lifecycle work (`extensions add`, architecture archive, and reference cleanup).

---

## Strategic Alternatives Considered

Per `.ai/rules/06_task_planning.md`, this section names at least two solutions for each non-trivial strategic decision and records the chosen path with rationale.

### A1. Path resolver migration: incremental coexistence vs. clean replacement

- **(a) Two-PR coexistence:** Add new resolvers in `cli/core/store-paths.ts` (M1); deprecate old `cli/core/paths.ts` resolvers (M1); remove old resolvers at end of M2.
- **(b) Single-PR clean replacement:** Rewrite `cli/core/paths.ts` in M1; every caller updated in the same PR.

**Chosen: (a).** Cleaner staging for review; lets M1's `bgng store migrate` keep using old resolvers to read the legacy layout while building the new one. Old resolvers retire at end of M2 once write-record is established.

### A2. Write-record location: per-project + machine-wide vs. centralized index

- **(a) Per-project + machine-wide:** `<project>/.agents/bgng/write-record.json` for project scope; `~/.agents/bgng/global-write-record.json` for machine scope. (Matches v1.1 §5.1.)
- **(b) Centralized index:** `~/.agents/bgng/write-records/<sha256(project-root)>.json` for every project; single location for inspection.

**Chosen: (a).** Per-project files travel with the project (gitignored, but discoverable); centralized index hides state from users who'd reasonably expect to find it next to their project config.

### A3. Hash computation for managed fields: raw vs. canonical

- **(a) Raw:** Hash the serialized form of the managed key/section as written to disk.
- **(b) Canonical:** Hash a normalized form (sorted keys; consistent whitespace; canonical JSON / TOML).

**Chosen: (b).** Editor reformatting or formatter passes (Prettier, etc.) should not falsely report drift. Hashing a canonical form decouples drift detection from cosmetic formatting noise. Implementation uses a small `canonicalize` helper that sorts JSON keys recursively and re-stringifies; TOML uses `smol-toml`'s round-trip after a sort.

### A4. Card source publish mechanism: reuse `npm pack` vs. custom tar

- **(a) Reuse `npm pack`:** Same approach `cli/core/skill-packages.ts:124-186` uses for ingesting bundles.
- **(b) Custom tar:** Use a tar library directly.

**Chosen: (a).** Reuses validated infrastructure (`--ignore-scripts`, tarball→extract→validate pipeline). Cards become npm-packable by construction, which simplifies the eventual M5 `bgng card publish` to "build manifest, run `npm pack`, store the result."

### A5. Test isolation environment variable: existing `AGENTS_DIR` vs. new `BGNG_STORE_ROOT`

- **(a) Reuse `AGENTS_DIR`:** Already wired in `cli/context.ts:19-30` and `test/helpers.ts`; resolves to `~/.agents` by default; store lives at `<AGENTS_DIR>/bgng/`.
- **(b) Introduce `BGNG_STORE_ROOT`:** A rejected earlier architecture option; points directly at the store root.

**Chosen: (a).** The v1.1 architecture now standardizes on `AGENTS_DIR`; adding a second env var is redundant and creates two test-isolation conventions. All new store tests use `AGENTS_HOME_DIR` / `AGENTS_DIR` through `runAgentsCli()`.

### A6. Migration: explicit command-only vs. command + first-run auto

- **(a) Explicit command only:** `bgng store migrate` is the only path; pre-cards layout detected ⇒ warn-and-proceed-with-legacy.
- **(b) Command + first-run auto:** Auto-migrate on first invocation that detects legacy state, with confirmation prompt.

**Chosen: (a).** Matches v1.1 §4.5.1. Auto-migration adds surface area at the moment of least context (the user is trying to do something else). Explicit command is honest and matches the "clean cut" stance. Auto-migration can land in v1.5 if adoption data shows users delay running the command.

### A7. Command help (`details`/`examples`): retrofit all 30 commands vs. only new + 2 exemplars

- **(a) Retrofit all 30:** Populate `details`/`examples` on every existing command, alongside cards work.
- **(b) New + 2 exemplars:** Populate on every new `card`/`store` command, plus retrofit `init` and `extensions add` as the template.

**Chosen: (b).** Aligns with `27_cli_help_gap_analysis.md` recommendation 5.1 (high-leverage targets first). Establishes the template; remaining commands can be enriched in follow-up PRs without blocking cards. Adds a small `usage.details` style guide in the M0 PR description for future contributors.

### A8. MCP server definition precedence: preserve user overrides vs. card reproducibility

- **(a) Card-inline > user library > packaged baseline:** A card can ship an inline definition when it needs reproducibility; otherwise the user's migrated library keeps its current override behavior over the packaged baseline.
- **(b) Card-inline > packaged baseline > user library:** Card toggles prefer built-in definitions, making card behavior more consistent but breaking today's user-overrides-baseline semantics.

**Chosen: (a).** It matches the current `mergeUserMcpLibrary()` behavior (`registry` merged first, user library second) and the v1.1 merge stack (`built-in defaults -> user library -> cards -> project overlay`). Reproducible custom definitions are still available through card-inline `mcp-servers/<id>.json` files and project overlay full definitions.

### A9. M0 execution shape: from-scratch cleanup vs. baseline-sync

- **(a) From-scratch cleanup:** Start with failing tests for the orphan flag / `--json` / help-template issues exactly as the original draft specified.
- **(b) Baseline-sync:** Treat already-present M0 code changes as existing work, lock them with tests, and spend M0 on the missing rename/docs pieces.

**Chosen: (b).** The current workspace already passes the targeted M0 tests for search/init/skills mutation. Re-running the original RED steps would be dishonest and brittle. M0 now verifies the present behavior, adds the missing `extensions add` command surface, archives the superseded architecture doc, and records the command-help style guide.

---

## Implementation Plan

The eight phases below. Each phase has: **Goal**, **Subtasks** (checkboxes), **Code scaffolding** (concrete signatures and file paths), **Tests to add (TDD entry)**, and **Done definition**.

---

### Phase M0 — Baseline Sync + CLI Surface Cut

**Goal.** Lock the already-present CLI gap fixes, complete the `extensions add` clean cut, and finalize the architecture/document lifecycle. Nothing card-specific yet.

**Current baseline to preserve.**

- `cli/commands/search/mcp.ts` and `cli/commands/search/skill.ts` no longer define the removed `--project` flag.
- `cli/commands/skills/curate.ts` and `cli/commands/skills/uncurate.ts` already support `--json`.
- `cli/commands/init.ts` and several existing commands already populate `usage.details` / `usage.examples`.

**Subtasks.**

- [ ] **M0.1** Run the targeted baseline tests before editing: `bun test test/commands-search.test.ts test/commands-skills-mutate.test.ts test/commands-init.test.ts`. Expected: pass. If this fails, fix the regression before proceeding.
- [ ] **M0.2** Create `cli/commands/extensions/add.ts` as the canonical extension-add command. Move the behavior from `cli/commands/add/extension.ts` without changing payload shape.
- [ ] **M0.3** Update `cli/index.ts`: register `ExtensionsAddCommand`; stop registering `AddExtensionCommand`; remove the old import.
- [ ] **M0.4** Delete `cli/commands/add/extension.ts` after the new command path is tested. Update any tests/docs that still invoke `bgng add extension`.
- [ ] **M0.5** Add/adjust tests proving `bgng extensions add <name>` works, emits JSON, honors `--dry-run`, and that `bgng add extension <name>` is no longer registered.
- [ ] **M0.6** Archive `.ai/analyses/26_harness-cards-target-architecture.md` to `.ai/analyses/26_archive/26_harness-cards-target-architecture.md`.
- [ ] **M0.7** Keep `.ai/analyses/29_harness-cards-target-architecture-v1_1.md` as the Final architecture revision and remove stale references to the old v2 filename.
- [ ] **M0.8** Record the `usage.details` / `usage.examples` style guide in the PR description.

**Code scaffolding.**

```ts
// cli/commands/extensions/add.ts — canonical replacement for add/extension.ts
export class ExtensionsAddCommand extends BaseCommand {
  static override paths = [["extensions", "add"]];

  static override usage = BaseCommand.Usage({
    category: "Extensions",
    description: "Add an extension to the current project.",
    details: `
      Writes or merges the extension config into
      <project>/.agents/bgng/config.json without running external setup
      commands. Use bgng extensions setup <name> when an extension has CLI
      prerequisites or project initialization work.

      This replaces the pre-cards bgng add extension command.
    `,
    examples: [
      ["Enable Parallel in this project", "bgng extensions add parallel"],
      ["Enable Beads with its project skill", "bgng extensions add beads --include-skill"],
      ["Preview a MarkItDown project config change", "bgng extensions add markitdown --dry-run"],
    ],
  });

  // Keep the current AddExtensionCommand flags and execute() body exactly,
  // except for class name, examples, and command path.
}
```

```ts
// cli/index.ts
import { ExtensionsAddCommand } from "./commands/extensions/add";
// remove: import { AddExtensionCommand } from "./commands/add/extension";

cli.register(ExtensionsAddCommand);
// remove: cli.register(AddExtensionCommand);
```

**Tests to add/adjust (TDD entry).**

```ts
// test/commands-add-extension.test.ts or renamed test/commands-extensions-add.test.ts
test("extensions add writes project extension config", async () => {
  const result = await runAgentsCli(["extensions", "add", "parallel"], env, projectDir);
  expect(result.exitCode).toBe(0);
  const config = JSON.parse(await readFile(projectConfigPath, "utf8"));
  expect(config.extensions?.parallel).toEqual({ enabled: true, skills: true, mcp: false });
});

test("extensions add --json preserves the current payload contract", async () => {
  const result = await runAgentsCli(["extensions", "add", "parallel", "--json"], env, projectDir);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    kind: "extension",
    id: "parallel",
  });
});

test("add extension is not registered after the clean cut", async () => {
  const result = await runAgentsCli(["add", "extension", "parallel"], env, projectDir);
  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("Command not found");
});
```

**Done definition.**

- Targeted baseline test command from M0.1 passes before and after the rename work.
- `bgng extensions add` is registered and covered by integration tests.
- `bgng add extension` is unregistered and covered by a negative test.
- `bun test` green; `tsc --noEmit` green.
- v1.1 architecture doc status = Final; v1 draft archived.
- PR description includes the command-help style guide.

---

### Phase M1 — Store Schema + Path Resolvers + Migration

**Goal.** Introduce the new store layout, new path resolvers, and the `bgng store migrate` command. Old path resolvers remain functional for backward compatibility through end-of-M2.

**Subtasks.**

- [ ] **M1.1** Add `cli/core/store-paths.ts` with the new resolvers (see scaffolding).
- [ ] **M1.2** Add `cli/core/types.ts` types for `StoreMetadata`, `MachineConfig` (the rename target), and store migration results.
- [ ] **M1.3** Add `cli/core/migration.ts` with the §4.5.2 algorithm.
- [ ] **M1.4** Add `cli/commands/store/migrate.ts` and `cli/commands/store/status.ts`. Register both in `cli/index.ts`.
- [ ] **M1.5** Add legacy-layout warning at the start of every command run (via `createAgentsContext()` or a top-level hook in `cli/index.ts`).
- [ ] **M1.6** Extend `test/helpers.ts` with `scaffoldPreCardsFixture()` and `scaffoldPostCardsFixture()`.
- [ ] **M1.7** Add store-aware loaders with legacy fallback: `cli/core/user-config.ts` reads/writes `machine.json`; `cli/core/mcp-library.ts` reads/writes per-server files; `cli/core/skill-packages.ts` reads/writes under `~/.agents/bgng/skills/` while preserving the existing `current` symlink convention.
- [ ] **M1.8** Update existing commands that mutate machine defaults or libraries (`library defaults *`, `library add mcp`, `skills packages add/list/show`, `mcp list`, `write`, `status`, `doctor`) to use the store-aware loaders instead of direct legacy path helpers.
- [ ] **M1.9** Add regression tests proving the old layout still works while the legacy warning is present, and the new store layout works without the warning.

**Code scaffolding.**

```ts
// cli/core/store-paths.ts — new file

import { join } from "node:path";

// Store roots
export function resolveStoreRoot(agentsDir: string) {
  return join(agentsDir, "bgng");
}

export function resolveStoreMetadataPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "store.json");
}

export function resolveMachineConfigPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "machine.json");
}

// Cards
export function resolveCardsRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "cards");
}

export function resolveCardVersionDir(agentsDir: string, name: string, version: string) {
  return join(resolveCardsRoot(agentsDir), name, version);
}

// Sources
export function resolveSourcesRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "sources");
}

// Skills (renamed from packages/skills)
export function resolveStoreSkillsRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "skills");
}

// MCP servers (file-per-record)
export function resolveStoreMcpServersDir(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "mcp-servers");
}

export function resolveStoreMcpServerFile(agentsDir: string, serverId: string) {
  return join(resolveStoreMcpServersDir(agentsDir), `${serverId}.json`);
}

// Generated (move from agentsDir/generated to inside the store)
export function resolveStoreGeneratedDir(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "generated");
}

// Cache
export function resolveStoreCacheDir(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "cache");
}

// Write-records
export function resolveGlobalWriteRecordPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "global-write-record.json");
}

// Project-scope write-record helpers belong in a separate file (M2)
```

```ts
// cli/core/types.ts — append

export interface StoreMetadata {
  schemaVersion: 1;
  initAt: string;  // ISO-8601
}

// MachineConfig is the post-migration rename of today's CanonicalConfig as
// stored on disk. Keep the shape identical for v1; add fields later as needed.
export type MachineConfig = CanonicalConfig & {
  authoring?: {
    scope?: string;  // e.g., "@me" (v1.1 Open Question Q3 lean)
  };
};
```

```ts
// cli/core/migration.ts — new file (skeleton)

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rename, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import {
  resolveStoreRoot, resolveStoreMcpServersDir, resolveStoreSkillsRoot,
  resolveMachineConfigPath, resolveStoreMetadataPath,
  resolveStoreCacheDir, resolveCardsRoot, resolveSourcesRoot,
  resolveStoreGeneratedDir,
} from "./store-paths";
import { resolveLibraryDir, resolveSkillPackagesRoot, resolveUserConfigPath } from "./paths";

export interface MigrationOptions {
  agentsDir: string;
  cleanupLegacyOrphans?: boolean;
  yes?: boolean;
}

export interface MigrationResult {
  archivedTo: string;
  stagingPath: string;
  steps: string[];
  warnings: string[];
}

export function detectLegacyLayout(agentsDir: string): boolean {
  const hasLegacyConfig = existsSync(resolveUserConfigPath(agentsDir));
  const hasLegacyLibrary = existsSync(resolveLibraryDir(agentsDir));
  const hasLegacyPackages = existsSync(resolveSkillPackagesRoot(agentsDir));
  const hasStore = existsSync(resolveStoreMetadataPath(agentsDir));
  return (hasLegacyConfig || hasLegacyLibrary || hasLegacyPackages) && !hasStore;
}

export async function migrateStore(options: MigrationOptions): Promise<MigrationResult> {
  // Step 1: validate sources
  // Step 2: create staging directory
  // Step 3: build new layout in staging
  //   3a. copy config.json → staging/machine.json if it exists;
  //       otherwise initialize machine.json from packaged defaults
  //   3b. explode library/mcp-servers.json → staging/mcp-servers/<id>.json
  //   3c. move packages/skills/ → staging/skills/
  //   3d. write staging/store.json
  //   3e. mkdir staging/{cards,sources,cache,generated}
  // Step 4: validate staging
  // Step 5: move bgng/ → bgng.archive-<ts>/
  // Step 6: move library/, packages/ into archive
  // Step 7: rename staging → bgng/
  // Step 8: return result
  //
  // Each step throws on failure with a clear message; caller handles preservation.
  throw new Error("not implemented");
}

export async function cleanupLegacyOrphans(
  agentsDir: string,
  homeDir: string,
  archiveDir: string,
): Promise<{ removed: string[]; warnings: string[] }> {
  // Scan ~/.claude/skills/ and ~/.codex/skills/ for symlinks whose realpath
  // resolves into archiveDir or the new store. Prompt or auto-remove based
  // on options.yes.
  throw new Error("not implemented");
}
```

```ts
// cli/core/user-config.ts — M1 compatibility shape

export async function loadEffectiveMachineConfig(repoConfig: CanonicalConfig, agentsDir: string) {
  const machinePath = resolveMachineConfigPath(agentsDir);
  if (existsSync(machinePath)) {
    return { config: await loadUserConfig(machinePath), machineConfigPath: machinePath };
  }

  // M1-only legacy fallback. Delete this branch at the end of M2 after
  // migration has landed and callers have moved to store paths.
  const legacyPath = resolveUserConfigPath(agentsDir);
  if (existsSync(legacyPath)) {
    return { config: await loadUserConfig(legacyPath), machineConfigPath: legacyPath };
  }

  return { config: repoConfig, machineConfigPath: null };
}
```

```ts
// cli/core/mcp-library.ts — M1 compatibility shape

export async function loadStoreMcpLibrary(agentsDir: string): Promise<UserMcpLibrary> {
  const storeDir = resolveStoreMcpServersDir(agentsDir);
  if (existsSync(storeDir)) {
    const servers: Record<string, RegistryServer> = {};
    for (const entry of await readdir(storeDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = entry.name.slice(0, -".json".length);
      const server = JSON.parse(await readFile(join(storeDir, entry.name), "utf8"));
      validateMcpLibraryServer(id, server);
      servers[id] = server;
    }
    return { version: 1, servers };
  }

  // M1-only legacy fallback.
  return await loadMcpLibrary(agentsDir);
}
```

```ts
// cli/commands/store/migrate.ts — new file (skeleton)

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { migrateStore, cleanupLegacyOrphans, detectLegacyLayout } from "../../core/migration";

export class StoreMigrateCommand extends BaseCommand {
  static override paths = [["store", "migrate"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Migrate the pre-cards layout to the cards-era store.",
    details: `
      Detects the legacy layout (~/.agents/library/, ~/.agents/packages/skills/),
      builds the new layout in a staging directory, validates it, archives the
      old layout, and renames staging into place. Failure leaves recoverable state.
    `,
    examples: [
      ["Migrate the store", "$0 store migrate"],
      ["Migrate and clean up legacy orphan symlinks", "$0 store migrate --cleanup-legacy-orphans"],
    ],
  });

  cleanupLegacyOrphans = Option.Boolean("--cleanup-legacy-orphans", false, {
    description: "After migration, scan ~/.claude/skills and ~/.codex/skills for bgng-owned orphans and remove them.",
  });

  yes = Option.Boolean("--yes", false, {
    description: "Skip confirmation prompts during cleanup.",
  });

  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    const { agentsDir, homeDir } = this.context;

    if (!detectLegacyLayout(agentsDir)) {
      this.context.stdout.write("No legacy layout detected; nothing to migrate.\n");
      return 0;
    }

    const result = await migrateStore({
      agentsDir,
      cleanupLegacyOrphans: this.cleanupLegacyOrphans,
      yes: this.yes,
    });

    // print result.steps[] and warnings
    // if cleanupLegacyOrphans: call cleanupLegacyOrphans() and print its result

    if (this.json) {
      this.context.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      this.context.stdout.write(`Migration complete.\nArchived to ${result.archivedTo}\n`);
    }
    return 0;
  }
}
```

```ts
// cli/index.ts — register at the appropriate alphabetical position
import { StoreMigrateCommand } from "./commands/store/migrate";
import { StoreStatusCommand } from "./commands/store/status";

cli.register(StoreMigrateCommand);
cli.register(StoreStatusCommand);
```

```ts
// cli/index.ts — add legacy warning hook (after createAgentsContext, before runExit)
import { detectLegacyLayout } from "./core/migration";

const context = createAgentsContext();
if (detectLegacyLayout(context.agentsDir)) {
  process.stderr.write(
    "WARNING: pre-cards layout detected. Run `bgng store migrate` to upgrade.\n"
  );
}
```

```ts
// test/helpers.ts — append

export async function scaffoldPreCardsFixture(options?: {
  mcpServers?: Record<string, RegistryServer>;
  skillPackages?: { name: string; version: string; skill: string }[];
}) {
  const root = await createTempRoot("agents-pre-cards-");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");

  // Build the pre-cards layout: ~/.agents/bgng/config.json, ~/.agents/library/mcp-servers.json, ~/.agents/packages/skills/...
  await mkdir(join(agentsDir, "bgng"), { recursive: true });
  await mkdir(join(agentsDir, "library"), { recursive: true });

  await writeFile(
    join(agentsDir, "bgng", "config.json"),
    JSON.stringify({ version: 1, /* ... */ }, null, 2),
  );

  const servers = options?.mcpServers ?? { context7: { description: "Docs", transport: "stdio", command: "npx", args: ["-y", "@upstash/context7-mcp"], optional: false } };
  await writeFile(
    join(agentsDir, "library", "mcp-servers.json"),
    JSON.stringify({ version: 1, servers }, null, 2),
  );

  for (const pkg of options?.skillPackages ?? []) {
    const skillDir = join(agentsDir, "packages", "skills", pkg.name, pkg.version, "skills", pkg.skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${pkg.skill}\n---\n`);
  }

  return { root, homeDir, agentsDir };
}
```

**Tests to add (TDD entry).**

```ts
// test/core-migration.test.ts — new file

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { migrateStore, detectLegacyLayout } from "../cli/core/migration";
import { cleanupTempRoots, scaffoldPreCardsFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => { await cleanupTempRoots(tempRoots); });

test("detectLegacyLayout returns true for pre-cards fixture", async () => {
  const fixture = await scaffoldPreCardsFixture({});
  tempRoots.push(fixture.root);
  expect(detectLegacyLayout(fixture.agentsDir)).toBe(true);
});

test("migrateStore produces the expected post-cards layout", async () => {
  const fixture = await scaffoldPreCardsFixture({
    mcpServers: {
      context7: { description: "Docs", transport: "stdio", command: "npx", args: ["-y", "..."], optional: false },
      "chrome-devtools": { description: "Browser", transport: "stdio", command: "npx", args: ["-y", "chrome-devtools-mcp@latest"], optional: false },
    },
    skillPackages: [{ name: "@acme/skills", version: "1.0.0", skill: "hello-skill" }],
  });
  tempRoots.push(fixture.root);

  const result = await migrateStore({ agentsDir: fixture.agentsDir });

  // Post-conditions
  expect(existsSync(join(fixture.agentsDir, "bgng", "store.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "machine.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "mcp-servers", "context7.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "mcp-servers", "chrome-devtools.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "skills", "@acme", "skills", "1.0.0"))).toBe(true);

  // Old layout archived
  expect(existsSync(result.archivedTo)).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "library"))).toBe(false);
  expect(existsSync(join(fixture.agentsDir, "packages"))).toBe(false);

  // Per-server file content preserved exactly
  const context7 = JSON.parse(readFileSync(join(fixture.agentsDir, "bgng", "mcp-servers", "context7.json"), "utf8"));
  expect(context7.command).toBe("npx");
});

test("migrateStore is idempotent (re-run after success is a no-op with a warning)", async () => {
  // ...
});

test("migrateStore failure between steps preserves recoverable state", async () => {
  // Fault injection: stub one of the mid-migration calls to throw; verify staging dir preserved.
});
```

**Done definition.**

- M1.1–M1.9 subtasks complete.
- `core-migration.test.ts` passes with at least: detect, migrate, idempotent re-run, fault-injected partial failure.
- `bgng store migrate` end-to-end run on a pre-cards fixture produces the expected tree.
- `bgng store status` reports the new store metadata.
- Legacy warning prints on every command when legacy layout is present and store not initialized.
- Existing library/default/status/write commands work on both legacy layout (with warning) and post-cards store layout (without warning).
- Old `cli/core/paths.ts` legacy resolvers still exist only as M1 migration fallbacks (deprecation removal lands in M2).

---

### Phase M2 — Write-record + Idempotency + Cleanup Engine

**Goal.** Make `write-record.json` first-class infrastructure: atomic writes, corruption fallback, doctor validation, cleanup logic that uses it. Add the idempotency property test (v1.1 §11.4). Retire the old path resolvers at the end of this milestone.

**Subtasks.**

- [ ] **M2.1** Add `cli/core/write-record.ts` with read/write/validate helpers and atomic-write semantics.
- [ ] **M2.2** Refactor `cli/core/sync.ts` to read/write write-record before/after materialization.
- [ ] **M2.3** Implement cleanup: when a path was in the prior write-record but is not in the desired state, remove it safely (only if it still resolves where recorded).
- [ ] **M2.4** Add `bgng doctor` checks for write-record consistency (delegates to a new section in `cli/core/diagnostics.ts`).
- [ ] **M2.5** Add the idempotency property test (`test/scenarios-idempotency.test.ts`).
- [ ] **M2.6** Remove M1 legacy fallback branches and old path resolvers from `cli/core/paths.ts` after every consumer has moved to `cli/core/store-paths.ts`.
- [ ] **M2.7** Make write-record paths scope-relative (`.claude/skills/alpha`, `.cursor/mcp.json`) while operations resolve them against the current materialization scope. Store absolute symlink targets for ownership checks.
- [ ] **M2.8** Emit the v1.1 fallback warning exactly once per write when the write-record is missing/corrupt: `no prior write-record; treating existing on-disk state as user-owned for this write`.

**Code scaffolding.**

```ts
// cli/core/write-record.ts — new file

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface WriteRecord {
  writeRecordVersion: 1;
  lastWriteAt: string;
  lastWriteHarnessVersion: string;
  managedPaths: ManagedPath[];
}

export type ManagedPath =
  | { path: string; kind: "symlink"; target: string }
  | { path: string; kind: "managed-fields"; fields: string[]; fieldHashes: Record<string, string> }
  | { path: string; kind: "generated-symlink"; generatedPath: string };

// path is always relative to the materialization scope root:
//   project scope  -> <project>/.claude/...
//   machine scope  -> <home>/.claude/...
// target/generatedPath are recorded as absolute paths after realpath
// resolution so ownership checks are stable across cwd changes.

export function resolveProjectWriteRecordPath(projectRoot: string) {
  return join(projectRoot, ".agents", "bgng", "write-record.json");
}

// cli/core/project.ts — add once, reuse everywhere a project root is needed
export function resolveProjectRootFromConfigPath(configPath: string) {
  // <project>/.agents/bgng/config.json -> <project>
  return dirname(dirname(dirname(configPath)));
}

export function loadWriteRecord(recordPath: string): WriteRecord | null {
  if (!existsSync(recordPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(recordPath, "utf8")) as WriteRecord;
    if (parsed.writeRecordVersion !== 1) return null;
    if (!Array.isArray(parsed.managedPaths)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveWriteRecord(recordPath: string, record: WriteRecord) {
  const tmp = `${recordPath}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, recordPath);
  const dirFd = openSync(dirname(recordPath), "r");
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

export function diffWriteRecord(previous: WriteRecord | null, desired: ManagedPath[]) {
  const prevMap = new Map((previous?.managedPaths ?? []).map((p) => [p.path, p]));
  const descMap = new Map(desired.map((p) => [p.path, p]));

  const toRemove: ManagedPath[] = [];
  const toAdd: ManagedPath[] = [];
  const toVerify: ManagedPath[] = [];

  for (const [path, prev] of prevMap) {
    if (!descMap.has(path)) toRemove.push(prev);
    else toVerify.push(prev);
  }
  for (const [path, next] of descMap) {
    if (!prevMap.has(path)) toAdd.push(next);
  }

  return { toRemove, toAdd, toVerify };
}
```

```ts
// cli/core/sync.ts — modifications (sketch)

// At the top of syncRepository(), after determining project scope:
const recordPath = projectConfigPath
  ? resolveProjectWriteRecordPath(resolveProjectRootFromConfigPath(projectConfigPath))
  : resolveGlobalWriteRecordPath(agentsDir);

const previousRecord = loadWriteRecord(recordPath);

// ... after computing desired managedPaths from the effective state ...

const { toRemove, toAdd, toVerify } = diffWriteRecord(previousRecord, desiredManagedPaths);

// For each toRemove: unlink only if path still resolves to the recorded target.
// For each toAdd: create.
// For each toVerify: idempotency check (no change needed).

// Finally, save the new record:
saveWriteRecord(recordPath, {
  writeRecordVersion: 1,
  lastWriteAt: new Date().toISOString(),
  lastWriteHarnessVersion: getHarnessVersion(),  // helper: reads package.json version
  managedPaths: desiredManagedPaths,
});
```

**Tests to add (TDD entry).**

```ts
// test/core-write-record.test.ts — new file

test("loadWriteRecord returns null for missing file", () => { /* ... */ });
test("loadWriteRecord returns null for malformed JSON", () => { /* ... */ });
test("loadWriteRecord returns null for wrong schema version", () => { /* ... */ });
test("saveWriteRecord writes atomically via tmp + rename", () => { /* ... */ });
test("diffWriteRecord computes toRemove/toAdd/toVerify correctly", () => { /* ... */ });
test("managed paths are scope-relative and symlink targets are absolute", () => { /* ... */ });

// test/scenarios-idempotency.test.ts — new file

test("write twice in a row: second invocation produces zero changes", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  const env = { /* AGENTS_* env */ };

  const first = await runAgentsCli(["write", "--json"], env);
  expect(first.exitCode).toBe(0);

  const second = await runAgentsCli(["write", "--json"], env);
  expect(second.exitCode).toBe(0);
  const secondResult = JSON.parse(second.stdout);
  expect(secondResult.changes).toEqual([]);
  expect(secondResult.warnings).toEqual([]);
});

test("idempotency holds for empty project", async () => { /* ... */ });
test("idempotency holds for project with overlay-only", async () => { /* ... */ });
test("idempotency holds for machine scope (no project)", async () => { /* ... */ });
test("missing write-record warns once and skips cleanup for that write", async () => { /* ... */ });
test("corrupt write-record warns once and skips cleanup for that write", async () => { /* ... */ });

// test/scenarios-cleanup.test.ts — new file

test("removing a curated skill removes its symlink from .claude/skills on the next write", async () => {
  // Setup: curate alpha + beta, write, then uncurate alpha, write again.
  // Expect: ~/.claude/skills/alpha is removed (not just warned about).
  // Expect: ~/.claude/skills/beta remains.
});

test("cleanup preserves a symlink that was replaced with user content", async () => {
  // Setup: write, then replace a managed symlink with a user-created directory,
  // then uncurate the skill, write again.
  // Expect: write does not delete the user directory; warns instead.
});
```

**Done definition.**

- Idempotency tests pass for at least four fixture variants (empty project, project + cards, project + overlay-only, machine scope).
- Cleanup test passes: removing a curated skill removes its symlink.
- Safety test passes: user-replaced content is preserved during cleanup.
- Corruption-fallback tests pass: missing or malformed write-record degrades to safe no-op cleanup with a warning.
- M1 legacy fallback branches are gone; every store consumer imports from `cli/core/store-paths.ts`.

---

### Phase M3 — `_bgng` Meta-block for Claude/Codex; Preserved Cursor Pattern

**Goal.** Implement field-level managed-region tracking for `settings.json` and `config.toml`. Add drift refusal with `--force`. Cursor mechanism is *preserved* — verify and add explicit drift detection for the symlink-replaced case.

**Subtasks.**

- [ ] **M3.1** Add `cli/core/managed-fields.ts`: canonical JSON/TOML hashing, `_bgng` block read/write, and drift detection using the prior write-record as the authoritative source of recorded hashes.
- [ ] **M3.2** Update `cli/core/mcp.ts` `mergeClaudeSettingsText` and `mergeCodexTomlText` to read/write `_bgng` blocks.
- [ ] **M3.3** Add `--force` flag to `cli/commands/write.ts`; surface drift refusal with the v1.1 §8.4 message.
- [ ] **M3.4** Cursor drift detection: if `.cursor/mcp.json` is a regular file (not a symlink) where the write-record says it should be a symlink, treat as drift.
- [ ] **M3.5** Update `cli/core/diagnostics.ts` to use the same canonical-hash logic for drift reporting in `bgng doctor`, including a warning when `_bgng` hashes and write-record hashes disagree.

**Code scaffolding.**

```ts
// cli/core/managed-fields.ts — new file

import { createHash } from "node:crypto";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

export interface BgngMetaBlock {
  version: 1;
  managedKeys?: string[];       // JSON files
  managedSections?: string[];   // TOML files
  fieldHashes?: Record<string, string>;
  sectionHashes?: Record<string, string>;
  lastWriteAt: string;
}

export function canonicalJsonHash(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function canonicalTomlHash(sectionContent: unknown): string {
  // smol-toml round-trip + canonical JSON hash of the parsed form
  return canonicalJsonHash(sectionContent);
}

function sha256(input: string): string {
  return `sha256-${createHash("sha256").update(input).digest("hex")}`;
}

// JSON file helpers

export function readClaudeMetaBlock(parsed: Record<string, unknown>): BgngMetaBlock | null {
  const meta = parsed._bgng;
  if (!meta || typeof meta !== "object") return null;
  return meta as BgngMetaBlock;
}

export function buildClaudeMetaBlock(managedKeys: string[], values: Record<string, unknown>): BgngMetaBlock {
  return {
    version: 1,
    managedKeys,
    fieldHashes: Object.fromEntries(managedKeys.map((k) => [k, canonicalJsonHash(values[k])])),
    lastWriteAt: new Date().toISOString(),
  };
}

export function detectClaudeDrift(
  current: Record<string, unknown>,
  managedKeys: string[],
  recordedHashes: Record<string, string>,
): { driftedKeys: string[] } {
  const drifted: string[] = [];
  for (const key of managedKeys) {
    const currentHash = canonicalJsonHash(current[key]);
    if (currentHash !== recordedHashes[key]) drifted.push(key);
  }
  return { driftedKeys: drifted };
}

// Symmetrical TOML helpers ...
```

```ts
// cli/core/mcp.ts — modified mergeClaudeSettingsText (sketch)

export function mergeClaudeSettingsText(
  currentText: string,
  servers: Record<string, RegistryServer>,
  options?: {
    previousManagedPath?: Extract<ManagedPath, { kind: "managed-fields" }>;
    force?: boolean;
  },
): { text: string; meta: BgngMetaBlock; drift?: { driftedKeys: string[] } } {
  const parsed = JSON.parse(currentText) as Record<string, unknown>;
  const visibleMeta = readClaudeMetaBlock(parsed);
  const recordedHashes = options?.previousManagedPath?.fieldHashes ?? visibleMeta?.fieldHashes ?? {};
  const managedKeys = options?.previousManagedPath?.fields ?? visibleMeta?.managedKeys ?? ["mcpServers"];

  // Drift detection
  if (Object.keys(recordedHashes).length > 0 && !options?.force) {
    const { driftedKeys } = detectClaudeDrift(
      parsed,
      managedKeys,
      recordedHashes,
    );
    if (driftedKeys.length > 0) {
      return { text: currentText, meta: visibleMeta ?? buildClaudeMetaBlock([], {}), drift: { driftedKeys } };
    }
  }

  // Update managed keys
  const nextManagedKeys = ["mcpServers"];
  parsed.mcpServers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
  );

  const meta = buildClaudeMetaBlock(nextManagedKeys, { mcpServers: parsed.mcpServers });
  parsed._bgng = meta;

  return { text: `${JSON.stringify(parsed, null, 2)}\n`, meta };
}
```

**Tests to add (TDD entry).**

```ts
// test/core-managed-fields.test.ts — new file

test("canonicalJsonHash is stable across key ordering", () => {
  const a = { x: 1, y: 2 };
  const b = { y: 2, x: 1 };
  expect(canonicalJsonHash(a)).toBe(canonicalJsonHash(b));
});

test("canonicalJsonHash detects value changes", () => {
  const a = { x: 1 };
  const b = { x: 2 };
  expect(canonicalJsonHash(a)).not.toBe(canonicalJsonHash(b));
});

test("detectClaudeDrift surfaces a hand-edit to a managed key", () => {
  const recorded = { mcpServers: { context7: { command: "npx" } } };
  const recordedHash = canonicalJsonHash(recorded.mcpServers);
  const handEdited = { mcpServers: { context7: { command: "node" } } };
  const { driftedKeys } = detectClaudeDrift(
    handEdited,
    ["mcpServers"],
    { mcpServers: recordedHash },
  );
  expect(driftedKeys).toEqual(["mcpServers"]);
});

// test/commands-write-drift.test.ts — new file

test("bgng write refuses when settings.json mcpServers has been hand-edited", async () => {
  // Setup: write, hand-edit settings.json mcpServers, write again.
  // Expect: exit code non-zero, stderr contains "Drift detected"
});

test("bgng write --force overwrites drift", async () => { /* ... */ });

test("bgng write refuses when .cursor/mcp.json was replaced with a regular file", async () => { /* ... */ });

test("bgng write --force restores the .cursor/mcp.json symlink", async () => { /* ... */ });
```

**Done definition.**

- `_bgng` block round-trips correctly for both Claude (JSON) and Codex (TOML).
- Canonical hash is stable across key reordering and equivalent whitespace.
- Drift refusal works for all three target file types.
- `--force` overrides drift refusal.
- Cursor drift detection catches the "replaced-with-file" case.

---

### Phase M4 — Card Manifest + Lockfile + Author Commands

**Goal.** Implement the card manifest schema and validator, the lockfile schema and validator, and the four author commands: `card new`, `card publish`, `card diff`, `card deprecate`.

**Subtasks.**

- [ ] **M4.1** Add `cli/core/card-manifest.ts`: types, validator, JSON-schema-style validation per v1.1 §5.2.
- [ ] **M4.2** Add `cli/core/card-lock.ts`: lockfile types, validator, atomic-write helpers.
- [ ] **M4.3** Add `cli/core/card-diff.ts`: structural diff classifier per v1.1 §7.1.
- [ ] **M4.4** Add `cli/commands/card/new.ts`: scaffold a card source under `~/.agents/bgng/sources/<scope>/<name>/`. Initialize git by default with `--no-git` opt-out.
- [ ] **M4.5** Add `cli/commands/card/publish.ts`: snapshot a source → immutable version in store. Uses `npm pack` from `cli/core/skill-packages.ts` patterns.
- [ ] **M4.6** Add `cli/commands/card/diff.ts`: invoke `card-diff.ts` and render output per v1.1 §7.2.
- [ ] **M4.7** Add `cli/commands/card/deprecate.ts`: mark a version deprecated in `versions.json`.
- [ ] **M4.8** Add `bgng card list [--sources]` and `bgng card show <ref>` for inspection.
- [ ] **M4.9** Add `authoring.scope` to `machine.json` schema; `card new` prompts on first use if absent.
- [ ] **M4.10** Add the `semver` npm package plus lockfile update; wrap it in `cli/core/semver-utils.ts` so card and bundle code share one parser/range implementation.

**Code scaffolding.**

```ts
// cli/core/card-manifest.ts — new file

export interface CardManifest {
  $schema?: string;
  name: string;             // "@scope/name" or "name"
  version: string;          // strict semver
  description?: string;
  license?: string;
  harness?: { minVersion?: string };
  bundles?: Record<string, string>;  // <pkg>: <range>
  skills?: { include: string[] };
  servers?: Record<string, ServerOverride>;
  extensions?: Record<string, ExtensionConfig>;
  targets?: Partial<Record<TargetName, { enabled: boolean }>>;
}

export interface CardManifestValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateCardManifest(input: unknown): CardManifestValidationResult {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["manifest is not an object"] };
  // ... schema checks per v1.1 §5.2
  return { ok: errors.length === 0, errors };
}

export function isCardScopeName(name: string): boolean {
  return /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(name);
}

export function isCardUnscopedName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}
```

```ts
// cli/core/card-lock.ts — new file

export interface CardLockfile {
  lockfileVersion: 1;
  harness: { version: string; resolvedAt: string };
  cards: CardLockEntry[];
  bundles: BundleLockEntry[];
}

export interface CardLockEntry {
  spec: string;
  name: string;
  version: string;
  origin: string;     // "store" | "npm:<url>" | "file:<path>" | "git:<url>"
  integrity: string;  // "sha256-<hex>"
  path: string;       // relative to agentsDir, e.g., "cards/@me/baseline/1.2.0"
}

export interface BundleLockEntry {
  spec: string;
  name: string;
  version: string;
  origin: string;
  integrity: string;
  path: string;
}

export function resolveProjectLockfilePath(projectRoot: string) {
  return join(projectRoot, ".agents", "bgng", "card.lock");
}

export function loadCardLockfile(lockPath: string): CardLockfile | null { /* ... */ }
export function saveCardLockfile(lockPath: string, lock: CardLockfile) { /* atomic via tmp+rename */ }
```

```ts
// cli/core/card-diff.ts — new file

export type DiffClassification = "major" | "minor" | "patch";

export interface CardDiffResult {
  classification: DiffClassification;
  skills: { added: string[]; removed: string[]; unchanged: string[] };
  servers: { enabled: string[]; disabled: string[]; modified: string[]; unchanged: string[] };
  extensions: { /* ... */ };
  targets: { /* ... */ };
  metadata: { harnessMinVersion?: { from: string; to: string } };
  inlineContent: { unchanged: number; modified: string[] };
}

export function diffCards(a: CardManifest, b: CardManifest, options?: {
  aInlinePaths?: string[];
  bInlinePaths?: string[];
}): CardDiffResult { /* ... */ }
```

```ts
// cli/core/semver-utils.ts — new file

import semver from "semver";

export function isStrictSemver(version: string) {
  return semver.valid(version) === version;
}

export function maxSatisfying(versions: string[], range: string) {
  return semver.maxSatisfying(versions, range, { includePrerelease: false });
}

export function satisfies(version: string, range: string) {
  return semver.satisfies(version, range, { includePrerelease: false });
}

export function rangesIntersect(a: string, b: string) {
  return semver.intersects(a, b, { includePrerelease: false });
}
```

```ts
// cli/commands/card/new.ts — new file (skeleton)

export class CardNewCommand extends BaseCommand {
  static override paths = [["card", "new"]];

  static override usage = BaseCommand.Usage({
    category: "Cards (Authoring)",
    description: "Scaffold a new card source in the local store.",
    details: `
      Creates ~/.agents/bgng/sources/<scope>/<name>/ with a card.json
      stub, skills/ and mcp-servers/ directories, and (by default) a
      .git/ directory. Use --no-git to skip git initialization.
    `,
    examples: [
      ["Start from scratch", "$0 card new @me/backend"],
      ["Start from the current project's overlay", "$0 card new @me/backend --from-project"],
      ["Branch from an existing card", "$0 card new @me/backend --from-card @other/baseline@^1.0.0"],
      ["Skip git initialization", "$0 card new @me/backend --no-git"],
    ],
  });

  name = Option.String({ required: true });
  fromProject = Option.Boolean("--from-project", false, { description: "Seed from the current project's config." });
  fromCard = Option.String("--from-card", { description: "Seed from an existing card version." });
  noGit = Option.Boolean("--no-git", false, { description: "Skip git initialization." });

  async execute() {
    // 1. Validate the name (must match @scope/name or be a plain name with a warning)
    // 2. Resolve the authoring scope from machine.json; prompt if absent
    // 3. Create sources/<scope>/<name>/
    // 4. Write card.json stub (with --from-project or --from-card seeding the body)
    // 5. mkdir skills/, mcp-servers/
    // 6. git init (unless --no-git)
    // 7. Print path
    return 0;
  }
}
```

**Tests to add (TDD entry).**

```ts
// test/core-card-manifest.test.ts
test("validateCardManifest accepts a minimal valid manifest", () => { /* ... */ });
test("validateCardManifest rejects missing name or version", () => { /* ... */ });
test("validateCardManifest rejects invalid semver in version", () => { /* ... */ });
test("validateCardManifest rejects skills not in skills.include from inline content", () => { /* ... */ });

// test/core-card-lock.test.ts
test("loadCardLockfile returns null for missing file", () => { /* ... */ });
test("saveCardLockfile atomically writes via tmp+rename", () => { /* ... */ });

// test/core-card-diff.test.ts
test("removing a skill from skills.include is classified as major", () => { /* ... */ });
test("adding a skill is classified as minor", () => { /* ... */ });
test("changing description only is classified as patch", () => { /* ... */ });
test("modified inline SKILL.md is flagged for author judgment", () => { /* ... */ });

// test/commands-card-new.test.ts
test("bgng card new @me/backend creates sources/@me/backend/ with card.json", async () => { /* ... */ });
test("bgng card new --no-git skips git initialization", async () => { /* ... */ });
test("bgng card new prompts for scope on first use when machine.json has no authoring.scope", async () => { /* ... */ });

// test/commands-card-publish.test.ts
test("bgng card publish creates an immutable version directory with integrity hash", async () => { /* ... */ });
test("bgng card publish refuses to overwrite an existing version", async () => { /* ... */ });
test("bgng card publish updates versions.json", async () => { /* ... */ });

// test/commands-card-diff.test.ts
test("bgng card diff renders structural classification", async () => { /* ... */ });

// test/commands-card-deprecate.test.ts
test("bgng card deprecate records the reason in versions.json", async () => { /* ... */ });

// test/commands-card-list-show.test.ts
test("bgng card list lists published cards alphabetically by @scope/name", async () => { /* ... */ });
test("bgng card list --sources lists editable sources", async () => { /* ... */ });
test("bgng card show displays manifest, version, deprecation, and integrity", async () => { /* ... */ });
```

**Done definition.**

- `bgng card new`, `publish`, `diff`, `deprecate` all functional and tested.
- Card manifest validator catches every malformed case from v1.1 §11.5.
- Lockfile read/write atomic and validated.
- Diff classifier matches v1.1 §7.1 cases.
- `semver` dependency added intentionally; `cli/core/semver-utils.ts` is the only card/bundle code importing it directly.

---

### Phase M5 — Card Consumer Commands + MCP Resolution + Bundle Conflict

**Goal.** Implement the consumer-side card surface: `apply`, `add`, `pin`, `remove`, `update`, `outdated`, `detach`, and `status`. `list` / `show` already landed in M4 as inspection commands. Add the three-layer MCP server resolution (v1.1 §5.2.1) and the bundle conflict algorithm (v1.1 §7.7). Add `--write` chaining.

**Subtasks.**

- [ ] **M5.1** Extend `cli/core/types.ts` `ProjectConfig` with `cards?: string[]`.
- [ ] **M5.2** Add `cli/core/card-resolver.ts`: parse specifiers, resolve versions, fetch from store/npm, compute integrity.
- [ ] **M5.3** Add `cli/core/bundle-resolver.ts`: implement intersect-and-pick-highest with empty-intersection error per v1.1 §7.7.
- [ ] **M5.4** Add `cli/core/mcp-resolver.ts`: implement three-layer MCP resolution per v1.1 §5.2.1.
- [ ] **M5.5** Add the card consumer commands (paths in v1.1 §6.3): `apply`, `add`, `pin`, `remove`, `update`, `outdated`, `detach`, `status`.
- [ ] **M5.6** Add top-level aliases `bgng apply` and `bgng update` (verb-first entry points).
- [ ] **M5.7** Add `cli/core/chain.ts` with `chainWrite()`. Add `--write` flag support to `apply`, `add`, `pin`, `remove`, `update`.
- [ ] **M5.8** Add `cli/core/effective-state.ts`. For project scope, compute `built-in defaults -> user library -> locked cards in declared order -> project overlay`; do **not** include `machine.json`. For machine scope, compute `built-in defaults -> user library -> machine.json`.
- [ ] **M5.9** Define `bgng card outdated --check`: default exit code is 0; `--check` exits non-zero when updates are available.
- [ ] **M5.10** Add integration tests for every M5 command path, not just `apply` / `update`.

**Code scaffolding.**

```ts
// cli/core/card-resolver.ts — new file

export interface CardSpecifier {
  raw: string;        // "@me/baseline@^1.0.0"
  name: string;       // "@me/baseline"
  range: string;      // "^1.0.0" or "*"
  scheme: "registry" | "file";
  filePath?: string;  // when scheme === "file"
}

export function parseCardSpecifier(spec: string): CardSpecifier { /* ... */ }

export interface ResolvedCard {
  spec: string;
  name: string;
  version: string;
  origin: string;
  integrity: string;
  path: string;
}

export async function resolveCards(
  specs: CardSpecifier[],
  options: { agentsDir: string; previousLockfile?: CardLockfile },
): Promise<ResolvedCard[]> {
  // Implements v1.1 §7.4 algorithm:
  // 1. For each spec, discover available versions in store + registry
  // 2. Filter by range, exclude deprecated unless only match
  // 3. Pick highest matching
  // 4. Return entries with origin + integrity + path
}
```

```ts
// cli/core/bundle-resolver.ts — new file

import { maxSatisfying, satisfies } from "./semver-utils";

export interface ResolvedBundle {
  spec: string;
  name: string;
  version: string;
  origin: string;
  integrity: string;
  path: string;
}

export interface BundleConflict {
  bundleName: string;
  contributions: { cardName: string; cardIndex: number; range: string }[];
}

export async function resolveBundles(
  cards: { name: string; index: number; bundles: Record<string, string> }[],
  options: { agentsDir: string; previousLockfile?: CardLockfile },
): Promise<{ resolved: ResolvedBundle[]; conflicts: BundleConflict[] }> {
  // Group constraints by bundle name
  const grouped = new Map<string, { cardName: string; cardIndex: number; range: string }[]>();
  for (const card of cards) {
    for (const [bundleName, range] of Object.entries(card.bundles)) {
      const list = grouped.get(bundleName) ?? [];
      list.push({ cardName: card.name, cardIndex: card.index, range });
      grouped.set(bundleName, list);
    }
  }

  const resolved: ResolvedBundle[] = [];
  const conflicts: BundleConflict[] = [];

  for (const [bundleName, contributions] of grouped) {
    const available = await listAvailableBundleVersions(bundleName, options.agentsDir);
    const compatible = available.filter((version) =>
      contributions.every((c) => satisfies(version, c.range)),
    );
    const picked = maxSatisfying(compatible, "*");
    if (!picked) {
      conflicts.push({ bundleName, contributions });
      continue;
    }

    resolved.push({ /* ... */ });
  }

  return { resolved, conflicts };
}

export function formatBundleConflict(conflict: BundleConflict): string {
  const lines = [`Bundle conflict: ${conflict.bundleName}`];
  for (const c of conflict.contributions) {
    lines.push(`  card ${c.cardName} declares ${c.range} (via cards[${c.cardIndex}])`);
  }
  lines.push("No version satisfies all ranges.");
  lines.push("");
  lines.push("Resolutions:");
  lines.push("  - bump one of the cards to a version with a compatible range");
  lines.push("  - or remove one of the conflicting cards");
  return lines.join("\n");
}
```

```ts
// cli/core/chain.ts — new file

export async function chainWrite(
  context: AgentsContext,
  options: { dryRun?: boolean },
): Promise<number> {
  // Invokes the equivalent of `bgng write` in-process with the same context.
  // Returns the exit code of the chained write.
  // No rollback: if write fails, mutations from the calling command remain.
  const result = await syncRepository({
    repoRoot: context.repoRoot,
    agentsDir: context.agentsDir,
    homeDir: context.homeDir,
    cwd: context.cwd,
    dryRun: options.dryRun,
  });
  if (result.warnings.length > 0) {
    for (const w of result.warnings) process.stderr.write(`${w}\n`);
  }
  return 0;  // returns non-zero on hard errors thrown by syncRepository
}
```

```ts
// cli/commands/card/apply.ts — new file (skeleton)

export class CardApplyCommand extends BaseCommand {
  static override paths = [["card", "apply"]];

  refs = Option.Rest({ name: "<ref>", required: 1 });
  write = Option.Boolean("--write", false, { description: "Run `bgng write` after applying." });
  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    // 1. Parse refs into specifiers
    // 2. Validate (versions in store or fetchable)
    // 3. Replace project config's cards[] array
    // 4. Resolve cards → produce lockfile
    // 5. Resolve bundles → fail on conflict per §7.7
    // 6. Save lockfile atomically
    // 7. If --write: chainWrite()
    return 0;
  }
}

// Top-level alias:
export class TopLevelApplyCommand extends BaseCommand {
  static override paths = [["apply"]];
  ref = Option.String({ required: true });
  write = Option.Boolean("--write", false);
  json = Option.Boolean("--json", false);

  async execute() {
    const inner = new CardApplyCommand();
    inner.refs = [this.ref];
    inner.write = this.write;
    inner.json = this.json;
    return await inner.execute.call(this);  // share context
  }
}
```

```ts
// cli/core/effective-state.ts — new file

export async function buildEffectiveState(options: {
  repoRoot: string;
  agentsDir: string;
  projectConfigPath: string | null;
}): Promise<MergedProjectState> {
  const builtIns = await loadConfig(options.repoRoot);
  const packagedRegistry = await loadRegistry(options.repoRoot);
  const userLibrary = await loadStoreMcpLibrary(options.agentsDir);
  const baseRegistry = mergeUserMcpLibrary(packagedRegistry, userLibrary);

  if (!options.projectConfigPath) {
    const { config: machineConfig } = await loadEffectiveMachineConfig(builtIns, options.agentsDir);
    return {
      config: machineConfig,
      registry: baseRegistry,
      skills: machineConfig.defaults?.skills ? { include: machineConfig.defaults.skills } : undefined,
    };
  }

  const projectRoot = resolveProjectRootFromConfigPath(options.projectConfigPath);
  const project = await loadProjectConfig(options.projectConfigPath);
  const lockfile = await loadCardLockfile(resolveProjectLockfilePath(projectRoot));
  const cards = await loadLockedCards(lockfile, options.agentsDir);
  const cardsMerged = mergeCardsIntoState({ builtIns, registry: baseRegistry, cards });

  return mergeProjectConfig(cardsMerged.config, cardsMerged.registry, project);
}
```

**Tests to add (TDD entry).**

```ts
// test/core-card-resolver.test.ts
test("resolves @me/baseline@^1.0.0 to the highest matching version in the store", async () => { /* ... */ });
test("excludes deprecated versions unless they are the only match", async () => { /* ... */ });
test("file:<path> specifier resolves to the local path and computes integrity", async () => { /* ... */ });

// test/core-bundle-resolver.test.ts
test("two cards with overlapping ranges resolve to the highest satisfying version", () => { /* ... */ });
test("two cards with disjoint ranges produce a BundleConflict", () => { /* ... */ });
test("formatBundleConflict produces the v1.1 §7.7 error message verbatim", () => { /* ... */ });

// test/core-mcp-resolver.test.ts
test("baseline-only: server resolves from packaged baseline", () => { /* ... */ });
test("user-library overrides packaged baseline", () => { /* ... */ });
test("card-inline overrides user library and packaged baseline", () => { /* ... */ });
test("last card wins when two cards define the same server inline", () => { /* ... */ });
test("project overlay applies last (highest precedence)", () => { /* ... */ });

// test/commands-card-apply.test.ts
test("bgng card apply @me/baseline replaces the project's cards[] array", async () => { /* ... */ });
test("bgng card apply --write chains into bgng write on success", async () => { /* ... */ });
test("bgng card apply --write preserves mutation when write fails", async () => { /* ... */ });
test("bgng apply <ref> is an alias for bgng card apply <ref>", async () => { /* ... */ });

// test/commands-card-add-pin-remove-detach.test.ts
test("bgng card add appends refs without duplicating an existing card name", async () => { /* ... */ });
test("bgng card pin changes the constraint for one card by name", async () => { /* ... */ });
test("bgng card remove removes cards by name", async () => { /* ... */ });
test("bgng card remove unknown-name exits non-zero", async () => { /* ... */ });
test("bgng card detach removes all cards and rewrites an empty lockfile", async () => { /* ... */ });

// test/commands-card-update.test.ts
test("bgng card update re-resolves within existing constraints", async () => { /* ... */ });
test("bgng update [<name>] is an alias", async () => { /* ... */ });

// test/commands-card-outdated-status.test.ts
test("bgng card outdated reports newer matching versions and exits zero by default", async () => { /* ... */ });
test("bgng card outdated --check exits non-zero when updates exist", async () => { /* ... */ });
test("bgng card status reports config cards, lockfile entries, and resolution warnings", async () => { /* ... */ });
```

**Done definition.**

- All consumer commands functional and tested.
- Three-layer MCP resolution test suite passes (five scenarios).
- Bundle conflict test passes for overlapping and disjoint ranges with the exact error message.
- `--write` chaining: mutation preserved on chained-write failure.
- Every command introduced in M5 has at least one integration test and one help-shape assertion.

---

### Phase M6 — Project-local Materialization

**Goal.** Refactor materialization to be project-scope-aware. `bgng write` inside a project writes to `<project>/.claude/skills/`, etc.; outside any project writes to `~/.claude/skills/`, etc.

**Subtasks.**

- [ ] **M6.1** Refactor `cli/core/paths.ts` `resolveToolPaths(homeDir)` → `resolveToolPaths(scope: { kind: "project", projectRoot: string } | { kind: "machine", homeDir: string })`.
- [ ] **M6.2** Update every consumer of `resolveToolPaths` to pass the discriminated scope. Use `cli/context.ts` `projectConfigPath` to determine scope.
- [ ] **M6.3** Refactor `cli/core/sync.ts` `syncRepository` to propagate the scope through `syncMcp` and `syncSkillsCore`.
- [ ] **M6.4** Refactor `cli/core/diagnostics.ts` symlink scans and drift checks to be scope-aware.
- [ ] **M6.5** Extend `bgng store migrate --cleanup-legacy-orphans` to scan global tool dirs for orphans whose targets resolve into the archive or the new store.
- [ ] **M6.6** Re-run the idempotency property test on the new scope-aware fixtures.
- [ ] **M6.7** Update `02_per-project-config-guide.md` to describe the new materialization scope.
- [ ] **M6.8** Make MCP writes create missing Claude/Codex/Cursor parent files for a new project scope instead of assuming home-scope files already exist.
- [ ] **M6.9** Move Cursor generated output to the materialization scope: project writes use `<project>/.agents/bgng/generated/cursor-mcp.json`; machine writes use `~/.agents/bgng/generated/cursor-mcp.json`.

**Code scaffolding.**

```ts
// cli/core/paths.ts — refactor

export type ToolScope =
  | { kind: "project"; projectRoot: string }
  | { kind: "machine"; homeDir: string };

export function resolveToolPaths(scope: ToolScope) {
  const root = scope.kind === "project" ? scope.projectRoot : scope.homeDir;
  return {
    claudeSkills: join(root, ".claude", "skills"),
    codexSkills: join(root, ".codex", "skills"),
    claudeSettings: join(root, ".claude", "settings.json"),
    codexConfig: join(root, ".codex", "config.toml"),
    cursorMcp: join(root, ".cursor", "mcp.json"),
  };
}

// For backward-compat during M6 PR review, also export the legacy form
// (marked @deprecated in the JSDoc) and remove at the end of M6.
```

```ts
// cli/core/sync.ts — modification

export async function syncRepository(options: SyncOptions = {}): Promise<SyncResult> {
  // ... existing setup ...
  const scope: ToolScope = projectConfigPath
    ? { kind: "project", projectRoot: resolveProjectRootFromConfigPath(projectConfigPath) }
    : { kind: "machine", homeDir: normalized.homeDir };

  const toolPaths = resolveToolPaths(scope);
  // Pass toolPaths (or the scope) into syncMcp and syncSkillsCore.
}
```

```ts
// cli/core/sync.ts — missing-file behavior for project-local writes

async function readTargetFileOrDefault(pathValue: string, kind: "json" | "toml") {
  if (!existsSync(pathValue)) {
    return kind === "json" ? "{}\n" : "";
  }
  return await readFile(pathValue, "utf8");
}

function resolveGeneratedDir(scope: ToolScope, agentsDir: string) {
  return scope.kind === "project"
    ? join(scope.projectRoot, ".agents", "bgng", "generated")
    : resolveStoreGeneratedDir(agentsDir);
}
```

**Tests to add (TDD entry).**

```ts
// test/scenarios-scope-isolation.test.ts — new file

test("bgng write inside a project never modifies ~/.claude/skills/", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "myproject");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "bgng", "config.json"), JSON.stringify({ version: 1 }));

  const env = { /* AGENTS_* env */ };
  const result = await runAgentsCli(["write"], env, projectDir);
  expect(result.exitCode).toBe(0);

  // Project directory got materialized
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);

  // Global home was NOT touched
  expect(existsSync(join(fixture.homeDir, ".claude", "skills", "alpha"))).toBe(false);
});

test("bgng write outside any project writes to ~/.claude/skills/", async () => {
  // ... inverse test ...
});

test("bgng write inside a fresh project creates missing Claude and Codex config files", async () => {
  // Setup: project has only .agents/bgng/config.json.
  // Expect: .claude/settings.json and .codex/config.toml are created with managed MCP sections.
});

test("bgng write inside a project writes Cursor generated MCP under the project .agents/bgng/generated directory", async () => {
  // Expect: <project>/.cursor/mcp.json symlink resolves to <project>/.agents/bgng/generated/cursor-mcp.json.
});

test("bgng store migrate --cleanup-legacy-orphans removes bgng-owned symlinks pointing into the archive", async () => {
  // ... fixture: pre-cards layout + global skill symlinks; migrate + cleanup; verify orphans removed
});

// re-run test/scenarios-idempotency.test.ts with project-local fixtures
```

**Done definition.**

- Scope isolation property test passes (both directions).
- Idempotency property test passes for project-scope fixtures.
- Legacy orphan cleanup test passes.
- `02_per-project-config-guide.md` updated.
- Per v1.1 §12 Q1: empirical verification of Claude Code / Codex / Cursor per-project read behavior is documented in the same knowledge doc.
- Fresh project write test passes without pre-existing `.claude/`, `.codex/`, or `.cursor/` files.

---

### Phase M7 — Extended `status`/`doctor` with `--explain` / `--why`

**Goal.** Refactor diagnostics into section builders; add cards/store sections; add `--explain` and `--why <category>:<name>` flags.

**Subtasks.**

- [ ] **M7.1** Refactor `cli/core/diagnostics.ts` into section builders per v1.1 §6.7.
- [ ] **M7.2** Add new sections: `buildCardsSection`, `buildStoreSection`, `buildWriteRecordSection`.
- [ ] **M7.3** Add `--explain` flag to `bgng status` and `bgng card status`; implement per-section explain trails.
- [ ] **M7.4** Add `--why <category>:<name>` flag with the category-prefix + ambiguity-prompt logic per v1.1 §6.6.1.
- [ ] **M7.5** Re-render `bgng doctor` output to include the new sections.

**Code scaffolding.**

```ts
// cli/core/diagnostics.ts — new shape

export interface DiagnosticsContext {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  scope: ToolScope;
  projectConfigPath: string | null;
  effectiveConfig: CanonicalConfig;
  effectiveRegistry: CanonicalRegistry;
}

export interface StatusReport {
  machine: MachineSection;
  skills: SkillsSection;
  mcp: McpSection;
  extensions: ExtensionsSection;
  cards?: CardsSection;
  store: StoreSection;
  project?: ProjectSection;
}

export type SectionBuilder<T> = (ctx: DiagnosticsContext) => Promise<T>;

const buildMachineSection: SectionBuilder<MachineSection> = async (ctx) => { /* ... */ };
const buildSkillsSection: SectionBuilder<SkillsSection> = async (ctx) => { /* ... */ };
const buildMcpSection: SectionBuilder<McpSection> = async (ctx) => { /* ... */ };
const buildExtensionsSection: SectionBuilder<ExtensionsSection> = async (ctx) => { /* ... */ };
const buildCardsSection: SectionBuilder<CardsSection> = async (ctx) => { /* ... */ };
const buildStoreSection: SectionBuilder<StoreSection> = async (ctx) => { /* ... */ };
const buildProjectSection: SectionBuilder<ProjectSection> = async (ctx) => { /* ... */ };

export async function buildStatusReport(ctx: DiagnosticsContext): Promise<StatusReport> {
  return {
    machine: await buildMachineSection(ctx),
    skills: await buildSkillsSection(ctx),
    mcp: await buildMcpSection(ctx),
    extensions: await buildExtensionsSection(ctx),
    cards: await buildCardsSection(ctx),
    store: await buildStoreSection(ctx),
    project: ctx.projectConfigPath ? await buildProjectSection(ctx) : undefined,
  };
}

// Each section also exposes an "explain trail for X" function
export async function explainSkill(name: string, ctx: DiagnosticsContext): Promise<string> { /* ... */ }
export async function explainServer(name: string, ctx: DiagnosticsContext): Promise<string> { /* ... */ }
// etc.

export async function explainAny(
  query: string,  // either "<category>:<name>" or "<name>"
  ctx: DiagnosticsContext,
): Promise<{ kind: "ok"; trail: string } | { kind: "ambiguous"; matches: string[] } | { kind: "not_found" }> {
  // Parse query; if prefixed, dispatch; if bare, search all categories and report.
}
```

```ts
// cli/commands/status.ts — extended

export class StatusCommand extends BaseCommand {
  static override paths = [["status"]];

  explain = Option.Boolean("--explain", false, { description: "Dump full resolution trail." });
  why = Option.String("--why", { description: "Dump resolution trail for a single concern. Use category:name (e.g., skill:foo)." });
  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    const ctx = await buildDiagnosticsContext(this.context);

    if (this.why) {
      const result = await explainAny(this.why, ctx);
      if (result.kind === "ok") {
        this.context.stdout.write(`${result.trail}\n`);
        return 0;
      }
      if (result.kind === "ambiguous") {
        this.context.stderr.write(`Ambiguous --why argument: ${this.why} matches:\n`);
        for (const m of result.matches) this.context.stderr.write(`  ${m}\n`);
        this.context.stderr.write(`Disambiguate with: --why <category>:${this.why.split(":").pop()}\n`);
        return 1;
      }
      this.context.stderr.write(`Not found: ${this.why}\n`);
      return 1;
    }

    const report = await buildStatusReport(ctx);
    if (this.json) {
      this.context.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      renderStatusReport(report, this.context.stdout, { explain: this.explain });
    }
    return 0;
  }
}
```

**Tests to add (TDD entry).**

```ts
// test/core-diagnostics-sections.test.ts
test("buildStatusReport composes all sections", async () => { /* ... */ });
test("buildCardsSection reports current lockfile contents", async () => { /* ... */ });
test("buildStoreSection reports store.json schema version and size", async () => { /* ... */ });

// test/commands-status-why.test.ts
test("--why skill:alpha shows the alpha skill's resolution trail", async () => { /* ... */ });
test("--why context7 (bare) succeeds when uniquely a server", async () => { /* ... */ });
test("--why parallel-search aborts with ambiguity hint when matched in multiple categories", async () => {
  // Fixture: a skill named parallel-search and a server named parallel-search both exist
});
test("--explain dumps full trail for every section", async () => { /* ... */ });
```

**Done definition.**

- Section builders refactor complete; all existing diagnostics tests pass.
- New section coverage tests pass.
- `--explain` and `--why` behave per v1.1 §6.6.1.
- Final M7 PR is the cards rollout's release PR: tag bgng version per CHANGELOG, update README.

---

## Testing Strategy

The testing strategy is built into each phase above, but a few cross-cutting principles:

1. **TDD per `.ai/rules/02_tdd_practices.md`:** every milestone starts with failing tests; implementation only after the tests are red.
2. **Three test tiers (matching `tdd_practices.md`):**
   - **Unit** (`test/core-*.test.ts`): direct module imports, fast, isolated. Tests for validators, hashers, resolvers, diff classifiers.
   - **Integration** (`test/commands-*.test.ts`): subprocess via `runAgentsCli()` with fixture env. Tests per command.
   - **Scenario** (`test/scenarios-*.test.ts`): subprocess, multi-step user journeys. Tests for idempotency, scope isolation, cleanup, drift recovery.
3. **No mocks for filesystem.** All tests use real tempdirs via `scaffoldCliFixture()` / `scaffoldPreCardsFixture()` / `createTempRoot()`.
4. **No mocks for npm.** A fixture file-system-backed registry mirrors `npm pack` outputs into a tempdir; the registry resolution path is parameterized to use the fixture in tests.
5. **Idempotency invariant** is the safety net (v1.1 §11.4): exercised at M2 (initial), M3 (after settings rework), M6 (after scope refactor).
6. **Property-style tests** (v1.1 §11.4): `Immutability`, `Idempotency`, `Reproducibility`, `Cleanup completeness`, `Lockfile completeness`, `Scope isolation`, `Migration atomicity`, `Bundle conflict surfacing`.
7. **Test naming follows the rule from `02_tdd_practices.md`:** `should [expected behavior] when [condition]`.
8. **Platform matrix:** macOS + Linux symlink path tested fully (CI). Windows runs a reduced suite until v2.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R1.** Migration corrupts user state. | Low | High | Atomic staging-then-rename per v1.1 §4.5.2; archive preserved on success; failure points map to recoverable states (see migration recovery table in v1.1 §4.5.3). Fault-injection tests for each migration step. |
| **R2.** Drift refusal disrupts users mid-task. | Medium | Medium | Clear error message with two-line resolution hint (v1.1 §8.4); `--force` always available. `bgng doctor` previews drift before `write` is run. |
| **R3.** Scope shift (global → project-local) confuses users with existing global state. | High | Medium | Documented in v1.1 §14.2 as a Behavior Change; `bgng store migrate --cleanup-legacy-orphans` is the explicit recovery; doctor flags orphans. The knowledge doc revision in M6 explains the new behavior. |
| **R4.** `_bgng` meta-block confuses settings.json readers (e.g., Claude Code UI shows it as an unknown key). | Medium | Low | The `_bgng` key starts with an underscore (a convention many tools treat as private). If Claude Code surfaces it, mitigation is filing an issue with the Claude Code team; UI noise is cosmetic, not functional. v1.1 §10 documents the `_bgng` choice. |
| **R5.** Bundle conflict algorithm picks wrong version in edge cases (prereleases, conflicting prerelease tags). | Medium | Medium | Comprehensive test matrix in `test/core-bundle-resolver.test.ts`. Prereleases excluded by default per v1.1 §7.4; explicit opt-in via `-beta` constraints. |
| **R6.** Test infrastructure for `npm pack` is fragile (real npm calls in tests are slow and network-dependent). | Medium | Medium | Fixture-based file-system mock registry (see Testing Strategy §4). Real `npm pack` only in a separate, opt-in integration suite gated by `RUN_NPM_PACK_TESTS=1`. |
| **R7.** Diagnostics refactor (M7) breaks existing `status` / `doctor` output. | Low | Low | Existing rendering preserved as the default; section builders are an internal refactor. Snapshot tests of current output added in M0 so M7 has a regression net. |
| **R8.** Stale references to the rejected `BGNG_STORE_ROOT` option creep back into code or docs. | Low | Low | v1.1 §11.6 now standardizes on `AGENTS_DIR`; M0 includes a reference cleanup check. |
| **R9.** Per-project read semantics for Claude Code / Codex / Cursor differ from assumption (v1.1 §12 Q1). | Medium | High | Empirical verification before M6 PR opens. If a tool's behavior differs, M6's implementation accommodates it; if accommodation breaks the architecture, escalate (potentially defer M6 and ship M0-M5 as a partial v1). |

---

## Notes

### Course-corrections Applied

The readiness-review course-corrections are now reflected in both this plan and `29_harness-cards-target-architecture-v1_1.md`:

- **A5 / R8:** test isolation uses the existing `AGENTS_DIR` convention; `BGNG_STORE_ROOT` is rejected.
- **A8:** MCP definition precedence is `card-inline > user library > packaged baseline`.
- **A9:** M0 is a baseline-sync PR because part of the CLI gap work already exists in the current workspace.

### Cross-references

- The **Findings → Strategies → Milestones** mapping is in `28_harness-cards-architecture-assessment.md` Appendix §A3.
- The **Strategies → v1.1 doc sections** mapping is in `29_harness-cards-target-architecture-v1_1.md` Appendix §A1.
- This plan's **Milestones → Strategies** mapping is in `29_harness-cards-target-architecture-v1_1.md` §15.

### Open work that lives outside this plan

Per `29_harness-cards-target-architecture-v1_1.md` §12, four items remain genuinely open and are not part of this plan:

1. **Verification of per-project read semantics** for Claude Code, Codex, Cursor (before M6 lands; see R9).
2. **`bgng card list` default sort order** (lean: alphabetical by `@scope/name`; implemented as part of M5 with a documented `--sort` future).
3. **`bgng card outdated` exit code** (lean: zero by default; `--check` returns non-zero for CI; implemented in M5).
4. **Extension versioning** (deferred to v2 of the architecture; not in scope).

### What's deliberately deferred to v2 of the harness

Per v1.1 architecture §13: git URL specifiers, remote store sync, Windows project-scoped writes, transitive card deps, card parameters, `bgng card move`, `mcpBundles` field, auto-migration, `bgng store repair`. None of these is on the v1 critical path.

### Commit conventions

Per `.ai/rules/01_git.md`:

- Use `[refactor]`, `[feat]`, `[test]`, `[docs]`, or another prefix allowed by `.ai/rules/01_git.md`.
- Each milestone is one PR; commits within the milestone may be incremental but should pass tests at each commit (TDD red-green-refactor cadence).
- Do not commit `.ai/` files unless explicitly instructed (per the git rule).
- The architecture-doc revisions in M0 are an exception — they should be committed alongside the M0 code, with a clear `[docs] finalize cards architecture v1.1` commit subject.

### Branch naming

Per `.ai/rules/01_git.md`:

- `feat/cards-m0-baseline-sync`
- `feat/cards-m1-store-schema`
- `feat/cards-m2-write-record`
- `feat/cards-m3-managed-fields`
- `feat/cards-m4-author-commands`
- `feat/cards-m5-consumer-commands`
- `feat/cards-m6-project-local-materialization`
- `feat/cards-m7-diagnostics-extension`

Each branch from `main` after the prior milestone merges.

---

## Appendix: Quick reference for the M0 baseline-sync PR

Per `.ai/rules/02_tdd_practices.md`, M0 begins by verifying the already-present baseline, then adds the missing clean-cut command rename:

1. Run `bun test test/commands-search.test.ts test/commands-skills-mutate.test.ts test/commands-init.test.ts`. Expected: PASS. If it fails, restore the baseline before changing command paths.
2. Write failing tests for `bgng extensions add <name>` and for `bgng add extension <name>` being unregistered.
3. Move the command implementation from `cli/commands/add/extension.ts` to `cli/commands/extensions/add.ts`; update class name and help examples.
4. Update `cli/index.ts` registration.
5. Run the new extension-add tests and the baseline tests. Expected: PASS.
6. Move `.ai/analyses/26_harness-cards-target-architecture.md` to `.ai/analyses/26_archive/26_harness-cards-target-architecture.md`.
7. Run `rg "29_harness-cards-target-architecture-v2|BGNG_STORE_ROOT" .ai cli test README.md` and remove stale active references, leaving only historical notes that explicitly say the option was rejected.
8. Open PR `feat/cards-m0-baseline-sync` with a PR description that includes the `usage.details` / `usage.examples` style guide.

That PR is the gate. Once it merges, M1 begins.
