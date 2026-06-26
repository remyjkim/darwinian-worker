# Mind-as-Card Substrate — Evaluation Against the Current drwn Card Design

**Date:** 2026-06-15
**Author:** Claude + Remy
**Status:** Draft
**Source:** Matt's pre-seminar note "[061226, Matt] Mind-as-Card — Substrate & Evaluation" (Notion `37df1fbef8c2816f83bacd440230679e`)
**References:** [analyses/52_drwn-target-architecture-post-wave-1.md, analyses/60_drwn-card-hooks-target-architecture.md, analyses/55_card-catalog-publish-cli-target-architecture.md, analyses/49_drwn-target-architecture-after-phase-3.md, tasks/45_plan1_l6-mind-card-from-personal-assistant.md, tasks/45_completion_l6-mind-card.md, cli/core/card-manifest.ts, cli/core/card-lock.ts, cli/core/card-store.ts, cli/core/extensions/registry.ts]

---

## 0. What this document is

Matt's note takes a **position** on the Mindblown substrate question — minds and harness cards should share **one substrate** rather than running two parallel systems — and leaves Mind **evaluation** as an open seminar question. The position is the load-bearing part.

This analysis evaluates that position against the **current state of the drwn card model** (post Wave 1, mid Wave 2). It is not an opinion on the Mindblown evaluation question (axes, faithfulness, low-data regime); those are downstream of substrate choice. The goal is to surface: where the proposal lines up with the existing model, what would have to change in drwn to host minds, and what the seminar should treat as decided vs still open.

The summary up front:

- **The conceptual alignment is real.** Matt's baked / runtime split maps cleanly onto drwn's existing immutable-card + extension-managed-state pattern. The immutability worry he flags does dissolve under that split — but only for **baked** content. Drwn already runs this split for one extension (Beads owns project-scoped agent memory; cards stay immutable).
- **The schema gap is real and not trivial.** The current `CardManifest` has no slot for memory, knowledge, persona, identity, or arbitrary filesystem content. Adding one is a net-new contract change — comparable in scope to the Wave-1 hooks addition (`60_drwn-card-hooks-target-architecture.md`), with a different risk profile.
- **Matt's "no bespoke persona field needed" claim partially holds.** Skills/MCP/extensions can absorb L2 (principles → tools) cleanly. But L1 (soul/values → system prompt) and L3–L6 (frameworks, reflections, observations, raw data → baked memory) need slots that don't exist today. The card schema doesn't have a "system prompt" surface either.
- **Remy has already shipped a related precedent.** `@remyjkim/l6-mind-card` (task 45, completed 2026-06-14) bundles 25 personal-assistant operations as **skills**, using description-rich `Use when…` frontmatter to bridge slash/prose invocation. It demonstrates that L2-style procedural mind content fits the existing slots, but it also exposes the limitation — L6 raw data was converted to procedural skills with "Assumes" guards rather than treated as data, because there's nowhere else to put it.
- **The "memory as arbitrary folder tree" framing collides with drwn's typed-slot convention.** Every existing card slot is a registry of named modules (`skills/<name>/SKILL.md`, `hooks/<name>/policy.ts`, `mcp-servers/<id>.json`). An unnamed bag of files is a new shape for the card source and the materializer.
- **The Wave-2 timing matters.** Matt is correct that memory is not in Wave 2 (`52_drwn-target-architecture-post-wave-1.md` confirms: Wave 2 = capture flow + quality-signal manifest fields only). Adding Mind support is a Wave 3+ proposal, sized similarly to hooks.

---

## 1. The proposal, in drwn terms

Matt's core position rendered in the language of the drwn architecture:

> Add a fourth bundled-content class to the harness card — **baked memory** (read-only knowledge content) — sibling to `skills`, `servers`, and (Wave-1) `hooks`. Define the source-layout as a folder tree (not a single `MEMORY.md`). A **Mind is then a card** with: (a) rich baked memory under that new slot, (b) some extracted skills/tools, (c) a persona contribution to the runtime's system prompt. **Runtime/episodic memory stays out of the card** and lives in Mind Cloud (Mindblown's existing mutable-state plane: `thread_memory` in Postgres, refinery tarball mounted from R2 today).

