# Task 24: Beginning Agents Loop-Profile Smoke Failure Remediation Plan

## Objective

Make the deployed Beginning Agents loop-profile pipeline pass a clean end-to-end smoke reliably, even when the user already has loop backlog, prior duplicate uploads, or stale pending loop rows.

This task is specifically about the failures observed after Task 23 was implemented and deployed on **May 26, 2026**. Task 23 improved lease handling, retry exhaustion behavior, transport, and scheduler windowing, but the live smoke investigation exposed four additional product-model failures that still prevent a clean deployed smoke.

This plan is handoff-ready and assumes the implementer starts with the current codebase state in:

- `/Users/pureicis/dev/beginning-agents`
- `/Users/pureicis/dev/containerized-cli-harness`

## Relationship To Task 23

Task 23 remains valid and should not be reverted. The work in this plan is a follow-on correction for gaps that only became clear after deploy-and-smoke:

1. duplicate loop uploads can still corrupt canonical loop-profile state
2. fresh uploads can starve behind old unscheduled placeholders
3. the stale-run reconciler only repairs `harness_runs`, not unscheduled loop work
4. the smoke test itself is not batch-scoped and is therefore not a valid deployed regression signal

This task should be executed after Task 23’s code is present.

## Deployed Investigation Summary

### Deployment Result

- The backend was deployed successfully on **May 26, 2026** to:
  - `https://beginning-agents-api-dev.dev-726.workers.dev`
- Cloudflare reported worker version:
  - `4cea3a4b-8c81-495a-bead-b90bf606cec6`
- `/health` returned:
  - `{"ok":true}`

### Smoke Failure 1: Repo Smoke Timed Out

The deployed smoke in [tests/smoke/loop-profile.smoke.test.ts](/Users/pureicis/dev/beginning-agents/backend/tests/smoke/loop-profile.smoke.test.ts:1) was run against the deployed worker on **May 26, 2026 from 6:25:43 PM PDT to 6:33:43 PM PDT**.

Observed result:

- the archive upload succeeded
- the analyze job completed
- the smoke never observed a `scored` loop session and timed out at `480000ms`

### Smoke Failure 2: Fresh Unique Manual Smoke Also Stalled

A second live smoke was run with fresh unique archive contents and unique session IDs:

- tag: `manual-smoke-1779846100670`
- analyze job id: `job_eck3yvm8ubnvzzba`
- created session labels:
  - `manual-smoke-1779846100670-a.jsonl`
  - `manual-smoke-1779846100670-b.jsonl`
- created around **May 26, 2026 6:41:43 PM PDT**

Observed result:

- `/api/analyze` returned `201`
- the analyze job completed immediately
- both loop rows remained:
  - `status = "scoring"`
  - `errorSummary = null`
- detail fetch for both rows returned:
  - `409 {"status":"scoring","error":null}`

### Existing Backlog Evidence

At investigation time, the same bearer user already had older loop rows stuck in `scoring`, including:

- `session-a.jsonl`
- `session-b.jsonl`
- multiple rows from the **May 26, 2026 3:03 PM PDT** upload batch

The user had **10 scoring rows** total, including the two fresh manual-smoke rows.

## Clear Root Causes

### Root Cause 1: Duplicate Uploads Reuse `session_logs` And Regress Canonical Loop State

`session_logs` are deduped by `userId + sha256` in [session-logs/repository.ts](/Users/pureicis/dev/beginning-agents/backend/src/session-logs/repository.ts:34). If the same user uploads the same session content again, the backend reuses the existing `session_logs.id` instead of creating a new logical upload-scoped record.

That by itself is acceptable for content storage, but the loop upload path then calls `seedPendingLoopProfiles()` in [queue/consumer.ts](/Users/pureicis/dev/beginning-agents/backend/src/queue/consumer.ts:143), which upserts directly into canonical `loop_profiles` with:

- `status = "scoring"`
- `harnessRunId = null`
- no composites
- no axes
- no pull quote

Because `loop_profiles` are unique by `(userId, sessionLogId)`, a duplicate upload of the same content resets the existing canonical loop-profile row instead of creating a new queued scoring request. In practice this means:

