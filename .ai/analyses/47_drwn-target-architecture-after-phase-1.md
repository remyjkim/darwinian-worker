# drwn Target Architecture — After Phase 1 (Git URL Refs)

> **⚠ SUPERSEDED on 2026-06-01** by **[analysis 52](52_drwn-target-architecture-post-wave-1.md)**, which collapses Phase 1 and Phase 2 into a single "Wave 1" target. The `~/.agents/drwn/cache/` archive layer described here is never built in the collapsed plan. This doc remains as historical record of the three-phase rollout that was considered. See analysis 52 §15 for the rationale.

**Date**: 2026-06-01
**Author**: Claude + Remy
**Status**: Draft
**References**: [analyses/46_drwn-card-team-sharing-flow.md, analyses/44_drwn-git-storage-backend-options.md, analyses/43_drwn-cli-target-architecture.md, analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, analyses/29_harness-cards-target-architecture-v1_1.md, cli/core/card-store.ts, cli/core/card-lock.ts, cli/core/card-manifest.ts, cli/core/store-paths.ts, cli/commands/card/add.ts, cli/commands/card/publish.ts]

---

## 1. Executive Summary

This document specifies the **target state of `drwn` after Phase 1** of the Git-distribution rollout (analysis `44_*` §11.F). Phase 1 is the smallest viable slice: it adds Git URL refs as a recognized card-ref form, gives the lockfile a `git` block for `origin: git` entries, and adds a basic `drwn install` that can bootstrap a fresh-clone project from a lockfile containing Git-origin cards.

**What Phase 1 adds:**

- New card ref form: `git+<url>#<ref>` (e.g., `git+https://github.com/team-org/baseline-card.git#v1.3.0`).
- Lockfile schema bump to `lockfileVersion: 2`, additive: optional `git` block on each card entry.
- Origin-dispatching resolver: existing logic for `@scope/name@ver` and `file:` refs, new logic for `git+...` refs.
- New cache directory at `~/.agents/drwn/cache/` for downloaded archives + extracted content.
- New top-level command `drwn install` that bootstraps missing cards from the lockfile.
- Lockfile carries the resolved Git commit SHA as the integrity anchor (alongside the existing sha256 of extracted content).

**What Phase 1 does NOT add** (deferred to Phase 2):

- No local per-card bare Git repos.
- No `drwn card publish` Git mechanics (publish still writes to the directory store as today).
- No `drwn card push` / `drwn card fetch` / `drwn card remote ...` commands.
- No `drwn store gc` (the cache uses simple invalidation, no formal GC yet).
- No `drwn library add catalog` (catalogs are Phase 2).
- No history inspection (no local bare repo means no `git log` over a card).
- Authors who want to share via Git do so with **plain `git` tooling**, not via drwn.

**Mental model after Phase 1:** Users still think in cards and semver. A new card-ref form lets them reference cards by Git URL; the lockfile still pins to an exact version. The drwn surface gains one new top-level command (`drwn install`); everything else is additive.

---

## 2. Scope of Changes

### 2.1 In scope for Phase 1

1. **Lockfile format**: bump to `lockfileVersion: 2` with optional `git` block.
2. **Card ref parsing**: extend `parseCardRef` to recognize `git+<url>#<ref>` form.
3. **Resolver**: add `origin: git` resolution path that calls `git ls-remote` and downloads an HTTP archive.
4. **Cache directory**: introduce `~/.agents/drwn/cache/` with `git-archives/` and `extracted/` subdirectories.
5. **New command**: `drwn install` (top-level) for bootstrapping cards from a lockfile.
6. **Integrity model**: sha256 over normalized extracted content (existing) + Git commit SHA (new, recorded in lockfile).
7. **`drwn add` flow**: dispatches on ref shape; existing flow for non-git refs unchanged.
8. **`drwn apply` flow**: extends to read from cache when card origin is `git`.
9. **`drwn status` output**: surfaces `origin: git` clearly when listing cards.
10. **Tests**: cover the Git URL ref path end-to-end.

### 2.2 Out of scope for Phase 1

- Per-card local bare repos (Phase 2).
- `drwn card publish` Git mechanics (Phase 2).
- `drwn card push/fetch/remote/clone` (Phase 2).
- `drwn store gc` (Phase 2).
- Catalogs (Phase 2).
- Migration of existing `~/.agents/drwn/cards/<name>/<version>/` directories (no migration needed — Phase 1 is purely additive).
- Phase 3's clone-instead-of-archive unification (Phase 3).

