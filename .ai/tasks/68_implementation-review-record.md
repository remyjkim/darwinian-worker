# Task 68 — Implementation Review Record

**Branch**: `task/68-drwn-card-model-vendored`  
**Scope**: Vendored Mind Card model (97/98 architecture, task 68 sequential plan)  
**Status**: Both review rounds repaired; gates green as of 2026-07-07

This document consolidates two mentor review cycles and their repair outcomes. It supersedes:

- `.ai/tasks/68_review01_task68_implementation_alignment_review.md`
- `.ai/tasks/68_review01_re_repair-strategies.md`
- `.ai/tasks/68_review02_current-implementation-and-testing-status.md`
- `.ai/tasks/68_review02_re_repair-strategies.md`

---

## Executive summary

| Round | Date | Verdict | Repair phases | Outcome |
|-------|------|---------|---------------|---------|
| **Review 01** | 2026-07-06 | Not ready — store-backed vendor, not committed-vendor architecture | R0–R5 | Substrate, routing, overlay lane, porcelain, migration/GC |
| **Review 02** | 2026-07-07 | Not ready — migration safety, provenance ordering, command boundaries | R2-1–R2-T | Lock persistence, post-reconcile roots, watch, mode readout |

**Final verification (2026-07-07)**:

- `npx tsc --noEmit` — pass
- `bun test` — 1136 pass, 2 skip, 0 fail
- `bun run verify:release --json` — pass

---

## Review round 01

### Source of truth

- `.ai/tasks/68_drwn-card-model-unified-sequential-plan.md`
- `.ai/analyses/97_worktree-vendored-card-architecture.md`
- `.ai/analyses/98_target-tooling-mental-model-and-usage-guide.html`

### Initial gate (pre-repair)

- `npx tsc --noEmit` — pass
- `bun test` — 1077 pass, 2 skip, 0 fail
- `verify:release` — pass (green suite did not prove task 68 completeness)

### Verdict

Implementation compiled and tests passed, but did not satisfy 97/98 V1 architecture: offline vendored writes depended on the machine store, skills/hooks bypassed content-root abstraction, local overlay lock lane was unwired, and many task-named acceptance tests were absent.

### Findings (F1–F13)

| ID | Severity | Theme | Summary |
|----|----------|-------|---------|
| F1 | High | Substrate | Offline write required store; corrupt store could bless vendor verification |
| F2 | High | Substrate | Stale vendor trees unprunable without persisted manifests |
| F3 | High | Routing | Skills/hooks used `card.path` instead of content roots |
| F4 | Medium | Overlay | Global `CARDS_SOURCE_PATH` flipped all cards to linked |
| F5 | Medium | Overlay | `card.lock.local` not merged into effective state |
| F6 | Medium | Watch | Non-recursive watch missed nested linked-source edits |
| F7 | Medium | Idempotency | Vendor reconcile and mind timestamps broke no-op writes |
| F8 | Medium | GC | Vendor SHA roots incomplete; retention unused |
| F9 | Medium | Surfaces | `committedSurfaces` not wired into gitignore hygiene |
| F10 | Medium | Migration | Symlink migration detected but did not replace symlinks |
| F11 | Medium | Readout | Mode info emitted as warnings; status incomplete |
| F12 | Medium | Hooks | Cross-machine consent notice on every write |
| F13 | Medium | Tests | 18 plan-named test files missing (not 7) |

**Root cause**: Manifest authority derived from live store bytes rather than lock digest. Fixing authority (lock digest + committed sidecars) collapsed F1/F2/F7/F8-partial.

### Design decisions (ratified)

| ID | Decision |
|----|----------|
| D1 | Committed per-tree sidecars at `.agents/drwn/vendor-manifests/@scope/name/<shortSha>.json` (97 rev 4 amendment) |
| D2 | Recursive watcher abstraction with platform fallback |
| D3 | `card.lock.local` as machine-local overlay lane; local wins with warnings |
| D4 | Per-card source presence for linked mode |
| D5 | `committedSurfaces` toggles projection-surface gitignore entries |
| D6 | Hook-consent ack keyed by `treeSha` + `hookPolicyDigest` |
| D7 | Structured `Modes:` section on write (non-default only in R1; superseded in review 02) |

### Repair sequence (R0–R5) — complete

| Phase | Scope | Exit |
|-------|-------|------|
| **R0** | Ratify `vendor-manifests/` in 97 rev 4, 98, task 68 | Doc grep finds complete contract |
| **R1** | Lock/vendor integrity, offline substrate, sidecars, idempotent reconcile | Offline write from empty store; stale prune; double-write no-op |
| **R2** | Single content-root routing through materializers | Vendored skills/hooks work with store deleted |
| **R3** | Overlay lane + per-card source presence | Local lock lane; absent-source → vendored fallback |
| **R4** | Watch, mode readout, hook-consent notice-once | Nested edits trigger; status complete |
| **R5** | Migration, committed surfaces, GC, porcelain tests | §5 test table green |

---

## Review round 02

### Initial gate (post R0–R5)

- `npx tsc --noEmit` — pass
- `bun test` — 1116 pass, 2 skip, 0 fail

### Verdict

Broad implementation landed and main gates green, but **migration safety**, **vendored provenance ordering**, and **command-boundary lock persistence** remained acceptance blockers.

