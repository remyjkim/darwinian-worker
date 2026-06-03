---
sidebar_position: 6
---

# Extensions vs Bundles vs Cards

`drwn` exposes three distinct distribution units, and the words for them are not interchangeable. Extensions are named capability families. Skill bundles are npm-distributable skill content. Cards are Git-backed reproducible harness intent. They compose, but each one owns a different problem.

## Extensions

Extensions are named capability families. They bundle together CLI prerequisites, repo-native or derived skills, optional MCP servers, project setup actions, and diagnostics under one user-facing name.

Current extensions:

- `beads` — project-scoped Beads issue tracking (`bd`), with optional `beads-task-tracking` skill
- `parallel` — CLI-backed Parallel skills plus optional Parallel MCP overlay
- `markitdown` — document-to-Markdown conversion through Microsoft's MarkItDown CLI, with guarded `uv` installation

Extensions are inspected, statused, and doctored as a unit:

```bash
drwn extensions list
drwn extensions show parallel
drwn extensions status
drwn extensions doctor beads
```

Selecting an extension for a project writes semantic config under `<project>/.agents/drwn/config.json`. `drwn write` then derives the right skills and MCP entries for that project — no global curation needed:

```bash
drwn extensions add parallel
drwn extensions add parallel --mcp
drwn extensions add beads --include-skill
drwn extensions setup markitdown --install
```

See [reference/cli/extensions](../reference/cli/extensions) for the full command surface.

## Skill Bundles

Skill bundles are npm-distributable skill content. The unit of distribution is an npm package with a `bundle.json` describing the skills inside it. drwn stores installed bundles under:

```text
~/.agents/drwn/skills/<package>/<version>/
~/.agents/drwn/skills/<package>/current   # symlink to active version
```

Typical lifecycle:

```bash
drwn library add skill <npm-package-or-local-path>
drwn library list skills
drwn library show <skill-name>
drwn add skill <skill-name>
drwn write --dry-run
drwn write
```

Update and remove lifecycle commands for bundles are intentionally not part of the first implementation. The supported surface today is add, list, show, inventory, curation, and downstream write.

See [reference/cli/skills](../reference/cli/skills) for skill commands.

## Cards

Cards are Git-backed reproducible harness intent. A card is a versioned bundle that may include skills, MCP server definitions, extension intent, target enablement, and quality-signal metadata. The unit of distribution is a Git repository.

drwn stores cards in three on-disk forms:

```text
~/.agents/drwn/sources/<scope>/<name>/      # editable working tree (authoring)
~/.agents/drwn/cards/<scope>/<name>.git/    # immutable bare repo (publication)
~/.agents/drwn/extracted/<tree-sha>/        # content-addressed extraction cache
```

Cards consumed by a project record their resolution in `<project>/.agents/drwn/card.lock` so the same content reproduces on a clean clone.

See [Cards](./cards) for the lifecycle and [reference/cli/card](../reference/cli/card) for the command surface.

## The add / curate / write Trichotomy

The three verbs do not mean the same thing. Keep them straight:

- **added** — the bundle is available under `~/.agents/drwn/skills`. Adding does not change any downstream tool.
- **curated** — a shared skill is linked into `~/.agents/skills`. This is the machine-level publication layer. Curating does not write to Claude, Codex, or Cursor.
- **written** — the curated skill (or a card-bundled skill, or a repo-native skill) is linked into downstream tool directories such as `~/.claude/skills`. This is the only step that affects what an agent sees.

Each step is a separate command so package installation never silently changes every agent on the machine:

```bash
drwn library add skill <pkg>      # added
drwn skills curate <name>          # curated (shared scope only)
drwn write                         # written
```

Cards short-circuit some of this for project consumption: applying a card writes a lock entry, and the bundled skill content materializes from the card's extracted tree without needing a separate curation step. The card-overlay wins rule (see [Materialization](./materialization)) makes the bundled skill authoritative for that project.

## Cross-References

- [Skills](./skills) for the skill resolution layers
- [Cards](./cards) for the card lifecycle
- [Materialization](./materialization) for how all three reach the filesystem
- [reference/cli/extensions](../reference/cli/extensions), [reference/cli/skills](../reference/cli/skills), [reference/cli/card](../reference/cli/card)
