# ABOUTME: Approved deterministic manifest and additive bundle transfer plan for standalone machine inventory.
# ABOUTME: Replaces the proposed Store seed/export design without transferring intent, credentials, Cards, or operational state.

# Task 82: Portable Machine Inventory Transfer Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans`,
> `test-driven-development`, `incremental-commits`, and
> `verification-before-completion`. Work in the primary checkout on a feature
> branch; do not create a worktree.

**Status:** Approved and execution-ready on 2026-07-13

**Goal:** Provide a deterministic requirements-style manifest and an optional
self-contained bundle for moving drwn-managed standalone skill packages and MCP
records between machines without moving activation intent, credentials, Cards,
project state, target projections, history, or caches.

**Architecture:** `drwn machine inventory export` emits canonical metadata;
`bundle` emits that exact manifest plus allowlisted active inventory bytes;
`verify` compares a manifest or bundle with local standalone inventory; and
`sync` additively installs missing bundle entries. Artifact construction starts
from Task 81 typed records, never from a Store directory walk. Import validates
and stages the complete artifact outside managed state before taking the global
inventory lock. Existing identities are either identical or blocking conflicts;
there is no replacement, deletion, activation, or force path.

**Execution branch:** `feat/task-82-portable-inventory-transfer`

**Dependencies:**

- Task 79 is complete and whole-Store export remains unavailable.
- Task 80 is complete and machine intent is strict `drwn.machine` V1.
- Task 81 is complete and owns typed inventory, immutable package commits,
  record-level MCP persistence, global inventory locking, and GC.
- Task 83 is complete and is unrelated to artifact transfer.

**Non-goals:** Full-machine backup or restore, Card/source/catalog transfer,
machine profile transfer, project migration, target projection, credential
backup, inactive package-version retention, remote deploy payload changes,
artifact signing, registry publication, and compatibility with prototype Store
archives or draft Task 82 formats.

---

## 0. Approved Contract

### 0.1 Public command grammar

The first supported portable inventory surface is:

```text
drwn machine inventory export --output <manifest.json> [--json]
drwn machine inventory verify --from <manifest.json|bundle.tar.gz> [--json]
drwn machine inventory bundle --output <bundle.tar.gz> [--json]
drwn machine inventory sync --from <bundle.tar.gz> [--dry-run] [--json]
drwn machine inventory gc [--prune] [--json]
```

The four new commands are inventory operations under `machine`; they do not
restore the `library` or `store` namespaces. `export` is the requirements-file
analogue. `bundle` is the offline, byte-carrying form. `verify` is read-only.
`sync` is additive inventory installation and is not a machine-state restore.

V1 has no `--force`, `--replace`, `--prune`, `--activate`, `--enable`,
`--project`, `--include-*`, `--exclude-*`, `--unsafe`, stdin/stdout artifact,
URL input, or compatibility option. `--output` and `--from` are required.
`sync` accepts only a bundle because a metadata-only manifest has no package
bytes. Input type is recognized from strict JSON or gzip content, not trusted
from the filename alone; plain tar and other compression formats are rejected.

`export` and `bundle` refuse an output path inside `~/.agents/drwn`. If the
output is absent, it is written through a flushed temporary sibling and atomic
rename. If it already contains the exact expected bytes, the command is a
no-op. Different existing bytes fail with
`INVENTORY_TRANSFER_OUTPUT_EXISTS`; no overwrite bypass exists.

### 0.2 Canonical manifest V1

The exact top-level schema is:

```ts
interface PortableInventoryManifestV1 {
  schema: "drwn.portable-inventory";
  schemaVersion: 1;
  entries: Array<PortableSkillPackageEntry | PortableMcpEntry>;
}

interface PortableSkillPackageEntry {
  kind: "skill-package";
  packageName: string;
  activeVersion: string;
  exportedSkillIds: string[];
  payloadPath: `payload/${string}`;
  fileCount: number;
  directoryCount: number;
  sizeBytes: number;
  integrity: `sha256-${string}`;
}

interface PortableMcpEntry {
  kind: "mcp";
  id: string;
  definition: RegistryServer;
  payloadPath: `payload/${string}/record.json`;
  sizeBytes: number;
  integrity: `sha256-${string}`;
}
```

