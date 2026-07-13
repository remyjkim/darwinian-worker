# ABOUTME: Test-first plan for the first supported Worker-root, singular-selection, and project-isolation contract.
# ABOUTME: Implements clean-slate namespaced schema V1 formats with no prototype readers, migrations, aliases, or dual behavior.

# Task 77: Clean-Slate Worker Roots and Project Isolation Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans`, `test-driven-development`, `incremental-commits`, and `verification-before-completion`. Do not execute this revision until architecture review approves it.

**Goal:** Ship the first supported drwn project contract: explicit Worker roots, exactly zero or one active Worker, aggregate Blueprint materialization, pure project projection, and no implicit machine-capability inheritance.

**Architecture:** Project config, lock, local overlay, and generated records use self-identifying schema V1 formats. Project requirements resolve into a root/member graph; effective state selects one root and expands its Card closure; `write` projects that declared state without mutating it. Prototype formats and command paths are rejected rather than read or migrated.

**Tech Stack:** Bun, TypeScript 6, Clipanion, JSON schema validators, immutable Card Store artifacts, vendored project trees, managed-path reconciliation, `bun:test`, Bash smoke scenarios.

**Status:** Revision 5 - revised for clean-slate architecture review; implementation paused

**Architecture authority:** `.ai/analyses/116_drwn-cli-card-worker-target-architecture.md` Revision 5

**Execution location:** Primary checkout `/Users/pureicis/dev/darwinian-minds`. Do not create an isolated worktree unless the user changes that decision.

**Security dependency:** Task 79 is complete. Whole-Store export remains fail-closed throughout this plan.

**Machine dependency:** Task 80 is not implemented here. It must be separately revised around clean machine schema V1, empty non-interactive setup, guided opt-out Operator profile, explicit machine capability selections, and removal of direct curation.

---

## 0. Approved Contract

Task 77 implements only these behaviors.

### 0.1 Project and Worker Model

- A top-level project requirement is a Worker root.
- A plain Card root is a one-Card Worker.
- A Blueprint root expands to its ordered plain-Card members.
- Multiple installed roots are alternatives.
- `activeWorker` is required and contains one installed root name or `null`.
- Composition occurs only in one Blueprint, never through a Worker stack.
- Members and inactive roots remain pinned but contribute no active capabilities.
- One aggregate generated bundle exists per root; no member bundle is generated.

### 0.2 First Supported Local Formats

```text
drwn.project-config          schemaVersion 1
drwn.project-lock            schemaVersion 1
drwn.project-local           schemaVersion 1
drwn.generated-workers       schemaVersion 1
drwn.generated-active-worker schemaVersion 1
```

Prototype fields such as `version`, `cards`, `activeWorkers`, `activate`, and `lockfileVersion` are invalid supported input. No adapter reads, normalizes, repairs, or rewrites them.

### 0.3 Command Surface

Canonical project commands:

```text
drwn init
drwn add <root-ref>
drwn apply <root-ref...> [--active <root>|--none]
drwn remove <root-name>
drwn pin <root-ref>
drwn update [root-name]
drwn use <root-name-or-ref>|--none [--no-write]
drwn install [--no-write]
drwn write
drwn status
drwn doctor
```

Absent prototype commands/options:

```text
drwn card add|apply|remove|pin|update|detach
drwn worker stack [use|clear]
drwn install --no-apply
```

These are unregistered syntax failures. There is no `COMMAND_MOVED`, warning alias, or compatibility release window.

### 0.4 Project Capability Boundary

Declared project capabilities are:

```text
selected root closure + committed project overlays + local project overlays
```

Machine profiles, machine selections, compatibility directories, user-home target state, inactive roots, and generated output never enter project declared state. Ambient user-home visibility is diagnostic-only in Task 77.

### 0.5 Consumer Rollout

`/Users/pureicis/dev/darwinian-cards` is deliberately reset after a resolvable aggregate Blueprint is published. Preserve these source Cards:

```text
@remyjkim/fal@^0.2.0
@darwinian/operator@^1.0.0
@leeminseung/notion@0.1.0
```

Do not initialize Git in the parent workspace. The Blueprint source repository and remote must be explicitly assigned before publication.

---

## 1. Execution Rules

1. Obtain review approval for Analysis 116 Revision 5 and this plan before changing implementation.
2. Work in the primary checkout. Keep the unrelated Task 78 completion file untouched.
3. Start every behavior change with a focused failing test.
4. Confirm failures are caused by the missing target behavior, not fixture defects.
5. Implement the smallest complete supported contract; do not add prototype readers or migration branches.
6. Replace forward-facing prototype tests with target tests. Keep only explicit rejection fixtures for prototype formats and removed commands.
7. Run focused tests after each implementation step and broader gates at each Part boundary.
8. Commit each task independently with no references to assistant tooling.
9. Never commit credentials, `.env` values, OAuth tokens, generated auth state, or whole-Store archives.
10. Do not alter the remote deploy payload contract.
11. Do not implement Task 80/81/82/83 policies opportunistically.
12. Do not reset `darwinian-cards` until the aggregate Blueprint ref resolves from the intended publication source.
13. A write-path failure must be proven to leave project intent bytes unchanged.
14. A mutation-path failure must be proven to commit config and lock together or neither.

### Required Part Gates

After every Part:

```bash
bun run typecheck
bun test <focused files for the Part>
git status --short
```

At Parts A-D, run the complete suite before moving on:

```bash
bun test
```

Expected: zero failures. Existing environment-gated skips must be named in the completion record.

---

## Part A: Strict Supported State and Worker Graph

### Task 1: Replace Prototype Project Config with Namespaced Project Schema V1

**Files:**

- Modify: `cli/core/types.ts`
- Modify: `cli/core/project.ts`
- Modify: `cli/core/project-writes.ts`
- Modify: `cli/core/config-local.ts`
- Modify: `cli/commands/init.ts`
- Modify: `test/core-project.test.ts`
- Modify: `test/core-project-writes.test.ts`
- Modify: `test/core-config-local.test.ts`
- Modify: `test/commands-init.test.ts`
- Create: `test/core-project-schema.test.ts`

