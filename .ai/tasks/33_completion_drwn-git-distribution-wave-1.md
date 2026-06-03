# Task 33 Completion: drwn Git Distribution Wave 1

**Task**: [33_drwn-git-distribution-wave-1-implementation-plan.md](./33_drwn-git-distribution-wave-1-implementation-plan.md)
**Completed**: 2026-06-02 PDT
**Status**: Implemented and locally verified
**Commit Status**: No commits made, per instruction
**Worktree Status**: No separate git worktree created, per instruction
**Current Branch**: `remyjkim/harness-card-v1.1`

---

## Executive Summary

Wave 1 is complete as a local implementation. drwn now has a Git-backed card distribution model: per-card bare Git repositories, content-addressed extraction by Git tree SHA, lockfile v2 entries with origin and Git metadata, install/bootstrap from lockfiles, card team-sharing commands, catalogs, card search, history/validation affordances, store maintenance commands, and a bounded parallel fetch path.

Application Git operations are centralized through `cli/core/git.ts`, which shells out to the system `git` binary through `Bun.spawn(["git", ...])`. drwn does not use a Git library. The only direct Git spawn outside the wrapper is in test fixture setup code.

Wave 1 deliberately did not include `drwn card new --from-project`, manifest quality fields, or a persistent URL-to-name mapping cache. Those are now Wave 2 scope.

---

## Delivered Scope

### Git Foundation

- Added `cli/core/git.ts` as the application Git wrapper.
- Implemented typed Git operations for:
  - bare repo initialization
  - config read/write
  - ref parsing
  - object/type inspection
  - tree writing
  - commit creation
  - tag creation/listing
  - clone/fetch/push
  - remotes
  - logs
  - diffs
  - blob reads
  - tree extraction
- Added `DrwnError` in `cli/core/errors.ts` and introduced typed operator-facing errors in the Git/store/install path.
- Added `writeAtomically()` in `cli/core/fs.ts` and moved lockfile/store JSON writes to atomic temp-then-rename behavior.

### Git-Backed Store

- Store cards now live as per-card bare repos under `~/.agents/drwn/cards/@scope/name.git/`.
- Published content is extracted to `~/.agents/drwn/extracted/<tree-sha>/`.
- Content identity is anchored to Git tree SHA rather than ad hoc archive/cache paths.
- The abandoned Phase 1 throwaway `cache/` design was not implemented.
- Store path helpers now use `drwn` runtime terminology and paths.

### Card Publishing And Resolution

- Reworked card publishing so `drwn card publish` creates commits and version tags in the card's bare repo.
- Reworked card resolution to support:
  - local store-origin cards
  - file-origin cards
  - Git-origin cards
- Added v2-only card lockfiles with:
  - `lockfileVersion: 2`
  - `origin`
  - `git.url`
  - `git.ref`
  - `git.commit`
  - `registry: null`
- Dropped v1 lockfile compatibility by explicit decision. drwn is pre-public and no backward compatibility is required.

### Card Reference Grammar

Wave 1 supports:

- `@scope/name@range`
- unscoped store refs
- `file:./path`
- `git+url#ref`
- `git+url@range`
- `github:owner/repo#ref`
- `github:owner/repo@range`
- `gitlab:owner/repo#ref`
- `gitlab:owner/repo@range`

Git and shorthand refs require either `#<ref>` or `@<range>`. Git URL name collisions are rejected rather than silently overwriting an existing card store repo.

### Install And Project Materialization

- Added top-level `drwn install`.
- `drwn install` can bootstrap missing Git-origin cards from `card.lock`.
- `drwn install --frozen` refuses work that would need missing clones/resolution.
- `drwn install --no-apply` fetches without materializing.
- Install applies materialized card content by default.
- Added bounded parallel fetches through `cli/core/concurrency.ts`.
- `DRWN_FETCH_CONCURRENCY` overrides the default concurrency of 4.
- `drwn write` remains the local materialization command. `drwn apply` / `drwn card apply` remain project card-set composition commands.

### Team Sharing

Added:

- `drwn card remote add`
- `drwn card remote list`
- `drwn card remote set`
- `drwn card remote remove`
- `drwn card push`
- `drwn card fetch`
- `drwn card clone`

These commands use the Git-backed store and leave authentication to Git itself.

### Catalogs And Search

Added:

- `drwn library catalog list`
- `drwn library catalog add`
- `drwn library catalog refresh`
- `drwn library catalog remove`
- `drwn search card`
- `drwn search card --scope <scope>`
- `drwn init --no-default-catalogs`

Catalogs use a `catalog.json` schema with `catalogVersion: 1`, `scope`, and card entries. The default community catalog URL is `https://github.com/darwinian-harness/cards-catalog.git`, registered fail-soft by default during init.

### Card Affordances

Added or expanded:

- `drwn card show --json` with Git history.
- `drwn card diff` with real Git diff plus semantic classification.
- `drwn card validate`.
- `drwn card outdated --fetch`.

### Store Maintenance

Added:

