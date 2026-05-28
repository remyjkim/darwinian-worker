# bgng Export Init: Session Log Archiver

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every behavior change. Do not commit unless explicitly instructed.

**Goal:** Add a `bgng export sessions` command that collects all Claude Code and Codex session log files (`.jsonl`) for the current project (including worktrees), then archives them into `<project>/.agents/bgng/session-logs-<timestamp>.tar`.

**Branch:** `bgng-export-init` (based on `harness-card-v1.1`)

**Tech Stack:** Bun, TypeScript, Clipanion CLI, Node `fs`/`child_process` or Bun shell.

---

## Source Locations

Collect from both Claude Code and Codex. Keep the discovery layer source-oriented so additional agent log roots can be added later without changing archive or CLI code.

### Claude Code

Claude stores session logs under `~/.claude/projects/<slug>/` where the slug is the absolute project path with every `/` replaced by `-`.

Example: `/Users/jgbae/Projects/curation-labs/beginning-harness` → `-Users-jgbae-Projects-curation-labs-beginning-harness`

#### Project slug derivation

```ts
const projectRoot = gitRoot ?? process.cwd();
const projectSlug = projectRoot.replaceAll('/', '-');
const claudeProjectsDir = path.join(os.homedir(), '.claude/projects');
```

#### Worktree inclusion (prefix match)

Claude creates a separate slug for each worktree:

```
-Users-...-beginning-harness
-Users-...-beginning-harness--claude-worktrees-agitated-meitner-67bad9
-Users-...-beginning-harness--claude-worktrees-infallible-swanson-05c798
```

Collect **all** slugs whose name starts with `projectSlug` — this captures the root session and every worktree session in one pass.

```ts
const matchingSlugs = (await readdir(claudeProjectsDir))
  .filter(entry => entry.startsWith(projectSlug));
```

### Codex

Codex stores session rollouts globally under `~/.codex/sessions/YYYY/MM/DD/*.jsonl`, not in per-project directories. A rollout belongs to a project through its first `session_meta` record:

```json
{"type":"session_meta","payload":{"cwd":"/Users/jgbae/Projects/curation-labs/beginning-harness"}}
```

Scan `~/.codex/sessions/` recursively for non-empty `*.jsonl` files, parse the first JSONL record, and include files whose `session_meta.payload.cwd` is inside one of the current project roots.

```ts
const codexSessionsDir = path.join(os.homedir(), '.codex/sessions');
const sessionRoot = readFirstJsonLine(filePath)?.payload?.cwd;
const isMatch = projectRoots.some(root =>
  sessionRoot === root || sessionRoot.startsWith(root + path.sep)
);
```

#### Codex worktree inclusion

Prefer explicit Git worktree discovery over path-prefix guessing:

```ts
const projectRoots = await gitWorktreeRoots(projectRoot);
```

`gitWorktreeRoots(projectRoot)` should parse `git worktree list --porcelain` and return every `worktree <path>` entry for the repository. If that command is unavailable or fails, fall back to `[projectRoot]`.

This captures Codex sessions opened in the root checkout, regular Git worktrees, and Claude-created worktrees as long as Git reports them for the repository.

#### Archive paths

Avoid collisions between Claude and Codex paths by storing source-prefixed relative paths:

```
claude/<slug>/<session-file>.jsonl
codex/YYYY/MM/DD/<rollout-file>.jsonl
```

## Output

```
<cwd>/.agents/bgng/session-log-exports/<ISO-timestamp>.tar
```

- `<ISO-timestamp>` format: `YYYYMMDDTHHMMSS` (no colons, URL-safe)
- The `.agents/bgng/session-log-exports/` directory must be created if it does not exist
- The archive must preserve relative paths so the slug and session file are identifiable after extraction

## Tasks

### 1. Discovery ✅
- [x] Derive `projectSlug` from git root (via `git rev-parse --show-toplevel`), fall back to `cwd`; resolve symlinks via `realpath` so macOS `/var` → `/private/var` is handled correctly
- [x] Discover Git worktree roots for the current repository with `git worktree list --porcelain`; fall back to `[projectRoot]` on failure
- [x] Read `~/.claude/projects/` and collect all slug directories whose name **starts with** `projectSlug` (prefix match — captures root + all worktrees in one pass)
- [x] Recursively walk each matching Claude slug dir to enumerate **all** `.jsonl` files, including subagent logs nested at `<session-id>/subagents/agent-<id>.jsonl`
- [x] Recursively scan `~/.codex/sessions/` and include rollouts whose first `session_meta.payload.cwd` is under a discovered project/worktree root
- [x] Filter out empty files (0 bytes) for Claude; Codex empty files fall through naturally (null first-line parse)
- [x] `resolveProjectRoot` extracted to shared `session-discovery.ts` so command and core share one git-spawn implementation

