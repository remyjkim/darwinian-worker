---
sidebar_position: 6
---

# Share a Harness with a Team

Use Harness Cards when a reusable project setup should move between teammates. A card is the immutable harness package; a card catalog is the discoverable index that points people to installable card Git refs.

## Producer Flow

Author and publish the card locally:

```bash
drwn card new @team/backend --no-git
drwn card source add-skill @team/backend reviewer
drwn card source add-mcp @team/backend context7
drwn card source set @team/backend --description "Team backend baseline" --version 1.0.0
drwn card source doctor @team/backend
drwn card publish @team/backend
```

Push the card repository to a Git remote:

```bash
drwn card remote add @team/backend <card-git-url>
drwn card push @team/backend
```

Publish the card entry into a shared catalog:

```bash
drwn library catalog add <catalog-git-url>
drwn card catalog publish @team/backend@1.0.0 --catalog @team --mode direct --tag backend --json
```

`--catalog @team` targets a locally registered catalog whose manifest scope is `@team`. `--mode direct` clones or opens the catalog worktree, updates `catalog.json`, commits the change, pushes the current branch, and refreshes the registered catalog cache when possible.

Use a dry run before mutating the catalog:

```bash
drwn card catalog publish @team/backend@1.0.0 --catalog @team --mode direct --dry-run --json
```

## Consumer Flow

Register the same catalog and search it:

```bash
drwn library catalog add <catalog-git-url>
drwn search card backend --scope @team --json
```

The search result includes the installable card URL. Clone or apply that URL:

```bash
drwn card clone git+<card-git-url>#v1.0.0
drwn add git+<card-git-url>#v1.0.0
drwn install
drwn write --dry-run
drwn write
```

Catalog search is discovery only. Project configs and lockfiles still record concrete card refs, so teammates can review exactly which Git URL, tag, and commit a project consumes.
