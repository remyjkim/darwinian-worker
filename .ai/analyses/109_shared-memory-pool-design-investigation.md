# ABOUTME: Design investigation for the org/user-level shared memory pool (decision O-4c/R-7): BeginningDB placement and token-scoping constraints, the colocation consequence, pool layout and lifecycle, phased access-control design, and required amendments to the 107 deploy-API request.
# ABOUTME: Also scopes the two upstream asks to the beginning-db repo — the published client package (R-6) and auth-layer items — and records a placement-listing authorization gap found during investigation.

# Analysis 109 — Shared Memory Pool: Design Investigation

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Draft — investigation complete; design proposal for ratification
**References**: [.ai/analyses/108_hybrid-mind-design-ratification-and-pending-decisions.md, .ai/analyses/107_deploy-api-mind-binding-change-request.md, /Users/pureicis/dev/beginning-db/BeginningDB/.ai/knowledges/, /Users/pureicis/dev/darwinian-services/org-management/]

---

## 1. Purpose

R-7 ratified O-4 option (c): memory entries live in an **org/user-level shared pool** outside individual mind subtrees; minds' memory trees are constructed by **placing** pool entries inward (R-4). This deliberately reopened per-mind token confinement. This doc reports what the BeginningDB auth/placement machinery and the darwinian-services org/identity stack can actually express, and derives a phased design.

## 2. Hard constraints discovered

From code-level investigation of BeginningDB (`crates/bgdb-server/src/{authorizer,auth,jwt,child_token,rebac}.rs`, `lib.rs` handlers) and darwinian-services (org-management, auth-hub):

