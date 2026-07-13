# ABOUTME: Defines the first supported drwn Card, Blueprint, Worker, project, and machine-capability contract.
# ABOUTME: Uses clean-slate schema V1 formats and explicitly rejects compatibility with prelaunch prototype state.

# Analysis 116: drwn CLI Card and Worker Target Architecture

**Status**: Revision 5 - clean-slate target revised for architecture review; Task 77 implementation paused

**Date**: 2026-07-13

**Product decision owner**: Remy

**Core implementation plan**: `.ai/tasks/77_drwn-cli-worker-roots-and-defaults-remediation-plan.md`

**Related work**:

- Task 79 Store export security remediation is complete.
- Task 80 must be revised around the machine-profile decisions recorded in section 10.
- Tasks 81-83 remain separate Library lifecycle, portable transfer, and ambient-policy proposals.

**Supersedes**: Prototype project config, lockfile, generated-state, Worker-stack, and project-mutation contracts described in analyses 68/100/101/114 and Task 69. Those artifacts were development scaffolding, not a supported public contract.

**Preserves**: `kind:"blueprint"`, Cards-only Blueprint composition for the first public contract, immutable Card pins, vendored project bytes, managed-path projection, one distribution substrate, and the existing remote deploy payload unless its consumers separately approve a breaking change.

---

## 0. Decision Record

The following decisions are authoritative for Task 77.

1. The target architecture is the first supported public drwn contract.
2. Prelaunch project configs, lockfiles, generated formats, commands, and options receive no backward-compatibility guarantee.
3. Every first supported local format starts at `schemaVersion:1` and carries a namespaced schema identity.
4. Runtime code does not read, normalize, migrate, or dual-write prototype formats.
5. A project installs Worker roots and selects at most one active Worker.
6. A plain Card root is a one-Card Worker. A Blueprint root expands to its ordered Card closure.
7. Workers are alternatives and never form an active stack. Capabilities compose only through Cards in one Blueprint.
8. Only roots receive aggregate generated Worker bundles. Member Cards remain independently pinned, vendored, verified, and attributed.
9. `write` is a pure projection of declared project intent. It does not select a Worker or mutate requirements.
10. Project capability output comes from the active Worker closure plus explicit project overlays. It does not inherit machine capability defaults, profiles, curated directories, or user-home projection bytes.
11. Status and doctor distinguish project declaration from ambient user-home visibility.
12. Existing development consumers are deliberately reset or rewritten during a controlled rollout.
13. The remote deploy payload remains on its current contract unless remote consumers approve a separate breaking change.

The following Task 80 direction is also selected, but not implemented by Task 77.

1. Fresh non-interactive setup starts with explicit empty machine defaults.
2. Guided setup preselects an opt-out Recommended Darwinian Operator profile.
3. The profile is pinned and sourced from `@darwinian/operator`.
4. It may project machine-safe skills and explicitly approved MCP definitions only.
5. It may not project Worker identity, instructions, hooks, permissions, or governance.
6. Machine profiles and explicit machine capability selections are the only machine activation authority.
7. `skills curate` and `skills uncurate` are removed.
8. The first supported machine format is a clean, namespaced schema V1; the prototype machine schema is not migrated.
9. Machine capabilities remain ambient in project sessions. A project that depends on Operator declares the Operator Card inside its selected Blueprint.

Ambient collision enforcement remains a Task 83 decision. Task 77 reports ambient observations but does not add a universal write blocker.

---

## 1. Executive Architecture

The supported composition chain is:

```text
Capability Cards -> one Worker Blueprint -> one selected project Worker -> projection
```

The model has four separate concerns:

| Concern | Authority | Purpose |
|---|---|---|
| Inventory | Library, Catalog, Store | Discover and retain available artifacts |
| Project intent | Project config and lock | Declare roots, one selection, overlays, and immutable Card closure |
| Machine intent | Namespaced machine config | Declare a profile and explicit machine-safe capabilities |
| Projection | Generated state and downstream tool files | Materialize intent; never become intent |

For `/Users/pureicis/dev/darwinian-cards`, Operator, Notion, and Fal are three capability Cards composed by one `@darwinian/darwinian-cards-worker` Blueprint. The project selects that Blueprint as one Worker. The three Cards remain independently authored and published; they are not three active Workers.

