# Beginning Harness Agent Skills - Cards-Era Gap Assessment

## Executive Summary

The prior agent-skills framing was built around a pre-cards mental model:
cross-project directory organization, category symlink trees, a meaningful
`bgng scan`, and a thin wrapper over `init / add / sync / write`.

That is no longer the live product shape.

The current CLI is a cards-era local control plane with these real centers of
gravity:

- machine defaults under `~/.agents/bgng/machine.json`
- per-project overlays under `<project>/.agents/bgng/config.json`
- immutable published Harness Cards under `~/.agents/bgng/cards/...`
- a curated publication layer under `~/.agents/skills`
- project-first materialization via `bgng write`
- report-only diagnostics via `bgng doctor`
- provenance and card lifecycle inspection via `bgng status` and `bgng card ...`

Verdict on the old document: `SIGNIFICANTLY_OUTDATED`.

The core idea that still holds is good:

- an agentic layer on top of `bgng` is useful
- user-ask checkpoints are still the right safety model
- a separate skills repo can still make sense

What must change is the substrate the skills wrap. The next agent-skill design
should be cards-first, project-first, and diagnostics-aware. Cross-project
"organize my projects" behavior should be treated as a future workflow that
either owns its own filesystem scan logic or waits for a real `bgng scan`
implementation.

## 1. Current CLI Reality

### 1.1 What `bgng` is today

Today `bgng` is not primarily a workspace organizer. It is a local harness
control plane for:

- reusable skill and MCP inventory
- machine-wide defaults
- project overlays
- extensions
- Harness Cards
- downstream materialization into Claude, Codex, and Cursor
- report-only diagnostics

Relevant public surface:

- general: `status`, `doctor`, `init`, `write`, `scan`
- project mutation: `add skill`, `add mcp`, `extensions add`
- cards: `apply`, `card new`, `card publish`, `card add`, `card pin`,
  `card remove`, `card update`, `card outdated`, `card detach`,
  `card show`, `card list`, `card status`, `card diff`, `card deprecate`
- machine/library: `library add`, `library defaults add/remove`,
  `skills curate`, `skills uncurate`, `skills packages ...`
- store: `store status`, `store migrate`

### 1.2 What `bgng scan` is today

`bgng scan` is intentionally a placeholder.

Its current contract is:

- no-op
- non-mutating
- explicit `"implemented": false` in JSON mode
- reserved for future import/discovery semantics

This matters because the previous agent-skills framing treated `scan` as a real
classification and recency-analysis primitive. That assumption is no longer
defensible.

### 1.3 The current state model

The live layering model is:

```text
built-in defaults
-> local library
-> machine-wide defaults
-> applied cards
-> project overlay
-> downstream generated state
```

For skill resolution specifically:

- applied card skill content is authoritative
- user-default sources are fallback
- unresolved `skills.include` names fail `bgng write` before mutation
- `bgng doctor` reports but does not fix

## 2. Drift Matrix Against The Previous Design

| Previous assumption | Status | Current reality | Required update |
| --- | --- | --- | --- |
| `bgng` substrate is `init / scan / add / sync / write` | Wrong | `sync` is gone, `scan` is placeholder, cards and diagnostics are first-class | Replace command model completely |
| Agent layer should organize `~/Documents/projects/` into category trees | Unsupported by CLI | No built-in category tree or directory organizer exists | Reframe as future workflow or external-to-bgng behavior |
| `beginning:onboard` should create a dedicated root harness directory | Wrong | `bgng init` scaffolds per-project config only | Redefine onboarding around project bootstrap or machine-default bootstrap |
| `beginning:organize` should wrap `bgng scan` | Wrong | `bgng scan` cannot classify or mutate anything | Either own scan logic in the skill or move this to future scope |
| `beginning:provision` should mainly use `bgng add` at hierarchy levels | Partial | `bgng add` is only one path; cards, extensions, defaults, and write are equally important | Redesign provisioning around scope selection and cards/extensions |
| `beginning:checkup` should use future `doctor` | Wrong | `bgng doctor` exists today and is central | Promote `doctor`, `status --why`, `status --explain`, and `card status` |
| Skill/MCP inheritance is root -> category -> repo | Wrong | Real inheritance is machine defaults -> cards -> project overlay | Replace scope model entirely |
| Skill interface can ignore Harness Cards | Wrong | Cards now pin reusable project harness intent and dominate skill materialization | Add card authoring, application, update, and diagnostics flows |

## 3. Missing Parts In The Old Agent-Skill Interface

The previous document is not just stale in wording. It misses entire capability
families that now matter to any useful agentic wrapper.

### 3.1 Harness Card authoring lifecycle

Missing from the old design:

- `bgng card new`
- `bgng card publish`
- `bgng card show`
- `bgng card diff`
- `bgng card deprecate`

Why this matters:

- cards are now the reusable packaging unit for project harness intent
- agent skills need a path for "author a reusable harness preset" rather than
  only "add one skill/MCP directly"

### 3.2 Harness Card consumption lifecycle

Missing from the old design:

- `bgng apply`
- `bgng card add`
- `bgng card pin`
- `bgng card remove`
- `bgng card update`
- `bgng card outdated`
- `bgng card detach`
- `card.lock` as a first-class artifact

Why this matters:

- consumption is now versioned and inspectable
- safe agent flows need to distinguish ranged refs, exact pins, updates, and
  detach operations

### 3.3 Project-vs-machine scope selection

The old design only understood hierarchy levels like root/category/user-dir.
That misses the real scope decisions a skill must surface:

- machine-wide default
- current project overlay
- reusable card source
- downstream materialization only

Any agent skill that mutates bgng now needs an explicit scope checkpoint before
it acts.

### 3.4 Extension-aware setup

The old design misses the project-first extension layer entirely:

- `bgng extensions add`
- `bgng extensions setup`
- `bgng extensions status`
- `bgng extensions doctor`

This matters because some user intents should map to semantic extensions, not to
raw skill or MCP toggles. Example cases:

- Parallel
- Beads
- MarkItDown

### 3.5 Diagnostics and provenance

The old `checkup` concept is far too weak for the current CLI.

Missing from the interface:

- `bgng doctor`
- `bgng status --why`
- `bgng status --explain`
- `bgng card status --explain`
- `bgng store status`

These are now the primary tools for agent-safe explanation and drift triage.

### 3.6 Store migration and legacy preflight

The old design assumes a clean modern store.

That is unsafe. Cards-era skills must account for:

- `bgng store status`
- `bgng store migrate`
- legacy-layout detection as a hard precondition for card flows

An agent skill that jumps straight into card authoring or application without
checking this can strand the user in a confusing failure mode.

### 3.7 Write-time safety contracts

The old design treats provision/write as if it were a simple final sync step.
That misses important current contracts:

- `bgng write --dry-run --json` only reports pending mutations in `changes`
- applied card skill content wins over user-default sources
- unresolved `skills.include` names fail `bgng write` before mutation
- BGNG-owned stale downstream symlinks are cleaned up on write
- `doctor` remains report-only

Agent skills need these semantics baked into their procedures and user-facing
explanations.

## 4. What Still Holds From The Previous Design

Not everything in the old document should be thrown away.

### 4.1 The agentic wrapper thesis still holds

The CLI surface is broader and safer now, but also more complex. An agent skill
layer is still useful because it can:

- choose the right scope
- explain tradeoffs
- sequence safe previews
- stop for user approval at consequential edges

### 4.2 User-ask checkpoints remain correct

The earlier safety instinct was right. The cards-era layer should still ask at:

- scope changes
- card application or removal
- extension setup that runs external tools
- `write` after a non-trivial dry-run
- `--force` drift overwrite
- store migration

### 4.3 A separate repo can still make sense

A dedicated `beginning-harness-agent-skills` or similar repo is still a viable
distribution vehicle if the goal is portable skills for Claude Code / Codex /
Cursor. The repo structure just needs to wrap the current cards-era workflows,
not the old hierarchy-first ones.

## 5. Design Options For The Next Agent-Skill Layer

### Option A: Minimal patch over the old taxonomy

Keep the old names:

- `onboard`
- `organize`
- `provision`
- `checkup`
- `recommend`

Then patch their internals to use cards where possible.

Pros:

- minimal naming churn
- preserves the earlier conceptual story

Cons:

- keeps misleading names like `organize`
- forces cards, extensions, defaults, and diagnostics into a taxonomy that no
  longer matches the product
- bakes future `scan` expectations into today's interface

Verdict: not recommended.

### Option B: Hybrid split between present and future workflows

Treat current cards-era flows as the real MVP and preserve cross-project
organization as a future track.

Current skills:

- bootstrap current project
- apply/update cards
- author/publish cards
- inspect/repair harness state
- manage defaults
- recommend next harness action

Future or experimental skill:

- organize workspace

Pros:

- matches current CLI truth
- preserves room for the original "organize my projects" vision
- avoids pretending `scan` exists today

Cons:

- larger taxonomy than the old five-skill framing
- introduces an explicit future/experimental split

Verdict: recommended.

### Option C: Full cards-only rewrite

Drop the workspace-organizer idea entirely and define the agent layer strictly
around cards, overlays, extensions, and diagnostics.

Pros:

- maximum alignment with current CLI
- simplest implementation surface

Cons:

- loses the original differentiator around cross-project organization
- may undershoot the broader product ambition

Verdict: viable if the product has decisively moved away from organizer scope,
but less attractive if that larger ambition still matters.

## 6. Recommended Skill Taxonomy (V2)

Recommendation: use Option B.

That means the cards-era agentic skill layer should be split into "current live
wrappers" and "future organizer workflows."

### 6.1 Current live wrappers

