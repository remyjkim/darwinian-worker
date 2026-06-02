# Task 34 Completion: drwn Git Distribution Wave 2

**Task**: [34_drwn-git-distribution-wave-2-implementation-plan.md](./34_drwn-git-distribution-wave-2-implementation-plan.md)
**Completed**: 2026-06-02 PDT
**Status**: Implemented, locally verified, and live-remote smoked
**Commit Status**: No commits made, per instruction
**Worktree Status**: No separate git worktree created, per instruction
**Current Branch**: `remyjkim/harness-card-v1.1`
**Related Analysis**: [53_remote-card-publishing-usage-pattern-manual.md](../analyses/53_remote-card-publishing-usage-pattern-manual.md)

---

## Executive Summary

Wave 2 is complete as a local implementation and has now been smoke-tested against a hosted GitHub SSH remote. It adds the adoption and trust layer on top of Wave 1's Git-backed card distribution model:

- `drwn card new <name> --from-project [project-path]` captures a project's effective harness as a self-contained card source.
- Card manifests accept optional quality fields: `stability`, `lastValidatedWith`, and `testStatusBadge`.
- `drwn card show` surfaces quality fields in human output and `--json`.
- Git URL card resolution records and consults `~/.agents/drwn/url-card-map.json`.
- Active docs and help now describe the current Git-backed store, capture flow, quality fields, and URL cache.

Wave 2 deliberately did not activate the older registry-pinning `skills.shared` design from task 21. That plan remains historical and out of scope for the current Git-backed card rollout.

---

## Problem Solved

Wave 1 made cards distributable through Git. Wave 2 resolves the next adoption bottlenecks:

1. **Authoring entry gate**: users can turn an already-working project harness into a shareable card instead of hand-authoring a source from scratch.
2. **Trust and quality signals**: consumers can inspect whether a card is experimental, stable, production-oriented, recently validated, or associated with a test badge.
3. **Repeated Git URL discovery**: repeated resolution of the same Git card URL can reuse a persistent URL-to-card-name cache instead of rediscovering the manifest every time.

---

## Delivered Scope

### Readiness Closeout

- Marked `.ai/tasks/21_harness-cards-wave-2-implementation-plan.md` as historical/stale.
- Reconciled `.ai/analyses/52_drwn-target-architecture-post-wave-1.md` with the current post-Wave-1 model:
  - `drwn write` is downstream materialization.
  - `drwn apply` / `drwn card apply` compose project card selections.
  - lockfile v1 compatibility remains intentionally dropped.
  - old `bgng` path migration text is historical only.
- Updated `drwn card publish` help to describe the Git-backed bare-repo/tag model rather than old copy-based storage.

### Shared Effective State

- Added `cli/core/effective-state.ts`.
- Refactored `syncRepository()` to use the shared effective-state builder.
- The helper exposes:
  - normalized path options
  - project root and config path
  - project config after card manifest merge
  - locked card entries
  - effective skill selection
  - active MCP servers
  - scoped write options
  - write-record scope

This keeps `drwn write` and project capture on the same resolver path.

### Project Capture

- Added `cli/core/card-capture.ts`.
- Added `drwn card new <name> --from-project [project-path]`.
- Capture behavior:
  - refuses non-project paths
  - uses the current working directory when no project path is provided
  - copies effective skill content into the card source
  - records active MCP server definitions in `card.json`
  - preserves effective extension and target intent
  - writes `version: "0.1.0"` for captured sources
  - refuses to overwrite an existing card source
  - respects `DRWN_STORE_READONLY`
  - does not read host environment variable values into captured card manifests
  - removes the partially-created source directory on capture failure where possible

### Manifest Quality Fields

- Extended `CardManifest` with:
  - `stability?: "experimental" | "stable" | "production"`
  - `lastValidatedWith?: string`
  - `testStatusBadge?: string`
