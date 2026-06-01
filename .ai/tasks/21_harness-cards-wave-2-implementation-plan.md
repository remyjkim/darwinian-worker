# Task 21: Harness Cards Wave 2 — Registry References with Pinning Implementation Plan

**Status**: Ready For T1 Start (blocked on Wave 1 complete)
**Created**: 2026-05-26
**Updated**: 2026-05-26
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1–2 PRs (8–12 sessions)
**Dependencies**: `.ai/tasks/20_harness-cards-wave-1-implementation-plan.md` (Wave 1 must be merged), `.ai/analyses/37_harness-cards-registry-pinning-target-architecture.md`
**References**: [analyses/37_harness-cards-registry-pinning-target-architecture.md, analyses/36_harness-cards-bundle-resolver-target-architecture.md, analyses/29_harness-cards-target-architecture-v1_1.md, analyses/32_harness-cards-vs-flox-and-conda.md, tasks/20_harness-cards-wave-1-implementation-plan.md, cli/core/card-manifest.ts, cli/core/card-lock.ts, cli/core/card-project.ts, cli/core/card-store.ts, cli/core/card-skill-resolver.ts, cli/core/sync.ts, cli/core/skills.ts, cli/core/diagnostics.ts, cli/core/types.ts, cli/commands/card/outdated.ts, cli/commands/card/update.ts, cli/commands/doctor.ts, cli/commands/store/status.ts, package.json]

---

## Objective

Land the selector path on top of Wave 1's bundle baseline. A card can reference skills from a **registry** without bundling their content, the registry version is pinned in the project lockfile, and write-time verification refuses to proceed when the local registry has drifted from the pin. Concretely: activate `skills.shared` in card manifests, bump the lockfile to `version: 2`, introduce two registry kinds (`published-artifact` primary, `git-sha` for development), and surface drift in `bgng write`, `bgng doctor`, `bgng cards outdated`, and `bgng status --explain` / `--why`.

Wave 2 delivers the registry-reference half of the bundle-vs-selector design question that Wave 1 deferred. Together with Wave 1, the answer becomes: **bundle by default, registry-reference by exception, with reproducibility preserved across both paths.**

---

## Scope

**In scope:**

- Manifest schema: activate `skills.shared`; reject overlap with `skills.include`; validate the optional `registries` map (only `"default"` allowed in Wave 2).
- Lockfile schema bump from `version: 1` → `version: 2` with `sharedSkills: string[]` and populated `registry` block per card.
- Wave 1 → Wave 2 lockfile upgrade path on first apply.
- Machine config: `registries.default` block with auto-detection on first apply that consumes shared skills.
- Registry kinds:
  - `published-artifact` — registry is `beginning-harness` resolved from npm-global.
  - `git-sha` — registry is a local harness checkout, pinned by commit SHA + content hash of `skills/shared/`.
- `cli/core/card-skill-resolver.ts` extends with Layer 2 (registry) attribution.
- `bgng write` and `bgng doctor` perform pin verification; drift refuses with actionable message; `--force` bypasses and rewrites the pin.
- `bgng cards outdated` gains a Registry Drift section.
- `bgng cards update --registry-only` flag.
- `bgng status --explain` / `--why` attribute Layer 2 resolutions to the registry pin.
- New `bgng store set-registry <kind>` command.
- Full test bar: 5 new test files, ~8 modified.

**Out of scope (later iterations):**

- Custom or third-party registries (anything beyond `"default"`).
- Networked card publish / distribution.
- Content-addressed dedupe of the card store.
- Authoring helpers (`bgng card add-skill --bundle | --from-registry`, `card import-skill`).
- Strict mode (refuse Layer 3 user-default fallback entirely).
- SLSA provenance.
- `bgng cards update --all` global registry refresh (per-card update is the Wave 2 default).

---

## Decisions Locked Before Implementation

These were finalized in `37_harness-cards-registry-pinning-target-architecture.md` §15 Decision Log and confirmed on 2026-05-26. They are NOT open for renegotiation during execution.

| # | Decision | Source |
|---|---|---|
| D1 | `published-artifact` is the recommended primary registry kind. `git-sha` is retained for development workflows. Custom registries are deferred. | Arch §15 #1–#3 |
| D2 | Drift refuses with `--force` bypass, mirroring M3's managed-field drift refusal. | Arch §15 #4 |
| D3 | `--force` on drift updates the lockfile to the actual registry state with a loud console warning. | Arch §15 #5 |
| D4 | `skills.shared` cannot overlap with `skills.include`. Rejected loud at publish and apply. | Arch §15 #6 |
| D5 | Machine config records the local resolution hint; lockfile records the pin. The two are decoupled. | Arch §15 #7 |
| D6 | Lockfile bumps to `version: 2`. Wave 2 readers accept both `1` and `2`. Wave 1 readers reject `2`. | Arch §15 #8 |
| D7 | Registry pin is per-card (not project-wide). | Arch §15 #9 |
| D8 | Authoring CLI helpers are out of scope. | Arch §15 #10 |
| D9 | Implementation order is T1 → T2 → T3 → T4 ∥ T5 → T6 → T7 → T8 → T9 → T10. T4 and T5 are independent and may run in parallel sessions. | Sign-off 2026-05-26 |
| D10 | The default registry's identity is `beginning-harness`. `skills/shared/` is already part of the package's published `files` array (verified at `package.json` line 19), so no package.json change is needed to "make `skills/shared/` API." Document the API stability commitment in release notes. | Code inspection 2026-05-26 |

---

## Entry Checks

Run before editing:

```bash
git status --short --branch
bun test
bun run typecheck
git log --oneline -1 -- cli/core/card-skill-resolver.ts
```

Expected:

- working tree is clean or only documented in-progress files are modified
- `bun test` reports 0 failures (Wave 1's expanded test suite is the baseline; expected count grows from Wave 1's regression coverage)
- `bun run typecheck` reports clean
- the last `cli/core/card-skill-resolver.ts` commit is the Wave 1 introduction (confirms Wave 1 has merged); if no log entry, Wave 2 is starting too early

If Wave 1 is not merged, stop. The Layer 2 extension to `card-skill-resolver` assumes the module exists; the lockfile upgrade path assumes `version: 1` includes `skills[]` and `registry: null`.

---

## Test-Driven Development Discipline

Same loop as Wave 1 (failing test first, smallest passing implementation, then refactor with tests green). Per CLAUDE.md, never deviate. Each task below identifies the **test-first artifact**.

---

## Glossary of Files Touched

For quick reference. Bold marks files that gain net-new logic or modules in Wave 2.

### Core modules

- `cli/core/card-manifest.ts` — manifest schema and validation (T1).
- `cli/core/card-lock.ts` — lockfile schema bumped to v2 (T2).
- `cli/core/card-project.ts` — apply path populates `sharedSkills[]` and `registry` block (T2, T6).
- `cli/core/card-store.ts` — `readMachineConfig` / `writeMachineConfig` consume new shape (T3).
- `cli/core/types.ts` — `MachineConfig` extends with `registries` (T3).
- **`cli/core/registry-published-artifact.ts`** — new module (T4).
- **`cli/core/registry-git-sha.ts`** — new module (T5).
- **`cli/core/registry-resolver.ts`** — new dispatch module (T6).
- `cli/core/card-skill-resolver.ts` — extends with Layer 2 attribution (T6).
- `cli/core/sync.ts` — wires drift verification into the write planner (T7).
- `cli/core/diagnostics.ts` — registry drift check + status registry section (T7, T9).

### Commands

- **`cli/commands/store/set-registry.ts`** — new command (T3).
- `cli/commands/store/status.ts` — extended output includes registries summary (T3, T9).
- `cli/commands/card/outdated.ts` — Registry Drift section in output (T8).
- `cli/commands/card/update.ts` — `--registry-only` flag (T8).
- `cli/commands/doctor.ts` — output already passes through `buildDoctorReportWithProject`; the registry check lives in diagnostics (T7).
- `cli/commands/status.ts` — exposes registry attribution via existing diagnostics path (T9).
- `cli/index.ts` — registers `StoreSetRegistryCommand` (T3).

### Tests

- **`test/core-registry-published-artifact.test.ts`** — new (T4).
- **`test/core-registry-git-sha.test.ts`** — new (T5).
- **`test/scenarios-card-shared-resolution.test.ts`** — new (T6).
- **`test/scenarios-registry-drift-refusal.test.ts`** — new (T7).
- **`test/commands-store-set-registry.test.ts`** — new (T3).
- `test/core-card-manifest.test.ts` — extended for `skills.shared` activation, overlap rejection (T1).
- `test/core-card-lock.test.ts` — extended for `version: 2`, `sharedSkills[]`, populated registry, v1→v2 upgrade (T2).
- `test/core-card-skill-resolver.test.ts` — extended for Layer 2 attribution (T6).
- `test/commands-card-outdated.test.ts` — new or extended for Registry Drift section (T8).
- `test/commands-card-update.test.ts` — new or extended for `--registry-only` (T8).
- `test/commands-status-why.test.ts` — extended for registry attribution (T9).
- `test/commands-doctor.test.ts` — extended for registry drift check (T7).

### Reference

- `.ai/analyses/37_harness-cards-registry-pinning-target-architecture.md` — the target architecture this plan implements.
- `.ai/tasks/20_harness-cards-wave-1-implementation-plan.md` — the bundle baseline this plan builds on.

---

## T1 — Manifest Schema Extensions for `skills.shared` and `registries`

### Objective

Activate `skills.shared` (Wave 1 rejects non-empty; Wave 2 accepts). Reject overlap with `skills.include`. Validate the optional `registries` map and reject anything other than `"default"`.

### Files

- `cli/core/card-manifest.ts`
- `test/core-card-manifest.test.ts` (extend)
- `test/commands-card-author.test.ts` (extend)

### Tests first

In `test/core-card-manifest.test.ts`, replace the Wave 1 "reject non-empty `skills.shared`" cases with:

```ts
test("validateCardManifest accepts non-empty skills.shared in Wave 2", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    skills: { include: ["alpha"], shared: ["beta"] },
  });
  expect(result.ok).toBe(true);
});

test("validateCardManifest rejects overlap between skills.include and skills.shared", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    skills: { include: ["alpha", "beta"], shared: ["beta"] },
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toContain("must not appear in both skills.include and skills.shared");
  expect(result.errors.join("\n")).toContain("beta");
});

test("validateCardManifest accepts registries map when every entry maps to 'default'", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    skills: { include: [], shared: ["beta"] },
    registries: { beta: "default" },
  });
  expect(result.ok).toBe(true);
});

test("validateCardManifest rejects custom registry names in Wave 2", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    skills: { include: [], shared: ["beta"] },
    registries: { beta: "custom-registry" },
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toContain("custom registries are reserved");
});

test("validateCardManifest rejects registries entries referencing unknown skill names", () => {
  const result = validateCardManifest({
    name: "@me/x",
    version: "1.0.0",
    skills: { include: ["alpha"], shared: ["beta"] },
    registries: { gamma: "default" },
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toContain("registries.gamma does not match any skill in skills.shared");
});
```

In `test/commands-card-author.test.ts`, add:

```ts
test("card publish succeeds when skills.shared references registry-resolved names", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture));
  const sourceRoot = join(fixture.agentsDir, "bgng", "sources", "@me", "backend");
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.skills = { include: [], shared: ["alpha"] };  // alpha is registry-resolved
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // No skills/alpha/ directory is created — that's the whole point of `shared`.

  const published = await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture));

  expect(published.exitCode).toBe(0);
});

test("card publish fails when skills.shared overlaps with skills.include", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/setup", skills: ["alpha"] });
  // Now mutate to add alpha to shared too — should refuse on republish attempt.
  // (publish refuses overwriting an existing version, so use a new version)
  // For brevity, build the failing manifest inline:
  const sourceRoot = join(fixture.agentsDir, "bgng", "sources", "@me", "setup");
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "1.0.1";
  manifest.skills = { include: ["alpha"], shared: ["alpha"] };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const published = await runAgentsCli(["card", "publish", "@me/setup"], envFor(fixture));

  expect(published.exitCode).not.toBe(0);
  expect(published.stderr).toContain("must not appear in both skills.include and skills.shared");
});
```

