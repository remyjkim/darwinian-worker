# Remote Card Publishing Usage Pattern Manual

**Date**: 2026-06-02
**Status**: Current implementation guide
**Scope**: drwn Git-backed Harness Card publishing, pushing, cloning, consuming, and remote smoke testing
**Related Task**: [34_completion_drwn-git-distribution-wave-2.md](../tasks/34_completion_drwn-git-distribution-wave-2.md)
**Supersedes For Current Usage**: aspirational authoring details in [46_drwn-card-team-sharing-flow.md](./46_drwn-card-team-sharing-flow.md) where they mention commands not present in the current CLI, such as `drwn card source ...` or publish-time `--bump` flags

---

## Purpose

This manual documents the current safe usage pattern for publishing Harness Cards to hosted Git remotes and consuming them from fresh machines or projects.

The key rule is simple:

```text
drwn publishes card versions locally, then Git pushes those refs remotely.
```

`drwn card publish` creates commits and tags in the local per-card bare repo. `drwn card push` performs a normal Git push to the configured remote. drwn does not force push, does not store credentials, and does not replace Git's authentication model.

---

## Current Command Roles

| Command | Role |
| --- | --- |
| `drwn card new <name> --no-git` | Create a blank editable card source. |
| `drwn card new <name> --from-project [path]` | Capture a project's effective harness into an editable card source. |
| `drwn card publish <name>` | Commit the source into `~/.agents/drwn/cards/<scope>/<name>.git` and tag `v<version>`. |
| `drwn card remote add <name> <url>` | Add a Git remote to the local bare card repo and record `drwn.originUrl`. |
| `drwn card remote set <name> <url>` | Set or replace a remote URL. |
| `drwn card remote list <name> --json` | Inspect configured remotes. |
| `drwn card push <name>` | Push `refs/heads/main` and all tags to the configured remote. |
| `drwn card fetch <name>` | Fetch remote heads and tags into an existing local bare card repo. |
| `drwn card clone git+<url>#<ref>` | Clone a Git-origin card into the local store and extract the selected ref. |
| `drwn add git+<url>#<ref>` | Add a Git-origin card to the current project and write `card.lock`. |
| `drwn install` | Bootstrap locked cards, then write project state unless `--no-apply` is supplied. |
| `drwn write` | Materialize the effective project state into downstream local agent tool files. |

`drwn apply` and `drwn card apply` compose project card selections. `drwn write` is downstream materialization.

---

## Git Model

Application Git operations go through `cli/core/git.ts`, which shells out to the system Git binary with `Bun.spawn(["git", ...])`. drwn does not use a Git library.

That means:

- SSH keys, HTTPS credentials, credential helpers, host verification, and authorization are handled by Git.
- If `git clone <url>` or `git ls-remote <url>` fails in the shell, the equivalent drwn Git operation will fail too.
- `drwn card push` is a normal non-force Git push.
- `drwn card fetch` is a normal Git fetch of heads and tags.
- Hosted remotes should be treated as one card repository per card.

---

## Repository Policy For Hosted Cards

Use one hosted Git repo per card.

Recommended remote layout:

```text
github.com/<org>/<card-name>.git
gitlab.com/<group>/<card-name>.git
gitea.example.com/<team>/<card-name>.git
```

Inside the card repo:

- `refs/heads/main` is the card's publish history.
- `refs/tags/v<semver>` are immutable card versions.
- Do not retag versions.
- Do not force-push shared card refs during normal operation.
- Treat the card remote as an artifact repo, not as the editable source checkout.

The editable source lives locally under:

```text
~/.agents/drwn/sources/<scope>/<name>/
```

The local published Git store lives under:

```text
~/.agents/drwn/cards/<scope>/<name>.git/
```

Extracted immutable content lives under:

```text
~/.agents/drwn/extracted/<git-tree-sha>/
```

---

## Safe Sandbox Harness

Use isolated stores for remote smoke tests so the normal home store is not touched.

