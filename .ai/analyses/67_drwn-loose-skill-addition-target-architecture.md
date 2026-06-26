# Drwn Loose Skill Addition Target Architecture

Date: 2026-06-19
Status: Target architecture draft
Scope: Support adding a local loose skill to either the reusable drwn library or an editable card source.

## Executive Summary

Darwin CLI should support the practical workflow we just had to perform by hand:

```bash
drwn library add skill ./import-mcp-from-claude/SKILL.md
drwn card source add-skill @me/notion-agent import-mcp-from-claude --from ./SKILL.md
```

The current implementation is close, but uneven:

- `drwn library add skill <packageSpec>` only accepts package-backed bundles that can be processed by `npm pack`.
- `drwn skills packages add <packageSpec>` has the same package-only behavior.
- `drwn card source add-skill <card> <skill> --from <dir>` already accepts a loose skill directory containing `SKILL.md`.
- `drwn card source add-skill ... --from <SKILL.md>` does not work.

The recommended target architecture is:

1. Treat loose skills as an input format, not as a new activation layer.
2. Normalize a loose `SKILL.md` file or loose skill directory into a synthetic single-skill bundle.
3. Install that synthetic bundle through the same managed package-backed cache used today.
4. Keep project activation, global defaults, curation, card inclusion, and downstream write unchanged.
5. Extend card-source add-skill to accept both a skill directory and a direct `SKILL.md` file.

This keeps the architecture small and preserves the strongest existing contracts: installed means available, curated means globally published, written means materialized into downstream tool directories, and card-bundled skills are copied into the card source.

## Current Behavior Observed

### Code Inspection

The relevant current paths are:

- `cli/core/skill-packages.ts`
  - Chooses active skill package root based on whether `~/.agents/drwn/store.json` exists.
  - Validates `bundle.json`.
  - Installs extracted package content under the active package cache.
  - Uses `npm pack <spec> --ignore-scripts --json --pack-destination <tmp>`.
- `cli/core/skills.ts`
  - Discovers repo-native skills.
  - Discovers installed package-backed skills through `listInstalledSkillBundles`.
  - Publishes shared skills into `~/.agents/skills` through `curateSkill`.
  - Writes downstream symlinks through `syncSkills`.
- `cli/core/library.ts`
  - Projects package-backed skill inventory into the local library view.
- `cli/core/card-source.ts`
  - Resolves `--from` as a directory that must contain `SKILL.md`.
  - Copies resolved skill content into `~/.agents/drwn/sources/<card>/skills/<skill>`.
  - Updates `card.json` `skills.include`.
- `cli/commands/library/add/skill.ts`
  - Wraps `ingestSkillPackage`.
- `cli/commands/skills/packages/add.ts`
  - Also wraps `ingestSkillPackage`.
- `cli/commands/add/skill.ts`
  - Activates an already available skill in the current project.
  - Can install a catalog package before activation, but only from catalog search.

The current package-backed design is already a good substrate. A loose skill imported into the library should become a package-backed source so the existing inventory and write layers continue to work.

### CLI Probes

I ran isolated temp-home probes with `AGENTS_HOME_DIR` and `AGENTS_DIR` pointed at `/tmp`, so they did not touch the real machine state.

Loose skill directory into library:

```text
drwn library add skill /tmp/.../loose-skill --json
exit=1
Usage Error: Could not read package.json: ENOENT .../loose-skill/package.json
```

Direct `SKILL.md` into library:

```text
drwn library add skill /tmp/.../loose-skill/SKILL.md --json
exit=1
Usage Error: Could not read package.json: ENOTDIR .../SKILL.md/package.json
```

Direct `SKILL.md` into card source:

```text
drwn card source add-skill @probe/example loose-skill --from /tmp/.../SKILL.md --json
exit=1
Skill source is missing SKILL.md: /tmp/.../SKILL.md
```

Loose skill directory into card source:

```text
drwn card source add-skill @probe/example loose-skill --from /tmp/.../loose-skill --json
exit=0
changes: copy-skill, update-manifest
```

Store-era package install:

```text
drwn library add skill /tmp/.../bundle --json
packageRoot: /tmp/.../.agents/drwn/skills/@probe/store-skill
```

That confirms the current installer is layout-aware once `drwn/store.json` exists. The loose-skill architecture should reuse that path selection.

## Problem Statement

Drwn currently has two good but incomplete affordances:

- Reusable library skills must be packaged as npm-compatible bundles.
- Card source skills can be copied from loose directories, but not from a direct `SKILL.md`.

That leaves a common real workflow awkward:

1. Generate or edit a single `SKILL.md` in a scratch directory.
2. Decide it should become reusable.
3. Manually create `package.json`, `bundle.json`, a nested `skills/shared/<name>/` tree, and then run `drwn library add skill`.

The CLI should own that ceremony. Users should not need to understand the internal bundle contract just to register one local skill.

## Goals

1. Add a direct loose-skill import path for the local reusable library.
2. Add direct `SKILL.md` support for `card source add-skill --from`.
3. Preserve package-backed skill bundle support exactly where it already works.
4. Preserve explicit activation:
   - library import does not modify a project
   - library import does not curate by default
   - card source add copies content into the source and updates the manifest
5. Keep installed loose skills inspectable through current library and skill inventory commands.
6. Make re-import/update behavior explicit through `--replace`.
7. Keep all writes out of the repo worktree unless the command is explicitly editing a card source in the managed drwn store.

## Non-Goals

1. Do not introduce a second source inventory layer for loose local skills.
2. Do not make library-installed loose skills depend on their original source path.
3. Do not auto-activate imported skills in project config in v1.
4. Do not auto-curate imported skills into global defaults in v1.
5. Do not implement remote publishing of loose skills.
6. Do not add full skill lifecycle management in the first patch beyond `--replace`.

## Recommended Architecture

### Decision

Loose skills imported into the library should be materialized as synthetic single-skill bundles, then installed through the existing installed-bundle cache.

Conceptually:

```text
input:
  ./SKILL.md
  ./skill-dir/

normalize:
  temp synthetic bundle root
    package.json
    bundle.json
    skills/<scope>/<skill-name>/...
    README.md

install:
  ~/.agents/drwn/skills/<package>/<version>/...
  or legacy ~/.agents/packages/skills/<package>/<version>/...

available:
  drwn library list skills
  drwn library show <skill>
  drwn add skill <skill>
  drwn library defaults add skill <skill>
  drwn write
```

This is better than adding a separate `~/.agents/drwn/loose-skills` layer because:

- `buildSkillInventory` already understands installed bundles.
- `findAvailableSkill` already resolves package-backed skills.
- `curateSkill` already works for package-backed shared skills.
- `syncSkills` already handles package-backed included skills.
- `library list/show` already project package-backed skills into user-facing inventory.
- Existing docs already distinguish added, curated, and written.

### Library Add: Input Classification

The command should classify the first argument in this order:

1. Existing regular file named `SKILL.md`: loose skill file.
2. Existing directory with root `SKILL.md`: loose skill directory.
3. Existing path with package-bundle shape, such as `package.json` plus `bundle.json`: package spec/path.
4. Existing tarball: package spec/path.
5. Nonexistent local-looking path: clear filesystem error.
6. Everything else: npm package spec.

This avoids sending obvious loose skills to `npm pack`, which is the current failure mode.

### Card Source Add: Input Classification

`card source add-skill --from` should classify only local filesystem input:

1. Existing regular file named `SKILL.md`: copy its parent directory.
2. Existing directory with root `SKILL.md`: copy that directory.
3. Anything else: error with `Skill source must be a SKILL.md file or a directory containing SKILL.md`.

The card-source command already has the target skill name as a positional argument, so it does not need `--as` in v1.

## Command Surface

### Library

Recommended v1:

```bash
drwn library add skill <package-or-skill-path> [--as <skillName>] [--scope <scope>] [--package-name <name>] [--version <semver>] [--replace] [--json]
```

Behavior:

- If `<package-or-skill-path>` is a package spec, preserve current behavior.
- If it is a loose skill file or directory:
  - read `SKILL.md` frontmatter
  - infer skill name from frontmatter `name`
  - use `--as` as the target drwn skill id when provided
  - normalize the copied `SKILL.md` frontmatter in the synthetic bundle so `name` matches the target skill id
  - default `--scope` to `shared`
  - default `--package-name` to `@local/<skillName>`
  - default `--version` to `0.1.0`
  - synthesize a single-skill bundle
  - install it without running npm lifecycle scripts
- Reject collision by default.
- Permit collision only with `--replace`, and only under the replacement policy below.

The same input options should be accepted by the compatibility command:

```bash
drwn skills packages add <package-or-skill-path> [same options]
```

Reason: both commands currently call the same installer, and leaving one package-only would create avoidable user confusion.

### Project Activation Shortcut

Do not add direct path import to `drwn add skill` in v1.

`drwn add skill` currently means "include an available skill in the current project." Reusing that positional argument for local filesystem input would make the command ambiguous:

```bash
drwn add skill ./SKILL.md
```