Run:

```bash
bun test test/core-card-manifest.test.ts test/commands-card-author.test.ts
```

Expect FAIL.

### Implementation

In `cli/core/card-manifest.ts`:

```ts
export interface CardManifest {
  // ... existing fields from Wave 1 ...
  skills?: { include?: string[]; exclude?: string[]; shared?: string[] };
  registries?: Record<string, string>;  // skillName → registry name; Wave 2 only allows "default"
}
```

In `validateCardManifest`, REPLACE the Wave 1 rejection of non-empty `skills.shared`:

```ts
// REMOVE this Wave 1 block (was added by Wave 1 T1):
//   if (manifest.skills?.shared !== undefined) {
//     if (!Array.isArray(manifest.skills.shared)) {
//       errors.push("skills.shared must be an array");
//     } else if (manifest.skills.shared.length > 0) {
//       errors.push("skills.shared is reserved for Wave 2 ...");
//     }
//   }

// REPLACE WITH:
if (manifest.skills?.shared !== undefined && !Array.isArray(manifest.skills.shared)) {
  errors.push("skills.shared must be an array");
}

const includeNames = manifest.skills?.include ?? [];
const sharedNames = manifest.skills?.shared ?? [];
const overlap = sharedNames.filter((n) => includeNames.includes(n));
if (overlap.length > 0) {
  errors.push(
    `skills must not appear in both skills.include and skills.shared: ${overlap.join(", ")}`,
  );
}

// Wave 2: accept registries map but reject non-"default" entries and entries that don't match a shared skill.
if (manifest.registries !== undefined) {
  if (!isObject(manifest.registries)) {
    errors.push("registries must be an object");
  } else {
    const sharedSet = new Set(sharedNames);
    for (const [skill, registryName] of Object.entries(manifest.registries)) {
      if (typeof registryName !== "string") {
        errors.push(`registries.${skill} must be a string`);
        continue;
      }
      if (registryName !== "default") {
        errors.push(
          `registries.${skill} = "${registryName}": custom registries are reserved for a future wave; only "default" is supported in Wave 2`,
        );
      }
      if (!sharedSet.has(skill)) {
        errors.push(`registries.${skill} does not match any skill in skills.shared`);
      }
    }
  }
}
```

Validation flow unchanged otherwise.

In `publishCard` and `resolveCard` (in `cli/core/card-store.ts`), the Wave 1 directory-existence checks (T1 of Wave 1) iterate `skills.include`. Wave 2 does NOT extend these to `skills.shared` — by definition, registry-resolved skills have no bundle directory in the card. Leave the existing checks alone; they remain `skills.include`-scoped.

### Acceptance criteria

- `core-card-manifest.test.ts` new and updated cases pass.
- `commands-card-author.test.ts` new cases pass.
- Existing Wave 1 manifest tests continue to pass with the `skills.shared` rejection removed (those cases are deleted; do not weaken them, deletion is correct because Wave 2 supersedes the Wave 1 rejection).
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-card-manifest.test.ts test/commands-card-author.test.ts
bun test
bun run typecheck
```

---

## T2 — Lockfile Schema Bump to v2

### Objective

Bump `lockfileVersion` to `2`. Add required `sharedSkills: string[]` per entry. The Wave 1 `registry: null` becomes either `null` (when `sharedSkills` is empty) or a populated registry block. Implement transparent v1→v2 upgrade on first apply.

### Files

- `cli/core/card-lock.ts`
- `cli/core/card-project.ts`
- `test/core-card-lock.test.ts` (extend)

### Tests first

In `test/core-card-lock.test.ts`:

```ts
test("writeCardLock emits version: 2 with sharedSkills[] field", async () => {
  const root = await createTempRoot("card-lock-v2-");
  tempRoots.push(root);

  writeCardLock(root, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: "/cards/@me/backend/1.0.0",
      integrity: "sha256-test",
      manifest: { name: "@me/backend", version: "1.0.0" },
      skills: ["alpha"],
      sharedSkills: ["beta"],
      registry: {
        name: "default",
        kind: "published-artifact",
        artifact: "beginning-harness",
        version: "0.3.1",
        integrity: "sha256-reg",
      },
    },
  ]);

  const raw = JSON.parse(await readFile(cardLockPath(root), "utf8"));
  expect(raw.lockfileVersion).toBe(2);
  expect(raw.cards[0].sharedSkills).toEqual(["beta"]);
  expect(raw.cards[0].registry.kind).toBe("published-artifact");
});

test("loadCardLock accepts version: 1 and upgrades on next write", async () => {
  const root = await createTempRoot("card-lock-v2-");
  tempRoots.push(root);
  await mkdir(dirname(cardLockPath(root)), { recursive: true });
  const v1Payload = {
    lockfileVersion: 1,
    cards: [
      {
        name: "@me/x",
        requested: "@me/x@^1.0.0",
        version: "1.0.0",
        path: "/cards/@me/x/1.0.0",
        integrity: "sha256-test",
        manifest: { name: "@me/x", version: "1.0.0", skills: { include: ["alpha"] } },
        skills: ["alpha"],
        registry: null,
      },
    ],
  };
  await writeFile(cardLockPath(root), JSON.stringify(v1Payload, null, 2));

  const loaded = await loadCardLock(root);

  expect(loaded?.lockfileVersion).toBe(2);                  // in-memory representation is always v2
  expect(loaded?.cards[0]?.sharedSkills).toEqual([]);       // backfilled empty
  expect(loaded?.cards[0]?.registry).toBeNull();            // preserved
});

test("loadCardLock rejects unknown lockfileVersion", async () => {
  const root = await createTempRoot("card-lock-v2-");
  tempRoots.push(root);
  await mkdir(dirname(cardLockPath(root)), { recursive: true });
  await writeFile(cardLockPath(root), JSON.stringify({ lockfileVersion: 99, cards: [] }));

  await expect(loadCardLock(root)).rejects.toThrow(/Invalid card lockfile/);
});

test("loadCardLock rejects v2 entries with sharedSkills but null registry", async () => {
  // sharedSkills implies a populated registry; null is invalid in that case.
  const root = await createTempRoot("card-lock-v2-");
  tempRoots.push(root);
  await mkdir(dirname(cardLockPath(root)), { recursive: true });
  const invalid = {
    lockfileVersion: 2,
    cards: [
      {
        name: "@me/x",
        requested: "@me/x@^1.0.0",
        version: "1.0.0",
        path: "/cards/@me/x/1.0.0",
        integrity: "sha256-test",
        manifest: { name: "@me/x", version: "1.0.0" },
        skills: [],
        sharedSkills: ["beta"],
        registry: null,
      },
    ],
  };
  await writeFile(cardLockPath(root), JSON.stringify(invalid, null, 2));

  await expect(loadCardLock(root)).rejects.toThrow(/sharedSkills.*registry/);
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
export type CardRegistryPin =
  | {
      name: "default";
      kind: "published-artifact";
      artifact: string;          // "beginning-harness"
      version: string;           // semver, e.g. "0.3.1"
      integrity: string;         // sha256 of registry skills/shared/ tree
    }
  | {
      name: "default";
      kind: "git-sha";
      repo: string;              // absolute path or git URL
      sha: string;               // 40-char SHA
      integrity: string;         // sha256 of skills/shared/ tree at this SHA
    };

export interface CardLockEntry {
  name: string;
  requested: string;
  version: string;
  path: string;
  integrity: string;
  manifest: CardManifest;
  skills: string[];                 // Wave 1: card-bundled skill names
  sharedSkills: string[];           // Wave 2: registry-resolved skill names
  registry: CardRegistryPin | null; // null when sharedSkills is empty
}

export interface CardLockfile {
  lockfileVersion: 2;
  cards: CardLockEntry[];
}
```

Update `loadCardLock` to handle both v1 and v2:

```ts
export async function loadCardLock(projectRoot: string): Promise<CardLockfile | null> {
  const path = cardLockPath(projectRoot);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(await readFile(path, "utf8")) as { lockfileVersion?: number; cards?: any[] };

  if (parsed.lockfileVersion !== 1 && parsed.lockfileVersion !== 2) {
    throw new Error(`Invalid card lockfile (unknown version ${parsed.lockfileVersion}): ${path}`);
  }
  if (!Array.isArray(parsed.cards)) {
    throw new Error(`Invalid card lockfile: ${path}`);
  }

  const cards: CardLockEntry[] = parsed.cards.map((entry: any) => {
    const sharedSkills = entry.sharedSkills ?? [];
    const registry = entry.registry ?? null;
    if (sharedSkills.length > 0 && registry === null) {
      throw new Error(
        `Invalid card lockfile: ${entry.name}@${entry.version} has sharedSkills but no registry pin`,
      );
    }
    return {
      ...entry,
      skills: entry.skills ?? entry.manifest?.skills?.include ?? [],
      sharedSkills,
      registry,
    };
  });

  return { lockfileVersion: 2, cards };
}
```

`writeCardLock` always emits `lockfileVersion: 2`. v1 → v2 upgrade is implicit: the first `bgng cards apply` (or `bgng cards update`) after Wave 2 lands reads a v1 lockfile, builds the v2 in-memory representation, and writes it back as v2.

In `cli/core/card-project.ts::resolveProjectCards`, populate `sharedSkills` from the manifest:

```ts
.map((card) => ({
  // ... existing fields ...
  skills: card.manifest.skills?.include ?? [],
  sharedSkills: card.manifest.skills?.shared ?? [],
  registry: null,           // placeholder; T6 will populate this from the registry resolver during apply
}))
```

Note: at this T2 checkpoint, `sharedSkills` is populated but `registry` is still always `null`. The actual registry pin population lands in T6 when the registry resolver runs during apply. This intermediate state is intentional — it lets T2 land independently with green tests (any test using `sharedSkills` non-empty has to wait for T6 to land a real pin).

The Wave 1 invariant that `sharedSkills.length > 0 ⇒ registry !== null` is therefore violated during the T2 → T6 window for cards that declare `skills.shared`. Mitigate by ensuring no such card is published or applied between T2 and T6. Concretely: T1's tests use empty `skills.shared` or treat `skills.shared` as accepted-but-non-applied. T6's tests are the first to publish + apply cards with non-empty `skills.shared`.

### Acceptance criteria

- New tests in `core-card-lock.test.ts` pass.
- Existing Wave 1 lockfile tests pass with v2 emission and v1 acceptance.
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-card-lock.test.ts test/commands-card-consumer.test.ts
bun test
bun run typecheck
```

---

## T3 — Machine Config `registries` Block + `bgng store set-registry` Command

### Objective

Add a `registries.default` block to `MachineConfig`. Implement auto-detection (npm-global vs git-sha) on first apply of a card that uses `skills.shared`. Add `bgng store set-registry` to override.

### Files

- `cli/core/types.ts`
- `cli/core/card-store.ts`
- `cli/commands/store/set-registry.ts` (new)
- `cli/commands/store/status.ts` (extended output)
- `cli/index.ts` (register command)
- `test/commands-store-set-registry.test.ts` (new)
- `test/commands-store.test.ts` (extended for store status output)

### Tests first

Create `test/commands-store-set-registry.test.ts`:

```ts
// ABOUTME: Verifies bgng store set-registry writes machine.json::registries.default correctly.
// ABOUTME: Protects the override path users take when auto-detection picks the wrong kind.

import { afterEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("bgng store set-registry published-artifact records the kind in machine.json", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(
    ["store", "set-registry", "published-artifact", "--artifact", "beginning-harness"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const machine = JSON.parse(await readFile(join(fixture.agentsDir, "bgng", "machine.json"), "utf8"));
  expect(machine.registries.default.kind).toBe("published-artifact");
  expect(machine.registries.default.artifact).toBe("beginning-harness");
});

test("bgng store set-registry git-sha records the repo path", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(
    ["store", "set-registry", "git-sha", "--repo", fixture.repoRoot],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const machine = JSON.parse(await readFile(join(fixture.agentsDir, "bgng", "machine.json"), "utf8"));
  expect(machine.registries.default.kind).toBe("git-sha");
  expect(machine.registries.default.repo).toBe(fixture.repoRoot);
});

test("bgng store set-registry rejects unknown kinds", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["store", "set-registry", "url-content-hash"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("supported kinds: published-artifact, git-sha");
});

test("bgng store set-registry published-artifact requires --artifact", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["store", "set-registry", "published-artifact"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("--artifact");
});

test("bgng store set-registry git-sha requires --repo", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["store", "set-registry", "git-sha"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("--repo");
});
```

Run:

```bash
bun test test/commands-store-set-registry.test.ts
```

Expect FAIL.

### Implementation

#### T3.1 — Extend `MachineConfig` type

In `cli/core/types.ts`:

```ts
export type RegistryHint =
  | {
      kind: "published-artifact";
      artifact: string;          // npm package name
      resolvedFrom: "npm-global" | "manual";
    }
  | {
      kind: "git-sha";
      repo: string;              // absolute path or URL
      branch?: string;           // optional, defaults to HEAD
    };

export type MachineConfig = CanonicalConfig & {
  authoring?: {
    scope?: string;
  };
  registries?: {
    default?: RegistryHint;
  };
};
```

#### T3.2 — Auto-detection

Add to `cli/core/card-store.ts`:

```ts
import { execSync } from "node:child_process";

export async function ensureRegistryDefault(
  agentsDir: string,
  options?: { cliEntryPath?: string },
): Promise<RegistryHint> {
  const machine = await readMachineConfig(agentsDir);
  if (machine.registries?.default) {
    return machine.registries.default;
  }
  // Auto-detect: try npm-global first.
  let hint: RegistryHint;
  const npmGlobal = await tryDetectNpmGlobal();
  if (npmGlobal) {
    hint = { kind: "published-artifact", artifact: "beginning-harness", resolvedFrom: "npm-global" };
  } else {
    const repoPath = detectHarnessRepoFromCliPath(options?.cliEntryPath ?? import.meta.path);
    if (!repoPath) {
      throw new Error(
        "Cannot auto-detect default registry. Run `bgng store set-registry <kind>` to configure.",
      );
    }
    hint = { kind: "git-sha", repo: repoPath };
  }
  const next: MachineConfig = {
    ...machine,
    registries: { ...(machine.registries ?? {}), default: hint },
  };
  await writeMachineConfig(agentsDir, next);
  console.info(
    `[bgng] auto-detected default registry: ${hint.kind === "published-artifact" ? `npm-global ${hint.artifact}` : `git-sha ${hint.repo}`}. ` +
    `Override with \`bgng store set-registry\`.`,
  );
  return hint;
}

