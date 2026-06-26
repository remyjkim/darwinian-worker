# Drwn Mind Card Target Architecture

**Date**: 2026-06-18
**Status**: Draft
**Author**: Claude + Remy
**References**: [analyses/62_mind-as-card-substrate-evaluation.md, analyses/60_drwn-card-hooks-target-architecture.md, analyses/55_card-catalog-publish-cli-target-architecture.md, analyses/52_drwn-target-architecture-post-wave-1.md, tasks/45_plan1_l6-mind-card-from-personal-assistant.md, tasks/45_completion_l6-mind-card.md, cli/core/card-manifest.ts, cli/core/card-source.ts, cli/core/card-store.ts, cli/core/card-lock.ts, cli/core/card-project.ts, cli/core/extensions/registry.ts, /Users/pureicis/dev/containerized-cli-harness/packages/runtime/src/container-cli-base.ts]

---

## Executive Summary

Drwn Harness Cards gain a new **typed card** dimension — `type: "mind"` — that unlocks three additional bundled content classes on top of the existing skills/hooks/MCP/extensions slots:

- **Persona** (L1 soul/values) — Markdown fragments contributed to the runtime's system prompt.
- **Beliefs** (L3 belief layer) — read-only knowledge bundles representing viewpoints / worldviews. Treated as core knowledge substrate, distinct from procedural skills.
- **Memory** (L4 / L5 / L6) — three-tier baked memory: L4 refined reflections (stable), L5 curated observations (selective), L6 raw trajectory (high-volume, includes past conversations).

Mind cards inherit every existing card affordance — skills, hooks, MCP servers, extensions, targets, content-addressed extraction, lockfile pinning, trust gates, `drwn card publish`, catalogs. The discriminator is opt-in: regular cards continue to validate exactly as today and refuse the mind-only slots. Mind cards declare what they ship via the standard `include` convention.

Two architecturally significant additions accompany the new content classes:

1. **Per-layer visibility tags.** Each memory tier and the beliefs slot carry a manifest-declared visibility in `{private, internal, public}`. `drwn card publish` refuses to push to a public remote if any layer is marked `private` or `internal`. Combined with a default-private-remote posture for `type: "mind"` cards, this gives PII a structural gate at the publish boundary.
2. **CCH-mediated consumer integration.** Mind cards materialize to a deterministic project-relative path (`./.agents/drwn/generated/mind/`) following the same zero-coupling pattern hooks already use. CCH stays Mind-unaware; Mindcloud and Mindblown — both CCH consumers — pick up Mind content through CCH's existing `mountPreExecAssets` hook. No drwn↔Mindblown direct coupling is required for v1.

A third infrastructure piece — Git LFS for L6 raw trajectory content — is part of the long-run architecture but **explicitly deferred** to a follow-on iteration. The first v1 iteration stores all memory content (including L6) as ordinary in-tree Markdown / text files in the card's Git tree. This sets a soft size constraint (per-card repo size grows linearly with L6 content) that's acceptable for the four existing Mindblown minds at current refinery volumes; LFS lands when the constraint starts to bite.

Mutability stays out of v1: every memory layer is baked at publish. Runtime accumulation, Mind Cloud writeback, and the R2/S3 split for L6 are explicit Wave-N+1 work.

Sizing: somewhat smaller than the Wave-1 hooks rollout (`60_drwn-card-hooks-target-architecture.md`) — schema bump, source-layout convention, lockfile bump (v3 → v4), publish-path changes, materialization writers, type-aware doctor, CLI commands. LFS would have been the genuinely novel infrastructure surface; deferring it from this iteration removes the biggest implementation risk.

---

## Context

### Why now

Three things converge:

1. **Matt's pre-seminar position** (analysis 62, Notion `37df1fbef8c2`) — minds and harness cards should share one substrate, not two. The current Mindblown design (R2 tarballs + Postgres `thread_memory`) and the drwn card design (immutable Git-backed cards + extension-managed mutable state) already mirror each other; collapsing them onto one substrate eliminates duplicate distribution, integrity, and versioning machinery.
2. **The `@remyjkim/l6-mind-card` precedent** (task 45, shipped 2026-06-14). Procedural mind content fits the existing skills slot via description-trigger frontmatter; the limitation surfaces is that L6 raw data was forced into procedural form because there was nowhere else to put it. That gap is the case for the new slots.
3. **CCH as a stable mounting boundary.** CCH's `mountPreExecAssets` hook (`packages/runtime/src/container-cli-base.ts`) is already the integration point for Codex and Mastra runtimes inside Cloudflare Sandbox containers. Both Mindcloud and Mindblown sit on CCH, so a drwn-side artifact written to a deterministic path can flow into both without drwn knowing about either.

