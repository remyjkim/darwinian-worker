# ABOUTME: Verdict-per-doc audit of .ai/knowledges/ against the live darwinian-harness codebase
# ABOUTME: Confirms post-rebrand cleanup; flags localized inaccuracies; records follow-up actions

# Knowledge Docs Audit

**Date**: 2026-06-02
**Author**: Claude + Remy
**Status**: Final (revised 2026-06-02 with follow-up audit of card source flag coverage and recorded actions)
**References**: [knowledges/README.md, knowledges/01_agents-cli-usage-guide.md, knowledges/04_homebrew-release-checklist.md, knowledges/09_harness-cards-manual-test-guide.md, knowledges/10_drwn-cli-architecture.md, cli/commands/scan.ts, cli/commands/card/source, cli/core/store-paths.ts, docs/maintainers/publishing.md]

---

## Executive Summary

All nine content docs under `.ai/knowledges/` were audited against the live codebase using parallel subagent review. Initial result: 8 ACCURATE, 1 PARTIALLY_OUTDATED. A follow-up pass on doc 01's `card source` coverage (prompted by Remy after the initial report) revised doc 01 from ACCURATE to PARTIALLY_OUTDATED for flag-coverage incompleteness. **Final result: 7 ACCURATE, 2 PARTIALLY_OUTDATED.** The repo's recent `beginning-harness` → `darwinian-harness` and `bgng` → `drwn` rebrand is fully reflected — no doc contains stale brand/binary strings in current-behavior claims. The real findings are localized:

1. `09_harness-cards-manual-test-guide.md` lines 350-352 confused `drwn/cards/` (bare Git repos) with `drwn/extracted/` (readable trees). Same doc gets this right at line 246. **Fixed.**
2. `04_homebrew-release-checklist.md` line 57 listed `drwn scan --json` as a post-install smoke check, but `cli/commands/scan.ts` is a placeholder that returns `"drwn scan is not implemented yet."`. **Annotated.**
3. `01_agents-cli-usage-guide.md` lines 210-243 cover all 8 `card source` subcommands but omit `--dry-run`, `--replace`, `--json` on the mutators and miss `--license` / `--harness-min-version` on `source set`. Doc text mentions dry runs without ever showing the flag. **Fixed** — example blocks extended with `--dry-run` and `--replace`, `source set` examples extended with `--license` and `--harness-min-version`, and a sentence added noting that every mutating source subcommand accepts `--dry-run` and `--json`.

Index drift: `knowledges/README.md` omitted docs 06, 07, 08. **Fixed** (added "Integrations" and "Concepts" sections plus the new "Architecture" entry for doc 10).

No credentials, API keys, or tokens found in any doc.

A new architecture-level reference doc — `10_drwn-cli-architecture.md` — was authored after this audit to fill a separate gap (the knowledge dir had no under-the-hood internals reference). It is unrelated to the rebrand audit findings but is recorded here for trace continuity.

---

## Context

The repo directory was renamed from `beginning-harness` to `darwinian-harness`, with an earlier rename of the CLI binary from `bgng` to `drwn`. The natural risk after such a rebrand is that operator knowledge docs drift relative to actual command names, package identifiers, and config paths. This audit verified each knowledge doc against the live `cli/`, `registry/`, `scripts/`, and `package.json` to confirm no misleading content remains.

Audit method: divide-and-conquer with two parallel subagent passes (Group A: usage/config/cards, 4 docs; Group B: distribution/integrations, 5 docs). Each verified claims by reading code rather than trusting prose.

---

## Investigation

### Per-document verdicts

| # | Doc | Verdict | Severity | Action |
|---|-----|---------|----------|--------|
| 01 | `01_agents-cli-usage-guide.md` | PARTIALLY_OUTDATED (revised) | Low | Update — `card source` flag coverage gap (Finding 4) |
| 02 | `02_per-project-config-guide.md` | ACCURATE | — | Keep |
| 03 | `03_npm-skill-bundles-guide.md` | ACCURATE | — | Keep |
| 04 | `04_homebrew-release-checklist.md` | PARTIALLY_OUTDATED | Low | Update — applied |
| 05 | `05_npm-publishing-analysis-and-manual.md` | ACCURATE | — | Keep |
| 06 | `06_notion-mcp-setup-guide.md` | ACCURATE | Low | Optional polish |
| 07 | `07_claude-ai-mcp-connectors-explained.md` | ACCURATE | — | Keep |
| 08 | `08_harness_engineering_resources.md` | ACCURATE | — | Keep |
| 09 | `09_harness-cards-manual-test-guide.md` | ACCURATE | Low | Targeted fix — applied |

(`README.md` is the index, not a content doc — treated separately below.)

### Findings with evidence

**Finding 1 — Doc 09, lines 350-352 (typo: cards vs extracted)**

Doc says:
> - both point into `"$AGENTS_DIR/drwn/cards/..."`
> - neither points into the checkout's built-in `skills/` tree

