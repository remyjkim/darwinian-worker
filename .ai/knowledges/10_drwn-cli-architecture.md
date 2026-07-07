# ABOUTME: Comprehensive as-built architecture reference for the drwn CLI internals.
# ABOUTME: Covers process model, store topology, config layering, cards, skills, write pipeline, diagnostics.

# drwn CLI Architecture (As-Built)

**Category**: Reference
**Tags**: drwn, cli, architecture, internals, store, cards, skills, mcp, diagnostics, write-pipeline
**Last Updated**: 2026-06-26
**References**: [analyses/52_drwn-target-architecture-post-wave-1.md, analyses/43_drwn-cli-target-architecture.md, analyses/47_drwn-target-architecture-after-phase-1.md, analyses/49_drwn-target-architecture-after-phase-3.md, knowledges/01_agents-cli-usage-guide.md, knowledges/02_per-project-config-guide.md, knowledges/03_npm-skill-bundles-guide.md, cli/index.ts, cli/context.ts, cli/core/card-store.ts, cli/core/card-source.ts, cli/core/card-lock.ts, cli/core/card-manifest.ts, cli/core/card-skill-resolver.ts, cli/core/git.ts, cli/core/store-paths.ts, cli/core/paths.ts, cli/core/fs.ts, cli/core/sync.ts, cli/core/write-record.ts, cli/core/effective-state.ts, cli/core/diagnostics.ts, cli/core/skills.ts, cli/core/skill-packages.ts, cli/core/mcp.ts, cli/core/managed-fields.ts, cli/core/extensions/registry.ts, registry/config.json, registry/mcp-servers.json]

---

## Overview

`drwn` is a single-process, Bun-executed, Clipanion-based CLI that manages local AI agent harness configuration: skills, MCP servers, target enablement, project overlays, and cards. There is no daemon, no IPC, and no persistent cache outside the filesystem. Every invocation is a fresh process that reads from a fixed set of on-disk surfaces, computes an effective state, and either reports or materializes that state into downstream agent-tool config files.

This document describes the **as-built** architecture against the code for package `darwinian-minds@0.5.0`. It is grounded in `cli/index.ts` (the entrypoint), the `cli/commands/` tree (the user-facing surface), and the `cli/core/` modules (the engine). Every concrete claim cites the source module and function/export name. Where current behavior diverges from `analyses/52_drwn-target-architecture-post-wave-1.md` (the canonical target doc), the divergence is called out in **Appendix C**.

This is a reference doc. It does not prescribe how to extend the CLI; it describes what is true today so that future changes can be made without recreating the analysis. When code changes, this doc must change with it.

---

## Design principles (carry-forward rules)

Six disciplines are enforced consistently across the codebase:

1. **Single resolved context per process.** `createAgentsContext()` runs once at startup (`cli/index.ts`) and freezes `repoRoot`, `agentsDir`, `homeDir`, `cwd`, `projectConfigPath`. No command re-reads `homedir()` or `process.cwd()` mid-execution. Sandbox env vars (`AGENTS_REPO_ROOT`, `AGENTS_HOME_DIR`, `AGENTS_DIR`) exist exclusively at this boundary.
2. **Single chokepoint for store mutation.** Every write under `~/.agents/drwn/` flows through a resolver in `cli/core/store-paths.ts` that calls `assertStoreWritable()` (`store-paths.ts`), and through `writeAtomically()` (`fs.ts`) for content. Read-only mode (`DRWN_STORE_READONLY=1`) and crash-safe writes are architectural properties, not per-command discipline.
3. **Filesystem is the API; the lockfile is the contract.** No in-memory cache outlives a process. The per-user store layout (`store-paths.ts`), the per-project layout (`project.ts`, `card-lock.ts`, `write-record.ts`), and the typed schemas in `cli/core/types.ts` together form the contract. Future UIs (Electron, library mode) must read and write the same shapes.
4. **JSON output is universal but per-command.** There is no global `--json` option layer. Each command declares `Option.Boolean("--json", false, …)` individually and renders through `cli/core/output.ts:renderJson` (`output.ts`). Errors render via `DrwnError.toJSON()` (`errors.ts`).
5. **Mutations are atomic.** `writeAtomically` (`fs.ts`) is temp-then-rename. The write-record save additionally fsyncs the file and parent dir (`write-record.ts`). Migration uses a staging tree renamed into place (`migration.ts`).
6. **No daemon, no IPC, bounded local concurrency.** `cli/core/concurrency.ts` provides exactly `resolveFetchConcurrency()` (default 4, `DRWN_FETCH_CONCURRENCY`) and `pMap()`. No file locks, no mutexes — cross-process safety comes from atomic renames, not coordination.

These appear repeatedly below; treat them as load-bearing.

---

## 1. Process model & foundations

### 1.1 Invocation and command dispatch

The entrypoint is `cli/index.ts` (`#!/usr/bin/env bun`). It constructs a Clipanion `Cli` with `binaryName: "drwn"` (`cli/index.ts`). `package.json` ships two bins pointing at the same entrypoint — `drwn` and `dminds` (`package.json` `bin`). The entrypoint registers every command class as a top-level entry (`cli/index.ts`), and calls `cli.runExit(process.argv.slice(2), context)` (`cli/index.ts`). Before dispatch:

- `createAgentsContext()` builds the per-process context (`cli/index.ts`).
- `validateRepoRoot()` confirms a packaged `registry/config.json` exists (`cli/index.ts`, `cli/context.ts`); failure is fatal.
- `detectLegacyLayout(agentsDir)` emits a stderr warning when a pre-cards layout is present (`cli/index.ts`, `cli/core/migration.ts`).

**Hook invocation guard.** When `argv[0] === "hook"`, the entrypoint skips `validateRepoRoot` and `detectLegacyLayout`, and catches all errors silently (setting `exitCode = 0`). This permits hooks to run inside arbitrary projects that may lack a drwn checkout or env, staying silent and non-fatal.

Uncaught errors (outside hook invocations) render to stderr and set `process.exitCode = 1` (`cli/index.ts`).

**Command tree (103 registrations).** All registrations are in a single block. Grouped by area:

| Namespace | Commands | TS files |
|---|---|---|
| skills | `skills list`, `skills packages add/list/show`, `skills curate`, `skills uncurate` | `cli/commands/skills/*` (`cli/index.ts`) |
| add | `add skill`, `add mcp`, `add card` | `cli/commands/add/{skill,mcp}.ts`, `cli/commands/card/add.ts` (`cli/index.ts`) |
| install | `install` | `cli/commands/install.ts` (`cli/index.ts`) |
| card (author) | `card new`, `card audit`, `card publish`, `card show`, `card source list/show/doctor/set/sync/add-skill/remove-skill/add-mcp/remove-mcp/add-hook/remove-hook`, `card list`, `card diff`, `card deprecate` | `cli/commands/card/{new,audit,publish,show,source/*,list,diff,deprecate}.ts` |
| worker (stack) | `worker stack`, `worker stack use`, `worker stack clear` | `cli/commands/worker/stack/*` (`cli/index.ts`) |
| card (sharing) | `card catalog publish`, `card remote add/list/set/remove`, `card push`, `card fetch`, `card clone` | `cli/commands/card/{catalog-publish,remote,push,fetch,clone}.ts` (`cli/index.ts`) |
| card (consumer) | `card apply`, `card add`, `card pin`, `card remove`, `card detach`, `card update`, `card outdated`, `card status`, `card trust`, `card untrust`, `card validate` | `cli/commands/card/{apply,add,pin,remove,detach,update,outdated,status,trust,untrust,validate}.ts` (`cli/index.ts`) |
| top-level aliases | `apply`, `update` (alias `card apply` / `card update`) | (`cli/index.ts`) |
| library | `library add skill/mcp`, `library catalog list/add/remove/refresh`, `library defaults list/add-skill/remove-skill/add-mcp/remove-mcp`, `library list`, `library show` | `cli/commands/library/*` (`cli/index.ts`) |
| search | `search skill`, `search mcp`, `search card` | `cli/commands/search/*` (`cli/index.ts`) |
| extensions | `extensions add/list/show/status/doctor/setup` | `cli/commands/extensions/*` (`cli/index.ts`) |
| mcp / write / scan / analyze / export | `mcp write`, `mcp list`, `write`, `scan`, `analyze sessions`, `export sessions` | (`cli/index.ts`) |
| store | `store migrate`, `store migrate-to-git`, `store gc`, `store verify`, `store export`, `store seed`, `store status` | `cli/commands/store/*` (`cli/index.ts`) |
| auth | `login`, `logout`, `whoami` | `cli/commands/auth/*` (`cli/index.ts`) |
| catalog | `catalog validate` | `cli/commands/catalog/validate.ts` (`cli/index.ts`) |
| hook (internal) | `hook card-usage`, `hook skill-marker` | `cli/commands/hook/{card-usage,skill-marker}.ts` (`cli/index.ts`) |
| diagnostic / bootstrap | `status`, `doctor`, `init` | (`cli/index.ts`) |
| builtins | Clipanion `Help`, `Version` | (`cli/index.ts`) |

All commands extend `BaseCommand` (`cli/commands/base.ts`) — `abstract class extends Command<AgentsContext>`. There is no middleware layer; argument parsing routes Clipanion → `execute()` and the context is on `this.context`.

### 1.2 Execution context and sandbox env vars

`AgentsContext` (`cli/context.ts`) extends Clipanion's `BaseContext` with `repoRoot`, `homeDir`, `agentsDir`, `cwd`, `projectConfigPath`. `createAgentsContext()` reads three sandbox overrides:

| Env var | Purpose | Read at |
|---|---|---|
| `AGENTS_REPO_ROOT` | Override packaged repo root (location of `registry/config.json`) | `cli/context.ts` |
| `AGENTS_HOME_DIR` | Override `$HOME` for resolving `~/.agents/` | `cli/context.ts` |
| `AGENTS_DIR` | Override the resolved `~/.agents` directory itself | `cli/context.ts` |

When `AGENTS_REPO_ROOT` is unset, the resolver picks the cwd if it already contains `registry/config.json`, otherwise the directory of the running module (`cli/context.ts`). `agentsDir` defaults to `join(homeDir, ".agents")` (`cli/core/paths.ts`). `projectConfigPath` is memoized via upward search from cwd (`cli/context.ts`, `cli/core/project.ts`).

**Other process knobs:**

- `DRWN_STORE_READONLY=1` (or `=true`) — enforced by `assertStoreWritable()` (`store-paths.ts`). Every store-mutating helper calls it: `card-store.ts`, `card-catalog.ts`, `card-source.ts`, `card-install.ts`, `store-migrate.ts`, `url-card-map.ts`. Migration defers the check to after dry-run so `--dry-run` works against a read-only store (`store-migrate.ts`).
- `DRWN_FETCH_CONCURRENCY` — parallel fetch limit, default 4, clamped ≥1 (`concurrency.ts`).
- `DRWN_GIT_TIMEOUT_MS` — Git subprocess timeout, default 30000 (`git.ts`).
- `DRWN_ANALYZER_URL` — analyzer API override for `login`, env-token auth, and analyze uploads (`auth/config.ts`, `auth/resolve-token.ts`).
- `DRWN_ANALYZER_WEB_URL` — analyzer frontend URL override used to compose processing/report URLs (`auth/config.ts`, `analyze/url.ts`).
- `DRWN_TOKEN` — bearer-token override for non-login analyzer commands; must be paired with `DRWN_ANALYZER_URL` (`auth/resolve-token.ts`).

### 1.3 Per-user store topology

Store root is `~/.agents/drwn/`. `resolveAgentsDir(homeDir) = join(homeDir, ".agents")` (`paths.ts`); `resolveStoreRoot(agentsDir) = join(agentsDir, "drwn")` (`store-paths.ts`).

