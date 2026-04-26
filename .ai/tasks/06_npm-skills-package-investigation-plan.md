# NPM Skills Package Investigation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish a reference-backed understanding of what npm package mechanics and real published package patterns `beginning-agents` should actually design for before implementing package-backed skill bundle support.

**Architecture:** This is a pre-implementation investigation and spike plan, not a feature-delivery plan. It separates npm-native guarantees from `beginning-agents`-specific contract design, examines real published package artifacts, validates the `npm pack` ingestion model, and produces a clear go/no-go recommendation for implementation.

**Tech Stack:** npm registry/package mechanics, `npm view`, `npm pack --dry-run --json`, local fixture packages, Bun/TypeScript test spike, filesystem validation under `~/.agents`.

---

## Investigation Strategy

The core problem is that “npm skills package” is not an official npm package category.

So before implementing package-backed skill support, the investigation must answer four questions:

1. **What does npm itself actually guarantee?**
2. **What do real analogous published packages look like on disk and in tarballs?**
3. **What minimum contract does `bgng` actually need from a package-backed skill bundle?**
4. **Is the proposed `npm pack` plus extraction architecture operationally viable in this repo?**

This investigation should produce evidence, not theory.

## Deliverables

The investigation should produce all of the following:

1. a reference package matrix
2. a tarball observation report
3. a refined bundle contract proposal
4. an ingestion-spike result
5. a viability recommendation for implementation scope

## Deliverable Locations

Save outputs to:

- `.ai/analyses/07_npm-skills-package-reference-matrix.md`
- `.ai/analyses/08_npm-skills-package-tarball-observations.md`
- `.ai/analyses/09_npm-skills-package-contract-recommendation.md`
- optionally `.ai/analyses/10_npm-skills-package-spike-results.md` if the spike is substantial enough to merit a separate artifact

## Investigation Scope

This investigation is specifically about **designing the right expectations for package-backed skill bundles**.

It is **not** about:

- building the full CLI integration
- implementing update/remove lifecycle
- finalizing third-party trust policy
- publishing new bundle packages yet

## Research Track 1: Npm Facts

### Objective

Build a precise list of what npm guarantees and what it does not.

### Questions to answer

1. What package spec forms can `npm pack` consume reliably?
   - registry package name
   - local directory
   - tarball file
   - tarball URL
   - git URL

2. What does a packed tarball look like after extraction?
   - package root naming
   - `package/` prefix normalization
   - metadata available from `npm pack --json`

3. What package fields matter most for content bundles?
   - `files`
   - `bin`
   - `exports`
   - `publishConfig`
   - `workspaces`
   - lifecycle `scripts`

4. What are the actual risks of using `npm install` instead of `npm pack`?

5. What is npm’s behavior around local folder package specs vs published registry packages?

### Required outputs

- short fact summary with citations
- list of package features relevant to `beginning-agents`
- list of package features that are irrelevant or misleading for skills bundles

## Research Track 2: Reference Package Corpus

### Objective

Study real npm packages that are analogous to content bundles, plugin bundles, templates, and CLI-distributed assets.

### Selection rules

Pick a small, deliberate corpus, ideally 6-10 packages total, spread across:

1. content-only packages
2. CLI packages
3. plugin-style packages
4. template/config bundles
5. packages that ship non-code assets

Avoid selecting only generic libraries.

### For each package, inspect

1. `npm view <pkg> --json`
2. `npm pack <pkg> --dry-run --json`
3. public package README and package positioning

### Questions to answer

1. What does the tarball actually contain?
2. Is the package content-first or runtime-first?
3. Does it ship a CLI?
4. Does it rely on install scripts?
5. Does it ship a manifest-like metadata file?
6. Does it ship assets/templates/content in a stable directory structure?
7. Is its published artifact shape something `bgng` could consume comfortably?

### Required output

A table with columns such as:

- package
- package category
- ships CLI
- ships content assets
- manifest/metadata pattern
- install-script usage
- suitability as a reference for skill bundles
- notes

## Research Track 3: Tarball-Centric Behavior

### Objective

Stop reasoning from source repos and reason from the actual publish artifact.

### Questions to answer

1. How stable is tarball structure across real packages?
2. How common is hidden noise in tarballs?
3. Are there patterns that suggest `bundle.json` is necessary rather than optional?
4. What common anti-patterns should `beginning-agents` reject?

### Required output

Document:

- observed tarball shapes
- common noise/problem patterns
- implications for bundle validation

## Research Track 4: Local Fixture Bundle Design

### Objective

Create a realistic local fixture bundle that models the intended extension-package contract.

### Questions to answer

1. What is the minimum file set needed for a useful bundle?
2. Is `bundle.json` sufficient for skill discovery?
3. Does the current proposed schema feel complete or too thin?
4. What fields are truly required vs nice-to-have?

### Required output

Produce a concrete proposed minimal bundle fixture layout and revised schema recommendation.

## Research Track 5: Ingestion Spike

### Objective

Validate the proposed `npm pack` plus extract model in a narrow spike.

### Important boundary

This spike is **not** the full feature implementation.

It should only prove:

1. package tarball can be produced from a local fixture
2. tarball can be extracted into a managed directory
3. `bundle.json` can be validated
4. skill directories can be enumerated and recognized as usable sources

### Questions to answer

