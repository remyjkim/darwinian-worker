# drwn Command Roles After Git Distribution Wave 1

**Date**: 2026-06-01
**Updated**: 2026-06-02
**Author**: Claude + Remy
**Status**: Updated After Wave 1 Implementation
**References**: [analyses/52_drwn-target-architecture-post-wave-1.md, analyses/51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md, analyses/46_drwn-card-team-sharing-flow.md, analyses/44_drwn-git-storage-backend-options.md, analyses/43_drwn-cli-target-architecture.md, analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, tasks/33_drwn-git-distribution-wave-1-implementation-plan.md, tasks/33_completion_drwn-git-distribution-wave-1.md, cli/commands/write.ts, cli/commands/card/apply.ts, cli/commands/install.ts]

---

## Executive Summary

This document originally framed command roles across a three-phase Git rollout. That phased model no longer matches the implementation exactly: Wave 1 collapsed the rollout and went directly to per-card bare Git repositories plus content-addressed extraction. The high-level command-role separation still holds, but several concrete names and surfaces needed correction.

The current implemented model is:

1. **`write`** is the materialization verb. It reads effective drwn state and writes downstream tool state (`~/.claude/`, `~/.codex/`, `~/.cursor/`, and project-local equivalents). It is local-only and does not fetch cards.
2. **`apply` / `card apply`** are project-composition verbs. They replace the current project's card set and write `card.lock`. They can chain materialization only when `--write` is passed.
3. **`add` / `card add` / `pin` / `remove` / `detach` / `update` / `outdated`** mutate or inspect the project's card intent and lockfile.
4. **`install`** is the bootstrap verb. It ensures every locked card is present in the local Git-backed store, then runs `write` unless `--no-apply` is passed.
5. **`library`** remains the user's reusable inventory namespace for skills, MCP definitions, defaults, and card catalogs.
6. **`card ...`** remains the artifact namespace for authoring, publishing, validating, sharing, fetching, cloning, inspecting, and diffing cards.
7. **`store ...`** remains the local store maintenance namespace.

The important correction from the older draft: **`apply` is not the daily downstream materialization command in the implemented CLI; `write` is.** The older conceptual point remains true after renaming it: downstream materialization is stable because it reads lockfile paths and effective state, while Git changes happen upstream in resolution, install, and store management.

---

## 1. What Changed Since The Draft

The old draft was directionally useful, but it assumed a command vocabulary and phased rollout that did not land exactly.

Corrections:

- The rollout is no longer Phase 1 archive cache -> Phase 2 bare repos -> Phase 3 unified extraction. Wave 1 went directly to bare repos and `extracted/<tree-sha>`.
- `write` is the implemented materialization verb.
- `apply` and `card apply` are implemented as project card-set replacement commands.
- `drwn install` runs `write` by default after ensuring locked cards are present.
- `library add card`, `library refresh catalog`, `card source ...`, `use`, `clear`, `cards`, `preset`, `profile`, `skills enable/disable`, and `mcp apply` are not implemented command surfaces in the current CLI.
- Card catalogs shipped as `library catalog list/add/remove` plus `search card`; no refresh command exists yet.
- Lockfiles are forward-only `lockfileVersion: 2`; there is no v1 reader shim.
- Git-origin and store-origin lock entries include `git.commit`; project config does not carry URLs.

The core architectural claim still holds after these corrections:

> The Git rollout reshapes Layer 2 storage and card resolution. It does not change the downstream materialization engine's role.

---

## 2. Current Layered Model

```text
Layer 1: Built-in       packaged or checkout source
                              |
                              v
Layer 2: Store/Library  ~/.agents/drwn/
                          skills/                  package-backed skill bundles
                          mcp-servers/             reusable MCP definitions
                          cards/                   per-card bare repos
                          sources/                 editable card sources
                          extracted/               content-addressed card trees
                          catalogs/                Git-backed catalog clones
                          catalogs.json            catalog index
                              |
                              v
Layer 3: Project        <project>/.agents/drwn/
                          config.json              cards[] + project overlay
                          card.lock                resolved v2 lockfile
                              |
                              v
Layer 4: Effective      merged machine/project/card/extension state
                              |
                              v
Layer 5: Downstream     ~/.claude/, ~/.codex/, ~/.cursor/,
                        <project>/.claude/, <project>/.codex/, ...
```