async function tryDetectNpmGlobal(): Promise<string | null> {
  try {
    const prefix = execSync("npm prefix -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const candidate = join(prefix, "lib", "node_modules", "beginning-harness", "package.json");
    if (existsSync(candidate)) {
      return prefix;
    }
  } catch {
    // npm unavailable; skip.
  }
  return null;
}

function detectHarnessRepoFromCliPath(cliPath: string): string | null {
  // cliPath looks like ".../beginning-harness/cli/core/card-store.ts"; walk up to repo root.
  let dir = dirname(cliPath);
  while (dir !== "/" && dir !== "") {
    if (existsSync(join(dir, "package.json"))) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        if (pkg.name === "beginning-harness") {
          return dir;
        }
      } catch {
        // continue
      }
    }
    dir = dirname(dir);
  }
  return null;
}
```

This function is called once, lazily, from the apply path when at least one card in the project has `sharedSkills` non-empty (lands in T6).

#### T3.3 — `bgng store set-registry` command

Create `cli/commands/store/set-registry.ts`:

```ts
// ABOUTME: Implements bgng store set-registry to configure the machine's default registry resolution.
// ABOUTME: Overrides auto-detection when users need a specific kind (e.g., dev workflows).

import { Option } from "clipanion";
import { readMachineConfig, writeMachineConfig } from "../../core/card-store";
import type { RegistryHint } from "../../core/types";
import { BaseCommand } from "../base";

export class StoreSetRegistryCommand extends BaseCommand {
  static override paths = [["store", "set-registry"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Set the default registry kind for shared-skill resolution.",
    details: `
      Configures ~/.agents/bgng/machine.json::registries.default. The default
      registry is used to resolve skills declared in a card's skills.shared.

      Supported kinds:
      - published-artifact: resolves skills/shared/ from a globally installed
        npm package. Requires --artifact (default: beginning-harness).
      - git-sha: resolves skills/shared/ from a local git checkout. Requires
        --repo pointing at the harness repo.
    `,
    examples: [
      ["Use npm-global beginning-harness", "bgng store set-registry published-artifact --artifact beginning-harness"],
      ["Use a local checkout", "bgng store set-registry git-sha --repo /path/to/beginning-harness"],
    ],
  });

  kind = Option.String({ required: true, name: "kind" });
  artifact = Option.String("--artifact", { description: "npm package name (published-artifact only)" });
  repo = Option.String("--repo", { description: "absolute path to local repo (git-sha only)" });
  branch = Option.String("--branch", { description: "branch name (git-sha only; defaults to HEAD)" });

  async execute() {
    let hint: RegistryHint;
    if (this.kind === "published-artifact") {
      if (!this.artifact) {
        this.context.stderr.write("--artifact is required for published-artifact\n");
        return 1;
      }
      hint = { kind: "published-artifact", artifact: this.artifact, resolvedFrom: "manual" };
    } else if (this.kind === "git-sha") {
      if (!this.repo) {
        this.context.stderr.write("--repo is required for git-sha\n");
        return 1;
      }
      hint = { kind: "git-sha", repo: this.repo, branch: this.branch };
    } else {
      this.context.stderr.write(
        `Unknown registry kind: ${this.kind}. supported kinds: published-artifact, git-sha\n`,
      );
      return 1;
    }
    const machine = await readMachineConfig(this.context.agentsDir);
    const next = { ...machine, registries: { ...(machine.registries ?? {}), default: hint } };
    await writeMachineConfig(this.context.agentsDir, next);
    this.context.stdout.write(`default registry set to ${this.kind}\n`);
    return 0;
  }
}
```

Register in `cli/index.ts` alongside the other store commands.

#### T3.4 — Extend `bgng store status` output

In `cli/commands/store/status.ts`, add a `defaultRegistry` field to the rendered output (both JSON and table forms). Backed by `getStoreStatus` in `migration.ts`:

```ts
export async function getStoreStatus(agentsDir: string): Promise<StoreStatus> {
  // ... existing fields ...
  const machine = existsSync(resolveMachineConfigPath(agentsDir))
    ? JSON.parse(await readFile(resolveMachineConfigPath(agentsDir), "utf8")) as MachineConfig
    : null;
  return {
    // ... existing ...
    defaultRegistry: machine?.registries?.default ?? null,
  };
}
```

`StoreStatus` type gets a new `defaultRegistry: RegistryHint | null` field.

### Acceptance criteria

- All `commands-store-set-registry.test.ts` cases pass.
- `bgng store status` renders the default registry in both JSON and table modes (or `none` if unconfigured).
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/commands-store-set-registry.test.ts test/commands-store.test.ts
bun test
bun run typecheck
```

---

## T4 — Registry Kind: `published-artifact`

### Objective

Implement the `published-artifact` resolver: locate the registry root from a `RegistryHint`, compute its `skills/shared/` content integrity, verify against a recorded pin.

### Files

- `cli/core/registry-published-artifact.ts` (new)
- `test/core-registry-published-artifact.test.ts` (new)

### Tests first

Create `test/core-registry-published-artifact.test.ts`:

```ts
// ABOUTME: Verifies published-artifact registry resolution and pin verification.
// ABOUTME: Protects the npm-global path for default registry resolution.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";
import {
  resolvePublishedArtifactRegistry,
  verifyPublishedArtifactPin,
} from "../cli/core/registry-published-artifact";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldFakeNpmGlobal(packageName: string, version: string, skills: Record<string, string>) {
  const root = await createTempRoot("fake-npm-");
  tempRoots.push(root);
  const pkgRoot = join(root, "lib", "node_modules", packageName);
  await mkdir(join(pkgRoot, "skills", "shared"), { recursive: true });
  await writeFile(join(pkgRoot, "package.json"), JSON.stringify({ name: packageName, version }, null, 2));
  for (const [skillName, body] of Object.entries(skills)) {
    await mkdir(join(pkgRoot, "skills", "shared", skillName), { recursive: true });
    await writeFile(join(pkgRoot, "skills", "shared", skillName, "SKILL.md"), body);
  }
  return { npmPrefix: root, pkgRoot };
}

test("resolvePublishedArtifactRegistry returns the package root and version", async () => {
  const { npmPrefix, pkgRoot } = await scaffoldFakeNpmGlobal("beginning-harness", "0.3.1", {
    alpha: "---\nname: alpha\n---\n",
  });

  const resolved = await resolvePublishedArtifactRegistry({
    artifact: "beginning-harness",
    npmPrefix,
  });

  expect(resolved.rootPath).toBe(pkgRoot);
  expect(resolved.version).toBe("0.3.1");
  expect(resolved.integrity.startsWith("sha256-")).toBe(true);
});

test("verifyPublishedArtifactPin succeeds when version and integrity match", async () => {
  const { npmPrefix } = await scaffoldFakeNpmGlobal("beginning-harness", "0.3.1", {
    alpha: "---\nname: alpha\n---\n",
  });
  const resolved = await resolvePublishedArtifactRegistry({ artifact: "beginning-harness", npmPrefix });
  const pin = {
    name: "default" as const,
    kind: "published-artifact" as const,
    artifact: "beginning-harness",
    version: "0.3.1",
    integrity: resolved.integrity,
  };

  const verification = await verifyPublishedArtifactPin(pin, { npmPrefix });

  expect(verification.ok).toBe(true);
});

test("verifyPublishedArtifactPin reports version drift", async () => {
  const { npmPrefix } = await scaffoldFakeNpmGlobal("beginning-harness", "0.4.0", {
    alpha: "---\nname: alpha\n---\n",
  });
  const pin = {
    name: "default" as const,
    kind: "published-artifact" as const,
    artifact: "beginning-harness",
    version: "0.3.1",
    integrity: "sha256-stale",
  };

  const verification = await verifyPublishedArtifactPin(pin, { npmPrefix });

  expect(verification.ok).toBe(false);
  expect(verification.reason).toContain("version drift");
  expect(verification.reason).toContain("pinned: 0.3.1");
  expect(verification.reason).toContain("actual: 0.4.0");
});

test("verifyPublishedArtifactPin reports integrity drift even at matching version", async () => {
  const { npmPrefix, pkgRoot } = await scaffoldFakeNpmGlobal("beginning-harness", "0.3.1", {
    alpha: "---\nname: alpha\n---\nORIGINAL\n",
  });
  const original = await resolvePublishedArtifactRegistry({ artifact: "beginning-harness", npmPrefix });
  // Mutate the skill content; integrity diverges.
  await writeFile(join(pkgRoot, "skills", "shared", "alpha", "SKILL.md"), "---\nname: alpha\n---\nMODIFIED\n");

  const verification = await verifyPublishedArtifactPin(
    { name: "default", kind: "published-artifact", artifact: "beginning-harness", version: "0.3.1", integrity: original.integrity },
    { npmPrefix },
  );

  expect(verification.ok).toBe(false);
  expect(verification.reason).toContain("integrity drift");
});

test("resolvePublishedArtifactRegistry throws when artifact is not installed", async () => {
  const npmPrefix = await createTempRoot("empty-npm-");
  tempRoots.push(npmPrefix);

  await expect(
    resolvePublishedArtifactRegistry({ artifact: "beginning-harness", npmPrefix }),
  ).rejects.toThrow(/beginning-harness/);
});
```

Run:

```bash
bun test test/core-registry-published-artifact.test.ts
```

Expect FAIL.

### Implementation

Create `cli/core/registry-published-artifact.ts`:

```ts
// ABOUTME: Resolves the default registry from an npm-global beginning-harness install.
// ABOUTME: Implements published-artifact kind: version + content integrity verification.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { walkAndHashTree } from "./content-integrity";  // T4.2

export interface PublishedArtifactInput {
  artifact: string;
  npmPrefix?: string;             // injectable for tests; defaults to `npm prefix -g`
}

export interface PublishedArtifactResolved {
  rootPath: string;
  version: string;
  integrity: string;              // sha256 of skills/shared/ tree
}

export interface PublishedArtifactPin {
  name: "default";
  kind: "published-artifact";
  artifact: string;
  version: string;
  integrity: string;
}

export type RegistryVerificationResult = { ok: true } | { ok: false; reason: string };

function resolveNpmPrefix(): string {
  return execSync("npm prefix -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}

function resolvePackageRoot(npmPrefix: string, artifact: string): string {
  return join(npmPrefix, "lib", "node_modules", artifact);
}

export async function resolvePublishedArtifactRegistry(
  input: PublishedArtifactInput,
): Promise<PublishedArtifactResolved> {
  const npmPrefix = input.npmPrefix ?? resolveNpmPrefix();
  const rootPath = resolvePackageRoot(npmPrefix, input.artifact);
  if (!existsSync(join(rootPath, "package.json"))) {
    throw new Error(
      `published-artifact registry: ${input.artifact} is not installed under ${npmPrefix}. ` +
      `Install it with \`npm install -g ${input.artifact}\` or switch to git-sha via \`bgng store set-registry git-sha --repo <path>\`.`,
    );
  }
  const pkg = JSON.parse(await readFile(join(rootPath, "package.json"), "utf8"));
  const sharedDir = join(rootPath, "skills", "shared");
  if (!existsSync(sharedDir)) {
    throw new Error(`published-artifact registry: ${rootPath}/skills/shared/ does not exist`);
  }
  const integrity = await walkAndHashTree(sharedDir);
  return { rootPath, version: pkg.version, integrity };
}

