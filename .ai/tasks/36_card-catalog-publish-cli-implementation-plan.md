# Task 36: Card Catalog Publish CLI Implementation Plan

> **For implementer:** Execute this plan task-by-task. Follow `.ai/rules/02_tdd_practices.md`: write a failing test first, make the smallest implementation pass, then refactor while tests stay green. Do not commit unless explicitly instructed.

**Status**: Ready for implementation
**Created**: 2026-06-03
**Updated**: 2026-06-03
**Priority**: High
**Estimated Effort**: 1 PR for CLI MVP, plus 1 companion skills-repo patch
**Depends On**: Git-backed card distribution through `drwn card publish`, `drwn card remote`, `drwn card push`, `drwn card validate`, and registered card catalogs
**Primary Analysis**: [../analyses/55_card-catalog-publish-cli-target-architecture.md](../analyses/55_card-catalog-publish-cli-target-architecture.md)
**Related Analysis**: [../analyses/53_remote-card-publishing-usage-pattern-manual.md](../analyses/53_remote-card-publishing-usage-pattern-manual.md), [../analyses/51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md](../analyses/51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md)
**TDD Rule**: [../rules/02_tdd_practices.md](../rules/02_tdd_practices.md)

---

## Objective

Add first-class producer-side catalog publication to the `drwn` CLI:

```bash
drwn card catalog publish <card-ref> \
  --catalog <scope|git-url|path> \
  --mode local|direct \
  [--name <catalog-entry-name>] \
  [--description <text>] \
  [--tag <tag>]... \
  [--url <installable-card-url>] \
  [--replace] \
  [--dry-run] \
  [--json]
```

The command should take an already-published card ref, derive or accept an installable Git card URL, add or update the entry in a Git-backed `catalog.json`, validate the result, and optionally commit/push it so teammates can discover the card with `drwn search card`.

MVP includes:

- `--mode local`
- `--mode direct`
- `--dry-run`
- `--json`
- local path, Git URL, and registered `@scope` catalog targets

Deferred:

- `--mode pr`
- catalog schema v2
- catalog-backed alias resolution in `drwn add`
- GitHub repo creation
- hosted registry service

---

## Problem Statement

The current card sharing flow is complete until discoverability:

```bash
drwn card publish @team/baseline
drwn card validate @team/baseline@0.1.0
drwn card remote add @team/baseline git@github.com:team/baseline-card.git
drwn card push @team/baseline
```

After that, authors must manually clone a catalog repo, edit `catalog.json`, validate the entry, commit, push, refresh the local catalog, and search for the result. That manual step is fragile because it crosses several concerns:

- card ref validation
- installable URL derivation
- catalog schema validation
- duplicate entry policy
- Git working-tree mutation
- Git auth/push behavior
- local catalog refresh and search verification

`drwn` should own that workflow without introducing a registry service.

---

## Command Surface Compatibility

The proposed command has no current path collision. Relevant existing paths:

```text
drwn card publish <name>                 # local immutable card-store publish
drwn card remote add|set|list|remove     # local card repo remote config
drwn card push <name>                    # push local card repo refs
drwn card validate <ref>                 # resolve and validate one card ref
drwn library catalog add|list|refresh|remove
drwn search card <query>
drwn add <spec>                          # top-level alias for drwn card add
drwn card add <spec>                     # project consumption, not publication
```

Do not implement this as:

- `drwn card publish --catalog ...`: `card publish` means local immutable card-store publication.
- `drwn library catalog publish ...`: `library catalog` means consumer-side local registration and refresh.
- `drwn add ...`: add/apply/pin are project-consumption flows that update project config and `card.lock`.
- `drwn search card --publish ...`: search is discovery-only.

Separate follow-up to note: Docusaurus currently documents `drwn add card <ref>`, but the live CLI exposes `drwn add <spec>` and `drwn card add <spec>`. This mismatch does not block this task. Fix it separately unless this task already touches the same docs page.

---

## Scope

### In Scope

- New core module: `cli/core/card-catalog-publish.ts`.
- New command module: `cli/commands/card/catalog-publish.ts`.
- Registration in `cli/index.ts`.
- Strict catalog v1 validation for authoring.
- Stable `catalog.json` write rules.
- Catalog target resolution:
  - local path
  - Git URL
  - registered catalog scope from `~/.agents/drwn/catalogs.json`
