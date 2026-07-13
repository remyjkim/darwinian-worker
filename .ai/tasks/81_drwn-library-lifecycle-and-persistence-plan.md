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

Every managed package version is self-describing through its validated bundle
manifest. Lifecycle code computes a canonical payload digest after staging and
again when comparing existing bytes; an existing version is idempotent only
when its manifest identity and complete payload digest match exactly. Local
source paths and credential-bearing source URLs are not persisted.

Standalone MCP records contain definitions and secret references, never
resolved credential values. Add/update applies the existing MCP secret-literal
safety rules before persistence. Inventory list/show output never resolves
environment references or prints credential-store values.

The Store-era paths above are the only supported standalone persistence paths.
Production inventory lifecycle code does not read or write prototype
`~/.agents/skill-packages`, `~/.agents/library`, or whole-inventory MCP files.

### 0.2 Public command grammar

The first supported machine inventory surface is:

```text
drwn machine skill list [--json]
drwn machine skill show <skill-id> [--json]
drwn machine skill show --package <package-name> [--json]
drwn machine skill references <skill-id> [--project <root>...] [--json]
drwn machine skill references --package <package-name> [--project <root>...] [--json]
drwn machine skill install <source> [--as <skill-id>] [--scope <scope>] [--package-name <name>] [--version <semver>] [--dry-run] [--json]
drwn machine skill update <package-name> --from <source> [--as <skill-id>] [--scope <scope>] [--version <semver>] [--project <root>...] [--dry-run] [--json]
drwn machine skill uninstall <package-name> [--project <root>...] [--dry-run] [--json]
drwn machine skill enable <skill-id> [--dry-run] [--json]
drwn machine skill disable <skill-id> [--dry-run] [--json]

drwn machine mcp list [--json]
drwn machine mcp show <server-id> [--json]
drwn machine mcp references <server-id> [--project <root>...] [--json]
drwn machine mcp add <file> --as <server-id> [--dry-run] [--json]
drwn machine mcp update <server-id> --from <file> [--project <root>...] [--dry-run] [--json]
drwn machine mcp remove <server-id> [--project <root>...] [--dry-run] [--json]
drwn machine mcp enable <server-id> [--dry-run] [--json]
drwn machine mcp disable <server-id> [--dry-run] [--json]

drwn machine inventory gc [--prune] [--json]
```

`--scope` accepts only `shared`, `claude-only`, `codex-only`, or
`experimental`. The loose-skill flags are rejected for package sources.
`--package-name` is install-only; update requires the staged package identity to
equal its positional package name. Updating a loose synthetic package requires
an explicit `--version` when its payload changes. A same-version, same-integrity
update is a no-op; a same-version, different-integrity update fails closed.

Skill lookup is deliberately unambiguous: unqualified `show` and `references`
accept only skill IDs, while `--package` selects package identity. Update and
uninstall always accept package identity. `list` emits typed package and skill
entries so callers can discover that relationship without guessing precedence.

`install`/`add` only create inactive inventory. `enable`/`disable` only mutate
explicit machine intent. Skill update and uninstall are package-scoped because
one immutable package can export multiple skill IDs. Every update/uninstall
payload enumerates all exported IDs and all discovered machine/project
references before mutation.

An update that drops or renames an exported skill ID is blocked when that ID is
referenced. Retained skill IDs and same-ID MCP updates may change behavior, so
their known references are disclosed but do not block the update. Removing an
explicit selection that duplicates a profile-owned capability does not make
that capability ineffective; human and JSON output report the remaining
profile provenance.

`library`, `store`, the top-level `skills` namespace, and prototype
machine-default command paths are unregistered ordinary unknown commands. No
moved-command error, warning alias, hidden path, or compatibility release
window is added.

Catalog management moves from `library catalog` to the existing `catalog`
domain as `catalog list|add|refresh|remove`; `catalog validate` remains. Legacy
Store migration, broad seed, status, verify, maintenance GC, and disabled export
commands and the obsolete Library/Store/skills command classes are deleted once
their negative and replacement coverage is in place. Internal Store primitives
and `DRWN_STORE_SEED_PATH` are not public command namespaces and remain
unchanged unless directly required by this task.

### 0.3 Reference model

Standalone references include:

- explicit machine `capabilities.skills` and `capabilities.mcpServers` IDs;
- skill include/exclude IDs in valid committed project config;
- project MCP toggles whose effective definition comes from standalone
  inventory.

