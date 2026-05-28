---
title: "CLI Reference"
description: "Complete command catalog for bgng."
date: 2026-04-28
order: 3
---

## General Commands

| Command | Description |
|---------|-------------|
| `bgng status` | Summarize current effective state |
| `bgng status --explain` | Show provenance for cards, skills, MCP servers, targets, and write records |
| `bgng status --why <category>:<name>` | Explain why one skill, server, extension, target, or card is active |
| `bgng doctor` | Diagnose problems without mutating |
| `bgng scan` | Scan the current environment |
| `bgng init` | Start or bootstrap project config |
| `bgng write` | Write effective config to target tools |
| `bgng write --force` | Overwrite drift in bgng-managed regions |

## Card Commands

| Command | Description |
|---------|-------------|
| `bgng apply <refs...>` | Alias for `bgng card apply` |
| `bgng update` | Alias for `bgng card update` |
| `bgng card new <name>` | Create an editable card source under `~/.agents/bgng/sources` |
| `bgng card publish <name>` | Publish a card source into the immutable local store |
| `bgng card show <ref>` | Show one resolved card version |
| `bgng card list` | List published cards in the local store |
| `bgng card diff <before> <after>` | Compare two published card versions |
| `bgng card deprecate <ref>` | Mark a published version as deprecated |
| `bgng card apply <refs...>` | Replace the current project's card set and write `card.lock` |
| `bgng card add <ref>` | Add one card to the current project |
| `bgng card pin <ref>` | Pin or replace one card ref |
| `bgng card remove <name>` | Remove one card from the project |
| `bgng card detach` | Remove all cards from the project |
| `bgng card update` | Refresh `card.lock` from configured card refs |
| `bgng card outdated` | Report cards with newer local versions available |
| `bgng card status` | Show configured refs, lock entries, and outdated cards |

## Store Commands

| Command | Description |
|---------|-------------|
| `bgng store status` | Show cards-era store status |
| `bgng store migrate` | Migrate the pre-cards layout to `~/.agents/bgng` |

## Add Commands

| Command | Description |
|---------|-------------|
| `bgng add skill [name-or-query]` | Add a skill to the current project |
| `bgng add mcp [name-or-query]` | Add an MCP server to the current project |

## Search Commands

| Command | Description |
|---------|-------------|
| `bgng search skill <query>` | Search for skills in the library and online catalogs |
| `bgng search mcp <query>` | Search for MCP servers |

## Library Commands

| Command | Description |
|---------|-------------|
| `bgng library list [skills\|mcp\|tools]` | List library contents |
| `bgng library show <id>` | Show details for a library item |
| `bgng library add skill <packageSpec>` | Add a package-backed skill bundle |
| `bgng library add mcp <jsonFile> --as <serverId>` | Register a user MCP server |
| `bgng library defaults list` | List machine-wide defaults |
| `bgng library defaults add skill <skillName>` | Add a skill to defaults |
| `bgng library defaults remove skill <skillName>` | Remove a skill from defaults |
| `bgng library defaults add mcp <serverName>` | Add an MCP server to defaults |
| `bgng library defaults remove mcp <serverName>` | Remove an MCP server from defaults |

## Extension Commands

| Command | Description |
|---------|-------------|
| `bgng extensions list` | List available extensions |
| `bgng extensions add <name>` | Enable an extension for the current project |
| `bgng extensions show <name>` | Show extension details |
| `bgng extensions status [name]` | Report extension status |
| `bgng extensions doctor [name]` | Diagnose extension issues |
| `bgng extensions setup beads` | Run Beads setup workflow |
| `bgng extensions setup parallel` | Run Parallel setup workflow |
| `bgng extensions setup markitdown` | Run MarkItDown setup workflow |

## MCP Commands

| Command | Description |
|---------|-------------|
| `bgng mcp list` | List active MCP servers |
| `bgng mcp write` | Write MCP config to targets |

## Skill Commands

| Command | Description |
|---------|-------------|
| `bgng skills list` | List available skills |
| `bgng skills curate <skillName>` | Curate a shared skill |
| `bgng skills uncurate <skillName>` | Remove a skill from curation |
| `bgng skills packages add <packageSpec>` | Add a package-backed skill bundle |
| `bgng skills packages list` | List installed skill packages |
| `bgng skills packages show <packageName>` | Show package details |

## Common Flags

Most inspection commands support `--json` for machine-readable output. Write
commands support `--dry-run` to preview changes. Card project mutation commands
support `--write` to run `bgng write` after a successful mutation.

Use `--help` on any command for details:

```bash
bgng --help
bgng write --help
bgng card --help
bgng store --help
bgng status --help
bgng add skill --help
bgng library list --help
bgng search skill --help
bgng extensions setup beads --help
bgng extensions setup markitdown --help
bgng skills packages add --help
```
