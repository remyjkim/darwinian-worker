# Junggyu Review — [RDecision] Fix Strategies

**Date**: 2026-06-03
**Status**: Draft
**Author**: Claude + Remy
**References**: [https://app.notion.com/p/curation-labs/Junggyu-Review-Issues-of-Darwinian-Harness-cli-docs-skills-etc-374f1fbef8c2801dbbf5f0cb80363313, cli/commands/card/new.ts, cli/commands/card/publish.ts, cli/commands/init.ts, cli/core/card-catalog.ts, cli/core/card-store.ts, README.md, /Users/pureicis/dev/darwinian-harness-landing/src/sections/Hero.tsx, /Users/pureicis/dev/darwinian-harness-landing/src/sections/CatalogSection.tsx, /Users/pureicis/dev/darwinian-harness-landing/src/routes/Landing.tsx]

---

## Executive Summary

Four review items in Junggyu's Sprint-29 review notes carry an `[RDecision]` flag. They span three repositories: `darwinian-harness` (the CLI + docs), `darwinian-harness-landing` (the marketing site), and the docs site at `docs.darwiniantools.com` (Docusaurus subtree of the CLI repo). Each item below presents the root cause as verified against current source, then 2–4 fix options with concrete trade-offs and a recommended path.

Issue inventory:

1. **`@me/` scope collides when cards are shared publicly.** Cards published under `@me/foo` retain the literal `@me` scope when others clone them, creating per-machine namespace collisions.
2. **`drwn init` prints a noisy 404 trying to register the default community catalog.** The hardcoded URL `https://github.com/darwinian-harness/cards-catalog.git` does not exist upstream.
3. **README is judged too long.** 166 lines; significant content overlap with `docs.darwiniantools.com`.
4. **Landing-page "How it works" button has no link** (per the reviewer). In the current source the anchor exists (`#catalog`); the most likely cause is a deploy lag or a different reviewer expectation.

None of the four are deeply intertwined; each can ship independently. Suggested order is item 2 (highest noise-to-fix ratio), then item 1 (correctness for public sharing), then items 3 and 4 (polish).

---

## Context

Junggyu's review covers user-visible drwn surfaces from the perspective of a first-time external developer: install the CLI, run `drwn init`, follow the docs to author and publish a card, look at the marketing site. The `[RDecision]` tag marks items where Junggyu wants the maintainers (us) to pick the fix strategy rather than commit to a specific implementation in the review.

Each item below is reduced to: what the user sees, what the code actually does, why it goes wrong, and the option space for a fix. Recommendations are leading proposals, not commitments — open questions are flagged for explicit sign-off.

---

## Issue 1: `@me/` scope collides on public publish

### What the user sees

Junggyu's note:

> Current situation: Your card is named `@me/gif-creater@0.1.0` (personal scope). Each person has their own `@me/` scope locally. But if others clone your public card, it will also be named `@me/gif-creater` in their local store. The problem: If someone else also has a card called `@me/gif-creater@0.1.0`, there could be confusion or conflicts when managing cards locally. Best practice for public cards: use a team/org scope like `@junggyubae/gif-creater` or `@curation-labs/gif-creater`.

### Investigation

The CLI code does **not** hardcode `@me` as a default scope. In `cli/core/card-store.ts:231`:

```ts
if (isCardUnscopedName(options.name) && !options.scope) {
  throw new Error("Unscoped card names require --scope or machine authoring.scope");
}
```

Scope is required, either via `--scope @whatever` or via a previously persisted `machine.authoring.scope` in `~/.agents/drwn/machine.json`. The first `--scope` value the user supplies is persisted as their default (`card-store.ts:236-240`).

Where does `@me` come from, then? **Every example in the help text uses `@me`**:

- `cli/commands/card/new.ts:23-25` — examples show `--scope @me`, `@me/backend`, `@me/project-harness`.
- Same convention in `card show`, `card validate`, `card apply`, `card publish`, `card add`, `card source set`, `card source doctor`, etc.

A user following the docs runs `drwn card new gif-creater --scope @me`. The CLI persists `@me` to `machine.authoring.scope`. From that point on, every card they author defaults to `@me/...`. When they `drwn card publish` and push the resulting repo, the manifest carries the literal string `@me/gif-creater`. Another developer who clones and installs lands the card at `@me/gif-creater` on their machine, where it collides with their own `@me/...` cards.

So this is a **convention problem manifested through documentation**, not a runtime default. The runtime constraint is "scope is required"; the documented teaching path nudges everyone toward the same placeholder.

### Option space

#### Option A — Replace `@me` in all docs with a username placeholder

**What:** Sweep `@me` out of every `examples` array, every Docusaurus page, every CLI quickref entry. Use a clearly-placeholder name like `@your-handle` or `@<your-github-handle>`, and in the most prominent setup path show the literal `@github-username` form.

**Pros:**
- One-PR fix with zero behavior change.
- The CLI's current "scope is required" check naturally surfaces the right error message ("Unscoped card names require `--scope` or `machine authoring.scope`") — the docs just stop priming the user with the wrong example.
- Easiest to roll back.

**Cons:**
- Doesn't help users who've already saved `@me` in `machine.authoring.scope` (silent baggage).
- Relies on humans reading docs carefully; "your-handle" is still a placeholder that someone might copy literally.
- Doesn't prevent the same mistake from a different angle (e.g., a tutorial blog post).

#### Option B — Auto-derive a default scope at first `drwn card new`

**What:** When `machine.authoring.scope` is unset and `--scope` is not provided, attempt to derive a sensible default:

1. `gh api user -q .login` if `gh` is on PATH and authenticated.
2. `git config --global user.email` → take the local-part if it matches a GitHub handle pattern.
3. `git config --global github.user`.
4. Fall back to the current error.

Print what was chosen and require explicit confirmation in an interactive shell; non-interactive falls back to the error. Persist as `machine.authoring.scope` after confirmation.

**Pros:**
- Removes the conventional trap at its source.
- Plays nicely with users who already have `gh` configured.
- Zero impact on users who pass `--scope` explicitly.

**Cons:**
- Adds a network call (`gh api`) or env probe — needs careful error handling.
- The derivation rules will be wrong sometimes (machine accounts, shared workstations).
- Auto-confirming in non-interactive scripts could leak personal handles into shared CI.

#### Option C — Publish-time guard: refuse or warn when publishing under `@me/*`

**What:** In `cli/core/card-store.ts` `publishCard` (or `cli/commands/card/push.ts` `cardPush`), inspect the manifest's scope. If it equals `@me` and the user is pushing to a remote (not just a local publish), print a clear warning or refuse outright:

```
Cards under the @me/* scope are local-only by convention. Rename this card
under a stable scope before publishing publicly:
  drwn card rename @me/gif-creater @junggyu/gif-creater
```

Optionally allow `--allow-me-scope` to bypass.

**Pros:**
- Catches the problem at the exact moment it becomes dangerous (going public), not before.
- Reframes `@me` as a meaningful local-only namespace (which is what most users actually want it to be).

**Cons:**
- Requires a `drwn card rename` command that doesn't currently exist (more surface area).
- Without rename, the user has to manually edit the manifest and re-create the bare repo — a worse UX than the warning suggests.
- Risks teaching users to just pass `--allow-me-scope` reflexively.

#### Option D — Treat `@me` as a runtime alias that resolves to the user's real scope

**What:** Keep `@me` as a valid scope in source and on disk, but resolve it transparently at materialization time using a configured `machine.authoring.identity` (the user's GitHub handle). Cards stored locally under `@me/foo` would be exported on `drwn card push` as `@junggyu/foo`, and vice versa on `drwn card fetch`.

**Pros:**
- Lets users keep authoring under the friendly `@me` placeholder.
- Single mental model: `@me` always means "the current author."

**Cons:**
- High implementation cost — every place that touches `name` (manifest, lock file, catalog index, search, integrity hash) needs alias resolution.
- Lockfile integrity becomes fuzzy: did `@me/foo@1.0.0` resolve from the same upstream you signed up for?
- Breaks the "filesystem is the API" discipline.

### Recommendation

Ship **A + B** together, and stage **C** behind a follow-up:

- **A** removes the misleading convention. Cheap, immediate.
- **B** stops the same trap from rebuilding through copy-paste tutorials. Modest effort; needs interactive prompt and `gh`/`git` probing logic.
- **C** is the right correctness backstop but blocks on `drwn card rename`, which is its own task. File it as a follow-up rather than gate this fix on it.

Avoid **D**. Aliasing breaks lockfile integrity guarantees that the rest of the system leans on.

### Open questions for Issue 1

| Question | Why it matters |
|---|---|
| Do we want `@me` to remain a valid local-only scope after the docs sweep? | Affects whether we make `@me` a *forbidden* scope or just *discouraged*. |
| Should auto-derivation be enabled by default in CI / non-interactive shells? | Risk of leaking handles into shared bots. Recommend disabling in non-interactive mode. |
| Is `gh` a hard dependency, or a soft probe? | Soft probe is correct; the CLI shouldn't fail when `gh` is missing. |

---

## Issue 2: `drwn init` prints a 404 trying to register the default community catalog

### What the user sees

```
jgbae@Macca darwinian-harness % drwn init
Enable Parallel extension for this project? [y/N] n
Enable Beads extension for this project? [y/N] n
drwn: could not register default community catalog (https://github.com/darwinian-harness/cards-catalog.git): git clone --bare failed for https://github.com/darwinian-harness/cards-catalog.git: Cloning into bare repository ...
remote: Repository not found.
fatal: repository 'https://github.com/darwinian-harness/cards-catalog.git/' not found
Created project config: /Users/jgbae/Projects/curation-labs/darwinian-harness/.agents/drwn/config.json
Warning: .gitignore appears to exclude .agents; this config may not be shared with collaborators.
```

The command **succeeds** — config is written — but the eight-line failure block looks alarming and is the first thing a new user sees.

### Investigation

Two specific code sites:

`cli/core/card-catalog.ts:66-67`:

```ts
export const DEFAULT_COMMUNITY_CATALOG_URL =
  "https://github.com/darwinian-harness/cards-catalog.git";
```

`cli/core/card-catalog.ts:199-215`:

```ts
export async function ensureDefaultCommunityCatalog(agentsDir: string): Promise<void> {
  const index = await loadCardCatalogIndex(agentsDir);
  if (index.catalogs.some((entry) => entry.url === DEFAULT_COMMUNITY_CATALOG_URL)) {
    return;
  }
  try {
    await addCardCatalog(agentsDir, DEFAULT_COMMUNITY_CATALOG_URL);
  } catch (error) {
    // Fail-soft: the default catalog may not be reachable or may not yet exist
    // upstream. Don't break `drwn init` over it.
    process.stderr.write(
      `drwn: could not register default community catalog (${DEFAULT_COMMUNITY_CATALOG_URL}): ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
  }
}
```

`cli/commands/init.ts:56-58` already provides an opt-out flag:

```ts
noDefaultCatalogs = Option.Boolean("--no-default-catalogs", false, {
  description: "Skip pre-registering the default community card catalog.",
});
```

So the architecture already anticipates "default catalog might not be there." The `try`/`catch` correctly preserves init success. The issue is purely the **noise** of the error block and the fact that **the upstream repo doesn't exist** — every user on every machine hits this on first init.

A `grep` of the repository confirms the URL is hardcoded only in `card-catalog.ts:67` (and string-referenced in `init.ts` via `ensureDefaultCommunityCatalog`). There is no entry in `registry/config.json` driving this; it's purely a code constant.

### Option space

#### Option A — Create the upstream `darwinian-harness/cards-catalog` repo

**What:** Out-of-band action. Create the GitHub repo with a minimal `catalog.json`:

```json
{
  "catalogVersion": 1,
  "scope": "@darwinian-harness",
  "description": "Default community card catalog",
  "cards": []
}
```

**Pros:**
- Real fix — the default catalog now exists.
- All existing CLIs in the wild immediately stop emitting the error.
- Zero code change to `drwn`.

**Cons:**
- Requires owning a curation discipline for that repo (PRs adding new community cards).
- An empty catalog gives users a slightly confusing search experience until cards are added.
- Doesn't address the future case where the repo might be moved or renamed.

#### Option B — Default the opt-out flag to ON; require `--default-catalogs` to register

**What:** Change `init.ts` so `noDefaultCatalogs` defaults to `true`. Users who want the community catalog ask for it explicitly. The error path disappears for everyone.

**Pros:**
- Eliminates the user-visible failure immediately, no upstream repo needed.
- Aligns with the broader drwn philosophy of "explicit > implicit."

**Cons:**
- Most users will never opt in, and a "community catalog" that nobody uses defeats the discoverability goal.
- The guided init flow could prompt the user, but then we're trading a fail-soft warning for an interactive question — different annoyance.

#### Option C — Silent skip on 404 / unreachable

**What:** In `ensureDefaultCommunityCatalog`, distinguish "repository not found" (HTTP 404 from git) and network errors from genuinely-actionable failures. Suppress the warning in the expected cases; keep it for the unexpected ones.

```ts
const message = error instanceof Error ? error.message : String(error);
const isExpectedAbsence =
  message.includes("Repository not found") ||
  message.includes("Could not resolve host");
