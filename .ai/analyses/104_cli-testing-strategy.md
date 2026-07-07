# ABOUTME: Testing strategy for the drwn CLI post-Workers-migration — the test layers, the cross-repo deploy contract, staging integration, and flake management.
# ABOUTME: Companion to analyses 100/101 (Workers architecture) and the services target-architecture doc; defines how we prove the CLI correct locally and against studio-deployment.

# Analysis 104 — drwn CLI Testing Strategy

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Draft — strategy; actionable build items in §6
**References**: [.ai/analyses/100_workers-cli-target-architecture-and-decisions.md, .ai/analyses/101_workers-cli-implementation-strategy.md, .ai/tasks/69_worker-migration-unified-sequential-plan.md, test/helpers.ts, cli/core/worker-deploy.ts, scripts/verify-release-readiness.ts, darwinian-services/.ai/tasks/39_workers_cli_alignment_target_architecture.md]

---

## 1. Purpose

The Workers migration (task 69) shipped with a strong unit/command suite (1128 pass) but exposed two testing blind spots: (a) the CLI ⟷ studio-deployment **deploy contract** is untested — `worker deploy` was only verified to *construct* a payload, never that the server accepts it; and (b) there is no committed **operator-level smoke** exercising the real `drwn` binary end-to-end. This doc defines the layered strategy, the cross-repo contract, staging integration, and how we handle flakes, and lists concrete build items.

## 2. Current landscape

- **Unit + command tests** (`bun test`, ~1128 pass, 227 files): core logic + command behavior via `runAgentsCli` (spawns `bun run cli/index.ts` against an isolated fixture — `test/helpers.ts:72,278`). Strong and fast.
- **Release gate** (`bun run verify:release --json`): bun test + typecheck + hardcoded-path scan + packaging/docs/schema checks.
- **Ad-hoc E2E**: a one-off bash script verified the merged CLI end-to-end (rename/descope/blueprint/composition/deploy) — 21/21 — but it lives in scratch, not the repo.
- **Gaps**: no committed operator smoke; no CLI↔server contract test; no staging integration; one known non-deterministic flake (`commands-write-watch`, fs-watch timing, from task 68).

## 3. The test layers (pyramid)

| Layer | What it proves | Mechanism | Runs |
|---|---|---|---|
| **L1 Unit** | Core logic (manifest validation, composedFrom expansion, diffCards, deploy-payload builder, vendor/lock) | `bun test` pure functions | every commit / CI |
| **L2 Command** | A `drwn` subcommand's behavior + exit/output | `runAgentsCli` against isolated fixture | every commit / CI |
| **L3 Operator smoke** | The real binary drives a realistic multi-command workflow on a clean store | committed bash smoke, isolated `AGENTS_*` env | CI (post-build) + pre-release |
| **L4 Contract** | The CLI's deploy payload matches what studio-deployment's deploy-api ingests | shared contract fixture asserted on both sides | CI in both repos |
| **L5 Staging integration** | A real deploy against staging materializes + serves | token-gated live smoke | manual / nightly, gated |

L1/L2 exist and are strong. L3–L5 are the build-out.

## 4. Cross-repo deploy contract (L4) — the priority

The single highest-value addition. The current implementation sends the base `{cardRef,name,model,secrets?}` plus, for a blueprint, a thin `body.blueprint = { members:[{name,version,integrity,treeSha?,requested}], governance:{...} }`. That is the broken pre-contract shape. The corrected B1 contract is a JSON-only bridge:

```ts
body.blueprint = {
  contractVersion: 1,
  materialization: "lockfile-store-export",
  entrypoint: { requested: string, name: string, kind: "card" | "blueprint" },
  lockfile: { lockfileVersion: 5, store?: { minDrwnVersion?: string }, cards: PortableCardLockEntry[] },
  config: ProjectConfig,
  governance: BlueprintGovernance | null,
  storeExport: {
    kind: "drwn-store-export-tar",
    compression: "none",
    encoding: "base64",
    sha256: string,
    byteLength: number,
    bytesBase64: string
  }
}
```

`body.blueprint` is present for both bare-card and blueprint deploys after B1. A bare card is the same shape with one lock entry and `governance: null`. A blueprint includes the blueprint lock entry first, followed by expanded members. The `lockfile` is a portable lockfile envelope: for each `store`/`git` entry, `path` is normalized to `drwn/extracted/<treeSha>`; deploy-api denormalizes those paths inside the sandbox before writing the real `.agents/drwn/card.lock`.

Strategy — a **shared, versioned contract fixture** (canonical example request bodies for bare-card and blueprint deploys), asserted from both sides:
- **CLI side**: add `test/contract/deploy-payload.v1.json` with `contractVersion`, a bare-card example, and a blueprint example. A test builds real payloads via the new deploy-payload builder, normalizes binary fields (`storeExport.sha256`, `storeExport.byteLength`, `storeExport.bytesBase64`) to sentinels, and asserts deep equality against the fixture. A separate binary test decodes the real generated tar, verifies SHA-256/byte length, and proves `seedStore()` accepts it.
- **Server side** (in studio-deployment): mirror the fixture byte-for-byte at `studio-deployment/workers/deploy-api/test/fixtures/deploy-payload.v1.json`. The deploy-api ingest test parses the mirrored fixture and asserts every field it depends on is present/typed, including portable lockfile path denormalization and the `storeExport` checksum/length checks. **Harness pattern (verified):** deploy-api tests are plain Node vitest and **must not import `worker.ts`** (it pulls `cloudflare:workers`). Extract the `POST /api/deployments` handler into a `createDeploymentsRoute()` factory (mounted via `app.route`, driven by `app.fetch(req, env)` with a fake `DB`/`DEPLOY_WF`) — the same shape as the shipped `createPublicChatRoute()`/`finalize.ts` statement-builders. Command: `pnpm deploy-api:test` (from the `darwinian-services` monorepo root). See services doc 41 §1.
- **Fixture ownership**: the CLI repo fixture is the canonical authoring source. Because these are separate repos, services carries a vendored mirror rather than importing from a live checkout. Contract-changing PRs must update both files in the same cross-repo change set and keep `contractVersion` aligned. The local sync command is:
  ```bash
  cp /Users/pureicis/dev/darwinian-minds/test/contract/deploy-payload.v1.json \
    /Users/pureicis/dev/darwinian-services/studio-deployment/workers/deploy-api/test/fixtures/deploy-payload.v1.json
  shasum -a 256 /Users/pureicis/dev/darwinian-minds/test/contract/deploy-payload.v1.json \
    /Users/pureicis/dev/darwinian-services/studio-deployment/workers/deploy-api/test/fixtures/deploy-payload.v1.json
  ```
  The hashes must match during review. If the payload shape changes, create `deploy-payload.v2.json`, bump `contractVersion`, and update both test suites to read v2.