1. re-running the smoke with the same fixed archive reattached to old `session-a` / `session-b` rows
2. any previous `scored` or `failed` canonical row for that `sessionLogId` is overwritten back to `scoring`
3. the canonical profile table is being used both as:
   - latest stable result
   - pending work queue

That data-model collapse is the first clear root cause.

### Root Cause 2: The Scheduler Is User-Global FIFO Across Pending Placeholders, Not Batch-Aware

The live scheduler counts active harness-backed work in [repository.ts](/Users/pureicis/dev/beginning-agents/backend/src/loop/repository.ts:325) and then schedules oldest pending loop rows whose `harnessRunId is null` in [repository.ts](/Users/pureicis/dev/beginning-agents/backend/src/loop/repository.ts:343).

That means:

1. newly uploaded sessions do not get a dedicated per-batch queue
2. newly uploaded sessions do not reserve even one slot for their own batch
3. a user with older pending `scoring` placeholders can starve every later upload indefinitely

This is exactly what the live evidence showed:

- the fresh manual smoke rows created at **6:41 PM PDT** remained `scoring`
- older pending rows from earlier uploads were still ahead of them

The scheduler is capacity-aware, but not fairness-aware. That is the second clear root cause.

### Root Cause 3: The Reconciler Repairs Stale `harness_runs`, But Not Unscheduled Loop Work

The stale-run reconciler in [stale-run-reconciler.ts](/Users/pureicis/dev/beginning-agents/backend/src/loop/stale-run-reconciler.ts:64) only queries stale `harness_runs` via `listStaleRuns(...)`.

It has no code path for loop work that is:

- `loop_profiles.status = "scoring"`
- `loop_profiles.harnessRunId = null`

So even after Task 23 added:

- retry exhaustion handling
- scheduled reconciler execution in [index.ts](/Users/pureicis/dev/beginning-agents/backend/src/index.ts:71)
- cron trigger deployment

the scheduled sweep cannot repair the precise failure mode that blocked the smoke:

- fresh or duplicate-upload loop rows that are only placeholders and were never assigned a harness run

That is the third clear root cause.

### Root Cause 4: The Smoke Test Does Not Track Its Own Uploaded Sessions

The deployed smoke at [loop-profile.smoke.test.ts](/Users/pureicis/dev/beginning-agents/backend/tests/smoke/loop-profile.smoke.test.ts:20) polls `/api/loop/sessions?limit=5` and then accepts the first row with `status === "scored"` at [lines 60-70](/Users/pureicis/dev/beginning-agents/backend/tests/smoke/loop-profile.smoke.test.ts:60).

This is not a valid deployed regression check because:

1. it uses fixed archive contents, so it collides with `session_logs` dedupe
2. it does not know which `sessionLogId`s belong to its own upload batch
3. it can falsely fail if its rows are behind unrelated backlog
4. it can falsely pass if some unrelated row in the top 5 is already `scored`

That is the fourth clear root cause.

## Recommended Fixed Strategy

### Strategy Summary

The long-term fix is to stop using canonical `loop_profiles` as the work queue.

Instead:

1. keep `session_logs` as the deduped content store
2. keep `loop_profiles` as canonical stable per-session scoring results
3. add a new batch-scoped request model for loop scoring work
4. schedule from request rows, not from `loop_profiles`
5. expose job-scoped progress so smoke tests and operators can track the exact upload they just started

### Recommended Data Model

Add a new table:

- `loop_profile_requests`

Recommended columns:

- `id`
- `user_id`
- `session_log_id`
- `analyze_job_id`
- `score_version`
- `status`
  - recommended enum: `queued | running | scored | failed | reused`
- `harness_run_id`
- `error`
- `reuse_reason`
- `created_at`
- `updated_at`
- `started_at`
- `completed_at`

Recommended uniqueness:

- unique per `(analyze_job_id, session_log_id, score_version)`

Recommended semantics:

