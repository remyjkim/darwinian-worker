# NPM Skills Package Contract Recommendation

## Purpose

Translate the npm facts, reference package corpus, and tarball observations into a concrete recommendation for what `bgng` should expect from package-backed skill bundles.

## Primary Conclusion

The package-backed skill model is viable, but only if `beginning-agents` defines an explicit bundle contract instead of trying to infer a “skills package” from generic npm package behavior.

## Recommended v1 Contract

### Package role

A package-backed skill bundle is:

- a versioned distribution container
- a content source
- a metadata carrier

It is not:

- the control plane
- the curation engine
- the sync engine
- the downstream target mutator

### Required bundle shape

```text
package.json
bundle.json
skills/
  shared/
    <skill-name>/
      SKILL.md
  claude-only/
  codex-only/
  experimental/
README.md
LICENSE
```

### Required `bundle.json`

Mandatory fields:

- `schemaVersion`
- `bundleName`
- `version`
- `skills`

Each skill entry must include:

- `name`
- `scope`
- `path`

## Expected `bgng` Ingestion Behavior

### Final recommendation

`bgng` should ingest bundles through:

```bash
npm pack <spec> --ignore-scripts --json --pack-destination <tmp>
```

Then:

1. extract tarball
2. strip `package/`
3. validate `bundle.json`
4. store normalized content under:

```text
~/.agents/packages/skills/<package-name>/<version>/...
```

5. register it as an available source
6. do not auto-curate
7. do not auto-sync

## Supported Source Intent In v1

The contract should be designed for:

1. built-in first-party repo-native skills
2. first-party extension bundles
3. trusted third-party extension bundles

It should **not** assume unrestricted support for arbitrary public npm packages in v1.

## Curation Recommendation

Keep curation explicit.

Installing a bundle should only make skills **available**.

Curating a skill should make it **exposed** in:

```text
~/.agents/skills
```

This is the correct separation of concerns.

## Skill Name Recommendation

For v1:

- require global skill-name uniqueness across repo-native and package-backed available skills

Reason:

- preserves `bgng skills curate <name>`
- avoids prematurely introducing source-qualified curation syntax

This rule can be revisited later if real bundle usage proves it too restrictive.

## Package CLI Recommendation

Package-specific CLIs should not be part of the main integration architecture.

Allowed:

- metadata inspection
- validation
- self-description

Not allowed as the main intended flow:

- curation
- sync
- downstream target writes
- `~/.agents` publication-layer mutation

## Control-Plane Boundary

### Npm package is responsible for

- shipping content
- shipping metadata
- versioned distribution

### `bgng` is responsible for

- ingestion
- validation
- source registration
- curation
- sync
- diagnostics
- local state management

## Recommendation For Implementation Scope

The implementation plan should be treated as valid only if narrowed to:

### Phase 1

- bundle schema
- local package cache
- `npm pack` ingestion
- add/list/show package commands
- source-aware inventory

### Phase 2

- curation of package-backed skills
- downstream sync unchanged in shape

### Phase 3

- update/remove lifecycle only after the first two phases prove out

## Go / No-Go Recommendation

### Recommendation

**Go**, with the following conditions:

1. use `npm pack`, not `npm install`
2. use `--ignore-scripts` during pack ingestion
3. require `bundle.json`
4. treat package support as an extension mechanism
5. keep lifecycle update/remove out of the initial viability slice

If those constraints are preserved, the design is strong enough to implement incrementally.
