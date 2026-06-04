# Task 39: Card Catalog Collaboration Lifecycle Testing Plan

> **For implementer:** This is a testing task, not a feature-design task. Follow `.ai/rules/02_tdd_practices.md`: add the failing scenario first, prove the failure is meaningful, then make the smallest test-support or implementation change needed. Do not commit unless explicitly instructed.

**Status**: Completed  
**Created**: 2026-06-03  
**Updated**: 2026-06-03  
**Priority**: High  
**Estimated Effort**: 1 focused testing pass, plus fixes only if the lifecycle exposes real product gaps  
**Primary Remote Under Test**: `https://github.com/remyjkim/dh-card-base.git`  
**Known Remote State on 2026-06-03**: `main` at `c7e9374`, tag `v0.1.0` present  
**Known Card Ref**: `git+https://github.com/remyjkim/dh-card-base.git#v0.1.0`  
**Known Card Manifest**: `@remyjkim/dh-card-base@0.1.0`, 12 bundled skills  
**TDD Rule**: [../rules/02_tdd_practices.md](../rules/02_tdd_practices.md)
**Concurrent Regression Context**: Coworker-completed tasks [37_completion_drwn-cli-auth.md](37_completion_drwn-cli-auth.md) and [38_completion_drwn-cli-analyze-sessions.md](38_completion_drwn-cli-analyze-sessions.md) are present in this working tree and must stay covered by release verification.

---

## Objective

Add rigorous collaboration-lifecycle tests for card catalog usage with the real `dh-card-base` remote as the target card repository.

The tests must prove a team can:

1. Publish a remote card into a shared catalog.
2. Follow/register that catalog as a teammate.
3. Discover the card through catalog search.
4. Pull/clone/install the card into a project.
5. Refresh catalog state after catalog updates.
6. Fetch newer card tags.
7. Update a project lock/materialization when the project tracks a semver range.
8. Preserve pinned/immutable behavior when the project uses an immutable tag ref.

The main purpose is to close the current coverage gap: today we test the component pieces, but not one full team collaboration cycle that includes follow, pull, refresh, and update propagation.

---

## Remote Card Facts To Lock Into Tests

Verified with:

```bash
git ls-remote --tags --heads https://github.com/remyjkim/dh-card-base.git
git clone --depth 1 --branch v0.1.0 https://github.com/remyjkim/dh-card-base.git /tmp/dh-card-base
```

Expected `card.json` fields:

```json
{
  "name": "@remyjkim/dh-card-base",
  "version": "0.1.0",
  "description": "Personal base card bundling the 12 current-lane Darwinian Harness skills.",
  "license": "Apache-2.0",
  "stability": "experimental",
  "lastValidatedWith": "0.1.0"
}
```

Expected bundled skills:

```text
bootstrap-project
apply-harness-card
author-harness-card
install-harness-project
inspect-harness
materialize-harness
manage-harness-library
repair-harness
manage-defaults
recommend-harness
share-harness-card
support-harness
```

The tests should assert at least the card name, version, and a representative subset of skills. Prefer asserting all 12 skills in the live smoke and at least 2-3 representative skills in longer lifecycle tests.

---

## Safety Rules

- Do not push to `https://github.com/remyjkim/dh-card-base.git`.
- Do not mutate `git@github.com:curation-labs/dh-cards-catalog-v1.git` in automated tests.
- Use local `file://` catalog repositories for catalog publication tests.
- For update-propagation tests, create a temporary local mirror of `dh-card-base` and add synthetic test-only tags there.
- Do not rely on global `~/.agents`, `.claude`, or `.codex` state.
- Every subprocess test must set isolated `AGENTS_HOME_DIR`, `AGENTS_DIR`, `AGENTS_REPO_ROOT`, and `HOME`.
- Default release-gate tests should not depend on GitHub network availability unless we explicitly decide to accept live-network CI.
- Live GitHub tests must be opt-in with an environment gate.

---

## Terminology

The current CLI has no `drwn follow` command.

In this plan:

- **Follow catalog** means `drwn library catalog add <catalog-url>`.
- **Pull catalog updates** means `drwn library catalog refresh [scope]`.
- **Pull card updates** means `drwn card fetch <card-name>` or `drwn card outdated --fetch`.
- **Update project** means `drwn card update --write`.
- **Immutable catalog install** means consuming `git+...#v0.1.0`.
- **Range-tracked project install** means consuming `git+...@^0.1.0`.

