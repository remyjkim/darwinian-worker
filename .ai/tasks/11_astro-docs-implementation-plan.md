# Astro Documentation Site Implementation Plan

> **For Claude/Codex:** Use superpowers:executing-plans to implement this plan task-by-task. Do not commit unless explicitly instructed.

**Goal:** Create a public-facing documentation site for `beginning-harness` using Astro (astro-nano pattern), forked from `mind-wallet/docs-astro`, deployed to Cloudflare Pages.

**Architecture:** `.ai/analyses/22_astro-docs-target-architecture.md`

**Tech Stack:** Astro 5, Tailwind CSS 3.4, MDX, TypeScript, Cloudflare Pages (wrangler).

---

## Evidence Base

- `/Users/pureicis/dev/mind-wallet/docs-astro/` — reference implementation to fork from
- `.ai/analyses/22_astro-docs-target-architecture.md` — target architecture
- `.ai/analyses/14_meta_harness_report.md` — source material for harness engineering page
- `README.md` — source material for all documentation content
- `.ai/knowledges/01_agents-cli-usage-guide.md` — supplementary content
- `.ai/knowledges/02_per-project-config-guide.md` — supplementary content

---

## Phase 1: Scaffold — Fork and Adapt Infrastructure

### Task 1.1: Copy docs-astro directory structure

Copy the entire `mind-wallet/docs-astro/` directory to `beginning-harness/docs-astro/`.

**Do not copy:**
- `node_modules/`, `.astro/`, `dist/` (build artifacts)
- `bun.lock` (regenerate fresh)
- `src/content/docs/*.md` (mind-wallet content — we write our own)

**Copy everything else:**
- `src/components/` (all 8 components)
- `src/layouts/PageLayout.astro`
- `src/pages/` (index.astro, docs/index.astro, docs/[...slug].astro)
- `src/content/config.ts`
- `src/styles/global.css`
- `src/lib/utils.ts`
- `src/types.ts`
- `src/env.d.ts`
- `src/consts.ts`
- `astro.config.mjs`
- `tailwind.config.mjs`
- `tsconfig.json`
- `package.json`
- `wrangler.toml`
- `public/favicon.svg` (placeholder — replace later)
- `.gitignore`

**Verification:** Directory exists at `docs-astro/` with expected file count.

### Task 1.2: Customize project metadata

Update these files with beginning-harness identity:

**`src/consts.ts`:**
```typescript
export const SITE: Site = {
  NAME: "beginning-harness",
  EMAIL: "contact@beginning-harness.dev",
};

export const HOME: Metadata = {
  TITLE: "Docs",
  DESCRIPTION: "beginning-harness documentation — guides and reference for the local meta-harness CLI.",
};

export const DOCS: Metadata = {
  TITLE: "Documentation",
  DESCRIPTION: "Guides and reference for using beginning-harness.",
};
```

**`astro.config.mjs`:**
- Change `site` to the Cloudflare Pages URL (use placeholder `https://beginning-harness.pages.dev` initially)

**`package.json`:**
- Change `name` to `"beginning-harness-docs"`

**`wrangler.toml`:**
- Change `name` to `"beginning-harness-docs"`
- Update `[env.production]` name to match

**Verification:** `grep -r "mindpass" docs-astro/src/` returns zero results.

### Task 1.3: Customize theming

**`tailwind.config.mjs`:**
- Change accent color from `#7bcfff` / `#4ab8f0` to a new color (decide with Remy)

**`src/components/Header.astro`:**
- No content changes needed (already references `SITE.NAME` dynamically)

**`src/layouts/PageLayout.astro`:**
- Uncomment the `<Header />` component to enable top navigation

**Verification:** Visual inspection — site loads with new accent color and visible header.

### Task 1.4: Install dependencies and verify build

```bash
cd docs-astro && bun install && bun run build
```

**Verification:** Build succeeds with zero errors. `dist/` directory is created.

---

## Phase 2: Landing Page

### Task 2.1: Write the landing page

Rewrite `src/pages/index.astro` with beginning-harness content. Structure:

1. **Hero section** — accent-colored "beginning-harness" heading, two-paragraph value prop, links to Claude Code / Codex / Cursor
2. **Install section** — three install paths (npm global, checkout, env-pointed) using `<Code>` component
3. **Key docs ArrowCards** — Getting Started, How Apply Works, CLI Reference, Per-Project Config
4. **What It Harnesses** — list of 7 categories
5. **More docs ArrowCards** — remaining pages auto-populated by order

