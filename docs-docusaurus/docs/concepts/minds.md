---
sidebar_position: 12
---

# Minds

A **mind card** is a harness card that contributes to the agent's cognitive layer — the beliefs, persona, memory, and hook policies that shape how the AI thinks and behaves — rather than (or in addition to) contributing skills and MCP servers.

## What a mind card contributes

| Content type | File | Effect |
|---|---|---|
| Beliefs | `BELIEF.md` | Factual assertions composed into the system prompt |
| Persona | `PERSONA.md` | Behavioral and stylistic identity layer |
| Memory (L4) | `l4/<entry>/` | Short-term project memory (markdown format) |
| Memory (L5) | `l5/<entry>/` | Mid-term accumulated knowledge (JSONL or mixed) |
| Memory (L6) | `l6/<entry>/` | Long-term durable facts (structured) |
| Hook policies | `hooks/<name>/policy.ts` | Runtime tool intercept and observation policies |

A mind card can contribute any combination of these. A card that contributes only skills and MCP servers is a regular harness card, not a mind card, though the distinction is informal — the same card format supports both.

## The active mind stack

The **active mind stack** is an ordered list of mind card names that `drwn write` projects into downstream tool state. It is declared in `.agents/drwn/config.json` under `activeMinds`:

```json
{
  "version": 1,
  "cards": ["@team/base", "@team/frontend"],
  "activeMinds": ["@team/base", "@team/frontend"]
}
```

Order matters: beliefs and persona content from earlier cards in the stack take precedence during composition.

### Default behavior

When `activeMinds` is absent from project config, all installed mind cards are active. This default ensures installed minds are immediately useful without requiring explicit activation. To pin a subset or control order, use `drwn mind use`.

## Managing the active stack

```bash
# Inspect installed minds and which are active
drwn mind list

# Activate an explicit ordered stack
drwn mind use @team/base @team/frontend

# Remove all active-stack declarations (returns to all-active default)
drwn mind clear
```

Changes to the active stack take effect on the next `drwn write`.

## Installation

Mind cards are installed the same way as regular harness cards:

```bash
drwn add @team/base
drwn install
drwn mind use @team/base
drwn write
```

## Authoring a mind card

Mind content is scaffolded via `drwn card source` subcommands:

```bash
drwn card source add-belief @your-handle/mind engineering --visibility public
drwn card source add-persona @your-handle/mind voice --visibility internal
drwn card source add-memory @your-handle/mind context --layer l4 --visibility private --format md
drwn card source add-hook @your-handle/mind audit-tool-calls
```

See [Beliefs, Personas, and Memory](./beliefs-memories-personas) and [Hook Policies](./hook-policies) for the content model.

## Relationship to hook consent

If a mind card declares hook policies, consuming projects must grant trust before the policies are active at runtime:

```bash
drwn card trust @team/base --hooks
```

`drwn doctor` reports a `hookIssues` entry for any installed mind card that declares hooks but has not been trusted. See the [Diagnostics Model](./diagnostics-model) for details.

## See also

- [`drwn mind`](../reference/cli/mind) — CLI reference for the mind namespace
- [Beliefs, Personas, and Memory](./beliefs-memories-personas) — content type details
- [Hook Policies](./hook-policies) — how runtime tool interception works
- [Guide: Managing Minds](../guides/managing-minds) — day-to-day workflow
