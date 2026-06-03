# drwn Target Architecture — After Phase 3 (Unified Git Backend)

> **⚠ PARTIALLY SUPERSEDED on 2026-06-01** by **[analysis 52](52_drwn-target-architecture-post-wave-1.md)**. With Phases 1 and 2 collapsed into Wave 1 (which goes directly to bare repos with no `cache/` layer), the migration-of-Phase-1-cache portion of this doc no longer applies. What remains relevant for the future **Wave 2** scope:
>
> - `drwn card new --from-project` capture flow (R6)
> - Manifest schema v2 quality-signal fields (R12)
> - Persistent URL→name mapping cache (`url-card-map.json`)
>
> Treat this doc as the Wave 2 spec going forward; ignore the cache-migration sections. See analysis 52 §16 for the Wave 2 surface and §15 for the phase collapse rationale.

**Date**: 2026-06-01
**Author**: Claude + Remy
**Status**: Draft
**References**: [analyses/48_drwn-target-architecture-after-phase-2.md, analyses/47_drwn-target-architecture-after-phase-1.md, analyses/46_drwn-card-team-sharing-flow.md, analyses/44_drwn-git-storage-backend-options.md, analyses/43_drwn-cli-target-architecture.md]

---

## 1. Executive Summary

This document specifies the **target state of `drwn` after Phase 3** of the Git-distribution rollout. Phase 3 is an **internal unification** phase: it routes Phase 1's `git+url#ref` resolution through Phase 2's per-card bare-repo store, eliminating the parallel `cache/` tree and producing a single, coherent storage model.

**What Phase 3 adds:**

