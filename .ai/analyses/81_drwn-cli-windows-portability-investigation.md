# ABOUTME: Investigation into what it takes to make the drwn CLI runnable on Windows.
# ABOUTME: Catalogs every portability hazard (home resolution, symlinks, tar, shells, paths) with severity, file:line evidence, and a phased remediation plan.

# Analysis 81 — drwn CLI Windows Portability: Investigation

**Date**: 2026-06-28
**Author**: Claude + Remy
**Status**: Draft — investigation complete
**References**: [.ai/analyses/79_cowork_management_guide.md, .ai/analyses/80_drwn-cowork-target-investigation.md, cli/context.ts, cli/core/paths.ts, cli/core/skills.ts, cli/core/skill-packages.ts, cli/core/store-seed.ts, cli/core/git.ts, cli/core/catalogs.ts, cli/core/process.ts, cli/core/export/archiver.ts, cli/core/extensions/doctor.ts, cli/core/auth/credentials.ts, scripts/build-cli.mjs, package.json]

---

## Executive Summary

The `drwn` CLI does not run on Windows today, and the reason is not one big architectural mismatch — it is a handful of concrete, fixable assumptions, each in a known location. The investigation found **four blockers**, **one major issue**, and **a few minor/cosmetic gaps**. None require redesign; all are containable behind small platform-aware helpers.

The four blockers, in order of how early they bite:

1. **Home-directory resolution crashes immediately.** `cli/context.ts:19` reads `process.env.HOME`, which is unset on Windows; the empty-string fallback poisons every downstream path. This is the very first thing that breaks.
2. **Skills are materialized as directory symlinks** (`cli/core/skills.ts:71`), and Windows symlink creation needs Developer Mode or elevation. This breaks `drwn write` skill sync, skill-package install (`skill-packages.ts:277`), and store seeding (`store-seed.ts`).
3. **The CLI shells out to the `tar` binary** in at least five places (`git.ts:353`, `store-seed.ts:114,126`, `skill-packages.ts:316`, `export/archiver.ts`, `store/export.ts:27`) — and `archiver.ts` even passes a macOS-only `--no-mac-metadata` flag. System `tar` is not reliably present (or flag-compatible) on Windows.
4. **`/usr/bin/env` is hardcoded** as an `npm` launcher (`cli/core/catalogs.ts:42`), a POSIX-only path that breaks npm catalog search.

One **major** issue: a hardcoded `/bin/sh -c` in the markitdown extension doctor (`cli/core/extensions/doctor.ts:122`). Minor issues are POSIX `chmod`/mode-bit calls that become silent no-ops on NTFS (a credentials-security footnote, not a functional break).

Encouragingly, the foundations are mostly sound: `cli/core/paths.ts` uses `node:path` `join` throughout (no string-concatenated separators), `cli/core/process.ts` and `cli/core/git.ts` spawn binaries via array args without a shell wrapper, the build script already rewrites the shebang to `node` for the dist artifact (`scripts/build-cli.mjs:47`), and there is already a `win32` branch in the auth browser opener with a passing test (`test/core-auth-browser.test.ts`). The work is a focused sweep, not a rewrite.

This investigation also connects to analysis 80: Cowork ships on Windows, and Cowork inherits the harness's hooks, whose generated commands assume a POSIX shell — so the shell-portability seam matters for both efforts.

---

## Context

`drwn` runs well on macOS (Bun/TypeScript). Remy wants it runnable on Windows. This report catalogs every portability hazard with evidence and severity so a remediation plan can be scoped. It is an investigation, not an implementation.

**Method**: read the path/process/fs-touching modules end to end, grepped for POSIX-isms (`HOME`, `/usr/`, `/bin/`, `/tmp`, `symlink`, `tar`, `chmod`, hardcoded `/` separators), and spot-checked the build/distribution story and the test suite for platform assumptions.

**Runtime baseline assumption**: the CLI targets the Bun ecosystem (`bin` → `cli/index.ts` with a `#!/usr/bin/env bun` shebang, `package.json:3-6`). Bun has a native Windows build, so "runnable on Windows" presumes Bun-on-Windows (or the Node dist artifact). The hazards below are independent of which runtime; they are OS assumptions in our own code.

---

## Investigation

### Severity tiers

- **Blocker** — the CLI crashes or a core command (`write`, `add skill`, `store seed`, card fetch) cannot complete.
- **Major** — a specific feature breaks, core flow survives.
- **Minor** — degraded or cosmetic; no functional break.

### Category 1 — Home / config-root resolution (BLOCKER)

`cli/context.ts:19`:

```ts
const homeDir = process.env.AGENTS_HOME_DIR ?? process.env.HOME ?? "";
```

On Windows, `HOME` is conventionally unset (the platform uses `USERPROFILE`). The empty-string fallback means `agentsDir` (`resolveAgentsDir(homeDir)`, `paths.ts:17`), every `~/.claude` machine-scope path, credentials, and the store all resolve relative to `""`. This is the first and most fatal break.

The fix is centralizing on `os.homedir()` (which is correct on all platforms) with env overrides layered on top — note `cli/core/paths.ts:112` *already* does the right thing (`options.homeDir ?? homedir()`), so the bug is specifically the context-layer resolver diverging from the paths-layer resolver. They should share one helper.

Cross-cut with analysis 80 Open Question 5: doc 79 says Cowork/Claude honor `CLAUDE_CONFIG_DIR`; the CLI reads neither `CLAUDE_CONFIG_DIR` nor `USERPROFILE`. A correct resolver should consider all of them so the CLI and the Claude/Cowork surfaces agree on the config root.

`cli/core/paths.ts:53-61` (`expandHomePath`) is **fine** — it uses `join`, not string concatenation, and only special-cases a leading `~`/`~/`. The problem is the *value* of `homeDir`, not the expansion.

### Category 2 — Symlinks (BLOCKER)

Skills and skill-package versions are materialized as **directory symlinks**, not copies:

- `cli/core/skills.ts:71` — `symlinkSync(targetPath, linkPath, "dir")` inside `ensureDirSymlink` (the core skill-sync primitive).
- `cli/core/skill-packages.ts:277` — `symlinkSync(options.version, currentPath, "dir")` for the `current` pointer.
- `cli/core/store-seed.ts` — imports `symlink`/`readlink` and re-creates symlinks captured in seed tarballs.
- `cli/core/write-record.ts` — tracks `kind: "symlink"` / `"generated-symlink"` managed entries, so the whole write-record model assumes symlinks are creatable.

On Windows, `CreateSymbolicLink` requires either elevation or **Developer Mode**; an unprivileged `symlinkSync` throws `EPERM`. This breaks `drwn write` (skill curation), `drwn add skill` (package `current` link), and `drwn store seed`.

