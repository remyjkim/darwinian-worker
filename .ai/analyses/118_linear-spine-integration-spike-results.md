# ABOUTME: Verification spike results for the CL Issue-driven Workflow v0.3 proposal (Linear as spine).
# ABOUTME: Verifies Slack thread sync, multi-PR automation, and state configurability against Linear docs and the live CL workspace.

# Linear-Spine Integration Verification Spike

**Date**: 2026-07-14
**Author**: Claude + Remy
**Status**: Final
**Method**: Current Linear documentation (fetched 2026-07-14) + read-only GraphQL inspection of the live `curation-labs` Linear workspace (authenticated via the existing `linear-cli` keychain credential, account `mind001@curationlabs.ai`).
**References**: [Notion: CL Issue-driven Workflow v0.1 (393f1fbef8c280a19203d5068a381ec2), Notion: v0.2 Proposal (39ef1fbef8c281079c1cfb28dc385c10), https://linear.app/docs/slack, https://linear.app/docs/github, https://linear.app/docs/configuring-workflows, https://linear.app/docs/parent-and-sub-issues]

---

## Executive Summary

All three spike questions are answered. The v0.3 design (Linear spine + repo-resident docs + docs-PR gates) is viable as proposed, with two protocol adjustments forced by verified behavior: (1) Slack thread sync only exists for issues **created from a Slack message**, so the issue-birth ritual must start in Slack if full mirroring is wanted; (2) Linear's parent/sub-issue automation makes it possible — and attractive — to model **knowledge capture as its own sub-issue**, so the parent issue structurally cannot complete until the completion doc merges. The multi-PR concern that motivated the sub-issue-per-gate model turns out to be safe in the direction feared (no premature auto-close) but wrong in a different direction (premature *In Progress* on first PR open), which still argues for sub-issues.

Live workspace findings: `curation-labs` has one team (`CLDEV`) with stock workflow states, a GitHub integration installed since 2024-07, a personal code-access grant added 2026-07-03, and **no Slack integration installed**.

---

## Q1 — Slack thread sync: bidirectional, but only Slack-born

**Verdict: CONFIRMED, with a hard constraint.**

- Thread sync is genuinely bidirectional: "Comments made in the synced Linear thread will also appear in Slack, and the Slack thread will be updated when the issue is completed, canceled, or marked as a duplicate." Comments "stay in sync between Linear and Slack."
- **Constraint**: a synced thread is created only via "More actions → Connect to apps → Create new issue…" **on a Slack message**. There is no documented way to attach a synced thread to an issue born inside Linear.
- Channel subscriptions (team/project/initiative → channel) post issue creation, comments, status changes, and project updates — but these are **one-way notifications; replies do not sync back**.
- Slack integration is **not currently installed** in the CL workspace (verified via the `integrations` query: only `github` and `githubCodeAccessPersonal` present).

**Protocol consequence**: v0.1's Phase 1 habit ("Post in Slack: New #N") survives inverted — the Slack post comes *first*, and the issue is created *from* it. That single ordering choice buys full conversation mirroring. Issues created directly in Linear degrade gracefully to one-way channel notifications.

## Q2 — GitHub automation with multiple PRs per issue

**Verdict: SAFE on close, WRONG on intermediate transitions; sub-issue-per-PR model confirmed as the fix.**

- Multi-PR close behavior (exact doc wording): "if you have 2 PRs linked to 1 issue, you'll need merge both PRs before the Linear issue status will change." The issue advances on the **last** merge, not the first — the premature-auto-close fear in the v0.3 sketch was unfounded.
- However, intermediate events fire immediately: a linked PR being *opened* moves the issue to In Progress (default), and drafted / review-requested / ready-for-merge each have configurable state mappings. With arch, plan, and impl PRs all linked to one parent, the **first docs PR would drag the parent's state around during Architecting** — wrong for the 7-phase model.
- Automation configuration is **per-team** (Settings → Team → Workflows & automations → Pull request and commit automations), with **branch-specific rules** available (different automations per target branch). Not per-repository.
- "Ready for merge" automation only triggers when GitHub reports the PR stable: "If any check (including non-required checks) fails … the automation will not trigger."
- Sub-issue automation (per-team optional settings): "When all sub-issues are marked as done, the parent issue will also be marked as done automatically," and critically: "Status changes triggered by Git integrations will also respect these automations." Sub-issues inherit the parent's team, priority, and project.

**Protocol consequence**: the DRW-42 parent + per-gate sub-issue model works cleanly — each sub-issue links 1:1 to a PR, so every automation event on a sub-issue is meaningful, and the parent's phase states are flipped by the Owner at gates (exactly the approval semantics we want to stay manual). The verified chain: sub-issue PR merges → sub-issue auto-Done → when *all* sub-issues Done → parent auto-Done.

## Q3 — Custom states and configuration granularity

**Verdict: CONFIRMED.**

- Teams create custom states within the fixed category order Backlog > Unstarted > Started > Completed > Canceled (+ reserved Duplicate). No documented cap. States and automations are per-team ("These workflows are team-specific").
- The 7-phase model maps: Started category → Architecting, Planned, Building, In Review; Completed category → Merged, Knowledge-captured. Blocked → native blocked-by relations.
- Live workspace: `CLDEV` currently has stock states (Backlog / Todo / In Progress / In Review / Done / Canceled / Duplicate) — the custom states are a to-create migration item, not a conflict.

---

## Design discovery: knowledge capture as a sub-issue

The parent-auto-close rule composes into something better than v0.1's "📝 Needs knowledge view as conscience":

```
DRW-42 [parent — 7-phase state, synced Slack thread]
 ├─ DRW-43  Architecture doc    → docs PR   (GATE 1)
 ├─ DRW-44  Implementation plan → docs PR   (GATE 2)
 ├─ DRW-45  Implementation      → impl PR   (GATE 3)
 └─ DRW-46  Knowledge capture   → completion-doc PR (+ knowledges/ deltas)
```

With parent-auto-close enabled, the parent **cannot reach Done while DRW-46 is open**. Knowledge capture stops being a view you feel guilty about and becomes a structural precondition of completion — and the completion doc gets a reviewed PR like every other artifact. This should be written into the v0.3 proposal.

Open sub-question for the sandbox (minor): when parent-auto-close fires and the team has two Completed-category states (Merged, Knowledge-captured), verify which one it selects; if it picks the wrong default, the Owner flip stays manual (equal to v0.1's cost).

---

## Remaining hands-on items (need workspace changes; not testable read-only)

1. **Install the Slack integration** in the CL workspace; create an issue from a Slack message; verify comment sync latency/fidelity in both directions and lifecycle updates in the thread.
2. **Sandbox team** (e.g. `SPIKE`): create the 7 custom states; configure PR automations (drafted/opened/review-requested/merged mappings); link a scratch repo; run one parent + sub-issue thread end-to-end with real PRs.
3. Verify the parent-auto-close target-state question above.
4. Confirm sub-issue → Slack behavior: only the parent (Slack-born) issue carries a synced thread; sub-issue activity should reach the channel only via subscriptions.

## Recommendation

Proceed with drafting the v0.3 proposal. No verified fact blocks the design; the two adjustments (Slack-born issue birth ritual, knowledge-capture sub-issue) both *improve* the protocol relative to the sketch. The hands-on items are confirmatory and can run during the pilot rather than before the proposal.