| Path | Resolver | Stores |
|---|---|---|
| `store.json` | `resolveStoreMetadataPath` (`store-paths.ts`) | `StoreMetadata` — `{schemaVersion: 1, initAt}` (`types.ts`) |
| `machine.json` | `resolveMachineConfigPath` (`store-paths.ts`) | `MachineConfig` (`types.ts`) — active machine harness baseline |
| `cards/` | `resolveCardsRoot` (`store-paths.ts`) | Per-card published store root |
| `cards/<scope?>/<name>.git/` | `resolveCardBareRepoPath` (`store-paths.ts`) | Bare Git repo per card; `[drwn] cardName`, `originUrl`, `deprecated.<v>` |
| `sources/<scope?>/<name>/` | `resolveCardSourceDir` (`store-paths.ts`) | Editable working tree for a card; independent of bare repo |
| `extracted/<tree-sha>/` | `resolveExtractedPath` (`store-paths.ts`) | Content-addressed extraction; 40-hex enforced by `validateTreeSha` (`store-paths.ts`) |
| `skills/<package>/<version>/` + `current` | `resolveStoreSkillPackageVersionRoot` / `resolveStoreSkillPackageCurrentLink` (`store-paths.ts`) | npm-backed skill bundles; `current` symlinks active version |
| `mcp-servers/<id>.json` | `resolveStoreMcpServerFile` (`store-paths.ts`) | One JSON per user-registered MCP server |
| `catalogs/<slug>/` | `resolveCatalogPath` (`store-paths.ts`) | Shallow clones of Git-backed card catalogs (`slugifyUrl`, `store-paths.ts`) |
| `catalogs.json` | `resolveCatalogsIndexPath` (`store-paths.ts`) | Registered catalogs index |
| `generated/` | `resolveStoreGeneratedDir` (`store-paths.ts`) | Drwn-generated files for downstream tools (Cursor MCP) |
| `generated/hooks/<runtime>/` | `resolveGeneratedHooksDir` (`store-paths.ts`) | Generated hook composer shims for Claude Code, Codex, and Mastra |
| `generated/workers/<scope?>/<name>/` | `resolveGeneratedWorkerDir` (`store-paths.ts`) | Per-worker bundle (skill/hook symlinks, optional `mcp/servers.json`, `worker.json` index) for one installed card |
| `generated/workers.json` | written by `syncWorkers` (`worker-generator/sync-worker.ts`) | Registry indexing every per-worker bundle (`{version, workers[]}`) |
| `global-write-record.json` | `resolveGlobalWriteRecordPath` (`store-paths.ts`) | Machine-scope write record |
| `url-card-map.json` | `resolveUrlCardMapPath` (`url-card-map.ts`) | Persistent URL→card-name cache |
| `credentials.json` | `resolveCredentialsPath` (`paths.ts`) | Analyzer auth credentials written atomically with mode `0600` (`auth/credentials.ts`) |

**Path safety.** `assertSafePathPart` (`store-paths.ts`) rejects `..`, backslashes, leading `/` or `.`. `splitCardName` (`store-paths.ts`) parses `@scope/name` vs unscoped, validating both segments. `validateTreeSha` is module-private and only reachable via `resolveExtractedPath`.

**Bare-repo vs extracted.** `cards/<name>.git/` is a Git **bare** repository (created by `git.initBare` in `store-migrate.ts`). `extracted/<tree-sha>/` is materialized tree content. Tree SHA is the dedup key — two commits with identical trees share extraction.

**npm-backed skill bundle shape.** `~/.agents/drwn/skills/<package>/<version>/` plus `~/.agents/drwn/skills/<package>/current → <version>`. Scoped packages split into path segments (`store-paths.ts`), so `@scope/pkg` becomes `skills/@scope/pkg/<version>/`. A legacy resolver at `paths.ts` (`resolveSkillPackage*`) still computes `~/.agents/packages/skills/...` and is one of the roots migrated by `migration.ts`.

### 1.4 Per-project state

Project state lives at `<project>/.agents/drwn/`. `findProjectConfig` (`project.ts`) walks upward looking for `.agents/drwn/config.json`; returns `null` at the FS root. `resolveProjectRootFromConfigPath` strips three `dirname` calls (`project.ts`).

| File | Resolver | Content |
|---|---|---|
| `config.json` | `project-writes.ts` | `ProjectConfig` v1 (`types.ts`); schema gated at `project.ts` |
| `card.lock` | `cardLockPath` (`card-lock.ts`) | `CardLockfile` v2/v3/v4 (`card-lock.ts`); validated by `validateCardLockfile` (`card-lock.ts`) |
| `write-record.json` | `write-record.ts` | `WriteRecord` v1 (`write-record.ts`); fsync-safe save (`write-record.ts`) |

Project config writes go through `readProjectConfigForWrite` / `writeProjectConfigForWrite` (`project-writes.ts`), which return a `version: 1` skeleton when no file exists.

### 1.5 Concurrency, atomicity, errors, output

**`cli/core/concurrency.ts`** provides only two functions:

- `resolveFetchConcurrency()` (`concurrency.ts`) — reads `DRWN_FETCH_CONCURRENCY`, default 4, clamped ≥1.
- `pMap<T,R>(items, concurrency, fn)` (`concurrency.ts`) — bounded-concurrency `Promise.all` that preserves input order; collects errors across all in-flight work and rethrows the first after every worker drains.

No file locks, mutexes, or queues. Concurrency control is per-invocation only.

**Atomicity primitives** in `cli/core/fs.ts`:

- `writeAtomically(targetPath, content)` (`fs.ts`) — `mkdir(dirname, recursive)`, write to `${target}.tmp.${randomHex8}`, `rename` to final. On failure removes the temp best-effort and rethrows the original error.
- `lstatSafe`, `realpathSafe` (`fs.ts`) — exception-swallowing wrappers used by sync and doctor.
- `ensureParentDir(path, dryRun)` (`fs.ts`) — dry-run-aware mkdir.

The write-record path uses a stronger discipline: explicit `fsync` on the file fd and parent-dir fd before `rename` (`write-record.ts`). It is the only fsync-the-parent-directory site in the codebase.

The migration pipeline layers atomicity by building a `drwn.staging-<ts>/` tree, validating it, archiving the prior layout to `drwn.archive-<ts>/`, then `renameSync(staging, resolveStoreRoot(...))` to activate (`migration.ts`).

**Typed errors.** `DrwnError` (`errors.ts`) carries `code`, optional `hints`, optional `cause`, and a `toJSON()` for `--json`. The only built-in code is `"STORE_READONLY"` (`store-paths.ts`); feature modules produce their own codes ad-hoc (e.g. `CARD_NOT_FOUND`, `CARD_NO_MATCHING_VERSION`, `CARD_NAME_COLLISION`, `CARD_NAME_MISMATCH`, `INTEGRITY_MISMATCH`, `CARD_NPM_NOT_IMPLEMENTED` — see §3.3).

**Output rendering** in `cli/core/output.ts`:

- `renderJson(value)` (`output.ts`) — canonical 2-space JSON + `\n`.
- `renderTable(headers, rows)` (`output.ts`).
- `renderSyncResult({changes, warnings})` (`output.ts`) — text for `apply`/`write`.
- `renderDoctorReport(report)` (`output.ts`) — text for `doctor`.

Commands branch on `this.json` and pick one. No global JSON envelope; each command picks its own shape.

**Interactivity.** `cli/core/interactivity.ts` is a TTY-aware mode resolver. `resolveInitMode` (`interactivity.ts`) returns `"guided" | "minimal" | "error"` based on flags + TTY state. `resolveInstallDecisionMode` (`interactivity.ts`) does the same for MarkItDown setup. There is no `DRWN_NO_PROMPT` env var; non-interactive behavior is driven by explicit flags or absent TTY.

---

## 2. Configuration & merge model

### 2.1 The five configuration sources

drwn composes effective behavior from up to five distinct surfaces:

| # | Surface | On-disk | Loader | Mutators |
|---|---|---|---|---|
| 1 | Packaged config | `<repoRoot>/registry/config.json` | `loadConfig` (`config.ts`) | `saveConfig` (developer only) |
| 2 | Packaged MCP registry | `<repoRoot>/registry/mcp-servers.json` | `loadRegistry` (`registry.ts`) | `saveRegistry` |
| 3 | User MCP library | `~/.agents/library/mcp-servers.json` (legacy) or `~/.agents/drwn/mcp-servers/<id>.json` (store layout) | `loadMcpLibrary` (`mcp-library.ts`) | `saveMcpLibrary` (`mcp-library.ts`) |
| 4 | Machine config | `~/.agents/drwn/config.json` (legacy) or `~/.agents/drwn/machine.json` (store layout) | `loadUserConfig` / `loadEffectiveConfig` (`user-config.ts`); `readMachineConfig` (`card-store.ts`) | `saveUserConfig` (`user-config.ts`); `writeMachineConfig` (`card-store.ts`) |
| 5 | Per-project config | `<projectRoot>/.agents/drwn/config.json` | `findProjectConfig` + `loadProjectConfig` (`project.ts`) | `writeProjectConfigForWrite` (`project-writes.ts`) |

Layer 4's on-disk path is gated on `useStoreLayout` (checks `resolveStoreMetadataPath(agentsDir)` existence, `user-config.ts`). When cards-era store metadata exists, machine state lives at `machine.json`; otherwise the legacy `config.json` fallback.

**Precedence.** `buildEffectiveState` (`effective-state.ts`) layers the surfaces:

1. Load packaged config (`repoConfig`).
2. Merge packaged registry with user MCP library via `mergeUserMcpLibrary`.
3. `mergeMachineConfig` shallow-overlays `targets`, `optional`, `defaults`, `catalogs`, `parallel`, and `analyzer` (`user-config.ts`) — produces `machineConfig`.
4. **Critical inversion:** if a project config is present, `baseConfig = repoConfig`, **not** `machineConfig`. Machine-only overlays are deliberately discarded inside a configured project — this is the user-facing guarantee at `knowledges/02_per-project-config-guide.md`.
5. Card manifests resolved from `projectConfig.cards` fold into the project config via `mergeCardManifestsIntoProjectConfig` (`card-project.ts`).
6. The project overlay (with cards merged in) applies via `mergeProjectConfig` (`project.ts`).

### 2.2 Machine defaults

`registry/config.json` is the canonical `CanonicalConfig` baseline. Schema in `types.ts`:

- `version` (required, currently `1`).
- `targets` — `claude`, `codex`, `cursor`, each `{enabled, configPath, format, mcpKey}` where `format ∈ {json-merge, toml-merge, json-standalone}`.
- `defaults` — `{skills?: string[], mcpServers?: string[], extensions?: Record<string, ProjectExtensionConfig>, communityCatalogUrl?: string | null}`.
- `parallel` — `{cli.enabled, mcp.enabled}`.
- `analyzer` — optional analyzer integration config: `apiUrl`, `clientId`, `webBaseUrl`, `maxArchiveBytes` (`types.ts`).
- `catalogs` — `{npmSkills, mcp}`.
- `trustedSources` — `TrustedSourcesPolicy`; card-source allowlist policy enforced at resolution boundaries (`trusted-sources.ts`).
- `optional` — `Record<serverName, boolean>` toggle map.

`loadAnalyzerConfig` (`auth/config.ts`) merges env, effective user/machine config, and packaged config for analyzer settings. No packaged analyzer API default is currently present, so `drwn login` without `DRWN_ANALYZER_URL` or `analyzer.apiUrl` fails with a config-path hint instead of guessing an environment.

The machine layer extends with `MachineConfig` (`types.ts`), adding `authoring.scope` used by `drwn card new` to persist the user's preferred card scope (`card-store.ts`).

Machine config is initialized on first read when missing: `ensureStoreInitialized` writes `{version: 1, optional: {}}` to `machine.json` (`card-store.ts`). `initializeUserConfigFromPackagedDefaults` (`user-config.ts`) seeds `defaults.skills` from the curated inventory and `defaults.mcpServers` from `resolveDefaultMcpNames` (`defaults.ts`) — which filters out `platform-provided`, gates `parallel-search`/`parallel-task` on `parallel.mcp.enabled`, and treats `optional: true` servers as opt-in.

Mutators:

| Mutator | Effect | Source |
|---|---|---|
| `drwn library defaults add skill` | append `defaults.skills` via `addDefaultValue` | `commands/library/defaults/add-skill.ts`, `defaults.ts` |
| `drwn library defaults add mcp` | append `defaults.mcpServers` | `commands/library/defaults/add-mcp.ts` |
| `drwn library defaults remove skill/mcp` | drop via `removeDefaultValue` | `defaults.ts` |
| `drwn card new --scope` | persists `authoring.scope` | `card-store.ts` |

`applyMcpDefaultsToConfig` (`defaults.ts`) rewrites the legacy `optional` map when `defaults.mcpServers` is explicit, keeping the two representations synchronized. `validateDefaultReferences` (`defaults.ts`) is the doctor-side dangling-reference check.

### 2.3 Per-project config

`ProjectConfig` (`types.ts`):

