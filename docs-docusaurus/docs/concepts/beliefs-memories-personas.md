---
sidebar_position: 13
---

# Beliefs, Personas, and Memory

Mind cards can contribute three categories of cognitive content that are injected into the agent's system prompt at write time. Each type is declared in the card manifest and scaffolded via `drwn card source` subcommands.

## Beliefs

A **belief** is a file of factual assertions — domain truths the author wants the agent to treat as given. Beliefs are composed into the system prompt as read-only context.

On disk (inside a card source): `beliefs/<entry>/BELIEF.md`

```bash
# Scaffold a new belief entry
drwn card source add-belief @your-handle/mind engineering --visibility public

# Remove a belief entry (and its files by default)
drwn card source remove-belief @your-handle/mind engineering
drwn card source remove-belief @your-handle/mind engineering --keep-files
```

The `--visibility` flag is required and controls which consumers receive the belief:

| Value | Meaning |
|---|---|
| `private` | Only the card author's projects |
| `internal` | Org-internal consumers |
| `public` | Any consumer |

In the card manifest (`card.json`), beliefs appear under `beliefs.include`:

```json
{
  "beliefs": {
    "include": ["engineering"]
  }
}
```

## Personas

A **persona** is a file that shapes the agent's behavioral and stylistic identity — tone, voice, scope of engagement, communication style. Persona sections compose in the selected Worker closure's root/member order.

On disk: `persona/<entry>/PERSONA.md`

```bash
# Scaffold a persona entry
drwn card source add-persona @your-handle/mind voice --visibility internal

# Remove a persona entry
drwn card source remove-persona @your-handle/mind voice
drwn card source remove-persona @your-handle/mind voice --keep-files
```

In the card manifest:

```json
{
  "persona": {
    "include": ["voice"]
  }
}
```

## Memory

**Memory** is layered structured knowledge that accumulates over time. Three layers are supported, each designed for a different retention horizon:

| Layer | Path | Typical content | Format |
|---|---|---|---|
| L4 | `memory/l4/<entry>/` | Short-term project context, recent decisions | `md` |
| L5 | `memory/l5/<entry>/` | Mid-term accumulated patterns, team knowledge | `jsonl` or `mixed` |
| L6 | `memory/l6/<entry>/` | Long-term durable facts, stable domain knowledge | `jsonl` |

```bash
# Scaffold an L4 markdown memory entry
drwn card source add-memory @your-handle/mind context --layer l4 --visibility private --format md

# Scaffold an L6 JSONL memory entry
drwn card source add-memory @your-handle/mind raw --layer l6 --visibility private --format jsonl

# Remove a memory entry
drwn card source remove-memory @your-handle/mind context --layer l4
drwn card source remove-memory @your-handle/mind context --layer l4 --keep-files
```

**Flags for `add-memory`:**

| Flag | Required | Values | Default |
|---|---|---|---|
| `--layer` | yes | `l4`, `l5`, `l6` | — |
| `--visibility` | yes | `private`, `internal`, `public` | — |
| `--format` | no | `md`, `jsonl`, `mixed` | `md` |

In the card manifest, memory entries appear under the layer they belong to:

```json
{
  "memory": {
    "l4": { "include": ["context"] },
    "l6": { "include": ["raw"], "format": "jsonl" }
  }
}
```

## Visibility and composition

All three content types carry explicit visibility metadata. `drwn write` filters content based on visibility and the current project's trust policy. Content marked `private` is never exported when the card is published to a catalog.

Mind content from the selected root and its ordered member Cards is composed with source fences. See [Minds](./minds) for the composition model.

## See also

- [Minds](./minds) — how the selected Worker closure supplies Mind content
- [Hook Policies](./hook-policies) — the fourth mind card content type
- [`drwn card source`](../reference/cli/card) — scaffolding commands
- [Guide: Authoring Mind Cards](../guides/authoring-mind-cards)