### Decisions log

Five decisions land this architecture (Remy + Claude, 2026-06-15 → 2026-06-18):

| # | Decision | Outcome |
|---|---|---|
| Q1 | Mutability boundary for L4/L5/L6 | **All baked at publish** for v1. L6 stored as ordinary in-tree Markdown/text in v1's first iteration; Git LFS deferred to a follow-on iteration; R2/S3 migration further out. Runtime delta / Mind Cloud writeback out of v1 scope. |
| Q2 | Handling L6 PII / past-conversation content | **Stack A + C**: private-by-default remote for `type: "mind"`, plus per-layer visibility tags (`private`/`internal`/`public`) enforced at publish. Two-tier public-skeleton + private-blob-store (option D) is the v2 direction alongside R2/S3. |
| Q3 | Authoring story for memory content | **Refinery pipeline output, user-editable.** Markdown is the baseline format; JSONL supported for structured layers. Provenance tracking (pipeline-written vs hand-edited) deferred. |
| Q4 | Card type discriminator mechanics | **Top-level `type` field** on `card.json`. Validator branches on it. Mind-only slots are refused on regular cards. |
| Q5 | Materialization target | **CCH as direct consumer**, zero-coupling pattern. Drwn writes to `./.agents/drwn/generated/mind/`; CCH's `mountPreExecAssets` mounts that into sandbox; Mindcloud/Mindblown read from the mounted path. Same shape as hooks v1. |

### Scope

This document specifies the v1 target state covering:

- Card manifest schema extension (typed cards + mind-only slots).
- Source-tree layout for persona, beliefs, memory layers, with LFS conventions.
- Lockfile schema bump and per-layer visibility storage.
- Publish flow with LFS init, visibility gates, default private remote for mind cards.
- Resolution / extract with LFS smudge.
- Materialization writers and the `mind.json` consumer index.
- CLI command surface (authoring, validation, publishing).
- Doctor extensions for type-aware validation.
- Testing strategy and phased rollout.

**Out of v1 scope** (explicitly deferred):

- Runtime delta / Mind Cloud writeback (cards stay immutable).
- R2/S3 backing store for L6 (option D in analysis 62; LFS suffices for v1).
- Multi-mind composition (one mind per project in v1).
- Mind cards depending on other cards.
- Provenance tracking distinguishing pipeline-written vs hand-edited memory content.
- Encryption at rest (option E in analysis 62).
- Redaction pipeline (option B in analysis 62; dropped).
- Refinery-to-card migration tooling (the existing 4 Mindblown minds migrate by hand for v1; tooling lands as v1.1).
- Mind-card-aware catalog policies (existing catalog mechanism applies; private-default may surface them less).

---

## Architecture

### 1. Card type discriminator and manifest schema

A new top-level `type` field on `card.json` discriminates regular cards from mind cards. The field is optional; absence means regular (back-compatible with all existing v1.x cards).

```ts
// cli/core/card-manifest.ts

interface CardManifest {
  $schema?: string;
  type?: "harness" | "mind";            // NEW: discriminator. Default "harness".
  name: string;
  version: string;
  description?: string;
  license?: string;
  harness?: { minVersion?: string };
  bundles?: Record<string, string>;
  skills?: { include?: string[] };
  hooks?: { include?: string[] };
  servers?: Record<string, ServerOverride>;
  extensions?: Record<string, ProjectExtensionConfig>;
  targets?: Partial<Record<TargetName, { enabled: boolean }>>;
  stability?: "experimental" | "stable" | "production";
  lastValidatedWith?: string;
  testStatusBadge?: string;

  // Mind-only sections — REJECTED on regular cards
  persona?: PersonaManifest;
  beliefs?: BeliefsManifest;
  memory?: MemoryManifest;
}

interface PersonaManifest {
  include?: string[];                   // Markdown fragments contributed to system prompt
  visibility?: Visibility;              // Default "internal"; persona is rarely sensitive
}

interface BeliefsManifest {
  include?: string[];                   // Named belief bundles
  visibility?: Visibility;              // Default "internal"
}

interface MemoryManifest {
  l4?: MemoryLayerManifest;             // Refined reflections (stable)
  l5?: MemoryLayerManifest;             // Curated observations (selective)
  l6?: MemoryLayerManifest;             // Raw trajectory (high-volume, LFS-backed)
}

interface MemoryLayerManifest {
  include?: string[];                   // Named memory bundles within the layer
  visibility?: Visibility;              // Required for L4/L5/L6; no default
  format?: "md" | "jsonl" | "mixed";    // Default "md"
}

type Visibility = "private" | "internal" | "public";
```

