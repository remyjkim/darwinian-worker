---
sidebar_position: 3
---

# Local Store

The local Store is `~/.agents/drwn`. It is the durable state for strict machine intent, reusable Library content, Card sources, published Cards, catalogs, extracted Card trees, and write records.

Important paths:

- `~/.agents/drwn/machine.json`: machine-wide active defaults
- `~/.agents/drwn/skills`: installed package-backed skill bundles
- `~/.agents/drwn/mcp-servers`: user-registered MCP server definitions
- `~/.agents/drwn/sources`: editable card sources
- `~/.agents/drwn/cards`: Git-backed published card repositories
- `~/.agents/drwn/extracted`: immutable extracted card trees
- `~/.agents/drwn/catalogs`: local card catalog clones

Inspect and maintain the store:

```bash
drwn store status
drwn store status --json
drwn store verify
drwn store migrate
drwn store migrate-to-git --dry-run --json
drwn store gc
```

Whole-store export is disabled with `STORE_EXPORT_DISABLED_UNSAFE` because this directory can contain credentials and operational state. There is no unrestricted override. Treat broad Store archives produced by earlier releases as sensitive.

Readonly mode is useful for validation against mounted or unpacked snapshots:

```bash
DRWN_STORE_READONLY=1 drwn store status
DRWN_STORE_READONLY=1 drwn card source doctor
```

Commands that mutate store state refuse to write when readonly mode is enabled.
