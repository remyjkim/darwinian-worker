---
name: parallel-data-enrichment
description: Use when a coding agent with terminal access needs to enrich lists of companies, people, products, CSVs, or JSON records with web-sourced fields through the Parallel CLI.
---

# Parallel Data Enrichment

Use Parallel enrichment through `parallel-cli` when the input is a table, list, CSV, or JSON dataset that needs additional web-derived fields.

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

For intent discovery:

```bash
parallel-cli enrich suggest "Find the CEO and annual revenue" --json
```

For inline JSON data:

```bash
parallel-cli enrich run --data '[{"company":"Google"}]' --target output.csv --intent "Find the CEO" --json
```

For async runs:

```bash
parallel-cli enrich run config.yaml --no-wait --json
parallel-cli enrich status <task_group_id> --json
parallel-cli enrich poll <task_group_id> --json
```

## Notes

- Prefer this skill when the user wants field-level enrichment over a set of entities.
- If the dataset shape is unclear, use `enrich suggest` first.
- Parse the JSON result rather than relying on prose output.