### 2.3 Preserved invariants

All of the following hold unchanged after Phase 1:

- Multi-card composition per project (`29_*`).
- Last-wins merge across cards (`29_*` §7).
- Three materialization mechanisms (`32_*` §5).
- Vocabulary cleanup adopted (`42_*` v2): `apply` materializes, `use`/`add`/`pin`/`remove`/`clear` modify intent.
- Card-as-artifact namespace (`drwn card show/diff/new/source/publish/deprecate`).
- `_drwn` meta-block in Claude/Codex settings.
- Project config never carries URLs; lockfile carries URLs for bootstrap.

---

## 3. Storage Layout — After Phase 1

### 3.1 Per-user store (`~/.agents/drwn/`)

```text
~/.agents/drwn/
├── store.json                       # (unchanged) store metadata
├── machine.json                     # (unchanged) machine-wide harness baseline
├── cards/                           # (unchanged) versioned-directory store, today's layout
│   └── @scope/name/<version>/
│       ├── card.json
│       ├── skills/
│       ├── mcp-servers/
│       └── .integrity
├── sources/                         # (unchanged) editable card sources
│   └── @scope/name/
├── mcp-servers/                     # (unchanged) MCP server defs
├── skills/                          # (unchanged) package-backed skill bundles
├── generated/                       # (unchanged) generated downstream files
├── cache/                           # NEW: cache for git-origin cards
│   ├── git-archives/
│   │   └── <commit-sha>.tar.gz      # downloaded raw archives, content-addressed by Git commit SHA
│   ├── extracted/
│   │   └── <commit-sha>/            # extracted content, ready for materialization
│   │       ├── card.json
│   │       ├── skills/
│   │       └── mcp-servers/
│   └── refs.json                    # cache of url+ref → commit SHA mappings, TTL-controlled
└── global-write-record.json         # (unchanged)
```

**Key invariants:**

- The existing directory-versioned `cards/` layout is untouched. Phase 1 only adds the `cache/` tree.
- A card with `origin: git` lives **only** in `cache/extracted/<commit-sha>/`. It never gets copied into `cards/@scope/name/<version>/` in Phase 1. (Phase 2 introduces local bare repos and unifies the storage.)
- The same Git commit SHA used as a directory key in `cache/extracted/` is recorded in the project's `card.lock`. This is the content integrity anchor.

### 3.2 Per-project store (`<project>/.agents/drwn/`)

```text
<project>/.agents/drwn/
├── config.json                      # (unchanged) cards + overlay
├── card.lock                        # CHANGED: lockfileVersion: 2; optional `git` block
├── write-record.json                # (unchanged)
├── skills/                          # (unchanged) project-local skill content
└── presets/                         # (per `42_*`) project snapshots
    └── *.json
```

Project layout doesn't change shape — only `card.lock`'s contents.

---

## 4. Lockfile Schema — `lockfileVersion: 2`

### 4.1 Schema definition

```typescript
interface CardLockfile {
  lockfileVersion: 2;
  cards: CardLockEntry[];
}

interface CardLockEntry {
  // Existing fields (unchanged from v1):
  name: string;           // e.g., "@team/baseline"
  requested: string;      // original spec string, e.g., "@team/baseline@^1.0.0"
  version: string;        // resolved semver
  path: string;           // filesystem path to the card content for materialization
  integrity: string;      // sha256-<hex> over normalized content
  manifest: CardManifest; // the full card.json at the resolved version
  skills: string[];       // bundled skill names from manifest.skills.include
  registry: null;         // reserved for Wave 2

  // NEW in v2:
  origin: "store" | "git" | "file" | "npm";  // explicit, was previously implicit by ref shape
  git?: {                                     // present when origin === "git"
    url: string;                              // canonical URL used at resolve time
    ref: string;                              // human-readable ref (tag/branch/commit prefix), kept for diagnostics
    commit: string;                           // FULL commit SHA, the integrity anchor
  };
}
```

### 4.2 Origin field semantics

