# OpenCode Target Support (Phase 1: MCP) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `opencode` as a fourth drwn target that merges managed MCP servers into
OpenCode's shared config file (`opencode.json` at project root,
`~/.config/opencode/opencode.json` at machine scope) under the `mcp` key, with per-server
ownership, foreign-key preservation, and drift detection — MCP only; skills/hooks/
instructions are later phases.

**Architecture:** Follows the descriptor-table pattern (analysis 82): one new
`DESCRIPTORS` entry plus branches at each per-target dispatch point. The merge writer is
modeled on `mergeCursorConfigText` but nests servers under `mcp` and passes through all
other user-owned keys (`$schema`, `plugin`, `tools`, `agent`, …). Ships
`enabled: false` in the packaged registry (opt-in via machine/project config) because the
project-scope write lands a root-level, user-committed file. Full design rationale:
`.ai/analyses/122_feature_opencode_target_support_target_architecture.md` (decisions
D1-D9 — read it first; this plan implements D1-D5 and D9).

**Tech Stack:** Bun + TypeScript, bun:test, Zod (machine config schema), test helpers in
`test/helpers.ts`.

**Blocking decisions (confirm with Remy before starting):** design 122 §7 Q1
(`enabled: false` default) and Q4 (never gitignore `opencode.json`). This plan assumes
both answers are "yes".

**Conventions:** `bun test ./test/<file>.test.ts`; temp fixtures pushed to `tempRoots`
with `afterEach` cleanup; commit messages are plain conventional commits with no AI
attribution. OpenCode format facts come from
`.ai/analyses/121_opencode-configuration-guide.md` — cite it when in doubt, don't guess.

---

## Part A — Prep refactors (no behavior change)

### Task A1: Iterate ALL_TARGET_NAMES in mergeMachinePolicy

**Files:**
- Modify: `cli/core/user-config.ts:36`

**Step 1:** Replace the hardcoded array:

```ts
for (const target of ["claude", "codex", "cursor"] as TargetName[]) {
```

with:

```ts
for (const target of ALL_TARGET_NAMES) {
```

importing `ALL_TARGET_NAMES` from `./targets`.

**Step 2:** Run: `bun test ./test/core-config.test.ts ./test/core-machine-config.test.ts`
— Expected: PASS (pure refactor).

**Step 3:** Commit: `git commit -m "refactor(config): derive machine policy targets from the descriptor table"`.

### Task A2: Rename claudeMcpServerHashKey → mcpServerHashKey

The `"mcpServers:"` hash-key prefix is a write-record namespace shared today by claude
and cursor, and next by opencode — the name no longer describes what it does.

**Files:**
- Modify: `cli/core/mcp.ts:219-229` and all call sites

**Step 1:** `grep -rn "claudeMcpServerHashKey\|CLAUDE_MCP_SERVER_HASH_PREFIX\|ownedClaudeMcpServerNames\|hashClaudeManagedServers\|readClaudeMcpServers" cli test --include="*.ts"`
and rename the target-neutral ones: `claudeMcpServerHashKey` → `mcpServerHashKey`,
`ownedClaudeMcpServerNames` → `ownedMcpServerNames`. Leave `mergeClaudeSettingsText` and
`hashClaudeManagedServers` alone for now (`hashClaudeManagedServers` reads the
`mcpServers` JSON key specifically, which stays accurate for claude/cursor; Task D2 adds
an opencode-specific reader rather than generalizing it).

**Step 2:** Run: `bun test ./test/` — Expected: PASS.

**Step 3:** Commit: `git commit -m "refactor(mcp): name the shared per-server hash-key helpers accurately"`.

> Coordination note: if plan 87 (cursor gap remediation) has landed, its Task A2 imported
> `claudeMcpServerHashKey` into diagnostics — the grep in Step 1 catches it.

---

## Part B — Target registration

### Task B1: Failing descriptor tests

**Files:**
- Test: `test/core-targets.test.ts` (modify)

**Step 1:** Add:

```ts
test("opencode target descriptor", () => {
  const opencode = getTargetDescriptor("opencode");
  expect(opencode.surfaces).toEqual(["opencode"]);
  expect(opencode.mcpFormat).toBe("json-merge");
  expect(opencode.hookRuntime).toBeNull();
});

test("ALL_TARGET_NAMES includes opencode", () => {
  expect(ALL_TARGET_NAMES).toEqual(["claude", "codex", "cursor", "opencode"]);
});
```

If plan 87 landed, also assert `skillSurfaces` — per design 122 D6, Phase 1 opencode
relies on compat discovery of claude's directory, so `skillSurfaces: []` (opencode gets
NO skill materialization of its own in this phase; revisit in Phase 2).

**Step 2:** Run: `bun test ./test/core-targets.test.ts` — Expected: FAIL.

### Task B2: Register the target

**Files:**
- Modify: `cli/core/types.ts:7` — `export type TargetName = "claude" | "codex" | "cursor" | "opencode";`
- Modify: `cli/core/targets.ts` — `Surface` union gains `"opencode"`; add:

```ts
opencode: {
  name: "opencode",
  family: "opencode",
  surfaces: ["opencode"],
  mcpFormat: "json-merge",
  hookRuntime: null,
},
```

(plus `skillSurfaces: []` if that field exists.)

- Modify: `registry/config.json` — after the cursor entry:

```json
"opencode": {
  "enabled": false,
  "configPath": "~/.config/opencode/opencode.json",
  "format": "json-merge",
  "mcpKey": "mcp"
}
```

- Modify: `cli/core/machine-config.ts:34-38` — add `opencode: targetOverrideSchema.optional()` to `targetsSchema`.
- Modify: `cli/core/write-record.ts:33,67` — add `"opencode"` to `ProjectionTarget` and
  its Zod enum; at `:82-88` allow `surface: "mcp"` with target `"opencode"` (skill and
  hook rules unchanged — opencode stays forbidden there in Phase 1).
- Modify: `cli/core/projection-ownership.ts:9` — widen the Extract union with `"opencode"`.

**Step 1:** Make the edits. TypeScript will now flag every non-exhaustive `TargetName`
switch/record — fix each by following the compiler (`bunx tsc --noEmit` or `bun test`
surfacing type errors). Expected compile-fix sites include `cli/core/ambient-policy.ts:228`
(`targetOrder` — add `opencode: 3`) and any `Record<TargetName, ...>` literals; make each
addition minimal and note it for later parts if behavior (not just types) is involved.

**Step 2:** Run: `bun test ./test/core-targets.test.ts ./test/core-config.test.ts ./test/core-machine-config.test.ts` — Expected: PASS.

**Step 3:** Failing-then-passing config checks — add to `test/core-config.test.ts`:

```ts
test("packaged registry declares the opencode target disabled by default", async () => {
  // load the real packaged registry via loadConfig(<actual repo root>)
  expect(config.targets.opencode).toMatchObject({ enabled: false, mcpKey: "mcp" });
});
```

