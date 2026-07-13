# ABOUTME: Handoff-ready target architecture for the mind capability card — the consolidated, authoritative statement of the design ratified across analyses 103–109 (schema, storage, identity/auth, lifecycle flows, command surface, modules, phasing, testing, risks).
# ABOUTME: Supersedes reading the 103–109 chain for implementation purposes; the decision record in §12 maps every normative statement back to its ratification.

# Analysis 110 — Mind Card: Target Architecture

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Implemented historical baseline; Worker Mind memory terminology, schema, and paths are superseded by Analysis 117
**Supersedes for implementation**: the design threads of 103, 112, 105, 106, 108, 109 (those remain the investigation record; this doc is the buildable statement)
**Superseded in part by**: `.ai/analyses/117_worker-mind-semantic-memory-target-architecture.md` for observations, insights, the reserved `raw_data` name, semantic paths, strict `mind.json`, and clean-reset policy. This document remains authoritative for the underlying Card-seeded hybrid, BeginningDB placement pool, lifecycle, identity, auth, and deletion decisions unless Analysis 117 says otherwise.
**External requests in flight**: 107 (studio-deployment), beginning-db asks (109 §7, to be sent)

---

## 1. What the mind card is

Workers deployed by the `drwn` CLI gain a **mind**: persona (voice/operating style), beliefs (durable principles), and layered memory. The mind's **definition** (persona/beliefs) is authored in a versioned capability card and reviewed in git; its **live state** (all content, plus all memory) lives in **BeginningDB**, one subtree per worker, edited DB-first through product services and appended to by the worker's own agents at runtime. The card seeds the DB at deploy; explicit *rebase* (card→DB) and *checkpoint* (DB→card) verbs connect the two afterward. Memory is constructed from a **shared pool** via BeginningDB placements, enabling multi-view organization and cross-worker sharing without copies.

One sentence: **cards are the reviewed checkpoint lineage; BeginningDB is the living mind; the deploy API binds them per worker.**

### Glossary and one warning

- **Mind id** = the deploy API's stable `mind_id` (`mind_<uuid>`), one per worker (user × slug), surviving redeploys/rollbacks.
- **Owner filesystem** = the BeginningDB filesystem hosting one user's minds + pool.
- **Pool** = the shared canonical home of memory entries; mind memory trees are placement views of it.
- **Seed / rebase / checkpoint / drift** = the card↔DB verbs (§6).
- ⚠️ **`bgng` naming**: in analyses ≤ 39 of this repo, "bgng" is the pre-rename name of *this* CLI. Everywhere current, `bgng`/`bgdb` are the **beginning-db workspace CLI binaries**.

## 2. System context

```
┌──────────────┐  authors/publishes   ┌─────────────────────┐
│  mind card    │◄────────────────────│ drwn CLI             │
│ (card pipeline│   seeds/rebases/    │  worker mind <verb>  │
│  distribution)│   checkpoints via   │  mind-content module │
└──────┬───────┘   mind-store         │  mind-store module   │
       │ composedFrom / stack          └──────┬──────────────┘
       ▼                                      │ @beginningdb/client (HTTP)
┌──────────────┐  POST /api/deployments ┌─────▼──────────────┐
│ studio-       │  → {deploymentId,     │ BeginningDB         │
│ deployment    │     mindId, binding}  │  owner filesystem:  │
│ (deploy API,  │  runner injects BGDB_*│   minds/<mindId>/…  │
│  runner)      │  env into container   │   pool/…            │
└──────┬───────┘                        └─────▲──────────────┘
       │ container runtime                    │ bgng/bgdb CLI (skills)
       ▼                                      │
┌──────────────┐   read persona/beliefs, append memory
│ worker agents │──────────────────────────────┘
│ (card skills) │        product services (web IDE etc.) edit DB-first
└──────────────┘
```

Components and their single responsibilities:

| Component | Owns |
|---|---|
| **mind card(s)** | Persona/beliefs source content + manifest declaration; agent skills; conventions doc. Distributed via the standard card pipeline; skills are card content and are **never** uploaded to the DB. |
| **drwn CLI** | Authoring/validation/publish (restored 103 machinery); provision/seed/rebase/checkpoint/status/doctor via the mind-store module. |
| **studio-deployment** | Stable mind id; owner-filesystem binding + child-token minting; `BGDB_*` env injection into worker containers (analysis 107, amended). |
| **BeginningDB** | The living mind: files, placements, ETag CAS, change feed; child-token auth; (Phase 2) ReBAC-on-VFS enforcement. |
| **bgng/bgdb CLI** | The agent-facing tool the card's skills wrap (subprocess, `--json`). |
| **product services** | DB-first human editing surface (out of drwn's scope; reads/writes the same subtree). |

## 3. Data architecture — card side

### 3.1 Manifest (103 schema, with fixed layer semantics)

```jsonc
{
  "name": "@team/reviewer-mind",
  "version": "1.2.0",
  "skills": { "include": ["mind-read", "mind-remember", "mind-share", "mind-forget", "mind-search"] },
  "persona": { "include": ["voice", "review-style"], "visibility": "internal" },
  "beliefs": { "include": ["code-quality"], "visibility": "internal" },
  "memory": {
    "l4": { "format": "md" },      // reflections/insights — V1
    "l5": { "format": "jsonl" },   // observations — V1
    "l6": { "format": "mixed" }    // raw data/files — RESERVED, V2 (validated, tooling warns)
  }
}
```

Rules (restored `validateMindContentSection` semantics): `include` = safe path parts; `visibility ∈ private|internal|public`, required when `include` non-empty; `exclude`/`shared` rejected on cards; `format ∈ md|jsonl|mixed` on memory layers only; layers restricted to `l4|l5|l6`. **Memory sections declare layers/formats only — no `include` entries in V1** (memory content is DB-native from birth; card-shipped memory templates are a V2 possibility). The current hard-reject of these three sections in `validateCardManifest` (`cli/core/card-manifest.ts:249-255`) is removed as part of restoration.

### 3.2 Source layout, authoring, publish

```
sources/@team/reviewer-mind/
  card.json
  persona/<entry>/PERSONA.md      ← drwn card source add-persona/remove-persona
  beliefs/<entry>/BELIEF.md       ← drwn card source add-belief/remove-belief
  skills/<skill>/SKILL.md         ← standard skills authoring
```

Restored from pre-descope SHA `1c92ae4`: the four persona/beliefs authoring commands (+ `--dry-run/--json/--keep-files/readonly` behaviors), source doctor issue codes, publish validation (`PERSONA.md`/`BELIEF.md` existence), and the **visibility push gate** (strictest-wins visibility from mind sections; `card push` blocks private→public remotes; `--remote-visibility`, `--unsafe-push-public`). `add-memory`/`remove-memory` commands are **not** restored in V1 (no card memory entries to author). Lock entries regain the mind sections + a `MINDS_MIN_DRWN_VERSION` floor (value = first shipping release).

## 4. Data architecture — DB side

### 4.1 Owner filesystem layout (ratified colocation, 109 §9.1a)

One BeginningDB filesystem per user hosts everything placements need to reach:

```
<owner filesystem>
├── minds/
│   └── <mindId>/
│       ├── persona.md                       ← seeded: stack-ordered concat, provenance fences
│       ├── beliefs/<card>/<entry>/BELIEF.md ← seeded copies, card-namespaced
│       ├── memory/
│       │   ├── l4/…                         ← placement views of pool L4 entries
│       │   ├── l5/by-date/…                 ← placement views of pool L5 entries
│       │   └── views/<name>/…               ← optional additional views (by-topic, …)
│       └── mind.json                        ← ledger + index (4.3)
└── pool/
    ├── l4/<yyyy-mm-dd>/<HHmm>-<ulid>.md     ← canonical reflection entries
    └── l5/<yyyy-mm-dd>/<HHmm>-<ulid>.jsonl  ← canonical observation files
```

- **Placements are same-filesystem only and tokens are filesystem-scoped** (verified constraints) — this colocation is forced, not chosen.
- **Seeds are copies** (never placements): per-mind persona/beliefs files, so edits affect one mind and the ledger stays attributable.
- **Memory is placement-constructed** (R-4): entries are born in `pool/`, every `memory/` path is a view. Entry identity = inode (ULID-named pool path is its canonical home).
- **L5 entry unit** (convention, fixable in M0): one jsonl file per capture context (typically a session), appended during that context (`PATCH` append — concurrent-safe), placed as a unit into views. **L4 entry unit**: one md file per reflection (front-matter: `ts`, `derivedFrom` entry ids, `topics`).

### 4.2 Placement lifecycle & deletion policy

- `remember`: create pool entry (atomic `If-None-Match: *`) → `place` into own `memory/` view(s). (Create+place is two calls; doctor detects the gap state. A server-side atomic create+place is a nice-to-have ask to beginning-db.)
- `share-memory`: `place` an entry into another mind's view (same filesystem — free).
- `forget`: `unplace` from own view only. Agents **never** get `delete_everywhere`.
- **Pool retirement** (`delete_everywhere`) is a human-invoked, confirmation-prompted drwn verb (`worker mind pool retire`) — irreversible in a history-less store, so not delegable to agents (109 §9.4).
- **GC/doctor states** (no server GC exists): unplaced entry (transient ok, flagged if stale), pool-orphaned entry (pool path deleted, views survive — offer re-place/adopt), dangling ledger refs.

### 4.3 `mind.json` — ledger and index

Composed-index shape (103 lineage) + the seed ledger that drives rebase/checkpoint/drift:

```jsonc
{
  "schemaVersion": 1,
  "mindId": "mind_…",
  "activeWorkers": ["@team/base-mind", "@team/reviewer-mind"],   // stack order at seed
  "persona": { "path": "persona.md", "entries": [{ "card", "entry" }] },
  "beliefs": { "entries": [{ "card", "entry", "path", "visibility" }] },
  "memory": { "l4": { "format": "md" }, "l5": { "format": "jsonl" } },
  "ledger": [ { "path", "card", "cardVersion", "entry", "etag" } ],   // seeded files only
  "sources": [{ "card", "version", "integrity" }],
  "drwnVersion": "…"
}
```

Drift states per seeded file (ledger vs live ETag vs pinned card version): `in-sync` / `db-edited` (live edits — informational, DB wins) / `card-updated` (rebase available).

## 5. Identity, auth, isolation

- **Mind id = worker id**, minted by the deploy API (already exists: `minds.id`, returned by `POST /api/deployments`; drwn starts consuming it).
- **Token** = BeginningDB **child-token scoped to the owner filesystem**, minted via the deploy API (107 R2: `POST /api/minds/:slug/bgdb-token` for the CLI; injected into containers via the secrets pipeline). DAH is the shared identity root (deploy API auth and BeginningDB OIDC).
- **Env contract** (container + CLI + tests all speak it): `BGDB_BASE_URL`, `BGDB_TENANT_ID` (direct mode), `BGDB_TOKEN`, `BGDB_PATH_PREFIX=minds/<mindId>`. The prefix is **ergonomic addressing, not a security boundary** — skills use raw/absolute paths for `pool/…`.
- **V1 isolation posture (ratified, 109 §9.1b)**: per-mind separation inside the owner filesystem is skill/CLI convention; a worker's token technically reaches sibling minds and the pool. Accepted because all colocated workers belong to one user.
- **Phase 2 enforcement**: BeginningDB's ReBAC-on-VFS cutover (their Task 26) with `folder`-level grants (`folder:minds/<id>#edit`, pool view/append) is the target; ceiling-prefix-sets or a gateway proxy are contingencies. **Org-level pools are gated on Phase 2** — colocating different users' workers under soft isolation is not acceptable.

## 6. Lifecycle flows

1. **Author**: create/edit persona/beliefs entries in card source (four commands); source doctor validates structure.
2. **Publish**: standard pipeline (whole-tree snapshot, integrity, semver-vs-diff classification) + restored mind-content validation + push gate on visibility.
3. **Deploy & provision**: `worker deploy` → server returns `mindId` (+ binding per 107 R4, else fetched via R2). drwn scaffolds `minds/<mindId>/` (atomic create), seeds composed content:
   - persona: stack-ordered concatenation (`activeWorkers` / blueprint `composedFrom` order) with `<!-- drwn:persona:start/end -->` provenance fences per (card, entry);
   - beliefs: per-entry copies, card-namespaced paths;
   - memory: empty layer dirs + view roots;
   - writes `mind.json` with the ledger.
4. **Runtime**: agents use the card's skills → `bgng`/`bgdb` subprocess with the injected env. Read persona/beliefs; `remember`/`share-memory`/`forget`/`search` per §4.2. jsonl appends are CAS-free; md edits are read-modify-CAS with 412 retry.
5. **DB-first editing** (primary authoring surface, R-3): humans edit persona/beliefs/memory via product services. No drwn involvement; drift becomes visible on next `status`.
6. **Rebase** (card version bump): `worker mind sync` re-uploads seeded files with `If-Match` on ledger ETags. Clean CAS → updated + ledger refreshed; **412 → DB edit preserved, file skipped, drift reported** (D-6); `--force` = card-wins, explicit and loud. Memory paths are never touched by rebase.
7. **Checkpoint** (DB→card, the R-3 counterpart): `worker mind diff` shows per-entry DB-vs-seed diffs (fence-aware un-composition of `persona.md`; per-entry files map directly). `worker mind checkpoint` writes changes back into the card source dirs → normal git review → publish = new baseline. Edits **outside** any fence fail with guidance in V1.
8. **Redeploy/rollback**: mind id and subtree persist untouched; rollback re-runs rebase against the older pinned version (same CAS/drift rules — hand edits survive and report drift).
9. **Teardown**: `worker delete` keeps the subtree (deploy API default per 107 R5); purge is explicit. Pool entries follow §4.2 retirement policy.

## 7. Command surface

`drwn worker mind <verb>` (sub-subcommand group, `worker stack` precedent):

| Verb | Does | Notes |
|---|---|---|
| `provision` | Scaffold + seed a mind (normally invoked by deploy path) | idempotent (atomic-create aware) |
| `status` | Binding, drift table (per seeded file), memory/pool stats | `--json` |
| `diff` | DB-vs-seed diff per entry (fence-aware) | read-only; subset of checkpoint |
| `sync` | Rebase seeds onto pinned card versions | `--dry-run`, `--force`; DB-wins default |
| `checkpoint` | Write DB edits back into card source for review | fails-with-guidance outside fences |
| `pool retire` | `delete_everywhere` a pool entry | human-only, confirmation-prompted |
| `doctor` | GC states (§4.2), ledger integrity, binding reachability | DB-unreachable = warning, not failure |

Plus restored: `card source {add,remove}-{persona,belief}`, mind checks inside `card source doctor`, push gate inside `card push`. All mutating verbs follow house patterns: `--dry-run --json` plans, `DRWN_STORE_READONLY` honored, idempotent double-run.

## 8. drwn module architecture

- **`cli/core/mind-content/`** — restored 103 machinery, adapted: manifest section types + validation, lock fields + version floor, publish validation, authoring functions, source-doctor, visibility + push gate, composition (persona fencing, ordering). Pure/local; no network. Recovered from `1c92ae4` per 112 §4-§5 (module-boundary plan).
- **`cli/core/mind-store/`** — everything network: binding resolution (deploy API + `BGDB_*` env), the **`@beginningdb/client`** dependency (R-6 — published package, no vendoring), path conventions (mind root, pool paths, ULIDs), seed/rebase/checkpoint engines, ledger, placement ops, doctor probes.
- **`cli/commands/worker/mind/`** — thin verb wrappers only.
- Seam rule: `mind-content` never imports `mind-store`; commands compose both. This keeps the 103-restoration testable offline and makes the client package swappable.

## 9. The M0 skills card

`@darwinian/mind-tools` — shippable before any drwn core work; validates conventions end-to-end:

- **Skills** (wrap `bgng`/`bgdb` subprocess, `--json`; pattern proven by beginning-db's own `@remyjkim/bgng` card): `mind-read` (persona/beliefs at session start), `mind-remember` (create-in-pool + place, §4.2), `mind-share`, `mind-forget` (unplace only), `mind-search` (scoped search; note single-`path_prefix` search per request).
- **Conventions doc**: layout (§4.1), entry schemas (§4.1 units + front-matter/line shapes), prefix-is-not-security note, deletion policy.
- Distributed via the standard pipeline; usable in deployed workers as soon as 107's env injection lands (or locally today against any BeginningDB via `BGDB_*` env).

## 10. Phasing

| Phase | Contents | Gates |
|---|---|---|
| **M0** | `@darwinian/mind-tools` skills card + conventions | none (env-based binding works today) |
| **M1** | `mind-content` restoration (manifest/lock/publish/authoring/doctor/push gate) | none (offline) |
| **M2** | `mind-store` + `provision`/`status`/`doctor`; seed engine | **@beginningdb/client published (R-6)**; 107 R1/R2 for deployed use |
| **M3** | `sync` (rebase), `diff`, `checkpoint`, drift/ledger | M2 |
| **M4** | Deploy-path integration (consume `mindId` + binding end-to-end), runner env e2e | 107 landed |
| **V2** | L6 raw-data layer; org-level pools (**gated on Phase-2 enforcement**); memory-history design (deferred research, D-5); reflection automation; fleet rebase; card memory templates | BeginningDB Task 26 / research |

## 11. Testing architecture

Per ratified tiers (D-8) and house TDD rules:

1. **Unit** (`core-*`): mind-content validation/composition/fence parsing; mind-store path/ledger/plan logic. No I/O.
2. **Integration** (`commands-*`): CLI verbs against a **fake BeginningDB** (`Bun.serve`) modeling: filesystems + same-filesystem placement enforcement + `LastPlacement` fallback, ETag/412 CAS, `PATCH` append, child-token ceilings; plus a fake deploy API returning `mindId` + binding. Driven via `BGDB_*` env (precedent: `test/cli-auth-e2e.test.ts`).
3. **E2E** (env-gated): real BeginningDB (`docker-compose.dev.yml`): full journey — publish card → provision → seed → skill-style append/place → DB edit → rebase (drift) → checkpoint → rollback. No mocks in this tier.
4. Determinism: double-run `sync`/`write` → zero changes; ledger byte-stable. All mutating verbs tested for `--dry-run` and readonly.

## 12. Decision record (consolidated)

| Decision | Value | Ratified in |
|---|---|---|
| Design shape | Card-seeded hybrid (B) | 108 R-1 |
| Mind id | = worker id (`mind_<uuid>`), server-minted | 106 D-1; exists in deploy API |
| Composed mind location | DB-only | 106 D-4 |
| Primary authoring surface | DB-first (product services); cards = checkpoint lineage | 108 R-3 |
| Memory layers | L4 reflections/insights (md), L5 observations (jsonl) V1; L6 V2 | 108 R-2, R-5(O-6) |
| Memory construction | Placements; pool-canonical entries | 108 R-4, R-7; 109 §3 |
| Pool paths | `pool/l4\|l5/<yyyy-mm-dd>/<HHmm>-<ulid>.*` | 109 §9.3 |
| Colocation | One owner filesystem per user: minds + pool | 109 §9.1a |
| V1 isolation | Filesystem-scoped child-tokens; per-mind = convention | 109 §9.1b |
| Org pools | V2, gated on ReBAC-on-VFS (Phase 2) | 109 §5 |
| Seeds | Per-mind copies, never placements | 108 R-5(O-5); 109 §8 |
| Conflict policy | DB wins; drift reported; `--force` explicit | 106 D-6 |
| Checkpoint verb | V1 core, diff-first | 108 R-5(O-1); §6.7 |
| Command surface | `drwn worker mind <verb>` | 108 R-5(O-2) |
| Client seam | Published `@beginningdb/client`; no vendoring | 108 R-6 |
| Path prefix | `minds/<mindId>`, convention-only | 109 §9.2 |
| Pool retirement | Human-only drwn verb | 109 §9.4 |
| Reflection | Skill-only V1 | 108 R-5(O-7) |
| Push gate | Restored as captured (103) | 108 R-5(O-8) |
| Skills | Card-native, never uploaded to DB | 106 D-9 |
| Memory history | Deferred (research) | 106 D-5 |
| *New in this doc* | L5 entry unit = per-session jsonl file; no card memory `include`/authoring commands in V1 | §4.1, §3.1 — flag if disagreed |

## 13. Risks and accepted tradeoffs

1. **No version history in BeginningDB** — card checkpoints are the *only* versioning; memory has none until D-5 research lands. Accepted; mitigated by append-only L5 + checkpoint lineage for persona/beliefs.
2. **V1 soft isolation** (§5) — accepted for same-user workers; org pools gated.
3. **Upstream dependencies** — `@beginningdb/client` (gates M2), 107 (gates M4), BeginningDB Task 26 (gates org pools). Known security gap reported upstream: placements-listing ignores filesystem ceiling (109 §2.6).
4. **Two-store mental model** — mitigated by DB-first defaults, drift-as-information, and the small verb set.
5. **bgng contract churn** — client package is 0.x with an explicit contract-version mechanism; pin exact versions, expect breaks.

## 14. Handoff pointers

- Recovered implementation + tests: git SHA `1c92ae4` (map in 103 appendix; recoverability verified in 112 §4).
- Deploy API request: 107 (amended in place 2026-07-07).
- beginning-db asks to send: 109 §7.
- Investigation record: 103→109 chain, in order.
