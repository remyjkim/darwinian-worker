# Task 26: Card Source Authoring CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Status**: Ready After Plan Patch Commit + Baseline Cleanup
**Created**: 2026-05-27
**Updated**: 2026-06-03
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 PR (5–8 sessions)
**Dependencies**: `.ai/analyses/52_drwn-target-architecture-post-wave-1.md`, `.ai/analyses/53_remote-card-publishing-usage-pattern-manual.md`
**References**: [analyses/52_drwn-target-architecture-post-wave-1.md, analyses/53_remote-card-publishing-usage-pattern-manual.md, analyses/41_card-source-authoring-cli-target-architecture.md, README.md, cli/index.ts, cli/core/card-store.ts, cli/core/card-manifest.ts, cli/core/store-paths.ts, cli/core/library.ts, cli/core/mcp-library.ts, cli/core/project-writes.ts, docs-docusaurus/docs/reference/cli/card.md, docs-docusaurus/docs/concepts/cards.md, test/commands-card-author.test.ts, test/commands-card-consumer.test.ts, test/cli-smoke.test.ts, test/cli-help-shape.test.ts, test/commands-output-contracts.test.ts, test/docs-readiness.test.ts]

---

## Objective

Add a first-class card authoring namespace:

```text
drwn card source ...
```

so editable card sources under `~/.agents/drwn/sources/...` can be listed,
inspected, validated, and semantically mutated through the CLI instead of by
manual filesystem edits. The new surface must preserve the current split:

- `drwn card source ...` for editable source authoring
- `drwn card publish/show/diff/deprecate` for published immutable versions
- `drwn apply / drwn card add/pin/remove/update/...` for project consumption

---

## Scope

**In scope:**

- New namespace: `drwn card source ...`
- Read-only commands:
  - `drwn card source list [--json]`
  - `drwn card source show <name> [--json]`
  - `drwn card source doctor [name] [--json]`
- Skill mutation commands:
  - `drwn card source add-skill <card> <skill> [--from <source>] [--replace] [--dry-run] [--json]`
  - `drwn card source remove-skill <card> <skill> [--keep-files] [--dry-run] [--json]`
- Manifest mutation command:
  - `drwn card source set <card> [--description ...] [--version ...] [--license ...] [--harness-min-version ...] [--stability ...] [--last-validated-with ...] [--test-status-badge ...] [--dry-run] [--json]`
- MCP mutation commands:
  - `drwn card source add-mcp <card> <server-id> [--from <source>] [--replace] [--dry-run] [--json]`
  - `drwn card source remove-mcp <card> <server-id> [--keep-files] [--dry-run] [--json]`
- `cli/core/card-source.ts` as the semantic authoring core
- Publish-roundtrip scenario coverage
- CLI help/readme/docs updates for the new namespace

**Out of scope:**

- Editing arbitrary `file:` card directories outside `~/.agents/drwn/sources/`
- Interactive editor/TUI authoring
- Arbitrary JSON patch for manifests
- Card-source extension or target mutation commands
- Registry or remote-publish work
- A source-level `sync-skills` command in the CLI (repo-local helper scripts are separate)

---

## Decisions Locked Before Implementation

These are architecture decisions from `41_card-source-authoring-cli-target-architecture.md` and are not open for renegotiation during implementation.

> Decisions D1–D8 below were authored against analysis 41. They remain in force after the Wave 1 / Wave 2 architecture and are not reopened by this patch.

| # | Decision | Source |
|---|---|---|
| D1 | Use a dedicated `drwn card source ...` namespace; do not overload `drwn card ...` consumer commands. | Arch §5 |
| D2 | Mutating source commands must support `--dry-run` and `--json`. | Arch §8 |
| D3 | Skill content added to a card source is copied, never symlinked. | Arch §7.1 |
| D4 | `card.json.servers` remains the current consumption authority; `mcp-servers/<id>.json` is added and kept in sync by source commands, with doctor flagging divergence. | Arch §6.3 |
| D5 | `drwn card new` remains unchanged and is still the source-creation entry point. | Arch §5 |
| D6 | `remove-skill` and `remove-mcp` delete bundled files by default; `--keep-files` is the explicit escape hatch. | Arch §6.2, §6.3 |
| D7 | `skills.include` ordering is stable and author-controlled: preserve existing order, append new entries, remove only the named entry, never auto-sort. | Arch §7.3 |
| D8 | Source commands operate on named local store sources only in v1. `file:` authoring support is deferred. | Scope decision, this plan |

---