- a duplicate upload may reuse the same `session_log_id`
- but it must create a new `loop_profile_request` row for the new `analyze_job_id`
- the canonical `loop_profile` row must not be reset to `scoring` just because the same content was uploaded again

### Recommended Duplicate-Upload Policy

Use the following decision matrix on upload completion:

1. If there is already a canonical `loop_profile` for the same `userId + sessionLogId + scoreVersion` in `scored` state:
   - create a `loop_profile_request` row with:
     - `status = "reused"`
     - `harnessRunId = null`
     - `reuseReason = "already_scored_same_score_version"`
   - do not enqueue a new harness run
   - do not mutate the canonical `loop_profile`

2. If there is already active loop scoring work for the same `sessionLogId` and `scoreVersion`:
   - create a request row that points at the in-flight work, or attach to it logically
   - recommended simpler version: create the new request row as `queued` but do not schedule duplicate active work; when the in-flight work finishes, mark all matching queued duplicates as `reused`

3. Only create a new harness run when there is no valid current result and no valid in-flight work.

This preserves content dedupe without turning duplicate uploads into canonical state regression.

### Recommended Scheduling Policy

Do not schedule directly from canonical `loop_profiles`.

Instead:

1. schedule only `loop_profile_requests.status = "queued"`
2. make scheduling fair across `analyze_job_id`, not just FIFO across all pending rows for the user
3. preserve global and per-user capacity caps

Recommended fairness rule:

- use round-robin or one-request-per-batch selection across the oldest queued `analyze_job_id`s until capacity is full

This guarantees that a fresh upload gets some forward progress even if the user already has backlog.

### Recommended Reconciliation Policy

Expand reconciliation to cover both:

1. stale `harness_runs`
2. stale `loop_profile_requests`

Specifically:

- `queued` request with no `harnessRunId` older than threshold:
  - reschedule it, or
  - mark failed with a durable reason if policy requires
- `running` request whose `harnessRunId` is stale or terminal:
  - materialize the result or fail the request
- `reused` request:
  - terminal and not schedulable

The reconciler should stop looking at `loop_profiles` as the work queue. It should reconcile request rows and then update canonical `loop_profiles` only when a request reaches a terminal result.

### Recommended Smoke-Test Contract

The smoke must become batch-scoped.

Recommended contract:

1. `/api/analyze` returns `jobId`
2. add a route that returns loop-profile request progress for that exact `jobId`
   - recommended route:
     - `GET /api/jobs/:id/loop-sessions`
3. the smoke should:
   - upload a unique archive every run
   - poll `/api/jobs/:id`
   - poll `/api/jobs/:id/loop-sessions`
   - wait specifically for its own two rows to reach `scored`, `reused`, or `failed`
   - then fetch detail/profile assertions from the exact returned `sessionLogId`

Do not keep using `/api/loop/sessions?limit=5` as the smoke source of truth.

## Implementation Plan

### Phase 0: Lock Semantics Before Editing

**Goal:** Prevent partial fixes that keep the same broken data model.

**Files**

- Create: `/Users/pureicis/dev/beginning-harness/.ai/tasks/24_beginning-agents_loop-profile-smoke-failure-remediation-plan.md` (this file)
- Reference:
  - `/Users/pureicis/dev/beginning-agents/backend/src/session-logs/repository.ts`
  - `/Users/pureicis/dev/beginning-agents/backend/src/loop/scheduler.ts`
  - `/Users/pureicis/dev/beginning-agents/backend/src/loop/stale-run-reconciler.ts`
  - `/Users/pureicis/dev/beginning-agents/backend/tests/smoke/loop-profile.smoke.test.ts`

**Tasks**

1. Lock that `loop_profiles` are canonical results only, not queue placeholders.
2. Lock that duplicate upload of identical content must not reset a stable `loop_profile`.
3. Lock that `analyzeJobId` is the batch identity to use for request tracking.
4. Lock that smoke acceptance must be based on exact job-scoped rows.

**Verification**

- Reviewer can answer these four questions unambiguously:
  1. Does a duplicate upload create a new canonical profile row? `No`
  2. Can a duplicate upload reset a scored canonical row to `scoring`? `No`
  3. What identifies one upload batch? `analyze job id`
  4. What does deployed smoke poll? `its own job-scoped loop-session rows`

