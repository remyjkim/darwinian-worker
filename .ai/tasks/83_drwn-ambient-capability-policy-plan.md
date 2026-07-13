# ABOUTME: Approved target-adapter-specific ambient MCP collision policy and implementation plan.
# ABOUTME: Builds on Task 77 diagnostic visibility and blocks only target-native invalid configurations.

# Task 83: Ambient Capability Policy Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans`, `test-driven-development`, `incremental-commits`, and `verification-before-completion`. Execute only after Task 77 has landed its effective-state and ambient-observation contracts.

**Status**: D2 approved 2026-07-13; execution-ready after Task 77

**Goal**: Classify user-home/project same-ID MCP definitions according to each downstream target's actual layering semantics, report every collision with provenance, and block only selected-target configurations that would be invalid.

**Architecture**: Task 77 remains the authority for declared project state and diagnostic ambient observations. Task 83 adds adapter-owned normalization and classification, then runs a read-only selected-target preflight before any project mutation. There is no generic cross-target equality gate and ambient definitions never become project declarations.

**Dependencies**:

- Task 77 must land first because it creates `cli/core/ambient-capabilities.ts` and the status/doctor ambient schema.
- Task 80 may change machine intent and projection commands, but it must preserve the canonical user-home target surfaces and consume this policy rather than creating a second collision evaluator.
- Task 79 is independent. Task 83 does not restore or depend on Store export.

---

## 0. Approved D2 Decision Record

**Decision**: Use target-native enforcement. Identical definitions are informational, target-supported differences are warnings, and only a Codex effective definition containing incompatible transport fields is fatal.

**Rejected alternatives**:

- Reject every non-identical same-ID definition. This would block intentional Claude and Cursor project overrides and make recommended machine capabilities brittle.
- Keep every collision diagnostic-only. This would knowingly allow Codex to produce an unloadable effective configuration.

### 0.1 Canonical surfaces and precedence

| Target | User-home ambient surface | Project declaration surface | Proven behavior |
|---|---|---|---|
| Claude | `~/.claude.json` user-scoped servers and project-keyed local-scoped servers | `<project>/.mcp.json` | Whole server entries are selected by scope; fields are not merged. Local scope wins over project scope, which wins over user scope. User-home local/user entries remain ambient observations outside this project's declared file. |
| Codex | `~/.codex/config.toml` | `<project>/.codex/config.toml` | Configuration tables merge by field. Project values override matching user fields and omitted fields inherit. A merged server containing both `command` and `url` is rejected. |
| Cursor | `~/.cursor/mcp.json` | `<project>/.cursor/mcp.json` | Current Cursor Agent inherits omitted fields across the two same-ID entries while a project-declared transport selects the effective transport. Cursor's public docs name both surfaces but do not specify duplicate-ID semantics, so this behavior stays characterization-tested and non-fatal. |

Path lookup must remain centralized in target/path descriptors. Policy code receives resolved paths and must not introduce a second set of hard-coded output paths.

### 0.2 Approved disposition matrix

| Target | Normalized definitions equal | Same transport, other fields differ | Transports differ |
|---|---|---|---|
| Claude | `identical` | `warning` | `warning` |
| Codex | `identical` | `warning` | `fatal` when the effective merged table contains both `command` and `url` |
| Cursor | `identical` | `warning` | `warning` |

Additional rules:

- A malformed selected target file is a pre-existing configuration error, not an ambient collision, and already blocks any write that cannot safely preserve it.
- Missing executables, OAuth requirements, missing environment variables, timeouts, and initialize failures are readiness diagnostics, not collision classifications.
- Reserved downstream server names and unsupported target fields remain adapter validation errors outside this matrix.

### 0.3 Normalization contract

Normalization compares target semantics, not source formatting:

