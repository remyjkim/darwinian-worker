# ABOUTME: Audit of .ai/knowledges/ docs against the live codebase after the darwinian-mind rebrand + mind-card feature wave.
# ABOUTME: Per-doc verdicts, root-cause drift analysis, batch-fix patterns, and a phased remediation plan.

# Knowledge Docs Audit — Post Mind-Card Wave

**Date**: 2026-06-26
**Author**: Claude + Remy
**Status**: Final
**Method**: `auditing-knowledge-docs` skill — parallel per-theme subagents, every claim verified against `cli/`, `package.json`, `registry/`, and config.
**Scope**: all 12 files in `.ai/knowledges/` (docs 01–11 + README).

---

## Executive Summary

The docs are **terminology-synced but feature-stale**. The `darwinian-harness → darwinian-mind` rename propagated cleanly into every doc — **zero** occurrences of `darwinian-harness`, `harness card`, `drwn-hx`, or old GitHub URLs remain. But the **mind-card feature wave that shipped with/after the rebrand is almost entirely undocumented**: persona/beliefs/memory authoring, the `mind use/list/clear` activation stack (`activeMinds`), per-mind + composed materialization (`generated/minds/` + `generated/mind/`), lockfile **v4**, the visibility push-gate, and the `dminds` binary. The drift is therefore **omission, not contradiction** — which is why most docs land at PARTIALLY_OUTDATED rather than worse.

**Verdict counts (12 docs):**

| Verdict | Count | Docs |
|---|---|---|
| ACCURATE | 5 | 03, 04, 06, 07, 08 |
| PARTIALLY_OUTDATED | 6 | 01, 02, 05, 09, 11, README |
| SIGNIFICANTLY_OUTDATED | 1 | 10 |
| OBSOLETE | 0 | — |
| DEPRECATED | 0 | — |

**No hardcoded credentials** in any doc. (Notion guidance is OAuth-only; the Slack `clientId` in `registry/mcp-servers.json` is a public client identifier, not a doc issue.)

**Two repo-state facts** explain several findings and are worth surfacing: the rebrand's terminal operator steps were not completed — the **local working directory is still `darwinian-harness`** (not `darwinian-mind`), and **`darwinian-mind` is unpublished on npm** (`darwinian-harness@0.2.1` is the last published artifact). The GitHub repo *was* renamed.

---

## Root Causes of Drift

1. **Rename ≠ feature-update (the dominant pattern).** Task 52 swept naming into the docs but the mind-card feature work (tasks 53/56) added a whole surface that no doc was updated to cover. Systemic missing topics across docs 01/02/09/10/11:
   - **Activation stack**: `mind use/list/clear`, `ProjectConfig.activeMinds`, `selectActiveCards` (`effective-state.ts:75,126`).
   - **Content authoring**: `card source add-persona|add-belief|add-memory` (+removes); manifest `persona`/`beliefs`/`memory` (`card-manifest.ts:36-40`).
   - **Materialization**: `generated/minds/<name>/` + composed `generated/mind/` (`mind-generator/sync-mind.ts`, `store-paths.ts:169-178`).
   - **Lockfile v4** with `persona`/`beliefs`/`memory`/`hooks` (`card-lock.ts:41,69`).
   - **Visibility push-gate**: `card push --remote-visibility`/`--unsafe-push-public` (`visibility.ts`, `commands/card/push.ts:36-69`).
   - **Second binary** `dminds` (`package.json:3-6`).
2. **Hard-fact staleness in the architecture reference (doc 10 only).** Beyond omission, doc 10 carries point-wrong facts from an older snapshot (version, lockfile version, registration count, "minDrwnVersion never written", "lastWriteHarnessVersion hardcoded") — all since changed in code.
3. **Incomplete terminal rebrand** — local dir not renamed and npm not published, which docs 09 (HARNESS_REPO path) and 05 (publishing lineage) get wrong.
4. **Index drift** — README's file list diverged from disk (doc-09 filename, missing doc-11).

---

## Per-Document Verdicts

