# Task 32: drwn Adoption Polish Backlog (Post-Phase-3)

> **For Claude/Codex:** This is a **backlog document**, not a single implementation plan. Each item below becomes its own task plan when promoted. Use `superpowers:writing-plans` to draft a per-item plan when an item is greenlit.

**Status**: Open Backlog
**Created**: 2026-06-01
**Updated**: 2026-06-01
**Assigned**: Unassigned
**Priority**: Mixed (item-dependent)
**Estimated Effort**: Item-dependent; ranges from a single session (R7, R14) to multi-session (Electron app)
**Dependencies**: Tasks 28 (rebrand), 29 (Phase 1), 30 (Phase 2), 31 (Phase 3) merged
**References**: [analyses/51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md, analyses/50_drwn-command-roles-across-git-rollout-phases.md, analyses/49_drwn-target-architecture-after-phase-3.md, analyses/43_drwn-cli-target-architecture.md, tasks/29_drwn-git-distribution-phase-1-implementation-plan.md, tasks/30_drwn-git-distribution-phase-2-implementation-plan.md, tasks/31_drwn-git-distribution-phase-3-implementation-plan.md]

---

## Objective

Capture the adoption-polish work that emerges from analysis 51 (Claude Code marketplace comparison) and analysis 43's long-term architecture but is not load-bearing for Phases 1–3. Each item below is a candidate for its own future task plan; this document is the canonical place to find them and decide priority as demand surfaces.

The backlog is **not strictly sequenced**. Items can land in any order. Each entry includes motivation, rough design, dependencies on prior phases, and an effort estimate.

---

## Backlog at a Glance

| Item | Source | Priority | Effort | Dependencies |
|---|---|---|---|---|
| **B1** — Git subdirectory support (`path=<subpath>` fragment) | analysis 51 R7 | Low (monorepo niche) | 1–2 sessions | Phase 2 |
| **B2** — Enterprise allowlisting (`trustedSources`, `extraKnownCatalogs`, `requiredCards`) | analysis 51 R9 | Medium-High when enterprise demand surfaces | 2–3 sessions | Phase 2 |
| **B3** — `drwn card new --from-claude-code-plugin` migration | analysis 51 R14 | Low (niche) | 1–2 sessions | Phase 3 (R6 capture flow) |
| **B4** — Electron desktop app (replaces dropped R13 TUI direction) | analysis 51 + this doc | High when CLI is stable enough to attract non-CLI users | 8–15 sessions for v1 | Phase 3; CLI-as-kernel hygiene from amendments |
| **B5** — Typed `DrwnError` hierarchy + error code system | this doc (long-term arch) | Medium (improves desktop app integration) | 1–2 sessions | Phase 2 |
| **B6** — Library mode (`darwinian-harness/core` importable from Bun/Node) | this doc (long-term arch) | Medium-Low (enables embedded use cases) | 2–3 sessions | Phase 3 |
| **B7** — Static catalog browser site (auto-generated from catalog repo) | analysis 51 Tier 3 | Low (defer until content exists) | 2 sessions | Phase 2 |
| **B8** — Card discovery aggregator at `darwiniantools.com/cards` | this doc | Low (gated on ecosystem) | 2–3 sessions | B7 |
| **B9** — `drwn store push-all` / `pull-all` for bulk sync | analysis 49 §14 | Low | 1 session | Phase 2 |
| **B10** — Card signing / SLSA-style provenance attestation | analysis 32 §6.6 | Medium long-term | 3–5 sessions | Phase 2 |
| **B11** — Parallel fetch concurrency tuning + progress bars | this doc | Low (polish) | 1 session | Phase 2 |
| **B12** — `drwn doctor --check-cards` deep Git fsck | analysis 49 §8 mention | Low | 1 session | Phase 2 |

The Electron desktop app (B4) is the largest single item. The remaining items are mostly 1–3 sessions each.

---

## Item Details

### B1 — Git subdirectory support (R7 from analysis 51)

**Motivation:** A team with a monorepo at `github.com/team/repo` containing `cards/baseline/` and `cards/observability/` should be able to reference either as a card without the team having to split into multiple repos. Useful when the team already organizes harness assets in a monorepo.

**Design sketch:**

- Extend the Git URL ref grammar to accept a `path=<subpath>` fragment:
  ```
  git+https://github.com/team/repo.git#path=cards/baseline&ref=v1.0.0
  ```
