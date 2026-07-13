# ABOUTME: Execution-ready implementation plan for replacing numbered Worker Mind memory with observations and insights.
# ABOUTME: Covers the drwn 0.9.0 contract, canonical Mind Cards, upstream storage parity, consumer handoff, release order, and verification.

# Worker Mind Semantic Memory Implementation Plan

**Status:** CLI implementation through Task 8, the canonical base-Mind source
pass, and the Task 9-10 Card source conversions are committed locally. Upstream
BeginningDB parity, full isolated-Store Card gates, Believer Task 05,
publication, and controlled reset remain open gates.

**Goal:** Ship the first supported optional Worker Mind contract in `drwn
0.9.0`: semantic `observations` and `insights`, reserved-but-unsupported
`raw_data`, a strict namespaced Mind index, closure-level optional-Mind
detection, semantic BeginningDB paths, updated canonical Mind Cards, and a
clean consumer rollout with no numbered-memory compatibility layer.

**Architecture:** Analysis 117 is authoritative. Cards declare fixed semantic
memory kinds rather than configurable layers. A selected Worker closure has a
Mind only when a Card contributes persona, beliefs, observations, or insights.
BeginningDB stores immutable date-sharded pool entries and places them into
Mind views. `mind.json` becomes strict `drwn.mind-index` V1. Existing numbered
locks, indexes, paths, payload keys, and development state fail closed and are
regenerated or reset; they are never translated.

**Tech Stack:** Bun, TypeScript, Clipanion, Zod, BeginningDB HTTP/VFS,
Vitest/React/Cloudflare Workers in the Believer consumer, JSON Card manifests,
Markdown agent skills, Docusaurus, GitHub Actions/npm release workflows.

**Authority:**

- `.ai/analyses/117_worker-mind-semantic-memory-target-architecture.md`
- `.ai/analyses/116_drwn-cli-card-worker-target-architecture.md`
- `.ai/analyses/115_mind-substrate-split-architecture.md`
- `.ai/analyses/110_mind-card-target-architecture.md` only where Analysis 117
  does not supersede it
- `/Users/pureicis/dev/believer-interview/.ai/analyses/11_worker-mind-semantic-memory-consumer-remediation.md`
  for the validated consumer boundary and upstream contract corrections
- `/Users/pureicis/dev/believer-interview/.ai/tasks/05_worker-mind-semantic-memory-consumer-remediation-plan.md`
  as the sole detailed implementation authority for the Believer consumer

**Repositories:**

| Repository | Role |
|---|---|
| `/Users/pureicis/dev/darwinian-minds` | CLI, Mind store contract, dedicated base-mind skills, docs, release; Operator remains Worker/Card-only under Task 85 |
| `/Users/pureicis/dev/darwinian-cards/mind-tools` | Canonical Mind operating skills and conventions |
| `/Users/pureicis/dev/darwinian-cards/mind-starter` | Synced standalone quickstart Card |
| `/Users/pureicis/dev/believer-interview` | Only discovered active application consumer and its four Cards |
| `/Users/pureicis/dev/beginning-db/BeginningDB` | Explicit-unplace HTTP contract parity plus verification dependency |

**Non-goals:** The six-layer refinery ontology and its repositories; automatic
state migration; numbered aliases; dual reads/writes; `raw_data` ingestion;
BeginningDB features beyond in-memory/production unplace parity; remote deploy API changes; Worker stacking; new
Card memory-authoring commands; generic reflection-domain terminology that is
not a persisted Worker Mind kind.

### Execution record: current operator constraints

This record changes workflow mechanics only. It does not change Analysis 117
or any product contract.

- Use the current primary checkouts. Do not create or move to a worktree.
- Task 82 is frozen by `c07fc05` and `24ce8ef`.
- Task 84 CLI/source commits begin at `c3c6e43` and include the base-Mind
  submodule commit `e4a6ca8` through parent commit `a19aaa9`.
- Commits are now permitted. Tags, pushes, merges, real Card publication,
  protected release workflows, and destructive reset remain blocked until
  explicitly authorized.
- Preserve existing Believer/Chief implementation in place. Do not stash,
  clean, reset, or reconstruct it.
- Per the operator's standing instruction, do not update or build Docusaurus in
  this pass. Keep those paths unchanged and report the documentation release
  gate as outstanding instead of weakening residue or release checks.
- Tests may create disposable commits/tags inside temporary isolated fixtures;
  they do not constitute release evidence for durable repositories or the real
  drwn Store.
- Tasks 15.2, 15.3, and the completion-status transition in Task 16 are release
  gates. They cannot be claimed complete until commits, tags, publication, and
  human-confirmed destructive reset are explicitly allowed.

Under this record, "full local completion" means all source changes, generated
artifacts, fake/local integration, available real BeginningDB verification,
typechecks, package checks, and non-Docusaurus release checks pass in the dirty
primary checkouts. It does not mean that immutable versions have been released.

---

## 0. Frozen Contract and Execution Gates

### 0.1 Contract snapshot

The only active Card memory shape is:

```ts
export type MemoryKind = "observations" | "insights";

export interface MemoryManifest {
  observations?: { format: "jsonl" };
  insights?: { format: "md" };
}

export const MEMORY_KINDS = ["observations", "insights"] as const;
```

Rules:

- `observations.format` is required and exactly `jsonl`.
- `insights.format` is required and exactly `md`.
- Memory sections are closed objects. Reject `include`, `visibility`,
  `exclude`, `shared`, and every unknown field.
- Reject `raw_data` with a reserved-but-unsupported diagnostic.
- Reject `l4`, `l5`, `l6`, `mixed`, and missing formats without normalization.
- `drwn.project-lock` stays V1; its nested manifests and duplicated `memory`
  records must agree and satisfy the same semantic contract.
- A Mind-bearing project lock requires `drwn >= 0.9.0`; a lock without any
  Mind-bearing Card retains the `0.8.0` project baseline.
- The first supported index is `{schema:"drwn.mind-index",schemaVersion:1}`.
- Stable index errors are `MIND_INDEX_INVALID` and
  `MIND_INDEX_UNSUPPORTED`.
