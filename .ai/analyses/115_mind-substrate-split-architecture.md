# ABOUTME: Architecture for splitting the mind reference card into @darwinian/mind-tools (pure substrate: skills + conventions + layer declarations, zero seeds) and @darwinian/mind-starter (batteries-included solo card), per the ratified option (b).
# ABOUTME: Frees "mind card" to be purely the class noun, removes substrate-voice pollution from composed minds, and fixes the composition doctrine; includes verified constraints, blast radius, and migration plan.

# Analysis 115 — The Mind Substrate Split: mind-tools + mind-starter

**Date**: 2026-07-08
**Author**: Claude + Remy
**Status**: Implemented (2026-07-09) — ratified and executed per task 74
**Supersedes in part**: the single-card `@darwinian/mind-card@0.1.0` design (task 72 M0)
**Amended by**: `.ai/analyses/117_worker-mind-semantic-memory-target-architecture.md`. The `mind-tools`/`mind-starter` ownership split and sync doctrine remain authoritative; the `{l4, l5}` memory declarations and numbered terminology in this implementation record are historical and are replaced by observations and insights.
**References**: [.ai/analyses/113_mind-card-engineering-guide.html, 114_drwn-worker-cli-architecture.html, darwinian-cards/mind-card/]

---

## 1. The problem being solved

The current reference card conflates **substrate** (the five mind-operating skills, CONVENTIONS.md, memory-layer declarations) with **content** (a generic `voice` persona and a `collaboration` belief). Because composition *concatenates* (fenced sections, never overridden), every worker composing it inherits the generic voice above its own — live today in the believer/chief blueprints, and fatal for figure minds where voice fidelity is the whole point. Separately, the name `@darwinian/mind-card` collides with "mind card" the class noun, which doc 113/114 now use generically ("any mind-bearing card").

## 2. Verified constraints (all checked at code level this session)