if (!isExpectedAbsence) {
  process.stderr.write(
    `drwn: could not register default community catalog (${DEFAULT_COMMUNITY_CATALOG_URL}): ${message}\n`,
  );
}
```

**Pros:**
- Zero user-visible change; init becomes quiet.
- Other failure modes (corrupt clone, permission issue) still surface.

**Cons:**
- Hides the symptom rather than fixing the cause; if the default URL is wrong, nobody finds out.
- Substring matching on git error messages is brittle.

#### Option D — Make the default catalog URL configurable, and ship `null` as the registry default

**What:** Move the default URL into `registry/config.json`:

```json
{
  "version": 1,
  "defaults": {
    "communityCatalogUrl": null
  },
  ...
}
```

`ensureDefaultCommunityCatalog` reads from config; when `null` or unset, the function returns immediately. Users (or downstream forks) override locally.

**Pros:**
- The "default" becomes data, not code — easier to change later without a CLI release.
- Forks/distributions can ship their own default URL.
- No external dependency.

**Cons:**
- Slightly more code in the resolver path.
- Defers the value of having a default catalog until someone configures one — same UX as Option B until then.

### Recommendation

Ship **A** (create the repo) as the strategic fix, and ship **C** (silent skip on expected absences) as the tactical fix that protects users today and tomorrow. **D** is a nice follow-up if/when we want downstream forks to swap defaults without forking code.

Skip **B**. The point of a community catalog is discoverability; making it opt-in collapses that.

Implementation order:

1. **PR 1 (CLI):** silent-skip on 404/unreachable. Lands quickly, removes user-visible noise everywhere immediately.
2. **PR 2 (external):** create `darwinian-harness/cards-catalog` repo with minimal `catalog.json`. Once live, even fresh installs without PR 1 stop seeing the error.
3. **PR 3 (CLI, optional, later):** registry-config-driven default URL.

### Open questions for Issue 2

| Question | Why it matters |
|---|---|
| Who owns curation of `darwinian-harness/cards-catalog`? | Determines who reviews PRs adding cards. |
| Do we want a separate `@curation-labs` catalog alongside the community one? | Affects scope of the default registration. |
| Should we treat "unreachable network" the same as "repo not found"? | Failure mode for offline `drwn init`. |

---

## Issue 3: README is too long; redirect detail to docs

### What the user sees

Junggyu: "README is too long. Give a more compact README and for detailed information, redirect to Docs."

### Investigation

`README.md` is 166 lines structured roughly as:

| Section | Lines | Already covered in docs site? |
|---|---|---|
| Hero / pitch | 1–22 | Partly (intro.md) |
| Why this exists | 24–39 | Yes (intro.md, getting-started/overview) |
| Disciplines (six load-bearing commitments) | 41–52 | Should be in `concepts/` — not currently |
| Requirements | 54–59 | Yes (getting-started/installation.md) |
| Install | 61–79 | Yes |
| First taste | 81–107 | Yes (getting-started/first-run.md) |
| Skills source repo (submodule) | 109–126 | Partly (`guides/use-darwinian-harness-skills`) |
| Safety model | 128–137 | Should be in `concepts/` — not currently |
| Documentation links | 139–151 | n/a |
| Contributing | 153–166 | Partly (CONTRIBUTING.md) |

So roughly **90 lines (54%)** duplicate the docs site. The "Disciplines" and "Safety model" sections (~25 lines) are good content but currently not mirrored in docs — they would need a destination.

The docs site has a rich structure under `docs-docusaurus/docs/`: `concepts/`, `getting-started/`, `guides/`, `troubleshooting/`, `reference/`.

### Option space

#### Option A — Aggressive cut to ≤50 lines

**What:** README reduced to: 2-line pitch, install one-liner, three-command first run, list of doc links. Everything else moves to docs:

- "Disciplines" → new `docs/concepts/disciplines.md`
- "Safety model" → new `docs/concepts/safety-model.md`
- "Skills source repo" → expanded `docs/guides/use-darwinian-harness-skills.md`

```markdown
# darwinian-harness

