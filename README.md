<p align="center">
  <img src="./docs/assets/darwinian-harness-logo.png" alt="Darwinian Harness" width="120" height="120" />
</p>

# darwinian-harness

`darwinian-harness` is a local meta-harness for AI agent tools: one CLI to organize skills, MCP servers, extensions, defaults, project overlays, downstream tool configs, and diagnostics.

Agents are only as reliable as the harness around them. `darwinian-harness` makes that harness explicit, inspectable, reusable, and safe to write into downstream tools.

The package is `darwinian-harness`. The command is `drwn`.

## What It Harnesses

- skills and instructions that guide agent behavior
- MCP servers and tool definitions that control capability access
- extensions such as Parallel, Beads, and MarkItDown that bundle project-level setup and diagnostics
- machine-wide defaults for reusable local capabilities
- project overlays for repository-specific agent behavior
- downstream state for Claude Code, Codex, Cursor, and `~/.agents`
- diagnostics that report drift before mutating local files

## Why This Exists

Local agent setups tend to drift. One tool gets a new MCP server, another has an older skill directory, and a project needs a slightly different harness than the global baseline.

The harness around an agent is usually scattered across dotfiles, skills, MCP configs, extension setup, local scripts, and project conventions. `darwinian-harness` gives those pieces a local control plane you can inspect, version, dry-run, and write deliberately.

It is useful when you want:

- one reusable MCP and skill inventory instead of separate hand-edited tool configs
- one harness layer shared across compatible agent tools
- project-specific overrides without rewriting global config
- diagnostics for stale links, drifted config, and missing generated files
- an operator CLI that reports before it mutates

If you only need a single MCP config file for one tool, this project is probably more structure than you need.

## Requirements

- Bun 1.2+
- Node.js for MCP servers that use `node`
- npm when installing the published package or adding npm skill bundles
- optional local tools such as `parallel-cli`, `markitdown`, or `markdownify-mcp` only when you enable those integrations

## Install

### Install the published package

```bash
npm install -g darwinian-harness
drwn status
```

The published package includes built-in harness defaults. By default, global `drwn` uses that packaged harness source.

### Work from a checkout

Use this mode if you want to edit the registry, maintain your own fork, add built-in skills, or develop the CLI:

```bash
git clone https://github.com/remyjkim/darwinian-harness.git
cd darwinian-harness
bun install
bun run drwn -- status
```

You can also point a global install at a checkout:

```bash
export AGENTS_REPO_ROOT=/path/to/darwinian-harness
drwn status
```

For local development, link the package:

```bash
bun link
drwn --help
```

## Quickstart

Start by inspecting before writing:

```bash
drwn status
drwn skills list
drwn mcp list
drwn write --dry-run
```

If the dry run looks right, write the generated state:

```bash
drwn write
```

That first run gives you:

- a system overview
- the current skill inventory
- the active MCP inventory
- a planned-change preview
- an explicit write step

For a project-specific setup, start in the project directory:

```bash
drwn init
drwn extensions add parallel
drwn add skill <skill-name-or-query>
drwn add mcp <server-name>
drwn write --dry-run
drwn write
```

For scripts and CI-style setup, make init explicit:

```bash
drwn init --non-interactive
```

## What It Changes On Disk

`drwn` can read and write local agent configuration under:

- `~/.agents`
- `~/.claude`
- `~/.codex`
- `~/.cursor`
- `<project>/.agents/drwn/config.json`

The normal write path is conservative:

- `drwn write --dry-run` previews changes
- write creates or replaces managed symlinks and generated MCP config
- DRWN-owned stale downstream skill symlinks are removed on the next write; user-owned replacements are preserved and warned
- `drwn doctor` reports issues without fixing them

## Usage Modes

### Packaged Harness

Use the published package when you want the default config and CLI behavior:

```bash
npm install -g darwinian-harness
drwn write --dry-run
```

### Editable Harness Source

Use a checkout when you want to own the source of truth:

```bash
export AGENTS_REPO_ROOT=/path/to/darwinian-harness
drwn status
```

In checkout mode, edit:

- [registry/config.json](./registry/config.json) for target and optional-server toggles
- [registry/mcp-servers.json](./registry/mcp-servers.json) for MCP server definitions
- [skills](./skills) for built-in skill content

## Command Reference

General commands:

- `drwn status`
- `drwn doctor`
- `drwn scan`
- `drwn init`
- `drwn add skill [name-or-query]`
- `drwn add mcp [name-or-query]`
- `drwn search skill <query>`
- `drwn search mcp <query>`
- `drwn library list [skills|mcp|tools]`
- `drwn library show <id>`
- `drwn library add skill <packageSpec>`
- `drwn library add mcp <jsonFile> --as <serverId>`
- `drwn library defaults list`
- `drwn library defaults add skill <skillName>`
- `drwn library defaults add mcp <serverName>`
- `drwn library defaults remove skill <skillName>`
- `drwn library defaults remove mcp <serverName>`
- `drwn write`
- `drwn extensions list`
- `drwn extensions show <extensionName>`
- `drwn extensions status [extensionName]`
- `drwn extensions doctor [extensionName]`
- `drwn extensions setup beads`
- `drwn extensions setup parallel`
- `drwn extensions setup markitdown`
- `drwn extensions add <extensionName>`
- `drwn apply <cardRef>`
- `drwn update`

Card commands:

- `drwn card new <name> --scope @scope`
- `drwn card publish <name>`
- `drwn card apply <cardRef> [--write]`
- `drwn card add <cardRef> [--write]`
- `drwn card pin <cardRef> [--write]`
- `drwn card remove <name> [--write]`
- `drwn card update [--write]`
- `drwn card outdated [--check]`
- `drwn card detach [--write]`
- `drwn card list`
- `drwn card show <cardRef>`
- `drwn card status [--explain]`
- `drwn card diff <beforeRef> <afterRef>`
- `drwn card deprecate <cardRef>`

MCP commands:

- `drwn mcp list`
- `drwn mcp write`

Skill commands:

- `drwn skills list`
- `drwn skills curate <skillName>`
- `drwn skills uncurate <skillName>`
- `drwn skills packages add <packageSpec>`
- `drwn skills packages list`
- `drwn skills packages show <packageName>`

Export commands:

- `drwn export sessions [--dry-run] [--gzip] [--out <path>]`

Most inspection commands support `--json`. Write commands support `--dry-run`.

Use command help for the exact surface:

```bash
drwn --help
drwn write --help
drwn scan --help
drwn add skill --help
drwn library list --help
drwn search skill --help
drwn extensions setup beads --help
drwn skills packages add --help
```

## How Write Works

The core model has five layers:

- packaged harness defaults: config, built-in skills, and built-in MCP definitions
- local library: package-backed skills and user MCP definitions under `~/.agents/library`
- user defaults: machine-wide active state under `~/.agents/drwn/config.json`
- project overlay: current-project overrides under `<project>/.agents/drwn/config.json`
- downstream state: Claude, Codex, Cursor, and generated MCP config files

`drwn write` resolves the effective harness state, then writes MCP configuration and skill links into downstream local agent tool config and skill directories. Use `--dry-run` to preview writes before mutating files:

```bash
drwn write --dry-run
drwn write
```

Wave 1 card behavior:

- card-bundled skill content is authoritative for materialization and writes from the immutable card store path
- if a card and a non-card source provide the same skill name, the card copy wins
- `drwn write --dry-run` annotates each planned skill symlink with the winning resolution layer
- unresolved included skill names fail `drwn write` before any downstream mutation

Run only one side when needed:

```bash
drwn write --mcp-only
drwn write --skills-only
```

Limit write to one target:

```bash
drwn write --target=claude
drwn mcp write --target=cursor
```

## How Export Works

`drwn export sessions` discovers and archives all session log files (`.jsonl`) from Claude Code and Codex belonging to the current project. Sessions are discovered by matching project slug prefixes (derived by replacing every `/` in the project path with `-`); this automatically includes all git worktrees.

### Archive layout

Archives use flat, source-prefixed member paths:

- `claude/<file>.jsonl` — main Claude sessions
- `claude/agents/<file>.jsonl` — Claude subagent logs
- `codex/<file>.jsonl` — Codex rollouts

The default destination is `.agents/drwn/session-log-exports/<timestamp>.tar` (or `.tar.gz` with `--gzip`). Use `--out <path>` to override the destination, or `--dry-run` to preview files without writing.

### Upload-ready archives