| Key | Type |
|---|---|
| `version` | `number` (must be `1`) |
| `cards` | `string[]` (card refs) |
| `activeWorkers` | `string[]` (ordered active-stack of card names) |
| `servers` | `Record<string, ServerOverride>` |
| `skills.include` | `string[]` |
| `skills.exclude` | `string[]` |
| `hooks.exclude` | `string[]` (policy skips by bare name or `@scope/card:policy`) |
| `hooks.runtimes` | `{ "claude-code"?, codex?, mastra?: {enabled} }` |
| `hooks.signals` | `{ enabled?: boolean }` (session-signal opt-in) |
| `extensions` | `Record<string, ProjectExtensionConfig>` |
| `targets` | `Partial<Record<TargetName, {enabled: boolean}>>` |
| `trustedSources` | `TrustedSourcesPolicy` |

`ServerOverride = {enabled: boolean} | RegistryServer` (`types.ts`); `isServerToggle` discriminates (`project.ts`). `ProjectExtensionConfig` has an escape-hatch `[key: string]: unknown` (`types.ts`) — only `parallel`, `beads`, `markitdown` keys are interpreted by `applyProjectExtensionConfig`.

**Versioning.** `loadProjectConfig` throws on any value other than `1` (`project.ts`). Same enforcement on user config (`user-config.ts`) and MCP library (`mcp-library.ts`). Scaffolding always writes `{version: 1}` (`project.ts`).

**Merge rules** (`project.ts`):

1. Deep-clone `config` and `registry` — neither base is mutated.
2. Skill overrides accumulate via `mergeProjectSkillOverrides` (`extensions/project-config.ts`).
3. For each `project.servers` entry: `{enabled}` toggles write `nextConfig.optional[name]`, deleting or restoring `nextRegistry.servers[name]`; full `RegistryServer` bodies register as new project-local servers.
4. For each `project.targets`: toggle only applies if the target already exists in `nextConfig.targets` — silently ignored otherwise.
5. Extension config flows through `applyProjectExtensionConfig` (`extensions/project-config.ts`), expanding into concrete skill include/exclude + `parallel.mcp.enabled` writes.

When machine and project disagree, **project wins for fields it touches**, but project's mere existence wipes machine-level overlay for `optional`, `defaults`, `catalogs`, `parallel` (the inversion at step 4 of §2.1).

### 2.4 Registry

`registry.ts` is intentionally thin: `loadRegistry`/`saveRegistry` are bare JSON read/write helpers (`registry.ts`). The real registry shape is `CanonicalRegistry` (`types.ts`): `version` + `servers: Record<string, RegistryServer>`. `RegistryServer` (`types.ts`):

```
{ description, transport: "stdio" | "http" | "sse" | "platform-provided",
  command?, args?, env?, url?, provider?, capabilities?, notes?,
  optional: boolean, startupTimeoutSec? }
```

Packaged `registry/mcp-servers.json` ships seven servers: `context7`, `chrome-devtools` (stdio, required), `markdownify`, `parallel-search`, `parallel-task`, `notion`, `slack`.

**Schema gap to flag:** `registry/mcp-servers.json` uses an `auth` field on `notion` and `slack` (`mcp-servers.json`) that is not declared in `RegistryServer` (`types.ts`). It survives because `JSON.parse` is unchecked — invisible to type-aware consumers.

**Transport writers** (`mcp.ts`):

| Target | Writer | Stdio form | URL form |
|---|---|---|---|
| Claude | `mergeClaudeSettingsText` (`mcp.ts`) via `toJsonServerConfig` | `{command, args?, env?}` | `{type: <transport>, url}` |
| Cursor | `renderCursorConfig` (`mcp.ts`) via `toJsonServerConfig` | same as Claude | same |
| Codex | `mergeCodexTomlText` (`mcp.ts`) via `toCodexServerConfig` | `{command, args?, startup_timeout_sec}` (default 30) | `{url, enabled: true}` |

`buildActiveServers` (`mcp.ts`) gates registry+config to writers: if `defaults.mcpServers` is explicit it acts as an allowlist; otherwise filters by `transport !== "platform-provided"`, the parallel toggle, the `optional` flag, and the `optional` boolean map.

`UserMcpLibrary` (`types.ts`) shares the `servers` shape and unions into the registry via `mergeUserMcpLibrary` (`defaults.ts`) — user entries with the same key override; otherwise extend. `validateMcpLibraryServer` (`mcp-library.ts`) enforces transport-specific invariants on read and save.

### 2.5 Library and catalogs

Two unrelated concepts share the word "catalog":

**Library** = machine-local inventory of curated assets. `library.ts` defines `LibrarySkill` and `LibraryMcpServer`. `LibrarySource ∈ {repo, npm, registry, library}` (`library.ts`). The MCP library tracking surface (`mcp-library.ts`) is the authoritative storage for user-registered servers and the only place that branches on store-layout-vs-legacy.

**Catalogs (discovery)** — configured *registries of registries* used for search:

- `catalogs.npmSkills` — npm-backed skill package search via `npm search`; `searchLimit` default 20 (`catalogs.ts`). Enabled by default (`catalogs.ts`).
- `catalogs.mcp` — file/URL-backed MCP catalogs; only `type: "file"` is implemented today; `type: "url"` emits a warning (`catalogs.ts`). Disabled by default in packaged config (`registry/config.json`).

**Card catalogs** are something different: `~/.agents/drwn/catalogs.json` + Git clones under `catalogs/<slug>/`, managed by `card-catalog.ts` and surfaced by `library catalog` / `search card`. Independent subsystem despite the shared word.

Summary: **library** = local inventory (what you have); **catalog** = discovery (what you could find); **defaults** = machine-level selection of which library items become active.

### 2.6 Effective state

`buildEffectiveState` (`effective-state.ts`) is the single function every command consults before reading or writing. It returns `EffectiveState` (`effective-state.ts`) containing:

- As-written: `repoConfig`, `projectConfig`, `lockedCards`.
- As-active: `effectiveConfig`, `effectiveRegistry`, `activeServers`, `skillSelection`, `activeCards`.
- Targets: `scopedOptions` with `writeScope` ∈ `{project, machine}`, `generatedDir`, `recordPath`.

`lockedCards` is every card in `card.lock`; `activeCards` is the active-stack subset selected by `selectActiveCards(lockedCards, projectConfig.activeWorkers)` (`effective-state.ts`). When `activeWorkers` is **absent**, every locked card is active (`return lockedCards`); when it is `[]`, none are; when it is `[names]`, the named cards are returned in that explicit order. Card-manifest overlays, card MCP definitions, and the skill selection that feed downstream merges are all derived from `activeCards`, not `lockedCards` (`effective-state.ts`).

The separation between as-written and as-active is the load-bearing distinction in the codebase: every command renders one or the other, never re-deriving merges itself.

### 2.7 Managed-field discipline

`managed-fields.ts` enforces drift detection on fields and hook entries drwn writes into user-owned files. The `_drwn` meta block (`managed-fields.ts`):

```
{ version: 1, managedKeys, fieldHashes, ownedHooks, lastWriteAt }
```

`canonicalJsonHash` (`managed-fields.ts`) sorts object keys recursively before sha256 so semantically-equivalent edits do not register as drift. `detectManagedFieldDrift` (`managed-fields.ts`) compares recorded vs recomputed hashes for whole managed fields. `ownedHooks` records Claude hook entries by event and stable entry identity so drwn can update or clean only the hook entries it created while preserving foreign entries under the same `hooks` key.

`mergeClaudeSettingsText` (`mcp.ts`) writes the block into Claude settings. On each MCP write: parse current file → read prior `_drwn` block → abort if any managed MCP field/server has drifted unless `--force` → rewrite the owned MCP projection → persist fresh meta via `buildDrwnMetaBlock`. When hook materialization passes a `hooks` option, the same writer merges desired drwn-owned hook entries into the existing `hooks` object, compares only entries recorded in `ownedHooks`, and removes only previously owned entries that are no longer desired. `lastWriteAt` is preserved when field hashes and hook ownership are unchanged so timestamps reflect actual content changes.

`mergeCodexTomlText` does not use the meta block — it rewrites the entire `mcp_servers` section via `stripTomlSections` (`mcp.ts`), a coarser discipline without drift detection. Cursor uses `json-standalone` format with a symlink (`registry/config.json`), so drwn owns the whole file and the protocol is unnecessary.

The write-record (`write-record.ts`) carries a `managed-fields` variant that mirrors the on-disk meta block — the cross-file ledger consulted by `status` and `doctor`.

---

## 3. Card subsystem

The card subsystem is the architectural centerpiece: a Git-backed package manager whose units of distribution wrap skills, MCP definitions, target enablement, and project extensions into immutable semver-versioned bundles.

### 3.1 Lifecycle: source → published → consumed

| State | Location | Mutability | Owner |
|---|---|---|---|
| Source | `~/.agents/drwn/sources/<scope>/<name>/` | mutable working tree | `card new`, `card source *` |
| Published | `~/.agents/drwn/cards/<scope>/<name>.git/` bare repo + `~/.agents/drwn/extracted/<tree-sha>/` | immutable per `v<version>` tag | `card publish` |
| Consumed | `<project>/.agents/drwn/config.json` cards + `card.lock` | versioned reference | `card add/apply/pin/update/remove/detach` |

**Source → Published.** `publishCard` (`card-store.ts`):

1. Read `card.json` from source dir.
2. Validate every `skills.include` has a `skills/<name>/SKILL.md` (`card-store.ts`).
3. Cross-check `package.json` if present (`card-store.ts`).
4. Lazy-init the bare repo (`card-store.ts`).
5. Refuse duplicate `v<version>` tags (`card-store.ts`).
6. `writeTreeFromDir(barePath, sourceDir)` → tree SHA.
7. `ensureExtracted(treeSha)` materializes the canonical extraction cache (`card-store.ts`).
8. `validatePublishedSkillDirs` on the extracted tree (`card-store.ts`).
9. Compute integrity (`card-store.ts`).
10. `commitTree` with previous `refs/heads/main` as parent (`card-store.ts`).
11. `updateRef("refs/heads/main", commit)` (`card-store.ts`).
12. `createAnnotatedTag("v<version>", commit, ...)` (`card-store.ts`).

**Published → Consumed.** `resolveProjectCards` (`card-project.ts`) calls `resolveCard` per spec, turns each result into a `CardLockEntry`. `writeProjectCards` (`card-project.ts`) rewrites `config.cards` then `writeCardLock` (`card-lock.ts`).

**Consumed → Materialized.** `ensureCardPresentFromLock` (`card-install.ts`) verifies integrity; if missing, re-clones from `git.url`, re-fetches the locked commit, re-extracts. Materialization reads `entry.path` (always pointing into `extracted/<tree-sha>/`, except for `origin: file`).

### 3.2 Card ref grammar

Every consumer-side reference is parsed by `parseCardRef` (`card-store.ts`):

| Form | Example | Origin | Code |
|---|---|---|---|
| `file:<path>` | `file:./fixtures/card` | `file` | `card-store.ts` |
| `git+<url>#<ref>` | `git+https://x/y.git#v1.0.0` | `git` | `card-store.ts` |
| `git+<url>@<range>` | `git+ssh://x/y.git@^1.0.0` | `git` | `card-store.ts` |
| `github:owner/repo#<ref>` | `github:foo/bar#v1` | `git` (→ `https://github.com/...`) | `card-store.ts` |
| `github:owner/repo@<range>` | `github:foo/bar@^1.0.0` | `git` | `card-store.ts` |
| `gitlab:owner/repo#<ref>` / `@<range>` | `gitlab:foo/bar#main` | `git` (→ `https://gitlab.com/...`) | `card-store.ts` |
| `@scope/name@<range>` | `@team/baseline@^1.0.0` | `store` | `card-store.ts` |
| `@scope/name` (bare) | `@team/baseline` | `store`, range `*` | `card-store.ts` |
| `name@<range>` | `baseline@1.0.0` | `store` | `card-store.ts` |
| `name` (bare) | `baseline` | `store`, range `*` | `card-store.ts` |

Subtleties: the parser distinguishes range-marker `@` from host-name `@` by requiring it appear after the last `/` or `:` (`card-store.ts`, `lastGitRangeMarker`). A `git+` ref with neither `#ref` nor `@range` hard-errors (`card-store.ts`). Scope/name patterns are enforced by `isCardScopeName` / `isCardUnscopedName` (`card-manifest.ts`): `/^@[a-z0-9-]+\/[a-z0-9-]+$/` and `/^[a-z0-9-]+$/`. `normalizeCardName` attaches a scope to unscoped names when machine config specifies one (`card-store.ts`).

### 3.3 Resolver pipeline