This is a coherent extension of the existing card model. It does **not** propose to make cards mutable. It proposes to widen what cards can carry. The immutability invariant — every published card is a Git tree SHA, every `extracted/<tree-sha>/` is content-addressed, `card.lock` pins both semver and Git commit SHA (`52_drwn-target-architecture-post-wave-1.md` §1, decision 5) — survives intact, because everything Matt proposes to add to the card is *baked* (static, read-only).

Where the proposal needs work is in three places:

1. **The L1 (soul/values → system prompt) leg has no corresponding slot.** The card schema has no "system prompt contribution" field. Hooks come close — they're cards-contributed runtime behavior — but they enforce/observe tool calls, they don't shape the system prompt. This is a second new slot, not just a memory slot.
2. **The "arbitrary folder tree" shape is genuinely new.** Every other card content type is a named-module registry. Doing this as `memory: { include: string[] }` (mirroring `skills.include`) would keep the convention; doing it as `memory: { roots: string[] }` or "everything under `memory/`" would break it.
3. **Materialization is undefined.** Cards today materialize to `~/.claude/`, `~/.codex/`, `~/.cursor/` (Layer 5 in the post-Wave-1 mental model). Mind baked memory does not target those runtimes — it targets the Mindblown agent runtime. That is a new downstream tool the card model has never targeted. The `targets` field would need a new value (e.g., `mindblown`) or a more general mechanism.

These are tractable; they are not trivial. Each is roughly the scope of the Wave-1 hooks addition.

---

## 2. Where the alignment is strong

### 2.1 The baked / runtime split is already how drwn thinks

Matt's central architectural move — split memory into baked (card) and runtime (Mind Cloud) — restates a pattern drwn already uses:

- **Cards are content-addressed and immutable.** `~/.agents/drwn/cards/@scope/name.git/` is a bare repo, `extracted/<tree-sha>/` is keyed by tree SHA, `card.lock` pins SHAs, `computeCardIntegrity()` rejects tampered extracts. (`card-store.ts`, `card-lock.ts`.)
- **Mutable state lives in extensions, not cards.** The `beads` extension provides project-scoped issue tracking + agent memory via a separate CLI and MCP server. The card declares that the extension is wanted; the *state* lives in `bd`'s own database, not in the card. (`cli/core/extensions/registry.ts:beads`.)
- **Cards are declarations of bundled resources, not stateful containers.** The CardManifest contract is explicit about this: `skills.exclude` and `skills.shared` are rejected at validation time precisely because "cards declare what they ship" (`card-manifest.ts:validateCardManifest`).

So Matt's framing is consistent with drwn's existing posture. The Mindblown analogue (`thread_memory` in Postgres = mutable runtime state; refinery tarball from R2 = immutable baked snapshot) is the same pattern with different storage choices. Bringing Mind onto cards just means swapping the R2 tarball for a published drwn card, with the content-addressed Git-tree-SHA story drwn already provides.

This means the **immutability worry Matt acknowledges** ("not on the card roadmap; touches the card's immutability invariant") really does dissolve under his proposed split. Baked content is no harder for the card model than skills are. The risk is not immutability; it's schema/contract surface and the new materialization target.

### 2.2 Most of the L1–L6 layers have homes in existing slots

Walking the table Matt provides against the actual card surface:

| Refinery layer | Matt's proposed home | Maps to existing slot? |
|---|---|---|
| L1 soul / values | system prompt (persona) | **No.** Card has no system-prompt slot. |
| L2 principles (tool-izable) | skills / tools | **Yes.** `skills.include`. |
| L2 principles (reasoning-style) | system prompt | **No.** Same as L1. |
| L3 world models | baked memory (+ some skills) | **Partial.** Skills work; memory slot doesn't exist. |
| L4 reflections | baked memory or drop | **Open.** Same gap. |
| L5 observations | baked memory | **No.** Gap. |
| L6 raw data | baked memory (knowledge base) | **No.** Gap. |

