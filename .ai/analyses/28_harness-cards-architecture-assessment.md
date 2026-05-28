# Harness Cards: Architecture Assessment Against Codebase Reality

**Date**: 2026-05-20
**Status**: Final assessment; implementation decisions superseded by `29_harness-cards-target-architecture-v1_1.md`
**References**: [analyses/26_harness-cards-target-architecture.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/25_harness-cards-cli-design.md, analyses/27_cli_help_gap_analysis.md, knowledges/02_per-project-config-guide.md, knowledges/03_npm-skill-bundles-guide.md, cli/core/sync.ts, cli/core/paths.ts, cli/core/skills.ts, cli/core/mcp.ts, cli/core/diagnostics.ts, cli/core/project.ts, cli/core/types.ts, cli/core/skill-packages.ts, cli/core/mcp-library.ts, cli/commands/write.ts, cli/commands/status.ts, cli/commands/doctor.ts, cli/commands/add/extension.ts, cli/commands/search/mcp.ts, registry/mcp-servers.json]

---

## Executive Summary

The target architecture draft in `26_harness-cards-target-architecture.md` is internally coherent, semantically clean, and well-grounded in proven prior art (uv, pnpm). Its declared "clean-cut" stance — one schema, one CLI surface, one materialization path — is a real strength: there is no v1-vs-v2 branching debt to manage during implementation.

The gap between that design and the present codebase, however, is **larger than the doc's framing implies**, and contains one change that is undocumented as a behavior break for existing users:

1. **The store does not exist.** None of `~/.agents/bgng/cards/`, `~/.agents/bgng/sources/`, `~/.agents/bgng/skills/`, `~/.agents/bgng/mcp-servers/`, `machine.json`, `store.json`, `card.lock`, or `write-record.json` is referenced anywhere in code. The two folded-in directories (`~/.agents/library/`, `~/.agents/packages/skills/`) live at different paths today.
2. **`bgng write` materializes to global tool directories today** (`~/.claude/skills/`, `~/.codex/skills/`, `~/.cursor/mcp.json`). The design (§4.1, §8.3, §14) silently flips this to project-local materialization (`<project>/.claude/skills/`, etc.) for any directory with a discovered project config. This is a meaningful breaking change for every existing user and is not surfaced as such in the design's "Surface Summary" section.
3. **Settings-file write strategy is incompatible.** Current code does a full-file JSON rewrite for `settings.json` and a section-level rebuild for `config.toml`; neither tracks managed fields, neither refuses on drift, and neither preserves user edits in the way the design's `_bgng` meta-field approach requires. The design's "managed-field" mechanism is a from-scratch build.
4. **Cleanup logic is asymmetric.** The current pipeline warns on stale symlinks but never removes them (`cli/core/skills.ts:333-342`). The design's cleanup story (§8.5) requires `write-record.json` to exist *before* any safe removal can happen. The write-record is not optional; it is a hard prerequisite for the cleanup invariants.
5. **MCP server definitions in the card model are underspecified.** A card's `servers` field uses keys (`"context7": { "enabled": true }`) but the design never says where the *definition* of `context7` resolves from when the card does not ship it inline. Today, that resolution comes from the packaged registry plus `~/.agents/library/mcp-servers.json`. The cards model needs to either preserve that path or add a `mcpBundles` analog to `bundles`.

There are also three smaller but real issues that the design should resolve before implementation:

6. The `bundles` field can produce **multi-card bundle version conflicts** with no documented resolution rule.
7. The proposed **first-run migration** of `library/` and `packages/skills/` is described as a one-shot but has no failure semantics, no backup story, and no command surface.
8. **`bgng status` and `bgng doctor` are monolithic today** (`cli/commands/status.ts`, `cli/commands/doctor.ts`); extending them with `--explain`, `--why <name>`, and card sections is achievable but is an inline refactor, not a plug-in.

The CLI surface itself (§6) collides with nothing. `apply`, `update`, `card`, and `store` are all clean namespaces today. The Clipanion `Command.Usage()` helper already supports `details` and `examples`, so the gap analysis's recommendation to enrich per-command help (`27_cli_help_gap_analysis.md` §5.1) is a content task, not a refactor — and it should be done in concert with cards rollout, not after.

Net assessment: the design is sound; the implementation is bigger than the draft states; fifteen concrete strategies (S1–S15) below resolve every finding and convert the assessment into an implementation-ready position. The strategies define eight sequenced milestones (M0–M7, Appendix §A3) and a first TDD slice (§A4). The architecture revision called for by S15 now exists as `29_harness-cards-target-architecture-v1_1.md`; where this assessment and v1.1 differ, v1.1 is authoritative.

---

## Context

The user asked for a rigorous review of `26_harness-cards-target-architecture.md` against the current state of the `beginning-harness` codebase, taking into account:

- The CLI design snapshot in `25_harness-cards-cli-design.md` (superseded by §6 of the target architecture).
- The current CLI gaps and bugs catalogued in `27_cli_help_gap_analysis.md`.
- The existing per-project config model (`02_per-project-config-guide.md`) and skill-bundle model (`03_npm-skill-bundles-guide.md`) that the cards architecture builds on.

The question is **not** "is the design good?" — it largely is. The question is "what must the target architecture say, change, or add before it is a faithful description of the system we will build, in the codebase we have today?"

Method: independent codebase audit (paths, sync pipeline, CLI surface) plus close reading of the design doc against current files and the two referenced knowledge guides. Findings below are anchored to file:line citations from the audit.

---

## Investigation

### 1. What the design assumes exists vs. what exists

| Design artifact | Current reality | Source |
|---|---|---|
| `~/.agents/bgng/cards/<scope>/<name>/<version>/` | Does not exist anywhere in code | grep across `cli/` returns zero hits |
| `~/.agents/bgng/sources/<scope>/<name>/` | Does not exist | grep |
| `~/.agents/bgng/skills/` (folded standalone bundles) | Bundles live at `~/.agents/packages/skills/` | `cli/core/paths.ts:74-88`; `03_npm-skill-bundles-guide.md` §"Local Storage Model" |
| `~/.agents/bgng/mcp-servers/` (folded library) | MCP defs live at `~/.agents/library/mcp-servers.json` (single JSON file, not a directory) | `cli/core/paths.ts:25-31`; `cli/core/mcp-library.ts:43-58` |
| `~/.agents/bgng/machine.json` | Today's file is `~/.agents/bgng/config.json` | `cli/core/paths.ts:21-23`; `cli/core/user-config.ts` |
| `~/.agents/bgng/store.json` (store metadata) | Does not exist | grep |
| `<project>/.agents/bgng/card.lock` | Does not exist | grep |
| `<project>/.agents/bgng/write-record.json` | Does not exist; no write-record concept anywhere | grep |
| `cards: []` in project config schema | Project config schema has no `cards` field | `cli/core/types.ts:84-93`; `cli/core/project.ts:37-42` |