- Parse with the target-native JSON or TOML parser before classification.
- Compare the adapter's planned post-write target entry, after target-specific rendering and in-memory ownership merge, rather than the raw canonical Registry/Card definition.
- Ignore object key order and source whitespace.
- Compare only entries with the same target-visible server ID.
- Preserve array order because command arguments, tool lists, and scope lists can be order-sensitive.
- Keep environment substitutions and secret references symbolic. Never resolve credentials merely to compare definitions.
- Diagnostics may expose server ID, transport, source kind, and source path, but never normalized definitions, definition hashes, headers, environment values, bearer tokens, or resolved secrets.
- Do not realpath commands or rewrite relative paths during comparison; those values can have scope-dependent runtime meaning.

Target normalization rules:

- **Claude**: normalize `streamable-http` to `http`; treat a command entry with omitted `type` as `stdio`; treat omitted `args`/`env` and empty `args`/`env` as equivalent where Claude does; compare the complete normalized server entry because scope selection is whole-entry replacement.
- **Codex**: normalize each layer separately, then compute the effective field-level merge in documented precedence order. Transport is `stdio` for `command` and `http` for `url`. Presence of both transport selectors in the effective table is `fatal` even if one source looked valid in isolation.
- **Cursor**: normalize JSON key order and supported transport aliases/defaults, preserve inherited fields for characterization, and classify a project transport change separately from same-transport field inheritance.

### 0.4 Stable reason codes

```ts
type AmbientDisposition = "identical" | "warning" | "fatal";

type AmbientReasonCode =
  | "AMBIENT_IDENTICAL"
  | "CLAUDE_SCOPE_SHADOW"
  | "CODEX_PROJECT_AUGMENTS_USER"
  | "CODEX_INCOMPATIBLE_TRANSPORTS"
  | "CURSOR_PROJECT_MERGES_USER"
  | "CURSOR_PROJECT_TRANSPORT_OVERRIDE";
```

`AMBIENT_IDENTICAL` is informational and does not contribute to warning or error counts. Reason codes are part of human and JSON diagnostics and must remain stable after release.

### 0.5 Enforcement and atomicity

- Preflight only targets selected by the effective target configuration and `--target`.
- Standard writes and MCP-only writes enforce fatal MCP collisions. Skills-only writes report them diagnostically but are not blocked because they do not mutate MCP surfaces.
- An unselected target never blocks a target-specific write.
- If any selected target reports `fatal`, the command performs zero mutations across all outputs, including git hygiene, Worker projection, vendor trees, skills, MCP files, generated files, and write records.
- Dry-run executes the same preflight, reports the same fatal result, performs no writes, and exits non-zero.
- Neither legacy `--force` nor the approved ownership-repair flag `--force-owned` may bypass a fatal collision. Ownership drift and target configuration validity are separate policies.
- Warnings require no confirmation or bypass flag.
- In a multi-target write, all selected targets are planned before any mutation. One fatal target aborts the complete selected-target transaction.
- This zero-mutation guarantee applies to the projection phase. A project mutation command such as `use` retains Task 77's transaction contract: valid project intent commits first, then a failed projection leaves that intent committed while changing no projection output.

---

## Task 1: Freeze Target Semantics with Characterization Tests

**Files:**

- Modify: `test/commands-write-codex-conflict.test.ts`
- Create: `test/commands-write-claude-conflict.test.ts`
- Create: `test/commands-write-cursor-conflict.test.ts`
- Modify: `test/sync-mcp.test.ts`

**Step 1: Add red characterization cases**

Cover at least:

- Claude identical user/project entries;
- Claude same-transport differences and cross-transport replacement, both non-fatal;
- Claude local/project/user precedence with `CLAUDE_SCOPE_SHADOW` provenance;
- Codex same-transport override with inherited timeout/auth fields;
- Codex user HTTP plus project stdio and user stdio plus project HTTP, both fatal;
- Cursor project fields inheriting omitted user fields;
- Cursor project transport selection over a different user transport, warning only;
- symbolic secret references that compare without exposing their values.