1. **Cards cannot compose cards.** `composedFrom` requires `kind: "blueprint"`, and **blueprints cannot compose blueprints** (`BLUEPRINT_RECURSION`). Consequence: the starter cannot be "a card that composes mind-tools", and if the starter were a blueprint, figure blueprints could never include it. Both split cards must be plain `kind: "card"`, sharing skills by **content sync**, not composition.
2. **`skills.upstream` is provenance metadata, not a resolver.** Publish validates the refs parse (no local paths); nothing fetches upstream content. Use it to *record* where synced skills come from; use a sync script to *move* them — the exact pattern `darwinian-minds-skills` already runs (`sync:cards` + `--check` drift detection).
3. **Memory-declaration merge is first-in-stack-wins per layer** (seedMind's union). Whoever declares layers earliest in the stack sets the formats.
4. **Blast radius = 15 files across 4 repos** (believer blueprints/scripts/tests/README/docs, l6 strategy, docs 113/114/72, Notion) — inventoried below.
5. **No production minds exist.** All provisioned minds are dev/local; changing fence attribution (`card="@darwinian/mind-card"`) costs a re-provision, not a migration. This is the cheapest moment the split will ever have.

## 3. Target architecture

### 3.1 Two cards, one doctrine

| | `@darwinian/mind-tools` (the substrate) | `@darwinian/mind-starter` (the batteries-included solo card) |
|---|---|---|
| **Kind** | `card` | `card` |
| **Skills** | The five canonical mind-operating skills (`mind-read/remember/share/forget/search`) — **canonical home** | Synced copies of the same five (provenance recorded in `skills.upstream`) |
| **Persona** | **None** | `voice` (the current generic entry) |
| **Beliefs** | **None** | `collaboration` (the memory-discipline meta-belief) |
| **Memory** | `{l4: md, l5: jsonl}` — the **canonical layer declaration** | Same (standalone card must be self-sufficient) |
| **CONVENTIONS.md** | Canonical home (+ the doctrine, §3.2) | Synced copy |
| **Intended use** | Composed by every worker blueprint that wants a mind | Applied **alone** for a five-minute first mind; never composed under content cards |
| **Repo** | `darwinian-cards/mind-tools/` — the existing `mind-card/` repo **renamed** (skills history preserved) | `darwinian-cards/mind-starter/` — new sibling repo |
| **Version** | 0.1.0 | 0.1.0 |
| **Visibility** | n/a (no mind sections → no gate) | `internal` (generic seeds; nothing sensitive) |

Where the substrate's old seeds go: the `voice` entry moves to the starter (it was always starter-shaped). The `collaboration` belief also moves to the starter **only** — its memory-discipline rules are not lost to composed minds because they already live normatively in CONVENTIONS.md and imperatively in the skills' directives (`mind-forget`'s never-delete-everywhere, `mind-remember`'s single-writer rule). A first-person belief in generic voice has no place inside a figure mind's belief tree.

### 3.2 The doctrine (to be added verbatim to 113 §6 and 114 §1)

> **The substrate is composed, never forked. Minds are always defined by their own content card. Fork only to change how minds *work*, not what a mind *is*.**
> Worker blueprints compose `[@darwinian/mind-tools, <content-card>, …]`. `@darwinian/mind-starter` is the solo quickstart — apply it alone; composing it under a content card re-introduces the generic voice it exists to contain. "Mind card" is the class noun for any mind-bearing card; neither published card owns the term.

### 3.3 Skill-sharing mechanics

- Canonical skills + CONVENTIONS.md live in `mind-tools`. `mind-starter` carries a `scripts/sync-from-tools.mjs` (copy + `--check` drift mode, the darwinian-minds-skills pattern) and records provenance in its manifest:
  ```jsonc
  "skills": {
    "include": ["mind-read", "mind-remember", "mind-share", "mind-forget", "mind-search"],
    "upstream": {
      "mind-read": "github:<org>/mind-tools#v0.1.0",
      "…": "…"
    }
  }
  ```
  (`skills.upstream` is exactly the manifest field for this — validated at publish, documented as provenance.)
- Release rule: a `mind-tools` skill change ⇒ bump mind-tools ⇒ run starter's sync ⇒ bump starter. The starter's sync `--check` runs in its manifest-sanity test so drift can't publish silently.

### 3.4 Stack shapes after the split

```bash
# Figure/content workers (the normal case):
composedFrom: ["@darwinian/mind-tools@^0.1.0", "@x/harari-mind@^1.0.0"]
# stack: blueprint + BOTH members (no-expansion rule unchanged)
drwn worker stack use @x/harari-worker @darwinian/mind-tools @x/harari-mind

# Solo quickstart (no blueprint needed):
drwn card apply @darwinian/mind-starter@^0.1.0
drwn worker mind provision --mind-id mind_scratch
```
Composed persona.md for figure workers now contains **only** the content card's fenced sections — the pollution is gone by construction. mind-tools first in stack also pins the canonical layer formats (§2.3).

## 4. Blast radius & migration

Rule: update **live manifests/code/scripts and forward-looking docs**; leave dated analyses as historical record.

| Where | Change |
|---|---|
| `darwinian-cards/mind-card/` → `mind-tools/` | Rename repo dir + card name; delete `persona/`, `beliefs/` and their manifest sections; keep skills, CONVENTIONS.md (+ doctrine added), memory decl; version 0.1.0 fresh under the new name |
| `darwinian-cards/mind-starter/` (new) | card.json (starter shape above), `persona/voice/`, `beliefs/collaboration/` (moved), synced `skills/`, sync script, README |
| **believer-interview** | Both blueprints' `composedFrom`: `@darwinian/mind-card@^0.1.0` → `@darwinian/mind-tools@^0.1.0`; `sync-cards-to-drwn.mjs` + its tests + `cards-manifest.test.mjs` (import path + name); README recipe + stack lines; re-provision the two dev minds after (rebase won't retarget fences — fresh provision is the honest path pre-production) |
| **l6-mind-collections** | Analysis 01 mapping/strategy refs (mind-card → mind-tools in the target shape + blueprint sketches) — this is forward-looking, so update |
| **darwinian-minds docs** | 113: reference-card mentions + §6/§12 doctrine; 114: §1 callout's reference-card line + doctrine; smoke test `scenarios-mind-card-smoke.test.ts` (path + name assertions — it pins the OLD card; retarget to mind-tools + add a starter variant) |
| **Notion home** | One phrase in the minds bullet if it names the card (it doesn't — no change) |
| **Local drwn stores** | `drwn card deprecate @darwinian/mind-card@0.1.0` where published; publish the two new cards |
| Historical docs (72, 105–112, believer 02/03/04, completion logs) | **No change** — they record what was true when written |

## 5. Risks / non-goals

1. **Sync drift between tools and starter skills** — mitigated by `--check` in tests + upstream pins; accepted residual (same as darwinian-minds-skills).
2. **Naming churn** — "mind-card" appears in many historical docs; the doctrine line in 113/114 explicitly resolves the term to the class noun so old references read correctly.
3. **Non-goal**: no CLI changes. The split is pure card-land; validation, seeding, composition, and checkpoint behave identically.
4. **Non-goal**: no third "seeds-only" card. Two cards cover the real use cases; a seeds-only card would recreate the composition-pollution trap under a different name.

## 6. Ratification asks

1. Names: `@darwinian/mind-tools` + `@darwinian/mind-starter`, freeing "mind card" as the class noun (§3.1–3.2).
2. The `collaboration` belief moves to starter-only; composed minds inherit the discipline via CONVENTIONS + skill directives, not a seeded belief (§3.1).
3. Repo strategy: rename the existing repo to `mind-tools` (history follows the skills); new sibling `mind-starter`.
4. Migration scope per §4, including re-pointing believer's implemented blueprints and re-provisioning its dev minds.
5. On ratification: execute (it's a small, test-guarded change set — card edits, one new repo, blueprint re-points, doc/doctrine updates, smoke-test retargets), then propagate the doctrine into 113/114.

## 7. Implementation record (2026-07-09)

Ratified and executed via task 74. Both cards live under `curation-labs/` (private) at `v0.1.0`; the starter's `skills.upstream` refs point at `git+https://github.com/curation-labs/mind-tools.git#skills/<skill>@v0.1.0` and resolve (verified via `drwn card source sync`). The §6 ratification asks were accepted as posed.

**Deviations from the original design (recorded per the standing rules):**

1. **Upstream-ref format corrected.** §3.3 sketched the refs as `github:<org>/mind-tools#v0.1.0` — the *worker-deploy* URL format. Publish validation (`cli/core/git-ref.ts:parseUpstreamRef`) requires `git+<url>#<subpath>[@<rev>]` and rejects local paths. The implemented form is `git+https://github.com/curation-labs/mind-tools.git#skills/<skill>@v0.1.0` (subpath = in-repo skill dir, feeds `git archive`).
2. **Starter smoke test does not assert `doctor`.** `card source doctor` runs `checkCardSourceUpstream`, which clones the mind-tools remote (~10s + network) — impractical per-test-run and fragile in CI. The starter case asserts apply + lock + publish (publish validates every upstream ref via `parseUpstreamRef`); upstream *resolution* is covered by the P6 end-to-end check. The tools case still asserts doctor (no upstream refs → no clone).
3. **A new `sync-from-tools.mjs`** was written rather than reusing `darwinian-minds-skills/scripts/sync-card-skills.mjs` literally — the latter is `card-map.mjs`-driven and syncs from the skills repo's own root; the starter needs a single-target copy from its sibling. Same mechanism (delete-then-copy + `--check` drift).
