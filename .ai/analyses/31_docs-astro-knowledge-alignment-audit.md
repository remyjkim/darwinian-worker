# Docs-Astro And Knowledge Alignment Audit

**Date**: 2026-05-20
**Author**: Codex
**Status**: Final
**References**: [docs-astro/src/content/docs, .ai/knowledges, cli/index.ts, cli/commands, cli/core/store-paths.ts, cli/core/sync.ts, cli/core/skill-packages.ts, cli/core/migration.ts]

---

## Executive Summary

The docs are not fully aligned with the latest Harness Cards v1.1 implementation.

The public `docs-astro` content is the main problem. It still reflects the pre-cards model: `~/.agents/bgng/config.json` as the machine default file, `~/.agents/library/mcp-servers.json` as the active MCP library, `~/.agents/packages/skills` as the current skill-bundle cache, `bgng add extension`, and a CLI reference with no `card`, `store`, `apply`, `update`, `write --force`, `status --explain`, or `status --why` coverage. It builds successfully, but it is content-stale enough to mislead users.

`.ai/knowledges` is much closer. `01_agents-cli-usage-guide.md` and `02_per-project-config-guide.md` now capture the cards-era model in broad strokes, but `01` still has coverage gaps for store commands, drift recovery, `write --force`, and `status --why`; `03_npm-skill-bundles-guide.md` still presents pre-migration paths as current state.

Verdict counts across the requested scope:

| Area | Accurate | Partially Outdated | Significantly Outdated | Obsolete | Deprecated |
|---|---:|---:|---:|---:|---:|
| `docs-astro/src/content/docs` | 0 | 5 | 4 | 0 | 0 |
| `.ai/knowledges` | 4 | 2 | 0 | 0 | 0 |
| **Total** | **4** | **7** | **4** | **0** | **0** |

## Method

I audited source documentation only. Generated/vendor output was excluded: `docs-astro/node_modules`, `docs-astro/dist`, and `docs-astro/.astro`.

Evidence commands run:

```bash
rg --files .ai/rules .ai/knowledges docs-astro | sort
bun run bgng -- --help
bun run bgng -- card --help
bun run bgng -- store --help
bun run bgng -- extensions add --help
bun run bgng -- status --help
rg "bgng add extension|~/.agents/bgng/config.json|~/.agents/library|~/.agents/packages/skills|card.lock|write-record" docs-astro/src/content .ai/knowledges -n
rg "static override paths|Option\\." cli/commands -n
bun test test/docs-readiness.test.ts
cd docs-astro && bun run build
```

Security scan:

```bash
rg -n "(api[_-]?key|secret|token|password|passwd|BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9]|NPM_ORG_TOKEN=|_authToken=)" docs-astro/src/content .ai/knowledges --hidden
```

No hardcoded credential was found. `.ai/knowledges/05_npm-publishing-analysis-and-manual.md` intentionally discusses npm tokens and uses `${NPM_ORG_TOKEN}` plus a redacted `_authToken=...` placeholder.

## Implementation Baseline

The latest implementation exposes these cards-era surfaces:

- `bgng card new|publish|show|list|diff|deprecate|apply|add|pin|remove|detach|update|outdated|status`
- top-level aliases: `bgng apply`, `bgng update`
- `bgng store status`, `bgng store migrate`
- `bgng extensions add`, not `bgng add extension`
- `bgng write --force`
- `bgng status --explain`, `bgng status --why <category>:<name>`

Current cards-era paths are defined in `cli/core/store-paths.ts`:

- `~/.agents/bgng/store.json`
- `~/.agents/bgng/machine.json`
- `~/.agents/bgng/cards/`
- `~/.agents/bgng/sources/`
- `~/.agents/bgng/skills/`
- `~/.agents/bgng/mcp-servers/`
- `~/.agents/bgng/generated/`
- `~/.agents/bgng/global-write-record.json`

Project writes are scoped by `cli/core/sync.ts`: when `<project>/.agents/bgng/config.json` exists, `bgng write` materializes under the project root and records managed paths in `<project>/.agents/bgng/write-record.json`. Outside a configured project, it writes machine-scope state and uses `~/.agents/bgng/global-write-record.json`.

## Per-Document Verdicts

### Docs-Astro

