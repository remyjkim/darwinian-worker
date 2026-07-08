# ABOUTME: Change request to the deploy API team (darwinian-services/studio-deployment) for the mind capability card: BeginningDB mind-binding provisioning, token minting scoped to user + mind id, and container env injection.
# ABOUTME: Grounded in the current deploy-api/runner implementation (cited file:line); asks are minimized because the stable mind id already exists and is already returned.

# Analysis 107 — Deploy API Change Request: Mind Binding for the Mind Capability Card

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Draft — request to the studio-deployment team
**Audience**: darwinian-services/studio-deployment owners
**References**: [.ai/analyses/106_mind-card-dual-design-proposals.md, .ai/analyses/105_mind-card-beginningdb-target-architecture-investigation.md, .ai/analyses/103_persona-beliefs-memory-capability-card-design-capture.md, .ai/analyses/109_shared-memory-pool-design-investigation.md]
**Amended**: 2026-07-07 per analysis 109 (shared memory pool): binding gains `filesystemId`; the token is a filesystem-scoped child-token; the mind-subtree confinement acceptance criterion is replaced by filesystem-level criteria; topology recommendation strengthened to gateway-fronted.

---

## 1. Context — what we're building and why it touches you

The `drwn` CLI is adding a **mind capability card**: workers carry persona/beliefs/memory ("mind content") that lives in **BeginningDB** (the beginning-db workspace's multi-tenant virtual filesystem), one subtree per mind at `minds/<mindId>/…`. Agents read persona/beliefs and append memory at runtime through card-shipped skills wrapping the `bgng`/`bgdb` CLI; the `drwn` CLI provisions and (in one design variant) seeds/syncs that content.

Ratified decisions relevant to your service (analysis 106 §1):
- **Mind id = worker id, minted by the deployment server**, with auth tied to **user + mind id** (D-1).
- Composed mind content is **DB-only**; product services give users read/edit access to the DB files (D-4).
- Two content-lifecycle designs (DB-native vs card-seeded hybrid) are under team discussion (D-2) — **the asks in this doc are identical under both**, so this request is not blocked on that decision (§6).

## 2. What already exists on your side (no change requested)

Verified against the current code — this request is smaller than we expected because you already built most of D-1:

- **Stable mind identity exists and is already returned.** `POST /api/deployments` creates/reuses a `minds` row per `(user_id, slug)` and responds with `{deploymentId, mindId, slug, status}` (`workers/deploy-api/src/deployments-route.ts:70-177`, response :176; `minds` schema `migrations/0001_init.sql:4-10`). `mind_id` survives redeploys and rollbacks (aliases flip `active_deployment_id`; `worker.ts:293-331`). **`mind_id` is the mind id.** The drwn CLI will simply start consuming the `mindId` it has been ignoring — that's our side, not yours.
- **Per-mind secret plumbing exists.** The `secrets` table is keyed by `mind_id` with `kind='mcp'|'env'` (`migrations/0003`, `0005`), and the runner decrypts and injects them into the container env at boot (`workers/runner/src/worker.ts:91-146`, injection :116-124).
- **Resource-scoped token minting via DAH exists as a pattern.** `card-authz.ts:52-82` mints a service token (client credentials) and exchanges it for a resource-scoped token at the auth hub. The mind-binding token (R2 below) is the same shape with different claims.
- **DAH bearer auth middleware** (`worker.ts:217-238`) gives you `userId` on every request — the "user" half of "user + mind id".

## 3. Requested changes

### R1 — Provision a BeginningDB mind binding per mind

When a mind is created (first deploy of a slug), associate it with a BeginningDB **binding**: the connection coordinates for the owner's filesystem and the mind's subtree within it. Per analysis 109, all of a user's minds plus their shared memory pool are **colocated in one filesystem per user** (BeginningDB placements and token ceilings are filesystem-scoped, so sharing requires colocation).

Proposed binding value (stored per mind — new columns on `minds` or a `mind_bindings` table, your call):

```jsonc
{
  "baseUrl": "https://<beginningdb-or-gateway-host>",
  "tenantId": 42,                      // direct mode; omit if gateway/workspace mode
  "filesystemId": "<owner-fs>",        // the user's filesystem (hosts minds/* and pool/*)
  "pathPrefix": "/minds/<mindId>"      // the mind's subtree root — CONVENTION, not a security boundary
}
```

Notes:
- **Subtree creation is not your job.** The drwn CLI (and/or the agent skills) creates `minds/<mindId>/` and `pool/` content with atomic-create semantics (`If-None-Match: *`). You provision *coordinates and credentials*, not content — concretely: ensure the user's filesystem exists (BeginningDB's OIDC account resolution already resolve-or-provisions a per-account default filesystem, which may make this a no-op) and mint tokens for it.
- The `pathPrefix` is honored client-side by the bgng/bgdb CLI so agents address mind-relative paths (`/persona.md`); BeginningDB does **not** enforce it (enforcement is filesystem-granular today — see R2).

