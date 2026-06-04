# Task 35: Junggyu Review [RDecision] Fixes — Implementation Plan

**Status**: Planning
**Created**: 2026-06-03
**Updated**: 2026-06-03
**Priority**: High
**Dependencies**: none (Phase 3 has soft prereq on docs concepts pages — handled inline)
**References**: [analyses/55_junggyu-review-rdecision-fix-strategies.md, cli/commands/init.ts, cli/core/card-catalog.ts, cli/core/card-store.ts, cli/commands/card/new.ts, README.md, registry/config.json, docs-docusaurus/docs/concepts/, https://github.com/curation-labs/dh-cards-catalog-v1, /Users/pureicis/dev/dh-cards-catalog-v1]

---

## Objective

Land the long-term-optimal fixes for the three `[RDecision]`-flagged issues from Junggyu's Sprint-29 review:

1. **Issue 2** — `drwn init` failing to register the default community catalog (point at the real repo + make URL config-driven).
2. **Issue 1** — `@me/` scope collisions on public publish (docs sweep + auto-derive scope at first `drwn card new`).
3. **Issue 3** — README compaction with prerequisite docs migration into `docs/concepts/`.

Issue 4 (landing-page "How it works") is out of scope per direction; it lives in the `darwinian-harness-landing` repo and the source already wires the anchor — it's a deploy-verification action, not a CLI code change.

Strategies and option trade-offs are codified in `analyses/55_junggyu-review-rdecision-fix-strategies.md`. This document is the executable implementation plan that follows from those decisions.

## Success Criteria

- [ ] `drwn init` against a fresh `~/.agents/drwn/` registers the `@community` catalog from `https://github.com/curation-labs/dh-cards-catalog-v1.git` without any error block, and `drwn library catalog list` shows it.
- [ ] The default catalog URL is sourced from `registry/config.json`, not from a code constant; pointing to a different URL no longer requires a CLI release.
- [ ] Every `examples` entry in CLI command classes uses a placeholder scope (`@your-handle`) instead of `@me`, and the auto-derive prompt drops `@me` from the user-visible default in `drwn card new`.
- [ ] `drwn card new <name>` with no `--scope` and no persisted `machine.authoring.scope` attempts (in priority order) `gh api user`, then `git config --global github.user`, then the local-part of `git config --global user.email`, prompting the user to confirm in interactive shells and falling back to the existing error in non-interactive ones.
- [ ] `README.md` is ≤ 60 lines and the prior "Disciplines" + "Safety model" content has been migrated verbatim (with light expansion) into `docs/concepts/disciplines.md` and `docs/concepts/safety-model.md`, both linked from `docs/intro.md`.
- [ ] `bun test` passes; `bun run typecheck` passes; no new ESLint warnings.
- [ ] No new npm runtime dependencies.

## Approach

Three phases, one per issue, sequenced by user-visible noise reduction (Issue 2 first), then correctness (Issue 1), then polish (Issue 3). Each phase is its own PR. Strict TDD: failing test → implement → green → next. Match the project's existing patterns (`BaseCommand`, ABOUTME comments, Bun-native APIs).

A single planning doc is appropriate because the issues are independent. PRs ship sequentially but don't block each other architecturally.

---

## Implementation Plan

### Phase 1 — Issue 2: Point at the real catalog repo + make URL config-driven

**Goal:** Replace the hardcoded `darwinian-harness/cards-catalog` URL with the actual `curation-labs/dh-cards-catalog-v1` repo, and move the URL to `registry/config.json` so it becomes data rather than code.

**Why this order:** Highest noise-to-fix ratio. Every fresh `drwn init` today prints an 8-line failure block; this PR makes that block disappear immediately.

#### Task 1.1: Extend `CanonicalConfig` with `defaults.communityCatalogUrl`

**Files:**
- Modify: `cli/core/types.ts`

**Steps:**

1. Extend the `defaults?` field on `CanonicalConfig` (or add it if absent at the type level — it already exists for `skills` / `mcpServers` / `extensions`):

   ```ts
   defaults?: {
     skills?: string[];
     mcpServers?: string[];
     extensions?: Record<string, ProjectExtensionConfig>;
     communityCatalogUrl?: string | null;   // null disables registration; missing falls back to packaged default
   };
   ```

2. Run `bun run typecheck`.

**Checkpoint:** Type compiles.

#### Task 1.2: Add `communityCatalogUrl` to packaged `registry/config.json`

**Files:**
- Modify: `registry/config.json`

**Steps:**

1. Add to the `defaults` section:

   ```json
   "defaults": {
     "skills": ["..."],
     "mcpServers": ["..."],
     "communityCatalogUrl": "https://github.com/curation-labs/dh-cards-catalog-v1.git"
   }
   ```

2. Validate the JSON loads cleanly (a smoke run of the CLI would suffice).

**Checkpoint:** Packaged config carries the URL; old constant about to be removed.

#### Task 1.3: Resolve the URL from config at runtime; deprecate the hardcoded constant

**Files:**
- Modify: `cli/core/card-catalog.ts`
- Create: `test/core-card-catalog-default-url.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test } from "bun:test";
import { resolveDefaultCommunityCatalogUrl } from "../cli/core/card-catalog";

describe("resolveDefaultCommunityCatalogUrl", () => {
  test("returns the configured URL when defaults.communityCatalogUrl is set", () => {
    const cfg = { defaults: { communityCatalogUrl: "https://example.com/foo.git" } };
    expect(resolveDefaultCommunityCatalogUrl(cfg)).toBe("https://example.com/foo.git");
  });

  test("returns null when defaults.communityCatalogUrl is null (explicit disable)", () => {
    const cfg = { defaults: { communityCatalogUrl: null } };
    expect(resolveDefaultCommunityCatalogUrl(cfg)).toBeNull();
  });

  test("returns null when defaults.communityCatalogUrl is undefined", () => {
    expect(resolveDefaultCommunityCatalogUrl({})).toBeNull();
    expect(resolveDefaultCommunityCatalogUrl({ defaults: {} })).toBeNull();
  });
});
```

**Step 2: Run — expect fail (function doesn't exist).**

**Step 3: Implement**

```ts
// cli/core/card-catalog.ts
import type { CanonicalConfig } from "./types";

// DEPRECATED: use resolveDefaultCommunityCatalogUrl(packagedConfig) instead.
// Kept temporarily for callers we haven't migrated; remove in a follow-up.
export const DEFAULT_COMMUNITY_CATALOG_URL =
  "https://github.com/curation-labs/dh-cards-catalog-v1.git";

export function resolveDefaultCommunityCatalogUrl(
  config: Pick<CanonicalConfig, "defaults"> | undefined | null,
): string | null {
  const value = config?.defaults?.communityCatalogUrl;
  if (value === undefined) return null;
  return value;
}
```

Update `ensureDefaultCommunityCatalog` to accept the resolved URL:

```ts
export async function ensureDefaultCommunityCatalog(
  agentsDir: string,
  url: string | null,
): Promise<void> {
  if (!url) return;
  const index = await loadCardCatalogIndex(agentsDir);
  if (index.catalogs.some((entry) => entry.url === url)) return;
  try {
    await addCardCatalog(agentsDir, url);
  } catch (error) {
    // Fail-soft: a transient network failure shouldn't break `drwn init`.
    process.stderr.write(
      `drwn: could not register default community catalog (${url}): ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
  }
}
```

**Step 4: Run test, expect pass.**

**Checkpoint:** Function exported and tested. `ensureDefaultCommunityCatalog` no-ops when URL is null.

#### Task 1.4: Wire `drwn init` to resolve the URL from packaged config

**Files:**
- Modify: `cli/commands/init.ts`
- Modify or add: `test/commands-init-default-catalog.test.ts`

**Step 1: Update test** — assert that init calls `ensureDefaultCommunityCatalog` with the URL from packaged config, and that a config with `communityCatalogUrl: null` causes the function to be called with `null` (registering nothing).

**Step 3: Implement**

```ts
// cli/commands/init.ts (excerpt)
import { ensureDefaultCommunityCatalog, resolveDefaultCommunityCatalogUrl } from "../core/card-catalog";
import { loadPackagedConfig } from "../core/config";  // or wherever this lives

