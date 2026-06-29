<!-- ABOUTME: End-to-end install and project-setup guide for the drwn CLI and its cards. -->
<!-- ABOUTME: Covers machine install, new/existing project adoption, applying cards, and cloning a card-locked repo. -->

# Installing `drwn` and Setting Up Cards

This guide takes you from nothing to a working Darwinian Minds harness: install the
`drwn` CLI, set up a project (new or existing), and apply the cards that carry the
skills, MCP servers, and mind content your agents use.

`drwn` is a local meta-harness. It organizes the skills, MCP servers, extensions,
defaults, and per-project overlays that surround the agent tools you already run
(Claude Code, Codex, Cursor), then materializes that state into their config
directories with one command: `drwn write`.

- **Package:** `darwinian-minds` · **Command:** `drwn` · **Alias:** `dminds`
- **Public docs:** <https://darwiniantools.com>
- **Command reference:** [`docs/cli-quickref.md`](docs/cli-quickref.md)

---

## 1. Prerequisites

| Use case | Requirement |
| --- | --- |
| Run the published package | **Node.js 20+** and **npm** |
| Work from a source checkout (CLI development) | **Bun 1.2+** |
| Add npm-backed skill bundles | **npm** |
| Optional integrations | `parallel-cli`, `markitdown` (via `uv`), `bd` (Beads), `markdownify-mcp` — only when you enable them |

