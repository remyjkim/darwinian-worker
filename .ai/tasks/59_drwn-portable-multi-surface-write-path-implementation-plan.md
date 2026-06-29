# ABOUTME: Implementation plan to make the drwn write path portable and OS-uniform — copy-based materialization, Windows support, Cowork surface, encrypted credentials.
# ABOUTME: Sequences the work from analysis 82 into TDD phases with concrete files, signatures, tests, and acceptance gates.

# Task 59: Portable, Multi-Surface drwn Write Path — Implementation Plan

**Status**: Planning
**Created**: 2026-06-28
**Updated**: 2026-06-28
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: ~6 phased increments (each independently shippable / reviewable)
**Dependencies**: Analysis 82 (target architecture), Analyses 80/81 (investigations), Analysis 70 (MCP adapters, already shipped)
**References**: [.ai/analyses/82_drwn-portable-multi-surface-write-path-target-architecture.md, .ai/analyses/80_drwn-cowork-target-investigation.md, .ai/analyses/81_drwn-cli-windows-portability-investigation.md, cli/core/skills.ts, cli/core/skill-packages.ts, cli/core/write-record.ts, cli/core/sync.ts, cli/core/mcp.ts, cli/core/diagnostics.ts, cli/core/paths.ts, cli/context.ts, cli/core/catalogs.ts, cli/core/git.ts, cli/core/store-seed.ts, cli/core/export/archiver.ts, cli/core/extensions/doctor.ts, cli/core/hook-generator/sync-hooks.ts, cli/core/hook-generator/runtime-selection.ts, cli/core/auth/credentials.ts, cli/core/auth/resolve-token.ts, cli/core/process.ts, registry/config.json, .github/workflows/ci.yml]

---

## Objective

Make the `drwn` CLI run on Windows and serve the Claude Cowork surface, by converging the entire write path onto OS-uniform primitives — **plain files and an explicit interpreter** — and eliminating OS-specific filesystem features (symlinks, exec bits) and OS-specific execution (shells). Along the way, harden credential storage to encryption-at-rest on every platform.

## Success Criteria

- [ ] `bun test` passes on **both** `ubuntu-latest` and `windows-latest` in CI.
- [ ] `drwn write` materializes skills as **copied directories** (no symlinks) on all platforms; drift detection and cleanup still work.
- [ ] Skill-package `current` cursor is a **pointer file**; no symlink remains in the package store.
- [ ] MCP write path contains **zero symlinks** (Cursor writes `.cursor/mcp.json` directly).
- [ ] The CLI starts and resolves its home/config dir correctly on Windows (no `""` fallback).
- [ ] All archive (tar) operations run via a **pure-JS** helper — no dependency on a system `tar`/`/bin/sh`/`/usr/bin/env`.
- [ ] Credentials are **encrypted at rest** (AES-256-GCM, OS-keychain-held key) on macOS/Windows/Linux; headless uses `DRWN_TOKEN`; no plaintext token is ever written.
- [ ] Cowork is documented and `doctor`-surfaced as a surface served by the `claude` target; no behavioral regression to `claude`/`codex`/`cursor`.

## Ratified decisions (recap)

| # | Decision |
|---|---|
| D1 | **Cowork = surface annotation** on the `claude` target (Model A). No new `TargetName`, no `Partial` type change, no `registry` cowork entry. |
| D2 | Introduce a **`targets.ts` descriptor table** to replace scattered target-name branches (carries Cowork surface metadata). |
| D3 | Skills → **copy** (`managed-directory`). Curated layer kept as a copied snapshot in Phase 1; dissolution is a fast-follow. |
| D4 | Archive via **node-tar** (pure-JS dependency). |
| D5 | Windows runtime baseline = **node dist artifact** (Bun for contributors). |
| D6 | Credentials **encrypted at rest, all platforms**: AES-256-GCM + OS-keychain key + ACL/chmod + `DRWN_TOKEN` headless + **refuse-to-persist** without a keychain. |
| D7 | Cowork-VM probe runs **alongside** Phase 1; does not gate it. |
| D-bc | Package `current` symlink → pointer is a **hard cut** (no back-compat dual-read; existing installs re-install/re-seed). |

## Guiding principle