**Implementation:** `cli/core/export/session-discovery.ts`

### 2. Archive ✅
- [x] Build a `.tar` (no compression) with `tar cf` via `Bun.spawn` (array-form args, no shell injection)
- [x] Destination: `.agents/bgng/session-log-exports/<timestamp>.tar` (`YYYYMMDDTHHMMSS` format)
- [x] Ensure output parent dir exists (`mkdir` with `{ recursive: true }`)
- [x] Stage files via hardlinks into a temp dir, fall back to `copyFile` on EXDEV (cross-device/Docker)
- [x] Clean up staging dir in `finally` block (verified by test)

**Implementation:** `cli/core/export/archiver.ts`

### 3. CLI surface ✅
- [x] Exposed as `bgng export sessions` (`paths = [["export", "sessions"]]`)
- [x] `--dry-run` — lists files with archive paths, exits 0, no write
- [x] `--out <path>` — overrides destination `.tar` path
- [x] Registered in `cli/index.ts`

**Implementation:** `cli/commands/export/sessions.ts`

### 4. Tests ✅
- [x] Unit: slug derivation produces correct string for known paths (3 cases)
- [x] Unit: Claude prefix filter returns root slug + worktree slugs, excludes unrelated projects
- [x] Unit: Claude recursive walk discovers subagent `.jsonl` files nested under `<session-id>/subagents/`
- [x] Unit: Claude empty-file filter (0-byte excluded)
- [x] Unit: Codex `session_meta.payload.cwd` match (exact + prefix) and exclude
- [x] Unit: Codex malformed first-line skipped silently
- [x] Unit: `gitWorktreeRoots` fallback in non-git dir
- [x] Unit: `resolveProjectRoot` in real git repo and non-git fallback
- [x] Unit: `makeTimestamp` format `/^\d{8}T\d{6}$/`
- [x] Unit: archiver staging-dir cleanup verified (before/after bgng-archive-* entries)
- [x] Integration: `--dry-run` exits 0 and prints expected file count + archive paths
- [x] Integration: `--out` archive is written and extractable (`tar tf` shows correct prefixed path)
- [x] Integration: default output path archive exists on disk (path extracted from stdout)
- [x] Integration: no files found exits 0 with warning message

**Tests:** `test/core-session-discovery.test.ts`, `test/core-archiver.test.ts`, `test/commands-export-sessions.test.ts`

### 5. Docs ✅
- [x] `bgng export sessions [--dry-run] [--out <path>]` added to Command Reference in `README.md`
- [x] `## How Export Works` section added — covers slug encoding, recursive subagent inclusion, Codex `session_meta.payload.cwd` matching, worktree inclusion, archive format and timestamp convention

---

## Implementation Notes

- Claude recursive walk: `discoverClaudeSessions` uses `walkJsonlFiles()` (shared with Codex path) to pick up both top-level session files and nested subagent logs under `<session-id>/subagents/`
- Archive paths preserve full relative structure: `claude/<slug>/<session-id>/subagents/agent-<id>.jsonl`
- Codex path uses `path.relative(codexSessionsDir, absolutePath)` for archive paths — handles any nesting depth
- `resolveProjectRoot` is exported from `session-discovery.ts` (not private to the command) so the git-spawn logic lives in one place

---

## Notes

- Do not compress (`.tar.gz`) in v1 — raw `.tar` keeps the implementation trivial and extraction fast
- The `.agents/` directory is gitignored; the archive should not be committed
- If no `.jsonl` files are found, exit 0 with a warning, do not create an empty archive
- Missing source roots are not errors: if `~/.claude/projects/` or `~/.codex/sessions/` does not exist, skip that source and continue
- Codex metadata parsing should be best-effort: unreadable files or malformed first records should be skipped with debug-level detail, not fail the export