```bash
set -euo pipefail

export HARNESS_REPO=/path/to/darwinian-harness
export ENTRYPOINT="$HARNESS_REPO/cli/index.ts"
export SANDBOX="$(mktemp -d /tmp/drwn-remote-card-XXXXXX)"
export AGENTS_HOME_DIR="$SANDBOX/home"
export AGENTS_DIR="$AGENTS_HOME_DIR/.agents"
export AGENTS_REPO_ROOT="$HARNESS_REPO"

mkdir -p "$AGENTS_HOME_DIR" "$AGENTS_DIR"

drwn() {
  AGENTS_HOME_DIR="$AGENTS_HOME_DIR" \
  AGENTS_DIR="$AGENTS_DIR" \
  AGENTS_REPO_ROOT="$AGENTS_REPO_ROOT" \
  DRWN_GIT_TIMEOUT_MS="${DRWN_GIT_TIMEOUT_MS:-60000}" \
  bun "$ENTRYPOINT" "$@"
}
```

Sanity checks:

```bash
git --version
drwn --version
drwn card push --help
```

Remote access check:

```bash
git ls-remote git@github.com:org/card-repo.git
```

For a first-push smoke, the remote should return no refs.

---

## Pattern 1: First Publish To An Empty Remote

Use this for a brand-new card remote.

### 1. Confirm The Remote Is Empty

```bash
REMOTE=git@github.com:org/card-repo.git
git ls-remote "$REMOTE"
```

Expected output for a first-push smoke:

```text
```

If refs already exist, do not use the first-push pattern. Use Pattern 2 or Pattern 3.

### 2. Create Or Capture A Card Source

Blank source:

```bash
drwn card new @team/baseline --no-git
```

Captured source:

```bash
drwn card new @team/baseline --from-project /path/to/project --no-git
```

The source path is:

```text
$AGENTS_DIR/drwn/sources/@team/baseline
```

### 3. Edit Manifest And Source Content

For a captured card, version defaults to `0.1.0`.

For a blank card, version defaults to `1.0.0`.

Set quality fields when appropriate:

```json
{
  "name": "@team/baseline",
  "version": "0.1.0",
  "description": "Team baseline harness",
  "stability": "stable",
  "lastValidatedWith": "0.1.0",
  "testStatusBadge": "https://example.com/baseline-status.svg",
  "skills": {
    "include": ["review-helper"]
  }
}
```

Quality field rules:

- `stability` must be `experimental`, `stable`, or `production`.
- `lastValidatedWith` must be semver.
- `testStatusBadge` must be `http:` or `https:`.

### 4. Publish Locally

```bash
drwn card publish @team/baseline
drwn card show @team/baseline@0.1.0
```

Expected:

- local bare repo exists under `$AGENTS_DIR/drwn/cards/@team/baseline.git`
- tag `v0.1.0` exists
- extracted content exists under `$AGENTS_DIR/drwn/extracted/<tree-sha>`

### 5. Add Remote And Push

```bash
drwn card remote add @team/baseline "$REMOTE"
drwn card remote list @team/baseline --json
drwn card push @team/baseline
```

Verify hosted refs:

```bash
git ls-remote "$REMOTE" refs/heads/main refs/tags/v0.1.0
```

Expected:

- one `refs/heads/main`
- one `refs/tags/v0.1.0`

---

## Pattern 2: Publish A New Version From The Same Machine

Use this when the same local store already published the previous version and the remote has not diverged.

### 1. Edit The Existing Source

```bash
SRC="$AGENTS_DIR/drwn/sources/@team/baseline"
$EDITOR "$SRC/card.json"
```

Update `version` to a new semver value, for example `0.1.1`.

### 2. Publish And Push

```bash
drwn card publish @team/baseline
drwn card push @team/baseline
```

Because `drwn card publish` uses the local bare repo's current `refs/heads/main` as the parent, this should fast-forward when the remote has not advanced independently.

### 3. Verify New Ref

```bash
git ls-remote "$REMOTE" refs/tags/v0.1.1
```

---

## Pattern 3: Publish A New Version From A Fresh Machine

Use this when the remote already has history, but the local machine has not published this card before.

The important constraint: seed the local bare repo with the remote history before publishing. Otherwise `drwn card push` may be rejected as non-fast-forward.

### 1. Clone The Existing Remote Card Into The Store

```bash
REMOTE=git@github.com:org/card-repo.git
drwn card clone "git+$REMOTE#v0.1.0" --json
```

This creates:

```text
$AGENTS_DIR/drwn/cards/@team/baseline.git
```

