# Task 31: drwn Git Distribution Phase 3 — Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for code-touching tasks where tests are the spec. Do not commit unless explicitly instructed.

**Status**: Ready For T1 Start After Phase 2 Merges
**Created**: 2026-06-01
**Updated**: 2026-06-01
**Assigned**: Unassigned
**Priority**: Medium
**Estimated Effort**: 1 PR (3–5 sessions; smaller than Phases 1 and 2)
**Dependencies**: Task 30 (Phase 2) merged, task 29 (Phase 1) merged, task 28 (rebrand) merged, analyses 47, 48, 49
**References**: [analyses/49_drwn-target-architecture-after-phase-3.md, analyses/48_drwn-target-architecture-after-phase-2.md, analyses/47_drwn-target-architecture-after-phase-1.md, analyses/44_drwn-git-storage-backend-options.md, tasks/30_drwn-git-distribution-phase-2-implementation-plan.md, cli/core/git.ts, cli/core/card-store.ts, cli/core/card-lock.ts]

---

## Objective

Land Phase 3 of the Git-distribution rollout (Design E full per analysis `44_*` §11.F): unify the two parallel storage paths from Phase 2 into a single bare-repo + extracted-tree model. After Phase 3, every card — whether added via `@scope/name@ver` (store-origin) or `git+url#ref` (git-origin) — lives in a local bare repo at `~/.agents/drwn/cards/@scope/name.git/`, with content extracted to `~/.agents/drwn/extracted/<tree-sha>/`.

The target post-merge state is fully specified in analysis 49. This plan describes how to get there. Phase 3 is **internal unification** — no new user-facing commands, no new lockfile fields. Users notice only behavioral improvements (better offline support, Git history available for git-origin cards, faster repeat operations).

---

## Architecture

Phase 3 changes:

1. **Resolver path unification.** `resolveFromGit` (Phase 1) is rewritten to route through bare-repo clone instead of HTTP archive download. The function becomes a thin variant of `resolveFromStore` plus a "first-time discovery" branch.
2. **Card name discovery for Git URLs.** When a `git+url#ref` is first encountered, drwn does a shallow clone to read `card.json` and learn the canonical card name (so it can place the bare repo at the right `cards/@scope/name.git/` path).
3. **URL→name mapping cache.** After first discovery, the mapping is recorded so subsequent operations against the same URL skip the discovery step.
4. **Migration of Phase 1's `~/.agents/drwn/cache/` content** into the bare-repo + tree-SHA model.
5. **Cleanup of the deprecated archive download path.** The `downloadGitArchive` and `extractGitArchive` functions in `cli/core/git.ts` are kept (Phase 1 lockfiles may still reference them) but the resolver no longer calls them. Phase 4 could remove them entirely once all installations are post-migration.

What Phase 3 does NOT change:

- No new commands.
- No new lockfile fields.
- No new materialization mechanisms.
- No registry service.
- No Phase 4 submodule federation.

---

## Tech Stack

Same as Phase 2: Bun, Clipanion 4, `git`, `tar`. No new dependencies.

---

## Success Criteria

### Resolver unification

- [ ] `drwn add git+https://github.com/team-org/baseline.git#v1.3.0` now creates a bare repo at `~/.agents/drwn/cards/@team/baseline.git/` (instead of writing to `~/.agents/drwn/cache/`).
- [ ] First-time resolution against an unknown URL performs a shallow clone to discover the card name, then a full clone for the actual install.
- [ ] Subsequent resolutions against the same URL skip the discovery step (cached URL→name mapping).
- [ ] `~/.agents/drwn/cache/` is empty after Phase 3 migration (or moved to `cache.legacy/` if not removed).

### Lockfile changes

- [ ] Lockfile entries with `origin: "git"` now record `path` pointing into `~/.agents/drwn/extracted/<tree-sha>/` instead of `~/.agents/drwn/cache/extracted/<commit-sha>/`.
- [ ] Existing Phase 1 / Phase 2 lockfiles continue to read correctly.
- [ ] On next mutation, lockfile entries are re-resolved and `path` is updated.

