# Task 23: Beginning Agents Loop Analysis Reliability Remediation Plan

## Objective

Stabilize the Beginning Agents loop-analysis pipeline so session archive uploads produce durable, truthful, and recoverable per-session scoring outcomes across small and large logs.

This plan addresses the three distinct failure classes observed during investigation on May 26, 2026:

1. sandbox startup and session instability during per-session harness scoring
2. stale `queued` / `running` / `scoring` states with no lease-based recovery or DLQ reconciliation
3. large-log transport and timeout failures caused by inline session-log delivery into the sandbox runtime

This plan explicitly excludes archive hygiene hardening in `bgng export sessions`; that is already covered by [22_bgng_export_sessions_upload_ready_hardening_plan.md](/Users/pureicis/dev/beginning-harness/.ai/tasks/22_bgng_export_sessions_upload_ready_hardening_plan.md).

## Investigation Summary

### Confirmed facts

- The uploaded archive `/Users/pureicis/Downloads/beginning-harness-skill-recommendation.tar.gz` contains:
  - `26` real `.jsonl` session logs
  - `27` AppleDouble / hidden metadata entries
- The backend tar extractor accepts the `26` real logs and filters the hidden entries via [archive-entry.ts](/Users/pureicis/dev/beginning-agents/backend/src/analysis/archive-entry.ts:1).
- All `26` real session logs in that archive parse successfully through [parse-jsonl.ts](/Users/pureicis/dev/beginning-agents/backend/src/analysis/parse-jsonl.ts:41).
- The archive upload job itself completed successfully; the failures happen in the follow-on per-session `loop-profile-analysis` harness runs.

### Batch-level evidence

For the newer upload batch created around **May 26, 2026 3:03 PM PDT** for user `STEW7PGd4RYHCp3lEEKxew37RDAzOHPz`:

- `13` sessions reached `scored` / `completed`
- `11` sessions remain `scoring`
  - `6` backed by `harness_runs.status = running`
  - `5` backed by `harness_runs.status = queued`
- `2` sessions reached terminal `failed`
  - one with `cli_exec_timeout`
  - one with `Serialized RPC arguments or return values are limited to 32MiB...`

For the earlier upload batch created around **May 26, 2026 1:16-1:17 PM PDT** for user `6uCl5ovneWfrqyFVwW1jB2IiGbqQklNA`:

- `25` of `26` sessions reached `failed`
- `1` session reached `scored`
- dominant `harness_runs.error`: `Container is starting. Please retry in a moment.`

### Architectural evidence

- Loop upload fans out one harness run per parsed session log in [backend/src/queue/consumer.ts](/Users/pureicis/dev/beginning-agents/backend/src/queue/consumer.ts:134).
- Harness runs use a unique sandbox name per run by default in [backend/src/harness/create-beginning-agents-harness.ts](/Users/pureicis/dev/beginning-agents/backend/src/harness/create-beginning-agents-harness.ts:105).
- The worker is configured for only `10` container instances in [backend/wrangler.jsonc](/Users/pureicis/dev/beginning-agents/backend/wrangler.jsonc:10), but a single upload can enqueue `26` per-session scoring runs immediately.
- Harness queue consumers retry only `3` times before DLQ in [backend/wrangler.jsonc](/Users/pureicis/dev/beginning-agents/backend/wrangler.jsonc:90).
- `harness_runs` already has `processing_lease_id` and `processing_lease_expires_at` columns in [harness-repository-drizzle/schema.ts](/Users/pureicis/dev/containerized-cli-harness/packages/harness-repository-drizzle/src/schema.ts:19), but the harness repository does not use them.
- The Codex operations pipeline already has a working lease pattern in [backend/src/codex/repository.ts](/Users/pureicis/dev/beginning-agents/backend/src/codex/repository.ts:139).
- The harness runtime sends session logs inline through `sessionLogFiles` and writes them one-by-one with `sandbox.writeFile(...)` in [runtime/src/container-cli-base.ts](/Users/pureicis/dev/containerized-cli-harness/packages/runtime/src/container-cli-base.ts:100).
- The Cloudflare Sandbox SDK already supports `mountBucket()` / `unmountBucket()`, but the local `SandboxHandle` abstraction does not expose those methods.
- Completed runs in the same batch reached `duration_ms` as high as `548714`, while the configured runtime timeout is `600000 ms` in [backend/wrangler.jsonc](/Users/pureicis/dev/beginning-agents/backend/wrangler.jsonc:116).

## Root Cause Analysis

### Problem 1: Sandbox Startup and Session Instability

#### Symptoms