**Validation rules** (`validateCardManifest`):

- `type` defaults to `"harness"` if absent. Only `"harness"` and `"mind"` accepted.
- Regular cards (`type !== "mind"`): the `persona`, `beliefs`, `memory` fields are rejected with a clear error: `"persona is only allowed on mind cards (type: \"mind\")"`.
- Mind cards: each section is optional but if present must conform. A mind card with no persona, no beliefs, and no memory is *valid but warned* — it's structurally a regular card and the type tag should be reconsidered.
- `memory.l4 / l5 / l6` each require an explicit `visibility` if their `include` is non-empty. No default — explicitness here is load-bearing for the publish gate.
- `persona.include[]` entries must each match `persona/<name>/PERSONA.md` in the source.
- `beliefs.include[]` entries must each match `beliefs/<name>/BELIEF.md` in the source.
- `memory.l{N}.include[]` entries must each match `memory/l{N}/<name>/` in the source (one or more files inside, per `format`).

**Why a top-level type field, not a `mindManifest` sub-object:**

- Symmetric with how other discriminators (`stability`, `harness.minVersion`) live at the top level.
- Simpler validator branching (`if (manifest.type === "mind") validateMindFields(...)` rather than nested optional traversal).
- Surfaces in `drwn card show` and JSON output without additional shaping.
- Allows future types (e.g., `type: "agent"`) without further nesting.

### 2. Source layout

```
~/.agents/drwn/sources/<scope>/<name>/
  card.json                       # type: "mind"
  package.json                    # optional; matches manifest name+version

  # Existing slots (all optional on mind cards)
  skills/<name>/SKILL.md
  hooks/<name>/policy.ts
  mcp-servers/<id>.json

  # Mind-only slots
  persona/<name>/PERSONA.md       # L1 system-prompt fragments
  beliefs/<name>/BELIEF.md        # L3 belief bundles (one .md per belief)
  memory/
    l4/<name>/                    # L4 refined reflections
      <files>.md | <files>.jsonl
    l5/<name>/                    # L5 curated observations
      <files>.md | <files>.jsonl
    l6/<name>/                    # L6 raw trajectory (in-tree text/md for v1; LFS later)
      <files>.md | <files>.jsonl

  README.md                       # optional
```

**Per-entry shape:**

- **Persona** (`persona/<name>/PERSONA.md`) — frontmatter optional; body becomes a contribution to the runtime's system prompt. Multiple persona entries are concatenated in `include[]` order at materialization with a fixed separator.
- **Beliefs** (`beliefs/<name>/BELIEF.md`) — frontmatter optional; body is read as worldview content. Future shapes (structured JSON-LD beliefs, source-attributed beliefs) can extend the directory without breaking v1.
- **Memory layer** (`memory/l{N}/<name>/`) — directory may contain multiple files; format declared in manifest (`md` / `jsonl` / `mixed`). The materializer surfaces all files under the bundle as a unit; the consumer (CCH/Mindblown) walks the tree.

**Storage in v1's first iteration:** all memory content is stored as ordinary files in the card's Git tree. No LFS configuration is committed; no `.gitattributes` for memory paths. Per-card repo size grows linearly with L6 content. The size constraint is the practical Git tree limit (loose-object performance degrades around hundreds of MB; pack-file repos can scale further but operations get slower). For the four existing Mindblown minds, current refinery volumes fit well below this. When a card approaches the limit, the follow-on LFS iteration adds `.gitattributes` rules for `memory/l6/**` and the corresponding extract / store machinery; the source-layout convention does not change.

### 3. Lockfile schema bump (v3 → v4)

`card.lock` gains mind-card metadata. v3 lockfiles continue to read with auto-fill of empty mind sections.

```ts
// cli/core/card-lock.ts

interface CardLockEntry {
  // ...existing v3 fields (name, requested, version, path, integrity, manifest,
  //                       skills, hooks, hookConsent, registry, origin, git)

  type: "harness" | "mind";          // NEW (v4): card type discriminator

  // Mind-only (only present when type === "mind")
  persona?: string[];                // list of persona entries
  beliefs?: string[];                // list of belief entries
  memory?: {
    l4?: { entries: string[]; visibility: Visibility };
    l5?: { entries: string[]; visibility: Visibility };
    l6?: { entries: string[]; visibility: Visibility };
  };
}

interface CardLockfile {
  lockfileVersion: 2 | 3 | 4;        // v4 introduced for mind cards
  store?: { minDrwnVersion?: string };
  cards: CardLockEntry[];
}
```

**Read compatibility:**