- Validation now rejects:
  - invalid `stability` values
  - non-semver `lastValidatedWith` values
  - non-HTTP(S) badge URLs
- `drwn card show` includes present quality fields in human output and `--json`.

### URL-To-Name Cache

- Added `cli/core/url-card-map.ts`.
- Cache path: `~/.agents/drwn/url-card-map.json`.
- Cache format: `mapVersion: 1`.
- Git resolution now:
  - records successful URL-to-name discoveries
  - consults existing cache entries before doing fresh discovery
  - still enforces name-collision checks against local bare repo origin URLs
  - corrects stale cache entries after successful fresh discovery
  - ignores corrupt or missing cache files

The cache is an optimization only. Correctness still comes from the validated remote card manifest and Git refs.

### Documentation

- Updated `README.md`.
- Updated `.ai/knowledges/01_agents-cli-usage-guide.md`.
- Updated `.ai/knowledges/09_harness-cards-manual-test-guide.md`.
- Updated Astro docs:
  - `docs-astro/src/content/docs/03-cli-reference.md`
  - `docs-astro/src/content/docs/10-harness-cards.md`
  - `docs-astro/src/content/docs/11-store-and-migration.md`
- Added a current implementation usage manual:
  - `.ai/analyses/53_remote-card-publishing-usage-pattern-manual.md`

---

## Files Added

- `cli/core/card-capture.ts`
- `cli/core/effective-state.ts`
- `cli/core/url-card-map.ts`
- `test/commands-card-new-from-project.test.ts`
- `test/core-card-capture.test.ts`
- `test/core-url-card-map.test.ts`
- `test/scenarios-wave-2.test.ts`
- `.ai/tasks/34_completion_drwn-git-distribution-wave-2.md`
- `.ai/analyses/53_remote-card-publishing-usage-pattern-manual.md`

## Files Modified

- `.ai/analyses/52_drwn-target-architecture-post-wave-1.md`
- `.ai/knowledges/01_agents-cli-usage-guide.md`
- `.ai/knowledges/09_harness-cards-manual-test-guide.md`
- `.ai/tasks/21_harness-cards-wave-2-implementation-plan.md`
- `.ai/tasks/34_drwn-git-distribution-wave-2-implementation-plan.md`
- `README.md`
- `cli/commands/card/new.ts`
- `cli/commands/card/show.ts`
- `cli/core/card-manifest.ts`
- `cli/core/card-store.ts`
- `cli/core/sync.ts`
- `docs-astro/src/content/docs/03-cli-reference.md`
- `docs-astro/src/content/docs/10-harness-cards.md`
- `docs-astro/src/content/docs/11-store-and-migration.md`
- `test/commands-card-affordances.test.ts`
- `test/core-card-manifest.test.ts`
- `test/core-card-store-git.test.ts`

---

## Implementation Notes

### Git Under The Hood

Wave 2 continues the Wave 1 architecture: application Git operations go through `cli/core/git.ts`, which shells out to the system `git` binary via `Bun.spawn(["git", ...])`. drwn does not use a Git library. Hosted authentication, SSH keys, credential helpers, network retries, and remote authorization are therefore Git's responsibility.

### Capture Semantics

Capture flattens the effective project state into a new self-contained card source. It does not preserve the original project's card dependency graph by default. This is intentional: the captured card should be consumable as a single artifact.

Capture follows current `drwn write` semantics. It resolves skill content from locked cards plus available repo/package-backed user-default sources. Wave 2 does not add a separate project-local skill directory resolver.

### Publish And Push Semantics

`drwn card publish` is local. It writes the source tree to the per-card bare repo, creates a commit on `refs/heads/main`, and creates an immutable `v<semver>` tag.

`drwn card push` is remote. It runs a normal Git push of `refs/heads/main` plus all tags to the configured remote. It does not force push. Repeat publishing to a non-empty hosted remote requires the local bare repo's `main` to descend from the remote `main`; otherwise Git will reject the push as non-fast-forward.

