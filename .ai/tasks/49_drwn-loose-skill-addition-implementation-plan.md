# ABOUTME: Implementation plan for first-class loose SKILL.md imports into the drwn library and card sources.
# ABOUTME: Converts analysis 67 into an execution-ready patch strategy with exact files, helper APIs, tests, and verification commands.

# Task 49 - Implementation Plan: Loose Skill Addition To Library And Cards

**Status**: Draft, ready to implement
**Created**: 2026-06-19
**Assigned**: Remy + Codex
**Priority**: High
**Estimated Effort**: 1-2 focused days
**Constraints**: No new worktree, no commits; preserve existing package-backed bundle behavior; do not activate imported skills automatically.
**Dependencies**: Existing package-backed skill bundle support; card source authoring commands.
**References**: [.ai/analyses/67_drwn-loose-skill-addition-target-architecture.md, .ai/analyses/06_npm-skills-package-integrated-target-architecture.md, .ai/analyses/41_card-source-authoring-cli-target-architecture.md, cli/core/skill-packages.ts, cli/core/skills.ts, cli/core/card-source.ts, cli/commands/library/add/skill.ts, cli/commands/skills/packages/add.ts, cli/commands/card/source/add-skill.ts, test/core-skill-packages.test.ts, test/commands-library.test.ts, test/commands-skills-packages.test.ts, test/commands-card-source-skill-mutate.test.ts]

---

## Objective

Make Darwin CLI support the local single-skill workflow directly:

```bash
drwn library add skill ./SKILL.md
drwn library add skill ./skill-dir
drwn card source add-skill @remyjkim/notion-agent import-mcp-from-claude --from ./SKILL.md
```

The end state is that a loose skill file or directory can be imported into the reusable local library without hand-writing `package.json`/`bundle.json`, and a direct `SKILL.md` file can be copied into an editable card source. Library imports remain snapshots, not live links. Project activation still requires `drwn add skill <name>` or `drwn library defaults add skill <name>`.

## Current State Confirmed

Code inspection and temp-home CLI probes confirmed:

- `drwn library add skill <packageSpec>` and `drwn skills packages add <packageSpec>` both call `ingestSkillPackage`, which always runs `npm pack`.
- A loose directory with `SKILL.md` fails in library add because npm tries to read `package.json`.
- A direct `SKILL.md` file fails in library add because npm treats it as a package path.
- `drwn card source add-skill ... --from <dir>` already works when `<dir>/SKILL.md` exists.
- `drwn card source add-skill ... --from <SKILL.md>` fails because `resolveSkillSource` checks for `<path>/SKILL.md`.
- Package-backed skill installs already choose `~/.agents/drwn/skills/...` when `~/.agents/drwn/store.json` exists, and legacy `~/.agents/packages/skills/...` otherwise.

## Target State

- `drwn library add skill ./SKILL.md --json` installs a synthetic single-skill bundle under the active skill package cache.
- `drwn library add skill ./skill-dir --json` does the same for a loose skill directory.
- `drwn skills packages add ./SKILL.md --json` behaves consistently with `library add skill`.
- Imported loose skills appear through:
  - `drwn library list skills`
  - `drwn library show <skill>`
  - `drwn skills list`
  - `drwn add skill <skill>`
  - `drwn library defaults add skill <skill>` when scope is `shared`
- `drwn card source add-skill <card> <skill> --from ./SKILL.md` copies the parent directory into the card source and updates `card.json.skills.include`.
- Existing package-backed bundle ingestion remains compatible, including `npm pack --ignore-scripts`.
- Collisions remain rejected by default; safe replacement requires `--replace`.

## Success Criteria

- [ ] Direct `SKILL.md` import to library succeeds without manual package wrapping.
- [ ] Loose skill directory import to library succeeds without manual package wrapping.
- [ ] Direct `SKILL.md` import through `skills packages add` succeeds through the same helper as `library add skill`.
- [ ] Imported loose skill can be activated with `drwn add skill` and planned by `drwn write --dry-run`.
- [ ] Direct `SKILL.md` path works with `card source add-skill --from`.
- [ ] Package-backed bundle tests still pass.
- [ ] Duplicate skill names fail without `--replace`.
- [ ] `--replace` only permits same-package replacement; it refuses repo-native and different-package collisions.
- [ ] Store-era imports honor `DRWN_STORE_READONLY=1`.
- [ ] `bun test` and `bun run typecheck` pass.

