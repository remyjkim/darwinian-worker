# Cowork Host CLI Bridge MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `drwn-command-bridge/`, a standalone stdio MCP server that lets Claude Cowork request a bounded, allowlisted, consent-gated, audited set of host CLI commands.

**Architecture:** Keep the bridge as a standalone package inside this repo. The request pipeline is schema validation -> argv parse -> audit attempt record -> policy/path decision -> consent gate when required -> sandboxed argv spawn -> audit outcome. Every control fails closed; no shell is used unless policy explicitly allows shell mode and consent approves it.

**Tech Stack:** TypeScript, Node runtime bundle built by Bun, `bun:test`, `@modelcontextprotocol/sdk@^1.29.0`, `zod@^4`, `yaml`, `ulid`, Node `child_process.spawn`.

---

## Task Metadata

**Status**: v0.1.0 published and opt-in distribution complete; Windows/Linux native parity pending
**Created**: 2026-07-07
**Updated**: 2026-07-12
**Assigned**: Claude + Remy
**Priority**: High
**Estimated Effort**: 6-9 days, macOS-green first, then Windows/Linux parity on native hosts
**Dependencies**: none at repo level; new standalone package inside the repo
**References**: `.ai/analyses/102_cowork_addon_cli_mcp_design.md`, `.ai/analyses/79_cowork_management_guide.md`, `.ai/analyses/80_drwn-cowork-target-investigation.md`, `cli/core/process.ts`, `cli/core/confirm.ts`, `cli/core/mcp.ts`, `registry/mcp-servers.json`, `registry/config.json`, `.ai/rules/02_tdd_practices.md`, `.ai/rules/06_task_planning.md`, `@modelcontextprotocol/sdk` docs.

## Decisions Locked

| # | Decision | Choice |
|---|---|---|
| D1 | Packaging / runtime | Node-runnable npm package. Develop in TypeScript, test with `bun:test`, build `dist/index.js` with `bun build --target=node`. `dist/` is not committed because repo `.gitignore` ignores it; the npm tarball includes it via `prepack` + `files`. |
| D2 | Platform scope for v1 | macOS + Windows + Linux interfaces and code paths in v1. macOS must be green in this repo before non-macOS work. Windows/Linux tasks can only be marked complete after native-host validation. |
| D3 | Security controls in v1 | Implement all mandatory controls from analysis 102 section 6: default-deny policy, denylist-first evaluation, no elevation, consent above threshold, minimal env, path confinement, argv spawn, timeout/output caps, OS sandbox where platform support exists, and hash-chained audit. |
| D4 | Distribution | Publish only after the package is green and the native macOS gate passes. Add registry/card references only after that exact package version is available on npm. |
| D5 | Audit path | Default audit file is `~/.drwn-command-bridge/audit.jsonl`, created mode `600`, outside `roots_allow`. Override via `--audit <path>` only if the override resolves outside `roots_allow`. |
| D6 | Consent TTL | Default TTL cache is disabled (`0`). Operator can enable with policy `consent_cache_ttl_ms`, max 300000. Cache key is command class + resolved argv prefix + cwd root, never raw request-provided approval. |
| D7 | Hot reload | Enabled by default after first valid startup load. Invalid reload keeps the prior valid policy and logs to stderr. Missing/invalid startup policy refuses to start. |
| D8 | npm name | `drwn-command-bridge` returned npm 404 again on 2026-07-12. Use unscoped `drwn-command-bridge` unless publishing fails; if it fails, switch every registry/card/package reference to the chosen scoped package in one commit. |

## Target State

A reviewer can clone the repo, run the package test/build flow, register the built server in Claude Desktop or through `drwn`, and observe:

- Allowlisted low-risk commands such as `git status` execute without a prompt and return structured output.
- Medium/high-risk commands require a host-side native approval channel the agent cannot drive.
- Denied, non-allowlisted, malformed command strings, path escapes, and consent-denied requests never spawn a child process.
- Every schema-valid tool invocation writes an audit attempt record. All allowed, denied, consent-denied, timed-out, and failed-spawn outcomes append a hash-chained outcome record.
- Malformed JSON-RPC or schema-invalid calls rejected by the SDK may not reach the handler; these are the only attempts not represented in `audit.jsonl`.
- Corrupt startup policy, unwritable audit path, unavailable required consent channel, unavailable required sandbox, and unknown command all fail closed.
- Only JSON-RPC is written to stdout. Diagnostics go to stderr; audit goes to file.

## Success Criteria