- Installable card URL derivation:
  - explicit `--url`
  - `resolved.git.url`
  - local bare repo `drwn.originUrl`
- Duplicate/noop/replace behavior.
- `--mode local` with local path.
- `--mode direct` with local path, Git URL, and registered scope.
- `--dry-run` and `--json`.
- Isolated temporary-store validation for Git-origin smoke checks.
- Read-only store compatibility.
- Real shell-driven scenario tests using `bash`, `mktemp`, `git`, `file://` remotes, and the CLI entrypoint.
- CLI docs and help updates in active Docusaurus docs.
- Focused tests following RED/GREEN/REFACTOR.

### Out Of Scope

- `--mode pr`.
- Opening GitHub pull requests.
- Creating catalog repositories.
- Creating card repositories.
- Force-pushing catalog changes.
- Rewriting existing card catalog consumer search.
- Catalog-backed alias resolution in `drwn add`.
- npm-origin cards.
- Editing deprecated `docs-astro/`.

---

## Locked Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Command path is `drwn card catalog publish`. | Producer-side card discoverability, not local library registration. |
| D2 | MVP catalog schema remains v1. | Avoid schema churn while adding authoring support. |
| D3 | Catalog entries default to immutable Git tag refs: `git+<url>#v<version>`. | Copy-paste installability and reproducibility. |
| D4 | `--mode` is required. | Shared catalog mutation should be explicit. |
| D5 | `--mode local` does not commit or push. | Supports review and manual handoff. |
| D6 | `--mode direct` commits and pushes normal Git history. | Maintainers with push rights get a complete path. |
| D7 | Duplicate card names fail unless `--replace`; identical entries are noops. | Prevents accidental catalog overwrite. |
| D8 | Catalog entry name may differ from card manifest name, with a warning. | Curated catalogs may expose aliases. |
| D9 | Git-origin validation uses an isolated temporary store. | Avoids hidden writes to the user's main store. |
| D10 | Direct mode delegates auth to system Git. | Consistent with `drwn card push`. |
| D11 | Active docs target is `docs-docusaurus/`; do not edit `docs-astro/`. | Docusaurus is the current public docs app. |

---

## Execution Contracts

### TDD Contract

Every implementation task below is TDD-first:

1. Add the failing test.
2. Run the targeted test and confirm the failure is meaningful.
3. Write the smallest implementation to pass.
4. Rerun the targeted test.
5. Refactor if useful.
6. Rerun the affected suite.

Do not write production code for a behavior until its test exists and fails.

### Test Strategy Contract

Use four complementary test tiers. Each tier must add value that the previous tier cannot provide.

1. **Core unit/integration tests**: call exported TypeScript functions directly. Use these for catalog schema validation, upsert behavior, URL derivation, error codes, and stable JSON writing.
2. **Command integration tests**: use `runAgentsCli()` with isolated `AGENTS_HOME_DIR`, `AGENTS_DIR`, and local fixtures. Use these for Clipanion parsing, human/JSON output, exit codes, and command registration.
3. **Scenario tests**: use multi-step Bun tests under `test/scenarios-*.test.ts` for realistic workflows that cross commands and state boundaries.
4. **Real bash scenario tests**: spawn `bash` with `set -euo pipefail`, `mktemp`, actual `git` commands, `file://` remotes, and the CLI entrypoint. These tests should exercise operator-like flows and catch quoting, environment, cwd, and shell sequencing issues that unit and command tests can miss.

For bash tests, prefer generating the script inside a Bun test and executing:

```ts
const proc = Bun.spawn(["bash", "-lc", script], {
  cwd: repoRoot,
  stdout: "pipe",
  stderr: "pipe",
  env,
});
```

The bash script must:

- set `set -euo pipefail`
- allocate all state under `mktemp -d`
- export isolated `AGENTS_HOME_DIR`, `AGENTS_DIR`, and `AGENTS_REPO_ROOT`
- define a `drwn()` shell function that invokes `bun run "$ENTRYPOINT" "$@"`
- use local `file://` Git remotes only
- avoid host `~/.agents`
- assert outcomes with shell, `git`, and `node -e` JSON checks
- clean up temp directories where practical

### Dry-Run Contract

