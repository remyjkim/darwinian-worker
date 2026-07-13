# 78 - Completion: v0.7.0 Release Finalization

> Status: Complete
> Completed: 2026-07-13 UTC
> Repository: `remyjkim/darwinian-worker`
> Release: `darwinian@0.7.0`, `drwn-command-bridge@0.1.0`, GitHub tag/release `v0.7.0`
> Related PRs: #46, #47, #48, #49, #50

## 0. Completion Verdict

The v0.7.0 release is complete and externally verified.

- npm `latest` resolves to `darwinian@0.7.0`.
- The active local binary resolves from `/Users/pureicis/.bun/bin/drwn` and reports `0.7.0`.
- `drwn-command-bridge@0.1.0` is published and registered by the CLI release line.
- The GitHub release exists at `https://github.com/remyjkim/darwinian-worker/releases/tag/v0.7.0`.
- The release workflow now tolerates normal npm registry propagation delay before its Ubuntu and macOS smoke installs.

The separate item explicitly reserved for the coworker was not changed.

## 1. Scope and Starting State

This task finalized the release line after the user approved the recommended release work. The immediate question was whether the installed `drwn` binary was aligned with the npm package `darwinian`; the work expanded into completing and verifying the v0.7.0 publication path.

The release line before finalization consisted of:

| PR | Merge | Delivered |
| --- | --- | --- |
| #46 | `9b53fbf` | Bun runtime/release alignment, standalone command bridge, bridge security implementation and tests, CI/release gates, and documentation reconciliation. |
| #47 | `e64c1db` | Protected command-bridge npm release workflow. |
| #48 | `d488d73` | Registered `drwn-command-bridge@^0.1.0`, configured npm trusted publishing with OIDC, and removed the long-lived npm-token dependency. |

`drwn-command-bridge@0.1.0` was successfully published. The annotated `v0.7.0` tag was pushed at `d488d73`, but its first release workflow run (`29221090870`) failed in validation before npm publication.

## 2. Failure Investigation and Fix

### 2.1 Original release failure

The initial tag-triggered release failed only in:

`test/scenarios-card-catalog-collaboration-lifecycle.test.ts`

The catalog collaboration lifecycle integration scenario exceeded Bun's default five-second test deadline in GitHub Actions. The test was executing correctly, but Bun timed it out, killed a dangling child process, and reported exit 143. No product behavior regression or package defect was found.

PR #49, merged as `a7350dd`, changed only that scenario's local deadline from Bun's default to 30 seconds:

```ts
}, 30_000);
```

The default five-second deadline remains in force for the rest of the test suite.

### 2.2 Why the existing tag was retained

The failed `v0.7.0` tag had already been pushed publicly, but npm had no `darwinian@0.7.0` package and GitHub had no release. Rewriting the tag was avoided.

The only commit after the tag before publication was the test-only PR #49. `git diff v0.7.0..main` showed only the catalog lifecycle test, and `npm pack --dry-run --json` confirmed that the package contains no `test/` files. Therefore, dispatching the protected release workflow from the corrected `main` commit produced the same npm artifact content as the tagged source without mutating the public tag.

## 3. Publication and the Smoke-Install Race

The protected release workflow was manually dispatched from merged `main` at `a7350dd` with `version=0.7.0` and `dry_run=false` (run `29223094246`).

Results:

- Validation completed successfully, including typecheck, the full integration suite, bridge verification, and release readiness.
- The OIDC publish step succeeded; npm accepted `darwinian@0.7.0`.
- The immediate Ubuntu smoke install then failed with `ETARGET`: npm had not yet exposed the newly published version to that runner's registry request.

This was a registry-propagation race, not a failed publication. A later `npm view darwinian@0.7.0` returned the expected version and tarball.

## 4. Release Workflow Hardening

PR #50, merged as `b46d664`, hardened `.github/workflows/release.yml`:

- Both Ubuntu and macOS post-publish smoke-install jobs retry `npm install -g "darwinian@$VERSION"` up to 12 times with a 10-second delay.
- The workflow emits a clear error after two minutes if the package is still unavailable.
- `test/package-readiness.test.ts` now asserts the retry loop and its failure condition, preventing a regression to a one-shot smoke install.

The first PR #50 CI run correctly failed because the readiness test still asserted the old one-shot command. The test contract was updated in the same PR, then the replacement CI run passed on macOS, Ubuntu, and Windows, including the complete Ubuntu validation suite and workflow-preview checks.

## 5. Verification Evidence

### 5.1 Local verification

| Command | Result |
| --- | --- |
| `bun test --timeout 30000 ./test/` | Passed: 1,210 tests, 5 skipped, 0 failures. |
| `bun run typecheck` | Passed. |
| `bun run verify:release --json` | Passed with `ok: true` and no warnings. |
| `bun test test/package-readiness.test.ts` | Passed: 9 tests, 0 failures. |
| `npx --yes darwinian@0.7.0 --version` | Returned `0.7.0`. |
| Isolated `npm install --global --prefix <temp> darwinian@0.7.0`; `<temp>/bin/drwn --version` | Passed on macOS; returned `0.7.0`. |
| `command -v drwn && drwn --version` | `/Users/pureicis/.bun/bin/drwn`; `0.7.0`. |

### 5.2 GitHub Actions verification

| Surface | Result |
| --- | --- |
| PR #49 validation | All command-bridge checks, Windows validation, Linux secret backend, and Ubuntu validation passed. |
| Release run `29223094246` | Validation and OIDC publish passed. The only failure was the immediate smoke-install `ETARGET` after publication. |
| PR #50 final CI run `29224350614` | Passed all command-bridge checks, Windows validation, Linux secret backend, and Ubuntu validation (5m36s). |
| PR #50 workflow preview | Passed validation and deployment preview. |

### 5.3 Published artifacts

| Artifact | Verified state |
| --- | --- |
| `darwinian@latest` | `0.7.0` |
| `darwinian@0.7.0` integrity | `sha512-5O/U9Xx6+ke2q3TuksFO3p8YRmtk6AnMg+Zb4DjLtc/3Ai/HHMYpjRmHc4i/SPyycs/45g6hNDhxahvlYn+ZaQ==` |
| `drwn-command-bridge@0.1.0` | Published; integrity `sha512-VrukuGRzs2WY3qLB/W4T4HB9W4+8QKIF0aDwNe87N2fjznr6uqBVbmNG5IRhK9ivWDJ9T43LVb4k5ha9gOUl2A==` |
| GitHub release | `v0.7.0`, published 2026-07-13 UTC, not draft or prerelease. |

## 6. Final Repository State

At completion, `main` and `origin/main` were aligned at merge commit `b46d664` and the release worktree was clean before this completion record was drafted.

The active release artifacts are aligned:

```text
drwn binary:        0.7.0
npm darwinian@latest: 0.7.0
npm drwn-command-bridge: 0.1.0
GitHub release:     v0.7.0
```

## 7. Residual Notes

1. The historical manually dispatched release workflow remains marked failed because its already-successful npm publish was followed immediately by the registry-propagation smoke-install race. It must not be rerun: its duplicate-version guard would correctly reject republishing `0.7.0`.
2. Future releases use the merged retry logic, so the same normal propagation window no longer produces a false release failure.
3. The GitHub release was created manually because `release.yml` creates a GitHub Release only on a tag-push event; the safe workflow-dispatch path used to avoid rewriting `v0.7.0` intentionally skips that job.