---

## TDD Evidence

RED/GREEN cycles were run for:

- missing `cli/core/effective-state.ts`
- missing `cli/core/card-capture.ts`
- missing `drwn card new --from-project`
- invalid quality field validation
- missing quality fields in `card show`
- missing `cli/core/url-card-map.ts`
- missing URL cache writes and stale-cache correction in Git resolution

The one non-runtime issue encountered was a TypeScript-only assertion problem in `test/core-card-capture.test.ts`; root cause was optional manifest fields after validation. The test assertions were corrected with optional access/casts, and typecheck then passed.

---

## Scenario Coverage Added

### Effective State

- Effective-state helper exposes locked cards.
- Effective-state helper exposes effective skills.
- Effective-state helper exposes active MCP servers.
- Effective-state helper exposes extensions.
- Effective-state helper exposes targets.
- Effective-state helper exposes scoped write options.
- `syncRepository()` still uses the same effective-state path.

### Capture Core And CLI

- Capture creates a self-contained source from card-backed skills.
- Capture creates a self-contained source from non-card available skills.
- Capture copies skill directories rather than symlinking them.
- Capture records active MCP servers.
- Capture records effective extensions.
- Capture records effective targets.
- Capture writes `version: "0.1.0"`.
- Capture refuses overwrites.
- Capture respects `DRWN_STORE_READONLY`.
- Capture does not inline host environment secret values.
- Capture cleans up partial source output on failure.
- CLI capture can publish the captured source.
- CLI capture with no project path uses the current project.
- CLI capture outside a project fails clearly.
- Extra positional project path without `--from-project` is rejected.

### Quality Fields

- Valid quality fields pass manifest validation.
- Invalid stability values are rejected.
- Invalid semver values in `lastValidatedWith` are rejected.
- Non-HTTP(S) badge URLs are rejected.
- Existing manifests without quality fields remain valid.
- `card show` human output surfaces quality fields.
- `card show --json` includes quality fields under `manifest`.

### URL Cache And Git Resolution

- Missing URL map returns null.
- URL map writes persist a versioned cache entry.
- Corrupt URL map files are ignored.
- Git-origin resolution records URL mappings.
- Cache hits can resolve under the cached card name.
- Name-collision policy still fires when a cached name is bound to another origin URL.
- Stale URL mappings are corrected.
- Wrong cached repo paths are removed after mismatch discovery where appropriate.

### End-To-End Wave 2

- Consume a Git-origin card.
- Populate URL cache.
- Capture the project.
- Add manifest quality fields.
- Publish the captured card.
- Consume it in a second project.
- Verify materialized skill output.
- Verify quality metadata is inspectable.

---

## Local Verification

Fresh local verification completed after implementation:

```bash
bun test
bun run typecheck
bun run verify:release --json
npm pack --dry-run --json
git diff --check
```

Results:

- `bun test`: 488 pass, 0 fail, 1806 expectations, 91 files.
- `bun run typecheck`: passed.
- `bun run verify:release --json`: `"ok": true`, no warnings.
- `npm pack --dry-run --json`: passed; package includes new Wave 2 core/command files.
- `git diff --check`: clean.

Targeted Wave 2 regression set:

```bash
bun test test/core-effective-state.test.ts test/core-card-capture.test.ts test/commands-card-new-from-project.test.ts test/core-card-manifest.test.ts test/commands-card-affordances.test.ts test/core-url-card-map.test.ts test/core-card-store-git.test.ts test/scenarios-wave-2.test.ts
```

Result:

- 33 pass, 0 fail, 143 expectations, 8 files.

Docs/help targeted gate:

```bash
bun test test/docs-readiness.test.ts test/cli-help-shape.test.ts
```

Result:

- 3 pass, 0 fail, 325 expectations, 2 files.

---

## Hosted Remote Smoke

A live hosted Git smoke was run against the disposable remote:

```text
git@github.com:curation-labs/darwinian-harness-remote-test-01.git
```

Initial remote check:

- `git ls-remote` returned no refs before the smoke, so the remote was treated as an empty disposable target.

Smoke flow:

1. Created an isolated temporary author store and temporary fixture repo root.
2. Created a project with one effective shared skill and target overrides.
3. Captured the project:

   ```bash
   drwn card new @remote/wave2-smoke --from-project <project-a> --no-git
   ```

4. Added quality metadata to the captured manifest.
5. Published locally:

   ```bash
   drwn card publish @remote/wave2-smoke
   ```

6. Configured the SSH remote:

   ```bash
   drwn card remote add @remote/wave2-smoke git@github.com:curation-labs/darwinian-harness-remote-test-01.git
   ```

7. Pushed:

   ```bash
   drwn card push @remote/wave2-smoke
   ```

8. Verified the hosted remote now contains:
   - `refs/heads/main`
   - `refs/tags/v0.1.0`
9. Created a fresh temporary consumer store.
10. Cloned by hosted SSH URL:

    ```bash
    drwn card clone git+git@github.com:curation-labs/darwinian-harness-remote-test-01.git#v0.1.0 --json
    ```

11. Added the same `git+ssh#tag` ref to a fresh project.
12. Ran `drwn write`.
13. Verified project-local Claude and Codex skill symlinks materialized from the Git card.
14. Verified `url-card-map.json` maps the SSH URL to `@remote/wave2-smoke`.
15. Verified `card.lock` records:
    - `origin: "git"`
    - `git.url`
    - `git.ref: "v0.1.0"`
    - a 40-character `git.commit`

Observed Git commit:

```text
7b823fa9f588ddf6876657cedf3e82822703554f
```

Remote side effect:

- The remote is no longer empty. It now has `main` and `v0.1.0`.
- Future smoke tests against the same remote must account for this. Use a fresh empty repo, or first clone/fetch the existing remote history before publishing a newer version so `drwn card push` can fast-forward without force.

---

## Residual Risk

- Hosted Git was smoke-tested once over SSH against GitHub, but the automated suite intentionally remains local and deterministic with `file://` remotes.
- Non-fast-forward rejection is expected Git behavior. A future manual or automated remote smoke should explicitly cover the repeat-publish recovery path.
- Capture follows current `drwn write` semantics and does not discover arbitrary project-local skill directories outside that resolver model.
- URL cache correctness is covered for missing, corrupt, successful, and stale entries. It remains non-authoritative by design.
- `DRWN_STORE_READONLY` has representative coverage. Future store-mutating helpers must explicitly call the same guard.

---

## Release-Oriented Remote Testing Pattern

For future hosted-remote validation, use a disposable remote and isolated stores:

```bash
drwn card new @team/wave2-smoke --from-project <project> --no-git
drwn card publish @team/wave2-smoke
drwn card remote add @team/wave2-smoke <git-remote-url>
drwn card push @team/wave2-smoke
drwn card clone git+<git-remote-url>#v0.1.0 --json
drwn add git+<git-remote-url>#v0.1.0
drwn install --no-apply
drwn write --dry-run
```

Then confirm:

- hosted refs include `refs/heads/main` and `refs/tags/v0.1.0`
- `~/.agents/drwn/url-card-map.json` contains the hosted URL mapping
- project `card.lock` contains Git URL, ref, and commit metadata
- downstream skill symlinks point at the extracted Git-backed card content

See [53_remote-card-publishing-usage-pattern-manual.md](../analyses/53_remote-card-publishing-usage-pattern-manual.md) for repeat-publish and troubleshooting patterns.

---

## Working Tree Notes

The implementation remains uncommitted as requested. No separate git worktree was created. Existing unrelated dirty worktree state was preserved. The hosted smoke used temporary stores and did not write to the normal `~/.agents` store.
