# ABOUTME: Two fully elaborated, parallel design proposals for the mind capability card over BeginningDB — Design A (DB-native) and Design B (card-seeded hybrid) — for team discussion and selection.
# ABOUTME: Records the decisions ratified after analysis 105, the shared foundation both designs build on, per-design lifecycle/command/auth elaboration, and a comparison + discussion agenda.

# Analysis 106 — Mind Card: Dual Design Proposals (DB-native vs Card-seeded Hybrid)

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Draft — for team design discussion
**References**: [.ai/analyses/105_mind-card-beginningdb-target-architecture-investigation.md, .ai/analyses/112_persona-beliefs-memory-capability-card-investigation.md, .ai/analyses/103_persona-beliefs-memory-capability-card-design-capture.md]

---

## 1. Ratified decisions (Remy, 2026-07-07)

Answers to analysis 105 §9, now fixed for both designs:

| # | Decision |
|---|---|
| D-1 | **Mind id = worker id.** One mind per deployed worker; the **deployment server returns the id**. Auth is tied to **user + worker id**. |
| D-2 | **Both source-of-truth designs are elaborated in parallel** (this doc) for a team decision — hybrid (B) is favored but not ratified. |
| D-3 | **Mind functionality ships as a drwn subcommand** for now (shape open: `worker mind <verb>` vs flags — §6). There is hesitance about a mind-shaped exception inside drwn; **publishing a client package from beginning-db stays on the table** and the command layer must stay thin enough to relocate. |
| D-4 | **Composed mind is DB-only.** No local composed bundle or offline cache. Other product services (web IDE etc.) give users read/edit access to the DB files. |
| D-5 | **Memory history design is deferred** — open research/architecture question; neither design may hard-code an answer. |
| D-6 | **On sync conflict, DB edits win**: preserve DB state, report drift (Design B concern). |
| D-7 | **Deploy-contract shape: whatever fits** the chosen design. |
| D-8 | **Testing tiers as proposed** in 105 §8: fake-server = integration tier, real BeginningDB = e2e tier. |
| D-9 | **Milestone 0 (thin skills card) approved.** Skills are integral card content and are **never uploaded to BeginningDB** — only mind content (persona/beliefs/memory files) lives in the DB. |

## 2. Grounding facts from the current deploy path

Verified at HEAD, because D-1 makes worker identity load-bearing:

- `worker deploy` POSTs to `/api/deployments` and receives a **`deploymentId`** (`cli/commands/worker/deploy.ts:122-139`); status is polled per deployment. The stable cross-deployment handle today is the user-chosen **worker name** (`--name`); the server's own routes already use a mind vocabulary (`/api/minds/<name>/chat`, deploy.ts:161).
- **Consequence for D-1**: a mind must outlive deployments (memory persists across redeploys and rollbacks), so the id the server returns must be a **stable worker id**, not `deploymentId`. Today that stable handle is the name; the deploy API response needs to return the worker id explicitly (new or existing) so drwn and agents can address the mind.
- **Auth**: drwn's deploy calls use DAH bearer tokens with refresh (`cli/core/worker-http.ts:1-46`). BeginningDB's gateway stack speaks the same identity world (DAH device flow in `bgng ide auth login`, OIDC issuer config, workspace-scoped child-tokens). "Auth tied to user + worker id" is realizable as: DAH user identity → deployment server authorizes the worker → mind binding (workspace + token, or the means to mint child-tokens) scoped to that worker's subtree.
- **Local/undeployed gap**: with server-minted ids (D-1) and DB-only content (D-4), **a mind exists only for deployed workers**. Local projects have no mind until deployed. Both designs inherit this; if pre-deploy minds matter later, the deploy API needs a "provision id without deploying" affordance (out of scope now; flagged in §8).

## 3. Shared foundation (both designs)

- **DB layout**: one subtree per mind at `<workspace>/minds/<workerId>/` (workspace per user or per org — provisioning detail owned by the server side of the binding):

  ```
  minds/<workerId>/
    persona.md                 ← the worker's operative persona (composed or authored, per design)
    beliefs/<...>/             ← belief entries
    memory/l4/  l5/  l6/       ← layered memory; format md|jsonl|mixed per layer
    mind.json                  ← index: structure, provenance, (B: seed ledger with card versions + ETags)
  ```

