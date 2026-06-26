# Release Process

## Releasing a new CLI version

Use the GitHub Actions release workflow for npm publishes. The `npm-publish`
environment owns `NPM_TOKEN` and requires reviewer approval before the publish
job can run.

1. On `main` with a clean working tree, bump `version` in `package.json`.
2. Run the local release gate:

   ```bash
   bun install --frozen-lockfile
   bun run verify:release
   ```

3. Commit the version bump, for example `[release] v0.2.2`, and push it.
4. After `CLI CI / Validate` is green on `main`, create and push an annotated tag:

   ```bash
   git tag -a v0.2.2 -m "Release v0.2.2"
   git push origin v0.2.2
   ```

5. In GitHub Actions, approve the `npm-publish` environment when the release
   workflow pauses.
6. After publish completes, verify npm and the GitHub Release:

   ```bash
   npm view darwinian-harness@0.2.2 version
   npm install -g darwinian-harness@0.2.2
   drwn --version
   ```

The release workflow also supports `workflow_dispatch` with `dry_run: true`.
Use that path to validate the current `main` release candidate without entering
the `npm-publish` environment or publishing to npm.

If GitHub Actions is unavailable during a release window, run
`bun run verify:release` locally first, then publish with a maintainer-owned npm
token using the guarded manual process in `docs/maintainers/publishing.md`.