## Execution Contracts

These contracts tighten the implementation details that were ambiguous in the
architecture analyses.

- **Active docs target**: `docs-astro/` is deprecated and must not be edited.
  All public site updates in this task go to `docs-docusaurus/`; update
  `test/docs-readiness.test.ts` so readiness assertions inspect the active
  Docusaurus docs, not the deprecated Astro content.
- **Store read-only guard**: non-dry-run source mutation helpers must call
  `assertStoreWritable()` before writing under `~/.agents/drwn/sources/...`.
  `--dry-run` must not write and may run when `DRWN_STORE_READONLY=1`.
- **Atomic writes**: manifest and MCP JSON rewrites must use the repo's atomic
  write helper instead of direct partial writes.
- **Doctor semantics**: `drwn card source doctor` is report-only. It exits `0`
  when it successfully inspects the requested source(s), even if reportable
  issues exist. It exits nonzero only for fatal command errors such as an
  unknown named source, invalid arguments, or unreadable store state. JSON
  output must include an `ok` boolean so automation can detect reportable
  issues without relying on the process exit code.
- **Malformed source handling**: doctor reports malformed `card.json`,
  `package.json`, and `mcp-servers/*.json` as findings and keeps scanning.
  `card source show` may fail on an invalid named source because it is an
  inspection command for a specific source state.
- **MCP resolution**: `add-mcp` resolves only explicit `--from <file>` and exact
  reusable-library ids via `findLibraryMcpServer` (built-in registry plus
  user/store library). It does not perform catalog search or interactive
  selection in this task.

---

## Entry Checks

Run before editing:

```bash
git status --short --branch
bun test
bun run typecheck
bun run verify:release
```

Expected:

- working tree is clean or only intentionally in-progress files are modified
- `bun test` passes
- `bun run typecheck` passes
- `bun run verify:release` passes

If any of these fail, stop and re-establish a clean baseline before T1.

Before T1, commit or otherwise clear this plan patch and any unrelated local
artifacts so implementation diffs contain only task-26 code, tests, and docs.

---

## Test-Driven Development Discipline

Every task below is TDD-first:

1. add the failing test
2. run just that test and confirm the failure is for the expected reason
3. write the minimum code to pass
4. rerun the targeted test
5. rerun the broader affected suite

Do not write production code for a task until its test exists and fails.

---

## Files Likely Touched

### New core/module files

- `cli/core/card-source.ts`
- `cli/commands/card/source/list.ts`
- `cli/commands/card/source/show.ts`
- `cli/commands/card/source/doctor.ts`
- `cli/commands/card/source/add-skill.ts`
- `cli/commands/card/source/remove-skill.ts`
- `cli/commands/card/source/set.ts`
- `cli/commands/card/source/add-mcp.ts`
- `cli/commands/card/source/remove-mcp.ts`

### Existing core/command files

- `cli/index.ts`
- `cli/core/card-store.ts`
- `cli/core/card-manifest.ts`
- `cli/core/mcp-library.ts`
- `cli/core/library.ts`
- `cli/core/output.ts` (only if a shared renderer is warranted; avoid if command-local JSON/text is simpler)
- `README.md`
- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `docs-docusaurus/docs/reference/cli/card.md`
- `docs-docusaurus/docs/concepts/cards.md`
- `docs-docusaurus/docs/guides/authoring-multi-skill-cards.md`
- `docs-docusaurus/docs/getting-started/paths/author-and-publish-card.md`
- `docs-docusaurus/docs/concepts/local-store.md` (only if command location or store/source distinction needs mention)

### New tests

- `test/core-card-source.test.ts`
- `test/commands-card-source-readonly.test.ts`
- `test/commands-card-source-skill-mutate.test.ts`
- `test/commands-card-source-set.test.ts`
- `test/commands-card-source-mcp-mutate.test.ts`
- `test/scenarios-card-source-publish-roundtrip.test.ts`

### Likely test updates

- `test/cli-smoke.test.ts`
- `test/cli-help-shape.test.ts`
- `test/commands-output-contracts.test.ts`
- `test/commands-card-author.test.ts`
- `test/docs-readiness.test.ts`

---

## Task Sequence

Implementation order is locked:

```text
T1 -> T2 -> T3 -> T4 -> T5 -> T6
```

T1 establishes the source-reading model; every mutation task depends on it.

---

## T1 — Source Model + Read-only Commands

### Objective

Create the semantic source-read layer and expose `card source list/show/doctor`.

### Files

