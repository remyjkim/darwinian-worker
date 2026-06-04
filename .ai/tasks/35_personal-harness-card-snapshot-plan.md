# Personal Harness Card Snapshot Plan

## Status

Completed on 2026-06-03 using the published `drwn 0.1.0` CLI.

Execution result:

- Card source: `~/.agents/drwn/sources/@remyjkim/personal-harness`
- Published card: `@remyjkim/personal-harness@0.1.0`
- Remote repository: `git@github.com:remyjkim/personal-harness-card.git`
- GitHub visibility: private
- Published commit: `b38b08061ac907bbf15130339f5a21509d4ba4c2`
- Published tag: `v0.1.0`
- Integrity: `sha256-7f2ecec7b94e9fcd25c4416594d7dd26d5dc3cb8e25825e3d5514b797ec252ed`
- Validation: `drwn card validate @remyjkim/personal-harness@0.1.0 --json` returned `ok: true`
- Remote smoke: isolated `HOME` clone from `git+git@github.com:remyjkim/personal-harness-card.git#v0.1.0` succeeded and validated `ok: true`

## Objective

Create a self-contained Harness Card that snapshots the currently active personal `drwn` harness state on this machine, then publish and push that card to a personal GitHub repository under `remyjkim/*`.

Recommended card identity:

- Card name: `@remyjkim/personal-harness`
- Remote repository: `git@github.com:remyjkim/personal-harness-card.git`
- Initial version: `0.1.0`
- Visibility: private by default, unless the owner explicitly wants a public reusable card.

## Investigation Summary

Current working repo:

- Path: `/Users/pureicis/dev/darwinian-harness`
- CLI package available globally: `drwn 0.1.0`
- Published CLI invocation available: `drwn ...`
- GitHub CLI is authenticated as `remyjkim` with SSH git protocol.

The current repo is not a `drwn` project overlay:

- Missing: `/Users/pureicis/dev/darwinian-harness/.agents/drwn/config.json`
- Present legacy files:
  - `.agents/bgng/config.json`
  - `.agents/bgng/card.lock`
  - `.claude/settings.json`
  - `.codex/config.toml`

Because there is no project overlay, `drwn card new @remyjkim/personal-harness --from-project .` is not the correct capture path right now. It fails by design when no `.agents/drwn/config.json` exists. The active harness state to snapshot is the reusable machine/library state reported by `drwn`, not the current repo's legacy project config.

Current `drwn` store state:

- `~/.agents/drwn/store.json` exists and uses schema version 1.
- `~/.agents/drwn/machine.json` exists with no saved card sources or machine authoring scope.
- `drwn card list --json` returns no local cards.
- `drwn card source list --json` returns no editable card sources.
- `drwn card status --json` fails in this repo because it is not inside a `.agents/drwn/config.json` project.

## Active Snapshot Contents

### Curated Skills to Bundle

`drwn skills list --json` reports 25 curated skills. These are the skills that should be copied into the card source:

```text
agentcash
auditing-knowledge-docs
blog-post-polish
brainstorming
dispatching-parallel-agents
executing-plans
finishing-a-development-branch
frontend-design
incremental-commits
parallel-data-enrichment
parallel-deep-research
parallel-web-extract
parallel-web-search
polish-voice-research
receiving-code-review
requesting-code-review
restructuring-knowledge-docs
subagent-driven-development
systematic-debugging
test-driven-development
using-git-worktrees
using-superpowers
verification-before-completion
writing-plans
writing-skills
```

Important source-path finding:

- The active curated skill links under `~/.agents/skills` currently point to `/Users/pureicis/dev/beginning-harness/skills/shared/...`.
- The card source authoring commands copy skill contents into `~/.agents/drwn/sources/@remyjkim/personal-harness/skills/...`.
- That copy makes the card self-contained and avoids publishing machine-local symlinks.
- Do not author the card by manually preserving these symlink targets.

Skills present but not curated and not included in the snapshot:

```text
beads-task-tracking
markitdown-document-conversion
```

