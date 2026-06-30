---
sidebar_position: 20
---

# Mind

`drwn mind` manages the active mind stack for the current project. Mind cards contribute beliefs, personas, memory, and hook policies to the agent's cognitive layer; this namespace controls which installed mind cards are active and in what order.

## Commands

### `drwn mind list`

Lists installed minds and the active stack.

```bash
drwn mind list
drwn mind list --json
```

Output columns: mind name, version, and whether it is currently active.

When `activeMinds` is not set in project config, all installed minds are active by default, and the command appends a note explaining this. Use `drwn mind use` to pin an explicit ordered stack.

**Flags**

| Flag | Description |
|---|---|
| `--json` | Emit machine-readable JSON output. |

**JSON output schema**

```json
{
  "minds": [
    { "name": "@team/base", "version": "1.0.0", "active": true },
    { "name": "@team/frontend", "version": "2.1.0", "active": false }
  ],
  "activeMinds": ["@team/base"],
  "defaultActiveMinds": false
}
```

`defaultActiveMinds: true` means no explicit stack is set — all installed minds are currently active.

---

### `drwn mind use`

Sets the ordered active mind stack for this project. Takes one or more mind names; order matters for composition priority.

```bash
drwn mind use @team/base
drwn mind use @team/base @team/frontend
drwn mind use @team/base @team/frontend --json
```

Fails if any named mind is not installed in this project. Persists `activeMinds` in `.agents/drwn/config.json`. The next `drwn write` projects only the declared stack into downstream tool surfaces.

**Arguments**

| Argument | Description |
|---|---|
| `<name>...` | One or more installed mind card names, in activation order. At least one required. |

**Flags**

| Flag | Description |
|---|---|
| `--json` | Emit machine-readable JSON output. |

---

### `drwn mind clear`

Clears the active mind stack. Sets `activeMinds` to an empty list in project config.

```bash
drwn mind clear
drwn mind clear --json
```

Installed card bundles remain materialized — `clear` only removes the active-stack declaration. The next `drwn write` will exclude all mind-card contributions from downstream state.

**Flags**

| Flag | Description |
|---|---|
| `--json` | Emit machine-readable JSON output. |

## Typical workflow

```bash
# Install a mind card
drwn add @team/base
drwn install

# Inspect what is available
drwn mind list

# Activate an ordered stack
drwn mind use @team/base @team/frontend

# Materialize the active stack into tool state
drwn write

# Remove all mind activation
drwn mind clear
drwn write
```

## See also

- [Minds concept](../../concepts/minds) — what a mind card is and how the active stack composes
- [Beliefs, Personas, and Memory](../../concepts/beliefs-memories-personas) — the content types a mind card contributes
- [`drwn card source add-belief`](./card#add-belief) — authoring mind content