Depend only on primitives uniform across every OS and every consuming surface — **plain files + an explicit interpreter**. The write-record machinery for this already exists (`managed-directory`/`managed-content` with content hashing, used today by the mind generator); this work is a convergence, not a rewrite.

---

## Sequencing & dependency graph

```
Phase 0 (home + /usr/bin/env)  ─┐
Phase 1 (copy materialization) ─┼─ independent; land 0 then 1 first (highest value)
Phase 2 (archive + stdin)      ─┘
Phase 3 (cursor de-symlink)    ── independent of 1/2
Phase 4 (descriptors + cowork) ── after 3 (cursor branch keys off mcpFormat)
Phase 5 (secret store)         ── independent; can parallel 1–4
Phase 6 (Windows CI green)     ── LAST; Windows lane can start after 0+1+2; final acceptance requires 0–5
```

Phases 0–2 make `drwn write` functional and OS-uniform (serving Windows **and** the Cowork VM at once). Turn on the Windows CI lane after those phases and the **test fixtures** stop shelling to `tar`/`printf`/`/bin/sh` (done in Phase 2), then keep it green through Phases 3–5. The whole effort is accepted only after Windows also exercises the final credential backend behavior from Phase 5.

---

## Phase 0 — Portability foundation

**Goal:** the CLI starts on Windows; home resolution is unified and never empty.

**Files/edits:**
- **NEW `cli/core/home.ts`**: `resolveHomeDir(env = process.env)` → first **non-empty** string from `AGENTS_HOME_DIR`, `HOME`, `USERPROFILE`, then `homedir()`. Trim is **not** applied to accepted values, but `undefined`, `null`-ish absence, and `""` are treated as missing. Never returns `""`. `CLAUDE_CONFIG_DIR` is **excluded** (it points at the `.claude` dir, not `$HOME`; belongs at the tool-path layer if ever honored).
- `cli/context.ts:19`: `const homeDir = resolveHomeDir();` (drop the inline `?? ""`).
- `cli/core/paths.ts:112`: `options.homeDir ?? resolveHomeDir()` (drop the `homedir` import here; it moves to `home.ts`).
- `cli/core/catalogs.ts:42`: drop `"/usr/bin/env"`, spawn `"npm"` directly.

**TDD steps:** write `test/core-home.test.ts` first (red): empty `HOME` → falls back to `USERPROFILE`, then `homedir()`; `AGENTS_HOME_DIR` wins; empty `AGENTS_HOME_DIR` does not mask `HOME`; never `""`. Implement `home.ts`, wire the two call sites, drop `/usr/bin/env`.

**Acceptance:** `core-home.test.ts` green; existing `core-paths*.test.ts` green; a regression asserting `createAgentsContext()` yields a non-empty `homeDir` when `HOME` is unset.

---

## Phase 1 — Copy-based skills + pointer cursor (the core change)

**Goal:** skills materialize as copied directories; the package `current` cursor is a pointer file. No symlinks in the skill write path.

**Files/edits:**
- **NEW `cli/core/materialize.ts`**:
  - `materializeDir(source, dest, { dryRun, result, relPath, labelSuffix? }) → { path, kind: "managed-directory", contentHash }`. Non-dry-run copies via `cpSync(source, tmp, { recursive: true, dereference: true })` into a temp sibling, hashes the temp snapshot, and only then compares `hashManagedDirectory(dest)` to the expected snapshot hash. If hashes match, remove the temp and no-op. If they differ, replace the destination with the temp snapshot (`rmSync(dest, {recursive,force})` + final `renameSync(tmp, dest)`). Do **not** describe this as fully crash-atomic: the final rename is atomic, but replacement has a remove-then-rename window; drift safety stays in `verifyManagedPaths` (`sync.ts:235-245`). **Compute `contentHash` from the copied snapshot/dest**, not by following the source tree directly, so verification is stable when a bundle contains internal symlinks. Dry-run: no disk touch and record uses the `"sha256-dry-run"` sentinel (matching `sync-mind.ts:39`).
  - `writePointerFile(dest, value, { dryRun? } = {}) → contentHash`: pure pointer writer for non-sync code paths. It writes `${value}\n` atomically, replaces a pre-existing symlink or non-file via `lstat` + `rmSync`, and returns the hash of that pointer content (or `"sha256-dry-run"` when dry-run).
  - `materializePointer(dest, value, { dryRun, result, relPath? }) → { path, kind: "managed-content", contentHash }`: reporting wrapper around `writePointerFile` for sync-style callers. Use this only when a `SyncResult` exists.
