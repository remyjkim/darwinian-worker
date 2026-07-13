# ABOUTME: Approved machine inventory lifecycle, reference safety, and scoped persistence implementation plan.
# ABOUTME: Replaces obsolete Library/Store command namespaces with the first supported machine inventory contract.

# Task 81: Machine Inventory Lifecycle and Persistence Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans`,
> `test-driven-development`, `incremental-commits`, and
> `verification-before-completion`. Work in the primary checkout on a feature
> branch; do not create a worktree.

**Status:** Approved and execution-ready on 2026-07-13

**Goal:** Give drwn-managed standalone skill packages and MCP records complete,
reference-safe lifecycle behavior under the first supported `drwn machine`
command contract.

**Architecture:** Machine inventory is inactive reusable content. One global
inventory mutation lock serializes uniqueness checks, package pointer changes,
MCP record replacement, reference-sensitive machine/project mutations, and GC.
Network and archive preparation happens before that lock; all state is
revalidated after acquisition. Package versions are immutable, activation uses
an atomic `current` pointer, MCP definitions are atomic per-record files, and
uninstall uses recoverable tombstones.

**Execution branch:** `feat/task-81-inventory-lifecycle`

**Dependencies:**

- Task 77 strict project V1 state and project config/lock transactions are complete.
- Task 79 keeps whole-Store export unavailable.
- Task 80 strict machine V1 intent and ownership-recorded projection are complete.
- Task 83 target-native ambient MCP policy is complete.

**Non-goals:** Card-owned content, Card/extracted-tree GC, machine profile
policy, portable transfer, full-machine backup, compatibility aliases, and
remote deploy payload changes.

---

## 0. Approved Contract

### 0.1 Managed inventory and ownership

First-class mutable inventory is limited to:

1. drwn-managed standalone skill packages under `~/.agents/drwn/skills`,
   including synthetic single-skill packages created from loose skills;
2. drwn-managed standalone MCP records under
   `~/.agents/drwn/mcp-servers`.

Repository skills and bundled registry MCP definitions are immutable discovery
inputs. They may be selected but cannot be updated, uninstalled, or removed by
machine inventory commands. Card-owned capability bytes are owned only by Card
commands. Card construction copies standalone capabilities into a Card source;
it does not retain a live inventory dependency.

The Store-era paths above are the only supported standalone persistence paths.
Production inventory lifecycle code does not read or write prototype
`~/.agents/skill-packages`, `~/.agents/library`, or whole-inventory MCP files.

### 0.2 Public command grammar

The first supported machine inventory surface is:

```text
drwn machine skill list [--json]
drwn machine skill show <skill-id|package-name> [--json]
drwn machine skill install <source> [loose-skill options] [--dry-run] [--json]
drwn machine skill update <package-name> --from <source> [loose-skill options] [--dry-run] [--json]
drwn machine skill uninstall <package-name> [--project <root>...] [--dry-run] [--json]
drwn machine skill enable <skill-id> [--dry-run] [--json]
drwn machine skill disable <skill-id> [--dry-run] [--json]

drwn machine mcp list [--json]
drwn machine mcp show <server-id> [--json]
drwn machine mcp add <file> --as <server-id> [--dry-run] [--json]
drwn machine mcp update <server-id> --from <file> [--dry-run] [--json]
drwn machine mcp remove <server-id> [--project <root>...] [--dry-run] [--json]
drwn machine mcp enable <server-id> [--dry-run] [--json]
drwn machine mcp disable <server-id> [--dry-run] [--json]

drwn machine inventory gc [--project <root>...] [--prune] [--json]
```

`install`/`add` only create inactive inventory. `enable`/`disable` only mutate
explicit machine intent. Skill update and uninstall are package-scoped because
one immutable package can export multiple skill IDs. Every update/uninstall
payload enumerates all exported IDs and all discovered machine/project
references before mutation.

`library`, `store`, `skills packages`, and prototype machine-default command
paths are unregistered ordinary unknown commands. No moved-command error,
warning alias, hidden path, or compatibility release window is added.

