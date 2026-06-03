---
sidebar_position: 11
---

# Store

`drwn store` inspects and maintains the local store at `~/.agents/drwn`.

Commands:

```bash
drwn store status
drwn store status --json
drwn store verify
drwn store verify --json
drwn store migrate
drwn store migrate --yes
drwn store migrate-to-git
drwn store migrate-to-git --dry-run --json
drwn store gc
drwn store export --out /tmp/drwn-store.tar
```

The store contains machine defaults, package-backed skills, MCP server definitions, card sources, published card repositories, extracted card trees, catalogs, and write records.

Use readonly mode for checks that must not mutate local state:

```bash
DRWN_STORE_READONLY=1 drwn store status --json
DRWN_STORE_READONLY=1 drwn card source list
```