- **`store`** — Card came from the local versioned store at `~/.agents/drwn/cards/@scope/name/<version>/`. (Today's default; covers cards published via `drwn card publish` or pulled from npm.) `path` points into the store. `git` is absent.
- **`git`** — Card came from a Git URL. `path` points into `~/.agents/drwn/cache/extracted/<commit-sha>/`. The `git` block records URL + ref + commit.
- **`file`** — Card came from a `file:` ref. `path` points to the user's directory. `git` is absent.
- **`npm`** — Card came from an npm registry. `path` points into the store (after npm-tarball-extract). `git` is absent.

### 4.3 Version migration

A `lockfileVersion: 1` file is **read-compatible**: missing `origin` is inferred as `"store"` (for refs matching `@scope/name@ver`) or `"file"` (for `file:` refs). Missing `git` block is treated as `null`.

On any **write** that adds or modifies a card, the lockfile is bumped to `lockfileVersion: 2`. There's no in-place migration; the bump happens organically as users run `drwn add` / `drwn install` / `drwn update`.

### 4.4 Why both `integrity` and `git.commit`

These verify different things:

- `git.commit` is the SHA Git uses internally; it identifies the source commit cryptographically.
- `integrity` (sha256-<hex>) is computed by drwn over the **extracted** content, normalized (no `.integrity`/`.DS_Store`/etc.).

Both must match on `drwn install`. If `git.commit` is reachable from the remote but the extracted-content hash differs from `integrity`, drwn refuses to apply — this is the tag-rewrite-attack detection from `46_*` §11.2.

---

## 5. Card Reference Forms — After Phase 1

| Ref shape | Example | Origin | Resolution path |
|---|---|---|---|
| `@scope/name@<range>` | `@team/baseline@^1.0.0` | `store` (default) or `npm` (if registry lookup succeeds) | Existing path: list versions in `cards/@scope/name/`, semver max-satisfying |
| `name@<range>` | `personal-runner@^0.5.0` | `store` (default) | Same as above, unscoped |
| `name` (no version) | `baseline` | `store` | Range defaults to `*` |
| `file:<path>` | `file:./local-card-source` | `file` | Resolve path, read `card.json`, compute integrity in place |
| **`git+<url>#<ref>`** | **`git+https://github.com/team-org/baseline-card.git#v1.3.0`** | **`git`** | **NEW: ls-remote → archive download → extract to cache** |

The new ref form is recognized by extending `parseCardRef` in `cli/core/card-store.ts`. The ref string after `git+` is the Git URL (which can itself contain protocol prefixes: `https://`, `git@`, `ssh://`, `file://`). The fragment after `#` is the ref (tag, branch name, or commit prefix).

### 5.1 Ref form details

```text
git+https://github.com/team-org/baseline.git#v1.3.0
└─┬─┘└────────────────────────────────────────┘└──┬──┘
  │                       │                       │
  │                       │                       └─ ref (tag preferred; branch or commit also accepted)
  │                       └─ Git URL (any protocol Git recognizes)
  └─ prefix marking this as a Git ref (drwn-side dispatch)
```

Notes:

- The `git+` prefix is **drwn's marker**; it's stripped before passing the URL to Git.
- Common URL forms work: `https://`, `git@`, `ssh://`, `git://`, `file://`.
- The `#` separator is **literal** in the drwn syntax. Git doesn't normally use `#` for refs in URLs, so drwn-side parsing handles it.
- If `#<ref>` is omitted, drwn refuses the ref. Phase 1 requires explicit ref pinning — we don't auto-resolve to HEAD (that would be agentsync's mistake; see `44_*` §2).

### 5.2 Project config remains URL-free

The project's `<project>/.agents/drwn/config.json` still records refs as semver-style names:

```json
{ "version": 1, "cards": ["@team/baseline@^1.0.0"] }
```

When a user runs `drwn add git+https://github.com/team-org/baseline.git#v1.3.0`:

1. drwn resolves the URL+ref to a commit SHA via `git ls-remote`.
2. drwn downloads the archive at that SHA and extracts to cache.
3. drwn reads `card.json` from the extracted content to learn the card's canonical `name` and `version`.
4. drwn writes `@team/baseline@^1.0.0` (or the appropriate range based on user input) to project config.
5. drwn writes the full `git` block + integrity to `card.lock`.

The URL is **never** in `config.json`. It lives in `card.lock` so bootstrap from a fresh clone works.

---

## 6. Resolver — After Phase 1

### 6.1 Dispatch table