Entry: `resolveCard(agentsDir, ref)` (`card-store.ts`). Enforces no-legacy-layout, ensures store init, dispatches on `parsed.origin`.

**`file` origin** (`card-store.ts`): read `card.json`, validate, `validatePublishedSkillDirs`, compute integrity over the directory, return `ResolvedCard` with no `git` field.

**`store` origin** — `resolveFromStore` (`card-store.ts`):

1. Bare-repo existence check: missing → `CARD_NOT_FOUND` (`card-store.ts`).
2. `listPublishedVersions` enumerates tags via `git.listTags`, filters to strict `^v\d` (`card-store.ts`).
3. `selectVersion` uses `maxSatisfying` for ranges, falls back to exact match (`card-store.ts`). Invalid range / no match → `CARD_NO_MATCHING_VERSION` (`card-store.ts`).
4. `git.revParse("refs/tags/v<v>^{commit}")` resolves to commit (`card-store.ts`).
5. `resolveRepoVersion` (`card-store.ts`) reads tree SHA via `git.getCommitTree`, `ensureExtracted` materializes, manifest+integrity recomputed, returns `origin: "store"`.

**`git` origin** — `resolveFromGit` (`card-store.ts`), three branches:

1. **Existing bare repo by URL** (`card-store.ts`): `findBareRepoByOriginUrl` scans `cards/` for `drwn.originUrl` match (`card-store.ts`). On hit, fetch `refs/heads/* + refs/tags/*`, resolve, refresh `url-card-map.json`.
2. **URL→name cache hit** (`card-store.ts`, `tryResolveFromCachedGitName` at `card-store.ts`): read cached name from `url-card-map.json`; if the bare repo for that name exists and `drwn.originUrl` matches, fetch + resolve. If missing, clone fresh. `CARD_NAME_MISMATCH` (stale cache) → fall through to discovery.
3. **First-time discovery** (`card-store.ts`): clone bare to a temp `.tmp-<rand>.git` path, resolve to discover `manifest.name`, check canonical path for collision — existing repo with different `drwn.originUrl` → `CARD_NAME_COLLISION` (`card-store.ts`). If clean, rename temp into place, stamp `drwn.cardName` and `drwn.originUrl` (`card-store.ts`), persist URL→name mapping (`card-store.ts`).

`resolveGitRepoAtParsedRef` (`card-store.ts`) does per-repo work: enumerate tag versions, pick via range or explicit `gitRef`, hard-fail with `CARD_NO_MATCHING_VERSION` if neither satisfiable. After extraction, the name is cross-checked against `expectedName`; mismatch raises `CARD_NAME_MISMATCH` (`card-store.ts`).

**Typed error codes** at resolver chokepoints:

| Code | Site | Trigger |
|---|---|---|
| `CARD_NOT_FOUND` | `card-store.ts` | store origin, no bare repo |
| `CARD_NO_MATCHING_VERSION` | `card-store.ts` | range matches no published tag |
| `CARD_NAME_COLLISION` | `card-store.ts` | URL→name collides with bound repo |
| `CARD_NAME_MISMATCH` | `card-store.ts` | discovered manifest name diverges from cached/expected |

### 3.4 Lockfile schema (v2 / v3 / v4 / v5)

Location: `<project>/.agents/drwn/card.lock` (`card-lock.ts`). Schema (`card-lock.ts`):

```
CardOrigin = "store" | "git" | "file" | "npm"

GitLockInfo { url?, ref?, commit (40-hex) }

CardLockEntry {
  name, requested, version, path, integrity (sha256-<hex>),
  manifest: CardManifest, skills: string[], hooks: string[],
  hookConsent?: { consentedAt, consentedRange },
  registry: null, origin: CardOrigin, git?: GitLockInfo
}

CardLockfile { lockfileVersion: 2 | 3 | 4 | 5, store?: { minDrwnVersion? }, cards: CardLockEntry[] }
```

The schema accreted across versions: v2 is the base card/skill lock; v3 adds `hooks: string[]` plus optional `hookConsent`. Versions `4` and `5` are accepted for read-compatibility; `writeCardLock` emits `5` (`card-lock.ts`).

**Validation** (`card-lock.ts`):

| Field | Rule | Code |
|---|---|---|
| `lockfileVersion` | literal `2`, `3`, `4`, or `5` | `card-lock.ts` |
| `cards` | array | `card-lock.ts` |
| `origin` | one of `store \| git \| file \| npm` | `card-lock.ts` |
| `name`, `requested`, `version`, `path`, `integrity` | non-empty strings | `card-lock.ts` |
| `manifest` | passes `assertValidCardManifest` | `card-lock.ts` |
| `skills` | `string[]` | `card-lock.ts` |
| `hooks` | `string[]` (required at `lockfileVersion >= 3`; older locks read as `[]`) | `card-lock.ts` |
| `hookConsent` | optional `{consentedAt (ISO), consentedRange}` | `card-lock.ts` |
| `registry` | literal `null` (reserved Wave 3+) | `card-lock.ts` |
| `git` | required for `store`/`git`, forbidden for `file`/`npm` | `card-lock.ts` |
| `git.commit` | `/^[a-f0-9]{40}$/` | `card-lock.ts` |

`writeCardLock` (`card-lock.ts`) emits `lockfileVersion: 5` and writes `store.minDrwnVersion` — `0.3.0` (`HOOKS_MIN_DRWN_VERSION`).

**Version floor enforcement.** `evaluateVersionFloor` (`card-lock.ts`) compares `store.minDrwnVersion` from the lockfile against the running `DRWN_VERSION` and returns a `VersionFloorStatus` with `{required, running, satisfied}`. `drwn write` evaluates this before materialization; an unsatisfied floor emits a warning to stderr, and `--strict` turns it into a hard failure (exit 1). `formatVersionFloorWarning` produces the human-readable message.

**Integrity verification** by `computeCardIntegrity` (`card-store.ts`): walks version dir, skips `.integrity` and `.git/`, hashes each file content (sha256), builds canonical sorted JSON of `{p, m, h}` (where `m = "x"` if any executable bit else `"-"`), returns `sha256-<sha256(canonical)>`. `ensureCardPresentFromLock` re-runs the hash after extraction; mismatch → `INTEGRITY_MISMATCH` (`card-install.ts`). For `file` origins, present-but-different content triggers the same error (`card-install.ts`).

**Origin semantics in install:** `file` must exist on disk (`card-install.ts`); `npm` rejected with `CARD_NPM_NOT_IMPLEMENTED` (`card-install.ts`); `store`/`git` require `git.commit` plus either an existing bare repo or `git.url` (`card-install.ts`). `--frozen` blocks any clone, fetch, or path-change side effect (`card-install.ts`).

### 3.5 Manifest schema

`CardManifest` (`card-manifest.ts`) is the authoring + consumer contract:

| Field | Type | Required | Validation | Source |
|---|---|---|---|---|
| `$schema` | string | no | none | `card-manifest.ts` |
| `name` | string | yes | scope `@a-z0-9-/a-z0-9-` or unscoped `a-z0-9-` | `card-manifest.ts` |
| `version` | string | yes | strict semver | `card-manifest.ts`, `semver-utils.ts` |
| `description` | string | no | free text | `card-manifest.ts` |
| `license` | string | no | free text | `card-manifest.ts` |
| `harness.minVersion` | string | no | strict semver | `card-manifest.ts` |
| `bundles` | `Record<string, string>` | no | every range satisfies `semver.validRange` | `card-manifest.ts` |
| `skills.include` | `string[]` | no | array | `card-manifest.ts` |
| `skills.exclude` | — | **rejected** | "skills.exclude is not allowed in card manifests" | `card-manifest.ts` |
| `skills.shared` | `string[]` | no | must be array; must be **empty** today (reserved Wave 2 — registry references) | `card-manifest.ts` |
| `hooks.include` | `string[]` | no | array; `hooks.exclude`/`hooks.shared` rejected | `card-manifest.ts` |
| `persona` / `beliefs` / `memory` | — | **rejected** | "persona/beliefs/memory is no longer supported; advanced context management (persona/beliefs/memory) moved to a separate capability card" | `card-manifest.ts` |
| `servers` | `Record<string, ServerOverride>` | no | schema-level: none | `card-manifest.ts` |
| `extensions` | `Record<string, ProjectExtensionConfig>` | no | schema-level: none | `card-manifest.ts` |
| `targets` | `Partial<Record<TargetName, {enabled}>>` | no | keys ∈ `claude \| codex \| cursor` | `card-manifest.ts` |
| `stability` | `"experimental" \| "stable" \| "production"` | no | enum-checked | `card-manifest.ts` |
| `lastValidatedWith` | string | no | strict semver | `card-manifest.ts` |
| `testStatusBadge` | string | no | `http:` or `https:` URL | `card-manifest.ts` |

Quality fields (`stability`, `lastValidatedWith`, `testStatusBadge`) surface in `card show` (`commands/card/show.ts`) and are writable via `card source set` (`commands/card/source/set.ts`, `card-source.ts`).

`skills.shared` is the **reserved namespace** for future registry references — non-empty arrays are rejected today (`card-manifest.ts`).

`assertValidCardManifest` (`card-manifest.ts`) is the assertion used by `card-store`, `card-lock`, `card-source`, and `url-card-map`.

### 3.6 Git plumbing

`cli/core/git.ts` is the **only** module that runs the `git` binary. It wraps `Bun.spawn` (`git.ts`) with a per-call timeout (`DRWN_GIT_TIMEOUT_MS`, default 30s, `git.ts`) and a stderr-classifying error taxonomy.

**Error taxonomy** (`git.ts`):

| Class | Stderr pattern |
|---|---|
| `GitAuthError` | `authentication`, `permission denied`, `access denied`, `could not read username`, `repository not found` |
| `GitNetworkError` | `unable to access`, `could not resolve host`, `failed to connect`, `network is unreachable`, `connection refused` |
| `GitRefNotFoundError` | `unknown revision`, `bad revision`, `not a valid object name`, `ambiguous argument`, `couldn't find remote ref`, `not found` |
| `GitError` | fallback |

**Surface**:

| Function | Site | Purpose |
|---|---|---|
| `runGit` / `runInRepo` | `git.ts` | spawn `git`, with/without `--git-dir` prefix |
| `initBare` | `git.ts` | `git init --bare` |
| `cloneBare` | `git.ts` | `git clone --bare` (optional `--depth`) |
| `fetch` / `push` | `git.ts` | refspec-driven |
| `revParse` / `catFileType` / `getCommitTree` | `git.ts` | object plumbing |
| `configGet` / `configSet` | `git.ts` | drwn-specific keys (`drwn.cardName`, `drwn.originUrl`, `drwn.deprecated.<v>`) |
| `lsRemote` | `git.ts` | parse remote ref listing |
| `writeTreeFromDir` | `git.ts` | `add -A` + `write-tree` against a **temp index** (`GIT_INDEX_FILE` env, `git.ts`) — bare repo's index never touched |
| `commitTree` | `git.ts` | identity injected via env (`drwn`/`drwn@example.local`) |
| `updateRef` / `createAnnotatedTag` / `listTags` | `git.ts` | branch + tag plumbing |
| `extractTreeToDir` | `git.ts` | `git archive | tar -xf` via temp tar |
| `remoteAdd/Set/Remove/List` | `git.ts` | parse `remote -v` fetch lines |
| `log` / `diff` / `showBlob` | `git.ts` | structured log via `\x1f`/`\x1e` separators |
| `moveRepoAtomically` | `git.ts` | atomic rename of staged bare repos |

**Card-store usage:**

- **Bare-repo init on publish:** `publishCard` lazy-creates, writes `drwn.cardName` (`card-store.ts`).
- **Publish flow** (`card-store.ts`): `writeTreeFromDir` → `ensureExtracted` (calls `git.extractTreeToDir`) → `revParseOptional("refs/heads/main")` for parent → `commitTree` → `updateRef` → `createAnnotatedTag`.
- **Fetch flow** (`resolveFromGit`): `git.fetch(barePath, "origin", ["refs/heads/*:refs/heads/*", "refs/tags/*:refs/tags/*"])`. Top-level `card fetch` uses the same refspec (`commands/card/fetch.ts`).
- **Push flow** (`commands/card/push.ts`): `git.push(barePath, remote, ["refs/heads/main", "--tags"])` — main and tags only; the local `[drwn]` config never travels.
- **Tree extraction** is content-addressed: `ensureExtracted` (`card-store.ts`) extracts to temp then `rename`s to `extracted/<tree-sha>/`, with race tolerance: if rename fails but the destination exists (concurrent write), it succeeds silently (`card-store.ts`).
- **Deprecation** is config-only and reversible: `git.configSet(barePath, "drwn.deprecated.<v>", message)` (`card-store.ts`). Content is never rewritten.

