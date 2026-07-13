---
sidebar_position: 4
---

# Skills

Skills are agent instructions (`SKILL.md`) plus optional supporting files that `drwn` resolves, selects, and projects into downstream tool directories (`~/.claude/skills`, `~/.codex/skills`, project-scope equivalents).

## Skill scopes

Built-in repo-native skills live under one of four scope directories:

- `skills/shared` — eligible for both Claude and Codex
- `skills/claude-only` — eligible only for Claude Code
- `skills/codex-only` — eligible only for Codex
- `skills/experimental` — available only when explicitly selected

Scope limits projection targets. It does not activate a skill.

## Where skills come from

`drwn` resolves a skill name against these layers, in this order:

1. **Selected Card closure** — a Card in the active project Worker whose manifest declares the skill. Card-bundled skills always win at project write time.
2. **Repo-native** — the four scope directories above, in order `shared` → `claude-only` → `codex-only` → `experimental`.
3. **Package-backed bundles** — installed via `drwn library add skill` or `drwn skills packages add`; live under `~/.agents/drwn/skills/<package>/<version>/` with a `current` symlink to the active version.
4. **Missing** — surfaces as a typed write-time hard fail before any downstream mutation.

There is no scope-based promotion between repo-native and bundle sources; first match wins. Cards are the only layer that can shadow other sources at write time.

## Explicit Selection

Machine activation comes only from the selected immutable profile plus explicit `capabilities.skills` IDs in strict `drwn.machine` V1. Select an available skill with:

```bash
drwn library defaults add skill <name>
drwn write --scope machine --skills-only --dry-run
drwn write --scope machine --skills-only
```

Project selection comes from the selected Worker closure plus explicit project overlays. Use `drwn add skill <name>` for a project-only declaration.

Ambient directories and existing target output are never activation authority.

## Materialization to downstream tools

`drwn write` resolves the selected machine or project skill set and copies skill directories into the appropriate machine or project target directories. Each copied directory is recorded as a `managed-directory` entry in the write record.

Per-write-record cleanup applies: drwn-owned stale skill directories (recorded in the previous write record) are removed when no longer in the effective state; user-owned replacements are preserved and reported as warnings.

## See also

- [Materialization](./materialization) — the write-time pipeline
- [Extensions, bundles, and cards](./extensions-bundles-cards) — the add vs select vs write model
- [`reference/cli/skills`](../reference/cli/skills) — command-by-command surface
- [`reference/cli/library`](../reference/cli/library) — the inventory and defaults commands
- `.ai/knowledges/10_drwn-cli-architecture.md` §4 — full architectural reference