- No command or JSON result exposes a `layer` selector for Worker Mind memory.

Canonical paths:

```text
/pool/observations/<yyyy-mm-dd>/<HHmm>-<ulid>.jsonl
/pool/insights/<yyyy-mm-dd>/<HHmm>-<ulid>.md
/minds/<mindId>/memory/observations/by-date/<yyyy-mm-dd>/<filename>.jsonl
/minds/<mindId>/memory/insights/by-date/<yyyy-mm-dd>/<filename>.md
```

Applications may place an immutable insight into an additional path such as
`memory/insights/by-topic/<topic>/<name>.md`. Replacing that topic view means
unplacing the old view and placing a newly created immutable pool entry. The
old pool entry and its historical by-date view remain intact.

Every Worker-safe view removal uses `DELETE ...?action=unplace`. A 204 is
success, a 404 is an already-absent no-op, and a 409 `last_placement` is a hard
failure. Plain `DELETE` is not an unplace API because it deletes the inode when
the target is its final placement. BeginningDB production and in-memory
backends plus Darwinian and consumer fakes must agree on this contract.

### 0.2 Repository-state gates

Do not begin implementation until all of these are true:

1. Task 82 is committed as `c07fc05` with completion record `24ce8ef`; its
   files and tests are not attributed to Task 84.
2. Re-read Analysis 116 after Task 82 lands and preserve its completed portable
   inventory text. Do not restore the pre-Task-82 wording.
3. Merge or otherwise preserve the existing `docs/worker-blueprint-flow`
   commits in both `mind-tools` (`69fc879`) and `mind-starter` (`6ed58d0`)
   before branching for Task 84. Never reset those commits away.
4. The large Chief/Believer implementation must have a durable commit before
   release. Under the execution addendum, local implementation may proceed only
   after recording an exact dirty-tree inventory. Do not stash, clean, reset,
   or reconstruct that work from the older `bc32225` HEAD.
5. Record baseline SHAs, branches, and `git status --short` for all four repos
   in the eventual completion note.

Recommended branches:

```text
darwinian-minds:                  feat/task-84-worker-mind-semantic-memory
darwinian-cards/mind-tools:       feat/semantic-memory-v0.2
darwinian-cards/mind-starter:     feat/semantic-memory-v0.2
believer-interview:               feat/semantic-worker-memory
```

### 0.3 Discovery baseline

The pre-plan source audit found exactly four active numbered Worker Mind Card
manifests under `/Users/pureicis/dev`:

```text
darwinian-cards/mind-tools/card.json
darwinian-cards/mind-starter/card.json
believer-interview/cards/chief/card.json
believer-interview/cards/believer-interview/card.json
```

The first two become semantic declarations. The two Believer content Cards
remove their redundant `memory` blocks because their Blueprints compose
`@darwinian/mind-tools`, the canonical substrate owner.

Before editing, repeat the exact-manifest and exact-path scans. If a new active
consumer appears, stop the release phase and add it to this plan; do not hide it
with an exclusion.

### 0.4 Commit discipline

- Use red-green-refactor within each task.
- Keep `darwinian-minds`, each canonical Card repo, and `believer-interview`
  commits independent.
- Do not commit generated Believer `src/card-content/**` changes without the
  canonical `cards/**` source change and a passing `pnpm adapt-card` drift test.
- Do not hand-edit synced `mind-starter` skills or synced
  `darwinian-worker-skills/cards/*/skills`; run their owner sync scripts.
- No publication, tag, data deletion, or deployment occurs before the complete
  local verification gates pass.

### 0.5 Required execution order

The task numbers group work by owning repository. Execute them in this order so
strict CLI validation and real-Card tests do not observe incompatible source
versions:

```text
Task 0                     freeze audited baselines and rediscover consumers
Tasks 1-5                  drwn core contract, explicit-unplace parity, and local 0.9.0 identity
Task 9                    mind-tools source conversion
Task 10                   mind-starter sync and standalone validation
Tasks 6-8                 real-Card/store journeys, docs, release candidate
Believer Task 05          consumer Cards, runtime, API, persistence, UI, docs, and reset runbook
Tasks 15-16               publication, reset, final evidence
```

Focused test sets must be green at every commit. Removing the public layer
types makes Tasks 1-3 an intentionally incomplete vertical slice; the first
required full TypeScript gate is Task 4, after every dependent CLI module is
semantic. Real-Card integration is deferred until Task 6 because those tests
intentionally read the sibling canonical Card repos. The complete
`darwinian-minds` suite is deferred until Task 8, after docs and release
readiness are aligned; it must remain green from that gate onward.

---

## Task 0: Freeze Baselines and Reconfirm the Consumer Boundary

**Repositories:** all five repositories in the scope table

**Files:** none; this is an evidence checkpoint.

**Step 1: Record immutable checkout evidence**

For each repository, record the absolute path, branch, `git rev-parse HEAD`,
`git status --short --branch`, and `git diff --stat`. For the dirty Believer
checkout, also record a SHA-256 inventory of every changed or untracked file.
Do not stage, stash, clean, reset, switch branches, create a worktree, or commit.

**Step 2: Repeat exact consumer discovery**

Search `/Users/pureicis/dev` outside `.git`, `.ai`, dependencies, and build
output for numbered Worker Mind manifests, symbols, and paths. Classify every
match as active consumer, intentional rejection test, refinery ontology, or
historical record. At the validated 2026-07-13 baseline, Believer is the only
active application consumer. A newly discovered active consumer blocks release
and must receive its own implementation plan.

**Step 3: Record available local candidates**

Verify without publication:

```bash
cd /Users/pureicis/dev/darwinian-minds && bun run cli/index.ts --version
cd /Users/pureicis/dev/darwinian-cards/mind-tools && jq '{name,version,harness,memory}' card.json
cd /Users/pureicis/dev/darwinian-cards/mind-starter && jq '{name,version,harness,memory}' card.json
```

