# Task 34: drwn Git Distribution Wave 2 — Readiness And Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` before each code-changing task. Do not commit unless explicitly instructed.

**Status**: Implemented and locally verified
**Created**: 2026-06-02
**Updated**: 2026-06-02
**Priority**: High
**Depends On**: Task 33 Wave 1 complete and locally verified
**References**: [33_completion_drwn-git-distribution-wave-1.md](./33_completion_drwn-git-distribution-wave-1.md), [33_drwn-git-distribution-wave-1-implementation-plan.md](./33_drwn-git-distribution-wave-1-implementation-plan.md), [../analyses/52_drwn-target-architecture-post-wave-1.md](../analyses/52_drwn-target-architecture-post-wave-1.md), [../analyses/50_drwn-command-roles-across-git-rollout-phases.md](../analyses/50_drwn-command-roles-across-git-rollout-phases.md), [31_drwn-git-distribution-phase-3-implementation-plan.md](./31_drwn-git-distribution-phase-3-implementation-plan.md)

---

## Objective

Wave 2 turns the Git-backed distribution model from "technically shareable" into "easy to adopt and trust." It adds a project capture flow, manifest quality signals, and a persistent Git URL name cache.

Wave 2 does not implement the old registry-pinning `skills.shared` design from task 21. That older plan is historical and must not be executed as the current Wave 2.

---

## Problem Statement

Wave 1 solved card distribution mechanics: cards can be published, cloned, fetched, installed, locked, searched, and materialized. Three practical adoption gaps remain.

### Problem 1: Authoring Entry Gate

Users are unlikely to begin by hand-authoring a perfect card source. The common path is that they already have a working project harness and want to share it. Without a capture flow, they must manually transcribe project config, skills, MCP servers, extensions, and targets into a card source.

### Problem 2: Trust And Quality Signals

Cards can be distributed, but consumers cannot see whether a card is experimental, stable, production-ready, recently validated, or backed by a test badge. Manifest quality fields make card quality visible without introducing a hosted registry.

### Problem 3: Repeat Git URL Discovery

Wave 1 can discover a card name from a Git URL by shallow-cloning and reading `card.json`. That is correct but wasteful on repeated encounters of the same URL. A persistent URL-to-card-name map removes repeated discovery work and improves deterministic behavior across installs.

---

## Solution Strategy

Wave 2 implements three additive capabilities:

1. **Capture flow**: `drwn card new <name> --from-project [<project-path>]` snapshots a project's effective harness into a new self-contained card source.
2. **Manifest quality fields**: `card.json` accepts and displays optional `stability`, `lastValidatedWith`, and `testStatusBadge` fields.
3. **URL-to-name cache**: `~/.agents/drwn/url-card-map.json` records canonical Git URL mappings discovered from remote card manifests.

The capture flow must reuse the same effective-state semantics as `drwn write`; it should not duplicate a second, divergent resolver. The implementation should extract a pure helper from `cli/core/sync.ts` or adjacent core modules so capture and materialization agree.

---

## Scope

### In Scope

- `drwn card new <name> --from-project [<project-path>]`.
- Default capture name behavior if no name is supplied, if the command grammar supports it safely.
- Capture of effective skills into `skills/<name>/`.
- Capture of effective MCP servers into `mcp-servers/<id>.json` or manifest `servers`.
- Capture of effective `extensions` into `card.json`.
- Capture of effective `targets` into `card.json`.
- Refusal to overwrite an existing card source.
- Readonly store enforcement for capture.
- Manifest fields:
  - `stability`
  - `lastValidatedWith`
  - `testStatusBadge`
- `drwn card show` text and JSON display for the manifest quality fields.
- Persistent URL-to-name cache.
- Documentation and tests for the above.

### Out Of Scope

- Activating `skills.shared`.
- Registry selector/config machinery.
- `drwn store set-registry`.
- Registry drift refusal.
- Hosted registry service.
- Ratings/reviews.
- Account system.
- Web publish flow.
- Backward compatibility with `bgng` or lockfile v1.

---

## Current Code Baseline

At Wave 2 start:

