# Task 26 Handoff: Pre-execution Plan Patch

**Purpose**: When a new Claude session starts in this repo, read this first.
It carries the prior session's context for executing task 26
(`drwn card source ...` authoring CLI) and specifies the small set of patches
the plan doc needs before T1 can start.

## State at handoff

- Repo renamed from `beginning-harness` to `darwinian-harness` (this directory).
- Wave 1 committed across 8 logical commits on `remyjkim/harness-card-v1.1`.
- Wave 2 committed by coworker. Completion notes:
  `.ai/tasks/34_completion_drwn-git-distribution-wave-2.md`.
- At the end of the prior session, all 6 release gates were green
  (488 tests pass, typecheck clean, `verify:release` ok).
- Task 26 plan at `.ai/tasks/26_card-source-authoring-cli-implementation-plan.md`
  is **stale in three ways** (see Step 2). Patch before executing.

## Decisions confirmed in the prior session

- **Scope stays at all 8 commands** (`list`, `show`, `doctor`, `add-skill`,
  `remove-skill`, `set`, `add-mcp`, `remove-mcp`). Both skill-by-skill and
  MCP-by-MCP authoring were confirmed as common patterns.
- **Namespace stays `drwn card source <verb>`** (decision D1 in the plan).
  Hyphenated mutation verbs (`add-skill`, `remove-mcp`) are accepted as a
  pragmatic cost; alternatives considered and rejected: top-level `drwn source`
  (loses card-specific framing), flattening to `drwn card add-skill` (worsens
  verb collisions), four-level sub-namespace `card source skill add` (too deep).
- **Wave 2 first, task 26 second** sequencing held — Wave 2 is now done, so
  task 26 is unblocked.

## Step 1 — Confirm baseline

```bash
git status --short --branch
bun test
bun run typecheck
bun run verify:release
```

Expected:

- working tree clean (Wave 2 already committed by coworker)
- 488 tests pass
- typecheck green
- all 6 release gates green

If any step fails, **stop and investigate** before patching. Do not patch
on top of a broken baseline.

## Step 2 — Patch task 26 plan

Three drift items. Apply all three in one edit pass.

### Patch A: bgng → drwn rebrand

The plan was authored pre-rebrand and still says `bgng` throughout.
Search-replace in `.ai/tasks/26_card-source-authoring-cli-implementation-plan.md`:

| From | To |
|---|---|
| `bgng card source` | `drwn card source` |
| `bgng card new` | `drwn card new` |
| `bgng card add` | `drwn card add` |
| `bgng card publish` | `drwn card publish` |
| `bgng apply` | `drwn apply` |
| `bgng write` | `drwn write` |
| `~/.agents/bgng/sources/` | `~/.agents/drwn/sources/` |
| `~/.agents/bgng/` | `~/.agents/drwn/` |

Verify nothing was missed:

```bash
grep -n "bgng" .ai/tasks/26_card-source-authoring-cli-implementation-plan.md
```

Expected: zero matches.

### Patch B: extend `set` for Wave 2 quality fields

Wave 2 added three manifest fields with validation in `cli/core/card-manifest.ts`:

- `stability` (enum: `experimental` | `stable` | `production`)
- `lastValidatedWith` (semver)
- `testStatusBadge` (HTTP(S) URL)

The current §T3 scope omits these. A `set` command that can't touch fields the
manifest schema accepts would force authors back into manual JSON edits — exactly
what task 26 exists to eliminate.

Edit §T3 in two places:

**§T3 → "Tests first"**: append cases for

- `set --stability stable` (and rejection of an invalid value)
- `set --last-validated-with 1.2.3` (and rejection of a non-semver value)
- `set --test-status-badge https://...` (and rejection of a non-HTTP(S) URL)

**§T3 → "Implementation steps"**: expand the supported-flags list to:

- `--description`
- `--version`
- `--license`
- `--harness-min-version`
- `--stability`
- `--last-validated-with`
- `--test-status-badge`

Validation already exists in `cli/core/card-manifest.ts`; the new flags route
through the same validator post-patching, so the work is plumbing-only.

Also update §T6 to mention the new flags in the README, usage guide, and
docs-astro touchpoints. `card show` already surfaces these fields per Wave 2;
`card source set` is just the symmetric author-side counterpart.

### Patch C: re-anchor architecture references

The plan's header cites only pre-Wave-1 analyses. After Wave 1 and Wave 2,
the canonical references are 52 and 53.

In the header block:

- **Dependencies**: replace
  `.ai/analyses/41_card-source-authoring-cli-target-architecture.md`
  with both:
  - `.ai/analyses/52_drwn-target-architecture-post-wave-1.md`
  - `.ai/analyses/53_remote-card-publishing-usage-pattern-manual.md`
- **References**: add 52 and 53. Keep 41 as historical context. Drop 29
  and 36 — both predate Wave 1 and are no longer load-bearing for this task.

Add a one-line note immediately above the "Decisions Locked Before
Implementation" table:

> Decisions D1–D8 below were authored against analysis 41. They remain
> in force after the Wave 1 / Wave 2 architecture and are not reopened
> by this patch.

## Step 3 — Commit the patch

```bash
git add .ai/tasks/26_card-source-authoring-cli-implementation-plan.md
git commit -m "[doc:plan] refresh task 26 for drwn rebrand, quality fields, post-wave architecture"
```

No AI attribution in the commit message (Remy's standing rule).

Optional: also delete this handoff file in the same or a follow-up commit,
since its purpose is consumed once the patch lands.

## Step 4 — Start T1

Follow the patched plan's task sequence: T1 → T2 → T3 → T4 → T5 → T6.
The plan header instructs use of `superpowers:executing-plans` as the
required sub-skill.

T1 establishes the source-read layer (`cli/core/card-source.ts` plus
`drwn card source list/show/doctor`). Every later task depends on it.

## Out of scope for this handoff

Do **not** during the patch step:

- Change the command surface (all 8 commands stay in).
- Move the namespace away from `drwn card source <verb>` (D1 stands).
- Open `file:` source authoring (deferred per D8).
- Refactor the resolver order for `--from` in `add-skill` / `add-mcp`
  (T2/T4 spec is intentional; revisit only if execution surfaces a real
  conflict with `effective-state.ts`).

## Background context if needed

The prior conversation transcript lives at:

```
/Users/pureicis/.claude/projects/-Users-pureicis-dev-beginning-harness/241168f4-e0ad-4ecd-baeb-95c96b5f6f3b.jsonl
```

That projects directory is keyed off the **old** repo path; it survives the
repo rename because it lives under `~/.claude/projects/`, not under the repo.
Read it only if this handoff leaves a gap.