Fixtures must use isolated `homeDir` and project roots. They must not read or mutate the developer's real user-home target files.

**Step 2: Run the focused tests and confirm failure**

```bash
bun test test/commands-write-codex-conflict.test.ts test/commands-write-claude-conflict.test.ts test/commands-write-cursor-conflict.test.ts test/sync-mcp.test.ts
```

Expected: FAIL because Claude/Cursor have no approved classifier and current Codex behavior skips the entry or permits `--force` instead of failing the full command.

**Step 3: Record evidence in test names and comments**

Use these sources without making network access part of the test suite:

- Claude scope precedence and whole-entry replacement: `https://code.claude.com/docs/en/mcp#scope-hierarchy-and-precedence`
- Codex project/user precedence: `https://learn.chatgpt.com/docs/config-file/config-basic#configuration-precedence`
- Cursor global/project surfaces: `https://docs.cursor.com/context/model-context-protocol#configuration-locations`
- Local characterization baseline: Codex CLI `0.144.1`; Cursor Agent `2026.07.09-a3815c0`.

Downstream versions are evidence, not runtime minimum-version gates. CI tests deterministic local fixtures and never starts real MCP servers.

**Step 4: Commit the characterization tests**

```bash
git add test/commands-write-codex-conflict.test.ts test/commands-write-claude-conflict.test.ts test/commands-write-cursor-conflict.test.ts test/sync-mcp.test.ts
git commit -m "test(mcp): pin ambient target collision semantics"
```

---

## Task 2: Implement Adapter-Owned Normalization and Classification

**Files:**

- Modify: `cli/core/ambient-capabilities.ts`
- Create: `cli/core/ambient-policy.ts`
- Modify: `cli/core/mcp.ts`
- Create: `test/core-ambient-policy.test.ts`

**Step 1: Write pure classifier tests**

Assert the complete matrix, stable reason codes, provenance, secret redaction, malformed-input handoff, and deterministic ordering by target then server ID.

**Step 2: Run the pure tests and confirm failure**

```bash
bun test test/core-ambient-policy.test.ts
```

Expected: FAIL because `ambient-policy.ts` does not exist.

**Step 3: Implement the minimal classification contract**

```ts
interface AmbientDefinitionRef {
  source: "user" | "project" | "local";
  path: string;
  transport: "stdio" | "http" | "sse" | "ws" | "invalid";
}

interface AmbientCollision {
  target: "claude" | "codex" | "cursor";
  id: string;
  disposition: AmbientDisposition;
  reasonCode: AmbientReasonCode;
  declared: AmbientDefinitionRef;
  ambient: AmbientDefinitionRef;
  remediation: string | null;
}
```

Keep full normalized values private to the classifier. Return only redacted references and policy results. Each adapter owns its normalizer and classifier; shared code may provide canonical serialization, in-memory equality, and deterministic sorting but cannot assign a non-identical disposition.

Replace `detectCodexLayerConflicts` with, or route it through, the Codex classifier so there is one authority. Do not leave a second boolean conflict detector with different force behavior.

**Step 4: Run pure and characterization tests**

```bash
bun test test/core-ambient-policy.test.ts test/commands-write-codex-conflict.test.ts test/commands-write-claude-conflict.test.ts test/commands-write-cursor-conflict.test.ts test/sync-mcp.test.ts
bun run typecheck
```

Expected: classifier tests PASS; command tests may remain red until Task 3 wires preflight.

**Step 5: Commit the classifier**

```bash
git add cli/core/ambient-capabilities.ts cli/core/ambient-policy.ts cli/core/mcp.ts test/core-ambient-policy.test.ts
git commit -m "feat(mcp): classify ambient collisions per target"
```

---

## Task 3: Add Full Selected-Target Preflight

**Files:**

