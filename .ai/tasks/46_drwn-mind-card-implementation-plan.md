# ABOUTME: Implementation plan for `type: "mind"` typed harness cards (v1, first iteration — no LFS).
# ABOUTME: Phased, handoff-ready breakdown referencing exact files, patterns, and tests to mirror.

# Task 46 — Implementation Plan: `type: "mind"` Card Support (v1, First Iteration)

**Status**: Revised, ready to start after grounding pass
**Created**: 2026-06-18
**Last Updated**: 2026-06-24
**Assigned**: Claude + Remy (implementer assignment TBD)
**Estimated Effort**: 5–8 working days for Phases 0–4 (drwn-side); Phase 5 (CCH) and Phase 6 (mind migration) are separate downstream tasks
**Dependencies**: Wave 1 (hooks) merged; analysis 63 approved
**References**: [.ai/analyses/63_drwn-mind-card-target-architecture.md, .ai/analyses/62_mind-as-card-substrate-evaluation.md, .ai/analyses/60_drwn-card-hooks-target-architecture.md, .ai/tasks/44_drwn-card-hooks-implementation-plan.md, .ai/tasks/45_plan1_l6-mind-card-from-personal-assistant.md, cli/core/card-manifest.ts, cli/core/card-source.ts, cli/core/card-store.ts, cli/core/card-project.ts, cli/core/card-lock.ts, cli/core/card-diff.ts, cli/core/sync.ts, cli/core/hook-generator/sync-hooks.ts, cli/core/store-paths.ts]

---

## Objective

Land `type: "mind"` typed harness cards with three new bundled content classes (persona, beliefs, three memory tiers) and per-layer visibility gates at push, materializing to `./.agents/drwn/generated/mind/` for CCH-mediated consumers (Mindcloud, Mindblown). Git LFS for L6 raw trajectory content is **deferred to a follow-on iteration**; this first iteration stores L6 as ordinary in-tree text/Markdown. Runtime delta / Mind Cloud writeback is out of scope.

The end-state of this task is: drwn ships a release where an author can `drwn card new --type=mind`, add persona/belief/memory entries via CLI, publish to the local store, push to a private remote with push-time visibility-gate enforcement, consume the card in another project, and have it materialize to a deterministic generated tree that CCH (separately) can mount into Mindblown/Mindcloud runtimes.

## Target State

- `cli/core/card-manifest.ts` carries the new `type` discriminator and `persona`/`beliefs`/`memory` interfaces, with full validation including mind-only-field-rejection on harness cards.
- `cli/core/card-source.ts` exposes `addCardSourcePersona`, `addCardSourceBelief`, `addCardSourceMemory` (and removes), matching the existing `addCardSourceHook` shape exactly.
- `drwn card new --type=mind` scaffolds mind-card source layout. There is no current `card source new` command; do **not** invent that surface in v1 unless product explicitly chooses to add it as an alias.
- New CLI commands: `card source add-persona|add-belief|add-memory`, `card source remove-persona|remove-belief|remove-memory`.
- `cli/core/card-source.ts:readCardSourceState` extended to walk persona/beliefs/memory directories and surface them in the doctor report.
- `cli/core/card-store.ts` gains published-card validation for mind directories/files, used by publish, resolve, and validate paths. `publishCard` remains local-only but refuses incomplete mind-card content.
- `cli/commands/card/push.ts` extended with a push-time visibility gate that classifies the target remote and refuses when layer visibility exceeds remote visibility, gated by `--unsafe-push-public`.
- `cli/core/card-lock.ts` bumped to lockfile v4 with `type`, `persona`, `beliefs`, `memory` fields per entry; v3 reads with auto-fill defaults.
- `cli/core/sync.ts` calls a new `syncMind` (in a new file `cli/core/mind-generator/sync-mind.ts`) that writes the deterministic mind materialization to `./.agents/drwn/generated/mind/`, enforces one-mind-per-project, and produces a `mind.json` consumer index.
- `cli/core/store-paths.ts` exposes `resolveGeneratedMindDir`.
- `drwn card show` surfaces mind sections in both text and JSON output.
- `drwn card diff` / publish guardrails classify mind manifest changes instead of treating persona/belief/memory changes as patch-only.
- Tests: matching coverage to the hook rollout — manifest unit tests, lockfile round-trip, source-mutation, publish integration, sync-mind unit + smoke.

Out of this task (defer to follow-on):
- Git LFS in card store.
- CCH-side `mountPreExecAssets` reference implementation (lives in the CCH repo).
- Migration of the existing four Mindblown minds.
- `drwn card source import-refinery` (refinery → mind-card converter).
- Mind-card-aware catalog policies.

## Success Criteria

- [ ] `drwn card new --type=mind @scope/name` scaffolds a valid mind-card source with `card.json: { "type": "mind", ... }`.
- [ ] `drwn card source add-persona @scope/name <entry> --from <staging>` adds persona entries; matching commands work for beliefs and memory (with `--layer l4|l5|l6 --visibility ...`).
- [ ] `drwn card source doctor` greens on a hand-built mind card; reds on missing visibility, missing files, invalid JSONL, or mind fields on a harness card.
- [ ] `drwn card publish` refuses incomplete mind-card sources with missing `PERSONA.md`, `BELIEF.md`, missing memory directories, empty memory directories, or invalid JSONL when a layer declares `format: "jsonl"`.
- [ ] `drwn card push` for a mind card refuses pushing to a network remote unless the user supplies `--remote-visibility` or `--unsafe-push-public`; refuses `--remote-visibility=public` when any layer is private/internal unless overridden.
- [ ] `drwn install` + `drwn write` in a fresh project materializes a fixture mind card to `./.agents/drwn/generated/mind/` with correct structure and a parseable `mind.json`.
- [ ] All Phase-0 through Phase-4 tests pass via `bun test`.
- [ ] Lockfile v3 files continue to read after this lands (backward read compatibility).
- [ ] `@remyjkim/l6-mind-card` (existing harness card from task 45) continues to publish and write unchanged.

---

## Phase 0 — Schema + manifest validation

**Goal**: Add the `type` discriminator and mind-only manifest sections, with validation that rejects mind fields on harness cards and validates mind-card shape end-to-end. No CLI changes yet; no behavior change for existing harness cards.

### Files modified

- `cli/core/card-manifest.ts`
- `test/core-card-manifest.test.ts`

### Type additions to `cli/core/card-manifest.ts`

Add at the top (alongside existing types), before `CardManifest`:

```ts
export type CardType = "harness" | "mind";
export type Visibility = "private" | "internal" | "public";

export interface PersonaManifest {
  include?: string[];
  visibility?: Visibility;   // defaults to "internal" at materialization
}

export interface BeliefsManifest {
  include?: string[];
  visibility?: Visibility;   // defaults to "internal" at materialization
}

export interface MemoryLayerManifest {
  include?: string[];
  visibility?: Visibility;   // REQUIRED if include is non-empty
  format?: "md" | "jsonl" | "mixed";  // defaults to "md"
}

export interface MemoryManifest {
  l4?: MemoryLayerManifest;
  l5?: MemoryLayerManifest;
  l6?: MemoryLayerManifest;
}
```

Extend `CardManifest` (currently `card-manifest.ts:7-23`):

```ts
export interface CardManifest {
  $schema?: string;
  type?: CardType;          // NEW. Defaults to "harness" at validation time.
  name: string;
  version: string;
  // ... existing fields unchanged ...
  stability?: "experimental" | "stable" | "production";
  lastValidatedWith?: string;
  testStatusBadge?: string;

  // Mind-only — REJECTED on harness cards by validation
  persona?: PersonaManifest;
  beliefs?: BeliefsManifest;
  memory?: MemoryManifest;
}
```

### Validation rules (in `validateCardManifest`)

The existing pattern at `card-manifest.ts:99-104` (`hooks.exclude` / `hooks.shared` rejection) and `card-manifest.ts:71-75` (stability enum) is the template. Add the following checks **inside `validateCardManifest`**, after the existing checks and before the `return { ok: errors.length === 0, errors }` line:

```ts
// type discriminator
const type: CardType = manifest.type ?? "harness";
if (manifest.type !== undefined && manifest.type !== "harness" && manifest.type !== "mind") {
  errors.push(`type must be \"harness\" or \"mind\" (got ${JSON.stringify(manifest.type)})`);
}

const hasMindFields = manifest.persona !== undefined
  || manifest.beliefs !== undefined
  || manifest.memory !== undefined;

if (type === "harness" && hasMindFields) {
  if (manifest.persona !== undefined) errors.push("persona is only allowed on mind cards (type: \"mind\")");
  if (manifest.beliefs !== undefined) errors.push("beliefs is only allowed on mind cards (type: \"mind\")");
  if (manifest.memory !== undefined)  errors.push("memory is only allowed on mind cards (type: \"mind\")");
}

