# ABOUTME: Implementation plan to drive the drwn Windows CI lane to green — git-native tree extraction plus platform-aware test assertions.
# ABOUTME: Picks up Task 59 Phase 6 (Windows lane landed but not green) and sequences the remaining functional and test fixes into TDD increments.

# Task 60: drwn Windows CI Green — Implementation Plan

**Status**: Planning
**Created**: 2026-06-29
**Updated**: 2026-06-29
**Assigned**: Claude + Remy
**Priority**: Medium
**Estimated Effort**: ~3 phased increments (each independently shippable / reviewable)
**Dependencies**: Task 59 (portable write path — Windows lane added, non-blocking), Analysis 81 (Windows portability investigation)
**References**: [.ai/analyses/81_drwn-cli-windows-portability-investigation.md, .ai/tasks/59_drwn-portable-multi-surface-write-path-implementation-plan.md, cli/core/git.ts, cli/core/archive.ts, cli/core/card-store.ts, cli/core/paths.ts, cli/core/store-paths.ts, test/core-paths.test.ts, test/core-store-paths.test.ts, .github/workflows/ci.yml]

---

## Objective

Make `bun test` pass on `windows-latest` and flip the Windows CI lane back to a **required, blocking** gate. Task 59 cleared the four startup/write blockers (home resolution, symlinks→copy, system-tar→node-tar, `/usr/bin/env`) and added a Windows matrix lane, but the lane is currently **non-blocking** (`continue-on-error` on `windows-latest`) because a node-tar-on-Windows bug and a body of POSIX-path test assertions remain.

## Success Criteria

- [ ] `Validate (windows-latest)` passes `bun test` (0 failures) with no per-test hangs.
- [ ] `card publish` and every command that round-trips a git tree works on Windows.
- [ ] The `continue-on-error: ${{ matrix.os == 'windows-latest' }}` line is **removed** from `.github/workflows/ci.yml`; Windows is a required gate again.
- [ ] No regression on `ubuntu-latest` or macOS (`bun test` stays green there).
- [ ] Card content integrity hashes are byte-identical across OSes (no CRLF drift introduced by the extraction change).

## Already landed (in the CI-hardening PR #24 — do not redo)

| Fix | Site | Notes |
|---|---|---|
| `/usr/bin/env npm` → resolved npm | `cli/core/process.ts` `npmCommand()` | `Bun.which("npm") ?? "npm.cmd"` on win32 (Bun.spawn does not search PATHEXT for a bare `.cmd` name); used in `catalogs.ts`, `skill-packages.ts`. |
| Directory/file `fsync` EPERM | `cli/core/managed-file.ts`, `cli/core/write-record.ts` | fsync is best-effort; correctness comes from the atomic rename. Directory fsync is unsupported on Windows. |
| Spawn-hang hardening | `test/helpers.ts`, `test/cli-*.test.ts` | `stdin: "ignore"`, `Bun.which("bun")`, `fileURLToPath`, raised help-test timeouts, `GIT_TERMINAL_PROMPT=0`. |
| Bash-scenario tests | 4 `scenarios-*-bash` tests | `skipIf(process.platform === "win32")`. |
| Windows lane non-blocking | `.github/workflows/ci.yml` | `continue-on-error` on `windows-latest` — **this task removes it at the end**. |

These took the Windows lane from **860 → 176** failures.

---

## Root cause analysis (the dominant cluster)

**~53 of the 176 remaining failures** (every test that calls `card publish`) trace to one bug: the `git archive → node-tar extract` round-trip in `extractTreeToDir` (`cli/core/git.ts:346`) **drops nested file entries on Windows while still creating their parent directories**. It affects hooks (`policy.ts`), skills (`SKILL.md`), and persona (`PERSONA.md`) identically.

Localized by elimination:
1. Source files exist — publish's pre-validation (`card-store.ts:757`) passes.
2. The extracted tree contains `hooks/<name>/` but **not** `hooks/<name>/policy.ts`.
3. A git tree cannot store an empty directory, so `policy.ts` is necessarily in the tree and in the `git archive` tar output.
4. ⇒ `node-tar` v7.5.19 `tar.x` is dropping the file entry on `win32` while creating the directory entry. (Not reproducible on macOS/Linux, where node-tar extracts the same archive correctly.)