---

## 2. Why Worker Stacking Is Rejected

Cards already provide the composition unit. A Blueprint assigns a version, identity, governance boundary, and deployable name to a specific Card composition. Adding Worker stacking above Blueprints would create a second merge language with no defensible behavior for conflicts involving:

- identity and instructions;
- skills with the same ID but different bytes;
- MCP definitions and credential references;
- hook policy and consent;
- permissions, escalation, and eval declarations;
- local overrides and target settings;
- provenance and update ownership.

Multiple installed Workers remain useful as alternatives. Selection chooses one root. Composition changes require publishing or selecting a different Blueprint.

This gives every effective capability one explainable chain:

```text
project -> active root -> pinned Card -> capability bytes -> target projection
```

---

## 3. Canonical Terms

### 3.1 Library

The Library is machine inventory. It answers what artifacts are available, where they came from, and what references depend on them. Presence in the Library does not activate an artifact in a project or at machine scope.

### 3.2 Card

A Card is the independently versioned capability unit. It can provide skills, MCP definitions, hooks, persona/belief/memory content, instructions, and metadata. A plain Card can be used directly as a one-Card Worker root.

### 3.3 Blueprint

A Blueprint is a Card manifest with `kind:"blueprint"` and an ordered `composedFrom` list. In the first supported contract, each member must be a plain Card. Nested Blueprints are rejected to keep closure, precedence, and diagnostics unambiguous.

### 3.4 Worker Root

A Worker root is a top-level project requirement. It is either a plain Card or a Blueprint. Root identity is distinct from closure membership and is recorded explicitly in the lock.

### 3.5 Active Worker

The active Worker is the one selected root in project config. `null` means no project Worker is active. Selection is explicit in supported project state; omission is invalid.

### 3.6 Generated Worker

A generated Worker is an aggregate local bundle compiled from one root and its ordered closure. It is disposable projection state and is never read as project intent.

### 3.7 Deployed Worker

A deployed Worker is a remote runtime created from one immutable root plus its pinned closure. Local schema names do not leak into the existing remote payload contract.

### 3.8 Ambient Capability

An ambient capability is visible through a downstream tool's user-home behavior but is not declared by the project. Ambient visibility is reported separately and never imported into project effective state.

---

## 4. Authority and Data Flow

The supported direction is one-way:

```text
sources/catalogs -> Store/Library -> project requirements -> lock -> effective state
-> generated aggregate -> downstream project files
```

No reverse edge is allowed:

- generated directories do not become requirements;
- downstream tool files do not become project overlays;
- user-home skill directories do not become project defaults;
- machine profiles do not become Card closure members;
- an ID-only MCP toggle cannot pull a definition from an inactive root;
- `write` does not repair or alter project selection.

The authority matrix is:

| Data | Read by project evaluation | Mutated by `write` | Committed |
|---|---:|---:|---:|
| `config.json` | yes | no | yes |
| `card.lock` | yes | no | yes |
| `config.local.json` | yes | no | no |
| vendored Card trees | yes | reconcile only | yes |
| generated Workers | no, output only | yes | no |
| downstream project configs | no, except drift ownership | yes | target-dependent |
| machine config/profile | no capability inheritance | no | machine-owned |
| user-home capability surfaces | ambient diagnostics only | no during project write | machine-owned |

---

## 5. First Supported Local Schemas

Schema identity and schema version are separate. A validator must require both and reject unknown prototype shapes before side effects.

### 5.1 Project Config V1

Canonical shape:

```ts
interface ProjectConfigV1 {
  schema: "drwn.project-config";
  schemaVersion: 1;
  workers: string[];
  activeWorker: string | null;
  skills?: ProjectSkillOverlay;
  mcpServers?: Record<string, ProjectMcpOverlay>;
  hooks?: ProjectHookControls;
  extensions?: ProjectExtensionOverlay;
  targets?: ProjectTargetOverlay;
}
```

Rules:

- `workers` stores ordered root requirement refs, not member Cards.
- `activeWorker` stores a canonical installed root name or `null`.
- every mutating command writes this exact supported shape;
- `cards`, `activeWorkers`, `version`, and stack-shaped activation fields are invalid;
- validators reject unsupported schema identity/version and prohibited fields with `PROJECT_CONFIG_INVALID`;
- readers do not normalize or rewrite invalid input.