`darwinian-harness` is a local meta-harness for AI agent tools — a CLI
(`drwn`) that organizes skills, MCP servers, extensions, defaults, project
overlays, and downstream tool state.

## Install

    npm install -g darwinian-harness
    drwn status

## First run

    drwn init
    drwn write --dry-run
    drwn write

## Docs

- Concepts, getting started, guides: https://docs.darwiniantools.com
- CLI reference: ./docs/cli-quickref.md
- Architecture (contributors): ./.ai/knowledges/10_drwn-cli-architecture.md
- Contributing: ./CONTRIBUTING.md
```

**Pros:**
- Honors Junggyu's intent directly.
- README becomes a launch pad rather than a manual.
- Forces the docs site to be the single source of truth.

**Cons:**
- Requires writing/moving "Disciplines" and "Safety model" content into docs first (or losing them).
- README-on-npm becomes thin (npmjs.com page may feel sparse to first-time visitors).

#### Option B — Collapsible "More" sections via `<details>`

**What:** Keep sections, but wrap everything past "First taste" in `<details>` blocks. Top remains compact; deep dives stay one click away.

**Pros:**
- Zero content loss.
- Visually compact for skimmers; complete for archivists.

**Cons:**
- npm.js doesn't render `<details>` in some viewers.
- Doesn't satisfy "redirect to Docs" — content still lives in two places.

#### Option C — Two-file split

**What:** `README.md` becomes the elevator pitch + install. A new `OVERVIEW.md` (or expanded `docs/cli-quickref.md`) carries the deeper context for repo browsers.

**Pros:**
- Repo-browser experience keeps a deep file; landing-page experience is short.

**Cons:**
- Yet another README-like file. We already have `docs/cli-quickref.md`, the docs site, and `.ai/knowledges/10_drwn-cli-architecture.md`. Adding another splits attention.

#### Option D — Status quo + better TOC

**What:** Keep the current 166-line README, add a clickable TOC at the top for navigation.

**Pros:**
- Minimal effort.

**Cons:**
- Doesn't address Junggyu's actual concern (perceived length).

### Recommendation

Ship **A** with the prerequisite docs additions. Specifically:

1. Write `docs/concepts/disciplines.md` (move the six commitments verbatim, expand with one paragraph per commitment).
2. Write `docs/concepts/safety-model.md` (move the safety-model bullet list, add the rationale).
3. Update the README to the sketched ≤50-line shape, linking to those new pages.
4. Cross-link from `docs/intro.md` to the new concepts pages.

This satisfies the request, preserves content, and pushes us closer to "docs site is the canonical reference."

Reject **D**. It addresses the symptom (scrolling) without addressing the cause (duplication).

### Open questions for Issue 3

| Question | Why it matters |
|---|---|
| Is npm's rendered README an important surface for adoption? | If yes, the trimmed README should still pitch hard enough to convert. |
| Should we link to specific deep pages or just the docs root? | Specific links survive less well across reorganizations; root is more robust. |
| Does the trimmed README need a "What it harnesses" bullet list, or is that a docs-site concern? | Trade-off between skimmability and length. |

---

## Issue 4: Landing-page "How it works" button has no link

### What the user sees

Junggyu: "'How it works' button does not have link → [RDecision] Need to fix this."

### Investigation

The landing site lives in a separate repo: `/Users/pureicis/dev/darwinian-harness-landing` (deployed to `darwiniantools.com` via Cloudflare Pages per `wrangler.toml`). The current source has the link:

`src/sections/Hero.tsx:32-34`:

```tsx
<a className="btn btn-ghost" href="#catalog">
  How it works
