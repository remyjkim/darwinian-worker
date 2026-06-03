# Task 20: Harness Cards Wave 1 — Bundle Resolver Implementation Plan

**Status**: Ready For T1 Start
**Created**: 2026-05-26
**Updated**: 2026-05-26
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 PR (4–6 sessions)
**Dependencies**: `.ai/analyses/36_harness-cards-bundle-resolver-target-architecture.md`
**References**: [analyses/36_harness-cards-bundle-resolver-target-architecture.md, analyses/37_harness-cards-registry-pinning-target-architecture.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/26_harness-cards-target-architecture.md, analyses/32_harness-cards-vs-flox-and-conda.md, tasks/19_completion_harness-cards-m6-m7-scope-diagnostics.md, cli/core/skills.ts, cli/core/sync.ts, cli/core/card-store.ts, cli/core/card-lock.ts, cli/core/card-project.ts, cli/core/card-manifest.ts, cli/core/migration.ts, cli/core/diagnostics.ts, test/helpers.ts, test/scenarios-card-materialization.test.ts, test/core-migration.test.ts]

---

## Objective

Make harness cards behave as the published architecture (`29_harness-cards-target-architecture-v1_1.md`) promises: card-bundled skill content is the source of truth for materialization, the integrity hash is computed over that content, and the resolver consults the card store before any shared registry. Close the four Matt-findings from the 2026-05-26 smoke test (`[Matt] Harness Cards v1.1 — Smoke Run + DX Notes`) in one cohesive wave.

---

## Scope

**In scope:**

- Card-bundled skill resolution path (Layer 1 → Layer 2 in `36_*-bundle-resolver-target-architecture.md` §4.1).
- Manifest validation tightening at publish and apply time.
- Content-tree integrity hashing replacing manifest-JSON integrity.
- Lockfile schema additive extensions (`skills[]`, reserved `registry: null`).
- New `cli/core/card-skill-resolver.ts` module.
- Wiring the resolver into `cli/core/skills.ts::syncSkills`, `cli/core/sync.ts::syncRepository`, and `cli/core/diagnostics.ts::detectStaleSkillSymlinks`.
- Planner dedup and dry-run output annotated with the winning resolution layer.
- Legacy detection fix in `cli/core/migration.ts::detectLegacyLayout`.
- One-time integrity recompute on first apply after upgrade.
- Test additions and regressions for all Matt findings (A, B, C, D).

**Out of scope (deferred to Wave 2 per `37_*-registry-pinning-target-architecture.md`):**

- Activating `skills.shared` for registry references.
- Registry kinds (`published-artifact`, `git-sha`).
- Registry pin verification.
- `bgng cards outdated` registry-drift section.
- Multi-registry support.
- Authoring CLI helpers (`bgng card add-skill`, `card import-skill`).

**Out of scope (cross-wave; tracked separately):**

- Content-addressed dedupe of the card store.
- SLSA provenance attestation on publish.
- Strict mode (refuse fallback to user-defaults).

---

## Decisions Locked Before Implementation

These were confirmed with Remy on 2026-05-26 and are NOT open for renegotiation during execution. Document and proceed.

