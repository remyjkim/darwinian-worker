# ABOUTME: Implementation plan for shipping Notion MCP access via Darwinian Harness as @remyjkim/notion-agent@1.0.0.
# ABOUTME: Registry-backed authoring + card distribution + OAuth-delegated auth across Claude Code, Codex, and Cursor.

# Task 46 — Implementation Plan: `@remyjkim/notion-agent@1.0.0`

**Status**: Completed for no-commit source/materialization scope
**Created**: 2026-06-15
**Updated**: 2026-06-16
**Assigned**: Remy + Claude
**Priority**: Medium
**Estimated Effort**: 0.5–1 day for source authoring + materialization smoke; publish/push deferred by no-commit constraint; Phase 5 is a separate follow-on task
**Dependencies**: built-in `registry/mcp-servers.json` entry for `notion` + `drwn card source add-mcp` + `drwn card source doctor` + `drwn card apply`/`write` (all present today)
**References**: [analyses/64_darwinian-notion-mcp-target-architecture.md, analyses/63_notion_mcp_manual.md, analyses/35_notion_mcp_manual.md, registry/mcp-servers.json, registry/config.json, cli/core/mcp.ts, cli/core/card-source.ts, cli/commands/library/show.ts, cli/commands/card/source/add-mcp.ts]

---

## Objective

Deliver a single, applicable Darwinian Harness Card source — `@remyjkim/notion-agent@1.0.0` — that wires Notion's official hosted MCP server (`https://mcp.notion.com/mcp`) into Claude Code, Codex, and Cursor uniformly, with curated workflow skills for coding agents. Authoring is registry-backed; the built-in `notion` MCP entry can later be reused across other cards by id.

## Target State

After this task completes:

- The built-in MCP registry entry under id `notion` verified via `drwn library show notion --json` (`source: "registry"`).
- A validated no-git editable card source `@remyjkim/notion-agent@1.0.0`, containing the Notion MCP server entry plus 4 starter workflow skills.
- Publishing and pushing are deferred for this run because the execution constraint is no new commits.
- A scratch project demonstrating end-to-end consumption: `drwn card apply` + `drwn write` materializes the Notion config into Claude Code's project `.mcp.json`, `.codex/config.toml`, and `.cursor/mcp.json` correctly.
- OAuth completed in at least one tool, with a successful `notion-search` smoke test confirming agent ↔ Notion data flow.
- The reuse pattern documented in plain commands so adding the built-in Notion server to other cards later is a single `drwn card source add-mcp <other-card> notion` call.

## Success Criteria

- [x] `drwn library show notion --json` returns the built-in registry server entry (`source: "registry"`).
- [x] `drwn card source doctor @remyjkim/notion-agent --json` reports `ok: true`, zero issues.
- [x] `drwn card source show @remyjkim/notion-agent --json` lists 4 bundled skills + 1 MCP file.
- [x] Card applies cleanly to a fresh empty project; `drwn write --dry-run --json` shows the intended config writes + all 4 card skill symlinks with zero warnings, and the subsequent scratch-project `drwn write` lands the Notion entry in all three downstream tool configs.
- [ ] Smoke test in Claude Code (post-OAuth): `notion-search "anything"` returns workspace results. Deferred because OAuth is user/client-specific; server endpoint was verified live and OAuth-gated.
- [x] No `claude mcp add`, `codex mcp add`, or equivalent direct tool add commands are used; Notion reaches tool configs only through `drwn card apply` + `drwn write`.
- [x] Local publish/push is skipped for this run to honor the no-new-commits constraint.
- [x] This plan doc is updated to **Completed** with a sibling `46_completion_darwinian-notion-mcp.md` summarizing what shipped + per-tool OAuth notes + any deviations from this plan.

## Alternatives Considered

### Option A — Registry-backed authoring + card distribution (CHOSEN)

Use the built-in Notion MCP registry entry from `registry/mcp-servers.json`. Reference it from this card source (and any future card) via `drwn card source add-mcp <card> notion`. Drwn copies the JSON into the card source at authoring time, so the source is self-contained and can be published later.

- **Pro**: Consistent definition across cards (no copy-paste). Trivial to add Notion to a future card. The registry entry is independently testable via `drwn library show notion --json` plus scratch-project dry-run/write/inspect.
- **Pro**: Avoids a now-invalid local-library registration step. `notion` already exists in the built-in registry, so `drwn library add mcp ... --as notion` correctly rejects it as a collision.
- **Con**: Registry updates don't auto-propagate to already-authored cards — re-bake into each card with `add-mcp --replace`, bump version, republish when publishing is allowed. Acceptable for our scale (1–5 cards expected).

