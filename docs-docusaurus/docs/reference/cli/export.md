---
sidebar_position: 14
---

# Export

`drwn export sessions` discovers and archives Claude Code and Codex session logs (`.jsonl`) belonging to the current project. The archive is upload-ready by construction — manual repackaging is unsafe.

Preview which files would be archived:

```bash
drwn export sessions --dry-run
```

Archive to the default destination:

```bash
drwn export sessions
```

Produce an upload-ready `.tar.gz` directly:

```bash
drwn export sessions --gzip
```

Override the destination:

```bash
drwn export sessions --out /tmp/my-sessions.tar
drwn export sessions --gzip --out /tmp/my-sessions.tar.gz
```

## Session discovery

The command resolves the project root via `git rev-parse --show-toplevel` (falling back to the current working directory) and derives a project slug by replacing every `/` in the resolved path with `-`. Slug matching automatically includes every git worktree of the project.

Source roots probed:

- `~/.claude/projects/` — Claude Code session and subagent logs
- `~/.codex/sessions/` — Codex rollouts (matched by `session_meta.payload.cwd` falling under a known project root)

Missing source roots are skipped silently — running `drwn export sessions` on a machine that has never used Codex is not an error.

## Archive layout

Members use flat, source-prefixed paths inside the archive:

```text
claude/<file>.jsonl         — main Claude Code sessions
claude/agents/<file>.jsonl  — Claude subagent logs
codex/<file>.jsonl          — Codex rollouts
```

No project subdirectories, no nested wrappers, no AppleDouble companions.

## Default destination

```text
<project>/.agents/drwn/session-log-exports/<utc-timestamp>.tar
```

With `--gzip`, the suffix is `.tar.gz`. The timestamp format is `YYYYMMDDTHHMMSS` in UTC.

## Cleanliness guarantees

`drwn export sessions` enforces archive cleanliness on every write:

- macOS metadata is suppressed at archive time: `tar` runs with `COPYFILE_DISABLE=1` and (on darwin) `--no-mac-metadata`, so no AppleDouble (`._*`) sidecars are emitted.
- After write, the archiver lists every member via `tar tf` / `tar tzf` and rejects:
  - AppleDouble entries (`._*`)
  - `__MACOSX/` directories
  - `.DS_Store`
  - any hidden dotfile
  - any member outside `claude/` or `codex/`
- The member count must match the discovered input count.

If validation fails, the polluted archive is removed and the command exits non-zero.

## Do not recompress manually

Do **not** Finder-zip `.agents/drwn/session-log-exports/`, re-tar the contents, or otherwise repackage the file `drwn` produces. Manual repackaging bypasses the cleanliness guarantees above and can introduce AppleDouble sidecars that break downstream analyzers. Upload the archive `drwn export sessions` produces as-is.

If you need the `.tar.gz` form for HTTP upload, pass `--gzip` to `drwn export sessions` so the cleanliness guarantees still apply.

## Related

- [Status](./status) — effective harness summary for the project being exported
- [Store export](./store) — archive of `~/.agents/drwn/` itself (distinct from session logs)