### Findings (R2-F1–F6)

| ID | Severity | Theme | Summary |
|----|----------|-------|---------|
| R2-F1 | High | Lock | `treeSha` backfill not wired through install/trust/untrust |
| R2-F2 | High | Provenance | Content roots captured before reconcile; first vendored write read extracted store |
| R2-F3 | High | Migration | Migration truncated write-record ownership |
| R2-F4 | Medium | Git | No bounded fetch lock retry (Phase 11 Step 3) |
| R2-F5 | Medium | Watch | Static linked roots; overlay files created after startup missed |
| R2-F6 | Medium | Readout | Write omitted vendored cards from `cardModes` |

**Root cause clusters**:

- **A** — Lock persistence choke point incomplete (`persistCardLock` not universal)
- **B** — Effective state snapshot before reconcile; extracted fallback on real writes
- **C** — Migration and watch incomplete at command boundaries

### Design decisions (ratified)

| ID | Decision |
|----|----------|
| D1 | `persistCardLock()` for all committed lock writes |
| D2 | `recomputeContentRootsByCard()` after reconcile; `allowPlanningFallback` for dry-run only |
| D3 | Surgical write-record merge preserving non-symlink ownership |
| D4 | `fetchWithLockRetry()` — 3 attempts, 50/100/200 ms, lock stderr only |
| D5 | Recursive `.agents/drwn/` watch + dynamic linked-root refresh |
| D6 | Write `cardModes` includes **every** locked card (supersedes review01 D7 for write) |
| D7 | `drwn use` replace semantics documented; `card release` push deferred post-V1 |

### Repair sequence (R2-1–R2-T) — complete

| Phase | Findings | Primary deliverables |
|-------|----------|---------------------|
| **R2-1** | R2-F1 | `persistCardLock`, install/trust/untrust backfill, legacy lock tests |
| **R2-2** | R2-F2 | Post-reconcile root refresh, hook digest from refreshed roots, provenance tests |
| **R2-3** | R2-F3 | Surgical migration write-record merge |
| **R2-4** | R2-F4 | `fetchWithLockRetry`, source-sync integration |
| **R2-5** | R2-F5 | Dynamic watch, `ensureCardLockLocalEntryFromSource` |
| **R2-6** | R2-F6 | All cards in write `cardModes` |
| **R2-T** | Gaps | Source sync roundtrip, committed-surfaces git test, use replace test |

### Additional test gaps (disposition)

| Item | Disposition |
|------|-------------|
| `card source sync` integration | R2-T1 — scenario roundtrip test |
| Committed surfaces git visibility | R2-T2 — porcelain git status test |
| Offline corrupt-vendor repair | R2-F2 extension |
| `card link` / `dev` local-only | R2-T3 — file-origin local lock helper |
| `drwn use` semantics | R2-T4 — replace documented and tested |
| `card release` push | Deferred post-V1 (help + test comment) |
| Hook consent digest path | R2-F2 piggyback |

---

## Consolidated acceptance checklist

### Architecture (97/98)

- [x] Committed vendor trees with sidecar manifests (R0/R1)
- [x] Offline write from empty machine store when vendor verifies against lock digest
- [x] Single content-root abstraction for skills, hooks, minds (R2)
- [x] Overlay lane: `config.local.json` + `card.lock.local` (R3)
- [x] Per-card linked source presence with vendored fallback (R3/R4)

### Migration and safety (review 02)

- [x] Legacy v2–v4 locks survive install/trust/untrust with v5 + `treeSha` (R2-1)
- [x] First vendored write materializes from committed vendor after reconcile (R2-2)
- [x] Symlink migration preserves unrelated write-record ownership (R2-3)
- [x] Git fetch lock retry for transient contention (R2-4)

### Operator experience

- [x] Dynamic watch for overlay creation and linked-root changes (R2-5)
- [x] Write reports all card modes with reason (R2-6)
- [x] Hook consent notice-once with strong ack key (R1 D6)
- [x] Porcelain commands: `use`, `dev`, `up`, `projects`, `card link/unlink/fork/meta/release/source sync`

### Gates

- [x] `npx tsc --noEmit`, `bun test`, `bun run verify:release --json` green
- [ ] Manual empty-store checkout scenario (operator sign-off)
- [ ] Two consecutive `drwn write` byte-level no-op on vendored mind project (operator sign-off)
- [ ] Task 68 §4 checklist walked end-to-end (operator sign-off)

### Deferred post-V1

- `card release` remote push / catalog publication (Phase 10 Step 5)

---

## Clarifications retained for re-review

1. **`card.path` grep criterion**: No project-scope materializer resolves card content through `card.path` directly; routing flows through `contentRootsByCard`.
2. **Sidecar scope**: Current-tree offline verification uses `card.integrity` digest-compare; sidecars serve stale-tree prune and GC SHA resolution.
3. **Dry-run fallback**: `allowPlanningFallback: true` for planning/readout; real writes recompute post-reconcile with `false`.
4. **Write mode readout**: Review 02 D6 supersedes review 01 D7 narrow write readout.

---

## Related runbooks

- `.ai/analyses/99_vendored-migration-runbook.md`
- `.ai/analyses/99_card-trust-hardening-roadmap.md`
- `.ai/analyses/99_defaults-retirement-runbook.md`
