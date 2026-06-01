# Task 05: BGNG Export Sessions Upload-Ready Hardening

## Objective

Improve the BGNG CLI export flow in `/Users/pureicis/dev/beginning-harness/cli` so exported session archives are reliably upload-ready for downstream analyzers and do not require risky manual repackaging.

This task is specifically about the `bgng export sessions` subcommand and adjacent export helpers.

## Why This Task Exists

During investigation of a failing archive uploaded into the Beginning Agents web app, we found a problematic archive at:

- `/Users/pureicis/Downloads/beginning-harness-skill-recommendation.tar.gz`

That archive contained `26` real session logs plus `26` macOS AppleDouble sidecar files named `._*.jsonl`.

Important nuance:

- the problematic archive does **not** match the current `bgng export sessions` layout
- current BGNG export emits namespaced paths like:
  - `claude/<file>.jsonl`
  - `claude/agents/<file>.jsonl`
  - `codex/<file>.jsonl`
- the problematic archive was a flat folder archive named:
  - `beginning-harness-skill-recommendation/...`

Direct reproduction of the current BGNG export command showed:

- the current export command discovered the expected session logs
- the direct `.tar` output was clean
- manually gzipping that direct `.tar` also stayed clean

So this task is not about fixing a proven current exporter bug that reproduces the uploaded archive exactly.

Instead, it is about:

1. hardening BGNG export so it is explicitly safe and upload-ready
2. reducing the chance that users manually repackage exported logs into polluted archives
3. making metadata suppression and archive validation explicit rather than implicit

## TDD Requirement

This task must follow the same TDD discipline used in the broader project:

- write failing tests first
- verify RED before code changes
- implement the minimum code to turn GREEN
- refactor only after tests pass

## Current State

Relevant files:

- `/Users/pureicis/dev/beginning-harness/cli/commands/export/sessions.ts`
- `/Users/pureicis/dev/beginning-harness/cli/core/export/session-discovery.ts`
- `/Users/pureicis/dev/beginning-harness/cli/core/export/archiver.ts`
- `/Users/pureicis/dev/beginning-harness/README.md`

Current behavior:

- discovers Claude logs by project slug under `~/.claude/projects`
- discovers Codex logs by `session_meta.payload.cwd` match under `~/.codex/sessions`
- writes an uncompressed `.tar` by default
- uses staged hardlinks/copies and then runs:
  - `tar cf <output> -C <stagingDir> .`

What is currently missing:

- export-specific automated tests
- explicit suppression of macOS metadata emission
- archive post-write validation
- a first-class upload-ready gzip output mode
- explicit user guidance that discourages Finder/manual repackaging

## Investigation Findings

### What works today

Direct local reproduction:

```bash
cd /Users/pureicis/dev/beginning-harness
bun run cli/index.ts export sessions --dry-run
bun run cli/index.ts export sessions --out /tmp/export.tar
tar -tf /tmp/export.tar
gzip -c /tmp/export.tar > /tmp/export.tar.gz
tar -tzf /tmp/export.tar.gz
```

Observed:

- clean archive namespace
- no `._*`
- no `__MACOSX`
- no hidden dotfile entries

### Why the task still matters

Real source session logs on this machine do carry macOS xattrs such as:

- `com.apple.provenance`

That means any alternate packaging path can still emit AppleDouble metadata if:

- a user Finder-compresses a folder
- a future exporter change enables mac metadata implicitly
- another machine or toolchain behaves differently

Because the downstream analyzer is sensitive to stray `.jsonl` members, BGNG should be explicit and defensive about archive cleanliness.

## Recommended Design

### Primary recommendation

Keep current session discovery semantics.

Do **not** redesign the Claude/Codex discovery model in this task.

Instead, harden the export artifact contract:

1. explicit metadata suppression
2. explicit archive validation
3. direct support for upload-ready `.tar.gz`
4. clearer user messaging

This gives the best risk-to-value ratio.

## Work Plan

### Phase 1: Add export-specific tests

Create tests around:

- `discoverClaudeSessions()`
- `discoverCodexSessions()`
- `archiveSessions()`
- the CLI command behavior for output naming and validation

Failing tests should prove:

1. archive member paths are namespaced exactly as expected
2. hidden files and metadata-like entries are not present in the final archive
3. gzip output mode produces a valid `.tar.gz`
4. validation fails if the archive contains disallowed entries

Suggested new test files:

- `cli/core/export/session-discovery.test.ts`
- `cli/core/export/archiver.test.ts`
- optionally `cli/commands/export/sessions.test.ts`

### Phase 2: Explicit metadata suppression

Update `archiveSessions()` in `cli/core/export/archiver.ts` so tar creation is explicit about metadata suppression.

Recommended approach:

- set `COPYFILE_DISABLE=1` in the tar subprocess environment
- include `--no-mac-metadata` when the platform tar supports it

Goal:

- do not rely on implicit local defaults

### Phase 3: Archive validation after write

After writing the archive:

1. list members
2. assert every member is expected
3. reject if any member:
   - starts with `._`
   - lives under `__MACOSX/`
   - is `.DS_Store`
   - is any hidden dotfile
   - falls outside the allowed namespace

Allowed member prefixes should be:

- `./claude/`
- `./claude/agents/`
- `./codex/`

Also assert:

- member count matches discovered input file count, ignoring directory entries

### Phase 4: Add first-class gzip support

Current export defaults to `.tar`.

Recommended improvement:

- support direct `.tar.gz` output as a first-class path

Two acceptable designs:

1. default to `.tar.gz`
2. keep `.tar` default, but add `--gzip` or `--format tar|tar.gz`

Recommendation:

- keep backward compatibility by supporting both
- prefer `.tar.gz` for upload-oriented flows

If changing the default feels too disruptive, add:

- `--gzip`
- README guidance recommending `.tar.gz` for web uploads

### Phase 5: Improve user guidance

After successful export, print a short line that the archive is upload-ready and should not be manually recompressed with Finder.

Also update README:

- explain the archive layout
- document the recommended upload artifact
- warn against ad-hoc folder compression if that bypasses BGNG’s validation guarantees

## Out of Scope

- changing project/session discovery heuristics
- changing Claude/Codex path matching logic unless a test proves a specific defect
- adding remote upload from the CLI into the analyzer service
- redesigning the archive format beyond cleanliness and gzip support

## Verification

At minimum:

```bash
cd /Users/pureicis/dev/beginning-harness
bun test
bun run typecheck
bun run cli/index.ts export sessions --dry-run
bun run cli/index.ts export sessions --out /tmp/bgng-export.tar
tar -tf /tmp/bgng-export.tar
```

If gzip support is added:

```bash
bun run cli/index.ts export sessions --out /tmp/bgng-export.tar.gz
tar -tzf /tmp/bgng-export.tar.gz
```

Required checks:

- no `._*`
- no `__MACOSX`
- no hidden entries
- only allowed `claude/`, `claude/agents/`, `codex/` namespace members
- archive member count matches discovered file count

## Success Criteria

This task is complete when:

1. BGNG export has automated tests for discovery and archive output
2. metadata suppression is explicit, not accidental
3. archive validation fails fast on polluted output
4. the CLI can produce an upload-ready artifact without manual repackaging
5. README and command output guide users toward the safe export path

