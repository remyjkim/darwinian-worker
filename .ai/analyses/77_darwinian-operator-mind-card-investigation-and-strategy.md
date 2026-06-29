# ABOUTME: Investigation + strategy for Option C — standing up a separate richer mind card alongside the tools-only harness-skills card.
# ABOUTME: Defines content design, distribution, visibility model, activation strategy, and a phased plan grounded in the post-mind-card codebase.

# Analysis 77 — Darwinian Operator Mind Card: Investigation and Strategy

**Date**: 2026-06-26
**Updated**: 2026-06-26 — all open questions ratified; ready for implementation
**Author**: Claude + Remy
**Status**: Approved — proceed to Phase 1
**References**: [.ai/analyses/74_canonical-mind-card-target-architecture.md, .ai/analyses/75_mind-card-activation-defaults-and-stack-composition.md, .ai/analyses/76_knowledge-docs-audit-post-mind-card.md, .ai/tasks/53_canonical-mind-card-implementation-plan.md, .ai/tasks/56_mind-card-activation-and-composition-implementation-plan.md, cli/core/card-manifest.ts, cli/core/card-source.ts, cli/commands/card/source/{add-persona,add-belief,add-memory}.ts, cli/commands/mind/{use,list,clear}.ts, /Users/pureicis/dev/darwinian-harness-skills/cards/]

---

## Executive Summary

Stand up `@darwinian/base-mind@0.1.0` — a new card that exercises the canonical mind card model with persona, beliefs, and a focused mind-family skill set. Keep `@darwinian/harness-skills@0.2.0` as the tools-only setup card. Host both inside the existing skills repo, which is being renamed `darwinian-minds-skills` (plural, consistent with the `dminds` binary).

The mind card model is fully implemented and tested (per `test/commands-card-source-mind-content.test.ts`, `test/core-sync-mind.test.ts`, `test/scenarios-mind-card-pr1-bash.test.ts`, etc.). All `card source add-persona|add-belief|add-memory` and `drwn mind list|use|clear` commands ship today.

## Ratified Decisions (2026-06-26)

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | **Card name: `@darwinian/base-mind`** | "BaseMind" — positions as the foundational mind that other minds layer atop. Kebab-case enforced by `card-manifest.ts:54-59`. |
| 2 | **Repo: existing `darwinian-harness-skills`, renamed to `darwinian-minds-skills`** | Plural matches the `dminds` binary and the multi-card reality (harness-skills + workspace-experimental + base-mind). Avoids standing up a new repo. |
| 3 | **Visibility: `public` for persona + beliefs** | Card is meant for broad distribution; persona/beliefs are open-source operating principles, not proprietary. |
| 4 | **Skill ownership: additive-only** | Three new skills (`manage-active-mind-stack`, `author-mind-content`, `audit-mind-visibility`); harness-skills untouched. Revisit migration after dogfooding. |
| 5 | **Memory in v1: section absent** | No `memory` field in `card.json`. Memory accumulates from running the mind, not from authoring. |
| 6 | **Hooks in v1: none** | Card stays content-driven. No `hooks` field. Hook subsystem itself is young (<2 months); validate base-mind content first. |
| 7 | **First version: `0.1.0`, `stability: experimental`, with public 1.0.0 roadmap** | Honest signal; consumers self-select. README documents graduation criteria. |
| 8 | **Persona body: shortened to ~60 words** | Stack-order concatenation means brevity composes better. Concrete examples move to skill bodies. |
| 9 | **Beliefs: three entries** (`explicit-activation`, `visibility-discipline`, `layered-minds`) | Minimal, model-level principles; slow-changing. Behavior-level guidance lives in the persona, not beliefs. |
| 10 | **Card description: hint at composition without naming a sibling** | Description says "designed to compose with other Darwinian mind cards; see README for recommended stacks." README carries the specifics. |

---

## Context

### What landed in the codebase