### Option B — Direct card-only authoring (hand-write `mcp-servers/notion.json`)

Skip the registry-backed `add-mcp` resolver; write `mcp-servers/notion.json` + the matching `card.json.servers.notion` block by hand in each card.

- **Pro**: One fewer command. No resolver dependency.
- **Con**: Duplicates the JSON definition in every card. `card source doctor` requires the manifest server entry and `mcp-servers/<id>.json` to be canonically equivalent, so any edit must touch two files in two places per card. Doesn't scale beyond one card.

### Option C — Built-in registry / machine default only, no card

Use the built-in registry entry directly, optionally via `drwn library defaults add mcp notion`. Skip the card entirely.

- **Pro**: Simplest possible; one OAuth per tool, every project on this machine gets Notion automatically. In the current packaged config, `optional.notion = true`, so Notion already appears in project writes unless a project overrides it.
- **Con**: No way to ship Notion-specific workflow skills bundled with the server entry. No team distribution path. No per-project scoping.
- **Verdict**: Fine as a personal escape hatch; doesn't replace the card for team / portable use. Documented as the hybrid in analysis 64.

**Decision (2026-06-16):** Option A, revised to registry-backed authoring after verifying `notion` is already present in `registry/mcp-servers.json`. Execute this run as `@remyjkim/notion-agent`, with publish/push deferred because the run must not create commits.

## Strategy

Five phases. Phases 1–3 require **zero drwn code changes** and produce a validated no-git `@remyjkim/notion-agent@1.0.0` source plus scratch-project materialization proof. Phase 4 publish/push is deferred by the no-commit constraint. Phase 5 (auth observability) is a follow-on drwn-side feature that gets its own task plan when the diagnostic UX becomes blocking.

Each phase below lists: concrete tasks, commands, verification steps, acceptance criteria.

---

## Implementation Plan

### Phase 1 — Verify the built-in Notion MCP registry entry (smoke-test standalone)

Goal: prove the built-in registry definition renders correctly into all three tool formats before involving a card.

**Tasks:**

- [x] Confirm the repo state:
  ```bash
  rg -n '"notion"' registry/mcp-servers.json registry/config.json
  ```
  Expected: `registry/mcp-servers.json` contains `servers.notion`, and `registry/config.json` currently has `optional.notion = true`.
- [x] Verify the exposed inventory entry:
  ```bash
  drwn library show notion --json
  ```
  Expected: `id: "notion"`, `kind: "mcp"`, `source: "registry"`, `server.transport: "http"`, `server.url: "https://mcp.notion.com/mcp"`.
- [x] Smoke test in a throwaway project (no card yet):
  ```bash
  rm -rf /tmp/notion-registry-check && mkdir -p /tmp/notion-registry-check && cd /tmp/notion-registry-check
  drwn init --non-interactive
  drwn write --dry-run --json
  drwn write
  ```
- [x] Inspect the dry-run output and confirm writes are planned for all three tool configs with `warnings: []`. If a future packaged config disables `optional.notion`, run `drwn add mcp notion` in the scratch project and rerun dry-run/write; do **not** add a local library entry.
- [x] Inspect the landed scratch files and confirm three rendered configs:
  - `.mcp.json` → `mcpServers.notion = { type: "http", url: "https://mcp.notion.com/mcp" }`
  - `.codex/config.toml` → `[mcp_servers.notion]` with `url` + `enabled = true`
  - `.cursor/mcp.json` → `mcpServers.notion = { type: "http", url: "..." }`
- [x] Tear down the scratch project after inspection. No writes should occur outside `/tmp/notion-registry-check`.

**Acceptance for Phase 1:**

- [x] `drwn library show notion --json` returns the built-in entry with `source: "registry"`.
- [x] Dry-run output plans all three tool config writes without warnings.
- [x] Scratch write renders the entry into all three tool formats.
- [x] No writes to non-scratch `.claude/`, `.codex/`, or `.cursor/` paths.

---

### Phase 2 — Author the card source `@remyjkim/notion-agent`

Goal: build the card source with the registry-resolved MCP entry + 4 starter skills.

