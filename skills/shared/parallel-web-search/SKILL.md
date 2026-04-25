---
name: parallel-web-search
description: Use when a coding agent with terminal access needs current web information, fact-checking, or recent sources and should use Parallel via the CLI instead of a local MCP server.
---

# Parallel Web Search

Use Parallel search through `parallel-cli` for fresh web results in terminal-based agents.

## Preconditions

- `parallel-cli` must be installed
- the user must be authenticated with `parallel-cli login`, `parallel-cli login --device`, or `PARALLEL_API_KEY`

If `parallel-cli` is missing, tell the user to run:

```bash
curl -fsSL https://parallel.ai/install.sh | bash
```

If authentication is missing, tell the user to run:

```bash
parallel-cli login
parallel-cli auth
```

## Use

Run structured search with JSON output:

```bash
parallel-cli search "<query>" --json
```

Useful variants:

```bash
parallel-cli search "<query>" --mode one-shot --json
parallel-cli search "<query>" --include-domains example.com --json
parallel-cli search -q "<keyword query>" --after-date YYYY-MM-DD --json
```

## Notes

- Prefer this skill for current events, recent product changes, live documentation changes, and fact-checking.
- Parse the JSON result rather than relying on prose output.
- If the user already has a URL, use `parallel-web-extract` instead.