Per commits since I last had context (range from `5426821` through `15a617a`):

| Concept | Commit | Status |
| --- | --- | --- |
| Loose skill import (analysis 67) | `020614c feat(cli): support loose local skill imports` | Shipped |
| Darwinian-mind rebrand (task 52) | PR #19 merged at `ad80e82` | Shipped |
| Canonical mind content model (task 53 PR1) | `a6edcb2 feat(cards): add canonical mind content model` | Shipped |
| Per-mind materialization (task 53 PR2) | `23dcb26 feat(minds): materialize active mind stacks` | Shipped |
| Activation defaults + stack composition (task 56) | `3b82402 feat(minds): compose default active stacks` | Shipped |
| Conditional Claude hook ownership (task 54) | `a68f302 fix(hooks): preserve foreign Claude hook entries` | Shipped |
| Session signal hooks (task 55) | `67e3d5b feat(hooks): materialize session signal hooks` | Shipped |

All architectural shifts from analyses 74 + 75 are now in `main`.

### What the mind card model gives us today

Per `cli/core/card-manifest.ts:28-47`:

```ts
export interface CardManifest {
  name: string;
  version: string;
  skills?:  { include?: string[]; ... };
  hooks?:   { include?: string[]; ... };
  servers?: Record<string, ServerOverride>;
  persona?: PersonaManifest;          // <new>
  beliefs?: BeliefsManifest;          // <new>
  memory?:  MemoryManifest;           // <new — L4/L5/L6, per-layer visibility + format>
  // ...
}
```

- **`persona` / `beliefs`**: required `visibility ∈ {private, internal, public}` per section with non-empty `include`. Validated at `card-manifest.ts:75-117`.
- **`memory.l4|l5|l6`**: same visibility model + `format ∈ {md, jsonl, mixed}` per layer.
- **Authoring commands** (per `cli/commands/card/source/`): `add-persona <card> <entry> --visibility <v>`, `add-belief <card> <entry> --visibility <v>`, `add-memory <card> <entry> --layer l4|l5|l6 --visibility <v> --format <f>`. All three require `--visibility` explicitly — no default.
- **Source layout** (per `card-source.ts:558-674`): `persona/<entry>/PERSONA.md`, `beliefs/<entry>/BELIEF.md`, `memory/<layer>/<entry>/…`.
- **Activation** (per `cli/commands/mind/use.ts`): `drwn mind use @scope/foo @scope/bar` sets `activeMinds` in project config. Default (absent) = all installed cards active. Empty `[]` (`drwn mind clear`) = none active.
- **Materialization** (per analysis 75): two outputs — `.agents/drwn/generated/minds/<scope>/<name>/` per-mind isolated bundles, and `.agents/drwn/generated/mind/` composed active-stack view (CCH mount target).
- **Visibility push gate** (per `cli/core/visibility.ts`): `drwn card push` refuses pushing a strictest-visibility mind to a less-restrictive remote unless `--remote-visibility=<v>` or `--unsafe-push-public` is set.

### What's still tools-only

`@darwinian/harness-skills@0.2.0` — the card we're keeping in this role — carries:
- 14 skills (the original 12 + `sync-card-skills` + `import-mcp-from-claude`)
- `servers: {}` (no MCPs)
- No `persona`, no `beliefs`, no `memory`

Per the canonical mind card model, this is a **valid mind card** (tools-only mind). No change required to keep it operating in the new world.

---

## Goal

Build `@darwinian/base-mind` — a card that demonstrates and ships the richer side of the canonical mind card model:

- A **persona** for "the drwn operator mind" — concise voice + values that frame how this mind helps you operate drwn.
- A small set of **beliefs** — explicit, opinionated guidance about how to think about cards, minds, and drwn workflows. These are not feature documentation; they are operating principles.
- A **focused skill set** covering the mind family — activation, mind-content authoring, visibility audits, drift detection on `activeMinds` state.
- **No initial memory entries** — `memory.l4/l5/l6` reserved but empty in v1. Memory accumulates with use; we don't pre-seed it.
- **No MCPs in v1** — keep the card content-driven.
- **No hooks in v1** — the active-stack hook composer (task 53) already wires whatever's there; we don't add policy hooks until there's a real need.