### Phase 1: Introduce Batch-Scoped Loop Request Persistence

**Goal:** Separate loop scoring work from canonical loop-profile results.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/db/schema.ts`
- Add: `/Users/pureicis/dev/beginning-agents/backend/drizzle/<new migration>.sql`
- Add: `/Users/pureicis/dev/beginning-agents/backend/src/loop/request-repository.ts`
- Add tests:
  - `/Users/pureicis/dev/beginning-agents/backend/src/loop/request-repository.test.ts`
  - `/Users/pureicis/dev/beginning-agents/backend/src/db/repository.test.ts` if job relation helpers are added there

**Tasks**

1. Add `loop_profile_requests` table with:
   - `analyzeJobId`
   - `sessionLogId`
   - `status`
   - `harnessRunId`
   - `error`
   - timestamps
   - optional reuse metadata
2. Add request repository helpers:
   - `createRequestsForJob(...)`
   - `listQueuedRequestsForScheduling(...)`
   - `markRequestRunning(...)`
   - `markRequestReused(...)`
   - `markRequestScored(...)`
   - `markRequestFailed(...)`
   - `listRequestsForJob(...)`
3. Add request-row tests for:
   - unique `(analyzeJobId, sessionLogId, scoreVersion)` behavior
   - reused terminal rows
   - queued rows
   - request lookup by job id

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/loop/request-repository.test.ts`
- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend typecheck`

### Phase 2: Stop Seeding Canonical `loop_profiles` As Queue Placeholders

**Goal:** Remove the canonical-state regression path.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/queue/consumer.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/loop/scheduler.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/loop/materializer.ts`
- Modify tests:
  - `/Users/pureicis/dev/beginning-agents/backend/src/queue/consumer.test.ts`
  - `/Users/pureicis/dev/beginning-agents/backend/src/loop/materializer.test.ts`
  - `/Users/pureicis/dev/beginning-agents/backend/src/loop/harness-run-completion.test.ts`

**Tasks**

1. Remove upload-time `upsertProfileForSession(...status:"scoring"...harnessRunId:null)` seeding.
2. On upload completion, create `loop_profile_requests` rows instead.
3. Only update canonical `loop_profiles` when a request reaches:
   - `scored`
   - `failed`
   - or `reused` if you choose to persist reuse visibility there
4. Add tests proving:
   - duplicate upload does not wipe an existing scored canonical profile
   - duplicate upload creates or records request state without mutating the stable result

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/queue/consumer.test.ts src/loop/materializer.test.ts src/loop/harness-run-completion.test.ts`

### Phase 3: Make Scheduling Fair Across Upload Batches

**Goal:** Ensure a fresh upload makes forward progress even when older backlog exists.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/loop/scheduler.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/loop/request-repository.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/queue-dispatch.ts`
- Modify tests:
  - `/Users/pureicis/dev/beginning-agents/backend/src/loop/scheduler.test.ts`
  - `/Users/pureicis/dev/beginning-agents/backend/src/index.test.ts`

**Tasks**

1. Replace pending selection from `loop_profiles.harnessRunId is null` with request-based selection.
2. Implement batch-aware scheduling fairness:
   - recommended: round-robin by `analyzeJobId`
3. Preserve:
   - global cap
   - per-user cap
   - scheduling batch size
4. Add tests for:
   - fresh batch behind older backlog still gets at least one scheduled request
   - one large old batch cannot starve every later upload
   - scheduler never exceeds configured capacity

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/loop/scheduler.test.ts src/index.test.ts`

### Phase 4: Reconcile Unscheduled And Stale Request Rows

**Goal:** Eliminate the `scoring + harnessRunId null` dead state.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/loop/stale-run-reconciler.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/queue-dispatch.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/index.ts`
- Modify tests:
  - `/Users/pureicis/dev/beginning-agents/backend/src/loop/stale-run-reconciler.test.ts`
  - `/Users/pureicis/dev/beginning-agents/backend/src/index.test.ts`