Catalog v1 entries remain immutable by default. A teammate who installs the raw catalog URL (`#v0.1.0`) should not silently move to `v0.1.1` on `card update`. A teammate who intentionally tracks `@^0.1.0` should be able to move when newer compatible tags exist.

---

## Current Coverage Baseline

Already covered by existing tests:

- `drwn card catalog publish --mode local` writes catalog entries.
- `drwn card catalog publish --mode direct` commits and pushes to a catalog repo.
- Registered catalog scopes resolve in `card catalog publish`.
- `drwn library catalog add/list/refresh/remove` works with local Git catalog repos.
- `drwn search card --scope` finds catalog entries.
- Producer-to-consumer catalog scenario proves one card can be published, discovered, cloned, and shown.
- `drwn card remote add/list/set/remove`, `card push`, `card fetch`, and `card clone` work with local remotes.
- `drwn card outdated --fetch` sees newer remote tags.
- `drwn install` bootstraps Git-origin cards from `card.lock`.

Not yet covered as one collaboration cycle:

- Real remote card repo as the target card.
- Consumer follows a catalog, installs the discovered card into a project, then later observes a catalog/card update.
- Distinction between immutable catalog URL behavior and semver-range update behavior.
- Fresh teammate install from a lockfile produced by a catalog-discovered card.
- Live smoke against `https://github.com/remyjkim/dh-card-base.git`.

---

## Test Architecture

Add two tiers.

### Tier 1: Default Deterministic Collaboration Scenario

File:

```text
test/scenarios-card-catalog-collaboration-lifecycle.test.ts
```

This test should run in the default suite without relying on GitHub network. It should use a local temporary Git remote that is seeded from the `dh-card-base` card shape.

Acceptable seed strategies, in order of preference:

1. Build a local card repo fixture with the exact `@remyjkim/dh-card-base` manifest and 12 skill directories.
2. If we want stronger parity, add a helper that can clone the live GitHub repo when `DRWN_LIVE_DH_CARD_BASE=1`, but falls back to the exact local fixture when unset.

The default test must:

- use a local bare card repo as the card remote;
- use local bare catalog repos as shared catalogs;
- add synthetic `v0.1.1` in the local card remote for update propagation;
- exercise only the CLI surface, not internal functions, except for test fixture setup.

### Tier 2: Opt-In Live GitHub Smoke

File:

```text
test/live-dh-card-base-catalog-collaboration.test.ts
```

Gate:

```ts
const runLive = process.env.DRWN_LIVE_DH_CARD_BASE === "1";
(runLive ? test : test.skip)(...)
```

This test must use the real remote:

```text
git+https://github.com/remyjkim/dh-card-base.git#v0.1.0
```

It should not create synthetic tags or mutate GitHub. It should only prove live clone/validate/catalog-discover/install behavior at `v0.1.0`.

Run manually with:

```bash
DRWN_LIVE_DH_CARD_BASE=1 bun test test/live-dh-card-base-catalog-collaboration.test.ts
```

---

## Detailed Test Cases

### Test 1: Live Remote Reachability And Manifest Contract

**Tier**: Opt-in live  
**Purpose**: Prove the real remote is still installable and shaped as expected.

Steps:

1. Create isolated fixture with `scaffoldCliFixture()`.
2. Run:

   ```bash
   drwn card clone git+https://github.com/remyjkim/dh-card-base.git#v0.1.0 --json
   drwn card show @remyjkim/dh-card-base@0.1.0 --json
   ```

3. Assert:
   - clone exits 0;
   - show exits 0;
   - `name === "@remyjkim/dh-card-base"`;
   - `version === "0.1.0"`;
   - included skills contain all 12 known skills;
   - no host-level `.agents` state was touched.

Expected failure mode:

- If GitHub is unavailable, the test should skip unless explicitly enabled.
- If the remote tag or manifest changed, the failure is real and should prompt a test-plan update or remote-version decision.

### Test 2: Publish Real Remote Card Into A Shared Catalog

**Tier**: Opt-in live  
**Purpose**: Prove catalog publish accepts the real Git-origin card ref.

