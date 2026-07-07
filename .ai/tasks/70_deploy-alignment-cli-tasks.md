# ABOUTME: The darwinian-minds (drwn CLI) half of the Workers CLI ↔ studio-deployment alignment — publish, the corrected blueprint deploy contract, install-from-vendored-bytes refactor, instruction-artifact emit, and the printed-URL fix.
# ABOUTME: Coordinated with darwinian-services `.ai/tasks/41_workers_cli_alignment_corrected_plan.md`; land + publish the CLI half before the corresponding services half.

# Task 70: Deploy-Alignment — CLI-side tasks

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Ready for handoff — execution contract pinned
**Coordinates with**: darwinian-services `.ai/tasks/41_workers_cli_alignment_corrected_plan.md` (same task letters A/B1/B2/C/E)
**References**: `.ai/analyses/100-104`, `cli/core/worker-deploy.ts`, `cli/core/card-lock.ts`, `cli/core/card-install.ts`, `cli/commands/install.ts`, `cli/core/card-project.ts`, `cli/core/project-writes.ts`, `cli/core/archive.ts`, `cli/core/store-seed.ts`, `cli/core/vendor.ts`, `cli/core/vendor-reconcile.ts`, `cli/commands/store/export.ts`, `cli/commands/store/seed.ts`, `cli/commands/worker/deploy.ts`

---

## Why (the gap)

The deploy-api materializes a deployed worker by running `drwn install --frozen && drwn write` in a sandbox. But `worker deploy`'s current blueprint payload (`resolveBlueprintDeployPayload`, `cli/core/worker-deploy.ts:30`) sends only thin members (`name/version/integrity/treeSha/requested`) — **insufficient** to reconstruct a `card.lock` (missing `manifest/skills/hooks/origin/git`) and it ships **no content**. `install --frozen` needs a portable full lockfile envelope + a **seeded git store** (or committed vendored bytes) + a project `config.json`. This task fixes the CLI contract. See services doc 41 §Task B for the server half.

## Contract decisions locked for execution

B1 uses a JSON-only bridge so it fits the existing `fetchJsonWithWorkerAuth` / deploy-api JSON route. The binary store tar is base64 inside JSON for this bridge; B2 replaces that with vendored trees. Keep B1 bounded with a hard unencoded tar limit (recommend 25 MiB); deploy-api returns 413 with a message to use B2/vendored bytes if exceeded.

`body.blueprint` is present for both blueprint deploys and bare-card deploys after B1. A bare card is represented as the same envelope with one lock entry and `governance: null`.

Exact B1 envelope:

```json
{
  "contractVersion": 1,
  "materialization": "lockfile-store-export",
  "entrypoint": {
    "requested": "github:owner/repo#v1.0.0",
    "name": "@scope/card",
    "kind": "card"
  },
  "lockfile": {
    "lockfileVersion": 5,
    "store": { "minDrwnVersion": "0.3.0" },
    "cards": []
  },
  "config": {
    "version": 1,
    "cards": ["github:owner/repo#v1.0.0"]
  },
  "governance": null,
  "storeExport": {
    "kind": "drwn-store-export-tar",
    "compression": "none",
    "encoding": "base64",
    "sha256": "<hex sha256 of decoded tar>",
    "byteLength": 123,
    "bytesBase64": "<base64 tar bytes>"
  }
}
```

Blueprint variant: `entrypoint.kind = "blueprint"`, `lockfile.cards` includes the blueprint entry first and all expanded member entries after it, and `governance` is copied from the blueprint manifest fields (`composedFrom`, `tools`, `permissions`, `evals`, `escalation`, `contextMounts`, `identity`) with absent optional fields omitted.

Portable lockfile rule: `body.blueprint.lockfile` is a **portable lockfile envelope**, not a byte-for-byte on-disk `card.lock`. For every `store`/`git` entry, rewrite `entry.path` to `drwn/extracted/<treeSha>`. Reject deploy payload construction if any entry is `origin: "file"` or `origin: "npm"`, if a `treeSha` is missing, or if `git.commit` is missing. The services materializer must denormalize each path to the sandbox absolute extracted path after `drwn store seed` and before writing `.agents/drwn/card.lock`, otherwise current `install --frozen` will fail its path-stability check.

Fixture rule: the contract fixture compares the semantic payload after normalizing binary fields. The test normalizer replaces `storeExport.sha256`, `storeExport.byteLength`, and `storeExport.bytesBase64` with sentinels before deep equality. A separate CLI test decodes a real generated `bytesBase64`, verifies the SHA-256, and proves `seedStore()` accepts the tar.