Catalog management moves from `library catalog` to the existing `catalog`
domain as `catalog list|add|refresh|remove`; `catalog validate` remains. Legacy
Store migration, broad seed, status, verify, maintenance GC, and disabled export
commands are removed from registration. Internal Store primitives and
`DRWN_STORE_SEED_PATH` are not public command namespaces and remain unchanged
unless directly required by this task.

### 0.3 Reference model

Standalone references include:

- explicit machine `capabilities.skills` and `capabilities.mcpServers` IDs;
- skill include/exclude IDs in valid committed or local project config;
- project MCP toggles whose effective definition comes from standalone
  inventory.

Reference discovery scans the strict machine V1 file, every registered project,
and repeated `--project <root>` arguments. Roots are normalized, deduplicated,
and locked in lexical path order. Profile-owned immutable capabilities, inline
project MCP definitions, Card sources, Card locks, generated projections,
write records, target user-home state, and Card-owned capability copies are not
standalone inventory references.

A missing, unreadable, malformed, ambiguous, or unsupported registered/project
root fails the scan with `INVENTORY_REFERENCE_SCAN_FAILED`. It is never silently
treated as unreferenced. `drwn projects unregister <root>` atomically removes an
obsolete registration so operators can repair stale registry state before
retrying. Explicitly supplied invalid roots always fail.

Referenced inventory cannot be removed. V1 has no force option that knowingly
leaves unresolved intent. `INVENTORY_ITEM_IN_USE` reports the package/record,
all affected IDs, and redacted reference provenance without changing bytes.

### 0.4 Locking and concurrency

V1 uses one global inventory mutation lock, not independent record locks.
Package mutations span immutable versions, the `current` pointer, all exported
IDs, and global uniqueness validation; MCP and skill mutations must therefore
observe one inventory snapshot.

The fixed acquisition order is:

```text
inventory lock -> machine lock -> project locks sorted by normalized root
```

No code may acquire an earlier lock while holding a later one. Inventory-only
mutations stop after the first lock. Machine enable/disable acquires inventory
then machine. Project commands that create or remove standalone references
acquire inventory before their project transaction lock. Reference-sensitive
uninstall acquires inventory, machine, and every scanned project lock before
the final scan and mutation.

Lock owner records contain an operation UUID, PID, hostname, and creation time.
A live same-host owner returns `INVENTORY_TRANSACTION_BUSY`. A provably dead
same-host owner is quarantined before recovery. Malformed locks, other-host
locks, and ownership changes fail closed. Lock release verifies the operation
UUID. Dry-runs create no lock, journal, staging, tombstone, or target state.

Network fetch, npm packing, archive extraction, and source copying happen in an
external staging directory before lock acquisition. The command then acquires
the inventory lock and revalidates source identity, package version,
integrity/content, global skill-ID uniqueness, existing inventory, and
references before committing.

### 0.5 Persistence and recovery

Skill package versions are immutable. Installing a new version stages complete
bytes, validates them, and renames the version directory into place. Existing
same-version bytes are accepted only when integrity-identical; differing bytes
return `INVENTORY_IMMUTABLE_VERSION_CONFLICT`. `current` is a regular pointer
file changed through a flushed temporary sibling and atomic rename. New writes
do not create symlink pointers, although the read-only doctor may diagnose
pre-contract symlinks.

MCP records are complete validated JSON files written through a flushed
temporary sibling and atomic rename. Updating one ID never deletes or rewrites
sibling records. Registry IDs cannot be shadowed by standalone records.

Removal first revalidates that no reference exists, then atomically renames the
package root or MCP file into an operation-owned tombstone. Recursive cleanup
happens after the logical removal. A crash before rename preserves current
inventory; a crash after rename leaves absent inventory plus a recoverable
tombstone. Startup mutation recovery and inventory GC remove only valid
operation-owned tombstones. Foreign or malformed tombstones fail closed.

### 0.6 GC