- Modify: `cli/core/effective-state.ts`
- Modify: `cli/core/sync.ts`
- Modify: `cli/commands/write.ts`
- Modify: `cli/commands/mcp/write.ts`
- Modify: `test/commands-write.test.ts`
- Modify: `test/commands-write-codex-conflict.test.ts`
- Modify: `test/commands-write-claude-conflict.test.ts`
- Modify: `test/commands-write-cursor-conflict.test.ts`
- Modify: `test/core-project-machine-isolation.test.ts`
- Modify: `test/commands-use-worker.test.ts`

**Step 1: Add atomicity and target-selection tests**

Assert:

- `--target claude` is not blocked by a fatal Codex collision;
- `--target codex` is blocked by that collision;
- an all-target write with fatal Codex performs zero mutations to every project and user-home path in the fixture;
- `--force` and `--force-owned` do not bypass the fatal;
- warning-only Claude/Cursor writes proceed;
- `--skills-only` is not blocked and does not touch MCP files;
- MCP-only and standard dry-runs return the fatal result without mutation;
- fatal preflight runs before gitignore, attributes, vendor, Worker, skill, generated, and write-record changes.
- `use` may commit valid selection intent first, but its subsequent fatal projection changes no projection-owned path and reports that intent remains committed.

**Step 2: Run the command tests and confirm failure**

```bash
bun test test/commands-write.test.ts test/commands-write-codex-conflict.test.ts test/commands-write-claude-conflict.test.ts test/commands-write-cursor-conflict.test.ts test/core-project-machine-isolation.test.ts test/commands-use-worker.test.ts
```

Expected: FAIL because current sync handles Codex conflicts inside the target write loop, after other mutations are possible, and gives force special meaning.

**Step 3: Build preflight into effective planning**

Compute selected-target collisions after declared project MCP state and ambient observations are known but before `syncRepository` performs any mutation. Render each selected target's planned post-write entry in memory first, including target transformations and the ownership-preserving merge that would be written. Return collisions as part of effective/planned state.

For an enforcing write mode, throw one structured command error containing every selected fatal collision. Do not fail on the first adapter because JSON and human output must show the complete selected-target problem set.

Delete the current behavior that silently removes conflicting Codex servers from `codexServers`, emits a skip warning, and allows `--force` to write through the collision.

**Step 4: Run command, isolation, and type tests**

```bash
bun test test/commands-write.test.ts test/commands-write-codex-conflict.test.ts test/commands-write-claude-conflict.test.ts test/commands-write-cursor-conflict.test.ts test/core-project-machine-isolation.test.ts test/commands-use-worker.test.ts
bun run typecheck
```

Expected: PASS.

**Step 5: Commit preflight**

```bash
git add cli/core/effective-state.ts cli/core/sync.ts cli/commands/write.ts cli/commands/mcp/write.ts test/commands-write.test.ts test/commands-write-codex-conflict.test.ts test/commands-write-claude-conflict.test.ts test/commands-write-cursor-conflict.test.ts test/core-project-machine-isolation.test.ts test/commands-use-worker.test.ts
git commit -m "feat(write): preflight target-native MCP collisions"
```

---

## Task 4: Align Status, Doctor, and JSON Diagnostics

**Files:**