| # | Decision | Source |
|---|---|---|
| D1 | Implementation order is T1 → T2 → T3 → T4 → T5 → T6 → T7 with T8 floating (may land any time it's convenient; no dependencies block it). | Sign-off 2026-05-26 |
| D2 | Missing-skill resolution is a **hard failure**, not a warning. The Wave 1 contract is "every name in `skills.include` must resolve." Today's silent drop is the bug we are fixing. | Sign-off 2026-05-26 |
| D3 | The one-time integrity recompute on first apply after upgrade is **non-`--force`**. It emits a single INFO line per upgraded card and proceeds. The v1.1 hash was structurally unverifiable; there is nothing to "force past." | Sign-off 2026-05-26 |
| D4 | Lockfile `lockfileVersion` **stays at `1`** in Wave 1. The new fields are additive; old readers tolerate them; Wave 2 will bump to `2` when it activates the `registry` block. | Sign-off 2026-05-26 |
| D5 | Existing test fixtures that publish incomplete cards are updated to create backing source skill directories before publish. This affects more than one fixture (`commands-card-author`, `commands-card-consumer`, `scenarios-card-materialization`, `commands-status-why`) and should be handled with a reusable helper rather than ad hoc edits. | Sign-off 2026-05-26 |

---

## Entry Checks

### Preflight Reality Check (2026-05-26 audit)

The original "Ready For T1 Start" assessment was stale when this audit began. P0 baseline recovery is now complete on the current branch snapshot. Current repo reality:

- `bun test` is green at **356 pass / 0 fail / 69 files**.
- repo-root `bun run typecheck` is green.
- `docs/presentations/polyglots/` remains a separate workspace and its own `bun run typecheck` is green.
- Root `tsconfig.json` now uses an explicit include boundary so repo-root typecheck no longer compiles the polyglots workspace under the wrong compiler settings.

Execution gate:

- P0 is complete; T1 may start.
- Wave 1 itself should still target a fully green `bun test`, `bun run typecheck`, and `bun run verify:release` at completion.

### Confirmed Root Causes (2026-05-26 audit)

The five current typecheck failures split into **two real root-package strictness bugs** and **three compiler-boundary/configuration leaks**:

| Failure | Root cause | Evidence | Classification |
|---|---|---|---|
| `cli/core/export/archiver.ts(43)` | The cross-device hardlink fallback narrows `err` as `Error` and then force-casts to `Record<string, unknown>` to read `code`. Under strict TS this is not a valid shape guarantee; the code wants an errno-style error narrowing, not a generic `Error` cast. | `tsc` error TS2352 at `archiver.ts:43`; the problematic line is `const code = err instanceof Error ? (err as Record<string, unknown>)['code'] : undefined;` | Real code bug in tracked CLI code |
| `test/commands-export-sessions.test.ts(96)` | The test proves the regex matched, but under `noUncheckedIndexedAccess` the capture group slot `match![1]` is still `string | undefined`. The non-null assertion only covers the array object, not the indexed capture. | `tsc` error TS2532 at `commands-export-sessions.test.ts:96`; root `tsconfig.json` has `noUncheckedIndexedAccess: true` | Real test bug in tracked test code |
| `docs/presentations/polyglots/decks/cards/src/main.ts(20)` | The deck source is being compiled under the **root** `tsconfig.json`, not the deck's own local `tsconfig.json`. Under the root config, `noUncheckedIndexedAccess` turns `slideModules[path]` into `string | undefined`, producing `(string | undefined)[]`. Under the deck-local config, this package typechecks clean. | `tsc -p docs/presentations/polyglots/decks/cards/tsconfig.json --noEmit` exits 0; root `tsc --explainFiles` says `docs/presentations/polyglots/decks/cards/src/main.ts` is `Matched by default include pattern '**/*'` | Compiler-boundary leak, not a Wave 1 code bug |
| `docs/presentations/polyglots/packages/theme/lib/init.ts(29,39)` | The theme package is also being compiled under the **root** `tsconfig.json`, whose `lib` is only `["ESNext"]`. That removes DOM globals like `document`, even though the theme package's own `tsconfig.json` includes `DOM` and typechecks clean. | `tsc -p docs/presentations/polyglots/packages/theme/tsconfig.json --noEmit` exits 0; root `tsc --explainFiles` says `packages/theme/lib/init.ts` is `Matched by default include pattern '**/*'` | Compiler-boundary leak, not a Wave 1 code bug |
| Broader root-typecheck surface instability | Root `tsconfig.json` has **no explicit `include`**, `allowJs: true`, and only excludes `docs-astro`. That means repo-root `tsc` sweeps in arbitrary `.ts` and `.js` files by default, including the polyglots deck source, its `vite.config.ts`, and even built assets like `docs/presentations/polyglots/decks/cards/dist/assets/index-*.js`. | Root `tsconfig.json`; `tsc --explainFiles` shows `vite.config.ts`, `src/main.ts`, `src/types.d.ts`, `packages/theme/lib/init.ts`, and `dist/assets/index-BvIslJdf.js` all `Matched by default include pattern '**/*'` | Root config design issue / baseline debt |

Important non-obvious conclusion:

- The polyglots workspace already owns its own typecheck boundary at `docs/presentations/polyglots/package.json`.
- `bun run typecheck` from `docs/presentations/polyglots/` exits 0.
- Therefore the docs errors are not proof of bad deck/theme code for Wave 1; they are proof that the repo-root typecheck boundary is currently wrong for this mixed workspace.

### Preflight P0 — Restore A Green Typecheck Baseline

P0 has been completed on this branch and is preserved here as an audit trail for why the handoff is now considered execution-ready.

#### P0.1 — Fix the two real tracked-code errors

Files:

- `cli/core/export/archiver.ts`
- `test/commands-export-sessions.test.ts`

Required outcome:

- `archiver.ts` uses a sound errno-style narrowing for `err.code`
- `commands-export-sessions.test.ts` proves the capture group exists before calling `.trim()`

Completed:

- `cli/core/export/archiver.ts` now uses a sound helper to narrow `error.code`
- `test/commands-export-sessions.test.ts` now proves the capture group exists before use

#### P0.2 — Decide and implement the root typecheck boundary

Chosen option for Wave 1:

- Keep `docs/presentations/polyglots/` out of the root `tsc --noEmit` surface.
- Let that workspace continue to validate itself through its own `bun run typecheck`.

Why this is the recommended option:

- The workspace already has its own `package.json`, local `tsconfig.json` files, and passing `typecheck` scripts.
- Wave 1 is a CLI/cards change wave, not a reveal.js deck wave.
- The current failures are caused by the root config compiling browser packages under node-oriented compiler settings.

Implemented:

- The root config now uses an explicit `include` list for the harness CLI/test/scripts surface plus skill helper source files that are intentionally checked at repo root.
- This avoids accidental inclusion of unrelated workspaces and generated JS, which was the real root cause of the polyglots failures appearing in repo-root typecheck.

#### P0.3 — Verification bar for entering T1

Run:

```bash
bun run typecheck
(cd docs/presentations/polyglots && bun run typecheck)
bun test
```

Expected:

- repo-root `bun run typecheck` exits 0
- polyglots workspace `bun run typecheck` still exits 0
- `bun test` remains green

Verified on 2026-05-26:

- repo-root `bun run typecheck` exited 0
- `docs/presentations/polyglots` workspace `bun run typecheck` exited 0
- `bun test` exited 0
- `bun run verify:release` exited 0

Run before editing:

```bash
git status --short --branch
bun test
bun run typecheck
```

Expected:

- working tree is clean or only documented in-progress files are modified
- `bun test` reports **356 pass / 0 fail / 69 files** on the current branch snapshot
- repo-root `bun run typecheck` reports clean
- `(cd docs/presentations/polyglots && bun run typecheck)` reports clean if you want to re-check the separated workspace boundary

If `bun test` is not green at entry, stop and triage before any work on this plan. If repo-root `bun run typecheck` regresses to red, re-open P0 before starting or continuing T1.

---

## Test-Driven Development Discipline

Per CLAUDE.md, every code change in this plan MUST follow TDD:

1. Write the failing test first.
2. Run `bun test <path>` and confirm it fails for the expected reason.
3. Write the smallest implementation that makes the test pass.
4. Run `bun test <path>` and confirm green.
5. Refactor with tests green.

Each task below identifies the **test-first artifact** explicitly. Do not start the implementation step until the corresponding test exists and fails.

---

## Glossary of Files Touched

For quick reference. Bold marks files that gain net-new logic in Wave 1.

### Core modules

- `cli/core/card-manifest.ts` — manifest schema and validation (T1).
- **`cli/core/card-store.ts`** — publish, resolve, integrity (T1, T2, T6).
- `cli/core/card-lock.ts` — lockfile schema (T3).
- `cli/core/card-project.ts` — apply/resolve project cards (T3, T6).
- **`cli/core/card-skill-resolver.ts`** — new module (T4).
- `cli/core/skills.ts` — `syncSkills` consumer of the resolver (T5).
- `cli/core/sync.ts` — orchestration; passes locked cards down (T5, T7).
- `cli/core/diagnostics.ts` — `detectStaleSkillSymlinks` consumer of the resolver (T5).
- `cli/core/migration.ts` — `detectLegacyLayout` short-circuit fix (T8).

### Tests

- **`test/core-card-integrity-content.test.ts`** — new (T2).
- **`test/core-card-skill-resolver.test.ts`** — new (T4).
- **`test/scenarios-card-bundled-only.test.ts`** — new (T5).
- `test/core-card-manifest.test.ts` — extended (T1).
- `test/commands-card-author.test.ts` — extended (T1).
- `test/core-card-lock.test.ts` — extended (T3).
- `test/core-diagnostics-sections.test.ts` — lockfile fixture update (T3).
- `test/scenarios-card-materialization.test.ts` — fixture update (T5, T1 dependency).
- `test/commands-status-why.test.ts` — fixture update + provenance regression (T1, T5).
- `test/commands-doctor.test.ts` — card-only skill diagnostics regression (T5).
- `test/core-skills.test.ts` — `syncSkills` hard-failure contract update (T5).
- `test/commands-write.test.ts` — dry-run snapshots (T7).
- `test/commands-write-drift.test.ts` — dry-run snapshots (T7).
- `test/scenarios-idempotency.test.ts` — confirm no regression (T5/T7).
- `test/core-migration.test.ts` — regression case (T8).
- `test/helpers.ts` — possibly extended with `publishCardWithSkills` helper (T1).

### Reference

- `.ai/analyses/36_harness-cards-bundle-resolver-target-architecture.md` — the target architecture this plan implements.

---

## T1 — Manifest Validation Tightening

### Objective

Reject incomplete cards at publish time and refuse to resolve them at apply time. Reserve `skills.shared` for Wave 2.

### Files

- `cli/core/card-manifest.ts`
- `cli/core/card-store.ts`
- `test/core-card-manifest.test.ts` (extend)
- `test/commands-card-author.test.ts` (extend)
- `test/commands-card-consumer.test.ts` (fixture helper update)
- `test/scenarios-card-materialization.test.ts` (fixture helper update)
- `test/commands-status-why.test.ts` (fixture helper update)
- `test/helpers.ts` (add helper)

### Tests first

In `test/core-card-manifest.test.ts`, add:

```ts
test("validateCardManifest rejects non-empty skills.shared", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    skills: { include: ["alpha"], shared: ["beta"] },
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toContain("skills.shared is reserved for Wave 2");
});

test("validateCardManifest accepts skills.shared if absent or empty array", () => {
  expect(validateCardManifest({ name: "@me/x", version: "1.0.0", skills: { include: ["a"] } }).ok).toBe(true);
  expect(validateCardManifest({ name: "@me/x", version: "1.0.0", skills: { include: ["a"], shared: [] } }).ok).toBe(true);
});
```

In `test/commands-card-author.test.ts`, add:

```ts
test("card publish fails when skills.include references a missing source directory", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture));
  const manifestPath = join(fixture.agentsDir, "bgng", "sources", "@me", "backend", "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.skills = { include: ["polish"] };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const published = await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture));

  expect(published.exitCode).not.toBe(0);
  expect(published.stderr).toContain("missing skill directory 'polish'");
});

test("card publish succeeds when every skills.include has a matching source directory", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture));
  const sourceRoot = join(fixture.agentsDir, "bgng", "sources", "@me", "backend");
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.skills = { include: ["polish"] };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceRoot, "skills", "polish"), { recursive: true });
  await writeFile(join(sourceRoot, "skills", "polish", "SKILL.md"), "---\nname: polish\ndescription: polish\n---\n");

  const published = await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture));

  expect(published.exitCode).toBe(0);
});
```

In `test/helpers.ts`, extend the existing `publishCard` pattern used in `commands-card-consumer.test.ts` into a reusable helper that other Wave 1 tests reuse. Important: this helper must support **re-publishing a second version of the same card from the same source tree**; it cannot blindly call `card new` on every invocation.

```ts
export async function publishCardWithSkills(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: {
    name: string;            // e.g. "@me/backend"
    version?: string;        // defaults to "1.0.0"
    skills: string[];        // names; each gets a SKILL.md
    servers?: Record<string, unknown>;
  },
) {
  // 1. create the card source only if it does not already exist
  // 2. write manifest with provided version + skills.include + servers
  // 3. create source skills/<name>/SKILL.md for each declared skill
  // 4. publish the requested version
  // 5. return the resolved version dir
}
```

Before landing T1.2/T1.3, inventory and update the existing tests that currently publish cards with `skills.include` but no backing `skills/<name>/SKILL.md` in the source tree. As of the 2026-05-26 audit, these include:

- `test/commands-card-author.test.ts`
- `test/commands-card-consumer.test.ts`
- `test/scenarios-card-materialization.test.ts`
- `test/commands-status-why.test.ts`

Run:

```bash
bun test test/core-card-manifest.test.ts test/commands-card-author.test.ts
```

Expect both new tests to FAIL (validation not yet added; publish doesn't check source dirs yet).

### Implementation

#### T1.1 — Reject `skills.shared` if non-empty

In `cli/core/card-manifest.ts`:

```ts
export interface CardManifest {
  // ... existing fields ...
  skills?: { include?: string[]; exclude?: string[]; shared?: string[] };
  // ... existing fields ...
}
```

In `validateCardManifest`, after the existing `skills.exclude` check (line 57):

```ts
if (manifest.skills?.shared !== undefined) {
  if (!Array.isArray(manifest.skills.shared)) {
    errors.push("skills.shared must be an array");
  } else if (manifest.skills.shared.length > 0) {
    errors.push(
      "skills.shared is reserved for Wave 2 (registry references). Wave 1 supports only bundled skills.",
    );
  }
}
```

#### T1.2 — Publish-time validation in `publishCard`

In `cli/core/card-store.ts::publishCard` (around line 221), after `readCardSourceManifest` and before the `cp` to the version dir:

```ts
const sourceDir = resolveCardSourceDir(agentsDir, manifest.name);
const declaredSkills = manifest.skills?.include ?? [];
for (const skillName of declaredSkills) {
  const skillDir = join(sourceDir, "skills", skillName);
  const skillMd = join(skillDir, "SKILL.md");
  if (!existsSync(skillDir)) {
    throw new Error(
      `Card source is missing skill directory '${skillName}' declared in skills.include. ` +
      `Expected: ${skillDir}`,
    );
  }
  if (!existsSync(skillMd)) {
    throw new Error(
      `Card source skill '${skillName}' is missing SKILL.md. Expected: ${skillMd}`,
    );
  }
}
```

#### T1.3 — Apply-time validation in `resolveCard`

In `cli/core/card-store.ts::resolveCard`, add a final pass after determining `versionDir` (or `dir` for the file branch):

```ts
function validatePublishedSkillDirs(versionDir: string, manifest: CardManifest) {
  for (const skillName of manifest.skills?.include ?? []) {
    const skillDir = join(versionDir, "skills", skillName);
    if (!existsSync(skillDir) || !existsSync(join(skillDir, "SKILL.md"))) {
      throw new Error(
        `Card ${manifest.name}@${manifest.version} is missing required skill directory '${skillName}'. ` +
        `The card must be republished from a complete source.`,
      );
    }
  }
}
```

Call this from both branches of `resolveCard` before returning.

#### T1.4 — Reuse the helper in existing tests

Convert the duplicate publish/setup helpers currently inlined in:

- `test/commands-card-consumer.test.ts`
- `test/scenarios-card-materialization.test.ts`
- `test/commands-status-why.test.ts`

to use `publishCardWithSkills` from `test/helpers.ts`. Keep the existing multi-version publish behavior in `commands-card-consumer.test.ts` and the two-step diff scenario in `commands-card-author.test.ts` working; the helper must reuse an existing source tree when the card already exists.

### Acceptance criteria

- New tests in `core-card-manifest.test.ts` pass.
- New tests in `commands-card-author.test.ts` pass.
- `scenarios-card-materialization.test.ts` is updated to call `publishCardWithSkills({ name: "@me/backend", skills: ["alpha"], servers: { ... } })` and continues to pass.
- `commands-card-consumer.test.ts` and `commands-status-why.test.ts` continue to pass after their publish fixtures are updated to create source skill dirs.
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-card-manifest.test.ts test/commands-card-author.test.ts test/scenarios-card-materialization.test.ts
bun test test/commands-card-consumer.test.ts test/commands-status-why.test.ts
bun test
bun run typecheck
```

---

## T2 — Content-Tree Integrity Rewrite

### Objective

Replace `computeCardIntegrity(manifest: CardManifest)` with `computeCardIntegrity(versionDir: string)`. The hash covers the bundled tree's content, so the lockfile's `integrity` field actually catches drift.

### Files

- `cli/core/card-store.ts`
- `test/core-card-integrity-content.test.ts` (new)

### Tests first

Create `test/core-card-integrity-content.test.ts`:

```ts
// ABOUTME: Verifies card content-tree integrity hashing covers bundled files.
// ABOUTME: Protects the Wave 1 promise that the integrity field detects content drift.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";
import { computeCardIntegrity } from "../cli/core/card-store";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldCardVersion(root: string) {
  await mkdir(join(root, "skills", "polish"), { recursive: true });
  await writeFile(join(root, "card.json"), JSON.stringify({ name: "@me/x", version: "1.0.0" }));
  await writeFile(join(root, "skills", "polish", "SKILL.md"), "---\nname: polish\n---\nbody\n");
  await writeFile(join(root, "skills", "polish", "ref.md"), "reference\n");
  return root;
}

test("computeCardIntegrity returns sha256-prefixed deterministic digest", async () => {
  const root = await createTempRoot("card-int-");
  tempRoots.push(root);
  await scaffoldCardVersion(root);

  const a = await computeCardIntegrity(root);
  const b = await computeCardIntegrity(root);

  expect(a).toBe(b);
  expect(a.startsWith("sha256-")).toBe(true);
  expect(a.length).toBeGreaterThan(20);
});

test("computeCardIntegrity changes when any bundled file content changes", async () => {
  const root = await createTempRoot("card-int-");
  tempRoots.push(root);
  await scaffoldCardVersion(root);

  const before = await computeCardIntegrity(root);
  await writeFile(join(root, "skills", "polish", "SKILL.md"), "---\nname: polish\n---\nMODIFIED\n");
  const after = await computeCardIntegrity(root);

  expect(after).not.toBe(before);
});

test("computeCardIntegrity ignores the .integrity file itself", async () => {
  const root = await createTempRoot("card-int-");
  tempRoots.push(root);
  await scaffoldCardVersion(root);

  const before = await computeCardIntegrity(root);
  await writeFile(join(root, ".integrity"), `${before}\n`);
  const after = await computeCardIntegrity(root);

  expect(after).toBe(before);
});

test("computeCardIntegrity detects added or removed files", async () => {
  const root = await createTempRoot("card-int-");
  tempRoots.push(root);
  await scaffoldCardVersion(root);

  const before = await computeCardIntegrity(root);
  await writeFile(join(root, "skills", "polish", "extra.md"), "extra\n");
  const afterAdd = await computeCardIntegrity(root);
  expect(afterAdd).not.toBe(before);

  await rm(join(root, "skills", "polish", "extra.md"));
  const afterRemove = await computeCardIntegrity(root);
  expect(afterRemove).toBe(before);
});

test("computeCardIntegrity hashes symlink targets by resolved content", async () => {
  // optional but recommended: confirm the symlink-handling rule
  // skip in CI if symlinks unavailable
});
```

Run:

```bash
bun test test/core-card-integrity-content.test.ts
```

Expect FAIL (`computeCardIntegrity` does not accept a path yet).

### Implementation

In `cli/core/card-store.ts`:

```ts
import { stat, readdir as readdirAsync } from "node:fs/promises";

async function walkVersionTree(versionDir: string): Promise<Array<{ relPath: string; abs: string; mode: number }>> {
  const entries: Array<{ relPath: string; abs: string; mode: number }> = [];
  async function recurse(currentAbs: string, currentRel: string) {
    const dirents = await readdir(currentAbs, { withFileTypes: true });
    for (const dirent of dirents) {
      const relPath = currentRel ? `${currentRel}/${dirent.name}` : dirent.name;
      const abs = join(currentAbs, dirent.name);
      if (relPath === ".integrity") continue;
      if (dirent.isDirectory()) {
        await recurse(abs, relPath);
      } else if (dirent.isFile() || dirent.isSymbolicLink()) {
        const stats = await stat(abs); // follows symlinks
        if (stats.isFile()) {
          entries.push({ relPath, abs, mode: stats.mode });
        }
      }
    }
  }
  await recurse(versionDir, "");
  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return entries;
}

export async function computeCardIntegrity(versionDir: string): Promise<string> {
  const entries = await walkVersionTree(versionDir);
  const records: Array<{ p: string; m: "x" | "-"; h: string }> = [];
  for (const entry of entries) {
    const content = await readFile(entry.abs);
    const fileHash = createHash("sha256").update(content).digest("hex");
    records.push({
      p: entry.relPath,
      m: (entry.mode & 0o111) !== 0 ? "x" : "-",
      h: fileHash,
    });
  }
  const canonical = JSON.stringify(records);
  return `sha256-${createHash("sha256").update(canonical).digest("hex")}`;
}
```

Update the **4 callers** of `computeCardIntegrity` within `card-store.ts`:

1. `publishCard` (line 244): `const integrity = await computeCardIntegrity(versionDir);`
2. `resolveCard` file-path branch (line 280): `integrity: await computeCardIntegrity(dir),`
3. `resolveCard` published branch (line 295): `... ?? await computeCardIntegrity(resolveCardVersionDir(agentsDir, parsed.name, version));`
4. Any reads we add in T6 — see below.

Note: `computeCardIntegrity` becomes async. All call sites already await elsewhere, so `await` at each site.

### Acceptance criteria

- New tests in `core-card-integrity-content.test.ts` pass.
- Existing card author/consumer/scenario tests pass after the integrity rewrite (they assert presence of `.integrity`, not its specific value).
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-card-integrity-content.test.ts test/commands-card-author.test.ts test/commands-card-consumer.test.ts test/scenarios-card-materialization.test.ts
bun test
bun run typecheck
```

---

## T3 — Lockfile Schema Extension

### Objective

Add `skills: string[]` per lock entry (which skill names this card contributed) and accept an optional `registry: null` field reserved for Wave 2.

### Files

- `cli/core/card-lock.ts`
- `cli/core/card-project.ts`
- `test/core-card-lock.test.ts`
- `test/core-diagnostics-sections.test.ts`

### Tests first

In `test/core-card-lock.test.ts`, add:

```ts
test("writeCardLock persists the skills[] attribution field per card entry", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);

  writeCardLock(root, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/backend/1.0.0",
      integrity: "sha256-test",
      manifest: { name: "@me/backend", version: "1.0.0", skills: { include: ["alpha", "beta"] } },
      skills: ["alpha", "beta"],
      registry: null,
    },
  ]);

  const loaded = await loadCardLock(root);
  expect(loaded?.cards[0]?.skills).toEqual(["alpha", "beta"]);
  expect(loaded?.cards[0]?.registry).toBeNull();
});

test("loadCardLock tolerates legacy entries without skills[] or registry by deriving skills from the manifest", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);
  // Write a legacy-shape lockfile manually (no skills, no registry).
  const legacyPayload = {
    lockfileVersion: 1,
    cards: [
      {
        name: "@me/backend",
        requested: "@me/backend@^1.0.0",
        version: "1.0.0",
        path: "/cards/@me/backend/1.0.0",
        integrity: "sha256-test",
        manifest: { name: "@me/backend", version: "1.0.0", skills: { include: ["alpha"] } },
      },
    ],
  };
  await mkdir(dirname(cardLockPath(root)), { recursive: true });
  await writeFile(cardLockPath(root), JSON.stringify(legacyPayload, null, 2));

  const loaded = await loadCardLock(root);
  expect(loaded?.cards[0]?.skills).toEqual(["alpha"]);
  expect(loaded?.cards[0]?.registry).toBeNull();
});
```

Run:

```bash
bun test test/core-card-lock.test.ts
```

Expect FAIL.

### Implementation

In `cli/core/card-lock.ts`:

```ts
export interface CardLockEntry {
  name: string;
  requested: string;
  version: string;
  path: string;
  integrity: string;
  manifest: CardManifest;
  // Wave 1 additions:
  skills: string[];           // skill names this card contributed at apply time
  registry: null;             // reserved for Wave 2; always null in Wave 1
}

export interface CardLockfile {
  lockfileVersion: 1;
  cards: CardLockEntry[];
}
```

Update `loadCardLock` to backfill missing fields:

```ts
export async function loadCardLock(projectRoot: string): Promise<CardLockfile | null> {
  const path = cardLockPath(projectRoot);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<CardLockfile> & {
    cards?: Array<Partial<CardLockEntry> & {
      name: string; requested: string; version: string; path: string;
      integrity: string; manifest: CardManifest;
    }>;
  };
  if (parsed.lockfileVersion !== 1 || !Array.isArray(parsed.cards)) {
    throw new Error(`Invalid card lockfile: ${path}`);
  }
  const cards: CardLockEntry[] = parsed.cards.map((entry) => ({
    ...entry,
    skills: entry.skills ?? entry.manifest.skills?.include ?? [],
    registry: null,
  }));
  return { lockfileVersion: 1, cards };
}
```

Update `writeCardLock` to no schema changes besides the type — the serializer just stringifies. The JSON serializer naturally includes `skills` and `registry`.

In `cli/core/card-project.ts::resolveProjectCards`, populate the new fields explicitly so the in-memory representation always has them:

```ts
export async function resolveProjectCards(agentsDir: string, specs: string[]): Promise<CardLockEntry[]> {
  const resolved = await Promise.all(specs.map((spec) => resolveCard(agentsDir, spec)));
  return resolved
    .map((card) => ({
      name: card.name,
      requested: card.requested,
      version: card.version,
      path: card.dir,
      integrity: card.integrity,
      manifest: card.manifest,
      skills: card.manifest.skills?.include ?? [],
      registry: null as null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

### Acceptance criteria

- New tests in `core-card-lock.test.ts` pass.
- `core-diagnostics-sections.test.ts` is updated for the new required lockfile fields and continues to pass.
- Existing tests that touch lockfile entries continue to pass.
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-card-lock.test.ts test/core-diagnostics-sections.test.ts test/commands-card-consumer.test.ts
bun test
bun run typecheck
```

---

## T4 — Card-Skill Resolver Module

### Objective

Introduce `cli/core/card-skill-resolver.ts` as the single attribution authority. Layer 1 = card-bundled. Layer 2 = user-defaults (delegates to `findAvailableSkill`).

### Files

- `cli/core/card-skill-resolver.ts` (new)
- `test/core-card-skill-resolver.test.ts` (new)

### Tests first

Create `test/core-card-skill-resolver.test.ts`:

```ts
// ABOUTME: Verifies the unified card-aware skill resolver across Layer 1 and Layer 2.
// ABOUTME: Protects the Wave 1 contract that card-bundled skills win over user-defaults.

import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot, scaffoldCliFixture, publishCardWithSkills } from "./helpers";
import { resolveSkillSource } from "../cli/core/card-skill-resolver";
import { resolveProjectCards } from "../cli/core/card-project";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("resolveSkillSource returns Layer 1 attribution for a card-bundled skill", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const versionDir = await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["polish"] });
  const lockedCards = await resolveProjectCards(fixture.agentsDir, ["@me/backend@^1.0.0"]);

  const resolved = await resolveSkillSource("polish", lockedCards, fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("card");
  if (resolved.layer !== "card") throw new Error();
  expect(resolved.cardName).toBe("@me/backend");
  expect(resolved.cardVersion).toBe("1.0.0");
  expect(resolved.path).toBe(join(versionDir, "skills", "polish"));
});

test("resolveSkillSource returns Layer 2 attribution for a name not in any card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  // alpha exists in skills/shared but is not in any card
  const lockedCards: any[] = [];

  const resolved = await resolveSkillSource("alpha", lockedCards, fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("user-default");
});

test("resolveSkillSource returns missing when neither layer provides the skill", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const resolved = await resolveSkillSource("ghost", [], fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("missing");
});

test("resolveSkillSource prefers Layer 1 even when the same name exists in Layer 2", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  // 'alpha' is already in skills/shared (from scaffoldCliFixture); also publish a card that bundles it.
  const versionDir = await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
  const lockedCards = await resolveProjectCards(fixture.agentsDir, ["@me/backend@^1.0.0"]);

  const resolved = await resolveSkillSource("alpha", lockedCards, fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("card");
  if (resolved.layer !== "card") throw new Error();
  expect(resolved.path).toBe(join(versionDir, "skills", "alpha"));
});

test("resolveSkillSource walks cards in lockfile order on conflict (first wins)", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const aDir = await publishCardWithSkills(fixture, { name: "@me/a", skills: ["shared"] });
  const bDir = await publishCardWithSkills(fixture, { name: "@me/b", skills: ["shared"] });
  // resolveProjectCards sorts alphabetically by name, so @me/a comes first
  const lockedCards = await resolveProjectCards(fixture.agentsDir, ["@me/b@^1.0.0", "@me/a@^1.0.0"]);

  const resolved = await resolveSkillSource("shared", lockedCards, fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("card");
  if (resolved.layer !== "card") throw new Error();
  expect(resolved.cardName).toBe("@me/a");
  expect(resolved.path).toBe(join(aDir, "skills", "shared"));
});

test("resolveSkillSource returns missing when card store skill dir does not exist on disk", async () => {
  // Defensive case — publish validation should prevent this, but if a card store gets corrupted
  // the resolver must not silently fall through.
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/c", skills: ["polish"] });
  const lockedCards = await resolveProjectCards(fixture.agentsDir, ["@me/c@^1.0.0"]);
  // Delete the on-disk skill dir to simulate corruption.
  await rm(join(lockedCards[0]!.path, "skills", "polish"), { recursive: true });

  const resolved = await resolveSkillSource("polish", lockedCards, fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("missing");
  if (resolved.layer !== "missing") throw new Error();
  expect(resolved.reason).toContain("corrupt");
});
```

Run:

```bash
bun test test/core-card-skill-resolver.test.ts
```

Expect FAIL.

### Implementation

Create `cli/core/card-skill-resolver.ts`:

```ts
// ABOUTME: Resolves skill names to their authoritative source: card store first, user-defaults second.
// ABOUTME: Single attribution authority shared by syncSkills, diagnostics, and dry-run planning.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import { findAvailableSkill, type SkillScope } from "./skills";

export type ResolvedSkillSource =
  | {
      layer: "card";
      cardName: string;
      cardVersion: string;
      path: string;
    }
  | {
      layer: "user-default";
      path: string;
      scope: SkillScope;
    }
  | {
      layer: "missing";
      reason: string;
    };

export async function resolveSkillSource(
  name: string,
  lockedCards: CardLockEntry[],
  repoRoot: string,
  agentsDir: string,
): Promise<ResolvedSkillSource> {
  // Layer 1: card-bundled. First card in lockfile order whose skills[] contains the name wins.
  for (const card of lockedCards) {
    if (!card.skills.includes(name)) continue;
    const path = join(card.path, "skills", name);
    if (!existsSync(path)) {
      return {
        layer: "missing",
        reason: `card store is corrupt for ${card.name}@${card.version}: missing skills/${name}. Re-run \`bgng card update\` after republishing the card.`,
      };
    }
    return {
      layer: "card",
      cardName: card.name,
      cardVersion: card.version,
      path,
    };
  }
  // Layer 2: user-defaults.
  const userDefault = await findAvailableSkill(repoRoot, agentsDir, name);
  if (userDefault) {
    return {
      layer: "user-default",
      path: userDefault.path,
      scope: userDefault.scope,
    };
  }
  return {
    layer: "missing",
    reason: `skill '${name}' is not provided by any applied card and is not available as a user-default; check spelling or add a card that provides it.`,
  };
}
```

### Acceptance criteria

- All tests in `core-card-skill-resolver.test.ts` pass.
- No call sites use `resolveSkillSource` yet (those land in T5).
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-card-skill-resolver.test.ts
bun test
bun run typecheck
```

