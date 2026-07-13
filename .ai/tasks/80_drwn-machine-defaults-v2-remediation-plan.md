# ABOUTME: Approved clean-slate machine capability schema V1 and Operator profile implementation plan.
# ABOUTME: Replaces prototype defaults, implicit curation, and migration logic with explicit machine intent.

# Task 80: Machine Capability Schema V1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans`, `test-driven-development`, `incremental-commits`, and `verification-before-completion`. Work in the primary checkout on a feature branch; do not create a worktree.

**Status**: Approved direction revised into an execution-ready plan on 2026-07-13

**Goal**: Ship the first supported namespaced machine contract, initialize explicit empty intent outside guided setup, offer a pinned Recommended Darwinian Operator profile in guided setup, and make profile plus explicit selections the only machine capability authority.

**Architecture**: Machine intent lives only in `~/.agents/drwn/machine.json` as `drwn.machine` V1. A selected profile is an immutable Card pin filtered through an explicit packaged capability allowlist; it is not a Worker and contributes no instructions, hooks, mind content, permissions, governance, or project state. Machine projection remains an ownership-recorded write into user-home target surfaces and never enters project declarations.

**Dependencies**:

- Task 77 project isolation and strict project V1 contracts are complete.
- Task 79 whole-Store export remains fail-closed.
- Task 83 target-native project/ambient MCP policy is complete.
- Task 81 is not required; Task 80 may reuse existing atomic file and write-record primitives but does not add Library lifecycle or GC.

**Execution branch**: `feat/task-80-machine-profiles`

---

## 0. Approved Contract

### 0.1 First supported machine schema

The only supported machine format is:

```ts
interface MachineConfigV1 {
  schema: "drwn.machine";
  schemaVersion: 1;
  policy: {
    authoring?: { scope?: string };
    targets?: Partial<Record<TargetName, Partial<TargetConfig>>>;
    catalogs?: CanonicalConfig["catalogs"];
    analyzer?: CanonicalConfig["analyzer"];
    trustedSources?: TrustedSourcesPolicy;
  };
  capabilities: {
    profile: MachineProfilePin | null;
    skills: string[];
    mcpServers: string[];
  };
}

interface MachineProfilePin {
  id: "darwinian-operator";
  source: "git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2";
  name: "@darwinian/operator";
  version: "1.0.2";
  commit: string;
  treeSha: string;
  integrity: `sha256-${string}`;
  skills: string[];
  mcpServers: string[];
}
```

Validation is strict at every object level. Unknown fields, prototype
`version/defaults/optional/parallel` fields, wrong schema identity, unsupported
version, duplicate IDs, malformed pins, and an unapproved profile subset fail
with `MACHINE_CONFIG_INVALID`. Runtime never reads, rewrites, migrates, or
dual-writes the prototype machine shape or `~/.agents/drwn/config.json`.

No schema is called V2: this is the first supported machine schema and begins at
`schemaVersion:1`.

### 0.2 Initialization

- Store initialization and `drwn init --non-interactive` create exact empty
  capability intent: `profile:null`, `skills:[]`, and `mcpServers:[]`.
- `drwn init --minimal` has the same prompt-free machine behavior.
- Guided `drwn init` offers `Recommended Darwinian Operator` as `[Y/n]` only
  when machine state is being initialized. Declining writes explicit empty
  intent. Existing valid machine intent is never reset or re-prompted.
- Initialization does not scan `~/.agents/skills`, target directories, packaged
  optional flags, current projection, or registry activation state.
- Prototype state is rejected with a reset signpost. There is no migration
  command, preserve/empty migration option, legacy reader, or compatibility
  diagnostic.

### 0.3 Recommended Darwinian Operator profile

The packaged profile registry contains one approved profile:

```text
id: darwinian-operator
display: Recommended Darwinian Operator
source: git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2
Card: @darwinian/operator@1.0.2
skills: the 17 skills declared by that immutable Card
MCP servers: none
```

Before the descriptor is committed, the local Card source is updated from
`1.0.1` to `1.0.2`, all removed Task 77 command references are repaired, source
doctor and command scans pass, and the Card is published to the public remote.
The descriptor records the resulting commit, tree SHA, and integrity exactly.

Profile installation resolves the exact Git tag once, verifies name, version,
tree SHA, integrity, and allowlisted IDs, then records the immutable pin. Runtime
reads from the pinned extracted tree and does not fetch or resolve mutable ranges
during status or write.

The evaluator filters the Card to the recorded skills and MCP IDs. It never
treats the profile as an active Worker and never evaluates Card instructions,
hooks, hook consent, persona, beliefs, memory, permissions, governance,
escalation, eval metadata, target overlays, or Blueprint composition.

