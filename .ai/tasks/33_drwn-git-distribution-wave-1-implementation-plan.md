# Task 33: drwn Git Distribution Wave 1 — Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for code-touching tasks where tests are the spec. Do not commit unless explicitly instructed.

**Status**: Ready For T1 Start After Task 28 (Rebrand) Merges
**Created**: 2026-06-01
**Updated**: 2026-06-01
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 main PR + 1 companion PR (13–19 sessions main, 1–2 sessions companion)
**Dependencies**: Task 28 (rebrand to `drwn`/`darwinian-harness`) merged
**References**: [analyses/52_drwn-target-architecture-post-wave-1.md, analyses/51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md, analyses/50_drwn-command-roles-across-git-rollout-phases.md, analyses/46_drwn-card-team-sharing-flow.md, analyses/44_drwn-git-storage-backend-options.md, analyses/43_drwn-cli-target-architecture.md, analyses/42_drwn-cli-vocabulary-and-multi-env-design.md, analyses/32_harness-cards-vs-flox-and-conda.md, analyses/29_harness-cards-target-architecture-v1_1.md, cli/core/card-store.ts, cli/core/card-lock.ts, cli/core/card-manifest.ts, cli/core/store-paths.ts]

**Supersedes:** Tasks 29 (Phase 1) and 30 (Phase 2) of the original three-phase rollout. Task 29's and 30's content is preserved as historical record; this plan is the canonical Wave 1 spec.

---

## Objective

Land the complete Git-backed card distribution model in one coordinated PR. After Wave 1 merges, drwn's local card store is per-card bare Git repositories, content is content-addressed by Git tree SHA, the full team-sharing flow (publish/push/fetch/clone/remote) is available, catalogs provide discovery with a pre-registered default community catalog, and history/maintenance affordances complete the picture.

Wave 1 deliberately skips the throwaway `cache/` archive layer that the original three-phase rollout would have built. The end state is identical to the original Phase 3 end state minus the deferred Wave 2 items (capture flow R6, manifest fields R12). The path is shorter.

The target post-merge state is fully specified in analysis 52. This document is the implementation plan to get there.

---

## Architecture (Brief Recap; see analysis 52 for the full spec)

Wave 1 introduces:

1. **`cli/core/git.ts`** — comprehensive Git plumbing wrapper. All `Bun.spawn(["git", ...])` calls funnel through this module.
2. **Per-card bare repos** at `~/.agents/drwn/cards/@scope/name.git/`. Each card has its own Git repo; tags = published versions.
3. **Content-addressed extraction** at `~/.agents/drwn/extracted/<tree-sha>/`. Multiple commits or cards with identical content share extraction.
4. **Lockfile v2** with `origin` field and `git` metadata block. Forward-only for Wave 1.
5. **Migration tool** `drwn store migrate-to-git` for the existing per-version layout.
6. **`drwn card publish` rewrite** using Git plumbing (`write-tree`, `commit-tree`, `update-ref`, `tag`).
7. **Team-sharing commands**: `drwn card remote add/list/set/remove`, `drwn card push`, `drwn card fetch`, `drwn card clone`.
8. **`drwn install`** — new top-level verb for bootstrap-from-lockfile.
9. **Card ref grammar** extended with `git+url#ref`, `git+url@range`, `github:owner/repo#ref`, `gitlab:owner/repo#ref` and the @range variants.
10. **Origin-dispatching resolver** with first-time URL→name discovery via shallow clone.
11. **Catalog support** with default community catalog pre-registration.
12. **`drwn search card`** searching across catalogs.
13. **History affordances**: `drwn card show` with Git log, `drwn card diff` with real Git diff.
14. **`drwn card validate <ref>`** for consumer-side validation.
15. **Maintenance commands**: `drwn store gc`, `drwn store verify`, `drwn store export`, `DRWN_STORE_READONLY` env var.
16. **`drwn outdated --fetch`** for remote-aware version checking.
17. **`writeAtomically()`** utility in `cli/core/fs.ts`.
18. **Companion PR**: `darwinian-harness/validate-card-action` reusable GitHub Action.
19. **Docs**: `drwn-card` GitHub topic convention, six-term vocabulary commit in operator docs.

**Explicitly deferred to Wave 2:**

- `drwn card new --from-project` capture flow (R6).
- Manifest schema v2 with `stability` / `lastValidatedWith` / `testStatusBadge` fields (R12).
- Persistent URL→name mapping cache (`url-card-map.json`).

---

## Tech Stack

- **Bun 1.2+** with `Bun.spawn` for Git shell-outs.
- **TypeScript** with Clipanion 4 CLI framework.
- **`git` 2.x** as a runtime dependency (assumed present on every developer machine).
- **`tar`** as a runtime dependency (assumed present; used by `git archive` extraction).
- **No new npm dependencies** beyond `semver` (already in use).

---

## Success Criteria

### Architecture

- [ ] `cli/core/git.ts` exists with the full surface from analysis 52 §9.1 and is the **only** module that calls `Bun.spawn(["git", ...])`.
- [ ] `~/.agents/drwn/cards/@scope/name.git/` is a bare Git repo for every card (after migration).
- [ ] `~/.agents/drwn/extracted/<tree-sha>/` is the materialization-target directory.
- [ ] No `~/.agents/drwn/cache/` directory is created. Wave 1 goes directly to bare repos.
- [ ] `cli/core/*` modules contain **zero** Clipanion imports and **zero** `process.exit` calls (already true per investigation; preserved).
- [ ] `resolveStoreRoot()` returns `~/.agents/drwn/`.

### Lockfile

- [ ] Lockfile is written as `lockfileVersion: 2` with `origin` and `git` fields per analysis 52 §4.
- [ ] Lockfile v2 is the only supported Wave 1 lockfile shape; no v1 reader shim is required.
- [ ] All entries have `git.commit` set when `origin` is `store` or `git`.

### Card refs