---

## T5 — Wire Resolver Into Write Path and Diagnostics

### Objective

Replace `findAvailableSkill` consumers in the write path (`syncSkills`) and the diagnostics path (`detectStaleSkillSymlinks`) with `resolveSkillSource`. Symlink targets now point at the card store when a card supplies the skill. Unresolved names cause a hard error. Also fix doctor/status validation so card-bundled-only skills are treated as available rather than falsely flagged as unknown.

### Files

- `cli/core/sync.ts`
- `cli/core/skills.ts`
- `cli/core/diagnostics.ts`
- `test/scenarios-card-bundled-only.test.ts` (new)
- `test/scenarios-card-materialization.test.ts` (update assertions)
- `test/commands-doctor.test.ts` (regression for card-only skill availability)
- `test/core-skills.test.ts` (hard-failure contract update)

### Tests first

#### T5.test.A — End-to-end regression for Matt's exact case

Create `test/scenarios-card-bundled-only.test.ts`:

```ts
// ABOUTME: Verifies a card whose skill names are NOT present in skills/shared/ materializes from the card store.
// ABOUTME: Direct regression for the 2026-05-26 Matt smoke-test findings B and C.

import { afterEach, expect, test } from "bun:test";
import { existsSync, readlinkSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("cards bundle skills not in skills/shared/ and write symlinks into the card store", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  // 'polish' and 'animate' do not exist in skills/shared/ (the fixture only creates alpha+beta).
  const versionDir = await publishCardWithSkills(fixture, {
    name: "@me/frontend-design",
    skills: ["polish", "animate", "alpha"],  // alpha also exists in skills/shared
  });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "bgng", "config.json"),
    JSON.stringify({ version: 1, cards: ["@me/frontend-design@^1.0.0"] }, null, 2),
  );

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  for (const skill of ["polish", "animate", "alpha"]) {
    const linkPath = join(projectDir, ".claude", "skills", skill);
    expect(existsSync(linkPath)).toBe(true);
    expect(readlinkSync(linkPath)).toBe(join(versionDir, "skills", skill));
  }
});

test("bgng write fails loud when a card declares a skill that is not on disk anywhere", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  // Project overlay references a skill that exists nowhere.
  await writeFile(
    join(projectDir, ".agents", "bgng", "config.json"),
    JSON.stringify({ version: 1, skills: { include: ["ghost-skill"] } }, null, 2),
  );

  const write = await runAgentsCli(["write"], envFor(fixture), projectDir);

  expect(write.exitCode).not.toBe(0);
  expect(write.stderr).toContain("ghost-skill");
  expect(write.stderr).toContain("not provided by any applied card");
});
```