All objects are strict. Unknown keys, duplicate identities, duplicate exported
skill IDs, unsafe IDs, unsupported transports, invalid semantic versions,
invalid SHA-256 values, unsafe payload paths, negative/non-integer counts, and
unsupported schema identities or versions fail closed. MCP definitions accept
only the current `RegistryServer` V1 fields and must pass Task 81 validation and
secret-reference policy.

Entries are sorted as skill packages by `packageName`, then MCP records by `id`.
`exportedSkillIds` are sorted and unique. Payload paths are positional and do
not embed package names or MCP IDs:

```text
payload/000000
payload/000001
...
```

This prevents scoped names and hostile identities from becoming archive paths.
The canonical serializer recursively sorts object keys, preserves array order,
uses two-space JSON indentation, UTF-8, LF, and one trailing newline. The
manifest intentionally omits creation time, CLI version, hostname, username,
absolute paths, source URLs, and local provenance. The same inventory produces
byte-identical manifest output across invocations and the manifest embedded by
`bundle` is byte-for-byte identical to `export` output.

Skill `integrity` is Task 81's canonical path/type/content tree digest. Counts
and `sizeBytes` describe the active version tree, including preserved empty
directories in `directoryCount`. MCP payload bytes are the portable canonical
JSON serialization of `definition`; the definition, size, and digest must match
those bytes exactly. Portable MCP identity is therefore insensitive to source
whitespace and object-key order. Sync parses those canonical bytes and passes
the validated definition through Task 81's existing MCP create helper.

The format provides deterministic corruption detection, not authentication.
Human and JSON output report the manifest SHA-256, and `bundle` also reports the
finished archive SHA-256. Signing, trusted publication, and provenance are
separate future contracts.

### 0.3 Bundle V1

The only V1 bundle is deterministic gzip-compressed tar with this root:

```text
drwn-inventory/
  manifest.json
  payload/000000/...active skill package bytes...
  payload/000001/record.json
```

The bundle contains the manifest plus exactly one payload for every manifest
entry. It contains no payload absent from the manifest and no manifest entry
without a payload. There are no checksums files, metadata sidecars, migration
records, or nested archives. Integrity is checked against each manifest entry;
the archive SHA-256 is reported externally because an archive cannot contain
its own digest.

Archive members are emitted in lexical POSIX path order. UID/GID are zero,
user/group names are empty, and timestamps are omitted. Directories use mode
`0755`; regular files use `0755` only when the source has any executable bit and
otherwise `0644`. Setuid, setgid, sticky bits, ACLs, xattrs, device metadata,
and host-specific fields are not emitted. The gzip header is portable and
timestamp-free. Two bundles from unchanged inventory must be byte-identical.

Do not widen the generic `cli/core/archive.ts` contract for this work. It is
used by independent deploy/package paths and intentionally round-trips links.
Task 82 uses a dedicated strict portable bundle reader/writer over `node-tar`.

### 0.4 Allowlist and exclusions

Artifact construction may read only:

1. the active `versionRoot` of each Task 81
   `StandaloneSkillPackageRecord` under `~/.agents/drwn/skills`;
2. each Task 81 `StandaloneMcpRecord` under
   `~/.agents/drwn/mcp-servers`.

Only current active package versions are exported. Superseded inactive versions
and tombstones remain local GC concerns. Bundled repository skills, bundled MCP
registry records, machine-profile Card capabilities, and Card-owned content are
discovery inputs and never portable inventory entries.

The implementation must never archive `~/.agents/drwn` or derive inclusion by
walking that root and subtracting denied paths. It must not read or include:

- `credentials.json`, OAuth/session state, environment values, or keychains;
- `machine.json`, profile pins, or explicit machine selections;
- `projects.json`, project config/lock files, or registered project roots;
- Card bare repositories, immutable Card versions, editable sources, catalogs,
  extracted trees, or deploy payloads;