- v2/v3 lockfiles read with `type: "harness"` defaulted in.
- v3 readers cannot parse mind metadata; the `store.minDrwnVersion` field is bumped to the v1 drwn version that introduces mind support, so older drwn refuses to read v4 lockfiles rather than silently dropping data.

**Why per-layer visibility lives in the lockfile, not derived at runtime:**

- Lockfile is the integrity boundary for "what's actually installed." Re-deriving visibility from the manifest at every materialization is redundant and error-prone if a manifest is hand-edited mid-cycle.
- `drwn install` on a CI box without the source manifest needs visibility to honor publish gates.
- Lockfile snapshots are git-committed; auditing what visibility was claimed at publish time is a lockfile read.

### 4. Visibility model and trust gates

Per-layer visibility values:

- `private` — never publish to any non-trusted remote. Treated as PII / proprietary content.
- `internal` — publish only to private/internal remotes (private GitHub repo, GitLab internal project, self-hosted Git). Treated as organization-internal.
- `public` — publishable anywhere, including public GitHub repositories and community catalogs.

**Publish-time gate** (`drwn card publish` for `type: "mind"`):

The publish target remote is classified by `drwn card publish` from configured remote URL + best-effort heuristics:

```
remote.visibility(url):
  if url contains "github.com" and repo is private → internal
  if url contains "github.com" and repo is public  → public
  if url is git@... (SSH) and we cannot determine → internal (conservative default)
  if url is a local file:// remote                  → private
  else → unknown (require explicit override)
```

**Publish gate logic:**

```
publish_allowed(target_visibility, layer_visibilities):
  required = strictest(layer_visibilities)
  return target_visibility ≤ required
  // private ≤ internal ≤ public; target must be at least as restrictive as required
```

A `--unsafe-publish-public` flag exists to override, with a confirmation prompt that explicitly names the layers being published and their PII risk. Audited in the publish record.

**Default remote posture:**

- `drwn card source new --type=mind` does NOT auto-register a remote. The author must run `drwn card remote add` explicitly.
- `drwn card publish` for `type: "mind"` cards without a configured remote refuses to publish (where regular cards fall back to local-store-only publish, which is fine).
- `drwn card remote add` for `type: "mind"` cards warns if the URL resolves to a public remote.

**Trust gate composition with existing mechanisms:**

- `trustedSources` continues to govern consumption (whether a card from a given remote is auto-applied vs requires `--allow-untrusted-source`).
- Hook consent (`hookConsent` in lockfile, from Wave 1 hooks) remains independent. A mind card with both hooks and memory needs both consents.
- No new consent gate is introduced for memory content — it's read-only data, not executable. The publish gate is the load-bearing protection.

### 5. Publish flow

Builds on the existing `drwn card publish` (`cli/core/card-store.ts`). Added steps marked **NEW**.

```
drwn card publish @scope/name [--public]

1. Resolve source at ~/.agents/drwn/sources/<scope>/<name>/
2. Read manifest, validate type-aware schema.                          [NEW]
3. (NEW for mind) Validate visibility tags on every memory layer.
4. (NEW for mind) Walk persona/<name>/PERSONA.md, beliefs/<name>/BELIEF.md,
   memory/l{4,5,6}/<name>/ for each include; assert presence.
5. (NEW for mind) Resolve remote.visibility(configured remote URL).
   Check publish_allowed; refuse if gate fails, unless --unsafe-publish-public.
6. Create bare repo if needed; commit content; tag with version.
7. Extract to ~/.agents/drwn/extracted/<tree-sha>/.
8. Compute integrity (sha256 over extracted tree).
9. Write CardLockEntry for the publishing project (if applicable).
10. Print publish summary including type and visibility-per-layer.
```

**Deferred to a follow-on iteration:** Git LFS in the card store. When it lands, the bare card repo at `~/.agents/drwn/cards/@scope/name.git/` gains `git lfs install` at creation when `card.json` declares `type: "mind"`; push/fetch propagate LFS objects; `drwn store gc` and `drwn store verify` gain LFS awareness; extract runs smudge. None of those code paths exist in v1's first iteration; mind cards push, fetch, and extract through the exact same Git plumbing that harness cards already use.

### 6. Resolution and extract

Resolution is **unchanged in shape and code from harness cards** in v1's first iteration. Origin-dispatching resolver, lockfile pinning, `extracted/<tree-sha>/` content-addressing — all reuse the existing paths. The only mind-specific extraction behavior is that the extracted tree now contains the `persona/`, `beliefs/`, and `memory/` directories; the integrity hash covers them like any other tree content.

`drwn install` likewise needs no mind-specific behavior in this iteration. LFS-aware fetch lands when LFS lands.

