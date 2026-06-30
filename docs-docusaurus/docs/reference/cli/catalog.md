---
sidebar_position: 21
---

# Catalog

`drwn catalog` validates catalog manifests before publishing or CI checks.

## `drwn catalog validate`

Validates a `catalog.json` file against the shared upstream schema.

```bash
# Validate a local file
drwn catalog validate ./catalog.json

# Validate a remote catalog repo (clones a bare copy and reads catalog.json)
drwn catalog validate https://github.com/owner/catalog-repo
drwn catalog validate github:owner/catalog-repo

# Deep validation — resolves each card ref and verifies entry consistency
drwn catalog validate ./catalog.json --deep

# Deep validation bypassing the trusted-sources policy
drwn catalog validate ./catalog.json --deep --allow-untrusted-source

# Machine-readable output
drwn catalog validate ./catalog.json --json
```

**Flags**

| Flag | Description |
|---|---|
| `--deep` | Resolve each card URL in the catalog and verify that the resolved card name matches the catalog entry. Requires network access; clones cards into a temporary directory. |
| `--allow-untrusted-source` | Resolve card refs even when `trustedSources.strict` would reject them. Emits a warning. |
| `--json` | Emit machine-readable JSON output. |

**Exit codes**

| Code | Meaning |
|---|---|
| `0` | Catalog is valid. |
| `1` | Validation failed. Errors are written to stderr (or to stdout with `--json`). |

**JSON output**

On success:
```json
{ "ok": true, "cardCount": 5 }
```

On failure:
```json
{ "ok": false, "errors": ["catalog: entry foo has mismatched name"] }
```

**Remote target formats**

`drwn catalog validate` accepts any of these as the `<target>` argument:

- A local file path: `./catalog.json`
- A GitHub URL: `https://github.com/owner/repo`
- A `github:owner/repo` ref
- A `git+<url>` ref
- Any `https://`, `http://`, `ssh://`, or `git@` Git URL

When the target is a remote URL, `drwn` performs a shallow bare clone into a temp directory and reads `HEAD:catalog.json`.

## See also

- [`drwn library catalog`](./library) — adding and refreshing catalog registrations
- [`drwn card catalog publish`](./card) — publishing a card entry into a catalog
- [Trusted Sources](../../concepts/trusted-sources) — how `trustedSources.strict` interacts with `--allow-untrusted-source`
