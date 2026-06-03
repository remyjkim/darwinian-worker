# Harness Cards: Registry References with Pinning — Target Architecture (Wave 2)

**Date**: 2026-05-26
**Author**: Claude + Remy
**Status**: Draft
**References**: [analyses/36_harness-cards-bundle-resolver-target-architecture.md, analyses/26_harness-cards-target-architecture.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/32_harness-cards-vs-flox-and-conda.md, knowledges/02_per-project-config-guide.md, knowledges/03_npm-skill-bundles-guide.md]

---

## 1. Executive Summary

Wave 2 introduces the **selector** path on top of Wave 1's bundle baseline: a card can reference skills from a **registry** without bundling their content, and the registry version is pinned in the project lockfile so reproducibility is preserved.

The shape is *bundle by default, registry-reference by exception*. A card's `card.json::skills.shared` (reserved by Wave 1 and rejected if non-empty) becomes active in Wave 2. Skills listed there resolve from a configured registry rather than the card's own `skills/` directory. On apply, the project lockfile records both the card's content integrity (already correct from Wave 1) and the registry's identity + version (new in Wave 2). On write, the resolver consults the registry at the pinned version; if the local registry state has drifted, the write refuses unless `--force` is passed — mirroring the managed-field drift refusal pattern from M3.

The principal Wave 2 design decision — which Wave 1 deliberately deferred — is **what a "registry" is**. This document recommends **published-artifact pinning** (the registry is `beginning-harness@<semver>` resolved from npm) as the primary kind, with a `git-sha` kind retained for development workflows. Custom registry URLs are deferred to a future iteration.

Wave 2 also delivers the visibility surface the selector path requires: `bgng cards outdated` learns to surface registry drift, `bgng status --explain` attributes shared-resolved skills to their registry, and dry-run output annotates the registry layer the same way Wave 1 annotated the bundle layer.

What Wave 2 does **not** do: it does not introduce custom or third-party registries, it does not introduce networked card distribution (cards remain local-published in v1), and it does not add authoring helpers (`card add-skill --bundle | --from-registry`) — those land in a separate authoring-DX effort.

---

## 2. Motivation

### 2.1 Why selector exists at all

Wave 1 forces every skill consumed via a card to be bundled inside that card. That is a strong guarantee but it carries real costs:

- **Disk duplication.** Ten projects pinning ten different cards that all bundle a `polish` skill hold ten copies of `polish/SKILL.md`. Content-addressed dedupe (already on the v2 roadmap per `fb40067`) reduces but does not eliminate this.
- **Update fan-out.** Improving a widely-used skill requires bumping every card that bundles it. For a personal harness with many cards that share a common skill set, this is friction without proportional benefit.
- **Authoring friction.** Matt's report: *"Authoring the card took ~10× longer than applying it."* Much of that cost is `cp -RL`-ing skill directories into the card source.

Selector references reclaim those costs by allowing a card to opt in to "I want this skill, but I don't want to own the bytes." That is exactly the npm peer-dependency or pnpm hoisting pattern — except cards in Wave 2 make the trade-off reproducible by **pinning the registry version** in the lockfile.

### 2.2 Why pinning is the load-bearing piece

The original critique of selector semantics in `36_*-bundle-resolver-target-architecture.md` §2.2 was not that selector is *wrong*, but that selector *without a registry pin* breaks the integrity story:

> the integrity hash promises one thing
> but the actual on-disk content can drift via repo edits
> so the integrity guarantee is a lie under the current resolver

Registry pinning fixes exactly that. The lockfile records "this card resolved `verification-before-completion` against registry `beginning-harness@0.3.1`" — the integrity guarantee then extends across both the card content (Wave 1) and the registry content (Wave 2). Cross-machine reproducibility holds if and only if the consumer can reproduce the registry at the pinned version.

### 2.3 The architectural shape Wave 2 commits to

