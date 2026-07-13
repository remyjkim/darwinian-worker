# ABOUTME: Completion evidence for Task 81's first supported machine inventory lifecycle.
# ABOUTME: Records the command contract, transaction safety, controlled rollout, and release verification.

# Task 81 Completion: Machine Inventory Lifecycle

**Status:** Completed
**Completed:** 2026-07-13
**Plan:** `.ai/tasks/81_drwn-library-lifecycle-and-persistence-plan.md`
**Implementation branch:** `feat/task-81-inventory-lifecycle`
**Execution model:** Primary checkout only; no isolated worktree

---

## Outcome

Task 81 establishes the first supported lifecycle for inactive, reusable
machine inventory:

- drwn-managed standalone skill packages and synthetic loose-skill packages
  are mutable inventory under `~/.agents/drwn/skills`;
- drwn-managed standalone MCP records are mutable inventory under
  `~/.agents/drwn/mcp-servers`;
- repository skills, bundled registry MCP definitions, profile-owned
  capabilities, and Card-owned copies remain outside standalone lifecycle
  commands;
- package versions are immutable complete trees with canonical payload digests,
  and activation changes through atomic regular-file `current` pointers;
- MCP definitions persist as atomic per-record files and preserve secret
  references without resolving credential values;
- update and removal discover declared machine/project references and block
  destructive changes that would leave unresolved intent;
- inventory GC is dry-run by default and cannot infer that current inventory is
  removable merely because its known reference count is zero;
- prototype Library, Store, and top-level skills command namespaces and readers
  are absent from the supported surface.

Card-owned content, machine profile policy, portable transfer, whole-machine
backup, and remote deploy payload changes remain outside Task 81.

## Public Command Contract

The supported namespaces are:

```text
drwn machine skill list|show|references|install|update|uninstall|enable|disable
drwn machine mcp list|show|references|add|update|remove|enable|disable
drwn machine inventory gc [--prune] [--json]
```

Skill update and uninstall operate on package identity and enumerate every
exported skill ID. Unqualified skill lookup accepts skill IDs; package lookup
requires `--package`. Install/add create inactive inventory, while
enable/disable mutate only explicit strict machine V1 intent. Destructive
commands provide no force bypass for known references.

Catalog lifecycle remains in the existing `drwn catalog` domain. `library`,
`store`, the top-level `skills` namespace, prototype machine-default commands,
and their dead command classes are removed without aliases or moved-command
compatibility behavior.

## Transaction and Recovery Evidence

One global inventory mutation lock serializes cross-record uniqueness checks,
package pointer changes, MCP record replacement, reference-sensitive
machine/project mutations, project registration, and GC. The enforced lock
order is:

```text
inventory lock -> machine lock -> normalized project locks in lexical order
```

Network fetch, archive extraction, npm packing, and source copying happen in an
external staging directory before the managed lock is acquired. Mutations then
revalidate staged identity, payload digest, mutable inventory, uniqueness, and
references while holding the appropriate lock set.

Lock records carry an operation UUID, PID, hostname, and creation time. Live
same-host owners fail busy; provably dead same-host owners are quarantined
before recovery; malformed, foreign-host, or ownership-changed locks fail
closed. Lock release verifies the operation UUID.

Package and MCP removal uses operation-owned tombstones. Recovery validates
owner metadata, path containment, manifest/record identity, and expected
payload digest before completing deletion or restoring valid state. Atomic
record replacement preserves sibling MCP records. Race coverage verifies that
project registration, project activation, machine enablement, update,
uninstall, and GC cannot bypass the inventory-first lock protocol.

## Implementation Commits

| Commit | Scope |
|---|---|
| `ca1ce09` | Approve the machine inventory lifecycle plan |
| `466ed8d` | Add the global inventory transaction and recovery foundation |
| `8aed61c` | Discover strict machine and known-project references |
| `b9da289` | Persist immutable package versions and atomic MCP records |
| `85b4962` | Refine the approved inventory contract |
| `77ed143` | Define non-secret reference provenance |
| `b0eec2b` | Clarify staged source validation and revalidation |
| `bb034fc` | Align persistence, registration, and Card capture with the approved contract |
| `09f89eb` | Pin the supported command grammar with red-first tests |
| `67c7a67` | Add machine skill, MCP, and guarded inventory GC commands |
| `8988c72` | Serialize project inventory-reference mutations |
| `35126d7` | Remove prototype inventory adapters and command implementations |
| `da63405` | Publish the machine inventory lifecycle and release gate |
| `964c7fb` | Correct machine status support and recursive inventory diagnostics |

## TDD and Test Coverage

Implementation followed red-green-refactor sequencing for the command shape,
locking, reference scans, immutable package and atomic MCP persistence,
tombstone recovery, project races, GC, documentation, and release enforcement.
Focused suites covered unit behavior, command integration, process-level races,
isolated command smoke tests, Card capture, project registration, and release
contract failures before each implementation batch was committed.

