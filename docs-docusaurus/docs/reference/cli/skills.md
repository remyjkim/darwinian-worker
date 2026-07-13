---
sidebar_position: 7
---

# Skills

`drwn skills` inspects the resolved skill inventory and manages npm-backed skill bundles. Explicit machine selection is handled by `drwn library defaults`; project selection is handled by `drwn add skill`.

## List

Human-readable:

```bash
drwn skills list
```

JSON:

```bash
drwn skills list --json
```

Reports each skill's name, scope, downstream visibility, and (in `--json`) source metadata for package-backed entries.

## Select For Machine Scope

Select an available skill as explicit machine intent:

```bash
drwn library defaults add skill <name>
drwn write --scope machine --skills-only --dry-run
drwn write --scope machine --skills-only
```

Selection edits `~/.agents/drwn/machine.json` only. Projection is a separate write step. Existing target files and ambient compatibility directories never activate a skill.

Remove the explicit selection with `drwn library defaults remove skill <name>`. The next machine write removes only unchanged prior-owned output.

## Select For A Project

Declare an available skill in the current project:

```bash
drwn add skill <name>
drwn write --dry-run
drwn write
```

Project declarations remain independent from machine selections.

## Package-backed skill bundles

A skill bundle is an npm-distributable package whose `bundle.json` declares one or more skills. Bundles are content sources; they do not select or write automatically.

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

Reports the bundle manifest, on-disk path, declared skills, and project references.

After adding a bundle, select individual skills with `drwn library defaults add skill <name>` (machine) or `drwn add skill <name>` (current project), then run the corresponding write.

`drwn skills packages` does not include update or remove lifecycle commands today; to remove a bundle, delete its directory under `~/.agents/drwn/skills/` and re-run `drwn write` to clean orphaned downstream symlinks.

## See also

- [Skills concept](../../concepts/skills) — scope dirs, resolution order, and explicit selection
- [Extension skill bundles](../../concepts/extensions-bundles-cards) — the add vs select vs write model
- [`reference/cli/library`](./library) — reusable inventory and machine selections
- [`reference/cli/write`](./write) — projecting selected skills into downstream tools