The card is meant to be **layered on top of** other minds: a developer running drwn would typically activate `[base-mind, their-domain-mind]` or just `[base-mind]` for a vanilla "drwn-aware Claude" experience.

---

## Recommended Design

### Card identity

| Field | Value | Rationale |
| --- | --- | --- |
| Name | `@darwinian/base-mind` | Suffix `-mind` matches the renamed unit in the architecture (see `dm-card-base-fixture.ts` which uses `apply-mind-card`/`author-mind-card` naming). `operator-` names the role. |
| Initial version | `0.1.0` | Mirrors `@darwinian/harness-skills@0.1.0`'s lineage — pre-1.0 signals "evolving as we dogfood the canonical mind card model." Bump to `1.0.0` after first external dogfood pass. |
| Stability | `experimental` | The mind content model is itself young; signals to consumers. |
| Harness min version | The minimum drwn version that ships canonical mind cards | TBD: read from `package.json` at authoring time. |

### Repo location: inside `darwinian-harness-skills`

Recommended layout (mirrors `cards/harness-skills/` + `cards/workspace-experimental/`):

```
darwinian-harness-skills/
├── cards/
│   ├── harness-skills/        # unchanged tools-only stable card
│   ├── workspace-experimental/# unchanged stub
│   └── base-mind/         # NEW
│       ├── card.json
│       ├── persona/
│       │   └── voice/PERSONA.md
│       ├── beliefs/
│       │   ├── explicit-activation/BELIEF.md
│       │   ├── visibility-discipline/BELIEF.md
│       │   └── layered-minds/BELIEF.md
│       └── skills/
│           ├── manage-active-mind-stack/SKILL.md
│           ├── author-mind-content/SKILL.md
│           └── audit-mind-visibility/SKILL.md
└── skills/
    ├── … existing 14 canonical skills …
    ├── manage-active-mind-stack/SKILL.md     # canonical source
    ├── author-mind-content/SKILL.md
    └── audit-mind-visibility/SKILL.md
```

The new skills' canonical sources live under top-level `skills/` (per the existing repo convention). The `sync-card-skills` script will need updating to copy them into `cards/base-mind/skills/` (and not into `harness-skills/skills/` — they belong to base-mind only).

**Why not a new repo?** Standing up a separate GitHub repo means: new admin (permissions, CI, release process), a new namespace to establish, a new distribution channel to advertise. Inside the existing repo we inherit all of that for free. The cost is conceptual coupling — three cards published from one repo — but that coupling already exists (harness-skills + workspace-experimental). Adding a third doesn't change the shape.

### Persona content

One persona entry, `voice`, with `visibility: internal`. Concise — the runtime concatenates it with other minds' persona content in stack order; brevity matters when layered.

Proposed body (`persona/voice/PERSONA.md`) — ratified ~60-word version:

```markdown
# voice — the BaseMind

I am the BaseMind — I help you author, install, and activate Darwinian
Mind Cards across Claude Code, Codex, and Cursor.

I read state before writing. I preview with `--dry-run` when supported.
I name the scope I'm touching — project, machine, card, or active stack.
I never push or publish without your explicit go-ahead. When uncertain,
I read the command help rather than guess.
```

Concrete examples of how the principles play out live in the individual skill bodies (Appendix C), where they belong — the persona stays brief so it composes cleanly when stacked with other minds.

### Beliefs content

Three belief entries, all `visibility: internal`. Each is a short, opinionated principle — not a tutorial.

**`beliefs/explicit-activation/BELIEF.md`:**

