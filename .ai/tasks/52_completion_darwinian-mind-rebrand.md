# ABOUTME: Completion summary for Task 52, the darwinian-harness to darwinian-mind naming cutover.
# ABOUTME: Records shipped scope, verification evidence, residual intentional old-name matches, and deferred terminal cutovers.

# Task 52 Completion: Darwinian Mind Rebrand

**Status**: Completed
**Completed**: 2026-06-26
**Branch**: `remyjkim/rebrand-darwinian-mind-task-52`
**Base synced from**: `origin/main` at `38e43a7` (`Merge pull request #18 from remyjkim/task-55-session-signal-materialization`)
**References**: [.ai/tasks/52_darwinian-mind-rebrand-implementation-plan.md on planning branch, .ai/analyses/72_darwinian-mind-rebrand-strategy.md, package.json, registry/config.json, scripts/verify-release-readiness.ts, test/package-readiness.test.ts, test/docs-readiness.test.ts, test/cli-install-mode.test.ts]

## Summary

Task 52 landed as a naming-only hard cut from `darwinian-harness` / `Darwinian Harness` to `darwinian-mind` / `Darwinian Mind`. The primary command remains `drwn`; the removed secondary alias `drwn-hx` is replaced by `dminds`. The reusable card unit is now "Mind Card"; public `dh-*` card/catalog slugs are now `dm-*`.

No command semantics, store paths, schema fields, config field names, or `.agents/drwn` paths were changed. Generic "harness" language remains where it describes the local harness layer, meta-harness architecture, harness engineering, or command names such as `install-harness-project`.

## What Shipped

### Package and CLI identity

- `package.json.name` is now `darwinian-mind`.
- `package.json.bin` is now:

  ```json
  {
    "drwn": "cli/index.ts",
    "dminds": "cli/index.ts"
  }
  ```

- `drwn-hx` is removed and pinned by negative assertions in package/install-mode tests.
- Package repository, homepage, bugs URL, release workflow npm package references, and release-readiness metadata checks now point to `remyjkim/darwinian-mind`.
- `bun.lock` root workspace name now matches `darwinian-mind`.
- `scripts/verify-release-readiness.ts` validates the renamed package.

### Hook policy subpath

- Generated and user-authored hook policy imports now use:

  ```ts
  import { defineToolPolicy } from "darwinian-mind/hook-policy";
  ```

- Composer bundling resolves `darwinian-mind/hook-policy`.
- Tests cover the export, generated Mastra composer, bundled Claude/Codex composers, and full `drwn write` hook materialization.

### Mind Card terminology

- User-facing "Harness Card" / "harness card" / `harness-card` copy changed to "Mind Card" / "mind card" / `mind-card`.
- CLI comments, ABOUTME headers, docs, tests, hook signal copy, card-source templates, and card authoring surfaces were updated.
- Generic `harness` remains in architecture and state-management phrases where it is intentionally not the product/card-unit name.

### `dh-*` to `dm-*` slugs

- Default community catalog URL changed from:

  ```text
  https://github.com/curation-labs/dh-cards-catalog-v1.git
  ```

  to:

  ```text
  https://github.com/curation-labs/dm-cards-catalog-v1.git
  ```

- Test fixtures and scenario files moved from `dh-card-base` naming to `dm-card-base`.
- Public sample card/catalog expectations now use:
  - `@remyjkim/dm-card-base`
  - `https://github.com/remyjkim/dm-card-base.git`
  - `https://github.com/curation-labs/dm-cards-catalog-v1.git`

### Docs and assets

- README, CLI quick reference, maintainer docs, release docs, Homebrew checklist, Docusaurus docs, and Astro docs were rebranded.
- Docusaurus package/config/docs now use `darwinian-mind` while preserving `docs.darwiniantools.com`.
- Deprecated Astro `site:` literal changed from `https://thedarwinianharness.com` to `https://darwinianminds.com`.
- Logo/hero assets were renamed:
  - `docs/assets/darwinian-harness-logo.png` -> `docs/assets/darwinian-mind-logo.png`
  - `docs/assets/the-darwinian-harness.png` -> `docs/assets/the-darwinian-mind.png`
  - `docs-docusaurus/static/img/darwinian-harness-logo.png` -> `docs-docusaurus/static/img/darwinian-mind-logo.png`
- `lychee.toml` GitHub repo exclusion was updated to `remyjkim/darwinian-mind`.

