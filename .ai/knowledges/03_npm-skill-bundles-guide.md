# NPM Skill Bundles Guide

## Purpose

This document explains the implemented package-backed skill bundle model in `beginning-harness`.

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
- `bgng` remains the only supported local meta-harness control plane for curation and downstream write

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

`bgng` uses npm packages as content bundles, not as write tools.

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
- downstream write

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

- it avoids relying on `node_modules` as the authoritative source
- it avoids install-time lifecycle mutation
- it keeps bundles content-oriented and inspectable

Why `--ignore-scripts` matters:

- plain local-folder `npm pack` can run `prepack`
- the implemented ingestion path explicitly suppresses scripts

After packing, `bgng` extracts the tarball, normalizes the top-level `package/` directory, validates `bundle.json`, and installs the bundle into managed local state.

## Local Storage Model

In the cards-era store, installed bundles live under:

```text
~/.agents/bgng/skills/<package-name>/<version>
```

There is also a `current` symlink at the package root pointing to the active version.

Example:

```text
~/.agents/bgng/skills/@scope/example-bundle/
  current -> 1.2.3
  1.2.3/
    bundle.json
    skills/
```

Pre-migration installs used:

```text
~/.agents/packages/skills/<package-name>/<version>
```

`bgng store migrate` copies that legacy cache into
`~/.agents/bgng/skills` and archives the old layout. The implementation chooses
the active layout by checking whether `~/.agents/bgng/store.json` exists: if it
does, package commands use the cards-era store; if it does not, they fall back
to the legacy package cache for compatibility before migration.

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
bgng add skill <skill-name>
bgng write
```

Important distinction:

- available: the bundle exists in the active bundle cache, normally `~/.agents/bgng/skills`
- legacy available: before store migration, the bundle may exist in `~/.agents/packages/skills`
- default: a shared skill is listed in `~/.agents/bgng/machine.json` under `defaults.skills`
- compatibility publication: a default or curated shared skill is linked into `~/.agents/skills`
- written: downstream tool symlinks exist in `~/.claude/skills` and `~/.codex/skills`

## Current Constraints

### Shared-skill curation only

Only shared skills can be made global defaults or curated into `~/.agents/skills`.

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
- downstream write

Deferred:

- update
- remove

### Project include supports package-backed skills

Per-project `skills.include` supports both repo-native shared skills and installed package-backed shared skills.

Keep package-backed skill names unique. If a project include references an unknown or ambiguous skill name, `bgng doctor` reports it and write will not silently pick an arbitrary source.

## How Bundles Relate To Built-In Skills

Built-in first-party skills remain repo-native.

That means:

- the repo is still the default first-party source
- bundles are additive extension sources
- `beginning-harness` remains a single first-party harness package

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

- bundle CLIs are the supported write surface
- npm install locations are the authoritative source
- arbitrary public npm packages are automatically trusted
- install-time scripts are part of the intended workflow

`bgng` remains the local harness control plane.

## Relationship To Other Docs

- general CLI usage: [01_agents-cli-usage-guide.md](./01_agents-cli-usage-guide.md)
- per-project overrides: [02_per-project-config-guide.md](./02_per-project-config-guide.md)
