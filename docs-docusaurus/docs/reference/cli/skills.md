---
sidebar_position: 7
---

# Skills

`drwn skills` inspects the resolved skill inventory and manages the curated publication layer plus npm-backed skill bundles.

## List

Human-readable:

```bash
drwn skills list
```

JSON:

```bash
drwn skills list --json
```

Reports each skill's name, scope, curation status, whether it is linked into Claude, whether it is linked into Codex, and (in `--json`) source metadata for package-backed entries.

## Curate

Add a `shared` skill to the curated publication layer at `~/.agents/skills`:

```bash
drwn skills curate <name>
```

The curated layer is a symlink farm; curation creates one symlink and does not write into downstream tool directories. Use `drwn write --skills-only` after curating to materialize the new entry.

Only `shared` scope skills can be curated. `claude-only` and `codex-only` skills are written directly to their target-specific directories and bypass the curated layer entirely.

## Uncurate

Remove a skill from the curated layer:

```bash
drwn skills uncurate <name>
```

The next `drwn write` removes drwn-owned downstream symlinks recorded in the previous write record. User-owned replacements (e.g. a hand-edited `~/.claude/skills/<name>` that drwn did not create) are preserved and reported as warnings.

## Package-backed skill bundles

A skill bundle is an npm-distributable package whose `bundle.json` declares one or more skills. Bundles are content sources; they do not curate or write automatically.

Add a bundle:

```bash
drwn skills packages add <packageSpec>
```

`<packageSpec>` accepts any `npm pack`-compatible spec — registry name, `name@version`, local tarball path, or a local directory. Ingestion installs the bundle under `~/.agents/drwn/skills/<package>/<version>/` and points the sibling `current` symlink at the new version.

List installed bundles:

```bash
drwn skills packages list
drwn skills packages list --json
```

Inspect one installed bundle:

```bash
drwn skills packages show <packageName>
drwn skills packages show <packageName> --json
```

Reports the bundle manifest, on-disk path, declared skills, and which skills (if any) are curated or referenced by the active project.

After adding a bundle, expose individual skills with `drwn skills curate <name>` (global) or `drwn add skill <name>` (current project only), then `drwn write --skills-only`.

`drwn skills packages` does not include update or remove lifecycle commands today; to remove a bundle, delete its directory under `~/.agents/drwn/skills/` and re-run `drwn write` to clean orphaned downstream symlinks.

## See also

- [Skills concept](../../concepts/skills) — scope dirs, resolution order, curated layer
- [Extension skill bundles](../../concepts/extensions-bundles-cards) — the add vs curate vs write trichotomy
- [`reference/cli/library`](./library) — `library defaults add skill` is the combined curate + machine-default writer
- [`reference/cli/write`](./write) — materializing curated skills into downstream tools
