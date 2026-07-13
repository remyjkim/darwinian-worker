# ABOUTME: Completion evidence for Task 83's target-native ambient MCP collision policy.
# ABOUTME: Records implementation commits, target semantics, security boundaries, and verification results.

# Task 83 Completion: Ambient Capability Policy

**Status:** Completed
**Completed:** 2026-07-13
**Plan:** `.ai/tasks/83_drwn-ambient-capability-policy-plan.md`
**Implementation branch:** `feat/task-83-ambient-mcp-policy`
**Execution model:** Primary checkout only; no isolated worktree

---

## Outcome

Task 83 replaces Task 77's temporary diagnostic-only ambient MCP reporting with
one shared target-native policy:

- project declarations remain separate from ambient user-home target state;
- identical same-ID entries are informational;
- Claude whole-entry shadowing is warning-only;
- Codex field augmentation is warning-only, while an effective table containing
  both `command` and `url` is fatal with `CODEX_INCOMPATIBLE_TRANSPORTS`;
- Cursor inheritance and transport changes are warning-only;
- only enabled targets selected for an MCP-mutating write can block it;
- standard, MCP-only, and dry-run commands preflight before projection mutation;
- skills-only writes report MCP collisions without blocking skill projection;
- `--force` cannot bypass target validity, and no `--force-owned` option was
  introduced;
- status, doctor, MCP list, and write consume the same classified state.

The policy does not install MCP executables, authenticate services, resolve
secrets, or test server startup. OAuth, API keys, environment availability,
timeouts, and initialize handshakes remain operator/runtime readiness concerns.

## Implementation Commits

| Commit | Scope |
|---|---|
| `f26b29c` | Pin Claude, Codex, and Cursor collision semantics with isolated characterization tests |
| `05176f2` | Add adapter-owned normalization, redacted classification, and stable reason codes |
| `f84c4ff` | Run selected-target MCP preflight before every projection mutation |
| `0d12ad0` | Report shared ambient dispositions through status, doctor, and MCP list |
| `c229df2` | Publish the policy and add a release-readiness gate |

## Target Evidence

The implementation decision was checked against vendor documentation and pinned
local characterization baselines on 2026-07-13:

- Claude scope precedence and whole-entry selection:
  `https://code.claude.com/docs/en/mcp#scope-hierarchy-and-precedence`;
- Codex configuration precedence and MCP transport fields:
  `https://developers.openai.com/codex/config-basic` and
  `https://developers.openai.com/codex/config-reference`;
- Cursor global and project configuration surfaces:
  `https://docs.cursor.com/context/model-context-protocol#configuration-locations`.

Local versions were Codex CLI `0.144.1`, Claude Code `2.1.193`, Cursor Agent
`2026.07.09-a3815c0`, and Cursor `3.10.20`. Cursor does not publish a definitive
duplicate-ID merge contract, so its behavior remains characterization-tested
and non-fatal rather than treated as a stable vendor guarantee.

Tests use deterministic fixture files and isolated homes. They do not start real
MCP servers, access credentials, or make network access a CI requirement.

## Atomicity and Security

The effective-state planner renders target-native entries in memory, inspects
ambient definitions, and classifies every collision before synchronization.
One selected fatal collision aborts all project projection surfaces, including
git hygiene, vendor reconciliation, generated Worker content, skills, MCP files,
hooks, and write records.

Project-intent mutations preserve Task 77 semantics: `use` may first commit a
valid Worker selection transaction, but a subsequent fatal projection changes
no projection-owned path and reports that the intent remains committed.

Public diagnostics contain only target, server ID, disposition, reason code,
source kind, source path, transport, and remediation. Normalized definitions,
command arguments, URLs, headers, environment values, bearer tokens, and
resolved secrets remain private. Malformed ambient-file diagnostics also omit
file contents.

## Verification Evidence

TDD was used throughout: characterization, classifier, preflight, diagnostics,
and release-gate tests were observed failing before their implementations.

Focused verification included:

- classifier and write preflight: 80 pass, 0 fail across 7 files;
- status, doctor, and MCP list: 35 pass, 0 fail;
- release-readiness policy gate: 6 pass, 0 fail;
- TypeScript typecheck after each implementation increment.

Final verification from commit `c229df2`:

```text
bun test
1425 pass
5 skip
0 fail
5489 expect() calls
1430 tests across 268 files
```

Additional gates:

- `bun run typecheck`: pass;
- `bun run docs:build`: optimized production build pass;
- `bun run verify:release --json`: `ok:true`, no warnings, all 10 checks pass;
- ambient release gate covers stable codes, redaction, selected-target behavior,
  full-command atomicity, non-bypassable force, and removal of the old Codex
  skip/force path;
- `git diff --check`: pass.

The five skips are unchanged environment-gated tests: Windows DPAPI, three live
BeginningDB contracts/journeys, and live `dm-card-base` catalog collaboration.
No Task 83 behavior is skipped.

## Acceptance Status

All Task 83 completion gates are satisfied. The target-native policy is enforced
at write time, diagnostics are redacted and consistent, project/machine state
remain separate, and runtime authentication failures remain correctly outside
the collision classifier.