The published CLI runs on Node; you do **not** need Bun to use it. Bun is only
required if you run the TypeScript source directly from a checkout (see
[Appendix B](#appendix-b-checkout--development-mode)).

> **Platform note:** macOS and Linux are supported today. Windows is not yet
> supported — home-directory resolution, skill symlinks, and archive handling
> assume a POSIX environment. Use WSL2 on Windows.

---

## 2. Install the CLI

```bash
npm install -g darwinian-minds
drwn status
```

`drwn status` prints the resolved store path, the enabled targets
(`claude`, `codex`, `cursor`), and current inventory counts. The package also
installs `dminds` as a secondary alias for the same CLI; use `drwn` everywhere.

### What lands on disk

`drwn` keeps all of its own state under `~/.agents/drwn/` and never writes into
your project until you ask it to. The machine store holds:

```text
~/.agents/drwn/
├── machine.json          # machine-wide default skills + MCP servers
├── sources/              # editable card sources you author
├── cards/                # published card repositories
├── skills/               # installed skill packages
├── mcp-servers/          # user-registered MCP definitions
├── catalogs/             # registered card catalogs
├── generated/            # composed mind + hook output
└── credentials.json      # analyzer auth token (only if you log in)
```

Downstream tool state is written to `~/.claude`, `~/.codex`, and `~/.cursor`
(or their project-local equivalents). Everything `drwn` writes is tracked in a
write record so the next write can clean up safely.

---

## 3. The 30-second mental model

`drwn` resolves an **effective harness** from layers, then materializes it:

```text
packaged defaults  →  machine defaults  →  project overlay  →  cards
                              ↓
                         drwn write
                              ↓
              ~/.claude · ~/.codex · ~/.cursor  (or <project>/.*)
```

- **Cards** are versioned, Git-backed bundles of skills, MCP servers, hooks, and
  optional **mind content** (persona, beliefs, memory). A card is a "mind."
- **`drwn write`** is the one-way materialization step. It is non-destructive by
  default and supports `--dry-run` to preview every change first.
- **Inspect before you write.** `drwn status`, `drwn doctor`, and
  `drwn write --dry-run` never mutate anything.

---

## 4. One-time machine setup (optional)

Set machine-wide defaults so every project starts from a known baseline. Skip
this if you only want per-project configuration.

```bash
drwn library list                       # see available skills + MCP servers
drwn library defaults add skill <skill-name>
drwn library defaults add mcp <server-name>
drwn library defaults list

drwn write --dry-run                    # preview machine-scope materialization
drwn write
```

Machine defaults live in `~/.agents/drwn/machine.json`. They apply to any project
that does not define its own overlay.

---

## 5. Set up a project

A project becomes drwn-managed when it has a `<project>/.agents/drwn/config.json`.
The two starting points below differ only in intent — the mechanics are the same,
and nothing is written to your codebase until the final `drwn write`.

### 5a. New project from scratch

```bash
cd /path/to/project
drwn init                               # writes .agents/drwn/config.json
# add capabilities (see §6 for cards, or these for direct skills/extensions):
drwn add skill <skill-name-or-query>
drwn extensions add parallel
drwn write --dry-run
drwn write
```

`drwn init` is interactive in a TTY; pass `--non-interactive` (or `--minimal`)
for a prompt-free config in scripts and CI.

### 5b. Existing project adopting drwn

Adoption is additive and safe — `drwn init` only creates `.agents/drwn/` and
writes downstream state into `.claude` / `.codex` / `.cursor`. It does not touch
your existing code.

```bash
cd /path/to/existing/project
drwn init
drwn status --explain                   # confirm the overlay is detected
# apply a card (§6) and/or add skills, then:
drwn write --dry-run                    # read this carefully before writing
drwn write
```

Notes:

- `drwn init` **warns** if your `.gitignore` excludes `.agents` (which would stop
  teammates from sharing the harness) but never edits `.gitignore` for you.
- Commit `.agents/drwn/config.json` and `.agents/drwn/card.lock` so collaborators
  reproduce the same effective harness.
- Use `drwn status --why skill:<name>` to trace why any item is active.

---

## 6. Apply cards

Cards are how you pull in a curated set of skills, MCP servers, and mind content.

### The canonical cards

The operator cards ship from the **`darwinian-minds-skills`** repository:

| Card | Use it for |
| --- | --- |
| `@darwinian/mind-skills` | **Primary card most users should apply** — the current Darwinian Minds operator skills (project setup, install, materialization, cards, library, defaults, diagnostics, mind-stack). |
| `@darwinian/base-mind` | Optional persona layer — a small mind carrying a persona, public beliefs, and the activate/author/audit mind skills. Composes on top of `mind-skills`. |
| `@darwinian/harness-skills` | Back-compat only — a one-release compatibility card with legacy aliases. New projects should use `mind-skills` instead. |

### Applying a card today

The canonical cards are distributed via the `darwinian-minds-skills` Git repo. Clone
it and apply the card source directly with a `file:` ref:

```bash
git clone https://github.com/remyjkim/darwinian-minds-skills.git
drwn card apply file:/absolute/path/to/darwinian-minds-skills/cards/mind-skills
drwn write --dry-run
drwn write
```

To publish into your local store once and apply by name afterward:

```bash
# copy the card source into ~/.agents/drwn/sources/@darwinian/mind-skills, then:
drwn card source doctor @darwinian/mind-skills --json
drwn card publish @darwinian/mind-skills
drwn card apply @darwinian/mind-skills@^0.1.0
drwn write
```

> Once these cards are published to a card catalog, you will be able to resolve
> them directly with `drwn card apply @darwinian/mind-skills@^0.1.0` without the
> `file:` ref. They are not in the public community catalog yet.

### Consuming a team or community card

`drwn init` pre-registers the default community catalog
(`https://github.com/curation-labs/dm-cards-catalog-v1.git`, scope `@community`)
unless you pass `--no-default-catalogs`. Discover and apply cards from it, or
apply any card by its Git URL:

```bash
drwn search card <query>                # search registered catalogs
drwn card apply @team/backend@^1.0.0    # a published/cataloged card
drwn card apply git+https://github.com/org/some-card.git#v1.2.0
drwn write
```

Keep cards current:

```bash
drwn card status --explain
drwn card outdated
drwn card update
drwn write --dry-run && drwn write
```

Use `drwn card pin @team/backend@1.2.3` to lock an exact version, and
`drwn card remove @team/backend` to stop consuming a card.

---

## 7. Clone a project that already has cards

When you clone a repo that already carries `.agents/drwn/card.lock`, you restore
the locked harness rather than choosing cards. `drwn install` fetches the locked
cards and materializes the pinned state without changing card intent.

```bash
drwn --version
drwn status --json

# read-only feasibility check (also the CI form):
drwn install --frozen --no-apply --json

# fetch/clone the locked cards into the local store:
drwn install --no-apply --json

# preview, then install + write in one step:
drwn write --dry-run --json
drwn install --json

drwn status --json && drwn doctor --json
```

If `card.lock` is missing, this is not a clone-restore — go to §5/§6 instead.

---

## 8. Verify and troubleshoot

```bash
drwn status                 # effective harness for the current directory
drwn doctor                 # report-only diagnostics (never mutates)
drwn status --why skill:<name>   # provenance: why is this active?
ls .claude/skills           # materialized skill symlinks (or ~/.claude/skills)
```

`drwn doctor` reports broken symlinks, stale links, MCP drift, missing generated
files, and project-config issues without fixing them. Unresolved skill references
make `drwn write` fail **before** any mutation, by design.

---

## 9. Advanced: the mind layer

Cards can carry **mind content** — a persona, beliefs, and memory — with
per-layer visibility. When you have more than one mind installed, you order the
active stack explicitly:

```bash
drwn mind list                          # installed minds and which are active
drwn mind use @darwinian/base-mind @team/domain-mind   # ordered active stack
drwn mind clear                         # deactivate all
drwn write
```

By default, all installed minds are active; `drwn mind use` pins an explicit
stack. Authoring mind content (`drwn card source add-persona|add-belief|add-memory`,
then `drwn card publish` / `drwn card push`) is covered in the public docs.

---

## Appendix A: Useful environment variables

| Variable | Purpose |
| --- | --- |
| `AGENTS_REPO_ROOT` | Point a global `drwn` at a local source checkout (see Appendix B). |
| `AGENTS_DIR` | Override the agents directory (default `~/.agents`). |
| `DRWN_STORE_READONLY=1` | Refuse all store mutations (validation/CI). |
| `DRWN_ANALYZER_URL` / `DRWN_TOKEN` | Analyzer API endpoint and bearer token for `drwn login` / `drwn analyze`. |
| `DRWN_FETCH_CONCURRENCY` | Parallel card/skill fetches (default 4). |
| `DRWN_GIT_TIMEOUT_MS` | Git operation timeout (default 30000). |

---

## Appendix B: Checkout / development mode

Use a checkout only to edit the registry, maintain a fork, or develop the CLI.

```bash
git clone https://github.com/remyjkim/darwinian-minds.git
cd darwinian-minds
bun install
bun run drwn -- status
```

Point a globally-installed `drwn` at the checkout:

```bash
export AGENTS_REPO_ROOT=/path/to/darwinian-minds
drwn status
```

For day-to-day development, link the package and run the source directly:

```bash
bun link
drwn --help
```

In checkout mode you can edit `registry/config.json` (targets and toggles),
`registry/mcp-servers.json` (MCP definitions), and `skills/` (built-in skills).

---

## See also

- [`docs/cli-quickref.md`](docs/cli-quickref.md) — full command reference
- [Getting Started](docs-docusaurus/docs/getting-started/) — installation, first run, and task paths
- [`README.md`](README.md) — project overview