- `cli/core/skills.ts`:
  - Delete `ensureDirSymlink` (`:50-72`).
  - Rename `SymlinkIntent` → `MaterializeIntent`; drop the prebuilt `managedPath` field, add `relPath` (keep `targetPath`). The `recordIntent`/`alsoAvailable` dedup logic (`:75-101`) is **unchanged**.
  - Four intent sources (`:316-345,347-385,387-415`) set `relPath` instead of `managedPath`.
  - Apply loop (`:417-423`): call `materializeDir(intent.targetPath, intent.linkPath, …)` and push the returned record.
  - `curateSkill` (`:235-254`): copy (dereferenced) instead of `symlinkSync` (D3 curated snapshot).
  - `findStaleSymlinks` → `findStaleManagedEntries` (`:268-279`): accept dirs **and** symlinks; warning text "stale skill" not "symlink".
  - `isLinkedToTarget` (`:177-180`) → existence check (`isDirectory() || isSymbolicLink()`); drop `expectedClaude/CodexTarget` plumbing.
  - Update ABOUTME/comments that say "symlink" (`:2`, `commands/skills/curate.ts:1-2,16-20`).
- `cli/core/skill-packages.ts`:
  - `installSkillBundleRoot` (`:276-277`): `writePointerFile(currentPath, version)` instead of `symlinkSync(version, currentPath, "dir")` (package install has no `SyncResult`, so do not force it through `materializePointer`).
  - `listInstalledSkillBundles` (`:167`) and `getInstalledSkillBundle` (`:198`): `(await readFile(currentPath,"utf8")).trim()` instead of `readlink`. **Hard cut** — no symlink dual-read.

**Unchanged (reused as-is):** `sync.ts` verify/cleanup/diff, `write-record.ts` (`hashManagedDirectory`, `diffWriteRecord`), `paths.ts`/`store-paths.ts` cursor resolvers, `store-seed.ts` (pointer files are regular files → hardlinked fine).

**TDD steps:**
1. `test/core-materialize.test.ts` (red→green): copy fidelity (nested files); idempotent no-op (assert `result.changes` empty when dest hash matches); replaces a symlink dest; replaces a drifted dir; dereferences a symlinked source; dry-run touches nothing; `materializePointer` writes `value\n`, replaces a pre-existing symlink.
2. `test/core-skills-materialize.test.ts`: the **migration test** — arrange a pre-upgrade state (curated symlink + tool symlink + a write-record `{kind:"symlink"}` at `.claude/skills/alpha`), run `syncRepository`, assert dest is now a real directory with real `SKILL.md`, the record is `managed-directory` at the same path, and a re-run is idempotent. Plus: drop-out cleanup (excluded skill removed; hand-edited copy preserved with warning) and drift-throw (hand-edit a copied file → throws without `--force`, succeeds with).
3. Update existing symlink-asserting tests (`core-skills.test.ts:83-84,125-126,170-171,189-190,260-261`; `core-skill-packages.test.ts` `current`; `helpers.ts` fixture builders) to assert copies/pointer files.
4. Update command/scenario fallout that currently asserts skill symlinks or symlink wording: `commands-skills-mutate.test.ts`, `commands-write.test.ts` (dry-run "symlink" lines become "copy"/"materialize" lines while preserving winning-layer annotations), `commands-library-defaults.test.ts` (curation side effect is a copied publication layer), `scenarios-card-materialization.test.ts`, `scenarios-card-bundled-only.test.ts`, `scenarios-card-catalog-collaboration-lifecycle.test.ts`, `sync-mcp.test.ts`, `sync-mcp-compat.test.ts`, and `commands-doctor.test.ts` stale skill headings. Leave mind/composed-mind symlink tests alone unless the implementation intentionally touches `sync-mind.ts`.

**Acceptance:** new tests green; updated skill/package/command/scenario suites green; manual `drwn write` then `ls -la ~/.claude/skills` shows real directories, `cat ~/.agents/drwn/skills/<pkg>/current` or `cat ~/.agents/packages/skills/<pkg>/current` (depending on active store layout) shows a version string.

