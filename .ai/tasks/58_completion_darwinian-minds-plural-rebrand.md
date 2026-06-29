# ABOUTME: Completion summary for Task 58, the darwinian-mind to darwinian-minds plural rebrand and repo rename.
# ABOUTME: Records shipped in-tree scope, verification evidence, residual intentional old-name matches, and deferred external cutovers.

# Task 58 Completion: Darwinian Minds Plural Rebrand

**Status**: Implemented in the working tree (uncommitted)
**Completed**: 2026-06-28
**Branch/commits**: None — worked directly on `main`, no branch/commit/worktree, per request.
**Predecessors**: Task 10, Task 28, Task 52 (singular `darwinian-mind` cutover)
**References**: [.ai/tasks/58_darwinian-minds-plural-rebrand-and-repo-rename-implementation-plan.md, package.json, .gitmodules, registry/config.json, scripts/verify-release-readiness.ts, test/package-readiness.test.ts, test/docs-readiness.test.ts]

## Summary

Task 58 completes the plural rebrand of the tooling to **"Darwinian Minds" / `darwinian-minds`**, finishing the singular→plural alignment that the `dminds` alias, the `darwinian-minds-skills` repo, and `darwinianminds.com` had already started. It is a naming-only change: no command semantics, store paths, schema fields, or `.agents/drwn` paths changed.

A pre-existing inconsistency was reconciled: the git remote was still `remyjkim/darwinian-harness` (two names behind), while Task 52 metadata pointed at a `remyjkim/darwinian-mind` repo that never existed. All references now target `remyjkim/darwinian-minds`. Per the ratified plan decisions, the **npm package name** moved to plural as well (it was never published, so there is no deprecation cost).

## What Shipped

### Package and CLI identity

- `package.json.name` is now `darwinian-minds`.
- `homepage`, `bugs.url`, and `repository.url` now point at `remyjkim/darwinian-minds`.
- `description` and `keywords` use the plural brand; `files[]` references `docs/assets/darwinian-minds-logo.png`.
- `scripts/verify-release-readiness.ts` name gate now requires `darwinian-minds`.
- `bun.lock`, `docs-astro/bun.lock`, `docs-docusaurus/bun.lock` workspace names aligned (`darwinian-minds`, `darwinian-minds-docs`). `bun install --frozen-lockfile` passes.

### Hook policy subpath (the load-bearing code coupling)

- The published subpath export is now `darwinian-minds/hook-policy`.
- Updated: `cli/core/card-source.ts` (esbuild `external` array + import), `cli/core/hook-generator/bundle-composer.ts` (import + the `onResolve` filter regex `/^darwinian-minds\/hook-policy$/`), `cli/core/hook-generator/emit-mastra-composer.ts`, `cli/core/hook-policy/index.ts` (ABOUTME).
- All generated-bundle and card-source tests assert the plural subpath.

### Repo-URL and brand sweep

- Lowercase identifier `darwinian-mind` → `darwinian-minds` (negative-lookahead so `darwinian-minds` is never doubled) and the capitalized brand `Darwinian Mind` → `Darwinian Minds` across: `README.md`, `INSTALL.md`, `CONTRIBUTING.md`, `docs/` (maintainers, cli-quickref, release-process), `docs-docusaurus/` (config + docs, excluding generated `build/`/`.docusaurus/`), `docs-astro/` (deprecated), `.ai/knowledges/`, `.github/workflows/release.yml`, `lychee.toml`, and a CSS comment.
- `docs-docusaurus/docusaurus.config.ts`: `projectName`, `editUrl`, footer/navbar GitHub links.

### Physical renames

- `docs/assets/darwinian-mind-logo.png` → `docs/assets/darwinian-minds-logo.png` (referenced by README + `package.json.files`).
- `docs-docusaurus/static/img/darwinian-mind-logo.png` → `…/darwinian-minds-logo.png`.
- `docs-docusaurus/docs/guides/use-darwinian-mind-skills.md` → `use-darwinian-minds-skills.md`.

### Submodule cutover (in-tree)

- Submodule path renamed `darwinian-harness-skills/` → `darwinian-minds-skills/` via `git mv`.
- `.gitmodules` section, `path`, and `url` canonicalized to `remyjkim/darwinian-minds-skills.git` (GitHub already auto-redirects the old URL). Submodule re-initialized; working tree intact.

### Canonical-name correction captured

