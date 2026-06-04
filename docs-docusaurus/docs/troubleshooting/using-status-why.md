---
sidebar_position: 2
---

# Using `status --why`

`drwn status --why <query>` answers a provenance question: which layer (card, project overlay, machine default, packaged registry, extension registry) is putting this skill, server, extension, target, or card into the effective harness. It is the right command to reach for when something is active and you cannot tell why, or when something is missing and you want to know which layer would normally provide it.

The query is either `kind:name` (typed) or a bare `name` (untyped, ambiguous-resolution allowed).

```bash
drwn status --why skill:<name>
drwn status --why server:<name>
drwn status --why extension:<name>
drwn status --why target:<name>
drwn status --why card:<name>
drwn status --why <name>
```

## Per-Form Output

Each typed form returns a one-line provenance message.

### `--why skill:<name>`

```bash
drwn status --why skill:reviewer
```

Possible answers:

- `skill:reviewer is active or available from card @your-handle/backend@0.2.0.`
- `skill:reviewer is active or available from project config.`
- `skill:reviewer is active or available from machine curation.`
- `skill:reviewer is active or available from repo or installed skill library.`
- `not found: skill:reviewer`

The order reflects resolution precedence at write time: card-bundled skills win over project-config inclusion, which wins over machine-curated skills, which win over baseline inventory.

### `--why server:<name>`

```bash
drwn status --why server:context7
```

Possible answers:

- `server:context7 is active from card @your-handle/backend@0.2.0.`
- `server:context7 is available from project config.`
- `server:context7 is active from registry or machine library.`

`active` means the server is included in the effective `mcpServers` after merging toggles. `available` means it is registered somewhere but currently disabled.

### `--why extension:<name>`

```bash
drwn status --why extension:parallel
```

Possible answers:

- `extension:parallel is known from project config.`
- `extension:parallel is known from extension registry.`

Project-config presence means `<project>/.agents/drwn/config.json` has an `extensions.parallel` block. Extension-registry presence means `drwn` knows the extension type but no project has opted into it.

### `--why target:<name>`

```bash
drwn status --why target:claude
drwn status --why target:codex
drwn status --why target:cursor
```

Answers report enabled/disabled state and which layer is responsible:

- `target:claude is enabled by machine config.`
- `target:cursor is disabled by project config.`

### `--why card:<name>`

```bash
drwn status --why card:@your-handle/backend
```

Returns the locked version and the requested ref:

- `card:@your-handle/backend is locked at 0.2.0 from @your-handle/backend@^0.2.0.`

If the project does not consume the card, returns `not found: card:@your-handle/backend`.

## Disambiguating Untyped Queries

A bare `name` searches every category. If more than one kind matches the same name, `drwn` refuses to guess:

```bash
drwn status --why parallel
```

```text
ambiguous: parallel matched extension:parallel, server:parallel-web-search
```

Re-run with the typed form (`drwn status --why extension:parallel`) to pick the layer you mean.

## Common Workflows

Before a write, when an unexpected item is about to be materialized:

```bash
drwn status
drwn status --why skill:<unexpected-skill>
drwn write --dry-run
```

After `drwn doctor` flags a `projectConfigIssues` entry, trace where the reference is coming from:

```bash
drwn doctor --json
drwn status --why skill:<the-unresolved-name>
```

When a card update changes effective state, compare before and after:

```bash
drwn card outdated
drwn status --why card:@your-handle/backend
drwn card update --dry-run
```

## Cross-References

- [reference/cli/status](../reference/cli/status) for the full command surface
- [Diagnostics Model](../concepts/diagnostics-model) for the `doctor` / `status` split
- [Reading Doctor](./reading-doctor) for the report categories that often prompt a `--why` follow-up