| Doc | Verdict | Severity | Key Issues | Evidence | Action |
|---|---|---|---|---|---|
| **01** agents-cli-usage-guide | PARTIALLY_OUTDATED | Med | No false claims; missing `mind use/list/clear`, `activeMinds`, `card source add-persona/belief/memory/hook`, `push --remote-visibility/--unsafe-push-public`, `dminds`; "Implemented groups" list (L122-138) presents as complete but omits `auth`/`analyze`/`export`/`catalog validate`/`card audit`/`trust` | `cli/commands/mind/*`, `card/source/add-*`, `card/push.ts:36`, `index.ts` | Update |
| **02** per-project-config-guide | PARTIALLY_OUTDATED | Med | Schema list (L112-119) missing `activeMinds`, `hooks`, `trustedSources`; layering model (L141) predates active-stack gating; "What cards pin" omits persona/beliefs/memory | `types.ts:117,123-136`, `effective-state.ts:126` | Update |
| **03** npm-skill-bundles-guide | ACCURATE | Low | All commands/paths/contract verified; optionally note `dminds` | `cli/commands/skills/packages/*`, `skill-packages.ts` | Keep |
| **04** homebrew-release-checklist | ACCURATE | Low | Correctly future-facing; name/binary/commands correct; optionally note `dminds` | `package.json`, `cli/commands/*` | Keep |
| **05** npm-publishing-analysis-and-manual | PARTIALLY_OUTDATED | Med | L9 publishing-name lineage skips the actually-published name; never states `darwinian-mind` is unpublished and `darwinian-harness@0.2.1` is live | npm registry; `verify-release-readiness.ts:152` | Update |
| **06** notion-mcp-setup-guide | ACCURATE | — | Registry entry, opt-in flag, renderer, sync command all match | `registry/mcp-servers.json:41`, `cli/core/mcp.ts:108`, `sync-mcp.ts` | Keep |
| **07** claude-ai-mcp-connectors-explained | ACCURATE | — | External reference (Claude.ai platform); not codebase-coupled; stable | n/a | Keep |
| **08** harness_engineering_resources | ACCURATE | — | Pure external reference; "harness engineering" is the deliberately-kept generic term | n/a | Keep |
| **09** harness-cards-manual-test-guide | PARTIALLY_OUTDATED | **High** | **Broken `HARNESS_REPO=/…/darwinian-mind` path (L75)** — on-disk dir is `darwinian-harness`, so the setup block fails; lockfile checklist (L227-233) is v2-era (no hooks/persona/beliefs/memory/origin/git); no mind-authoring or `mind use` test pass; filename `harness-cards` vs title "Mind Cards"; duplicate `### 7.` headings | `basename pwd`, `card-lock.ts:19-41` | Update + rename file |
| **10** drwn-cli-architecture | **SIGNIFICANTLY_OUTDATED** | **High** | Whole mind-card subsystem missing (content/activation/composition/visibility) + hard-fact drift: "Last Updated 2026-06-03", version `0.1.0` (→0.2.2), lockfile "v2" (→v2\|3\|4/emits v4), "85 registrations" (→103), `minDrwnVersion` "never written" (now written `card-lock.ts:72`), `lastWriteHarnessVersion` "hardcoded 0.1.0" (now `DRWN_VERSION`), stale module index + command tree, no `dminds` | `package.json`, `card-lock.ts`, `index.ts` (103), `version.ts:4`, `sync-mind.ts` | Major update |
| **11** card-usage-guide.html | PARTIALLY_OUTDATED | Med | Covers only skills+MCP authoring; missing persona/beliefs/memory authoring + `mind use/list/clear`; "How write works" omits active-stack step; state-file map omits `generated/minds.json` | `card-manifest.ts:36`, `mind/list.ts`, `sync-mind.ts` | Update |
| **README** | PARTIALLY_OUTDATED | Med | L31 links `09_mind-cards-manual-test-guide.md` (404 — file is `09_harness-cards-…`); no entry for `11_card-usage-guide.html` | `ls .ai/knowledges/` | Update |

---

## Batch-Fix Patterns

