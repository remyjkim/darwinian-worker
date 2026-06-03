---
sidebar_position: 9
---

# Extensions

`drwn extensions` manages optional capability families such as Parallel, Beads, and MarkItDown. Extensions can combine skills, MCP options, setup checks, and project config.

Inspect extension support:

```bash
drwn extensions list
drwn extensions show parallel
drwn extensions status
drwn extensions status parallel --json
drwn extensions doctor
drwn extensions doctor markitdown
```

Add extensions to the current project:

```bash
drwn extensions add parallel
drwn extensions add parallel --mcp
drwn extensions add beads --include-skill
drwn extensions add markitdown
```

Run setup flows explicitly:

```bash
drwn extensions setup parallel --dry-run
drwn extensions setup beads
drwn extensions setup markitdown --install
```

After changing extension config, preview and write downstream state:

```bash
drwn write --dry-run
drwn write
```
