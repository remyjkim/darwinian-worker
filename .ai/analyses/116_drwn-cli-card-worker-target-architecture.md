# ABOUTME: Partially ratified target architecture for drwn Worker roots, singular project activation, and project-versus-machine capability isolation.
# ABOUTME: Separates approved Worker decisions from verified defects, proposed follow-up policies, and unresolved product decisions.

# Analysis 116: drwn CLI Card and Worker Target Architecture

**Status**: Partially ratified - Worker core approved; follow-up policies proposed or blocked on explicit decisions

**Date**: 2026-07-12

**Product decision owner**: Remy

**Technical author**: Codex, revised after coworker review

**Core implementation plan**: `.ai/tasks/77_drwn-cli-worker-roots-and-defaults-remediation-plan.md`

**Follow-up plans**: Tasks 79-83 cover the Store export hotfix, machine defaults, Library lifecycle, portable Store transfer, and ambient conflict policy. Store-wide concurrency beyond those scoped plans remains unplanned in this revision.

**Supersedes in ratified scope only**: The flat Worker materialization, implicit all-workers-active, ordered `activeWorkers` stack decisions, and multi-Card project activation advice in analyses 68/100/101/114 and Task 69. It also supersedes only the claim that machine defaults are an implicit project composition layer. It does not supersede prior fresh-install bootstrap, complete Library lifecycle, Store transfer, or target-specific ambient conflict policy without a separate decision.

**Preserves**: Blueprint-as-`kind:"blueprint"`, Cards-only Blueprint composition for V1, one distribution substrate, vendored project materialization, and Blueprint deploy by immutable ref.

---

## 0. Decision classification

This document contains four different kinds of statement. They are intentionally separated so investigation does not become product policy by implication.

### 0.1 Ratified core

- A project installs Worker roots and selects at most one active Worker.
- A plain Card root is a one-Card Worker; a Blueprint root expands to its ordered Card closure.
- Workers are alternatives and are never stacked. Capability composition occurs through Cards in one Blueprint.
- Only roots receive generated Worker bundles; members remain independently locked, vendored, verified, and attributed.
- `write` materializes selected intent and never selects a Worker or changes project requirements.
- Project capability output is defined by the active Worker closure plus explicit project overlays, not by machine capability defaults or curated compatibility directories.
- Machine defaults remain a narrow user-home mechanism with machine-owned intent; they are not project dependencies.
- A legacy V1 project with several top-level Cards and no selection fails closed because 0.7.0 composed all of them. It cannot be silently reclassified as alternative Workers.
- Status and doctor must distinguish project-declared state from ambient user-home visibility.
- Local root overrides and deploy payloads preserve one-root-plus-closure semantics.

### 0.2 Verified findings

The repository currently contains these independently reproduced defects or inconsistencies:

- project skill writes scan curated and target-specific directories outside project declaration;
- MCP activation can be inferred from registry `optional` and `parallel.mcp.enabled` fields when explicit defaults are absent;
- `mcp list` and project `write` evaluate different effective state;
- inactive Card MCP definitions can be selected by an ID-only project toggle;
- whole-store export archives `credentials.json` and unrelated operational machine state;
- some Store/Library mutations bypass common read-only or atomic persistence boundaries.

These findings justify remediation work. They do not by themselves ratify a replacement schema, lifecycle, or enforcement policy.

### 0.3 Proposed follow-ups

The following remain proposals until their owning follow-up plan is approved:

- machine schema V2, machine policy/capability separation details, and direct-curation retirement;
- a complete Library remove/update/reference/GC lifecycle;
- Library-scoped mutation guards and per-record persistence rules; any Store-wide transaction layer requires separate scoping;
- a portable inventory export/seed format;
- target-adapter-specific ambient collision enforcement;
- Card capture from machine defaults and other downstream behavior tied to those policies.

### 0.4 Open decisions

| ID | Decision | Current safe position |
|---|---|---|
| D1 | Fresh machine defaults: explicit packaged bootstrap or explicit empty arrays? | Preserve existing bootstrap behavior until an exact packaged seed is approved; never infer a new seed from ambient directories. |
| D2 | Which ambient same-ID collisions block writes for each downstream target? | Report all collisions; do not add universal blocking. A target may block only after its adapter semantics and force behavior are explicitly approved. |

Task 77 does not resolve D1 or D2. Tasks 80 and 83 own those decisions.

---

## 1. Executive decision

The target model has one composition mechanism:

```text
Capability Cards -> one Worker Blueprint -> one Worker
```

A project may install several Worker definitions as alternatives, but exactly one Worker may be active in a project context. Workers are not stackable. When capabilities need to be combined, their Cards are composed into a single versioned Worker Blueprint.

This leads to five core rules:

1. A top-level project reference is a **Worker root**.
2. A plain Card root is a degenerate one-Card Worker.
3. A Blueprint root is one Worker composed from its member Cards.
4. Multiple installed Workers are alternatives, not merge layers.
5. `drwn write` materializes declared state; it never chooses or mutates the active Worker.

For the `darwinian-cards` project, Operator, Notion, and Fal are Cards inside one project Worker Blueprint. They are not three Workers and are not an active Worker stack.

---

## 2. Why Worker stacking is rejected

Cards already provide the correct composition unit. A Worker Blueprint gives that composition a name, version, identity, governance, and deployment boundary. Merging complete Workers would add a second composition system above Blueprints.

That second system has no clear semantics when Workers disagree about:

- identity or operating instructions;
- MCP server definitions and credentials;
- hook policy and execution consent;
- permissions, escalation, or eval declarations;
- target settings and local overlays;
- capability precedence and provenance.

An ordered Worker stack would technically produce one merged configuration, not several autonomous agents. It would weaken the meaning of a Worker while duplicating the composition already supported by `composedFrom`.

Organization policy, shared operating behavior, and temporary capabilities should normally be modeled as Cards and included in a Blueprint. If a future runtime needs multiple autonomous Workers, that is orchestration or dispatch, not configuration stacking, and belongs behind a separate runtime contract.

---

## 3. Canonical mental model

### 3.1 Library

For the ratified Worker model, Library presence is inventory only and never activates a project Worker or capability. The existing Library, Catalog, and Store distinction remains useful: Catalog discovers, Library presents reusable local inventory, and Store persists private implementation state.

The exact aggregate item types, mutation ownership, remove/update semantics, reference scanning, and GC behavior are proposed in Task 81. This analysis does not ratify those lifecycle details merely by using the word Library.

### 3.2 Capability Card

A Capability Card is the smallest distributable capability or policy unit. It may provide skills, MCP definitions, hooks, instructions, and related content.

A Card has an independent name, version, integrity, and provenance. Cards are independently locked and vendored even when consumed through a Blueprint.

### 3.3 Worker Blueprint

A Worker Blueprint is a `kind:"blueprint"` Card that owns:

- an ordered `composedFrom` list of Capability Card requirements;
- Worker-level identity and instructions;
- forward-declared governance such as permissions, evals, escalation, and context mounts;
- a reusable, immutable, deployable version.

Blueprints compose Cards only in V1. A Blueprint cannot compose another Blueprint. This keeps dependency closure shallow and avoids inheritance ambiguity.

### 3.4 Worker root

A Worker root is a top-level Worker requirement installed in a project.

- Blueprint root: compiles the Blueprint plus its member Card closure into one Worker.
- Plain Card root: compiles the Card into one degenerate Worker with default governance.

The project can install multiple roots so a developer can switch among alternative Workers without removing and fetching them repeatedly.

### 3.5 Active Worker

The active Worker is the single installed root selected for downstream projection. It is project intent, persisted as `activeWorker`.

"Installed" and "active" are intentionally different:

- Installed means resolved, locked, vendored, and available.
- Active means selected for the current project's Claude, Codex, Cursor, MCP, skill, and hook surfaces.

### 3.6 Generated Worker

A generated Worker is a derived local bundle compiled from one root and its Card closure. It is not a source artifact and is safe to regenerate.

Every installed root may have a generated bundle. Only the active root is projected to downstream tool surfaces.

### 3.7 Deployed Worker

A deployed Worker is a runtime instance created from one immutable Blueprint or degenerate Card root. Deployment takes one root and one pinned closure. It never takes a local Worker stack.

---

## 4. Authority boundaries

The CLI must maintain these source-of-truth boundaries:

| Concern | Authority | Derived state |
|---|---|---|
| Editable artifact content | Card source repository | Published Card tree |
| Published artifact identity | Immutable Card version + integrity | Library record + private store tree |
| Project Worker requirements | Project `config.json` `workers[]` | Root graph in `card.lock` |
| Project dependency versions | `card.lock` | Vendored trees |
| Active project Worker | Project `config.json` `activeWorker` | Active downstream projection |
| Machine defaults | `~/.agents/drwn/machine.json` | User-home tool projections |
| Generated Worker bundle | Root + locked dependency closure | `generated/workers/<root>/` |
| Project tool surfaces | Active Worker + explicit project overlays | `.claude`, `.codex`, `.cursor`, MCP files |

No derived directory is allowed to become an implicit source of truth.

In particular, `~/.agents/skills` is a compatibility projection of machine defaults. Its directory contents must not automatically activate skills in a project and must not silently rewrite `machine.json`.

---

## 5. Target project state

### 5.1 Project config V2

The forward-facing project schema is:

```json
{
  "version": 2,
  "workers": [
    "@darwinian/darwinian-cards-worker@^1.0.0",
    "@darwinian/review-worker@^1.0.0"
  ],
  "activeWorker": "@darwinian/darwinian-cards-worker",
  "skills": {
    "include": []
  },
  "servers": {}
}
```

`workers[]` is ordered installation intent. It replaces the misleading project-level `cards[]` name. Its entries may resolve to a Blueprint or a plain Card.

`activeWorker` accepts an installed root name or `null`:

- missing with zero roots: no active Worker;
- missing with one root: that root is implicitly active;
- missing with more than one root: configuration error requiring explicit selection;
- string: exactly that root is active;
- `null`: explicitly no active Worker.

The implicit single-root rule is deterministic convenience, not a hidden default system. `drwn status` must report when it is in effect.

### 5.2 Lockfile V6

The lockfile must retain both the complete artifact set and root/dependency identity:

```json
{
  "lockfileVersion": 6,
  "workerRoots": [
    {
      "name": "@darwinian/darwinian-cards-worker",
      "requested": "@darwinian/darwinian-cards-worker@^1.0.0",
      "kind": "blueprint",
      "members": [
        "@darwinian/operator",
        "@leeminseung/notion",
        "@remyjkim/fal"
      ]
    }
  ],
  "cards": [
    { "name": "@darwinian/darwinian-cards-worker", "version": "1.0.0" },
    { "name": "@darwinian/operator", "version": "0.1.0" },
    { "name": "@leeminseung/notion", "version": "0.1.0" },
    { "name": "@remyjkim/fal", "version": "0.1.0" }
  ]
}
```

The real Card entries retain their current complete manifest, integrity, source, tree SHA, hook consent, and provenance fields. The abbreviated example only shows the graph shape.

Required invariants:

- every `workerRoots[].name` identifies exactly one `cards[]` entry;
- every member identifies a plain Card entry;
- a member may be shared by several roots without duplicate Card entries;
- root order matches project `workers[]` order;
- member order matches Blueprint `composedFrom` order;
- a plain Card root has `kind:"card"` and an empty `members` list;
- nested Blueprint membership is rejected in V1;
- stale or unreachable Card entries are not written.

### 5.3 In-memory graph

Resolution should return one structured graph rather than a flattened array:

```ts
interface ResolvedWorkerGraph {
  roots: ResolvedWorkerRoot[];
  cards: CardLockEntry[];
  cardsByName: Map<string, CardLockEntry>;
  membersByRoot: Map<string, CardLockEntry[]>;
}
```

Effective state then distinguishes:

```ts
interface WorkerSelection {
  installedRoots: ResolvedWorkerRoot[];
  activeRoot: ResolvedWorkerRoot | null;
  activeCards: CardLockEntry[];
}
```

`activeCards` is the selected root followed by its member closure. It is never computed by filtering the flat lock array by one name.

---

## 6. Resolution and composition

For each project `workers[]` requirement, resolution must:

1. Resolve the root to one immutable Card entry.
2. Determine whether it is a plain Card or Blueprint.
3. For a Blueprint, resolve every `composedFrom` Card in declaration order.
4. Reject Blueprint members, name/version conflicts, and unresolved members.
5. Deduplicate shared Card versions across roots only when the resolved identity is identical.
6. Persist roots, edges, all pinned Card entries, and integrity metadata.

For the active root, composition must:

1. Load only that root and its closure.
2. Apply member capabilities in Blueprint declaration order.
3. Apply Blueprint-level identity and governance at the Worker boundary.
4. Apply explicit project overlays last.
5. retain source attribution for every generated capability.

Collision rules must be deterministic and visible:

- identical duplicate capability definitions may deduplicate with provenance;
- conflicting MCP definitions with the same ID are errors unless the project explicitly overrides them;
- conflicting skill IDs from different Card content are errors rather than silent first-wins behavior;
- hook policies compose with source Card attribution and per-Card consent;
- Blueprint identity/instructions own the Worker-level instruction header;
- project overlays are explicit highest-precedence exceptions and must be shown by `status` and `doctor`.

---

## 7. Materialized layout

Given one Blueprint root with three member Cards, project materialization is:

```text
.agents/drwn/
  config.json
  card.lock
  vendor/
    cards/
      @darwinian/operator/
      @leeminseung/notion/
      @remyjkim/fal/
      @darwinian/darwinian-cards-worker/
  generated/
    workers.json
    active-worker.json
    instructions.md
    workers/
      @darwinian/darwinian-cards-worker/
        worker.json
        instructions.md
        skills/
        mcp/servers.json
        hooks/
```

There are no generated Worker folders for Operator, Notion, or Fal because they are dependency Cards, not roots.

`workers.json` lists installed roots only and records each root's kind, version, members, generated path, and active status. `active-worker.json` records the selected root and pinned closure. The canonical top-level `instructions.md` is derived from the active generated Worker for downstream adapters.

`drwn write` performs two projections:

1. Compile or reconcile a generated bundle for each installed root from locked bytes.
2. Reconcile downstream project surfaces from the single active root plus explicit project overlays.

`write` must not fetch new versions, change requirements, select a Worker, or rewrite activation intent.

---

## 8. Command model

### 8.1 Project lifecycle commands

| Command | Target contract |
|---|---|
| `drwn init` | Create project config and register the project. |
| `drwn add <ref>` | Append one Worker root and refresh the complete lock graph. A plain Card becomes a degenerate Worker. If the project previously relied on implicit single-root activation, adding a second root persists the first root as `activeWorker` before the project becomes ambiguous. |
| `drwn remove <name>` | Remove one root, its now-unreachable dependencies, and stale activation atomically. |
| `drwn apply <refs...>` | Replace the complete root requirement set and refresh the graph. Preserve the active root when it remains; otherwise require `--active <name>` or `--none` when the replacement has multiple roots. |
| `drwn pin <ref>` | Replace or add one root constraint while preserving valid activation. |
| `drwn update [name]` | Refresh root and dependency versions within declared constraints. |
| `drwn use <name-or-ref>` | Ensure one root is installed, select it as `activeWorker`, and run `write` unless `--no-write` is supplied. Does not remove other installed roots. |
| `drwn use --none` | Persist `activeWorker:null` and reconcile downstream surfaces. |
| `drwn install` | Hydrate and verify all locked artifacts; run `write` unless `--no-write`. Does not alter requirements or activation. |
| `drwn write` | Deterministically compile installed roots and project the selected root. Never chooses a Worker. |
| `drwn status` | Show installed roots, active root, dependency closure, local overlays, generated state, and drift. |
| `drwn doctor` | Validate config, graph, lock, defaults, projections, auth prerequisites, and migration state. |

`--write` on `add`, `apply`, `remove`, `pin`, and `update` means "run the pure materializer after the state mutation." It does not change the mutation's activation semantics.

### 8.2 Card commands

`drwn card` owns the Card artifact lifecycle:

- `new`, `source`, `validate`, `doctor`;
- `publish`, `release`, `deprecate`;
- `show`, `list`, `diff`, `outdated`;
- `clone`, `fork`, `remote`, `fetch`, `push`, `link`, `unlink`;
- `catalog publish`, trust and provenance operations.

Project requirement mutation should not remain duplicated under `drwn card add/apply/remove/pin/update/detach`. Those paths are misleading for Blueprint roots. The top-level project commands are canonical; old paths receive explicit migration errors or a bounded deprecation alias according to the release policy selected in Task 77.

### 8.3 Worker commands

`drwn worker` owns Blueprint authoring and deployed Worker operations:

- `worker new`, `compose`, `publish`: author a Blueprint Card source;
- `worker deploy`: deploy one immutable root and pinned closure;
- `worker deployments`, `status`, `rollback`, `delete`, `chat`: operate remote runtime instances.

`drwn worker stack`, `worker stack use`, and `worker stack clear` are removed. `drwn use` and `drwn status` cover local selection and visibility without implying composition.

`drwn worker list` remains the remote deployed-Worker inventory, while `drwn worker deployments <slug>` remains one deployed Worker's history. Local installed roots are shown by project-level `drwn status`; they do not get a second `worker list` command.

### 8.4 Project overlays

`drwn add skill` and `drwn add mcp` remain explicit project escape hatches. They modify project overlays and take effect on the next `write`.

They must:

- never infer activation from machine defaults;
- report that the capability is outside the active Blueprint;
- appear as an override in `status` and `doctor`;
- fail clearly on unresolved library IDs;
- use project definitions as explicit highest precedence.

Reusable or team-critical overlays should be promoted into a Card and Blueprint rather than left as local project configuration.

---

## 9. Defaults and Library investigation

Section 9.1 labels each boundary as ratified, proposed, open, or unchanged for Task 77. Section 9.2 is verified investigation. Sections 9.3-9.11 describe candidate target behavior for Tasks 80-81 and are not part of the ratified Task 77 scope unless a subsection explicitly says otherwise.

The new Worker-root architecture cannot keep machine defaults as implicit project composition. The Library concept remains valid, but any broader defaults or Library revision requires its separately approved plan. The candidate target has three independent state transitions:

```text
library add                         -> artifact is available on this machine
library defaults add/remove         -> machine intent changes
write --root                        -> user-home projections change

add/use/apply in a project          -> project Worker or overlay intent changes
write in a project                  -> project-owned projections change
```

No arrow is implicit. Inventory does not activate anything, intent mutation does not materialize anything, and a materializer never infers or rewrites intent.

### 9.1 Ratified boundary and proposed lifecycle

| Question | Decision |
|---|---|
| Does the library remain useful? | **Ratified boundary:** yes, as inert local inventory. **Proposed detail:** typed aggregate records and complete lifecycle behavior belong to Task 81. |
| Should card-bundled capabilities also be registered as loose library items? | **Proposed, Task 81:** no. Published Card bytes and their locked/vendored copies are sufficient; approval must confirm that no separate loose-library lifecycle is required. |
| Should machine defaults remain? | **Ratified boundary:** yes, but only for user-home bootstrap and scratch/non-project sessions. Exact fresh contents remain D1. |
| Should projects inherit defaults as a composition layer? | **Ratified boundary:** no. The active Worker closure and explicit project overlays are the complete project declaration. |
| Should `~/.agents/skills` determine activation? | **Ratified for projects:** no. **Proposed, Task 80 for machine scope:** treat it only as derived compatibility output and migration evidence. |
| Should built-in MCP registry entries activate because they are `optional:false`? | **Proposed, Task 80:** no. Registry presence should be inventory rather than intent after an approved migration. |
| Should direct `skills curate/uncurate` remain? | **Open for Task 80.** They currently create a second authority, but retirement and migration timing require approval. |
| Should machine defaults contain hooks, identity, instructions, or Worker governance? | **Proposed, Task 80:** no. Those surfaces require Card provenance and, for hooks, explicit Card consent. |
| Should defaults be removed entirely in favor of profile Workers? | **Ratified boundary:** no. That would remove the user-home path delivered by `write --root`. |
| Should the command move to top-level `drwn defaults`? | **Unchanged in Task 77:** keep `drwn library defaults`. Any later rename is independent command-design work. |

