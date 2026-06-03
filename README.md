<p align="center">
  <img src="./docs/assets/darwinian-harness-logo.png" alt="Darwinian Harness" width="120" height="120" />
</p>

# darwinian-harness

`darwinian-harness` is a local meta-harness for AI agent tools — a CLI that organizes the skills, MCP servers, extensions, defaults, project overlays, and downstream tool state that surround the agents you already use.

The harness around an agent is what makes it reliable. `darwinian-harness` makes that harness explicit, inspectable, reusable, and safe to write into downstream tools.

The package is `darwinian-harness`. The command is `drwn`.

## What it harnesses

- **Skills and instructions** that guide agent behavior
- **MCP servers and tool definitions** that gate capability access
- **Extensions** like Parallel, Beads, and MarkItDown that bundle project-level setup and diagnostics
- **Machine-wide defaults** for reusable local capabilities
- **Project overlays** for repository-specific agent behavior
- **Downstream state** for Claude Code, Codex, Cursor, and `~/.agents`
- **Diagnostics** that report drift before mutating local files
- **Cards** — Git-backed reproducible bundles of all of the above

## Why this exists

Local agent setups drift. One tool gets a new MCP server, another has a stale skill directory, a project needs a slightly different harness than the global baseline, and someone hand-edited `~/.claude/settings.json` three months ago and nobody knows what state it's in.

The harness around an agent is usually scattered across dotfiles, skill directories, MCP configs, extension setup scripts, and project conventions. `drwn` gives those pieces a local control plane you can inspect, version, dry-run, and write deliberately.

Use it when you want:

- one reusable MCP and skill inventory instead of hand-edited per-tool configs
- one harness layer shared across compatible agent tools
- project-specific overrides without rewriting global config
- diagnostics for stale links, drifted config, and missing generated files
- an operator CLI that reports before it mutates
- Git-distributable reproducible harness state via cards

If you only need a single MCP config file for one tool, this project is probably more structure than you need.

## Disciplines

drwn is built around six load-bearing commitments that make it predictable to operate and extend:

1. **Filesystem is the API.** No daemon, no IPC. State lives at fixed paths under `~/.agents/drwn/` and `<project>/.agents/drwn/`. Future UIs (web, IDE) read and write the same shapes.
2. **The lockfile is the contract.** `card.lock` v2 records exact card resolutions with sha256 integrity. Cross-machine reproducibility holds if and only if the lockfile is honored.
3. **Single chokepoint for store mutation.** Every write under the store flows through `assertStoreWritable()` and `writeAtomically()`. `DRWN_STORE_READONLY=1` works because of this discipline, not because of per-command opt-in.
4. **Atomic mutations everywhere.** Temp-then-rename for files; staging-then-rename for migrations; fsync the parent dir for the write record.
5. **Doctor is report-only.** No auto-fix, no auto-prune. Diagnostics surface drift; you decide.
6. **One process per invocation, bounded local concurrency.** No coordination across processes; cross-process safety is achieved through atomic renames.

For the full as-built reference, see [`.ai/knowledges/10_drwn-cli-architecture.md`](./.ai/knowledges/10_drwn-cli-architecture.md).

## Requirements

- Node.js 20+
- npm when installing the published package or adding npm skill bundles
- Bun 1.2+ when working from a checkout or building a release
- optional local tools (`parallel-cli`, `markitdown`, `markdownify-mcp`, `bd`) only when you enable the relevant extension

## Install

Published package:

```bash
npm install -g darwinian-harness
drwn status
```

Or work from a checkout (for forks, registry edits, CLI development):

```bash
git clone https://github.com/remyjkim/darwinian-harness.git
cd darwinian-harness
bun install
bun run drwn -- status
```

To point a global install at a checkout: `export AGENTS_REPO_ROOT=/path/to/darwinian-harness`.

## First taste

Inspect before writing:

```bash
drwn status
drwn skills list
drwn mcp list
drwn write --dry-run
```

If the dry run looks right, write it:

```bash
drwn write
```

For a project-local harness:

```bash
cd /path/to/project
drwn init
drwn add skill <skill-name>
drwn write --dry-run && drwn write
```

For Git-distributable reproducible harness state, see [`docs/cli-quickref.md`](./docs/cli-quickref.md) → Cards or the [cards concept page](https://darwiniantools.com/concepts/cards).

## Skills source repo

The broader skill library and harness cards consumed by `drwn` live in the sibling repo [`darwinian-harness-skills`](https://github.com/remyjkim/darwinian-harness-skills). It is added here as a git submodule at [`darwinian-harness-skills/`](./darwinian-harness-skills) so a `git clone --recurse-submodules` of this repo gives you both checkouts in one tree.

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

The submodule is shallow by default. Bumping the pin to upstream `main` is an explicit two-step:

```bash
cd darwinian-harness-skills && git pull
cd .. && git add darwinian-harness-skills && git commit
```

The in-tree `skills/shared/` directory holds the small set of skills published with this CLI; the submodule is the canonical authoring source for the larger skill catalog and harness cards consumed via `drwn library add skill` and `drwn add card`. See [`docs/maintainers/skills-repo-submodule.md`](./docs/maintainers/skills-repo-submodule.md) for the contributor-side reference.

## Safety model

The safety model is intentionally simple:

- preview first with `--dry-run`
- inspect machine state with `status`
- diagnose drift with `doctor` — report-only
- curate skills explicitly before writing them downstream
- treat package-backed bundles as available content, not automatically exposed behavior
- keep cleanup report-only until a command explicitly supports repair or pruning

## Documentation

- **Public docs site:** [docs.darwiniantools.com](https://docs.darwiniantools.com) (source in [`docs-docusaurus/`](./docs-docusaurus))
- **Repo quick reference:** [`docs/cli-quickref.md`](./docs/cli-quickref.md) — consolidated command + concept reference
- **Architecture reference:** [`.ai/knowledges/10_drwn-cli-architecture.md`](./.ai/knowledges/10_drwn-cli-architecture.md) — as-built CLI internals for contributors
- **Maintainers:** [`docs/maintainers/`](./docs/maintainers/) — release and operational docs

Local docs workflow:

```bash
bun run docs:dev
bun run docs:build
```

## Contributing

Contributions are welcome when they preserve the conservative write model and include tests for behavior changes.

Start with:

```bash
bun install
bun test
bun run typecheck
bun run verify:release --json
```

Then read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.