**Step 1: Write strict schema tests**

Add fixtures for:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": [],
  "activeWorker": null
}
```

Assert:

- the canonical config parses without mutation;
- `workers` is a string array of root refs;
- `activeWorker` is required and is `string|null`;
- wrong/missing schema identity fails with `PROJECT_CONFIG_INVALID`;
- unsupported schema version fails with `PROJECT_CONFIG_INVALID`;
- `{ "version":1, "cards":[], "activeWorkers":[] }` fails with `PROJECT_CONFIG_INVALID`;
- prohibited prototype fields fail even when canonical fields also exist;
- read-only commands never rewrite invalid bytes;
- local config requires `schema:"drwn.project-local"` and `schemaVersion:1`;
- local `activeWorker`, replacements, local-only roots, and source overrides retain provenance.

**Step 2: Run the red tests**

```bash
bun test test/core-project-schema.test.ts test/core-project.test.ts test/core-project-writes.test.ts test/core-config-local.test.ts test/commands-init.test.ts
```

Expected: FAIL because current project config uses prototype `version/cards/activeWorkers` shapes.

**Step 3: Implement one strict validator**

Define:

```ts
export interface ProjectConfigV1 {
  schema: "drwn.project-config";
  schemaVersion: 1;
  workers: string[];
  activeWorker: string | null;
  // Existing supported overlay sections remain explicitly typed.
}
```

All project loaders return this type. Do not create `ProjectConfigV0`, `LegacyProjectConfig`, `normalizeProjectConfig`, or migration warnings. Keep validation structured and fail before any filesystem mutation.

`init` writes the canonical empty config. Existing non-empty invalid project state causes a normal error unless the operator has deliberately removed/reset it outside this command.

**Step 4: Run focused tests and typecheck**

```bash
bun test test/core-project-schema.test.ts test/core-project.test.ts test/core-project-writes.test.ts test/core-config-local.test.ts test/commands-init.test.ts
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add cli/core/types.ts cli/core/project.ts cli/core/project-writes.ts cli/core/config-local.ts cli/commands/init.ts test/core-project-schema.test.ts test/core-project.test.ts test/core-project-writes.test.ts test/core-config-local.test.ts test/commands-init.test.ts
git commit -m "feat(project): define the supported project schema"
```

---

### Task 2: Add Explicit Worker Graph and Namespaced Lock Schema V1

**Files:**

- Modify: `cli/core/card-lock.ts`
- Create: `cli/core/worker-graph.ts`
- Modify: `test/core-card-lock.test.ts`
- Create: `test/core-worker-graph.test.ts`

**Step 1: Write graph and strict lock tests**

Cover:

- a plain Card root;
- a Blueprint root with ordered plain-Card members;
- two alternative roots sharing one compatible member;
- two roots resolving one Card name incompatibly;
- duplicate roots and duplicate members;
- nested Blueprint rejection;
- root/member references missing from `cards`;
- member entries incorrectly listed as roots;
- every Store/Git Card requiring tree SHA;
- schema identity/version rejection;
- prototype lock versions rejected without rewrite.

Canonical lock:

```ts
interface ProjectLockV1 {
  schema: "drwn.project-lock";
  schemaVersion: 1;
  store: { minDrwnVersion: string };
  workerRoots: WorkerRootLockEntry[];
  cards: CardLockEntry[];
}
```

**Step 2: Run red tests**

```bash
bun test test/core-card-lock.test.ts test/core-worker-graph.test.ts
```

Expected: FAIL because the current flat lock union and root resolver do not implement the supported graph.

**Step 3: Implement root resolution and lock validation**

`resolveWorkerGraph(agentsDir, specs)` must:

1. Resolve each top-level spec as a root.
2. Add the root Card to the deduplicated Card table.
3. Expand `composedFrom` only when the root is a Blueprint.
4. Reject Blueprint members that are Blueprints.
5. Preserve root and member order.
6. Reject incompatible same-name artifacts.
7. Return `{roots,cards}`.

Replace the lock union with one supported validator. Delete old version branching and reconstruction code. `writeCardLock` and `persistCardLock` always write namespaced V1.

Local lock replacement logic validates against the supported graph and cannot change committed root identity.

**Step 4: Verify**

```bash
bun test test/core-card-lock.test.ts test/core-worker-graph.test.ts test/core-config-local.test.ts
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add cli/core/card-lock.ts cli/core/worker-graph.ts test/core-card-lock.test.ts test/core-worker-graph.test.ts
git commit -m "feat(worker): persist the supported root graph"
```

---

### Task 3: Select One Root and Expand Only Its Closure

**Files:**

- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/card-skill-resolver.ts`
- Modify: `cli/core/diagnostics.ts`
- Retire: `test/core-effective-state-stack.test.ts`
- Create: `test/core-effective-state-worker.test.ts`
- Modify: `test/core-skill-conflict.test.ts`
- Modify: `test/core-mode-resolution.test.ts`

**Step 1: Write selection tests**

Assert:

- one selected plain root activates only that Card;
- one selected Blueprint activates root plus ordered members;
- `activeWorker:null` activates no Card capabilities;
- an inactive alternative contributes nothing;
- selecting a member fails `ACTIVE_WORKER_NOT_INSTALLED`;
- selecting an absent root fails before projection;
- local-only root selection works only through valid local config;
- local replacement changes bytes/provenance but not root identity;
- duplicate skill/MCP conflicts are closure-local and source-attributed.

**Step 2: Run red tests**

```bash
bun test test/core-effective-state-worker.test.ts test/core-skill-conflict.test.ts test/core-mode-resolution.test.ts
```

Expected: FAIL because current effective state treats flat Cards/active stacks as composition.