- Modify: `cli/commands/status.ts`
- Modify: `cli/commands/doctor.ts`
- Modify: `cli/commands/mcp/list.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify: `test/commands-status.test.ts`
- Modify: `test/commands-doctor.test.ts`
- Modify: `test/commands-mcp.test.ts`

**Step 1: Add red diagnostic contract tests**

Extend Task 77's ambient block to:

```json
{
  "ambientCapabilities": {
    "enforcement": "target-native",
    "observations": [],
    "collisions": [
      {
        "target": "codex",
        "id": "notion",
        "disposition": "fatal",
        "reasonCode": "CODEX_INCOMPATIBLE_TRANSPORTS",
        "declared": {
          "source": "project",
          "path": "<project>/.codex/config.toml",
          "transport": "stdio"
        },
        "ambient": {
          "source": "user",
          "path": "~/.codex/config.toml",
          "transport": "http"
        },
        "remediation": "Rename one server ID or remove one of the conflicting transport definitions."
      }
    ]
  }
}
```

Use fixture-root-normalized paths in snapshots. Assert that headers, environment values, bearer tokens, and resolved secrets never appear in human or JSON output.

**Step 2: Run diagnostic tests and confirm failure**

```bash
bun test test/commands-status.test.ts test/commands-doctor.test.ts test/commands-mcp.test.ts
```

Expected: FAIL because Task 77 reports observations with `diagnostic-only` enforcement and no approved classifications.

**Step 3: Route all consumers through the shared policy result**

Status reports all targets. Doctor reports disposition-specific remediation and returns unhealthy for fatal effective configurations. MCP list shows concise same-ID provenance. None of these commands reparse or independently classify target files.

Authentication, executable availability, startup, and handshake checks remain separate readiness findings even when they concern the same server ID.

**Step 4: Verify and commit diagnostics**

```bash
bun test test/commands-status.test.ts test/commands-doctor.test.ts test/commands-mcp.test.ts
bun run typecheck
git add cli/commands/status.ts cli/commands/doctor.ts cli/commands/mcp/list.ts cli/core/diagnostics.ts test/commands-status.test.ts test/commands-doctor.test.ts test/commands-mcp.test.ts
git commit -m "feat(diagnostics): report ambient MCP dispositions"
```

---

## Task 5: Document Policy and Add Release Gates

**Files:**

- Modify: `docs/cli-quickref.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `scripts/verify-release-readiness.ts`
- Create: `test/release-readiness.test.ts`

**Step 1: Document the mental model**

State explicitly:

- machine MCP visibility is ambient and never part of declared project Worker state;
- project definitions can intentionally shadow or augment machine definitions according to the selected target;
- only Codex incompatible effective transport shapes block writes;
- force flags repair owned drift only and never waive target validity;
- remediation is rename, remove, or align one definition, not copy ambient state into the Worker.

**Step 2: Add release-readiness assertions**

Gate the stable reason codes, redaction tests, selected-target behavior, full-command atomicity, and removal of the old Codex skip/force path. Do not require Claude, Codex, Cursor, network access, or real MCP startup in release CI.

**Step 3: Run final verification**

```bash
bun run typecheck
bun test
bun run verify:release --json
```

Expected: all PASS and readiness JSON includes the ambient-policy gate.

**Step 4: Commit documentation and release gates**

```bash
git add docs/cli-quickref.md .ai/knowledges/02_per-project-config-guide.md scripts/verify-release-readiness.ts test/release-readiness.test.ts
git commit -m "docs(mcp): publish ambient collision policy"
```

---

## Completion Gates

- [ ] Task 77 effective-state and ambient-observation contracts are present.
- [ ] Claude, Codex, and Cursor characterization fixtures cover identical, same-transport difference, and transport difference.
- [ ] Only `CODEX_INCOMPATIBLE_TRANSPORTS` is collision-fatal.
- [ ] Fatality is limited to selected targets and MCP-mutating write modes.
- [ ] Multi-target fatal preflight proves zero mutation across the complete command.
- [ ] Projection triggered after a committed project-intent mutation preserves Task 77 transaction semantics while changing no projection output on fatal preflight.
- [ ] No force flag bypasses collision validity.
- [ ] Human and JSON diagnostics expose provenance without secret-bearing fields.
- [ ] Status, doctor, MCP list, and write consume one shared classification result.
- [ ] Full typecheck, test suite, and release-readiness verification pass.

Task 77's `diagnostic-only` behavior remains authoritative until every gate above is implemented. Approval of D2 authorizes Task 83 after Task 77; it does not authorize opportunistic implementation inside Task 77 or Task 79.
