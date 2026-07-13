# drwn-command-bridge

`drwn-command-bridge` is a default-deny MCP host bridge for running tightly allowlisted commands from a local AI client. The server audits every attempt, asks for out-of-band consent above the configured risk threshold, builds a minimal environment, and spawns commands without shell expansion unless shell mode is explicitly allowlisted.

## Threat Model

This bridge is for local developer automation where the AI client is not trusted to run arbitrary host commands. It defends against accidental or prompt-driven execution of unlisted tools, shell metacharacters, elevation programs, credential path reads, path traversal outside approved roots, missing audit storage, unavailable consent, and missing required sandbox support.

It does not make unsafe commands safe. Allowlisted programs can still perform broad work through their own subcommands or plugins. Keep allow rules narrow, prefer `args_allow`, use short consent cache windows, and review the audit log.

## Egress Gap

The bridge does not provide complete network egress control. macOS and Linux wrappers provide process/file confinement best efforts, but allowed tools may still reach the network unless the tool or operating system blocks it. Treat commands such as package managers, test runners, browsers, curl-like tools, and scripts as network-capable, require consent for them, and prefer separate host firewall rules for strict egress needs.

## Policy Authoring

Start from `bridge.policy.example.yaml` and save a machine-local copy:

```bash
cp bridge.policy.example.yaml /abs/path/bridge.policy.yaml
```

Key fields:

- `default: deny` is required.
- `allow` lists exact programs, exact program paths, or regex patterns. Use exact programs plus `args_allow` when possible.
- `risk` is `low`, `medium`, or `high`; commands above `consent_required_above` require interactive approval.
- `deny_always` is evaluated before `allow` and should include elevation, shell operators, credential paths, and destructive filesystem patterns.
- `roots_allow` confines `cwd` and slashy path arguments to approved host roots.
- `env_allow` is the only request environment that may enter the child process.
- `sandbox.required: true` denies execution if the current platform adapter cannot enforce its sandbox wrapper.

## Audit Log

By default the log is written to `~/.drwn-command-bridge/audit.jsonl`; override it with `--audit /abs/path/audit.jsonl`. Each JSONL record is hash chained and includes an attempt or outcome record. The server denies before spawn if the audit attempt cannot be written.

## Local Development

Build the package:

```bash
cd /abs/path/drwn-command-bridge
bun run build
```

Run the repeatable native macOS release smoke:

```bash
bun run smoke:macos
```

The smoke launches the production Node bundle through an MCP stdio client,
executes an allowlisted command under `sandbox-exec`, verifies a denylisted
command does not run, and validates the resulting audit chain.

Use a direct local path while developing:

```bash
node /abs/path/drwn-command-bridge/dist/index.js --policy /abs/path/bridge.policy.yaml
```

After publishing, use:

```bash
npx -y drwn-command-bridge --policy /abs/path/bridge.policy.yaml
```

## macOS Claude Desktop

Add a server entry that points to the built local file or published package:

```json
{
  "mcpServers": {
    "drwn-command-bridge": {
      "command": "node",
      "args": [
        "/abs/path/drwn-command-bridge/dist/index.js",
        "--policy",
        "/abs/path/bridge.policy.yaml"
      ]
    }
  }
}
```

macOS uses `/usr/bin/sandbox-exec` when `sandbox.required` is true. If that binary is unavailable, commands deny before spawn.

## Windows Claude Desktop

Windows shell mode only resolves a known Git Bash installation and refuses `C:\Windows\System32\bash.exe`. The Windows sandbox adapter is intentionally unsupported until a native restricted-token/job-object helper is available, so policies with `sandbox.required: true` deny on Windows.

```json
{
  "mcpServers": {
    "drwn-command-bridge": {
      "command": "npx",
      "args": [
        "-y",
        "drwn-command-bridge",
        "--policy",
        "C:\\Users\\you\\bridge.policy.yaml"
      ]
    }
  }
}
```

## Linux Claude Desktop

Linux uses `bwrap` when `sandbox.required` is true. Install bubblewrap through the system package manager and keep policy roots narrow.

```json
{
  "mcpServers": {
    "drwn-command-bridge": {
      "command": "npx",
      "args": [
        "-y",
        "drwn-command-bridge",
        "--policy",
        "/home/you/bridge.policy.yaml"
      ]
    }
  }
}
```

## Platform Validation Matrix

| Platform | Status | Notes |
| --- | --- | --- |
| macOS | Native MCP stdio smoke passed on 2026-07-12 | Production Node bundle initialized, listed both tools, ran `node --version` through `/usr/bin/sandbox-exec`, denied `sudo whoami`, and verified four hash-chained audit records. |
| Linux | Automated wrapper coverage with injected `bwrap` availability | Native host validation still required before claiming production parity. |
| Windows | Automated unsupported-required denial and Git Bash shell-resolution coverage | Required sandbox intentionally denies until native helper support exists. |
