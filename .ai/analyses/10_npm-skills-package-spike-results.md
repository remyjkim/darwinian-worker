# NPM Skills Package Spike Results

## Purpose

Record the practical results of the local spike used to validate the package-backed skill ingestion model.

## Spike Setup

A local fixture package was created with:

- `package.json`
- `bundle.json`
- `skills/shared/hello-skill/SKILL.md`
- a `prepack` script that writes a marker file

The fixture used a scoped name:

```text
@acme/skills-sample
```

This allowed the spike to test:

- local folder package specs
- scoped package naming
- tarball structure
- script execution risk

## Commands Run

### 1. Local pack without script suppression

```bash
npm pack <local-dir> --json --pack-destination <tmp>
```

### 2. Local pack with script suppression

```bash
npm pack <local-dir> --ignore-scripts --json --pack-destination <tmp>
```

### 3. Registry package pack

```bash
npm pack @tsconfig/node20 --json --pack-destination <tmp>
```

## Results

### Result A: Local folder `npm pack` runs `prepack`

Observed:

- the `prepack` script ran
- a marker file was created

Implication:

- plain `npm pack` against local directories is not inert

### Result B: `--ignore-scripts` suppresses local `prepack`

Observed:

- tarball still created successfully
- marker file was not created

Implication:

- `--ignore-scripts` should be part of the ingestion strategy

### Result C: Tarballs extract under `package/`

Observed for both local and registry package packs:

```text
package/...
```

Implication:

- extraction normalization is mandatory
- the architecture assumption here is correct and concrete

### Result D: Scoped package names are operationally workable

Observed:

- a scoped name such as `@acme/skills-sample` packed and produced the expected artifact

Implication:

- scoped extension bundles are a viable target
- filesystem layout should simply treat package names as nested directories under the cache root

## Viability Assessment

### What the spike validates strongly

1. `npm pack` plus extract is a workable ingestion model
2. tarball normalization is straightforward
3. a content-first bundle contract is practical
4. scoped package names are not a blocker

### What the spike does not prove yet

1. lifecycle update/remove UX
2. curation ergonomics for package-backed skills
3. duplicate-name policy adequacy in real bundle ecosystems
4. trust handling for arbitrary third-party public packages

## Recommendation

Proceed with implementation, but keep the initial slice narrow:

- bundle schema
- package cache
- `npm pack --ignore-scripts` ingestion
- add/list/show commands
- source-aware inventory

Do not treat update/remove lifecycle as required for initial viability.