| Skill | Purpose | Primary commands | Key checkpoints |
| --- | --- | --- | --- |
| `beginning:bootstrap-project` | Initialize one project, optionally enable extensions, optionally apply starter cards | `bgng init`, `bgng extensions add`, `bgng extensions setup`, `bgng apply`, `bgng write --dry-run`, `bgng write` | confirm project scope, extension choices, card refs, final write |
| `beginning:apply-harness-card` | Apply, update, pin, add, remove, detach, or inspect project cards | `bgng apply`, `bgng card add`, `bgng card pin`, `bgng card remove`, `bgng card update`, `bgng card outdated`, `bgng card status` | confirm card set change, confirm exact pin vs range, confirm write |
| `beginning:author-harness-card` | Create, publish, diff, inspect, and deprecate reusable cards | `bgng card new`, `bgng card publish`, `bgng card show`, `bgng card diff`, `bgng card deprecate` | confirm card name/scope, confirm publish, confirm deprecations |
| `beginning:inspect-harness` | Explain current state and provenance without mutation | `bgng status`, `bgng status --why`, `bgng status --explain`, `bgng doctor`, `bgng card status --explain`, `bgng store status` | usually no checkpoint; escalate only if repair is proposed |
| `beginning:repair-harness` | Guide safe repair of drift, missing generated files, or legacy state | `bgng doctor`, `bgng write --dry-run`, `bgng write`, `bgng write --force`, `bgng store migrate`, `bgng card update` | confirm migration, confirm force overwrite, confirm cleanup |
| `beginning:manage-defaults` | Manage machine-wide defaults and curated publication layer | `bgng library defaults add/remove ...`, `bgng skills curate`, `bgng skills uncurate`, `bgng library add ...`, `bgng write --dry-run` | confirm machine-wide scope, confirm curation and default activation |
| `beginning:recommend-harness` | Suggest cards, extensions, skills, and MCPs for the current project | `bgng search skill`, `bgng search mcp`, `bgng library list`, `bgng skills list`, `bgng extensions show`, `bgng card list` | no mutation by default; ask before converting recommendation into apply/add/write |

### 6.2 Future or experimental workflow

| Skill | Purpose | Status | Constraint |
| --- | --- | --- | --- |
| `beginning:organize-workspace` | Cross-project scan, categorization, and workspace-level organization | Future / experimental | must not claim to be powered by `bgng scan` until scan is real |

If this skill exists before `bgng scan` is implemented, its filesystem scanning,
recency heuristics, and symlink-tree behavior should be described as belonging
to the skill itself, not to the CLI.

## 7. Required Rewrites To The Previous Document

The previous design doc should be updated in these concrete ways:

### 7.1 Replace the product substrate section

Remove references to:

- `sync`
- meaningful `scan` classification behavior
- category-tree inheritance as if it already exists

Replace with:

- cards-era store
- project overlays
- machine defaults
- extensions
- downstream materialization
- diagnostics

### 7.2 Replace the MVP skill table

The old table is anchored on unsupported primitives.

It should be replaced with the cards-era taxonomy above, or at minimum split
into:

- current supported skills
- future organizer skills

### 7.3 Replace the directory layout section

The old `~/Documents/beginning-agent/<category>/...` tree should not be
described as the output of the current CLI.

The live layout that agent skills must understand is:

```text
~/.agents/bgng/
~/.agents/skills/
<project>/.agents/bgng/config.json
<project>/.agents/bgng/card.lock
<project>/.claude/
<project>/.codex/
<project>/.cursor/
```

### 7.4 Add scope-selection guidance

Every mutating skill needs to spell out whether it is operating on:

- machine defaults
- a project overlay
- a card source
- downstream materialized state

The old design does not do this cleanly enough.

### 7.5 Add explicit cards-era safety workflow

Every mutating skill should follow this shape:

1. inspect current state
2. determine scope
3. preview config mutation if available
4. run `bgng write --dry-run`
5. ask for approval
6. run the real mutation
7. verify with `status` and/or `doctor`

### 7.6 Add migration preflight

Card-touching skills should preflight:

- `bgng store status`
- legacy-layout detection
- `bgng store migrate` when needed

### 7.7 Add current failure contracts

The skill docs should explicitly teach agents that:

- unresolved included skills fail `bgng write`
- `doctor` is read-only
- `status --why` is the preferred provenance explainer
- `card outdated` on ranged specs refreshes the lock first
- `write --dry-run --json` reports pending mutations, not a full restatement of current state

## 8. Recommended Next Step

The right next design artifact is not a minor edit to the old PRD. It is a
cards-era rewrite with two lanes:

- `Lane 1`: current supported agent skills over cards, overlays, extensions,
  defaults, and diagnostics
- `Lane 2`: future cross-project organizer workflows that explicitly do not rely
  on the current placeholder `bgng scan`

That preserves the original product ambition without lying about the current CLI.

## 9. Open Design Questions

These questions should be resolved before drafting the final skill repo spec:

1. Is the cross-project organizer still part of the same product, or is it now a
   separate higher-level tool that merely uses `bgng` for per-project writes?
2. Should the first public agent-skill release support card authoring, or only
   card consumption and diagnostics?
3. Should extensions be exposed as their own skill, or folded into
   `bootstrap-project` and `recommend-harness`?
4. Should `recommend-harness` be allowed to output draft card manifests, or only
   suggestions plus command sequences?
5. Do we want a distinct machine-defaults skill, or should machine-default
   mutations remain an advanced path inside a broader provisioning skill?