### Migration

- [ ] New `drwn store migrate-to-bare-repos` command (or extension of `drwn store migrate-to-git`) migrates Phase 1's cache.
- [ ] Migration is idempotent and resumable.
- [ ] Migration preserves integrity hashes (errors on mismatch).

### Behavioral improvements (user-observable)

- [ ] `drwn card show git+url#ref` now displays Git history (because there's a local bare repo).
- [ ] `drwn card diff git+url#refA git+url#refB` shows real `git diff`.
- [ ] `drwn card fetch` works for `origin: "git"` cards (refreshes the bare repo from its remote URL).
- [ ] `drwn outdated --fetch` works uniformly for store-origin and git-origin cards.
- [ ] Re-adding a previously-installed `git+url#ref` is fast (no network, no archive re-download).
- [ ] After first install, all subsequent operations against a git-origin card work offline.

### Gates

- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run verify:release --json` passes.

---

## Decisions Locked Before Implementation

| # | Decision | Source |
|---|---|---|
| D1 | `git+url#ref` resolution now clones into a bare repo. No HTTP archive in the new resolver path. | analysis 49 §4 |
| D2 | First-time URL → name discovery uses **shallow clone + read `card.json`**. Cheap, correct. | analysis 49 §4.2 |
| D3 | URL→name mapping is cached in `~/.agents/drwn/url-card-map.json` to skip discovery on repeat. | analysis 49 §12 (#1) |
| D4 | Name collisions across different URLs are **errors**, not silent overwrites. | analysis 49 §12 (#2) |
| D5 | Phase 1's `cache/` is migrated to the unified model via `drwn store migrate-to-bare-repos`. The old cache becomes `cache.legacy/` unless `--remove-old` is passed. | analysis 49 §5 |
| D6 | Phase 1's archive download functions stay in `cli/core/git.ts` for now (read-only support of pre-migration lockfiles); they're marked `@deprecated`. | This plan |
| D7 | No new commands. Phase 3 is pure internal cleanup. | analysis 49 §6 |
| D8 | npm origin (if/when implemented) remains its own resolver path. Not unified into bare repos. | analysis 49 §9 |

---

## Out of Scope

- Phase 4: submodule federation (Design B from `44_*`).
- npm origin via synthetic bare repo (Option N2 from analysis 49 §9; explicitly rejected).
- Registry service.
- Cross-machine sync as a single operation.
- Sparse checkouts.
- Card signing.

---

## Evidence Base

Phase 2's implementation produced:

- `cli/core/git.ts` with full Git plumbing wrappers.
- Bare repos at `~/.agents/drwn/cards/@scope/name.git/`.
- `extracted/<tree-sha>/` content-addressed cache.
- `drwn card remote/push/fetch/clone` commands.
- `discoverCardNameFromRemote` helper (from Phase 2 Task 13).

Phase 3 reuses all of these. The new work is:

- Rewriting `resolveFromGit` (currently uses archive download).
- Adding URL→name mapping cache.
- Adding migration from Phase 1 cache layout.
- Deprecating archive functions in resolver path (keep for read-compat).

---

## Entry Checks

```bash
git status --short --branch
bun test
bun run typecheck
bun run verify:release --json
git log --oneline -10  # confirm Phase 1 + Phase 2 are in base
```

Expected: clean tree, green gates, recent commits showing Phase 2 merge.

Create branch:

```bash
git checkout -b remyjkim/git-distribution-phase-3
```

---

## Implementation Strategy

Four sub-phases, each in a single commit. Smallest of the three Phase plans.

- **Sub-phase A — Unified resolver** (sections 1–3): rewrite `resolveFromGit` to route through bare repos.
- **Sub-phase B — Migration** (sections 4–5): migrate Phase 1 cache content.
- **Sub-phase C — Affordances** (section 6): verify `drwn card show`/`diff`/`fetch` work for git-origin cards.
- **Sub-phase D — Final Verification** (section 7).

---

## Sub-Phase A: Unified Resolver

### Task 1: Add URL→name mapping cache helpers

**Files:**
- Modify: `cli/core/card-catalog.ts` (or create `cli/core/url-card-map.ts`)
- Modify: `cli/core/store-paths.ts`

```typescript
// cli/core/store-paths.ts (addition)

export function resolveUrlCardMapPath(agentsDir: string): string {
  return join(resolveStoreRoot(agentsDir), "url-card-map.json");
}
```

```typescript
// cli/core/url-card-map.ts (new)

interface UrlCardMap {
  version: 1;
  entries: Record<string, { cardName: string; lastSeen: string }>;
}

export async function getCardNameForUrl(agentsDir: string, url: string): Promise<string | null>;
export async function recordUrlCardMapping(agentsDir: string, url: string, cardName: string): Promise<void>;
export async function loadUrlCardMap(agentsDir: string): Promise<UrlCardMap>;
```

### Task 2: Rewrite `resolveFromGit`

**Files:**
- Modify: `cli/core/card-store.ts`

The new `resolveFromGit` goes through bare-repo clone instead of archive download:

```typescript
// cli/core/card-store.ts

async function resolveFromGit(
  agentsDir: string,
  parsed: ParsedCardRef,
): Promise<ResolvedCard> {
  if (!parsed.gitUrl || !parsed.gitRef) {
    throw new Error("internal: parseGitRef returned without gitUrl/gitRef");
  }
  const { gitUrl, gitRef } = parsed;

  // Step 1: discover or look up the card name for this URL
  let cardName = await getCardNameForUrl(agentsDir, gitUrl);
  if (!cardName) {
    cardName = await discoverCardNameFromRemote(gitUrl);
    await recordUrlCardMapping(agentsDir, gitUrl, cardName);
  }

  // Step 2: ensure a bare repo exists at cards/@scope/name.git/
  const barePath = resolveCardBareRepoPath(agentsDir, cardName);
  if (!existsSync(barePath)) {
    await git.cloneBare(gitUrl, barePath);
    await git.configSet(barePath, "drwn.cardName", cardName);
    // The clone sets up `origin` automatically pointing at gitUrl
  } else {
    // Verify the origin matches; if not, this is a name collision
    const remotes = await git.remoteList(barePath);
    const origin = remotes.find(r => r.name === "origin");
    if (origin && origin.url !== gitUrl) {
      throw new Error(
        `Card name collision: ${cardName} is already mapped to ${origin.url}, ` +
        `but trying to add the same name from ${gitUrl}. ` +
        `Use \`drwn card remote set\` if this is intentional.`,
      );
    }
  }

  // Step 3: fetch the ref if not already present locally
  let commit: string;
  try {
    commit = await git.revParse(barePath, gitRef);
  } catch {
    // Ref not locally present; fetch
    await git.fetch(barePath, "origin", [gitRef, `refs/tags/${gitRef}:refs/tags/${gitRef}`]);
    commit = await git.revParse(barePath, gitRef);
  }

  // Step 4: get the tree SHA
  const treeSha = await git.getCommitTree(barePath, commit);

  // Step 5: ensure extraction
  const extractedDir = resolveExtractedPath(agentsDir, treeSha);
  if (!existsSync(extractedDir)) {
    const tempDir = `${extractedDir}.tmp.${Math.random().toString(36).slice(2)}`;
    await git.extractTreeToDir(barePath, treeSha, tempDir);
    await rename(tempDir, extractedDir);
  }

  // Step 6: read manifest + compute integrity
  const manifest = await readManifestFromExtracted(extractedDir);
  assertValidCardManifest(manifest);
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
    git: { url: gitUrl, ref: gitRef, commit },
  };
}
```

Note: `discoverCardNameFromRemote` already exists from Phase 2 (Task 13 of plan 30). Reuse it.

### Task 3: Test the unified resolver

**Files:**
- Create: `test/scenarios-unified-resolution.test.ts`

Cover:
- Adding `git+url#ref` creates a bare repo at `cards/@scope/name.git/`.
- Lockfile entry's `path` points into `extracted/<tree-sha>/` (not `cache/extracted/...`).
- Repeat add hits the local bare repo (no network).
- URL→name mapping is cached; subsequent adds skip the discovery clone.
- Name collision is detected and errored.
- `drwn card show` works on the resulting card (shows Git log).
- `drwn card fetch` works (refreshes the bare repo).

