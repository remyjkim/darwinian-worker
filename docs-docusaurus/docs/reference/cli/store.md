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
drwn store seed --from /path/to/snapshot
drwn store seed --from /path/to/snapshot --force
```

`drwn store seed` populates an empty store from a previously exported tarball or directory. It refuses to overwrite a non-empty store unless `--force` is passed. Designed for CI base images and airgapped deployments where card cloning is unavailable.

The store contains machine defaults, package-backed skills, MCP server definitions, card sources, published card repositories, extracted card trees, catalogs, and write records.

Use readonly mode for checks that must not mutate local state:

```bash
DRWN_STORE_READONLY=1 drwn store status --json
DRWN_STORE_READONLY=1 drwn card source list
```