- [x] `execute_command` and `list_allowed_commands` are exposed over stdio with Zod-validated input/output.
- [x] `execute_command` uses the pipeline in "Authoritative Pipeline" below.
- [x] Policy engine is a pure function `(request, policy) -> decision`, table-driven tested, and denylist-first.
- [x] `sudo`, `doas`, `runas`, `pkexec`, setuid escalation patterns, shell operators, credential paths, traversal, and VM-internal paths are rejected before spawn.
- [x] Argv execution is default. `shell: true` is separately allowlisted, absolute-shell-pinned, consent-forced, and high risk.
- [x] Request env never spreads `process.env`; only curated base env and policy-allowlisted request keys are passed.
- [x] `cwd`, path-like args, and allowed executable path overrides resolve inside allowed roots after symlink resolution.
- [x] Timeout default is 30000 ms, hard max 300000 ms. Each stream is capped at 1 MiB with visible truncation markers.
- [x] Audit log writes attempt before any spawn and outcome after every terminal state.
- [x] Hash-chain verification detects edited, deleted, or reordered audit lines.
- [ ] macOS sandbox wrapper is tested on macOS. Windows/Linux wrappers have native tests plus guarded skip-with-gap tests on non-native hosts.
- [x] Registry/card distribution is opt-in and tested through existing MCP rendering paths.
- [x] `cd drwn-command-bridge && bun test`, `cd drwn-command-bridge && bun run typecheck`, `cd drwn-command-bridge && bun run build`, and `cd drwn-command-bridge && npm pack --dry-run` pass.

## Strategies Considered

### Strategy A - Add a `drwn command-bridge serve` subcommand

Pros: reuses existing CLI dependency tree and process helper shape.

Cons: couples a boundary-breaching security tool to the general CLI attack surface and release cadence; `cli/core/confirm.ts` is TTY-only and cannot serve Claude Desktop; MCP SDK dependency would land on every `drwn` user.

### Strategy B - Standalone `drwn-command-bridge/` package inside the repo (chosen)

Pros: independently auditable and installable; keeps MCP SDK dependency isolated; allows package-specific tests, README, policy example, and npm tarball validation; matches the "smallest hole" principle in analysis 102.

Cons: duplicates some spawn/timeout shape from `cli/core/process.ts`.

**Chosen:** Strategy B. Reuse repo patterns, not runtime imports, for the security-sensitive package.

## Authoritative Pipeline

The handler order below is load-bearing. Do not change it without updating tests first.

```ts
async function handleExecute(input) {
  // [1] SDK + zod schema validation has already accepted input.
  const parsedCommand = parseCommandString(input.command); // no shell expansion
  const auditId = await audit.beginAttempt({
    rawCommand: input.command,
    parsedArgv: parsedCommand.ok ? parsedCommand.argv : undefined,
    cwd: input.cwd,
    envKeys: Object.keys(input.env ?? {}),
    reason: input.reason,
    shell: input.shell === true,
  }); // if this throws, return fail-closed error and do not spawn

  if (!parsedCommand.ok) {
    await audit.finish(auditId, deniedOutcome("invalid_command_syntax", parsedCommand.reason));
    return toolError("invalid command syntax", auditId);
  }

  const cwd = resolveCwdWithinRoots(input.cwd, policy);
  const request = toPolicyRequest(input, parsedCommand.argv, cwd);
  const decision = decide(request, policy); // denylist -> allowlist -> risk -> path rules

  if (decision.kind === "deny") {
    await audit.finish(auditId, deniedOutcome("policy_denied", decision.reason));
    return toolError(`${decision.reason}; call list_allowed_commands`, auditId);
  }

  if (decision.kind === "consent" || input.shell === true) {
    const ok = await consent.request(consentReq(input, cwd, decision, auditId)).catch(() => false);
    if (!ok) {
      await audit.finish(auditId, deniedOutcome("consent_denied", "consent denied or unavailable"));
      return toolError("consent denied or unavailable", auditId);
    }
  }

  const env = buildEnv(input.env ?? {}, policy, process.platform);
  const sandbox = sandboxProfileFor(process.platform, policy);
  const result = await executor.run({
    argv: decision.resolvedArgv,
    cwd,
    env,
    timeoutMs: input.timeout ?? 30000,
    shell: input.shell === true,
    sandbox,
  });

  await audit.finish(auditId, postExecOutcome(result));
  return okResult({ ...result, decision: decision.kind === "auto" ? "auto" : "consented", auditId });
}
```

## Component Contracts

### Schema

`inputSchema` and `outputSchema` passed to SDK `registerTool` are raw Zod shapes. Export `z.object(...)` wrappers for local parsing/tests.

```ts
export const executeInputShape = {
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout: z.number().int().positive().max(300000).optional(),
  env: z.record(z.string(), z.string()).optional(),
  reason: z.string().max(2000).optional(),
  shell: z.boolean().optional(),
};

export const executeOutputShape = {
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  timedOut: z.boolean(),
  truncated: z.object({ stdout: z.boolean(), stderr: z.boolean() }),
  decision: z.enum(["auto", "consented"]),
  auditId: z.string(),
};
```

### Command Parsing

Create `src/argv.ts`. Do not use a shell to parse. Implement a small parser with these semantics and tests:

- Split on unquoted ASCII whitespace.
- Support single quotes, double quotes, and backslash escaping only to preserve literal characters.
- No variable expansion, glob expansion, command substitution, pipes, redirects, or statement separators.
- Unmatched quote or dangling escape returns `{ ok:false, reason }`.
- Shell metacharacters that remain in tokens are inert for spawn, but denylist/policy tests still reject dangerous patterns before allowlist.

### Policy

Policy requests use parsed argv, not raw command strings.