### 3.7 URL→name mapping cache

`cli/core/url-card-map.ts` persists `~/.agents/drwn/url-card-map.json` (`url-card-map.ts`):

```
UrlCardMapFile { mapVersion: 1, entries: Record<url, { name, url, discoveredAt }> }
```

Populated by every successful `resolveFromGit` branch — existing-bare-repo (`card-store.ts`), cache-hit, first-time discovery. Read at the start of `resolveFromGit` (`card-store.ts`) to short-circuit temp-clone discovery.

Treated as an **optimization, not a source of truth**: malformed entries dropped silently (`url-card-map.ts`); cache-hit explicitly catches `CARD_NAME_MISMATCH` (`card-store.ts`) and returns `null` to fall through to fresh discovery.

### 3.8 Card-source authoring surface

Eleven subcommands under `cli/commands/card/source/*` mutate or read authoring state owned by `cli/core/card-source.ts`. The read commands (`list`, `show`, `doctor`), `set` (manifest field patches), and `sync` (upstream skill provenance sync) sit alongside paired add/remove commands for each card artifact class — skills, MCP servers, and hook policies (§3.10):

| Subcommand | Core function | Mutates |
|---|---|---|
| `source list` | `listCardSources` | read |
| `source show` | `readCardSourceState` | read |
| `source doctor` | `doctorCardSource` | read |
| `source set` | `patchCardSourceManifest` | `card.json` field patches |
| `source sync` | `syncCardSource` | `skills/<n>/` from upstream git provenance refs |
| `source add-skill` / `remove-skill` | `addCardSourceSkill` / `removeCardSourceSkill` | `card.json` `skills.include` + `skills/<n>/` dir |
| `source add-mcp` / `remove-mcp` | `addCardSourceMcp` / `removeCardSourceMcp` | `card.json` `servers` + `mcp-servers/<id>.json` |
| `source add-hook` / `remove-hook` | `addCardSourceHook` / `removeCardSourceHook` | `card.json` `hooks.include` + `hooks/<policy>/` dir |

Every mutator accepts `--dry-run` and `--json`.

**`source set` accepts** (`commands/card/source/set.ts`): `--description`, `--version`, `--license`, `--harness-min-version`, `--stability`, `--last-validated-with`, `--test-status-badge`. (Doc 01 currently lists only a subset — see audit doc 54.)

**Dry-run discipline.** Every mutation helper accepts `dryRun?: boolean`; when true, it computes the change list (so `--json` output matches a real run) but skips `assertStoreWritable()` and the filesystem write. Read-only helpers do not accept dry-run — they never write.

**Read-only enforcement.** Every write helper calls `assertStoreWritable()` (`store-paths.ts`) inside the `if (!dryRun)` branch. Same gate at `card-store.ts` (`createCardSource`, `ensureExtracted`, `publishCard`, `deprecateCardVersion`), `card-catalog.ts`.

**Diagnostics.** `readCardSourceState` produces a structured listing: `orphaned_skill_dir`, `missing_skill_dir`, `missing_skill_md`, `package_name_mismatch`, `package_version_mismatch`, invalid MCP JSON, `mcp_manifest_divergence` (via canonical JSON comparison, `card-source.ts`).

**Capture flow.** `card new --from-project` (`commands/card/new.ts`) dispatches to `captureProjectAsCard` (`card-capture.ts`): runs `buildEffectiveState`, creates a fresh source via `createCardSource`, copies every selected (include minus exclude) skill into `skills/<name>/` via the layered skill resolver (`card-capture.ts`), writes a captured `card.json` with `version` hardcoded to `"0.1.0"` (`card-capture.ts`). On failure, cleans up the partial source (`card-capture.ts`).

### 3.9 Card-as-consumer surface

| Command | Purpose | Dispatch |
|---|---|---|
| `card add <spec>` (alias `add`) | append one spec, rewrite lock; reject duplicates by name | `addProjectCardSpec` (`card-project.ts`) |
| `card apply <specs...>` (alias `apply`) | replace `config.cards` wholesale; rewrite lock | `applyProjectCardSpecs` → `writeProjectCards` (`card-project.ts`) |
| `card pin <spec>` | upsert one spec by name; rewrite lock | `pinProjectCardSpec` (`card-project.ts`) |
| `card update` (alias `update`) | re-resolve every card entry; rewrite lock | `updateProjectCardLock` (`card-project.ts`) |
| `card outdated [--check] [--fetch] [--json]` | diff lock versions against highest local; optional pre-fetch | `findOutdatedProjectCards` (`card-project.ts`); parallel `git.fetch` with `pMap` (`commands/card/outdated.ts`) |
| `card remove <name>` | drop one card; rewrite lock | `removeProjectCard` (`card-project.ts`) |
| `card detach` | clear `config.cards = []`; preserve overlay | `detachProjectCards` (`card-project.ts`) |
| `card clone <git-ref>` | resolve & cache a `git+`/`github:`/`gitlab:` ref locally | `resolveCard` (`commands/card/clone.ts`) |
| `card publish <name>` | publish source to bare repo + tag | `publishCard` (`commands/card/publish.ts`) |
| `card catalog publish <ref> --catalog <scope\|url\|path> --mode <local\|direct>` | upsert one catalog entry; local mode writes only, direct mode commits and pushes catalog JSON | `publishCardToCatalog` (`card-catalog-publish.ts`) |
| `card push <name> [--remote]` | push `refs/heads/main` + `refs/meta/*` + `--tags` to the card's Git remote | `git.push` (`commands/card/push.ts`) |
| `card fetch <name> [--remote]` | fetch heads + tags | `git.fetch` (`commands/card/fetch.ts`) |
| `card validate <ref>` | resolve + integrity-check; typed error codes in JSON | `resolveCard` (`commands/card/validate.ts`) |
| `card diff <a> <b>` | structural manifest classification + raw `git diff` | `diffCards` + `git.diff` (`commands/card/diff.ts`) |
| `card list` | enumerate `cards/` bare repos with versions | `listCards` (`card-store.ts`) |

### 3.10 Card hooks

Card hooks add a third card artifact class beside skills and MCP server definitions. The target architecture is analysis 60 (`.ai/analyses/60_drwn-card-hooks-target-architecture.md`). Authors declare policy modules in `card.json` as `hooks.include: string[]`; each policy lives at `hooks/<policy>/policy.ts` and imports the public `darwinian-minds/hook-policy` subpath.

The source commands `card source add-hook` and `card source remove-hook` mutate both `card.json` and the `hooks/<policy>/` directory. `card source doctor` checks missing hook directories, missing `policy.ts`, orphaned hook directories, and best-effort TypeScript build failures.

Publishing validates every declared hook path in the source tree and again in the extracted tree. Hook locking arrived at schema v3: each `CardLockEntry` carries `hooks: string[]` and optional `hookConsent`. Older v2 lockfiles read as `hooks: []`; writes emit v5 (§3.4).

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

| `card show <ref>` | resolved card + `git.log --max-count=10`; surfaces quality fields | `resolveCard` + `git.log` (`commands/card/show.ts`) |
| `card status [--explain]` | project specs + locked versions + outdated table | `readProjectCardStatus` (`card-project.ts`); `explainStatus` (`diagnostics.ts`) |
| `card deprecate <ref> [--message]` | set `drwn.deprecated.<v>` config | `deprecateCardVersion` (`card-store.ts`) |
| `card remote add/set/remove/list` | manage bare repo `[remote "<n>"]` + `drwn.originUrl` | `commands/card/remote.ts` |

`card catalog publish` is producer-side catalog authoring. It resolves the card
ref, validates the installable Git URL in an isolated temp store, validates the
target `catalog.json`, refuses duplicate entries unless `--replace`, and sorts
entries by name for stable diffs. `--mode direct` accepts a registered catalog
scope, Git URL, or clean local checkout; it commits `catalog.json`, pushes the
current branch to `origin`, and best-effort refreshes a registered catalog cache.

Every mutating consumer command supports `--write` to chain into `syncRepository` via `runChainedWrite` (`project-command.ts`). Errors from the chained write go to stderr; the lock mutation has already succeeded.

### 3.10 Card-skill resolver

`cli/core/card-skill-resolver.ts` is the single authority that turns a skill name into a filesystem path with provenance. Used by `syncSkills`, `card-capture`, and diagnostics.

Resolution order is **fixed** (`card-skill-resolver.ts`):

1. **Locked card**: scan `lockedCards` for any entry whose `skills` array includes the name. On match, return `{layer: "card", cardName, cardVersion, path: join(card.path, "skills", name)}`. If the path doesn't exist on disk, return `{layer: "missing", reason: "card store is corrupt for <name>@<v>... Re-run \`drwn card update\`"}` — a corrupt store does **not** silently fall through to user defaults.
2. **User default**: `findAvailableSkill(repoRoot, agentsDir, name)` hunts repo-native then npm packages. Returns `{layer: "user-default", path, scope}`.
3. **Missing**: explicit error path with actionable message.

**Invariant: cards win over user-defaults, always.** A card that declares a skill in `skills.include` shadows any user-default skill of the same name. There is no "merge" semantic; the returned path is single-source.

### 3.12 Worker subsystem

A **worker** is the runtime unit materialized from an installed card: its skills, hooks, and MCP server definitions composed into a self-contained bundle for downstream tools. The subsystem layers two concerns on top of the card lifecycle: an activation stack and worker materialization.

**Activation stack (`drwn worker stack [use|clear]`).** Installing a card via the consumer surface (§3.9) writes it into `card.lock` but does not by itself decide which workers are *active*. The active stack lives in `project.activeWorkers` (`types.ts`) and is managed by three commands (`cli/commands/worker/stack/*`):

- `worker stack` enumerates installed workers and the ordered active stack (read; `readInstalledWorkers`, `stack/list.ts`).
- `worker stack use <names...>` validates that each name is installed, then persists `activeWorkers = [names]` as an **ordered** stack (`stack/use.ts`).
- `worker stack clear` sets `activeWorkers = []` without touching installed cards or generated bundles (`stack/clear.ts`).

`selectActiveCards(lockedCards, activeWorkers)` (`effective-state.ts`) gives the three-way semantics consumed by every write: **absent** `activeWorkers` ⇒ all installed cards active; `[]` ⇒ none active; `[names]` ⇒ exactly those cards, in that order. `worker stack use`/`worker stack clear` change projection only — the active stack governs which cards' skills/MCP/hooks project into the merged downstream config via `activeCards` (§2.6); the per-worker bundles below materialize over `lockedCards` regardless. The next `drwn write` re-materializes; installed bundles persist.

**Materialization (`syncWorkers`, `worker-generator/sync-worker.ts`).** `drwn write` runs `syncWorkers` over `state.lockedCards` whenever a project root exists (`sync.ts`). One isolated bundle is materialized per installed card at `generated/workers/<scope?>/<name>/` (`materializeWorker`, `sync-worker.ts`): skill directories as symlinks into the extracted card store, an optional `mcp/servers.json`, consent-gated hook composers under `hooks/<runtime>/`, and a `worker.json` index (`{name, version, integrity, path, skills, hooks, servers}`). A top-level `generated/workers.json` registry (`{version, workers[]}`) indexes every per-worker bundle, sorted by name.

---

## 4. Skills, bundles, extensions, library

### 4.1 Skill resolution layers

Lookup-style commands use `findAvailableSkill` (`skills.ts`); write-time materialization uses `resolveSkillSource` (`card-skill-resolver.ts`, see §3.10).

**Effective resolution order at write-time:**

1. Any locked card that lists the skill in its manifest (`card-skill-resolver.ts`).
2. Repo-native: `shared` → `claude-only` → `codex-only` → `experimental` (`skills.ts`).
3. The first npm bundle whose `bundle.json` declares the skill (`skills.ts`).

There is **no scope-based promotion across layers** — repo `shared` and a bundle's `shared` skill are both legal sources; first found wins. Card layer always beats both at write-time; at lookup-time `findAvailableSkill` is card-blind.

**Curated publication layer.** Independently of resolution, `<agentsDir>/skills/<name>` is a symlink farm. `syncSkills` walks it and treats every entry as a desired claude/codex target (`skills.ts`). Carries `layerLabel: "user-default"`.

