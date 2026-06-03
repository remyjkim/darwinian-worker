# Card Catalog Publish CLI Target Architecture

**Date**: 2026-06-03
**Status**: Target architecture
**Scope**: First-class `drwn` CLI support for publishing already-pushed Harness Cards into a Git-backed card catalog, plus the additional skill needed to operate the workflow reliably.

---

## Executive Summary

`drwn` already has the consumer side of card catalogs:

- `drwn library catalog add/list/refresh/remove` registers and refreshes local catalog clones.
- `drwn search card <query>` searches registered catalog manifests.
- `drwn card publish`, `drwn card remote`, and `drwn card push` publish card refs to a card Git remote.

The missing surface is the producer-side catalog publication step: "take this published card ref and add it to an upstream catalog repository so teammates can discover it."

The recommended first-class command is:

```bash
drwn card catalog publish <card-ref> \
  --catalog <scope|git-url|path> \
  --mode local|direct|pr \
  [--name <catalog-entry-name>] \
  [--description <text>] \
  [--tag <tag>]... \
  [--url <installable-card-url>] \
  [--replace] \
  [--dry-run] \
  [--json]
```

For MVP, implement `--mode local` and `--mode direct` first. Defer `--mode pr` until the direct workflow is fully covered by tests.

The matching new skill should be:

```text
publish-card-to-catalog
```

This should remain separate from `author-harness-card`, `share-harness-card`, and `manage-harness-library` because it mutates a different shared artifact: the catalog repository's `catalog.json`.

---

## Investigation Inputs

### Local Code

- `cli/core/card-catalog.ts`: catalog schema, local registration, refresh, and search.
- `cli/commands/library/catalog.ts`: local catalog management commands.
- `cli/commands/search/card.ts`: registered catalog search.
- `cli/commands/card/publish.ts`: local immutable card publication.
- `cli/commands/card/remote.ts`: card remote configuration.
- `cli/commands/card/push.ts`: card Git push.
- `cli/commands/card/validate.ts`: consumer-side card ref validation.
- `cli/core/card-store.ts`: card ref parsing, Git-origin resolution, semver tag selection, and local store extraction.
- `cli/core/git.ts`: Git process wrappers used by card distribution.
- `test/commands-card-catalog.test.ts`: catalog registration/search coverage.
- `test/core-card-store-git.test.ts`: Git-origin card resolution coverage.

### Local Analysis And Knowledge

- `.ai/analyses/51_drwn-vs-claude-code-plugin-marketplace-comparative-analysis.md`
- `.ai/analyses/53_remote-card-publishing-usage-pattern-manual.md`
- `.ai/knowledges/03_npm-skill-bundles-guide.md`

### External References

- Claude Code docs: "Discover and install prebuilt plugins through marketplaces"  
  `https://code.claude.com/docs/en/discover-plugins`
- Claude Code docs: "Create and distribute a plugin marketplace"  
  `https://code.claude.com/docs/en/plugin-marketplaces`
- npm docs: "Creating and publishing scoped public packages"  
  `https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/`

The external pattern is consistent: marketplace/catalog registration is separate from content installation; marketplace files point to plugin/content sources; shared publication requires validation and a Git/auth path. npm adds one useful analogy: publishing is a deliberate mutation of a public namespace and should have explicit validation and authentication boundaries.

---

## Current State

### Command Surface Audit

The current registered command paths have no `card catalog` namespace and no direct collision with:

```text
drwn card catalog publish
```

Relevant adjacent commands are:

```text
drwn card publish <name>                 # local immutable card-store publish
drwn card remote add|set|list|remove     # local card repo remote config
drwn card push <name>                    # push local card repo refs
drwn card validate <ref>                 # resolve and validate one card ref
drwn library catalog add|list|refresh|remove
drwn search card <query>
drwn add <spec>                          # top-level alias for drwn card add
drwn card add <spec>                     # project consumption, not publication
```

The proposed command is intentionally not:

- `drwn card publish --catalog ...`: `card publish` already has a tight contract: publish one editable source into the local immutable card store. Catalog mutation should not be hidden behind that existing verb.
- `drwn library catalog publish ...`: `library catalog` already means consumer-side local catalog registration and cache refresh. Publishing to an upstream catalog is producer-side card distribution.
- `drwn search card --publish ...`: search is discovery-only.
- `drwn add card ...`: add/apply/pin are project-consumption surfaces and update project config plus `card.lock`.

One pre-existing documentation mismatch surfaced during the audit: the Docusaurus add reference documents `drwn add card <ref>`, while the live CLI exposes `drwn add <spec>` as the top-level card alias and `drwn card add <spec>` as the explicit card command. This does not conflict with `drwn card catalog publish`, but CLI docs should be corrected separately or the missing `drwn add card` alias should be added deliberately.

### Catalog Schema

`cli/core/card-catalog.ts` currently defines catalog v1:

```ts
interface CatalogManifest {
  catalogVersion: 1;
  scope: string;
  description?: string;
  homepage?: string;
  cards: Array<{
    name: string;
    url: string;
    description?: string;
    tags?: string[];
  }>;
  maintainers?: Array<{ name: string; email?: string }>;
}
```

Cards listed in a catalog use unscoped names. The catalog scope creates the visible search identity:

```text
scope "@curation-labs" + card "personal-harness" => @curation-labs/personal-harness
```

The `url` field is currently discovery payload, but it should remain directly installable for MVP:

```text
git+https://github.com/remyjkim/personal-harness-card.git#v0.1.0
```

### Registered Catalogs

`drwn library catalog add <url>` clones a catalog repo as a bare clone under:

```text
~/.agents/drwn/catalogs/<slug>
```

Registration metadata lives at:

```text
~/.agents/drwn/catalogs.json
```

This local cache is intentionally consumer-side. It should not be edited in place by a publishing command, because bare shallow clones are not authoring worktrees.

### Card Publishing

`drwn card publish <name>` creates immutable local card commits and tags in:

```text
~/.agents/drwn/cards/<scope>/<name>.git
```

`drwn card remote add|set <name> <url>` configures a Git remote and stores `drwn.originUrl`.

`drwn card push <name>` pushes `refs/heads/main` and tags. Git authentication is delegated to system Git.

### Gap

The current required manual catalog publication flow is:

```bash
drwn card publish @team/baseline
drwn card validate @team/baseline@0.1.0
drwn card remote add @team/baseline git@github.com:team/baseline-card.git
drwn card push @team/baseline

git clone git@github.com:curation-labs/dh-cards-catalog-v1.git
$EDITOR catalog.json
git add catalog.json
git commit -m "catalog: add baseline card"
git push

drwn library catalog refresh @curation-labs
drwn search card baseline
```

The missing command owns the middle Git/catalog mutation.

---

## Design Goals

1. Make card discoverability a first-class CLI workflow.
2. Keep the catalog as a Git-backed artifact, not a registry service.
3. Preserve catalog v1 for MVP.
4. Default catalog entries to immutable, installable card refs.
5. Require explicit mutation mode for shared catalog changes.
6. Reuse existing card resolution and validation logic.
7. Reuse system Git authentication; do not store credentials or tokens.
8. Provide `--dry-run --json` for review, automation, and skill-driven workflows.
9. Keep local catalog registration separate from upstream catalog authoring.
10. Design so catalog-backed alias resolution can be added later without rewriting the publish workflow.
11. Avoid mutating the main `~/.agents/drwn` store during dry-run and catalog URL smoke validation.

---

## Non-Goals

- No hosted registry service.
- No npm publication for cards in this command.
- No automatic GitHub repository creation in MVP.
- No force-push behavior.
- No secret handling or credential storage.
- No catalog schema v2 requirement for MVP.
- No automatic merge conflict resolution.
- No in-app marketplace TUI in this phase.

---

## Recommended CLI Shape

### Primary Command

```bash
drwn card catalog publish <card-ref> \
  --catalog <scope|git-url|path> \
  --mode local|direct|pr \
  [--name <catalog-entry-name>] \
  [--description <text>] \
  [--tag <tag>]... \
  [--url <installable-card-url>] \
  [--replace] \
  [--dry-run] \
  [--json]
```