Wave 2 keeps the Wave 1 layer ordering intact and adds one new layer:

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer 1: Card-bundled                                           │
│  (unchanged from Wave 1)                                         │
└──────────────────────────────────────────────────────────────────┘
                              │ fallback when no bundle
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 2: Registry reference (NEW in Wave 2)                     │
│  Path: pinned registry artifact (see §5 for resolution by kind)  │
│  Triggered by: skills.shared[] in an applied card                │
│  Pin source: lockfile's per-card registry block                  │
└──────────────────────────────────────────────────────────────────┘
                              │ fallback for project-overlay names
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 3: User-defaults                                          │
│  (Wave 1's Layer 2, renumbered)                                  │
└──────────────────────────────────────────────────────────────────┘
```

Layer 2 is consulted **only for names listed in an applied card's `skills.shared`**. It is not a general fallback; it is opt-in per card per skill. Names referenced via project-overlay continue to fall through to Layer 3 (user-defaults).

This three-layer scheme keeps the resolver's decisions auditable: every effective skill resolves to exactly one layer, and `bgng status --explain` reports which.

---

## 3. Vocabulary additions

| Term | Meaning in Wave 2 |
|---|---|
| **Registry** | A named, pinnable source of skill content. Identified by **kind** and **pin**. Wave 2 supports two kinds: `published-artifact` and `git-sha`. |
| **Registry pin** | The exact identity recorded in the lockfile that lets a consumer reproduce the registry state at apply time. For `published-artifact`, it is the artifact version (`beginning-harness@0.3.1`). For `git-sha`, it is `{repo, sha}`. |
| **Registry kind** | The mechanism used to resolve a pin to actual files on disk. Each kind has its own resolver implementation. |
| **Shared-reference skill** | A skill listed in a card's `skills.shared[]`. Resolved from the registry, not the card store. Distinct from card-bundled skills. |
| **Registry drift** | A divergence between the pin recorded in the lockfile and the actual state of the local registry at write time. Triggers `--force` refusal. |
| **Default registry** | The registry consumed when a card does not explicitly name one. In Wave 2, the default registry is `beginning-harness` resolved as `published-artifact` if the consumer's machine has it npm-installed, falling back to `git-sha` against the local harness checkout for development workflows. |

---

## 4. Manifest and Lockfile Schema

### 4.1 Card manifest (`card.json`)

Wave 2 activates the `skills.shared` field reserved in Wave 1 and adds an optional `registries` block:

```jsonc
{
  "name": "@matt/frontend-design",
  "version": "1.1.0",
  "harness": { "min": "0.2.0" },
  "skills": {
    "include": ["frontend-design", "polish", "typeset"],
    "shared": ["verification-before-completion"]
  },
  // Optional. If omitted, all shared references resolve via the default registry.
  "registries": {
    "verification-before-completion": "default"
  },
  "servers": {},
  "extensions": {},
  "targets": {}
}
```

Notes:

- A name in `skills.shared` MUST NOT also appear in `skills.include`. Validation at publish time and apply time rejects the overlap with a clear error.
- The `registries` map is optional. Each entry maps a shared-skill name to a registry name. Wave 2 supports the literal `"default"` as the only registry name; future iterations may add named third-party registries.
- For Wave 2, every entry in `skills.shared` must resolve to `default` (either implicitly or explicitly). Non-default registry names are rejected with `"custom registries are reserved for a future wave"`.

### 4.2 Lockfile (`<project>/.agents/bgng/card.lock`)

The `registry` field reserved as `null` in Wave 1 is now populated:

```jsonc
{
  "version": 2,
  "cards": [
    {
      "name": "@matt/frontend-design",
      "version": "1.1.0",
      "integrity": "sha256-<content-hash>",
      "skills": ["frontend-design", "polish", "typeset"],
      "sharedSkills": ["verification-before-completion"],
      "registry": {
        "name": "default",
        "kind": "published-artifact",
        "artifact": "beginning-harness",
        "version": "0.3.1",
        "integrity": "sha256-<registry-content-hash>"
      }
    }
  ]
}
```

Schema additions:

- New required `sharedSkills: string[]` per card entry. Mirrors Wave 1's `skills[]` but for the registry layer. Wave 1 lockfiles upgrade to add an empty `sharedSkills: []` on first apply under Wave 2.
- `registry` is now non-null when `sharedSkills` is non-empty. Its shape depends on `kind`; see §5 for the per-kind structure.
- Top-level `version` bumps from `1` to `2`. Wave 2 readers accept both; Wave 2 writers always emit `2`.

### 4.3 Machine config (`~/.agents/bgng/machine.json`)

Wave 2 introduces a `registries` block to record where the default registry resolves from on this machine:

```jsonc
{
  // ... existing fields ...
  "registries": {
    "default": {
      "kind": "published-artifact",
      "artifact": "beginning-harness",
      "resolvedFrom": "npm-global"
    }
  }
}
```

Or for a development checkout:

```jsonc
{
  "registries": {
    "default": {
      "kind": "git-sha",
      "repo": "/Users/remyjkim/dev/beginning-harness",
      "branch": "main"
    }
  }
}
```

This is machine state; it is NOT in the lockfile and does not affect reproducibility. The lockfile records what was resolved at apply time. The machine config tells `bgng` where to look on *this* machine to honor that pin.

`bgng init --registry <kind>` and `bgng store set-registry <kind>` populate this. A reasonable default is auto-detected on first card apply: if `beginning-harness` is reachable via the npm global prefix, use `published-artifact`; else fall back to the harness repo checkout that holds the running CLI.

---

## 5. Registry Kinds

### 5.1 `published-artifact` (primary)

The default registry kind. The registry is `beginning-harness` resolved as an npm package.

**Pin shape** (in lockfile):
```jsonc
{
  "kind": "published-artifact",
  "artifact": "beginning-harness",
  "version": "0.3.1",
  "integrity": "sha256-<tarball-content-hash>"
}
```

**Resolution at write time:**

1. Read the pin from the lockfile.
2. Resolve via the machine's npm global modules: `<npm-prefix>/lib/node_modules/beginning-harness/`.
3. Verify the resolved path's version matches the pin. If not, registry drift — refuse unless `--force`.
4. Verify the content hash of the registry's `skills/shared/` tree matches the recorded `integrity`. If not, registry drift — refuse unless `--force`.
5. Materialize symlinks pointing at `<npm-prefix>/lib/node_modules/beginning-harness/skills/shared/<name>/`.

**What the `integrity` hash is over.** Identical algorithm to Wave 1's content integrity (§4.4 of doc 36), applied to the registry's `skills/shared/` tree. Files outside that tree do not affect the hash.

**Why this is the recommended primary.** It gives the registry a real identity (the published npm version), it makes cross-machine reproducibility tractable (any machine with the same npm version has the same registry bytes), and it does not couple cards to a particular git fork or commit graph.

**Cost.** It requires `beginning-harness` to actually be published as a package whose `skills/shared/` is a stable public surface. Today the package is published and `skills/shared/` is included via the `files` array in `package.json`. The shift is mostly semantic: `skills/shared/` becomes API.

### 5.2 `git-sha` (development)

For development workflows where the registry is a local harness checkout.

**Pin shape** (in lockfile):
```jsonc
{
  "kind": "git-sha",
  "repo": "https://github.com/remyjkim/beginning-harness.git",
  "sha": "abc123def456...",
  "integrity": "sha256-<skills-shared-tree-hash>"
}
```

**Resolution at write time:**

1. Read the pin from the lockfile.
2. Resolve the machine's configured harness repo path from `machine.json::registries.default.repo`.
3. Read the current `git rev-parse HEAD` of that repo.
4. If `HEAD` matches the pin's `sha` — proceed; symlink targets point at `<repo>/skills/shared/<name>/`.
5. If `HEAD` does not match — registry drift. Refuse unless `--force` is passed AND the consumer accepts a `--allow-sha-mismatch` flag (double opt-in because git SHAs are easy to silently change).
6. Verify the content integrity of `<repo>/skills/shared/` against the recorded `integrity`. Mismatch even at matching `sha` indicates uncommitted local changes — refuse unless `--force`.

**Why retain this.** Development against an unpublished harness checkout is the common case for Remy and any future maintainer. Forcing `published-artifact` for development would require publishing on every iteration.

**Cost.** The `sha` is fork-specific; sharing a lockfile with `git-sha` pins across forks fails by design. This is acceptable because cards pinned to `git-sha` are *meant* to be development-only.

### 5.3 Future kinds (deferred)

Not in Wave 2: `url-content-hash` (registry is a fetched tarball at a known content hash), custom registry servers, federated registries. The schema accommodates them via the `kind` discriminator.

---

## 6. Resolver Algorithm (Wave 2)

The Wave 1 resolver from `36_*-target-architecture.md` §6 extends with a Layer 2 case.

### 6.1 Inputs

Same as Wave 1, plus:

- The lockfile entry's `sharedSkills[]` and `registry` block.
- The machine config's `registries.default` resolution hint.

### 6.2 Per-skill resolution

For each effective skill name `S`:

1. **Card bundle attribution** (Wave 1). Walk applied cards; the first card with `S` in `skills[]` is the attributed card. If found, resolve via Layer 1 — exactly as Wave 1.
2. **Card shared attribution** (Wave 2). If no bundle attribution, walk applied cards again; the first card with `S` in `sharedSkills[]` is the attributed card. If found, resolve via Layer 2:
   - Read the card's `registry` block from the lockfile.
   - Dispatch to the kind-specific resolver (§5.1 or §5.2).
   - Target path is `<resolved-registry-root>/skills/shared/<S>/`.
3. **User-default fallback** (Wave 1 Layer 2, now Layer 3). If neither bundle nor shared attribution found, fall through to `findAvailableSkill` exactly as Wave 1.
4. **Missing.** Same clear error as Wave 1.

### 6.3 Precedence

- Card-bundle attribution always beats card-shared attribution for the same name. A card cannot list the same name in both `include` and `shared` (validation catches this), so the precedence only matters across multiple applied cards.
- Across cards, the existing bundle-conflict resolution from M5 chooses which card wins. The winner's layer (Layer 1 or Layer 2) then drives resolution.
- Project-overlay `skills.exclude` continues to drop names regardless of layer.

### 6.4 Resolver surface

`cli/core/card-skill-resolver.ts` (introduced in Wave 1) extends with:

- A new return shape: `{ layer: "registry", cardName, registryPin, path }`.
- A registry resolver dispatch function: `resolveRegistry(registryPin, machineConfig) → { rootPath, currentIntegrity }`.

The kind-specific resolvers live in new modules:

- `cli/core/registry-published-artifact.ts`
- `cli/core/registry-git-sha.ts`

Each exports a `resolve(pin) → { rootPath, integrity }` and a `verifyMatchesPin(pin, machineConfig) → { ok, reason? }`.

---

## 7. Drift Refusal at Write Time

The pattern mirrors M3's managed-field drift refusal:

1. Before any symlink is materialized for a registry-resolved skill, the planner calls `verifyMatchesPin` for that card's registry pin.
2. If verification returns `ok: false`, the write refuses with:
   ```
   Registry drift detected for card @matt/frontend-design@1.1.0:
     pinned: beginning-harness@0.3.1
     actual: beginning-harness@0.4.0 (npm-global)
   Resolve by:
     - re-applying the card to update the pin: bgng cards update @matt/frontend-design
     - or forcing the write past the pin: bgng write --force
   ```
3. `--force` bypasses verification AND updates the lockfile to record the actual registry state on success, with a console warning that reproducibility was broken in this run.

`bgng doctor` adds a registry drift check that surfaces the same condition without writing.

---

## 8. `bgng cards outdated` and `cards update`

### 8.1 `outdated`

Wave 2 extends `cards outdated` output with a registry-drift section:

```
Outdated cards:
  @matt/frontend-design@1.1.0 → 1.2.0 (semver-update available)

Registry drift:
  @matt/frontend-design@1.1.0
    pinned: beginning-harness@0.3.1
    available: beginning-harness@0.4.0
    affected skills: verification-before-completion
```

The "registry drift" subsection is omitted when no applied card has shared skills.

### 8.2 `update`

`bgng cards update <ref>` learns two new behaviors:

- `--registry-only` updates the registry pin without touching the card version. Useful when the card is unchanged but the registry has moved.
- The default behavior (no flag) updates both: bump the card to its newest matching version per its declared range AND re-resolve the registry pin to the current registry state. Lockfile records both changes.

---

## 9. Status and Diagnostics

`bgng status --explain` attributes shared-skill resolution to the registry pin:

```
Skill: verification-before-completion
  layer:  registry
  source: card @matt/frontend-design@1.1.0 (via skills.shared)
  pin:    beginning-harness@0.3.1
  state:  verified (matches pin)
```

`bgng status --why <name>` for a shared-resolved skill returns the same provenance shape.

`bgng status` overview gains a `registries` section listing each unique pin across the lockfile and the verification state of each.

---

## 10. CLI Surface (deltas only)

New commands:

- `bgng store set-registry <kind> [--repo <path>] [--artifact <name>]` — sets the machine's default registry kind. Writes `machine.json::registries.default`.

Modified commands:

- `bgng cards update [ref]` — gains `--registry-only` flag (see §8.2).
- `bgng cards outdated` — output extended with the Registry drift section (see §8.1).
- `bgng write` — verifies registry pins before materialization; refuses on drift unless `--force` (see §7).
- `bgng doctor` — adds registry drift check.
- `bgng status --explain` / `--why` — reports registry layer attribution (see §9).

Manifest validation in `cli/core/card-manifest.ts`:

- Accepts non-empty `skills.shared`.
- Rejects overlap between `skills.include` and `skills.shared`.
- Rejects custom registry names in `registries` (only `"default"` is allowed in Wave 2).

---

## 11. Testing Strategy

New test files:

- `test/core-registry-published-artifact.test.ts` — pin shape, verification against a fake npm-global tree, integrity computation, drift detection.
- `test/core-registry-git-sha.test.ts` — pin shape, `git rev-parse HEAD` resolution, drift on SHA mismatch, drift on dirty tree.
- `test/scenarios-card-shared-resolution.test.ts` — end-to-end: publish a card that uses `skills.shared`, apply to a project, write, assert symlinks point at the registry root.
- `test/scenarios-registry-drift-refusal.test.ts` — mutate the registry state after apply, run `bgng write`, assert refusal; then `--force`, assert update of lockfile.
- `test/commands-cards-outdated-registry.test.ts` — verifies the registry-drift section in `cards outdated`.

Modified test files:

- `test/core-card-manifest.test.ts` — re-enable `skills.shared` validation tests, add overlap-rejection cases.
- `test/core-card-lock.test.ts` — add cases for `version: 2`, populated `registry` block, Wave 1 `version: 1` lockfile upgrade.
- `test/core-card-skill-resolver.test.ts` — extend with Layer 2 attribution cases.
- `test/commands-status-why.test.ts` — extend with registry-layer attribution assertions.

Test isolation continues to use `AGENTS_DIR`. A new `REGISTRY_ROOT` env var (or equivalent test helper) lets tests point the published-artifact resolver at a fake npm-global tree without requiring an actual `npm install` in CI.

---

## 12. Implementation Milestones

Wave 2 sequences into five PR-able units.

**W2.M1 — Manifest and lockfile schema extension**
- Accept `skills.shared`, validate against overlap.
- Lockfile bumps to `version: 2` with `sharedSkills[]` and populated `registry`.
- Wave 1 lockfile upgrade path: add empty `sharedSkills: []` on first apply.
- Files: `cli/core/card-manifest.ts`, `cli/core/card-lock.ts`, related tests.

**W2.M2 — Registry resolver: `published-artifact`**
- New `cli/core/registry-published-artifact.ts` with `resolve` and `verifyMatchesPin`.
- Auto-detection logic for machine `default` registry on first card apply.
- `bgng store set-registry` command.
- Files: `cli/core/registry-published-artifact.ts` (new), `cli/commands/store/set-registry.ts` (new), `test/core-registry-published-artifact.test.ts` (new).

**W2.M3 — Registry resolver: `git-sha`**
- New `cli/core/registry-git-sha.ts` mirroring the published-artifact resolver.
- `--allow-sha-mismatch` double opt-in flag on `bgng write`.
- Files: `cli/core/registry-git-sha.ts` (new), `cli/commands/write.ts`, `test/core-registry-git-sha.test.ts` (new).

**W2.M4 — Resolver integration + drift refusal**
- Extend `cli/core/card-skill-resolver.ts` with the Layer 2 path.
- Wire `verifyMatchesPin` into the write planner before materialization.
- Refuse-on-drift behavior with the §7 message.
- `bgng doctor` registry drift check.
- Files: `cli/core/card-skill-resolver.ts`, `cli/core/sync.ts`, `cli/commands/doctor.ts`, scenario tests.

**W2.M5 — `cards outdated` / `cards update` + status diagnostics**
- Registry drift section in `cards outdated`.
- `--registry-only` flag on `cards update`.
- Registry layer attribution in `status --explain` / `--why`.
- Files: `cli/commands/cards/outdated.ts`, `cli/commands/cards/update.ts`, `cli/core/diagnostics-sections.ts`, related tests.

Dependencies: M1 ahead of all. M2 and M3 are parallel. M4 depends on M1 + at least one of M2/M3. M5 depends on M4.

---

## 13. Migration and Compatibility

### 13.1 Lockfile version bump

Wave 1 lockfiles are `version: 1`. Wave 2 readers accept both `1` and `2`. On first apply under Wave 2:

- `version: 1` lockfiles are read, augmented with `sharedSkills: []` per card entry, and rewritten as `version: 2`.
- Cards that have no `skills.shared` produce identical resolution under both versions; no behavior change.

### 13.2 Machine config registry initialization

If `machine.json::registries.default` is absent on first apply of a card that uses `skills.shared`:

1. Try to detect `beginning-harness` in the npm global prefix.
2. If found, write `kind: "published-artifact"`, `artifact: "beginning-harness"`.
3. If not found, locate the harness repo via the running CLI's path and write `kind: "git-sha"`, `repo: <path>`.
4. Emit an INFO line documenting the auto-detection so the user can override via `bgng store set-registry`.

### 13.3 Cards published under Wave 1

Cards with empty or absent `skills.shared` are valid in Wave 2 with no changes. Re-publish is not required. New card versions that opt in to `skills.shared` require a `harness.min` bump to a Wave-2-supporting version.

### 13.4 Downgrade

Downgrading from Wave 2 to Wave 1 is supported for any card whose `skills.shared` is empty. Cards using shared references cannot be consumed by Wave 1 readers — the Wave 1 validator rejects non-empty `skills.shared`. This is by design; lockfile `version: 2` is a forward-incompatible flag.

---

## 14. Risks and Open Questions

### 14.1 Risks

- **`skills/shared/` as public API.** Recommending `published-artifact` makes `skills/shared/` part of the `beginning-harness` package's API contract. Removing or renaming a skill there becomes a breaking change. Mitigation: introduce a deprecation policy — never remove a skill that any published card references; mark deprecated, retain content for one minor version.
- **npm-global dependency for default registry.** Users without npm-global access (corporate restrictions, container-only environments) need the `git-sha` path. Mitigation: auto-detection in §13.2 falls through cleanly; `bgng store set-registry git-sha` is a documented escape.
- **Lockfile churn from `--force`.** `--force` past drift updates the lockfile silently to the new state. Mitigation: console warning is loud; consider a `--force --record-drift` flag that records the override decision in a metadata field for audit trails. (Decide in implementation.)
- **Shared-skill content drift between published-artifact and git-sha resolution.** A team mixing both kinds across machines can produce different effective harnesses despite identical lockfiles. Mitigation: `bgng status` registry section reports the kind in use on this machine; CI should pin to one kind via `machine.json` checked into the repo's setup docs.

### 14.2 Open questions

- **Should the lockfile's `registry.integrity` be enforced strictly, or should mismatch warn-and-update?** Wave 2 proposes refuse-unless-`--force`. Alternative: warn and proceed, log the divergence in a project-local `.agents/bgng/registry-audit.log`. The strict-refusal approach matches M3's managed-field drift pattern; tightening or loosening can happen post-Wave-2.
- **Per-card vs. per-project registry pin.** Wave 2 records the pin per-card in the lockfile. An alternative is a single project-wide pin shared across all cards. Per-card is more flexible (different cards could pin different registry versions); single-project is simpler and matches "everything resolves through one registry." Wave 2 ships per-card; can be collapsed to single-project if real usage shows the flexibility is unused.
- **Should `bgng cards update --registry-only` apply globally or per-card?** Wave 2's default behavior is per-card. A `--all` flag for global update is a small follow-up if needed.

---

## 15. Decision Log

| # | Decision | Rationale |
|---|---|---|
| 1 | `published-artifact` is the recommended primary registry kind. | Real identity, cross-machine portability, no fork sensitivity. Cost (treating `skills/shared/` as API) is acceptable because that is what the architecture has implicitly committed to. |
| 2 | `git-sha` is retained for development workflows. | Forcing `published-artifact` would require publishing on every iteration. Development against a local checkout is the common case for maintainers. |
| 3 | Custom and third-party registries are deferred. | Wave 2 already adds substantial surface; widening to multi-registry would over-extend the slice. The schema accommodates additions via `kind`. |
| 4 | Refuse-unless-`--force` on registry drift, mirroring M3. | Consistency with the established drift-handling pattern. Users already know the M3 semantics. |
| 5 | `--force` updates the lockfile to the actual state on success. | Matches `bgng write --force` behavior for managed-field drift. Loud console warning preserves the audit signal. |
| 6 | `skills.shared` cannot overlap with `skills.include`. | Eliminates ambiguity in attribution; rejected loudly at publish and apply. |
| 7 | Machine config records the local resolution hint; lockfile records the pin. | Separates "what the project requires" (lockfile, reproducibility) from "where this machine looks for it" (machine config, portability). |
| 8 | Lockfile bumps to `version: 2`; Wave 2 readers accept both. | Forward-compatible migration without on-disk schema rewrite; downgrade is an explicit choice. |
| 9 | Per-card registry pin (not project-wide). | More flexible; collapsible later if unused. |
| 10 | Authoring helpers (`card add-skill --bundle | --from-registry`) are out of scope. | Orthogonal to either wave; tracked separately as the authoring-DX effort. |

---

## 16. Out of Scope

The following remain explicitly deferred after Wave 2 lands:

- **Networked card distribution.** Cards remain local-published; `bgng card publish` does not upload anywhere.
- **Custom registry servers / federated registries.** Schema accommodates them but no resolver implementation ships in Wave 2.
- **Authoring CLI surface** (`bgng card add-skill`, `bgng card import-skill`, `bgng card edit`). Matt's documented DX gap. Lives in a separate effort.
- **Content-addressed dedupe of the card store.** Listed on the v2 roadmap in `analyses/29` §13. Independent of Wave 2.
- **Strict mode** (refuse resolution past user-defaults entirely). Listed on the v2 roadmap. Could land as a flag on `bgng write` post-Wave-2.
- **SLSA provenance attestation on card publish.** Listed on the v2 roadmap. Independent of Wave 2.

Wave 2 closes the bundle-vs-selector design question definitively: cards are bundles by default, with a precise, pinned escape hatch into a shared registry when bundling is the wrong trade-off. Everything beyond that is either a registry generalization or an authoring concern, neither of which belongs in this wave.
