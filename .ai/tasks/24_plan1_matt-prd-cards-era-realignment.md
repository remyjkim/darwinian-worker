<!-- ABOUTME: Realignment memo + v2 PRD draft for Matt's Sprint 27 Beginning Harness agent-driven PRD -->
<!-- ABOUTME: Carries the v2 body that will be rendered into a new Notion subpage under Matt's existing PRD -->

# Task 24: Matt's PRD — Cards-era Realignment

**Status**: Completed
**Created**: 2026-05-26
**Updated**: 2026-05-26
**Assigned**: Claude + Remy
**Priority**: Medium
**Estimated Effort**: 1 session
**Dependencies**: analyses/38_bharness-agent-skills.md
**References**: [analyses/38_bharness-agent-skills.md, analyses/39_beginning-harness-prd-v2-cards-era.md, https://www.notion.so/curation-labs/Matt-Beginning-Harness-PRD-Agent-driven-framing-356f1fbef8c281c5b193c09754aeef59, https://www.notion.so/36df1fbef8c28154a802ebe69d8c21c5]
**Notion v2 page**: [\[Claude\] Beginning Harness PRD V2 — Cards-era framing](https://www.notion.so/36df1fbef8c28154a802ebe69d8c21c5) (subpage under Matt's v1)
**Plain-markdown v2**: `analyses/39_beginning-harness-prd-v2-cards-era.md`

---

## Objective

Realign Matt's Sprint 27 PRD (`[Matt] Beginning Harness PRD — Agent-driven framing`) to the cards-era reality of the `bgng` CLI, per the mentor analysis at `analyses/38_bharness-agent-skills.md`. Output a complete v2 PRD body and render it into a new Notion subpage under Matt's original — leaving Matt's v1 untouched as the historical record.

## Success Criteria

- [x] Local design doc captures rationale, section-by-section diff, and the full v2 PRD body in a single artifact.
- [x] New Notion subpage `[Claude] Beginning Harness PRD V2 — Cards-era framing` is created under Matt's v1 page (parent: `356f1fbef8c281c5b193c09754aeef59`).
- [x] V2 body adopts Option B (hybrid current + future lane) verbatim from analysis §6.1–6.2.
- [x] Hero customer walk-through is the cards-era "Add a harness to this repo" flow, with a 2-line future-lane tease for the cross-project organizer.
- [x] All references to the dead `sync` op, the placeholder-meaningful `bgng scan`, and the `~/Documents/beginning-agent/<category>/...` symlink tree are removed from the v2.
- [x] Open Questions section carries the 5 questions from analysis §9 — resolved in the Design Decisions update below; v2 PRD now shows decisions in place.
- [x] Plain-markdown counterpart published at `analyses/39_beginning-harness-prd-v2-cards-era.md`.
- [x] All five design questions resolved (see "Resolved Design Decisions" below); Q3 propagated to body edits in both `analyses/39_*` and the Notion page.

## Decision Summary

| Decision | Choice | Source |
|---|---|---|
| Deliverable shape | Drafted v2 content in a new Notion subpage (not editing v1) | Remy, this session |
| Rewrite aggression | Option B (hybrid: cards-era current lane + future organizer lane) | Mentor analysis §5, confirmed by Remy |
| Hero walk-through | Option (c) — current-lane "Add a harness to this repo" + 2-line future-lane tease | Remy, this session |
| Notion page placement | Subpage under Matt's v1 (option b) | Remy, this session |
| Page title | `[Claude] Beginning Harness PRD V2 — Cards-era framing` | Defaults to mirror Matt's `[Matt] ...` prefix |
| Repo distribution | Separate `beginning-agent-skills` repo preserved | Mentor analysis §4.3, retained from v1 |

## Approach

1. Write this design doc with the full v2 PRD body inline.
2. Use Notion MCP `notion-create-pages` to create the subpage under parent `356f1fbef8c281c5b193c09754aeef59`.
3. Render the v2 body Markdown into the new page.
4. Hand off to Remy for final review and propagation to Matt.

## Section-by-section Diff (v1 → v2)

| v1 Section | Action | What changes |
|---|---|---|
| TL;DR callout 🎯 | Rewrite | Replace "scan, categorize, configure dir hierarchy" with "cards-era local control plane: cards + overlays + machine defaults + extensions + downstream materialization, with user-ask checkpoints at consequential edges" |
| Value Prop — audience / profile | Light edit | Keep audience definition; reframe pain as *harness fragmentation across cards / projects / agents*, not just "organize 10+ repos" |
| Value Prop — customer scenario | Replace | New hero (c): "Add a harness to this repo" via `bootstrap-project` → extensions → starter card → dry-run → write. Plus 2-line future-lane tease |
| Differentiation 🥊 | Rewrite | New axes: reusable **cards** · **versioned consumption** (apply / pin / update / detach) · multi-agent materialization · provenance + diagnostics (`status --why`, `doctor`). Cross-project hierarchy → future lane |
| Narrative | Rewrite | Drop "atomic ops: `init / scan / add / sync / write`" (`sync` is gone, `scan` is a placeholder). Introduce the real layering model: built-in → library → machine defaults → applied cards → project overlay → downstream |
| Key design tension 💡 | Keep + tweak | Update consequential-risk examples to cards-era (wrong card application, wrong scope, wrong `--force`, mid-migration store) |
| Skills (MVP set) table | Full replacement | 7 current-lane skills + 1 future-lane skill, taxonomy verbatim from analysis §6.1–6.2 |
| Repo Structure — Hosting decision | Keep | Separate `beginning-agent-skills` repo still right |
| Repo Structure — repo tree | Update | Replace `skills/{onboard,organize,provision,checkup,recommend}/` with the 7 current-lane folders + `future/organize-workspace/` for visible lane split |
| User-side directory layout | Full replacement | Replace `~/Documents/beginning-agent/<category>/...` tree with `~/.agents/bgng/{machine.json,cards/...}`, `~/.agents/skills/`, `<project>/.agents/bgng/{config.json,card.lock}`, `<project>/{.claude,.codex,.cursor}/` |
| Inheritance lookup | Replace | Replace `user-dir → category → root` with `built-in → library → machine defaults → applied cards → project overlay → downstream`. Add three explicit contracts: cards win over user defaults · unresolved `skills.include` fails write · `doctor` is report-only |
| Constraints (MVP) 🔒 | Replace | Cards-era constraints: dry-run before every write · `store status` + `store migrate` preflight · explicit scope per mutation · `doctor` report-only · `~/Documents/projects/` untouched until future-lane ships |
| Future Implications | Update + extend | Preserve persona / Mindspace beats. Add `organize-workspace` as the bridge between current MVP and the cross-project ambition; note graduation criteria (real `bgng scan` ships, or skill owns enough scan logic) |
| Open Questions | Rewrite + extend | Drop recency-threshold and new-project-auto-watch (now future-lane concerns). Add the 5 from analysis §9 |

## Notes for Matt (consequential reframings to review)

1. **Customer scenario is rewritten.** The "organize my projects" hero walk-through moves into the future-lane. The new hero is "Add a harness to this repo" via `bootstrap-project`. If you want the organizer to stay as the hero, we need to either (a) accept the v2 makes claims the current CLI can't back, or (b) commit to shipping a real `bgng scan` before this PRD ships.
2. **`bgng scan` is a placeholder.** Today it's a no-op with `"implemented": false` in JSON mode. Any v2 skill that depends on classification or recency must own that logic itself.
3. **The MVP table is fully replaced, not patched.** Old taxonomy (`onboard / organize / provision / checkup / recommend`) doesn't survive — `organize` and `checkup` in particular don't map cleanly to the current substrate. New taxonomy comes verbatim from the mentor analysis.
4. **Lane split is visible at the repo level.** The repo tree now has a `future/` subdir for `organize-workspace`. This is deliberate — it tells future readers "this is not in the MVP distribution."
5. **Differentiation vs amtiYo shifted.** The old axes (cross-project hierarchy, recency) move into the future lane. The new axes are cards + versioned consumption + provenance + multi-agent — which match what `bgng` actually does today.

## Risks & Mitigation

- **Risk**: Matt disagrees with moving the organizer to the future lane and prefers Option A (minimal patch). **Mitigation**: This doc captures Option B's rationale citing analysis §5. If Matt pushes back, we can drop to Option A by re-instating the v1 hero and acknowledging the `scan` gap as a known limitation in Open Questions.
- **Risk**: The new Notion subpage gets buried under Matt's v1 and stays invisible to the sprint. **Mitigation**: Remy can re-parent it to Sprint 27 Home after review if Matt prefers a sibling placement.
- **Risk**: Mentor analysis itself is wrong about some CLI primitive (e.g., a command exists that the analysis missed). **Mitigation**: V2 cites `analyses/38_bharness-agent-skills.md` as its source of truth; corrections flow through that file first.

## Resolved Design Decisions

The five open questions seeded by mentor analysis §9 are now resolved. The decisions and their downstream effects on the v2 body are recorded here. The Notion page and `analyses/39_*` have been patched to reflect them.

| # | Question | Decision | Body impact |
|---|---|---|---|
| Q1 | Organizer scope — same product or separate tool? | **Separate higher-level tool, late-bound.** Future-lane callout stays as honest scoping; organizer spins out as its own product once there is market signal. | None (future-lane framing already aligned) |
| Q2 | MVP authoring — ship `author-harness-card`, or defer? | **Ships in MVP.** Full lifecycle (consumption + authoring + diagnostics) in the first public release; seed catalog authored via the skill itself. | None (`author-harness-card` already in MVP table) |
| Q3 | Extensions — standalone skill or folded? | **Folded across host skills.** `bootstrap-project` handles `extensions add` + `extensions setup`; `inspect-harness` handles `extensions status`; `repair-harness` handles `extensions doctor`. Promote to standalone if catalog grows past ~6–7 entries. | Added `extensions status` to `inspect-harness` row; added `extensions doctor` to `repair-harness` row |
| Q4 | `recommend-harness` output — draft manifests or suggestions only? | **Suggestions and command sequences only.** No draft card manifests. Output is prose + copy-paste-ready `bgng` commands. Preserves contract clarity that `recommend-harness` is the only strictly read-only skill. | None (table row already constrains output to "no mutation by default") |
| Q5 | Machine-defaults — distinct skill or folded? | **Distinct `beginning:manage-defaults` skill.** Machine-wide writes get their own skill, not a `--scope=machine` flag. Lower frequency of use is a feature: power-user operations deserve their own skill that signals "this is special." | None (already a distinct skill in v2 taxonomy) |

**Cross-cutting principle that emerged:** *Isolate by blast radius, fold by frequency.* Q3 and Q4 (low blast radius, low command volume) → fold or constrain. Q5 (high blast radius) → isolate. Q1 and Q2 sit outside this axis as product-positioning calls driven by job-to-be-done and launch narrative.

The v2 PRD's Open Questions section was replaced by a Design Decisions section carrying these resolutions in both `analyses/39_*` and the Notion page.

---

# V2 PRD Body (as-drafted snapshot)

Below is the initial v2 PRD draft, captured before the Design Decisions patch was applied. It is a historical snapshot only.

**Canonical sources for the live v2 PRD:**
- `analyses/39_beginning-harness-prd-v2-cards-era.md` (plain markdown, repo-canonical)
- [Notion v2 page](https://www.notion.so/36df1fbef8c28154a802ebe69d8c21c5) (rendered Notion-flavored markdown)

The snapshot below was rendered verbatim into the Notion subpage at creation time. Subsequent edits (Q3 body changes; Open Questions → Design Decisions section swap) live in the canonical sources, not here.

---

## TL;DR 🎯

> 🎯 **TL;DR** — Beginning Harness adds an agent-driven layer over the cards-era `bgng` CLI. LLM coding agents (Claude Code / Codex / Cursor) call skills to bootstrap projects, apply and author reusable **Harness Cards**, manage machine defaults, and inspect or repair harness state — with user-ask checkpoints at every consequential write. Cross-project workspace organization is preserved as a future lane.

## Value Proposition

- **Target audience**: developers using ≥2 coding agents (Claude Code / Codex / Cursor), juggling multiple repos, with non-trivial skill + MCP + card setup pain spanning projects.
- **Customer profile**: AI engineer who maintains harness state across many repos, can't keep cards / overlays / machine defaults / downstream materialization straight, and finds raw `bgng` mutation per project too high-friction.
- **Customer scenario (concrete walk-through) — "Add a harness to this repo":**
  1. User opens an existing repo in Claude Code: *"set up my harness here."*
  2. Agent calls `beginning:bootstrap-project` → runs `bgng status` to read the current state → asks user about scope (project-only, or also touching machine defaults) → asks about extensions (Parallel, Beads, MarkItDown, etc.).
  3. Agent runs `bgng card list` and `bgng search skill` to surface a relevant starter card → user approves a card to apply.
  4. Agent runs `bgng store status` to preflight migration, then `bgng apply <card>` and `bgng write --dry-run` → shows the pending mutations as JSON `changes`.
  5. User approves → agent runs `bgng write` → confirms with `bgng status --why`.
  6. *Where we're going:* if the user later says *"organize my projects"*, the future-lane `beginning:organize-workspace` skill handles cross-project categorization — owning its own filesystem scan until a real `bgng scan` ships.

> 🥊 **Differentiation vs amtiYo/agents (closest competitor)**
> - **amtiYo**: single-project scope · human-driven · no card reuse · no provenance · single-agent target
> - **BH**: cards-era multi-agent harness · agent-driven with user-ask checkpoints · reusable **Harness Cards** (`apply / pin / update / detach`) · provenance + diagnostics (`status --why`, `doctor`) · multi-agent materialization (Claude / Codex / Cursor) · future cross-project organizer lane

## Narrative

Harness fragmentation across Claude Code / Codex / Cursor is real, and the cards-era `bgng` CLI now solves the substrate well: **Harness Cards** as reusable presets, machine defaults, project overlays, extensions, and report-only diagnostics, all materialized into each agent's downstream directory (`.claude/`, `.codex/`, `.cursor/`). But the cards-era CLI is also broader and more nuanced than the old `init / add / write` mental model — and a raw-CLI workflow is still too high-friction for adoption.

The right move is an agent-driven layer that knows how to:

- pick the right **scope** (machine default vs project overlay vs card source vs downstream-only)
- **preview** before mutating (`bgng write --dry-run`)
- **explain provenance** (`bgng status --why`, `bgng card status --explain`)
- **preflight migration** (`bgng store status` + `store migrate`)
- **stop for user approval** at consequential edges

> 💡 **Key design tension** — Full automation introduces catastrophic risk (wrong card application, wrong scope, wrong `--force` overwrite, mid-migration store). The answer is a **user-ask checkpoint hybrid**: the agent operates autonomously where safe (inspection, dry-runs, recommendations) and asks the user where consequential (scope change, card apply / remove, write, force, migrate).

## Skills (MVP set) — Current lane

| Skill | Purpose | Primary `bgng` commands | Key checkpoints |
|---|---|---|---|
| `beginning:bootstrap-project` | Initialize one project; optionally enable extensions and apply starter cards | `bgng init` · `extensions add` · `extensions setup` · `apply` · `write --dry-run` · `write` | confirm project scope · extension choices · card refs · final write |
| `beginning:apply-harness-card` | Apply, update, pin, add, remove, detach, or inspect project cards | `apply` · `card add` · `card pin` · `card remove` · `card update` · `card outdated` · `card status` | confirm card set change · exact pin vs range · final write |
| `beginning:author-harness-card` | Create, publish, diff, inspect, and deprecate reusable cards | `card new` · `card publish` · `card show` · `card diff` · `card deprecate` | confirm card name / scope · publish · deprecations |
| `beginning:inspect-harness` | Explain current state and provenance without mutation | `status` · `status --why` · `status --explain` · `doctor` · `card status --explain` · `store status` | usually no checkpoint; escalate only if repair is proposed |
| `beginning:repair-harness` | Guide safe repair of drift, missing generated files, or legacy state | `doctor` · `write --dry-run` · `write` · `write --force` · `store migrate` · `card update` | confirm migration · force overwrite · cleanup |
| `beginning:manage-defaults` | Manage machine-wide defaults and curated publication layer | `library defaults add/remove` · `skills curate` · `skills uncurate` · `library add` · `write --dry-run` | confirm machine-wide scope · curation · default activation |
| `beginning:recommend-harness` | Suggest cards, extensions, skills, and MCPs for the current project | `search skill` · `search mcp` · `library list` · `skills list` · `extensions show` · `card list` | no mutation by default; ask before converting recommendation into apply / add / write |

### Future / experimental lane

| Skill | Purpose | Status | Constraint |
|---|---|---|---|
| `beginning:organize-workspace` | Cross-project scan, categorization, and workspace-level organization | Future / experimental | must not claim to be powered by `bgng scan` until `scan` is implemented; owns its own filesystem scan, recency heuristics, and symlink-tree behavior |

For each skill in the PRD: **Procedure** (numbered LLM steps) · **User-ask points** (where the agent halts) · **Wraps** (CLI calls) · **Scope** (machine / project / card source / downstream).

## Repo Structure

### Hosting decision

Ship as a separate `beginning-agent-skills` repo (mirroring the `parallel-agent-skills` pattern).
Distribution channels: `npx skills add` (Vercel CLI) · Claude Code Plugin Marketplace · Codex `$skill-installer`.

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

**Three contracts agent skills must respect:**

1. Applied card skill content wins over user-default sources — cards are authoritative once applied.
2. Unresolved `skills.include` names fail `bgng write` *before* mutation; surfacing them during dry-run is the agent's job.
3. `bgng doctor` is **report-only**. It never repairs. Repair belongs to `beginning:repair-harness` driving `bgng write` (and `store migrate` where needed).

> 🔒 **Constraints (MVP)**
> - Every mutating skill runs `bgng write --dry-run` and surfaces the JSON `changes` before asking the user to approve the real write.
> - Card-touching skills preflight with `bgng store status` and run `bgng store migrate` if a legacy layout is detected.
> - Every mutating skill names its **scope** explicitly: machine default · project overlay · card source · downstream-only.
> - `~/Documents/projects/` is untouched (no symlink tree, no moves) until the future-lane `organize-workspace` ships.

## Future Implications

- **Beginning Agents (cloud)**: scan + organize results sent to cloud → LLM analyzes the user's work pattern → MBTI persona → personalized card + skill recommendations.
- **Mindspace continuation**: each persona = its own `beginning-agent` profile (multi-Mind config sharing across team).
- **Cross-project organizer lane**: the original "organize my projects" ambition becomes a deliberate future track via `beginning:organize-workspace`. It graduates from experimental once either (a) a real `bgng scan` ships with classification + recency primitives, or (b) the skill itself owns enough scan logic to stand alone.
- **Moat**: progressive layering — config sync (amtiYo) → versioned cards + provenance → cross-project organizer → persona-aware.

## Open Questions

1. **Organizer scope** — Is the cross-project organizer still part of the same product, or is it now a separate higher-level tool that merely uses `bgng` for per-project writes?
2. **MVP authoring** — Should the first public agent-skill release support card authoring, or only card consumption + diagnostics?
3. **Extensions surfacing** — Should extensions be exposed as their own skill, or folded into `bootstrap-project` and `recommend-harness`?
4. **`recommend-harness` output shape** — Allowed to output draft card manifests, or only suggestions plus command sequences?
5. **Machine-defaults skill** — Distinct skill, or an advanced path inside a broader provisioning skill?