```ts
export interface PolicyRequest {
  rawCommand: string;
  argv: string[];
  cwd: string;
  shell: boolean;
  envKeys: string[];
}

export type Decision =
  | { kind: "deny"; reason: string; matchedRule: string }
  | { kind: "auto"; risk: Risk; matchedRule: string; resolvedArgv: string[] }
  | { kind: "consent"; risk: Risk; matchedRule: string; resolvedArgv: string[] };
```

Policy schema:

```yaml
version: 1
default: deny
allow:
  - program: git
    args_allow: ["status", "log", "diff", "add", "commit", "push", "pull", "fetch"]
    risk: low
    path_args:
      all_slashy: true
  - program: dotnet
    args_allow: ["build", "test", "restore", "run"]
    risk: medium
    path_args:
      all_slashy: true
  - program: make
    risk: medium
deny_always:
  - pattern: "\\bsudo\\b"
  - pattern: "\\b(doas|runas|pkexec)\\b"
  - pattern: "\\brm\\s+-rf\\s+/"
  - pattern: "(~|/)\\.(ssh|aws|gnupg)\\b"
  - pattern: "[;&|`]"
consent_required_above: low
consent_cache_ttl_ms: 0
env_allow: []
roots_allow:
  - "~/projects"
sandbox:
  required: true
```

Executable rules:

- A bare program name must match an allow rule by exact basename.
- A program token containing `/` or `\` is denied unless the matching allow rule has `program_path` with an absolute path whose realpath is inside `roots_allow`.
- Elevation programs are non-allowlistable even if listed in `allow`.

Path arg rules:

- `cwd` always realpath-resolves inside `roots_allow`.
- By default, any non-program argv token containing `/` or `\`, starting `~`, starting `.`, or matching a Windows absolute path is path-like and must realpath inside `roots_allow`.
- URL-like args are denied unless a rule explicitly sets `allow_url_args: true`; that rule must be `risk: high`.
- VM-internal Cowork paths beginning `/sessions/` are always denied with a path-translation error.

### Consent

`ConsentGate.request()` must return true only from a channel outside the request payload.

- macOS: `osascript` native dialog with Approve/Deny buttons. Missing `osascript` or non-zero/timeout means denied.
- Windows: PowerShell UI prompt returning explicit Yes/No. If no desktop approval channel exists, throw `ConsentChannelUnavailable`.
- Linux: `zenity --question` then `kdialog --yesno`. `notify-send` is not an approval channel and must not be used to approve. If neither exists, throw.

### Audit

Use `audit.beginAttempt()` and `audit.finish()` rather than old `pre/post` naming so denied requests are represented.

Each JSONL line includes: `recordType`, `auditId`, `timestamp`, `sequence`, `prevHash`, `hash`, and a payload. Hash is `sha256(canonicalJson(recordWithoutHash))`.

Attempt payload includes raw command, parsed argv if available, cwd input, env keys only, reason, and shell flag.

Outcome payload includes one of: `policy_denied`, `invalid_command_syntax`, `path_denied`, `consent_denied`, `spawn_error`, `completed`, `timed_out`.

### Executor

Use `spawn(program, args, { shell:false })` for default mode. In shell mode, resolve the absolute shell path through `exec/shell.ts`, force consent, and spawn only the pinned shell with controlled args.

Output caps are per stream at 1048576 bytes. On overflow, stop buffering additional data for that stream, set `truncated.<stream> = true`, and append `[stdout truncated at 1MB]` or `[stderr truncated at 1MB]`.

Exit contract:

- Timeout: kill process group when possible, return `exitCode:null`, `timedOut:true`.
- Spawn error: no shell fallback; return structured tool error and audit `spawn_error`.

### Environment

Never spread `process.env`.

Base env by platform:

- macOS/Linux: `PATH`, `HOME`, `LANG`, `LC_ALL`, `TMPDIR` when present. `PATH` defaults to `/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin` if absent.
- Windows: `Path`, `SystemRoot`, `WINDIR`, `TEMP`, `TMP`, `PATHEXT`, `COMSPEC` when present.

Request env overlay only includes keys listed in policy `env_allow`. Denied env keys are logged as env keys only and rejected before spawn if policy says strict env; v1 policy is strict.

### Sandbox

`sandbox.required: true` means unavailable sandbox wrapper denies execution for commands that would spawn. Tests may set `sandbox.required: false` only in fixture policies named `no-sandbox-test-only`.

- macOS wrapper: `sandbox-exec` profile denying reads under `~/.ssh`, `~/.aws`, `~/.gnupg`, and writes outside `cwd` plus configured temp dirs. If `sandbox-exec` missing, deny when required.
- Linux wrapper: `bwrap`-based profile with readonly system binds, writable cwd/tmp binds, credential path denial by omission. If `bwrap` missing, deny when required.
- Windows wrapper: implement a `SandboxProfile` adapter that uses a restricted-token/job-object helper path. If native support is not available yet, the Windows implementation must return `unsupported` and deny when required; do not silently run unsandboxed.

## Directory Layout

```text
drwn-command-bridge/
  package.json
  tsconfig.json
  README.md
  bridge.policy.example.yaml
  src/
    index.ts
    server.ts
    schema.ts
    argv.ts
    policy/
      load.ts
      engine.ts
      classify.ts
      paths.ts
    consent/
      gate.ts
      macos.ts
      windows.ts
      linux.ts
    exec/
      executor.ts
      env.ts
      shell.ts
      sandbox/
        profile.ts
        macos.ts
        linux.ts
        windows.ts
    audit/
      log.ts
      record.ts
  test/
    argv.test.ts
    schema.test.ts
    policy-load.test.ts
    policy-engine.test.ts
    policy-denylist.test.ts
    policy-paths.test.ts
    env.test.ts
    executor.test.ts
    consent-gate.test.ts
    audit.test.ts
    server-integration.test.ts
    failclosed.test.ts
    shell-resolution.test.ts
    package.test.ts
    fixtures/
      policies/
      fake-consent.ts
