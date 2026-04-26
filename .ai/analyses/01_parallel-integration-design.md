# Parallel Integration Design

**Date:** April 23, 2026

**Status:** Approved

**Scope:** Add Parallel to the canonical `agents-config-saam` system with CLI-backed skills as the default local coding-agent path and globally opt-in MCP support as an overlay.

## Goal

Integrate Parallel into this repo in a way that works well for local coding agents by default, preserves the repo as the canonical source of truth, and avoids conflating hosted platform behavior with locally synced tool configuration.

## Decision

The system will support Parallel in two layers:

- **Default layer:** CLI-backed skills
- **Optional layer:** globally enabled Parallel MCP servers

This makes CLI+skill the standard path for Codex and Claude Code while keeping Parallel MCP available through the same canonical registry when explicitly enabled.

## Why This Approach

Parallel’s current documentation recommends CLI + skills for coding agents with terminal access, and positions MCP primarily for chat assistants, MCP-aware applications, and fast programmatic integration. This repo is centered on local coding agents and local sync behavior, so the default should follow the better operational fit rather than forcing everything through MCP.

At the same time, keeping Parallel MCP definitions in the canonical registry preserves the repo’s role as the single source of truth. The important distinction is that these MCP entries should be treated as real local sync targets when enabled, not as `platform-provided` placeholders.

## Architecture

### 1. Default Parallel path: CLI-backed skills

Parallel support will be available by default through repo-managed skills that assume the presence of `parallel-cli`.

The repo will add shared skills for:

- `parallel-web-search`
- `parallel-web-extract`
- `parallel-deep-research`
- `parallel-data-enrichment`

These skills will:

- explain when each capability should be used
- instruct the agent to call `parallel-cli ... --json`
- describe minimal expected input/output shapes
- fail clearly when the CLI is missing or unauthenticated
- avoid embedding secrets or requiring repo-local installation state

This keeps the default local experience aligned with Parallel’s intended coding-agent workflow while fitting naturally into the current `.agents` skill sync model.

### 2. Optional Parallel path: global MCP overlay

Parallel MCP support will exist as a global opt-in.

The canonical registry will add real MCP entries for:

- `parallel-search`
- `parallel-task`

These will be standard syncable MCP definitions, not `platform-provided` entries. When enabled, they will be written into Claude, Codex, and Cursor configs by the same sync path used for every other MCP server.

This allows the repo to support both operational modes without introducing a second integration system.

## Config Model

`config.json` will gain a top-level Parallel integration block:

```json
{
  "parallel": {
    "cli": {
      "enabled": true
    },
    "mcp": {
      "enabled": false
    }
  }
}
```

Interpretation:

- `parallel.cli.enabled = true`
  - Parallel skills are part of the intended default local workflow.
  - The sync script does not install the CLI; it only syncs skills and documents prerequisites.
- `parallel.mcp.enabled = false`
  - Parallel MCP servers are excluded from generated local configs by default.
- `parallel.mcp.enabled = true`
  - Parallel MCP servers are included globally for all enabled sync targets.

This is intentionally separate from the existing `optional` map because it is not just a yes/no server toggle; it is a mode decision for an integration family.

## Registry Model

`mcp-servers.json` will add:

- `parallel-search`
  - hosted MCP URL for Parallel Search MCP
- `parallel-task`
  - hosted MCP URL for Parallel Task MCP

These entries should carry normal metadata:

- `description`
- `transport`
- `url`
- auth notes
- optional explanatory notes

They should not be modeled as `platform-provided`, because the sync script must be able to write them into local tool config when the global MCP toggle is enabled.

## Sync Behavior

`sync-mcp.ts` remains the single control point.

Default sync behavior:

- sync existing MCP servers
- sync Parallel shared skills
- do not sync Parallel MCP servers

Opt-in MCP behavior:

- if `parallel.mcp.enabled = true`, include `parallel-search` and `parallel-task`
- generate target-specific config exactly as for other MCP entries
- preserve all existing backup and dry-run safety behavior

The filtering should happen centrally in the registry-selection logic, not as downstream target-specific branching.

## Skill Strategy

### Codex

Codex will rely on repo-managed skills that call `parallel-cli --json`.

This is the primary intended path for local Codex use because:

- it fits terminal-based agent behavior
- it avoids large MCP tool schema overhead
- it keeps richer Parallel workflows available through CLI

### Claude Code

Claude Code should also receive the repo-managed Parallel skills so the baseline behavior stays canonical and tool-agnostic.

The first-party Parallel Claude Code plugin remains compatible and may still be used, but it is not required for this repo to function. The repo should document that plugin as an optional enhancement, not a dependency.

## Error Handling

Parallel skills should be explicit about failure states:

- if `parallel-cli` is not installed, instruct the agent to surface:
  - `curl -fsSL https://parallel.ai/install.sh | bash`
- if authentication is missing, instruct the agent to surface:
  - `parallel-cli login`
  - or `PARALLEL_API_KEY=...`
- if the requested capability is long-running, instruct the agent to expect async or status/result-oriented CLI flows where appropriate

The sync script itself should not attempt to install Parallel or mutate user auth state.

## Documentation

`README.md` should be updated to explain:

- Parallel is supported by default via CLI-backed skills
- `parallel-cli` must be installed and authenticated separately
- Parallel MCP exists as a global opt-in
- how to enable that opt-in and rerun sync

Architecture-facing docs should also make the distinction explicit:

- CLI+skill is the recommended local coding-agent path
- MCP is an optional overlay, not the default local mode

## Testing

The implementation must add tests for:

- default filtering excludes Parallel MCP
- enabling `parallel.mcp.enabled` includes Parallel MCP
- skill sync still propagates Parallel shared skills correctly
- dry-run behavior remains stable with the new config shape

Verification on the real machine should include:

- confirming whether `parallel-cli` exists
- checking whether auth appears configured if that can be detected safely
- confirming synced tool configs exclude Parallel MCP by default
- confirming the global toggle would include it on demand

## Non-Goals

This design does not require:

- automatic installation of `parallel-cli`
- automatic OAuth flows
- per-tool Parallel MCP toggles
- replacing the current sync architecture
- committing files automatically

## Constraints

- No files will be committed unless explicitly instructed by the user.
- The existing canonical sync model should remain intact.
- Default local tool contexts should stay lean and predictable.

## Expected Outcome

After implementation:

- Codex and Claude Code will have Parallel available by default through synced skills that use `parallel-cli`
- the canonical repo will also contain Parallel MCP definitions
- a single global toggle will control whether those MCP entries are added to local tool configs
- the repo will remain the authoritative inventory for both integration modes