### A. Additive "Mind Card surface" insert (fixes the dominant drift across 01, 02, 09, 10, 11)
A single reusable section to add to the usage/config/architecture docs:
- **Activation:** `drwn mind list` / `mind use <names…>` (ordered stack) / `mind clear`; `activeMinds` in `.agents/drwn/config.json` (ABSENT = all installed active; `[]` = none; `[names]` = explicit ordered stack); only the active stack projects to the IDE surface.
- **Authoring:** `card source add-persona|add-belief|add-memory` (+ `remove-*`), with `--visibility private|internal|public` (required on non-empty) and memory `--layer l4|l5|l6 --format md|jsonl|mixed`.
- **Manifest/lock:** `persona`/`beliefs`/`memory` manifest sections; lockfile **v4**.
- **Materialization:** per-mind `generated/minds/<scope>/<name>/` bundles + composed `generated/mind/` (stack-ordered `persona.md`, namespaced beliefs/memory, composed `mind.json`).
- **Push safety:** `card push --remote-visibility <v>` / `--unsafe-push-public`.
- **Binary:** `dminds` alias alongside `drwn`.

### B. Point search-and-replace / corrections
- **Doc 09 L75:** `HARNESS_REPO=…/darwinian-mind` → `…/darwinian-harness` (until the local dir is actually renamed). Update the v4 lockfile checklist; de-duplicate the `### 7.` headings.
- **Doc 10:** version `0.1.0`→`0.2.2`; lockfile `v2`→`v2|3|4 (emits v4)`; `85`→`103` registrations; delete the now-fixed "minDrwnVersion never written" and "lastWriteHarnessVersion hardcoded" claims; refresh module index + command tree; add `dminds`.
- **Doc 05:** add a line — current name `darwinian-mind` is **unpublished**; `darwinian-harness@0.2.1` is the last published artifact; `beginning-agents` was the original.
- **README L31:** fix the doc-09 link; add a `11_card-usage-guide.html` entry.
- **Doc 09 rename:** `09_harness-cards-manual-test-guide.md` → `09_mind-cards-manual-test-guide.md` (reconciles filename ↔ "Mind Cards" title ↔ the README link in one move). Last "harness" filename artifact.

---

## Consolidation / Redundancy

No drops or merges required — every doc covers a distinct angle. Note the three card-facing docs are complementary, not duplicative: **01** (CLI usage reference), **09** (manual test script), **11** (narrative usage scenarios, HTML). Keep all three; just extend each with the mind-card surface (Pattern A).

---

## Security

No hardcoded credentials, tokens, or keys in any audited doc. Doc 05 uses `${NPM_ORG_TOKEN}` and placeholders only; doc 06 is OAuth-against-hosted-URL. (Out-of-scope note: `registry/mcp-servers.json:55` has a Slack OAuth `clientId` — a public-by-design identifier, not a secret.)

---

## Phased Action Plan

**Phase 1 — High severity / actively misleading (do first):**
1. **Doc 10** — major update: insert the mind-card subsystem (Pattern A) + fix all hard-fact drift (Pattern B). It's the canonical architecture reference; its staleness is the biggest risk.
2. **Doc 09** — fix the broken `HARNESS_REPO` path, update the lockfile checklist to v4, add a mind-authoring + `mind use` test pass; rename the file to `09_mind-cards-…`.
3. **README** — fix the doc-09 link + add the doc-11 entry (1-line fixes; cheap, removes a 404).

**Phase 2 — Medium severity / coverage gaps:**
4. **Doc 01** — add a "Mind Commands" section + extend the card-source section to all 12 subcommands + document push visibility flags + reconcile the "Implemented groups" list with `cli/index.ts`.
5. **Doc 02** — add `activeMinds`/`hooks`/`trustedSources` to the schema; document active-stack gating in the layering model.
6. **Doc 11** — add persona/beliefs/memory authoring + active-stack consuming sections + `minds.json` to the state map.
7. **Doc 05** — add the published-name lineage clarification.

**Phase 3 — Low / optional:**
8. Docs 03, 04 — optionally note the `dminds` alias. No other changes.
9. Decide whether to also complete the rebrand's terminal steps (local dir rename, npm publish) — out of doc scope, but resolving them makes doc 09's path and doc 05's lineage correct rather than worked-around.

---

## Appendix — what is still trustworthy

Docs 03, 04, 06, 07, 08 are accurate as-is. Within the stale docs, the pre-mind-content engine is still correctly described: cards-as-package-manager, skills/MCP/extensions/targets, policy + signal hooks (incl. the `_drwn.ownedHooks` writer and Mastra runtime), the resolver pipeline, git plumbing, store maintenance, and diagnostics. The drift is concentrated in the new mind-card layer and (for doc 10) a handful of dated facts.