L2 (the tool-izable principles) fits cleanly into skills today — and Remy's `@remyjkim/l6-mind-card` is the proof point: 25 operational procedures, each shipped as `SKILL.md` with `Use when…` description-trigger frontmatter, all materializing via `drwn write` into `.claude/skills/` and `.codex/skills/`. The slash-and-prose invocation works at runtime in Claude Code (probe results, task 45 §"Probe Results"). For procedural mind content, the existing slot is sufficient.

L1 and L3–L6 are where the proposal needs new surface. Two of those three (L1 system-prompt contribution; L3–L6 baked memory) are distinct slots with distinct contracts.

### 2.3 The "useful expert in style" (target b) reading lowers substrate pressure

Matt's note pivots evaluation toward "useful expert in the person's style" (target b) rather than strict faithfulness (target a). This isn't strictly a substrate question, but it does affect substrate sizing: if the bar is "useful expert," the volume and fidelity of L6 raw-data content the card has to carry is bounded — books, podcast transcripts, the existing refinery layers. Not a vector database, not embeddings, not a retrieval index. Files on disk are sufficient.

This matters because the existing drwn store layout (`extracted/<tree-sha>/`) handles file trees natively. A multi-gigabyte vector index would not have fit cleanly. A folder of Markdown / text / JSON does.

---

## 3. Where the proposal diverges from the current design

### 3.1 No slot exists for baked memory or persistent content

The CardManifest schema today (`cli/core/card-manifest.ts:CardManifest`) supports exactly these content-carrying fields:

```ts
skills?:     { include?: string[]; exclude?: string[]; shared?: string[] };
hooks?:      { include?: string[]; exclude?: string[]; shared?: string[] };
servers?:    Record<string, ServerOverride>;
extensions?: Record<string, ProjectExtensionConfig>;
```

There is no `memory`, `knowledge`, `context`, `content`, `persona`, `identity`, `files`, or arbitrary-folder slot. Validation explicitly rejects unrecognized fields. Adding a `memory` field is a contract change with downstream impact on:

- **Source layout** (`~/.agents/drwn/sources/@scope/name/`) — new top-level directory convention.
- **Publish** (`cli/core/card-store.ts:publish`) — walk and integrity-check the new content.
- **Lockfile** (`cli/core/card-lock.ts:CardLockEntry`) — new list field for what memory artifacts the card carries, parallel to `skills: string[]` and `hooks: string[]`. Plausibly a lockfile version bump (v3 → v4).
- **Materialization** (`drwn write` writers) — new write path to a new downstream target.
- **`drwn card source doctor`** — validate the new slot.
- **Diff / show / validate** commands — render the new content.

This is the same scope as the Wave-1 hooks addition (`60_drwn-card-hooks-target-architecture.md`). That work is the right size template for thinking about Mind memory.

### 3.2 No system-prompt slot exists

The card model has never written into a runtime's system prompt. Hooks observe / enforce tool calls. Skills are content the model reads when triggered. MCP servers expose tools. Extensions toggle features. Targets are downstream tool selection.

Nothing currently shapes the persona / system prompt of the running agent. Matt's L1 → system prompt mapping assumes a contribution surface that doesn't exist.

Two reasonable shapes for it:

1. **`persona` / `systemPrompt` manifest field** — a string or Markdown file contributed to the runtime's system prompt. Cleanest, but adds a new managed-fields surface in `.claude/CLAUDE.md` / `.codex/AGENTS.md` / Mindblown system prompt. Requires conflict resolution when multiple cards each contribute.
2. **A "system-prompt" skill convention** — a SKILL.md that the runtime treats as always-active rather than description-triggered. Smaller schema delta, but Claude Code's skills surface does not work that way today (skills are gated on description match). Probably forces a runtime-specific hack.

Either is a real schema/contract change. Neither is just absorbed by the existing slots.

