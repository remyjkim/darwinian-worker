---
sidebar_position: 12
---

# Status

`drwn status` summarizes the effective harness for the current directory. It reports store state, project config discovery, active targets, skills, MCP servers, extensions, and card lock state.

Use:

```bash
drwn status
drwn status --json
drwn status --machine --json
drwn status --explain
drwn doctor
```

`--machine` ignores an in-scope project config and returns the
`drwn.machine-status` V1 payload. Use it for explicit machine-state inspection
from any working directory.

`--explain` adds a human-readable explanation of every active item and its provenance — which layer (Card, project overlay, machine profile or explicit selection, packaged registry) is making each skill, server, extension, or Card active. That is useful before a write:

```bash
drwn status --explain
drwn write --dry-run
```

`--why <name>` answers a targeted provenance question for a single item:

```bash
drwn status --why skill:reviewer
drwn status --why server:context7
drwn status --why card:@your-handle/backend
```

For project card state, use:

```bash
drwn card status --explain
drwn card outdated
```