### 0.4 Activation authority and commands

Machine capability activation is exactly:

```text
approved subset of one selected pinned profile
+ explicit capabilities.skills
+ explicit capabilities.mcpServers
```

`drwn library defaults list/add/remove` remains the command surface for promoting
available Library items into explicit machine selections. These commands mutate
machine intent only. They do not copy to `~/.agents/skills` or write downstream
target files; `drwn write --scope machine` remains the explicit projection step.

`drwn skills curate` and `drwn skills uncurate` are removed from registration,
help, docs, and release artifacts. `~/.agents/skills`, packaged optional flags,
Parallel flags, repository target-only directories, and current downstream files
are never activation authority. The old commands fail as unknown syntax without
mutation.

Explicit selections may overlap profile IDs. Effective IDs are stable,
deduplicated, and profile-attributed first. Removing an explicit duplicate does
not remove the same capability supplied by the selected profile.

### 0.5 Policy and project isolation

Machine policy is merged into packaged runtime policy only from the approved
`policy` fields. Capability fields never alter packaged policy. Project
effective state does not read profile or explicit machine capabilities and
remains byte-independent from machine changes.

Machine skills and MCP servers can still be visible ambiently in downstream
project sessions. Task 83 reports target MCP collisions without turning machine
intent into project intent. A reproducible project that needs Operator includes
the Operator Card in its selected Blueprint.

### 0.6 Projection ownership

- The global write record is required before destructive cleanup or drift repair.
- A destination absent from the prior record is foreign. Machine write may not
  replace, remove, or claim it, even with `--force`.
- An identical unowned destination is still foreign and is not silently adopted.
- `--force` may repair drift only for a path or per-server field already recorded
  as drwn-owned.
- Removal deletes only unchanged prior-owned bytes/fields. Drifted or foreign
  paths are preserved and reported.
- Claude, Codex, and Cursor MCP ownership is per server at machine scope;
  unrelated user entries and unrelated config fields survive every write.
- Dry-run performs the same preflight and reports the same conflict without
  mutation.
- `doctor` remains report-only. Task 80 adds no `doctor --fix` path.

Stable machine errors:

```text
MACHINE_CONFIG_INVALID
MACHINE_PROFILE_INVALID
MACHINE_PROFILE_NOT_AVAILABLE
MACHINE_CAPABILITY_NOT_FOUND
MACHINE_PROJECTION_CONFLICT
```

---

## 1. Execution Rules

1. Use red-green-refactor for every behavior change; observe each target test fail for the intended reason before implementation.
2. Use isolated temporary homes, Stores, Card repositories, and target files in tests. Never read or mutate the developer's real machine state from automated tests.
3. Keep project and machine assertions in the same regression set whenever a shared evaluator or writer changes.
4. Commit each task independently with no references to assistant tooling.
5. Never commit credentials, resolved secret values, `.env` contents, OAuth state, or whole-Store archives.
6. Do not add machine migration, compatibility aliases, implicit curation, profile ranges, or runtime network fetches.
7. Do not implement Task 81 Library removal/GC or Task 82 portable transfer.
8. Preserve the remote Worker deploy V1 payload.
9. Keep the unrelated Task 78 completion document untracked and unstaged.

---

## Task 0: Publish the Operator Profile Artifact

**Files outside this repository:**

- Modify: `/Users/pureicis/.agents/drwn/sources/@darwinian/operator/card.json`
- Modify: `/Users/pureicis/.agents/drwn/sources/@darwinian/operator/package.json`
- Modify affected command references under `/Users/pureicis/.agents/drwn/sources/@darwinian/operator/skills/*/SKILL.md`
- Publish: `https://github.com/curation-labs/darwinian-operator`

**Step 1: Add a red command-contract audit**

Scan the source for removed forms including `drwn mind`, project mutation under
`drwn card`, `install --no-apply`, and `skills curate/uncurate`. Record every
match before editing.

**Step 2: Repair the source contract**

Use singular Worker commands (`status`, `use`, `use --none`), top-level project
mutation commands (`add`, `apply`, `remove`, `pin`, `update`), `install
--no-write`, and machine-default commands. Preserve each skill's safety and
approval gates while removing stack and compatibility claims.

**Step 3: Publish and verify**

Set both versions to `1.0.2`, run source doctor, publish locally, create the
public GitHub repository if absent, configure the Card remote, and push `main`
plus all tags. Verify exact Git-origin resolution in an isolated Store.

Record source URL, version, commit, tree SHA, and integrity in the Task 80
completion evidence before writing the packaged descriptor.