| Doc | Verdict | Severity | Key Issues | Evidence |
|---|---|---:|---|---|
| `docs-astro/src/content/docs/01-getting-started.md` | PARTIALLY_OUTDATED | High | Project quickstart uses removed `bgng add extension parallel`; does not introduce cards/store migration. | Doc lines 80-86; `cli/commands/extensions/add.ts`; `cli/index.ts` registers `extensions add`, not `add extension`. |
| `docs-astro/src/content/docs/02-how-apply-works.md` | SIGNIFICANTLY_OUTDATED | High | Five-layer model points at pre-cards `~/.agents/library` and `~/.agents/bgng/config.json`; misses cards, lockfiles, write records, project-local materialization, and `write --force`; cleanup statement says stale skill symlinks are reported rather than describing write-record-backed cleanup. | Doc lines 8-35; `cli/core/store-paths.ts`; `cli/core/sync.ts`; `cli/commands/write.ts`. |
| `docs-astro/src/content/docs/03-cli-reference.md` | SIGNIFICANTLY_OUTDATED | High | Missing `card`, `store`, `apply`, `update`, `extensions add`, `write --force`, `status --explain`, `status --why`, and `library defaults remove`; includes removed `bgng add extension`. | Doc lines 18-24, 45-89; `cli/index.ts`; `bun run bgng -- card --help`; `bun run bgng -- store --help`. |
| `docs-astro/src/content/docs/04-mcp-registry.md` | SIGNIFICANTLY_OUTDATED | High | Active MCP library path is stale; machine defaults path is stale; does not explain cards/project overlay MCP sources. | Doc lines 17-31; `cli/core/store-paths.ts`; `cli/core/migration.ts`; `cli/core/mcp-library.ts`. |
| `docs-astro/src/content/docs/05-skill-library.md` | PARTIALLY_OUTDATED | Medium | Package-backed command flow is broadly right, but current storage path is stale and it does not distinguish cards-era store from legacy pre-migration cache. | Doc lines 36-65; `cli/core/skill-packages.ts`; `cli/core/store-paths.ts`. |
| `docs-astro/src/content/docs/06-extensions.md` | PARTIALLY_OUTDATED | High | Extension setup concepts are mostly right, but user-facing examples use removed `bgng add extension`; should use `bgng extensions add` and cover `--dry-run`, `--json`, `--skip-skills`. | Doc lines 57-67; `cli/commands/extensions/add.ts`. |
| `docs-astro/src/content/docs/07-per-project-config.md` | SIGNIFICANTLY_OUTDATED | High | Omits `cards`, `card.lock`, project-local generated files, project write-record, and the rule that machine defaults do not apply inside configured card projects. | Doc lines 23-65; `.ai/knowledges/02_per-project-config-guide.md`; `cli/core/card-lock.ts`; `cli/core/sync.ts`. |
| `docs-astro/src/content/docs/08-diagnostics.md` | PARTIALLY_OUTDATED | Medium | Doctor/safety model omits cards/store/write-record sections, `status --explain`, `status --why`, `write --force`, and explicit orphan cleanup through `store migrate --cleanup-legacy-orphans`. | Doc lines 17-37; `cli/core/diagnostics.ts`; `cli/commands/store/migrate.ts`; `cli/commands/status.ts`. |
| `docs-astro/src/content/docs/09-harness-engineering.md` | PARTIALLY_OUTDATED | Low | Conceptual framing is still usable, but the "where beginning-harness fits" terms should be updated to mention cards and write records rather than only the older library/default/project/apply model. External research claims were not audited in this pass. | Doc section "Where beginning-harness Fits"; current cards implementation under `cli/commands/card` and `cli/core/write-record.ts`. |

### Knowledge Docs

