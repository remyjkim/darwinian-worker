# Top-Level Registry Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move packaged darwinian-harness source data from root `config.json` and `mcp-servers.json` into `registry/` while preserving local `.agents/bgng/config.json` semantics.

**Architecture:** Centralize packaged registry paths in `cli/core/paths.ts`, then make all loaders, context validation, fixtures, release checks, docs, and package metadata use those helpers or the new literal paths. Keep project overlay paths unchanged under `.agents/bgng/config.json`.

**Tech Stack:** Bun, TypeScript, Clipanion CLI, Bun test runner, npm package manifest.

---

### Task 1: Lock In Registry Path Expectations

**Files:**
- Modify: `test/core-config.test.ts`
- Modify: `test/helpers.ts`
- Modify: `test/sync-mcp-compat.test.ts`
- Modify: `test/sync-mcp.test.ts`
- Modify: `test/package-readiness.test.ts`
- Modify: `test/docs-readiness.test.ts`

**Step 1: Write failing tests**

Update tests and fixtures to create packaged source files at:

```text
registry/config.json
registry/mcp-servers.json
```

Package readiness should expect:

```typescript
expect(paths).toContain("registry/config.json");
expect(paths).toContain("registry/mcp-servers.json");
expect(paths).not.toContain("config.json");
expect(paths).not.toContain("mcp-servers.json");
```

Docs readiness should expect README references to `./registry/config.json`, `./registry/mcp-servers.json`, and the final README image path.

**Step 2: Run focused tests to verify RED**

Run:

```bash
bun test test/core-config.test.ts test/package-readiness.test.ts test/docs-readiness.test.ts
```

Expected: failures showing loaders/package/docs still expect root files.

### Task 2: Add Packaged Registry Path Helpers

**Files:**
- Modify: `cli/core/paths.ts`
- Modify: `cli/core/config.ts`
- Modify: `cli/core/registry.ts`
- Modify: `cli/context.ts`

**Step 1: Implement helpers**

Add helpers:

```typescript
export function resolvePackagedRegistryDir(repoRoot: string) {
  return join(repoRoot, "registry");
}

export function resolvePackagedConfigPath(repoRoot: string) {
  return join(resolvePackagedRegistryDir(repoRoot), "config.json");
}

export function resolvePackagedMcpRegistryPath(repoRoot: string) {
  return join(resolvePackagedRegistryDir(repoRoot), "mcp-servers.json");
}
```

Use them in `loadConfig`, `saveConfig`, `loadRegistry`, `saveRegistry`, `createAgentsContext`, and `validateRepoRoot`.

**Step 2: Run focused tests**

Run:

```bash
bun test test/core-config.test.ts test/sync-mcp.test.ts test/sync-mcp-compat.test.ts
```

Expected: path behavior passes or reveals remaining root assumptions.

### Task 3: Move Registry Files And Assets

**Files:**
- Move: `config.json` to `registry/config.json`
- Move: `mcp-servers.json` to `registry/mcp-servers.json`
- Create: `docs/assets/`
- Move: `the-darwinian-harness.png` to `docs/assets/the-darwinian-harness.png`
- Move or leave untracked: `image.png`

**Step 1: Move files**

Use filesystem moves for JSON and PNG files. If `image.png` is unreferenced, move it to `docs/assets/image.png` rather than leaving it at root.

**Step 2: Update package manifest**

Modify `package.json`:

```json
"files": [
  "cli",
  "registry",
  "skills",
  "README.md",
  "docs/assets/the-darwinian-harness.png",
  "LICENSE",
  "CONTRIBUTING.md"
]
```

### Task 4: Update Docs And Release Checks

**Files:**
- Modify: `README.md`
- Modify: `docs-astro/src/content/docs/*.md` if applicable
- Modify: `scripts/verify-release-readiness.ts`
- Modify: `test/package-readiness.test.ts`
- Modify: `test/docs-readiness.test.ts`

**Step 1: Update references**

Replace packaged source references:

```text
config.json -> registry/config.json
mcp-servers.json -> registry/mcp-servers.json
```

Do not change references to:

```text
~/.agents/bgng/config.json
<project>/.agents/bgng/config.json
~/.agents/library/mcp-servers.json
```

**Step 2: Update release required files**

Release checks should require `registry/config.json` and `registry/mcp-servers.json`, and should no longer require root copies.

### Task 5: Verify And Clean Up

**Files:**
- Modify: `.gitignore` if generated docs output should stay out of git

**Step 1: Run full verification**

Run:

```bash
bun test
bun run typecheck
bun run verify:release -- --json
```

Expected: all commands exit 0.

**Step 2: Inspect git status**

Run:

```bash
git status --short
```

Expected: changes are limited to registry layout, docs/assets moves, docs/plans, tests, release checks, and package metadata. Existing unrelated untracked work remains untouched.
