---
status: draft
date: 2026-06-26
scope: skills-repo-coverage-audit
skills_repo: /Users/pureicis/dev/darwinian-harness-skills
cli_repo: /Users/pureicis/dev/darwinian-harness
---

# Darwinian Skills Repo Coverage Audit Against Current Darwin CLI

ABOUTME: Audits the current darwinian-harness-skills repository against the post-PR-20 Darwin CLI feature set.
ABOUTME: Identifies covered workflows, missing core coverage, and recommended remediation before treating the skills bundle as current.

## Executive Summary

The current skills repo is structurally healthy and covers many of the pre-mind Darwinian Harness workflows: project bootstrap, installation, materialization, library management, defaults, card application, card authoring, card sharing, diagnostics, repair, analyzer support, and card-skill synchronization.

It is not yet fully aligned with the current Darwin CLI after the recent task 52 and task 53 work. The largest gaps are:

1. The public-facing terminology still says "Harness" across package metadata, bundle metadata, cards, docs, and skill names.
2. The new mind activation and composition workflow is not covered by skills.
3. The new mind card source commands for persona, beliefs, and memory are not covered.
4. The new card push visibility gate is not covered.
5. Materialization, inspection, and repair skills do not yet explain or diagnose generated mind outputs and active mind stack behavior.

The existing `@darwinian/harness-skills` card remains a valid tools-only setup card. It should not be mistaken for a canonical rich mind card: it bundles skills only, with no persona, belief, or memory content. A separate draft analysis already proposes an `@darwinian/operator-mind` card for that richer role.

## Evidence Reviewed

### CLI Repository State

Repository:

```text
/Users/pureicis/dev/darwinian-harness
```

Observed state:

```text
## main...origin/main
?? .ai/analyses/77_darwinian-operator-mind-card-investigation-and-strategy.md
```

The local `main` branch is synced to `origin/main` after PR 19 and PR 20 were merged. The existing untracked `77_...` analysis doc was treated as user or coworker work and was not modified.

### Skills Repository State

Repository:

```text
/Users/pureicis/dev/darwinian-harness-skills
```

Observed branch and recent commits:

```text
feat/sync-card-skills-skill
042b329 test(skills): validate bundle and card inventory
471869e docs(skills): align workflows with current cli features
7d3000c feat(skills): include sync-card-skills in stable bundle
84bd9af main feat(skills): add import-mcp-from-claude
```

The skills repo working tree was clean during the audit.

### Validation Commands Run

Skills bundle validation:

```bash
npm run validate:skills
```

Result:

```text
All skills valid (15 found)
```

Card skill sync:

```bash
npm run sync:cards -- --check 2>/dev/null || npm run sync:cards
```

Result:

```text
Synced card-bundled skills.
```

The sync command left the skills repo working tree clean. Note: the script currently appears to perform a sync rather than a true non-mutating check.

Current CLI card validation against the skills repo cards:

```bash
bun run cli/index.ts card validate file:/Users/pureicis/dev/darwinian-harness-skills/cards/harness-skills --json
bun run cli/index.ts card validate file:/Users/pureicis/dev/darwinian-harness-skills/cards/workspace-experimental --json
```

Results:

```text
@darwinian/harness-skills@0.2.0 valid
@darwinian/workspace-experimental@0.1.0 valid
```

Package dry run:

```bash
npm pack --dry-run --json
```

Result:

```text
darwinian-harness-skills@0.2.0
entryCount: 51
size: 54958
unpackedSize: 197344
```

## Current Skills Inventory

The top-level skills repo currently contains 15 skills:

| Skill | Current Role |
| --- | --- |
| `apply-harness-card` | Consume, apply, pin, update, detach, trust, and remove cards. |
| `author-harness-card` | Create and edit card sources, publish cards, validate cards, and inspect card diffs. |
| `bootstrap-project` | Initialize a project and select recommendations. |
| `import-mcp-from-claude` | Import MCP server definitions from Claude Desktop configuration. |
| `inspect-harness` | Inspect status, explain projection sources, run doctors, inspect cards, and dry-run writes. |
| `install-harness-project` | Install the Darwin CLI into a project. |
| `manage-defaults` | Manage default library entries and skill curation. |
| `manage-harness-library` | Manage library skills, MCP servers, packages, catalogs, and loose imports. |
| `materialize-harness` | Materialize repo/user skills and MCP config with `drwn write` and direct add commands. |
| `organize-workspace` | Placeholder for workspace scanning once `drwn scan` grows real behavior. |
| `recommend-harness` | Run recommendations and interpret recommendation output. |
| `repair-harness` | Repair projection drift, library issues, trust issues, and extension state. |
| `share-harness-card` | Push, fetch, clone, publish, validate, and manage catalogs/remotes. |
| `support-harness` | Export/analyze sessions and maintain the store. |
| `sync-card-skills` | Sync top-level skills into card-bundled skill copies. |

## Current Card Inventory

The repo contains two cards:

| Card | Status | Notes |
| --- | --- | --- |
| `@darwinian/harness-skills@0.2.0` | Valid | Stable tools-only card bundling 14 skills. It contains no persona, belief, or memory content. |
| `@darwinian/workspace-experimental@0.1.0` | Valid | Experimental workspace card. |

The stable card is currently named and described as a "Harness" card. It remains valid, but its name and display terminology lag behind the CLI renaming.

## CLI Coverage Matrix

### Project Bootstrap And Installation

Status: covered.

Relevant CLI surface:

```text
drwn init
drwn install
drwn recommend
drwn status
```

Covered by:

```text
bootstrap-project
install-harness-project
recommend-harness
inspect-harness
```

Notes:

- The basic new-project and existing-project onboarding path is represented.
- The skill text still uses old Harness language.

### Materialization And Direct Project Composition

Status: mostly covered, with mind-output gaps.

Relevant CLI surface:

```text
drwn write
drwn write --root
drwn write --user
drwn write --skills-only
drwn write --mcp-only
drwn write --strict-hooks
drwn add skill
drwn add mcp
```

Covered by:

```text
materialize-harness
inspect-harness
repair-harness
```

Gaps:

- The skills do not yet explain generated mind artifacts.
- The skills do not yet distinguish generated skills/MCP/hooks from generated mind bundle output.
- The skills do not yet document how active mind stack state changes what gets composed.

### Card Consumption Lifecycle

Status: covered for classic card workflows.

Relevant CLI surface:

```text
drwn card apply
drwn card add
drwn card update
drwn card outdated
drwn card pin
drwn card detach
drwn card trust
drwn card untrust
drwn card list
drwn card status
drwn card show
drwn card audit
drwn update
```

Covered by:

```text
apply-harness-card
inspect-harness
repair-harness
```

Gaps:

- The skills do not describe how card application interacts with active minds.
- The skills do not describe the difference between applying a card and activating a mind stack.

### Card Source Authoring

Status: partially covered.

Relevant classic CLI surface:

```text
drwn card new
drwn card source set
drwn card source add-skill
drwn card source remove-skill
drwn card source add-mcp
drwn card source remove-mcp
drwn card source add-hook
drwn card source remove-hook
drwn card publish
drwn card validate
drwn card diff
drwn card deprecate
```

Covered by:

```text
author-harness-card
sync-card-skills
```

Missing current mind-card source CLI surface:

```text
drwn card source add-persona
drwn card source remove-persona
drwn card source add-belief
drwn card source remove-belief
drwn card source add-memory
drwn card source remove-memory
```

Impact:

- The skills repo cannot yet guide an agent through authoring a current canonical mind card that includes persona, beliefs, or memory.
- The skills can still author tools-only cards.

### Mind Activation And Composition

Status: not covered.

Relevant CLI surface:

```text
drwn mind list
drwn mind use
drwn mind clear
```

Current expected concepts:

```text
activeMinds absent => all installed minds active
activeMinds [] => no minds active
activeMinds [ids...] => explicit active stack
```

Missing skill coverage:

- Listing available minds.
- Activating a single mind or composed mind stack.
- Clearing mind activation.
- Understanding default all-active behavior versus an explicit empty stack.
- Explaining how active minds affect generated output.
- Diagnosing stale generated mind content after activation changes.

Impact:

- This is a core post-task-53 workflow and should be treated as a high-priority skills gap.

