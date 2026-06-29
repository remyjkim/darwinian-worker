---
sidebar_position: 5
---

# Use Darwinian Minds Skills

Darwinian Minds Skills is the workflow skill pack for operating `drwn` from
agent runtimes. Install it when you want agents to follow the same inspect,
dry-run, approval, mutation, and verification sequence you would use manually.

The full skill bodies live in the
[darwinian-minds-skills](https://github.com/remyjkim/darwinian-minds-skills)
repo. This page covers installation, activation, and choosing the right skill.

## Install The Bundle

Install from GitHub:

```bash
drwn library add skill github:remyjkim/darwinian-minds-skills
drwn skills packages show darwinian-minds-skills
```

For local development, install from a checkout:

```bash
git clone git@github.com:remyjkim/darwinian-minds-skills.git
drwn library add skill ./darwinian-minds-skills
drwn skills packages show darwinian-minds-skills
```

Installing a bundle makes its skills available. It does not activate them in a
project and does not make them machine defaults.

## Add One Skill To A Project

Inside a project:

```bash
drwn init --non-interactive
drwn add skill inspect-harness --dry-run --json
drwn add skill inspect-harness
drwn write --dry-run
```

Use `drwn write` only after the dry run shows the downstream changes you expect.

## Make A Skill A Machine Default

Use defaults only when every future project on the machine should inherit the
skill:

```bash
drwn library defaults add skill inspect-harness --dry-run --json
drwn library defaults add skill inspect-harness
drwn write --dry-run
```

Defaulting a shared skill also curates it into the compatibility publication
layer at `~/.agents/skills`.

## Use The Stable Card During Development

The skills repo also ships a stable Mind Card source. From a checkout:

```bash
drwn apply file:/path/to/darwinian-minds-skills/cards/harness-skills
drwn write --dry-run
```

Use the card when a project should carry a locked harness baseline. Use the
package-backed bundle when you only need the workflow skills available for
selection.

## Choose The Right Skill

| User ask | Skill |
| --- | --- |
| Set up this repo | `bootstrap-project` |
| I cloned this repo and it has `card.lock` | `install-harness-project` |
| Apply or update a card | `apply-mind-card` |
| Create or publish a card | `author-mind-card` |
| Push, fetch, or clone a card through Git | `share-mind-card` |
| Add a skill or MCP server to this project | `materialize-harness` |
| Write generated Claude, Codex, or Cursor state | `materialize-harness` |
| Install a bundle, MCP definition, or card catalog | `manage-harness-library` |
| Make a skill or MCP server active by default | `manage-defaults` |
| Explain current state or provenance | `inspect-harness` |
| Fix drift or legacy layout | `repair-harness` |
| Recommend what to add | `recommend-harness` |
| Export sessions or run store support checks | `support-harness` |

`organize-workspace` is experimental and should not be treated as a stable
workflow until `drwn scan` is implemented.

## Keep Procedures Canonical

Do not copy entire `SKILL.md` bodies into project docs. The skills repo is the
canonical source for exact agent procedures. Docusaurus should explain how to
install, activate, and choose the skills.