## Implementation Strategy

### Architectural Choice

Do not add a new loose-skill inventory layer. Treat loose skill files/directories as input forms and normalize them into the existing package-backed bundle shape:

```text
input:
  ./SKILL.md
  ./skill-dir/

synthetic bundle:
  package.json
  bundle.json
  README.md
  skills/<scope>/<skill-name>/...

installed:
  ~/.agents/drwn/skills/<package>/<version>/...
  or ~/.agents/packages/skills/<package>/<version>/...
```

This preserves the existing `buildSkillInventory` -> `findAvailableSkill` -> `curateSkill` -> `syncSkills` path and keeps the patch tightly scoped.

### Replacement Policy

Default behavior stays conservative:

- No `--replace`: any skill-name collision fails.
- `--replace`: allow only when all incoming colliding skill names already come from the same installed package name.
- Never replace repo-native skills.
- Never replace skills from a different installed package.

This requires commands to pass source-aware existing records into the installer, not just `Set<string>`.

### Frontmatter Policy

For loose imports:

- Parse only leading `---` frontmatter.
- Extract scalar `name:` and `description:` values.
- If `--as` is omitted, require frontmatter `name`.
- If `--as` is provided, use it as the drwn skill id.
- If the copied `SKILL.md` frontmatter is missing `name` or has a different `name`, rewrite only the copied snapshot inside the synthetic bundle.
- Never modify the original source file.
- JSON output should include `frontmatterRewritten: true` when the installed snapshot was normalized.

This avoids a mismatch between the directory/bundle skill id and the `SKILL.md` metadata downstream tools read.

### Safety Policy

- Validate package names before using them in `resolveSkillPackageRoot` or `resolveStoreSkillPackageRoot`.
- Validate versions with `isStrictSemver`.
- Validate scope as one of `shared`, `claude-only`, `codex-only`, `experimental`.
- Reject path traversal and hidden path segments in generated package-name path parts.
- Reject symlinks while copying loose skill directories into synthetic bundles unless there is a later explicit use case.
- If the active skill package root is store-era `~/.agents/drwn/skills`, call `assertStoreWritable()` before mutation.

## Phase 1 - Core Installer Refactor

**Goal**: Separate "install an already-normalized bundle root" from "obtain that bundle root via npm pack." Existing behavior should remain unchanged after this phase.

### Files Modified

- `cli/core/skill-packages.ts`
- `test/core-skill-packages.test.ts`

### Changes

1. Add a minimal existing-skill record type inside `skill-packages.ts` to avoid importing `SkillInventoryItem` from `skills.ts` and creating a cycle:

   ```ts
   export interface ExistingSkillRecord {
     name: string;
     sourceType?: "repo" | "npm";
     sourceId?: string;
   }
   ```

   For scope typing, use the existing `BundleSkillEntry["scope"]` union from `cli/core/types.ts`. Do not import `SkillScope` from `skills.ts` into `skill-packages.ts`.

2. Add storage/package validation helpers:

   ```ts
   function assertSafePackageNameForStorage(packageName: string): void
   function assertSafePackageVersion(version: string): void
   function assertValidSkillScope(scope: string): asserts scope is BundleSkillEntry["scope"]
   ```

   Notes:
   - `@local/import-mcp-from-claude` should pass.
   - `../bad`, `@local/../bad`, `.hidden`, `@scope/.hidden`, empty segments, and backslashes should fail.
   - Use `isStrictSemver` for versions.

3. Extend `validateBundleManifest` with an optional collision allow-list:

   ```ts
   allowedSkillNameCollisions?: Set<string>
   ```

   It should still reject collisions unless the skill name is explicitly allowed.

