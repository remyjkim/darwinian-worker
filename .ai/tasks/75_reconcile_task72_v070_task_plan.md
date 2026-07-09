# ABOUTME: Execution-ready plan to land the coworker's committed-but-unpushed task-72 v0.7.0 line (5 commits on local `main`) onto `origin/main`, which has since advanced with the R-6/R-7 rename merges (#37–#40). Strategy: a merge (not squash/rebase) from the task-72 HEAD in an isolated worktree, so the coworker's live task-73 WIP is never touched and the 5 commits + release commit are preserved for a clean fast-forward handoff.
# ABOUTME: Backed by a full trial reconcile (clean merge, correct package.json/submodule, 1198 tests pass with the single "failure" proven to be a linked-worktree test artifact, not a regression). Follow-ups (skills tag M0-6, CI M4-4, EXT asks) are explicitly out of scope for landing the code.

# Task 75 — Reconcile & land task-72 (v0.7.0) onto origin/main

**Date**: 2026-07-08
**Author**: Claude + Remy
**Status**: Execution-ready. No open blockers — the merge is clean and green.
**Owns**: getting the 5 task-72 commits (the mind-card V1 / v0.7.0 line) onto `origin/main`. Does **not** touch the coworker's in-flight task-73 (`drwn-command-bridge`) WIP.
**References**: local `main` HEAD `52f286b`; `origin/main` HEAD `93f4a8f`; divergence base `9ba5e4d`; task-72 plan `.ai/tasks/72_mind-card-implementation-plan.md`.

---

## Situation

Local `main` is **5 ahead / 4 behind** `origin/main`. The 5 ahead are the coworker's committed-but-unpushed V1 line (diverged at `9ba5e4d`):

```
52f286b chore(release): v0.7.0
688a51d feat(worker): capture mind id and binding coordinates at deploy      (M4)
4db0e21 feat(worker): add DB-backed minds with provision, drift sync, checkpoint (M2/M3)
8459bb0 feat(cards): restore persona/beliefs card content with visibility push gate (M1)
026070f docs(mind): record mind-card design chain, target architecture, plan
```

