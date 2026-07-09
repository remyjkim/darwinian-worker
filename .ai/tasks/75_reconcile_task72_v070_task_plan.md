# ABOUTME: Execution-ready plan to land the coworker's committed-but-unpushed task-72 v0.7.0 line (now 6 commits on local `main`) onto `origin/main`, which advanced with the R-6/R-7 rename merges (#37–#42). Strategy: fix the tip's typecheck errors, then merge (not squash/rebase) from the task-72 HEAD in an isolated worktree, so the coworker's live task-73 WIP is never touched and the commits + release commit are preserved for a clean fast-forward handoff.
# ABOUTME: Re-validated 2026-07-08 against the current codebase. The merge is still clean and the result correct, BUT the new tip commit `a80550f` fails `tsc` (5 errors in its own two new test files) — that is a hard precondition (R75-0) before landing. Follow-ups (skills tag M0-6, CI M4-4, EXT asks) remain out of scope.

# Task 75 — Reconcile & land task-72 (v0.7.0) onto origin/main

**Date**: 2026-07-08 (re-validated same day against `a80550f`)
**Author**: Claude + Remy
**Status**: Strategy valid; **blocked on R75-0** (the task-72 tip fails typecheck). Execution-ready once R75-0 is done.
**Owns**: getting the task-72 commits (mind-card V1 / v0.7.0 line) onto `origin/main`. Does **not** touch the coworker's in-flight task-73 (`drwn-command-bridge`) WIP.
**References**: local `main` HEAD `a80550f`; `origin/main` HEAD `6b3c9ae`; divergence base `9ba5e4d`; task-72 plan `.ai/tasks/72_mind-card-implementation-plan.md`.

---

## Situation (current)

Local `main` is **6 ahead / 6 behind** `origin/main`. The 6 ahead are the coworker's committed-but-unpushed V1 line (diverged at `9ba5e4d`):

```
a80550f test(mind): retarget smoke + guard substrate pollution for the mind-tools/starter split   ← NEW since first draft
52f286b chore(release): v0.7.0
688a51d feat(worker): capture mind id and binding coordinates at deploy      (M4)
4db0e21 feat(worker): add DB-backed minds with provision, drift sync, checkpoint (M2/M3)
8459bb0 feat(cards): restore persona/beliefs card content with visibility push gate (M1)
026070f docs(mind): record mind-card design chain, target architecture, plan
```