```markdown
# explicit-activation

Composition of minds is explicit-at-activation, not implicit-at-install.

`drwn mind use` is the contract. Installed-but-unused cards stay
materialized as isolated bundles under `.agents/drwn/generated/minds/`,
but the IDE projection (`.claude`/`.codex`/`.cursor`) only reflects the
active stack.

The single retired behavior from the harness-cards era is unconditional
cross-card merging into the project surface. Don't try to bring it back
through scripts or workarounds; the model is intentional.

When in doubt, run `drwn mind list` and read the active stack before
reasoning about what's reaching the IDE.
```

**`beliefs/visibility-discipline/BELIEF.md`:**

```markdown
# visibility-discipline

Every persona/beliefs/memory section with a non-empty `include`
**must** declare `visibility ∈ {private, internal, public}`. There is
no default — explicitness is load-bearing for the push gate.

- `private` — never push to network remotes without `--unsafe-push-public`
  (and even then, think twice).
- `internal` — fine to push to network remotes you control or to
  organizations you trust. The default for collaboration.
- `public` — safe to expose in agent output to arbitrary parties.

When authoring a card that ships richer content, choose the strictest
visibility that fits the use case. The push gate will surface a wrong
choice loudly; better to catch it at authoring.
```

**`beliefs/layered-minds/BELIEF.md`:**

```markdown
# layered-minds

A project hosts N minds. They run independently or layered as an ordered
stack via `drwn mind use a b c`. Stack order is precedence — later layers
win on tools, beliefs/memory union with provenance, persona concatenates
in stack order.

A single mind is the degenerate one-element stack — the same code path
serves both. Reach for layering when you have orthogonal concerns
(base-mind + a domain-specialist mind, for example); reach for a
single mind when one card covers the whole job.

The runtime sees `.agents/drwn/generated/mind/` — the composed view of
the active stack. The per-mind isolated bundles under
`.agents/drwn/generated/minds/` are the catalog, not the mount target.
```

### Memory content

None in v1. Reserve the manifest layers as absent (not empty arrays — absent means "this mind does not declare any memory" in the current schema).

Future: a `memory.l4` entry could accumulate reflections from running the base-mind in real projects (e.g., "what works for first-time users," "what surprises people about the visibility model"). That's a v0.2 or v1.0 addition once we have signal.

### Skills

Three new skills, canonical sources under `darwinian-harness-skills/skills/`, bundled into `cards/base-mind/`. Each follows the same SKILL.md shape as the existing 14 (frontmatter `name` + `description`, body with Determine-arguments preamble, Directive steps, Output, Notes).

**`manage-active-mind-stack`** — wraps `drwn mind list`, `drwn mind use`, `drwn mind clear`. Triggers on `/manage-active-mind-stack`, `what minds are active`, `switch minds`, `clear my mind stack`. Steps: list installed → show current stack → ask user what to change → preview the projection diff via `drwn write --dry-run` → run the mind command → `drwn write`.

**`author-mind-content`** — wraps `drwn card source add-persona|add-belief|add-memory` (+ removes). Triggers on `/author-mind-content`, `add persona to my card`, `scaffold beliefs`, `set up memory layers`. Walks the user through visibility selection (with the visibility-discipline belief as a reference), format choice for memory, and the byte-equal invariant between `card.json` and the bundled files.

**`audit-mind-visibility`** — read-only inspection. Walks every installed mind's per-section visibility, classifies against the active push remote (if any), surfaces "this card's strictest visibility is `private` but the configured remote is public — pushing will fail." Wraps `drwn card status --json`, `drwn card show --json`, and inspects card sources for visibility consistency. Triggers on `/audit-mind-visibility`, `is my mind safe to push`, `what's the visibility on my cards`.

### MCPs

None. The card stays content-driven for v1. If we want Notion-aware operator behavior, we'd layer `[base-mind, @darwinian/notion-mind]` rather than fattening this card.