// inside execute():
if (!this.noDefaultCatalogs) {
  const packaged = await loadPackagedConfig(this.context.repoRoot);
  const url = resolveDefaultCommunityCatalogUrl(packaged);
  await ensureDefaultCommunityCatalog(this.context.agentsDir, url);
}
```

If `loadPackagedConfig` doesn't already exist as a helper, find the existing place where packaged registry config is parsed and route through it.

**Checkpoint:** `bun test` covers the wired behavior.

#### Task 1.5: Manual smoke

**Steps:**

1. Delete any existing `~/.agents/drwn/catalogs/` and `~/.agents/drwn/catalogs.json`.
2. Run `bun cli/index.ts init` in a scratch project.
3. Verify no error block appears.
4. Run `bun cli/index.ts library catalog list` — expect to see one entry for `@community` pointing at `https://github.com/curation-labs/dh-cards-catalog-v1.git`.
5. Run `bun cli/index.ts library catalog refresh @community` — expect success.

**Checkpoint:** Catalog registers cleanly on fresh init.

#### Task 1.6: Deprecate/remove the constant export

**Files:**
- Modify: `cli/core/card-catalog.ts`

**Steps:**

1. After the above lands and we've confirmed nothing else imports `DEFAULT_COMMUNITY_CATALOG_URL`, delete the export.
2. Run `bun run typecheck` and `bun test` to verify no breakage.