Pass `--gzip` to produce a `.tar.gz` directly. The recommended artifact for web upload is the `.tar.gz` form because it is smaller and travels well over HTTP.

The archiver enforces explicit cleanliness guarantees:

- macOS metadata is suppressed (`COPYFILE_DISABLE=1`, `--no-mac-metadata`) so no AppleDouble (`._*`) companions are emitted
- every archive is validated after write — entries outside the `claude/`/`codex/` namespace, AppleDouble entries, `__MACOSX/`, `.DS_Store`, or other hidden dotfiles cause the command to fail and the polluted archive to be removed
- archive member count must match the discovered input count

**Do not manually recompress archives** (e.g. by Finder-zipping `.agents/drwn/session-log-exports/`). Manual repackaging bypasses these guarantees and can introduce AppleDouble sidecars that break downstream analyzers. Upload the file DRWN produces as-is.

Missing source roots like `~/.claude/projects/` or `~/.codex/sessions/` are skipped silently and do not produce an error.

## MCP Registry

MCP servers are defined in [registry/mcp-servers.json](./registry/mcp-servers.json). Target config and optional toggles live in [registry/config.json](./registry/config.json).

User-registered MCP servers live in `~/.agents/library/mcp-servers.json`. Machine-wide active MCP defaults live in `~/.agents/drwn/config.json` under `defaults.mcpServers`.

Inspect active MCP state:

```bash
drwn mcp list
drwn mcp list --json
```

Write active MCP state:

```bash
drwn mcp write --dry-run
drwn mcp write
```

Notes:

- `platform-provided` entries can live in the registry but are excluded from generated local tool configs
- optional servers are included only when enabled
- Parallel MCP is controlled by `config.parallel.mcp.enabled`
- project-local extension settings such as `extensions.parallel.mcp` are applied when commands run inside that project

## Skill Library

Built-in skills live in:

- `skills/shared`
- `skills/claude-only`
- `skills/codex-only`
- `skills/experimental`

Curated shared skills are published through:

```text
~/.agents/skills
```

Typical built-in skill flow:

```bash
drwn skills list
drwn skills curate <skillName>
drwn write --skills-only --dry-run
drwn write --skills-only
```

Only shared skills can be curated into `~/.agents/skills`. Claude-only and Codex-only skills are written directly to their target-specific skill directories.

## Extension Skill Bundles

`darwinian-harness` supports package-backed skill bundles for skills that should be available without being added to the built-in first-party tree.

Typical flow:

```bash
drwn library add skill <npm-package-or-local-path>
drwn library list skills
drwn library show <skillName>
drwn add skill <skillName>
drwn write --dry-run
drwn write
```

Global curation remains useful when a shared skill should be available by default across projects:

```bash
drwn skills packages add <npm-package-or-local-path>
drwn skills curate <skillName>
drwn write --skills-only
```

The distinction matters:

- added means the bundle is available under `~/.agents/drwn/skills`
- curated means a shared skill is linked into `~/.agents/skills`
- written means the curated skill is linked into downstream tool directories

Current package-backed bundle support includes add, list, show, inventory, curation, and downstream write. Update and remove lifecycle commands are intentionally not part of the first implementation.

## Extensions

Extensions are named capability families that `drwn` can inspect, diagnose, and sometimes set up. They are distinct from skill bundles and MCP servers: an extension can combine CLI prerequisites, repo-native skills, optional MCP servers, project setup actions, and diagnostics under one user-facing name.

Inspect extension support:

```bash
drwn extensions list
drwn extensions show beads
drwn extensions status
drwn extensions doctor
```

Machine-readable output is available with `--json`.

Current extensions:

- `beads`: project-scoped Beads issue tracking support
- `parallel`: project-selectable Parallel support over CLI-backed skills and optional MCP overlay
- `markitdown`: document-to-Markdown conversion through Microsoft's MarkItDown CLI, with guarded uv installation

### Parallel

Parallel support is CLI+skills-first. Selecting the extension for one project writes semantic config under `<project>/.agents/drwn/config.json`; `drwn write` then derives the four Parallel skills for that project without requiring global skill curation.

Preview setup:

```bash
drwn extensions setup parallel --dry-run
```

Enable the Parallel skills for the current project:

```bash
drwn extensions add parallel
```

Enable project-scoped Parallel MCP as well:

```bash
drwn extensions add parallel --mcp
```