- Create: `cli/core/card-source.ts`
- Create: `cli/commands/card/source/list.ts`
- Create: `cli/commands/card/source/show.ts`
- Create: `cli/commands/card/source/doctor.ts`
- Modify: `cli/index.ts`
- Test: `test/core-card-source.test.ts`
- Test: `test/commands-card-source-readonly.test.ts`
- Update: `test/cli-smoke.test.ts`
- Update: `test/cli-help-shape.test.ts` (only if the new command help needs explicit coverage)
- Update: `test/commands-output-contracts.test.ts`

### Tests first

In `test/core-card-source.test.ts`, add coverage for:

- listing zero and multiple sources
- reading one source state
- reporting:
  - malformed or schema-invalid `card.json`
  - bundled skill dirs
  - manifest-declared skills
  - orphaned skill dirs
  - missing `SKILL.md`
  - malformed `package.json`
  - `package.json` name/version mismatch
  - `mcp-servers/*.json` parse errors

In `test/commands-card-source-readonly.test.ts`, add:

- `drwn card source list --json`
- `drwn card source show @me/example --json`
- `drwn card source doctor @me/example --json`
- `doctor --json` exits 0 and reports `ok: false` when nonfatal source issues exist
- text mode coverage for list/show/doctor

In `test/cli-smoke.test.ts`, assert `--help` now mentions:

- `drwn card source list`
- `drwn card source show`
- `drwn card source doctor`

### Implementation steps

1. Create `cli/core/card-source.ts` with:
   - `listCardSources(agentsDir)`
   - `readCardSourceState(agentsDir, name)`
   - `doctorCardSource(agentsDir, name?)`
2. Reuse store/source path resolvers from `store-paths.ts`.
3. Reuse `assertValidCardManifest` / `validateCardManifest` for manifest parsing.
4. Detect and report mismatches; do not fix anything in T1.
5. Add `list/show/doctor` commands under `cli/commands/card/source/`.
6. Give every new command `BaseCommand.Usage` details and examples so
   `test/cli-help-shape.test.ts` continues to protect help quality.
7. Register them in `cli/index.ts`.
8. Add source read-only commands to `test/commands-output-contracts.test.ts`
   once fixtures exist for non-empty human and parseable JSON output.

### Verification

Run:

```bash
bun test test/core-card-source.test.ts test/commands-card-source-readonly.test.ts test/cli-smoke.test.ts test/cli-help-shape.test.ts test/commands-output-contracts.test.ts
```

Expected:

- all new source-read tests pass
- `--help` shows the new namespace
- command output contracts remain parseable and non-empty for source read-only commands

---

## T2 — Skill Mutation Commands

### Objective

Make bundled-skill authoring semantic with `add-skill` and `remove-skill`.

### Files

- Modify: `cli/core/card-source.ts`
- Create: `cli/commands/card/source/add-skill.ts`
- Create: `cli/commands/card/source/remove-skill.ts`
- Test: `test/commands-card-source-skill-mutate.test.ts`
- Update: `test/commands-card-author.test.ts`

### Tests first

Add `test/commands-card-source-skill-mutate.test.ts` covering:

- `add-skill --dry-run --json` reports planned file copy + manifest mutation
- `add-skill` copies a repo-native shared skill into `sources/<card>/skills/<name>/`
- `add-skill --replace` overwrites an existing bundled copy
- `add-skill` fails on duplicate without `--replace`
- `remove-skill --dry-run --json` reports file removal + manifest mutation
- `remove-skill` deletes directory and removes the manifest entry
- `remove-skill --keep-files` removes only the manifest entry
- non-dry-run `add-skill` and `remove-skill` fail under `DRWN_STORE_READONLY=1`
- dry-run skill mutations still produce a plan under `DRWN_STORE_READONLY=1`

Also add one roundtrip author test in `test/commands-card-author.test.ts`:

- `card publish` still succeeds after a source was prepared entirely through
  `card source add-skill`

### Implementation steps

1. Resolve skill source in this order:
   - explicit `--from <path>`
   - exact repo-native skill by name
   - exact local library skill by name
   - exact package-backed skill by name
2. Copy the skill directory into the card source. Do not symlink.
3. Append to `card.json.skills.include` if absent.
4. Preserve existing order.
5. Implement `remove-skill` with default destructive behavior plus
   `--keep-files`.
6. Use `assertStoreWritable()` for non-dry-run writes and `writeAtomically()` for
   manifest rewrites.
7. Validate copied sources have `SKILL.md` before writing, so broken source
   paths fail without partial source mutations.

