# DRWN CLI Usage Guide

## Purpose

This is the operator-facing guide for the `drwn` CLI.

Use it for:

- day-to-day command usage
- understanding the local state model
- safe write workflows
- locating deeper manuals for project config, extension bundles, and publishing

For focused subsystem docs, see:

- [02_per-project-config-guide.md](./02_per-project-config-guide.md)
- [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md)
- [04_homebrew-release-checklist.md](./04_homebrew-release-checklist.md)
- [05_npm-publishing-analysis-and-manual.md](./05_npm-publishing-analysis-and-manual.md)

## What `drwn` Is

`drwn` is the operator CLI for `darwinian-harness`.

`darwinian-harness` is the local meta-harness control plane around the agent tools you already use. It organizes reusable inventory, machine-wide defaults, project overlays, downstream tool state, and diagnostics into one local harness.

It operates on this model:

- the packaged or checkout harness source provides built-in defaults
- `~/.agents/drwn` is the Git-backed local store
- `~/.agents/drwn/machine.json` is the machine-wide harness overlay
- `<project>/.agents/drwn/config.json` is the project harness overlay
- `~/.agents/skills` is the curated publication layer
- package-backed skill bundles under `~/.agents/drwn/skills` are optional extension sources
- Claude/Codex/Cursor state is derived from that combined model

The CLI is intentionally conservative:

- write is non-destructive by default
- drwn-owned stale materialization is cleaned up through write records
- user-owned stale state is reported, not silently removed
- `doctor` is report-only
- package-backed skills are made available first, then curated explicitly

## Execution Modes

### Repo-local usage

Use this while developing inside the repo:

```bash
bun run drwn -- --help
bun run drwn -- status
bun run drwn -- write --dry-run
bun run drwn -- skills list
bun run drwn -- mcp list
```

### Global usage

Link the package globally:

```bash
bun link
```

Then use:

```bash
drwn --help
drwn status
drwn write --dry-run
drwn skills list
drwn mcp write --dry-run
```

Both modes execute the same command implementations.

## Local State Model

`drwn` can read and write:

- the packaged or checkout harness source
- `~/.agents`
- `~/.agents/drwn`
- `~/.claude`
- `~/.codex`
- `~/.cursor`
- `<project>/.agents/drwn/config.json`

Important directories:

- built-in shared skills: `skills/shared`
- curated shared skills: `~/.agents/skills`
- package-backed skill bundles: `~/.agents/drwn/skills`
- card bare repositories: `~/.agents/drwn/cards/@scope/name.git`
- card extracted trees: `~/.agents/drwn/extracted/<tree-sha>`
- card catalogs: `~/.agents/drwn/catalogs`
- card catalog index: `~/.agents/drwn/catalogs.json`
- machine-scope Claude downstream skills: `~/.claude/skills`
- machine-scope Codex downstream skills: `~/.codex/skills`
- project-scope downstream state: `<project>/.claude`, `<project>/.codex`, and `<project>/.cursor`

## Recommended First-Run Sequence

```bash
drwn status
drwn skills list
drwn mcp list
drwn write --dry-run
drwn write
```

If you want project-local overrides, scaffold them before writing from that project:

```bash
drwn init
drwn init --non-interactive
```

## Command Groups

Implemented groups:

- `init`
- `add`
- `install`
- `search`
- `library`
- `write`
- `scan`
- `skills`
- `mcp`
- `extensions`
- `card`
- `store`
- `status`
- `doctor`

## Init Command

Use:

```bash
drwn init
drwn init --non-interactive
drwn init --minimal
drwn init --force
```

What it does:

- creates `<project>/.agents/drwn/config.json`
- defaults to guided setup in interactive terminals
- writes a minimal config with `{ "version": 1 }` when `--non-interactive` or `--minimal` is used
- warns if `.gitignore` appears to exclude `.agents`

Use this when one project needs overrides without changing your central machine-wide config.

## Add Commands

`add` mutates the current project config. It does not make skills or MCP servers global defaults and does not silently mutate global target config.

```bash
drwn extensions add parallel
drwn extensions add parallel --mcp
drwn extensions add beads --target=codex,claude --include-skill
drwn extensions add markitdown
drwn add <card-ref>
drwn add skill <skill-name-or-query>
drwn add mcp <server-name>
```