This can be a later convenience once the import command is stable:

```bash
drwn add skill ./SKILL.md --as import-mcp-from-claude --yes
```

The v1 recommendation is explicit two-step UX:

```bash
drwn library add skill ./SKILL.md
drwn add skill import-mcp-from-claude
```

### Card Source

Recommended v1:

```bash
drwn card source add-skill <cardName> <skillName> --from <dir-or-SKILL.md> [--replace] [--dry-run] [--json]
```

This is a narrow extension of the existing command. It should not synthesize a package. Card sources are already self-contained bundles, so the correct behavior is to copy the loose skill directory into the card source.

## Core API Shape

### Factor Installation From Packaging

Current `ingestSkillPackage` does three things:

1. Runs `npm pack`.
2. Extracts the tarball.
3. Validates and installs the normalized bundle root.

Target shape:

```ts
export async function installSkillBundleRoot(options: {
  agentsDir: string;
  bundleRoot: string;
  packageName: string;
  version: string;
  existingSkillNames: Set<string>;
  replace?: boolean;
  replacePackageName?: string;
}): Promise<InstalledSkillBundle>

export async function ingestSkillPackage(options: {
  agentsDir: string;
  packageSpec: string;
  existingSkillNames: Set<string>;
  replace?: boolean;
}): Promise<InstalledSkillBundle>

export async function ingestLooseSkill(options: {
  agentsDir: string;
  sourcePath: string;
  existingSkillNames: Set<string>;
  as?: string;
  scope?: SkillScope;
  packageName?: string;
  version?: string;
  replace?: boolean;
}): Promise<InstalledSkillBundle>
```

`ingestSkillPackage` should keep using `npm pack --ignore-scripts`. `ingestLooseSkill` should not call npm at all. It should create a temp synthetic bundle root and pass it to `installSkillBundleRoot`.

### Synthetic Bundle Shape

Default loose import:

```text
bundleRoot/
  package.json
  bundle.json
  README.md
  skills/
    shared/
      import-mcp-from-claude/
        SKILL.md
        ...
```

Generated `package.json`:

```json
{
  "name": "@local/import-mcp-from-claude",
  "version": "0.1.0",
  "private": true,
  "description": "Local drwn synthetic bundle for import-mcp-from-claude.",
  "files": ["skills", "bundle.json", "README.md"]
}
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

The original skill directory should be copied into the synthetic bundle. The installed skill must not depend on the original path after import.

### Skill Metadata Parsing

The repo does not currently depend on a YAML parser. The target v1 should avoid adding one unless broader frontmatter parsing is needed.

A small bounded parser is enough for import:

- Only inspect a leading frontmatter block delimited by `---`.
- Extract scalar `name:` and `description:` values.
- Support quoted or unquoted single-line values.
- Ignore all other fields.
- If no frontmatter `name` exists, require `--as`.

This matches the actual skill format guidance: `SKILL.md` frontmatter is primarily `name` and `description`.

Name policy:

- If `--as` is omitted, use frontmatter `name`.
- If `--as` is provided, use it as the installed drwn skill id.
- If the copied `SKILL.md` frontmatter name is missing or differs, normalize the copied file inside the synthetic bundle so its `name` matches the installed drwn skill id.
- Never modify the original source file or source directory.

That avoids installing a skill under one drwn id while downstream tools read a different frontmatter name. The command should include `frontmatterRewritten: true` in JSON output when it changes the imported snapshot.

### Collision And Replacement Policy

Current validation rejects any existing skill name collision. That should remain the default.

Recommended v1 policy:

- Without `--replace`, reject any existing skill name collision.
- With `--replace`, allow replacement only when the existing skill comes from the same installed package name.
- Do not allow replacing repo-native skills.
- Do not allow replacing a skill from a different package name.
- Do not allow replacing one skill inside a multi-skill package unless the replacing input is the same package.

Examples:

```bash
drwn library add skill ./SKILL.md
# installs @local/import-mcp-from-claude@0.1.0

drwn library add skill ./SKILL.md
# fails: Skill name collision