**Tasks:**

- [x] Create the source: `drwn card new @remyjkim/notion-agent --no-git`.
- [x] Set description:
  ```bash
  drwn card source set @remyjkim/notion-agent \
    --description "Notion workspace access for Claude Code, Codex, and Cursor via the official hosted MCP, plus curated workflow skills for coding agents."
  ```
- [x] **Add the MCP from the built-in registry** (this is the load-bearing step — no hand-editing of `mcp-servers/notion.json`):
  ```bash
  drwn card source add-mcp @remyjkim/notion-agent notion
  ```
  Verify under the hood: `cat ~/.agents/drwn/sources/@remyjkim/notion-agent/card.json` shows `servers.notion`; `~/.agents/drwn/sources/@remyjkim/notion-agent/mcp-servers/notion.json` exists and is canonically equivalent to `card.json.servers.notion`.
  ```bash
  diff \
    <(jq -S '.servers.notion' "$HOME/.agents/drwn/sources/@remyjkim/notion-agent/card.json") \
    <(jq -S '.' "$HOME/.agents/drwn/sources/@remyjkim/notion-agent/mcp-servers/notion.json")
  ```
- [x] Stage each of the 4 starter skills (one per directory under `/tmp/notion-staging/<skill>/SKILL.md`):
  - `notion-pull-spec`
  - `notion-task-implement`
  - `notion-pr-summary-sync`
  - `notion-release-notes`
  (Scaffolds in Appendix A below.)
- [x] Add each skill: `drwn card source add-skill @remyjkim/notion-agent <skill> --from /tmp/notion-staging/<skill>`.
- [x] Run doctor: `drwn card source doctor @remyjkim/notion-agent --json` → `ok: true`.

**Acceptance for Phase 2:**

- [x] `card.json.skills.include` lists exactly the 4 intended skills.
- [x] `card.json.servers.notion` canonically matches `mcp-servers/notion.json`.
- [x] `card source doctor` reports zero issues; no orphaned skills/MCPs.
- [x] `drwn card source show @remyjkim/notion-agent --json` displays 4 bundled skills + 1 MCP file.

---

### Phase 3 — End-to-end smoke test on a scratch project

Goal: prove the card contributes the workflow skills, includes the Notion server in its lock manifest, materializes the Notion URL into all three tools, and that OAuth + a real Notion call works.

**Tasks:**

- [x] Scaffold scratch project:
  ```bash
  rm -rf /tmp/notion-card-test && mkdir -p /tmp/notion-card-test && cd /tmp/notion-card-test
  drwn init --non-interactive
  ```
- [x] Apply card from local source:
  ```bash
  drwn card apply "file:$HOME/.agents/drwn/sources/@remyjkim/notion-agent"
  ```
- [x] Preview materialization: `drwn write --dry-run --json`. Confirm:
  - `.agents/drwn/card.lock` contains `@remyjkim/notion-agent` with `manifest.servers.notion`
  - writes planned for `.mcp.json`
  - writes planned for `.codex/config.toml`
  - write + generated symlink planned for `.cursor/mcp.json`
  - All 4 skill symlinks planned for `.claude/skills/<name>` and `.codex/skills/<name>`
  - `warnings: []`
  Note: because the current packaged config already has `optional.notion = true`, Notion may appear in no-card project writes too. The card-specific proof is the lock manifest plus the 4 skill symlink intents.
- [x] `drwn write`.
- [x] Verify symlinks resolve: `cat /tmp/notion-card-test/.claude/skills/notion-pull-spec/SKILL.md` returns content.
- [x] Verify configs landed:
  - `cat /tmp/notion-card-test/.mcp.json | jq '.mcpServers.notion'`
  - `cat /tmp/notion-card-test/.codex/config.toml | grep -A3 'mcp_servers.notion'`
  - `cat /tmp/notion-card-test/.cursor/mcp.json | jq '.mcpServers.notion'`
- [x] Verify the card lock records the card contribution:
  - `cat /tmp/notion-card-test/.agents/drwn/card.lock | jq '.cards[0].manifest.servers.notion'`
  - `cat /tmp/notion-card-test/.agents/drwn/card.lock | jq '.cards[0].skills'`
- [ ] **OAuth dance** (per-tool, blocking — must be done by Remy):
  - Claude Code: start session in `/tmp/notion-card-test`, run `/mcp`, select `notion`, complete browser OAuth.
  - Codex (optional for now): `codex mcp login notion`.
  - Cursor (optional for now): open MCP settings → authenticate.