`drwn add <card-ref>` is the top-level card add path. It resolves the card immediately, writes the card ref to the current project config, and refreshes `<project>/.agents/drwn/card.lock`.

Use `--library` on skill and MCP adds to restrict lookup to local inventory only. Without `--library`, `add skill` can search configured npm skill catalogs and install an unambiguous result when `--yes` is supplied. `add mcp` can add from trusted MCP catalog files when configured and confirmed with `--yes`.

## Card Commands

Cards package reusable project harness intent. A project records card refs in
`<project>/.agents/drwn/config.json`, exact resolutions in
`<project>/.agents/drwn/card.lock`, and project-local materialized state under
`<project>/.claude`, `<project>/.codex`, and `<project>/.cursor`.

Published cards are stored as per-card bare Git repositories under
`~/.agents/drwn/cards/@scope/name.git`. Version tags identify releases, and
materialized content is extracted under `~/.agents/drwn/extracted/<tree-sha>`.
The project lockfile is forward-only `lockfileVersion: 2`; store and Git-origin
entries include `git.commit` as the integrity anchor.

Authoring and publishing:

```bash
drwn card new @me/backend --no-git
drwn card new backend --scope @me --no-git
drwn card new @me/project-harness --from-project .
drwn card publish @me/backend
drwn card show @me/backend@1.0.0
drwn card diff @me/backend@1.0.0 @me/backend@1.1.0
drwn card deprecate @me/backend@1.0.0
drwn card validate @me/backend@1.0.0
```

`card new --from-project` snapshots the current project's effective harness
into a self-contained source under `~/.agents/drwn/sources/<scope>/<name>/`.
It copies active skill content, records active MCP server definitions, and
preserves effective extension and target intent. It never reads host environment
variable values into the captured card.

Card source commands edit that source tree before publication. A card source is
mutable authoring state. A published card is an immutable Git-backed release in
the local store. A consumed card is a project ref and lock entry that points at
a published store release, file source, or Git origin.

Inspect source state:

```bash
drwn card source list
drwn card source show @me/backend
drwn card source show @me/backend --json
drwn card source doctor
drwn card source doctor @me/backend
```

Edit bundled skills and MCP definitions:

```bash
drwn card source add-skill @me/backend reviewer
drwn card source add-skill @me/backend reviewer --from ./skills/reviewer
drwn card source remove-skill @me/backend reviewer
drwn card source remove-skill @me/backend reviewer --keep-files
drwn card source add-mcp @me/backend context7
drwn card source add-mcp @me/backend context7 --from ./context7.json
drwn card source remove-mcp @me/backend context7
drwn card source remove-mcp @me/backend context7 --keep-files
```

Update manifest metadata and quality signals:

```bash
drwn card source set @me/backend --description "Backend review harness"
drwn card source set @me/backend --version 0.1.0 --stability stable
drwn card source set @me/backend --last-validated-with 0.1.0 --test-status-badge https://example.com/status.svg
```

Source commands honor `DRWN_STORE_READONLY=1`: inspection and dry runs work,
but real source mutations fail before writing. `doctor` is report-only and exits
successfully after printing any source issues it found.

Card manifests may include optional quality signals:

```json
{
  "stability": "stable",
  "lastValidatedWith": "0.1.0",
  "testStatusBadge": "https://example.com/status.svg"
}
```

These fields are informational and appear in `drwn card show` and
`drwn card show --json`. `skills.shared` remains reserved; cards should continue
to bundle skills through `skills.include` until a later registry wave activates
shared registry references.

Project consumption:

```bash
drwn apply @me/backend@^1.0.0
drwn add @me/backend@^1.0.0
drwn card apply @me/backend@^1.0.0 --write
drwn card add @me/observability@^1.0.0
drwn card pin @me/backend@1.0.0
drwn card remove @me/observability
drwn card detach
drwn card update
drwn update
drwn card outdated
drwn card outdated --check
drwn card outdated --fetch
drwn card list
drwn card status --explain
```

Supported card refs:

```bash
drwn add @me/backend@^1.0.0
drwn add file:../path/to/card-source
drwn add git+https://github.com/owner/repo.git#v1.0.0
drwn add git+https://github.com/owner/repo.git@^1.0.0
drwn add github:owner/repo#v1.0.0
drwn add github:owner/repo@^1.0.0
drwn add gitlab:owner/repo#v1.0.0
drwn add gitlab:owner/repo@^1.0.0
```