---

## Task 1: Define Strict Machine Schema V1

**Files:**

- Modify: `cli/core/types.ts`
- Create: `cli/core/machine-config.ts`
- Modify: `cli/core/store-paths.ts`
- Modify: `cli/core/card-store.ts`
- Modify: `cli/core/user-config.ts`
- Create: `test/core-machine-config.test.ts`
- Modify: `test/core-user-config.test.ts`
- Modify: `test/core-migration.test.ts`

**Step 1: Write red schema tests**

Cover exact empty initialization, strict valid policy, unknown fields at every
level, prototype shapes, duplicate capability IDs, malformed profile pins,
unsupported versions, absent files, and byte-identical repeated initialization.

**Step 2: Confirm red**

```bash
bun test test/core-machine-config.test.ts test/core-user-config.test.ts test/core-migration.test.ts
```

Expected: fail because machine V1 does not exist and Store initialization writes
the prototype shape.

**Step 3: Implement minimal strict load/save/init**

Use structured validation and `writeAtomically`. Reads never create files.
Mutation initialization writes explicit empty V1. Remove active path fallback to
`~/.agents/drwn/config.json` and replace prototype merge with policy-only merge.

**Step 4: Verify and commit**

```bash
bun test test/core-machine-config.test.ts test/core-user-config.test.ts test/core-migration.test.ts test/core-auth-config.test.ts test/commands-card-author.test.ts
bun run typecheck
git add cli/core/types.ts cli/core/machine-config.ts cli/core/store-paths.ts cli/core/card-store.ts cli/core/user-config.ts test/core-machine-config.test.ts test/core-user-config.test.ts test/core-migration.test.ts test/core-auth-config.test.ts test/commands-card-author.test.ts
git commit -m "feat(machine): define the first machine config contract"
```

---

## Task 2: Install and Pin the Recommended Profile

**Files:**

- Create: `registry/machine-profiles.json`
- Create: `cli/core/machine-profiles.ts`
- Modify: `cli/core/paths.ts`
- Modify: `cli/commands/init.ts`
- Create: `test/core-machine-profiles.test.ts`
- Modify: `test/commands-init.test.ts`
- Modify: `test/core-interactivity.test.ts`

**Step 1: Write red profile tests**

Cover descriptor validation, exact Git resolution, pin verification, allowlist
subset enforcement, source mutation detection, no runtime fetch after pinning,
guided default acceptance, guided opt-out, non-interactive empty setup, and no
re-prompt for existing intent. Use a local fixture Git remote in automated tests.

**Step 2: Confirm red**

```bash
bun test test/core-machine-profiles.test.ts test/commands-init.test.ts test/core-interactivity.test.ts
```

**Step 3: Implement minimal profile resolution**

The command resolves the descriptor source once, verifies all immutable fields,
and writes the pin only after complete validation. Guided prompt code receives
injectable input/output helpers so unit/integration tests do not depend on the
developer terminal.

**Step 4: Verify and commit**

```bash
bun test test/core-machine-profiles.test.ts test/commands-init.test.ts test/core-interactivity.test.ts test/core-project-machine-isolation.test.ts
bun run typecheck
git add registry/machine-profiles.json cli/core/machine-profiles.ts cli/core/paths.ts cli/commands/init.ts test/core-machine-profiles.test.ts test/commands-init.test.ts test/core-interactivity.test.ts test/core-project-machine-isolation.test.ts
git commit -m "feat(machine): add the recommended operator profile"
```

---

## Task 3: Make Profile and Explicit Selections the Only Authority

**Files:**