- `drwn store migrate-to-git`
- `drwn store verify`
- `drwn store gc`
- `drwn store export --out <tar>`
- `DRWN_STORE_READONLY=1`

`DRWN_STORE_READONLY` is enforced at representative store mutation entry points, including migration, catalog mutation/refresh, extraction, and install-time clone/fetch.

### Terminology And Documentation

- Active command/help/docs surfaces were updated to use `darwinian` / `drwn` terminology.
- Deprecated `beginning` / `bgng` terminology was removed from active Wave 1 surfaces.
- A final pre-Wave-2 help-string sweep for old copy-based store wording is queued in task 34 because `drwn card publish` help still contains an outdated per-version store description.
- `.ai/knowledges/01_agents-cli-usage-guide.md` was updated for current command roles.
- `.ai/analyses/50_drwn-command-roles-across-git-rollout-phases.md` was updated to reflect post-Wave-1 command semantics:
  - `drwn write` = downstream materialization.
  - `drwn apply` / `drwn card apply` = project card-set composition.
  - `drwn install` = lockfile bootstrap plus optional write.

---

## Formally Accepted Scope Decisions

### D18: Lockfile v2 Hard Cut

Wave 1 is v2-only. No reader shim exists for `lockfileVersion: 1`. Existing pre-Wave-1 local projects must regenerate the lockfile from the intended cards.

Reason: drwn is pre-public and backward compatibility was explicitly declared out of scope.

### D19/D20/D21: No `bgng` Runtime Path Migration

No automatic `~/.agents/bgng/` to `~/.agents/drwn/` migration was added.

Reason: commit `b1ec183` already moved the repo's own runtime state to `drwn` paths, and any pre-rebrand local store can be manually renamed by its owner.

### Git Binary, Not Git Library

drwn uses the system `git` binary under the hood via `Bun.spawn`. This is now an explicit runtime expectation. There is no Git library abstraction in Wave 1.

---

## Post-Review Closeout

A post-implementation review surfaced and closed these gaps before Wave 1 was considered complete:

- **Catalog reconciliation**: catalog schema and index schema now match the intended spec.
- **Default community catalog**: default registration now points to `https://github.com/darwinian-harness/cards-catalog.git`.
- **Catalog refresh**: `drwn library catalog refresh [<scope>]` was added.
- **Catalog search scope**: `drwn search card --scope <scope>` was added.
- **Default catalog opt-out**: `drwn init --no-default-catalogs` was added.
- **Readonly store gate**: `DRWN_STORE_READONLY` was extended to additional mutation paths.
- **Parallel install/outdated fetch**: bounded concurrency was added and tested.
- **Dead code cleanup**: removed unused store cache helper and redundant Git no-op.

---

## Verification

### Full Local Gates

Fresh verification after the Wave 1 implementation:

```bash
bun test
bun run typecheck
bun run verify:release --json
npm pack --dry-run --json
git diff --check
```

Results:

- `bun test`: 453 pass, 0 fail, 1678 expectations, 86 files.
- `bun run typecheck`: passed.
- `bun run verify:release --json`: `"ok": true`, no warnings.
- `npm pack --dry-run --json`: passed and included the Wave 1 command/core files.
- `git diff --check`: clean.

### Targeted Post-Coworker Sanity Gate

After the coworker's concurrency update:

```bash
bun test test/core-concurrency.test.ts test/commands-install.test.ts test/commands-card-outdated-fetch.test.ts
```

Result:

- 15 pass, 0 fail, 33 expectations, 3 files.

### Search/Static Checks

Additional checks performed:

```bash
rg -n '<direct git spawn pattern>' cli test scripts
rg -n '<pre-rebrand terminology pattern>' cli test docs-astro/src .ai/tasks/33_drwn-git-distribution-wave-1-implementation-plan.md .ai/knowledges/09_harness-cards-manual-test-guide.md README.md package.json
```

Results:

- Direct Git spawn scan: application code funnels through `cli/core/git.ts`; direct spawn appears only in the test fixture helper.
- Deprecated active terminology scan: no active-source/doc matches after cleanup.

---

## Scenario Coverage

### Unit / Core Scenarios

Git wrapper:

- `runGit` captures stdout/stderr/exit code.
- Bare repo initialization succeeds.
- Bare repo config get/set succeeds.
- Ref parsing and object type inspection work.
- Commit tree lookup works.
- Missing refs produce a typed not-found error.
- `ls-remote` enumerates refs from a local file remote.
- Clone/fetch flows work against local file remotes.
- Remote add/list/set/remove flows work.
- Tags can be listed and selected.
- Tree write, commit creation, ref update, and tag creation work.
- Push publishes commits/tags to a remote.
- Tree extraction materializes committed content.
- Git log, diff, and blob reads expose history/content.

Store paths and atomic writes:

- Card names map to per-card bare repo paths.
- Extracted paths validate tree SHA format.
- Catalog URL paths are slugged deterministically.
- Atomic writes create files.
- Atomic writes overwrite files.
- Atomic writes do not leave temp files behind after success.