This is also the seam shared with analysis 80 Finding 4 (Cowork's session VM may not resolve symlinks). Remediation options, in rough order of preference:

1. **Junctions for directories.** NTFS directory junctions don't need elevation and are created by some runtimes' `symlink(..., "junction")`. Need to confirm Bun/Node honor `"junction"` and that downstream readers (and Cowork's VM) resolve them.
2. **Copy fallback on Windows.** Simpler and universally readable, at the cost of storage and losing the "edit source, see it live" property. May be acceptable for skills given they're not hand-edited in place.
3. **Require Developer Mode** and detect/error clearly if absent. Worst UX; avoid as the only option.

The choice interacts with Cowork (analysis 80): if we adopt a copy fallback for Windows skills, it also sidesteps the Cowork-VM symlink question on that platform.

### Category 3 — `tar` binary dependency (BLOCKER)

The CLI shells out to a system `tar` for every archive operation, with no pure-JS fallback:

- `cli/core/git.ts:353` — `Bun.spawn(["tar", "-xf", tarPath, "-C", targetDir])` (extract git-tree snapshots → card content).
- `cli/core/store-seed.ts:114,126` — extract and list seed tarballs (the `-tf` listing also backs a security validation of entries).
- `cli/core/skill-packages.ts:316` — extract the `.tgz` from `npm pack` (skill install).
- `cli/core/export/archiver.ts` — create/list session-export archives; **passes `--no-mac-metadata` only on `process.platform === "darwin"`**, which shows archive code is partly platform-aware but never validated on Windows.
- `cli/commands/store/export.ts:27` — `tar -cf` the store.

Windows 10+ bundles a `bsdtar` as `tar.exe`, and Git-for-Windows ships GNU tar — but neither is guaranteed on PATH, and flag compatibility (especially GNU long-options) is not assured. Commands affected: card fetch, `store seed`, `add skill` from npm, `export sessions`, `store export`.

Remediation: adopt a pure-JS tar (e.g. the `tar` npm package) behind a single archive helper, or detect a usable `tar.exe` and fall back to JS. Centralizing all five call sites behind one module is worthwhile regardless, since it also fixes the `--no-mac-metadata` platform branching in one place.

### Category 4 — `/usr/bin/env` launcher (BLOCKER, narrow)

`cli/core/catalogs.ts:42`:

```ts
const proc = Bun.spawn(["/usr/bin/env", "npm", "search", query, "--json", ...]);
```

`/usr/bin/env` does not exist on Windows. The wrapper is unnecessary on every platform — spawning `npm` (resolved from PATH; `npm.cmd` on Windows) directly works everywhere. Breaks npm skill-catalog search only, but it's a hard break for that feature.

### Category 5 — Hardcoded POSIX shell (MAJOR)

`cli/core/extensions/doctor.ts:122` runs a smoke test via `["/bin/sh", "-c", "printf ... | markitdown -x md"]`. `/bin/sh` is absent on Windows and the `printf`/pipe idiom is shell-specific. Breaks the markitdown extension doctor only — but the *pattern* is the concern: any generated hook command (analysis 80 §Hooks) that assumes a POSIX shell has the same problem on Windows, and that surfaces in both Claude Code and Cowork. The general fix is a small "run a shell snippet" helper that picks `cmd /c` / PowerShell vs `/bin/sh -c` by platform — and a policy decision about whether harness-generated hook commands must be POSIX-portable.

### Category 6 — File permissions / mode bits (MINOR)

- `cli/core/auth/credentials.ts:51-52` — `writeFile(tmp, ..., { mode: 0o600 })` then `chmod(tmp, 0o600)`. On NTFS these are silent no-ops, so the credentials file (bearer tokens) is not permission-restricted on Windows. **Security footnote, not a functional break.** A correct Windows story would use ACLs; document the limitation at minimum.
- `scripts/build-cli.mjs:50` — `chmod(outFile, 0o755)` is a no-op on Windows but harmless (npm generates the shim).
- `cli/core/card-store.ts:99` — `(entry.mode & 0o111)` for an `x`/`-` diagnostic display; cosmetic, will always show `-` on Windows.

### Category 7 — Line endings / encoding (NONE FOUND)

Reads use `"utf8"` explicitly; `.split("\n")` over command output is tolerant of trailing `\r` in practice. No hardcoded CRLF/LF assumptions surfaced. Low risk, but worth a CI smoke once tests run on Windows.

### Category 8 — Distribution & runtime (LOW RISK, already mostly handled)

- `package.json:3-6` — `bin` points at `cli/index.ts` (shebang `#!/usr/bin/env bun`). On Windows, npm/Bun generate a `.cmd`/`.ps1` shim from the shebang, so `drwn` on PATH works **provided Bun (or node, for the dist build) is installed**. Acceptable.
- `scripts/build-cli.mjs:47` — already rewrites `#!/usr/bin/env bun` → `#!/usr/bin/env node` for the dist artifact. Good — the published artifact is node-compatible.
- Install story for end users: documenting "install Bun, then `bun add -g` / npm global" is the main gap; no code change needed.

### Category 9 — Tests (FOLLOW-UP)

The suite was not run on Windows in this investigation. `test/core-auth-browser.test.ts` already branches on `win32` and passes, which is a good sign the team anticipated cross-platform. But many tests assert on POSIX-shaped paths and create symlinks/tars, so a meaningful fraction will fail on Windows until Categories 2–3 are addressed. A Windows CI lane is the only way to keep this from regressing; treat green-on-Windows-CI as the definition of done, not a one-time manual check.

---

## Findings

1. **Home resolution is the first crash** (`context.ts:19`, `HOME`-only with `""` fallback) and diverges from the already-correct `paths.ts:112` resolver. Unify them; add `USERPROFILE`/`os.homedir()`/`CLAUDE_CONFIG_DIR`.
2. **Symlink-based skill materialization is a blocker** (`skills.ts:71`, `skill-packages.ts:277`, `store-seed.ts`, `write-record.ts`). Needs junctions or a copy fallback; choice couples to Cowork (analysis 80 Finding 4).
3. **System-`tar` dependency is a blocker across five call sites**, with a macOS-only flag in `archiver.ts`. Centralize behind one archive helper with a pure-JS fallback.
4. **`/usr/bin/env npm` is a gratuitous POSIX break** (`catalogs.ts:42`) — drop the wrapper.
5. **`/bin/sh -c` hardcoded** (`extensions/doctor.ts:122`) and, more broadly, generated hook commands assume a POSIX shell — the same hazard hits Cowork-on-Windows (analysis 80).
6. **`chmod`/mode bits are NTFS no-ops** — a credentials-security footnote (`auth/credentials.ts:51-52`), not a functional blocker.
7. **The fundamentals are portable**: `node:path` `join` everywhere in `paths.ts`, shell-free spawns in `process.ts`/`git.ts`, node-shebang dist build, and an existing `win32` test branch. This is a sweep, not a redesign.

---

## Recommendations

A phased remediation, blockers first. Each step is small and independently testable; per the project's TDD rule, lead each with a failing (Windows-shaped) test.

### Phase 1 — Unblock startup and core writes
1. **Single home/config-root resolver.** Replace `context.ts:19` with a shared helper: `AGENTS_HOME_DIR ?? CLAUDE_CONFIG_DIR-derived ?? HOME ?? USERPROFILE ?? os.homedir()`. Make `paths.ts` and `context.ts` consume the same function so they can't drift.
2. **Drop the `/usr/bin/env` wrapper** in `catalogs.ts:42` (spawn `npm` directly).
3. **Decide symlink strategy** (junction vs copy fallback) and implement behind the existing `ensureDirSymlink` primitive (`skills.ts:50-72`) so all symlink sites inherit it. Resolve jointly with analysis 80's Cowork-VM probe.

### Phase 2 — Archive portability
4. **Centralize all `tar` usage** behind one archive module with a pure-JS fallback; fold the `--no-mac-metadata` platform branch into it. Removes blockers in `git.ts`, `store-seed.ts`, `skill-packages.ts`, `archiver.ts`, `store/export.ts`.

### Phase 3 — Shells, security, CI
5. **Platform-aware shell helper** for `extensions/doctor.ts:122`, and a decision on POSIX-portability of generated hook commands (shared with analysis 80).
6. **Document the credentials-permission limitation** on Windows (`auth/credentials.ts`), or implement ACL-based restriction if we judge the token exposure unacceptable.
7. **Add a Windows CI lane** running `bun test`; iterate until green. This is the real acceptance gate.

### Sequencing rationale
Phases 1→2 clear all four blockers and make `drwn write` / `add skill` / `store seed` functional. Phase 3 is hardening and regression-proofing. The symlink decision (1.3) is the one cross-cutting design choice and should be made with the Cowork investigation (analysis 80) in the same sitting, since both hinge on whether Windows + Cowork can consume harness symlinks.

---

## Open Questions

1. **Junction vs copy for Windows skills.** Do Bun/Node `symlink(..., "junction")` work unprivileged here, and do downstream readers (Claude Code, Cowork's session VM) resolve junctions? If not, copy fallback. (Couples to analysis 80 Finding 4.)
2. **Pure-JS tar vs detect-system-tar.** Is adding a `tar` dependency acceptable, or do we prefer to detect `tar.exe` and only fall back to JS? Affects the dependency surface and the security validation path in `store-seed.ts`.
3. **Runtime baseline.** Is "runnable on Windows" defined as Bun-on-Windows, the node dist artifact, or both? Determines what the install docs and CI matrix cover.
4. **Hook-command portability policy.** Must harness-generated hook commands be POSIX-portable, or do we emit platform-specific commands? Shared decision with analysis 80.
5. **CLAUDE_CONFIG_DIR parity.** Should the CLI honor `CLAUDE_CONFIG_DIR` so it agrees with Claude/Cowork on the config root (doc 79 §1)? Recommend yes, folded into Phase 1.1.

---

## Appendix — Hazard table

| # | Category | Severity | Site | Effect |
|---|---|---|---|---|
| 1 | Home resolution | Blocker | `cli/context.ts:19` | `HOME` unset on Windows → empty root → all paths break at startup |
| 2 | Symlinks | Blocker | `cli/core/skills.ts:71`; `skill-packages.ts:277`; `store-seed.ts` | `EPERM` without Developer Mode → skill sync / install / seed fail |
| 3 | tar binary | Blocker | `git.ts:353`; `store-seed.ts:114,126`; `skill-packages.ts:316`; `export/archiver.ts`; `store/export.ts:27` | system `tar` absent/incompatible → card fetch, seed, install, export fail |
| 4 | `/usr/bin/env` | Blocker (narrow) | `cli/core/catalogs.ts:42` | POSIX-only launcher → npm catalog search fails |
| 5 | POSIX shell | Major | `cli/core/extensions/doctor.ts:122` | `/bin/sh` absent → markitdown doctor fails; pattern extends to hook commands |
| 6 | chmod/mode | Minor | `auth/credentials.ts:51-52`; `build-cli.mjs:50`; `card-store.ts:99` | NTFS no-ops → credentials not permission-restricted; cosmetic diagnostics |
| 7 | Line endings | None found | — | reads pinned to utf8; `\n` splits tolerant |
| 8 | Distribution | Low | `package.json:3-6`; `scripts/build-cli.mjs:47` | shim works if Bun/node installed; dist shebang already node-rewritten |
| 9 | Tests | Follow-up | `test/` | symlink/tar/path assumptions fail until 2–3 fixed; needs Windows CI |
