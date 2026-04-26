# NPM Skills Package Integrated Target Architecture

## Scope

Define a revised target architecture for integrating npm-distributed skill bundles with `beginning-agents` and the `bgng` CLI.

This revision removes prior ambiguity and locks the core architectural choices needed to make package-backed skills practical, inspectable, and safe.

## Executive Summary

Npm does not provide a first-class “skills package” type. It provides a flexible package distribution system.

The correct design is therefore:

- use ordinary npm packages as the transport and versioning layer
- define an explicit `beginning-agents` skill bundle contract on top of that
- keep `beginning-agents` as the control plane
- keep `bgng` as the ingestion, curation, sync, and diagnostics CLI

This document makes the following decisions explicit:

1. `beginning-agents` remains the control plane
2. `beginning-agents` remains the default first-party package for both control-plane code and built-in first-party skills
3. npm skill bundles are an extension mechanism, not the required primary packaging model
3. `bundle.json` is mandatory for first-class support
4. package-backed skill sources are stored under `~/.agents/packages/skills/...`
5. curation remains explicit
6. downstream sync remains centralized and unchanged in shape
7. bundle packages should be content-first and avoid install-time mutation

## Problem

The current system works well when all skill content lives in the repo.

It becomes limited when:

1. skills need independent release cadence
2. skills should be reused outside this repo
3. first-party skills should be split into thematic bundles
4. third-party bundles should become consumable by `bgng`

At the same time, the existing architecture already has strong local-state concepts:

- canonical source content
- curated publication layer
- derived downstream tool state

The right design should extend those concepts rather than replace them.

## Current Roles

## `beginning-agents`

`beginning-agents` currently owns:

- canonical skill source
- canonical MCP registry
- curation workflow
- sync workflow
- diagnostics and status
- operator CLI

## Npm skill bundle

An npm skill bundle should own only:

- versioned skill content
- bundle metadata
- optional docs/assets/templates

It should not own:

- downstream sync
- curation decisions
- tool config mutation
- MCP rendering

## Architectural Principle

The governing principle is:

> `beginning-agents` is the first-party control plane and default first-party skill distribution. Npm skill bundles are optional content extensions.

This means:

- `beginning-agents` ships the baseline first-party experience
- packages can provide additional skill content
- `bgng` ingests package content into local managed state
- curation remains explicit and local
- downstream sync remains centralized and target-aware

## Final Role Split

### `beginning-agents`

Should remain responsible for:

- canonical local-state model
- built-in first-party skills
- skill source registry
- curation
- target sync
- MCP registry and sync
- diagnostics and status
- operator-facing command surface

### Npm skill bundle

Should be responsible for:

- shipping extension skill content
- declaring skill metadata
- versioning that content for distribution

Npm skill bundles are not required for the baseline first-party experience.

## Final Layer Model

The target system has five layers.

### Layer 1: Built-in first-party repo content

The repo itself continues to ship:

- first-party skills
- canonical MCP registry
- CLI code
- sync and diagnostics logic

This is the default first-party source.

### Layer 2: Published extension skill bundles

Examples:

- future first-party optional bundles if justified
- future third-party bundles

These live on npm and act as optional additional sources.

### Layer 3: Local package-backed skill source cache

Location:

```text
~/.agents/packages/skills/<package-name>/<version>/...
```

This is the managed local cache for package-backed extension skill sources.

### Layer 4: Curated publication layer

Location:

```text
~/.agents/skills
```

This answers:

- which skills are exposed?

It does not answer:

- where they originally came from

### Layer 5: Derived downstream target state

Still:

- `~/.claude/skills`
- `~/.codex/skills`
- target MCP config files

This remains fully derived state.

## Locked Source Storage Decision

Package-backed skills will be stored under:

```text
~/.agents/packages/skills/<package-name>/<version>/...
```

### Why this is the correct choice

It is better than storing them:

- under the repo
- under npm’s global install location
- only under a transient cache

Because it:

- aligns with the existing `~/.agents` aggregation model
- keeps mutable machine state out of the repo checkout
- works for both repo-local and globally installed `bgng`
- avoids coupling runtime behavior to npm’s platform-specific global install paths
- makes source inspection and diagnostics straightforward