Setup:

- Temporary bare catalog repo with `catalog.json`:

  ```json
  {
    "catalogVersion": 1,
    "scope": "@remyjkim",
    "description": "Live dh-card-base catalog smoke",
    "cards": []
  }
  ```

Steps:

```bash
drwn card catalog publish \
  git+https://github.com/remyjkim/dh-card-base.git#v0.1.0 \
  --catalog file://$CATALOG_REPO \
  --mode direct \
  --name dh-card-base \
  --description "Personal base card bundling Darwinian Harness skills" \
  --tag base \
  --tag skills \
  --json
```

Assert:

- exit code 0;
- result `entry.name === "dh-card-base"`;
- result `entry.url === "git+https://github.com/remyjkim/dh-card-base.git#v0.1.0"`;
- remote catalog `HEAD:catalog.json` contains the entry;
- tags are sorted and deduped if duplicates are supplied;
- direct mode creates a catalog commit.

### Test 3: Teammate Follows Catalog, Discovers Card, Installs Into Project

**Tier**: Opt-in live and deterministic default variant  
**Purpose**: Prove consumer onboarding from catalog discovery to materialized skills.

Steps:

1. Consumer fixture:

   ```bash
   drwn library catalog add file://$CATALOG_REPO
   drwn search card dh-card-base --scope @remyjkim --json
   ```

2. Extract `results[0].url`.
3. Create temp project and initialize minimal project config:

   ```bash
   drwn init --non-interactive --no-default-catalogs
   drwn card apply "$RESULT_URL" --write
   ```

4. Assert:
   - catalog list contains scope `@remyjkim`;
   - search returns one result with URL `git+...#v0.1.0`;
   - `card.lock` contains `@remyjkim/dh-card-base@0.1.0`;
   - representative skills are materialized:
     - `.claude/skills/bootstrap-project`
     - `.claude/skills/author-harness-card`
     - `.claude/skills/share-harness-card`
   - `drwn doctor --json` does not report missing generated files for this project.

### Test 4: Fresh Teammate Rehydrates From Lockfile

**Tier**: Deterministic default, optional live if runtime is acceptable  
**Purpose**: Prove a collaborator can clone a project that already has `card.lock` and run `drwn install`.

Steps:

1. From Test 3 project, keep `.agents/drwn/config.json` and `.agents/drwn/card.lock`.
2. Create a second consumer fixture with an empty store.
3. Run:

   ```bash
   drwn install --no-apply
   drwn install
   ```

4. Assert:
   - `install --no-apply` clones the Git-origin card into the local store but does not write `.claude/skills`;
   - `install` materializes representative skills;
   - lock integrity validates;
   - no catalog registration is required for lockfile install, because lockfile contains the Git-origin source.

### Test 5: Catalog Refresh Shows A New Catalog Entry URL

**Tier**: Deterministic default  
**Purpose**: Prove teammate catalog cache updates after the catalog maintainer replaces the entry with a newer immutable URL.

Setup:

- Use a local bare mirror of the `dh-card-base` fixture.
- Start with `v0.1.0`.
- Add synthetic `v0.1.1` by modifying only `card.json.version` and maybe description in a temp worktree, then tag and push to the local bare card remote.

Steps:

1. Producer updates catalog:

   ```bash
   drwn card catalog publish \
     git+file://$CARD_REMOTE#v0.1.1 \
     --catalog file://$CATALOG_REPO \
     --mode direct \
     --name dh-card-base \
     --replace \
     --json
   ```

2. Consumer before refresh:

   ```bash
   drwn search card dh-card-base --scope @remyjkim --json
   ```

   Assert it still shows `#v0.1.0` from the local cache.

3. Consumer refreshes:

   ```bash
   drwn library catalog refresh @remyjkim
   drwn search card dh-card-base --scope @remyjkim --json
   ```

4. Assert search now shows:

   ```text
   git+file://$CARD_REMOTE#v0.1.1
   ```

### Test 6: Range-Tracked Project Updates From v0.1.0 To v0.1.1

**Tier**: Deterministic default  
**Purpose**: Prove the intended update workflow for teams that want ongoing updates.

Important: catalog v1 emits immutable URLs. For tracking updates, the test must intentionally configure the project with a range ref:

```text
git+file://$CARD_REMOTE@^0.1.0
```