The 6 behind are the R-6/R-7 rename merges + docs (#37 URLs, #38 logo, #39 skills-rename plan, #40 skills submodule, #41 task-70 doc, #42 this plan). They must be combined.

Do not disturb: the coworker's **task-73 (`drwn-command-bridge`)** is live, uncommitted WIP in the main checkout's working tree.

## R75-0 — PRECONDITION: make the task-72 tip green (typecheck)

Re-validation found `a80550f` **fails `tsc --noEmit`** (exit 2, 5 errors) — intrinsic to the commit (identical with or without the origin/main merge; origin/main never touches these files or `CardLockEntry`). CI's typecheck gate would fail. Fix before landing:

- `test/mind-substrate-e2e.test.ts` — two `CardLockEntry` fixtures (`lockEntry()` helper ~L34 and the inline `figureEntry` ~L78) omit required fields. Add `requested`, `path`, `skills: []`, `hooks: []`, `registry: null`, `origin: "file"` (pattern: `test/commands-store-gc.test.ts`). Behavior is unaffected — `loadCardMindContent` only reads `name`/`manifest`/`persona`/`beliefs`/`memory`.
- `test/mind-substrate-pollution.test.ts` — L49/L50/L82 index `parsed.sections[0].card`/`.entry` under `noUncheckedIndexedAccess`. Use optional chaining `parsed.sections[0]?.card` (codebase idiom: `test/core-persona-composer.test.ts:50`); the preceding `toHaveLength(1)` guarantees presence, so the assertion is unchanged.

Land the fix as one commit on the reconcile branch **on top of `a80550f`, before the origin/main merge**, so the task-72 line is green in isolation.

## Investigation findings (why the reconcile is otherwise safe)

Full trial reconcile (worktree off `a80550f`, `merge origin/main`):

1. **Zero merge conflicts.** `package.json` auto-merges (task-72's version/deps hunks and origin's URL/logo hunks are disjoint).
2. **Merged result correct:** `package.json` → `0.7.0` + `remyjkim/darwinian-worker` URLs + `darwinian-worker-logo.png` + `ulid`; submodule → `darwinian-worker-skills @ 0c0a250`; no R-6/R-7 regression.
3. **Version parity (M4-5):** `package.json` / `DRWN_VERSION` / `MINDS_MIN_DRWN_VERSION` all `0.7.0`.
4. **Green after R75-0:** with the two test files fixed, `tsc` is clean and `bun test` passes (~1200 tests). The single expected non-fix "failure" — `core-session-discovery.test.ts > gitWorktreeRoots > returns at least the projectRoot itself` — is a **linked-worktree artifact** (`git worktree list` lists the main worktree first, so `result[0] !== repoRoot` only inside a linked worktree). `session-discovery.ts` is byte-identical to `9ba5e4d`; it passes in a normal checkout / CI.

## Numbering collision to resolve

`a80550f` adds `.ai/tasks/74_mind-substrate-split-implementation-plan.md`; `origin/main` already has `.ai/tasks/74_skills_identity_rename_darwinian_worker_skills_task_plan.md` (#39). Both are `74_` — no git conflict (they coexist after merge), but a duplicate sequence number. Resolve by renumbering the mind-substrate plan to the next free number (e.g. `76_`) during the reconcile, or as a follow-up doc commit.

## Strategy — fix, then merge (not squash/rebase), from an isolated worktree

- **Merge** (not rebase): preserves the exact commit SHAs (incl. the release commit) and keeps `a80550f` an **ancestor** of the new `origin/main`, so the coworker fast-forwards later with zero history rewrite.
- **Not squash**: collapsing loses the release-commit structure and breaks the ancestor relation (divergence would persist for the coworker).
- **Isolated worktree** off `a80550f`: the main checkout is dirty with task-73 WIP; a fresh worktree keeps that untouched.

## Execution

### R75-1 — Reconcile branch + fix + merge (isolated worktree)
```
git fetch origin
git worktree add <wt> -b reconcile/task-72-v0.7.0 a80550f    # clean checkout of the tip
cd <wt>
# R75-0 fix: edit the two test files, then:
git commit -am "fix(test): complete CardLockEntry fixtures and guard optional section access in mind-substrate tests"
git merge origin/main --no-edit                              # clean; verified
git submodule sync && git submodule update --init            # -> darwinian-worker-skills/ @ 0c0a250
# (optional) renumber the duplicate task-74 doc here
```

### R75-2 — Verify green
```
bun install
npx tsc --noEmit                                             # MUST be clean (R75-0 makes it so)
bun test                                                     # green; only acceptable failure is the documented
                                                            # gitWorktreeRoots linked-worktree artifact
```
Gate: `tsc` clean; tests green except the one documented artifact. Any other failure → stop.

### R75-3 — Land via a **merge-commit** PR
```
git push -u origin reconcile/task-72-v0.7.0
gh pr create --base main --head reconcile/task-72-v0.7.0 --title "..." --body "..."
gh pr merge <n> --merge --delete-branch                      # MERGE COMMIT, not squash
```

### R75-4 — Clean up
```
git worktree remove --force <wt>; git branch -D reconcile/task-72-v0.7.0; git fetch origin --prune
```

## Coworker handoff (their main checkout)

After R75-3, `origin/main` contains task-72 + R-6/R-7, and `a80550f` is an ancestor of it. Their task-73 WIP is untouched. To sync:
```
git fetch origin
git merge --ff-only origin/main                    # fast-forward; task-73 WIP preserved
git submodule sync && git submodule update --init  # relocate working dir to darwinian-worker-skills/
rm -rf darwinian-minds-skills                       # remove the stale old submodule dir if left behind
```
Note: the reconcile added one fix commit on top of `a80550f`, so their `a80550f` is still an ancestor (FF stays clean).

## Out of scope (follow-ups, NOT blockers for landing the code)

- **M0-6** — tag/release the renamed skills repo (gitlink resolves by SHA; a tag isn't required to land). Outward — confirm before cutting.
- **M4-4** — CI cached Rust build for the gated e2e BGDB job.
- **EXT-1/2/3** — external `@beginningdb/client` + amended-107 coordination.
- **npm 2FA re-enable**, **R-7 domain** — unrelated rename tails.
- **task-73** — the coworker's separate `drwn-command-bridge` work; lands on its own.

## Risks / landmines

1. **R75-0 is a hard gate** — the tip is red on `tsc`; landing without the fix red-lights CI.
2. **Do not squash** R75-3 — breaks the ancestor relation and the coworker's clean FF, and loses the release commit.
3. **Do not treat `gitWorktreeRoots` as a blocker** — linked-worktree artifact; trust CI / a normal checkout.
4. **Never `git add -A` while the submodule dir is uninitialized** in a worktree (stages the gitlink's deletion). Init the submodule first.
5. **Keep task-73 WIP out** — always reconcile from a clean worktree off `a80550f`, never the dirty main checkout.