**Release note (breaking):** existing installed skill packages and pre-built seed tarballs use a symlink `current`; after this change they must be re-installed / re-seeded (hard cut, D-bc).

---

## Phase 2 — Portable archive + stdin (unblocks the rest of Windows)

**Goal:** no archive operation depends on a system `tar`, `/bin/sh`, or `printf`.

**Files/edits:**
- Add dependency **`tar`** (node-tar) to `package.json`.
- **NEW `cli/core/archive.ts`**: `extract(archivePath, destDir, {strip?, filter?})` (`tar.x`), `list(archivePath) → string[]` (`tar.t` + `onentry`), `create(outputPath, {cwd, entries, gzip?})` (`tar.c`, `portable: true`). gzip auto-sniffed on read; explicit on create.
- Migrate sites:
  - `git.ts:353` → `extract(tarPath, targetDir)`.
  - `store-seed.ts:112-152`: `extractTar` → `list` then `assertSeedEntriesSafe(entries)` (port the `:143-150` checks verbatim) then `extract`. Keep `SEED_*` error codes via try/catch.
  - `skill-packages.ts:316` → `extract(tarballPath, extractDir)` (gzip auto).
  - `export/archiver.ts:16` → `list`; `:119-128` create → `create(out, {cwd: stagingDir, entries:["."], gzip})`. **Delete** the `darwin`/`--no-mac-metadata`/`COPYFILE_DISABLE` branch (`validateArchiveMembers` stays as the post-check).
  - `store/export.ts:27` → `create(out, {cwd: agentsDir, entries:["drwn"], gzip:false})`.
- `extensions/doctor.ts:121-125`: replace `["/bin/sh","-c","printf … | markitdown -x md"]` with `runProcess(["markitdown","-x","md"], { stdin: "# Smoke\n\nhello\n", … })` (no shell). **No `shell.ts`.**
- **Port test fixture builders off system `tar`** (`core-archiver.test.ts:29,274`; `core-store-seed.test.ts:123-136`) to `archive.*` — required for Windows CI.

**TDD steps:** `test/core-archive.test.ts` (red→green): round-trip create→list→extract (plain + gzip); symlink preservation; malicious-entry rejection via `assertSeedEntriesSafe` (`../escape`, `/abs`, `evil\win`, `notdrwn/x`); large-file streaming smoke. Then migrate sites; existing seed/export/skill-package tests stay green.

**Acceptance:** `core-archive.test.ts` green; seed/export/store/git/skill-package suites green; no `Bun.spawn(["tar"…])`, `/bin/sh`, or spawned `/usr/bin/env` remain in `cli/` (grep gate; the `#!/usr/bin/env bun` shebang remains intentionally out of scope).

---

## Phase 3 — Cursor MCP de-symlink

**Goal:** `.cursor/mcp.json` is a real managed-content file; no symlink.

**Files/edits:**
- `sync.ts:370-378` cursor branch → write rendered content directly to `configPath`, record `{ path:".cursor/mcp.json", kind:"managed-content", contentHash: hashManagedContent(content) }`. Do **not** call `writeManagedFile` blindly against a pre-upgrade symlink: first `lstat(configPath)`, and if it is a symlink, remove it (or back it up if it does not point at the old generated cursor file) before writing the real file. This is required even when the symlink target content already equals the desired content, because otherwise `writeManagedFile` can no-op and leave the symlink in place. Add a one-time `rmSync(join(generatedDir,"cursor-mcp.json"), {force:true})` orphan cleanup. Delete the now-dead `ensureFileSymlink` (`sync.ts:56-74`) and unused `symlinkSync`/`readlinkSync` imports.
- `diagnostics.ts`: cursor drift (`:500-508`) compares `.cursor/mcp.json` (not the generated file); drop the cursor `detectMissingGeneratedFiles` block (`:515-526`) and the now-unused `generatedDir` arg if cursor was its only user.
- `types.ts:39` drop `symlink?`; `registry/config.json:22` drop `"symlink": true`; remove `symlink:true` from fixtures (`helpers.ts`, `sync-mcp.test.ts`, `core-mcp-sync.test.ts`).