Expected candidate versions are `drwn 0.9.0`, `mind-tools 0.2.0`, and
`mind-starter 0.2.0`. These are working-tree facts, not release evidence.

**Step 4: Save the checkpoint evidence**

Record the commands, outputs, path inventory, and current HEADs in the eventual
Task 84 completion record. Under the execution addendum this replaces the
historical commit checkpoint; it does not authorize publication or reset.

---

## Task 1: Replace the Card Memory Schema

**Files:**

- Modify: `cli/core/card-manifest.ts`
- Modify: `test/core-card-manifest.test.ts`
- Modify: `test/core-card-publish-mind-content.test.ts`

**Step 1: Write failing manifest tests**

Cover observations-only, insights-only, combined, and empty-memory manifests.
Add failures for missing formats, swapped formats, `mixed`, unknown memory
kinds, unknown section fields, all former content/visibility fields,
`raw_data`, and each numbered key. Assert that diagnostics say `memory kind`,
not `memory layer`, and that `raw_data` is called reserved and unsupported.

**Step 2: Run the focused tests and confirm red**

```bash
bun test test/core-card-manifest.test.ts test/core-card-publish-mind-content.test.ts
```

Expected: failures because the implementation accepts `l4/l5/l6`, optional
formats, `mixed`, and non-format fields.

**Step 3: Implement the closed semantic types and validator**

Remove `MemoryLayerName`, `MemoryFormat`, `MemoryLayerManifest`, and
`MEMORY_LAYER_NAMES`. Keep `raw_data` out of the public `MemoryKind` union; it
is a validator diagnostic case, not an active capability.

Validate section keys explicitly rather than routing memory through the generic
persona/beliefs validator. Unknown keys must fail even when their values happen
to look valid.

**Step 4: Run focused tests and typecheck**

```bash
bun test test/core-card-manifest.test.ts test/core-card-publish-mind-content.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add cli/core/card-manifest.ts test/core-card-manifest.test.ts test/core-card-publish-mind-content.test.ts
git commit -m "feat(mind): define semantic memory manifest contract"
```

---

## Task 2: Make Locks and Version Floors Semantic

**Files:**

- Create: `cli/core/mind-capability.ts`
- Modify: `cli/core/card-lock.ts`
- Modify: `cli/core/worker-deploy.ts`
- Modify: `cli/core/worker-graph.ts`
- Modify: `package.json`
- Modify: `cli/core/version.ts`
- Modify: `test/core-card-lock.test.ts`
- Create: `test/core-mind-capability.test.ts`
- Modify: `test/core-worker-deploy.test.ts`
- Modify: `test/core-version.test.ts`
- Modify: `test/core-version-floor.test.ts`

**Step 1: Add failing capability and floor tests**

Define one pure predicate over Card manifests. Test that non-empty persona
includes, non-empty belief includes, observations, and insights each declare a
Mind; empty sections and skills alone do not.

Lock tests must prove:

- no Mind-bearing Card -> floor `0.8.0`;
- any Mind-bearing Card in any installed root -> floor `0.9.0`;
- a Blueprint closure with `mind-tools` -> floor `0.9.0`;
- semantic memory is preserved in both manifest and lock convenience fields;
- a mismatch between those two memory copies is invalid;
- numbered memory in either copy is invalid;
- direct file-ref deployment computes the same `0.9.0` closure floor instead
  of the hard-coded hooks floor.

**Step 2: Run and confirm red**

```bash
bun test test/core-card-lock.test.ts test/core-mind-capability.test.ts test/core-worker-deploy.test.ts test/core-version-floor.test.ts
```

**Step 3: Implement one capability authority and one floor calculator**

Use these constants:

```ts
export const PROJECT_WORKER_MIN_DRWN_VERSION = "0.8.0";
export const WORKER_MIND_MIN_DRWN_VERSION = "0.9.0";
```

Remove the obsolete `MINDS_MIN_DRWN_VERSION = "0.7.0"`. Compute the lock-wide
maximum from the project baseline and Mind capability; do not use active-root
selection when writing a multi-root lock. Compute a direct deploy floor from
the resolved closure, so project and file-ref deploys agree.

Set `package.json` and `DRWN_VERSION` to `0.9.0` in this task so every strict
index, Card, and deploy test runs under the target runtime identity. The
changelog, package-readiness assertions, and publication metadata are finalized
in Task 8 after the implementation surface is complete.

Keep `harness.minVersion: "0.9.0"` on canonical Mind Cards as explicit Card
metadata. Do not broaden this task into a redesign of global non-strict
`drwn write` floor policy.

**Step 4: Enforce lock-copy consistency**

After validating a Card entry's nested manifest and top-level convenience
memory, require semantic equality. Do not silently prefer one copy. Missing
convenience memory may still be normalized from the manifest during lock
creation, as today.

**Step 5: Run tests**

```bash
bun test test/core-card-lock.test.ts test/core-mind-capability.test.ts test/core-worker-deploy.test.ts test/core-version.test.ts test/core-version-floor.test.ts
```

**Step 6: Commit**

```bash
git add cli/core/mind-capability.ts cli/core/card-lock.ts cli/core/worker-deploy.ts cli/core/worker-graph.ts package.json cli/core/version.ts test/core-card-lock.test.ts test/core-mind-capability.test.ts test/core-worker-deploy.test.ts test/core-version.test.ts test/core-version-floor.test.ts
git commit -m "feat(mind): compute semantic capability and version floors"
```

---

## Task 3: Introduce Semantic Paths and a Strict Mind Index

**Files:**

- Modify: `cli/core/mind-store/paths.ts`
- Create: `cli/core/mind-store/mind-index.ts`
- Modify: `cli/core/mind-store/ledger.ts`
- Modify: `test/core-mind-store-paths.test.ts`
- Create: `test/core-mind-store-mind-index.test.ts`

**Step 1: Add failing path tests**

Assert fixed extensions and date-sharded pool/default-view paths for both
kinds. Add a strict pool-path parser used by destructive commands. It accepts
only the two canonical roots, a valid `yyyy-mm-dd` segment, an
`HHmm-<ULID>` filename, and the correct extension. It rejects legacy roots,
`raw_data`, path traversal, wrong extensions, and noncanonical extra segments.