Code in `cli/core/store-paths.ts`:
- `resolveCardBareRepoPath` returns `<agents>/drwn/cards/<scope>/<name>.git` (line 64-70) — bare repos only
- `resolveExtractedPath` returns `<agents>/drwn/extracted/<tree-sha>` (line 72-74) — readable trees that symlinks point into

The same doc at line 246 correctly writes:
> skill targets point into `"$AGENTS_DIR/drwn/extracted/<tree-sha>/skills/..."`

Lines 350-352 should mirror that — `drwn/extracted/...`. Localized typo.

**Finding 2 — Doc 04, line 57 (smoke test on unimplemented command)**

Doc lists `drwn scan --json` among post-install Homebrew smoke checks. `cli/commands/scan.ts:36-47` returns:

```json
{"implemented": false, "changes": [], "plannedRole": [...], "message": "drwn scan is not implemented yet."}
```

The command exits 0, so it won't fail a smoke run, but it doesn't validate Homebrew install integrity either. Recommend either dropping the line or noting that it's a planned-surface check only.

**Finding 3 — `README.md` index gap**

`.ai/knowledges/README.md` sections (Operator / Distribution and Release / Manual Validation) listed docs 01-05 and 09. Docs 06 (`notion-mcp-setup-guide`), 07 (`claude-ai-mcp-connectors-explained`), and 08 (`harness_engineering_resources`) were not indexed.

**Finding 4 — Doc 01, `card source` flag coverage gap (added in revision)**

Doc 01 lines 210-243 cover every `card source` subcommand by name, but the example block omits flags that are real and meaningful on the live command. Comparison against `cli/commands/card/source/*.ts`:

| Subcommand | Code supports | Doc 01 shows | Missing |
|---|---|---|---|
| `source list` | `--json` | none | `--json` |
| `source show` | `--json` | `--json` | — |
| `source doctor` | `--json` | none | `--json` |
| `source add-skill` | `--from`, `--replace`, `--dry-run`, `--json` | `--from` | `--replace`, `--dry-run`, `--json` |
| `source remove-skill` | `--keep-files`, `--dry-run`, `--json` | `--keep-files` | `--dry-run`, `--json` |
| `source add-mcp` | `--from`, `--replace`, `--dry-run`, `--json` | `--from` | `--replace`, `--dry-run`, `--json` |
| `source remove-mcp` | `--keep-files`, `--dry-run`, `--json` | `--keep-files` | `--dry-run`, `--json` |
| `source set` | `--description`, `--version`, `--license`, `--harness-min-version`, `--stability`, `--last-validated-with`, `--test-status-badge`, `--dry-run`, `--json` | `--description`, `--version`, `--stability`, `--last-validated-with`, `--test-status-badge` | `--license`, `--harness-min-version`, `--dry-run`, `--json` |

Severity: Low (no wrong claims), but materially confusing — line 246-248 mentions dry runs but the flag never appears in any source example. `--replace` for add-skill/add-mcp is the override semantic for re-adding an existing name, undocumented. `--license` and `--harness-min-version` are real manifest fields on `card source set`. Verdict revised from ACCURATE to PARTIALLY_OUTDATED.

### Non-findings (recorded for transparency)

- Doc 01 also omits a few real flags outside the card-source surface (`init --guided`, `init --no-default-catalogs`, `store migrate --cleanup-legacy-orphans`, `library catalog refresh`). All present in code; doc is incomplete but not wrong.
- Doc 06 line 147 uses the legacy wrapper `bun sync-mcp.ts --mcp-only`. The wrapper still works (`sync-mcp.ts` is preserved at repo root). Canonical surface is now `drwn write --mcp-only`. Optional polish.
- The `drwn-hx` bin alias from `package.json:5` is not mentioned in any knowledge doc. Not a finding — `drwn` is the documented primary surface.

---

## Findings (summary)

1. Post-rebrand cleanup of `.ai/knowledges/` is **effective**. No stale `bgng`, `beginning-harness`, `beginning-agents`, or `thebeginningharness.com` references appear in current-behavior claims across any of the nine content docs.
2. Three localized accuracy issues identified: docs 09 (typo), 04 (placeholder smoke check), and 01 (`card source` flag coverage gap discovered on revision).
3. `README.md` index had not kept pace with new docs 06/07/08.
4. No security issues. All credential-like strings are shell placeholders or OAuth references.

---

## Recommendations

**P1 — Targeted fixes (small edits, can ship in one commit):**

- `09_harness-cards-manual-test-guide.md:350-352` — replace `drwn/cards/...` with `drwn/extracted/<tree-sha>/skills/...` to match line 246 and `cli/core/store-paths.ts:72-74`.
- `04_homebrew-release-checklist.md:57` — drop `drwn scan --json` or annotate it as a planned-surface check, citing `cli/commands/scan.ts` placeholder status.
- `README.md` — add `06_notion-mcp-setup-guide.md`, `07_claude-ai-mcp-connectors-explained.md`, `08_harness_engineering_resources.md` to the index under an appropriate section (suggested: "Integrations" for 06/07, "Concepts" for 08).
- `01_agents-cli-usage-guide.md` lines 210-243 — extend the `card source` examples to show `--dry-run` (at least once), `--replace` (on add-skill/add-mcp), `--license` and `--harness-min-version` (on source set), and note that `--json` is universal across the source subcommands.

