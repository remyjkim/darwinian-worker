# I448: Worker release recovery and Nix CI target architecture

Status: Owner design, approved in conversation on 2026-10-03. The issue tracker is [I448](https://app.notion.com/p/3eef1fbef8c281b28586c09b6dd450c8). This document does not approve registry mutation or weaken the published release gate.

## Current state and failure

- `v1.4.2` is an immutable annotated tag at `430d04b04015d6f0ee1bc57d5374b80381697fc6`. Dry run [37098969171](https://github.com/remyjkim/darwinian-worker/actions/runs/37098969171) retained artifact `11265678076` with archive digest `sha256:c88bf04b0a709e5c9944e5bf305468b54198050a04b37da4aaf664ce19036a5f`.
- Protected publication [37105684003](https://github.com/remyjkim/darwinian-worker/actions/runs/37105684003) accepted the exact tar under `i336-candidate`. Its registry verification failed when `npm view` saw the metadata but a separate fresh-cache `npm pack` returned `ETARGET`. The hosted macOS smoke was skipped.
- The registry later served the exact tar SHA-256 `a3d692f2cb178976ba0d6dd1fc6186e4d07f577336a6e84b63e95cdc5e9a5b3f`, and a local macOS installed smoke passed. The hosted release remains red. `latest` is still `1.3.0`.
- The existing recovery workflow is loaded from `refs/tags/v1.4.2` and requires registry `gitHead`. npm did not expose `gitHead` for this tarball publication. Editing `main` cannot change that tagged workflow. Re-running publication is forbidden because the version exists.

## Recovery boundary

Add a new, read-only `workflow_dispatch` verifier on the reviewed `main` commit. It accepts only a closed authorization receipt for the exact `v1.4.2` tag and failed canonical run. The dispatch must select current `main`. It checks the release tag, dry-run run/attempt, artifact ID and archive digest, original receipt, packed build identity, failed release run, and candidate registry tag. Source code for validation may be from reviewed `main`, but the candidate bytes and source identity must come exclusively from the frozen tag and authorized artifact.

The verifier enters a **new** environment, `darwinian-release-verification`, protected by `mind001-cl`, self-review prevention, no admin bypass, and a main-only deployment rule. It has no OIDC identity, npm token, environment secret, write permission, publish command, dist-tag command, retag path, or GitHub Release path. The existing `darwinian-npm-publish` environment remains tag-only and unchanged. A fresh protected approval is required; the prior publication approval is not reused.

For npm metadata, a present `gitHead` must equal the source commit. An absent `gitHead` is acceptable **only** when the version, expected candidate tag, SHA-1, integrity, canonical tarball URL, directly downloaded tar SHA-256, package member manifest, and embedded build identity all match the authorized artifact. A contradictory `gitHead` or any missing/mismatched byte evidence fails closed. Poll the actual metadata **and tar download/verification condition**, using a bounded deadline and fresh requests; do not treat a successful metadata query as proof that another npm endpoint can fetch the tar.

Run installed-package smokes from the directly downloaded registry tar on Ubuntu and macOS. Retain a redacted verification receipt containing exact run/tag/artifact, byte identities, both OS results, candidate/latest readbacks, and approval run. The verifier never moves `latest`. Only after a green hosted recovery and independent readback may a separately approved interactive npm-2FA ceremony promote `latest`, followed by a readback and installed smoke.

## Nix adoption boundary

Nix changes are separate from the already-tagged release and cannot retroactively qualify it. Keep `bun.lock` as the JavaScript dependency lock and introduce a committed `flake.nix` and `flake.lock` for Linux/macOS tooling. The first pilot provides Bun `1.2.21`, Node `24`, npm compatible with the release job, Git, jq, shellcheck, and TypeScript through the frozen Bun install. Validate the exact Bun availability and platform support before selecting Nixpkgs or a fixed-output Bun source. Do not silently substitute a newer runtime.

An additive, unprivileged CI job runs the existing typecheck, focused release contracts, and full test gate inside the Nix development shell, with `--no-update-lock-file`. GitHub Actions remains the scheduler and approval plane. Tests that need a fresh external observation run outside cacheable derivations. Compare tool paths/versions and Linux/macOS results against the existing jobs; do not replace the canonical gate until parity is recorded.

Only after that pilot passes should an artifact-building Nix package be attempted. It must use explicit source selection, preserve the exact package-member contract, take the source commit as an explicit release input where needed, and output one retained tarball with measured digest. Publication still consumes that one qualified tar with the existing OIDC protected environment. A shared binary cache is a later trust decision, not a prerequisite; PR jobs have no signing or publication credentials.

## Acceptance and stop conditions

1. New recovery workflow proves the frozen provenance and registry bytes on Ubuntu and macOS, with a distinct approval, no publication authority, and a retained receipt. Negative tests reject mismatched source, artifact, tag, digest, unexpected `gitHead`, missing bytes, and extra authority.
2. `latest` changes only in the separate 2FA ceremony after green recovery; its readback and installed smoke are recorded. If recovery cannot be made policy-conformant, stop and request a patch roll-forward decision instead of bypassing the gate.
3. The Nix pilot pins exact tools and passes fresh Linux/macOS parity without lock churn or secrets in the store. A failed or unsupported Bun pin stops the pilot; it does not quietly change the runtime.
4. A later Nix artifact experiment preserves the package contract and exact-byte promotion. Keep the current tarball release path until measured parity, review, and rollback instructions exist.

The checkout's `AGENTS.md` references `.ai/rules/` files absent at this head. I448 is the tracker-generated ID; no issue status transition is inferred from this document.