The result is a hybrid of the defensible parts of the older designs: preserve the inventory/activation separation from analysis 13, preserve user-home projection and managed-field ownership from analysis 66, preserve Cards as the final distribution home from analyses 68/90, and reject both inherited project defaults and complete defaults retirement.

### 9.2 Current behavior that must not survive

The following are verified implementation contracts in `drwn` 0.7.0, not hypothetical risks:

| Current behavior | Evidence | Why it violates the target |
|---|---|---|
| Every entry in `~/.agents/skills` is copied into every skill write, including project writes. | `cli/core/skills.ts:317-346` | A derived directory acts as activation authority and leaks machine state into projects. |
| All repo `claude-only` and `codex-only` skills are also materialized without explicit selection. | `cli/core/skills.ts:348-386` | Repository inventory is treated as active intent. |
| Project state intentionally chooses packaged config rather than `machineConfig`. | `cli/core/effective-state.ts:68-76`; `test/core-effective-state.test.ts:25-44` | This is the correct direction, but curation scanning bypasses the boundary. |
| When `defaults.mcpServers` is absent, every non-optional registry server and opted-in optional server becomes active. | `cli/core/mcp.ts:44-70`; `test/sync-mcp.test.ts:125-148` | Registry metadata silently becomes activation policy. |
| Adding or removing a default skill immediately copies/removes `~/.agents/skills/<id>`. | `cli/commands/library/defaults/add-skill.ts:67-70`; `remove-skill.ts:61-65` | State mutation and projection are coupled. |
| Removing a missing skill or MCP default first requires resolving its source. | `remove-skill.ts:42-45`; `remove-mcp.ts:53-56` | Stale state cannot be repaired after inventory disappears. |
| Missing machine defaults are seeded from current curated-directory contents and inferred registry activation. | `cli/core/user-config.ts:36-49`; `cli/core/defaults.ts:22-37` | Derived and policy surfaces silently rewrite intent. |
| `drwn add mcp` is a no-op when the same ID is a machine default. | `cli/commands/add/mcp.ts:123-137`; `test/commands-add-mcp.test.ts:133-150` | A project cannot make its declaration self-contained. |
| Codex deep-merges user and project MCP tables and can produce cross-layer transport conflicts. | `cli/core/mcp.ts:507-540`; `test/commands-write-codex-conflict.test.ts` | Ignoring defaults during project write does not remove ambient user-home behavior at runtime. |
| Help text says curated output is a symlink while implementation and tests use copied directories. | `cli/commands/skills/curate.ts:14-21`; `cli/core/skills.ts:242-246`; `test/core-skills.test.ts:69-85` | The compatibility layer's ownership and update semantics are unclear. |
| `mcp list` overlays project config onto machine config while `write` uses the project effective-state path. | `cli/commands/mcp/list.ts:39-55`; `cli/core/effective-state.ts:68-76` | Readouts and materialization can disagree about whether the same MCP is active. |
| `add mcp` searches definitions from all locked Cards, including inactive roots, while effective state imports definitions only from the active root. | `cli/commands/add/mcp.ts:194-198`; `cli/core/effective-state.ts:159-166` | The command can report success for a definition that remains unavailable and inactive. |
| Curate/uncurate treats every same-name path as drwn-owned and may recursively replace or delete it. | `cli/core/skills.ts:159-166, 242-251` | Foreign user content has no ownership boundary. |
| Some store mutations bypass read-only guards and MCP-library persistence deletes all entries before rewriting them. | `cli/core/user-config.ts:31-33`; `cli/core/mcp-library.ts:78-90`; `cli/core/store-paths.ts:12-18` | A read-only store can be mutated and a failed/concurrent write can leave partial inventory. |
| `store export` archives the entire `~/.agents/drwn` directory, which includes encrypted OAuth credential material. | `cli/commands/store/export.ts:20-31`; `cli/core/paths.ts:29-30`; `cli/core/auth/credentials.ts:6-24` | A routine inventory/store export can disclose credentials and unrelated machine state. Encryption at rest does not make broad export an acceptable default. |

The focused current-contract suite passed 54 tests on 2026-07-12. This confirms that the problematic behavior is intentionally encoded in tests and requires contract replacement rather than an incidental bug fix.

The `darwinian-cards` consumer provides a concrete system-level example from the same date:

- 42 skills were machine defaults and 42 were present in the curated compatibility directory;
- the three installed Cards declared 27 skills, of which the 17 Operator skills overlapped the machine set;
- both `.claude/skills` and `.codex/skills` contained 52 project-local skill directories: 42 machine entries plus 10 Card-only entries;
- the project MCP output contained `chrome-devtools`, `context7`, `fal`, and `notion`, although only Fal and Notion came from installed Cards;
- Notion was simultaneously a machine-default MCP and a Card-provided MCP.

This is the exact dual-channel state the target architecture removes.

### 9.3 Proposed refined mental model

The CLI should teach six boundaries, not one blended "effective config" concept:

| Concept | Question | Authority |
|---|---|---|
| Library inventory | What reusable artifacts are available on this machine? | Typed records for immutable Card versions, editable Card sources, installed skill packages/snapshots, and MCP definitions |
| Catalog discovery | What remote artifacts can be found or fetched under machine trust policy? | Catalog registrations, indexes, and refresh state |
| Private store | Where does drwn persist inventory bytes, caches, generated state, credentials, intent, and write records? | `~/.agents/drwn` physical layout; not an activation or user-facing composition namespace |
| Machine defaults | What should `drwn write --root` publish into user-home tool surfaces? | `~/.agents/drwn/machine.json` default ID lists |
| Project declaration | What does this project declare? | One active Worker root closure plus explicit project overlays |
| Ambient visibility | What user-home or platform state may the downstream tool also expose in this project? | User-home tool configs, global skill roots, plugins/connectors, and platform behavior outside the project write record |

The ambient-visibility row is essential. "Project write ignores machine defaults" means only that drwn does not copy or merge them into project-owned files. It cannot mean that Claude, Codex, or Cursor will ignore user-home configuration while running in a project. Codex explicitly deep-merges global and project MCP tables; user-home skill directories are likewise global discovery surfaces.

Therefore:

```text
project-declared capabilities != all runtime-visible capabilities
```

`status` and `doctor` must report both sets when they can inspect them. Fully isolated and reproducible project sessions require empty machine defaults or an isolated downstream tool profile/home; project materialization alone cannot promise that isolation.

### 9.4 Proposed Library target contract

This subsection is design input for Task 81, not a Task 77 acceptance contract.

The library remains machine-local inventory and is always inert. It is a typed logical view over four artifact classes:

- published immutable Card versions;
- editable Card sources;
- installed versioned skill bundles and loose-skill snapshots;
- user-registered MCP definitions.

Catalog registrations/indexes and private store internals are deliberately excluded. A cached repository or extracted tree may back a Card record, but it is not a second library item. Credentials, machine defaults, project registrations, generated Workers, and write records are operational state, not inventory.