**Checkpoint:** No code references the constant. URL lives in `registry/config.json` only.

#### Task 1.7: Docs note

**Files:**
- Modify: `docs-docusaurus/docs/getting-started/first-run.md` (or wherever default catalog is mentioned)

**Steps:**

1. Add a short note: "drwn registers the `@community` catalog by default on first init. Override via `registry/config.json` `defaults.communityCatalogUrl` (set to `null` to disable)."

**Checkpoint:** Behavior documented.

#### Phase 1 acceptance

- [ ] Fresh `drwn init` succeeds without error block.
- [ ] `@community` catalog appears in `drwn library catalog list`.
- [ ] `registry/config.json` carries the URL; no hardcoded string remains in `card-catalog.ts`.
- [ ] All tests green.

---

### Phase 2 — Issue 1: Kill `@me` as the documented convention + auto-derive scope

**Goal:** Stop teaching `@me`, and prevent the trap from rebuilding via copy-paste tutorials by auto-deriving a real scope at first `drwn card new`.

**Why this order:** Correctness fix for the public-publish flow. Less noisy than Issue 2 but more important for users who actually share cards.

#### Task 2.1: Inventory every `@me` reference in user-visible surfaces

**Files (search):**
- `cli/commands/card/*.ts` (especially `new.ts`, `apply.ts`, `add.ts`, `publish.ts`, `show.ts`, `validate.ts`, `diff.ts`, `pin.ts`, `remove.ts`, `deprecate.ts`)
- `cli/commands/card/source/*.ts`
- `docs/cli-quickref.md`
- `docs-docusaurus/docs/**/*.md` (especially `getting-started/`, `guides/`, `reference/cli/card.md`)

**Steps:**

1. `grep -rn '@me' cli/ docs/ docs-docusaurus/ --include='*.ts' --include='*.md'`
2. Bucket each hit:
   - Bucket A: `examples` arrays and help-text — replace with `@your-handle`.
   - Bucket B: prose explaining "you can save `@me` as your authoring scope" — rewrite to use auto-derive + a real-handle example.
   - Bucket C: tests asserting strings that mention `@me` — leave (these are internal markers, not docs).
3. Produce a single PR-ready change set.

**Checkpoint:** Concrete diff list before any edits.

#### Task 2.2: Sweep `@me` from examples and help text