- The canonical skills repo is `darwinian-minds-skills` (plural); its primary card is `@darwinian/mind-skills` (with `@darwinian/harness-skills` retained as a one-release compatibility card and `@darwinian/base-mind` as the persona layer). `INSTALL.md` documents this.

## Test and Verification Evidence

All runs under **bun on macOS**.

### TDD red/green anchor

Test assertions were flipped to the plural identity first. The first targeted run failed as expected on package metadata, release-workflow package install, the logo asset path, docs identity, and — most tellingly — a real module-resolution failure `Cannot find module 'darwinian-minds/hook-policy'`. Implementing the rename moved all of them green.

### Targeted suites (green)

```bash
bun test test/package-readiness.test.ts test/cli-install-mode.test.ts \
  test/core-hook-policy-export.test.ts test/core-hook-bundle-composer.test.ts \
  test/core-hook-emit-mastra.test.ts test/cli-hook-write-e2e.test.ts \
  test/commands-card-show-hooks.test.ts test/commands-doctor.test.ts \
  test/docs-readiness.test.ts test/homebrew-readiness.test.ts test/sync-mcp.test.ts
```

Result at the Task 58 boundary: **all green**.

### Behavior-preservation

Task 58 is naming-only; the full suite at its boundary matched the pre-change baseline (**926 pass / 1 skip / 0 fail**, 174 files). The cumulative final suite (after Task 59 work) is **972 pass / 1 skip / 0 fail** across 181 files and includes all Task 58 changes.

### Typecheck, release gate, lockfile

- `bun run typecheck` → clean (`tsc --noEmit`).
- `QUALITY_GATE_TEST_MODE=1 bun run verify:release --json` → `ok: true`, all checks pass, `warnings: []`.
- `bun install --frozen-lockfile` → passes despite the workspace-name change (bun checks the dependency graph, not the name).

### Residual old-name scan (intentional matches only)

```bash
grep -rIn "darwinian-mind\b" --exclude-dir={node_modules,.git,dist,darwinian-minds-skills} \
  --exclude='*.lock' . | grep -vE "darwinian-minds|/\.ai/tasks/|/\.ai/analyses/|/docs/plans/|/build/|/\.docusaurus/"
```

Only historical records remain: `docs/plans/2026-04-28-*` (dated design docs), `.ai/tasks/52_completion_*`, and `.ai/analyses/*`. These are evergreen historical records and were intentionally not rewritten. The `darwinian-minds-skills` submodule is a separate repo and is excluded.

## Scope Boundaries Honored

- No behavior change to card resolution, materialization, store layout, command names, schema fields, or `.agents/drwn` paths.
- `drwn` remains the primary command; `dminds` the secondary alias.
- `docs.darwiniantools.com` and the docs Pages identity preserved (deliberate `dm-`/domain keeps documented in the plan §9).
- The community catalog `dm-cards-catalog-v1` and `darwinian-harness-services` analyzer URLs were left unchanged (separate repos / live endpoints).

## Deferred External Cutovers (operator steps; not in-tree)

1. `gh repo rename darwinian-minds --repo remyjkim/darwinian-harness`.
2. `git remote set-url origin https://github.com/remyjkim/darwinian-minds.git`.
3. `mv` the local checkout `darwinian-harness/` → `darwinian-minds/`; update local `AGENTS_REPO_ROOT` and the sibling skills repo's hardcoded parent path.
4. `npm publish` the `darwinian-minds` package (first publish — no deprecation needed; nothing was ever published).
5. Optionally advance the embedded submodule pointer to the sibling `darwinian-minds-skills` `main` (currently pinned to the Task-52 branch).

GitHub redirects cover old clone URLs after the rename, so the in-tree references are safe to merge before the cutover.

## Acceptance Status

| Criterion | Status |
| --- | --- |
| Package name is `darwinian-minds` | Done |
| Repo-URL metadata points at `remyjkim/darwinian-minds` | Done |
| Hook policy export path is `darwinian-minds/hook-policy` | Done |
| Docs/brand prose + assets pluralized; files renamed | Done |
| `.gitmodules` path/url canonicalized; submodule re-initialized | Done |
| Lockfile workspace names aligned; frozen-lockfile passes | Done |
| Typecheck / release gate / residual-grep clean | Done |
| Full suite green (behavior-preserving) | Done |
| GitHub repo rename / remote / local dir mv / npm publish | Deferred external cutover |