```typescript
// cli/core/card-resolver.ts (NEW or extended from card-store.ts)
async function resolveCard(agentsDir: string, ref: string): Promise<ResolvedCard> {
  const parsed = parseCardRef(ref);
  switch (parsed.origin) {
    case "store":
      return resolveFromStore(agentsDir, parsed);      // EXISTING path
    case "file":
      return resolveFromFile(parsed);                  // EXISTING path
    case "git":
      return resolveFromGit(agentsDir, parsed);        // NEW in Phase 1
    case "npm":
      return resolveFromNpm(agentsDir, parsed);        // EXISTING path (in resolver, may be merged with `store`)
  }
}
```

### 6.2 `resolveFromGit` flow (new)

```typescript
async function resolveFromGit(
  agentsDir: string,
  parsed: ParsedGitRef
): Promise<ResolvedCard> {
  const { url, ref } = parsed;

  // Step 1: resolve ref → commit SHA via git ls-remote
  // (uses ~/.agents/drwn/cache/refs.json as a 60-second TTL cache)
  const commit = await resolveGitRefToCommit(url, ref);

  // Step 2: ensure the archive is downloaded
  const archivePath = await ensureGitArchive(agentsDir, url, commit);

  // Step 3: ensure the archive is extracted
  const extractedDir = await ensureGitArchiveExtracted(agentsDir, commit, archivePath);

  // Step 4: read the card manifest
  const manifest = await readCardManifest(extractedDir);
  assertValidCardManifest(manifest);

  // Step 5: compute content integrity (same algorithm as today's store cards)
  const integrity = await computeCardIntegrity(extractedDir);

  // Step 6: assemble ResolvedCard
  return {
    name: manifest.name,
    requested: parsed.original,
    version: manifest.version,
    path: extractedDir,
    integrity,
    manifest,
    skills: manifest.skills?.include ?? [],
    registry: null,
    origin: "git",
    git: { url, ref, commit },
  };
}
```

### 6.3 `git ls-remote` shell-out

```typescript
async function resolveGitRefToCommit(url: string, ref: string): Promise<string> {
  // Check cache first
  const cached = await readRefsCache(url, ref);
  if (cached && cached.cachedAt + REFS_CACHE_TTL_MS > Date.now()) {
    return cached.commit;
  }

  // Shell out to git
  const proc = Bun.spawn(
    ["git", "ls-remote", url, ref, `refs/tags/${ref}`, `refs/heads/${ref}`],
    { stdout: "pipe", stderr: "pipe" }
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new GitResolutionError(`git ls-remote failed: ${stderr}`);
  }

  // Parse first matching line: "<sha>\t<ref>"
  const line = stdout.split("\n").find(l => l.trim());
  if (!line) throw new GitResolutionError(`ref not found: ${ref} in ${url}`);
  const [sha] = line.split("\t");
  if (!sha || sha.length !== 40) throw new GitResolutionError(`invalid sha returned: ${sha}`);

  await writeRefsCache(url, ref, sha);
  return sha;
}
```

### 6.4 Archive download via HTTP

```typescript
async function ensureGitArchive(
  agentsDir: string,
  url: string,
  commit: string
): Promise<string> {
  const archivePath = resolveCacheArchivePath(agentsDir, commit); // ~/.agents/drwn/cache/git-archives/<commit>.tar.gz
  if (existsSync(archivePath)) return archivePath;

  const archiveUrl = constructArchiveUrl(url, commit);
  // For GitHub: https://github.com/<owner>/<repo>/archive/<commit>.tar.gz
  // For GitLab: https://<host>/<owner>/<repo>/-/archive/<commit>/<repo>-<commit>.tar.gz
  // Generic fallback: try `git archive --remote=<url> <commit>` (rarely supported)

  await fetchToTempFile(archiveUrl, archivePath + ".tmp");
  await rename(archivePath + ".tmp", archivePath); // atomic
  return archivePath;
}
```

### 6.5 Archive extraction

```typescript
async function ensureGitArchiveExtracted(
  agentsDir: string,
  commit: string,
  archivePath: string
): Promise<string> {
  const extractedDir = resolveCacheExtractedPath(agentsDir, commit); // ~/.agents/drwn/cache/extracted/<commit>/
  if (existsSync(extractedDir)) return extractedDir;

  // Extract to temp, then atomic rename
  const tempDir = extractedDir + ".tmp." + randomId();
  await tarExtract(archivePath, tempDir);
  // GitHub/GitLab archives wrap content in a top-level directory; strip one component
  await flattenTopLevelDir(tempDir);
  await rename(tempDir, extractedDir);
  return extractedDir;
}
```