1. Is `npm pack` for local fixture bundles operationally simple enough?
2. Is extraction/normalization straightforward enough?
3. Do scoped names create awkward filesystem behavior?
4. Is `~/.agents/packages/skills/...` still the right cache location after actually trying it?

### Required output

A recommendation:

- proceed with the architecture
- proceed but narrow Phase 1 further
- revise storage or contract assumptions first
- stop and redesign

## Research Track 6: Control-Plane Boundary Check

### Objective

Validate that the architecture does not accidentally turn `bgng` into a half-package-manager/half-sync-engine with unclear boundaries.

### Questions to answer

1. Are we using npm only for transport/versioning/metadata, or drifting into lifecycle orchestration?
2. Is `bgng` still clearly the sole mutation path for curation and sync?
3. Are package-backed skills genuinely behaving like “available sources” rather than “installed active state”?

### Required output

A written boundary recommendation:

- what npm packages are responsible for
- what `bgng` is responsible for
- what must remain off-limits to extension bundles

## Task 1: Create The Reference Research Framework

**Files:**
- Create: `.ai/analyses/07_npm-skills-package-reference-matrix.md`
- Create: `.ai/analyses/08_npm-skills-package-tarball-observations.md`
- Create: `.ai/analyses/09_npm-skills-package-contract-recommendation.md`

**Step 1: Create research doc skeletons**

Create the three analysis files with section headings only.

**Step 2: Document the investigation questions**

Add the exact question sets from this plan into those files so the work stays structured.

## Task 2: Build The npm Facts Baseline

**Files:**
- Update: `.ai/analyses/08_npm-skills-package-tarball-observations.md`

**Step 1: Gather official npm docs**

Use official npm docs for:

- `package.json`
- `npm pack`
- package specs
- `folders`
- `scripts`
- `workspaces`
- trusted publishing/provenance only if they materially affect bundle expectations

**Step 2: Summarize only relevant facts**

Document:

- what npm guarantees
- what npm does not define
- why `npm pack` is preferable to `npm install` for this use case

## Task 3: Assemble The Reference Package Matrix

**Files:**
- Update: `.ai/analyses/07_npm-skills-package-reference-matrix.md`

**Step 1: Select 6-10 reference packages**

Choose a balanced set across:

- content bundle patterns
- CLI patterns
- plugin/template/config patterns

**Step 2: Inspect each package**

For each package, run:

```bash
npm view <pkg> --json
npm pack <pkg> --dry-run --json
```

**Step 3: Record matrix data**

Capture:

- artifact category
- CLI or not
- content or runtime orientation
- published file shape
- suitability as a reference

## Task 4: Analyze Tarball Shapes And Anti-Patterns

**Files:**
- Update: `.ai/analyses/08_npm-skills-package-tarball-observations.md`

**Step 1: Compare real tarball contents**

Look for:

- hidden noise
- missing manifests
- unstable directory shapes
- install-script dependence
- heavy runtime assumptions

**Step 2: Extract implications**

Document:

- what `bgng` should accept
- what `bgng` should reject
- why `bundle.json` should remain mandatory or be revised

## Task 5: Refine The Bundle Contract

**Files:**
- Update: `.ai/analyses/09_npm-skills-package-contract-recommendation.md`

**Step 1: Draft minimum bundle contract**

Specify:

- minimum file layout
- minimum manifest fields
- optional fields
- constraints on skill paths

**Step 2: Reconcile with real package evidence**

Make sure the contract reflects:

- npm tarball reality
- `beginning-agents` curation needs
- source-aware inventory needs

## Task 6: Run A Local Ingestion Spike

**Files:**
- Create optionally: `.ai/analyses/10_npm-skills-package-spike-results.md`

**Step 1: Create a local fixture package**

Create a temporary package fixture outside tracked repo files if possible.

It should include:

- `package.json`
- `bundle.json`
- `skills/shared/...`

**Step 2: Run `npm pack` against the fixture**

Verify:

- the tarball is created
- metadata JSON is usable
- extracted shape is predictable

**Step 3: Simulate normalization**

Verify:

- stripping `package/`
- storing under `~/.agents/packages/skills/...`
- reading bundle metadata from the normalized location

**Step 4: Record spike results**

Document:

- friction points
- surprises
- whether the plan should change

## Task 7: Produce The Final Recommendation

**Files:**
- Update: `.ai/analyses/09_npm-skills-package-contract-recommendation.md`

**Step 1: Write the recommendation**

Conclude clearly:

- proceed as planned
- proceed with narrowed scope
- revise architecture first
- or stop

**Step 2: Explicitly call out v1 boundaries**

For example:

- first-party plus trusted extension bundles only
- no arbitrary public-package support assumptions
- no update/remove in initial viability slice unless spike proves it low risk

## Final Review Checklist

Before treating the investigation as complete, verify that it answers:

1. what a package-backed skill source really is
2. what the published artifact actually looks like
3. what `bgng` should expect from that artifact
4. what should remain inside the control plane
5. whether the current implementation plan still stands or needs revision

## Completion Gate

Only after this investigation is complete should the implementation plan be treated as execution-ready.

If the investigation finds that:

- `npm pack` ingestion is awkward
- the contract is too strict or too weak
- collision policy is untenable
- package-backed source lifecycle is more complex than expected

then revise `.ai/analyses/06_*` and `.ai/tasks/05_*` before implementation begins.