The required `activeWorker` field avoids implicit selection. `init` writes `workers:[]` and `activeWorker:null`. Adding the first root may set that root active as an explicit command result.

### 5.2 Project Lock V1

Canonical shape:

```ts
interface ProjectLockV1 {
  schema: "drwn.project-lock";
  schemaVersion: 1;
  store: { minDrwnVersion: string };
  workerRoots: Array<{
    name: string;
    requested: string;
    kind: "card" | "blueprint";
    members: string[];
  }>;
  cards: CardLockEntry[];
}
```

Rules:

- `workerRoots` is the complete root registry in project requirement order;
- each root points to its ordered direct member names;
- `cards` contains every root artifact and every reachable member exactly once;
- every Card entry carries version, integrity, source provenance, and tree SHA where required;
- every root and member reference must resolve to one Card entry;
- incompatible resolutions of the same Card name fail before persistence;
- `lockfileVersion`, flat locks, and prototype versions are rejected;
- no old lock reader, reconstruction heuristic, or write-upgrade path exists.

The filename remains `.agents/drwn/card.lock` because the file pins Card artifacts, even though it also records Worker-root topology.

### 5.3 Local Overlay V1

`.agents/drwn/config.local.json` uses:

```ts
interface ProjectLocalConfigV1 {
  schema: "drwn.project-local";
  schemaVersion: 1;
  activeWorker?: string | null;
  cardReplacements?: Record<string, LocalCardSource>;
  localOnlyRoots?: string[];
  sourceOverrides?: Record<string, LocalCardSource>;
}
```

Local-only roots can be selected only by local config. They never enter committed `config.json` or `card.lock`. Status and doctor report committed and local provenance separately.

### 5.4 Generated State V1

Generated files are self-identifying outputs:

```text
.agents/drwn/generated/
  workers.json              schema drwn.generated-workers, version 1
  active-worker.json        schema drwn.generated-active-worker, version 1
  workers/<scope>/<name>/   one aggregate bundle per root
```

Each aggregate contains the resolved root identity, closure Card provenance, merged capabilities, and generated target adapters. Member Cards never receive sibling Worker directories.

Prototype generated directories are not parsed or migrated. Controlled rollout removes them before first supported materialization. Current-format stale output is reconciled through the managed write record.

---

## 6. Resolution and Selection

Given project root requirements:

```text
R1 = Blueprint(A, B)
R2 = Card(C)
```

the graph is:

```text
roots = [R1, R2]
cards = [R1, A, B, R2]
```

Resolution invariants:

1. Root order follows `workers` requirement order.
2. A Blueprint closure is root first, then members in `composedFrom` order.
3. Shared members are stored once while root membership remains explicit.
4. Same-name incompatible Card artifacts fail with `WORKER_CARD_VERSION_CONFLICT`.
5. Nested Blueprints fail with `BLUEPRINT_MEMBER_IS_BLUEPRINT`.
6. A member name cannot be selected as the active root.
7. `activeWorker:null` yields an empty active closure.
8. A non-null selection must match exactly one installed root.
9. Capability conflicts are checked inside the selected closure and attributed to source Cards.
10. Inactive roots do not contribute skills, MCP definitions, hooks, instructions, or identity.

Project overlays are explicit and remain outside the Blueprint. Their precedence is:

```text
selected root closure -> committed project overlay -> local project overlay
```

Every override must retain provenance. A project MCP enable toggle may select a definition from the active closure or Library only when the project overlay explicitly references that Library definition. It cannot reach into an inactive root by ID.

---

## 7. Command Contract

The first supported project command surface is:

| Command | Effect |
|---|---|
| `drwn init` | create empty supported project config |
| `drwn add <root-ref>` | append one root requirement |
| `drwn apply <root-ref...>` | replace root requirements with explicit selection |
| `drwn remove <root-name>` | remove one root and unreachable members |
| `drwn pin <root-ref>` | replace one requirement with an exact ref |
| `drwn update [root-name]` | re-resolve one or all root graphs within requirements |
| `drwn use <root-name-or-ref>` | select an installed root or add/select a new root, then write |
| `drwn use --none` | persist no active Worker, then write |
| `drwn install [--no-write]` | hydrate the supported lock, then write unless suppressed |
| `drwn write` | project effective state without changing intent |
| `drwn status` | report declared, local, ambient, and projection state |
| `drwn doctor` | diagnose supported state and projection health |