### Task 4: Commit Sub-Phase A

```bash
bun test test/scenarios-unified-resolution.test.ts
bun test
bun run typecheck

git add cli/core/card-store.ts cli/core/url-card-map.ts cli/core/store-paths.ts test/scenarios-unified-resolution.test.ts
git commit -m "[feat:resolver] unify git+url resolver through bare-repo clone"
```

---

## Sub-Phase B: Migration of Phase 1 Cache

### Task 5: Implement migration command

**Files:**
- Create: `cli/commands/store/migrate-to-bare-repos.ts` (or extend `cli/commands/store/migrate.ts`)

```typescript
// cli/commands/store/migrate-to-bare-repos.ts

export class MigrateToBareReposCommand extends Command {
  static paths = [["store", "migrate-to-bare-repos"]];

  dryRun = Option.Boolean("--dry-run", false);
  removeOld = Option.Boolean("--remove-old", false);
  projects = Option.Array("--projects", { required: false });
  json = Option.Boolean("--json", false);

  async execute(): Promise<number> {
    const ctx = await getContext();

    const result = await migrateGitCacheToBareRepos(ctx.agentsDir, {
      dryRun: this.dryRun,
      removeOld: this.removeOld,
      projectPaths: this.projects,
    });

    // Report
    return result.errored.length === 0 ? 0 : 1;
  }
}

interface MigrationResult {
  migrated: Array<{ cardName: string; url: string; commit: string }>;
  orphaned: string[];     // commits in cache with no recoverable URL
  errored: Array<{ commit: string; error: string }>;
}

async function migrateGitCacheToBareRepos(
  agentsDir: string,
  opts: { dryRun: boolean; removeOld: boolean; projectPaths?: string[] },
): Promise<MigrationResult> {
  // 1. Build a map of commit → URL from known lockfiles
  const projectPaths = opts.projectPaths ?? (await discoverProjects(agentsDir));
  const commitToUrl = new Map<string, { url: string; cardName: string }>();
  for (const projectPath of projectPaths) {
    const lock = await loadCardLock(projectPath);
    if (!lock) continue;
    for (const card of lock.cards) {
      if (card.origin === "git" && card.git) {
        commitToUrl.set(card.git.commit, { url: card.git.url, cardName: card.name });
      }
    }
  }

  // 2. Walk cache/extracted/
  const cacheExtractedRoot = resolveCacheExtractedDir(agentsDir);
  const result: MigrationResult = { migrated: [], orphaned: [], errored: [] };

  if (!existsSync(cacheExtractedRoot)) return result;

  for (const entry of await readdir(cacheExtractedRoot)) {
    if (!/^[a-f0-9]{40}$/.test(entry)) continue;
    const commit = entry;
    const cachePath = join(cacheExtractedRoot, commit);

    const mapping = commitToUrl.get(commit);
    if (!mapping) {
      result.orphaned.push(commit);
      continue;
    }

    if (opts.dryRun) {
      // Just report
      result.migrated.push({ cardName: mapping.cardName, url: mapping.url, commit });
      continue;
    }

    try {
      await migrateOneCachedCard(agentsDir, mapping.cardName, mapping.url, commit, cachePath);
      result.migrated.push({ cardName: mapping.cardName, url: mapping.url, commit });
    } catch (e) {
      result.errored.push({ commit, error: (e as Error).message });
    }
  }

  // 3. Clean up cache/
  if (!opts.dryRun) {
    if (opts.removeOld) {
      await rm(resolveCacheRoot(agentsDir), { recursive: true, force: true });
    } else {
      await rename(resolveCacheRoot(agentsDir), resolveCacheRoot(agentsDir) + ".legacy");
    }
  }

  return result;
}

async function migrateOneCachedCard(
  agentsDir: string,
  cardName: string,
  url: string,
  commit: string,
  cachePath: string,
): Promise<void> {
  // Ensure bare repo exists
  const barePath = resolveCardBareRepoPath(agentsDir, cardName);
  if (!existsSync(barePath)) {
    await git.cloneBare(url, barePath);
    await git.configSet(barePath, "drwn.cardName", cardName);
  }

  // Verify the commit is reachable
  try {
    await git.revParse(barePath, commit);
  } catch {
    // Fetch to ensure the commit is present
    await git.fetch(barePath, "origin", ["--tags"]);
    try {
      await git.revParse(barePath, commit);
    } catch {
      throw new Error(`commit ${commit} not reachable from origin (${url})`);
    }
  }

  // Get tree SHA, extract to new location
  const treeSha = await git.getCommitTree(barePath, commit);
  const extractedDir = resolveExtractedPath(agentsDir, treeSha);

  if (!existsSync(extractedDir)) {
    const tempDir = `${extractedDir}.tmp.${Math.random().toString(36).slice(2)}`;
    await git.extractTreeToDir(barePath, treeSha, tempDir);
    await rename(tempDir, extractedDir);
  }

  // Verify integrity matches the cached extraction
  const newIntegrity = await computeCardIntegrity(extractedDir);
  const oldIntegrity = await computeCardIntegrity(cachePath);
  if (newIntegrity !== oldIntegrity) {
    throw new Error(
      `migration produced different content for ${cardName}@${commit}: ` +
      `cached ${oldIntegrity}, bare-repo-extracted ${newIntegrity}`,
    );
  }

  // Record URL→name mapping
  await recordUrlCardMapping(agentsDir, url, cardName);
}
```