- [ ] `drwn add @scope/name@^1.0.0` resolves via the local bare-repo store.
- [ ] `drwn add file:./path` works (existing path unchanged).
- [ ] `drwn add git+https://github.com/owner/repo.git#v1.0.0` resolves via clone + extract.
- [ ] `drwn add git+https://github.com/owner/repo.git@^1.0.0` resolves via tag listing + semver matching.
- [ ] `drwn add github:owner/repo#v1.0.0` is shorthand for the `git+https://github.com/owner/repo.git#v1.0.0` form.
- [ ] `drwn add github:owner/repo@^1.0.0` is shorthand for the semver-range form.
- [ ] `drwn add gitlab:owner/repo#v1.0.0` works against `https://gitlab.com/owner/repo.git`.
- [ ] `drwn add gitlab:owner/repo@^1.0.0` semver-range works against GitLab.
- [ ] `drwn add git+file:///path/to/bare-repo.git#v1.0.0` works (test path; local file:// remote).
- [ ] All `git+` and shorthand refs require an explicit `#<ref>` or `@<range>`; missing both is rejected.

### Storage operations

- [ ] `drwn store migrate-to-git` converts an existing `~/.agents/drwn/cards/<scope>/<name>/<version>/` layout to per-card bare repos.
- [ ] Migration verifies integrity for every version; mismatches abort migration of that card.
- [ ] Migration is idempotent (re-running is a no-op).
- [ ] Migration with `--dry-run` reports without modifying.
- [ ] Migration removes the old per-version layout after successful integrity verification.
- [ ] `drwn store gc` removes unreferenced `extracted/<tree-sha>/` entries.
- [ ] `drwn store verify` re-checks integrity of every card's known versions.
- [ ] `drwn store export <output-dir>` produces a portable snapshot.
- [ ] `DRWN_STORE_READONLY=1` refuses every mutation; clear error message.

### Publish + team-sharing

- [ ] `drwn card publish <name> [--bump <level> | --version <v>]` creates a commit + tag in the bare repo using Git plumbing.
- [ ] `drwn card publish` refuses duplicate version publishes.
- [ ] `drwn card publish` extracts the tree to `extracted/<tree-sha>/` and verifies integrity.
- [ ] `drwn card remote add <name> <url> [--name <r>]` configures a remote on the bare repo.
- [ ] `drwn card remote list <name>` shows configured remotes.
- [ ] `drwn card remote set <name> <url>` changes a remote's URL.
- [ ] `drwn card remote remove <name> [--remote <r>]` removes a remote.
- [ ] `drwn card push <name> [--remote <r>]` pushes `main` + tags to the remote.
- [ ] `drwn card fetch <name> [--remote <r>]` runs `git fetch --tags`.
- [ ] `drwn card clone <url> [--as <name>]` clones a remote into the local bare-repo store.
- [ ] Non-fast-forward push fails cleanly with `GitNetworkError` + actionable hint.

### Install + apply

- [ ] `drwn install` fetches all missing cards from a project's lockfile, then runs `drwn apply`.
- [ ] `drwn install --frozen` refuses if any card resolution would modify the lockfile.
- [ ] `drwn install --no-apply` fetches without materializing.
- [ ] `drwn install` parallelizes fetches with bounded concurrency 4 (overridable via `DRWN_FETCH_CONCURRENCY`).
- [ ] `drwn apply` materializes from `extracted/<tree-sha>/` when lockfile entries have `origin: "store"` or `"git"`.
- [ ] Materialization output is byte-identical to pre-Wave-1 for cards that exist in both states.

### Discovery

- [ ] `drwn library add catalog <url>` shallow-clones and registers a catalog.
- [ ] `drwn library list catalog` shows registered catalogs.
- [ ] `drwn library refresh catalog [<scope>]` re-fetches catalogs.
- [ ] `drwn library remove catalog <scope-or-url>` unregisters a catalog.
- [ ] `drwn search card --scope @team` returns catalog matches.
- [ ] `drwn search card <name>` searches across all catalogs.
- [ ] Default community catalog `https://github.com/curation-labs/dh-cards-catalog-v1.git` is pre-registered on `drwn init` (unless `--no-default-catalogs`).

### History + validation

- [ ] `drwn card show <ref>` includes Git log of recent versions for the card.
- [ ] `drwn card diff <ref-a> <ref-b>` shows a real `git diff` between two tagged versions.
- [ ] `drwn card validate <ref>` resolves the ref, runs validation, reports issues without modifying the project.

### Documentation

- [ ] Operator guide section produced by Wave 1 uses only the six public-facing terms (Card, Store, Catalog, Project, Apply, Install).
- [ ] Operator guide documents the `drwn-card` GitHub topic convention.
- [ ] No use of deprecated pre-rebrand naming in active docs, package metadata, commands, or examples.

### Companion PR

- [ ] `darwinian-harness/validate-card-action` repo exists with v1 published.
- [ ] The action is documented in drwn's operator guide.
- [ ] Single-line usage works: `uses: darwinian-harness/validate-card-action@v1`.

### Gates

- [ ] `bun test` passes (full suite).
- [ ] `bun run typecheck` passes.
- [ ] `bun run verify:release --json` returns `"ok": true`.
- [ ] `npm pack --dry-run --json` produces a clean tarball.
- [ ] No new ESLint or formatter warnings.

---

## Decisions Locked Before Implementation

| # | Decision | Source |
|---|---|---|
| D1 | Skip the Phase-1 `cache/` directory entirely. Go directly to bare repos. | This plan + analysis 52 |
| D2 | Per-card bare repos at `~/.agents/drwn/cards/@scope/name.git/`. | analysis 44 §4.1 (Design A); analysis 52 §3.1 |
| D3 | Content-addressed extraction keyed by **tree SHA**, not commit SHA. | analysis 52 §3.4 |
| D4 | Shell out to `git` via `Bun.spawn` from a single wrapper module (`cli/core/git.ts`). | analysis 46 §19.H |
| D5 | Publish uses Git plumbing (`write-tree`/`commit-tree`/`update-ref`/`tag`); no working tree required. | analysis 52 §9.3 |
| D6 | Pin by **SHA**, not by tag, in the lockfile. Tag is for diagnostics; SHA is the integrity anchor. | analysis 47 §4.5; analysis 52 §4.5 |
| D7 | Default remote name is `origin`; multi-remote support via `--name <alias>` flag. | analysis 46 §6 |
| D8 | Authentication is Git's domain. drwn does not store credentials. | analysis 46 §10 |
| D9 | Catalog repos are shallow-cloned (depth=1) into `~/.agents/drwn/catalogs/`. | analysis 48 §10.1 |
| D10 | `drwn store gc` is explicit, not automatic. | analysis 48 §11.3 |
| D11 | `drwn install` parallelizes with bounded concurrency 4. Configurable via `DRWN_FETCH_CONCURRENCY`. | analysis 52 §18 |
| D12 | The Git plumbing wrapper is `cli/core/git.ts` — promoted from the original Phase 1 `card-git.ts` and significantly expanded. | This plan |
| D13 | Project configs never carry URLs. URLs live in the lockfile's `git` block and the bare repo's `[remote "origin"]` config. | analysis 46 §4.3 |
| D14 | Name collisions across different URLs are **errors** (`CARD_NAME_COLLISION`), not silent overwrites. | analysis 52 §8.5 |
| D15 | The vocabulary is locked to six public-facing terms: Card, Store, Catalog, Project, Apply, Install. | analysis 51 §4.1; analysis 52 §14 |
| D16 | `cli/core/*` stays import-clean: no Clipanion, no `process.exit`. Maintains library-mode viability for B6. | Investigation; analysis 52 §12.5 |
| D17 | Default test suite uses local `file://` Git URLs. Real-network tests are opt-in. | analysis 47 §11.3 |
| D18 | Lockfile v2 is forward-only for Wave 1; no v1 shim or legacy path-name migration is required. | This plan |

---

## Out of Scope

Wave 1 deliberately does NOT include:

- `drwn card new --from-project` capture flow (R6 → Wave 2).
- Manifest schema v2 with quality-signal fields (R12 → Wave 2).
- Persistent URL→name mapping cache (`url-card-map.json` → Wave 2).
- Submodule federation (Design B from analysis 44; long-term backlog).
- Registry service (catalogs are sufficient per analysis 51 §5.4).
- Electron desktop app (backlog B4; separate future work).
- Library mode publishing as a separate npm package (backlog B6).
- Typed error catalog generalization (backlog B5; Wave 1 introduces the pattern but doesn't classify every throw site).
- Enterprise allowlisting (backlog B2).
- Card signing / SLSA provenance (backlog B10).
- Static catalog browser site (backlog B7).

---

## Evidence Base

From the codebase investigation:

- **JSON output coverage is already complete** — all 20 inspection commands have `--json` (per investigation §Q1). No audit task needed; Wave 1 maintains this discipline.
- **`cli/core/*` is library-mode-clean** — zero Clipanion imports, zero `process.exit` calls (per investigation §Q2, §Q3). No refactoring needed.
- **Current `publishCard` is copy-based** — uses `cp()` and a `.integrity` file + JSON index (per investigation §Q4). Wave 1 replaces with Git plumbing.
- **Test fixtures need a file:// Git repo helper** — does not exist yet (per investigation §Q5). Wave 1 adds `test/fixtures/git-helpers.ts`.
- **Only 1 test file hard-codes per-version paths** — `test/core-card-lock.test.ts`, 3 occurrences in mock data (per investigation §Q6). Low migration risk.
- **`Bun.spawn` patterns are consistent** — `pipe` stdio, `await proc.exited`, exit-code check (per investigation §Q7). `runGit` standardizes.
- **No atomic write helper exists** — `writeJson()` in `card-store.ts` and `migration.ts` is naive (per investigation §Q8). Wave 1 adds `writeAtomically()` in `cli/core/fs.ts` and refactors callers.
- **Current `resolveStoreRoot()` already returns `~/.agents/drwn/`** — Wave 1 preserves that spelling and removes deprecated naming from active docs, tests, and examples.

---

## Entry Checks

```bash
git status --short --branch
bun test
bun run typecheck
bun run verify:release --json
git log --oneline -5  # confirm task 28 (rebrand) is in the base
```

Expected:

- Branch base includes task 28 (rebrand to `drwn`/`darwinian-harness`).
- Working tree clean or only intentional in-progress files.
- All gates green.

Create the branch:

```bash
git checkout -b remyjkim/git-distribution-wave-1
```

---

## Implementation Strategy

Nine sub-phases (A through I) for the main PR + one companion PR.

Each sub-phase ends in a green-test commit. The sub-phases are ordered so that each builds on previous foundations:

- **A — Foundation** establishes the Git plumbing wrapper, path helpers, atomic write utility, lockfile v2 schema, and ref parsing.
- **B — Resolver + Install** implements the origin-dispatching resolver and `drwn install`.
- **C — Migration + Publish Rewrite** converts the existing store to bare repos and rewrites publish with Git plumbing.
- **D — Team Sharing** adds the remote/push/fetch/clone primitives.
- **E — Discovery** adds catalog support, default catalog pre-registration, and `drwn search card`.
- **F — Affordances** adds history affordances (`card show` Git log, `card diff` real diff) and `drwn card validate`.
- **G — Maintenance** adds GC, verify, export, read-only env, and `outdated --fetch`.
- **H — Status + Docs** verifies JSON output completeness, updates docs.
- **I — Final Verification** is the end-to-end smoke test.
- **Companion PR** is the validation GitHub Action; lands separately.

Recommended commit cadence: one commit per task within each sub-phase, plus one wrap-up commit at the end of each sub-phase. Reviewers walk the chain chronologically.

---

## Sub-Phase A: Foundation

Goal: set up the building blocks that every other sub-phase depends on.

### Task A.1: Add `writeAtomically()` utility

**Files:**
- Modify: `cli/core/fs.ts`
- Create: `test/core-fs-atomic.test.ts`

```typescript
// cli/core/fs.ts (addition)

export async function writeAtomically(
  targetPath: string,
  content: string | Uint8Array,
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp.${randomBytes(8).toString("hex")}`;
  try {
    await writeFile(tempPath, content);
    await rename(tempPath, targetPath);
  } catch (err) {
    // Best-effort cleanup of temp file
    try { await rm(tempPath, { force: true }); } catch {}
    throw err;
  }
}
```

Test:

```typescript
// test/core-fs-atomic.test.ts

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAtomically } from "../cli/core/fs";

