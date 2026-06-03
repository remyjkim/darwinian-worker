# ABOUTME: Verdict-per-doc audit of .ai/knowledges/ against the live darwinian-harness codebase
# ABOUTME: Confirms post-rebrand cleanup is effective and flags two localized inaccuracies

# Knowledge Docs Audit

**Date**: 2026-06-02
**Author**: Claude + Remy
**Status**: Final
**References**: [knowledges/README.md, knowledges/04_homebrew-release-checklist.md, knowledges/09_harness-cards-manual-test-guide.md, cli/commands/scan.ts, cli/core/store-paths.ts, docs/maintainers/publishing.md]

---

## Executive Summary

All nine content docs under `.ai/knowledges/` were audited against the live codebase using parallel subagent review. Result: **8 ACCURATE, 1 PARTIALLY_OUTDATED**. The repo's recent `beginning-harness` → `darwinian-harness` and `bgng` → `drwn` rebrand is fully reflected — no doc contains stale brand/binary strings in current-behavior claims. The two real findings are localized:

1. `09_harness-cards-manual-test-guide.md` lines 350-352 confuse `drwn/cards/` (bare Git repos) with `drwn/extracted/` (readable trees). Same doc gets this right at line 246, so it's a typo, not a misconception.
2. `04_homebrew-release-checklist.md` line 57 lists `drwn scan --json` as a post-install smoke check, but `cli/commands/scan.ts` is a placeholder that returns `"drwn scan is not implemented yet."` — the command runs cleanly but validates nothing.

Index drift: `knowledges/README.md` omits docs 06, 07, 08 from its sectioned index.

No credentials, API keys, or tokens found in any doc.

---

## Context

The repo directory was renamed from `beginning-harness` to `darwinian-harness`, with an earlier rename of the CLI binary from `bgng` to `drwn`. The natural risk after such a rebrand is that operator knowledge docs drift relative to actual command names, package identifiers, and config paths. This audit verified each knowledge doc against the live `cli/`, `registry/`, `scripts/`, and `package.json` to confirm no misleading content remains.

Audit method: divide-and-conquer with two parallel subagent passes (Group A: usage/config/cards, 4 docs; Group B: distribution/integrations, 5 docs). Each verified claims by reading code rather than trusting prose.

---

## Investigation

### Per-document verdicts

| # | Doc | Verdict | Severity | Action |
|---|-----|---------|----------|--------|
| 01 | `01_agents-cli-usage-guide.md` | ACCURATE | — | Keep |
| 02 | `02_per-project-config-guide.md` | ACCURATE | — | Keep |
| 03 | `03_npm-skill-bundles-guide.md` | ACCURATE | — | Keep |
| 04 | `04_homebrew-release-checklist.md` | PARTIALLY_OUTDATED | Low | Update |
| 05 | `05_npm-publishing-analysis-and-manual.md` | ACCURATE | — | Keep |
| 06 | `06_notion-mcp-setup-guide.md` | ACCURATE | Low | Optional polish |
| 07 | `07_claude-ai-mcp-connectors-explained.md` | ACCURATE | — | Keep |
| 08 | `08_harness_engineering_resources.md` | ACCURATE | — | Keep |
| 09 | `09_harness-cards-manual-test-guide.md` | ACCURATE | Low | Targeted fix |

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

`.ai/knowledges/README.md` sections (Operator / Distribution and Release / Manual Validation) list docs 01-05 and 09. Docs 06 (`notion-mcp-setup-guide`), 07 (`claude-ai-mcp-connectors-explained`), and 08 (`harness_engineering_resources`) are not indexed. Either add an "Integrations / Concepts" section, or merge them into existing sections.

### Non-findings (recorded for transparency)

- Doc 01 omits a few real flags (`init --guided`, `init --no-default-catalogs`, `store migrate --cleanup-legacy-orphans`, `library catalog refresh`). All present in code; doc is incomplete but not wrong.
- Doc 06 line 147 uses the legacy wrapper `bun sync-mcp.ts --mcp-only`. The wrapper still works (`sync-mcp.ts` is preserved at repo root). Canonical surface is now `drwn write --mcp-only`. Optional polish.
- The `drwn-hx` bin alias from `package.json:5` is not mentioned in any knowledge doc. Not a finding — `drwn` is the documented primary surface.

---

## Findings (summary)

1. Post-rebrand cleanup of `.ai/knowledges/` is **effective**. No stale `bgng`, `beginning-harness`, `beginning-agents`, or `thebeginningharness.com` references appear in current-behavior claims across any of the nine content docs.
2. Two localized accuracy issues require targeted edits (docs 09 and 04).
3. `README.md` index has not kept pace with new docs 06/07/08.
4. No security issues. All credential-like strings are shell placeholders or OAuth references.

---

## Recommendations

**P1 — Targeted fixes (small edits, can ship in one commit):**

- `09_harness-cards-manual-test-guide.md:350-352` — replace `drwn/cards/...` with `drwn/extracted/<tree-sha>/skills/...` to match line 246 and `cli/core/store-paths.ts:72-74`.
- `04_homebrew-release-checklist.md:57` — drop `drwn scan --json` or annotate it as a planned-surface check, citing `cli/commands/scan.ts` placeholder status.
- `README.md` — add `06_notion-mcp-setup-guide.md`, `07_claude-ai-mcp-connectors-explained.md`, `08_harness_engineering_resources.md` to the index under an appropriate section (suggested: "Integrations" for 06/07, "Concepts" for 08).

**P2 — Optional polish:**

- `06_notion-mcp-setup-guide.md:147` — replace `bun sync-mcp.ts --mcp-only` with `drwn write --mcp-only` to align with the canonical CLI surface; keep a footnote that the legacy wrapper still works.
- `01_agents-cli-usage-guide.md` — backfill the flag list for `init`, `store migrate`, and `library`. Cosmetic, not a correctness gap.

**No batch search-and-replace pattern emerged from this audit** — the docs were already swept clean of rebrand artifacts. The findings are point fixes.

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
