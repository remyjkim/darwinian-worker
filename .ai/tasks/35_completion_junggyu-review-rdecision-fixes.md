# Task 35: Completion — Junggyu Review [RDecision] Fixes

**Status**: Completed
**Created**: 2026-06-03
**Updated**: 2026-06-03
**References**: [analyses/55_junggyu-review-rdecision-fix-strategies.md, tasks/35_junggyu-review-rdecision-fixes-implementation-plan.md, README.md, registry/config.json, cli/core/card-catalog.ts, cli/core/authoring-scope.ts, cli/core/authoring-scope-probes.ts, cli/commands/init.ts, cli/commands/card/new.ts, docs-docusaurus/docs/concepts/disciplines.md, docs-docusaurus/docs/concepts/safety-model.md, docs-docusaurus/docs/intro.md, docs-docusaurus/docs/reference/cli/init.md, test/core-card-catalog-default-url.test.ts, test/commands-init-default-catalog.test.ts, test/core-authoring-scope.test.ts, test/core-authoring-scope-resolve.test.ts, test/commands-card-new-autoderive.test.ts, test/docs-readiness.test.ts, https://github.com/curation-labs/dh-cards-catalog-v1]

---

## Objective Recap

Land the long-term-optimal fixes for the three `[RDecision]` items from Junggyu's Sprint-29 review:

1. **Issue 2** — `drwn init` failing to register the default community catalog.
2. **Issue 1** — `@me/` scope collisions on public publish.
3. **Issue 3** — README too long; redirect detail to docs.

Issue 4 (landing-page "How it works") was scoped out per direction.

## What Shipped

All three phases delivered, in the order specified by the plan (highest noise-per-fix-effort first).

### Phase 1 — Catalog URL fix + config-driven (commit `933757e` "Improve card authoring defaults")

**Effect:** `drwn init` now silently registers the live `@community` catalog instead of emitting an 8-line "Repository not found" error block for every first-time user.

**Code changes:**
- `cli/core/types.ts` — added optional `defaults.communityCatalogUrl?: string | null` to `CanonicalConfig`.
- `cli/core/card-catalog.ts` — replaced the hardcoded `DEFAULT_COMMUNITY_CATALOG_URL` constant with `resolveDefaultCommunityCatalogUrl(config)`; `ensureDefaultCommunityCatalog(agentsDir, url)` now takes the URL as a parameter and no-ops on `null`.
- `cli/commands/init.ts` — loads packaged config via `loadConfig`, resolves the URL through the helper, threads it into `ensureDefaultCommunityCatalog`.
- `registry/config.json` — added `"defaults": { "communityCatalogUrl": "https://github.com/curation-labs/dh-cards-catalog-v1.git" }`.
- `docs-docusaurus/docs/reference/cli/init.md` — note explaining how to override or disable the URL.

**Tests added:**
- `test/core-card-catalog-default-url.test.ts` — 5 cases covering set / null / undefined / missing-defaults / null-config.
- `test/commands-init-default-catalog.test.ts` — 3 integration cases using a local bare catalog repo (configured URL → registered; null URL → no-op; `--no-default-catalogs` overrides even when URL set).

**Live smoke:** real `drwn init` against the production URL succeeded; `drwn library catalog list` shows `@community` with the correct URL and zero error block.

### Phase 2 — `@me` sweep + auto-derive (commits `a9b7acd` "Clarify card authoring examples" and `933757e`)

**Effect:** documented convention no longer pushes users toward the colliding `@me` scope; first-run `drwn card new` auto-derives the user's GitHub handle and prompts to confirm (interactive) or surfaces it as a hint (non-interactive).

**Code changes:**
- `cli/commands/card/**/*.ts` (17 files) — `@me/<name>` replaced with `@your-handle/<name>` in every `examples` array.
- `cli/commands/card/new.ts` — `--scope` flag description rewritten ("e.g., @your-handle; auto-derived from gh / git config on first use"); execute() now resolves scope via `resolveScopeForCardNew` when the supplied name is unscoped and no saved authoring scope exists.
- `cli/core/authoring-scope.ts` — three pure helpers: `deriveAuthoringScopeFromProbeResults(probe)`, `probeAuthoringScope(runners)`, `resolveScopeForCardNew(opts)`. All side-effects are injected; the resolver returns a discriminated `{ kind: "ok" | "error" }` so the command code stays linear.
- `cli/core/authoring-scope-probes.ts` — `defaultProbeGh` (`gh api user -q .login`) and `defaultProbeGit(args)` runners using `Bun.spawn`. Both swallow exit codes and missing binaries to clean `null`.
- `docs/cli-quickref.md`, `docs-docusaurus/docs/**` (9 files) — every `@me` reference replaced or rewritten in prose.

**Tests added:**
- `test/core-authoring-scope.test.ts` — 13 cases on the pure derivation + probe-fallthrough helpers (gh-preference, github.user fallback, email local-part, lowercasing, rejection of disallowed characters, runner-absence).
- `test/core-authoring-scope-resolve.test.ts` — 9 cases on the resolver (explicit > saved > derived precedence; non-interactive emits a hint with the detected scope; interactive prompt path returns the derived value when accepted, cancellation error when declined).
- `test/commands-card-new-autoderive.test.ts` — 2 end-to-end cases that stub `gh` on PATH to verify the wiring carries the detected handle into the error message.

**Non-interactive behavior reaffirmed:** the existing `commands-card-author.test.ts` test for "fails for unscoped non-interactive names without authoring scope" continues to pass — the auto-derive path never silently auto-sets in CI.

### Phase 3 — README compaction + docs migration (commit `9540052` "Slim README and expand safety docs")

**Effect:** README is now 54 lines (was 166); deep content lives in the docs site where it can be linked, indexed, and updated independently.

**Code changes:**
- `docs-docusaurus/docs/concepts/disciplines.md` — new page (sidebar_position 10) carrying the six load-bearing commitments with one paragraph of context each.
- `docs-docusaurus/docs/concepts/safety-model.md` — new page (sidebar_position 11) with the six safety rules, the "why it looks this way" rationale, and "how it shows up in commands."
- `docs-docusaurus/docs/intro.md` — new "Core ideas" section cross-linking layered-model, cards, local-store, disciplines, and safety-model.
- `README.md` — trimmed to pitch + install + first run + docs-link cluster + contributing. Logo, brand line, and core install/first-run guidance preserved.

**Tests updated:**
- `test/docs-readiness.test.ts` — removed assertions for sections that moved (`What it harnesses`, `Why this exists`, `Disciplines`, `Safety model`, `First taste`); added assertions for new section title (`First run`) and the two new concept-page links (`concepts/disciplines`, `concepts/safety-model`).

## Verification

| Check | Result |
|---|---|
| `bun run typecheck` | clean |
| `bun test` | **552 / 552 pass, 0 fail** (was 528 with 15 pre-existing flakes before this work; new tests added: 32; flakes incidentally passed in the final run) |
| `bun run docs:build` | clean — both new concept pages render; intro cross-links resolve |
| Live `drwn init` against the real catalog URL | succeeded; `@community` registered cleanly |
| Grep for `@me` in `cli/ docs/ docs-docusaurus/docs/` | **zero hits** in user-facing surfaces (test fixtures intentionally untouched) |
| `wc -l README.md` | 54 (target was ≤ 60) |

## Deltas From the Plan

A handful of small departures from the written plan, all in the direction of simpler / smaller changes:

1. **No `gh` / `open` npm dependency added.** The plan considered the `open` package; the implementation uses `Bun.spawn` for the `gh` and `git` probes and never opens a browser (browser opening is a future concern for `drwn login`, not `drwn card new`).
2. **`resolveScopeForCardNew` extracted as a separate pure helper.** The plan sketched the prompt logic inline in `cli/commands/card/new.ts`. Extracting it to `cli/core/authoring-scope.ts` made TDD-style unit testing of the prompt-vs-error branching straightforward, while keeping the command class small.
3. **`isCardUnscopedName` gate added in `new.ts`.** During the first wire-up the resolver fired even when the supplied card name was already scoped (`@me/foo`-style argument from existing tests), producing a regression. The gate restores the historical behavior — auto-derive only runs when the name is unscoped *and* no saved scope is present.
4. **README trim went slightly further than the sketch.** Final length is 54 lines (target ≤ 60). The "For a project-local harness" block was inlined as a single sentence rather than a four-line snippet, because the docs site has the full sequence.
5. **No follow-up `drwn card rename` work.** The plan flagged this as a prerequisite for the publish-time guard option (Issue 1 Option C). Confirmed deferred — auto-derive (Option B) handles the systemic case and the doc sweep (Option A) handles the convention case; the publish-time guard remains an optional belt-and-suspenders for a later sprint.

## Open Follow-ups

| Item | Why it's deferred |
|---|---|
| `drwn card rename @<old>/x @<new>/x` | Needed for the Issue 1 Option C publish-time guard. Out of scope for the sprint; auto-derive (B) covers the new-user case. |
| Surface the deployed `darwiniantools.com` landing-page commit and decide whether to repoint `#catalog` to a docs URL | Issue 4, scoped out per direction. |
| Audit `darwinian-harness-skills/skills/**` for stale `@me` / catalog references | Tracked separately; see audit notes (run alongside this task). |
| Migration nudge for users with `machine.authoring.scope = "@me"` saved | Intentionally not implemented. Existing users keep working; we only stopped *teaching* `@me`. A noisy migration was judged worse than silent forward-compatibility. |

## Lessons Learned

1. **The verified reference always beats the planning sketch.** Phase 1 was easier than the analysis suggested once we confirmed the catalog repo really did exist at `curation-labs/dh-cards-catalog-v1`. Option A (point at the real repo) collapsed Options C (silent skip) and most of D (config-driven) into a single small PR with the URL configurable for future moves. Lesson: validate "does X exist upstream?" *before* designing fail-soft fallbacks.

2. **`bun:test` flakiness on macOS is real but not load-bearing.** Pre-existing symlink/sync tests fail intermittently in the full suite. They are unrelated to Phase 1/2/3 and pass on stash-and-restore. Worth filing as a separate stability task; not worth blocking on.

3. **Linter contention on the same line during fast-cycling Edit calls.** The Phase 2 sweep hit one round of "file has been modified since read" because the docs-readiness assertions referenced strings the README still contained. Re-reading and re-applying resolved it cleanly. Lesson: when sweeping multi-file changes, batch the test-assertion update with the same Edit cycle so the linter sees one consistent state.

4. **`Bun.spawn` with `stdout: "pipe"` requires draining via `Response`.** The `authoring-scope-probes.ts` runner uses `await new Response(proc.stdout).text()` — the equivalent of `process.stdout.toString()` from a child process. Worth keeping in mind for the upcoming `drwn login` / `drwn analyze` work.

5. **A discriminated-union return on the resolver paid off.** `resolveScopeForCardNew` returns `{ kind: "ok"; scope; source } | { kind: "error"; message }` rather than throwing. The command code stays linear, every branch is testable without try/catch, and the type system enforces error-path handling at every call site.

## Reproducible Smoke (for future verification)

```bash
# From the repo root, with a clean local store:
rm -rf /tmp/drwn-smoke ~/.agents-smoke && mkdir /tmp/drwn-smoke
AGENTS_REPO_ROOT=$PWD \
  AGENTS_HOME_DIR=/tmp/drwn-smoke-home \
  AGENTS_DIR=/tmp/drwn-smoke-home/.agents \
  bun cli/index.ts init --non-interactive

AGENTS_REPO_ROOT=$PWD \
  AGENTS_HOME_DIR=/tmp/drwn-smoke-home \
  AGENTS_DIR=/tmp/drwn-smoke-home/.agents \
  bun cli/index.ts library catalog list
# Expected: a single line for @community at the curation-labs URL, zero error block.
```

## Commits Landed

| SHA | Subject | Phase |
|---|---|---|
| `933757e` | Improve card authoring defaults | Phase 1 (catalog) + Phase 2 helpers + wiring |
| `a9b7acd` | Clarify card authoring examples | Phase 2 documentation sweep |
| `017b957` | Record review fix planning | analyses/55 + tasks/35 plan |
| `9540052` | Slim README and expand safety docs | Phase 3 |

## Acceptance Criteria — Final Read

- [x] All unit tests pass: `bun test` (552/552).
- [x] Typecheck clean: `bun run typecheck`.
- [x] Docs build clean: `bun run docs:build`.
- [x] No new npm runtime dependencies (zero deltas to `package.json`).
- [x] Junggyu's three `[RDecision]` items can be closed with a link to the relevant phase commit each.
- [x] `wc -l README.md` ≤ 60 (actual: 54).
- [x] Live `drwn init` against the real catalog URL no longer prints the failure block.
- [x] No `@me` strings remain in `cli/`, `docs/`, or `docs-docusaurus/docs/`.