`drwn machine inventory gc` is dry-run by default. `--prune` may remove only:

- abandoned drwn temporary siblings older than 24 hours;
- valid completed inventory tombstones;
- superseded inactive immutable package versions older than 30 days, only when
  no live lock, transaction journal, current pointer, or supported exact-version
  lock reference retains them.

Current package versions and MCP records are never garbage solely because zero
known references exist. They leave inventory only through explicit uninstall or
remove. GC never touches Card repositories, Card sources, extracted Card trees,
catalog caches, credentials, machine intent, project registration, write
history, generated state, or foreign files. Until a supported exact-version
portable lock exists, no external archive is inferred or scanned.

---

## Task 1: Pin Command and Ownership Contracts

**Files:**

- Create: `test/commands-machine-inventory-shape.test.ts`
- Modify: `test/cli-help-shape.test.ts`
- Modify: `test/commands-library.test.ts`
- Modify: `test/commands-store.test.ts`
- Modify: `test/commands-store-maintenance.test.ts`

Write failing tests for the exact `machine skill`, `machine mcp`, and
`machine inventory` paths. Prove old `library`, `store`, and `skills packages`
paths are unknown, do not emit a compatibility diagnostic, and create no state.
Pin package-scoped skill identity, immutable registry/repository ownership, and
inactive-on-install behavior.

```bash
bun test test/commands-machine-inventory-shape.test.ts test/cli-help-shape.test.ts
```

Commit:

```bash
git add test/commands-machine-inventory-shape.test.ts test/cli-help-shape.test.ts test/commands-library.test.ts test/commands-store.test.ts test/commands-store-maintenance.test.ts
git commit -m "test(machine): pin inventory lifecycle commands"
```

## Task 2: Add the Global Inventory Lock

**Files:**

- Create: `cli/core/owner-lock.ts`
- Create: `cli/core/inventory-lock.ts`
- Modify: `cli/core/project-state-transaction.ts`
- Modify: `cli/core/machine-config.ts`
- Modify: `cli/core/store-paths.ts`
- Create: `test/core-inventory-lock.test.ts`
- Modify: `test/core-project-state-transaction.test.ts`

Factor the proven owner identity, exclusive creation, dead-owner quarantine,
ownership-checked release, and test checkpoints into a reusable primitive
without weakening project transaction recovery. Add inventory and machine lock
paths plus helpers implementing the fixed order. Add tests for live contention,
dead same-host recovery, malformed/foreign-owner refusal, release ownership,
reentrant inversion refusal, sorted project locking, dry-run purity, and
failure cleanup.

```bash
bun test test/core-inventory-lock.test.ts test/core-project-state-transaction.test.ts
bun run typecheck
```

Commit:

```bash
git add cli/core/owner-lock.ts cli/core/inventory-lock.ts cli/core/project-state-transaction.ts cli/core/machine-config.ts cli/core/store-paths.ts test/core-inventory-lock.test.ts test/core-project-state-transaction.test.ts
git commit -m "feat(machine): serialize inventory mutations"
```

## Task 3: Build Typed Inventory and Fail-Closed References

**Files:**

- Create: `cli/core/inventory.ts`
- Create: `cli/core/inventory-references.ts`
- Modify: `cli/core/library.ts`
- Modify: `cli/core/project-registry.ts`
- Modify: `cli/commands/projects.ts`
- Create: `test/core-inventory-references.test.ts`
- Modify: `test/commands-projects.test.ts`

Define standalone package and MCP record views with owner, exported IDs,
version, active path, and integrity/provenance needed by lifecycle commands.
Implement provenance-aware machine/project scanning under the lock protocol.
Add `projects unregister <root> [--dry-run] [--json]` using normalized exact
paths and atomic registry persistence.

Tests cover machine refs, committed/local project refs, registered plus explicit
roots, deduplication, Card/profile/non-standalone exclusions, inline MCP
definitions, stale paths, malformed config, unreadable roots, registry repair,
and redacted deterministic JSON.