Command rules:

- `apply` with one root selects it explicitly unless `--none` is given;
- `apply` with several roots requires `--active <root>` or `--none`;
- removing the active root sets `activeWorker:null`;
- `use <new-ref>` adds without removing existing alternatives;
- `use --no-write` changes selection only;
- `use --dry-run` changes nothing and reports root, selection, and write actions;
- project mutations prepare and validate complete config/lock bytes before a recoverable local transaction;
- a write failure after `use` reports that selection persisted and does not roll back valid intent.

The following prototype paths do not exist in the supported CLI:

```text
drwn card add|apply|remove|pin|update|detach
drwn worker stack
drwn worker stack use
drwn worker stack clear
drwn install --no-apply
```

They are unregistered ordinary unknown commands/options. There are no warning aliases, moved-command shims, deprecation milestones, or compatibility diagnostics.

Card authoring and distribution remain under `drwn card ...`. Worker authoring/deploy operations remain under `drwn worker ...`. Project requirement mutation is top-level because it acts on Worker roots, which may be Cards or Blueprints.

---

## 8. Pure Projection Contract

`write` receives a complete effective-state object and may mutate only projection-owned surfaces:

- vendored trees and provenance sidecars;
- generated aggregate Workers;
- project target skill directories;
- project MCP target config;
- project hook target config;
- write records and managed-path metadata;
- Git hygiene files owned by the projection contract.

It may not mutate:

- project config or lock;
- root requirements or active selection;
- Card source or published Store bytes;
- machine config or machine profiles;
- user-home target files during project scope;
- unrelated downstream tool fields.

Normal, dry-run, target-only, skills-only, MCP-only, and offline writes must preserve project intent bytes. Failed preflight produces zero projection writes. Repeating a write with unchanged inputs is byte-identical.

---

## 9. Project and Machine Isolation

Project declared capabilities are exactly:

```text
active Worker closure + explicit project overlays + explicit local overlays
```

They exclude:

- machine profile capabilities;
- machine explicit selections;
- machine optional/parallel prototype flags;
- `~/.agents/skills` contents;
- Claude/Codex/Cursor user-home capability files;
- repository compatibility directories such as `claude-only` or `codex-only` unless explicitly declared as project sources;
- inactive installed roots;
- generated output.

Machine capabilities can still be visible at runtime because downstream tools load user-home config. That visibility is ambient, not project declaration. Status and doctor report:

```json
{
  "declaredCapabilities": {},
  "ambientCapabilities": {
    "observations": [],
    "enforcement": "diagnostic-only"
  }
}
```

Task 77 preserves target-specific safety already required to parse or write a valid downstream config, but does not introduce a generic same-ID conflict blocker. Task 83 owns adapter-specific collision policy.

---

## 10. Machine Capability Direction for Task 80

Task 80 must replace its compatibility-oriented plan before implementation.

### 10.1 First Supported Machine Schema

The machine config must identify itself independently from project schemas:

```json
{
  "schema": "drwn.machine",
  "schemaVersion": 1,
  "policy": {},
  "capabilities": {
    "profile": null,
    "skills": [],
    "mcpServers": []
  }
}
```

The exact policy fields and profile metadata belong to Task 80, but these constraints are fixed:

- fresh non-interactive initialization writes explicit empty capability intent;
- guided initialization presents Recommended Darwinian Operator as preselected and opt-out;
- accepting it records an immutable `@darwinian/operator` ref and approved capability subset;
- no directory scan, optional flag, registry fallback, or current projection can seed intent;
- prototype machine schemas are unsupported input and are not migrated;
- machine intent and projection are separate.

### 10.2 Operator Profile Boundary

The Recommended Darwinian Operator profile is a machine capability profile, not a machine Worker. It may project only:

- skills classified as machine-safe by the approved profile contract;
- MCP definitions explicitly approved by the operator/profile policy;
- secret references, never secret values.

It may not project:

- Worker identity or instructions;
- persona, beliefs, or memory;
- hooks or hook consent;
- permissions, governance, escalation, or eval policy;
- project target overlays.

