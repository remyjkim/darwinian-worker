# Task 42 Completion: Card-Declared Optional MCP Activation And Reporting

Task 42 is implemented in the working tree.

## What Changed

- Card-declared MCP definitions now merge into the effective registry before project activation toggles are interpreted.
- Project `{ "servers": { "<name>": { "enabled": true } } }` can activate a card-local optional MCP without replacing its full card definition.
- `drwn add mcp <name>` now resolves optional MCPs declared by the current project's locked cards after reusable library/catalog lookup, then writes the project activation toggle.
- `drwn write`, `drwn write --dry-run`, `drwn card apply --write`, and `drwn card add --write` report optional card MCPs as `active`, `skipped`, or `shadowed`.
- `drwn write --json` includes the structured report under `optionalMcpReport`.
- Docs now explain card-local optional MCPs, the opt-in command, and the definition-source versus activation-toggle model.

## Key Files

- `cli/core/card-mcp.ts`
- `cli/core/effective-state.ts`
- `cli/core/mcp-report.ts`
- `cli/commands/add/mcp.ts`
- `cli/core/output.ts`
- `cli/core/sync.ts`
- `cli/commands/write.ts`
- `cli/commands/card/project-command.ts`

## Verification

- `bun test test/core-effective-state.test.ts test/core-mcp-report.test.ts test/commands-add-mcp.test.ts test/commands-write.test.ts test/commands-card-consumer.test.ts`
  - Result: 39 pass, 0 fail.
- Isolated real CLI smoke:
  - Created a card source with a card-local optional MCP.
  - Published and applied the card into a temp project.
  - Verified `drwn write --dry-run` reports the skipped MCP.
  - Verified `drwn write --dry-run --json` includes `optionalMcpReport`.
  - Verified `drwn add mcp smoke-card --json` enables the card-local MCP and reports required env.
  - Verified a later `drwn write --dry-run` reports the MCP as active.
  - Ran a real `drwn write --target=codex` in the temp project.
  - Result: pass.

## Repo-Wide Gates

- `bun run typecheck` is blocked by pre-existing dirty-tree loose-skill tests expecting unimplemented exports:
  - `installSkillBundleRoot`
  - `ingestLooseSkill`
- `bun test` ran 802 tests:
  - 793 pass
  - 1 skip
  - 8 fail
  - All failures are in the unrelated loose-skill package tests already present in the dirty tree.

Task 42's targeted tests and real CLI path are green.