**TDD steps:** flip the symlink-asserting cursor tests (`scenarios-root-scope.test.ts:64,317,358-361`; `scenarios-scope-isolation.test.ts:41-42`; `scenarios-user-journeys.test.ts:122`) to assert `isFile()` + content equals `renderCursorConfig(servers)`, and that re-write detects drift. Add a pre-upgrade migration regression: arrange `.cursor/mcp.json` as a symlink to `generated/cursor-mcp.json` whose content already matches the desired render, run `syncRepository`, and assert `.cursor/mcp.json` is now a real file and the generated orphan is gone. Implement the branch.

**Acceptance:** cursor tests green; `.cursor/mcp.json` is a real file with correct content; no generated `cursor-mcp.json` orphan remains.

---

## Phase 4 — Target descriptor table + Cowork surface

**Goal:** scattered target-name branches collapse into `targets.ts`; Cowork is documented and `doctor`-surfaced. **Zero behavior change** to claude/codex/cursor.

**Files/edits:**
- **NEW `cli/core/targets.ts`**: `TargetDescriptor` (`name`, `family`, `surfaces`, `mcpFormat`, `renderStandalone?`, `projectMcpPath`, `toolSkillsDir?`, `skillScopeDirs?`, `hookRuntime?`), `DESCRIPTORS: Record<TargetName, TargetDescriptor>` (total — compile-time guard), `getTargetDescriptor`, `descriptorsFor(config, target?)`, `isTargetName`, `ALL_TARGET_NAMES`. The `claude` descriptor declares `surfaces: ["claude-code","cowork"]`.
- Migrate high-fanout sites to descriptors (behavior-identical): `sync.ts` (`targetConfigPath`/dispatch, keyed on `mcpFormat`/`writeScope`), `skills.ts` (intent loops gated by `descriptor.family`), `diagnostics.ts` (`:323-331,450-457,466-510`), `sync-hooks.ts` (`:38-44`), `runtime-selection.ts` (`targetAllowsRuntime`/`defaultEnabled` via `hookRuntime`).
- Validation via `isTargetName`/`ALL_TARGET_NAMES`: `write.ts:76`, `mcp/write.ts:41`, `card-manifest.ts:201-204`, `card-diff.ts:65`. **Beads unchanged** (independent target set).
- `doctor`/`diagnostics.ts`: Cowork-awareness check (when `claude` enabled, note it serves Cowork + trust/snapshot/Windows-shell caveats) driven by `surfaces`; Windows self-check (`node` on PATH, archive helper functional, home dir non-empty).
- Hook command-form: `sync-hooks.ts:114-120` codex hook → array `command:"node", args:[composerPath]` form. **GATED** on verifying Codex's `hooks.json` accepts `command`+`args` (see Verification Gates).
- Unchanged (runtime-keyed, not target-keyed): `store-paths.ts:181-189`, `sync-mind.ts:147-150`, `paths.ts:63-77`.

**TDD steps:**
1. Land `targets.ts` + migrate dispatch with **no** behavior change; the **entire existing suite stays green untouched** (this is the regression proof). Add `test/core-targets.test.ts` asserting descriptor fields + `descriptorsFor` honoring `--target`/`enabled`.
2. Add the `surfaces` metadata + doctor Cowork-awareness; `test/commands-doctor.test.ts` asserts the Cowork note appears when `claude` enabled.
3. Hook form: update `commands-hook.test.ts`/`cli-hook-write-e2e.test.ts`/`core-hook-signal-materialization.test.ts` expected JSON to the array form (after the gate clears).

**Acceptance:** full suite green with **no edited expectations** for the dispatch refactor (proves behavior-preserving); cursor/hook expectation edits isolated to their phases; `core-targets.test.ts` + doctor Cowork test green.

---

## Phase 5 — Encrypted credential storage (all platforms)

**Goal:** the bearer token is never plaintext at rest; encrypted with an OS-keychain-held key; refuse-to-persist without a keychain.