if (type === "mind") {
  validateIncludeArray(manifest.persona?.include, "persona.include", errors);
  validateVisibility(manifest.persona?.visibility, "persona.visibility", errors);

  validateIncludeArray(manifest.beliefs?.include, "beliefs.include", errors);
  validateVisibility(manifest.beliefs?.visibility, "beliefs.visibility", errors);

  for (const layer of ["l4", "l5", "l6"] as const) {
    const layerManifest = manifest.memory?.[layer];
    if (layerManifest === undefined) continue;
    validateIncludeArray(layerManifest.include, `memory.${layer}.include`, errors);
    const nonEmpty = (layerManifest.include?.length ?? 0) > 0;
    if (nonEmpty && layerManifest.visibility === undefined) {
      errors.push(`memory.${layer}.visibility is required when memory.${layer}.include is non-empty`);
    }
    validateVisibility(layerManifest.visibility, `memory.${layer}.visibility`, errors);
    if (layerManifest.format !== undefined && !["md", "jsonl", "mixed"].includes(layerManifest.format)) {
      errors.push(`memory.${layer}.format must be md, jsonl, or mixed`);
    }
  }
}
```

Add these helpers to `card-manifest.ts` (private, before `validateCardManifest`):

```ts
function validateIncludeArray(input: unknown, path: string, errors: string[]) {
  if (input === undefined) return;
  if (!Array.isArray(input) || !input.every((entry) => typeof entry === "string" && isSafeEntryName(entry))) {
    errors.push(`${path} must be an array of safe entry names (no slashes, dots, or path traversal)`);
  }
}

function validateVisibility(input: unknown, path: string, errors: string[]) {
  if (input === undefined) return;
  if (input !== "private" && input !== "internal" && input !== "public") {
    errors.push(`${path} must be private, internal, or public`);
  }
}

function isSafeEntryName(name: string): boolean {
  return typeof name === "string"
    && name.length > 0
    && !name.includes("/")
    && !name.includes("\\")
    && !name.includes("..")
    && !name.startsWith(".");
}
```

### Tests to add (`test/core-card-manifest.test.ts`)

Mirror the existing test pattern at `core-card-manifest.test.ts:24-28` and `:83-96`. Add:

```ts
test("validateCardManifest defaults type to harness when absent", () => {
  const r = validateCardManifest({ name: "@me/a", version: "1.0.0" });
  expect(r.ok).toBe(true);
});

test("validateCardManifest accepts explicit type: harness", () => {
  const r = validateCardManifest({ name: "@me/a", version: "1.0.0", type: "harness" });
  expect(r.ok).toBe(true);
});

test("validateCardManifest accepts type: mind", () => {
  const r = validateCardManifest({ name: "@me/a", version: "1.0.0", type: "mind" });
  expect(r.ok).toBe(true);
});

test("validateCardManifest rejects unknown type", () => {
  const r = validateCardManifest({ name: "@me/a", version: "1.0.0", type: "agent" });
  expect(r.ok).toBe(false);
  expect(r.errors.some(e => e.includes("type must be"))).toBe(true);
});

test("validateCardManifest rejects persona on harness card", () => {
  const r = validateCardManifest({ name: "@me/a", version: "1.0.0", persona: { include: ["voice"] } });
  expect(r.ok).toBe(false);
  expect(r.errors).toContain("persona is only allowed on mind cards (type: \"mind\")");
});

test("validateCardManifest rejects beliefs on harness card", () => {
  const r = validateCardManifest({ name: "@me/a", version: "1.0.0", beliefs: { include: ["b1"] } });
  expect(r.ok).toBe(false);
  expect(r.errors).toContain("beliefs is only allowed on mind cards (type: \"mind\")");
});

test("validateCardManifest rejects memory on harness card", () => {
  const r = validateCardManifest({
    name: "@me/a", version: "1.0.0",
    memory: { l4: { include: ["r1"], visibility: "internal" } },
  });
  expect(r.ok).toBe(false);
  expect(r.errors).toContain("memory is only allowed on mind cards (type: \"mind\")");
});

test("validateCardManifest requires memory layer visibility when include is non-empty", () => {
  const r = validateCardManifest({
    name: "@me/a", version: "1.0.0", type: "mind",
    memory: { l6: { include: ["transcripts"] } },
  });
  expect(r.ok).toBe(false);
  expect(r.errors).toContain("memory.l6.visibility is required when memory.l6.include is non-empty");
});

test("validateCardManifest accepts empty memory layer without visibility", () => {
  const r = validateCardManifest({
    name: "@me/a", version: "1.0.0", type: "mind",
    memory: { l6: {} },
  });
  expect(r.ok).toBe(true);
});

test("validateCardManifest rejects invalid visibility", () => {
  const r = validateCardManifest({
    name: "@me/a", version: "1.0.0", type: "mind",
    memory: { l5: { include: ["x"], visibility: "kinda-private" } },
  });
  expect(r.ok).toBe(false);
  expect(r.errors.some(e => e.includes("visibility must be"))).toBe(true);
});

test("validateCardManifest rejects unsafe entry names in include arrays", () => {
  const r = validateCardManifest({
    name: "@me/a", version: "1.0.0", type: "mind",
    persona: { include: ["../escape"] },
  });
  expect(r.ok).toBe(false);
  expect(r.errors.some(e => e.includes("persona.include"))).toBe(true);
});

test("validateCardManifest accepts full mind card", () => {
  const r = validateCardManifest({
    name: "@mindblown/dalio", version: "1.0.0", type: "mind",
    persona: { include: ["voice", "values"], visibility: "internal" },
    beliefs: { include: ["radical-transparency"], visibility: "internal" },
    memory: {
      l4: { include: ["reflections"], visibility: "internal" },
      l5: { include: ["observations"], visibility: "internal" },
      l6: { include: ["transcripts"], visibility: "private", format: "jsonl" },
    },
  });
  expect(r.ok).toBe(true);
});
```

### Acceptance for Phase 0

- [ ] `bun test test/core-card-manifest.test.ts` passes with all new tests.
- [ ] All existing manifest tests continue to pass.
- [ ] No CLI, source, store, lockfile, or materialization behavior changes yet.

---

## Phase 1 — Source layout + doctor + add commands

**Goal**: Add the source-side authoring surface for mind cards. Doctor walks the new directories; CLI commands let an author add/remove persona/belief/memory entries.

### Files modified

- `cli/core/card-source.ts` — add walkers, mutators, and doctor extensions.
- `cli/core/card-store.ts` — extend `createCardSource` to accept `type?: CardType` and add published mind-content validation shared by publish/resolve/validate paths.
- `cli/core/store-paths.ts` — add `resolveGeneratedMindDir`.
- `cli/commands/card/new.ts` — add `--type=harness|mind` and pass it through to `createCardSource`.
- `test/core-card-source.test.ts` — extend existing tests.
- `test/core-card-store-mind.test.ts` — publish/resolve validation tests for mind source content.

### Files added

- `cli/commands/card/source/add-persona.ts`
- `cli/commands/card/source/remove-persona.ts`
- `cli/commands/card/source/add-belief.ts`
- `cli/commands/card/source/remove-belief.ts`
- `cli/commands/card/source/add-memory.ts`
- `cli/commands/card/source/remove-memory.ts`
- `test/commands-card-source-mind-mutate.test.ts` — new test file for mind mutation commands.

Important current-repo correction: source creation is `drwn card new` in `cli/commands/card/new.ts`; there is no `drwn card source new` / `cli/commands/card/source/new.ts` command today. Phase 1 extends the existing `card new` command. If a later product decision wants a `card source new` alias, add it separately after the existing surface works.

### `addCardSourcePersona` in `card-source.ts`

Mirror `addCardSourceHook` (`card-source.ts:515-550`) exactly:

```ts
export interface CardSourcePersonaMutationResult {
  card: string;
  persona: string;
  dryRun: boolean;
  changes: CardSourceMutationChange[];
}

export async function addCardSourcePersona(options: {
  agentsDir: string;
  cardName: string;
  personaName: string;
  from?: string;
  dryRun?: boolean;
}): Promise<CardSourcePersonaMutationResult> {
  assertSafePathPart(options.personaName, "persona name");
  const dryRun = options.dryRun === true;
  const { state, manifest } = await readSourceManifestForMutation(options.agentsDir, options.cardName);
  assertMindCard(manifest, options.cardName);

  const destination = join(state.sourceDir, "persona", options.personaName);
  const personaMd = join(destination, "PERSONA.md");
  const include = [...(manifest.persona?.include ?? [])];
  if (include.includes(options.personaName) || existsSync(destination)) {
    throw new Error(`Persona already exists in card source: ${options.personaName}`);
  }

  const nextManifest: CardManifest = {
    ...manifest,
    persona: {
      ...(manifest.persona ?? {}),
      include: [...include, options.personaName],
    },
  };
  const changes: CardSourceMutationChange[] = [
    { action: "add-persona", path: personaMd },
    { action: "update-manifest", path: state.manifestPath },
  ];

  if (!dryRun) {
    assertStoreWritable();
    if (options.from) {
      await copyMindMarkdownEntry(options.from, destination, "PERSONA.md");
    } else {
      await writeAtomically(personaMd, personaTemplate(options.personaName));
    }
    await writeCardSourceManifest(state.manifestPath, nextManifest);
  }

  return { card: options.cardName, persona: options.personaName, dryRun, changes };
}
```

Where `assertMindCard` is a new helper near the top of `card-source.ts`:

```ts
function assertMindCard(manifest: CardManifest, cardName: string) {
  if ((manifest.type ?? "harness") !== "mind") {
    throw new Error(
      `Card ${cardName} is not a mind card. Run \`drwn card new --type=mind ${cardName}\` to create a mind card, or change card.json type to "mind".`,
    );
  }
}
```

And `personaTemplate` near the bottom of `card-source.ts` (mirrors `hookPolicyTemplate`):

```ts
function personaTemplate(name: string): string {
  return `# Persona: ${name}\n\nDescribe this fragment of the mind's voice / values / identity.\n`;
}
```

`removeCardSourcePersona` mirrors `removeCardSourceHook` (`card-source.ts:552-589`) with the analogous changes.

### `addCardSourceBelief` and `removeCardSourceBelief`

Mirror persona exactly. Substitute `belief` for `persona`, write `BELIEF.md` instead of `PERSONA.md`, target the `manifest.beliefs.include` array, and use `copyMindMarkdownEntry(options.from, destination, "BELIEF.md")` for `--from`. The visibility default is "internal" (no per-entry visibility for v1; section-level only).

Add a small shared helper in `card-source.ts` so `--from` produces deterministic layouts:

```ts
async function copyMindMarkdownEntry(from: string, destination: string, requiredFile: "PERSONA.md" | "BELIEF.md") {
  const source = resolve(from);
  const stats = await stat(source);
  if (stats.isFile()) {
    await mkdir(destination, { recursive: true });
    await cp(source, join(destination, requiredFile), { verbatimSymlinks: false });
    return;
  }
  if (!existsSync(join(source, requiredFile))) {
    throw new Error(`Mind entry source directory is missing ${requiredFile}: ${source}`);
  }
  await cp(source, destination, { recursive: true, verbatimSymlinks: false });
}
```

Import `stat` from `node:fs/promises` alongside the existing `cp`, `readdir`, `readFile`, and `rm` imports.

### `addCardSourceMemory` and `removeCardSourceMemory`

Memory has the additional `--layer l4|l5|l6 --visibility ... --format md|jsonl|mixed` dimension.

```ts
export interface CardSourceMemoryMutationResult {
  card: string;
  memory: string;
  layer: "l4" | "l5" | "l6";
  dryRun: boolean;
  changes: CardSourceMutationChange[];
}