### Verification

Run:

```bash
bun test test/commands-card-source-skill-mutate.test.ts test/commands-card-author.test.ts
```

Expected:

- skill mutation commands behave semantically
- publish still works on a CLI-authored source

---

## T3 — Manifest Set Command

### Objective

Add a semantic manifest editor for the common fields that do not warrant manual
JSON editing.

### Files

- Modify: `cli/core/card-source.ts`
- Create: `cli/commands/card/source/set.ts`
- Test: `test/commands-card-source-set.test.ts`

### Tests first

Add `test/commands-card-source-set.test.ts` covering:

- `set --dry-run --json` for `--description`
- `set --version`
- `set --license`
- `set --harness-min-version`
- `set --stability stable` (and rejection of an invalid value)
- `set --last-validated-with 1.2.3` (and rejection of a non-semver value)
- `set --test-status-badge https://...` (and rejection of a non-HTTP(S) URL)
- command rejects when no patch flags are provided
- command rejects invalid semver for `--version` and `--harness-min-version`
- non-dry-run `set` fails under `DRWN_STORE_READONLY=1`
- `set --dry-run --json` still reports old vs new values under `DRWN_STORE_READONLY=1`

### Implementation steps

1. Add a source-manifest patch helper in `cli/core/card-source.ts`.
2. Support only:
   - `--description`
   - `--version`
   - `--license`
   - `--harness-min-version`
   - `--stability`
   - `--last-validated-with`
   - `--test-status-badge`
3. Make `--dry-run --json` emit old vs new values.
4. Route patched manifests through `assertValidCardManifest` (Wave 2 already validates `stability`, `lastValidatedWith`, `testStatusBadge`) before writing.
5. Preserve unrelated manifest fields and existing key order as much as practical;
   do not introduce broad manifest reformat churn beyond the JSON rewrite needed
   for the requested patch.
6. Use `assertStoreWritable()` for non-dry-run writes and `writeAtomically()` for
   manifest rewrites.

### Verification

Run:

```bash
bun test test/commands-card-source-set.test.ts
```

Expected:

- semantic manifest updates behave predictably
- invalid changes fail before writing

---

## T4 — MCP Mutation Commands

### Objective

Make MCP authoring semantic while preserving current consumer behavior.

### Files

- Modify: `cli/core/card-source.ts`
- Create: `cli/commands/card/source/add-mcp.ts`
- Create: `cli/commands/card/source/remove-mcp.ts`
- Test: `test/commands-card-source-mcp-mutate.test.ts`

### Tests first

Add `test/commands-card-source-mcp-mutate.test.ts` covering:

- `add-mcp --dry-run --json` reports both file and manifest updates
- `add-mcp` resolves an MCP definition from the reusable library
  (built-in registry plus user/store library) and writes:
  - `mcp-servers/<id>.json`
  - `card.json.servers[<id>]`
- `add-mcp --replace` overwrites both
- `remove-mcp` removes both manifest entry and file
- `remove-mcp --keep-files` removes only the manifest entry
- `card source doctor` reports divergence when `mcp-servers/<id>.json` and
  `card.json.servers[<id>]` disagree
- non-dry-run `add-mcp` and `remove-mcp` fail under `DRWN_STORE_READONLY=1`
- dry-run MCP mutations still produce a plan under `DRWN_STORE_READONLY=1`

### Implementation steps

1. Keep `card.json.servers` as the canonical consumption path in v1.
2. Mirror source content to `mcp-servers/<id>.json` so authoring matches the
   target store layout and future architecture.
3. Resolve MCP definitions from:
   - explicit `--from <file>`
   - exact reusable-library MCP by id via `findLibraryMcpServer`
4. Validate MCP definitions with `validateMcpLibraryServer` before writing.
5. Use `assertStoreWritable()` for non-dry-run writes and `writeAtomically()` for
   `card.json` and `mcp-servers/<id>.json` rewrites.
6. Extend source doctor to flag divergence.

### Verification

Run:

```bash
bun test test/commands-card-source-mcp-mutate.test.ts test/commands-card-source-readonly.test.ts
```

Expected:

- MCP authoring works semantically
- read-only doctor detects divergence correctly

---

## T5 — Publish Roundtrip Scenario

### Objective

Prove that a source created via `card new` and mutated entirely through
`card source ...` can be published and consumed without manual file surgery.

### Files

- Test: `test/scenarios-card-source-publish-roundtrip.test.ts`
- Update: `test/commands-card-author.test.ts` (only if shared helpers belong there)