Command homes:

- `library`, `search`, `card`, and `store` mostly operate on Layer 2.
- `init`, `add`, `apply`, `card add`, `card apply`, `pin`, `remove`, `detach`, `update`, and `outdated` operate on Layer 3.
- `write` materializes Layer 4 into Layer 5.
- `install` crosses Layer 3 -> Layer 2 -> Layer 5: it reads the project lockfile, ensures the local store has the locked content, then runs `write`.
- `status` and `doctor` inspect across layers.

---

## 3. Command Role Table

| Command surface | Current role | Network? | Mutates project? | Mutates store? | Writes downstream? |
|---|---|---:|---:|---:|---:|
| `drwn write` | Materialize effective state to downstream tools | No | No | No | Yes |
| `drwn apply <refs...>` | Replace project card set and write lockfile | Maybe, through Git ref resolution | Yes | Maybe | Only with `--write` via `card apply` path |
| `drwn card apply <refs...>` | Replace project card set and write lockfile | Maybe, through Git ref resolution | Yes | Maybe | Only with `--write` |
| `drwn add <card-ref>` | Add one card to current project | Maybe, through Git ref resolution | Yes | Maybe | No |
| `drwn card add <card-ref>` | Add one card to current project | Maybe, through Git ref resolution | Yes | Maybe | Only with `--write` |
| `drwn add skill <name>` | Add a skill include to current project | Maybe, if catalog install is allowed | Yes | Maybe | No |
| `drwn add mcp <name>` | Add an MCP override to current project | No remote fetch by default | Yes | No | No |
| `drwn card pin <ref>` | Pin one project card to a specific resolved ref | Maybe | Yes | Maybe | No |
| `drwn card remove <name>` | Remove one card from project config | No | Yes | No | No |
| `drwn card detach` | Remove all project card refs | No | Yes | No | No |
| `drwn card update` / `drwn update` | Re-resolve project cards and lockfile | Maybe | Yes | Maybe | No |
| `drwn card outdated` | Compare locked cards to newer local versions | No by default | No | No | No |
| `drwn card outdated --fetch` | Fetch remotes before comparing versions | Yes | No | Yes | No |
| `drwn install` | Ensure locked cards exist locally, then write | Maybe | Maybe, if lock paths refresh | Maybe | Yes |
| `drwn install --no-apply` | Ensure locked cards exist locally only | Maybe | Maybe, if lock paths refresh | Maybe | No |
| `drwn install --frozen` | Verify lockfile/store are already sufficient | Maybe only if fetch is required and allowed by current implementation path | No lockfile changes allowed | No missing clones/fetches allowed | Yes if satisfied |
| `drwn library ...` | Manage reusable inventory and defaults | Depends on subcommand | No | Yes for add/catalog operations | No |
| `drwn search card` | Search registered card catalogs | No implicit fetch | No | No | No |
| `drwn card publish` | Commit/tag a card source into the local bare repo store | No | No | Yes | No |
| `drwn card remote/push/fetch/clone` | Team-sharing Git operations for card repos | Yes except local file remotes | No | Yes | No |
| `drwn store verify/gc/export/migrate-to-git` | Store health, compaction, snapshot, and migration | No | No | Yes except verify/export | No |

The important operational boundary: **`write` should remain predictable local filesystem work.** Commands that may clone/fetch/push are explicit Git/bootstrap commands (`add` for Git refs, `install`, `card fetch`, `card push`, `card clone`, `card outdated --fetch`, catalog add).

---

## 4. `write` Is The Materialization Verb

`drwn write` is implemented in `cli/commands/write.ts` over `syncRepository()`.

It:

- reads machine defaults, project overlays, card lock entries, and extension-derived state
- materializes enabled downstream targets
- supports `--dry-run`, `--json`, `--target`, `--mcp-only`, `--skills-only`, and `--force`
- removes drwn-owned stale downstream links through write records
- preserves and reports user-owned replacements