- Modify: `cli/core/defaults.ts`
- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/mcp.ts`
- Modify: `cli/core/card-skill-resolver.ts`
- Modify: `cli/commands/library/defaults/list.ts`
- Modify: `cli/commands/library/defaults/add-skill.ts`
- Modify: `cli/commands/library/defaults/remove-skill.ts`
- Modify: `cli/commands/library/defaults/add-mcp.ts`
- Modify: `cli/commands/library/defaults/remove-mcp.ts`
- Modify: `cli/index.ts`
- Delete: `cli/commands/skills/curate.ts`
- Delete: `cli/commands/skills/uncurate.ts`
- Modify: `test/core-defaults.test.ts`
- Modify: `test/core-effective-state.test.ts`
- Modify: `test/commands-library-defaults.test.ts`
- Modify: `test/commands-skills-mutate.test.ts`
- Modify: `test/core-project-machine-isolation.test.ts`
- Modify: `test/cli-help-shape.test.ts`

**Step 1: Write red authority tests**

Assert profile contribution and provenance, explicit selection union/deduplication,
profile/explicit overlap, empty intent, missing profile bytes, invalid explicit
IDs, no optional/Parallel/curated-directory fallback, and unchanged project
effective bytes. Assert removed curation commands are unknown and non-mutating.

**Step 2: Confirm red**

```bash
bun test test/core-defaults.test.ts test/core-effective-state.test.ts test/commands-library-defaults.test.ts test/commands-skills-mutate.test.ts test/core-project-machine-isolation.test.ts test/cli-help-shape.test.ts
```

**Step 3: Implement explicit evaluation**

Resolve profile skills from its immutable extracted Card tree. Resolve explicit
skills from standalone Library inventory. Merge only allowlisted profile MCP
definitions plus explicit Registry/Library IDs. Default mutation commands update
`capabilities` atomically and perform no projection or curation side effect.

**Step 4: Verify and commit**

```bash
bun test test/core-defaults.test.ts test/core-effective-state.test.ts test/commands-library-defaults.test.ts test/commands-skills-mutate.test.ts test/core-project-machine-isolation.test.ts test/cli-help-shape.test.ts test/sync-mcp.test.ts
bun run typecheck
git add cli/core/defaults.ts cli/core/effective-state.ts cli/core/mcp.ts cli/core/card-skill-resolver.ts cli/commands/library/defaults cli/commands/skills cli/index.ts test/core-defaults.test.ts test/core-effective-state.test.ts test/commands-library-defaults.test.ts test/commands-skills-mutate.test.ts test/core-project-machine-isolation.test.ts test/cli-help-shape.test.ts test/sync-mcp.test.ts
git commit -m "feat(machine): make capability selections explicit"
```

---

## Task 4: Harden Machine Projection Ownership

**Files:**

- Modify: `cli/core/skills.ts`
- Modify: `cli/core/mcp.ts`
- Modify: `cli/core/sync.ts`
- Modify: `cli/core/write-record.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify: `test/core-skills.test.ts`
- Modify: `test/core-write-record.test.ts`
- Modify: `test/scenarios-root-scope.test.ts`
- Modify: `test/commands-write-drift.test.ts`
- Modify: `test/commands-doctor.test.ts`

**Step 1: Write red ownership tests**

Cover first-write foreign skill directories, identical unowned directories,
foreign same-ID MCP entries for all targets, preserved unrelated MCP siblings,
record-owned drift with and without force, removed unchanged ownership, removed
drifted ownership, dry-run parity, target-specific writes, and zero mutation when
any selected target conflicts.

**Step 2: Confirm red**

```bash
bun test test/core-skills.test.ts test/core-write-record.test.ts test/scenarios-root-scope.test.ts test/commands-write-drift.test.ts test/commands-doctor.test.ts
```

**Step 3: Implement full preflight and per-server ownership**

Plan every selected machine skill/MCP destination before mutation. Reject
unrecorded collisions with `MACHINE_PROJECTION_CONFLICT`. Extend Cursor machine
MCP handling to preserve unrelated servers and record per-server hashes. Keep
project behavior and Task 83 policy unchanged.

**Step 4: Verify and commit**

```bash
bun test test/core-skills.test.ts test/core-write-record.test.ts test/scenarios-root-scope.test.ts test/commands-write-drift.test.ts test/commands-doctor.test.ts test/commands-write.test.ts test/commands-write-codex-conflict.test.ts test/commands-write-claude-conflict.test.ts test/commands-write-cursor-conflict.test.ts
bun run typecheck
git add cli/core/skills.ts cli/core/mcp.ts cli/core/sync.ts cli/core/write-record.ts cli/core/diagnostics.ts test/core-skills.test.ts test/core-write-record.test.ts test/scenarios-root-scope.test.ts test/commands-write-drift.test.ts test/commands-doctor.test.ts test/commands-write.test.ts test/commands-write-codex-conflict.test.ts test/commands-write-claude-conflict.test.ts test/commands-write-cursor-conflict.test.ts
git commit -m "fix(machine): protect foreign projection paths"
```

---

## Task 5: Align Diagnostics and Machine Capture

**Files:**