```bash
bun test test/core-inventory-references.test.ts test/commands-projects.test.ts
bun run typecheck
```

Commit:

```bash
git add cli/core/inventory.ts cli/core/inventory-references.ts cli/core/library.ts cli/core/project-registry.ts cli/commands/projects.ts test/core-inventory-references.test.ts test/commands-projects.test.ts
git commit -m "feat(machine): discover inventory references"
```

## Task 4: Make Skill Package Persistence Immutable

**Files:**

- Modify: `cli/core/skill-packages.ts`
- Modify: `cli/core/fs.ts`
- Create: `cli/core/inventory-tombstones.ts`
- Modify: `test/core-skill-packages.test.ts`
- Create: `test/core-inventory-tombstones.test.ts`

Split network/source staging from locked commit. Remove prototype persistence
branches. Revalidate package identity and every exported ID under the inventory
lock. Never replace version bytes; atomically move a new immutable version and
atomically update the regular `current` pointer. Add package-scoped uninstall
through a validated tombstone.

Failure injection covers every stage before/after version rename, pointer
rename, tombstone rename, and cleanup. Previous current bytes survive all
pre-commit failures; post-commit states are valid and recoverable; no unrelated
package or foreign tombstone changes.

```bash
bun test test/core-skill-packages.test.ts test/core-inventory-tombstones.test.ts
bun run typecheck
```

Commit:

```bash
git add cli/core/skill-packages.ts cli/core/fs.ts cli/core/inventory-tombstones.ts test/core-skill-packages.test.ts test/core-inventory-tombstones.test.ts
git commit -m "feat(machine): make skill packages immutable"
```

## Task 5: Make MCP Persistence Record-Scoped

**Files:**

- Modify: `cli/core/mcp-library.ts`
- Modify: `test/core-mcp-library.test.ts`
- Create: `test/core-mcp-inventory-lifecycle.test.ts`

Remove whole-inventory and prototype-file persistence. Add record-level load,
create, update, and tombstone-remove operations. Validate complete bytes before
the lock, then revalidate ID ownership and current bytes under the lock. Use
atomic sibling replacement and never delete sibling records.

Failure injection proves previous bytes and every sibling survive interrupted
add/update/remove. Read-only mode, built-in ID collisions, malformed records,
path traversal, and tombstone recovery fail closed.

```bash
bun test test/core-mcp-library.test.ts test/core-mcp-inventory-lifecycle.test.ts
bun run typecheck
```

Commit:

```bash
git add cli/core/mcp-library.ts test/core-mcp-library.test.ts test/core-mcp-inventory-lifecycle.test.ts
git commit -m "feat(machine): persist MCP inventory by record"
```

## Task 6: Implement Machine Skill and MCP Commands

**Files:**

- Create: `cli/commands/machine/skill.ts`
- Create: `cli/commands/machine/mcp.ts`
- Modify: `cli/core/defaults.ts`
- Modify: `cli/core/machine-config.ts`
- Modify: `cli/index.ts`
- Create: `test/commands-machine-skill.test.ts`
- Create: `test/commands-machine-mcp.test.ts`
- Modify: `test/commands-library-defaults.test.ts`
- Modify: `test/commands-library.test.ts`

Implement the exact grammar from section 0.2. List/show distinguish immutable
discovery inputs from managed standalone records. Install/add never enable.
Enable/disable acquire inventory then machine lock, reload strict machine V1,
validate availability, write atomically, and are idempotent. Update/uninstall
and update/remove expose references and use the approved block/tombstone rules.
There is no `--force`, `--replace`, or compatibility alias.

Update `cli/index.ts` only after target tests are red. Unregister old Library,
Store, and skills-package command classes rather than changing their hidden
paths. Move catalog lifecycle classes to `catalog` paths and keep their existing
behavior/tests.

```bash
bun test test/commands-machine-inventory-shape.test.ts test/commands-machine-skill.test.ts test/commands-machine-mcp.test.ts test/commands-library-defaults.test.ts test/commands-library.test.ts test/commands-card-catalog.test.ts
bun run typecheck
```