```

## Execution Plan

Execute tasks in order. For each task: write the failing test, run only that test and verify the expected failure, implement the minimal code, run the task test, then run the package suite when the task touches shared behavior. Commit after each task or tight group if working in a dedicated branch.

Every new TypeScript source or test file starts with two `// ABOUTME:` lines matching the repo convention.

### Task 0: Package Scaffold And Build Contract

**Files:**
- Create: `drwn-command-bridge/package.json`
- Create: `drwn-command-bridge/tsconfig.json`
- Create: `drwn-command-bridge/src/index.ts`
- Create: `drwn-command-bridge/src/server.ts`
- Create: `drwn-command-bridge/test/package.test.ts`
- Modify: none outside `drwn-command-bridge/`

**Step 1: Write failing package tests**

In `drwn-command-bridge/test/package.test.ts`, assert:
- `package.json` has `name: "drwn-command-bridge"`, `type: "module"`, `bin.drwn-command-bridge: "dist/index.js"`.
- scripts include `build`, `test`, `typecheck`, and `prepack`.
- `files` includes `dist`, `README.md`, and `bridge.policy.example.yaml`.

Run: `cd drwn-command-bridge && bun test test/package.test.ts`

Expected: FAIL because package files do not exist.

**Step 2: Add minimal package files**

`package.json` must include:

```json
{
  "name": "drwn-command-bridge",
  "version": "0.1.0",
  "type": "module",
  "bin": { "drwn-command-bridge": "dist/index.js" },
  "files": ["dist", "README.md", "bridge.policy.example.yaml"],
  "scripts": {
    "build": "bun build src/index.ts --target=node --outfile dist/index.js --banner \"#!/usr/bin/env node\"",
    "prepack": "bun run build",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "ulid": "^3.0.2",
    "yaml": "^2.8.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/bun": "1.3.13",
    "typescript": "^6.0.3"
  }
}
```

`tsconfig.json` extends `../tsconfig.json`, overrides `include` to `["src/**/*.ts", "test/**/*.ts"]`, and keeps `noEmit: true`. Do not add `drwn-command-bridge/**/*.ts` to root `tsconfig.json`; package typecheck stays isolated.

`src/index.ts` and `src/server.ts` can be minimal placeholders with ABOUTME headers.

**Step 3: Verify**

Run:
- `cd drwn-command-bridge && bun test test/package.test.ts`
- `cd drwn-command-bridge && bun run typecheck`
- `cd drwn-command-bridge && bun run build`
- `cd drwn-command-bridge && npm pack --dry-run`

Expected: tests/typecheck/build pass; dry-run output includes `dist/index.js`.

**Step 4: Commit**

```bash
git add drwn-command-bridge/package.json drwn-command-bridge/tsconfig.json drwn-command-bridge/src/index.ts drwn-command-bridge/src/server.ts drwn-command-bridge/test/package.test.ts
git commit -m "feat: scaffold drwn command bridge package"
```

### Task 1: Schema And Argv Parser

**Files:**
- Create: `drwn-command-bridge/src/schema.ts`
- Create: `drwn-command-bridge/src/argv.ts`
- Create: `drwn-command-bridge/test/schema.test.ts`
- Create: `drwn-command-bridge/test/argv.test.ts`

**Step 1: Write failing tests**

Test schema defaults and rejects invalid timeout/env/reason. Test argv parsing for:
- `git status` -> `["git", "status"]`
- `git commit -m "hello world"` -> `["git", "commit", "-m", "hello world"]`
- `echo 'a b'` -> `["echo", "a b"]`
- `echo hi; rm x` -> `["echo", "hi;", "rm", "x"]`
- unmatched quotes fail.

Run: `cd drwn-command-bridge && bun test test/schema.test.ts test/argv.test.ts`

Expected: FAIL because modules do not exist.

**Step 2: Implement minimal schema and parser**

Implement `executeInputShape`, `executeOutputShape`, `listAllowedOutputShape`, `parseCommandString()`, and `parseCommandStringOrThrow()`.

**Step 3: Verify**

Run:
- `cd drwn-command-bridge && bun test test/schema.test.ts test/argv.test.ts`
- `cd drwn-command-bridge && bun run typecheck`

Expected: PASS.

**Step 4: Commit**