Reference discovery scans the strict machine V1 file, every registered project,
and repeated `--project <root>` arguments. Roots are normalized, deduplicated,
and locked in lexical path order. Profile-owned immutable capabilities, inline
project MCP definitions, Card sources, Card locks, generated projections,
write records, target user-home state, and Card-owned capability copies are not
standalone inventory references.

This is a declared known-scope scan, not a filesystem-wide claim. Unregistered
projects are outside the scan unless supplied with `--project`; references and
destructive-command output state the scanned roots and scope explicitly.

A missing, unreadable, malformed, ambiguous, or unsupported registered/project
root fails the scan with `INVENTORY_REFERENCE_SCAN_FAILED`. It is never silently
treated as unreferenced. `drwn projects unregister <root>` atomically removes an
obsolete registration so operators can repair stale registry state before
retrying. It may remove a provably missing root or a valid readable project with
no standalone references. It refuses valid referenced projects and ambiguous,
unreadable, malformed, or unsupported roots; those must be repaired or removed
before unregistering. Explicitly supplied invalid roots always fail.

Registration changes the scanner's safety boundary and is therefore a
reference-sensitive mutation. Every register path acquires inventory then the
project lock before validation and atomic registry persistence. Unregister does
the same for an existing valid root; a provably absent root requires only the
inventory lock so cleanup does not recreate project directories. This prevents
a project with existing standalone references from becoming registered between
an uninstall scan and commit, and prevents concurrent registry writers from
losing one another's updates.

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
the final scan and mutation. Project registration changes acquire inventory and
the affected project lock when the root exists; registry persistence occurs
while inventory remains locked. All registry writers participate, not only
`projects unregister`.

Lock owner records contain an operation UUID, PID, hostname, and creation time.
A live same-host owner returns `INVENTORY_TRANSACTION_BUSY`. A provably dead
same-host owner is quarantined before recovery. Malformed locks, other-host
locks, and ownership changes fail closed. Lock release verifies the operation
UUID. Dry-runs create no managed lock, pointer, tombstone, inventory,
machine, project, registry, or target state. A source-inspecting dry-run may use
an external ephemeral directory, but it must remove that directory before exit.

Network fetch, npm packing, archive extraction, and source copying happen in an
external staging directory before lock acquisition. Staging resolves a concrete
source snapshot and computes its manifest identity and payload digest. The command then acquires
the inventory lock and revalidates the staged snapshot plus mutable package
identity, package version, global skill-ID uniqueness, existing inventory, and
references before committing. It never re-fetches or contacts a remote source
while holding a managed lock.

### 0.5 Persistence and recovery

Skill package versions are immutable. Installing a new version stages complete
bytes, validates and flushes them, and renames the version directory into place.
Existing same-version bytes are accepted only when manifest identity and
complete payload integrity match; differing bytes return
`INVENTORY_IMMUTABLE_VERSION_CONFLICT`. `current` is a regular pointer file
changed through a flushed temporary sibling and atomic rename. File and parent
directory durability is completed before reporting success. New writes and
ordinary inventory reads reject symlink pointers; read-only doctor/rollout
inspection may diagnose them but never follows them as supported state.

Install requires an absent package identity. Update requires an existing
package, stages a matching package identity, scans references to IDs that would
disappear, installs or reuses an immutable version, and changes `current` as its
single logical commit point. A crash after version rename but before pointer
rename may leave an inactive version eligible for later GC; it never changes
the previous current version.

MCP records are complete validated JSON files written through a flushed
temporary sibling and atomic rename. Updating one ID never deletes or rewrites
sibling records. Registry IDs cannot be shadowed by standalone records. Add
requires an absent standalone ID, update requires an existing standalone ID,
and remove requires an existing standalone ID. Definitions are sanitized before
the staged digest is computed and revalidated under the inventory lock.

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
  the regular `current` pointer does not select them and no valid in-progress
  drwn operation owns them.

Current package versions and MCP records are never garbage solely because zero
known references exist. They leave inventory only through explicit uninstall or
remove. GC never touches Card repositories, Card sources, extracted Card trees,
catalog caches, credentials, machine intent, project registration, write
history, generated state, or foreign files. Until a supported exact-version
portable retention contract exists, V1 has no external version roots and no
`--project` GC option. Task 82 may extend retention roots only through a
separately approved format; no external archive is inferred or scanned here.

---

## Task 1: Pin Command and Ownership Contracts

**Files:**

- Create: `test/commands-machine-inventory-shape.test.ts`
- Modify: `test/cli-help-shape.test.ts`