(Add a small helper `envFor` to `test/helpers.ts` if it does not already exist; the current pattern is to inline it in each test file. Extracting it removes ~20 lines of duplication across Wave 1 tests.)

#### T5.test.B — Existing materialization scenario asserts new symlink target

Update `test/scenarios-card-materialization.test.ts` assertions: the symlink for `alpha` should now point into the card store rather than `skills/shared/alpha`. The test's fixture setup is also updated per T1.4 to use `publishCardWithSkills`.

#### T5.test.C — Doctor does not falsely report card-only skills as unknown

Extend `test/commands-doctor.test.ts` with a regression that publishes a card containing a skill not present in `skills/shared/`, applies that card to a project, and then asserts:

- `projectConfigIssues` does **not** contain `Unknown skill reference: "<name>"`
- `cards.warnings` does **not** contain `references unavailable skills`

This is a real gap in the current codepath: `buildDoctorReportWithProject` builds `availableSkillNames` from repo/package inventory only, so card-bundled-only skills are misreported today.

#### T5.test.D — Low-level contract update for missing includes

Update the existing `test/core-skills.test.ts` case `syncSkills warns when include references a nonexistent skill` so it now expects a rejection instead of a warning. D2 changes the contract; keeping the old test would encode the bug.

Run:

```bash
bun test test/scenarios-card-bundled-only.test.ts test/scenarios-card-materialization.test.ts test/commands-doctor.test.ts test/core-skills.test.ts
```