### Skills submodule content

The checked-out submodule content under `darwinian-harness-skills/` was rebranded in place, without changing `.gitmodules` or the submodule directory path.

Changed inside the submodule:

- Package/plugin/bundle identity:
  - `darwinian-harness-skills` -> `darwinian-mind-skills`
  - `Darwinian Harness Skills` -> `Darwinian Mind Skills`
  - Repository/homepage fields now point to `remyjkim/darwinian-mind-skills`.
- Card-unit skill IDs and directories:
  - `apply-harness-card` -> `apply-mind-card`
  - `author-harness-card` -> `author-mind-card`
  - `share-harness-card` -> `share-mind-card`
- The bundled `cards/harness-skills` card includes the renamed skill IDs.
- `recommend-harness`, `install-harness-project`, `inspect-harness`, `materialize-harness`, `manage-harness-library`, `repair-harness`, `support-harness`, and `cards/harness-skills/` were intentionally preserved because the task plan treated those as generic harness concepts or soft-open keepers.

## Test and Verification Evidence

### TDD red/green anchor

Naming tests were flipped before implementation. The first targeted run failed as expected on old package metadata, old release workflow package install, old logo path, old docs identity, and the missing `darwinian-mind/hook-policy` subpath. Implementation then moved those tests green.

### Focused suite

```bash
bun test \
  test/package-readiness.test.ts \
  test/cli-install-mode.test.ts \
  test/core-hook-policy-export.test.ts \
  test/docs-readiness.test.ts \
  test/core-hook-bundle-composer.test.ts \
  test/core-hook-emit-mastra.test.ts \
  test/cli-hook-write-e2e.test.ts \
  test/commands-catalog-validate.test.ts \
  test/core-catalog-validation.test.ts \
  test/core-trusted-sources.test.ts \
  test/scenarios-card-catalog-collaboration-lifecycle.test.ts \
  test/scenarios-dm-card-base-collaboration-bash.test.ts
```

Result: **33 pass / 0 fail**.

This covered package metadata, docs readiness, hook-policy export/bundling, CLI hook E2E, catalog validation, trusted sources, team catalog lifecycle, and the real Bash CLI workflow for `dm-card-base`.

### Full suite

```bash
bun test
```

Result: **891 pass / 1 skip / 0 fail** across 163 files.

The skipped test is the env-gated live GitHub smoke:

```text
publishes and consumes the live dm-card-base GitHub repo through a catalog
```

It remains disabled unless `DRWN_LIVE_DM_CARD_BASE=1` is set.

### Typecheck

```bash
bun run typecheck
```

Result: **pass** (`tsc --noEmit`).

### Release-readiness gate

```bash
bun run verify:release --json
```

Final result:

```json
{
  "ok": true,
  "checks": [
    { "name": "bun test", "ok": true },
    { "name": "typecheck", "ok": true },
    { "name": "hardcoded path scan", "ok": true },
    { "name": "package metadata", "ok": true },
    { "name": "documentation presence", "ok": true },
    {
      "name": "schema package coupling",
      "ok": true,
      "details": "drwn-catalog-schema@^0.1.0 resolves to 0.1.0"
    },
    { "name": "package contents", "ok": true }
  ],
  "warnings": []
}
```

One earlier `verify:release --json` run hit a non-reproducible failure in `auth CLI E2E > whoami env-token path bypasses credentials and maps invalid sessions` during the embedded `bun test` step. The isolated file passed immediately afterward, and two later release-readiness runs passed cleanly. No code change was required.

### Package dry run

```bash
npm pack --dry-run --json
```

Final summary:

```json
{
  "id": "darwinian-mind@0.2.2",
  "filename": "darwinian-mind-0.2.2.tgz",
  "entryCount": 236,
  "hasMindLogo": true,
  "hasOldLogo": false,
  "hasTests": false
}
```

### Packed-install CLI smoke

Used a temporary npm prefix and a local tarball from `npm pack`.

Verified:

- `drwn --version` prints `0.2.2`.
- `dminds --help` runs and prints the normal CLI help.
- `drwn-hx` is not installed.

### Direct CLI smoke

```bash
bun run cli/index.ts --help
bun run cli/index.ts --version
bun run cli/index.ts status --json
```

All passed.

### Docs builds

```bash
bun run docs:build
cd docs-astro && bun run build
```

Both passed. Astro generated the renamed `/docs/10-mind-cards/` route.