### Hooks

None. Per task 53's design, hooks are policy modules that intercept tool calls. The base-mind doesn't need to intercept anything — it's content + skills. Adding hooks would couple this card to the runtime hook ABI and complicate the visibility analysis. Deferred unless a real use case appears.

---

## Distribution

### Versioning

`0.1.0` initial. Subsequent releases follow semver against structural changes per the existing card publish guardrail (`cli/core/card-publish-guardrail.ts`):

- Patch (`0.1.1`): bug fixes to skill bodies, persona/belief wording tweaks.
- Minor (`0.2.0`): adding a skill, adding a belief entry, adding a memory layer.
- Major (`1.0.0`): removing or renaming a skill/persona/belief entry; changing visibility from less-strict to more-strict on an existing section.

### Release flow (mirrors existing repo conventions)

```bash
cd /Users/pureicis/dev/darwinian-harness-skills

# 1. Author canonical sources.
vim skills/manage-active-mind-stack/SKILL.md
vim skills/author-mind-content/SKILL.md
vim skills/audit-mind-visibility/SKILL.md

# 2. Author card-bundled content (persona, beliefs, card.json).
mkdir -p cards/base-mind/{persona/voice,beliefs/explicit-activation,beliefs/visibility-discipline,beliefs/layered-minds}
vim cards/base-mind/persona/voice/PERSONA.md
vim cards/base-mind/beliefs/*/BELIEF.md
vim cards/base-mind/card.json     # manifest

# 3. Extend the sync script.
vim scripts/sync-card-skills.mjs    # add base-mind entry to cardMaps

# 4. Sync + validate.
npm run sync:cards
npm run validate:skills

# 5. Bump VERSION + package.json + bundle.json if those are repo-wide;
#    leave cards/base-mind/card.json at its own version (0.1.0).

# 6. Commit, push, run the repo's release process.
```

### Visibility model decision

| Section | Visibility | Reason |
| --- | --- | --- |
| `persona.voice` | `internal` | Safe to share with collaborators / push to org remote; not a public statement. |
| `beliefs.*` | `internal` | Same as persona — opinionated principles, fine in agent context, not promotional. |
| `memory.*` | (absent in v1) | n/a — no entries shipped. |

The skill files themselves don't carry visibility (they're `skills.include` entries, not content sections). No push gate impact from skills.

### Push remote consideration

If the card is hosted in the existing `darwinian-harness-skills` repo (recommended), the existing push pipeline does **not** invoke `drwn card push` — it uses the repo's own `npm publish` + plugin marketplace push. So the visibility push-gate doesn't directly fire at release time. **But** if a consumer later runs `drwn card push @darwinian/base-mind <remote>` against a personal fork, the gate fires there. `internal` visibility means they'd succeed pushing to network remotes they classify as `internal`; pushing to a public remote requires the explicit `--unsafe-push-public` or `--remote-visibility=public` flag.

---

## Activation Strategy + Interplay with harness-skills

The two cards serve different needs and should compose:

```
Scenario                                       Recommended active stack
---------------------------------------------- -------------------------------------------
First-time drwn user on a fresh project        [@darwinian/base-mind]
Existing drwn user with a domain-specific card [@darwinian/base-mind, @scope/domain]
Pure setup / maintenance project               [@darwinian/harness-skills]
Power user / hybrid                            [@darwinian/base-mind,
                                                @darwinian/harness-skills,
                                                @scope/domain]
```

Per the active-stack precedence rule (analysis 74, "last layer wins" on tools): if both cards declare a skill with the same name (none today; could happen if we later promote a skill), the later layer wins. So putting `base-mind` first and `harness-skills` second means harness-skills' skills override on conflict. Consumers can flip this order if they prefer.

`drwn mind list` should surface this composition clearly. Worth a small UX check during smoke testing — does `mind list` render multi-mind stacks readably?

---

