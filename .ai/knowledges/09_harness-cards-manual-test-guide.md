# Harness Cards Manual Test Guide

## Purpose

Use this guide to manually test the full Harness Cards feature on your local machine against the **current implementation**, not an aspirational architecture.

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
- downstream card-provided skills symlink into the immutable card store under `~/.agents/bgng/cards/...`
- if a card and a non-card source provide the same skill name, the card copy wins
- `bgng write --dry-run --json` annotates the winning layer for skill symlink intents
- unresolved `skills.include` names fail `bgng write` before any downstream mutation
- `bgng doctor` is report-only and surfaces related issues without fixing them
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

export HARNESS_REPO=/Users/pureicis/dev/beginning-harness
export ENTRYPOINT="$HARNESS_REPO/cli/index.ts"
export SANDBOX="$(mktemp -d /tmp/bgng-cards-XXXXXX)"
export AGENTS_HOME_DIR="$SANDBOX/home"
export AGENTS_DIR="$AGENTS_HOME_DIR/.agents"
export AGENTS_REPO_ROOT="$HARNESS_REPO"

mkdir -p "$AGENTS_HOME_DIR" "$AGENTS_DIR"

bgng() {
  AGENTS_HOME_DIR="$AGENTS_HOME_DIR" \
  AGENTS_DIR="$AGENTS_DIR" \
  AGENTS_REPO_ROOT="$AGENTS_REPO_ROOT" \
  bun run "$ENTRYPOINT" "$@"
}
```

Sanity check:

```bash
bgng status
bgng write --help
bgng card new -h=0
```

## Full Sandbox Walkthrough

### 1. Create a disposable project

```bash
export PROJECT="$SANDBOX/project"
mkdir -p "$PROJECT"
cd "$PROJECT"
git init
bgng init --non-interactive
```

Verify:

- `.agents/bgng/config.json` exists
- `bgng status` shows project context when run inside the directory

### 2. Create a card source

```bash
bgng card new @me/frontend --no-git
export CARD_SRC="$AGENTS_DIR/bgng/sources/@me/frontend"
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
bgng card publish @me/frontend
bgng card list
bgng card show @me/frontend@1.0.0
bgng card show @me/frontend@1.0.0 --json
```

Verify:

- publish succeeds
- the published version exists at `"$AGENTS_DIR/bgng/cards/@me/frontend/1.0.0"`
- `.integrity` exists in the published version directory

### 5. Apply the card to the project

```bash
cd "$PROJECT"
bgng apply @me/frontend@^1.0.0
cat .agents/bgng/config.json
cat .agents/bgng/card.lock
```

Verify that `card.lock` contains:

- the exact resolved card version
- `integrity`
- `manifest`
- `skills`
- `registry: null`

### 6. Preview materialization

```bash
bgng write --dry-run
bgng write --dry-run --json
```

Verify:

- planned skill links for `polish` and `animate`
- planned MCP config for `card-server`
- skill targets point into `"$AGENTS_DIR/bgng/cards/@me/frontend/1.0.0/skills/..."`

### 7. Materialize the project

```bash
bgng write
readlink .claude/skills/polish
readlink .claude/skills/animate
cat .claude/settings.json
```

Verify:

- both symlinks resolve into the immutable card store path
- `.claude/settings.json` contains `card-server`
- if Codex is enabled, equivalent `.codex/skills/...` links also materialize

### 8. Inspect provenance and diagnostics

```bash
bgng status --explain
bgng status --why skill:polish
bgng card status --explain
bgng doctor
bgng doctor --json
```

Verify:

- `status --why skill:polish` attributes the skill to `card @me/frontend@1.0.0`
- `doctor` does not falsely report bundled-only skills as unknown
- `doctor` is report-only

### 9. Verify idempotency

```bash
bgng write --json
```

Verify:

- `changes` is empty on the second write

## Manual Checks For The Four Wave 1 Regressions

### A. Legacy layout detection and migrate-first enforcement

Create a fake pre-cards layout:

```bash
export SANDBOX_LEGACY="$(mktemp -d /tmp/bgng-legacy-XXXXXX)"
export LEGACY_HOME="$SANDBOX_LEGACY/home"
export LEGACY_AGENTS="$LEGACY_HOME/.agents"

mkdir -p "$LEGACY_AGENTS/bgng" "$LEGACY_AGENTS/library" "$LEGACY_AGENTS/packages/skills/@acme/skills/1.0.0"
printf '{"version":1,"optional":{}}\n' > "$LEGACY_AGENTS/bgng/config.json"
printf '{"version":1,"servers":{}}\n' > "$LEGACY_AGENTS/library/mcp-servers.json"
```

Attempt authoring:

```bash
AGENTS_HOME_DIR="$LEGACY_HOME" AGENTS_DIR="$LEGACY_AGENTS" AGENTS_REPO_ROOT="$HARNESS_REPO" \
  bash -lc 'cd "$HARNESS_REPO" && bun run bgng -- card new @me/test --no-git'
```

Verify:

- command fails
- error directs you to `bgng store migrate`

Then migrate:

```bash
AGENTS_HOME_DIR="$LEGACY_HOME" AGENTS_DIR="$LEGACY_AGENTS" AGENTS_REPO_ROOT="$HARNESS_REPO" \
  bash -lc 'cd "$HARNESS_REPO" && bun run bgng -- store migrate'
