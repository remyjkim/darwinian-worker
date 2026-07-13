---
sidebar_position: 2
---

# Extension Spec

An Extension is a named capability family contributed to drwn through its in-code registry (`cli/core/extensions/registry.ts`). An extension models a third-party tool — Beads, Parallel, MarkItDown — as a single coherent unit: the commands it needs on PATH, the skills it ships, the MCP servers it declares, and the project-config keys it consumes.

This page defines the producer/consumer contract: what an `ExtensionDefinition` must declare, how project config keys flip extension behavior, and what doctor/status reports promise.

## Definition Shape

Type: `ExtensionDefinition` (`cli/core/extensions/types.ts:27-37`).

```ts
interface ExtensionDefinition {
  id: string;
  displayName: string;
  description: string;
  scopes: ExtensionScope[];          // ("global" | "project")[]
  defaultModes: ExtensionMode[];     // ("cli" | "skills" | "mcp" | "hooks")[]
  commands: ExtensionCommandRequirement[];
  skills: ExtensionSkillReference[];
  mcpServers: ExtensionMcpReference[];
  docs: Array<{ label: string; url: string }>;
}
```

| Field | Meaning |
|---|---|
| `id` | Stable lowercase identifier. Used as the key in project config `extensions.<id>` and CLI subcommands. |
| `displayName` | Human-readable label for status/doctor output. |
| `description` | One-line summary surfaced by `drwn extensions list`. |
| `scopes` | Where the extension is meaningful. `global` = machine-wide; `project` = per-project; both = "mixed" (surfaced as `scope: "mixed"` in `ExtensionStatus`). |
| `defaultModes` | The surface area the extension contributes by default: `cli` (a CLI exists), `skills` (ships repo skills), `mcp` (declares MCP servers), `hooks` (wants harness hooks). |
| `commands` | Required and optional executables the extension expects on PATH. See below. |
| `skills` | Repo-native skill directories the extension ships and their default-included status. |
| `mcpServers` | MCP servers the extension declares for harness wiring. |
| `docs` | Author-curated upstream documentation links. |

### `ExtensionCommandRequirement`

`cli/core/extensions/types.ts:8-13`:

```ts
{ name: string; required: boolean; installHints: string[]; purpose?: "runtime" | "installer" }
```

`required: true` commands gate `available` in status. `installHints` is an ordered list of one-line shell commands that should install the dependency; doctor surfaces them when a required command is missing. `purpose` lets a definition mark a command as the runtime binary versus the installer for it (e.g., `markitdown` runtime + `uv` installer).

### `ExtensionSkillReference`

`cli/core/extensions/types.ts:15-19`:

```ts
{ name: string; source: "repo" | "package"; defaultIncluded: boolean }
```

`defaultIncluded` is descriptive extension metadata used by extension-specific
project setup; it does not activate a machine skill. `source: "repo"` means the
skill ships in the drwn repo; `source: "package"` reserves the surface for
skills shipped by an npm bundle.

### `ExtensionMcpReference`

`cli/core/extensions/types.ts:21-25`:

```ts
{ name: string; defaultEnabled: boolean; scope: "global" | "project" }
```

The `name` matches the key in `CanonicalRegistry.servers`. `scope` declares where the server is wired by default.

## Project Config Shape

When a project wants to configure an extension, it writes a `ProjectExtensionConfig` (`cli/core/types.ts:86-93`) under `extensions.<id>` in `<project>/.agents/drwn/config.json`:

```ts
type ProjectExtensionConfig = {
  enabled?: boolean;
  skills?: boolean;
  mcp?: boolean;
  targets?: string[];
  includeSkill?: boolean;
  [key: string]: unknown;     // escape hatch for per-extension keys
};
```

Application semantics live in `applyProjectExtensionConfig` (`cli/core/extensions/project-config.ts:18-61`). Each registered extension applies these keys differently — the rules below are normative.

### `parallel`

`cli/core/extensions/project-config.ts:25-41`:

- If `parallel.enabled === false`:
  - `config.parallel.cli.enabled = false`
  - `config.parallel.mcp.enabled = false`
  - All parallel skill names are added to the project skill **exclude** set.
- Otherwise (enabled or unset with the block present):
  - `config.parallel.cli.enabled = true`
  - `config.parallel.mcp.enabled = (parallel.mcp === true)` — strictly `true` enables; any other value (including `undefined`) leaves it off.
  - If `parallel.skills === false`, all parallel skill names are added to **exclude**; otherwise added to **include**.

### `beads`