## Skill Bundle Format

This format applies only to package-backed extension sources. It does not change the current built-in repo skill layout.

For first-class support, the extension bundle format is:

```text
package.json
bundle.json
skills/
  shared/
    <skill-name>/
      SKILL.md
      ...
  claude-only/
  codex-only/
  experimental/
README.md
LICENSE
```

## `bundle.json` is required

Previous drafts treated `bundle.json` as optional.

That is too weak.

### Final decision

`bundle.json` is mandatory for first-class `bgng` support.

### Why

Without a manifest:

- `bgng` must infer too much from directory structure
- source introspection becomes brittle
- validation becomes weaker
- package-backed inventory becomes ambiguous

### Required `bundle.json` shape

Recommended baseline:

```json
{
  "schemaVersion": 1,
  "bundleName": "@beginning-agents/skills-core",
  "displayName": "Beginning Agents Core Skills",
  "description": "Core reusable skill bundle for local coding agents.",
  "version": "1.2.0",
  "skills": [
    {
      "name": "systematic-debugging",
      "scope": "shared",
      "path": "skills/shared/systematic-debugging"
    }
  ]
}
```

### Required manifest fields

- `schemaVersion`
- `bundleName`
- `version`
- `skills`

Each skill entry must include:

- `name`
- `scope`
- `path`

## Package Requirements

For extension bundle packages, require:

- `name`
- `version`
- `description`
- `license`
- `repository`
- `files`

Recommended `files` allowlist:

- `skills`
- `bundle.json`
- `README.md`
- `LICENSE*`

## CLI Expectations For Skill Bundles

### Final decision

Skill bundles should be content-first packages and should not require their own CLI.

Optional bundle CLIs are allowed only for:

- metadata inspection
- validation
- self-description

Bundle CLIs must not:

- write into `~/.claude`
- write into `~/.codex`
- write into `~/.cursor`
- mutate curated state automatically

## Curation Model

Installing a package must not automatically:

- expose all skills
- sync to targets
- mutate curated state

### Final curation flow

1. install/register package-backed bundle
2. inspect available skills
3. curate specific skills
4. sync curated skills downstream

This preserves the existing safety model and avoids hidden behavior.

Built-in repo-native skills continue to work without any package-install step.

## Curated Link Strategy

`~/.agents/skills` remains the curated publication layer.

Curated symlinks may point to:

- repo-native skill directories
- package-backed skill directories under `~/.agents/packages/skills/...`

Example package-backed curated target:

```text
~/.agents/packages/skills/@beginning-agents/skills-core/1.2.0/skills/shared/systematic-debugging
```

Downstream tools do not need to know the source type.

## Downstream Sync Strategy

### Final decision

The downstream sync model remains unchanged in architecture.

That means:

- `bgng` still syncs curated skills into downstream tool directories
- package-backed skills are treated exactly like repo-backed skills once curated
- no direct package-to-tool install path is introduced

This avoids duplicating logic and preserves diagnostics consistency.

## `bgng` Command Surface

The package-aware command family should be:

### `bgng skills packages add <npm-package>`

Behavior:

- fetch/install package into managed local source cache
- validate `bundle.json`
- register source metadata
- do not auto-curate
- do not auto-sync

### `bgng skills packages list`

Behavior:

- list installed package-backed bundles
- show package name
- show installed version
- show bundle display name
- show bundle skill count

### `bgng skills packages show <npm-package>`

Behavior:

- show manifest metadata
- list included skills by scope
- show curation status

### `bgng skills packages update <npm-package>`

Behavior:

- update installed bundle source
- preserve curation where possible
- report removed or renamed skills clearly

### `bgng skills packages remove <npm-package>`

Behavior:

- remove bundle source
- warn or refuse if curated skills still depend on it
- remain non-destructive by default

## Existing Commands Stay Central

Continue to use:

- `bgng skills list`
- `bgng skills curate`
- `bgng skills uncurate`
- `bgng skills sync`

The package commands make skills available.
The existing commands control exposure and downstream state.