Expect FAIL on the bundled-only test (current code resolves via Layer 2 only) and on the updated materialization test (current code symlinks to `skills/shared/alpha`).

### Implementation

#### T5.1 — Pass `lockedCards` through `syncRepository`

In `cli/core/sync.ts::syncRepository` (around lines 218–235), keep the existing card → effective config merge for servers/extensions/targets, but ALSO thread `lockedCards` to `syncSkills`:

```ts
let lockedCards: CardLockEntry[] = [];
if (projectConfigPath) {
  const projectConfig = await loadProjectConfig(projectConfigPath);
  lockedCards = projectConfig.cards ? await resolveProjectCards(normalized.agentsDir, projectConfig.cards) : [];
  // ... existing merge code stays ...
}

// ...

if (!normalized.mcpOnly) {
  const skillsResult = await syncSkillsCore(scopedOptions, skillOverrides, lockedCards);
  // ...
}
```

#### T5.2 — `syncSkills` consumes the resolver

In `cli/core/skills.ts::syncSkills`, accept `lockedCards` and switch the includes loop:

```ts
import type { CardLockEntry } from "./card-lock";
import { resolveSkillSource } from "./card-skill-resolver";

export async function syncSkills(
  options: NormalizedSyncOptions,
  overrides?: SkillSyncOverrides,
  lockedCards: CardLockEntry[] = [],
): Promise<SyncResult> {
  // ... existing setup ...

  const excluded = new Set(overrides?.exclude ?? []);
  const includes = (overrides?.include ?? []).filter((name) => !excluded.has(name));

  // Resolve each included name through the unified resolver.
  type ResolvedItem = { name: string; source: Awaited<ReturnType<typeof resolveSkillSource>> };
  const resolved: ResolvedItem[] = [];
  const errors: string[] = [];
  for (const name of includes) {
    const source = await resolveSkillSource(name, lockedCards, options.repoRoot, options.agentsDir);
    if (source.layer === "missing") {
      errors.push(source.reason);
      continue;
    }
    resolved.push({ name, source });
  }
  if (errors.length > 0) {
    // D2 — hard failure.
    throw new Error(`bgng write cannot resolve all skills:\n  - ${errors.join("\n  - ")}`);
  }

  // ... keep the curated-dir and scope-dir passes as-is ...

  for (const { name, source } of resolved) {
    const symlinkTarget = source.path;
    const scope =
      source.layer === "card" ? "shared" :  // card-bundled skills materialize to both Claude and Codex by default
      source.scope;
    if (!options.target || options.target === "claude") {
      if (scope === "shared" || scope === "claude-only") {
        desiredClaude.add(name);
        ensureDirSymlink(join(toolPaths.claudeSkills, name), symlinkTarget, options.dryRun, result);
        managedPaths.push({ path: `.claude/skills/${name}`, kind: "symlink", target: symlinkTarget });
      }
    }
    if (!options.target || options.target === "codex") {
      if (scope === "shared" || scope === "codex-only") {
        desiredCodex.add(name);
        ensureDirSymlink(join(toolPaths.codexSkills, name), symlinkTarget, options.dryRun, result);
        managedPaths.push({ path: `.codex/skills/${name}`, kind: "symlink", target: symlinkTarget });
      }
    }
  }

  // ... existing stale-symlink reporting at the end stays ...
}
```

Notes:

- Card-bundled skills are treated as "shared" scope (materialize to both Claude and Codex). This is the safest default and matches today's behavior for cards that contain skills already in `skills/shared/`. If a Wave 2 feature ever needs per-tool scoping for card skills, it can land via `card.json::skills.scopeMap` or similar.
- The hard error from D2 is thrown BEFORE any symlink writes happen, so a partial write does not leave the project in a half-applied state.

#### T5.3 — Diagnostics consumes the resolver

In `cli/core/diagnostics.ts::detectStaleSkillSymlinks` (line 390), replace the `findAvailableSkill` call:

```ts
async function detectStaleSkillSymlinks(
  repoRoot: string,
  agentsDir: string,
  toolRoot: string,
  skillOverrides: { include?: string[]; exclude?: string[] } | undefined,
  lockedCards: CardLockEntry[],     // new parameter
) {
  // ... setup ...
  const excluded = new Set(skillOverrides?.exclude ?? []);
  const resolvedSources = await Promise.all(
    (skillOverrides?.include ?? [])
      .filter((name) => !excluded.has(name))
      .map(async (name) => ({
        name,
        source: await resolveSkillSource(name, lockedCards, repoRoot, agentsDir),
      })),
  );
  const desiredClaude = new Set([
    ...curated.map((entry) => entry.name).filter((name) => !excluded.has(name)),
    ...scopes.claudeOnly.map((skill) => skill.name).filter((name) => !excluded.has(name)),
    ...resolvedSources
      .filter((entry) => entry.source.layer === "card" || (entry.source.layer === "user-default" && (entry.source.scope === "shared" || entry.source.scope === "claude-only")))
      .map((entry) => entry.name),
  ]);
  // ... mirror for codex ...
}
```

Update the call site of `detectStaleSkillSymlinks` to pass `lockedCards` (which the diagnostics function already loads at line 156).

#### T5.4 — Doctor/status validation treats card-bundled skills as available

`detectStaleSkillSymlinks` is not the only diagnostics path that reasons about skill availability. In `cli/core/diagnostics.ts::buildDoctorReportWithProject`, the current code builds:

```ts
const availableSkillNames = new Set(skillInventory.map((skill) => skill.name));
```

That is insufficient for Wave 1 because `skillInventory` only knows about repo/package skills, not card-bundled store content. Replace it with a union that includes locked card contributions:

```ts
const availableSkillNames = new Set([
  ...skillInventory.map((skill) => skill.name),
  ...cardLocks.flatMap((card) => card.skills.length > 0 ? card.skills : (card.manifest.skills?.include ?? [])),
]);
```

Use this union consistently for both:

- the `Unknown skill reference: "<name>"` checks against `projectWithCards.skills`
- the `Card <name>@<version> references unavailable skills` warning filter

Without this change, the main Wave 1 success case (`polish` exists only inside a card) still produces false doctor failures even after write-time resolution is fixed.

### Acceptance criteria