`cli/core/extensions/project-config.ts:43-50`:

- If `beads.enabled === false`: `beads-task-tracking` is added to **exclude**.
- Else if `beads.includeSkill === true`: `beads-task-tracking` is added to **include**.
- Else: no project skill change. The Beads CLI and hooks still surface in status.

### `markitdown`

`cli/core/extensions/project-config.ts:52-60`:

- If `markitdown.enabled === false`: all markitdown skill names are added to **exclude**.
- Otherwise: if `markitdown.skills === false`, added to **exclude**; otherwise added to **include**.

### Escape Hatch

The `[key: string]: unknown` index signature on `ProjectExtensionConfig` lets an extension consume additional semantic keys without changing the global schema. Unknown keys are preserved through reads and writes; only the application logic in `cli/core/extensions/project-config.ts` interprets them.

## Doctor and Status Contracts

Two report shapes carry extension health (`cli/core/extensions/types.ts:39-77`):

### `ExtensionStatus`

Produced by `drwn status` for each extension. Required fields: `id`, `displayName`, `available` (boolean), `scope` (`"global" | "project" | "mixed"`), `commands[]`, `skills[]`, `mcpServers[]`, `warnings[]`. Optional `project` block carries the project's CWD, the discovered config path, whether the extension is configured/enabled in that project, and (for Beads) whether the issue directory exists.

- `commands[].available` is `true` when the binary is on PATH.
- `skills[].present` is `true` when the skill directory exists. The legacy
  `curated` observation reports an ambient compatibility link only; it is not
  machine activation authority.
- `mcpServers[].configured` is `true` when the server is in the effective registry; `active` is `true` when it is enabled.

### `ExtensionDoctorReport`

Produced by `drwn doctor`. Required fields: `id`, `displayName`, `issues[]`, `warnings[]`. `issues` are blocking — a missing required command produces an issue. `warnings` are advisory — optional missing tools, scope mismatches, etc.

A consumer that reads these reports should treat `issues.length === 0` as the green-light condition for the extension.

## Registered Extensions

The full set of registered extensions today (`cli/core/extensions/registry.ts`):

### `beads`

- **Display name** — Beads
- **Description** — Project-scoped issue tracking and agent memory through the `bd` CLI.
- **Scopes** — `project` only.
- **Default modes** — `cli`, `skills`, `hooks`.
- **Commands** — `bd` (required; install hints: `brew install beads`, `npm install -g @beads/bd`, the steveyegge/beads install script). `beads-mcp` (optional; install only if an MCP-only client needs it).
- **Skills** — `beads-task-tracking` (repo, default-excluded).
- **MCP servers** — `beads` (default-disabled, scope `project`).
- **Docs** — Beads docs, IDE setup, MCP guide.

### `parallel`

- **Display name** — Parallel
- **Description** — Web search, extraction, research, and enrichment through Parallel CLI-backed skills.
- **Scopes** — `global`, `project`.
- **Default modes** — `cli`, `skills`.
- **Commands** — `parallel-cli` (required; install hints: `curl -fsSL https://parallel.ai/install.sh | bash`, then `parallel-cli login`).
- **Skills** — `parallel-web-search`, `parallel-web-extract`, `parallel-deep-research`, `parallel-data-enrichment` (all repo, all default-included).
- **MCP servers** — `parallel-search`, `parallel-task` (both default-disabled, scope `global`).
- **Docs** — Parallel developer quickstart, CLI, MCP quickstart.

### `markitdown`

- **Display name** — MarkItDown
- **Description** — Document-to-Markdown conversion through Microsoft's markitdown CLI.
- **Scopes** — `global`, `project`.
- **Default modes** — `cli`, `skills`.
- **Commands** — `markitdown` (required, purpose `runtime`; install hint: `uv tool install --python 3.12 'markitdown[all]'`). `uv` (optional, purpose `installer`; install hints: `brew install uv`, the Astral install script).
- **Skills** — `markitdown-document-conversion` (repo, default-included).
- **MCP servers** — none.
- **Docs** — MarkItDown README, PyPI, uv tools.

## Related

- [Project Config JSON](../schemas/project-config-json) — where `extensions.<id>` blocks live
- [Machine JSON](../schemas/machine-json) — where `defaults.extensions` apply machine-wide
- [Extensions, Bundles, and Cards](../../concepts/extensions-bundles-cards) — how these three composition surfaces relate
- Setup guides: [Beads](../../guides/setup-beads), [Parallel](../../guides/setup-parallel), [MarkItDown](../../guides/setup-markitdown)
