# ABOUTME: Completion evidence for Task 77's first supported project Worker contract and controlled consumer rollout.
# ABOUTME: Records implementation commits, published Blueprint identity, consumer reset results, verification, and deferred operator prerequisites.

# Task 77 Completion: Worker Roots and Project Isolation

**Status:** Completed
**Completed:** 2026-07-13
**Architecture:** `.ai/analyses/116_drwn-cli-card-worker-target-architecture.md`
**Plan:** `.ai/tasks/77_drwn-cli-worker-roots-and-defaults-remediation-plan.md`
**Implementation branch:** `feat/task-77-clean-worker-contract`
**Execution model:** Primary checkout only; no isolated worktree

---

## Outcome

Task 77 ships the first supported public project contract:

- Cards compose into one ordered Blueprint closure.
- A plain Card is a degenerate one-Card Worker.
- A project installs alternative Worker roots and selects zero or one active root.
- Project config and lock use namespaced schema V1 formats.
- `write` is a pure projection of declared project state.
- Project capabilities do not inherit machine defaults.
- Prototype project formats, migration adapters, command aliases, and `install --no-apply` are absent.
- The existing remote deploy payload remains V1 and unchanged.
- Local project locks emitted by this contract require `drwn >= 0.8.0`.

The 0.8.0 version floor is a feature-contract floor. It is not a remediation for Notion OAuth or Momentic process startup failures; those remain independent operator/runtime prerequisites.

## Implementation Commits

| Commit | Scope |
|---|---|
| `4810f97` | Define namespaced project config V1 |
| `51ed046` | Persist namespaced Worker root lock graph V1 |
| `520d0a8` | Select one root and expand its ordered closure |
| `ab4f124` | Materialize one aggregate bundle per root |
| `0ba0782` | Keep selection and requirements immutable during write |
| `c6fa3e8` | Commit config and lock through crash-recoverable transactions |
| `a349da0` | Ratify the separate ambient MCP collision policy boundary |
| `83646b1` | Expose only the supported project command surface |
| `137d9d2` | Report one declared project state and ambient observations |
| `b0d2399` | Remove machine capability inheritance from project output |
| `66ebdb9` | Capture only the selected Worker closure |
| `0384500` | Deploy and seed one selected root closure without changing remote V1 |
| `113245d` | Publish the first supported Worker contract documentation |
| `1574a89` | Gate the 0.8.0 release and remove remaining prototype readers/adapters |

The release commit also removed the unused `migrate-vendor` adapter, made hook lock attribution reject prototype lock shapes silently, and routed `committedSurfaces` through the strict project config loader.

## Published Aggregate Blueprint

The controlled rollout published this immutable aggregate:

| Field | Value |
|---|---|
| Card | `@darwinian/darwinian-cards-worker@1.0.0` |
| Kind | `blueprint` |
| Remote | `https://github.com/curation-labs/darwinian-cards-worker.git` |
| Visibility | Public |
| Main/tag commit | `aa90e0a7d3dc9c92b08373295de26d720bf3939e` |
| Tag | `v1.0.0` |
| Store tree SHA | `af9f671d4f91f1867becef68de83160757b3a088` |
| Integrity | `sha256-899c47c836104ef961d1f5ed319acd78f2cb21c4ab80322daefd8b3241cf36a4` |

Ordered `composedFrom`:

1. `@remyjkim/fal@^0.2.0` -> `@remyjkim/fal@0.2.1`
2. `@darwinian/operator@^1.0.0` -> `@darwinian/operator@1.0.1`
3. `@leeminseung/notion@0.1.0` -> `@leeminseung/notion@0.1.0`

The Blueprint contains no credentials. The Fal definition retains only `${FAL_AI_API_KEY}` and Notion retains OAuth metadata; authentication remains local to the operator and target runtime.

Source doctor, source closure resolution, immutable publish, Store validation, current-Store clean-project resolution, and isolated-home Git-origin resolution all passed.

## Consumer Reset

Consumer: `/Users/pureicis/dev/darwinian-cards`

The parent remains deliberately non-Git. Its two independent nested repositories were not used as a parent repository.

### Prototype snapshot

The non-secret prototype declaration before reset was:

```json
{
  "version": 1,
  "cards": [
    "@remyjkim/fal@^0.2.0",
    "@darwinian/operator@^1.0.0",
    "@leeminseung/notion@0.1.0"
  ]
}
```

Its prototype lock selected three flat Cards and required `drwn >= 0.3.0`. A temporary rollback archive of `.agents/drwn` and managed target surfaces was created outside the project before reset. Card sources and machine Store repositories were preserved.

### Supported state

The controlled reset removed the prototype config, lock, and generated state, then ran supported init, apply, and write. The resulting declaration is:

```json
{
  "schema": "drwn.project-config",
  "schemaVersion": 1,
  "workers": ["@darwinian/darwinian-cards-worker@1.0.0"],
  "activeWorker": "@darwinian/darwinian-cards-worker"
}
```

The lock is `drwn.project-lock` V1 with `store.minDrwnVersion: "0.8.0"`, one Blueprint root, and exactly four reachable Cards: aggregate, Fal, Operator, and Notion.

