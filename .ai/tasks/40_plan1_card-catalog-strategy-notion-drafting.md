# ABOUTME: Drafting strategy for the "Harness Card Catalog Strategy v1" Notion page
# ABOUTME: Maps every Notion section to repo source-of-truth and supplies paste-ready prose

# Task 40 — Card Catalog Strategy Notion Page Drafting (Plan 1)

**Status**: Planning
**Created**: 2026-06-04
**Updated**: 2026-06-04
**Priority**: High
**Estimated Effort**: 0.5 day to draft, 1 day to review & publish
**Dependencies**: none (downstream of all shipped catalog work)
**References**: [analyses/51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md, analyses/55_card-catalog-publish-cli-target-architecture.md, analyses/46_drwn-card-team-sharing-flow.md, analyses/47_drwn-target-architecture-after-phase-1.md, analyses/48_drwn-target-architecture-after-phase-2.md, analyses/52_drwn-target-architecture-post-wave-1.md, analyses/53_remote-card-publishing-usage-pattern-manual.md, knowledges/01_agents-cli-usage-guide.md, knowledges/10_drwn-cli-architecture.md, tasks/36_card-catalog-publish-cli-implementation-plan.md, tasks/39_card-catalog-collaboration-lifecycle-testing-plan.md, cli/commands/card/catalog-publish.ts, cli/commands/card/new.ts, cli/commands/card/validate.ts, cli/commands/library/catalog.ts, cli/commands/search/card.ts, cli/commands/init.ts, cli/core/card-catalog.ts, cli/core/card-store.ts, cli/core/card-manifest.ts, cli/core/card-install.ts, registry/config.json]

---

## 1. Objective

Produce comprehensive, paste-ready content for the Notion page **"Harness Card Catalog Strategy v1"** that:

- Replaces the current placeholder skeleton with prose grounded in the **shipped reality** of the `drwn` CLI.
- Uses `drwn` vocabulary throughout. No `bgng` left over from the prior naming.
- Contains no personal names. The Notion callout's status fields (Owner / Reviewers) stay outside the body of the strategy and are not duplicated inside the content.
- Articulates the **Catalog ↔ Card Factory boundary** as a CLI-side contract that the future Web App authoring surface will conform to — not the other way around.
- Locks the decisions that practice has already made (git as the primary v1 channel; quality signals in `card.json`) and reserves the "open decisions" surface for what is genuinely undecided.
- Preserves the case-study research at its existing Notion home as an appendix link, rather than duplicating it.

The strategy doc is the **commit version** of the catalog work. It is what reviewers should consult when they ask "what is `drwn`'s catalog stance and where does it live in the codebase?".

---

## 2. Success Criteria

- [ ] Every claim in §1 of the Notion page (catalog substrate) is traceable to a CLI file path or shipped doc.
- [ ] Section 2 ("Open Decisions") is fully reset; the surviving open items are exactly the ones the team cannot resolve without external input.
- [ ] No `bgng` token survives in the Notion body. All command names are `drwn …`.
- [ ] No personal names appear in the Notion body. Status callout owner/reviewer fields are out of scope.
- [ ] Each Notion section in this plan has: **current placeholder text** (verbatim), **proposed replacement** (paste-ready), **source-of-truth** (repo evidence), and **open questions** (only if any).
- [ ] The current Notion placeholder skeleton is fully reset to grounded prose; no checkbox-headline-only sections remain.
- [ ] The Catalog ↔ Card Factory boundary is stated unambiguously in §2.

---

## 3. Approach: Strategic Reset

The current Notion page is a placeholder skeleton. Its four section headings (Ship with v1 / Shortly after / On demand / What NOT to build) and its four "Open Decisions" were copied forward from the research phase before most of the v1 catalog substrate had landed in code. As of today:

- The producer side ships: `drwn card publish`, `drwn card remote …`, `drwn card push`, `drwn card validate`, `drwn card catalog publish` (cli/commands/card/{publish,remote,push,validate,catalog-publish}.ts).
- The consumer side ships: `drwn add`, `drwn card add`, `drwn card clone`, `drwn card fetch`, `drwn library catalog {list,add,remove,refresh}`, `drwn search card` (cli/commands/{add,card,library,search}/…).
- Git host shorthand ships: `github:owner/repo@ver` and `gitlab:owner/repo@ver` resolve to git URLs and immutable refs (cli/core/card-store.ts:143-147).
- Quality signals ship: `stability`, `lastValidatedWith`, `testStatusBadge` are first-class fields in `card.json` with validator coverage (cli/core/card-manifest.ts:19-83, cli/core/card-source.ts:534-541).
- The `--from-project` capture flow ships (cli/commands/card/new.ts:36).
- The default community catalog is pre-registered by `drwn init` from `defaults.communityCatalogUrl` in the canonical config (cli/commands/init.ts:90, cli/core/card-catalog.ts:67-78, registry/config.json:25).

