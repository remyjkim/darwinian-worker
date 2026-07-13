# ABOUTME: Defines the first supported semantic-memory contract for the optional DB-backed Mind attached to a Worker.
# ABOUTME: Replaces numbered L4/L5/L6 Worker Mind vocabulary with observations and insights, reserves raw_data for future work, and specifies the clean prelaunch rollout.

# Analysis 117: Worker Mind Semantic Memory Target Architecture

**Date**: 2026-07-13
**Author**: Codex + Remy
**Status**: Approved target architecture; CLI and base-Mind implemented locally, upstream/consumer rollout pending
**Supersedes in part**: Analysis 110 sections 1, 3.1, 4.1, 4.3, 9, 10, 12, and 13 wherever they define numbered Worker Mind memory
**Amends**: Analysis 115 only for the memory declaration carried by `@darwinian/mind-tools` and `@darwinian/mind-starter`
**Complements**: Analysis 116, which remains authoritative for Card, Blueprint, Worker, project, and machine architecture
**References**: [`.ai/analyses/110_mind-card-target-architecture.md`, `.ai/analyses/115_mind-substrate-split-architecture.md`, `.ai/analyses/116_drwn-cli-card-worker-target-architecture.md`, `cli/core/card-manifest.ts`, `cli/core/card-lock.ts`, `cli/core/mind-store/`, `/Users/pureicis/dev/darwinian-cards/mind-tools/`, `/Users/pureicis/dev/darwinian-cards/mind-starter/`, `/Users/pureicis/dev/believer-interview/`, `/Users/pureicis/dev/beginning-db/BeginningDB/`]

---

## 0. Approved Decisions

This architecture records the following approved product decisions:

1. The change applies to the optional Worker Mind capability only.
2. The separate six-layer mind-refinery ontology remains supported and unchanged.
3. Worker Mind memory no longer exposes numbered layers or a generic layer abstraction.
4. The first iteration has two active semantic memory kinds:
   - `observations`, stored as JSONL;
   - `insights`, stored as Markdown.
5. `raw_data` is the reserved semantic name for a future memory kind, but it is not operational in the first iteration.
6. Existing Worker Mind state is disposable development state. The rollout is a clean prelaunch break with no aliases, compatibility reader, lazy conversion, or migration command.
7. The canonical Card ownership split remains:
   - `@darwinian/mind-tools` owns Mind operating skills and conventions;
   - `@darwinian/mind-starter` is the standalone quickstart with synced skills plus generic persona and belief seeds.

---

## 1. Problem and Root Cause

The current Worker Mind implementation uses `l4`, `l5`, and `l6` as durable contract values. They appear in:

- Card manifests and project locks;
- TypeScript types and validators;
- `mind.json` indexes;
- BeginningDB pool and Mind view paths;
- path helpers, seed composition, diagnostics, command examples, and tests;
- `mind-tools` and `mind-starter` manifests, conventions, and skills;
- application-level consumer types, APIs, storage receipts, prompts, UI payloads, and tests;
- active architecture and product documentation.

The numbered names originated in the separate mind-refinery model. In the optional Worker Mind system, however, only two values have live behavior: L5 means observations and L4 means insights or reflections. The numbers add an ontology users must memorize without adding runtime information. L6 is accepted by the schema despite having no supported runtime behavior, which creates a false-support state.

This is not a presentation-only problem. Renaming labels without changing manifests, persisted indexes, and paths would leave two competing contracts. The remediation must remove numbered terms at every active Worker Mind boundary.

---

## 2. Scope Boundary

### 2.1 In scope

- the optional Mind attached to a Worker;
- Card declarations that opt a Worker closure into Mind state;
- project-lock copies of those declarations;
- BeginningDB Mind indexes, pool roots, and memory views;
- `drwn worker mind` behavior and diagnostics;
- the canonical Mind Cards and their synced content;
- active application consumers of the Worker Mind storage contract;
- active engineering, lifecycle, schema, and CLI documentation.

### 2.2 Explicitly out of scope

- `darwinian-l6-mind`, `l6-mind-collections`, `mind-chat`, and other six-layer refinery products;
- static L1-L6 figure-mind or Harari content and runtime assets;
- unrelated software uses of the word `layer`, such as configuration precedence or test tiers;
- a `raw_data` implementation, attachment ingestion, binary storage, extraction, or retention policy;
- BeginningDB authorization changes, org-level pools, memory history, or server-side create-and-place transactions;
- changes to the remote Worker deploy payload or the deploy service's legacy `mindId` field.