4. Factor the installation step:

   ```ts
   export async function installSkillBundleRoot(options: {
     agentsDir: string;
     bundleRoot: string;
     packageName: string;
     version: string;
     existingSkillNames: Set<string>;
     existingSkills?: ExistingSkillRecord[];
     replace?: boolean;
   }): Promise<InstalledSkillBundle>
   ```

   Responsibilities:
   - validate package name and version;
   - load and validate `bundle.json`;
   - compute safe allowed collisions if `replace` is true;
   - call `assertStoreWritable()` when `useStoreSkillLayout(agentsDir)` is true;
   - remove and replace the target version root;
   - update `current` symlink;
   - return the same `InstalledSkillBundle` shape current callers expect.

   Important: `installSkillBundleRoot` consumes a disposable normalized bundle root by moving it into the managed package cache. Do not call it directly with a user-authored source directory.

5. Update `ingestSkillPackage` to:
   - keep using `npm pack <spec> --ignore-scripts --json --pack-destination <tmp>`;
   - extract into `extractDir/package`;
   - delegate to `installSkillBundleRoot`;
   - preserve cleanup behavior.

### Tests

Add/adjust `test/core-skill-packages.test.ts`:

- Existing `ingestSkillPackage` tests still pass unchanged.
- `installSkillBundleRoot` installs a prepared bundle root and marks `current`.
- package-name validation rejects traversal and hidden segments.
- `--replace` allows a collision from the same package.
- `--replace` rejects a repo-native collision.
- `--replace` rejects a different-package collision.
- Store-era install with `DRWN_STORE_READONLY=1` fails before writing.

## Phase 2 - Loose Skill Normalization

**Goal**: Add core support for importing a single loose skill file or directory as a synthetic installed bundle.

### Files Modified

- `cli/core/skill-packages.ts`
- `test/core-skill-packages.test.ts`

### Core API

Add:

```ts
export async function ingestLooseSkill(options: {
  agentsDir: string;
  sourcePath: string;
  existingSkillNames: Set<string>;
  existingSkills?: ExistingSkillRecord[];
  as?: string;
  scope?: BundleSkillEntry["scope"];
  packageName?: string;
  version?: string;
  replace?: boolean;
}): Promise<InstalledSkillBundle & {
  inputKind: "loose-skill";
  skillName: string;
  sourcePath: string;
  frontmatterRewritten: boolean;
}>
```

### Helper Functions

Implement private helpers in `skill-packages.ts`:

```ts
function resolveLooseSkillRoot(sourcePath: string): { root: string; skillMd: string; inputKind: "skill-file" | "skill-dir" }
function parseSkillFrontmatter(skillMdContent: string): { name?: string; description?: string; start?: number; end?: number }
function normalizeSkillMdName(content: string, skillName: string): { content: string; rewritten: boolean }
async function copyLooseSkillSnapshot(sourceRoot: string, destinationRoot: string): Promise<void>
function defaultSyntheticPackageName(skillName: string): string
```

Implementation notes:

- `resolveLooseSkillRoot` accepts:
  - a regular file whose basename is exactly `SKILL.md`;
  - a directory containing `SKILL.md`.
- The frontmatter parser should only parse a leading `---` block. It does not need a full YAML dependency.
- `normalizeSkillMdName` should:
  - insert `name: <skillName>` if no frontmatter exists;
  - insert `name: <skillName>` into existing frontmatter if missing;
  - replace the scalar `name:` line if different;
  - preserve the rest of the file.
- `copyLooseSkillSnapshot` should recursively copy ordinary files and directories and reject symlinks.
- Default values:
  - `scope`: `shared`
  - `version`: `0.1.0`
  - `packageName`: `@local/<skillName>`

### Synthetic Bundle Shape

Create a temp bundle root:

```text
package.json
bundle.json
README.md
skills/<scope>/<skillName>/...
```

The copied `SKILL.md` lives at:

```text
skills/<scope>/<skillName>/SKILL.md
```

Generated `bundle.json`:

```json
{
  "schemaVersion": 1,
  "bundleName": "@local/import-mcp-from-claude",
  "displayName": "import-mcp-from-claude",
  "description": "Imported from local SKILL.md",
  "version": "0.1.0",
  "skills": [
    {
      "name": "import-mcp-from-claude",
      "scope": "shared",
      "path": "skills/shared/import-mcp-from-claude"
    }
  ]
}
```