- [ ] In Claude Code, smoke-test `notion-search "<any-real-workspace-query>"` and confirm results come back. Deferred pending user/client OAuth.
- [ ] Optionally trigger one skill: `/notion-pull-spec` or describe the scenario in prose; verify it fires. Deferred pending user/client OAuth.

**Acceptance for Phase 3:**

- [x] All three tools have the Notion server configured per their native format.
- [x] The card contribution is proven by `card.lock` and the 4 materialized skill symlinks, not solely by the Notion server config.
- [ ] OAuth completed in Claude Code; `notion-search` returns real results. Deferred pending user/client OAuth.
- [ ] At least one starter skill fires and runs through to completion. Deferred pending user/client OAuth.
- [x] No drwn-managed-field drift detected on a follow-up `drwn write --dry-run`.

---

### Phase 4 — Publish + push [DEFERRED FOR THIS RUN]

Goal: distribute `@remyjkim/notion-agent@1.0.0` when commits are allowed. This phase is explicitly skipped in the current execution because `drwn card publish` creates a local card-store Git commit and `drwn card push` pushes Git refs.

**Tasks:**

- [ ] Do not run during this execution: `drwn card publish @remyjkim/notion-agent`.
- [ ] Verify the published manifest:
  ```bash
  drwn card show @remyjkim/notion-agent@1.0.0 --json | jq '.manifest.skills.include, .manifest.servers.notion'
  ```
- [ ] Remote naming when allowed: `remyjkim/notion-agent`.
- [ ] Create the remote:
  ```bash
  gh repo create remyjkim/notion-agent --private \
    --description "Darwinian Harness Card: Notion workspace access via the official hosted MCP server + curated workflow skills."
  ```
- [ ] Add + push:
  ```bash
  drwn card remote add @remyjkim/notion-agent git@github.com:remyjkim/notion-agent.git
  drwn card push @remyjkim/notion-agent
  ```
- [ ] Verify remote refs: `git ls-remote --heads --tags git@github.com:remyjkim/notion-agent.git` shows `refs/heads/main` and `refs/tags/v1.0.0`.
- [ ] **Strong smoke test** in isolated `HOME` (proves the published artifact is consumable):
  ```bash
  TMPHOME=$(mktemp -d)
  env -u AGENTS_DIR -u AGENTS_HOME_DIR HOME=$TMPHOME drwn card clone git+git@github.com:remyjkim/notion-agent.git#v1.0.0 --json
  env -u AGENTS_DIR -u AGENTS_HOME_DIR HOME=$TMPHOME drwn card validate @remyjkim/notion-agent@1.0.0 --json
  rm -rf $TMPHOME
  ```

**Acceptance for Phase 4:**

- [ ] Deferred until commits are allowed.

---

### Phase 5 — Auth observability (`drwn status --why notion`) [DEFERRED]

Goal: surface per-tool OAuth state in `drwn status --why notion` so developers can see which tool needs login.

**This is a drwn-side code change** (~150 LOC) and is split from this plan. See analysis 64 §"Phase 2 — `drwn status --why notion` shows auth state per tool" for the design. A separate task plan should be filed when this becomes blocking (likely once 2–3 developers are using the card and getting confused about per-tool OAuth state).

**Scaffold for the future task:**

- New diagnostic probe in `cli/core/diagnostics.ts`: per-tool MCP server auth state.
  - Claude Code: `claude mcp get notion --json` parse + look for `status`/`authenticated` field. If not exposed, fall back to "configured + last-write-timestamp" only (degrade gracefully).
  - Codex: investigate whether `codex` exposes auth state via subcommand or whether we have to parse config-cache files.
  - Cursor: read its credential store path if accessible; otherwise "configured + last-write-timestamp" only.
- Wire the probe into `answerWhy` in `cli/core/diagnostics.ts:370`. Currently `answerWhy` walks the resolver tree for provenance; we add a per-tool probe block when the target name resolves to an MCP server.
- Output format (additive to existing):
  ```text
  notion (MCP server, via card @remyjkim/notion-agent@1.0.0)
    claude:  connected (last verified 2026-06-15 14:21 UTC)
    codex:   needs login → codex mcp login notion
    cursor:  needs login → open Cursor MCP settings
  ```