These can be added later if the owner intentionally wants a broader card.

### Active MCP Servers to Bundle

`drwn mcp list --json` reports these active MCP servers across Claude, Codex, and Cursor:

```text
chrome-devtools  stdio  claude,codex,cursor
context7         stdio  claude,codex,cursor
notion           http   claude,codex,cursor
```

Bundle exactly these three MCP definitions with:

```bash
drwn card source add-mcp @remyjkim/personal-harness chrome-devtools
drwn card source add-mcp @remyjkim/personal-harness context7
drwn card source add-mcp @remyjkim/personal-harness notion
```

MCP servers present but inactive and not included in the snapshot:

```text
markdownify
parallel-search
parallel-task
slack
```

The inactive Parallel MCP servers should not be bundled unless the card is intentionally expanded to require Parallel MCP auth and runtime setup. The active snapshot already includes the four Parallel skills that are curated.

### Hooks Observed but Not Bundled

Hooks are currently configured outside the `drwn` card model:

- `~/.claude/settings.json` has notification hooks for `UserPromptSubmit`, `Stop`, `PostToolUse`, `PostToolUseFailure`, and `PermissionRequest`, invoking `$SUPERSET_HOME_DIR/hooks/notify.sh` when available.
- `~/.codex/hooks.json` has notification hooks for `SessionStart`, `UserPromptSubmit`, and `Stop`, invoking `/Users/pureicis/.superset/hooks/notify.sh`.
- `~/.cursor/hooks.json` has hooks for `beforeSubmitPrompt`, `stop`, `beforeShellExecution`, and `beforeMCPExecution`, invoking `/Users/pureicis/.superset/hooks/cursor-hook.sh`.

Do not copy these hook commands into the card manifest. They contain machine-specific paths and are not currently represented as first-class card content. If hook portability becomes a requirement, handle it as a separate task by adding an explicit hook-installation mechanism or a dedicated skill that documents and verifies the local hook setup.

### CLI Tools Observed but Not Bundled

Installed helper tools:

```text
drwn          0.1.0
drwn-hx       0.1.0
node          v22.22.1
npm           10.9.4
bun           1.2.15
gh            2.82.1
git           2.39.5
bd            1.0.0
parallel-cli  0.5.0
markitdown    0.1.5
uv            0.9.12
```

These tools are runtime context, not card payload. Only `drwn` and `gh` are needed for this execution. `parallel-cli` supports the curated Parallel skills, but the card cannot install it by itself. `bd`, `markitdown`, and `uv` are available on the machine but their related skills are not curated, so they remain out of scope.

## Recommended Strategy

Use semantic `drwn card source` commands instead of manual JSON edits.

Rationale:

- `--from-project` is built for a project with `.agents/drwn/config.json`; this repo currently lacks one.
- Manual authoring risks stale paths, invalid `skills.include`, and divergent `card.json.servers` vs `mcp-servers/<id>.json`.
- `card source add-skill` copies the current skill directories into the card source, producing a portable artifact.
- `card source add-mcp` writes `mcp-servers/<id>.json` and mirrors each server definition into `card.json.servers`.
- `card source doctor`, `card publish`, and `card validate` provide the validation chain before pushing.

## Execution Plan

### 1. Preflight

Run from `/Users/pureicis/dev/darwinian-harness`:

```bash
drwn --version
drwn status --json
drwn skills list --json
drwn mcp list --json
drwn card source list --json
drwn card list --json
gh auth status
gh repo view remyjkim/personal-harness-card --json nameWithOwner,visibility,url,sshUrl
```

Expected:

- `drwn --version` reports `0.1.0`.
- `skills list` still reports the 25 curated skills listed above.
- `mcp list` still reports `chrome-devtools`, `context7`, and `notion` as active.
- No existing source named `@remyjkim/personal-harness`.
- No existing local card named `@remyjkim/personal-harness`.
- `gh repo view` should fail if the target repo does not exist yet.

