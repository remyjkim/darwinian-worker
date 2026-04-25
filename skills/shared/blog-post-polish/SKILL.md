---
name: blog-post-polish
description: Polish a blog post by downloading and inserting images, then verifying all external links. Use this skill whenever a post has an images.md reference file, when the user says "add images to the post", "download the images", "insert images", "polish the post", or "check the links". Also trigger when the user has a blog post in index.md and wants to get it ready to publish.
---

# Blog Post Polish

This skill covers the full image + link polish workflow for a Quartz blog post. It has two independent phases — run both unless the user only asks for one.

---

## Phase 1: Images

### Step 1 — Read the context

Read three files in parallel before doing anything:

1. **`images.md`** in the post directory — lists image URLs and placement hints (which section each image belongs to)
2. **`index.md`** in the post directory — the post itself; note section headings and the prose flow
3. **A reference post** that already has images — to confirm the exact markdown format to use

The reference post for this site is `content/posts/010-mindpass/index.md`. The image format used there is the canonical format to follow.

### Step 2 — Understand the format

The image insertion format from the reference post:

```markdown
![Descriptive alt text of the image.](./filename.webp)

> *Italic caption that gives context or a punchline, followed by ([Source name](url-to-source))*
```

Key rules:
- One blank line between the image and the blockquote
- The caption is italic, inside the blockquote
- The source attribution goes inside the caption, as a hyperlink
- Images go at the **top** of their section (before the section prose), unless the images.md placement hint says otherwise
- Captions should be substantive — not just "image of X" but something that adds context, irony, or meaning to the section

### Step 3 — Check available tools

```bash
which cwebp sips
```

`cwebp` (from Homebrew) is preferred. `sips` is the macOS fallback (converts to other formats but not webp natively — if cwebp is unavailable, save as .jpg and reference as .jpg).

### Step 4 — Download images

For each image in `images.md`, select the best single image for each placement (most evocative, highest resolution, most canonical). Download with curl using a descriptive user-agent:

```bash
curl -sL -A "saam.kim/1.0 (contact: remy@saam.kim)" -o <name>.jpg "<url>"
```

After downloading, check the file:
```bash
file <name>.jpg
ls -la <name>.jpg
```

If the file is tiny (<10KB) or `file` reports HTML, the URL failed — check the actual URL via the Wikimedia API or search for an alternate URL:
```bash
curl -sL "https://commons.wikimedia.org/w/api.php?action=query&titles=File:<filename>&prop=imageinfo&iiprop=url&format=json"
```

### Step 5 — Convert to webp

```bash
cwebp -q 85 source.jpg -o output.webp
```

For very large images (rosetta-stone.jpg, full-resolution portraits), resize on conversion:
```bash
cwebp -q 85 -resize 1600 0 source.jpg -o output.webp
```

Delete the source `.jpg` files after converting.

### Step 6 — Insert images into index.md

For each image, use Edit to insert the image block at the right location in `index.md`.

**For section-opening images** (the most common case): insert between the `## Section Heading` line and the first paragraph of that section.

**For bridge images** (between sections, as noted in images.md): insert between the closing `---` of one section and the `## Heading` of the next.

**Captions**: write them to add meaning, not just describe. Think about what makes the image interesting in the context of the section argument.

---

## Phase 2: Link verification

### Step 1 — Extract all external URLs

```bash
grep -Eo 'https?://[^) ]+' content/posts/<post>/index.md
```

### Step 2 — Verify in parallel batches

Use `mcp__claude_ai_parallel_web_search__web_fetch` to verify batches of 5 URLs at a time. For each URL, check:
- Does it resolve (not 404)?
- Does the page title/content match the linked text in the post?
- Is this the original source (not a redirect, mirror, or secondary reference)?

Common failure modes to watch for:
- Publisher ISBNs that 404 (the book may be published by a different house — search for the actual publisher)
- Wikipedia ISBNs in book URLs that resolve to wrong books
- Podcast episode URLs that work but contain a different episode than the one quoted

### Step 3 — Fix broken or wrong links

For any broken link, search for the correct URL:
- Books: search "[author] [title] publisher page" or "[ISBN]"
- Papers: search on Google Scholar or the publisher's DOI
- Podcast episodes: fetch the host's site and search for the quoted text

Apply fixes with Edit.

---

## Completing the work

After both phases:
- Confirm the local dev server is running (or offer to start it with `npx quartz build --serve`)
- Tell the user which URL to check (e.g., `http://localhost:8080/posts/011-world-building/`)
- Summarize what was done: N images inserted, M links checked, K links fixed