The 4 behind are the R-6/R-7 rename merges (#37 URLs, #38 logo, #39 task-74 plan, #40 skills submodule). They must be combined.

Complicating context (do not disturb):
- The coworker's **task-73 (`drwn-command-bridge`)** is live, **uncommitted** WIP in the main checkout's working tree (`drwn-command-bridge/` ~48 files, `registry/config.json`, `registry/mcp-servers.json`, `test/sync-mcp.test.ts`, `.ai/knowledges/10_...`, `.ai/tasks/73_...`). It must stay untouched.
- The submodule checkout is mid-transition: on disk at the old `darwinian-minds-skills/` path but with HEAD `0c0a250` (new identity); local `main` records the stale `961b7b9`.

## Investigation findings (why this is safe)

A full trial reconcile (worktree off `52f286b`, `merge origin/main`) established:

1. **Zero merge conflicts.** `package.json` auto-merged (task-72's version/deps hunks and origin's URL/logo hunks are disjoint). Everything else applied cleanly.
2. **Merged result is correct:** `package.json` → `version 0.7.0`, `homepage/bugs/repository` → `remyjkim/darwinian-worker`, logo → `darwinian-worker-logo.png`, `ulid` dep present. Submodule → `darwinian-worker-skills @ 0c0a250` (new path + pointer). No R-6/R-7 regression.
3. **Version parity holds (M4-5):** `package.json`, `cli/core/version.ts` `DRWN_VERSION`, and `cli/core/card-lock.ts` `MINDS_MIN_DRWN_VERSION` are all `0.7.0`.
4. **Green:** `npx tsc --noEmit` clean; `bun test` → **1198 pass, 0 real failures** (1204 total). The lone "fail" — `core-session-discovery.test.ts > gitWorktreeRoots > returns at least the projectRoot itself` — is a **test-environment artifact**: it asserts `gitWorktreeRoots(repoRoot)[0] === repoRoot`, but `git worktree list` always lists the *main* worktree first, so it fails only when the suite runs inside a *linked* worktree (the trial). `session-discovery.ts`/its test are **byte-identical** to the `9ba5e4d` baseline on both the task-72 and origin sides — not a regression. It passes in a normal checkout / CI (a main worktree).

## Strategy — merge, not squash/rebase, from an isolated worktree

- **Merge** (not rebase): preserves the exact 5 commit SHAs (incl. the release commit) and keeps `52f286b` an **ancestor** of the new `origin/main`, so the coworker fast-forwards their local `main` afterward with zero history rewrite.
- **Not squash**: squashing collapses the 5 commits (losing the release-commit structure) and breaks the ancestor relationship (divergence would persist for the coworker).
- **Isolated worktree** off `52f286b`: the main checkout is dirty with task-73 WIP; a fresh worktree gives a clean tree so the reconcile never entangles that work.

## Execution

### R75-1 — Reconcile branch in an isolated worktree
```
cd <main repo>
git fetch origin
git worktree add <wt> -b reconcile/task-72-v0.7.0 52f286b   # clean checkout of the task-72 HEAD
cd <wt>
git merge origin/main --no-edit                             # clean; verified
git submodule sync && git submodule update --init           # relocates to darwinian-worker-skills/ @ 0c0a250
```

### R75-2 — Verify green **in the worktree, but from a main-worktree perspective for the one caveat**
```
bun install
npx tsc --noEmit                                            # expect clean
bun test                                                    # expect 1198+ pass; the ONLY acceptable failure is
                                                            # gitWorktreeRoots (linked-worktree artifact, documented above)
```
Gate: green except the one documented `gitWorktreeRoots` artifact. If any *other* test fails, stop and investigate — the trial showed none. (CI, running in a normal checkout, will show it fully green.)

### R75-3 — Land via a **merge-commit** PR
```
git push -u origin reconcile/task-72-v0.7.0
gh pr create --base main --head reconcile/task-72-v0.7.0 --title "..." --body "..."
# Merge with a MERGE COMMIT (not squash) so the 5 commits + release land intact and 52f286b stays an ancestor.
gh pr merge <n> --merge --delete-branch
```
Because the branch already contains all of `origin/main`, the PR merges without conflict; `origin/main` advances to include the 5 task-72 commits.

### R75-4 — Clean up
```
cd <main repo>; git worktree remove --force <wt>; git branch -D reconcile/task-72-v0.7.0; git fetch origin --prune
```

## Coworker handoff (their main checkout)

After R75-3, `origin/main` contains task-72 + R-6/R-7. The coworker's local `main` (`52f286b`) is now an **ancestor** of `origin/main`, and their task-73 WIP is untouched. To sync:
```
git fetch origin
git merge --ff-only origin/main          # fast-forward; task-73 WIP preserved (no overlap with the delta)
git submodule sync && git submodule update --init   # move working dir to darwinian-worker-skills/
# remove the now-stale old submodule dir if git leaves it:
rm -rf darwinian-minds-skills
```
Their uncommitted edits to `.ai/knowledges/10_...` and the submodule pointer do not block the FF (the delta from `52f286b` to the new `origin/main` is only the R-6/R-7 changes, which don't touch those paths' contents).

## Out of scope (follow-ups, NOT blockers for landing the code)

- **M0-6** — tag + release the renamed skills repo (`darwinian-worker-skills`); the gitlink already resolves by commit SHA, so a tag isn't required to land. Outward/irreversible — confirm before cutting.
- **M4-4** — CI cached Rust build for the gated e2e BGDB job.
- **EXT-1/2/3** — external `@beginningdb/client` + amended-107 coordination.
- **npm 2FA re-enable**, **R-7 domain** — unrelated rename tails.
- **task-73** — the coworker's separate `drwn-command-bridge` work; lands on its own.

## Risks / landmines

1. **Do not squash** R75-3 — it breaks the ancestor relation and the coworker's clean FF, and loses the release commit.
2. **Do not run the green gate's `gitWorktreeRoots` assertion as a blocker** — it's a linked-worktree artifact. Trust CI / a normal checkout for the definitive green.
3. **Never `git add -A` while the submodule dir is uninitialized** in a worktree (it would stage the gitlink's deletion). Init the submodule first (R75-1).
4. **Keep task-73 WIP out** — always reconcile from a clean worktree off `52f286b`, never from the dirty main checkout.