### Examples

Publish to a shared catalog directly:

```bash
drwn card catalog publish @remyjkim/personal-harness@0.1.0 \
  --catalog git@github.com:curation-labs/dh-cards-catalog-v1.git \
  --name personal-harness \
  --tag baseline \
  --tag skills \
  --mode direct
```

Preview the change against a registered catalog scope:

```bash
drwn card catalog publish @remyjkim/personal-harness@0.1.0 \
  --catalog @curation-labs \
  --mode local \
  --dry-run \
  --json
```

Use an explicit install URL when the card ref cannot imply one:

```bash
drwn card catalog publish @team/baseline@0.2.0 \
  --catalog ./dh-cards-catalog-v1 \
  --url git+https://github.com/team/baseline-card.git#v0.2.0 \
  --mode local
```

Future PR mode:

```bash
drwn card catalog publish @team/baseline@0.2.0 \
  --catalog git@github.com:curation-labs/dh-cards-catalog-v1.git \
  --mode pr
```

### Why Under `card catalog`

`library catalog` means "manage local catalog registrations." Publishing to an upstream catalog is card distribution, not local library management. The namespace should communicate that distinction:

```text
drwn library catalog add      # consumer-side registration
drwn search card              # consumer-side discovery
drwn card catalog publish     # producer-side discoverability
```

---

## Mode Semantics

### `--mode local`

Use for local review or manual commit.

Behavior:

1. Resolve the target catalog to a normal working checkout.
2. Read and update `catalog.json`.
3. Validate the result.
4. Do not commit.
5. Do not push.

If `--catalog` is a Git URL, clone to a temporary or user-specified working directory. If `--catalog` is a local path, mutate that path unless `--dry-run` is set.

Recommended MVP detail: for Git URLs in `--mode local`, require `--output <path>` or use a temporary checkout and print the generated `catalog.json` path. The simpler implementation is to support local paths first and clone URLs for `direct` mode.

### `--mode direct`

Use for maintainers with direct push rights to the catalog repository.

Behavior:

1. Clone or open a working checkout.
2. Pull/fetch the default branch.
3. Update and validate `catalog.json`.
4. Commit with a deterministic message.
5. Push to the catalog's default branch.
6. Refresh the registered local catalog if the catalog is registered.
7. Search for the newly published entry when possible.

Suggested commit message:

```text
catalog: add <entry-name> card
```

For replacement:

```text
catalog: update <entry-name> card
```

### `--mode pr`

Use for contributors without direct push rights or for reviewed team catalogs.

Defer from MVP unless implementation is cheap after `direct`.

Behavior:

1. Clone or open a working checkout.
2. Create a branch:

   ```text
   drwn/catalog/<entry-name>-<version>
   ```

3. Update and validate `catalog.json`.
4. Commit.
5. Push branch.
6. Open a pull request via `gh pr create`.

Requirements:

- `gh` installed.
- `gh auth status` succeeds for the target host.
- Clear fallback message if `gh` is unavailable.

---

## Catalog Target Resolution

`--catalog` should accept three forms.

### Registered Scope

```bash
--catalog @curation-labs
```

Resolution:

1. Load `~/.agents/drwn/catalogs.json`.
2. Find the entry whose `scope` is `@curation-labs`.
3. Use the entry URL as the upstream authoring source.
4. Clone a normal working checkout for mutation.

Do not mutate the existing bare catalog cache in `~/.agents/drwn/catalogs`.

### Git URL

```bash
--catalog git@github.com:curation-labs/dh-cards-catalog-v1.git
--catalog https://github.com/curation-labs/dh-cards-catalog-v1.git
```

Resolution:

1. Clone into a temporary working checkout.
2. Determine default branch through Git.
3. Mutate root `catalog.json`.

### Local Path

```bash
--catalog ./dh-cards-catalog-v1
```

Resolution:

1. Treat the path as a normal Git working checkout or a plain local directory.
2. Require root `catalog.json`.
3. Mutate in place unless `--dry-run`.
4. Commit/push only if it is a Git worktree and `--mode direct|pr`.

