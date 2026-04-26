# NPM Skills Package Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add package-backed skill bundle support to `beginning-agents` so `bgng` can ingest npm-distributed extension skill bundles, keep them under `~/.agents`, curate them explicitly, and sync them downstream without changing the existing built-in first-party skill model.

**Architecture:** `beginning-agents` remains the control plane and default first-party skill source. Package-backed skills are extension inputs only. `bgng` ingests them via `npm pack` plus extraction into `~/.agents/packages/skills/...`, validates mandatory `bundle.json`, exposes them in the skill inventory, and keeps curation/sync centralized and explicit.

**Tech Stack:** Bun, TypeScript, Clipanion, filesystem-backed state, npm package/tarball workflows, existing `~/.agents` curated-layer model.

---

## Evidence Base

This plan is grounded in the following investigation outputs:

- `.ai/analyses/07_npm-skills-package-reference-matrix.md`
- `.ai/analyses/08_npm-skills-package-tarball-observations.md`
- `.ai/analyses/09_npm-skills-package-contract-recommendation.md`
- `.ai/analyses/10_npm-skills-package-spike-results.md`

Those investigation steps confirmed:

1. `npm pack` is the correct ingestion primitive for package-backed skill bundles
2. local-folder `npm pack` runs lifecycle scripts unless `--ignore-scripts` is used
3. tarballs normalize under a top-level `package/` directory and require extraction normalization
4. `bundle.json` should remain mandatory
5. the strongest analogies are content/config bundles and template/content shippers, not heavy runtime plugin packages

The following are still intentionally provisional and should be treated as validation targets rather than settled truths:

1. whether globally unique skill names remain acceptable long-term
2. whether update/remove lifecycle is ergonomically worth the extra complexity
3. how broad third-party public-bundle support should become after v1

## Implementation Strategy

The implementation should lock these decisions before any code is written:

1. **Built-in first-party skills stay repo-native**
   - `skills/shared`, `skills/claude-only`, `skills/codex-only`, and `skills/experimental` remain first-class.
   - Package support is additive, not a replacement.

2. **Package-backed skills are extension sources**
   - They are fetched into managed local state under:
   - `~/.agents/packages/skills/<package-name>/<version>/...`

3. **Use `npm pack`, not `npm install`**
   - `npm install` pulls in lifecycle scripts and `node_modules` behavior that are unnecessary and risky for content bundles.
   - `npm pack <spec> --ignore-scripts --json --pack-destination <tmp>` gives a tarball that can be extracted as inert content.
   - The local-folder spike specifically confirmed that `prepack` runs unless `--ignore-scripts` is provided.

4. **Filesystem is the source registry**
   - Do not add a JSON database for installed packages in v1.
   - Infer installed bundles from the package cache layout and a `current` symlink.

5. **`bundle.json` is mandatory**
   - Package-backed bundles without `bundle.json` are rejected.
   - Validation must happen before they are installed into managed state.

6. **Keep curation explicit**
   - Adding a package makes skills available, not curated.
   - `bgng skills curate <name>` remains the moment when a skill becomes exposed in `~/.agents/skills`.

7. **Keep skill names globally unique in v1**
   - To preserve the current simple `bgng skills curate <name>` UX, reject package bundles whose skill names collide with built-in skills or already-installed package-backed skills.
   - Do not introduce source-qualified curation syntax in v1.

8. **Downstream sync remains unchanged in shape**
   - Once curated, package-backed skills behave like repo-native skills.
   - `bgng skills sync` should not care whether the curated symlink target came from the repo or a package cache.

9. **Design v1 for built-in, first-party extension, and trusted third-party bundles**
   - Do not design v1 as if arbitrary public npm packages are fully supported by default.
   - The reference corpus and spike support a content-first extension-bundle model, not an unrestricted public-package ingestion model.

## Phased Delivery Strategy

This feature should be implemented as a staged validation project, not a single all-at-once expansion.

### Phase 1: Viability Slice

Goal:

- prove that package-backed skill bundles can be ingested, validated, cached, and inspected safely

Included:

- bundle schema
- path helpers and types
- package cache layout
- `npm pack` ingestion
- package-backed source registry via filesystem
- `bgng skills packages add`
- `bgng skills packages list`
- `bgng skills packages show`
- source-aware `bgng skills list`

Excluded:

- curation of package-backed skills
- update/remove lifecycle
- downstream lifecycle edge-case handling

