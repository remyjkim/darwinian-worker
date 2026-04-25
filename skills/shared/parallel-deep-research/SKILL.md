---
name: parallel-deep-research
description: Use when a coding agent with terminal access is asked for exhaustive, multi-source research and should run Parallel research workflows through the CLI.
---

# Parallel Deep Research

Use Parallel research through `parallel-cli` for broad, multi-source investigations that need more depth than a single search.

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

Run synchronous research with JSON output:

```bash
parallel-cli research run "<question>" --json
```

Use processor control when depth matters:

```bash
parallel-cli research run "<question>" --processor pro --json
parallel-cli research run "<question>" --processor ultra --json
```

Use async mode for long jobs:

```bash
parallel-cli research run "<question>" --no-wait --json
parallel-cli research status <run_id> --json
parallel-cli research poll <run_id> --json
```

## Notes

- Prefer this skill when the user explicitly asks for exhaustive, comprehensive, or deep research.
- Use ordinary `parallel-web-search` for lighter lookups.
- Parse the JSON result rather than relying on prose output.