---

## 7. New Command: `drwn install`

### 7.1 Semantics

```text
drwn install [--frozen] [--no-apply]
```

- Read `<project>/.agents/drwn/card.lock`.
- For each card:
  - If `origin: store`, ensure `path` exists (existing semantics; no-op for already-installed).
  - If `origin: git`, ensure `cache/extracted/<commit>/` exists; download + extract if missing.
  - If `origin: file`, verify `path` exists.
  - If `origin: npm`, ensure tarball is cached (existing semantics).
- Verify integrity hash for every card.
- Run `drwn apply` unless `--no-apply` is set.
- `--frozen` mode: fail if any card resolution would require modifying `card.lock` (CI-safe).

### 7.2 Relation to `drwn apply`

| Command | What it does | When to use |
|---|---|---|
| `drwn apply` | Materialize from local store/cache (assumes everything is present) | Daily use after `drwn add`/`drwn pin`/`drwn use` |
| `drwn install` | Fetch missing cards from origins, then apply | Fresh clone of a project; after lockfile changes; CI |

`drwn install` and `drwn apply` produce identical end-state on a fully-installed project. The difference is `install`'s reconciliation step at the start.

### 7.3 Exit codes

- `0`: success
- `1`: integrity mismatch or apply error
- `2`: network failure during fetch
- `3`: auth failure during fetch
- `4`: ref not found in remote
- `5`: lockfile drift in `--frozen` mode

---

## 8. Other Command Surface Changes

| Command | Phase 0 (today) | Phase 1 |
|---|---|---|
| `drwn add @scope/name@ver` | Adds to project, resolves from store | Unchanged |
| `drwn add file:./path` | Adds local source ref | Unchanged |
| **`drwn add git+url#ref`** | Not supported | **NEW: resolves via Git URL, caches archive** |
| `drwn apply` | Materialize from store | Now reads from cache for `origin: git` cards |
| `drwn status` | Shows project state | Now includes `origin: git` indicator for Git-origin cards |
| `drwn install` | Not present | **NEW** |
| `drwn card publish` | Copies source to `cards/<v>/` | Unchanged (Phase 2 changes this) |
| `drwn card show <ref>` | Inspects card from store | Now also accepts `git+url#ref` (one-off resolution + show) |
| `drwn outdated` | Lists outdated store-origin cards | Same; no remote checking for Git cards (Phase 2 adds that) |
| `drwn card diff <a> <b>` | Diffs two store cards | Now also accepts `git+...` refs |

---

## 9. Cache Eviction in Phase 1

Phase 1 does not introduce a formal `drwn store gc` command. Cache eviction is intentionally simple:

- **Archive cache (`cache/git-archives/<sha>.tar.gz`)**: kept indefinitely. These are small. Eviction is manual (`rm` the directory) if needed.
- **Extracted cache (`cache/extracted/<sha>/`)**: kept indefinitely while any project lockfile references the commit. drwn doesn't track this, so eviction is also manual in Phase 1.
- **Refs cache (`cache/refs.json`)**: TTL-controlled (60 seconds default). Auto-expired on read.

A future Phase 2 will introduce `drwn store gc` that reads all known lockfiles and removes unreferenced cache entries. For now, the trade-off is "leaks a few KB per uninstalled card, acceptable."

---

## 10. Error Surfaces

Phase 1 introduces several new failure modes. Each has a clear error type and actionable user-facing message.

### 10.1 Ref resolution failures

| Failure | Exit code | User message |
|---|---|---|
| `git ls-remote` exits non-zero | 2 or 3 | "Could not reach `<url>`: <git's stderr>. Hint: verify the URL and your credentials." |
| Ref not found in remote | 4 | "Ref `<ref>` not found in `<url>`. Available tags: `<list from ls-remote>`." |
| URL is malformed (no protocol) | 1 | "Invalid Git URL `<url>`. Expected form: `git+https://...` or `git+ssh://...` or `git+file://...`." |

### 10.2 Archive failures

