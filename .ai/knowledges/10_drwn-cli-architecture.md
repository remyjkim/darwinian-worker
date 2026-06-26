# ABOUTME: Comprehensive as-built architecture reference for the drwn CLI internals.
# ABOUTME: Covers process model, store topology, config layering, cards, skills, write pipeline, diagnostics.

# drwn CLI Architecture (As-Built)

**Category**: Reference
**Tags**: drwn, cli, architecture, internals, store, cards, skills, mcp, diagnostics, write-pipeline
**Last Updated**: 2026-06-03
**References**: [analyses/52_drwn-target-architecture-post-wave-1.md, analyses/43_drwn-cli-target-architecture.md, analyses/47_drwn-target-architecture-after-phase-1.md, analyses/49_drwn-target-architecture-after-phase-3.md, knowledges/01_agents-cli-usage-guide.md, knowledges/02_per-project-config-guide.md, knowledges/03_npm-skill-bundles-guide.md, cli/index.ts, cli/context.ts, cli/core/card-store.ts, cli/core/card-source.ts, cli/core/card-lock.ts, cli/core/card-manifest.ts, cli/core/card-skill-resolver.ts, cli/core/git.ts, cli/core/store-paths.ts, cli/core/paths.ts, cli/core/fs.ts, cli/core/sync.ts, cli/core/write-record.ts, cli/core/effective-state.ts, cli/core/diagnostics.ts, cli/core/skills.ts, cli/core/skill-packages.ts, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/extensions/registry.ts, registry/config.json, registry/mcp-servers.json]

---

## Overview

`drwn` is a single-process, Bun-executed, Clipanion-based CLI that manages local AI agent harness configuration: skills, MCP servers, target enablement, project overlays, and Mind Cards. There is no daemon, no IPC, and no persistent cache outside the filesystem. Every invocation is a fresh process that reads from a fixed set of on-disk surfaces, computes an effective state, and either reports or materializes that state into downstream agent-tool config files.

This document describes the **as-built** architecture against the code on the current branch (`remyjkim/mind-card-v1.1`, package `darwinian-mind@0.1.0`). It is grounded in `cli/index.ts` (the entrypoint), the `cli/commands/` tree (the user-facing surface), and the `cli/core/` modules (the engine). Every concrete claim cites `path/to/file.ts:LINE`. Where current behavior diverges from `analyses/52_drwn-target-architecture-post-wave-1.md` (the canonical target doc), the divergence is called out in **Appendix C**.

This is a reference doc. It does not prescribe how to extend the CLI; it describes what is true today so that future changes can be made without recreating the analysis. When code changes, this doc must change with it.

---

## Design principles (carry-forward rules)

Six disciplines are enforced consistently across the codebase:

1. **Single resolved context per process.** `createAgentsContext()` runs once at startup (`cli/index.ts:175`) and freezes `repoRoot`, `agentsDir`, `homeDir`, `cwd`, `projectConfigPath`. No command re-reads `homedir()` or `process.cwd()` mid-execution. Sandbox env vars (`AGENTS_REPO_ROOT`, `AGENTS_HOME_DIR`, `AGENTS_DIR`) exist exclusively at this boundary.
2. **Single chokepoint for store mutation.** Every write under `~/.agents/drwn/` flows through a resolver in `cli/core/store-paths.ts` that calls `assertStoreWritable()` (`store-paths.ts:17-21`), and through `writeAtomically()` (`fs.ts:31-45`) for content. Read-only mode (`DRWN_STORE_READONLY=1`) and crash-safe writes are architectural properties, not per-command discipline.
3. **Filesystem is the API; the lockfile is the contract.** No in-memory cache outlives a process. The per-user store layout (`store-paths.ts`), the per-project layout (`project.ts`, `card-lock.ts`, `write-record.ts`), and the typed schemas in `cli/core/types.ts` together form the contract. Future UIs (Electron, library mode) must read and write the same shapes.
4. **JSON output is universal but per-command.** There is no global `--json` option layer. Each command declares `Option.Boolean("--json", false, …)` individually and renders through `cli/core/output.ts:renderJson` (`output.ts:4-6`). Errors render via `DrwnError.toJSON()` (`errors.ts:15-22`).
5. **Mutations are atomic.** `writeAtomically` (`fs.ts:31-45`) is temp-then-rename. The write-record save additionally fsyncs the file and parent dir (`write-record.ts:38-55`). Migration uses a staging tree renamed into place (`migration.ts:99-146`).
6. **No daemon, no IPC, bounded local concurrency.** `cli/core/concurrency.ts` provides exactly `resolveFetchConcurrency()` (default 4, `DRWN_FETCH_CONCURRENCY`) and `pMap()`. No file locks, no mutexes — cross-process safety comes from atomic renames, not coordination.

These appear repeatedly below; treat them as load-bearing.

---

## 1. Process model & foundations

### 1.1 Invocation and command dispatch

The entrypoint is `cli/index.ts:1` (`#!/usr/bin/env bun`). It constructs a Clipanion `Cli` with `binaryName: "drwn"` (`cli/index.ts:93-97`), registers every command class as a top-level entry (`cli/index.ts:99-183`), and calls `cli.runExit(process.argv.slice(2), context)` (`cli/index.ts:192`). Before dispatch:

- `createAgentsContext()` builds the per-process context (`cli/index.ts:185`).
- `validateRepoRoot()` confirms a packaged `registry/config.json` exists (`cli/index.ts:188`, `cli/context.ts:34-38`); failure is fatal.
- `detectLegacyLayout(agentsDir)` emits a stderr warning when a pre-cards layout is present (`cli/index.ts:189-190`, `cli/core/migration.ts:38-43`).

Uncaught errors render to stderr and set `process.exitCode = 1` (`cli/index.ts:193-196`).

**Command tree (85 registrations).** All registrations are in a single block. Grouped by area:

| Namespace | Commands | TS files |
|---|---|---|
| skills | `skills list`, `skills packages add/list/show`, `skills curate`, `skills uncurate` | `cli/commands/skills/*` (`cli/index.ts:99-104`) |
| add | `add skill`, `add mcp`, `add card` | `cli/commands/add/{skill,mcp}.ts`, `cli/commands/card/add.ts` (`cli/index.ts:105-107`) |
| install | `install` | `cli/commands/install.ts` (`cli/index.ts:108`) |
| card (author) | `card new`, `card publish`, `card show`, `card source list/show/doctor/add-skill/remove-skill/set/add-mcp/remove-mcp`, `card list`, `card diff`, `card deprecate` | `cli/commands/card/{new,publish,show,source/*,list,diff,deprecate}.ts` (`cli/index.ts:109-123`) |
| card (sharing) | `card catalog publish`, `card remote add/list/set/remove`, `card push`, `card fetch`, `card clone` | `cli/commands/card/{catalog-publish,remote,push,fetch,clone}.ts` (`cli/index.ts`) |
| card (consumer) | `card apply`, `card add`, `card pin`, `card remove`, `card detach`, `card update`, `card outdated`, `card status`, `card validate` | `cli/commands/card/{apply,add,pin,remove,detach,update,outdated,status,validate}.ts` (`cli/index.ts:131-139`) |
| top-level aliases | `apply`, `update` (alias `card apply` / `card update`) | (`cli/index.ts:140-141`) |
| library | `library add skill/mcp`, `library catalog list/add/remove/refresh`, `library defaults list/add-skill/remove-skill/add-mcp/remove-mcp`, `library list`, `library show` | `cli/commands/library/*` (`cli/index.ts:142-154`) |
| search | `search skill`, `search mcp`, `search card` | `cli/commands/search/*` (`cli/index.ts:155-157`) |
| extensions | `extensions add/list/show/status/doctor/setup` | `cli/commands/extensions/*` (`cli/index.ts:158-163`) |
| mcp / write / scan / analyze / export | `mcp write`, `mcp list`, `write`, `scan`, `analyze sessions`, `export sessions` | (`cli/index.ts:164-169`) |
| store | `store migrate`, `store migrate-to-git`, `store gc`, `store verify`, `store export`, `store status` | `cli/commands/store/*` (`cli/index.ts:170-175`) |
| auth | `login`, `logout`, `whoami` | `cli/commands/auth/*` (`cli/index.ts:179-181`) |
| diagnostic / bootstrap | `status`, `doctor`, `init` | (`cli/index.ts:176-178`) |
| builtins | Clipanion `Help`, `Version` | (`cli/index.ts:182-183`) |

All commands extend `BaseCommand` (`cli/commands/base.ts:7`) — `abstract class extends Command<AgentsContext>`. There is no middleware layer; argument parsing routes Clipanion → `execute()` and the context is on `this.context`.

### 1.2 Execution context and sandbox env vars

`AgentsContext` (`cli/context.ts:10-16`) extends Clipanion's `BaseContext` with `repoRoot`, `homeDir`, `agentsDir`, `cwd`, `projectConfigPath`. `createAgentsContext()` reads three sandbox overrides:

| Env var | Purpose | Read at |
|---|---|---|
| `AGENTS_REPO_ROOT` | Override packaged repo root (location of `registry/config.json`) | `cli/context.ts:25` |
| `AGENTS_HOME_DIR` | Override `$HOME` for resolving `~/.agents/` | `cli/context.ts:19` |
| `AGENTS_DIR` | Override the resolved `~/.agents` directory itself | `cli/context.ts:27` |

When `AGENTS_REPO_ROOT` is unset, the resolver picks the cwd if it already contains `registry/config.json`, otherwise the directory of the running module (`cli/context.ts:20-26`). `agentsDir` defaults to `join(homeDir, ".agents")` (`cli/core/paths.ts:17-19`). `projectConfigPath` is memoized via upward search from cwd (`cli/context.ts:30`, `cli/core/project.ts:20-35`).

**Other process knobs:**

- `DRWN_STORE_READONLY=1` (or `=true`) — enforced by `assertStoreWritable()` (`store-paths.ts:17-21`). Every store-mutating helper calls it: `card-store.ts:115,229,355,621,724`, `card-catalog.ts:121,153,172`, `card-source.ts:453`, `card-install.ts:52,67`, `store-migrate.ts:53`, `url-card-map.ts:58`. Migration defers the check to after dry-run so `--dry-run` works against a read-only store (`store-migrate.ts:46-54`).
- `DRWN_FETCH_CONCURRENCY` — parallel fetch limit, default 4, clamped ≥1 (`concurrency.ts:11-17`).
- `DRWN_GIT_TIMEOUT_MS` — Git subprocess timeout, default 30000 (`git.ts:9`).
- `DRWN_ANALYZER_URL` — analyzer API override for `login`, env-token auth, and analyze uploads (`auth/config.ts:28-40`, `auth/resolve-token.ts:18-24`).
- `DRWN_ANALYZER_WEB_URL` — analyzer frontend URL override used to compose processing/report URLs (`auth/config.ts:38-40`, `analyze/url.ts:4-9`).
- `DRWN_TOKEN` — bearer-token override for non-login analyzer commands; must be paired with `DRWN_ANALYZER_URL` (`auth/resolve-token.ts:18-25`).

### 1.3 Per-user store topology

Store root is `~/.agents/drwn/`. `resolveAgentsDir(homeDir) = join(homeDir, ".agents")` (`paths.ts:17-19`); `resolveStoreRoot(agentsDir) = join(agentsDir, "drwn")` (`store-paths.ts:7-9`).

| Path | Resolver | Stores |
|---|---|---|
| `store.json` | `resolveStoreMetadataPath` (`store-paths.ts:23-25`) | `StoreMetadata` — `{schemaVersion: 1, initAt}` (`types.ts:71-74`) |
| `machine.json` | `resolveMachineConfigPath` (`store-paths.ts:27-29`) | `MachineConfig` (`types.ts:76-80`) — active machine harness baseline |
| `cards/` | `resolveCardsRoot` (`store-paths.ts:31-33`) | Per-card published store root |
| `cards/<scope?>/<name>.git/` | `resolveCardBareRepoPath` (`store-paths.ts:64-70`) | Bare Git repo per card; `[drwn] cardName`, `originUrl`, `deprecated.<v>` |
| `sources/<scope?>/<name>/` | `resolveCardSourceDir` (`store-paths.ts:107-113`) | Editable working tree for a card; independent of bare repo |
| `extracted/<tree-sha>/` | `resolveExtractedPath` (`store-paths.ts:72-79`) | Content-addressed extraction; 40-hex enforced by `validateTreeSha` (`store-paths.ts:93-97`) |
| `skills/<package>/<version>/` + `current` | `resolveStoreSkillPackageVersionRoot` / `resolveStoreSkillPackageCurrentLink` (`store-paths.ts:115-132`) | npm-backed skill bundles; `current` symlinks active version |
| `mcp-servers/<id>.json` | `resolveStoreMcpServerFile` (`store-paths.ts:134-144`) | One JSON per user-registered MCP server |
| `catalogs/<slug>/` | `resolveCatalogPath` (`store-paths.ts:81-87`) | Shallow clones of Git-backed card catalogs (`slugifyUrl`, `store-paths.ts:99-105`) |
| `catalogs.json` | `resolveCatalogsIndexPath` (`store-paths.ts:89-91`) | Registered catalogs index |
| `generated/` | `resolveStoreGeneratedDir` (`store-paths.ts:146-148`) | Drwn-generated files for downstream tools (Cursor MCP) |
| `generated/hooks/<runtime>/` | `resolveGeneratedHooksDir` (`store-paths.ts`) | Generated hook composer shims for Claude Code, Codex, and Mastra |
| `global-write-record.json` | `resolveGlobalWriteRecordPath` (`store-paths.ts:150-152`) | Machine-scope write record |
| `url-card-map.json` | `resolveUrlCardMapPath` (`url-card-map.ts:21-23`) | Persistent URL→card-name cache |
| `credentials.json` | `resolveCredentialsPath` (`paths.ts:29-31`) | Analyzer auth credentials written atomically with mode `0600` (`auth/credentials.ts`) |