- Tests: new fixtures simulating each per-tool state.

**Exit criteria for filing the separate task**:

- After Phase 4 ships, monitor whether OAuth-state confusion blocks anyone for >5 minutes during onboarding. If yes, file the follow-on task.
- Alternative: file proactively as task 47+ if Remy wants the polish before sharing the card with others.

---

## Acceptance Criteria

Rolling up all phases:

- [x] Registry: built-in Notion MCP entry under id `notion`, validated by `drwn library show notion --json` with `source: "registry"`.
- [x] Card source: 4 skills + 1 server, `card source doctor` green, `card source show` confirms bundled contents.
- [x] Scratch project: card lock contains `@remyjkim/notion-agent`; all 4 card skills materialize; all three tools have the Notion config.
- [ ] Authenticated `notion-search` succeeds when the configured client is authenticated. Deferred to a user OAuth session; unauthenticated endpoint behavior was verified as HTTP 401 OAuth challenge.
- [x] Publishing/push remains skipped for this run; no card-store commit, remote repo, or Git push is created.
- [x] Completion summary `46_completion_darwinian-notion-mcp.md` records what shipped, per-tool OAuth notes, any deviations.

## Testing Strategy

- **Registry validation**: `drwn library show notion --json` + scratch-project dry-run/write/inspect (Phase 1).
- **Card validation**: `drwn card source doctor` is the contract test (Phase 2).
- **Materialization**: `drwn write --dry-run --json` against a scratch project, then real `drwn write` (Phase 3).
- **Runtime smoke test**: manual in Claude Code (and optionally Codex/Cursor) — OAuth + one real `notion-search` call (Phase 3).
- **Distribution smoke test**: deferred with Phase 4 until commits are allowed.
- **No automated unit tests** added to drwn for this task — pure card authoring on top of existing CLI surfaces. If we hit a bug in built-in registry resolution or `drwn card source add-mcp`, that gets its own task.

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Registry entry shape differs from expected target config | Low | Phase 1 validates `drwn library show notion --json` and scratch-project rendering before card authoring. |
| Skill description triggers don't fire reliably in Claude Code | Medium | Probe outcome on l6-mind-card established that slash invocation is reliable. Use slash form as the floor in each skill description. |
| Tool-side OAuth flow differs from the mentor memos (Notion changes their hosted MCP surface) | Low | Phase 3 catches this empirically. If OAuth flow has changed, document new steps in the completion summary; the card configuration (URL + transport) shouldn't need to change. |
| Rate-limit hit during Phase 3 smoke test | Low | Notion limit is 180 req/min; one search call is negligible. |
| No-card baseline already includes Notion config | Medium | Current `registry/config.json` has `optional.notion = true`; Phase 3 proves card contribution with `card.lock` + 4 skill symlinks, not server config alone. |
| Future publish accidentally creates commits during this run | Low | Phase 4 is explicitly deferred; do not run `drwn card publish`, `drwn card remote`, `drwn card push`, `gh repo create`, or any clone/validate distribution smoke in this execution. |

## Execution Decisions

1. **Card namespace**: execute as `@remyjkim/notion-agent`.
2. **OAuth smoke test scope**: Claude Code is the required smoke test because it has the lowest-friction MCP UX. Codex + Cursor OAuth are optional follow-ons unless the execution owner wants broader runtime proof before sharing.
3. **Phase 5 auth observability**: wait. File `drwn status --why notion` only if OAuth-state confusion blocks onboarding.
4. **OAuth notes in card description**: current registry `notes` are sufficient for v1. The completion summary should capture exact per-tool OAuth notes observed during smoke testing.

## Notes

- The built-in registry and the card source are independently versioned. When publishing is allowed, registry updates are decoupled — rerun `drwn card source add-mcp @remyjkim/notion-agent notion --replace`, bump card version, and republish when you want to release an updated baked copy.
- The 4 starter skills (Appendix A) are scaffolds. Refine after dogfooding for a week or two.
- If we later add Notion to other cards (e.g., `@remyjkim/personal-harness`), the workflow is one command: `drwn card source add-mcp @remyjkim/personal-harness notion` — using the same built-in registry entry verified in Phase 1.
- See `.ai/analyses/64_darwinian-notion-mcp-target-architecture.md` for the original architectural reasoning. This task plan supersedes that memo's local `drwn library add mcp ... --as notion` step because `notion` is now already built into `registry/mcp-servers.json`.