If the GitHub repository already exists, inspect it before proceeding and decide whether to use it or choose a new name. Do not overwrite an unrelated repository.

### 2. Create the Editable Card Source

```bash
drwn card new @remyjkim/personal-harness
```

Expected:

- Creates `~/.agents/drwn/sources/@remyjkim/personal-harness/`.
- Initializes a Git repository in the source directory.
- Creates `card.json`, `skills/`, and `mcp-servers/`.

Do not use `--from-project` unless this repo first gains a valid `.agents/drwn/config.json` that intentionally represents the snapshot.

### 3. Set Manifest Metadata

```bash
drwn card source set @remyjkim/personal-harness \
  --description "Personal Darwinian Harness snapshot with curated skills and active MCP defaults" \
  --version 0.1.0 \
  --license Apache-2.0 \
  --harness-min-version 0.1.0 \
  --stability experimental \
  --last-validated-with 0.1.0
```

After execution, inspect:

```bash
drwn card source show @remyjkim/personal-harness --json
```

Expected:

- Manifest name is `@remyjkim/personal-harness`.
- Version is `0.1.0`.
- Metadata is present and no unexpected skills or servers are included yet.

### 4. Add Curated Skills

Use the exact curated skill set from the investigation.

Dry-run first:

```bash
skills=(
  agentcash
  auditing-knowledge-docs
  blog-post-polish
  brainstorming
  dispatching-parallel-agents
  executing-plans
  finishing-a-development-branch
  frontend-design
  incremental-commits
  parallel-data-enrichment
  parallel-deep-research
  parallel-web-extract
  parallel-web-search
  polish-voice-research
  receiving-code-review
  requesting-code-review
  restructuring-knowledge-docs
  subagent-driven-development
  systematic-debugging
  test-driven-development
  using-git-worktrees
  using-superpowers
  verification-before-completion
  writing-plans
  writing-skills
)

for skill in "${skills[@]}"; do
  drwn card source add-skill @remyjkim/personal-harness "$skill" --dry-run --json
done
```

Then mutate:

```bash
for skill in "${skills[@]}"; do
  drwn card source add-skill @remyjkim/personal-harness "$skill"
done
```

Expected:

- `skills/<skill>/` exists in the card source for all 25 skills.
- `card.json.skills.include` includes exactly the 25 skill names.
- No symlinks to `/Users/pureicis/dev/beginning-harness` are preserved inside the card source.

### 5. Add Active MCP Servers

Dry-run first:

```bash
for server in chrome-devtools context7 notion; do
  drwn card source add-mcp @remyjkim/personal-harness "$server" --dry-run --json
done
```

Then mutate:

```bash
for server in chrome-devtools context7 notion; do
  drwn card source add-mcp @remyjkim/personal-harness "$server"
done
```

Expected:

- `mcp-servers/chrome-devtools.json`, `mcp-servers/context7.json`, and `mcp-servers/notion.json` exist.
- `card.json.servers` contains exactly those three entries.
- No tokens, local secrets, or OAuth credentials are written into the card. The Notion entry should remain the hosted OAuth MCP definition.

### 6. Validate the Source

```bash
drwn card source doctor @remyjkim/personal-harness --json
drwn card source show @remyjkim/personal-harness --json
```

Expected:

- `card source doctor` reports `ok: true`.
- `card source show` confirms:
  - 25 skills in `skills.include`
  - 3 servers in `servers`
  - no inactive MCPs
  - no non-curated skills

Also inspect the physical source:

```bash
source_dir="$HOME/.agents/drwn/sources/@remyjkim/personal-harness"
find "$source_dir/skills" -maxdepth 1 -mindepth 1 -type d | wc -l
find "$source_dir/mcp-servers" -maxdepth 1 -mindepth 1 -type f | wc -l
find "$source_dir" -type l -print
```

Expected:

- Skill directory count is `25`.
- MCP file count is `3`.
- No symlinks are printed.

### 7. Publish and Validate the Local Card