and records:

```text
$AGENTS_DIR/drwn/url-card-map.json
```

### 2. Create A New Source For The Same Card Name

If no local source exists:

```bash
drwn card new @team/baseline --from-project /path/to/project --no-git
```

Then edit:

```text
$AGENTS_DIR/drwn/sources/@team/baseline/card.json
```

Set `version` to a new semver value, such as `0.1.1`.

### 3. Publish And Push

```bash
drwn card publish @team/baseline
drwn card push @team/baseline
```

Because the bare repo was cloned first, the new publish commit descends from the remote `main` ref and can fast-forward.

---

## Pattern 4: Recover From Non-Fast-Forward Push

Symptom:

```text
git push failed to origin
non-fast-forward
```

Root cause:

- the remote `main` has commits that the local bare repo does not have, or
- the local card repo was created independently from the remote history.

Recovery:

```bash
drwn card fetch @team/baseline
```

Then publish a new version from the updated local bare repo:

```bash
# edit card.json to a new semver version first
drwn card publish @team/baseline
drwn card push @team/baseline
```

If the local source was created from an unrelated history and the remote already has refs, do not force-push as a routine fix. Seed from the remote first, or use a fresh empty remote.

---

## Pattern 5: Consume A Hosted Git Card In A Project

Use direct Git refs when there is no shared catalog yet.

```bash
PROJECT=/path/to/project
REMOTE=git@github.com:org/card-repo.git

cd "$PROJECT"
drwn init --non-interactive --no-default-catalogs
drwn add "git+$REMOTE#v0.1.0"
drwn install --no-apply
drwn write
```

Expected project files:

```text
.agents/drwn/config.json
.agents/drwn/card.lock
.claude/settings.json
.codex/config.toml
.claude/skills/<skill-name> -> $AGENTS_DIR/drwn/extracted/<tree-sha>/skills/<skill-name>
.codex/skills/<skill-name> -> $AGENTS_DIR/drwn/extracted/<tree-sha>/skills/<skill-name>
```

Expected lockfile fields:

```json
{
  "origin": "git",
  "git": {
    "url": "git@github.com:org/card-repo.git",
    "ref": "v0.1.0",
    "commit": "..."
  }
}
```

---

## URL Cache Behavior

The cache lives at:

```text
$AGENTS_DIR/drwn/url-card-map.json
```

Shape:

```json
{
  "mapVersion": 1,
  "entries": {
    "git@github.com:org/card-repo.git": {
      "name": "@team/baseline",
      "url": "git@github.com:org/card-repo.git",
      "discoveredAt": "2026-06-02T00:00:00.000Z"
    }
  }
}
```

Rules:

- The URL cache is an optimization, not an authority.
- Missing cache files are fine.
- Corrupt cache files are ignored.
- Successful Git discovery updates the cache.
- Cache hits still enforce local origin URL collision checks.
- Stale cache entries can be corrected after successful fresh discovery.

Do not manually rely on the cache as a project dependency. Project reproducibility comes from `card.lock`, not from `url-card-map.json`.

---

## Live Smoke Recipe

This is the recommended release-style remote smoke. Use a disposable remote.

```bash
set -euo pipefail

REMOTE=git@github.com:org/disposable-card-remote.git
CARD=@remote/wave2-smoke
VERSION=0.1.0
TAG=v$VERSION

git ls-remote "$REMOTE"

PROJECT_A="$SANDBOX/project-a"
PROJECT_B="$SANDBOX/project-b"
mkdir -p "$PROJECT_A" "$PROJECT_B"

cd "$PROJECT_A"
drwn init --non-interactive --no-default-catalogs

# Configure the project so capture has real effective state.
# Edit .agents/drwn/config.json to include skills, targets, servers, or extensions.

drwn card new "$CARD" --from-project "$PROJECT_A" --no-git

# Edit $AGENTS_DIR/drwn/sources/@remote/wave2-smoke/card.json:
# - confirm version is 0.1.0
# - add quality fields when appropriate

drwn card publish "$CARD"
drwn card remote add "$CARD" "$REMOTE"
drwn card push "$CARD"

git ls-remote "$REMOTE" refs/heads/main "refs/tags/$TAG"

# Fresh consumer store recommended for this section.
drwn card clone "git+$REMOTE#$TAG" --json

cd "$PROJECT_B"
drwn init --non-interactive --no-default-catalogs
drwn add "git+$REMOTE#$TAG"
drwn install --no-apply
drwn write
```