## `bgng skills list` Future Behavior

This command should eventually become source-aware and show:

- skill name
- scope
- source type (`repo` or `npm`)
- source identifier
- source version
- curated state
- downstream exposure state

This provides one unified inventory view.

## Versioning Strategy

There are two version axes:

1. `beginning-agents` / `bgng`
2. each npm extension skill bundle

### Final compatibility model

- `bgng` supports one or more `bundle.json` schema versions
- bundles declare `schemaVersion`
- bundle content versioning is independent
- `bgng` can reject unsupported bundle schemas

This avoids unnecessary lockstep between content and orchestration.

## Workspaces Strategy

Npm workspaces are relevant for future first-party bundle splitting, but not required for initial support.

### Final decision

Do not require workspaces for the first implementation.

Use workspaces later only if the project eventually splits first-party packages for a clear operational reason.

That split is not assumed by this architecture.

## Security and Trust Model

Package-backed skills increase supply-chain and content-trust risk.

### Primary risks

1. install-time scripts
2. malicious or low-quality bundle content
3. hidden machine-specific assumptions
4. silent changes during bundle updates

### Final mitigations

1. prefer content-only skill bundles
2. require explicit manifest validation
3. keep curation explicit
4. keep sync explicit
5. surface source metadata in `bgng skills list`
6. treat package updates as inspectable events

### Long-term trust features

These are desirable later, but not required for first implementation:

- provenance-aware trust indicators
- allowlists for first-party or approved bundle sources
- signed or policy-verified bundle ingestion

## What `beginning-agents` Must Not Do

To keep the architecture coherent, do not:

1. rely on npm global install directories as canonical skill source
2. let bundles write directly into downstream agent directories
3. auto-curate skills on install
4. embed target sync logic into skill bundles
5. make `bundle.json` optional for first-class support

## Feature Set Recommendation

The minimum complete feature set is:

1. built-in first-party skills remain first-class and repo-native
2. required bundle manifest for package-backed extensions
3. local package-backed skill source cache
4. package-aware source registry
5. `bgng skills packages add/list/show`
6. source-aware `bgng skills list`
7. explicit curation of package-backed skills
8. unchanged downstream sync model

The next layer after that is:

1. package update/remove commands
2. schema compatibility validation
3. source trust policy
4. rename/removal diagnostics for updated bundles

## Rollout Plan

### Phase 1: Bundle schema and local source registry

- define and validate `bundle.json`
- implement local package-backed skill source storage under `~/.agents/packages/skills`
- implement package registration metadata

### Phase 2: Read-only package support

- `bgng skills packages add`
- `bgng skills packages list`
- `bgng skills packages show`
- source-aware `bgng skills list`

### Phase 3: Package-backed curation

- curate package-backed skills into `~/.agents/skills`
- sync downstream unchanged

### Phase 4: Package lifecycle support

- update/remove bundles
- diagnostics for removed or changed bundled skills

### Phase 5: Ecosystem expansion

- optional first-party split bundles if later justified
- third-party bundle support guidance
- trust/provenance policy layer

## Package Strategy Decision

The default package strategy is:

- one primary first-party package: `beginning-agents`
- built-in first-party skills continue to ship inside that package
- npm skill bundles are optional extension sources

The architecture does **not** require first-party skills to be split into separate npm packages.

If a first-party split ever happens, it should happen only because of concrete operational pressure such as:

- independent release cadence needs
- optional install requirements
- clearer ownership boundaries
- ecosystem growth that justifies decomposition

Until then, the simplest and preferred model is:

- `beginning-agents` ships control-plane code and first-party skills together
- package-backed bundles extend the system rather than define the baseline

## Final Recommendation

The revised target architecture is:

- `beginning-agents` remains the local control plane and default first-party package
- npm packages are used as the distribution layer for optional modular skill bundles
- `bundle.json` is mandatory
- package-backed sources are cached under `~/.agents/packages/skills/...`
- curation remains explicit
- downstream sync remains centralized and unchanged in structure

This is the cleanest path that fully leverages npm package capabilities without letting package distribution leak into local orchestration responsibilities or forcing premature first-party package fragmentation.
