# Task 29: drwn Git Distribution Phase 1 — Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for code-touching tasks where tests are the spec. Do not commit unless explicitly instructed.

**Status**: Ready For T1 Start After Prerequisites
**Created**: 2026-06-01
**Updated**: 2026-06-01
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 PR (3–5 sessions)
**Dependencies**: Task 28 (rebrand to `drwn`/`darwinian-harness` must be merged first), analyses 42 v2, 44, 46, 47
**References**: [analyses/47_drwn-target-architecture-after-phase-1.md, analyses/46_drwn-card-team-sharing-flow.md, analyses/44_drwn-git-storage-backend-options.md, analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, cli/core/card-store.ts, cli/core/card-lock.ts, cli/core/card-manifest.ts, cli/core/store-paths.ts, cli/commands/card/add.ts]

---

## Objective

Land Phase 1 of the Git-distribution rollout (Design E partial per analysis `44_*` §11.F): introduce Git URLs as a recognized card-ref form, bump the lockfile to v2 with optional `git` block, add a basic `drwn install` for lockfile-driven bootstrap. Phase 1 is **purely additive** — existing npm/file/store-origin flows are untouched.

The target post-merge state is fully specified in analysis 47. This plan describes how to get there.

---

## Architecture

Phase 1 introduces:

1. **A new card-ref grammar**: `git+<url>#<ref>` is recognized by `parseCardRef`.
2. **A `cli/core/card-git.ts` module**: wraps `Bun.spawn(["git", ...])` for `ls-remote`, plus HTTP archive download and tarball extraction.
3. **A new cache layout** under `~/.agents/drwn/cache/` with `git-archives/`, `extracted/`, and `refs.json`.
4. **Lockfile v2**: optional `origin` and `git` fields, with read-compat for v1 lockfiles.
5. **A new `drwn install` command**: reads `card.lock`, ensures every card is present in the local store or cache, then runs `drwn apply`.
6. **An origin-dispatching resolver**: dispatches on parsed ref shape to `resolveFromStore` (existing), `resolveFromFile` (existing), or `resolveFromGit` (new).

What's NOT in Phase 1: no per-card bare repos, no `drwn card publish` rewrite, no push/fetch/remote/clone, no catalogs, no `drwn store gc`. These are Phase 2 (task 30).

---

## Tech Stack

- **Bun 1.2+** with `Bun.spawn` for Git shell-outs
- **TypeScript** with Clipanion 4 CLI framework
- **`git` binary** as a runtime dependency (already present on dev machines)
- **`tar`** as a runtime dependency for archive extraction (also ubiquitous)
- **No new npm dependencies** — Phase 1 ships without a Git library, using shell-out

---

## Success Criteria

### Lockfile

- [ ] `lockfileVersion: 2` is written by every drwn command that mutates the lockfile.
- [ ] `lockfileVersion: 1` lockfiles continue to read correctly (read-compat shim).
- [ ] Each lockfile entry has an explicit `origin` field: `"store" | "git" | "file" | "npm"`.
- [ ] Entries with `origin: "git"` carry a `git` block with `{ url, ref, commit }`.

### Card refs

- [ ] `drwn add @scope/name@^1.0.0` works (existing path, unchanged).
- [ ] `drwn add file:./path` works (existing path, unchanged).
- [ ] `drwn add git+https://github.com/owner/repo.git#v1.0.0` works (NEW).
- [ ] `drwn add git+file:///path/to/bare-repo.git#v1.0.0` works against a local `file://` Git remote (NEW, for tests).
- [ ] `drwn add git+url` without an explicit `#<ref>` is rejected with a clear error.
- [ ] Tag rewriting (remote changes `v1.0.0` to point at a different commit) is detected by integrity-hash mismatch.

### Storage

- [ ] `~/.agents/drwn/cache/git-archives/<sha>.tar.gz` is created for downloaded archives.
- [ ] `~/.agents/drwn/cache/extracted/<sha>/` is created for extracted content.
- [ ] `~/.agents/drwn/cache/refs.json` is created for the ref→SHA TTL cache.
- [ ] No existing `~/.agents/drwn/cards/...` content is modified.

### Commands

- [ ] `drwn install` exists at the top level.
- [ ] `drwn install` reads `card.lock`, fetches any missing content, then runs `drwn apply`.
- [ ] `drwn install --frozen` rejects any state that would require modifying the lockfile.
- [ ] `drwn install --no-apply` fetches without materializing.
- [ ] `drwn status` shows `origin: git` for Git-origin cards.

### Tests

- [ ] All existing tests pass.
- [ ] New test file `test/commands-card-git-add.test.ts` covers happy path + error paths for `drwn add git+url#ref`.
- [ ] New test file `test/commands-install.test.ts` covers `drwn install` end-to-end with mixed-origin lockfile.
- [ ] New test fixture `test/fixtures/git-helpers.ts` creates local `file://` bare repos for tests.
- [ ] Tests run without network (default suite); a separate opt-in suite tests against real GitHub.

### Gates

- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run verify:release --json` passes.
- [ ] No new ESLint or formatter warnings.

---

## Decisions Locked Before Implementation

| # | Decision | Source |
|---|---|---|
| D1 | Shell out to `git` via `Bun.spawn`. No Git library dependency. | analysis 46 §19.H |
| D2 | Lockfile bump is **additive**: v1 reads as v2 with origin inferred; first write upgrades. No big-bang migration. | analysis 47 §4 |
| D3 | Cache key is the **Git commit SHA** (not tree SHA). Phase 2 introduces tree-SHA keying when bare repos arrive. | analysis 47 §3.1 |
| D4 | `git+url` refs **require** an explicit `#<ref>`. Never auto-resolve to HEAD. | analysis 47 §5.1; rejects agentsync's HEAD-pull pattern |
| D5 | Integrity verification is **two-stage**: Git commit SHA must match lockfile, AND extracted-content sha256 must match lockfile. Both must pass. | analysis 47 §4.4 |
| D6 | `drwn install` is a **new top-level command**, separate from `drwn apply`. Mirrors `npm install` vs `npm run`. | analysis 47 §7 |
| D7 | Archive download via the host's **HTTP archive endpoint** (e.g., `https://github.com/owner/repo/archive/<sha>.tar.gz`). No `git archive --remote` in v1 (rarely supported by public hosts). | analysis 47 §6.4 |
| D8 | Ref-to-SHA cache TTL: **60 seconds**. Long enough to suppress chatter from successive `drwn add`s; short enough to not stale meaningfully. | analysis 47 §3.1 |
| D9 | Failure modes get **friendly translations** of Git's stderr. Don't surface raw Git messages without context. | analysis 47 §10 |
| D10 | Default test suite is **no-network**. `file://` Git URLs and a mock HTTP archive server are sufficient. Real-network tests live in an opt-in suite. | analysis 47 §11.3 |
| D11 | Phase 1 does NOT introduce `drwn store gc`. Cache eviction is manual until Phase 2. | analysis 47 §9 |
| D12 | Phase 1 does NOT touch the materialization layer. `apply` reads from cache for Git-origin cards via the standard lockfile `path` field. | analysis 47 §3.1 |

---

## Out of Scope

Explicitly NOT in Phase 1:

- Per-card local bare repos (`cards/@scope/name.git/`). Phase 2.
- `drwn card publish` Git plumbing. Phase 2.
- `drwn card push/fetch/remote/clone`. Phase 2.
- `drwn store gc`, `drwn store verify`, `drwn store migrate-to-git`. Phase 2.
- Catalog support. Phase 2.
- History inspection in `drwn card show` for Git-origin cards. Phase 2.
- Real `git diff` in `drwn card diff`. Phase 2.
- `drwn outdated --fetch` for Git-origin cards. Phase 2.
- Phase 3 unification of `cache/` with `extracted/`.

---

## Evidence Base

