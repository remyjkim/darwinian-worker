# ABOUTME: Audit findings and update strategy for the docs-docusaurus/ site against darwinian-minds v0.5.0.
# ABOUTME: 32 issues across 56 files, grouped by priority tier with per-file fix instructions.

# Analysis 83 — Docusaurus Docs Update Strategy (v0.5.0 Alignment)

## Background

A full audit of all 56 markdown files in `docs-docusaurus/docs/` was conducted against the
v0.5.0 `darwinian-minds` codebase. 32 issues were found.

The dominant root cause is the **symlink → copy migration**: `drwn write` now materializes
skills via `cpSync` (`managed-directory` kind, `cli/core/materialize.ts`) rather than symlinks.
This change is not reflected in the docs.

Secondary causes: a removed extension (`markdownify-mcp`), two undocumented `ManagedPath`
variants, stale project-name URLs, missing CLI commands and schema fields, and one dead doctor
check.

---

## Decisions Made

| Decision | Resolution |
|----------|-----------|
| `guides/setup-markdownify.md` | **Delete.** `markdownify-mcp` is not in the extension registry. `setup-markitdown.md` already covers the replacement. |
| `darwinian-harness-services.pages.dev` URL in examples | **Replace** with `darwiniantools.com`-based URL. Docs site is `docs.darwiniantools.com`; confirm exact analyzer web frontend subdomain before setting. Placeholder: `https://app.darwiniantools.com`. |

---

## Issue List by Tier

### Tier 1 — Factual Errors (20 issues)

These actively mislead users. Fix before any release or promotion of the docs site.

---

#### T1-01 `guides/setup-markdownify.md` — Remove entire file

Extension `markdownify-mcp` does not exist in `cli/core/extensions/registry.ts`. The registry
contains only `beads`, `parallel`, `markitdown`. A `guides/setup-markitdown.md` already exists.

**Action:** Delete `guides/setup-markdownify.md`. Also remove any links to it (check
`sidebars.ts` and any `See Also` sections).

---

#### T1-02 `getting-started/installation.md` line 14 — Remove `markdownify-mcp`

```
- *Optional:* `parallel-cli`, `markitdown`, or `markdownify-mcp`, only when you enable those integrations
```

**Action:** Remove `or `markdownify-mcp`` from this line.

---

#### T1-03 `reference/cli/login.md` — Stale `webBaseUrl` example

Example JSON shows `"webBaseUrl": "https://darwinian-harness-services.pages.dev"`.

**Action:** Replace with `"https://app.darwiniantools.com"` (or the confirmed analyzer frontend
URL). Same fix pattern applies to T1-04.

---

#### T1-04 `reference/cli/analyze.md` — Stale `webBaseUrl` example

Same `darwinian-harness-services.pages.dev` in the Configuration section JSON example.

**Action:** Replace with confirmed `darwiniantools.com` analyzer URL.

---

#### T1-05 `concepts/materialization.md` — Skills mechanism described as symlinks

"Three Materialization Mechanisms" #1: "Directory symlinks for skills."

Reality: `materializeDirectory` in `cli/core/materialize.ts` uses `cpSync`. Write record kind
is `managed-directory`, not `symlink`.

**Action:** Change mechanism #1 to "Copied directories for skills (`managed-directory`)."
Update accompanying description paragraph.

---

#### T1-06 `concepts/materialization.md` — Cursor mechanism described as generated-file + symlink

Mechanism #3: "Generated-file plus symlink for Cursor."

Reality: Cursor MCP config is written directly via `managed-content`. The generated sidecar
file and symlink no longer exist. `detectMissingGeneratedFiles` always returns `[]` (kept for
output-shape stability only — see its comment in `cli/core/diagnostics.ts:524`).

**Action:** Change mechanism #3 to "Direct file write for Cursor (`managed-content`)."

---

#### T1-07 and T1-08 `concepts/skills.md` lines 44 and 46 — "symlinks" for downstream skills

