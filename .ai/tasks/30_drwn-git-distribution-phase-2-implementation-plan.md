# Task 30: drwn Git Distribution Phase 2 — Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for code-touching tasks where tests are the spec. Do not commit unless explicitly instructed.

**Status**: Ready For T1 Start After Phase 1 Merges
**Created**: 2026-06-01
**Updated**: 2026-06-01
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 PR (8–14 sessions; the largest of the three Git phases)
**Dependencies**: Task 29 (Phase 1) merged, task 28 (rebrand) merged, analyses 42 v2, 44, 46, 48
**References**: [analyses/48_drwn-target-architecture-after-phase-2.md, analyses/47_drwn-target-architecture-after-phase-1.md, analyses/46_drwn-card-team-sharing-flow.md, analyses/44_drwn-git-storage-backend-options.md, tasks/29_drwn-git-distribution-phase-1-implementation-plan.md, cli/core/card-store.ts, cli/core/card-lock.ts]

---

## Objective

Land Phase 2 of the Git-distribution rollout (Design A from analysis `44_*` §11.F): convert the local card store from per-version directories to **per-card bare Git repositories**, introduce a content-addressed extraction cache keyed by Git tree SHA, wrap the full team-sharing flow (`drwn card publish`/`push`/`fetch`/`remote`/`clone`), and add catalog-based discovery. Build on the Phase 1 foundation (Git URL refs, lockfile v2, `drwn install`).

The target post-merge state is fully specified in analysis 48. This plan describes how to get there.

---

## Architecture

Phase 2 introduces, in order of structural importance:

1. **Expanded Git plumbing wrapper** at `cli/core/git.ts` (renamed/expanded from Phase 1's `card-git.ts`). Adds `writeTree`, `commitTree`, `updateRef`, `tag`, `revParse`, `catFile`, `clone --bare`, `fetch`, `push`, `remote add/list/set`, `archive`, `fsck`, `gc`.
2. **Per-card bare repos** at `~/.agents/drwn/cards/@scope/name.git/`. Each card has its own Git repo with tags = published versions, `main` = head.
3. **Content-addressed extraction cache** at `~/.agents/drwn/extracted/<tree-sha>/`. Replaces per-version directories.
4. **Migration tool** `drwn store migrate-to-git`: converts existing per-version layout to bare repos + extracted cache.
5. **`drwn card publish` rewrite**: source → `write-tree` → `commit-tree` → `tag` → extract.
6. **Team-sharing commands**: `drwn card remote add/list/set/remove`, `drwn card push`, `drwn card fetch`, `drwn card clone`.
7. **Catalog support**: `drwn library add/remove/list/refresh catalog`, `drwn search card`.
8. **Maintenance commands**: `drwn store gc`, `drwn store verify`, `drwn outdated --fetch`.
9. **History affordances**: `drwn card show` shows Git log; `drwn card diff` uses `git diff`.

Phase 1's `~/.agents/drwn/cache/` (Git URL archive cache) is **preserved** in Phase 2. Phase 3 consolidates it into the unified bare-repo path.

---

## Tech Stack

- Bun 1.2+ with `Bun.spawn` for all Git shell-outs
- TypeScript with Clipanion 4
- `git` 2.x runtime dependency (already required by Phase 1)
- `tar` runtime dependency (already required by Phase 1)
- No new npm dependencies

---

## Success Criteria

### Storage migration

- [ ] `~/.agents/drwn/cards/@scope/name.git/` bare repos replace per-version directories after migration.
- [ ] `~/.agents/drwn/extracted/<tree-sha>/` cache replaces in-place version content.
- [ ] `drwn store migrate-to-git` produces a bare repo for every existing card with all versions as commits + tags, in chronological order.
- [ ] Migration is idempotent: running it twice is a no-op the second time.
- [ ] Migration is resumable: interrupting mid-run leaves no inconsistent state.
- [ ] After migration, `drwn apply` continues to materialize identically.
- [ ] Lockfile entries with `origin: "store"` are auto-updated on next `drwn apply`/`install` to point at `extracted/<tree-sha>/`.

### Publish flow

- [ ] `drwn card publish @scope/name --bump <level>` reads source content, creates a Git commit + tag in the bare repo, extracts the tree to `extracted/<tree-sha>/`.
- [ ] Existing test fixtures using `publishCardWithSkills` continue to work (refactored internally).
- [ ] Publishing the same version twice errors out (immutability).
- [ ] Published cards carry their integrity hash in the tag's annotation message.

### Team-sharing commands

- [ ] `drwn card remote add <name> <url> [--name <r>]` configures a remote on the bare repo.
- [ ] `drwn card remote list <name>` shows configured remotes.
- [ ] `drwn card remote set <name> <url>` changes a remote URL.
- [ ] `drwn card remote remove <name> [--remote <r>]` removes a configured remote.
- [ ] `drwn card push <name> [--remote <r>]` pushes `main` + tags to the configured remote.
- [ ] `drwn card fetch <name> [--remote <r>]` runs `git fetch --tags`.
- [ ] `drwn card clone <url> [--as <name>]` clones a remote bare repo into the local store.
- [ ] Non-fast-forward push fails cleanly with actionable error.

### Bootstrap

- [ ] `drwn install` now clones missing bare repos for `origin: "store"` and `origin: "git"` cards.
- [ ] `drwn install --frozen` fails if any clone or fetch would be required.

### Catalog

- [ ] `drwn library add catalog <url>` shallow-clones a catalog repo, parses `catalog.json`, registers entries.
- [ ] `drwn library list catalog` shows all registered catalogs.
- [ ] `drwn library refresh catalog [<scope>]` re-fetches catalog content.
- [ ] `drwn library remove catalog <scope-or-url>` unregisters a catalog.
- [ ] `drwn search card --scope @team` returns cards from registered catalogs matching the scope.
- [ ] `drwn search card <name>` searches across all catalogs by name.

### History affordances

- [ ] `drwn card show <ref>` outputs Git log for the card, in addition to manifest info.
- [ ] `drwn card diff <ref-a> <ref-b>` shows a real `git diff` between two tagged versions of the same card.

### Maintenance

- [ ] `drwn store gc` removes unreferenced `extracted/<tree-sha>/` entries (and Phase 1 cache entries).
- [ ] `drwn store gc --dry-run` reports without removing.
- [ ] `drwn store verify` re-checks integrity of all cards.
- [ ] `drwn outdated --fetch` runs `git fetch` against each card's configured remote before reporting.

### Backward compatibility

- [ ] Existing project lockfiles (v1 + v2) continue to read correctly.
- [ ] Materialization output is byte-identical to Phase 1 for cards that exist in both phases.
- [ ] Tests from Phase 1 pass unmodified.

### Gates

- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run verify:release --json` passes.
- [ ] `npm pack --dry-run --json` produces a clean tarball.

---

## Decisions Locked Before Implementation

| # | Decision | Source |
|---|---|---|
| D1 | Bare repos at `~/.agents/drwn/cards/@scope/name.git/`, one per card. Tags = versions. | analysis 48 §3.2 |
| D2 | Content-addressed extraction keyed by **tree SHA**, not commit SHA. Saves disk when two commits share content. | analysis 48 §3.3 |
| D3 | Migration is one-shot, opt-in via `drwn store migrate-to-git`. Not run automatically. Old directories renamed to `<name>.legacy/` until `--remove-old`. | analysis 48 §4.2 |
| D4 | Shell out to `git`. No Git library. Continue Phase 1's pattern. | analyses 44, 48 |
| D5 | Publish uses Git plumbing (`write-tree`/`commit-tree`/`update-ref`/`tag`). No working tree needed. | analysis 48 §5.2 |
| D6 | `drwn card publish` requires source to be valid (`drwn card source doctor` passes) — but does not require it to be a Git repo. | analysis 48 §15 (#5) |
| D7 | Default remote name is `origin`. Multi-remote support via `--name <alias>` flag. | analysis 48 §6 |
| D8 | Authentication is Git's domain. drwn does not store credentials. | analysis 46 §10 |
| D9 | Catalog repos are shallow-cloned (depth=1) into `~/.agents/drwn/catalogs/`. | analysis 48 §10.1 |
| D10 | `drwn store gc` is explicit, not automatic. | analysis 48 §11.3 |
| D11 | Phase 1's `~/.agents/drwn/cache/` for Git URL refs stays in place during Phase 2. Phase 3 unifies it. | analysis 48 §18.C |
| D12 | `drwn install` and `drwn outdated --fetch` parallelize fetches with bounded concurrency (4 by default). | analysis 48 §15 (#7) |
| D13 | The Git plumbing wrapper module is **renamed** from Phase 1's `card-git.ts` to `git.ts` (or `cli/core/git/index.ts` with submodules) since it now wraps much more than card-specific operations. | This plan |

---

## Out of Scope

- Phase 3's unification of Phase 1's `cache/` with Phase 2's `extracted/`.
- Phase 4 (submodule federation).
- A registry service (catalogs are enough).
- Cross-machine sync of the entire store as a single operation.
- Sparse checkouts.
- Card signing / SLSA-style attestation.
- `drwn card fork`, `drwn card rename` (composable from existing primitives).

---

## Evidence Base

From Phase 1 + the original codebase investigation:

- Phase 1 module `cli/core/card-git.ts` (will be extended and renamed in Phase 2).
- Phase 1 lockfile schema v2 at `cli/core/card-lock.ts`.
- Existing publish flow at `cli/commands/card/publish.ts` calling `publishCard` in `cli/core/card-store.ts:288-333`.
- Existing test scaffold `test/helpers.ts::scaffoldCliFixture` and `publishCardWithSkills`.
- Materialization flow at `cli/core/sync.ts` (unchanged in Phase 2; reads `path` from lockfile).

---

## Entry Checks

```bash
git status --short --branch
bun test
bun run typecheck
bun run verify:release --json
git log --oneline -5  # confirm Phase 1 is in the base
```

Expected:

- Branch base includes Phase 1 (task 29) and rebrand (task 28).
- Working tree clean.
- All gates green.

Create the branch:

```bash
git checkout -b remyjkim/git-distribution-phase-2
```

---

## Implementation Strategy

Seven sub-phases. Each ends in a green-test commit. Each is independently meaningful and could be merged separately if desired, though the natural release is the full set as one PR.

- **Sub-phase A — Foundation** (sections 1–3): expand the Git plumbing wrapper, add new path helpers, add tree-SHA extraction model.
- **Sub-phase B — Migration + Publish Rewrite** (sections 4–5): convert old layout to bare repos; rewrite publish to use plumbing.
- **Sub-phase C — Team Sharing** (sections 6–9): remote management + push/fetch/clone.
- **Sub-phase D — Discovery** (sections 10–11): catalog support + search by scope.
- **Sub-phase E — History Affordances** (section 12): real Git log + diff.
- **Sub-phase F — Maintenance** (section 13): GC + verify + outdated --fetch.
- **Sub-phase G — Final Verification** (section 14).

Order rationale: foundation enables everything else; migration must precede commands that operate on bare repos; team sharing commands depend on remote management; discovery and history can land in any order after the foundation; maintenance is last because it depends on everything.

---

## Sub-Phase A: Foundation

### Task 1: Expand the Git plumbing wrapper

**Files:**
- Rename or expand: `cli/core/card-git.ts` → `cli/core/git.ts` (or `cli/core/git/index.ts`)

Promote the Phase 1 `card-git.ts` to a general-purpose wrapper. Move `resolveGitRefToCommit`, `downloadGitArchive`, `extractGitArchive` into the new module. Add the Phase 2 primitives:

```typescript
// cli/core/git.ts

export class GitError extends Error { /* unchanged from Phase 1 */ }

// Phase 1 primitives (moved):
export async function resolveGitRefToCommit(agentsDir: string, url: string, ref: string): Promise<string>;
export async function downloadGitArchive(agentsDir: string, url: string, commit: string): Promise<string>;
export async function extractGitArchive(archivePath: string, targetDir: string): Promise<void>;

// New in Phase 2:

/** Initialize a bare repository at the given path. Idempotent. */
export async function initBare(path: string): Promise<void>;

/** Clone a remote URL into a local bare repo. */
export async function cloneBare(url: string, targetPath: string, opts?: { depth?: number }): Promise<void>;

/** Run a git command in a specific repo. Lower-level escape hatch. */
export async function runGit(args: string[], opts?: { cwd?: string; env?: Record<string, string> }): Promise<GitRunResult>;

/** Run `git -C <repoPath> ...`. */
export async function runInRepo(repoPath: string, args: string[]): Promise<GitRunResult>;

/** git config get/set within a repo. */
export async function configGet(repoPath: string, key: string): Promise<string | null>;
export async function configSet(repoPath: string, key: string, value: string): Promise<void>;

/** Remote management. */
export async function remoteAdd(repoPath: string, name: string, url: string): Promise<void>;
export async function remoteSet(repoPath: string, name: string, url: string): Promise<void>;
export async function remoteRemove(repoPath: string, name: string): Promise<void>;
export async function remoteList(repoPath: string): Promise<Array<{ name: string; url: string }>>;

/** Fetch + push. */
export async function fetch(repoPath: string, remote: string, refspecs?: string[]): Promise<void>;
export async function push(repoPath: string, remote: string, refs: string[]): Promise<void>;

/** Object plumbing. */
export async function revParse(repoPath: string, ref: string): Promise<string>;
export async function catFileType(repoPath: string, sha: string): Promise<string>;
export async function getCommitTree(repoPath: string, commitSha: string): Promise<string>;

/** Plumbing for committing content into a bare repo without a working tree. */
export async function writeTreeFromDir(repoPath: string, sourceDir: string): Promise<string>;
export async function commitTree(
  repoPath: string,
  treeSha: string,
  parentSha: string | null,
  message: string,
  author?: { name: string; email: string },
): Promise<string>;
export async function updateRef(repoPath: string, ref: string, sha: string): Promise<void>;
export async function createAnnotatedTag(
  repoPath: string,
  tag: string,
  sha: string,
  message: string,
): Promise<void>;
export async function listTags(repoPath: string): Promise<string[]>;

/** Extract a tree to a target directory using `git archive`. */
export async function extractTreeToDir(repoPath: string, treeSha: string, targetDir: string): Promise<void>;

/** Inspection. */
export async function log(repoPath: string, opts?: { ref?: string; maxCount?: number }): Promise<GitCommitInfo[]>;
export async function diff(repoPath: string, refA: string, refB: string): Promise<string>;

/** Health. */
export async function fsck(repoPath: string): Promise<void>;
export async function gc(repoPath: string, opts?: { aggressive?: boolean }): Promise<void>;
```

The wrapper is implemented entirely in terms of `Bun.spawn` shell-outs. Each function builds the argv, runs git, parses output, raises `GitError` on non-zero exit.

### Task 2: Test the Git plumbing wrapper

**Files:**
- Create: `test/core-git.test.ts`

Comprehensive unit tests using local file:// repos. Cover:
- `initBare` creates a valid bare repo.
- `writeTreeFromDir` + `commitTree` + `createAnnotatedTag` produces a commit reachable via `revParse`.
- `cloneBare` from a local file:// source creates a working bare repo.
- `fetch` brings in new tags after the source commits new content.
- `push` against a local file:// target adds tags to that target.
- `remoteAdd`/`remoteList`/`remoteRemove` round-trip.
- `extractTreeToDir` produces identical content to the original source.
- `log` returns commits in reverse chronological order.
- `diff` produces unified diff output between two tags.

### Task 3: Add Phase 2 path helpers

**Files:**
- Modify: `cli/core/store-paths.ts`

```typescript
// cli/core/store-paths.ts

/** Path to a bare repo for a card. */
export function resolveCardBareRepoPath(agentsDir: string, cardName: string): string {
  const parts = splitCardName(cardName);
  return join(resolveCardsRoot(agentsDir), ...parts.slice(0, -1), `${parts[parts.length - 1]}.git`);
}

/** Path to an extracted tree by tree SHA. */
export function resolveExtractedPath(agentsDir: string, treeSha: string): string {
  validateTreeSha(treeSha);
  return join(resolveStoreRoot(agentsDir), "extracted", treeSha);
}

/** Path to the catalogs directory. */
export function resolveCatalogsDir(agentsDir: string): string {
  return join(resolveStoreRoot(agentsDir), "catalogs");
}

/** Path to a specific cloned catalog. */
export function resolveCatalogPath(agentsDir: string, url: string): string {
  return join(resolveCatalogsDir(agentsDir), slugifyUrl(url));
}

/** Path to the catalog index. */
export function resolveCatalogsIndexPath(agentsDir: string): string {
  return join(resolveStoreRoot(agentsDir), "catalogs.json");
}

function validateTreeSha(sha: string): void {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`invalid tree sha: ${sha}`);
}