Success criteria:

- local fixture bundles can be packed and ingested
- installed bundles are inspectable via CLI
- built-in repo-native skills continue to work unchanged

This phase is the validated minimum slice and should be treated as the primary viability gate.

### Phase 2: Curation Validation

Goal:

- prove that package-backed skills can participate in the existing curated-layer model without changing the downstream sync shape

Included:

- `bgng skills curate <name>` works for package-backed skills
- `bgng skills uncurate <name>` works for package-backed skills
- `bgng skills sync` handles curated package-backed skills exactly like repo-native curated skills

Excluded:

- update/remove lifecycle for package sources

Success criteria:

- package-backed curated skills sync into downstream tool dirs successfully
- downstream tool symlinks remain source-agnostic

### Phase 3: Lifecycle Expansion

Goal:

- add update/remove only after the first two phases are proven and ergonomically acceptable

Included:

- `bgng skills packages update`
- `bgng skills packages remove`
- stale/renamed/removed bundle skill handling
- curated-dependency safety checks during removal

Success criteria:

- update/remove flows are predictable
- curation safety is preserved
- lifecycle complexity is justified by real value

This phase is explicitly not required for the first successful implementation of package-backed skills support.

## Target Files To Modify Or Add

### Modify

- `cli/index.ts`
- `cli/core/types.ts`
- `cli/core/paths.ts`
- `cli/core/skills.ts`
- `cli/core/output.ts`
- `test/helpers.ts`
- `README.md`
- `docs/maintainers/README.md`
- `docs/maintainers/publishing.md` only if publishing guidance needs a package-bundle note

### Create

- `cli/core/skill-packages.ts`
- `cli/commands/skills/packages/add.ts`
- `cli/commands/skills/packages/list.ts`
- `cli/commands/skills/packages/show.ts`
- `test/core-skill-packages.test.ts`
- `test/commands-skills-packages.test.ts`

### Deferred to later phase unless Phase 1 and Phase 2 validate cleanly

- `cli/commands/skills/packages/update.ts`
- `cli/commands/skills/packages/remove.ts`
- additional tests for update/remove flows

## Package Cache Layout

Use this exact managed layout:

```text
~/.agents/packages/skills/<package-name>/
  current -> <version>
  <version>/
    package.json
    bundle.json
    skills/
      shared/
      claude-only/
      codex-only/
      experimental/
    README.md
    LICENSE
```

Notes:

- `<package-name>` may contain `/` for scopes, and that is acceptable as nested directories under `~/.agents/packages/skills`.
- After extraction from the npm tarball, normalize the internal `package/` directory away so the version directory is the bundle root.

## Bundle Validation Rules

Reject a package-backed bundle unless all are true:

1. `bundle.json` exists at bundle root
2. `bundle.json.schemaVersion === 1`
3. `bundle.json.bundleName` matches the installed package name
4. `bundle.json.version` matches the installed package version
5. every skill entry has:
   - `name`
   - `scope`
   - `path`
6. every `path` exists and is inside the bundle root
7. every listed skill directory contains `SKILL.md`
8. every skill name passes the same validation already used for repo-native skills
9. no listed skill name collides with:
   - built-in repo-native skills
   - any other installed package-backed skill

## Test Strategy

This implementation must follow TDD and keep tests local/offline.

### Testing principles

1. Use local temporary bundle fixtures, not the public npm registry.
2. Exercise the real `npm pack --ignore-scripts` path against a local temp package directory so the production code path is as close as possible to reality.
3. Keep bundle validation in a reusable core module so command tests do not need to duplicate filesystem assertions.
4. Optimize tests for content-first bundle shapes, not runtime-plugin package shapes.

### Recommended fixture approach

In tests:

1. create a temp folder that contains a fake package-backed bundle with:
   - `package.json`
   - `bundle.json`
   - `skills/...`
2. call the production add/install path with the local directory as the npm package spec
3. let production code run `npm pack --ignore-scripts <local-dir>` against that fixture

This avoids registry/network dependency while still validating the `npm pack` ingestion design.

## Task 1: Extend Shared Types And Path Helpers

**Files:**
- Modify: `cli/core/types.ts`
- Modify: `cli/core/paths.ts`
- Test: `test/core-paths.test.ts`

**Step 1: Write failing tests for package path helpers**

Add tests covering:

- resolving the package cache root under `~/.agents/packages/skills`
- resolving a package root for `@scope/pkg`
- resolving a version directory
- resolving the `current` symlink path

