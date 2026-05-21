# Harness Cards: CLI Surface Design (Midway)

Status: midway design artifact captured during in-progress brainstorming for the Harness Cards feature. The complete design doc — covering the full card lifecycle, schemas, versioning semantics, and migration — will incorporate this plus the other in-progress sections.

Date: 2026-05-18

## Context

Harness Cards introduce a new abstraction: named, versioned, reusable bundles of harness intent that a project can pin to. A card declares which skills, MCP servers, extensions, and downstream targets the project should run on. Cards are immutable once published, stored locally under `~/.agents/bgng/cards/<scope>/<name>/<version>/`, and reference-able from any project's `.agents/bgng/config.json`.

This document is scoped to the **user-facing CLI surface** that this feature introduces. It captures the design decisions that arose specifically around command shape and naming:

- Cards add two new logical surfaces — *authoring* cards and *consuming* cards in a project.
- A project can declare multiple cards (merged in declared order, last-wins on conflict).
- Apply and write are two distinct operations: `apply` mutates project files (manifest + lockfile); `write` propagates intent into the project-local downstream tool directories (`<project>/.claude/`, etc.).
- The existing CLI surface (`bgng init`, `bgng status`, `bgng write`, `bgng doctor`, `bgng skills …`, `bgng mcp …`, `bgng extensions …`, `bgng library …`) keeps working unchanged. Cards are additive.

## Design Philosophy

**Noun-first canonical, verb-first aliases for the daily-driver hot path only.**

Every command is reachable via its noun-namespaced canonical form (`bgng card apply`, `bgng extensions add`, etc.). That's the discoverable, consistent surface — `bgng card --help` lists the entire card vocabulary in one place; same for every namespace.

On top of that, a tiny set of verb-first aliases covers the operations users actually perform daily on the project's card state. The bar for adding to the alias set is high: **the verb must be unambiguous in the project context** (no qualifier needed). `apply` and `update` pass — there is nothing else to apply or update at the project level. `add`/`remove`/`list`/`show` do not pass — they are ambiguous in isolation, so they stay namespaced.

The alias set should never grow past ~3 entries. If it does, we are abusing the affordance.

## Command Tables

### Top-level (verb-first; daily drivers + singletons)

| Command | Status | Purpose |
|---|---|---|
| `bgng init` | existing | Scaffold `<project>/.agents/bgng/config.json` |
| `bgng status` | existing | Overall harness state (machine + project, all layers) |
| `bgng write [--dry-run]` | existing | Materialize state into downstream tools |
| `bgng doctor` | existing | Health checks (extended for cards) |
| `bgng apply <ref>` | **new alias** | Sugar for `bgng card apply <ref>` |
| `bgng update [<name>]` | **new alias** | Sugar for `bgng card update [<name>]` |

### `bgng card` namespace (new)

The canonical surface for everything card-related.

| Canonical | Verb-alias | Purpose |
|---|---|---|
| **Authoring** | | |
| `bgng card new <name>` | — | Scaffold a card source in `~/.agents/bgng/sources/`. Flags: `--from-project`, `--from-card <ref>` |
| `bgng card publish [name]` | — | Snapshot source → immutable version in store |
| `bgng card deprecate <ref> [--reason "…"]` | — | Mark version deprecated; warns on apply/update |
| `bgng card diff <ref-a> <ref-b>` | — | Structural diff with major/minor/patch classification |
| **Consumption (project state)** | | |
| `bgng card apply <ref>…` | `bgng apply` (single ref) | Replace the project's `cards` array |
| `bgng card add <ref>…` | — | Append to the project's `cards` array |
| `bgng card remove <name>…` | — | Remove cards by name |
| `bgng card update [<name>]` | `bgng update` | Re-resolve within existing constraints |
| `bgng card outdated` | — | Read-only: show newer versions available |
| `bgng card detach` | — | Remove all cards from the project (revert to overlay-only) |
| **Inspection** | | |
| `bgng card list [--sources]` | — | List cards in the store |
| `bgng card show <ref>` | — | Detail view of a card version |
| `bgng card status` | — | Project's card lifecycle: manifest + lockfile + materialized state + drift |

### `bgng store` namespace (new)

Small in v1; grows in v2 with sync.

| Command | Status | Purpose |
|---|---|---|
| `bgng store status` | new | Schema version, size, card count, sources count |
| `bgng store migrate` | new | Upgrade store layout when `store.json` schema is behind |
| `bgng store remote add <name> <url>` | v2 | Configure sync remote |
| `bgng store remote remove <name>` | v2 | |
| `bgng store push` | v2 | Sync local store → remote |
| `bgng store pull` | v2 | Sync remote → local store |