export async function verifyPublishedArtifactPin(
  pin: PublishedArtifactPin,
  input: { npmPrefix?: string },
): Promise<RegistryVerificationResult> {
  let actual: PublishedArtifactResolved;
  try {
    actual = await resolvePublishedArtifactRegistry({ artifact: pin.artifact, npmPrefix: input.npmPrefix });
  } catch (error) {
    return { ok: false, reason: `cannot resolve registry: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (actual.version !== pin.version) {
    return {
      ok: false,
      reason: `version drift: pinned: ${pin.version}, actual: ${actual.version} (${pin.artifact})`,
    };
  }
  if (actual.integrity !== pin.integrity) {
    return {
      ok: false,
      reason: `integrity drift at matching version ${pin.version}: skills/shared/ has been modified locally`,
    };
  }
  return { ok: true };
}
```

#### T4.2 — Shared content-integrity utility

Extract the content-tree hashing from Wave 1's `computeCardIntegrity` into a reusable utility so both card-store and registry resolvers share one implementation. Create `cli/core/content-integrity.ts`:

```ts
// ABOUTME: Shared content-tree integrity hashing used by cards and registries.
// ABOUTME: Walks a directory deterministically and hashes per-file content.

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export async function walkAndHashTree(rootDir: string, excludeNames: string[] = []): Promise<string> {
  const exclude = new Set(excludeNames);
  const entries: Array<{ relPath: string; abs: string; mode: number }> = [];
  async function recurse(currentAbs: string, currentRel: string) {
    const dirents = await readdir(currentAbs, { withFileTypes: true });
    for (const dirent of dirents) {
      const relPath = currentRel ? `${currentRel}/${dirent.name}` : dirent.name;
      if (exclude.has(relPath)) continue;
      const abs = join(currentAbs, dirent.name);
      if (dirent.isDirectory()) {
        await recurse(abs, relPath);
      } else if (dirent.isFile() || dirent.isSymbolicLink()) {
        const stats = await stat(abs);
        if (stats.isFile()) {
          entries.push({ relPath, abs, mode: stats.mode });
        }
      }
    }
  }
  await recurse(rootDir, "");
  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  const records: Array<{ p: string; m: "x" | "-"; h: string }> = [];
  for (const entry of entries) {
    const content = await readFile(entry.abs);
    records.push({
      p: entry.relPath,
      m: (entry.mode & 0o111) !== 0 ? "x" : "-",
      h: createHash("sha256").update(content).digest("hex"),
    });
  }
  return `sha256-${createHash("sha256").update(JSON.stringify(records)).digest("hex")}`;
}
```

Refactor `cli/core/card-store.ts::computeCardIntegrity` to call `walkAndHashTree(versionDir, [".integrity"])`. This is a refactor; the algorithm and output are unchanged from Wave 1's T2. Existing Wave 1 tests pass without modification.

### Acceptance criteria

- All cases in `core-registry-published-artifact.test.ts` pass.
- `computeCardIntegrity` continues to produce identical hashes for the same content (refactor preserves behavior).
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-registry-published-artifact.test.ts test/core-card-integrity-content.test.ts
bun test
bun run typecheck
```

---

## T5 — Registry Kind: `git-sha`

### Objective

Implement the `git-sha` resolver: locate the registry root from a local repo path, capture HEAD SHA, compute `skills/shared/` integrity. Detect drift on either SHA mismatch or content mismatch (dirty tree).

T4 and T5 may run in parallel sessions; both depend on T3 and `content-integrity.ts` from T4.2.

### Files

- `cli/core/registry-git-sha.ts` (new)
- `test/core-registry-git-sha.test.ts` (new)

### Tests first

Create `test/core-registry-git-sha.test.ts`:

```ts
// ABOUTME: Verifies git-sha registry resolution, SHA + dirty-tree drift detection.
// ABOUTME: Protects development workflows against silent registry shifts.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";
import {
  resolveGitShaRegistry,
  verifyGitShaPin,
} from "../cli/core/registry-git-sha";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function git(repo: string, args: string[]) {
  return execSync(`git ${args.join(" ")}`, { cwd: repo, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}

async function scaffoldGitRepo(initialContent: string) {
  const repo = await createTempRoot("git-reg-");
  tempRoots.push(repo);
  await mkdir(join(repo, "skills", "shared", "alpha"), { recursive: true });
  await writeFile(join(repo, "skills", "shared", "alpha", "SKILL.md"), initialContent);
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "initial"]);
  return { repo, sha: git(repo, ["rev-parse", "HEAD"]) };
}

test("resolveGitShaRegistry returns repo path, current HEAD SHA, and integrity", async () => {
  const { repo, sha } = await scaffoldGitRepo("---\nname: alpha\n---\n");

  const resolved = await resolveGitShaRegistry({ repo });

  expect(resolved.rootPath).toBe(repo);
  expect(resolved.sha).toBe(sha);
  expect(resolved.integrity.startsWith("sha256-")).toBe(true);
});

test("verifyGitShaPin succeeds when SHA and integrity match", async () => {
  const { repo, sha } = await scaffoldGitRepo("---\nname: alpha\n---\n");
  const resolved = await resolveGitShaRegistry({ repo });

  const verification = await verifyGitShaPin(
    { name: "default", kind: "git-sha", repo, sha, integrity: resolved.integrity },
    { repo },
  );

  expect(verification.ok).toBe(true);
});

test("verifyGitShaPin reports SHA drift after a commit", async () => {
  const { repo, sha } = await scaffoldGitRepo("---\nname: alpha\n---\n");
  await writeFile(join(repo, "skills", "shared", "alpha", "SKILL.md"), "---\nname: alpha\n---\nupdated\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "update"]);

  const verification = await verifyGitShaPin(
    { name: "default", kind: "git-sha", repo, sha, integrity: "sha256-stale" },
    { repo },
  );

  expect(verification.ok).toBe(false);
  expect(verification.reason).toContain("SHA drift");
});

test("verifyGitShaPin reports dirty-tree drift even when SHA matches", async () => {
  const { repo, sha } = await scaffoldGitRepo("---\nname: alpha\n---\n");
  const resolved = await resolveGitShaRegistry({ repo });
  // Uncommitted edit: SHA still matches but content drifts.
  await writeFile(join(repo, "skills", "shared", "alpha", "SKILL.md"), "---\nname: alpha\n---\nDIRTY\n");

  const verification = await verifyGitShaPin(
    { name: "default", kind: "git-sha", repo, sha, integrity: resolved.integrity },
    { repo },
  );

  expect(verification.ok).toBe(false);
  expect(verification.reason).toContain("dirty tree");
});

test("verifyGitShaPin reports cannot-find-repo if the configured repo path is gone", async () => {
  const verification = await verifyGitShaPin(
    { name: "default", kind: "git-sha", repo: "/nonexistent", sha: "abc", integrity: "sha256-abc" },
    { repo: "/nonexistent" },
  );

  expect(verification.ok).toBe(false);
  expect(verification.reason).toContain("repo path does not exist");
});
```

Run:

```bash
bun test test/core-registry-git-sha.test.ts
```

Expect FAIL.

### Implementation

Create `cli/core/registry-git-sha.ts`:

```ts
// ABOUTME: Resolves the default registry from a local git checkout.
// ABOUTME: Implements git-sha kind: SHA + content integrity verification.

import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { walkAndHashTree } from "./content-integrity";

export interface GitShaInput {
  repo: string;
}

export interface GitShaResolved {
  rootPath: string;
  sha: string;
  integrity: string;
}

export interface GitShaPin {
  name: "default";
  kind: "git-sha";
  repo: string;
  sha: string;
  integrity: string;
}

export type RegistryVerificationResult = { ok: true } | { ok: false; reason: string };

function gitHead(repo: string): string {
  return execSync("git rev-parse HEAD", { cwd: repo, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}

export async function resolveGitShaRegistry(input: GitShaInput): Promise<GitShaResolved> {
  if (!existsSync(input.repo)) {
    throw new Error(`git-sha registry: repo path does not exist: ${input.repo}`);
  }
  if (!existsSync(join(input.repo, ".git"))) {
    throw new Error(`git-sha registry: not a git repo: ${input.repo}`);
  }
  const sha = gitHead(input.repo);
  const sharedDir = join(input.repo, "skills", "shared");
  if (!existsSync(sharedDir)) {
    throw new Error(`git-sha registry: ${sharedDir} does not exist`);
  }
  const integrity = await walkAndHashTree(sharedDir);
  return { rootPath: input.repo, sha, integrity };
}

export async function verifyGitShaPin(
  pin: GitShaPin,
  input: { repo: string },
): Promise<RegistryVerificationResult> {
  if (!existsSync(input.repo)) {
    return { ok: false, reason: `repo path does not exist: ${input.repo}` };
  }
  let actual: GitShaResolved;
  try {
    actual = await resolveGitShaRegistry({ repo: input.repo });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  if (actual.sha !== pin.sha) {
    return {
      ok: false,
      reason: `SHA drift: pinned: ${pin.sha.slice(0, 12)}, actual: ${actual.sha.slice(0, 12)} (${input.repo})`,
    };
  }
  if (actual.integrity !== pin.integrity) {
    return {
      ok: false,
      reason: `dirty tree: SHA matches ${pin.sha.slice(0, 12)} but skills/shared/ has uncommitted changes`,
    };
  }
  return { ok: true };
}
```

### Acceptance criteria

- All cases in `core-registry-git-sha.test.ts` pass.
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-registry-git-sha.test.ts
bun test
bun run typecheck
```

---

## T6 — Registry Layer in `card-skill-resolver`

### Objective

Extend `cli/core/card-skill-resolver.ts::resolveSkillSource` with Layer 2 (registry) attribution. Dispatch to the kind-specific resolver based on the lockfile's `registry.kind`. Populate the lockfile's `registry` block during apply.

### Files

- `cli/core/registry-resolver.ts` (new — dispatch layer)
- `cli/core/card-skill-resolver.ts` (extend)
- `cli/core/card-project.ts` (apply-time pin population)
- `cli/core/card-store.ts` (consume `ensureRegistryDefault` from T3)
- `test/core-card-skill-resolver.test.ts` (extend)
- `test/scenarios-card-shared-resolution.test.ts` (new)

### Tests first

In `test/core-card-skill-resolver.test.ts`, add:

```ts
test("resolveSkillSource returns Layer 2 attribution for a card-shared skill", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  // Card declares skills.shared: ["alpha"]; alpha exists in fixture's skills/shared/.
  const versionDir = await publishCardWithShared(fixture, {
    name: "@me/setup",
    shared: ["alpha"],
  });
  // Set up the machine config to use git-sha against fixture.repoRoot.
  await runAgentsCli(["store", "set-registry", "git-sha", "--repo", fixture.repoRoot], envFor(fixture));
  const lockedCards = await resolveProjectCards(fixture.agentsDir, ["@me/setup@^1.0.0"]);

  const resolved = await resolveSkillSource("alpha", lockedCards, fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("registry");
  if (resolved.layer !== "registry") throw new Error();
  expect(resolved.cardName).toBe("@me/setup");
  expect(resolved.path).toBe(join(fixture.repoRoot, "skills", "shared", "alpha"));
});

test("Layer 1 (card-bundled) wins over Layer 2 (registry) when both could apply", async () => {
  // If a card both bundles a skill in skills.include AND lists another card's shared-name with the same string,
  // bundle wins. (We enforce no-overlap within a card via T1.)
  // Multi-card case: card A bundles "alpha", card B shared-includes "alpha". Bundle wins regardless of order.
  // ...
});
```

(`publishCardWithShared` is a new test helper landing in this task — see Helper Additions section below.)

Create `test/scenarios-card-shared-resolution.test.ts`:

```ts
// ABOUTME: Verifies end-to-end resolution of skills.shared via the configured default registry.
// ABOUTME: Protects the Wave 2 selector path under both published-artifact and git-sha kinds.

import { afterEach, expect, test } from "bun:test";
import { readlinkSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithShared, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("project write materializes skills.shared via the git-sha registry", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  // Ensure the fixture's repoRoot is a git repo with a single commit.
  // (Helper extension: scaffoldCliFixture optionally initializes git.)
  await initFixtureAsGitRepo(fixture);
  await runAgentsCli(["store", "set-registry", "git-sha", "--repo", fixture.repoRoot], envFor(fixture));
  await publishCardWithShared(fixture, { name: "@me/setup", shared: ["alpha"] });

  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "bgng", "config.json"),
    JSON.stringify({ version: 1, cards: ["@me/setup@^1.0.0"] }, null, 2),
  );

  // Apply populates the lockfile with the registry pin.
  const apply = await runAgentsCli(["apply", "@me/setup@^1.0.0"], envFor(fixture), projectDir);
  expect(apply.exitCode).toBe(0);
  const lock = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "card.lock"), "utf8"));
  expect(lock.lockfileVersion).toBe(2);
  expect(lock.cards[0].sharedSkills).toEqual(["alpha"]);
  expect(lock.cards[0].registry.kind).toBe("git-sha");
  expect(lock.cards[0].registry.sha).toMatch(/^[0-9a-f]{40}$/);

  // Write materializes the symlink pointing at the registry root.
  const write = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(write.exitCode).toBe(0);
  expect(readlinkSync(join(projectDir, ".claude", "skills", "alpha")))
    .toBe(join(fixture.repoRoot, "skills", "shared", "alpha"));
});
```

Run:

```bash
bun test test/core-card-skill-resolver.test.ts test/scenarios-card-shared-resolution.test.ts
```

Expect FAIL.

### Implementation

#### T6.1 — Dispatch module

Create `cli/core/registry-resolver.ts`:

```ts
// ABOUTME: Dispatches registry resolution to kind-specific implementations.
// ABOUTME: Central handoff between card-skill-resolver and registry-* kind modules.

import type { CardRegistryPin } from "./card-lock";
import type { RegistryHint } from "./types";
import { resolvePublishedArtifactRegistry, verifyPublishedArtifactPin } from "./registry-published-artifact";
import { resolveGitShaRegistry, verifyGitShaPin } from "./registry-git-sha";

export interface ResolvedRegistry {
  rootPath: string;
  pin: CardRegistryPin;
}

export async function resolveRegistry(hint: RegistryHint): Promise<ResolvedRegistry> {
  if (hint.kind === "published-artifact") {
    const result = await resolvePublishedArtifactRegistry({ artifact: hint.artifact });
    return {
      rootPath: result.rootPath,
      pin: {
        name: "default",
        kind: "published-artifact",
        artifact: hint.artifact,
        version: result.version,
        integrity: result.integrity,
      },
    };
  }
  const result = await resolveGitShaRegistry({ repo: hint.repo });
  return {
    rootPath: result.rootPath,
    pin: {
      name: "default",
      kind: "git-sha",
      repo: hint.repo,
      sha: result.sha,
      integrity: result.integrity,
    },
  };
}

export async function verifyRegistryPin(
  pin: CardRegistryPin,
  hint: RegistryHint,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (pin.kind !== hint.kind) {
    return {
      ok: false,
      reason: `registry kind mismatch: pin is ${pin.kind}, machine config is ${hint.kind}`,
    };
  }
  if (pin.kind === "published-artifact") {
    return verifyPublishedArtifactPin(pin, { npmPrefix: undefined });
  }
  return verifyGitShaPin(pin, { repo: pin.repo });
}
```

#### T6.2 — Extend `card-skill-resolver`

In `cli/core/card-skill-resolver.ts`:

```ts
import { resolveRegistry, type ResolvedRegistry } from "./registry-resolver";
import type { RegistryHint } from "./types";
import { join } from "node:path";

export type ResolvedSkillSource =
  | { layer: "card"; cardName: string; cardVersion: string; path: string }
  | { layer: "registry"; cardName: string; cardVersion: string; registryPin: CardRegistryPin; path: string }
  | { layer: "user-default"; path: string; scope: SkillScope }
  | { layer: "missing"; reason: string };

export async function resolveSkillSource(
  name: string,
  lockedCards: CardLockEntry[],
  repoRoot: string,
  agentsDir: string,
  registryHint?: RegistryHint,            // optional injection for tests; usually loaded from machine.json
): Promise<ResolvedSkillSource> {
  // Layer 1: card-bundled (unchanged from Wave 1).
  for (const card of lockedCards) {
    if (!card.skills.includes(name)) continue;
    const path = join(card.path, "skills", name);
    if (!existsSync(path)) {
      return { layer: "missing", reason: `card store is corrupt ...` };
    }
    return { layer: "card", cardName: card.name, cardVersion: card.version, path };
  }

  // Layer 2: registry-shared (NEW in Wave 2).
  for (const card of lockedCards) {
    if (!card.sharedSkills.includes(name)) continue;
    if (card.registry === null) {
      return { layer: "missing", reason: `card ${card.name}@${card.version} declares sharedSkills but has no registry pin in the lockfile` };
    }
    // Look up the registry root from the pin. Verification is the planner's job (T7); the resolver
    // returns the resolved path so the planner can decide whether to materialize.
    const registryPath = await resolveRegistryRootPath(card.registry);
    const path = join(registryPath, "skills", "shared", name);
    if (!existsSync(path)) {
      return { layer: "missing", reason: `registry ${card.registry.name} does not provide skill '${name}'` };
    }
    return {
      layer: "registry",
      cardName: card.name,
      cardVersion: card.version,
      registryPin: card.registry,
      path,
    };
  }

  // Layer 3 (was Layer 2 in Wave 1): user-defaults.
  const userDefault = await findAvailableSkill(repoRoot, agentsDir, name);
  if (userDefault) {
    return { layer: "user-default", path: userDefault.path, scope: userDefault.scope };
  }
  return { layer: "missing", reason: `skill '${name}' is not provided by any applied card and is not available as a user-default; check spelling or add a card that provides it.` };
}

async function resolveRegistryRootPath(pin: CardRegistryPin): Promise<string> {
  if (pin.kind === "published-artifact") {
    const result = await resolvePublishedArtifactRegistry({ artifact: pin.artifact });
    return result.rootPath;
  }
  return pin.repo;
}
```

#### T6.3 — Apply-time pin population

In `cli/core/card-project.ts::resolveProjectCards`, when a card has non-empty `skills.shared`, resolve the registry and populate the pin:

```ts
import { ensureRegistryDefault } from "./card-store";
import { resolveRegistry } from "./registry-resolver";

export async function resolveProjectCards(agentsDir: string, specs: string[]): Promise<CardLockEntry[]> {
  const resolved = await Promise.all(specs.map((spec) => resolveCard(agentsDir, spec)));
  const cards: CardLockEntry[] = [];
  let registryCache: { hint: RegistryHint; resolved: ResolvedRegistry } | null = null;

  for (const card of resolved) {
    const sharedSkills = card.manifest.skills?.shared ?? [];
    let registry: CardRegistryPin | null = null;
    if (sharedSkills.length > 0) {
      if (!registryCache) {
        const hint = await ensureRegistryDefault(agentsDir);
        const resolvedReg = await resolveRegistry(hint);
        registryCache = { hint, resolved: resolvedReg };
      }
      registry = registryCache.resolved.pin;
    }
    cards.push({
      name: card.name,
      requested: card.requested,
      version: card.version,
      path: card.dir,
      integrity: card.integrity,
      manifest: card.manifest,
      skills: card.manifest.skills?.include ?? [],
      sharedSkills,
      registry,
    });
  }
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}
```

The single-pass cache reuse means all cards in one apply share the same registry resolution (fewer disk operations) and identical pins (consistency).

### Acceptance criteria

- All Wave 1 cases in `core-card-skill-resolver.test.ts` continue to pass.
- New Wave 2 cases for Layer 2 attribution pass.
- `scenarios-card-shared-resolution.test.ts` end-to-end test passes.
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/core-card-skill-resolver.test.ts test/scenarios-card-shared-resolution.test.ts
bun test
bun run typecheck
```

---

## T7 — Drift Refusal at Write Time + `bgng doctor` Check

### Objective

Before any symlink is materialized for a registry-resolved skill, verify the lockfile's pin matches the live registry state. Refuse the write on drift with an actionable message. `--force` bypasses and updates the lockfile to actual. `bgng doctor` reports the same condition read-only.

### Files

- `cli/core/sync.ts`
- `cli/core/diagnostics.ts`
- `cli/core/card-project.ts` (for `--force` lockfile rewrite)
- `test/scenarios-registry-drift-refusal.test.ts` (new)
- `test/commands-doctor.test.ts` (extend)

### Tests first

Create `test/scenarios-registry-drift-refusal.test.ts`:

```ts
// ABOUTME: Verifies bgng write refuses to proceed on registry drift and accepts --force with audit.
// ABOUTME: Protects the Wave 2 reproducibility guarantee under selector semantics.

import { afterEach, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { cleanupTempRoots, envFor, initFixtureAsGitRepo, publishCardWithShared, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("bgng write refuses on registry SHA drift and explains the fix", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await initFixtureAsGitRepo(fixture);
  await runAgentsCli(["store", "set-registry", "git-sha", "--repo", fixture.repoRoot], envFor(fixture));
  await publishCardWithShared(fixture, { name: "@me/setup", shared: ["alpha"] });
  // Apply and write once to establish the pin.
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "bgng", "config.json"), JSON.stringify({ version: 1, cards: ["@me/setup@^1.0.0"] }, null, 2));
  expect((await runAgentsCli(["apply", "@me/setup@^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode).toBe(0);

  // Advance the registry: new commit changes the skill content.
  await writeFile(join(fixture.repoRoot, "skills", "shared", "alpha", "SKILL.md"), "---\nname: alpha\n---\nupdated\n");
  execSync("git add . && git commit -q -m 'update'", { cwd: fixture.repoRoot });

  // Subsequent write should refuse.
  const second = await runAgentsCli(["write"], envFor(fixture), projectDir);

  expect(second.exitCode).not.toBe(0);
  expect(second.stderr).toContain("Registry drift");
  expect(second.stderr).toContain("@me/setup@1.0.0");
  expect(second.stderr).toContain("SHA drift");
  expect(second.stderr).toContain("bgng cards update @me/setup");
});

test("bgng write --force past drift updates the lockfile and emits a warning", async () => {
  // ... same setup as above, advance the registry ...
  const forced = await runAgentsCli(["write", "--force"], envFor(fixture), projectDir);

  expect(forced.exitCode).toBe(0);
  expect(forced.stderr).toContain("WARN registry drift bypassed via --force; lockfile updated to actual");
  const lock = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "card.lock"), "utf8"));
  // The lockfile's registry.sha now reflects the new HEAD.
  expect(lock.cards[0].registry.sha).toMatch(/^[0-9a-f]{40}$/);
});

test("bgng doctor reports registry drift without mutating", async () => {
  // ... same setup ...
  const doctor = await runAgentsCli(["doctor"], envFor(fixture), projectDir);

  expect(doctor.exitCode).toBe(0);  // doctor is read-only and reports issues without failing.
  expect(doctor.stdout + doctor.stderr).toContain("registry drift");
});
```

In `test/commands-doctor.test.ts`, add a positive case asserting the field appears in `--json` output.

Run:

```bash
bun test test/scenarios-registry-drift-refusal.test.ts test/commands-doctor.test.ts
```

Expect FAIL.

### Implementation

#### T7.1 — Pre-materialization verification in `syncRepository`

In `cli/core/sync.ts::syncRepository`, after `lockedCards` are loaded and before `syncSkills` runs:

```ts
import { verifyRegistryPin } from "./registry-resolver";
import { ensureRegistryDefault } from "./card-store";

// ... existing logic ...

if (lockedCards.some((card) => card.sharedSkills.length > 0)) {
  const hint = await ensureRegistryDefault(normalized.agentsDir);
  const drift: Array<{ card: string; reason: string }> = [];
  for (const card of lockedCards) {
    if (card.sharedSkills.length === 0 || card.registry === null) continue;
    const verification = await verifyRegistryPin(card.registry, hint);
    if (!verification.ok) {
      drift.push({ card: `${card.name}@${card.version}`, reason: verification.reason });
    }
  }
  if (drift.length > 0) {
    if (!normalized.force) {
      const message = drift
        .map((entry) => `  - ${entry.card}: ${entry.reason}`)
        .join("\n");
      throw new Error(
        `Registry drift detected:\n${message}\n\nResolve by:\n` +
        `  - re-applying affected cards: bgng cards update <name>\n` +
        `  - or forcing the write past the pin: bgng write --force\n`,
      );
    }
    // --force: update pins to actual.
    console.warn(
      `WARN registry drift bypassed via --force; lockfile updated to actual:\n${drift.map((e) => `  ${e.card}`).join("\n")}`,
    );
    await updateLockedCardRegistryPins(projectRoot, normalized.agentsDir, hint);
    // Reload lockedCards with the fresh pins for the rest of the write.
    lockedCards = await resolveProjectCards(normalized.agentsDir, projectConfig.cards ?? []);
  }
}
```

`updateLockedCardRegistryPins` is a small helper in `card-project.ts`:

```ts
export async function updateLockedCardRegistryPins(projectRoot: string, agentsDir: string, hint: RegistryHint) {
  const lock = await loadCardLock(projectRoot);
  if (!lock) return;
  const resolvedReg = await resolveRegistry(hint);
  const cards = lock.cards.map((card) =>
    card.sharedSkills.length > 0 ? { ...card, registry: resolvedReg.pin } : card,
  );
  writeCardLock(projectRoot, cards);
}
```

#### T7.2 — `bgng doctor` registry drift section

In `cli/core/diagnostics.ts::buildDoctorReportWithProject`, add a registry drift report section:

```ts
import { verifyRegistryPin } from "./registry-resolver";
import { ensureRegistryDefault } from "./card-store";

// inside buildDoctorReportWithProject, after existing checks:
const registryDrift: Array<{ card: string; reason: string }> = [];
if (cardLocks.some((card) => card.sharedSkills.length > 0)) {
  try {
    const hint = await ensureRegistryDefault(agentsDir);
    for (const card of cardLocks) {
      if (card.sharedSkills.length === 0 || card.registry === null) continue;
      const verification = await verifyRegistryPin(card.registry, hint);
      if (!verification.ok) {
        registryDrift.push({ card: `${card.name}@${card.version}`, reason: verification.reason });
      }
    }
  } catch (error) {
    registryDrift.push({ card: "(registry resolution)", reason: error instanceof Error ? error.message : String(error) });
  }
}
report.registryDrift = registryDrift;
```

Extend `renderDoctorReport` in `cli/core/output.ts` to render the new section.

### Acceptance criteria

- All cases in `scenarios-registry-drift-refusal.test.ts` pass.
- `commands-doctor.test.ts` extensions pass.
- Existing Wave 1 `bgng write` and `bgng doctor` behavior unchanged for projects with no `sharedSkills`.
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/scenarios-registry-drift-refusal.test.ts test/commands-doctor.test.ts test/scenarios-idempotency.test.ts
bun test
bun run typecheck
```

---

## T8 — `bgng cards outdated` Registry Drift Section + `cards update --registry-only`

### Objective

Extend `bgng cards outdated` output with a Registry Drift section. Add `--registry-only` flag to `bgng cards update` for refreshing only the registry pin without bumping card versions.

### Files

- `cli/commands/card/outdated.ts`
- `cli/commands/card/update.ts`
- `cli/core/card-project.ts` (extend `findOutdatedProjectCards` and add `updateProjectCardRegistryOnly`)
- `test/commands-card-outdated.test.ts` (new or extend)
- `test/commands-card-update.test.ts` (new or extend)

### Tests first

Create or extend `test/commands-card-outdated.test.ts`:

```ts
test("bgng card outdated reports registry drift in a dedicated section", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await initFixtureAsGitRepo(fixture);
  await runAgentsCli(["store", "set-registry", "git-sha", "--repo", fixture.repoRoot], envFor(fixture));
  await publishCardWithShared(fixture, { name: "@me/setup", shared: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "bgng", "config.json"), JSON.stringify({ version: 1, cards: ["@me/setup@^1.0.0"] }, null, 2));
  await runAgentsCli(["apply", "@me/setup@^1.0.0"], envFor(fixture), projectDir);

  // Advance the registry.
  await writeFile(join(fixture.repoRoot, "skills", "shared", "alpha", "SKILL.md"), "---\nname: alpha\n---\nv2\n");
  execSync("git add . && git commit -q -m 'v2'", { cwd: fixture.repoRoot });

  const out = await runAgentsCli(["card", "outdated", "--json"], envFor(fixture), projectDir);

  expect(out.exitCode).toBe(0);
  const parsed = JSON.parse(out.stdout);
  expect(parsed.registryDrift).toHaveLength(1);
  expect(parsed.registryDrift[0].card).toBe("@me/setup@1.0.0");
  expect(parsed.registryDrift[0].reason).toContain("SHA drift");
});
```

Create or extend `test/commands-card-update.test.ts`:

```ts
test("bgng card update --registry-only refreshes the pin without bumping card versions", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  // ... setup as above, apply, advance the registry ...

  const result = await runAgentsCli(["card", "update", "--registry-only"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  const lock = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "card.lock"), "utf8"));
  expect(lock.cards[0].version).toBe("1.0.0");                  // card version unchanged
  expect(lock.cards[0].registry.sha).not.toBe(/* original sha */);  // pin refreshed
});
```

Run both. Expect FAIL.

### Implementation

#### T8.1 — Extend `findOutdatedProjectCards`

Change the return type:

```ts
export interface OutdatedReport {
  outdated: Array<{ name: string; current: string; latest: string }>;
  registryDrift: Array<{ card: string; reason: string }>;
}

export async function findOutdatedProjectCards(projectRoot: string, agentsDir: string): Promise<OutdatedReport> {
  const mutation = await updateProjectCardLock(projectRoot, agentsDir);
  const outdated: Array<{ name: string; current: string; latest: string }> = [];
  const registryDrift: Array<{ card: string; reason: string }> = [];

  for (const locked of mutation.locked) {
    const latest = await highestPublishedVersion(agentsDir, locked.name);
    if (latest && isNewerVersion(latest, locked.version)) {
      outdated.push({ name: locked.name, current: locked.version, latest });
    }
    if (locked.sharedSkills.length > 0 && locked.registry !== null) {
      const hint = await ensureRegistryDefault(agentsDir);
      const verification = await verifyRegistryPin(locked.registry, hint);
      if (!verification.ok) {
        registryDrift.push({ card: `${locked.name}@${locked.version}`, reason: verification.reason });
      }
    }
  }
  return { outdated, registryDrift };
}
```

Update `cli/commands/card/outdated.ts` to render both sections. JSON output:

```json
{
  "outdated": [...],
  "registryDrift": [...]
}
```

Table output adds a second table when `registryDrift.length > 0`.

The `--check` flag now exits non-zero if either list is non-empty.

#### T8.2 — `--registry-only` flag

In `cli/commands/card/update.ts`:

```ts
registryOnly = Option.Boolean("--registry-only", false, {
  description: "Refresh the registry pin without changing card versions.",
});

async execute() {
  const projectRoot = requireProjectRoot(this);
  const result = this.registryOnly
    ? await updateProjectCardRegistryOnly(projectRoot, this.context.agentsDir)
    : await updateProjectCardLock(projectRoot, this.context.agentsDir);
  this.context.stdout.write(renderCardMutation(result));
  if (this.write) return await runChainedWrite(this);
  return 0;
}
```

New core function `updateProjectCardRegistryOnly` in `card-project.ts`:

```ts
export async function updateProjectCardRegistryOnly(projectRoot: string, agentsDir: string) {
  const lock = await loadCardLock(projectRoot);
  if (!lock) throw new Error("No card.lock found; apply cards before updating.");
  const hint = await ensureRegistryDefault(agentsDir);
  const resolvedReg = await resolveRegistry(hint);
  const cards = lock.cards.map((card) =>
    card.sharedSkills.length > 0 ? { ...card, registry: resolvedReg.pin } : card,
  );
  const lockPath = writeCardLock(projectRoot, cards);
  return { projectConfigPath: projectConfigPath(projectRoot), lockPath, cards: lock.cards.map((c) => c.requested), locked: cards };
}
```

### Acceptance criteria

- `commands-card-outdated.test.ts` registry drift section assertion passes.
- `commands-card-update.test.ts` `--registry-only` test passes.
- Existing `commands-card-outdated.test.ts` and `commands-card-update.test.ts` tests continue to pass.
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/commands-card-outdated.test.ts test/commands-card-update.test.ts
bun test
bun run typecheck
```

---

## T9 — Status Diagnostics: Registry Layer Attribution

### Objective

`bgng status --explain` reports the resolution layer for every effective skill, including registry attribution. `bgng status --why <name>` for a shared-resolved skill returns the pin's `kind` and identity. `bgng status` overview gains a `registries` section.

### Files

- `cli/core/diagnostics.ts`
- `cli/commands/status.ts` (likely no changes; diagnostics drives the output)
- `cli/core/output.ts` (if status output rendering is centralized there)
- `test/commands-status-why.test.ts` (extend)
- `test/commands-status.test.ts` (extend)

### Tests first

In `test/commands-status-why.test.ts`:

```ts
test("status --why for a shared-resolved skill returns the registry pin", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await initFixtureAsGitRepo(fixture);
  await runAgentsCli(["store", "set-registry", "git-sha", "--repo", fixture.repoRoot], envFor(fixture));
  await publishCardWithShared(fixture, { name: "@me/setup", shared: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "bgng"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "bgng", "config.json"), JSON.stringify({ version: 1, cards: ["@me/setup@^1.0.0"] }, null, 2));
  await runAgentsCli(["apply", "@me/setup@^1.0.0"], envFor(fixture), projectDir);

  const out = await runAgentsCli(["status", "--why", "skill:alpha", "--json"], envFor(fixture), projectDir);

  expect(out.exitCode).toBe(0);
  const parsed = JSON.parse(out.stdout);
  expect(parsed.layer).toBe("registry");
  expect(parsed.card).toBe("@me/setup@1.0.0");
  expect(parsed.registry.kind).toBe("git-sha");
  expect(parsed.registry.sha).toMatch(/^[0-9a-f]{40}$/);
});
```

In `test/commands-status.test.ts`:

```ts
test("status output includes a registries section listing each unique pin", async () => {
  // ... setup with at least one shared-skill card ...
  const out = await runAgentsCli(["status", "--json"], envFor(fixture), projectDir);

  expect(out.exitCode).toBe(0);
  const parsed = JSON.parse(out.stdout);
  expect(parsed.registries).toBeDefined();
  expect(parsed.registries[0].kind).toBe("git-sha");
  expect(parsed.registries[0].state).toBe("verified");  // or "drift"
});
```

Run. Expect FAIL.

### Implementation

In `cli/core/diagnostics.ts`, extend the `--why` path to consult the resolver for registry attribution (the diagnostics module already loads `lockedCards` from Wave 1):

```ts
// In the WhyMatch resolution, after the existing card-skill check:
const sharedSkill = cardLocks.find((card) => card.sharedSkills.includes(name));
if (sharedSkill && sharedSkill.registry) {
  return {
    kind: "skill",
    name,
    message: `Skill: ${name}\n  layer:  registry\n  source: card ${sharedSkill.name}@${sharedSkill.version} (via skills.shared)\n  pin:    ${sharedSkill.registry.kind === "published-artifact" ? `${sharedSkill.registry.artifact}@${sharedSkill.registry.version}` : `${sharedSkill.registry.repo}#${sharedSkill.registry.sha.slice(0, 12)}`}`,
    json: {
      layer: "registry",
      card: `${sharedSkill.name}@${sharedSkill.version}`,
      registry: sharedSkill.registry,
    },
  };
}
```

(Adjust the `WhyMatch` type to include `json` if it doesn't already — Wave 1's structure should already accommodate this.)

Extend the diagnostics report's `registries` section:

```ts
type RegistrySummary = {
  pin: CardRegistryPin;
  consumedBy: string[];          // list of cards using this pin
  state: "verified" | "drift" | "unverified";
  driftReason?: string;
};

// Aggregate by unique-pin (kind + identity).
const pinKey = (p: CardRegistryPin) =>
  p.kind === "published-artifact" ? `${p.kind}:${p.artifact}@${p.version}` : `${p.kind}:${p.repo}#${p.sha}`;
const map = new Map<string, RegistrySummary>();
for (const card of cardLocks) {
  if (!card.registry) continue;
  const key = pinKey(card.registry);
  const entry = map.get(key) ?? { pin: card.registry, consumedBy: [], state: "unverified" as const };
  entry.consumedBy.push(`${card.name}@${card.version}`);
  map.set(key, entry);
}
// Verify each unique pin.
for (const entry of map.values()) {
  try {
    const hint = await ensureRegistryDefault(agentsDir);
    const verification = await verifyRegistryPin(entry.pin, hint);
    entry.state = verification.ok ? "verified" : "drift";
    if (!verification.ok) entry.driftReason = verification.reason;
  } catch (error) {
    entry.state = "unverified";
    entry.driftReason = error instanceof Error ? error.message : String(error);
  }
}
report.registries = [...map.values()];
```

### Acceptance criteria

- New `commands-status-why.test.ts` case passes.
- New `commands-status.test.ts` case passes.
- Existing `commands-status*` tests continue to pass with the additional `registries` field in JSON output (assert presence, not absence).
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/commands-status-why.test.ts test/commands-status.test.ts test/commands-doctor.test.ts
bun test
bun run typecheck
```

---

## T10 — End-to-End Scenarios and Wave 2 Regression Bar

### Objective

Establish a comprehensive scenarios suite that exercises Wave 2 across both kinds, plus a regression bar that confirms Wave 1 invariants still hold.

### Files

- `test/scenarios-registry-cross-kind.test.ts` (new — coverage for switching kinds)
- `test/scenarios-idempotency.test.ts` (extend with shared-skill case)
- `test/scenarios-cleanup.test.ts` (extend if needed)

### Tests first

Create `test/scenarios-registry-cross-kind.test.ts`:

```ts
test("switching machine config from git-sha to published-artifact updates resolved skill paths on next write", async () => {
  // 1. Set up fixture with git-sha; apply card with sharedSkills.
  // 2. Write; assert symlinks point at git-sha root.
  // 3. Scaffold a fake npm-global beginning-harness install with matching skills/shared/.
  // 4. `bgng store set-registry published-artifact --artifact beginning-harness` (with NPM_PREFIX injected).
  // 5. Run `bgng cards update --registry-only` to refresh pins.
  // 6. Run `bgng write`; assert symlinks now point at npm-global root.
});

test("write twice with shared-skill resolution produces zero changes on second write", async () => {
  // Wave 2 idempotency regression.
});
```

In `test/scenarios-idempotency.test.ts`, extend with:

```ts
test("write twice with a card that uses skills.shared produces zero changes on second write", async () => {
  // Same idempotency property must hold for the Wave 2 path.
});
```

Run. Expect new ones FAIL.

### Implementation

No new modules. T10's tests should pass after T1–T9 implementation; if any fail, that indicates a regression in T1–T9 — fix there. T10 is the safety net.

### Acceptance criteria

- All scenario tests pass.
- Wave 1 idempotency tests continue to pass.
- `bun test` is green.
- `bun run typecheck` is green.

### Verification

```bash
bun test test/scenarios-*.test.ts
bun test
bun run typecheck
```

---

## Cross-Task Verification

After all tasks land, run the full bar:

```bash
bun test
bun run typecheck
bun run verify:release
```

Expected: zero failures.

### Smoke test against a real project

Reproduce the cross-kind round trip end-to-end:

```bash
# In a tmp dir; assume Wave 2 build is on PATH.
mkdir wave2-smoke && cd wave2-smoke
git init
mkdir -p .agents/bgng
echo '{"version": 1}' > .agents/bgng/config.json

# Configure dev-mode registry (git-sha against the harness checkout you're running from).
bgng store set-registry git-sha --repo /path/to/beginning-harness

# Author a card that references a skill via skills.shared (not bundled).
bgng card new dev-card --scope @me --no-git
# Edit ~/.agents/bgng/sources/@me/dev-card/card.json:
#   { "skills": { "shared": ["verification-before-completion"] } }
# (Do NOT create skills/verification-before-completion/ in the card source.)
bgng card publish @me/dev-card

bgng apply @me/dev-card@^1.0.0
cat .agents/bgng/card.lock | jq '.cards[0].registry'        # confirm git-sha pin populated

bgng write
readlink .claude/skills/verification-before-completion       # points at /path/to/beginning-harness/skills/shared/...

# Drift simulation: amend a commit in the harness repo without re-applying.
( cd /path/to/beginning-harness && git commit --amend --no-edit )

bgng write                                                    # refuses with "Registry drift" message
bgng card outdated                                            # shows the drift in Registry Drift section
bgng status --why skill:verification-before-completion       # reports state: drift
bgng doctor                                                   # reports registryDrift entry
bgng write --force                                            # bypasses with WARN; lockfile updated
```

Confirm:

- Apply populates the registry pin.
- Symlink resolves into the registry root.
- After registry advances, every read surface (write, outdated, status, doctor) reports drift consistently.
- `--force` writes succeed and emit the lockfile-update warning.

### Cross-kind round trip

If feasible in CI (requires `npm install -g` capability), also exercise the `published-artifact` ↔ `git-sha` switch as in `scenarios-registry-cross-kind.test.ts`.

---

## Test Inventory Summary

### New test files

| File | Purpose | Task |
|---|---|---|
| `test/core-registry-published-artifact.test.ts` | Published-artifact resolver + drift | T4 |
| `test/core-registry-git-sha.test.ts` | Git-sha resolver + dirty-tree + SHA drift | T5 |
| `test/scenarios-card-shared-resolution.test.ts` | End-to-end shared-skill materialization | T6 |
| `test/scenarios-registry-drift-refusal.test.ts` | Drift refuse + `--force` bypass | T7 |
| `test/commands-store-set-registry.test.ts` | `bgng store set-registry` command | T3 |
| `test/scenarios-registry-cross-kind.test.ts` | Switching registry kinds; cross-kind idempotency | T10 |

### Extended test files

| File | New cases | Task |
|---|---|---|
| `test/core-card-manifest.test.ts` | `skills.shared` activation, overlap rejection, registries validation | T1 |
| `test/commands-card-author.test.ts` | Publish with shared skills | T1 |
| `test/core-card-lock.test.ts` | v2 emission, v1→v2 upgrade, sharedSkills field, populated registry | T2 |
| `test/core-card-skill-resolver.test.ts` | Layer 2 attribution | T6 |
| `test/commands-card-outdated.test.ts` | Registry Drift section | T8 |
| `test/commands-card-update.test.ts` | `--registry-only` flag | T8 |
| `test/commands-status-why.test.ts` | Registry pin attribution in `--why` | T9 |
| `test/commands-status.test.ts` | `registries` section in status output | T9 |
| `test/commands-doctor.test.ts` | Registry drift report | T7 |
| `test/scenarios-idempotency.test.ts` | Shared-skill idempotency | T10 |

### Tests that must continue to pass without modification

- `test/scenarios-card-bundled-only.test.ts` (Wave 1 regression — Layer 1 path)
- `test/scenarios-card-materialization.test.ts` (Wave 1 materialization)
- `test/scenarios-scope-isolation.test.ts`
- `test/scenarios-cleanup.test.ts`
- `test/scenarios-user-journeys.test.ts`
- `test/core-card-integrity-content.test.ts` (Wave 1 content-tree integrity)
- `test/core-migration.test.ts` (Wave 1 legacy detection fix)

If any of these fail mid-implementation, that's a regression.

---

## Helper Additions

`test/helpers.ts` gains:

```ts
/**
 * Publish a card whose skills come exclusively from skills.shared (registry-resolved).
 * Does NOT create any source skills/<name>/ dirs — that's the point of shared.
 */
export async function publishCardWithShared(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { name: string; version?: string; shared: string[]; servers?: Record<string, unknown> },
): Promise<string> {
  const version = options.version ?? "1.0.0";
  const match = options.name.match(/^(@[^/]+)\/(.+)$/);
  if (!match) throw new Error(`Use a scoped card name in tests: ${options.name}`);
  const [, scope, cardName] = match;

  expect((await runAgentsCli(["card", "new", options.name, "--no-git"], envFor(fixture))).exitCode).toBe(0);

  const sourceRoot = join(fixture.agentsDir, "bgng", "sources", scope!, cardName!);
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = version;
  manifest.skills = { include: [], shared: options.shared };
  if (options.servers) manifest.servers = options.servers;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const published = await runAgentsCli(["card", "publish", options.name], envFor(fixture));
  expect(published.exitCode).toBe(0);
  return join(fixture.agentsDir, "bgng", "cards", scope!, cardName!, version);
}

/**
 * Initialize the fixture's repoRoot as a git repo with one commit.
 * Used by git-sha registry tests.
 */
export async function initFixtureAsGitRepo(fixture: { repoRoot: string }) {
  execSync("git init -q", { cwd: fixture.repoRoot });
  execSync("git config user.email test@example.com", { cwd: fixture.repoRoot });
  execSync("git config user.name Test", { cwd: fixture.repoRoot });
  execSync("git add .", { cwd: fixture.repoRoot });
  execSync("git commit -q -m initial", { cwd: fixture.repoRoot });
}

/**
 * Scaffold a fake npm-global tree containing a beginning-harness install for published-artifact tests.
 * Returns the npmPrefix to inject via REGISTRY_NPM_PREFIX env var in CLI invocations.
 */
export async function scaffoldFakeNpmGlobal(
  artifact: string,
  version: string,
  skills: Record<string, string>,
): Promise<{ npmPrefix: string }> {
  const root = await createTempRoot("fake-npm-");
  const pkgRoot = join(root, "lib", "node_modules", artifact);
  await mkdir(join(pkgRoot, "skills", "shared"), { recursive: true });
  await writeFile(join(pkgRoot, "package.json"), JSON.stringify({ name: artifact, version }, null, 2));
  for (const [name, body] of Object.entries(skills)) {
    await mkdir(join(pkgRoot, "skills", "shared", name), { recursive: true });
    await writeFile(join(pkgRoot, "skills", "shared", name, "SKILL.md"), body);
  }
  return { npmPrefix: root };
}
```

For the published-artifact path to be testable without polluting the real npm-global, `resolvePublishedArtifactRegistry` accepts an injectable `npmPrefix`. The CLI surface reads it from `REGISTRY_NPM_PREFIX` env var when present (else falls through to `npm prefix -g`):

```ts
function resolveNpmPrefix(): string {
  return process.env.REGISTRY_NPM_PREFIX ?? execSync("npm prefix -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}
```

Tests pass `REGISTRY_NPM_PREFIX` through `envFor`'s env object.

---

## Rollback Strategy

If Wave 2 must be reverted post-merge:

1. **Branch-level revert** is the recommended path. Wave 2's scope is large but additive — `git revert <merge-commit>` cleanly undoes manifest validation changes, the lockfile bump, the resolver extension, and the new commands.
2. **Lockfile compatibility.** Wave 2 lockfiles are `version: 2`. After revert, the Wave 1 reader rejects v2 lockfiles. Manual fix: delete `.agents/bgng/card.lock` and re-apply under Wave 1. The reapply produces a v1 lockfile (without `sharedSkills` / `registry`).
3. **Cards published with `skills.shared`** are not usable under Wave 1 (the Wave 1 validator rejects non-empty `skills.shared`). If users have published such cards, they must republish under Wave 1 with bundle semantics (move shared names into bundle and add corresponding directories).
4. **Machine config `registries` block** survives revert (Wave 1 reader ignores unknown keys). Safe.
5. **Card store `.integrity` files** are unchanged from Wave 1's format (content-tree hash). Wave 2 only refreshes them on apply; the format is identical.

Practical advice: like Wave 1, revert the whole Wave 2 feature branch rather than individual commits.

---

## Risk Register

| # | Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|---|
| R1 | npm-global detection misses non-standard prefixes. | Medium | Low | Auto-detection emits an INFO line explaining which kind was chosen; `bgng store set-registry` is the documented override. |
| R2 | `skills/shared/` becoming "public API" forces a deprecation policy on removing or renaming skills. | High | Medium | Document in release notes. Adopt deprecation-then-remove policy across minor versions. Tests for "deprecated skill still resolves" can guard. |
| R3 | Cross-machine teams pin different registry kinds and produce divergent harnesses despite matching lockfiles. | Medium | Medium | `bgng status` registries section reports the kind in use locally; release notes recommend pinning one kind via repo-level setup docs. |
| R4 | Lockfile bump (`version: 2`) breaks downgraders. | High | Low | By design (D6). Documented. Wave 1 readers refuse v2 with a clear error. |
| R5 | `--force` past drift silently rewrites the lockfile to actual; reproducibility is broken for that run. | Medium | Medium | Loud console warning. Optional `--force --record-drift` (future) to add audit metadata. |
| R6 | Dirty-tree detection on `git-sha` produces noisy drift for developers iterating on `skills/shared/`. | High | Low | Documented dev workflow: commit changes locally before running `bgng write`. Or accept drift via `--force` during iteration. |
| R7 | Registry resolution requires network/disk operations during write. Slow CI. | Medium | Low | Single-pass cache in `resolveProjectCards`; one resolution per apply. Verification on write is read-only and fast (hash + git rev-parse). |
| R8 | `tryDetectNpmGlobal` shells out to `npm` which may not be on PATH in some CI environments. | Low | Low | Auto-detect falls through to `git-sha`; if neither path works, throws with `bgng store set-registry` guidance. |
| R9 | Test isolation: fake-npm-global tests injecting `REGISTRY_NPM_PREFIX` may leak into other tests if not cleaned. | Low | Low | `cleanupTempRoots` covers the temp dir; env vars are scoped to the spawned CLI invocation via `envFor`. |
| R10 | The implicit v1→v2 lockfile upgrade produces a one-time diff. | High | Low | Document in release notes. Same caveat applied to Wave 1's integrity rewrite. |

---

## Definition of Done

All of the following must be true:

- [ ] T1 through T10 implemented in the order T1 → T2 → T3 → T4 ∥ T5 → T6 → T7 → T8 → T9 → T10.
- [ ] Every new test from this plan exists and passes.
- [ ] Every "must continue to pass" Wave 1 test still passes.
- [ ] `bun test` reports 0 failures.
- [ ] `bun run typecheck` reports 0 errors.
- [ ] `bun run verify:release` exits zero.
- [ ] The smoke test in **Cross-Task Verification** passes end-to-end against both `git-sha` and (if CI permits) `published-artifact`.
- [ ] The four Matt findings from Wave 1 (A, B, C, D) have not regressed.
- [ ] All ABOUTME comments on new files are present per CLAUDE.md.
- [ ] Commit messages follow the repo's `[type:scope] subject` convention with no AI-attribution markers (per memory `feedback_no_ai_attribution_in_commits.md`).
- [ ] A completion record is drafted at `.ai/tasks/21_completion_harness-cards-wave-2-implementation.md`.
- [ ] Release notes document: the lockfile bump, the `skills.shared` activation, the registry kind decisions, the deprecation policy for `skills/shared/`, and the `--force` semantics for drift bypass.

---

## Open Questions / Followups (do NOT block Wave 2)

- **Q1**: Should `--force` past drift gain a `--record-drift` flag that writes an audit entry into `.agents/bgng/registry-audit.log`? Listed in Wave 2 arch §14.2. Defer; revisit if compliance asks for it.
- **Q2**: Should `bgng cards update --all --registry-only` exist as a global refresh? Wave 2 ships per-card only. Add `--all` if real users request it.
- **Q3**: A `published-artifact` resolver that supports a non-global install (e.g., a workspace-local `node_modules/beginning-harness`) — useful for monorepo setups. Defer; today's npm-global path covers single-machine use.
- **Q4**: Should the manifest's `registries` field allow a default-only convention where omitting it means "every shared skill goes through default"? Currently the field is optional and unspecified entries implicitly default. Confirm this is the right ergonomic; revisit if explicit-only is wanted.
- **Q5**: Strict mode (refuse Layer 3 user-default fallback entirely). `bgng write --strict`. Cross-wave feature. Land later as a small follow-up.

---

## Appendix A — File Reference Index

For grep-friendly direct paths.

| Reference | File | Line | Description |
|---|---|---|---|
| W2.MAN.1 | `cli/core/card-manifest.ts` | 7–19 | `CardManifest` — `skills.shared` and `registries` (T1) |
| W2.MAN.2 | `cli/core/card-manifest.ts` | 38–74 | `validateCardManifest` — overlap, registries validation (T1) |
| W2.LCK.1 | `cli/core/card-lock.ts` | 9–22 | `CardLockEntry`, `CardLockfile`, `CardRegistryPin` (T2) |
| W2.LCK.2 | `cli/core/card-lock.ts` | 27–55 | `loadCardLock` v1+v2; `writeCardLock` emits v2 (T2) |
| W2.CPR.1 | `cli/core/card-project.ts` | 26–38 | `resolveProjectCards` populates `sharedSkills`, `registry` (T2, T6) |
| W2.CPR.2 | `cli/core/card-project.ts` | new | `updateProjectCardRegistryOnly` (T8) |
| W2.CPR.3 | `cli/core/card-project.ts` | new | `updateLockedCardRegistryPins` (T7) |
| W2.CST.1 | `cli/core/card-store.ts` | new | `ensureRegistryDefault`, `tryDetectNpmGlobal`, `detectHarnessRepoFromCliPath` (T3) |
| W2.TYP.1 | `cli/core/types.ts` | 76–80 | `MachineConfig` — extends `registries` (T3) |
| W2.TYP.2 | `cli/core/types.ts` | new | `RegistryHint` (T3) |
| W2.NEW.1 | `cli/core/registry-published-artifact.ts` | — | NEW MODULE (T4) |
| W2.NEW.2 | `cli/core/registry-git-sha.ts` | — | NEW MODULE (T5) |
| W2.NEW.3 | `cli/core/registry-resolver.ts` | — | NEW MODULE (T6) |
| W2.NEW.4 | `cli/core/content-integrity.ts` | — | NEW MODULE — extracted from Wave 1 (T4.2) |
| W2.RES.1 | `cli/core/card-skill-resolver.ts` | — | Extended with Layer 2 (T6) |
| W2.SYN.1 | `cli/core/sync.ts` | 218–264 | Drift verification before materialization (T7) |
| W2.DIA.1 | `cli/core/diagnostics.ts` | new | Registry drift, registries summary, `--why` registry attribution (T7, T9) |
| W2.CMD.1 | `cli/commands/store/set-registry.ts` | — | NEW COMMAND (T3) |
| W2.CMD.2 | `cli/commands/store/status.ts` | 30–53 | Render `defaultRegistry` (T3) |
| W2.CMD.3 | `cli/commands/card/outdated.ts` | 34–49 | Render Registry Drift section (T8) |
| W2.CMD.4 | `cli/commands/card/update.ts` | new | `--registry-only` flag (T8) |
| W2.IDX.1 | `cli/index.ts` | n/a | Register `StoreSetRegistryCommand` (T3) |

---

## Appendix B — Suggested Commit Sequence

One PR (or two: schema + integration). Commits follow the order below. Repo convention `[type:scope] subject`, no AI-attribution markers.

```
[feat:cards] activate skills.shared and validate overlap
  (T1)

[feat:cards] bump card lockfile to version 2
  (T2)

[feat:store] add registries.default to machine config with auto-detect
  (T3)

[feat:cards] add bgng store set-registry command
  (T3.3, T3.4)

[feat:cards] add published-artifact registry kind
  (T4)

[feat:cards] add git-sha registry kind
  (T5)

[refactor:cards] extract content-tree hashing into shared utility
  (T4.2)

[feat:cards] extend card-skill resolver with registry layer
  (T6)

[feat:cards] refuse on registry drift in write and doctor
  (T7)

[feat:cards] surface registry drift in cards outdated and update --registry-only
  (T8)

[feat:cards] attribute registry layer in status --explain and --why
  (T9)

[test:cards] end-to-end scenarios for cross-kind and idempotency
  (T10)
```

If the PR review surface gets large, split at the `[feat:cards] extend card-skill resolver with registry layer` line — everything before is "primitives + schemas," everything after is "integration + UX."

---

## Appendix C — Decisions Mapped to Architecture Decision Log

The 10 Wave 2 decisions map to `37_harness-cards-registry-pinning-target-architecture.md` §15 Decision Log:

| Implementation Decision | Architecture Decision |
|---|---|
| D1 — `published-artifact` primary, `git-sha` for dev | Arch §15 #1, #2 |
| D2 — drift refuse + `--force` | Arch §15 #4 |
| D3 — `--force` updates lockfile to actual | Arch §15 #5 |
| D4 — overlap rejection in manifest | Arch §15 #6 |
| D5 — machine hint vs lockfile pin decoupling | Arch §15 #7 |
| D6 — lockfile bumps to v2; both accepted | Arch §15 #8 |
| D7 — per-card registry pin | Arch §15 #9 |
| D8 — authoring helpers out of scope | Arch §15 #10 |
| D9 — implementation order with T4∥T5 parallel | Sign-off 2026-05-26 |
| D10 — `skills/shared/` already in `files` array (no package.json change) | Code inspection 2026-05-26 |

---

## Appendix D — Wave 1 Invariants Wave 2 Builds On

For quick cross-reference. These were established by `.ai/tasks/20_harness-cards-wave-1-implementation-plan.md` and Wave 2 assumes them.

| Wave 1 Invariant | Used by Wave 2 in |
|---|---|
| `cli/core/card-skill-resolver.ts::resolveSkillSource` exists with Layer 1 + Layer 2 (user-default) | T6 (extends with new Layer 2 = registry; renumbers user-default to Layer 3) |
| `computeCardIntegrity` hashes content trees, not manifest JSON | T4.2 (extracted into shared `walkAndHashTree`) |
| Lockfile is at `version: 1` with `skills[]` and `registry: null` | T2 (bumps to v2; `registry` becomes populated) |
| `bgng write` fails hard on unresolved skills | T6 (Layer 2 missing-skill path also hard-fails) |
| `detectLegacyLayout` no longer short-circuits on store init | unchanged |
| Manifest `skills.shared` is rejected if non-empty | T1 (lifts the rejection; activates the field) |
| Test helper `publishCardWithSkills` exists in `test/helpers.ts` | Wave 2 adds sibling helper `publishCardWithShared` |

If any of these invariants does not hold at Wave 2 start, stop and verify Wave 1 merged cleanly before proceeding.
