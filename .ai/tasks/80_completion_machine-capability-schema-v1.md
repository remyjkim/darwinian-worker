# ABOUTME: Completion evidence for Task 80's first supported machine capability schema.
# ABOUTME: Records the immutable profile pin, controlled reset, isolation checks, and release verification.

# Task 80 Completion: Machine Capability Schema V1

**Status:** Completed
**Completed:** 2026-07-13
**Plan:** `.ai/tasks/80_drwn-machine-defaults-v2-remediation-plan.md`
**Implementation branch:** `feat/task-80-machine-profiles`
**Execution model:** Primary checkout only; no isolated worktree

---

## Outcome

Task 80 establishes the first supported machine capability contract:

- machine intent is strict `drwn.machine` schema V1 at
  `~/.agents/drwn/machine.json`;
- prompt-free initialization writes explicit empty capability intent;
- guided initialization offers an opt-out Recommended Darwinian Operator
  profile;
- the profile is an immutable Card pin filtered to 17 approved skills and zero
  MCP servers;
- profile capabilities and explicit machine selections are the only activation
  authorities;
- prototype fields, curated directories, optional flags, projection state, and
  project state cannot activate machine capabilities;
- machine projection is ownership-recorded and preserves foreign or drifted
  paths instead of claiming or deleting them;
- project declarations remain independent from machine intent, while ambient
  user-home observations remain visible through diagnostics;
- `skills curate` and `skills uncurate` are removed from registration, help,
  documentation, and release artifacts.

Task 80 did not add compatibility readers or migration adapters for prototype
machine state. It also left remote deploy V1 and the fail-closed whole-Store
export policy unchanged.

## Immutable Operator Profile

The public `@darwinian/operator@1.0.2` Card is pinned as follows:

| Field | Value |
|---|---|
| Remote | `https://github.com/curation-labs/darwinian-operator` |
| Source | `git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2` |
| Commit | `6b2998c51b7c736c70c2e522cb8d7b3170e816d8` |
| Tree | `2297dfc30783200a2b6a0da1189d7de20a01f23c` |
| Integrity | `sha256-284cd3ba4880a60ba93b81c0be0dd15796b27a640ed697fdb1a18fe6b5ff30d9` |
| Allowed capabilities | 17 skills, zero MCP servers |

The source doctor, removed-command scans, immutable resolution, manifest
identity, tree, integrity, and allowlist verification passed. Runtime status and
write use the already pinned extracted tree and do not resolve a mutable range.
The profile contributes no Worker identity, instructions, hooks, permissions,
governance, or project state.

## Implementation Commits

| Commit | Scope |
|---|---|
| `d2ba030` | Revise Task 80 into the approved clean-slate schema V1 plan |
| `71db8dd` | Define strict machine schema V1 and empty initialization |
| `c8bdf3c` | Add and verify the immutable Recommended Operator profile |
| `1efea5d` | Make profile and explicit skill/MCP selections the only activation authority |
| `0344596` | Enforce projection ownership and foreign-path protection |
| `8edc2f8` | Report machine provenance, health, and capture state |
| `ba1b96f` | Publish the machine capability contract and release gate |
| `897bfb4` | Add drift-cleanup characterization during final gate repair |
| `e4f738d` | Align integration fixtures with explicit machine intent |
| `79ac803` | Preserve and report drifted removed ownership per the ratified policy |
| `a155761` | Give release subprocess verification deterministic CI headroom |

The final ownership behavior is the Task 80 policy: unchanged prior-owned
artifacts may be removed, while drifted or foreign artifacts are preserved and
reported.

## Controlled Machine Reset

The prototype machine state was inventoried before replacement without
recording secrets. It contained authoring scope `@remyjkim`, 42 selected skills
(17 Operator and 25 non-Operator), and the explicit `notion` MCP server. It had
no additional policy or optional activation state.

The prototype file was backed up outside the Store at:

```text
/Users/pureicis/.agents/task80-machine-reset-20260713/machine.prototype.json
SHA-256 355919e9d8e6ddb16c7047067ec65087d95b99b88df2dc5b4d0b245f7a7a35e3
```

