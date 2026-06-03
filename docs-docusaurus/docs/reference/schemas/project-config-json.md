---
sidebar_position: 2
---

# Project Config JSON

On disk: `<project>/.agents/drwn/config.json`. Discovered by walking up from the working directory until `.agents/drwn/config.json` is found (`findProjectConfig`, `cli/core/project.ts:20-35`).

Purpose: the project-scope overlay. Declares the cards a project consumes, per-server overrides, skill include/exclude, per-extension config, and per-target enablement. When this file is present, project state is the authoritative overlay; machine `defaults` are suppressed and the project explicitly declares what it wants.

## Type

`ProjectConfig` (`cli/core/types.ts:95-105`).

## Example

```json
{
  "version": 1,
  "cards": [
    "@me/backend@^1.0.0",
    "file:./vendor/local-card",
    "git+https://github.com/example/team-card.git#v2.1.0",
    "github:example/team-card@^2.0.0"
  ],
  "servers": {
    "context7": { "enabled": true },
    "filesystem": { "enabled": false },
    "custom-search": {
      "description": "Internal search MCP",
      "transport": "http",
      "url": "https://mcp.example.internal/search",
      "optional": false
    }
  },
  "skills": {
    "include": ["reviewer", "release-notes"],
    "exclude": ["legacy-skill"]
  },
  "extensions": {
    "parallel":   { "enabled": true,  "skills": true,  "mcp": false },
    "beads":      { "enabled": true,  "includeSkill": true },
    "markitdown": { "enabled": false }
  },
  "targets": {
    "claude": { "enabled": true },
    "codex":  { "enabled": false }
  }
}
```

## Fields

| Field | Type | Required | Meaning | Enforced at |
|---|---|---|---|---|
| `version` | `number` (must be `1`) | yes | Schema gate. Anything else throws. | `loadProjectConfig`, `cli/core/project.ts:43-46` |
| `cards` | `string[]` | no | Ordered card refs the project consumes. See [Card Spec](../specs/card-spec) for ref grammar. | Type: `cli/core/types.ts:97`; resolution: `card-store.ts:682-709` |
| `servers` | `Record<string, ServerOverride>` | no | Per-server overrides. Each value is either a toggle (`{ "enabled": boolean }`) or a full `RegistryServer` that adds/replaces the entry. | `mergeProjectConfig`, `project.ts:58-70`; toggle detection at `project.ts:16-18` |
| `skills.include` | `string[]` | no | Skill names to force-enable on top of cards and machine defaults. | `mergeProjectSkillOverrides`, `extensions/project-config.ts:63-67` |
| `skills.exclude` | `string[]` | no | Skill names to suppress. | `mergeProjectSkillOverrides`, `extensions/project-config.ts:63-67` |
| `extensions` | `Record<string, ProjectExtensionConfig>` | no | Per-extension config. See shape below. | `applyProjectExtensionConfig`, `extensions/project-config.ts:18-61` |
| `targets` | `Partial<Record<TargetName, { enabled: boolean }>>` | no | Per-target enabled override applied to the merged `targets` map. Only `claude`, `codex`, `cursor`. | `mergeProjectConfig`, `project.ts:72-76` |

### `ServerOverride`

Union of two shapes (`cli/core/types.ts:82-84`):

- **Toggle**: `{ "enabled": boolean }` — updates the effective `optional[name]` and either restores or removes the registry entry. Detected by `isServerToggle` (`project.ts:16-18`: absence of a `transport` key).
- **Full server**: any `RegistryServer` (`cli/core/types.ts:7-19`) — adds or replaces the entry verbatim in the effective registry.

### `ProjectExtensionConfig`

```ts
type ProjectExtensionConfig = {
  enabled?: boolean;
  skills?: boolean;
  mcp?: boolean;
  targets?: string[];
  includeSkill?: boolean;
  [key: string]: unknown;
};
```

(`cli/core/types.ts:86-93`)

The `[key: string]: unknown` index signature is an intentional escape hatch: extensions may declare additional semantic keys without changing the schema. Application semantics per extension live in `cli/core/extensions/project-config.ts:18-61`; see [Extension Spec](../specs/extension-spec).

## Interaction with Machine Defaults

When a project config exists, the effective state is computed as follows:

1. Start from the packaged repo config.
2. Apply `mergeMachineConfig` to layer in machine.json fields (`user-config.ts:77-100`).
3. Apply `mergeProjectConfig` (`project.ts:49-92`) to overlay project-declared cards, server overrides, skill include/exclude, extension config, and target toggles.

Machine `defaults.skills`/`defaults.mcpServers` are not silently appended onto project state — the project's explicit skill and server lists are authoritative for what the project wants. The project may include them by listing them itself.

## Scaffolding

`scaffoldProjectConfig` (`cli/core/project.ts:94-106`) creates the file with the minimum body `{ "version": 1 }\n`. All other fields are optional and added on demand.

## Related

- [Machine JSON](./machine-json) — the machine-scope config
- [Card Manifest](./card-manifest) — what a card contributes to project state
- [Card Spec](../specs/card-spec) — card ref grammar used in `cards[]`
- [Extension Spec](../specs/extension-spec) — semantics for the `extensions` map