function slugifyUrl(url: string): string {
  // Convert "https://github.com/team/repo.git" → "github.com_team_repo"
  return url
    .replace(/^.*?:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/[/:]/g, "_")
    .toLowerCase();
}
```

### Task 4: Test path helpers + commit foundation

```bash
bun test test/core-git.test.ts test/core-cache-paths.test.ts
bun run typecheck

git add cli/core/git.ts cli/core/store-paths.ts test/core-git.test.ts
git commit -m "[feat:git] expand git plumbing wrapper; add bare-repo + catalog paths"
```

---

## Sub-Phase B: Migration + Publish Rewrite

### Task 5: Implement the migration command

**Files:**
- Create: `cli/commands/store/migrate.ts` (or `cli/commands/store/migrate-to-git.ts`)

```typescript
// cli/commands/store/migrate.ts

export class MigrateToGitCommand extends Command {
  static paths = [["store", "migrate-to-git"]];

  dryRun = Option.Boolean("--dry-run", false);
  removeOld = Option.Boolean("--remove-old", false);
  json = Option.Boolean("--json", false);

  async execute(): Promise<number> {
    const ctx = await getContext();
    const result = await migrateCardsToGit(ctx.agentsDir, {
      dryRun: this.dryRun,
      removeOld: this.removeOld,
    });
    // Report what migrated, what was skipped, what errored
    // Return 0 on full success, 1 on partial failure
  }
}

interface MigrationResult {
  migrated: string[];      // card names that became bare repos
  skipped: string[];        // already bare repos
  errored: Array<{ name: string; error: string }>;
}