`--dry-run` must not:

- write `catalog.json`
- commit
- push
- mutate `~/.agents/drwn`
- refresh registered catalogs
- write URL-card-name mappings

It may read existing local cards and may validate Git URLs through a temporary isolated store that is removed after the command.

### Read-Only Store Contract

`DRWN_STORE_READONLY=1` blocks writes under `~/.agents/drwn`. For this command:

- dry-run must still work when it does not require new main-store writes
- URL smoke validation must use an isolated temporary store
- direct mode must not push and then fail because a registered catalog refresh is blocked
- if local registered catalog refresh would be skipped due to read-only mode, emit a warning in the result payload

External catalog worktree mutation is not directly governed by `DRWN_STORE_READONLY`, because that path is outside the drwn store. `--dry-run` remains the no-external-write guard.

### Git Contract

- Use system Git through `cli/core/git.ts`.
- Do not store credentials.
- Do not force-push.
- Do not auto-resolve merge conflicts.
- Refuse dirty local catalog worktrees before mutation.
- For cloned catalog worktrees, commit and push the checked-out branch.

### Output Contract

Human output must state:

- added/replaced/noop action
- catalog scope and URL/path
- card install URL
- commit SHA when direct mode commits
- next commands for refresh/search when applicable

JSON output must be stable and include:

```ts
{
  ok: boolean;
  mode: "local" | "direct";
  catalog: {
    input: string;
    scope: string;
    url?: string;
    path: string;
  };
  card: {
    requested: string;
    name: string;
    version: string;
    integrity: string;
    installUrl: string;
  };
  entry: {
    name: string;
    url: string;
    description?: string;
    tags?: string[];
  };
  action: "add" | "replace" | "noop";
  changed: boolean;
  commit?: string;
  warnings: string[];
  next: string[];
}
```

Known failures should use `DrwnError` with stable codes so `--json` can return structured errors.

---

## Entry Checks

Run before editing code:

```bash
git status --short --branch
bun test test/commands-card-catalog.test.ts test/core-card-store-git.test.ts test/core-git-remote-tree.test.ts
bun run typecheck
```

Expected:

- current branch and local modifications are understood
- relevant tests pass
- typecheck passes

If baseline fails, stop and record/fix the baseline before starting T1.

---

## Files Likely Touched

### New Core Files

- `cli/core/card-catalog-publish.ts`

### New Command Files

- `cli/commands/card/catalog-publish.ts`

### Existing Core Files

- `cli/core/git.ts`
- `cli/core/card-catalog.ts` (only if exporting shared types/validation helpers is cleaner)
- `cli/core/card-store.ts` (avoid changes unless a small helper export is necessary)
- `cli/core/output.ts` (only if shared rendering helper is warranted)

### Existing Command Registration

- `cli/index.ts`

### New Tests

- `test/core-card-catalog-publish.test.ts`
- `test/commands-card-catalog-publish.test.ts`
- `test/scenarios-card-catalog-publish.test.ts`
- `test/scenarios-card-catalog-publish-bash.test.ts`

### Likely Test Updates

- `test/core-git-remote-tree.test.ts`
- `test/commands-card-catalog.test.ts`
- `test/cli-help-shape.test.ts`
- `test/commands-output-contracts.test.ts`
- `test/docs-readiness.test.ts`

### Docs

- `docs-docusaurus/docs/reference/cli/card.md`
- `docs-docusaurus/docs/reference/cli/library.md`
- `docs-docusaurus/docs/reference/cli/search.md`
- `docs-docusaurus/docs/guides/sharing-with-a-team.md`
- `docs-docusaurus/docs/reference/specs/card-spec.md` (only if catalog spec detail belongs there)
- `.ai/knowledges/01_agents-cli-usage-guide.md` (if active CLI manual coverage needs updating)
- `.ai/knowledges/09_harness-cards-manual-test-guide.md` (if manual catalog smoke should be recorded)

### Companion Skills Repo

In `/Users/pureicis/dev/darwinian-harness-skills`, after CLI behavior exists:

- create `skills/publish-card-to-catalog/SKILL.md`
- update `skills/author-harness-card/SKILL.md`
- update `skills/share-harness-card/SKILL.md`
- update `skills/manage-harness-library/SKILL.md`
- run the repo's card sync/validation commands