No prior `~/.agents/drwn/global-write-record.json` existed. Fifty prior target
skill symlinks were archived outside the Store, split evenly between Claude and
Codex, under:

```text
/Users/pureicis/.agents/task80-machine-reset-20260713/claude-skill-links
/Users/pureicis/.agents/task80-machine-reset-20260713/codex-skill-links
```

Ownership was established before cleanup: the symlink names exactly matched the
25 retained non-Operator prototype selections and all links were live. Cursor's
ambient `notion` entry exactly matched the current Library rendering. Codex's
entry had the same URL and differed only by the current renderer's explicit
`enabled = true`. Only those proven prototype artifacts were retired; `--force`
was not used.

The strict V1 replacement preserves authoring scope, selects the pinned
Operator profile, retains the 25 resolvable non-Operator skills as explicit
selections, and retains `notion` as an explicit MCP selection. Every selected
capability resolved from the Library.

## Projection and Isolation Evidence

The first dry-run failed closed on foreign destinations, as required. After the
explicit prototype cleanup, the second dry-run passed and the real machine
write reported:

```text
90 changes
87 managed paths
6 warnings
0 ambient collisions
```

The record owns 84 skill directories (42 skills for Claude and Codex) and three
managed MCP fields for Claude, Codex, and Cursor. Machine status then reported
one verified profile, 42 resolved skills, one resolved MCP server, no missing
capabilities, a current 87-path projection record, and no conflicts. Doctor
reported no broken or stale managed links, MCP drift, projection conflicts,
machine capability issues, generated-file issues, hook issues, project-config
issues, or ambient collisions.

A final machine dry-run was idempotent with zero changes, the same 87 managed
paths, and zero ambient collisions. Six unrelated pre-existing directories were
reported but left untouched: five `.claude/skills/*.bak` directories and
`.codex/skills/codex-primary-runtime`.

Project isolation was checked in `darwinian-cards`. Its V1 status retained one
active Worker, four active Cards, 27 declared skills, two declared MCP servers,
and zero hooks. None of the 25 machine-only explicit skills appeared in project
declarations, config, or lock state. The ambient `notion` observations for
Claude, Codex, and Cursor were all classified `AMBIENT_IDENTICAL` and remained
separate from project intent. Hashes for config, lock, active Worker,
instructions, Worker output, and the project write record were unchanged across
status and dry-run checks.

## Verification Evidence

TDD covered strict parsing, initialization, immutable profile verification,
profile filtering, explicit selection, ownership, diagnostics, project
isolation, documentation, and release enforcement. Focused final verification
included:

- 54 pass, 0 fail for deterministic machine and integration coverage;
- 31 pass, 0 fail for ownership cleanup, root scope, and drift handling;
- 25 pass, 0 fail for release subprocess coverage.

Final repository verification:

```text
bun test
1458 pass
5 skip
0 fail
5708 expect() calls
1463 tests across 271 files
```

Additional gates:

- `bun run typecheck`: pass;
- `bun run docs:build`: optimized production build pass;
- `bun run verify:release --json`: `ok:true`, no warnings, all checks pass;
- `git diff --check`: pass.

The five unchanged environment-gated skips cover Windows DPAPI, three live
BeginningDB contracts/journeys, and live `dm-card-base` GitHub catalog
collaboration. No Task 80 behavior is skipped.

## Remaining Boundaries

Task 81's complete Library lifecycle and Task 82's portable transfer design are
separate product surfaces and were not implemented by Task 80. Their current
plans must be reviewed for authorization and dependencies before execution.
Task 80 does not weaken Task 79's Store-export credential boundary or alter the
remote deploy payload contract.

## Acceptance Status

All Task 80 completion gates are satisfied. Machine activation is explicit,
immutable profile content is narrowly filtered, projection ownership is
fail-closed without claiming foreign state, diagnostics preserve machine and
project provenance, the controlled reset is reproducible, and the full release
gate passes.