</a>
```

And the target anchor exists in `src/sections/CatalogSection.tsx:12`:

```tsx
<section className="band catalog" id="catalog">
```

A test in `src/sections/__tests__/Hero.test.tsx:29` even asserts the anchor: `"points the 'How it works' link at #catalog"`. So **in source today, the link works**.

Recent landing commits (relevant excerpts from `git log`):

```
0dbbe57 fix(nav): drop the v1 - GA tag from the brand row
e163c25 docs(analyses): add landing redesign architecture, plans, and visual artifacts
6ef0b77 fix(hero): title-case the Automate Evolution headline
86bf7f8 feat(deploy): wire Cloudflare Pages and GitHub Actions CI/CD
974740b feat(landing): adopt catalog-first page flow
```

The "catalog-first" redesign (commit `974740b`) introduced `CatalogSection`. If Junggyu reviewed the site before this deployed, they would have hit a button pointing at a non-existent `#catalog` anchor (or at an older `#card` anchor that the redesign removed). The reference-HTML in the repo (`reference-html/Darwinian Harness.html:64`) actually has `href="#card"`, suggesting the pre-redesign target was `#card` — which would explain why a stale view would show a broken "How it works."

Two scenarios:

- **Scenario S1 (most likely):** Junggyu viewed the deployed version *before* `974740b` was published to Cloudflare Pages. The fix has already shipped to `main`; deployment lag explains the report.
- **Scenario S2:** Junggyu wants "How it works" to point somewhere richer than an in-page anchor — e.g., a dedicated docs page or a separate `/how-it-works` route.

