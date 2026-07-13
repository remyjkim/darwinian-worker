---
sidebar_position: 2
---

# Use a Team's Harness

Team harnesses are consumed as cards and project overlays. Start by initializing the project, adding the team's card, and previewing the generated downstream state:

```bash
drwn init
drwn apply @team/backend@^1.0.0
drwn write --dry-run
drwn write
```

`drwn apply` resolves the card, writes it to `card.lock`, and updates the current project. `drwn write` materializes the resolved skills and MCP config into `.claude`, `.codex`, and `.cursor` for that project.

Keep the project current:

```bash
drwn card status --explain
drwn status --why
drwn card outdated
drwn update
drwn write --dry-run
```

Use `drwn pin @team/backend@1.2.3` when a project needs an exact root version. Use `drwn remove @team/backend` when the project should stop consuming the team harness.

Extensions remain explicit project choices:

```bash
drwn extensions add parallel
drwn extensions add markitdown
drwn extensions add beads --include-skill
```