### `bgng skills` namespace (existing, unchanged)

| Command | Status |
|---|---|
| `bgng skills list` | existing |
| `bgng skills packages add <pkg>` | existing |
| `bgng skills packages remove <pkg>` | existing |
| `bgng skills show <name>` | existing |

### `bgng mcp` namespace (existing, unchanged)

| Command | Status |
|---|---|
| `bgng mcp list` | existing |
| `bgng mcp write` | existing |
| `bgng mcp show <name>` | existing |

### `bgng extensions` namespace (existing + one new canonical)

| Command | Status | Purpose |
|---|---|---|
| `bgng extensions add <name>` | **new canonical** | Add extension to user library (replaces top-level `bgng add extension`) |
| `bgng extensions setup <name>` | existing | Interactive setup (installs prerequisites, runs init flows) |
| `bgng extensions status [<name>]` | existing | |
| `bgng extensions doctor [<name>]` | existing | |

`add` and `setup` coexist because they serve different needs: `add` is the quick declarative path (record intent in user library), `setup` is the interactive flow that also handles CLI prerequisites and authentication.

### `bgng library` namespace (existing, unchanged)

| Command | Status |
|---|---|
| `bgng library defaults add skill <name>` | existing |
| `bgng library defaults remove skill <name>` | existing |
| `bgng library defaults list` | existing |

### Deprecations

| Old form | New canonical | Deprecation path |
|---|---|---|
| `bgng add extension <name>` | `bgng extensions add <name>` | v1: old form keeps working, emits a deprecation hint on each invocation. v2: removed. |

This is the only deprecation in the design. Everything else is purely additive.

## Side-by-side Daily Flows

### Card author, daily flow

```text
bgng card new @me/backend --from-project
$EDITOR ~/.agents/bgng/sources/@me/backend/card.json
bgng card publish @me/backend
bgng card diff @me/backend@1.0.0 @me/backend@1.1.0
```

### Project owner, daily flow (with aliases)

```text
bgng status                           # singleton verb
bgng apply @me/baseline@^1.0.0        # alias for `bgng card apply ...`
bgng card add @me/extras@^1.0.0       # canonical (no alias; `add` is ambiguous)
bgng update                           # alias for `bgng card update`
bgng write                            # singleton verb
bgng doctor                           # singleton verb
```

### Project owner, daily flow (canonical only)

```text
bgng status
bgng card apply @me/baseline@^1.0.0
bgng card add @me/extras@^1.0.0
bgng card update
bgng write
bgng doctor
```

Both flows produce identical state. The alias form is shorter for the hot path; the canonical form is what appears in docs, help text, and PR review because it is unambiguous in writing.

## Universal Flags

| Flag | Applies to | Meaning |
|---|---|---|
| `--dry-run` | All mutating commands | Preview without writing |
| `--write` | `apply`, `add`, `remove`, `update`, top-level aliases | Chain into `bgng write` after the operation |
| `--json` | All commands with structured output | Machine-readable output |

## Summary — Totals

- **2 new namespaces:** `bgng card`, `bgng store`
- **2 new top-level aliases:** `bgng apply`, `bgng update`
- **1 new command in an existing namespace:** `bgng extensions add`
- **1 deprecation:** `bgng add extension` → `bgng extensions add` (alias preserved through v1)
- **0 commands changed in behavior**

The full existing CLI keeps working unchanged on day one. Cards are an opt-in addition: a user who never types `bgng card …` or `bgng apply …` experiences zero behavior change from this design.

## Open Questions / Deferred Sections

This document is scoped to the CLI surface. The following are deliberately not covered here and will land in the complete Harness Cards design doc:

- Card manifest schema (`card.json` inside a card)
- Project config v2 schema (`<project>/.agents/bgng/config.json` with `cards` field)
- Lockfile schema (`<project>/.agents/bgng/card.lock`)
- Store layout (`~/.agents/bgng/`)
- Versioning semantics: semver classification rules for `bgng card diff`, `update` resolution rules, deprecation surfacing
- Materialization: how `bgng write` produces `<project>/.claude/`, `<project>/.codex/`, `<project>/.cursor/` for card-adopting projects (symlinks into store)
- Migration: existing projects with v1 schemas remain valid; cards opt-in
- Testing strategy

## Related Files

- `cli/commands/` — existing command surface
- `cli/core/extensions/` — extensions registry and project config
- `.ai/knowledges/02_per-project-config-guide.md` — current per-project config model
- `.ai/knowledges/03_npm-skill-bundles-guide.md` — current skill-bundle ingestion model