- `Container is starting. Please retry in a moment.`
- `Default session initialization was invalidated by a container stop`
- `Network connection lost`

#### Root causes

1. A single upload bursts `N` harness runs into the queue with no admission control.
2. Each harness run acquires its own sandbox by `runId`, maximizing cold starts.
3. The configured container capacity (`max_instances = 10`) is lower than real upload fan-out (`26` in the observed archive).
4. Retryable startup failures are re-driven by queue retries rather than being smoothed by explicit backoff or scheduler-aware throttling.
5. Harness sandbox settings are partly hard-coded (`sleepAfter: "5m"`) and not aligned with existing worker config (`SANDBOX_SLEEP_AFTER = "1m"`).

#### Long-term optimal strategy

- Introduce **explicit harness scoring admission control** so loop-profile runs are scheduled below sandbox capacity with headroom instead of fan-out by upload cardinality.
- Keep per-run sandbox isolation as the default correctness model, but add **capacity-aware scheduling** before considering broader sandbox reuse.
- Make sandbox warm-state behavior configurable and consistent across code and Wrangler config.
- Preserve retryable error classification, but drive retries through a scheduler/backoff model rather than immediate cold-start stampedes.

### Problem 2: Stale Harness and Loop Lifecycle States

#### Symptoms

- `loop_profiles.status = scoring` while `harness_runs.status = queued`
- `loop_profiles.status = scoring` while `harness_runs.status = running` for more than an hour
- permanently queued rows after retry exhaustion
- no automatic path from stale harness state to truthful loop UI state

#### Root causes

1. `harness_runs` has lease columns, but harness execution still uses `markRunning()` with no atomic lease acquisition.
2. There is no heartbeat or lease renewal during long-running phases.
3. Retryable failures call `repository.requeue()` and then rethrow; when the queue exhausts `max_retries = 3`, the row can remain `queued` indefinitely and the message goes to DLQ.
4. There is no DLQ consumer, stale-run sweeper, or reconciliation job for `harness_runs`.
5. `loop_profiles` persists a placeholder `scoring` row at enqueue time, but there is no recovery process that re-derives loop state from harness state once the run goes stale.
6. `loop_profiles` status space is too coarse (`scored | scoring | failed`) to represent `queued`, `retrying`, `stalled`, or `retry_exhausted`.
7. A manual retry path exists in [backend/scripts/retry-loop-profile-runs.ts](/Users/pureicis/dev/beginning-agents/backend/scripts/retry-loop-profile-runs.ts:1), but it only targets failed candidates and is not part of the runtime lifecycle.

#### Long-term optimal strategy

- Promote `harness_runs` to a **leased execution model** equivalent to `codex_operations`.
- Add **heartbeat / lease renewal** during startup, file mount, CLI exec, and output read phases.
- Add a **reconciler** that converts stale `running` / `queued` harness rows into either requeued work or terminal failures with durable reasons.
- Add **DLQ-aware recovery** so retry-exhausted harness runs do not remain forever `queued`.
- Make loop list/detail status **derive from both `loop_profiles` and `harness_runs`**, not from placeholder `loop_profiles.status` alone.
- Extend operator tooling to cover stale `queued` / `running` cases, not only already-failed rows.

### Problem 3: Large-Log Transport and Timeout Failures

#### Symptoms

- `Serialized RPC arguments or return values are limited to 32MiB, but the size of this value was: 43873247 bytes.`
- `cli_exec_timeout`
- large logs that neither fail cleanly nor complete within the current execution budget

#### Root causes

1. Session logs are fetched from R2 as full strings and embedded into `HarnessRuntimeInput.sessionLogFiles`.
2. The runtime then pushes those strings through `sandbox.writeFile(...)`, which creates serialization overhead large enough to exceed Cloudflare Sandbox transport limits.
3. The current sandbox abstraction exposes only `writeFile`, `readFile`, and `exec`, even though the underlying SDK supports bucket mounts.
4. Only the CLI exec phase has a timeout; `ensureAuth`, `writeFile`, `readFile`, and other mount phases have no phase-specific timeout budget.
5. The loop-profile task prompt does not instruct shell-based triage of large logs, so Codex spends near the full `600000 ms` budget on some successful runs.
6. Existing size guard env vars (`MAX_CODEX_JSON_BYTES`, `MAX_CODEX_PROMPT_CHARS`) apply only to the legacy `/api/codex/operations` path, not to the harness loop-analysis path.

#### Long-term optimal strategy