```bash
drwn card publish @remyjkim/personal-harness
drwn card validate @remyjkim/personal-harness@0.1.0 --json
drwn card show @remyjkim/personal-harness@0.1.0 --json
```

Expected:

- Local bare card repo exists under `~/.agents/drwn/cards/@remyjkim/personal-harness.git`.
- Version tag `0.1.0` exists in the local card repo.
- `card validate` succeeds.
- `card show` displays the expected manifest contents.

### 8. Create and Attach the GitHub Remote

Create the repo only after local validation passes:

```bash
gh repo create remyjkim/personal-harness-card --private
```

Attach the remote to the local card repo:

```bash
drwn card remote add @remyjkim/personal-harness git@github.com:remyjkim/personal-harness-card.git
drwn card remote list @remyjkim/personal-harness --json
```

Expected:

- Remote `origin` points to `git@github.com:remyjkim/personal-harness-card.git`.

### 9. Push and Verify Remote Availability

```bash
drwn card push @remyjkim/personal-harness
gh repo view remyjkim/personal-harness-card --json nameWithOwner,visibility,url,sshUrl
```

Expected:

- Push succeeds for `refs/heads/main` and tag `0.1.0`.
- GitHub reports the expected private repository.

Optional remote smoke validation:

```bash
tmp_home="$(mktemp -d)"
HOME="$tmp_home" AGENTS_DIR="$tmp_home/.agents" drwn card clone git+git@github.com:remyjkim/personal-harness-card.git#v0.1.0 --json
HOME="$tmp_home" AGENTS_DIR="$tmp_home/.agents" drwn card validate @remyjkim/personal-harness@0.1.0 --json
```

Clean up the temporary home after the smoke:

```bash
rm -rf "$tmp_home"
```

## Acceptance Criteria

- A new editable source exists at `~/.agents/drwn/sources/@remyjkim/personal-harness`.
- The source bundles exactly 25 curated skill directories and 3 active MCP server definitions.
- `card.json.skills.include` contains exactly the curated skill list in this plan.
- `card.json.servers` contains exactly `chrome-devtools`, `context7`, and `notion`.
- `drwn card source doctor @remyjkim/personal-harness --json` reports `ok: true`.
- `drwn card publish @remyjkim/personal-harness` succeeds.
- `drwn card validate @remyjkim/personal-harness@0.1.0 --json` succeeds.
- Remote repository `remyjkim/personal-harness-card` exists.
- `drwn card push @remyjkim/personal-harness` succeeds.
- No secrets, OAuth tokens, local hook scripts, or machine-specific symlink targets are published.

## Risks and Controls

| Risk | Control |
| --- | --- |
| Accidentally snapshotting stale legacy `.agents/bgng` repo config | Do not use `--from-project`; use explicit `card source add-skill` and `card source add-mcp` commands. |
| Publishing machine-local symlinks | Verify `find "$source_dir" -type l -print` is empty before publish. |
| Including inactive MCPs or uncurated skills | Use the explicit allowlists in this plan. |
| Leaking tokens or machine hooks | Bundle only registry MCP definitions via `add-mcp`; do not copy `~/.claude`, `~/.codex`, `~/.cursor`, or `.env` files. |
| Publishing to an existing unrelated repo | Run `gh repo view remyjkim/personal-harness-card` before `gh repo create`; stop if it exists and inspect ownership/content. |
| Local card version already exists | Check `drwn card list --json`; if `@remyjkim/personal-harness@0.1.0` exists, either inspect/reuse it or bump the new source version before publish. |
| Current curated skills change between planning and execution | Re-run `drwn skills list --json` during preflight and compare against this plan before mutating. |

## Deliberate Non-Goals

- Do not modify this repo's working tree except for this task plan.
- Do not commit changes in `/Users/pureicis/dev/darwinian-harness`.
- Do not initialize this repo as a `.agents/drwn` project just to use `--from-project`.
- Do not add hooks to the card.
- Do not include inactive MCPs.
- Do not include non-curated Beads or MarkItDown skills.
- Do not publish or push until source doctor and local card validation pass.