describe("writeAtomically", () => {
  test("writes content to the target path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "drwn-atomic-"));
    const target = join(dir, "subdir", "file.txt");
    await writeAtomically(target, "hello world");
    expect(existsSync(target)).toBe(true);
    expect(await readFile(target, "utf8")).toBe("hello world");
  });

  test("leaves no temp files after success", async () => {
    const dir = await mkdtemp(join(tmpdir(), "drwn-atomic-"));
    const target = join(dir, "file.txt");
    await writeAtomically(target, "x");
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dir);
    expect(files).toEqual(["file.txt"]);
  });

  test("overwrites existing file atomically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "drwn-atomic-"));
    const target = join(dir, "file.txt");
    await writeAtomically(target, "first");
    await writeAtomically(target, "second");
    expect(await readFile(target, "utf8")).toBe("second");
  });
});
```

Refactor existing `writeJson()` calls in `card-store.ts` and `migration.ts` to use `writeAtomically()`. Track these as smaller follow-up commits within this task.

Commit:

```bash
git add cli/core/fs.ts test/core-fs-atomic.test.ts
git commit -m "[feat:core] add writeAtomically utility for safe state mutations"
```

### Task A.1.5: Add error types module

**Files:**
- Create: `cli/core/errors.ts`

Create the shared error base before `cli/core/git.ts` imports it.

```typescript
// cli/core/errors.ts

export class DrwnError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly hints?: string[],
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DrwnError";
  }

  toJSON(): object {
    return {
      code: this.code,
      message: this.message,
      hints: this.hints,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}
```

Commit:

```bash
git add cli/core/errors.ts
git commit -m "[feat:errors] introduce DrwnError base class for typed errors"
```

### Task A.2: Add path helpers for bare repos and extracted content

**Files:**
- Modify: `cli/core/store-paths.ts`
- Modify: `test/core-store-paths.test.ts` (or create if missing)

Add the bare-repo, extracted, catalogs path resolvers:

```typescript
// cli/core/store-paths.ts (additions)

/** Path to a card's bare Git repo. */
export function resolveCardBareRepoPath(agentsDir: string, cardName: string): string {
  const parts = splitCardName(cardName);
  if (parts.length === 1) {
    return join(resolveCardsRoot(agentsDir), `${parts[0]}.git`);
  }
  // Scoped: @scope/name → cards/@scope/name.git
  return join(resolveCardsRoot(agentsDir), parts[0], `${parts[1]}.git`);
}

/** Path to extracted content keyed by tree SHA. */
export function resolveExtractedPath(agentsDir: string, treeSha: string): string {
  validateTreeSha(treeSha);
  return join(resolveStoreRoot(agentsDir), "extracted", treeSha);
}

/** Path to the catalogs directory. */
export function resolveCatalogsDir(agentsDir: string): string {
  return join(resolveStoreRoot(agentsDir), "catalogs");
}

/** Path to one catalog's clone. */
export function resolveCatalogPath(agentsDir: string, url: string): string {
  return join(resolveCatalogsDir(agentsDir), slugifyUrl(url));
}

/** Path to the catalogs index. */
export function resolveCatalogsIndexPath(agentsDir: string): string {
  return join(resolveStoreRoot(agentsDir), "catalogs.json");
}

function validateTreeSha(sha: string): void {
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error(`invalid tree sha: ${sha}`);
  }
}

function slugifyUrl(url: string): string {
  return url
    .replace(/^.*?:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/[/:]/g, "_")
    .toLowerCase();
}
```

Test:

```typescript
test("resolveCardBareRepoPath for scoped names", () => {
  expect(resolveCardBareRepoPath("/agents", "@me/foo")).toBe("/agents/drwn/cards/@me/foo.git");
});

test("resolveCardBareRepoPath for unscoped names", () => {
  expect(resolveCardBareRepoPath("/agents", "foo")).toBe("/agents/drwn/cards/foo.git");
});

test("resolveExtractedPath validates tree SHA", () => {
  expect(() => resolveExtractedPath("/agents", "not-a-sha")).toThrow();
  const validSha = "a".repeat(40);
  expect(resolveExtractedPath("/agents", validSha)).toBe(`/agents/drwn/extracted/${validSha}`);
});

test("resolveCatalogPath slugifies URLs", () => {
  expect(resolveCatalogPath("/agents", "https://github.com/team/cards.git"))
    .toBe("/agents/drwn/catalogs/github.com_team_cards");
});
```

Commit:

```bash
git add cli/core/store-paths.ts test/core-store-paths.test.ts
git commit -m "[feat:store] add path helpers for bare repos, extracted, catalogs"
```

### Task A.3: Create `cli/core/git.ts` with foundation primitives

**Files:**
- Create: `cli/core/git.ts`
- Create: `test/core-git-foundation.test.ts`
- Create: `test/fixtures/git-helpers.ts`

The full surface from analysis 52 §9 is large. This task creates the module skeleton + the foundation primitives (`runGit`, `runInRepo`, `initBare`, `revParse`, `catFileType`, `getCommitTree`, `configGet`, `configSet`). Subsequent tasks add more primitives as they're needed.

```typescript
// cli/core/git.ts (skeleton + foundation)

import { join } from "node:path";
import { DrwnError } from "./errors";  // (Task A.1.5)

const DEFAULT_TIMEOUT_MS = Number(process.env.DRWN_GIT_TIMEOUT_MS ?? 30_000);

export class GitError extends DrwnError {
  constructor(
    code: string,
    message: string,
    public readonly gitContext?: { args?: string[]; cwd?: string; stderr?: string; exitCode?: number },
  ) {
    super(code, message);
  }
}

export class GitNetworkError extends GitError { /* ... */ }
export class GitAuthError extends GitError { /* ... */ }
export class GitRefNotFoundError extends GitError { /* ... */ }

export interface GitRunOpts {
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
}

export interface GitRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runGit(args: string[], opts: GitRunOpts = {}): Promise<GitRunResult> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
    stdout: "pipe",
    stderr: "pipe",
    stdin: opts.stdin ? "pipe" : undefined,
  });

  if (opts.stdin && proc.stdin) {
    proc.stdin.write(opts.stdin);
    proc.stdin.end();
  }

  // Timeout enforcement
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => {
    try { proc.kill(); } catch {}
  }, timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode: exitCode ?? -1, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

export async function runInRepo(
  repoPath: string,
  args: string[],
  opts: GitRunOpts = {},
): Promise<GitRunResult> {
  return runGit(["--git-dir", repoPath, ...args], opts);
}

export async function initBare(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  const result = await runGit(["init", "--bare", path]);
  if (result.exitCode !== 0) {
    throw new GitError("GIT_INIT_FAILED", `git init --bare failed: ${result.stderr}`);
  }
}