And to `test/core-machine-config.test.ts`: a machine policy `{ targets: { opencode: { enabled: true } } }`
validates and, through `loadEffectiveConfig`, flips the effective flag (follow the
existing override test's shape).

**Step 4:** Run: `bun test ./test/` — Expected: PASS.

**Step 5:** Commit:

```bash
git add cli/core/types.ts cli/core/targets.ts registry/config.json cli/core/machine-config.ts cli/core/write-record.ts cli/core/projection-ownership.ts cli/core/ambient-policy.ts test/core-targets.test.ts test/core-config.test.ts test/core-machine-config.test.ts
git commit -m "feat(targets): register the opencode target behind a disabled default"
```

---

## Part C — MCP rendering

### Task C1: Failing renderer tests

**Files:**
- Test: `test/core-mcp-headers.test.ts` (modify — follow the existing per-target describe blocks)

**Step 1:** Add an opencode describe block (shapes per guide 121 §1.2-1.3 and design 122 D3):

```ts
describe("OpenCode MCP rendering", () => {
  test("stdio servers render as local with a combined command array", () => {
    const rendered = renderMcpServerForTarget("opencode", {
      description: "", transport: "stdio", command: "npx",
      args: ["-y", "tool"], env: { API_KEY: "${MY_KEY}" }, optional: false,
    });
    expect(rendered).toEqual({
      type: "local",
      command: ["npx", "-y", "tool"],
      enabled: true,
      environment: { API_KEY: "{env:MY_KEY}" },
      timeout: 30000,
    });
  });

  test("http and sse servers both render as remote with {env:VAR} headers", () => {
    // transport "http" → type "remote"; headers { Authorization: "Bearer ${FAL_KEY}" }
    //   → { Authorization: "Bearer {env:FAL_KEY}" }; enabled true; timeout 30000
    // repeat for transport "sse" — identical shape
  });

  test("startupTimeoutSec overrides the timeout in milliseconds", () => {
    // startupTimeoutSec: 60 → timeout: 60000
  });
});
```

Match the fixture-server helper style already in that file (`headerAuthHttpServer()` etc.).

**Step 2:** Run: `bun test ./test/core-mcp-headers.test.ts` — Expected: FAIL
(opencode falls through to the claude renderer).

### Task C2: Implement the renderer

**Files:**
- Modify: `cli/core/mcp.ts`

**Step 1:** Beside `toCursorEnvValue` (`:96`):

```ts
function toOpencodeEnvValue(value: string) {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "{env:$1}");
}
```

Beside `toCursorServerConfig` (`:154`):

```ts
function toOpencodeServerConfig(server: RegistryServer) {
  const timeout = (server.startupTimeoutSec ?? 30) * 1000;
  if (server.transport === "stdio") {
    return {
      type: "local",
      command: [server.command, ...(server.args ?? [])],
      enabled: true,
      ...(server.env
        ? {
            environment: Object.fromEntries(
              Object.entries(server.env).map(([key, value]) => [key, toOpencodeEnvValue(value)]),
            ),
          }
        : {}),
      timeout,
    };
  }

  return {
    type: "remote",
    url: server.url,
    enabled: true,
    ...(server.headers ? { headers: mapHeaderValues(server.headers, toOpencodeEnvValue) } : {}),
    timeout,
  };
}
```

Add the dispatch branch in `renderMcpServerForTarget` (`:197-201`):
`if (target === "opencode") return toOpencodeServerConfig(server);`

**Step 2:** Run: `bun test ./test/core-mcp-headers.test.ts` — Expected: PASS.

**Step 3:** Commit: `git commit -m "feat(mcp): render opencode local and remote server configs"`.

### Task C3: Merge writer (TDD)

**Files:**
- Test: `test/core-mcp-headers.test.ts` or a new `test/core-opencode-merge.test.ts` (create — cleaner)
- Modify: `cli/core/mcp.ts`

**Step 1:** Failing tests for `mergeOpencodeConfigText` (contract identical to
`mergeCursorConfigText` at `mcp.ts:447-494`, but under the `mcp` key with user-key
passthrough):

```ts
// ABOUTME: Pins mergeOpencodeConfigText ownership, drift, and passthrough semantics.
// ABOUTME: opencode.json is a user-owned file; drwn owns only its mcp servers.

test("merges servers under mcp and preserves every other user key", () => {
  const current = JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    plugin: ["opencode-wakatime"],
    tools: { "mymcp*": false },
    mcp: { "user-own": { type: "local", command: ["my-tool"] } },
  });
  const { text, fieldHashes } = mergeOpencodeConfigText(current, servers);
  const parsed = JSON.parse(text);
  expect(parsed.plugin).toEqual(["opencode-wakatime"]);
  expect(parsed.tools).toEqual({ "mymcp*": false });
  expect(parsed.mcp["user-own"]).toEqual({ type: "local", command: ["my-tool"] });
  expect(parsed.mcp.context7).toMatchObject({ type: "remote", enabled: true });
  expect(Object.keys(fieldHashes)).toContain("mcpServers:context7");
});

test("owned-server drift throws without force", () => {
  // priorFieldHashes for context7, current file has a tampered context7 value
  // expect throw matching /Drift detected in OpenCode managed MCP server/
});

test("force overwrites drifted owned servers", () => { /* same setup, force: true, no throw */ });

test("owned servers removed from the registry are deleted only when untampered", () => {
  // priorFieldHashes includes a server not in `servers`; current value matches hash → removed
  // tampered variant → preserved
});
```

Note the hash-key namespace stays `"mcpServers:"` (via `mcpServerHashKey` from Task A2)
even though the JSON key is `mcp` — it is a write-record namespace, not a file path.

**Step 2:** Run — Expected: FAIL. **Step 3:** Implement `mergeOpencodeConfigText` in
`mcp.ts` by copying `mergeCursorConfigText`'s body with three changes: read/write
`parsed.mcp` instead of `parsed.mcpServers` (inline the object-guard like
`readClaudeMcpServers` does for `mcpServers`), render via `toOpencodeServerConfig`, and
error text "Drift detected in OpenCode managed MCP server(s): … Rerun drwn write --root
--force to overwrite." Do NOT delete `parsed._drwn` (that line is claude-specific
hygiene; opencode files never contain it). **Step 4:** Run — Expected: PASS.