## Implementation Plan (Phased)

### Phase 0 — Ratify scope with Remy

- [ ] Card name `@darwinian/base-mind` vs alternatives.
- [ ] Repo location (existing `darwinian-harness-skills` vs new repo).
- [ ] Visibility level (`internal` for persona + beliefs).
- [ ] Additive-only skill ownership (no migration from harness-skills).
- [ ] First version `0.1.0`.

### Phase 1 — Persona + beliefs scaffolding

- [ ] Create `cards/base-mind/` directory with `card.json`.
- [ ] Author `persona/voice/PERSONA.md` (use the body in this doc as v0).
- [ ] Author 3 belief entries per the bodies above.
- [ ] Write the `card.json` manifest with persona/beliefs `include` + `visibility: internal`.
- [ ] (Cannot use `drwn card source add-persona`/`add-belief` here because the card source needs to live under `~/.agents/drwn/sources/` for those commands to work — the in-repo authoring path requires hand-editing. Recommend establishing a `make` or script target later, but for v1 hand-edit.)

### Phase 2 — Three new skills

- [ ] `skills/manage-active-mind-stack/SKILL.md` — full directive, slash + prose triggers.
- [ ] `skills/author-mind-content/SKILL.md` — same.
- [ ] `skills/audit-mind-visibility/SKILL.md` — same.
- [ ] Update `card.json` `skills.include` to list the three.
- [ ] Update `scripts/sync-card-skills.mjs` to copy the three into `cards/base-mind/skills/`.

### Phase 3 — Sync, validate, smoke test locally

- [ ] `npm run sync:cards` — confirm the three skill dirs land in `cards/base-mind/skills/`.
- [ ] `npm run validate:skills` — frontmatter check passes for all (now 17 valid skills total).
- [ ] Apply locally to a scratch project:
  ```bash
  cd /tmp/base-mind-test && drwn init --non-interactive
  drwn card apply file:/Users/pureicis/dev/darwinian-harness-skills/cards/base-mind
  drwn write --dry-run --json    # expect persona/beliefs in generated/mind/
  drwn write
  ```
- [ ] Verify materialization: `.agents/drwn/generated/minds/@darwinian/base-mind/` has persona + beliefs + skills bundles; `.agents/drwn/generated/mind/persona.md` contains the persona content.
- [ ] Open Claude Code in scratch project, smoke-test:
  - `/manage-active-mind-stack` — fires
  - `/audit-mind-visibility` — fires
  - "what minds are active" (prose) — fires
- [ ] Verify the persona influences agent voice (subjective — but the marker comments in `generated/mind/persona.md` should be present and the LLM should reference base-mind values when asked).

### Phase 4 — Commit + release

- [ ] Commit per `darwinian-harness-skills` conventions (Conventional Commits, no AI attribution).
- [ ] Push branch.
- [ ] Open PR with reference to this analysis doc.
- [ ] Merge, then run the repo's release pipeline.
- [ ] Validate publication via the consumer flow (`drwn card add @darwinian/base-mind@^0.1.0` in a fresh project).

### Phase 5 — Dogfood, iterate, then graduate

- [ ] Apply to your own day-to-day projects.
- [ ] After 1–2 weeks of use: revise persona/beliefs based on what's accurate vs aspirational.
- [ ] Consider adding `memory.l4` reflections once there's signal worth distilling.
- [ ] Consider bumping to `1.0.0` once stable.