- generated Workers/hooks, target user-home files, write records, ownership
  records, history, logs, caches, temporary files, locks, or tombstones;
- package source URLs, package-manager credentials, or original local paths.

The allowlist prevents dedicated credential and operational Store records from
entering the artifact. Arbitrary user-authored skill content can itself be
sensitive, so V1 also rejects exact values of sensitive environment variables
whose values are at least eight bytes, private-key PEM markers, and package
files with high-risk credential basenames (`.env`, `.env.*` other than
`.env.example`, `credentials.json`, `secrets.json`, `id_rsa`, or `id_ed25519`).
Errors identify only entry identity and relative path, never the matched value.
Documentation must state honestly that this is a source-content safeguard, not
a general secret detector or permission to publish an artifact without review.

Security fixtures plant unique sentinels in every excluded Store category and
known-secret environment value, then scan both member names and decompressed
bytes. Artifact code must not open excluded paths merely to prove exclusion.

### 0.5 Verify and comparison semantics

`verify` first validates the input. A bundle must pass complete archive and
payload validation before local comparison. A manifest is sufficient for
comparison but cannot be synced.

Comparison emits a deterministic report with source kind, schema/version,
manifest digest, one disposition per source entry, target extras, and counts:

```ts
type InventoryDisposition = "missing" | "identical" | "conflicting" | "extra";

interface InventoryComparisonReport {
  source: {
    kind: "manifest" | "bundle";
    schema: "drwn.portable-inventory";
    schemaVersion: 1;
    manifestSha256: string;
  };
  entries: Array<{
    kind: "skill-package" | "mcp";
    id: string;
    disposition: "missing" | "identical" | "conflicting";
    reasonCode: string;
  }>;
  extras: Array<{
    kind: "skill-package" | "mcp";
    id: string;
    disposition: "extra";
  }>;
  summary: { missing: number; identical: number; conflicting: number; extra: number };
  exact: boolean;
}
```

`verify` exits zero only for an exact match: every source entry is identical and
there are no target extras. Drift is a normal report with exit code 1, not a
partial parse error. Invalid artifacts still throw typed errors and emit no
comparison that could be mistaken for trustworthy evidence.

Identity comparison is exact:

- A package is identical only when package name, active version, sorted
  exported skill IDs, canonical counts/size, and complete tree integrity match.
- An MCP record is identical only when its ID and canonical definition bytes,
  size, and integrity match. Source whitespace is never identity.
- A matching identity with any other version, bytes, definition, or metadata is
  conflicting.
- A source package that exports a skill ID owned by another target package or a
  repository skill is conflicting.
- A source MCP ID owned by the target's bundled registry is conflicting, even
  if the definitions happen to compare equal.
- Target standalone package/MCP identities absent from the source are extras.

### 0.6 Additive sync semantics

`sync` performs this complete preflight before target mutation:

1. validate compressed size and gzip input;
2. list and validate every archive header and path;
3. extract into an external temporary directory;
4. validate strict manifest schema and canonical bytes;
5. validate exact member allowlist, file types, counts, sizes, definitions, and
   entry integrity;
6. apply secret-content checks;
7. compare with current target inventory, repository skills, and bundled MCP
   registry.

The complete operation blocks if any entry is conflicting or invalid. Missing
entries are installed. Identical entries are no-ops. Extras are preserved and
reported. `sync` never updates, removes, replaces, or changes `current` for an
existing package identity, even if the bundle contains a newer version. It
never changes machine intent, profile state, project state, target projection,
or GC retention.

`--dry-run` executes the same artifact and conflict preflight, reports
`would-install`/`no-op`/conflict dispositions, and creates no Store directory,
lock, metadata, inventory, machine, project, target, or temporary state under
the managed roots. External staging is removed before exit.