Line 44: `drwn write` creates "symlinks" under `~/.claude/skills`, `~/.codex/skills`.
Line 46: cleanup of "stale symlinks" from write record.

**Action:**
- Line 44: "symlinks" → "copies"
- Line 46: "stale symlinks" → "stale skill directories"

---

#### T1-09 `concepts/ownership-and-write-records.md` — Missing `ManagedPath` variants, wrong example

Documents only 3 `ManagedPath` kinds (`symlink`, `managed-fields`, `generated-symlink`).
`cli/core/write-record.ts` defines 5:

```ts
| { path: string; kind: "symlink"; target: string }
| { path: string; kind: "managed-fields"; fields: string[]; fieldHashes: Record<string, string> }
| { path: string; kind: "generated-symlink"; generatedPath: string }
| { path: string; kind: "managed-content"; contentHash: string }
| { path: string; kind: "managed-directory"; contentHash: string }
```

The skill example in the doc shows `"kind": "symlink"` — should be `"kind": "managed-directory"`.

**Action:**
- Add `managed-content` and `managed-directory` to the ManagedPath variants section
- Fix the skill example entry from `"kind": "symlink"` to `"kind": "managed-directory"`

---

#### T1-10 `concepts/ownership-and-write-records.md` line 72 — Cursor "generated-file-plus-symlink"

States Cursor uses the "generated-file-plus-symlink mechanism."

**Action:** Replace with "Cursor MCP config is written as `managed-content` directly."

---

#### T1-11 `concepts/diagnostics-model.md` line 78 — Same Cursor symlink claim

"generated-file-plus-symlink" language for Cursor.

**Action:** Replace with "managed-content written directly."

---

#### T1-12 `reference/schemas/write-record-json.md` — Wrong example kind, missing variants

Example shows `"kind": "symlink"` for a skill entry and `"kind": "generated-symlink"` for
Cursor. The ManagedPath variants section is missing `managed-content` and `managed-directory`.

**Action:**
- Change skill example entry to `"kind": "managed-directory"` with `"contentHash": "..."`
- Change Cursor example entry to `"kind": "managed-content"` with `"contentHash": "..."`
- Add `managed-content` and `managed-directory` variant subsections

---

#### T1-13 `reference/cli/mcp.md` line 67 — Cursor "symlinked from" language

"Cursor: a generated `cursor-mcp.json` … symlinked from `~/.cursor/mcp.json`."

**Action:** Replace with "Cursor: `~/.cursor/mcp.json` written directly as `managed-content`
(no generated sidecar)."

---

#### T1-14 `getting-started/paths/setup-your-machine.md` lines 102–103 — "symlinks" for downstream skills

"Downstream skill directories should contain symlinks for each skill."

**Action:** "symlinks" → "copied skill directories."

---

#### T1-15 `reference/schemas/machine-json.md` — `"cursor": { "symlink": true }` is fictitious

Example JSON shows `"symlink": true` in the cursor target config. `TargetConfig` in
`cli/core/types.ts` has no `symlink` field.

**Action:** Remove `"symlink": true` from example and the table row that documents it.

---

#### T1-16 `reference/specs/card-spec.md` — Lockfile version stated as "literal 2 only"

Claims `lockfileVersion` must be 2. `cli/core/card-lock.ts` validates `2 | 3 | 4`:

```ts
lockfileVersion: 2 | 3 | 4;
```

- v3 adds `hooks` field to `CardLockEntry`
- v4 adds `persona`, `beliefs`, `memory` fields

**Action:** Update to "literal `2`, `3`, or `4`" and document what each version adds.

---

#### T1-17 `getting-started/paths/use-team-harness.md` lines 11–13 — Duplicate-card failure

Example does `drwn apply @team/backend@^1.0.0` immediately followed by
`drwn add @team/backend@^1.0.0` with the same ref. `drwn add` after `drwn apply` with the
same package name hits the duplicate-card rejection.

**Action:** Remove the `drwn add` line (apply already pins the card), or give the two
operations different example refs.

---

#### T1-18 `reference/cli/doctor.md` — Dead "Missing generated Cursor file" check