- Or as a query-string-style fragment:
  ```
  git+https://github.com/team/repo.git?path=cards/baseline#v1.0.0
  ```
- Resolution: clone the full bare repo (or sparse-checkout the subpath), then treat the subpath as the card root for manifest reading and extraction.
- Lockfile records: `git.url`, `git.subpath`, `git.ref`, `git.commit`.
- Bare repo cache key: `<scope>/<name>.git/` where `<name>` is the *card name* (from the card.json at the subpath), not the repo name. Multiple cards from the same monorepo share the same bare repo on disk if drwn detects this; or they each have their own bare repo (simpler but less efficient).

**Dependencies:** Phase 2 (bare repo store) must be in place.

**Effort:** 1–2 sessions. Mostly resolver work + lockfile schema bump (optional `git.subpath` field).

**Open questions:**
- One bare repo per card-source-in-monorepo, or one bare repo per monorepo with subpath indexing?
- How does `drwn card publish` work for a monorepo-hosted card? Probably: the source is at `~/.agents/drwn/sources/@scope/name/`, publish commits and tags in the monorepo's bare repo at the right subpath. Sparse-checkout makes this tricky.

**Promotion criteria:** any user requests it, OR drwn's own repo wants to ship multiple example cards from a single repo.

---

### B2 — Enterprise allowlisting (R9 from analysis 51)

**Motivation:** Enterprise teams need to restrict which Git hosts cards can come from (security/compliance), auto-register team catalogs for new joiners, and force-install required cards (e.g., a security-baseline card every project must have).

**Design sketch:**

Three new fields in `machine.json`:

```json
{
  "trustedSources": {
    "allowedHosts": ["github.com", "git.enterprise.local"],
    "allowedScopes": ["@team", "@upstream"],
    "denyAll": false
  },
  "extraKnownCatalogs": [
    "https://git.enterprise.local/cards/catalog.git"
  ],
  "requiredCards": [
    {
      "name": "@team/security-baseline",
      "range": "^1.0.0"
    }
  ]
}
```

**Enforcement:**

- **`trustedSources.allowedHosts`:** the resolver refuses any Git URL whose host isn't in the list. Clear error message: "Host `github.com` is not in the allowlist for this machine."
- **`trustedSources.allowedScopes`:** the resolver refuses cards whose canonical name doesn't match an allowed scope.
- **`extraKnownCatalogs`:** seeded into the catalog index alongside the default community catalogs on `drwn init`.
- **`requiredCards`:** `drwn install` verifies these are present in every project's lockfile; refuses to apply if any are missing. `drwn doctor` reports the gap.

**Dependencies:** Phase 2 (catalogs + bare repos).

**Effort:** 2–3 sessions. Mostly enforcement logic + tests; small schema change.

**Open questions:**
- How does `requiredCards` interact with projects that intentionally don't want a baseline (e.g., a single-developer sandbox)? Lean: allow per-project opt-out via `<project>/.agents/drwn/config.json` with a `requiredCardsExempted: true` flag, but the machine.json admin can disable this.
- Does the enforcement apply only on mutation (add/install) or also on existing-state inspection? Lean: mutation. Inspection (`drwn status`, `drwn cards`) should never fail because of allowlisting.