Post-write assertions:

- one generated root: `@darwinian/darwinian-cards-worker`;
- 27 aggregate skills with per-Card provenance;
- declared MCPs: `fal` and `notion`;
- prior machine-default skill leakage removed from project `.claude/skills` and `.codex/skills`;
- second `write --dry-run --json`: 0 changes, 0 warnings;
- status projection current with no issues;
- doctor: no config, MCP drift, hook, generated-file, broken-symlink, or stale-skill issues;
- ambient Notion entries reported separately for Codex and Cursor as same-ID user-home observations;
- parent `git rev-parse`: not a Git repository;
- credential-pattern scan of managed project config and MCP files: no matches.

## Independent Repository Updates

Both repositories use local feature branch `docs/worker-blueprint-flow` and are clean:

| Repository | Commit | Result |
|---|---|---|
| `mind-tools` | `69fc879` `docs: document Worker Blueprint usage` | Replaced removed Card mutation syntax with create/compose/publish/apply Blueprint flow |
| `mind-starter` | `6ed58d0` `docs: update mind starter activation flow` | Documented plain Card as one-Card Worker and Blueprint composition for custom content |

Both Card source doctor checks returned `ok:true`. These commits remain local for review; they were not pushed as part of the CLI branch.

## Verification Evidence

### TDD and focused regressions

- Release-gate tests were written red before implementation.
- Strict config/lock and migration-adapter boundary: 43 pass, 0 fail.
- Final targeted Bash and deploy set: 11 pass, 0 fail across 6 files.
- Project V1 schema, lock, transaction, singular selection, aggregate materialization, pure write, capture, deploy, docs, and command-surface suites all passed in the complete run.

### Complete CLI suite

Pre-rollout and post-rollout complete runs produced the same result:

```text
1382 pass
5 skip
0 fail
5363 expect() calls
1387 tests across 264 files
```

### Release and package gates

`bun run verify:release --json` returned `ok:true`, no warnings, and all nine checks green:

- Bun test;
- typecheck;
- hardcoded path scan;
- package metadata;
- documentation presence;
- project Worker contract;
- Store export security;
- schema package coupling (`drwn-catalog-schema@^0.1.0` -> `0.1.0`);
- npm package contents.

Additional gates:

- `bun run typecheck`: pass;
- `bun run docs:build`: production build pass;
- `bun run verify:bridge`: 94 pass, 0 fail, then build and `npm pack --dry-run` pass;
- `git diff --check`: pass;
- forward docs and production source scans contain no unsupported project syntax except explicit rejection tests and frozen remote/machine contracts.

### Smoke and E2E

- Published-Store clean project: V1 init, apply, closure inspection, and write dry-run passed.
- Isolated home/Store smoke: aggregate fetched from public Git remote, three dependency repositories seeded, full write passed, doctor clean, aggregate lock origin `git` at commit `aa90e0a`.
- Consumer live projection: init/apply/write/status/doctor/idempotency passed.
- Bash collaboration scenarios: passed.
- Remote deploy payload and inactive-root guards: passed against fixtures; no live deployment was attempted.

## External Prerequisites and Skips

The five suite skips are unchanged and environment-gated:

1. real Windows DPAPI backend on macOS;
2. real BeginningDB CAS contract;
3. real BeginningDB append/placement contract;
4. real BeginningDB provision/sync/checkpoint journey;
5. live `dm-card-base` GitHub catalog collaboration test.

Operator/runtime observations:

- Codex `0.144.1` has hosted Notion enabled at `https://mcp.notion.com/mcp`; OAuth login was not performed by this task.
- `ntn 0.16.0` is installed; its API credential remains operator-local.
- Momentic is not installed, so its startup was not exercised.
- `FAL_AI_API_KEY` remains operator-local and was not read or written.
- Live Worker deployment was skipped because no explicit deployment environment/credential authorization was supplied.

These are not Task 77 or `drwn` version failures.

## Residual and Deferred Work

- A fresh init without `--no-default-catalogs` currently attempts the packaged `dm-cards-catalog-v1` URL, which returned repository-not-found during one source-validation fixture. The controlled and isolated rollout fixtures used `--no-default-catalogs`; Blueprint resolution itself passed via Store and explicit Git remote. Catalog discovery is separate from the Worker contract and requires follow-up in the appropriate catalog task.
- The public aggregate remote alone does not make all three member repositories discoverable to an empty Store. The isolated smoke deliberately seeded only the three dependency repositories and fetched the aggregate from Git. Catalog publication/portable transfer remains separate work.
- Task 80 machine schema/profile work remains unimplemented. Current machine defaults and curation behavior are intentionally unchanged.
- Tasks 81 and 82 remain unratified/proposed.
- Task 83 remains the separately approved ambient MCP collision-policy implementation and was not folded into Task 77.

## Acceptance Status

All Task 77 acceptance criteria are satisfied: strict namespaced local V1 schemas, root/member closure integrity, one active Worker, aggregate materialization, pure write, project/machine isolation, supported command surface, unchanged remote deploy V1, fail-closed Store export, controlled consumer reset, published Blueprint evidence, and complete regression/release gates.