- Modify: `cli/commands/status.ts`
- Modify: `cli/commands/doctor.ts`
- Modify: `cli/commands/card/new.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify: `cli/core/card-capture.ts`
- Modify: `test/commands-status.test.ts`
- Modify: `test/commands-doctor.test.ts`
- Modify: `test/commands-card-new-from-defaults.test.ts`

**Step 1: Write red diagnostic/capture tests**

Status reports schema, profile pin/provenance, profile and explicit capability
sources, projection health, and no secret-bearing values. Doctor rejects invalid
machine state, missing/mutated profile bytes, unresolved explicit IDs, and
foreign projection conflicts without repair. `card new --from-defaults` captures
the effective machine-safe capabilities only, with secret references preserved,
and never captures profile identity or non-capability Card content.

**Step 2: Implement, verify, and commit**

```bash
bun test test/commands-status.test.ts test/commands-doctor.test.ts test/commands-card-new-from-defaults.test.ts test/core-card-capture.test.ts
bun run typecheck
git add cli/commands/status.ts cli/commands/doctor.ts cli/commands/card/new.ts cli/core/diagnostics.ts cli/core/card-capture.ts test/commands-status.test.ts test/commands-doctor.test.ts test/commands-card-new-from-defaults.test.ts test/core-card-capture.test.ts
git commit -m "feat(diagnostics): report machine capability provenance"
```

---

## Task 6: Publish the Contract and Release Gate

**Files:**

- Modify: `README.md`
- Modify: `docs/cli-quickref.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `.ai/knowledges/03_npm-skill-bundles-guide.md`
- Modify: `scripts/verify-release-readiness.ts`
- Create: `test/scripts-verify-machine-contract.test.ts`

Document schema V1, empty versus guided initialization, exact profile pin,
profile filtering, explicit selection commands, removed curation commands,
machine/project separation, ambient visibility, ownership rules, reset procedure,
and operator-owned auth/runtime prerequisites. Do not publish a machine migration
guide or compatibility table.

The release gate rejects prototype machine readers, activation from optional or
curated state, curation command registration, profile ranges, profile runtime
fetches, missing ownership tests, stale Operator command forms, and whole-Store
export re-enablement.

```bash
bun test test/scripts-verify-machine-contract.test.ts test/docs-readiness.test.ts
bun run docs:build
bun run typecheck
git add README.md docs/cli-quickref.md .ai/knowledges/01_agents-cli-usage-guide.md .ai/knowledges/02_per-project-config-guide.md .ai/knowledges/03_npm-skill-bundles-guide.md scripts/verify-release-readiness.ts test/scripts-verify-machine-contract.test.ts test/docs-readiness.test.ts
git commit -m "docs(machine): publish the machine capability contract"
```

---

## Task 7: Controlled Machine Reset and Completion

Before reset, record a non-secret inventory of the current prototype machine
intent. Back up the prototype machine file and global projection record outside
the Store for rollback; never include credentials. Replace machine state with V1:

- select the pinned Recommended Darwinian Operator profile;
- retain current non-Operator explicit skill IDs as explicit selections when
  their sources resolve;
- retain current explicit MCP IDs, including `notion`, as explicit selections;
- preserve authoring scope under `policy.authoring`;
- do not infer from `~/.agents/skills` or target output.

Run machine write dry-run first. Resolve foreign ownership findings explicitly;
do not use force to claim them. Then run machine write, status, doctor, a second
idempotent dry-run, and project isolation checks in `darwinian-cards`.

Final gates:

```bash
bun run typecheck
bun test
bun run docs:build
bun run verify:release --json
git diff --check
```

Create `.ai/tasks/80_completion_machine-capability-schema-v1.md` with commits,
profile remote/pin, controlled reset evidence, test counts, skips, and remaining
Task 81/82 boundaries. Commit plan completion separately.

---

## Completion Gates

- [ ] Operator Card `1.0.2` is current, public, immutable, and independently resolvable.
- [ ] Machine config accepts only strict `drwn.machine` V1 and never migrates prototype state.
- [ ] Non-interactive/minimal initialization is explicitly empty.
- [ ] Guided initialization preselects the pinned Operator profile and supports opt-out.
- [ ] Profile filtering projects only 17 approved skills and zero MCP servers.
- [ ] Explicit machine skill/MCP selections are separate from profile capabilities.
- [ ] Optional flags, Parallel flags, curated directories, and projection state are not activation authority.
- [ ] `skills curate/uncurate` are absent from registration, help, docs, and release artifacts.
- [ ] Machine projection cannot overwrite, claim, or delete foreign paths; force repairs prior ownership only.
- [ ] Project effective state and output remain independent from machine intent.
- [ ] Status, doctor, and capture expose the supported machine model without secrets.
- [ ] Whole-Store export remains fail-closed and remote deploy V1 remains unchanged.
- [ ] Controlled machine reset, write, status, doctor, and idempotency pass.
- [ ] Full typecheck, test, docs, and release verification pass.

Task 81 Library lifecycle and Task 82 portable transfer remain proposed and are
not authorized by completing this plan.
