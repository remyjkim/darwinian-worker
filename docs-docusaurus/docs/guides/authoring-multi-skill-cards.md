---
sidebar_position: 5
---

# Author a Multi-Skill Card

A multi-skill card should keep each skill as a normal skill directory with its own `SKILL.md`, then include those skill names in the card manifest.

Create the source:

```bash
drwn card new @team/review-stack --no-git
```

Add bundled skills:

```bash
drwn card source add-skill @team/review-stack architecture-review --from ./skills/architecture-review
drwn card source add-skill @team/review-stack test-review --from ./skills/test-review
drwn card source add-skill @team/review-stack docs-review --from ./skills/docs-review
```

Add any MCP definitions the card should carry:

```bash
drwn card source add-mcp @team/review-stack context7
drwn card source add-mcp @team/review-stack team-tools --from ./team-tools.json
```

Use `optional: true` in an MCP definition when the card can work without that server or when the server needs per-project credentials. Consumers will see the skipped optional server during `drwn write` and can enable it with `drwn add mcp <server-name>`.

Set metadata before publishing:

```bash
drwn card source set @team/review-stack --description "Team review stack" --version 1.0.0
drwn card source set @team/review-stack --stability stable --last-validated-with 0.1.0 --test-status-badge https://example.com/review-stack.svg
```

Validate the source and publish:

```bash
drwn card source show @team/review-stack
drwn card source doctor @team/review-stack
drwn card publish @team/review-stack
drwn card validate @team/review-stack@1.0.0
```

When replacing a bundled skill, rerun `drwn card source add-skill` with `--force`. When you want to remove a manifest reference but leave files in place for manual cleanup, use `drwn card source remove-skill @team/review-stack docs-review --keep-files`.