**Promotion criteria:** any enterprise interest, OR an internal corporate user (Remy's primary employer if applicable) needs it.

---

### B3 — `drwn card new --from-claude-code-plugin` (R14 from analysis 51)

**Motivation:** A user already using Claude Code plugins (per the marketplace ecosystem documented in analysis 51) may want to convert one into a drwn card. Lossy in practice (plugin manifests don't map 1:1 to card manifests) but useful as a starting point.

**Design sketch:**

```bash
drwn card new --from-claude-code-plugin <plugin-name> [--name <new-card-name>]
```

What it does:

1. Read `~/.claude/plugins/<plugin-name>/.claude-plugin/plugin.json` to get the plugin manifest.
2. Walk the plugin's content: skills, agents (skip; not a drwn concept), hooks (drop or warn), MCP servers, LSP servers (drop; not a drwn concept).
3. Generate `~/.agents/drwn/sources/<new-name>/card.json` with the mapped content.
4. Copy compatible content (skills, MCP defs) into the new source.
5. Report what was skipped or required manual translation.

**Dependencies:** Phase 3 (R6 capture flow infrastructure can be reused).

**Effort:** 1–2 sessions.

**Open questions:**
- What's the mapping table for plugin manifest fields → card manifest fields? Most are obvious (name, version, description); some have no equivalent (agents, hooks, LSP servers). Document the lossy mapping clearly.
- Should this be a separate command or a `--from-claude-code-plugin <name>` flag on `card new`?

**Promotion criteria:** post-Phase-3 if there's interest from users with existing Claude Code plugin investments.

---

### B4 — Electron Desktop App

**Motivation:** Replaces the dropped R13 TUI direction. A native desktop UI complements the CLI for users who want visual harness management without learning the CLI. Particularly valuable for:

- Browsing available cards (catalog discovery via a card-store-like UI)
- Visualizing the layered composition (built-in → library → project → curated → downstream — see analysis 43 §2)
- Inspecting drift between intent and materialization
- Comparing card versions (diff viewer)
- One-click `drwn install` / `apply` / `update` operations

**Design sketch:**

#### Architectural pattern: CLI as kernel, Electron as shell

The Electron app does **not** become a parallel implementation of drwn. It reads filesystem state from `~/.agents/drwn/` and `<project>/.agents/drwn/` directly, and **shells out to the `drwn` CLI** for mutations.

```
┌──────────────────────────────────────┐
│ Electron App (UI shell)              │
│   - reads filesystem state           │
│   - parses CLI JSON output           │
│   - shells out for mutations         │
│   - uses file watchers (chokidar)    │
└──────────────────────────────────────┘
                  ↓ (filesystem reads)
                  ↓ (Bun.spawn → drwn CLI)
┌──────────────────────────────────────┐
│ drwn CLI (kernel)                    │
│   - same binary users invoke         │
│   - --json output across commands    │
│   - filesystem-state authoritative   │
└──────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────┐
│ ~/.agents/drwn/ + <project>/.agents/ │
└──────────────────────────────────────┘
```

Why this architecture:

- **No state duplication.** The CLI's filesystem state is the single source of truth.
- **No daemon to maintain.** Electron is a normal client; the CLI doesn't grow a server mode.
- **CLI continues to be usable independently.** Users without the desktop app aren't degraded.
- **Mutations remain transactional.** Every mutation goes through the CLI's atomic-write code paths.

#### What the v1 app surface looks like

Tabs / panels (modeled on Claude Code's `/plugin` TUI but with desktop affordances):

1. **Dashboard.** Active profile + preset, project being viewed, composition diagram (layered view).
2. **Cards.** List of cards in the local store; clicking shows the per-card view (manifest, Git log, remotes, materialization sources).
3. **Project.** The currently-viewed project's `cards[]`, overlay, lockfile state, sync status.
4. **Catalogs.** Registered catalogs; search across them; one-click `drwn library add card` to install.
5. **Diagnostics.** `drwn doctor` results, drift detection, integrity verification.
6. **Settings.** Profile management, default catalogs, env vars (`DRWN_STORE_READONLY`, etc.).

#### Tech stack

- **Electron 30+** with React 19 (matches the docusaurus docs site stack).
- **Bun-compatible Electron build** (Electron uses Node; the CLI shells will spawn `drwn` which is Bun-based). Two-runtime architecture is fine because they don't share process space.
- **File watching:** chokidar or native fs.watch wrappers.
- **Diff rendering:** Monaco editor or diff2html for `drwn card diff` output.

#### Distribution

- macOS, Linux, Windows builds via electron-builder.
- Auto-update via Electron's update API.
- Published on the docs site download page; not bundled with the CLI npm package.

**Dependencies:** Phase 3 done (unified resolver, full Git story); B5 (typed errors) preferred but not required; B6 (library mode) optional — could improve performance by skipping CLI shell-outs for reads.

**Effort:** 8–15 sessions for v1. Most of the effort is UI design + cross-platform packaging, not drwn-side integration.

**Open questions:**
- Build the Electron app in the main drwn repo (`apps/desktop/`) or in a sibling repo (`darwinian-harness/desktop`)? Lean: sibling repo. Independent release cadence, doesn't bloat the CLI repo.
- What's the v1 scope? Probably read-only + simple mutations (`apply`, `update`, `outdated`). Authoring (capture flow, publishing) can come in v2.
- Should the desktop app embed the CLI binary, or assume the user has `drwn` on PATH? Lean: assume on PATH for v1 (matches what most CLI-paired desktop apps do). Embedded CLI is a v2 enhancement.
- File-watching scope: just project state, or full machine state? Lean: project state primarily, with a "refresh" button for machine state.

**Promotion criteria:** Phase 3 has merged; CLI is stable; there's user demand for visual management (likely emerges as the card ecosystem grows). When greenlit, this is its own full implementation plan with brainstorming + writing-plans.

---

### B5 — Typed `DrwnError` hierarchy + error code system

**Motivation:** Currently we have `GitError` (from Phase 1) and ad-hoc `Error` throws elsewhere. As the desktop app (B4) shells out to the CLI, it benefits from being able to identify specific failure modes by stable error codes — not by string matching on stderr.

**Design sketch:**

```typescript
// cli/core/errors.ts

export type DrwnErrorCode =
  | "GIT_UNREACHABLE"
  | "GIT_AUTH_FAILED"
  | "GIT_REF_NOT_FOUND"
  | "INTEGRITY_MISMATCH"
  | "CARD_ALREADY_PRESENT"
  | "CARD_NOT_FOUND"
  | "LOCKFILE_INVALID"
  | "STORE_READONLY"
  | "PROJECT_NOT_INITIALIZED"
  | "MANIFEST_INVALID"
  // ... ~30-50 codes total
  ;

export class DrwnError extends Error {
  constructor(
    public readonly code: DrwnErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly hints?: string[],
  ) {
    super(message);
    this.name = "DrwnError";
  }

  toJson(): object {
    return {
      code: this.code,
      message: this.message,
      hints: this.hints,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

// Subclasses for grouping
export class GitError extends DrwnError {
  // Existing GitError stays; extends DrwnError
}

export class IntegrityError extends DrwnError {
  constructor(message: string, public readonly expected: string, public readonly actual: string) {
    super("INTEGRITY_MISMATCH", message);
  }
}
```

**Refactoring effort:** find every `throw new Error(...)` in `cli/`, classify into one of the codes, replace.

**JSON output:** errors emitted via `--json` carry `code`, `message`, `hints`, `cause`. Desktop app and CI consumers can dispatch on `code`.

**Dependencies:** None. Could land anytime post-Phase-2.

**Effort:** 1–2 sessions. Mostly mechanical refactoring + classification.

---

### B6 — Library mode (`darwinian-harness/core` importable from Bun/Node)

**Motivation:** A future Electron app (B4) or third-party integration may want to call drwn's core functions directly instead of shelling out. Today's `cli/core/*` modules are mostly import-clean, but some have Clipanion or `process.exit` dependencies bleeding in.

**Design sketch:**

- Audit `cli/core/*` for any Clipanion / Bun-CLI-specific imports. Move those into `cli/commands/*`.
- Publish a separate npm package: `darwinian-harness-core` (or scoped: `@darwinian-harness/core`) that re-exports `cli/core/*` as a clean library.
- The library API: `resolveCard`, `applyMaterialization`, `loadCardLock`, `writeCardLock`, `installFromLockfile`, etc.
- Document the library API as part of the public surface.

**Dependencies:** Phase 3 (fully unified resolver). B5 (typed errors) helps because library consumers want typed error handling.

**Effort:** 2–3 sessions. Mostly housekeeping; possibly some refactoring to break Clipanion bleed.

**Open questions:**
- Versioning: tie the library package version to the CLI version, or version independently?
- Surface: how much of `cli/core/*` becomes public API vs implementation detail? Document this clearly.

---

### B7 — Static catalog browser site

**Motivation:** Per analysis 51 §5.3, a Tier 3 item. A GitHub Pages site auto-generated from a catalog repo, showing card names, descriptions, versions, stability badges. No backend; rebuilt on every catalog commit via GitHub Actions.

**Design sketch:**

- A new repo `darwinian-harness/catalog-browser` with a small static-site generator (Astro or Eleventy).
- Reads `catalog.json` from a configured catalog repo (e.g., `darwinian-harness/cards-catalog`).
- For each card listed, optionally clones the card repo to read its `card.json` and show description, version history, stability.
- Deployed to GitHub Pages on every catalog commit.

**Dependencies:** Phase 2 (catalogs exist), default community catalog exists with at least a few cards listed.

**Effort:** 2 sessions.

**Promotion criteria:** the community catalog has ≥10 cards.

---

### B8 — `darwiniantools.com/cards` discovery aggregator

**Motivation:** A central discovery site for the drwn ecosystem. Aggregates the default community catalog plus any registered third-party catalogs. Visitors browse, search, sort by stability/usage/recency.

**Design sketch:** Same architecture as B7, with broader scope. Possibly merges with B7 (one site, two views).

**Dependencies:** B7.

**Effort:** 2–3 sessions on top of B7.

**Promotion criteria:** ecosystem has multiple catalogs and at least a few dozen cards. Possibly never necessary if B7 is good enough.

---

### B9 — `drwn store push-all` / `pull-all` for bulk sync

**Motivation:** Per-card push/fetch (Phase 2) is the right granularity for normal use, but a user with many cards across multiple machines wants a "sync everything" command.

**Design sketch:**

```bash
drwn store push-all [--remote <r>]
drwn store pull-all [--remote <r>]
```

Iterates over every bare repo in `~/.agents/drwn/cards/` and runs the corresponding per-card operation with bounded parallelism (e.g., 4 concurrent).

**Dependencies:** Phase 2.

**Effort:** 1 session.

**Promotion criteria:** any multi-machine user reports the lack of this as friction.

---

### B10 — Card signing / SLSA-style provenance attestation

**Motivation:** Per analysis 32 §6.6. Today, drwn cards have integrity hashes (sha256 over content). They don't have provenance attestations — there's no cryptographic proof of *who* built the artifact and *from what source*.

For enterprise / supply-chain-sensitive use cases, SLSA in-toto attestations are the standard.

**Design sketch:**

```bash
drwn card publish @me/baseline --with-provenance
# → emits a SLSA in-toto attestation alongside the tag,
#   recording builder identity (current user + machine),
#   source commit SHA, build process, output digests
```

Consumer-side:

```bash
drwn install --verify-provenance
# → fetches the attestation alongside the card; verifies signature
```

**Dependencies:** Phase 2 (publishing).

**Effort:** 3–5 sessions. Non-trivial because SLSA's attestation format and verification flow are involved. Requires signing key management (which is its own subsystem).

**Promotion criteria:** enterprise or compliance-sensitive use case surfaces.

---

### B11 — Parallel fetch concurrency tuning + progress bars

**Motivation:** `drwn install` and `drwn outdated --fetch` are bounded-parallel today (4 concurrent per Phase 2). For users with 20+ cards or slow networks, progress feedback is missing.

**Design sketch:**

- Add a progress indicator to multi-card fetch operations (when stdout is a TTY). Use a small ascii progress widget or a CLI library like `cli-progress`.
- Make the parallel concurrency configurable via `DRWN_FETCH_CONCURRENCY` env var (default 4).
- For `--json` output mode, emit progress events as newline-delimited JSON.

**Dependencies:** Phase 2.

**Effort:** 1 session.

---

### B12 — `drwn doctor --check-cards` deep Git fsck

**Motivation:** Per analysis 49 §8. The current `drwn doctor` reports drift between intent and downstream. A deep check would also `git fsck` every bare repo and verify object integrity at the Git level.

**Design sketch:**

```bash
drwn doctor --check-cards [--repair]
```

For each bare repo:
- Run `git fsck` (parse output).
- Verify the recorded tree SHA for each tag still resolves cleanly.
- Optionally (`--repair`) run `git gc` to clean up loose objects.

Reports any repos with detected corruption.

**Dependencies:** Phase 2.

**Effort:** 1 session.

---

## Long-Term CLI Architecture Considerations

Beyond the discrete backlog items above, three architectural disciplines should carry forward through all post-Phase-3 work. These don't have separate task plans — they're cross-cutting principles.

### Architecture Principle 1: CLI as kernel, UIs as shells

**Implication:** the CLI continues to be the source of truth. Future UIs (Electron desktop app per B4, possibly an IDE extension later, possibly a web dashboard) all sit on top of the CLI without duplicating its logic.

**What this requires of CLI development going forward:**

- Every command that surfaces state must have a stable `--json` output (Phase 1 already started this discipline; continue).
- Every mutation must use atomic writes (already true via existing helpers).
- Filesystem layouts under `~/.agents/drwn/` are stable contracts. Changes to layout require migration tooling.
- `cli/core/*` modules stay import-clean (no Clipanion or `process.exit` deps), so a library mode (B6) can be added without refactoring.

### Architecture Principle 2: Schema stability discipline

**Implication:** lockfile v2, manifest v1/v2, catalog v1 schemas — once published, schema changes require migration paths.

**What this requires:**

- Every schema version is documented as a published JSON Schema (next to the docs site).
- Schema bumps are deliberate: a clear "v3 because X, Y, Z" rationale, plus a read-compat shim for v2.
- Old schemas are supported in read for at least one major drwn version after introduction of the new schema.

### Architecture Principle 3: Layered model as the documentation backbone

**Implication:** analyses 43 §2 (five-layer model) and 50 (command roles across phases) are the canonical teaching framework for both the CLI and the desktop app.

**What this requires:**

- Documentation continues to organize around the five layers + six lifecycle stages.
- The desktop app's UI mirrors this organization (Dashboard shows the layered composition; tabs map to lifecycle stages).
- Public-facing vocabulary stays locked to Card / Store / Catalog / Project / Apply / Install.

---

## How to Promote a Backlog Item

When a backlog item earns its way out of this doc:

1. Open a brief brainstorming session if the design needs refining (use `superpowers:brainstorming` if there are multiple viable approaches).
2. Write a full implementation plan using `superpowers:writing-plans` and save to `.ai/tasks/<next-number>_<descriptive-name>.md`.
3. Update this doc: move the item from the backlog table into a "Promoted" section with a link to its task plan.
4. Execute via `superpowers:executing-plans`.

The numbering continues from 33 onwards as items are promoted.

---

## Items Explicitly Out of Scope

These were considered but rejected (per analysis 51 §5.4):

- **A hosted registry service** (like npmjs.com). Git repos + catalog files scale to thousands of packages without one (proven by Claude Code's ecosystem and Homebrew taps).
- **A user account system.** GitHub accounts are sufficient for identity; Git commit signatures are sufficient for authenticity.
- **A web-based publish flow.** CLI publish + git push is the right model.
- **A rating/review system.** GitHub stars on card repos serve the same purpose with zero maintenance.
- **A TUI (the dropped R13 from analysis 51).** Replaced by the Electron desktop app direction (B4).

---

## Appendix

### A. Backlog priority decision matrix

When deciding which backlog item to promote next, evaluate against:

- **User demand signal**: has anyone asked for it? Is there a concrete use case being blocked?
- **Effort to value ratio**: 1-session items earn promotion easily; multi-session items need stronger justification.
- **Architectural pre-requisites**: does it block other items? Items that unblock others (e.g., B5 typed errors enables B4 desktop app integration) earn priority.
- **Cohesion with current work**: if you're doing CLI work, B5/B6/B9 are natural neighbors; if you're doing UX work, B4/B7/B8 are.

### B. Notes on the Electron app (B4) timing

B4 is the largest backlog item but doesn't need to wait for the rest. It can begin as soon as Phase 3 merges. The CLI-as-kernel discipline from Phase 1–3 amendments is exactly what B4 needs to plug into.

A reasonable sequence after Phase 3 ships:

1. **Initial Electron app brainstorm** — define v1 scope, tech stack decisions, repo layout.
2. **B5 (typed errors)** — ship before starting B4's mutation flows.
3. **B11 (progress feedback)** — small polish; useful immediately and benefits B4.
4. **B4 v1** — read-only Electron app with the five-tab structure from §B4.
5. **B6 (library mode)** — if B4 finds CLI shell-outs too slow, refactor to library mode.
6. Other backlog items as demand surfaces.

### C. What this backlog explicitly does NOT cover

- Card content authoring tooling (e.g., a VS Code extension for editing card sources). Not in scope.
- Marketing / community-building activities (e.g., a Discord, conference talks, blog posts). Not engineering work.
- Funding / commercial product directions. Out of scope for engineering docs.

### D. Maintenance of this backlog

This document should be reviewed and pruned quarterly. Items that haven't been promoted in a year should be re-evaluated for whether they're still relevant or should be removed. New items can be added at any time; new entries follow the same template as existing entries (motivation / design sketch / dependencies / effort / open questions / promotion criteria).