Do not mix commits across repos unless explicitly instructed.

---

## Task Sequence

Implementation order is locked for MVP:

```text
T0 -> T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8
```

T9 is a companion skills-repo task after CLI behavior is implemented.

---

## T0 - Baseline And Fixture Audit

### Objective

Confirm the current test baseline and identify reusable fixtures before adding new tests.

### Files

- No production edits.
- Optional: update this task if a baseline issue changes scope.

### Steps

1. Run entry checks.
2. Review:
   - `test/commands-card-catalog.test.ts`
   - `test/commands-card-team-sharing.test.ts`
   - `test/fixtures/git-helpers.ts`
   - `test/helpers.ts`
   - `cli/core/git.ts`
   - `cli/core/card-store.ts`
   - `cli/core/card-catalog.ts`

3. Record any unexpected baseline failures in this task before implementation.

### Acceptance Criteria

- Existing relevant tests pass or failures are explicitly documented.
- The implementer knows which fixtures will be reused for local Git remotes and catalog repos.

---

## T1 - Git Worktree Primitives

### Objective

Add small, typed Git wrappers for normal working-tree catalog operations. Existing `cli/core/git.ts` is strong for bare repos but does not yet expose clean helpers for normal worktrees.

### Files

- Modify: `cli/core/git.ts`
- Test: `test/core-git-remote-tree.test.ts`

### Tests First

Add tests that fail because helpers do not exist:

- `cloneWorktree` clones a local file remote into a normal worktree.
- `worktreeStatusPorcelain` returns clean/dirty state.
- `currentBranch` returns the checked-out branch.
- `commitWorktreePaths` commits a changed `catalog.json` and returns a 40-char SHA.
- `pushWorktreeHead` pushes the checked-out branch to a local bare remote.

Use local `file://` remotes. No network.

### Implementation Notes

Prefer small wrappers over a generic abstraction:

```ts
cloneWorktree(url, targetPath, opts?)
worktreeStatusPorcelain(cwd)
currentBranch(cwd)
addWorktreePaths(cwd, paths)
commitWorktree(cwd, message)
pushWorktreeHead(cwd, remote, branch)
remoteGetUrl(cwd, remote)
```

Use `runGit([...], { cwd })`. Keep error classification through existing `throwForFailure` patterns where possible.

### Validation

```bash
bun test test/core-git-remote-tree.test.ts
bun run typecheck
```

### Acceptance Criteria

- Working-tree helpers are covered by local Git tests.
- Existing bare-repo tests still pass.
- No command behavior changes yet.

---

## T2 - Catalog Manifest Authoring Core

### Objective

Create the core catalog publication module with strict catalog validation, stable entry upsert behavior, dry-run support, and local path mutation.

### Files

- Create: `cli/core/card-catalog-publish.ts`
- Test: `test/core-card-catalog-publish.test.ts`
- Possibly modify: `cli/core/card-catalog.ts` only for shared exported types

### Tests First

Add failing tests for:

- strict validation accepts valid catalog v1
- strict validation rejects invalid `catalogVersion`
- strict validation rejects invalid scope
- strict validation rejects duplicate card names
- strict validation rejects invalid card entry names
- upsert adds a new entry
- identical existing entry returns `noop`
- changed existing entry fails without `--replace`
- changed existing entry replaces with `--replace`
- cards are sorted by `name`
- tags are sorted and de-duplicated
- optional top-level metadata is preserved
- dry-run returns planned payload and does not write
- local mode writes expected `catalog.json`

### Implementation Notes

Core public types should match the architecture:

```ts
PublishCardToCatalogOptions
PublishCardToCatalogResult
publishCardToCatalog(options)
```

Initial T2 can use a local path catalog target only. It may accept a simplified resolved-card input internally if needed, but by the end of T2 the public function should be shaped for later card-ref resolution.

Write rules:

- two-space JSON
- trailing newline
- stable card ordering
- stable tag ordering
- atomic writes with `writeAtomically`

### Validation

```bash
bun test test/core-card-catalog-publish.test.ts
bun run typecheck
```

### Acceptance Criteria

- Catalog validation and local path mutation are tested without command code.
- No Git push/clone behavior is implemented in this task.

---

## T3 - Card Ref Resolution And Install URL Derivation