**Dedupe semantics.** When two layers offer the same name, `recordIntent` keeps the most recent intent and records the previously-seen `layerLabel` in `alsoAvailable` (`skills.ts`). Cards are written after curated entries inside `syncSkills`, so a card source wins but the curated layer is announced as `also available`. The change log reads `← card foo@1.0.0 (also available: user-default)` (`skills.ts`).

**Project-local layer.** No per-project `skills/` directory feeds resolution. Projects influence skills only through `project.skills.include`/`exclude` and `project.cards[]`, both folded into `skillSelection.include` inside `buildEffectiveState` (`effective-state.ts`).

**Write-time hard-fail on unresolved `skills.include`.** `syncSkills` resolves every requested include up front; any `layer: "missing"` throws before touching the FS (`skills.ts`):

```
drwn write cannot resolve all skills:
  - <name>: <reason>
  - ...
```

Two reason templates: card-store corruption (`card-skill-resolver.ts`) and no provider at all.

### 4.2 Skill source data model

A repo skill is a directory under `<repoRoot>/skills/<scope>/<name>/` (`paths.ts`). Runtime types:

```
RepoSkill { name, scope: "shared"|"claude-only"|"codex-only"|"experimental", path }
SkillInventoryItem extends RepoSkill { curated, claudeLinked, codexLinked, sourceType?, sourceId?, sourceVersion? }
```

`buildSkillInventory` merges repo + bundle inventories, computes link status against `resolveToolPaths(homeDir)` (`skills.ts`), and treats `shared` skills as linked via the curated path and `claude-only`/`codex-only` skills as linked directly to the repo path.

**Curation as symlink mutation.** `curateSkill` validates the name, refuses non-`shared`, removes any existing entry, then symlinks `<agentsDir>/skills/<name>` to the source path (`skills.ts`). `uncurateSkill` removes the link, refusing if absent. No JSON state file backs the curated layer — membership is exactly the directory entries in `<agentsDir>/skills/` (`skills.ts`).

**Name validation.** `validateSkillName` rejects path separators, `.`, and `..` (`skills.ts`). Duplicated inside `validateBundleManifest` (`skill-packages.ts`) so a bundle cannot register a name that would escape the curated path.

### 4.3 Skill packages (npm-backed bundles)

`BundleManifest` (`types.ts`):

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | number | Must equal `1` (`skill-packages.ts`) |
| `bundleName` | string | Must equal npm package name (`skill-packages.ts`) |
| `version` | string | Must equal npm version (`skill-packages.ts`) |
| `displayName?` | string | Optional metadata |
| `description?` | string | Optional metadata |
| `skills[]` | `BundleSkillEntry[]` | Each `{name, scope, path}` (`types.ts`) |

Each entry's `path` must (a) resolve inside the bundle root (`skill-packages.ts`), (b) exist, (c) contain `SKILL.md`. Names collide-check against the inventory snapshot passed in by the caller.

**Ingestion pipeline** (`ingestSkillPackage`, `skill-packages.ts`):

1. `mkdtemp` two scratch dirs (`tmpdir()`).
2. `npm pack <spec> --ignore-scripts --json --pack-destination <packDir>` via `Bun.spawn`.
3. Parse `npm pack` JSON; take first entry's `{name, version, filename}`.
4. `tar -xf <packDir>/<filename> -C <extractDir>`.
5. Validate `<extractDir>/package/bundle.json` via `validateBundleManifest`.
6. Atomic install: `mkdir -p packageRoot` → remove stale `versionRoot` → `rename(extractDir/package, versionRoot)` → repoint `current` symlink.
7. `finally` cleans both scratch dirs.

**Store paths.** Default: `<agentsDir>/packages/skills/<package>/<version>/` + `current` symlink (`paths.ts`). When store layout marker exists (`useStoreSkillLayout`, `skill-packages.ts`), routes through `store-paths.ts` equivalents (`skill-packages.ts`). Both shapes follow `<pkg>/<version>/` + `current → <version>`.

**Discovery.** `listInstalledSkillBundles` recursively walks the packages root; at each dir checks for a `current` symlink and reads its manifest (`skill-packages.ts`). Scoped packages handled by recursion + `relative()`.

**`drwn skills packages add`** (`commands/skills/packages/add.ts`): snapshot inventory, call `ingestSkillPackage`, print `name@version` or full JSON. Does not curate, does not write project, does not touch any project. The user must then `drwn skills curate`, `drwn add skill`, or `drwn library defaults add skill`.

**Plug-back into resolver.** Three paths: `buildSkillInventory` merges bundles in (`skills.ts`); `findPackageSkill` is the fallback inside `findAvailableSkill` (`skills.ts`); `syncSkills` materializes via `versionRoot/path` after `resolveSkillSource` returns `layer: "user-default"` (`skills.ts`).

### 4.4 Extensions registry

Three extensions are hard-coded in `cli/core/extensions/registry.ts`:

| ID | Display | Scopes | Default modes | Required CLIs | Skills (default-included) | MCP |
|---|---|---|---|---|---|---|
| `beads` | Beads | project | cli, skills, hooks | `bd` (req), `beads-mcp` (opt) | `beads-task-tracking` (not default) | `beads` (project, off) |
| `parallel` | Parallel | global, project | cli, skills | `parallel-cli` (req) | `parallel-web-search`, `parallel-web-extract`, `parallel-deep-research`, `parallel-data-enrichment` | `parallel-search`, `parallel-task` (global, off) |
| `markitdown` | MarkItDown | global, project | cli, skills | `markitdown` (req), `uv` (opt) | `markitdown-document-conversion` | none |

`ExtensionDefinition` source type at `types.ts`. `listExtensions` returns a defensive copy (`registry.ts`); `getExtension(id)` looks up by id.

**Per-extension files** (`cli/core/extensions/`):

- `beads.ts` — plans `bd init` + per-target `bd setup --check` + `bd setup` invocations (`beads.ts`); sequential execution with first-failure short-circuit; `ensureProjectSkillInclude` adds `beads-task-tracking` to `project.skills.include`.
- `parallel.ts` — config-only: `buildParallelProjectConfig({skills, mcp})` writes `{enabled: true, skills, mcp}` (`parallel.ts`). No external commands.
- `markitdown.ts` — plans a single `uv tool install --python 3.12 markitdown[all]`, conditioned on `installApproved && uvAvailable` (`markitdown.ts`). When `uv` is missing, emits an instructional warning rather than throwing.
- `commands.ts` — `findCommand` PATH-walks via `access(X_OK)` (`commands.ts`); `runExternalCommand` spawns and captures stdout/stderr/exit.
- `project-config.ts` — translates per-extension project settings into skill include/exclude + canonical config side effects (`project-config.ts`).

### 4.5 Project opt-in/out

`ProjectExtensionConfig` is free-form under `project.extensions[<id>]` (`types.ts`): `{enabled?, skills?, mcp?, targets?, includeSkill?, [k]: unknown}`.

Application semantics (`extensions/project-config.ts`):

- **Parallel:** `enabled: false` clears both CLI and MCP flags and excludes every Parallel skill. Otherwise enables CLI, mirrors `mcp === true` into `config.parallel.mcp.enabled`, routes `skills` into include/exclude.
- **Beads:** `enabled: false` excludes `beads-task-tracking`; `includeSkill === true` adds it; otherwise no skill-set effect.
- **MarkItDown:** `enabled: false` excludes every MarkItDown skill; otherwise routes `skills`.

`mergeProjectConfig` invokes this after merging server + target overrides (`project.ts`).

### 4.6 Extensions doctor and status

**`buildExtensionStatus`** (`extensions/status.ts`) returns per-extension:

- Each declared command resolved via `findCommand` with `{required, available, path, installHints}`.
- Each declared skill against repo skills + curated set: `{name, present, curated}`.
- Each declared MCP server against the merged registry + `buildActiveServers` output: `{name, configured, active}`.
- `available: true` iff every required command is found.
- `scope: extensionScope(definition)` ∈ `global` / `project` / `mixed`.
- When a project config is present: `project: {cwd, configPath, extensionConfigured, extensionEnabled}` and `beadsDirExists` for Beads.
- `warnings` for missing required commands and missing skills.

`buildAllExtensionStatuses` (`status.ts`) parallel-fans `listExtensions()`.

**`buildExtensionDoctorReport`** (`extensions/doctor.ts`) layers on top:

1. Re-derive effective config + registry with the project overlay (`doctor.ts`).
2. Report unknown extension references in `project.extensions`.
3. Promote every missing required command from `warnings` to `issues`.
4. Promote every missing required extension skill to `issues`.
5. For `beads`: require `.beads/` exists; when `bd` is on PATH, run `bd doctor --json` and validate the JSON.
6. For `parallel`: if `parallel.mcp.enabled`, require each declared MCP server in the effective registry; flag any `active`-but-unconfigured.
7. For `markitdown`: if missing, issue install hints; if present, run `markitdown --version` and a stdin smoke conversion.

Report shape: `{id, displayName, issues[], warnings[]}` (`types.ts`).

**Command surface** (`commands/extensions/*`):

- `extensions list` — registry dump.
- `extensions show <id>` — single-definition dump.
- `extensions status [id]` — wraps `buildExtensionStatus` / `buildAllExtensionStatuses`.
- `extensions doctor [id]` — wraps `buildExtensionDoctorReport`, fanning over all when no id.
- `extensions add <id>` — writes semantic project config; suggests matching `setup` in `next:`.
- `extensions setup <id>` — runs external commands. Beads validates `bd` then plans+executes; Parallel writes project config only; MarkItDown resolves install decision (`--install`/`--no-install`/TTY prompt), conditionally installs via `uv`, writes project config, refreshes PATH check.

### 4.7 Library and library defaults

**Library** = local inventory (repo skills + npm packages + built-in MCP registry + user library) exposed via `cli/core/library.ts`. **Defaults** = the subset promoted into `userConfig.defaults.{skills, mcpServers, extensions}`.

**Inventory shape:**

```
LibrarySkill { id, kind: "skill", name, scope, source: "repo"|"npm"|"registry"|"library", sourceId?, sourceVersion?, path, curated }
LibraryMcpServer { id, kind: "mcp", source: "registry"|"library", server: RegistryServer }
```

Built-ins always shadow library entries with the same id (`library.ts`).

**Read commands:**

| Command | What it lists | Source |
|---|---|---|
| `library list [kind]` | repo + npm skills, built-in + library MCP servers; filter `skills`/`mcp`/`tools` | `library/list.ts` |
| `library show <id>` | one skill or one MCP by id; rejects collisions | `library/show.ts` |
| `library catalog list/add/remove/refresh` | Git-backed card catalogs (separate concern) | `library/catalog.ts` |

**Write commands:**

| Command | Effect | Source |
|---|---|---|
| `library add mcp <file>` | merges into `<agentsDir>/library/mcp-servers.json`; rejects built-in collisions; `--replace` to overwrite | `library/add/mcp.ts` |
| `library add skill <pkg>` | calls `ingestSkillPackage` — equivalent to `skills packages add` | `library/add/skill.ts` |

**Defaults commands:**

| Command | Effect |
|---|---|
| `library defaults list` | reads `userConfig.defaults` + merged registry; `{skills, mcpServers, extensions}` with `status: "resolved" \| "missing"` |
| `library defaults add mcp <id>` | validates id via `findLibraryMcpServer`; appends `defaults.mcpServers`; idempotent |
| `library defaults add skill <id>` | refuses non-`shared`; appends `defaults.skills` AND `curateSkill` as a side effect (skipped under `--dry-run`) |
| `library defaults remove mcp <id>` | drops `defaults.mcpServers`; leaves definition intact |
| `library defaults remove skill <id>` | drops `defaults.skills` AND uncurates if link exists |

**How defaults feed effective-state.** `buildEffectiveState` loads machine config (`effective-state.ts`), then bootstraps `skillSelection.include` from `baseConfig.defaults?.skills`. When a project overlay is present, project `skills.include` is appended. Default MCP servers feed `resolveDefaultMcpNames` (`defaults.ts`). `drwn write` consumes via `syncSkills(scopedOptions, state.skillSelection, state.activeCards)` (`sync.ts`).

### 4.8 MCP commands

`drwn mcp list` (`commands/mcp/list.ts`) merges built-in registry with user MCP library (`mergeUserMcpLibrary`), then with project overlay if in scope. Reports `{name, transport, active, targets}` against `buildActiveServers`. Active state is project-aware when `context.projectConfigPath` is set.

`drwn mcp write` is a thin alias for `drwn write --mcp-only` — calls the same `syncRepository` entry with `mcpOnly: true` (`commands/mcp/write.ts`).