- `cli/core/card-manifest.ts` defines the current manifest shape and rejects non-empty `skills.shared`.
- `cli/commands/card/new.ts` creates blank card sources and supports `name`, `--scope`, and `--no-git`.
- `cli/core/card-lock.ts` is v2-only and uses `registry: null`.
- `cli/core/card-project.ts` merges card manifests into project config.
- `cli/core/sync.ts` computes effective materialization state inside `syncRepository()`.
- `cli/core/card-skill-resolver.ts` resolves skills from locked card paths and user defaults.
- No `cli/core/card-capture.ts` exists.
- No `cli/core/url-card-map.ts` exists.
- No task 34 implementation code should assume old `bgng` paths or commands.

---

## Execution Readiness Tasks

These tasks must be completed before implementing Wave 2 feature code.

### R0: Confirm Current Gate Health

**Files:**
- No file edits.

**Steps:**

1. Run:

   ```bash
   git status --short --branch
   bun test
   bun run typecheck
   bun run verify:release --json
   npm pack --dry-run --json
   ```

2. Expected:
   - Tests pass.
   - Typecheck passes.
   - Release verifier returns `"ok": true`.
   - Pack dry-run succeeds.
   - Working tree changes are understood and intentional.

3. If gates fail, stop and fix/record the failure before Wave 2 implementation.

### R1: Quarantine The Old Wave 2 Registry Plan

**Files:**
- Modify: `.ai/tasks/21_harness-cards-wave-2-implementation-plan.md`

**Steps:**

1. Add a top-of-file historical warning:

   ```markdown
   > Historical note: this is the old pre-rebrand registry-pinning Wave 2 plan. It is not the current Task 34 Wave 2 plan and must not be executed against the current drwn codebase.
   ```

2. Confirm the active task 34 plan is referenced from that warning.

3. Run:

   ```bash
   rg -n "bgng|beginning-harness|\\.agents/bgng|skills\\.shared|store set-registry" .ai/tasks/34_drwn-git-distribution-wave-2-implementation-plan.md
   ```

4. Expected:
   - Matches are limited to explicit historical/quarantine text in this task file.
   - No implementation instructions use pre-rebrand paths, commands, or package names.

### R2: Reconcile Stale Analysis 52 Wording

**Files:**
- Modify: `.ai/analyses/52_drwn-target-architecture-post-wave-1.md`

**Steps:**

1. Replace remaining stale active wording that says `drwn apply` materializes downstream state with `drwn write`.
2. Preserve historical sections only when explicitly labeled historical.
3. Remove or clearly label stale v1 lockfile shim references.
4. Confirm Wave 2 scope is:
   - capture flow
   - manifest quality fields
   - URL-to-name cache

5. Run:

   ```bash
   rg -n "lockfileVersion: 1|drwn apply.*materializ|\\.agents/bgng|bgng" .ai/analyses/52_drwn-target-architecture-post-wave-1.md
   ```

6. Expected:
   - Matches are absent or explicitly historical.
   - Active architecture prose uses `drwn write` for downstream materialization.

### R3: Finalize Capture Semantics

**Files:**
- Modify: this task file if decisions change.

**Decisions to lock:**

- Capture should flatten the effective state into a self-contained card source.
- Capture should not preserve card dependency provenance by default.
- Capture should copy skill directories rather than symlink them.
- Capture should not copy write records, generated downstream tool files, lockfiles, or project runtime metadata.
- Capture should fail rather than overwrite an existing card source.
- Capture should respect `DRWN_STORE_READONLY=1`.

**Security decision to lock:**

- MCP server definitions may reference environment variables but must not inline secret values from the host environment.
- Capture should preserve env-var references already present in config.
- Capture should not read process env values and write them into card sources.

### R4: Finalize Command Grammar

**Files:**
- Modify: this task file if decisions change.

**Recommended grammar:**

```bash
drwn card new <name> --from-project [<project-path>] [--no-git]
```

Reason: current `CardNewCommand` uses a positional `name`. Keeping the positional name as the primary form avoids introducing a separate `--name` option only for capture.

Optional convenience, only if it fits Clipanion cleanly:

```bash
drwn card new --from-project [<project-path>] --scope @me
```

This may default to `@me/<project-basename>-harness`. If implementing this complicates parsing or help output, defer default-name capture to a follow-up.

### R5: Finalize URL Cache Policy

**Files:**
- Modify: this task file if decisions change.