**Step 5:** Commit: `git commit -m "feat(mcp): merge managed servers into opencode.json"`.

---

## Part D — Sync wiring

Read `cli/core/sync.ts:83-160` and `:463-590` fully before this part. Record-path keys:
project scope `"opencode.json"`, machine scope `".config/opencode/opencode.json"` (both
resolve naturally via `managedPathToAbsolute` against their scope roots; the explicit
`managedPathAbsolute` branch keeps machine resolution correct when a machine policy
overrides `configPath`).

### Task D1: Failing project-scope write test

**Files:**
- Test: `test/commands-write-opencode-conflict.test.ts` (create — model on `test/commands-write-cursor-conflict.test.ts`)
- Modify: `test/helpers.ts` — `scaffoldCliFixture` gains `opencodeConfig: join(homeDir, ".config", "opencode", "opencode.json")` in its return; `createFixtureConfig` gains an opencode target entry (`enabled: true` in fixtures so tests exercise it; the packaged default stays false).

**Step 1:** Tests:

```ts
test("write merges managed servers into opencode.json preserving user keys", async () => {
  // project dir seeded with opencode.json: { $schema, plugin: ["x"], mcp: { own: {...} } }
  // project config enables opencode (targets: { opencode: { enabled: true } })
  const result = await runAgentsCli(["write", "--target=opencode", "--json"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(await readFile(join(projectDir, "opencode.json"), "utf8"));
  expect(parsed.plugin).toEqual(["x"]);
  expect(parsed.mcp.own).toBeDefined();
  expect(parsed.mcp.context7).toMatchObject({ type: "remote", enabled: true });
});

test("a fresh opencode.json is seeded with the schema line", async () => {
  // no pre-existing file → written file has $schema: "https://opencode.ai/config.json"
});

test("write refuses when opencode.jsonc exists", async () => {
  // seed opencode.jsonc; run write; expect exit 0 with a warning mentioning opencode.jsonc
  // and NO opencode.json created
});

test("owned-server drift blocks the write without --force", async () => {
  // write once, tamper parsed.mcp.context7, write again → nonzero exit / drift error;
  // then --force succeeds (mirror the cursor conflict test's drift flow)
});
```

**Step 2:** Run — Expected: FAIL (no opencode branch in syncMcp).

### Task D2: Implement the sync branches

**Files:**
- Modify: `cli/core/paths.ts:63-77` — add `opencodeConfig: join(root, "opencode.json")` to `resolveToolPaths` (project-scope resolution; machine scope goes through `configPath`).
- Modify: `cli/core/sync.ts`

**Step 1:** `machineMcpRecordPath` (`:83-87`): make the dispatch explicit — no silent
fallback now that four targets exist:

```ts
function machineMcpRecordPath(target: TargetName) {
  if (target === "claude") return ".claude.json";
  if (target === "codex") return ".codex/config.toml";
  if (target === "opencode") return ".config/opencode/opencode.json";
  return ".cursor/mcp.json";
}
```

**Step 2:** `managedPathAbsolute` (`:149-154`): add
`if (entry.path === ".config/opencode/opencode.json") return machineTargetConfigPath(state, "opencode");`

**Step 3:** `inspectManagedFields` (`:156-190`): the JSON branch reads `parsed.mcpServers`
hard-coded. Add a key selector:

```ts
const serversKey = entry.path.endsWith("opencode.json") ? "mcp" : "mcpServers";
```

and use `parsed[serversKey]` in the existing guard. Same change inside
`cleanupRemovedManagedPaths` (`:278-389`, the `managed-fields` +
`hasClaudePerServerHashes` branch reads `parsed.mcpServers`).

**Step 4:** `syncMcp` (`:463-590`): in the `targetConfigPath` closure add
`if (targetName === "opencode") return toolPaths.opencodeConfig;` before the cursor
fallthrough. Add a `previousOpencode` hash recovery mirroring `previousCursor`
(`:479-484`) keyed on the two opencode record paths. Then the branch after cursor's:

```ts
if (targetName === "opencode") {
  const jsoncSibling = configPath.replace(/opencode\.json$/, "opencode.jsonc");
  if (existsSync(jsoncSibling)) {
    result.warnings.push(
      `Skipping opencode MCP write: ${jsoncSibling} exists and drwn only manages opencode.json. Migrate the config or manage MCP manually.`,
    );
    continue;
  }
  const current = await readTextIfExists(configPath, `{\n  "$schema": "https://opencode.ai/config.json"\n}\n`);
  const merged = mergeOpencodeConfigText(current, servers, {
    priorFieldHashes: previousOpencodeHashes,
    force: options.force ?? false,
    preserveRemovedOwnedServers: true,
  });
  writeManagedFile(configPath, merged.text, options.dryRun, result);
  if (Object.keys(merged.fieldHashes).length > 0) {
    managedPaths.push({
      path: options.writeScope === "project" ? "opencode.json" : ".config/opencode/opencode.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "opencode",
      fields: Object.keys(merged.fieldHashes),
      fieldHashes: merged.fieldHashes,
    });
  }
  continue;
}
```

(Confirm how the cursor branch distinguishes scopes for its record path — it records
`".cursor/mcp.json"` for both because the relative path is identical at either root;
opencode's differ, hence the ternary. Verify against `machineMcpRecordPath` usage in
`planMachineManagedPaths` at `:104-140`, which must produce the same key — that function
calls `machineMcpRecordPath(target)` already, so machine planning is consistent.)

**Step 5:** Run: `bun test ./test/commands-write-opencode-conflict.test.ts` — Expected: PASS.

**Step 6:** Machine-scope test — add to the same file:

```ts
test("write --root merges into the machine opencode config", async () => {
  // enable a machine MCP server (drwn machine mcp enable context7 or fixture equivalent —
  // see scenarios-root-scope.test.ts:423 for the cursor analog) then write --root --target=opencode
  // assert ~/.config/opencode/opencode.json contains mcp.context7 and the machine
  // write-record has path ".config/opencode/opencode.json" with mcpServers:context7 hash
});
```

Run — iterate until PASS.

**Step 7:** Full suite: `bun test ./test/` — Expected: PASS. Pay attention to
`commands-write-partial-ownership.test.ts` (matrix may need an opencode column only if
fixtures enable opencode by default — prefer keeping default fixtures opencode-enabled
and updating the matrix deliberately) and `core-reconcile.test.ts`.

**Step 8:** Commit:

```bash
git add cli/core/paths.ts cli/core/sync.ts cli/core/mcp.ts test/helpers.ts test/commands-write-opencode-conflict.test.ts
git commit -m "feat(write): project and machine opencode.json MCP projection"
```

---