export async function addCardSourceMemory(options: {
  agentsDir: string;
  cardName: string;
  memoryName: string;
  layer: "l4" | "l5" | "l6";
  visibility: Visibility;
  format?: "md" | "jsonl" | "mixed";
  from?: string;
  dryRun?: boolean;
}): Promise<CardSourceMemoryMutationResult> {
  assertSafePathPart(options.memoryName, "memory entry name");
  const dryRun = options.dryRun === true;
  const { state, manifest } = await readSourceManifestForMutation(options.agentsDir, options.cardName);
  assertMindCard(manifest, options.cardName);

  const destination = join(state.sourceDir, "memory", options.layer, options.memoryName);
  const existingLayer = manifest.memory?.[options.layer] ?? {};
  const include = [...(existingLayer.include ?? [])];
  if (include.includes(options.memoryName) || existsSync(destination)) {
    throw new Error(`Memory entry already exists: ${options.layer}/${options.memoryName}`);
  }

  const nextLayer: MemoryLayerManifest = {
    ...existingLayer,
    include: [...include, options.memoryName],
    visibility: options.visibility,            // explicit always; required by validation when non-empty
    ...(options.format ? { format: options.format } : {}),
  };
  const nextManifest: CardManifest = {
    ...manifest,
    memory: { ...(manifest.memory ?? {}), [options.layer]: nextLayer },
  };
  const changes: CardSourceMutationChange[] = [
    { action: "add-memory", path: destination },
    { action: "update-manifest", path: state.manifestPath },
  ];

  if (!dryRun) {
    assertStoreWritable();
    if (options.from) {
      await cp(options.from, destination, { recursive: true, verbatimSymlinks: false });
    } else {
      await mkdir(destination, { recursive: true });
    }
    await writeCardSourceManifest(state.manifestPath, nextManifest);
  }

  return { card: options.cardName, memory: options.memoryName, layer: options.layer, dryRun, changes };
}
```

`removeCardSourceMemory` is analogous.

### Doctor extensions

Extend `readCardSourceState` (around `card-source.ts:381-478`) to walk persona/beliefs/memory directories and report. Add helpers near the existing `listBundledSkills` / `listBundledHooks` (`card-source.ts:262-300`):

```ts
function listBundledPersonas(sourceDir: string): string[] {
  return safeReaddirSync(join(sourceDir, "persona"))
    .filter((name) => lstatSafe(join(sourceDir, "persona", name))?.isDirectory());
}

function listBundledBeliefs(sourceDir: string): string[] {
  return safeReaddirSync(join(sourceDir, "beliefs"))
    .filter((name) => lstatSafe(join(sourceDir, "beliefs", name))?.isDirectory());
}