**Decisions to lock:**

- Cache path: `~/.agents/drwn/url-card-map.json`.
- Cache file version: `mapVersion: 1`.
- Canonical URL key should use the same canonicalization as card ref parsing.
- Cache writes must be atomic.
- Cache lookup must be an optimization only; stale/missing entries must not compromise correctness.
- On cache hit, still enforce existing name-collision policy against the local bare repo's origin URL.
- On discovery mismatch, prefer the freshly discovered manifest and update the cache only after validation succeeds.

### R6: Sweep Active Help Text For Pre-Wave-1 Storage Claims

**Files:**
- Modify: `cli/commands/card/publish.ts`
- Inspect: `cli/commands/**/*.ts`
- Inspect: `README.md`
- Inspect: `docs-astro/src`
- Inspect: `.ai/knowledges`

**Reason:**

During task 34 drafting, `cli/commands/card/publish.ts` still described publishing as copying sources into `~/.agents/drwn/cards/<name>/<version>`, which is the old pre-Wave-1 storage model. Wave 2 should not start until active help/docs describe the Git-backed store accurately.

**Steps:**

1. Search for stale storage wording:

   ```bash
   rg -n "copies|copy|<name>/<version>|cards/<name>|per-version|immutable local card store" cli README.md docs-astro/src .ai/knowledges
   ```

2. Update active help/docs to describe:
   - per-card bare repos
   - Git commits/tags
   - extracted tree materialization

3. Run:

   ```bash
   bun test test/cli-help-shape.test.ts test/docs-readiness.test.ts
   ```

4. Expected:
   - Help/docs tests pass.
   - No active help text describes the old copy-based store.

---

## Implementation Tasks

### Task 1: Extract Effective Project State Helper

**Goal:** Provide one reusable effective-state computation path for `drwn write` and capture.

**Files:**
- Modify: `cli/core/sync.ts`
- Modify or create: `cli/core/effective-state.ts`
- Test: `test/core-effective-state.test.ts`

**TDD Steps:**

1. Write a failing unit/integration test that constructs a project with:
   - one locked card skill
   - one project-local skill
   - one MCP server
   - one extension config
   - one target override

2. Assert the helper returns the same effective data `syncRepository()` would materialize.

3. Run:

   ```bash
   bun test test/core-effective-state.test.ts
   ```

   Expected: fail before implementation.

4. Extract the effective-state calculation from `syncRepository()` without changing write behavior.

5. Re-run:

   ```bash
   bun test test/core-effective-state.test.ts
   bun test test/core-diagnostics-sections.test.ts test/commands-card-consumer.test.ts
   ```

   Expected: pass.

**Acceptance Criteria:**

- `syncRepository()` still passes existing tests.
- Capture can call the helper without importing Clipanion command code.
- Helper lives in `cli/core/*` and has no process-exit or CLI framework dependencies.

### Task 2: Add Card Capture Core

**Goal:** Implement pure capture logic that writes a card source from effective project state.

**Files:**
- Create: `cli/core/card-capture.ts`
- Test: `test/core-card-capture.test.ts`

**TDD Scenarios:**

- Captures locked card skill content into `skills/<name>/`.
- Captures project-local skill content into `skills/<name>/`.
- Captures MCP server definitions.
- Captures extensions and targets into `card.json`.
- Writes manifest `name`, `version: "0.1.0"`, and `skills.include`.
- Refuses to overwrite an existing source directory.
- Respects `DRWN_STORE_READONLY=1`.
- Does not inline host environment secret values.

**Commands:**

```bash
bun test test/core-card-capture.test.ts
```

**Acceptance Criteria:**

- Captured source validates through existing manifest validation.
- Captured files are copied, not symlinked.
- Writes are atomic where single-file writes are involved.
- Failure leaves no partially-created source when possible.

### Task 3: Add `drwn card new --from-project`

**Goal:** Expose capture through the authoring command.

**Files:**
- Modify: `cli/commands/card/new.ts`
- Test: `test/commands-card-new-from-project.test.ts`
- Test: `test/cli-help-shape.test.ts`

**TDD Scenarios:**

- `drwn card new @me/captured --from-project <project>` creates a source.
- `--from-project` with no path uses the current working directory.
- Missing project config returns a clear error.
- Existing source returns a clear error.
- `--no-git` behavior remains compatible with existing blank card creation.
- Help output documents the capture form.