From the codebase investigation (see context for analysis 47):

- Current store at `cli/core/store-paths.ts:6`: `~/.agents/drwn/`
- Current card resolver entry point: `cli/core/card-store.ts:347-401` (`resolveCard`)
- Current ref parser: `cli/core/card-store.ts:120-133` (`parseCardRef`)
- Lockfile read/write: `cli/core/card-lock.ts:29-74` (`loadCardLock`, `writeCardLock`)
- Current lockfile schema: `cli/core/card-lock.ts:9-23` (`lockfileVersion: 1`)
- Integrity computation: `cli/core/card-store.ts:255-269` (`computeCardIntegrity`)
- Add command: `cli/commands/card/add.ts:1-37`
- Apply command (post-rebrand, formerly `write`): `cli/commands/write.ts` → `cli/commands/apply.ts` after task 28
- Test scaffold: `test/helpers.ts::scaffoldCliFixture`
- Bun.spawn precedent: `cli/core/card-store.ts:176` (existing `git init` shell-out)

---

## Entry Checks

Run before editing:

```bash
git status --short --branch
bun test
bun run typecheck
bun run verify:release --json
```

Expected:

- Branch is on a base that includes task 28 (rebrand). Confirm with `git log -1 --oneline` showing rebrand commit history.
- Working tree clean OR only intentional in-progress files.
- `bun test` passes.
- `bun run typecheck` passes.
- `bun run verify:release --json` returns `"ok": true`.

Create a dedicated branch:

```bash
git checkout -b remyjkim/git-distribution-phase-1
```

---

## Implementation Strategy

Nine phases, each ending in a green-test commit. Within each phase, source + tests change together. Each phase is verified before moving to the next.

Order rationale:

- Phases 1–3 set up the **foundation** (paths, plumbing wrapper, lockfile schema) without changing user-facing behavior.
- Phase 4 extends **ref parsing** to recognize `git+url#ref`.
- Phase 5 implements the **resolver** for the new origin.
- Phase 6 adds the **`drwn install`** command.
- Phase 7 updates **status output**.
- Phase 8 covers **observability and error paths**.
- Phase 9 is **final verification**.

---

## Phase 1: Branch Setup and Path Scaffolding

### Task 1.1: Create branch

```bash
git checkout -b remyjkim/git-distribution-phase-1
```

### Task 1.2: Add cache path helpers

**Files:**
- Modify: `cli/core/store-paths.ts`

Add path resolvers for the new cache locations:

```typescript
// cli/core/store-paths.ts

export function resolveCacheRoot(agentsDir: string): string {
  return join(resolveStoreRoot(agentsDir), "cache");
}

export function resolveCacheArchivesDir(agentsDir: string): string {
  return join(resolveCacheRoot(agentsDir), "git-archives");
}

export function resolveCacheExtractedDir(agentsDir: string): string {
  return join(resolveCacheRoot(agentsDir), "extracted");
}

export function resolveCacheArchivePath(agentsDir: string, commit: string): string {
  validateCommitSha(commit);
  return join(resolveCacheArchivesDir(agentsDir), `${commit}.tar.gz`);
}

export function resolveCacheExtractedPath(agentsDir: string, commit: string): string {
  validateCommitSha(commit);
  return join(resolveCacheExtractedDir(agentsDir), commit);
}

export function resolveRefsCachePath(agentsDir: string): string {
  return join(resolveCacheRoot(agentsDir), "refs.json");
}

function validateCommitSha(commit: string): void {
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(`invalid commit SHA: ${commit}`);
  }
}
```

### Task 1.3: Add a unit test for path helpers

**Files:**
- Create: `test/core-cache-paths.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import {
  resolveCacheArchivePath,
  resolveCacheExtractedPath,
  resolveCacheRoot,
} from "../cli/core/store-paths";

describe("cache path helpers", () => {
  const agentsDir = "/tmp/test/.agents";

  test("resolveCacheRoot", () => {
    expect(resolveCacheRoot(agentsDir)).toBe("/tmp/test/.agents/drwn/cache");
  });

  test("resolveCacheArchivePath with valid sha", () => {
    const sha = "a".repeat(40);
    expect(resolveCacheArchivePath(agentsDir, sha)).toBe(
      `/tmp/test/.agents/drwn/cache/git-archives/${sha}.tar.gz`,
    );
  });

  test("resolveCacheArchivePath rejects invalid sha", () => {
    expect(() => resolveCacheArchivePath(agentsDir, "not-a-sha")).toThrow();
    expect(() => resolveCacheArchivePath(agentsDir, "a".repeat(39))).toThrow();
    expect(() => resolveCacheArchivePath(agentsDir, "A".repeat(40))).toThrow(); // uppercase not allowed
  });

  test("resolveCacheExtractedPath", () => {
    const sha = "b".repeat(40);
    expect(resolveCacheExtractedPath(agentsDir, sha)).toBe(
      `/tmp/test/.agents/drwn/cache/extracted/${sha}`,
    );
  });
});
```

### Task 1.4: Run tests, verify, commit

```bash
bun test test/core-cache-paths.test.ts
bun run typecheck

git add cli/core/store-paths.ts test/core-cache-paths.test.ts
git commit -m "[feat:store] add cache path helpers for git-origin cards"
```

Expected: green tests, clean commit.

---

## Phase 2: Lockfile v2 Schema with Read-Compat

### Task 2.1: Extend the schema types

**Files:**
- Modify: `cli/core/card-lock.ts`

Update the type definitions. Keep v1 readable; new writes are v2.

```typescript
// cli/core/card-lock.ts

export type CardOrigin = "store" | "git" | "file" | "npm";

export interface GitLockInfo {
  url: string;
  ref: string;
  commit: string; // 40-char lowercase hex
}

export interface CardLockEntry {
  // v1 fields (unchanged):
  name: string;
  requested: string;
  version: string;
  path: string;
  integrity: string;
  manifest: CardManifest;
  skills: string[];
  registry: null;

  // v2 fields (NEW):
  origin: CardOrigin;        // required in v2; inferred on v1 read
  git?: GitLockInfo;          // present iff origin === "git"
}

export interface CardLockfile {
  lockfileVersion: 1 | 2;
  cards: CardLockEntry[];
}

const CURRENT_LOCKFILE_VERSION = 2 as const;
```

### Task 2.2: Update `loadCardLock` to handle v1 lockfiles

```typescript
// cli/core/card-lock.ts (extended)

export async function loadCardLock(projectRoot: string): Promise<CardLockfile | null> {
  const lockPath = cardLockPath(projectRoot);
  if (!existsSync(lockPath)) return null;

  const raw = await readFile(lockPath, "utf8");
  const parsed = JSON.parse(raw) as unknown as CardLockfile;

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`invalid card.lock at ${lockPath}: not an object`);
  }

  if (parsed.lockfileVersion === 1) {
    return migrateLockfileV1ToV2InMemory(parsed);
  }

  if (parsed.lockfileVersion !== 2) {
    throw new Error(
      `unsupported lockfile version ${parsed.lockfileVersion} at ${lockPath}; expected 1 or 2`,
    );
  }

  // v2: normalize defaults
  for (const card of parsed.cards) {
    if (!card.origin) {
      throw new Error(
        `v2 lockfile entry for ${card.name} missing required field 'origin'`,
      );
    }
    if (!Array.isArray(card.skills)) {
      card.skills = card.manifest.skills?.include ?? [];
    }
    if (card.registry === undefined) {
      card.registry = null;
    }
  }

  return parsed;
}

function migrateLockfileV1ToV2InMemory(v1: CardLockfile): CardLockfile {
  const cards: CardLockEntry[] = v1.cards.map(card => ({
    ...card,
    skills: Array.isArray(card.skills) ? card.skills : (card.manifest.skills?.include ?? []),
    registry: card.registry === undefined ? null : card.registry,
    origin: inferOriginFromV1Entry(card),
    // No `git` block on v1 entries (they can't have been git-origin)
  }));

  return { lockfileVersion: 2, cards };
}

function inferOriginFromV1Entry(card: CardLockEntry): CardOrigin {
  // v1 had no explicit origin. Infer from `requested` string shape.
  if (card.requested.startsWith("file:")) return "file";
  // Default for everything else (semver-shaped names): "store"
  return "store";
}
```