**Tasks**

1. Add request-level stale-state rules:
   - queued with no `harnessRunId` older than threshold
   - running with stale/missing harness run
   - duplicate active request for same session and score version
2. Reconcile stale request rows by:
   - rescheduling when safe
   - failing with durable reason when not safe
3. Keep scheduled cron sweep, but make it operate on request rows first.
4. Add tests proving:
   - unscheduled pending rows older than threshold do not remain stuck forever
   - request rows are terminalized truthfully when recovery is impossible

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/loop/stale-run-reconciler.test.ts src/index.test.ts`

### Phase 5: Expose Job-Scoped Loop Progress

**Goal:** Give smoke tests and operators a precise view of the batch they started.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/routes/jobs.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/db/repository.ts` if job-scoped helper belongs there
- Modify: `/Users/pureicis/dev/beginning-agents/packages/shared/src/schemas.ts`
- Add tests:
  - `/Users/pureicis/dev/beginning-agents/backend/src/routes/jobs.test.ts`
  - `/Users/pureicis/dev/beginning-agents/packages/shared/src/schemas.test.ts`

**Tasks**

1. Add `GET /api/jobs/:id/loop-sessions` or equivalent job-scoped route.
2. Response should include, for each request row:
   - `sessionLogId`
   - `sessionLabel`
   - `status`
   - `error`
   - `harnessRunId`
   - timestamps
   - optional reuse reason
3. Optionally extend `GET /api/jobs/:id` with summary counters:
   - queued
   - running
   - scored
   - failed
   - reused
4. Add tests for:
   - exact batch-scoped row listing
   - stable schema parsing

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/routes/jobs.test.ts`
- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/packages/shared/src/schemas.test.ts`

### Phase 6: Make Loop API Truthful For Unscheduled Work

**Goal:** Stop showing permanent generic `scoring` with no explanation.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/loop/repository.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/routes/loop.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/packages/shared/src/schemas.ts`
- Modify:
  - `/Users/pureicis/dev/beginning-agents/frontend/src/lib/api.ts`
  - `/Users/pureicis/dev/beginning-agents/frontend/src/routes/LoopSessionDetailPage.tsx`
  - `/Users/pureicis/dev/beginning-agents/frontend/src/components/sessions/SessionRow.tsx`
- Modify tests:
  - `/Users/pureicis/dev/beginning-agents/backend/src/routes/loop.test.ts`
  - `/Users/pureicis/dev/beginning-agents/frontend/src/components/sessions/SessionRow.test.tsx`

**Tasks**

1. Derive loop session status from request state, not placeholder canonical rows.
2. Add at least one distinct non-terminal pre-run status:
   - recommended: `queued`
3. Optionally add:
   - `retrying`
   - `stalled`
4. Ensure no row older than threshold remains generic `scoring` with `error = null` unless there is active evidence of running harness work.

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/routes/loop.test.ts`
- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./frontend test -- src/components/sessions/SessionRow.test.tsx src/lib/api.test.ts`

### Phase 7: Rewrite The Loop Smoke To Be Batch-Scoped And Collision-Free

**Goal:** Make deployed smoke a trustworthy regression check.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/tests/smoke/loop-profile.smoke.test.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/tests/smoke/README.md`
- Add test helpers if needed:
  - `/Users/pureicis/dev/beginning-agents/backend/tests/smoke/helpers/*`

**Tasks**

1. Generate unique archive content every run:
   - unique filenames
   - unique `sessionId`s
   - unique message bodies or timestamps
2. Poll the exact upload `jobId`.
3. Poll the new job-scoped loop-sessions route, not `/api/loop/sessions?limit=5`.
4. Assert the exact uploaded request rows reach:
   - `scored`
   - or `reused`
   - or a truthful `failed`
5. Only after exact row success, fetch:
   - session detail
   - aggregate profile

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && SMOKE_BASE_URL=https://beginning-agents-api-dev.dev-726.workers.dev SMOKE_AUTH_BEARER=... pnpm test:smoke -- tests/smoke/loop-profile.smoke.test.ts`