- **Mind binding**: the deployment response is extended with the stable `workerId` plus the mind connection info (`baseUrl`/gateway URL, workspace/path prefix). Tokens are not stored in the card or lock; drwn resolves them via the DAH-authenticated flow (env overrides `BGDB_*` respected for headless/tests).
- **Agent surface** (identical in A and B, and = **Milestone 0**): the mind card ships skills wrapping `bgng`/`bgdb` specialized to mind paths — read persona/beliefs at session start, append memory (`PATCH` append for jsonl layers), search/query mind content, CAS-safe edit for md files. Skills follow the `@remyjkim/bgng` card pattern (CLI subprocess, `--json`); they are ordinary card content distributed by the standard pipeline (D-9).
- **drwn plumbing** talks to BeginningDB through one module (`cli/core/mind-store/`, name TBD) wrapping the beginning-db client (vendored files or the future published client package — D-3 keeps both open; the module boundary makes the swap cheap).
- **Concurrency**: ETag CAS everywhere; jsonl layers are append-only by convention (concurrent-writer safe); md files are read-modify-CAS with retry-on-412.
- **Memory history**: not designed here (D-5). Both designs keep memory writes behind the skills/mind-store seam so a history mechanism (append-only + snapshots, change-feed capture, …) can be added without restructuring.

The designs differ in exactly one axis with cascading consequences: **where persona/beliefs content is born and maintained.**

## 4. Design A — DB-native mind

**Thesis**: the DB is the single source of truth for *all* mind content. The card contributes **structure and tools**, never content.

### Card manifest

```jsonc
{
  "name": "@team/mind",
  "version": "1.0.0",
  "skills": { "include": ["mind-read", "mind-remember", "mind-search", "mind-edit"] },
  "mind": {                                    // structure declaration only — no include lists
    "persona": true,
    "beliefs": true,
    "memory": { "l4": { "format": "jsonl" }, "l5": { "format": "jsonl" }, "l6": { "format": "md" } }
  }
}
```

No `include` entries, no content dirs, no publish-time content validation (there is no content to validate). The 103 schema survives only as the **structure vocabulary** (sections, layers, formats).

### Lifecycle

1. **Deploy**: server returns `workerId` + mind binding. drwn (mind-store) atomically scaffolds `minds/<workerId>/` (`If-None-Match: *`): empty `persona.md` (or template), empty section dirs, `mind.json` recording the declared structure.
2. **Author/edit**: users write persona/beliefs **directly in the DB** — via product services (web IDE, per D-4), via `drwn worker mind edit/put`, or via agents using the mind-edit skill. There is no card release cycle for content changes; edits are live.
3. **Card update**: a new card version can change *structure* (add a layer, change a format) → drwn applies additive scaffolding; destructive structure changes (removing a layer with content) require an explicit flag.
4. **Redeploy/rollback**: no content effect whatsoever — content was never coupled to card versions.
5. **Teardown**: `worker delete` keeps the mind subtree by default; `--purge-mind` removes it.

### Composition and reuse