**Step 2: Run targeted test**

Run:

```bash
bun test test/core-paths.test.ts
```

Expected:

- new package-path tests fail

**Step 3: Add new shared types**

Add types for:

- `SkillSourceType`
- `BundleSkillEntry`
- `BundleManifest`
- `InstalledSkillBundle`
- source-aware inventory items

**Step 4: Add package path helpers**

Add functions such as:

- `resolveSkillPackagesRoot(agentsDir)`
- `resolveSkillPackageRoot(agentsDir, packageName)`
- `resolveSkillPackageVersionRoot(agentsDir, packageName, version)`
- `resolveSkillPackageCurrentLink(agentsDir, packageName)`

**Step 5: Re-run targeted test**

Run:

```bash
bun test test/core-paths.test.ts
```

Expected:

- all path tests pass

## Task 2: Build The Core Bundle Validation And Local Package Source Layer

**Files:**
- Create: `cli/core/skill-packages.ts`
- Modify: `cli/core/fs.ts` if small helpers are needed
- Test: `test/core-skill-packages.test.ts`

**Step 1: Write failing core tests**

Add tests for:

1. loading a valid `bundle.json`
2. rejecting a bundle with missing manifest
3. rejecting invalid skill paths
4. rejecting missing `SKILL.md`
5. rejecting colliding skill names
6. listing installed bundles from the filesystem layout
7. resolving the active version from `current`

**Step 2: Run targeted test**

Run:

```bash
bun test test/core-skill-packages.test.ts
```

Expected:

- all new tests fail

**Step 3: Implement bundle manifest loading and validation**

Implement:

- manifest parsing
- path normalization
- skill-entry validation
- collision validation against a provided existing-name set

**Step 4: Implement installed-bundle discovery**

Use the filesystem layout plus `current` symlink inference instead of a JSON registry file.

Implement functions like:

- `loadBundleManifest(bundleRoot)`
- `validateBundleManifest(bundleRoot, manifest, existingSkillNames)`
- `listInstalledSkillBundles(agentsDir)`
- `getInstalledSkillBundle(agentsDir, packageName)`

**Step 5: Re-run targeted test**

Run:

```bash
bun test test/core-skill-packages.test.ts
```

Expected:

- tests pass

## Task 3: Implement `npm pack` Ingestion Into Managed Cache

**Files:**
- Modify: `cli/core/skill-packages.ts`
- Test: `test/core-skill-packages.test.ts`
- Possibly modify: `test/helpers.ts`

**Step 1: Write failing tests for add/install flow**

Add tests covering:

1. ingesting a local fixture package spec via `npm pack`
2. normalizing extracted tarball contents into the version root
3. creating/updating the `current` symlink
4. preserving prior versions on disk
5. rejecting invalid bundles before making them current

**Step 2: Run targeted test**

Run:

```bash
bun test test/core-skill-packages.test.ts
```

Expected:

- ingestion tests fail

**Step 3: Implement package ingestion**

Implement a production path roughly shaped as:

1. create temp directory
2. run:

```bash
npm pack <spec> --ignore-scripts --json --pack-destination <tmp>
```

3. read tarball metadata
4. extract tarball
5. normalize `package/` contents into the target version directory
6. validate manifest and skill entries
7. atomically create or update `current`

Do not use `npm install`.

**Step 4: Re-run targeted test**

Run:

```bash
bun test test/core-skill-packages.test.ts
```

Expected:

- ingestion tests pass

## Phase 1

## Task 4: Make The Skill Inventory Source-Aware

**Files:**
- Modify: `cli/core/skills.ts`
- Modify: `cli/core/types.ts`
- Test: `test/core-skills.test.ts`
- Test: `test/commands-skills-list.test.ts`

**Step 1: Write failing tests**

Add tests covering:

1. `buildSkillInventory` includes package-backed skills
2. source metadata is attached to inventory items
3. package-backed skills can show curated state
4. collisions are not allowed when package sources are installed

**Step 2: Run targeted tests**

Run:

```bash
bun test test/core-skills.test.ts test/commands-skills-list.test.ts
```

Expected:

- new source-aware assertions fail

**Step 3: Extend inventory building**

Update `cli/core/skills.ts` so that:

- built-in repo-native skills still load first
- installed package-backed bundle skills are added to the available inventory
- each item includes source metadata such as:
  - `sourceType`
  - `sourceId`
  - `sourceVersion`