Historical analyses remain historical evidence. They are not rewritten to pretend the old terms never existed.

---

## 3. Target Mental Model

A Worker has zero or one Mind. The Mind is optional live state in BeginningDB, seeded from one selected Worker closure.

```text
Worker closure
  |
  | contributes persona, beliefs, or active memory declarations
  v
optional Mind
  +-- persona
  +-- beliefs
  +-- memory
        +-- observations
        +-- insights
        +-- raw_data      (reserved future kind; absent in the first iteration)
```

Cards remain the reviewed checkpoint lineage for persona and belief seeds. BeginningDB remains the living state. Memory entries remain DB-native and pool-canonical, and Mind memory trees remain placement views.

### 3.1 Canonical vocabulary

| Term | Meaning | First-iteration storage |
|---|---|---|
| `observation` | A captured fact, event, result, decision, commitment, or evidence item | A JSON object in a capture-context `.jsonl` file |
| `insight` | A durable interpretation synthesized from one or more observations | One Markdown document with provenance front matter |
| `raw_data` | A future source artifact or unprocessed input from which observations may be extracted | Unsupported and unmaterialized |
| memory kind | A semantic class of Worker Mind memory | `observations` or `insights` in the first iteration |

The conceptual future flow is:

```text
raw_data -> observations -> insights
```

The flow does not require every observation to originate from managed raw data, and it does not require every observation to produce an insight.

`reflection` may describe an agent action, but it is not a persisted memory kind. A reflection operation produces or updates an insight.

---

## 4. Card and Lock Contract

### 4.1 First supported manifest shape

```json
{
  "memory": {
    "observations": { "format": "jsonl" },
    "insights": { "format": "md" }
  }
}
```

The TypeScript contract is semantic and closed:

```ts
export type MemoryKind = "observations" | "insights";

export interface MemoryManifest {
  observations?: { format: "jsonl" };
  insights?: { format: "md" };
}

export const MEMORY_KINDS = ["observations", "insights"] as const;
```

There is no public `MemoryLayerName`, no generic `MemoryFormat`, and no `mixed` format. Formats are properties of the semantic kinds, not author-selected combinations.

### 4.2 Validation rules

The manifest validator must enforce all of the following:

1. `memory` is an object when present.
2. Its only active keys are `observations` and `insights`.
3. `observations.format` is required and must equal `jsonl`.
4. `insights.format` is required and must equal `md`.
5. Memory declarations reject `include`, `visibility`, `exclude`, `shared`, and unknown fields.
6. `raw_data` fails with a specific message stating that the name is reserved but unsupported in the first iteration.
7. `l4`, `l5`, `l6`, and any other key fail as unsupported memory kinds. The error does not silently translate them.

Project-lock validation repeats the same closed semantic checks. It must not trust a nested manifest merely because the outer lock is valid.

### 4.3 Composition

Memory declarations compose as a set union over the selected Worker closure:

- a Card may declare observations, insights, both, or neither;
- repeated declarations are identical by construction because each kind has one fixed format;
- stack order does not decide a format and cannot create a format conflict;
- an empty `memory` object contributes no capability.

The current first-in-stack-wins merge is removed because it solves a conflict the target schema makes impossible.

### 4.4 Project lock version

`drwn.project-lock` remains schema V1. Its root graph and outer record contract do not change. The nested Card manifest contract changes before public launch, and old locks fail closed when they contain numbered memory keys.

Operators regenerate project locks from newly published Cards. There is no lock migration path.

### 4.5 Runtime version floor

The first semantic Worker Mind contract requires `drwn >= 0.9.0`. A project
lock containing any Mind-bearing Card in any installed Worker closure records
`store.minDrwnVersion: "0.9.0"`; a lock with no Mind-bearing Card retains the
non-Mind project floor. The floor is lock-wide because the lock contains every
installed Worker root and any of them may later become selected.

The same closure-level calculation applies when `worker deploy` resolves a
Card or Blueprint directly from a file or Store ref. Direct deployment must not
fall back to the older hooks-only floor. Canonical Mind Cards also declare
`harness.minVersion: "0.9.0"` as explicit Card compatibility metadata. The
semantic manifest validator, generated project-lock floor, and direct-deploy
floor are the enforcement boundaries for this iteration; the work does not
redesign the existing global non-strict `drwn write` warning policy.

