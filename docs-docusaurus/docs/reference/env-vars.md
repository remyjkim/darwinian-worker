---
sidebar_position: 1
---

# Environment Variables

`drwn` reads the following environment variables. All are optional; documented defaults apply when unset.

## Store and paths

### `AGENTS_HOME_DIR`

Overrides the directory used as the home root for the local store. When unset, `drwn` uses `HOME`, `USERPROFILE`, or `os.homedir()` in that order.

The store lives at `$AGENTS_HOME_DIR/.agents/drwn/` (or `~/.agents/drwn/` by default).

```bash
export AGENTS_HOME_DIR=/mnt/shared-home
drwn status
```

### `AGENTS_REPO_ROOT`

Points `drwn` at a local checkout of `darwinian-minds` as the harness source, instead of the bundled package defaults. Used when developing the CLI or maintaining a fork.

```bash
export AGENTS_REPO_ROOT=/path/to/darwinian-minds
drwn status
```

### `DRWN_STORE_READONLY`

Set to `"1"` or `"true"` to refuse any store mutation. Inspection and dry-run commands (`drwn doctor`, `drwn status`, `drwn write --dry-run`) still work; write operations that would mutate the store exit with an error.

Intended for CI environments where the store should be pre-seeded and not modified:

```bash
export DRWN_STORE_READONLY=1
drwn doctor --json
```

### `DRWN_STORE_SEED_PATH`

Path to a pre-seeded credential archive. When set, `drwn` initializes the credential store from this file before any store operations. Useful for supply-chain-safe CI setups where credentials are injected as a secret file.

## Network and concurrency

### `DRWN_FETCH_CONCURRENCY`

Maximum number of concurrent card fetch operations. Defaults to `4`. Values that are not positive integers are ignored and the default applies.

```bash
export DRWN_FETCH_CONCURRENCY=8
drwn install
```

### `DRWN_GIT_TIMEOUT_MS`

Timeout in milliseconds for individual Git operations (clone, fetch, push). Defaults to `30000` (30 seconds). Increase for slow networks or large repositories.

```bash
export DRWN_GIT_TIMEOUT_MS=120000
drwn install
```

## Trust and security

### `DRWN_TRUSTED_SOURCES_STRICT`

Set to `"1"` or `"true"` to activate strict trusted-sources enforcement, regardless of the `trustedSources.strict` value in project or machine config. Any card ref that does not satisfy the allowlist fields will be rejected.

```bash
export DRWN_TRUSTED_SOURCES_STRICT=1
drwn install
```

See [Trusted Sources](../concepts/trusted-sources) for the full policy model.

## See also

- [Trusted Sources](../concepts/trusted-sources) — `DRWN_TRUSTED_SOURCES_STRICT` policy model
- [Run drwn doctor in CI](../guides/doctor-in-ci) — `DRWN_STORE_READONLY` in CI
- [Project Config JSON](../reference/schemas/project-config-json) — project-level config