## Task A — Publish `darwinian-minds@0.6.x`
- npm currently has only `0.4.0` (pre-blueprint); the repo is `0.6.0` (blueprint-capable, unpublished). Publish `0.6.x` via the release pipeline (`.github/workflows/release.yml`). Do **not** wait on the `darwinian-worker` rename (that is a later task).
- **Exit**: `npm view darwinian-minds version` = 0.6.x; the sandbox image (services Task A) can pin it.

## Task B1 — Corrected blueprint deploy contract (store-export bridge)
**Files**: `cli/core/worker-deploy.ts`, `cli/commands/worker/deploy.ts`, `cli/commands/store/export.ts`, `cli/core/archive.ts`, `test/core-worker-deploy.test.ts`, new `test/contract/deploy-payload.v1.json`.
- Replace the thin-members payload with the B1 envelope above. `worker deploy <cardRef>` resolves `resolveProjectCards(agentsDir, [cardRef], { allowUntrustedSource: true })` for both bare cards and blueprints, then sends:
  1. **portable full lockfile envelope** — `{ lockfileVersion, store, cards }`, preserving every `CardLockEntry` field (`manifest/skills/hooks/origin/git/treeSha/integrity`) and including the blueprint entry when present;
  2. **project `config.json`** — minimally `{ version: 1, cards: [cardRef] }`, or the current project config if deploy is invoked inside a project and the selected card is already represented there;
  3. **scoped store-export tar** — uncompressed tar rooted at `drwn/`, containing `store.json`, the needed `cards/**` bare repos, and `extracted/<treeSha>/**` for only the lock entries in the payload.
- Add a pure helper rather than shelling out from tests, e.g. `buildDeployPayload()` plus `createStoreExportForLock(agentsDir, cards, outPath)`. The existing `drwn store export --out` may remain whole-store for operator use; the deploy helper must be scoped so upload size is bounded and deterministic enough to test.
- `worker deploy` computes the decoded tar `sha256` and `byteLength`, base64-encodes the tar as `storeExport.bytesBase64`, and rejects before network I/O when the decoded tar exceeds the B1 limit.
- `worker deploy` no longer silently falls back to ref-only when local resolution fails for a deployable card/blueprint. Resolution failure should be a hard error for B1 because the server contract now depends on lock/config/content bytes.
- A bare card is a one-entry payload with `governance: null`; do not keep the old `resolveBlueprintDeployPayload() === null` behavior for deploy.
- **Tests**:
  - Update `test/core-worker-deploy.test.ts` so bare-card and blueprint payloads normalize and deep-equal `test/contract/deploy-payload.v1.json`.
  - Add a binary sanity test that decodes the generated tar, verifies `sha256`/`byteLength`, and seeds a temp store with `seedStore()`.
  - Keep the normalized fixture mirrored in services at `studio-deployment/workers/deploy-api/test/fixtures/deploy-payload.v1.json`.
- **Exit**: payload is sufficient for the server to write `card.lock`+`config.json`, `drwn store seed` the tar, and `install --frozen && write`.

## Task B2 — Install-from-vendored-bytes refactor (endgame; follow-on)
**Files**: `cli/core/card-install.ts` (`ensureCardPresentFromLock`), `cli/commands/install.ts`, `cli/core/worker-deploy.ts`, `cli/core/vendor.ts`, `cli/core/vendor-manifest.ts`, `cli/core/vendor-reconcile.ts`.
- Refactor `ensureCardPresentFromLock` to receive `projectRoot` (or a `vendorRoot`) from `InstallCommand`. In `--frozen` mode, before checking the bare repo, if `entry.treeSha` is present and `resolveProjectVendorTree(projectRoot, entry.name, entry.treeSha)` exists, verify it with `verifyVendorTreeAgainstLock(vendorDir, entry.integrity)` and return `{ changed: false }`. This preserves current `drwn write` behavior, which already resolves vendored content roots via `card-content-root.ts`.
- Only fall through to the existing bare-repo path when the vendor tree is absent or corrupt. Missing/corrupt vendor bytes under `--frozen` must report a clear `FROZEN_VIOLATION`/vendor-integrity error, not a clone/fetch error.
- `worker deploy` then switches from `storeExport` to:
  ```json
  {
    "materialization": "lockfile-vendored-trees",
    "vendorTrees": [
      {
        "name": "@scope/card",
        "treeSha": "<40 hex>",
        "path": ".agents/drwn/vendor/@scope/card/<12-char tree>",
        "integrity": "sha256-...",
        "tar": {
          "kind": "drwn-vendor-tree-tar",
          "compression": "none",
          "encoding": "base64",
          "sha256": "<hex>",
          "byteLength": 123,
          "bytesBase64": "<base64 tar bytes>"
        }
      }
    ]
  }
  ```
  The `contractVersion` must bump when this replaces B1.
