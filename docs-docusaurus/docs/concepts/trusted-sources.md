---
sidebar_position: 15
---

# Trusted Sources

`drwn` evaluates card refs against a **trusted sources policy** before fetching or cloning. The policy prevents cards from being silently installed from unrecognised Git hosts, unknown owners, or catalog scopes outside your team's control.

## `TrustedSourcesPolicy`

Declared in `.agents/drwn/config.json` under `trustedSources`:

```json
{
  "version": 1,
  "cards": ["@your-org/backend@^1.0.0"],
  "trustedSources": {
    "strict": false,
    "gitHosts": ["github.com", "gitlab.internal.example.com"],
    "gitOwners": ["your-org", "your-handle"],
    "catalogScopes": ["@your-org"],
    "refs": ["git+https://github.com/your-org/locked-card.git#abc123"]
  }
}
```

## Fields

| Field | Type | Effect |
|---|---|---|
| `strict` | `boolean` | When `true`, only refs that satisfy at least one of the other fields are permitted. When `false` (default), the policy is advisory and `drwn` warns on violations without blocking. |
| `gitHosts` | `string[]` | Hostname allowlist for `git+https://`, `git+ssh://`, and `github:`/`gitlab:` refs. |
| `gitOwners` | `string[]` | GitHub/GitLab owner (org or user) allowlist. `"your-org"` permits `github:your-org/*`. |
| `catalogScopes` | `string[]` | NPM-style scope allowlist. `"@your-org"` permits any `@your-org/...` catalog ref. |
| `refs` | `string[]` | Exact ref allowlist. Any ref matching a string in this list is permitted regardless of other fields. |

## Strict mode

Set `strict: true` to block card resolution for any ref that does not satisfy at least one allowlist field. This is the recommended posture for team or CI environments.

```json
{
  "trustedSources": {
    "strict": true,
    "gitOwners": ["your-org"],
    "catalogScopes": ["@your-org"]
  }
}
```

## `DRWN_TRUSTED_SOURCES_STRICT` environment variable

Set this to `"1"` or `"true"` to activate strict mode from the environment, regardless of the project config value:

```bash
export DRWN_TRUSTED_SOURCES_STRICT=1
drwn install
```

Useful in CI when the project config is not under your control.

## Bypassing the policy

Pass `--allow-untrusted-source` to commands that resolve card refs to override the policy for that invocation:

```bash
drwn card clone git+https://github.com/external/card.git#v1.0.0 --allow-untrusted-source
drwn catalog validate ./catalog.json --deep --allow-untrusted-source
```

A warning is emitted when this flag is used.

## Policy inheritance

`trustedSources` can be set in either machine config (`machine.json`) or project config (`config.json`). The project config value takes precedence. `DRWN_TRUSTED_SOURCES_STRICT` takes precedence over both.

## See also

- [Project Config JSON](../reference/schemas/project-config-json) — where `trustedSources` is declared
- [Environment Variables](../reference/env-vars) — `DRWN_TRUSTED_SOURCES_STRICT`
- [`drwn card clone`](../reference/cli/card#clone) — cloning with trust bypass
