# Task 18: Harness Cards Phase M4-M5 Card Lifecycle Handoff

**Status**: Ready After M2, With M5 Waiting On M3
**Created**: 2026-05-20
**Updated**: 2026-05-20
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 2 PRs
**Dependencies**: M2 complete for M4; M3 and M4 complete for M5
**References**: [tasks/14_harness-cards-implementation-plan.md, tasks/17_harness-cards-phase-m2-m3-materialization-safety-handoff.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/30_bgng-cli-usage-guide-cards-v1.md, cli/core/skill-packages.ts, cli/core/types.ts, cli/core/project.ts]

---

## Objective

Implement the card lifecycle: schema, authoring, publishing, inspection, resolution, consumer commands, bundle conflict handling, MCP precedence, and `--write` chaining.

---

## Scope

This document covers:

- **M4:** card manifest, lockfile helpers, diff classifier, author commands, inspection commands, `semver`.
- **M5:** project `cards` consumption, resolver, lockfile updates, card apply/add/pin/remove/update/outdated/detach/status, top-level aliases, bundle and MCP resolution.

It does not cover project-local materialization. M5 computes effective state, but M6 changes where that state writes.

---

## Entry Checks

For M4:

```bash
git status --short --branch
bun test test/core-write-record.test.ts test/scenarios-idempotency.test.ts
bun run typecheck
```

For M5:

```bash
bun test test/core-managed-fields.test.ts test/commands-write-drift.test.ts
bun test test/commands-card-new.test.ts test/commands-card-publish.test.ts
bun run typecheck
```

M5 must not start until both M3 and M4 are complete.

---

## M4 Work Plan

### M4.1 Add Semver Dependency

Add dependency:

```bash
bun add semver
```

Create:

```text
cli/core/semver-utils.ts
```

Only this file should import `semver` directly. Card and bundle code import wrappers from `semver-utils`.

### M4.2 Card Manifest Module

Create:

```text
cli/core/card-manifest.ts
```

Required validations:

- root is an object
- `name` is `@scope/name` or unscoped `name`
- names reject path traversal, uppercase, spaces, and empty segments
- `version` is strict semver
- `harness.minVersion`, if present, is strict semver
- `bundles` values are valid semver ranges
- `skills.include` is an array of strings
- no card-level `skills.exclude`
- `servers`, `extensions`, and `targets` are object maps
- target keys limited to supported downstream targets

### M4.3 NPM Package Contract

Pin this before publishing/fetching code:

- A published card package uses the card name as the npm package name.
- `package.json.name` must equal `card.json.name`.
- `package.json.version` must equal `card.json.version`.
- `card.json` must be at package root.
- optional inline skills live under package root `skills/<name>/`.
- optional inline MCP definitions live under package root `mcp-servers/<id>.json`.

If `package.json` is absent in a source, `bgng card publish` may generate a temporary package manifest for `npm pack`, but the resulting package still obeys the same contract.

### M4.4 Card Lock Module

Create:

```text
cli/core/card-lock.ts
```

Required helpers:

- `resolveProjectLockfilePath(projectRoot)`
- `loadCardLockfile(path)`
- `saveCardLockfile(path, lock)`
- lockfile validator

Atomic write requirement matches write-record: temp file, fsync, rename, fsync parent.

### M4.5 Card Diff Module

Create:

```text
cli/core/card-diff.ts
```

Classify:

- structural removal/disable -> major
- structural addition/enable -> minor
- metadata-only -> patch
- inline content changes -> flagged for author judgment

### M4.6 Card New

Create:

```text
cli/commands/card/new.ts
```

Required flags:

```bash
bgng card new <name>
bgng card new <name> --from-project
bgng card new <name> --from-card <ref>
bgng card new <name> --no-git
bgng card new <name> --scope @me
```

The `--scope` flag is a handoff addition: it makes first-use authoring scriptable when `machine.json` lacks `authoring.scope`.

Rules:

- scoped names (`@me/backend`) use their own scope
- unscoped names require `authoring.scope`, prompt interactively, or use `--scope`
- non-interactive mode without a scope must fail with a clear message
- default behavior initializes git; `--no-git` skips it

### M4.7 Card Publish

Create:

```text
cli/commands/card/publish.ts
```

Required behavior:

- validate manifest and package contract
- compute integrity hash of the published directory
- refuse to overwrite existing version
- update `versions.json`
- warn when version bump is smaller than structural diff classification
- support `--no-warn`
- support `--json`

### M4.8 Card Inspection And Author Commands

Create:

```text
cli/commands/card/diff.ts
cli/commands/card/deprecate.ts
cli/commands/card/list.ts
cli/commands/card/show.ts
```

Required behavior:

- `card diff` renders structural classification and supports `--json`
- `card deprecate` records reason in `versions.json`
- `card list` sorts alphabetically by `@scope/name` by default
- `card list --sources` includes editable sources
- `card show` shows manifest, versions, deprecation, inline summary, integrity

### M4 Tests

Add:

```text
test/core-card-manifest.test.ts
test/core-card-lock.test.ts
test/core-card-diff.test.ts
test/commands-card-new.test.ts
test/commands-card-publish.test.ts
test/commands-card-diff.test.ts
test/commands-card-deprecate.test.ts
test/commands-card-list-show.test.ts
```

Minimum extra coverage beyond master plan:

- `--scope` persists `authoring.scope`
- non-interactive unscoped `card new` fails without scope
- package contract mismatch fails publish
- publish from source without package.json uses a temporary package manifest without mutating source unexpectedly
- existing published version cannot be overwritten

### M4 Exit Checks

Run:

```bash
bun test test/core-card-manifest.test.ts test/core-card-lock.test.ts test/core-card-diff.test.ts
bun test test/commands-card-new.test.ts test/commands-card-publish.test.ts test/commands-card-diff.test.ts test/commands-card-deprecate.test.ts test/commands-card-list-show.test.ts
bun test
bun run typecheck
```

---

## M5 Work Plan

### M5.1 Project Config Cards Field

Modify:

```text
cli/core/types.ts
cli/core/project.ts
```

Add:

```ts
cards?: string[];
```

Project config validator must reject non-array `cards`.

### M5.2 Registry Test Seam

Before implementing npm fetching, introduce a resolver seam:

```ts
export interface CardRegistryClient {
  listVersions(name: string): Promise<string[]>;
  fetchVersion(name: string, version: string): Promise<FetchedCardPackage>;
}
```

Production client can shell or use npm metadata. Tests use a filesystem fixture registry. No real network in CI.

Do not add a user-facing registry env var in v1 unless the architecture is revised. Keep this as dependency injection in resolver tests and command fixtures.

### M5.3 Card Resolver

Create:

```text
cli/core/card-resolver.ts
```

Required behavior:

- parse `@scope/name@range`
- parse `@scope/name` as `*`
- parse `file:<path>`
- resolve local store versions first
- use registry client when store lacks a satisfying version or lockfile origin points to registry
- exclude deprecated versions unless they are the only satisfying match
- compute integrity
- write paths relative to `agentsDir` in lockfile

### M5.4 Bundle Resolver

Create:

```text
cli/core/bundle-resolver.ts
```

Required behavior:

- group bundle ranges by bundle name across cards
- pick highest available version satisfying every range
- fail on empty intersection with v1.1 error shape
- preserve previous lockfile origin/integrity where still valid

### M5.5 MCP Resolver

Create:

```text
cli/core/mcp-resolver.ts
```

Precedence:

```text
card-inline > user library > packaged baseline
```

Project overlay applies after all of that.

Tests must include:

- packaged baseline only
- user library overrides packaged baseline
- card-inline overrides both
- last card wins when two cards define same server inline
- project overlay full definition wins overall

### M5.6 Effective State

Create:

```text
cli/core/effective-state.ts
```

Project scope:

```text
built-in defaults -> user library -> locked cards in declared order -> project overlay
```

Machine scope:

```text
built-in defaults -> user library -> machine.json
```

Do not include `machine.json` in project scope.

### M5.7 Consumer Commands

Create:

```text
cli/commands/card/apply.ts
cli/commands/card/add.ts
cli/commands/card/pin.ts
cli/commands/card/remove.ts
cli/commands/card/update.ts
cli/commands/card/outdated.ts
cli/commands/card/detach.ts
cli/commands/card/status.ts
cli/commands/apply.ts
cli/commands/update.ts
```

Required flags:

- `--json` where output is structured
- `--write` on mutating card consumer commands and aliases
- `--check` on `card outdated`

`--write` contract:

- mutation is preserved on chained write failure
- command exits with write failure
- no rollback

### M5 Tests

Add:

```text
test/core-card-resolver.test.ts
test/core-bundle-resolver.test.ts
test/core-mcp-resolver.test.ts
test/core-effective-state.test.ts
test/commands-card-apply.test.ts
test/commands-card-add-pin-remove-detach.test.ts
test/commands-card-update.test.ts
test/commands-card-outdated-status.test.ts
```

Minimum extra coverage beyond master plan:

- card package name/version mismatch from registry fixture fails
- resolver preserves previous lockfile registry origin when updating within range
- `apply` replaces `cards`
- `add` appends but rejects duplicate card names
- `pin` updates one existing card by name
- `remove` rejects unknown name
- `detach` leaves overlay intact
- `outdated --check` exits non-zero when updates exist
- every new command has help examples

### M5 Exit Checks

Run:

```bash
bun test test/core-card-resolver.test.ts test/core-bundle-resolver.test.ts test/core-mcp-resolver.test.ts test/core-effective-state.test.ts
bun test test/commands-card-apply.test.ts test/commands-card-add-pin-remove-detach.test.ts test/commands-card-update.test.ts test/commands-card-outdated-status.test.ts
bun test
bun run typecheck
```

---

## Known Phase Risks

| Risk | Mitigation |
|---|---|
| npm package contract ambiguous | Contract pinned in M4.3 before implementation. |
| non-interactive authoring blocks scripts | Add `--scope` and fail clearly without it. |
| resolver tests hit network | Inject registry client and use filesystem fixtures. |
| machine defaults leak into project effective state | Dedicated `core-effective-state` tests. |
| card commands mutate config but not lockfile | Every mutating command test asserts both files. |

---

## Handoff Exit Criteria

M5 is handoff-complete when:

- card authoring and publishing work end-to-end against local store
- card resolver works against local store, file refs, and fixture registry
- lockfiles are reproducible and atomically written
- all consumer commands are registered, tested, and documented in help
- bundle conflict and MCP precedence are covered by unit and command tests
- project effective state excludes `machine.json`