---

## Appendix A — Starter skill scaffolds

Each skill is a directory containing only `SKILL.md`. Stage under `/tmp/notion-staging/<skill>/SKILL.md`, then `drwn card source add-skill @remyjkim/notion-agent <skill> --from /tmp/notion-staging/<skill>`.

### `notion-pull-spec`

```markdown
---
name: notion-pull-spec
description: "Use when the user says /notion-pull-spec, asks to pull a spec or PRD from Notion, or wants project context fetched from a Notion task. Searches the workspace, fetches the relevant page, and summarizes acceptance criteria."
---

# Notion: Pull Spec

**Assumes:** the `notion` MCP server is configured and authenticated in the current tool. If `notion-search` returns an auth error, instruct the user to authenticate (Claude `/mcp`, `codex mcp login notion`, or Cursor MCP settings) and stop.

Fetch a Notion spec / PRD / task and summarize it for a coding session.

## Input

**Determine arguments.** When invoked via slash, the user's message is `/notion-pull-spec [<query>]`. Parse the rest of the message as the search query. When invoked via prose, read the query from the user's message. If absent, ask what to search for.

## Directive

1. Call `notion-search` with the query.
2. If multiple high-relevance results, ask the user which page to use.
3. Call `notion-fetch` on the chosen page id.
4. Summarize:
   - Title + author + last-edited
   - Acceptance criteria (extract bullets or numbered lists tagged "criteria", "acceptance", "must", "should")
   - Open questions (anything tagged "TBD", "?", "open")
   - Implicit assumptions worth surfacing
5. Offer to proceed with an implementation plan based on the spec.

## Output

A concise summary suitable for opening a coding session against. Do not paste the full Notion page back — synthesize.
```

### `notion-task-implement`

```markdown
---
name: notion-task-implement
description: "Use when the user says /notion-task-implement or wants to implement a Notion task end-to-end: fetch the task, propose a plan, implement, then offer to update the task status in Notion."
---

# Notion: Implement Task

**Assumes:** the `notion` MCP server is configured and authenticated. If `notion-fetch` returns an auth error, instruct the user to authenticate and stop.

End-to-end: fetch a Notion task, implement it, propose a Notion status update.

## Input

**Determine arguments.** When invoked via slash, the user's message is `/notion-task-implement [<task-id-or-url>]`. Parse the rest as the Notion task id or URL. When invoked via prose, read the same. If absent, ask which task.

## Directive

1. Call `notion-fetch` on the task id/URL.
2. Identify the expected behavior, scope, acceptance criteria.
3. Propose an implementation plan in 5–10 bullets.
4. On user approval, implement.
5. Run tests / type-check / lint as appropriate for the project.
6. Draft a Notion status update (status field + optional comment):
   ```
   - status: in-progress | review | done
   - implementation_summary: <2-3 sentences>
   - acceptance_status: <per criterion>
   - remaining: <if any>
   ```
7. Ask the user before calling `notion-update-page` to apply.

## Output

- Implementation diff in the working tree.
- Pending Notion status update awaiting user approval.

## Post-Operation

- On approval, call `notion-update-page` with the proposed fields.
- If the task references a Slack/email follow-up, surface but do not act on it.
```

### `notion-pr-summary-sync`

