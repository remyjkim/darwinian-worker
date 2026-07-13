# Publishing

This document is the maintainer-facing manual for publishing `darwinian` to npm.

It focuses on the verified working workflow. The deeper investigation notes remain in `.ai/knowledges/05_npm-publishing-analysis-and-manual.md`.

## Why This Exists

Local npm configuration can interfere with publishing.

In particular:

- `~/.npmrc` may already contain an auth token
- `npm whoami` can succeed without proving publish-time behavior
- `npm publish --dry-run` validates packaging, but not the full final auth path

To avoid machine-state drift, use an explicit temporary npm config for manual publishes.

## Preflight

From the repo root:

```bash
cd /path/to/darwinian-worker
```

Check package-name state:

```bash
npm view darwinian name version repository --json
```

Expected before the first `darwinian` publish:

- `E404 Not Found`

Expected after the first publish:

- package metadata for this project

Run the release gate:

```bash
bun run verify:release --json
```

Expected result:

- all checks `ok: true`
- no warnings

## Manual Publish

Load the token:

```bash
set -a
source .env
set +a
```

Create an isolated npm config:

```bash
TMP_NPMRC="$(mktemp)"
chmod 600 "$TMP_NPMRC"

cat > "$TMP_NPMRC" <<EOF
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_ORG_TOKEN}
EOF
```

Verify auth:

```bash
npm whoami --userconfig="$TMP_NPMRC"
```

Publish:

```bash
npm publish --access public --userconfig="$TMP_NPMRC"
```

Clean up:

```bash
rm -f "$TMP_NPMRC"
```

## Safer Full Sequence

```bash
cd /path/to/darwinian-worker

set -a
source .env
set +a

TMP_NPMRC="$(mktemp)"
chmod 600 "$TMP_NPMRC"

cat > "$TMP_NPMRC" <<EOF
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_ORG_TOKEN}
EOF

npm whoami --userconfig="$TMP_NPMRC"
bun test
bun run typecheck
bun run verify:release --json
npm pack --dry-run --json
npm publish --access public --userconfig="$TMP_NPMRC"

rm -f "$TMP_NPMRC"
```

## Notes

- Do not rely on ambient `~/.npmrc` state for publishing.
- Keep the package boundary explicit through `package.json.files`.
- Publish from committed repo state, not from a half-edited worktree.
- Earlier published names (`beginning-agents`, `beginning-harness`) are deprecated; mark them as such on npm now that `darwinian` is installable.
- If future CI publishing is added, prefer trusted publishing over long-lived tokens.

## Publishing `drwn-command-bridge`

Prefer the manually dispatched `Command Bridge Release` workflow. It uses the
protected `npm-publish` environment, validates the requested version against
`drwn-command-bridge/package.json`, re-runs the bridge verification suite, and
confirms the published version is visible in the registry.

For the local fallback, follow the same temporary-config procedure above from
`drwn-command-bridge/` after running `bun run verify`. Replace the package-name
preflight with:

```bash
npm view drwn-command-bridge@<version> version
```

An `E404` is required before publishing a new version.