- New tests in `scenarios-card-bundled-only.test.ts` pass.
- `scenarios-card-materialization.test.ts` passes with its updated assertions.
- `commands-doctor.test.ts` passes with the new "card-only skill is not unknown" regression.
- `core-skills.test.ts` passes with the missing-include hard-failure expectation.
- `scenarios-idempotency.test.ts` continues to pass (a second `bgng write` is a no-op).
- `commands-status-why.test.ts` continues to pass (card attribution in `--why` output unchanged).
- A `bgng write` against a project with an unresolved skill name fails with the new error message; exit code is non-zero.
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/scenarios-card-bundled-only.test.ts test/scenarios-card-materialization.test.ts test/commands-doctor.test.ts test/core-skills.test.ts test/scenarios-idempotency.test.ts test/commands-status-why.test.ts
bun test
bun run typecheck
```

---

## T6 — One-Time Integrity Recompute on First Apply

### Objective

When a card's stored integrity hash was computed under the v1.1 manifest-only algorithm, transparently recompute it under the Wave 1 content-tree algorithm on next read. Emit a single INFO line per upgraded card. No `--force` required (D3).

### Files

- `cli/core/card-store.ts`
- `cli/core/card-project.ts`

### Tests first

In `test/core-card-integrity-content.test.ts` (extend, do not create a separate file), add:

```ts
test("resolveCard recomputes and rewrites stale .integrity from a v1.1 manifest hash", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/legacy", skills: ["polish"] });
  // Simulate a v1.1 publish: overwrite .integrity with a manifest-only hash and clobber versions.json.
  const versionDir = join(fixture.agentsDir, "bgng", "cards", "@me", "legacy", "1.0.0");
  const manifest = JSON.parse(await readFile(join(versionDir, "card.json"), "utf8"));
  const legacyHash = `sha256-${createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}`;
  await writeFile(join(versionDir, ".integrity"), `${legacyHash}\n`);
  const pkgIndexPath = join(fixture.agentsDir, "bgng", "cards", "@me", "legacy", "versions.json");
  const pkgIndex = JSON.parse(await readFile(pkgIndexPath, "utf8"));
  pkgIndex.versions[0].integrity = legacyHash;
  await writeFile(pkgIndexPath, JSON.stringify(pkgIndex, null, 2));

  const resolved = await resolveCard(fixture.agentsDir, "@me/legacy@^1.0.0");

  expect(resolved.integrity.startsWith("sha256-")).toBe(true);
  expect(resolved.integrity).not.toBe(legacyHash);
  // .integrity and versions.json are updated on disk.
  expect((await readFile(join(versionDir, ".integrity"), "utf8")).trim()).toBe(resolved.integrity);
  const reparsed = JSON.parse(await readFile(pkgIndexPath, "utf8"));
  expect(reparsed.versions[0].integrity).toBe(resolved.integrity);
});
```

Run:

```bash
bun test test/core-card-integrity-content.test.ts
```

Expect FAIL on the new case.

### Implementation

In `cli/core/card-store.ts::resolveCard`, after computing the manifest and looking up the version dir, recompute integrity from disk. If it differs from the stored value, write back:

```ts
export async function resolveCard(agentsDir: string, ref: string): Promise<ResolvedCard> {
  // ... existing file-path branch (unchanged once T2 lands) ...

  // Published branch:
  const versions = await listPublishedVersions(agentsDir, parsed.name);
  const range = parsed.range || "*";
  if (!validRange(range) && !isStrictSemver(range)) {
    throw new Error(`Invalid card version range: ${ref}`);
  }
  const version = maxSatisfying(versions, range) ?? (versions.includes(range) ? range : null);
  if (!version) {
    throw new Error(`No published version satisfies ${ref}`);
  }
  const manifest = await readPublishedCardManifest(agentsDir, parsed.name, version);
  const versionDir = resolveCardVersionDir(agentsDir, parsed.name, version);
  const computedIntegrity = await computeCardIntegrity(versionDir);

  const index = await loadCardPackageIndex(agentsDir, parsed.name);
  const recordedEntry = index.versions.find((entry) => entry.version === version);
  if (recordedEntry && recordedEntry.integrity !== computedIntegrity) {
    console.info(
      `[bgng] upgraded integrity hash for ${parsed.name}@${version}: was ${recordedEntry.integrity.slice(0, 20)}..., now ${computedIntegrity.slice(0, 20)}...`,
    );
    recordedEntry.integrity = computedIntegrity;
    await writeCardPackageIndex(agentsDir, index);
    await writeFile(join(versionDir, ".integrity"), `${computedIntegrity}\n`);
  } else if (!recordedEntry) {
    // No package-index entry; this is an orphan version. Treat as upgrade.
    await writeFile(join(versionDir, ".integrity"), `${computedIntegrity}\n`);
  }

  return {
    name: parsed.name,
    requested: formatCardSpec(parsed.name, range),
    version,
    dir: versionDir,
    integrity: computedIntegrity,
    manifest,
  };
}
```

For the file branch (where `parsed.filePath` is set), the integrity is computed fresh on every call against the live directory; no recompute logic needed there.

In `cli/core/card-project.ts::resolveProjectCards`, the upgrade falls out naturally: each call to `resolveCard` now returns the recomputed integrity, which `resolveProjectCards` puts into the lock entry. The lockfile written by `writeProjectCards → writeCardLock` will contain the upgraded value.

A separate "lockfile was written with v1.1 integrity, recompute on first apply" path is not needed because every apply re-resolves via `resolveCard`, which now recomputes.

### Acceptance criteria

- New test in `core-card-integrity-content.test.ts` passes.
- `bgng card apply` (or top-level `bgng apply`) against a card previously published under v1.1 emits the upgrade INFO line and writes the new integrity to `.integrity` and `versions.json`.
- Re-running `bgng card apply` against an already-upgraded card emits no upgrade line (the recomputed hash matches the stored one).
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-card-integrity-content.test.ts test/commands-card-consumer.test.ts
bun test
bun run typecheck
```

---

## T7 — Planner Dedup and Dry-Run Layer Annotation

### Objective

Eliminate duplicate symlink intents in `bgng write --dry-run` output (Matt finding D). Annotate each write change with the resolution layer that won.

### Files

- `cli/core/sync.ts`
- `cli/core/skills.ts` (the `result.changes.push` strings)
- `test/commands-write.test.ts` (update snapshot expectations)
- `test/commands-write-drift.test.ts` (sanity check)

### Tests first

In `test/commands-write.test.ts` (or a new dedicated test file `test/commands-write-dryrun-layers.test.ts` if the existing one is dense):

```ts
test("write --dry-run annotates symlink intents with their winning layer", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "bgng", "config.json"),
    JSON.stringify({ version: 1, cards: ["@me/backend@^1.0.0"] }, null, 2),
  );

  const dryRun = await runAgentsCli(["write", "--dry-run", "--json"], envFor(fixture), projectDir);

  expect(dryRun.exitCode).toBe(0);
  const parsed = JSON.parse(dryRun.stdout);
  const symlinkLines = parsed.changes.filter((c: string) => c.startsWith("symlink ") && c.includes("alpha"));
  // Exactly one symlink per tool (claude + codex), not two competing for the same path.
  expect(symlinkLines).toHaveLength(2);
  for (const line of symlinkLines) {
    expect(line).toContain("← card @me/backend@1.0.0");
  }
});

test("write --dry-run dedupes when both user-default and card supply the same name", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  // alpha is curated AND will be in a card.
  await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "bgng", "config.json"),
    JSON.stringify({ version: 1, cards: ["@me/backend@^1.0.0"] }, null, 2),
  );

  const dryRun = await runAgentsCli(["write", "--dry-run", "--json"], envFor(fixture), projectDir);

  expect(dryRun.exitCode).toBe(0);
  const parsed = JSON.parse(dryRun.stdout);
  const lines = parsed.changes.filter((c: string) => c.includes(".claude/skills/alpha"));
  expect(lines).toHaveLength(1);                                  // dedupe in the planner
  expect(lines[0]).toContain("← card @me/backend@1.0.0");          // card layer wins
  expect(lines[0]).toContain("(also available: user-default)");    // alternative is visible
});
```

Run:

```bash
bun test test/commands-write.test.ts
```

Expect FAIL.

### Implementation

The planner today emits change strings directly into `result.changes` inside `ensureDirSymlink` / `ensureFileSymlink` (sync.ts:90, skills.ts:61). Wave 1 introduces a thin layer:

1. Compute desired managed paths and their resolved targets into a `Map<path, intent>` BEFORE pushing to `result.changes`.
2. After dedup, push the formatted change string with the layer annotation.

The cleanest way is to refactor `syncSkills` so the loop that creates symlink intents builds a `Map` first:

```ts
type SymlinkIntent = {
  linkPath: string;
  target: string;
  managed: ManagedPath;
  layerLabel: string;            // "card @me/backend@1.0.0" | "user-default"
  alsoAvailable?: string[];      // other layer labels that lost
};

const claudeIntents = new Map<string, SymlinkIntent>();
const codexIntents = new Map<string, SymlinkIntent>();

// ... iterate curated, scope dirs, resolved card-aware sources, recording into the maps ...

function recordIntent(map: Map<string, SymlinkIntent>, intent: SymlinkIntent) {
  const prior = map.get(intent.linkPath);
  if (!prior) {
    map.set(intent.linkPath, intent);
    return;
  }
  // Existing wins per the resolver (which is consulted in the includes loop after curated/scope passes).
  // Track the loser as alsoAvailable.
  prior.alsoAvailable = [...(prior.alsoAvailable ?? []), intent.layerLabel];
  map.set(intent.linkPath, prior);
}

// After both maps are populated, render:
for (const intent of [...claudeIntents.values(), ...codexIntents.values()]) {
  const suffix = intent.alsoAvailable && intent.alsoAvailable.length > 0
    ? ` ← ${intent.layerLabel} (also available: ${intent.alsoAvailable.join(", ")})`
    : ` ← ${intent.layerLabel}`;
  // ensureDirSymlink decides whether to write or skip; the change string already carries the annotation.
  ensureDirSymlinkWithLabel(intent.linkPath, intent.target, options.dryRun, result, suffix);
  managedPaths.push(intent.managed);
}
```

Extract a variant of `ensureDirSymlink` that accepts the suffix and appends it to the pushed `symlink ...` change string. Keep the original `ensureDirSymlink` for non-skill paths (cursor file symlinks etc., which already have a single source).

Final dry-run change format becomes:

```
symlink /project/.claude/skills/alpha -> ~/.agents/bgng/cards/@me/backend/1.0.0/skills/alpha ← card @me/backend@1.0.0
```