**Commands:**

```bash
bun test test/commands-card-new-from-project.test.ts test/cli-help-shape.test.ts
```

**Acceptance Criteria:**

- Existing `drwn card new <name>` behavior is unchanged.
- Capture output includes source path and count summary.
- Next-step text uses existing commands only. Do not mention nonexistent `card source doctor`.

### Task 4: Add Manifest Quality Fields

**Goal:** Let card authors declare lightweight quality metadata.

**Files:**
- Modify: `cli/core/card-manifest.ts`
- Modify: `cli/commands/card/show.ts`
- Test: `test/core-card-manifest.test.ts`
- Test: `test/commands-card-affordances.test.ts`

**Fields:**

```typescript
stability?: "experimental" | "stable" | "production";
lastValidatedWith?: string;
testStatusBadge?: string;
```

**Validation Rules:**

- `stability`, if present, must be one of the three allowed values.
- `lastValidatedWith`, if present, must be a valid semver string.
- `testStatusBadge`, if present, must be an `http:` or `https:` URL.
- Do not add a manifest version bump unless a schema version is proven necessary.

**TDD Scenarios:**

- Valid quality fields pass validation.
- Invalid stability fails.
- Invalid semver fails.
- Non-HTTP badge URL fails.
- `card show` text includes present fields.
- `card show --json` includes present fields.
- Existing manifests without fields still pass.

**Commands:**

```bash
bun test test/core-card-manifest.test.ts test/commands-card-affordances.test.ts
```

**Acceptance Criteria:**

- Optional fields do not affect card resolution or lockfile shape.
- Existing card manifests remain valid.

### Task 5: Add URL-To-Name Cache

**Goal:** Avoid repeated shallow-clone discovery for known Git URLs.

**Files:**
- Create: `cli/core/url-card-map.ts`
- Modify: Git URL discovery/resolution module that currently discovers card names
- Test: `test/core-url-card-map.test.ts`
- Test: existing Git resolution tests, likely `test/core-card-store-git.test.ts` or equivalent

**Cache Shape:**

```json
{
  "mapVersion": 1,
  "entries": {
    "git+https://github.com/owner/repo.git": {
      "name": "@scope/name",
      "url": "https://github.com/owner/repo.git",
      "discoveredAt": "2026-06-02T00:00:00.000Z"
    }
  }
}
```

**TDD Scenarios:**

- Missing cache returns no mapping.
- Cache hit returns mapped card name.
- Cache write is atomic.
- Invalid cache shape is ignored or repaired with a clear warning path.
- Discovery populates the cache after successful manifest validation.
- Repeat resolution of the same URL uses the cache and avoids discovery clone.
- Name collision policy still fires when cache points at a name whose local origin URL differs.
- Fresh discovery can correct a stale cache entry after validation succeeds.

**Commands:**

```bash
bun test test/core-url-card-map.test.ts test/core-card-store-git.test.ts
```

**Acceptance Criteria:**

- Cache is an optimization, not a correctness dependency.
- Corrupt cache does not block install/apply unless it prevents safe write repair.
- Cache stores `drwn` paths only.

### Task 6: Documentation Updates

**Goal:** Document capture, manifest quality fields, and URL cache behavior.