function listBundledMemoryEntries(sourceDir: string, layer: "l4" | "l5" | "l6"): string[] {
  return safeReaddirSync(join(sourceDir, "memory", layer))
    .filter((name) => lstatSafe(join(sourceDir, "memory", layer, name))?.isDirectory());
}
```

`safeReaddirSync` is a new local helper in `card-source.ts` because the current file uses async `readdir` but has no `safeReaddir` helper:

```ts
function safeReaddirSync(path: string): string[] {
  try {
    return readdirSync(path).filter((name) => !name.startsWith(".")).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
```

Import `lstatSafe` from `./fs`, and import `readdirSync` from `node:fs`.

In `readCardSourceState`, after the existing hook block, add (only when type is "mind"):

```ts
if ((manifest?.type ?? "harness") === "mind") {
  const personas = listBundledPersonas(sourceDir);
  const declaredPersonas = manifest?.persona?.include ?? [];
  for (const name of declaredPersonas) {
    const md = join(sourceDir, "persona", name, "PERSONA.md");
    if (!existsSync(md)) issues.push(issue("missing_persona_md", `Persona entry is missing PERSONA.md: ${name}`, md));
  }
  for (const name of personas) {
    if (!declaredPersonas.includes(name)) {
      issues.push(issue("orphaned_persona_dir", `Bundled persona is not declared in card.json persona.include: ${name}`, join(sourceDir, "persona", name)));
    }
  }

  const beliefs = listBundledBeliefs(sourceDir);
  const declaredBeliefs = manifest?.beliefs?.include ?? [];
  for (const name of declaredBeliefs) {
    const md = join(sourceDir, "beliefs", name, "BELIEF.md");
    if (!existsSync(md)) issues.push(issue("missing_belief_md", `Belief entry is missing BELIEF.md: ${name}`, md));
  }
  for (const name of beliefs) {
    if (!declaredBeliefs.includes(name)) {
      issues.push(issue("orphaned_belief_dir", `Bundled belief is not declared in card.json beliefs.include: ${name}`, join(sourceDir, "beliefs", name)));
    }
  }

  for (const layer of ["l4", "l5", "l6"] as const) {
    const entries = listBundledMemoryEntries(sourceDir, layer);
    const declared = manifest?.memory?.[layer]?.include ?? [];
    for (const name of declared) {
      const dir = join(sourceDir, "memory", layer, name);
      if (!existsSync(dir)) {
        issues.push(issue("missing_memory_dir", `card.json memory.${layer}.include references a missing memory directory: ${name}`, dir));
        continue;
      }
      const files = safeReaddirSync(dir);
      if (files.length === 0) {
        issues.push(issue("empty_memory_dir", `Memory entry directory is empty: ${layer}/${name}`, dir));
      }
      if (manifest.memory?.[layer]?.format === "jsonl") {
        await validateJsonlMemoryEntry(dir, `memory.${layer}.${name}`, issues);
      }
    }
    for (const name of entries) {
      if (!declared.includes(name)) {
        issues.push(issue("orphaned_memory_dir", `Bundled memory entry is not declared in card.json memory.${layer}.include: ${name}`, join(sourceDir, "memory", layer, name)));
      }
    }
  }
}
```

The current `CardSourceIssue` shape is `{ code, severity, message, path? }`; use the existing `issue(...)` helper and the snake_case `code` values shown above. Do not introduce a parallel `{ kind, card, ... }` issue shape.

Add `validateJsonlMemoryEntry` for `format: "jsonl"` layers:

```ts
async function validateJsonlMemoryEntry(dir: string, label: string, issues: CardSourceIssue[]) {
  for (const file of safeReaddirSync(dir)) {
    if (!file.endsWith(".jsonl")) continue;
    const path = join(dir, file);
    const text = await readFile(path, "utf8");
    text.split(/\r?\n/).forEach((line, index) => {
      if (line.trim() === "") return;
      try {
        JSON.parse(line);
      } catch {
        issues.push(issue("invalid_memory_jsonl", `${label}/${file}:${index + 1} is not valid JSONL`, path));
      }
    });
  }
}
```

Extend the `CardSourceState` shape (currently `card-source.ts:32-65` or similar) with new fields:

```ts
export interface CardSourceState {
  // ... existing fields ...
  personas: string[];          // bundled persona directory names
  beliefs: string[];           // bundled belief directory names
  memoryEntries: { l4: string[]; l5: string[]; l6: string[] };
}
```

Populate these fields in `readCardSourceState`. They surface in `drwn card source doctor --json` and `drwn card source show --json`. Published-card `drwn card show --json` is handled separately in Phase 4.

### Update `cli/commands/card/new.ts` and `createCardSource`

Add a `--type=harness|mind` option to `cli/commands/card/new.ts` (default `harness`). Validate the enum before calling core logic. Pass the value to `createCardSource`.

Extend `createCardSource` in `cli/core/card-store.ts`:

```ts
export async function createCardSource(options: {
  agentsDir: string;
  name: string;
  scope?: string;
  noGit?: boolean;
  type?: CardType;
}) {
  // ...
  const type = options.type ?? "harness";
  if (type !== "harness" && type !== "mind") throw new Error(`Invalid card type: ${type}`);
  // ...
  const manifest: CardManifest = {
    name: fullName,
    version: "1.0.0",
    description: "",
    ...(type === "mind" ? { type } : {}),
  };
  // ...
}
```

When `type === "mind"`:
- Scaffolded `card.json` includes `"type": "mind"`.
- Empty `persona/`, `beliefs/`, `memory/{l4,l5,l6}/` directories are created with `.gitkeep` files so the layout is committed even before any entries are added.
- No `.gitattributes` (LFS deferred).

`--from-project` remains harness-only in v1. If `--from-project --type=mind` is supplied, fail clearly with `--from-project does not support --type=mind yet`.

### Published mind-content validation

Add a shared validator in `cli/core/card-store.ts` near `validatePublishedSkillDirs` / `validatePublishedHookDirs`:

```ts
function validatePublishedMindDirs(versionDir: string, manifest: CardManifest) {
  if ((manifest.type ?? "harness") !== "mind") return;
  for (const name of manifest.persona?.include ?? []) {
    const path = join(versionDir, "persona", name, "PERSONA.md");
    if (!existsSync(path)) throw new Error(`Card ${manifest.name}@${manifest.version} is missing PERSONA.md for persona '${name}'. Expected: ${path}`);
  }
  for (const name of manifest.beliefs?.include ?? []) {
    const path = join(versionDir, "beliefs", name, "BELIEF.md");
    if (!existsSync(path)) throw new Error(`Card ${manifest.name}@${manifest.version} is missing BELIEF.md for belief '${name}'. Expected: ${path}`);
  }
  for (const layer of ["l4", "l5", "l6"] as const) {
    const layerManifest = manifest.memory?.[layer];
    for (const name of layerManifest?.include ?? []) {
      const dir = join(versionDir, "memory", layer, name);
      if (!existsSync(dir)) throw new Error(`Card ${manifest.name}@${manifest.version} is missing memory directory '${layer}/${name}'. Expected: ${dir}`);
      const files = readdirSync(dir).filter((entry) => !entry.startsWith("."));
      if (files.length === 0) throw new Error(`Card ${manifest.name}@${manifest.version} has empty memory directory '${layer}/${name}'. Expected at least one file in ${dir}`);
      if (layerManifest?.format === "jsonl") validatePublishedJsonlMemory(dir, `${manifest.name}@${manifest.version} memory.${layer}.${name}`);
    }
  }
}
```

Call this validator:
- in `publishCard` before `writeTreeFromDir`, validating the mutable source tree;
- after extraction in `publishCard`, next to `validatePublishedSkillDirs(versionDir, manifest)` and `validatePublishedHookDirs(versionDir, manifest)`;
- in `resolveRepoVersion`, next to existing skill/hook validation;
- in file-card resolution (`resolveFileCard`) next to existing skill/hook validation.

Add `validatePublishedJsonlMemory` using the same line-by-line parser as source doctor. This ensures `doctor` is helpful but `publish` / `resolve` are the real integrity boundary.

### CLI handler files

All six new command files mirror `cli/commands/card/source/add-hook.ts` / `add-skill.ts` exactly. Example for `add-persona.ts`:

```ts
import { Option } from "clipanion";
import { addCardSourcePersona } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class CardSourceAddPersonaCommand extends BaseCommand {
  static override paths = [["card", "source", "add-persona"]];

  cardName = Option.String({ required: true });
  personaName = Option.String({ required: true });
  from = Option.String("--from", { description: "Source directory or file to copy as the persona entry" });
  dryRun = Option.Boolean("--dry-run", false, { description: "Show what would be added without writing" });
  json = Option.Boolean("--json", false, { description: "Emit JSON output" });

  async execute() {
    let result;
    try {
      result = await addCardSourcePersona({
        agentsDir: this.context.agentsDir,
        cardName: this.cardName,
        personaName: this.personaName,
        from: this.from,
        dryRun: this.dryRun,
      });
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    if (this.json) {
      this.context.stdout.write(renderJson(result));
      return 0;
    }
    this.context.stdout.write(`${this.dryRun ? "Would add" : "Added"} persona ${this.personaName} to ${this.cardName}\n`);
    return 0;
  }
}
```

`add-belief.ts` is the same with `belief` substitutions.

`add-memory.ts` includes the layer/visibility/format options:

```ts
layer = Option.String("--layer", { required: true });            // validated to l4|l5|l6 in execute
visibility = Option.String("--visibility", { required: true });  // validated to enum in execute
format = Option.String("--format");                              // optional, default md
```

Validate the enums in `execute()` before calling the core function; print a clear stderr message and return 1 if invalid.

### Register commands in `cli/index.ts`

Add six lines alongside the existing `cli.register(CardSourceAddHookCommand)` calls (around `cli/index.ts:107-204`):

```ts
cli.register(CardSourceAddPersonaCommand);
cli.register(CardSourceRemovePersonaCommand);
cli.register(CardSourceAddBeliefCommand);
cli.register(CardSourceRemoveBeliefCommand);
cli.register(CardSourceAddMemoryCommand);
cli.register(CardSourceRemoveMemoryCommand);
```

### Add `resolveGeneratedMindDir` to `cli/core/store-paths.ts`

Right after `resolveGeneratedHooksDir`:

```ts
export function resolveGeneratedMindDir(generatedDir: string): string {
  return join(generatedDir, "mind");
}
```

### Tests to add

**`test/commands-card-source-mind-mutate.test.ts`** — new file modeled on `test/commands-card-source-hook-mutate.test.ts`:

- `addCardSourcePersona` adds an entry to a fresh mind card source; manifest updated; PERSONA.md exists.
- `addCardSourcePersona` refuses on a harness card with clear error.
- `addCardSourcePersona` refuses duplicate add.
- `removeCardSourcePersona` removes both manifest entry and files; doesn't error if `--keep-files` is later added.
- Same coverage for beliefs and memory.
- `addCardSourceMemory` validates layer enum (l4/l5/l6), visibility enum, and format enum.
- `addCardSourceMemory` records visibility in the manifest layer.

Extend **`test/core-card-source.test.ts`** with:
- `readCardSourceState` for a mind card surfaces `personas`, `beliefs`, `memoryEntries`.
- Doctor flags `missing_persona_md`, `orphaned_persona_dir`, `missing_memory_dir`, `empty_memory_dir`, `orphaned_memory_dir`, and `invalid_memory_jsonl`.

Add **`test/core-card-store-mind.test.ts`**:
- `publishCard` rejects a declared persona without `PERSONA.md`.
- `publishCard` rejects a declared belief without `BELIEF.md`.
- `publishCard` rejects declared empty memory directories.
- `publishCard` rejects invalid JSONL when a layer declares `format: "jsonl"`.
- `publishCard` accepts a complete mind card and `resolveCard` can resolve it.

### Acceptance for Phase 1

- [ ] `drwn card new --type=mind @test/mind` scaffolds correctly; manifest has `type: "mind"`; empty persona/beliefs/memory dirs present with .gitkeep.
- [ ] All six new CLI commands execute; `--json` produces the result object; `--dry-run` writes nothing.
- [ ] `drwn card source doctor @test/mind` greens after entries added; reds with clear error if memory visibility is missing or JSONL is invalid.
- [ ] `drwn card publish @test/mind` refuses incomplete mind content even if doctor was not run first.
- [ ] `drwn card source add-persona @existing-harness/card x` refuses with "Card ... is not a mind card" error.
- [ ] All Phase-1 tests pass via `bun test`.

---

## Phase 2 — Push visibility gate

**Architecture note (investigated 2026-06-19)**: drwn's card lifecycle is three local-only-until-push stages. `drwn card publish` (`card-store.ts:664`) writes the source tree into the card's **local bare repo** under `~/.agents/drwn/cards/` and tags the version — zero network, no remote read or required. `drwn card remote add/set` (`remote.ts:42`) configures git `origin` and mirrors the URL to `drwn.originUrl`. `drwn card push` (`push.ts:29`) runs `git push <remote> refs/heads/main --tags` — **the only point where card content leaves the machine**. The visibility gate therefore belongs at **push**, not publish. Gating publish would restrict a purely local operation and force authors to configure a remote before they can publish locally, inverting the natural `publish → iterate → remote add → push` flow.

**Goal**: At push time, for `type: "mind"` cards, read the card manifest from the bare repo, classify the chosen target remote, compute the strictest visibility across the declared layers, and refuse if the remote is more permissive than required unless `--unsafe-push-public` is passed. Local filesystem remotes classify as `private`; network remotes classify as `unknown` unless the user supplies `--remote-visibility=private|internal|public`. `publishCard` remains local-only and has no remote gate. Harness-card push is unaffected.

### Files modified

- `cli/commands/card/push.ts` — add the visibility gate, `--remote-visibility`, and `--unsafe-push-public` flags.

### Files added

- `cli/core/visibility.ts` — visibility ordering, remote-URL classification, and pure gate evaluation (unit-testable).
- `test/core-visibility.test.ts` — unit tests for the gate.
- `test/core-card-push-mind.test.ts` — integration test for push refusal/success against a real local bare remote.

### Available primitives (verified)

All git helpers the gate needs already exist:
- `git.showBlob(barePath, "refs/heads/main:card.json")` (`git.ts:407`) — read the manifest from the bare repo without extracting.
- `git.remoteList(barePath)` (`git.ts:268`) → `Record<name, url>` — classify the *specific* remote chosen by `--remote`.
- `git.listTags(barePath)` (`git.ts:339`) — push sends `--tags`; available if a future iteration wants the strictest visibility across all pushed versions.

### `cli/core/visibility.ts`

```ts
// ABOUTME: Visibility classification and publish-gate logic for mind cards.
// ABOUTME: Defines visibility ordering, remote URL classification, and gate enforcement.

import type { CardManifest, Visibility } from "./card-manifest";

const ORDER: Record<Visibility, number> = { public: 2, internal: 1, private: 0 };

export function strictest(...layers: Array<Visibility | undefined>): Visibility {
  const values = layers.filter((v): v is Visibility => v !== undefined);
  if (values.length === 0) return "internal";
  return values.reduce((acc, v) => (ORDER[v] < ORDER[acc] ? v : acc), "public" as Visibility);
}

export function visibilityAllows(remote: Visibility | "unknown", required: Visibility): boolean {
  if (remote === "unknown") return false;
  return ORDER[remote] <= ORDER[required];
}

export function classifyRemoteUrl(url: string | undefined): Visibility | "unknown" {
  if (!url) return "unknown";
  if (url.startsWith("file://") || url.startsWith("/")) return "private";
  // v1 does not call GitHub/GitLab APIs, and a URL alone cannot prove whether a
  // remote is private, internal, or public. Require --remote-visibility for all
  // network remotes so private/internal mind content cannot leak by assumption.
  return "unknown";
}

export function collectLayerVisibilities(manifest: CardManifest): Visibility[] {
  if ((manifest.type ?? "harness") !== "mind") return [];
  const v: Array<Visibility | undefined> = [];
  if ((manifest.persona?.include?.length ?? 0) > 0) v.push(manifest.persona?.visibility ?? "internal");
  if ((manifest.beliefs?.include?.length ?? 0) > 0) v.push(manifest.beliefs?.visibility ?? "internal");
  for (const layer of ["l4", "l5", "l6"] as const) {
    const layerManifest = manifest.memory?.[layer];
    if ((layerManifest?.include?.length ?? 0) > 0) {
      v.push(layerManifest!.visibility!);  // validation ensures defined
    }
  }
  return v.filter((x): x is Visibility => x !== undefined);
}

export interface PushGateInput {
  manifest: CardManifest;
  remoteUrl: string | undefined;
  remoteVisibility?: Visibility;
  unsafePushPublic: boolean;
}

export interface PushGateDecision {
  allowed: boolean;
  reason?: string;
  remoteVisibility: Visibility | "unknown";
  requiredVisibility: Visibility | null;
}

export function evaluatePushGate(input: PushGateInput): PushGateDecision {
  const layerVisibilities = collectLayerVisibilities(input.manifest);
  if (layerVisibilities.length === 0) {
    return { allowed: true, remoteVisibility: input.remoteVisibility ?? classifyRemoteUrl(input.remoteUrl), requiredVisibility: null };
  }
  const required = strictest(...layerVisibilities);
  const remoteVisibility = input.remoteVisibility ?? classifyRemoteUrl(input.remoteUrl);
  if (visibilityAllows(remoteVisibility, required)) {
    return { allowed: true, remoteVisibility, requiredVisibility: required };
  }
  if (input.unsafePushPublic) {
    return { allowed: true, remoteVisibility, requiredVisibility: required };
  }
  const reason = remoteVisibility === "unknown"
    ? `Cannot classify remote URL "${input.remoteUrl}"; refusing to push a mind card with ${required} content. Use --unsafe-push-public to override.`
    : `Remote visibility ${remoteVisibility} is more permissive than required ${required}. Use --unsafe-push-public to override.`;
  return { allowed: false, reason, remoteVisibility, requiredVisibility: required };
}
```

### Inject the gate in `cli/commands/card/push.ts`

The push command currently resolves the bare repo and calls `git.push`. Insert the gate between repo resolution and the push, active only for mind cards:

```ts
const barePath = resolveCardBareRepoPath(this.context.agentsDir, this.name);
if (!existsSync(barePath)) {
  throw new UsageError(`Card not found in local store: ${this.name}`);
}

// Mind-card push gate
const cardJson = await git.showBlob(barePath, "refs/heads/main:card.json").catch(() => null);
const manifest = cardJson ? (JSON.parse(cardJson) as CardManifest) : null;
if (manifest && (manifest.type ?? "harness") === "mind") {
  const remotes = await git.remoteList(barePath);
  const remoteUrl = remotes[this.remote];
  if (!remoteUrl) {
    throw new UsageError(
      `Remote "${this.remote}" is not configured for ${this.name}. Add one with \`drwn card remote add ${this.name} <url>\` first.`,
    );
  }
  const decision = evaluatePushGate({
    manifest,
    remoteUrl,
    remoteVisibility: this.remoteVisibility ? parseVisibility(this.remoteVisibility) : undefined,
    unsafePushPublic: this.unsafePushPublic,
  });
  if (!decision.allowed) {
    throw new UsageError(decision.reason!);
  }
  if (this.unsafePushPublic && decision.requiredVisibility !== null) {
    this.context.stderr.write(
      `Warning: --unsafe-push-public overrides the visibility gate. Pushing ${decision.requiredVisibility} mind content to ${decision.remoteVisibility} remote ${remoteUrl}.\n`,
    );
  }
}

await git.push(barePath, this.remote, ["refs/heads/main", "--tags"]);
```

Add the flag to `CardPushCommand`:

```ts
unsafePushPublic = Option.Boolean("--unsafe-push-public", false, {
  description: "Override the mind-card visibility gate (mind cards only). Pushes private/internal content to the configured remote regardless of remote visibility.",
});
```

Add `--remote-visibility` to `CardPushCommand`:

```ts
remoteVisibility = Option.String("--remote-visibility", {
  description: "Declare target remote visibility for mind-card push gates: private, internal, or public. Required for network remotes unless --unsafe-push-public is used.",
});
```

Validate it to the `Visibility` enum before calling `evaluatePushGate`; invalid values print a clear usage error. Pass it as `remoteVisibility` in the decision input. Do not infer GitHub/GitLab visibility from URL shape in v1.

Add a small command-local parser or export one from `visibility.ts`:

```ts
function parseVisibility(value: string): Visibility {
  if (value === "private" || value === "internal" || value === "public") return value;
  throw new UsageError(`--remote-visibility must be private, internal, or public (got ${JSON.stringify(value)})`);
}
```

Notes:
- The gate reads `card.json` from `refs/heads/main` — the current card definition. Push ships all tags, but visibility is a card-level property expected to be stable across versions; v1 gates on main. Walking every pushed tag's `card.json` and taking the strictest is a deferred refinement (see Open Questions).
- `publishCard` and `PublishCardOptions` are **not** modified in this phase for remote gating. Mind cards publish to the local store without remote checks; Phase 1 already added local content validation.
- Consent model: an explicit `--unsafe-push-public` flag *is* the consent. The existing push command has no interactive prompts and is meant to be scriptable; v1 keeps it flag-only and emits an audit warning to stderr on override rather than adding a `y/N` prompt.

### Tests

**`test/core-visibility.test.ts`**:
- `strictest(public, internal) === internal`
- `strictest(internal, private) === private`
- `strictest() === internal` (default)
- `visibilityAllows(private, private) === true`
- `visibilityAllows(public, internal) === false`
- `visibilityAllows(unknown, anything) === false`
- `classifyRemoteUrl("git@github.com:scope/repo.git") === "unknown"`
- `classifyRemoteUrl("file:///tmp/r.git") === "private"`
- `classifyRemoteUrl("https://github.com/x/y.git") === "unknown"`
- `classifyRemoteUrl(undefined) === "unknown"`
- `evaluatePushGate` on each layer/declared-remote combo (16 cases), unknown network remote refusal, and the unsafe override.

**`test/core-card-push-mind.test.ts`** (real git, no mocks — set up a local bare repo as the remote via a `file://` URL and `git.remoteAdd`):
- Mind card with the chosen remote unconfigured → throws "Remote ... is not configured".
- Mind card with file remote + private layers → pushes successfully (refs land in the bare remote).
- Mind card with network remote and no `--remote-visibility` → throws unknown-remote refusal; nothing pushed.
- Mind card with `--remote-visibility=internal` + internal layers → pushes successfully.
- Mind card with `--remote-visibility=public` + private layers → throws gate refusal; nothing pushed.
- Mind card with `--remote-visibility=public` + private layers + `--unsafe-push-public` → pushes; audit warning on stderr.
- Mind card with all-public layers + `--remote-visibility=public` → pushes.
- Harness card with any remote → pushes normally (gate skipped, existing behavior unchanged).

### Acceptance for Phase 2

- [ ] `drwn card publish` for a mind card behaves identically to a harness card (writes to local store, no gate, no remote required).
- [ ] `drwn card push` of a mind card to an unconfigured remote errors clearly.
- [ ] `drwn card push` of a mind card to a network remote without `--remote-visibility` refuses unless `--unsafe-push-public`.
- [ ] `drwn card push` of a mind card with a private/internal layer to a more-permissive remote refuses unless `--unsafe-push-public`.
- [ ] `--unsafe-push-public` pushes and prints an audit warning to stderr.
- [ ] Harness-card push behavior unchanged.
- [ ] Phase-2 tests pass.

---

## Phase 3 — Lockfile v4 bump

**Goal**: Persist mind metadata in `card.lock` so consumers don't need to re-read source manifests at write time and so the lockfile is the integrity boundary for "what's installed."

### Files modified

- `cli/core/card-lock.ts` — bump version, add fields, extend validator.
- `cli/core/card-project.ts` — populate the new fields in `resolveProjectCards` when building `CardLockEntry` objects.
- `test/core-card-lock.test.ts` — round-trip and v3-compat tests.
- `test/core-card-project-mind.test.ts` — verifies resolved project cards carry mind lock metadata.

### Changes to `card-lock.ts`

Bump `lockfileVersion` to 4 (line 60). Update the union: `lockfileVersion: 2 | 3 | 4`. Bump `HOOKS_MIN_DRWN_VERSION` constant rename to `MIND_MIN_DRWN_VERSION` with the version that ships mind support (TBD by release; placeholder `"0.4.0"`); keep `HOOKS_MIN_DRWN_VERSION` as an alias for backward compatibility in case anything else imports it.

Extend `CardLockEntry`:

```ts
export interface CardLockEntry {
  name: string;
  requested: string;
  version: string;
  path: string;
  integrity: string;
  manifest: CardManifest;
  skills: string[];
  hooks: string[];
  hookConsent?: { consentedAt: string; consentedRange: string };

  type: "harness" | "mind";                           // NEW (v4)

  // Mind-only — present iff type === "mind"
  persona?: string[];
  beliefs?: string[];
  memory?: {
    l4?: { entries: string[]; visibility: Visibility };
    l5?: { entries: string[]; visibility: Visibility };
    l6?: { entries: string[]; visibility: Visibility };
  };

  registry: null;
  origin: CardOrigin;
  git?: GitLockInfo;
}
```

Extend `validateCardLockEntry` (currently `card-lock.ts:80-120`):

```ts
function validateCardLockEntry(input: unknown, source: string, lockfileVersion: 2 | 3 | 4): CardLockEntry {
  // ... existing checks ...

  // v4: type discriminator. v2/v3 default to "harness".
  let type: "harness" | "mind" = "harness";
  if (lockfileVersion === 4) {
    if (input.type !== "harness" && input.type !== "mind") {
      throw new Error(`Invalid card lock entry ${source}: type must be \"harness\" or \"mind\"`);
    }
    type = input.type;
  } else if (input.type === "harness" || input.type === "mind") {
    type = input.type;  // tolerate presence in v3 lockfiles
  }

  // Mind-only fields
  let persona: string[] | undefined;
  let beliefs: string[] | undefined;
  let memory: CardLockEntry["memory"];
  if (type === "mind") {
    if (input.persona !== undefined) {
      if (!Array.isArray(input.persona) || !input.persona.every((p) => typeof p === "string")) {
        throw new Error(`Invalid card lock entry ${source}: persona must be string[]`);
      }
      persona = [...input.persona];
    }
    if (input.beliefs !== undefined) {
      if (!Array.isArray(input.beliefs) || !input.beliefs.every((b) => typeof b === "string")) {
        throw new Error(`Invalid card lock entry ${source}: beliefs must be string[]`);
      }
      beliefs = [...input.beliefs];
    }
    if (input.memory !== undefined) {
      memory = validateMemoryLockSection(input.memory, source);
    }
  }

  return {
    // ... existing fields ...
    type,
    ...(persona ? { persona } : {}),
    ...(beliefs ? { beliefs } : {}),
    ...(memory ? { memory } : {}),
  };
}