### 3.3 The "filesystem (arbitrary folder tree)" framing breaks the named-module convention

Every content-carrying slot in drwn cards today is a registry of named modules:

```
skills/<name>/SKILL.md
hooks/<name>/policy.ts
mcp-servers/<id>.json
```

The manifest declares `skills.include: string[]`, `hooks.include: string[]`. Source-doctor walks the named entries. Lockfile records them as `skills: string[]`, `hooks: string[]`. The downstream writer materializes them by name.

An "arbitrary folder tree" memory slot ("a filesystem, not a single `MEMORY.md`") asks for a different shape:

- No required per-entry manifest declaration.
- Sub-tree structure is part of the card's value; the card author defines the layout.
- The materializer copies/symlinks the whole subtree, not per-entry.

That's not unreasonable. But it is a **new content shape** for cards, and it shifts validation: the doctor can no longer check "every declared entry has its file"; it has to fall back to "is this folder well-formed against some convention" — and the convention is what Matt's note explicitly defers ("mechanics are deliberately not specified — this is a direction, not a spec").

A middle path that keeps the convention intact: `memory.include: string[]` listing named knowledge bundles (`memory/<name>/...`), each of which is internally an arbitrary tree. Same shape as skills (per-entry doctor check) with an opaque payload (internal tree freely shaped by the author). This preserves the contract while giving authors the folder-tree freedom Matt argues for.

### 3.4 Materialization to Mindblown is a brand-new target

The downstream materialization layer (`52_drwn-target-architecture-post-wave-1.md` §2, Layer 5) writes to `~/.claude/`, `~/.codex/`, `~/.cursor/` and the project-local equivalents, via the three documented mechanisms (symlinks, `_drwn` meta-block, generated-file-plus-symlink for Cursor). Mindblown is not on this list.

For a Mind to be a card consumed by Mindblown, one of:

1. **Mindblown adds drwn as a consumer.** The Mindblown runtime reads `card.lock`, resolves the extracted card content, and mounts the baked memory into the agent. This is the analogue of how Claude Code, Codex, and Cursor are consumers today — Mindblown joins the set.
2. **drwn adds Mindblown as a target.** `targets.mindblown.enabled = true` makes `drwn write` materialize the card into Mindblown's expected mount layout. Inverts the relationship.

Option (1) is closer to the "Cloudflare-container runtime is already capable" line in Matt's note (the runtime already mounts external content; just point it at the drwn store instead of R2). Option (2) is closer to drwn's existing model (cards target downstream tools).

Either choice is decision-level, not detail-level. Worth flagging to the seminar.

### 3.5 Hook-style consent is probably overkill for baked memory, but not zero

Wave-1 hooks introduced **per-card explicit hook consent** because executing third-party TypeScript at the tool-call boundary is qualitatively riskier than reading Markdown skills or registering MCP servers (`60_drwn-card-hooks-target-architecture.md` §1, decision Q5; "Authoring trust" §).

Baked memory is more like skills (read-only content) than hooks (executable code), so probably doesn't need a separate consent step. But there's still a **trust signal** worth considering: a card author can put anything in baked memory (manipulative writing, content that biases the model in subtle ways). The existing `trustedSources` gate likely covers this — same gate that already guards skill content.

Not a new mechanism; just a check that the existing gate composes correctly.

---

## 4. The `@remyjkim/l6-mind-card` precedent

Task 45 shipped on 2026-06-14: a 25-skill card derived from Remy's personal-assistant slash commands, published to a private GitHub remote, validated end-to-end (clone → validate → integrity = `sha256-1af9e8ac…`). It is the closest existing precedent to Matt's proposal.

What it demonstrates:

- **Procedural mind content fits the existing skills slot.** The 25 commands — refinery operations across upward (extraction → identity crystallization), downward (value propagation → source-seeking), cross-mind, maintenance, and intake — all converted to `SKILL.md` form. Description-trigger frontmatter (`Use when the user says /morning, 'good morning'…`) bridges slash invocation and prose intent. The probe at 2026-06-14 confirmed `/morning`, "good morning", "morning sync" all fire the right skill.
- **Description-rich frontmatter works as an invocation surface.** This is roughly Matt's L2 layer — operational principles encoded as procedures the runtime can pattern-match against. No new schema needed.
- **The "Assumes" guard pattern handles bootstrap.** Each skill checks for the refinery / work / life directory layout and redirects to `/init-refinery` if missing. This handles the case where the card is applied to a project that hasn't set up the consumer-side scaffolding.

What it exposes — the limitation Matt's proposal would address:

- **L6 raw data was converted to procedure, not treated as data.** The mind card bundles `op-up-01-voice-extraction`, `op-up-02-dialectical-mapping`, etc. — instructions for *processing* raw data — but the raw data itself (books, podcast transcripts, refinery layers) is not in the card. It lives in the consumer project's `refineries/<mind>/06_raw_data/` directory, populated by the consumer.
- **The card assumes consumer scaffolding rather than providing it.** This works for Remy's own knowledge-management workflow (he populates the refinery directly), but it doesn't work for a "rentable cognitive worker" Mind shipped to a third party — the third party has no raw data to populate, the whole point is that the Mind brings its data with it.
- **`capture-epub` was dropped because the card model has no place for code or runnable artifacts.** A TypeScript epub-extraction script with `node_modules` and `tsx`/`xml2js`/`epub` dependencies couldn't be inlined into a SKILL.md or executed from a symlinked skill dir. (Task 45 §"Phase 2", `capture-epub` decision.) This isn't directly Matt's gap, but it's adjacent: the card model handles Markdown content (skills), TypeScript policies (hooks, Wave 1), and JSON server defs (MCP) — and nothing else.

The l6-mind-card is the **upper bound of what's currently possible** for Mind-as-card. Matt's proposal is essentially: extend the card model so a card like `@mindblown/dalio` could ship the operations *and* the raw data *and* the persona, instead of just the operations.

---

## 5. What the seminar should treat as decided vs open

### Decided (or at least: well-supported by the existing design)

1. **Baked / runtime split is the right architectural cleavage.** Drwn already runs this pattern (immutable cards + mutable state in extensions like Beads). Mindblown already runs this pattern (R2 tarball + Postgres `thread_memory`). Matt's split is consistent.
2. **L2 (procedural / tool-izable principles) belongs in `skills`.** The l6-mind-card precedent is the proof point. No new schema needed.
3. **Cards stay content-addressed and immutable.** Matt's proposal does not threaten this. The Wave-1 invariants (`52_drwn-target-architecture-post-wave-1.md` §1) hold.
4. **Wave 2 is not the moment to land this.** Wave 2 = capture flow (`drwn card new --from-project`) + quality-signal manifest fields (`stability`, `lastValidatedWith`, `testStatusBadge`). Adding Mind support is a Wave 3+ proposal.

### Open and worth seminar attention

