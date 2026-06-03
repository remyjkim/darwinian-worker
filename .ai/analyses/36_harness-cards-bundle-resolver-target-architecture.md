# Harness Cards: Bundle Resolver — Target Architecture (Wave 1)

**Date**: 2026-05-26
**Author**: Claude + Remy
**Status**: Draft
**References**: [analyses/26_harness-cards-target-architecture.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/32_harness-cards-vs-flox-and-conda.md, tasks/14_completion_harness-cards-v1_1-implementation.md, tasks/19_completion_harness-cards-m6-m7-scope-diagnostics.md, knowledges/02_per-project-config-guide.md, knowledges/03_npm-skill-bundles-guide.md]

---

## 1. Executive Summary

Wave 1 makes harness cards behave the way `29_harness-cards-target-architecture-v1_1.md` promised: **a card's bundled skill content is the source of truth for materialization, the integrity hash is computed over that content, and the resolver consults the card store before any shared registry.**

The catalyst is Matt's smoke-test report (`[Matt] Harness Cards v1.1 — Smoke Run + DX Notes`, 2026-05-26) on PR #3. Five of seven card-bundled skills were silently dropped on `bgng write`; the two that did materialize were symlinked to `beginning-harness/skills/shared/<name>`, not into the card store; and `bgng store migrate` self-disabled after any card command ran. The behavior is a **selector implementation** sitting under a **bundle architecture document** — the integrity hash promises reproducibility but the on-disk files can drift via repo edits.

Wave 1 closes the gap with the smallest viable slice:

1. **Resolver becomes cards-aware.** Skill names from applied cards resolve into `~/.agents/bgng/cards/<scope>/<name>/<version>/skills/<skill-name>/`. Symlinks point there. The harness repo's `skills/shared/` becomes a user-default fallback layer, not the primary resolution path.
2. **Integrity is computed over content.** `computeCardIntegrity` hashes the bundled tree (manifest + skills + mcp-servers), not the manifest JSON alone. The lockfile's `integrity` field finally means what the architecture doc says it means.
3. **Manifest and lockfile schemas are extended for Wave 2 forward-compatibility** without yet activating Wave 2 behaviors. Validation accepts both shapes; a single optional `registry` block in the lockfile is reserved and recorded as `null` for now.
4. **Two adjacent bugs ship in the same wave** — Matt's finding A (legacy detection short-circuits after `ensureStoreInitialized()`) and finding D (duplicate symlink intents in `bgng write --dry-run`).

Wave 1 does **not** add registry references, registry pinning, multi-registry resolution, or authoring helpers. Those are Wave 2 (`37_harness-cards-registry-pinning-target-architecture.md`).

The mental model after Wave 1: cards are **bundles** in the pnpm sense — a global content-addressed-by-version store at `~/.agents/bgng/cards/`, project-local lockfile pinning, project-local symlinks into the store.

---

## 2. Motivation

### 2.1 What is currently broken

Direct evidence from `cli/core/`:

- **`cli/core/skills.ts::findAvailableSkill`** (lines 120–122):
  ```ts
  export async function findAvailableSkill(repoRoot: string, agentsDir: string, name: string) {
    return (await findRepoSkill(repoRoot, name)) ?? (await findPackageSkill(agentsDir, name));
  }
  ```
  The resolver checks the harness repo's `skills/shared/` and the user's installed skill packages under `~/.agents/skills/`. There is no code path that consults `~/.agents/bgng/cards/<scope>/<name>/<version>/skills/`. A grep for `card` in `cli/core/skills.ts` returns zero hits.

- **`cli/core/card-store.ts::computeCardIntegrity`** (line 217):
  ```ts
  return `sha256-${createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}`;
  ```
  The integrity hash is over `JSON.stringify(manifest)`. Bundled content (`skills/`, `mcp-servers/`) is not part of the hash. The lockfile's `integrity` field therefore cannot detect content drift even if drift were checked.