### Option space

#### Option A — Verify the deploy and close as already-fixed

**What:** Confirm the production deployment of `darwiniantools.com` matches the post-`974740b` source. If yes, this is a deploy-lag artifact; respond to Junggyu confirming.

**Pros:**
- Zero engineering work if the deploy is already fresh.
- Aligns with reality (the link works in source).

**Cons:**
- If the deploy *is* stale, we still need a deploy fix; this option just reveals that.
- Doesn't address Scenario S2.

#### Option B — Repoint "How it works" to a docs page

**What:** Change `href="#catalog"` to `href="https://docs.darwiniantools.com/concepts/cards"` (or a dedicated "How it works" docs page if we create one). The Hero button becomes a deep link into the docs site.

**Pros:**
- Sends curious visitors to a structured, search-indexed walkthrough rather than an in-page scroll.
- Aligns with the "docs site is the canonical reference" direction from Issue 3.

**Cons:**
- Reduces in-page engagement metrics (people leave the marketing page sooner).
- Requires updating the Hero test that pins the anchor target.

#### Option C — Both: keep the anchor + add an arrow / secondary link to docs

**What:** Keep `#catalog` as the primary button. Add a small secondary "→ read the docs" link beside the CTA. Two destinations for two intents (skim in-page vs. dive deeper).