Commit:

```bash
git add cli/commands/machine/skill.ts cli/commands/machine/mcp.ts cli/core/defaults.ts cli/core/machine-config.ts cli/index.ts cli/commands/library/catalog.ts test/commands-machine-inventory-shape.test.ts test/commands-machine-skill.test.ts test/commands-machine-mcp.test.ts test/commands-library-defaults.test.ts test/commands-library.test.ts test/commands-card-catalog.test.ts
git commit -m "feat(machine): add inventory lifecycle commands"
```

## Task 7: Serialize Project Reference Mutations

**Files:**

- Modify: `cli/core/project-writes.ts`
- Modify: `cli/commands/add/skill.ts`
- Modify: `cli/commands/add/mcp.ts`
- Modify: `test/commands-add-skill.test.ts`
- Modify: `test/commands-add-mcp.test.ts`
- Create: `test/scenarios-inventory-reference-races.test.ts`

Replace direct synchronous project config writes for standalone skill/MCP
activation with inventory-lock-first project transactions. Automatic package
installation stages network work before locking, commits inventory under the
lock, then commits project intent while retaining the same lock. A project
failure may leave valid inactive inventory but never a project reference to
missing inventory.

Deterministic race tests prove uninstall cannot pass while enable/add is in
flight, add cannot reference an inventory item being removed, lock order never
inverts, and unrelated Card/project mutations retain their current behavior.

```bash
bun test test/commands-add-skill.test.ts test/commands-add-mcp.test.ts test/scenarios-inventory-reference-races.test.ts
bun run typecheck
```

Commit:

```bash
git add cli/core/project-writes.ts cli/commands/add/skill.ts cli/commands/add/mcp.ts test/commands-add-skill.test.ts test/commands-add-mcp.test.ts test/scenarios-inventory-reference-races.test.ts
git commit -m "fix(project): serialize inventory references"
```

## Task 8: Add Scoped Inventory GC

**Files:**

- Create: `cli/core/inventory-gc.ts`
- Create: `cli/commands/machine/inventory.ts`
- Modify: `cli/index.ts`
- Create: `test/core-inventory-gc.test.ts`
- Create: `test/commands-machine-inventory-gc.test.ts`

Implement section 0.6 exactly. Planning is read-only and deterministic. Prune
acquires the inventory lock, recovers valid tombstones, re-plans from current
state, and removes only still-eligible paths. Foreign paths, active versions,
young inactive versions, live transaction evidence, malformed pointers, and
unknown exact-version locks fail closed or remain explicitly kept.

```bash
bun test test/core-inventory-gc.test.ts test/commands-machine-inventory-gc.test.ts
bun run typecheck
```

Commit:

```bash
git add cli/core/inventory-gc.ts cli/commands/machine/inventory.ts cli/index.ts test/core-inventory-gc.test.ts test/commands-machine-inventory-gc.test.ts
git commit -m "feat(machine): add guarded inventory garbage collection"
```

## Task 9: Publish the Machine Inventory Contract

**Files:**

- Modify: `.ai/analyses/116_drwn-cli-card-worker-target-architecture.md`
- Modify: `README.md`
- Modify: `docs/cli-quickref.md`
- Modify: `docs/contracts/project-worker-v1.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/03_npm-skill-bundles-guide.md`
- Modify: `.ai/knowledges/04_homebrew-release-checklist.md`
- Modify: `.ai/knowledges/09_cards-manual-test-guide.md`
- Modify: `.ai/knowledges/10_drwn-cli-architecture.md`
- Modify: `scripts/verify-release-readiness.ts`
- Create: `test/scripts-verify-machine-inventory-contract.test.ts`
- Modify: `test/docs-readiness.test.ts`

Replace the public Library/Store mental model with machine inventory. Document
ownership, inactivity, package-scoped operations, exact command grammar,
references, lock ordering, stale registration repair, immutable versions,
record-level MCP persistence, tombstone recovery, dry-run GC, and Task 82's
separate portable-transfer boundary.