`drwn add mcp <name|query>` (`commands/add/mcp.ts`) activates a server in the current project only:

1. If no positional, prompts in a TTY.
2. Looks up via `findLibraryMcpServer` (built-in ∪ user library).
3. If missing and `--yes`, performs a catalog search and accepts only an unambiguous single match.
4. If already an active global default, skips and reports `action: "already-active"`.
5. Otherwise writes a project override: `setProjectServerOverride(cwd, id, server ? {enabled: true} : fullDefinition)` — library-known servers get the cheap toggle; catalog-pulled servers get their full definition inlined.

`drwn add skill <name|query>` (`commands/add/skill.ts`) activates a skill in the current project:

1. Look up via `findLibrarySkill`.
2. If missing and `--yes`: `searchSkills`, require an unambiguous single bundle, `ingestSkillPackage`, then either use an exact name match, the bundle's only skill, or with `--all` every skill in the bundle.
3. Write each chosen id into `project.skills.include` via `includeProjectSkill`.

---

## 5. Write pipeline, diagnostics, search, store

### 5.1 Materialization pipeline (`drwn write`)

`commands/write.ts` is a Clipanion wrapper. Flags (`commands/write.ts`): `--dry-run`, `--json`, `--mcp-only`, `--skills-only`, `--target`, `--force`, `--root` (alias `--user`), `--strict`, `--strict-hooks`. Mutual-exclusion of `--mcp-only`+`--skills-only` and `--root`+`--user`; `--target` validated against `{claude, codex, cursor}` via `isTargetName` (`targets.ts`).

`--root` writes machine defaults to user-scope tool configs and ignores project config. `--strict` fails when the project's `card.lock` requires a newer drwn than the running version (via `evaluateVersionFloor`, see §3.4). `--strict-hooks` fails when card hooks are present but lack valid hook consent.

**`syncRepository`** (`cli/core/sync.ts`) — the engine:

1. `buildEffectiveState(options)` — resolves project root, loads project + card-merged config, computes `effectiveConfig`/`effectiveRegistry`/`activeServers`/`skillSelection`/`activeCards`, picks `scopeRoot`/`writeScope`/`generatedDir` and `recordPath`.
2. Load previous write record and verify its managed paths (`sync.ts`).
3. Run the materialization phases, each appending `changes`/`warnings`/`managedPaths`:
   - **Workers** — `syncWorkers(state)` runs whenever a project root exists(§3.12).
   - **MCP** — `syncMcp` unless `skillsOnly`.
   - **Skills** — `syncSkills(scopedOptions, skillSelection, activeCards)` unless `mcpOnly`.
   - **Hooks** — `syncHooks(state)` unless `mcpOnly` or `skillsOnly`(§3.11).
4. Dedupe `managedPaths`, diff against the previous record, and clean dropped entries via `cleanupRemovedManagedPaths`.
5. Unless dry-run, atomically persist a new write record with `lastWriteHarnessVersion: DRWN_VERSION`(`write-record.ts`).

**Materialization mechanisms:**

| # | Mechanism | Targets | Implementation |
|---|---|---|---|
| 1 | Directory symlink | Claude/Codex skills | `skills.ts` (`syncSkills` recordIntent loop) |
| 2 | `_drwn` meta-block | Claude `settings.json`, Codex `config.toml` | `managed-fields.ts`; consumed by `mergeClaudeSettingsText`/`mergeCodexTomlText` (`sync.ts`) |
| 3 | Generated-file + symlink | Cursor `mcp.json` | `sync.ts` writes `<generatedDir>/cursor-mcp.json`; `ensureFileSymlink`s `.cursor/mcp.json` to it |
| 4 | Generated worker bundles | `generated/workers/<name>/` per-worker + `generated/workers.json` registry | `worker-generator/sync-worker.ts` `syncWorkers` (§3.12) |

**Atomic-mutation discipline.** `writeManagedFile` (`managed-file.ts`) compares current vs next bytes and skips if equal, then backs up any existing file via numbered `.bak`/`.bak.N` before writing. Symlink replacement removes and re-links only when the realpath differs (`skills.ts`). Write-record persistence is `tmp → fsync → rename → fsync(dir)` (`write-record.ts`).

**`--dry-run` path.** Propagated as `state.normalized.dryRun`; gates file writes (`sync.ts`), symlink creation (`skills.ts`), cleanup, and write-record save. **`--mcp-only`** skips the skills branch. **`--skills-only`** skips the MCP branch.

### 5.2 Write records

`write-record.ts`:

| Field | Type | Notes |
|---|---|---|
| `writeRecordVersion` | literal `1` | Reject on mismatch (`write-record.ts`) |
| `lastWriteAt` | ISO timestamp | Set by sync (`sync.ts`) |
| `lastWriteHarnessVersion` | string | Derived from `DRWN_VERSION` (`sync.ts`, `version.ts`) |
| `managedPaths` | `ManagedPath[]` | Three variants |

`ManagedPath` variants:

| `kind` | Extra | Producer |
|---|---|---|
| `symlink` | `target` | `skills.ts` |
| `managed-fields` | `fields`, `fieldHashes` | `sync.ts` |
| `generated-symlink` | `generatedPath` | `sync.ts` |

Location: per-project at `<projectRoot>/.agents/drwn/write-record.json`; per-machine via `resolveGlobalWriteRecordPath`. Choice driven by `effective-state.ts`.

Readers: `syncRepository` (`sync.ts`, `write-record.ts`); diagnostics (`diagnostics.ts`) surfaces presence, corruption, count, last-write timestamp, and last-write harness version in `status --explain` and `doctor`.

### 5.3 Install: lockfile-driven bootstrap

`commands/install.ts`:

1. Require a project root and `card.lock`.
2. `ensureCardPresentFromLock` for every locked entry under concurrency limit, accumulating per-card errors.
3. If any card mutated lockfile-derived metadata, re-persist the lock.
4. On clean fetch: `--no-apply` returns a JSON/text summary without calling `syncRepository`; otherwise fall into `syncRepository`.

Flags:

| Flag | Effect |
|---|---|
| `--frozen` | Passed through; fail rather than clone/fetch/mutate lockfile |
| `--no-apply` | Skip materialization tail |
| `--json` | Emit `{ok, cards, applied, lockfileChanged, sync?, errors?}` |

### 5.4 Init: project scaffold

`commands/init.ts` writes `<project>/.agents/drwn/config.json`. Mode resolved by `resolveInitMode` from flags + TTY.

Flags:

| Flag | Behavior |
|---|---|
| `--guided` | Force interactive when stdin+stdout are TTYs |
| `--minimal` | Alias for prompt-free minimal config |
| `--non-interactive` | Prompt-free minimal config |
| `--force` | Overwrite existing config (passed to `scaffoldProjectConfig`) |
| `--no-default-catalogs` | Skip pre-registering the default Curation Labs community card catalog |

Side effects: scaffold `config.json`; in guided mode, conditional Parallel/Beads extension entries; default community catalog registration for `https://github.com/curation-labs/dm-cards-catalog-v1.git` unless `--no-default-catalogs`; `.gitignore` is read but never mutated — a warning is appended if it excludes `.agents`.

### 5.5 Status and doctor

Both share `cli/core/diagnostics.ts` as the engine.

`status` (`commands/status.ts`) has three mutually exclusive modes:

| Mode | Flag | Engine |
|---|---|---|
| Why-query | `--why <name>` | `answerWhy` (`diagnostics.ts`) |
| Explain | `--explain` | `explainStatus` (`diagnostics.ts`) |
| Default | _none_ | `buildStatusReport` (`diagnostics.ts`); JSON also includes `buildDiagnosticsSections` (`commands/status.ts`) |

`doctor` (`commands/doctor.ts`) calls `buildDoctorReportWithProject` (`diagnostics.ts`) and renders via `renderDoctorReport` or `renderJson`.

**Navigational map of `cli/core/diagnostics.ts`:**

| Surface | Role |
|---|---|
| Imports + types | Cross-references project, card-lock, registry, MCP-library, skills, extensions, migration, write-record |
| `DoctorReport` interface | Output schema for `doctor` |
| `DiagnosticsSections` interface | Output schema for `status --json` / `--explain` |
| `buildStatusReport` | Concise per-target/per-source counts |
| `loadProjectWithCards` | Helper: project config + locked cards + card-merged project config |
| `readWriteRecordStatus` | `{path, present, corrupt, count, lastWriteAt, lastWriteHarnessVersion}` |
| `buildDiagnosticsSections` | Full sections payload for `--explain` and JSON `status` |
| `WhyAnswer` types + `splitWhyQuery` | Parses `"kind:name"` or bare `name` |
| `collectWhyMatches` | Provenance resolver across skills/servers/extensions/targets/cards |
| `explainStatus` | Human-readable explain renderer |
| `answerWhy` | Validates ambiguity, returns single match or error |
| `detectBrokenSymlinks` | lstat-survivor filter |
| `detectStaleSkillSymlinks` | Computes desired Claude/Codex skill sets across curated, scope dirs, resolved card sources; calls `findStaleSymlinks` (`skills.ts`) |
| `detectMcpDrift` | Per-target managed-content drift using merge writers |
| `detectMissingGeneratedFiles` | Cursor-enabled but `cursor-mcp.json` missing |
| `buildDoctorReport` | Machine-scoped doctor report aggregating detectors |
| `buildDoctorReportWithProject` | Project-scoped, plus six project-config issue passes (servers, skills.include/exclude, extensions, targets, card-skill availability) |
| `readDirLinks` | Internal: list non-dotfile symlink names |

**Check categories surfaced:**

| Category | Origin | Module |
|---|---|---|
| Broken skill symlinks | `detectBrokenSymlinks` | `diagnostics.ts` |
| Stale skill symlinks | `detectStaleSkillSymlinks` | `diagnostics.ts` |
| MCP drift (claude/codex/cursor) | `detectMcpDrift` | `diagnostics.ts` |
| Missing generated Cursor file | `detectMissingGeneratedFiles` | `diagnostics.ts` |
| Project config — defaults | `validateDefaultReferences` | `diagnostics.ts`, `defaults.ts` |
| Project config — unknown server / stale override | `buildDoctorReportWithProject` server loop | `diagnostics.ts` |
| Project config — unknown skill | skill availability loop | `diagnostics.ts` |
| Project config — unknown extension | extension loop | `diagnostics.ts` |
| Project config — stale target override | targets loop | `diagnostics.ts` |
| Store status | `getStoreStatus` (delegated) | `diagnostics.ts`, `migration.ts` |
| Write record status | `readWriteRecordStatus` | `diagnostics.ts` |
| Cards configured/locked + unavailable-skill warning | `buildDiagnosticsSections` + project doctor warning loop | `diagnostics.ts` |

### 5.6 Scan (placeholder)

Verified placeholder. `commands/scan.ts` registers under `["scan"]` and emits a hard-coded payload `{implemented: false, changes: [], plannedRole, message: "drwn scan is not implemented yet."}`.

`plannedRole` declares three intentions: inspect existing local agent tool config, report import candidates for library/defaults/project config, avoid writing files unless a future explicit step is added. The command has no `fs`-mutation imports — read-only by construction.

### 5.7 Search

`cli/core/search.ts` composes library + catalog results into a uniform `SearchResult` discriminated by `sourceGroup ∈ {library, catalog}`. `searchSkills` merges `listLibrarySkills` with `searchNpmSkillCatalog`; `searchMcp` merges `listLibraryMcpServers` with `searchMcpCatalog`. Both honor `libraryOnly`/`catalogOnly`.

| Command | Sources |
|---|---|
| `drwn search card` | `searchCardCatalogs` over registered Git-backed catalogs only; `--scope` filter (`commands/search/card.ts`) |
| `drwn search mcp` | Local MCP library + configured online MCP catalogs (`commands/search/mcp.ts`); `--library`/`--catalog` mutually exclusive |
| `drwn search skill` | Local skill library + configured npm-skill catalogs (`commands/search/skill.ts`); same exclusion rule |

### 5.8 Export

`commands/export/sessions.ts`:

1. Resolve realpath'd project root + slug + git-worktree roots.
2. Probe `~/.claude/projects` and `~/.codex/sessions`.
3. Concurrently discover sessions per source.
4. On `--dry-run`, list archive paths only.
5. Otherwise archive to `.agents/drwn/session-log-exports/<utc-ts>.tar[.gz]` or `--out`.

`cli/core/export/session-discovery.ts`:

| Function | Role |
|---|---|
| `resolveProjectRoot` | `git rev-parse --show-toplevel` fallback to cwd, then `realpath` — needed because macOS `/var` ≠ `/private/var` |
| `deriveProjectSlug` | Replace `/` with `-` (Claude's format) |
| `gitWorktreeRoots` | `git worktree list --porcelain` parse |
| `discoverClaudeSessions` | Match `projects/<slug>*/` dirs; archive non-empty `.jsonl` files under `claude/` or `claude/agents/` |
| `discoverCodexSessions` | Read first JSONL line; accept only `session_meta` whose `payload.cwd` is under a project root; archive under `codex/` |
| `readFirstLine` | readline-stream first line so >20KB `session_meta` lines parse |

`cli/core/export/archiver.ts`:

| Function | Role |
|---|---|
| `makeTimestamp` | UTC `YYYYMMDDTHHMMSS` |
| `archiveSessions` | Stage via hardlink (fall back to `copyFile` on `EXDEV`); spawn `tar` with `--no-mac-metadata` on darwin and `COPYFILE_DISABLE=1`; validate members |
| `validateArchiveMembers` | Reject AppleDouble (`._*`), `__MACOSX`, `.DS_Store`, hidden dotfiles, and any member outside `claude/` or `codex/` |
| `listArchiveMembers` | `tar tf` / `tzf` parse |

### 5.9 Store maintenance

| Command | Surface | Source |
|---|---|---|
| `store status` | path, initialized, schemaVersion, cardCount, sourceCount, skillBundleCount, mcpServerCount, legacyLayoutDetected | `commands/store/status.ts` → `getStoreStatus` (`migration.ts`) |
| `store verify` | enumerate each card, call `git.listTags`, return `{ok, cardCount, errors}`, exit 1 on errors | `commands/store/verify.ts` |
| `store migrate` | pre-cards → cards layout via staging+archive | `commands/store/migrate.ts` → `migrateStore` (`migration.ts`) |
| `store migrate-to-git` | per-version dirs → per-card bare Git repos | `commands/store/migrate-to-git.ts` → `migrateCardsToGit` (`store-migrate.ts`) |
| `store gc` | `git gc` in each card bare repo | `commands/store/gc.ts` |
| `store export` | tar of `~/.agents/drwn` to `--out` | `commands/store/export.ts` |
| `store seed` | populate an empty drwn store from a tarball or directory snapshot | `commands/store/seed.ts` → `store-seed.ts` |

**`store migrate` flow:** short-circuit when `detectLegacyLayout` is false (`commands/store/migrate.ts`, `migration.ts`); build `drwn.staging-<ts>/`; copy machine config or seed `{version: 1, optional: {}}` (`migration.ts`); explode MCP library into per-id JSON files; copy skill packages; create empty `cards/`, `sources/`, `generated/`, `extracted/`, `catalogs/`; write `store.json` (schema-version 1); validate staging; archive old layout under `drwn.archive-<ts>`; `rename` staging into the live store.

**`--cleanup-legacy-orphans`** (`commands/store/migrate.ts`) runs `cleanupLegacyOrphans` (`migration.ts`): scans `~/.claude/skills` and `~/.codex/skills` for symlinks whose targets fall under drwn-owned prefixes (`packages/`, `skills/`, current store, archive) and removes only those — non-owned symlinks are explicitly preserved.

**`store migrate-to-git` flow:** list per-version legacy card dirs (`store-migrate.ts`); `assertStoreWritable` when actually mutating; for each card, init a tmp bare repo; per version validate `card.json`, read recorded `.integrity` or fall back to `versions.json`; stage source minus `.integrity`; `writeTreeFromDir` + commit + tag `vN.N.N`; rename bare repo into place and remove the legacy directory. Integrity re-verified against the post-migration extraction.

---

## 6. Vocabulary (locked terms)

| Term | Definition | Authority |
|---|---|---|
| Card | Immutable Git-backed bundle of skills + MCP server defs + target enablement + project extensions | `card-store.ts`, `card-manifest.ts` |
| Source | Mutable working tree at `~/.agents/drwn/sources/<name>/` from which cards are published | `card-source.ts` |
| Published | A `v<version>`-tagged commit in `~/.agents/drwn/cards/<name>.git/` | `card-store.ts` |
| Consumed | A card referenced in a project's `config.cards` and pinned in `card.lock` | `card-project.ts`, `card-lock.ts` |
| Bare repo | Git bare repository under `cards/<name>.git/` | `store-paths.ts` |
| Extracted tree | Content-addressed materialization at `extracted/<tree-sha>/` | `store-paths.ts` |
| Bundle | npm-distributed skill package under `~/.agents/drwn/skills/<package>/<version>/` | `skill-packages.ts`, `bundle.json` |
| Library | Machine-local inventory (curated repo skills + bundles + MCP definitions + registry) | `library.ts` |
| Catalog (discovery) | Configured source of searchable items (npm-skills, mcp, card-catalogs) | `catalogs.ts`, `card-catalog.ts` |
| Catalog publication | Producer-side mutation of a card catalog repo's `catalog.json` | `card-catalog-publish.ts` |
| Defaults | Subset of library promoted into `userConfig.defaults.{skills, mcpServers, extensions}` | `defaults.ts` |
| Effective state | Composed view of repo + machine + library + project + cards for read or write | `effective-state.ts` |
| Managed field | A drwn-owned key inside a user-owned config file, tracked via `_drwn` meta block | `managed-fields.ts` |
| Write record | Per-scope ledger of materializations enabling cleanup + drift detection | `write-record.ts` |
| Resolver | Function turning a card ref or skill name into a concrete on-disk source | `card-store.ts`, `card-skill-resolver.ts` |

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
| `store status/verify/migrate/migrate-to-git/gc/export/seed` | `migration.ts`, `store-migrate.ts`, `store-seed.ts`, `git.ts` |
| `mcp list` | `mcp.ts`, `mcp-library.ts`, `effective-state.ts` |

---

## Appendix B: Module index (`cli/core/*`)

> LOC counts are approximate and may drift between releases.

| Module | LOC | Role |
|---|---|---|
| `home.ts` | 8 | Resolves user home directory uniformly across macOS, Linux, and Windows |
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
| `card-lock.ts` | 135 | `validateCardLockfile`, `readCardLock`, `writeCardLock` (atomic), `evaluateVersionFloor` |
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
| `targets.ts` | 59 | Single source of truth for downstream target names and surface/runtime metadata |
| `secret-store.ts` | 323 | AES-256-GCM secret encryption at rest under an OS-keychain-held key |
| `materialize.ts` | 98 | Copy-based directory materialization and pointer-file writes for OS-uniform sync (replaces symlinks) |
| `version.ts` | 4 | `DRWN_VERSION` — the CLI version stamped into generated metadata |
| `managed-file.ts` | 62 | `writeManagedFile` — drwn-managed writes with `.bak` backups + dry-run reporting; shared by MCP and hook/worker sync |
| `card-mcp.ts` | 51 | Extracts MCP server definitions declared by locked cards, separate from project activation toggles |
| `worker-generator/sync-worker.ts` | 194 | `syncWorkers` — per-worker `generated/workers/<name>/` bundles + `generated/workers.json` registry |
| `hook-generator/sync-hooks.ts` | 270 | `syncHooks` — card hook materialization into per-runtime composers |
| `hook-generator/sync-signals.ts` | 35 | Session-signal hook config builder (`signalHooksConfig`) |
| `hook-generator/bundle-composer.ts` | 127 | Generates runtime-specific hook composer entry scripts |
| `hook-generator/decode-event.ts` | 128 | Decodes Claude/Codex hook event payloads for policy dispatch |
| `hook-generator/encode-decision.ts` | 170 | Encodes policy decisions back into hook runtime format |
| `hook-generator/runtime-selection.ts` | 37 | Per-hook-runtime enablement logic |
| `hook-generator/emit-mastra-composer.ts` | 39 | Mastra-specific composer emitter |
| `hook-policy/` | 213 | Public hook-policy subpath: `define-tool-policy`, `compose-tool-hooks`, `run-with-timeout`, `safe-hook`, types |
| `hook-consent.ts` | 15 | `isHookConsentValid` — whether a locked card has usable hook-execution consent |
| `hook-runner.ts` | 90 | Orchestrates session-signal hooks: sink append + card-usage write-on-change (hot path; reads `card.lock` directly) |
| `hook-signals.ts` | 153 | Pure builders for session-signal records emitted by the hidden `drwn hook` subcommands |
| `card-publish-guardrail.ts` | 46 | Publish-time structural-classification vs declared-version-bump consistency check |
| `catalog-validation.ts` | 63 | Validates upstream card catalog JSON against the shared schema package |
| `trusted-sources.ts` | 153 | Card-source allowlist policy enforced at card + catalog resolution boundaries |
| `authoring-scope.ts` | 110 | Derives a default `@<github-handle>` authoring scope for `drwn card new` |
| `authoring-scope-probes.ts` | 22 | Default probe runners for authoring-scope auto-derivation |
| `mcp-report.ts` | 99 | Write-time visibility computation for optional card-declared MCPs |
| `process.ts` | 89 | Node-compatible process-execution helpers for CLI integrations |
| `store-seed.ts` | 217 | Populates an empty drwn store from a tarball or directory snapshot |

---

## Appendix C: Disagreements with target architecture (analysis 52)

These are points where current code diverges from `analyses/52_drwn-target-architecture-post-wave-1.md`. The code is authoritative; this list exists so future readers can reconcile the target doc when they touch it.

1. **`url-card-map.json` already exists.** Analysis 52 §3.1 (line 195) says "No `url-card-map.json`. URL→name discovery runs on-demand in Wave 1; the persistent mapping cache is a Wave 2 optimization." → Current code at `cli/core/url-card-map.ts` and `card-store.ts` writes and reads this exact file. The §16.3 Wave-2 feature has shipped early.

2. **`card new --from-project` already exists.** §7.4 lists this as a Wave-2 capture flow. → It exists today (`commands/card/new.ts`, `card-capture.ts`). Shipped early.

3. **`manifestVersion` not declared.** §5 (lines 423-432) lists `manifestVersion?: 1 | 2` as a Wave-2 schema addition. → `CardManifest` (`card-manifest.ts`) does not declare it; the three Wave-2 quality fields (`stability`, `lastValidatedWith`, `testStatusBadge`) are present but the version field is not. Manifests are silently versioned by absence of unknown-field rejection.

4. **`git.fsck` and `git.gc` not implemented.** §9.1 (line 868) documents these exports. → Neither exists in `cli/core/git.ts`. Planned but never implemented; `store gc` shells out to `git gc` directly via `runInRepo` (`commands/store/gc.ts`).

5. **`discoverCardNameForUrl` is inlined, not a separate helper.** §8.4 (lines 770-792) describes it as a discrete helper. → In as-built code, discovery is inlined inside `resolveFromGit` (`card-store.ts`) using the temp-clone-then-rename pattern. Behavior matches; structure differs.

6. **`lockfileVersion` spans `2 | 3 | 4 | 5`.** §4.3 (line 327) says "Wave 1 uses `lockfileVersion: 2` only." → As-built, `validateCardLockfile` accepts `2`, `3`, `4`, or `5` and rejects anything else (`card-lock.ts`): v3 added hook locking. `writeCardLock` emits v5 (§3.4). There is still no v1 read-compat shim.

7. **`profiles/` is not implemented.** §3.1 lists `profiles/work.json`, `profiles/personal.json` in the per-user store. → No `resolveProfilesPath` exists in `store-paths.ts`. Forward-looking design.

8. **`presets/` and per-project `<project>/.agents/drwn/skills/` are not implemented.** §3.3 lists these. → No resolvers wired up; only `config.json`, `card.lock`, `write-record.json` exist in the per-project state.

9. **`registry/mcp-servers.json` carries an undeclared `auth` field.** Used on `notion` and `slack` (`registry/mcp-servers.json`); not declared in `RegistryServer` (`types.ts`). Survives via unchecked `JSON.parse`. Type-aware consumers don't see it.

10. **`lastWriteHarnessVersion` derives from `DRWN_VERSION`.** `sync.ts` writes the centralized `DRWN_VERSION` constant (`version.ts`) into the write record, so the stamped harness version tracks the real CLI version rather than a hardcoded literal.

11. **`bgng` → `drwn` rename done.** §11.5 ("HISTORICAL — DROPPED 2026-06-02") references the old binary name. Repo and all docs/tests/CLI surface use `drwn` exclusively.
