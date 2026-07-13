---
sidebar_position: 4
---

# Set Up MarkItDown

This guide enables MarkItDown for a single project. MarkItDown is CLI+skills
first: `drwn` writes semantic project config, then `drwn write` derives the
`markitdown-document-conversion` skill for that project.

## Preview Setup

From the project root:

```bash
drwn extensions setup markitdown --dry-run
```

The dry run reports what config would be written and whether the `markitdown`
CLI is already on PATH.

## Run Interactive Setup

```bash
drwn extensions setup markitdown
```

When `markitdown` is missing, interactive setup prompts once before installing
it. Accept the prompt to install; decline to record the project config without
installing.

## Run Script-Friendly Setup

Scripts and CI must pick a side:

```bash
drwn extensions setup markitdown --install
drwn extensions setup markitdown --no-install
```

`--install` runs the guarded install command. `--no-install` records the
project config and leaves the CLI alone.

## Install Command

The guarded install path is:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

If the command installs but is not on PATH, refresh shell integration and
restart your shell:

```bash
uv tool update-shell
```

## Verify

```bash
drwn extensions status markitdown
drwn extensions doctor markitdown
drwn write --dry-run
drwn write
```

`drwn write` derives `markitdown-document-conversion` for the project without
requiring a machine skill selection.

## See Also

- [Extensions CLI reference](../reference/cli/extensions)