## Part E — Ambient inspection & collision policy

### Task E1: Failing ambient tests

**Files:**
- Test: locate the ambient policy tests (`grep -rln "CURSOR_PROJECT_MERGES_USER" test/`) and add opencode cases beside the cursor ones.

**Step 1:** Cases (semantics per guide 121 §0 — later sources override earlier, project
wins wholesale):

```ts
test("same-id opencode server in project and user warns with project-wins guidance", () => {
  // expect reasonCode "OPENCODE_PROJECT_OVERRIDES_USER", disposition "warning"
});

test("identical opencode definitions classify as ambient-identical", () => {
  // expect reasonCode "AMBIENT_IDENTICAL"
});
```

**Step 2:** Run — Expected: FAIL.

### Task E2: Implement

**Files:**
- Modify: `cli/core/ambient-policy.ts` — add before the cursor fallthrough in
  `classifyAmbientMcpCollisions` (~`:193-228`):

```ts
if (target === "opencode") {
  return collision(
    input,
    declared,
    ambient,
    "warning",
    "OPENCODE_PROJECT_OVERRIDES_USER",
    "OpenCode uses the project opencode.json definition for a same-ID server; align or rename the duplicate if unintended.",
  );
}
```

(`targetOrder` already gained `opencode: 3` in Task B2.)