**Path safety.** `assertSafePathPart` (`store-paths.ts:35-39`) rejects `..`, backslashes, leading `/` or `.`. `splitCardName` (`store-paths.ts:41-53`) parses `@scope/name` vs unscoped, validating both segments. `validateTreeSha` is module-private and only reachable via `resolveExtractedPath`.

**Bare-repo vs extracted.** `cards/<name>.git/` is a Git **bare** repository (created by `git.initBare` in `store-migrate.ts:71-72`). `extracted/<tree-sha>/` is materialized tree content. Tree SHA is the dedup key — two commits with identical trees share extraction.

**npm-backed skill bundle shape.** `~/.agents/drwn/skills/<package>/<version>/` plus `~/.agents/drwn/skills/<package>/current → <version>`. Scoped packages split into path segments (`store-paths.ts:121-128`), so `@scope/pkg` becomes `skills/@scope/pkg/<version>/`. A legacy resolver at `paths.ts:83-97` (`resolveSkillPackage*`) still computes `~/.agents/packages/skills/...` and is one of the roots migrated by `migration.ts:114-117`.

### 1.4 Per-project state

Project state lives at `<project>/.agents/drwn/`. `findProjectConfig` (`project.ts:20-35`) walks upward looking for `.agents/drwn/config.json`; returns `null` at the FS root. `resolveProjectRootFromConfigPath` strips three `dirname` calls (`project.ts:37-39`).

| File | Resolver | Content |
|---|---|---|
| `config.json` | `project-writes.ts:8-10` | `ProjectConfig` v1 (`types.ts:95-105`); schema gated at `project.ts:43-46` |
| `card.lock` | `card-lock.ts:38-40` | `CardLockfile` v2 (`card-lock.ts:32-36`); validated by `validateCardLockfile` (`card-lock.ts:57-64`) |
| `write-record.json` | `write-record.ts:19-21` | `WriteRecord` v1 (`write-record.ts:7-17`); fsync-safe save (`write-record.ts:38-55`) |

Project config writes go through `readProjectConfigForWrite` / `writeProjectConfigForWrite` (`project-writes.ts:12-25`), which return a `version: 1` skeleton when no file exists.

### 1.5 Concurrency, atomicity, errors, output

**`cli/core/concurrency.ts`** provides only two functions:

- `resolveFetchConcurrency()` (`concurrency.ts:11-17`) — reads `DRWN_FETCH_CONCURRENCY`, default 4, clamped ≥1.
- `pMap<T,R>(items, concurrency, fn)` (`concurrency.ts:31-60`) — bounded-concurrency `Promise.all` that preserves input order; collects errors across all in-flight work and rethrows the first after every worker drains.

No file locks, mutexes, or queues. Concurrency control is per-invocation only.

**Atomicity primitives** in `cli/core/fs.ts`:

- `writeAtomically(targetPath, content)` (`fs.ts:31-45`) — `mkdir(dirname, recursive)`, write to `${target}.tmp.${randomHex8}`, `rename` to final. On failure removes the temp best-effort and rethrows the original error.
- `lstatSafe`, `realpathSafe` (`fs.ts:9-23`) — exception-swallowing wrappers used by sync and doctor.
- `ensureParentDir(path, dryRun)` (`fs.ts:25-29`) — dry-run-aware mkdir.

The write-record path uses a stronger discipline: explicit `fsync` on the file fd and parent-dir fd before `rename` (`write-record.ts:38-55`). It is the only fsync-the-parent-directory site in the codebase.

The migration pipeline layers atomicity by building a `drwn.staging-<ts>/` tree, validating it, archiving the prior layout to `drwn.archive-<ts>/`, then `renameSync(staging, resolveStoreRoot(...))` to activate (`migration.ts:99-146`).

**Typed errors.** `DrwnError` (`errors.ts:4-23`) carries `code`, optional `hints`, optional `cause`, and a `toJSON()` for `--json`. The only built-in code is `"STORE_READONLY"` (`store-paths.ts:18-20`); feature modules produce their own codes ad-hoc (e.g. `CARD_NOT_FOUND`, `CARD_NO_MATCHING_VERSION`, `CARD_NAME_COLLISION`, `CARD_NAME_MISMATCH`, `INTEGRITY_MISMATCH`, `CARD_NPM_NOT_IMPLEMENTED` — see §3.3).

**Output rendering** in `cli/core/output.ts`:

- `renderJson(value)` (`output.ts:4-6`) — canonical 2-space JSON + `\n`.
- `renderTable(headers, rows)` (`output.ts:8-15`).
- `renderSyncResult({changes, warnings})` (`output.ts:17-31`) — text for `apply`/`write`.
- `renderDoctorReport(report)` (`output.ts:33-57`) — text for `doctor`.

Commands branch on `this.json` and pick one. No global JSON envelope; each command picks its own shape.

**Interactivity.** `cli/core/interactivity.ts` is a TTY-aware mode resolver. `resolveInitMode` (`interactivity.ts:7-33`) returns `"guided" | "minimal" | "error"` based on flags + TTY state. `resolveInstallDecisionMode` (`interactivity.ts:35-54`) does the same for MarkItDown setup. There is no `DRWN_NO_PROMPT` env var; non-interactive behavior is driven by explicit flags or absent TTY.

---

## 2. Configuration & merge model

### 2.1 The five configuration sources

drwn composes effective behavior from up to five distinct surfaces:

| # | Surface | On-disk | Loader | Mutators |
|---|---|---|---|---|
| 1 | Packaged config | `<repoRoot>/registry/config.json` | `loadConfig` (`config.ts:8-10`) | `saveConfig` (developer only) |
| 2 | Packaged MCP registry | `<repoRoot>/registry/mcp-servers.json` | `loadRegistry` (`registry.ts:8-10`) | `saveRegistry` |
| 3 | User MCP library | `~/.agents/library/mcp-servers.json` (legacy) or `~/.agents/drwn/mcp-servers/<id>.json` (store layout) | `loadMcpLibrary` (`mcp-library.ts:48-72`) | `saveMcpLibrary` (`mcp-library.ts:74-98`) |
| 4 | Machine config | `~/.agents/drwn/config.json` (legacy) or `~/.agents/drwn/machine.json` (store layout) | `loadUserConfig` / `loadEffectiveConfig` (`user-config.ts:23-29,65-75`); `readMachineConfig` (`card-store.ts:109-112`) | `saveUserConfig` (`user-config.ts:31-34`); `writeMachineConfig` (`card-store.ts:114-118`) |
| 5 | Per-project config | `<projectRoot>/.agents/drwn/config.json` | `findProjectConfig` + `loadProjectConfig` (`project.ts:20-47`) | `writeProjectConfigForWrite` (`project-writes.ts:20-25`) |

Layer 4's on-disk path is gated on `useStoreLayout` (checks `resolveStoreMetadataPath(agentsDir)` existence, `user-config.ts:17-21`). When cards-era store metadata exists, machine state lives at `machine.json`; otherwise the legacy `config.json` fallback.

**Precedence.** `buildEffectiveState` (`effective-state.ts:44-107`) layers the surfaces:

1. Load packaged config (`repoConfig`, line 46).
2. Merge packaged registry with user MCP library via `mergeUserMcpLibrary` (lines 47-50).
3. `mergeMachineConfig` shallow-overlays `targets`, `optional`, `defaults`, `catalogs`, `parallel`, and `analyzer` (`user-config.ts:77-104`) — produces `machineConfig` (line 51).
4. **Critical inversion:** if a project config is present, `baseConfig = repoConfig`, **not** `machineConfig` (line 54). Machine-only overlays are deliberately discarded inside a configured project — this is the user-facing guarantee at `knowledges/02_per-project-config-guide.md:149-150`.
5. Card manifests resolved from `projectConfig.cards` fold into the project config via `mergeCardManifestsIntoProjectConfig` (`card-project.ts:44-94`).
6. The project overlay (with cards merged in) applies via `mergeProjectConfig` (`project.ts:49-92`).

### 2.2 Machine defaults

`registry/config.json:1-47` is the canonical `CanonicalConfig` baseline. Schema in `types.ts:39-75`:

- `version` (required, currently `1`).
- `targets` — `claude`, `codex`, `cursor`, each `{enabled, configPath, format, mcpKey}` where `format ∈ {json-merge, toml-merge, json-standalone}`.
- `parallel` — `{cli.enabled, mcp.enabled}`.
- `analyzer` — optional analyzer integration config: `apiUrl`, `clientId`, `webBaseUrl`, `maxArchiveBytes` (`types.ts:68-73`).
- `catalogs` — `{npmSkills, mcp}`.
- `optional` — `Record<serverName, boolean>` toggle map.

`loadAnalyzerConfig` (`auth/config.ts`) merges env, effective user/machine config, and packaged config for analyzer settings. No packaged analyzer API default is currently present, so `drwn login` without `DRWN_ANALYZER_URL` or `analyzer.apiUrl` fails with a config-path hint instead of guessing an environment.

The machine layer extends with `MachineConfig` (`types.ts:76-80`), adding `authoring.scope` used by `drwn card new` to persist the user's preferred card scope (`card-store.ts:237-240`).

Machine config is initialized on first read when missing: `ensureStoreInitialized` writes `{version: 1, optional: {}}` to `machine.json` (`card-store.ts:103-106`). `initializeUserConfigFromPackagedDefaults` (`user-config.ts:36-50`) seeds `defaults.skills` from the curated inventory and `defaults.mcpServers` from `resolveDefaultMcpNames` (`defaults.ts:14-30`) — which filters out `platform-provided`, gates `parallel-search`/`parallel-task` on `parallel.mcp.enabled`, and treats `optional: true` servers as opt-in.

Mutators:

| Mutator | Effect | Source |
|---|---|---|
| `drwn library defaults add skill` | append `defaults.skills` via `addDefaultValue` | `commands/library/defaults/add-skill.ts:64`, `defaults.ts:80-86` |
| `drwn library defaults add mcp` | append `defaults.mcpServers` | `commands/library/defaults/add-mcp.ts:59` |
| `drwn library defaults remove skill/mcp` | drop via `removeDefaultValue` | `defaults.ts:88-90` |
| `drwn card new --scope` | persists `authoring.scope` | `card-store.ts:237-240` |

`applyMcpDefaultsToConfig` (`defaults.ts:32-49`) rewrites the legacy `optional` map when `defaults.mcpServers` is explicit, keeping the two representations synchronized. `validateDefaultReferences` (`defaults.ts:61-78`) is the doctor-side dangling-reference check.

### 2.3 Per-project config

`ProjectConfig` (`types.ts:95-105`):

| Key | Type | Line |
|---|---|---|
| `version` | `number` (must be `1`) | 96 |
| `cards` | `string[]` (card refs) | 97 |
| `servers` | `Record<string, ServerOverride>` | 98 |
| `skills.include` | `string[]` | 99-102 |
| `skills.exclude` | `string[]` | 99-102 |
| `extensions` | `Record<string, ProjectExtensionConfig>` | 103 |
| `targets` | `Partial<Record<TargetName, {enabled: boolean}>>` | 104 |

`ServerOverride = {enabled: boolean} | RegistryServer` (`types.ts:82-84`); `isServerToggle` discriminates (`project.ts:16-18`). `ProjectExtensionConfig` has an escape-hatch `[key: string]: unknown` (`types.ts:86-93`) — only `parallel`, `beads`, `markitdown` keys are interpreted by `applyProjectExtensionConfig`.

**Versioning.** `loadProjectConfig` throws on any value other than `1` (`project.ts:43-46`). Same enforcement on user config (`user-config.ts:25-28`) and MCP library (`mcp-library.ts:39-46`). Scaffolding always writes `{version: 1}` (`project.ts:104`).

**Merge rules** (`project.ts:49-92`):

1. Deep-clone `config` and `registry` — neither base is mutated (lines 54-55).
2. Skill overrides accumulate via `mergeProjectSkillOverrides` (`extensions/project-config.ts:63-67`).
3. For each `project.servers` entry: `{enabled}` toggles write `nextConfig.optional[name]`, deleting or restoring `nextRegistry.servers[name]` (lines 58-66); full `RegistryServer` bodies register as new project-local servers (line 69).
4. For each `project.targets`: toggle only applies if the target already exists in `nextConfig.targets` (line 73) — silently ignored otherwise.
5. Extension config flows through `applyProjectExtensionConfig` (`extensions/project-config.ts:18-61`), expanding into concrete skill include/exclude + `parallel.mcp.enabled` writes.

When machine and project disagree, **project wins for fields it touches**, but project's mere existence wipes machine-level overlay for `optional`, `defaults`, `catalogs`, `parallel` (the inversion at step 4 of §2.1).

### 2.4 Registry

`registry.ts` is intentionally thin: `loadRegistry`/`saveRegistry` are bare JSON read/write helpers (`registry.ts:8-14`). The real registry shape is `CanonicalRegistry` (`types.ts:21-24`): `version` + `servers: Record<string, RegistryServer>`. `RegistryServer` (`types.ts:7-19`):

```
{ description, transport: "stdio" | "http" | "sse" | "platform-provided",
  command?, args?, env?, url?, provider?, capabilities?, notes?,
  optional: boolean, startupTimeoutSec? }
```