This does not install or authenticate `parallel-cli`. `drwn extensions status parallel` and `drwn extensions doctor parallel` report missing CLI or MCP prerequisites.

### MarkItDown

MarkItDown support is CLI+skills-first. Selecting the extension for one project writes semantic config under `<project>/.agents/drwn/config.json`; `drwn write` then derives the `markitdown-document-conversion` skill for that project.

Preview setup:

```bash
drwn extensions setup markitdown --dry-run
```

Run setup and choose interactively whether to install the missing CLI:

```bash
drwn extensions setup markitdown
```

For scripts:

```bash
drwn extensions setup markitdown --install
drwn extensions setup markitdown --no-install
```

The install path is:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

If the command is installed but not on PATH, run `uv tool update-shell` and restart the shell.

### Beads

Beads support is CLI-first and project-scoped. `drwn` checks for `bd`, reports whether the current project has `.beads/`, can run Beads setup recipes, and can record Beads extension config for the project.

Install `bd` through one of the upstream-supported paths:

```bash
brew install beads
npm install -g @beads/bd
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

Preview setup:

```bash
drwn extensions setup beads --dry-run
```

Run setup:

```bash
drwn extensions setup beads
```

Useful flags:

- `--target=codex,claude,cursor` selects Beads setup recipes
- `--stealth` passes Beads stealth setup mode through to `bd`
- `--skip-bd-init` skips `bd init`
- `--skip-bd-setup` skips `bd setup`
- `--include-skill` sets `extensions.beads.includeSkill: true` so write derives `beads-task-tracking`

Setup never runs `bd init --force` or `bd doctor --fix` by default. Beads MCP remains optional and is not enabled by `drwn extensions setup beads`.

## Per-Project Configuration

Use per-project config when one project needs a different effective view than the global default.

Create a project config:

```bash
cd /path/to/project
drwn init
```

This creates:

```text
<project>/.agents/drwn/config.json
```

Project config can:

- enable or disable MCP servers for one project
- add project-local MCP server definitions
- enable extensions such as Parallel, Beads, or MarkItDown for one project
- include or exclude skills during write
- enable or disable targets locally

Project config is used by `drwn write`, `drwn mcp list`, `drwn mcp write`, `drwn status`, `drwn doctor`, and extension status/doctor/setup commands.

Discovery walks upward from the current working directory and uses the nearest config file.

Useful workflow:

```bash
drwn status
drwn write --dry-run
drwn doctor
```

Project extension config is semantic:

```json
{
  "version": 1,
  "extensions": {
    "parallel": {
      "enabled": true,
      "skills": true,
      "mcp": false
    },
    "beads": {
      "enabled": true,
      "targets": ["codex", "claude"],
      "includeSkill": true
    },
    "markitdown": {
      "enabled": true,
      "skills": true
    }
  }
}
```

Lower-level `skills.include` and `skills.exclude` still work for repo-native and package-backed skills. If both extension-derived includes and explicit excludes mention the same skill, `skills.exclude` wins.

## Layered Reproducibility

drwn cards pin **harness state** — the skills, MCP servers, extensions, and downstream targets a project should run on. Cards do not pin the surrounding environment. For full environmental reproducibility, layer drwn with tools that own the other layers:

```text
Layer 8: drwn cards       — harness state (this tool)
Layer 6: Docker / Compose — service stack (Postgres, Redis, etc.)
Layer 4: Flox or Nix      — Node, Python, system libs, shell hooks
Layer 3: asdf / mise / Flox — runtime / toolchain versions
Layer 2: pnpm / Cargo / pip — app dependencies + lockfile
```

What cards pin:

- card versions and content-tree integrity in `card.lock`
- per-card bundled skill attribution in `card.lock`
- inline content shipped in cards (skills, MCP server definitions) by sha256 content hashing
- the project overlay

What cards do not pin:

- agent tool versions (Claude Code, Codex, Cursor) — vendor-controlled distribution
- MCP server runtime resolution if a card's `args` uses `npx -y <pkg>` without a version pin (the shipped registry pins these; card authors should too)
- CLI dependencies of skills (`bd`, `markitdown`, `git`, etc.)
- runtime, system libraries, or shell environment

The recommended composition for a project that needs full reproducibility: use `drwn card apply` for the harness, and pair with Flox/Nix (or asdf/mise) at the shell layer to pin Node/Python/system libs, and Docker Compose at the service layer for runtime dependencies. Each tool pins what it owns.

For background on the layered model and how cards composes with the broader landscape, see `.ai/knowledges/02_per-project-config-guide.md` and `.ai/analyses/32_harness-cards-vs-flox-and-conda.md`.

## Diagnostics

Use `doctor` when local state looks wrong:

```bash
drwn doctor
drwn doctor --json
```

It reports:

- broken symlinks
- stale downstream skill links
- MCP drift
- missing generated config files
- project config issues

It does not mutate local state. Unresolved `skills.include` names are a separate write-time contract: `drwn write` fails before mutation, while `doctor` reports the same problem in diagnostics output.

## Optional Extensions

Baseline CLI usage does not require external tools beyond Bun, Node.js, and npm.

Optional extensions include:

- Beads project issue tracking through `bd`
- Parallel CLI-backed skills
- Parallel MCP overlay
- MarkItDown document conversion through `markitdown`
- local `markdownify-mcp`

### Parallel

Parallel is represented as an extension in two layers:

- default: CLI-backed shared skills
- optional: globally enabled Parallel MCP servers

Default shared skills:

- `parallel-web-search`
- `parallel-web-extract`
- `parallel-deep-research`
- `parallel-data-enrichment`

Those skills assume `parallel-cli` is installed and authenticated separately.

Install:

```bash
curl -fsSL https://parallel.ai/install.sh | bash
```

Authenticate:

```bash
parallel-cli login
parallel-cli auth
```

To enable the optional Parallel MCP overlay, edit [registry/config.json](./registry/config.json):

```json
"parallel": {
  "cli": { "enabled": true },
  "mcp": { "enabled": true }
}
```

Then run:

```bash
drwn mcp write
```

### MarkItDown

MarkItDown is represented as a CLI-backed extension with a project skill:

- runtime command: `markitdown`
- installer command: `uv`
- derived skill: `markitdown-document-conversion`

Setup previews first:

```bash
drwn extensions setup markitdown --dry-run
```

When `markitdown` is missing, interactive setup asks once before installing. Scripts must choose explicitly:

```bash
drwn extensions setup markitdown --install
drwn extensions setup markitdown --no-install
```

The guarded install command is:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

### Markdownify

`markdownify` is treated as an optional local MCP dependency.

It is separate from the `markitdown` CLI extension.

The registry entry uses:

```json
"command": "node",
"args": ["markdownify-mcp/dist/index.js"]
```

If you enable it, make sure the path in [registry/mcp-servers.json](./registry/mcp-servers.json) matches your local installation and the optional toggle in [registry/config.json](./registry/config.json) is enabled.

## Safety Model

The safety model is intentionally simple:

- preview first with `--dry-run`
- inspect machine state with `status`
- diagnose drift with `doctor`
- curate skills explicitly before writing them downstream
- treat package-backed bundles as available content, not automatically exposed behavior
- keep cleanup report-only until a command explicitly supports repair or pruning

## Contributing

Community contributions are welcome when they preserve the conservative write model and include tests for behavior changes.

Start with:

```bash
bun install
bun test
bun run typecheck
bun run verify:release --json
```

Then read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## Documentation Site

The public documentation site lives in [docs-astro](./docs-astro). It is an Astro app with its own lockfile and scripts:

```bash
cd docs-astro
bun install
bun run dev
bun run build
bun run preview
```

Deployment uses the docs app's Cloudflare Pages script:

```bash
bun run deploy:pages
```

## Documentation Map

- [CONTRIBUTING.md](./CONTRIBUTING.md): contributor setup, verification, and pull request expectations
- [docs-astro](./docs-astro): public Astro documentation site source
- [docs/maintainers/README.md](./docs/maintainers/README.md): release and operational documentation for maintainers
- [.ai/knowledges/01_agents-cli-usage-guide.md](./.ai/knowledges/01_agents-cli-usage-guide.md): detailed operator guide
- [.ai/knowledges/02_per-project-config-guide.md](./.ai/knowledges/02_per-project-config-guide.md): per-project config reference
- [.ai/knowledges/03_npm-skill-bundles-guide.md](./.ai/knowledges/03_npm-skill-bundles-guide.md): package-backed skill bundle reference
