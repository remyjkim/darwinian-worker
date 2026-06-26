# ABOUTME: Implementation plan for closing strict-plan and CLI-flag-composition test gaps in `drwn write --root`.
# ABOUTME: 8 new scenarios + 2 assertion lines, ranked must-have vs should-have, with concrete code sketches and ordered phases.

# Task 51 — Implementation Plan: `drwn write --root` Test Coverage Hardening

**Status**: Completed
**Created**: 2026-06-24
**Updated**: 2026-06-25

**Completion**: See [51_completion_drwn-write-root-test-hardening.md](51_completion_drwn-write-root-test-hardening.md).
**Assigned**: Claude + Remy
**Priority**: Medium (post-ship hardening; nothing user-visible is broken today)
**Estimated Effort**: ~2 hours — 30 min for must-have, 90 min for should-have, plus full suite + typecheck verification
**Dependencies**: Task 49 (`feat: support root-scope MCP writes`, commit `1b08d11`) already shipped. This task augments its test surface. No production code changes are expected.
**References**: [tasks/49_drwn_write_root_implementation_plan.md, tasks/49_completion_drwn-write-root.md, analyses/66_drwn-write-root-target-architecture.md, cli/core/sync.ts, cli/core/mcp.ts, cli/core/managed-file.ts, cli/commands/write.ts, test/scenarios-root-scope.test.ts, test/scenarios-scope-isolation.test.ts, test/helpers.ts, test/commands-write.test.ts, test/commands-write-codex-drift.test.ts]

---

## Objective

Close the test-coverage gaps identified in the 2026-06-24 review of the shipped `drwn write --root` implementation against the updated task 49 plan. The implementation ships 6 scenarios in `test/scenarios-root-scope.test.ts`; the updated plan calls for 9 scenarios plus several implementation behaviors (CLI flag composition, dry-run, target filtering, Codex per-server removal symmetry, atomic-write resilience) that are present in code but not anchored to a test.

Result after this task: every test scenario named in the task-49 plan has an actual `bun:test` case behind it, and every CLI surface composition `--root` can take (`--user` alias, mutual exclusion, `--dry-run`, `--target=<tool>`) is asserted at the scenario level. Codex per-server removal — currently exercised only implicitly by the Claude removal test — gets its own assertion. The implementation's atomic-write path gets a cheap synthetic proxy.

This is **test-only work**. No production code is expected to change.

## Target State

After this task ships:

1. `test/scenarios-root-scope.test.ts` contains 13 tests (currently 6): the 6 existing scenarios remain, and 7 new tests are added covering must-have plan gaps and should-have implementation-behavior anchors.
2. `test/scenarios-scope-isolation.test.ts` asserts that `fixture.claudeUserMcp` is byte-identical after a project-scope write (currently only `fixture.claudeSettings` is asserted).
3. `test/commands-write-codex-drift.test.ts` gains a `--root`-driven Codex per-server removal scenario (currently the file covers project-scope Codex drift only).
4. Full `bun test` reports **789 pass / 1 skip / 0 fail** (currently 781 / 1 / 0). Typecheck remains clean.
5. The task 49 plan's 9-scenario test-plan-summary table has 1:1 traceability to actual `bun:test` cases, recorded in a companion `51_completion_drwn-write-root-test-hardening.md`.

## Success Criteria