drwn library add skill ./SKILL.md --replace
# succeeds only if existing import-mcp-from-claude sourceId is @local/import-mcp-from-claude
```

This avoids accidental shadowing while still supporting the edit-import-test loop.

### Store Writability

Package ingestion currently writes under `~/.agents/drwn/skills` when `drwn/store.json` exists. New install helpers should honor `DRWN_STORE_READONLY` before mutating store-era paths.

Recommended rule:

- If active install root is `~/.agents/drwn/skills`, call `assertStoreWritable()`.
- If active install root is legacy `~/.agents/packages/skills`, keep current behavior unless the broader CLI decides to extend read-only semantics to legacy paths too.

This keeps loose skill import consistent with card-source mutation, which already uses `assertStoreWritable`.

## Metadata Model

The current inventory labels package-backed skills as:

```ts
sourceType: "npm"
sourceId: bundle.packageName
sourceVersion: bundle.activeVersion
```

That label is already a little imprecise because local package paths are still `sourceType: "npm"`. Loose synthetic bundles make the imprecision more visible.

Recommended v1:

- Keep existing `sourceType: "npm"` JSON for compatibility.
- Use `sourceId: "@local/<skillName>"` for loose imports.
- Mention in docs that `sourceType: "npm"` currently means "installed package-backed bundle."

Recommended future cleanup:

```ts
sourceType: "repo" | "package"
sourceOrigin?: "npm" | "local" | "catalog"
sourceId?: string
sourceVersion?: string
```

Do not block the loose-skill import patch on this metadata cleanup unless the CLI is ready for a JSON contract adjustment.

## Target Flow Examples

### Register Scratch Skill To Library

```bash
drwn library add skill ./import-mcp-from-claude/SKILL.md --json
drwn library show import-mcp-from-claude
drwn add skill import-mcp-from-claude
drwn write --dry-run
```

Expected result:

- Installs synthetic bundle under active skill package cache.
- Shows the skill in `drwn library list skills`.
- Allows project inclusion through `drwn add skill`.
- Does not mutate the current project until `drwn add skill`.
- Does not mutate downstream tools until `drwn write`.

### Add Scratch Skill Directly To A Card

```bash
drwn card source add-skill @remyjkim/notion-agent import-mcp-from-claude --from ./SKILL.md
drwn card source doctor @remyjkim/notion-agent
drwn card publish @remyjkim/notion-agent
```

Expected result:

- Copies the parent directory of `SKILL.md` into the card source.
- Updates `card.json` `skills.include`.
- Keeps the card source self-contained.
- Does not create a library package.

### Replace Local Library Import

```bash
drwn library add skill ./SKILL.md --replace
```

Expected result:

- Replaces the same synthetic package/version root.
- Updates the `current` symlink as today.
- Refuses to replace if the existing skill comes from a repo-native skill or a different package.

## Implementation Plan

### Phase 1: Loose Input Support

Files:

- `cli/core/skill-packages.ts`
- `cli/commands/library/add/skill.ts`
- `cli/commands/skills/packages/add.ts`
- `cli/core/card-source.ts`
- `cli/commands/card/source/add-skill.ts`
- tests and docs

Tasks:

1. Factor `installSkillBundleRoot` out of `ingestSkillPackage`.
2. Add a local input classifier for package path vs loose skill file vs loose skill directory.
3. Add `ingestLooseSkill`.
4. Add command options:
   - `--as`
   - `--scope`
   - `--package-name`
   - `--version`
   - `--replace`
5. Extend `card-source` `resolveSkillSource` so a file path named `SKILL.md` resolves to its parent directory.
6. Update help text and `docs/cli-quickref.md`.

### Phase 2: Replacement Hardening

Tasks:

1. Add collision classification to inventory:
   - repo-native collision
   - same package collision
   - different package collision
2. Make `--replace` produce a clear JSON payload showing what was replaced.
3. Add read-only store tests for store-era installs.
4. Add clearer errors for local-looking nonexistent paths.

### Phase 3: Convenience UX

Potential additions:

```bash
drwn add skill ./SKILL.md --as <skillName> --yes
drwn library remove skill <skillName>
drwn skills packages remove <packageName>
drwn library update skill <skillName>
```

These are useful, but not required to solve the current workflow.

## Test Plan

### Core Tests

Add `test/core-skill-packages.test.ts` coverage:

- `ingestLooseSkill` installs a directory containing `SKILL.md`.
- `ingestLooseSkill` installs a direct `SKILL.md`.
- Synthetic bundle has valid `package.json`, `bundle.json`, copied skill files, and active `current` symlink.
- Default package name is `@local/<skillName>`.
- `--scope claude-only` stores path under `skills/claude-only/<skillName>`.
- Missing frontmatter name fails without `--as`.
- Missing or mismatched frontmatter name is normalized in the copied synthetic bundle when `--as` is provided.
- JSON output reports `frontmatterRewritten: true` when the imported snapshot was normalized.
- `--replace` allows same package replacement.
- `--replace` refuses repo-native and different-package collisions.
- Store-era install honors `DRWN_STORE_READONLY`.

### Command Tests

Add or extend:

- `test/commands-skills-packages.test.ts`
- `test/commands-add-skill.test.ts`
- `test/commands-card-source-skill-mutate.test.ts`
- `test/commands-skills-list.test.ts`

Cases:

- `drwn library add skill <dir> --json` succeeds for loose skill directory.
- `drwn library add skill <SKILL.md> --json` succeeds for direct file.
- `drwn skills packages add <SKILL.md> --json` behaves consistently.
- `drwn library list skills --json` shows the imported skill.
- `drwn add skill <imported>` includes it in project config.
- `drwn write --dry-run` plans downstream symlinks for the imported skill.
- `drwn card source add-skill ... --from <SKILL.md>` succeeds and copies parent directory.
- `drwn card source add-skill ... --from <dir>` remains supported.
- Existing package-backed bundle tests continue to pass.

### Manual Smoke

Use temp directories:

```bash
tmp=$(mktemp -d)
export AGENTS_HOME_DIR="$tmp/home"
export AGENTS_DIR="$AGENTS_HOME_DIR/.agents"
mkdir -p "$tmp/skill"
printf '%s\n' '---' 'name: scratch-skill' 'description: scratch' '---' > "$tmp/skill/SKILL.md"

