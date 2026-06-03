---
sidebar_position: 1
---

# Init

`drwn init` creates the per-project config scaffold at `<project>/.agents/drwn/config.json`. In a TTY it runs guided setup; in non-interactive contexts it writes a minimal config.

Bootstrap a project from an interactive shell:

```bash
drwn init
```

Guided init prompts once for Parallel and once for Beads. Answering yes to either records the corresponding `extensions.<name>` block in the project config — no global side effects.

For scripts and CI:

```bash
drwn init --non-interactive
drwn init --minimal
```

`--non-interactive` and `--minimal` are equivalent: both skip prompts and write the bare `{ "version": 1 }` config.

Force the guided flow even when invoked with flags:

```bash
drwn init --guided
```

Re-run setup on a project that already has a config:

```bash
drwn init --force
drwn init --force --guided
```

Without `--force`, `drwn init` refuses to overwrite an existing project config.

Skip pre-registering the default community card catalog:

```bash
drwn init --no-default-catalogs
```

By default, `drwn init` registers the default community card catalog into `~/.agents/drwn/catalogs.json` so that `drwn search card <query>` works out of the box.

## Side effects

- Writes `<project>/.agents/drwn/config.json`.
- In guided mode, may add `extensions.parallel` and/or `extensions.beads` blocks based on prompt answers.
- Registers the default community card catalog under `~/.agents/drwn/` unless `--no-default-catalogs` is passed.
- Reads `<project>/.gitignore` if present and warns when it appears to exclude `.agents`. The file is never mutated.

## What you can edit afterward

The project overlay can:

- enable or disable MCP servers for this project
- add project-local MCP server definitions
- enable extensions such as Parallel, Beads, or MarkItDown
- include or exclude skills during write
- enable or disable targets locally

See [Per-project configuration](../../guides/per-project-config) and `.ai/knowledges/02_per-project-config-guide.md` for the full overlay model.
