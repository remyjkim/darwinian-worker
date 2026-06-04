---
sidebar_position: 4
---

# Skills

Skills are agent instructions (`SKILL.md`) plus optional supporting files that `drwn` resolves, curates, and materializes into downstream tool directories (`~/.claude/skills`, `~/.codex/skills`, project-scope equivalents).

## Skill scopes

Built-in repo-native skills live under one of four scope directories:

- `skills/shared` — eligible to be linked into both Claude and Codex via the curated publication layer
- `skills/claude-only` — written directly into Claude's skill directory; not curate-able
- `skills/codex-only` — written directly into Codex's skill directory; not curate-able
- `skills/experimental` — eligible for resolution but excluded from default inclusion

Only `shared` skills can pass through the curated layer at `~/.agents/skills`. Target-specific (`claude-only`, `codex-only`) skills are written directly to their respective downstream paths.

## Where skills come from

`drwn` resolves a skill name against these layers, in this order:

1. **Locked card** — any entry in the project's `card.lock` whose manifest declares the skill in its `skills.include`. Card-bundled skills always win at write time over user-defaults.
2. **Repo-native** — the four scope directories above, in order `shared` → `claude-only` → `codex-only` → `experimental`.
3. **Package-backed bundles** — installed via `drwn library add skill` or `drwn skills packages add`; live under `~/.agents/drwn/skills/<package>/<version>/` with a `current` symlink to the active version.
4. **Missing** — surfaces as a typed write-time hard fail before any downstream mutation.

There is no scope-based promotion between repo-native and bundle sources; first match wins. Cards are the only layer that can shadow other sources at write time.

## The curated publication layer

`~/.agents/skills/<name>` is a symlink farm representing the set of shared skills the user has chosen to expose globally. Membership is exactly the directory's symlink entries — there is no separate JSON state file backing it.

Two mutators manage it:

- `drwn skills curate <name>` — creates the symlink, refusing non-`shared` skills
- `drwn skills uncurate <name>` — removes the symlink

`drwn library defaults add skill <name>` performs both the curation symlink and the machine-defaults write (in `~/.agents/drwn/machine.json` under `defaults.skills`) as a single operation.

## Materialization to downstream tools

`drwn write` (and `drwn write --skills-only`) reads the curated layer plus any project includes and card-bundled skills, resolves each name to a path via the layered resolver, and creates downstream symlinks under `~/.claude/skills`, `~/.codex/skills`, or `<project>/.claude/skills` etc.

Per-write-record cleanup applies: drwn-owned stale symlinks (recorded in the previous write record) are removed when no longer in the effective state; user-owned replacements are preserved and reported as warnings.

## See also

- [Materialization](./materialization) — the write-time pipeline
- [Extensions, bundles, and cards](./extensions-bundles-cards) — the add vs curate vs write trichotomy
- [`reference/cli/skills`](../reference/cli/skills) — command-by-command surface
- [`reference/cli/library`](../reference/cli/library) — the inventory and defaults commands
- `.ai/knowledges/10_drwn-cli-architecture.md` §4 — full architectural reference
