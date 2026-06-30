---
sidebar_position: 11
---

# Managing Minds

This guide covers the day-to-day workflow for managing the active mind stack in a project — inspecting installed minds, activating a subset, changing order, and removing activation.

## Install a mind card

Mind cards are installed the same way as regular harness cards:

```bash
drwn card add @team/base@^1.0.0
drwn install
```

`drwn install` fetches the card from the store and runs `drwn write` to materialize its contributions. If the card declares hooks, grant trust before writing:

```bash
drwn card trust @team/base --hooks
drwn write
```

## Inspect installed minds

```bash
drwn mind list
drwn mind list --json
```

The table shows each installed mind, its version, and whether it is currently active. When no explicit stack has been set, all installed minds are active and a note indicates the default mode:

```
mind            version  active
@team/base      1.0.0    yes
@team/frontend  2.1.0    yes

Default: all installed minds are active. Run `drwn mind use` to pin an explicit stack.
```

## Set an explicit active stack

To control which minds are active and in what order:

```bash
drwn mind use @team/base
drwn mind use @team/base @team/frontend
```

Order matters for content composition — earlier cards take precedence. After setting the stack, run `drwn write` to apply it:

```bash
drwn mind use @team/base @team/frontend
drwn write
```

The active stack is persisted to `.agents/drwn/config.json` under `activeMinds`:

```json
{
  "version": 1,
  "activeMinds": ["@team/base", "@team/frontend"]
}
```

## Change the active order

Pass a new ordered list to replace the current stack:

```bash
drwn mind use @team/frontend @team/base
drwn write
```

## Remove all mind activation

`drwn mind clear` resets to an empty stack without uninstalling the cards:

```bash
drwn mind clear
drwn write
```

After clearing, no mind-card content is projected into downstream tool state. The card bundles remain in the store and can be reactivated with `drwn mind use`.

## Remove a mind card entirely

```bash
drwn card remove @team/base
drwn write
```

This removes the card from `card.lock` and cleans up its materialized content.

## Team-shared mind configuration

Commit the project config to share the active stack across the team:

```bash
# config.json is at .agents/drwn/config.json
git add .agents/drwn/config.json
git commit -m "activate team mind cards"
```

When a teammate runs `drwn install` after pulling, they get the same stack automatically.

## Verify the active configuration

```bash
drwn status
drwn doctor
```

`drwn doctor` reports `hookIssues` for any installed mind card that declares hooks but has not been trusted by the current user.

## See also

- [Minds](../concepts/minds) — the active stack model and default behavior
- [`drwn mind`](../reference/cli/mind) — CLI reference
- [Authoring Mind Cards](./authoring-mind-cards) — creating a mind card from scratch