### Card Distribution, Remotes, And Catalogs

Status: mostly covered, with visibility-gate gaps.

Relevant CLI surface:

```text
drwn card remote add
drwn card remote list
drwn card remote set
drwn card remote remove
drwn card push
drwn card fetch
drwn card clone
drwn card catalog publish
drwn card catalog validate
drwn catalog validate
```

Covered by:

```text
share-harness-card
manage-harness-library
```

Missing current visibility behavior:

```text
drwn card push --remote-visibility private
drwn card push --remote-visibility internal
drwn card push --remote-visibility public
drwn card push --unsafe-push-public
```

Impact:

- The skills do not yet guard against accidentally pushing cards with private or internal mind content to an unsafe destination.
- This is especially important now that cards can contain persona, belief, and memory material.

### Library, Defaults, Packages, And Curation

Status: covered.

Relevant CLI surface:

```text
drwn library add skill
drwn library add mcp
drwn library list skills
drwn library list mcps
drwn library list cards
drwn library defaults add
drwn library defaults remove
drwn library defaults list
drwn skills packages add
drwn skills packages list
drwn skills packages show
drwn skills curate
drwn skills uncurate
drwn skills list
```

Covered by:

```text
manage-harness-library
manage-defaults
materialize-harness
```

Notes:

- This remains one of the better-covered CLI domains.
- Public-facing terminology should be updated from Harness to Darwin/Darwinian Mind terminology.

### Diagnostics, Inspection, And Repair

Status: mostly covered, with mind-aware gaps.

Relevant CLI surface:

```text
drwn status
drwn status --why
drwn status --explain
drwn doctor
drwn extensions doctor
drwn extensions status
drwn card status
drwn store status
drwn write --dry-run
```

Covered by:

```text
inspect-harness
repair-harness
```

Gaps:

- No active mind stack diagnostics.
- No generated mind bundle inspection guidance.
- No explicit repair path for stale or unexpected persona/belief/memory projection.
- No guidance for deciding whether a mismatch is caused by card source content, activation state, or generated output drift.

### Store, Analyzer, And Support Workflows

Status: mostly covered.

Relevant CLI surface:

```text
drwn export sessions
drwn login
drwn logout
drwn whoami
drwn analyze sessions
drwn store status
drwn store verify
drwn store export
drwn store gc
drwn store seed
drwn store migrate-to-git
```

Covered by:

```text
support-harness
inspect-harness
repair-harness
```

Gaps:

- `store seed` is not covered.
- `store migrate-to-git` is not covered.
- Hook signal sidecar details are not explained. The hidden `hook card-usage` and `hook skill-marker` commands probably do not need user-facing skills, but support guidance could mention the artifacts they create when diagnosing noisy or missing signals.

### Extensions

Status: covered enough for current stable usage.

Relevant CLI surface:

```text
drwn extensions setup
drwn extensions list
drwn extensions show
drwn extensions add
drwn extensions doctor
drwn extensions status
```

Covered by:

```text
inspect-harness
repair-harness
```

Notes:

- The extension workflow is referenced in diagnostics and repair.
- If extensions become a central distribution path, a dedicated skill may eventually be useful.

### Workspace Scan

Status: intentionally placeholder.

Relevant CLI surface:

```text
drwn scan
```

Covered by:

```text
organize-workspace
```

Notes:

- Both CLI and skill are placeholder-level, so this is not currently a serious mismatch.

## Key Findings

### Finding 1: The Skills Repo Still Presents The Old Harness Brand

Severity: high.

Examples:

```text
package.json: darwinian-harness-skills
bundle.json: Darwinian Harness Skills
cards/harness-skills/card.json: @darwinian/harness-skills
skills/*: many skill names and docs use harness-card or Harness terms
```

Why it matters:

- The CLI has been renamed and the current conceptual center is Darwin/Darwinian Mind.
- New users and agents will search for the current CLI name, not the old Harness name.
- Old terminology makes the skills appear stale even when many workflows still work.

Recommended direction:

- Decide whether stable skill identifiers should remain backward-compatible while display text and documentation are updated.
- If skill directory names are renamed, provide a migration strategy or compatibility card. Skill ID churn could break existing references.
- At minimum, update package description, bundle display text, README prose, skill descriptions, and examples to use current Darwin CLI terminology.

