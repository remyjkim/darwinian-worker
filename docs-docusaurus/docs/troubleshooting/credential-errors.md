---
sidebar_position: 6
---

# Credential Errors

`drwn` uses a local secret store for credentials (login tokens, catalog auth). The store is encrypted at rest using AES-256-GCM. The encryption key is protected by the platform's native secret management:

- **macOS:** macOS Keychain
- **Linux:** `secret-tool` (libsecret / GNOME keyring)
- **Windows (partial):** DPAPI — native Windows support is in development; use WSL2 in the meantime.

## Diagnosing store errors

```bash
drwn store verify
drwn store verify --json
```

`drwn store verify` checks store integrity and exits non-zero on failure. JSON output includes a `reason` field.

```bash
drwn doctor --json | jq '.platformChecks'
```

`platformChecks` includes a check for whether `node` is on `PATH` (required for MCP servers) and whether the home directory resolves correctly. Other platform blockers appear here as `ok: false` entries.

## Common errors

### Keychain unavailable (Linux headless)

On headless Linux (CI, containers), `secret-tool` may not be installed or a D-Bus session may be absent.

**Resolution:** Use the seed-path workflow to supply credentials without a live keychain:

```bash
export DRWN_STORE_SEED_PATH=/run/secrets/drwn-credentials
drwn store verify
```

`DRWN_STORE_SEED_PATH` points to a pre-seeded credential archive. The archive is typically injected as a CI secret file.

### Store corrupt or schema mismatch

```bash
drwn store verify --json
```

If `ok` is `false` and `reason` contains "schema mismatch" or "corrupt", run the migration command:

```bash
drwn store migrate
drwn store verify
```

### Credentials not persisting between sessions

If `drwn whoami` shows logged-out after each terminal session, the platform keychain is not persisting the encryption key. On macOS, this usually means the Keychain item was not allowed to persist across login sessions.

**Resolution:** Re-run `drwn login` and when macOS prompts for keychain access, select "Always Allow".

### `secret-tool` not found (Linux)

Install the `libsecret-tools` package:

```bash
# Ubuntu / Debian
sudo apt-get install libsecret-tools

# Fedora
sudo dnf install libsecret
```

Then verify:

```bash
drwn store verify
```

## Store readonly mode

If you only need to read from the store in CI:

```bash
export DRWN_STORE_READONLY=1
drwn store verify
```

With `DRWN_STORE_READONLY=1`, writes to the store fail immediately; reads and verification succeed. See [Run drwn doctor in CI](../guides/doctor-in-ci) for the full CI setup.

## See also

- [`drwn store`](../reference/cli/store) — store command reference
- [Environment Variables](../reference/env-vars) — `DRWN_STORE_SEED_PATH`, `DRWN_STORE_READONLY`
- [Run drwn doctor in CI](../guides/doctor-in-ci) — CI credential strategy