Packaged `registry/mcp-servers.json:1-62` ships seven servers: `context7`, `chrome-devtools` (stdio, required), `markdownify`, `parallel-search`, `parallel-task`, `notion`, `slack`.

**Schema gap to flag:** `registry/mcp-servers.json` uses an `auth` field on `notion` and `slack` (`mcp-servers.json:45,53-57`) that is not declared in `RegistryServer` (`types.ts:7-19`). It survives because `JSON.parse` is unchecked — invisible to type-aware consumers.

**Transport writers** (`mcp.ts`):

| Target | Writer | Stdio form | URL form |
|---|---|---|---|
| Claude | `mergeClaudeSettingsText` (`mcp.ts:75-97`) via `toJsonServerConfig` (37-50) | `{command, args?, env?}` | `{type: <transport>, url}` |
| Cursor | `renderCursorConfig` (`mcp.ts:67-73`) via `toJsonServerConfig` | same as Claude | same |
| Codex | `mergeCodexTomlText` (`mcp.ts:123-137`) via `toCodexServerConfig` (52-65) | `{command, args?, startup_timeout_sec}` (default 30) | `{url, enabled: true}` |

`buildActiveServers` (`mcp.ts:8-35`) gates registry+config to writers: if `defaults.mcpServers` is explicit it acts as an allowlist (lines 9-16); otherwise filters by `transport !== "platform-provided"`, the parallel toggle, the `optional` flag, and the `optional` boolean map.

`UserMcpLibrary` (`types.ts:26-29`) shares the `servers` shape and unions into the registry via `mergeUserMcpLibrary` (`defaults.ts:51-59`) — user entries with the same key override; otherwise extend. `validateMcpLibraryServer` (`mcp-library.ts:17-37`) enforces transport-specific invariants on read and save.

### 2.5 Library and catalogs

Two unrelated concepts share the word "catalog":

**Library** = machine-local inventory of curated assets. `library.ts:9-69` defines `LibrarySkill` and `LibraryMcpServer`. `LibrarySource ∈ {repo, npm, registry, library}` (`library.ts:9`). The MCP library tracking surface (`mcp-library.ts`) is the authoritative storage for user-registered servers and the only place that branches on store-layout-vs-legacy.

**Catalogs (discovery)** — configured *registries of registries* used for search:

- `catalogs.npmSkills` — npm-backed skill package search via `npm search`; `searchLimit` default 20 (`catalogs.ts:32-72`). Enabled by default (`catalogs.ts:25`).
- `catalogs.mcp` — file/URL-backed MCP catalogs; only `type: "file"` is implemented today; `type: "url"` emits a warning (`catalogs.ts:79-119`). Disabled by default in packaged config (`registry/config.json:37-40`).

**Card catalogs** are something different: `~/.agents/drwn/catalogs.json` + Git clones under `catalogs/<slug>/`, managed by `card-catalog.ts` and surfaced by `library catalog` / `search card`. Independent subsystem despite the shared word.

Summary: **library** = local inventory (what you have); **catalog** = discovery (what you could find); **defaults** = machine-level selection of which library items become active.

### 2.6 Effective state

`buildEffectiveState` (`effective-state.ts:44-107`) is the single function every command consults before reading or writing. It returns `EffectiveState` (`effective-state.ts:27-42`) containing:

- As-written: `repoConfig`, `projectConfig`, `lockedCards`.
- As-active: `effectiveConfig`, `effectiveRegistry`, `activeServers`, `skillSelection`.
- Targets: `scopedOptions` with `writeScope` ∈ `{project, machine}`, `generatedDir`, `recordPath` (lines 84-89, 103).

The separation between as-written and as-active is the load-bearing distinction in the codebase: every command renders one or the other, never re-deriving merges itself.

### 2.7 Managed-field discipline

`managed-fields.ts` enforces drift detection on fields and hook entries drwn writes into user-owned files. The `_drwn` meta block (`managed-fields.ts:6-11`):

```
{ version: 1, managedKeys, fieldHashes, ownedHooks, lastWriteAt }
```

`canonicalJsonHash` (`managed-fields.ts:13-25`) sorts object keys recursively before sha256 so semantically-equivalent edits do not register as drift. `detectManagedFieldDrift` (`managed-fields.ts:27-33`) compares recorded vs recomputed hashes for whole managed fields. `ownedHooks` records Claude hook entries by event and stable entry identity so drwn can update or clean only the hook entries it created while preserving foreign entries under the same `hooks` key.

`mergeClaudeSettingsText` (`mcp.ts`) writes the block into Claude settings. On each MCP write: parse current file → read prior `_drwn` block → abort if any managed MCP field/server has drifted unless `--force` → rewrite the owned MCP projection → persist fresh meta via `buildDrwnMetaBlock`. When hook materialization passes a `hooks` option, the same writer merges desired drwn-owned hook entries into the existing `hooks` object, compares only entries recorded in `ownedHooks`, and removes only previously owned entries that are no longer desired. `lastWriteAt` is preserved when field hashes and hook ownership are unchanged so timestamps reflect actual content changes.

`mergeCodexTomlText` does not use the meta block — it rewrites the entire `mcp_servers` section via `stripTomlSections` (`mcp.ts:99-121`), a coarser discipline without drift detection. Cursor uses `json-standalone` format with a symlink (`registry/config.json:20`), so drwn owns the whole file and the protocol is unnecessary.

The write-record (`write-record.ts:16`) carries a `managed-fields` variant that mirrors the on-disk meta block — the cross-file ledger consulted by `status` and `doctor`.

---

## 3. Card subsystem

The card subsystem is the architectural centerpiece: a Git-backed package manager whose units of distribution wrap skills, MCP definitions, target enablement, and project extensions into immutable semver-versioned bundles.

### 3.1 Lifecycle: source → published → consumed

| State | Location | Mutability | Owner |
|---|---|---|---|
| Source | `~/.agents/drwn/sources/<scope>/<name>/` | mutable working tree | `card new`, `card source *` |
| Published | `~/.agents/drwn/cards/<scope>/<name>.git/` bare repo + `~/.agents/drwn/extracted/<tree-sha>/` | immutable per `v<version>` tag | `card publish` |
| Consumed | `<project>/.agents/drwn/config.json` cards + `card.lock` | versioned reference | `card add/apply/pin/update/remove/detach` |

**Source → Published.** `publishCard` (`card-store.ts:620-672`):

1. Read `card.json` from source dir.
2. Validate every `skills.include` has a `skills/<name>/SKILL.md` (`card-store.ts:626-637`).
3. Cross-check `package.json` if present (`card-store.ts:638-647`).
4. Lazy-init the bare repo (`card-store.ts:650-653`).
5. Refuse duplicate `v<version>` tags (`card-store.ts:654-656`).
6. `writeTreeFromDir(barePath, sourceDir)` → tree SHA.
7. `ensureExtracted(treeSha)` materializes the canonical extraction cache (`card-store.ts:659`).
8. `validatePublishedSkillDirs` on the extracted tree (`card-store.ts:660`).
9. Compute integrity (`card-store.ts:661`).
10. `commitTree` with previous `refs/heads/main` as parent (`card-store.ts:662-668`).
11. `updateRef("refs/heads/main", commit)` (`card-store.ts:669`).
12. `createAnnotatedTag("v<version>", commit, ...)` (`card-store.ts:670`).

**Published → Consumed.** `resolveProjectCards` (`card-project.ts:26-42`) calls `resolveCard` per spec, turns each result into a `CardLockEntry`. `writeProjectCards` (`card-project.ts:96-103`) rewrites `config.cards` then `writeCardLock` (`card-lock.ts:50-55`).

**Consumed → Materialized.** `ensureCardPresentFromLock` (`card-install.ts:11-89`) verifies integrity; if missing, re-clones from `git.url`, re-fetches the locked commit, re-extracts. Materialization reads `entry.path` (always pointing into `extracted/<tree-sha>/`, except for `origin: file`).

### 3.2 Card ref grammar

Every consumer-side reference is parsed by `parseCardRef` (`card-store.ts:136-158`):

| Form | Example | Origin | Code |
|---|---|---|---|
| `file:<path>` | `file:./fixtures/card` | `file` | `card-store.ts:137-139` |
| `git+<url>#<ref>` | `git+https://x/y.git#v1.0.0` | `git` | `card-store.ts:140-142,160-183` |
| `git+<url>@<range>` | `git+ssh://x/y.git@^1.0.0` | `git` | `card-store.ts:140-142,173-180` |
| `github:owner/repo#<ref>` | `github:foo/bar#v1` | `git` (→ `https://github.com/...`) | `card-store.ts:143-145,185-204` |
| `github:owner/repo@<range>` | `github:foo/bar@^1.0.0` | `git` | `card-store.ts:185-204` |
| `gitlab:owner/repo#<ref>` / `@<range>` | `gitlab:foo/bar#main` | `git` (→ `https://gitlab.com/...`) | `card-store.ts:146-148,185-204` |
| `@scope/name@<range>` | `@team/baseline@^1.0.0` | `store` | `card-store.ts:149-153` |
| `@scope/name` (bare) | `@team/baseline` | `store`, range `*` | `card-store.ts:157` |
| `name@<range>` | `baseline@1.0.0` | `store` | `card-store.ts:154-156` |
| `name` (bare) | `baseline` | `store`, range `*` | `card-store.ts:157` |

Subtleties: the parser distinguishes range-marker `@` from host-name `@` by requiring it appear after the last `/` or `:` (`card-store.ts:206-213`, `lastGitRangeMarker`). A `git+` ref with neither `#ref` nor `@range` hard-errors (`card-store.ts:182`). Scope/name patterns are enforced by `isCardScopeName` / `isCardUnscopedName` (`card-manifest.ts:29-35`): `/^@[a-z0-9-]+\/[a-z0-9-]+$/` and `/^[a-z0-9-]+$/`. `normalizeCardName` attaches a scope to unscoped names when machine config specifies one (`card-store.ts:120-134`).

### 3.3 Resolver pipeline

Entry: `resolveCard(agentsDir, ref)` (`card-store.ts:682-709`). Enforces no-legacy-layout, ensures store init, dispatches on `parsed.origin`.

**`file` origin** (`card-store.ts:686-704`): read `card.json`, validate, `validatePublishedSkillDirs`, compute integrity over the directory, return `ResolvedCard` with no `git` field.

**`store` origin** — `resolveFromStore` (`card-store.ts:408-431`):

1. Bare-repo existence check: missing → `CARD_NOT_FOUND` (`card-store.ts:410-412`).
2. `listPublishedVersions` enumerates tags via `git.listTags`, filters to strict `^v\d` (`card-store.ts:393-399,674-680`).
3. `selectVersion` uses `maxSatisfying` for ranges, falls back to exact match (`card-store.ts:401-406`). Invalid range / no match → `CARD_NO_MATCHING_VERSION` (`card-store.ts:417-420`).
4. `git.revParse("refs/tags/v<v>^{commit}")` resolves to commit (`card-store.ts:429`).
5. `resolveRepoVersion` (`card-store.ts:552-578`) reads tree SHA via `git.getCommitTree`, `ensureExtracted` materializes, manifest+integrity recomputed, returns `origin: "store"`.

**`git` origin** — `resolveFromGit` (`card-store.ts:433-480`), three branches:

1. **Existing bare repo by URL** (`card-store.ts:437-443`): `findBareRepoByOriginUrl` scans `cards/` for `drwn.originUrl` match (`card-store.ts:580-591`). On hit, fetch `refs/heads/* + refs/tags/*`, resolve, refresh `url-card-map.json`.
2. **URL→name cache hit** (`card-store.ts:445-451`, `tryResolveFromCachedGitName` at `card-store.ts:482-520`): read cached name from `url-card-map.json`; if the bare repo for that name exists and `drwn.originUrl` matches, fetch + resolve. If missing, clone fresh. `CARD_NAME_MISMATCH` (stale cache) → fall through to discovery.
3. **First-time discovery** (`card-store.ts:453-479`): clone bare to a temp `.tmp-<rand>.git` path, resolve to discover `manifest.name`, check canonical path for collision — existing repo with different `drwn.originUrl` → `CARD_NAME_COLLISION` (`card-store.ts:460-466`). If clean, rename temp into place, stamp `drwn.cardName` and `drwn.originUrl` (`card-store.ts:472-473`), persist URL→name mapping (`card-store.ts:474`).

`resolveGitRepoAtParsedRef` (`card-store.ts:522-550`) does per-repo work: enumerate tag versions, pick via range or explicit `gitRef`, hard-fail with `CARD_NO_MATCHING_VERSION` if neither satisfiable. After extraction, the name is cross-checked against `expectedName`; mismatch raises `CARD_NAME_MISMATCH` (`card-store.ts:546-548`).

**Typed error codes** at resolver chokepoints:

| Code | Site | Trigger |
|---|---|---|
| `CARD_NOT_FOUND` | `card-store.ts:411` | store origin, no bare repo |
| `CARD_NO_MATCHING_VERSION` | `card-store.ts:417,534` | range matches no published tag |
| `CARD_NAME_COLLISION` | `card-store.ts:462-465,494-497` | URL→name collides with bound repo |
| `CARD_NAME_MISMATCH` | `card-store.ts:547,565` | discovered manifest name diverges from cached/expected |

### 3.4 Lockfile schema (v2)

Location: `<project>/.agents/drwn/card.lock` (`card-lock.ts:38-40`). Schema (`card-lock.ts:11-36`):

