---
sidebar_position: 5
---

# Use Darwinian Minds Skills

Darwinian Minds Skills is the workflow skill pack for operating `drwn` from
agent runtimes. Install it when you want agents to follow the same inspect,
dry-run, approval, mutation, and verification sequence you would use manually.

The full skill bodies live in the
[darwinian-worker-skills](https://github.com/remyjkim/darwinian-worker-skills)
repo. This page covers installation, activation, and choosing the right skill.

## Install The Bundle

Install from GitHub:

```bash
drwn machine skill install github:remyjkim/darwinian-worker-skills
drwn machine skill show --package darwinian-worker-skills
```

For local development, install from a checkout:

```bash
git clone git@github.com:remyjkim/darwinian-worker-skills.git
drwn machine skill install ./darwinian-worker-skills
drwn machine skill show --package darwinian-worker-skills
```

Installing a bundle makes its skills available. It does not activate them in a
project and does not select them for machine scope.

## Add One Skill To A Project

Inside a project:

```bash
drwn init --non-interactive
drwn add skill inspect-harness --dry-run --json
drwn add skill inspect-harness
drwn write --dry-run
```

Use `drwn write` only after the dry run shows the downstream changes you expect.

## Select A Skill For Machine Scope

Use a machine selection only when machine sessions should expose the skill.
Projects remain independent from this selection:

```bash
drwn machine skill enable inspect-harness --dry-run --json
drwn machine skill enable inspect-harness
drwn write --scope machine --dry-run
drwn write --scope machine
```

## Use The Stable Card During Development

The skills repo also ships a stable Mind Card source. From a checkout:

```bash
drwn apply file:/path/to/darwinian-worker-skills/cards/harness-skills
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
| Select a skill or MCP server for machine scope | `manage-defaults` |
| Explain current state or provenance | `inspect-harness` |
| Fix projection drift or inventory-reference issues | `repair-harness` |
| Recommend what to add | `recommend-harness` |
| Export sessions or run support diagnostics | `support-harness` |

`organize-workspace` is experimental and should not be treated as a stable
workflow until `drwn scan` is implemented.

## Keep Procedures Canonical

Do not copy entire `SKILL.md` bodies into project docs. The skills repo is the
canonical source for exact agent procedures. Docusaurus should explain how to
install, activate, and choose the skills.
