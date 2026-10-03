# I448 Worker Release Recovery and Nix Implementation Plan

> **For Codex:** Follow the approved I448 architecture, execute one task at a time with RED → GREEN tests, review checkpoints, and no subagent delegation. Keep recovery and Nix changes in separate branches/PRs.

**Goal:** Obtain policy-conformant hosted verification of the immutable `darwinian@1.4.2` candidate, then introduce a pinned Nix toolchain and prove CI/artifact parity without changing the existing publisher's authority.

**Architecture:** A new reviewed-main, read-only, separately protected recovery workflow verifies frozen release provenance and directly downloaded registry bytes on Ubuntu and macOS. Nix then pins tools in an additive, unprivileged Linux/macOS CI pilot; only after parity does a separate artifact experiment build one tar for the existing exact-byte publisher. `bun.lock` remains the JS dependency lock.

**Tech Stack:** GitHub Actions, Bun 1.2.21, TypeScript, npm registry, GitHub API, Nix flakes with committed `flake.lock`, Linux/macOS.

---

## Preconditions and non-negotiable boundaries

- Source is `origin/main` after PR #116, while `v1.4.2` remains at `430d04b04015d6f0ee1bc57d5374b80381697fc6`. Never move/recreate the tag, republish 1.4.2, or dispatch ordinary release publication again.
- Preserve `darwinian-npm-publish` as tag-only with the existing npm OIDC binding. The new environment `darwinian-release-verification` is a separate read-only approval plane; configure it only after reviewed workflow code merges.
- The previously failed canonical run is `37105684003`. The dry run is `37098969171` attempt 1, artifact `11265678076`, archive digest `sha256:c88bf04b0a709e5c9944e5bf305468b54198050a04b37da4aaf664ce19036a5f`. Re-read all external objects before dispatch.
- An absent registry `gitHead` does not stand alone as evidence. Accept it only after all other provenance, metadata, directly downloaded tar SHA-256, package manifest, and embedded build identity checks pass. Reject a present-but-wrong `gitHead`.
- An external approval or interactive npm-2FA step is not simulated or silently bypassed. Record the exact run and require human action at that gate.
- The repository `AGENTS.md` names `.ai/rules/` paths absent at this head. Report the drift and do not silently infer issue status changes. The generated issue ID is I448.

## Task 1: Prove the new recovery workflow has no mutation authority

**Files:**
- Create: `test/scripts-release-published-verification-workflow.test.ts`
- Create: `.github/workflows/release-verify-published.yml`

1. Write a Bun test patterned on `test/scripts-release-recovery-workflow.test.ts`. Require `workflow_dispatch` on current `main`, exact `v1.4.2` and failed-run inputs, a distinct `darwinian-release-verification` environment, `permissions: contents: read` and `actions: read`, Ubuntu and macOS jobs, exact artifact download/requalification, direct registry tar download, and installed smoke. Reject `id-token: write`, `NODE_AUTH_TOKEN`, `NPM_TOKEN`, `npm publish`, `npm dist-tag`, `npm pack`, `git tag`, `git push`, `gh release create`, and `contents: write`.
2. Run `bun test test/scripts-release-published-verification-workflow.test.ts`; expect RED because the workflow does not exist.
3. Add only the workflow skeleton with triggers, least-privilege jobs and guarded authorization inputs. Run the focused test; expect GREEN for structural authority checks but keep behavioral checks RED until Tasks 2–3.
4. Commit the test and skeleton under the repository's `[release]` prefix.

## Task 2: Bind recovery to one failed run and one frozen artifact

**Files:**
- Modify: `.github/workflows/release-verify-published.yml`
- Modify: `test/scripts-release-published-verification-workflow.test.ts`
- Test existing: `test/scripts-release-provenance.test.ts`

1. Add negative structural cases for wrong ref, moving/replacing the tag, different failed run/head SHA, missing dry-run artifact, expired artifact, archive digest mismatch, and malformed/extra-key authorization. Reuse `parseRecoveryAuthorizationReceipt` and `verifyRecoveryReleaseProvenance` from `scripts/release/provenance.ts`; add a focused pure validator test only if a contract gap is discovered. Run RED.
2. Implement a main-ref dispatch that checks out the reviewed workflow code, fetches the annotated frozen tag without resetting `main`, validates the closed recovery authorization, queries the exact failed run and dry run/attempt/jobs/artifact, downloads its archive by ID, hashes it before extraction, requalifies its retained tar and receipt, and compares the tag annotation/source SHA to every artifact identity. The recovery provenance helper intentionally permits `main` to have advanced while binding the original candidate to the tag.
3. Run the focused workflow and provenance tests GREEN. Confirm the workflow never consumes a user-selected artifact by name or an unvalidated URL. Commit this one provenance slice.

## Task 3: Verify registry consistency and both installed platforms

**Files:**
- Modify: `.github/workflows/release-verify-published.yml`
- Modify: `test/scripts-release-published-verification-workflow.test.ts`
- Modify, only if required by a failing test: `scripts/release/artifact-contract.ts`, `test/scripts-release-artifact-contract.test.ts`

