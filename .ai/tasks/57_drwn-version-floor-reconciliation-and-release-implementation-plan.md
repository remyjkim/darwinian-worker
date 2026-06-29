# ABOUTME: TDD implementation plan to reconcile drwn's reported version with the minDrwnVersion floors it emits, add enforcement, and cut a release.
# ABOUTME: Motivated by drwn 0.2.2 silently operating below its own 0.3.0/0.4.0 lock floor; file:line-anchored to cli/core/card-lock.ts + version.ts.

# Task 57: Version-Floor Reconciliation & Release — Implementation Plan

> **For Claude/Codex:** Use `superpowers:test-driven-development` for every code task (failing test first). Do not commit until the whole set is implemented and green. Follow `.ai/rules/01_git.md` — no AI/LLM notion in commit messages.

**Status**: Ready to start
**Created**: 2026-06-28
**Assigned**: Unassigned
**Estimated Effort**: 0.5–1 day
**References**: [cli/core/version.ts, cli/core/card-lock.ts, cli/index.ts, package.json, scripts/verify-release-readiness.ts, test/core-card-lock.test.ts, .ai/knowledges/04_homebrew-release-checklist.md, .ai/knowledges/05_npm-publishing-analysis-and-manual.md]

---

## Motivation

A downstream project (`beginning-db`) pinned `@remyjkim/bgng@1.0.0` and the materialization flow surfaced a latent inconsistency in drwn itself:

- drwn reports its version as **`0.2.2`** (`package.json` → `cli/index.ts:121` `binaryVersion`; duplicated in `cli/core/version.ts:4` `DRWN_VERSION = "0.2.2"`).
- But when drwn writes a `card.lock`, it **stamps a floor above its own version**: `cli/core/card-lock.ts:72` sets `store.minDrwnVersion` to `MINDS_MIN_DRWN_VERSION = "0.4.0"` (lockfileVersion 4, when any card carries persona/beliefs/memory) or `HOOKS_MIN_DRWN_VERSION = "0.3.0"` (lockfileVersion 3) — see `card-lock.ts:46-47,69,72`.
- The minds feature set that triggers the `0.4.0` floor is **already implemented** (persona/beliefs/memory manifests, `generated/mind/` composition — task 56).
- **Nothing enforces the floor at read time.** `validateCardLockfile` (`card-lock.ts:79`) parses `store.minDrwnVersion` into the model but never compares it to the running `DRWN_VERSION`. So a drwn binary below a lock's floor materializes it silently and can mis-reconcile state.

Net: the reported version badly lags the implemented feature set, drwn is **below its own emitted floor**, and the floor is advisory-only. The repo has **no git tags and no CHANGELOG**, so "what version am I" has drifted from "what this code does."

## Objective

1. Make the running version **≥ the highest floor drwn can emit**, and keep it that way structurally so the lag cannot recur.
2. Give the `minDrwnVersion` floor **teeth**: warn (and optionally fail) when the running drwn is below a lock's floor, instead of silently proceeding.
3. Cut a clean, tagged release reconciling the version with reality.

## Decisions to confirm (Remy)

1. **Target version — recommend `0.4.0`.** The `0.4.0` minds floor is already emitted and the features ship, so anything below `0.4.0` leaves drwn below its own floor. `0.3.0` would not actually fix the inconsistency. The `0.2.2 → 0.4.0` jump is a *reconciliation* (the 0.3.0 hooks-era and 0.4.0 minds-era both already shipped under `0.2.x`); document that in the CHANGELOG.
2. **Enforcement policy — recommend warn-by-default + opt-in fail.** On reading a lock whose `store.minDrwnVersion` exceeds the running version, print a clear stderr warning by default; hard-fail only under a `--strict` flag and/or in `write`/`apply` when explicitly requested. Hard-failing by default would lock out users still on older published drwn.
3. **Single source of version truth.** Either make `cli/core/version.ts` derive `DRWN_VERSION` from `package.json`, or keep both literals and add a parity test. Recommend deriving from `package.json` (one bump point) with a fallback.

## Success Criteria

- [ ] One bump point updates the version everywhere (`drwn --version`, `DRWN_VERSION`, generated `drwnVersion` metadata) — verified by test.
- [ ] A test asserts `runningVersion >= MINDS_MIN_DRWN_VERSION >= HOOKS_MIN_DRWN_VERSION`, so the version can never again lag a floor drwn emits.
- [ ] Reading a `card.lock` whose `store.minDrwnVersion` exceeds the running version emits a clear warning; `--strict` turns it into a non-zero failure. Covered by tests for both the at/above and below cases.
- [ ] Version bumped to the agreed target (recommend `0.4.0`) in the single source of truth.
- [ ] `bun test`, `bun run typecheck`, and `bun run verify:release` all green.
- [ ] CHANGELOG added covering `0.2.2 → <target>`; annotated git tag `v<target>` created; npm publish path for `darwinian-mind` confirmed (dry-run via `verify:release` package-contents check).