**Step 2: Add failing index parser tests**

Use Zod strict objects for the complete namespaced record. Cover:

- one fully valid index and a valid empty semantic memory object;
- malformed JSON -> `MIND_INDEX_INVALID`;
- missing/different schema -> `MIND_INDEX_UNSUPPORTED`;
- unsupported schema version -> `MIND_INDEX_UNSUPPORTED`;
- the current unnamespaced prototype -> `MIND_INDEX_UNSUPPORTED`;
- malformed provenance, persona, beliefs, ledger, or memory ->
  `MIND_INDEX_INVALID`;
- unknown fields at every owned object boundary -> `MIND_INDEX_INVALID`;
- numbered/reserved kinds and format mismatches -> `MIND_INDEX_INVALID`;
- both errors include reset/reprovision guidance without echoing file content.

**Step 3: Run and confirm red**

```bash
bun test test/core-mind-store-paths.test.ts test/core-mind-store-mind-index.test.ts
```

**Step 4: Implement semantic path helpers**

Rename API symbols:

```text
memoryLayerRoot  -> memoryKindRoot
layer option     -> kind option
LAYER_EXTENSIONS -> MEMORY_EXTENSIONS
```

Both `memoryViewPath` cases include `by-date/<date>`. No helper creates
`raw_data`, a numbered path, or an application-specific pool hierarchy.

**Step 5: Implement strict parsing and wire `readMindIndex`**

`readMindIndex` must parse JSON, classify unsupported identity/version before
shape validation, and return only validated `MindIndex`. `writeMindIndex`
writes the namespaced shape. Preserve `schemaVersion: 1`; this is the first
supported namespaced schema, not a migration of the prototype.

**Step 6: Run tests and typecheck**

```bash
bun test test/core-mind-store-paths.test.ts test/core-mind-store-mind-index.test.ts
```

**Step 7: Commit**

```bash
git add cli/core/mind-store/paths.ts cli/core/mind-store/mind-index.ts cli/core/mind-store/ledger.ts test/core-mind-store-paths.test.ts test/core-mind-store-mind-index.test.ts
git commit -m "feat(mind): add semantic paths and strict index schema"
```

---

## Task 4: Enforce Optional Mind Capability During Provisioning

**Files:**

- Modify: `cli/core/mind-store/project.ts`
- Modify: `cli/core/mind-store/seed.ts`
- Modify: `cli/commands/worker/mind/provision.ts`
- Modify: `cli/commands/worker/mind/status.ts`
- Modify: `cli/commands/worker/mind/sync.ts`
- Modify: `cli/commands/worker/mind/diff.ts`
- Modify: `cli/commands/worker/mind/checkpoint.ts`
- Modify: `cli/commands/worker/mind/doctor.ts`
- Modify: `test/core-mind-store-seed.test.ts`
- Modify: `test/commands-worker-mind.test.ts`
- Modify: `test/core-mind-store-sync.test.ts`
- Modify: `test/mind-substrate-pollution.test.ts`
- Modify: `test/mind-substrate-e2e.test.ts`
- Modify: `test/scenarios-mind-cards-smoke.test.ts`

**Step 1: Write failing closure tests**

Cover a skills-only selected Worker, persona-only, beliefs-only,
observations-only, insights-only, and a multi-root project where only the
inactive root is Mind-bearing. A capability-free selected root must fail with
`MIND_CAPABILITY_NOT_DECLARED` before creating a client-side Mind directory or
`mind.json`. Persona-only and beliefs-only indexes legitimately carry
`memory: {}`.

Every closure-dependent command must run the selected-closure capability
preflight even when `mind.json` is absent. `pool retire` remains a global human
operation and does not require project capability.

**Step 2: Run and confirm red**

```bash
bun test test/core-mind-store-seed.test.ts test/commands-worker-mind.test.ts
```

**Step 3: Carry declaration evidence into loaded content**

Derive capability from the locked manifest, not from whether expected seed
files happen to exist. Add a derived boolean or equivalent typed contribution
to `CardMindContent`; do not duplicate the manifest predicate in seed code.
`seedMind` retains a defensive closure assertion for direct callers.

**Step 4: Replace first-in-stack memory merge**

Compose memory as a set union. Repeated declarations are identical by schema,
so stack order has no format semantics. Create only declared
`memory/observations` and/or `memory/insights` roots. Write the strict index with
`schema`, semantic memory, and `drwnVersion: "0.9.0"`.

**Step 5: Update command help and error rendering**

Replace `memory layers` with semantic memory/kinds. Preserve the public
`drwn worker mind` command grammar. JSON errors must remain stable and must not
turn a capability error into a generic network/provisioning failure.

Update compile-time semantic expectations in the real-Card integration tests
listed above so the removed TypeScript fields do not keep typecheck red. Their
runtime execution remains deferred until Tasks 9-10 convert the sibling Card
sources; Task 6 then completes and executes those journeys.

**Step 6: Run tests**

```bash
bun test test/core-mind-store-seed.test.ts test/commands-worker-mind.test.ts test/core-mind-store-sync.test.ts
bun run typecheck
```

**Step 7: Commit**

```bash
git add cli/core/mind-store/project.ts cli/core/mind-store/seed.ts cli/commands/worker/mind test/core-mind-store-seed.test.ts test/commands-worker-mind.test.ts test/core-mind-store-sync.test.ts test/mind-substrate-pollution.test.ts test/mind-substrate-e2e.test.ts test/scenarios-mind-cards-smoke.test.ts
git commit -m "feat(mind): enforce optional closure capability"
```

---

## Task 5: Align Explicit Unplace, Diagnostics, and Destructive Lifecycle Operations

**Files:**