or when overridden:

```
symlink /project/.claude/skills/alpha -> ~/.agents/bgng/cards/@me/backend/1.0.0/skills/alpha ← card @me/backend@1.0.0 (also available: user-default)
```

### Acceptance criteria

- New dry-run annotation tests pass.
- `scenarios-idempotency.test.ts` continues to pass (second write still produces zero changes).
- `commands-write.test.ts` and `commands-write-drift.test.ts` continue to pass with their snapshot expectations updated where layer annotations appear.
- Existing tests that count change strings count the SAME number of changes as before (deduping doesn't create or remove changes, only labels them and prevents the dry-run double-listing).
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/commands-write.test.ts test/commands-write-drift.test.ts test/scenarios-idempotency.test.ts
bun test
bun run typecheck
```

---

## T8 — Legacy Detection Short-Circuit Fix

### Objective

Make `detectLegacyLayout` continue to report `true` while legacy artifacts exist on disk, regardless of whether the cards-era store has been initialized. Closes Matt finding A.

T8 has **no dependencies** and may land at any time during the wave.

### Files

- `cli/core/migration.ts`
- `test/core-migration.test.ts`

### Tests first

In `test/core-migration.test.ts`, add:

```ts
test("detectLegacyLayout returns true even after the cards-era store is initialized", async () => {
  const fixture = await scaffoldPreCardsFixture();

  // Initialize the cards-era store WITHOUT migrating. This is what `bgng card new` triggers.
  await ensureStoreInitialized(fixture.agentsDir);

  expect(detectLegacyLayout(fixture.agentsDir)).toBe(true);
});

test("migrateStore moves forward legacy data even when the cards-era store was preemptively initialized", async () => {
  const fixture = await scaffoldPreCardsFixture();
  await ensureStoreInitialized(fixture.agentsDir);

  const result = await migrateStore({ agentsDir: fixture.agentsDir });

  expect(result.steps).not.toContain("no legacy layout detected");
  expect(existsSync(join(fixture.agentsDir, "bgng", "mcp-servers", "context7.json"))).toBe(true);
  expect(detectLegacyLayout(fixture.agentsDir)).toBe(false);
});
```

Imports to add at the top of the file:

```ts
import { ensureStoreInitialized } from "../cli/core/card-store";
```

Run:

```bash
bun test test/core-migration.test.ts
```

Expect FAIL on both new tests.

### Implementation

In `cli/core/migration.ts:43`, change:

```ts
return (hasLegacyConfig || hasLegacyLibrary || hasLegacyPackages) && !hasStore;
```

to:

```ts
return hasLegacyConfig || hasLegacyLibrary || hasLegacyPackages;
```

Verify that `migrateStore` (line 93) still works when `resolveStoreRoot(agentsDir)` already exists. Read the function: it renames the existing store root into the archive path (line 137–138) and renames the staging into place (line 146). The "store already exists" path is supported — the existing store gets archived alongside the legacy artifacts.

One nuance worth flagging in the plan: when `ensureStoreInitialized` was called preemptively, the existing `bgng/` dir contains `store.json` + empty `cards`, `sources`, etc. When `migrateStore` archives it and replaces with the migrated staging, any work done in the preemptive store (e.g., card sources the user already created) ends up in the archive, not in the new active store. This is technically a regression — but in practice, the only way to reach this state is to (a) be on legacy layout and (b) run a card command before migrating. Once Wave 1 lands, `bgng card new` (and other store-writing commands) should ideally check `detectLegacyLayout` and refuse with a "run `bgng store migrate` first" error.

Add this guard at the top of `createCardSource` and any other store-writing card entry points:

```ts
if (detectLegacyLayout(options.agentsDir)) {
  throw new Error(
    "Legacy bgng layout detected. Run `bgng store migrate` before authoring or applying cards.",
  );
}
```

Apply to:

- `createCardSource` (card-store.ts:136)
- `publishCard` (card-store.ts:221)
- `resolveCard` (card-store.ts:265)
- `ensureStoreInitialized` itself need NOT be guarded — it is the safe primitive. But callers above should guard.

Add a corresponding test that runs `bgng card new` on a legacy fixture and asserts a clear error pointing the user at migrate.

### Acceptance criteria

- New `core-migration.test.ts` cases pass.
- Running `bgng card new` on a legacy fixture exits non-zero with a message directing the user to `bgng store migrate`.
- Existing migration tests continue to pass.
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-migration.test.ts test/commands-store.test.ts test/commands-card-author.test.ts
bun test
bun run typecheck
```

---

## Cross-Task Verification

After all tasks land (or at any natural checkpoint), run the full bar:

```bash
bun test
bun run typecheck
bun run verify:release
```

Expected: every test green, typecheck clean, `verify:release` exits zero.

### Smoke test against a real project

Set up a sandbox project that mirrors Matt's smoke test:

```bash
# in a clean tmp dir
mkdir wave1-smoke && cd wave1-smoke
git init
mkdir -p .agents/bgng
echo '{"version": 1}' > .agents/bgng/config.json

# Author a card with skills NOT in the harness repo's skills/shared/
bgng card new test-card --scope @me --no-git
# Manually create skills/polish/SKILL.md inside ~/.agents/bgng/sources/@me/test-card/
# Set card.json::skills.include = ["polish"]
bgng card publish @me/test-card

# Apply and write
bgng apply @me/test-card@^1.0.0
bgng write --dry-run     # confirm `← card @me/test-card@1.0.0` annotation
bgng write
readlink .claude/skills/polish    # should point into ~/.agents/bgng/cards/@me/test-card/1.0.0/skills/polish

# Idempotency
bgng write --json | jq '.changes'  # empty array

# Status provenance
bgng status --explain
bgng status --why polish
```

Confirm:

- `polish` symlink resolves into the card store, not the harness repo.
- `--dry-run` shows the layer annotation.
- `--explain` and `--why polish` attribute to `@me/test-card@1.0.0`.
- Second write is a no-op.
- Removing `skills/polish/SKILL.md` from the card store and re-running `bgng write` fails with the "card store is corrupt" error from `resolveSkillSource`.

---

## Test Inventory Summary

### New test files

| File | Purpose | Task |
|---|---|---|
| `test/core-card-integrity-content.test.ts` | Content-tree integrity hashing + one-time upgrade | T2, T6 |
| `test/core-card-skill-resolver.test.ts` | Unified resolver across Layer 1 / Layer 2 | T4 |
| `test/scenarios-card-bundled-only.test.ts` | End-to-end regression for Matt findings B and C | T5 |

### Extended test files

| File | New cases | Task |
|---|---|---|
| `test/core-card-manifest.test.ts` | `skills.shared` rejection cases | T1 |
| `test/commands-card-author.test.ts` | Publish-time skill-dir validation | T1 |
| `test/core-card-lock.test.ts` | `skills[]` and `registry: null` field handling, legacy entry backfill | T3 |
| `test/core-diagnostics-sections.test.ts` | Lockfile fixture updated for additive fields | T3 |
| `test/scenarios-card-materialization.test.ts` | Symlink targets the card store (assertion update) | T5 |
| `test/commands-status-why.test.ts` | Publish fixture updated; card provenance unchanged | T1, T5 |
| `test/commands-doctor.test.ts` | Card-bundled-only skills are not falsely reported as unknown | T5 |
| `test/core-skills.test.ts` | Missing include becomes hard failure, not warning | T5 |
| `test/commands-write.test.ts` (or new `commands-write-dryrun-layers.test.ts`) | Layer-annotated dry-run output, dedup | T7 |
| `test/core-migration.test.ts` | Detection survives store initialization; legacy guard on card commands | T8 |

### Tests that must continue to pass without modification

- `test/scenarios-idempotency.test.ts`
- `test/scenarios-scope-isolation.test.ts`
- `test/scenarios-cleanup.test.ts`
- `test/scenarios-user-journeys.test.ts`
- `test/commands-status.test.ts`

If any of these fail mid-implementation, that's a regression to investigate before continuing — do not paper over.

---

## Helper Additions

`test/helpers.ts` gains:

```ts
// Convenience env builder used across all card-touching tests.
export function envFor(fixture: { repoRoot: string; homeDir: string; agentsDir: string }) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

// Publish a card with a complete skill set; returns the resolved version directory.
// Add `existsSync` to the helper imports in test/helpers.ts for the source-exists check below.
export async function publishCardWithSkills(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { name: string; version?: string; skills: string[]; servers?: Record<string, unknown> },
): Promise<string> {
  const version = options.version ?? "1.0.0";
  const match = options.name.match(/^(@[^/]+)\/(.+)$/);
  if (!match) throw new Error(`Use a scoped card name in tests: ${options.name}`);
  const [, scope, cardName] = match;

  const sourceRoot = join(fixture.agentsDir, "bgng", "sources", scope!, cardName!);
  if (!existsSync(join(sourceRoot, "card.json"))) {
    expect((await runAgentsCli(["card", "new", options.name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  }
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = version;
  manifest.skills = { include: options.skills };
  if (options.servers) manifest.servers = options.servers;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const skill of options.skills) {
    const skillDir = join(sourceRoot, "skills", skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skill}\ndescription: ${skill}\n---\n`);
  }

  const published = await runAgentsCli(["card", "publish", options.name], envFor(fixture));
  expect(published.exitCode).toBe(0);
  return join(fixture.agentsDir, "bgng", "cards", scope!, cardName!, version);
}
```

This helper lands as part of T1. Subsequent tasks reuse it; existing tests that inline a publish dance are migrated.

---

## Rollback Strategy

If Wave 1 has to be reverted mid-flight or after merge:

1. **Branch-level revert.** All Wave 1 work lands on a feature branch off `main`. `git revert <merge-commit>` cleanly undoes the schema changes and resolver introduction.
2. **Lockfile compatibility.** Wave 1 lockfiles contain the additive `skills[]` and `registry: null` fields. Old (pre-Wave-1) readers ignored unknown keys, but the production codebase before Wave 1 does not have this tolerance built into `loadCardLock`. If revert is needed after Wave 1 lockfiles are in the wild, projects with Wave 1 lockfiles will error on `loadCardLock` from the reverted code. Manual fix: delete `.agents/bgng/card.lock` and re-apply.
3. **Card store `.integrity` rewrites.** Wave 1 transparently rewrites `.integrity` and `versions.json` entries with content-tree hashes. After revert, the v1.1 manifest-only hash code will read these (now content-tree) values and compute different ones, but since v1.1 never verified anything, the divergence is silent and harmless.
4. **The legacy-detection fix (T8)** is fully revert-safe — dropping `&& !hasStore` only restores the broken behavior; nothing depends on it not being there.

Practical advice: do not revert just Wave 1 commits. If revert is needed, revert the whole feature branch.

---

## Risk Register

| # | Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|---|
| R0 | The branch baseline is already red on `bun run typecheck`, so Wave 1 can start from a non-green state unless explicitly gated. | High | High | Treat the current typecheck failures as a preflight blocker; fix or scope them before starting T1. |
| R1 | Existing test fixtures that publish incomplete cards break under T1's publish validation. | High | Low | Per D5, update the affected fixtures through the shared helper rather than scattered one-off edits. |
| R2 | Lockfile rewrite on first apply produces a one-time diff. | High | Low | Document in PR description; users commit the lockfile after first upgrade. |
| R3 | Symlink target swap from `skills/shared/<name>` → card-store path may surprise users. | Medium | Low | `bgng status --explain` makes the change visible; content is identical at v1.0.0; idempotent reapply confirms. |
| R4 | Hard error on unresolved skill is a contract change vs. today's silent warning. | Medium | Medium | Release notes call it out; the error message is actionable and points at the fix. |
| R5 | Symlinks inside a card source pointing outside the card may produce stable but misleading integrity hashes (target file content changes externally). | Low | Low | Document. Recommend authors copy, not symlink. Future authoring CLI helpers will discourage this. |
| R6 | `ensureStoreInitialized` no longer hides legacy artifacts means users in transition see the legacy warning longer. | High | Low | This is the desired behavior — see Matt finding A. The warning text already directs users to migrate. |
| R7 | T5's hard error throws BEFORE any write — fine — but a project that worked before T5 lands may now fail. | Medium | Medium | Pre-merge smoke test verifies no Wave-0 project fails unexpectedly. Documented in release notes. |
| R8 | A card's `.integrity` rewrite on first read mutates `~/.agents/bgng/` from a read-only context. | Low | Low | The agents dir is always user-writable per existing assumptions; if it isn't, the existing publish/apply paths also fail. |

---

## Definition of Done

All of the following must be true to consider Wave 1 complete:

- [ ] T1 through T8 implemented in the order T1 → T2 → T3 → T4 → T5 → T6 → T7 (T8 may have landed at any point).
- [ ] Every new test from this plan exists and passes.
- [ ] Every "must continue to pass" test still passes.
- [ ] `bun test` reports 0 failures.
- [ ] `bun run typecheck` reports 0 errors.
- [ ] `bun run verify:release` exits zero.
- [ ] The smoke test in **Cross-Task Verification** passes end-to-end.
- [ ] The four Matt findings (A, B, C, D) each have a regression test that fails on `main` and passes on the Wave 1 branch.
- [ ] All ABOUTME comments on new files are present per CLAUDE.md.
- [ ] Commit messages follow the repo's `[type:scope] subject` convention with no AI-attribution markers (per memory file `feedback_no_ai_attribution_in_commits.md`).
- [ ] A completion record is drafted at `.ai/tasks/20_completion_harness-cards-wave-1-implementation.md` mirroring the M-series completion-record format.

---

## Open Questions / Followups (do NOT block Wave 1)

- **Q1**: Should `findAvailableSkill` be kept as the Layer-2 implementation forever, or eventually inlined into `card-skill-resolver`? Today it's still used directly by `curateSkill` and `library/defaults/add-skill`. Decision: keep as-is; the resolver delegates to it. Revisit if those call sites also become cards-aware later.
- **Q2**: Strict mode (refuse Layer 2 fallback entirely) — listed on the v2 roadmap. Wave 1 does not implement it; a `bgng write --strict` flag could be added later as a small follow-up.
- **Q3**: Should `bgng store status` surface "legacy artifacts present" alongside `legacyLayoutDetected: true`? Currently the field is boolean. A future enhancement could enumerate which artifacts are present. Not in scope.
- **Q4**: The `card.json::skills.scopeMap` discussed in T5.2 implementation notes — needed only if a future card wants to ship a Claude-only or Codex-only skill. Not in scope for Wave 1; default-to-shared is fine.

---

## Appendix A — File Reference Index

For grep-friendly direct paths to the lines this plan modifies.

| Reference | File | Line | Description |
|---|---|---|---|
| RES.1 | `cli/core/skills.ts` | 120–122 | `findAvailableSkill` — kept as Layer 2 delegate |
| RES.2 | `cli/core/skills.ts` | 245–357 | `syncSkills` — refactored for resolver-driven attribution (T5.2) |
| RES.3 | `cli/core/skills.ts` | 256 | `findAvailableSkill` call in includes loop — replaced (T5.2) |
| INT.1 | `cli/core/card-store.ts` | 217–219 | `computeCardIntegrity` — rewritten to async, takes versionDir (T2) |
| INT.2 | `cli/core/card-store.ts` | 244 | Publish-time call site (T2) |
| INT.3 | `cli/core/card-store.ts` | 280 | resolveCard file-path branch call site (T2) |
| INT.4 | `cli/core/card-store.ts` | 295 | resolveCard published branch call site (T2, T6) |
| PUB.1 | `cli/core/card-store.ts` | 221–251 | `publishCard` — adds skill-dir validation (T1) |
| RES.4 | `cli/core/card-store.ts` | 265–304 | `resolveCard` — adds validation + integrity recompute (T1, T6) |
| LCK.1 | `cli/core/card-lock.ts` | 9–16 | `CardLockEntry` — adds `skills`, `registry` (T3) |
| LCK.2 | `cli/core/card-lock.ts` | 27–37 | `loadCardLock` — backfills legacy entries (T3) |
| MGN.1 | `cli/core/migration.ts` | 38–44 | `detectLegacyLayout` — drops `!hasStore` (T8) |
| SYN.1 | `cli/core/sync.ts` | 189–267 | `syncRepository` — threads lockedCards (T5.1, T7) |
| SYN.2 | `cli/core/sync.ts` | 96–102 | `uniqueManagedPaths` — dedup helper (T7) |
| DIA.1 | `cli/core/diagnostics.ts` | 390–420 | `detectStaleSkillSymlinks` — consumes resolver (T5.3) |
| DIA.2 | `cli/core/diagnostics.ts` | 156, 205–207, 288–293 | Existing card attribution logic — unchanged (already correct) |
| CPR.1 | `cli/core/card-project.ts` | 26–38 | `resolveProjectCards` — populates `skills`, `registry` (T3) |
| MAN.1 | `cli/core/card-manifest.ts` | 7–19 | `CardManifest` type — adds optional `skills.shared` (T1) |
| MAN.2 | `cli/core/card-manifest.ts` | 38–74 | `validateCardManifest` — rejects non-empty `skills.shared` (T1) |
| NEW.1 | `cli/core/card-skill-resolver.ts` | — | NEW MODULE (T4) |

---

## Appendix B — Suggested Commit Sequence

One PR; commits within the PR follow the order below. All messages use the repo's `[type:scope] subject` convention. No AI-attribution markers (per memory `feedback_no_ai_attribution_in_commits.md`).

```
[refactor:migration] detect legacy layout regardless of store init
  (T8)