async function migrateCardsToGit(
  agentsDir: string,
  opts: { dryRun: boolean; removeOld: boolean },
): Promise<MigrationResult> {
  const cardsRoot = resolveCardsRoot(agentsDir);
  if (!existsSync(cardsRoot)) {
    return { migrated: [], skipped: [], errored: [] };
  }

  const result: MigrationResult = { migrated: [], skipped: [], errored: [] };

  for (const cardEntry of await enumerateCards(cardsRoot)) {
    if (cardEntry.path.endsWith(".git")) {
      result.skipped.push(cardEntry.name);
      continue;
    }
    try {
      await migrateOneCard(agentsDir, cardEntry, opts);
      result.migrated.push(cardEntry.name);
    } catch (e) {
      result.errored.push({ name: cardEntry.name, error: (e as Error).message });
    }
  }

  return result;
}

async function migrateOneCard(
  agentsDir: string,
  cardEntry: { name: string; path: string },
  opts: { dryRun: boolean; removeOld: boolean },
): Promise<void> {
  const versions = await listVersionsInCardDir(cardEntry.path);
  if (versions.length === 0) return;

  const barePath = resolveCardBareRepoPath(agentsDir, cardEntry.name);
  const tempBarePath = `${barePath}.tmp.${randomId()}`;

  if (opts.dryRun) {
    console.log(`Would migrate ${cardEntry.name} (${versions.length} versions) → ${barePath}`);
    return;
  }

  // Initialize temp bare repo
  await git.initBare(tempBarePath);
  await git.configSet(tempBarePath, "drwn.cardName", cardEntry.name);

  // Sort versions chronologically (use publish date from versions.json if available)
  const sortedVersions = await sortVersionsChronologically(cardEntry.path, versions);

  // For each version, create a commit + tag
  let parentCommit: string | null = null;
  for (const version of sortedVersions) {
    const versionDir = join(cardEntry.path, version.version);

    // Compute tree SHA from the version directory
    const treeSha = await git.writeTreeFromDir(tempBarePath, versionDir);

    // Create commit with author from publish metadata
    const message = `Publish ${cardEntry.name}@${version.version}\n\nintegrity: ${version.integrity}\npublishedAt: ${version.publishedAt}`;
    const commitSha = await git.commitTree(
      tempBarePath,
      treeSha,
      parentCommit,
      message,
      { name: "drwn-migration", email: "migration@drwn.local" },
    );

    // Update main and create annotated tag
    await git.updateRef(tempBarePath, "refs/heads/main", commitSha);
    await git.createAnnotatedTag(tempBarePath, `v${version.version}`, commitSha, message);

    // Extract to content-addressed cache
    const extractedDir = resolveExtractedPath(agentsDir, treeSha);
    if (!existsSync(extractedDir)) {
      const tempExtract = `${extractedDir}.tmp.${randomId()}`;
      await git.extractTreeToDir(tempBarePath, treeSha, tempExtract);
      await rename(tempExtract, extractedDir);
    }

    // Verify integrity matches what was recorded
    const actualIntegrity = await computeCardIntegrity(extractedDir);
    if (actualIntegrity !== version.integrity) {
      throw new Error(
        `migration produced different content for ${cardEntry.name}@${version.version}: ` +
        `expected ${version.integrity}, got ${actualIntegrity}`,
      );
    }

    parentCommit = commitSha;
  }

  // Atomic rename: temp.git → name.git
  await rename(tempBarePath, barePath);

  // Handle the old directory
  if (opts.removeOld) {
    await rm(cardEntry.path, { recursive: true });
  } else {
    await rename(cardEntry.path, `${cardEntry.path}.legacy`);
  }
}
```

### Task 6: Test migration

**Files:**
- Create: `test/commands-store-migrate.test.ts`

Cover:
- Migration of a card with one version produces a bare repo with one tagged commit.
- Migration of a card with multiple versions produces commits in chronological order.
- Integrity verification: if a card's content has been tampered with, migration errors out and reports the affected card.
- `--dry-run` reports without modifying.
- `--remove-old` removes the legacy directory; without it, the directory is renamed to `.legacy`.
- Re-running migration is idempotent (skips already-migrated cards).
- Interrupted migration leaves no half-migrated state (temp dirs cleaned up on next run).
- Lockfile entries with paths pointing into the old layout get auto-redirected on next `drwn apply`.

### Task 7: Update apply / install to handle new paths

**Files:**
- Modify: `cli/commands/apply.ts`, `cli/commands/install.ts`, `cli/core/sync.ts`

When materializing, if a lockfile's `path` field doesn't exist, attempt re-extraction:

```typescript
async function ensureCardContent(agentsDir: string, entry: CardLockEntry): Promise<string> {
  // 1. If the recorded path exists, use it (existing behavior)
  if (entry.path && existsSync(entry.path)) {
    return entry.path;
  }

  // 2. Try to re-extract from bare repo (Phase 2 case)
  if (entry.origin === "store" && entry.git?.commit) {
    const treeSha = await git.getCommitTree(
      resolveCardBareRepoPath(agentsDir, entry.name),
      entry.git.commit,
    );
    const extractedDir = resolveExtractedPath(agentsDir, treeSha);
    if (!existsSync(extractedDir)) {
      const tempDir = `${extractedDir}.tmp.${randomId()}`;
      await git.extractTreeToDir(
        resolveCardBareRepoPath(agentsDir, entry.name),
        treeSha,
        tempDir,
      );
      await rename(tempDir, extractedDir);
    }
    return extractedDir;
  }

  // 3. Phase 1 cache path (origin: "git", pre-Phase-3)
  if (entry.origin === "git" && entry.git?.commit) {
    const cachePath = resolveCacheExtractedPath(agentsDir, entry.git.commit);
    if (existsSync(cachePath)) return cachePath;
    // re-fetch via Phase 1 path
    return await refetchGitCard(agentsDir, entry);
  }

  throw new Error(`cannot locate content for ${entry.name}@${entry.version}`);
}
```

### Task 8: Rewrite `drwn card publish`

**Files:**
- Modify: `cli/commands/card/publish.ts`, `cli/core/card-store.ts` (the `publishCard` function)

```typescript
// cli/core/card-store.ts (rewritten publishCard)