The remaining ~120 failures are dominated by **POSIX-path test assertions** (`path.join` yields `\` on Windows; tests hardcode `/`), e.g. `core-paths.test.ts` (17), `core-store-paths.test.ts` (11), rippling into integration/e2e files. The production code using `node:path` is correct per-OS (Analysis 81, Finding 7); the **tests** assume POSIX separators.

---

## Strategy — two solutions considered (per rule 06)

### The extraction bug

**Option A (chosen): extract git trees with git itself, no tar.**
Replace the `git archive | node-tar` round-trip with a temp-index `read-tree` + `checkout-index`. git writes the working tree natively and robustly on every OS, eliminating the node-tar dependency for this path entirely. Must pin `core.autocrlf=false` and `core.eol=lf` for the checkout so checked-out bytes stay identical to the archived blob bytes (otherwise integrity hashes drift on Windows).

**Option B (rejected): keep node-tar, work around the drop.**
E.g. upgrade/patch node-tar, disable its path-reservation concurrency (`tar.x({ ..., noResume })`-style), or post-verify-and-retry missing entries. Rejected: it chases a third-party Windows bug we can't reproduce locally, keeps a fragile round-trip, and the integrity guarantee still rides on node-tar byte-fidelity. Option A removes the whole class of problem and is git-native.

> Decision is provisional until verified in CI; if `checkout-index` proves to carry its own Windows surprises, fall back to B with a pinned node-tar and an explicit entry-count assertion.

### The path-literal assertions

**Chosen: make tests platform-aware** — build expected paths with `path.join()`/the production resolver instead of hardcoded `/`-literals. Production keeps native `node:path` behavior. (The alternative — forcing POSIX separators throughout production path builders — was rejected: larger blast radius, changes on-disk/serialized path shape, and unnecessary since the fundamentals are already portable.)

---

## Phases

### Phase 1 — git-native tree extraction (highest value; clears ~53 failures)

Rewrite `extractTreeToDir` (`cli/core/git.ts`) to avoid tar. Scaffolding:

```ts
export async function extractTreeToDir(repoPath: string, treeSha: string, targetDir: string): Promise<void> {
  const tempIndex = join(dirname(targetDir), `.drwn-index-${randomBytes(8).toString("hex")}`);
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  const env = { GIT_INDEX_FILE: tempIndex };
  try {
    const readTree = await runInRepo(repoPath, ["read-tree", treeSha], { env });
    throwForFailure(readTree, "GIT_READ_TREE_FAILED", `git read-tree failed for ${treeSha}`, ["read-tree", treeSha]);
    // -c core.autocrlf=false,core.eol=lf so checked-out bytes match the blob bytes
    // (keeps computeCardIntegrity hashes identical across OSes).
    const checkout = await runGit(
      ["-c", "core.autocrlf=false", "-c", "core.eol=lf",
       "--git-dir", repoPath, "--work-tree", targetDir, "checkout-index", "-a", "-f"],
      { env },
    );
    throwForFailure(checkout, "GIT_CHECKOUT_INDEX_FAILED", `git checkout-index failed for ${treeSha}`, ["checkout-index"]);
  } finally {
    await rm(tempIndex, { force: true });
  }
}
```

- TDD: add a test that publishes a card with a nested hook `policy.ts` + skill `SKILL.md`, extracts, and asserts the leaf files exist with byte-identical content (guards the autocrlf concern). This passes on macOS today and is the regression net for Windows.
- `cli/core/archive.ts` stays for `store export`/seed/skill-package `.tgz` (those are real tarballs, not git trees) — out of scope here.

### Phase 2 — platform-aware path assertions (clears the bulk of the remainder)

Systematically convert hardcoded POSIX path literals to `join()`-based expectations, file by file, keeping macOS/Linux green after each. Start with the pure unit files, then the integration/e2e assertions:

- `test/core-paths.test.ts`, `test/core-store-paths.test.ts` (build expectations with `join()` from the same inputs; `expandHomePath("~", h)` and absolute-passthrough cases stay literal).
- `test/core-paths-credentials.test.ts`, and the path-shaped assertions inside the larger integration/e2e suites surfaced by the Windows run.
- For substring/`.toContain` path checks, compare against `join(...)` fragments or normalize both sides.

### Phase 3 — residual clusters + flip the gate

- Triage the long tail from a fresh Windows run (any remaining ENOENT/`error:` clusters not covered by 1–2 — e.g. line-ending or temp-path edge cases).
- Re-confirm the npm catalog/skill-package paths now resolve (Phase-0 fix verified live).
- **Remove** `continue-on-error: ${{ matrix.os == 'windows-latest' }}` from `.github/workflows/ci.yml`. Windows becomes a required gate.

---

## Acceptance gate

`Validate (windows-latest)` green on a run with `continue-on-error` removed, ubuntu + macOS still green, and a publish→extract round-trip test asserting byte-identical nested-file content across platforms.

## Constraints

- Verification is **CI-mediated**: the node-tar drop and the autocrlf concern do not reproduce on macOS, so each Windows-specific fix needs a CI round-trip. Land Phase 1 first and read one Windows run before proceeding.
- TDD per rule 02: lead each fix with a test that is green on macOS/Linux and targets the Windows-failing behavior.
