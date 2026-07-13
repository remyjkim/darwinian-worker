---
sidebar_position: 3
---

# Machine State

The machine state root is `~/.agents/drwn`. It contains strict machine intent,
standalone inventory, Card sources, published Cards, catalogs, extracted Card
trees, registrations, write records, and credentials. Those categories do not
share one portability policy.

Important paths:

- `~/.agents/drwn/machine.json`: explicit machine capability intent
- `~/.agents/drwn/skills`: installed package-backed skill bundles
- `~/.agents/drwn/mcp-servers`: user-registered MCP server definitions
- `~/.agents/drwn/sources`: editable card sources
- `~/.agents/drwn/cards`: Git-backed published card repositories
- `~/.agents/drwn/extracted`: immutable extracted card trees
- `~/.agents/drwn/catalogs`: local card catalog clones

Inspect state and plan scoped inventory cleanup:

```bash
drwn status --machine
drwn status --machine --json
drwn doctor
drwn machine inventory gc
```

No public command archives this root wholesale. Treat broad archives produced
by prototype releases as sensitive. Remote deploy uses a separate allowlisted
Card payload, and portable inventory transfer remains Task 82.

Readonly mode is useful for validation against mounted or unpacked snapshots:

```bash
DRWN_STORE_READONLY=1 drwn status --machine
DRWN_STORE_READONLY=1 drwn card source doctor
```

Commands that mutate machine state refuse to write when readonly mode is enabled.