Write failing tests for the exact `machine skill`, `machine mcp`, and
`machine inventory` paths, including `references`, package selectors, explicit
loose-skill options, and update `--project` arguments. Prove old `library`,
`store`, and complete top-level `skills` namespace paths are unknown, do not
emit a compatibility diagnostic, and create no state.
Pin package-scoped skill identity, immutable registry/repository ownership, and
inactive-on-install behavior. Pin the absence of `--force`, `--replace`, and
ambiguous package-or-skill lookup.

```bash
bun test test/commands-machine-inventory-shape.test.ts test/cli-help-shape.test.ts
```

Commit:

```bash
git add test/commands-machine-inventory-shape.test.ts test/cli-help-shape.test.ts
git commit -m "test(machine): pin inventory lifecycle commands"
```

## Task 2: Add the Global Inventory Lock

**Files:**

- Create: `cli/core/owner-lock.ts`
- Create: `cli/core/inventory-lock.ts`
- Modify: `cli/core/project-state-transaction.ts`
- Modify: `cli/core/store-paths.ts`
- Create: `test/core-inventory-lock.test.ts`

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
git add cli/core/owner-lock.ts cli/core/inventory-lock.ts cli/core/project-state-transaction.ts cli/core/store-paths.ts test/core-inventory-lock.test.ts
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
- Create: `test/scenarios-project-registry-races.test.ts`

Define standalone package and MCP record views with owner, exported IDs,
version, active path, and integrity/provenance fields needed by lifecycle
commands. Integrity is derived from validated bytes rather than trusted stored
metadata.
Implement provenance-aware machine/project scanning under the lock protocol.
Add `projects unregister <root> [--dry-run] [--json]` using normalized exact
paths and atomic registry persistence. Route every `registerProject` and
`unregisterProject` caller through inventory-to-project locking, validation, and
one read-modify-write of `projects.json`; do not protect only the public
unregister command.

Tests cover machine refs, committed project refs, registered plus explicit
roots, deduplication, Card/profile/non-standalone exclusions, inline MCP
definitions, known-scope disclosure, stale paths, malformed config, unreadable
roots, safe registry repair, referenced-project unregister refusal, concurrent
register/unregister lost-update prevention, and redacted deterministic JSON.

```bash
bun test test/core-inventory-references.test.ts test/commands-projects.test.ts test/scenarios-project-registry-races.test.ts
bun run typecheck
```

Commit:

```bash
git add cli/core/inventory.ts cli/core/inventory-references.ts cli/core/library.ts cli/core/project-registry.ts cli/commands/projects.ts test/core-inventory-references.test.ts test/commands-projects.test.ts test/scenarios-project-registry-races.test.ts
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
branches. Compute a canonical complete-tree digest and revalidate the staged
digest, package identity, and every exported ID under the inventory lock without
remote I/O. Never replace version bytes; atomically move a new immutable version
and atomically update the regular `current` pointer. Add package-scoped
uninstall through a validated tombstone.

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
- Create: `cli/core/mcp-secret-policy.ts`
- Modify: `cli/core/card-capture.ts`
- Modify: `test/core-mcp-library.test.ts`
- Modify: `test/core-card-capture.test.ts`
- Create: `test/core-mcp-inventory-lifecycle.test.ts`

Remove whole-inventory and prototype-file persistence. Add record-level load,
create, update, and tombstone-remove operations. Validate complete bytes before
the lock, apply the shared secret-reference policy, then revalidate ID ownership,
the staged digest, and current bytes under the lock. Extract the existing Card
capture sanitizer into the shared policy without weakening its behavior. Use
atomic sibling replacement and never delete sibling records.

Failure injection proves previous bytes and every sibling survive interrupted
add/update/remove. Read-only mode, built-in ID collisions, malformed records,
path traversal, and tombstone recovery fail closed.

```bash
bun test test/core-mcp-library.test.ts test/core-card-capture.test.ts test/core-mcp-inventory-lifecycle.test.ts
bun run typecheck
```

Commit:

```bash
git add cli/core/mcp-library.ts cli/core/mcp-secret-policy.ts cli/core/card-capture.ts test/core-mcp-library.test.ts test/core-card-capture.test.ts test/core-mcp-inventory-lifecycle.test.ts
git commit -m "feat(machine): persist MCP inventory by record"
```

## Task 5A: Reconcile Already-Landed Foundations

Commits `466ed8d`, `8aed61c`, and `b9da289` landed while the approved plan was
being reviewed. Before registering any machine inventory command, compare those
commits with the current sections 0.1-0.5 and close every difference. In
particular:

- make all project-registry writers use inventory-to-project locking and one
  locked read-modify-write;
- enforce the safe unregister conditions rather than allowing unregister to
  hide a valid or ambiguous reference;
- disclose known scan scope and redact provenance consistently;
- preserve complete-tree digest comparison and forbid remote I/O under locks;
- replace prototype `replace` booleans with distinct install/update core
  operations and their absent/existing identity preconditions;
- apply the shared MCP secret-reference policy; and
- make source-inspecting dry-runs clean external ephemeral state while creating
  no managed state.

Run the complete Task 1-5 targeted suite after reconciliation, including the
new registry-race and Card-capture tests. Commit any correction separately:

```bash
git add cli/core/project-registry.ts cli/core/inventory-references.ts cli/commands/projects.ts cli/core/skill-packages.ts cli/core/mcp-library.ts cli/core/mcp-secret-policy.ts cli/core/card-capture.ts test/commands-projects.test.ts test/core-inventory-references.test.ts test/scenarios-project-registry-races.test.ts test/core-skill-packages.test.ts test/core-mcp-library.test.ts test/core-mcp-inventory-lifecycle.test.ts test/core-card-capture.test.ts
git commit -m "fix(machine): align inventory foundations with approved contract"
```

## Task 6: Implement Machine Skill and MCP Commands

**Files:**

- Create: `cli/commands/machine/skill.ts`
- Create: `cli/commands/machine/mcp.ts`
- Move: `cli/commands/library/catalog.ts` -> `cli/commands/catalog/manage.ts`
- Modify: `cli/core/defaults.ts`
- Modify: `cli/core/machine-config.ts`
- Modify: `cli/index.ts`
- Create: `test/commands-machine-skill.test.ts`
- Create: `test/commands-machine-mcp.test.ts`
- Modify: `test/commands-skills-mutate.test.ts`
- Delete: `cli/commands/library/add/mcp.ts`
- Delete: `cli/commands/library/add/skill.ts`
- Delete: `cli/commands/library/defaults/add-mcp.ts`
- Delete: `cli/commands/library/defaults/add-skill.ts`
- Delete: `cli/commands/library/defaults/list.ts`
- Delete: `cli/commands/library/defaults/remove-mcp.ts`
- Delete: `cli/commands/library/defaults/remove-skill.ts`
- Delete: `cli/commands/library/list.ts`
- Delete: `cli/commands/library/show.ts`
- Delete: `cli/commands/skills/list.ts`
- Delete: `cli/commands/skills/packages/add.ts`
- Delete: `cli/commands/skills/packages/list.ts`
- Delete: `cli/commands/skills/packages/show.ts`
- Delete: `cli/commands/store/export.ts`
- Delete: `cli/commands/store/gc.ts`
- Delete: `cli/commands/store/migrate-to-git.ts`
- Delete: `cli/commands/store/migrate.ts`
- Delete: `cli/commands/store/seed.ts`
- Delete: `cli/commands/store/status.ts`
- Delete: `cli/commands/store/verify.ts`
- Delete: `test/commands-library-defaults.test.ts`
- Delete: `test/commands-library.test.ts`
- Delete: `test/commands-skills-list.test.ts`
- Delete: `test/commands-skills-packages.test.ts`
- Delete: `test/commands-store-gc.test.ts`
- Delete: `test/commands-store-maintenance.test.ts`
- Delete: `test/commands-store-migrate-to-git.test.ts`
- Delete: `test/commands-store-seed.test.ts`
- Delete: `test/commands-store.test.ts`

Implement the exact grammar from section 0.2. List/show distinguish immutable
discovery inputs from managed standalone records. Install/add never enable.
Enable/disable acquire inventory then machine lock, reload strict machine V1,
validate availability, write atomically, and are idempotent. Update/uninstall
and update/remove expose known-scope references and use the approved
block/tombstone rules. Implement explicit skill-vs-package lookup and
`references` for both resources. Machine disable reports profile provenance
when removing a duplicate explicit selection leaves the capability effective.
There is no `--force`, `--replace`, or compatibility alias.

Update `cli/index.ts` only after target tests are red. Unregister old Library,
Store, and top-level skills command classes, then delete their dead source files
and superseded positive command tests. Move catalog lifecycle classes to
`cli/commands/catalog/manage.ts` and keep their existing behavior/tests. The new
shape test is the sole negative compatibility assertion; production does not
retain dormant obsolete command implementations.

```bash
bun test test/commands-machine-inventory-shape.test.ts test/commands-machine-skill.test.ts test/commands-machine-mcp.test.ts test/commands-skills-mutate.test.ts test/commands-card-catalog.test.ts
bun run typecheck
```

Commit:

```bash
git add -A cli/commands/library cli/commands/store cli/commands/skills cli/commands/catalog/manage.ts cli/commands/machine/skill.ts cli/commands/machine/mcp.ts cli/core/defaults.ts cli/core/machine-config.ts cli/index.ts test/commands-machine-inventory-shape.test.ts test/commands-machine-skill.test.ts test/commands-machine-mcp.test.ts test/commands-skills-mutate.test.ts test/commands-card-catalog.test.ts test/commands-library-defaults.test.ts test/commands-library.test.ts test/commands-skills-list.test.ts test/commands-skills-packages.test.ts test/commands-store-gc.test.ts test/commands-store-maintenance.test.ts test/commands-store-migrate-to-git.test.ts test/commands-store-seed.test.ts test/commands-store.test.ts
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
missing inventory. Make the exported project-write helpers asynchronous and
lock-aware so alternate callers cannot bypass the command-layer protocol.