For a real sync, acquire Task 81's global inventory lock, reconstruct the live
target comparison under that lock, and abort before commit if it differs from
the accepted plan or contains any conflict. Install missing packages in
manifest order through `installSkillBundleRoot`; install missing MCP records in
manifest order through `createMcpLibraryRecord`. Both helpers re-enter the same
inventory lock and retain their Task 81 validation and atomic commit behavior.
No network, package-manager, Card resolution, or remote source access occurs.

V1 promises preflight atomicity, not multi-record rollback. No known conflict
may cause a partial write, but a process crash after one valid entry commit may
leave that entry installed while later entries remain missing. Every visible
entry is individually valid and inactive. Re-running the same bundle treats
committed entries as identical and finishes the remaining entries. Do not add a
cross-record journal, destructive rollback, or whole-Store replacement.

### 0.7 Fresh-home initialization and state preservation

The current `ensureStoreInitialized()` is not suitable for sync: it creates
`machine.json` and may honor `DRWN_STORE_SEED_PATH`, which can import broad Store
state. Task 82 adds an inventory-only initializer used only by real sync. It may
create:

```text
~/.agents/drwn/store.json
~/.agents/drwn/skills/
~/.agents/drwn/mcp-servers/
```

It must not call `ensureStoreInitialized`, `seedStore`, or
`isStoreMissingOrEmpty`; it ignores `DRWN_STORE_SEED_PATH`; and it must not
create `machine.json` or any Card, project, generated, extracted, catalog, or
target path. `store.json` is local infrastructure metadata and is never copied.

On a non-empty target, snapshot every non-inventory file before sync and prove
it is byte-identical afterward. On a fresh target, prove `machine.json` remains
absent after sync and the transferred entries remain inactive. A later guided
or non-interactive initialization remains the sole owner of machine intent.

### 0.8 Archive threat model and hard limits

The strict reader accepts only directories and regular files. It rejects
symbolic links, hard links, devices, FIFOs, sockets, sparse extensions,
absolute/drive/UNC paths, backslashes, NUL, empty or dot segments, `..`, paths
outside `drwn-inventory/`, duplicate paths, and collisions after Unicode NFC
plus case folding. Extracted paths are checked for containment with
`lstat`/`realpath` before any payload is trusted.

Pin these V1 limits as exported constants and test each boundary:

```text
compressed bundle              <= 512 MiB
total declared/actual payload  <= 2 GiB
regular file                   <= 256 MiB
manifest.json                  <= 4 MiB
archive members                <= 100,000
path depth                     <= 64 segments
decompression ratio           <= 200:1
```

Header-declared totals are checked before extraction and actual streamed totals
are checked during/after extraction. All extraction uses a fresh external
temporary directory with strict warnings and no path preservation. Any limit,
header, extraction, canonicalization, allowlist, or integrity failure removes
staging and leaves managed state unchanged.

### 0.9 Locking and read consistency

`export` and `bundle` produce one consistent active snapshot. If the Store is
absent, they may return an empty snapshot without creating it. Otherwise they
acquire the inventory lock, read and validate typed records, and for `bundle`
copy active package/MCP bytes into external staging while the lock prevents
update and GC races. They release the lock before archive compression and final
output publication.

`verify` is read-only and leaves no persistent managed bytes. It may use the
transient inventory lock when the target Store exists; an absent target is an
empty inventory and is not initialized. `sync --dry-run` does not acquire a
managed lock. Real `sync` checks `DRWN_STORE_READONLY` before lock acquisition,
then uses the fixed Task 81 inventory lock and revalidates under it. Lock files
are transient and owner-verified through the existing recovery policy.

### 0.10 Stable failures

Use `DrwnError` with stable codes at core boundaries:

```text
INVENTORY_TRANSFER_SCHEMA_INVALID
INVENTORY_TRANSFER_SCHEMA_UNSUPPORTED
INVENTORY_TRANSFER_ARTIFACT_INVALID
INVENTORY_TRANSFER_ARTIFACT_TOO_LARGE
INVENTORY_TRANSFER_UNSAFE_ENTRY
INVENTORY_TRANSFER_INTEGRITY_MISMATCH
INVENTORY_TRANSFER_SECRET_DETECTED
INVENTORY_TRANSFER_CONFLICT
INVENTORY_TRANSFER_OUTPUT_EXISTS
INVENTORY_TRANSFER_BUNDLE_REQUIRED
INVENTORY_TRANSFER_SOURCE_CHANGED
```

Reuse Task 81's more specific package, MCP, read-only, and lock errors when they
are the direct cause. Error messages and JSON reports may expose artifact path,
entry kind/identity, relative payload path, expected/actual non-secret digest,
and reason code. They must not expose MCP definitions, headers, environment
values, secret matches, credential paths outside the artifact, or payload
contents.

---

## Task 1: Freeze Schema and Canonicalization

**Files:**

- Create: `cli/core/inventory-portable.ts`
- Create: `test/core-inventory-portable.test.ts`

**Step 1: Write red schema tests**

Cover the exact manifest schema, strict unknown-key rejection at every level,
identity/path/hash/count validation, deterministic ordering and canonical JSON,
MCP definition strictness, duplicate package/MCP/skill IDs, positional payload
paths, and absence of timestamp/host/source fields.

Run:

```bash
bun test test/core-inventory-portable.test.ts
```

Expected: FAIL because the schema module does not exist.

**Step 2: Implement the pure V1 contract**

Use Zod strict discriminated unions plus a dedicated canonical serializer.
Export parsing, validation, ordering, payload-path assignment, canonical byte
serialization, digest helpers, and the limits/reason-code types. Do not perform
filesystem or command work in this module.

**Step 3: Verify and commit**

```bash
bun test test/core-inventory-portable.test.ts
git add cli/core/inventory-portable.ts test/core-inventory-portable.test.ts
git commit -m "feat(inventory): define portable manifest contract"
```

---

## Task 2: Build Typed Snapshots, Manifest Export, and Comparison

**Files:**

- Create: `cli/core/inventory-transfer.ts`
- Create: `test/core-inventory-transfer.test.ts`

**Step 1: Write red snapshot and comparison tests**

Cover empty/missing Store behavior, active package plus MCP snapshots, canonical
MCP normalization across whitespace/key order, sorted deterministic output,
excluded Store sentinels, same-output no-op, different-output refusal,
Store-contained output refusal, all comparison dispositions/reason codes,
registry/repository collisions, exact verification, drift, and no local state
mutation.

Run:

```bash
bun test test/core-inventory-transfer.test.ts
```

Expected: FAIL because snapshot/export/comparison APIs do not exist.

**Step 2: Reuse Task 81 ownership primitives**

Build portable snapshots from `listStandaloneSkillPackages` and
`listStandaloneMcpRecords`; never accept a Store root as an export source. Use
the portable canonical serializer for MCP transfer bytes and validate each
definition with the existing Task 81 MCP validator and secret-reference policy.

Implement manifest export and pure target comparison in
`inventory-transfer.ts`. Comparison receives `repoRoot` so repository skill and
bundled registry ownership are included. Keep machine/project/defaults readers
out of this module.

**Step 3: Run focused tests and commit**

```bash
bun test test/core-inventory.test.ts test/core-mcp-library.test.ts test/core-inventory-transfer.test.ts
bun run typecheck
git add cli/core/inventory-transfer.ts test/core-inventory-transfer.test.ts
git commit -m "feat(inventory): add canonical manifest transfer model"
```

---

## Task 3: Implement the Deterministic Strict Bundle

**Files:**

- Create: `cli/core/inventory-bundle.ts`
- Create: `test/core-inventory-bundle.test.ts`
- Modify: `test/core-inventory-transfer.test.ts`

**Step 1: Build hostile and reproducibility fixtures**

Add generated local fixtures for traversal, absolute/drive/UNC paths,
backslashes, duplicate and case/NFC-colliding paths, links and special files,
unknown top-level members, missing/extra payloads, malformed/canonical manifest
bytes, count/size/hash mismatches, gzip bombs and every limit, executable files,
empty directories, private-key markers, high-risk filenames, known environment
secret values, and excluded Store sentinels.

