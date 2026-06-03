---
sidebar_position: 5
---

# Set Up Markdownify

This guide enables the optional `markdownify-mcp` server. Markdownify is a
local MCP dependency that converts HTML to Markdown; it is **separate from**
the `markitdown` CLI extension.

The registry entry uses a local `node` invocation:

```json
"markdownify": {
  "description": "HTML to Markdown conversion",
  "transport": "stdio",
  "command": "node",
  "args": ["markdownify-mcp/dist/index.js"],
  "optional": true
}
```

`drwn` does not install or clone `markdownify-mcp` for you.

## Install markdownify-mcp Locally

Clone the upstream project and build its distribution:

```bash
git clone https://github.com/zcaceres/markdownify-mcp.git
cd markdownify-mcp
npm install
npm run build
```

The build produces `markdownify-mcp/dist/index.js`, which is the file the
registry `args` entry expects.

## Configure The Local Path

Edit `registry/mcp-servers.json` and point `markdownify.args[0]` at the
absolute path to your local `dist/index.js`:

```json
"markdownify": {
  "command": "node",
  "args": ["/abs/path/to/markdownify-mcp/dist/index.js"],
  "optional": true
}
```

## Enable The Optional Toggle

In `registry/config.json`, flip the optional toggle on:

```json
"optional": {
  "markdownify": true
}
```

## Activate

Preview, then write MCP state:

```bash
drwn mcp write --dry-run
drwn mcp write
```

## Verify

```bash
drwn mcp list
```

The `markdownify` entry should appear as active for the enabled targets.

## See Also

- [MCP servers concept](../concepts/mcp-servers)
