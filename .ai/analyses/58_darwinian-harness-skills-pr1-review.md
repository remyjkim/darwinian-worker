# Darwinian Harness Skills PR #1 — Review

**Date**: 2026-06-04
**Author**: Claude + Remy
**Status**: Draft
**References**: [https://github.com/remyjkim/darwinian-harness-skills/pull/1, https://github.com/remyjkim/darwinian-harness-skills/pull/2, https://github.com/remyjkim/darwinian-harness-skills/pull/3, analyses/55_junggyu-review-rdecision-fix-strategies.md, tasks/35_junggyu-review-rdecision-fixes-implementation-plan.md, tasks/35_completion_junggyu-review-rdecision-fixes.md, cli/core/card-store.ts, cli/core/semver-utils.ts, cli/commands/card/new.ts, cli/core/authoring-scope.ts, cli/core/authoring-scope-probes.ts, https://github.com/remyjkim/darwinian-harness/commit/933757e]

---

## Executive Summary

`darwinian-harness-skills` PR #1 ("Refine author-harness-card and share-harness-card", by `junggyubae`, +112 / −22, 3 files) overlaps with the just-shipped drwn-side auto-derive (`darwinian-harness` commit `933757e` "Improve card authoring defaults") and with `darwinian-harness-skills` PR #2 ("docs(author-harness-card): reflect auto-derived scope on drwn card new"), which is the skill-side counterpart to that drwn change. The PR also introduces a new README-generation feature, an explicit `--scope` argument shape, and an owner-from-scope derivation step in `share-harness-card`.

Net assessment:

- The intent of the PR is correct and most of the changes are valuable.
- One block-blocker defect: the new `references/readme-template.md` documents `github:<owner>/<name>@latest` and `<scope>/<name>@latest`, which drwn does not support — parsing succeeds, resolution fails.
- One significant design conflict with PR #2 / drwn commit `933757e`: PR #1 has the **agent** probe `gh api user --jq .login` and pass `--scope @<login>` explicitly, while the drwn CLI now does that probe itself (and also walks `git config --global github.user` and the local-part of `user.email`). This duplicates work and pre-empts the CLI's interactive prompt and `machine.authoring.scope` persistence.
- The bug fixes from live testing (`--scope` requires `@` prefix; `card source show` requires fully-qualified name; always offer all three README sources) are accurate.
- The `share-harness-card` owner-from-scope derivation and the wider adoption of `AskUserQuestion` are net positive.

Recommended path: ask for a revised PR that resolves the merge conflict with PR #2 in favor of "let the CLI drive auto-derive," removes `@latest` from the template, keeps the bug fixes and the `share-harness-card` improvements, and either narrows the README-generation feature to its own follow-up PR or wires it through the CLI-driven scope rather than agent-side probes.

---

## Context

- **PR #1**: `https://github.com/remyjkim/darwinian-harness-skills/pull/1`, branch `refine-authorization`, base `main`. Author: junggyubae. Mergeable per GitHub. Updated 2026-06-04 02:01:51 UTC.
- **Files changed**:
  - `skills/author-harness-card/SKILL.md` — +51 / −17
  - `skills/author-harness-card/references/readme-template.md` — new file (+51)
  - `skills/share-harness-card/SKILL.md` — +10 / −5
- **Concurrent work**:
  - `darwinian-harness` commit `933757e` ("Improve card authoring defaults") added `gh api user`-based scope auto-derive at the CLI layer. The CLI itself probes `gh`, falls through to `git config --global github.user` and the local-part of `user.email`, and either prompts (TTY) or surfaces a hint (non-TTY).
  - `darwinian-harness-skills` PR #2 (mine; merged-equivalent state on the branch) tells the agent to *let* the CLI drive that prompt and only intervene when there is a concrete reason the derived handle is wrong.
  - `darwinian-harness-skills` PR #3 (mine) swept `@me/minimal-card` from `examples/cards/`.

PR #1 has not been rebased against either of those. The diff against `main` looks clean because PR #2 and PR #3 are still open. A merge of PR #1 first, then PR #2, would conflict on `skills/author-harness-card/SKILL.md` at the `## Procedure → 3. For card new` block. Both PRs rewrite the same lines.

---

## Investigation

### 1. Scope resolution — PR #1's approach

PR #1 rewrites procedure step 3.2 of `author-harness-card` to:

> If the name is unscoped, resolve a default scope from the authenticated GitHub identity:
>   1. Run `gh api user --jq .login`. If it succeeds, propose `@<login>/<name>` as the default scope so the card namespace matches the author's GitHub account and avoids future marketplace conflicts.
>   2. If `gh` is unavailable or returns an error, ask the user to provide an explicit `--scope=@<scope>`. Do not fall back to `@me` as a scope because `@me` collides across users in a shared marketplace.

Then 3.3:

> On approval, run `drwn card new <name> --scope @<login> [--no-git]`. The `--scope` value must include the `@` prefix (e.g. `@acme`); `drwn` rejects bare usernames without it.

**This is the agent doing what the CLI now does.** The drwn CLI's resolver (`cli/core/authoring-scope.ts:resolveScopeForCardNew` and `cli/core/authoring-scope-probes.ts`) runs `gh api user -q .login` first, then `git config --global github.user`, then the local-part of `user.email`. In a TTY, the CLI prompts the user with the derived `@<handle>`. In a non-TTY, the CLI exits with an error whose message includes the detected handle. The CLI also persists the chosen scope to `machine.authoring.scope` so the second `drwn card new` does not re-prompt.

Consequences of the PR-1 approach when the CLI also has auto-derive shipped:

| Behavior | PR #1's flow | CLI auto-derive (shipped) |
|---|---|---|
| Probes `gh api user` | yes, agent-side | yes, CLI-side |
| Falls back to `git config github.user` | no | yes |
| Falls back to email local-part | no | yes |
| Lowercases the handle | no | yes |
| Prompts the user to confirm | yes, via `AskUserQuestion` | yes, via readline prompt in TTY |
| Persists to `machine.authoring.scope` | yes (drwn does this on any `--scope` it receives) | yes |
| Works in non-TTY (e.g. CI) | only if `gh` is authenticated | yes (or surfaces a precise hint when not) |
| Handles multi-identity / org override | requires user override | requires user override |

The agent-side probe is strictly less capable: it has one fewer fallback step, doesn't normalize case, and doesn't see the persistent scope cache. It also burns a subprocess invocation on every `card new` even when the CLI would have resolved silently from saved state.

There is one good thing about the PR-1 approach: it makes the policy choice explicit in the skill ("never fall back to `@me`"), which is a stricter posture than the CLI takes. The CLI accepts `@me` if the user supplies it; the skill should still refuse to suggest it. PR #2's text already reflects this implicitly (it never names `@me` as a candidate), but PR #1 says it out loud, which is useful.

### 2. The `@latest` selector — block-blocker defect in the README template

The new `references/readme-template.md` includes:

```sh
drwn card clone github:<owner>/<name>@latest
```

and

```sh
drwn card apply <scope>/<name>@latest
```

**Neither command works.** Walking the drwn ref parser:

- `parseCardRef("@scope/name@latest")` (`cli/core/card-store.ts:136-158`) finds the last `@`, sets `range: "latest"`, and routes the ref to the store resolver.
- The store resolver passes `"latest"` to `semver.maxSatisfying` via `validRange` (`cli/core/semver-utils.ts:10-12`).
- `semver.validRange("latest")` returns `null`, so the range is rejected before any version lookup.

For `github:` shorthand:

- `parseGitHostShorthand("github:owner/name@latest")` (`cli/core/card-store.ts:185-204`) parses fine and produces `{ gitUrl: "https://github.com/owner/name.git", gitRange: "latest" }`.
- The git ref resolver then tries to satisfy `"latest"` against the tag list using the same semver path, with the same `null` outcome.

The only valid selectors for a card ref are:

- a strict version: `@1.0.0`
- a semver range: `@^1.0.0`, `@~1.0.0`, `@1.x`
- a git tag, with `#`: `github:owner/name#v1.0.0` or `git+https://...#v1.0.0`
- omitted, which the parser treats as `*` (latest available locally, but only for store refs that have at least one published version)

The template ships into every README authored from now on. Users who follow it verbatim will hit a parse-or-resolve error on first try. This needs to land as either:

- `@^1.0.0` (recommended for normal consumption — gives latest within the same major)
- `@1.x` (broader)
- `#v<latest-version>` (explicit tag) for the `github:` example

### 3. README-generation feature — orthogonal scope expansion

PR #1 adds a substantial new sub-feature: after `drwn card new`, the agent should ask the user (via `AskUserQuestion`) how to source the card README. Three options: auto-generate from bundled skills, manual entry, or skip. The result writes to `~/.agents/drwn/sources/<scope>/<name>/README.md` using the template.

Observations:

- This is a scope expansion beyond what the PR title suggests ("Refine author-harness-card and share-harness-card"). It is a new capability, not a refinement.
- It is logically orthogonal to the scope-resolution change. The merge of the two into one PR makes review harder and makes the README defect (issue #2 above) blocker-coupled to a separate change.
- The "Auto-generate" branch instructs the agent to "read each bundled skill's `SKILL.md` and derive the value proposition, capabilities, and audience." `drwn card new` creates an empty card; there are no bundled skills yet at that point. PR #1 acknowledges this and says "if no skills are bundled yet, inform the user and ask them to add skills first or switch to manual entry," which makes the Auto-generate option a no-op on the first invocation. That is reasonable, but it means the Auto-generate option is misleading in the moment it is offered.
- The template is written to the source directory, where it will be picked up by `drwn card publish` (sources are committed wholesale into the bare card repo). Good — no separate publish-time hook needed.
- "What's included" instructs the agent to populate from `bundledSkills` and `mcpServers` in `drwn card source show --json`. Those fields exist; this is correct.
- "Installation" recommends running `drwn init` before `drwn card apply`. Reasonable for first-time consumers; potentially noisy for users who already have a project. The template could note both paths or be more terse here.

### 4. Bug fixes from live testing

PR #1 calls out three bug fixes from live testing:

#### 4a. `--scope` requires the `@` prefix

Verified. `cli/core/card-store.ts:130` enforces `^@[a-z0-9-]+$` — a bare username like `acme` would throw "Invalid card scope: acme." PR #1's explicit reminder ("the `--scope` value must include the `@` prefix") is correct and useful.

#### 4b. `drwn card source show` requires a fully-qualified name

Verified in spirit by the existing CLI examples in `cli/commands/card/source/show.ts` (which always use `@scope/name`). The skill change is to always pass the fully-qualified name, not the bare card name. This avoids a class of test-failure reports where the agent passed the unscoped name and got "Card source not found." Correct.

#### 4c. Always show all three README source options

This is a corollary of the README-generation feature. Reasonable as long as the feature lands.

### 5. `share-harness-card` improvements

PR #1's changes to `share-harness-card`:

> Derive the default `<owner>/<repo>` from the card ref: owner is the scope without `@` (e.g. `@acme` → `acme`; fallback to `gh api user --jq .login` if the scope is not a valid GitHub user or org); repo name is the bare card name (e.g. `@acme/my-card` → `my-card`). Confirm with the user via `AskUserQuestion` before proceeding.

Notes:

- The mapping `@<scope>/<name>` → `<scope>/<name>` for GitHub is the natural assumption and aligns with how `drwn card push` is generally used (the `drwn` repo's own docs assume the same).
- The fallback "if the scope is not a valid GitHub user or org" is hard to determine without making a network call. `gh repo view <owner>/<repo>` is the next step regardless, so the conditional adds a layer that may not be necessary. A simpler rule — "use scope as-is; fall back to `gh api user` only when the user explicitly says the scope isn't a real GitHub owner" — would be easier to implement reliably.
- Renumbering the procedure from 3,4,5 to 4,5,6 is fine; all `Wraps` references stay in sync because the section is a flat list.

### 6. `AskUserQuestion` rollout

PR #1 standardizes on `AskUserQuestion` for every decision point in `author-harness-card`. This is a UX improvement — clickable options beat typed responses for confirm/deny flows.

One small inconsistency: PR #1's "User-Ask Points" preamble says "Never ask multiple separate questions sequentially when they can be batched into one prompt." That is a sensible policy but isn't enforced anywhere else in the file, and step 3.2 still has a logically separate confirmation for the auto-derived scope, then a separate one for README source. That is acceptable in this case (different decisions), but worth flagging if the policy becomes a project-wide pattern.

---

## Findings

1. **PR #1 conflicts with PR #2 on `skills/author-harness-card/SKILL.md` step 3.** Both rewrite the same lines. A textual merge is impossible; a decision is needed about which posture wins (let the CLI drive vs. have the agent drive).

2. **PR #1's agent-side `gh` probe duplicates the CLI-side probe shipped in commit `933757e`.** This is not a correctness bug — it works — but it is strictly less capable (one fallback vs. three; no case normalization), bypasses the CLI's TTY prompt and `machine.authoring.scope` persistence, and burns a subprocess per `card new`.

3. **PR #1's `references/readme-template.md` ships invalid drwn syntax.** `github:<owner>/<name>@latest` and `<scope>/<name>@latest` both fail at resolution because `semver.validRange("latest") === null`. This is a block-blocker; every user of the template will hit the same error.

4. **PR #1's explicit ban on `@me` in the skill is a useful policy statement.** The drwn CLI still accepts `@me` if a user supplies it (we intentionally didn't break existing users); the skill correctly refuses to *suggest* it.

5. **PR #1's three live-testing bug fixes are accurate.** The `--scope` `@` prefix requirement, the FQN requirement for `card source show`, and the always-three-options policy for README sourcing are all correct.

6. **PR #1's README-generation feature is a scope expansion masquerading as a refinement.** It is also coupled to defect #3 above. Splitting it into a follow-up PR would let the author-card refinements land sooner, and would give the README feature its own review.

7. **PR #1's `share-harness-card` derivation rule is sound but the fallback condition is loosely specified.** "Not a valid GitHub user or org" is not testable without a network call.

8. **PR #1's `AskUserQuestion` rollout is positive.** It modernizes a skill that was written before clickable options were a standard pattern.

---

## Recommendations

### To request from the PR author (in order of priority)

1. **Fix the `@latest` selector in `references/readme-template.md`.** Replace with one of:
   - `@^1.0.0` for the published-card install pattern.
   - `#v1.0.0` (or the actual tag) for the `github:` shorthand.
   Both should match what the CLI actually resolves today; the docs site's existing card examples use `@^1.0.0`.

2. **Rebase PR #1 against `main` after PR #2 and PR #3 merge.** Resolve the procedure-step-3 conflict by combining:
   - the **CLI-drives-prompt posture** from PR #2 (let `drwn card new` resolve the scope; the agent only intervenes when there's a concrete reason)
   - the **explicit `@me` ban** from PR #1 (keep that as a failure-mode rule)
   - the **bug-fix call-outs** from PR #1 (`--scope` requires `@`; `card source show` requires FQN)

3. **Split the README-generation feature into its own PR.** The scope-resolution and bug-fix changes are clean; the README feature deserves a focused review and probably its own iteration on the template. The Auto-generate branch in particular is a no-op on the first `card new` and may be confusing without more guard text.

4. **Tighten the `share-harness-card` owner-derivation fallback.** Either drop the "if the scope is not a valid GitHub user or org" condition (let `gh repo view` surface the error naturally) or define the test as a concrete shell check the agent can run.

### To preserve from PR #1

- The `gh api user --jq .login` line in `Wraps` (the skill should declare every tool it touches even when the CLI also touches it).
- The `AskUserQuestion` adoption throughout.
- The User-Ask Points reordering (the new numbering reads more naturally given the README step).
- The explicit ban on `@me` as a fallback (move it to the failure-mode section as a policy reminder).
- The `--scope @` prefix call-out (keep as a procedure note and a failure-mode line).
- The FQN-required call-out for `card source show`.

### A suggested combined revision

A single rewritten step 3.2 might look like:

> 3.2 If the name is unscoped, prefer letting `drwn card new` resolve the scope itself. The CLI probes `gh api user -q .login`, then `git config --global github.user`, then the local-part of `user.email`, and either (in a TTY) prompts the user to confirm the derived `@<handle>` scope or (in a non-TTY) exits with a hint that names the detected handle so the caller can rerun with `--scope @<handle>`. Surface that prompt or hint to the user verbatim. Never suggest `@me`; if the CLI's hint produces no candidate, ask the user for an explicit `@<scope>` (the value must include the `@` prefix — `drwn` rejects bare names).

That single block subsumes PR #1's intent (explicit `@me` ban, `--scope` prefix call-out) with PR #2's posture (CLI does the work). It is shorter than either current draft.

---

## Open Questions

| Question | Notes |
|---|---|
| Does the project want README generation in `author-harness-card`, or is it a separate skill (`author-card-readme`)? | A separate skill is cleaner; the author-card flow already has a lot of steps. |
| Should the README template's "Installation" section recommend `drwn init` unconditionally? | Probably not. Existing projects don't need it; new projects do. A one-line conditional reads better than two distinct paths. |
| Should the skill enforce the lowercase rule for scopes? | The CLI does (`^@[a-z0-9-]+$`). The skill currently doesn't say. A one-line failure-mode note would prevent confusing errors. |
| Should `share-harness-card` also probe for repo visibility defaults? | PR #1 currently asks the user via `AskUserQuestion`. That's correct — auto-default to public or private would be a worse failure mode than a one-click confirmation. |
| Where should this analysis live? | This doc is in `darwinian-harness/.ai/analyses/` per the cross-cutting convention used for analysis 55 / 56 / 57. The skills-repo `.ai/analyses/` is more appropriate for skill-internal reviews; this one touches the CLI-vs-skill boundary, which is cross-cutting. |

---

## Appendix

### Direct-quote of the conflicting blocks

**PR #1 step 3.2–3.3 (proposed):**

```text
2. If the name is unscoped, resolve a default scope from the authenticated
   GitHub identity:
   1. Run `gh api user --jq .login`. If it succeeds, propose
      `@<login>/<name>` as the default scope so the card namespace matches
      the author's GitHub account and avoids future marketplace conflicts.
   2. If `gh` is unavailable or returns an error, ask the user to provide
      an explicit `--scope=@<scope>`. Do not fall back to `@me` as a scope
      because `@me` collides across users in a shared marketplace.
3. On approval, run `drwn card new <name> --scope @<login> [--no-git]`.
   The `--scope` value must include the `@` prefix (e.g. `@acme`);
   `drwn` rejects bare usernames without it.
```

**PR #2 step 3.2–3.4 (proposed):**

```text
2. If the name is unscoped, prefer letting `drwn card new` resolve the
   scope itself: when no `--scope` is given and `authoring.scope` is not
   yet saved in `machine.json`, the CLI probes `gh api user -q .login`,
   then `git config --global github.user`, then the local-part of
   `user.email`, and either (in a TTY) prompts the user to confirm the
   derived `@<handle>` scope or (in a non-TTY) exits with an error whose
   message includes the detected handle so the caller can rerun with
   `--scope @<handle>`. There is no dedicated read-only CLI command for
   checking saved `authoring.scope`.
3. Only ask the user for `--scope` directly when there is a concrete
   reason the auto-derived handle would be wrong (shared machine, multiple
   GitHub identities, intentionally publishing under an org or team scope
   such as `@curation-labs`).
4. On approval, run `drwn card new <name> [--scope <scope>] [--no-git]`.
   If the CLI prints an auto-derive prompt or error, surface it verbatim
   and let the user accept the suggestion or supply an override.
```

### Direct-quote of the `@latest` defect in `references/readme-template.md`

```sh
drwn card clone github:<owner>/<name>@latest
...
drwn card apply <scope>/<name>@latest
```

### Code citations supporting the `@latest` claim

- `cli/core/card-store.ts:136-158` — `parseCardRef` splits on the last `@` and sets `range` to the suffix verbatim.
- `cli/core/card-store.ts:185-204` — `parseGitHostShorthand` does the same for `github:` and `gitlab:` refs.
- `cli/core/semver-utils.ts:10-12` — `validRange` is a thin wrapper over `semver.validRange`. `semver.validRange("latest")` returns `null`, so the range is rejected before any catalog or store lookup.

### Pointers to the drwn-side auto-derive

- `cli/core/authoring-scope.ts` — `deriveAuthoringScopeFromProbeResults`, `probeAuthoringScope`, `resolveScopeForCardNew`.
- `cli/core/authoring-scope-probes.ts` — `defaultProbeGh`, `defaultProbeGit`.
- `cli/commands/card/new.ts` (post `933757e`) — wires the resolver in.
- Tests: `test/core-authoring-scope.test.ts`, `test/core-authoring-scope-resolve.test.ts`, `test/commands-card-new-autoderive.test.ts`.

### Verification commands used during this review

```bash
# Confirm @latest is not a valid range.
node -e 'console.log(require("semver").validRange("latest"))'    # → null

# Confirm parseCardRef behavior.
bun -e 'import {parseCardRef} from "./cli/core/card-store"; console.log(parseCardRef("@scope/name@latest"))'

# Confirm zero @latest references exist in the drwn core or docs.
grep -rn '@latest' cli/core/card-store.ts cli/core/card-manifest.ts docs-docusaurus/docs/
```
