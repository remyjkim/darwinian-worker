# drwn Card Team Sharing Flow — Git Distribution Architecture

**Date**: 2026-06-01
**Author**: Claude + Remy
**Status**: Draft
**References**: [analyses/44_drwn-git-storage-backend-options.md, analyses/43_drwn-cli-target-architecture.md, analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, analyses/41_card-source-authoring-cli-target-architecture.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/37_harness-cards-registry-pinning-target-architecture.md, analyses/32_harness-cards-vs-flox-and-conda.md, https://github.com/dallay/agents-skills]

---

## Executive Summary

This document specifies the end-to-end **team-sharing flow** for drwn cards under the Git-based distribution model (Design A + E from analysis `44_*`). It answers: when a team member wants to improve a card and share it with the team, what does that workflow look like, where does the team Git repository live, and what new CLI surface is required?

Headline answers:

- **Sharing is fully Git-mediated.** Authors `publish` (local commit + tag) and `push` (Git push to remote). Consumers `fetch` (Git fetch from remote) and `apply` (materialize from local store).
- **One Git repo per card, hosted on the team's existing Git infrastructure.** GitHub, GitLab, Gitea, Bitbucket, self-hosted — drwn doesn't impose a host. Each card has its own lifecycle, contributors, and version history.
- **Project configs stay URL-free.** A project references `@team/baseline@^1.0.0`. The `card.lock` carries the Git URL for bootstrap purposes; the project config does not. New teammates running a fresh `drwn install` (or `drwn apply`) auto-register card remotes from the lockfile.
- **Optional scope catalog** for discovery. A tiny shared repo at `<host>/<team-org>/cards-catalog/` lists all team cards with their URLs; teammates `drwn library add catalog <url>` once and gain discoverability across the scope.
- **Phase-by-phase rollout** (per analysis `44_*` §11.F):
  - **Phase 1 (E partial):** consumers can `add` cards by Git URL; authors share via plain `git push` on their card source repos. Limited author UX.
  - **Phase 2 (Design A):** authors get `drwn card publish` / `push` / `fetch`. Local bare repos exist. Full team workflow.
  - **Phase 3 (E full):** `git+url` refs flow through the local bare-repo store. Unified resolution.
- **Eight new CLI verbs** under the `drwn card` namespace and one new top-level command (`drwn install`) — all thin wrappers over `git` plumbing.
- **Authentication is Git's problem, not drwn's.** Whatever credentials work for `git clone` work for `drwn card fetch`. No new credential storage.

This doc doesn't change the cards composition model, the vocabulary, the materialization mechanisms, or the lockfile contract. It specifies the *sharing* layer on top of all three.

---

## 1. Context and Scope

### 1.1 What this document does

Specifies the team-sharing workflow under the Git-based card design from analysis `44_*`. Covers:

- Author and consumer workflows, step by step
- Hosting options for team Git repos
- New CLI surface for share/fetch operations
- Discovery patterns
- Phase-by-phase rollout
- Concrete usage scenarios
- Edge cases (auth, conflicts, hosting migration, forks)
- CI and automation hooks
- Comparison to npm, Nix flakes, agentsync

### 1.2 What this document does NOT do

- It does not relitigate the choice of Git backend (settled in `44_*`).
- It does not modify the cards composition model (settled in `29_*`).
- It does not change the materialization mechanisms (settled in `32_*` §5).
- It does not change the vocabulary (`42_*` v2 stands: `apply` materializes, `use` modifies intent, `drwn card` is the artifact namespace).
- It does not write code or implementation plans. Per-phase task plans go into `.ai/tasks/` when greenlit.

### 1.3 Inherited constraints from prior analyses

- **Cards remain the unit of reuse.** Multi-card composition per project, last-wins merge, project overlay (`29_*`).
- **Lockfile-pinned reproducibility.** Same lockfile + same store → byte-identical effective state.
- **Per-card Git repos** in the local store (Design A from `44_*`): `~/.agents/drwn/cards/@scope/name.git/`.
- **`git+url#ref` as a recognized card-ref form** (Design E from `44_*`).
- **Semver as the user-facing version handle.** Git SHAs are the integrity pin in the lockfile but never the user identifier.
- **Filesystem materialization is unchanged.** Per `32_*` §5, downstream symlinks / `_drwn` meta-block / generated-file-plus-symlink stay.

---

## 2. The Sharing Model

### 2.1 Roles and state transitions

A card moves through four states during a sharing cycle. The same person typically plays multiple roles.

```text
┌───────────────────┐  drwn card source ...    ┌───────────────────┐
│  Editable source  │ ─────────────────────────│  Editable source  │
│  (working tree)   │                           │  (edits applied)  │
└───────────────────┘                           └───────────────────┘
                                                          │
                                                          │  drwn card publish
                                                          ▼
                                                ┌───────────────────┐
                                                │ Local published   │
                                                │ (commit + tag in  │
                                                │  bare repo)       │
                                                └───────────────────┘
                                                          │
                                                          │  drwn card push
                                                          ▼
                                                ┌───────────────────┐
                                                │ Remote published  │
                                                │ (commit + tag in  │
                                                │  team Git host)   │
                                                └───────────────────┘
                                                          │
                                                          │  drwn card fetch  (consumer side)
                                                          ▼
                                                ┌───────────────────┐
                                                │ Consumer's local  │
                                                │ store (commit +   │
                                                │ tag fetched)      │
                                                └───────────────────┘
                                                          │
                                                          │  drwn pin / drwn apply
                                                          ▼
                                                ┌───────────────────┐
                                                │ Materialized in   │
                                                │ consumer project  │
                                                └───────────────────┘
```

Roles:

- **Author** — owns the editable source; transitions source → locally published → remote published. Operates `drwn card source ...` + `drwn card publish` + `drwn card push`.
- **Consumer** — reads from remote → local store → materialized. Operates `drwn card fetch` + `drwn pin` + `drwn apply`.
- **Maintainer** (often = author) — accepts contributions, manages remote, decides versioning. Uses Git host's own tooling (PR review, merge) plus drwn's publish primitives.

### 2.2 Three asymmetries to keep in mind

These shape the rest of the design:

1. **Authoring is rare, consumption is constant.** A given user publishes a card a few times a quarter, but `drwn apply` runs daily. Author-side UX deserves polish; consumer-side UX deserves transparency.
2. **Publishing is local, distribution is remote.** `drwn card publish` is *always* a local operation — it commits to the local bare repo. The push to a remote is a separate, optional step (`drwn card push`). This separation lets a user develop and version cards offline; they're never blocked by remote unavailability.
3. **Versioning is semver, integrity is SHA.** The user reasons in semver (`@team/baseline@1.3.0`). The lockfile pins both the semver tag AND the underlying Git commit SHA. If the tag is ever rewritten on the remote, the SHA-pinned lockfile catches the change as an integrity mismatch.

---

## 3. Author Workflow

### 3.1 Initial setup (one-time per card)

Author creates a new card source and configures its remote:

```bash
# Create the editable source (existing task 41 surface)
drwn card source new @team/baseline --scope @team

# Configure where this card will be published remotely
drwn card remote add @team/baseline https://github.com/team-org/baseline-card.git
```

What happens under the hood:

- `drwn card source new` creates `~/.agents/drwn/sources/@team/baseline/` with the source skeleton (`card.json`, `skills/`, `mcp-servers/`).
- `drwn card remote add` writes the remote URL into the card's bare-repo config at `~/.agents/drwn/cards/@team/baseline.git/config` (creating the bare repo if it doesn't yet exist) under a remote named `origin`.