### Task 2.3: Update `writeCardLock` to always write v2

```typescript
// cli/core/card-lock.ts (extended)

export async function writeCardLock(
  projectRoot: string,
  cards: CardLockEntry[],
): Promise<void> {
  const lockPath = cardLockPath(projectRoot);
  await mkdir(dirname(lockPath), { recursive: true });

  // Validate each card has an origin set
  for (const card of cards) {
    if (!card.origin) {
      throw new Error(`writeCardLock: card ${card.name} missing required 'origin' field`);
    }
    if (card.origin === "git" && !card.git) {
      throw new Error(`writeCardLock: card ${card.name} has origin 'git' but no 'git' block`);
    }
    if (card.origin !== "git" && card.git) {
      throw new Error(`writeCardLock: card ${card.name} has 'git' block but origin is not 'git'`);
    }
  }

  const lockfile: CardLockfile = {
    lockfileVersion: CURRENT_LOCKFILE_VERSION,
    cards,
  };

  await atomicWriteJson(lockPath, lockfile);
}
```

### Task 2.4: Test v1 read-compat and v2 round-trip

**Files:**
- Modify: `test/core-card-lock.test.ts`

```typescript
// In test/core-card-lock.test.ts

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCardLock, writeCardLock } from "../cli/core/card-lock";

describe("card-lock v2 schema", () => {
  test("reads v1 lockfile and migrates origin in memory", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-lock-v1-"));
    await mkdir(join(tmp, ".agents", "drwn"), { recursive: true });
    const v1Content = {
      lockfileVersion: 1,
      cards: [
        {
          name: "@me/foo",
          requested: "@me/foo@^1.0.0",
          version: "1.0.0",
          path: "/tmp/whatever",
          integrity: "sha256-abc",
          manifest: { name: "@me/foo", version: "1.0.0" },
          skills: ["x"],
          registry: null,
        },
      ],
    };
    await writeFile(join(tmp, ".agents", "drwn", "card.lock"), JSON.stringify(v1Content));

    const loaded = await loadCardLock(tmp);
    expect(loaded).not.toBeNull();
    expect(loaded!.lockfileVersion).toBe(2);
    expect(loaded!.cards[0].origin).toBe("store");
    expect(loaded!.cards[0].git).toBeUndefined();
  });

  test("write rejects entry with origin git but no git block", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-lock-v2-"));
    await mkdir(join(tmp, ".agents", "drwn"), { recursive: true });
    await expect(
      writeCardLock(tmp, [
        {
          name: "@me/foo",
          requested: "git+url",
          version: "1.0.0",
          path: "/tmp/x",
          integrity: "sha256-y",
          manifest: { name: "@me/foo", version: "1.0.0" },
          skills: [],
          registry: null,
          origin: "git",
          // git block missing on purpose
        } as any,
      ]),
    ).rejects.toThrow(/missing/);
  });

  test("writes v2 lockfile with git block", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-lock-write-"));
    await mkdir(join(tmp, ".agents", "drwn"), { recursive: true });
    await writeCardLock(tmp, [
      {
        name: "@me/foo",
        requested: "git+https://example.com/foo.git#v1.0.0",
        version: "1.0.0",
        path: "/tmp/extracted/abc",
        integrity: "sha256-foo",
        manifest: { name: "@me/foo", version: "1.0.0" },
        skills: [],
        registry: null,
        origin: "git",
        git: {
          url: "https://example.com/foo.git",
          ref: "v1.0.0",
          commit: "a".repeat(40),
        },
      },
    ]);
    const raw = await readFile(join(tmp, ".agents", "drwn", "card.lock"), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.lockfileVersion).toBe(2);
    expect(parsed.cards[0].origin).toBe("git");
    expect(parsed.cards[0].git.commit).toBe("a".repeat(40));
  });
});
```

### Task 2.5: Verify existing tests still pass

```bash
bun test test/core-card-lock.test.ts
bun test  # full suite
bun run typecheck
```

Expected: all green. The existing v1 lockfile tests should continue to pass via the read-compat shim.

### Task 2.6: Commit

```bash
git add cli/core/card-lock.ts test/core-card-lock.test.ts
git commit -m "[feat:lockfile] bump to v2 with origin and git fields; v1 read-compat"
```

---

## Phase 3: Git Plumbing Wrapper (`card-git.ts`)

### Task 3.1: Create the new module skeleton

**Files:**
- Create: `cli/core/card-git.ts`

```typescript
// cli/core/card-git.ts
//
// Shell-out wrapper for the Git operations Phase 1 needs.
// Phase 2 will significantly extend this module; Phase 1 keeps it minimal.

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  resolveCacheArchivePath,
  resolveCacheArchivesDir,
  resolveRefsCachePath,
} from "./store-paths";

export class GitError extends Error {
  constructor(
    message: string,
    public readonly cause?: { stderr?: string; stdout?: string; exitCode?: number },
  ) {
    super(message);
    this.name = "GitError";
  }
}

const REFS_CACHE_TTL_MS = 60 * 1000;

interface RefsCacheEntry {
  cachedAt: number;
  commit: string;
}

interface RefsCacheFile {
  version: 1;
  entries: Record<string, RefsCacheEntry>;
}

function refsCacheKey(url: string, ref: string): string {
  return `${url}#${ref}`;
}

async function readRefsCache(agentsDir: string): Promise<RefsCacheFile> {
  const cachePath = resolveRefsCachePath(agentsDir);
  if (!existsSync(cachePath)) return { version: 1, entries: {} };
  try {
    const raw = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as RefsCacheFile;
    if (parsed.version !== 1) return { version: 1, entries: {} };
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

async function writeRefsCache(agentsDir: string, cache: RefsCacheFile): Promise<void> {
  const cachePath = resolveRefsCachePath(agentsDir);
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2));
}

/**
 * Resolve a ref (tag/branch/commit-prefix) to a full commit SHA via `git ls-remote`.
 * Caches the result for REFS_CACHE_TTL_MS to avoid hammering remotes during a sequence of operations.
 */
export async function resolveGitRefToCommit(
  agentsDir: string,
  url: string,
  ref: string,
): Promise<string> {
  // Cache check
  const cache = await readRefsCache(agentsDir);
  const key = refsCacheKey(url, ref);
  const cached = cache.entries[key];
  if (cached && Date.now() < cached.cachedAt + REFS_CACHE_TTL_MS) {
    return cached.commit;
  }

  // Build candidate refs to query: explicit, plus refs/tags/<ref> and refs/heads/<ref>
  const candidates = [ref, `refs/tags/${ref}`, `refs/heads/${ref}`];

  const proc = Bun.spawn(["git", "ls-remote", url, ...candidates], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new GitError(
      `git ls-remote failed for ${url}: ${stderr.trim() || "unknown error"}`,
      { stderr, stdout, exitCode: proc.exitCode ?? -1 },
    );
  }

  // Parse first matching line: "<sha>\t<full-ref>"
  // Prefer tag matches over branch matches when both exist (tags are immutable; branches drift).
  const lines = stdout.split("\n").filter(l => l.trim());
  if (lines.length === 0) {
    throw new GitError(`ref not found in ${url}: ${ref}`);
  }

  const tagLine = lines.find(l => l.includes(`refs/tags/${ref}`));
  const branchLine = lines.find(l => l.includes(`refs/heads/${ref}`));
  const exactLine = lines.find(l => {
    const parts = l.split("\t");
    return parts[1] === ref;
  });
  const line = tagLine ?? exactLine ?? branchLine ?? lines[0];

  const sha = line.split("\t")[0];
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new GitError(`invalid sha from ls-remote: ${sha}`);
  }

  // Cache and return
  cache.entries[key] = { cachedAt: Date.now(), commit: sha };
  await writeRefsCache(agentsDir, cache);

  return sha;
}

