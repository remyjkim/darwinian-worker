# Astro Documentation Site Target Architecture

**Date:** April 28, 2026

**Status:** Proposed

**Scope:** Define the target architecture for a public-facing documentation site for `beginning-harness`, built with Astro (astro-nano pattern), deployed to Cloudflare Pages, and forked from the existing `mind-wallet/docs-astro` codebase.

## Purpose

`beginning-harness` has comprehensive documentation in its README (600+ lines) and operator guides in `.ai/knowledges/`, but no standalone documentation site. A dedicated site improves discoverability, readability, and onboarding for both individual developers and team leads.

The mind-wallet project already has a proven astro-nano documentation site with polished components, animations, responsive layout, and Cloudflare Pages deployment. Forking that codebase avoids rebuilding infrastructure and lets us focus on content.

## Audiences

| Audience | What they need | Entry point |
|----------|---------------|-------------|
| Individual developers | Install, configure, use `bgng` with their agent tools | Landing page → Getting Started |
| Team leads / operators | Standardize agent harness config across a team | Landing page → How Apply Works → Per-Project Config |
| Curious developers | Understand why harness engineering matters | Landing page → Why Harness Engineering? |

## Fork Strategy

### Copy Verbatim (Generic Infrastructure)

These files require no changes — they are project-agnostic:

| Category | Files |
|----------|-------|
| Components | `ArrowCard.astro`, `BackToTop.astro`, `BackToPrev.astro`, `Container.astro`, `FormattedDate.astro`, `Link.astro` |
| Layout | `PageLayout.astro`, `Head.astro`, `Footer.astro` |
| Content schema | `src/content/config.ts` (title, description, date, order, draft) |
| Utilities | `src/lib/utils.ts`, `src/types.ts` |
| Styles | `src/styles/global.css` |
| Config | `tsconfig.json` |
| Pages | `src/pages/docs/index.astro` (redirect), `src/pages/docs/[...slug].astro` (doc renderer with prev/next) |

### Customize (Project-Specific Metadata)

| File | What changes |
|------|-------------|
| `src/consts.ts` | `SITE.NAME` → `"beginning-harness"`, `SITE.EMAIL` → TBD, metadata descriptions |
| `astro.config.mjs` | `site` URL for the Cloudflare Pages domain |
| `tailwind.config.mjs` | Accent color (distinct from mind-wallet's `#7bcfff`) |
| `package.json` | `name` → `"beginning-harness-docs"`, dependencies identical |
| `wrangler.toml` | Project name → `"beginning-harness-docs"` |
| `public/favicon.svg` | New favicon (placeholder initially) |
| `src/components/Header.astro` | Enable the header (currently commented out in mind-wallet) for nav across 9+ pages |

### Rewrite (Content)

| File | What changes |
|------|-------------|
| `src/pages/index.astro` | Entirely new landing page for beginning-harness |
| `src/content/docs/*.md` | All 9 documentation pages written from scratch |

## Landing Page Architecture

The landing page (`src/pages/index.astro`) follows mind-wallet's structural pattern but with beginning-harness content:

### Section 1: Hero
- Accent-colored "beginning-harness" heading
- Two paragraphs: what it does, key value props (explicit, inspectable, reusable, safe)
- Inline links to Claude Code, Codex, Cursor as supported targets

### Section 2: Install
- Three install paths using `<Code>` component with `github-dark` theme:
  - npm global: `npm install -g beginning-harness`
  - Checkout: `git clone` + `bun install`
  - Env-pointed: `export AGENTS_REPO_ROOT=...`

### Section 3: Key Docs (ArrowCards)
- Getting Started (order 1)
- How Apply Works (order 2)
- CLI Reference (order 3)
- Per-Project Config (order 7)

### Section 4: What It Harnesses
- Compact list of the 7 categories: skills, MCP servers, extensions, defaults, project overlays, downstream state, diagnostics

### Section 5: Remaining Docs (ArrowCards)
- Auto-populated from docs with order >= 4, excluding those already featured
- MCP Registry, Skill Library, Extensions, Diagnostics & Safety, Why Harness Engineering?

## Content Pages

9 documentation pages, each as a markdown file in `src/content/docs/`:

| Order | Slug | Title | Source material |
|-------|------|-------|----------------|
| 1 | `01-getting-started` | Getting Started | README: Requirements, Install, Quickstart |
| 2 | `02-how-apply-works` | How Apply Works | README: Five-layer model, run options, what changes on disk |
| 3 | `03-cli-reference` | CLI Reference | README: Full command catalog, flags, help |
| 4 | `04-mcp-registry` | MCP Registry | README: Registry files, user registry, defaults, toggles |
| 5 | `05-skill-library` | Skill Library | README: Built-in skills, curation, package-backed bundles |
| 6 | `06-extensions` | Extensions | README: Parallel + Beads setup, project-scoped config |
| 7 | `07-per-project-config` | Per-Project Config | README: Discovery, schema, include/exclude, examples |
| 8 | `08-diagnostics` | Diagnostics & Safety | README: Doctor command, safety model, usage modes |
| 9 | `09-harness-engineering` | Why Harness Engineering? | New content, informed by `.ai/analyses/14_meta_harness_report.md` |

Each page follows the frontmatter schema:

```yaml
---
title: "Page Title"
description: "One-line description for cards and meta tags"
date: 2026-04-28
order: 1
---
```

## Theming

| Property | Mind-wallet | Beginning-harness |
|----------|------------|-------------------|
| Accent color | `#7bcfff` / `#4ab8f0` | TBD — distinct from mind-wallet |
| Sans font | Inter 400/600 | Inter 400/600 (keep) |
| Serif font | Lora 400/600 | Lora 400/600 (keep) |
| Max width | `max-w-screen-sm` (640px) | `max-w-screen-sm` (640px) (keep) |
| Header | Commented out | Enabled — "home" + "docs" nav |
| Favicon | Mindpass logo SVG | TBD — placeholder initially |

## Navigation Model

- **Header**: Fixed top bar with site name (home link) + "docs" link
- **Landing page**: ArrowCards linking to key docs + auto-populated remaining docs
- **Doc pages**: "Back to home" link + Previous/Next footer navigation
- **Back to top**: Scroll-triggered button (existing component)

No sidebar needed — the flat-nav model works well for 9 pages with linear reading order.

## Deployment

- **Platform**: Cloudflare Pages (same as mind-wallet)
- **Build**: `astro check && astro build` → static output in `./dist`
- **Deploy**: `wrangler pages deploy ./dist`
- **Domain**: Cloudflare Pages default initially, custom domain later

## Dependencies

Identical to mind-wallet — no additions needed:

```
astro ^5.0.5, @astrojs/mdx ^4.0.2, @astrojs/sitemap ^3.2.1,
@astrojs/tailwind ^5.1.3, @fontsource/inter ^5.0.17, @fontsource/lora ^5.0.16,
@tailwindcss/typography ^0.5.10, tailwindcss ^3.4.1, clsx ^2.1.0,
tailwind-merge ^2.2.2, typescript ^5.4.2
Dev: wrangler ^3.0.0
```

## What We Explicitly Don't Build

- Search functionality (not needed at 9 pages)
- Sidebar navigation (flat-nav with ArrowCards is sufficient)
- Dark mode (mind-wallet doesn't have it; keep consistent)
- Versioned docs (single version of beginning-harness)
- Blog / changelog section (not in scope)
- i18n (English only)