### Tests first

Add one end-to-end scenario:

1. `drwn card new @me/example --no-git`
2. `drwn card source add-skill @me/example alpha`
3. `drwn card source set @me/example --description "..." --version 0.1.0`
4. `drwn card source doctor @me/example --json`
5. `drwn card publish @me/example`
6. create a project
7. `drwn apply @me/example@^0.1.0`
8. `drwn write --dry-run --json`

Assertions:

- published card exists
- `card.lock` records the card
- downstream dry-run points skills into the published card store
- JSON output in the scenario is parseable at every `--json` step

### Implementation steps

No new surface is expected here. This task is the proof that T1–T4 fit the
existing publish/apply/write lifecycle cleanly.

### Verification

Run:

```bash
bun test test/scenarios-card-source-publish-roundtrip.test.ts
```

Expected:

- complete source → publish → apply → write roundtrip passes

---

## T6 — Help Surface and Docs

### Objective

Document the new authoring namespace and keep the docs/readiness bar green.

### Files

- Modify: `README.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `docs-docusaurus/docs/reference/cli/card.md`
- Modify: `docs-docusaurus/docs/concepts/cards.md`
- Modify: `docs-docusaurus/docs/guides/authoring-multi-skill-cards.md`
- Modify: `docs-docusaurus/docs/getting-started/paths/author-and-publish-card.md`
- Modify: `docs-docusaurus/docs/concepts/local-store.md` (only if needed)
- Update: `test/docs-readiness.test.ts`

### Required content changes

README:

- add `drwn card source ...` commands to the command reference
- explain the source/published/consumed distinction
- include one short authoring example
- list the full `set` flag surface, including the Wave 2 quality fields (`--stability`, `--last-validated-with`, `--test-status-badge`)
- update the Documentation Site and Documentation Map sections if they still
  describe `docs-astro` as the public docs source

Usage guide:

- explain `~/.agents/drwn/sources/...`
- document `card source list/show/doctor`
- document `add-skill`, `remove-skill`, `set`, `add-mcp`, `remove-mcp`
- document `set --stability`, `set --last-validated-with`, `set --test-status-badge` as the author-side counterparts to the quality fields `card show` surfaces (per Wave 2)

Docs Docusaurus:

- add the new namespace to cards docs
- make the authoring flow explicit
- cover the new `set` flags for stability / last-validated-with / test-status-badge alongside the existing fields
- replace placeholder "Coming soon" content in the touched card pages with
  useful operator-facing documentation
- do not edit `docs-astro/`; it is deprecated and preserved only as a migration
  reference

Docs-readiness:

- assert the new commands are represented in the user-facing docs
- assert the new `set` flag names appear in the docs surface
- move active-site assertions from `docs-astro` files to the relevant
  `docs-docusaurus/docs` files
- assert the README points at `docs-docusaurus` as the public docs site

### Verification

Run:

```bash
bun test test/docs-readiness.test.ts
bun run docs:build
```

Expected:

- docs-readiness remains green with the new authoring surface
- active Docusaurus docs build successfully

---

## Final Verification Bar

Run after T1–T6 are complete:

```bash
bun test
bun run typecheck
bun run docs:build
bun run verify:release
```

Expected:

- full test suite passes
- typecheck passes
- active docs build passes
- release verification passes

If any command fails, stop and fix before claiming the implementation is ready.

---

## Acceptance Criteria

- `drwn card source list/show/doctor` exist and pass targeted tests
- `drwn card source add-skill/remove-skill` exist and pass targeted tests
- `drwn card source set` exists and passes targeted tests
- `drwn card source add-mcp/remove-mcp` exist and pass targeted tests
- a card source can be created, authored through the CLI, published, applied,
  and materialized without manual file editing
- help surface and operator docs mention the new namespace
- full `bun test`, `bun run typecheck`, `bun run docs:build`, and
  `bun run verify:release` are green

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Source commands blur the source/publish/consume split | Keep all edits under `drwn card source ...`; do not overload existing `drwn card ...` commands |
| MCP authoring drifts from current consumer reality | Keep `card.json.servers` canonical in v1 and mirror the source file, with doctor detecting divergence |
| Authors expect `file:` directories to be editable by the new commands | Explicitly defer `file:` source editing from v1 and document that `card source` targets named store sources only |
| Copy-vs-symlink mistakes weaken reproducibility | Add explicit tests that assert copied directories, not symlinks |
| Docs drift behind the new namespace | Make docs updates a required task with `test/docs-readiness.test.ts` coverage |
