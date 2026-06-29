# ABOUTME: Target architecture for a portable, multi-surface drwn write path — copy-based materialization, Cowork surface support, and Windows support.
# ABOUTME: Unifies skills/MCP/hooks onto OS-uniform primitives (plain files + explicit interpreter), grounded in the existing write-record/drift machinery.

# Analysis 82 — Portable, Multi-Surface Write Path: Target Architecture

**Date**: 2026-06-28
**Author**: Claude + Remy
**Status**: Draft — target architecture for review
**References**: [.ai/analyses/80_drwn-cowork-target-investigation.md, .ai/analyses/81_drwn-cli-windows-portability-investigation.md, .ai/analyses/79_cowork_management_guide.md, .ai/analyses/70_mcp-multi-target-write-adapter-architecture.md, cli/core/write-record.ts, cli/core/skills.ts, cli/core/skill-packages.ts, cli/core/store-seed.ts, cli/core/sync.ts, cli/core/mcp.ts, cli/core/paths.ts, cli/core/types.ts, cli/core/diagnostics.ts, cli/core/hook-generator/sync-hooks.ts, cli/core/hook-generator/runtime-selection.ts, cli/core/mind-generator/sync-mind.ts, cli/context.ts, cli/core/catalogs.ts, registry/config.json]

---

## Executive Summary

This document specifies the target architecture for the `drwn` write path once we accept the four resolutions from analyses 80 and 81:

1. **Skills are copied, not symlinked.** The agent-readable skill directory and the internal curated layer become copied snapshots tracked by content hash; the skill-package `current` version cursor becomes a pointer file.
2. **MCP stays content-merge, and the one remaining symlink (Cursor's `.cursor/mcp.json`) becomes a direct content write.** Zero symlinks anywhere in the MCP path.
3. **Hooks stay on the controlled-interpreter model** (already `node <composer.mjs>`); we standardize the command form and surface Cowork runtime caveats in `doctor`.
4. **Cowork is modeled as a *surface* served by the `claude` target** — not a separate write-target — because Cowork and Claude Code share the same `~/.claude/*` files (a separate target would be an illusory toggle that no-ops next to claude). A small **target-descriptor table** still replaces the scattered target branches; Cowork support is descriptor metadata (`claude` serves Claude Code + Cowork) + `doctor` checks for Cowork's runtime caveats + docs.
5. **A thin portability layer** unifies home/config-root resolution, archive (tar) handling, and shell invocation so the CLI runs on Windows.

The unifying principle is one sentence: **the harness depends only on primitives that are uniform across every OS and every consuming surface — plain files and an explicit interpreter — and avoids OS-specific filesystem features (symlinks, executable bits) and OS-specific execution (shells).**

The single most important architectural finding is that **the target state is already latent in the codebase.** The write-record model already defines `kind: "managed-directory"` with a directory content hash (`write-record.ts:38-61`), drift verification for it already exists (`sync.ts:235-245`), and the mind generator already materializes directories this way (`sync-mind.ts:35-40`). Skills, MCP-Cursor, and the package cursor are the *only* parts of the write path still using symlinks. This work makes the write path **uniform** with machinery that already ships and is tested — it is a convergence, not a rewrite. A corollary is that the symlink→copy **migration needs no bespoke code** (verified): a skill keeps the *same* record `path` across the change, so `diffWriteRecord` routes it to `toVerify` (which tolerates the legacy `symlink` record — `verifyManagedPaths` skips non-`managed-*` kinds), and `materializeDir` then replaces the on-disk symlink in place because its content hash never matches the symlink's; the write-record is finally rewritten wholesale from the new desired set. `cleanupRemovedManagedPaths` only fires for skills that *drop out* of the desired set. (The package `current` cursor is **not** in the write-record, so its symlink→pointer change is a hard cut — see §2.1.)

---

## Decisions ratified (2026-06-28)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Cowork modeling | **Surface annotation on the `claude` target** (Model A) — not a separate write-target | Cowork shares Claude Code's exact `~/.claude/*` files; a separate target is an illusory toggle (materialization no-op next to claude). Modeled as descriptor metadata + `doctor` caveats + docs; promote to a real target only if Cowork storage diverges. Dissolves the earlier "add cowork to `TargetName`", the `Partial<Record>` type change, and the cowork-default question. |
| D2 | Target abstraction depth | Descriptor table (`targets.ts`) | Kills ~12 scattered `if (target===…)` branches; carries the Cowork surface metadata; `TargetName` stays `claude\|codex\|cursor`. |
| D-bc | Package `current` cursor migration | **Hard cut** — pointer file only, no back-compat dual-read | Long-term simplicity over a transition shim; existing installs re-install/re-seed. |
| D3 | Curated layer | Keep as a copied snapshot in Phase 1; dissolve as a fast-follow | Decouples the high-value copy migration from a structural simplification. |
| D4 | Archive/tar | Pure-JS tar | One path, no OS binary, no flag-compatibility roulette. |
| D5 | Windows runtime baseline | Node dist artifact (supported); Bun for contributors | Matches the published artifact; hooks already bundle `target:"node"`. |
| D6 | **Credential storage** | **Encryption at rest on all platforms** — AES-256-GCM file, OS-keychain-held key, ACL/chmod defense-in-depth, env-var path for headless, refuse-to-persist where no keychain | Security is non-negotiable; closes the plaintext-token leak via synced/backed-up home dirs (the Cowork-guide §5 sync/redirect risk) on every platform, not just Windows. |
| D7 | Cowork-VM probe | Don't gate; run alongside Phase 1 | Copy is the safe default regardless of the probe result. |

---

## Context

The CLI works on macOS against Claude Code. Two goals — (a) also serve Claude Cowork, (b) run on Windows — converged on one root design choice: the materialization substrate. Analyses 80 and 81 established the *what* and *why*; this document specifies the *how* and the end-state architecture, assuming the recommended resolutions are accepted.

Scope: the write path (`drwn write` and its `syncSkills` / `syncMcp` / `syncHooks` stages), the materialization primitives, the write-record/drift bookkeeping, the target model, and the portability layer. Out of scope: Cowork UI constructs with no harness write path (scheduled tasks, Global/Folder instructions), and the analysis-70 MCP adapter work, which already shipped.

---

## Guiding principle and how each mechanism measures against it

| Mechanism | Today | Uniform-primitive? | Target |
|---|---|---|---|
| MCP (claude/codex) | content merge into JSON/TOML | ✅ plain files | unchanged |
| MCP (cursor) | generated file + **symlink** | ❌ symlink | direct content write (`managed-content`) |
| Hooks (config) | merge into `settings.json` | ✅ plain files | unchanged |
| Hooks (command) | `node <composer.mjs>` (explicit interpreter) | ✅ interpreter | standardize `command`+`args` form |
| Skills (agent-readable) | **directory symlink** | ❌ symlink | copied dir (`managed-directory`) |
| Skills (curated layer) | **directory symlink** | ❌ symlink | copied dir |
| Package `current` cursor | **directory symlink** | ❌ symlink | pointer file |
| Credentials at rest | plaintext JSON + `chmod 0o600` | ❌ plaintext everywhere; chmod is an NTFS no-op | encrypted at rest (AES-GCM, OS-keychain-held key), all platforms |
| Archive ops | shell `tar` | ❌ OS binary | portable archive helper |
| Home resolution | `process.env.HOME` | ❌ POSIX env | unified resolver |

Skills are the outlier; this architecture removes the outlier.

---

## Part 1 — Current architecture (grounded baseline)

### 1.1 The write path

`drwn write` → `syncRepository` orchestrates three stages: `syncSkills` (`skills.ts:281-437`), `syncMcp` (`sync.ts:262-382`), `syncHooks` (`hook-generator/sync-hooks.ts`). Each returns a `SyncResult` carrying `changes`, `warnings`, and `managedPaths`. After all stages, `diffWriteRecord` reconciles the new `managedPaths` against the previous `write-record.json` and `cleanupRemovedManagedPaths` deletes what is no longer desired (`sync.ts:427-429`).

### 1.2 The materialization bookkeeping (the load-bearing existing machinery)

`write-record.ts:20-32` already models five managed-path kinds:

```ts
export type ManagedPath =
  | { path: string; kind: "symlink"; target: string }
  | { path: string; kind: "managed-fields"; fields: string[]; fieldHashes: Record<string, string> }
  | { path: string; kind: "generated-symlink"; generatedPath: string }
  | { path: string; kind: "managed-content"; contentHash: string }
  | { path: string; kind: "managed-directory"; contentHash: string };
```

- `managed-content` / `managed-directory` are the **copy/snapshot** kinds. `hashManagedContent(bytes)` and `hashManagedDirectory(dir)` (walks tree, hashes relative paths + file contents) produce the recorded hashes.
- Drift verification already branches per kind (`sync.ts:214-259`): `managed-directory` recomputes `hashManagedDirectory(dest)` and throws `"Refusing to overwrite managed directory drift … Rerun drwn write --force"` if it differs (`sync.ts:235-245`); `managed-content` does the same byte-wise (`sync.ts:249-258`).
- `managed-fields` (with per-field canonical hashes, `managed-fields.ts:26-36`) tracks per-server ownership inside shared files like `~/.claude.json` and `~/.codex/config.toml`.

**The mind generator already emits `managed-directory`** (`sync-mind.ts:35-40`). So copying a directory and tracking it by content hash is a solved, tested pattern in this codebase.

### 1.3 The three remaining symlink sites

1. **Skills** — `ensureDirSymlink` (`skills.ts:50-72`) does `symlinkSync(targetPath, linkPath, "dir")`; records `{ kind: "symlink", target }`. Used for the agent-readable `~/.claude/skills/<name>` and project `.claude/skills/<name>`.
2. **Curated layer** — `curate` symlinks `~/.agents/skills/<name>` → repo skill (`skills.ts:251`); the tool layer often chains to it.
3. **Package cursor** — `installSkillBundleRoot` does `symlinkSync(version, currentPath, "dir")` (`skill-packages.ts:277`); read back via `readlink` in `listInstalledSkillBundles` (`skill-packages.ts:156-189`).
4. **Cursor MCP** — `syncMcp` writes a generated file and records `{ kind: "generated-symlink", generatedPath }` for `.cursor/mcp.json` (`sync.ts:370-378`).

### 1.4 The target model

`TargetName = "claude" | "codex" | "cursor"` (`types.ts:7`), each a `TargetConfig` (`types.ts:33-40`) seeded from `registry/config.json:3-24`. Behavior is dispatched by **scattered `if (targetName === …)` branches** across `sync.ts`, `skills.ts`, `diagnostics.ts`, `sync-hooks.ts`, `runtime-selection.ts`, plus literal validation in `write.ts`, `mcp/write.ts`, `card-manifest.ts`, `beads.ts`. `resolveToolPaths` returns hardcoded `claude*/codex*/cursor*` keys (`paths.ts:63-77`). Hook runtimes (`Runtime = "claude-code" | "codex" | "mastra"`) map to targets in `runtime-selection.ts:15-35`.

---

## Part 2 — Target architecture

### 2.1 Materialization substrate: one copy primitive, one pointer primitive

Introduce two primitives in a new `cli/core/materialize.ts`, replacing every directory symlink:

```ts
// Copy a source directory into dest as a managed snapshot.
// - dereferences symlinks (dest contains only real files)
// - idempotent: if dest exists and hashes to the expected content, no-op
// - drift: caller verifies via the existing managed-directory check before overwrite
// returns the ManagedPath record to push into SyncResult.managedPaths
export function materializeDir(
  source: string,
  dest: string,
  opts: { dryRun: boolean; result: SyncResult; relPath: string },
): { path: string; kind: "managed-directory"; contentHash: string };

// Write a small pointer file (replaces an internal "current → version" symlink).
export function materializePointer(
  dest: string,           // e.g. <pkgRoot>/current
  value: string,          // e.g. "1.0.0"
  opts: { dryRun: boolean; result: SyncResult },
): { path: string; kind: "managed-content"; contentHash: string };
```

**Skills.** `ensureDirSymlink` (`skills.ts:50-72`) is replaced by `materializeDir`. The `SymlinkIntent` map (`skills.ts:75-101`) becomes a `MaterializeIntent` map — the resolution logic (which layer wins, `alsoAvailable` dedup) is **unchanged**; only the terminal action changes from `symlinkSync` to `materializeDir`. The recorded `managedPath` changes from `{ kind: "symlink", target }` to the `managed-directory` record. The curated layer (`skills.ts:251`) uses the same `materializeDir`, so the chained-symlink topology collapses to: *resolve the winning source → copy it once into the tool skills dir.* Internal curated copies and tool-layer copies use the identical primitive.

**Package cursor.** `skill-packages.ts:277` `symlinkSync(version, currentPath, "dir")` → `materializePointer(currentPath, version)`. `listInstalledSkillBundles` (`skill-packages.ts:156-189`) reads `readFile(currentPath)` instead of `readlink`. (The version directories themselves were already real dirs produced by `rename`, so nothing else changes.)

**Cursor MCP.** The `syncMcp` cursor branch (`sync.ts:370-378`) writes the rendered content **directly** to `.cursor/mcp.json` via `writeManagedFile` and records `{ kind: "managed-content", contentHash }` — exactly like the Claude `.mcp.json` branch (`sync.ts:315-320`). The intermediate generated `cursor-mcp.json` and its symlink are removed. `TargetConfig.symlink` (`types.ts:39`) and the `"symlink": true` in `registry/config.json` are dropped. `detectMissingGeneratedFiles` (`diagnostics.ts:515-526`) and the cursor drift check (`diagnostics.ts:500-508`) switch to comparing `.cursor/mcp.json` content against the rendered expectation, matching the Claude path.

**Why no migration code is needed (verified mechanism).** A skill keeps the *same* record `path` (e.g. `.claude/skills/alpha`) across the change, so on the first `drwn write` `diffWriteRecord` routes the old `{ kind: "symlink" }` entry to **`toVerify`, not `toRemove`** — and `verifyManagedPaths` simply skips it (it only drift-checks `managed-content`/`managed-directory`). `materializeDir` then sees the on-disk symlink, computes a directory hash that can never equal the real source-tree hash, and **replaces the symlink with a real copy in place**. The write-record is finally rewritten wholesale from the new desired set, so the `symlink` entry disappears. `cleanupRemovedManagedPaths`'s symlink-removal branch (`sync.ts:171-185`) still matters, but only for skills that *drop out* of the desired set entirely. Stale scanning (`findStaleSymlinks`→`findStaleManagedEntries`, `skills.ts:268-279`) generalizes by dropping the `isSymbolicLink()` filter so it also finds stale copied dirs. (The package `current` cursor is **not** tracked in the write-record, so its symlink→pointer switch is a **hard cut** — existing installs re-install/re-seed; no dual-read.)

### 2.2 Portability layer

Four small, centralized helpers; no logic outside them needs to know the OS.

**Home / config-root resolver** (`cli/core/home.ts`, consumed by both `context.ts:19` and `paths.ts:112` so they cannot drift):

```ts
export function resolveHomeDir(env = process.env): string {
  return env.AGENTS_HOME_DIR
    ?? env.HOME
    ?? env.USERPROFILE              // Windows
    ?? homedir();                   // last-resort, always defined
}
```

This fixes the startup crash (`context.ts:19` `HOME`-only with `""` fallback). **`CLAUDE_CONFIG_DIR` is deliberately *not* in this resolver**: it points at the `.claude` config dir, not `$HOME`, so feeding it as `homeDir` would misroute `~/.agents` and the skill paths. If we honor it, it belongs at the tool-path/descriptor layer (Phase 3/4), not the home resolver — out of scope for Phase 0.

**Archive helper** (`cli/core/archive.ts`): one module over **node-tar** (a pure-JS, no-node-gyp dependency) wrapping `extract`/`list`/`create`. Replaces all six shell-`tar` sites (`git.ts:353`, `store-seed.ts:114,126`, `skill-packages.ts:316`, `export/archiver.ts`, `store/export.ts:27`). gzip is auto-sniffed on read (so `.tgz` "just works") and explicit on create. The macOS-only `--no-mac-metadata`/`COPYFILE_DISABLE` branch is **dropped** — node-tar reads file contents directly and never synthesizes AppleDouble `._*` entries, so the problem disappears structurally (`validateArchiveMembers` stays as a belt-and-suspenders check). The `store-seed.ts` tar-entry safety validation (`assertTarEntriesSafe`) ports verbatim onto the helper's `list` output (list → validate → extract, preserving fail-closed-before-write).

**Shell: no helper needed (YAGNI).** The only shell site (`extensions/doctor.ts:122`, `/bin/sh -c "printf … | markitdown"`) is fixed more portably by piping the content as **stdin** straight to `markitdown -x md` via `runProcess` — no shell, no `printf` (which `cmd.exe` lacks). Harness-generated hook commands already avoid shells (`node <bundle>`, §2.4). A `shell.ts` is built only if a genuine shell snippet ever appears.

**Drop the `/usr/bin/env` launcher** (`catalogs.ts:42`): spawn `npm` directly (resolved from PATH; `npm.cmd` on Windows).

**Executable bits**: rely on explicit interpreters (`node <script>`, `bun <script>`) so no file needs an exec bit. The build-script `chmod 0o755` (`build-cli.mjs:50`) stays (harmless no-op on Windows; npm generates the shim). The credentials file's protection is upgraded from chmod-only to encryption at rest — see §2.5.

### 2.3 Target model: a descriptor table; Cowork as a surface, not a target

`TargetName` stays `"claude" | "codex" | "cursor"` (no `cowork`). The scattered `if (targetName === …)` branches collapse into a single source of truth in `cli/core/targets.ts`:

```ts
type TargetFamily = "claude" | "codex" | "cursor";

interface TargetDescriptor {
  name: TargetName;            // "claude" | "codex" | "cursor"
  family: TargetFamily;
  surfaces: string[];          // claude -> ["claude-code", "cowork"]; codex -> ["codex"]; cursor -> ["cursor"]
  mcpFormat: "json-merge" | "toml-merge" | "json-standalone";
  renderStandalone?: (servers) => string;   // analysis-70 adapter; undefined for codex (merge-only)
  projectMcpPath: (p: ToolPaths) => string;
  toolSkillsDir?: (p: ToolPaths) => string; // undefined => consumes no skills (cursor)
  skillScopeDirs?: (s) => string[];
  hookRuntime?: Runtime;       // claude -> "claude-code"; codex -> "codex"; cursor -> undefined
}

export const ALL_TARGET_NAMES: TargetName[];
export function isTargetName(v: string): v is TargetName;
export function getTargetDescriptor(name: TargetName): TargetDescriptor;
export function descriptorsFor(config, target?): TargetDescriptor[]; // honors enabled + --target
```

The high-fanout branch sites (`sync.ts`, `diagnostics.ts`, `sync-hooks.ts`, `skills.ts`) consume `getTargetDescriptor` / `descriptorsFor` instead of literal comparisons. Low-fanout validation sites (`write.ts:76`, `mcp/write.ts:41`, `card-manifest.ts:201-204`, `card-diff.ts:65`) use `isTargetName` / `ALL_TARGET_NAMES`. (Beads keeps its own independent target set — no cowork there.) `DESCRIPTORS` is a total `Record<TargetName, TargetDescriptor>`, so the compiler forces a descriptor for every target; `CanonicalConfig.targets` stays a total `Record` (no `Partial` change is needed once cowork is not a `TargetName`).

**Cowork is a surface, not a target.** Because Cowork and Claude Code read the *same* `~/.claude/*` files, there is no separate cowork write destination — a separate target would be an illusory toggle (a materialization no-op next to claude). Instead the `claude` descriptor declares `surfaces: ["claude-code", "cowork"]`. That metadata drives:
- **Docs** — the `claude` target is documented as configuring both Claude Code and Cowork.
- **`doctor`** — Cowork-specific runtime caveats (workspace-trust gating, start-of-session snapshot, the POSIX-shell-in-hooks note on Windows) are surfaced when the `claude` target is enabled.

If Cowork's storage ever genuinely diverges from Claude Code's (the Cowork guide warns it is "actively evolving"), *then* it is promoted to a real `TargetName`/descriptor with its own paths — a localized change the descriptor table already accommodates. We do not model that divergence speculatively now.

### 2.4 Hooks

Hooks already invoke an explicit interpreter — `{ type: "command", command: "node", args: [composerPath] }` (`sync-hooks.ts:94`), composer bundled `target: "node"` (`bundle-composer.ts:102-107`). Two refinements:

1. **Standardize on the structured form.** Replace the interpolated-string variant `command: \`node ${JSON.stringify(composerPath)}\`` (`sync-hooks.ts:117`) with the `command: "node", args: [composerPath]` array form everywhere, eliminating any consumer-side shell-quoting dependence on Windows.
2. **Surface Cowork runtime semantics in `doctor`** (workspace-trust gating, start-of-session snapshot, per analysis 80 §Hooks): a `cowork`-aware diagnostic that warns these are Cowork-side and out of the CLI's control. This is detection/communication, not control.

Hook config materialization (merge into `settings.json`) is already content-based and Cowork-readable; no change. Prerequisite to state explicitly: `node` must be on PATH at hook-runtime on the consumer.

### 2.5 Secret storage: credentials encrypted at rest, all platforms

Today `credentials.json` holds the bearer `access_token` in **plaintext**, protected only by `chmod 0o600` (`auth/credentials.ts:48-54`) — a no-op on NTFS and, more importantly, plaintext at rest on *every* platform. The dominant threat is exfiltration via **synced or backed-up home directories** (OneDrive, Time Machine, Dropbox; doc 79 §5 specifically flags redirected `%USERPROFILE%`/Documents on Windows). A plaintext token in a synced folder leaks off-machine regardless of file permissions.

Threat model: T1 other local user/process reads the file (access control); T2 sync/backup carries the plaintext token off-machine; T3 offline disk access. Access control (chmod/ACL) addresses only T1; encryption at rest addresses T2/T3.

Target: a new `cli/core/secret-store.ts` providing encryption at rest on all platforms.

```
write:  token --AES-256-GCM--> credentials.json (ciphertext + nonce + tag)
        AES key stored in the OS keychain (sync-excluded, OS-encrypted):
          Windows -> DPAPI  (PowerShell [System.Security.Cryptography.ProtectedData])
          macOS   -> Keychain (`security add-generic-password`)
          Linux   -> Secret Service (`secret-tool` / libsecret)
        file also ACL/chmod-restricted as defense-in-depth
read:   fetch key from keychain -> AES-GCM decrypt (tag verifies integrity)
```

Design rules, consistent with the rest of this architecture:

- **No native node-gyp dependency** (keytar is deprecated). Backends **shell out** to native OS tools — the same pattern as git/npm/tar — through the portability layer.
- **Headless path preserved.** `resolveToken` already accepts `DRWN_TOKEN` + `DRWN_ANALYZER_URL` (`resolve-token.ts:21-28`); CI/headless keeps using env vars and never persists.
- **Refuse-to-persist invariant** (D6): if no OS keychain is available (headless Linux, minimal containers), the CLI does **not** fall back to plaintext — it declines to persist and directs the user to the env-var path. A persisted token is *always* encrypted; an unprotectable token is *never* persisted.
- **Integrity, not just secrecy:** AES-GCM's auth tag detects tampering on read; a corrupt/edited credentials file fails closed (re-auth) rather than silently using attacker-controlled bytes.

This makes the credentials surface OS-uniform in posture (encrypted everywhere) the same way skills/MCP/hooks are OS-uniform in materialization.

---

## Part 3 — Diagnostics / doctor

`detectBrokenSymlinks` and `detectStaleSkillSymlinks` (`diagnostics.ts:393-437,598-604`) generalize from symlink-specific checks to managed-path checks driven by the write-record (a copied skill dir that drifted or went stale is found the same way). `detectMcpDrift` (`diagnostics.ts:439-512`) loses its cursor special-case (cursor now matches the claude content-compare path). New checks:

- **Cowork awareness**: when the `claude` target is enabled, report that it also serves the Cowork surface and note Cowork's runtime caveats (workspace-trust gating, start-of-session snapshot, POSIX-shell-in-hooks on Windows). Driven by the `claude` descriptor's `surfaces` metadata.
- **Windows portability self-check**: verify `node` resolves on PATH (hooks), that the archive helper is functional, and that the resolved home dir is non-empty.

---

## Part 4 — End-state module map

```
cli/core/
  home.ts          (NEW) single home/config-root resolver  ← context.ts, paths.ts
  materialize.ts   (NEW) materializeDir / materializePointer (copy + pointer)  ← skills.ts, skill-packages.ts
  archive.ts       (NEW) portable tar (node-tar) create/extract/list  ← git.ts, store-seed.ts, skill-packages.ts, export/*, store/export.ts
  secret-store.ts  (NEW) encrypted credential storage (AES-GCM, OS-keychain-held key)  ← auth/credentials.ts
  targets.ts       (NEW) TargetDescriptor registry + getTargetDescriptor/descriptorsFor (carries Cowork surface metadata)  ← sync.ts, diagnostics.ts, sync-hooks.ts, skills.ts
  write-record.ts  (unchanged model; symlink kinds become legacy-read-only for cleanup)
  skills.ts        (materializeDir replaces ensureDirSymlink; resolution logic unchanged)
  sync.ts          (cursor branch → managed-content; target dispatch via descriptors)
  mcp.ts           (unchanged — analysis-70 adapters reused by descriptors)
  extensions/doctor.ts  (markitdown smoke uses stdin, not /bin/sh)
```

No new subsystems; four small modules (`home`, `materialize`, `archive`, `secret-store`) plus `targets.ts` that **absorb** existing scattered logic. No `shell.ts` — the lone shell site is removed by piping stdin. The write-record model is unchanged — the `symlink`/`generated-symlink` kinds remain only so legacy skill records read cleanly during the transition.

---

## Part 5 — Phased implementation plan (TDD)

Each phase is independently shippable and leads with a failing test, per project rules.

**Phase 0 — Portability foundation (unblocks Windows startup).**
- `home.ts` resolver (`AGENTS_HOME_DIR > HOME > USERPROFILE > homedir()`, never `""`); wire `context.ts:19` + `paths.ts:112`. Test: empty `HOME` falls back to `USERPROFILE` then `homedir()`; `AGENTS_HOME_DIR` wins. (`CLAUDE_CONFIG_DIR` intentionally excluded — §2.2.)
- Drop `/usr/bin/env` in `catalogs.ts:42`.

**Phase 1 — Copy-based skills + pointer cursor (the core change).**
- `materialize.ts` (`materializeDir`, `materializePointer`). Tests: copy fidelity, idempotency (no-op when dest hash matches), drift throws without `--force`, dereferences symlinks.
- Switch `skills.ts` (`ensureDirSymlink` → `materializeDir`; intents record `managed-directory`) and the curated layer (`skills.ts:251`).
- Switch package cursor (`skill-packages.ts:277` → `materializePointer`; `:156-189` read pointer file).
- Generalize `findStaleSymlinks` → stale managed entries.
- Migration test: seed a write-record with old `symlink` entries, run write, assert old links removed and copies present (proves `diffWriteRecord` handles it).

**Phase 2 — Portable archive (unblocks the rest of Windows).**
- Add the `tar` (node-tar) dependency; `archive.ts` replacing all six `tar` sites, including the `store-seed` entry-safety validation (port onto `list`) and dropping the `--no-mac-metadata` branch. Port the test fixture builders off system `tar`.
- Markitdown smoke: pipe stdin to `markitdown -x md` (no `/bin/sh`).

**Phase 3 — Cursor MCP de-symlink.**
- `syncMcp` cursor branch → `writeManagedFile` + `managed-content`; remove the generated `cursor-mcp.json` (one-time orphan cleanup) + `TargetConfig.symlink` + `registry/config.json` `symlink`. Update `diagnostics.ts` cursor drift + drop the cursor `missingGeneratedFiles` check. Test: `.cursor/mcp.json` is a real file with correct content and drift detection.

**Phase 4 — Target descriptor + Cowork surface.**
- `targets.ts` registry (descriptors only, **no behavior change**); migrate the high-fanout branch sites; full suite must stay green untouched (proves pure restructuring).
- Add the `claude` descriptor's `surfaces: ["claude-code","cowork"]`; `doctor` Cowork-awareness checks + docs. (No `TargetName` change, no `Partial` type change, no `registry/config.json` cowork entry.)
- Hook command-form standardization (`sync-hooks.ts:117` → array form) — **gated** on confirming Codex's `hooks.json` accepts `command`+`args`.
- Doctor: Windows self-check (`node` on PATH, archive helper functional, home dir non-empty).

**Phase 5 — Secret storage hardening (all platforms).**
- `secret-store.ts`: AES-256-GCM encrypt `credentials.json`; AES key held in the OS keychain (DPAPI / Keychain / libsecret) via shelled native tools; ACL/chmod as defense-in-depth.
- Preserve the `DRWN_TOKEN` env-var path for headless; **refuse-to-persist** (no plaintext fallback) where no keychain is available.
- Tests: per-backend encrypt/decrypt round-trip (mock at the shell boundary), GCM tamper-detection fails closed, headless env-var path, no-keychain refuse-to-persist, Windows ACL applied.

**Phase 6 — Windows CI + acceptance.**
- Windows CI lane running `bun test`; iterate to green (the real acceptance gate).

Sequencing rationale: Phase 0+1 make `drwn write` skills functional and OS-uniform (the highest-value change, serving both Windows and Cowork-VM at once). Phase 2 clears the remaining Windows blockers. Phases 3–4 are consistency/feature work. Phase 5 closes the credential-at-rest gap on every platform. Phase 6 locks it in.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Copy loses "edit source → live" for skill authors | Authors re-run `drwn write` (or a later `--watch`); production substrate shouldn't optimize for the dev loop (analysis 80/81). |
| Storage duplication from copies | Skills are small (text + scripts). If a skill bundles large assets, add content-addressed dedup in the store later; still copy out. |
| Copy is slower than symlink on big skill sets | `materializeDir` is idempotent (skip when dest hash matches); `drwn write` is not a hot path. |
| Descriptor refactor changes existing target behavior | Each migrated branch site gets a regression test asserting claude/codex/cursor output is byte-identical before/after. |
| Pure-JS tar diverges from system tar (security validation) | Port `assertTarEntriesSafe` checks into the archive helper's `list`; test against known-malicious entry fixtures. |
| Cowork VM still can't read copied skills | Copies are plain files in `~/.claude/skills/`; this is the most-readable possible form. The Cowork probe (Open Q1) confirms, but copy is the safe default regardless. |
| No OS keychain available (headless Linux, minimal containers) | Refuse to persist; require the `DRWN_TOKEN` env var (already supported, `resolve-token.ts:21-28`). Never write a plaintext token. |
| Keychain shell-out flakiness / prompts | Treat keychain failure as "cannot persist" → env-var path + clear message; never silently downgrade to plaintext. |

---

## Open Questions

1. **Cowork-VM probe** (carried from analysis 80): confirm copied skills load, MCP connects, and hooks fire (and what workspace-trust does) in a real Cowork session. Copy is the safe default whatever the answer; the probe validates and informs the doctor messaging.
2. **Pure-JS tar vs. detect-system-`tar`** (carried from analysis 81): dependency surface vs. code. Affects the `archive.ts` internals only.
3. **Dissolve the curated layer entirely?** With copy-based materialization, the curated symlink farm could collapse into pure source-resolution (copy straight from the winning source to the tool dir). Phase 1 keeps the curated layer as a copied snapshot for minimal change; dissolving it is a follow-up simplification — confirm `curate` has no independent consumer first.
4. **Runtime baseline for Windows**: resolved (D5) — node dist artifact supported, Bun for contributors. Confirm the CI matrix.
5. **Headless-Linux credential UX** (the D6 fallback): refuse-to-persist is chosen; revisit only if CI friction proves it too strict (then warn-and-env-var, never plaintext).

---

## Appendix A — File-by-file change inventory

| File | Change | Phase |
|---|---|---|
| `cli/core/home.ts` | NEW resolver | 0 |
| `cli/context.ts:19`, `cli/core/paths.ts:112` | use `resolveHomeDir` | 0 |
| `cli/core/catalogs.ts:42` | drop `/usr/bin/env` | 0 |
| `cli/core/materialize.ts` | NEW copy + pointer primitives | 1 |
| `cli/core/skills.ts:50-72,251,268-279,313-434` | `materializeDir`; intents → `managed-directory`; stale generalization | 1 |
| `cli/core/skill-packages.ts:156-189,277` | pointer file replaces `current` symlink | 1 |
| `cli/core/archive.ts` (NEW, + `tar` dep) | node-tar `extract`/`list`/`create`; port safety validation; drop `--no-mac-metadata` | 2 |
| `cli/core/git.ts:353`, `store-seed.ts:114,126`, `skill-packages.ts:316`, `export/archiver.ts`, `store/export.ts:27` | use `archive.ts` | 2 |
| `cli/core/extensions/doctor.ts:122` | markitdown smoke via stdin (no `/bin/sh`); no `shell.ts` | 2 |
| `cli/core/secret-store.ts` (NEW), `auth/credentials.ts:48-62` | AES-GCM encryption at rest; OS-keychain-held key via `runProcess` (stdin); ACL(`icacls`)/chmod defense-in-depth; refuse-to-persist without keychain | 5 |
| `cli/core/sync.ts:370-378`, `diagnostics.ts:500-526` | Cursor MCP → `managed-content`; orphan generated-file cleanup | 3 |
| `cli/core/types.ts:39`, `registry/config.json` | drop `TargetConfig.symlink` + cursor `symlink:true` | 3 |
| `cli/core/targets.ts` (NEW) | descriptor registry (`getTargetDescriptor`/`descriptorsFor`/`isTargetName`/`ALL_TARGET_NAMES`); `claude.surfaces=["claude-code","cowork"]` | 4 |
| `cli/core/sync.ts`, `diagnostics.ts`, `sync-hooks.ts`, `skills.ts` | dispatch via descriptors (behavior-identical) | 4 |
| `cli/commands/write.ts:76`, `mcp/write.ts:41`, `card-manifest.ts:201`, `card-diff.ts:65` | validate via `isTargetName`/`ALL_TARGET_NAMES` | 4 |
| `cli/core/hook-generator/sync-hooks.ts:117` | array `command`+`args` form (gated on Codex schema check) | 4 |
| `cli/commands/doctor.ts`, `diagnostics.ts` | Cowork-surface awareness + Windows self-check | 4 |
| `.github/workflows/ci.yml` | Windows matrix lane running `bun test` | 6 |

## Appendix B — Key existing-machinery references (the target state is latent here)

- `cli/core/write-record.ts:20-32` — `ManagedPath` kinds incl. `managed-directory` / `managed-content`.
- `cli/core/write-record.ts:38-61` — `hashManagedDirectory` (tree content hash).
- `cli/core/write-record.ts:101-123` — `diffWriteRecord` (automatic migration reconciliation).
- `cli/core/sync.ts:235-245` — `managed-directory` drift verification (reused by copied skills).
- `cli/core/sync.ts:249-258` — `managed-content` drift verification (reused by Cursor MCP).
- `cli/core/sync.ts:171-185,427-429` — symlink removal + cleanup (handles old records during transition).
- `cli/core/mind-generator/sync-mind.ts:35-40` — existing `managed-directory` producer (precedent).
- `cli/core/managed-file.ts:27-62` — atomic content write (reused for Cursor MCP).
- `cli/core/mcp.ts` — analysis-70 per-target render adapters (reused by descriptors).