**Files:**
- Modify: all `cli/commands/card/**/*.ts` files with `@me` in `examples` arrays or `usage.details`/`description`.
- Modify: `docs/cli-quickref.md`
- Modify: matched `.md` files in `docs-docusaurus/docs/`.

**Steps:**

1. Replace `@me` with `@your-handle` (the literal placeholder convention used by `gh`, `npm scope`, etc.).
2. For prose like "Scope to apply to an unscoped card name, such as @me." — rewrite to "Scope to apply to an unscoped card name, such as `@your-handle`. drwn auto-derives this from your GitHub identity on first use."
3. Re-run `grep -rn '@me' cli/ docs/ docs-docusaurus/` and confirm zero hits outside tests/fixtures.

**Checkpoint:** Zero `@me` in user-visible help text and docs.

#### Task 2.3: Add `resolveDefaultAuthoringScope` helper

**Files:**
- Create: `cli/core/authoring-scope.ts`
- Test: `test/core-authoring-scope.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test } from "bun:test";
import { deriveAuthoringScopeFromProbeResults } from "../cli/core/authoring-scope";

describe("deriveAuthoringScopeFromProbeResults", () => {
  test("uses gh api user .login when present", () => {
    expect(deriveAuthoringScopeFromProbeResults({ ghLogin: "junggyubae" })).toBe("@junggyubae");
  });

  test("falls back to github.user from git config", () => {
    expect(deriveAuthoringScopeFromProbeResults({ ghLogin: null, githubUser: "junggyu" })).toBe("@junggyu");
  });

  test("falls back to local-part of email when handle-like", () => {
    expect(
      deriveAuthoringScopeFromProbeResults({ ghLogin: null, githubUser: null, gitEmail: "remy@example.com" }),
    ).toBe("@remy");
  });

  test("returns null when nothing usable", () => {
    expect(deriveAuthoringScopeFromProbeResults({ ghLogin: null, githubUser: null, gitEmail: null })).toBeNull();
  });

  test("rejects email local-part with disallowed characters", () => {
    expect(
      deriveAuthoringScopeFromProbeResults({ ghLogin: null, githubUser: null, gitEmail: "first.last+work@x.com" }),
    ).toBeNull(); // we don't sanitize; we just refuse
  });

  test("normalizes to lowercase", () => {
    expect(deriveAuthoringScopeFromProbeResults({ ghLogin: "JunggYUBae" })).toBe("@junggyubae");
  });
});
```

**Step 3: Implement**

```ts
// cli/core/authoring-scope.ts
// ABOUTME: Derives a default authoring scope (@<github-handle>) for `drwn card new`.
// ABOUTME: Pure derivation; probing of `gh`/`git config` happens in a separate function for testability.

const SCOPE_HANDLE = /^[a-z0-9-]+$/;

export interface AuthoringScopeProbeResults {
  ghLogin: string | null;
  githubUser?: string | null;
  gitEmail?: string | null;
}

export function deriveAuthoringScopeFromProbeResults(probe: AuthoringScopeProbeResults): string | null {
  const candidates = [
    probe.ghLogin,
    probe.githubUser ?? null,
    extractEmailLocalPart(probe.gitEmail ?? null),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.toLowerCase();
    if (SCOPE_HANDLE.test(normalized)) return `@${normalized}`;
  }
  return null;
}

function extractEmailLocalPart(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return null;
  return email.slice(0, at);
}

// Separate side-effecting probe so tests can inject results.
export interface AuthoringScopeProbeOpts {
  runGh?: () => Promise<string | null>;
  runGit?: (args: string[]) => Promise<string | null>;
}

export async function probeAuthoringScope(opts: AuthoringScopeProbeOpts = {}): Promise<AuthoringScopeProbeResults> {
  const ghLogin = (await opts.runGh?.()) ?? null;
  if (ghLogin) return { ghLogin, githubUser: null, gitEmail: null };

  const githubUser = (await opts.runGit?.(["config", "--global", "github.user"])) ?? null;
  if (githubUser) return { ghLogin: null, githubUser, gitEmail: null };

  const gitEmail = (await opts.runGit?.(["config", "--global", "user.email"])) ?? null;
  return { ghLogin: null, githubUser: null, gitEmail };
}
```

