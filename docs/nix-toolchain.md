# Nix toolchain pilot

This is an additive development and CI toolchain for Darwinian Worker. It does
not replace the release artifact or grant publishing authority.

## What is pinned

- `flake.lock` fixes one Nixpkgs revision
  (`774debe7a0d1b496e35677ad955a1011c6ff74f3`) for Linux and macOS tools.
- Bun `1.2.21` uses fixed-output upstream archives. The hashes for
  `x86_64-linux`, `aarch64-darwin`, and `x86_64-darwin` were taken from
  [the Nixpkgs Bun 1.2.21 update](https://github.com/NixOS/nixpkgs/commit/dbd20ce06a4972c6c7d8d8db3fc7b2b23a48255a).
  The macOS arm64 derivation was built and its executable reported `1.2.21`.
  Linux and macOS runner builds must still pass in CI. Declaring Intel macOS
  support is not evidence of an Intel macOS execution.
- The pinned Nixpkgs revision supplies Node `24.21.0` with npm `11.19.0`,
  plus Git, jq, shellcheck, and curl. The existing v1.4.2 publisher used npm
  `11.16.0`; this pilot does not claim identical historical pack bytes.
- `bun.lock` remains the application dependency lock. `flake.lock` pins the
  surrounding toolchain. Both are committed and checked for unintended drift.

## Run locally

Install Nix through the team's approved host bootstrap. The command flags
enable the flake interface for this invocation without changing host settings:

```bash
nix --extra-experimental-features 'nix-command flakes' \
  flake check --no-update-lock-file -L
nix --extra-experimental-features 'nix-command flakes' \
  develop --no-update-lock-file .#default \
  --command bash scripts/ci-nix-toolchain.sh
```

On the macOS machine used for this pilot, Nix 2.31.2 initially could not
validate the GitHub TLS issuer. Setting
`NIX_SSL_CERT_FILE=/etc/ssl/cert.pem` for those commands used the system CA
bundle and resolved the error. This is a host-specific certificate repair, not
permission to disable TLS verification or a setting to impose on Linux CI.

The script prints actual executable paths, checks exact versions, installs
`bun.lock` dependencies with `--frozen-lockfile`, and runs typecheck, focused
release contracts, the fresh full test gate, and release-readiness test mode.
It gives `bun link` isolated temporary global registration and binary
directories for the CLI parity test, and verifies both links there instead of
touching an ambient user-global `darwinian` link or relying on its `PATH`.
It then refuses changes to either lock.
`nix flake check` builds checks for the current system, not every declared
platform. Hosted CI independently exercises Linux and macOS.

## Boundaries and upgrades

The new `nix-toolchain` CI matrix is unprivileged and runs beside the existing
canonical jobs. It has no npm token, OIDC permission, cache-signing key, or
`darwinian-npm-publish` access. Nix store outputs and shared caches must not
contain credentials. A green development shell is not a sandboxed application
build and does not certify a release.

Update Nixpkgs, Bun, Node, or npm in reviewed, scoped changes. Regenerate and
inspect the real lock, build the relevant native checks, run fresh Linux/macOS
tests, and record any package-member or behavior difference. Artifact
construction under Nix is a later experiment: qualify one produced tar and
publish only those exact bytes through the existing protected release path
after independent review. Do not retag or republish `darwinian@1.4.2`.

## Additive source-tar experiment

`nix build --no-link --no-update-lock-file .#workerArtifact` is available
only as a no-publish experiment. It selects the files in the npm package
allowlist, requires a clean Git commit for the embedded build identity, and
uses pinned Node/npm to run `npm pack` with `NPM_CONFIG_OFFLINE=true`.
It does not install application dependencies in the derivation or convert
`bun.lock` into a second lockfile.

The unprivileged Ubuntu CI job runs the existing artifact qualifier and safe
installed smoke against that one tar, then retains tar, npm pack metadata,
digest, and smoke evidence for 14 days as
`nix-worker-artifact-experiment`. A dependent macOS job downloads the exact
tar, checks its SHA-256 and source commit, requalifies it, and runs the same
safe installed smoke. This tests the Nix-produced artifact on two systems,
but the experiment is not the published 1.4.2 tar, and no CI step can promote
it to npm. A future release may adopt this output only after reviewed
cross-platform evidence and an explicit change to the protected publisher.
