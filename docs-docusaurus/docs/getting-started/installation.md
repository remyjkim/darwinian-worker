---
sidebar_position: 1
---

# Installation

Pick the installation path that matches what you want to do. The published package is right for almost everyone; work from a checkout only if you plan to edit the registry, maintain a fork, or develop the CLI itself.

## Requirements

- **Bun 1.2+** - runtime for the CLI
- **Node.js** - for MCP servers that spawn `node`
- **npm** - when installing the published package or adding npm skill bundles
- *Optional:* `parallel-cli` or `markitdown`, only when you enable those integrations

## Install the published package

```bash
npm install -g darwinian-minds
drwn status
```

The published package ships with built-in harness defaults. By default, a global `drwn` uses that packaged harness source.
The package also installs `dminds` as a secondary alias for the same CLI.

## Work from a checkout

Use this mode if you want to edit the registry, maintain your own fork, add built-in skills, or develop the CLI:

```bash
git clone https://github.com/remyjkim/darwinian-minds.git
cd darwinian-minds
bun install
bun run drwn -- status
```

You can also point a globally-installed `drwn` at a local checkout:

```bash
export AGENTS_REPO_ROOT=/path/to/darwinian-minds
drwn status
```

For day-to-day development inside the checkout, link the package:

```bash
bun link
drwn --help
```

## Verify the install

```bash
drwn --help
drwn status
```

You should see the CLI help banner and a status summary listing repo root, `~/.agents` path, enabled targets, and current inventory counts.

## Platform support

`drwn` is developed and tested on **macOS** and **Linux**. Windows is not yet officially supported.

**Windows users:** run `drwn` under [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) (Ubuntu 22.04 LTS or later recommended). WSL2 provides full POSIX compatibility and is the recommended path until native Windows support ships.

Windows-native credential storage (DPAPI) is partially implemented and will enable a future native release. The `drwn doctor` output may include `platformChecks` entries for Windows-specific blockers on non-WSL environments.

## Next

Continue to [First Run](./first-run) to walk through the standard dry-run to write sequence.