### Task 6: Update lockfiles after migration

After migration, project lockfiles still point at `cache/extracted/<commit>/`. They need to be updated to point at `extracted/<tree-sha>/`.

Two options:

- **A. Lazy update**: `drwn apply` / `drwn install` re-resolves cards whose `path` doesn't exist; this naturally rewrites the lockfile to the new path.
- **B. Eager update**: the migration command rewrites all known project lockfiles in place.

Decision: **A (lazy)**. Simpler, lower-risk. The first `drwn apply`/`install` after migration handles the lockfile rewrite.

### Task 7: Test migration

**Files:**
- Create: `test/commands-store-migrate-to-bare-repos.test.ts`

Cover:
- Migration of a Phase 1 cached card produces a bare repo and a new extraction.
- Integrity is verified during migration; mismatches error out.
- Orphaned cache entries (no recoverable URL) are reported.
- `--dry-run` reports without modifying.
- `--remove-old` cleans up; without it, `cache.legacy/` remains.
- Lazy lockfile update: a project with a Phase 1 lockfile applies cleanly after migration; lockfile path is rewritten.

### Task 8: Commit Sub-Phase B

```bash
bun test test/commands-store-migrate-to-bare-repos.test.ts
bun test
bun run typecheck

git add cli/commands/store/migrate-to-bare-repos.ts cli/index.ts test/commands-store-migrate-to-bare-repos.test.ts
git commit -m "[feat:migrate] migrate Phase 1 git cache to bare-repo model"
```