**Step 3: Implement a single selector**

Create one graph selection function returning:

```ts
{
  installedRoots,
  activeWorker,
  selectedRoot,
  activeCards,
  selectionSource,
  localOverrides
}
```

Every project consumer uses this result. Delete `selectActiveCards`, stack defaults, and all implicit-all-active logic.

**Step 4: Verify Part A**

```bash
bun test test/core-project-schema.test.ts test/core-card-lock.test.ts test/core-worker-graph.test.ts test/core-effective-state-worker.test.ts test/core-skill-conflict.test.ts test/core-mode-resolution.test.ts
bun run typecheck
bun test
```

Expected: all pass.

**Step 5: Commit**

```bash
git add cli/core/effective-state.ts cli/core/card-skill-resolver.ts cli/core/diagnostics.ts test/core-effective-state-stack.test.ts test/core-effective-state-worker.test.ts test/core-skill-conflict.test.ts test/core-mode-resolution.test.ts
git commit -m "feat(worker): activate one root and its card closure"
```

---

## Part B: Aggregate Materialization and Pure Projection

### Task 4: Generate One Aggregate Worker Bundle per Root

**Files:**

- Modify: `cli/core/worker-generator/sync-worker.ts`
- Create: `cli/core/worker-generator/types.ts`
- Create: `cli/core/worker-generator/instructions.ts`
- Create: `cli/core/worker-generator/hooks.ts`
- Modify: `test/core-sync-worker.test.ts`
- Modify: `test/core-worker-hook-stack.test.ts`
- Modify: `test/core-blueprint-composition.test.ts`
- Modify: `test/core-write-idempotent.test.ts`

**Step 1: Write aggregate-output tests**

Assert:

- one plain root produces one aggregate directory;
- one Blueprint produces one aggregate directory containing all member capabilities;
- no member directory is generated;
- two installed alternatives produce two aggregate directories;
- active projection includes only the selected aggregate;
- generated registries use namespaced schema V1;
- hooks from closure Cards compose into one owned adapter with source attribution;
- root instructions/identity are not duplicated from member folders;
- deselection removes active downstream projection without deleting installed root registry entries;
- stale current-format roots are pruned from managed output;
- repeated generation is byte-identical.

**Step 2: Run red tests**

```bash
bun test test/core-sync-worker.test.ts test/core-worker-hook-stack.test.ts test/core-blueprint-composition.test.ts test/core-write-idempotent.test.ts
```

Expected: FAIL because current generator emits one Worker per locked Card and stack-shaped records.

**Step 3: Implement aggregate compilation**

Generate only root directories. Each root aggregate records:

- root name/ref/kind;
- ordered closure Card names, versions, integrity, tree SHA, and source path;
- merged skill/MCP/hook/instruction inputs with provenance;
- generated target adapters.

Write `workers.json` and `active-worker.json` with schema identity/version. Never read generated bytes into effective state.

Prototype generated formats are not migrated. Tests start from clean supported state or explicitly prove invalid prototype state is ignored only after operator reset.

**Step 4: Verify**

```bash
bun test test/core-sync-worker.test.ts test/core-worker-hook-stack.test.ts test/core-blueprint-composition.test.ts test/core-write-idempotent.test.ts
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add cli/core/worker-generator test/core-sync-worker.test.ts test/core-worker-hook-stack.test.ts test/core-blueprint-composition.test.ts test/core-write-idempotent.test.ts
git commit -m "feat(worker): materialize aggregate root bundles"
```

---

### Task 5: Prove `write` Is a Pure Projection

**Files:**

- Modify: `cli/commands/write.ts`
- Modify: `cli/core/sync.ts`
- Modify: `cli/core/vendor-reconcile.ts`
- Modify: `test/commands-write.test.ts`
- Modify: `test/core-write-offline.test.ts`
- Modify: `test/core-write-record.test.ts`
- Modify: `test/core-update-revendor.test.ts`
- Create: `test/commands-write-intent-purity.test.ts`

**Step 1: Write byte-purity tests**

Hash config and lock before:

- normal write;
- dry-run;
- one target;
- skills-only;
- MCP-only;
- offline vendored write;
- hook-consent preflight;
- invalid active selection;
- capability conflict;
- downstream drift failure.

Assert config/lock bytes and mtimes are unchanged in every case. Preflight failures also leave vendor, generated, target, write-record, Git ignore, and attributes bytes unchanged.

**Step 2: Run red tests**

```bash
bun test test/commands-write-intent-purity.test.ts test/commands-write.test.ts test/core-write-offline.test.ts test/core-write-record.test.ts test/core-update-revendor.test.ts
```

Expected: FAIL where current write preparation mutates intent or performs side effects before full validation.

**Step 3: Separate preflight from projection**

`buildEffectiveState` validates supported config/lock, selection, closure, capability conflicts, target selection, and hook policy before any write helper runs. `syncRepository` receives the validated state and mutates projection-owned surfaces only.

Do not add an intent repair path to `write`.

**Step 4: Verify Part B**

```bash
bun test test/commands-write-intent-purity.test.ts test/commands-write.test.ts test/core-write-offline.test.ts test/core-write-record.test.ts test/core-update-revendor.test.ts
bun run typecheck
bun test
```

Expected: all pass.

**Step 5: Commit**

```bash
git add cli/commands/write.ts cli/core/sync.ts cli/core/vendor-reconcile.ts test/commands-write-intent-purity.test.ts test/commands-write.test.ts test/core-write-offline.test.ts test/core-write-record.test.ts test/core-update-revendor.test.ts
git commit -m "fix(write): preserve project intent during projection"
```

---

## Part C: Supported Project Commands

### Task 6: Add Atomic Root Requirement Mutations

**Files:**