**Pros:**
- Doesn't sacrifice either audience.

**Cons:**
- Two CTAs in a Hero increase decision friction.
- The reviewer's note doesn't ask for this; might over-engineer.

#### Option D — Create a dedicated `/how-it-works` route on the landing site

**What:** New file `src/routes/HowItWorks.tsx`; route registered in `App.tsx`; "How it works" button navigates to that route. The route can carry the catalog + evolve + measure sections in a more focused composition.

**Pros:**
- A real destination that matches the button label.
- Lets us evolve the marketing message independently of the home page.

**Cons:**
- Significant content + SEO work to make the new page worthwhile.
- Likely overkill for a sprint review item.

### Recommendation

Start with **A** — confirm the deploy. If the deploy is current and the anchor scroll works in production, message back to Junggyu that this is a deploy-lag artifact and close. **If** the production page is current and Junggyu still considers the scroll insufficient, fall through to **B** as a small one-line change to repoint at the docs site.

Avoid **C** and **D** for now. They expand scope past the reviewer's complaint.

Implementation if **B** is needed:

```diff
- <a className="btn btn-ghost" href="#catalog">
+ <a className="btn btn-ghost" href="https://docs.darwiniantools.com/concepts/cards">
    How it works
  </a>
```

Update `src/sections/__tests__/Hero.test.tsx` correspondingly.

### Open questions for Issue 4

| Question | Why it matters |
|---|---|
| What is the current deployed commit on `darwiniantools.com`? | Determines whether A is sufficient. |
| Do we have a single "How it works" page on docs? | Determines the right target for B. |
| Should "How it works" open in a new tab if it points to docs? | Standard UX choice for cross-site links. |

---

## Cross-Cutting Recommendations

### Sequencing