---

## Sub-Phase C: Affordances

### Task 9: Verify `drwn card show` works for git-origin cards

`drwn card show` in Phase 2 already uses the bare repo for Git log. After Phase 3, git-origin cards have bare repos, so the existing code should just work. Verify with a test:

**Files:**
- Modify: `test/commands-card-show.test.ts` (or create scenario test)

```typescript
test("drwn card show shows Git log for git-origin card after Phase 3", async () => {
  const repo = await createLocalCardRepo({
    name: "@team/baseline",
    version: "1.0.0",
  });
  // Tag a second version
  await tagAdditionalVersion(repo, "1.1.0");

  const fixture = await scaffoldCliFixture();
  await fixture.runCli(["add", `git+${repo.url}#v1.1.0`]);

  const result = await fixture.runCli(["card", "show", "@team/baseline@1.1.0"]);
  expect(result.stdout).toMatch(/Recent history/);
  expect(result.stdout).toMatch(/v1\.0\.0/);
  expect(result.stdout).toMatch(/v1\.1\.0/);
});
```

### Task 10: Verify `drwn card diff` works for git-origin cards

```typescript
test("drwn card diff produces a real Git diff for git-origin card", async () => {
  // ... similar setup ...
  const result = await fixture.runCli([
    "card", "diff",
    "@team/baseline@1.0.0",
    "@team/baseline@1.1.0",
  ]);
  expect(result.stdout).toMatch(/^diff --git/m);
});
```

### Task 11: Verify `drwn card fetch` works for git-origin cards

```typescript
test("drwn card fetch refreshes a git-origin card's bare repo", async () => {
  const repo = await createLocalCardRepo({ name: "@team/baseline", version: "1.0.0" });
  const fixture = await scaffoldCliFixture();
  await fixture.runCli(["add", `git+${repo.url}#v1.0.0`]);

  // Publish v1.1.0 on the source
  await tagAdditionalVersion(repo, "1.1.0");

  // Fetch
  const result = await fixture.runCli(["card", "fetch", "@team/baseline"]);
  expect(result.exitCode).toBe(0);

  // Verify v1.1.0 is now available locally
  const showResult = await fixture.runCli(["card", "show", "@team/baseline@1.1.0"]);
  expect(showResult.exitCode).toBe(0);
});
```

### Task 12: Verify `drwn outdated --fetch` works for git-origin cards

```typescript
test("drwn outdated --fetch reports new versions for git-origin cards", async () => {
  // ... setup with v1.0.0 added, then v1.1.0 tagged on the source ...
  const result = await fixture.runCli(["outdated", "--fetch"]);
  expect(result.stdout).toMatch(/@team\/baseline/);
  expect(result.stdout).toMatch(/1\.1\.0/);
});
```

### Task 13: Commit Sub-Phase C

```bash
bun test
bun run typecheck