1. Write RED cases for absent `gitHead` plus byte match, present wrong `gitHead`, SHA-1/integrity mismatch, wrong canonical tar URL, tar SHA-256 mismatch, and an npm metadata-visible/tar-unavailable propagation race. Existing `verify-registry` already permits absent `gitHead` without `--require-git-head`; retain strict rejection when a present value disagrees.
2. Implement bounded condition-based retry of **both** metadata and direct canonical `https://registry.npmjs.org/darwinian/-/darwinian-1.4.2.tgz` fetch, with fresh requests and an explicit deadline. Hash downloaded bytes and requalify against the retained receipt and packed build identity. Do not use a second fresh-cache `npm pack` as the availability check.
3. Run `smoke-artifact` against the downloaded tar on Ubuntu. Repeat exact artifact/provenance/registry-byte checks and installed smoke in the dependent macOS job. Record candidate and latest dist-tag readbacks without changing either; upload a redacted receipt only after both jobs pass.
4. Run focused tests, `bun run typecheck`, `bun run test:gate`, `bun run verify:release`, and `git diff --check`. Commit the behavior and tests. Review the resulting workflow's permission block and every command for mutation capability.

## Task 4: Review and run protected v1.4.2 recovery

**Files:**
- Modify: `docs/release-process.md`
- Modify: `docs/maintainers/publishing.md`
- Create: `.ai/tasks/cl0448_worker_release_recovery_completion.md` after evidence exists

1. Document why the old tagged recovery cannot be edited, the separate reviewed-main verifier, exact identity conditions, missing-`gitHead` treatment, and explicit lack of registry writes. Update the operation steps, authorization receipt, and stop conditions. Keep the ordinary v1.4.2 tag workflow unchanged.
2. Open a PR from the recovery branch with source SHA and `Testing & CI evidence`. Wait for hosted CI and independent review; merge only the reviewed exact head. Do not create the verification environment before the policy is reviewed.
3. Configure and read back `darwinian-release-verification` with sole required reviewer `mind001-cl`, self-review prevention, no admin bypass, and a main-only deployment policy. Do not add secrets, variables carrying credentials, or OIDC trust. Compare the readback with the reviewed policy.
4. Dispatch the new workflow on current `main` with an authorization JSON naming `v1.4.2`, failed run `37105684003`, and action `verify_candidate`. Ask the user to approve only that exact protected run as `mind001-cl`. Verify Ubuntu/macOS jobs, retained receipt, registry identities, and unchanged `latest` independently. Any mismatch stops without a publication retry.
5. Only after green recovery, coordinate the separately approved interactive npm-2FA `latest` promotion. Before and after, verify `darwinian@1.4.2` tar identities, `i336-candidate`, `latest`, and an installed smoke. Record the command/operator/OTP boundary without exposing credentials. No automatic `npm dist-tag` action is included in CI.

## Task 5: Pin the Nix tooling pilot without changing the publisher

**Files (separate branch/PR from the merged recovery head):**
- Create: `flake.nix`
- Create: `flake.lock`
- Create: `scripts/ci-nix-toolchain.sh`
- Modify: `.github/workflows/ci.yml`
- Create: `test/scripts-ci-nix-toolchain.test.ts` or an equivalent shell contract test

1. Inspect available pinned Nixpkgs revisions for Bun `1.2.21` on the actual Linux/macOS runner architectures, Node `24`, npm compatibility, Git, jq, and shellcheck. If exact Bun is unavailable, use an audited fixed-output source with explicit architecture-specific hashes, not an unpinned installer or silent runtime substitution. Record the chosen revision and tradeoff in the PR.
2. Write a RED contract test for a committed lock, no lock update in CI, exact version checks, and no secret/cache-signing/publishing permission in the new job. Run it.
3. Add a thin flake with `devShells` for both supported systems and a simple `checks` target. Generate and inspect the real `flake.lock`, commit it, and verify `nix flake check --no-update-lock-file -L` on supported systems. Keep `bun.lock`; inside the shell use `bun install --frozen-lockfile`.
4. Add `scripts/ci-nix-toolchain.sh` to print actual executable paths/versions, run typecheck, focused release tests, and fresh `test:gate`. Add an unprivileged additive Linux/macOS CI matrix job invoking the same script through `nix develop --no-update-lock-file`. Keep existing canonical jobs unchanged.
5. Verify no `flake.lock` diff after commands, Linux/macOS hosted parity, full existing CI, and no private inputs in the Nix store. Review and merge only after both systems pass.

## Task 6: Measure Nix artifact parity before switching the release source

**Files (separate reviewed PR after Task 5):**
- Create: `nix/worker-artifact.nix` only after the package-manager dependency strategy is proven
- Modify: `flake.nix`
- Modify: `.github/workflows/ci.yml` additively
- Modify: `docs/release-process.md`
- Test: `test/scripts-release-artifact-contract.test.ts` and new parity test

1. Write a RED test for package-member equivalence, explicit source commit injection into build identity, one tarball output, and recorded SHA-256. A Nix development shell is not itself a sandboxed application build.
2. Package declared source and locked JavaScript dependencies in a sandboxed Nix build. Fail if the build needs undeclared network or a credential. Produce one tar and feed it to existing `qualify-artifact`, `requalify-artifact`, and `smoke-artifact` checks. Compare the manifest and runtime behavior with the established npm-packed contract; exact bytes need to match **within** the new candidate path, not the historical 1.4.2 tar.
3. Retain this as an additive experiment until hosted Linux/macOS parity, performance, source/lock provenance, cache trust, and rollback are reviewed. Only then make the Nix-built tar the sole artifact consumed by a future version's protected publisher. Never alter the frozen 1.4.2 artifact.

## Completion criteria

- A green, separately approved, no-publish recovery run proves the exact 1.4.2 registry tar on Ubuntu and macOS; `latest` moves only with separately documented interactive 2FA and readback.
- A committed Nix lock provides exact supported tool versions and additive Linux/macOS CI parity without replacing `bun.lock` or granting write credentials.
- A measured Nix-built tar is retained and requalified through the existing artifact contract. Promotion into a future publisher remains a reviewed, explicit follow-on gate rather than an automatic side effect.