- Replace inline session-log transport with an **asset-based mount path** for harness runs.
- Extend the sandbox abstraction to support **bucket mounts** or another large-object path that avoids marshaling full log contents through the RPC boundary.
- Introduce **size-aware execution policies**:
  - small logs may continue using inline writes temporarily
  - medium and large logs must use the asset path
  - extremely large logs need explicit policy and operator-visible failure reasons
- Add **phase-specific timeouts** and make the harness timeout configurable via the harness path, not only the Codex path.
- Update the loop-profile analyzer prompt so the model triages large logs with shell tools instead of treating them as linear reading tasks.

## Recommended Remediation Order

1. **Lifecycle foundation first**
   - lease acquisition
   - stale-run reconciliation
   - DLQ / retry exhaustion handling
   - truthful list/detail state
2. **Startup and concurrency control second**
   - capacity-aware scheduling
   - retry backoff
   - sandbox configuration cleanup
3. **Large-log transport redesign third**
   - asset-based mounting
   - size-aware routing
   - timeout / prompt tuning

Rationale:

- Problems 1 and 3 will keep producing bad states unless Problem 2 gives the system a truthful and recoverable lifecycle.
- Once stale-state handling exists, concurrency and transport changes can be rolled out with lower operational risk.

## Implementation Plan

### Phase 0: Baseline and Instrumentation

**Goal:** Make the failure modes measurable before behavior changes.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/queue-dispatch.ts`
- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/harness-core/src/orchestrator.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/harness/create-beginning-agents-harness.ts`
- Test: `/Users/pureicis/dev/beginning-agents/backend/src/index.test.ts`
- Test: `/Users/pureicis/dev/containerized-cli-harness/packages/harness-core/src/orchestrator.test.ts`

**Tasks**

1. Add structured logging around harness-run lifecycle transitions:
   - queued -> lease-acquired
   - lease-renewed
   - requeued with retryable error
   - failed terminally
   - completed
2. Emit run metadata needed for diagnosis:
   - `runId`
   - `attemptCount`
   - `sessionLogIds`
   - sandbox name
   - phase name
   - elapsed duration
3. Add tests that assert retryable failures preserve a structured retry path.

**Verification**

- `cd /Users/pureicis/dev/containerized-cli-harness && pnpm --filter @containerized-cli-harness/harness-core test`
- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/index.test.ts`

### Phase 1: Lease-Based Harness Run Lifecycle

**Goal:** Eliminate stale `running` / `queued` rows and give every harness run a recoverable owner.

**Files**

- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/harness-core/src/types.ts`
- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/harness-core/src/orchestrator.ts`
- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/harness-repository-drizzle/src/repository.ts`
- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/harness-repository-drizzle/src/repository.test.ts`
- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/harness-core/src/orchestrator.test.ts`
- Optional migration if needed: `/Users/pureicis/dev/containerized-cli-harness/packages/harness-repository-drizzle/migrations/*`

**Tasks**

1. Replace `markRunning(runId)` with a `startRun(runId, now, { leaseId, leaseDurationMs })` compare-and-swap API, modeled after [codex/repository.ts](/Users/pureicis/dev/beginning-agents/backend/src/codex/repository.ts:139).
2. Ensure only one delivery can own a harness run at a time.
3. Add `renewLease(runId, leaseId, now)` and `clearLeaseOnCompleteOrFail(...)`.
4. Add a `requeue(runId, leaseId, errorMsg)` variant that only the current lease holder can apply.
5. Update orchestrator tests to prove:
   - second delivery cannot steal an active lease
   - retryable failures clear or refresh the lease correctly
   - completed and failed runs release the lease

**Verification**

- `cd /Users/pureicis/dev/containerized-cli-harness && pnpm --filter @containerized-cli-harness/harness-repository-drizzle test`
- `cd /Users/pureicis/dev/containerized-cli-harness && pnpm --filter @containerized-cli-harness/harness-core test`

### Phase 2: Stale-Run Reconciliation and Retry Exhaustion Handling