---

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Persona/belief content becomes stale fast as drwn evolves | Medium | Frame content as principles (slow-changing) not features (fast-changing). Re-audit per release. |
| Skills overlap with future `harness-skills` updates | Low | Additive-only ownership in v1. Reviewthe boundary at v0.2. |
| Visibility-gate surprises during push | Low | Visibility is `internal` — consistent with the repo's existing public/internal posture. Document the gate behavior in the card description. |
| Authoring path is awkward (hand-edit vs in-store commands) | Medium | This is a general drwn ergonomic gap. File a follow-on enhancement: `drwn card source add-persona` accepting an in-repo source directory via `--source <path>` flag (or symlinking from `~/.agents/drwn/sources/` during dev). |
| Confusion between `@darwinian/harness-skills` and `@darwinian/base-mind` | Medium | Clear card descriptions; the `base-mind` `card.json.description` should explicitly say "richer companion to @darwinian/harness-skills" and document the recommended stack patterns. |
| First mind card with persona — runtime behavior unverified | Medium | Phase 3 smoke test exercises the full pipeline. CCH/runtime behavior with persona is part of the architecture but only one external consumer (Mindblown/CCH) exists — validate the persona is actually visible to the Claude runtime. |

---

## Open Questions

All ratified — see the "Ratified Decisions" table near the top of this document. The next blocking question is execution scope (Phase 1 vs Phase 2 ordering and branch strategy), captured in the implementation plan above.

---

## Appendix A — Ratified `card.json`

```json
{
  "name": "@darwinian/base-mind",
  "version": "0.1.0",
  "description": "BaseMind — a foundational Darwinian mind card with persona, beliefs, and skills for activating, authoring, and auditing minds via drwn. Designed to compose with other Darwinian mind cards; see README for recommended stacks.",
  "stability": "experimental",
  "skills": {
    "include": [
      "manage-active-mind-stack",
      "author-mind-content",
      "audit-mind-visibility"
    ]
  },
  "persona": {
    "include": ["voice"],
    "visibility": "public"
  },
  "beliefs": {
    "include": [
      "explicit-activation",
      "visibility-discipline",
      "layered-minds"
    ],
    "visibility": "public"
  },
  "servers": {}
}
```

---

## Appendix B — Sync script extension

Concrete diff to `scripts/sync-card-skills.mjs`:

```javascript
const cardMaps = [
  {
    targetDir: join(rootDir, "cards", "harness-skills", "skills"),
    skills: [/* unchanged 14 skills */],
  },
  {
    targetDir: join(rootDir, "cards", "workspace-experimental", "skills"),
    skills: ["organize-workspace"],
  },
  {
    targetDir: join(rootDir, "cards", "base-mind", "skills"),
    skills: [
      "manage-active-mind-stack",
      "author-mind-content",
      "audit-mind-visibility",
    ],
  },
];
```

The sync script only handles skills today. Persona + beliefs live under `cards/base-mind/persona/` + `cards/base-mind/beliefs/` and are not synced from a canonical location — they're authored in-place. If we accumulate multiple cards with persona/beliefs, consider extending the sync script to also handle those content types, or accept that persona/beliefs are per-card by design.

---

## Appendix C — Skill scaffolds (one per new skill)

These are starter bodies. Full versions go in `skills/<name>/SKILL.md` under the repo.

### `manage-active-mind-stack`

```markdown
---
name: manage-active-mind-stack
description: "Use when the user says /manage-active-mind-stack, asks what minds are active, wants to switch minds, layer multiple minds, or clear the active stack. Wraps drwn mind list/use/clear with explicit preview before write."
---

# manage-active-mind-stack

**Assumes**: project is a drwn project (`.agents/drwn/config.json` exists).
If not, redirect to `bootstrap-project` first.

## Input

Parse args after the slash invocation, or read intent from prose. Three
operations: list, use <names...>, clear.

## Directive

1. `drwn mind list --json` — read installed minds + current active stack.
2. Present the user with the current state (active stack + installed
   options).
3. If the user wants to change activation:
   - `drwn write --dry-run --json` against the proposed stack to preview
     the diff (which skills/MCPs land or leave).
   - Show the preview, confirm.
   - Run `drwn mind use <names...>` or `drwn mind clear`.
   - Run `drwn write` to materialize.
4. Report the final state via a fresh `drwn mind list`.

## Output

Updated `activeMinds` in project config + materialized `.claude/`, `.codex/`,
`.cursor/`, `.agents/drwn/generated/mind/`.

## Notes

- The active stack is per-project, not machine-wide.
- Default (absent activeMinds) = all installed cards active. Explicit empty
  (after `drwn mind clear`) = none. Pinning order matters (last layer wins
  on tool conflicts).
```