The pinned Card source gives profile capabilities version and provenance. The machine evaluator filters the Card to the allowed subset instead of treating the Card as an active Worker.

### 10.3 Activation Authority

Machine activation comes only from:

1. one selected pinned machine profile; and
2. explicit machine skill/MCP selections.

Library presence remains inventory. `skills curate` and `skills uncurate` are removed. Compatibility directories are projection outputs or foreign ambient state, never activation authority.

### 10.4 Project Relationship

A project does not inherit the machine profile into its declaration or lock. If a project depends on Operator behavior for reproducibility, its Blueprint includes the Operator Card explicitly. The downstream runtime may still expose machine capabilities ambiently; status reports that fact without rewriting project intent.

---

## 11. Library and Store Boundaries

The Library remains valuable as inventory shared across projects:

- resolves installed skill, MCP, Card, and profile artifacts;
- records provenance, version, and integrity;
- supports explicit references from machine or project intent;
- reports references before removal;
- never activates content merely because it is present.

Task 77 needs only read paths required for explicit project overlays. Full remove/update/reference/GC behavior remains Task 81.

Task 79 established the immediate Store export boundary: whole-store export is fail-closed because operational Store state contains credentials and machine-specific records. A later portable export format remains Task 82 and must allowlist inventory content rather than archive the Store directory.

Secrets remain operator state. Lockfiles, generated Workers, status JSON, deployment fixtures, and export artifacts contain secret references only.

---

## 12. Remote Deploy Contract

The local clean-slate schemas do not imply a remote payload change.

The existing remote payload already represents one root plus closure:

- `entrypoint` identifies one root;
- payload lock cards contain that root and every pinned member;
- integrity and tree SHA remain mandatory where currently required;
- remote `contractVersion:1` and its embedded payload shapes remain unchanged.

The local adapter translates `drwn.project-lock` V1 into the existing deploy payload. It must not forward local schema names or assume the remote consumer understands them. Any remote change requires separate consumer confirmation, contract fixtures, and rollout planning.

---

## 13. Controlled Consumer Rollout

There is no automated prototype migration.

For each known development project:

1. Inventory the Card sources and intended composition outside project-generated state.
2. Publish the required aggregate Blueprint.
3. Back up or record the prototype project declaration for human reference only.
4. Remove prototype project config, lock, local generated state, and managed projection according to the rollout checklist.
5. Initialize a supported `drwn.project-config` V1 project.
6. Apply and select the published Blueprint.
7. Run `write`, status, doctor, and smoke workflows.
8. Review resulting project and ambient capability reports.

For `darwinian-cards`, preserve these Card sources:

```text
@remyjkim/fal@^0.2.0
@darwinian/operator@^1.0.0
@leeminseung/notion@0.1.0
```

Publish `@darwinian/darwinian-cards-worker` with those ordered members, then reset the non-Git parent workspace into the supported project schema. Do not initialize Git in the parent. Update `mind-tools/README.md` and `mind-starter/README.md` in their independent repositories through separate commits after successful rollout.

Unknown external users are not a rollout concern because the prototype was not a supported public contract.

---

## 14. Errors and Diagnostics

Stable target errors describe current supported state, not migration history:

| Code | Meaning |
|---|---|
| `PROJECT_CONFIG_INVALID` | Missing/wrong schema identity, unsupported version, prohibited field, or invalid value |
| `PROJECT_LOCK_INVALID` | Missing/wrong schema identity, unsupported version, or invalid graph/pin |
| `WORKER_ROOT_NOT_INSTALLED` | Requested root is not installed |
| `ACTIVE_WORKER_NOT_INSTALLED` | Config/local selection does not name a root |
| `MULTIPLE_WORKERS_REQUIRE_SELECTION` | A mutation supplied alternatives without explicit selection |
| `WORKER_ROOT_DUPLICATE` | The same root appears more than once |
| `WORKER_MEMBER_DUPLICATE` | A Blueprint repeats a member |
| `WORKER_CARD_VERSION_CONFLICT` | Roots resolve one Card name to incompatible artifacts |
| `BLUEPRINT_MEMBER_IS_BLUEPRINT` | A Blueprint directly contains another Blueprint |
| `WORKER_CAPABILITY_CONFLICT` | Selected closure contains incompatible same-ID capabilities |
| `MCP_DEFINITION_NOT_EFFECTIVE` | A project toggle references no active-closure or explicit Library definition |
| `PROJECT_STATE_TRANSACTION_BUSY` | Another live project mutation owns the transaction lock |
| `PROJECT_STATE_TRANSACTION_RECOVERY_FAILED` | Prepared config/lock bytes cannot be safely recovered |