```
CardOrigin = "store" | "git" | "file" | "npm"

GitLockInfo { url?, ref?, commit (40-hex) }

CardLockEntry {
  name, requested, version, path, integrity (sha256-<hex>),
  manifest: CardManifest, skills: string[], registry: null,
  origin: CardOrigin, git?: GitLockInfo
}

CardLockfile { lockfileVersion: 2, store?: { minDrwnVersion? }, cards: CardLockEntry[] }
```

**Validation** (`card-lock.ts:57-121`):

| Field | Rule | Code |
|---|---|---|
| `lockfileVersion` | literal `2` | `card-lock.ts:58-60` |
| `cards` | array | `card-lock.ts:58-61` |
| `origin` | one of `store \| git \| file \| npm` | `card-lock.ts:70-73` |
| `name`, `requested`, `version`, `path`, `integrity` | non-empty strings | `card-lock.ts:74-78,127-131` |
| `manifest` | passes `assertValidCardManifest` | `card-lock.ts:79` |
| `skills` | `string[]` | `card-lock.ts:80-82` |
| `registry` | literal `null` (reserved Wave 3+) | `card-lock.ts:83-85` |
| `git` | required for `store`/`git`, forbidden for `file`/`npm` | `card-lock.ts:102-110` |
| `git.commit` | `/^[a-f0-9]{40}$/` | `card-lock.ts:113-115` |

`store.minDrwnVersion` is preserved on read but never written by current code; `writeCardLock` emits only `lockfileVersion: 2` + `cards` (`card-lock.ts:50-55`).

**Integrity verification** by `computeCardIntegrity` (`card-store.ts:317-331`): walks version dir, skips `.integrity` and `.git/`, hashes each file content (sha256), builds canonical sorted JSON of `{p, m, h}` (where `m = "x"` if any executable bit else `"-"`), returns `sha256-<sha256(canonical)>`. `ensureCardPresentFromLock` re-runs the hash after extraction; mismatch → `INTEGRITY_MISMATCH` (`card-install.ts:22-26,75-80`). For `file` origins, present-but-different content triggers the same error (`card-install.ts:21-26`).

**Origin semantics in install:** `file` must exist on disk (`card-install.ts:29-34`); `npm` rejected with `CARD_NPM_NOT_IMPLEMENTED` (`card-install.ts:36-38`); `store`/`git` require `git.commit` plus either an existing bare repo or `git.url` (`card-install.ts:40-56`). `--frozen` blocks any clone, fetch, or path-change side effect (`card-install.ts:49-50,64-65,82-84`).

### 3.5 Manifest schema

`CardManifest` (`card-manifest.ts:7-22`) is the authoring + consumer contract:

| Field | Type | Required | Validation | Source |
|---|---|---|---|---|
| `$schema` | string | no | none | `card-manifest.ts:8` |
| `name` | string | yes | scope `@a-z0-9-/a-z0-9-` or unscoped `a-z0-9-` | `card-manifest.ts:56-60,29-35` |
| `version` | string | yes | strict semver | `card-manifest.ts:61-65`, `semver-utils.ts:6-8` |
| `description` | string | no | free text | `card-manifest.ts:11` |
| `license` | string | no | free text | `card-manifest.ts:12` |
| `harness.minVersion` | string | no | strict semver | `card-manifest.ts:66-68` |
| `bundles` | `Record<string, string>` | no | every range satisfies `semver.validRange` | `card-manifest.ts:98-102` |
| `skills.include` | `string[]` | no | array | `card-manifest.ts:88-90` |
| `skills.exclude` | — | **rejected** | "skills.exclude is not allowed in card manifests" | `card-manifest.ts:85-87` |
| `skills.shared` | `string[]` | no | must be array; must be **empty** today (reserved Wave 2 — registry references) | `card-manifest.ts:91-97` |
| `servers` | `Record<string, ServerOverride>` | no | schema-level: none | `card-manifest.ts:16` |
| `extensions` | `Record<string, ProjectExtensionConfig>` | no | schema-level: none | `card-manifest.ts:17` |
| `targets` | `Partial<Record<TargetName, {enabled}>>` | no | keys ∈ `claude \| codex \| cursor` | `card-manifest.ts:103-107` |
| `stability` | `"experimental" \| "stable" \| "production"` | no | enum-checked | `card-manifest.ts:69-74` |
| `lastValidatedWith` | string | no | strict semver | `card-manifest.ts:75-79` |
| `testStatusBadge` | string | no | `http:` or `https:` URL | `card-manifest.ts:80-84,41-48` |

Quality fields (`stability`, `lastValidatedWith`, `testStatusBadge`) surface in `card show` (`commands/card/show.ts:48-50`) and are writable via `card source set` (`commands/card/source/set.ts:45-55`, `card-source.ts:500-555`).

`skills.shared` is the **reserved namespace** for future registry references — non-empty arrays are rejected today (`card-manifest.ts:94-96`).

`assertValidCardManifest` (`card-manifest.ts:111-116`) is the assertion used by `card-store`, `card-lock`, `card-source`, and `url-card-map`.

### 3.6 Git plumbing

`cli/core/git.ts` is the **only** module that runs the `git` binary. It wraps `Bun.spawn` (`git.ts:60-93`) with a per-call timeout (`DRWN_GIT_TIMEOUT_MS`, default 30s, `git.ts:9`) and a stderr-classifying error taxonomy.

**Error taxonomy** (`git.ts:18-26,352-365`):

| Class | Stderr pattern |
|---|---|
| `GitAuthError` | `authentication`, `permission denied`, `access denied`, `could not read username`, `repository not found` |
| `GitNetworkError` | `unable to access`, `could not resolve host`, `failed to connect`, `network is unreachable`, `connection refused` |
| `GitRefNotFoundError` | `unknown revision`, `bad revision`, `not a valid object name`, `ambiguous argument`, `couldn't find remote ref`, `not found` |
| `GitError` | fallback |

**Surface**:

| Function | Site | Purpose |
|---|---|---|
| `runGit` / `runInRepo` | `git.ts:60-97` | spawn `git`, with/without `--git-dir` prefix |
| `initBare` | `git.ts:99-103` | `git init --bare` |
| `cloneBare` | `git.ts:152-161` | `git clone --bare` (optional `--depth`) |
| `fetch` / `push` | `git.ts:163-173` | refspec-driven |
| `revParse` / `catFileType` / `getCommitTree` | `git.ts:105-123` | object plumbing |
| `configGet` / `configSet` | `git.ts:125-137` | drwn-specific keys (`drwn.cardName`, `drwn.originUrl`, `drwn.deprecated.<v>`) |
| `lsRemote` | `git.ts:139-150` | parse remote ref listing |
| `writeTreeFromDir` | `git.ts:206-219` | `add -A` + `write-tree` against a **temp index** (`GIT_INDEX_FILE` env, `git.ts:209`) — bare repo's index never touched |
| `commitTree` | `git.ts:221-243` | identity injected via env (`drwn`/`drwn@example.local`) |
| `updateRef` / `createAnnotatedTag` / `listTags` | `git.ts:245-268` | branch + tag plumbing |
| `extractTreeToDir` | `git.ts:270-297` | `git archive | tar -xf` via temp tar |
| `remoteAdd/Set/Remove/List` | `git.ts:175-204` | parse `remote -v` fetch lines |
| `log` / `diff` / `showBlob` | `git.ts:299-337` | structured log via `\x1f`/`\x1e` separators |
| `moveRepoAtomically` | `git.ts:339-343` | atomic rename of staged bare repos |

**Card-store usage:**

- **Bare-repo init on publish:** `publishCard` lazy-creates, writes `drwn.cardName` (`card-store.ts:650-652`).
- **Publish flow** (`card-store.ts:658-670`): `writeTreeFromDir` → `ensureExtracted` (calls `git.extractTreeToDir`) → `revParseOptional("refs/heads/main")` for parent → `commitTree` → `updateRef` → `createAnnotatedTag`.
- **Fetch flow** (`resolveFromGit`): `git.fetch(barePath, "origin", ["refs/heads/*:refs/heads/*", "refs/tags/*:refs/tags/*"])`. Top-level `card fetch` uses the same refspec (`commands/card/fetch.ts:34`).
- **Push flow** (`commands/card/push.ts:34`): `git.push(barePath, remote, ["refs/heads/main", "--tags"])` — main and tags only; the local `[drwn]` config never travels.
- **Tree extraction** is content-addressed: `ensureExtracted` (`card-store.ts:350-370`) extracts to temp then `rename`s to `extracted/<tree-sha>/`, with race tolerance: if rename fails but the destination exists (concurrent write), it succeeds silently (`card-store.ts:362-368`).
- **Deprecation** is config-only and reversible: `git.configSet(barePath, "drwn.deprecated.<v>", message)` (`card-store.ts:723-729`). Content is never rewritten.

### 3.7 URL→name mapping cache

`cli/core/url-card-map.ts` persists `~/.agents/drwn/url-card-map.json` (`url-card-map.ts:21-23`):

```
UrlCardMapFile { mapVersion: 1, entries: Record<url, { name, url, discoveredAt }> }
```

Populated by every successful `resolveFromGit` branch — existing-bare-repo (`card-store.ts:441`), cache-hit (`:474,501,511`), first-time discovery (`:474`). Read at the start of `resolveFromGit` (`card-store.ts:445-451`) to short-circuit temp-clone discovery.

Treated as an **optimization, not a source of truth**: malformed entries dropped silently (`url-card-map.ts:37-50`); cache-hit explicitly catches `CARD_NAME_MISMATCH` (`card-store.ts:514-519`) and returns `null` to fall through to fresh discovery.

### 3.8 Card-source authoring surface

Eight subcommands under `cli/commands/card/source/*` mutate authoring state owned by `cli/core/card-source.ts`:

| Subcommand | Core function | Mutates | `--dry-run` | `--replace` | `--keep-files` | `--json` |
|---|---|---|---|---|---|---|
| `source list` | `listCardSources` (`card-source.ts:392-403`) | read | n/a | no | no | yes |
| `source show` | `readCardSourceState` (`card-source.ts:321-390`) | read | n/a | no | no | yes |
| `source doctor` | `doctorCardSource` (`card-source.ts:405-410`) | read | n/a | no | no | yes |
| `source add-skill` | `addCardSourceSkill` (`card-source.ts:412-460`) | `card.json` includes + cp `skills/<n>/` | yes | yes | no | yes |
| `source remove-skill` | `removeCardSourceSkill` (`card-source.ts:462-498`) | `card.json` includes + rm `skills/<n>/` | yes | no | yes | yes |
| `source add-mcp` | `addCardSourceMcp` (`card-source.ts:557-601`) | `card.json` servers + write `mcp-servers/<id>.json` | yes | yes | no | yes |
| `source remove-mcp` | `removeCardSourceMcp` (`card-source.ts:603-635`) | `card.json` servers + rm `mcp-servers/<id>.json` | yes | no | yes | yes |
| `source set` | `patchCardSourceManifest` (`card-source.ts:500-555`) | `card.json` field patches | yes | no | no | yes |

**`source set` accepts** (`commands/card/source/set.ts:45-55`): `--description`, `--version`, `--license`, `--harness-min-version`, `--stability`, `--last-validated-with`, `--test-status-badge`. (Doc 01 currently lists only a subset — see audit doc 54.)

**Dry-run discipline.** Every mutation helper accepts `dryRun?: boolean`; when true, it computes the change list (so `--json` output matches a real run) but skips `assertStoreWritable()` and the filesystem write. Read-only helpers do not accept dry-run — they never write.

**Read-only enforcement.** Every write helper calls `assertStoreWritable()` (`store-paths.ts:17-21`) inside the `if (!dryRun)` branch. Same gate at `card-store.ts:229` (`createCardSource`), `:355` (`ensureExtracted`), `:621` (`publishCard`), `:724` (`deprecateCardVersion`), `card-catalog.ts:121,153,172`.

**Diagnostics.** `readCardSourceState` produces a structured listing: `orphaned_skill_dir`, `missing_skill_dir`, `missing_skill_md`, `package_name_mismatch`, `package_version_mismatch`, invalid MCP JSON, `mcp_manifest_divergence` (via canonical JSON comparison, `card-source.ts:121-132,307-310`).

**Capture flow.** `card new --from-project` (`commands/card/new.ts:44-73`) dispatches to `captureProjectAsCard` (`card-capture.ts:38-95`): runs `buildEffectiveState`, creates a fresh source via `createCardSource`, copies every selected (include minus exclude) skill into `skills/<name>/` via the layered skill resolver (`card-capture.ts:55-67`), writes a captured `card.json` with `version` hardcoded to `"0.1.0"` (`card-capture.ts:74`). On failure, cleans up the partial source (`card-capture.ts:91-94`).

### 3.9 Card-as-consumer surface