### Finding 2: Mind Activation And Composition Are Missing

Severity: high.

Missing CLI surface:

```text
drwn mind list
drwn mind use
drwn mind clear
```

Why it matters:

- This is now core user-facing functionality.
- Active mind semantics are easy to misunderstand:

```text
activeMinds absent => all installed minds active
activeMinds [] => no minds active
activeMinds [ids...] => explicit active stack
```

Recommended direction:

- Add a dedicated skill such as `manage-active-mind-stack`.
- Cover listing minds, activating stacks, clearing activation, dry-run/materialization checks, and troubleshooting unexpected composed output.

### Finding 3: Mind Card Source Authoring Is Missing

Severity: high.

Missing CLI surface:

```text
drwn card source add-persona
drwn card source remove-persona
drwn card source add-belief
drwn card source remove-belief
drwn card source add-memory
drwn card source remove-memory
```

Why it matters:

- The current `author-harness-card` skill can author tools-only cards, but not the new canonical mind-card content.
- Agents following the skills repo would not know how to build or patch cards with persona, beliefs, or memory.

Recommended direction:

- Either extend the existing authoring skill or add a focused `author-mind-content` skill.
- Include validation and diff steps after each source mutation.
- Include safe patterns for small text snippets versus larger source files.

### Finding 4: Card Push Visibility Gates Are Missing

Severity: high.

Missing CLI surface:

```text
drwn card push --remote-visibility private
drwn card push --remote-visibility internal
drwn card push --remote-visibility public
drwn card push --unsafe-push-public
```

Why it matters:

- The risk profile changed once cards can carry mind content.
- A skill that teaches sharing without visibility checks can lead to unsafe publication workflows.

Recommended direction:

- Patch `share-harness-card` to make remote visibility classification a required publishing decision.
- Explain when `--unsafe-push-public` is acceptable and when it should be avoided.
- Include a pre-push audit sequence using `card show`, `card diff`, `card validate`, and remote visibility checks.

### Finding 5: Materialization, Inspection, And Repair Are Not Mind-Aware

Severity: medium.

Affected skills:

```text
materialize-harness
inspect-harness
repair-harness
apply-harness-card
```

Missing concepts:

- Generated mind output.
- Active mind stack state.
- Default all-active behavior.
- Explicit no-mind state.
- Drift between card source, activation config, and generated files.

Recommended direction:

- Patch materialization guidance to explain generated mind outputs alongside generated skill and MCP outputs.
- Patch inspection and repair guidance to include active stack checks and generated output checks.
- Include a smoke sequence that activates a mind, runs write, inspects generated output, clears minds, runs write again, and verifies the difference.

### Finding 6: Store Maintenance Is Missing A Few Current Commands

Severity: medium.

Missing CLI surface:

```text
drwn store seed
drwn store migrate-to-git
```

Why it matters:

- The support skill covers most analyzer and store maintenance tasks, but not all current store commands.

Recommended direction:

- Patch `support-harness` with cautious guidance for these operations.
- Treat migration as a deliberate maintenance operation with backup/export guidance first.

### Finding 7: Card-Bundled Skill Sync Lacks A True Check Mode

Severity: medium.

Observed behavior:

```bash
npm run sync:cards -- --check
```

appears to sync rather than perform a non-mutating check.

Why it matters:

- CI and review workflows benefit from a command that fails when card-bundled skill copies are stale without rewriting files.

Recommended direction:

- Add a `--check` mode to the sync script.
- Keep the mutating sync command for local maintenance.
- Add a CI-style validation command that combines `validate:skills`, card validation, and sync check.

### Finding 8: The Stable Card Is Tools-Only, Not A Rich Mind Card

Severity: medium.

Current `@darwinian/harness-skills` card:

```text
skills: included
servers: {}
persona: absent
beliefs: absent
memory: absent
```

Why it matters:

- The card is valid and useful.
- It does not demonstrate or exercise the canonical mind-card model.

Recommended direction:

- Preserve it as a tools-only setup card if backward compatibility matters.
- Add a separate rich mind card, likely `@darwinian/operator-mind`, as proposed in `.ai/analyses/77_darwinian-operator-mind-card-investigation-and-strategy.md`.
- Make the relationship explicit: one card installs operator skills, the other activates an operator mind.

## Recommended Remediation Plan

### Phase 1: Patch High-Risk Documentation And Skill Coverage

1. Add a mind activation skill:

```text
skills/manage-active-mind-stack/SKILL.md
```

Required coverage:

```text
drwn mind list
drwn mind use
drwn mind clear
activeMinds absent/all, []/none, [ids]/explicit stack
write/materialization verification
status/inspection verification
```

2. Add or patch mind content authoring coverage:

```text
skills/author-mind-content/SKILL.md
```

or patch:

```text
skills/author-harness-card/SKILL.md
```

Required coverage:

```text
card source add-persona/remove-persona
card source add-belief/remove-belief
card source add-memory/remove-memory
card validate
card diff
card show
```

3. Patch sharing coverage:

```text
skills/share-harness-card/SKILL.md
```

Required coverage:

```text
card push --remote-visibility private|internal|public
card push --unsafe-push-public
pre-push audit for mind content
```

4. Patch materialization, inspection, and repair:

```text
skills/materialize-harness/SKILL.md
skills/inspect-harness/SKILL.md
skills/repair-harness/SKILL.md
skills/apply-harness-card/SKILL.md
```

Required coverage:

```text
generated mind output
active stack diagnostics
mind-driven composition behavior
stale projection repair
```

### Phase 2: Rebrand Without Breaking Existing Users

Recommended approach:

1. Update display names, descriptions, README prose, examples, and command text to current Darwin CLI terminology.
2. Avoid renaming skill IDs until compatibility implications are clear.
3. If renaming skill directories is desired, introduce new skill IDs and keep old IDs available for at least one compatibility release.
4. Decide whether `@darwinian/harness-skills` should be renamed, aliased, or kept as a legacy-compatible card.

Candidate new names:

```text
darwinian-mind-skills
@darwinian/operator-skills
@darwinian/darwin-skills
@darwinian/operator-mind
```

The last name is better suited to a rich persona/belief/memory card than to the tools-only skills card.

### Phase 3: Add A Rich Mind Card

Build on the separate `77_...` analysis:

```text
.ai/analyses/77_darwinian-operator-mind-card-investigation-and-strategy.md
```

Recommended card role:

```text
@darwinian/operator-mind
```

Required content:

```text
persona
beliefs
memory
mind-aware skills
visibility-safe publication workflow
```

This card should intentionally exercise the canonical mind-card model rather than replacing the existing tools-only skills card by accident.

### Phase 4: Strengthen Skills Repo CI And Regression Tests

Recommended validation commands:

```bash
npm run validate:skills
npm run sync:cards -- --check
npm pack --dry-run --json
bun run cli/index.ts card validate file:/Users/pureicis/dev/darwinian-harness-skills/cards/harness-skills --json
bun run cli/index.ts card validate file:/Users/pureicis/dev/darwinian-harness-skills/cards/workspace-experimental --json
```

Recommended new tests:

1. Static command coverage check for core CLI strings in skill docs.
2. Card-bundled skill sync check mode.
3. Mind-card fixture validation with persona, belief, and memory content.
4. Bash smoke test in a temp project that:

```text
initializes a project
adds or applies a mind card
lists minds
activates a mind stack
writes generated output
clears minds
writes again
validates the generated output changes as expected
```

## Recommended Immediate Next Step

The skills repo should receive a focused update before being treated as current with the post-PR-20 CLI. The best next implementation scope is:

1. Add `manage-active-mind-stack`.
2. Add `author-mind-content` or patch authoring coverage equivalently.
3. Patch `share-harness-card` with visibility gate guidance.
4. Patch `materialize-harness`, `inspect-harness`, and `repair-harness` for mind-aware generated output.
5. Add a true `sync:cards -- --check` mode.
6. Re-run skills validation, card validation through the current CLI, package dry-run, and Bash smoke tests in an isolated temp project.

This would bring the skills repo from "valid and useful for classic card/library workflows" to "meaningfully current for Darwin CLI core functionality."