**Goal:** Make retry exhaustion and abandoned runs converge to truthful states instead of permanent `scoring` / `queued`.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/queue-dispatch.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/loop/retry-recovery.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/scripts/retry-loop-profile-runs.ts`
- Add: `/Users/pureicis/dev/beginning-agents/backend/src/loop/stale-run-reconciler.ts`
- Add tests: `/Users/pureicis/dev/beginning-agents/backend/src/loop/stale-run-reconciler.test.ts`
- Modify tests: `/Users/pureicis/dev/beginning-agents/backend/src/routes/loop.test.ts`

**Tasks**

1. Define canonical stale-state rules:
   - `queued` with exhausted retries and no active delivery
   - `running` with expired lease
   - `scoring` loop profile whose harness run is terminal or missing
2. Add a reconciler that:
   - requeues stale-but-retryable runs when allowed
   - marks retry-exhausted runs terminally failed with a durable reason
   - updates corresponding `loop_profiles`
3. Decide and implement a final state for exhausted retryable startup failures:
   - recommended: `loop_profiles.status = failed`
   - error prefix like `retry_exhausted: sandbox_startup_unavailable`
4. Extend `retry-loop-profile-runs.ts` so it can target stale `queued` and `running` candidates, not only already-failed candidates.
5. Decide whether to add a dedicated admin route or keep recovery as a script plus scheduled reconciler.

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/routes/loop.test.ts`
- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/loop/stale-run-reconciler.test.ts`

### Phase 3: Capacity-Aware Harness Scheduling

**Goal:** Prevent cold-start stampedes by keeping per-batch harness concurrency below real sandbox capacity.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/queue/consumer.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/harness/create-beginning-agents-harness.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/wrangler.jsonc`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/wrangler.generated.jsonc` only via local config tooling, never by hand in committed source
- Add tests: `/Users/pureicis/dev/beginning-agents/backend/src/queue/consumer.test.ts`
- Modify tests: `/Users/pureicis/dev/beginning-agents/backend/src/harness/create-beginning-agents-harness.test.ts`

**Tasks**

1. Introduce a scheduling layer for loop-profile fan-out:
   - recommended initial shape: enqueue only up to a configured parallelism window per upload
   - enqueue the next session when a prior session reaches a terminal harness state
2. Add a harness scheduling config:
   - target concurrency
   - per-user cap
   - optional batch cap
3. Remove the hard-coded `sleepAfter: "5m"` and use config consistently.
4. Decide whether sandbox affinity via `runtime_config.sandbox_key` is in scope:
   - if adopted, restrict it to serialized reuse with workspace reset
   - do not allow concurrent runs to share a sandbox key
5. Add tests proving that a 26-session upload does not emit 26 simultaneous harness-run starts.

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/queue/consumer.test.ts`
- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/harness/create-beginning-agents-harness.test.ts`

### Phase 4: Large-Log Transport Redesign

**Goal:** Stop sending large session logs through inline `sessionLogFiles` and remove the `32MiB` RPC-size ceiling as a primary failure mode.

**Files**

- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/runtime/src/types.ts`
- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/runtime/src/container-cli-base.ts`
- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/codex/src/codex-cli-runtime.test.ts`
- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/runtime/src/container-cli-base.test.ts`
- Modify: `/Users/pureicis/dev/containerized-cli-harness/packages/sandbox/src/types.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/harness/cloudflare-sandbox-handle.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/harness/create-beginning-agents-harness.ts`
- Add: `/Users/pureicis/dev/beginning-agents/backend/src/harness/session-log-assets.ts`
- Add tests: `/Users/pureicis/dev/beginning-agents/backend/src/harness/session-log-assets.test.ts`

**Recommended design**

- Extend the runtime input contract so session logs can be provided as:
  - inline file contents for small files
  - mounted asset references for large files
- Extend `SandboxHandle` with the mount capability needed for production:
  - `mountBucket(...)`
  - `unmountBucket(...)`
- Implement a backend asset manifest that stages session logs in bucket-backed storage and mounts them read-only into the sandbox during `mountPreExecAssets(...)`.
- Keep inline delivery only below a conservative threshold during rollout.

**Tasks**

1. Add a size classifier in the harness session-log resolver.
2. Define a safe inline threshold based on observed failures:
   - recommended initial threshold: comfortably below the observed 22 MB failure, not near it
3. Implement a mount-based path for logs above the inline threshold.
4. Add tests for:
   - small logs stay inline
   - large logs become mounted assets
   - bucket mount cleanup always runs
5. Add explicit failures for unsupported oversize payloads instead of silent hangs.

**Verification**

- `cd /Users/pureicis/dev/containerized-cli-harness && pnpm --filter @containerized-cli-harness/runtime test`
- `cd /Users/pureicis/dev/containerized-cli-harness && pnpm --filter @containerized-cli-harness/codex test`
- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/harness/create-beginning-agents-harness.test.ts`

### Phase 5: Timeout and Prompt Tuning for Large Sessions

**Goal:** Reduce avoidable `cli_exec_timeout` failures without hiding deeper transport problems.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/harness/create-beginning-agents-harness.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/env.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/wrangler.jsonc`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/harness/task-templates/loop-profile-analysis.ts`
- Modify tests: `/Users/pureicis/dev/beginning-agents/backend/src/harness/task-templates/loop-profile-analysis.test.ts`