Table row documents `detectMissingGeneratedFiles`. The function in `cli/core/diagnostics.ts:524`
always returns `[]` — its comment reads: "Cursor MCP config is now written directly as managed
content, so there is no generated sidecar file. Retained for output-shape stability."

**Action:** Remove the table row, or add a note that this check is no longer applicable.

---

#### T1-19 `troubleshooting/reading-doctor.md` line 86 — "re-establishes the symlink"

"A plain `drwn write` or `drwn mcp write` regenerates the file and re-establishes the symlink."
(In the Missing generated files subsection.)

**Action:** "re-establishes the symlink" → "restores the file."

---

#### T1-20 `reference/cli/status.md` — `--why` shown bare; `--explain` absent

`--why` is `Option.String` (requires a value). Showing it bare causes a Clipanion parse error.
`--explain` is `Option.Boolean` and is the flag for full provenance output.

**Action:**
- Fix occurrences of `drwn status --why` to `drwn status --why <query>`
- Add a separate `drwn status --explain` entry

---

### Tier 2 — Stale Content (7 issues)

Missing coverage of features that exist in the codebase. Fix for completeness.

---

#### T2-21 `reference/cli/card.md` — `card trust`, `card untrust`, `card audit` undocumented

`drwn card trust <name> --hooks` / `drwn card untrust <name>` manage hook-execution consent
stored in `card.lock`. `drwn card audit` checks card integrity. `drwn write` checks for consent
at write time and surfaces gaps as `hookIssues` in the doctor report.

**Action:** Add a "Hook Consent" subsection covering trust, untrust, and audit.

---

#### T2-22 `reference/cli/store.md` — `drwn store seed` undocumented

`cli/commands/store/seed.ts` exists. Intended for CI base images and airgapped deployments.
Supports `--from <path>` and `--force`.

**Action:** Add `drwn store seed` with flags and a brief use-case note.

---

#### T2-23 `reference/cli/status.md` — `--explain` flag absent from reference

`--explain` is `Option.Boolean` for full human-readable provenance. Documented in
`concepts/diagnostics-model.md` but missing from the command reference.

**Action:** Add `drwn status --explain` entry (linked from fix for T1-20).

---

#### T2-24 `troubleshooting/reading-doctor.md` — JSON example missing `hookIssues`, `surfaceNotes`, `platformChecks`

Doctor JSON output has at least these top-level fields not shown in the example.
`hookIssues` is operationally significant — fires when a locked card has hooks without consent.

**Action:** Update the JSON example shape; add a "Hook issues" subsection explaining when
`hookIssues` fires and how to resolve it (via `drwn card trust`).

---

#### T2-25 `reference/schemas/project-config-json.md` — Missing `activeMinds`, `hooks`, `trustedSources`

`ProjectConfig` in `cli/core/types.ts` includes fields not in the doc:
- `activeMinds: string[]`
- `hooks: { runtimes?: string[]; exclude?: string[]; signals?: Record<string, string[]> }`
- `trustedSources: TrustedSourcesConfig`

**Action:** Add these fields to the project-config table.

---

#### T2-26 `concepts/diagnostics-model.md` and `reference/cli/doctor.md` — `hookIssues` detector absent

Neither file documents the hook consent detector category.

**Action:** Add a `hookIssues` / Hook consent section to both files, explaining:
- what triggers it (locked card with hooks, no `drwn card trust` recorded)
- how to resolve it (`drwn card trust <name> --hooks` / `drwn write`)

---

#### T2-27 `troubleshooting/stale-symlinks.md` line 12 — Write record kinds list incomplete

Lists only `symlink`, `managed-fields`, `generated-symlink`. Missing `managed-content` and
`managed-directory`.

**Action:** Add the two missing kinds to the list. Note that skill entries now use
`managed-directory` and Cursor config uses `managed-content`.

---

### Tier 3 — Minor Issues (5 issues)

Low urgency. Clean up in the same pass.

---

#### T3-28 `reference/cli/doctor.md` — Category labels "broken/stale skill symlinks" misleading

