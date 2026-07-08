# Changelog

All notable changes to `darwinian-minds` (the `drwn` CLI) are documented here. This
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] — 2026-07-07

Mind cards: persona and beliefs return to card manifests as versioned seeds, and
workers gain DB-backed minds in BeginningDB with a shared, placement-based memory
pool.

### Added

- Card manifests accept `persona`, `beliefs`, and `memory` sections again.
  Persona/beliefs carry `include` entries with required `visibility`; memory
  declares layers (`l4` reflections, `l5` observations; `l6` reserved) and
  formats only — memory content is DB-native and never ships in cards.
- `drwn card source add-persona/remove-persona/add-belief/remove-belief`
  authoring commands, source-doctor checks, and publish validation for
  persona/beliefs content.
- The mind-content visibility push gate: `drwn card push` blocks
  visibility-bearing content toward less restrictive remotes
  (`--remote-visibility`, `--unsafe-push-public`).
- `drwn worker mind` verb group: `provision` (seed a mind from the active card
  stack), `status` (drift table), `sync` (rebase seeds; DB edits win unless
  `--force`), `diff`, `checkpoint` (write DB edits back into card sources),
  `doctor` (binding, ledger, and pool health), and `pool retire` (human-only
  delete-everywhere with confirmation).
- Mind connections resolve from `BGDB_*` environment variables; `worker deploy`
  captures the deployment's `mindId` and caches non-secret binding coordinates
  in `~/.agents/drwn/mind-bindings.json` (tokens are never persisted).
- Locks carrying mind content raise the version floor to 0.7.0
  (`MINDS_MIN_DRWN_VERSION`).

## [0.5.0] — 2026-06-29

Gives the `minDrwnVersion` lock floor teeth. Reading a project whose `card.lock`
requires a newer `drwn` than you are running now surfaces the mismatch instead of
silently materializing it.

### Added

- Version-floor enforcement (`evaluateVersionFloor`): `drwn write` prints a clear
  stderr warning when the project's `card.lock` floor exceeds the running version,
  and `drwn write --strict` turns that into a non-zero failure (machine-scope writes
  `--root`/`--user` skip the project check).
- `drwn doctor` reports a `versionFloor` section (`required`, `running`, `satisfied`)
  so the mismatch is inspectable.

### Changed

- Bumped the reported version to `0.5.0`.

## [0.4.0] — 2026-06-29

First tagged release. The reported version is reconciled with the feature set that
already shipped under the `0.2.x` line, so `drwn` no longer runs below the
`minDrwnVersion` floor it stamps into `card.lock`.

### Why the jump from 0.2.2 to 0.4.0

`drwn` reported `0.2.2` while already emitting a `0.4.0` lock floor for the minds
feature set (persona/beliefs/memory composition) and a `0.3.0` floor for hooks. Both
eras shipped under `0.2.x`; this release realigns the reported version with reality
rather than adding features. There is intentionally no separate `0.3.x` tag.

### Added

- `CHANGELOG.md` and an annotated `v0.4.0` git tag — the first release hygiene for the repo.
- A version-floor parity guard: tests assert the running version stays in lockstep with
  `package.json` and never lags the highest floor `drwn` can emit
  (`MINDS_MIN_DRWN_VERSION` ≥ `HOOKS_MIN_DRWN_VERSION`), so the version cannot silently
  drift below its own lock floor again.
- `gte` helper in the shared semver utilities.

### Changed

- Bumped the reported version to `0.4.0` across the single sources of truth
  (`package.json`, `cli/core/version.ts`).
- Exported the lock-floor constants (`HOOKS_MIN_DRWN_VERSION`, `MINDS_MIN_DRWN_VERSION`)
  so the parity guard can reference them.

### Notes

- Runtime enforcement of the floor (a stderr warning by default and a `--strict`
  hard-fail when reading a lock above the running version) is planned as a fast-follow;
  this release reconciles the reported version and guards against future drift.