| Doc | Verdict | Severity | Key Issues | Evidence |
|---|---|---:|---|---|
| `.ai/knowledges/README.md` | ACCURATE | Low | Directory map matches current knowledge docs. | File inventory; links resolve. |
| `.ai/knowledges/01_agents-cli-usage-guide.md` | PARTIALLY_OUTDATED | Medium | Core command model is now cards-era, but it does not have a dedicated Store Commands section; `write` examples omit `--force`; status coverage omits `--explain` and `--why`; card coverage omits `list`, `detach`, and plain `outdated`; doctor coverage omits cards/store/write-record details. | Doc lines 120-257 and 600-636; `cli/commands/store`; `cli/commands/status.ts`; `cli/commands/write.ts`; `cli/commands/card`. |
| `.ai/knowledges/02_per-project-config-guide.md` | ACCURATE | Low | Aligns with current project discovery, cards array, lockfile, project-local materialization, and machine-default boundary. | `cli/core/project.ts`; `cli/core/sync.ts`; `cli/core/card-lock.ts`; `cli/core/card-project.ts`. |
| `.ai/knowledges/03_npm-skill-bundles-guide.md` | PARTIALLY_OUTDATED | Medium | Core bundle contract remains right, but local storage and "default" paths are pre-cards: it presents `~/.agents/packages/skills` and `~/.agents/bgng/config.json` as current rather than legacy/current split. | Doc lines 121-187; `cli/core/skill-packages.ts`; `cli/core/store-paths.ts`; `cli/core/user-config.ts`. |
| `.ai/knowledges/04_homebrew-release-checklist.md` | ACCURATE | Low | Future-facing and still honest that Homebrew is not implemented. Recommended enhancement: add `bgng store status` and basic card commands to future smoke tests. | `package.json`; `cli/index.ts`. |
| `.ai/knowledges/05_npm-publishing-analysis-and-manual.md` | ACCURATE | Low | Publishing workflow still matches repo scripts and package name; token examples are placeholders/redacted. | `package.json`; `test/package-readiness.test.ts`; security scan. |

## Root Causes

1. **Cards-era store migration was not propagated to public docs.**
   The code moved current user state into `~/.agents/bgng/{machine.json,skills,mcp-servers,...}`, while docs-astro still teaches `~/.agents/bgng/config.json`, `~/.agents/library/mcp-servers.json`, and `~/.agents/packages/skills` as current paths.

2. **Command namespace changed from `bgng add extension` to `bgng extensions add`.**
   The removed command still appears in docs-astro quickstart and extension docs.

3. **Public CLI reference was not regenerated after Harness Cards shipped.**
   `card`, `store`, `apply`, `update`, `status --explain`, `status --why`, and `write --force` are absent.

4. **Safety semantics evolved from "report stale symlinks" to write-record ownership.**
   The current implementation removes only bgng-owned paths recorded in write records, preserves user-owned replacements, and exposes `--force` for managed-field drift.

5. **Docs-readiness coverage is too narrow.**
   `test/docs-readiness.test.ts` passes, but it does not inspect docs-astro and still accepts legacy package-cache references in the knowledge bundle guide.

## Batch Fix Patterns

Apply these carefully, with context-specific wording rather than blind global replacement:

| Stale Pattern | Replacement Guidance |
|---|---|
| `bgng add extension <name>` | `bgng extensions add <name>` |
| `~/.agents/bgng/config.json` as machine defaults | `~/.agents/bgng/machine.json` in cards-era store; mention `config.json` only as legacy pre-migration state |
| `~/.agents/library/mcp-servers.json` as active user registry | `~/.agents/bgng/mcp-servers/<id>.json`; mention legacy migration from `~/.agents/library/mcp-servers.json` |
| `~/.agents/packages/skills` as active bundle cache | `~/.agents/bgng/skills`; mention `~/.agents/packages/skills` only as pre-migration legacy cache |
| "stale symlinks are reported, not deleted" | "bgng-owned stale paths are cleaned through write records; user-owned paths are preserved and reported" |
| "five-layer model" | Split into machine scope and project scope: machine `built-ins + user library + machine.json`; project `built-ins + user library + cards + project overlay` |

## Recommended Docs-Astro Rewrite

The public docs should be revised as a small phased docs project rather than patched line by line.

### Phase 1: Stop Misleading Commands And Paths

Update immediately:

- `01-getting-started.md`: replace `bgng add extension` with `bgng extensions add`; add an upgrade callout for `bgng store status` / `bgng store migrate`; add a card-based quickstart.
- `03-cli-reference.md`: regenerate from `bgng --help`, `card --help`, `store --help`, `status --help`, and `write --help`.
- `04-mcp-registry.md` and `05-skill-library.md`: correct current store paths and explicitly label old paths as legacy pre-migration.
- `06-extensions.md`: replace extension add examples and document `extensions add` flags.