Do not commit a large binary or malicious archive corpus. Construct minimal
archives inside isolated temporary roots in tests.

Run:

```bash
bun test test/core-inventory-bundle.test.ts test/core-inventory-transfer.test.ts
```

Expected: FAIL because strict bundle creation/validation does not exist.

**Step 2: Implement dedicated creation and staged validation**

Use `node-tar` directly with deterministic metadata. Bundle creation copies
only typed active roots under the inventory lock, validates staging, creates an
external temporary archive, reopens it through the strict reader, and then
publishes output atomically. Bundle reading validates all headers before
extraction, verifies actual extracted structure and bytes, and returns a typed
staged source whose cleanup is mandatory in `finally`.

Do not modify `cli/core/archive.ts` behavior and do not import
`cli/core/store-seed.ts`.

**Step 3: Verify byte reproducibility and commit**

```bash
bun test test/core-inventory-bundle.test.ts test/core-inventory-transfer.test.ts test/core-archive.test.ts
bun run typecheck
git add cli/core/inventory-bundle.ts test/core-inventory-bundle.test.ts test/core-inventory-transfer.test.ts
git commit -m "feat(inventory): add deterministic portable bundle"
```

---

## Task 4: Implement Additive Sync and Recovery

**Files:**

- Modify: `cli/core/inventory-transfer.ts`
- Modify: `cli/core/inventory.ts`
- Modify: `test/core-inventory-transfer.test.ts`
- Create: `test/core-inventory-transfer-recovery.test.ts`

**Step 1: Write red sync tests**

Cover fresh target, existing target, all-missing, all-identical, mixed
missing/identical, every package/MCP/repository/registry conflict, target
extras, manifest-only refusal, read-only Store, source mutation before lock,
concurrent target mutation, `DRWN_STORE_SEED_PATH` isolation, dry-run byte
snapshots, machine/project/credential/generated-state preservation, no machine
activation, and no network calls.

Inject commit checkpoints and cover interruption:

- before first commit: no installed entries;
- after package version rename but before pointer: valid prior state plus
  recoverable inactive version under Task 81 semantics;
- after package pointer: that package is valid and retry becomes identical;
- after one MCP write: that record is valid and retry completes remaining
  entries;
- any preflight conflict: zero inventory writes.

Run:

```bash
bun test test/core-inventory-transfer.test.ts test/core-inventory-transfer-recovery.test.ts
```

Expected: FAIL because additive sync and recovery checkpoints do not exist.

**Step 2: Implement plan/revalidate/commit**

Stage and validate the complete bundle first. For dry-run, compare without a
managed lock or initializer. For real sync, fail read-only before state, acquire
the global inventory lock, re-read all target ownership, require a
conflict-free live plan, initialize only inventory storage, and call the Task
81 root commit helpers in manifest order. Always remove external staging.

Implement the inventory-only initializer in `inventory.ts` with the exact
fresh-home boundary from section 0.7. It is a write helper used by real sync
only; export, verify, bundle reads, and dry-run must not call it.

The result reports `installed`, `identical`, `extra`, and summary counts. It
never calls machine mutation, project mutation, target sync, Card resolution,
`ensureStoreInitialized`, or Store seed code.

**Step 3: Verify and commit**

```bash
bun test test/core-inventory-transfer.test.ts test/core-inventory-transfer-recovery.test.ts test/core-inventory-lock.test.ts test/core-skill-packages.test.ts test/core-mcp-library.test.ts
bun run typecheck
git add cli/core/inventory-transfer.ts cli/core/inventory.ts test/core-inventory-transfer.test.ts test/core-inventory-transfer-recovery.test.ts
git commit -m "feat(inventory): add conflict-safe bundle sync"
```

---

## Task 5: Register the Machine Inventory Commands

**Files:**