**Data flow:** Same pattern as mind-wallet — `getCollection("docs")`, filter drafts, sort by order, select specific slugs for featured cards, auto-populate the rest.

**Verification:** `bun run dev` — landing page renders with all sections, ArrowCards link to correct slugs.

---

## Phase 3: Documentation Content

Write each page as a markdown file in `src/content/docs/`. Source material is primarily from `README.md`, adapted into standalone documentation prose (not copy-paste — rewrite for a docs audience).

### Task 3.1: Getting Started (`01-getting-started.md`, order: 1)

Content: Requirements (Bun 1.2+, Node.js, npm), three installation methods, quickstart flow (status → skills list → mcp list → apply --dry-run → apply), project-specific setup, non-interactive mode.

### Task 3.2: How Apply Works (`02-how-apply-works.md`, order: 2)

Content: The five-layer config model (packaged defaults → local library → user defaults → project overlay → downstream state), what `apply` changes on disk, run options (--dry-run, --mcp-only, --skills-only, --target), conservative apply philosophy.

### Task 3.3: CLI Reference (`03-cli-reference.md`, order: 3)

Content: Complete command catalog organized by category (general, MCP, skills), flags (--json, --dry-run), help command. Table or definition-list format for each command.

### Task 3.4: MCP Registry (`04-mcp-registry.md`, order: 4)

Content: Registry files (mcp-servers.json, config.json), user registry (~/.agents/library/mcp-servers.json), defaults (~/.agents/bgng/config.json), platform-provided entries, optional servers, per-target configuration.

### Task 3.5: Skill Library (`05-skill-library.md`, order: 5)

Content: Built-in skill directory structure (shared, claude-only, codex-only, experimental), curation flow (curate/uncurate), syncing behavior, package-backed skill bundles (add, list, show), distinction between added/curated/synced.

### Task 3.6: Extensions (`06-extensions.md`, order: 6)

Content: Extension concept, two current extensions (Parallel and Beads), Parallel setup (CLI + skills + optional MCP), Beads setup (CLI + project-scoped config), extension status and diagnostics, setup workflows.

### Task 3.7: Per-Project Config (`07-per-project-config.md`, order: 7)

Content: Project config creation and location, capabilities, discovery mechanism (walks upward from cwd), JSON schema with examples, extensions block, skills include/exclude behavior.

### Task 3.8: Diagnostics & Safety (`08-diagnostics.md`, order: 8)

Content: Doctor command usage and output categories (broken symlinks, stale links, MCP drift, missing config, project config issues), safety model (preview first, inspect, diagnose, curate, report-only cleanup), usage modes (packaged vs checkout vs env-pointed).

### Task 3.9: Why Harness Engineering? (`09-harness-engineering.md`, order: 9)

Content: New standalone page for the "audience C" curious developer. What harness engineering is, why agent reliability depends on harness quality (cite 6-10x performance swings from research), what a harness includes (skills, tools, verification, context), how beginning-harness implements these ideas. Accessible tone — not academic.

Source: `.ai/analyses/14_meta_harness_report.md` for research context, distilled into ~500-800 words.

**Verification for all content tasks:** `bun run build` succeeds. Each page renders correctly in `bun run dev`. Previous/Next navigation works across all 9 pages.

---

## Phase 4: Polish and Verify

### Task 4.1: Cross-page navigation check

Verify in dev server:
- All 9 doc pages render without errors
- Previous/Next links connect pages in correct order
- All ArrowCards on landing page link to correct pages
- "Back to home" link works from every doc page
- Back-to-top button appears on scroll
- Header nav works (home link, docs link)

### Task 4.2: Build and type-check

```bash
cd docs-astro && bun run build
```

This runs `astro check` (TypeScript) then `astro build` (static generation). Must pass with zero errors and zero warnings.

### Task 4.3: Verify no mind-wallet artifacts remain

```bash
grep -ri "mindpass" docs-astro/
grep -ri "mind-wallet" docs-astro/
grep -ri "x402" docs-astro/src/pages/
grep -ri "mppscan" docs-astro/
```

All should return zero results (x402/mppscan are mind-wallet-specific content that should not appear in beginning-harness pages).

Note: `09-harness-engineering.md` may reference external protocols in a general context — that's fine. The check is for leftover mind-wallet copy.

---

## Deferred (Not In Scope)

- Custom favicon design (use placeholder SVG)
- Custom domain setup (use Cloudflare Pages default URL)
- OG image generation (use default)
- Cloudflare Pages deployment (separate task after content is reviewed)
- Search functionality
- Dark mode
- Analytics integration
