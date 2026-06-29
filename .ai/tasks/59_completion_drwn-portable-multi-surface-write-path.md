# ABOUTME: Completion summary for Task 59, the portable multi-surface drwn write path (Windows + Cowork + encrypted credentials).
# ABOUTME: Records per-phase shipped scope, verification evidence, honest test-rigor gaps, and gated/deferred items.

# Task 59 Completion: Portable, Multi-Surface drwn Write Path

**Status**: Implemented in the working tree (uncommitted), stacked on Task 58
**Completed**: 2026-06-28
**Branch/commits**: None — worked directly on `main`, no branch/commit/worktree, per request.
**Dependencies**: Stacks on Task 58 (plural rebrand). Adds `tar` (node-tar) `^7.5.19`.
**References**: [.ai/tasks/59_drwn-portable-multi-surface-write-path-implementation-plan.md, .ai/analyses/82/81/80, cli/core/{home,materialize,archive,targets,secret-store}.ts]

## Summary

Task 59 converges the entire `drwn` write path onto OS-uniform primitives — **plain files and an explicit interpreter** — so the CLI can run on Windows and serve the Claude Cowork surface, and hardens credential storage to encryption-at-rest. Implemented as six phased increments, each leaving the full suite green.

Net new modules: `cli/core/home.ts`, `cli/core/materialize.ts`, `cli/core/archive.ts`, `cli/core/targets.ts`, `cli/core/secret-store.ts`. Net new test files: `core-home`, `core-materialize`, `core-skills-materialize`, `core-archive`, `core-targets`, `core-secret-store`, `core-secret-store-backends`, plus `test/preload-keychain.ts` and `bunfig.toml`.

## What Shipped, By Phase

### Phase 0 — Portability foundation
- `cli/core/home.ts` `resolveHomeDir(env)` → first non-empty of `AGENTS_HOME_DIR`, `HOME`, `USERPROFILE`, `os.homedir()`; never `""`. Wired into `cli/context.ts` and `cli/core/paths.ts`.
- `cli/core/catalogs.ts`: dropped the `/usr/bin/env` wrapper; spawns `npm` directly.

### Phase 1 — Copy-based skills + pointer cursor (the core change)
- `cli/core/materialize.ts`: `materializeDir` (copy source→temp, hash snapshot, replace dest only on drift; `managed-directory` record), `writePointerFile`, `materializePointer`.
- `cli/core/skills.ts`: symlinks → copies; `MaterializeIntent`; `findStaleManagedEntries` (dirs + symlinks); existence-based `isMaterialized`; copy-based `curateSkill`.
- `cli/core/skill-packages.ts`: `current` cursor is a pointer file (`writePointerFile` + `readFile`), not a symlink. **Hard cut (D-bc)** — existing symlink installs must re-install/re-seed.
- Reuses the existing `managed-directory` drift/cleanup machinery in `sync.ts`/`write-record.ts`.
- **Semantic shift**: a user-replaced managed skill dir now trips `verifyManagedPaths` drift protection (refuses without `--force`, still preserves user content) — the old `symlink` kind wasn't drift-verified.

### Phase 2 — Portable archive + stdin
- Added `tar` (node-tar). `cli/core/archive.ts`: `create`/`list`/`extract` with `portable: true`; gzip auto-sniffed on read.
- Migrated all six system-`tar` sites: `store-seed.ts` (+ exported `assertSeedEntriesSafe`), `git.ts`, `skill-packages.ts`, `export/archiver.ts` (deleted the macOS `--no-mac-metadata`/`COPYFILE_DISABLE` branch), `store/export.ts`.
- `extensions/doctor.ts`: `/bin/sh -c "printf … | markitdown"` → `runProcess(["markitdown","-x","md"], { stdin })` — no shell.
- Grep gate: no `Bun.spawn(["tar"…])`, `/bin/sh`, or spawned `/usr/bin/env` remain in `cli/`.

### Phase 3 — Cursor MCP de-symlink
- `sync.ts`: `.cursor/mcp.json` is written directly as `managed-content` (removing a pre-existing symlink + one-time generated-file cleanup); deleted `ensureFileSymlink`.
- `diagnostics.ts`: cursor drift compares `.cursor/mcp.json` directly; `detectMissingGeneratedFiles` emptied (cursor was its only producer).
- Dropped the vestigial `TargetConfig.symlink` field from `types.ts`, `registry/config.json`, and 4 test fixtures.

### Phase 4 — Target descriptor table + Cowork surface
- `cli/core/targets.ts`: `DESCRIPTORS` (compile-time-total), `TargetDescriptor` (`surfaces`, `mcpFormat`, `hookRuntime`), `isTargetName`, `ALL_TARGET_NAMES`, `getTargetDescriptor`, `descriptorsFor`. The `claude` descriptor carries `surfaces: ["claude-code","cowork"]`.
- Migrated validation sites (`write.ts`, `mcp/write.ts`, `card-manifest.ts`, `card-diff.ts`) and `runtime-selection.ts` to the descriptor table.
- `doctor`: a **Cowork-awareness note** (when `claude` enabled, driven by `surfaces`) and a **platform-checks** footer (home dir resolves; `node` resolvable on PATH).

