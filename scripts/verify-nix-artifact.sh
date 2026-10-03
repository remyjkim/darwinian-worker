#!/usr/bin/env bash
# ABOUTME: Qualifies and smokes one Nix-built Worker source tar without publishing it.
# ABOUTME: Retains exact-byte evidence for a later reviewed artifact decision.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: bash scripts/verify-nix-artifact.sh <nix-output-dir> <evidence-dir>" >&2
  exit 2
fi

DRWN_NIX_ARTIFACT_DIR="$1"
DRWN_NIX_EVIDENCE_DIR="$2"
test -f "$DRWN_NIX_ARTIFACT_DIR/npm-pack.json"
test -f "$DRWN_NIX_ARTIFACT_DIR/darwinian-1.4.2.tgz"
mkdir -p "$DRWN_NIX_EVIDENCE_DIR"
cp "$DRWN_NIX_ARTIFACT_DIR/npm-pack.json" "$DRWN_NIX_EVIDENCE_DIR/npm-pack.json"

bun scripts/release-cli.ts qualify-artifact \
  "$DRWN_NIX_ARTIFACT_DIR/npm-pack.json" \
  "$DRWN_NIX_ARTIFACT_DIR" > "$DRWN_NIX_EVIDENCE_DIR/artifact.json"

DRWN_SOURCE_COMMIT="$(git rev-parse HEAD)"
jq -e --arg commit "$DRWN_SOURCE_COMMIT" \
  '.sourceCommit == $commit and .version == "1.4.2"' \
  "$DRWN_NIX_EVIDENCE_DIR/artifact.json" > /dev/null

cp "$DRWN_NIX_ARTIFACT_DIR/darwinian-1.4.2.tgz" \
  "$DRWN_NIX_EVIDENCE_DIR/darwinian-1.4.2.tgz"
DRWN_EXPECTED_SHA="$(jq -r '.sha256' "$DRWN_NIX_EVIDENCE_DIR/artifact.json")"
DRWN_ACTUAL_SHA="$(shasum -a 256 "$DRWN_NIX_EVIDENCE_DIR/darwinian-1.4.2.tgz" | cut -d ' ' -f 1)"
test "$DRWN_ACTUAL_SHA" = "$DRWN_EXPECTED_SHA"
printf '%s\n' "$DRWN_ACTUAL_SHA" > "$DRWN_NIX_EVIDENCE_DIR/artifact-sha256"

bun scripts/release-cli.ts smoke-artifact \
  "$DRWN_NIX_EVIDENCE_DIR/darwinian-1.4.2.tgz" \
  "$DRWN_NIX_EVIDENCE_DIR/smoke" > "$DRWN_NIX_EVIDENCE_DIR/smoke.json"

git diff --exit-code -- bun.lock flake.lock