```bash
git add drwn-command-bridge/src/schema.ts drwn-command-bridge/src/argv.ts drwn-command-bridge/test/schema.test.ts drwn-command-bridge/test/argv.test.ts
git commit -m "feat: add bridge schemas and argv parser"
```

### Task 2: Policy Loading

**Files:**
- Create: `drwn-command-bridge/src/policy/load.ts`
- Create: `drwn-command-bridge/bridge.policy.example.yaml`
- Create: `drwn-command-bridge/test/policy-load.test.ts`
- Create: `drwn-command-bridge/test/fixtures/policies/good.yaml`
- Create: `drwn-command-bridge/test/fixtures/policies/malformed.yaml`

**Step 1: Write failing tests**

Assert valid YAML loads into a typed policy with expanded `~` roots. Assert malformed YAML, unsupported version, empty allowlist, invalid risk, invalid regex, and missing `roots_allow` throw.

Run: `cd drwn-command-bridge && bun test test/policy-load.test.ts`

Expected: FAIL because loader does not exist.

**Step 2: Implement loader**

Use `yaml` + `zod`. Compile deny regexes at load time. Normalize `consent_required_above`, `consent_cache_ttl_ms`, `env_allow`, and `sandbox.required`.

**Step 3: Verify**

Run:
- `cd drwn-command-bridge && bun test test/policy-load.test.ts`
- `cd drwn-command-bridge && bun run typecheck`

Expected: PASS.

**Step 4: Commit**

```bash
git add drwn-command-bridge/src/policy/load.ts drwn-command-bridge/bridge.policy.example.yaml drwn-command-bridge/test/policy-load.test.ts drwn-command-bridge/test/fixtures/policies
git commit -m "feat: load bridge policy fail closed"
```

### Task 3: Pure Policy Engine And Path Confinement

**Files:**
- Create: `drwn-command-bridge/src/policy/engine.ts`
- Create: `drwn-command-bridge/src/policy/classify.ts`
- Create: `drwn-command-bridge/src/policy/paths.ts`
- Create: `drwn-command-bridge/test/policy-engine.test.ts`
- Create: `drwn-command-bridge/test/policy-denylist.test.ts`
- Create: `drwn-command-bridge/test/policy-paths.test.ts`

**Step 1: Write failing tests**

Assert:
- `git status` -> auto.
- `dotnet build` -> consent.
- unknown program -> deny.
- denylist beats allowlist.
- `sudo`, `doas`, `runas`, `pkexec`, `rm -rf /`, `$(curl x)`, backticks, `;`, pipes, redirects, `~/.ssh`, `~/.aws`, and unicode whitespace evasions deny before spawn.
- cwd traversal and symlink escape deny.
- `/sessions/foo/mnt/project/file` denies with VM path message.

Run: `cd drwn-command-bridge && bun test test/policy-engine.test.ts test/policy-denylist.test.ts test/policy-paths.test.ts`

Expected: FAIL because policy modules do not exist.

**Step 2: Implement pure decision**

`decide()` must not read files, spawn, prompt, or audit. It consumes already-parsed argv and a loaded policy. Use `resolveCwdWithinRoots()` and `validatePathArgsWithinRoots()` outside `decide()` when filesystem realpaths are needed.

**Step 3: Verify**

Run:
- `cd drwn-command-bridge && bun test test/policy-engine.test.ts test/policy-denylist.test.ts test/policy-paths.test.ts`
- `cd drwn-command-bridge && bun run typecheck`

Expected: PASS.

**Step 4: Commit**

```bash
git add drwn-command-bridge/src/policy drwn-command-bridge/test/policy-engine.test.ts drwn-command-bridge/test/policy-denylist.test.ts drwn-command-bridge/test/policy-paths.test.ts
git commit -m "feat: add fail-closed policy engine"
```

### Task 4: Audit Logger And Hash Chain

**Files:**
- Create: `drwn-command-bridge/src/audit/record.ts`
- Create: `drwn-command-bridge/src/audit/log.ts`
- Create: `drwn-command-bridge/test/audit.test.ts`

**Step 1: Write failing tests**

Assert:
- `beginAttempt()` creates parent dir, creates file mode `600`, appends an attempt line, and returns ULID audit id.
- `finish()` appends an outcome line with same audit id.
- hash chain verifies across multiple records.
- editing a line makes verification fail.
- unwritable audit path throws.

Run: `cd drwn-command-bridge && bun test test/audit.test.ts`

Expected: FAIL because audit modules do not exist.

**Step 2: Implement audit**

Use `node:crypto` sha256, stable JSON stringification by sorted object keys, `node:fs/promises` append. Re-read last record hash before append.

**Step 3: Verify**

Run:
- `cd drwn-command-bridge && bun test test/audit.test.ts`
- `cd drwn-command-bridge && bun run typecheck`

Expected: PASS.

**Step 4: Commit**

```bash
git add drwn-command-bridge/src/audit drwn-command-bridge/test/audit.test.ts
git commit -m "feat: add hash chained audit log"
```

### Task 5: Environment Builder And Executor

**Files:**
- Create: `drwn-command-bridge/src/exec/env.ts`
- Create: `drwn-command-bridge/src/exec/executor.ts`
- Create: `drwn-command-bridge/test/env.test.ts`
- Create: `drwn-command-bridge/test/executor.test.ts`