export async function publishCard(
  agentsDir: string,
  name: string,
  opts?: { bump?: "patch" | "minor" | "major"; version?: string },
): Promise<PublishResult> {
  // 1. Read source manifest
  const sourceDir = resolveCardSourceDir(agentsDir, name);
  const sourceManifest = await readCardSourceManifest(agentsDir, name);

  // 2. Determine target version
  const targetVersion = opts?.version ?? bumpVersion(sourceManifest.version, opts?.bump ?? "patch");

  // 3. Validate skills directories exist
  await validateSkillsInSource(sourceDir, sourceManifest);

  // 4. Ensure bare repo exists
  const barePath = resolveCardBareRepoPath(agentsDir, name);
  if (!existsSync(barePath)) {
    await git.initBare(barePath);
    await git.configSet(barePath, "drwn.cardName", name);
  }

  // 5. Refuse if tag already exists
  const existingTags = await git.listTags(barePath);
  if (existingTags.includes(`v${targetVersion}`)) {
    throw new Error(`version ${targetVersion} already published for ${name}`);
  }

  // 6. Update source manifest with new version, then write-tree
  const updatedManifest = { ...sourceManifest, version: targetVersion };
  await writeCardSourceManifest(sourceDir, updatedManifest);

  const treeSha = await git.writeTreeFromDir(barePath, sourceDir);

  // 7. Determine parent commit (current main, if any)
  let parentCommit: string | null = null;
  try {
    parentCommit = await git.revParse(barePath, "refs/heads/main");
  } catch {
    // No main yet — this is the first publish
  }

  // 8. Create commit + tag
  const integrity = await computeIntegrityOverDir(sourceDir);
  const message = `Publish ${name}@${targetVersion}\n\nintegrity: ${integrity}`;
  const commitSha = await git.commitTree(barePath, treeSha, parentCommit, message);
  await git.updateRef(barePath, "refs/heads/main", commitSha);
  await git.createAnnotatedTag(barePath, `v${targetVersion}`, commitSha, message);

  // 9. Extract to content-addressed cache
  const extractedDir = resolveExtractedPath(agentsDir, treeSha);
  if (!existsSync(extractedDir)) {
    const tempDir = `${extractedDir}.tmp.${randomId()}`;
    await git.extractTreeToDir(barePath, treeSha, tempDir);
    await rename(tempDir, extractedDir);
  }

  return {
    name,
    version: targetVersion,
    versionDir: extractedDir,
    integrity,
    manifest: updatedManifest,
    commitSha,
    treeSha,
  };
}
```

### Task 9: Update tests for the new publish flow

Most existing publish tests should pass after `publishCardWithSkills` is updated to use the new internal flow. Inspect `test/helpers.ts` and update.

```bash
bun test test/commands-card-author.test.ts
bun test test/scenarios-card-materialization.test.ts
bun test
bun run typecheck

git add cli/commands/store/migrate.ts cli/commands/card/publish.ts cli/core/card-store.ts cli/commands/apply.ts cli/commands/install.ts cli/core/sync.ts test/commands-store-migrate.test.ts
git commit -m "[feat:publish] rewrite publish with Git plumbing; add migration tool"
```

---

## Sub-Phase C: Team Sharing Commands

### Task 10: `drwn card remote` namespace

**Files:**
- Create: `cli/commands/card/remote/add.ts`, `remove.ts`, `set.ts`, `list.ts`

Each is a thin Clipanion command wrapping the `git.ts` remote helpers:

```typescript
// cli/commands/card/remote/add.ts

export class CardRemoteAddCommand extends Command {
  static paths = [["card", "remote", "add"]];

  cardName = Option.String();
  url = Option.String();
  remoteName = Option.String("--name", "origin");

  async execute(): Promise<number> {
    const ctx = await getContext();
    const barePath = resolveCardBareRepoPath(ctx.agentsDir, this.cardName);

    if (!existsSync(barePath)) {
      this.context.stderr.write(`Card not in local store: ${this.cardName}\n`);
      this.context.stderr.write(`Hint: \`drwn card clone ${this.url} --as ${this.cardName}\` first.\n`);
      return 1;
    }

    await git.remoteAdd(barePath, this.remoteName, this.url);
    this.context.stdout.write(`Added remote ${this.remoteName} → ${this.url} for ${this.cardName}\n`);
    return 0;
  }
}
```

Similar shapes for `remove`, `set`, `list`. Test in `test/commands-card-remote.test.ts`.

### Task 11: `drwn card push`

**Files:**
- Create: `cli/commands/card/push.ts`

```typescript
export class CardPushCommand extends Command {
  static paths = [["card", "push"]];

  cardName = Option.String();
  remoteName = Option.String("--remote", "origin");
  tagsOnly = Option.Boolean("--tags-only", false);

  async execute(): Promise<number> {
    const ctx = await getContext();
    const barePath = resolveCardBareRepoPath(ctx.agentsDir, this.cardName);

    if (!existsSync(barePath)) {
      this.context.stderr.write(`Card not in local store: ${this.cardName}\n`);
      return 1;
    }

    const remotes = await git.remoteList(barePath);
    const remote = remotes.find(r => r.name === this.remoteName);
    if (!remote) {
      this.context.stderr.write(
        `No remote ${this.remoteName} configured for ${this.cardName}.\n` +
        `Run \`drwn card remote add ${this.cardName} <url>\` first.\n`,
      );
      return 1;
    }

    const refsToPush = this.tagsOnly
      ? ["--tags"]
      : ["main", "--tags"];

    try {
      await git.push(barePath, this.remoteName, refsToPush);
    } catch (e) {
      const err = translateGitError(e as Error, this.cardName);
      this.context.stderr.write(err + "\n");
      return 1;
    }

    this.context.stdout.write(
      `Pushed ${this.cardName} to ${this.remoteName} (${remote.url})\n`,
    );
    return 0;
  }
}
```

Test in `test/commands-card-push.test.ts` using a local file:// target.

### Task 12: `drwn card fetch`

**Files:**
- Create: `cli/commands/card/fetch.ts`

```typescript
export class CardFetchCommand extends Command {
  static paths = [["card", "fetch"]];

  cardName = Option.String();
  remoteName = Option.String("--remote", "origin");