At this point, no commits exist; nothing has been pushed.

### 3.2 Iterative authoring loop

The author edits the source, validates locally, then publishes:

```bash
# Edit source content
$EDITOR ~/.agents/drwn/sources/@team/baseline/skills/code-review/SKILL.md

# Or use the structured authoring CLI from task 41
drwn card source add-skill @team/baseline tracing-helper
drwn card source set @team/baseline --description "Baseline harness with tracing"

# Validate before publishing
drwn card source doctor @team/baseline

# Publish locally — commits source content + tags
drwn card publish @team/baseline --bump minor    # 1.2.0 → 1.3.0
```

What `drwn card publish` does:

1. Reads `~/.agents/drwn/sources/@team/baseline/`.
2. Computes the new version (per `--bump` flag or explicit `--version <v>`).
3. Updates `card.json` in the source to record the new version.
4. Runs `git write-tree` against the source content, creating a tree object in `~/.agents/drwn/cards/@team/baseline.git`.
5. Runs `git commit-tree` to create a commit object on `main`.
6. Tags the commit `v1.3.0`.
7. Updates the source's `card.json` (optional: tag the source commit if the source is itself a Git repo).

After publish:

- The bare repo has a new commit on `main`, tagged `v1.3.0`.
- Nothing has been pushed remotely yet.
- The user can verify with `drwn card show @team/baseline@1.3.0` or directly via `cd ~/.agents/drwn/cards/@team/baseline.git && git log --oneline`.

### 3.3 Push to team remote

```bash
drwn card push @team/baseline               # pushes to the configured `origin` remote
```

What `drwn card push` does:

1. Reads the configured remote URL for `@team/baseline`.
2. Runs `git -C ~/.agents/drwn/cards/@team/baseline.git push origin main v1.3.0`.
3. Reports success or failure (network, auth, non-fast-forward).

On non-fast-forward (someone else pushed first), the author resolves by:

```bash
drwn card fetch @team/baseline              # pull in their changes
drwn card publish @team/baseline --bump patch  # bump to 1.3.1
drwn card push @team/baseline
```

drwn deliberately doesn't try to be cleverer than Git here. Concurrent publish conflicts are a normal Git collaboration scenario; the resolution is normal Git collaboration.

### 3.4 Cross-machine authoring

An author working on multiple machines (laptop + desktop) treats it the same as any Git repo: the remote is the canonical source of truth.

```bash
# On laptop: publish + push
drwn card publish @team/baseline --bump minor
drwn card push @team/baseline

# On desktop: fetch the new version
drwn card fetch @team/baseline
# Now @team/baseline@1.3.0 is available in the desktop's local store
```

This works because the local bare repo on the desktop knows the remote URL from a one-time `drwn card remote add` (which can be done programmatically on first install — see §4.4).

### 3.5 What `drwn card publish` does NOT do

- It does not push automatically. `--push` flag could be added later if combined operation is desired.
- It does not run validation by default. `drwn card source doctor` is a separate command; author opt-in.
- It does not enforce CHANGELOG updates or PR-style approval. Those are conventions the team layers on top via Git host (e.g., PR review on the card source repo before merging into `main`).
- It does not modify the project's `cards[]` array. Publishing a new version of a card you also consume in some project is a separate flow: you must `drwn pin @team/baseline@1.3.0 && drwn apply` to actually adopt the new version in that project.

---

## 4. Consumer Workflow

### 4.1 One-time setup (per card or per scope)

A consumer who has never seen the card before tells drwn where to find it. Three ways:

```bash
# Per-card: add a single Git URL
drwn library add card https://github.com/team-org/baseline-card.git

# Or by Git URL ref shorthand
drwn library add card git+https://github.com/team-org/baseline-card.git

# Or via a scope catalog (covers many cards at once — see §6.2)
drwn library add catalog https://github.com/team-org/cards-catalog.git
```

What `drwn library add card` does:

1. Resolves the URL to a card name (reads `card.json` from the default branch via `git archive` or full clone).
2. Clones into `~/.agents/drwn/cards/@team/baseline.git` via `git clone --bare <url>`.
3. Registers the URL as the `origin` remote.
4. Optionally fetches all tags.

### 4.2 Daily consumer loop

```bash
# In a project that already uses @team/baseline
cd ~/dev/my-project

# Check for updates
drwn card fetch @team/baseline           # git fetch --tags
drwn outdated                             # shows: @team/baseline 1.2.0 → 1.3.0 available

# Adopt the new version
drwn pin @team/baseline@1.3.0
drwn apply
```

What `drwn card fetch` does:

1. Reads the configured remote URL.
2. Runs `git -C ~/.agents/drwn/cards/@team/baseline.git fetch origin --tags`.
3. Updates the local bare repo with new commits and tags.

After fetch, the local bare repo has all remote versions; `drwn outdated` can compare against the project's pinned version.

### 4.3 What's in the project config (URL-free)

A project's `<project>/.agents/drwn/config.json`:

```json
{
  "version": 1,
  "cards": ["@team/baseline@^1.0.0", "@team/observability@^2.0.0"]
}
```

**No URLs in project config.** The cards are referenced by their semver names. URLs live in:

- The local store's bare-repo `config` (`origin` remote URL)
- The lockfile (for bootstrap on a fresh machine)

This is a deliberate constraint: project configs are portable across machines without rewriting URLs. URL knowledge lives in the local store metadata + the lockfile.

### 4.4 Fresh-machine bootstrap

A teammate clones a project for the first time:

```bash
git clone https://github.com/team-org/my-project.git
cd my-project

# drwn install reads card.lock, ensures all cards are in local store, then materializes
drwn install
```

What `drwn install` does:

1. Reads `<project>/.agents/drwn/card.lock`.
2. For each locked card:
   - Check if it's in `~/.agents/drwn/cards/@scope/name.git/`.
   - If not, read the `git.url` from the lockfile and `git clone --bare` it.
   - `git fetch --tags` to ensure the pinned commit is available.
   - Verify the pinned commit exists locally.
3. Extract the pinned commit's tree to `~/.agents/drwn/extracted/<tree-sha>/` (content-addressed).
4. Run materialization (`drwn apply` internally).

The teammate does **no manual setup beyond `git clone` of the project**. drwn install bootstraps everything else.

