# Task 11 Completion: Astro Docs Cards Alignment And Deployment

**Date:** May 21, 2026

**Task:** `.ai/tasks/11_astro-docs-implementation-plan.md`

**Status:** Completed for the cards-era documentation update and deployment pass

## Scope

Task 11 originally created the public Astro documentation site. This completion record covers the later cards-era update that brought the public docs back into alignment with the implemented Harness Cards v1.1 CLI, then deployed the site to Cloudflare Pages production.

This pass covered:

- adding public documentation for Harness Cards
- adding public documentation for the cards-era store and migration path
- updating the existing docs pages to remove pre-cards command assumptions
- aligning the knowledge docs with implemented commands and paths
- adding docs drift tests for both `.ai/knowledges` and `docs-astro`
- building and deploying the Astro docs site to Cloudflare Pages

## What Was Implemented

### 1. Cards-era public docs

Two public docs pages were added:

- `docs-astro/src/content/docs/10-harness-cards.md`
- `docs-astro/src/content/docs/11-store-and-migration.md`

The Harness Cards page documents:

- authoring with `bgng card new`
- publishing immutable local-store versions with `bgng card publish`
- inspecting cards with `card list`, `card show`, `card diff`, and `card deprecate`
- project consumption through `bgng apply`, `bgng card apply`, `add`, `pin`, `remove`, `detach`, `update`, `outdated`, and `status`
- `file:` refs for local development
- how cards interact with project config, lockfiles, and writes

The store and migration page documents:

- the `~/.agents/bgng` cards-era store layout
- `store.json`, `machine.json`, `cards/`, `sources/`, `skills/`, `mcp-servers/`, `generated/`, `cache/`, and `global-write-record.json`
- pre-cards paths and explicit migration through `bgng store migrate`
- migration cleanup through `--cleanup-legacy-orphans`
- project and machine write-record locations

### 2. Existing docs page alignment

The existing docs pages were updated to match the implemented cards-era behavior:

- `01-getting-started.md` now introduces store migration, `bgng extensions add`, and card application.
- `02-how-apply-works.md` now explains machine scope, project scope, card lock resolution, write records, and drift checks.
- `03-cli-reference.md` now includes the implemented `card`, `store`, `apply`, `update`, `write`, and diagnostics surfaces.
- `04-mcp-registry.md` now describes exploded cards-era MCP server files.
- `05-skill-library.md` now describes `~/.agents/bgng/skills` and legacy package-backed bundles.
- `06-extensions.md` now uses `bgng extensions add` instead of the removed `bgng add extension`.
- `07-per-project-config.md` now documents `cards`, `card.lock`, and project write records.
- `08-diagnostics.md` now covers cards, store, write records, `--explain`, and `--why`.
- `09-harness-engineering.md` now references the cards-era store and card locks as part of the harness model.

### 3. Knowledge docs alignment

The internal knowledge docs were updated in parallel:

- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `.ai/knowledges/03_npm-skill-bundles-guide.md`
- `.ai/knowledges/04_homebrew-release-checklist.md`

The CLI usage guide now reflects:

- `~/.agents/bgng/machine.json`
- card authoring, publishing, inspection, and project consumption commands
- `bgng store status` and `bgng store migrate`
- `bgng write --force`
- project and machine write-record locations
- `status --explain` and `status --why`
- diagnostics coverage for cards, store, and write records

The package-bundle guide now reflects the cards-era bundle cache at `~/.agents/bgng/skills`, while still documenting the legacy `~/.agents/packages/skills` path before migration.

The Homebrew checklist now includes smoke checks for:

- `bgng store status --json`
- `bgng card list --json`
- `bgng status --explain`

### 4. Docs drift guardrails

`test/docs-readiness.test.ts` was expanded so docs drift is tested automatically.

The guardrails now assert that:

- `.ai/knowledges` mention cards-era commands and paths
- `docs-astro` mentions `bgng card`, `bgng store`, `bgng apply`, and `bgng extensions add`
- stale public docs wording such as `bgng add extension` does not return
- store and migration docs remain discoverable from the public docs corpus

## Deployment Outcome

The docs were deployed to the existing Cloudflare Pages project:

- Project: `beginning-harness-docs`
- Production branch: `main`
- Production deployment: `https://fb48af1b.beginning-harness-docs.pages.dev`
- Default domain: `https://beginning-harness-docs.pages.dev`
- Custom domain: `https://thebeginningharness.com`

HTTP checks returned `200` for:

- `https://beginning-harness-docs.pages.dev/docs/10-harness-cards/`
- `https://thebeginningharness.com/docs/10-harness-cards/`
- the production hash deployment URL

Cloudflare reported the production deployment on branch `main` for deployment `fb48af1b...`.

## Verification Performed

### Automated tests

The full project test suite passed after the docs update:

```bash
bun test
```

Result:

```text
319 pass, 0 fail, 1257 expect() calls
```

### Type checking

```bash
bun run typecheck
```

Result: passed.

### Docs build

```bash
cd docs-astro && bun run build
```

Result: passed, with 13 pages generated and no build errors.

### Release readiness

```bash
bun run verify:release
```

Result: passed. The release verification covered tests, type checking, hardcoded path scan, package metadata, documentation presence, and package contents.

### Formatting hygiene

```bash
git diff --check
```

Result: passed for the touched docs and test files.

## Deferred Or Residual Risk

- No new custom visual design pass was performed for docs-astro; this was a content alignment and deployment pass.
- No browser-based clickthrough audit was run after deployment beyond build success and HTTP checks.
- The public docs intentionally document implemented local-store behavior. Remote card registry fetching and bundle intersection resolution remain noted as not active command behavior yet.

## Important Files

- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `.ai/knowledges/03_npm-skill-bundles-guide.md`
- `.ai/knowledges/04_homebrew-release-checklist.md`
- `docs-astro/src/content/docs/01-getting-started.md`
- `docs-astro/src/content/docs/02-how-apply-works.md`
- `docs-astro/src/content/docs/03-cli-reference.md`
- `docs-astro/src/content/docs/04-mcp-registry.md`
- `docs-astro/src/content/docs/05-skill-library.md`
- `docs-astro/src/content/docs/06-extensions.md`
- `docs-astro/src/content/docs/07-per-project-config.md`
- `docs-astro/src/content/docs/08-diagnostics.md`
- `docs-astro/src/content/docs/09-harness-engineering.md`
- `docs-astro/src/content/docs/10-harness-cards.md`
- `docs-astro/src/content/docs/11-store-and-migration.md`
- `test/docs-readiness.test.ts`