| Failure | Exit code | User message |
|---|---|---|
| HTTP fetch fails | 2 | "Could not download archive from `<url>`. Underlying error: `<stderr>`." |
| Archive is not a valid tarball | 1 | "Downloaded archive at `<path>` is not a valid tarball. The remote may have served an unexpected response (e.g., HTML error page)." |
| Extraction fails (disk full, permissions) | 1 | "Could not extract archive: `<error>`." |

### 10.3 Integrity failures

| Failure | Exit code | User message |
|---|---|---|
| Sha256 of extracted content doesn't match lockfile | 1 | "Integrity check failed for `<card>` at version `<v>`. Expected `<sha>`, got `<actual>`. The upstream content may have changed under the same Git ref. Re-pin to a new version if this is intentional." |
| Commit SHA returned by ls-remote doesn't match lockfile | 1 | "The Git ref `<ref>` now points to commit `<new-sha>`, but lockfile expects `<old-sha>`. This is tag rewriting; refusing to apply." |

### 10.4 Lockfile drift

| Failure | Exit code | User message |
|---|---|---|
| `--frozen` and a card needs fetching | 5 | "Lockfile is missing content for `<card>`. Run without `--frozen` to fetch." |
| `--frozen` and resolution would write a new lockfile entry | 5 | "`drwn install --frozen` refuses to modify the lockfile. Run `drwn install` without `--frozen` first." |

---

## 11. Testing Strategy for Phase 1

### 11.1 Test fixtures

A new fixture helper for Git URL refs. Two patterns:

- **Local file:// Git fixture**: create a bare repo at `<temp>/test-card.git/`, commit a card source, tag it, and reference via `git+file:///tmp/.../test-card.git#v1.0.0`. Fast, hermetic, no network.
- **Mock HTTP archive endpoint**: a local HTTP server that serves canned `.tar.gz` files when queried for `/archive/<sha>.tar.gz`. Used for testing the archive-download path independent of `git ls-remote`.

### 11.2 Test coverage

| Scenario | Test |
|---|---|
| `drwn add git+file://...#v1.0.0` resolves and caches | New `test/commands-card-git-add.test.ts` |
| Re-running `drwn add` is idempotent (uses cache) | Same file |
| Integrity mismatch after tag rewrite is detected | Same file |
| `drwn install` on a fresh clone with mixed-origin lockfile | New `test/commands-install.test.ts` |
| `drwn install --frozen` rejects changes | Same file |
| Archive download from real GitHub URL (manual / opt-in) | `test/integration/git-real-host.test.ts` (opt-in) |
| `drwn add` rejects missing `#ref` fragment | Existing add tests, extend |
| `drwn add` rejects unreachable URL with clear error | New |
| Mixed lockfile (some store, some git, some file) materializes correctly | New |

### 11.3 No-network test default

Default test suite uses `file://` URLs only — no internet required. A separate integration suite (opt-in via env var) tests against real GitHub.

---

## 12. Migration from Phase 0 (Today)

Phase 1 is **purely additive** and requires no migration:

- Existing lockfiles (`lockfileVersion: 1`) read fine; on the next mutation, they're rewritten as v2 with `origin: store` inferred for existing entries.
- Existing `cards/` directory layout is untouched.
- Existing tests continue to pass (assuming the v1→v2 read-compat shim is correct).
- New `cache/` directory is created on first Git-origin install.

The only user-facing change for a user who never uses a Git URL ref is: lockfile version bumps from 1 to 2 the next time they run any drwn command that mutates the lockfile. This is silent and backward-readable.

---

## 13. What Phase 1 Enables (and What It Doesn't)

### 13.1 Enabled

- **Distribute a card via Git URL** without npm publishing. Author maintains a card source repo on any Git host; consumers reference `git+<url>#<tag>` and `drwn add` it. Author's publish flow is **plain Git** (tag + push).
- **Reproducible Git-origin installs.** Commit SHAs in the lockfile pin exactly what was installed. Tag rewrites are detected.
- **Mixed-origin projects.** A project can compose cards from npm + store + Git URLs + file refs in one `cards[]`.
- **Fresh-clone bootstrap.** `git clone <project> && cd <project> && drwn install` works end-to-end if the lockfile is well-formed.
- **CI-safe installs.** `drwn install --frozen` fails closed if anything would drift.

### 13.2 Not enabled (deferred to Phase 2)

