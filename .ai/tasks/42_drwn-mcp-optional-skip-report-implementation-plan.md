# Task 42: Card-Declared Optional MCP Activation And Reporting

**Status**: Completed
**Created**: 2026-06-11
**Updated**: 2026-06-24
**Completion**: `.ai/tasks/42_completion_drwn-mcp-optional-activation-report.md`
**Priority**: Medium (UX trap; discoverability bug, not data loss)
**Dependencies**: None (works against current `main`)
**References**: [GitHub issue remyjkim/darwinian-harness#10, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/13_library-defaults-config-target-architecture.md, knowledges/10_drwn-cli-architecture.md, cli/core/mcp.ts, cli/core/effective-state.ts, cli/core/card-project.ts, cli/core/project.ts, cli/core/output.ts, cli/core/sync.ts, cli/commands/write.ts, cli/commands/add/mcp.ts, cli/commands/card/add.ts, cli/commands/card/apply.ts, cli/commands/card/project-command.ts, registry/mcp-servers.json, registry/config.json, test/commands-write.test.ts, test/commands-card-consumer.test.ts]

---

## Objective

Make card-declared optional MCP activation explainable and valid.

Today, when a user installs a card whose manifest declares an optional MCP server (`servers.<name>.optional: true`), `drwn` can filter that server out of the active MCP set without saying anything. The user sees a successful `drwn card add/apply --write` or `drwn write`, but an expected MCP-backed capability is absent from the rendered Claude/Codex/Cursor configuration. The only way to diagnose the gap is to manually compare the card manifest or `card.lock` with the generated MCP config.

The original version of this task treated the problem as pure reporting. That is insufficient. Card-local optional MCP definitions are not always reusable registry/library MCPs. A report that says `enable with drwn add mcp <name>` is only honest if `drwn add mcp <name>` can actually activate a card-declared optional MCP in the current project.

Goal state:

- `drwn write`, `drwn write --dry-run`, `drwn card add --write`, and `drwn card apply --write` report card-declared optional MCPs as active, skipped, or shadowed.
- `drwn write --json` exposes the same information as `optionalMcpReport`.
- `drwn add mcp <name>` can enable an optional MCP declared by a locked card in the current project, even when that MCP definition is not in the reusable MCP library.
- Optional MCP filtering policy stays intact: card-declared optional MCPs remain opt-in.

## Target Architecture References

There is no single dedicated target-architecture document for this exact Task 42 edge. The closest architectural parents are:

- `.ai/analyses/29_harness-cards-target-architecture-v1_1.md` section 5.2.1, which states that MCP server definitions resolve through card-inline, user library, and packaged baseline layers, while project `servers.<name> = { enabled: boolean }` toggles an existing server and full definitions add project-local servers.
- `.ai/analyses/13_library-defaults-config-target-architecture.md` "MCP Resolution", which separates MCP definitions from activation defaults and project overrides.
- `.ai/knowledges/10_drwn-cli-architecture.md` section 2.3, which documents the current implementation and the overloaded `ProjectConfig.servers` behavior that this task must refine for card-declared definitions.

This task plan is the narrow execution source of truth for applying those architecture principles to card-declared optional MCPs and the write-time report.

## Current Behavior

Relevant current mechanics:

- `mergeCardManifestsIntoProjectConfig()` copies card manifest `servers` into the derived project config (`cli/core/card-project.ts`).
- `mergeProjectConfig()` then interprets each `project.servers` entry as either a toggle (`{ enabled: boolean }`) or a full `RegistryServer` (`cli/core/project.ts`).
- `buildActiveServers()` includes optional servers only when `config.optional[name] === true`, unless explicit defaults are used (`cli/core/mcp.ts`).
- `drwn add mcp` is project-first, but it currently searches reusable library/catalog MCP definitions, not the current project's locked card manifests (`cli/commands/add/mcp.ts`).

The architecture bug is the collapsed layer: card-declared MCP definitions are merged into the same `ProjectConfig.servers` map that later receives activation toggles. If a card declares a custom optional MCP named `custom`, then the project writes:

```json
{
  "servers": {
    "custom": { "enabled": true }
  }
}
```

that toggle can shadow the full card definition. If `custom` is not in the base registry or user MCP library, the effective registry may no longer have a definition to activate.

## Target State

Separate MCP definition sources from activation policy.

Definition layers:

1. Packaged base registry (`registry/mcp-servers.json`).
2. User MCP library (`~/.agents/drwn/mcp-servers/<id>.json`).
3. Card-declared MCP definitions from locked card manifests.
4. Project-local full MCP definitions.

Activation layers:

1. Machine defaults / optional map.
2. Project `servers.<name> = { enabled: boolean }` toggles.

Rules:

- Card-declared MCP definitions are merged into the effective registry before project toggle overrides are interpreted.
- Project `{ enabled: true }` toggles activation only. It must not erase or replace a card-declared full server definition.
- Project full server definitions still override lower definition layers for that project.
- The active server set remains produced by `buildActiveServers()`.
- A card-declared optional MCP is reportable only because it came from a locked card manifest. Registry-only optional MCPs are not included in this report.
- The report command hint must be true. In a project with a locked card declaring optional MCP `custom`, `drwn add mcp custom` must be able to enable `custom`.

## Success Criteria

- [ ] Card-declared MCP definitions are represented as definition-layer input, not only as derived `ProjectConfig.servers` entries.
- [ ] A project toggle `{ "servers": { "<card-local-name>": { "enabled": true } } }` activates the card-declared MCP definition without replacing or deleting that definition.
- [ ] Project-local full server definitions still override card-declared definitions.
- [ ] `drwn add mcp <name>` can resolve an optional MCP from the current project's locked card manifests after reusable library/catalog lookup.
- [ ] `drwn add mcp <name>` writes `{ enabled: true }` for card-declared optional MCPs, not a copied full server body.
- [ ] `drwn write` appends an "Optional MCP servers from cards" section when at least one locked card declares optional MCPs.
- [ ] `drwn write --dry-run` prints the same section.
- [ ] `drwn write --json` adds `optionalMcpReport`; the field is `null` when no locked cards exist or no locked cards declare optional MCPs.
- [ ] `drwn card add <spec> --write` and `drwn card apply <specs> --write` print the same section after their existing mutation output and chained write output.
- [ ] When zero locked cards declare optional MCPs, no section is printed.
- [ ] Report statuses include at least `active`, `skipped`, and `shadowed`.
- [ ] All existing tests in `test/commands-write.test.ts` and `test/commands-card-consumer.test.ts` stay green.
- [ ] New tests cover registry optional MCPs, card-local optional MCPs, opt-in via `drwn add mcp`, JSON output, and name collision/shadowing.
- [ ] `bun test` and `bun run typecheck` pass.
- [ ] No new npm dependencies.

## Locked Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | This task fixes definition-vs-toggle layering before adding the report. | Reporting an opt-in command is misleading unless activation actually works for card-local MCPs. |
| D2 | `drwn add mcp <name>` is extended to resolve current locked card optional MCPs. | Keeps the UX consistent with existing project-first MCP activation. |
| D3 | Do not add a card-specific enable command. | A second enable surface would fragment user mental model. |
| D4 | Report code lives in `cli/core/mcp-report.ts`. | Keeps `mcp.ts` focused on filtering/rendering mechanics. |
| D5 | Avoid a heavy `effectiveSnapshot` on `SyncResult`. | Use narrow report inputs or an already-computed `optionalMcpReport` to avoid leaking internal state through JSON. |
| D6 | The report only lists optional MCPs declared by locked cards. | The pain point is card installation hiding card-backed capability, not global registry discovery. |
| D7 | `shadowed` is a first-class report status. | Same-name MCP definitions can differ across layers; users need to know when the active definition is not the card's definition. |
| D8 | Optional filtering policy is unchanged. | MCPs can require credentials, external services, or sensitive local execution. Cards may suggest them but should not auto-enable them. |

## Report Semantics

Report entries should be grouped by locked card and server name.

Statuses:

- `active`: the optional MCP name is present in `activeServers` and the active effective definition matches the card-declared definition for that card.
- `skipped`: the card declares the optional MCP, and the MCP is not active.
- `shadowed`: an MCP with the same name is active, but the effective definition does not match the card-declared definition for that card.

Suggested entry shape:

```ts
export type OptionalMcpReportStatus = "active" | "skipped" | "shadowed";

export interface OptionalMcpReportEntry {
  cardName: string;
  cardVersion: string;
  serverName: string;
  status: OptionalMcpReportStatus;
  reason?: "optional-disabled" | "definition-shadowed";
  optInCommand?: string;
}

export interface OptionalMcpReport {
  entries: OptionalMcpReportEntry[];
  skippedCount: number;
  shadowedCount: number;
}
```

Suggested human output:

```text
Optional MCP servers from cards:
  @team/live-context@0.5.0
    + notion (active)
    - slack (skipped - enable with `drwn add mcp slack`)
    ! custom (shadowed - active definition differs from this card)
```

Use ASCII markers (`+`, `-`, `!`) to match existing output style and keep CI logs portable.

Definition equality should be structural and deterministic. Implement a small local helper that sorts object keys recursively before comparison, or reuse an existing stable JSON helper if one is already available at implementation time.

## Implementation Plan

### Phase 0: Baseline Reproduction

#### Task 0.1: Add fixtures

Add fixture coverage for:

- A card declaring a built-in/library optional MCP by name.
- A card declaring a card-local custom optional MCP definition.
- Two cards declaring the same optional MCP name with different definitions.
- A project-local full definition that intentionally shadows a card definition.

Use existing test helpers where possible. Do not add dependencies.

#### Task 0.2: Lock current filtering behavior

Add a failing or characterization test showing:

- A card-declared optional MCP is absent from `activeServers` until enabled.
- The card-declared full definition exists in the effective registry layer even while inactive.

The second assertion may fail on current code and should drive Phase 1.

### Phase 1: Fix MCP Definition vs Activation Layering

#### Task 1.1: Add explicit card MCP definition layer

Add a focused helper under `cli/core/` (name can be adjusted during implementation):

```ts
export interface CardServerDefinition {
  cardName: string;
  cardVersion: string;
  serverName: string;
  server: RegistryServer;
}

export function collectCardServerDefinitions(lockedCards: CardLockEntry[]): CardServerDefinition[];
```

Then update effective-state construction so the merge model is:

1. Base registry + user library.
2. Card-declared server definitions from locked cards.
3. Project full server definitions.
4. Project toggle overrides into `config.optional`.

Do not rely on card server definitions being collapsed into `ProjectConfig.servers` before project toggles are interpreted.

Implementation options:

- Add a helper beneath `buildEffectiveState()` that accepts base config, base registry, locked cards, and project config and returns `effectiveConfig`, `effectiveRegistry`, `cardServerDefinitions`, and `projectServerOverrides`.
- Or refactor `mergeProjectConfig()` to accept an explicit pre-merged card registry layer. Keep call sites readable; do not spread card-specific logic through command classes.

#### Task 1.2: Preserve existing precedence

Project full definitions must still win over card definitions. Project toggles must activate/deactivate without replacing definitions.

Add tests for:

- Card-local optional + `{ enabled: true }` becomes active.
- Card-local optional + `{ enabled: false }` remains inactive.
- Project full definition with same name wins over card definition and can yield `shadowed`.
- Existing registry/library MCP toggles continue to work.

### Phase 2: Extend `drwn add mcp`

#### Task 2.1: Resolve locked card optional MCPs

Update `drwn add mcp <name>` so lookup order is:

1. Local reusable MCP library / built-in registry behavior as today.
2. Catalog MCP match behavior as today when `--yes` is used.
3. Current project's locked card optional MCP definitions.

For a card-declared optional MCP match:

- Require a project context with a current card lock or resolvable project card specs.
- Write `{ "servers": { "<name>": { "enabled": true } } }`.
- Do not copy the full server definition into project config.
- Report `action: "enabled"` and `projectChanges: [{ kind: "mcp", id, action: "enabled" }]`.
- Include `requiredEnv` from the card server definition.

If multiple locked cards declare the same optional server name with different definitions, still write the toggle, but include a warning in human/JSON output that the effective definition follows card order / layer precedence. The write-time report will surface `shadowed` where relevant.

#### Task 2.2: Tests for `drwn add mcp`

Add tests for:

- `drwn add mcp <card-local>` enables a locked card optional MCP.
- Dry-run reports the same planned project config change without writing.
- JSON output includes expected `kind`, `id`, `action`, `projectConfigPath`, `projectChanges`, and `requiredEnv`.
- Outside a project, card-local lookup is not attempted and existing error behavior is preserved.
- Existing library/catalog lookup tests stay green.

### Phase 3: Optional MCP Report Module

#### Task 3.1: Add `cli/core/mcp-report.ts`

Inputs should be narrow:

```ts
export interface OptionalMcpReportInput {
  lockedCards: CardLockEntry[];
  activeServers: Record<string, RegistryServer>;
  effectiveRegistry: CanonicalRegistry;
  projectConfigPath: string | null;
  projectServerOverrides: ProjectConfig["servers"] | undefined;
}
```

If implementation produces a narrower purpose-built input shape, prefer that over passing full `EffectiveState`.

The module should export:

- `OptionalMcpReport`
- `OptionalMcpReportEntry`
- `computeOptionalMcpReport(input)`
- any small structural comparison helper needed for `shadowed`

Return `null` when there are no locked cards or no locked cards declare optional MCPs. This keeps JSON and human output semantics simple.

#### Task 3.2: Renderer

Add `renderOptionalMcpReport(report)` to `cli/core/output.ts`, or keep rendering beside `mcp-report.ts` if that fits the local output conventions better.

Rendering requirements:

- Empty/null report renders as `""`.
- Group by `cardName@cardVersion`.
- Include active, skipped, and shadowed states.
- Use `drwn add mcp <name>` as the project opt-in command for skipped entries when `projectConfigPath` is present.
- For machine-scope runs without locked cards, report is `null`; no machine default command is needed for this card-specific report.

### Phase 4: Wire Write Surfaces

#### Task 4.1: Avoid heavy `effectiveSnapshot`

Do not add full `EffectiveState` or large lockfile/server snapshots to public `SyncResult` JSON.

Acceptable implementation patterns:

- Populate `optionalMcpReport?: OptionalMcpReport | null` on `SyncResult`, with `renderSyncResult()` ignoring it.
- Or add an internal-only `optionalMcpReportInput` field and strip it before JSON serialization.

Preferred: compute `optionalMcpReport` inside `syncRepository()` from the same `state` used for materialization, then return the report directly as part of `SyncResult`.

#### Task 4.2: `drwn write`

Update `cli/commands/write.ts`:

- Human output: existing sync output first, optional MCP report second.
- JSON output: include `optionalMcpReport`; do not include any internal report inputs.
- `--dry-run`: same report as a normal write.

#### Task 4.3: `drwn card add --write` and `drwn card apply --write`

Update `runChainedWrite()` in `cli/commands/card/project-command.ts`:

- Print existing `renderSyncResult(result)`.
- Print optional MCP report after the sync result.

Single change site should cover both card consumer commands.

### Phase 5: Tests

Add or extend tests in:

- `test/commands-write.test.ts`
- `test/commands-card-consumer.test.ts`
- `test/commands-add-mcp.test.ts` (or the existing file that owns `drwn add mcp` behavior)
- a focused core test such as `test/core-mcp-report.test.ts`

Required cases:

- Registry/library optional MCP declared by a card is skipped and report suggests `drwn add mcp <name>`.
- Registry/library optional MCP becomes active after opt-in.
- Card-local optional MCP is skipped and report suggests `drwn add mcp <name>`.
- `drwn add mcp <card-local>` enables the card-local optional MCP.
- Card-local optional MCP becomes active after opt-in and materializes into target MCP config.
- Same-name different definition produces `shadowed`.
- Project-local full definition wins over card definition and report says `shadowed`.
- `drwn write --json` includes `optionalMcpReport`.
- No report appears when locked cards declare no optional MCPs.
- Existing optional filtering behavior remains unchanged.

### Phase 6: Documentation

Update active docs only (`docs-docusaurus/`, plus `docs/cli-quickref.md` if it already documents the same surface):

- Explain that cards may declare optional MCPs.
- Explain that optional card MCPs are not active until enabled.
- Document `drwn add mcp <name>` as the opt-in path for reusable and card-declared optional MCPs in the current project.
- Mention `optionalMcpReport` in the `drwn write --json` output contract.

Do not edit deprecated `docs-astro/`.

## Verification

- `bun test` passes.
- `bun run typecheck` passes.
- Manual smoke with a card that declares:
  - one reusable optional MCP, and
  - one card-local custom optional MCP.

Manual smoke outline:

1. Create/apply a fixture card with both optional MCPs.
2. Run `drwn card apply <card-ref> --write`.
3. Confirm the report lists both optional MCPs as skipped with `drwn add mcp <name>` commands.
4. Run `drwn add mcp <card-local-name>`.
5. Run `drwn write`.
6. Confirm the card-local MCP is active and appears in generated target MCP config.
7. Run `drwn write --json` and confirm `.optionalMcpReport` is populated and contains no internal report inputs.

## Risks / Open Questions

- **Definition equality.** Use deterministic structural equality, not object identity. Pay attention to optional undefined fields and ordering.
- **Same-name definitions across multiple cards.** Follow existing layer/card order semantics. Report `shadowed` rather than trying to auto-resolve.
- **`defaults.mcpServers` branch in `buildActiveServers()`.** That branch bypasses normal optional toggles. Tests should cover the current intended semantics so this task does not accidentally change global defaults behavior.
- **Scope of report.** Keep the report card-specific. Server-only optional MCP discovery is a separate UX problem.
- **JSON contract.** Only `optionalMcpReport` is public. Do not leak `EffectiveState`, report inputs, card manifests wholesale, or full registry definitions into `drwn write --json`.

## Completion Criteria

- All success criteria are satisfied.
- Phase 0-5 tests are green.
- Phase 6 docs are updated.
- A completion summary is written at `.ai/tasks/42_completion_drwn-mcp-optional-activation-report.md` with:
  - final implementation summary,
  - test commands run,
  - manual smoke result,
  - any deviations from this plan,
  - final commit hash if committed.
