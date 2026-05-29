# Top-Level Registry Layout Design

## Goal

Reduce root-level clutter by moving packaged harness source data out of the repository root while keeping `.agents/bgng/config.json` reserved for local project overlays.

## Current Layout Problem

The root currently mixes normal package metadata with darwinian-harness source data:

- `config.json`
- `mcp-servers.json`
- `sync-mcp.ts`
- README imagery
- package metadata and lockfiles

That makes `config.json` look like this checkout's local project config, even though the CLI contract already uses `<project>/.agents/bgng/config.json` for project overlays.

## Decision

Use `registry/` for the packaged source-of-truth files:

- `registry/config.json`
- `registry/mcp-servers.json`

This keeps the local overlay namespace clear:

- `~/.agents/bgng/config.json` remains machine-wide user state.
- `<project>/.agents/bgng/config.json` remains project overlay state.
- `registry/*.json` becomes the package's built-in harness registry.

## Scope

Update the CLI, compatibility wrapper, tests, release checks, package manifest, and docs to resolve packaged config and registry files under `registry/`.

Keep the legacy root `sync-mcp.ts` wrapper for now. It is a public compatibility surface and can remain at root until a separate deprecation plan exists.

Move README imagery under `docs/assets/` only if package/docs tests are updated in the same change. Treat unreferenced root images as assets or temporary artifacts; do not publish them accidentally.

## Testing

Use test-first changes for the path behavior:

- Core config tests should create and load `registry/config.json`.
- Core registry tests should create and load `registry/mcp-servers.json`.
- CLI fixture scaffolding should write fixture registry files under `registry/`.
- Package readiness should assert package contents include `registry/*.json` and exclude root copies.
- Documentation readiness should assert the README points at the new asset path if the image moves.

Run focused tests first, then the full test suite and typecheck.