### Phase 5 — Encrypted credential storage
- `cli/core/secret-store.ts`: AES-256-GCM envelope `{v,algo,keyRef,nonce,ciphertext,tag}`; `encryptToDisk`/`decryptFromDisk`/`clear`; `NoKeychainError` (refuse-to-persist), `CredentialIntegrityError` (GCM tag mismatch). Atomic write + `chmod 0600`/`icacls`.
- Backends via `runProcess`: macOS `security`, Linux `secret-tool` (stdin), Windows DPAPI (PowerShell). `defaultBackend` selects on platform; an **env-gated `FileKeychainBackend`** (`DRWN_TEST_KEYCHAIN_DIR`) is used only under test.
- `auth/credentials.ts` now encrypts at rest; public API unchanged, so `login`/`logout`/`whoami`/`resolve-token` needed no edits. `DRWN_TOKEN` still short-circuits before disk.
- `bunfig.toml` + `test/preload-keychain.ts` set the test keychain dir once; subprocess CLI runs inherit it via `process.env`.

### Phase 6 — Windows CI
- `.github/workflows/ci.yml`: `strategy.matrix.os: [ubuntu-latest, windows-latest]`, `fail-fast: false`; `verify:release` gated to `runner.os == 'Linux'`. All `package-readiness` workflow assertions preserved.

## Ratified Decisions Applied

- Mentor's Phase-1 refinement: `materializeDir` copies-then-compares the snapshot hash; split `writePointerFile` (pure) from `materializePointer` (SyncResult wrapper).
- Phase 5 testing (operator-approved): **env-gated file backend** keeps subprocess auth tests green while production stays keychain-only; a **real macOS `security` round-trip** was run under a throwaway service.

## Test and Verification Evidence

All runs under **bun on macOS**.

- New unit/integration tests: `core-home` (6), `core-materialize` (8), `core-skills-materialize` (2 incl. the symlink→copy migration through real `syncRepository`), `core-archive` (4), `assertSeedEntriesSafe` (5), `core-targets` (6), doctor Cowork/platform (1), `core-secret-store` (7 crypto), `core-secret-store-backends` (7 incl. a **real macOS keychain round-trip**).
- TDD RED→GREEN was demonstrated for each new module (e.g. `Cannot find module '../cli/core/home'`, missing materialize/archive/targets/secret-store).
- Each phase ended on a clean full suite. **Final: `tsc --noEmit` clean; `bun test` → 972 pass / 1 skip / 0 fail across 181 files.**
- Phase-4 descriptor refactor was behavior-preserving (suite stayed green with no edited expectations beyond the one new test).

## Honest Test-Rigor Gaps (not hidden)

- **Nothing ran on Windows or Linux, or under Node** — only bun on macOS. Task 59's central goal (Windows support) is **unverified on Windows**; Phase 6's CI lane has not been executed.
- **Windows DPAPI backend: written but never executed** — tests only assert `defaultBackend` returns a `DpapiBackend` instance on `win32`. The PowerShell Protect/Unprotect code (quoting/encoding) has never run. `icacls` restriction is unexercised.
- **Linux `secret-tool` backend: argv/stdin asserted via `spyOn` only** — never run against a real Secret Service; the D-Bus availability check is untested.
- Only **macOS** `security` is exercised for real, happy-path only.
- The doctor **platform-check FAILED branch is untested** (on this machine `node`/home both pass), and the check is informational (does not fail the doctor).
- Phase 0's planned `createAgentsContext`-non-empty integration assertion was not added (the pure resolver is unit-tested instead).

## Gated / Deferred

- **Codex hook command-form** (Phase 4 step 3): kept the string `command: "node <path>"` form. The array `command`+`args` change is **gated** on confirming Codex's `hooks.json` schema accepts it (Verification Gate #1), which could not be verified here.
- **Internal per-target dispatch bodies** in `sync.ts`/`diagnostics.ts` (`targetConfigPath`) were left as-is. The descriptor table is the source of truth for names/validation/runtime/surfaces; converting the remaining bodies is behavior-neutral refactor with no functional change — deliberately not done to avoid regression risk.
- **Windows-green on CI** (Phase 6 acceptance): the push-and-observe gate; Windows-only test-path fixes can only surface in Actions.
- **Curated-layer dissolution** and `CLAUDE_CONFIG_DIR` support remain plan-noted fast-follows.

## Acceptance Status

| Success criterion | Status |
| --- | --- |
| `drwn write` materializes skills as copied directories; drift/cleanup work | Done (macOS) |
| Skill-package `current` is a pointer file; no symlink in the package store | Done |
| MCP write path has zero symlinks (cursor writes `.cursor/mcp.json` directly) | Done |
| CLI resolves home/config dir without `""` fallback | Done (unit) |
| All archive ops via pure-JS node-tar; no system `tar`/`/bin/sh`/`/usr/bin/env` | Done (grep-gated) |
| Credentials encrypted at rest (AES-256-GCM, keychain key); `DRWN_TOKEN` headless | Done (macOS + crypto unit; Win/Linux backends argv-only) |
| Cowork documented and `doctor`-surfaced; no regression to claude/codex/cursor | Done |
| `bun test` green on ubuntu-latest **and** windows-latest | **Unverified** — CI matrix wired; not yet run |