**Files/edits:**
- **NEW `cli/core/secret-store.ts`**: `encryptToDisk(path, plaintext, backend?)`, `decryptFromDisk(path, backend?) → string|null`, `clear(path, backend?)`. Envelope `{ v, algo:"aes-256-gcm", keyRef, nonce, ciphertext, tag }` (base64). AES-256-GCM via `node:crypto` (confirmed working under Bun). Atomic temp-write + rename; `restrictFile` = `chmod 0o600` on POSIX, `icacls /inheritance:r` + `/grant:r <user>:F` on Windows. `NoKeychainError` (refuse-to-persist) and `CredentialIntegrityError` (GCM tag mismatch → fail closed). `KeychainBackend` interface injected for tests.
- **Keychain backends via `runProcess`** (stdin for secrets wherever the platform tool permits it — **not** `runExternalCommand` which lacks stdin):
  - macOS: `security add-generic-password/find-generic-password/delete-generic-password -a drwn-credentials -s drwn` (exit 44 = not found → `null`). `security add-generic-password -w <value>` briefly places the generated AES key on argv; accepted by Verification Gate 3 unless we choose a different macOS backend.
  - Windows: PowerShell DPAPI `ProtectedData::Protect/Unprotect` (CurrentUser) wrapping a key stored in a sibling ACL-restricted `credentials.key`; `isAvailable` probes `powershell`.
  - Linux: `secret-tool store/lookup/clear service drwn account drwn-credentials`; missing (`exit 127`)/no-D-Bus → `isAvailable() = false`.
  - `defaultBackend()` selects on `process.platform` (mirrors `browser.ts:4-9`).
- `auth/credentials.ts:48-62`: `writeCredentials` → `encryptToDisk(path, JSON.stringify(creds))`; `readCredentials` → `decryptFromDisk` then validate; `deleteCredentials` → `clear`. **Public API unchanged**, so `login.ts`/`logout.ts`/`whoami.ts`/`resolve-token.ts` need **no edits** (the `DRWN_TOKEN` env path in `resolve-token.ts:21-28` short-circuits before disk — headless unaffected). `login.ts`'s existing try/catch surfaces `NoKeychainError`'s env-var message.

**Subprocess test strategy:** existing spawned CLI auth tests cannot inject an in-memory backend. Add an explicit test-only backend selector, e.g. `DRWN_SECRET_STORE_BACKEND=file-test` gated behind `NODE_ENV === "test"` or `BUN_ENV === "test"`, storing the AES key under the same temp `agentsDir` with the same envelope/ACL path. This backend is only for subprocess e2e tests; production `defaultBackend()` must never select it. Keep real backend behavior covered by unit tests and by the Windows CI DPAPI path.

**TDD steps:** `test/core-secret-store.test.ts` with an injected `FakeKeychainBackend`: round-trip; on-disk file is an envelope (no plaintext substring); tampered ciphertext → `CredentialIntegrityError`; no keychain → `NoKeychainError`; key gone → `null`; `clear` removes file+key. `test/core-secret-store-backends.test.ts`: `spyOn(runProcess)` + `Object.defineProperty(process,"platform")` to assert exact argv/stdin per OS and `exit 127 ⇒ unavailable`. Update `core-auth-credentials.test.ts` (envelope, not plaintext; mode-0600 stays POSIX-only). Update `commands-auth.test.ts`, `cli-auth-e2e.test.ts`, `commands-analyze-sessions.test.ts`, and `core-auth-resolve-token.test.ts` so subprocess tests use the test-only backend and assert the credentials file is an envelope, not plaintext JSON.

**Acceptance:** secret-store tests green; `commands-auth.test.ts` e2e (login writes envelope → whoami reads → logout clears) green; on a real machine, `cat credentials.json` shows ciphertext, not the token.

---

## Phase 6 — Windows CI + acceptance

**Goal:** the suite is green on Windows; that is the acceptance gate for the whole effort.

**Files/edits:** `.github/workflows/ci.yml` → matrix `os: [ubuntu-latest, windows-latest]`, `fail-fast: false`, `oven-sh/setup-bun@v2` (pinned `BUN_VERSION`), steps install→typecheck→`bun test`; gate `verify:release` to `if: runner.os == 'Linux'`.

**TDD/iterate:** turn the lane on after Phases 0+1+2 (and the test-fixture de-tar) land; fix Windows-only failures until green. Keep the lane running through Phases 3–5. DPAPI/`icacls` paths run **real** on `windows-latest` after Phase 5 (genuine acceptance for the Windows secret backend).