- **`cli/core/migration.ts::detectLegacyLayout`** (per Matt's trace):
  ```ts
  return (hasLegacyConfig || hasLegacyLibrary || hasLegacyPackages) && !hasStore;
  ```
  `bgng card new` writes `store.json` via `ensureStoreInitialized()`, after which `hasStore` is true permanently and detection returns `false` regardless of whether legacy `~/.agents/bgng/config.json` data is still on disk. Migration becomes unreachable.

- **`bgng write --dry-run`** (Matt's finding D): when a skill is present in both a card and the user-defaults layer, two competing symlink intents are emitted with different targets. The actual `bgng write` dedupes silently; the planner output does not reveal which layer wins.

### 2.2 Why a selector implementation is wrong

The shipped architecture documents commit to bundle semantics:

- `26_harness-cards-target-architecture.md` §1: *"Cards are immutable once published, stored locally under `~/.agents/bgng/cards/<scope>/<name>/<version>/`."*
- `29_harness-cards-target-architecture-v1_1.md` §1: *"The mental model is 'uv/pnpm for harnesses' with one refinement — the store is local-authoritative."*
- `32_harness-cards-vs-flox-and-conda.md` Executive Summary: *"the harness cards architecture is most accurately described as Flox's package-manager-with-store-and-lockfile model composed with stow/chezmoi's symlink-and-merge materialization layer."*

A selector implementation does not deliver any of those promises. The lockfile's `integrity` field becomes ornamental; cross-machine portability requires every consumer to hold an identical checkout of `beginning-harness`; bumping a skill's content does not require a card version bump.

Wave 1 closes that gap. Wave 2 reintroduces selector semantics deliberately, with explicit registry pinning, after Wave 1 has established the bundle baseline.

### 2.3 Non-goals (deferred to Wave 2)

- No registry-reference path. Cards in Wave 1 must bundle every skill they include.
- No registry pinning concept. The lockfile carries a reserved `registry` field but it is always `null` after Wave 1.
- No multi-registry support, no published-artifact identity, no custom registry types.
- No new authoring CLI (`card add-skill`, `card import-skill`). The DX gap Matt flagged is acknowledged in §10 but addressed in a later effort.

---

## 3. Vocabulary additions

Most of the vocabulary from `26_*-target-architecture.md` §3 still holds. Wave 1 sharpens two terms:

| Term | Meaning in Wave 1 |
|---|---|
| **Card-bundled skill** | A skill whose content lives under `~/.agents/bgng/cards/<scope>/<name>/<version>/skills/<skill-name>/`. The bundle is the canonical source. In Wave 1, every skill included by a card is by definition card-bundled. |
| **User-default skill** | A skill that resolves from outside the card store — `beginning-harness/skills/shared/` or `~/.agents/skills/`. Available to a project only when no card supplies a skill of the same name. Functions as a fallback. |
| **Content integrity** | A `sha256-` digest computed over the bundled directory tree (manifest + skills + mcp-servers, deterministically serialized). Replaces today's manifest-only integrity. |
| **Resolution layer** | An ordered list of skill sources consulted at write time. Wave 1 has two layers: card-bundled (highest precedence) and user-defaults (fallback). |

---

## 4. Architectural Overview

### 4.1 The resolution layers

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer 1: Card-bundled                                           │
│  Path: ~/.agents/bgng/cards/<scope>/<name>/<version>/skills/     │
│  Populated by: bgng card publish                                 │
│  Authoritative for: any skill name listed in an applied card     │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ fallback only when no applied card
                              │ supplies a skill of this name
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 2: User-defaults                                          │
│  Paths: beginning-harness/skills/shared/                         │
│         ~/.agents/skills/  (curated user-default skills)         │
│  Populated by: harness repo authors; bgng skills curate          │
│  Authoritative for: skill names referenced directly by project   │
│                     config overlay, not via any card             │
└──────────────────────────────────────────────────────────────────┘
```

The resolver always tries Layer 1 first for any skill name attributable to an applied card. Only names that appear in the project config's direct `skills.include` overlay (and not in any applied card) fall to Layer 2. This makes user-defaults a deliberate, narrow concept rather than an implicit registry.

### 4.2 The card store as canonical content

`~/.agents/bgng/cards/<scope>/<name>/<version>/` is the pnpm-style global store. Wave 1 changes nothing about its layout:

```
~/.agents/bgng/cards/
  @matt/
    frontend-design/
      1.0.0/
        card.json
        .integrity
        skills/
          frontend-design/
            SKILL.md
          polish/
            SKILL.md
          ...
        mcp-servers/
          context7.json
```

What changes is who reads from it. Today nobody. After Wave 1, `bgng write` reads from this tree for every skill listed in any applied card.

### 4.3 The symlink contract

For a project applying `@matt/frontend-design@1.0.0`:

```
<project>/.claude/skills/frontend-design
  → ~/.agents/bgng/cards/@matt/frontend-design/1.0.0/skills/frontend-design

<project>/.codex/skills/frontend-design
  → ~/.agents/bgng/cards/@matt/frontend-design/1.0.0/skills/frontend-design
```

The card-store target replaces the current `beginning-harness/skills/shared/frontend-design` target whenever the skill name is supplied by a card. Existing managed-field/symlink ownership tracking from `cli/core/write-record.ts` continues to apply; the write-record now records card store paths as targets.

### 4.4 Content integrity

`computeCardIntegrity` is rewritten to digest the published tree, not the manifest JSON:

1. Walk `<version>/` recursively, excluding the `.integrity` file itself.
2. For each file in lexicographic order: record relative path, file mode bits relevant to executable flag, sha256 of file content.
3. Serialize the resulting list as a canonical JSON array and sha256 it.
4. Final form: `sha256-<hex>`.

The hash is written to `.integrity` at publish time and stored in the project lockfile's `integrity` field on apply. Subsequent applies verify the store contents still match. A mismatch refuses the apply unless `--force` is passed.

### 4.5 Forward-compatibility hooks

Wave 1 reserves schema fields for Wave 2 without activating them:

- `card.json` manifest accepts a new optional `skills.shared` array. Validation in Wave 1 **rejects** non-empty `skills.shared` with a clear error pointing at the Wave 2 doc. The field exists in the schema so Wave 2 can flip it on without a manifest format change.
- Lockfile entries accept an optional `registry` block. Wave 1 emits `null` for it and ignores it on read. Wave 2 populates it.

This means projects locked under Wave 1 are forward-compatible with Wave 2 readers, and Wave 2 cards that downgrade to Wave 1 readers produce a clear "shared registry not supported" error rather than silent corruption.

---

## 5. Schemas

### 5.1 Card manifest (`card.json`)

```jsonc
{
  "name": "@matt/frontend-design",
  "version": "1.0.0",
  "description": "Frontend design skill bundle",
  "harness": { "min": "0.1.0" },
  "skills": {
    "include": ["frontend-design", "polish", "typeset", "animate", "critique", "delight"],
    // Reserved for Wave 2. Wave 1 rejects non-empty.
    "shared": []
  },
  "servers": { "context7": {} },
  "extensions": {},
  "targets": {}
}
```

Validation changes in `cli/core/card-manifest.ts`:

- `skills.include` continues to be the canonical list of card-bundled skill names.
- Every name in `skills.include` MUST have a corresponding directory under the source's `skills/<name>/` containing a `SKILL.md`. Today's publish step does not enforce this; Wave 1 adds the check at both publish time and apply time.
- `skills.shared` is parsed but rejected with: `"skills.shared is reserved for Wave 2 (registry references). Wave 1 supports only bundled skills."` if non-empty.

### 5.2 Lockfile (`<project>/.agents/bgng/card.lock`)

```jsonc
{
  "version": 1,
  "cards": [
    {
      "name": "@matt/frontend-design",
      "version": "1.0.0",
      "integrity": "sha256-<content-hash>",
      // Reserved for Wave 2. Wave 1 always emits null.
      "registry": null,
      // New in Wave 1. Lists which skill names were sourced from this card at apply time.
      "skills": ["frontend-design", "polish", "typeset", "animate", "critique", "delight"]
    }
  ]
}
```

Schema changes in `cli/core/card-lock.ts`:

- New optional `registry: null | object` field per card entry. Wave 1 readers ignore non-null values with a warning; Wave 1 writers always emit `null`.
- New required `skills: string[]` field per card entry, recording which skill names this card contributed at apply time. Used by the resolver to decide layer attribution without re-reading the card manifest.
- Existing readers (M5 lockfiles) without the `registry` and `skills` fields are upgraded on next apply by re-reading the resolved manifest. No on-disk migration is needed; the upgrade is implicit.

### 5.3 Write-record (`<project>/.agents/bgng/write-record.json`)

The write-record from M2 already tracks managed symlinks with resolved absolute targets. Wave 1 introduces no schema changes here. Existing entries with `skills/shared/<name>` targets are recognized as stale on next write (because the desired target moves to the card store) and cleaned up via normal managed-symlink cleanup. No special migration logic needed.

---

## 6. Resolver Algorithm

### 6.1 Inputs

At `bgng write` time, the planner has:

- Resolved card list from the lockfile (`name`, `version`, `skills[]`)
- Project config overlay (`skills.include[]`, `skills.exclude[]`)
- The harness repo root (for Layer 2 user-defaults)
- The agents dir (for Layer 2 curated user-defaults)

### 6.2 Per-skill resolution

For each effective skill name `S` after overlay merge:

1. **Card attribution.** Walk applied cards in lockfile order. The first card whose `skills[]` contains `S` is the attributed card.
2. **If attributed:** target path is `<agentsDir>/cards/<scope>/<name>/<version>/skills/<S>/`. The path MUST exist (publish-time validation guarantees it; if it does not, fail the write with "card store corrupt: re-run bgng cards apply --force"). No fallback to Layer 2 — bundle attribution is authoritative.
3. **If not attributed:** target path resolves via Layer 2 by calling the existing `findAvailableSkill(repoRoot, agentsDir, S)`. If that returns `null`, emit a clear error: `"skill '<S>' is not provided by any applied card and is not available as a user-default; check spelling or add a card that provides it."` (Replaces today's `"unknown skill override include: <name>"`.)

### 6.3 Precedence between cards

When multiple applied cards list the same skill name, the existing M5 bundle conflict resolution (`§7.7` in `29_*-target-architecture-v1_1.md` — intersect-and-pick-highest) decides which card wins. The winning card is the attribution source. No change to that algorithm in Wave 1.

### 6.4 Project overlay interaction

The project config's `skills.include` continues to extend the effective skill set with names that may not appear in any card. Those names resolve via Layer 2 only. The project config's `skills.exclude` continues to drop names from the effective set regardless of which layer would have supplied them.

### 6.5 Resolver implementation surface

Wave 1 introduces a new module:

- `cli/core/card-skill-resolver.ts` — exports `resolveSkillSource(lockfile, projectOverlay, repoRoot, agentsDir, name) → { layer: "card", cardName, version, path } | { layer: "user-default", path } | { layer: "missing" }`.

`cli/core/skills.ts::syncSkills` is updated to call `resolveSkillSource` instead of `findAvailableSkill` directly. `findAvailableSkill` is preserved as the Layer 2 implementation and called from inside the resolver.

---

## 7. Planner Output (Matt finding D)

`bgng write --dry-run` output is rewritten to dedupe symlink intents at the planner level rather than at write time:

- The planner runs `resolveSkillSource` for every effective skill **before** emitting intents. Each effective name has exactly one resolved target.
- Output format adds a `← layer` suffix per symlink intent, e.g.:
  ```
  - symlink .claude/skills/verification-before-completion → ~/.agents/skills/verification-before-completion  ← user-default
  - symlink .claude/skills/frontend-design → ~/.agents/bgng/cards/@matt/frontend-design/1.0.0/skills/frontend-design  ← card @matt/frontend-design@1.0.0
  ```
- When two layers compete for the same name, the dry-run output shows the winner and notes the suppressed alternative on a `(also available)` line. This makes the dedupe decision visible.

No new tests are needed for the formatting itself beyond a snapshot test of dry-run output for a known scenario.

---

## 8. Adjacent Fixes (Wave 1 scope)

### 8.1 Legacy detection short-circuit (Matt finding A)

`cli/core/migration.ts::detectLegacyLayout` is rewritten:

```ts
// Before
return (hasLegacyConfig || hasLegacyLibrary || hasLegacyPackages) && !hasStore;

// After
return hasLegacyConfig || hasLegacyLibrary || hasLegacyPackages;
```

The `!hasStore` clause is dropped. Detection now reports `true` whenever any legacy artifact still exists on disk, regardless of whether the cards-era store has been initialized. `bgng store migrate` becomes idempotent and reachable until legacy artifacts are fully cleaned up.

`bgng store status` will then report `legacyLayoutDetected: true` until migration runs to completion. The migration command itself already handles the "store already exists, but legacy data still present" case by moving the legacy data forward — no separate fix needed in `migrate.ts`.

### 8.2 Integrity hash over content

`cli/core/card-store.ts::computeCardIntegrity` signature changes from `(manifest: CardManifest)` to `(versionDir: string)` and walks the published tree as described in §4.4. All callers update; the four call sites are all within `card-store.ts` itself.

A migration concern: existing lockfiles produced under M4–M7 have integrity hashes over `JSON.stringify(manifest)`. On first apply under Wave 1, the lockfile's `integrity` will not match the new content-hash output. The apply command recomputes from the resolved card store and updates the lockfile, emitting:

```
INFO upgraded integrity hash for @matt/frontend-design@1.0.0 from manifest-hash to content-hash
```

This is a one-time transition. No `--force` is required because the v1.1 hash was unverifiable in practice.

---

## 9. CLI Surface (deltas only)

Wave 1 keeps the user-facing surface stable. Only two visible changes:

- `bgng write` and `bgng write --dry-run` output is reorganized per §7. Existing commands and flags unchanged.
- `bgng cards apply` and `bgng apply` may emit the one-time integrity upgrade INFO line per card on first run after upgrade.

No new commands. No flag renames. The `--force` flag on `bgng write` and `bgng cards apply` retains its meaning and now additionally permits proceeding past an integrity mismatch.

---

## 10. Testing Strategy

New test files:

- `test/core-card-skill-resolver.test.ts` — unit tests for `resolveSkillSource` covering: card-only attribution, user-default fallback, missing skill, exclude precedence, multi-card conflict.
- `test/scenarios-card-bundled-only.test.ts` — end-to-end: publish a card with a skill name *not* present in `skills/shared/`, apply it to a temp project, run `bgng write`, assert `.claude/skills/<name>` symlinks into the card store, not the harness repo.
- `test/core-card-integrity-content.test.ts` — verifies `computeCardIntegrity` hashes content; mutating a `SKILL.md` byte changes the hash; reordering files in the walk does not.

Modified test files:

- `test/core-migration.test.ts` — add a regression case: legacy artifacts present AND store initialized → detection still returns `true`; migrate runs and clears legacy data; second detection returns `false`.
- `test/commands-write.test.ts` — update snapshots for the new dry-run output format.
- `test/scenarios-card-materialization.test.ts` — update existing expectations (symlink targets now point at card store).
- `test/core-card-lock.test.ts` — add cases for the new `registry: null` and `skills[]` fields; lockfile readers tolerate missing fields from M5 era.

Reused infrastructure: `AGENTS_DIR` test isolation (§11.6 of v1.1 architecture doc) continues to apply. All new tests use temp dirs under that convention.

The complete test bar after Wave 1: full `bun test` suite green, including a regression for each Matt finding (A, B, C, D).

---

## 11. Implementation Milestones

Wave 1 sequences into four PR-able units. They can land in one PR if cohesive, or split if review surface gets large.

**W1.M1 — Content integrity + manifest validation tightening**
- Rewrite `computeCardIntegrity` to hash content tree.
- Add publish-time validation: every name in `skills.include` has a backing directory under source `skills/`.
- Add apply-time validation: card store tree matches `.integrity`.
- Reject non-empty `skills.shared` with the Wave-2-reserved error.
- Files: `cli/core/card-store.ts`, `cli/core/card-manifest.ts`, new `test/core-card-integrity-content.test.ts`.

**W1.M2 — Cards-aware resolver + write planner integration**
- New `cli/core/card-skill-resolver.ts` with `resolveSkillSource`.
- Lockfile schema extends with `skills[]` and reserved `registry`.
- `cli/core/skills.ts::syncSkills` consumes the resolver.
- Replace `unknown skill override include` warning with the new clear error.
- Files: `cli/core/card-skill-resolver.ts` (new), `cli/core/card-lock.ts`, `cli/core/skills.ts`, `cli/core/sync.ts`, new `test/core-card-skill-resolver.test.ts`, new `test/scenarios-card-bundled-only.test.ts`.

**W1.M3 — Planner dedupe and dry-run output**
- Dedupe symlink intents in the planner before emitting.
- Format dry-run lines with `← layer` annotation.
- Files: `cli/core/sync.ts` or write planner module, update `test/commands-write.test.ts` snapshots.

**W1.M4 — Legacy detection fix + one-time integrity upgrade**
- Drop the `!hasStore` clause in `detectLegacyLayout`.
- Emit the `upgraded integrity hash` INFO line on first apply after upgrade.
- Files: `cli/core/migration.ts`, `cli/core/card-project.ts` (apply path), update `test/core-migration.test.ts`.

Dependency: M2 depends on M1 (resolver needs the integrity surface stable). M3 depends on M2 (planner uses the resolver). M4 is independent and can ship in parallel.

---

## 12. Migration and Compatibility

**Lockfiles produced under M5–M7** are upgraded transparently on first apply after Wave 1:
- Missing `registry` field → written as `null`.
- Missing `skills[]` field → populated from the resolved card manifest.
- Manifest-hash `integrity` → recomputed as content-hash, lockfile updated, one-time INFO emitted.

**Cards published under M4** have manifest-only `.integrity` files. On first read after Wave 1, the integrity is recomputed and `.integrity` is rewritten. No re-publish is required.

**Existing symlinks** in `.claude/skills/` targeting `beginning-harness/skills/shared/<name>` for names that are now card-attributed will be recognized as stale by the write-record on next `bgng write` and replaced with card-store targets via normal managed-symlink cleanup.

**No data loss path.** Every Wave 1 change is forward-recoverable from the card source dirs and the project config; nothing on disk is destroyed by the upgrade.

---

## 13. Risks and Open Questions

### 13.1 Risks

- **`skills/shared/` semantic shift.** Today many projects implicitly resolve everything from `skills/shared/`. After Wave 1, names attributable to a card no longer resolve there. For projects that pinned `@matt/frontend-design` expecting "use the harness repo's copy," the symlink target changes. Mitigation: the target swap is visible in `bgng status --explain` and the write-record. Risk is low because the bundled SKILL.md content was copied from `skills/shared/` at card publish time, so content is identical at version 1.0.0.
- **Integrity recomputation in CI.** A project's CI that runs `bgng cards apply` will rewrite the lockfile's `integrity` field on first run after upgrade, producing a diff. Mitigation: document the one-time migration in the release notes for the wave; commit the lockfile after first upgrade.
- **Card source schema enforcement on publish.** Adding the "every name in `skills.include` has a `skills/<name>/` dir" check at publish will break existing card sources that were under construction. Mitigation: this catches Matt's exact bug class (silently shipping incomplete cards), so failing loud at publish is desirable. Document in release notes.

### 13.2 Open questions

- **Should the harness repo's `skills/shared/` register as Layer 2 always, or only for projects that opt in?** Wave 1 keeps the current behavior (always available as fallback). If a future user wants strict bundle-only resolution, they can use `skills.exclude` in their project config to drop user-default fallbacks. Revisit if real users complain.
- **Should `bgng cards apply` recompute `.integrity` in the card store, or only verify?** Wave 1: recompute and warn on mismatch unless `--force`, then accept. Verify-only would be stricter but breaks the smooth M4 → Wave 1 transition. Wave 2 may tighten this.

---

## 14. Decision Log

| # | Decision | Rationale |
|---|---|---|
| 1 | Wave 1 ships bundle-only, no shared references. | Smallest viable slice that delivers what the architecture docs already promise. Selector lives in Wave 2. |
| 2 | `skills.shared` is reserved but rejected if non-empty. | Forward-compatibility for Wave 2 without smuggling Wave 2 behavior into Wave 1. |
| 3 | Integrity is computed over content, not manifest. | Today's hash is structurally unable to detect content drift. Wave 1 fixes this as a precondition for Wave 2's registry-pin story. |
| 4 | Resolver attribution is by lockfile's `skills[]` list, not by re-reading the manifest. | Decouples the resolver from disk reads at write time; the lockfile is the source of truth for "which card provides which name." |
| 5 | User-defaults (Layer 2) remain available as fallback for project-overlay names. | Avoids forcing every project to pin a card just to use `skills/shared/` skills directly. The strict-bundle option can be added later if requested. |
| 6 | Drop `!hasStore` from legacy detection. | Matt finding A. The clause is a one-way trap that has no benefit. |
| 7 | Dry-run output annotates which layer wins. | Matt finding D. Dedupe in the planner is correct; making the decision visible is the user-facing complement. |
| 8 | One-time integrity upgrade is non-`--force`. | The v1.1 hash was structurally unverifiable; treating the upgrade as a normal first-apply step matches the actual safety guarantee available. |

---

## 15. Out of Scope (Wave 2)

The following are intentionally not addressed in Wave 1 and belong to `37_harness-cards-registry-pinning-target-architecture.md`:

- `skills.shared` activation — cards able to reference skills they do not bundle.
- Registry concept — what a registry is, what kinds exist, how it is pinned.
- Registry verification at write time — drift refusal on registry SHA / version mismatch.
- Multi-registry resolution rules.
- `bgng cards outdated` extension to surface registry drift.
- Authoring helpers (`card add-skill`, `card import-skill`). These are valuable but orthogonal to either wave; tracked separately.

Wave 2 builds on every Wave 1 invariant: content integrity, cards-aware resolver, the reserved `registry` lockfile field. Without Wave 1 those invariants do not exist, and Wave 2 cannot deliver reproducibility under selector semantics.