git add test/commands-card-*.test.ts test/scenarios-*.test.ts
git commit -m "[test:phase3] verify history/fetch/diff work for git-origin cards"
```

---

## Sub-Phase D: Final Verification

### Task 14: Full test suite

```bash
bun test
```

Expected: all green; zero new failures; all Phase 1 + Phase 2 tests still pass.

### Task 15: Typecheck and release readiness

```bash
bun run typecheck
bun run verify:release --json
```

### Task 16: Smoke test

```bash
# Set up a Phase-2-state (or Phase 1 if migrating that path)
mkdir -p /tmp/test-card-source/skills/example
# ... populate card source, init Git repo, tag ...

# Add a git+url ref BEFORE Phase 3 unification (simulate Phase 1 state)
# This won't normally happen since Phase 3 reverses Phase 1 behavior; instead test migration:

# Run migration
drwn store migrate-to-bare-repos --dry-run
drwn store migrate-to-bare-repos

# Add a new card via git+url (Phase 3 path)
cd /tmp/test-project
drwn add git+file:///tmp/test-card-source-bare.git#v1.0.0

# Verify bare repo exists, lockfile uses new path
ls ~/.agents/drwn/cards/@me/test.git/
cat /tmp/test-project/.agents/drwn/card.lock | jq '.cards[0]'

# Verify card show shows Git log
drwn card show @me/test@1.0.0

# Verify fetch works
drwn card fetch @me/test
```

### Task 17: Push and PR

```bash
git push -u origin remyjkim/git-distribution-phase-3
gh pr create --title "[feat:git] Phase 3 — unify git-URL refs with bare-repo store" --body "$(cat <<'EOF'
## Summary

