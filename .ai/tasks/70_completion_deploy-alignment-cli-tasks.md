# 70 - Completion: Deploy Alignment CLI Tasks

> Status: Complete, with original publish naming superseded by Task 71
> Completed: 2026-07-08 UTC
> Repo: `curation-labs/darwinian-minds`
> Related plan: `.ai/tasks/70_deploy-alignment-cli-tasks.md`
> Related follow-ons: `.ai/tasks/71_package_rename_darwinian.md`, `darwinian-services/.ai/tasks/42_server_side_blueprint_deploy_implementation_plan.md`

## 0. Completion Verdict

Task 70 is complete for the CLI-side deploy-alignment work.

The CLI now builds and sends the portable deployment payload the services side needs, emits the canonical generated instructions artifact, and advertises the metered deploy-api chat surface instead of the broken legacy gateway URL.

One detail of the original plan was later superseded: Task 70's publish step was originally phrased as `darwinian-minds@0.6.x`. The later package-rename work in Task 71 moved the final published package identity to `darwinian@0.6.0`. That rename does not reopen Task 70's CLI contract work; it only changes the final package name used by the aligned runtime images.

## 1. Landed Scope

### 1.1 Portable deploy payload (B1)

The portable deploy payload landed in:

- `cli/core/worker-deploy.ts`
- `cli/commands/worker/deploy.ts`
- `test/core-worker-deploy.test.ts`
- `test/contract/deploy-payload.v1.json`

Delivered behavior:

- `worker deploy` resolves bare cards and blueprints CLI-side
- `body.blueprint` is sent for both bare-card and blueprint deploys
- the payload includes:
  - portable full lockfile envelope
  - `config.json`
  - base64 store-export tar with `sha256` and `byteLength`
- payload construction rejects unsupported/file/npm lock entries at the CLI boundary
- the contract fixture is mirrored to the services repo

### 1.2 Instructions artifact (C)

The canonical instructions artifact landed in the write pipeline:

- `cli/core/worker-generator/sync-worker.ts`
- manifest validation/tests around explicit instructions sources
- `test/core-sync-worker.test.ts`

Delivered behavior:

- `drwn write` emits `.agents/drwn/generated/instructions.md`
- explicit manifest instructions are honored when present
- generic skill aggregation remains the fallback
- the generated artifact is tracked as managed content

### 1.3 Metered serving path and worker chat (E)

The serving-path fix landed in:

- `cli/commands/worker/deploy.ts`
- `cli/commands/worker/status.ts`
- `cli/commands/worker/chat.ts`
- `test/commands-worker.test.ts`

Delivered behavior:

- deploy/status now print `${apiBaseUrl}/api/minds/:slug/chat`
- the broken `${gateway}/m/:slug/chat` path is no longer the advertised surface
- `drwn worker chat` talks to the deploy-api metered chat endpoint

### 1.4 Frozen-install vendor prerequisite

The frozen-install side landed in:

- `cli/core/card-install.ts`
- follow-up work around verified vendor trees

This closed the frozen-install prerequisite needed by the new deploy model.

The full `vendorTrees[]` transport replacement described in Task 70 B2 remained an explicit follow-on and was not required for Task 70 completion.

## 2. Evidence of Landing

Representative commits in the CLI repo:

- `88f9b9f` - portable deployment payloads
- `04afe43` - trust verified vendor trees in frozen mode
- `688a51d` - capture deployed mind id and binding coordinates

Current repository state shows the expected surfaced behavior:

- `cli/commands/worker/deploy.ts` sets `body.blueprint`
- `cli/commands/worker/deploy.ts` and `cli/commands/worker/status.ts` print the deploy-api chat URL
- `cli/commands/worker/chat.ts` exists
- `test/contract/deploy-payload.v1.json` exists
- `.agents/drwn/generated/instructions.md` is asserted in `test/core-sync-worker.test.ts`

## 3. Verification Surface

Task 70's landed verification surface includes:

- `test/core-worker-deploy.test.ts`
- `test/core-sync-worker.test.ts`
- `test/commands-worker.test.ts`

The deploy payload tests cover:

- normalized fixture equality for bare-card and blueprint payloads
- binary store-export decode + SHA-256 verification
- seeding a temp store from the generated tar

The worker command tests cover:

- printed chat URL uses deploy-api
- `drwn worker chat` exercises `POST /api/minds/:slug/chat`

## 4. Verification Evidence

Fresh focused verification was re-run on 2026-07-08 after the completion-doc audit.

| Command | Result |
| --- | --- |
| `bun test test/core-worker-deploy.test.ts test/core-sync-worker.test.ts test/commands-worker.test.ts` | Passed: 3 files, 21 tests, 0 failures, 126 assertions. |
| `bun run typecheck` | Passed. |

The fresh test run specifically re-validated the three task-critical surfaces:

- portable deploy payload generation for bare cards and blueprints
- canonical `.agents/drwn/generated/instructions.md` emission
- metered deploy-api chat URL printing and `drwn worker chat` behavior

## 5. Follow-on Note

Task 70's original publish language should now be read together with Task 71:

- Task 70 closed the CLI contract and serving-path work
- Task 71 superseded the final package identity from `darwinian-minds` to `darwinian`

That rename changed the artifact name, not the fact that the Task 70 CLI-side deploy-alignment deliverables landed.