- `git+url#ref` refs now clone into local bare repos (`~/.agents/drwn/cards/@scope/name.git/`) instead of downloading archives into a separate cache.
- `~/.agents/drwn/cache/` (Phase 1 archive cache + extracted cache for Git-URL cards) is deprecated and emptied by Phase 3's migration.
- Single extraction path: every card-origin variant (`store`, `git`, `npm`, `file`) extracts to `~/.agents/drwn/extracted/<tree-sha>/`.
- `drwn outdated --fetch` works uniformly for all Git-backed cards (store and git origins both use `git fetch`).
- `drwn card show`, `drwn card diff`, `drwn card fetch`, `drwn card push` work identically for store-origin and Git-URL-origin cards (because they're now both bare repos).
- Improved offline support: once a `git+url` card has been resolved once, all subsequent operations against it are offline-capable.
- `drwn install` shows symmetric behavior for store-origin and Git-URL-origin cards.

**What Phase 3 does NOT add:**

- No new user-visible commands.
- No new lockfile fields.
- No new materialization mechanisms.
- No registry service.

**Mental model after Phase 3:** Every card in the local store is a bare Git repo. Some have a remote configured (origin = the team's Git host); some are author-local-only. The distinction between "I added this via `drwn add @team/baseline@1.3.0`" and "I added this via `drwn add git+https://github.com/team-org/baseline.git#v1.3.0`" disappears at the storage layer — both produce a bare repo at `cards/@team/baseline.git/`.

---

## 2. Scope of Changes (Phase 3 vs Phase 2)

### 2.1 In scope for Phase 3

1. **Resolver unification**: `resolveFromGit` no longer downloads an HTTP archive. Instead, it ensures a bare repo exists at `cards/@scope/name.git/`, clones from the URL if not, fetches if it does, then extracts via `git archive`.
2. **Card name discovery for Git URLs**: when a Git URL is first added, drwn reads `card.json` from a shallow clone to learn the card's `name`, then places the bare repo at the right path. Subsequent operations work on `@scope/name` directly.
3. **Cache cleanup**: `drwn store migrate-to-bare-repos` (one-shot migration) moves any remaining Phase-1-style cache content into the bare-repo + `extracted/` model.
4. **Lockfile semantics**: `origin: "git"` cards now record `path` pointing into `extracted/<tree-sha>/`, identical to `origin: "store"` cards. The distinction is preserved only in the `origin` field and the bare repo's remote configuration.
5. **`drwn install` unified path**: all `origin: "git"`/`"store"` cards go through the same clone-or-fetch + extract path.
6. **`drwn card fetch` for any Git-origin card**: works the same whether the card was added via npm-resolved name (store-origin) or directly by URL (git-origin).
7. **Deprecation of `~/.agents/drwn/cache/git-archives/`**: emptied during migration; not written to by Phase 3 code.

### 2.2 Out of scope for Phase 3

- New end-user commands.
- New lockfile fields.
- Phase 4 — submodule federation (Design B from `44_*`) remains deferred to "later" without commitment.

### 2.3 Preserved invariants

All from Phase 2 plus:

- Lockfile schema v2 unchanged.
- Bare repo layout unchanged.
- Extraction cache (`extracted/<tree-sha>/`) unchanged.
- Materialization unchanged.
- Team-sharing flow unchanged.

---

## 3. Storage Layout — After Phase 3

```text
~/.agents/drwn/
├── store.json
├── machine.json
├── cards/                              # every card is a bare repo, regardless of origin
│   ├── @team/
│   │   └── baseline.git/               # could be: store-origin (published via drwn), git-origin (cloned from URL), or both
│   ├── @upstream/
│   │   └── observability.git/          # origin: git, cloned from a public Git URL
│   └── name.git/                       # unscoped, same shape
├── sources/                            # editable card sources
├── extracted/                          # content-addressed extraction; unified
│   └── <tree-sha>/
├── catalogs/
├── catalogs.json
├── mcp-servers/
├── skills/
├── generated/
└── global-write-record.json
```

**Notable absence:** `~/.agents/drwn/cache/` (Phase 1's git-URL cache + archive cache) is gone after Phase 3 migration. Bare repos and `extracted/` are the only storage of card content.

### 3.1 What happened to a Phase-1-installed Git-URL card

A user who added `git+https://github.com/team-org/baseline.git#v1.3.0` in Phase 1 had:

- `cache/git-archives/<sha>.tar.gz` — the downloaded archive
- `cache/extracted/<sha>/` — extracted content
- Lockfile entry with `origin: "git"`, `path: cache/extracted/<sha>/`

After Phase 3 migration:

- `cards/@team/baseline.git/` — a bare repo, cloned from the URL, with all reachable tags
- `extracted/<tree-sha>/` — extracted content (re-extracted from the bare repo)
- Lockfile entry updated: `origin: "git"`, `path: extracted/<tree-sha>/`

Both `cache/` directories are emptied.

---

## 4. Resolver — After Phase 3

### 4.1 Unified `resolveFromGit`

```typescript
async function resolveFromGit(
  agentsDir: string,
  parsed: ParsedGitRef
): Promise<ResolvedCard> {
  const { url, ref } = parsed;

  // Step 1: determine the card name (read manifest via shallow clone if first time)
  const cardName = await discoverCardName(agentsDir, url);

  // Step 2: ensure a bare repo exists at cards/@scope/name.git/
  const bareRepoPath = await ensureBareRepo(agentsDir, cardName, url);

  // Step 3: fetch the ref if needed (offline-tolerant: skip if already present)
  await ensureRefFetched(bareRepoPath, ref);

  // Step 4: resolve ref to commit SHA (now LOCAL, not via ls-remote)
  const commit = await git.revParse(bareRepoPath, ref);

  // Step 5: get the tree SHA from the commit
  const tree = await git.getCommitTree(bareRepoPath, commit);

  // Step 6: ensure extraction
  const extractedDir = await ensureExtracted(agentsDir, bareRepoPath, tree);

  // Step 7: read manifest, compute integrity
  const manifest = await readCardManifest(extractedDir);
  const integrity = await computeCardIntegrity(extractedDir);

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

### 4.2 The `discoverCardName` helper

When a user first adds `git+https://github.com/team-org/baseline.git#v1.3.0`, drwn doesn't yet know the card's canonical name. Options:

**Option A: Shallow clone first.**

```typescript
async function discoverCardName(agentsDir: string, url: string): Promise<string> {
  const tempDir = await fs.mkdtemp(/* ... */);
  await git.clone(url, tempDir, { depth: 1 });
  const manifest = await readCardManifest(tempDir);
  const name = manifest.name;
  await fs.rm(tempDir, { recursive: true, force: true });
  return name;
}
```

Simple. Adds one extra clone for first-time URL resolution. Subsequent operations against the same URL skip this (the bare repo already exists and is mapped via the URL → name lookup).

**Option B: URL-to-name convention.**

Parse the URL's last path component (e.g., `baseline-card` → `@team/baseline`). Fragile; many naming conventions; users can name their repos anything.

**Decision: Option A.** Costs one shallow clone the first time; correctness over convention.

### 4.3 The `ensureBareRepo` helper

```typescript
async function ensureBareRepo(
  agentsDir: string,
  cardName: string,
  url: string
): Promise<string> {
  const bareRepoPath = resolveBareRepoPath(agentsDir, cardName);

  if (existsSync(bareRepoPath)) {
    // Repo exists. Verify the configured remote matches the URL.
    const remotes = await git.remoteList(bareRepoPath);
    const origin = remotes.find(r => r.name === "origin");
    if (!origin) {
      // Repo exists but no origin. Add it.
      await git.remoteAdd(bareRepoPath, "origin", url);
    } else if (origin.url !== url) {
      // URL conflict. The user is trying to register a different remote
      // for an existing card name. This is an error case.
      throw new RemoteConflictError(
        `Card ${cardName} already has a remote at ${origin.url}; refusing to overwrite with ${url}. ` +
        `Use \`drwn card remote set\` if you intend to change it.`
      );
    }
    return bareRepoPath;
  }

  // Repo doesn't exist. Clone it.
  await git.clone(url, bareRepoPath, { bare: true });
  await git.configSet(bareRepoPath, "drwn.cardName", cardName);
  return bareRepoPath;
}
```

### 4.4 The `ensureRefFetched` helper

```typescript
async function ensureRefFetched(bareRepoPath: string, ref: string): Promise<void> {
  // Check if the ref already exists locally
  try {
    await git.revParse(bareRepoPath, ref);
    return; // ref is present, no fetch needed
  } catch (e) {
    // ref not found locally, fall through to fetch
  }

  // Fetch the ref specifically (don't fetch all tags if we don't need them)
  await git.fetch(bareRepoPath, "origin", [ref, `refs/tags/${ref}:refs/tags/${ref}`]);

  // Verify it's now present
  await git.revParse(bareRepoPath, ref); // throws if still missing
}
```

This is critical for offline operation: if a card has been resolved before, the ref is locally cached and no network is needed. Only first-time resolution or genuinely-new refs trigger a `git fetch`.

---

## 5. Migration in Phase 3

### 5.1 The `drwn store migrate-to-bare-repos` command

```text
drwn store migrate-to-bare-repos [--dry-run] [--remove-old]
```

Algorithm:

```
For each entry in cache/extracted/<commit-sha>/:
  Read card.json to learn the card's canonical name
  Find the original Git URL (look up by commit SHA in lockfile entries that point at this path, or read drwn-meta if available)
  If no URL is recoverable: warn and skip
  Otherwise:
    Ensure bare repo exists at cards/@scope/name.git/ (clone from URL if not)
    Verify the commit SHA is reachable from the bare repo (fetch if not)
    Extract the commit's tree to extracted/<tree-sha>/
    Update any lockfiles in tracked projects (if known) to point at extracted/<tree-sha>/

