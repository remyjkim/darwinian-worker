# Vendored Card Migration Runbook

This runbook covers migrating existing drwn projects from store-symlink materialization to the vendored card model (analysis 97/98 V1).

## When to migrate

Run migration when a project still has `generated-symlink` entries in `.agents/drwn/write-record.json` from the pre-vendor mind layer. `drwn write` detects this automatically and re-vendors pinned trees before replacing symlinks with copied content.

## Recommended sequence

1. **Publish** any in-flight card source changes (`drwn card publish`).
2. **Update** project locks (`drwn card update` or `drwn up`).
3. **Write** to re-vendor and refresh projection surfaces (`drwn write`).
4. **Commit** the updated `vendor/` trees and lockfile; announce that projection surfaces (`.claude/skills/`, `.cursor/`, generated mind output) are now gitignored.
5. **Verify** on a fresh clone with an empty store: checkout + `drwn write` should reconstruct projection offline.

## Committed-surfaces escape hatch

Set `"committedSurfaces": true` in `.agents/drwn/config.json` when teammates consume the repo **without** drwn installed. This commits projection surfaces too. It is non-default and trades git noise for zero-tooling consumption.

Pure drwn-less consumption without drwn **and** without this flag is out of scope for V1.

## Upstream provenance

Cards with `skills.upstream` should run `drwn card source sync` before publish. Drift signposts always point to upstream source or `drwn card fork`, never to `vendor/`.

## Requirement 3 (V1 scope)

V1 ships pull-based version-up via `drwn up`. Distributable deprecation notification to all vendored consumers is post-V1 (catalog-reflected).
