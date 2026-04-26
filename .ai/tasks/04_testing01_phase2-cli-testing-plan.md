# Phase 2 CLI Testing Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish a rigorous, release-ready testing program for the `agents` CLI and its compatibility surfaces so the project can be validated not only for current local usage, but also for future open-source distribution, fresh-user onboarding, cross-machine portability, and later Homebrew installation.

**Architecture:** This testing plan treats quality as layered verification rather than a single `bun test` gate. It covers static validation, unit and integration tests, command-surface parity, compatibility with the legacy wrapper, local environment correctness, and future release/readiness checks for package publishing and Homebrew distribution. The plan assumes the current CLI and sync architecture already exist and focuses on hardening the *testing strategy and tooling* around them.

**Tech Stack:** Bun, TypeScript, Bun test, Clipanion, shell-based smoke checks, fixture-driven filesystem testing, package metadata validation

---

### Task 1: Create a release-oriented testing inventory and risk matrix

**Files:**
- Create: `.ai/analyses/04_phase2-cli-testing-inventory.md`
- Modify: `.ai/tasks/04_testing01_phase2-cli-testing-plan.md`

**Step 1: Write the inventory checklist**

Document the test surface in categories:

- core modules
- command surfaces
- compatibility wrapper
- local environment integration
- package/release validation
- future Brew/install validation

The inventory must explicitly map:

- what is already covered today
- what is partially covered
- what is missing
- what is intentionally deferred

It must also include a risk matrix with severity and likelihood for gaps such as:

- stale symlink handling regressions
- CLI/reporting regressions
- publish/install breakage
- machine-specific path regressions
- drift detection false negatives

**Step 2: Verify the inventory is grounded in current repo state**

Run:

```bash
find test -maxdepth 2 -type f | sort
find cli -maxdepth 3 -type f | sort
```

Expected:

- all current tests and source modules are reflected in the inventory

**Step 3: Save the inventory doc**

The document should be crisp and operator-readable, not an essay.

**Step 4: Re-read for completeness**

Run:

```bash
rg -n "covered|missing|deferred|risk" .ai/analyses/04_phase2-cli-testing-inventory.md
```

Expected:

- all key sections present

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 2: Harden static verification into a single explicit quality gate

**Files:**
- Modify: `package.json`
- Create: `scripts/verify-release-readiness.ts` or `scripts/verify-release-readiness.sh`
- Test: `test/quality-gate.test.ts`

**Step 1: Write the failing test**

Write a test that expects a single release-readiness verification entrypoint to exist and complete successfully in a healthy repo state.

Example shape:

```ts
test("quality gate script exists and returns exit 0", async () => {
  const proc = Bun.spawn(["bun", "run", "verify:release"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(await proc.exited).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test test/quality-gate.test.ts
```

Expected:

- FAIL because the script and package wiring do not exist yet

**Step 3: Write minimal implementation**

Add a `verify:release` script to `package.json` that runs:

- `bun test`
- `bun run typecheck`
- hardcoded-path scan over the intended source files
- package metadata verification

The verification script should:

- fail fast on hard failures
- print a concise checklist of completed gates
- avoid mutating the repo

Prefer a script file over a long inline shell command so behavior is reviewable and portable.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/quality-gate.test.ts
bun run verify:release
```

Expected:

- PASS

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 3: Add command-output contract tests for human vs JSON modes

**Files:**
- Create: `test/commands-output-contracts.test.ts`

**Step 1: Write the failing tests**

Cover every implemented public command:

- `agents sync`
- `agents skills list`
- `agents skills sync`
- `agents mcp list`
- `agents mcp sync`
- `agents status`
- `agents doctor`

For each command, test:

- human output is non-empty and shape-appropriate
- `--json` output is valid JSON
- JSON output is structurally consistent and parseable
- human output does not accidentally include raw stack traces or object dumps in healthy flows

Use temp fixtures via the existing helper pattern.

**Step 2: Run test to verify it fails**

Run:

```bash
bun test test/commands-output-contracts.test.ts
```

Expected:

- FAIL until the contract coverage is fully implemented

**Step 3: Write minimal implementation**

Add the test coverage only. Do not change command behavior unless the tests reveal a real inconsistency.

If inconsistencies are found:

- fix only the inconsistency needed to satisfy the contract
- avoid redesigning output formats in this task

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/commands-output-contracts.test.ts
bun test
```