**Files:**
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/09_harness-cards-manual-test-guide.md`
- Modify: `README.md`
- Modify: relevant `docs-astro/src/content/docs/*.md`
- Modify: this task file if implementation decisions changed

**Required Content:**

- Capture flow:

  ```bash
  drwn card new @me/project-harness --from-project .
  drwn card publish @me/project-harness
  ```

- Manifest quality fields with examples.
- URL cache location and "optimization only" semantics.
- Explicit warning that `skills.shared` remains reserved unless a later registry wave activates it.

**Commands:**

```bash
bun test test/docs-readiness.test.ts
rg -n "bgng|beginning-harness|\\.agents/bgng" README.md docs-astro/src .ai/knowledges .ai/tasks/34_drwn-git-distribution-wave-2-implementation-plan.md
```

**Acceptance Criteria:**

- Active docs use `drwn` and `darwinian` terms.
- Examples do not reference nonexistent commands.
- Docs align with task 50 command roles.

### Task 7: Integration And Smoke Tests

**Goal:** Verify Wave 2 end-to-end behavior across core user paths.

**Files:**
- Create or modify: `test/scenarios-wave-2.test.ts`

**Scenarios:**

- Create a project from a Git-origin card, write it, capture it, publish the captured card, add it to a fresh project, and write again.
- Capture a project with project-local overrides and verify the captured card is self-contained.
- Add a Git URL twice and verify the second resolution uses `url-card-map.json`.
- Validate a card with quality fields and inspect it through `card show --json`.
- Run with `DRWN_STORE_READONLY=1` and verify capture/cache mutation paths refuse writes where appropriate.

**Commands:**

```bash
bun test test/scenarios-wave-2.test.ts
bun test
bun run typecheck
bun run verify:release --json
npm pack --dry-run --json
git diff --check
```

**Acceptance Criteria:**

- Full local gate suite passes.
- Release verifier remains clean.
- Pack dry-run includes new Wave 2 files.

---

## Testing Strategy

### Unit Tests

- Manifest validation.
- URL map read/write/canonicalization.
- Effective-state helper.
- Capture file generation.
- Readonly guard paths.

### Integration Tests

- CLI capture command.
- `card show` text and JSON output.
- Git URL resolution with and without cache.
- Capture + publish + install flow using local Git remotes.

### End-To-End / Scenario Tests

- Fresh project consumes a captured card.
- Multi-card effective state flattens correctly.
- Project-local skills are captured.
- URL cache reduces repeated discovery.
- Quality fields survive publish/show/install workflows.

### Smoke Tests

Before release, run one disposable live Git remote smoke:

```bash
drwn card new @team/wave2-smoke --from-project .
drwn card publish @team/wave2-smoke
drwn card remote add @team/wave2-smoke <git-remote-url>
drwn card push @team/wave2-smoke
drwn card clone git+<git-remote-url>#v0.1.0 --json
drwn add git+<git-remote-url>#v0.1.0
drwn install --no-apply
drwn write --dry-run
```

---

## Success Criteria

- [ ] Task 21 is clearly marked historical/stale.
- [ ] Analysis 52 no longer contains misleading active `apply`/v1/`bgng` wording.
- [ ] Active help/docs no longer describe pre-Wave-1 copy-based card storage.
- [ ] Full preflight gates pass before implementation.
- [ ] `drwn card new <name> --from-project [path]` works.
- [ ] Captured cards are self-contained and publishable.
- [ ] Capture reuses effective-state semantics shared with `drwn write`.
- [ ] Manifest quality fields validate and display.
- [ ] URL-to-name cache works and is safe under stale/corrupt cache cases.
- [ ] `DRWN_STORE_READONLY` blocks Wave 2 store mutations.
- [ ] Unit, integration, scenario, typecheck, release verifier, pack dry-run, and diff-check gates pass.
- [ ] Active docs are updated.

---

## Risks And Mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| Capture duplicates materialization semantics and diverges from `drwn write`. | High | Extract a shared effective-state helper first. |
| Capture leaks secrets from MCP server config. | High | Preserve env-var references; never read process env values into card sources. |
| Optional manifest fields accidentally become a breaking schema bump. | Medium | Keep fields optional; avoid `manifestVersion` unless necessary. |
| URL cache becomes a correctness dependency. | Medium | Treat cache as optimization; fall back to discovery and validate before update. |
| Stale task 21 is executed by mistake. | Medium | Mark it historical and make task 34 canonical. |
| Default capture name complicates command parsing. | Low | Prefer positional `<name>`; defer default-name convenience if needed. |

---

## Non-Goals For This Wave

- Do not implement registry-backed `skills.shared`.
- Do not introduce a hosted registry.
- Do not add external service dependencies.
- Do not restore backward compatibility with `bgng`.
- Do not add commits unless explicitly requested.

---

## Completion Documentation Requirement

When Wave 2 completes, create:

```text
.ai/tasks/34_completion_drwn-git-distribution-wave-2.md
```

It must include:

- Delivered scope.
- Deviations from this plan.
- Full verification commands and results.
- Complete tested scenario list.
- Residual risks.
- Recommended live remote smoke evidence.