[refactor:cards] validate skills.include against source dirs at publish
  (T1.1, T1.2, T1.3, fixture updates per T1.4)

[feat:cards] hash card content tree for integrity
  (T2)

[feat:cards] record skill attribution in card lockfile
  (T3)

[feat:cards] introduce cards-aware skill resolver
  (T4)

[feat:cards] wire cards-aware resolver into write and diagnostics
  (T5)

[feat:cards] upgrade legacy integrity hashes on first apply
  (T6)

[feat:cards] annotate write planner with winning layer
  (T7)
```

If the PR review surface gets large, T1–T4 can land as a "schema and primitives" PR and T5–T7 as a "wiring" PR. T8 ships independently whenever.

---

## Appendix C — Decisions Mapped to Architecture Decision Log

The five Wave 1 decisions confirmed on 2026-05-26 map to entries in `36_harness-cards-bundle-resolver-target-architecture.md` §14 Decision Log:

| Implementation Decision | Architecture Decision |
|---|---|
| D1 — sequencing T1–T8 with T8 floating | §11 Implementation Milestones (sequencing) |
| D2 — hard failure on missing skill | §14 #4 (resolver attribution is authoritative) |
| D3 — non-`--force` integrity recompute | §14 #8 (one-time integrity upgrade is non-`--force`) |
| D4 — lockfile stays at version 1 | §5.2 (Wave 2 will bump to v2) |
| D5 — test fixtures update for skill dirs | §10 Testing Strategy (modified test files) |

These are not in conflict; the implementation plan honors every architecture decision verbatim.