1. **The L1 system-prompt slot.** Matt says "no bespoke persona field needed — L1 goes into the system prompt." But cards don't write to system prompts today. This is a new managed-fields surface in `.claude/CLAUDE.md` / `.codex/AGENTS.md` / Mindblown system prompt, and a new schema field. It needs design — what writes the persona contribution, how multiple cards compose, how the consumer overrides — and it should not be hand-waved as "absorbed by the system prompt."
2. **The shape of the baked memory slot.** Arbitrary folder tree (Matt's framing) vs named-bundle convention (drwn's existing pattern). The middle path — `memory.include: string[]` listing named knowledge bundles, each internally an arbitrary tree — preserves the contract while delivering the freedom. Worth picking deliberately.
3. **The materialization target for Mind cards.** Does Mindblown become a card consumer (reads `card.lock`, mounts extracted content)? Or does drwn add a `mindblown` target (writes into Mindblown's expected layout)? The first inverts the consumer relationship; the second extends the existing model. Decision-level, not detail.
4. **The "principle → skill" boundary** (Matt's open question 1). Which first principles are tool-izable (a decision checklist that can fire as a skill) vs which are reasoning-style (belong in the system prompt). This is upstream of the schema work — it determines how much of L2 lands in `skills` vs how much pushes the system-prompt slot to do more work. Worth resolving on a few representative minds (Dalio, Taleb) before generalizing.
5. **L4 reflections — keep or drop** (Matt's open question 5). The card model is agnostic; this is a Mindblown product question. Flag for product, not substrate.
6. **Card-contract impact and Junggyu's surfaces** (Matt's open question 3). The schema bump touches manifest validation, source-doctor, publish, catalog, validate, integrity. The Wave-1 hooks rollout is the right reference for sizing this work. Probably a Wave 3 in its own right.
7. **Migration of the existing 4 minds** (Matt's open question 4). Mechanically clear once the slot exists: each refinery layer maps to skills (L2) and baked memory (L3–L6), L1 contributes to the system prompt, current R2 tarballs become published drwn cards. The interesting question is whether the existing 4 minds get **republished as cards with identical content** (low-risk, mechanical migration) or **re-derived with the new schema in mind** (treats the new substrate as a chance to clean up). Worth a deliberate choice.

### Open but should be deferred (out of substrate scope)

- Evaluation method under target (b) (Matt's open question 2). This is Mindblown product strategy. The substrate doesn't constrain it much beyond the `evidence[]` field on turns, which already exists.
- "Held-out faithfulness" as an optional anchor. Same: product evaluation, not substrate.
- The Intent Gym circularity guard. Methodological; downstream of substrate.

---

## 6. Recommendation

If the seminar accepts Matt's position (cards as Mind substrate), the substrate work is sized as a Wave 3-style feature with three roughly independent pieces:

1. **Baked memory slot** — new manifest field, source-layout convention, publish/lockfile/doctor support, materialization to one or more targets. Scope: comparable to Wave-1 hooks. Schema mirrors `skills.include` (named bundles with internally-free tree shape) to preserve the existing contract.
2. **System-prompt contribution slot** — new manifest field, managed-fields surface in downstream system prompts, compose rules across multiple cards, conflict resolution. Scope: smaller than the memory slot but trickier because it touches three+ downstream tools.
3. **Mindblown as a card consumer (or as a target)** — concrete integration with the Mindblown runtime. Either Mindblown reads `card.lock` and the extracted tree (consumer model), or drwn writes into Mindblown's mount layout (target model). Pick one early; both are coherent.

None of this is wedged into Wave 2. Wave 2 ships as planned (capture + quality signals). Mind substrate is its own wave.

In the meantime, the `@remyjkim/l6-mind-card` pattern (skills-only, procedural mind content with description triggers, "Assumes" guards for consumer-side scaffolding) is the upper bound of what's reachable today. It is sufficient for personal-knowledge minds where the consumer owns the raw data; it is not sufficient for a rentable Mindblown mind that ships its own raw data. That gap is the case for doing the substrate work.

---

## 7. Cross-references

- The Wave-1 hooks rollout (`60_drwn-card-hooks-target-architecture.md`) is the right precedent for sizing both the baked-memory slot and the system-prompt slot. Same shape of change: new manifest field, source-layout convention, lockfile bump, doctor support, downstream writer, consent/trust gate composition.
- The five load-bearing decisions (`52_drwn-target-architecture-post-wave-1.md` §1) all survive Matt's proposal intact. The proposal extends what cards can carry; it does not relax any of: Git-backed storage, filesystem-as-API, two-phase intent/materialization, three downstream mechanisms, lockfile-pinned reproducibility.
- The `@remyjkim/l6-mind-card` task (`tasks/45_plan1_l6-mind-card-from-personal-assistant.md`, `tasks/45_completion_l6-mind-card.md`) is the existing precedent for L2-style procedural mind content on cards.
- Wave 2 scope is fixed: capture flow + quality-signal manifest fields. Memory is not in Wave 2 and Matt is correct to flag that.