/**
 * Download a Git archive (tarball) for a specific commit via the host's HTTP archive endpoint.
 * Supports GitHub, GitLab, Bitbucket URL forms. For unknown hosts, attempts the GitHub form first.
 */
export async function downloadGitArchive(
  agentsDir: string,
  url: string,
  commit: string,
): Promise<string> {
  const archivePath = resolveCacheArchivePath(agentsDir, commit);
  if (existsSync(archivePath)) return archivePath;

  await mkdir(resolveCacheArchivesDir(agentsDir), { recursive: true });

  const archiveUrl = constructArchiveUrl(url, commit);
  const tempPath = archivePath + ".tmp." + Math.random().toString(36).slice(2);

  const response = await fetch(archiveUrl);
  if (!response.ok) {
    throw new GitError(
      `archive fetch failed for ${archiveUrl}: ${response.status} ${response.statusText}`,
    );
  }

  const buffer = await response.arrayBuffer();
  await writeFile(tempPath, new Uint8Array(buffer));
  await rename(tempPath, archivePath); // atomic

  return archivePath;
}

function constructArchiveUrl(url: string, commit: string): string {
  // GitHub: https://github.com/<owner>/<repo>(.git)? → https://github.com/<owner>/<repo>/archive/<sha>.tar.gz
  // GitLab: https://gitlab.com/<owner>/<repo>(.git)? → https://gitlab.com/<owner>/<repo>/-/archive/<sha>/<repo>-<sha>.tar.gz
  // Generic / unknown: try the GitHub form first; if that 404s, try GitLab. (Defer; for v1, only GitHub form.)

  const stripped = url.replace(/\.git$/, "");

  if (/github\.com/.test(stripped)) {
    return `${stripped}/archive/${commit}.tar.gz`;
  }
  if (/gitlab/.test(stripped)) {
    const parts = stripped.split("/");
    const repo = parts[parts.length - 1];
    return `${stripped}/-/archive/${commit}/${repo}-${commit}.tar.gz`;
  }
  // Fallback: GitHub form
  return `${stripped}/archive/${commit}.tar.gz`;
}

/**
 * Extract a downloaded tarball to a target directory.
 * GitHub/GitLab archives wrap content in a single top-level directory; we flatten that.
 */
export async function extractGitArchive(
  archivePath: string,
  targetDir: string,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  const proc = Bun.spawn(["tar", "-xzf", archivePath, "-C", targetDir, "--strip-components=1"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new GitError(
      `tar extraction failed for ${archivePath}: ${stderr.trim() || "unknown error"}`,
      { stderr, exitCode: proc.exitCode ?? -1 },
    );
  }
}
```

### Task 3.2: Add unit tests for `card-git.ts` with file:// fixtures

**Files:**
- Create: `test/fixtures/git-helpers.ts`
- Create: `test/core-card-git.test.ts`

`test/fixtures/git-helpers.ts`:

```typescript
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Create a local bare Git repo populated with a single card source tagged v1.0.0.
 * Returns the file:// URL to the bare repo.
 */
export async function createLocalCardRepo(opts: {
  name: string;
  version?: string;
  skills?: string[];
}): Promise<{ url: string; tempDir: string }> {
  const version = opts.version ?? "1.0.0";
  const skills = opts.skills ?? ["sample-skill"];

  const tempDir = await mkdtemp(join(tmpdir(), "drwn-test-repo-"));
  const sourceDir = join(tempDir, "source");
  const bareDir = join(tempDir, "bare.git");

  await mkdir(sourceDir, { recursive: true });

  // Write card.json
  await writeFile(
    join(sourceDir, "card.json"),
    JSON.stringify(
      {
        name: opts.name,
        version,
        description: "Test card",
        skills: { include: skills },
      },
      null,
      2,
    ),
  );

  // Write skill stubs
  for (const skill of skills) {
    const skillDir = join(sourceDir, "skills", skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `# ${skill}\n\nTest skill body.\n`);
  }

  // Create bare repo, initialize, commit, tag
  await mkdir(bareDir, { recursive: true });

  const env = { GIT_DIR: bareDir, GIT_WORK_TREE: sourceDir };

  await runGit(["init", "--bare"], { cwd: bareDir });
  await runGit(["add", "-A"], { env, cwd: sourceDir });
  await runGit(
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", `v${version}`],
    { env, cwd: sourceDir },
  );
  await runGit(["tag", `v${version}`], { env, cwd: sourceDir });

  return { url: `file://${bareDir}`, tempDir };
}

async function runGit(args: string[], opts: { env?: Record<string, string>; cwd?: string }): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  }
}
```

`test/core-card-git.test.ts`:

```typescript
import { afterAll, describe, expect, test } from "bun:test";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveGitRefToCommit,
  GitError,
} from "../cli/core/card-git";
import { createLocalCardRepo } from "./fixtures/git-helpers";

describe("card-git: resolveGitRefToCommit", () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const d of tempDirs) {
      await rm(d, { recursive: true, force: true });
    }
  });

  test("resolves a tagged ref against a local bare repo", async () => {
    const { url, tempDir } = await createLocalCardRepo({ name: "@test/sample" });
    tempDirs.push(tempDir);

    const agentsDir = await mkdtemp(join(tmpdir(), "drwn-test-agents-"));
    tempDirs.push(agentsDir);

    const sha = await resolveGitRefToCommit(agentsDir, url, "v1.0.0");
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });

  test("throws GitError on unreachable URL", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "drwn-test-agents-"));
    tempDirs.push(agentsDir);

    await expect(
      resolveGitRefToCommit(agentsDir, "file:///nonexistent/repo.git", "v1.0.0"),
    ).rejects.toThrow(GitError);
  });

  test("throws GitError when ref does not exist", async () => {
    const { url, tempDir } = await createLocalCardRepo({ name: "@test/sample" });
    tempDirs.push(tempDir);

    const agentsDir = await mkdtemp(join(tmpdir(), "drwn-test-agents-"));
    tempDirs.push(agentsDir);

    await expect(resolveGitRefToCommit(agentsDir, url, "v999.0.0")).rejects.toThrow(GitError);
  });

  test("caches the ref→sha mapping", async () => {
    const { url, tempDir } = await createLocalCardRepo({ name: "@test/sample" });
    tempDirs.push(tempDir);

    const agentsDir = await mkdtemp(join(tmpdir(), "drwn-test-agents-"));
    tempDirs.push(agentsDir);

    const sha1 = await resolveGitRefToCommit(agentsDir, url, "v1.0.0");
    const sha2 = await resolveGitRefToCommit(agentsDir, url, "v1.0.0");
    expect(sha1).toBe(sha2);
    // (Implicit: second call uses cache. A more rigorous test would mock Bun.spawn and assert call count.)
  });
});
```

### Task 3.3: Run and commit

```bash
bun test test/core-card-git.test.ts
bun run typecheck

git add cli/core/card-git.ts test/fixtures/git-helpers.ts test/core-card-git.test.ts
git commit -m "[feat:git] add card-git module with ls-remote and archive plumbing"
```

---

## Phase 4: Ref Parsing Extension

### Task 4.1: Extend `parseCardRef`

**Files:**
- Modify: `cli/core/card-store.ts` (specifically the `parseCardRef` function around line 120)

```typescript
// cli/core/card-store.ts

