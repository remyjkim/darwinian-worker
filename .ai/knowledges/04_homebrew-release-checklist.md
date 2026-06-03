# Homebrew Release Checklist

This checklist is future-facing. Homebrew distribution is not implemented yet, but the release path should be defined before starting formula work.

## Naming

- package name finalization
- current package name: `darwinian-harness`
- finalize the public package/repository name
- current CLI binary name: `drwn`
- ensure there is no naming collision with existing formulae or packages

## Release Artifact

- create a tagged release
- define the canonical source tarball/archive format
- source tarball expectations
- ensure the archive contains the expected runnable CLI entrypoint
- confirm release asset stability and checksums

## Installation Strategy

- decide whether Homebrew installs:
  - source-only via Bun
  - bundled script/runtime wrapper
  - prebuilt release artifact
- binary install strategy
- document Bun dependency expectations for end users

## Formula Hosting

- decide where the formula lives:
  - core tap not expected
  - custom tap likely
- formula location and hosting decision
- decide repository ownership for the tap
- document tap installation instructions

## macOS Architecture

- macOS architecture considerations
- confirm support expectations for Apple Silicon
- confirm support expectations for Intel macOS if desired
- ensure no architecture-specific path assumptions remain

## Post-Install Validation

post-install smoke tests:

After a future Homebrew install, verify:

- `drwn --help`
- `drwn status --json`
- `drwn doctor --json`
- `drwn init --force`
- `drwn write --dry-run`
- `drwn scan --json` (currently a planned-surface placeholder; confirms the binary is reachable and JSON output renders)
- `drwn skills packages list --json`
- `drwn store status --json`
- `drwn card list --json`
- `drwn status --explain`

## User Environment Assumptions

- confirm behavior with no pre-existing `~/.agents`
- confirm behavior with existing `~/.agents`
- confirm safe behavior when optional local tools like `markdownify` are absent

## Publish-Adjacent Requirements

- package metadata finalized
- package metadata currently uses `darwinian-harness`
- repository metadata finalized
- license finalized
- docs updated to include Homebrew usage once implementation exists

## Explicit Non-Goals For Now

- implementing the formula
- publishing a tap
- claiming Homebrew support in README before the path is actually tested