```markdown
---
name: notion-pr-summary-sync
description: "Use when the user says /notion-pr-summary-sync, opens a PR linked to a Notion task, or wants a PR summary added as a Notion comment. Reads the PR, posts a concise comment on the linked Notion page."
---

# Notion: PR Summary Sync

**Assumes:** the `notion` MCP server is configured + authenticated. The current repo has an open PR (or the user supplies a PR URL).

Post a concise PR summary as a Notion comment on the linked task.

## Input

**Determine arguments.** When invoked via slash, `/notion-pr-summary-sync [<pr-url-or-number>] [<notion-task-id-or-url>]`. If absent, infer from current branch's open PR and look for a Notion link in PR body / commit messages / branch name. Ask if ambiguous.

## Directive

1. Resolve the PR (via `gh pr view` or the URL).
2. Resolve the linked Notion task (regex `notion.so/[^ )]+` in PR body/title/commits; otherwise ask).
3. Compose a comment:
   ```
   PR opened: <pr-title> (#<pr-number>)
   Author: <author>
   Changes: <one-line summary>
   Tests: <pass/fail/skipped>
   Reviewers: <list>
   Link: <pr-url>
   ```
4. Show the user the proposed comment. On approval, call `notion-create-comment` with the page id.

## Output

- A Notion comment on the linked task summarizing the PR.

## Post-Operation

- None.
```

### `notion-release-notes`

```markdown
---
name: notion-release-notes
description: "Use when the user says /notion-release-notes or wants release notes drafted as a Notion page. Diffs from the last release tag to HEAD, summarizes notable user-facing changes, creates a new Notion page under a release-notes parent."
---

# Notion: Release Notes Draft

**Assumes:** the `notion` MCP server is configured + authenticated; the repo has a release tag history (`git tag`); the user knows the Notion parent page id for release notes (or it's discoverable via search).

Draft release notes from `git diff <last-tag>..HEAD` as a new Notion page.

## Input

**Determine arguments.** When invoked via slash, `/notion-release-notes [<from-tag>] [<parent-page-id-or-url>]`. Default `from-tag` to the most recent semver tag. Default `parent-page-id` to the page returned by `notion-search "release notes"` (ask to confirm).

## Directive

1. Resolve `from-tag` (default: `git describe --tags --abbrev=0`).
2. Resolve the parent page (via `notion-search` if not given; ask user to pick).
3. Collect commits: `git log <from-tag>..HEAD --pretty='%h %s' --no-merges`.
4. Group commits into sections:
   - Features (commits with `feat`/`add`)
   - Fixes (commits with `fix`)
   - Refactors / chores (excluded from user-facing notes unless impactful)
   - Breaking changes (commits with `BREAKING CHANGE` footer or `!:`)
5. Compose markdown:
   ```
   # <version-or-date>

   ## Features
   - ...

   ## Fixes
   - ...

   ## Breaking Changes
   - ...

   ## Acknowledgments
   - ...
   ```
6. Show the user. On approval, call `notion-create-pages` with `parent = <parent-id>` and the markdown body.

## Output

- A draft release-notes page in Notion under the chosen parent.
- The page URL surfaced to the user.

## Post-Operation

- None.
```

---

## Appendix B — Command sequence (copy-paste-able for execution)

```bash
# Phase 1: Built-in registry entry + standalone smoke test
rg -n '"notion"' registry/mcp-servers.json registry/config.json
drwn library show notion --json
rm -rf /tmp/notion-registry-check && mkdir -p /tmp/notion-registry-check && cd /tmp/notion-registry-check
drwn init --non-interactive
drwn write --dry-run --json
drwn write
jq '.mcpServers.notion' .mcp.json
grep -A3 'mcp_servers.notion' .codex/config.toml
jq '.mcpServers.notion' .cursor/mcp.json
cd - && rm -rf /tmp/notion-registry-check

# Phase 2: Card authoring
drwn card new @remyjkim/notion-agent --no-git
drwn card source set @remyjkim/notion-agent --description "Notion workspace access for Claude Code, Codex, and Cursor via the official hosted MCP, plus curated workflow skills for coding agents."
drwn card source add-mcp @remyjkim/notion-agent notion
# Stage 4 SKILL.md files under /tmp/notion-staging/<skill>/SKILL.md per Appendix A, then:
for s in notion-pull-spec notion-task-implement notion-pr-summary-sync notion-release-notes; do
  drwn card source add-skill @remyjkim/notion-agent "$s" --from "/tmp/notion-staging/$s"
done
drwn card source doctor @remyjkim/notion-agent --json
drwn card source show @remyjkim/notion-agent --json

# Phase 3: End-to-end smoke
rm -rf /tmp/notion-card-test && mkdir -p /tmp/notion-card-test && cd /tmp/notion-card-test
drwn init --non-interactive
drwn card apply "file:$HOME/.agents/drwn/sources/@remyjkim/notion-agent"
drwn write --dry-run --json
drwn write
jq '.cards[0].manifest.servers.notion, .cards[0].skills' .agents/drwn/card.lock
jq '.mcpServers.notion' .mcp.json
grep -A3 'mcp_servers.notion' .codex/config.toml
jq '.mcpServers.notion' .cursor/mcp.json
# Open Claude Code in /tmp/notion-card-test, run /mcp, complete OAuth, test notion-search

# Phase 4 is deferred in this run:
# no drwn card publish, drwn card push, gh repo create, or distribution clone/validate.
```
