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
bgng skills list
bgng skills curate <skillName>
bgng write --skills-only --dry-run
bgng write --skills-only
```

Only shared skills can be curated into `~/.agents/skills`. Claude-only and Codex-only skills are written directly to their target-specific skill directories.

## Package-Backed Skill Bundles

`beginning-harness` supports package-backed skill bundles for skills that should be available without being added to the built-in first-party tree.

Typical flow:

```bash
bgng library add skill <npm-package-or-local-path>
bgng library list skills
bgng library show <skillName>
bgng add skill <skillName>
bgng write --dry-run
bgng write
```

Global curation remains useful when a shared skill should be available by default across projects:

```bash
bgng skills packages add <npm-package-or-local-path>
bgng skills curate <skillName>
bgng write --skills-only
```

## Added vs. Curated vs. Written

The distinction matters:

- **Added** — the bundle is available under `~/.agents/bgng/skills` in the cards-era store
- **Legacy added** — before store migration, bundles may live under `~/.agents/packages/skills`
- **Curated** — a shared skill is linked into `~/.agents/skills`
- **Written** — the curated skill is linked into downstream tool directories

`bgng store migrate` copies legacy package-backed bundles into
`~/.agents/bgng/skills` and preserves the old layout in an archive.
