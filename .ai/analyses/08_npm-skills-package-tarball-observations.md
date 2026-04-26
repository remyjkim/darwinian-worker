# NPM Skills Package Tarball Observations

## Purpose

Record what npm package artifacts actually look like when inspected through `npm pack --dry-run --json` and local `npm pack` spikes.

This document focuses on tarball realities rather than source repository assumptions.

## Official npm Facts Relevant To The Design

Based on official npm docs:

- npm packages are general-purpose package artifacts, not “skills packages”
- `package.json` defines fields such as `files`, `bin`, `exports`, `publishConfig`, `workspaces`, and lifecycle `scripts`
- globally installed packages link executables into the global bin path
- locally installed packages link executables into `node_modules/.bin`
- npm lifecycle scripts can run during pack/publish/install flows
- workspaces are optional and not required for a single-package design

Relevant docs:

- `package.json`
- `scripts`
- `folders`
- `workspaces`
- `trusted publishing`
- `provenance`

## Registry Package Tarball Shape

Observation from:

```bash
npm pack @tsconfig/node20 --json --pack-destination <tmp>
tar -tf <tgz>
```

Observed shape:

```text
package/LICENSE
package/package.json
package/tsconfig.json
package/README.md
```

### Conclusion

Published package tarballs normalize content under a top-level `package/` directory.

This means any package-backed skill ingestion design must include a normalization step that strips `package/` before treating the extracted content as a bundle root.

## Local Folder `npm pack` Behavior

A local fixture bundle was created with:

- `package.json`
- `bundle.json`
- `skills/shared/hello-skill/SKILL.md`
- a `prepack` script that writes a marker file

### Result 1: `npm pack <local-dir>`

Observed behavior:

- `prepack` **ran**
- tarball was created
- tarball contents still normalized under `package/`

### Result 2: `npm pack <local-dir> --ignore-scripts`

Observed behavior:

- `prepack` **did not run**
- tarball was still created successfully

### Conclusion

This is a critical result.

For local folder package specs:

- plain `npm pack` is **not inert**
- `--ignore-scripts` materially improves safety

## Real Package Artifact Patterns

### Minimal content/config artifact

`@tsconfig/node20`

Observed tarball:

- `LICENSE`
- `README.md`
- `package.json`
- `tsconfig.json`

Implication:

- content-only packages are normal and viable

### Config bundle with helper CLI

`eslint-config-prettier`

Observed tarball:

- config/runtime files
- helper CLI under `bin/`

Implication:

- optional package CLI is reasonable
- package CLI does not need to be the primary operator surface

### CLI + template/content artifact

`create-vite`

Observed tarball:

- executable entrypoint
- many shipped templates/assets

Implication:

- npm packages can comfortably distribute content trees
- template/content shipping is a normal use of npm packages

### CLI + template bundle

`hygen`

Observed tarball:

- executable entrypoint
- template source under `src/templates`

Implication:

- a package can ship reusable content while remaining a tool
- but content shape is package-specific and not standardized

### Heavy runtime plugin artifacts

`prettier-plugin-tailwindcss`
`eslint-plugin-import`

Observed tarballs:

- large runtime-heavy distributions
- many implementation files
- plugin/runtime orientation rather than content-bundle orientation

Implication:

- these are poor primary models for skill bundles
- useful mainly as anti-pattern references for overbroad content expectations

## Anti-Patterns Identified

The investigation surfaced several anti-patterns that `bgng` should avoid assuming:

1. package tarball root equals package root
   - false; tarballs are wrapped in `package/`

2. local folder `npm pack` is inert
   - false unless `--ignore-scripts` is used

3. runtime plugin packages are good primary analogies for content bundles
   - false; they are too implementation-heavy

4. package CLI should become the primary user interaction surface
   - not supported by the strongest reference patterns

## Design Implications

The tarball evidence supports these decisions:

1. use `npm pack`, not `npm install`
2. use `--ignore-scripts` during ingestion where supported
3. normalize extracted tarballs by stripping `package/`
4. require a stable bundle manifest because tarball layout alone is not enough
5. treat package CLI support as optional and auxiliary