export interface ParsedCardRef {
  origin: CardOrigin;        // NEW field
  name: string;
  range: string;
  filePath?: string;
  gitUrl?: string;            // NEW: present iff origin === "git"
  gitRef?: string;            // NEW: present iff origin === "git"
  original: string;           // NEW: the original input string, for diagnostics
}

export function parseCardRef(ref: string): ParsedCardRef {
  if (ref.startsWith("git+")) {
    return parseGitRef(ref);
  }
  if (ref.startsWith("file:")) {
    return parseFileRef(ref);
  }
  return parseSemverRef(ref);
}

function parseGitRef(ref: string): ParsedCardRef {
  // "git+<url>#<gitRef>" — fragment is required
  const withoutPrefix = ref.slice("git+".length);
  const hashIndex = withoutPrefix.lastIndexOf("#");
  if (hashIndex < 0) {
    throw new Error(
      `git+ refs require an explicit version fragment: "${ref}". ` +
      `Example: git+https://github.com/owner/repo.git#v1.0.0`,
    );
  }
  const url = withoutPrefix.slice(0, hashIndex);
  const gitRef = withoutPrefix.slice(hashIndex + 1);

  if (!url) {
    throw new Error(`invalid git+ ref (empty URL): "${ref}"`);
  }
  if (!gitRef) {
    throw new Error(`invalid git+ ref (empty ref after #): "${ref}"`);
  }

  return {
    origin: "git",
    // For git refs, name and range are placeholders; the real values come from the resolved manifest.
    name: "",
    range: "*",
    gitUrl: url,
    gitRef,
    original: ref,
  };
}

function parseFileRef(ref: string): ParsedCardRef {
  // ... existing file: parsing, now setting origin: "file" and original ...
  const filePath = ref.slice("file:".length);
  return {
    origin: "file",
    name: ref,
    range: "*",
    filePath,
    original: ref,
  };
}

function parseSemverRef(ref: string): ParsedCardRef {
  // ... existing semver parsing, now setting origin: "store" and original ...
  // Existing logic returns { name, range }; just add origin and original.
  // (Detailed implementation: keep the existing logic, add `origin: "store"` and `original: ref` to the returned object.)
}
```

### Task 4.2: Test the parser

**Files:**
- Modify: `test/core-card-ref-parser.test.ts` (or create if missing)

```typescript
import { describe, expect, test } from "bun:test";
import { parseCardRef } from "../cli/core/card-store";

describe("parseCardRef", () => {
  test("parses scoped semver ref as store origin", () => {
    const parsed = parseCardRef("@me/foo@^1.0.0");
    expect(parsed.origin).toBe("store");
    expect(parsed.name).toBe("@me/foo");
    expect(parsed.range).toBe("^1.0.0");
  });

  test("parses unscoped semver ref as store origin", () => {
    const parsed = parseCardRef("foo@1.0.0");
    expect(parsed.origin).toBe("store");
  });

  test("parses file: ref as file origin", () => {
    const parsed = parseCardRef("file:/path/to/source");
    expect(parsed.origin).toBe("file");
    expect(parsed.filePath).toBe("/path/to/source");
  });

  test("parses git+ ref as git origin", () => {
    const parsed = parseCardRef("git+https://github.com/owner/repo.git#v1.0.0");
    expect(parsed.origin).toBe("git");
    expect(parsed.gitUrl).toBe("https://github.com/owner/repo.git");
    expect(parsed.gitRef).toBe("v1.0.0");
  });

  test("parses git+ ref with ssh URL", () => {
    const parsed = parseCardRef("git+ssh://git@github.com/owner/repo.git#main");
    expect(parsed.origin).toBe("git");
    expect(parsed.gitUrl).toBe("ssh://git@github.com/owner/repo.git");
    expect(parsed.gitRef).toBe("main");
  });

  test("parses git+ ref with file:// URL", () => {
    const parsed = parseCardRef("git+file:///tmp/repo.git#v1.0.0");
    expect(parsed.origin).toBe("git");
    expect(parsed.gitUrl).toBe("file:///tmp/repo.git");
  });

  test("rejects git+ ref without # fragment", () => {
    expect(() => parseCardRef("git+https://github.com/owner/repo.git")).toThrow(/fragment/);
  });

  test("rejects git+ ref with empty URL", () => {
    expect(() => parseCardRef("git+#v1.0.0")).toThrow();
  });

  test("preserves the original ref string", () => {
    const ref = "git+https://example.com/foo.git#v1.0.0";
    const parsed = parseCardRef(ref);
    expect(parsed.original).toBe(ref);
  });
});
```

### Task 4.3: Run and commit

```bash
bun test test/core-card-ref-parser.test.ts
bun test  # ensure nothing else broke
bun run typecheck

git add cli/core/card-store.ts test/core-card-ref-parser.test.ts
git commit -m "[feat:resolver] parse git+url#ref form with explicit origin field"
```

---

## Phase 5: Git Resolver

### Task 5.1: Implement `resolveFromGit`

**Files:**
- Modify: `cli/core/card-store.ts`

Add the new resolver path. The existing `resolveCard` becomes a dispatcher:

```typescript
// cli/core/card-store.ts (extended)

import {
  resolveGitRefToCommit,
  downloadGitArchive,
  extractGitArchive,
} from "./card-git";
import { resolveCacheExtractedPath } from "./store-paths";

export async function resolveCard(
  agentsDir: string,
  ref: string,
): Promise<ResolvedCard> {
  const parsed = parseCardRef(ref);

  switch (parsed.origin) {
    case "store":
      return resolveFromStore(agentsDir, parsed);
    case "file":
      return resolveFromFile(parsed);
    case "git":
      return resolveFromGit(agentsDir, parsed);
    case "npm":
      // Not used in Phase 1; placeholder for future
      throw new Error("npm origin resolver not implemented");
  }
}

async function resolveFromGit(
  agentsDir: string,
  parsed: ParsedCardRef,
): Promise<ResolvedCard> {
  if (!parsed.gitUrl || !parsed.gitRef) {
    throw new Error("internal: parseGitRef returned without gitUrl/gitRef");
  }

  // Step 1: resolve ref to commit SHA
  const commit = await resolveGitRefToCommit(agentsDir, parsed.gitUrl, parsed.gitRef);

  // Step 2: ensure archive downloaded
  const archivePath = await downloadGitArchive(agentsDir, parsed.gitUrl, commit);

  // Step 3: ensure extracted
  const extractedDir = resolveCacheExtractedPath(agentsDir, commit);
  if (!existsSync(extractedDir)) {
    const tempDir = `${extractedDir}.tmp.${Math.random().toString(36).slice(2)}`;
    await extractGitArchive(archivePath, tempDir);
    await rename(tempDir, extractedDir);
  }

  // Step 4: read manifest from extracted content
  const manifestPath = join(extractedDir, "card.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`extracted git archive missing card.json: ${extractedDir}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CardManifest;
  assertValidCardManifest(manifest);

  // Step 5: compute integrity
  const integrity = await computeCardIntegrity(extractedDir);

  // Step 6: validate skills directories
  await validateCardSkills(extractedDir, manifest);

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
    git: {
      url: parsed.gitUrl,
      ref: parsed.gitRef,
      commit,
    },
  };
}
```

### Task 5.2: Update `addProjectCardSpec` to use the resolver

**Files:**
- Modify: `cli/core/card-project.ts`

Ensure that when a user adds a `git+` ref, the project config records the resolved canonical name (`@scope/name`), not the raw URL.

```typescript
// cli/core/card-project.ts (extended)