**Tasks**

1. Replace the accidental harness reliance on `CODEX_TIMEOUT_MS` with explicit harness runtime timeout config.
2. Add phase-aware timeout configuration if needed:
   - sandbox startup / mount
   - CLI exec
   - output read
3. Make timeout policy size-aware where justified.
4. Update the loop-profile prompt to explicitly encourage shell triage on large logs:
   - `head`
   - `tail`
   - `rg`
   - `jq`
   - `wc`
5. Preserve strict JSON output requirements while reducing unnecessary model work on large files.

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/harness/task-templates/loop-profile-analysis.test.ts`
- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend typecheck`

### Phase 6: User-Facing Truthfulness and Recovery UX

**Goal:** Ensure the loop UI reflects the real backend state and exposes actionable failure information.

**Files**

- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/routes/loop.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/backend/src/loop/repository.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/packages/shared/src/schemas.ts`
- Modify: `/Users/pureicis/dev/beginning-agents/frontend/src/components/sessions/SessionRow.tsx`
- Modify: `/Users/pureicis/dev/beginning-agents/frontend/src/routes/LoopSessionDetailPage.tsx`
- Modify tests:
  - `/Users/pureicis/dev/beginning-agents/backend/src/routes/loop.test.ts`
  - `/Users/pureicis/dev/beginning-agents/frontend/src/components/sessions/SessionRow.test.tsx`

**Tasks**

1. Decide whether the loop API should expose:
   - `queued`
   - `running`
   - `retrying`
   - `stalled`
   as derived statuses, even if `loop_profiles` keeps a coarser stored enum.
2. Ensure failed rows always surface `errorSummary`.
3. Ensure stale or retrying rows do not display a misleading generic `"Pending"` without context.
4. Add detail-page behavior for stale/retrying sessions so users can distinguish:
   - waiting to start
   - actively processing
   - retrying after transient sandbox failure
   - terminal failure

**Verification**

- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./backend test -- src/routes/loop.test.ts`
- `cd /Users/pureicis/dev/beginning-agents && pnpm --filter ./frontend test -- src/components/sessions/SessionRow.test.tsx`

## Suggested Rollout Strategy

1. Ship Phase 1 and Phase 2 first behind internal verification only.
2. Re-run the problematic archive batch after lifecycle and reconciliation land.
3. Ship Phase 3 next to reduce startup churn and retry pressure.
4. Ship Phase 4 and Phase 5 together once the transport path is ready.
5. Ship Phase 6 after the backend state model is trustworthy.

## Verification Matrix

### Targeted regression inputs

Use at minimum:

- the current polluted archive:
  - `/Users/pureicis/Downloads/beginning-harness-skill-recommendation.tar.gz`
- a small clean archive with 1-3 logs
- a medium archive with ~5-10 logs
- a synthetic archive with one inline-safe log and one mount-required large log

### Required checks

1. No upload produces permanent `scoring` rows without an active harness lease.
2. Retry-exhausted sandbox startup failures end in an honest terminal state or are operator-recoverable through a defined path.
3. Large logs do not pass through the inline `writeFile` path once above the configured threshold.
4. Completed run durations have healthy headroom under the configured timeout.
5. Queue / DLQ behavior is reflected truthfully in `loop_profiles` and loop API responses.

### End-to-end commands

```bash
cd /Users/pureicis/dev/containerized-cli-harness
pnpm test
pnpm typecheck
```

```bash
cd /Users/pureicis/dev/beginning-agents
pnpm test
pnpm typecheck
pnpm --filter ./backend test:worker
```

Manual verification:

1. Upload the known problematic archive through the frontend.
2. Confirm the upload job completes.
3. Confirm harness runs do not exceed the configured concurrency window.
4. Confirm no session remains indefinitely `scoring`.
5. Confirm large-log sessions either complete through the asset path or fail explicitly with a truthful oversize policy message.

## Definition of Done

This remediation is complete when:

1. Batch fan-out no longer overwhelms the sandbox container pool.
2. Harness runs use leases and stale rows are automatically reconciled.
3. Retry exhaustion cannot leave loop sessions permanently `queued` or `scoring`.
4. Large session logs no longer rely on inline sandbox RPC writes above the safe threshold.
5. The loop API and frontend expose truthful run state and actionable failure summaries.
6. The known problematic archive can be uploaded repeatedly without reproducing the current mix of stuck `scoring`, silent `queued`, and transport-limit failures.