Deterministic race tests prove uninstall cannot pass while enable/add is in
flight, add cannot reference an inventory item being removed, lock order never
inverts, project registration cannot become visible between uninstall scan and
commit, concurrent registry writers do not lose updates, and unrelated
Card/project mutations retain their current behavior.

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
young inactive versions, live operation evidence, invalid manifests, digest
failures, and malformed or symlink pointers fail closed or remain explicitly
kept. V1 does not scan projects or invent an exact-version external lock format.

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
known-scope references, package-vs-skill selectors, lock ordering, safe stale
registration repair, immutable payload digests, MCP secret-reference policy,
record-level MCP persistence, tombstone recovery, dry-run GC, and Task 82's
separate portable-transfer boundary.

The release gate rejects registered or dormant command implementations for
`library`, `store`, and the top-level `skills` namespace; prototype inventory
readers/writers; whole-MCP rewrites; mutable package version replacement;
incomplete digest comparison; replace-mode core APIs; non-atomic or symlink
pointers; per-record mutation locks; unlocked registry writers; missing
reference locks; force-unresolved removal; current-record GC; and Store-root
archive creation. It requires the new commands, `references` surfaces, and
old-path negative tests.

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

Before changing live machine inventory, inspect the filesystem without invoking
normal inventory readers and record a non-secret inventory of current skill
packages, MCP record IDs, machine references, registered project roots, and
existing pointer forms. Back up affected inventory metadata outside the Store;
never include credentials, MCP secret values, target projections, or Card
content.

Run command-shape smoke tests against an isolated fixture. Then inspect the live
machine without mutation. Normal V1 reads do not follow pre-contract symlinks.
For each proven drwn-owned `current` symlink, record and validate that its target
is one strict-semver child directory with a valid manifest, then replace it with
a flushed regular pointer through a one-off controlled operation. Do not add a
production compatibility reader and do not claim foreign state. Only after
normalization run:

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
- [ ] Obsolete Library, Store, and top-level skills command paths and dead command classes are removed without aliases.
- [ ] Skill update/uninstall are package-scoped and enumerate every affected skill ID.
- [ ] Skill/MCP `references` report their declared known scope and package lookup is unambiguous.
- [ ] Removal blocks on any valid explicit machine/project reference and has no force bypass.
- [ ] Invalid registered/project roots fail closed and `projects unregister` cannot hide a valid reference or ambiguous root.
- [ ] One global inventory mutation lock enforces inventory-to-machine-to-project ordering.
- [ ] Reference-creating/removing machine, project, and project-registry commands participate in that lock protocol.
- [ ] Network/source staging occurs before locking and all state is revalidated under lock.
- [ ] Package versions are complete-tree immutable and `current` changes atomically.
- [ ] MCP mutations replace one atomic record without deleting siblings.
- [ ] MCP inventory stores secret references rather than resolved credential values.
- [ ] Interrupted removal is recoverable through validated tombstones.
- [ ] GC is dry-run by default and never deletes current inventory due to zero references.
- [ ] Project declarations, machine profile policy, Card content, remote deploy V1, and Store export security remain isolated.
- [ ] Controlled rollout and full typecheck, test, docs, release, and diff gates pass.

Task 82 portable machine inventory transfer remains separate. It must use the
new machine inventory types and public namespace, remain allowlist-built, and
receive explicit format/merge approval before implementation.
