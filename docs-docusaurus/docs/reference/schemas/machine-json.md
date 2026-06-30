---
sidebar_position: 1
---

# Machine JSON

On disk: `~/.agents/drwn/machine.json` (resolved by `resolveMachineConfigPath`, `cli/core/store-paths.ts`).

Purpose: the machine-scope drwn configuration. Holds target enablement, machine-wide defaults (skills, MCP servers, extension config), catalog toggles, parallel-extension state, and an authoring scope used by `drwn card new`. Merged on top of the packaged repo config when an effective config is built (`mergeMachineConfig`, `cli/core/user-config.ts:77-100`).

## Type

`MachineConfig = CanonicalConfig & { authoring?: { scope?: string } }` (`cli/core/types.ts:76-80`).

`CanonicalConfig` (`cli/core/types.ts:39-69`) supplies every field except `authoring`.

## Example

```json
{
  "version": 1,
  "targets": {
    "claude": { "enabled": true,  "configPath": "~/.claude/settings.json",        "format": "json-merge",      "mcpKey": "mcpServers" },
    "codex":  { "enabled": true,  "configPath": "~/.codex/config.toml",           "format": "toml-merge",      "mcpKey": "mcp_servers" },
    "cursor": { "enabled": false, "configPath": "~/.cursor/mcp.json",             "format": "json-standalone", "mcpKey": "mcpServers" }
  },
  "defaults": {
    "skills": ["parallel-web-search", "markitdown-document-conversion"],
    "mcpServers": ["context7"],
    "extensions": {
      "parallel": { "enabled": true, "skills": true, "mcp": false }
    }
  },
  "catalogs": {
    "npmSkills": { "enabled": true, "searchLimit": 25 },
    "mcp":       { "enabled": true, "sources": [{ "type": "url", "url": "https://example.com/mcp.json" }] }
  },
  "parallel": {
    "cli": { "enabled": true },
    "mcp": { "enabled": false }
  },
  "optional": {
    "context7": true
  },
  "authoring": {
    "scope": "@your-handle"
  }
}
```

## Fields

| Field | Type | Required | Meaning | Enforced at |
|---|---|---|---|---|
| `version` | `number` (must be `1`) | yes | Schema version. Anything else throws on load. | `loadUserConfig`, `cli/core/user-config.ts:25-28` |
| `targets` | `Record<TargetName, TargetConfig>` | yes | Per-target config: `enabled`, `configPath`, `format` (`json-merge`/`toml-merge`/`json-standalone`), `mcpKey`. | `cli/core/types.ts:31-37`; merged via `mergeMachineConfig`, `user-config.ts:79-82` |
| `defaults.skills` | `string[]` | no | Curated skill names enabled by default. Seeded from the curated bundle on first init. | Read by `loadEffectiveConfig`; seeded in `initializeUserConfigFromPackagedDefaults`, `user-config.ts:36-50` |
| `defaults.mcpServers` | `string[]` | no | MCP server names enabled by default. Seeded by `resolveDefaultMcpNames`. | `user-config.ts:36-50` |
| `defaults.extensions` | `Record<string, ProjectExtensionConfig>` | no | Default extension settings (parallel/beads/markitdown) applied machine-wide. | `cli/core/types.ts:42-46` |
| `catalogs.npmSkills.enabled` | `boolean` | no | Toggles npm skill catalog search. | `cli/core/types.ts:48-51` |
| `catalogs.npmSkills.searchLimit` | `number` | no | Max results returned by catalog search. | `cli/core/types.ts:48-51` |
| `catalogs.mcp.enabled` | `boolean` | no | Toggles the MCP catalog. | `cli/core/types.ts:52-58` |
| `catalogs.mcp.sources` | `Array<{ type: "file"; path } \| { type: "url"; url }>` | no | Extra catalog sources merged into the default catalog. | `cli/core/types.ts:52-58` |
| `parallel.cli.enabled` | `boolean` | no | Whether the Parallel CLI surface is enabled at the machine level. | `cli/core/types.ts:60-67` |
| `parallel.mcp.enabled` | `boolean` | no | Whether the Parallel MCP servers are enabled at the machine level. | `cli/core/types.ts:60-67` |
| `optional` | `Record<string, boolean>` | yes | Per-name optional toggles. The map exists even when empty so consumers can write into it. | `cli/core/types.ts:68` |
| `authoring.scope` | `string` (`@scope` shape) | no | Default npm-style scope applied to `drwn card new` when the supplied name is unscoped. | Read at `card-store.ts:231-233`; written at `card-store.ts:236-240` |

For `defaults.skills` and `defaults.mcpServers`, any array — including an empty array (`[]`) — is treated as an explicit machine override; an empty array activates nothing. Only a missing field means "uninitialized": reads fall back to the resolved defaults, and `drwn library defaults add|remove ...` seeds the list with the currently resolved defaults before applying the mutation. An explicit empty array is preserved as-is.

## How it gets there

- **Initial creation** — `ensureStoreInitialized` writes `{ "version": 1, "optional": {} }` when no machine.json exists (`cli/core/card-store.ts:103-106`).
- **First-run seeding** — `initializeUserConfigFromPackagedDefaults` (`cli/core/user-config.ts:36-50`) populates `defaults.skills`, `defaults.mcpServers`, and `defaults.extensions` from the packaged repo config and curated skill list.
- **Mutators**
  - `drwn library defaults add|remove skill|mcp` rewrites `defaults.skills` / `defaults.mcpServers` (`cli/commands/library/defaults/*.ts`).
  - `drwn card new --scope @your-handle` persists `authoring.scope` (`cli/commands/card/new.ts`; persistence at `card-store.ts:236-240`).
- **Reads** — `loadOrInitializeUserConfig` and `loadEffectiveConfig` (`user-config.ts:52-75`) pull the file when present and merge it onto the packaged repo config.

## Notes

- When a project config is discovered, machine `defaults` are not silently applied on top of project state; project config is the authoritative overlay. See [Project Config JSON](./project-config-json).
- `optional` is the single source of truth for per-server enabled state at the machine layer; project `servers` toggles modify the effective version, not this file.

## Related

- [Project Config JSON](./project-config-json) — the project-scope overlay
- [Write Record JSON](./write-record-json) — machine-scope write record at `~/.agents/drwn/global-write-record.json`
- [Local Store](../../concepts/local-store) — store layout that includes machine.json
