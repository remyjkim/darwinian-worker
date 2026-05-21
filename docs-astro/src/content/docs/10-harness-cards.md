---
title: "Harness Cards"
description: "Author, publish, apply, and update reusable project harness cards."
date: 2026-05-20
order: 10
---

## What Cards Are

Harness Cards are versioned bundles of project harness intent. A card can
include skills, MCP server definitions, extension settings, target settings,
and metadata.

A project records requested cards in:

```text
<project>/.agents/bgng/config.json
```

Exact resolved versions are written to:

```text
<project>/.agents/bgng/card.lock
```

`bgng write` then materializes the resolved project state into project-local
Claude, Codex, and Cursor files.

## Author A Card

Create an editable source:

```bash
bgng card new @me/backend --no-git
bgng card new backend --scope @me --no-git
```

Card sources live under:

```text
~/.agents/bgng/sources/
```

Each source contains `card.json`, `skills/`, and `mcp-servers/`.

Publish a version:

```bash
bgng card publish @me/backend
```

Published card versions are immutable and live under:

```text
~/.agents/bgng/cards/
```

## Inspect Cards

```bash
bgng card list
bgng card list --json
bgng card show @me/backend@1.0.0
bgng card show @me/backend@^1.0.0 --json
bgng card diff @me/backend@1.0.0 @me/backend@1.1.0
bgng card deprecate @me/backend@1.0.0 --message "use 1.1.0"
```

Version ranges use normal semver range behavior. `bgng` resolves the highest
published local version that satisfies the requested range.

## Apply Cards To A Project

From the project root:

```bash
bgng init
bgng apply @me/backend@^1.0.0
bgng write --dry-run
bgng write
```

`bgng apply` is an alias for `bgng card apply`. It replaces the current
project's card set and writes a fresh lockfile.

Project mutation commands:

```bash
bgng card apply @me/backend@^1.0.0
bgng card add @me/observability@^1.0.0
bgng card pin @me/backend@1.0.0
bgng card remove @me/observability
bgng card detach
bgng card update
bgng update
```

Use `--write` with mutation commands when you want to materialize immediately:

```bash
bgng card add @me/observability@^1.0.0 --write
bgng update --write
```

## Local Development Refs

Use `file:` refs while developing a card before publishing it:

```bash
bgng apply file:../cards/backend
bgng write --dry-run
```

File refs resolve from the local path and still write `card.lock` for the
project.

## Updates And CI

Check for newer local versions:

```bash
bgng card outdated
bgng card outdated --check
```

`--check` exits non-zero when updates are available, which makes it suitable
for CI.

Update the lockfile within configured ranges:

```bash
bgng card update
bgng card update --write
```

## Status

```bash
bgng card status
bgng card status --json
bgng card status --explain
bgng status --why card:@me/backend
```

Use card status when you need the current configured refs, locked versions, and
available updates. Use general status provenance when you need to see how cards
affect skills, MCP servers, targets, and write records.