- Modify: `cli/commands/machine/inventory.ts`
- Modify: `cli/index.ts`
- Modify: `test/commands-machine-inventory-shape.test.ts`
- Create: `test/commands-machine-inventory-transfer.test.ts`
- Modify: `test/cli-help-shape.test.ts`

**Step 1: Write command integration tests**

Exercise human and JSON output, required options, exact verify exit behavior,
sync dry-run, invalid artifact errors, same-output no-op, conflict abort,
fresh-home sync, non-inventory byte preservation, and external staging cleanup.
Use isolated `AGENTS_DIR`, `AGENTS_HOME_DIR`, and repo roots. Never inspect the
developer's machine inventory or target configs.

Run:

```bash
bun test test/commands-machine-inventory-shape.test.ts test/commands-machine-inventory-transfer.test.ts test/cli-help-shape.test.ts
```

Expected: FAIL because the new command classes are not registered.

**Step 2: Add thin command classes**

Add `MachineInventoryExportCommand`, `MachineInventoryVerifyCommand`,
`MachineInventoryBundleCommand`, and `MachineInventorySyncCommand` beside GC.
Commands parse options, call core APIs, render deterministic reports, and map
verify drift to exit 1. Domain/security behavior remains in core modules.

Register the classes in `cli/index.ts`. Keep command descriptions explicit that
inventory remains inactive and sync is additive.

**Step 3: Verify and commit**

```bash
bun test test/commands-machine-inventory-shape.test.ts test/commands-machine-inventory-transfer.test.ts test/cli-help-shape.test.ts
bun run typecheck
git add cli/commands/machine/inventory.ts cli/index.ts test/commands-machine-inventory-shape.test.ts test/commands-machine-inventory-transfer.test.ts test/cli-help-shape.test.ts
git commit -m "feat(cli): expose portable machine inventory transfer"
```

---

## Task 6: Run the Isolated Cross-Home Acceptance Matrix

**Files:**

- Create: `test/e2e-machine-inventory-transfer.test.ts`

**Step 1: Build source and target homes**

Create one isolated source with multiple packages (including a synthetic loose
skill package), multiple MCP transports with symbolic secret references,
inactive superseded package versions, credentials/machine/project/Card/cache
sentinels, and one explicit machine selection. Create these targets:

1. completely absent Store;
2. identical standalone inventory plus different machine state;
3. extra standalone inventory;
4. conflicting package version;
5. conflicting MCP definition;
6. repository-skill and bundled-registry collision fixture.

**Step 2: Prove the complete workflow**

Run export twice and bundle twice and compare bytes. Prove export manifest bytes
equal embedded manifest bytes. Sync the fresh target, prove package/MCP payload
integrity, no `machine.json`, no excluded sentinel in artifact, and exact verify.
Prove extras survive, conflicts perform zero writes, sync retry is a no-op, and
different target operational state remains byte-identical.

```bash
bun test test/e2e-machine-inventory-transfer.test.ts
```

**Step 3: Commit**

```bash
git add test/e2e-machine-inventory-transfer.test.ts
git commit -m "test(inventory): prove isolated portable transfer workflow"
```

---

## Task 7: Publish Documentation and Release Enforcement

**Files:**

- Modify: `README.md`
- Modify: `docs/cli-quickref.md`
- Modify: `docs-docusaurus/docs/reference/cli/machine.md`
- Modify: `docs-docusaurus/docs/concepts/local-store.md`
- Modify: `.ai/analyses/116_drwn-cli-card-worker-target-architecture.md`
- Modify: `.ai/knowledges/10_drwn-cli-architecture.md`
- Modify: `scripts/verify-release-readiness.ts`
- Modify: `test/scripts-verify-machine-inventory-contract.test.ts`
- Modify: `test/docs-readiness.test.ts`
- Create: `.ai/tasks/82_completion_portable-machine-inventory-transfer.md`

**Step 1: Document the operational model**

