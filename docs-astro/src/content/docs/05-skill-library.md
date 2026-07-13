---
title: "Skill Library"
description: "Built-in skills, explicit selection, and package-backed skill bundles."
date: 2026-04-28
order: 5
---

## Built-In Skills

Built-in skills live in four directories:

- `skills/shared` — available to all agent tools
- `skills/claude-only` — applied only to Claude Code
- `skills/codex-only` — applied only to Codex
- `skills/experimental` — not applied by default

## Machine Selection

Typical flow:

```bash
drwn skills list
drwn library defaults add skill <skillName>
drwn write --scope machine --skills-only --dry-run
drwn write --scope machine --skills-only
```

Selection writes strict machine intent. Projection is a separate, ownership-recorded step.

## Package-Backed Skill Bundles

`darwinian` supports package-backed skill bundles for skills that should be available without being added to the built-in first-party tree.

Typical flow:

```bash
drwn library add skill <npm-package-or-local-path>
drwn library list skills
drwn library show <skillName>
drwn add skill <skillName>
drwn write --dry-run
drwn write
```

To select an installed skill for machine sessions:

```bash
drwn skills packages add <npm-package-or-local-path>
drwn library defaults add skill <skillName>
drwn write --scope machine --skills-only
```

## Added vs. Selected vs. Written

The distinction matters:

- **Added** — the bundle is available under `~/.agents/drwn/skills` in the cards-era store
- **Selected** — machine or project intent names the skill
- **Written** — selected bytes are copied into owned downstream tool directories

Package-backed bundles use the current `~/.agents/drwn/skills` store path.
