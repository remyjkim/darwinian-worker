---
name: parallel-web-extract
description: Use when a coding agent with terminal access already has a URL and needs clean page content or targeted extraction from the web through the Parallel CLI.
---

# Parallel Web Extract

Use Parallel extraction through `parallel-cli` when the task is to read or extract content from a specific URL.

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

Run extraction with JSON output:

```bash
parallel-cli extract <url> --json
```

Useful variants:

```bash
parallel-cli extract <url> --objective "Find pricing info" --json
parallel-cli extract <url> --full-content --json
```

## Notes

- Prefer this skill when a prompt includes one or more concrete URLs.
- Use `--objective` when the user needs one slice of the page rather than everything.
- Parse the JSON result rather than relying on prose output.
