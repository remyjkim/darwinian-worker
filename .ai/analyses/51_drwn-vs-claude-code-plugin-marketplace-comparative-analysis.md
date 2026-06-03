# drwn vs Claude Code Plugin Marketplace — Comparative Analysis

**Date**: 2026-06-01
**Author**: Claude + Remy
**Status**: Draft
**References**: [Notion: Harness Card Marketplace Research (2026-05-28), analyses/50_drwn-command-roles-across-git-rollout-phases.md, analyses/49_drwn-target-architecture-after-phase-3.md, analyses/48_drwn-target-architecture-after-phase-2.md, analyses/47_drwn-target-architecture-after-phase-1.md, analyses/46_drwn-card-team-sharing-flow.md, analyses/44_drwn-git-storage-backend-options.md, analyses/32_harness-cards-vs-flox-and-conda.md, analyses/29_harness-cards-target-architecture-v1_1.md, https://github.com/dallay/agentsync, https://docs.claude.com/en/docs/claude-code/plugins]

---

## Executive Summary

This document maps Darwinian Harness (drwn) against the Claude Code plugin marketplace as documented in the internal research (Notion: *Harness Card Marketplace Research*, 2026-05-24) and against three adjacent systems (agentsync, Nix flakes, pnpm catalog). The Notion doc concluded with a 10-learning case study and a tiered infrastructure recommendation for "Harness Cards." This analysis evaluates each learning and recommendation against drwn's actual roadmap (analyses 47–49, tasks 29–31) to identify alignment, deliberate divergence, gaps, and concrete next actions.

**Headline findings:**

1. **drwn's Phase 1–3 rollout independently arrived at most of the Notion doc's Tier 1 recommendations.** Git URLs as the primary distribution channel, catalog repos as the discovery layer, per-card-repo model, and lockfile-pinned reproducibility are all in our plans.
2. **drwn is structurally more rigorous than Claude Code's plugins** in version pinning (explicit semver, strict enforcement, integrity hashes), composition (multi-card per project with last-wins merge), and materialization (the three-mechanism boundary that solves the managed-fields-in-user-files problem — Claude Code dodges this by not co-existing in user-edited files the same way).
3. **drwn is less developed than Claude Code on adoption ergonomics**, specifically: no `--from-project` capture mechanism, no pre-configured default community catalog, no GitHub topic convention, no validation GitHub Action, no in-app discovery TUI.
4. **Three specific gaps from the Notion doc are worth closing within the Phase 2–3 window:** `drwn card new --from-project` (the flywheel entry point), GitHub topic convention (`darwinian-harness-card`), and a reusable validation GitHub Action wrapping `drwn card source doctor`.
5. **drwn should deliberately diverge from Claude Code on five points**: the `cards` namespace stays the project-harness primitive (not "plugins"); composition stays multi-card-per-project; the lockfile contract is non-negotiable; the three materialization mechanisms remain; and the `apply` verb's two-phase model (intent → materialization) stays distinct.
6. **drwn does not need to build a registry service**, matching the Notion doc's recommendation.

The rest of this document walks each Claude Code learning, evaluates drwn's current and planned response, and surfaces concrete recommendations.

---

## 1. Context

### 1.1 What the Notion doc covers

The Notion research (last reviewed 2026-05-24) covers:

- **Claude Code's three-tier plugin/marketplace/local-cache architecture** (§1.1–1.3 of the Notion doc).
- **Ecosystem scale**: ~18,000 indexed repos, ~1,195 community-marketplace plugins, official marketplace with ~101 curated entries, 4.2M weekly active Claude Code developers.
- **10 architectural learnings**, each ending with an implication for Harness Cards.
- **3 anti-patterns to avoid.**
- **3-tier recommended infrastructure strategy** for Harness Cards (Tier 1: ship with v1; Tier 2: shortly after; Tier 3: build on demand).
- **An adoption flywheel diagram** centered on `bgng card new --from-project`.

The doc uses `bgng` throughout (pre-rebrand) and treats the harness-cards project as needing infrastructure work. This analysis uses `drwn` (post-rebrand) and incorporates the substantial design work that's happened since (analyses 42–50, tasks 27–31).

### 1.2 What this analysis adds

The Notion doc is a one-way comparison (Claude Code → Harness Cards). This analysis adds:

- **Bidirectional mapping**: where drwn aligns with Claude Code, where it diverges deliberately, and where Claude Code's pattern is genuinely worth adopting.
- **Three adjacent system comparisons**: agentsync, Nix flakes, pnpm catalog. These widen the lens beyond Claude Code's specific implementation.
- **Phase-grounded recommendations**: each gap is mapped to a specific phase (1, 2, 3, or post-Phase-3) where it should land.
- **Honest critique**: where the Notion doc's recommendations are wrong or premature for drwn's actual constraints.

### 1.3 What this analysis does NOT do

- Reproduce the Notion doc's full content. Read the source for the Claude Code architecture details.
- Litigate the cards model itself (settled in `29_*`).
- Specify implementation details (those live in tasks 29–31).
- Compare against tools that solve different problems (Flox, Conda, dotfile managers) — those are covered in analysis 32.

---

## 2. Architectural Map: Claude Code vs drwn

The Notion doc's three-tier architecture maps almost perfectly onto drwn's five-layer model from analysis 43. Side-by-side:

| Concept | Claude Code | drwn |
|---|---|---|
| **Atomic unit of distribution** | Plugin (directory with `.claude-plugin/plugin.json`) | Card (directory with `card.json`) |
| **Catalog of units** | Marketplace (git repo with `.claude-plugin/marketplace.json`) | Catalog (git repo with `catalog.json`, per analysis 48 §10) |
| **Local cache** | `~/.claude/plugins/` | `~/.agents/drwn/cards/` + `extracted/` |
| **Installation scope: user-wide default** | User scope | Machine baseline / `library defaults` / profile |
| **Installation scope: project-shared** | Project scope (`.claude/settings.json` committed) | Project config (`<project>/.agents/drwn/config.json` committed) |
| **Installation scope: project-local-private** | Local scope | Project overlay (skills/, presets/) |
| **Enterprise scope** | Managed scope | Future `trustedSources` allowlist (§10 below) |
| **Discovery primitive** | Marketplace registry list | Catalog list (`drwn library list catalog`) |
| **In-app browser** | `/plugin` TUI (Discover/Installed/Marketplaces/Errors) | None yet (gap; §11 below) |
| **Source types** | `relative path`, `github:owner/repo`, full git URL, npm, git-subdir | `file:./path`, `git+url#ref`, `@scope/name@ver` (npm-style), planned `github:` shorthand |
| **Validation primitive** | `/plugin validate` | `drwn card source doctor` |
| **Version model** | Loose: plugin.json → marketplace entry → git SHA | Strict semver enforced at publish, sha256 integrity in lockfile |
| **Reproducibility contract** | Implicit (commit SHA after the fact) | Explicit (lockfile pins semver + sha256 + git commit SHA) |
| **Composition** | Multi-plugin installable; not compositional in one manifest | Multi-card per project with last-wins merge in `cards[]` array |
| **Materialization** | Plugin files placed where Claude Code reads them | Three mechanisms (symlinks, `_drwn` meta-block, generated-file-plus-symlink) per `32_*` §5 |
| **Auto-update default** | Official marketplaces yes, third-party no | Manual (`drwn card fetch`); planned `drwn outdated --fetch` in Phase 2 |
| **Offline / CI pattern** | `CLAUDE_CODE_PLUGIN_SEED_DIR` (read-only pre-populated dir) | Planned `drwn store seed` (§14 below) |
| **Enterprise controls** | `strictKnownMarketplaces`, `extraKnownMarketplaces`, `enabledPlugins` | Planned `trustedSources` allowlist + project config commit (§10 below) |

drwn maps almost 1:1 onto Claude Code's structural model. Where it diverges, it diverges deliberately.

---

## 3. Walking the Ten Notion-Doc Learnings

Each learning is restated briefly, then I evaluate drwn's response against it.

### 3.1 Learning 1 — GitHub-as-Infrastructure, Not GitHub-as-Dependency

> *"The most important architectural decision is that a marketplace is just a git repo with a JSON file."*

**drwn alignment: STRONG, but with a deliberate refinement.**

The Notion doc recommends `bgng apply github:user/card-repo@^1.0.0` be a v1 feature. drwn's Phase 1 (analysis 47, task 29) introduces `drwn add git+https://github.com/user/repo.git#v1.0.0`. Both work against any Git host without a custom registry server.

The differences:

| Aspect | Notion recommendation | drwn Phase 1 |
|---|---|---|
| **Shorthand** | `github:user/repo` | `git+https://github.com/user/repo.git` |
| **Version specifier** | `@^1.0.0` (semver range) | `#v1.0.0` (Git ref: tag, branch, or commit) |
| **Host generality** | GitHub-only shorthand | Any Git URL via `git+` prefix |
| **Resolution time** | Semver range → tag | Explicit ref → commit SHA |
| **Lockfile pin** | git commit SHA | git commit SHA + sha256 of extracted content |

**Verdict:** drwn's mechanism is more general (handles any Git host) and more rigorous (two-layer integrity), but less ergonomic for the dominant GitHub case (longer to type). **Recommendation R1 (low cost, high value):** add `github:user/repo@ver` and `gitlab:user/repo@ver` as syntactic sugar in Phase 2 or 3. This is a 30-line addition to `parseCardRef`; no architectural impact.

The semver-range vs explicit-ref question is more nuanced. The Notion doc favors semver ranges (`@^1.0.0`) because that's the npm idiom users know. drwn's Phase 1 favors explicit refs (`#v1.0.0`) because the lockfile pins SHA, and we want the user to be deliberate about which tag they're consuming. **Recommendation R2:** support both. `git+url@^1.0.0` (semver range, resolve tags via `git ls-remote`, pick highest matching) and `git+url#v1.0.0` (explicit ref). Phase 2 work.

### 3.2 Learning 2 — Catalog and Content Are Separate Concerns

> *"A Claude Code marketplace is a pointer file ... The marketplace doesn't bundle plugin code; it references it."*

**drwn alignment: PERFECT.**

This is exactly how drwn's catalog model works (analysis 48 §10, analysis 46 §5.2). A `catalog.json` repo lists card name + URL entries; the cards themselves live in their own repos. drwn arrived at this independently via a different path (the team-sharing analysis 46), but the conclusion is identical.

Notion-doc implication: anyone can fork the registry; enterprise teams point at an internal registry; card authors don't need PRs to a central repo. drwn supports all three by design.

**Verdict:** no action needed. Phase 2 implementation should ensure the catalog format is documented publicly (in the docs site, task 27) with a published JSON schema so external aggregators can index against it.

### 3.3 Learning 3 — One-Command Consumption Is Non-Negotiable

> *"`/plugin marketplace add owner/repo`, then `/plugin install name@marketplace`. Two commands. The first marketplace (the official one) is pre-registered — zero commands needed for the most common case."*

**drwn alignment: PARTIAL. Phase 1 covers consumption; pre-registered default catalog is a gap.**

Phase 1's `drwn add git+url#ref` is one command. ✅

But the Notion doc's deeper point is that for the *most common case*, no command should be needed at all because the official marketplace is pre-registered. drwn has no pre-registered default catalog. A new user has to:

1. Discover a card exists (no in-app discovery in drwn yet).
2. Find its URL (Slack, README, GitHub search).
3. Run `drwn add git+url#ref` or `drwn library add catalog <url>`.

For comparison, a Claude Code user opens `/plugin` and sees ~101 official + many community plugins in the Discover tab immediately.

**Recommendation R3 (Phase 2 or post-Phase-3, depending on whether we have any official cards yet):** establish a default community catalog at `github.com/remyjkim/darwinian-cards-catalog/` (or under a community org once one exists). Pre-configure it in `drwn` so new installs see community-published cards via `drwn search card` out of the box.

This is genuinely additive: no infrastructure cost, just a Git repo + a JSON file + one line in drwn's defaults config.

### 3.4 Learning 4 — Scoped Installation Solves the Team Problem Without Infrastructure

> *"A team lead can add `enabledPlugins` and `extraKnownMarketplaces` to `.claude/settings.json`, commit it, and every team member who clones the repo gets the same plugin setup."*

**drwn alignment: STRONG, and arguably superior.**

drwn's `<project>/.agents/drwn/config.json` is exactly this mechanism. A team member who clones a project repo and runs `drwn install` gets the team's harness automatically. The lockfile (`card.lock`) ensures byte-identical reproducibility — something Claude Code doesn't guarantee.

The Notion doc actually flags this as drwn's natural advantage: cards are by design the team-config artifact. We didn't bolt this on; it's the primitive.

**Verdict:** no action needed. drwn is ahead of Claude Code here.

### 3.5 Learning 5 — Validation Before Distribution Builds Trust

> *"Claude Code's `/plugin validate .` command checks marketplace.json schema, duplicate names, source path traversal, version mismatches. GitHub Actions templates exist for CI validation."*

**drwn alignment: PARTIAL. `drwn card source doctor` exists; CI integration is a gap.**

`drwn card source doctor` (per task 41 from the card-source-authoring CLI) already validates card sources. What's missing:

1. **A reusable GitHub Action** that runs `drwn card source doctor` on PRs against a card source repo.
2. **A `drwn card validate <ref>` for consumers** — runs validation against a remote URL without cloning. Useful for "I'm thinking about installing this card; is it well-formed?"
3. **Validation rules for cross-version consistency** — does the declared version bump match the actual content change (e.g., a breaking change without a major bump)? The Notion doc references this; drwn's `29_*` §7.1 mentions it but the implementation is incomplete.

**Recommendation R4 (Phase 2):** ship a reusable GitHub Action at `darwinian-harness/validate-card-action`. Single-line use:

```yaml
- uses: darwinian-harness/validate-card-action@v1
```

Implementation: a Docker container or composite action that installs drwn, runs `drwn card source doctor`, and reports as a check.

**Recommendation R5 (Phase 2 or 3):** add `drwn card validate <ref>` (where ref is a `git+url#ref` form). Resolves the ref, downloads, runs validation, reports. Composes cleanly with existing primitives.

### 3.6 Learning 6 — The Ecosystem Explosion Is Driven by Low Publishing Friction

> *"The Claude Code ecosystem went from 0 to 18,000+ indexed repositories in under a year ... The barrier to publishing is literally 'can you push to GitHub?'"*

**drwn alignment: STRONG after Phase 2.**

Phase 2's author flow (analysis 48 §8) is:

```bash
drwn card source new @me/my-setup
$EDITOR ~/.agents/drwn/sources/@me/my-setup/...
drwn card publish @me/my-setup --version 1.0.0
drwn card remote add @me/my-setup https://github.com/me/my-setup-card.git
drwn card push @me/my-setup
```

Five commands; same as Claude Code's roughly-five-command publish flow (`/plugin new`, edit, `/plugin publish`, `git init`, `git push`). Phase 2 closes this gap.

**The bigger flywheel gap:** the Notion doc identifies `--from-project` as the critical flywheel entry point — capture your *existing* working setup as a card instead of authoring from scratch. drwn doesn't have this.

**Recommendation R6 (Phase 3 or post-Phase-3, but high priority):** add `drwn card new --from-project [<project-path>]`. Workflow:

1. Read the current project's `<project>/.agents/drwn/config.json` (cards + overlay) and `card.lock`.
2. Resolve to actual content: pull in skills, MCP defs, extensions actively used.
3. Generate a fresh source at `~/.agents/drwn/sources/@me/<inferred-name>/` containing those resolved assets.
4. Output: "Capture complete. Edit `~/.agents/drwn/sources/@me/<inferred-name>/card.json` to fine-tune, then run `drwn card publish`."

This is the single highest-leverage adoption ergonomic in the whole comparison. It's the difference between *authoring* a card (work) and *sharing what you already have* (incidental).

### 3.7 Learning 7 — Multiple Source Types Serve Different Users

> *"GitHub shorthand: 90% of community distribution. Git URLs: enterprise. npm: companies with existing npm infrastructure. git-subdir: monorepo organizations."*

**drwn alignment: GOOD, with one gap.**

Phase 1 covers: `file:` (development), `git+url#ref` (most common), `@scope/name@ver` (store-resolved or npm-future). Missing:

- **Git subdirectory support** (sparse checkout for monorepos). The Notion doc flags this as serving monorepo organizations. Realistically: a monorepo at `github.com/team/repo` with `cards/baseline/` and `cards/observability/` should be addressable as `git+https://github.com/team/repo.git#path=cards/baseline&ref=v1.0.0`.
- **`github:` shorthand** (covered above in R1).

**Recommendation R7 (Phase 3 or post-Phase-3, low priority for now):** add `path=<subpath>` fragment parsing to the Git URL ref. Resolution clones the full repo (or shallow-clones), then operates on the subpath as if it were the card root. Useful only when teams adopt monorepo card layouts — defer until demand.

### 3.8 Learning 8 — Community Curation Layers Emerge Organically

> *"The Claude Code ecosystem has developed multiple curation layers ... without Anthropic building any of them beyond the first two."*

**drwn alignment: TRACK ENABLED BY DESIGN.**

The Notion doc's recommendation: don't build a card discovery website; make cards easily indexable so aggregators emerge organically. drwn's design already supports this:

- `card.json` is at a predictable path in each card repo.
- The catalog format is open and documented.
- Cards are git-repo-shaped, so GitHub search works.

The Notion doc recommends a GitHub topic convention like `harness-card`. drwn doesn't have one yet.

**Recommendation R8 (Phase 2 or sooner, near-zero cost):** establish `darwinian-harness-card` (or `drwn-card`) as the official GitHub topic for card repos. Document in the docs site. Use it on every example card the project ships. This costs nothing and enables `github.com/topics/drwn-card` to become a community discovery surface.

### 3.9 Learning 9 — Enterprise Needs Are About Control, Not Features

> *"Claude Code's enterprise story is three settings: `strictKnownMarketplaces`, `extraKnownMarketplaces`, `enabledPlugins`."*

**drwn alignment: WORK NEEDED. Enterprise allowlisting is a gap.**

drwn has the foundations (project config committed to git ensures shared team config), but doesn't have:

- A `trustedSources` allowlist for restricting which Git URL hosts cards can come from.
- An `extraKnownCatalogs` for auto-registering team catalogs.
- A `requiredCards` (analogous to `enabledPlugins`) for force-installing certain cards.

**Recommendation R9 (post-Phase-3, when enterprise demand surfaces):** add three fields to `machine.json`:

```json
{
  "trustedSources": {
    "allowedHosts": ["github.com", "git.enterprise.local"],
    "allowedOrgs": ["@team", "@upstream"]
  },
  "extraKnownCatalogs": [
    "https://git.enterprise.local/cards/catalog.git"
  ],
  "requiredCards": ["@team/security-baseline@^1.0.0"]
}
```

Enforcement is in the resolver (refuse non-allowlisted URLs) and `drwn install` (require listed cards in `card.lock`).

These are three small config fields, not a service. Aligned with the Notion doc's "control, not features" framing.

### 3.10 Learning 10 — The Seed/Offline Pattern Is Critical for CI and Containers

> *"`CLAUDE_CODE_PLUGIN_SEED_DIR` lets container/CI environments ship pre-populated plugin directories that are read-only at runtime."*

**drwn alignment: PLANNED but not yet implemented.**

The Notion doc recommends `BGNG_STORE_SEED` (or equivalent). drwn's store is already designed as a content-addressed tree (analysis 48 §3.3), which is naturally read-only-mountable.

**Recommendation R10 (Phase 2 or 3):** add a `DRWN_STORE_READONLY` env var that, when set, causes drwn to refuse any operation that would write to the store. Combined with a populated `~/.agents/drwn/` (mounted read-only in containers, baked into CI images), this gives the same airgapped CI behavior Claude Code has.

Also add a packaging command: `drwn store export <output-dir>` that creates a portable snapshot suitable for mounting into CI. This is `drwn store gc`'s read-only complement.

---

## 4. Anti-Patterns: Claude Code's Mistakes drwn Should Avoid

The Notion doc identifies three anti-patterns. Evaluating drwn against each:

### 4.1 Anti-Pattern 1 — Namespace Confusion

> *"Claude Code plugins, skills, commands, hooks, MCP servers, and LSP servers are all different things ... The community routinely conflates 'plugins' and 'skills.'"*

**drwn risk: MEDIUM.**

drwn already has many terms: card, source, store, library, catalog, preset, profile, manifest, lockfile, registry. The Notion doc recommends ruthless minimization for public-facing vocabulary: **Card, Store, Registry** (three terms).

drwn's public vocabulary is more like **Card, Store, Catalog, Project, Apply, Install** (six terms). Slightly more, but each is doing real work and corresponds to a distinct concept in the five-layer model (analysis 50 §2).

**Recommendation R11 (documentation-only):** the docs site (task 27) should follow analysis 50's five-layer framing rigorously, and the operator guide's introduction should commit to these six public-facing terms. Internal terms (manifest, lockfile, sources, presets, profiles, write-record) can be deeper-dive.

### 4.2 Anti-Pattern 2 — Version Pinning Confusion

> *"Claude Code's version resolution ... leads to a subtle footgun: if you set a version in plugin.json but forget to bump it, users never see updates."*

**drwn risk: LOW.**

drwn's design (analyses 29 §7.1, 47 §6.2) enforces strict semver at publish time and refuses duplicate version publishes. The Notion doc explicitly notes: *"This is better than Claude Code's model. Don't compromise on it."*

**Verdict:** maintain the rigor. No action needed.

### 4.3 Anti-Pattern 3 — Quality Signal Absence

> *"With 18,000+ indexed repositories, finding good plugins is hard."*

**drwn risk: MEDIUM (will increase as ecosystem grows).**

The Notion doc recommends optional `stability` and `lastValidatedWith` fields in `card.json`. drwn's manifest schema (analysis 29 §5) doesn't include these.

**Recommendation R12 (Phase 3 or post-Phase-3, schema bump):** add optional fields to `card.json`:

```json
{
  "stability": "experimental" | "stable" | "production",
  "lastValidatedWith": "0.6.0",  // drwn version
  "testStatusBadge": "https://github.com/user/repo/actions/workflows/validate.yml/badge.svg"
}
```

Surface these in `drwn card show` output. Self-declared by authors; users evaluate.

---

## 5. The Notion Doc's Tier-1/2/3 Recommendations — Evaluated

The Notion doc's recommended infrastructure layers (§5), evaluated against drwn's actual roadmap.

### 5.1 Tier 1 — Ship with v1 (Notion doc's framing)

| Tier 1 item | drwn status | Notes |
|---|---|---|
| `github:` specifier support | **PARTIAL** | Phase 1 has `git+url#ref`; add `github:user/repo@ver` sugar in Phase 2 (R1) |
| Default community registry | **GAP** | Recommended R3, deferrable until first community cards exist |
| `bgng card validate` | **EXISTS** as `drwn card source doctor`; need consumer-side `drwn card validate <ref>` (R5) |
| GitHub Action for validation | **GAP** | Recommended R4, Phase 2 |
| GitHub topic convention | **GAP** | Recommended R8, near-zero cost |

### 5.2 Tier 2 — Ship shortly after v1

| Tier 2 item | drwn status | Notes |
|---|---|---|
| GitHub App for registry automation | **NOT NEEDED YET** — catalog repo + PR review covers this until scale demands automation |
| `bgng store seed` (read-only seed dir) | **GAP** | Recommended R10, Phase 2 or 3 |
| Enterprise allowlisting | **GAP** | Recommended R9, post-Phase-3 |

### 5.3 Tier 3 — Build when demand materializes

| Tier 3 item | drwn status | Notes |
|---|---|---|
| Static card browser (GitHub Pages site auto-generated from registry) | **Deferred** — agree with Notion doc; build when demand surfaces |
| Private registry support | **Already designed** — any Git URL works as a catalog (analysis 46 §5.2) |
| `bgng store push/pull` | **Subsumed by Phase 2's `drwn card push/fetch`** (per-card granularity); could add `drwn store sync-all` later |

### 5.4 Notion-doc's "What NOT to Build" list

| Item to NOT build | drwn alignment |
|---|---|
| Hosted registry service | ✅ Not planned |
| Account system | ✅ Not planned; Git credentials suffice |
| Web-based publish flow | ✅ Not planned; CLI + git push is the model |
| Rating/review system | ✅ Not planned; GitHub stars + the optional `stability` field cover this |

drwn is aligned with the Notion doc on all four "don't build" items.

---

## 6. Where drwn LEADS Claude Code (Deliberate Divergences)

These are areas where drwn's design is structurally more rigorous than Claude Code's, by deliberate choice. Worth being explicit so we don't sleepwalk into "let's just copy Claude Code."

### 6.1 Reproducibility contract

Claude Code's plugin model has loose versioning (commit SHA after the fact, optional semver). drwn enforces strict semver at publish time + sha256 integrity in the lockfile + (post-Phase-1) Git commit SHA pinning.

Why drwn diverges: cards are *team-shared project configuration*. Reproducibility is non-negotiable. A team that clones a project and runs `drwn install --frozen` must get byte-identical effective state. Claude Code's plugin model doesn't need this because plugins are user-installed independently.

### 6.2 Multi-card composition

Claude Code installs multiple plugins independently; they don't compose into a single declared manifest. drwn's `cards: [@team/baseline@^1.0.0, @addons/observability@^2.0.0]` is a declared composition with last-wins merge semantics (analysis 29 §7).

Why drwn diverges: a project's harness is *one thing* (the effective composition), not N independently-installed plugins. The composition model captures team intent better than a flat plugin list.

### 6.3 The three-mechanism materialization

Claude Code installs plugin files into known paths Claude Code itself reads. drwn must coexist with Claude Code, Codex, and Cursor — and crucially, with user-owned settings files (`settings.json`, `config.toml`). The three mechanisms (per analysis 32 §5) solve the managed-fields-in-user-files problem; Claude Code dodges this by not facing the same coexistence challenge.

Why drwn diverges: forced by the consumer-tool landscape, not aesthetic choice.

### 6.4 Two-phase intent → materialization

drwn separates `drwn add`/`drwn use` (intent mutation) from `drwn apply` (materialization). Claude Code's `/plugin install` does both in one step.

Why drwn diverges: enables `drwn install --frozen` for CI, lets users inspect with `drwn apply --dry-run`, and matches kubectl/terraform/chezmoi convention (analysis 42 v2). The Notion doc doesn't directly address this; Claude Code's model is fine for its single-user-install case but doesn't scale to team reproducibility.

### 6.5 Lockfile

Claude Code has no lockfile in the npm/Cargo sense. drwn does (analysis 47 §4). This is the contract that makes `drwn install --frozen` meaningful.

Why drwn diverges: same reason as 6.1. Reproducibility is the cards' value proposition.

---

## 7. Where drwn LAGS Claude Code (Adoption Ergonomics)

Closing these gaps doesn't require rebuilding drwn; they're additive features.

### 7.1 No `--from-project` capture

The single biggest gap. Already covered in R6 (§3.6 above). Phase 3 candidate.

### 7.2 No pre-registered default catalog

R3 in §3.3 above. Cheap to add; gated on having any cards worth listing.

### 7.3 No in-app discovery TUI

Claude Code's `/plugin` opens a 4-tab interactive browser. drwn doesn't have this.

**Recommendation R13 (post-Phase-3, lower priority):** consider an interactive `drwn` (no subcommand) that opens a TUI. Tabs: Project Cards, Library, Catalogs, Status. Uses `ink` or similar TUI framework for Bun/Node.

This is genuinely lower priority than R6 (the capture flow). A TUI is polish; capture-from-project is structural.

### 7.4 No GitHub topic convention

R8 in §3.8 above. Near-zero cost.

### 7.5 No reusable validation GitHub Action

R4 in §3.5 above. Phase 2 candidate.

### 7.6 No quality-signal fields in `card.json`

R12 in §4.3 above. Schema bump in Phase 3 or later.

### 7.7 No `--from-running-claude-code` migration path

Claude Code installs to `~/.claude/plugins/`. A user who already has Claude Code plugins installed could plausibly want to convert them into a drwn-managed card. Currently no path.

**Recommendation R14 (lower priority, after R6):** `drwn card new --from-claude-code-plugin <plugin-name>` — reads `~/.claude/plugins/<name>/`, creates a corresponding card source. Lossy in practice (plugin manifests don't map 1:1 to card manifests), but useful as a starting point.

---

## 8. Adjacent System Comparisons

Three systems beyond Claude Code that inform drwn's positioning.

### 8.1 agentsync + agents-skills

**What it is:** Rust CLI ([dallay/agentsync](https://github.com/dallay/agentsync)) that synchronizes AI agent configs across Claude Code, Cursor, Copilot, Gemini, Codex via symlinks. Skills installed from a separate catalog repo ([dallay/agents-skills](https://github.com/dallay/agents-skills)).

**How drwn compares:**

| Dimension | agentsync | drwn |
|---|---|---|
| Distribution unit | Skill | Card (a bundle of skills + MCP + extensions) |
| Catalog | One git repo (`dallay/agents-skills`), embedded TOML index in binary | Per-scope catalog repos, configured at runtime |
| Version pinning | None (HEAD-pull) | Lockfile + sha256 + Git commit SHA |
| Composition | None (install one skill at a time) | Multi-card last-wins merge |
| Materialization | Symlinks to user-config paths | Three mechanisms |
| Implementation language | Rust | TypeScript (Bun) |
| Adoption | ~1k+ GitHub stars; small but real | Pre-launch |

**Verdict:** agentsync proves the symlink + catalog pattern at small scale but explicitly trades reproducibility for simplicity. drwn is structurally more ambitious; their model is good evidence that *some* harness-management tool is real, even if drwn's superset is more rigorous.

### 8.2 Nix flakes

**What it is:** Nix's modern dependency system. Inputs are Git URLs; `flake.lock` pins commit SHAs.

**How drwn compares:**

| Dimension | Nix flakes | drwn (Phase 1+) |
|---|---|---|
| Source refs | `github:owner/repo`, `git+https://...`, `path:...` | `git+https://...`, `file:...`, `@scope/name@ver` |
| Lockfile | `flake.lock` pinning commit SHAs | `card.lock` pinning semver + sha256 + commit SHA |
| Composition | Nix derivations + overrides | Cards + project overlay |
| Materialization | `/nix/store/...` content-addressed | `extracted/<tree-sha>/` content-addressed (Phase 2+) |
| Distribution channel | Git hosts (no central registry) | Git hosts (no central registry) |
| User-facing version concept | Commit (flakes are commit-first) | Semver (drwn is semver-first) |

**Verdict:** drwn's Phase 2+ design closely mirrors Nix flakes structurally (git URLs + lockfile + content-addressed). The Nix flakes model is well-tested at scale; drwn inherits its best instincts without inheriting the Nix Language learning curve.

The one place drwn departs from flakes: drwn keeps semver as the primary user-facing version. Flakes are commit-first, which is technically purer but ergonomically harder for the dependency-tree use case. drwn's semver-first + SHA-pinned is the right compromise.

### 8.3 pnpm catalog protocol

**What it is:** pnpm 9+ introduced a `catalog:` protocol for centralizing dependency version constraints across a monorepo. `pnpm-workspace.yaml` declares the catalog; package.json files reference catalog entries.

**How drwn compares:**

| Dimension | pnpm catalog | drwn catalogs |
|---|---|---|
| What's centralized | Version constraints across one monorepo | Card URLs across one scope |
| Resolution | Inside one repo's workspace | Globally per drwn install |
| Scale | Per-monorepo | Per-user (or per-machine) |
| Mutability | Edit `pnpm-workspace.yaml` | Refresh catalog Git repo via `drwn library refresh catalog` |

**Verdict:** different problems. pnpm's catalog is workspace-scoped version coordination; drwn's catalog is user-scoped discovery. They share a name and a JSON file but solve different needs. Worth knowing they exist; not a model to copy.

### 8.4 Homebrew taps

**What it is:** Homebrew's third-party formula repos. `brew tap user/repo` adds a Git repo as a source; `brew install user/repo/formula-name` installs from it.

**How drwn compares:**

- **Same**: third-party Git repo as registry; one-command consumption; no central infrastructure.
- **Different**: Homebrew is system-wide; drwn is project-scoped. Homebrew has central formula authority (`homebrew-core`); drwn has no central authority (catalogs are first-among-equals).

Homebrew taps validate the core pattern: third-party Git-repo-as-catalog scales to many thousands of formulas without central infrastructure.

---

## 9. Comparison Summary Table

How drwn measures against each system on key dimensions.

| Dimension | Claude Code | agentsync | Nix flakes | drwn (target after Phase 3) |
|---|---|---|---|---|
| **Reproducibility (lockfile-pinned)** | Weak | None | Strong | Strong |
| **Composition (multi-unit per project)** | No | No | Yes (derivations) | Yes (cards array) |
| **Distribution via Git** | Yes (primary) | Yes (HEAD-pull) | Yes (primary) | Yes (Phase 1+) |
| **Catalog/registry concept** | Marketplace | Embedded catalog TOML | Flake registry (optional) | Catalog repos |
| **Enterprise allowlisting** | Yes | No | Limited | Planned R9 |
| **Validation tooling** | Yes (`/plugin validate`) | Limited | `nix flake check` | `drwn card source doctor` + planned action R4 |
| **One-command consumption** | Yes | Yes | Yes (after flake.nix is set up) | Yes (Phase 1+) |
| **Capture-from-project flow** | Yes (migration path) | No | No | Planned R6 |
| **Discovery TUI** | Yes (`/plugin`) | No | No | Planned R13 (lower priority) |
| **Auto-update default** | Official: yes; third-party: no | No | Manual | Manual (`drwn card fetch`); planned `drwn outdated --fetch` Phase 2 |
| **Materialization mechanisms** | Plugin-controlled paths | Symlinks | `/nix/store/` + PATH | Three (per `32_*` §5) |
| **Multi-tool target (Claude, Codex, Cursor)** | Single (Claude Code only) | Yes (5 tools) | N/A | Yes (Claude, Codex, Cursor) |
| **Ecosystem scale** | 18k+ repos | <100 skills | Thousands of flakes | Pre-launch |

Reading the table: drwn's target state is competitive with or stronger than Claude Code's on every structural dimension. It lags in adoption ergonomics (which is addressable via R3, R4, R6, R8, R13) and in raw ecosystem size (a function of time, not design).

---

## 10. Findings

1. **drwn's roadmap independently arrived at most of the Notion doc's Tier 1 recommendations.** The Phase 1–3 architecture matches Claude Code's structural model closely.
2. **drwn is structurally more rigorous than Claude Code on five dimensions** (reproducibility, composition, materialization, two-phase model, lockfile). These divergences are deliberate and should not be reversed for surface-level alignment.
3. **drwn lags Claude Code on adoption ergonomics**: capture-from-project, pre-registered default catalog, in-app discovery TUI, GitHub topic, validation Action, quality-signal fields. Each is additive and can be closed without architectural change.
4. **The single highest-leverage gap is `drwn card new --from-project`** (R6). This is the flywheel entry point per the Notion doc's adoption analysis. Should land in Phase 3 or as the first post-Phase-3 task.
5. **The default community catalog (R3) is cheap but gated on content.** It's worth establishing the repo now (an empty `darwinian-cards-catalog`) so it's discoverable, but it doesn't earn its weight until there are >3 cards to list.
6. **GitHub topic convention (R8) costs nothing and should be set today.** Recommend `darwinian-harness-card` or `drwn-card`.
7. **Enterprise allowlisting (R9) is deferrable** until enterprise demand surfaces. Three small config fields (`trustedSources`, `extraKnownCatalogs`, `requiredCards`) cover the canonical use cases.
8. **agentsync and Nix flakes are the most informative adjacent systems.** agentsync proves the symlink + catalog pattern at small scale; Nix flakes proves the Git URL + lockfile pattern at large scale. drwn sits between them in rigor and ahead of both in materialization sophistication.
9. **The Notion doc's "What NOT to Build" list is correct.** drwn is aligned: no hosted registry, no account system, no web publish flow, no rating system.
10. **Documentation needs to commit to a six-term public vocabulary**: Card, Store, Catalog, Project, Apply, Install. Internal terms (manifest, lockfile, sources, presets, profiles, write-record) stay in deeper docs. (R11)

---

## 11. Recommendations Summary

In priority order, with phase placement:

| Rec | What | Cost | Value | Phase |
|---|---|---|---|---|
| **R6** | `drwn card new --from-project` flow | Medium | **Very High** (flywheel entry) | Phase 3 or post-Phase-3 |
| **R8** | Establish `drwn-card` GitHub topic convention | Near-zero | Medium-High (discovery) | Anytime; do now |
| **R4** | Reusable validation GitHub Action | Low-Medium | High (quality gating) | Phase 2 |
| **R5** | `drwn card validate <ref>` for consumer-side validation | Low | Medium | Phase 2 or 3 |
| **R1** | `github:user/repo` and `gitlab:user/repo` shorthand | Low | Medium (ergonomics) | Phase 2 or 3 |
| **R3** | Default community catalog repo + pre-registration | Low (gated on content) | Medium-High (cold-start UX) | Phase 2 or post-Phase-3 |
| **R10** | `DRWN_STORE_READONLY` env var + `drwn store export` | Medium | Medium (CI/airgap) | Phase 2 or 3 |
| **R11** | Lock public vocabulary to six terms in docs | Low (docs only) | Medium (clarity) | Anytime (with task 27 docs) |
| **R12** | `stability` and `lastValidatedWith` schema fields | Low | Low-Medium (signal) | Phase 3 schema bump |
| **R2** | `git+url@^semver-range` resolution (in addition to `#ref`) | Medium | Medium | Phase 2 |
| **R9** | Enterprise allowlisting (`trustedSources` etc.) | Medium | Depends on enterprise demand | Post-Phase-3 |
| **R7** | Git subdirectory support (`path=<subpath>` fragment) | Medium | Low (monorepo niche) | Post-Phase-3 |
| **R13** | In-app discovery TUI | High | Low-Medium (polish) | Post-Phase-3, low priority |
| **R14** | `drwn card new --from-claude-code-plugin` | Medium | Low (niche migration) | Post-Phase-3, optional |

**Top three to act on:**

1. **R6** — `--from-project` is the flywheel. Without it, drwn relies on users authoring cards from scratch, which is a much higher friction floor.
2. **R8** — GitHub topic costs nothing. Do today.
3. **R4** — Validation Action is a force multiplier for community quality. Phase 2 ship.

---

## 12. Open Questions

1. **Is `darwinian-harness-card` or `drwn-card` the better topic name?**
   - Lean: `drwn-card`. Shorter, matches the CLI binary, easier to type into GitHub search.

2. **Should `drwn card new --from-project` produce a card source named after the project, or prompt the user?**
   - Lean: prompt with a default suggestion (basename of project + scope). Default to `@me/<project-name>-harness`.

3. **Should the default community catalog be hosted under `remyjkim/` or a future `darwinian-harness/` org?**
   - Lean: create the org. Even if it's only one person right now, the org name signals "this is community infrastructure, not someone's personal repo."

4. **Should the validation GitHub Action live in the main drwn repo or a separate repo?**
   - Lean: separate (`darwinian-harness/validate-card-action`). Single-purpose action, separate version cadence.

5. **Should `drwn` recommend `darwiniantools.com/cards` as the discovery URL (a static site auto-generated from the catalog) or rely on GitHub for discovery?**
   - Lean: GitHub-first; the docs site is canonical for documentation but discovery is GitHub's strength. A static catalog browser is Tier 3 per the Notion doc and can be added when there's content to browse.

6. **For `drwn card new --from-project`, what gets captured exactly?**
   - The project's `cards[]` array → bundles? Or the resolved effective state → flat skills/MCP set?
   - Lean: flatten to effective state (current `drwn apply` would materialize). The captured card becomes a self-contained snapshot that doesn't depend on the originals. The user can edit afterwards if they want bundle deps.

7. **What's the relationship between `drwn card new --from-project` and presets (per analysis 42)?**
   - Presets are project-scoped; `--from-project` produces a globally-shareable card. They serve different sharing scopes. A preset can be turned into a card via this flow; the reverse (card → preset) is a different command.

8. **Should the analysis update the existing analyses 44/46 to cross-reference Notion-doc findings?**
   - Probably not — those analyses are settled. This document is the consolidation point for the Claude Code comparison. References in those docs can be added if/when they need revision.

9. **Is there value in a `drwn card from-marketplace <claude-marketplace>` reverse-direction tool?**
   - Niche. Defer unless someone asks.

10. **How aggressive should drwn be about marketing `drwn-card` GitHub topic before there are real cards to discover?**
    - Modestly. Set the convention; don't promote it heavily until there's content.

---

## 13. Appendix

### A. The Notion doc's adoption flywheel — restated with drwn vocabulary

The Notion doc's diagram:

```text
Low publishing friction → Many plugins exist →
  Aggregators emerge → Discovery improves →
  More users install → More authors publish →
  (repeat)
```

drwn's equivalent (post-R6 + R8 + R4):

```text
drwn card new --from-project captures existing setup →
drwn card publish + drwn card push shares it →
drwn add @scope/card-name is one command →
GitHub topic + catalogs aggregate discoverable cards →
New users find and apply cards (drwn install) →
Card authors iterate (drwn card source ... → drwn card publish --bump minor) →
(repeat)
```

The entry point is `drwn card new --from-project` (R6). Without it, the flywheel doesn't spin up because authoring cards from scratch is friction. With it, anyone who has a working drwn setup can publish their harness in one extra command.

### B. Six public-facing terms — proposed

| Term | Definition | When users encounter it |
|---|---|---|
| **Card** | A bundle of harness intent (skills, MCP servers, extensions) authored by someone and shareable | Every interaction with cards |
| **Store** | The local cache of cards on the user's machine (`~/.agents/drwn/`) | When learning about caching, GC, offline operation |
| **Catalog** | A Git repo that lists cards in a scope (discovery layer) | When discovering new cards |
| **Project** | A working directory with a drwn configuration | Daily use |
| **Apply** | The verb that materializes the project's harness into downstream tool config | Daily use |
| **Install** | The verb that fetches missing cards and applies (bootstrap) | After fresh project clone |

Internal terms used only in deeper documentation: manifest, lockfile, source, preset, profile, write-record, machine.json, integrity, origin, scope, overlay.

### C. The Notion doc's table of takeaways — drwn's status per row

| Claude Code Pattern (Notion doc) | drwn status |
|---|---|
| Marketplace = git repo with JSON catalog | ✅ Catalogs (Phase 2) |
| Catalog points to plugins in other repos | ✅ Catalog `catalog.json` lists card URLs |
| `owner/repo` shorthand is the primary distribution path | ⏳ Partial (R1); `git+url#ref` works; shorthand planned |
| Official marketplace pre-registered, zero-config | ⏳ Gap (R3); default catalog planned |
| `/plugin validate` for quality gates | ✅ `drwn card source doctor` exists |
| User/project/local/managed scopes | ✅ Layered model (analysis 43) covers this |
| `CLAUDE_CODE_PLUGIN_SEED_DIR` for CI/containers | ⏳ Planned (R10) |
| `strictKnownMarketplaces` for enterprise control | ⏳ Planned (R9) |
| 18,000+ repos without custom registry service | ✅ Aligned |
| `--from-project` migration path lowers publishing friction | ❌ Gap (R6); top priority |

Six of ten are aligned or planned in the current roadmap; three are gaps with clear recommendations (R3, R6, R10); one is partial (R1).

### D. The five deliberate divergences from Claude Code

Restated as a checklist for any future "let's just copy Claude Code" suggestion:

- [ ] Does this proposal weaken drwn's reproducibility contract (lockfile + sha256 + Git SHA)? Reject.
- [ ] Does this proposal collapse drwn's multi-card composition into a flat plugin list? Reject.
- [ ] Does this proposal remove or weaken one of the three materialization mechanisms (`32_*` §5)? Reject.
- [ ] Does this proposal merge `drwn apply` (materialization) with `drwn install` (bootstrap) or `drwn add` (intent)? Reject.
- [ ] Does this proposal remove the lockfile? Reject.

The first four are the deliberate structural choices; the fifth follows from the first.

### E. Where this analysis updates the Notion doc

The Notion doc was written 2026-05-24. Since then, drwn has gained:

- **Analyses 42 (v2)** — vocabulary cleanup (`apply` is materialization; `use` is intent mutation; `drwn card` namespace). The Notion doc uses `bgng apply` for both intent and materialization, conflating them.
- **Analysis 44** — Git storage backend options (five candidates A–E).
- **Analyses 47–49** — phase-by-phase target architectures for Git distribution rollout.
- **Analysis 46** — full team-sharing flow.
- **Analysis 50** — command roles across phases.
- **Tasks 29–31** — implementation plans for the three phases.

In particular: the Notion doc's recommendation that `github:` shorthand be v1 is incorporated as Phase 1's `git+url#ref` (general form) with `github:` sugar planned as R1. The Notion doc's `bgng card new --from-project` is now R6 in this document.

### F. Open opportunities the Notion doc identifies that drwn could uniquely deliver

The Notion doc analyzes Claude Code; drwn has structural advantages Claude Code can't replicate easily because they're built into the model:

1. **Reproducible team handoff**: a teammate clones a repo, runs `drwn install`, has byte-identical effective state. Claude Code's "every team member install the plugins yourself" is genuinely worse.
2. **Cross-tool composition**: drwn writes to Claude, Codex, and Cursor from one card. Claude Code plugins only target Claude Code.
3. **Audit/diff at the composition level**: `drwn card diff @team/baseline@1.0.0 @team/baseline@1.1.0` is a real Git diff. Claude Code's plugin diff story is less developed.
4. **Materialization audit**: `drwn doctor` reports drift between intent and downstream. Claude Code's plugin state is what's installed; drift is implicit.
5. **Snapshots (presets, profiles)** per analysis 42 — Claude Code has no equivalent.

These are drwn's selling points in any positioning material. The Notion doc focuses on what to learn from Claude Code; this section is what drwn offers *over* Claude Code.

---

## 14. What This Analysis Means for the Roadmap

Concrete additions to the task plans (29, 30, 31):

- **Task 30 (Phase 2):** add R4 (validation GitHub Action) and R8 (GitHub topic convention). Both fit cleanly into Phase 2's release window.
- **Task 31 (Phase 3):** consider adding R6 (`--from-project` capture flow), R12 (schema fields), R10 (read-only store env var). R6 is the most valuable; R10 and R12 are lighter polish.
- **Post-Phase-3 backlog:** R1, R2, R3, R5, R7, R9, R13, R14. Each becomes its own task plan when greenlit.

The good news is that drwn's structural foundation is solid — these are all additive features, not retroactive fixes. The Notion doc's verdict (drwn's design is more rigorous than Claude Code on the dimensions that matter) holds.

The path forward is **closing the adoption-ergonomics gap without compromising the structural rigor**. R6 + R8 + R4 are the highest-leverage moves to get there.