**Step 1: Write failing tests**

Assert:
- parent `SECRET_TOKEN` is absent in child.
- policy-allowlisted env key is present.
- disallowed env key rejects before spawn.
- shell metacharacters are inert under argv execution.
- timeout kills and returns `exitCode:null`, `timedOut:true`.
- over-cap stdout/stderr set truncation flags and markers.
- spawn error returns structured failure, no shell fallback.

Run: `cd drwn-command-bridge && bun test test/env.test.ts test/executor.test.ts`

Expected: FAIL because modules do not exist.

**Step 2: Implement env and executor**

Use `child_process.spawn` with `shell:false`, `stdio: ["ignore", "pipe", "pipe"]`, timeout timer, and byte-counted stream buffers.

**Step 3: Verify**

Run:
- `cd drwn-command-bridge && bun test test/env.test.ts test/executor.test.ts`
- `cd drwn-command-bridge && bun run typecheck`

Expected: PASS.

**Step 4: Commit**

```bash
git add drwn-command-bridge/src/exec/env.ts drwn-command-bridge/src/exec/executor.ts drwn-command-bridge/test/env.test.ts drwn-command-bridge/test/executor.test.ts
git commit -m "feat: add restricted command executor"
```

### Task 6: Consent Gates

**Files:**
- Create: `drwn-command-bridge/src/consent/gate.ts`
- Create: `drwn-command-bridge/src/consent/macos.ts`
- Create: `drwn-command-bridge/src/consent/windows.ts`
- Create: `drwn-command-bridge/src/consent/linux.ts`
- Create: `drwn-command-bridge/test/consent-gate.test.ts`
- Create: `drwn-command-bridge/test/fixtures/fake-consent.ts`

**Step 1: Write failing tests**

Using a fake gate, assert:
- consent-required command cannot execute unless gate returns true.
- request payload cannot include approval.
- unavailable gate denies.
- TTL disabled by default.
- TTL cache only works when policy sets a positive TTL and expires.

Run: `cd drwn-command-bridge && bun test test/consent-gate.test.ts`

Expected: FAIL because consent modules do not exist.

**Step 2: Implement gates**

Implement platform adapters and a shared `CachedConsentGate` wrapper. Platform adapters should be thin and testable through injected process runner functions.

**Step 3: Verify**

Run:
- `cd drwn-command-bridge && bun test test/consent-gate.test.ts`
- `cd drwn-command-bridge && bun run typecheck`

Expected: PASS.

**Step 4: Commit**

```bash
git add drwn-command-bridge/src/consent drwn-command-bridge/test/consent-gate.test.ts drwn-command-bridge/test/fixtures/fake-consent.ts
git commit -m "feat: add out-of-band consent gates"
```

### Task 7: Server Wiring And Audit Ordering

**Files:**
- Modify: `drwn-command-bridge/src/server.ts`
- Modify: `drwn-command-bridge/src/index.ts`
- Create: `drwn-command-bridge/test/server-integration.test.ts`

**Step 1: Write failing integration tests**

Use MCP SDK client/in-memory or stdio-linked transport to assert:
- `tools/list` includes exactly `execute_command` and `list_allowed_commands`.
- auto command returns structured output and audit id.
- policy-denied command returns `isError: true` and still writes audit attempt + outcome.
- invalid argv syntax writes audit attempt + outcome.
- consent-denied command writes audit attempt + consent outcome and does not spawn.
- no code path uses `console.log` in `src/`.

Run: `cd drwn-command-bridge && bun test test/server-integration.test.ts`

Expected: FAIL because server is placeholder.

**Step 2: Implement server factory**

Create a dependency-injected `createServer({ policyStore, audit, consent, executor, logger })`. Keep `index.ts` limited to CLI arg parsing, policy load, dependency construction, `StdioServerTransport`, and `server.connect()`.

**Step 3: Verify**

Run:
- `cd drwn-command-bridge && bun test test/server-integration.test.ts`
- `cd drwn-command-bridge && bun run typecheck`

Expected: PASS.

**Step 4: Commit**

```bash
git add drwn-command-bridge/src/server.ts drwn-command-bridge/src/index.ts drwn-command-bridge/test/server-integration.test.ts
git commit -m "feat: wire audited mcp command tools"
```

### Task 8: Fail-Closed Matrix And Hot Reload

**Files:**
- Create: `drwn-command-bridge/src/policy/store.ts`
- Create: `drwn-command-bridge/test/failclosed.test.ts`
- Modify: `drwn-command-bridge/src/index.ts`
- Modify: `drwn-command-bridge/src/server.ts`

**Step 1: Write failing tests**

Assert:
- missing startup policy refuses to start.
- invalid startup policy refuses to start.
- valid hot reload swaps policy atomically.
- invalid hot reload keeps prior policy and logs to stderr.
- audit unwritable denies before spawn.
- consent unavailable denies before spawn.
- sandbox required/unavailable denies before spawn.
- timeout and output cap return structured results, not tool errors.

Run: `cd drwn-command-bridge && bun test test/failclosed.test.ts`