export async function revParse(repoPath: string, ref: string): Promise<string> {
  const result = await runInRepo(repoPath, ["rev-parse", ref]);
  if (result.exitCode !== 0) {
    if (/unknown revision|bad revision|not a valid object name/i.test(result.stderr)) {
      throw new GitRefNotFoundError("GIT_REF_NOT_FOUND", `ref not found: ${ref}`);
    }
    throw new GitError("GIT_REV_PARSE_FAILED", `git rev-parse ${ref} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export async function catFileType(repoPath: string, sha: string): Promise<string> {
  const result = await runInRepo(repoPath, ["cat-file", "-t", sha]);
  if (result.exitCode !== 0) {
    throw new GitError("GIT_CAT_FILE_FAILED", `git cat-file -t ${sha}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export async function getCommitTree(repoPath: string, commitSha: string): Promise<string> {
  const result = await runInRepo(repoPath, ["rev-parse", `${commitSha}^{tree}`]);
  if (result.exitCode !== 0) {
    throw new GitError("GIT_GET_TREE_FAILED", `cannot get tree from commit ${commitSha}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export async function configGet(repoPath: string, key: string): Promise<string | null> {
  const result = await runInRepo(repoPath, ["config", "--get", key]);
  if (result.exitCode === 1 && !result.stderr) {
    return null;  // git config returns 1 when key is unset
  }
  if (result.exitCode !== 0) {
    throw new GitError("GIT_CONFIG_GET_FAILED", `git config --get ${key}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export async function configSet(repoPath: string, key: string, value: string): Promise<void> {
  const result = await runInRepo(repoPath, ["config", key, value]);
  if (result.exitCode !== 0) {
    throw new GitError("GIT_CONFIG_SET_FAILED", `git config ${key} ${value}: ${result.stderr}`);
  }
}
```

Test fixtures:

```typescript
// test/fixtures/git-helpers.ts

import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Create a local bare Git repo + a working source dir with a single card source.
 * Useful for end-to-end tests of Git URL refs against local file:// URLs.
 *
 * Returns:
 *   - url: file:// URL of the bare repo (for `drwn add git+<url>#<tag>`)
 *   - bareRepoPath: filesystem path to the bare repo
 *   - tempDir: parent dir to clean up at the end of the test
 */
export async function createLocalCardRepo(opts: {
  name: string;
  version?: string;
  skills?: string[];
  servers?: Record<string, unknown>;
}): Promise<{ url: string; bareRepoPath: string; tempDir: string }> {
  const version = opts.version ?? "1.0.0";
  const skills = opts.skills ?? ["sample-skill"];

  const tempDir = await mkdtemp(join(tmpdir(), "drwn-test-repo-"));
  const sourceDir = join(tempDir, "source");
  const bareRepoPath = join(tempDir, "bare.git");

  await mkdir(sourceDir, { recursive: true });

  // Write card.json
  const manifest = {
    name: opts.name,
    version,
    description: "Test card",
    skills: { include: skills },
    servers: opts.servers ?? {},
  };
  await writeFile(join(sourceDir, "card.json"), JSON.stringify(manifest, null, 2));

  // Write skill stubs
  for (const skill of skills) {
    await mkdir(join(sourceDir, "skills", skill), { recursive: true });
    await writeFile(
      join(sourceDir, "skills", skill, "SKILL.md"),
      `# ${skill}\n\nTest skill body.\n`,
    );
  }

  // Init bare repo
  await mkdir(bareRepoPath, { recursive: true });
  await runGitInTest(["init", "--bare", bareRepoPath]);

  // Stage and commit source into the bare repo using a temp index
  const tempIndex = join(tempDir, ".tmp-index");
  await runGitInTest(
    ["--git-dir", bareRepoPath, "--work-tree", sourceDir, "add", "-A"],
    { GIT_INDEX_FILE: tempIndex },
  );
  const treeShaResult = await runGitInTest(
    ["--git-dir", bareRepoPath, "write-tree"],
    { GIT_INDEX_FILE: tempIndex },
  );
  const treeSha = treeShaResult.stdout.trim();

  const commitShaResult = await runGitInTest(
    [
      "--git-dir", bareRepoPath,
      "commit-tree", treeSha,
      "-m", `Publish ${opts.name}@${version}`,
    ],
    {
      GIT_INDEX_FILE: tempIndex,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  );
  const commitSha = commitShaResult.stdout.trim();

  await runGitInTest(["--git-dir", bareRepoPath, "update-ref", "refs/heads/main", commitSha]);
  await runGitInTest(["--git-dir", bareRepoPath, "tag", `v${version}`, commitSha]);

  return {
    url: `file://${bareRepoPath}`,
    bareRepoPath,
    tempDir,
  };
}

/**
 * Add an additional version (tag) to an existing local card repo.
 */
export async function tagAdditionalVersion(
  repo: { bareRepoPath: string; tempDir: string },
  newVersion: string,
  skills?: string[],
): Promise<void> {
  // Update source's card.json + skills, then write-tree + commit-tree + tag
  // (Implementation detail; see Task A.3 test for usage)
}

async function runGitInTest(
  args: string[],
  env?: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["git", ...args], {
    env: env ? { ...process.env, ...env } : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode: exitCode ?? -1, stdout, stderr };
}
```

Tests for the foundation primitives:

```typescript
// test/core-git-foundation.test.ts

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit, initBare, revParse, configGet, configSet, GitRefNotFoundError } from "../cli/core/git";

describe("git foundation primitives", () => {
  const cleanups: string[] = [];
  afterAll(async () => {
    for (const d of cleanups) await rm(d, { recursive: true, force: true });
  });

  test("runGit returns exit code, stdout, stderr", async () => {
    const result = await runGit(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("git version");
  });

  test("initBare creates a valid bare repo", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-test-"));
    cleanups.push(tmp);
    const repo = join(tmp, "test.git");
    await initBare(repo);
    expect((await import("node:fs")).existsSync(join(repo, "HEAD"))).toBe(true);
  });

  test("configSet + configGet round-trip", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-test-"));
    cleanups.push(tmp);
    const repo = join(tmp, "test.git");
    await initBare(repo);
    await configSet(repo, "drwn.cardName", "@me/foo");
    expect(await configGet(repo, "drwn.cardName")).toBe("@me/foo");
  });

  test("configGet returns null for unset key", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-test-"));
    cleanups.push(tmp);
    const repo = join(tmp, "test.git");
    await initBare(repo);
    expect(await configGet(repo, "drwn.nonexistent")).toBeNull();
  });

  test("revParse throws GitRefNotFoundError for missing ref", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "drwn-test-"));
    cleanups.push(tmp);
    const repo = join(tmp, "test.git");
    await initBare(repo);
    await expect(revParse(repo, "nonexistent")).rejects.toThrow(GitRefNotFoundError);
  });
});
```

Commit:

```bash
bun test test/core-git-foundation.test.ts test/core-store-paths.test.ts test/core-fs-atomic.test.ts
bun run typecheck

git add cli/core/git.ts cli/core/fs.ts cli/core/store-paths.ts test/fixtures/git-helpers.ts test/core-git-foundation.test.ts test/core-store-paths.test.ts test/core-fs-atomic.test.ts
git commit -m "[feat:git] add git plumbing wrapper with foundation primitives"
```

### Task A.4: Extend `cli/core/git.ts` with remote and tree/commit primitives

Add the next batch of primitives needed by subsequent sub-phases:

- `lsRemote(url, refs?)` — remote ref enumeration
- `cloneBare(url, targetPath, opts?)` — bare clone
- `fetch(repoPath, remote, refspecs?)` — bring in refs from remote
- `push(repoPath, remote, refs)` — push refs to remote
- `remoteAdd/Set/Remove/List(repoPath, ...)` — remote management
- `writeTreeFromDir(repoPath, sourceDir)` — stage source as tree
- `commitTree(repoPath, treeSha, parent, message, author?)` — create commit
- `updateRef(repoPath, ref, sha)` — advance refs
- `createAnnotatedTag(repoPath, tag, sha, message)` — tagging
- `listTags(repoPath)` — list local tags
- `extractTreeToDir(repoPath, treeSha, targetDir)` — `git archive` to dir
- `log(repoPath, opts?)` — commit log
- `diff(repoPath, refA, refB)` — diff between refs
- `showBlob(repoPath, refColonPath)` — read a blob at a path

Each function implemented as a thin shell-out + result parsing + typed error throw on failure. Pattern from Task A.3 applies.

Each function gets a unit test using `createLocalCardRepo` + assertions on outputs.

Commit:

```bash
bun test test/core-git-*.test.ts
git add cli/core/git.ts test/core-git-*.test.ts
git commit -m "[feat:git] add remote, tree, commit, and inspection primitives"
```

### Task A.6: Lockfile v2 schema

**Files:**
- Modify: `cli/core/card-lock.ts`
- Modify: `test/core-card-lock.test.ts`

Schema definitions per analysis 52 §4.1. Refactor `writeCardLock` to use `writeAtomically()`.

Full implementation matches the spec in tasks 29 + 30; reproduced here briefly:

```typescript
export type CardOrigin = "store" | "git" | "file" | "npm";

export interface GitLockInfo {
  url?: string;
  ref?: string;
  commit: string;
}

export interface CardLockEntry {
  name: string;
  requested: string;
  version: string;
  path: string;
  integrity: string;
  manifest: CardManifest;
  skills: string[];
  registry: null;
  origin: CardOrigin;
  git?: GitLockInfo;
}

export interface CardLockfile {
  lockfileVersion: 2;
  store?: { minDrwnVersion?: string };
  cards: CardLockEntry[];
}
```

Tests cover: v2 round-trip and validation rejects (`origin: git` without `git` block; `origin` other than `git` with `git` block).

Commit:

```bash
bun test test/core-card-lock.test.ts
git add cli/core/card-lock.ts test/core-card-lock.test.ts
git commit -m "[feat:lockfile] bump to v2 with origin and git fields"
```

### Task A.7: `parseCardRef` extension for all new forms

**Files:**
- Modify: `cli/core/card-store.ts` (function `parseCardRef` and its helpers)
- Modify or create: `test/core-card-ref-parser.test.ts`

Supports all forms from analysis 52 §7.9:

- `@scope/name@<range>` → `origin: "store"`, range as semver range
- `file:./path` → `origin: "file"`, path
- `git+<url>#<ref>` → `origin: "git"`, explicit ref
- `git+<url>@<range>` → `origin: "git"`, semver range over tags
- `github:owner/repo#<ref>` → rewrites to `git+https://github.com/owner/repo.git#<ref>`
- `github:owner/repo@<range>` → rewrites to `git+https://github.com/owner/repo.git@<range>`
- `gitlab:owner/repo#<ref>` and `gitlab:owner/repo@<range>` → analogous for GitLab

The `ParsedCardRef` shape gains optional `gitUrl`, `gitRef`, `gitRange`, `gitSubpath` (future), `original` fields.

```typescript
export interface ParsedCardRef {
  origin: CardOrigin;
  name: string;                   // canonical name, populated after resolution for git refs
  range: string;                  // semver range; "*" for git refs without @range
  filePath?: string;              // origin: "file"
  gitUrl?: string;                // origin: "git"
  gitRef?: string;                // origin: "git", explicit ref form
  gitRange?: string;              // origin: "git", semver range form
  original: string;               // exact input string for diagnostics
}
```

Comprehensive tests cover every form + error cases (missing `#` or `@`, empty URL, malformed inputs).

Commit:

```bash
bun test test/core-card-ref-parser.test.ts
git add cli/core/card-store.ts test/core-card-ref-parser.test.ts
git commit -m "[feat:resolver] parseCardRef supports git+/github:/gitlab: with #ref and @range"
```

### Task A.8: Commit Sub-Phase A wrap-up

Run the full test suite to confirm Sub-Phase A is green end-to-end:

```bash
bun test
bun run typecheck
```

If any pre-existing tests broke (none expected per investigation §Q6), fix in this commit.

```bash
git commit --allow-empty -m "[checkpoint] Sub-Phase A complete: foundation primitives + lockfile v2 + ref parsing"
```

---

## Sub-Phase B: Resolver + Install

Goal: implement the origin-dispatching resolver and `drwn install`.

### Task B.1: Rewrite `resolveFromStore` for bare repos

**Files:**
- Modify: `cli/core/card-store.ts`

Replace the existing `resolveCard` logic for non-git refs. Where it used to list versions in `cards/<name>/`, it now lists tags in `cards/<name>.git/`.

```typescript
async function resolveFromStore(
  agentsDir: string,
  parsed: ParsedCardRef,
): Promise<ResolvedCard> {
  const barePath = resolveCardBareRepoPath(agentsDir, parsed.name);
  if (!existsSync(barePath)) {
    throw new DrwnError("CARD_NOT_FOUND", `card not in local store: ${parsed.name}`);
  }

  const tags = await git.listTags(barePath);
  const versions = tags.filter(t => /^v\d/.test(t)).map(t => t.slice(1));
  const targetVersion = semver.maxSatisfying(versions, parsed.range);
  if (!targetVersion) {
    throw new DrwnError("CARD_NO_MATCHING_VERSION",
      `no version of ${parsed.name} matches ${parsed.range}; available: ${versions.join(", ")}`,
    );
  }

  const tag = `v${targetVersion}`;
  const commit = await git.revParse(barePath, tag);
  const treeSha = await git.getCommitTree(barePath, commit);
  const extractedDir = await ensureExtracted(agentsDir, barePath, treeSha);

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
    origin: "store",
    git: { commit },
  };
}

async function ensureExtracted(
  agentsDir: string,
  barePath: string,
  treeSha: string,
): Promise<string> {
  const extractedDir = resolveExtractedPath(agentsDir, treeSha);
  if (existsSync(extractedDir)) return extractedDir;
  const tempDir = `${extractedDir}.tmp.${randomBytes(8).toString("hex")}`;
  await git.extractTreeToDir(barePath, treeSha, tempDir);
  await rename(tempDir, extractedDir);
  return extractedDir;
}
```

Test against a bare repo fixture (created via `createLocalCardRepo` then cloned into the test's agentsDir).

Commit:

```bash
git add cli/core/card-store.ts test/core-card-store-resolve.test.ts
git commit -m "[feat:resolver] resolve store-origin cards via bare repos and extracted/"
```

### Task B.2: Implement `resolveFromGit` with URL→name discovery

**Files:**
- Modify: `cli/core/card-store.ts`
- Create: `cli/core/card-resolver.ts` (optionally factor out the dispatcher)

Per analysis 52 §8.3. Key pieces:

- `discoverCardNameForUrl(agentsDir, url)` — shallow clone, read card.json, return name (no persistent cache in Wave 1).
- `assertOriginMatches(barePath, url)` — name-collision detection.
- `resolveSemverRangeAgainstTags(barePath, range)` — for `git+url@range` form.

Tests cover:

- First-time `drwn add git+url#v1.0.0` — creates bare repo, resolves ref, extracts.
- Repeat add against the same URL — uses existing bare repo.
- Name collision — clear error message.
- Semver range over tags — picks highest matching.
- Missing tag — `GitRefNotFoundError`.

Commit:

```bash
git add cli/core/card-store.ts test/commands-card-git-add.test.ts
git commit -m "[feat:resolver] resolve git-origin cards via bare-repo clone + URL discovery"
```

### Task B.3: Implement `drwn install` command

**Files:**
- Create: `cli/commands/install.ts`
- Modify: `cli/index.ts`
- Create: `test/commands-install.test.ts`

```typescript
// cli/commands/install.ts

export class InstallCommand extends Command {
  static paths = [["install"]];

  static usage = Command.Usage({
    description: "Fetch missing cards from card.lock, then materialize the project.",
    examples: [
      ["Standard bootstrap after fresh project clone", "drwn install"],
      ["Fetch but don't apply", "drwn install --no-apply"],
      ["CI-safe: fail if lockfile would change", "drwn install --frozen"],
    ],
  });

  frozen = Option.Boolean("--frozen", false);
  noApply = Option.Boolean("--no-apply", false);
  json = Option.Boolean("--json", false);

  async execute(): Promise<number> {
    const ctx = await getContext();
    const lock = await loadCardLock(ctx.projectRoot);

    if (!lock) {
      this.context.stderr.write("No card.lock found. Did you mean `drwn apply`?\n");
      return 1;
    }

    // Parallel fetch with bounded concurrency
    const concurrency = Number(process.env.DRWN_FETCH_CONCURRENCY ?? 4);
    const errors: Array<{ card: string; message: string }> = [];

    await runInParallel(lock.cards, concurrency, async (entry) => {
      try {
        await ensureCardPresent(ctx.agentsDir, entry, this.frozen);
      } catch (e) {
        errors.push({ card: entry.name, message: (e as Error).message });
      }
    });

    if (errors.length > 0) {
      this.outputErrors(errors);
      return 1;
    }

    if (this.noApply) {
      // Report success without materializing
      this.outputSuccess(lock.cards.length, false);
      return 0;
    }

    // Delegate to apply
    return this.cli.run(["apply"]);
  }
}

async function ensureCardPresent(
  agentsDir: string,
  entry: CardLockEntry,
  frozen: boolean,
): Promise<void> {
  // 1. If path exists and integrity matches, no-op
  if (existsSync(entry.path)) {
    const actualIntegrity = await computeCardIntegrity(entry.path);
    if (actualIntegrity === entry.integrity) return;
  }

  // 2. For store/git origin: ensure bare repo exists, extract pinned commit's tree
  if (entry.origin === "store" || entry.origin === "git") {
    if (!entry.git?.commit) {
      throw new Error(`lockfile entry for ${entry.name} missing git.commit`);
    }

    const barePath = resolveCardBareRepoPath(agentsDir, entry.name);

    if (!existsSync(barePath)) {
      if (!entry.git.url) {
        throw new DrwnError("CARD_NO_REMOTE_URL",
          `cannot fetch ${entry.name}: no URL recorded in lockfile and no local bare repo`,
        );
      }
      if (frozen) throw new DrwnError("FROZEN_VIOLATION", `--frozen but ${entry.name} requires clone`);
      await git.cloneBare(entry.git.url, barePath);
      await git.configSet(barePath, "drwn.cardName", entry.name);
    }

    // Ensure commit is fetched
    try {
      await git.revParse(barePath, entry.git.commit);
    } catch {
      if (frozen) throw new DrwnError("FROZEN_VIOLATION", `--frozen but ${entry.name} requires fetch`);
      await git.fetch(barePath, "origin", ["--tags"]);
      await git.revParse(barePath, entry.git.commit);  // throws if still missing
    }

    // Extract tree
    const treeSha = await git.getCommitTree(barePath, entry.git.commit);
    const extractedDir = await ensureExtracted(agentsDir, barePath, treeSha);

    // Verify integrity
    const actualIntegrity = await computeCardIntegrity(extractedDir);
    if (actualIntegrity !== entry.integrity) {
      throw new IntegrityError(
        "INTEGRITY_MISMATCH",
        `integrity mismatch for ${entry.name}@${entry.version}: expected ${entry.integrity}, got ${actualIntegrity}`,
      );
    }

    // Update lockfile path if changed
    if (entry.path !== extractedDir) {
      entry.path = extractedDir;
      // (caller is responsible for persisting; we mutate in place)
    }
    return;
  }

  // 3. For file origin: verify path exists
  if (entry.origin === "file") {
    if (!existsSync(entry.path)) {
      throw new DrwnError("CARD_FILE_MISSING", `file-origin card path missing: ${entry.path}`);
    }
    return;
  }

  // 4. npm origin not implemented in Wave 1
  if (entry.origin === "npm") {
    throw new DrwnError("CARD_NPM_NOT_IMPLEMENTED", "npm origin not supported in Wave 1");
  }
}
```

Tests cover:
- Bootstrapping a fresh-clone project: lockfile present, no local store, `drwn install` clones and extracts.
- `--frozen` mode refuses changes.
- `--no-apply` skips materialization.
- Mixed-origin lockfile (store + git + file).
- Integrity mismatch is detected.

Commit:

```bash
bun test test/commands-install.test.ts
git add cli/commands/install.ts cli/index.ts test/commands-install.test.ts
git commit -m "[feat:install] add drwn install command for lockfile bootstrap"
```

### Task B.4: Wire `drwn add` to dispatch on origin

**Files:**
- Modify: `cli/commands/add.ts` (or wherever `drwn add` lives post-rebrand)
- Modify: `cli/core/card-project.ts`

After parsing the ref, dispatch to `resolveFromStore` / `resolveFromGit` / `resolveFromFile`. The canonical card name + version is recorded in project config; URLs go into lockfile.

Test:
- `drwn add github:owner/repo#v1.0.0` adds canonical name to project config and full git metadata to lockfile.
- `drwn add @scope/name@^1.0.0` continues to work against the local bare-repo store.

Commit:

```bash
git add cli/commands/add.ts cli/core/card-project.ts test/commands-card-add-*.test.ts
git commit -m "[feat:add] dispatch on origin in drwn add; record canonical name in project"
```

### Task B.5: Sub-Phase B wrap-up

```bash
bun test
bun run typecheck
git commit --allow-empty -m "[checkpoint] Sub-Phase B complete: resolver + install"
```

---

## Sub-Phase C: Migration + Publish Rewrite

Goal: convert existing store layout to bare repos and rewrite publish to use Git plumbing.

### Task C.1: Implement `drwn store migrate-to-git`

**Files:**
- Create: `cli/commands/store/migrate-to-git.ts`
- Create: `cli/core/store-migrate.ts` (or extend existing `cli/core/migration.ts`)
- Modify: `cli/index.ts`

Algorithm per analysis 52 §11.1. Key steps:

1. Walk `~/.agents/drwn/cards/`, identify directories that aren't `.git` bare repos.
2. For each, enumerate versions (subdirs matching strict semver).
3. Sort chronologically (publish date from `versions.json`, fallback semver order).
4. Create temp bare repo `<name>.git.tmp`.
5. For each version: stage source → write-tree → commit-tree → tag → extract → verify integrity.
6. Atomic rename to `<name>.git`.
7. Remove the old `<name>/` per-version directory after successful verification.

Tests:
- Migration of single card with one version.
- Migration of card with multiple versions (chronological order).
- Integrity verification per version; mismatch errors out cleanly.
- `--dry-run` reports without modifying.
- Idempotency: re-run is a no-op.
- Interrupted-then-resumed migration (simulate by leaving a `.git.tmp` from a prior run).

Commit:

```bash
bun test test/commands-store-migrate-to-git.test.ts
git add cli/commands/store/migrate-to-git.ts cli/core/store-migrate.ts cli/index.ts test/commands-store-migrate-to-git.test.ts
git commit -m "[feat:migrate] convert per-version dirs to bare repos with integrity preservation"
```

### Task C.2: Rewrite `publishCard` with Git plumbing

**Files:**
- Modify: `cli/core/card-store.ts` (the `publishCard` function around line 288)
- Modify: `cli/commands/card/publish.ts`

Replace the `cp()`-based flow with the Git plumbing flow from analysis 52 §9.3.

Key concern: source content lives at `~/.agents/drwn/sources/<name>/` as a plain working dir. The bare repo lives at `~/.agents/drwn/cards/<name>.git/`. Publish uses a temp index + `git --work-tree=<source> --git-dir=<bare> add -A && write-tree`.

Tests:
- Publishing a new version creates a commit + tag + extraction.
- Publishing the same version twice errors out (`CARD_VERSION_EXISTS`).
- Source is not modified by publish (only its `card.json` version field is bumped per `--bump` / `--version`).
- Integrity hash in commit message matches the extracted content's hash.

The existing `publishCardWithSkills` test helper continues to work after `publishCard` is rewritten (the helper just calls `publishCard`; signature unchanged).

Commit:

```bash
bun test test/commands-card-author.test.ts test/scenarios-card-materialization.test.ts
git add cli/core/card-store.ts cli/commands/card/publish.ts test/commands-card-author.test.ts
git commit -m "[feat:publish] rewrite publish flow with git plumbing (write-tree + commit-tree + tag)"
```

### Task C.3: Sub-Phase C wrap-up

```bash
bun test
bun run typecheck
git commit --allow-empty -m "[checkpoint] Sub-Phase C complete: migration + publish rewrite"
```

---

## Sub-Phase D: Team Sharing

Goal: add the remote/push/fetch/clone primitives.

### Task D.1: `drwn card remote` namespace

**Files:**
- Create: `cli/commands/card/remote/add.ts`, `remove.ts`, `set.ts`, `list.ts`
- Modify: `cli/index.ts`

Each command is a thin Clipanion wrapper around `git.remoteAdd/Remove/Set/List` from `cli/core/git.ts`.

```typescript
// cli/commands/card/remote/add.ts (sketch)

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
      return 1;
    }
    await git.remoteAdd(barePath, this.remoteName, this.url);
    this.context.stdout.write(`Added remote ${this.remoteName} → ${this.url} for ${this.cardName}\n`);
    return 0;
  }
}
```

Tests in `test/commands-card-remote.test.ts`.

Commit:

```bash
git add cli/commands/card/remote/ cli/index.ts test/commands-card-remote.test.ts
git commit -m "[feat:share] drwn card remote add/list/set/remove"
```

### Task D.2: `drwn card push` and `drwn card fetch`

**Files:**
- Create: `cli/commands/card/push.ts`, `cli/commands/card/fetch.ts`
- Modify: `cli/index.ts`

`push` runs `git push origin main --tags` (with `--tags-only` skipping `main`). `fetch` runs `git fetch origin --tags`.

Error translation maps Git stderr patterns to typed errors:
- "remote: Repository not found" → `GitAuthError` with hint
- "Updates were rejected because the remote contains work" → `GitNonFastForwardError` with rebase hint
- "Could not resolve host" → `GitNetworkError`

Tests in `test/commands-card-push.test.ts` and `test/commands-card-fetch.test.ts` using local file:// targets.

Commit:

```bash
git add cli/commands/card/push.ts cli/commands/card/fetch.ts cli/index.ts test/commands-card-push.test.ts test/commands-card-fetch.test.ts
git commit -m "[feat:share] drwn card push and fetch"
```

### Task D.3: `drwn card clone`

**Files:**
- Create: `cli/commands/card/clone.ts`
- Modify: `cli/index.ts`

Clones a remote URL into the local bare-repo store. Discovers the card name from the remote (via shallow clone + `card.json` read), then renames the bare repo into the canonical path.

```typescript
export class CardCloneCommand extends Command {
  static paths = [["card", "clone"]];

  url = Option.String();
  asName = Option.String("--as", { required: false });

  async execute(): Promise<number> {
    const ctx = await getContext();
    const cardName = this.asName ?? (await discoverCardNameForUrl(ctx.agentsDir, this.url));
    const barePath = resolveCardBareRepoPath(ctx.agentsDir, cardName);
    if (existsSync(barePath)) {
      this.context.stderr.write(`Card ${cardName} already in local store. Use drwn card fetch.\n`);
      return 1;
    }
    await git.cloneBare(this.url, barePath);
    await git.configSet(barePath, "drwn.cardName", cardName);
    this.context.stdout.write(`Cloned ${cardName} from ${this.url}\n`);
    return 0;
  }
}
```

Tests in `test/commands-card-clone.test.ts`.

Commit:

```bash
git add cli/commands/card/clone.ts cli/index.ts test/commands-card-clone.test.ts
git commit -m "[feat:share] drwn card clone"
```

### Task D.4: End-to-end team-workflow scenario

**Files:**
- Create: `test/scenarios-team-workflow.test.ts`

A single integration test that exercises author + teammate via local file:// remotes:

1. Author publishes `@team/baseline@1.0.0` via `drwn card publish`.
2. Author configures remote at a temp bare repo and pushes.
3. Teammate (separate fixture) clones the same remote and runs `drwn install` (via a project lockfile that references the remote).
4. Verify materialization at the teammate's end is byte-identical to the author's.

Commit:

```bash
bun test test/scenarios-team-workflow.test.ts
git add test/scenarios-team-workflow.test.ts
git commit -m "[test:share] end-to-end team workflow scenario"
```

### Task D.5: Sub-Phase D wrap-up

```bash
bun test
bun run typecheck
git commit --allow-empty -m "[checkpoint] Sub-Phase D complete: team sharing primitives"
```

---

## Sub-Phase E: Discovery — Catalogs

Goal: add catalog support, default community catalog pre-registration, and `drwn search card`.

### Task E.1: Catalog data model and `cli/core/card-catalog.ts`

**Files:**
- Create: `cli/core/card-catalog.ts`

Implements `loadCatalog`, `saveCatalogIndex`, `loadCatalogIndex`, `addCatalog`, `removeCatalog`, `refreshCatalog` per analysis 52 §6.

Commit:

```bash
git add cli/core/card-catalog.ts test/core-card-catalog.test.ts
git commit -m "[feat:catalog] add card-catalog core module"
```

### Task E.2: `drwn library` catalog subcommands

**Files:**
- Create: `cli/commands/library/catalog/add.ts`, `remove.ts`, `list.ts`, `refresh.ts`
- Modify: `cli/commands/library/list.ts` (gain `catalog` type)
- Modify: `cli/index.ts`

Each command is a Clipanion wrapper around the core functions. Tests in `test/commands-library-catalog.test.ts`.

Commit:

```bash
git add cli/commands/library/catalog/ cli/commands/library/list.ts cli/index.ts test/commands-library-catalog.test.ts
git commit -m "[feat:catalog] drwn library add/remove/list/refresh catalog"
```

### Task E.3: Pre-register the default community catalog

**Files:**
- Modify: `cli/commands/init.ts`
- Create or modify: `cli/core/defaults.ts`

```typescript
// cli/core/defaults.ts

export const DEFAULT_COMMUNITY_CATALOGS: string[] = [
  "https://github.com/curation-labs/dh-cards-catalog-v1.git",
];
```

On `drwn init`, seed catalogs. Fail-soft if unreachable (log warning, continue). Opt-out via `--no-default-catalogs`.

**Operator action** (not code): create the GitHub org `darwinian-harness` and the `cards-catalog` repo with an initial `catalog.json` (empty `cards` array). Document in the operator guide.

Tests in `test/commands-init.test.ts`.

Commit:

```bash
git add cli/commands/init.ts cli/core/defaults.ts test/commands-init.test.ts
git commit -m "[feat:catalog] pre-register default community catalog on drwn init"
```

### Task E.4: `drwn search card`

**Files:**
- Create: `cli/commands/search/card.ts`
- Modify: `cli/index.ts`

Searches across all registered catalogs by name or scope. Tests in `test/commands-search-card.test.ts`.

Commit:

```bash
git add cli/commands/search/card.ts cli/index.ts test/commands-search-card.test.ts
git commit -m "[feat:catalog] drwn search card across registered catalogs"
```

### Task E.5: Sub-Phase E wrap-up

```bash
bun test
bun run typecheck
git commit --allow-empty -m "[checkpoint] Sub-Phase E complete: discovery via catalogs"
```

---

## Sub-Phase F: Affordances

Goal: surface Git history in `drwn card show`, real Git diff in `drwn card diff`, add `drwn card validate <ref>`.

### Task F.1: `drwn card show` with Git log

**Files:**
- Modify: `cli/commands/card/show.ts`

Add Git log output below the manifest section. Show remotes if configured.

Example output format from analysis 48 §12.1.

Tests cover: card with multiple versions shows full log; card with one version shows just that.

Commit:

```bash
git add cli/commands/card/show.ts test/commands-card-show.test.ts
git commit -m "[feat:history] drwn card show surfaces Git log and remotes"
```

### Task F.2: `drwn card diff` with real Git diff

**Files:**
- Modify: `cli/commands/card/diff.ts`

Use `git diff <refA> <refB>` against the local bare repo. Output is unified diff format.

Tests: diff between two real published versions shows expected changes.

Commit:

```bash
git add cli/commands/card/diff.ts test/commands-card-diff.test.ts
git commit -m "[feat:history] drwn card diff uses git diff for real version diffs"
```

### Task F.3: `drwn card validate <ref>`

**Files:**
- Create: `cli/commands/card/validate.ts`
- Modify: `cli/index.ts`

Resolves a ref (any form: `@scope/name@ver`, `file:./path`, `git+url#ref`), reads the manifest, runs the same validation `drwn card source doctor` runs. Reports issues without modifying project state.

Factor the validation logic out of `drwn card source doctor` into a shared `validateCardContent(extractedDir)` function in `cli/core/card-manifest.ts` so both commands call the same function.

Tests in `test/commands-card-validate.test.ts`.

Commit:

```bash
git add cli/commands/card/validate.ts cli/core/card-manifest.ts cli/index.ts test/commands-card-validate.test.ts
git commit -m "[feat:validate] drwn card validate <ref> consumer-side validation"
```

### Task F.4: Sub-Phase F wrap-up

```bash
bun test
bun run typecheck
git commit --allow-empty -m "[checkpoint] Sub-Phase F complete: history affordances + validate"
```

---

## Sub-Phase G: Maintenance

Goal: add GC, verify, export, read-only env, outdated --fetch.

### Task G.1: `drwn store gc`

**Files:**
- Create: `cli/commands/store/gc.ts`
- Modify: `cli/index.ts`

Algorithm per analysis 48 §11.2: collect live tree SHAs from all known project lockfiles, sweep `extracted/<tree-sha>/` removing unreferenced entries. Use the tracked-projects registry from analysis 43 (`~/.agents/drwn/projects.json`) — if not present, accept `--projects <path1>:<path2>:...`.

`--dry-run` reports without removing.

Tests in `test/commands-store-gc.test.ts`.

Commit:

```bash
git add cli/commands/store/gc.ts cli/index.ts test/commands-store-gc.test.ts
git commit -m "[feat:maint] drwn store gc removes unreferenced extractions"
```

### Task G.2: `drwn store verify`

**Files:**
- Create: `cli/commands/store/verify.ts`
- Modify: `cli/index.ts`

For each card bare repo: run `git fsck`, check each tag resolves cleanly, verify recorded integrity matches re-computed integrity from the extracted tree.

Reports a per-card summary. Exits 0 if everything's clean, 1 otherwise.

Tests in `test/commands-store-verify.test.ts`.

Commit:

```bash
git add cli/commands/store/verify.ts cli/index.ts test/commands-store-verify.test.ts
git commit -m "[feat:maint] drwn store verify checks integrity across the store"
```

### Task G.3: `drwn store export` + `DRWN_STORE_READONLY`

**Files:**
- Create: `cli/commands/store/export.ts`
- Modify: `cli/core/store-paths.ts` (or `cli/core/fs.ts`) — add `assertStoreWritable()` helper
- Modify: every store-mutating helper (`publishCardWithGit`, `cloneBare` users, `fetch` users, `addCatalog`, `gc`, `migrateToGit`) — call `assertStoreWritable()` at entry

`drwn store export <output-dir>` packages a subset of the store into a portable snapshot. `DRWN_STORE_READONLY=1` refuses every store mutation with a clear error.

Tests:
- `DRWN_STORE_READONLY=1 drwn card publish ...` errors out cleanly.
- `drwn store export` produces a directory that, mounted at `~/.agents/drwn/` with `DRWN_STORE_READONLY=1`, supports `drwn apply` end-to-end but refuses mutations.

Commit:

```bash
git add cli/commands/store/export.ts cli/core/store-paths.ts test/commands-store-export.test.ts test/scenarios-readonly-store.test.ts
git commit -m "[feat:maint] drwn store export + DRWN_STORE_READONLY env var"
```

### Task G.4: `drwn outdated --fetch`

**Files:**
- Modify: `cli/commands/outdated.ts`

Add `--fetch` flag. When set, run `git fetch origin --tags` against each card's configured remote (parallel, bounded concurrency 4) before reporting.

Tests in `test/commands-outdated-fetch.test.ts`.

Commit:

```bash
git add cli/commands/outdated.ts test/commands-outdated-fetch.test.ts
git commit -m "[feat:maint] drwn outdated --fetch checks remotes before reporting"
```

### Task G.5: Sub-Phase G wrap-up

```bash
bun test
bun run typecheck
git commit --allow-empty -m "[checkpoint] Sub-Phase G complete: maintenance commands"
```

---

## Sub-Phase H: Status + Docs

Goal: confirm JSON output completeness, refresh documentation, lock vocabulary.

### Task H.1: JSON-output audit

Per the investigation, all 20 inspection commands already have `--json`. Verify each emits the new origin field where relevant:

- `drwn status --json` includes `origin`, `git.url`, `git.ref`, `git.commit` per card.
- `drwn cards --json` (or `drwn card list --json`) same.
- `drwn install --json` outputs structured per-card success/error.
- `drwn add --json` returns resolved name + version + origin.

Add or extend tests in `test/commands-*-json.test.ts`.

Commit:

```bash
git add cli/commands/ test/
git commit -m "[feat:json] ensure all inspection commands emit origin + git metadata in JSON"
```

### Task H.2: Operator-guide updates

**Files:**
- Modify: docs site under `docs-docusaurus/docs/` (per task 27 layout)

Update content for:

1. **Six-term vocabulary lockdown.** The introduction explicitly defines Card / Store / Catalog / Project / Apply / Install. Deeper terms appear later.
2. **The `drwn-card` GitHub topic convention** — under a "Conventions" section.
3. **Updated command surface** — every Wave 1 command documented.
4. **Author workflow** — full publish + push + remote configuration.
5. **Consumer workflow** — `drwn install` for fresh-clone bootstrap.
6. **Catalog setup** — how to add a catalog, what the default community catalog is.
7. **Migration path** — for users with pre-Wave-1 stores: run `drwn store migrate-to-git`.

Commit:

```bash
git add docs-docusaurus/docs/
git commit -m "[doc:wave-1] full operator guide refresh: vocabulary, conventions, commands, workflows"
```

### Task H.3: Update README + maintainer docs

**Files:**
- Modify: `README.md`
- Modify: `docs/maintainers/*.md`

Ensure all examples use Wave-1 vocabulary and command surface. Remove references to the old per-version directory store.

Commit:

```bash
git add README.md docs/maintainers/
git commit -m "[doc:wave-1] update README + maintainer docs for Wave 1 surface"
```

### Task H.4: Sub-Phase H wrap-up

```bash
bun test test/docs-readiness.test.ts
git commit --allow-empty -m "[checkpoint] Sub-Phase H complete: status + docs"
```

---

## Sub-Phase I: Final Verification

Goal: end-to-end smoke + all gates green.

### Task I.1: Full test suite

```bash
bun test
```

Expected: all tests pass. Investigate any failures.

### Task I.2: Typecheck + release readiness

```bash
bun run typecheck
bun run verify:release --json
```

### Task I.3: Manual smoke test of the full team workflow

```bash
# 1. Set up a fake "team" Git remote (file://)
mkdir -p /tmp/wave1-smoke && cd /tmp/wave1-smoke
git init --bare baseline-card.git
git init --bare observability-card.git

# 2. Author side: create + publish + push
drwn card source new @team/baseline
$EDITOR ~/.agents/drwn/sources/@team/baseline/skills/code-review/SKILL.md
drwn card source add-skill @team/baseline code-review
drwn card source doctor @team/baseline
drwn card publish @team/baseline --version 1.0.0
drwn card remote add @team/baseline file:///tmp/wave1-smoke/baseline-card.git
drwn card push @team/baseline
cat ~/.agents/drwn/cards/@team/baseline.git/config  # should show drwn.cardName + origin remote

# 3. Inspect history
drwn card show @team/baseline@1.0.0   # includes Git log
drwn cards                              # lists @team/baseline

# 4. Teammate side: clone the project (simulate via a fresh fixture)
mkdir -p /tmp/wave1-teammate-project
cd /tmp/wave1-teammate-project
drwn init --no-default-catalogs
drwn add @team/baseline@^1.0.0
# Or simulate fresh-clone: just write a project config + lockfile manually
drwn install
drwn apply
drwn status   # shows materialized state
ls .claude/skills/code-review   # should exist as a symlink

# 5. Author publishes an update
$EDITOR ~/.agents/drwn/sources/@team/baseline/skills/code-review/SKILL.md
drwn card publish @team/baseline --bump minor
drwn card push @team/baseline

# 6. Teammate updates
cd /tmp/wave1-teammate-project
drwn card fetch @team/baseline
drwn outdated   # shows v1.1.0 available
drwn pin @team/baseline@1.1.0
drwn apply
```

Expected: every command exits 0 with expected output.

### Task I.4: Manual migration smoke test

Set up a pre-Wave-1 fixture (manually populate `~/.agents/drwn/cards/@me/foo/1.0.0/`), then run migration:

```bash
drwn store migrate-to-git --dry-run
drwn store migrate-to-git
ls ~/.agents/drwn/cards/@me/   # should show foo.git/
drwn card show @me/foo@1.0.0   # should show Git log
```

### Task I.5: Verify no `cache/` directory was created

```bash
ls ~/.agents/drwn/ | grep -v cache  # cache/ should NOT exist
```

This is a deliberate Wave 1 property: the throwaway cache layer is skipped.

### Task I.6: Push + PR

```bash
git push -u origin remyjkim/git-distribution-wave-1
gh pr create --title "[feat:git] Wave 1 — Git distribution + team sharing (collapsed Phases 1+2)" --body "$(cat <<'EOF'
## Summary

Wave 1 of the Git-distribution rollout. Collapses the original Phase 1 (Git URL refs with archive cache) and Phase 2 (per-card bare repos) into one PR, going directly to bare repos. Skips throwaway cache infrastructure.

Per analysis 52, this lands:
- Per-card bare repos at `~/.agents/drwn/cards/@scope/name.git/`
- Content-addressed extraction at `~/.agents/drwn/extracted/<tree-sha>/`
- Lockfile v2 with origin + git metadata
- Migration from per-version layout
- Team-sharing commands (publish/push/fetch/clone/remote)
- `drwn install` top-level bootstrap verb
- Card refs: `@scope/name@range`, `file:./path`, `git+url#ref`, `git+url@range`, `github:owner/repo#ref|@range`, `gitlab:owner/repo#ref|@range`
- Catalog support + default community catalog pre-registration
- `drwn search card`
- History affordances (`card show` log, `card diff` real)
- `drwn card validate <ref>`
- Maintenance: gc, verify, export, `DRWN_STORE_READONLY`
- `drwn outdated --fetch`
- `writeAtomically()` utility
- Companion PR (separate): `darwinian-harness/validate-card-action`

## Architectural disciplines preserved

- Filesystem-as-API (stable contract)
- CLI-as-kernel (no daemon)
- Atomic writes (via `writeAtomically()`)
- `cli/core/*` import-clean (no Clipanion, no `process.exit`)
- JSON output stable across commands
- Typed errors (DrwnError hierarchy)

## What's deferred to Wave 2

- `drwn card new --from-project` capture flow (R6)
- Manifest schema v2 quality-signal fields (R12)
- Persistent URL→name mapping cache

## Test plan

- [ ] `bun test` passes (full suite)
- [ ] `bun run typecheck` passes
- [ ] `bun run verify:release --json` passes
- [ ] Manual team-workflow smoke test (see implementation plan §I.3)
- [ ] Manual migration smoke test (§I.4)
- [ ] No `~/.agents/drwn/cache/` directory created (§I.5)
EOF
)"
```

---

## Companion PR: `darwinian-harness/validate-card-action`

Lands in a **separate repo**, separate PR. Can ship before, alongside, or after the main Wave 1 PR.

### Task CP.1: Create the repo

```bash
gh repo create darwinian-harness/validate-card-action --public --description "Reusable GitHub Action that validates drwn card sources on PRs."
```

### Task CP.2: Write `action.yml`

```yaml
name: 'Validate drwn Card Source'
description: 'Runs `drwn card source doctor` on a card source repo to validate manifest, skills, and MCP definitions.'
author: 'Darwinian Harness'

inputs:
  card-source-path:
    description: 'Path to the card source directory (default: repo root)'
    required: false
    default: '.'
  drwn-version:
    description: 'drwn version to install (default: latest)'
    required: false
    default: 'latest'

runs:
  using: 'composite'
  steps:
    - name: Set up Bun
      uses: oven-sh/setup-bun@v1
      with:
        bun-version: latest

    - name: Install drwn
      shell: bash
      run: |
        if [ "${{ inputs.drwn-version }}" = "latest" ]; then
          npm install -g darwinian-harness
        else
          npm install -g darwinian-harness@${{ inputs.drwn-version }}
        fi

    - name: Validate card source
      shell: bash
      working-directory: ${{ inputs.card-source-path }}
      run: drwn card source doctor .
```

### Task CP.3: Write README

```markdown
# Validate drwn Card Source

A reusable GitHub Action that validates a drwn card source on every push and PR.

## Usage

```yaml
name: Validate Card
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: darwinian-harness/validate-card-action@v1
```

## Inputs

| Input | Description | Default |
|---|---|---|
| `card-source-path` | Path to the card source within the repo | `.` |
| `drwn-version` | drwn version to install | `latest` |
```

### Task CP.4: Tag and publish

```bash
git tag v1.0.0 -a -m "Initial release"
git tag v1 -f
git push origin main --tags --force-with-lease
```

### Task CP.5: Document in main repo

In `docs-docusaurus/docs/` under a "Publishing a card" section:

```markdown
## Validate your card on every PR

Add this to your card source repo's `.github/workflows/validate.yml`:

```yaml
name: Validate Card
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: darwinian-harness/validate-card-action@v1
```

One-line setup; runs `drwn card source doctor` on every push.
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Wave 1 PR is too large to review in one pass | Sub-phase commits in chronological order; reviewer walks chain |
| Migration corrupts existing card content | Per-version integrity verification before replacing the old layout |
| `git ls-remote` against slow remotes blocks | `DRWN_GIT_TIMEOUT_MS` env var (default 30s); typed `GitNetworkError` |
| Tag rewriting on remote causes silent drift | SHA-pinned lockfile detects; clear error |
| First-time URL→name discovery is slow (shallow clone) | One-time cost; Wave 2 adds persistent cache |
| Concurrent publishes cause non-fast-forward | Standard Git collaboration; document fetch-bump-republish pattern |
| `DRWN_STORE_READONLY` bypass attempts | Every store-mutating helper calls `assertStoreWritable()` at entry; comprehensive coverage |
| Atomic writes fail on cross-filesystem rename | Temp file in same parent dir as target ensures same filesystem |
| Default catalog repo doesn't exist yet | Fail-soft warning during `drwn init`; functionality works without it |
| Bare repo's `[drwn]` config section conflicts with future versions | `drwn.formatVersion` field documents the repo metadata format |
| Companion PR repo doesn't exist on action.yml's first reference | Create repo before merging main PR; smoke test the action standalone |

---

## Testing Strategy

- **Per-task green commits.** Each task ends green; the sub-phase is a chain of green commits.
- **No-network default suite.** All tests use local `file://` Git URLs via `createLocalCardRepo`. Real-network tests opt-in via `RUN_E2E=1` (separate suite under `test/integration/`).
- **Integration scenario tests.** End-to-end team-workflow scenario covers author + teammate flows together (Task D.4).
- **Migration regression.** A pre-Wave-1 fixture is migrated; materialization output compared byte-for-byte with pre-migration baseline.
- **Read-only store tests.** Scenario test mounts an exported store read-only and verifies `drwn apply` works, mutations error.
- **Smoke tests** in Task I.3 and I.4 run manually before opening the PR.

---

## Final Implementation Checklist

- [ ] Branch `remyjkim/git-distribution-wave-1` created from a base that includes task 28.
- [ ] Sub-Phase A: foundation (writeAtomically, typed errors, git.ts, paths, lockfile v2, parseCardRef) shipped.
- [ ] Sub-Phase B: resolver + install shipped.
- [ ] Sub-Phase C: migration + publish rewrite shipped.
- [ ] Sub-Phase D: team sharing (remote/push/fetch/clone) shipped.
- [ ] Sub-Phase E: discovery (catalogs + search) shipped, default catalog pre-registration.
- [ ] Sub-Phase F: affordances (card show log, diff, validate) shipped.
- [ ] Sub-Phase G: maintenance (gc, verify, export, readonly, outdated --fetch) shipped.
- [ ] Sub-Phase H: status + docs shipped.
- [ ] Sub-Phase I: full verification green.
- [ ] Companion PR (`darwinian-harness/validate-card-action`) ships v1.
- [ ] All gates pass: `bun test`, `bun run typecheck`, `bun run verify:release --json`.
- [ ] Manual smoke tests pass (team workflow, Git layout migration, no cache/).
- [ ] No `~/.agents/drwn/cache/` directory exists after Wave 1.
- [ ] `resolveStoreRoot()` returns `~/.agents/drwn/`.
- [ ] Both PRs opened.

---

## Notes

- **Architectural discipline carries forward.** The CLI-as-kernel + filesystem-as-API + atomic-writes + JSON-stable + typed-errors disciplines are not just Wave 1 concerns. Every post-Wave-1 task (including Wave 2 and the backlog) honors them. New code review against these principles.
- **Library mode (B6) is genuinely close.** Investigation confirmed `cli/core/*` is already free of Clipanion and `process.exit`. Wave 1 maintains this. A future task can publish `darwinian-harness-core` as a separate npm package with no additional refactoring.
- **The Electron desktop app (B4) sits on this foundation.** Filesystem state + JSON output + atomic writes are exactly what an Electron app needs to integrate. Wave 1 doesn't build the app, but it ensures the substrate is ready.
- **The collapsed plan saves work compared to the original three-phase rollout.** Estimated 13–19 sessions (Wave 1) + 3–6 sessions (Wave 2) = 16–25 sessions total. The original three-phase rollout estimated 19–31 sessions plus the `cache/` migration overhead. Roughly 15–25% less total work.
- **Per-task commits within each sub-phase are encouraged.** They give the reviewer (and future archaeology) a clear chain of work. A single squash-merge at the end loses this granularity.
