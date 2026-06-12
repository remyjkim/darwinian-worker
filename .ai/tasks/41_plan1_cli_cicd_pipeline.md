# ABOUTME: Implementation plan for darwinian-harness CLI CI/CD pipeline
# ABOUTME: PR validation + tag-triggered npm publish, modeled on the services-repo Cloudflare manual

# Task 41 — CLI CI/CD Pipeline (Plan 1)

**Status**: Ready for implementation
**Created**: 2026-06-11
**Updated**: 2026-06-12
**Priority**: High (PR #12 currently has no automated gate; npm publishes have been ad-hoc)
**Estimated Effort**: 0.5–1 day to land both workflows; 0.5 day to verify with a real release
**Dependencies**: none functional (additive to existing docs CI)
**References**: [/Users/pureicis/dev/darwinian-harness-services/.ai/analyses/39_cloudflare-github-cicd-manual.md, .github/workflows/docs-deploy-production.yml, .github/workflows/docs-pr-preview.yml, .github/workflows/docs-pr-cleanup.yml, scripts/verify-release-readiness.ts, package.json, /Users/pureicis/dev/darwinian-harness-services/.github/workflows/pr-preview.yml, /Users/pureicis/dev/darwinian-harness-services/.github/workflows/deploy-production.yml, knowledges/04_homebrew-release-checklist.md, knowledges/05_npm-publishing-analysis-and-manual.md]

---

## 1. Objective

Ship two GitHub Actions workflows that bring the `darwinian-harness` CLI under automated gating and tie the npm publish step to a tag-driven, reviewer-gated release pipeline:

1. **`ci.yml`** — PR + push-to-main validation. Required check on `main`.
2. **`release.yml`** — tag-triggered (`v*`) or `workflow_dispatch` npm publish, gated by a GitHub Environment with a required reviewer.

The shape is borrowed from the services-repo Cloudflare manual (PR validate → environment-gated production deploy). The deployment substrate is replaced: Cloudflare Pages/Workers → npm registry. The transferable pieces are PR validation, concurrency controls, token isolation, and approval gates.

Result after rollout: every PR runs the full quality gate before it can merge; every `v*` tag publishes after a human approval that the same gate still passes on the tagged commit.

---

## 2. Success Criteria

- [ ] Every PR against `main` runs `bun test`, `bun run typecheck`, and `bun run verify:release` automatically.
- [ ] `ci.yml` is configured as a required status check in branch protection on `main`.
- [ ] `ci.yml` is not event-level path-filtered while required, so docs-only PRs still complete a green required check instead of leaving branch protection stuck on a pending check.
- [ ] Pushing a `v*` tag triggers `release.yml`. Publish happens only after a reviewer approves the `npm-publish` GitHub Environment.
- [ ] `workflow_dispatch` is available on `release.yml` as an escape hatch for off-tag emergency publishes (gated by the same approval when `dry_run` is false).
- [ ] `workflow_dispatch` with `dry_run: true` runs validation only and does not enter the protected `npm-publish` environment.
- [ ] `NPM_TOKEN` lives inside the `npm-publish` environment, not as a repo-wide secret. PR workflows cannot read it.
- [ ] After publish, `release.yml` cuts a GitHub Release with auto-generated notes plus an optional override from the tag's annotation message.
- [ ] Existing docs workflows continue to function unchanged.
- [ ] The plan ships with a published-package verification step in `release.yml` that smoke-tests `npm install -g <package>@<version>` on Linux and macOS.

---

## 3. Approach

### 3.1 What we keep from the services manual

The manual's transferable principles:

| Principle | How it lands in the CLI pipeline |
|---|---|
| PR validation precedes any deploy | `ci.yml` runs unit tests, typecheck, and `verify:release` on every PR. |
| Production approval gate via GitHub Environment | `release.yml`'s publish job runs inside the `npm-publish` environment; required reviewer. |
| Token isolation between non-prod and prod | `NPM_TOKEN` only inside `npm-publish` env. PRs from forks cannot access it (default GitHub behavior). |
| Concurrency keys to avoid stomping | `ci.yml` uses `concurrency: pr-${{ github.event.pull_request.number || github.sha }}`; `release.yml` uses `concurrency: release-${{ github.ref }}`. |
| Required status checks must complete | `ci.yml` stays unfiltered while it is branch-protection-required. Docs-only cost optimization can be revisited later with an internal no-op step that still reports success. |
| Per-PR feedback | `ci.yml` posts a comment summarizing the gate result. (Optional; deferable to v1.1.) |
| Pinned action versions | All `uses:` lines pin major versions; `oven-sh/setup-bun@v2` is the project's existing standard. |

### 3.2 What we discard

The manual is heavily Cloudflare-specific. These pieces have no analog and should not be ported:

- Wrangler-based deployments
- Cloudflare API tokens, account IDs, Pages project variables
- Three-tier environment model (preview/staging/production) — the CLI has one production target (npm)
- PR preview deployments (a CLI doesn't deploy per PR)
- Smoke tests against deployed URLs (replaced by `npm install` smoke against the published package)

### 3.3 What's CLI-specific that the manual doesn't cover

- **npm authentication.** `NPM_TOKEN` with publish rights to `darwinian-harness` and (optionally) `drwn-catalog-schema` consumer awareness.
- **Tag conventions.** `vMAJOR.MINOR.PATCH` matches the current `0.2.1` release pattern.
- **Package-content verification.** `verify-release-readiness.ts` already runs `npm pack --dry-run --json` and validates forbidden/required files. Reuse, don't reinvent.
- **Bun runtime in published artifact.** Consumers must have Bun installed (`cli/index.ts` uses `#!/usr/bin/env bun`). Release smoke installs Bun + `npm install -g darwinian-harness@<v>` and runs `drwn --version`.
- **Schema-package coupling.** `drwn-catalog-schema` is a hard dependency. Verify the declared dependency spec still resolves on npm before publishing.

### 3.4 Locked design decisions

These were the four open questions from the brainstorm; leans are now locked:

1. **Trigger model for `release.yml`:** tag-push (`v*`) **and** `workflow_dispatch`. Tag-push is canonical; dispatch is an escape hatch when a tag is missing or got applied to the wrong commit.
2. **OS matrix:** PR CI runs on `ubuntu-latest` only (fast, matches the test substrate). Release smoke job runs `ubuntu-latest` + `macos-latest` after publish to catch macOS-specific install surprises before users hit them.
3. **Release notes:** auto-generated from commits since the previous tag via `gh release create --generate-notes`. If the tag carries an annotation (`git tag -a v0.3.0 -m "..."`), the full annotation message is prepended to the auto-generated section.
4. **Schema-package coupling:** `verify-release-readiness.ts` gains a check that the declared `drwn-catalog-schema` dependency spec resolves on the public npm registry. Local-link development loops still pass; the check reports a non-failing detail when the spec is `workspace:`, `file:`, or `link:`.

---

## 4. Implementation Plan

### 4.1 Phase 1 — `ci.yml` (PR + push-to-main validation)

**File**: `.github/workflows/ci.yml` (new)

**Triggers**:

- `pull_request` against `main`, types: `opened`, `synchronize`, `reopened`, `ready_for_review`
- `push` to `main` (so the gate runs on direct pushes / merge commits as the baseline of "what's on main")

**Path filters**: none.

Do not put `paths`, `paths-ignore`, or commit-message skip behavior on `ci.yml` while `Validate` is a required branch-protection check. GitHub leaves checks pending when a required workflow is skipped by path filtering, which would make docs-only PRs impossible to merge. The docs workflows can remain path-filtered because they are not the required CLI gate.

**Concurrency**:

```yaml
concurrency:
  group: ci-${{ github.event.pull_request.number || github.sha }}
  cancel-in-progress: true
```

**Jobs**:

```yaml
permissions:
  contents: read

jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    timeout-minutes: 20

    env:
      BUN_VERSION: '1.2.21'

    steps:
      - uses: actions/checkout@v4
        with:
          submodules: false

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Unit + integration tests
        run: bun test

      - name: Release-readiness gate
        run: bun run verify:release
```

**Required check setup** (after first successful run):

- Repo Settings → Branches → `main` → Add rule:
  - Require status checks to pass before merging
  - Require branches to be up to date before merging
  - Status checks: `Validate` (from `ci.yml`)
  - Require pull request reviews before merging: optional; one approving review recommended
  - Do not allow bypassing the above settings

**Acceptance**:
- [ ] PR with a passing change shows green `Validate` check.
- [ ] PR with a deliberately broken test (e.g. `expect(true).toBe(false)`) shows red `Validate` check and blocks merge.
- [ ] Docs-only PR still completes the required `Validate` check successfully.
- [ ] Push to `main` triggers `Validate`.

---

### 4.2 Phase 2 — `release.yml` (tag-triggered npm publish)

**File**: `.github/workflows/release.yml` (new)

**Triggers**:

```yaml
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to publish (must match package.json). For tag-push, leave blank.'
        required: false
        type: string
      dry_run:
        description: 'Run all checks but skip npm publish.'
        required: false
        default: false
        type: boolean
```

**Concurrency**:

```yaml
concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false
```

**Permissions** (workflow default; jobs override where needed):

```yaml
permissions:
  contents: read
```

**Jobs**:

```yaml
jobs:
  validate:
    name: Validate release commit
    runs-on: ubuntu-latest
    timeout-minutes: 20
    outputs:
      version: ${{ steps.read_version.outputs.version }}
      tag: ${{ steps.read_version.outputs.tag }}

    env:
      BUN_VERSION: '1.2.21'

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # need full history for tag annotation + auto-notes

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Read package version
        id: read_version
        run: |
          PKG_VERSION="$(bun -e 'console.log(require("./package.json").version)')"
          if [ "${{ github.event_name }}" = "push" ]; then
            TAG="${GITHUB_REF#refs/tags/}"
            EXPECTED="v${PKG_VERSION}"
            if [ "$TAG" != "$EXPECTED" ]; then
              echo "Tag $TAG does not match package.json version ($EXPECTED)" >&2
              exit 1
            fi
          else
            TAG="v${PKG_VERSION}"
            INPUT_VERSION="${{ inputs.version }}"
            if [ -n "$INPUT_VERSION" ] && [ "$INPUT_VERSION" != "$PKG_VERSION" ]; then
              echo "Input version $INPUT_VERSION does not match package.json ($PKG_VERSION)" >&2
              exit 1
            fi
          fi
          echo "version=$PKG_VERSION" >> "$GITHUB_OUTPUT"
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"

      - name: Typecheck
        run: bun run typecheck

      - name: Unit + integration tests
        run: bun test

      - name: Release-readiness gate
        run: bun run verify:release

  publish:
    name: Publish to npm
    needs: [validate]
    if: ${{ github.event_name == 'push' || inputs.dry_run == false }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
      id-token: write   # reserved for npm provenance; harmless until publish uses --provenance
    environment:
      name: npm-publish
      url: https://www.npmjs.com/package/darwinian-harness

    env:
      BUN_VERSION: '1.2.21'
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Re-run release-readiness gate
        run: bun run verify:release

      - name: Verify package not already published
        run: |
          VERSION="${{ needs.validate.outputs.version }}"
          if npm view "darwinian-harness@${VERSION}" version >/dev/null 2>&1; then
            echo "darwinian-harness@${VERSION} already exists on npm" >&2
            exit 1
          fi

      - name: Publish to npm
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Smoke install (ubuntu)
        run: |
          npm install -g "darwinian-harness@${{ needs.validate.outputs.version }}"
          drwn --version
          # Expect output equals the published version. Fail otherwise.
          test "$(drwn --version | tr -d '[:space:]')" = "${{ needs.validate.outputs.version }}"

  dry_run_complete:
    name: Dry run complete
    needs: [validate]
    if: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run == true }}
    runs-on: ubuntu-latest
    timeout-minutes: 2
    permissions:
      contents: read

    steps:
      - name: Summarize dry run
        run: |
          {
            echo "## release dry run complete"
            echo ""
            echo "- Version: ${{ needs.validate.outputs.version }}"
            echo "- Publish skipped by workflow_dispatch dry_run=true"
          } >> "$GITHUB_STEP_SUMMARY"

  smoke_macos:
    name: Smoke install (macos)
    needs: [validate, publish]
    if: ${{ github.event_name == 'push' || inputs.dry_run == false }}
    runs-on: macos-latest
    timeout-minutes: 15
    permissions:
      contents: read

    steps:
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.2.21'

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Smoke install (macos)
        run: |
          npm install -g "darwinian-harness@${{ needs.validate.outputs.version }}"
          drwn --version
          test "$(drwn --version | tr -d '[:space:]')" = "${{ needs.validate.outputs.version }}"

  github_release:
    name: GitHub Release
    needs: [validate, publish, smoke_macos]
    if: ${{ github.event_name == 'push' }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          TAG="${{ needs.validate.outputs.tag }}"
          ANNOTATION=""
          if [ "$(git cat-file -t "$TAG")" = "tag" ]; then
            ANNOTATION="$(git tag -l --format='%(contents)' "$TAG")"
          fi
          if [ -n "$ANNOTATION" ]; then
            gh release create "$TAG" \
              --title "$TAG" \
              --notes "$ANNOTATION" \
              --generate-notes \
              --verify-tag
          else
            gh release create "$TAG" \
              --title "$TAG" \
              --generate-notes \
              --verify-tag
          fi
```

**Acceptance**:
- [ ] Push tag `v0.2.2-dryrun` on a test branch then delete; verify the workflow refuses because `package.json` version does not match. (Skip if not worth the cycle; the version-match check is straightforward.)
- [ ] `workflow_dispatch` with `dry_run: true` runs validate + verify-release, does not enter the `npm-publish` environment, and does not publish.
- [ ] Real `v0.2.2` tag triggers the full pipeline: validate → approval → publish → smoke (ubuntu + macos) → GitHub Release.
- [ ] `npm view darwinian-harness@<v>` returns the new version after publish.
- [ ] The created GitHub Release contains both the tag annotation (if any) and auto-generated commit notes.

---

### 4.3 Phase 3 — Schema-package coupling check (soft)

**File**: `scripts/verify-release-readiness.ts` (modify)

Add a check that the `drwn-catalog-schema` dependency resolves to a version that exists on the public npm registry.

**Pseudo-code**:

```ts
async function verifySchemaPackageReachable(): Promise<CheckResult> {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const dep = pkg.dependencies?.["drwn-catalog-schema"];
  if (!dep) {
    return { name: "schema package coupling", ok: true };
  }
  if (dep.startsWith("file:") || dep.startsWith("link:") || dep.startsWith("workspace:")) {
    return {
      name: "schema package coupling",
      ok: true,
      details: `drwn-catalog-schema resolves locally (${dep}); skipping registry check`,
    };
  }
  const proc = Bun.spawn(["npm", "view", `drwn-catalog-schema@${dep}`, "version"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return {
    name: "schema package coupling",
    ok: exitCode === 0,
    details: exitCode === 0
      ? `drwn-catalog-schema@${dep} resolves to ${stdout.trim()}`
      : `drwn-catalog-schema@${dep} not resolvable on npm: ${stderr.trim()}`,
  };
}
```

Register it in `main()` with the other release checks:

```ts
checks.push(await verifySchemaPackageReachable());
```

Treat local link specs as a passing detail. Fail the gate only when the declared dependency is a registry spec and npm cannot resolve it.

**Acceptance**:
- [ ] `bun run verify:release` includes a `schema package coupling` line.
- [ ] Manually editing `package.json` to `"drwn-catalog-schema": "^999.0.0"` and running the gate fails the new check.

---

### 4.4 Phase 4 — Secrets, environments, and repo settings

**GitHub Environment: `npm-publish`**

Create under Repo Settings → Environments:

| Field | Value |
|---|---|
| Name | `npm-publish` |
| Required reviewers | At least one (the repo owner) |
| Wait timer | 0 minutes |
| Deployment branches/tags | Selected branch `main` and selected tags `v*` |
| Secrets | `NPM_TOKEN` (granular access token, scope: `darwinian-harness` package, "Publish + Read" permission) |
| Variables | none required |

**Branch protection on `main`**

| Setting | Value |
|---|---|
| Require status checks | On |
| Required checks | `Validate` (from `ci.yml`) |
| Require branches to be up to date | On |
| Require pull request before merging | On (1 approval) |
| Allow administrators to bypass | Off (recommended) |
| Restrict who can push to matching branches | Optional |

**npm token provisioning**

- Use a **granular token**, not a classic one. npm dashboard → Access Tokens → "Granular Access Token."
- Scope: only `darwinian-harness` package (not `drwn-catalog-schema` — that's published from the services repo).
- Permission: Publish + Read.
- IP allowlist: leave default (no restriction); GitHub Actions runner IPs rotate.
- Expiry: 365 days. Calendar a rotation reminder.

**Repository default permissions**

- Settings → Actions → General → Workflow permissions → "Read repository contents and packages permissions" (default). Per-workflow `permissions:` blocks elevate from there.

**Acceptance**:
- [ ] `NPM_TOKEN` is not visible to PR workflows. (Verify by adding a temporary `env: TOKEN_LEN: ${{ secrets.NPM_TOKEN }}` to `ci.yml` and confirming it resolves to empty in PR runs — then remove the debug line.)
- [ ] `release.yml` publish job pauses on the required-reviewer screen before running.
- [ ] Direct push to `main` without a passing `Validate` is blocked by branch protection.

---

### 4.5 Phase 5 — Release flow runbook (for the README / docs)

**File**: `docs/cli-quickref.md` or a new `docs/release-process.md` (one paragraph + checklist)

```markdown
## Releasing a new CLI version

1. On `main` with a clean working tree:
   - Bump `version` in `package.json` (e.g. `0.2.1` → `0.2.2`).
   - Update `CHANGELOG.md` if present.
   - Commit: `[release] v0.2.2`.
2. Push the commit.
3. After CI is green on `main`:
   - `git tag -a v0.2.2 -m "<one-line summary>"`
   - `git push origin v0.2.2`
4. Approve the `npm-publish` environment in GitHub Actions.
5. After publish completes:
   - Verify `npm view darwinian-harness@0.2.2 version` returns `0.2.2`.
   - Verify the GitHub Release page contains the tag annotation and auto-notes.
```

**Acceptance**:
- [ ] First real release uses this runbook end-to-end without ad-hoc deviations.

---

## 5. Testing Strategy

- **`ci.yml`:** open a small no-op PR after merge of this workflow; verify green. Then open a deliberately-broken PR (failed test); verify red and that merge is blocked.
- **`release.yml` validation path:** trigger `workflow_dispatch` with `dry_run: true` from `main`. Confirms the validate + verify path runs end-to-end without publishing or requiring `npm-publish` environment approval.
- **`release.yml` real publish:** the first real release is `v0.2.2` or whatever the next bump is. Run the runbook in §4.5 step-by-step. If anything surprises, file follow-ups before bumping again.
- **Token isolation:** the success-criteria item that NPM_TOKEN cannot be read in PR workflows is testable with a temporary echo step; do this once at setup time, then remove.

---

## 6. Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `bun test` is flaky in CI runners | Medium | Medium | Pin Bun version (`1.2.21`); timeout-minutes 20; retry policy: NONE (treat flakes as bugs). The `cli-help-shape.test.ts` timeout was already bumped to 15s in Task 44 for this reason. |
| First npm publish from CI emits wrong files | Low | High | `verify:release` already runs `npm pack --dry-run --json` and validates contents. Required to pass both at validate and publish steps. |
| Tag pushed without bumping `package.json` | Low | High | `validate` job fails fast if `git tag` and `package.json.version` don't match. |
| Reviewer not available for emergency publish | Low | Medium | The `npm-publish` reviewer pool should be more than one person. Document who in `docs/release-process.md`. |
| Schema package coupling check causes false alarms during local-link development | Low | Low | Check reports a passing detail when the dep spec is `file:`/`link:`/`workspace:`. |
| npm token expires silently | Low | High | 365-day expiry; calendar reminder. Failed publish will be loud; the runbook step "approve and watch" surfaces it. |
| GitHub Actions outage at release time | Low | Low | Manual fallback: run `verify:release` locally, then `npm publish` locally with the user's own token. Document in §4.5. |

---

## 7. Out of Scope (explicit non-goals)

- **Homebrew tap automation.** Today's manual checklist (`knowledges/04_homebrew-release-checklist.md`) stays manual. Automate when there's demand signal.
- **Cross-platform CLI matrix beyond the smoke job.** Full PR runs on macOS would double CI minutes; not worth it until a macOS-only regression actually slips through.
- **PR preview deployments.** A CLI doesn't have a deployment surface; the manual's preview model has no analog here.
- **Auto-version bumping or changelog generation.** A human bumps `package.json` and writes the changelog. Auto-bumping is convenient but reduces auditability for a tool that other tools depend on.
- **Provenance attestation (`npm publish --provenance`).** Worth adding after this lands; the release job reserves `id-token: write`, but the publish flag and registry-side validation stay deferred to a separate small task.
- **Docs version sync.** The docs site is decoupled today and that's working; don't entangle.

---

## 8. Migration / Rollout

1. **Day 1:** Land `ci.yml` (Phase 1). Open a deliberately-broken test PR to prove the gate. Configure branch protection.
2. **Day 1 (later):** Land `release.yml` (Phase 2). Create the `npm-publish` environment and add `NPM_TOKEN`. Run `workflow_dispatch` with `dry_run: true` to verify the validate path.
3. **Day 2:** Land the `verify-release-readiness.ts` schema reachability check (Phase 3). Push docs runbook (Phase 5).
4. **Day 2 (release):** Cut `v0.2.2` (or current next-bump version) via the runbook. Watch end-to-end.
5. **Day 3+:** Add provenance + Homebrew automation as separate tasks if signal warrants.

Rollback: each workflow is independently revertable. If `release.yml` misbehaves on the first real release, fall back to local `npm publish` (the existing path). `ci.yml` is non-mutating — worst case is removing the required-check requirement in branch protection.

---

## 9. Open Questions

(None blocking implementation; surfacing for awareness.)

1. **GitHub Release notes format.** Auto-notes group by PR title. If the repo's PR-title hygiene is inconsistent, the notes will read poorly. Optional follow-up: define PR-title prefix conventions and lint them in `ci.yml`.
2. **Token rotation cadence.** 365 days is conservative. If npm dashboard shows the token unused for 90+ days, that's a separate signal worth investigating (someone bypassed the pipeline).
3. **Schema package version drift.** If `drwn-catalog-schema` evolves quickly and the CLI's range goes stale, the registry reachability check passes but the consumer experience can still suffer. Consider a `dependabot.yml` for npm in a follow-up.

---

## 10. Notes

- Memory: no AI attribution in any committed file. Workflows reference no model identifiers.
- Commit style for the rollout: `[ci] add CLI validation workflow` / `[ci] add npm release workflow` / `[chore] add schema reachability check to release gate` — matches recent project history (`[fix:ci]`, `[chore:ci]`, `[doc:repo]`).
- If a second drafting iteration is needed after review, this file moves to `41_archive/` and the new plan becomes `41_plan2_…`.