## Phase 1 — Single source of version truth (TDD)

- **Test first** (`test/core-version.test.ts`, new): assert `DRWN_VERSION === <package.json>.version`. Run → fails only if they drift (today both are `0.2.2`, so write the test to read `package.json` and compare).
- **Implement**: refactor `cli/core/version.ts` to derive `DRWN_VERSION` from `package.json` (mirror the `cli/index.ts:113-121` read of `package.json`), or keep the literal and let the test guard parity. Confirm `cli/index.ts` `binaryVersion` and any `generated` `drwnVersion` writers consume the same source.
- Anchor consumers: grep `DRWN_VERSION` and `binaryVersion` usages; ensure none hardcode a second literal.

## Phase 2 — Version ≥ floor consistency guard (TDD)

- **Test first** (extend `test/core-card-lock.test.ts`): assert `semverGte(runningVersion, MINDS_MIN_DRWN_VERSION)` and `semverGte(MINDS_MIN_DRWN_VERSION, HOOKS_MIN_DRWN_VERSION)`. With version still `0.2.2`, this **fails** — that failure is the bug, and Phase 4 makes it pass.
- **Implement**: export `HOOKS_MIN_DRWN_VERSION` / `MINDS_MIN_DRWN_VERSION` (currently module-private at `card-lock.ts:46-47`) for the test, or add a small `assertVersionFloorsSatisfied()` helper. Add a lightweight semver compare util if none exists (check `cli/core/` first).

## Phase 3 — Runtime floor enforcement (TDD)

- **Test first**: feed `validateCardLockfile` (or a new `assertLockReadable(lock, runningVersion, { strict })`) a lock with `store.minDrwnVersion` above and below the running version. Assert: at/above → no warning; below → warning string (default) and thrown error (strict).
- **Implement**: at the lock-read boundary (`card-lock.ts:79 validateCardLockfile`, or the call sites in `write`/`apply`/`status`), compare `store.minDrwnVersion` to `DRWN_VERSION`. Default: `context.stderr` warning naming both versions and the remedy ("upgrade drwn to >= X"). `--strict` (wire into `drwn write`'s existing flag set and/or a top-level option): throw a non-zero `UsageError`. Keep `status`/`doctor` read paths warn-only.
- Surface the warning in `drwn doctor --json` as a new field (e.g. `versionFloor: { required, running, satisfied }`) so `inspect-harness` can report it.

## Phase 4 — Version bump

- Bump the single source to the agreed target (recommend `0.4.0`). Phase 2's test goes green.
- Update any snapshot/golden tests that embed `drwnVersion`/version strings (grep `0.2.2` across `test/`).

## Phase 5 — Release hygiene

- Add `CHANGELOG.md`: `0.2.2 → <target>` reconciliation note (card-management surface: `card pin`/`status`/`list`/`update`/`outdated`; hooks 0.3.0; minds 0.4.0; new version-floor warning).
- Run `bun run verify:release`; resolve every failing check (`scripts/verify-release-readiness.ts`: bun test, typecheck, hardcoded-path scan, package metadata required keys, docs presence, schema-package reachability, `npm pack --dry-run` contents).
- Create annotated tag `v<target>`; confirm the `darwinian-mind` npm publish path (the repo currently has **no tags**, so confirm whether `0.2.x` was ever published and whether this is the first tagged release). Follow `.ai/knowledges/04_homebrew-release-checklist.md` and `05_npm-publishing-analysis-and-manual.md`.

## Phase 6 — Docs

- Document the floor semantics where minDrwnVersion is described (hooks → `0.3.0`, minds → `0.4.0`; running drwn must be ≥ the floor it emits; new warning/strict behavior). Update the relevant `.ai/knowledges/` doc and `drwn doctor` reference.

## Risks / Notes

- **Skipping 0.3.0**: going `0.2.2 → 0.4.0` is intentional reconciliation, not feature loss — both eras already shipped under `0.2.x`. Call it out in the CHANGELOG to avoid "what happened to 0.3.x" confusion.
- **Enforcement breakage**: default-warn (not fail) avoids locking out users on older published drwn; `--strict` is the opt-in for CI/release gating. Do not hard-fail reads by default.
- **Two version literals** (`version.ts` + `package.json`) are the immediate drift source — Phase 1 collapses them so future bumps are one edit.
- **No behavioral change to existing locks**: lockfileVersion/floor stamping logic (`card-lock.ts:69-72`) is already correct; this task only reconciles the *reporting* version and adds *enforcement*, it does not change what gets stamped.