Verify:

```bash
test -f "$PROJECT_B/.agents/drwn/card.lock"
test -f "$AGENTS_DIR/drwn/url-card-map.json"
```

Inspect:

```bash
cat "$PROJECT_B/.agents/drwn/card.lock"
cat "$AGENTS_DIR/drwn/url-card-map.json"
```

---

## Completed Hosted Smoke Evidence

The Wave 2 completion pass used this disposable remote:

```text
git@github.com:curation-labs/darwinian-harness-remote-test-01.git
```

Observed result:

- first `git ls-remote` showed no refs
- `drwn card push @remote/wave2-smoke` created `main` and `v0.1.0`
- fresh consumer clone by `git+ssh#v0.1.0` succeeded
- `drwn add git+ssh#v0.1.0` wrote a Git-origin lockfile entry
- `drwn write` materialized Claude and Codex skill symlinks
- `url-card-map.json` mapped the SSH URL to `@remote/wave2-smoke`
- locked commit was `7b823fa9f588ddf6876657cedf3e82822703554f`

The remote is no longer empty. Do not run a first-push smoke against it again unless the remote has been intentionally reset outside this workflow.

---

## Troubleshooting

### SSH auth fails

Check Git directly:

```bash
ssh -T git@github.com
git ls-remote "$REMOTE"
```

Fix SSH keys or host access before rerunning drwn.

### Remote is not empty

Do not use the first-push pattern. Use Pattern 2 or Pattern 3.

### Tag already exists locally

`drwn card publish` refuses to overwrite an existing version tag.

Fix by editing `card.json` to a new semver version.

### Push rejected as non-fast-forward

Fetch first:

```bash
drwn card fetch @team/baseline
```

Then publish a new version and push again. Do not force-push as the normal recovery path.

### Card name collision

A Git URL discovered a card name that already exists locally but is bound to a different origin URL.

Use a different card name, remove the conflicting local card store only if you intentionally want to discard it, or publish to the original remote for that card.

### Card name mismatch after cached lookup

The URL cache pointed to the wrong name. Current resolution falls back to fresh discovery when the cached clone reveals a mismatch. If manual inspection is needed, inspect:

```bash
cat "$AGENTS_DIR/drwn/url-card-map.json"
```

### `DRWN_STORE_READONLY=1` blocks publishing

Unset readonly mode for authoring:

```bash
unset DRWN_STORE_READONLY
```

Readonly mode is intended for verification or protected environments.

---

## Testing Strategy

Default automated gates should stay local and deterministic:

```bash
bun test
bun run typecheck
bun run verify:release --json
npm pack --dry-run --json
git diff --check
```

Git distribution tests in the normal suite should use local `file://` remotes. Hosted remote tests should be explicit smoke tests because they depend on:

- SSH credentials
- network availability
- remote authorization
- remote repository state
- non-fast-forward behavior

Minimum hosted smoke assertions:

- remote is empty or local store is seeded from remote history
- publish creates local `main` and `v<semver>`
- push creates hosted `main` and `v<semver>`
- fresh store can clone by `git+<url>#v<semver>`
- fresh project can add the hosted Git ref
- lockfile records `origin: "git"`, URL, ref, and commit
- `url-card-map.json` records URL to card name
- `drwn write` materializes card-provided skills from extracted Git content

---

## Operator Checklist

Before publishing:

- `card.json` has the intended name and new semver version.
- Declared skills exist under `skills/<name>/`.
- Quality fields are valid if present.
- The hosted remote is the intended one-card repo.
- `git ls-remote <remote>` output matches the expected state.

Before consuming:

- `git ls-remote <remote> refs/tags/v<version>` returns the intended tag.
- The project uses `git+<remote>#v<version>` or a local store ref already backed by a lockfile.
- `drwn install --no-apply` succeeds before `drwn write` if you want fetch-only validation.

Before release:

- local deterministic gates pass
- one hosted remote smoke has been run against a disposable remote
- remote side effects are documented
- no force-push was used as part of the smoke
