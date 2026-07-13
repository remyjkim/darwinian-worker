---
sidebar_position: 1
---

# Machine JSON

On disk: `~/.agents/drwn/machine.json`.

Purpose: the first supported machine-scope policy and capability contract. The
file is strict, namespaced, and independent from project Worker declarations.

## Schema

```json
{
  "schema": "drwn.machine",
  "schemaVersion": 1,
  "policy": {
    "authoring": { "scope": "@your-handle" },
    "targets": {
      "claude": { "enabled": true },
      "codex": { "enabled": true },
      "cursor": { "enabled": false }
    }
  },
  "capabilities": {
    "profile": null,
    "skills": [],
    "mcpServers": []
  }
}
```

Every object rejects unknown fields. The only supported schema version is `1`.
Prototype files are rejected with `MACHINE_CONFIG_INVALID`; they are never
migrated, rewritten, or interpreted.

## Fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `schema` | `"drwn.machine"` | yes | Namespaced contract identity. |
| `schemaVersion` | `1` | yes | First supported local machine schema. |
| `policy.authoring.scope` | `string` | no | Default scope for unscoped `drwn card new` names. |
| `policy.targets` | partial target map | no | Approved target policy overrides. |
| `policy.catalogs` | catalog policy | no | npm skill and MCP catalog policy. |
| `policy.analyzer` | analyzer policy | no | Session analyzer endpoints and limits. |
| `policy.trustedSources` | trust policy | no | Trusted Git/catalog source policy. |
| `capabilities.profile` | immutable profile pin or `null` | yes | One approved machine capability profile. |
| `capabilities.skills` | unique `string[]` | yes | Explicit machine skill IDs. |
| `capabilities.mcpServers` | unique `string[]` | yes | Explicit machine MCP IDs. |

Capabilities never alter policy. Policy never activates capabilities.

## Recommended Profile

Guided setup offers **Recommended Darwinian Operator** as an opt-out default.
Its pin identifies `@darwinian/operator@1.0.2` at the exact Git tag, commit,
tree SHA, and content integrity. The approved projection is 17 machine-safe
skills and zero MCP servers.

The profile is not a Worker. It contributes no instructions, hooks,
permissions, governance, identity, or project state. Runtime reads its pinned
extracted bytes offline and fails on missing or changed content.

## Activation And Mutation

Effective machine capabilities are exactly:

```text
approved subset of the selected immutable profile
+ capabilities.skills
+ capabilities.mcpServers
```

Use the supported mutators:

```bash
drwn library defaults list
drwn library defaults add skill <skill-id>
drwn library defaults remove skill <skill-id>
drwn library defaults add mcp <server-id>
drwn library defaults remove mcp <server-id>
```

These commands edit machine intent only. Run `drwn write --scope machine` to
project it. Library availability, packaged optional flags, Parallel flags,
ambient directories, and existing downstream files do not activate anything.

## Initialization

- `drwn init --non-interactive` and `--minimal` create explicit empty intent.
- Guided `drwn init` offers the Recommended profile as `[Y/n]`.
- Declining writes empty intent.
- Existing valid intent is never reset or re-prompted.

## Project Boundary

Project evaluation does not read machine capability selections. A project uses
one selected Worker closure plus explicit project overlays. User-home output may
remain ambient in the downstream client, but status reports it separately and
never imports it into project intent.

## Related

- [Project Config JSON](./project-config-json)
- [Write Record JSON](./write-record-json)
- [Local Store](../../concepts/local-store)