---

## 5. Optional Mind Capability

A selected Worker closure is Mind-bearing if at least one locked Card contributes any of:

- a non-empty persona include;
- a non-empty beliefs include;
- an `observations` declaration;
- an `insights` declaration.

Skills alone do not implicitly create a Mind. `@darwinian/mind-tools` remains Mind-bearing because it explicitly declares observations and insights.

Closure-dependent `drwn worker mind` commands must evaluate this predicate before mutating or interpreting Mind state. Provisioning a capability-free Worker fails with a stable `MIND_CAPABILITY_NOT_DECLARED` error and guidance to compose a Mind-bearing Card. It must not write an empty index.

The deploy platform may continue minting a `mindId` and binding coordinates for every deployed Worker. That identifier is a platform identity contract, not evidence that a BeginningDB Mind subtree has been provisioned.

---

## 6. BeginningDB Storage Contract

### 6.1 Canonical roots and default views

```text
<owner filesystem>/
├── minds/
│   └── <mindId>/
│       ├── persona.md
│       ├── beliefs/<card>/<entry>/BELIEF.md
│       ├── memory/
│       │   ├── observations/by-date/<yyyy-mm-dd>/<HHmm>-<ulid>.jsonl
│       │   └── insights/by-date/<yyyy-mm-dd>/<HHmm>-<ulid>.md
│       └── mind.json
└── pool/
    ├── observations/<yyyy-mm-dd>/<HHmm>-<ulid>.jsonl
    └── insights/<yyyy-mm-dd>/<HHmm>-<ulid>.md
```

Both default views use an explicit `by-date` segment. This resolves the current disagreement among the CLI helper, `mind-tools` instructions, and application consumers.

### 6.2 Additional views

BeginningDB placements allow an entry to appear under additional semantic views without copying content. For example:

```text
/minds/<mindId>/memory/insights/by-topic/<topic>/<filename>.md
```

The CLI owns canonical roots and default path helpers. Applications may create additional view paths under the correct memory-kind root, but may not invent alternative top-level memory kinds.

Every newly created canonical pool entry still uses the date-sharded path from
section 6.1. Application-specific organization belongs in additional Mind view
placements, not in an alternative pool hierarchy. Replacing a topic view means
unplacing that view and placing the new immutable pool entry at the same
semantic view path; it does not overwrite or rename the prior pool entry.

### 6.3 Entry units and provenance

Observations preserve the current unit of one JSONL file per capture context, typically one session or one ingestion batch. Each line is one observation. A single writer owns a capture-context file because BeginningDB PATCH is offset-based and not an atomic multi-writer append.

Insights preserve the current unit of one Markdown file per insight. Front matter carries at least the timestamp and observation provenance expected by the producing application, including `derivedFrom` identifiers where available. Body and application-specific metadata remain consumer-owned; this architecture does not impose a new universal observation payload schema.

### 6.4 Placement lifecycle

The existing lifecycle remains unchanged apart from semantic paths:

1. Remember: create in the pool with `If-None-Match: *`, then place into the owning Mind view.
2. Share: place the same inode into another Mind view in the same filesystem.
3. Forget: unplace only the requesting Mind's view.
4. Retire: human-only `delete_everywhere` through `drwn worker mind pool retire`.
5. Doctor: report unplaced pool entries and surviving views whose canonical pool placement is missing.

BeginningDB already supports durable MOVE while preserving inode identity, but the approved clean reset means the first implementation does not add a migration engine or require MOVE.

### 6.5 `raw_data` placeholder

The first iteration creates no `/pool/raw_data` or `/memory/raw_data` directory. It defines no extension, payload schema, size policy, extraction pipeline, sharing policy, or retention rule for raw data.

The name is reserved in this architecture to prevent a future return to numbered vocabulary. Activating it requires a separate approved architecture and a schema change that defines its complete lifecycle.

---

## 7. `mind.json` Contract

The existing index has `schemaVersion: 1` but no schema identity and is deserialized with an unchecked cast. The target replaces that prototype with the first supported namespaced Mind index:

```json
{
  "schema": "drwn.mind-index",
  "schemaVersion": 1,
  "mindId": "mind_abc",
  "worker": {
    "card": "@team/reviewer-worker",
    "version": "1.0.0",
    "integrity": "sha256-..."
  },
  "cards": [],
  "persona": { "path": "persona.md", "entries": [] },
  "beliefs": { "entries": [] },
  "memory": {
    "observations": { "format": "jsonl" },
    "insights": { "format": "md" }
  },
  "ledger": [],
  "drwnVersion": "0.9.0"
}
```

The reader must validate schema identity, version, required fields, arrays, provenance rows, ledger rows, and the closed memory object. It must reject:

- the current unnamespaced prototype;
- unknown schema versions;
- numbered or reserved memory keys;
- mismatched semantic formats;
- malformed provenance or ledger rows.

Stable failures distinguish invalid content from an unsupported schema:

- `MIND_INDEX_INVALID` covers malformed JSON and shape/content violations
  within the supported schema identity and version;
- `MIND_INDEX_UNSUPPORTED` covers a missing or different schema identity and
  any unsupported schema version, including the current unnamespaced
  prototype.

Both errors direct the operator to reset and reprovision disposable development
state. Neither error triggers a compatibility reader or automatic rewrite.

---

## 8. CLI and API Contract

The public command grammar remains:

```text
drwn worker mind provision
drwn worker mind status
drwn worker mind sync
drwn worker mind diff
drwn worker mind checkpoint
drwn worker mind doctor
drwn worker mind pool retire <pool-path> --yes
```

Command help, JSON fields, diagnostics, comments, and examples use observations, insights, memory kinds, and semantic paths. No command accepts `--layer` for Worker Mind memory.

The remote deploy request, response, `mindId`, token endpoint, binding coordinates, and `BGDB_*` environment contract remain unchanged. The storage-path change is internal to the owner filesystem and consumers of that filesystem.

---

## 9. Canonical Card Contract

### 9.1 `@darwinian/mind-tools`

`mind-tools` is the canonical source for:

- the five Mind operating skills;
- `CONVENTIONS.md`;
- the observations and insights manifest declaration;
- semantic path and deletion conventions.

It carries no persona or beliefs.

### 9.2 `@darwinian/mind-starter`

`mind-starter` remains the standalone quickstart. It carries:

- the same observations and insights declaration;
- the generic voice persona;
- the collaboration belief;
- synced copies of `mind-tools` skills and conventions.

Release order is `mind-tools` first, then sync, verify, version, and publish `mind-starter`. Upstream skill refs in the starter pin the new `mind-tools` release.

Neither Card declares `raw_data` in the first iteration.

### 9.3 Composed content Cards

A content Card composed beneath `@darwinian/mind-tools` should not repeat the
observations or insights declaration. Its persona, beliefs, and domain skills
still make the selected closure Mind-bearing; `mind-tools` supplies the shared
operating contract exactly once. A Card may carry its own semantic memory
declaration only when it intentionally supports standalone use without
`mind-tools`.

The Believer and Chief Worker Blueprints follow the canonical composition, so
their content Cards remove the redundant memory blocks during rollout. The
Blueprint closures remain Mind-bearing through their content plus
`mind-tools`, while the substrate remains the single authority for formats and
operating conventions.

---

## 10. Clean-Break and Rollout Policy

The implementation deliberately provides no backward compatibility for Worker Mind memory.

### 10.1 Rejected compatibility mechanisms

- no `l4 -> insights` or `l5 -> observations` aliases;
- no dual-read or dual-write paths;
- no manifest normalization of numbered keys;
- no lazy `mind.json` rewrite;
- no BeginningDB path migration command;
- no support for `l6` as an alias of `raw_data`;
- no hidden compatibility in application API payloads.

### 10.2 Required reset sequence

1. Land and release the CLI semantic contract.
2. Publish semantic-memory versions of `mind-tools` and `mind-starter`.
3. Update and publish affected Worker Cards and Blueprints.
4. Regenerate project locks using the new Card versions.
5. Update active application consumers.
6. Delete disposable development Mind subtrees and affected pool entries.
7. Reprovision from the selected Worker closure.
8. Run the complete Mind journey against fake and real BeginningDB surfaces.

Backups may be taken for debugging, but they are not accepted as importable state under the new contract.

---

## 11. Repository Impact