### Tests

Add `test/core-skill-packages.test.ts` cases:

- imports direct `SKILL.md`;
- imports loose directory with auxiliary files;
- imported loose directory is a snapshot and does not depend on the original after import;
- imported direct file with `--as` rewrites copied frontmatter and leaves the original unchanged;
- missing frontmatter name fails without `--as`;
- `--scope claude-only` produces `skills/claude-only/<name>`;
- symlink inside loose skill directory is rejected;
- invalid `--package-name`, `--version`, and `--scope` fail clearly.

## Phase 3 - Command Wiring

**Goal**: Expose loose import through the public command surfaces while preserving existing package-backed bundle behavior.

### Files Modified

- `cli/commands/library/add/skill.ts`
- `cli/commands/skills/packages/add.ts`
- `cli/commands/add/skill.ts` only if ingest signature changes require a small call-site update
- `test/commands-library.test.ts`
- `test/commands-skills-packages.test.ts`
- `test/commands-add-skill.test.ts`
- `test/commands-skills-list.test.ts`

### Command Options

Add to both `library add skill` and `skills packages add`:

```ts
as = Option.String("--as", { required: false, description: "Install a loose skill under this skill id." });
scope = Option.String("--scope", { required: false, description: "Scope for loose skill imports: shared, claude-only, codex-only, or experimental." });
packageName = Option.String("--package-name", { required: false, description: "Synthetic package name for loose skill imports." });
version = Option.String("--version", { required: false, description: "Synthetic package version for loose skill imports." });
replace = Option.Boolean("--replace", false, { description: "Replace an existing installed skill from the same package." });
```

Do not add `--dry-run` in this first patch. It is useful, but it requires a second no-write validation path and is not needed to unblock the workflow.

### Input Classification

Add a command-local or core helper:

```ts
function classifySkillAddInput(spec: string): "loose-skill" | "package-spec"
```

Recommended rules:

1. Existing regular file named `SKILL.md` -> loose skill.
2. Existing directory with both `package.json` and `bundle.json` -> package spec.
3. Existing directory with root `SKILL.md` -> loose skill.
4. Existing tarball or any other existing path -> package spec.
5. Nonexistent local-looking path (`./`, `../`, `/`, `~/`, or file extension path) -> clear `UsageError`.
6. Everything else -> package spec.

### Existing Inventory

Commands currently build `inventory` and pass `new Set(inventory.map(...))`. Continue that, but also pass source records:

```ts
const inventory = await buildSkillInventory(...)
const existingSkillNames = new Set(inventory.map((skill) => skill.name))
const existingSkills = inventory.map(({ name, sourceType, sourceId }) => ({ name, sourceType, sourceId }))
```

### Output

For JSON, render the installed result. Extra fields for loose imports are acceptable:

```json
{
  "packageName": "@local/import-mcp-from-claude",
  "activeVersion": "0.1.0",
  "skillName": "import-mcp-from-claude",
  "inputKind": "loose-skill",
  "frontmatterRewritten": false
}
```

For human output, keep the current package message shape:

```text
Added @local/import-mcp-from-claude@0.1.0 to the local library.

Next:
  drwn add skill import-mcp-from-claude
  drwn write --dry-run
```

### Tests

Add/adjust:

`test/commands-library.test.ts`

- `library add skill <SKILL.md> --json` installs `@local/<skill>@0.1.0`.
- `library add skill <dir> --json` installs from a loose directory.
- import does not write project config.
- duplicate import fails without `--replace`.
- duplicate import succeeds with `--replace`.
- imported loose skill appears in `library list skills --json` and `library show <skill> --json`.

`test/commands-skills-packages.test.ts`

- `skills packages add <SKILL.md> --json` uses the same loose import path.
- Existing package-backed add/list/show tests still pass.

`test/commands-add-skill.test.ts`

- after loose library import, `drwn add skill <name>` updates project config.

`test/commands-skills-list.test.ts`