function validateMemoryLockSection(input: unknown, source: string): CardLockEntry["memory"] {
  if (!isObject(input)) throw new Error(`Invalid card lock entry ${source}: memory must be an object`);
  const out: CardLockEntry["memory"] = {};
  for (const layer of ["l4", "l5", "l6"] as const) {
    const layerInput = (input as Record<string, unknown>)[layer];
    if (layerInput === undefined) continue;
    if (!isObject(layerInput)) throw new Error(`Invalid card lock entry ${source}: memory.${layer} must be an object`);
    if (!Array.isArray(layerInput.entries) || !layerInput.entries.every((e) => typeof e === "string")) {
      throw new Error(`Invalid card lock entry ${source}: memory.${layer}.entries must be string[]`);
    }
    if (layerInput.visibility !== "private" && layerInput.visibility !== "internal" && layerInput.visibility !== "public") {
      throw new Error(`Invalid card lock entry ${source}: memory.${layer}.visibility must be private, internal, or public`);
    }
    out[layer] = { entries: [...layerInput.entries], visibility: layerInput.visibility };
  }
  return out;
}
```

Extend `writeCardLock` (currently `card-lock.ts:57-66`):

```ts
export async function writeCardLock(projectRoot: string, cards: CardLockEntry[]) {
  const path = cardLockPath(projectRoot);
  const lockfile = validateCardLockfile({
    lockfileVersion: 4,                                 // bumped
    store: { minDrwnVersion: MIND_MIN_DRWN_VERSION },   // bumped
    cards,
  });
  await writeAtomically(path, `${JSON.stringify(lockfile, null, 2)}\n`);
  return path;
}
```

Update `validateCardLockfile` (currently `card-lock.ts:68-78`) to accept `2 | 3 | 4`.

### Populate fields when writing lockfile entries

`CardLockEntry` objects are created in `resolveProjectCards` in `cli/core/card-project.ts` (current lines 34-55). Populate `type`, `persona`, `beliefs`, and `memory` there from the resolved manifest:

```ts
const entry: CardLockEntry = {
  // ... existing fields ...
  type: manifest.type ?? "harness",
  ...(manifest.type === "mind" ? {
    persona: manifest.persona?.include ? [...manifest.persona.include] : undefined,
    beliefs: manifest.beliefs?.include ? [...manifest.beliefs.include] : undefined,
    memory: collectMemoryLockSection(manifest),
  } : {}),
};
```

Where `collectMemoryLockSection` lives near `resolveProjectCards`:

```ts
function collectMemoryLockSection(manifest: CardManifest): CardLockEntry["memory"] | undefined {
  if (!manifest.memory) return undefined;
  const out: NonNullable<CardLockEntry["memory"]> = {};
  for (const layer of ["l4", "l5", "l6"] as const) {
    const m = manifest.memory[layer];
    if (!m || !m.include || m.include.length === 0) continue;
    out[layer] = { entries: [...m.include], visibility: m.visibility! };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
```

### Tests

Extend **`test/core-card-lock.test.ts`**:

- v3 lockfile reads back with `type: "harness"` auto-filled and no mind fields.
- v4 lockfile round-trips a mind entry with persona/beliefs/memory fields.
- v4 lockfile rejects entry with invalid `memory.l5.visibility`.
- v4 lockfile rejects entry with `type: "mind"` but malformed `persona`.
- `writeCardLock` always writes v4 going forward.

Add **`test/core-card-project-mind.test.ts`**:

- publishing and applying a complete mind card writes a v4 lock entry with `type: "mind"`;
- `persona`, `beliefs`, and `memory.l4/l5/l6.entries` preserve manifest order;
- harness cards resolved through the same path carry `type: "harness"` and no mind-only fields.

### Acceptance for Phase 3

- [ ] v2 and v3 lockfiles continue to read without errors.
- [ ] v4 lockfiles round-trip mind metadata correctly.
- [ ] `resolveProjectCards` and project card apply/update paths write mind metadata into lock entries.
- [ ] All Phase-3 tests pass.
- [ ] Existing card-project/card-store integration tests still pass (entries now carry `type: "harness"`).

---

## Phase 4 — Materialization to `./.agents/drwn/generated/mind/`

**Goal**: When a project's lockfile contains a `type: "mind"` card, `drwn write` materializes the deterministic mind tree with `mind.json`, persona concatenation, and symlinks for beliefs/memory.

### Files modified

- `cli/core/sync.ts` — call new `syncMind` after existing writers.
- `cli/core/store-paths.ts` — already added `resolveGeneratedMindDir` in Phase 1.
- `cli/core/hook-generator/sync-hooks.ts` and `cli/core/sync.ts` — consume shared managed-path/symlink helpers where practical instead of keeping duplicate private helpers.
- `cli/core/card-diff.ts` — classify mind manifest structural changes.
- `cli/commands/card/show.ts` — surface mind sections in text and JSON output.
- `cli/commands/card/validate.ts` — expose mind validation summary in JSON output.
- `test/core-card-diff.test.ts` — add mind diff classification tests.
- `test/commands-card-show-mind.test.ts` — text/JSON show coverage for mind cards.
- `test/commands-card-validate-mind.test.ts` — validate output and broken-card failure coverage.

### Files added

- `cli/core/sync-managed.ts` — shared managed path, generated content, and symlink helper functions used by hooks, mcp/cursor, and mind generation.
- `cli/core/mind-generator/sync-mind.ts` — the writer, modeled on `cli/core/hook-generator/sync-hooks.ts`.
- `cli/core/mind-generator/mind-index.ts` — produces the `mind.json` index.
- `test/core-mind-generator.test.ts` — unit tests for the writer.
- `test/core-sync-mind.test.ts` — integration of syncMind with a fixture lockfile.

### Shared sync helper extraction

Before writing `sync-mind.ts`, extract helper functions that are currently private:

- `ensureFileSymlink` from `cli/core/sync.ts`;
- `recordManagedContent` / relative managed-path conversion from `cli/core/hook-generator/sync-hooks.ts`;
- a new `ensureDirSymlink` variant for directory links;
- a small generated-content writer that records `managed-content` entries with `hashManagedContent`.

Put these in `cli/core/sync-managed.ts`, importing `backupExistingPath` from `managed-file`, `lstatSafe` / `realpathSafe` / `ensureParentDir` from `fs`, `hashManagedContent` from `write-record`, and `SyncResult` from `types`. Existing callers should keep behavior identical after the extraction.

### `cli/core/mind-generator/sync-mind.ts`

```ts
// ABOUTME: Materializes mind-card content into ./.agents/drwn/generated/mind/ for CCH consumers.
// ABOUTME: Enforces one-mind-per-project; concatenates persona; symlinks beliefs and memory layers.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { EffectiveState } from "../effective-state";
import type { CardLockEntry } from "../card-lock";
import type { SyncResult } from "../types";
import { assertStoreWritable, resolveGeneratedMindDir, resolveStoreGeneratedDir } from "../store-paths";
import { ensureDirSymlink, ensureFileSymlink, writeGeneratedManagedFile } from "../sync-managed";
import { buildMindIndex } from "./mind-index";

export async function syncMind(state: EffectiveState): Promise<SyncResult> {
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [] };
  const minds = state.lockedCards.filter((c) => c.type === "mind");
  if (minds.length === 0) return result;
  if (minds.length > 1) {
    throw new Error(
      `Multiple mind cards in lockfile (${minds.map((m) => m.name).join(", ")}); v1 supports exactly one mind card per project. Remove all but one.`,
    );
  }
  const mind = minds[0]!;
  if (!state.scopedOptions.dryRun) assertStoreWritable();

  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const mindDir = resolveGeneratedMindDir(generatedDir);

  // Persona: concatenated copy
  const personaPath = join(mindDir, "persona.md");
  const personaContent = await buildPersonaContent(mind);
  writeGeneratedManagedFile(personaPath, personaContent, state.scopeRoot, state.scopedOptions.dryRun, result);

  // Beliefs: symlinks into extracted tree
  for (const name of mind.beliefs ?? []) {
    const target = join(mind.path, "beliefs", name, "BELIEF.md");
    const link = join(mindDir, "beliefs", name, "BELIEF.md");
    await ensureFileSymlink(link, target, state.scopedOptions.dryRun, result);
  }

  // Memory layers: symlinks per entry
  for (const layer of ["l4", "l5", "l6"] as const) {
    const layerLock = mind.memory?.[layer];
    if (!layerLock) continue;
    for (const name of layerLock.entries) {
      const target = join(mind.path, "memory", layer, name);
      const link = join(mindDir, "memory", layer, name);
      await ensureDirSymlink(link, target, state.scopedOptions.dryRun, result);
    }
  }

  // mind.json index
  const indexPath = join(mindDir, "mind.json");
  const indexContent = JSON.stringify(buildMindIndex(mind), null, 2) + "\n";
  writeGeneratedManagedFile(indexPath, indexContent, state.scopeRoot, state.scopedOptions.dryRun, result);

  return result;
}

async function buildPersonaContent(mind: CardLockEntry): Promise<string> {
  if (!mind.persona || mind.persona.length === 0) return "";
  const parts: string[] = [];
  for (const name of mind.persona) {
    const personaMd = join(mind.path, "persona", name, "PERSONA.md");
    const body = existsSync(personaMd) ? await readFile(personaMd, "utf8") : "";
    parts.push(`<!-- persona:start name=\"${name}\" -->\n${body.trim()}\n<!-- persona:end name=\"${name}\" -->`);
  }
  return parts.join("\n\n") + "\n";
}
```

`writeGeneratedManagedFile` should compare content before writing and record a `managed-content` path exactly like hook composer output. It must not back up or overwrite user-owned files outside the write-record verification flow; the surrounding `verifyManagedPaths` / `cleanupRemovedManagedPaths` logic in `sync.ts` remains the ownership boundary.

### `cli/core/mind-generator/mind-index.ts`

```ts
// ABOUTME: Builds the mind.json consumer index from a locked mind card entry.

import type { CardLockEntry } from "../card-lock";

export interface MindIndex {
  schemaVersion: 1;
  card: { name: string; version: string; integrity: string };
  persona?: { path: string; entries: string[] };
  beliefs?: { path: string; entries: { name: string; path: string }[]; visibility: string };
  memory?: {
    l4?: { path: string; entries: string[]; visibility: string; format: string };
    l5?: { path: string; entries: string[]; visibility: string; format: string };
    l6?: { path: string; entries: string[]; visibility: string; format: string };
  };
  writtenAt: string;
}

export function buildMindIndex(mind: CardLockEntry, now: Date = new Date()): MindIndex {
  const index: MindIndex = {
    schemaVersion: 1,
    card: { name: mind.name, version: mind.version, integrity: mind.integrity },
    writtenAt: now.toISOString(),
  };
  if (mind.persona && mind.persona.length > 0) {
    index.persona = { path: "persona.md", entries: mind.persona };
  }
  if (mind.beliefs && mind.beliefs.length > 0) {
    index.beliefs = {
      path: "beliefs/",
      entries: mind.beliefs.map((name) => ({ name, path: `beliefs/${name}/BELIEF.md` })),
      visibility: mind.manifest.beliefs?.visibility ?? "internal",
    };
  }
  if (mind.memory) {
    index.memory = {};
    for (const layer of ["l4", "l5", "l6"] as const) {
      const layerLock = mind.memory[layer];
      if (!layerLock) continue;
      index.memory[layer] = {
        path: `memory/${layer}/`,
        entries: layerLock.entries,
        visibility: layerLock.visibility,
        format: mind.manifest.memory?.[layer]?.format ?? "md",
      };
    }
  }
  return index;
}
```

### Inject `syncMind` in `cli/core/sync.ts`

Find the orchestration sequence in `syncRepository` and add `syncMind` after `syncHooks`, using the same `result.changes` / `result.warnings` / `result.managedPaths` accumulation style as the existing blocks:

```ts
if (!state.normalized.mcpOnly && !state.normalized.skillsOnly) {
  const hooksResult = await syncHooks(state);
  result.changes.push(...hooksResult.changes);
  result.warnings.push(...hooksResult.warnings);
  result.managedPaths?.push(...(hooksResult.managedPaths ?? []));

  const mindResult = await syncMind(state);
  result.changes.push(...mindResult.changes);
  result.warnings.push(...mindResult.warnings);
  result.managedPaths?.push(...(mindResult.managedPaths ?? []));
}
```

The write-record (`write-record.json`) writer needs to track the new managed paths under `mindResult.managedPaths` so cleanup can remove them on subsequent writes.

### Show, diff, and validate surfaces

Add these small but important command-surface updates in Phase 4 because they depend on Phases 1-3:

- `cli/commands/card/show.ts`: include a `type` row. For mind cards, show persona entries, belief entries, and memory layer entries/visibility in text output. JSON output already includes `manifest`; add a `mind` summary derived from the resolved card manifest for stable machine consumption.
- `cli/core/card-diff.ts`: include `type`, `persona.include`, `persona.visibility`, `beliefs.include`, `beliefs.visibility`, `memory.<layer>.include`, `memory.<layer>.visibility`, and `memory.<layer>.format` in structural diffing. Removals remain `major`; additions remain `minor`; visibility tightening to a less permissive value is `major`, loosening is `minor`, and format changes are `major`.
- `cli/commands/card/validate.ts`: rely on `resolveCard` calling `validatePublishedMindDirs`; add an explicit mind summary to JSON payload so validate output confirms mind sections were checked.

Tests:
- extend `test/core-card-diff.test.ts` for mind additions/removals, type changes, visibility tightening/loosening, and format changes;
- extend `test/commands-card-affordances.test.ts` or add `test/commands-card-show-mind.test.ts` for text/JSON output;
- extend card validate tests so a published broken mind card fails through `resolveCard` and a complete card reports ok.

### Tests

**`test/core-mind-generator.test.ts`**:
- `buildPersonaContent` (exported for tests or covered through `syncMind`) concatenates entries in lockfile order with start/end markers.
- `buildMindIndex` produces correct schema for a simple mind.
- `buildMindIndex` omits empty layers.

**`test/core-sync-mind.test.ts`**:
- Fixture lockfile with one mind card → mind.json + persona.md + symlinks produced.
- Lockfile with no mind card → no-op, no mind directory created.
- Lockfile with two mind cards → throws with clear error.
- Dry-run mode → reports changes but writes nothing.
- Repeat write → idempotent (no spurious `write` change entries).

### Acceptance for Phase 4

- [ ] `drwn write --dry-run --json` for a project with a fixture mind card includes mind materialization plan.
- [ ] `drwn write` materializes `./.agents/drwn/generated/mind/` with correct structure: `mind.json`, `persona.md`, `beliefs/<name>/BELIEF.md` symlinks, `memory/l{4,5,6}/<name>/` symlinks.
- [ ] `mind.json` is parseable JSON with the schema documented in `mind-index.ts`.
- [ ] Adding a second mind card → write fails with a clear error naming both mind cards.
- [ ] Removing a mind card and re-running write → mind directory is cleaned up (managed-paths handling).
- [ ] `drwn card show` text and JSON output expose mind sections for a published mind card.
- [ ] `drwn card diff` classifies mind manifest additions/removals/visibility changes correctly.
- [ ] `drwn card validate --json` includes a mind summary for complete mind cards and fails for broken published/file mind cards.
- [ ] Existing harness-card materialization unaffected (skills/hooks/mcp continue to write).
- [ ] Phase-4 tests pass.

---

## Phase 5 — CCH consumer integration (DEFERRED, separate task)

This phase lives in `/Users/pureicis/dev/containerized-cli-harness`, NOT in drwn. Out of scope for this implementation plan.

Drwn-side contract (what we commit to in this task and what the CCH task can rely on):

- Path: `<projectRoot>/.agents/drwn/generated/mind/`
- Index: `mind.json` at that root, schema version 1, structure as in `cli/core/mind-generator/mind-index.ts:MindIndex`.
- All symlinks within the tree resolve into the drwn extracted store under the user's home — CCH's copy semantics must follow symlinks (matches existing skills behavior).
- The directory exists iff the project lockfile contains exactly one `type: "mind"` card.
- The directory and its contents are exclusively managed by drwn (recorded as `managedPaths` in `write-record.json`); CCH should treat them as read-only.

CCH-side work (separate task, in CCH repo):

- Subclass `ContainerCliBase` (or whichever specific runtime needs mind support — Mindblown and Mindcloud runtimes) and override `mountPreExecAssets`.
- Read `<projectRoot>/.agents/drwn/generated/mind/`; if absent, return without action.
- Upload the directory tree into the sandbox at `/mnt/mind/` via `sandbox.uploadDirectory`.
- Mindblown / Mindcloud runtime code reads `/mnt/mind/mind.json` at agent construction time.

Coordination: drwn ships the contract first (this task). The CCH task can land independently; until it does, a `type: "mind"` card materializes correctly on disk but is not picked up by the running agent.

## Phase 6 — Migrate the four existing Mindblown minds (DEFERRED, separate task)

Out of this task. Phase 6 requires Phases 0-5 to land first.

For reference, the conversion mapping per mind (Elon, Dalio, Harari, Taleb):
- `01_soul_values/` → `persona/<name>/PERSONA.md`
- `02_principles/` (tool-izable) → `skills/<name>/SKILL.md`; (reasoning-style) → folded into persona body
- `03_world_models/` → `beliefs/<name>/BELIEF.md`
- `04_reflections/` → `memory/l4/<name>/`
- `05_observations/` → `memory/l5/<name>/`
- `06_raw_data/` → `memory/l6/<name>/`

Migration tooling (`drwn card source import-refinery`) is itself deferred to v1.1; first-pass migration is manual using the CLI commands shipped in Phase 1.

---

## Testing Strategy

**Unit + integration**: each phase has its own test files (named above). Run via `bun test`. Default CI runs all of them.

**End-to-end smoke** (manual, post-Phase-4):
1. `drwn card new --type=mind @test/fixture-mind --no-git`
2. Add one persona, one belief, one L5 memory entry via CLI.
3. `drwn card source doctor @test/fixture-mind --json` → `ok: true`.
4. `drwn card publish @test/fixture-mind` (local store; no remote, no push gate). Optionally `drwn card remote add @test/fixture-mind file:///tmp/fixture-mind.git` then `drwn card push @test/fixture-mind` to exercise the private-file-remote gate. For a network remote, also pass `--remote-visibility=private|internal|public` or `--unsafe-push-public`.
5. In a fresh project: `drwn init && drwn card apply file:~/.agents/drwn/sources/@test/fixture-mind`.
6. `drwn write --dry-run --json` → plan includes mind materialization.
7. `drwn write` → verify `./.agents/drwn/generated/mind/mind.json` exists, parses, has expected entries.

**Live-runtime** (deferred to Phase 5/CCH task):
Out of scope for this task. Once CCH-side lands, a release-gate test should run a fixture project through CCH's runtime and verify `/mnt/mind/mind.json` appears in the sandbox.

**Lockfile compatibility**:
- v3 lockfile from an existing project → reads cleanly, treats card as `type: "harness"`.
- v4 lockfile in a project with no mind card → still reads cleanly (mind fields absent).
- `@remyjkim/l6-mind-card` (existing harness-card from task 45) → publishes and writes unchanged through this entire rollout.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Lockfile v3→v4 migration breaks existing projects | Low | High | v3 read-compatibility tests in Phase 3; manual verification on `@remyjkim/l6-mind-card`'s consumer projects before release. |
| Visibility-gate classification too conservative (refuses legitimate pushes) | Medium | Medium | `classifyRemoteUrl` treats network remotes as `unknown`; authors can pass `--remote-visibility` for normal pushes or `--unsafe-push-public` as an explicit override. |
| One-mind-per-project constraint surprises authors | Medium | Low | Clear error message naming both mind cards and suggesting removal; tracked as open issue for future composition design. |
| Symlinks-into-extracted-tree confuse CCH copy semantics | Low | Medium | Pattern is identical to existing skills; verify in Phase 4 integration test that the symlink tree is correctly produced. CCH-side test (Phase 5 task) covers the copy side. |
| `mind.json` schema churn forces consumer breakage | Medium | Medium | `schemaVersion: 1` field present from day 1; future schema bumps add a v2 surface, don't replace v1 silently. |
| `bun test` isolation: managed paths across tests collide | Low | Low | Test helpers (`createTempRoot`, `cleanupTempRoots`) already isolate state; reuse them. |

---

## Open Questions (non-blocking)

1. **Persona-with-frontmatter handling.** Should `PERSONA.md` have an optional frontmatter (e.g., `weight`, `position: "prefix" | "suffix"`) that influences concatenation order beyond `include[]` order? v1: no, simple `include[]`-order concat. Revisit if authoring demands surfaces.
2. **`drwn card show --json` shape for mind sections.** v1: include the resolved manifest plus a stable `mind` summary with persona, beliefs, and memory layer entries/visibility. Do not include generated `mind.json` from a project write because `card show` resolves published cards independent of a project.
3. **`drwn card remote add` warning on network URLs.** v1: optional warn-only copy can remind authors that network remotes need `--remote-visibility` during push. Do not block at remote-add time.
4. **Push-gate scope across versions.** The gate reads `card.json` from `refs/heads/main` (current definition), but `drwn card push` ships all tags. If a card ever changed layer visibility between versions, an older tag with stricter content could ride along under the laxer current gate. v1 accepts this (visibility is expected to be card-stable); a refinement is to walk every pushed tag's `card.json` and gate on the strictest. Deferred unless a real card needs per-version visibility.
5. **Flag naming.** Settled on `--unsafe-push-public` (gate now lives at push, not publish). "unsafe" is the load-bearing semantic and matches how Wave-1 hooks named consent overrides.

---

## File-by-file checklist

For the implementer, here's the explicit list of files this task creates or modifies:

**Modified:**
- `cli/core/card-manifest.ts` — Phase 0
- `cli/core/card-source.ts` — Phase 1
- `cli/core/card-store.ts` — Phase 1
- `cli/core/card-project.ts` — Phase 3
- `cli/core/card-lock.ts` — Phase 3
- `cli/core/card-diff.ts` — Phase 4
- `cli/core/sync.ts` — Phase 4
- `cli/core/hook-generator/sync-hooks.ts` — Phase 4 (shared helper extraction)
- `cli/core/store-paths.ts` — Phase 1
- `cli/commands/card/new.ts` — Phase 1
- `cli/commands/card/push.ts` — Phase 2
- `cli/commands/card/show.ts` — Phase 4
- `cli/commands/card/validate.ts` — Phase 4
- `cli/index.ts` — Phase 1 (six command registrations)
- `test/core-card-manifest.test.ts` — Phase 0
- `test/core-card-source.test.ts` — Phase 1
- `test/core-card-diff.test.ts` — Phase 4
- `test/core-card-lock.test.ts` — Phase 3

**Added:**
- `cli/core/visibility.ts` — Phase 2
- `cli/core/sync-managed.ts` — Phase 4
- `cli/core/mind-generator/sync-mind.ts` — Phase 4
- `cli/core/mind-generator/mind-index.ts` — Phase 4
- `cli/commands/card/source/add-persona.ts` — Phase 1
- `cli/commands/card/source/remove-persona.ts` — Phase 1
- `cli/commands/card/source/add-belief.ts` — Phase 1
- `cli/commands/card/source/remove-belief.ts` — Phase 1
- `cli/commands/card/source/add-memory.ts` — Phase 1
- `cli/commands/card/source/remove-memory.ts` — Phase 1
- `test/core-visibility.test.ts` — Phase 2
- `test/core-card-push-mind.test.ts` — Phase 2
- `test/core-card-store-mind.test.ts` — Phase 1
- `test/core-card-project-mind.test.ts` — Phase 3
- `test/core-mind-generator.test.ts` — Phase 4
- `test/core-sync-mind.test.ts` — Phase 4
- `test/commands-card-show-mind.test.ts` — Phase 4
- `test/commands-card-validate-mind.test.ts` — Phase 4
- `test/commands-card-source-mind-mutate.test.ts` — Phase 1

Total: ~18 modified, ~18 new files. Larger than the Wave-1 hooks rollout because this task adds a new typed content family, lock metadata, push gating, and write-time materialization.

---

## Notes

- Every code excerpt in this plan is a starting point, not a finished implementation. The implementer should adapt to match the actual codebase style (TypeScript strict mode conventions, formatter rules, imports) when writing.
- The phases are sequentially numbered but Phase 0 + Phase 1 (schema + source-side) could be a single commit. Phase 2 + Phase 3 (push gate + lockfile bump) should be separate commits for review clarity. Phase 4 (materialization) is its own commit.
- `lockfileVersion: 2 | 3 | 4` keeps backward read compatibility. Once this lands, `writeCardLock` always emits v4 — there is no "write a v3 lockfile" mode. v2/v3 read compatibility is the contract.
- The `MIND_MIN_DRWN_VERSION` placeholder will be resolved when the release version is picked (likely `0.4.0`); update the constant before tagging the release.
- This plan deliberately stops at Phase 4 in the drwn repo. Phase 5 (CCH) and Phase 6 (mind migration) get their own task files in their respective contexts.