Artifact-specific command families continue to own mutation:

- `drwn card` owns Card artifact lifecycle and provenance;
- `drwn worker` owns Blueprint authoring and deployed Workers;
- `drwn library add/remove/update skill|mcp` owns standalone reusable capability inventory;
- `drwn library catalog` continues to own discovery-source registration and refresh. Its command grouping is organizational; catalog registrations do not become library inventory items or activation inputs.

`drwn library list/show` should become an aggregate read-only inventory view across those typed records, with filters such as `card`, `source`, `skill`, and `mcp`. It may direct users to the artifact-specific command for mutation. This avoids pretending that Card storage is unrelated to the library while preserving clear lifecycle ownership.

Library records must expose stable provenance fields instead of the current overloaded labels:

```text
kind: card | card-source | skill-package | loose-skill | mcp
origin: built-in | npm | git | local-snapshot | user-registered
id, version, integrity, sourceRef, path, mutable, referencedBy
```

A developer checkout path such as `darwinian-minds/skills/shared/...` is an authoring or built-in-package source, not a requirement that consumer projects retain that checkout. Published Cards and imported loose skills are snapshots. Card consumers resolve immutable store bytes and project vendor bytes, not the editable source repository.

Hooks are intentionally absent from loose library defaults. Reusable hooks must ship in Cards so hook policy, integrity, provenance, and consent remain attached to the executable behavior.

The standalone library also needs a complete lifecycle. `add` without `remove`, version update, and garbage collection leaves stale sources that defaults and overlays cannot manage cleanly. Target operations are:

```text
drwn library add skill|mcp ...
drwn library update skill <package-or-id>
drwn library remove skill|mcp <id> [--force]
drwn library gc --dry-run
```

Removal should report references from machine defaults and registered projects. It should normally refuse an in-use item, while `--force` may remove inventory and deliberately leave a diagnosable unresolved reference. It must never silently remove a Worker/Card capability, because those bytes are owned by the Card store and project lock.

Library mutation and export must honor a strict security boundary:

- every store mutation calls the read-only guard and uses atomic, per-record replacement;
- any future portable Library/Store export contains only explicitly selected inventory manifests/content and provenance, under Task 82's approved format;
- ordinary export excludes credentials, `machine.json`, the project registry, write history, generated output, and caches;
- a complete machine backup, if supported, is a separate explicitly named encrypted-backup operation with destination confirmation and documented restore semantics;
- encrypted OAuth tokens remain secrets and are never included merely because the destination archive is local.

### 9.5 Ratified minimum and proposed machine-default target contract

The ratified minimum is narrow: machine defaults are a mutable user-home convenience set, are not project dependencies, and are not a Worker. The remaining schema and lifecycle bullets below are proposals owned by Task 80.

Required behavior:

- `~/.agents/drwn/machine.json` is the sole activation authority for default skill and MCP IDs.
- Explicit arrays are always present; an explicit empty array means none.
- `drwn library defaults list/add/remove` reads or mutates only machine intent.
- `drwn write --root` resolves that intent and owns the derived user-home projection.
- Normal project `drwn write` resolves only the active Worker closure and explicit project overlays.
- `~/.agents/skills` is regenerated compatibility output, never scanned as desired state.
- Add requires an unambiguous available source; remove requires only a syntactically valid ID.
- Secrets and OAuth tokens are never stored in defaults. Definitions may name environment variables or an auth mode.
- Authentication and local executable readiness are diagnosed separately from valid default intent.
- Skill defaults may target shared, Claude-only, or Codex-only inventory according to the skill's declared scope; experimental skills require an explicit opt-in. The old shared-only restriction was an artifact of treating `~/.agents/skills` as authority.
- MCP registry `optional`, legacy `config.optional`, and `parallel.mcp.enabled` do not activate inventory in the absence of an explicit default list.
- Hooks, Worker instructions, personas, beliefs, memory, permissions, evals, and escalation policy cannot be machine defaults. They belong to versioned Cards/Blueprints.

Defaults should normally contain only universal CLI operating aids. Domain integrations such as a project Notion/Fal stack belong in the project's Worker Blueprint. An operator may still choose Notion as a machine default, but status must show that it is ambient and may overlap a project Worker.

### 9.6 Proposed machine policy and capability split

`machine.json` contains more than defaults. The implementation must stop treating the choice "project or machine config" as an all-or-nothing branch.

Machine-local policy remains relevant while operating inside projects:

- catalog and trusted-source policy;
- authoring scope;
- service endpoints and authentication client settings;
- downstream target availability or operator disablement;
- CLI-only feature policy.

Machine capability defaults do not flow into project composition:

- `defaults.skills`;
- `defaults.mcpServers`;
- legacy optional-MCP activation flags;
- legacy default extensions.

Effective-state construction should load machine policy in all contexts, then choose one of two capability inputs:

```text
machine write  = machine policy + machine default IDs
project write  = machine policy + active Worker closure + project overlays
```

Security and availability policy is a ceiling, not a capability source. For example, a machine policy may prevent writes to an unavailable Cursor target or reject an untrusted catalog even when a project requests it. Project/Card settings cannot silently weaken machine trust policy.

The machine schema should also stop mixing unrelated policy under `defaults`. `communityCatalogUrl` belongs under `catalogs`, and `defaults.extensions` should be removed. Machine-default extensions would recreate a hidden composition layer; reusable extension behavior should migrate toward Cards or remain an explicit project overlay during transition.

Conceptual machine schema:

```json
{
  "version": 2,
  "defaults": {
    "skills": [],
    "mcpServers": []
  },
  "targets": {},
  "catalogs": {},
  "trustedSources": {},
  "authoring": {}
}
```

The arrays store IDs, not copied definitions. `defaults list/status` resolves and reports the current source, version, and integrity where available, making their deliberately mutable resolution visible.

### 9.7 Ratified project boundary and proposed full precedence contract

| Source | May supply bytes? | May activate in machine write? | May activate in project write? | Runtime may still expose ambiently? |
|---|---:|---:|---:|---:|
| Built-in/user library inventory | Yes | Only by default ID | Only by explicit overlay ID | No, unless separately projected globally |
| Machine defaults | IDs only | Yes | No | Yes, through user-home tool surfaces |
| Active Worker closure | Yes, from locked Card bytes | No | Yes | Project-owned |
| Installed inactive Worker roots | Yes | No | No | No |
| Project skill/MCP overlays | ID or explicit definition | No | Yes, last | Project-owned |
| `~/.agents/skills` and user-home tool config | Derived/foreign bytes | Projection destination only | Never an input | Yes |
| Platform plugins/connectors | External | No | No | Yes |

Within project-declared state, precedence is:

```text
active root and ordered member Cards -> explicit project overlays
```

Machine defaults are not before that list because they are not part of project composition.

