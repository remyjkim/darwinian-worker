<!-- ABOUTME: Beginning Harness agent-driven PRD v2, realigned to the cards-era bgng CLI -->
<!-- ABOUTME: Plain-markdown counterpart of the Notion v2 page; mirrors content rendered there -->

# Beginning Harness PRD V2 — Cards-era framing

**Date**: 2026-05-26
**Author**: Claude + Remy
**Status**: In Review
**References**: [analyses/38_bharness-agent-skills.md, tasks/24_plan1_matt-prd-cards-era-realignment.md, https://www.notion.so/curation-labs/Matt-Beginning-Harness-PRD-Agent-driven-framing-356f1fbef8c281c5b193c09754aeef59, https://www.notion.so/36df1fbef8c28154a802ebe69d8c21c5]

---

## Executive Summary

Beginning Harness adds an agent-driven layer over the **cards-era** `bgng` CLI. LLM coding agents (Claude Code / Codex / Cursor) call skills to bootstrap projects, apply and author reusable **Harness Cards**, manage machine defaults, and inspect or repair harness state — with user-ask checkpoints at every consequential write. Cross-project workspace organization is preserved as a **future lane**.

This document is the v2 of Matt's Sprint 27 PRD, realigned to the cards-era `bgng` CLI per `analyses/38_bharness-agent-skills.md` (verdict: v1 is `SIGNIFICANTLY_OUTDATED`). It adopts Option B (hybrid current + future lane) from analysis §5.

## Context

The original PRD framed Beginning Harness around a pre-cards mental model: `init / scan / add / sync / write` atomic ops, a `~/Documents/beginning-agent/<category>/...` symlink hierarchy as the user-visible output, and a five-skill MVP (`onboard / organize / provision / checkup / recommend`) where `organize` leans on a meaningful `bgng scan`.

The current product shape is different. `sync` is gone, `scan` is intentionally a no-op placeholder with `"implemented": false` in JSON mode, cards and diagnostics are first-class, and the real layering is machine defaults → applied cards → project overlay → downstream materialization. The v2 below restates the PRD on that substrate while preserving Matt's original cross-project ambition as a deliberate future track.

## Value Proposition

- **Target audience**: developers using ≥2 coding agents (Claude Code / Codex / Cursor), juggling multiple repos, with non-trivial skill + MCP + card setup pain spanning projects.
- **Customer profile**: AI engineer who maintains harness state across many repos, can't keep cards / overlays / machine defaults / downstream materialization straight, and finds raw `bgng` mutation per project too high-friction.
- **Customer scenario (concrete walk-through) — "Add a harness to this repo"**:
  1. User opens an existing repo in Claude Code: *"set up my harness here."*
  2. Agent calls `beginning:bootstrap-project` → runs `bgng status` to read current state → asks user about **scope** (project-only, or also machine defaults) → asks about extensions (Parallel, Beads, MarkItDown, etc.).
  3. Agent runs `bgng card list` and `bgng search skill` to surface a relevant starter card → user approves a card to apply.
  4. Agent runs `bgng store status` to preflight migration, then `bgng apply <card>` and `bgng write --dry-run` → shows the pending mutations as JSON `changes`.
  5. User approves → agent runs `bgng write` → confirms with `bgng status --why`.
  6. *Where we're going*: if the user later says *"organize my projects"*, the **future-lane** `beginning:organize-workspace` skill handles cross-project categorization — owning its own filesystem scan until a real `bgng scan` ships.

### Differentiation vs amtiYo/agents (closest competitor)

- **amtiYo**: single-project scope · human-driven · no card reuse · no provenance · single-agent target
- **BH**: cards-era multi-agent harness · agent-driven with user-ask checkpoints · reusable **Harness Cards** (`apply / pin / update / detach`) · provenance + diagnostics (`status --why`, `doctor`) · multi-agent materialization (Claude / Codex / Cursor) · **future** cross-project organizer lane

## Narrative

Harness fragmentation across Claude Code / Codex / Cursor is real, and the cards-era `bgng` CLI now solves the substrate well: **Harness Cards** as reusable presets, machine defaults, project overlays, extensions, and report-only diagnostics, all materialized into each agent's downstream directory (`.claude/`, `.codex/`, `.cursor/`). But the cards-era CLI is also broader and more nuanced than the old `init / add / write` mental model — and a raw-CLI workflow is still too high-friction for adoption.

The right move is an agent-driven layer that knows how to:

- pick the right **scope** (machine default vs project overlay vs card source vs downstream-only)
- **preview** before mutating (`bgng write --dry-run`)
- **explain provenance** (`bgng status --why`, `bgng card status --explain`)
- **preflight migration** (`bgng store status` + `store migrate`)
- **stop for user approval** at consequential edges

### Key design tension

Full automation introduces catastrophic risk (wrong card application, wrong scope, wrong `--force` overwrite, mid-migration store). The answer is a **user-ask checkpoint hybrid**: the agent operates autonomously where safe (inspection, dry-runs, recommendations) and asks the user where consequential (scope change, card apply / remove, write, force, migrate).

## Skills (MVP set) — Current lane

| Skill | Purpose | Primary `bgng` commands | Key checkpoints |
|---|---|---|---|
| `beginning:bootstrap-project` | Initialize one project; optionally enable extensions and apply starter cards | `bgng init` · `extensions add` · `extensions setup` · `apply` · `write --dry-run` · `write` | confirm project scope · extension choices · card refs · final write |
| `beginning:apply-harness-card` | Apply, update, pin, add, remove, detach, or inspect project cards | `apply` · `card add` · `card pin` · `card remove` · `card update` · `card outdated` · `card status` | confirm card set change · exact pin vs range · final write |
| `beginning:author-harness-card` | Create, publish, diff, inspect, and deprecate reusable cards | `card new` · `card publish` · `card show` · `card diff` · `card deprecate` | confirm card name / scope · publish · deprecations |
| `beginning:inspect-harness` | Explain current state and provenance without mutation | `status` · `status --why` · `status --explain` · `doctor` · `card status --explain` · `extensions status` · `store status` | usually no checkpoint; escalate only if repair is proposed |
| `beginning:repair-harness` | Guide safe repair of drift, missing generated files, or legacy state | `doctor` · `extensions doctor` · `write --dry-run` · `write` · `write --force` · `store migrate` · `card update` | confirm migration · force overwrite · cleanup |
| `beginning:manage-defaults` | Manage machine-wide defaults and curated publication layer | `library defaults add/remove` · `skills curate` · `skills uncurate` · `library add` · `write --dry-run` | confirm machine-wide scope · curation · default activation |
| `beginning:recommend-harness` | Suggest cards, extensions, skills, and MCPs for the current project | `search skill` · `search mcp` · `library list` · `skills list` · `extensions show` · `card list` | no mutation by default; ask before converting recommendation into apply / add / write |

### Future / experimental lane

| Skill | Purpose | Status | Constraint |
|---|---|---|---|
| `beginning:organize-workspace` | Cross-project scan, categorization, and workspace-level organization | Future / experimental | must not claim to be powered by `bgng scan` until `scan` is implemented; owns its own filesystem scan, recency heuristics, and symlink-tree behavior |

For each skill in the PRD: **Procedure** (numbered LLM steps) · **User-ask points** (where the agent halts) · **Wraps** (CLI calls) · **Scope** (machine / project / card source / downstream).

## Repo Structure

### Hosting decision

Ship as a separate `beginning-agent-skills` repo (mirroring the `parallel-agent-skills` pattern). Distribution channels: `npx skills add` (Vercel CLI) · Claude Code Plugin Marketplace · Codex `$skill-installer`.

```
beginning-agent-skills/
├── .claude-plugin/
├── .codex-plugin/
├── skills/
│   ├── bootstrap-project/SKILL.md
│   ├── apply-harness-card/SKILL.md
│   ├── author-harness-card/SKILL.md
│   ├── inspect-harness/SKILL.md
│   ├── repair-harness/SKILL.md
│   ├── manage-defaults/SKILL.md
│   └── recommend-harness/SKILL.md
├── future/
│   └── organize-workspace/SKILL.md       ← lane split; not in MVP distribution
└── README.md
```

### User-side filesystem layout (output of the cards-era CLI)

The output is no longer a `~/Documents/beginning-agent/<category>/...` symlink tree. The live layout that agent skills must understand:

```
~/.agents/bgng/                              ← machine-wide store
├── machine.json                             ← machine defaults
├── cards/<id>/<version>/                    ← immutable published cards
└── ...
~/.agents/skills/                            ← curated publication layer

<project>/.agents/bgng/
├── config.json                              ← per-project overlay
└── card.lock                                ← versioned card consumption
<project>/.claude/                           ← downstream materialization
<project>/.codex/
<project>/.cursor/
```

### Precedence (layering model)

Effective configuration is resolved by walking this chain (most-specific wins):

```
built-in defaults
  → local library
    → machine defaults
      → applied cards
        → project overlay
          → downstream generated state
```

Three contracts agent skills must respect:

1. Applied card skill content **wins over** user-default sources — cards are authoritative once applied.
2. Unresolved `skills.include` names **fail `bgng write` before mutation**; surfacing them during dry-run is the agent's job.
3. `bgng doctor` is **report-only**. It never repairs. Repair belongs to `beginning:repair-harness` driving `bgng write` (and `store migrate` where needed).

### Constraints (MVP)

- Every mutating skill runs `bgng write --dry-run` and surfaces the JSON `changes` before asking the user to approve the real write.
- Card-touching skills preflight with `bgng store status` and run `bgng store migrate` if a legacy layout is detected.
- Every mutating skill names its **scope** explicitly: machine default · project overlay · card source · downstream-only.
- `~/Documents/projects/` is untouched (no symlink tree, no moves) until the future-lane `organize-workspace` ships.

## Future Implications

- **Beginning Agents (cloud)**: scan + organize results sent to cloud → LLM analyzes the user's work pattern → MBTI persona → personalized card + skill recommendations.
- **Mindspace continuation**: each persona = its own `beginning-agent` profile (multi-Mind config sharing across team).
- **Cross-project organizer lane**: the original *"organize my projects"* ambition becomes a deliberate future track via `beginning:organize-workspace`. It graduates from experimental once either (a) a real `bgng scan` ships with classification + recency primitives, or (b) the skill itself owns enough scan logic to stand alone.
- **Moat**: progressive layering — config sync (amtiYo) → versioned cards + provenance → cross-project organizer → persona-aware.

## Design Decisions

The five design questions tracked during PRD v2 review are now resolved. Each entry records the question, the chosen option, and the rationale.

1. **Q1 — Organizer scope.** *Decision:* separate higher-level tool, late-bound. The cross-project organizer is a different job-to-be-done from the per-repo harness. The future-lane callout in this PRD stays as honest scoping, but the organizer will spin out as its own product once there is market signal for the workspace-management scenario. Until then no cross-product coupling beyond `bgng`-as-stable-dependency.
   *Why:* the two jobs are distinct enough that one brand carries the wrong cost — skill repo bloat, perpetual "future" status, and coupling the cards-era release cadence to a layer `bgng` may never implement.

2. **Q2 — MVP authoring.** *Decision:* `beginning:author-harness-card` ships in MVP alongside consumption and diagnostics. The seed card catalog is authored via the skill itself rather than via raw `bgng card new`.
   *Why:* full-lifecycle launch is a stronger narrative; early adopters can publish and share cards to seed the ecosystem; the lifecycle is more legible to users when all of it ships at once.

3. **Q3 — Extensions surfacing.** *Decision:* folded across host skills (no standalone extensions skill). Lifecycle phases land in their natural host — `bootstrap-project` handles `extensions add` + `extensions setup`; `inspect-harness` handles `extensions status`; `repair-harness` handles `extensions doctor`.
   *Why:* a 4-command surface does not justify an 8th skill when the taxonomy is already at 7. Promote extensions to a standalone skill if the extension catalog grows past ~6–7 entries and cross-skill duplication becomes painful.

4. **Q4 — `recommend-harness` output shape.** *Decision:* suggestions and command sequences only. No draft card manifests. Output is strictly prose recommendations plus copy-paste-ready `bgng` command sequences (including `bgng card new` invocations when a user wants to start a card from a recommendation).
   *Why:* contract clarity. `recommend-harness` is the only strictly read-only skill in the taxonomy, and that property is load-bearing for agent reasoning. Mixing in draft-manifest generation blurs the boundary between advisory and mutating skills.

5. **Q5 — Machine-defaults skill.** *Decision:* distinct `beginning:manage-defaults` skill (no folding into a unified provisioning skill). Machine-wide writes get their own skill, not a `--scope=machine` flag.
   *Why:* machine-wide changes are the highest-blast-radius operation in the system. Isolating the skill prompt forces explicit scope choice and prevents scope-leak between project and machine writes. Lower frequency of use is a feature here, not a bug — power-user operations deserve their own skill that signals "this is special."

### Cross-cutting principle

**Isolate by blast radius, fold by frequency.**

- Q3 (extensions folded) and Q4 (recommend stays advisory) — low blast radius and low command volume: fold or constrain.
- Q5 (defaults isolated) — high blast radius: isolate, even at a small frequency cost.
- Q1 (organizer separate, late-bound) and Q2 (authoring in MVP) — product-positioning calls driven by job-to-be-done and launch narrative rather than blast radius alone.

## Reviewer Notes (consequential reframings vs v1)

1. **Hero scenario was rewritten.** v1's *"organize my projects"* walk-through moves into the future lane. The new hero is *"add a harness to this repo"* via `bootstrap-project`. If we want the organizer to remain the hero, we either accept v2 claims the current CLI can't back, or commit to shipping a real `bgng scan` before this PRD ships.
2. **`bgng scan` is a placeholder.** Today it's a no-op with `"implemented": false` in JSON mode. Any v2 skill that depends on classification or recency must own that logic itself.
3. **MVP skill table fully replaced.** Old taxonomy (`onboard / organize / provision / checkup / recommend`) doesn't survive — `organize` and `checkup` don't map cleanly to the current substrate. New taxonomy comes verbatim from analysis §6.1–6.2.
4. **Lane split is visible at the repo level.** The repo tree has a `future/` subdir for `organize-workspace` — deliberate signaling that it's not in the MVP distribution.
5. **Differentiation axes shifted.** Old axes (cross-project hierarchy, recency) move into the future lane. New axes (cards, versioned consumption, provenance, multi-agent) match what `bgng` actually does today.

## Appendix — Companion artifacts

- `analyses/38_bharness-agent-skills.md` — the mentor's gap analysis that this PRD realigns against.
- `tasks/24_plan1_matt-prd-cards-era-realignment.md` — the local planning + diff-table memo, with the v1→v2 section-by-section change log.
- Notion v1 (Matt's original): https://www.notion.so/curation-labs/Matt-Beginning-Harness-PRD-Agent-driven-framing-356f1fbef8c281c5b193c09754aeef59
- Notion v2 (this content rendered): https://www.notion.so/36df1fbef8c28154a802ebe69d8c21c5