Use `file:../path/to/card-source` refs for local card development. Use `git+`,
`github:`, or `gitlab:` refs when a project should consume a card from a Git
remote. Git credentials are handled by Git itself; `drwn` does not store them.
When drwn discovers a card name from a Git URL, it records the mapping in
`~/.agents/drwn/url-card-map.json`. This cache is an optimization only; stale
or corrupt entries are corrected or ignored during resolution.

Team sharing:

```bash
drwn card remote add @team/backend <git-url>
drwn card remote list @team/backend
drwn card remote set @team/backend <git-url>
drwn card remote remove @team/backend
drwn card push @team/backend
drwn card fetch @team/backend
drwn card clone git+<git-url>#v1.0.0
drwn card clone git+<git-url>@^1.0.0 --json
```

The default remote name is `origin`. Use `--name <remote>` with `card remote`
commands and `--remote <remote>` with `card push` / `card fetch` when a card has
more than one remote.

Machine-readable card output is available on inspection commands:

```bash
drwn card show @me/backend@1.0.0 --json
drwn card list --json
drwn card diff @me/backend@1.0.0 @me/backend@1.1.0 --json
drwn card outdated --json
drwn card status --json
drwn card validate @me/backend@1.0.0 --json
```

`card show --json` includes recent Git history for Git-backed cards. `card diff`
combines the semantic card-change classification with the real Git diff between
the selected versions.

## Install Command

Use `install` after cloning a project that already has
`<project>/.agents/drwn/card.lock`.

```bash
drwn install
drwn install --no-apply
drwn install --frozen
drwn install --json
```

Behavior:

- reads the project card lockfile
- ensures every locked store/Git-origin card is present locally
- clones or fetches Git-backed card repos when needed
- refreshes extracted paths if the lockfile points at content not yet materialized
- runs `drwn write` unless `--no-apply` is passed
- fails with `--frozen` instead of cloning, fetching, or changing `card.lock`

## Search Commands

`search` discovers candidates from the local library and configured catalogs by default.

```bash
drwn search skill <query>
drwn search skill <query> --library
drwn search skill <query> --catalog
drwn search skill <query> --json
drwn search mcp <query>
drwn search mcp <query> --json
drwn search card <query>
drwn search card <query> --json
```

`--library` means the user's local inventory only. Online sources are catalogs, not the local library.

`search card` searches registered Git-backed card catalogs. Catalog repos expose
cards through a `cards.json` file and must be registered locally before their
entries appear.

## Library Commands

`library` manages and inspects local reusable inventory. `library defaults` manages the machine-wide active set.

```bash
drwn library list
drwn library list skills
drwn library list mcp
drwn library show <id>
drwn library add skill <npm-package-or-local-path>
drwn library add mcp <json-file> --as <server-id>
drwn library catalog list
drwn library catalog add <name> <git-url>
drwn library catalog remove <name>
drwn library defaults list
drwn library defaults add skill <skill-name>
drwn library defaults remove skill <skill-name>
drwn library defaults add mcp <server-name>
drwn library defaults remove mcp <server-name>
```

`library add skill` installs a package-backed skill bundle under the active store (`~/.agents/drwn/skills`). It does not add the skill to the current project; use `drwn add skill <skill-name>` for that.

`library add mcp` registers a reusable MCP definition in the active MCP library (`~/.agents/drwn/mcp-servers/<id>.json`). It does not activate the MCP globally or for a project.

`library catalog` manages Git-backed card catalogs used by `drwn search card`.
The default community catalog is pre-registered but not fetched automatically.
`library catalog add` clones the catalog and records it in
`~/.agents/drwn/catalogs.json`; `library catalog remove` removes non-default
catalog registrations and local clones.

`library defaults add` makes an available skill or MCP server active globally by writing machine config under `~/.agents/drwn/machine.json`. Use project `drwn add ...` when only the current project should use something.

## Write Command

Use:

```bash
drwn write
drwn write --dry-run
drwn write --json
drwn write --target=claude
drwn write --mcp-only
drwn write --skills-only
drwn write --force
```

`write` is the primary one-way materialization command. It reads global config, project config, card locks, and local inventory, then writes effective state into downstream tools.