Project overlay semantics must be type-specific:

- A full project MCP definition may explicitly replace a same-ID Worker definition and must report the override.
- An MCP `{enabled:true}` toggle selects an already known library or active-closure definition; it does not define one.
- A skill `include` adds a library skill that is absent from the Worker. Because an ID-only include cannot express replacement bytes, including a same-ID Worker skill is redundant or an error, not a hidden override.
- Replacing Card-owned skill bytes requires changing the Card/Blueprint or introducing a future source-qualified project skill definition.
- Cross-layer user-home/project collisions are ambient conflicts, not project precedence. They must be warned about separately.

### 9.8 Proposed command and side-effect matrix

| Command | Inventory | Machine intent | Project intent | Derived output |
|---|---:|---:|---:|---:|
| `drwn library add skill|mcp` | mutate | no | no | no |
| `drwn library remove/update skill|mcp` | mutate | no | no | no |
| `drwn library defaults add/remove skill|mcp` | no | mutate | no | no |
| `drwn library defaults list` | read/resolve | read | no | inspect only |
| `drwn write --root` | read | read | ignore | user-home only |
| `drwn add skill|mcp` | read, optionally install an explicitly confirmed catalog result | no | mutate overlay | no |
| `drwn add/use/apply <worker-root>` | read/resolve | no | mutate Worker requirements/selection | only with explicit `--write` or `use` default behavior |
| project `drwn write` | read locked bytes | ignore capability defaults | read | project only |
| `drwn skills curate/uncurate` | retired | retired | no | migration error |

Defaults add/remove should not eagerly edit `~/.agents/skills` or tool config. This keeps the same intent-versus-materialization rule that applies to project commands. A future convenience flag may invoke `write --root` as a clearly reported second phase, but it must not hide that phase.

The `library defaults` namespace is retained rather than introducing canonical top-level `defaults` commands because:

- every added default must resolve through machine inventory;
- the longer path signals machine scope and high blast radius;
- it avoids adding another top-level noun during the Worker command migration;
- existing scripts have a direct migration path.

A short alias can be reconsidered after the Worker-root release, but it should not create two documented authorities.

### 9.9 Proposed projection ownership and repair

`write --root` must project exactly the IDs in `machine.json` into:

- `~/.agents/skills/<id>` where compatibility requires it;
- `~/.claude/skills/<id>` and `~/.codex/skills/<id>` according to skill scope;
- user-scope Claude, Codex, and Cursor MCP configuration;
- the global write record and generated metadata.

Cleanup must be ownership-safe. These directories can contain files created by users, plugins, or other managers. The global write record must identify every drwn-owned directory or managed field. Reconciliation removes stale drwn-owned output only; an arbitrary unrecorded directory is reported as foreign/ambient and is never deleted or adopted as a default.

Default state has five useful health states:

| State | Meaning | Health |
|---|---|---|
| configured + source resolved + projection current | Desired and materialized | healthy |
| configured + source resolved + projection stale/missing | Intent valid, write needed | drift |
| configured + source missing | Stale intent | error, removable by ID |
| projected but not configured and drwn-owned | Stale derived output | repairable drift |
| inventory-only or foreign projection | Available/ambient but not a default | healthy, informational |

`doctor --fix` repairs only from intent toward projection. It never infers intent from a directory. `library defaults remove` repairs intent even when source and projection are gone.

### 9.10 Open fresh initialization decision and proposed migration

Fresh stores should eventually write explicit default arrays exactly once, but the contents are unresolved by D1. The two valid candidates are an explicitly named packaged bootstrap set and explicit empty arrays. Until D1 is decided, implementation preserves current bootstrap behavior and must not silently substitute the empty model. Regardless of D1, fresh initialization must not derive a new seed from arbitrary `~/.agents/skills` contents.

Legacy migration follows these rules:

1. Preserve explicit `machine.json defaults.skills` and `defaults.mcpServers` arrays as operator intent.
2. Translate legacy optional-MCP flags into an auditable proposed default-ID migration, not a permanent alternate activation path.
3. Use the drwn global write record to classify drwn-owned compatibility output.
4. Do not adopt arbitrary curated directories as defaults. Report them as foreign or orphaned and offer an explicit adoption command/dry-run when appropriate.
5. If D4 approves removal, retire direct curation command paths after a bounded migration error that points to `library defaults add/remove` and `write --root`; otherwise implement the approved compatibility policy.
6. Move `defaults.communityCatalogUrl` into catalog policy and reject/diagnose `defaults.extensions` until explicitly migrated.
7. Re-run `write --root` to reconcile owned user-home output after intent migration.

`card new --from-defaults` may remain as an authoring/migration utility for promoting an overly broad machine baseline into a capability Card. It must read `machine.json`, never curated output. It should either capture both skill and MCP defaults with provenance or state clearly that it captures skills only. The resulting Card is a degenerate Worker root or a member of a new Blueprint; it does not cause defaults to be retired automatically.

### 9.11 Options requiring follow-up decisions

**Keep inherited defaults in projects as before.** Rejected in ratified scope because it makes project behavior depend on mutable machine state, duplicates Card content, and turns a personal machine preference into an undeclared project dependency.

**Remove defaults completely and require a profile Worker everywhere.** Rejected because user-home/scratch sessions still need a small bootstrap mechanism and `write --root` already provides ownership-safe projection infrastructure.

**Treat a machine Worker as the global default.** Deferred because it introduces root locks, updates, hook consent, and Worker governance at machine scope. It is a second Worker activation domain and is unnecessary for the narrow bootstrap use case.

**Keep direct curation as an advanced primitive.** Proposed for rejection in Task 80 because a directory mutation becomes indistinguishable from activation intent and recreates the bug where projection feeds composition.

**Move defaults to canonical top-level `drwn defaults`.** Deferred. The shorter name is attractive, but it weakens the inventory relationship and adds command churn during the more important Card/Worker migration.

### 9.12 Follow-up implementation inventory

Task 77 covers only project isolation: stop project writes from scanning machine compatibility directories or importing machine capability defaults. The remaining verified issues are allocated as follows:

- **Task 77:** project-scope `claude-only`/`codex-only` and curated-directory leakage, the shared project evaluator, inactive-root toggle rejection, local overlay status, fail-closed multi-Card migration, `darwinian-cards` fixture, and explicit project-path audit;
- **Task 79:** fail-closed hotfix for ordinary whole-store export;
- **Task 80 (D1):** explicit machine arrays, optional/parallel fallback retirement, policy/capability separation, extension/catalog migration, projection ownership, curation retirement, and `card new --from-defaults`;
- **Task 81:** Library remove/update/reference/GC and Library-scoped guarded atomic persistence;
- **Task 82:** credential-free portable inventory export and seed semantics;
- **Task 83 (D2):** complete ambient inspection and target-adapter-specific collision enforcement.