`detectBrokenSymlinks` only detects symlink entries in the write record — after full migration
to `managed-directory`, this will always be empty. The human-readable labels are confusing.

**Action:** Update labels to "Broken or missing skill entries" / "Stale skill entries"; add a
note that the underlying JSON field name is `brokenSymlinks` for backward compat.

---

#### T3-29 `reference/schemas/write-record-json.md` line 24 — Version `0.1.0` in example

`"lastWriteHarnessVersion": "0.1.0"` in the example looks jarring against a v0.5.0 product.

**Action:** Update to `"0.5.0"`.

---

#### T3-30 `guides/doctor-in-ci.md` line 77 — References `drwn install --frozen` with no reference page

Mentions `drwn install --frozen` but there is no `reference/cli/install.md`. Readers can't
discover the full flag surface.

**Action:** Add `reference/cli/install.md` stub, or add a footnote linking to a relevant
section.

---

#### T3-31 `concepts/materialization.md` line 72 — Symlink-arrow notation in dry-run example

Dry-run example shows `skills/inspect-harness ← card foo@1.0.0`. Left-arrow notation is a
visual artifact from the old symlink-target representation.

**Action:** Replace arrow notation with copy notation, e.g. `[copy] skills/inspect-harness  ← card foo@1.0.0` → `[copy] skills/inspect-harness  from card foo@1.0.0`, or whatever `--dry-run` actually prints.

---

#### T3-32 `reference/specs/card-spec.md` line 81 — `hooks` missing from `CardLockEntry` required fields

`CardLockEntry` required fields table is missing `hooks: string[]` (added in lockfile v3).
Enforced by `cli/core/card-lock.ts:136`.

**Action:** Add `hooks` row with a "v3+" notation.

---

## Implementation Order

Run these in sequence. Each tier can be done per-file in a single commit.

```
Phase 1 (Tier 1, file deletion + symlink→copy sweep):
  1. Delete guides/setup-markdownify.md + remove references
  2. Fix getting-started/installation.md (T1-02)
  3. Fix reference/cli/login.md, reference/cli/analyze.md (T1-03, T1-04)
  4. Fix concepts/materialization.md (T1-05, T1-06, T1-31)
  5. Fix concepts/skills.md (T1-07, T1-08)
  6. Fix concepts/ownership-and-write-records.md (T1-09, T1-10)
  7. Fix concepts/diagnostics-model.md (T1-11)
  8. Fix reference/schemas/write-record-json.md (T1-12, T3-29)
  9. Fix reference/cli/mcp.md (T1-13)
  10. Fix getting-started/paths/setup-your-machine.md (T1-14)
  11. Fix reference/schemas/machine-json.md (T1-15)
  12. Fix reference/specs/card-spec.md (T1-16, T3-32)
  13. Fix getting-started/paths/use-team-harness.md (T1-17)
  14. Fix reference/cli/doctor.md (T1-18, T3-28)
  15. Fix troubleshooting/reading-doctor.md (T1-19, T2-24)
  16. Fix reference/cli/status.md (T1-20, T2-23)

Phase 2 (Tier 2, coverage gaps):
  17. Update reference/cli/card.md (T2-21)
  18. Update reference/cli/store.md (T2-22)
  19. Update reference/schemas/project-config-json.md (T2-25)
  20. Update concepts/diagnostics-model.md (T2-26)
  21. Update troubleshooting/stale-symlinks.md (T2-27)

Phase 3 (Tier 3, minor):
  22. Fix guides/doctor-in-ci.md (T3-30) — add install reference stub or note
```

## Open Question

The `webBaseUrl` in `login.md` / `analyze.md` examples needs to be replaced with the correct
`darwiniantools.com`-based analyzer frontend URL. The docs domain is confirmed as
`docs.darwiniantools.com`. The analyzer web frontend URL (previously
`darwinian-harness-services.pages.dev`) needs a confirmed replacement — candidate:
`https://app.darwiniantools.com`. Confirm before executing T1-03 / T1-04.
