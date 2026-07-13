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
drwn store seed --from /path/to/snapshot
drwn store seed --from /path/to/snapshot --force
drwn store export --out /tmp/drwn-store.tar
```

`drwn store export` is registered but disabled. It exits with `STORE_EXPORT_DISABLED_UNSAFE` before creating an output directory because a whole-store archive can contain credentials and operational state. There is no unrestricted override. Treat broad Store archives produced by earlier releases as sensitive.

`drwn store seed` populates an empty store from a legacy snapshot or prepared directory. It refuses to overwrite a non-empty store unless `--force` is passed. It remains available for CI base images and airgapped deployments where card cloning is unavailable.

The Store contains strict machine intent, package-backed skills, MCP server definitions, Card sources, published Card repositories, extracted Card trees, catalogs, and write records.

Use readonly mode for checks that must not mutate local state:

```bash
DRWN_STORE_READONLY=1 drwn store status --json
DRWN_STORE_READONLY=1 drwn card source list
```