```

Verify:

- migration succeeds
- retrying `card new` now works

### B. Bundled-only skills must not be dropped

Already covered by the `polish` / `animate` walkthrough above.

Critical check:

```bash
test -L .claude/skills/polish
test -L .claude/skills/animate
```

### C. Card-provided skills must materialize from the card store, not the repo

Critical check:

```bash
readlink .claude/skills/polish
readlink .claude/skills/animate
```

Expected:

- both point into `"$AGENTS_DIR/bgng/cards/..."`
- neither points into the checkout’s built-in `skills/` tree

### D. Dry-run must dedupe and show which layer wins

Temporarily add a same-name repo-native skill in the checkout and curate it into
the publication layer:

```bash
mkdir -p "$HARNESS_REPO/skills/shared/polish"
cat > "$HARNESS_REPO/skills/shared/polish/SKILL.md" <<'MD'
---
name: polish
description: repo polish
---
Repo-native polish
MD

bgng skills curate polish
```

Use a fresh applied-but-unwritten project for this check. `bgng write --dry-run
--json` only lists pending mutations in `changes`, so re-running it against an
already materialized project will usually return `changes: []`.

```bash
export DEDUPE_PROJECT="$SANDBOX/dedupe-project"
mkdir -p "$DEDUPE_PROJECT"
cd "$DEDUPE_PROJECT"
git init
bgng init --non-interactive
bgng apply @me/frontend@^1.0.0
bgng write --dry-run --json
```

Verify:

- only one `.claude/skills/polish` symlink intent is present
- the line contains `← card @me/frontend@1.0.0`
- the line contains `(also available: user-default)`

Cleanup:

```bash
bgng skills uncurate polish
rm -rf "$HARNESS_REPO/skills/shared/polish"
```

## Hard-Failure Contract Test

Wave 1 intentionally changed unresolved skill includes from "ignored" to
"fail write before mutation."

Inject a bad include:

```bash
python3 - <<'PY'
import json
p = ".agents/bgng/config.json"
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
bgng write --dry-run
bgng doctor
```

Verify:

- `bgng write --dry-run` exits non-zero
- the error mentions `ghost-skill`
- `bgng doctor` remains read-only and surfaces the issue diagnostically

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
bgng card publish @me/frontend
bgng card diff @me/frontend@1.0.0 @me/frontend@1.1.0
```

### 2. Create a second card

```bash
bgng card new @me/observability --no-git
export OBS_SRC="$AGENTS_DIR/bgng/sources/@me/observability"

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

bgng card publish @me/observability
```

### 3. Exercise project mutation commands

```bash
cd "$PROJECT"
bgng card outdated
bgng card update
bgng card pin @me/frontend@1.0.0
bgng card outdated --check || true
bgng card add @me/observability@^1.0.0
bgng card remove @me/observability
bgng card detach
```

Verify:

- on a ranged spec such as `@me/frontend@^1.0.0`, `bgng card outdated` prints `No outdated cards.` because it refreshes the lock to the latest compatible version before comparing
- `card update` refreshes `card.lock` to the latest compatible version for ranged specs
- `card pin` writes an exact ref into project config
- after pinning to `@me/frontend@1.0.0`, `card outdated --check` exits non-zero because `1.1.0` exists locally and the exact pin stays on `1.0.0`
- `card add`, `remove`, and `detach` mutate project state as expected

## Integrity Upgrade Test

This validates the one-time Wave 1 upgrade from manifest-only integrity to
content-tree integrity.

1. publish and apply a card so a version exists in the store
2. replace the stored `.integrity` and `versions.json` integrity with a
   manifest-only hash
3. run `bgng card update` or `bgng apply ...` again

Expected:

- BGNG prints an integrity upgrade message
- `.integrity` is rewritten
- `versions.json` is rewritten
- subsequent runs stop printing the upgrade

If you want to script this, copy the same shape used in
`test/core-card-integrity-content.test.ts`.

## Corruption Detection Test

In the sandbox only:

```bash
rm -rf "$AGENTS_DIR/bgng/cards/@me/frontend/1.0.0/skills/polish"
cd "$PROJECT"
bgng write
```

Expected:

- write fails
- the error reports that `@me/frontend@1.0.0` is missing the required skill directory `polish`

## Existing Project Flow

For a real project, use the shorter consumption-focused workflow:

```bash
cd /path/to/real/project
bgng init --non-interactive   # only if .agents/bgng/config.json does not exist
bgng apply @me/frontend@^1.0.0
bgng write --dry-run
bgng doctor
bgng status --why skill:polish
bgng write
```

Recommended safety rules:

- keep `AGENTS_HOME_DIR` and `AGENTS_DIR` pointed at a sandbox even for a real project
- do not start on a project with unknown local drift
- always inspect `write --dry-run`, `doctor`, and `status --explain` before the real write

## Cleanup

When done:

```bash
rm -rf "$SANDBOX" "${SANDBOX_LEGACY:-}"
unset HARNESS_REPO SANDBOX SANDBOX_LEGACY AGENTS_HOME_DIR AGENTS_DIR AGENTS_REPO_ROOT
unset PROJECT CARD_SRC OBS_SRC LEGACY_HOME LEGACY_AGENTS
unset -f bgng
```
