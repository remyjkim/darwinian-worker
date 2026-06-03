---
sidebar_position: 1
---

# Per-Project Override Patterns

This guide shows when to use per-project config, how to scaffold it, and the
common patterns for tailoring one project without changing your machine-wide
defaults.

## When To Use Per-Project Config

Reach for a project config when **one project** needs a different effective
view than your machine defaults. Examples:

- a project should disable a globally curated skill
- a project should add its own local MCP server
- a project should enable Parallel, Beads, or MarkItDown without enabling them globally
- a project should disable a downstream target (e.g. no Cursor)

If every project should get the change, prefer machine defaults
(`drwn library defaults add ...`) instead.

## Scaffold

```bash
cd /path/to/project
drwn init
```

This creates:

```text
<project>/.agents/drwn/config.json
```

Use `--non-interactive` or `--minimal` for scripts. `--force` overwrites an
existing config.

## What Project Config Can Do

A project config can:

- toggle existing MCP servers on or off for one project
- add project-local MCP server definitions
- enable extensions (Parallel, Beads, MarkItDown) for one project
- include or exclude skills during write
- enable or disable downstream targets for one project

## Discovery

Discovery walks **upward** from the current working directory and stops at the
first matching config. Commands outside a configured project fall back to the
machine-wide harness view. Discovery affects `drwn write`, `drwn mcp list`,
`drwn mcp write`, `drwn status`, `drwn doctor`, and all `drwn extensions`
subcommands.

## Full Extension Example

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

## Include vs Exclude Precedence

`skills.include` adds repo-native and package-backed skills into the project
write. `skills.exclude` removes matching skills from project write.

If an extension derives a skill and `skills.exclude` names the same skill,
**`skills.exclude` wins**. Unknown skill names in `skills.include` fail
`drwn write` before mutation and are also reported by `drwn doctor`.

## Machine Defaults Are Suppressed When Project Config Is Present

When a project config exists, machine-only defaults from
`~/.agents/drwn/machine.json` do not apply. The project takes full ownership of
its effective view, layered as:

```text
built-in defaults -> user library -> cards in declared order -> project overlay
```

This keeps project behavior reproducible across machines.

## Recommended Workflow

```bash
cd /path/to/project
drwn init
$EDITOR .agents/drwn/config.json
drwn status
drwn write --dry-run
drwn doctor
drwn write
```

## See Also

- [init CLI reference](../reference/cli/init)
- [Project config schema](../reference/schemas/project-config-json)
- [Layered model](../concepts/layered-model)