- Modify: `cli/core/ambient-capabilities.ts:78` — add `"opencode"` to the target loop.
  The JSON parse path and `parsed[targetConfig.mcpKey]` read (`:92`) work as-is with
  `mcpKey: "mcp"`. A `.jsonc`-only machine yields no ambient definitions (the `.json`
  path simply doesn't exist) — acceptable; the write-side guard in D2 covers the
  conflict case.
- Modify: `cli/core/effective-state.ts:402-408` — `declaredPaths` gains
  `opencode: projectPaths.opencodeConfig`.
- Modify: `scripts/verify-release-readiness.ts` — add `OPENCODE_PROJECT_OVERRIDES_USER`
  to the stable reason-code list (find the list via
  `grep -n "CURSOR_PROJECT_TRANSPORT_OVERRIDE" scripts/verify-release-readiness.ts`).

**Step 1:** Make the edits. **Step 2:** Run the E1 tests + `bun test ./test/release-readiness.test.ts` — Expected: PASS.
**Step 3:** Commit: `git commit -m "feat(ambient): classify opencode project and user MCP collisions"`.

---

## Part F — Diagnostics, hygiene, commands, docs

### Task F1: Doctor coverage

**Files:**
- Modify: `cli/core/diagnostics.ts:730` — add `|| name === "opencode"` to the target
  listing branch.
- Modify: `cli/core/diagnostics.ts` `detectMcpDrift` (~`:840-884`) — add an opencode
  branch using per-server hash comparison on the `mcp` key (if plan 87 Part A landed,
  extract its cursor hashing into a small local helper parameterized by
  `(configKey, target)`; otherwise mirror the codex-style hash compare inline reading
  `parsed.mcp`).
- Test: extend `test/core-mcp-drift.test.ts` (from plan 87) or create it with the same
  ABOUTME header, covering: foreign keys/servers in `opencode.json` → no drift; tampered
  managed server → drift entry `opencode:<path>`.

TDD: failing test → implement → `bun test ./test/core-mcp-drift.test.ts` PASS → commit
`fix(diagnostics): opencode MCP drift by managed server`.

### Task F2: Git hygiene and watch — conscious no-op with a pin

Per design 122 D9: `opencode.json` is user-committed; drwn must NOT ignore it.

**Files:**
- Test: locate the git-hygiene test (`grep -rln "PROJECTION_SURFACE_ENTRIES\|git-hygiene" test/`) and add:

```ts
test("opencode.json is never listed as a drwn projection surface for git hygiene", () => {
  // assert the hygiene entries do not include "opencode.json" or ".opencode/"
});
```

No production change (`cli/core/git-hygiene.ts:18-24` and `cli/core/write-watch.ts:20-26`
stay untouched in Phase 1 — no `.opencode/` writes exist yet).

Run → PASS → commit `test(hygiene): pin opencode.json as user-owned`.

### Task F3: Command surfaces

`--target=opencode` already validates via `isTargetName` (`cli/commands/write.ts:112-114`,
`cli/commands/mcp/write.ts:43-44`) once the descriptor exists — verify, don't reimplement.

**Files:**
- Test: `test/commands-write.test.ts` — add one case: `drwn write --target=opencode --json`
  on a fixture with opencode enabled exits 0; `--target=bogus` still errors.
- Check `grep -rn "codex,claude,cursor\|claude, codex, cursor" cli/commands/` for help
  strings enumerating targets (e.g. the beads prompt at `cli/commands/init.ts:140` is
  beads-specific — leave it) and update only generic target enumerations.

Run: `bun test ./test/commands-write.test.ts` → PASS → commit
`feat(cli): accept opencode as a write target`.

### Task F4: Documentation

**Files:**
- Modify: `docs/cli-quickref.md` — target list, `drwn mcp write --target=opencode`
  example, config location `~/.config/opencode/opencode.json`, note the disabled-default
  and how to enable (machine policy or project config).
- Modify: `docs-astro/src/content/docs/04-mcp-registry.md`, `07-per-project-config.md`
  (project surface: `<project>/opencode.json`), `02-how-apply-works.md`.
- Modify: `docs/presentations/harness-cards-seminar.md` (+ `.html`) — "mcp → Cursor, OpenCode".
- Modify: `CHANGELOG.md` — feature entry.

Run: `bun test ./test/` (docs lint/link checks ride the suite; `lychee.toml` exists for
link checking) → commit `docs: describe the opencode target`.

---

## Part G — Hardening

### Task G1: Stale/partial config safety

**Files:**
- Test: `test/core-config.test.ts`

**Step 1:** Failing test: build a config file whose `targets` map lacks `opencode`
(simulating any stale full-config copy) and assert `descriptorsFor(config)` and a
project-scope `drwn write --json` complete without throwing (opencode simply absent from
selection). Key call sites already use optional chaining (`targets.ts:57`); this test
pins that no new code regresses it.

**Step 2:** If anything throws, guard the specific access (`targets[name]?.enabled`
pattern) — smallest change only. Run → PASS → commit
`test(config): tolerate target maps without opencode`.

### Task G2: Full-suite + release gate

**Steps:**
1. `bun test ./test/` — Expected: PASS, zero unrelated warnings in output.
2. `bun run scripts/verify-release-readiness.ts` (check `package.json` for the exact
   script name) — Expected: PASS.
3. Review `git log --oneline` for the commit series; every commit must build and test
   green independently.

---

## Execution order & dependencies

A1 → A2 → B1 → B2 → C1 → C2 → C3 → D1 → D2 → E1 → E2 → F1-F4 (any order) → G1 → G2.
Parts A-C are pure additions; D is the first behavior-visible change; E-F depend on D
only for fixtures. ~20 bite-sized tasks.

## Out of scope (Phase 2+ — do not build now)

- Skills projection to `.opencode/skills/` and the `opencode-only` scope (design 122 D6;
  blocked on the duplicate-discovery verification V3).
- The opencode plugin hook runtime (design 122 D7; blocked on V4).
- `AGENTS.md` instructions (design 122 D8; blocked on the spine decision, analyses 100/101).
- OAuth config emission and `tools` block management (YAGNI per design 122 D3/D5).
- Flipping the packaged default to `enabled: true` (product decision after adoption).

## Verification items to close before release (manual, from design 122 §7)

- V2 (opencode half): confirm same-ID project/global merge is wholesale project-wins on a
  real OpenCode install; correct the E2 message if not.
- V5: confirm `opencode.json` vs `opencode.jsonc` precedence; adjust the D2 warning text
  if OpenCode documents a rule.
- Smoke test on a real OpenCode install: enable the target, `drwn write`, run
  `opencode mcp list`, confirm the managed server appears and starts.