export async function addProjectCardSpec(
  projectRoot: string,
  agentsDir: string,
  rawSpec: string,
): Promise<void> {
  const parsed = parseCardRef(rawSpec);

  let canonicalSpec: string;
  if (parsed.origin === "git") {
    // Resolve to learn the canonical name and version
    const resolved = await resolveFromGit(agentsDir, parsed);
    // Use the resolved card's canonical name + the user's specified version (the tag)
    canonicalSpec = `${resolved.name}@${resolved.version}`;
    // The Git URL is recorded in card.lock's git block, not in project config
  } else {
    canonicalSpec = rawSpec;
  }

  const config = await loadOrInitProjectConfig(projectRoot, agentsDir);
  if (config.cards.some(c => sameCardName(c, canonicalSpec))) {
    throw new Error(`card already in project: ${canonicalSpec}`);
  }
  config.cards.push(canonicalSpec);
  await writeProjectCards(projectRoot, agentsDir, config.cards);
}
```

### Task 5.3: End-to-end test of `drwn add git+url#ref`

**Files:**
- Create: `test/commands-card-git-add.test.ts`

```typescript
import { afterEach, describe, expect, test } from "bun:test";
import { rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { scaffoldCliFixture } from "./helpers";
import { createLocalCardRepo } from "./fixtures/git-helpers";

describe("drwn add git+url#ref", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
  });

  test("resolves a git+file:// ref and writes lockfile with git block", async () => {
    const repo = await createLocalCardRepo({
      name: "@test/sample",
      version: "1.2.0",
      skills: ["alpha"],
    });
    cleanups.push(() => rm(repo.tempDir, { recursive: true, force: true }));

    const fixture = await scaffoldCliFixture();
    cleanups.push(() => fixture.cleanup());

    const result = await fixture.runCli(["add", `git+${repo.url}#v1.2.0`]);
    expect(result.exitCode).toBe(0);

    // Check project config
    const config = JSON.parse(
      await readFile(join(fixture.projectRoot, ".agents/drwn/config.json"), "utf8"),
    );
    expect(config.cards).toContain("@test/sample@1.2.0");

    // Check lockfile
    const lock = JSON.parse(
      await readFile(join(fixture.projectRoot, ".agents/drwn/card.lock"), "utf8"),
    );
    expect(lock.lockfileVersion).toBe(2);
    const entry = lock.cards.find((c: any) => c.name === "@test/sample");
    expect(entry).toBeDefined();
    expect(entry.origin).toBe("git");
    expect(entry.git.url).toBe(repo.url);
    expect(entry.git.ref).toBe("v1.2.0");
    expect(entry.git.commit).toMatch(/^[a-f0-9]{40}$/);
  });

  test("rejects git+ ref missing #fragment", async () => {
    const fixture = await scaffoldCliFixture();
    cleanups.push(() => fixture.cleanup());

    const result = await fixture.runCli(["add", "git+https://example.com/foo.git"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/fragment/);
  });

  test("rejects unreachable git+ URL with friendly error", async () => {
    const fixture = await scaffoldCliFixture();
    cleanups.push(() => fixture.cleanup());

    const result = await fixture.runCli(["add", "git+file:///nonexistent/repo.git#v1.0.0"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/ls-remote|reach/i);
  });

  test("is idempotent (second add of same ref hits cache)", async () => {
    const repo = await createLocalCardRepo({ name: "@test/sample" });
    cleanups.push(() => rm(repo.tempDir, { recursive: true, force: true }));

    const fixture = await scaffoldCliFixture();
    cleanups.push(() => fixture.cleanup());

    const first = await fixture.runCli(["add", `git+${repo.url}#v1.0.0`]);
    expect(first.exitCode).toBe(0);

    // Second add: should warn or refuse (already in project)
    const second = await fixture.runCli(["add", `git+${repo.url}#v1.0.0`]);
    expect(second.exitCode).not.toBe(0);
    expect(second.stderr).toMatch(/already in project/);
  });
});
```

### Task 5.4: Run and commit

```bash
bun test test/commands-card-git-add.test.ts
bun test
bun run typecheck

git add cli/core/card-store.ts cli/core/card-project.ts test/commands-card-git-add.test.ts
git commit -m "[feat:resolver] resolve git+url refs into cache and lockfile"
```

---

## Phase 6: The `drwn install` Command

### Task 6.1: Create the install command

**Files:**
- Create: `cli/commands/install.ts`

```typescript
// cli/commands/install.ts
//
// Bootstrap a project: ensure every card in card.lock is present in the local store
// or cache, then run apply (unless --no-apply).

import { Command, Option } from "clipanion";
import { resolveCard } from "../core/card-store";
import { loadCardLock } from "../core/card-lock";
import { getContext } from "../context";
import { resolveCacheExtractedPath } from "../core/store-paths";
import { existsSync } from "node:fs";

export class InstallCommand extends Command {
  static paths = [["install"]];

  static usage = Command.Usage({
    description: "Fetch missing cards from card.lock and apply effective state.",
    examples: [
      ["Standard bootstrap after fresh project clone", "drwn install"],
      ["Fetch but don't apply", "drwn install --no-apply"],
      ["CI-safe: fail if lockfile would be modified", "drwn install --frozen"],
    ],
  });

  frozen = Option.Boolean("--frozen", false, {
    description: "Refuse to run if any card resolution would modify card.lock.",
  });

  noApply = Option.Boolean("--no-apply", false, {
    description: "Fetch cards into the local store but do not materialize downstream.",
  });

  json = Option.Boolean("--json", false);

  async execute(): Promise<number> {
    const ctx = await getContext();
    const lock = await loadCardLock(ctx.projectRoot);

    if (!lock) {
      this.context.stderr.write(
        "No card.lock found. Did you mean `drwn apply` instead?\n",
      );
      return 1;
    }

    const errors: Array<{ card: string; message: string }> = [];

    for (const entry of lock.cards) {
      try {
        await ensureCardPresent(ctx.agentsDir, entry);
      } catch (e) {
        errors.push({ card: entry.name, message: (e as Error).message });
      }
    }

    if (errors.length > 0) {
      if (this.json) {
        this.context.stdout.write(JSON.stringify({ ok: false, errors }, null, 2));
      } else {
        for (const e of errors) {
          this.context.stderr.write(`Error: ${e.card}: ${e.message}\n`);
        }
      }
      return 1;
    }

    if (this.noApply) {
      if (this.json) {
        this.context.stdout.write(
          JSON.stringify({ ok: true, fetched: lock.cards.length, applied: false }, null, 2),
        );
      } else {
        this.context.stdout.write(`Fetched ${lock.cards.length} card(s). Not applying.\n`);
      }
      return 0;
    }

    // Delegate to apply
    return this.cli.run(["apply"]);
  }
}

async function ensureCardPresent(agentsDir: string, entry: CardLockEntry): Promise<void> {
  switch (entry.origin) {
    case "store":
    case "file":
      // Just verify path exists; no fetching needed in Phase 1
      if (!existsSync(entry.path)) {
        throw new Error(`card ${entry.name}@${entry.version} not found at ${entry.path}`);
      }
      return;

    case "git":
      // Re-resolve, ensuring extraction is present
      if (!entry.git) {
        throw new Error(`lockfile entry has origin=git but no git block`);
      }
      const extractedDir = resolveCacheExtractedPath(agentsDir, entry.git.commit);
      if (existsSync(extractedDir)) {
        // Verify integrity
        const actualIntegrity = await computeCardIntegrity(extractedDir);
        if (actualIntegrity !== entry.integrity) {
          throw new Error(
            `integrity mismatch for ${entry.name}@${entry.version}: expected ${entry.integrity}, got ${actualIntegrity}`,
          );
        }
        return;
      }
      // Re-fetch the archive and extract
      // (Reuses resolveFromGit's archive download + extraction path, but skips writing lockfile)
      await refetchGitCard(agentsDir, entry);
      return;

    case "npm":
      throw new Error("npm origin not supported in Phase 1");
  }
}