  async execute(): Promise<number> {
    const ctx = await getContext();
    const barePath = resolveCardBareRepoPath(ctx.agentsDir, this.cardName);

    if (!existsSync(barePath)) {
      this.context.stderr.write(`Card not in local store: ${this.cardName}\n`);
      return 1;
    }

    try {
      await git.fetch(barePath, this.remoteName, ["--tags"]);
    } catch (e) {
      const err = translateGitError(e as Error, this.cardName);
      this.context.stderr.write(err + "\n");
      return 1;
    }

    this.context.stdout.write(`Fetched ${this.cardName} from ${this.remoteName}\n`);
    return 0;
  }
}
```

Test in `test/commands-card-fetch.test.ts`.

### Task 13: `drwn card clone`

**Files:**
- Create: `cli/commands/card/clone.ts`

```typescript
export class CardCloneCommand extends Command {
  static paths = [["card", "clone"]];

  url = Option.String();
  asName = Option.String("--as", { required: false });

  async execute(): Promise<number> {
    const ctx = await getContext();

    // If no --as, discover the card name from the remote
    let cardName: string;
    if (this.asName) {
      cardName = this.asName;
    } else {
      cardName = await discoverCardNameFromRemote(this.url);
    }

    const barePath = resolveCardBareRepoPath(ctx.agentsDir, cardName);
    if (existsSync(barePath)) {
      this.context.stderr.write(
        `Card ${cardName} already in local store.\n` +
        `Use \`drwn card fetch ${cardName}\` to update.\n`,
      );
      return 1;
    }

    await git.cloneBare(this.url, barePath);
    await git.configSet(barePath, "drwn.cardName", cardName);

    this.context.stdout.write(`Cloned ${cardName} from ${this.url}\n`);
    return 0;
  }
}