A separate small Bun-spawn wrapper handles the actual invocation of `gh api user -q .login` and `git config ...`:

```ts
// cli/core/authoring-scope-probes.ts
import { spawnSync } from "node:child_process";

export async function defaultProbeGh(): Promise<string | null> {
  try {
    const r = spawnSync("gh", ["api", "user", "-q", ".login"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch { /* gh missing; ignore */ }
  return null;
}

export async function defaultProbeGit(args: string[]): Promise<string | null> {
  try {
    const r = spawnSync("git", args, { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch { /* git missing; very unusual */ }
  return null;
}
```

**Step 4: Run, green.**

**Checkpoint:** Pure derivation tested. Probing is isolated and injectable.

#### Task 2.4: Wire auto-derive into `drwn card new`

**Files:**
- Modify: `cli/commands/card/new.ts`
- Modify: `cli/core/card-store.ts` (`createCardSource` should optionally accept `defaultScope` for non-interactive paths)
- Test: `test/commands-card-new-autoderive.test.ts`

**Step 1: Failing tests**

```ts
// pseudo
test("uses saved authoring.scope when present", async () => { /* ... */ });
test("probes and proposes a scope when authoring.scope is unset and shell is interactive", async () => {
  // mock probe to return @junggyu; assert prompt shown with default; assert scope persisted on accept
});
test("falls back to error in non-interactive shell when no saved scope and no probe result", async () => { /* ... */ });
test("respects explicit --scope override regardless of probe", async () => { /* ... */ });
```

**Step 3: Implement**

In `cli/commands/card/new.ts`, after `readMachineConfig`:

```ts
const explicit = this.scope;
let scope = explicit ?? machine.authoring?.scope ?? null;

if (!scope) {
  const stdinTTY = process.stdin.isTTY === true;
  const probe = await probeAuthoringScope({ runGh: defaultProbeGh, runGit: defaultProbeGit });
  const derived = deriveAuthoringScopeFromProbeResults(probe);

  if (!derived) {
    this.context.stderr.write(
      "Unscoped card names require --scope or a saved authoring.scope. Couldn't derive one from `gh` or `git config`.\n",
    );
    return 1;
  }

  if (stdinTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const ans = (await rl.question(`Use ${derived} as your default card scope? [Y/n] `)).trim().toLowerCase();
      if (ans === "" || ans === "y" || ans === "yes") {
        scope = derived;
      } else {
        this.context.stderr.write("Cancelled. Re-run with --scope <your-handle>.\n");
        return 1;
      }
    } finally {
      rl.close();
    }
  } else {
    // Non-interactive: don't silently auto-derive. Print a clear hint and exit.
    this.context.stderr.write(
      `Unscoped card names require --scope. Detected ${derived} from your git/gh identity but won't auto-set in non-interactive mode.\n`,
    );
    return 1;
  }
}
```

Note: persisting the derived scope to `machine.authoring.scope` should happen via the existing `createCardSource` codepath (it already persists when `options.scope` is provided — `cli/core/card-store.ts:236-240`).

**Step 4: Tests green; manual TTY check.**

**Checkpoint:** First-run users get a real handle as their default scope; CI users get a precise error.

#### Task 2.5: Update `--scope` flag help

**Files:**
- Modify: `cli/commands/card/new.ts:36-38`

**Steps:**

1. Replace `description: "Scope to apply to an unscoped card name, such as @me."` with `description: "Scope to apply to an unscoped card name (e.g., @your-handle). Auto-derived on first use from gh / git config."`.

**Checkpoint:** Help text reflects the new behavior.

#### Phase 2 acceptance

- [ ] No `@me` strings remain in CLI examples, help text, or user-facing docs.
- [ ] `drwn card new <name>` with `gh` authenticated derives the user's GitHub login and prompts to use it.
- [ ] Non-interactive runs with no saved scope exit 1 with a clear hint.
- [ ] Existing users with a saved `machine.authoring.scope = "@me"` continue to work (no migration shimmed; we don't break them, but the convention is now off).

---

### Phase 3 — Issue 3: README compaction + docs concepts migration

**Goal:** Cut the README to ≤60 lines, after moving "Disciplines" and "Safety model" into the docs site.

**Why this order:** Polish, but should land before any external promotion. Prerequisite docs additions need to land first so we don't lose content.

#### Task 3.1: Write `docs/concepts/disciplines.md`

**Files:**
- Create: `docs-docusaurus/docs/concepts/disciplines.md`

**Steps:**

1. Move the six-commitment list from `README.md:41-52` verbatim.
2. Add one paragraph of context per commitment explaining the operational consequence (1-2 sentences each).
3. Add front-matter `sidebar_position`, `sidebar_label`, `description` matching neighbors in `docs/concepts/`.
4. Run `bun run docs:build` locally; verify rendering.

**Checkpoint:** Page renders cleanly; linkable.

#### Task 3.2: Write `docs/concepts/safety-model.md`

**Files:**
- Create: `docs-docusaurus/docs/concepts/safety-model.md`

**Steps:**

1. Move the safety-model bullets from `README.md:128-137` verbatim.
2. Add the rationale block (the "preview-first, doctor is report-only" philosophy).
3. Cross-link to `docs/troubleshooting/reading-doctor.md`.
4. Run `bun run docs:build`.

**Checkpoint:** Page renders cleanly.

#### Task 3.3: Cross-link from `docs/intro.md`

**Files:**
- Modify: `docs-docusaurus/docs/intro.md`

**Steps:**

1. Add a "Core ideas" or "How drwn thinks" section linking to:
   - `./concepts/disciplines.md`
   - `./concepts/safety-model.md`
   - existing `./concepts/cards.md`, `./concepts/local-store.md`, `./concepts/layered-model.md`.

**Checkpoint:** Intro now surfaces the migrated content as part of the docs IA.

#### Task 3.4: Trim README

**Files:**
- Modify: `README.md`

**Steps:**

1. Replace contents with a sketch like:

   ```markdown
   <p align="center">
     <img src="./docs/assets/darwinian-harness-logo.png" alt="Darwinian Harness" width="120" height="120" />
   </p>

   # darwinian-harness

   A local meta-harness for AI agent tools — a CLI (`drwn`) that organizes the
   skills, MCP servers, extensions, defaults, project overlays, and downstream
   tool state surrounding the agents you already use.

   The package is `darwinian-harness`. The command is `drwn`.

   ## Install

       npm install -g darwinian-harness
       drwn status

   ## First run

       cd /path/to/project
       drwn init
       drwn write --dry-run
       drwn write

   ## Learn more

   - **Docs:** [docs.darwiniantools.com](https://docs.darwiniantools.com)
     — concepts, getting-started paths, guides, troubleshooting, CLI reference.
   - **Disciplines that shape the design:** [docs/concepts/disciplines](https://docs.darwiniantools.com/concepts/disciplines)
   - **Safety model:** [docs/concepts/safety-model](https://docs.darwiniantools.com/concepts/safety-model)
   - **CLI quick reference:** [`docs/cli-quickref.md`](./docs/cli-quickref.md)
   - **Architecture (contributors):** [`.ai/knowledges/10_drwn-cli-architecture.md`](./.ai/knowledges/10_drwn-cli-architecture.md)
   - **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md)

   ## Skills source repo

   The broader skill library lives at
   [`darwinian-harness-skills`](https://github.com/remyjkim/darwinian-harness-skills),
   added here as a git submodule. Clone with `--recurse-submodules`, or run
   `git submodule update --init --recursive` after the fact.
   ```

2. Run `bun run docs:build` — confirm no broken links from the README's docs URLs (the docs build won't catch external README links; spot-check manually).
3. Run `wc -l README.md` to confirm ≤60 lines.

**Checkpoint:** README is short and link-heavy; no content is lost (it lives in docs).

#### Task 3.5: Update README-readiness test if any

**Files:**
- Check: `test/docs-readiness.test.ts`

**Steps:**

1. The test currently checks certain sections in `README.md`. Update its expectations to match the new trimmed README (or delete obsolete assertions).

**Checkpoint:** `bun test` clean.

#### Phase 3 acceptance

- [ ] `wc -l README.md` ≤ 60.
- [ ] `docs/concepts/disciplines.md` and `docs/concepts/safety-model.md` exist, render in `bun run docs:build`, and are linked from `docs/intro.md`.
- [ ] README still pitches the product and gets a brand-new user to their first command.
- [ ] `bun test` clean.

---

## Acceptance Criteria (whole task)

- [ ] All three phases shipped, each in its own PR.
- [ ] `bun test`, `bun run typecheck`, `bun run docs:build` all green at each phase boundary.
- [ ] No new npm runtime dependencies.
- [ ] Junggyu's three `[RDecision]` items can be closed with a link to the relevant PR each.

## Testing Strategy

- Unit: each new helper has a focused test with injected deps (no live network, no shelling out in CI).
- Integration (manual): Phase 1 ends with a real `drwn init` against a clean home dir. Phase 2 ends with a real `drwn card new` on a machine with `gh` configured.
- CI: existing `bun test` suite picks up all unit additions.

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Removing `DEFAULT_COMMUNITY_CATALOG_URL` constant breaks a downstream importer we missed | Low | Medium | Keep the export deprecated for one release; `grep` for imports before deleting (Task 1.6). |
| `gh` CLI absent on user's machine | High | Low | Soft probe with try/catch; fall through to `git config` and email local-part. |
| User's email local-part isn't a valid GitHub handle | Medium | Low | We only accept local-parts matching `^[a-z0-9-]+$`; otherwise we exit with a clear hint. |
| `gh api user` succeeds with a different account than the user expects (multi-account `gh`) | Medium | Medium | Interactive confirmation prompt before persisting. |
| Trimming README loses content important to npm.js viewers | Medium | Low | README still has pitch + install + first run; npm.js viewers can click through to docs. |
| Docs site build breaks on new concept pages | Low | Medium | `bun run docs:build` is part of each phase's exit criteria. |
| Existing tests pin `@me` strings in CLI output | Medium | Low | Update test fixtures during Phase 2 sweep; tests should pin behavior, not example strings. |

## Notes

- Sequencing: ship Phase 1 first (smallest, highest user impact). Phase 2 and Phase 3 can run in parallel after that, but Phase 2 is correctness-critical and should ship before any external announcement that recommends `drwn card publish` to new users.
- Open questions from `analyses/55_junggyu-review-rdecision-fix-strategies.md` that this plan resolves implicitly:
  - **Q 1.1** ("keep `@me` as a valid local-only scope or forbid?") — this plan keeps it *valid* but stops *recommending* it. Users with saved `@me` continue to work; we don't migrate.
  - **Q 1.2** ("auto-derive in non-interactive shells?") — **No.** Non-interactive falls back to the existing error with a clearer hint.
  - **Q 1.3** ("`gh` hard dependency?") — **Soft probe.** Plan handles missing `gh` cleanly.
  - **Q 2.1** ("who owns the catalog?") — **Curation Labs**, per repo location.
  - **Q 2.2** ("separate `@curation-labs` catalog?") — **Not yet.** Single `@community` for now; can split later.
  - **Q 2.3** ("treat unreachable network as expected absence?") — **No special case.** The fail-soft warning stays; with the correct URL, reachability is the norm.
  - **Q 3.x** — All addressed by Phase 3 choices.
- Issue 4 (landing-page button) remains out of scope. If post-deploy review still flags it, file a small PR against `darwinian-harness-landing` to repoint the anchor at a docs URL.
- Mark this plan's Status as `In Progress` when Phase 1 starts, and add a `35_completion_*` summary per `rules/00_docs_usage.md` after all three phases ship.