### R2 — Mint mind-bound BeginningDB tokens (user + mind id)

A **child-token scoped to the owner's filesystem** (BeginningDB's existing `POST /v1/auth/child-token` mint, ReBAC-gated at mint time), associated with the requesting DAH user + `mind_id`. Confinement is **filesystem-level** in V1: the token covers all of that user's minds and the shared pool — per-mind-subtree enforcement arrives with BeginningDB's ReBAC-on-VFS cutover (analysis 109 §4 Phase 2) and is explicitly out of scope for this request. Two consumers:

1. **The drwn CLI** (provisioning, and under the hybrid design: seeding/sync). Needs an authenticated endpoint to fetch the binding + a fresh token at arbitrary times, not just at deploy:

   ```
   POST /api/minds/:slug/bgdb-token
   → 200 { "binding": { ...as R1... }, "token": "<bearer>", "expiresAt": "<iso8601>" }
   ```

   (Name/shape yours to bikeshed; the requirement is: authenticated by the mind owner's DAH bearer, returns binding + usable token.)

2. **The worker container** (agents' bgng skills at runtime) — see R3.

**Token-lifetime option we'd like your read on** (either satisfies us; both are child-tokens under the hood):
- **(a) Long-lived child-token stored as a mind secret.** Mint once at mind creation (long expiry), store encrypted in your existing `secrets` table (`kind='env'`, `env_var='BGDB_TOKEN'`) — the runner then injects it with **zero new runner code** via the existing `resolveSecrets` path (`runner/src/worker.ts:116-124`). Cheapest; rotation via your existing secret-update endpoint.
- **(b) Short-lived child-tokens minted at boot/refresh.** Tighter exposure window but needs a refresh story for long-running containers.

We suggest (a) for v1 given how neatly it reuses your secrets pipeline, upgrading to (b) when the BeginningDB gateway/ReBAC posture hardens.

### R3 — Inject the binding into the container environment

At `ensureBooted` (`runner/src/worker.ts:91-146`), add the binding to `envVars` using the **bgng CLI's own env contract** (these names are already honored by `bgng`/`bgdb`, so agent skills work with zero in-container config):

```
BGDB_BASE_URL     = binding.baseUrl
BGDB_TENANT_ID    = binding.tenantId          (if direct mode)
BGDB_TOKEN        = <mind-scoped token>        (via secrets path if option (a))
BGDB_PATH_PREFIX  = binding.pathPrefix
```

Under option (a), only `BGDB_BASE_URL`/`BGDB_TENANT_ID`/`BGDB_PATH_PREFIX` are new code (token rides the secrets path). These are static per mind, so they could also be stored as `kind='env'` secrets at mint time — making R3 potentially a **zero-code** change on the runner. Your call on mechanism; the requirement is: the four variables are present in the container env.

### R4 — Extend the deploy response with the binding (convenience)

`POST /api/deployments` response (`deployments-route.ts:176`) additionally returns the binding so the CLI can provision/seed immediately without a second round-trip:

```jsonc
{ "deploymentId": "dep_…", "mindId": "mind_…", "slug": "…", "status": "pending",
  "mind": { "binding": { …R1… }, "token": "…", "expiresAt": "…" } }   // ← new
```

Additive and optional-for-consumers; older CLI versions ignore it. If you'd rather keep the deploy response lean, R2's endpoint alone is sufficient (we'll call it right after deploy) — R4 is a nice-to-have.

### R5 — Mind deletion semantics

`DELETE /api/minds/:slug` (`worker.ts:333-347`) currently cascades DB rows. Requested default: **do not purge** the BeginningDB subtree (mind content may outlive the deployment; product services may still read it). Add an explicit opt-in (`?purgeMind=true` or body flag) that deletes `minds/<mindId>/` (or revokes the binding token and marks the subtree orphaned, if you'd rather not do remote deletes). We only need the *default-keep* behavior guaranteed; the purge affordance can come later.

## 4. Infrastructure question you own (blocking R1/R2)

**Which BeginningDB does this bind to?** studio-deployment (deploy-api/runner/engine) has no BeginningDB integration today. Someone must decide: a shared multi-tenant BeginningDB instance (or its Cloudflare gateway-worker front) operated alongside your workers, its tenancy model, and its auth roots (DAH OIDC — BeginningDB supports it natively, and note that org-management **already provisions orgs as BeginningDB tenants with filesystems and stores membership as BeginningDB ReBAC relationships**, so precedent and client code exist in darwinian-services). Following analysis 109, our recommendation is now firmer than the original draft: commit to the **gateway-fronted** direction (child-tokens + ReBAC are the enforcement substrate the shared memory pool depends on for its Phase-2 isolation), with direct mode acceptable only as a V1 stopgap for user-level pools. This is the one genuinely new operational dependency in the request.

**Informational, no action requested**: V2 introduces **org-level** pools, which will need an `org_id` association on minds and colocation of org members' minds in the org's filesystem (which org-management already provisions). Flagging now so schema evolution can anticipate it.

## 5. Explicit non-asks (staying CLI-side / card-side)

- Subtree scaffolding, seeding composed persona/beliefs, sync, drift detection — all drwn CLI (using the binding + token from R2).
- The agent skills wrapping bgng — card content, distributed by the card pipeline.
- Any mind-content schema/validation — the server never inspects mind content.
- Engine/chat-path changes — none needed; chat routing is untouched.

## 6. Design-dependency note

Our team is choosing between two content-lifecycle designs (analysis 106): DB-native (A) vs card-seeded hybrid (B). **R1–R5 are identical under both** — the designs differ only in what the *CLI* writes into the subtree and when. You are not blocked on our decision, and nothing in this request will be invalidated by it.

## 7. Suggested acceptance criteria

1. `POST /api/deployments` (new slug) creates the mind and its binding; response includes `mindId` (existing) and — if R4 accepted — the binding + token.
2. `POST /api/minds/:slug/bgdb-token` returns binding + valid token for the mind owner; 401/403 for others; token authority is confined to the **owner's filesystem** (verify: a PUT into another user's filesystem fails) and minting is ReBAC-gated (`library:<filesystemId>` check at the child-token mint). *(Per-mind-subtree confinement is a Phase-2 criterion, deferred to BeginningDB's ReBAC-on-VFS cutover — analysis 109.)*
3. A deployed worker's container env contains `BGDB_BASE_URL`, `BGDB_TOKEN`, `BGDB_PATH_PREFIX` (+ `BGDB_TENANT_ID` in direct mode); `bgdb fs list /` from inside the container lists the mind subtree.
4. Redeploy and rollback do not change `mindId` or the binding; the subtree is untouched by both.
5. `DELETE /api/minds/:slug` leaves the BeginningDB subtree intact by default.

## 8. Open questions for your team

1. Token lifetime: option (a) long-lived-secret vs (b) child-token+refresh (§R2) — preference?
2. Binding storage: columns on `minds` vs separate table?
3. The §4 topology/tenancy decision — who drives it, and what's the timeline? This gates everything else.
4. Should binding minting be lazy (first `bgdb-token` call) instead of at mind creation? Fine by us either way.
5. Does the engine worker need any awareness (we believe no — chat path is orthogonal), or do per-run end-user credentials (`end_user_id` in your secrets model) eventually imply per-end-user mind scoping? Out of scope for v1, but flagging since your secrets schema already anticipates end users.

## 9. Rollout / compatibility

All changes are additive (new endpoint, extended response fields, extra env vars). No existing consumer breaks. The drwn CLI change to consume `mindId` ships independently and first (it's pure client-side). Suggested sequencing: §4 topology decision → R1+R2 → R3 → R4/R5 polish.
