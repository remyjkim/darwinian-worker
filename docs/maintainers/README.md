# Maintainer Docs

This directory is for maintainer-facing documentation that should not live in the public quickstart in [README.md](../../README.md).

Use it for:

- release and publishing workflows
- operational runbooks
- distribution and packaging notes
- maintainer-only troubleshooting
- future release channels such as Homebrew

## Current Docs

- [publishing.md](./publishing.md): manual npm publishing workflow, token-isolation strategy, and lessons from the first release path
- package-backed skill bundles are implemented in the main repo and should be documented here as the operational model stabilizes

## Scope Guidelines

Keep material in `README.md` when it is:

- needed by most users
- part of first-run onboarding
- part of normal day-to-day CLI usage

Move material into `docs/maintainers/` when it is:

- specific to maintainers
- release-engineering focused
- operationally detailed
- too specialized or distracting for the public quickstart