### Objective

Teach the core module to resolve `<card-ref>` and derive the catalog entry's installable URL safely.

### Files

- Modify: `cli/core/card-catalog-publish.ts`
- Test: `test/core-card-catalog-publish.test.ts`

### Tests First

Add failing tests for:

- store-origin card with local bare repo `drwn.originUrl` derives `git+<originUrl>#v<version>`
- Git-origin card derives `git+<resolved.git.url>#v<version>`
- explicit `--url` wins over inferred URL
- explicit `--url` must parse as a supported Git-origin card ref
- `file:` explicit URLs are rejected for catalog publication
- missing remote URL fails with clear `CATALOG_CARD_REMOTE_MISSING`
- default entry name is the unscoped manifest card name
- `--name` override is accepted when valid
- invalid `--name` fails
- manifest description is used when `--description` is absent
- `--description` override wins
- Git-origin smoke validation does not write into the caller's main `agentsDir`

### Implementation Notes

Use existing card primitives:

- `parseCardRef`
- `resolveCard`
- `resolveCardBareRepoPath`
- `git.configGet(..., "drwn.originUrl")`
- `isCardUnscopedName`

Resolver-store policy:

- store-origin refs resolve against the caller's `agentsDir`
- Git-origin refs used for URL validation resolve against a temporary isolated `agentsDir`
- temporary store must be removed after validation

### Validation

```bash
bun test test/core-card-catalog-publish.test.ts
bun test test/core-card-store-git.test.ts
bun run typecheck
```

### Acceptance Criteria

- URL inference uses existing card metadata.
- Dry-run and URL validation avoid hidden main-store mutations.
- Error codes are stable and covered.

---

## T4 - CLI Command For Local Mode

### Objective

Expose the core through `drwn card catalog publish` for local path catalogs, including human and JSON output.

### Files

- Create: `cli/commands/card/catalog-publish.ts`
- Modify: `cli/index.ts`
- Test: `test/commands-card-catalog-publish.test.ts`
- Update: `test/cli-help-shape.test.ts`
- Update: `test/commands-output-contracts.test.ts`

### Tests First

Add failing tests for:

- command appears in top-level help
- `drwn card catalog publish ... --mode local --dry-run --json` emits planned payload
- dry-run writes no catalog changes
- `--mode local` updates a local `catalog.json`
- human output includes add/replace/noop and next commands
- duplicate without `--replace` exits nonzero with clear text
- JSON failure output includes `ok: false`, `code`, and `message`
- missing `--mode` fails with usage guidance
- unsupported `--mode pr` fails or is hidden until implemented

### Implementation Notes

Use Clipanion path:

```ts
static override paths = [["card", "catalog", "publish"]];
```

Options:

```ts
cardRef = Option.String({ required: true });
catalog = Option.String("--catalog", { required: true });
mode = Option.String("--mode", { required: true });
name = Option.String("--name");
description = Option.String("--description");
tag = Option.Array("--tag");
url = Option.String("--url");
replace = Option.Boolean("--replace", false);
dryRun = Option.Boolean("--dry-run", false);
json = Option.Boolean("--json", false);
```

If Clipanion's `Option.Array` behavior differs in this repo version, follow the existing project pattern or add a minimal parser.

### Validation

```bash
bun test test/commands-card-catalog-publish.test.ts
bun test test/cli-help-shape.test.ts test/commands-output-contracts.test.ts
bun run typecheck
```

### Acceptance Criteria

- Local mode is usable from CLI.
- JSON output is machine-readable and stable.
- Human output is concise and actionable.

---

## T5 - Direct Mode With Git URL, Local Path, And Registered Scope

### Objective

Implement `--mode direct` so catalog maintainers can commit and push the catalog entry.

### Files

- Modify: `cli/core/card-catalog-publish.ts`
- Modify: `cli/core/git.ts` only if T1 helpers need small additions
- Test: `test/core-card-catalog-publish.test.ts`
- Test: `test/commands-card-catalog-publish.test.ts`

### Tests First

Add failing tests for:

- direct mode clones a local bare catalog remote, commits, and pushes
- pushed catalog remote contains updated `catalog.json`
- direct mode against a local Git worktree commits and pushes current branch
- dirty local catalog worktree is refused before mutation
- registered `@scope` resolves through `catalogs.json`
- registered `@scope` direct publish pushes to the registered catalog URL
- direct publish returns commit SHA in JSON
- direct publish includes refresh/search next commands
- read-only store does not fail after external push because refresh was attempted too late
- non-fast-forward push surfaces a Git failure cleanly

### Implementation Notes

Catalog target resolution:

- `@scope`: load `loadCardCatalogIndex(agentsDir)`, find scope, clone entry URL to temp worktree
- Git URL: clone to temp worktree
- path: use existing path

Worktree rules:

- require root `catalog.json`
- require clean worktree before mutation for local path targets
- for temp clones, clean state is expected
- after write, commit only if changed
- push checked-out branch with normal Git push

Registered catalog refresh:

- if the pushed catalog URL is registered and store is writable, call `refreshCardCatalog`
- if store is read-only, skip refresh and include a warning
- never push and then fail only because refresh was skipped

### Validation

```bash
bun test test/commands-card-catalog-publish.test.ts test/commands-card-catalog.test.ts
bun test test/core-card-catalog-publish.test.ts test/core-git-remote-tree.test.ts
bun run typecheck
```

### Acceptance Criteria

- Direct mode works with local file remotes and registered scopes.
- Direct mode does not force push.
- Dirty worktrees are protected.
- Read-only store behavior is deterministic.

---

## T6 - Scenario And Real Bash Coverage

### Objective

Add broad workflow coverage that proves the feature works as users and maintainers will actually run it, including real bash scripts with temp directories and local Git remotes.

### Files

- Create: `test/scenarios-card-catalog-publish.test.ts`
- Create: `test/scenarios-card-catalog-publish-bash.test.ts`
- Modify: `test/helpers.ts` only if a reusable bash runner materially reduces duplication

### Tests First

Add failing scenario tests before adding or adjusting implementation. Minimum scenario matrix:

#### Bun Scenario Tests

- full happy path: source authoring -> local publish -> card remote push -> catalog direct publish -> catalog add/refresh -> search -> validate entry URL
- dry-run path: same setup, but `--dry-run --json` leaves catalog remote unchanged
- replace path: publish `0.1.0`, then publish `0.1.1`, use `--replace`, and verify catalog URL changes
- noop path: publishing the same entry twice returns `action: "noop"` and does not create a second commit
- registered scope path: register catalog, publish via `--catalog @scope`, refresh, and search
- alias warning path: catalog entry `--name` differs from manifest unscoped name and emits a warning
- missing remote path: local store card without `drwn.originUrl` fails with `CATALOG_CARD_REMOTE_MISSING`
- read-only dry-run path: `DRWN_STORE_READONLY=1` plus `--dry-run` succeeds without store writes

#### Real Bash Scenario Tests

Each bash test should execute a script with `set -euo pipefail`, isolated env vars, and local Git remotes.

Required bash scenarios:

1. **Direct publish happy path**
   - `mktemp -d`
   - create card and catalog bare remotes
   - seed catalog `catalog.json`
   - run card source commands
   - publish/push card
   - run `drwn card catalog publish ... --mode direct --json`
   - verify remote catalog contains the entry using `git clone` and `node -e`
   - register/search catalog with `drwn library catalog add` and `drwn search card`

2. **Dry-run and read-only path**
   - run with `DRWN_STORE_READONLY=1`
   - call `drwn card catalog publish ... --mode local --dry-run --json`
   - verify `catalog.json` checksum is unchanged
   - verify JSON contains `changed: true` for planned add

3. **Failure diversity path**
   - dirty catalog worktree should fail
   - duplicate without `--replace` should fail
   - invalid catalog schema should fail
   - each failure should assert nonzero exit and an expected error code/message

Optional bash scenario if runtime remains reasonable:

- non-fast-forward catalog push failure by advancing the remote after local clone and before direct push

### Implementation Notes

Keep bash tests deterministic:

- use only `file://` remotes
- avoid network
- avoid global `drwn`
- invoke `bun run "$ENTRYPOINT"`
- keep scripts short enough to debug from stdout/stderr
- print key paths only on failure or in assertion messages

Do not put the only coverage for a behavior in bash. Bash tests should prove end-to-end shell realism; core and command tests should still cover precise behavior and error branches.

### Validation

