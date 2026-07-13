# ABOUTME: Operator guide to the mind card lifecycle: authoring persona/beliefs, provisioning DB-backed minds, drift, rebase, checkpoint, and pool memory.
# ABOUTME: Companion to analysis 110 (architecture), task 72 (implementation), and task 76 (substrate split).

# Mind Card Lifecycle Guide

**Status**: Active
**Last Updated**: 2026-07-12
**References**: [.ai/analyses/110_mind-card-target-architecture.md, .ai/tasks/72_mind-card-implementation-plan.md, .ai/tasks/76_mind-substrate-split-implementation-plan.md, /Users/pureicis/dev/darwinian-cards/mind-tools/CONVENTIONS.md]

---

## Mental model

Cards carry the **reviewed definition** of a mind (persona + beliefs seeds,
memory layer declarations, agent skills). BeginningDB carries the **living
mind** (`minds/<mindId>/…` plus the shared `pool/`). The DB is the primary
editing surface; cards are the checkpoint lineage. Verbs connect the two:
seed (provision), rebase (`sync`, DB edits win), and checkpoint (DB → card
source, via persona provenance fences).

## Authoring

```bash
drwn card new @team/mind --no-git
drwn card source add-persona @team/mind voice --visibility internal
drwn card source add-belief @team/mind quality --visibility internal
drwn card source doctor @team/mind --json
drwn card publish @team/mind
drwn card push @team/mind          # visibility gate blocks private→public remotes
```

Manifest rules: persona/beliefs `include` entries require `visibility`;
`memory` declares layers/formats only (`l4` md reflections, `l5` jsonl
observations; `l6` reserved for V2) — memory entries never ship in cards.
Locks with mind content require drwn >= 0.7.0.

## Runtime lifecycle

```bash
# Connection: BGDB_BASE_URL, BGDB_TOKEN, BGDB_TENANT_ID (direct), BGDB_PATH_PREFIX=minds/<mindId>
drwn worker mind provision            # seed from the active card stack (idempotent)
drwn worker mind status --json        # drift: in-sync | db-edited | card-updated | missing
drwn worker mind sync --dry-run       # rebase seeds onto pinned versions; DB edits preserved
drwn worker mind sync --force         # card-wins rebase (explicit)
drwn worker mind diff                 # per-entry DB-vs-card diff + outside-fence content
drwn worker mind checkpoint           # write DB edits back into card sources for review
drwn worker mind doctor --json        # binding, ledger, unplaced pool entries
drwn worker mind pool retire <path> --yes   # human-only delete-everywhere
```

`worker deploy` prints the server's `mindId` and caches non-secret binding
coordinates in `~/.agents/drwn/mind-bindings.json`; tokens are never
persisted (fetched per invocation once the deploy API implements analysis
107's bgdb-token endpoint).

## Memory conventions (pool + placements)

Entries are born in `pool/<layer>/<yyyy-mm-dd>/<HHmm>-<ulid>.*` and appear in
mind trees only as placements. Agents append observations to their own
session file (PATCH is an offset write, not atomic — one writer per entry
file), place entries into views, share by placing into another mind's view,
and forget by unplacing their own view. Deleting a last placement destroys
the entry (no history) — hence retire is confirmation-gated and human-only.

## Test tiers

- Unit/integration: `test/core-mind-*`, `test/commands-worker-mind.test.ts`,
  `test/scenarios-mind-lifecycle.test.ts` against `test/fixtures/fake-bgdb.ts`.
- Real-DB e2e (contract + journey):
  `DRWN_E2E_BGDB=1 DRWN_E2E_BGDB_BIN=<path>/beginningdb bun test test/e2e-mind-journey.test.ts`
  The fake mirrors verified real semantics: no ETag on PUT responses (stat
  carries it, and in the body as `etag` with `inode_id`), PATCH requires
  `Content-Range: bytes <offset>-`, placements are same-filesystem.
