---
sidebar_position: 6
---

# Credential And Runtime Errors

Credentials and external executable readiness are operator-owned runtime state.
They are not Card, Blueprint, project config, lock, or machine inventory content.

## CLI Login

```bash
drwn whoami --json
drwn login
drwn logout
drwn doctor --json
```

Use `drwn login` only for services authenticated by the CLI. Do not place access
tokens in machine inventory records or project files.

## MCP Secret References

Standalone MCP records store references such as `${GITHUB_TOKEN}`, not resolved
values. Add and inspect records without printing secret-bearing environment
values:

```bash
drwn machine mcp add ./server.json --as server-id --dry-run
drwn machine mcp show server-id --json
drwn machine mcp references server-id --json
```

Provide referenced variables through the operator environment or an external
secret manager. A missing environment value is runtime readiness failure.

## OAuth And External Tools

- Hosted Notion MCP requires OAuth authorization in each downstream client.
- An `ntn` API token belongs in operator environment or secret storage.
- Momentic and other stdio tools must be installed and authenticated separately.
- A closed initialize handshake usually means the executable exited, failed
  authentication, or emitted an invalid MCP response.

Use the downstream client's login flow and invoke the executable directly when
debugging startup. `drwn doctor` can diagnose definitions and projection state;
it cannot authorize OAuth or install third-party binaries.

## Readonly Validation

```bash
DRWN_STORE_READONLY=1 drwn doctor --json
DRWN_STORE_READONLY=1 drwn machine skill list --json
DRWN_STORE_READONLY=1 drwn machine mcp list --json
```

Readonly mode blocks mutations under `~/.agents/drwn`. It does not make an MCP
server authenticated or ready.

## See Also

- [Machine Inventory](../reference/cli/machine)
- [Environment Variables](../reference/env-vars)
- [Run doctor in CI](../guides/doctor-in-ci)
