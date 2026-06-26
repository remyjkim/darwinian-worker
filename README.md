<p align="center">
  <img src="./docs/assets/darwinian-harness-logo.png" alt="Darwinian Harness" width="120" height="120" />
</p>

# darwinian-harness

`darwinian-harness` is a local meta-harness for AI agent tools — a CLI that organizes the skills, MCP servers, extensions, defaults, project overlays, and downstream tool state surrounding the agents you already use.

The package is `darwinian-harness`. The command is `drwn`.

## Install

```bash
npm install -g darwinian-harness
drwn status
```

Or work from a checkout:

```bash
git clone https://github.com/remyjkim/darwinian-harness.git
cd darwinian-harness
bun install
bun run drwn -- status
```

## First run

```bash
drwn write --dry-run
drwn write
```

For a project-local harness, run `drwn init` in the project root, then `drwn add skill <name>` and `drwn write`.

## Claude Session Signals Beta

`drwn` includes hidden Claude Code hook commands that can record active Harness Cards and
skill usage beside Claude transcript files. This is a manual opt-in beta; automatic hook
materialization from cards or project config is not enabled yet.

Add this to a Claude `.claude/settings.json` file for the project you want to observe:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "drwn hook card-usage",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptExpansion": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "drwn hook skill-marker --phase expansion",
            "timeout": 5
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "drwn hook skill-marker --phase pre",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "drwn hook skill-marker --phase post",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "drwn hook skill-marker --phase fail",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

Signals are appended next to Claude transcripts as `<session-id>.drwn-signals.jsonl`.
The hook commands always exit successfully and stay silent so they do not interrupt Claude
sessions.

## Documentation

- **Public docs:** [docs.darwiniantools.com](https://docs.darwiniantools.com) — concepts, getting-started paths, guides, troubleshooting, CLI reference. Source in [`docs-docusaurus/`](./docs-docusaurus).
- **Disciplines that shape the design:** [`concepts/disciplines`](https://docs.darwiniantools.com/concepts/disciplines)
- **Safety model:** [`concepts/safety-model`](https://docs.darwiniantools.com/concepts/safety-model)
- **CLI quick reference:** [`docs/cli-quickref.md`](./docs/cli-quickref.md)
- **Architecture (contributors):** [`.ai/knowledges/10_drwn-cli-architecture.md`](./.ai/knowledges/10_drwn-cli-architecture.md)
- **Maintainers:** [`docs/maintainers/`](./docs/maintainers/)

Local docs workflow:

```bash
bun run docs:dev
bun run docs:build
```

## Contributing

Contributions are welcome when they preserve the conservative write model and include tests for behavior changes. Start with `bun install`, `bun test`, `bun run typecheck`, then read [CONTRIBUTING.md](./CONTRIBUTING.md).
