---
sidebar_position: 12
---

# Status

`drwn status` summarizes the effective harness for the current directory. It reports store state, project config discovery, active targets, skills, MCP servers, extensions, and card lock state.

Use:

```bash
drwn status
drwn status --json
drwn status --why
drwn doctor
```

`--why` adds the resolution context that explains why a skill, MCP server, extension, or card is active. That is useful before a write:

```bash
drwn status --why
drwn write --dry-run
```

For project card state, use:

```bash
drwn card status --explain
drwn card outdated
```