| Order | Item | Why |
|---|---|---|
| 1 | Issue 2 — CLI silent-skip + create upstream catalog repo | Highest user-visible noise per fix-effort. Two PRs but small ones. |
| 2 | Issue 1 — Docs sweep `@me` → placeholder + scope auto-derive prompt | Real correctness fix for the public-publish flow. |
| 3 | Issue 3 — README compaction (plus the prerequisite `concepts/` pages) | Polish, but should land before any external announcement. |
| 4 | Issue 4 — Verify deploy; only repoint if necessary | Smallest engineering ask; may already be solved. |

### Items that don't need code changes

- Issue 2 step 2 (create upstream catalog repo) is an external Git/admin action.
- Issue 4 step 1 (verify deploy) is an ops check; may close the ticket without code.

### Non-`[RDecision]` items captured for awareness

The Notion page also flags several non-`[RDecision]` items the team should track separately:

- 🔴 "Tortoises grew their shells, island by island." (landing copy incoherence — birds have no notion).
- 🔴 Image block issue (Created Cards section).
- Multiple 🔵 opinion items (mermaid diagrams to add to docs, video, "Eighteen finches" verification, [03] Score+Rank → Evaluate copy change, [01] catalog suggestions screenshots).

These are deliberately out of scope for this doc but are worth converting into separate issues / Linear tickets so they don't get lost in the review page.

---

## Open Questions (rolled up)

| # | Question |
|---|---|
| 1.1 | Do we keep `@me` as a valid local-only scope or forbid it after the docs sweep? |
| 1.2 | Should auto-derivation run in non-interactive shells / CI? |
| 1.3 | Is `gh` a soft probe, or do we accept its absence as a no-op? |
| 2.1 | Who owns `darwinian-harness/cards-catalog` curation? |
| 2.2 | Do we want a separate `@curation-labs` catalog alongside the community one? |
| 2.3 | Should "unreachable network" be treated as expected absence too? |
| 3.1 | Is npm's rendered README an adoption-critical surface? |
| 3.2 | Link from trimmed README to specific docs pages or to the docs root? |
| 3.3 | Does the trimmed README need a "What it harnesses" bullet list? |
| 4.1 | What commit is currently deployed at `darwiniantools.com`? |
| 4.2 | Do we have (or want) a single "How it works" docs page? |

---

## Appendix

### Code citations

- `cli/commands/card/new.ts:23-25` — `@me` examples in CLI help.
- `cli/commands/card/new.ts:37` — `--scope` flag description mentioning `@me`.
- `cli/core/card-store.ts:231-233` — scope-required runtime check.
- `cli/core/card-store.ts:236-240` — scope persistence to `machine.authoring.scope`.
- `cli/commands/init.ts:56-58, 86-88` — `--no-default-catalogs` flag and the call to `ensureDefaultCommunityCatalog`.
- `cli/core/card-catalog.ts:66-67` — `DEFAULT_COMMUNITY_CATALOG_URL` constant.
- `cli/core/card-catalog.ts:199-215` — `ensureDefaultCommunityCatalog` fail-soft path.
- `README.md:1-166` — current README structure.
- `darwinian-harness-landing/src/sections/Hero.tsx:32-34` — `<a href="#catalog">How it works</a>`.
- `darwinian-harness-landing/src/sections/CatalogSection.tsx:12` — matching `id="catalog"`.
- `darwinian-harness-landing/src/sections/__tests__/Hero.test.tsx:29` — pins the anchor target in tests.
- `darwinian-harness-landing/reference-html/Darwinian Harness.html:64` — pre-redesign anchor `#card` (historical reference).

### Why no `darwinian-harness-skills` changes in this doc

The Notion review's `## Skill` section contains exactly one `[RDecision]` item (the `@me` collision, Issue 1 above). The other skill-section bullet ("update README when pushing to git") is tagged `[Junggyu] update skill` — Junggyu's own action item, not an `[RDecision]` for us. We treat that as out of scope and assume Junggyu will land it in `darwinian-harness-skills` directly.

### Note on numbering

This analysis uses number **55** because directory state at investigation time showed `54_knowledge-docs-audit.md` as the highest extant file. The earlier `56_drwn-cli-auth-target-architecture.md` and `57_drwn-cli-analyze-sessions-target-architecture.md` (referenced from a prior session) appear to have been relocated or archived; we did not attempt to recover them.
