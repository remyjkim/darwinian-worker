# Changelog

All notable changes to `darwinian-minds` (the `drwn` CLI) are documented here. This
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