### `author-mind-content`

```markdown
---
name: author-mind-content
description: "Use when the user says /author-mind-content, wants to add persona/beliefs/memory to a card source, scaffold mind content, or set up the richer side of a mind card. Wraps drwn card source add-persona/add-belief/add-memory with explicit visibility prompts."
---

# author-mind-content

**Assumes**: a card source exists under `~/.agents/drwn/sources/<scope>/<card>/`.
If the user wants to author content in a card source in a separate repo
(e.g., darwinian-harness-skills), explain that the CLI's add-* commands
target the canonical source dir; hand-editing in another repo is the
current workaround.

## Input

Parse the card name, content type (persona | belief | memory), entry name,
visibility, and (for memory) layer + format from slash args or prose. If
ambiguous, ask.

## Directive

1. Confirm the card source exists: `drwn card source show <card> --json`.
2. Explain the visibility model:
   - `private` — blocked from public push without --unsafe-push-public.
   - `internal` — fine for collaboration; default for organizational use.
   - `public` — explicitly safe for arbitrary parties.
3. Run the appropriate scaffold:
   - `drwn card source add-persona <card> <entry> --visibility <v>`
   - `drwn card source add-belief <card> <entry> --visibility <v>`
   - `drwn card source add-memory <card> <entry> --layer <l4|l5|l6>
     --visibility <v> [--format md|jsonl|mixed]`
   - Each with `--dry-run --json` first to preview.
4. Help the user fill in the scaffolded content file.
5. Run `drwn card source doctor <card>` to validate.
6. Suggest bumping the card version (minor for additive entries) and
   republishing if the card is already published.

## Output

New persona/belief/memory entry under the card source, declared in
`card.json` with explicit visibility.

## Notes

- Visibility is required and has no default — explicitness is load-bearing
  for the push gate.
- Memory has three layers (L4 reflections, L5 observations, L6 raw) with
  per-layer visibility + format. L6 in v1 is in-tree; LFS deferred.
```

### `audit-mind-visibility`

```markdown
---
name: audit-mind-visibility
description: "Use when the user says /audit-mind-visibility, wants to check if a mind is safe to push, audit visibility settings across cards, or detect strictest-visibility before publishing. Read-only walk over installed and authored cards."
---

# audit-mind-visibility

**Assumes**: drwn is on PATH.

## Input

Parse target — single card name, all installed cards, or all card sources
(authored on this machine). If absent, default to "all installed cards in
the current project."

## Directive

1. For each target card:
   - `drwn card show <card> --json` (for installed) or `drwn card source
     show <card> --json` (for authored).
   - Enumerate visibility per persona/beliefs/memory section.
   - Compute the strictest visibility across all sections (private > internal > public).
2. If a remote is configured (`drwn card remote list <card>`):
   - Classify the remote: `file://` → private; known host (github.com,
     gitlab.com) → unknown (treat as public unless overridden).
   - Compare strictest-visibility to remote classification.
   - Surface push-gate verdict: would push succeed? Or block?
3. Report a table: card, strictest visibility, remote, push verdict.
4. If any card would block on push, surface the exact flag to override
   (--remote-visibility=<v> or --unsafe-push-public) and note that
   overriding bypasses a safety net — not recommended.

## Output

A read-only report. No mutations.

## Notes

- Visibility is per-section on the card; the gate uses the strictest across
  all sections that declare it.
- Tools-only cards (no persona/beliefs/memory) bypass the gate entirely —
  this report would show "no visibility constraints; pushes freely."
```