Store-wide concurrency across unrelated machine, Card, project, and credential records is not assigned to Task 81 and has no implementation authorization in this revision.

---

## 10. Error and diagnostics contract

The ratified Worker migration uses the Worker and legacy-composition codes below. The machine, ambient, Library, and Store codes are reserved proposals owned by their follow-up plans; listing a code here does not authorize its behavior.

| Code | Meaning | Remediation |
|---|---|---|
| `MULTIPLE_WORKERS_REQUIRE_SELECTION` | More than one root exists and `activeWorker` is absent. | Run `drwn use <name>`. |
| `WORKER_STACK_UNSUPPORTED` | Legacy `activeWorkers` contains more than one name. | Author one Blueprint containing the required Cards, then select it. |
| `ACTIVE_WORKER_NOT_INSTALLED` | Selection does not identify a root. | Install it or select an installed root. |
| `BLUEPRINT_MEMBER_IS_BLUEPRINT` | Nested Blueprint detected. | Flatten member Cards into one Blueprint. |
| `WORKER_CAPABILITY_CONFLICT` | Two closure Cards define conflicting capability IDs. | Resolve composition or add an explicit project override where allowed. |
| `LOCK_ROOT_GRAPH_INVALID` | Lock roots/edges disagree with Card entries. | Run `drwn update` or `drwn doctor --fix`. |
| `MACHINE_DEFAULT_SOURCE_MISSING` | A configured default cannot be projected. | Reinstall it or remove the default ID. |
| `DEFAULTS_PROJECTION_DRIFT` | Derived user-home output differs from machine intent. | Run `drwn write --root --force` or `doctor --fix`. |
| `LEGACY_MULTI_CARD_COMPOSITION_AMBIGUOUS` | A V1 project previously composed several top-level Cards and cannot be converted to alternative roots without changing behavior. | Author/select a Blueprint that contains the Cards, then rerun migration. |
| `AMBIENT_CAPABILITY_CONFLICT` | **Proposed, Task 83:** a target adapter proves a same-ID user/project collision is structurally invalid or ambiguous. | Remove one projection, isolate the downstream profile, or make the definitions identical. |
| `LIBRARY_ITEM_IN_USE` | Inventory removal would break machine defaults, project overlays, sources, or locks. | Remove the references first or use an explicit force path that leaves visible unresolved references. |
| `STORE_EXPORT_CONTAINS_SECRETS` | A requested ordinary export would include credential-bearing store paths. | Use inventory export or an explicitly supported encrypted machine-backup operation. |

Integration startup failures remain separate from composition failures. For example:

- Notion OAuth required: installed configuration is valid, but operator authorization is missing.
- Local stdio server closes during initialize: executable, environment, or server installation is invalid.
- Missing optional skill source: inventory/default state is stale, not a Worker graph failure.

`doctor` should preserve these categories instead of reporting one generic materialization error.

Task 77 status/doctor output consumes the same declared project state as `write` and keeps declared state separate from any ambient observations. Task 83 proposes richer target-by-target fields for:

- declared project capabilities and their provenance;
- ambient user-home capabilities discovered for each target;
- identical same-ID definitions that can safely coalesce;
- conflicting same-ID definitions that make runtime behavior ambiguous;
- intent validity, source readiness, authentication readiness, and projection drift.

No universal failure rule is ratified. Task 83 must classify collisions per selected target adapter. A selected target may block before any write only when its runtime merge semantics prove structural invalidity or ambiguity; otherwise status/doctor warn. `--force` behavior is part of D2 and cannot be inferred from generic drift semantics.

---

## 11. Migration contract

### 11.1 Project config migration

The CLI must read V1 config during a bounded migration window:

- `cards[]` becomes `workers[]` because each top-level ref is a root.
- zero Cards maps to no roots and `activeWorker:null`;
- one Card maps mechanically to one root and may become the active Worker;
- `activeWorkers:[]` becomes `activeWorker:null`;
- `activeWorkers:[name]` becomes `activeWorker:name`;
- `activeWorkers` with more than one entry produces `WORKER_STACK_UNSUPPORTED` and does not guess.

A V1 project with multiple top-level `cards[]` and no explicit selection is not mechanically migrated as several inactive alternatives. Current 0.7.0 behavior activates all such Cards, so that rewrite would silently remove capabilities. Migration produces `LEGACY_MULTI_CARD_COMPOSITION_AMBIGUOUS`, performs zero writes, and requires either a Blueprint preserving the composition or an explicit operator decision that the Cards are alternatives.

Any mutating project command writes V2. `doctor --fix` may perform the same migration explicitly. Dry-run must show the exact config and lock changes.

### 11.2 Lock migration

Lockfiles V2-V5 remain readable. Root identity is reconstructed from the top-level V1 `cards[]` requirements and locked manifests, then persisted as V6 on the next graph mutation or explicit repair.

The migration must never classify every flat member entry as a root. That is the failure this architecture corrects.

### 11.3 Generated state migration

The first V6 `write` removes stale per-member Worker folders through managed-path reconciliation and writes one folder per root. It also replaces stack-shaped `workers.json` with the root registry and active selection record.

### 11.4 Other repositories

The current flat-lock and stack behavior is implemented by the installed `drwn` CLI, so any repository with Blueprints, multiple top-level Cards, or `activeWorkers` can contain latent state affected by this migration. Repositories with one plain Card root are usually migrated mechanically. Repositories with several top-level Cards require an explicit Blueprint or an explicit choice of one active alternative.

The migration gate must accept explicit project paths and discovery roots. `~/.agents/drwn/projects.json` is useful evidence but cannot be the complete audit universe: it may contain stale entries and currently omits real consumers. Release verification must include the CLI repository, Card source repositories, generated projections, and named consumer workspaces such as `darwinian-cards`; a drwn project need not itself be a Git checkout.

### 11.5 Machine store migration

The following is a proposed Task 80 contract and is blocked on D1. It is not a Task 77 migration gate.

Machine migration should be versioned, idempotent, and dry-runnable:

1. Persist explicit `defaults.skills` and `defaults.mcpServers` arrays once; never reseed explicit empty arrays.
2. Preserve existing explicit IDs even when their sources are missing so they remain diagnosable and removable.
3. Classify compatibility paths from the global write record; do not infer defaults from unowned directories.
4. Convert legacy optional-MCP state into a proposed, reviewed list of explicit IDs and retire the fallback evaluator.
5. Move catalog and extension fields out of the defaults namespace according to section 9.10.
6. Create ownership records before reconciling user-home output; never delete foreign same-name paths.
7. Leave credential storage in place and exclude it from inventory export/migration reports.

Old and new defaults evaluators must not run concurrently after migration. A store-version marker records completion so later commands cannot dynamically reseed or re-import compatibility output.

---

## 12. Worked lifecycle

Author and publish one project Worker:

```bash
drwn worker new @darwinian/darwinian-cards-worker
drwn worker compose @darwinian/darwinian-cards-worker \
  --add @darwinian/operator@^0.1.0 \
  --add @leeminseung/notion@^0.1.0 \
  --add @remyjkim/fal@^0.1.0
drwn worker publish @darwinian/darwinian-cards-worker
```

Install, select, and materialize it:

```bash
drwn add @darwinian/darwinian-cards-worker@^1.0.0
drwn use @darwinian/darwinian-cards-worker
```

Install an alternative without merging it:

```bash
drwn add @darwinian/review-worker@^1.0.0
drwn status
drwn use @darwinian/review-worker
```

The second `use` switches the active Worker. It does not merge the two Workers and does not uninstall either one.

---

## 13. Non-goals

- Concurrent execution or orchestration of several Workers.
- Worker-to-Worker inheritance.
- Nested Blueprints in V1.
- Server-side version resolution that differs from the local lock.
- Treating machine defaults as project dependencies.
- Automatically converting arbitrary local overlays into Cards.
- Reinstalling or authenticating third-party MCP integrations as part of `write`.

---

## 14. Acceptance invariants

### 14.1 Ratified Task 77 invariants

The Worker-root architecture is implemented only when all of the following hold:

- one Blueprint with three member Cards produces one generated Worker folder;
- all four artifacts remain independently pinned and vendored;
- selecting the Blueprint activates all three member capabilities;
- member Cards do not appear as selectable Workers;
- multiple installed roots require one explicit active selection;
- no CLI path can persist or materialize a merged Worker stack;
- `write` does not mutate `workers[]` or `activeWorker`;
- project write does not scan machine compatibility directories as implicit defaults;
- deploy receives one root and one pinned dependency closure;
- status, doctor, JSON output, docs, and tests use the same vocabulary;
- Library/catalog presence alone never activates a project capability;
- with project intent and referenced sources unchanged, project output is byte-identical when machine default IDs or undeclared compatibility/repository skill directories change;
- `write`, `status`, `doctor`, `mcp list`, and project mutation validation consume one declared-state evaluator;
- project status distinguishes declared capabilities from ambient user-home capabilities;
- an inactive root's MCP definition cannot be enabled through an ID-only project toggle;
- V1 multi-Card composition either migrates through an explicit Blueprint or fails with zero writes;
- cross-repository verification accepts explicit paths and includes the `darwinian-cards` consumer.

### 14.2 Proposed follow-up invariants

These are not Task 77 completion gates:

- **Task 79:** ordinary Store export cannot archive credentials or operational state;
- **Task 80:** defaults migration, fresh seeding, curation retirement, and ownership-safe root projection satisfy the approved D1 policy;
- **Task 81:** Library removal reports references and Library mutations are guarded and atomic;
- **Task 82:** portable inventory export/seed excludes credentials, machine intent, project records, write history, generated output, and caches;
- **Task 83:** ambient collisions are classified per target and block only under the approved D2 adapter contract.

---

## 15. Decision record

Ratified on 2026-07-12:

- Adopt explicit Worker roots with dependency Cards internal to each root.
- Use a versioned Worker Blueprint to compose Operator, Notion, and Fal for the current project.
- Permit multiple installed Workers only as alternatives.
- Select one active Worker per project.
- Remove Worker stacking rather than retaining it as an advanced default feature.
- Retain machine defaults as a narrow machine-scope bootstrap mechanism with `machine.json` as authority.
- Exclude machine capability defaults and compatibility-directory contents from project composition.
- Treat Library and Catalog presence as inventory/discovery, not project activation.
- Treat user-home capabilities as ambient runtime state that project status must expose, not as project declaration.
- Make project capability behavior explicit through Workers, Cards, or clearly reported project overlays.

Not ratified by this record: D1 fresh bootstrap contents, machine schema V2, direct-curation retirement, full Library lifecycle, portable Store transfer, Store-wide atomicity, and D2 ambient write-blocking semantics.

---

## 16. Prior decisions, documentation, and implementation evidence

### 16.1 Scoped preservation and supersession

| Prior analysis | Preserve | Supersede |
|---|---|---|
| Analysis 13 | Library presence versus activation, one authority for intent, secret references, and packaged bootstrap pending D1 | Defaults inherited as project composition; no decision yet on curation retirement or exact seed |
| Analysis 43 | Intent/materialization separation, immutable storage, lock/write-record/drift concepts, machine/project/library scope distinction | Flat ordered Card composition, one Worker per Card, and project defaults layer |
| Analysis 66 | User-home `write --root`, managed-field ownership, drift/deletion concepts, and machine defaults | No additional machine-scope Card/Worker decision in Task 77 |
| Analysis 68 | Shared Card as the distribution home for reusable capability content | Applying multiple Cards as a Worker stack and Option A activation mechanics |
| Analysis 90 | Immutable pins, provenance, updates, dev-link/release/catalog integrity, copy-based materialization | Complete retirement of machine defaults |
| Analysis 99 | Defaults diagnosis and migration evidence | Only complete defaults retirement and project inheritance; other remediation remains proposed in Task 80 |

The preservation is semantic, not textual. This analysis is authoritative only for the ratified scope in sections 0.1 and 15. Follow-up proposals do not supersede older decisions until approved.

### 16.2 Documentation disposition

Task 77 updates Worker-root, command, project-isolation, and migration documentation in:

- `README.md` and `INSTALL.md`;
- `.ai/knowledges/01_agents-cli-usage-guide.md`;
- `.ai/knowledges/09_cards-manual-test-guide.md`;
- `.ai/knowledges/10_drwn-cli-architecture.md`;
- `.ai/knowledges/11_card-usage-guide.html`;
- the two Card source READMEs under the `darwinian-cards` workspace after the Blueprint rollout.

The Task 77 documentation scan covers `activeWorkers`, Worker stacks, multi-Card apply advice, machine defaults inherited by projects, and project mutation aliases under `card`. Tasks 79-83 own export, curation, machine schema, Library, and ambient-policy documentation; Task 80 owns `.ai/knowledges/03_npm-skill-bundles-guide.md`. Knowledge 10 remains labeled as-built until implementation lands; after rollout it must identify both the ratified core and unresolved follow-ups.

### 16.3 Investigation evidence

The conclusions above were derived from:

- direct review of effective-state, skill sync, MCP evaluation, defaults persistence, project overlays, lock migration, store export, credential storage, and command registration;
- focused contract tests for library defaults, skill sync, effective state, project MCP add, Codex collision handling, and root-scope scenarios;
- a read-only survey of the `darwinian-cards` project and its materialized Claude/Codex/MCP outputs;
- comparison with analyses 13, 43, 66, 68, 90, and 99 and the current Task 77 plan.

The focused suite passed 54 tests. That result establishes the current baseline; it does not validate the target contract because several passing tests intentionally encode dynamic default seeding, curated-directory activation, or global-wins behavior that this architecture replaces.