### Phase 8: Repair Existing Live Broken Rows

**Goal:** Clean up the already-bad deployed state so new smoke runs are not blocked by old backlog.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/scripts/retry-loop-profile-runs.ts`
- Add: `/Users/pureicis/dev/beginning-agents/backend/scripts/recover-loop-profile-requests.ts`
- Optional SQL / one-off migration tooling as needed

**Tasks**

1. Add a repair script that finds:
   - old `loop_profiles.status = "scoring"` with `harnessRunId = null`
   - stale request rows with no harness run
2. Decide per row whether to:
   - reschedule
   - mark failed with durable reason
   - mark reused from an existing canonical scored profile
3. Run the repair in dev before relying on smoke results.

**Verification**

- Before repair:
  - query shows stale `scoring` rows with no active work
- After repair:
  - no stale unscheduled rows remain for the smoke user
  - fresh manual smoke starts with a clean target state

## Required Test Coverage

At minimum, add and keep passing:

1. Duplicate upload of identical archive under same user does not reset a scored canonical loop profile.
2. New upload behind old pending backlog still gets at least one request scheduled.
3. Unsheduled queued request older than threshold is repaired by reconciler.
4. Job-scoped loop progress route returns only rows for that analyze job.
5. Smoke test uses unique archive content and exact batch-scoped polling.

## Deployment And Smoke Verification Plan

### Pre-deploy

```bash
cd /Users/pureicis/dev/containerized-cli-harness
pnpm --filter @containerized-cli-harness/sandbox build
pnpm --filter @containerized-cli-harness/runtime build
pnpm --filter @containerized-cli-harness/codex build
pnpm --filter @containerized-cli-harness/harness-core build
pnpm --filter @containerized-cli-harness/harness-repository-drizzle build
```

```bash
cd /Users/pureicis/dev/beginning-agents
pnpm --filter ./backend test
pnpm --filter ./backend typecheck
pnpm --filter ./frontend test
```

### Deploy

```bash
cd /Users/pureicis/dev/beginning-agents/backend
pnpm run deploy
```

### Live Verification

Use the deployed worker:

- `https://beginning-agents-api-dev.dev-726.workers.dev`

Run:

```bash
cd /Users/pureicis/dev/beginning-agents/backend
SMOKE_BASE_URL=https://beginning-agents-api-dev.dev-726.workers.dev \
SMOKE_AUTH_BEARER="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.HOME + "/.beginning-agents/credentials.json", "utf8")).access_token)')" \
pnpm test:smoke -- tests/smoke/loop-profile.smoke.test.ts
```

### Required Live Assertions

1. A fresh unique smoke archive reaches terminal per-session outcomes within the smoke timeout window.
2. Re-running the same smoke does not reset prior scored rows to `scoring`.
3. A fresh unique smoke run behind existing backlog still sees at least one request for its own job advance promptly.
4. No fresh smoke row remains `scoring` with `error = null` and `harnessRunId = null` after the stale threshold.

## Definition Of Done

This task is complete when all of the following are true:

1. Duplicate upload of the same session content no longer resets a canonical scored loop profile to `scoring`.
2. `loop_profiles` are no longer used as the pending scoring queue.
3. Loop scoring work is tracked per upload batch via request rows keyed to `analyzeJobId`.
4. Scheduler fairness guarantees forward progress for fresh uploads even when older backlog exists.
5. Reconciler repairs unscheduled queued work, not only stale `harness_runs`.
6. The deployed loop smoke uses unique content and polls exact batch-scoped rows.
7. The deployed loop smoke passes against `beginning-agents-api-dev` with the same bearer user that previously timed out.
8. Immediately re-running the deployed smoke also passes and does not regress previously terminal rows.

## Recommended Execution Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 8 live repair
8. Phase 7 smoke rewrite final pass
9. deploy and live verification

Rationale:

- Phases 1-4 fix the broken queue semantics.
- Phase 5 gives smoke and operators the right observability surface.
- Phase 8 clears already-corrupted deployed state before the final smoke.
- Phase 7 should be finalized only once the live contract is stable enough to target precisely.
