# Task 15: Harness Cards Execution Handoff

**Status**: Handoff Split Created
**Created**: 2026-05-20
**Updated**: 2026-05-20
**Assigned**: Remy + Claude
**Priority**: High
**Estimated Effort**: Coordination layer for Task 14; no implementation by itself
**Dependencies**: `.ai/tasks/14_harness-cards-implementation-plan.md`, `.ai/analyses/29_harness-cards-target-architecture-v1_1.md`, `.ai/analyses/30_bgng-cli-usage-guide-cards-v1.md`
**References**: [tasks/14_harness-cards-implementation-plan.md, tasks/16_harness-cards-phase-m0-m1-foundation-handoff.md, tasks/17_harness-cards-phase-m2-m3-materialization-safety-handoff.md, tasks/18_harness-cards-phase-m4-m5-card-lifecycle-handoff.md, tasks/19_harness-cards-phase-m6-m7-scope-diagnostics-handoff.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/30_bgng-cli-usage-guide-cards-v1.md]

---

## Objective

Assess whether the Harness Cards implementation plan is handoff-ready and split it into smaller execution handoff documents that a fresh engineer can carry out without rereading a 1,900-line master plan.

---

## Verdict

**Grade before this split: B+ / 86.**

The master plan is technically strong: it names the target state, phases the work, includes scaffolding, and has TDD entry points. It is ready for an architect or project lead to supervise.

It is not ideal as a direct execution handoff for a fresh implementer because:

- It is too long to keep in working memory during a single implementation session.
- Some milestone-local gates are buried far from the relevant phase.
- Several decisions are "known enough" but need to be pinned at phase entry.
- The newly drafted usage guide was not referenced yet.
- The plan says R7 needs M0 status/doctor snapshots, but M0's subtask list does not explicitly include them.

**Grade after this split: A- / 92 for execution readiness.**

The architecture and master plan are sufficient to start, with the phase docs below acting as the practical handoff layer. The remaining non-A items are deliberately called out as phase-entry blockers rather than hidden assumptions.

---

## Handoff Documents

Use the master plan as the canonical specification. Use these smaller documents as execution entry points:

| Phase doc | Covers | Purpose |
|---|---|---|
| `16_harness-cards-phase-m0-m1-foundation-handoff.md` | M0-M1 | CLI surface cut, architecture lifecycle, store layout, migration. |
| `17_harness-cards-phase-m2-m3-materialization-safety-handoff.md` | M2-M3 | Write-record, idempotency, cleanup, managed fields, drift refusal. |
| `18_harness-cards-phase-m4-m5-card-lifecycle-handoff.md` | M4-M5 | Card authoring, publishing, resolving, consumer commands, bundle/MCP resolution. |
| `19_harness-cards-phase-m6-m7-scope-diagnostics-handoff.md` | M6-M7 | Project-local materialization, external read-semantics verification, diagnostics explain/why. |

---

## Required Execution Order

Do not parallelize milestones across dependency boundaries.

```text
M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7
```

Safe overlap:

- M4 can start after M2 if M3 is still finishing, because author commands do not write card-derived state yet.
- M5 must wait for both M3 and M4.
- M6 must wait for M5.
- M7 must wait for M6.

---

## Details Missing From The Master Plan

These are now captured in the phase docs:

1. **M0 status/doctor snapshot tests.** Risk R7 says these are needed before the diagnostics refactor; the M0 checklist now makes them explicit.
2. **JSON output safety during legacy warning.** Legacy-layout warnings must go to stderr and never corrupt `--json` stdout.
3. **Card name to npm package contract.** Cards resolved from npm use the card name as the npm package name; `package.json.name/version` must match `card.json.name/version`; fetched packages must contain `card.json` at package root.
4. **Non-interactive card authoring.** `card new` needs a scriptable way to set `authoring.scope`, such as `--scope @me`, otherwise CI and non-interactive use are brittle.
5. **Registry test seam.** Resolver code needs an injected registry client or fixture-backed resolver path for tests. Do not introduce network calls in CI.
6. **Per-project read verification gate.** M6 cannot open until Claude Code, Codex, and Cursor read semantics have been empirically checked or a compatibility decision is recorded.
7. **Docs integration.** The cards-era usage guide (`30_bgng-cli-usage-guide-cards-v1.md`) must be updated during M7 or release prep.
8. **Release verification command.** Prefer package scripts in handoff docs: `bun test`, `bun run typecheck`, `bun run verify:release`.

---

## Handoff Gates

Every phase handoff starts with:

```bash
git status --short --branch
bun test
bun run typecheck
```

Every phase handoff ends with:

```bash
bun test
bun run typecheck
```

The release phase additionally runs:

```bash
bun run verify:release
```

Run more targeted tests inside each TDD loop as described in the phase docs.

---

## Execution Notes

- Do not commit `.ai/` changes unless explicitly instructed.
- Each milestone should be a separate branch and PR.
- Keep commits narrow and prefix them per `.ai/rules/01_git.md`.
- If the current workspace is dirty, inspect before editing and avoid reverting unrelated work.
- If a phase-entry blocker fails, stop at that phase. Do not work around it silently.