Errors:

- `DrwnError` preserves code, message, hints, and cause.
- Git/store/install errors provide operator-oriented messages.

Concurrency:

- `pMap` preserves input order.
- `pMap` honors the concurrency cap.
- `pMap` runs faster than sequential with concurrency greater than 1.
- `pMap` rethrows after in-flight work settles.
- `pMap` handles empty input.
- `pMap` handles concurrency greater than item count.
- `resolveFetchConcurrency` defaults to 4.
- `resolveFetchConcurrency` honors valid env overrides.
- `resolveFetchConcurrency` clamps invalid env overrides to the default.

### Card Ref / Lockfile Scenarios

- Scoped store refs with semver ranges parse.
- Unscoped store refs parse.
- File refs parse.
- `git+url#ref` parses.
- `git+url@range` parses.
- GitHub shorthand refs parse and canonicalize.
- GitLab shorthand refs parse and canonicalize.
- Malformed Git refs are rejected.
- Publishing creates a bare repo, tag, and extracted tree.
- Resolving store-origin cards reads from bare repo tags.
- Applying project cards writes v2 lockfile entries with Git commit metadata.
- First-time Git-origin refs clone and record origin URL.
- Git-origin semver ranges select the highest matching tag.
- Git URL name collisions are rejected.

### Install / Migration Scenarios

- `drwn install` bootstraps missing Git-origin cards from `card.lock`.
- `drwn install` applies materialized card content by default.
- `drwn install --frozen` refuses missing clones.
- Install detects integrity mismatches.
- Install validates file-origin entries without fetching.
- `store migrate-to-git` converts legacy version directories into bare repo tags.
- Migration dry-run reports without modifying.
- Migration is idempotent after success.
- Migration removes stale temporary repos before retry.
- Migration aborts on legacy integrity mismatch.

### Team Sharing / Catalog Scenarios

- `card remote add/list/set/remove` manages remotes.
- `card push` publishes tags to a configured remote.
- `card fetch` imports remote tags.
- `card clone` resolves Git refs into the local store.
- Default community catalog is listed.
- Local catalog add clones and registers a catalog.
- Catalog refresh updates registered metadata.
- `search card` finds registered catalog entries.
- Scoped search filters catalog results.
- Default catalog registration can be skipped during init.

### Affordance / Maintenance Scenarios

- `card show --json` includes Git history.
- `card diff` includes semantic classification.
- `card diff` includes real Git diff output.
- `card validate` reports valid refs.
- `card validate` reports invalid refs.
- `card outdated --fetch` detects newer remote tags.
- `store verify` reports a valid Git-backed store.
- `store gc` runs maintenance on card repos.
- `store export` writes a tar archive.
- `DRWN_STORE_READONLY` blocks representative store mutations.

### Documentation / Packaging Scenarios

- CLI help shape tests pass.
- Package readiness tests pass.
- Homebrew readiness tests pass.
- Docs readiness tests pass.
- `npm pack --dry-run --json` includes the expected Wave 1 files.

---

## Known Residual Risk

- Hosted GitHub/GitLab authentication, credential prompts, slow networks, and authorization failures still need live smoke coverage against disposable remotes before release.
- Non-fast-forward remote push behavior should get an explicit CLI-level live-remote smoke before broad team rollout.
- Catalog search is covered by local Git-backed fixtures; a real community catalog remote should be smoke-tested once the canonical catalog repo exists.
- The reusable GitHub Action companion repo was not created in this workspace and remains an operator action.
- `DRWN_STORE_READONLY` has representative coverage. Any future store-mutating helper must explicitly call the same guard.

---

## Recommended Release Smoke

Run one disposable live-remote smoke before publishing:

```bash
drwn card new @team/smoke --no-git
drwn card publish @team/smoke
drwn card remote add @team/smoke <git-remote-url>
drwn card push @team/smoke
drwn card clone git+<git-remote-url>#v1.0.0 --json
drwn add git+<git-remote-url>#v1.0.0
drwn install --no-apply
drwn write --dry-run
```

Run one catalog smoke:

```bash
drwn library catalog add smoke <catalog-remote-url>
drwn search card smoke --json
```

---

## Handoff To Wave 2

Wave 2 should start from this state:

- Lockfiles are v2-only.
- Runtime paths are `~/.agents/drwn/`.
- `drwn write` is the materialization command.
- `drwn apply` / `drwn card apply` compose the project card set.
- `skills.shared` is still reserved and rejected when non-empty.
- There is no persistent `url-card-map.json` yet.
- There is no `drwn card new --from-project` capture flow yet.
- There are no manifest quality fields yet.

The canonical Wave 2 plan is [34_drwn-git-distribution-wave-2-implementation-plan.md](./34_drwn-git-distribution-wave-2-implementation-plan.md).

---

## Working Tree Notes

The workspace contains many uncommitted Wave 1 implementation/doc changes and additional coworker edits. They were not committed or reverted. This completion document is itself uncommitted, per instruction.