### Phase 2: Add Cards And Store Pages

Add two new pages or split existing pages:

- `Harness Cards`: authoring, publishing, applying, locking, updating, diffing, deprecating, local `file:` refs, command catalog.
- `Store And Migration`: cards-era store layout, migration behavior, archive behavior, `store status`, `store migrate`, `--cleanup-legacy-orphans`, and legacy path mapping.

### Phase 3: Rewrite Write/Project/Diagnostics Around v1.1

Rewrite:

- `02-how-apply-works.md`: rename or reframe around `How Write Works`; include machine vs project scope and write records.
- `07-per-project-config.md`: include `cards`, `card.lock`, generated files, write record, project-local materialization, and the machine-default boundary.
- `08-diagnostics.md`: include `status --explain`, `status --why`, card diagnostics, store diagnostics, write-record ownership, and `write --force`.

### Phase 4: Add Public Docs Guardrails

Extend documentation tests:

- scan docs-astro source for removed commands such as `bgng add extension`
- require docs-astro to mention `bgng card`, `bgng store`, `bgng apply`, `bgng update`
- require current store paths: `~/.agents/bgng/machine.json`, `~/.agents/bgng/skills`, `~/.agents/bgng/mcp-servers`
- reject active-current wording around `~/.agents/bgng/config.json`, `~/.agents/library/mcp-servers.json`, and `~/.agents/packages/skills`
- keep `cd docs-astro && bun run build` in the verification checklist

## Recommended Knowledge Doc Updates

Update `.ai/knowledges/01_agents-cli-usage-guide.md`:

- add `bgng write --force` to the write command section
- add a dedicated `Store Commands` section for `store status` and `store migrate`
- add `status --explain` and `status --why <category>:<name>`
- expand card coverage for `card list`, `card detach`, plain `card outdated`, and `--json` where supported
- expand doctor coverage for cards, store, and write-record sections

Update `.ai/knowledges/03_npm-skill-bundles-guide.md`:

- change current bundle storage to `~/.agents/bgng/skills/<package-name>/<version>`
- keep `~/.agents/packages/skills` only as legacy pre-migration storage
- change defaults path from `~/.agents/bgng/config.json` to `~/.agents/bgng/machine.json`
- mention that `skill-packages.ts` chooses current vs legacy layout based on `store.json`

Optionally update `.ai/knowledges/04_homebrew-release-checklist.md`:

- add future smoke checks for `bgng store status`, `bgng card list --json`, and `bgng status --explain`

## Build And Test Health

`bun test test/docs-readiness.test.ts` passed:

```text
1 pass, 0 fail, 77 expect() calls
```

This does not prove docs-astro alignment because that test does not read docs-astro source.

`cd docs-astro && bun run build` passed on the final verification run:

```text
0 errors, 0 warnings, 11 pages built
```

An earlier build emitted duplicate content-id warnings during dependency re-optimization, for example:

```text
Duplicate id "01-getting-started" found in .../docs-astro/src/content/docs/01-getting-started.md
```

That warning did not reproduce in the final build. Keep it as a watch item if it appears again, but it is not an active final-build failure.

## Adjacent Observation Outside Requested Scope

The README contains some of the same stale path language as docs-astro, including `~/.agents/library`, `~/.agents/bgng/config.json`, and `~/.agents/packages/skills`. If docs-astro is regenerated from README sections, update README first or use the corrected `.ai/knowledges` content as the source.

Also, `.ai/analyses/30_bgng-cli-usage-guide-cards-v1.md` should not be promoted wholesale into public docs without a correction pass: it contains examples for unimplemented or non-current surfaces such as `bgng card new --from-project`, `bgng card new --from-card`, `bgng update @name`, and `bgng store prune`.

## Final Verdict

`docs-astro` is not handoff-ready as public documentation for the latest implementation. It should be treated as a stale pre-cards documentation site that still builds.

`.ai/knowledges` is mostly handoff-ready for internal operators after two targeted updates: complete the `01_agents-cli-usage-guide.md` cards/store/status/write coverage, and update `03_npm-skill-bundles-guide.md` for the cards-era store paths.
