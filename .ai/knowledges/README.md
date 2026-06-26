# Knowledge Docs

This directory holds internal operator and maintainer knowledge that is more specific than the public [README.md](../../README.md).

## Architecture

- [10_drwn-cli-architecture.md](./10_drwn-cli-architecture.md): comprehensive as-built reference for the CLI internals — process model, store topology, config merge, cards, skills, write pipeline, diagnostics, with a per-module index and command-to-module map

## Operator Docs

- [01_agents-cli-usage-guide.md](./01_agents-cli-usage-guide.md): day-to-day `drwn` usage, local state model, and command workflows
- [02_per-project-config-guide.md](./02_per-project-config-guide.md): per-project config discovery, schema, merge rules, and diagnostics
- [03_npm-skill-bundles-guide.md](./03_npm-skill-bundles-guide.md): package-backed skill bundle model, ingestion, storage, and constraints
- [11_card-usage-guide.html](./11_card-usage-guide.html): narrative card authoring and consumption usage scenarios, with the layered state model (HTML)

## Distribution And Release Docs

- [04_homebrew-release-checklist.md](./04_homebrew-release-checklist.md): future-facing Homebrew readiness checklist
- [05_npm-publishing-analysis-and-manual.md](./05_npm-publishing-analysis-and-manual.md): npm publish failure analysis and the verified manual publish workflow

## Integrations

- [06_notion-mcp-setup-guide.md](./06_notion-mcp-setup-guide.md): adding the official hosted Notion MCP server across Claude Code, Codex, and Cursor with OAuth notes
- [07_claude-ai-mcp-connectors-explained.md](./07_claude-ai-mcp-connectors-explained.md): how Claude.ai platform-managed MCP connectors differ from locally-installed servers, and where auth state lives

## Concepts

- [08_harness_engineering_resources.md](./08_harness_engineering_resources.md): origin and current framing of "harness engineering" as the practice darwinian-mind is built around

## Manual Validation

- [09_mind-cards-manual-test-guide.md](./09_mind-cards-manual-test-guide.md): sandbox-first end-to-end manual for authoring, publishing, applying, writing, and diagnosing Mind Cards locally

## Scope

Keep material here when it is:

- useful operational knowledge
- more detailed than the public quickstart
- too specific for `README.md`
- still evolving before promotion into stable maintainer docs
