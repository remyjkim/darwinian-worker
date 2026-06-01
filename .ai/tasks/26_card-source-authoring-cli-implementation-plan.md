# Task 26: Card Source Authoring CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Status**: Ready For T1 Start
**Created**: 2026-05-27
**Updated**: 2026-05-27
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 PR (5–8 sessions)
**Dependencies**: `.ai/analyses/41_card-source-authoring-cli-target-architecture.md`
**References**: [analyses/41_card-source-authoring-cli-target-architecture.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/36_harness-cards-bundle-resolver-target-architecture.md, README.md, cli/index.ts, cli/core/card-store.ts, cli/core/card-manifest.ts, cli/core/store-paths.ts, cli/core/library.ts, cli/core/mcp-library.ts, cli/core/project-writes.ts, test/commands-card-author.test.ts, test/commands-card-consumer.test.ts, test/cli-smoke.test.ts, test/docs-readiness.test.ts]

---

## Objective

Add a first-class card authoring namespace:

```text
bgng card source ...
```

so editable card sources under `~/.agents/bgng/sources/...` can be listed,
inspected, validated, and semantically mutated through the CLI instead of by
manual filesystem edits. The new surface must preserve the current split:

- `bgng card source ...` for editable source authoring
- `bgng card publish/show/diff/deprecate` for published immutable versions
- `bgng apply / bgng card add/pin/remove/update/...` for project consumption

---

## Scope

**In scope:**

- New namespace: `bgng card source ...`
- Read-only commands:
  - `bgng card source list [--json]`
  - `bgng card source show <name> [--json]`
  - `bgng card source doctor [name] [--json]`
- Skill mutation commands:
  - `bgng card source add-skill <card> <skill> [--from <source>] [--replace] [--dry-run] [--json]`
  - `bgng card source remove-skill <card> <skill> [--keep-files] [--dry-run] [--json]`
- Manifest mutation command:
  - `bgng card source set <card> [--description ...] [--version ...] [--license ...] [--harness-min-version ...] [--dry-run] [--json]`
- MCP mutation commands:
  - `bgng card source add-mcp <card> <server-id> [--from <source>] [--replace] [--dry-run] [--json]`
  - `bgng card source remove-mcp <card> <server-id> [--keep-files] [--dry-run] [--json]`
- `cli/core/card-source.ts` as the semantic authoring core
- Publish-roundtrip scenario coverage
- CLI help/readme/docs updates for the new namespace

**Out of scope:**

- Editing arbitrary `file:` card directories outside `~/.agents/bgng/sources/`
- Interactive editor/TUI authoring
- Arbitrary JSON patch for manifests
- Card-source extension or target mutation commands
- Registry or remote-publish work
- A source-level `sync-skills` command in the CLI (repo-local helper scripts are separate)

---

## Decisions Locked Before Implementation

These are architecture decisions from `41_card-source-authoring-cli-target-architecture.md` and are not open for renegotiation during implementation.

| # | Decision | Source |
|---|---|---|
| D1 | Use a dedicated `bgng card source ...` namespace; do not overload `bgng card ...` consumer commands. | Arch §5 |
| D2 | Mutating source commands must support `--dry-run` and `--json`. | Arch §8 |
| D3 | Skill content added to a card source is copied, never symlinked. | Arch §7.1 |
| D4 | `card.json.servers` remains the current consumption authority; `mcp-servers/<id>.json` is added and kept in sync by source commands, with doctor flagging divergence. | Arch §6.3 |
| D5 | `bgng card new` remains unchanged and is still the source-creation entry point. | Arch §5 |
| D6 | `remove-skill` and `remove-mcp` delete bundled files by default; `--keep-files` is the explicit escape hatch. | Arch §6.2, §6.3 |
| D7 | `skills.include` ordering is stable and author-controlled: preserve existing order, append new entries, remove only the named entry, never auto-sort. | Arch §7.3 |
| D8 | Source commands operate on named local store sources only in v1. `file:` authoring support is deferred. | Scope decision, this plan |

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
- `docs-astro/src/content/docs/10-harness-cards.md`
- `docs-astro/src/content/docs/11-store-and-migration.md` (only if command location or store/source distinction needs mention)

### New tests

- `test/core-card-source.test.ts`
- `test/commands-card-source-readonly.test.ts`
- `test/commands-card-source-skill-mutate.test.ts`
- `test/commands-card-source-set.test.ts`
- `test/commands-card-source-mcp-mutate.test.ts`
- `test/scenarios-card-source-publish-roundtrip.test.ts`

### Likely test updates

- `test/cli-smoke.test.ts`
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

### Tests first

In `test/core-card-source.test.ts`, add coverage for:

- listing zero and multiple sources
- reading one source state
- reporting:
  - bundled skill dirs
  - manifest-declared skills
  - orphaned skill dirs
  - missing `SKILL.md`
  - `package.json` name/version mismatch
  - `mcp-servers/*.json` parse errors

In `test/commands-card-source-readonly.test.ts`, add:

- `bgng card source list --json`
- `bgng card source show @me/example --json`
- `bgng card source doctor @me/example --json`
- text mode coverage for list/show/doctor

In `test/cli-smoke.test.ts`, assert `--help` now mentions:

- `bgng card source list`
- `bgng card source show`
- `bgng card source doctor`

### Implementation steps

1. Create `cli/core/card-source.ts` with:
   - `listCardSources(agentsDir)`
   - `readCardSourceState(agentsDir, name)`
   - `doctorCardSource(agentsDir, name?)`
2. Reuse store/source path resolvers from `store-paths.ts`.
3. Reuse `assertValidCardManifest` / `validateCardManifest` for manifest parsing.
4. Detect and report mismatches; do not fix anything in T1.
5. Add `list/show/doctor` commands under `cli/commands/card/source/`.
6. Register them in `cli/index.ts`.

### Verification

Run:

```bash
bun test test/core-card-source.test.ts test/commands-card-source-readonly.test.ts test/cli-smoke.test.ts
```

Expected:

- all new source-read tests pass
- `--help` shows the new namespace

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
- command rejects when no patch flags are provided
- command rejects invalid semver for `--version` and `--harness-min-version`

### Implementation steps

1. Add a source-manifest patch helper in `cli/core/card-source.ts`.
2. Support only:
   - `--description`
   - `--version`
   - `--license`
   - `--harness-min-version`
3. Make `--dry-run --json` emit old vs new values.
4. Validate the manifest after patching before writing.

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
- `add-mcp` resolves an MCP definition from the local library and writes:
  - `mcp-servers/<id>.json`
  - `card.json.servers[<id>]`
- `add-mcp --replace` overwrites both
- `remove-mcp` removes both manifest entry and file
- `remove-mcp --keep-files` removes only the manifest entry
- `card source doctor` reports divergence when `mcp-servers/<id>.json` and
  `card.json.servers[<id>]` disagree

### Implementation steps

1. Keep `card.json.servers` as the canonical consumption path in v1.
2. Mirror source content to `mcp-servers/<id>.json` so authoring matches the
   target store layout and future architecture.
3. Resolve MCP definitions from:
   - explicit `--from <file>`
   - exact local library MCP by id
4. Extend source doctor to flag divergence.

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

1. `bgng card new @me/example --no-git`
2. `bgng card source add-skill @me/example alpha`
3. `bgng card source set @me/example --description "..." --version 0.1.0`
4. `bgng card source doctor @me/example --json`
5. `bgng card publish @me/example`
6. create a project
7. `bgng apply @me/example@^0.1.0`
8. `bgng write --dry-run --json`

Assertions:

- published card exists
- `card.lock` records the card
- downstream dry-run points skills into the published card store

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
- Modify: `docs-astro/src/content/docs/10-harness-cards.md`
- Modify: `docs-astro/src/content/docs/11-store-and-migration.md` (only if needed)
- Update: `test/docs-readiness.test.ts`

### Required content changes

README:

- add `bgng card source ...` commands to the command reference
- explain the source/published/consumed distinction
- include one short authoring example

Usage guide:

- explain `~/.agents/bgng/sources/...`
- document `card source list/show/doctor`
- document `add-skill`, `remove-skill`, `set`, `add-mcp`, `remove-mcp`

Docs Astro:

- add the new namespace to cards docs
- make the authoring flow explicit

Docs-readiness:

- assert the new commands are represented in the user-facing docs

### Verification

Run:

```bash
bun test test/docs-readiness.test.ts
```

Expected:

- docs-readiness remains green with the new authoring surface

---

## Final Verification Bar

Run after T1–T6 are complete:

```bash
bun test
bun run typecheck
bun run verify:release
```

Expected:

- full test suite passes
- typecheck passes
- release verification passes

If any command fails, stop and fix before claiming the implementation is ready.

---

## Acceptance Criteria

- `bgng card source list/show/doctor` exist and pass targeted tests
- `bgng card source add-skill/remove-skill` exist and pass targeted tests
- `bgng card source set` exists and passes targeted tests
- `bgng card source add-mcp/remove-mcp` exist and pass targeted tests
- a card source can be created, authored through the CLI, published, applied,
  and materialized without manual file editing
- help surface and operator docs mention the new namespace
- full `bun test`, `bun run typecheck`, and `bun run verify:release` are green

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Source commands blur the source/publish/consume split | Keep all edits under `bgng card source ...`; do not overload existing `bgng card ...` commands |
| MCP authoring drifts from current consumer reality | Keep `card.json.servers` canonical in v1 and mirror the source file, with doctor detecting divergence |
| Authors expect `file:` directories to be editable by the new commands | Explicitly defer `file:` source editing from v1 and document that `card source` targets named store sources only |
| Copy-vs-symlink mistakes weaken reproducibility | Add explicit tests that assert copied directories, not symlinks |
| Docs drift behind the new namespace | Make docs updates a required task with `test/docs-readiness.test.ts` coverage |