async function refetchGitCard(agentsDir: string, entry: CardLockEntry): Promise<void> {
  if (!entry.git) throw new Error("internal: refetchGitCard without git block");
  const { downloadGitArchive, extractGitArchive } = await import("../core/card-git");
  const archivePath = await downloadGitArchive(agentsDir, entry.git.url, entry.git.commit);
  const extractedDir = resolveCacheExtractedPath(agentsDir, entry.git.commit);
  const tempDir = `${extractedDir}.tmp.${Math.random().toString(36).slice(2)}`;
  await extractGitArchive(archivePath, tempDir);
  await rename(tempDir, extractedDir);

  const actualIntegrity = await computeCardIntegrity(extractedDir);
  if (actualIntegrity !== entry.integrity) {
    throw new Error(
      `integrity mismatch for ${entry.name}@${entry.version}: expected ${entry.integrity}, got ${actualIntegrity}`,
    );
  }
}
```

### Task 6.2: Register the command

**Files:**
- Modify: `cli/index.ts`

```typescript
// In cli/index.ts, add:
import { InstallCommand } from "./commands/install";

// ... existing registration ...
cli.register(InstallCommand);
```

### Task 6.3: Test `drwn install`

**Files:**
- Create: `test/commands-install.test.ts`

```typescript
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { scaffoldCliFixture } from "./helpers";
import { createLocalCardRepo } from "./fixtures/git-helpers";

describe("drwn install", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const c of cleanups) await c();
    cleanups.length = 0;
  });

  test("bootstraps git-origin cards from a clean lockfile", async () => {
    const repo = await createLocalCardRepo({
      name: "@test/sample",
      version: "1.0.0",
      skills: ["alpha"],
    });
    cleanups.push(() => rm(repo.tempDir, { recursive: true, force: true }));

    // Set up project with lockfile but no cache
    const fixtureA = await scaffoldCliFixture();
    cleanups.push(() => fixtureA.cleanup());
    await fixtureA.runCli(["add", `git+${repo.url}#v1.0.0`]);

    // Copy lockfile to a fresh fixture (simulating "git clone of a project")
    const lockContent = await readFile(
      join(fixtureA.projectRoot, ".agents/drwn/card.lock"),
      "utf8",
    );
    const configContent = await readFile(
      join(fixtureA.projectRoot, ".agents/drwn/config.json"),
      "utf8",
    );

    const fixtureB = await scaffoldCliFixture();
    cleanups.push(() => fixtureB.cleanup());
    await mkdir(join(fixtureB.projectRoot, ".agents/drwn"), { recursive: true });
    await writeFile(
      join(fixtureB.projectRoot, ".agents/drwn/card.lock"),
      lockContent,
    );
    await writeFile(
      join(fixtureB.projectRoot, ".agents/drwn/config.json"),
      configContent,
    );

    // Run install in fixtureB
    const result = await fixtureB.runCli(["install"]);
    expect(result.exitCode).toBe(0);

    // Verify the card content was re-extracted
    const lock = JSON.parse(lockContent);
    const entry = lock.cards[0];
    expect(existsSync(entry.path)).toBe(true);
  });

  test("--no-apply skips materialization", async () => {
    const repo = await createLocalCardRepo({ name: "@test/sample" });
    cleanups.push(() => rm(repo.tempDir, { recursive: true, force: true }));

    const fixture = await scaffoldCliFixture();
    cleanups.push(() => fixture.cleanup());
    await fixture.runCli(["add", `git+${repo.url}#v1.0.0`]);

    // Simulate a fresh state by clearing the materialized files
    await rm(join(fixture.projectRoot, ".claude"), { recursive: true, force: true });

    const result = await fixture.runCli(["install", "--no-apply"]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(fixture.projectRoot, ".claude"))).toBe(false);
  });

  test("--frozen refuses to modify lockfile", async () => {
    // (For Phase 1, --frozen is mostly about not adding new entries;
    //  this test creates a lockfile referencing a card not in cache and verifies
    //  install --frozen fails when re-fetch would be needed.)
    // Implementation: --frozen check is in install command itself.
    // ... test body ...
  });

  test("fails with friendly message when no card.lock exists", async () => {
    const fixture = await scaffoldCliFixture();
    cleanups.push(() => fixture.cleanup());

    const result = await fixture.runCli(["install"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/card\.lock/);
  });

  test("integrity mismatch is detected and reported", async () => {
    const repo = await createLocalCardRepo({ name: "@test/sample" });
    cleanups.push(() => rm(repo.tempDir, { recursive: true, force: true }));

    const fixture = await scaffoldCliFixture();
    cleanups.push(() => fixture.cleanup());
    await fixture.runCli(["add", `git+${repo.url}#v1.0.0`]);

    // Tamper with lockfile integrity
    const lockPath = join(fixture.projectRoot, ".agents/drwn/card.lock");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.cards[0].integrity = "sha256-tampered";
    await writeFile(lockPath, JSON.stringify(lock, null, 2));

    // Clear cache to force re-fetch
    await rm(
      join(fixture.agentsDir, "drwn", "cache"),
      { recursive: true, force: true },
    );

    const result = await fixture.runCli(["install"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/integrity/i);
  });
});
```

### Task 6.4: Run and commit

```bash
bun test test/commands-install.test.ts
bun test
bun run typecheck

git add cli/commands/install.ts cli/index.ts test/commands-install.test.ts
git commit -m "[feat:install] add drwn install command for lockfile bootstrap"
```

---

## Phase 7: Status Output for Git Origin

### Task 7.1: Update `drwn status` to surface `origin: git`

**Files:**
- Modify: `cli/commands/status.ts`

Find the section that lists cards and add origin annotation:

```typescript
// cli/commands/status.ts (snippet)

function formatCardEntry(entry: CardLockEntry): string {
  const origin = entry.origin === "store" ? "" : ` (${entry.origin})`;
  const versionStr = `${entry.version}${origin}`;
  return `  ${entry.name}@${versionStr}`;
}

// In the human-readable output:
for (const card of lock.cards) {
  this.context.stdout.write(formatCardEntry(card) + "\n");
}
```

Sample output:

```text
Cards:
  @team/baseline@1.3.0
  @upstream/observability@2.0.3 (git)
  @me/local-helpers@0.1.0 (file)
```

### Task 7.2: Update JSON output

Ensure `--json` output includes the origin field for each card:

```typescript
// cli/commands/status.ts (snippet for JSON path)