- **Authoring via drwn**: no `drwn card publish` integration with Git, no `drwn card push`, no `drwn card remote add`. Authors use plain `git`.
- **History inspection**: no local bare repo means no `git log` over a card's history without cloning the source repo separately.
- **`drwn outdated --fetch`**: doesn't check Git remotes for new tags (Phase 2 adds this).
- **Catalog discovery**: `drwn library add catalog` does not exist (Phase 2).
- **Multiple remotes per card**: not supported until Phase 2 introduces local bare repos.
- **`drwn card fetch`**: requires Phase 2.

---

## 14. Open Questions for Phase 1

1. **Should `git ls-remote` accept ambiguous refs (a name that matches both a tag and a branch)?**
   - Lean: prefer tags. Branches are mutable; tags should be immutable. If the same name resolves to both, prefer the tag and emit a warning.

2. **Should the archive download use `git archive` shell-out as a fallback when HTTP archive endpoint is unavailable?**
   - Lean: yes for v1, but slow path. HTTP archive is the fast path. `git archive --remote=<url> <sha>` works against any Git host that supports it (rare for public hosts, common for SSH-accessed hosts).

3. **What's the file naming for downloaded archives?**
   - Decided: `<commit-sha>.tar.gz` in `cache/git-archives/`. Content-addressed by Git commit SHA.

4. **What happens if two cards have the same name but different origins?**
   - Project config has only one `cards[]` entry per name. Last `drwn use`/`drwn add` wins. Origins don't multiplex.

5. **Should `--frozen` be the default in CI environments (detected via `CI` env var)?**
   - Lean: no auto-detection. Explicit `--frozen` keeps behavior predictable.

6. **Should the cache live elsewhere (XDG)?**
   - Defer. drwn uses `~/.agents/drwn/` for everything today; the cache joins that pattern.

7. **Should `drwn install` show a progress indicator for downloads?**
   - Yes, when stdout is a TTY. Minimal: one line per card with status.

---

## 15. Appendix

### A. Quick reference — files touched in Phase 1

| File | Change |
|---|---|
| `cli/core/card-lock.ts` | Schema bump to v2; add `origin` and `git` fields; read-compat for v1 |
| `cli/core/card-store.ts` (or new `cli/core/card-resolver.ts`) | Extend `parseCardRef`; add `resolveFromGit` |
| `cli/core/card-git.ts` (NEW) | `git ls-remote` wrapper, archive download, extraction |
| `cli/core/store-paths.ts` | Add `resolveCachePath`, `resolveCacheArchivePath`, `resolveCacheExtractedPath` |
| `cli/commands/add.ts` (was `cli/commands/card/add.ts`, per `42_*` v2) | Dispatch on ref shape |
| `cli/commands/install.ts` (NEW) | The `drwn install` command |
| `cli/commands/apply.ts` (was `cli/commands/write.ts`) | Read from cache for `origin: git` cards |
| `cli/commands/status.ts` | Surface `origin: git` |
| `cli/index.ts` | Register `install` command |
| `test/commands-card-git-add.test.ts` (NEW) | Cover Git ref add flow |
| `test/commands-install.test.ts` (NEW) | Cover `drwn install` |
| `test/fixtures/git-helpers.ts` (NEW) | Local `file://` Git fixture helpers |

### B. Caches and their TTLs

| Cache | Path | TTL / eviction |
|---|---|---|
| Refs cache | `cache/refs.json` | 60s TTL on each entry |
| Archive cache | `cache/git-archives/<sha>.tar.gz` | Indefinite; manual cleanup |
| Extracted cache | `cache/extracted/<sha>/` | Indefinite; manual cleanup |

Phase 2 introduces `drwn store gc` which automates archive + extracted cleanup. Phase 1 ships without it; the cache is small enough to live with manual cleanup if it bloats.

### C. Vocabulary mapping reminder

Per `42_*` v2, Phase 1 uses the new vocabulary throughout:

- `drwn apply` is the materialization verb (not `drwn write`, not `drwn sync`)
- `drwn use` sets the cards array
- `drwn add` extends the cards array (top-level)
- `drwn card publish` lives under the card-as-artifact namespace
- `drwn install` is the new top-level for "fetch + apply"

Phase 1 assumes task 28 (rebrand) has already landed: `bgng` → `drwn`, `beginning-harness` → `darwinian-harness`, `~/.agents/bgng/` → `~/.agents/drwn/`, etc.