```bash
bun test test/scenarios-card-catalog-publish.test.ts
bun test test/scenarios-card-catalog-publish-bash.test.ts
bun run typecheck
```

### Acceptance Criteria

- At least one bash happy path exercises actual `git`, `mktemp`, `file://` remotes, and the CLI entrypoint.
- Bash tests cover at least one success path and at least three distinct failure paths.
- Scenario tests prove dry-run/read-only behavior and registered-scope discoverability.
- Tests are isolated from the host store and network.

---

## T7 - Docs, Help, And Manual Verification Guide

### Objective

Document the new command in active docs and update readiness assertions.

### Files

- Modify: `docs-docusaurus/docs/reference/cli/card.md`
- Modify: `docs-docusaurus/docs/reference/cli/library.md`
- Modify: `docs-docusaurus/docs/reference/cli/search.md`
- Modify: `docs-docusaurus/docs/guides/sharing-with-a-team.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md` if active CLI manual needs the flow
- Modify: `.ai/knowledges/09_harness-cards-manual-test-guide.md` if manual smoke steps belong there
- Test: `test/docs-readiness.test.ts`

### Tests First

Add failing docs readiness assertions for:

- `drwn card catalog publish`
- `--mode local`
- `--mode direct`
- `drwn library catalog refresh`
- `drwn search card`
- Git auth delegated to Git

### Implementation Notes

Docs should preserve the existing mental model:

- `card publish` publishes locally
- `card push` pushes card refs to a card repo
- `card catalog publish` publishes discoverability metadata to a catalog repo
- `library catalog add/refresh` registers and refreshes catalogs locally
- `search card` discovers cards from registered catalogs

Do not edit `docs-astro/`.

### Validation

```bash
bun test test/docs-readiness.test.ts
bun run typecheck
```

### Acceptance Criteria

- Active docs describe the complete discoverability flow.
- Docs do not imply a hosted registry service.
- Docs clearly explain Git auth requirements.

---

## T8 - Full Verification And Release Readiness

### Objective

Run the focused and broad verification gates before considering the CLI task complete.

### Steps

Run:

```bash
bun test test/core-card-catalog-publish.test.ts
bun test test/commands-card-catalog-publish.test.ts
bun test test/scenarios-card-catalog-publish.test.ts
bun test test/scenarios-card-catalog-publish-bash.test.ts
bun test test/commands-card-catalog.test.ts test/commands-card-team-sharing.test.ts
bun test test/core-card-store-git.test.ts test/core-git-remote-tree.test.ts
bun test test/cli-help-shape.test.ts test/commands-output-contracts.test.ts test/docs-readiness.test.ts
bun test
bun run typecheck
bun run verify:release --json
```

Optional package smoke:

```bash
npm pack --dry-run --json
```

### Acceptance Criteria

- All focused tests pass.
- Full test suite passes.
- Typecheck passes.
- Release verifier passes.
- The task has no unrelated file edits.
- No commits were made unless explicitly requested.

---

## T9 - Companion Skills Repo Update

### Objective

After CLI behavior exists, update `/Users/pureicis/dev/darwinian-harness-skills` so users can execute the new flow through a dedicated skill.

### Files In Skills Repo

- Create: `skills/publish-card-to-catalog/SKILL.md`
- Modify: `skills/author-harness-card/SKILL.md`
- Modify: `skills/share-harness-card/SKILL.md`
- Modify: `skills/manage-harness-library/SKILL.md`
- Modify generated card copies after sync

### Skill Contract

New skill:

```yaml
---
name: publish-card-to-catalog
description: Publish an already-authored and pushed Darwinian Harness Card into a Git-backed card catalog so teammates can discover it with drwn search card. Use when the user wants to add or update catalog.json entries, validate catalog discoverability, prepare direct catalog publication, or reason about catalog publishing permissions.
---
```

Core workflow:

```bash
drwn card source doctor <card-name>
drwn card publish <card-name>
drwn card validate <card-name>@<version>
drwn card remote list <card-name> --json
drwn card push <card-name>
drwn card catalog publish <card-name>@<version> --catalog <scope-or-url-or-path> --mode direct
drwn library catalog refresh <scope>
drwn search card <entry-name> --scope <scope> --json
```

Existing skill updates:

- `author-harness-card`: mention the new skill after local publish when discoverability is desired.
- `share-harness-card`: hand off to the new skill after remote push.
- `manage-harness-library`: clarify it registers/refreshes catalogs locally and does not publish upstream catalog entries.

### Validation In Skills Repo

Run the repo's current validation commands, expected from prior skills work:

```bash
npm run sync:cards
npm run validate:skills
npm run lint:md
drwn card validate file:/Users/pureicis/dev/darwinian-harness-skills/cards/harness-skills --json
drwn card validate file:/Users/pureicis/dev/darwinian-harness-skills/cards/workspace-experimental --json
```

### Acceptance Criteria

- New skill is concise and procedural.
- Existing skills hand off without duplicating the full workflow.
- Generated card copies are synchronized.
- Skills repo validations pass.
- Commit/push only if explicitly instructed.

---

## Deferred Follow-Ups

### F1 - PR Mode

Add:

```bash
drwn card catalog publish <card-ref> --catalog <git-url|scope> --mode pr
```

Requirements:

- branch creation
- `gh auth status`
- `gh pr create`
- mocked process tests
- live GitHub manual smoke

### F2 - Catalog-Backed Alias Resolution

Allow:

```bash
drwn add @curation-labs/personal-harness@0.1.0
```

Resolution order should remain:

1. file/Git explicit refs
2. local store refs
3. registered catalog alias refs

### F3 - Default Community Catalog Fix

After `git@github.com:curation-labs/dh-cards-catalog-v1.git` has a valid public `catalog.json` and at least one tested public card entry, decide whether to update:

```ts
DEFAULT_COMMUNITY_CATALOG_URL
```

or disable the nonexistent default catalog until the official URL is stable.

### F4 - `drwn add card` Alias Decision

Resolve the existing docs/CLI mismatch:

- either add `drwn add card <spec>` as an alias for `drwn card add`
- or correct docs to say `drwn add <spec>` and `drwn card add <spec>`

This is separate from catalog publication and should not block Task 36.

---

## Manual Smoke Scenario

Use local file remotes first:

```bash
TMP="$(mktemp -d)"
CARD_REMOTE="$TMP/baseline-card.git"
CATALOG_REMOTE="$TMP/dh-cards-catalog-v1.git"

git init --bare "$CARD_REMOTE"
git init --bare "$CATALOG_REMOTE"
```

Create a catalog seed worktree:

```bash
git clone "file://$CATALOG_REMOTE" "$TMP/catalog"
cat > "$TMP/catalog/catalog.json" <<'JSON'
{
  "catalogVersion": 1,
  "scope": "@team",
  "description": "Team card catalog",
  "cards": []
}
JSON
git -C "$TMP/catalog" add catalog.json
git -C "$TMP/catalog" commit -m "catalog: initialize"
git -C "$TMP/catalog" push origin HEAD:main
```

Publish a card:

```bash
drwn card new @team/baseline --no-git
drwn card source add-skill @team/baseline alpha
drwn card source set @team/baseline --version 0.1.0 --description "Team baseline"
drwn card source doctor @team/baseline
drwn card publish @team/baseline
drwn card remote add @team/baseline "file://$CARD_REMOTE"
drwn card push @team/baseline
```

Publish to catalog:

```bash
drwn card catalog publish @team/baseline@0.1.0 \
  --catalog "file://$CATALOG_REMOTE" \
  --mode direct \
  --tag baseline \
  --json
```

Verify discoverability:

```bash
drwn library catalog add "file://$CATALOG_REMOTE"
drwn search card baseline --scope @team --json
drwn card validate "git+file://$CARD_REMOTE#v0.1.0" --json
```

Expected:

- catalog remote contains the entry
- search finds `@team/baseline`
- card validation succeeds from the entry URL

---

## Completion Criteria

Task 36 is complete when:

- `drwn card catalog publish` exists and is registered.
- Local mode supports dry-run and real local path mutation.
- Direct mode supports local path, Git URL, and registered scope targets.
- Duplicate/noop/replace behavior is deterministic.
- Git-origin smoke validation does not mutate the main store.
- Read-only store behavior is tested.
- Docs and help describe the new flow.
- Focused tests, full suite, typecheck, and release verifier pass.
- Companion skills-repo task is either completed or explicitly recorded as pending.