const cardsJson = lock.cards.map(c => ({
  name: c.name,
  version: c.version,
  origin: c.origin,
  ...(c.git ? { git: { url: c.git.url, ref: c.git.ref, commit: c.git.commit } } : {}),
}));
```

### Task 7.3: Test status output

**Files:**
- Modify: `test/commands-status.test.ts` (or relevant file)

Add a test that verifies `origin: git` is surfaced:

```typescript
test("status shows origin: git for git-origin cards", async () => {
  const repo = await createLocalCardRepo({ name: "@test/sample" });
  cleanups.push(() => rm(repo.tempDir, { recursive: true, force: true }));

  const fixture = await scaffoldCliFixture();
  cleanups.push(() => fixture.cleanup());
  await fixture.runCli(["add", `git+${repo.url}#v1.0.0`]);

  const result = await fixture.runCli(["status"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(/@test\/sample@1\.0\.0 \(git\)/);

  const jsonResult = await fixture.runCli(["status", "--json"]);
  const parsed = JSON.parse(jsonResult.stdout);
  const entry = parsed.cards.find((c: any) => c.name === "@test/sample");
  expect(entry.origin).toBe("git");
  expect(entry.git.url).toBe(repo.url);
});
```

### Task 7.4: Commit

```bash
bun test test/commands-status.test.ts
git add cli/commands/status.ts test/commands-status.test.ts
git commit -m "[feat:status] surface card origin in status output"
```

---

## Phase 8: Error-Path Polish

### Task 8.1: Translate Git errors to friendly user messages

**Files:**
- Modify: `cli/commands/install.ts`, `cli/commands/card/add.ts`

Wrap the `resolveCard` / `ensureCardPresent` calls with error-translation logic:

```typescript
function translateGitError(err: Error, card?: string): string {
  if (err instanceof GitError) {
    const stderr = err.cause?.stderr ?? "";
    if (/authentication|access denied|permission denied/i.test(stderr)) {
      return `Could not access remote: authentication failed. Verify your Git credentials.\n  Underlying error: ${stderr.trim()}`;
    }
    if (/repository not found|does not exist/i.test(stderr)) {
      return `Repository not found. Check the URL.\n  Underlying error: ${stderr.trim()}`;
    }
    if (/connection refused|could not resolve host|network is unreachable/i.test(stderr)) {
      return `Network failure reaching remote. Check your connection.\n  Underlying error: ${stderr.trim()}`;
    }
  }
  return err.message;
}
```

### Task 8.2: Add documentation hints to error output

When `drwn add git+url#ref` fails, append a hint:

```text
Hint: For authentication issues, configure your Git credential helper:
  https://git-scm.com/docs/gitcredentials
```

### Task 8.3: Test error paths

A few representative tests added to `test/commands-card-git-add.test.ts`:

```typescript
test("error message includes hint for auth failures", async () => {
  // ... mock or simulate auth failure ...
  expect(result.stderr).toMatch(/credential helper/);
});

test("error message names the URL that failed", async () => {
  const fixture = await scaffoldCliFixture();
  cleanups.push(() => fixture.cleanup());
  const result = await fixture.runCli(["add", "git+file:///bogus/path.git#v1.0.0"]);
  expect(result.stderr).toMatch(/file:\/\/\/bogus\/path\.git/);
});
```

### Task 8.4: Commit

```bash
bun test
git add cli/commands/install.ts cli/commands/card/add.ts test/commands-card-git-add.test.ts
git commit -m "[fix:install] translate git errors to actionable messages"
```

---

## Phase 9: Final Verification

### Task 9.1: Full test suite

```bash
bun test
```

Expected: all green; zero new failures; existing tests unaffected.

### Task 9.2: Typecheck

```bash
bun run typecheck
```

Expected: zero errors.

### Task 9.3: Release readiness

```bash
bun run verify:release --json
```

Expected: `"ok": true`.

### Task 9.4: Smoke test the new command flow

Manual smoke test with a local file:// repo:

```bash
# Set up a test repo
mkdir -p /tmp/smoke-test-card/source/skills/example
echo '{"name": "@me/smoke", "version": "1.0.0", "skills": {"include": ["example"]}}' > /tmp/smoke-test-card/source/card.json
echo "# example" > /tmp/smoke-test-card/source/skills/example/SKILL.md
git -C /tmp/smoke-test-card/source init -q
git -C /tmp/smoke-test-card/source add -A
git -C /tmp/smoke-test-card/source -c user.email=test@test commit -m "v1.0.0" -q
git -C /tmp/smoke-test-card/source clone --bare . /tmp/smoke-test-card/bare.git
git -C /tmp/smoke-test-card/source push /tmp/smoke-test-card/bare.git --tags || true

# Test the flow
mkdir -p /tmp/smoke-project
cd /tmp/smoke-project
drwn init
drwn add git+file:///tmp/smoke-test-card/bare.git#v1.0.0
cat .agents/drwn/card.lock | jq '.cards[0]'  # should show origin: git
drwn apply
drwn status
```

Expected:
- `drwn add` succeeds.
- `card.lock` shows `lockfileVersion: 2`, `origin: "git"`, populated `git` block.
- `drwn apply` materializes successfully.
- `drwn status` shows `@me/smoke@1.0.0 (git)`.

### Task 9.5: Final commit if needed

If any fixups were needed during verification, commit them.

### Task 9.6: Push and open PR

```bash
git push -u origin remyjkim/git-distribution-phase-1
gh pr create --title "[feat:git] Phase 1 — git+url card refs + drwn install" --body "$(cat <<'EOF'
## Summary

Phase 1 of the Git-distribution rollout (analysis 44 §11.F).

- New card ref form: `git+<url>#<ref>`
- Lockfile bumped to v2 with optional `git` block (read-compat for v1)
- New `drwn install` command for lockfile-driven bootstrap
- Cache directory at `~/.agents/drwn/cache/` for downloaded archives + extracted content
- Origin-dispatching resolver (no changes to existing store/file/npm flows)

## Test plan

- [ ] `bun test` passes (full suite)
- [ ] `bun run typecheck` passes
- [ ] `bun run verify:release --json` passes
- [ ] Manual smoke test with a local file:// repo (see implementation plan §9.4)
- [ ] Existing project lockfiles read correctly (read-compat for v1)
EOF
)"
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `git ls-remote` against a slow remote blocks for many seconds | Add a 30s timeout to the Bun.spawn call; surface as clear error |
| `tar` is unavailable on user's system | Refuse install with clear error; document that `tar` is a Phase-1 runtime dependency |
| GitHub rate-limits anonymous archive downloads | Phase 1 doesn't auth archive downloads; if rate-limit hit, document setting `GH_TOKEN` for `gh`-based fallback (deferred) |
| Lockfile v1 has subtly different field handling than v2's read-compat | Test thoroughly with a v1 fixture; add regression tests using existing-format fixture files |
| Bun's `fetch` doesn't handle redirects on archive endpoints | GitHub's archive endpoint redirects; Bun.fetch handles by default. Verify in smoke test. |
| Atomic rename across filesystems fails (extraction temp dir on different fs) | Mitigation: extract within the same parent directory as the target |
| The refs TTL cache becomes stale if a tag is rewritten | TTL is 60s; the integrity check catches mismatches even within the TTL |
| `drwn install` is slow on a project with 20+ cards | Phase 1 fetches sequentially. Phase 2 introduces parallelization. Acceptable for v1. |

---

## Testing Strategy

- **Build-as-test**: every phase ends in a green-test commit. No phase merges without its own test coverage.
- **No-network default**: file:// Git URLs are sufficient for the default test suite. Real-network tests are opt-in (e.g., `RUN_E2E=1 bun test test/integration/git-real-host.test.ts`).
- **Read-compat regression**: v1 lockfile fixtures are kept in `test/fixtures/lockfiles-v1/` and exercised by `test/core-card-lock.test.ts`.
- **End-to-end smoke**: manual smoke test in Phase 9.4 verifies the full add → install → apply flow works.

---

## Final Implementation Checklist

- [ ] Branch `remyjkim/git-distribution-phase-1` created.
- [ ] Phase 1: cache path helpers added.
- [ ] Phase 2: lockfile v2 schema + read-compat shipped.
- [ ] Phase 3: `card-git.ts` plumbing wrapper shipped.
- [ ] Phase 4: `parseCardRef` extended for `git+url#ref`.
- [ ] Phase 5: `resolveFromGit` shipped.
- [ ] Phase 6: `drwn install` command shipped.
- [ ] Phase 7: `drwn status` shows `origin: git`.
- [ ] Phase 8: friendly error paths.
- [ ] Phase 9: full verification green.
- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run verify:release --json` passes.
- [ ] No new lint/format warnings.
- [ ] Smoke test passes manually.
- [ ] PR opened.

---

## Notes

- This plan assumes task 28 (rebrand) has merged. If not, references to `drwn` should be read as `bgng` and `~/.agents/drwn/` as `~/.agents/bgng/`.
- The cache directory is intentionally **never** auto-cleaned in Phase 1. Phase 2 introduces `drwn store gc`. Cache size is small (KB per card) and acceptable to leak.
- `npm` origin handling is a placeholder. Phase 1 doesn't add npm-via-tarball support; that's a future enhancement and not on the Phase 2 roadmap either (analysis 44 §10 §N1).
- Phase 1 deliberately leaves the existing `cards/@scope/name/<version>/` layout untouched. Phase 2's migration (`drwn store migrate-to-git`) is the place where layout changes happen.