1. **Placements are same-filesystem only.** `place` requires source and destination to extract the same `filesystem_id` (both are checked against the principal's `ResourceCeiling`); cross-filesystem and cross-tenant placement is impossible. An inode's paths all live within one filesystem.
2. **Every token mechanism is single-filesystem-scoped.** API keys, direct JWTs, OIDC-resolved accounts, and child-tokens each carry at most one `filesystem_id`; `ResourceCeiling` is `{tenant_id?, filesystem_id?}` — there is **no way to mint one token spanning two filesystems**, and no path-prefix granularity below the filesystem.
3. **`BGDB_PATH_PREFIX` is client convention, not enforcement.** The server enforces only tenant + filesystem ceilings. Our 107 acceptance criterion "a PUT outside the prefix fails" is unimplementable at DB level today.
4. **ReBAC exists but is not yet enforced on VFS paths.** The SpiceDB-backed layer (resource types `organization`, `library`, `folder`, `file`; `/v1/authz/*`, grants/shares/links; outbox+reconcile) is live for its own routes and gates child-token minting (`library:<fs>#view/edit`), but VFS read/write authorization still runs on legacy ceilings. The cutover to per-endpoint ReBAC is BeginningDB's planned **Task 26** — the `folder` resource type is exactly what per-mind confinement inside a shared filesystem needs.
5. **No orphan/GC concept.** Deleting the last placement deletes the inode (unplace falls back to delete-everywhere on `LastPlacement`). Placement enumeration (`GET /v1/files/{inode}/placements`) exists.
6. **Authorization gap found (report upstream):** the placements-listing endpoint checks only `MetadataRead` + tenant — it does **not** filter by the principal's filesystem ceiling, so a filesystem-scoped token can enumerate an inode's paths in *other* filesystems of the same tenant (metadata leak; VFS ops on those paths are still blocked).
7. **Orgs already live in BeginningDB.** darwinian-services org-management provisions each org with a BeginningDB `tenantId` + `defaultFilesystemId` and stores membership (owner/admin/member) **as BeginningDB ReBAC relationships** (`org:<id>` resources). There is no membership table outside BeginningDB.
8. **DAH tokens carry no org claims** (identity = `sub`, optional email; roles claim empty by design); org resolution is a service-side lookup. studio-deployment `minds` are **user-scoped** (`user_id` column; no `org_id` anywhere). Billing is likewise user-keyed.

## 3. The colocation consequence

Constraints 1+2 force the central design fact:

> **Anything that shares memory via placements must live in one filesystem.** The pool cannot be a separate workspace that minds reach into; it must be a **sibling subtree** of the mind subtrees, inside one shared filesystem, covered by one filesystem-scoped token.

So R-7's "outside mind subtrees" resolves to: outside `minds/<mindId>/`, inside the same filesystem:

```
<owner filesystem>                       ← one BeginningDB filesystem per pool scope (user or org)
├── minds/
│   ├── <mindId-1>/                      ← per-worker subtree (persona.md, beliefs/, memory views, mind.json)
│   │   └── memory/l5/…                  ← placements of pool entries (views)
│   └── <mindId-2>/…
└── pool/
    ├── l5/<yyyy-mm>/<entryId>.jsonl     ← canonical observation entries (append-only)
    ├── l4/<entryId>.md                  ← canonical reflection entries
    └── pool.json                        ← pool index/conventions (optional)
```

This **supersedes 108 §6.4's "born at primary path" recommendation** (which predates R-7): entries are born in `pool/`, and every path under a mind's `memory/` tree is a placement. It also resolves the O-4 dimension cleanly: identity = inode in the pool; mind trees are pure views.

### Pool-entry lifecycle

- **Create**: skill/CLI writes `pool/l5/…/<entryId>.jsonl` (atomic create), then `place`s it into the owning mind's view path(s) (`minds/<id>/memory/l5/by-date/…`). Two calls; a failure between them leaves a pool entry placed nowhere — see GC below.
- **Share**: place the same entry into another mind's view (same filesystem — free).
- **Remove from a mind**: `unplace` the view path (default; never `delete_everywhere` from skills).
- **Retire an entry**: `delete_everywhere` from the pool path — explicitly privileged verb, drwn-side confirmation required.
- **GC/doctor states** (no server GC exists): *unplaced entry* (in pool, no mind views — okay transiently, flagged if old), *pool-orphaned entry* (pool path deleted while mind placements survive — the inode lives on via views but has left the pool; doctor flags, offers re-place or adopt), *dangling ledger refs*. drwn `worker mind doctor` owns these checks, using the placements endpoint.

## 4. Access control: phased design

The honest position: **V1 cannot have DB-enforced per-mind isolation inside a shared filesystem.** The choice is where to put the boundary now and how to get real enforcement later.

### Phase 1 (V1) — filesystem-scoped child-tokens, soft per-mind isolation

- One filesystem per pool scope (§5). Each worker's token is a **child-token for that filesystem** (existing mint flow, ReBAC `library:<fs>#edit` check at mint — already enforced).
- Consequence stated plainly: a worker's token can technically read/write sibling minds' subtrees and the whole pool. Isolation between minds of the **same owner** is by convention (skills only touch `minds/<self>/` + `pool/`), not by cryptography. Between owners it is hard (different filesystems/tenants).
- Why this is acceptable for V1: all colocated workers belong to the same user (§5 V1 scoping); the threat model is misbehaving-agent-vs-own-sibling, which drift/doctor visibility mitigates but doesn't prevent. This is the price of R-7's sharing model on today's substrate, and it should be an explicit, written risk acceptance.
- `BGDB_PATH_PREFIX` remains set to `minds/<mindId>` for skill ergonomics — with the conventions doc stating it is not a security boundary. Note: skills that read the pool must escape the prefix (the CLI's raw-path escape hatch, or prefix set to the filesystem root and mind-relative paths handled by the skill layer — decide in M0; leaning prefix=`/` + explicit paths, since a lying prefix invites false confidence).

### Phase 2 — real enforcement, two candidate routes (upstream BeginningDB work)

- **(a) ReBAC VFS cutover (their Task 26) + `folder` grants** — the target: worker identity (`agent` subject type exists) gets `folder:minds/<id>#edit` + `folder:pool#view` (+ append semantics TBD), checked on VFS ops. Expresses exactly our model; no token-format change; waits on their cutover.
- **(b) `ResourceCeiling` path-prefix sets** — smaller: ceiling becomes a set of (filesystem, prefix, scope) entries; child-token minting accepts multiple prefixes with per-prefix ReBAC checks. Investigation estimate ~40–60h upstream. Faster than (a) but a second authorization vocabulary that Task 26 would later subsume.
- **(c) Gateway-side path enforcement** (our side, stopgap): front worker traffic with a proxy (gateway-worker/BFF pattern) that enforces per-mind prefixes per session. Buys enforcement without BeginningDB changes, at the cost of owning a proxy in the serving path.

**Recommendation**: Phase 1 now with written risk acceptance; advocate (a) upstream as the target (it also matches how org-management already uses ReBAC); treat (b)/(c) as contingencies if Task 26 stalls and multi-user colocation (org pools) ships first.

## 5. Pool scope: user in V1, org in V2

- **V1 — user-level pool.** studio-deployment minds are user-scoped; OIDC account resolution already provisions per-account tenant + default filesystem. One filesystem per user hosts all their workers' minds + their pool. No org linkage needed; billing/quota hooks stay user-keyed.
- **V2 — org-level pool.** Requires: `org_id` on minds (deploy-API schema change), workers of org members colocated in the **org's** filesystem (which org-management already provisions), membership-aware access (org relationships already in ReBAC), and org resolution at deploy time (DAH has no org claims — service-side lookup against org-management, per that investigation's Option A; DAH `org_ids` claim as the later optimization). Colocation across users makes Phase 2 enforcement a **prerequisite**, not an option: soft isolation between different users' workers is not acceptable.

**Sequencing rule that falls out**: org pools ship only after Phase 2 enforcement exists. User pools don't wait for it.

## 6. Amendments to the 107 deploy-API request

1. **Binding shape** (R1): add `filesystemId` (the owner filesystem); `pathPrefix` becomes `minds/<mindId>` with its non-security status documented. Provisioning = ensure the **user's** filesystem exists (OIDC resolve-or-provision may already do this) + mint child-tokens for it.
2. **Token** (R2): the mind token is a **child-token for the owner filesystem** — confinement is filesystem-level, not mind-level. The prior acceptance criterion "PUT outside `minds/<mindId>/` fails" is **withdrawn for V1** and replaced by: "PUT outside the owner filesystem fails" + "child-token mint is ReBAC-gated". Mind-level enforcement returns as a Phase-2 criterion.
3. **Token lifetime**: unchanged preference (long-lived via their secrets pipeline), now explicitly a *child-token* under the hood.
4. **Topology** (their §4/§8): the pool design strengthens the gateway-fronted target (child-tokens + ReBAC are the enforcement substrate) — recommend stating it as the committed direction, with direct-mode acceptable only for V1 user pools.
5. **New informational item**: org pools (V2) will eventually need `org_id` on minds and org-filesystem colocation — flag now so schema evolution is anticipated, no action requested yet.

## 7. Upstream asks to the beginning-db repo

1. **Client package (R-6, gates mind-store)**: publish a consumable package — proposed `@beginningdb/client` — containing the fetch client (`beginningDbRequest`/`beginningDbJsonRequest`), target resolution (env + `~/.bgdb` stores), path utilities, and types; needs an `exports` map and a publish pipeline (none exist today; package is 0.1.0 with an explicit CLI contract-version). Ask includes: placement + child-token call coverage, and a stability statement (even "0.x, breaking-changes-announced" suffices).
2. **Security report**: the placements-listing filesystem-ceiling gap (§2.6).
3. **Enforcement roadmap**: advocate Task 26 (ReBAC-on-VFS) prioritization, presenting our Phase-2(a) dependency; ask whether `folder`-level grants will support append-only semantics (our L5 pool wants write-append distinct from edit).
4. Nice-to-have: server-side atomic "create+place" (or multi-op batch) to close the create/place gap in §3's lifecycle.

## 8. Ripple effects on prior decisions

- **O-4 final shape**: pool-canonical entries + placement views (this doc §3) replaces 108 §6.4(a); the §6.4(c) auth caveat is now fully mapped (§4) rather than deferred.
- **O-6 formats**: unchanged (L5 jsonl append-only in pool; L4 md in pool); entry ids become pool-path-based; the shared entry schema gains `entryId` + provenance (`mindId` of origin).
- **O-5 seeds**: unchanged — persona/beliefs remain per-mind **copies** inside `minds/<mindId>/`; the pool is memory-only.
- **M0 skills card**: skill verbs gain the placement vocabulary (`remember` = create-in-pool + place; `share-memory` = place into another mind; `forget` = unplace) and the prefix decision from §4 Phase 1.
- **Testing**: the fake BeginningDB server must now model filesystems, placements (same-filesystem enforcement, LastPlacement fallback), child-token ceilings, and the create/place two-step; real-DB e2e gains a placement/GC journey. The §2.6 gap gets a regression test upstream, not here.
- **107 doc**: amend per §6 (edit in place with a changelog note, or issue as an addendum — Remy's call).

## 9. Open questions — resolutions (Remy + Claude, 2026-07-07)

1. Two consequential accepts everything else assumes:
   - **(1a) Colocation layout — RATIFIED (Remy, 2026-07-07)**: all of a user's worker minds AND their shared pool live inside **one BeginningDB filesystem** (forced by §2.1–2.2; a separate pool workspace is impossible with placements).
   - **(1b) V1 soft isolation — RATIFIED (Remy, 2026-07-07)**: because tokens are filesystem-granular, each worker's token can technically read/write its **sibling minds' subtrees and the entire pool**; per-mind separation in V1 is skill/CLI convention only, with DB-level enforcement arriving in Phase 2 (§4). Accepted as the V1 security posture on the basis that all colocated workers belong to the same user; org pools remain gated on Phase 2 enforcement (§5).
2. **Resolved (Remy)**: `BGDB_PATH_PREFIX = minds/<mindId>`. Consequences: skills use the raw-path escape hatch (or absolute paths) for `pool/…` operations; the conventions doc states plainly that the prefix is ergonomic addressing, not a security boundary.
3. **Resolved (Remy)**: date-sharded pool paths with time-of-day: `pool/l5/<yyyy-mm-dd>/<HHmm>-<entryId>.jsonl` and `pool/l4/<yyyy-mm-dd>/<HHmm>-<entryId>.md`, with **ULID** entry ids (lexically time-sortable; the `HHmm` filename prefix keeps the DB-first editing surface human-browsable). Day-level sharding; revisit shard granularity if daily entry counts demand it.
4. **Resolved (Claude's call, per Remy's delegation)**: `delete_everywhere` (pool-entry retirement) is a **human-invoked drwn verb only** (`worker mind pool retire`, confirmation-prompted, owner-user), **never exposed in agent skills**. Agents get `forget` = `unplace` from their own view only. Rationale: retirement is irreversible in a system with no version history, and shared state destruction shouldn't be delegable to an agent's judgment.
5. **Resolved (Remy)**: 107 amended **in place** — done 2026-07-07 (changelog note in its header; R1/R2 binding + token shape, acceptance criterion 2, topology recommendation, and the V2 org informational item updated per §6).

## 10. Next step

Obtain the §9.1a/1b ratifications; send the beginning-db asks (§7 — the client package is on the critical path for mind-store); fold §8's M0 adjustments into the conventions doc; then the implementation task plan per 108 §7's revised critical path.