- Create: `cli/core/project-state-transaction.ts`
- Create: `cli/core/worker-project.ts`
- Create: `cli/commands/project/add.ts`
- Create: `cli/commands/project/apply.ts`
- Create: `cli/commands/project/remove.ts`
- Create: `cli/commands/project/pin.ts`
- Create: `cli/commands/project/update.ts`
- Modify: `cli/index.ts`
- Create: `test/core-project-state-transaction.test.ts`
- Create: `test/commands-project-workers.test.ts`

**Step 1: Write mutation and transaction tests**

Root behavior:

- `add` appends one root and explicitly selects it when active is `null` and it is the first root;
- adding alternatives preserves the current active root;
- `apply` with one root selects it unless `--none`;
- `apply` with multiple roots requires `--active` or `--none`;
- `remove` prunes unreachable members and clears selection when removing the active root;
- `pin` and `update` preserve selection by canonical root name;
- dry-run reports exact next config/lock bytes with zero artifacts;
- resolution/validation failure preserves both files byte-for-byte.

Transaction behavior:

- one exclusive owner lock covers snapshot, prepare, and commit;
- immutable `config.next` and `lock.next` sources survive target renames;
- journal records explicit prepared/config-written/lock-written/committed phases;
- recovery rolls forward from every crash checkpoint using source hashes;
- dead same-host locks are quarantined before recovery;
- live locks return `PROJECT_STATE_TRANSACTION_BUSY`;
- malformed/foreign-host locks fail closed;
- missing/escaping journal sources preserve evidence and fail closed;
- dry-run creates no lock, journal, staging, or target artifacts.

**Step 2: Run red tests**

```bash
bun test test/core-project-state-transaction.test.ts test/commands-project-workers.test.ts
```

Expected: FAIL because supported top-level root mutations and the transaction primitive do not exist.

**Step 3: Implement complete-state mutation**

Each command:

1. Acquires the project transaction lock.
2. Reads one supported config/lock snapshot.
3. Resolves and validates the complete next graph.
4. Serializes exact supported schema V1 bytes.
5. Commits both files through the journal protocol.
6. Optionally runs projection only after commit.

No command reconstructs intent from generated or downstream files.

**Step 4: Verify**

```bash
bun test test/core-project-state-transaction.test.ts test/commands-project-workers.test.ts
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add cli/core/project-state-transaction.ts cli/core/worker-project.ts cli/commands/project cli/index.ts test/core-project-state-transaction.test.ts test/commands-project-workers.test.ts
git commit -m "feat(project): manage worker roots atomically"
```

---

### Task 7: Add Singular `use` and Remove Prototype Command Paths

**Files:**

- Modify: `cli/commands/use.ts`
- Modify: `cli/commands/install.ts`
- Modify: `cli/commands/worker/worker.ts`
- Modify: `cli/index.ts`
- Retire: `cli/commands/card/add.ts`
- Retire: `cli/commands/card/apply.ts`
- Retire: `cli/commands/card/remove.ts`
- Retire: `cli/commands/card/pin.ts`
- Retire: `cli/commands/card/update.ts`
- Retire: `cli/commands/card/detach.ts`
- Retire: `cli/commands/worker/stack/list.ts`
- Retire: `cli/commands/worker/stack/use.ts`
- Retire: `cli/commands/worker/stack/clear.ts`
- Retire: `test/commands-worker-stack.test.ts`
- Create: `test/commands-use-worker.test.ts`
- Modify: `test/commands-install.test.ts`
- Modify: `test/commands-install-legacy-lock.test.ts`
- Modify: `test/scenarios-card-pr2-bash.test.ts`
- Modify: `test/scenarios-dm-card-base-collaboration-bash.test.ts`

**Step 1: Write `use` and removed-surface tests**

Assert:

- `use <installed-name>` changes only selection, then writes;
- `use <new-ref>` installs additively, selects, then writes;
- `use --none` preserves roots and removes active downstream projection;
- member selection fails;
- write failure reports persisted selection and does not roll back valid graph state;
- `--no-write` changes selection only;
- `--dry-run` reports install/selection/write and changes nothing;
- `install --no-write` hydrates without projection;
- `install --no-apply` is an unknown option and changes nothing;
- every removed Card mutation and Worker stack path is unknown and non-mutating;
- help contains only canonical commands/options.

Replace `commands-install-legacy-lock.test.ts` with strict unsupported-lock rejection tests or rename it to `commands-install-unsupported-lock.test.ts`. Do not preserve old lock hydration.

**Step 2: Run red tests**

```bash
bun test test/commands-use-worker.test.ts test/commands-install.test.ts test/commands-install-unsupported-lock.test.ts test/scenarios-card-pr2-bash.test.ts test/scenarios-dm-card-base-collaboration-bash.test.ts
```

Expected: FAIL because `use` still replaces flat Cards and prototype paths remain registered.

**Step 3: Implement only canonical paths**

`use` delegates to `worker-project` under one config/lock mutation transaction, registers the project after success, and invokes projection after selection commit unless suppressed. Removed classes and registrations are deleted; no forwarding shims remain.

**Step 4: Scan and verify Part C**

```bash
rg -n "COMMAND_MOVED|WORKER_STACK_UNSUPPORTED|--no-apply|worker stack|activeWorkers|card (add|apply|remove|pin|update|detach)" cli test
bun test test/commands-use-worker.test.ts test/commands-project-workers.test.ts test/commands-install.test.ts test/commands-install-unsupported-lock.test.ts test/scenarios-card-pr2-bash.test.ts test/scenarios-dm-card-base-collaboration-bash.test.ts
bun run typecheck
bun test
```

Allowed matches: strict unsupported-input/removed-command tests only. Production runtime has none.

**Step 5: Commit**

```bash
git add cli/commands cli/index.ts test/commands-use-worker.test.ts test/commands-install.test.ts test/commands-install-unsupported-lock.test.ts test/commands-install-legacy-lock.test.ts test/commands-worker-stack.test.ts test/scenarios-card-pr2-bash.test.ts test/scenarios-dm-card-base-collaboration-bash.test.ts
git commit -m "feat(cli): expose the supported project command surface"
```