- Modify: `cli/core/mind-store/client.ts`
- Modify: `cli/commands/worker/mind/doctor.ts`
- Modify: `cli/commands/worker/mind/pool-retire.ts`
- Modify: `test/core-mind-store-client.test.ts`
- Modify: `test/core-fake-bgdb.test.ts`
- Modify: `test/commands-worker-mind.test.ts`
- Modify: `/Users/pureicis/dev/beginning-db/BeginningDB/crates/bgdb-server/src/lib.rs`
- Create: `/Users/pureicis/dev/beginning-db/BeginningDB/tests/unplace_contract.rs`

**Step 1: Write failing diagnostic/lifecycle tests**

Cover:

- semantic pool entries with no Mind view -> `unplaced_pool_entry`;
- semantic Mind views whose inode has no canonical pool placement -> a stable
  `pool_placement_missing` diagnostic;
- by-date and additional by-topic placements without duplicate false alarms;
- legacy and `raw_data` directories ignored as valid inventory and reported as
  unsupported residue where appropriate;
- retire accepts only a canonical observations/insights pool file;
- retire rejects numbered, reserved, malformed, and Mind-view paths before
  stat or delete;
- delete-everywhere still requires confirmation and reports all placements.
- `MindDbClient.unplace()` sends `DELETE ...?action=unplace` exactly;
- explicit unplace returns success for 204, treats 404 as already absent, and
  propagates 409 `last_placement`;
- BeginningDB's production and in-memory HTTP backends both reject explicit
  removal of an inode's final placement;
- plain `DELETE` retains its documented destructive final-placement behavior;
- Darwinian's fake distinguishes plain delete, explicit unplace, and
  delete-everywhere.

**Step 2: Run and confirm red**

```bash
bun test test/core-mind-store-client.test.ts test/core-fake-bgdb.test.ts test/commands-worker-mind.test.ts
cd /Users/pureicis/dev/beginning-db/BeginningDB
cargo test --test unplace_contract
cargo test --test vfs_metadata_truth unplace
```

**Step 3: Correct explicit-unplace behavior upstream**

In BeginningDB's in-memory HTTP backend, inspect the inode's current placement
set before removal. Return the same `409` body/code used by the production VFS
when only one placement remains. Keep plain `DELETE` and
`?action=delete_everywhere` behavior unchanged.

In Darwinian, append `?action=unplace` in `MindDbClient.unplace()`. Treat 404 as
idempotent absence, but do not suppress 409 or any other error. Update the fake
to model all three delete modes and assert the exact request URL so a plain-
delete regression cannot pass against the fake.

**Step 4: Implement recursive semantic walks**

Walk only `/pool/observations`, `/pool/insights`, and the selected Mind's two
semantic roots. Do not treat arbitrary `/pool/*` directories as supported
kinds. For each inode, compare all placements so pool and view health are
assessed from identity rather than filename coincidence.

**Step 5: Apply strict pool parsing to retirement**

Use the parser from Task 3. Update examples to semantic paths. Preserve the
human-only policy and do not add a force bypass.

**Step 6: Run tests and checkpoint**

```bash
bun test test/core-mind-store-client.test.ts test/core-fake-bgdb.test.ts test/commands-worker-mind.test.ts
bun run typecheck
cd /Users/pureicis/dev/beginning-db/BeginningDB
cargo test --test unplace_contract
cargo test --test vfs_metadata_truth unplace
cargo test --test lock_routes locked_copy_place_unplace_and_delete_everywhere_require_current_fencing_token
```

Record separate changed-path allowlists, `git diff --check`, focused results,
and HEADs for Darwinian Minds and BeginningDB. Under the execution addendum, do
not stage or commit either repository.

---

## Task 6: Convert CLI Integration and Real-Store Journeys

**Files:**

- Modify: `test/mind-substrate-e2e.test.ts`
- Modify: `test/mind-substrate-pollution.test.ts`
- Modify: `test/scenarios-mind-cards-smoke.test.ts`
- Modify: `test/e2e-mind-journey.test.ts`
- Modify: any remaining Mind-specific fixtures found by the scoped residue scan
- Create: `test/worker-mind-semantic-residue.test.ts`

**Step 1: Convert integration fixtures**

Use semantic manifests, paths, index assertions, and terminology. Add an E2E
case that writes an observation and insight to canonical pool paths, places
both into by-date views, adds one by-topic insight view, and proves all
placements share the expected inode.

The real BeginningDB journey remains gated by `DRWN_E2E_BGDB=1`. It must test
strict index readback and semantic placement behavior in addition to the
existing persona drift/checkpoint flow.

**Step 2: Add a scoped active-surface residue test**

At this stage, scan maintained CLI code/tests plus the now-converted sibling
`mind-tools` and `mind-starter` sources for numbered keys/paths and removed API
symbols. Use explicit path allowlists and exact patterns. Task 7 expands the
same test to active CLI docs and dedicated Mind-specific skills after those
surfaces are converted. The Task 85 Operator verifier separately proves the
Operator contains no Mind-specific tooling. Exclude historical analyses,
historical changelog entries, generic
software `layer` terminology, and the separate six-layer refinery. Do not
implement an indiscriminate repository-wide ban on `L4`, `L5`, or `L6`.

**Step 3: Run fake/local integration**

```bash
bun test test/mind-substrate-e2e.test.ts test/mind-substrate-pollution.test.ts test/scenarios-mind-cards-smoke.test.ts test/e2e-mind-journey.test.ts test/worker-mind-semantic-residue.test.ts
```

**Step 4: Run real BeginningDB when configured**

```bash
DRWN_E2E_BGDB=1 DRWN_E2E_BGDB_BIN=<path-to-beginningdb> bun test test/e2e-mind-journey.test.ts
```

If no binary or endpoint is available, do not claim the gate passed. Record it
as outstanding and block publication, not code review.

**Step 5: Commit**

```bash
git add test/mind-substrate-e2e.test.ts test/mind-substrate-pollution.test.ts test/scenarios-mind-cards-smoke.test.ts test/e2e-mind-journey.test.ts test/worker-mind-semantic-residue.test.ts
git commit -m "test(mind): cover semantic memory end to end"
```

---

## Task 7: Repair Dedicated Mind Skills and Active CLI Documentation

