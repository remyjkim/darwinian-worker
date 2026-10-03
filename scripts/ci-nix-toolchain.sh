#!/usr/bin/env bash
# ABOUTME: Runs fresh Worker checks inside the pinned Nix development shell.
# ABOUTME: Keeps Bun's application lock separate from Nix's toolchain lock.

set -euo pipefail

for tool in bun node npm git jq shellcheck; do
  command -v "$tool"
done

test "$(bun --version)" = "1.2.21"
test "$(node --version)" = "v24.21.0"
test "$(npm --version)" = "11.19.0"

# A linked CLI must resolve from this run, not from an ambient user-global bin.
DRWN_BUN_BIN_DIR="$(mktemp -d -t drwn-nix-bin.XXXXXX)"
trap 'rm -rf -- "$DRWN_BUN_BIN_DIR"' EXIT
export BUN_INSTALL_BIN="$DRWN_BUN_BIN_DIR/bin"
mkdir -p "$BUN_INSTALL_BIN"
DRWN_BUN_BIN_PATH="$(bun pm bin -g)"
export PATH="$DRWN_BUN_BIN_PATH:$PATH"

bun install --frozen-lockfile
bun link
test -L "$BUN_INSTALL_BIN/drwn"
bun run typecheck
bun test test/scripts-release-workflow.test.ts \
  test/scripts-release-recovery-workflow.test.ts \
  test/scripts-release-provenance.test.ts \
  test/scripts-release-artifact-contract.test.ts
bun run test:gate
QUALITY_GATE_TEST_MODE=1 bun run verify:release

git diff --exit-code -- bun.lock flake.lock
