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

Selecting an extension for a project writes semantic config under `<project>/.agents/drwn/config.json`. `drwn write` then derives the right skills and MCP entries for that project without changing machine intent:

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
~/.agents/drwn/skills/<package>/current   # regular file containing active version
```

Typical lifecycle:

```bash
drwn machine skill install <npm-package-or-local-path>
drwn machine skill list
drwn machine skill show --package <package-name>
drwn machine skill update <package-name> --from <source>
drwn machine skill uninstall <package-name>
drwn add skill <skill-name>
drwn write --dry-run
drwn write
```

Update and uninstall are package-scoped, disclose exported skill IDs and known
references, and never replace immutable version bytes.

See [Machine Inventory](../reference/cli/machine) for skill commands.

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

## Add, Select, Write

The three verbs do not mean the same thing. Keep them straight:

- **added** — the bundle is available under `~/.agents/drwn/skills`. Adding does not change any downstream tool.
- **selected** — machine or project intent names an available skill. Selection does not write to Claude, Codex, or Cursor.
- **written** — selected skill bytes are copied into ownership-recorded downstream directories. This is the only step that affects what an agent sees.

Each step is a separate command so package installation never silently changes every agent on the machine:

```bash
drwn machine skill install <pkg>              # available
drwn machine skill enable <name>    # machine-selected
drwn write --scope machine                # written to user-home targets
```

Cards declare project capability content directly. The selected Worker closure and explicit project overlays determine project selection; Card-bundled content is authoritative for that project.

## Cross-References

- [Skills](./skills) for the skill resolution layers
- [Cards](./cards) for the card lifecycle
- [Materialization](./materialization) for how all three reach the filesystem
- [reference/cli/extensions](../reference/cli/extensions), [reference/cli/machine](../reference/cli/machine), [reference/cli/card](../reference/cli/card)