**Step 4: Keep curation semantics unchanged**

Ensure `curateSkill` works with package-backed skills by name, relying on the v1 uniqueness rule to avoid ambiguity.

**Step 5: Re-run targeted tests**

Run:

```bash
bun test test/core-skills.test.ts test/commands-skills-list.test.ts
```

Expected:

- tests pass

## Task 5: Add Package Commands To `bgng`

**Files:**
- Create: `cli/commands/skills/packages/add.ts`
- Create: `cli/commands/skills/packages/list.ts`
- Create: `cli/commands/skills/packages/show.ts`
- Modify: `cli/index.ts`
- Test: `test/commands-skills-packages.test.ts`

**Step 1: Write failing command tests**

Add tests covering:

1. `bgng skills packages add <spec>`
2. `bgng skills packages list`
3. `bgng skills packages show <spec>`
4. human-readable output
5. `--json` output
6. failure for invalid bundles
7. failure for collisions

**Step 2: Run targeted test**

Run:

```bash
bun test test/commands-skills-packages.test.ts
```

Expected:

- tests fail because commands do not exist yet

**Step 3: Implement command classes**

Behavior:

- `add` installs/registers package-backed bundle source, but does not curate
- `list` shows installed bundles with current version and counts
- `show` prints manifest metadata and included skills

Register these commands in `cli/index.ts`.

**Step 4: Re-run targeted test**

Run:

```bash
bun test test/commands-skills-packages.test.ts
```

Expected:

- command tests pass

## Phase 2

## Task 6: Enable Package-Backed Curation And Downstream Sync

**Files:**
- Modify: `cli/core/skills.ts`
- Modify: `test/core-skills.test.ts`
- Modify: `test/commands-skills-mutate.test.ts`
- Modify: `test/scenarios-user-journeys.test.ts`

**Step 1: Write failing curation/sync tests**

Add tests covering:

1. `curateSkill` works for a package-backed skill by name
2. `uncurateSkill` removes a package-backed curated symlink
3. `syncSkills` installs downstream links from a package-backed curated source
4. package-backed curated skills appear correctly in scenario-level user journeys

**Step 2: Run targeted tests**

Run:

```bash
bun test test/core-skills.test.ts test/commands-skills-mutate.test.ts test/scenarios-user-journeys.test.ts
```

Expected:

- new package-backed curation assertions fail

**Step 3: Extend curation resolution**

Update `cli/core/skills.ts` so that:

- name lookup can resolve both repo-native and package-backed available skills
- curation remains limited to unique names
- package-backed curated symlinks point to the installed bundle skill directory

**Step 4: Verify downstream sync remains source-agnostic**

Ensure `syncSkills` needs no architectural change beyond working with curated symlinks that point into package-backed sources.

**Step 5: Re-run targeted tests**

Run:

```bash
bun test test/core-skills.test.ts test/commands-skills-mutate.test.ts test/scenarios-user-journeys.test.ts
```

Expected:

- tests pass

## Task 7: Extend User Journeys And Release-Readiness Coverage

**Files:**
- Create: `cli/commands/skills/packages/update.ts`
- Create: `cli/commands/skills/packages/remove.ts`
- Modify: `cli/index.ts`
- Modify: `cli/core/skill-packages.ts`
- Test: `test/commands-skills-packages.test.ts`
- Test: `test/core-skill-packages.test.ts`

**Step 1: Write failing tests**

Add tests covering:

1. updating to a newer version and repointing `current`
2. preserving old versions on disk
3. rejecting updates that introduce name collisions
4. remove refusing or warning when curated symlinks still depend on a bundle
5. remove succeeding for uncurated bundle sources

**Step 2: Run targeted tests**

Run:

```bash
bun test test/core-skill-packages.test.ts test/commands-skills-packages.test.ts
```

Expected:

- new lifecycle tests fail

**Step 3: Implement lifecycle methods and commands**

Implement:

- `updateInstalledSkillBundle(...)`
- `removeInstalledSkillBundle(...)`

Keep remove non-destructive by default:

- if curated skills still resolve into the bundle root, fail with a clear message

**Step 4: Re-run targeted tests**

Run:

```bash
bun test test/core-skill-packages.test.ts test/commands-skills-packages.test.ts
```

Expected:

- lifecycle tests pass

## Task 7: Extend User Journeys And Release-Readiness Coverage