Treating shipped items as "decisions to be made" misrepresents the state. The reset:

- **§1.1** stops being "Ship with v1" and becomes **"Catalog substrate (shipped)."** Each item gets a one-word status flag (Shipped / Partial / Planned).
- **§1.2** stays forward-looking but is reframed as "Next up — committed but not yet shipped."
- **§1.3** stays as "Demand-gated."
- **§1.4** stays as the won't-build list (already correct).
- **§2 ("Open Decisions") is fully replaced.** The two stale items (npm-vs-git, quality signals) get retired with a brief rationale; the genuinely open items (Catalog ↔ Card Factory boundary, filtering metadata, default-catalog identity) are framed with options and tradeoffs.
- **§3 (Flywheel)** is updated for shipped reality. Every step in the flywheel is now a real command.
- **Appendix** decision: keep the case study at its existing v0.1 location; link, do not move. The two pages serve different audiences (research vs. committed strategy) and should evolve independently.

---

## 4. Grounding Map

| Notion section | Repo source-of-truth | Status |
|---|---|---|
| §1.1 `github:` specifier | cli/core/card-store.ts:143-147 (also `gitlab:`) | Shipped |
| §1.1 Default community catalog pre-registered | cli/commands/init.ts:57-90; cli/core/card-catalog.ts:67-225; registry/config.json:25 | Shipped (identity: `curation-labs/dh-cards-catalog-v1`) |
| §1.1 `drwn card validate` | cli/commands/card/validate.ts | Shipped (consumer-side ref validation) |
| §1.1 GitHub Action for card validation | absent from repo; `.github/workflows/` holds only docs CI | Planned |
| §1.1 `harness-card` GitHub topic convention | docs/cli-quickref.md and docs-docusaurus mention "harness card"; no committed topic | Planned (convention not yet committed) |
| §1.1 Producer-side catalog publish (not in current Notion) | analyses/55; cli/commands/card/catalog-publish.ts; tasks/36 | Shipped (`drwn card catalog publish` modes: local, direct, pr) |
| §1.1 Capture-existing-setup flow (not in current Notion) | cli/commands/card/new.ts:36-84 | Shipped (`drwn card new --from-project`) |
| §1.2 GitHub App for catalog automation | not in repo | Planned |
| §1.2 `drwn store seed` for CI/offline | `DRWN_STORE_READONLY` honored across mutating commands; `drwn store export --out` ships; portable seed packaging partial | Partial |
| §1.2 `trustedSources` allowlist | not in repo | Planned |
| §1.3 Static card browser | not in repo | Demand-gated |
| §1.3 Private catalog support | `drwn library catalog add <git-url>` already accepts any git URL incl. private | Effectively shipped; reframe |
| §1.3 `drwn store push/pull` | `drwn store export` ships; pull/sync lifecycle not shipped | Partial |
| §2 npm vs git as primary v1 | cli/core/card-install.ts:37 throws `CARD_NPM_NOT_IMPLEMENTED`; git/file/store origins ship | **Decided in practice (git)** |
| §2 Quality-signal fields in `card.json` | cli/core/card-manifest.ts:19-83; cli/core/card-source.ts:534-541; `drwn card show` surfaces them | **Decided in practice (shipped)** |
| §2 Catalog ↔ Card Factory boundary | Card Factory is a future Web App feature for authoring and publishing cards; no CLI-side coupling yet | **Genuinely open** |
| §2 Metadata fields for filtering | analyses/55 lists the v1 catalog entry schema (`name`, `url`, `description`, `tags`); no committed filterable-fields contract | **Genuinely open** |
| §3 Flywheel | Each step maps to a shipped command (see §6.8 below) | Update for shipped state |

---

## 5. Drafting Playbook

Order of operations:

1. **Lock the hero callout** first — strip names from the body, push them to Notion's page properties. (Status / Reviewers / Last updated belong in the Notion property bar, not in the prose.)
2. **Draft §1 top-down**: §1.1 → §1.2 → §1.3 → §1.4. Use status flags on every item so reviewers can see at a glance what is shipped vs planned vs deferred. Keep each item's prose to one sentence of "what it is" + one sentence of "where it lives or what's left."
3. **Reset §2 last in §1's reading flow**, but treat it as the central deliverable. The committed §1 is summary; the open §2 is what reviewers should engage with. Cap each open decision at: framing question, options A/B(/C), tradeoffs, and a recommendation. Do not let the recommendations harden into decisions inside this draft — that is what review is for.
4. **Refresh §3 (Flywheel)** with the shipped command names, then sanity-check that every arrow is now executable.
5. **Decide the appendix** (link vs move). Recommend link; keep the strategy doc readable in one screen of scroll.
6. **Final pass**: search the prose for any `bgng`, any personal name, any "TBD" left over. Run the success-criteria checklist (§2).

Heuristics:

- Prefer a status flag (Shipped / Partial / Planned / Demand-gated / Won't build) over hedged language.
- When a shipped item differs from what the case study recommended, name the divergence explicitly and link to the comparative analysis (`analyses/51`).
- When an item is "Partial," say what works and what's left in one sentence each.
- Never name a person. Never quote a Slack thread. The catalog strategy is a system stance, not a transcript.
- Where the case study used `bgng` (e.g., `bgng apply github:user/card`), rewrite to current CLI surface (`drwn add github:user/card@^1.0.0` or `drwn card add @scope/name@^1.0.0`). The case study itself remains in `bgng`; this is a re-statement, not a rewrite.

---

## 6. Section-by-Section Work Blocks

Each work block has four parts: **Current placeholder** (verbatim) → **Proposed replacement** (paste-ready Notion markdown) → **Source-of-truth** → **Open questions**.

### 6.1 Hero callouts

**Current placeholder text:**

> 📌 **Status:** Draft → In review → Approved · **Version:** v1 · **Owner:** @… · **Reviewers:** … · **Last updated:** 2026-06-04
> **Related:** [Darwinian Harness PRD] · [Darwinian Harness CLI Usage Guide]
>
> 🧧 **Scope.** Turns the Claude Code marketplace research into committed Catalog strategy + decisions for how Harness Cards are shared, discovered, and published. The case-study research is preserved as an appendix.
> **Supersedes / builds on:** [Harness Card Marketplace Research v0.1].

**Proposed replacement (three Notion callouts at the top of the page, in order):**

**Callout 1 — Metadata** (icon `📌`, color `blue_bg`):

> **Status:** Draft → In review → Approved  ·  **Version:** v1  ·  **Last updated:** [date mention]
> **Related:** [Darwinian Harness PRD] · [Darwinian Harness CLI Usage Guide v1]
> **Builds on:** [Harness Card Marketplace Research v0.1] (preserved as research appendix; see §A)

**Callout 2 — Scope** (icon `🧧`, color `gray_bg`):

> **Scope.** This page commits the Darwinian Harness catalog stance: how Harness Cards are shared, discovered, and published through `drwn`. It supersedes the upstream research (linked above) by locking the decisions practice has already made and isolating what remains genuinely open.

**Callout 3 — Guiding principle** (icon `🧭`, color `blue_bg`):

> **Guiding principle.** GitHub-as-infrastructure, not a hosted registry. A catalog is a thin index of pointers; Cards live in their own repositories. Identity uses Git; publication uses Git; discovery uses Git plus a JSON index file.

**Source-of-truth:** Owner and Reviewers belong in Notion's page-property bar, not in the body. The scope statement and guiding principle are restated from analyses/51 §1 and the case study Part 5.

**Open questions:** none.

---

### 6.2 §1 introduction

**Current placeholder text:**

> # 1. Catalog strategy (decisions)
> Guiding principle from the research: **GitHub-as-infrastructure, not a hosted registry.** A catalog is a thin index; Cards live in their own repos / npm packages.

**Proposed replacement:**

> # 1. Catalog strategy
>
> The catalog model has three layers, each owned by a different artifact:
>
> 1. **Card.** A directory with `card.json` at its root. Lives in its own Git repository (or a subdirectory of one). Authors publish and version cards independently.
> 2. **Catalog.** A Git repository with a `catalog.json` index at its root that lists cards as `{ name, url, description, tags }` entries. Catalogs do not host card content — they point to it. A user or team may consume any number of catalogs.
> 3. **Local store.** The per-user cache at `~/.agents/drwn/`. Holds extracted card trees, bare card repos, registered catalogs, and write records. The CLI is the only supported writer.
>
> Cards distribute through Git as the primary channel in v1. The npm channel is deferred (`drwn` exits with `CARD_NPM_NOT_IMPLEMENTED` when an npm-origin ref is supplied — file, store, and git origins are fully supported). The subsections below mark each strategy item with a status flag: **Shipped**, **Partial**, **Planned**, or **Demand-gated**.

**Source-of-truth:** analyses/48 §10 (catalog schema), analyses/55 (publish architecture), cli/core/card-install.ts:37 (npm gate), cli/commands/card/{publish,push,catalog-publish}.ts, cli/commands/library/catalog.ts.

**Open questions:** none (npm-deferred is a stated position; see §6.7 for the open decisions).

---

### 6.3 §1.1 Catalog substrate (replaces "Ship with v1")

**Current placeholder text:**

> ## 1.1 Ship with v1 (zero infra)
> - [ ] **`github:` specifier** — `drwn apply github:user/card@^1.0.0` resolves via GitHub API (tags → semver → tarball). *Decision: promote from v2 → v1.*
> - [ ] **Default community catalog** — one git repo with a `registry.json` index, pre-configured so `drwn apply @community/...` works out of the box. PRs are the submission mechanism.
> - [ ] **`drwn card validate`** — schema, semver, structural-change classification, skill frontmatter, MCP definitions.
> - [ ] **GitHub Action for card validation** — one-line CI gate for card repos.
> - [ ] **`harness-card` GitHub topic** convention for discoverability.

**Proposed replacement:**

> ## 1.1 Catalog substrate
>
> The minimum surface required to make Cards shareable through Git, without any hosted infrastructure. Each item ships, is partial, or is planned for the v1 release window.
>
> ### Consumer surface — Shipped
>
> - **Git host shorthand.** `drwn add github:owner/repo@^1.0.0` and `drwn add gitlab:owner/repo@^1.0.0` resolve to immutable Git refs, hash-verify the extracted tree, and write the resolution into `card.lock`. Any `git+https://…` or `git+ssh://…` URL also works as a card ref.
> - **One-command consumption.** `drwn add <ref>` and the explicit `drwn card add <ref>` mutate the project config and update `card.lock` in one step. `drwn apply <ref> --write` materializes downstream tool state in the same call.
> - **Catalog registration.** `drwn library catalog add <git-url>` clones any catalog repo as a bare clone under `~/.agents/drwn/catalogs/<slug>`. `drwn library catalog refresh` re-pulls. `drwn search card <query> [--scope @ns]` searches registered catalog manifests.
> - **Default community catalog.** `drwn init` pre-registers the catalog URL declared in the harness source's `defaults.communityCatalogUrl` (currently `github.com/curation-labs/dh-cards-catalog-v1`). The `--no-default-catalogs` flag skips this for users who only want their own catalogs. Registration is fail-soft — an unreachable default does not block `drwn init`.
> - **Card-ref validation.** `drwn card validate <ref>` re-resolves a ref, re-verifies its integrity hash, and emits typed error codes (`CARD_NOT_FOUND`, `CARD_NO_MATCHING_VERSION`, `INTEGRITY_MISMATCH`, etc.) in `--json` mode.
>
> ### Producer surface — Shipped
>
> - **Card publication.** `drwn card publish <name>` snapshots an authoring source into an immutable, content-addressed bare repo under `~/.agents/drwn/cards/<scope>/<name>.git`. Re-publishing a version is refused.
> - **Card remote management.** `drwn card remote add|set|list|remove` configures the Git origin where a published card lives. `drwn card push` sends `refs/heads/main` and tags. `drwn card fetch` pulls. `drwn card clone <git-url-or-shorthand>` resolves and seeds the local store from a remote.
> - **Catalog publication.** `drwn card catalog publish <card-ref> --catalog <scope|git-url|path> --mode local|direct` lists an already-pushed card in a Git-backed catalog (`catalog.json`). The `direct` mode clones the catalog, updates the entry, validates, commits, pushes, and refreshes the registered local catalog. The `pr` mode is planned for users without direct push rights.
> - **Capture-existing-setup.** `drwn card new <scope/name> --from-project` snapshots the current project's effective harness (active skills, MCP servers, extensions, targets) into a fresh card source. This is the friction-killer the upstream research identified as the flywheel entry point.
> - **Quality signals.** `card.json` accepts `stability` (`experimental` | `stable` | `production`), `lastValidatedWith` (strict semver of the harness version), and `testStatusBadge` (HTTP(S) URL). All three are validated at write time and surfaced by `drwn card show`.
>
> ### Substrate around the substrate — Partial
>
> - **GitHub Action for card validation.** A reusable Action that runs `drwn card source doctor` and `drwn card validate` on PRs against a card repo is not yet published. The underlying validators ship.
> - **`harness-card` GitHub topic convention.** The convention is not yet committed. Adopting `darwinian-harness-card` or `drwn-card` as the official topic and using it on every example card the project ships is a near-zero-cost adoption move.

**Source-of-truth:** cli/core/card-store.ts:143-147 (shorthand); cli/commands/init.ts:57-90, cli/core/card-catalog.ts:67-225, registry/config.json:25 (default catalog); cli/commands/card/{publish,remote,push,fetch,clone,validate,catalog-publish,new}.ts; cli/commands/library/catalog.ts; cli/commands/search/card.ts; cli/core/card-manifest.ts:19-83, cli/core/card-source.ts:534-541 (quality signals). For the Action gap and topic gap, see analyses/51 R4 and R8.

**Open questions:** Topic name (`darwinian-harness-card` vs `drwn-card`) — small but irreversible once published. Recommended: `drwn-card`. Treat as a copy-edit decision at publish time.

---

### 6.4 §1.2 Next up (replaces "Shortly after v1")

**Current placeholder text:**

> ## 1.2 Shortly after v1
> - [ ] GitHub App for catalog automation (tag release → validate → PR to catalog).
> - [ ] `drwn store seed` for CI / container / offline use.
> - [ ] `trustedSources` allowlist in `machine.json` (enterprise control).

**Proposed replacement:**

> ## 1.2 Next up
>
> Committed for the v1 release window. Each item is a closed design question whose implementation is not yet complete.
>
> - **Catalog automation Action / App.** A GitHub Action template (single-line `uses:` clause) that validates a card on PR and reports a check. A follow-up GitHub App that watches tag releases in card repos and opens a PR to the consumer's chosen catalog with the new entry. The Action is the higher-priority half — it gates quality at the source. The App is the convenience layer that makes the catalog stay in sync without manual `drwn card catalog publish` calls.
> - **Read-only store and seed packaging.** `DRWN_STORE_READONLY=1` is already respected by all mutating commands and is the foundation for read-only-mounted stores in CI and container images. `drwn store export --out <path>` already produces a tarball of the store. The remaining work is the seed-import counterpart: a portable, content-addressed seed format that can be mounted read-only at runtime and that the resolver consults before any network call. This unblocks airgapped CI.
> - **Trusted sources.** A `trustedSources` allowlist in `machine.json` that restricts the resolver to specific Git hosts, organizations, or catalog URLs. Three small config fields, not a service. Required by teams that need to gate their supply chain through a shared baseline.

**Source-of-truth:** analyses/51 R4 and R10; tasks/30 (Phase 2 implementation plan); cli/core/card-store.ts (resolver entry points); cli/commands/store/export.ts (existing export side).

**Open questions:**

- Hosting of the validation Action — does it live in the main `darwinian-harness` repo or a single-purpose `validate-card-action` repo? Single-purpose has cleaner version cadence; co-located is easier to keep in sync with CLI changes.

---

### 6.5 §1.3 Demand-gated (replaces "Build only on demand")

**Current placeholder text:**

> ## 1.3 Build only on demand
> - [ ] Static card browser (GitHub Pages auto-generated from the catalog repo).
> - [ ] Private catalog support (`drwn registry add ...`).
> - [ ] `drwn store push/pull`.

**Proposed replacement:**

> ## 1.3 Demand-gated
>
> Build when there is concrete pull from users or teams, not on roadmap inertia.
>
> - **Static catalog browser.** A GitHub Pages site auto-generated from the catalog repo, showing card names, descriptions, stability badges, install snippets, and version history. Backendless; rebuilt by the catalog repo's own CI on every commit. The shipped substrate (`catalog.json` plus `card.json` per repo) is already indexable; nothing about today's stance precludes this.
> - **Private and scoped catalogs at scale.** Today, `drwn library catalog add <git-url>` already accepts any catalog repo URL, including private ones reachable via the user's Git credentials. What's demand-gated is the team-shared *registration* of catalogs (e.g., an `extraKnownCatalogs` field in committed project config so teammates inherit catalogs without per-developer `library catalog add` calls). Pairs naturally with `trustedSources` from §1.2.
> - **Store-level sync (`drwn store push/pull`).** The card-level `push` / `fetch` / `clone` lifecycle ships per §1.1. What is not shipped is a store-wide sync that pushes every published card to a designated remote (a "publish my entire local store" command). Useful for multi-machine personal setups but not strictly required by the catalog model.
> - **In-app catalog browser.** A `drwn` TUI for browsing registered catalogs and previewing cards before applying. Polish, not structure — defer until adoption surfaces a real navigation pain point.

**Source-of-truth:** cli/commands/library/catalog.ts (existing private catalog support via any Git URL); analyses/51 §7.3 and R13; tasks/31 (Phase 3 implementation plan).

**Open questions:** none beyond the trigger condition ("what user signal counts as demand?").

---

### 6.6 §1.4 What we deliberately won't build

**Current placeholder text:**

> ## 1.4 What NOT to build
> A hosted registry service · a separate account system (GitHub identity suffices) · a web-based publish flow · a ratings/review system.

**Proposed replacement:**

> ## 1.4 What we deliberately won't build
>
> Naming these explicitly so the catalog stance is unambiguous and so future proposals to add them must clear an explicit reversal.
>
> - **A hosted registry service.** No `npmjs.com`-style central registry, no upload API, no service to operate. Git hosts already scale to tens of thousands of catalog-style repos; the catalog model rides on that.
> - **A drwn-specific account system.** Git identity suffices for publication. The Web App will own a separate user account for analytics and starring; that account never becomes a prerequisite for publishing or consuming a card.
> - **A web-based publish flow that bypasses the CLI.** The CLI plus `git push` is the publication contract. Web App authoring surfaces (see §2 "Card Factory boundary") must call the same CLI primitives or write the same artifacts the CLI does; they do not become a parallel publication path.
> - **A ratings / reviews system on catalog entries.** Stars on the Web App and the optional `stability` field in `card.json` cover the trust-signal surface without moderation infrastructure.

**Source-of-truth:** analyses/51 §5.4; the upstream research Part 5 "What NOT to Build."

**Open questions:** none.

---

### 6.7 §2 Genuinely open decisions (full reset)

**Current placeholder text:**

> # 2. Open decisions
> - [ ] Relationship between this Catalog and the Web App's Card Factory feature (recommend / add skills / add MCP) [scoped externally] — where does discovery vs authoring live?
> - [ ] Metadata to store for filtering (ties to the 6/5 check-in note on the remote-test repo).
> - [ ] npm vs git as the *primary* v1 channel.
> - [ ] Quality-signal fields in `card.json` (`stability`, test badge, last-validated harness version).

**Proposed replacement:**

> # 2. Open decisions
>
> Two of the four items previously listed here have been resolved by shipped code. They are retired below with a one-line rationale so the decision trail is preserved.
>
> ### 2.0 Retired since the placeholder
>
> - **npm vs Git as the primary v1 channel — closed (Git).** `drwn` resolves `git+`, `file:`, `store`, `github:`, and `gitlab:` card refs today; npm-origin refs exit with `CARD_NPM_NOT_IMPLEMENTED`. The catalog substrate (`catalog.json`, `drwn card catalog publish`, `drwn library catalog`, `drwn search card`) is Git-only. npm distribution may return as a non-default secondary channel if a clear use case surfaces, but the primary v1 path is Git.
>
> - **Quality-signal fields in `card.json` — closed (shipped).** `stability`, `lastValidatedWith`, and `testStatusBadge` are first-class manifest fields with validator coverage. `drwn card show` surfaces them so consumers can assess readiness before adopting a card. Authors set them via `drwn card source set`.
>
> ### 2.1 Catalog ↔ Card Factory boundary — open
>
> *Card Factory* is a planned Web App surface for constructing Harness Cards from a browser and adding them to a team or public catalog. It does not exist yet. The open question is how it should write through to the catalog substrate the CLI already owns.
>
> Three options:
>
> - **Option A — Card Factory drives the CLI.** The Web App generates a card source, then calls the CLI primitives (`drwn card publish`, `drwn card push`, `drwn card catalog publish`) in a managed environment to materialize the publication. Pros: a single publication path; all integrity, validation, and catalog mutation logic stays in the CLI; the Web App cannot drift. Cons: requires the Web App to run CLI processes (or a Node-equivalent of them); harder to operate.
> - **Option B — Card Factory writes the same artifacts.** The Web App writes the same `card.json`, the same Git tag layout, and the same `catalog.json` entry the CLI would write, but does so through Git APIs directly. Pros: no CLI dependency on the server. Cons: two implementations of the same write contract must stay in sync; integrity gaps are likely.
> - **Option C — Card Factory authors, the CLI publishes.** The Web App produces a downloadable card source bundle and a one-line `drwn card publish && drwn card push && drwn card catalog publish` instruction the user runs locally. Pros: simplest; preserves the CLI-as-publication-authority stance. Cons: not a "publish from the browser" flow.
>
> Recommendation: **Option A** for catalog mutation, **Option C** for authoring. Authoring in the browser is a usability win; publishing must run through the CLI so the catalog substrate keeps one writer.
>
> ### 2.2 Filtering and discovery metadata in `catalog.json` — open
>
> Today's catalog entry schema is `{ name, url, description?, tags? }`. Sufficient for `drwn search card <query>`; insufficient for browse-by-stack, browse-by-stability, or sort-by-recency.
>
> Candidate additional entry fields:
>
> - `stability` — mirrors `card.json` for fast filtering without resolving every entry.
> - `lastValidatedWith` — earliest harness version the entry has been validated against.
> - `language` / `stack` tags — `python`, `typescript`, `react`, etc. Standardized vocabulary, not free text.
> - `homepage` — optional human-readable docs URL distinct from the install URL.
> - `publishedAt` — ISO timestamp for recency sort.
> - `maintainer` — string handle (matching the catalog's maintainer list).
>
> Tradeoff: every added field becomes part of the catalog v1 schema and must be respected by future tools. Recommendation: pick the minimum that unblocks the static browser (§1.3) — `stability`, `language` tags, and `publishedAt` are the smallest set that delivers filtering + sort + trust-at-a-glance. Defer the rest until demand.
>
> ### 2.3 Default catalog identity — open
>
> The default community catalog the CLI pre-registers today is `github.com/curation-labs/dh-cards-catalog-v1`. The open question is whether this URL is the intended long-term identity for the default catalog, or whether to move it under a community-org namespace when one exists.
>
> Recommendation: stand up the eventual community org as soon as it has a name; redirect the default URL there; keep the current URL as a redirect. Move when there is at least one tested public card listed in the catalog (so the default isn't an empty index for new users).

**Source-of-truth:** cli/core/card-install.ts:37 (npm gate); cli/core/card-manifest.ts:19-83 (quality signals shipped); analyses/55 §"Catalog Manifest Write Rules"; registry/config.json:25 (current default URL); analyses/51 §3.3 R3 (default catalog gating).

**Open questions for stakeholders** — listed in §7 below.

---

### 6.8 §3 Adoption flywheel

**Current placeholder text:**

> # 3. The adoption flywheel
> `drwn card new --from-project` (capture existing setup) → `drwn card publish` + `git push` → `drwn apply github:user/card` (one command) → catalog aggregates → new users find & apply → authors iterate. The `--from-project` entry point is what drops publishing friction to near-zero.

**Proposed replacement:**

> # 3. Adoption flywheel
>
> Every arrow below is a shipped command today.
>
> ```text
> drwn card new --from-project        # capture an already-working harness
>   → drwn card publish                # snapshot to the local immutable store
>   → drwn card remote add + push      # share via any Git host
>   → drwn card catalog publish        # list in a shared catalog
>   → drwn add github:owner/repo@^v    # consumer installs in one command
>   → drwn library catalog refresh     # catalogs aggregate new entries
>   → drwn search card <query>         # discovery from registered catalogs
>   → consumers iterate; authors version-bump
>   → (repeat)
> ```
>
> The friction-killer is `drwn card new --from-project`. It collapses authoring-from-scratch into snapshotting-what-you-already-have. Without it, the flywheel relies on users authoring cards from a blank source, which is materially higher friction than the consumer side. With it, anyone with a working `drwn` setup can publish their harness in two additional commands.

**Source-of-truth:** cli/commands/card/new.ts:36-84; cli/commands/card/{publish,remote,push,catalog-publish}.ts; cli/commands/{add,library/catalog,search/card}/…

**Open questions:** none.

---

### 6.9 Appendix decision: link or move the case study?

The current Notion page ends with a callout:

> 🛠️ v1 TODO: move the full Part 1–6 case study from [Harness Card Marketplace Research v0.1] here as supporting appendix, or keep it linked. Decide before sharing.

**Proposed replacement:**

> ---
> # Appendix
>
> ## §A — Research provenance
>
> This strategy is the committed downstream of two research documents:
>
> - **Harness Card Marketplace Research v0.1** — the Claude Code plugin/marketplace case study and the original Tier 1/2/3 recommendation. Preserved verbatim at its existing Notion location; this page does not duplicate its content.
> - **drwn vs Claude Code Plugin Marketplace — Comparative Analysis** — the repo-side mapping of the research onto `drwn`'s actual roadmap. Lives at `.ai/analyses/51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md` in the codebase.
>
> The strategy on this page is the third document in that chain. When the case study or comparative analysis evolves, this page should be updated rather than merged into either source.
>
> ## §B — Follow-ups
>
> - **GitHub topic and validation Action.** Adopt `drwn-card` as the official GitHub topic, use it on every example card the project ships, and publish a reusable `validate-card-action` (see §1.2 / §1.1).
> - **Default catalog content.** Seed the default community catalog with the first tested public card so the index a new user encounters is not empty.

**Source-of-truth:** the case study Notion page is the source for §A; the follow-up items in §B trace to analyses/51 R4/R8 and the empty-default-catalog risk noted in §8 below.

**Open questions:** none.

---

## 7. Stakeholder Open Questions

Surfaced here so reviewers can act on them outside the Notion prose:

1. **Card Factory boundary (§2.1).** Lock Option A for catalog mutation; confirm Option C for authoring; or override.
2. **Filtering metadata (§2.2).** Confirm the minimum set (`stability`, `language` tags, `publishedAt`) or add to it.
3. **Default catalog identity (§2.3).** Confirm the current URL or commit to a renaming/migration target.
4. **GitHub topic name (§1.1).** `drwn-card` or `darwinian-harness-card`. Recommended `drwn-card`.
5. **Validation Action repo (§1.2).** Co-located in main repo or a single-purpose action repo.

**Out of scope for this task:** updating the PRD (still phrased "npm v1 / git v2") to match shipped reality. That's a separate edit on a different page; this strategy doc is the authoritative catalog stance and need not duplicate the PRD's reconciliation.

---

## 8. Risks

- **PRD vs Strategy divergence (internal note).** PRD v0.7 still reads "npm v1." This strategy is the authoritative catalog stance; the PRD will need a separate edit at some future point. Flagged here for repo-side awareness, not surfaced in the Notion body.
- **Default catalog as empty index.** A new user who runs `drwn init` and immediately runs `drwn search card` against an empty default catalog gets a poor first impression. Seed the catalog with one tested public card before promoting the default.
- **Case-study drift.** The v0.1 research uses `bgng` vocabulary throughout. Future readers may pattern-match on names that no longer exist. Mitigate by adding a one-line preamble to the research page noting the rebrand, or by linking the comparative analysis (which uses `drwn`) prominently.
- **Card Factory premature lock-in.** Picking Option A/B/C before Web App design is far enough along risks committing the CLI to a contract that breaks under real Web App constraints. Mitigation: keep the recommendation explicit but reversible; do not let the strategy doc be the place the boundary is *committed*. The Web App PRD is.

---

## 9. Notes

- The file lives at `.ai/tasks/40_plan1_card-catalog-strategy-notion-drafting.md`. If a second drafting iteration is needed after review, it becomes `40_plan2_…` and this file moves to `40_archive/` per the docs-usage rule.
- The drafting playbook (§5) is the operational guide. Sections §6.1–§6.9 are the paste-ready content blocks. Sections §7–§8 stay in this plan; they do not move into Notion.
- Every shipped claim in §6 is greppable against the cited path. Run a fresh `grep` pass before publishing if the codebase has moved since this plan was written.