This directly closes the gap behind the user's question ("does the CLI workflow work with staging"): the contract test proves shape-compatibility continuously without a live deploy.

## 5. Operator smoke (L3) and staging (L5)

**L3 — commit the operator smoke.** Formalize the one-off verification into `test/smoke/worker-cli-smoke.sh` (or a `bun` driver reusing `test/helpers.ts`). It sets up an isolated `AGENTS_REPO_ROOT/HOME_DIR/DIR` fixture and asserts, against the real binary:
- rename: `drwn worker` present; `drwn mind`/`drwn cloud` gone;
- descope: `card source add-persona` gone; publish rejects `persona`;
- blueprint round-trip: `worker new → compose --add → publish`; compose on a non-blueprint refused;
- consumption: `card apply <blueprint>` → `card.lock` contains blueprint + expanded member;
- deploy: `worker deploy <blueprint>` resolves members CLI-side.
Gotchas encoded from the first run: `drwn init` needs `--minimal` outside a TTY; every command needs a valid `registry/config.json` fixture.

**L5 — staging integration smoke (token-gated).** Given a staging DAH token, run a real bare-card `worker deploy` against staging, poll to `ready`, then hit the served endpoint. **First smoke DONE (2026-07-07) — verified (services doc 41 §2):** deploy reached `ready`; the printed `${gateway}/m/{slug}/chat` **404s** (`no active deployment`) because the gateway's `user_id='local'` filter can't see DAH-owned workers; the real metered CLI-reachable path is deploy-api `POST ${apiBaseUrl}/api/minds/:slug/chat` (→ engine, `observe_only`). The fix is CLI task 70 §E. Codify this smoke as the recurring L5 job (deploy → assert `ready` → assert the metered path serves, not the gateway `/m/`). A **blueprint** deploy only works once the corrected contract (full lock + config + store-export/vendored bytes — CLI task 70 §B1/B2) and the deploy-api ingest (services 41 §B) land; until then assert it as a known gap. Never commit tokens; gate on a secret; fail-soft (skip) when absent.

## 6. Build items (actionable)

1. **L4 contract test + mirrored fixture** — `test/contract/deploy-payload.v1.json` (`contractVersion`, bare-card + blueprint examples, binary fields normalized to sentinels); CLI test asserting normalized built payloads equal it; binary sanity test proving the real tar decodes/seeds; mirrored server-side assertion in studio-deployment.
2. **L3 committed smoke** — `test/smoke/worker-cli-smoke.sh` + a CI job that builds and runs it.
3. **L5 staging smoke** — a gated workflow (manual/nightly) with the bare-card-works / blueprint-known-gap assertions.
4. **Flake remediation** — `commands-write-watch` fs-watch timing flake: first attempt a deterministic fix (await the watcher's ready signal / poll the effect rather than a fixed delay); if intractable, quarantine explicitly with a tracked issue and a bounded retry, never a silent skip. Add a `test:flaky-scan` that reruns the suite N× in CI weekly to surface new nondeterminism.
5. **verify:release** — keep as the release gate; add the L3 smoke to it once committed.

## 7. Dependencies & open items

- **Contract shape is now the corrected deploy contract** (CLI task 70 §B1/B2, ratified): the payload is a **portable lockfile envelope + `config.json` + content bytes** — scoped `storeExport` tar in B1, vendored trees in B2 — **not** the thin members `resolveBlueprintDeployPayload` sends today. Write the L4 fixture against B1 first; bump `contractVersion` when B2 replaces `storeExport` with `vendorTrees`.
- **v0.2 is shipped** (resolves the earlier "status of 29-37" question): `deployed_cards`, the metered public-invocation engine lane, split billing, and enforcement are on origin/main — no re-planning; the alignment work is blueprint deploy + instruction source + packaging (services doc 41).
- **Instruction-source contract is decided (A+D)**: `drwn write` emits a canonical `.agents/drwn/generated/instructions.md`. Source priority is explicit `manifest.instructions`, then string `manifest.identity.instructions` for blueprints, then deterministic generic aggregation of active `SKILL.md` files. Add a CLI test that a materialized worker exposes a non-empty instructions artifact at that path (CLI task 70 §C); the runtime reads it (services 41 §C).

## 8. Principles

- Every cross-repo contract has a test on **both** sides keyed to a shared, versioned fixture — no silent breaks.
- The real binary is exercised on a clean store at least once per release (L3), not only via in-process helpers.
- Flakes are fixed or explicitly quarantined with an issue — never silently tolerated (broken-windows).
- Live/staging tests are token-gated, fail-soft, and never publish secrets.