With no card content, stack-order composition disappears: a worker's mind is whatever its DB subtree holds. Reuse across workers has two DB-native mechanisms instead:
- **Scaffold-time copy**: structure templates can reference a source subtree to copy from (e.g., a team's `minds/_templates/reviewer/`).
- **Placements** (BeginningDB hardlinks): shared belief/persona entries can be *placed* into multiple minds — one inode, many paths — giving live shared content across workers (edit once, visible everywhere). Powerful, but shared-mutable-state semantics need team appetite.

### Command surface (A)

`provision` (rarely manual — deploy does it), `status`, `edit/put/cat/list` conveniences, `scaffold --apply` for structure updates. No `sync`, no drift, no push gate (nothing sensitive ever enters the card, so 103's visibility model retires entirely; DB access control = ReBAC/child-tokens).

### Properties

- **Pros**: one source of truth — no sync engine, no drift states, no conflict policy; live editing through product services is the *primary* workflow, not a special case; card releases are rare (structure/skills only); simplest drwn core (scaffold + conveniences); placements enable cross-worker sharing beyond what card composition ever did.
- **Cons / costs**: persona/beliefs lose git review, semver, diffable history, and reproducible worker definitions — a worker's behavior-defining content is mutable production state with **no history** (D-5 unresolved makes this sharper in A, since *everything* is history-less, not just memory); "what persona is this worker running?" has no version answer; publish validation and the recovered 103 authoring/doctor machinery are mostly discarded; bootstrapping a new worker's persona means copying, not declaring.

## 5. Design B — Card-seeded, DB-runtime hybrid

**Thesis**: cards are the versioned **definition** of a mind (persona/beliefs seeds); the DB is its **runtime state** (all tiers live there; memory is DB-only from birth). Restores the 103 schema verbatim per the 112 §5 module-boundary plan, retargeting materialization from local dirs to DB paths.

### Card manifest

Exactly the 103 schema: `persona.include` + visibility, `beliefs.include` + visibility, `memory.{l4,l5,l6}.{include?,format,visibility}`, content authored in `persona/<entry>/PERSONA.md`, `beliefs/<entry>/`, `memory/<layer>/<entry>/` source dirs; publish validation, source doctor, and the six authoring commands recovered from `1c92ae4`.

### Lifecycle

1. **Deploy**: server returns `workerId` + binding (as in A). drwn composes the worker's mind-content cards **in stack order** (the blueprint's `composedFrom` order / `activeWorkers`) — 103's composition semantics: persona concatenated with provenance fences, beliefs/memory entries namespaced by card — and uploads the result to `minds/<workerId>/`. `mind.json` records the **seed ledger**: per-file source card, card version, uploaded ETag.
2. **Runtime**: identical to A — agents read/append via skills; users edit via product services. Memory paths are DB-only from the start (cards may ship layer *templates*, never live memory).
3. **Card update** (worker gets a new card version): `mind sync` re-uploads persona/beliefs with `If-Match` on ledger ETags. Clean CAS → seed updated. **412 → DB edit wins; file skipped; drift reported** (D-6). `--force` exists for card-wins, explicit and loud.
4. **Redeploy/rollback**: content persists; rollback re-syncs seeds to the older card version through the same CAS/drift rules (a hand-edited persona survives a rollback and reports drift — correct under D-6).
5. **Teardown**: as in A.

### Drift model

Three states per seeded file, computed from ledger vs DB ETags: `in-sync`, `db-edited` (drift — reported by `mind status`/doctor, preserved by sync), `card-updated` (pending sync). Drift is **information, not error**: D-4 makes DB-side editing a first-class workflow, so B treats the card as "the reviewed baseline" and the DB as "the live state", with visibility into their divergence. A team that wants card-canonical discipline runs sync-with-force in CI; a team that wants live-first treats drift reports as "consider upstreaming this edit into the card."

### Command surface (B)

A's surface **plus** `sync [--dry-run|--force]` and drift reporting in `status`/doctor. Push gate: 103's visibility model applies to the seeds in the card (private persona content blocked from public remotes); memory never enters cards, so the most sensitive tier is out of gate scope by construction.

### Properties

- **Pros**: persona/beliefs keep git review, semver, diffs, and reproducibility — a worker's definition is a pinned, auditable artifact, and "redeploy this worker identically" has a true answer; reuses the recovered, tested 103 machinery (analysis 112 §4) with only the materialization target changed; memory gets the same DB-native treatment as A; live DB editing still fully supported (D-6 makes it safe by default).
- **Cons / costs**: two stores with a sync boundary — the ledger, drift states, and conflict policy are real machinery to build and explain; "where do I edit persona?" has two answers (card for reviewed changes, DB for live ones) and teams must adopt the discipline; card releases remain part of the content workflow.

## 6. Command-surface options (applies to both designs)

Precedent: `worker stack {list,use,clear}` is already a sub-subcommand group (`cli/commands/worker/stack/`).

| Option | Shape | Assessment |
|---|---|---|
| **B1: `drwn worker mind <verb>`** | Sub-subcommand group like `worker stack` | Follows existing precedent; correct semantics under D-1 (a mind *is* worker state — `worker mind status <name>` parallels `worker status <name>`); keeps the mind vocabulary in one namespace that could later be extracted. **Recommended.** |
| B2: flags on existing verbs (`worker deploy --mind`, `worker status --mind`) | No new namespace | Works only for lifecycle-attached actions; `sync`/`edit`/`provision` have no natural host verb; flag-shaped features grow poorly. |
| B3: top-level `drwn mind <verb>` | New top-level namespace | Cleanest to extract later, but revives the retired pre-rename `mind` namespace (collision with historical docs/commands) and detaches the vocabulary from the worker identity that D-1 establishes. |

On the D-3 hesitance ("exception for mind inside drwn"): the structural mitigation is the **mind-store module boundary** — command files stay thin wrappers, all BeginningDB logic lives behind one module whose client half can be replaced by the published beginning-db client package when it exists. If the exception still rankles after M0/M1, B1's namespace can migrate to a standalone tool with the module intact.

## 7. Comparison

| Dimension | A: DB-native | B: Hybrid |
|---|---|---|
| Sources of truth | 1 (DB) | 2 (card = definition, DB = state) with explicit ledger |
| Persona/beliefs review & versioning | None (live state; no history until D-5 resolved) | Git + semver + publish validation |
| Reproducible worker definition | No | Yes (pinned card versions) |
| Live editing via product services | Primary workflow | First-class; drift-visible |
| Sync/drift machinery | None | Ledger + CAS + drift states |
| Reuse across workers | Copy or placements (shared-mutable) | Card composition in stack order |
| 103/112 recovered machinery used | Structure vocabulary only | Nearly all of it |
| Visibility / push gate | Retired (ReBAC only) | Restored for card seeds |
| drwn core complexity | Low | Medium |
| Conceptual complexity for users | Low ("it's files in the DB") | Medium ("baseline vs live state") |
| D-5 (no history) exposure | Entire mind history-less | Persona/beliefs baselines versioned; memory history-less |
| Milestone 0 (skills card) | Identical | Identical |

**Discussion agenda for the team**: (1) Do reproducible, reviewable worker definitions matter enough to pay for the sync boundary? (2) Is live-DB-first editing the intended primary authoring UX (favors A) or an escape hatch (favors B)? (3) Appetite for placements-based shared-mutable content (A's reuse story)? (4) How soon does D-5 (memory history) get its own design — and does its answer (e.g., snapshot conventions) change A's history-less-persona exposure? (5) Command surface B1 vs B3 given the extraction ambition.

## 8. Testing implications

Per D-8, both designs use: unit tier for path/plan/ledger logic; integration tier against a fake BeginningDB (`Bun.serve` with real ETag/412/append semantics, driven via `BGDB_*` env — precedent: `test/cli-auth-e2e.test.ts` fake auth server); e2e tier against a real BeginningDB (`docker-compose.dev.yml`), gated by env, covering the full journey. Deploy-side, the fake Deploy API server must now also return `workerId` + mind binding.

- **A-specific**: scaffold atomicity (412 on re-provision), additive vs destructive structure updates, placements behavior (if adopted).
- **B-specific**: everything from 112 §7 (restored authoring/validation/composition suite) plus seed/sync/drift matrices — clean sync, `db-edited` preservation + drift report, `--force`, rollback re-seed, ledger idempotency (double sync → zero changes).
- **Shared**: skills-card M0 tests (command journeys invoking the skills' documented CLI sequences against the fake server); offline behavior (DB unreachable → exact actionable error, non-DB commands unaffected).

## 9. Milestone 0 (shared, approved)

Ship `@<scope>/mind-tools` (name TBD): skills wrapping `bgng`/`bgdb` for mind-path conventions + a conventions document, distributed via the standard card pipeline. No drwn core changes. This validates the agent surface and the path/auth conventions while the A/B decision is discussed. Skills remain card-native forever (D-9).

## 10. Next step

Team discussion on §7's agenda → ratify A or B → draft the implementation task plan (`.ai/tasks/`, next number): M0 skills card → then per the chosen design (A: mind-store + scaffold + conveniences; B: 112's restored-machinery phases + mind-store + seed/sync/drift), with the deploy-contract extension (workerId + binding) early in either path.
