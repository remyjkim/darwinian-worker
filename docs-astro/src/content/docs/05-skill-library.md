---
title: "Skill Library"
description: "Built-in skills, curation, and package-backed skill bundles."
date: 2026-04-28
order: 5
---

## Built-In Skills

Built-in skills live in four directories:

- `skills/shared` — available to all agent tools
- `skills/claude-only` — applied only to Claude Code
- `skills/codex-only` — applied only to Codex
- `skills/experimental` — not applied by default

## Curation

Curated shared skills are published to:

```text
~/.agents/skills
```

Typical flow:

```bash
drwn skills list
drwn skills curate <skillName>
drwn write --skills-only --dry-run
drwn write --skills-only
```

Only shared skills can be curated into `~/.agents/skills`. Claude-only and Codex-only skills are written directly to their target-specific skill directories.

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

Global curation remains useful when a shared skill should be available by default across projects:

```bash
drwn skills packages add <npm-package-or-local-path>
drwn skills curate <skillName>
drwn write --skills-only
```

## Added vs. Curated vs. Written

The distinction matters:

- **Added** — the bundle is available under `~/.agents/drwn/skills` in the cards-era store
- **Curated** — a shared skill is linked into `~/.agents/skills`
- **Written** — the curated skill is linked into downstream tool directories

Package-backed bundles use the current `~/.agents/drwn/skills` store path.