The release gate rejects registered `library`, `store`, and `skills packages`
paths; prototype inventory readers/writers; whole-MCP rewrites; mutable package
version replacement; non-atomic pointers; per-record mutation locks; missing
reference locks; force-unresolved removal; current-record GC; and Store-root
archive creation. It requires the new commands and old-path negative tests.

```bash
bun test test/scripts-verify-machine-inventory-contract.test.ts test/docs-readiness.test.ts test/cli-help-shape.test.ts
bun run docs:build
bun run typecheck
```

Commit:

```bash
git add .ai/analyses/116_drwn-cli-card-worker-target-architecture.md README.md docs/cli-quickref.md docs/contracts/project-worker-v1.md .ai/knowledges/01_agents-cli-usage-guide.md .ai/knowledges/03_npm-skill-bundles-guide.md .ai/knowledges/04_homebrew-release-checklist.md .ai/knowledges/09_cards-manual-test-guide.md .ai/knowledges/10_drwn-cli-architecture.md scripts/verify-release-readiness.ts test/scripts-verify-machine-inventory-contract.test.ts test/docs-readiness.test.ts test/cli-help-shape.test.ts
git commit -m "docs(machine): publish the inventory lifecycle contract"
```

## Task 10: Controlled Rollout and Completion

Before changing live machine inventory, record a non-secret inventory of current
skill packages, MCP record IDs, machine references, registered project roots,
and existing pointer forms. Back up affected inventory metadata outside the
Store; never include credentials, MCP secret values, target projections, or Card
content.

Run command-shape smoke tests against an isolated fixture. Then inspect the live
machine without mutation. Convert only proven drwn-owned current symlink
pointers to atomic regular pointer files; do not claim foreign state. Run:

```text
drwn machine skill list --json
drwn machine mcp list --json
drwn machine inventory gc --json
drwn status --machine --json
drwn doctor --json
```

Verify machine selections and `darwinian-cards` project intent/projection hashes
remain unchanged. Do not run `--prune` on the live machine during rollout.

Final gates:

```bash
bun run typecheck
bun test
bun run docs:build
bun run verify:release --json
git diff --check
```

Create `.ai/tasks/81_completion_machine-inventory-lifecycle.md` with commits,
command contract, lock/recovery evidence, controlled rollout inventory, exact
test counts/skips, and remaining Task 82 boundaries. Commit completion evidence
separately.

---

## Completion Gates

- [ ] Only drwn-managed standalone packages and MCP records are mutable inventory.
- [ ] Repository/registry discovery inputs and Card-owned content are immutable through machine inventory commands.
- [ ] Public lifecycle commands use only `drwn machine skill|mcp|inventory`.
- [ ] Obsolete Library, Store, and skills-package command paths are unregistered without aliases.
- [ ] Skill update/uninstall are package-scoped and enumerate every affected skill ID.
- [ ] Removal blocks on any valid explicit machine/project reference and has no force bypass.
- [ ] Invalid registered/project roots fail closed and `projects unregister` repairs stale registrations.
- [ ] One global inventory mutation lock enforces inventory-to-machine-to-project ordering.
- [ ] Reference-creating/removing machine and project commands participate in that lock protocol.
- [ ] Network/source staging occurs before locking and all state is revalidated under lock.
- [ ] Package versions are immutable and `current` changes atomically.
- [ ] MCP mutations replace one atomic record without deleting siblings.
- [ ] Interrupted removal is recoverable through validated tombstones.
- [ ] GC is dry-run by default and never deletes current inventory due to zero references.
- [ ] Project declarations, machine profile policy, Card content, remote deploy V1, and Store export security remain isolated.
- [ ] Controlled rollout and full typecheck, test, docs, release, and diff gates pass.

Task 82 portable machine inventory transfer remains separate. It must use the
new machine inventory types and public namespace, remain allowlist-built, and
receive explicit format/merge approval before implementation.