When run inside a project with `<project>/.agents/drwn/config.json`, `write`
materializes project-local state under `<project>/.claude`,
`<project>/.codex`, and `<project>/.cursor`. Outside a configured project, it
materializes machine-scope state under `~/.claude`, `~/.codex`, and `~/.cursor`.

Write records make cleanup explicit:

- project writes use `<project>/.agents/drwn/write-record.json`
- machine writes use `~/.agents/drwn/global-write-record.json`
- drwn-owned paths that leave the effective state are removed on the next write
- user-owned replacements are preserved and reported
- `--force` is only for overwriting drift inside drwn-managed file regions

## Store Commands

The local store lives under `~/.agents/drwn`. Card content is Git-backed:

- per-card bare repos: `~/.agents/drwn/cards/@scope/name.git`
- extracted trees: `~/.agents/drwn/extracted/<tree-sha>`
- catalogs: `~/.agents/drwn/catalogs`
- machine config: `~/.agents/drwn/machine.json`
- Git URL name cache: `~/.agents/drwn/url-card-map.json`

Inspect store state:

```bash
drwn store status
drwn store status --json
drwn store verify
drwn store verify --json
```

Migrate a pre-card-store layout:

```bash
drwn store migrate
drwn store migrate --json
drwn store migrate --yes
```

`store migrate` is explicit. Ordinary commands warn when they detect a
pre-card-store layout, but they do not silently migrate it. Migration stages the new
store, validates it, archives the old layout, then activates
`~/.agents/drwn`.

Migrate legacy per-version card directories to Git-backed card repos:

```bash
drwn store migrate-to-git
drwn store migrate-to-git --dry-run --json
```

`store migrate-to-git` converts `cards/<scope>/<name>/<version>/` directories
into one bare Git repo per card with version tags. It verifies each legacy
version's `.integrity` when present, removes stale temporary repos before retry,
and is idempotent after a successful migration.

Maintenance:

```bash
drwn store gc
drwn store export --out /tmp/drwn-store.tar
DRWN_STORE_READONLY=1 drwn card publish @me/backend
```

`store gc` runs `git gc` in each local card repo. `store export` writes a tar
archive of `~/.agents/drwn`. `DRWN_STORE_READONLY=1` refuses store mutations,
which is useful for validation workflows against mounted or unpacked snapshots.

## Scan Command

Use:

```bash
drwn scan
drwn scan --json
```

`scan` is currently a placeholder. Its planned role is non-mutating local harness discovery: inspect existing local agent tool config, report candidates for library/default/project config, and avoid writing files unless a future explicit import/write step is added.

## Skills Commands

### List skills

Human-readable:

```bash
drwn skills list
```

JSON:

```bash
drwn skills list --json
```

What it shows:

- skill name
- scope
- curation state
- whether it is linked into Claude
- whether it is linked into Codex
- source metadata for package-backed skills in JSON mode

### Manage package-backed skill bundles

Add a bundle:

```bash
drwn skills packages add <npm-package-or-local-path>
```

List installed bundles:

```bash
drwn skills packages list
drwn skills packages list --json
```

Inspect one installed bundle:

```bash
drwn skills packages show <package-name>
drwn skills packages show <package-name> --json
```

Behavior:

- a bundle is ingested into the active managed cache (`~/.agents/drwn/skills`)
- adding a bundle does not curate or write any skill automatically
- bundles are content sources; `drwn` remains the only supported write and curation surface

See [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md) for the full bundle model.

### Curate a shared skill

```bash
drwn skills curate <name>
```

This adds the skill into `~/.agents/skills`, which is the curated publication layer.

Important:

- this does not automatically write tool directories
- curate first, then run `drwn write --skills-only`
- this works for built-in shared skills and package-backed shared skills when the skill name is unique

### Uncurate a shared skill

```bash
drwn skills uncurate <name>
```

This removes the skill from `~/.agents/skills`.

Important:

- the next `drwn write` removes drwn-owned downstream links recorded in the write record
- user-owned replacements are preserved and reported

### Write skills downstream

```bash
drwn write --skills-only
```

Dry-run:

```bash
drwn write --skills-only --dry-run
```

JSON:

```bash
drwn write --skills-only --json
```

Behavior:

- installs missing downstream skill symlinks
- removes drwn-owned symlinks that left the effective state
- reports user-owned stale downstream skill paths instead of deleting them
- respects per-project skill exclude lists
- respects per-project skill include lists for repo-native and installed package-backed skills
- respects project extension-derived skill includes, such as `extensions.parallel`