The final full suite reported:

```text
bun test
1471 pass
5 skip
0 fail
5837 expect() calls
1476 tests across 273 files
```

The five environment-gated skips are unchanged: Windows DPAPI, three live
BeginningDB contract/journey checks, and the live `dm-card-base` GitHub catalog
flow. No Task 81 behavior is skipped.

Additional final gates:

- `bun run typecheck`: pass;
- `bun run docs:build`: optimized production build pass with the existing
  Docusaurus dependency set;
- `bun run verify:release --json`: `ok: true`, no warnings, all 12 checks pass;
- `git diff --check`: pass.

## Controlled Machine Rollout

The live Store was audited directly before normal inventory readers ran. The
non-secret inventory contained:

- two standalone skill packages: `@local/drafting-knowledge-docs@0.1.0` with
  one exported skill and `darwinian-minds-skills@0.4.0` with 18 exported
  skills;
- zero standalone MCP records;
- strict `drwn.machine` V1 intent with the pinned `darwinian-operator` profile,
  25 explicit skill selections, and the explicit `notion` MCP selection;
- four registered project roots, one of which was provably absent;
- zero inventory transaction or tombstone records;
- two regular-file `current` pointers and zero legacy `current` symlinks, so no
  pointer normalization mutation was required.

Affected metadata was backed up outside the Store without credentials, MCP
definitions, target projections, Card bytes, or generated output:

```text
/Users/pureicis/.drwn-rollout-backups/task81-20260713T171200Z
SHA256SUMS SHA-256 ce411b98926f956a4af4a5c53ca5bf8260c087d64c57d71af146472b7684dbec
```

The provably missing `/private/tmp/cardadd-test` registration was inspected
with `projects unregister --dry-run` and then removed. Its registry file was
backed up first. The remaining three registered roots were readable strict V1
projects, and the package reference scan completed with no references.

The five prescribed live reads then completed without mutation:

1. `machine skill list --json` reported 48 typed entries: two package records,
   27 repository-owned skills, and 19 standalone-owned skills.
2. `machine mcp list --json` reported eight immutable registry definitions and
   zero standalone records.
3. `machine inventory gc --json` reported zero eligible or removed versions,
   two kept current versions, and zero recovered tombstones; `--prune` was not
   used.
4. `status --machine --json` reported 42 resolved skills, one resolved MCP,
   zero missing capabilities, a current healthy projection, and no conflicts or
   issues.
5. `doctor --json` reported zero broken/stale links, MCP drift, missing
   generated output, hook issues, project-config issues, or failed platform
   checks. Recursive diagnostics counted 20 Cards, 21 sources, two skill
   packages, and zero standalone MCP records.

## Project Integrity

Machine selections and `darwinian-cards` project intent/projection bytes were
unchanged across the rollout reads. Before/after SHA-256 values were identical:

| Surface | SHA-256 |
|---|---|
| Machine config | `bba8c5e82fa1a526944a823e2ab89fc4a51c4c966a7285d281a79abc006df784` |
| Project config | `bd8838d3207558b21eb99e14789e5b1521d5d847ba7c76d8de5802185c149eda` |
| Project lock | `b559969aedbe2932aaf1bc50c595a574b97f7e9247356730ad24c69adf719ded` |
| Project write record | `ef4770bf25132a1c7bc630c51fc9b2aa362c6dacf5e423ad57cb373af0aba9ab` |
| Active Worker | `8c801d1795dd607b134f6e76c4926989ba5f7bd20b558083f0e0eef6d2fb8f30` |
| Workers index | `0092454249eaba1df5d07c87e7f489f49745dc419d494b8080357e1cc610d120` |
| Instructions | `f0cd265820adfe2fe1bc311e7bd0e4271e5d9ed3ae53884a169433de10da158c` |
| Worker projection | `f01ce05441d276ed1d47618b0b8fbf452874143a801974c603e2d148c4e7078d` |
| MCP projection | `e9c0596eb135c2278e94b74ac5cc6c7b05505e16bbda06e8f9b1a5fa48fb6be6` |

## Remaining Boundary

Task 82 remains the separate portable machine inventory transfer design. It
must build an explicit allowlisted artifact from Task 81's package and MCP
record types, keep credentials and local state excluded, use only the public
`drwn machine` namespace, and receive explicit format and merge-policy approval
before implementation. Task 81 adds no broad Store export or compatibility
reader in anticipation of that work.

## Acceptance Status

All Task 81 completion gates are satisfied. Mutable ownership is narrow,
commands and persistence follow the approved first-version contract,
reference-sensitive operations fail closed under one lock order, recovery and
GC are bounded, the controlled rollout preserved live intent and projections,
and the complete repository release gate passes.