### 7. Materialization to `./.agents/drwn/generated/mind/`

`drwn write` (the materialization verb) gains a mind-aware writer when `card.lock` contains at least one `type: "mind"` card.

**Constraint:** v1 supports **at most one mind card per project**. Multiple mind cards in the same lockfile produce a `mind-multi-card` error with guidance to remove all but one or use `drwn use --mind <name>` to pick.

**Output layout** (project-relative, deterministic):

```
<project>/.agents/drwn/generated/mind/
  mind.json                                       # consumer index
  persona.md                                      # concatenated from all persona/<name>/PERSONA.md
  beliefs/
    <name>/BELIEF.md                              # symlinks into extracted tree
  memory/
    l4/<name>/...                                 # symlinks
    l5/<name>/...                                 # symlinks
    l6/<name>/...                                 # symlinks (LFS-smudged content already on disk)
```

**`mind.json` index** — single JSON file consumers read to discover what's mounted:

```json
{
  "schemaVersion": 1,
  "card": {
    "name": "@mindblown/dalio-mind",
    "version": "1.0.0",
    "treeSha": "abc123...",
    "integrity": "sha256-..."
  },
  "persona": {
    "path": "persona.md",
    "entries": ["voice", "values", "first-principles"]
  },
  "beliefs": {
    "path": "beliefs/",
    "entries": [
      { "name": "radical-transparency", "path": "beliefs/radical-transparency/BELIEF.md" }
    ],
    "visibility": "internal"
  },
  "memory": {
    "l4": {
      "path": "memory/l4/",
      "entries": [...],
      "visibility": "internal",
      "format": "md"
    },
    "l5": { ... },
    "l6": {
      "path": "memory/l6/",
      "entries": [...],
      "visibility": "private",
      "format": "jsonl"
    }
  },
  "drwnVersion": "1.x.y",
  "writtenAt": "2026-06-18T12:00:00Z"
}
```

**Persona concatenation** is deterministic: entries appear in the order declared in `card.json` `persona.include[]`, separated by a fixed marker:

```
<!-- persona:start name="voice" -->
...PERSONA.md body...
<!-- persona:end name="voice" -->

<!-- persona:start name="values" -->
...
```

Markers are machine-readable so a consumer can split the concatenated file back into entries if needed.

**Symlinks vs copies:** beliefs and L4/L5/L6 use symlinks into `~/.agents/drwn/extracted/<tree-sha>/` (same as skills materialization). All L6 content is ordinary in-tree text/Markdown in v1's first iteration, so the symlink target reads through to ordinary files. CCH (which copies project contents into the sandbox before exec) resolves symlinks during copy.

**Persona file is a generated copy, not a symlink,** because it's concatenated from multiple sources and cannot symlink to a single source.

### 8. CCH consumer integration

CCH stays Mind-unaware. The integration is one-directional: drwn writes to a known path, CCH's existing `mountPreExecAssets` hook (`packages/runtime/src/container-cli-base.ts`) picks it up.

**CCH-side reference implementation** (lives in CCH repo, separate task):

```ts
// Inside MindblownCliRuntime or MindcloudCliRuntime extending ContainerCliBase
protected async mountPreExecAssets(
  sandbox: SandboxHandle,
  paths: WorkspacePaths,
  input: Readonly<HarnessRuntimeInput>,
): Promise<void> {
  await super.mountPreExecAssets(sandbox, paths, input);

  const mindDir = path.join(paths.projectRoot, ".agents/drwn/generated/mind");
  if (!await pathExists(mindDir)) return;  // no mind card → no-op

  await sandbox.uploadDirectory(mindDir, "/mnt/mind/");
  // Mindblown's agent runtime reads /mnt/mind/mind.json at construction time
}
```

**Drwn-side contract** (what we commit to):

- Path: `<projectRoot>/.agents/drwn/generated/mind/`
- Index file: `mind.json` at the root (schema versioned).
- Layout: as documented in §7.
- Symlink semantics: all symlinks resolve to paths within the project (no escape to user home) — this matters for CCH copy semantics. To honor this, the materializer copies LFS-smudged content into the project tree when a symlink would resolve outside it, with an opt-out flag for advanced users.

Actually — correction on that last point. Symlinks for mind content target `~/.agents/drwn/extracted/<tree-sha>/`, which IS outside the project tree. This is consistent with how skills already work today (skills also symlink to extracted), and CCH already handles this for skills. The mind materialization follows the same pattern; no special copying.