For each archive in cache/git-archives/<commit-sha>.tar.gz:
  Remove (no longer needed)

For each remaining file in cache/:
  Remove if --remove-old; otherwise rename cache/ → cache.legacy/ for safety
```

### 5.2 Discovering URLs for Phase-1 cards

A Phase 1 lockfile entry has:

```json
{
  "origin": "git",
  "git": { "url": "https://...", "ref": "v1.3.0", "commit": "deadbeef..." },
  "path": "/Users/me/.agents/drwn/cache/extracted/deadbeef.../"
}
```

The URL is in the entry. Migration walks all known lockfiles (using the tracked-projects registry from analysis 43, or via explicit `--projects` flag) and collects URL→cache-path mappings.

For orphaned cache entries (extracted content with no matching lockfile entry), drwn can't recover the URL. These are reported as "orphaned" and removed with `--remove-old` or left in `cache.legacy/`.

### 5.3 Lockfile rewrites

For each lockfile entry that gets migrated:

- `origin` stays `git`.
- `git` block unchanged.
- `path` updated to point at `extracted/<tree-sha>/`.
- `integrity` re-verified (sha256 should match because content is identical).

If integrity mismatch occurs during migration, drwn errors out: this would indicate a bug or filesystem corruption.

### 5.4 Idempotency

Migration is idempotent. If `drwn store migrate-to-bare-repos` is run twice, the second run finds nothing to migrate (the cache directories are empty or already moved) and reports "nothing to do."

---

## 6. Command Surface — After Phase 3

The CLI surface from Phase 2 stands. No new top-level commands. Phase 3 adds:

```text
# Store maintenance (additions)
drwn store migrate-to-bare-repos [--dry-run] [--remove-old]
```

That's it. Phase 3 is internal unification; user-visible behavior is unchanged.

The behavioral improvements that users might notice:

- `drwn card show git+https://github.com/team-org/baseline.git#v1.3.0` now shows Git log (because there's a local bare repo).
- `drwn card diff git+url#v1.2.0 git+url#v1.3.0` shows real Git diff.
- `drwn card fetch git+url` works (refreshes the local bare repo).
- `drwn outdated --fetch` works for `origin: git` cards (fetches tags from each card's bare repo's remote).
- Re-adding a Git-URL card that's already in the local store is fast (just a `git fetch`, not a full re-download).