Expected:

- PASS with all output contracts enforced

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 4: Add command parity tests for repo-local vs global execution

**Files:**
- Create: `test/cli-parity.test.ts`

**Step 1: Write the failing tests**

Write parity tests comparing:

- `bun run agents -- <cmd>`
- `agents <cmd>`

for a representative subset:

- `--help`
- `status --json`
- `skills list --json`
- `mcp list --json`
- `doctor --json`

The test should compare:

- exit code
- parsed JSON output where applicable
- command availability

If direct global invocation is too brittle in isolated test runs, design the test to:

- skip cleanly when `agents` is unavailable
- or first run `bun link` as part of the setup flow

**Step 2: Run test to verify it fails or is skipped for the right reason**

Run:

```bash
bun test test/cli-parity.test.ts
```

Expected:

- either FAIL because the parity test is not wired yet
- or SKIP with an explicit reason until the link/setup is performed

**Step 3: Write minimal implementation**

Implement the parity harness.

The goal is not to test Clipanion internals; it is to prove that both supported execution modes behave the same for future users.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/cli-parity.test.ts
```

Expected:

- PASS

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 5: Add fresh-user and migration scenario tests

**Files:**
- Create: `test/scenarios-user-journeys.test.ts`

**Step 1: Write the failing tests**

Model real user journeys with temp fixtures:

#### Journey A: first-time user

- empty `~/.agents`
- empty tool dirs
- canonical repo present
- run `agents status`
- run `agents skills list`
- curate a skill
- sync skills
- verify downstream links

#### Journey B: legacy workflow user

- run `bun run sync-mcp.ts --dry-run`
- run `agents sync --dry-run`
- compare that both report plausible and consistent sync intent

#### Journey C: drifted environment user

- manually alter target config
- manually remove generated file
- manually create stale tool skill links
- verify `agents doctor` reports all three classes of issues

**Step 2: Run test to verify it fails**

Run:

```bash
bun test test/scenarios-user-journeys.test.ts
```

Expected:

- FAIL until the scenario harness is added

**Step 3: Write minimal implementation**

Implement the scenarios with the temp-fixture helper pattern.

Keep each scenario focused and avoid over-asserting unrelated details.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/scenarios-user-journeys.test.ts
bun test
```

Expected:

- PASS

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 6: Add package and distribution readiness checks

**Files:**
- Create: `test/package-readiness.test.ts`
- Create or Modify: `scripts/verify-release-readiness.*`

**Step 1: Write the failing tests**

Validate package/distribution assumptions:

- `package.json` contains required publish-facing fields:
  - `name`
  - `version`
  - `description`
  - `license`
  - `author`
  - `keywords`
  - `bin`
- `LICENSE` exists
- `README.md` exists
- `CONTRIBUTING.md` exists
- `bun link` is viable
- if `repository` is missing, the test should:
  - not fail silently
  - mark it as an explicit unresolved metadata requirement

This test should distinguish:

- required for current internal release-readiness
- required before public publish

**Step 2: Run test to verify it fails where intended**

Run:

```bash
bun test test/package-readiness.test.ts
```

Expected:

- any missing publish-facing metadata is surfaced explicitly

**Step 3: Write minimal implementation**

Implement the readiness test so it clearly reports:

- “ready now”
- “ready except for explicit publish-time metadata”

Do not fake repository metadata if it is still intentionally unresolved.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/package-readiness.test.ts
```

Expected:

- PASS with the current decision set, while preserving visibility into future publish requirements

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 7: Add Homebrew future-readiness checklist and validation hook

**Files:**
- Create: `.ai/knowledges/02_homebrew-release-checklist.md` or `docs/homebrew-release-checklist.md`
- Create: `test/homebrew-readiness.test.ts`

**Step 1: Write the failing test**

Write a readiness test that checks for the presence of a documented Homebrew packaging checklist and validates that it includes, at minimum:

- package name finalization
- tagged release requirement
- source tarball/archive expectations
- binary install strategy
- formula location/hosting decision
- macOS architecture considerations
- post-install smoke tests

The test should not require Brew to be implemented yet. It should require the repo to document the future path clearly.

**Step 2: Run test to verify it fails**

Run:

```bash
bun test test/homebrew-readiness.test.ts
```

Expected:

- FAIL until the checklist exists

**Step 3: Write minimal implementation**

Write the checklist document and test it for key sections. Keep it future-facing but concrete.

This is not Homebrew implementation work; it is release-readiness planning embedded into the testing program.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/homebrew-readiness.test.ts
```