- imported loose skill appears with `sourceType: "npm"`, `sourceId: "@local/<skill>"`, `sourceVersion: "0.1.0"`.

## Phase 4 - Card Source Direct `SKILL.md` Support

**Goal**: Make `card source add-skill --from ./SKILL.md` work while preserving current directory behavior.

### Files Modified

- `cli/core/card-source.ts`
- `test/commands-card-source-skill-mutate.test.ts`
- optionally `test/core-card-source.test.ts` if adding a core-level direct-file resolver test is clean

### Changes

Update the private `resolveSkillSource` in `card-source.ts`:

```ts
if (options.from) {
  const path = resolve(options.from);
  const stats = await lstat(path);
  if (stats.isFile() && basename(path) === "SKILL.md") {
    return { path: dirname(path) };
  }
  if (stats.isDirectory() && existsSync(join(path, "SKILL.md"))) {
    return { path };
  }
  throw new Error(`Skill source must be a SKILL.md file or a directory containing SKILL.md: ${path}`);
}
```

Implementation notes:

- Existing repo/library skill resolution stays unchanged.
- Existing `--replace` behavior stays unchanged.
- Copy semantics remain `cp(source.path, destination, { recursive: true, verbatimSymlinks: false })`.
- This phase does not rewrite frontmatter for card-source copies; the caller provided the card skill name explicitly, and existing card-source behavior already trusts the copied content.

### Tests

Add `test/commands-card-source-skill-mutate.test.ts` cases:

- `add-skill --from <SKILL.md>` succeeds and copies the parent directory.
- direct file import preserves auxiliary files next to `SKILL.md`.
- invalid `--from <not-SKILL.md>` fails with the new clear error.
- existing directory import test remains green.

## Phase 5 - Docs And Help Text

**Goal**: Make the UX discoverable and avoid confusion between library snapshots and card-source copies.

### Files Modified

- `docs/cli-quickref.md`
- `cli/commands/library/add/skill.ts`
- `cli/commands/skills/packages/add.ts`
- `cli/commands/card/source/add-skill.ts`

### Updates

Document:

```bash
# Reusable local library import
drwn library add skill ./SKILL.md
drwn add skill <skillName>
drwn write --dry-run

# Card-source copy
drwn card source add-skill @scope/card <skillName> --from ./SKILL.md
drwn card source doctor @scope/card
```

Clarify:

- Library import is a snapshot into the managed local cache.
- Card source add copies the skill into the editable card source.
- Neither command auto-runs `drwn write`.
- `sourceType: "npm"` currently means installed package-backed bundle, including synthetic local bundles.

## Phase 6 - Verification

Run focused tests first:

```bash
bun test test/core-skill-packages.test.ts
bun test test/commands-library.test.ts
bun test test/commands-skills-packages.test.ts
bun test test/commands-add-skill.test.ts
bun test test/commands-skills-list.test.ts
bun test test/commands-card-source-skill-mutate.test.ts
```

Then run full verification:

```bash
bun test
bun run typecheck
```

Manual smoke, isolated from the real machine:

```bash
tmp=$(mktemp -d)
export AGENTS_HOME_DIR="$tmp/home"
export AGENTS_DIR="$AGENTS_HOME_DIR/.agents"
export AGENTS_REPO_ROOT=/Users/pureicis/dev/darwinian-harness

mkdir -p "$tmp/import-mcp-from-claude"
printf '%s\n' \
  '---' \
  'name: import-mcp-from-claude' \
  'description: Import MCP server definitions from Claude Code into drwn-managed library/card state.' \
  '---' \
  '' \
  '# Import MCP From Claude' \
  > "$tmp/import-mcp-from-claude/SKILL.md"

bun /Users/pureicis/dev/darwinian-harness/cli/index.ts library add skill "$tmp/import-mcp-from-claude/SKILL.md" --json
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts library show import-mcp-from-claude --json

mkdir -p "$tmp/project"
cd "$tmp/project"
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts init --non-interactive --no-default-catalogs
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts add skill import-mcp-from-claude
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts write --dry-run
```

Card-source smoke:

```bash
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts card new @remyjkim/notion-agent --no-git
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts card source add-skill @remyjkim/notion-agent import-mcp-from-claude --from "$tmp/import-mcp-from-claude/SKILL.md"
bun /Users/pureicis/dev/darwinian-harness/cli/index.ts card source doctor @remyjkim/notion-agent --json
```

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Replacing skills becomes too permissive | Medium | High | Allow `--replace` only for same package sourceId; reject repo-native and different-package collisions. |
| Synthetic package path traversal | Low | High | Validate package name segments before resolving package roots. |
| Frontmatter mismatch between drwn id and `SKILL.md` name | Medium | Medium | Rewrite only the copied synthetic bundle snapshot and report `frontmatterRewritten`. |
| Symlink escape during loose skill copy | Low | Medium | Reject symlinks in loose import snapshots for v1. |
| Existing package-backed installs regress | Medium | High | Factor install helper carefully; keep `ingestSkillPackage` tests intact; run package tests first. |
| JSON consumers depend on `sourceType: "npm"` | Low | Medium | Keep `sourceType: "npm"` unchanged for v1; document imprecision. |
| Read-only store can still mutate `~/.agents/drwn/skills` | Low | Medium | Add `assertStoreWritable()` in store-era install path and test it. |

## Open Questions

- Should `library add skill` get `--dry-run` later? Recommendation: defer. The v1 patch should focus on import capability and safe replacement.
- Should `sourceType` be renamed from `"npm"` to `"package"`? Recommendation: defer to a compatibility-focused metadata cleanup task.
- Should `drwn add skill ./SKILL.md --yes` be added as a one-step import+activate flow? Recommendation: defer until `library add skill ./SKILL.md` is stable.
- Should card-source direct `SKILL.md` import normalize frontmatter too? Recommendation: not in this task. Card sources already copy explicit content, and changing it would be surprising.

## Execution Checklist

### Phase 1 Checklist

- [ ] Add `ExistingSkillRecord`.
- [ ] Add safe package-name/version/scope validation.
- [ ] Extend `validateBundleManifest` with allowed collisions.
- [ ] Factor `installSkillBundleRoot`.
- [ ] Update `ingestSkillPackage` to delegate to `installSkillBundleRoot`.
- [ ] Add replacement and read-only tests.
- [ ] Run `bun test test/core-skill-packages.test.ts`.

### Phase 2 Checklist

- [ ] Add loose path resolver.
- [ ] Add bounded frontmatter parser.
- [ ] Add copied-snapshot frontmatter normalization.
- [ ] Add recursive copy helper that rejects symlinks.
- [ ] Add `ingestLooseSkill`.
- [ ] Add direct-file, directory, auxiliary-file, snapshot, and frontmatter tests.
- [ ] Run `bun test test/core-skill-packages.test.ts`.

### Phase 3 Checklist

- [ ] Wire options into `library add skill`.
- [ ] Wire options into `skills packages add`.
- [ ] Add input classifier.
- [ ] Pass source-aware existing skill records from command inventory to installer.
- [ ] Add library and package command tests.
- [ ] Add project activation test after loose import.
- [ ] Run command-focused tests.

### Phase 4 Checklist

- [ ] Update `card-source.ts` `resolveSkillSource`.
- [ ] Add direct `SKILL.md` card-source command tests.
- [ ] Run `bun test test/commands-card-source-skill-mutate.test.ts`.

### Phase 5 Checklist

- [ ] Update CLI help text examples.
- [ ] Update `docs/cli-quickref.md`.
- [ ] Confirm docs do not imply automatic activation or write.

### Phase 6 Checklist

- [ ] Run focused test set.
- [ ] Run `bun test`.
- [ ] Run `bun run typecheck`.
- [ ] Run manual isolated smoke for library import.
- [ ] Run manual isolated smoke for card-source direct file import.

## Completion Doc

When implemented, create a companion completion doc:

```text
.ai/tasks/49_completion_drwn-loose-skill-addition.md
```

Include:

- files changed;
- behavior added;
- test commands and results;
- manual smoke outputs;
- any deferred follow-ups.