- [ ] `bun run typecheck` passes.
- [ ] `bun test test/scenarios-root-scope.test.ts` passes with 13 cases (+7 vs baseline).
- [ ] `bun test test/scenarios-scope-isolation.test.ts` passes with the augmented assertion.
- [ ] `bun test test/commands-write-codex-drift.test.ts` passes with the augmented Codex per-server removal case.
- [ ] `bun test` — full suite reports 789 pass / 1 skip / 0 fail (or higher if I miscount the new test additions by ±1).
- [ ] No production-code diff (verify with `git diff --stat HEAD -- 'cli/**'` showing zero files).
- [ ] Each task-49 plan scenario (#1–#9) maps to a named `test()` in the test suite, recorded in the completion doc's traceability table.
- [ ] Companion `51_completion_drwn-write-root-test-hardening.md` summarizing what shipped + traceability table.

## Alternatives Considered

### Option A — Surgical placements: each test in the file most semantically appropriate (CHOSEN)

Place each new test in the file that already owns its concern:

- **M1** (project write doesn't touch `~/.claude.json`) → augment the existing test in `test/scenarios-scope-isolation.test.ts`. Two new lines, no new test case. The semantic claim "project writes don't touch home files" already lives there; the existing test just under-asserts the home surface.
- **M2, M3, S1, S2, S4, S5** → all live in `test/scenarios-root-scope.test.ts`, which is the established home for `--root` scenario coverage.
- **S3** (Codex per-server removal via `--root`) → augment `test/commands-write-codex-drift.test.ts`. The file already owns Codex drift + removal scenarios; adding the `--root` variant keeps related Codex behavior co-located.

**Pro**: each test lives where a future engineer searching for "what's covered for X?" would already look. Minimal new-file pressure. Each augmentation is small enough to land in one commit.

**Pro**: discovery cost stays low — `grep -r "test.*--root"` finds the bulk of new tests in `scenarios-root-scope.test.ts`, and the two outliers (M1, S3) are placed where their concerns already belong.

**Con**: spreads work across three files, which is mildly more friction at review time than a single file diff.

### Option B — Everything in `scenarios-root-scope.test.ts`

Put all new tests, including the Codex per-server removal and the scope-isolation assertion, into `scenarios-root-scope.test.ts`. Treat it as the canonical home for anything `--root`-adjacent.

**Pro**: single-file diff is the easiest review.

**Pro**: a single test file is the easiest mental model for "everything about `--root`."

**Con**: scenarios-scope-isolation.test.ts continues to silently under-assert. A future engineer making changes to the project-scope write path won't get a fail signal from "I accidentally wrote `~/.claude.json` from a project write" — that signal belongs at the project-scope test's already-existing boundary check.

**Con**: bloats one file with 7+ scenarios at the cost of three files each having a focused responsibility. The `scenarios-root-scope.test.ts` file becomes a kitchen-sink.

**Verdict**: rejected. The two-line augmentation to `scenarios-scope-isolation.test.ts` (Option A's M1 placement) is the strongest scope-isolation signal we can give a future engineer, and the marginal cost of touching one extra file is trivial.

### Option C — New `commands-write-root.test.ts` for the CLI flag tests

Split the implementation-behavior tests (S1, S2, S5) into a new file focused on CLI surface, leaving `scenarios-root-scope.test.ts` for end-to-end scenarios only.

**Pro**: each file has one concern: scenario vs. CLI surface.

**Con**: CLI surface tests **are** scenarios — `--root --dry-run`, `--root --target=claude`, `--root --user`. They use the same fixture, the same `runAgentsCli` helper, and assert the same kinds of properties. Splitting them is a category distinction without a behavioral one.

**Con**: more files to discover and to maintain in lockstep.

**Verdict**: rejected. Not enough payoff to justify the new file.

**Decision (2026-06-24): Option A.** Three files, semantic placement, two-thirds of the new tests in `scenarios-root-scope.test.ts`.

## Strategy

Four phases. Phase 1 (must-have) is independently shippable: closing the strict plan-vs-impl gaps without committing to the should-have set. Phase 2 (should-have) extends to full traceability and behavior coverage. Each phase is a self-contained commit with its own `bun test` verification.

- **Phase 0** — Branch, baseline test count capture.
- **Phase 1** — Must-have additions: M1, M2, M3. Closes the strict plan gaps.
- **Phase 2** — Should-have additions: S1, S2, S3, S4, S5. Closes the implementation-behavior anchoring gaps.
- **Phase 3** — Run `bun run typecheck` + `bun test` against the full suite; capture the new pass count.
- **Phase 4** — Completion doc with the 1:1 traceability table.

---

## Implementation Plan

### Phase 0 — Setup

**Tasks:**

- [ ] Branch from current HEAD: `git checkout -b feat/drwn-write-root-test-hardening` (or pick a name that matches the team's convention — task 49 was done on `remyjkim/task-44-drwn-card-hooks-with-cicd`; if the work continues on that branch, this phase is no-op).
- [ ] Capture baseline: `bun test 2>&1 | tail -5` → expect `781 pass / 1 skip / 0 fail`. Record for the completion doc.
- [ ] Confirm working tree is clean.

**Acceptance**: baseline counts recorded; branch ready.

---

### Phase 1 — Must-have additions (M1, M2, M3)

Goal: every strict gap in the task-49 plan's 9-scenario test plan has a `bun:test` case behind it.

#### Sub-step 1a — M1: Project write doesn't touch `~/.claude.json`

**File**: `test/scenarios-scope-isolation.test.ts`

The existing test (lines 24-44) captures `beforeHomeClaude` for `fixture.claudeSettings` and asserts byte-equality post-write. The fixture now exposes `fixture.claudeUserMcp` (added in task 49); the assertion just needs to extend to that surface.

**Sketch:**

```diff
 test("project write targets project-local agent files and leaves home files unchanged", async () => {
   const fixture = await scaffoldCliFixture();
   tempRoots.push(fixture.root);
   const projectDir = join(fixture.root, "project");
   const configPath = join(projectDir, ".agents", "drwn", "config.json");
   await mkdir(dirname(configPath), { recursive: true });
   await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));
   const beforeHomeClaude = await readFile(fixture.claudeSettings, "utf8");
+  const beforeHomeUserMcp = await readFile(fixture.claudeUserMcp, "utf8");

   const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

   expect(result.exitCode).toBe(0);
   expect(await readFile(fixture.claudeSettings, "utf8")).toBe(beforeHomeClaude);
+  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeHomeUserMcp);
   expect(JSON.parse(await readFile(join(projectDir, ".mcp.json"), "utf8")).mcpServers.context7).toBeDefined();
```

LOC: +2 (capture + assert). Closes plan Scenario 4 in its semantically correct home.

**Verification**: `bun test test/scenarios-scope-isolation.test.ts` — same 1 test, both assertions pass.

#### Sub-step 1b — M2: Claude Code rewrite resilience

**File**: `test/scenarios-root-scope.test.ts`

Simulates Claude Code rewriting `~/.claude.json` with sorted keys between two `drwn write --root` invocations. The canonical hash is order-independent, so the second write should detect no drift. Currently `canonicalJsonHash` order-independence is unit-tested in `test/core-managed-fields.test.ts`, but no scenario test exercises the integration.

**Sketch** — added at end of file:

```ts
test("write --root does not flag drift after ~/.claude.json is re-serialized with different key ordering", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  // Simulate Claude Code rewriting the file with sorted keys (it does this on UI
  // settings changes — keys can get re-sorted and whitespace changes are normal).
  const parsed = await readJson(fixture.claudeUserMcp);
  const sortKeys = (value: any): any => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
    }
    return value;
  };
  await writeJson(fixture.claudeUserMcp, sortKeys(parsed));

  const second = await runWriteRoot(fixture);
  expect(second.exitCode).toBe(0);
  expect(`${second.stdout}\n${second.stderr}`).not.toContain("Drift detected");
  // The owned entry survives the round-trip intact.
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7.command).toBe("npx");
});
```

LOC: ~20. Closes plan Scenario 8.

**Verification**: `bun test test/scenarios-root-scope.test.ts` — 7 passing tests (6 + 1).

#### Sub-step 1c — M3: CLI mutual exclusion + `--user` alias

**File**: `test/scenarios-root-scope.test.ts`

Two new tests asserting the CLI contract that `write.ts:73-75` enforces (mutual exclusion of `--root` and `--user`) and the alias contract that `--user` produces the same result as `--root`.

**Sketch:**

```ts
test("write rejects passing both --root and --user simultaneously", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(
    ["write", "--root", "--user", "--mcp-only", "--json"],
    envFor(fixture),
  );
  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/--root or --user/i);
});

test("write --user behaves identically to write --root", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);

  const result = await runAgentsCli(
    ["write", "--user", "--mcp-only", "--json"],
    envFor(fixture),
  );
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(await readFile(fixture.claudeUserMcp, "utf8")).mcpServers.context7).toBeDefined();

  // Side-table records --user write the same way --root does.
  const record = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  expect(record.managedPaths.some((entry: any) => entry.path === ".claude.json")).toBe(true);
});
```

LOC: ~25. Closes the CLI surface gap.

**Verification**: `bun test test/scenarios-root-scope.test.ts` — 9 passing tests (6 + M2 + 2 M3).

**Acceptance for Phase 1**: must-have tests added; `bun test test/scenarios-root-scope.test.ts test/scenarios-scope-isolation.test.ts` passes; full suite still green.

---

### Phase 2 — Should-have additions (S1, S2, S3, S4, S5)

Goal: every CLI flag composition (`--dry-run`, `--target=<tool>`) and every implementation behavior the review surfaced has a scenario-level test behind it.

#### Sub-step 2a — S1: `--root --dry-run` produces a plan but does not write

**File**: `test/scenarios-root-scope.test.ts`

The implementation's `--dry-run` path threads through `writeManagedFile`'s `if (!dryRun)` guard (`cli/core/managed-file.ts:59`) and `saveWriteRecord`'s `if (!state.normalized.dryRun)` guard (`cli/core/sync.ts:356`). Exercising it asserts no accidental writes and no side-table persistence.

**Sketch:**

```ts
test("write --root --dry-run produces a plan but does not modify any user-scope file", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");
  const writeRecordPath = join(fixture.agentsDir, "drwn", "global-write-record.json");

  const result = await runAgentsCli(
    ["write", "--root", "--mcp-only", "--dry-run", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { changes: string[] };
  expect(parsed.changes.length).toBeGreaterThan(0);
  expect(parsed.changes.some((c) => c.includes(fixture.claudeUserMcp))).toBe(true);

  // No actual writes, no write-record persistence.
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
  expect(existsSync(writeRecordPath)).toBe(false);
});
```

LOC: ~25.

#### Sub-step 2b — S2: `--root --target=<tool>` filter

**File**: `test/scenarios-root-scope.test.ts`

The implementation's `target` filter is in `cli/core/sync.ts:246-251`:

```ts
const selectedTargets = (Object.keys(config.targets) as TargetName[]).filter((name) => {
  if (options.target && options.target !== name) return false;
  return config.targets[name].enabled;
});
```

This composes with `--root`. No scenario test asserts the composition.

**Sketch** — one test per target, condensed via a loop for brevity:

```ts
test("write --root --target=claude writes only ~/.claude.json", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");

  const result = await runAgentsCli(
    ["write", "--root", "--target=claude", "--mcp-only", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeDefined();
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
});

test("write --root --target=codex writes only ~/.codex/config.toml", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");

  const result = await runAgentsCli(
    ["write", "--root", "--target=codex", "--mcp-only", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.context7]");
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
});

test("write --root --target=cursor writes only ~/.cursor/mcp.json", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");

  const result = await runAgentsCli(
    ["write", "--root", "--target=cursor", "--mcp-only", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  expect((await lstat(fixture.cursorConfig)).isSymbolicLink()).toBe(true);
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
});
```

LOC: ~60 (three tests).

#### Sub-step 2c — S3: Codex per-server removal

**File**: `test/commands-write-codex-drift.test.ts`

The implementation's `cleanupRemovedManagedPaths` Codex branch (`cli/core/sync.ts:143-148`) handles Codex per-server removal symmetric to the Claude flow that's already tested. The file already contains "write preserves a user-authored Codex server across runs"; add a `--root`-driven removal test as a sibling.

**Sketch** — added at end of file:

```ts
test("write --root removes a Codex MCP entry when the default is removed and leaves user-authored servers intact", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  // Seed user-authored Codex server alongside the eventual drwn-owned one.
  await writeFile(
    fixture.codexConfig,
    'personality = "pragmatic"\n\n[mcp_servers.user_made]\ncommand = "echo"\n',
  );

  // Register context7 as a machine default and materialize.
  expect((await runAgentsCli(["library", "defaults", "add", "mcp", "context7", "--json"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["write", "--root", "--mcp-only", "--json"], envFor(fixture))).exitCode).toBe(0);

  // Confirm both servers present.
  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.context7]");
  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.user_made]");

  // Now remove the default and re-run --root.
  expect((await runAgentsCli(["library", "defaults", "remove", "mcp", "context7", "--json"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["write", "--root", "--mcp-only", "--json"], envFor(fixture))).exitCode).toBe(0);

  const after = await readFile(fixture.codexConfig, "utf8");
  expect(after).not.toContain("[mcp_servers.context7]");
  expect(after).toContain("[mcp_servers.user_made]");
});
```

LOC: ~30.

#### Sub-step 2d — S4: Empty defaults with prior Codex ownership

**File**: `test/scenarios-root-scope.test.ts`

Test 4 currently covers the warn-and-skip path with fresh state (no prior ownership at all). The implementation's `hasPriorMcpOwnership` check (`cli/core/sync.ts:224-228`) short-circuits when ANY prior MCP ownership exists across Claude per-server / Codex / Cursor. The case "first write created Codex ownership, second write has empty defaults" isn't asserted.

**Sketch:**

```ts
test("write --root with empty defaults still prunes prior Codex ownership without warning", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  // Confirm Codex ownership exists after first write.
  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.context7]");

  // Empty the machine defaults via the user-config overlay.
  const repoConfig = await readJson(join(fixture.repoRoot, "registry", "config.json"));
  repoConfig.defaults = { ...(repoConfig.defaults ?? {}), mcpServers: [] };
  await writeJson(join(fixture.agentsDir, "drwn", "config.json"), repoConfig);

  const result = await runWriteRoot(fixture);

  expect(result.exitCode).toBe(0);
  // No "no machine-default" warning because there's prior ownership to clean up.
  expect(JSON.parse(result.stdout).warnings.join("\n")).not.toContain("no machine-default MCP servers");
  // Codex section pruned.
  expect(await readFile(fixture.codexConfig, "utf8")).not.toContain("[mcp_servers.context7]");
  // Claude user-MCP cleaned up too.
  expect((await readJson(fixture.claudeUserMcp)).mcpServers?.context7).toBeUndefined();
});
```

LOC: ~30.

#### Sub-step 2e — S5: Atomic-write tmp-file cleanup proxy

**File**: `test/scenarios-root-scope.test.ts`

The implementation's atomic write (`cli/core/managed-file.ts:27-44`) writes to `<path>.tmp` and `renameSync`s into place. A successful write should leave no orphaned `.tmp` file. This is a cheap synthetic proxy for atomicity — a real SIGKILL test would be flaky in CI.

**Sketch:**

```ts
test("write --root leaves no orphaned .tmp files after a successful write", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);

  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  // Atomic write contract: every <path>.tmp from this run must have been renamed away.
  expect(existsSync(`${fixture.claudeUserMcp}.tmp`)).toBe(false);
  expect(existsSync(`${fixture.codexConfig}.tmp`)).toBe(false);
  const generatedCursor = join(fixture.agentsDir, "drwn", "generated", "cursor-mcp.json");
  expect(existsSync(`${generatedCursor}.tmp`)).toBe(false);
});
```

LOC: ~15.

**Acceptance for Phase 2**: all should-have tests pass; `bun test test/scenarios-root-scope.test.ts test/commands-write-codex-drift.test.ts` passes with the new cases; full suite still green.

---

### Phase 3 — Full suite + typecheck

**Tasks:**

- [ ] `bun run typecheck` — must pass with no errors.
- [ ] `bun test 2>&1 | tail -10` — capture full suite count. Expect `~789 pass / 1 skip / 0 fail` (baseline 781 + 8 new tests). Adjust the expected number in the completion doc if it lands slightly differently due to refactor of existing tests during implementation.
- [ ] `git diff --stat HEAD -- 'cli/**'` — must show zero files changed in production code. If a production change was needed (e.g., a test surfaces a subtle bug), document it in the completion doc as a deviation.

**Acceptance**: full suite passes; no production-code diff.

---

### Phase 4 — Completion doc

Create `.ai/tasks/51_completion_drwn-write-root-test-hardening.md` following task 47/49 completion shape.

**Required sections:**

- **Completed**: 2026-06-?? (date Phase 3 lands)
- **Scope completed**: enumerate must-have + should-have tests, naming each one.
- **Scope deferred**: nice-to-haves N1–N3 from the 2026-06-24 review (skills-at-root path, legacy managed-fields fall-through, backup pruning behavior).
- **What Shipped**: bullet list of files + LOC.
- **Traceability table**: every task-49 plan scenario (#1–#9) mapped to its `test()` name and file. This is the load-bearing artifact — it's the final verification that the plan's 9-scenario contract is now 1:1 represented in code.

**Traceability table sketch:**

| Plan scenario | Test name | File |
| --- | --- | --- |
| #1 Surgical add | `write --root surgically adds default MCPs to user-scope tool configs` | `scenarios-root-scope.test.ts` |
| #2 Drift detection + recovery | `write --root detects drift only for drwn-owned MCP server entries` | `scenarios-root-scope.test.ts` |
| #3 Removal | `write --root removes the last drwn-owned MCP entry without touching hand-managed siblings` | `scenarios-root-scope.test.ts` |
| #4 Coexistence — project doesn't touch ~/.claude.json | `project write targets project-local agent files and leaves home files unchanged` (augmented) | `scenarios-scope-isolation.test.ts` |
| #5 Project unaffected by `--root` | `write --root ignores project config and leaves project MCP files untouched` | `scenarios-root-scope.test.ts` |
| #6 Hooks regression | (covered by existing `cli-hook-write-e2e.test.ts` + `core-mcp-merge-hooks.test.ts` after task 49 return-shape update) | (multiple) |
| #7 Empty defaults no-op | `write --root with no machine MCP defaults leaves user-scope MCP files unchanged` | `scenarios-root-scope.test.ts` |
| #8 Claude Code rewrite resilience | `write --root does not flag drift after ~/.claude.json is re-serialized with different key ordering` | `scenarios-root-scope.test.ts` |
| #9 Hand-managed sibling edit ignored | `write --root detects drift only for drwn-owned MCP server entries` (embedded with #2) | `scenarios-root-scope.test.ts` |

Plus an implementation-behavior table for should-have coverage (S1–S5) so future engineers can find them.

**Acceptance**: doc lands as a sibling of this plan; task 51 status flipped to "Completed."

---

## Test Plan Summary

After this task lands, the suite will contain 13 tests in `scenarios-root-scope.test.ts` (currently 6):

| # | Test name | Origin |
| --- | --- | --- |
| 1 | `write --root surgically adds default MCPs to user-scope tool configs` | task 49 |
| 2 | `write --root detects drift only for drwn-owned MCP server entries` | task 49 |
| 3 | `write --root removes the last drwn-owned MCP entry without touching hand-managed siblings` | task 49 |
| 4 | `write --root with no machine MCP defaults leaves user-scope MCP files unchanged` | task 49 |
| 5 | `write --root ignores project config and leaves project MCP files untouched` | task 49 |
| 6 | `doctor reports user-scope Claude MCP drift from the per-server write record` | task 49 |
| 7 | `write --root does not flag drift after ~/.claude.json is re-serialized with different key ordering` | **task 51 M2** |
| 8 | `write rejects passing both --root and --user simultaneously` | **task 51 M3a** |
| 9 | `write --user behaves identically to write --root` | **task 51 M3b** |
| 10 | `write --root --dry-run produces a plan but does not modify any user-scope file` | **task 51 S1** |
| 11 | `write --root --target=claude writes only ~/.claude.json` | **task 51 S2a** |
| 12 | `write --root --target=codex writes only ~/.codex/config.toml` | **task 51 S2b** |
| 13 | `write --root --target=cursor writes only ~/.cursor/mcp.json` | **task 51 S2c** |
| 14 | `write --root with empty defaults still prunes prior Codex ownership without warning` | **task 51 S4** |
| 15 | `write --root leaves no orphaned .tmp files after a successful write` | **task 51 S5** |

Plus:

- `test/scenarios-scope-isolation.test.ts` — existing test gains 1 capture + 1 assertion line (M1).
- `test/commands-write-codex-drift.test.ts` — gains 1 new test (S3).

**Total**: +9 new test cases + 2 new assertions in existing test. Suite count: 781 → ~790.

---

## Risks and Mitigations

1. **Sub-step 1b's `sortKeys` re-serialization may introduce subtle parsing edge cases.** The current `mergeClaudeSettingsText` uses `JSON.parse(currentText)` followed by `readClaudeMcpServers` which checks `typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers)`. The sorted re-serialization preserves the object structure; just keys move. Mitigation: the test asserts both `exitCode === 0` AND `mcpServers.context7.command === "npx"` after the second write — if any structural quirk creeps in, the asserts catch it.
2. **Sub-step 2b's `--target=cursor` test** depends on the cursor `mcp.json` actually being a symlink and the generated file existing in the temp `.agents/drwn/generated/` dir. The existing scenarios-root-scope test 1 asserts the symlink contract; replicating it for the targeted case is straightforward.
3. **Sub-step 2d's "empty defaults via user-config overlay" test** relies on `loadEffectiveConfig` merging `~/.agents/drwn/config.json` over the packaged registry. This is the same mechanism `library defaults add` uses internally. If the overlay shape changes, this test would need to follow. Mitigation: keep an eye on `cli/core/user-config.ts:mergeMachineConfig` during review.
4. **Sub-step 2e's tmp-file assertion** is timing-sensitive only on failure — a successful atomic write never leaves a tmp file. If an atomicity regression is introduced, the test would catch it via a stale `.tmp` after a successful run. The test cannot catch *mid-write* corruption (that's the deferred SIGKILL territory) but it can catch "we forgot to rename" or "the rename succeeded but the tmp wasn't cleaned" classes of bugs.
5. **No production code change is expected.** If during implementation any test reveals an actual implementation defect, capture it in the completion doc as a deviation and add a follow-up task. Do not silently fix production code in this task.

## Rollback Plan

This task is test-only; rollback is straightforward.

1. `git revert <commit>` removes the test additions cleanly.
2. The full suite returns to 781 passing, 1 skipped, 0 failing — exactly the post-task-49 baseline.
3. No user-facing behavior changes regardless of revert; nothing in production code was touched.

## Open Questions

1. **Should the must-have set ship as one commit (M1+M2+M3) and should-have as another (S1+S2+S3+S4+S5)?** Recommended yes — keeps the must/should distinction visible in git history. Alternative is single commit "test: harden drwn write --root coverage" with everything; either is reasonable.
2. **Is `feat/drwn-write-root-test-hardening` the right branch name** if the task-49 work was done directly on `remyjkim/task-44-drwn-card-hooks-with-cicd`? If staying on that branch, no new branch is needed — just one or two test commits. If the team prefers a topic branch per task, branch as named.
3. **Should the completion doc enumerate the three nice-to-have items (N1–N3 from the review) as explicit "deferred" entries?** Recommended yes — keeps the deferred queue visible for a future task without lossy hand-wave.

---

## Appendix A — Full file change list (with LOC estimates)

| File | LOC | Phase | What changes |
| --- | --- | --- | --- |
| `test/scenarios-scope-isolation.test.ts` | +2 | 1 | M1 — extend the existing project-write-isolation test to assert `fixture.claudeUserMcp` byte-equality |
| `test/scenarios-root-scope.test.ts` | +175 | 1, 2 | M2, M3a, M3b, S1, S2a, S2b, S2c, S4, S5 — 9 new tests |
| `test/commands-write-codex-drift.test.ts` | +30 | 2 | S3 — new Codex per-server removal scenario driven through `--root` |
| `.ai/tasks/51_completion_drwn-write-root-test-hardening.md` | +120 | 4 | Completion doc with the 1:1 traceability table |
| **Total test code** | **~207 LOC net add** | | |
| **Production code** | **0 LOC** | | (explicitly not in scope) |

## Appendix B — Verification snapshot template (for completion doc)

Baseline (from task 49 completion):

```
$ bun test 2>&1 | tail -5
 781 pass
 1 skip
 0 fail
 ...
Ran 782 tests across 156 files.
```

Post-task-51 target:

```
$ bun test 2>&1 | tail -5
 ~789-790 pass
 1 skip
 0 fail
 ...
Ran ~790-791 tests across 156 files.
```

Pass-count math: 781 baseline + 9 new tests (the 8 new `scenarios-root-scope` tests + 1 new `commands-write-codex-drift` test) = 790 expected. The augmented assertion in `scenarios-scope-isolation` does not change the test count.

## Appendix C — Helper reference

The new tests rely on these existing helpers from `test/helpers.ts`:

```ts
// Spawn the CLI as a subprocess against an isolated temp fixture.
// cwd defaults to env.AGENTS_REPO_ROOT (the temp repo root, not the system cwd).
export async function runAgentsCli(args: string[], env: Record<string, string>, cwd?: string): Promise<{ exitCode: number; stdout: string; stderr: string; }>;

// Build a self-contained temp fixture: home dir with .claude/, .codex/, .cursor/;
// agents dir with empty library and store; repo with registry config.
export async function scaffoldCliFixture(options?: { parallelMcpEnabled?: boolean; curatedSkillNames?: string[]; }): Promise<{
  root: string; repoRoot: string; homeDir: string; agentsDir: string;
  claudeSettings: string; codexConfig: string; cursorConfig: string;
  claudeUserMcp: string;  // ~/.claude.json (added in task 49)
}>;

// Standard env vars to point the CLI at the fixture.
export function envFor(fixture: { repoRoot: string; homeDir: string; agentsDir: string }): Record<string, string>;

// Teardown.
export async function cleanupTempRoots(roots: string[]): Promise<void>;
```

And these existing helpers from `test/scenarios-root-scope.test.ts` to reuse:

```ts
async function readJson(pathValue: string): Promise<Record<string, any>>;
async function writeJson(pathValue: string, value: unknown): Promise<void>;
async function runWriteRoot(fixture, args: string[] = [], cwd?: string);
async function ensureContext7Default(fixture);
```

The new tests should reuse these without redefining them — they're already at the top of the file.

## Appendix D — Why no skills-at-root test (N1, deferred)

Skills at machine scope already work via the auto-derivation path (a non-drwn-managed cwd causes `findProjectConfig` to return null, which routes through machine scope including skill symlinks). The original `scaffoldCliFixture` `curatedSkillNames` parameter was added for exactly this scenario. A `--root --skills-only` test would add ~25 LOC and assert correctness of a code path that's already implicitly exercised by every fixture that uses `curatedSkillNames`. Worth adding if the skills slice ever gets edited; not worth blocking this task.

## Appendix E — Why no legacy-managed-fields fall-through test (N2, deferred)

A pre-task-49 write-record could contain a `.claude/settings.json` `managed-fields` entry with `fields: ["mcpServers", "hooks"]` and `fieldHashes: {}`. The implementation's cleanup code (`cli/core/sync.ts:105`) falls through `hasClaudePerServerHashes(entry)` (false) and `isCodexMcpEntry(entry)` (false, the path is `.claude/settings.json`) and lands in the catch-all warning (line 164). No user actually has these records because `fieldHashes: {}` was the previous state — nothing was being drift-checked. So the fall-through is correct behavior in practice. A test that constructs the artifact and asserts the warning would be defensive but exercises a path no live user will hit. Deferred until either users surface a confusing warning or a related upgrade-path task lands.

## Appendix F — Why no backup-proliferation test (N3, deferred)

Risk 6 in task 49 documented that `~/.claude.json.bak`, `.bak.1`, ... can accumulate. The behavior is by-design (every modify-write makes a backup) and a test would mostly be observational. The follow-up if this becomes painful is a cap-at-N implementation, at which point the test for "we keep at most 3 backups" becomes load-bearing. Until then, asserting current proliferation behavior would lock in something we'd then need to change.