---

## 7. Behavioral Differences From Phase 2

| Operation | Phase 2 | Phase 3 |
|---|---|---|
| `drwn add git+url#ref` | Downloads archive to `cache/git-archives/`, extracts to `cache/extracted/<commit>/` | Clones into `cards/@scope/name.git/`, extracts to `extracted/<tree-sha>/` |
| Repeat `drwn add git+url#ref` after first install | Re-downloads (cache hits archive but extraction is repeated) | Hits local bare repo; no network |
| `drwn card show git+url#ref` | Limited; no local Git history | Full Git log from local bare repo |
| `drwn card diff git+url#refA git+url#refB` | Manifest diff only | Real Git diff |
| `drwn outdated --fetch` for `origin: git` cards | Re-runs `ls-remote` per card | `git fetch --tags` per card's bare repo |
| Offline operation after first install of a Git-URL card | Works (archive in cache) | Works (bare repo in store) |
| `drwn card fetch git+url-card` | Not supported (no bare repo) | Works the same as for store-origin cards |
| `drwn card push git+url-card` | Not supported | Works (pushes to the remote configured in the bare repo) |

The Phase 3 column shows the **unified** behavior: every card is a bare repo, every operation is symmetric.

---

## 8. The Single Resolver Path

After Phase 3, all card resolution flows through one function (sketch):

```typescript
async function resolveCard(agentsDir: string, ref: string): Promise<ResolvedCard> {
  const parsed = parseCardRef(ref);

  if (parsed.origin === "file") {
    return resolveFromFile(parsed);  // file: refs still extract in-place
  }

  // For store, git, npm origins: all go through bare repo + extracted/<tree-sha>/
  let cardName: string;
  let url: string | null;

  if (parsed.origin === "store") {
    cardName = parsed.name;
    url = null; // may be set in bare repo config, but not required
  } else if (parsed.origin === "git") {
    cardName = await discoverCardName(agentsDir, parsed.url);
    url = parsed.url;
  } else if (parsed.origin === "npm") {
    // Convert npm tarball into a single-commit bare repo (or handle separately)
    return resolveFromNpm(agentsDir, parsed); // potentially still a separate path
  }

  const bareRepoPath = await ensureBareRepo(agentsDir, cardName, url);
  await ensureRefFetched(bareRepoPath, parsed.range);
  const commit = await git.revParse(bareRepoPath, parsed.range);
  const tree = await git.getCommitTree(bareRepoPath, commit);
  const extractedDir = await ensureExtracted(agentsDir, bareRepoPath, tree);

  return assembleResolvedCard(extractedDir, parsed, { url, commit, tree });
}
```