There are no `LEGACY_*`, `WORKER_STACK_UNSUPPORTED`, `COMMAND_MOVED`, schema-upgrade, or migration-required diagnostics in the supported runtime.

Unknown prototype commands fail through Clipanion's ordinary syntax/option handling and perform no mutation.

---

## 15. Acceptance Invariants

Task 77 is complete only when all of these hold.

1. New project config, lock, local overlay, and generated records use namespaced schema V1 formats.
2. Prototype project and lock shapes are rejected and never normalized, migrated, or rewritten.
3. Production code contains no legacy project/lock readers or dual-read/write paths.
4. Multiple roots are alternatives; at most one root is active.
5. One selected Blueprint produces one aggregate Worker bundle with its full ordered Card closure.
6. Member Cards remain independently pinned, vendored, integrity-checked, and attributed.
7. Members and inactive roots cannot be selected or activated by capability ID.
8. Project mutation commands commit config and lock together or leave both unchanged.
9. `write` preserves project config and lock bytes in every mode and on preflight failure.
10. Project writes are byte-independent from machine profile/default changes and undeclared user-home/repository capability directories.
11. Status and doctor share one effective-state evaluator and separate declared, local, ambient, and projection state.
12. Machine capabilities remain diagnostic-only ambient observations in Task 77.
13. Prototype Card mutation paths, Worker stack paths, and `install --no-apply` are absent, not aliased.
14. Card capture includes one active closure plus explicit project overlays, never inactive or machine capabilities.
15. Mind and deploy consumers receive one root plus closure.
16. The remote deploy fixture remains byte-contract compatible.
17. Whole-store export remains fail-closed and no credential-bearing archive path is reintroduced.
18. `darwinian-cards` rollout preserves its three Card sources and selects one published aggregate Blueprint.
19. Unit, integration, shell smoke, E2E where available, release, bridge, and documentation checks pass.

---

## 16. Non-Goals and Follow-Ups

Task 77 does not implement:

- compatibility with any prototype project or lock format;
- an automated project migration or adoption command;
- the Task 80 machine schema/profile implementation;
- complete Library remove/update/reference/GC behavior;
- portable Store export/seed;
- Store-wide transaction infrastructure beyond project config/lock needs;
- universal ambient collision enforcement;
- nested Blueprints;
- a new remote deploy payload contract;
- implicit Git initialization in consumer workspaces.

Task allocation:

| Task | Scope | Decision state |
|---|---|---|
| 79 | Disable credential-bearing whole-Store export | complete |
| 80 | Clean machine schema V1, empty non-interactive setup, guided Operator profile, explicit selections, curation removal | selected direction; plan revision required |
| 81 | Complete Library lifecycle and persistence | proposed |
| 82 | Portable allowlisted inventory transfer | proposed |
| 83 | Per-target ambient collision policy | proposed |

---

## 17. Evidence and Revision History

The architecture is based on:

- direct review of current project config, lock validation, effective-state, skill/MCP evaluation, generated Worker, write, Store export, and command registration code;
- focused baseline tests for defaults, skill sync, effective state, MCP add/list, Codex collision behavior, and root-scope projection;
- a read-only inventory of `/Users/pureicis/dev/darwinian-cards` and its three current materialized Cards;
- prior analyses 13, 43, 66, 68, 90, 99, 100, 101, and 114;
- coworker review that separated ratified Worker decisions from unapproved Library/ambient/export additions;
- the 2026-07-13 mentor directive that the prelaunch target is the first supported public contract.

Revision 4 was compatibility-oriented: project config V2, lock V6, prototype readers, migration diagnostics, moved-command shims, and a bounded `--no-apply` alias. Those choices are superseded by this revision.

Task 77 implementation commits based on Revision 4 were reverted in `c935997`, restoring the verified post-Task-79 source tree before this clean-slate plan is reviewed.
