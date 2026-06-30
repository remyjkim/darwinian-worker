# ABOUTME: Step-by-step manual test guide for Mind Cards features against a local sandbox.
# ABOUTME: Covers card authoring, publish, apply, write, doctor, integrity, corruption, and mind content flows.

# Mind Cards Manual Test Guide

## Purpose

Use this guide to manually test the full Mind Cards feature on your local machine against the **current implementation**, not an aspirational architecture.

It is designed for two use cases:

- validating cards end-to-end in a **safe sandbox**
- validating apply/write/doctor/status flows against a **real project**

The safest pattern is:

1. run the full flow in an isolated sandbox first
2. only then repeat the shorter project-consumption flow on a real repo

This avoids polluting or breaking your real `~/.agents`, `.claude`, `.codex`, and `.cursor` state while still exercising the live CLI.

## What Wave 1 Behavior You Should Expect

The current codebase guarantees these behaviors:

- card-bundled skill content is authoritative for downstream skill materialization
- downstream card-provided skills are copied from the immutable card store under `~/.agents/drwn/cards/...`
- if a card and a non-card source provide the same skill name, the card copy wins
- `drwn write --dry-run --json` annotates the winning layer for skill materialization intents
- unresolved `skills.include` names fail `drwn write` before any downstream mutation
- `drwn doctor` is report-only and surfaces related issues without fixing them
- `card.lock` records card versions, content-tree integrity, source path, manifest, and bundled skill attribution
- legacy pre-cards layouts must be migrated before card authoring or apply flows proceed

## Recommended Test Modes

### Mode A: Full sandbox validation

Use this when you want the highest coverage with the lowest risk.

This mode exercises:

- card authoring
- publish
- apply / pin / add / remove / detach / update / outdated
- project-local write
- `doctor`
- `status --why`
- integrity upgrade
- corruption detection
- legacy-layout protection

### Mode B: Real-project consumption validation

Use this when:

- a project already exists
- you want to validate the project-side card flow only
- you do **not** need to test card authoring on your real machine state

In this mode, keep `AGENTS_HOME_DIR` and `AGENTS_DIR` pointed at a sandbox even if the project itself is real.

## Environment Model

The CLI resolves its environment from:

- `AGENTS_REPO_ROOT`
- `AGENTS_HOME_DIR`
- `AGENTS_DIR`

That means you can fully isolate card testing without changing your actual home directory state.

Recommended shell setup:

```bash
set -euo pipefail

# Point this at your local checkout.
export DRWN_REPO="$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || echo "$HOME/dev/darwinian-minds")"
export ENTRYPOINT="$DRWN_REPO/cli/index.ts"
export SANDBOX="$(mktemp -d /tmp/drwn-cards-XXXXXX)"
export AGENTS_HOME_DIR="$SANDBOX/home"
export AGENTS_DIR="$AGENTS_HOME_DIR/.agents"
export AGENTS_REPO_ROOT="$DRWN_REPO"

mkdir -p "$AGENTS_HOME_DIR" "$AGENTS_DIR"

drwn() {
  AGENTS_HOME_DIR="$AGENTS_HOME_DIR" \
  AGENTS_DIR="$AGENTS_DIR" \
  AGENTS_REPO_ROOT="$AGENTS_REPO_ROOT" \
  bun run "$ENTRYPOINT" "$@"
}
```

Sanity check:

```bash
drwn status
drwn write --help
drwn card new --help
```

## Full Sandbox Walkthrough

### 1. Create a disposable project

```bash
export PROJECT="$SANDBOX/project"
mkdir -p "$PROJECT"
cd "$PROJECT"
git init
drwn init --non-interactive
```

Verify:

- `.agents/drwn/config.json` exists
- `drwn status` shows project context when run inside the directory

### 2. Create a card source

```bash
drwn card new @me/frontend --no-git
export CARD_SRC="$AGENTS_DIR/drwn/sources/@me/frontend"
```

Verify:

- `"$CARD_SRC/card.json"` exists
- `"$CARD_SRC/skills"` exists
- `"$CARD_SRC/mcp-servers"` exists

### 3. Add bundled-only skills and an MCP server

Write the manifest:

```bash
cat > "$CARD_SRC/card.json" <<'JSON'
{
  "name": "@me/frontend",
  "version": "1.0.0",
  "description": "Frontend harness test card",
  "skills": {
    "include": ["polish", "animate"]
  },
  "servers": {
    "card-server": {
      "description": "From card",
      "transport": "stdio",
      "command": "card-run",
      "optional": false
    }
  }
}
JSON
```

Create the skill directories:

```bash
mkdir -p "$CARD_SRC/skills/polish" "$CARD_SRC/skills/animate"

cat > "$CARD_SRC/skills/polish/SKILL.md" <<'MD'
---
name: polish
description: polish
---
Polish skill body.
MD

cat > "$CARD_SRC/skills/animate/SKILL.md" <<'MD'
---
name: animate
description: animate
---
Animate skill body.
MD
```

### 4. Publish the card

```bash
drwn card publish @me/frontend
drwn card list
drwn card show @me/frontend@1.0.0
drwn card show @me/frontend@1.0.0 --json
```

Verify:

- publish succeeds
- the bare repo exists at `"$AGENTS_DIR/drwn/cards/@me/frontend.git"`
- `drwn card show @me/frontend@1.0.0 --json` reports an extracted path under `"$AGENTS_DIR/drwn/extracted/"`

### 5. Capture the project as a card

```bash
cd "$PROJECT"
drwn card new @me/frontend-captured --from-project . --no-git
export CAPTURED_SRC="$AGENTS_DIR/drwn/sources/@me/frontend-captured"
cat "$CAPTURED_SRC/card.json"
```

Verify:

- `"$CAPTURED_SRC/skills"` contains the effective project skills
- `card.json` has `"version": "0.1.0"`
- active MCP servers, extensions, and targets are represented when present
- no host secret values are inlined into the captured manifest

Optional quality-signal check:

```bash
jq '.stability = "stable" | .lastValidatedWith = "0.1.0" | .testStatusBadge = "https://example.com/status.svg"' \
  "$CAPTURED_SRC/card.json" > "$CAPTURED_SRC/card.json.tmp"
mv "$CAPTURED_SRC/card.json.tmp" "$CAPTURED_SRC/card.json"
drwn card publish @me/frontend-captured
drwn card show @me/frontend-captured@0.1.0
```

### 6. Apply the card to the project

```bash
cd "$PROJECT"
drwn apply @me/frontend@^1.0.0
cat .agents/drwn/config.json
cat .agents/drwn/card.lock
```

Verify that `card.lock` contains:

- `lockfileVersion` (2/3/4; 4 once a card ships persona/beliefs/memory)
- the exact resolved card `version` (and `requested` range)
- `integrity`
- `manifest`
- `skills` and `hooks`
- `persona`, `beliefs`, `memory` (when the card declares mind content)
- `hookConsent` (once `card trust --hooks` is run)
- `origin` (`store`/`git`/`file`/`npm`) and `git` (for git-origin cards)
- `registry: null`

### 7. Preview materialization

```bash
drwn write --dry-run
drwn write --dry-run --json
```

Verify:

- planned skill links for `polish` and `animate`
- planned MCP config for `card-server`
- skill targets point into `"$AGENTS_DIR/drwn/extracted/<tree-sha>/skills/..."`

### 8. Materialize the project

```bash
drwn write
ls .claude/skills/polish
ls .claude/skills/animate
cat .claude/settings.json
```

Verify:

- both skill directories are copies from the immutable card store path
- `.claude/settings.json` contains `card-server`
- if Codex is enabled, equivalent `.codex/skills/...` links also materialize

### 9. Inspect provenance and diagnostics

```bash
drwn status --explain
drwn status --why skill:polish
drwn card status --explain
drwn doctor
drwn doctor --json
```

Verify:

- `status --why skill:polish` attributes the skill to `card @me/frontend@1.0.0`
- `doctor` does not falsely report bundled-only skills as unknown
- `doctor` is report-only

### 10. Verify idempotency

```bash
drwn write --json
```

Verify:

- `changes` is empty on the second write

## Manual Checks For The Four Wave 1 Regressions

### A. Legacy layout detection and migrate-first enforcement

Create a fake pre-cards layout:

```bash
export SANDBOX_LEGACY="$(mktemp -d /tmp/drwn-legacy-XXXXXX)"
export LEGACY_HOME="$SANDBOX_LEGACY/home"
export LEGACY_AGENTS="$LEGACY_HOME/.agents"

mkdir -p "$LEGACY_AGENTS/drwn" "$LEGACY_AGENTS/library" "$LEGACY_AGENTS/packages/skills/@acme/skills/1.0.0"
printf '{"version":1,"optional":{}}\n' > "$LEGACY_AGENTS/drwn/config.json"
printf '{"version":1,"servers":{}}\n' > "$LEGACY_AGENTS/library/mcp-servers.json"
```

Attempt authoring:

```bash
AGENTS_HOME_DIR="$LEGACY_HOME" AGENTS_DIR="$LEGACY_AGENTS" AGENTS_REPO_ROOT="$DRWN_REPO" \
  bash -lc 'cd "$DRWN_REPO" && bun run drwn -- card new @me/test --no-git'
```

Verify:

- command fails
- error directs you to `drwn store migrate`

Then migrate:

```bash
AGENTS_HOME_DIR="$LEGACY_HOME" AGENTS_DIR="$LEGACY_AGENTS" AGENTS_REPO_ROOT="$DRWN_REPO" \
  bash -lc 'cd "$DRWN_REPO" && bun run drwn -- store migrate'
```

Verify:

- migration succeeds
- retrying `card new` now works

### B. Bundled-only skills must not be dropped

Already covered by the `polish` / `animate` walkthrough above.

Critical check:

```bash
test -d .claude/skills/polish
test -d .claude/skills/animate
```

### C. Card-provided skills must materialize from the card store, not the repo

Critical check:

```bash
ls .claude/skills/polish/SKILL.md
ls .claude/skills/animate/SKILL.md
```

Expected:

- both exist as copied directories with content from `"$AGENTS_DIR/drwn/extracted/<tree-sha>/skills/..."`
- neither contains content from the checkout’s built-in `skills/` tree

### D. Dry-run must dedupe and show which layer wins

Temporarily add a same-name repo-native skill in the checkout and curate it into
the publication layer:

```bash
mkdir -p "$DRWN_REPO/skills/shared/polish"
cat > "$DRWN_REPO/skills/shared/polish/SKILL.md" <<'MD'
---
name: polish
description: repo polish
---
Repo-native polish
MD

drwn skills curate polish
```

Use a fresh applied-but-unwritten project for this check. `drwn write --dry-run
--json` only lists pending mutations in `changes`, so re-running it against an
already materialized project will usually return `changes: []`.

```bash
export DEDUPE_PROJECT="$SANDBOX/dedupe-project"
mkdir -p "$DEDUPE_PROJECT"
cd "$DEDUPE_PROJECT"
git init
drwn init --non-interactive
drwn apply @me/frontend@^1.0.0
drwn write --dry-run --json
```

Verify:

- only one `.claude/skills/polish` materialization intent is present
- the line contains `← card @me/frontend@1.0.0`
- the line contains `(also available: user-default)`

Cleanup:

```bash
drwn skills uncurate polish
rm -rf "$DRWN_REPO/skills/shared/polish"
```

## Hard-Failure Contract Test

Wave 1 intentionally changed unresolved skill includes from "ignored" to
"fail write before mutation."

Inject a bad include:

```bash
python3 - <<'PY'
import json
p = ".agents/drwn/config.json"
with open(p) as f:
    data = json.load(f)
data["skills"] = {"include": ["ghost-skill"]}
with open(p, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
```

Then run:

```bash
drwn write --dry-run
drwn doctor
```

Verify:

- `drwn write --dry-run` exits non-zero
- the error mentions `ghost-skill`
- `drwn doctor` remains read-only and surfaces the issue diagnostically

Restore the config or re-apply your card set before continuing.

## Versioning, Updates, Pinning, Add / Remove / Detach

### 1. Publish a second version

```bash
cat > "$CARD_SRC/card.json" <<'JSON'
{
  "name": "@me/frontend",
  "version": "1.1.0",
  "description": "Frontend harness test card v1.1.0",
  "skills": {
    "include": ["polish", "animate", "refine"]
  },
  "servers": {
    "card-server": {
      "description": "From card",
      "transport": "stdio",
      "command": "card-run",
      "optional": false
    }
  }
}
JSON

mkdir -p "$CARD_SRC/skills/refine"
cat > "$CARD_SRC/skills/refine/SKILL.md" <<'MD'
---
name: refine
description: refine
---
Refine skill body.
MD
```

Publish and inspect:

```bash
drwn card publish @me/frontend
drwn card diff @me/frontend@1.0.0 @me/frontend@1.1.0
```

### 2. Create a second card

```bash
drwn card new @me/observability --no-git
export OBS_SRC="$AGENTS_DIR/drwn/sources/@me/observability"

cat > "$OBS_SRC/card.json" <<'JSON'
{
  "name": "@me/observability",
  "version": "1.0.0",
  "description": "Observability card",
  "skills": {
    "include": ["trace"]
  }
}
JSON

mkdir -p "$OBS_SRC/skills/trace"
cat > "$OBS_SRC/skills/trace/SKILL.md" <<'MD'
---
name: trace
description: trace
---
Trace skill body.
MD

drwn card publish @me/observability
```

### 3. Exercise project mutation commands

