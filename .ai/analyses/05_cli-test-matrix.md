# CLI Test Matrix

**Purpose:** Future-facing certification matrix for the `agents` CLI across environments, install modes, user states, and feature toggles.

## Priority Levels

- **P0:** Current machine certification required before local release confidence
- **P1:** Cross-machine and fresh-user validation required before broader sharing
- **P2:** Future OSS/public distribution matrix, including Homebrew and Linux

## Matrix Dimensions

### OS / Platform

- **P0:** macOS
- **P2:** Linux

### Install Mode

- **P0:** repo-local Bun execution
- **P0:** global `bun link` execution
- **P2:** package install flow
- **P2:** Homebrew install flow

### User State

- **P0:** existing configured user
- **P1:** first-time user
- **P1:** migrated legacy user
- **P1:** drifted/broken environment user
- **P1:** user missing optional local tools

### Feature Toggles

- **P0:** `parallel.mcp.enabled = false`
- **P1:** `parallel.mcp.enabled = true`
- **P1:** optional servers disabled
- **P1:** optional servers enabled
- **P1:** `markdownify` absent
- **P1:** `markdownify` present and locally configured

### Tool Environment State

- **P0:** populated `~/.agents`
- **P1:** empty `~/.agents`
- **P1:** stale symlink state
- **P1:** broken symlink state
- **P1:** generated-file missing state

## Certification Matrix

| Priority | Dimension | Scenario | Current Status |
|----------|-----------|----------|----------------|
| P0 | macOS | repo-local `bun run agents -- ...` | verified |
| P0 | macOS | global `bun link` + `agents ...` | verified |
| P0 | feature toggle | `parallel.mcp.enabled = false` | verified |
| P0 | user state | existing configured user | verified |
| P0 | tool state | populated `~/.agents` | verified |
| P1 | user state | first-time user | planned |
| P1 | user state | migrated legacy wrapper user | planned |
| P1 | user state | drifted environment | partially verified |
| P1 | feature toggle | `parallel.mcp.enabled = true` | planned |
| P1 | feature toggle | `markdownify` absent | partially verified |
| P1 | feature toggle | `markdownify` present | planned |
| P1 | tool state | empty `~/.agents` | planned |
| P1 | tool state | stale symlinks | verified in fixtures |
| P1 | tool state | broken symlinks | verified in fixtures |
| P1 | tool state | generated-file missing | verified in fixtures |
| P2 | platform | Linux | planned |
| P2 | install mode | package install | planned |
| P2 | install mode | Homebrew install | planned |

## Scenario Notes

### macOS

This remains the primary environment and the first certification target.

### Linux

Linux support should be treated as a formal later matrix item, not assumed from Bun compatibility alone.

### Homebrew

Homebrew is explicitly future-facing:

- not implemented yet
- must still be represented in release-readiness planning
- requires a documented release checklist and validation expectations

### Parallel

Parallel introduces two important test branches:

- CLI-backed default behavior
- MCP-overlay opt-in behavior

Both need explicit coverage before public release.

### Markdownify

`markdownify` is optional local-only by design. Testing must reflect both:

- absence on a normal machine
- presence on a user-configured machine

## Recommended Execution Order

1. P0 current machine certification
2. P1 first-time user and migration scenarios
3. P1 optional/local-tool and toggle scenarios
4. P2 public distribution scenarios

## Review Anchors

This matrix should be rechecked whenever:

- new CLI commands are added
- install story changes
- package metadata changes
- Homebrew work starts
- optional server strategy changes