Git-backed card storage does not alter this role. The card resolver writes lock entries with concrete `path` values that point at extracted content. The materialization engine consumes those paths and does not need to know whether the content came from a local published card, a Git remote, or a file-origin card.

This is the stable invariant the old analysis was reaching for. The corrected wording is:

> `write` is the output step. Git distribution changes how card content reaches the lockfile path, not how downstream state is written.

---

## 5. `apply` Is Project Composition

`drwn apply` is implemented as a top-level alias for `drwn card apply`.

It:

- requires one or more card refs
- replaces the project's `cards[]` array
- resolves those refs
- writes `<project>/.agents/drwn/card.lock`
- can chain downstream materialization with `--write` on `card apply`

This means `apply` is not the same role as `write` in the current CLI. It is closer to "apply this card set to the project config" than "apply effective state to downstream tools."

This distinction matters for docs and help text:

- Use `drwn write` for daily local materialization.
- Use `drwn apply <card-ref...>` when replacing the current project's card set.
- Use `drwn card apply <card-ref...> --write` when replacing the card set and immediately materializing.
- Use `drwn install` after cloning a project that already has a lockfile.

---

## 6. `install` Is Bootstrap From Lockfile

`drwn install` exists because a project lockfile can reference card content that is not yet present on a fresh machine.

It:

- reads `<project>/.agents/drwn/card.lock`
- ensures each locked card is present in the local Git-backed store or validates file-origin entries
- clones/fetches Git-backed repos as needed
- verifies integrity
- refreshes lockfile paths when extracted content is materialized locally
- runs `write` unless `--no-apply` is passed
- refuses required clone/fetch/path mutations with `--frozen`

Conceptually:

```text
drwn install =
  read project card.lock
  ensure locked cards exist in ~/.agents/drwn
  verify integrity
  update local paths if needed
  drwn write, unless --no-apply
```

This separation remains correct:

- `write` is local materialization.
- `install` is bootstrap plus materialization.
- `add` / `apply` / `pin` are project-composition commands.

---

## 7. `library` Is Local Inventory

The `library` namespace still answers: "what reusable inventory is available on this machine?"

Implemented surfaces:

- `drwn library list`
- `drwn library show <id>`
- `drwn library add skill <npm-package-or-local-path>`
- `drwn library add mcp <json-file> --as <server-id>`
- `drwn library defaults list`
- `drwn library defaults add/remove skill`
- `drwn library defaults add/remove mcp`
- `drwn library catalog list`
- `drwn library catalog add <name> <git-url>`
- `drwn library catalog remove <name>`

Corrections from the older draft:

- There is no implemented `drwn library add card`.
- There is no implemented `drwn library refresh catalog`.
- Card discovery is handled by registered catalogs plus `drwn search card`.
- Card import is handled by `drwn card clone <git-ref>` or project composition through `drwn add <git-ref>`.

The conceptual role is still stable. The namespace manages reusable local inventory; it does not directly mutate the current project's card set.

---

## 8. Card Lifecycle With Current Commands

```text
Stage A: Authoring
  drwn card new @team/baseline --no-git
  edit ~/.agents/drwn/sources/@team/baseline/

Stage B: Publish locally
  drwn card publish @team/baseline
  -> creates commit + version tag in ~/.agents/drwn/cards/@team/baseline.git
  -> extracts tree into ~/.agents/drwn/extracted/<tree-sha>

Stage C: Share/import/discover
  drwn card remote add @team/baseline <git-url>
  drwn card push @team/baseline
  drwn card fetch @team/baseline
  drwn card clone git+<git-url>#v1.0.0
  drwn library catalog add team <catalog-url>
  drwn search card backend

Stage D: Compose project
  drwn apply @team/baseline@^1.0.0
  drwn add @team/observability@^1.0.0
  drwn card pin @team/baseline@1.0.0
  drwn card remove @team/observability
  drwn card detach
  drwn card update

Stage E: Bootstrap cloned project
  drwn install
  drwn install --no-apply
  drwn install --frozen

Stage F: Materialize downstream
  drwn write
  drwn write --dry-run
  drwn write --target=claude
  drwn write --skills-only
  drwn write --mcp-only

Stage G: Inspect/maintain
  drwn status
  drwn doctor
  drwn card show
  drwn card diff
  drwn card validate
  drwn card outdated --fetch
  drwn store verify
  drwn store gc
  drwn store export --out /tmp/drwn-store.tar
  drwn store migrate-to-git
```