Replace “Task 82 deferred/proposed” text in active architecture and user docs.
Document manifest versus bundle, additive/no-activation sync, exact verify,
conflict behavior, extras, reproducibility, checksum/authenticity distinction,
secret-content caveat, fresh-home behavior, and the continued prohibition on
whole-Store export. Do not describe transfer as backup or restore.

**Step 2: Extend release gates**

Require all four registered machine inventory commands, their negative option
tests, strict schema and archive modules, dedicated Store exclusions,
inventory-only initialization, lock/revalidation, sync through Task 81 commit
helpers, and current docs. Mutation tests must reject:

- any reintroduced `store`/`library` command;
- `resolveStoreRoot` or `entries:["drwn"]` as a bundle source;
- portable code importing `store-seed`, machine config mutation, project
  mutation, target writers, or Card export;
- force/replace/delete/activation flags;
- archive readers accepting links or traversal;
- missing integrity/secret/size checks;
- sync without locked revalidation;
- claims that the artifact is a full backup or carries credentials/intent.

Keep Task 79's `store export security` check and scoped remote deploy exception
intact. A new machine inventory export must not weaken that check merely because
its command class contains the word `Export`.

**Step 3: Verify docs and release contract**

```bash
bun test test/scripts-verify-machine-inventory-contract.test.ts test/docs-readiness.test.ts
bun run docs:build
bun run verify:release --json
```

Expected: all pass and release verification reports both whole-Store export
security and portable machine inventory transfer as healthy.

**Step 4: Record completion and commit**

The completion record lists exact commits, focused/full test counts, supported
schema/commands, checksum evidence, and any environment-gated skips.

```bash
git add README.md docs/cli-quickref.md docs-docusaurus/docs/reference/cli/machine.md docs-docusaurus/docs/concepts/local-store.md .ai/analyses/116_drwn-cli-card-worker-target-architecture.md .ai/knowledges/10_drwn-cli-architecture.md scripts/verify-release-readiness.ts test/scripts-verify-machine-inventory-contract.test.ts test/docs-readiness.test.ts .ai/tasks/82_completion_portable-machine-inventory-transfer.md
git commit -m "docs(inventory): publish portable transfer contract"
```

---

## Final Verification

Run from a clean Task 82 branch after every task commit:

```bash
bun run typecheck
bun test
bun run docs:build
bun run verify:release --json
git diff --check
git status --short
```

Then rerun the isolated E2E test with a known sensitive environment sentinel and
inspect the resulting archive member list and decompressed bytes in the test,
not manually against the developer's real Store.

---

## Acceptance Checklist

- [ ] `export` emits only deterministic canonical standalone inventory metadata.
- [ ] `bundle` emits the same manifest plus only active standalone payload bytes.
- [ ] No artifact path archives or subtractively filters the Store root.
- [ ] Cards, profiles, intent, projects, credentials, projections, history,
      caches, inactive versions, and tombstones are absent.
- [ ] Known resolved secret values and high-risk credential payloads fail closed.
- [ ] Manifest and bundle schemas are strict V1 with no compatibility reader.
- [ ] Repeated unchanged exports and bundles are byte-identical.
- [ ] Every bundle is completely staged and validated before managed mutation.
- [ ] Hostile paths, links, duplicates, special files, bombs, and limit breaches
      fail without managed state changes.
- [ ] `verify` is read-only and exits nonzero for missing, conflicting, or extra
      inventory.
- [ ] `sync --dry-run` creates no managed state or lock.
- [ ] Real sync installs only missing entries and preserves identical/extras.
- [ ] Any known conflict blocks the complete sync before the first commit.
- [ ] Interrupted sync leaves only valid inactive entries and is retryable.
- [ ] Fresh sync creates inventory infrastructure but no `machine.json`.
- [ ] Existing machine/project/credential/Card/generated bytes remain unchanged.
- [ ] No transfer command activates a skill or MCP server.
- [ ] `library` and `store` remain absent public namespaces.
- [ ] Task 79 whole-Store security and scoped remote deploy behavior remain intact.
- [ ] Full tests, typecheck, docs build, release verification, and diff checks pass.