| Command | Purpose | Dispatch |
|---|---|---|
| `card add <spec>` (alias `add`) | append one spec, rewrite lock; reject duplicates by name | `addProjectCardSpec` (`card-project.ts:115-123`) |
| `card apply <specs...>` (alias `apply`) | replace `config.cards` wholesale; rewrite lock | `applyProjectCardSpecs` → `writeProjectCards` (`card-project.ts:111-113,96-103`) |
| `card pin <spec>` | upsert one spec by name; rewrite lock | `pinProjectCardSpec` (`card-project.ts:125-133`) |
| `card update` (alias `update`) | re-resolve every card entry; rewrite lock | `updateProjectCardLock` (`card-project.ts:149-151`) |
| `card outdated [--check] [--fetch] [--json]` | diff lock versions against highest local; optional pre-fetch | `findOutdatedProjectCards` (`card-project.ts:168-178`); parallel `git.fetch` with `pMap` (`commands/card/outdated.ts:42-54`) |
| `card remove <name>` | drop one card; rewrite lock | `removeProjectCard` (`card-project.ts:135-143`) |
| `card detach` | clear `config.cards = []`; preserve overlay | `detachProjectCards` (`card-project.ts:145-147`) |
| `card clone <git-ref>` | resolve & cache a `git+`/`github:`/`gitlab:` ref locally | `resolveCard` (`commands/card/clone.ts:28-41`) |
| `card publish <name>` | publish source to bare repo + tag | `publishCard` (`commands/card/publish.ts:24-33`) |
| `card catalog publish <ref> --catalog <scope\|url\|path> --mode <local\|direct>` | upsert one catalog entry; local mode writes only, direct mode commits and pushes catalog JSON | `publishCardToCatalog` (`card-catalog-publish.ts`) |
| `card push <name> [--remote]` | push `refs/heads/main` + `--tags` | `git.push` (`commands/card/push.ts:29-35`) |
| `card fetch <name> [--remote]` | fetch heads + tags | `git.fetch` (`commands/card/fetch.ts:29-35`) |
| `card validate <ref>` | resolve + integrity-check; typed error codes in JSON | `resolveCard` (`commands/card/validate.ts:32-47`) |
| `card diff <a> <b>` | structural manifest classification + raw `git diff` | `diffCards` + `git.diff` (`commands/card/diff.ts:33-49`) |
| `card list` | enumerate `cards/` bare repos with versions | `listCards` (`card-store.ts:711-721`) |

### 3.10 Card hooks

Card hooks add a third card artifact class beside skills and MCP server definitions. The target architecture is analysis 60 (`.ai/analyses/60_drwn-card-hooks-target-architecture.md`). Authors declare policy modules in `card.json` as `hooks.include: string[]`; each policy lives at `hooks/<policy>/policy.ts` and imports the public `darwinian-mind/hook-policy` subpath.

The source commands `card source add-hook` and `card source remove-hook` mutate both `card.json` and the `hooks/<policy>/` directory. `card source doctor` checks missing hook directories, missing `policy.ts`, orphaned hook directories, and best-effort TypeScript build failures.

Publishing validates every declared hook path in the source tree and again in the extracted tree. Lockfiles are schema v3: each `CardLockEntry` carries `hooks: string[]` and optional `hookConsent`. Older v2 lockfiles read as `hooks: []`; writes emit v3.

Hook materialization is consent-gated. `card trust <card> --hooks [--range <range>]` records `{consentedAt, consentedRange}` in `card.lock`; `card untrust <card> --hooks` clears it. `drwn write` skips unconsented or out-of-range hook policies with warnings, while `--strict-hooks` turns those warnings into a hard failure.

`syncHooks` materializes one composer per enabled hook runtime:

| Runtime | Generated path | Downstream wiring |
|---|---|---|
| Claude Code | `generated/hooks/claude/composer.mjs` | `.claude/settings.json` `hooks.PreToolUse` and `hooks.PostToolUse` |
| Codex | `generated/hooks/codex/composer.mjs` | `.codex/hooks.json` as drwn-owned managed content |
| Mastra | `generated/hooks/mastra/composer.ts` | imported by the consumer's Mastra bundle |

Runtime selection is hook-specific, not a new `TargetName`: `claude-code` follows `targets.claude.enabled`, `codex` follows `targets.codex.enabled`, and `mastra` is disabled unless `project.hooks.runtimes.mastra.enabled === true`. Project `hooks.exclude` entries skip policies by bare policy name or `@scope/card:policy-name`.

Codex has an independent native trust flow. drwn consent permits materialization, but Codex may still require `/hooks` review before project-local command hooks execute.

### 3.11 Session-signal hooks

Beside card *policy* hooks, drwn ships first-party *session-signal* hooks — hidden `drwn hook card-usage` and `drwn hook skill-marker --phase {pre|post|expansion}` subcommands that Claude Code invokes as command hooks and that append observational records (active cards, skill invocations, slash expansions) to a `<session-id>.drwn-signals.jsonl` sidecar next to the transcript. They are observational (always exit 0, no decision), first-party (no consent gate, unlike card policy hooks), and read the nearest `card.lock` directly via a permissive hot-path reader. Design: analyses 73 and 41 (Task 55).

`drwn write` materializes these into `.claude/settings.json` only when `project.hooks.signals.enabled === true` (opt-in, default-off). `syncHooks` builds the registrations with `signalHooksConfig` (`hook-generator/sync-signals.ts`) — `UserPromptSubmit`→`card-usage`, `UserPromptExpansion`→`skill-marker --phase expansion`, and `Skill`-matched `PreToolUse`/`PostToolUse`→`--phase pre|post` (the `fail`/`PostToolUseFailure` phase is deferred until a real Skill-failure payload is validated) — and composes them with the card composer config via `mergeClaudeHookConfigs` for a single `mergeClaudeSettingsText` write. The `_drwn.ownedHooks` per-entry side table lets signal entries and the card composer's `.*` entries coexist under the same events, and preserves any user-authored hook entries. The materialized command is `process.execPath run <abs cli/index.ts>` (`resolveDrwnHookCommand`), resolving the running interpreter + entrypoint rather than assuming a global `drwn` on PATH. Codex signal hooks are out of scope. The session-discovery walker excludes `*.drwn-signals.jsonl` sidecars so they are never archived as Claude transcripts.

| `card show <ref>` | resolved card + `git.log --max-count=10`; surfaces quality fields | `resolveCard` + `git.log` (`commands/card/show.ts:33-58`) |
| `card status [--explain]` | project specs + locked versions + outdated table | `readProjectCardStatus` (`card-project.ts:153-161`); `explainStatus` (`diagnostics.ts`) |
| `card deprecate <ref> [--message]` | set `drwn.deprecated.<v>` config | `deprecateCardVersion` (`card-store.ts:723-729`) |
| `card remote add/set/remove/list` | manage bare repo `[remote "<n>"]` + `drwn.originUrl` | `commands/card/remote.ts:27-129` |

`card catalog publish` is producer-side catalog authoring. It resolves the card
ref, validates the installable Git URL in an isolated temp store, validates the
target `catalog.json`, refuses duplicate entries unless `--replace`, and sorts
entries by name for stable diffs. `--mode direct` accepts a registered catalog
scope, Git URL, or clean local checkout; it commits `catalog.json`, pushes the
current branch to `origin`, and best-effort refreshes a registered catalog cache.

Every mutating consumer command supports `--write` to chain into `syncRepository` via `runChainedWrite` (`project-command.ts:28-42`). Errors from the chained write go to stderr; the lock mutation has already succeeded.

### 3.10 Card-skill resolver

`cli/core/card-skill-resolver.ts` is the single authority that turns a skill name into a filesystem path with provenance. Used by `syncSkills`, `card-capture`, and diagnostics.

Resolution order is **fixed** (`card-skill-resolver.ts:26-64`):

1. **Locked card** (`:32-49`): scan `lockedCards` for any entry whose `skills` array includes the name. On match, return `{layer: "card", cardName, cardVersion, path: join(card.path, "skills", name)}`. If the path doesn't exist on disk, return `{layer: "missing", reason: "card store is corrupt for <name>@<v>... Re-run \`drwn card update\`"}` — a corrupt store does **not** silently fall through to user defaults.
2. **User default** (`:51-58`): `findAvailableSkill(repoRoot, agentsDir, name)` hunts repo-native then npm packages. Returns `{layer: "user-default", path, scope}`.
3. **Missing** (`:60-63`): explicit error path with actionable message.

**Invariant: cards win over user-defaults, always.** A card that declares a skill in `skills.include` shadows any user-default skill of the same name. There is no "merge" semantic; the returned path is single-source.

---

## 4. Skills, bundles, extensions, library

### 4.1 Skill resolution layers

Lookup-style commands use `findAvailableSkill` (`skills.ts:156-158`); write-time materialization uses `resolveSkillSource` (`card-skill-resolver.ts:26-64`, see §3.10).

**Effective resolution order at write-time:**

1. Any locked card that lists the skill in its manifest (`card-skill-resolver.ts:32-49`).
2. Repo-native: `shared` → `claude-only` → `codex-only` → `experimental` (`skills.ts:131-134`).
3. The first npm bundle whose `bundle.json` declares the skill (`skills.ts:141-154`).

There is **no scope-based promotion across layers** — repo `shared` and a bundle's `shared` skill are both legal sources; first found wins. Card layer always beats both at write-time; at lookup-time `findAvailableSkill` is card-blind.

**Curated publication layer.** Independently of resolution, `<agentsDir>/skills/<name>` is a symlink farm. `syncSkills` walks it and treats every entry as a desired claude/codex target (`skills.ts:316-345`). Carries `layerLabel: "user-default"`.

**Dedupe semantics.** When two layers offer the same name, `recordIntent` keeps the most recent intent and records the previously-seen `layerLabel` in `alsoAvailable` (`skills.ts:87-101`). Cards are written after curated entries inside `syncSkills` (`:316-415`), so a card source wins but the curated layer is announced as `also available`. The change log reads `← card foo@1.0.0 (also available: user-default)` (`skills.ts:417-423`).

**Project-local layer.** No per-project `skills/` directory feeds resolution. Projects influence skills only through `project.skills.include`/`exclude` and `project.cards[]`, both folded into `skillSelection.include` inside `buildEffectiveState` (`effective-state.ts:57-81`).

**Write-time hard-fail on unresolved `skills.include`.** `syncSkills` resolves every requested include up front; any `layer: "missing"` throws before touching the FS (`skills.ts:298-309`):

```
drwn write cannot resolve all skills:
  - <name>: <reason>
  - ...
```

Two reason templates: card-store corruption (`card-skill-resolver.ts:38-42`) and no provider at all (`:60-63`).

### 4.2 Skill source data model

A repo skill is a directory under `<repoRoot>/skills/<scope>/<name>/` (`paths.ts:74-81`). Runtime types:

```
RepoSkill { name, scope: "shared"|"claude-only"|"codex-only"|"experimental", path }
SkillInventoryItem extends RepoSkill { curated, claudeLinked, codexLinked, sourceType?, sourceId?, sourceVersion? }
```

`buildSkillInventory` merges repo + bundle inventories, computes link status against `resolveToolPaths(homeDir)` (`skills.ts:182-233`), and treats `shared` skills as linked via the curated path and `claude-only`/`codex-only` skills as linked directly to the repo path (`:189-205`).

**Curation as symlink mutation.** `curateSkill` validates the name, refuses non-`shared`, removes any existing entry, then symlinks `<agentsDir>/skills/<name>` to the source path (`skills.ts:235-254`). `uncurateSkill` removes the link, refusing if absent (`:256-266`). No JSON state file backs the curated layer — membership is exactly the directory entries in `<agentsDir>/skills/` (`skills.ts:160-175`).

**Name validation.** `validateSkillName` rejects path separators, `.`, and `..` (`skills.ts:44-48`). Duplicated inside `validateBundleManifest` (`skill-packages.ts:85-87`) so a bundle cannot register a name that would escape the curated path.

### 4.3 Skill packages (npm-backed bundles)

`BundleManifest` (`types.ts:115-122`):

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | number | Must equal `1` (`skill-packages.ts:71-73`) |
| `bundleName` | string | Must equal npm package name (`skill-packages.ts:74-76`) |
| `version` | string | Must equal npm version (`skill-packages.ts:77-79`) |
| `displayName?` | string | Optional metadata |
| `description?` | string | Optional metadata |
| `skills[]` | `BundleSkillEntry[]` | Each `{name, scope, path}` (`types.ts:109-113`) |

Each entry's `path` must (a) resolve inside the bundle root (`skill-packages.ts:92-95`), (b) exist (`:96-98`), (c) contain `SKILL.md` (`:99-101`). Names collide-check against the inventory snapshot passed in by the caller (`:88-90`).

**Ingestion pipeline** (`ingestSkillPackage`, `skill-packages.ts:159-222`):

1. `mkdtemp` two scratch dirs (`tmpdir()`).
2. `npm pack <spec> --ignore-scripts --json --pack-destination <packDir>` via `Bun.spawn` (`:168-176`).
3. Parse `npm pack` JSON; take first entry's `{name, version, filename}` (`:178-183`).
4. `tar -xf <packDir>/<filename> -C <extractDir>` (`:184-194`).
5. Validate `<extractDir>/package/bundle.json` via `validateBundleManifest` (`:196-198`).
6. Atomic install: `mkdir -p packageRoot` → remove stale `versionRoot` → `rename(extractDir/package, versionRoot)` → repoint `current` symlink (`:200-209`).
7. `finally` cleans both scratch dirs.

**Store paths.** Default: `<agentsDir>/packages/skills/<package>/<version>/` + `current` symlink (`paths.ts:83-97`). When store layout marker exists (`useStoreSkillLayout`, `skill-packages.ts:31-33`), routes through `store-paths.ts` equivalents (`skill-packages.ts:35-57`). Both shapes follow `<pkg>/<version>/` + `current → <version>`.

**Discovery.** `listInstalledSkillBundles` recursively walks the packages root; at each dir checks for a `current` symlink and reads its manifest (`skill-packages.ts:113-138`). Scoped packages handled by recursion + `relative()` (`:119-120`).

**`drwn skills packages add`** (`commands/skills/packages/add.ts:36-50`): snapshot inventory, call `ingestSkillPackage`, print `name@version` or full JSON. Does not curate, does not write project, does not touch any project. The user must then `drwn skills curate`, `drwn add skill`, or `drwn library defaults add skill`.