drwn library add skill "$tmp/skill/SKILL.md" --json
drwn library show scratch-skill
mkdir "$tmp/project"
cd "$tmp/project"
drwn init --non-interactive --no-default-catalogs
drwn add skill scratch-skill
drwn write --dry-run
```

Expected:

- Import succeeds.
- Project config includes `scratch-skill`.
- Dry-run plans `.claude/skills/scratch-skill` and `.codex/skills/scratch-skill` symlinks if the skill is shared.

## Risks And Mitigations

### Risk: Source metadata becomes misleading

Loose imports will appear as package-backed skills. Current JSON labels that as `sourceType: "npm"`.

Mitigation:

- Use `@local/<skillName>` as `sourceId`.
- Document current meaning.
- Defer type rename until a deliberate JSON compatibility pass.

### Risk: Users expect live linkage to the source file

Library import should be a snapshot, not a live link.

Mitigation:

- Use copy semantics.
- Output installed path.
- Tell users to rerun with `--replace` after edits.

### Risk: `--as` creates a frontmatter mismatch

Downstream tools may read skill identity from frontmatter, not the directory name.

Mitigation:

- Normalize only the copied `SKILL.md` in the synthetic bundle.
- Never modify the original source.
- Emit JSON metadata when the imported snapshot's frontmatter was rewritten.

### Risk: Replacement accidentally shadows a repo skill

Mitigation:

- Keep global skill-name uniqueness by default.
- `--replace` cannot replace repo-native skills.
- `--replace` can replace only the same installed package identity.

### Risk: Symlink escape in loose skill directory

Mitigation:

- Either reject symlinks during synthetic bundle creation or verify symlink targets stay within the source directory.
- Prefer rejecting symlinks in v1 unless there is a known skill asset use case.

### Risk: Package path vs loose directory ambiguity

A directory could theoretically contain both root `SKILL.md` and package files.

Mitigation:

- If it has `package.json` plus `bundle.json`, treat it as package-backed input.
- If it has root `SKILL.md` without bundle files, treat it as loose skill.
- If both exist, require an explicit flag later if this appears in real use. For v1, package-backed should win because that directory has an explicit bundle contract.

## Acceptance Criteria

The implementation is complete when:

1. A direct `SKILL.md` can be imported to the library without manual package wrapping.
2. A loose skill directory can be imported to the library without manual package wrapping.
3. Imported loose skills appear in `drwn library list skills`, `drwn library show`, and `drwn skills list`.
4. Imported loose skills can be activated with `drwn add skill` and materialized by `drwn write`.
5. Direct `SKILL.md` paths work with `drwn card source add-skill --from`.
6. Existing package-backed bundle installation still works.
7. Existing card source directory import still works.
8. Collisions are rejected unless `--replace` is explicitly safe.
9. Store-era writes honor `DRWN_STORE_READONLY`.
10. Docs and help text explain the difference between importing to library and copying into a card.

## Recommended Next Patch Target

Implement Phase 1 plus the minimum safe replacement support:

1. Factor `installSkillBundleRoot`.
2. Add `ingestLooseSkill`.
3. Add loose input classification to `library add skill` and `skills packages add`.
4. Add direct `SKILL.md` support to `card source add-skill --from`.
5. Add focused tests for those behaviors.

This is the best target because it solves the actual workflow without disturbing downstream resolution, card publishing, project config, or the package-backed bundle contract.
