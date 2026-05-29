# Publishing

This document is the maintainer-facing manual for publishing `darwinian-harness` to npm.

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
cd /path/to/darwinian-harness
```

Check package-name state:

```bash
npm view darwinian-harness name version repository --json
```

Expected before the first `darwinian-harness` publish:

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
cd /path/to/darwinian-harness

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
- If `beginning-agents` remains published, deprecate it only after `darwinian-harness` is published and installable.
- If future CI publishing is added, prefer trusted publishing over long-lived tokens.
