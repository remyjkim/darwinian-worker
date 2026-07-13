# ABOUTME: Completion evidence for Task 82's portable standalone machine inventory transfer.
# ABOUTME: Records the strict format, additive sync safety, security boundaries, and final verification.

# Task 82 Completion: Portable Machine Inventory Transfer

**Status:** Completed
**Completed:** 2026-07-13
**Plan:** `.ai/tasks/82_drwn-portable-machine-inventory-transfer-plan.md`
**Implementation branch:** `feat/task-81-inventory-lifecycle`
**Execution model:** Primary checkout only; no isolated worktree
**Implementation commit:** `c07fc05 feat(machine): add portable inventory transfer`

---

## Outcome

Task 82 adds the first supported portable transfer contract for active,
drwn-managed standalone inventory:

- `drwn machine inventory export` writes canonical metadata only;
- `drwn machine inventory bundle` writes that exact manifest plus active
  standalone skill-package and MCP bytes;
- `drwn machine inventory verify` validates an artifact and exits zero only for
  an exact local inventory match;
- `drwn machine inventory sync` accepts only a byte-carrying bundle, blocks all
  known conflicts, and installs only missing inactive records;
- target extras and identical records are preserved;
- transfer never changes machine intent, profiles, project state, Cards,
  generated projections, targets, or remote deploy payloads;
- whole-Store export remains unavailable.

The strict local schema is `drwn.portable-inventory` V1. There are no legacy
readers, compatibility aliases, replacement flags, destructive sync modes, URL
inputs, or stdin/stdout artifact modes.

## Deterministic Format

Manifest serialization recursively sorts object keys with a locale-independent
comparator, preserves array order, uses UTF-8, two-space indentation, LF, and
one trailing newline. Entries are ordered by package then MCP identity, and
payload paths are opaque positional paths.

Bundles are deterministic level-9 gzip tar files with a canonical zero-time
gzip header and normalized OS byte. Tar members are emitted in lexical POSIX
path order with normalized modes, zero ownership, empty owner names, and no
timestamps. The embedded manifest is byte-identical to `export` output.

The focused and isolated E2E suites prove that two unchanged exports and two
unchanged bundles are byte-identical. Human and JSON results expose SHA-256
manifest and archive digests. Those digests detect corruption; they do not
provide authenticity, signing, provenance, or publisher trust.

## Security Boundary

Bundle construction starts from typed Task 81 active package and MCP records.
It never walks `~/.agents/drwn` and never subtractively filters a broad Store
archive. Credentials, machine and project intent, registrations, Cards,
profiles, generated state, target files, history, caches, inactive versions,
locks, tombstones, and Store seed data are excluded by construction.

The dedicated strict reader rejects non-canonical gzip metadata, PAX and other
physical tar metadata, links, legacy/special members, traversal, absolute and
platform paths, duplicates, case/NFC collisions, unsupported modes and
ownership, malformed closure, integrity mismatch, and every approved size,
member, depth, and decompression-ratio violation. Compressed size is rejected
before tar parsing, and all extracted paths are containment-checked before
payload trust.

Skill payloads fail closed on high-risk credential filenames, private-key
markers, and exact known sensitive environment values of at least eight bytes.
This is a source-content safeguard, not a general secret detector; operators
must still review an artifact before sharing or trusting it.

## Sync and Recovery

Sync validates and externally stages the complete bundle before managed
mutation. Dry-run performs the same artifact and conflict preflight without a
managed lock or Store creation. Real sync checks readonly state, verifies the
source digest, acquires Task 81's global inventory lock, rebuilds target state,
and compares the accepted and locked plans before the first commit.

Missing packages commit through `installSkillBundleRoot`; missing MCP records
commit through `createMcpLibraryRecord`. A known conflict therefore causes no
inventory write. V1 intentionally provides valid-record crash recovery rather
than multi-record rollback: interruption may leave completed inactive entries,
and retry treats them as identical before finishing the remainder.

Fresh real sync creates only `store.json`, standalone package storage, and
standalone MCP storage. It ignores `DRWN_STORE_SEED_PATH` and creates no
`machine.json`. Existing non-inventory bytes remain byte-identical.

## Release Enforcement

The release verifier now reports a separate `portable machine inventory
transfer` check. Mutation coverage rejects missing command registration,
forbidden options or namespaces, broad Store sources, forbidden managed-state
dependencies, weakened schema/limits/archive/secret/integrity checks, unlocked
revalidation, bypassed Task 81 commit helpers, stale documentation, and claims
that the format is a backup, restore, or credential-carrying artifact.

Task 79's `store export security` gate remains independent and green. Remote
deploy retains its scoped Card-closure payload and unchanged consumer contract.

## Verification Evidence

Focused Task 82 unit, integration, command, E2E, documentation, and mutation
coverage:

```text
69 pass
0 fail
1130 expect() calls
69 tests across 10 files
```

Final repository verification:

```text
bun test
1523 pass
5 skip
0 fail
1528 tests across 279 files
```

The five unchanged environment-gated skips cover Windows DPAPI, three live
BeginningDB contract/journey checks, and live `dm-card-base` catalog
collaboration. No Task 82 behavior is skipped.

Additional gates:

- `bun run typecheck`: pass;
- `bun run docs:build`: optimized production build pass with no dependency
  update performed;
- `bun run verify:release --json`: `ok: true`, no warnings, all 13 checks pass;
- `git diff --check`: pass.

## Acceptance Status

All Task 82 acceptance gates are satisfied. Artifacts are deterministic and
allowlist-built, hostile or sensitive inputs fail closed before managed
mutation, exact verification is read-only, additive sync preserves intent and
extras, interruption is retryable, whole-Store and remote deploy boundaries
remain intact, and the complete release gate passes.