**P2 — Optional polish:**

- `06_notion-mcp-setup-guide.md:147` — replace `bun sync-mcp.ts --mcp-only` with `drwn write --mcp-only` to align with the canonical CLI surface; keep a footnote that the legacy wrapper still works.
- `01_agents-cli-usage-guide.md` — backfill the flag list for `init`, `store migrate`, and `library` outside the card-source section. Cosmetic, not a correctness gap.

**No batch search-and-replace pattern emerged from this audit** — the docs were already swept clean of rebrand artifacts. The findings are point fixes.

---

## Actions Taken

Recorded in chronological order during the audit and follow-up:

1. **`docs/maintainers/publishing.md:124` — updated.** The line referencing the deprecated `beginning-agents` npm package was rewritten to acknowledge both prior published names (`beginning-agents` and `beginning-harness`) as deprecated targets, while keeping the operational deprecation guidance intact. Decision tracked in conversation; rationale: keep the literal npm package identifiers as historical references, drop the deprecated terms from forward-looking prose. (This work was triggered by a directory rename audit, separate from the knowledge-docs audit, but related.)
2. **P1 fix applied: doc 09.** Lines 351-352 corrected to `"$AGENTS_DIR/drwn/extracted/<tree-sha>/skills/..."`, matching line 246 and `cli/core/store-paths.ts:72-74`.
3. **P1 fix applied: doc 04.** Line 57 annotated as `drwn scan --json (currently a planned-surface placeholder; confirms the binary is reachable and JSON output renders)`. Preserves the smoke-list intent while flagging the placeholder status.
4. **P1 fix applied: README index.** Added new "Integrations" section (docs 06, 07), new "Concepts" section (doc 08), and a new "Architecture" section (doc 10). Order remains ascending by document number.
5. **Doc 10 created.** A new comprehensive as-built architecture reference (`knowledges/10_drwn-cli-architecture.md`, ~1,117 lines) was written to fill a separate gap: the knowledges directory had no under-the-hood internals reference. Grounded in the live `cli/`, `cli/core/`, `registry/`, and `package.json` with line-level citations. Includes a per-module index for `cli/core/*` and a command-to-module map.
6. **V0.7 Notion page drafted.** "Darwinian Harness CLI Usage Guide v0.7" (`https://app.notion.com/p/374f1fbef8c28188bcd5c31d131ae407`) created as a revision of the V0.6 operator-facing guide, slotted under Sprint 29 Home → `## 2) Product` → `### PRD / specs`. V0.7 surfaces the missing `card source` flag coverage from Finding 4 (operator-facing).
7. **P1 fix applied: doc 01.** Card-source flag coverage gap (Finding 4) — example blocks at lines 225-243 extended with `--dry-run` and `--replace` on add/remove mutators, `source set` extended with `--license` and `--harness-min-version`, and a follow-up sentence added noting that every mutating source subcommand accepts `--dry-run` and `--json`.

---

## Open Questions

- Is the `~/.agents/drwn/machine.json`-suppresses-defaults claim in `02_per-project-config-guide.md:149-150` enforced in code? The audit confirmed `mergeProjectConfig` exists in `cli/core/project.ts:49+`, but did not trace the specific suppression path. Worth a one-pass verification before any user-facing doc relies on it.
- Should `drwn scan` be promoted out of placeholder status before the Homebrew checklist is exercised in earnest? If not, the doc's smoke list should treat it as a known no-op.

---

## Appendix

### Audit method

- Two parallel `general-purpose` subagents, each given:
  - Its doc group (4 and 5 docs)
  - Codebase orientation (entry points in `cli/`, registry artifacts, package metadata)
  - Explicit list of recent rebrand signals to look for
  - Verification checklist (commands, flags, paths, schemas, credentials)
  - Verdict taxonomy and structured output format
- Findings cross-checked by the coordinator against `cli/commands/scan.ts`, `cli/core/store-paths.ts`, and `knowledges/README.md` before being recorded here.
- A revision pass on doc 01's `card source` coverage was triggered by Remy after the initial audit; flag coverage was verified by reading every file under `cli/commands/card/source/*.ts` and comparing the declared Clipanion options against the doc's example blocks.

### Files referenced as ground truth

- `package.json` — canonical name, version, bin entries, files allowlist
- `cli/commands/**/*.ts` — command surface
- `cli/core/store-paths.ts` — store layout (`cards/`, `extracted/`, `skills/`, `defaults`)
- `cli/core/skill-packages.ts`, `cli/core/skills.ts` — bundle ingestion + skill resolution
- `cli/core/card-*.ts` — harness-cards behavior
- `cli/core/types.ts` — `ProjectConfig` and bundle manifest schemas
- `registry/config.json`, `registry/mcp-servers.json` — MCP registry
- `docs/maintainers/publishing.md` — manual publish workflow (ground truth for doc 05)
- `scripts/verify-release-readiness.ts` — publish-boundary enforcement