| Repository or surface | Required change |
|---|---|
| `darwinian-minds` CLI | Types, manifest validation, lock validation, capability detection, path helpers, strict index reader, seed merge, command text, diagnostics, tests, version floor |
| `darwinian-minds` dedicated Mind skills | Remove stale numbered-memory and nonexistent Card memory-authoring guidance; align visibility audits with DB-native memory; keep the Task 85 Operator Card free of Mind-specific tooling |
| `darwinian-minds` docs | Update active Mind architecture, lifecycle, schema, CLI, authoring, troubleshooting, and release documentation |
| `darwinian-cards/mind-tools` | New manifest, semantic conventions, semantic skill instructions, release |
| `darwinian-cards/mind-starter` | Sync from tools, new manifest, new upstream pins, release |
| `believer-interview` | Rename manifests, types, path helpers, memory logic, prompts, APIs, UI payloads, persisted receipt keys, fixtures, and tests; reset dev state |
| BeginningDB | No product code change required; generic VFS paths and placements already support the target |
| studio deployment | No API or persistence change required for this iteration |
| six-layer refinery repositories | No change |

---

## 12. Testing and Acceptance Gates

### 12.1 Schema and lock

- valid observations-only, insights-only, and combined manifests pass;
- exact format mismatches fail;
- missing formats and unknown section fields fail;
- `raw_data` fails with a reserved-kind diagnostic;
- `l4`, `l5`, and `l6` fail without normalization;
- project locks preserve valid semantic declarations and reject numbered ones.

### 12.2 Optional capability

- a Worker with no persona, beliefs, observations, or insights cannot be provisioned;
- persona-only and beliefs-only Workers remain valid Minds;
- `mind-tools` and `mind-starter` remain Mind-bearing;
- inactive Worker roots never contribute Mind capability.

### 12.3 Storage and index

- path helpers emit only semantic roots and fixed extensions;
- observations and insights default to `by-date` Mind views;
- pool placements preserve inode identity and semantic paths;
- seed writes a strict namespaced index;
- old or malformed indexes fail closed with stable errors;
- provision remains idempotent for a valid semantic index.

### 12.4 Canonical Cards and consumer

- real Card smoke tests load both new manifests;
- starter sync drift checks pass;
- Mind remember, search, share, forget, and pool retirement use semantic paths;
- Believer APIs expose `observations` and `insights`, not `l5` and `l4`;
- application persistence contains no newly written numbered receipt keys or paths.

### 12.5 Documentation and residue

An active-surface residue check must find no Worker Mind use of:

- `L4`, `L5`, or `L6`;
- `l4`, `l5`, or `l6` manifest/path keys;
- `MemoryLayerName`, `MEMORY_LAYER_NAMES`, or `memoryLayerRoot`;
- claims that Worker Mind memory has configurable layers or formats.

The check explicitly excludes historical analyses, historical changelog entries, unrelated software-layer terminology, and the separate six-layer refinery repositories.

---

## 13. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| A hidden consumer continues reading numbered paths | Source-wide exact-path inventory, consumer contract tests, fail-closed old index and lock validation |
| `raw_data` appears supported before it is designed | Reserve the term in architecture and validator diagnostics, but reject it in manifests and create no directories |
| Generic format flexibility reintroduces invalid combinations | Encode fixed literal formats in the type and repeat checks at manifest, lock, and index boundaries |
| Capability-free Workers acquire empty Minds | Centralize and test one closure-level Mind-capability predicate |
| Active docs get ahead of code | Publish Analysis 117 now; update as-built guides 113 and 114 only in the implementation completion phase |
| Historical six-layer content is accidentally rewritten | Scope residue checks to Worker Mind surfaces and preserve the explicit refinery exclusion |
| Concurrent Task 82 work is disturbed | Keep implementation and commits scoped away from inventory-transfer modules and tests |

---

## 14. Authority and Handoff

After approval:

- Analysis 116 remains the authority for Card, Blueprint, Worker, project, and machine contracts.
- This Analysis 117 is the authority for optional Worker Mind and semantic memory.
- Analysis 115 remains the authority for `mind-tools` versus `mind-starter` ownership, except that this document replaces its numbered memory declaration.
- Analysis 110 remains the historical implemented baseline and decision lineage, with its numbered memory details superseded.
- Analyses 113 and 114 remain as-built guides until the implementation lands, then must be revised to match this contract.

Implementation must proceed through a separately reviewed task plan. The plan must use TDD, isolate commits by contract boundary and repository, preserve concurrent Task 82 work, and end with controlled Card publication, consumer reset, real BeginningDB verification, documentation alignment, and residue scans.