```bash
cd "$PROJECT"
drwn card outdated
drwn card update
drwn card pin @me/frontend@1.0.0
drwn card outdated --check || true
drwn card add @me/observability@^1.0.0
drwn card remove @me/observability
drwn card detach
```

Verify:

- on a ranged spec such as `@me/frontend@^1.0.0`, `drwn card outdated` prints `No outdated cards.` because it refreshes the lock to the latest compatible version before comparing
- `card update` refreshes `card.lock` to the latest compatible version for ranged specs
- `card pin` writes an exact ref into project config
- after pinning to `@me/frontend@1.0.0`, `card outdated --check` exits non-zero because `1.1.0` exists locally and the exact pin stays on `1.0.0`
- `card add`, `remove`, and `detach` mutate project state as expected

## Integrity Verification Test

This validates Wave 1 content-tree integrity for extracted Git trees.

1. publish and apply a card so a lockfile entry exists
2. replace that lockfile entry's `integrity` with a bogus `sha256-...` value
3. run `drwn install --no-apply`

Expected:

- DRWN reports an integrity mismatch
- the lockfile remains unchanged
- subsequent runs still fail until the lockfile integrity is corrected

## Corruption Detection Test

In the sandbox only:

```bash
rm -rf "$AGENTS_DIR/drwn/extracted/<tree-sha>/skills/polish"
cd "$PROJECT"
drwn write
```

Expected:

- write fails
- the error reports that `@me/frontend@1.0.0` is missing the required skill directory `polish`

## Mind Content Flow

Exercises the mind-card content layer (persona / beliefs / memory), the active-mind stack, and the composed materialization. Continues in the same sandbox.

### 1. Author mind content on a card source

```bash
drwn card new @me/strategist --no-git
drwn card source add-persona @me/strategist voice --visibility internal
drwn card source add-belief  @me/strategist first-principles --visibility internal
drwn card source add-memory  @me/strategist transcripts --layer l6 --visibility private --format jsonl
drwn card source doctor @me/strategist
drwn card publish @me/strategist
```

Verify:

- `card source doctor` greens (persona/beliefs/memory dirs + required `visibility` present)
- `publish` refuses if a declared `PERSONA.md` / `BELIEF.md` / memory entry is missing or a `jsonl` layer has invalid lines

### 2. Activate a mind stack and materialize

```bash
drwn card apply @me/frontend@^1.0.0 @me/strategist@^1.0.0
drwn mind list                       # both installed; default = all active
drwn mind use @me/frontend @me/strategist
drwn write --json
```

Verify:

- per-mind bundles under `.agents/drwn/generated/minds/@me/frontend/` and `.../@me/strategist/`
- the registry `.agents/drwn/generated/minds.json`
- the composed active view `.agents/drwn/generated/mind/`: stack-ordered `persona.md`, namespaced `beliefs/@me/strategist/...`, `memory/l6/@me/strategist/...`, and a `mind.json` whose `activeMinds` equals `["@me/frontend", "@me/strategist"]`

### 3. Reorder, shrink, and clear the stack

```bash
drwn mind use @me/strategist @me/frontend   # reorder
drwn write --json                           # mind.json activeMinds order flips
drwn mind use @me/strategist                # shrink
drwn write --json                           # @me/frontend pruned from generated/mind
drwn mind clear                             # explicit none
drwn write --json
```

Verify:

- `generated/mind/mind.json` `activeMinds` tracks each `mind use` order
- after shrink, the dropped mind's entries are pruned from `generated/mind/`
- after `mind clear`, `generated/mind/` is removed while the per-mind `generated/minds/<name>/` bundles remain

## Existing Project Flow

For a real project, use the shorter consumption-focused workflow:

```bash
cd /path/to/real/project
drwn init --non-interactive   # only if .agents/drwn/config.json does not exist
drwn apply @me/frontend@^1.0.0
drwn write --dry-run
drwn doctor
drwn status --why skill:polish
drwn write
```

Recommended safety rules:

- keep `AGENTS_HOME_DIR` and `AGENTS_DIR` pointed at a sandbox even for a real project
- do not start on a project with unknown local drift
- always inspect `write --dry-run`, `doctor`, and `status --explain` before the real write

## Cleanup

When done:

```bash
rm -rf "$SANDBOX" "${SANDBOX_LEGACY:-}"
unset DRWN_REPO SANDBOX SANDBOX_LEGACY AGENTS_HOME_DIR AGENTS_DIR AGENTS_REPO_ROOT
unset PROJECT CARD_SRC CAPTURED_SRC DEDUPE_PROJECT OBS_SRC LEGACY_HOME LEGACY_AGENTS
unset -f drwn
```