`lychee` was not installed locally, so the exact local link-check command could not be run. Docusaurus internal-link validation passed through the build, and `lychee.toml` was updated for the new GitHub repo path.

### Submodule validation

Inside `darwinian-harness-skills/`:

```bash
npm run sync:cards
npm run validate:skills
```

Result: **pass** (`All skills valid (13 found)`).

## Residual Old-Name Scan

Final content scan for old identity strings showed only intentional matches:

- `darwinian-harness-services` analyzer service URLs in docs. These are live service endpoints and were intentionally preserved.
- `drwn-hx` appears only in negative tests asserting the alias is gone.
- Historical `.ai` filename/link references such as `32_harness-cards-vs-flox-and-conda.md`. Historical filenames were intentionally not rewritten.
- The checked-out submodule path remains `darwinian-harness-skills/` until the external submodule repo/path cutover happens.

Representative scan command:

```bash
rg -n "darwinian-harness|Darwinian Harness|drwn-hx|dh-card-base|dh-cards-catalog|Harness Card|harness card|harness-card|thedarwinianharness" \
  --glob '!node_modules/**' \
  --glob '!darwinian-harness-skills/node_modules/**' \
  --glob '!dist/**' \
  --glob '!build/**' \
  --glob '!*.lockb' .
```

## Scope Boundaries Honored

- No behavior change was made to card resolution, materialization, store layout, command names, schema fields, or `.agents/drwn` paths.
- `drwn` remains the primary command.
- `darwiniantools.com`, `docs.darwiniantools.com`, and the docs Pages identity were preserved.
- Generic `harness`, `meta-harness`, and `harness engineering` terminology was preserved where it is not the product/card-unit name.
- `darwinian-harness-services` URLs were preserved because they are current deployed analyzer service endpoints.
- No new dependencies were introduced.

## Deferred Terminal Cutovers

These remain external/operator steps and were not performed in this implementation pass:

1. Rename GitHub repo `remyjkim/darwinian-harness` -> `remyjkim/darwinian-mind`.
2. Rename GitHub submodule repo `remyjkim/darwinian-harness-skills` -> `remyjkim/darwinian-mind-skills`.
3. Update `.gitmodules` path and URL, move the submodule directory, and verify a clean clone/submodule init.
4. Re-point local `origin` to the renamed main repo.
5. Publish `darwinian-mind` to npm.
6. Deprecate `darwinian-harness` on npm after the fresh package is available.
7. Rename the local checkout directory from `darwinian-harness/` to `darwinian-mind/`.
8. DNS/operator work for `darwinianminds.com`, if desired.

The new GitHub remotes did not exist when checked:

```bash
git ls-remote https://github.com/remyjkim/darwinian-mind.git HEAD
git ls-remote https://github.com/remyjkim/darwinian-mind-skills.git HEAD
```

Both returned repository-not-found errors, confirming that `.gitmodules` and remote URL cutovers were not yet safe to encode in-tree.

## Commit Grouping Plan

The implementation is ready to commit in logical groups:

1. Submodule content: `darwinian-mind-skills` identity and `*-mind-card` skill IDs.
2. Package/CLI/release/core identity: package metadata, `dminds`, release gate, hook-policy subpath, default catalog URL.
3. Tests/fixtures: renamed package expectations, `dm-card-base` fixtures/scenarios, Bash CLI workflow, hook import tests.
4. Docs/assets: README, maintainer docs, Docusaurus/Astro docs, renamed images, link-check config.
5. Core `.ai` docs and this completion summary.

## Acceptance Status

| Criterion | Status |
| --- | --- |
| Package name is `darwinian-mind` | Done |
| Binaries are `drwn` and `dminds`; `drwn-hx` removed | Done |
| Hook policy export path is `darwinian-mind/hook-policy` | Done |
| Mind Card terminology replaces Harness Card terminology | Done |
| Default community catalog uses `dm-cards-catalog-v1` | Done |
| `dm-card-base` fixtures and Bash/E2E workflows pass | Done |
| README/docs/assets rebranded | Done |
| Docusaurus and Astro docs build | Done |
| Skills submodule content rebranded | Done |
| `.gitmodules` path/URL cutover | Deferred terminal cutover |
| GitHub repo rename | Deferred terminal cutover |
| npm publish/deprecate | Deferred terminal cutover |
| Full suite/typecheck/release gate/package dry run | Done |
