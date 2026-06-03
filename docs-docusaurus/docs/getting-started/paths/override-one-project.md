---
sidebar_position: 4
---

# Override for One Project

One project needs a different effective harness than your machine defaults provide. This path scaffolds a project overlay at `<project>/.agents/drwn/config.json`, points the harness at it, and writes the project-scoped downstream state into `<project>/.claude`, `<project>/.codex`, and `<project>/.cursor`.

## Prerequisites

- `drwn` installed and the machine already set up — see [Set Up Your Machine](./setup-your-machine).
- A project directory you can write to.

## Scaffold the project overlay

`drwn init` writes `<project>/.agents/drwn/config.json`. Pass `--non-interactive` (or `--minimal`) when you want a prompt-free minimal config; the default is guided when both stdin and stdout are TTYs.

```bash
cd /path/to/project
drwn init
drwn init --non-interactive
```

`init` warns if your `.gitignore` appears to exclude `.agents`. It never edits `.gitignore` for you.

## Edit the overlay

The overlay is plain JSON. Edit `<project>/.agents/drwn/config.json` directly, or use `drwn add` / `drwn extensions add` to mutate it.

```bash
drwn add skill <skill-name>
drwn add mcp <server-name>
drwn extensions add parallel
drwn extensions add markitdown
drwn extensions add beads --include-skill
```

The overlay shape is documented in the [project config guide](../../concepts/layered-model). At minimum it carries `version: 1` and any of `skills.include`, `skills.exclude`, `servers`, `extensions`, `targets`, and `cards`.

**Machine-overlay suppression inside configured projects.** When a project config is present, the project overlay merges with the packaged defaults, not with `~/.agents/drwn/machine.json`. Machine-curated skills and machine `defaults.skills` / `defaults.mcpServers` do not leak into the project. The intent is that a project's effective harness is reproducible from its own files (plus the packaged baseline) — a different teammate on a different machine sees the same effective state.

## Confirm the project overlay is detected

```bash
drwn status
drwn status --explain
drwn status --json
```

The output should show `project.configPath` pointing at your overlay and any `project.servers`, `project.skills`, `project.extensions`, or `project.cards` entries you added. If `project` is missing from the output, `drwn` did not find the config — re-check the path or run from inside the project directory.

For provenance questions ("why is this skill in the effective state?"), use `drwn status --why`:

```bash
drwn status --why skill:<name>
drwn status --why server:<name>
```

## Preview, then write

```bash
drwn write --dry-run
drwn write
```

`drwn write` materializes into `<project>/.claude`, `<project>/.codex`, and `<project>/.cursor` when the project overlay is present — not into the machine-scope directories. The project write record at `<project>/.agents/drwn/write-record.json` tracks what was written so the next run can clean up safely.

## Verify

```bash
drwn status
drwn doctor
ls <project>/.claude/skills
ls <project>/.codex/skills
cat <project>/.cursor/mcp.json
```

`drwn doctor` against the project (run from inside the project directory) reports project-scoped issues — unknown skill references, stale target overrides, card-skill availability, and the rest of the categories described in [Reading Doctor](../../troubleshooting/reading-doctor).

## Cross-References

- [Layered Model](../../concepts/layered-model) for how project, machine, and card layers compose
- [Use a Team's Harness](./use-team-harness) when the project overlay should consume a card rather than be defined locally
- [Using `status --why`](../../troubleshooting/using-status-why) for tracing where an active item came from
- [Reading Doctor](../../troubleshooting/reading-doctor) for the diagnostic surface