The single most important property: **after Phase 3, the resolver doesn't care whether a card was originally added via npm-style name or via Git URL.** Both produce a bare repo + extraction, and both are queried identically thereafter.

---

## 9. What About npm Origin?

Cards from npm (today's planned path for public distribution) remain a special case in Phase 3. Two options:

**Option N1: Keep npm separate.**

`origin: "npm"` cards extract directly from the tarball into `extracted/<tree-sha>/`. No bare repo. The `path` in the lockfile still points at `extracted/<tree-sha>/`, and from drwn's downstream perspective they look the same as Git-backed cards. They just don't have the Git-history affordances.

**Option N2: Wrap npm in a synthetic bare repo.**

Every time an npm card is installed, drwn creates a single-commit bare repo at `cards/@scope/name.git/` with the tarball content as the initial commit. Subsequent npm updates add new commits. The npm version maps to a tag.

This unifies everything but adds complexity: synthetic Git history that doesn't correspond to upstream's actual Git history (which might be a public repo somewhere). Users could be confused: "why does `git log` of `@upstream/foo` show only one commit per npm publish?"

**Decision: Option N1.** Keep npm separate. Phase 3 unifies store/git origins; npm stays its own track. If npm distribution becomes deprecated in favor of pure Git distribution later, this becomes moot.

---

## 10. Performance Considerations

### 10.1 First-time install of a Git-URL card

| Step | Phase 2 | Phase 3 |
|---|---|---|
| Resolve ref | `git ls-remote` (~1 round trip) | `git ls-remote` then `git clone --bare` (~2 round trips, more data) |
| Download content | HTTP archive (one big request, one tarball) | `git clone --bare` (multiple objects, more bandwidth-efficient over time) |
| Total time, small card | ~2s | ~3s |
| Total time, large card | ~5s | ~6s |

Phase 3's first-time install is slightly slower because cloning fetches more Git metadata than just the archive. For small cards (the common case), the difference is negligible.

### 10.2 Repeat operations

| Operation | Phase 2 | Phase 3 |
|---|---|---|
| Re-add same `git+url#ref` | Re-extracts from cached archive | No-op (bare repo + extraction already exist) |
| Fetch new versions | Re-ls-remote + maybe download | `git fetch --tags` (incremental, fast) |
| Diff two versions of same card | Manifest diff only | `git diff` (fast, local) |
| `drwn outdated --fetch` for N cards | N ls-remote calls (sequential or limited parallelism) | N `git fetch` calls, but bare repos cache results |

Phase 3 trades a small first-install penalty for significant ongoing-operation speedup.

### 10.3 Disk usage

| Cards | Phase 2 disk | Phase 3 disk |
|---|---|---|
| 1 card, 1 version, small content | ~50KB (archive + extraction) | ~100KB (bare repo + extraction) |
| 1 card, 10 versions | ~500KB (10 archives + 10 extractions) | ~150KB (bare repo with shared objects + 10 extractions if all live) |
| 100 cards average | ~50MB | ~30MB (Git pack file dedup) |

Phase 3's bare-repo storage is more disk-efficient at scale because Git's object database deduplicates content across versions.

---

## 11. Testing Strategy for Phase 3

### 11.1 New test files

| File | Coverage |
|---|---|
| `test/commands-store-migrate-to-bare-repos.test.ts` | Migration from Phase 1 cache to bare repos |
| `test/scenarios-unified-resolution.test.ts` | Same card resolved via store-origin and git-origin produces same materialization |
| `test/scenarios-offline-git-url.test.ts` | Git URL card works offline after first install |
| `test/scenarios-card-show-history-git-url.test.ts` | `drwn card show` works on git-origin cards |
| `test/scenarios-card-diff-git-url.test.ts` | `drwn card diff` works on git-origin cards |

### 11.2 Regression coverage

Phase 3 must not break:

- Existing Phase 2 store-origin workflows (full author flow).
- Existing Phase 1 lockfiles (read-compat).
- Existing Phase 2 lockfiles (read-compat).
- Materialization (which is unchanged).
- All catalog functionality.

The Phase 2 test suite should pass unchanged after Phase 3 lands.

---

## 12. Open Questions for Phase 3

1. **Should `discoverCardName` cache the URL→name mapping?**
   - Yes. After first resolution, write `~/.agents/drwn/url-card-map.json` with `{ url, cardName }` entries. Skip the shallow clone on subsequent resolutions.

2. **What if two different URLs claim the same card name?**
   - This is a name collision. drwn errors out at the second URL's add: "Card `@team/baseline` is already mapped to URL `<A>`. You're trying to add the same name from URL `<B>`. Refusing." Resolution requires the user to fork or rename.

3. **What if a Git URL ref points at a commit whose tree's `card.json` has a name that contradicts an earlier discovery?**
   - This is a card rename across versions. drwn checks: if the bare repo at `cards/@scope/name.git/` has its `[drwn] cardName` equal to the discovered name, fine. If not, error: "Card name changed between versions; this is a major identity change. Use `drwn card source set --name` and re-publish."

4. **Should Phase 3 clean up `cache/` on its own, or require explicit `drwn store migrate-to-bare-repos`?**
   - Lean: explicit migration. Don't silently move files; let the user opt in.

5. **What about cards added via `drwn add @upstream/foo` where `@upstream/foo` comes from a catalog (not yet present in local store)?**
   - The catalog provides the URL. drwn calls `ensureBareRepo(name, url)` from the catalog entry's URL. Works identically to direct `git+url` add.

6. **Should Phase 3 support shallow clones to save bandwidth for one-off installs?**
   - `git clone --bare --depth=N` is supported by Git. Trade-off: shallow clones don't have full history, so `drwn card show <historical-version>` fails. Phase 3 default: full clone. Add `--shallow` flag later if bandwidth becomes a concern.

7. **What if a bare repo's origin URL was changed externally (e.g., the user ran `git remote set-url` directly)?**
   - drwn reads the URL from the bare repo on each operation. If it's changed, drwn uses the new URL. This is fine — drwn doesn't enforce URL stability.

---

## 13. What Phase 3 Enables

- **Unified mental model.** Every card is a bare repo. The `origin` field distinguishes provenance, not behavior.
- **Symmetric Git-aware commands.** `drwn card show/diff/fetch/push` work identically for store-origin and Git-URL-origin cards.
- **Offline operation.** After first install of any Git-backed card, all subsequent operations against it work offline.
- **Cache cleanup.** Phase 1's `~/.agents/drwn/cache/` is gone; one storage model.
- **Better disk efficiency at scale.** Git pack files deduplicate content across versions and across cards (for shared blobs).

---

## 14. What Phase 3 Still Doesn't Solve (Deferred to Future Work)

- **Submodule federation (Design B from `44_*`).** Phase 3 is the end of the Design A + E unified path. Design B (parent submodule repo) remains a v4+ possibility if "submodule semantics surface to users" ever becomes valuable. Per `44_*` §7, the per-card-repo foundation makes submodule federation easy to add later.
- **Registry service (D3 from `46_*` §7.3).** Catalogs are sufficient; defer.
- **Cross-machine sync of the entire store.** A `drwn store push-all` / `drwn store pull-all` for syncing every bare repo would be useful for multi-machine users. Defer; per-card sync via `drwn card push/fetch` covers the common case.
- **Sparse checkouts for very large cards.** Cards are typically small enough that this doesn't matter. Defer.
- **Card signing (SLSA-style attestation).** Per `32_*` §6.6, a v2+ enhancement. Independent of Git mechanics.

---

## 15. Open Question: Is Phase 3 Worth Shipping Separately?

A reasonable counter-question: if Phase 2 already covers the team-sharing flow, and Phase 3 just unifies internals, is Phase 3 worth a separate release?

**Yes, for three reasons:**

1. **Operational simplicity.** Phase 2 leaves `~/.agents/drwn/cache/` as a parallel storage path. Operations that touch the store (gc, verify, migrate) have to handle both. Phase 3 collapses this and reduces the future-maintenance surface.
2. **Better UX on existing commands.** `drwn card show git+url#ref` and `drwn outdated --fetch` for `origin: git` cards both work meaningfully better after Phase 3. Even if these aren't "headline features," they're paper cuts that matter.
3. **Disk-efficiency for power users.** Users with many Git-URL cards see real disk savings.

Phase 3 is a smaller, lower-risk follow-up to Phase 2 — its scope is tight enough to ship in a few sessions of work. The right framing is "Phase 2 makes Git work; Phase 3 makes it elegant."

**An alternative framing:** if you don't want a separate Phase 3 ship, fold its scope into Phase 2. The decision tree:

- If Phase 2 is large and risky → split, ship Phase 2 first, polish in Phase 3.
- If Phase 2 is tight and Phase 3's scope is small → merge them and ship as one.

The implementation plans (next docs in the series) will reflect Phase 2 as the larger phase. Whether they're separately shipped or merged is a release-strategy call.

---

## 16. Appendix

### A. Files modified in Phase 3

| File | Change |
|---|---|
| `cli/core/card-resolver.ts` (NEW or extended from `card-store.ts`) | Unified `resolveCard` with single bare-repo path |
| `cli/core/card-store.ts` | Remove the Phase 1 archive path; route through `card-resolver.ts` |
| `cli/core/card-git.ts` | Add `discoverCardName`, refactor `ensureBareRepo` for clone-on-first-resolve |
| `cli/commands/store/migrate.ts` | Add `migrate-to-bare-repos` subcommand |
| `cli/commands/install.ts` | Remove Phase 1 archive path |
| `cli/commands/outdated.ts` | Use bare repo for Git-origin cards |
| `cli/commands/card/show.ts` | Use bare repo for all origins (already does for store; extends to git) |
| `cli/commands/card/diff.ts` | Same |
| `cli/commands/card/fetch.ts` | Now works for `origin: git` cards too |
| `test/...` | New scenarios + regression coverage |

### B. Phase 3 storage migration matrix

| Phase 1 state | Phase 3 state |
|---|---|
| Lockfile entry: `origin: "git"`, `path: cache/extracted/<commit>/` | Lockfile entry: `origin: "git"`, `path: extracted/<tree-sha>/` |
| `~/.agents/drwn/cache/git-archives/<commit>.tar.gz` | Removed (`cache.legacy/` if not `--remove-old`) |
| `~/.agents/drwn/cache/extracted/<commit>/` | Removed; content re-extracted from bare repo |
| `~/.agents/drwn/cache/refs.json` | Removed |
| No bare repo for the URL | Bare repo at `~/.agents/drwn/cards/@scope/name.git/` |

### C. Future Phase 4 (submodule federation)

Per `44_*` Design B and §11.F item 4, a future Phase 4 would introduce:

- A parent repo at `~/.agents/drwn/store.git/` with submodule pointers per card.
- The parent repo's HEAD commit pins which submodule commit is "active" for each card.
- `drwn install` reads parent + submodule state instead of project lockfile (or in addition to it).

Phase 4 is **not on the current roadmap**. It becomes cheap to implement once Phase 3 is in place because the per-card bare repos are exactly what a submodule federation needs. The right time to start Phase 4 is when there's a concrete use case (e.g., "I want my whole machine's harness state to be one Git commit I can roll back") rather than speculation.
