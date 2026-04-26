# NPM Skill Bundles Guide

## Purpose

This document explains the implemented package-backed skill bundle model in `beginning-agents`.

Use it for:

- understanding what a bundle is
- adding extension bundles safely
- knowing how bundles are stored locally
- understanding the boundary between npm packages and `bgng`

## What A Package-Backed Skill Bundle Is

A package-backed skill bundle is an npm package used as a versioned content source for skills.

In this model:

- npm is the distribution and versioning layer
- the bundle provides skill files plus metadata
- `bgng` remains the only supported control plane for curation and sync

Bundles are extension sources. They do not replace the built-in first-party skill tree in the repo.

## What Bundles Are For

Use bundles when you want to:

- add optional skill sets without editing the built-in repo skill tree
- ship first-party extension packs later
- distribute trusted third-party skills as inspectable content bundles

The v1 design is intended for:

- built-in first-party skills in the repo
- first-party extension bundles
- trusted third-party bundles

It is not designed as a general public marketplace contract yet.

## Bundle Boundary

`bgng` uses npm packages as content bundles, not as sync tools.

Specifically, the package contributes:

- package name
- version
- tarball contents
- metadata in `package.json`
- bundle metadata in `bundle.json`

`bgng` contributes:

- ingestion
- validation
- inventory
- curation
- downstream sync

## Required Bundle Shape

Current contract requires:

```text
package.json
bundle.json
skills/
```

Each declared skill must point to a directory that contains `SKILL.md`.

The implemented bundle manifest shape is:

```json
{
  "schemaVersion": 1,
  "bundleName": "@scope/example-bundle",
  "version": "1.2.3",
  "displayName": "Example Bundle",
  "description": "Optional",
  "skills": [
    {
      "name": "skill-name",
      "scope": "shared",
      "path": "skills/shared/skill-name"
    }
  ]
}
```

Current supported scopes:

- `shared`
- `claude-only`
- `codex-only`
- `experimental`

## Ingestion Model

`bgng` ingests bundles with:

```bash
npm pack <spec> --ignore-scripts --json --pack-destination <tmp>
```

Why this path:

- it avoids relying on `node_modules` as the canonical source
- it avoids install-time lifecycle mutation
- it keeps bundles content-oriented and inspectable

Why `--ignore-scripts` matters:

- plain local-folder `npm pack` can run `prepack`
- the implemented ingestion path explicitly suppresses scripts

After packing, `bgng` extracts the tarball, normalizes the top-level `package/` directory, validates `bundle.json`, and installs the bundle into managed local state.

## Local Storage Model

Installed bundles live under:

```text
~/.agents/packages/skills/<package-name>/<version>
```

There is also a `current` symlink at the package root pointing to the active version.

Example:

```text
~/.agents/packages/skills/@scope/example-bundle/
  current -> 1.2.3
  1.2.3/
    bundle.json
    skills/
```

This storage model is intentionally separate from:

- npm global install locations
- repo-native built-in skills
- downstream tool skill directories

## Supported Commands

Add a bundle:

```bash
bgng skills packages add <npm-package-or-local-path>
```

List installed bundles:

```bash
bgng skills packages list
bgng skills packages list --json
```

Show a bundle:

```bash
bgng skills packages show <package-name>
bgng skills packages show <package-name> --json
```

## Availability vs Curation

Adding a bundle makes its skills available. It does not expose them automatically.

Typical flow:

```bash
bgng skills packages add <bundle>
bgng skills packages show <package-name>
bgng skills curate <skill-name>
bgng skills sync
```

Important distinction:

- available: the bundle exists in `~/.agents/packages/skills`
- curated: a shared skill is linked into `~/.agents/skills`
- synced: downstream tool symlinks exist in `~/.claude/skills` and `~/.codex/skills`

## Current Constraints

### Shared-skill curation only

Only shared skills can be curated into `~/.agents/skills`.

### Unique skill names assumed

The current v1 model assumes package-backed shared skills do not collide with existing skill names.

If a bundle introduces a colliding skill name, ingestion should fail.

### No update/remove lifecycle yet

Implemented now:

- add
- list
- show
- inventory
- curation
- sync

Deferred:

- update
- remove

### Project include does not yet resolve package-backed skills

General curation supports built-in shared skills and package-backed shared skills.

Per-project `skills.include` currently resolves repo-native skills only.

## How Bundles Relate To Built-In Skills

Built-in first-party skills remain repo-native.

That means:

- the repo is still the default first-party source
- bundles are additive extension sources
- `beginning-agents` remains a single default first-party package

This is intentional. The project is not splitting first-party skills into separate packages by default.

## Troubleshooting

Common failures include:

- missing `bundle.json`
- mismatched `bundleName`
- mismatched `version`
- invalid skill paths
- missing `SKILL.md`
- skill-name collisions

The safest first debug steps are:

```bash
bgng skills packages list --json
bgng skills packages show <package-name> --json
bgng skills list --json
```

## Non-Goals

Current bundle support does not mean:

- bundle CLIs are the supported sync surface
- npm install locations are the canonical source
- arbitrary public npm packages are automatically trusted
- install-time scripts are part of the intended workflow

`bgng` remains the control plane.

## Relationship To Other Docs

- general CLI usage: [01_agents-cli-usage-guide.md](./01_agents-cli-usage-guide.md)
- per-project overrides: [02_per-project-config-guide.md](./02_per-project-config-guide.md)