**Files:**
- Modify: `test/scenarios-user-journeys.test.ts`
- Modify: `test/commands-output-contracts.test.ts`
- Modify: `test/docs-readiness.test.ts`
- Modify: `scripts/verify-release-readiness.ts` only if package-bundle docs need explicit checks

**Step 1: Write failing scenario tests**

Add scenarios for:

1. add package bundle → inspect → curate → sync
2. package-backed curated skill shows up in downstream tool state

**Step 2: Run targeted tests**

Run:

```bash
bun test test/scenarios-user-journeys.test.ts test/commands-output-contracts.test.ts
```

Expected:

- new journey assertions fail

**Step 3: Extend documentation/readiness checks**

Ensure tests cover:

- README mentioning package-backed skill extensions
- maintainer docs mentioning package-bundle ingestion flow

**Step 4: Re-run targeted tests**

Run:

```bash
bun test test/scenarios-user-journeys.test.ts test/commands-output-contracts.test.ts test/docs-readiness.test.ts
```

Expected:

- tests pass

## Task 8: Update Public And Maintainer Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/maintainers/README.md`
- Modify: `docs/maintainers/publishing.md` only if install/publish guidance needs extension-package notes

**Step 1: Update README**

Document:

- package-backed skills as optional extension sources
- the distinction between built-in first-party skills and extension bundles
- the new `bgng skills packages ...` commands

**Step 2: Update maintainer docs**

Document:

- bundle schema expectations
- the package cache layout under `~/.agents/packages/skills`
- why `npm pack` is used instead of `npm install`

**Step 3: Run docs/readiness tests**

Run:

```bash
bun test test/docs-readiness.test.ts
```

Expected:

- pass

## Phase 3

## Task 9: Add Update/Remove Lifecycle Support

**Files:**
- Create: `cli/commands/skills/packages/update.ts`
- Create: `cli/commands/skills/packages/remove.ts`
- Modify: `cli/index.ts`
- Modify: `cli/core/skill-packages.ts`
- Test: `test/commands-skills-packages.test.ts`
- Test: `test/core-skill-packages.test.ts`
- Test: `test/scenarios-user-journeys.test.ts`

**When to do this**

Only after Phase 1 and Phase 2 are complete and judged viable.

**Step 1: Write failing lifecycle tests**

Add tests covering:

1. updating to a newer version and repointing `current`
2. preserving old versions on disk
3. rejecting updates that introduce name collisions
4. remove refusing or warning when curated symlinks still depend on a bundle
5. remove succeeding for uncurated bundle sources

**Step 2: Run targeted tests**

Run:

```bash
bun test test/core-skill-packages.test.ts test/commands-skills-packages.test.ts test/scenarios-user-journeys.test.ts
```

Expected:

- lifecycle tests fail

**Step 3: Implement lifecycle methods and commands**

Implement:

- `updateInstalledSkillBundle(...)`
- `removeInstalledSkillBundle(...)`

Keep remove non-destructive by default:

- if curated skills still resolve into the bundle root, fail with a clear message

**Step 4: Re-run targeted tests**

Run:

```bash
bun test test/core-skill-packages.test.ts test/commands-skills-packages.test.ts test/scenarios-user-journeys.test.ts
```

Expected:

- lifecycle tests pass

## Final Verification

Run the full suite:

```bash
bun test
npx tsc --noEmit
bun run verify:release --json
```

Expected:

- `bun test`: all tests pass
- `npx tsc --noEmit`: clean
- `bun run verify:release --json`: all checks `ok: true`

## Commit Strategy

Recommended commit grouping:

1. `[feat:skills] add package-backed skill source core`
2. `[feat:cli] add bgng skills packages inspection commands`
3. `[feat:skills] enable curation and sync for package-backed skills`
4. `[test:skills] cover package bundle ingestion and curation`
5. `[doc:skills] document extension skill bundles`
6. `[feat:skills] add package lifecycle commands` only if Phase 3 is implemented

## Open Constraints To Preserve

1. Do not regress repo-native skill behavior.
2. Do not make package install imply curation.
3. Do not rely on npm global install paths as canonical source.
4. Do not introduce hidden install-time mutation.
5. Do not accept bundles without `bundle.json`.
6. Do not allow duplicate skill names in v1.
7. Do not treat update/remove lifecycle as required for viability.
8. Do not use plain `npm pack` for local bundle ingestion without `--ignore-scripts`.