---

## 9. Concrete Walkthrough

### 9.1 Author publishes and shares a card

```bash
drwn card new @team/baseline --no-git
$EDITOR ~/.agents/drwn/sources/@team/baseline/card.json
drwn card publish @team/baseline
drwn card remote add @team/baseline https://github.com/team-org/baseline-card.git
drwn card push @team/baseline
```

The local publish writes to `~/.agents/drwn/cards/@team/baseline.git` and tags the version. The push shares `main` and version tags to the configured Git remote.

### 9.2 Project adopts the card

```bash
cd /path/to/project
drwn init
drwn add git+https://github.com/team-org/baseline-card.git#v1.0.0
drwn write --dry-run
drwn write
```

The project config records the requested card ref. The lockfile pins the resolved version, path, integrity, origin, and Git commit metadata.

### 9.3 Teammate joins fresh

```bash
git clone https://github.com/team-org/project.git
cd project
drwn install
```

`install` reads `card.lock`, ensures the referenced card repo/content exists under `~/.agents/drwn`, verifies integrity, and runs `write`.

### 9.4 Teammate works daily

```bash
drwn write --dry-run
drwn write
```

No network is implied by daily materialization. Fetching updates is explicit:

```bash
drwn card outdated --fetch
drwn card update
drwn write
```

---

## 10. Anti-Patterns Avoided

### 10.1 `write` does not silently fetch

`drwn write` should remain local-only. If content needed by a lockfile is missing, the fix is to run `drwn install`, not to hide network work inside materialization.

### 10.2 `library` does not mutate project card intent

`library` commands manage machine inventory and defaults. Project card intent lives in `<project>/.agents/drwn/config.json` and is mutated by `add`, `apply`, `pin`, `remove`, `detach`, and `update`.

### 10.3 Project configs do not carry URLs

URLs belong in lockfile Git metadata and bare repo remotes. Project config stays focused on project intent.

### 10.4 `install --frozen` protects CI

`drwn install --frozen` refuses lockfile/path changes or required clone/fetch work. CI should use it when the lockfile and local store are expected to be sufficient.

---

## 11. Findings

1. **The original role-stability claim still holds after renaming `apply` to `write` for materialization.** The Git rollout changes card resolution/storage, not downstream materialization.
2. **The old document's command vocabulary was materially stale.** It referenced unimplemented commands and treated `apply` as the materializer.
3. **`install` remains the only genuinely new bootstrap role.** It exists because lockfiles can reference Git-backed content absent from a fresh machine.
4. **`library` remains stable conceptually but its current card surface is catalogs, not `library add card`.**
5. **Wave 1 collapsed the old phases.** Any doc still teaching archive cache or future bare-repo migration phases should be updated or marked historical.
6. **The lockfile path remains the resolution/materialization boundary.** `write` reads resolved paths; it does not dispatch on Git origins.

---

## 12. Recommendations

- **R1**: Keep this document as the canonical command-role map after Wave 1.
- **R2**: In operator docs, consistently say `write` for downstream materialization and `apply` for replacing a project's card set.
- **R3**: Add help text cross-links:
  - `drwn install --help`: "Use after cloning a project with card.lock; runs write unless --no-apply."
  - `drwn write --help`: "Local-only materialization; run install first on a fresh clone."
  - `drwn apply --help`: "Replaces project cards; use --write to materialize immediately."
- **R4**: Do not document unimplemented surfaces (`use`, `clear`, `cards`, `preset`, `profile`, `library add card`, `library refresh catalog`, `card source`) as active CLI behavior.
- **R5**: Treat old phase docs 47/48/49 and tasks 29/30/31 as historical unless explicitly updated to the collapsed Wave 1 model.

---

## 13. Open Questions