For `origin: npm` cards, `drwn install` falls back to npm (same as today's behavior).

### 4.5 What `drwn install` looks like in the CLI surface

This is a new top-level verb. Per the vocabulary cleanup (`42_*` v2), top-level verbs are reserved for project composition + materialization. `drwn install` fits because it's the "make this project ready" verb — analogous to `npm install` or `pnpm install`.

```text
drwn install [--frozen]                # fetch missing cards + apply
drwn install --no-apply                # fetch only, don't materialize
drwn install --frozen                  # fail if lockfile would change (CI mode)
```

Distinction from `drwn apply`:

- `drwn apply` assumes all cards are in the local store; materializes only.
- `drwn install` ensures cards are in the local store first (fetching as needed), then applies.
- For repeat use on a project where everything is already in the store, `drwn apply` and `drwn install` produce identical results — but `drwn install` adds a (cheap) reconciliation step.

### 4.6 Mixed-origin lockfile

A project may have cards from multiple origins:

```json
{
  "lockfileVersion": 2,
  "cards": [
    {
      "name": "@team/baseline",
      "version": "1.3.0",
      "origin": "git",
      "integrity": "sha256-abc...",
      "git": {
        "url": "https://github.com/team-org/baseline-card.git",
        "ref": "v1.3.0",
        "commit": "deadbeef..."
      }
    },
    {
      "name": "@upstream/observability",
      "version": "2.0.3",
      "origin": "npm",
      "integrity": "sha256-xyz...",
      "npm": {
        "tarball": "https://registry.npmjs.org/@upstream/observability/-/observability-2.0.3.tgz"
      }
    },
    {
      "name": "@me/local-helpers",
      "version": "0.1.0",
      "origin": "file",
      "integrity": "sha256-pqr...",
      "file": {
        "path": "../local-helpers-source"
      }
    }
  ]
}
```

`drwn install` handles each origin appropriately. The resolver dispatches on `origin`:

- `git` → `git fetch` + extract
- `npm` → npm download + extract (existing path)
- `file` → resolve relative path (existing path)

The cards model doesn't care about the origin during materialization — once content is in the extraction cache, all origins look the same.

---

## 5. Where the Team Git Repo Lives

### 5.1 Recommended: one Git repo per card on the team's existing host

The default pattern is **one Git repo per card, hosted on whatever Git infrastructure the team already uses.** Mirrors how npm packages, Rust crates, Go modules, and any other dependency-per-repo ecosystem operates.

```text
github.com/team-org/baseline-card.git          → @team/baseline
github.com/team-org/observability-card.git     → @team/observability
github.com/team-org/security-card.git          → @team/security
```

Why this is the right default:

- **Independent lifecycles.** Each card has its own versions, contributors, issues, PRs.
- **Granular access control.** A team can grant read-only access to one card without exposing others.
- **Familiar Git host workflows.** Fork, PR, code review, CI all work normally.
- **No special drwn-side structure.** The URL is a string; drwn doesn't impose conventions on the host.
- **Easy to migrate hosts.** Moving one card from GitHub to GitLab is a one-card concern.

Naming convention (suggested, not enforced by drwn): `<card-name>-card` or `<card-name>.card` to disambiguate from other repos in the same namespace. Teams can pick whatever they prefer.

### 5.2 Alternative: scope catalog repo for discovery

A separate, tiny repo at `github.com/team-org/cards-catalog/` lists the per-card repos. This is **complementary**, not a replacement — the actual cards still live in their own repos. The catalog provides discovery.

```
github.com/team-org/cards-catalog/
└── catalog.json
```

```json
{
  "catalogVersion": 1,
  "scope": "@team",
  "description": "Team Acme's reusable harness cards",
  "cards": [
    {
      "name": "baseline",
      "url": "https://github.com/team-org/baseline-card.git",
      "description": "Default harness for all team projects"
    },
    {
      "name": "observability",
      "url": "https://github.com/team-org/observability-card.git",
      "description": "Tracing, metrics, logging harness extensions"
    },
    {
      "name": "security",
      "url": "https://github.com/team-org/security-card.git",
      "description": "Security audit and compliance skills"
    }
  ],
  "maintainers": ["alice@example.com", "bob@example.com"]
}
```

Consumer setup:

```bash
drwn library add catalog https://github.com/team-org/cards-catalog.git
```

After this, `drwn search card --scope @team` returns all cards listed in the catalog. New teammates inherit the team's full card roster via one command.

The catalog is itself a Git repo — adding a new card means a PR against `catalog.json`. The team controls who can merge to `main` of the catalog, controlling who can list cards under the scope.

### 5.3 Other hosting options

| Option | URL form | When to use | Trade-offs |
|---|---|---|---|
| Self-hosted Git (GitLab, Gitea, Forgejo) | `https://git.team.com/team-org/baseline-card.git` | Cards contain proprietary content; on-prem requirement | Same as public Git host; teams need to manage server uptime |
| SSH protocol | `git@github.com:team-org/baseline-card.git` | Teams using SSH-key auth | Identical to HTTPS at drwn layer; auth is Git's domain |
| File system over network mount | `git+file:///mnt/team-share/baseline-card.git` | Air-gapped teams; tiny teams with NFS | Brittle to mount-path differences across machines |
| Local bare repo (no remote) | `git+file:///home/me/cards/baseline-card.git` | Single-developer use; testing | Works; not actually "sharing" |
| Private npm registry | n/a (uses `origin: npm`) | Teams already on Verdaccio / GitHub Packages | Bypasses Git distribution; loses history-inspection benefits |
| Single-catalog monorepo (like agentsync's pattern) | `git+url#path=skills/<name>&ref=v1.3.0` | Tightly-coupled set of cards with one maintainer | Versioning is awkward (need card-name-prefixed tags); drwn would need a sub-path resolver. Not recommended unless there's a clear reason. |

### 5.4 Decision matrix

| Team profile | Recommended hosting |
|---|---|
| Open-source team, public cards | GitHub per-card repos; optional public catalog |
| Private team, GitHub Enterprise | Per-card repos in private org; optional catalog |
| Air-gapped enterprise | Self-hosted Git (GitLab CE / Gitea); catalog optional |
| Small team (2–3 people) on shared infrastructure | Per-card repos; skip catalog (just tell each other URLs) |
| Single developer, no team yet | Local bare repos with `file://` URLs; switch to a host when sharing becomes needed |
| Team with strong npm investment | npm distribution (`origin: npm`); Git is optional |

The hosting choice is reversible. drwn doesn't lock you in — every card is just a URL, and the URL is just metadata in the lockfile and the local bare repo's `config`.

---

## 6. New CLI Surface for Sharing

All sharing commands live under the `drwn card` namespace (per `42_*` v2: card-as-artifact namespace) or as `drwn library` commands for catalog-level operations. One new top-level command: `drwn install`.

### 6.1 The `drwn card` sharing verbs

```text
drwn card remote add <name> <url> [--push <url>]    # configure a remote for a card
drwn card remote remove <name> [--remote <r>]       # remove a remote
drwn card remote list <name>                        # show configured remotes
drwn card remote set <name> <url>                   # change the URL of an existing remote

drwn card push <name> [--remote <r>] [--tags-only]  # git push (uses default remote)
drwn card fetch <name> [--remote <r>]               # git fetch --tags

drwn card clone <url> [--as <name>]                 # clone a remote card into local store
                                                     # equivalent to library add card <url>
```

Semantics:

- **`drwn card remote add <name> <url>`** — Configures a remote (named `origin` by default, or via `--name <remote-name>` for multi-remote setups). Stored in the bare repo's `config` file under `[remote "origin"]`. Optionally specifies a separate push URL for `pushInsteadOf` tricks.

- **`drwn card push <name>`** — Equivalent to `git -C <bare-repo> push <remote> main --tags` (or with `--tags-only` just push tags). Reports clear errors on non-fast-forward, auth failure, network failure. Author-side only; rare.

- **`drwn card fetch <name>`** — Equivalent to `git -C <bare-repo> fetch <remote> --tags`. Brings new versions into the local bare repo without modifying any project state. Run before `drwn outdated` to see what's available remotely.

- **`drwn card clone <url>`** — Bootstraps a fresh local bare repo from a remote. Equivalent to `git clone --bare <url>` plus `drwn`-side index update. Can be expressed as `drwn library add card <url>` — both are entry points to the same operation, surfaced under both namespaces because users may think of it either way.

### 6.2 Library catalog verbs

```text
drwn library add catalog <url>             # add a scope catalog
drwn library remove catalog <scope-or-url>
drwn library list catalog
drwn library refresh catalog [<scope>]     # re-fetch catalog.json from the remote
```

- **`drwn library add catalog <url>`** — Clones the catalog repo (shallow, default branch only), parses `catalog.json`, registers each card's name → URL mapping in `~/.agents/drwn/catalogs.json`.
- **`drwn library refresh catalog`** — Re-fetches catalogs and updates the local index. Drift detection: if a card was removed from the catalog, `drwn library refresh` reports it but doesn't unilaterally remove the local card.

### 6.3 New top-level: `drwn install`

```text
drwn install [--frozen] [--no-apply]
```

- Read `<project>/.agents/drwn/card.lock`.
- Ensure every card listed is present in the local store (fetch/clone if missing).
- Verify integrity of each card's pinned commit.
- Run `drwn apply` (unless `--no-apply`).
- `--frozen`: refuse to run if any card resolution would differ from what's already in the lockfile. CI-safe.

### 6.4 Existing verbs that gain sharing semantics

Several already-planned verbs from `40_*` and `42_*` gain Git-aware behavior:

| Verb | New behavior |
|---|---|
| `drwn card publish <name>` | Now: commits source to local bare repo + tags. (Previously: published to the store directory.) |
| `drwn card show <ref>` | Now: can show Git log + commit message + author for a tag. |
| `drwn card diff <a> <b>` | Now: shows actual Git diff between two versions, not just a manifest-level diff. |
| `drwn outdated` | Now: requires recent `drwn card fetch` to see remote-side new versions. |
| `drwn update` | Now: re-resolves lockfile to highest matching versions, requires fetched tags to be up to date. |

### 6.5 What's not added

These tempting commands are deliberately deferred:

- **`drwn card fork`** — Forking is `drwn card clone <upstream-url>` + `drwn card remote set <new-name> <fork-url>`. Two existing commands compose. Adding `fork` as a single command is convenience-only.
- **`drwn card pull-request`** — Submitting a PR is a Git-host concern (`gh pr create`, `glab mr create`). drwn doesn't need to wrap it.
- **`drwn card sync`** — Implicitly handled by `drwn card fetch` + `drwn outdated` + `drwn update`. A single "sync everything" command could be added later if it earns its keep.
- **`drwn card branch`** — Power users `cd` into the bare repo and use Git directly. drwn shouldn't try to be Git.

---

## 7. Discovery Patterns

Three patterns in increasing infrastructure cost. Most teams should start at D1 and add D2 when they outgrow it.

### 7.1 D1 — Just tell them (zero infrastructure)

The team's onboarding doc or wiki says:

> Add our baseline harness:
> ```bash
> drwn library add card https://github.com/team-org/baseline-card.git
> ```

This is the right answer for teams with up to ~3–5 cards. The "registry" is the team wiki. Zero new infrastructure, fully serviceable.

### 7.2 D2 — Scope catalog

When the team has more than a handful of cards, or new cards are added often, the catalog repo pattern earns its weight (§5.2).

```bash
# Once per teammate
drwn library add catalog https://github.com/team-org/cards-catalog.git

# Then they can browse / search
drwn search card --scope @team
drwn library list catalog
```

The catalog `catalog.json` is a single JSON file with a versioned schema (`catalogVersion: 1`). New cards added via PR to the catalog repo; team controls who can merge.

### 7.3 D3 — Full registry service (deferred)

A hosted service indexing cards across multiple teams, with search, ratings, audit trails, signed publishing. **Don't build this in v1.** It's premature; agentsync's catalog model and npm's registry both prove that a single-tier discovery layer (catalog file or registry) is sufficient for years before service-level infrastructure becomes worth it.

If this is ever built, it's external to drwn — drwn just adds a new resolver for `registry:` URLs.

### 7.4 Multi-team discovery (multi-catalog)

A developer working across multiple teams adds each scope catalog:

```bash
drwn library add catalog https://github.com/team-a/cards-catalog.git
drwn library add catalog https://github.com/team-b/cards-catalog.git
drwn library add catalog https://github.com/foundation/public-catalog.git
```

`drwn search card` returns results from all catalogs. Each card's `name` field carries its scope, so there are no namespace collisions as long as scopes are well-chosen.

---

## 8. Phase-by-Phase Capability Map

What works at each phase from analysis `44_*` §11.F.

| Capability | Phase 1 (E partial) | Phase 2 (Design A) | Phase 3 (E full) |
|---|---|---|---|
| Reference a card by Git URL in project config | ✅ | ✅ | ✅ |
| Lockfile pins commit SHA | ✅ | ✅ | ✅ |
| Consumer: `drwn install` bootstraps from lockfile | ✅ (downloads archives) | ✅ (clones bare repos) | ✅ (clones bare repos) |
| Consumer: `drwn card fetch` for updates | ❌ | ✅ | ✅ |
| Consumer: `drwn outdated` sees remote versions | ❌ (no local Git store) | ✅ (after fetch) | ✅ |
| Author: `drwn card publish` | ❌ (use plain Git) | ✅ | ✅ |
| Author: `drwn card push` | ❌ (use plain Git) | ✅ | ✅ |
| Author: `drwn card remote add/list` | ❌ | ✅ | ✅ |
| Inspect local card history (`git log`) | ❌ (no local Git store) | ✅ | ✅ |
| `drwn card diff <a> <b>` shows real diff | partial (must extract both) | ✅ | ✅ |
| Scope catalog (D2) | ✅ | ✅ | ✅ |
| Offline operation after first install | ❌ | ✅ | ✅ |
| Disk efficiency (Git pack dedup) | ❌ | ✅ | ✅ |
| Tag-rewrite attack detection | ✅ (via SHA pin) | ✅ | ✅ |

### Phase 1 author UX is plain Git

In Phase 1, drwn doesn't help authors publish or push. Authors maintain their card source as a regular Git repo (anywhere — `~/dev/my-baseline-card/`, GitHub, etc.), and use plain `git` to publish:

```bash
cd ~/dev/my-baseline-card
$EDITOR skills/code-review/SKILL.md
git add . && git commit -m "Improve code-review skill"
git tag v1.3.0
git push origin main v1.3.0
```

Consumers then reference `git+https://github.com/me/my-baseline-card.git#v1.3.0`. Phase 1 is the **consumer-side enablement** of Git distribution; the author side is "you already know how to use Git, just use Git." This is a deliberate scope reduction; Phase 2 is where the author UX gets nice.

### Phase 2 unlocks the author workflow

Phase 2 introduces the local bare-repo store and the publish/push/fetch primitives. From this phase on, authors can stay inside the `drwn` surface for their entire workflow.

### Phase 3 unifies, no new sharing capabilities

Phase 3 routes Git URL refs through the local bare-repo store (clone-not-download). The sharing flow is unchanged from Phase 2; what improves is consistency: Git-URL cards and locally-published cards are now treated identically by all drwn commands.

---

## 9. Concrete Workflows

Eight scenarios end-to-end.

### 9.1 Scenario A — Author a brand-new card

```bash
# Author creates the source
drwn card source new @team/baseline --scope @team

# Edit content
$EDITOR ~/.agents/drwn/sources/@team/baseline/skills/code-review/SKILL.md
drwn card source add-skill @team/baseline tracing-helper
drwn card source set @team/baseline --description "Team baseline harness"

# Validate
drwn card source doctor @team/baseline

# Configure remote (create the GitHub repo first via gh or web UI)
gh repo create team-org/baseline-card --private --description "Team Acme baseline harness card"
drwn card remote add @team/baseline https://github.com/team-org/baseline-card.git

# First publish + push
drwn card publish @team/baseline --version 1.0.0
drwn card push @team/baseline
```

Result: `@team/baseline@1.0.0` is now installable by anyone with read access to the GitHub repo.

### 9.2 Scenario B — Improve an existing team card

```bash
# Fetch latest from remote (in case teammates pushed)
drwn card fetch @team/baseline

# Bring local source up to latest if needed
drwn card source sync-from-store @team/baseline    # (potential future helper)

# Edit
$EDITOR ~/.agents/drwn/sources/@team/baseline/skills/code-review/SKILL.md

# Validate
drwn card source doctor @team/baseline

# Publish + push
drwn card publish @team/baseline --bump minor
drwn card push @team/baseline
```

### 9.3 Scenario C — Teammate joins fresh

```bash
git clone https://github.com/team-org/my-project.git
cd my-project

# drwn install reads card.lock and bootstraps
drwn install
```

The teammate runs **one command** after the project clone. drwn install:

1. Reads `card.lock`.
2. For each card, clones the URL from the lockfile into `~/.agents/drwn/cards/@scope/name.git/` if not already present.
3. Fetches the pinned tag.
4. Verifies the commit SHA matches.
5. Extracts content to `extracted/<tree-sha>/`.
6. Materializes via `drwn apply`.

If credentials are missing for any private repo, `drwn install` reports the URL that failed and exits with a clear hint: "Configure credentials for `https://github.com/team-org/...` and re-run."

### 9.4 Scenario D — Fork a public card for team customization

The team likes a public card `@upstream/observability` but wants a few changes. They fork it:

```bash
# Fork on GitHub (web UI or gh CLI)
gh repo fork upstream/observability-card --org team-org --fork-name observability-team-card

# Clone the fork into local store under team's scope
drwn card clone https://github.com/team-org/observability-team-card.git --as @team/observability

# Update the card's name in the source (so it's published as @team/observability, not @upstream/observability)
drwn card source set @team/observability --name @team/observability

# Make changes, publish, push
$EDITOR ~/.agents/drwn/sources/@team/observability/skills/...
drwn card publish @team/observability --bump major   # major bump because identity changed
drwn card push @team/observability
```

To stay in sync with upstream:

```bash
# Add upstream as an additional remote
drwn card remote add @team/observability https://github.com/upstream/observability-card.git --name upstream

# Fetch upstream's new versions
drwn card fetch @team/observability --remote upstream

# Cherry-pick or merge upstream changes into the fork (using plain Git in the bare repo's worktree)
```

drwn handles this with two primitives (`remote add` and `fetch --remote`) plus the user's existing Git knowledge for the merge.

### 9.5 Scenario E — Team migrates from GitHub to GitLab

Team decides to move all cards from GitHub to a self-hosted GitLab.

```bash
# For each card the team owns
drwn card remote set @team/baseline https://gitlab.team.com/cards/baseline-card.git
drwn card push @team/baseline    # pushes to the new remote

# Update the catalog
drwn library refresh catalog    # if the catalog repo also moved

# Teammates' next install will hit the new URL — but their lockfiles still reference the old URL
```

Two follow-up steps for consumer projects:

1. Each project's `card.lock` carries the old GitHub URL. Run `drwn install --update-urls` (a potential future helper) to rewrite URLs in lockfiles.
2. OR: leave lockfiles as-is. Consumers who push to GitHub still work as long as GitHub mirrors the new GitLab. If GitHub is fully decommissioned, consumers must update lockfiles via a re-publish.

The takeaway: hosting migration is **possible but not free**. The lockfile URL is a stickiness point. Mitigations:

- Keep the old host as a read-only mirror for some period.
- Provide a `drwn install --rewrite-urls <from>=<to>` helper.
- Document the migration story in the operator guide.

### 9.6 Scenario F — Air-gapped enterprise team

The team has no internet access. They host all cards on an internal GitLab.

```bash
# Internal GitLab URLs
drwn card remote add @team/baseline https://gitlab.internal/cards/baseline-card.git
```

drwn doesn't care that the URL is internal; Git operations work the same. The only consideration is making sure that:

- The card's `card.json` doesn't reference external resources (e.g., MCP server install commands that pull from npm) without the team also mirroring those.
- The catalog repo, if used, is also internal.

This is a deployment concern, not a drwn concern. Cards' references to external dependencies (`npx @upstash/context7-mcp`) become the team's responsibility to mirror or replace with internal equivalents.

### 9.7 Scenario G — Pre-publish review (PR workflow)

The team enforces code review on card changes before publication.

```bash
# Author works in a feature branch of the card source repo
cd ~/.agents/drwn/sources/@team/baseline
git checkout -b feature/improve-code-review
$EDITOR skills/code-review/SKILL.md
git add . && git commit -m "Improve code-review skill"
git push origin feature/improve-code-review

# Open PR via gh
gh pr create --title "Improve code-review skill" --body "..."

# After PR merges to main
drwn card publish @team/baseline --bump minor
drwn card push @team/baseline
```

Note: the **card source repo** is what's PR-reviewed. The local bare repo at `~/.agents/drwn/cards/@team/baseline.git/` is just the publication target; commits to it are typically directly to `main` after PRs land on the source side.

A future refinement could collapse this: the card source IS a Git working tree of the card's bare repo, eliminating the duplication. This is the unification described in `44_*` Design B (Design A doesn't unify; Design B does). For Phase 2, the source-and-bare-repo separation is fine; it just means the author keeps two Git working trees.

### 9.8 Scenario H — CI for cards

Cards can have their own CI on the source-repo side.

```yaml
# In the card source repo: .github/workflows/validate.yml
name: Validate Card
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g darwinian-harness
      - run: drwn card source doctor .   # validates structure
      # Plus card-specific tests
```

On a tag push, CI could auto-bump consumer projects:

```yaml
# Future: a workflow that opens PRs against consumer projects
on:
  push:
    tags: ['v*']
jobs:
  notify-consumers:
    # ...invokes a bot that opens PRs in projects that pin this card
```

This is **opt-in tooling on top of drwn**, not drwn itself.

---

## 10. Authentication & Permissions

### 10.1 Credentials are Git's domain

drwn shells out to `git`. Whatever credentials work for `git clone <url>` work for `drwn card fetch`. drwn does not:

- Store SSH keys
- Store HTTPS tokens
- Implement credential prompts
- Interact with credential managers

It does not need to. Git already has:

- SSH key agent (`ssh-agent`)
- HTTPS credential helpers (`git credential-manager`, `osxkeychain`, etc.)
- Personal access tokens (configured in the Git host's URL or via helper)
- Per-host configuration in `~/.gitconfig` and `~/.ssh/config`

When `drwn card fetch` fails due to credentials, the error message surfaces Git's failure plus a hint:

```text
$ drwn card fetch @team/baseline
Error: Could not fetch @team/baseline from https://github.com/team-org/baseline-card.git

  Underlying error: remote: Repository not found.
                    fatal: Authentication failed

Hint: Verify you have read access to the repository. If using HTTPS, set up a token:
  https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
```

### 10.2 Private repos

A private card lives in a private Git repo. drwn supports this transparently — if `git clone <url>` succeeds with the user's credentials, drwn works. The only consideration: when a teammate joins fresh and runs `drwn install`, they may hit credential failures for private repos they don't yet have access to. The error message above is the standard recovery path.

### 10.3 Read-only mirrors and write-protected branches

Common Git-host patterns work as-is:

- **Read-only mirror:** Teams can host a public mirror of a private card for broader consumption. drwn doesn't distinguish read-only from read-write; it just uses the URL.
- **Branch protection:** Maintainers can protect `main` and require PR review. `drwn card push` will fail if push to `main` is blocked; the author must go through PR workflow on the card source side instead.
- **Signed commits / signed tags:** drwn doesn't verify Git signatures in v1, but it doesn't strip them either. Signatures pass through. A future `drwn doctor --verify-signatures` could check them.

### 10.4 Read access boundaries

A team granting read access to one card grants exactly that — no broader access to other team cards. Per-card repos give natural granularity. With a monorepo catalog, access is all-or-nothing for the whole catalog (a real disadvantage of the monorepo pattern).

---

## 11. Edge Cases & Conflict Resolution

### 11.1 Simultaneous publish on `main`

Two authors `drwn card publish` simultaneously. Both create local commits with the same parent. First to push wins; the second's push fails with non-fast-forward.

Recovery:

```bash
# Author B: fetch and reconcile
drwn card fetch @team/baseline
# Now their local bare repo has both their commit (on a now-stale branch) and the remote's new commit

# Re-publish based on the new state
drwn card publish @team/baseline --bump patch   # bumps from 1.3.0 (taken) to 1.3.1
drwn card push @team/baseline
```

Author B's earlier version goes unreleased — it was always going to, since one of the two had to take v1.3.0.

A potential future helper: `drwn card publish --replay-on-fetch` that auto-detects the conflict and replays the publish operation against the latest remote `main`. Defer.

### 11.2 Tag rewriting (and why we pin SHA)

A malicious or careless maintainer rewrites `v1.3.0` to point at a different commit. Consumers who pinned `v1.3.0` see:

```bash
drwn install
# Error: integrity mismatch for @team/baseline@1.3.0
#   Expected commit: deadbeef...  (from card.lock)
#   Remote tag now points to: cafef00d...
#   Expected sha256: sha256-abc...
#   Refusing to apply changed content under the same version tag.
#
# Hint: Investigate the upstream change. If legitimate, run `drwn pin @team/baseline@<new-version>`.
```

drwn refuses to silently accept rewritten history. The user explicitly chooses to adopt the change (by re-pinning) or to ignore it (by leaving the lockfile and never running `drwn install --update`).

### 11.3 Missing or deleted remote

A team archives a card repo or moves it. Consumers who haven't updated their lockfile run `drwn install` and hit a 404:

```bash
$ drwn install
Error: Cannot reach https://github.com/team-org/baseline-card.git
  Repository may have been moved, renamed, or deleted.

Hint: If the card has moved, update the lockfile URL with:
  drwn install --rewrite-url @team/baseline=<new-url>
```

Local-store cards already cloned remain functional offline; only re-fetch fails.

A **resilience pattern**: teams can publish to multiple remotes (push to both GitHub and GitLab as mirrors). drwn supports multi-remote via `drwn card remote add ... --name <alias>`.

### 11.4 Lockfile portability across hosts

A project's `card.lock` may carry URLs from a specific host. If a teammate is behind a corporate proxy that requires using a mirror, they can:

```bash
# Override URL at install time
drwn install --rewrite-url 'https://github.com=https://github.mirror.team.internal'
```

Or set a global Git config that rewrites URLs (Git's own `url.<base>.insteadOf` mechanism):

```bash
git config --global url.https://github.mirror.team.internal/.insteadOf https://github.com/
```

Either approach works; the second is Git-host-agnostic and applies to all `git`-using tools.

### 11.5 Stale local store

A local bare repo's `main` falls behind the remote. drwn detects this on `drwn outdated`:

```bash
$ drwn outdated
@team/baseline: pinned 1.2.0, local store knows 1.3.0, possibly more on remote (run `drwn card fetch @team/baseline`)
```

Always-best-effort: `drwn outdated --fetch` runs fetch first. CI workflows should always run with `--fetch` or `drwn install --frozen` to ensure deterministic results.

### 11.6 Cards that depend on cards (bundles)

A card may declare bundle dependencies (`29_*` introduces this). When `drwn install` resolves a Git-origin card, it must recursively resolve any bundle deps too. Each bundle dep may itself be `origin: git` or `origin: npm`; the resolver handles them like the top-level cards.

Circular deps fail at resolution time with a clear error.

### 11.7 Hosting outage

A team's GitLab is down for an hour. Consumers who already have the cards in their local store keep working — `drwn apply` reads from the local extraction cache, not from the remote. Only new card additions (`drwn install` for a card not yet locally present) are blocked.

This is a strong availability property: **once installed, cards work offline indefinitely.** The remote is only consulted on `fetch`/`install`/`outdated`.

---

## 12. CI / Automation for Cards

Cards integrate with normal CI workflows. drwn doesn't ship CI tooling, but it composes cleanly with existing patterns.

### 12.1 Validation on PR

```yaml
# In the card source repo
name: Validate Card
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: npm install -g darwinian-harness
      - run: drwn card source doctor .
      - run: drwn card source list-skills .   # verify all declared skills exist
      # Additional custom checks
```

### 12.2 Automatic version bumps + tagging

```yaml
# On main branch: auto-tag based on commit messages (conventional commits, etc.)
name: Auto-Release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: changesets/action@v1
      - run: |
          # Tag based on changeset
          git tag v$(jq -r .version card.json)
          git push --tags
```

### 12.3 Consumer-side: dependabot-style notifications

A future ecosystem could include a bot that:

- Watches Git URLs in `card.lock` files of consumer projects.
- When a new tag matches the semver range, opens a PR bumping the pin.

Not part of drwn; an external tool. drwn just needs to keep the lockfile in a stable format so external tooling can read it.

### 12.4 Catalog validation

The scope catalog repo can have its own CI:

```yaml
name: Validate Catalog
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: jq . catalog.json    # JSON validity
      - run: |
          # For each card URL, verify it's reachable and has a card.json at HEAD
          for url in $(jq -r '.cards[].url' catalog.json); do
            git ls-remote "$url" HEAD > /dev/null || { echo "Unreachable: $url"; exit 1; }
          done
```

This catches "card removed from catalog but URL is dead" before merge.

---

## 13. Migration Paths

### 13.1 From npm-only to Git distribution

A team currently publishes cards via npm. They want to switch to Git.

Phased migration:

1. **Set up Git remotes for each card.** Create per-card Git repos; mirror the latest npm content into each repo as an initial commit + tag.
2. **Publish both for one release cycle.** New versions go to both npm and Git. Consumers can use either.
3. **Update consumer projects' lockfiles.** Switch `origin: npm` to `origin: git` per card. `drwn install` re-resolves; integrity hashes verify.
4. **Eventually deprecate the npm packages.** Mark them with deprecation messages pointing to the Git URL.

drwn supports mixed-origin lockfiles throughout the migration — there's no big-bang switch required.

### 13.2 From single-developer to team

A single developer's personal cards become team-owned:

```bash
# Move the local bare repo to a team-hosted Git remote
cd ~/.agents/drwn/cards/@me/baseline.git
gh repo create team-org/baseline-card --private
git remote add origin https://github.com/team-org/baseline-card.git
git push origin main --tags

# Rename the card to use team scope
# (Edit card.json in the source to use @team/baseline; bump version; publish; push)
```

drwn doesn't have a `drwn card rename` command in v1 — it's a card.json edit + republish. Adding `drwn card rename @me/foo @team/foo` could be a future helper.

### 13.3 Hosting migration (covered in §9.5)

`drwn card remote set` + `drwn card push` to the new remote, plus consumer-side lockfile URL updates.

---

## 14. Comparison to Adjacent Tools

How drwn's team-sharing flow compares to ecosystems readers will know.

### 14.1 npm scope packages

- **Publishing:** `npm publish` → registry. drwn: `drwn card publish` + `drwn card push` → Git remote.
- **Consuming:** `npm install @team/foo` → registry resolves. drwn: `drwn install` → Git URL in lockfile.
- **Discovery:** npm has a search registry. drwn has scope catalogs (optional).
- **Forking:** npm has scoped fork-and-republish. drwn has fork-the-Git-repo plus name change.
- **Authentication:** npm has tokens. drwn defers to Git's credential layer.

drwn's flow is structurally similar but flatter (no registry tier) and Git-native.

### 14.2 Nix flakes Git inputs

- **References:** Nix uses `github:owner/repo/ref` and `git+https://...?ref=...`. drwn: same shape with `git+url#ref`.
- **Lockfile:** Nix's `flake.lock` pins commit SHAs. drwn: `card.lock` does the same.
- **Distribution:** Both Git-native, no central registry.
- **Materialization:** Nix puts content in `/nix/store/`. drwn extracts to `~/.agents/drwn/extracted/` and symlinks.

drwn's design closely mirrors Nix flakes for inputs + lockfile, while diverging at materialization (which is the 8th layer per `32_*` §6.2).

### 14.3 agentsync's catalog model

- **Catalog:** Single Git repo holds many skills. Skills resolved via deterministic GitHub archive URL.
- **Versioning:** HEAD only; no per-skill semver.
- **Lockfile:** None.

drwn borrows the catalog concept (D2) but preserves per-card semver and lockfile. The agentsync catalog is one option among many for drwn; not the default.

### 14.4 pnpm catalog

- pnpm 9+ introduced a `catalog:` protocol for centralizing dependency versions across a monorepo.
- drwn's scope catalog (D2) is conceptually similar but resolves URLs, not versions — it's a discovery layer, not a version-management layer.

### 14.5 Cargo's `git = "..."` dependencies

- Cargo supports `git = "https://..."` deps with `rev`, `tag`, `branch`. Cargo.lock pins commits.
- Structurally identical to drwn's `git+url#ref` + commit SHA in lockfile.

---

## 15. Findings

1. **The team-sharing flow is Git-native and clean.** Author and consumer workflows compose existing Git primitives (`fetch`, `push`, `clone`, `tag`) with drwn-side conveniences (`drwn card publish`, `drwn install`, scope catalogs).
2. **Project configs stay URL-free.** Cards are referenced by `@scope/name@version`. URLs live in the local-store config and the lockfile. This is essential for project portability across teams and hosts.
3. **One Git repo per card on the team's existing host is the right default.** No new infrastructure required. Standard Git host workflows (PR, fork, access control) apply.
4. **Scope catalogs are the right discovery layer.** Lightweight (one JSON file in a tiny repo), versionable (just Git), composable (multi-team via multiple catalogs). Adds value once a team has more than a few cards.
5. **The author UX gets nice at Phase 2.** Phase 1 makes Git distribution available for consumers but leaves authors using plain Git tooling. Phase 2 wraps the author workflow with `drwn card publish` + `drwn card push`.
6. **Phase 3 changes no sharing behavior.** It unifies resolution paths internally; team workflow is unchanged from Phase 2.
7. **Authentication is Git's domain, deliberately.** drwn does not reinvent credential storage. This is right.
8. **Tag-rewrite resistance is automatic** via SHA-pinned lockfiles. The same mechanism protects against accidental tag-moves and malicious tag rewrites.
9. **Hosting migration is possible but sticky.** Consumers' lockfiles carry URLs; migrating hosts requires either lockfile rewrites or Git's URL-rewriting layer.
10. **The model composes with normal CI tooling** (GitHub Actions, GitLab CI). drwn doesn't ship CI; it stays out of the way of normal Git workflows.

---

## 16. Recommendations

- **R1** — Adopt the per-card Git repo model as the default team-sharing pattern. Document in the operator guide and the docs site (`docs-docusaurus/`, task 27).
- **R2** — Implement scope catalogs (Option D2) in Phase 2. Lightweight; high payoff for teams with more than a few cards.
- **R3** — Implement `drwn install` as a top-level command at Phase 2. It's the consumer-side bootstrap that makes fresh-clone-then-go viable for teammates.
- **R4** — Defer the full registry service (D3). Catalog files cover the discovery use case for years; service infrastructure is premature.
- **R5** — Defer `drwn card fork`, `drwn card pull-request`, `drwn card rename` as composite-of-existing-primitives helpers. Add when usage data shows they earn their weight.
- **R6** — Document the migration path from npm-only to Git-distribution explicitly. Most teams approaching drwn will have npm muscle memory; making the transition obvious matters for adoption.
- **R7** — Document the "lockfile URL is sticky" hosting-migration concern. Teams need to know this before they pick a host.

---

## 17. Open Questions

1. **Should `drwn install` be a separate top-level verb, or should `drwn apply` learn to fetch missing cards automatically?**
   - Lean: separate command. `drwn apply` should be pure materialization; `drwn install` includes fetch. Mirrors `npm install` vs `npm run`. Clearer mental model than overloading `apply`.
2. **Should `drwn card publish` push automatically with `--push` flag, or always be separate?**
   - Lean: separate by default; add `--push` as opt-in convenience. Two phases (local then remote) preserves the user's ability to inspect what was published before pushing.
3. **Should the scope catalog be one repo per scope or one repo per "team"?**
   - Lean: per scope. Scopes are organizational units; one catalog per scope is natural. A team that owns multiple scopes (e.g., `@platform` and `@product`) can publish multiple catalogs.
4. **Should the catalog repo also store optional metadata like card descriptions, tags, suggested-use-cases?**
   - Lean: yes — minimally. Cards' own `card.json` carries this info; catalog can include a subset for fast list/search without cloning every card. Schema bump when needed.
5. **What's the fork story when a card's `card.json` name should change?**
   - Lean: `drwn card source set <name> --name <new>` exists (per task 41); use it after cloning. Versioning rule: major bump because the identity changed.
6. **Should `drwn card push --tag <name>` push a single tag, or always all unpushed tags?**
   - Lean: default to all unpushed tags + `main`. `--tag <name>` overrides to a single tag. Matches `git push` ergonomics.
7. **Should multiple maintainers of the same card see "draft" versions before they're tagged?**
   - This is Git workflow on the source side: feature branches, draft PRs, etc. drwn doesn't need to model drafts as first-class.
8. **How does `drwn outdated` rank versions across a fetched scope catalog?**
   - For each card in the project, query the local bare repo's tags. Compare to the project's pinned semver range. Standard semver-newest-in-range logic.
9. **When a teammate runs `drwn install --frozen` (CI mode), should it ever fetch from remotes?**
   - Lean: yes, but only the exact commits already pinned in the lockfile. No tag resolution beyond what's already locked. Same as `npm ci`'s behavior.
10. **Should drwn provide a `drwn card validate <ref>` that runs `git fsck` plus integrity checks?**
    - Lean: fold into `drwn doctor --check-cards`. Doesn't need its own command.

---

## 18. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Authors get confused by the two-step publish (local commit then remote push) | Document `drwn card publish --push` as the combined operation once both phases ship. Lead with combined workflow in tutorials. |
| Consumers forget `drwn card fetch` and miss new versions | `drwn outdated` warns when local state is older than N days. `drwn outdated --fetch` runs fetch first. |
| Lockfile URLs become stale after host migration | Provide `drwn install --rewrite-url` helper. Document Git's `insteadOf` for system-wide rewrites. Recommend mirrors before migration. |
| Concurrent publishes cause non-fast-forward errors | This is normal Git collaboration. Document the fetch-bump-republish pattern. |
| Private repos require credentials the new teammate hasn't set up | `drwn install` failure mode is clear: report the URL that failed and link to credential setup. |
| Tag rewriting breaks consumer integrity | Lockfile SHA-pins catch this immediately. Error message points the user at the upstream change to evaluate. |
| Catalog drift (catalog says a card exists at URL X, but URL is dead) | Catalog repo CI validates URLs (§12.4). drwn warns on `library refresh catalog`. |
| Air-gapped teams hit dependencies on external resources (npx packages, etc.) | This is a card-content concern, not a drwn concern. Document the "mirror your card's dependencies internally" pattern. |
| Multi-remote setups (origin + upstream + mirror) get complex | Keep the simple case simple: default remote is `origin`, used implicitly. `--remote <name>` overrides. Multi-remote is advanced; not on the happy path. |
| Cards that should be PR-reviewed but get published directly to `main` | Branch protection on the card source repo's `main`. drwn doesn't enforce review — it composes with the host's enforcement. |
| Author/source repo and bare repo divergence | A future Design B (submodule federation per `44_*`) unifies them; for Design A/E, the duplication is real but small. Document the two-repo model clearly. |

---

## 19. Appendix

### A. Catalog schema

```json
{
  "catalogVersion": 1,
  "scope": "@team",
  "description": "Team Acme's reusable harness cards",
  "homepage": "https://team-acme.example.com/cards",
  "maintainers": [
    { "name": "Alice", "email": "alice@example.com" },
    { "name": "Bob", "email": "bob@example.com" }
  ],
  "cards": [
    {
      "name": "baseline",
      "url": "https://github.com/team-org/baseline-card.git",
      "description": "Default harness for all team projects",
      "tags": ["baseline", "standard"]
    }
  ]
}
```

Future extensions (`catalogVersion: 2+`):

- `latestVersion: "1.3.0"` — denormalized version pointer for fast listing.
- `signatures: [...]` — catalog-level signed attestations.
- `archived: true` — cards no longer maintained.

### B. Lockfile additions for Git origin

```json
{
  "lockfileVersion": 2,
  "cards": [
    {
      "spec": "@team/baseline@^1.0.0",
      "name": "@team/baseline",
      "version": "1.3.0",
      "origin": "git",
      "integrity": "sha256-abc123...",
      "git": {
        "url": "https://github.com/team-org/baseline-card.git",
        "ref": "v1.3.0",
        "commit": "deadbeef1234567890abcdef..."
      }
    }
  ]
}
```

Required fields under `git`:

- `url` — the remote URL used at install time
- `commit` — the resolved commit SHA (the actual integrity anchor)

Optional fields:

- `ref` — the human-readable ref (tag name) for diagnostics

### C. `~/.agents/drwn/catalogs.json` schema

```json
{
  "catalogsVersion": 1,
  "catalogs": [
    {
      "url": "https://github.com/team-org/cards-catalog.git",
      "scope": "@team",
      "lastFetched": "2026-06-01T11:42:00Z",
      "cardCount": 5
    }
  ]
}
```

### D. Example team-cards-catalog repo layout

```
github.com/team-org/cards-catalog/
├── .github/
│   └── workflows/
│       └── validate.yml         # CI: jq + URL reachability
├── README.md                    # human-readable description of the team's cards
├── catalog.json                 # the machine-readable index
└── CONTRIBUTING.md              # how to propose adding a card
```

### E. Comparison: drwn team-sharing vs npm team workflow

| Operation | npm | drwn (Phase 2+) |
|---|---|---|
| Initialize package | `npm init` | `drwn card source new @team/baseline` |
| Edit code | normal | `drwn card source add-skill <name>` |
| Publish | `npm publish` | `drwn card publish` + `drwn card push` |
| Install a dep | `npm install @team/baseline` | one-time `drwn library add card <url>`, then `drwn add @team/baseline@^1.0.0` |
| Update a dep | `npm update @team/baseline` | `drwn card fetch @team/baseline` + `drwn update` |
| List installed | `npm ls` | `drwn cards` |
| Audit | `npm audit` | `drwn doctor` |
| Lockfile install | `npm ci` | `drwn install --frozen` |
| Fork | npm scope republish | `drwn card clone` + `drwn card source set --name` |

### F. Bootstrap script for new teammates

A reasonable team onboarding script:

```bash
#!/usr/bin/env bash
# Run once when joining the team.

set -euo pipefail

# Install drwn
npm install -g darwinian-harness

# Add team catalog
drwn library add catalog https://github.com/team-org/cards-catalog.git

# Bootstrap any project the teammate clones
echo "Setup complete. In any project: 'drwn install' will fetch the team's cards from the lockfile."
```

This is what gets pinned to the team onboarding doc.

### G. Why not require `drwn` users to know Git internals

A guiding principle: a teammate consuming team cards should not need to know Git internals. The verbs `drwn install`, `drwn card fetch`, `drwn outdated`, `drwn update` should be sufficient for the consumer's full lifecycle. Git is the *backend*; drwn is the *surface*.

For authors, the same principle applies to the basic flow (`drwn card source ... → publish → push`). Power users can `cd ~/.agents/drwn/cards/@scope/name.git` and operate Git directly, but they aren't required to.

### H. Why not implement Git operations natively (without shelling out)

drwn could use `isomorphic-git` or `nodegit` to perform Git operations natively in Bun. Pros: no `git` runtime dependency, more programmatic control. Cons: bundle size, dependency surface, behavioral divergence from `git` proper.

Decision: shell out to `git`. Every developer machine has `git` installed; it's an effectively-zero dependency. Shelling out matches drwn's existing pattern of wrapping external tools (Claude Code, Codex, Cursor are also external). Stick with the pattern.

### I. Compatibility with the planned `drwn store push/pull` from `29_*` §13

The cards v1.1 architecture (`29_*`) anticipated a v2 `drwn store push/pull` for syncing the entire local store to a remote. The team-sharing flow specified here **subsumes that v2 feature** at the per-card level. There's no separate store-level push/pull needed — `drwn card push` and `drwn card fetch` cover the use case at appropriate granularity.

A bulk operation `drwn store sync-all` could be added later if every-card-at-once is a common need. Probably is, for users who maintain many cards. Defer to demand.