---

## Card Ref Resolution And Install URL Derivation

The command should resolve the requested card with the existing card resolver, but it must choose the resolver store deliberately:

- Store-origin refs such as `@team/baseline@0.1.0` should resolve against the user's normal `agentsDir`.
- Git-origin refs such as `git+https://github.com/team/baseline-card.git#v0.1.0` should resolve in an isolated temporary store when running validation or dry-run flows, so catalog publication does not implicitly import cards into the user's main store.
- If the command cannot resolve a store-origin ref from the normal store, it should fail with guidance to run `drwn card publish`, `drwn card clone`, or pass an explicit `--url`.

From the resolved card:

- `name`
- `version`
- `manifest.description`
- `origin`
- `git.url`
- `git.ref`
- `git.commit`
- `integrity`

### Entry Name

Default:

```text
unscoped part of resolved manifest name
```

Examples:

```text
@remyjkim/personal-harness -> personal-harness
@team/baseline -> baseline
```

Allow override:

```bash
--name personal-harness
```

Validation:

- Must satisfy current unscoped card name rules: `^[a-z0-9-]+$`.
- Must not include `/`.
- Must not be empty.

### Description

Default:

```text
resolved.manifest.description
```

Allow override:

```bash
--description "Personal baseline harness with Codex skills and MCP setup"
```

If neither exists, omit the field.

### Tags

Use repeated flags:

```bash
--tag baseline --tag codex --tag mcp
```

Validation:

- Lowercase slug preferred: `^[a-z0-9-]+$`.
- Sort and de-duplicate in output.

### Installable URL

Default logic:

1. If `--url` is present, use it exactly after validating it parses as a card ref.
2. If resolved card has `git.url` and strict semver version, emit:

   ```text
   git+<resolved.git.url>#v<resolved.version>
   ```

3. Else if local store bare repo has `drwn.originUrl`, emit:

   ```text
   git+<originUrl>#v<resolved.version>
   ```

4. Else refuse with a clear error:

   ```text
   Cannot infer an installable catalog URL for @scope/name@version.
   Push the card to a Git remote first or pass --url git+<remote>#v<version>.
   ```

For MVP, prefer immutable tag refs over semver ranges:

```text
git+https://github.com/org/card.git#v0.1.0
```

Later alias resolution can support catalog entries that point to repo URLs plus version ranges, but v1 catalog publication should prioritize copy-paste installability and reproducibility.

---

## Core Module Design

Add:

```text
cli/core/card-catalog-publish.ts
```

Recommended public functions:

```ts
export interface PublishCardToCatalogOptions {
  agentsDir: string;
  cardRef: string;
  catalog: string;
  mode: "local" | "direct" | "pr";
  name?: string;
  description?: string;
  tags?: string[];
  url?: string;
  replace?: boolean;
  dryRun?: boolean;
}

export interface PublishCardToCatalogResult {
  ok: boolean;
  mode: "local" | "direct" | "pr";
  catalog: {
    input: string;
    scope: string;
    url?: string;
    path: string;
  };
  card: {
    requested: string;
    name: string;
    version: string;
    integrity: string;
    installUrl: string;
  };
  entry: {
    name: string;
    url: string;
    description?: string;
    tags?: string[];
  };
  action: "add" | "replace" | "noop";
  changed: boolean;
  commit?: string;
  branch?: string;
  pullRequestUrl?: string;
  warnings: string[];
  next: string[];
}

export async function publishCardToCatalog(
  options: PublishCardToCatalogOptions,
): Promise<PublishCardToCatalogResult>;
```

Internal helpers:

- `resolveCatalogTarget(...)`
- `loadCatalogManifestFromWorktree(...)`
- `validateCatalogManifestStrict(...)`
- `buildCatalogEntryFromResolvedCard(...)`
- `upsertCatalogEntry(...)`
- `writeCatalogManifestStable(...)`
- `validateCatalogEntryInstallUrl(...)`
- `commitCatalogChange(...)`
- `pushCatalogChange(...)`
- `refreshRegisteredCatalogIfPresent(...)`

