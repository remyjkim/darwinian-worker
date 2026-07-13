<p align="center">
  <img src="./docs/assets/darwinian-worker-logo.png" alt="Darwinian Worker" width="120" height="120" />
</p>

# darwinian

`darwinian` is a local meta-harness for AI agent tools — a CLI that organizes the skills, MCP servers, extensions, defaults, project overlays, and downstream tool state surrounding the agents you already use.

The package is `darwinian`. The command is `drwn`.

## Install

Requires Bun 1.2+ and npm.

```bash
curl -fsSL https://bun.sh/install | bash
npm install -g darwinian
drwn status
```

Or work from a checkout:

```bash
git clone https://github.com/remyjkim/darwinian-worker.git
cd darwinian-worker
bun install
bun run drwn -- status
```

## First run

```bash
drwn write --dry-run
drwn write
```

For a project-local harness, run `drwn init` in the project root, then `drwn add skill <name>` and `drwn write`.

## Store Export Safety

Whole-store export is disabled because `~/.agents/drwn` can contain credentials and operational machine state. `drwn store export` exits with `STORE_EXPORT_DISABLED_UNSAFE`, creates no archive, and has no unrestricted override. Treat any broad Store archives created by earlier releases as sensitive.

## Claude Session Signals Beta

`drwn` includes hidden Claude Code hook commands that can record active Cards and
skill usage beside Claude transcript files. This is an opt-in beta and is disabled by
default.

Enable it in the project you want to observe:

```json
{
  "version": 1,
  "hooks": {
    "signals": { "enabled": true }
  }
}
```

Then run `drwn write`. `drwn` registers the Claude hooks it owns while preserving
user-authored hooks in `.claude/settings.json`.

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