**Mindblown / Mindcloud side** (their work, not drwn's):

- At agent construction, read `/mnt/mind/mind.json`.
- Compose system prompt with `persona.md` content.
- Load beliefs as worldview knowledge available to the model.
- Mount memory layers into agent's read-access surface (the existing refinery-mount machinery, now sourced from `/mnt/mind/memory/` instead of R2).

This is the migration path for the existing 4 Mindblown minds (Elon, Dalio, Harari, Taleb): instead of `R2.fetch(refinery.tar)`, the runtime reads `/mnt/mind/` populated by the drwn-via-CCH chain.

### 9. CLI surface

New commands (mirroring the existing `card source add-skill` shape):

```
# Type-aware card creation
drwn card source new --type=mind @scope/name

# Persona authoring
drwn card source add-persona @scope/name <entry-name> --from <staging-dir>
drwn card source remove-persona @scope/name <entry-name>

# Belief authoring
drwn card source add-belief @scope/name <entry-name> --from <staging-dir> \
  [--visibility private|internal|public]
drwn card source remove-belief @scope/name <entry-name>

# Memory authoring (per layer)
drwn card source add-memory @scope/name <entry-name> \
  --layer l4|l5|l6 \
  --from <staging-dir> \
  --visibility private|internal|public \
  [--format md|jsonl|mixed]
drwn card source remove-memory @scope/name <entry-name> --layer l4|l5|l6

# Lift refinery into a mind card (deferred to v1.1, but reserve the name)
drwn card source import-refinery @scope/name --from <refinery-path>
```

Modified commands:

```
# drwn card source doctor — type-aware validation
drwn card source doctor @scope/name [--json]
  # For type: "mind" cards, additionally validates:
  # - persona/<name>/PERSONA.md presence for each persona.include
  # - beliefs/<name>/BELIEF.md presence for each beliefs.include
  # - memory/l{N}/<name>/ presence and non-emptiness for each memory.l{N}.include
  # - visibility tag presence on all non-empty memory layers
  # - .gitattributes LFS rules cover memory/l6/** if any L6 content present
  # - JSONL files are parseable per their declared format

# drwn card show — surfaces mind sections
drwn card show @scope/name [--json]
  # Adds sections for persona / beliefs / memory layer counts + visibilities
  # in both text and JSON output.

# drwn card publish — type-aware
drwn card publish @scope/name [--unsafe-publish-public]
  # Refuses public-remote publish if any layer is private or internal
  # without the explicit override flag.

# drwn write — materializes mind content when present
drwn write [--dry-run] [--json]
  # Adds mind materialization phase after standard skill/MCP/hook materialization.
  # Refuses if lockfile contains >1 mind card without explicit --mind <name>.
```

### 10. Migration

**For the existing 4 Mindblown minds** (Elon, Dalio, Harari, Taleb), the migration mapping:

| Refinery layer (Mindblown) | Mind card slot |
|---|---|
| L1 soul / values (`01_soul_values/`) | `persona/<name>/PERSONA.md` (one entry per file or rolled into one) |
| L2 principles (`02_principles/`) | Tool-izable → `skills/<name>/SKILL.md` (Remy's l6-mind-card pattern); reasoning-style → folded into persona body |
| L3 world models (`03_world_models/`) | `beliefs/<name>/BELIEF.md` (one entry per model) |
| L4 reflections (`04_reflections/`) | `memory/l4/<name>/` |
| L5 observations (`05_observations/`) | `memory/l5/<name>/` |
| L6 raw data (`06_raw_data/`) | `memory/l6/<name>/` (LFS) |

**v1 migration is manual.** Each mind is converted by hand using the new `card source add-*` commands. The `import-refinery` command above is reserved for v1.1.

**For the `@remyjkim/l6-mind-card`** (task 45): no migration needed. It's a `type: "harness"` card that ships procedural skills. It continues to work unchanged. If Remy chooses to retype it to `type: "mind"` later (to add belief / memory layers), that's an author-driven decision, not a forced migration. The card name doesn't need to change.

---

## Out of scope for v1 (recap)

| Feature | Why deferred | Successor |
|---|---|---|
| Runtime delta / Mind Cloud writeback | Cards stay immutable; mutable state stays in Mindblown's `thread_memory` and Mind Cloud per existing architecture | Wave-N+1; designed alongside option D for L6 storage |
| Git LFS for L6 content | v1's first iteration stores L6 as ordinary in-tree text/Markdown; soft repo-size limit is acceptable for the four known minds | v1.x follow-on iteration |
| R2/S3 backing store for L6 | Lands alongside the two-tier publish-skeleton split, after LFS proves the basic shape | Future (after LFS iteration) |
| Multiple mind cards per project | Composition semantics for persona/beliefs/memory across cards are non-trivial; "one mind per session" matches Mindblown's product story | Defer until a real use case |
| Mind cards depending on other cards | Adds a card-dependency graph that drwn currently does not have | Out of v1; revisit if real use cases emerge |
| Pipeline-vs-hand-edited provenance | Authors will edit pipeline output; tracking which file is which adds doctor complexity for unclear v1 value | v1.1 |
| Encryption at rest | Key management is a separate, larger problem; LFS + visibility gate covers v1 needs | Future, if needed |
| Redaction pipeline | False sense of safety; visibility gate + private-default is structurally cleaner | Dropped |
| Refinery-to-card migration CLI | Existing 4 minds migrate by hand for v1; tooling is a small surface but not load-bearing for v1 | v1.1 |
| Catalog policies for mind cards | Existing catalogs work; private-default reduces public-catalog presence | Revisit if catalog policies generally evolve |

---

## Testing strategy

Mirrors the Wave-1 hooks rollout, plus LFS-specific suites.

**Unit tests:**

- Manifest validation: type discriminator, mind-only field rejection on regular cards, visibility field presence on non-empty memory layers.
- Source-layout validation: presence of `persona/<name>/PERSONA.md`, `beliefs/<name>/BELIEF.md`, `memory/l{N}/<name>/`.
- JSONL parser smoke for declared-jsonl layers.
- Lockfile v4 read/write round-trip; v3 backward read compatibility.
- Persona concatenation determinism (same inputs → same output bytes).
- Visibility gate: every (layer-visibility × remote-visibility) combination.

**Integration tests:**

- End-to-end publish of a fixture mind card: source → bare repo → tag → extract → integrity hash → lockfile entry.
- Materialization: lockfile with one mind card → `./.agents/drwn/generated/mind/` tree appears with correct structure and `mind.json`.
- Refusal cases: two mind cards in lockfile, missing visibility tag, public remote with private layer.

**CLI E2E tests:**

- `drwn card source new --type=mind` scaffolds correct layout + `.gitattributes`.
- `drwn card source doctor` greens on a hand-built mind card; reds on every refusal case above.
- `drwn card publish` succeeds with private remote + private layers; refuses public remote + private layers.
- `drwn card show` JSON output includes mind sections with visibility.

**Live-runtime tests** (opt-in, parallel to the hook strategy from analysis 61):

- Build a fixture mind card with one persona entry, one belief, and a tiny L6 layer.
- Run through `drwn install + drwn write` in a CCH-instrumented harness.
- Confirm `/mnt/mind/mind.json` appears inside the sandbox at the expected path with expected schema.
- One Mindblown reference run that reads `/mnt/mind/persona.md` and incorporates it into agent construction.

These are release-gate tests, not default CI — matches the hook live-runtime tier in `61_real-runtime-card-hook-testing-strategy.md`.

---

## Phased rollout

Mirrors the Wave-1 hooks rollout shape (`60_drwn-card-hooks-target-architecture.md` §9, adapted). Phases are roughly independent within each track.

**Phase 0 — Schema + validation (smallest, ships first)**

- Add `type` field to manifest schema.
- Add `persona`, `beliefs`, `memory` interfaces.
- Implement `validateCardManifest` mind branch.
- Unit-test all validation rules.
- Ship as a tagged release with no user-visible behavior (no card uses the new fields yet).

**Phase 1 — Source layout + doctor + add commands**

- Implement `drwn card source new --type=mind` with `.gitattributes` scaffold.
- Implement `drwn card source add-persona/add-belief/add-memory` and their `remove-` counterparts.
- Extend `drwn card source doctor` for mind cards.
- Hand-build a fixture mind card and round-trip it.

**Phase 2 — Publish + visibility gates**

- Publish-time visibility classification (`remote.visibility(url)`).
- Publish gate (`publish_allowed` check; layer-vs-remote visibility comparison).
- `--unsafe-publish-public` flag with confirmation prompt.
- Default-private-remote posture for `type: "mind"` (refuse publish without configured remote).
- `drwn card publish` end-to-end for a fixture mind card.

**Phase 3 — Lockfile v4 + resolution**

- Bump `lockfileVersion` to 4 in writers; readers accept v2/v3 with auto-fill.
- Persist `type` + mind metadata in `CardLockEntry`.
- `drwn install` LFS auto-fetch for mind cards.
- v3 → v4 migration smoke (open lockfile, save, no semantic change for harness-only projects).

**Phase 4 — Materialization to `./.agents/drwn/generated/mind/`**

- Implement the mind writer: persona concatenation, belief symlinks, memory symlinks, `mind.json` index.
- `drwn write` integration: detect mind card in lockfile, enforce one-mind-per-project, run mind writer.
- `drwn write --dry-run --json` includes mind plan.
- Test with `@remyjkim/l6-mind-card` retyped to `type: "mind"` as a smoke (no actual belief/memory content needed; sanity check the writer no-ops cleanly on a mind card with only skills).

**Phase 5 — CCH consumer reference (CCH repo, separate task)**

- Update `MindblownCliRuntime` / `MindcloudCliRuntime` (or whichever runtime classes are the actual mount points) to extend `mountPreExecAssets`.
- Mount `<project>/.agents/drwn/generated/mind/` into sandbox at `/mnt/mind/`.
- Live-runtime test: a fixture project with a mind card → sandbox sees `/mnt/mind/mind.json`.
- This phase lands in CCH and depends on Phases 0-4 landing in drwn; coordinate release.

**Phase 6 — Migrate the existing 4 Mindblown minds**

- For each of Elon / Dalio / Harari / Taleb, build a `@mindblown/<name>-mind` mind card from the existing refinery.
- Publish to private `@mindblown` org GitHub.
- Switch the Mindblown runtime to consume from drwn-via-CCH instead of R2 directly.
- Sunset the R2 refinery-tarball path once the four cards are live and stable.

Phase 6 is the demonstration that the substrate proposal pays off; until it lands, the new schema/CLI/materializer is hypothetical infrastructure.

---

## Open issues for follow-up

These are explicitly NOT blocking the v1 architecture, but should be tracked:

1. **Persona composition across multiple persona entries within one card.** v1 concatenates in `include[]` order with separator markers. Future: should personas be merge-aware? Should entries be tagged with weights / sections? Defer until a real authoring use case argues for it.
2. **Memory bundle granularity.** Bundles are author-defined (`memory/l4/<name>/`). Authors will discover the right granularity through use. Doctor doesn't enforce a max bundle size; LFS handles the size dimension; the only risk is sprawling bundle counts. Revisit if catalog browsing of mind cards becomes noisy.
3. **JSONL schema validation.** v1 parses JSONL for well-formedness only. If consumers (Mindblown) eventually demand a per-layer JSONL schema (one object per turn, one object per observation, etc.), we'd add a per-bundle schema field. Defer until concrete need.
4. **`drwn outdated` semantics for mind cards.** Existing semver-based outdated checks apply. But mind card "freshness" might be about memory recency (when was L6 last regenerated from the pipeline?) more than semver. Possibly a future `drwn mind freshness` or `drwn card mind-status` surface.
5. **One-mind-per-project as a hard or soft constraint.** v1 makes it hard (error). If authors find legitimate use cases for two minds (e.g., adversarial pair, debate panel), the materializer could compose into `mind/<card-name>/` subdirs and `mind.json` could be an array. Defer until asked.
6. **Belief layer extensibility.** v1 stores beliefs as Markdown bodies. Future: structured beliefs (JSON-LD, ABox/TBox, source-attributed). The directory shape (`beliefs/<name>/`) already accommodates this; the manifest could add `beliefs.<name>.format` later.
7. **Mindblown-side migration of `thread_memory`.** Today, Mindblown stores per-thread mutable memory in Postgres. The mind card v1 substrate doesn't touch this — `thread_memory` remains Mindblown's runtime concern. The interesting future question is whether `thread_memory` deltas can be "promoted" into a new mind card version (an L5 update from accumulated L6). That's the runtime-writeback question and explicitly deferred.

---

## Cross-references

- The Wave-1 hooks rollout (`60_drwn-card-hooks-target-architecture.md`) is the structural template for this work. Same shape of change: new manifest section, source-layout convention, lockfile bump, doctor support, downstream writer, trust gate composition, CCH zero-coupling integration.
- The substrate evaluation (`62_mind-as-card-substrate-evaluation.md`) established the case for this work and recorded the five Q&A decisions referenced in §0 of this doc.
- The five load-bearing decisions of post-Wave-1 drwn (`52_drwn-target-architecture-post-wave-1.md` §1) all survive intact: Git-backed storage, filesystem-as-API, two-phase intent/materialization, three downstream mechanisms, lockfile-pinned reproducibility. Mind cards extend within these, not against them.
- The `@remyjkim/l6-mind-card` (`tasks/45_*`) is the existing precedent for L2-style procedural mind content. It informs the persona-concatenation convention (Remy's per-skill "Assumes" guard pattern is procedural and stays in skills; persona content is identity-level and is what's new here).
- CCH's `mountPreExecAssets` (`packages/runtime/src/container-cli-base.ts`) is the integration point. CCH gains no Mind-awareness; one new `mountPreExecAssets` override in the Mindblown / Mindcloud runtime classes wires `/mnt/mind/` from the drwn-generated directory.