- **Exit**: `install --frozen` succeeds from vendored bytes with no git store; deploy payload switches from store-export tar to vendored trees.

## Task C — Emit a canonical instructions artifact on `drwn write`
**Files**: `cli/core/card-manifest.ts` (a manifest `instructions` source / reuse blueprint `identity`), `cli/core/sync.ts` or `cli/core/worker-generator/sync-worker.ts` (emit step), tests.
- Canonical path is **`.agents/drwn/generated/instructions.md`** under the project root (services reads it at `${MIND_ROOT}/.agents/drwn/generated/instructions.md`).
- Add a manifest field accepted by both cards and blueprints:
  ```ts
  instructions?: { text?: string; path?: string }
  ```
  Validation: exactly one of `text` or `path`; `path` is relative to the card content root, cannot be absolute, cannot contain `..`, and must point to a UTF-8 text file at write time. For a blueprint, `identity.instructions` may be accepted only as a bridge source if it is a string; prefer the explicit `instructions` field in new fixtures.
- On `drwn write`, emit the canonical artifact from the active cards in this order:
  1. First active card/blueprint with explicit `manifest.instructions` wins.
  2. If none, first active blueprint with string `manifest.identity.instructions` wins.
  3. If none, emit deterministic generic aggregation of all active cards' materialized `SKILL.md` files in `skillApplyOrderCards` order, preserving each card's `skills` order and stripping YAML frontmatter.
- The artifact must be non-empty, end with a newline, and be tracked in the write record as managed content.
- **Exit**: a materialized worker exposes a non-empty instructions artifact at the canonical path; the services runtime (Task C) reads it.

## Task E — Fix the CLI serving path (staging-verified)
**Files**: `cli/commands/worker/deploy.ts:160`, `cli/commands/worker/status.ts:~100`, `cli/core/worker-config.ts` (gateway default), new `cli/commands/worker/chat.ts` (optional).
**Verified via staging smoke (2026-07-07)**: a bare-card deploy reaches `ready`, but the printed `${gateway}/m/{slug}/chat` **404s** (`no active deployment`) — the gateway is a `user_id='local'` vestigial lane that can't see DAH-owned workers. Also, `gatewayBaseUrl` defaults to **prod** (`minds.darwiniantools.com`) even for a staging deploy (not linked to the api env). The real CLI-reachable **metered** path is deploy-api `POST ${apiBaseUrl}/api/minds/:slug/chat` (DAH-authed → engine, `observe_only`).
- (a) **Stop advertising** the `/m/` gateway URL in `worker deploy`/`status`.
- (b) **Point serving at the metered path**: print `${apiBaseUrl}/api/minds/{slug}/chat`, and/or add a `drwn worker chat <slug>` command that POSTs there with the DAH bearer (via `fetchJsonWithWorkerAuth`).
- (c) **Fix the gateway/api env link** so a staging deploy never prints a prod URL (derive/deprecate `gatewayBaseUrl` from the api env, or drop it once serving moves off the gateway).
- **Exit**: `worker deploy` prints a working, metered serving path; `drwn worker chat` (if added) reaches the deployed worker on staging.

## Cross-repo contract fixture (shared)
Create `test/contract/deploy-payload.v1.json` (`contractVersion`, bare-card + blueprint examples, binary fields normalized to sentinels). Mirror it byte-for-byte to `darwinian-services/studio-deployment/workers/deploy-api/test/fixtures/deploy-payload.v1.json`. The CLI test builds and normalizes a real payload before comparing; the services ingest test parses the mirrored fixture and validates every persisted/materialized field. A payload shape change creates `deploy-payload.v2.json`, bumps `contractVersion`, and updates both sides in the same cross-repo change set — see `.ai/analyses/104_cli-testing-strategy.md` §4.

## Sequencing
A (publish) → C (instruction emit) → B1 (contract) → E (URL fix, after staging) → B2 (vendored endgame). Each: red/green tests + `npx tsc --noEmit` + `bun test`.