**Acceptance:** both matrix legs green; no skipped tests on Windows.

---

## Cross-cutting test strategy

- **Runner:** `bun test`, flat `test/*.test.ts`, `bun:test` APIs. New files: `core-home`, `core-materialize`, `core-skills-materialize`, `core-archive`, `core-targets`, `core-secret-store`, `core-secret-store-backends`.
- **Home/temp injection:** never read the real `$HOME`. Use `helpers.ts` `createTempRoot`/`scaffoldCliFixture`/`envFor` (`AGENTS_HOME_DIR`/`AGENTS_DIR`/`AGENTS_REPO_ROOT`); clean up in `afterEach`.
- **Boundary mocking:** mock the **shell/keychain boundary**, not the OS keychain — inject `FakeKeychainBackend` for crypto logic; `spyOn(runProcess)`/`spyOn(Bun,"spawn")` + redefined `process.platform` for per-OS argv assertions (pattern from `core-auth-browser.test.ts`). No in-process mocks in spawned-CLI e2e tests; use only the explicit test-only backend selector described in Phase 5.
- **Cross-platform assertions:** assert via `join()`/`basename()`/structural checks, never hardcoded `/`. Assert managed-directory content hashes, not symlink targets. For credentials, assert "is an envelope / no plaintext substring", not exact bytes.
- **Fail-closed:** tamper → `CredentialIntegrityError`; missing key → logged-out; no keychain → `NoKeychainError`. First-class tests.

## Overall acceptance criteria

- [ ] All Success-Criteria checkboxes met.
- [ ] `grep` gate: no `symlinkSync` in the skill/MCP write path; no `Bun.spawn(["tar"…])`, `/bin/sh`, or spawned `/usr/bin/env` in `cli/`. The `#!/usr/bin/env bun` shebang in `cli/index.ts` is intentionally out of scope unless the distribution story changes.
- [ ] Behavior-preserving proof: the descriptor refactor (Phase 4 step 1) leaves the full suite green with no edited expectations.
- [ ] `bun test` green on ubuntu-latest **and** windows-latest.
- [ ] `bun run typecheck` clean.

## Risks & mitigation

| Risk | Mitigation |
|---|---|
| Copy loses live-edit for skill authors | Re-run `drwn write` (or later `--watch`); production substrate ≠ dev loop. |
| Storage duplication (curated snapshot + tool copy) | Skills are tiny; idempotent skip-on-unchanged; curated-layer dissolution is the fast-follow. |
| node-tar diverges from system tar on the security path | Port `assertSeedEntriesSafe` onto `list`; test malicious-entry fixtures. |
| Descriptor refactor silently changes behavior | Land it with zero expectation edits; any red test = accidental change. |
| Codex `hooks.json` rejects `command`+`args` | **Verification gate** before standardizing `sync-hooks.ts:117`. |
| No OS keychain (headless Linux/containers) | Refuse-to-persist → `DRWN_TOKEN`; never plaintext. |
| Secrets leaking via argv | Keychain backends pass secrets over **stdin** where the platform tool supports it; the macOS `security -w` exception is explicit Verification Gate 3. |

## Verification gates (resolve during implementation, not blockers to start)

1. **Codex `hooks.json` schema** — confirm it accepts `{command:"node", args:[…]}` (not a shell string) before Phase 4's hook-form change. If it requires a string, keep codex on the string form and standardize only where safe.
2. **Cowork-VM probe** (D7) — on a real Cowork install, confirm copied skills load, MCP connects, hooks fire (and observe workspace-trust). Validates Phase 1 + informs Phase 4 doctor messaging; copy is the safe default regardless.
3. **macOS `security -w <value>`** briefly places the key on argv — accepted for single-user macOS unless we later object.

## Notes / fast-follows (out of scope here)

- **Curated-layer dissolution** (D3): collapse `~/.agents/skills` into pure source-resolution (copy straight from the winning source to the tool dir). `curate` has no consumer requiring a symlink (`user-config.ts` reads names only). Do after Phase 1 stabilizes.
- **`CLAUDE_CONFIG_DIR`** support, if desired, belongs at the tool-path/descriptor layer (not the home resolver) — separate task.
- **ACL hardening depth** on Windows (beyond `icacls` owner-only) — revisit only with a concrete threat model.