The two folded-in path moves merit one specific call-out the doc undersells: `~/.agents/library/` is currently a **single JSON file** (`mcp-servers.json`), not a directory tree. The design's `~/.agents/bgng/mcp-servers/` plural implies a directory of definitions. That's a *shape* change, not just a path move — every consumer of `loadMcpLibrary()` / `saveMcpLibrary()` (`cli/core/mcp-library.ts:43-58`) is affected.

### 2. The materialization-scope shift is a breaking behavior change

`syncRepository()` (`cli/core/sync.ts:122-168`) resolves all target paths via `resolveToolPaths(homeDir)` (`cli/core/paths.ts:55-63`). Those paths are unconditionally global:

```ts
return {
  claudeSkills: join(homeDir, ".claude", "skills"),
  codexSkills:  join(homeDir, ".codex", "skills"),
  claudeSettings: join(homeDir, ".claude", "settings.json"),
  codexConfig:  join(homeDir, ".codex", "config.toml"),
  cursorMcp:    join(homeDir, ".cursor", "mcp.json"),
};
```

The current model: project config is *discovered* via ancestry walk (`cli/core/project.ts:20-35`), then *merged into* the effective config, and the effective config is *materialized globally*. From the user's perspective, the project config influences what shows up in their home `~/.claude/skills/` while they're working in that project.

The cards design (§4.1, §8.3) materializes to `<project>/.claude/skills/`, `<project>/.codex/skills/`, etc. The "Surface Summary" (§14) tucks this away in one bullet:

> "Materialization scope shifts from global to project-local for any directory with `.agents/bgng/config.json` in its ancestry."

This is the largest user-facing behavior change in the entire design. Every existing user with a project config will, on first `bgng write` after upgrade, see their global `~/.claude/skills/` stop receiving project-specific updates and their project's `<project>/.claude/skills/` start receiving them instead. Tools that read from `~/.claude/skills/` (Claude Code in the user's home) will see different skills than they did before; tools running from the project will see project-specific skills.

This is *probably* the right model — it aligns with how a developer expects a per-project tool to behave — but the design does not:

- Acknowledge it as a breaking change in the executive summary.
- Document what happens to the previously-materialized state in `~/.claude/skills/` (orphan symlinks accumulate? doctor flags them? a one-shot cleanup runs?).
- Explain the migration: does the user need to re-run `bgng write` per-project to repopulate `<project>/.claude/` for each project they have?
- Address Claude Code's reading model: if Claude Code reads from `~/.claude/skills/` *and* `<project>/.claude/skills/`, the user gets duplication; if it reads only one, the migration must be coordinated with Claude Code's expectations.

### 3. Settings-file management is a from-scratch build

The design (§8.3) proposes:

> "Field-level management for settings files. A `_bgng` meta-field declares which top-level keys are managed; bgng rewrites only those fields, leaving the rest of the file untouched."

Current behavior:

- **Claude (`mergeClaudeSettingsText`, `cli/core/mcp.ts:72-79`)**: parses the whole file, overwrites `parsed.mcpServers` wholesale, re-stringifies. User edits to *other* top-level keys (e.g., `model`, `editor`, etc.) round-trip but get JSON-reformatted. There is no managed-field tracking.
- **Codex (`mergeCodexTomlText`, `cli/core/mcp.ts:105-119`)**: strips `[mcp_servers]` and `[mcp_servers.*]` sections via regex, rebuilds, concatenates. This is *closer* to managed-section semantics than Claude's wholesale rewrite, but still has no hashing, no drift detection, no refusal.
- **Cursor (`syncMcp` lines 112-116)**: writes a separate generated file under `~/.agents/generated/cursor-mcp.json` and symlinks `~/.cursor/mcp.json` to it. This is structurally **safer** than the design's `_bgng` approach: the user's `.cursor/mcp.json` is a symlink they can replace at will, and the generated file is internal to bgng.

Two consequences:

1. The design's `_bgng` meta-field is not a polish; it's a re-architecture of the JSON/TOML writers, plus per-field hashing, plus drift-detection refusal, plus a `--force` recovery path. None of these exist (`cli/core/sync.ts:48` is content-diff only; drift surfaces in `doctor` but never blocks `write`).
2. **The design's Cursor approach is a regression from the current Cursor approach.** The generated-file-plus-symlink pattern decouples bgng's writes from the user's settings boundary. Switching Cursor to the `_bgng` meta-field would either invent a meta-field convention Cursor doesn't recognize (potentially noisy in their UI) or require Cursor-specific carve-outs.

### 4. Write-record is a hard prerequisite, not optional polish

The design lists `write-record.json` as a feature (§5.4) and uses it for drift detection and cleanup (§8.4-8.5). The current pipeline:

- Has no record of "what bgng materialized last time."
- Identifies stale symlinks by comparing the *current* desired set against what's *on disk* (`findStaleSymlinks`, `cli/core/skills.ts:231-242`).
- **Warns about stale symlinks but never deletes them** (`cli/core/skills.ts:333-342`).

This is safe today because bgng never deletes; the cost is that orphan symlinks accumulate. Once the cards model needs to remove a card and clean up its skills, "warn but don't delete" is no longer acceptable, and the only safe basis for deletion is a record of `(path, kind, target)` from the prior write. Hence write-record is hard-prerequisite for §8.5 to be implementable safely.

This also means the design's idempotency invariant (§8.7) — "zero disk writes on the second invocation" — is **partially achievable today** (the content-comparison in `cli/core/sync.ts:48` and the realpath check in `cli/core/skills.ts:50` already short-circuit no-op writes) but is not currently *tested*. No test in `test/commands-write.test.ts` or `test/scenarios-user-journeys.test.ts` verifies the property.

### 5. The MCP server definition gap

The card manifest (§5.1) defines `servers` as:

```json
"servers": {
  "context7": { "enabled": true }
}
```

The shape says "toggle a server called `context7`," but the manifest itself does not declare what `context7` is. Two ways the system could resolve the definition:

- **(a)** From inline `mcp-servers/` content shipped in the card (the design hints at this in §4.3).
- **(b)** From the user's library at `~/.agents/bgng/mcp-servers/` (the renamed-and-foldered version of today's `~/.agents/library/mcp-servers.json`).
- **(c)** From the packaged baseline registry (today's `registry/mcp-servers.json` at the harness repo root).

The design doesn't say. Today, resolution goes (c) ← (b) (machine library merges over baseline; `cli/core/sync.ts:125-128`). The cards model fragments this further: cards can be third-party (from npm) and may ship server defs inline.

Three follow-up questions the design should answer:

1. Is there an `mcpBundles` field on cards (analogous to `bundles` for skills) so a card can declare an MCP-server dependency without shipping it inline?
2. When two cards both define `context7` with different inline definitions, what wins — last-card-wins (matching skills) or error (since servers are structural)?
3. Does the packaged baseline registry survive in the cards model, or does the design intend all baseline MCP defs to migrate into a "built-in card" shipped with the harness?

Without resolution, two cards using `context7` would be incompatible in subtle ways and there's no design language to express the dependency.

### 6. Multi-card bundle version conflict

§5.1 introduces `bundles` (skill-bundle dependencies of a card). §5.3 shows the lockfile resolving each bundle once. §7.6 covers multi-card *server/extension/target* conflicts (warn, last-wins). It does **not** cover the case where two cards declare the same bundle with incompatible ranges:

```text
card-a:  bundles: { @x/research-skills: ^1.0.0 }   # resolves to 1.5.0
card-b:  bundles: { @x/research-skills: ^2.0.0 }   # resolves to 2.3.0
```

The lockfile (§5.3) has one `bundles[]` entry per bundle name. There can only be one resolved version. The design needs an explicit rule: pick the highest compatible version (npm-style), pick the last card's range, or fail-loud.

This matters because cards are designed to compose (`cards: [card-a, card-b]` in §4.1's merge stack), and bundle conflicts are the most likely failure mode in real composition.

### 7. The first-run migration needs a real design

§4.4 says:

> "`~/.agents/library/` and `~/.agents/packages/skills/` fold into the store at `~/.agents/bgng/skills/` and `~/.agents/bgng/mcp-servers/` via a one-shot first-run migration."

Open questions the design doesn't cover:

- **Trigger**: does the migration run on first invocation of any `bgng` command, or only on `bgng store migrate`?
- **Atomicity**: if migration fails halfway (disk full, permission error), is the system in a usable state? Are backups created?
- **Idempotence**: what happens if the migration is interrupted and re-run?
- **Detection**: how does bgng know the migration is needed? The presence of `~/.agents/library/` and absence of `~/.agents/bgng/mcp-servers/`?
- **Shape change**: `library/mcp-servers.json` (a single file with a `servers` map) is *not* the same shape as `mcp-servers/<name>.json` (one file per server). The migration must explode the map into separate files. What about IDs, ordering, or any non-`servers` keys in the old file?
- **`config.json` → `machine.json` rename**: is this part of the same one-shot, or separate?

The design's `bgng store migrate` command (§6.4, listed as v1) implies the migration is on-demand, but §4.4 says "first-run," which implies automatic. These contradict.

### 8. Status, doctor, and the `--why` flag

Per `27_cli_help_gap_analysis.md` §3.1, every current command's help is "threadbare": only `category` and `description`. The design (§6.6) introduces:

- `--dry-run` on all mutating commands (mostly present today).
- `--write` to chain into `bgng write` after the operation (no current analog).
- `--json` on all structured-output commands (present on 29/30 commands today; `skills curate` and `skills uncurate` lack it).
- `--explain` on `bgng card status` and `bgng status` (no current analog).
- `--why <name>` on `bgng status` (no current analog).

Three issues:

1. **`--why <name>` is ambiguous across categories.** A skill named `parallel-web-search` and a server named `parallel-web-search` could coexist (unlikely with current names, but the design doesn't forbid it). The flag should either disambiguate (`--why skill:parallel-web-search`) or be split per category (`--why-skill`, `--why-server`, ...).
2. **Current `status.ts` and `doctor.ts` are monolithic** (`cli/commands/status.ts:1-56`, `cli/commands/doctor.ts:1-37`). Extension with card sections, `--explain` resolution trails, and `--why` filters is a refactor of `buildStatusReport` and `buildDoctorReportWithProject` in `cli/core/diagnostics/`. Achievable, but not a "drop in new sections" exercise.
3. **`--write` chaining is novel.** No current command chains; adopting this needs a base-class helper (since `bgng apply --write` and `bgng card apply --write` should share behavior). The design doesn't specify where the chaining helper lives or what its error semantics are (does a successful apply followed by a failing write roll back the apply?).

### 9. Other design-vs-code touchpoints

- **`bgng scan`** is registered today (`cli/commands/scan.ts`, paths `["scan"]`) as a placeholder for future non-mutating discovery. The cards design does not mention it. Decision needed: preserved as-is, repurposed for card discovery, or removed in the clean cut.
- **`bgng add extension`** is the current command (`cli/commands/add/extension.ts:14`); `bgng extensions add` does not exist yet. The clean-cut removal-without-deprecation (per §10's resolved question, no deprecation period) means any user automation that calls `bgng add extension` breaks on upgrade. Acceptable for a pre-1.0 tool, but should be flagged in release notes, not buried in design §10.
- **`bgng search --project` orphan flag** (`cli/commands/search/mcp.ts:48-50`, declared but never threaded into `searchMcp`) is a one-line bug. It should be either fixed or removed *before* the cards work begins; it confuses the help surface that cards will heavily extend.
- **`BaseCommand.Usage()`** is just Clipanion's `Command.Usage()` (`cli/commands/base.ts:1-7` shows the class adds no helper). The fields `details` and `examples` are already supported by Clipanion; populating them is content work. The cards rollout is a natural moment to set the template (init and add extension are obvious first targets, per `27_cli_help_gap_analysis.md` §5.1).
- **No separate store-root env var exists today.** §11.6 of the draft assumed one for test isolation. Today, the test harness uses `agentsDir` injection and the existing `AGENTS_DIR` convention (`test/helpers.ts:63-106`). v1.1 keeps that convention and rejects adding `BGNG_STORE_ROOT`.

---

## Findings

The findings below are derived from the investigation above, numbered for reference in the recommendations. Severity column reflects how much each gap blocks a faithful target-architecture document, not how hard it is to implement.

| # | Finding | Severity |
|---|---|---|
| F1 | Every store path (`cards/`, `sources/`, `skills/`, `mcp-servers/`, `machine.json`, `store.json`) is new. The two folded-in paths change *shape* (file → directory of files for MCP), not just location. | High — design overstates incrementality |
| F2 | Materialization shifts from global to project-local; this is a breaking behavior change for existing users, mentioned only in §14's bullet list. | High — biggest user-facing change, undersurfaced |
| F3 | Settings-file `_bgng` meta-field approach is a from-scratch build; current code does full-file (Claude) or section-level (Codex) rewrites with no field tracking. The proposed Cursor `_bgng` approach is a regression from today's safer generated-file-plus-symlink pattern. | High — mechanism change, and Cursor regression |
| F4 | `write-record.json` is a hard prerequisite for the design's cleanup semantics (§8.5); the current pipeline has no concept of a write record and the existing `findStaleSymlinks` only warns. | High — gates §8.5 entirely |
| F5 | MCP server definition resolution in cards is underspecified: `servers: { context7: { enabled: true } }` does not say where `context7`'s definition comes from. No `mcpBundles` analog to `bundles`. | High — likely compatibility bug at first multi-card test |
| F6 | Multi-card *bundle* version conflicts have no documented resolution rule (server/extension/target conflicts have one per §7.6). | Medium |
| F7 | First-run migration (§4.4) has no failure semantics, no atomicity story, no command-vs-auto trigger clarity. The `mcp-servers.json` → `mcp-servers/*.json` is a shape change requiring explosion. | Medium |
| F8 | `--why <name>` is ambiguous across skill/server/extension/target categories with the same name. | Low |
| F9 | `bgng status` / `bgng doctor` extensibility is described as "extended" but they are monolithic today; extension is an inline refactor of `cli/core/diagnostics`, not a plugin. | Low — implementation cost, not design correctness |
| F10 | `bgng scan` is preserved as a current placeholder; the cards design doesn't mention it. Decision: preserve, repurpose, or remove. | Low |
| F11 | `--write` chaining is novel; rollback semantics on chained failure are unspecified. | Low |
| F12 | `bgng search --project` orphan flag and `skills curate` / `skills uncurate` missing `--json` are preexisting bugs that confuse the help surface the cards rollout will heavily extend. | Low — preexisting, but should be cleaned with cards |
| F13 | Idempotency invariant (§8.7) is partially achievable today but is not currently tested anywhere. | Low — test gap |
| F14 | The draft's `BGNG_STORE_ROOT` env var (§11.6) would duplicate the current harness's injected `agentsDir` / `AGENTS_DIR` convention. | Trivial |
| F15 | CLI namespace surface (§6) collides with nothing today. `apply`, `update`, `card`, `store` are all clean. `Command.Usage()` already supports `details`/`examples`. | Positive — nothing to do |

---

## Resolution Strategies

Each strategy resolves one or more findings. The format for each entry is **Decision → Mechanism → Sequencing → Validation**. The sequencing column maps to milestones M0–M7 enumerated in Appendix §A3.

### S1. Re-shape the store; treat the layout migration as one explicit directory move (F1)

**Decision.** Adopt the new store layout exactly as designed (§4.3), with one correction: `~/.agents/bgng/mcp-servers/` is a **directory of `<server-id>.json` files**, not a single file. Today's `~/.agents/library/mcp-servers.json` is a single JSON file with a `servers` map; the migration must explode the map into individual files.

**Mechanism.**
- New paths under `~/.agents/bgng/`:
  - `machine.json` (renamed from current `config.json`)
  - `store.json` (schema version, init timestamp)
  - `cards/<scope>/<name>/<version>/`
  - `sources/<scope>/<name>/`
  - `skills/<scope>/<pkg>/<version>/` (moved from `~/.agents/packages/skills/`)
  - `mcp-servers/<server-id>.json` (one file per server, exploded from current single-file `servers` map)
  - `generated/` (preserved from current location for cursor outputs)
  - `cache/`
- `cli/core/paths.ts` exposes new resolvers (`resolveStoreRoot`, `resolveCardsRoot`, `resolveSourcesRoot`, `resolveMcpServerDir`, `resolveMcpServerFile(id)`, `resolveSkillBundleRoot`, `resolveMachineConfigPath`); old resolvers are removed in the same PR (clean cut).
- Each per-server file mirrors today's `RegistryServer` shape exactly — no schema changes per server, only the location and the file-per-record factoring. The top-level `version` from `mcp-servers.json` moves into `store.json`.

**Sequencing.** M1 (foundation milestone). Must land before any card-specific code.

**Validation.** Unit tests on path resolvers; an integration test that runs `bgng store migrate` against a fixture with the old layout and verifies the resulting tree (paths, file contents, file count) byte-for-byte against an expected snapshot.

---

### S2. Materialization scope shift is correct; surface it, gate it, make orphans removable on demand (F2)

**Decision.** Project-local materialization is the right model and aligns with Claude Code, Codex, and Cursor's native project-config conventions. Adopt it. Treat any pre-cards content under global `~/.claude/skills/` and `~/.codex/skills/` as bgng-owned-but-stale, *scannable and removable via explicit user action* — **never auto-deleted**.

**Mechanism.**
- `cli/core/paths.ts` grows a `resolveToolPaths(scope)` signature taking a discriminated union:
  ```ts
  resolveToolPaths(
    { kind: "project", projectRoot: string } | { kind: "machine", homeDir: string }
  )
  ```
  Project scope returns paths under `<projectRoot>/.claude/`, `<projectRoot>/.codex/`, `<projectRoot>/.cursor/`. Machine scope returns paths under `homeDir` — same as today.
- `syncRepository` (`cli/core/sync.ts:122-168`) is refactored to determine scope from project-config discovery (already happens at line 136) and pass it into `resolveToolPaths`. Outside any project, the machine-scope branch runs from `machine.json`.
- **Orphan handling at migration time.** During `bgng store migrate`, scan `~/.claude/skills/` and `~/.codex/skills/` for symlinks whose `realpath` resolves into any of: `~/.agents/skills/` (the old curated layer), `~/.agents/packages/skills/`, or any path no longer reachable in the new layout. These are unambiguously bgng-owned. Offer (interactive prompt or `--cleanup-legacy-orphans` flag) to remove them. Symlinks pointing into the harness repo (`<repoRoot>/skills/...`) are bgng-owned too, but kept by default because they still resolve and the user may want global access.
- `bgng doctor` gains a check: "legacy orphans in `~/.claude/skills/` / `~/.codex/skills/` from a pre-cards install" with the remediation hint to run `bgng store migrate --cleanup-legacy-orphans`.
- Settings-file orphan handling (the `mcpServers` key in a global `~/.claude/settings.json` populated by pre-cards bgng) is handled by S3's `_bgng` block — if that block is missing, the next project-local `write` does not touch the global file.

**Sequencing.** M6 — last because it composes on top of write-record (M2), settings rework (M3), card materialization (M5). Project-local write is the integration test for everything that came before.

**Validation.**
- Property test: running `bgng write` inside a project never modifies any path under `~/.claude/`, `~/.codex/`, `~/.cursor/`.
- Property test: running `bgng write` outside any project never modifies any path under `<anyProject>/.claude/`, etc.
- End-to-end fixture test for legacy orphan cleanup: simulate a pre-cards `~/.claude/skills/` tree, run migrate with cleanup, verify result.

---

### S3. Three-mechanism materialization, preserving Cursor's safer pattern (F3)

**Decision.** Three distinct mechanisms, not two:
- **Skills** — directory symlinks (preserved from today; only the symlink target paths change to card-versioned).
- **Claude `settings.json` and Codex `config.toml`** — `_bgng` meta-block with managed-key/section hashing.
- **Cursor `.cursor/mcp.json`** — generated-file-plus-symlink (preserved from today; the design's `_bgng`-in-cursor proposal is *rejected* as a regression).

**Mechanism — `_bgng` meta-block (Claude and Codex).**
- `settings.json` gains a top-level `_bgng` key:
  ```json
  {
    "_bgng": {
      "version": 1,
      "managedKeys": ["mcpServers"],
      "fieldHashes": { "mcpServers": "sha256-..." },
      "lastWriteAt": "2026-05-20T10:00:00Z"
    },
    "mcpServers": { ... },
    "anyUserKey": "preserved verbatim"
  }
  ```
- `config.toml` gains a `[_bgng]` table with the same fields, and `managedSections` instead of `managedKeys`:
  ```toml
  [_bgng]
  version = 1
  managedSections = ["mcp_servers"]
  sectionHashes = { "mcp_servers" = "sha256-..." }
  lastWriteAt = "2026-05-20T10:00:00Z"
  ```
- Write algorithm:
  1. Read existing file; parse; extract `_bgng` block (or empty if first write).
  2. For each managed key/section, compute current hash from the file's content; compare with stored hash.
  3. **Hash mismatch ⇒ drift.** Refuse write with the message in §8.4, offering `--force` to overwrite.
  4. Compute new values from effective state; hash them.
  5. If new hashes match stored hashes (no source change) and on-disk hashes match stored hashes (no drift), skip write entirely (idempotency).
  6. Otherwise, write: managed keys + non-managed keys (preserved verbatim) + updated `_bgng` block.

**Mechanism — Cursor (generated-file-plus-symlink, preserved).**
- The generated file moves to `<scope>/.agents/bgng/generated/cursor-mcp.json` (machine scope or project scope).
- `<scope>/.cursor/mcp.json` is a symlink to the generated file.
- Drift detection here is: "is `<scope>/.cursor/mcp.json` still a symlink to where we recorded?" If the user replaced it with a real file, treat as drift; refuse with `--force` as in S3-Claude/Codex.
- No `_bgng` block in `cursor-mcp.json` — the file is fully bgng-owned.

**Sequencing.** M3 (settings-file rework). Depends on write-record (M2).

**Validation.**
- Unit tests for hash computation on each managed key (deterministic, stable across runs).
- Integration test: hand-edit `mcpServers` in `settings.json`, run `bgng write`, expect refusal; re-run with `--force`, expect overwrite.
- Integration test: replace cursor symlink with a real file, run `bgng write`, expect refusal; re-run with `--force`, expect symlink restoration.
- Property test: `_bgng` block stable across two consecutive no-op writes (idempotency under managed-field tracking).

---

### S4. `write-record.json` is first-class infrastructure with explicit fallback semantics (F4)

**Decision.** Implement `write-record.json` as designed (§5.4), with explicit corruption/missing semantics. It is a hard prerequisite for both drift detection (§8.4) and cleanup (§8.5); it is not optional polish.

**Mechanism.**
- Schema follows §5.4 exactly: `writeRecordVersion`, `lastWriteAt`, `lastWriteHarnessVersion`, `managedPaths[]` with per-path `kind` (`symlink` or `managed-fields`), `target`, and (for managed-fields) `fields[]` + `fieldHashes`.
- Location: `<projectRoot>/.agents/bgng/write-record.json` for project scope; `~/.agents/bgng/global-write-record.json` for machine scope.
- **Gitignored** by default; `bgng init` writes a `.gitignore` line for it alongside the project config.
- **Atomic writes.** Write to `write-record.json.tmp`, fsync, rename. Never directly overwrite. (Same convention is recommended for `card.lock` operations.)
- **Missing or corrupt fallback.** If the file is absent, malformed JSON, or fails schema validation, treat it as empty (no record of prior writes). The next `bgng write` will not be able to detect drift (there's nothing to compare against), but will:
  1. Refuse to remove any path that's already on disk (cleanup phase becomes a no-op).
  2. Print a one-line warning: "no prior write-record; treating all existing on-disk state as user-owned for this write."
  3. Proceed with materialization; subsequent writes recover normal semantics.
- `bgng doctor` validates write-record consistency: every `managedPaths[]` entry must exist on disk and match its recorded kind/target.

**Sequencing.** M2. Must land before settings rework (M3), card consumer commands (M5), and project-local materialization (M6).

**Validation.**
- Corruption scenarios: truncated file, invalid JSON, missing required field, hash-shape mismatch — all map to "treat as empty."
- Atomic-write fault injection: kill the process between tmp-write and rename; verify recovery.
- Cleanup invariant: when a card is removed and `bgng write` re-runs, every symlink recorded in the prior write-record that's no longer desired and still resolves to its recorded target is removed; symlinks that have been replaced by user content are warned about and preserved.

---

### S5. Three-layer MCP server resolution; no `mcpBundles` in v1 (F5)

**Decision.** Cards' `servers: { <id>: { enabled: true } }` field resolves the *definition* of `<id>` via a fixed three-layer precedence:

1. **Card-inline** (`<card>/mcp-servers/<id>.json`) — highest priority among cards; last-card-wins on conflict.
2. **Packaged baseline** (`<repo>/registry/mcp-servers.json` — the file shipped with the harness).
3. **User library** (`~/.agents/bgng/mcp-servers/<id>.json` — the migrated user-level overlay).

Project overlay's inline `servers` definitions apply last (highest precedence overall). **No `mcpBundles` field in v1.** Defer that to v2 only if real demand emerges.

**Mechanism.**
- Resolution happens during `bgng write` (and `bgng status`/`doctor` for inspection):
  1. Start from the packaged baseline registry (today's `loadRegistry` at `cli/core/registry.ts`).
  2. Overlay the user library (today's `mergeUserMcpLibrary` at `cli/core/defaults.ts`, with the new file-per-record loader replacing today's single-file loader).
  3. For each card in declared order, overlay its inline `mcp-servers/` definitions, then apply its `servers` toggles.
  4. Apply the project overlay's `servers` field last (today's `mergeProjectConfig` semantics preserved).
- Inline-definition conflict between two cards: last-wins (matches the skills, extensions, and targets pattern); emit a warning per §7.6's existing rule when the definitions are *structurally* different.
- Toggle of an undefined server (no card-inline, no baseline, no library hit) ⇒ doctor flags it as "unknown server reference"; write skips it with a warning.

**Sequencing.** M5 (the card consumer commands, where servers come into play during apply/write).

**Validation.**
- Resolution-order tests: (a) baseline-only, (b) library-overrides-baseline, (c) card-inline-overrides-library, (d) last-card-wins-on-inline, (e) overlay-wins-last.
- Negative tests: toggling an unknown server, defining two cards with structurally different definitions for the same id (warning expected, last-wins applied).

---

### S6. Bundle conflict algorithm: intersect ranges, pick highest; fail on empty intersection (F6)

**Decision.** When two cards declare the same `bundles[]` entry with different ranges, intersect the ranges and pick the highest version satisfying the intersection. If the intersection is empty, fail at `apply`/`update` with an actionable error listing both cards and both ranges.

**Mechanism.**
- Resolution algorithm extension to §7.4: after collecting all bundle constraints from all cards in declared order, group by bundle name. For each group:
  1. Compute the intersection of all ranges (`semver.intersects` style).
  2. From the union of available versions (local store + registry per current step 2 of §7.4), pick the highest version satisfying the intersection.
  3. If the intersection is empty, fail with this error shape:
     ```text
     Bundle conflict: @x/research-skills
       card @me/baseline declares ^1.0.0 (via cards[0])
       card @me/extras   declares ^2.0.0 (via cards[1])
     No version satisfies both ranges.
     
     Resolutions:
       - bump @me/baseline to a version that uses @x/research-skills@^2.0.0
       - or remove one of the cards
     ```
- Lockfile records the single resolved bundle version; provenance (which cards contributed which ranges) is computed on demand from the manifests, not stored.

**Sequencing.** M5 (where card resolution lands).

**Validation.** Tests for: overlapping ranges resolving to highest; disjoint ranges failing with the above error; one card pinned exactly, other with a range that includes the pin; three-card chain with progressively narrower ranges.

---

### S7. Migration is one explicit, atomic `bgng store migrate` command; auto-migration is rejected for v1 (F7)

**Decision.** Migration is an explicit command. The trigger for users is a warning at the top of every bgng command output when legacy layout is detected. **No silent auto-migration in v1.**

**Mechanism.**

**Trigger detection.** At the start of any `bgng` command, check both:
- Presence of `~/.agents/library/` *or* `~/.agents/packages/skills/`, AND
- Absence of `~/.agents/bgng/store.json`.

If both conditions hold, print to stderr:
```text
WARNING: pre-cards layout detected. Run `bgng store migrate` to upgrade.
```
Then proceed. Old commands use their existing path resolvers (which remain functional in M1 alongside the new ones, marked deprecated and removed at M2's end).

**`bgng store migrate` algorithm.**
1. Validate readability of all source paths.
2. Create staging directory `~/.agents/bgng.staging-<ISO-timestamp>/`.
3. Build the new layout in staging:
   - `cp ~/.agents/bgng/config.json <staging>/machine.json` (rename).
   - Read `~/.agents/library/mcp-servers.json`. For each `(id, definition)` in `servers`, write `<staging>/mcp-servers/<id>.json` (preserving every field; the top-level `version` from the source goes into `store.json`, not per-server).
   - `mv ~/.agents/packages/skills/* <staging>/skills/` (or hardlink to preserve disk space; document either choice).
   - Generate `<staging>/store.json` with `schemaVersion: 1` and current timestamp.
   - Create empty `<staging>/cards/`, `<staging>/sources/`, `<staging>/cache/`.
4. Validate staging: every source file has a destination; counts match; every produced JSON parses; no orphans in either direction.
5. Move `~/.agents/bgng/` → `~/.agents/bgng.archive-<timestamp>/`.
6. Move `~/.agents/library/` and `~/.agents/packages/` into the same archive directory.
7. Rename `~/.agents/bgng.staging-<timestamp>/` → `~/.agents/bgng/`.
8. Print:
   ```text
   Migration complete.
   Pre-cards layout archived to ~/.agents/bgng.archive-<timestamp>/.
   Verify your harness still works, then remove the archive:
     rm -rf ~/.agents/bgng.archive-<timestamp>
   ```

**Failure recovery.**
- Failure before step 5: staging directory preserved; old layout fully intact; user can `rm -rf ~/.agents/bgng.staging-*` and retry.
- Failure between steps 5 and 7: archive directory present; new bgng directory missing. The user (or a future `bgng store repair`) can rename the archive back. Document this manual recovery step until `repair` ships.
- Failure after step 7: migration is complete by definition; any subsequent error is unrelated to the move.

**Orphan cleanup as a separate sub-action.** `bgng store migrate --cleanup-legacy-orphans` runs steps 1–8 above *and then* the orphan scan described in S2. Separate flag because some users will want to keep global `~/.claude/skills/` populated for tools that read from it.

**Sequencing.** M1 (foundation), runs after store schema is implemented.

**Validation.** End-to-end fixture tests for: empty store (only `config.json`), library-only (config + library), library + skills (config + library + packages), full state (all of above plus an active project). Fault injection: kill the process at each step boundary; verify recovery state is sane.

---

### S8. `--why` syntax: `<category>:<name>`, fall back to ambiguity-prompt (F8)

**Decision.** `--why` accepts `<category>:<name>` syntax. Without the prefix, search all categories. If unique, use it; if ambiguous, exit with a hint listing the matches.

**Mechanism.**
- Categories: `skill`, `server`, `extension`, `target`, `card`.
- Examples:
  - `bgng status --why skill:parallel-web-search` — explicit; show resolution trail.
  - `bgng status --why parallel-web-search` — search all categories; if uniquely a skill, show that trail.
  - If `parallel-web-search` matches both a skill and a server, exit with:
    ```text
    Ambiguous --why argument: parallel-web-search matches both:
      skill:parallel-web-search
      server:parallel-web-search
    Disambiguate with: --why skill:parallel-web-search
    ```
- Resolution trail content per category is the responsibility of the corresponding diagnostics section builder (see S9).

**Sequencing.** M7 (status/doctor extensions).

**Validation.** Tests for: unique-name match, prefixed match, ambiguous-name disambiguation, unknown name (clean "not found" error).

---

### S9. Diagnostics into section builders; cards plug in as new sections (F9)

**Decision.** Convert `buildStatusReport` and `buildDoctorReport` in `cli/core/diagnostics.ts` into section-composing functions. Each conceptual section (machine, skills, mcp, extensions, project, cards, store) is a self-contained typed builder. New sections (cards, store, write-record drift) are added by writing a new builder — not by editing a monolithic function.

**Mechanism.**
- New shared type:
  ```ts
  interface DiagnosticsContext {
    repoRoot: string;
    agentsDir: string;
    homeDir: string;
    projectConfigPath?: string | null;
    effectiveConfig: CanonicalConfig;
    effectiveRegistry: CanonicalRegistry;
    // ...
  }
  ```
- Each section builder is `(ctx: DiagnosticsContext) => Promise<Section<T>>` where `T` is the section's own shape.
- Top-level `buildStatusReport(ctx)` composes:
  ```ts
  return {
    machine: await buildMachineSection(ctx),
    skills: await buildSkillsSection(ctx),
    mcp: await buildMcpSection(ctx),
    extensions: await buildExtensionsSection(ctx),
    cards: await buildCardsSection(ctx),      // new at M4-M5
    store: await buildStoreSection(ctx),      // new at M1
    project: ctx.projectConfigPath ? await buildProjectSection(ctx) : undefined,
  };
  ```
- `--explain` and `--why` are interpreted at the section level: `--why skill:foo` triggers `buildSkillsSection`'s "explain trail for foo" branch.
- Renderer layer (`cli/core/output.ts` and per-command `render` helpers) maps section type → renderer. JSON output is the typed object verbatim; text output is per-section.

**Sequencing.** M7 (after the rest of cards lands, so the new sections have meaningful content to render). Some refactoring scaffolding can land earlier (M1) to make section addition cheap.

**Validation.** Each section builder gets its own unit tests. Integration tests verify section composition in both `status` and `doctor`.

---

### S10. Preserve `bgng scan` as a non-card discovery surface; one-line acknowledgment in §6 (F10)

**Decision.** Keep `bgng scan` as-is. Add one line to architecture §6 noting it is a separate non-card surface for future non-mutating discovery. No code change. YAGNI — don't repurpose or remove until a real driver appears.

**Mechanism.** No code change to `cli/commands/scan.ts`. The architecture doc revision (per S15-driven §6 update) gains one line:

> "`bgng scan` is preserved as a non-mutating local discovery surface, orthogonal to cards. Cards-specific discovery uses `bgng card list` / `bgng card show`."

**Sequencing.** Lands with the architecture doc revision (concurrent with M0). Zero code work.

**Validation.** None needed.

---

### S11. `--write` chains without rollback; document the contract explicitly (F11)

**Decision.** `--write` chains `bgng write` after a successful mutating operation (`apply`, `add`, `pin`, `remove`, `update`). **No rollback.** If the mutating operation succeeds and the chained `write` fails, the project config and lockfile remain mutated; the user re-runs `bgng write` after addressing the issue. Exit code reflects the latest failure.

**Mechanism.**
- New helper, suggested location `cli/core/chain.ts`:
  ```ts
  export async function chainWrite(
    ctx: AgentsContext,
    options: { dryRun?: boolean },
  ): Promise<number> {
    // returns the exit code from running `bgng write` with the given options
  }
  ```
- Each `--write`-supporting command class calls `chainWrite(this.context, { dryRun: this.dryRun })` after its own mutation succeeds and returns the chain's exit code.
- Help text on every `--write`-supporting command includes:

  > "On success, runs `bgng write`. On chained-write failure, the mutation is preserved; rerun `bgng write` after addressing the issue."

**Sequencing.** M5 (when `apply`/`add`/etc. are first registered with the `--write` flag).

**Validation.** Unit tests on `chainWrite`: returns 0 on success, returns the write exit code on failure. Integration test: `bgng card apply X --write` with a deliberately broken card; assert mutation is committed and write returns non-zero.

---

### S12. CLI gap-analysis cleanups land in M0 (F12)

**Decision.** All three preexisting CLI cleanups land alongside M0 (cards prep), not in a separate batch:
- Remove `--project` orphan flag from `search mcp` and `search skill`.
- Add `--json` to `skills curate` and `skills uncurate` for parity.
- Populate `usage.details` and `usage.examples` on `init`, on the rename `extensions add` (the post-cut replacement for `add extension`), and on every new `bgng card` / `bgng store` command from day one.

**Mechanism.**
- `cli/commands/search/mcp.ts:48-50` and `cli/commands/search/skill.ts:48-50`: delete the `project = Option.Boolean(...)` declaration. Re-add when ranking-hint logic actually lands.
- `cli/commands/skills/curate.ts` and `cli/commands/skills/uncurate.ts`: add `json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." })` and a corresponding JSON-emit branch in `execute()`.
- Clipanion's `Command.Usage()` already supports `details` and `examples`. Use it directly — no `BaseCommand` extension needed. Establish the template by populating `init` and `extensions add` first, then every new card/store command.

**Sequencing.** M0 (cards prep). Independent fixes; do not block on cards but ship in the same release.

**Validation.**
- Test: `bun cli/index.ts search mcp --help` does not list `--project`.
- Test: `bun cli/index.ts skills curate <name> --json` emits valid JSON.
- Help-render tests: assert `details` and `examples` are populated on the targeted commands.

---

### S13. Idempotency invariant becomes a property test, exercised at each materialization milestone (F13)

**Decision.** Add the §8.7 idempotency invariant ("two runs, zero writes") as a property test in §11.4. Landed in M2 (write-record), validated again in M3 (settings rework) and M6 (project-local materialization).

**Mechanism.**
- Test shape:
  ```ts
  it("emits zero changes on a no-op second write", async () => {
    const first = await syncRepository(opts);
    expect(first.changes.length).toBeGreaterThan(0);  // baseline materialization
  
    const second = await syncRepository(opts);
    expect(second.changes).toEqual([]);
    expect(second.warnings).toEqual([]);
  });
  ```
- Fixture variants: empty project, project with one card, project with multiple cards, project with overlay-only, machine scope (no project).
- Test is part of the CI required-pass set; regressions are caught at PR time.

**Sequencing.** Initial landing M2; re-runs (with expanded fixtures) at M3 and M6.

**Validation.** The test itself is the validation. Regression of any change anywhere in the write pipeline that adds a spurious write will fail this test.

---

### S14. Reuse `AGENTS_DIR` for test isolation (F14)

**Decision.** Do not add `BGNG_STORE_ROOT`. Reuse the existing `AGENTS_DIR` / injected `agentsDir` convention for test isolation so the codebase has one store-root override path.

**Mechanism.**
- `cli/core/store-paths.ts` and migrated path helpers continue to accept `agentsDir` as an explicit option.
- CLI subprocess tests keep using the current `AGENTS_DIR` environment variable when they need an isolated store.
- v1 card work does not introduce a second env var for the same root.

**Sequencing.** M1 (foundation), alongside the new path resolvers.

**Validation.**
- Existing tests that isolate via injected `agentsDir` / `AGENTS_DIR` continue to pass after the store path refactor.
- Reference cleanup: `BGNG_STORE_ROOT` appears only in historical/rejected-option notes, not in active implementation instructions.

---

### S15. Architecture doc revision: §14 honesty pass + §4.5 migration + §7 bundle conflict + §8.3 three mechanisms (F1, F2, F3, F4, F5, F6, F7)

**Decision.** Produce a revised architecture document that incorporates S1–S14's decisions into the design before any implementation begins. This has been done in `29_harness-cards-target-architecture-v1_1.md`. Specifically:

- **§14 Surface Summary** gains a "Behavior changes for existing users" subsection listing: project-local materialization, drift-refusal, untouched global skills dirs, `bgng add extension` removal.
- **§4.5 Migration semantics** is added with the algorithm from S7.
- **§5.0** (or §5.4 promoted) makes `write-record.json` first-class infrastructure with the corruption/missing semantics from S4.
- **§6** clarifies `bgng scan` (S10), `--write` chaining semantics (S11), and `--why` syntax (S8).
- **§7** gains a "Bundle conflict resolution" subsection per S6.
- **§8.3** explicitly enumerates three mechanisms (S3): symlinks for skills, `_bgng` meta-block for Claude/Codex settings, generated-file-plus-symlink for Cursor.
- **§11.4** adds the idempotency property test (S13).
- **§11.6** standardizes on existing `AGENTS_DIR` / `agentsDir` test isolation and rejects `BGNG_STORE_ROOT` (S14).

**Sequencing.** Landed before the M0 baseline-sync PR — the architecture doc must reflect the resolved strategies before any implementation PR opens.

**Validation.** Doc review pass against this assessment's findings table — every High and Medium finding must be addressed in v1.1.

---

## Open Questions

After the resolution strategies above, the remaining undecided items are listed here. None of them blocks the next implementation PR; each is a *cross-cutting question* that needs an answer before the harness reaches v1 maturity but is outside the cards architecture proper.

1. **Claude Code (and Codex / Cursor) per-project read behavior.** S2 commits to project-local materialization on the assumption that each of these tools reads `<project>/.claude/skills/`, `<project>/.codex/skills/`, `<project>/.cursor/mcp.json` natively when run from the project. This is true today but is a third-party contract; if any of these tools changes how they merge home-vs-project state, S2's behavior changes with it. **Action item:** before M6 lands, verify the current read semantics empirically against each tool's documented behavior; document in `02_per-project-config-guide.md`.
2. **`harness.minVersion` and the `bgng --version` contract.** What version string does the harness expose, and what triggers a bump? Cards' `harness.minVersion` (§5.1) compares against it. **Lean:** `bgng --version` reports the npm package version (Clipanion's VersionCommand already prints `package.json:version`). Bump on every release per semver; document the policy in the architecture doc's §5.1 notes.
3. **Card source identity.** `bgng card new <name>` needs a scope (`@me/…`). **Lean:** read from a new field in `machine.json` (e.g., `authoring.scope`); prompt-and-persist on first `card new` if absent. Cleaner than tying to npm login (which not all users have).
4. **Card source git integration.** Should `bgng card new` initialize a `.git/` in the source dir by default? **Lean:** yes, with a `--no-git` flag to skip. Most authors will want git history; the cost of a no-op `.git/` for non-users is negligible.
5. **`bgng card status` vs. `bgng status` overlap.** Justify the split in §6.3 of the architecture doc — `bgng card status` is the deep-dive (lockfile contents, full resolution trail for cards), `bgng status` is the at-a-glance summary (one section per concern, including cards). One paragraph in the architecture revision.
6. **Extension versioning.** Cards are versioned. Bundles are versioned. Extensions (`markitdown`, `beads`, `parallel`) are not. Is that permanent, or do extensions eventually get wrapped as cards? **Lean:** keep extensions un-versioned in v1 (they are conceptually closer to "capability families" than to "content"); revisit at v2 if real demand for versioned-extension semantics emerges.

---

## Appendix

### A1. File:line index of mismatches

The audit relied on these key file:line citations. Re-checking these is the fastest way to verify any finding above.

| Finding | Citation |
|---|---|
| F1 — path resolvers today | `cli/core/paths.ts:13-88` |
| F1 — MCP library single-file shape | `cli/core/mcp-library.ts:43-58`, `cli/core/types.ts:26-28` |
| F1 — bundle storage today | `cli/core/skill-packages.ts:124-186`, `03_npm-skill-bundles-guide.md` §Local Storage Model |
| F1 — project config schema (no `cards`) | `cli/core/types.ts:84-93`, `cli/core/project.ts:37-42` |
| F2 — global materialization | `cli/core/paths.ts:55-63`, `cli/core/sync.ts:122-168` |
| F3 — Claude full-file write | `cli/core/mcp.ts:72-79`, `cli/core/sync.ts:44-60` |
| F3 — Codex section rebuild | `cli/core/mcp.ts:105-119` |
| F3 — Cursor generated-file-plus-symlink | `cli/core/sync.ts:112-116`, `cli/core/mcp.ts:64-70` |
| F4 — stale warning, no cleanup | `cli/core/skills.ts:231-242`, `cli/core/skills.ts:333-342` |
| F4 — content-diff idempotency only | `cli/core/sync.ts:48` |
| F5 — MCP merge precedence today | `cli/core/sync.ts:125-128` (baseline + library merge) |
| F12 — `--project` orphan flag | `cli/commands/search/mcp.ts:48-50` + call site 61-68, `cli/commands/search/skill.ts:48-50` |
| F12 — `skills curate` / `uncurate` no flags | `cli/commands/skills/curate.ts`, `cli/commands/skills/uncurate.ts` |
| F15 — Clipanion `Usage()` accepts `details`/`examples` | Clipanion library; `cli/commands/base.ts:1-7` shows no override |
| F15 — no `apply`/`update`/`card`/`store` collisions | `cli/index.ts` registration list |

### A2. The "clean cut" stance — defending it, not weakening it

A reading of this assessment as "the design is too aggressive" would be wrong. The clean-cut stance is the right call for a pre-1.0 tool with a small user base; carrying v1/v2 schema branching, deprecation shims, and dual-write code paths for years to spare a handful of users a one-time `bgng store migrate` is the worse failure mode. Every "this is a breaking change" call-out above is a request for *honesty* about the cuts, not a request to soften them.

The strategies read as three layers stacked on the clean-cut foundation:

- **Honesty pass** — S1, S2, S3, S15 — surface behavior changes the design already implies but doesn't state.
- **Completeness pass** — S4, S5, S6, S7, S8, S11 — close semantic ambiguities so the implementation plan has a real target.
- **Scope-stitching** — S9, S10, S12, S13, S14 — ensure the cards rollout doesn't accidentally leave the existing CLI half-finished and the test surface threadbare.

### A3. Sequencing — the eight implementation milestones

If S1–S15 are accepted, the implementation breaks into the milestone sequence below. Each milestone is a self-contained PR-able unit; each has an explicit set of strategies it lands and an explicit dependency on prior milestones.

| Milestone | Lands | Depends on | Key strategies |
|---|---|---|---|
| **M0 — Cards prep + CLI gap fixes** | Baseline-sync existing CLI fixes; `bgng extensions add` clean cut; architecture doc revision (`29_harness-cards-target-architecture-v1_1.md`). | — | S12, S15 |
| **M1 — Store schema + path resolvers + migration** | New store layout in `cli/core/store-paths.ts`; `bgng store migrate` command; `store.json`; `mcp-servers.json` → `mcp-servers/*.json` shape change; existing `AGENTS_DIR` test isolation preserved; legacy-trigger warning. | M0 | S1, S7, S14 |
| **M2 — Write-record + idempotency test + cleanup engine** | `write-record.json` schema, atomic writes, corruption fallback; cleanup logic using write-record; idempotency property test landed. | M1 | S4, S13 |
| **M3 — `_bgng` meta-block for Claude/Codex; preserved Cursor pattern** | Hash-tracked managed-key/section writes; drift refusal with `--force`; Cursor mechanism preserved. | M2 | S3 |
| **M4 — Card manifest + lockfile + author commands** | `card.json` schema, validator; `card.lock`; `bgng card new/publish/diff/deprecate`; structural diff classifier. | M2 (no card-side write yet) | S15 (architecture content) |
| **M5 — Card consumer commands + MCP resolution** | `bgng card apply/add/pin/remove/update/outdated/detach/list/show/status`; top-level `apply`/`update` aliases; three-layer MCP resolution; bundle conflict algorithm; `--write` chaining. | M3, M4 | S5, S6, S11 |
| **M6 — Project-local materialization** | `resolveToolPaths(scope)` discriminated union; `syncRepository` scope-aware; legacy-orphan scan during migration. Re-run idempotency tests on new fixtures. | M5 | S2 |
| **M7 — Extended `status`/`doctor` with `--explain` / `--why`** | Diagnostics refactor into section builders; cards/store sections; `--why <category>:<name>` syntax. | M6 (sections need real content) | S8, S9 |

### A4. First TDD slice

Per `.ai/rules/02_tdd_practices.md`, M0 begins with two parallel failing-test passes:

1. **Cleanup tests for the CLI gap fixes.** Write tests that assert: `bun cli/index.ts search mcp --help` does not contain `--project`; `bun cli/index.ts skills curate <name> --json` emits valid JSON. Both fail initially. Implement the fixes. Tests go green.
2. **Migration shape test.** Build a fixture `~/.agents/` containing `library/mcp-servers.json` with two servers and `packages/skills/@scope/pkg/1.0.0/`. Write a test that calls `bgng store migrate` (the new command) and asserts the resulting `~/.agents/bgng/` tree contains the exact paths from S1 with the exact per-server files from S7. The test fails because neither the command nor the path resolvers exist. Implement `cli/core/paths.ts` new resolvers, then the migration algorithm, until the test goes green.

These two slices together exercise M0 and the early parts of M1, and they establish the TDD cadence for the rest of the cards rollout.