## MCP Commands

### List harness MCP servers

Human-readable:

```bash
drwn mcp list
```

JSON:

```bash
drwn mcp list --json
```

What it shows:

- server name
- transport
- whether it is currently active
- enabled targets summary

This is the quickest way to inspect the effect of toggles like `parallel.mcp.enabled` and project-local extension MCP settings.

### Write MCP into enabled targets

```bash
drwn mcp write
```

Dry-run:

```bash
drwn mcp write --dry-run
```

Target-specific:

```bash
drwn mcp write --target=claude
```

JSON:

```bash
drwn mcp write --json
```

Behavior:

- renders active harness MCP state
- writes it to enabled targets
- preserves the current non-destructive semantics
- uses project-local server and target overrides when present
- uses project extension-derived MCP settings, such as `extensions.parallel.mcp`

## Extensions Commands

Extensions are named capability families managed by `drwn`. They can combine CLI prerequisites, repo-native skills, optional MCP servers, project setup actions, and diagnostics. They are not the same thing as package-backed skill bundles: bundles provide skill content, while extensions describe operational support around a tool or workflow.

### List extensions

Human-readable:

```bash
drwn extensions list
```

JSON:

```bash
drwn extensions list --json
```

What it shows:

- extension id and display name
- supported scope
- default modes such as `cli`, `skills`, `mcp`, or `hooks`

### Show one extension

```bash
drwn extensions show beads
drwn extensions show beads --json
```

What it shows:

- description
- command prerequisites
- related repo-native skills
- optional MCP servers
- upstream documentation links

### Check extension status

```bash
drwn extensions status
drwn extensions status beads
drwn extensions status beads --json
```

Status is read-only. It reports command availability, skill presence, MCP state, and project-local details such as whether `.beads/` exists in the current project.

### Run extension diagnostics

```bash
drwn extensions doctor
drwn extensions doctor parallel
drwn extensions doctor --json
```

Doctor is report-only. It surfaces missing commands, missing skills, inactive MCP entries, and project setup gaps with actionable hints.

### Set up Parallel

Preview:

```bash
drwn extensions setup parallel --dry-run
```

Run:

```bash
drwn extensions setup parallel
```

Common flags:

- `--mcp` enables project-scoped `parallel-search` and `parallel-task` MCP
- `--skip-skills` records the extension without deriving the Parallel skills
- `--json` returns structured output

Setup writes semantic project config under `extensions.parallel` in `<project>/.agents/drwn/config.json`. It does not install or authenticate `parallel-cli`; use status and doctor to inspect those prerequisites.

### Set up Beads

Install `bd` first:

```bash
brew install beads
npm install -g @beads/bd
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

Preview:

```bash
drwn extensions setup beads --dry-run
```

Run:

```bash
drwn extensions setup beads
```

Common flags:

- `--target=codex,claude,cursor` selects Beads setup recipes
- `--stealth` passes Beads stealth mode to `bd init` and `bd setup`
- `--skip-bd-init` skips `bd init`
- `--skip-bd-setup` skips `bd setup`
- `--include-skill` sets `extensions.beads.includeSkill: true` so write derives `beads-task-tracking`
- `--json` returns structured output

Safety constraints:

- setup requires `bd` to be available
- dry-run does not mutate project files
- setup never runs `bd init --force`
- setup never runs `bd doctor --fix`
- Beads MCP is optional and not enabled by setup

### Set up MarkItDown

Preview:

```bash
drwn extensions setup markitdown --dry-run
```

Run interactively:

```bash
drwn extensions setup markitdown
```

When `markitdown` is missing, interactive setup asks once before installing through uv. Scripts must choose explicitly:

```bash
drwn extensions setup markitdown --install
drwn extensions setup markitdown --no-install
```

The guarded install command is:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

Setup writes semantic project config under `extensions.markitdown`. When skills are enabled, write derives `markitdown-document-conversion` for the project without global skill curation.

### Current extensions

- `beads`: project-scoped support for Beads issue tracking through the `bd` CLI, Beads setup recipes, and the repo-native `beads-task-tracking` skill
- `parallel`: project-selectable support for Parallel through existing CLI-backed skills and optional `parallel-search` / `parallel-task` MCP servers
- `markitdown`: project-selectable document conversion through Microsoft's `markitdown` CLI and the repo-native `markitdown-document-conversion` skill

## Status Command

Use:

```bash
drwn status
drwn status --json
drwn status --explain
drwn status --why skill:<name>
drwn status --why server:<name>
drwn status --why extension:<name>
drwn status --why target:<name>
drwn status --why card:<name>
```

What it reports:

- repo root
- `~/.agents` path
- enabled targets
- active skill counts
- curated skill counts
- global default skill and MCP counts
- user MCP library counts
- installed package-backed bundle counts
- active project config path when one is in scope
- project override summary when one is active
- cards and locked versions when project cards are present
- store status
- write-record status

Use `--explain` for provenance across cards, skills, MCP servers, targets, and
write records. Use `--why <category>:<name>` when you need a focused answer for
one active item.

## Doctor Command

Use:

```bash
drwn doctor
drwn doctor --json
```

What it reports:

- missing required directories or config files
- stale skill symlinks
- MCP drift indicators
- unknown global default references
- store and card lock issues
- write-record ownership issues
- project config issues

Typical project-config issues include:

- unknown server references
- unknown skill references
- unknown extension references
- stale project skill overrides
- card refs that cannot be resolved
- card manifests that reference unavailable skills

`doctor` is report-only. It does not auto-fix or auto-prune.

Wave 1 note: unresolved project `skills.include` names do not wait for `doctor`. `drwn write` now fails before mutating downstream state, and `doctor` reports the same issue for diagnosis.

## Common Workflows

### Global machine write

```bash
drwn write --dry-run
drwn write
```

### Add reusable inventory and make it global

```bash
drwn library add skill <bundle>
drwn library defaults add skill <skill-name>
drwn library add mcp ./github-mcp.json --as github
drwn library defaults add mcp github
drwn write --dry-run
```

Use this when every project should inherit the item unless a project disables it.

### Project-specific override setup

```bash
cd /path/to/project
drwn init
drwn status
drwn write --dry-run
```

### Add extension skill bundle and expose one skill

```bash
drwn skills packages add <bundle>
drwn skills packages show <package-name>
drwn add skill <skill-name>
drwn write
```

### Inspect project issues before writing

```bash
drwn status
drwn doctor
```

### Bootstrap a cloned project with locked cards

```bash
cd /path/to/project
drwn install --no-apply
drwn write --dry-run
drwn install
```

Use `--frozen` in CI when `card.lock` must already contain everything needed:

```bash
drwn install --frozen
```

### Share a card with a team Git remote

```bash
drwn card new @team/backend --no-git
drwn card publish @team/backend
drwn card remote add @team/backend <git-url>
drwn card push @team/backend
```

Another machine can import it with:

```bash
drwn card clone git+<git-url>#v1.0.0
drwn add git+<git-url>#v1.0.0
drwn install
```

### Discover cards from a catalog

```bash
drwn library catalog list
drwn library catalog add team <catalog-git-url>
drwn search card backend
drwn add git+<card-git-url>#v1.0.0
```

## Optional Extensions

`darwinian-harness` supports optional local extensions, including:

- `bd` for Beads project issue tracking
- `parallel-cli` for Parallel-backed skills
- `markitdown` for MarkItDown-backed document conversion
- `markdownify-mcp` for local markdown extraction workflows

These are optional and machine-dependent. Their absence should not block the baseline CLI and write model.

## Current Limits

- `doctor` is report-only
- live hosted Git authentication, credential prompts, and slow-network behavior depend on the user's Git configuration and should be smoke-tested against disposable remotes before release
- card catalogs are Git-backed local clones; there is no registry service
- package-backed bundle update/remove lifecycle is not implemented yet
- package-backed bundles are extension sources, not authoritative write CLIs
- per-project `skills.include` requires skill names to resolve across the active card set and non-card sources; unresolved names fail write before mutation and are also surfaced by doctor

## Further Reading

- [02_per-project-config-guide.md](./02_per-project-config-guide.md)
- [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md)
- [04_homebrew-release-checklist.md](./04_homebrew-release-checklist.md)
- [05_npm-publishing-analysis-and-manual.md](./05_npm-publishing-analysis-and-manual.md)
- [09_harness-cards-manual-test-guide.md](./09_harness-cards-manual-test-guide.md)