Expected:

- PASS

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 8: Add matrix-oriented future environment certification plan

**Files:**
- Create: `.ai/analyses/05_cli-test-matrix.md`

**Step 1: Write the matrix**

Define a future-facing matrix that captures:

#### OS / platform

- macOS (current primary)
- Linux (future)

#### Install mode

- repo-local Bun execution
- globally linked Bun execution
- future package install
- future Homebrew install

#### User state

- first-time user
- migrated existing user
- drifted/broken environment
- missing optional local tools

#### Feature toggles

- `parallel.mcp.enabled = false`
- `parallel.mcp.enabled = true`
- optional servers off/on
- `markdownify` absent/present

#### Tool environment

- empty `~/.agents`
- populated `~/.agents`
- stale symlink state
- generated-file missing state

**Step 2: Review against current implementation**

Run:

```bash
rg -n "parallel|markdownify|doctor|sync|skills" README.md mcp-servers.json config.json cli test
```

Expected:

- the matrix reflects the real toggles and command surfaces that exist

**Step 3: Save the matrix**

Keep it concrete and prioritised:

- P0: current machine certification
- P1: cross-machine fresh-user validation
- P2: future OSS/Brew matrix

**Step 4: Re-read for actionability**

Run:

```bash
rg -n "P0|P1|P2|macOS|Linux|Homebrew|parallel|markdownify" .ai/analyses/05_cli-test-matrix.md
```

Expected:

- all matrix dimensions present

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 9: Add explicit documentation quality gates

**Files:**
- Create: `test/docs-readiness.test.ts`

**Step 1: Write the failing tests**

Validate that user-facing documentation covers:

- repo-local CLI usage
- global `bun link` usage
- `agents sync`
- `agents doctor`
- `markdownify` optional-local behavior
- `parallel` default vs MCP-overlay behavior
- compatibility with `sync-mcp.ts`

The test should scan:

- `README.md`
- `.ai/knowledges/01_agents-cli-usage-guide.md`
- future Homebrew checklist doc

**Step 2: Run test to verify it fails**

Run:

```bash
bun test test/docs-readiness.test.ts
```

Expected:

- FAIL until the documentation quality gate is fully represented

**Step 3: Write minimal implementation**

Add or adjust documentation only where genuinely missing.

The goal is not prose perfection; it is coverage of key operator and future-user scenarios.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/docs-readiness.test.ts
```

Expected:

- PASS

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 10: Final end-to-end certification run

**Files:**
- Verification only

**Step 1: Run the automated release gate**

```bash
bun run verify:release
```

Expected:

- PASS

**Step 2: Run the direct automation gates**

```bash
bun test
bun run typecheck
```

Expected:

- PASS

**Step 3: Run manual CLI certification**

Repo-local:

```bash
bun run agents -- --help
bun run agents -- sync --dry-run
bun run agents -- skills list
bun run agents -- skills list --json
bun run agents -- mcp list
bun run agents -- mcp list --json
bun run agents -- mcp sync --dry-run
bun run agents -- status
bun run agents -- status --json
bun run agents -- doctor
bun run agents -- doctor --json
```

Negative paths:

```bash
bun run agents -- skills uncurate nonexistent
bun run agents -- mcp sync --target=bogus
```

Compatibility:

```bash
bun run sync-mcp.ts --dry-run
```

Global:

```bash
bun link
agents --help
agents sync --dry-run
agents doctor --json
```

**Step 4: Record the certification result**

Create or update a completion artifact that records:

- pass/fail result
- exact commands run
- unresolved but explicitly accepted items
  - for example, missing public `repository` metadata until the remote is known
  - Brew not implemented yet, only planned/test-documented

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

## Notes

This testing plan intentionally goes beyond the current local engineering bar.

It is designed to support:

- current confidence in the CLI
- future OSS release readiness
- future fresh-user onboarding
- future cross-machine validation
- future Homebrew distribution planning

The goal is not just to “have tests,” but to build a disciplined certification story for real users operating in real environments.