**Plug-back into resolver.** Three paths: `buildSkillInventory` merges bundles in (`skills.ts:208-232`); `findPackageSkill` is the fallback inside `findAvailableSkill` (`skills.ts:141-158`); `syncSkills` materializes via `versionRoot/path` after `resolveSkillSource` returns `layer: "user-default"` (`skills.ts:387-415`).

### 4.4 Extensions registry

Three extensions are hard-coded in `cli/core/extensions/registry.ts:6-94`:

| ID | Display | Scopes | Default modes | Required CLIs | Skills (default-included) | MCP |
|---|---|---|---|---|---|---|
| `beads` | Beads | project | cli, skills, hooks | `bd` (req), `beads-mcp` (opt) | `beads-task-tracking` (not default) | `beads` (project, off) |
| `parallel` | Parallel | global, project | cli, skills | `parallel-cli` (req) | `parallel-web-search`, `parallel-web-extract`, `parallel-deep-research`, `parallel-data-enrichment` | `parallel-search`, `parallel-task` (global, off) |
| `markitdown` | MarkItDown | global, project | cli, skills | `markitdown` (req), `uv` (opt) | `markitdown-document-conversion` | none |

`ExtensionDefinition` source type at `types.ts:27-37`. `listExtensions` returns a defensive copy (`registry.ts:96-98`); `getExtension(id)` looks up by id (`:100-102`).

**Per-extension files** (`cli/core/extensions/`):

- `beads.ts` — plans `bd init` + per-target `bd setup --check` + `bd setup` invocations (`beads.ts:43-76`); sequential execution with first-failure short-circuit (`:78-88`); `ensureProjectSkillInclude` adds `beads-task-tracking` to `project.skills.include` (`:90-105`).
- `parallel.ts` — config-only: `buildParallelProjectConfig({skills, mcp})` writes `{enabled: true, skills, mcp}` (`parallel.ts:12-35`). No external commands.
- `markitdown.ts` — plans a single `uv tool install --python 3.12 markitdown[all]`, conditioned on `installApproved && uvAvailable` (`markitdown.ts:25-49`). When `uv` is missing, emits an instructional warning rather than throwing.
- `commands.ts` — `findCommand` PATH-walks via `access(X_OK)` (`commands.ts:16-28`); `runExternalCommand` spawns and captures stdout/stderr/exit (`:30-48`).
- `project-config.ts` — translates per-extension project settings into skill include/exclude + canonical config side effects (`project-config.ts:18-61`).

### 4.5 Project opt-in/out

`ProjectExtensionConfig` is free-form under `project.extensions[<id>]` (`types.ts:86-93`): `{enabled?, skills?, mcp?, targets?, includeSkill?, [k]: unknown}`.

Application semantics (`extensions/project-config.ts:18-61`):

- **Parallel:** `enabled: false` clears both CLI and MCP flags and excludes every Parallel skill. Otherwise enables CLI, mirrors `mcp === true` into `config.parallel.mcp.enabled`, routes `skills` into include/exclude.
- **Beads:** `enabled: false` excludes `beads-task-tracking`; `includeSkill === true` adds it; otherwise no skill-set effect.
- **MarkItDown:** `enabled: false` excludes every MarkItDown skill; otherwise routes `skills`.

`mergeProjectConfig` invokes this after merging server + target overrides (`project.ts:78-84`).

### 4.6 Extensions doctor and status

**`buildExtensionStatus`** (`extensions/status.ts:23-102`) returns per-extension:

- Each declared command resolved via `findCommand` with `{required, available, path, installHints}`.
- Each declared skill against repo skills + curated set: `{name, present, curated}`.
- Each declared MCP server against the merged registry + `buildActiveServers` output: `{name, configured, active}`.
- `available: true` iff every required command is found.
- `scope: extensionScope(definition)` ∈ `global` / `project` / `mixed`.
- When a project config is present: `project: {cwd, configPath, extensionConfigured, extensionEnabled}` and `beadsDirExists` for Beads.
- `warnings` for missing required commands and missing skills.

`buildAllExtensionStatuses` (`status.ts:104-116`) parallel-fans `listExtensions()`.

**`buildExtensionDoctorReport`** (`extensions/doctor.ts:14-138`) layers on top:

1. Re-derive effective config + registry with the project overlay (`doctor.ts:29-45`).
2. Report unknown extension references in `project.extensions` (`:40-44`).
3. Promote every missing required command from `warnings` to `issues` (`:47-51`).
4. Promote every missing required extension skill to `issues` (`:53-57`).
5. For `beads`: require `.beads/` exists; when `bd` is on PATH, run `bd doctor --json` and validate the JSON (`:59-85`).
6. For `parallel`: if `parallel.mcp.enabled`, require each declared MCP server in the effective registry; flag any `active`-but-unconfigured (`:87-100`).
7. For `markitdown`: if missing, issue install hints; if present, run `markitdown --version` and a stdin smoke conversion (`:102-130`).

Report shape: `{id, displayName, issues[], warnings[]}` (`types.ts:71-76`).

**Command surface** (`commands/extensions/*`):

- `extensions list` — registry dump.
- `extensions show <id>` — single-definition dump.
- `extensions status [id]` — wraps `buildExtensionStatus` / `buildAllExtensionStatuses`.
- `extensions doctor [id]` — wraps `buildExtensionDoctorReport`, fanning over all when no id.
- `extensions add <id>` — writes semantic project config; suggests matching `setup` in `next:`.
- `extensions setup <id>` — runs external commands. Beads validates `bd` then plans+executes; Parallel writes project config only; MarkItDown resolves install decision (`--install`/`--no-install`/TTY prompt), conditionally installs via `uv`, writes project config, refreshes PATH check.

### 4.7 Library and library defaults

**Library** = local inventory (repo skills + npm packages + built-in MCP registry + user library) exposed via `cli/core/library.ts:30-69`. **Defaults** = the subset promoted into `userConfig.defaults.{skills, mcpServers, extensions}`.

**Inventory shape:**

```
LibrarySkill { id, kind: "skill", name, scope, source: "repo"|"npm"|"registry"|"library", sourceId?, sourceVersion?, path, curated }
LibraryMcpServer { id, kind: "mcp", source: "registry"|"library", server: RegistryServer }
```

Built-ins always shadow library entries with the same id (`library.ts:59-63`).

**Read commands:**

| Command | What it lists | Source |
|---|---|---|
| `library list [kind]` | repo + npm skills, built-in + library MCP servers; filter `skills`/`mcp`/`tools` | `library/list.ts:36-67` |
| `library show <id>` | one skill or one MCP by id; rejects collisions | `library/show.ts:32-71` |
| `library catalog list/add/remove/refresh` | Git-backed card catalogs (separate concern) | `library/catalog.ts:14-148` |

**Write commands:**

| Command | Effect | Source |
|---|---|---|
| `library add mcp <file>` | merges into `<agentsDir>/library/mcp-servers.json`; rejects built-in collisions; `--replace` to overwrite | `library/add/mcp.ts:77-126` |
| `library add skill <pkg>` | calls `ingestSkillPackage` — equivalent to `skills packages add` | `library/add/skill.ts:36-63` |

**Defaults commands:**

| Command | Effect |
|---|---|
| `library defaults list` | reads `userConfig.defaults` + merged registry; `{skills, mcpServers, extensions}` with `status: "resolved" \| "missing"` |
| `library defaults add mcp <id>` | validates id via `findLibraryMcpServer`; appends `defaults.mcpServers`; idempotent |
| `library defaults add skill <id>` | refuses non-`shared`; appends `defaults.skills` AND `curateSkill` as a side effect (skipped under `--dry-run`) |
| `library defaults remove mcp <id>` | drops `defaults.mcpServers`; leaves definition intact |
| `library defaults remove skill <id>` | drops `defaults.skills` AND uncurates if link exists |

**How defaults feed effective-state.** `buildEffectiveState` loads machine config (`effective-state.ts:51`), then bootstraps `skillSelection.include` from `baseConfig.defaults?.skills` (`:57-59`). When a project overlay is present, project `skills.include` is appended (`:74-80`). Default MCP servers feed `resolveDefaultMcpNames` (`defaults.ts:14-30`). `drwn write` consumes via `syncSkills(scopedOptions, state.skillSelection, state.lockedCards)` (`sync.ts:195`).

### 4.8 MCP commands

`drwn mcp list` (`commands/mcp/list.ts:39-82`) merges built-in registry with user MCP library (`mergeUserMcpLibrary`), then with project overlay if in scope. Reports `{name, transport, active, targets}` against `buildActiveServers`. Active state is project-aware when `context.projectConfigPath` is set.

`drwn mcp write` is a thin alias for `drwn write --mcp-only` — calls the same `syncRepository` entry with `mcpOnly: true` (`commands/mcp/write.ts:45-54`).

`drwn add mcp <name|query>` (`commands/add/mcp.ts:55-133`) activates a server in the current project only:

1. If no positional, prompts in a TTY.
2. Looks up via `findLibraryMcpServer` (built-in ∪ user library).
3. If missing and `--yes`, performs a catalog search and accepts only an unambiguous single match.
4. If already an active global default, skips and reports `action: "already-active"`.
5. Otherwise writes a project override: `setProjectServerOverride(cwd, id, server ? {enabled: true} : fullDefinition)` — library-known servers get the cheap toggle; catalog-pulled servers get their full definition inlined.

`drwn add skill <name|query>` (`commands/add/skill.ts:68-157`) activates a skill in the current project:

1. Look up via `findLibrarySkill`.
2. If missing and `--yes`: `searchSkills`, require an unambiguous single bundle, `ingestSkillPackage`, then either use an exact name match, the bundle's only skill, or with `--all` every skill in the bundle.
3. Write each chosen id into `project.skills.include` via `includeProjectSkill`.

---

## 5. Write pipeline, diagnostics, search, store

### 5.1 Materialization pipeline (`drwn write`)

`commands/write.ts:9-83` is a Clipanion wrapper. Flags (`commands/write.ts:30-53`): `--dry-run`, `--json`, `--mcp-only`, `--skills-only`, `--target`, `--force`. Mutual-exclusion of `--mcp-only`+`--skills-only` (`:55-57`); `--target` validated against `{claude, codex, cursor}` (`:58-60`).

**`syncRepository`** (`cli/core/sync.ts:182-215`) — the engine:

1. `buildEffectiveState(options)` — resolves project root, loads project + card-merged config, computes `effectiveConfig`/`effectiveRegistry`/`activeServers`/`skillSelection`, picks `scopeRoot`/`writeScope`/`generatedDir` (`effective-state.ts:83-89`) and `recordPath` (`:103`).
2. Load previous write record (`sync.ts:185`).
3. Unless `skillsOnly`: `syncMcp` (`:187-192`). Unless `mcpOnly`: `syncSkills` (`:194-199`). Both append `changes`, `warnings`, `managedPaths`.
4. Dedupe + sort `managedPaths` (`:89-95, 201`), diff against the previous record (`:202`), and clean dropped entries via `cleanupRemovedManagedPaths` (`:101-124, 203`).
5. Unless dry-run, atomically persist a new write record (`:205-212`, `write-record.ts:38-55`).

**Materialization mechanisms:**

| # | Mechanism | Targets | Implementation |
|---|---|---|---|
| 1 | Directory symlink | Claude/Codex skills | `skills.ts:50-73`; `syncSkills` recordIntent loop `:316-423` |
| 2 | `_drwn` meta-block | Claude `settings.json`, Codex `config.toml` | `managed-fields.ts:6-50`; consumed by `mergeClaudeSettingsText`/`mergeCodexTomlText` (`sync.ts:159, 166`) |
| 3 | Generated-file + symlink | Cursor `mcp.json` | `sync.ts:171-176` writes `<generatedDir>/cursor-mcp.json`; `ensureFileSymlink`s `.cursor/mcp.json` to it (`:69-87`) |

**Atomic-mutation discipline.** `writeManagedFile` (`sync.ts:40-56`) compares current vs next bytes and skips if equal, then backs up any existing file via numbered `.bak`/`.bak.N` (`:22-30, 32-38`) before writing. Symlink replacement removes and re-links only when the realpath differs (`:69-87`, `skills.ts:56-72`). Write-record persistence is `tmp → fsync → rename → fsync(dir)` (`write-record.ts:40-54`).

**`--dry-run` path.** Propagated as `state.normalized.dryRun`; gates file writes (`sync.ts:53, 158, 165, 173`), symlink creation (`:84-86`, `skills.ts:65-72`), cleanup (`:115-118`), and write-record save (`:205-212`). **`--mcp-only`** skips the skills branch (`:194`). **`--skills-only`** skips the MCP branch (`:187`).

### 5.2 Write records

`write-record.ts:7-17`:

| Field | Type | Notes |
|---|---|---|
| `writeRecordVersion` | literal `1` | Reject on mismatch (`write-record.ts:29`) |
| `lastWriteAt` | ISO timestamp | Set by sync (`sync.ts:208`) |
| `lastWriteHarnessVersion` | string | Currently hard-coded `"0.1.0"` (`sync.ts:209`) — flag as drift-risk |
| `managedPaths` | `ManagedPath[]` | Three variants |

`ManagedPath` variants:

| `kind` | Extra | Producer |
|---|---|---|
| `symlink` | `target` | `skills.ts:331, 340, 361, 381, 399, 410` |
| `managed-fields` | `fields`, `fieldHashes` | `sync.ts:160, 167` |
| `generated-symlink` | `generatedPath` | `sync.ts:175` |

Location: per-project at `<projectRoot>/.agents/drwn/write-record.json`; per-machine via `resolveGlobalWriteRecordPath`. Choice driven by `effective-state.ts:103`.