### Why A Separate Core Module

`cli/core/card-catalog.ts` currently owns consumer-side catalog indexing and search. Adding upstream write, Git worktree mutation, commit, and push behavior there would blur responsibilities. A separate module makes the split clear:

```text
card-catalog.ts          # registered catalog cache and search
card-catalog-publish.ts  # upstream catalog authoring and publication
```

---

## Command Module Design

Add:

```text
cli/commands/card/catalog-publish.ts
```

Register in:

```text
cli/index.ts
```

Clipanion path:

```ts
static override paths = [["card", "catalog", "publish"]];
```

The command should remain thin:

1. Parse options.
2. Call `publishCardToCatalog`.
3. Render JSON or human output.
4. Convert known domain errors into clear CLI failures.

Human success output should be concise:

```text
Added personal-harness to @curation-labs catalog.
Catalog: git@github.com:curation-labs/dh-cards-catalog-v1.git
Card: git+https://github.com/remyjkim/personal-harness-card.git#v0.1.0
Pushed commit <sha>.

Next:
  drwn library catalog refresh @curation-labs
  drwn search card personal-harness --scope @curation-labs
```

Dry-run output:

```text
Would add personal-harness to @curation-labs catalog.
No files written.
```

---

## Catalog Manifest Write Rules

Keep the root shape stable:

```json
{
  "catalogVersion": 1,
  "scope": "@curation-labs",
  "description": "Curation Labs Harness Card catalog",
  "cards": [
    {
      "name": "personal-harness",
      "url": "git+https://github.com/remyjkim/personal-harness-card.git#v0.1.0",
      "description": "Personal baseline harness with skills and MCP setup",
      "tags": ["baseline", "skills"]
    }
  ],
  "maintainers": [
    {
      "name": "Curation Labs"
    }
  ]
}
```

Write behavior:

- Preserve top-level optional fields.
- Preserve unknown top-level fields only if the validator explicitly allows them; otherwise reject for v1 strictness.
- Sort `cards` by `name`.
- Sort and de-duplicate `tags`.
- Keep two-space JSON formatting with trailing newline.
- Avoid rewriting when the resulting JSON is identical.

Duplicate behavior:

- If `name` does not exist: add.
- If `name` exists with same URL/description/tags: `noop`.
- If `name` exists with different payload and `--replace` absent: fail.
- If `name` exists with different payload and `--replace` present: replace.

Recommended duplicate error:

```text
Catalog already contains card "personal-harness".
Use --replace to update it, or choose a different --name.
```

---

## Validation Rules

### Catalog Validation

Validate both before and after mutation:

- `catalogVersion === 1`
- `scope` is `@scope` shape: `^@[a-z0-9-]+$`
- `cards` is an array
- each card has unscoped `name`
- each card has non-empty `url`
- no duplicate card names
- optional `description` is a string
- optional `tags` is string array
- optional `maintainers` is array of `{ name, email? }`

Current `card-catalog.ts` has a permissive manifest reader. Publishing should use stricter validation because it authors shared artifacts.

### Card URL Validation

For MVP, validate `entry.url` by:

1. Parsing as a card ref with existing `parseCardRef`.
2. Requiring supported origin:
   - `git`
   - future: `npm`
3. Resolving with `resolveCard` in a temporary isolated store by default.
4. Ensuring resolved manifest name and version are sane.

Prefer a temporary isolated store for smoke validation. `resolveCard` can mutate the main store when a Git-origin card is not already present, because it may clone a bare repo, extract a tree, and write URL-card-name mappings. Catalog publication must not create those side effects in `~/.agents/drwn` during `--dry-run`, and should avoid them during normal catalog validation unless the user explicitly asked to import a card.

The validation should not require that catalog entry name equals manifest unscoped name. It should warn if different:

```text
warning: catalog entry @curation-labs/personal-harness points to card manifest @remyjkim/personal-harness
```

This allows curated catalogs to expose team aliases without rewriting card manifests.

### Git Validation

For `direct` and `pr`:

- Ensure the target is a Git worktree.
- Ensure working tree is clean before mutation unless the command created the clone.
- Ensure `catalog.json` exists at root.
- Fail on non-fast-forward push with Git's own message plus guidance to refresh/retry.

---

## Auth And Permission Model

Do not introduce a drwn-specific auth layer.

Git operations should use system Git:

- SSH keys
- HTTPS credential helpers
- GitHub CLI credential helper
- enterprise Git configuration

`--mode direct` therefore requires normal Git push rights.

`--mode pr` requires:

- ability to push a branch to the chosen remote or fork
- `gh` installed and authenticated

If another user wants to publish to a shared catalog, the answer should be:

- Direct mode: yes, they need Git push permission to the catalog repo.
- PR mode: they need enough GitHub/Git auth to push a branch or fork and open a PR.
- Local mode: no network auth required unless the catalog must be cloned from a private remote.

The CLI should make this explicit in errors and docs.

### Read-Only Store Behavior

`DRWN_STORE_READONLY=1` currently blocks writes under `~/.agents/drwn`, including local catalog cache updates. It does not block external Git worktree mutations or downstream tool writes by itself.

For this command:

- `--dry-run` must not mutate the catalog repo and must not mutate the main drwn store.
- URL smoke validation should use an isolated temporary store to avoid main-store side effects.
- If direct mode would refresh a registered catalog after pushing, that refresh must be skipped with a warning or fail before the external push when `DRWN_STORE_READONLY=1`; it must not push successfully and then fail halfway through local cache refresh.
- Local `--catalog <path>` mutation is governed by `--dry-run` and Git permissions, not by `DRWN_STORE_READONLY`, because the path is outside the drwn store.

---

## Relationship To Catalog-Backed Alias Resolution

This command can ship before alias resolution.

Current catalog entries should use installable URLs:

```text
git+https://github.com/org/card.git#v0.1.0
```

Later, alias resolution can make this possible:

```bash
drwn add @curation-labs/personal-harness@0.1.0
```

Resolution layer:

1. Parse `@scope/name@range`.
2. If not found in local store, search registered catalogs by exact `scope/name`.
3. Resolve the catalog entry URL through existing `resolveCard`.
4. Lock the concrete Git commit and integrity.

The publish command does not need to wait for this. It simply creates clean catalog entries that alias resolution can consume later.

---

## Skill Addition

Add a new skill in the skills repo:

```text
skills/publish-card-to-catalog/SKILL.md
```

Suggested frontmatter:

```yaml
---
name: publish-card-to-catalog
description: Publish an already-authored and pushed Darwinian Harness Card into a Git-backed card catalog so teammates can discover it with drwn search card. Use when the user wants to add or update catalog.json entries, validate catalog discoverability, open or prepare a catalog PR, or reason about direct vs reviewed catalog publication.
---
```

Core workflow the skill should teach:

1. Verify card source quality:

   ```bash
   drwn card source doctor <card-name>
   ```

   If the installed CLI does not support source doctor arguments, run the available source doctor command and inspect the target source.

2. Publish the card locally:

   ```bash
   drwn card publish <card-name>
   ```

3. Validate the immutable ref:

   ```bash
   drwn card validate <card-name>@<version>
   ```

4. Ensure a remote exists and push:

   ```bash
   drwn card remote list <card-name> --json
   drwn card push <card-name>
   ```

5. Publish to catalog:

   ```bash
   drwn card catalog publish <card-name>@<version> \
     --catalog <catalog-scope-or-url-or-path> \
     --mode direct
   ```

6. Refresh and verify discoverability:

   ```bash
   drwn library catalog refresh <scope>
   drwn search card <entry-name> --scope <scope> --json
   ```

7. If direct push is not allowed, switch to PR or local handoff:

   ```bash
   drwn card catalog publish <card-name>@<version> \
     --catalog <catalog-url-or-path> \
     --mode local \
     --dry-run \
     --json
   ```

Why separate skill:

- `author-harness-card` owns card source strategy.
- `share-harness-card` owns card remote push strategy.
- `manage-harness-library` owns local library/catalog registration.
- `publish-card-to-catalog` owns shared catalog mutation and discoverability verification.

Recommended updates to existing skills:

- `author-harness-card`: after successful publish, mention `share-harness-card` for Git remote publication and `publish-card-to-catalog` for discoverability.
- `share-harness-card`: after successful remote push, hand off to `publish-card-to-catalog` when the user wants teammates to find the card through search.
- `manage-harness-library`: clarify that it registers and refreshes catalogs locally; it does not publish upstream catalog entries.

---

## Implementation Plan

### Phase 1: Core Local Mutation

Add `cli/core/card-catalog-publish.ts` with:

- strict catalog manifest validation
- catalog entry derivation from resolved card
- duplicate/noop/replace behavior
- stable JSON write
- dry-run result payload

Add command:

```bash
drwn card catalog publish <card-ref> --catalog <path> --mode local
```

Test first:

- dry-run add does not write
- local mode writes expected `catalog.json`
- duplicate without `--replace` fails
- duplicate with same payload is noop
- duplicate with `--replace` updates
- invalid catalog schema fails
- invalid entry name fails
- inferred URL uses card remote origin and `#v<version>`

### Phase 2: Direct Git Publication

Extend catalog target resolution to Git URLs and registered scopes.

Add:

- working checkout clone for Git URL/scope
- commit
- push
- registered catalog refresh when applicable
- search verification where possible

Test first:

- direct mode clones a local bare catalog remote, commits, pushes
- registered `@scope` resolves to catalog URL and pushes
- non-fast-forward push reports Git failure cleanly
- direct mode refuses dirty local worktree
- JSON result includes commit SHA and next commands

### Phase 3: PR Mode

Add:

- branch creation
- `gh auth status`
- `gh pr create`
- fallback guidance when `gh` is unavailable

Test with mocked process runner where possible; keep live GitHub behavior manual-only.

### Phase 4: Skill And Docs

In `darwinian-harness-skills`:

- add `publish-card-to-catalog`
- update `author-harness-card`
- update `share-harness-card`
- update `manage-harness-library`
- sync bundled cards
- validate skills and card bundles

In docs:

- add CLI reference for `drwn card catalog publish`
- add guide section in card sharing docs
- add catalog authoring guide for maintainers
- mention auth requirements for direct and PR modes

---

## Test Strategy

Follow `.ai/rules/02_tdd_practices.md`: write focused failing tests before implementation.

Recommended new tests:

```text
test/core-card-catalog-publish.test.ts
test/commands-card-catalog-publish.test.ts
```

### Core Tests

- Builds entry from resolved store-origin card with configured `drwn.originUrl`.
- Builds entry from Git-origin card with `resolved.git.url`.
- Refuses to infer URL for unpublished/local-only cards.
- Validates catalog v1 schema strictly.
- Sorts cards by name.
- Sorts and de-duplicates tags.
- Preserves top-level optional catalog metadata.
- Refuses duplicate names without `--replace`.
- Produces noop when existing entry is identical.
- Replaces existing entry with `--replace`.

### Command Tests

- `--dry-run --json` emits full planned payload and writes no file.
- `--mode local` updates a local checkout.
- `--mode direct` pushes to local bare catalog repo.
- `--catalog @scope` resolves through `catalogs.json`.
- human output includes next refresh/search commands.
- failure output is clear for missing catalog, missing card remote URL, invalid name, dirty worktree, and duplicate entry.

### Manual Tests

- Publish a real card to `git@github.com:curation-labs/dh-cards-catalog-v1.git`.
- Refresh registered catalog.
- Verify `drwn search card <name> --scope @curation-labs`.
- Install by copying the resulting entry URL into `drwn add <url>` or `drwn card validate <url>`.
- PR-mode manual smoke once implemented.

---

## Output Contract

JSON output should be stable enough for skills and scripts:

```json
{
  "ok": true,
  "mode": "direct",
  "catalog": {
    "input": "@curation-labs",
    "scope": "@curation-labs",
    "url": "git@github.com:curation-labs/dh-cards-catalog-v1.git",
    "path": "/tmp/drwn-catalog-..."
  },
  "card": {
    "requested": "@remyjkim/personal-harness@0.1.0",
    "name": "@remyjkim/personal-harness",
    "version": "0.1.0",
    "integrity": "sha256-...",
    "installUrl": "git+https://github.com/remyjkim/personal-harness-card.git#v0.1.0"
  },
  "entry": {
    "name": "personal-harness",
    "url": "git+https://github.com/remyjkim/personal-harness-card.git#v0.1.0",
    "description": "Personal baseline harness",
    "tags": ["baseline", "skills"]
  },
  "action": "add",
  "changed": true,
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "warnings": [],
  "next": [
    "drwn library catalog refresh @curation-labs",
    "drwn search card personal-harness --scope @curation-labs"
  ]
}
```

For failures under `--json`, prefer:

```json
{
  "ok": false,
  "code": "CATALOG_DUPLICATE_CARD",
  "message": "Catalog already contains card \"personal-harness\". Use --replace to update it.",
  "details": {
    "catalog": "@curation-labs",
    "entryName": "personal-harness"
  }
}
```

---

## Error Codes

Recommended domain errors:

- `CATALOG_TARGET_NOT_FOUND`
- `CATALOG_SCOPE_NOT_REGISTERED`
- `CATALOG_INVALID_MANIFEST`
- `CATALOG_DUPLICATE_CARD`
- `CATALOG_ENTRY_NAME_INVALID`
- `CATALOG_ENTRY_URL_INVALID`
- `CATALOG_CARD_REMOTE_MISSING`
- `CATALOG_WORKTREE_DIRTY`
- `CATALOG_COMMIT_FAILED`
- `CATALOG_PUSH_FAILED`
- `CATALOG_PR_TOOL_MISSING`
- `CATALOG_PR_AUTH_FAILED`

Use `DrwnError` so command output can distinguish known domain failures from unexpected exceptions.

---

## Recommended MVP

The best first implementation slice is:

```bash
drwn card catalog publish <card-ref> --catalog <local-path> --mode local --dry-run --json
drwn card catalog publish <card-ref> --catalog <local-path> --mode local
drwn card catalog publish <card-ref> --catalog <git-url|@scope> --mode direct
```

This gives teams a complete path:

1. author card
2. publish card locally
3. push card remote
4. publish catalog entry
5. refresh/search/install from catalog

Defer:

- PR mode
- schema v2
- Git subdirectory catalog entries
- automatic GitHub repo creation
- TUI discovery
- default community catalog auto-registration changes

---

## Open Decisions

1. Should `--mode local` with a Git URL clone to a temp dir or require `--output <path>`?

   Recommendation: for MVP, require a local path for local mode. Support Git URL local-mode later if needed.

2. Should the command allow catalog entry names that differ from card manifest names?

   Recommendation: yes, with a warning. Curated catalogs should be able to expose aliases.

3. Should direct mode use SSH or HTTPS URLs in generated card entry URLs?

   Recommendation: preserve the card remote URL already configured by the author unless `--url` overrides it. For public catalogs, authors should prefer HTTPS card URLs for easier teammate consumption.

4. Should `--replace` update only URL or all entry metadata?

   Recommendation: replace the whole entry payload generated by the command, preserving only fields that are passed or inferred. This keeps behavior predictable.

5. Should default catalog registration point to `curation-labs/dh-cards-catalog-v1`?

   Recommendation: yes after the catalog repo has a valid `catalog.json`, at least one tested public card entry, and a stable ownership decision. Until then, keep the default fail-soft or disable the nonexistent default to avoid confusing new users.

---

## Conclusion

The best design is a catalog-backed publication command, not a registry service and not an extension of local catalog registration. `drwn card catalog publish` should mutate a real catalog repository as an artifact, validate the entry, and optionally push or prepare review.

The command should ship in two pragmatic slices: local mutation and direct Git publication first; PR mode second. The companion `publish-card-to-catalog` skill should encode the full operational sequence from card validation through catalog discoverability verification.