1. **Should `drwn apply` be renamed or further clarified?**
   It is easy to confuse with downstream application/materialization. Current help should make the card-set replacement meaning explicit.

2. **Should `drwn install --frozen` avoid all network attempts categorically?**
   The desired CI semantics may be stricter than the current implementation path. If "frozen means no network" is required, add a test and enforce it.

3. **Should `library catalog` get a refresh command?**
   The original plan mentioned refresh. Current implementation has list/add/remove/search. Refresh can be added later if catalog update workflows need it.

4. **Should `library add card` exist?**
   Current import paths are `card clone` and project `add <git-ref>`. A separate inventory-only card add could be useful, but it should not be documented until implemented.

---

## 14. Appendix: Current Command Map

| Command | Layer | Lifecycle stage | Implemented |
|---|---:|---|---:|
| `drwn init` | 3 | Project setup | Yes |
| `drwn write` | 5 | Materialization | Yes |
| `drwn apply` | 3 | Project card-set replacement | Yes |
| `drwn add <card-ref>` | 3 | Project card add | Yes |
| `drwn add skill` | 3 | Project skill include | Yes |
| `drwn add mcp` | 3 | Project MCP override | Yes |
| `drwn install` | cross | Bootstrap from lockfile | Yes |
| `drwn update` | 3 | Project card re-resolution | Yes |
| `drwn card apply` | 3 | Project card-set replacement | Yes |
| `drwn card add` | 3 | Project card add | Yes |
| `drwn card pin` | 3 | Project card pin | Yes |
| `drwn card remove` | 3 | Project card removal | Yes |
| `drwn card detach` | 3 | Remove all project cards | Yes |
| `drwn card update` | 3 | Project card re-resolution | Yes |
| `drwn card outdated` | 3 | Project update inspection | Yes |
| `drwn card list` | 2 | Store card inspection | Yes |
| `drwn card status` | cross | Project card status | Yes |
| `drwn card show` | 2 | Card inspection | Yes |
| `drwn card diff` | 2 | Card comparison | Yes |
| `drwn card validate` | 2 | Card validation | Yes |
| `drwn card new` | 2 | Card authoring | Yes |
| `drwn card publish` | 2 | Card publishing | Yes |
| `drwn card deprecate` | 2 | Version deprecation | Yes |
| `drwn card remote add/list/set/remove` | 2 | Team sharing | Yes |
| `drwn card push` | 2 | Team sharing | Yes |
| `drwn card fetch` | 2 | Team sharing/import | Yes |
| `drwn card clone` | 2 | Import | Yes |
| `drwn library list/show` | 2 | Inventory inspection | Yes |
| `drwn library add skill` | 2 | Skill inventory | Yes |
| `drwn library add mcp` | 2 | MCP inventory | Yes |
| `drwn library defaults ...` | 4 | Machine defaults | Yes |
| `drwn library catalog list/add/remove` | 2 | Card catalog inventory | Yes |
| `drwn search skill/mcp/card` | 2 | Discovery | Yes |
| `drwn skills list/curate/uncurate` | 4 | Skill curation | Yes |
| `drwn skills packages add/list/show` | 2 | Package-backed skill bundles | Yes |
| `drwn mcp list/write` | 4/5 | MCP inspection/materialization | Yes |
| `drwn extensions add/list/show/status/doctor/setup` | 2/3 | Extension operations | Yes |
| `drwn store status/migrate/migrate-to-git/verify/gc/export` | 2 | Store maintenance | Yes |
| `drwn status` | cross | Inspection | Yes |
| `drwn doctor` | cross | Diagnostics | Yes |
| `drwn scan` | cross | Placeholder scan | Yes |
| `drwn export sessions` | external/session | Session archive | Yes |

### Stable Invariants

1. `drwn write` produces deterministic downstream state from effective config and lockfile paths.
2. `card.lock` is forward-only v2 in Wave 1.
3. Project configs do not carry Git URLs.
4. Git authentication is delegated to Git.
5. Card versions are immutable once published into the local store.
6. Store-origin and Git-origin lock entries pin `git.commit`.
7. Git operations are centralized through `cli/core/git.ts`.