Steps:

1. Consumer project starts before `v0.1.1` exists:

   ```bash
   drwn card apply "git+file://$CARD_REMOTE@^0.1.0" --write
   ```

2. Assert lock version is `0.1.0`.
3. Producer pushes `v0.1.1` to `$CARD_REMOTE`.
4. Consumer runs:

   ```bash
   drwn card outdated --fetch --json
   drwn card outdated --fetch --check
   drwn card update --write
   ```

5. Assert:
   - JSON outdated contains `{ name: "@remyjkim/dh-card-base", current: "0.1.0", latest: "0.1.1" }`;
   - `--check` exits non-zero before update;
   - after update, `card.lock` version is `0.1.1`;
   - representative materialized skills point at an extracted `0.1.1` tree;
   - subsequent `drwn card outdated --fetch --check` exits 0.

### Test 7: Immutable Catalog Install Does Not Move On `card update`

**Tier**: Deterministic default  
**Purpose**: Protect pinned/immutable behavior.

Steps:

1. Consumer project applies:

   ```bash
   drwn card apply "git+file://$CARD_REMOTE#v0.1.0" --write
   ```

2. Producer pushes `v0.1.1`.
3. Consumer runs:

   ```bash
   drwn card outdated --fetch --json
   drwn card update --write
   ```

4. Assert:
   - `card update` leaves `card.lock` at `0.1.0`;
   - materialized skills still point at the `0.1.0` extracted tree.

Open question to capture during implementation:

- `card outdated --fetch` may report a newer local tag even for immutable `#v0.1.0` refs because it compares the lock version against the highest local published version. If that occurs, decide whether to:
  - document it as "newer tag exists, but pinned config will not move"; or
  - update `outdated` to mark pinned refs as non-updatable; or
  - add an `updateable` boolean to JSON output.

Do not silently change this behavior without a failing test and a product decision.

### Test 8: Real Bash End-To-End Smoke

**Tier**: Bash scenario  
**File**:

```text
test/scenarios-dh-card-base-collaboration-bash.test.ts
```

Purpose:

- Catch shell, quoting, cwd, env, and `file://` path issues.
- Exercise operator-like command sequencing.

Bash script requirements:

```bash
set -euo pipefail
ROOT="$(mktemp -d)"
export HOME="$ROOT/home"
export AGENTS_HOME_DIR="$HOME"
export AGENTS_DIR="$HOME/.agents"
export AGENTS_REPO_ROOT="/Users/pureicis/dev/darwinian-harness"
DRWN_ENTRYPOINT="$AGENTS_REPO_ROOT/cli/index.ts"
drwn() { bun run "$DRWN_ENTRYPOINT" "$@"; }
```

Minimum flow:

1. Create local card remote seeded as `@remyjkim/dh-card-base@0.1.0`.
2. Create local catalog remote scope `@remyjkim`.
3. Producer publishes catalog entry.
4. Consumer follows catalog.
5. Consumer searches.
6. Consumer applies card to a project.
7. Producer pushes `v0.1.1` to card remote and updates catalog entry.
8. Consumer refreshes catalog and updates range-tracked project.
9. Assert with `node -e` that `card.lock` moved to `0.1.1`.

Keep the live GitHub remote out of this bash test unless it is guarded by `DRWN_LIVE_DH_CARD_BASE=1`.

---

## Fixture Helper Plan

Add a helper module if duplication becomes heavy:

```text
test/fixtures/dh-card-base-fixture.ts
```

Suggested exports:

```ts
export const DH_CARD_BASE_REMOTE = "https://github.com/remyjkim/dh-card-base.git";
export const DH_CARD_BASE_NAME = "@remyjkim/dh-card-base";
export const DH_CARD_BASE_V1 = "0.1.0";
export const DH_CARD_BASE_SKILLS = [...];

export async function createDhCardBaseSource(root: string, version = "0.1.0"): Promise<string>;
export async function createDhCardBaseBareRemote(root: string, version = "0.1.0"): Promise<{ path: string; url: string }>;
export async function tagDhCardBaseVersion(remote: { url: string }, version: string): Promise<void>;
```

The fixture must create real Git history and annotated tags using the existing `cli/core/git.ts` helpers or plain `git` commands. Avoid string-only fake lockfiles.