**Files:**

- Modify: `darwinian-worker-skills/skills/author-mind-content/SKILL.md`
- Modify: `darwinian-worker-skills/skills/audit-mind-visibility/SKILL.md`
- Remove: `darwinian-worker-skills/skills/manage-active-mind-stack/`
- Modify: `darwinian-worker-skills/scripts/card-map.mjs`
- Modify: `darwinian-worker-skills/bundle.json`
- Modify: `darwinian-worker-skills/cards/base-mind/card.json`
- Regenerate: `darwinian-worker-skills/cards/base-mind/skills/**`
- Modify: `.ai/analyses/113_mind-card-engineering-guide.html`
- Modify: `.ai/analyses/114_drwn-worker-cli-architecture.html`
- Modify: `.ai/knowledges/12_mind-card-lifecycle-guide.md`
- Modify: `docs-docusaurus/docs/concepts/beliefs-memories-personas.md`
- Modify: `docs-docusaurus/docs/concepts/minds.md`
- Modify: `docs-docusaurus/docs/guides/authoring-mind-cards.md`
- Modify: `docs-docusaurus/docs/reference/cli/card.md`
- Modify: `docs-docusaurus/docs/reference/schemas/card-manifest.md`
- Modify: `docs/contracts/project-worker-v1.md` when its floor example is
  intended to demonstrate a Mind-bearing graph
- Modify: `README.md` and `docs/cli-quickref.md` only where the active Mind
  contract appears
- Modify: `test/docs-readiness.test.ts`
- Modify: `test/worker-mind-semantic-residue.test.ts`

**Step 1: Repair canonical skill ownership**

- Preserve the Task 85 Operator as an exact Worker/Card-only eight-skill Card.
  Do not add any file below to Operator and do not regenerate
  `cards/operator/skills` in this task.
- `author-mind-content` authors Card-seeded persona and beliefs only. It must
  not claim nonexistent `add-memory`/`remove-memory --layer` commands or in-tree
  Card memory entries.
- `audit-mind-visibility` audits persona/beliefs visibility and reports
  semantic DB-native memory declarations separately; memory has no visibility.
- Remove `manage-active-mind-stack`: project Worker selection belongs to Task
  85 `manage-project-worker`, while live Mind operation belongs to
  `@darwinian/mind-tools`. There is no replacement alias in base-mind.
- Keep `@darwinian/base-mind`, if retained for this release, as a distinct
  Mind-specific Card containing only the corrected authoring and visibility
  skills. It must not duplicate `mind-tools` runtime operations or Operator
  project workflows.

Then run:

```bash
cd darwinian-worker-skills
npm run sync:cards
npm run validate:skills
npm run validate:cards
npm run check:identity
npm run check:paths
```

Do not manually fix the generated Card copies after sync; fix the canonical
skill and rerun sync.

**Step 2: Convert active documentation**

Teach the optional capability predicate, exact manifest shape, strict index,
semantic paths, by-date defaults, additional views, clean reset, and
`raw_data` reservation. Remove documentation for nonexistent memory source
commands. Preserve Analysis 113/114's broader as-built responsibilities while
updating their Worker Mind portions to Analysis 117.

Historical change records remain unchanged except for a new release entry.
Expand the Task 6 residue allowlist to cover these active docs and canonical
Mind-specific skill sources now that they have been converted.

**Step 3: Build docs and run residue tests**

```bash
bun test test/docs-readiness.test.ts test/worker-mind-semantic-residue.test.ts
# Docusaurus build remains deferred by the execution addendum.
```

**Step 4: Commit**

```bash
git add darwinian-worker-skills .ai/analyses/113_mind-card-engineering-guide.html .ai/analyses/114_drwn-worker-cli-architecture.html .ai/knowledges/12_mind-card-lifecycle-guide.md docs README.md test/docs-readiness.test.ts test/worker-mind-semantic-residue.test.ts
git commit -m "docs(mind): teach observations and insights"
```

---

## Task 8: Cut the Local `drwn 0.9.0` Release Candidate

**Files:**

- Modify: `package.json`
- Modify: `cli/core/version.ts`
- Modify: `CHANGELOG.md`
- Modify: `scripts/verify-release-readiness.ts`
- Modify: `test/core-version.test.ts`
- Modify: release/package readiness tests as indicated by fresh failures

**Step 1: Add failing release assertions**

Verify the package/runtime identity already set in Task 2 is `0.9.0`, alongside
the `0.8.0` non-Mind project floor and the `0.9.0` Worker Mind floor. Require
the semantic constants and strict index schema tokens in release readiness. Do
not weaken Task 82 inventory checks.

**Step 2: Finalize release documentation and readiness**

Add a changelog entry that states this is a clean prelaunch contract
replacement with no numbered-memory compatibility or state migration. Update
release/package assertions without changing the already-correct `0.9.0`
runtime identity.

**Step 3: Run the complete CLI gate**

```bash
bun test --timeout 30000 ./test/
bun run typecheck
bun run verify:bridge
bun run verify:release --json
bun run docs:build
npm pack --dry-run --json
```

Expected: all pass, with no Task 82 or Task 83 regression.

**Step 4: Commit but do not publish yet**

```bash
git add package.json cli/core/version.ts CHANGELOG.md scripts/verify-release-readiness.ts test
git commit -m "chore(release): prepare drwn 0.9.0 semantic mind contract"
```

The local `0.9.0` candidate is now the validator used for Card and consumer
work. npm/tag publication waits for Task 15.

---

## Task 9: Release-Candidate `@darwinian/mind-tools@0.2.0`

**Repository:** `/Users/pureicis/dev/darwinian-cards/mind-tools`

**Files:**

- Modify: `card.json`
- Modify: `CONVENTIONS.md`
- Modify: `README.md`
- Modify: `skills/mind-remember/SKILL.md`
- Modify: `skills/mind-search/SKILL.md`
- Modify: `skills/mind-share/SKILL.md`
- Review and modify as needed: `skills/mind-read/SKILL.md`,
  `skills/mind-forget/SKILL.md`

