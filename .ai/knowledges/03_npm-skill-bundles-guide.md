# NPM Skill Bundles Guide

## Purpose

This document explains the implemented package-backed skill bundle model in `darwinian-mind`.

Use it for:

- understanding what a bundle is
- adding extension bundles safely
- knowing how bundles are stored locally
- understanding the boundary between npm packages and `drwn`

## What A Package-Backed Skill Bundle Is

A package-backed skill bundle is an npm package used as a versioned content source for skills.

In this model:

- npm is the distribution and versioning layer
- the bundle provides skill files plus metadata
- `drwn` remains the only supported local meta-harness control plane for curation and downstream write

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

`drwn` uses npm packages as content bundles, not as write tools.

Specifically, the package contributes:

- package name
- version
- tarball contents
- metadata in `package.json`
- bundle metadata in `bundle.json`

`drwn` contributes:

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

`drwn` ingests bundles with:

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

After packing, `drwn` extracts the tarball, normalizes the top-level `package/` directory, validates `bundle.json`, and installs the bundle into managed local state.

## Local Storage Model

In the cards-era store, installed bundles live under:

```text
~/.agents/drwn/skills/<package-name>/<version>
```

There is also a `current` symlink at the package root pointing to the active version.

Example:

```text
~/.agents/drwn/skills/@scope/example-bundle/
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
drwn skills packages add <npm-package-or-local-path>
```

List installed bundles:

```bash
drwn skills packages list
drwn skills packages list --json
```

Show a bundle:

```bash
drwn skills packages show <package-name>
drwn skills packages show <package-name> --json
```

## Availability vs Curation

Adding a bundle makes its skills available. It does not expose them automatically.

Typical flow:

```bash
drwn skills packages add <bundle>
drwn skills packages show <package-name>
drwn add skill <skill-name>
drwn write
```

Important distinction:

- available: the bundle exists in the active bundle cache, normally `~/.agents/drwn/skills`
- default: a shared skill is listed in `~/.agents/drwn/machine.json` under `defaults.skills`
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

Keep package-backed skill names unique. If a project include references an unknown or ambiguous skill name, `drwn doctor` reports it and write will not silently pick an arbitrary source.

## How Bundles Relate To Built-In Skills

Built-in first-party skills remain repo-native.

That means:

- the repo is still the default first-party source
- bundles are additive extension sources
- `darwinian-mind` remains a single first-party harness package

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
drwn skills packages list --json
drwn skills packages show <package-name> --json
drwn skills list --json
```

## Non-Goals

Current bundle support does not mean:

- bundle CLIs are the supported write surface
- npm install locations are the authoritative source
- arbitrary public npm packages are automatically trusted
- install-time scripts are part of the intended workflow

`drwn` remains the local harness control plane.

## Relationship To Other Docs

- general CLI usage: [01_agents-cli-usage-guide.md](./01_agents-cli-usage-guide.md)
- per-project overrides: [02_per-project-config-guide.md](./02_per-project-config-guide.md)