Expected: FAIL because policy store/fail-closed paths are incomplete.

**Step 2: Implement policy store and fail-closed errors**

Add typed `FailClosedError` codes. Ensure every catch either denies with audit outcome or refuses startup; never downgrades to allow.

**Step 3: Verify**

Run:
- `cd drwn-command-bridge && bun test test/failclosed.test.ts`
- `cd drwn-command-bridge && bun test`
- `cd drwn-command-bridge && bun run typecheck`

Expected: PASS.

**Step 4: Commit**

```bash
git add drwn-command-bridge/src/policy/store.ts drwn-command-bridge/src/index.ts drwn-command-bridge/src/server.ts drwn-command-bridge/test/failclosed.test.ts
git commit -m "feat: enforce fail-closed bridge controls"
```

### Task 9: Shell Resolution And Sandbox Profiles

**Files:**
- Create: `drwn-command-bridge/src/exec/shell.ts`
- Create: `drwn-command-bridge/src/exec/sandbox/profile.ts`
- Create: `drwn-command-bridge/src/exec/sandbox/macos.ts`
- Create: `drwn-command-bridge/src/exec/sandbox/linux.ts`
- Create: `drwn-command-bridge/src/exec/sandbox/windows.ts`
- Create: `drwn-command-bridge/test/shell-resolution.test.ts`
- Create: `drwn-command-bridge/test/sandbox.test.ts`

**Step 1: Write failing tests**

Assert:
- default execution never resolves a shell.
- `shell:true` is denied unless policy explicitly allows shell mode and consent approves.
- Windows shell resolution never returns `C:\Windows\System32\bash.exe`.
- Windows shell resolution returns known Git Bash path when injected as existing.
- macOS sandbox wrapper prefixes `sandbox-exec` when required and available.
- sandbox unavailable + required denies.
- non-native tests use explicit `test.skipIf(...)` with a coverage-gap message.

Run: `cd drwn-command-bridge && bun test test/shell-resolution.test.ts test/sandbox.test.ts`

Expected: FAIL because modules do not exist.

**Step 2: Implement shell/sandbox adapters**

Keep adapters dependency-injected for filesystem/process checks. Do not run unsandboxed when `sandbox.required` is true.

**Step 3: Verify on current host**

Run:
- `cd drwn-command-bridge && bun test test/shell-resolution.test.ts test/sandbox.test.ts`
- `cd drwn-command-bridge && bun run typecheck`

Expected on macOS: macOS tests pass; Windows/Linux native-only tests skip with explicit gap output.

**Step 4: Commit**

```bash
git add drwn-command-bridge/src/exec/shell.ts drwn-command-bridge/src/exec/sandbox drwn-command-bridge/test/shell-resolution.test.ts drwn-command-bridge/test/sandbox.test.ts
git commit -m "feat: add shell resolution and sandbox profiles"
```

### Task 10: README And Manual macOS Smoke

**Files:**
- Create: `drwn-command-bridge/README.md`
- Modify: `drwn-command-bridge/bridge.policy.example.yaml`

**Step 1: Write README checklist before manual test**

README must include:
- threat model summary.
- egress-gap warning.
- policy authoring guide.
- audit path/defaults.
- macOS/Windows/Linux config snippets.
- local dev snippet using `node /abs/path/drwn-command-bridge/dist/index.js`.
- published snippet using `npx -y drwn-command-bridge --policy /abs/path/bridge.policy.yaml`.
- platform validation matrix and gaps.

**Step 2: Build and smoke locally**

Run:
- `cd drwn-command-bridge && bun run build`
- `node drwn-command-bridge/dist/index.js --policy drwn-command-bridge/bridge.policy.example.yaml --help`

Expected: build passes; help writes to stderr/stdout only as intended for CLI mode, not during MCP serve mode.

**Step 3: Manual Claude Desktop smoke on macOS**

Register direct `node` path with a temporary policy rooted to this repo. Verify:
- `git status` auto-runs.
- medium-risk fixture command prompts.
- deny command is blocked.
- `~/.drwn-command-bridge/audit.jsonl` has attempt/outcome records.

Record results in README platform matrix or a dated note in this task file if manual test cannot be run.

**Step 4: Commit**

```bash
git add drwn-command-bridge/README.md drwn-command-bridge/bridge.policy.example.yaml
git commit -m "docs: document drwn command bridge bridge operation"
```

### Task 11: Registry And drwn Card Source

> **Distribution sequencing update (2026-07-12):** Run this task only after the
> bridge implementation is merged, the native macOS smoke is recorded, and
> `drwn-command-bridge@0.1.0` is published and readable from npm. Until then,
> local use must invoke the built `dist/index.js` path directly.

**Files:**
- Modify: `registry/mcp-servers.json`
- Modify: `registry/config.json`
- Create or modify tests in `test/sync-mcp.test.ts`
- Create card source under the local drwn source store, then publish or commit according to current card-source conventions.

**Step 1: Write failing registry tests**

Add tests asserting:
- registry has `drwn-command-bridge` with a version-pinned stdio `npx` command and policy arg.
- `buildActiveServers()` excludes it by default because it is optional.
- `buildActiveServers()` includes it when `config.optional["drwn-command-bridge"] === true`.
- Claude/Codex/Cursor renderers preserve the policy env var argument correctly.