**Step 1: Update the Card contract**

Set:

```json
{
  "version": "0.2.0",
  "harness": { "minVersion": "0.9.0" },
  "memory": {
    "observations": { "format": "jsonl" },
    "insights": { "format": "md" }
  },
  "lastValidatedWith": "0.9.0"
}
```

Update the description without calling memory layered. Preserve zero persona
and zero beliefs.

**Step 2: Rewrite canonical conventions and skills**

Use observations and insights everywhere. Both default views use `by-date`.
`mind-remember` creates immutable date-sharded pool entries. `mind-share`
requires a semantic destination kind, not `<layer>`. `mind-search` searches
semantic roots. `raw_data` is named only as reserved and unavailable.

**Step 3: Validate with the local CLI candidate in an isolated Store**

Stage the source into a temporary `AGENTS_DIR`; do not overwrite a previously
published `0.2.0` in the developer's normal Store while iterating. Run Card
manifest validation, source doctor, publish, apply, provision against fake
BeginningDB, and remember/search/share/forget smoke behavior.
The combined real-Card CLI scenarios run in Task 6 after `mind-starter` is also
converted.

**Step 4: Run scoped residue scan**

Numbered memory terms and paths must be absent from maintained source. Generic
uses of reflection unrelated to persisted kind may remain only when accurate;
all persisted memory instructions use insight.

**Step 5: Commit; do not tag/push yet**

```bash
git add card.json CONVENTIONS.md README.md skills
git commit -m "feat(mind-tools): adopt observations and insights"
```

---

## Task 10: Sync `@darwinian/mind-starter@0.2.0`

**Repository:** `/Users/pureicis/dev/darwinian-cards/mind-starter`

**Files:**

- Modify: `card.json`
- Modify: `README.md`
- Regenerate: `CONVENTIONS.md`
- Regenerate: `skills/**`

**Step 1: Sync from the Task 9 source**

```bash
node scripts/sync-from-tools.mjs
```

Do not hand-edit the copied conventions or five skills.

**Step 2: Update the standalone manifest**

Set version `0.2.0`, `harness.minVersion` and `lastValidatedWith` to `0.9.0`,
and the same semantic memory declaration. Update all five `skills.upstream`
refs to `@v0.2.0`; preserve the exact `git+<url>#skills/<name>@v0.2.0`
grammar. Preserve the generic persona and collaboration belief.

**Step 3: Verify local sync and Card behavior**

```bash
node scripts/sync-from-tools.mjs --check
```

Then use an isolated Store and local `drwn 0.9.0` candidate to validate,
publish locally, apply the starter alone, provision, and assert voice,
collaboration, observations, insights, and strict `mind.json`.

Upstream remote resolution against `v0.2.0` cannot pass until Task 15 pushes
the tools tag. Record that as a release-order gate, not a reason to use a local
path in `skills.upstream`.

**Step 4: Commit; do not tag/push yet**

```bash
git add card.json README.md CONVENTIONS.md skills
git commit -m "feat(mind-starter): sync semantic memory substrate"
```

---

## Consumer Handoff: Believer Task 05

Detailed Believer implementation is intentionally not duplicated here. The sole
authority is:

```text
/Users/pureicis/dev/believer-interview/.ai/tasks/05_worker-mind-semantic-memory-consumer-remediation-plan.md
```

That plan consumes Analysis 11 as validated on 2026-07-13 and owns the Believer
Card, package-manager, publication-integrity, runtime-schema, memory-reader,
operation-journal, API, persistence, browser, script, documentation, and reset-
runbook work.

**Current local state:** Believer's Card baseline, Chief runtime, consultation
and builder surfaces, validated analysis, and Task 05 plan are committed through
`4b38c36`. Commit `f10c7fd` closes the CCH runtime-provider dependency closure,
and `bedf034` records the current checkpoint. The current local gates pass 229
root unit tests, 8 migration integration tests, 15 smoke tests, 25 web tests,
root/web typechecks, the web production build, frozen install, and Wrangler dry
deploy. Task 05 Phase 1 still requires its dedicated package-metadata and
two-pass generated-content idempotence regressions; Phases 2-14 remain
unstarted behind the prerequisite gate below.

**Handoff prerequisites:**

1. Task 5's explicit-unplace contract is green against BeginningDB production
   and in-memory backends plus the Darwinian fake/client.
2. The local `drwn 0.9.0`, `mind-tools@0.2.0`, and
   `mind-starter@0.2.0` candidates pass their Task 84 gates.
3. Believer Task 05 is reviewed as execution-ready and its baseline checkpoint
   preserves the existing dirty Chief/Believer work.
4. No Card publication, project reset, or BeginningDB deletion occurs during
   local implementation.

**Return gate:** Do not enter Task 15 until Believer Task 05 records all local
unit, integration, smoke, fake-E2E, available real-BeginningDB, typecheck, build,
deploy-dry, generated-content, scoped-residue, and publication-preflight gates
green. Any unavailable credentialed journey must be named explicitly and
remains a release blocker when required by Task 15.

---

## Task 15: Cross-Repository Verification, Publication, and Controlled Reset

### 15.1 Full local verification before publication

Run from `darwinian-minds`:

```bash
bun test --timeout 30000 ./test/
bun run typecheck
bun run verify:bridge
bun run verify:release --json
bun run docs:build
```

Under the current execution addendum, do not run `docs:build`; record it as an
outstanding release gate. It must pass before Task 15.2 begins.

Run from `BeginningDB`:

```bash
cargo test --test unplace_contract
cargo test --test vfs_metadata_truth unplace
cargo test --test lock_routes locked_copy_place_unplace_and_delete_everywhere_require_current_fencing_token
```

Run from `darwinian-worker-skills`:

```bash
npm run sync:cards
npm run validate:skills
npm run validate:cards
npm run check:identity
npm run check:paths
```

Run from `mind-starter`:

```bash
node scripts/sync-from-tools.mjs --check
```

Run from `believer-interview`:

```bash
pnpm adapt-card
pnpm test
pnpm typecheck
pnpm build:web
pnpm test:integration
pnpm deploy:dry
```

Run the real BeginningDB journey. Publication is blocked if any required gate
fails or if generated/synced content drifts.

### 15.2 Publish in dependency order

1. Merge the reviewed `darwinian-minds` implementation and use the protected
   release workflow to publish `darwinian@0.9.0`, tag `v0.9.0`, create the
   GitHub release, and smoke-install on supported platforms.
2. Verify an isolated install: `npx --yes darwinian@0.9.0 --version` and a
   temporary global-prefix installation both report `0.9.0`.
3. Tag/push `mind-tools` `v0.2.0`; stage and publish
   `@darwinian/mind-tools@0.2.0` through `drwn 0.9.0`.
4. In `mind-starter`, stage the source and run
   `drwn card source sync @darwinian/mind-starter --check --json` against the
   now reachable tools tag, then tag/push `v0.2.0` and publish
   `@darwinian/mind-starter@0.2.0`.
5. Publish Believer content Cards before their Blueprint dependents:
   `@remyjkim/chief@0.4.0`, `@remyjkim/believer-interview@2.0.0`,
   `@remyjkim/chief-worker@0.4.0`, then
   `@remyjkim/believer-worker@0.2.0`.

Never republish or overwrite an existing immutable Card version. For every
Believer Card, Task 05 must compare `drwn card show file:<source> --json` with
`drwn card show <name>@<exact-version> --json`. An existing version is accepted
only when canonical integrity matches exactly. If it differs, increment that
version and every dependent range consistently; do not suppress the mismatch or
use `--force-bump-mismatch` as an overwrite mechanism.

### 15.3 Reset and reprovision development consumers

Follow `believer-interview/docs/semantic-mind-reset.md` with a human confirming
the tenant, Mind IDs, and path list. Then:

- update project Card refs to the newly published Blueprint versions;
- regenerate namespaced project locks;
- confirm lock floor `0.9.0` and no numbered nested manifests;
- reset only approved disposable development Mind/pool state;
- provision selected Workers;
- run status, doctor, remember, distill, search, share/forget, and pool-retire
  safety checks;
- run the complete Believer Chief/consult/builder journeys.

### 15.4 Final residue and consumer discovery

Repeat the `/Users/pureicis/dev` exact-manifest and exact-path inventory. The
expected active results are:

- semantic declarations only in `mind-tools` and `mind-starter`;
- no redundant memory declaration in the two Believer content Cards;
- no numbered Worker Mind paths, types, or API fields in active consumers;
- numbered L1-L6 references only in the explicitly excluded refinery ontology
  or historical records.

Any unexpected active consumer blocks completion until converted or explicitly
added to an approved follow-up architecture.

---

## Task 16: Completion Evidence and Authority Update

**Files:**

- Modify: `.ai/analyses/117_worker-mind-semantic-memory-target-architecture.md`
- Create: `.ai/tasks/84_completion_worker-mind-semantic-memory.md`

**Step 1: Mark architecture implemented only after rollout**

Update Analysis 117 status with completion date and any approved deviations.
Do not mark it implemented merely because CLI unit tests pass; canonical Card
publication, consumer conversion, reset, and real BeginningDB verification are
part of the objective.

**Step 2: Record evidence**

The completion note includes:

- final branch/commit/tag/remote state for all four repos;
- exact released CLI and Card versions;
- focused/full test counts and commands;
- real BeginningDB configuration mode and result without secrets;
- starter sync/upstream-resolution evidence;
- Believer adapter and generated-content drift evidence;
- before/after reset path inventory and human confirmation, redacted of
  credentials;
- final scoped residue-search commands and results;
- all deviations, skipped optional E2Es, and remaining risks.

**Step 3: Final verification immediately before completion claim**

Re-run the high-signal release, Card sync, consumer, real-store, and residue
gates from Tasks 15.1-15.4. Do not rely on earlier output after subsequent
edits.

**Step 4: Commit the completion record**

```bash
git add .ai/analyses/117_worker-mind-semantic-memory-target-architecture.md .ai/tasks/84_completion_worker-mind-semantic-memory.md
git commit -m "docs(task-84): record semantic memory rollout"
```

---

## Acceptance Checklist

- [ ] `drwn 0.9.0` exposes no numbered Worker Mind memory types or paths.
- [ ] Manifest, lock, and index validation enforce fixed semantic formats.
- [ ] `raw_data` is reserved, rejected, and never materialized.
- [ ] Old locks and unnamespaced indexes fail closed without aliases.
- [ ] Capability-free selected Workers cannot create empty Minds.
- [ ] Persona-only and beliefs-only selected Workers remain valid Minds.
- [ ] Inactive roots do not make the selected Worker Mind-bearing.
- [ ] Mind-bearing multi-root locks and direct deploys require `0.9.0`.
- [ ] Both kinds use immutable date-sharded pool entries and by-date views.
- [ ] BeginningDB production/in-memory backends, Darwinian, and consumer fakes
  agree on explicit unplace, idempotent absence, and final-placement protection.
- [ ] Believer Task 05 proves insight replacement preserves history and moves
  only by-topic views.
- [ ] Doctor diagnoses unplaced pool entries and pool-orphaned views.
- [ ] Pool retirement accepts only canonical semantic pool files and remains
  human-confirmed.
- [ ] `mind-tools@0.2.0` is the single composed substrate owner.
- [ ] `mind-starter@0.2.0` is byte-synced and works standalone.
- [ ] Believer Task 05 public payloads use observations, insights, structured
  receipts, and idempotency with no aliases.
- [ ] Believer Task 05 generated Card content matches canonical `cards/**`
  sources and every generated-content consumer test is green.
- [ ] Active Chief architecture is semantic; refinery L1-L6 remains intact.
- [ ] Disposable development state was reset and reprovisioned deliberately.
- [ ] Fake and real BeginningDB journeys pass.
- [ ] CLI, docs, Card, consumer, release, and scoped residue gates pass from
  fresh runs.
