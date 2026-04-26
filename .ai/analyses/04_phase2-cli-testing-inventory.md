# Phase 2 CLI Testing Inventory

**Date:** April 24, 2026

**Scope:** Current testing coverage, gaps, deferred areas, and release-risk inventory for the `agents` CLI and compatibility wrapper.

## Coverage Map

### Core modules

Covered:
- `cli/core/paths.ts`
- `cli/core/fs.ts`
- `cli/core/config.ts`
- `cli/core/registry.ts`
- `cli/core/mcp.ts`
- `cli/core/skills.ts`
- `cli/core/sync.ts`
- `cli/core/diagnostics.ts`

Partially covered:
- `cli/core/output.ts`
  - currently exercised indirectly through command tests
  - lacks explicit output-contract coverage across all public commands

Missing:
- no dedicated release-gate test harness
- no explicit test for script-based quality gate output

### Command surfaces

Covered:
- `agents sync`
- `agents skills list`
- `agents skills curate`
- `agents skills uncurate`
- `agents skills sync`
- `agents mcp list`
- `agents mcp sync`
- `agents status`
- `agents doctor`

Partially covered:
- human-readable output formatting consistency
- JSON output contract stability across all commands

Missing:
- explicit command parity checks between repo-local and global execution

### Compatibility wrapper

Covered:
- `sync-mcp.ts` public exports
- `syncRepository` wrapper semantics
- `--dry-run`
- `--mcp-only`
- `--skills-only`
- `--target=claude`

Missing:
- no explicit equivalence test comparing `agents sync --dry-run` and `sync-mcp.ts --dry-run`

### Local environment integration

Covered:
- temp-dir fixture simulation of repo/home state
- stale skill symlink scenarios
- drifted MCP config scenarios
- broken symlink scenarios
- tilde-path drift detection

Partially covered:
- local machine smoke checks
- optional-tool behavior

Missing:
- structured first-time user journey tests
- explicit migration scenarios from legacy wrapper to new CLI

### Package / release validation

Covered:
- package script and bin entry tests
- clean `tsc --noEmit`
- clean `bun test`
- hardcoded source-path cleanup in source files

Partially covered:
- publish-facing metadata
  - `name`, `version`, `description`, `license`, `author`, `keywords`, `bin` exist

Missing:
- explicit package-readiness test
- explicit repository-metadata exception handling
- single `verify:release` quality gate

### Future distribution readiness

Covered:
- Bun-first install story
- global `bun link` smoke verification

Missing:
- documented Homebrew readiness checklist
- future multi-environment certification matrix
- docs quality gates that enforce release/operator coverage

## Covered

- 67 automated tests passing
- clean typecheck
- repo-local CLI smoke coverage
- global `bun link` smoke coverage
- compatibility wrapper regression coverage
- hardening of key correctness bugs

## Partially Covered

- output format stability over time
- package/release metadata acceptance
- migration and first-time-user flows
- future OSS install stories beyond Bun-first usage

## Missing

- `verify:release` script and test
- command output contract tests
- repo-local/global parity tests
- scenario/user-journey tests
- package-readiness tests
- Homebrew checklist validation
- docs-readiness tests
- formal certification artifact/checklist

## Deferred

- actual Homebrew implementation
- actual npm publish verification against a live registry
- Linux execution certification
- multi-machine release certification
- future package name finalization
- repository URL metadata, pending remote/release decision

## Risk Matrix

| Risk | Severity | Likelihood | Notes |
|------|----------|------------|-------|
| CLI human/JSON output drifts silently | Medium | Medium | Current tests focus on behavior more than output contracts |
| Repo-local and global execution diverge | High | Medium | Supported modes exist, but no parity harness yet |
| Legacy wrapper and `agents sync` behavior drift apart | High | Medium | Both exist; migration path needs explicit comparison coverage |
| First-time user onboarding regressions | Medium | Medium | Current fixtures simulate state, but not full user journeys |
| Publish/package metadata regressions | Medium | Medium | Package is closer to release shape but not guarded by tests |
| Hidden machine-specific assumptions reappear | High | Medium | Hardcoded path cleanup happened, but no explicit scan gate yet |
| Docs fall behind the CLI surface | Medium | High | No docs-readiness tests yet |
| Future Homebrew work starts from ambiguous expectations | Medium | High | Checklist not yet formalized |
| Drift detection false negatives in new scenarios | High | Low | Key known bug fixed, but environment matrix is still informal |

## Immediate Priority

P0:
- release gate script
- command output contract tests
- repo-local/global parity tests
- scenario/user-journey tests

P1:
- package-readiness test
- Homebrew checklist and validation
- docs-readiness gate

P2:
- broader environment certification matrix execution
- Linux and multi-machine validation