Readers: `syncRepository` (`sync.ts:185, 202`, `write-record.ts:57-79`); diagnostics (`diagnostics.ts:167-178`) surfaces presence, corruption, count, last-write timestamp, and last-write harness version in `status --explain` and `doctor`.

### 5.3 Install: lockfile-driven bootstrap

`commands/install.ts:13-95`:

1. Require a project root (`:44`) and `card.lock` (`:45-48`).
2. `ensureCardPresentFromLock` for every locked entry under concurrency limit (`:53-62`), accumulating per-card errors (`:54-55, 60-71`).
3. If any card mutated lockfile-derived metadata, re-persist the lock (`:73-75`).
4. On clean fetch: `--no-apply` returns a JSON/text summary without calling `syncRepository` (`:77-81`); otherwise fall into `syncRepository` (`:83-93`).

Flags (`:31-41`):

| Flag | Effect |
|---|---|
| `--frozen` | Passed through; fail rather than clone/fetch/mutate lockfile (`:57`) |
| `--no-apply` | Skip materialization tail (`:77-81`) |
| `--json` | Emit `{ok, cards, applied, lockfileChanged, sync?, errors?}` |

### 5.4 Init: project scaffold

`commands/init.ts:16-122` writes `<project>/.agents/drwn/config.json`. Mode resolved by `resolveInitMode` from flags + TTY (`:62-71`).

Flags (`:40-58`):

| Flag | Behavior |
|---|---|
| `--guided` | Force interactive when stdin+stdout are TTYs |
| `--minimal` | Alias for prompt-free minimal config |
| `--non-interactive` | Prompt-free minimal config |
| `--force` | Overwrite existing config (passed to `scaffoldProjectConfig`) |
| `--no-default-catalogs` | Skip pre-registering the default Curation Labs community card catalog (`:86-88`) |

Side effects: scaffold `config.json` (`:75, 95`); in guided mode, conditional Parallel/Beads extension entries (`:101-105, 112-115`); default community catalog registration for `https://github.com/curation-labs/dm-cards-catalog-v1.git` unless `--no-default-catalogs`; `.gitignore` is read but never mutated — a warning is appended if it excludes `.agents` (`:79-84`).

### 5.5 Status and doctor

Both share `cli/core/diagnostics.ts` as the engine.

`status` (`commands/status.ts:9-110`) has three mutually exclusive modes:

| Mode | Flag | Engine |
|---|---|---|
| Why-query | `--why <name>` | `answerWhy` (`diagnostics.ts:367-384`) |
| Explain | `--explain` | `explainStatus` (`diagnostics.ts:338-365`) |
| Default | _none_ | `buildStatusReport` (`diagnostics.ts:97-141`); JSON also includes `buildDiagnosticsSections` (`commands/status.ts:77-85`) |

`doctor` (`commands/doctor.ts:9-50`) calls `buildDoctorReportWithProject` (`diagnostics.ts:545-636`) and renders via `renderDoctorReport` or `renderJson`.

**Navigational map of `cli/core/diagnostics.ts`** (649 lines):

| Lines | Surface | Role |
|---|---|---|
| 1-29 | Imports + types | Cross-references project, card-lock, registry, MCP-library, skills, extensions, migration, write-record |
| 31-40 | `DoctorReport` interface | Output schema for `doctor` |
| 42-95 | `DiagnosticsSections` interface | Output schema for `status --json` / `--explain` |
| 97-141 | `buildStatusReport` | Concise per-target/per-source counts |
| 143-165 | `loadProjectWithCards` | Helper: project config + locked cards + card-merged project config |
| 167-178 | `readWriteRecordStatus` | `{path, present, corrupt, count, lastWriteAt, lastWriteHarnessVersion}` |
| 180-248 | `buildDiagnosticsSections` | Full sections payload for `--explain` and JSON `status` |
| 250-264 | `WhyAnswer` types + `splitWhyQuery` | Parses `"kind:name"` or bare `name` |
| 266-336 | `collectWhyMatches` | Provenance resolver across skills/servers/extensions/targets/cards |
| 338-365 | `explainStatus` | Human-readable explain renderer |
| 367-384 | `answerWhy` | Validates ambiguity, returns single match or error |
| 386-388 | `detectBrokenSymlinks` | lstat-survivor filter |
| 390-434 | `detectStaleSkillSymlinks` | Computes desired Claude/Codex skill sets across curated, scope dirs, resolved card sources; calls `findStaleSymlinks` (`skills.ts:268-279`) |
| 436-491 | `detectMcpDrift` | Per-target managed-content drift using merge writers |
| 493-504 | `detectMissingGeneratedFiles` | Cursor-enabled but `cursor-mcp.json` missing |
| 506-543 | `buildDoctorReport` | Machine-scoped doctor report aggregating detectors |
| 545-636 | `buildDoctorReportWithProject` | Project-scoped, plus six project-config issue passes (servers, skills.include/exclude, extensions, targets, card-skill availability) at `:576-605, 629-630` |
| 638-649 | `readDirLinks` | Internal: list non-dotfile symlink names |

**Check categories surfaced:**

| Category | Origin | Lines |
|---|---|---|
| Broken skill symlinks | `detectBrokenSymlinks` | `:386-388, 527-534` |
| Stale skill symlinks | `detectStaleSkillSymlinks` | `:390-434, 535, 610` |
| MCP drift (claude/codex/cursor) | `detectMcpDrift` | `:436-491, 536, 611-618` |
| Missing generated Cursor file | `detectMissingGeneratedFiles` | `:493-504, 537, 619` |
| Project config — defaults | `validateDefaultReferences` | `:518-522, 538` |
| Project config — unknown server / stale override | `buildDoctorReportWithProject` server loop | `:576-587` |
| Project config — unknown skill | skill availability loop | `:589-593` |
| Project config — unknown extension | extension loop | `:595-599` |
| Project config — stale target override | targets loop | `:601-605` |
| Store status | `getStoreStatus` (delegated) | `:191, 217, 540, 633`; `migration.ts:167-183` |
| Write record status | `readWriteRecordStatus` | `:167-178, 218, 541, 634` |
| Cards configured/locked + unavailable-skill warning | `buildDiagnosticsSections` + project doctor warning loop | `:234-238, 626-631` |

### 5.6 Scan (placeholder)

Verified placeholder. `commands/scan.ts:14-62` registers under `["scan"]` and emits a hard-coded payload `{implemented: false, changes: [], plannedRole, message: "drwn scan is not implemented yet."}` (`:36-42`).

`plannedRole` (`:8-12`) declares three intentions: inspect existing local agent tool config, report import candidates for library/defaults/project config, avoid writing files unless a future explicit step is added. The command has no `fs`-mutation imports — read-only by construction.

### 5.7 Search

`cli/core/search.ts:1-86` composes library + catalog results into a uniform `SearchResult` discriminated by `sourceGroup ∈ {library, catalog}` (`:8-11`). `searchSkills` (`:23-52`) merges `listLibrarySkills` with `searchNpmSkillCatalog`; `searchMcp` (`:54-86`) merges `listLibraryMcpServers` with `searchMcpCatalog`. Both honor `libraryOnly`/`catalogOnly` (`:36, 45, 65, 79`).

| Command | Sources |
|---|---|
| `drwn search card` | `searchCardCatalogs` over registered Git-backed catalogs only; `--scope` filter (`commands/search/card.ts:39-41`) |
| `drwn search mcp` | Local MCP library + configured online MCP catalogs (`commands/search/mcp.ts:70-77`); `--library`/`--catalog` mutually exclusive |
| `drwn search skill` | Local skill library + configured npm-skill catalogs (`commands/search/skill.ts:70-78`); same exclusion rule |

### 5.8 Export

`commands/export/sessions.ts:10-87`:

1. Resolve realpath'd project root + slug + git-worktree roots (`:45-47`).
2. Probe `~/.claude/projects` and `~/.codex/sessions` (`:49-50`).
3. Concurrently discover sessions per source (`:52-55`).
4. On `--dry-run`, list archive paths only (`:64-70`).
5. Otherwise archive to `.agents/drwn/session-log-exports/<utc-ts>.tar[.gz]` or `--out` (`:72-77`).

`cli/core/export/session-discovery.ts:11-198`:

| Function | Role |
|---|---|
| `resolveProjectRoot` | `git rev-parse --show-toplevel` fallback to cwd, then `realpath` (`:17-33`) — needed because macOS `/var` ≠ `/private/var` |
| `deriveProjectSlug` | Replace `/` with `-` (Claude's format) (`:36-38`) |
| `gitWorktreeRoots` | `git worktree list --porcelain` parse (`:40-58`) |
| `discoverClaudeSessions` | Match `projects/<slug>*/` dirs; archive non-empty `.jsonl` files under `claude/` or `claude/agents/` (`:60-105`) |
| `discoverCodexSessions` | Read first JSONL line; accept only `session_meta` whose `payload.cwd` is under a project root; archive under `codex/` (`:107-198`) |
| `readFirstLine` | readline-stream first line so >20KB `session_meta` lines parse (`:118-134`) |

`cli/core/export/archiver.ts:1-148`:

| Function | Role |
|---|---|
| `makeTimestamp` | UTC `YYYYMMDDTHHMMSS` (`:62-71`) |
| `archiveSessions` | Stage via hardlink (fall back to `copyFile` on `EXDEV`); spawn `tar` with `--no-mac-metadata` on darwin and `COPYFILE_DISABLE=1`; validate members (`:81-147`) |
| `validateArchiveMembers` | Reject AppleDouble (`._*`), `__MACOSX`, `.DS_Store`, hidden dotfiles, and any member outside `claude/` or `codex/` (`:32-60`) |
| `listArchiveMembers` | `tar tf` / `tzf` parse (`:15-30`) |

### 5.9 Store maintenance

| Command | Surface | Source |
|---|---|---|
| `store status` | path, initialized, schemaVersion, cardCount, sourceCount, skillBundleCount, mcpServerCount, legacyLayoutDetected | `commands/store/status.ts:9-53` → `getStoreStatus` (`migration.ts:167-183`) |
| `store verify` | enumerate each card, call `git.listTags`, return `{ok, cardCount, errors}`, exit 1 on errors | `commands/store/verify.ts:11-42` |
| `store migrate` | pre-cards → cards layout via staging+archive | `commands/store/migrate.ts:9-79` → `migrateStore` (`migration.ts:91-149`) |
| `store migrate-to-git` | per-version dirs → per-card bare Git repos | `commands/store/migrate-to-git.ts:9-50` → `migrateCardsToGit` (`store-migrate.ts:38-63`) |
| `store gc` | `git gc` in each card bare repo | `commands/store/gc.ts:9-29` |
| `store export` | tar of `~/.agents/drwn` to `--out` | `commands/store/export.ts:10-40` |

**`store migrate` flow:** short-circuit when `detectLegacyLayout` is false (`commands/store/migrate.ts:40-48`, `migration.ts:38-43`); build `drwn.staging-<ts>/`; copy machine config or seed `{version: 1, optional: {}}` (`migration.ts:104-111`); explode MCP library into per-id JSON files (`:58-73`); copy skill packages; create empty `cards/`, `sources/`, `generated/`, `extracted/`, `catalogs/`; write `store.json` (schema-version 1); validate staging (`:75-89, 123-133`); archive old layout under `drwn.archive-<ts>`; `rename` staging into the live store (`:135-145`).

**`--cleanup-legacy-orphans`** (`commands/store/migrate.ts:27-29, 55-63`) runs `cleanupLegacyOrphans` (`migration.ts:185-242`): scans `~/.claude/skills` and `~/.codex/skills` for symlinks whose targets fall under drwn-owned prefixes (`packages/`, `skills/`, current store, archive) and removes only those — non-owned symlinks are explicitly preserved (`:225-234`).

**`store migrate-to-git` flow:** list per-version legacy card dirs (`store-migrate.ts:113-143`); `assertStoreWritable` when actually mutating (`:51-54`); for each card, init a tmp bare repo (`:69-73`); per version validate `card.json`, read recorded `.integrity` or fall back to `versions.json` (`:75-88, 153-164`); stage source minus `.integrity`; `writeTreeFromDir` + commit + tag `vN.N.N` (`:90-104`); rename bare repo into place and remove the legacy directory (`:107-109`). Integrity re-verified against the post-migration extraction (`:95-98`).

---

## 6. Vocabulary (locked terms)

| Term | Definition | Authority |
|---|---|---|
| Card | Immutable Git-backed bundle of skills + MCP server defs + target enablement + project extensions | `card-store.ts`, `card-manifest.ts` |
| Source | Mutable working tree at `~/.agents/drwn/sources/<name>/` from which cards are published | `card-source.ts:1-50` |
| Published | A `v<version>`-tagged commit in `~/.agents/drwn/cards/<name>.git/` | `card-store.ts:620-672` |
| Consumed | A card referenced in a project's `config.cards` and pinned in `card.lock` | `card-project.ts`, `card-lock.ts` |
| Bare repo | Git bare repository under `cards/<name>.git/` | `store-paths.ts:64-70` |
| Extracted tree | Content-addressed materialization at `extracted/<tree-sha>/` | `store-paths.ts:72-79` |
| Bundle | npm-distributed skill package under `~/.agents/drwn/skills/<package>/<version>/` | `skill-packages.ts`, `bundle.json` |
| Library | Machine-local inventory (curated repo skills + bundles + MCP definitions + registry) | `library.ts:9-69` |
| Catalog (discovery) | Configured source of searchable items (npm-skills, mcp, card-catalogs) | `catalogs.ts`, `card-catalog.ts` |
| Catalog publication | Producer-side mutation of a card catalog repo's `catalog.json` | `card-catalog-publish.ts` |
| Defaults | Subset of library promoted into `userConfig.defaults.{skills, mcpServers, extensions}` | `defaults.ts` |
| Effective state | Composed view of repo + machine + library + project + cards for read or write | `effective-state.ts:44-107` |
| Managed field | A drwn-owned key inside a user-owned config file, tracked via `_drwn` meta block | `managed-fields.ts:6-50` |
| Write record | Per-scope ledger of materializations enabling cleanup + drift detection | `write-record.ts:7-17` |
| Resolver | Function turning a card ref or skill name into a concrete on-disk source | `card-store.ts:682-709`, `card-skill-resolver.ts:26-64` |

---

## Appendix A: Command → core-module map

| Command | Primary core modules consulted/written |
|---|---|
| `init` | `project.ts` (scaffold), `extensions/{parallel,beads}.ts`, `card-catalog.ts` (default catalog) |
| `install` | `card-install.ts`, `card-lock.ts`, `sync.ts` (chained materialize) |
| `write` / `mcp write` | `effective-state.ts`, `sync.ts`, `skills.ts`, `mcp.ts`, `managed-fields.ts`, `write-record.ts` |
| `status` / `card status` | `diagnostics.ts`, `effective-state.ts` |
| `doctor` | `diagnostics.ts`, all detector modules |
| `scan` | (placeholder; no fs writes) |
| `apply` / `card apply` / `card add` / `card pin` / `card update` / `card remove` / `card detach` | `card-project.ts`, `card-lock.ts`, optional `sync.ts` via `--write` |
| `card new` | `card-store.ts:createCardSource`, `card-capture.ts` |
| `card source *` | `card-source.ts`, `store-paths.ts` |
| `card publish` | `card-store.ts:publishCard`, `git.ts` |
| `card catalog publish` | `card-catalog-publish.ts`, `card-catalog.ts`, `card-store.ts`, `git.ts` |
| `card push` / `card fetch` / `card clone` / `card remote *` | `git.ts`, `card-store.ts` |
| `card show` / `card list` / `card validate` / `card diff` / `card outdated` | `card-store.ts`, `card-diff.ts`, `git.ts` |
| `card deprecate` | `card-store.ts:deprecateCardVersion`, `git.configSet` |
| `add skill` / `add mcp` | `library.ts`, `project-writes.ts`, optional `search.ts` |
| `skills list` / `skills curate` / `skills uncurate` | `skills.ts` |
| `skills packages add/list/show` | `skill-packages.ts` |
| `library list` / `library show` | `library.ts`, `mcp-library.ts` |
| `library add skill/mcp` | `skill-packages.ts`, `mcp-library.ts` |
| `library defaults *` | `defaults.ts`, `user-config.ts`, `skills.ts` (curate side-effect) |
| `library catalog *` | `card-catalog.ts` |
| `search skill/mcp/card` | `search.ts`, `catalogs.ts`, `card-catalog.ts` |
| `extensions add/setup/list/show/status/doctor` | `extensions/registry.ts`, per-extension modules, `project-writes.ts` |
| `export sessions` | `export/session-discovery.ts`, `export/archiver.ts` |
| `analyze sessions` | `analyze/find-archive.ts`, `analyze/inline-export.ts`, `analyze/resolve-input.ts`, `analyze/validate-archive.ts`, `auth/resolve-token.ts`, `http/analyzer-client.ts` |
| `login` / `logout` / `whoami` | `auth/config.ts`, `auth/credentials.ts`, `auth/device-flow.ts`, `auth/resolve-token.ts`, `http/analyzer-client.ts` |
| `store status/verify/migrate/migrate-to-git/gc/export` | `migration.ts`, `store-migrate.ts`, `git.ts` |
| `mcp list` | `mcp.ts`, `mcp-library.ts`, `effective-state.ts` |

---

## Appendix B: Module index (`cli/core/*`)

| Module | LOC | Role |
|---|---|---|
| `paths.ts` | 120 | `resolveAgentsDir`, `resolveRepoRoot`, credentials path, legacy package paths |
| `auth/config.ts` | 52 | Analyzer API/web/client config resolution with env overrides |
| `auth/credentials.ts` | 62 | Read/write/delete `~/.agents/drwn/credentials.json` |
| `auth/device-flow.ts` | 55 | Device-flow orchestration over the shared analyzer HTTP client |
| `auth/resolve-token.ts` | 33 | Credentials/env bearer-token resolution |
| `http/analyzer-client.ts` | 121 | Analyzer auth/session/upload/job HTTP client with schema validation |
| `analyze/*` | 161 | Archive selection, validation, inline export, and frontend URL helpers |
| `store-paths.ts` | 152 | Every path under `~/.agents/drwn/`; `assertStoreWritable` |
| `fs.ts` | 45 | `writeAtomically`, `lstatSafe`, `realpathSafe`, `ensureParentDir` |
| `concurrency.ts` | 60 | `pMap`, `resolveFetchConcurrency` |
| `errors.ts` | 23 | `DrwnError` + `toJSON` |
| `output.ts` | 57 | `renderJson`, `renderTable`, `renderSyncResult`, `renderDoctorReport` |
| `interactivity.ts` | 54 | TTY-aware mode resolvers |
| `types.ts` | 169 | Shared schemas (config, registry, project, manifest, lock, bundle) |
| `config.ts` | 14 | Packaged `registry/config.json` read/write |
| `registry.ts` | 14 | Packaged `registry/mcp-servers.json` read/write |
| `user-config.ts` | 104 | Machine config load/merge (`mergeMachineConfig`) |
| `defaults.ts` | 90 | `resolveDefaultMcpNames`, `applyMcpDefaultsToConfig`, `addDefaultValue`/`removeDefaultValue` |
| `project.ts` | 125 | `findProjectConfig`, `loadProjectConfig`, `mergeProjectConfig`, `scaffoldProjectConfig` |
| `project-writes.ts` | 56 | Project config read-for-write helpers, `includeProjectSkill`, `setProjectServerOverride`, `setProjectExtensionConfig` |
| `effective-state.ts` | 107 | `buildEffectiveState` — the single composed view |
| `managed-fields.ts` | 50 | `_drwn` meta block + canonical-JSON hashing |
| `mcp.ts` | 137 | `buildActiveServers`, transport writers, `mergeClaudeSettingsText`, `mergeCodexTomlText`, `renderCursorConfig` |
| `mcp-library.ts` | 98 | User MCP library load/save with store-layout switching |
| `library.ts` | 69 | `LibrarySkill`/`LibraryMcpServer`, inventory aggregation |
| `catalogs.ts` | 119 | `searchNpmSkillCatalog`, `searchMcpCatalog` |
| `card-store.ts` | 741 | `resolveCard`, `publishCard`, `parseCardRef`, `resolveFromStore`/`resolveFromGit`, `listCards`, `deprecateCardVersion`, `computeCardIntegrity` |
| `card-source.ts` | 635 | `createCardSource`, `readCardSourceState`, all `*CardSource*` mutators |
| `card-manifest.ts` | 116 | `assertValidCardManifest`, name/scope/version validators, quality field validators |
| `card-lock.ts` | 135 | `validateCardLockfile`, `readCardLock`, `writeCardLock` (atomic) |
| `card-project.ts` | 182 | `resolveProjectCards`, `writeProjectCards`, `addProjectCardSpec`, `applyProjectCardSpecs`, `pinProjectCardSpec`, `updateProjectCardLock`, `removeProjectCard`, `detachProjectCards`, `findOutdatedProjectCards`, `mergeCardManifestsIntoProjectConfig`, `readProjectCardStatus` |
| `card-skill-resolver.ts` | 64 | `resolveSkillSource` — fixed 3-layer order |
| `card-capture.ts` | 95 | `captureProjectAsCard` for `card new --from-project` |
| `card-install.ts` | 89 | `ensureCardPresentFromLock` |
| `card-catalog.ts` | 264 | Git-backed card catalogs (clones under `catalogs/`) |
| `card-catalog-publish.ts` | 500 | Producer-side catalog entry validation, local/direct catalog mutation, commit/push orchestration |
| `card-diff.ts` | 98 | `diffCards` manifest classification |
| `git.ts` | 365 | Single module that runs `git`; error taxonomy; bare-repo plumbing |
| `url-card-map.ts` | 67 | `~/.agents/drwn/url-card-map.json` persistent cache |
| `semver-utils.ts` | 28 | Strict-semver helpers |
| `skills.ts` | 437 | Repo skill inventory, curation, `findAvailableSkill`, `syncSkills`, `findStaleSymlinks` |
| `skill-packages.ts` | 222 | npm-pack ingestion, `bundle.json` validation, `listInstalledSkillBundles` |
| `write-record.ts` | 79 | `WriteRecord` schema, fsync-safe save, `diffWriteRecord` |
| `sync.ts` | 215 | `syncRepository`, `syncSkills` callsite, `syncMcp`, `cleanupRemovedManagedPaths` |
| `diagnostics.ts` | 649 | `buildStatusReport`, `buildDiagnosticsSections`, `buildDoctorReport`, `buildDoctorReportWithProject`, all detectors |
| `search.ts` | 86 | `searchSkills`, `searchMcp` composing library + catalog results |
| `migration.ts` | 242 | `detectLegacyLayout`, `migrateStore`, `getStoreStatus`, `cleanupLegacyOrphans` |
| `store-migrate.ts` | 164 | `migrateCardsToGit` (per-version dirs → bare repos) |
| `extensions/registry.ts` | 102 | `listExtensions`, `getExtension` — hard-coded 3 extensions |
| `extensions/types.ts` | 76 | `ExtensionDefinition`, `ExtensionStatus`, `ExtensionDoctorReport` |
| `extensions/project-config.ts` | 89 | `applyProjectExtensionConfig`, `mergeProjectSkillOverrides` |
| `extensions/status.ts` | 116 | `buildExtensionStatus`, `buildAllExtensionStatuses` |
| `extensions/doctor.ts` | 138 | `buildExtensionDoctorReport` with per-extension checks |
| `extensions/commands.ts` | 48 | `findCommand` (PATH walk), `runExternalCommand` |
| `extensions/beads.ts` | 116 | Beads setup planning + execution |
| `extensions/markitdown.ts` | 72 | MarkItDown install plan + uv detection |
| `extensions/parallel.ts` | 36 | Parallel config-only writer |
| `export/session-discovery.ts` | 198 | Claude + Codex session discovery |
| `export/archiver.ts` | 147 | Hardlink staging + `tar` invocation + member validation |

---

## Appendix C: Disagreements with target architecture (analysis 52)

These are points where current code diverges from `analyses/52_drwn-target-architecture-post-wave-1.md`. The code is authoritative; this list exists so future readers can reconcile the target doc when they touch it.

1. **`url-card-map.json` already exists.** Analysis 52 §3.1 (line 195) says "No `url-card-map.json`. URL→name discovery runs on-demand in Wave 1; the persistent mapping cache is a Wave 2 optimization." → Current code at `cli/core/url-card-map.ts` and `card-store.ts:445-451` writes and reads this exact file. The §16.3 Wave-2 feature has shipped early.

2. **`card new --from-project` already exists.** §7.4 lists this as a Wave-2 capture flow. → It exists today (`commands/card/new.ts:32-34`, `card-capture.ts`). Shipped early.

3. **`manifestVersion` not declared.** §5 (lines 423-432) lists `manifestVersion?: 1 | 2` as a Wave-2 schema addition. → `CardManifest` (`card-manifest.ts:7-22`) does not declare it; the three Wave-2 quality fields (`stability`, `lastValidatedWith`, `testStatusBadge`) are present but the version field is not. Manifests are silently versioned by absence of unknown-field rejection.

4. **`git.fsck` and `git.gc` not implemented.** §9.1 (line 868) documents these exports. → Neither exists in `cli/core/git.ts`. Planned but never implemented; `store gc` shells out to `git gc` directly via `runInRepo` (`commands/store/gc.ts`).

5. **`discoverCardNameForUrl` is inlined, not a separate helper.** §8.4 (lines 770-792) describes it as a discrete helper. → In as-built code, discovery is inlined inside `resolveFromGit` (`card-store.ts:453-479`) using the temp-clone-then-rename pattern. Behavior matches; structure differs.

6. **`lockfileVersion` is a hard cut at `2`.** §4.3 (line 327) says "Wave 1 uses `lockfileVersion: 2` only. There is no v1 read-compat shim." → Confirmed: `card-lock.ts:58-60` hard-rejects anything else.

7. **`profiles/` is not implemented.** §3.1 lists `profiles/work.json`, `profiles/personal.json` in the per-user store. → No `resolveProfilesPath` exists in `store-paths.ts`. Forward-looking design.

8. **`presets/` and per-project `<project>/.agents/drwn/skills/` are not implemented.** §3.3 lists these. → No resolvers wired up; only `config.json`, `card.lock`, `write-record.json` exist in the per-project state.

9. **`registry/mcp-servers.json` carries an undeclared `auth` field.** Used on `notion` and `slack` (`registry/mcp-servers.json:45,53-57`); not declared in `RegistryServer` (`types.ts:7-19`). Survives via unchecked `JSON.parse`. Type-aware consumers don't see it.

10. **`lastWriteHarnessVersion` is hardcoded.** `sync.ts:209` writes `"0.1.0"` regardless of the actual harness version. Drift risk; should derive from `package.json`.

11. **`bgng` → `drwn` rename done.** §11.5 ("HISTORICAL — DROPPED 2026-06-02") references the old binary name. Repo and all docs/tests/CLI surface use `drwn` exclusively.