async function discoverCardNameFromRemote(url: string): Promise<string> {
  // Shallow clone to a temp dir, read card.json
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-discover-"));
  try {
    await git.cloneBare(url, tempDir, { depth: 1 });
    const manifestContent = await git.runInRepo(tempDir, ["show", "HEAD:card.json"]);
    const manifest = JSON.parse(manifestContent.stdout);
    return manifest.name;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
```

Test in `test/commands-card-clone.test.ts`.

### Task 14: Upgrade `drwn install` for bare repos

**Files:**
- Modify: `cli/commands/install.ts`

```typescript
async function ensureCardPresent(agentsDir: string, entry: CardLockEntry): Promise<void> {
  switch (entry.origin) {
    case "store":
      // Phase 2: ensure bare repo + extraction exist
      const barePath = resolveCardBareRepoPath(agentsDir, entry.name);
      if (!existsSync(barePath)) {
        // No URL → can't bootstrap (this would be an inconsistent lockfile)
        throw new Error(
          `bare repo missing for ${entry.name}; lockfile may be from before migration`,
        );
      }
      // Extract if not already
      // ... (see Task 7 logic)
      return;

    case "git":
      // Phase 1 path: archive cache
      // ... existing Phase 1 logic ...
      return;

    case "file":
    case "npm":
      // ... existing logic ...
      return;
  }
}
```

### Task 15: Test the team-sharing flow end-to-end

**Files:**
- Create: `test/scenarios-team-workflow.test.ts`

```typescript
describe("end-to-end team workflow", () => {
  test("author publishes; teammate fetches and installs", async () => {
    // Setup: a "remote" bare repo at a file:// URL
    const remoteRepoDir = await mkdtemp(/* ... */);
    const remoteUrl = `file://${remoteRepoDir}`;

    // Author side
    const authorFixture = await scaffoldCliFixture();
    await authorFixture.runCli(["card", "source", "new", "@team/baseline"]);
    // ... add skills, manifest ...
    await authorFixture.runCli(["card", "publish", "@team/baseline", "--version", "1.0.0"]);
    await authorFixture.runCli(["card", "remote", "add", "@team/baseline", remoteUrl]);
    await authorFixture.runCli(["card", "push", "@team/baseline"]);

    // Teammate side (separate fixture)
    const teammateFixture = await scaffoldCliFixture();
    await teammateFixture.runCli(["card", "clone", remoteUrl]);
    await teammateFixture.runCli(["init"]);
    await teammateFixture.runCli(["add", "@team/baseline@^1.0.0"]);
    await teammateFixture.runCli(["apply"]);

    // Verify materialization happened correctly
    // ...
  });
});
```

### Task 16: Commit team-sharing block

```bash
bun test
bun run typecheck

git add cli/commands/card/remote/ cli/commands/card/push.ts cli/commands/card/fetch.ts cli/commands/card/clone.ts cli/commands/install.ts cli/index.ts test/commands-card-*.test.ts test/scenarios-team-workflow.test.ts
git commit -m "[feat:share] add card remote/push/fetch/clone for team workflow"
```

---

## Sub-Phase D: Discovery — Catalogs

### Task 17: Catalog data model

**Files:**
- Create: `cli/core/card-catalog.ts`

```typescript
// cli/core/card-catalog.ts

export interface CatalogManifest {
  catalogVersion: 1;
  scope: string;
  description?: string;
  cards: Array<{
    name: string;
    url: string;
    description?: string;
    tags?: string[];
  }>;
  maintainers?: Array<{ name: string; email?: string }>;
}

export interface CatalogIndexEntry {
  url: string;
  scope: string;
  lastFetched: string;
  cardCount: number;
}

export interface CatalogsIndex {
  catalogsVersion: 1;
  catalogs: CatalogIndexEntry[];
}

export async function loadCatalog(agentsDir: string, url: string): Promise<CatalogManifest>;
export async function saveCatalogIndex(agentsDir: string, index: CatalogsIndex): Promise<void>;
export async function loadCatalogIndex(agentsDir: string): Promise<CatalogsIndex>;
export async function addCatalog(agentsDir: string, url: string): Promise<CatalogIndexEntry>;
export async function removeCatalog(agentsDir: string, scopeOrUrl: string): Promise<void>;
export async function refreshCatalog(agentsDir: string, scope?: string): Promise<void>;
```

### Task 18: Catalog commands

**Files:**
- Create: `cli/commands/library/catalog/add.ts`, `remove.ts`, `list.ts`, `refresh.ts`

Each command wraps the catalog core functions. Test in `test/commands-library-catalog.test.ts`.

### Task 19: `drwn search card`

**Files:**
- Create: `cli/commands/search/card.ts`

```typescript
export class SearchCardCommand extends Command {
  static paths = [["search", "card"]];

  query = Option.String({ required: false });
  scope = Option.String("--scope", { required: false });
  json = Option.Boolean("--json", false);

  async execute(): Promise<number> {
    const ctx = await getContext();
    const index = await loadCatalogIndex(ctx.agentsDir);

    const results: Array<{ scope: string; name: string; url: string; description?: string }> = [];

    for (const catalogEntry of index.catalogs) {
      if (this.scope && catalogEntry.scope !== this.scope) continue;
      const catalog = await loadCatalog(ctx.agentsDir, catalogEntry.url);
      for (const card of catalog.cards) {
        if (this.query && !cardMatchesQuery(card, this.query)) continue;
        results.push({
          scope: catalog.scope,
          name: card.name,
          url: card.url,
          description: card.description,
        });
      }
    }

    if (this.json) {
      this.context.stdout.write(JSON.stringify(results, null, 2));
    } else {
      for (const r of results) {
        this.context.stdout.write(`${r.scope}/${r.name}\t${r.url}\n`);
      }
    }
    return 0;
  }
}
```

Test in `test/commands-search-card.test.ts`.

### Task 20: Commit discovery block

```bash
git add cli/core/card-catalog.ts cli/commands/library/catalog/ cli/commands/search/card.ts cli/index.ts test/commands-library-catalog.test.ts test/commands-search-card.test.ts
git commit -m "[feat:catalog] add catalog support and drwn search card"
```

---

## Sub-Phase E: History Affordances

### Task 21: Upgrade `drwn card show`

**Files:**
- Modify: `cli/commands/card/show.ts`

Add Git log + remote info to the output:

```typescript
// Inside show command's execute, after current manifest output:

const barePath = resolveCardBareRepoPath(ctx.agentsDir, cardName);
if (existsSync(barePath)) {
  const remotes = await git.remoteList(barePath);
  const commits = await git.log(barePath, { maxCount: 5 });

  this.context.stdout.write(`\nBare repo: ${barePath}\n`);
  if (remotes.length > 0) {
    this.context.stdout.write(`Remotes:\n`);
    for (const r of remotes) {
      this.context.stdout.write(`  ${r.name} → ${r.url}\n`);
    }
  }
  this.context.stdout.write(`\nRecent history:\n`);
  for (const c of commits) {
    this.context.stdout.write(`  ${c.sha.slice(0, 7)} ${c.date} ${c.subject}\n`);
  }
}
```

### Task 22: Upgrade `drwn card diff`

**Files:**
- Modify: `cli/commands/card/diff.ts`

```typescript
// Inside diff command's execute:

const barePath = resolveCardBareRepoPath(ctx.agentsDir, parsedA.name);
if (!existsSync(barePath)) {
  this.context.stderr.write(`Card ${parsedA.name} not in local store.\n`);
  return 1;
}

const refA = `v${parsedA.version}`;
const refB = `v${parsedB.version}`;
const diff = await git.diff(barePath, refA, refB);
this.context.stdout.write(diff);
return 0;
```

### Task 23: Test history affordances

**Files:**
- Modify: `test/commands-card-author.test.ts` (or create `test/commands-card-show-history.test.ts`)

```typescript
test("drwn card show includes Git log after publish", async () => {
  // ... publish a card with two versions ...
  const result = await fixture.runCli(["card", "show", "@team/baseline@1.1.0"]);
  expect(result.stdout).toMatch(/Recent history/);
  expect(result.stdout).toMatch(/v1\.0\.0/);
  expect(result.stdout).toMatch(/v1\.1\.0/);
});

test("drwn card diff produces a real Git diff", async () => {
  // ... publish two versions ...
  const result = await fixture.runCli(["card", "diff", "@team/baseline@1.0.0", "@team/baseline@1.1.0"]);
  expect(result.stdout).toMatch(/^diff --git/m);
});
```

### Task 24: Commit history block

```bash
git add cli/commands/card/show.ts cli/commands/card/diff.ts test/commands-card-*.test.ts
git commit -m "[feat:history] surface Git history in card show and diff"
```

---

## Sub-Phase F: Maintenance

### Task 25: `drwn store gc`

**Files:**
- Create: `cli/commands/store/gc.ts`

```typescript
export class StoreGcCommand extends Command {
  static paths = [["store", "gc"]];

  dryRun = Option.Boolean("--dry-run", false);
  projects = Option.Array("--projects", { required: false });
  json = Option.Boolean("--json", false);

  async execute(): Promise<number> {
    const ctx = await getContext();

    // 1. Collect live tree SHAs from all known project lockfiles
    const liveTreeShas = new Set<string>();
    const projectPaths = this.projects ?? (await discoverProjects(ctx.agentsDir));
    for (const projectPath of projectPaths) {
      const lock = await loadCardLock(projectPath);
      if (!lock) continue;
      for (const card of lock.cards) {
        if (card.origin === "store" && card.git?.commit) {
          const treeSha = await git.getCommitTree(
            resolveCardBareRepoPath(ctx.agentsDir, card.name),
            card.git.commit,
          );
          liveTreeShas.add(treeSha);
        }
      }
    }

    // 2. Sweep ~/.agents/drwn/extracted/
    const extractedRoot = join(resolveStoreRoot(ctx.agentsDir), "extracted");
    const removed: string[] = [];
    if (existsSync(extractedRoot)) {
      for (const entry of await readdir(extractedRoot)) {
        if (!/^[a-f0-9]{40}$/.test(entry)) continue;
        if (!liveTreeShas.has(entry)) {
          if (!this.dryRun) await rm(join(extractedRoot, entry), { recursive: true });
          removed.push(entry);
        }
      }
    }

    // 3. (Optionally) sweep Phase 1 cache/ too
    // ... similar logic for cache/extracted/ and cache/git-archives/ ...

    // Report
    if (this.json) {
      this.context.stdout.write(JSON.stringify({ removed, dryRun: this.dryRun }, null, 2));
    } else {
      this.context.stdout.write(`Removed ${removed.length} unreferenced extraction(s).\n`);
    }
    return 0;
  }
}
```

### Task 26: `drwn store verify`

**Files:**
- Create: `cli/commands/store/verify.ts`

For each card bare repo:
- `git fsck` to check object integrity.
- For each tag, extract its tree and verify the recorded integrity hash matches.

### Task 27: `drwn outdated --fetch`

**Files:**
- Modify: `cli/commands/outdated.ts`

Add the `--fetch` flag. When set, run `git fetch` against each card's `origin` remote (parallel with bounded concurrency) before comparing tags.

### Task 28: Test maintenance commands

**Files:**
- Create: `test/commands-store-gc.test.ts`, `test/commands-store-verify.test.ts`, `test/commands-outdated-fetch.test.ts`

### Task 29: Commit maintenance block

```bash
git add cli/commands/store/gc.ts cli/commands/store/verify.ts cli/commands/outdated.ts cli/index.ts test/commands-store-*.test.ts test/commands-outdated-fetch.test.ts
git commit -m "[feat:maint] add store gc, verify, and outdated --fetch"
```

---

## Sub-Phase G: Final Verification

### Task 30: Full test suite

```bash
bun test
```

Expected: all green; zero new failures; all Phase 1 + Phase 0 tests still pass.

### Task 31: Typecheck and release readiness

```bash
bun run typecheck
bun run verify:release --json
```

### Task 32: End-to-end smoke test

Manual smoke test exercising the full team workflow:

```bash
# Setup: a "team-hosted" bare repo at file://
mkdir -p /tmp/team-baseline
git init --bare /tmp/team-baseline/baseline-card.git

# Author side
drwn card source new @team/baseline
# ... edit content ...
drwn card publish @team/baseline --version 1.0.0
drwn card remote add @team/baseline file:///tmp/team-baseline/baseline-card.git
drwn card push @team/baseline

# Teammate side (separate machine simulation: clear ~/.agents/drwn and re-set)
drwn card clone file:///tmp/team-baseline/baseline-card.git
cd /tmp/teammate-project
drwn init
drwn add @team/baseline@^1.0.0
drwn apply
drwn status   # should show @team/baseline materialized

# Author publishes update
cd ~/.agents/drwn/sources/@team/baseline
# ... edit ...
drwn card publish @team/baseline --bump minor
drwn card push @team/baseline

# Teammate updates
cd /tmp/teammate-project
drwn card fetch @team/baseline
drwn outdated   # should show v1.1.0 available
drwn pin @team/baseline@1.1.0
drwn apply
```

### Task 33: Migration smoke test

Simulate migration from a Phase 1 setup:

```bash
# Pre-Phase-2 setup with old layout
mkdir -p ~/.agents/drwn/cards/@me/foo/1.0.0
# ... populate with card content ...

drwn store migrate-to-git --dry-run    # report
drwn store migrate-to-git              # actually migrate
ls ~/.agents/drwn/cards/@me/           # should show foo.git (and foo.legacy)
drwn card show @me/foo@1.0.0           # should show Git log
```

### Task 34: Push, commit, PR

```bash
git push -u origin remyjkim/git-distribution-phase-2
gh pr create --title "[feat:git] Phase 2 — per-card bare repos + team sharing" --body "..."
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Migration corrupts existing card content | Migration verifies integrity hashes after each version; errors out on mismatch; preserves old directories as `.legacy/` |
| Performance regression for users with many cards | Benchmark `drwn apply` against a Phase 1 baseline; if slow, profile and optimize |
| Atomicity of multi-tag pushes | `git push origin main --tags` is one operation; either all refs go or none |
| Bun.spawn calls accumulate (many sub-processes) | Wrap repeatedly-called primitives like `revParse` in batched variants where helpful |
| Catalog auth (private catalog repos) | Catalogs use Git URLs; auth is Git's credential helper |
| `git fsck` is slow on large repos | `drwn store verify` is opt-in; not run during `drwn apply` |
| Test fixtures using `publishCardWithSkills` break with the new internal flow | Refactor fixture helpers in lockstep with publish rewrite |
| GC removes content needed by an undiscovered project | `gc` only operates on projects in the tracked-projects registry or explicitly passed via `--projects`. Documented prominently. |
| `drwn install` partially fetches before failure | Use temp-dir + atomic-rename for every clone; failed clones leave no `.git/` artifact |
| Phase 1's `cache/` and Phase 2's `extracted/` confusion | Document the dual paths in the operator guide; Phase 3 unifies |
| `drwn card publish` fails midway through commit creation | The bare repo's ref isn't updated until the final step; partial commits leave dangling objects (cleaned by `git gc`) but no broken refs |

---

## Testing Strategy

- **Build-as-test per sub-phase**: each sub-phase ends in a green-test commit.
- **No-network default**: file:// remotes for everything; opt-in real-network integration tests separate.
- **Migration regression**: a v1-layout fixture is migrated and the materialization output is compared byte-for-byte with the pre-migration baseline.
- **Round-trip tests**: publish → push to file:// → clone from file:// → install → apply → verify materialization is identical to original.
- **GC safety**: gc tests use a fixture with both referenced and unreferenced extractions; verify only the latter are removed.

---

## Final Implementation Checklist

- [ ] Branch created.
- [ ] Sub-phase A: foundation (plumbing wrapper + paths) shipped.
- [ ] Sub-phase B: migration + publish rewrite shipped.
- [ ] Sub-phase C: remote/push/fetch/clone shipped.
- [ ] Sub-phase D: catalogs shipped.
- [ ] Sub-phase E: history affordances shipped.
- [ ] Sub-phase F: maintenance commands shipped.
- [ ] Sub-phase G: full verification green.
- [ ] All gates pass.
- [ ] Smoke tests pass manually.
- [ ] PR opened.

---

## Notes

- Phase 2 is the largest of the three Git phases. Plan for 8–14 sessions of work depending on familiarity with Git plumbing.
- The Git plumbing wrapper (`cli/core/git.ts`) becomes a substantial module. Resist the temptation to scatter `Bun.spawn(["git", ...])` calls elsewhere — every Git operation goes through this module.
- Migration is **opt-in and reversible** (via the `.legacy/` directory). This is intentional: users with valuable history in the existing store should never lose it to a migration bug.
- Catalogs are optional. Teams can adopt Phase 2 without catalogs and rely on direct URLs.
- After Phase 2 merges, Phase 3 (task 31) is a smaller follow-up that unifies the two cache paths and adds the polish items deferred here.