---

## Expected Commands Under Test

Catalog producer:

```bash
drwn card catalog publish <git-card-ref> --catalog <catalog-url-or-scope> --mode direct --json
drwn card catalog publish <git-card-ref> --catalog <catalog-url-or-scope> --mode direct --replace --json
```

Catalog consumer:

```bash
drwn library catalog add <catalog-url>
drwn library catalog refresh @remyjkim
drwn search card dh-card-base --scope @remyjkim --json
```

Card consumer:

```bash
drwn card clone <git-card-ref> --json
drwn card show @remyjkim/dh-card-base@0.1.0 --json
drwn card apply <git-card-ref> --write
drwn install --no-apply
drwn install
drwn card outdated --fetch --json
drwn card outdated --fetch --check
drwn card update --write
drwn doctor --json
```

---

## Acceptance Criteria

- [x] New default deterministic scenario test covers full lifecycle through update propagation.
- [x] New opt-in live GitHub test covers `https://github.com/remyjkim/dh-card-base.git#v0.1.0`.
- [x] New bash scenario covers shell-facing workflow around catalog follow, refresh, and range update.
- [x] Tests assert `@remyjkim/dh-card-base` and representative bundled skills.
- [x] Tests verify catalog cache is stale before refresh and current after refresh.
- [x] Tests verify a fresh teammate can run `drwn install` from lockfile without catalog registration.
- [x] Tests verify range-tracked project updates from `0.1.0` to synthetic `0.1.1`.
- [x] Tests verify immutable `#v0.1.0` project remains pinned after `card update`.
- [x] Any discovered product ambiguity, especially `card outdated` behavior for pinned Git refs, is captured with a failing test and resolved deliberately.
- [x] `bun test test/scenarios-card-catalog-collaboration-lifecycle.test.ts` passes.
- [x] `bun test test/scenarios-dh-card-base-collaboration-bash.test.ts` passes.
- [x] `DRWN_LIVE_DH_CARD_BASE=1 bun test test/live-dh-card-base-catalog-collaboration.test.ts` passes before declaring the live remote cycle verified.
- [x] `bun run typecheck` passes.
- [x] `bun run verify:release --json` passes after test additions and any required fixes.

## Completion Notes

Implemented on 2026-06-03:

- Added deterministic `dh-card-base` Git/card/catalog fixtures.
- Added the default collaboration lifecycle scenario.
- Added a real Bash collaboration scenario.
- Added an opt-in live GitHub smoke test.
- Fixed `drwn card outdated --fetch` so it reports range-resolved updates without rewriting `card.lock`.
- Preserved existing pinned-card outdated reporting while keeping `card update` pinned to immutable refs.

Verification completed:

```bash
bun test test/scenarios-card-catalog-collaboration-lifecycle.test.ts
bun test test/scenarios-dh-card-base-collaboration-bash.test.ts
bun test test/commands-card-outdated-fetch.test.ts test/commands-card-consumer.test.ts
bun test test/live-dh-card-base-catalog-collaboration.test.ts
DRWN_LIVE_DH_CARD_BASE=1 bun test test/live-dh-card-base-catalog-collaboration.test.ts
bun run typecheck
bun run verify:release --json
```

---

## Non-Goals

- Do not implement catalog-backed alias installation in this task.
- Do not add a `drwn follow` command.
- Do not mutate public GitHub repositories.
- Do not publish to the Curation Labs central catalog in automated tests.
- Do not rely on a user's existing GitHub auth.
- Do not add a registry service.
- Do not change catalog schema v1 unless a test exposes an unavoidable schema gap.

---

## Execution Notes

- Use `@remyjkim` as the test catalog scope because the remote card name is `@remyjkim/dh-card-base`.
- Use `dh-card-base` as the catalog entry name.
- For immutable catalog entry publication, expected URL is:

  ```text
  git+https://github.com/remyjkim/dh-card-base.git#v0.1.0
  ```

- For deterministic range-update tests, expected range ref is:

  ```text
  git+file://$CARD_REMOTE@^0.1.0
  ```

- If the live remote later adds a real `v0.1.1` or newer compatible tag, keep deterministic synthetic-tag tests anyway. Live tests should continue to pin `v0.1.0` unless the task is intentionally updated.