Phase 3 of the Git-distribution rollout (analysis 44 §11.F). Pure internal unification.

- `git+url#ref` refs now route through `git clone --bare` instead of HTTP archive download.
- Bare repos at `~/.agents/drwn/cards/@scope/name.git/` are unified for store-origin and git-origin cards.
- Content extraction via `extracted/<tree-sha>/` is unified.
- Phase 1's `~/.agents/drwn/cache/` is migrated and removed (or moved to `cache.legacy/`).
- URL→name mapping cached in `~/.agents/drwn/url-card-map.json`.
- `drwn card show` / `diff` / `fetch` / `outdated --fetch` now work uniformly for both origin types.

No new commands. No new lockfile fields. Pure internal cleanup.

## Test plan

- [ ] `bun test` passes (full suite, includes Phase 1 + Phase 2)
- [ ] `bun run typecheck` passes
- [ ] `bun run verify:release --json` passes
- [ ] Manual smoke test of `drwn add git+url` → bare repo created at correct path
- [ ] Manual migration smoke test from Phase 1 cache
EOF
)"
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Phase 3's clone is slower than Phase 1's archive download for first install | Document the trade-off; clone unlocks all other Git-aware operations |
| URL→name discovery fails (e.g., `card.json` missing or invalid in default branch) | Surface as clear error; suggest user verify the URL points at a card source repo |
| Name collisions across URLs | Hard error with clear message; user must rename or fork to resolve |
| Migration encounters integrity mismatch | Error out per-card; report the mismatch; preserve `cache/` (don't `--remove-old`) until user resolves |
| Lazy lockfile rewrite confuses users | Document that "path field auto-updates on next apply"; the user-visible behavior is correct |
| Existing Phase 1 lockfile entries with no bare repo | Migration creates the bare repo. If migration is skipped, the resolver falls back to Phase 1's archive download path (read-compat) |
| Bare repo from Phase 3 has different config from Phase 2 store-origin bare repos | Both have `[remote "origin"]` set to the source URL. Behavior is unified. |
| Phase 1 archive download path is no longer exercised after Phase 3 | Keep the code for read-compat with old lockfiles; mark `@deprecated`; remove in Phase 4 if it earns its keep |
| Migration takes a long time on a large cache | Show progress; allow `--limit <n>` flag to migrate incrementally |

---

## Testing Strategy

- **Build-as-test per sub-phase**: each sub-phase ends in a green-test commit.
- **Migration scenario tests**: take Phase 1 fixture data, run migration, verify resulting bare repos + lockfile updates are correct.
- **Symmetry tests**: same card added two ways (semver name + git URL) produces equivalent local state.
- **Offline tests**: after first install of a git+url card, all subsequent operations work without `file://` accessible.
- **No regressions**: all Phase 1 and Phase 2 tests pass unchanged.

---

## Final Implementation Checklist

- [ ] Branch created.
- [ ] Sub-phase A: unified resolver shipped.
- [ ] Sub-phase B: migration shipped.
- [ ] Sub-phase C: affordances verified.
- [ ] Sub-phase D: full verification green.
- [ ] All gates pass.
- [ ] Smoke tests pass manually.
- [ ] PR opened.

---

## Notes

- Phase 3 is **smaller than Phase 1 and much smaller than Phase 2**. Plan for 3–5 sessions.
- The bulk of the engineering work happened in Phase 2 (Git plumbing, bare repos, team-sharing commands). Phase 3 is rewiring the resolver to use what Phase 2 built.
- After Phase 3 merges, the local store is in its final shape for the foreseeable future. Phase 4 (submodule federation) is deferred indefinitely unless a concrete use case emerges.
- Phase 1's `downloadGitArchive` and `extractGitArchive` are kept in `cli/core/git.ts` (deprecated) for read-compat with pre-migration lockfiles. They can be removed in a future cleanup once enough time has passed.
- The cache cleanup (`cache.legacy/` rename) is reversible. Users who want to undo Phase 3 migration can rename it back; the resolver's read-compat path will pick up the old paths.