Run: `bun test test/sync-mcp.test.ts`

Expected: FAIL until registry/config are updated.

**Step 2: Update registry/config**

Add:

```json
"drwn-command-bridge": {
  "description": "Host CLI bridge for Claude Cowork - allowlisted, consent-gated, audited host command execution",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "drwn-command-bridge@^0.1.0", "--policy", "${DRWN_COMMAND_BRIDGE_POLICY}"],
  "optional": true
}
```

Add `"drwn-command-bridge": false` to `registry/config.json` `optional` for discoverability without default activation.

**Step 3: Author card source**

Use existing CLI, not manual shape guessing:

```bash
bun run cli/index.ts card new @darwinian/drwn-command-bridge --no-git
bun run cli/index.ts card source add-mcp @darwinian/drwn-command-bridge drwn-command-bridge
```

Add bundled usage skills only after reading current card-source conventions. Validate:

```bash
bun run cli/index.ts card source doctor @darwinian/drwn-command-bridge --json
```

Expected: JSON `ok: true`.

**Step 4: Verify**

Run:
- `bun test test/sync-mcp.test.ts`
- `bun run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add registry/mcp-servers.json registry/config.json test/sync-mcp.test.ts
git add <card-source-files>
git commit -m "feat: register drwn command bridge bridge"
```

### Task 12: Final Package Verification

**Files:**
- No planned source edits unless verification fails.

**Step 1: Run package gates**

```bash
cd drwn-command-bridge
bun test
bun run typecheck
bun run build
npm pack --dry-run
```

Expected:
- all tests pass.
- typecheck exits 0.
- build emits `dist/index.js`.
- npm dry-run includes `dist/index.js`, `README.md`, and `bridge.policy.example.yaml`.

**Step 2: Run repo gates**

```bash
bun test
bun run typecheck
```

Expected: repo tests/typecheck pass. If unrelated existing worktree changes fail the repo gate, capture the failure and determine whether it is related before modifying anything outside this task.

**Step 3: Commit verification-only fixes if needed**

Only commit if changes were required to make gates pass.

## Acceptance Criteria

- [ ] Every success criterion above is checked.
- [x] All task-specific tests pass.
- [x] `cd drwn-command-bridge && bun test` passes.
- [x] `cd drwn-command-bridge && bun run typecheck` passes.
- [x] `cd drwn-command-bridge && bun run build` emits a node-runnable `dist/index.js`.
- [x] `cd drwn-command-bridge && npm pack --dry-run` includes the runnable bundle.
- [x] Manual macOS end-to-end through Claude Desktop or equivalent MCP stdio client is recorded.
- [ ] Windows/Linux native validation is either complete or explicitly listed as a release blocker; do not mark v1 complete on skip-only coverage.
- [x] Registry entry is optional and opt-in tested.
- [x] drwn card source passes `card source doctor`.

## Implementation Evidence (2026-07-12)

- `bun run verify` passed: 94 tests across 17 files, typecheck, Node bundle build,
  and npm dry-run pack. The tarball contains exactly `LICENSE`, `README.md`,
  `bridge.policy.example.yaml`, `dist/index.js`, and `package.json`.
- `bun run smoke:macos` passed against the production Node bundle over real MCP
  stdio. It listed both tools, ran `node --version` through
  `/usr/bin/sandbox-exec`, denied `sudo whoami`, and verified four hash-chained
  audit records.
- `drwn-command-bridge@0.1.0` was published on 2026-07-12 and verified through
  public registry metadata plus an isolated global install and `--help` smoke.
- The packaged registry pins `drwn-command-bridge@^0.1.0`, keeps it disabled by
  default, and has opt-in/rendering coverage for Claude, Codex, and Cursor.
- `drwn card source doctor @darwinian/drwn-command-bridge --json` reports
  `ok: true`. No machine defaults were changed.
- Linux native `bwrap` validation and Windows native sandbox validation remain
  open and are intentionally unchecked; required unsupported sandbox paths fail closed.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Three-platform sandbox parity is large | Non-macOS paths may be under-verified | Native-host validation is required before marking Phase 9 complete for each platform. Unsupported required sandbox denies rather than runs unsandboxed. |
| Allowlisted tools can run scripts or access network | Residual host risk remains | Narrow args, consent above low risk, sandbox, egress warning, audit trail. |
| Consent fatigue | Operators over-approve | TTL disabled by default; max TTL 5 minutes; all consent decisions audited. |
| Local audit can be tampered with by host user | Tamper evidence is local only | Hash chain detects modification; external collector deferred as hardening, not v1. |
| `drwn-command-bridge` npm name changes before publish | Registry/card references break | Verify name at publish time; if unavailable, switch all references in one commit. |

## Non-Blocking Future Work

- External audit collector / OpenTelemetry export.
- Per-command network namespace or outbound firewall policy.
- Rich `list_policy_diagnostics` introspection tool, if the two-tool surface proves insufficient.
- Stronger Windows sandbox helper if restricted-token support requires native code.