---

## Part D: One Effective-State Authority and Project Isolation

### Task 8: Unify Status, Doctor, MCP, and Overlay Evaluation

**Files:**

- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/diagnostics.ts`
- Create: `cli/core/ambient-capabilities.ts`
- Modify: `cli/commands/status.ts`
- Modify: `cli/commands/doctor.ts`
- Modify: `cli/commands/mcp/list.ts`
- Modify: `cli/commands/add/skill.ts`
- Modify: `cli/commands/add/mcp.ts`
- Modify: `test/commands-status.test.ts`
- Modify: `test/commands-doctor.test.ts`
- Modify: `test/commands-mcp.test.ts`
- Modify: `test/commands-add-skill.test.ts`
- Modify: `test/commands-add-mcp.test.ts`
- Modify: `test/core-effective-state-overlay.test.ts`

**Step 1: Write the supported status contract**

Status and doctor JSON use:

```json
{
  "schema": "drwn.project-status",
  "schemaVersion": 1,
  "installedWorkers": [],
  "activeWorker": null,
  "activeCards": [],
  "selectionSource": "project",
  "localOverrides": {
    "activeWorker": null,
    "cardReplacements": [],
    "localOnlyRoots": [],
    "sourceOverrides": []
  },
  "projectOverlays": {
    "skills": [],
    "mcp": [],
    "extensions": [],
    "targets": [],
    "hookControls": []
  },
  "declaredCapabilities": {
    "skills": [],
    "mcp": [],
    "hooks": []
  },
  "ambientCapabilities": {
    "observations": [],
    "enforcement": "diagnostic-only"
  },
  "projection": {
    "current": false,
    "issues": []
  }
}
```

Every item includes source kind, source ID/path, target, and health. There is no migration section.

**Step 2: Prove one evaluator**

Add a fixture where machine MCP/skills exist but the project declares none. Assert `status`, `doctor`, `mcp list`, add validation, and write agree that the capabilities are absent from project declared state.

Assert:

- inactive-root MCP enable toggle fails `MCP_DEFINITION_NOT_EFFECTIVE` and names the root;
- active-closure definition is usable;
- explicit Library definition is usable only through an explicit project overlay;
- same-ID active Card skill cannot be silently replaced by project bytes;
- every local overlay lane appears with provenance;
- invalid project schema reports `PROJECT_CONFIG_INVALID`, not migration advice.

**Step 3: Run red tests**

```bash
bun test test/commands-status.test.ts test/commands-doctor.test.ts test/commands-mcp.test.ts test/commands-add-skill.test.ts test/commands-add-mcp.test.ts test/core-effective-state-overlay.test.ts
```

Expected: FAIL because command consumers currently rebuild flat/default state independently.

**Step 4: Route consumers through `buildEffectiveState`**

Delete command-local `loadEffectiveConfig`/`mergeProjectConfig`/`buildActiveServers` evaluation. `buildEffectiveState` accepts explicit project or machine scope and returns the graph, selection, overlays, declared capabilities, ambient observations, projection inputs, and diagnostics.

Ambient inspection reads enough Claude/Codex/Cursor user-home metadata to report ID, target, path, and same-ID declaration. It does not read those bytes as project capability definitions and does not block writes generically.

**Step 5: Verify and commit**

```bash
bun test test/commands-status.test.ts test/commands-doctor.test.ts test/commands-mcp.test.ts test/commands-add-skill.test.ts test/commands-add-mcp.test.ts test/core-effective-state-overlay.test.ts
bun run typecheck
git add cli/core/effective-state.ts cli/core/diagnostics.ts cli/core/ambient-capabilities.ts cli/commands/status.ts cli/commands/doctor.ts cli/commands/mcp/list.ts cli/commands/add/skill.ts cli/commands/add/mcp.ts test/commands-status.test.ts test/commands-doctor.test.ts test/commands-mcp.test.ts test/commands-add-skill.test.ts test/commands-add-mcp.test.ts test/core-effective-state-overlay.test.ts
git commit -m "feat(status): report one declared project state"
```

---

### Task 9: Make Project Output Independent from Machine Capability State

**Files:**

- Modify: `cli/core/skills.ts`
- Modify: `cli/core/mcp.ts`
- Modify: `cli/core/sync.ts`
- Modify: `cli/core/effective-state.ts`
- Modify: `test/core-skills-materialize.test.ts`
- Modify: `test/core-skills.test.ts`
- Modify: `test/core-effective-state.test.ts`
- Modify: `test/commands-write.test.ts`
- Modify: `test/scenarios-root-scope.test.ts`
- Create: `test/core-project-machine-isolation.test.ts`

**Step 1: Write isolation tests**

With project config, lock, Card sources, and local overlay fixed, mutate independently:

- machine default/profile fixture IDs;
- machine optional/parallel prototype flags;
- `~/.agents/skills` contents;
- repo `skills/claude-only` and `skills/codex-only` directories;
- Claude/Codex/Cursor user-home target configs;
- inactive root capabilities.

Assert project effective state and project output are byte-identical. Status ambient observations may change, but declared capabilities and projection do not.

Hash machine config, user-home configs/directories, project config, and lock around normal, dry-run, target-only, skills-only, and MCP-only project writes. Assert machine/user-home and project intent bytes remain unchanged.

**Step 2: Run red tests**

```bash
bun test test/core-project-machine-isolation.test.ts test/core-skills-materialize.test.ts test/core-skills.test.ts test/core-effective-state.test.ts test/commands-write.test.ts test/scenarios-root-scope.test.ts
```

Expected: FAIL because current project skill/MCP paths scan machine/default/compatibility inputs.

**Step 3: Make sync scope-explicit**

For project scope, pass exact desired capability IDs and source paths from effective state. Never discover desired project state by scanning machine or compatibility directories.

For machine scope, preserve current prototype behavior only until Task 80 replaces it; do not modify it in this task. The project branch must not call machine capability evaluators.

**Step 4: Verify Part D**

```bash
bun test test/core-project-machine-isolation.test.ts test/core-skills-materialize.test.ts test/core-skills.test.ts test/core-effective-state.test.ts test/commands-write.test.ts test/scenarios-root-scope.test.ts
bun run typecheck
bun test
```

Expected: all pass.

**Step 5: Commit**

```bash
git add cli/core/skills.ts cli/core/mcp.ts cli/core/sync.ts cli/core/effective-state.ts test/core-project-machine-isolation.test.ts test/core-skills-materialize.test.ts test/core-skills.test.ts test/core-effective-state.test.ts test/commands-write.test.ts test/scenarios-root-scope.test.ts
git commit -m "fix(project): isolate output from machine capabilities"
```

---

## Part E: Capture, Deploy, Documentation, Release, and Consumer Rollout

### Task 10: Capture Only the Selected Root Closure

**Files:**

- Modify: `cli/core/card-capture.ts`
- Modify: `cli/commands/card/new.ts`
- Modify: `test/core-card-capture.test.ts`
- Modify: `test/commands-card-new-from-project.test.ts`

**Step 1: Write capture tests**

Assert `card new --from-project` captures:

- the selected root closure;
- explicit committed/local project overlays when the command contract includes them;
- source attribution.

Assert it excludes:

- inactive roots;
- machine profile/default capabilities;
- ambient user-home capabilities;
- generated projection bytes;
- platform connectors;
- secret values.

No active Worker fails without creating a source.

**Step 2: Run red tests**

```bash
bun test test/core-card-capture.test.ts test/commands-card-new-from-project.test.ts
```

Expected: FAIL because capture currently consumes flat/stack/default state.

**Step 3: Reuse effective state and verify**

```bash
bun test test/core-card-capture.test.ts test/commands-card-new-from-project.test.ts
bun run typecheck
```

**Step 4: Commit**

```bash
git add cli/core/card-capture.ts cli/commands/card/new.ts test/core-card-capture.test.ts test/commands-card-new-from-project.test.ts
git commit -m "fix(card): capture one selected worker closure"
```

---

### Task 11: Align Mind and Deploy Consumers without Changing the Remote Contract

**Files:**

- Modify: `cli/core/worker-deploy.ts`
- Modify: `cli/commands/worker/deploy.ts`
- Modify: `cli/core/mind-store/project.ts`
- Modify: `cli/core/mind-store/seed.ts`
- Modify: `cli/core/mind-store/rebase.ts`
- Modify: `cli/core/mind-store/ledger.ts`
- Modify: `test/core-worker-deploy.test.ts`
- Create: `test/commands-worker-deploy.test.ts`
- Modify: `test/core-mind-store-seed.test.ts`
- Modify: `test/contract/deploy-payload.v1.json`

**Step 1: Write one-root consumer tests**

Assert:

- deploy receives one root plus every pinned closure Card;
- bare Card and Blueprint roots contain one entrypoint;
- member-only and independent-root arrays fail locally;
- mind seed/rebase records one `worker` plus ordered `cards`, never a stack;
- integrity/tree SHA/provenance survive translation;
- local schema names/versions do not appear in the remote payload.

**Step 2: Lock the existing remote fixture**

Keep remote `contractVersion:1` and its existing embedded lock/config shapes. The local adapter translates supported local schema V1 to that payload. Do not rename or renumber the remote contract.

**Step 3: Run red tests, implement, and verify**

```bash
bun test test/core-worker-deploy.test.ts test/commands-worker-deploy.test.ts test/core-mind-store-seed.test.ts
bun run typecheck
```

Expected after implementation: PASS and fixture change only where root/closure content was previously wrong, not because local schema names changed.

**Step 4: Commit**

```bash
git add cli/core/worker-deploy.ts cli/commands/worker/deploy.ts cli/core/mind-store/project.ts cli/core/mind-store/seed.ts cli/core/mind-store/rebase.ts cli/core/mind-store/ledger.ts test/core-worker-deploy.test.ts test/commands-worker-deploy.test.ts test/core-mind-store-seed.test.ts test/contract/deploy-payload.v1.json
git commit -m "fix(worker): deploy and seed one root closure"
```

---

### Task 12: Publish the First Supported Contract Documentation

**Files:**

- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `.ai/knowledges/09_cards-manual-test-guide.md`
- Modify: `.ai/knowledges/10_drwn-cli-architecture.md`
- Modify: `.ai/knowledges/11_card-usage-guide.html`
- Modify: `docs/cli-quickref.md`
- Create: `docs/contracts/project-worker-v1.md`
- Create: `docs/prelaunch-project-reset.md`
- Modify: `README.md`
- Modify: `INSTALL.md`
- Modify: `cli/commands/worker/worker.ts`
- Modify: `test/cli-help-shape.test.ts`
- Modify: `test/docs-readiness.test.ts`

**Step 1: Document the supported model**

Teach:

```text
author Cards -> compose one Blueprint -> add roots -> select one Worker -> write
```

Document:

- every namespaced schema V1 shape;
- roots versus members;
- explicit `activeWorker` including `null`;
- aggregate generated output;
- canonical commands only;
- project declaration versus machine/ambient visibility;
- controlled prelaunch reset, with no automated migration promise;
- Notion OAuth and external stdio/API installation as operator state;
- Task 80 selected direction as future work, not shipped Task 77 behavior;
- Store export remains fail-closed.

Do not publish deprecation tables or old-to-new migration syntax. The reset guide can identify prototype files to back up/remove but must not describe them as supported input.

**Step 2: Add contradiction scans**

```bash
rg -n "activeWorkers|worker stack|--no-apply|COMMAND_MOVED|lockfileVersion|project config V2|lock V6|migration adapter|all installed workers are active" README.md INSTALL.md docs .ai/knowledges cli/commands
```

Allowed matches: prelaunch reset warnings or explicit removed-surface assertions. Forward usage docs contain none.

**Step 3: Verify and commit**

```bash
bun test test/cli-help-shape.test.ts test/docs-readiness.test.ts
bun run docs:build
bun run typecheck
git add .ai/knowledges/01_agents-cli-usage-guide.md .ai/knowledges/02_per-project-config-guide.md .ai/knowledges/09_cards-manual-test-guide.md .ai/knowledges/10_drwn-cli-architecture.md .ai/knowledges/11_card-usage-guide.html docs/cli-quickref.md docs/contracts/project-worker-v1.md docs/prelaunch-project-reset.md README.md INSTALL.md cli/commands/worker/worker.ts test/cli-help-shape.test.ts test/docs-readiness.test.ts
git commit -m "docs(cli): publish the first project worker contract"
```

---

### Task 13: Gate the First Supported Release and Complete Controlled Rollout

**Files:**

- Modify: `scripts/verify-release-readiness.ts`
- Create: `test/scripts-verify-worker-contract.test.ts`
- Modify: `package.json`
- Modify: `cli/core/card-lock.ts`
- Create: `.ai/tasks/77_completion_worker-roots-and-project-isolation.md`
- Modify after publication: `/Users/pureicis/dev/darwinian-cards/.agents/drwn/config.json`
- Replace after publication: `/Users/pureicis/dev/darwinian-cards/.agents/drwn/card.lock`
- Regenerate after publication: `/Users/pureicis/dev/darwinian-cards/.agents/drwn/generated/`
- Modify in separate repository commit: `/Users/pureicis/dev/darwinian-cards/mind-tools/README.md`
- Modify in separate repository commit: `/Users/pureicis/dev/darwinian-cards/mind-starter/README.md`

**Step 1: Add release gates**

Fail release when:

- supported project or lock writers omit schema identity/version;
- production project code reads prototype `cards`, `activeWorkers`, `version`, or `lockfileVersion` shapes;
- old Card mutation or Worker stack commands are registered;
- `install --no-apply` is accepted;
- generated Worker sync treats each locked member as a root;
- project skill/MCP evaluation scans machine/compatibility directories;
- command consumers rebuild declared state outside `buildEffectiveState`;
- inactive-root capability definitions can be enabled by ID;
- docs teach prototype commands/formats;
- whole-Store export becomes enabled.

Do not add Task 80-83 policy gates.

**Step 2: Set the first supported CLI floor**

Set package version and local feature floor to `0.8.0`. Local schema versions remain `1`. Do not infer that Notion/Momentic startup failures require this CLI bump; those remain operator auth/install state.

**Step 3: Run pre-rollout release verification**

```bash
bun run typecheck
bun test
bun run verify:release --json
bun run docs:build
bun run verify:bridge
```

Expected: zero failures and release JSON `ok:true`.

**Step 4: Publish the aggregate Blueprint**

Before mutating the consumer:

1. Confirm the designated Blueprint source repository and remote with the operator.
2. Create `@darwinian/darwinian-cards-worker` as `kind:"blueprint"`.
3. Set ordered `composedFrom` to the three preserved refs.
4. Validate source and closure.
5. Publish an immutable version.
6. Resolve that published ref from a clean fixture.
7. Record ref, version, source, integrity, and test evidence.

No credentials enter the Blueprint. Notion OAuth/API key setup remains operator-local.

**Step 5: Deliberately reset and apply the consumer**

Snapshot the current non-secret project declaration for the completion record. Then remove/reset prototype config, lock, generated state, and managed projection as documented. Do not remove the three Card sources from their source repositories or machine Store.

Run supported initialization, apply the published Blueprint, select it, and write. Assert:

- config is `drwn.project-config` V1;
- lock is `drwn.project-lock` V1;
- one root is installed and active;
- lock closure contains exactly Blueprint + Operator + Notion + Fal;
- one aggregate generated root exists;
- all expected skills/MCP definitions project with source attribution;
- parent remains non-Git;
- status/doctor distinguish ambient Notion/operator state from project declaration;
- no secret values appear in project files.

**Step 6: Update independent consumer repositories**

Update `mind-tools/README.md` and `mind-starter/README.md` to reference the supported aggregate Blueprint flow. Commit each repository separately with ordinary project-specific messages.

**Step 7: Run post-rollout smoke/E2E checks**

Run:

- CLI unit and integration suite;
- Bash collaboration scenarios;
- clean-install smoke fixture from the published Blueprint;
- project `write --dry-run`, `write`, `status --json`, and `doctor --json`;
- Notion/Momentic startup observation without treating missing operator auth/install as CLI failure;
- remote deploy fixture tests without deploying unless credentials/environment are explicitly available;
- release, bridge, and docs gates again.

Record every skipped external E2E with the exact missing prerequisite.

**Step 8: Write completion evidence and commit**

The completion record includes:

- commit list;
- schema and command scans;
- unit/integration/smoke/E2E counts;
- release/bridge/docs results;
- consumer Blueprint ref and closure;
- parent non-Git verification;
- separate consumer README commits;
- external auth/install prerequisites still owned by the operator;
- confirmation that Task 80 remains unimplemented.

```bash
git add scripts/verify-release-readiness.ts test/scripts-verify-worker-contract.test.ts package.json cli/core/card-lock.ts .ai/tasks/77_completion_worker-roots-and-project-isolation.md
git commit -m "chore(release): gate the first worker contract"
```

---

## 2. Required Regression Inventory

Before completion, classify every match:

```bash
rg -n "activeWorkers|worker stack|active stack|defaultActiveWorkers|selectActiveCards|COMMAND_MOVED|WORKER_STACK_UNSUPPORTED|LEGACY_|--no-apply|lockfileVersion" cli test README.md INSTALL.md docs .ai/knowledges
```

Allowed:

- strict prototype-input rejection tests;
- removed-command/option non-mutation tests;
- prelaunch reset documentation that names unsupported artifacts.

Disallowed:

- any production reader, normalizer, migration diagnostic, compatibility command, alias, or forward usage example.

Authority scans:

```bash
rg -n "loadEffectiveConfig|mergeProjectConfig|buildActiveServers" cli/commands/status.ts cli/commands/doctor.ts cli/commands/mcp/list.ts cli/commands/add
rg -n "listCuratedSkills|resolveCuratedSkillsDir|claude-only|codex-only" cli/core/skills.ts cli/core/effective-state.ts cli/core/sync.ts
rg -n "for \(const card of state\.lockedCards\)|syncWorkers" cli/core/worker-generator cli/core/sync.ts
rg -n "store export|credentials.json" cli/commands/store/export.ts cli/core test
```

Expected:

- project command consumers call `buildEffectiveState`;
- curated/target-specific inventory is absent from project activation paths;
- generated roots come from `workerRoots`, not every Card;
- Store export remains fail-closed and credentials remain excluded from any transfer path.

---

## 3. Rollback and Reset Strategy

This plan provides no runtime compatibility rollback.

Code rollback:

- revert the relevant implementation commit(s);
- rerun the full prelaunch suite;
- do not add dual readers to make mixed commits coexist.

Project rollback during controlled development rollout:

- restore the operator-created non-secret snapshot of the prototype project directory if needed for investigation;
- run the matching prototype CLI only in an isolated development context;
- never ask the supported CLI to read that snapshot;
- re-run the supported reset from clean state after fixing the implementation.

Config/lock transaction recovery is for crashes within the supported schema, not migration or cross-version compatibility.

Remote deploy rollback continues to use the existing remote contract and deployment rollback commands. Local schema changes do not alter remote rollback semantics.

---

## 4. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Prototype schema and target schema are both informally called V1 | Require namespaced `schema` plus `schemaVersion:1`; reject `version`/`lockfileVersion` |
| Existing tests silently preserve prototype behavior | Replace forward tests; allow old shapes only in explicit rejection cases |
| Root/member identity collapses | Record `workerRoots` separately from deduplicated `cards`; validate references |
| Adding alternatives changes selection | Make `activeWorker` required and mutation semantics explicit |
| Multi-file mutation tears | Immutable sources, journal phases, hash recovery, stale-lock handling |
| Write changes intent | Hash/mtime tests across every write mode and failure checkpoint |
| Machine capabilities leak into projects | Scope-explicit effective state and byte-identity matrix |
| Ambient user-home state is mistaken for declaration | Separate status fields and diagnostic-only enforcement |
| Old commands linger through help or hidden registration | Registration/help tests plus release source scans |
| Local schema leaks into remote deploy payload | Contract fixture and adapter tests |
| Consumer reset loses Card work | Preserve/publish source Cards first; reset only project projection state |
| Aggregate Blueprint cannot be reproduced | Require assigned source repo/remote and clean resolution before reset |
| Secrets enter project/Blueprint/export | Secret-reference-only tests and Task 79 release gate |
| Task 80 policy is accidentally implemented early | Explicit out-of-scope gate and no Task 80 release assertions |

---

## 5. Out of Scope

- Any prototype project/lock/generated reader or migration command.
- Any deprecated command or option alias.
- Task 80 machine schema/profile implementation.
- Task 81 complete Library lifecycle.
- Task 82 portable Store transfer.
- Task 83 target-specific ambient collision enforcement.
- Nested Blueprints.
- A new remote deploy contract.
- Automatic Git initialization in `darwinian-cards`.
- Automatic Notion OAuth login, API key creation, or Momentic installation.

---

## 6. Review Gates Before Execution

Review must explicitly confirm:

- [ ] Namespaced local schemas all start at version 1.
- [ ] `activeWorker` is required and explicit, including `null`.
- [ ] Prototype config/lock/generated formats are rejected with no migration path.
- [ ] Old Card mutation commands, Worker stack commands, and `--no-apply` are removed without aliases.
- [ ] Atomic config/lock transaction scope remains required.
- [ ] Project capability isolation and diagnostic-only ambient reporting match the ratified architecture.
- [ ] Remote deploy contract remains unchanged.
- [ ] Task 80 selected direction is recorded but not implemented.
- [ ] Consumer rollout may deliberately reset `darwinian-cards` after Blueprint publication.
- [ ] Blueprint source repository/remote assignment is an operator prerequisite.
- [ ] Implementation will continue in the primary checkout, not an isolated worktree.

No implementation task begins until this checklist is approved.

---

## 7. Completion Checklist

- [ ] Every local supported record carries namespaced schema V1 identity.
- [ ] Prototype readers, migration adapters, dual writes, aliases, and migration diagnostics are absent.
- [ ] Root graph and one-selection tests pass.
- [ ] Aggregate materialization tests pass.
- [ ] Write intent-purity tests pass.
- [ ] Config/lock crash-recovery tests pass.
- [ ] Canonical command and removed-surface tests pass.
- [ ] Status/doctor/MCP/add consumers share one evaluator.
- [ ] Machine/project isolation matrix is byte-identical.
- [ ] Capture, mind, and deploy one-root tests pass.
- [ ] Remote deploy contract fixture remains compatible.
- [ ] Forward docs teach only the first supported contract.
- [ ] Store export remains fail-closed.
- [ ] Full unit/integration suite passes.
- [ ] Bash smoke scenarios pass.
- [ ] Available E2E checks pass; skips name prerequisites.
- [ ] Release, bridge, and docs gates pass before and after consumer rollout.
- [ ] Aggregate `darwinian-cards` Blueprint is published and cleanly resolvable.
- [ ] Consumer is deliberately reset to one active aggregate Worker while preserving three Card sources.
- [ ] Parent consumer workspace remains non-Git.
- [ ] Both nested README repositories have separate commits.
- [ ] Completion record contains all evidence and remaining operator prerequisites.
