# reveal.js Manual Book

*A practical, comprehensive guide to authoring, configuring, extending, deploying, and integrating reveal.js presentations, including the official React wrapper introduced in reveal.js 6.*

---

## Table of Contents

1. What reveal.js Is
2. Choosing a Project Style
3. Quick Start: Static HTML
4. Full Local Setup from the reveal.js Repository
5. npm/Vite Setup for App Projects
6. React Setup with `@revealjs/react`
7. The Mental Model
8. Core HTML Markup
9. Horizontal and Vertical Slides
10. Slide Content Authoring
11. Markdown Slides
12. Themes and Visual Styling
13. Presentation Size and Layout
14. Slide Backgrounds
15. Transitions
16. Fragments
17. Auto-Animate
18. Code Highlighting
19. Math Typesetting
20. Media, Lazy Loading, Iframes, and Lightboxes
21. Links and Navigation Controls
22. Speaker Notes and Speaker View
23. Slide Numbers, Progress, and Visibility
24. Auto-Slide and Kiosk Mode
25. Scroll View
26. Overview, Fullscreen, Touch, and Jump Navigation
27. Configuration Reference by Category
28. JavaScript API
29. Events
30. Keyboard Bindings
31. Presentation State and Cross-Window Control
32. Plugins
33. Writing Custom Plugins
34. PDF Export and Print Workflows
35. Deployment
36. React Integration Deep Dive
37. Integrating Other React Components
38. Next.js, Remix, Astro, and SSR Caveats
39. Accessibility and Performance
40. Common Recipes
41. Troubleshooting
42. Best Practices Checklist
43. Example Projects
44. Migration Notes for reveal.js 6

---

# 1. What reveal.js Is

reveal.js is an HTML presentation framework. A reveal.js deck is a web page: slides are HTML sections, styling is CSS, behavior is JavaScript, and anything that can run in a browser can be part of a presentation. That includes images, SVGs, videos, iframes, charts, animations, live demos, syntax-highlighted code, math, forms, and application UI.

The framework is useful when you want:

- version-controlled presentations;
- reusable design systems;
- interactive demos;
- live code or charts;
- Markdown-based authoring;
- React-powered slide components;
- deployable slide decks on static hosting;
- PDF export from the browser;
- speaker notes and presenter view.

A reveal.js deck can be as simple as one `index.html` file or as sophisticated as a React/Vite application.

---

# 2. Choosing a Project Style

Before installing anything, choose the authoring style that fits your workflow.

## Option A: Static HTML deck

Use this when you want the fastest start, no bundler, and plain HTML slides.

Best for:

- simple talks;
- one-off conference decks;
- hand-authored HTML;
- CDN or downloaded reveal.js assets.

Tradeoffs:

- less convenient for TypeScript, React, Tailwind, component reuse, and bundling;
- some features, such as external Markdown, need a local web server.

## Option B: Markdown-first deck

Use this when most slides are prose, lists, quotes, and code blocks.

Best for:

- training decks;
- documentation-style presentations;
- fast authoring;
- content-heavy slides.

Tradeoffs:

- complex custom layouts can become awkward;
- rich interactive components are easier in HTML or React.

## Option C: npm/Vite app deck

Use this when you want modern imports, npm packages, TypeScript, build tooling, and static deployment.

Best for:

- reusable decks;
- decks with custom JavaScript;
- decks using charting, animation, or design-system packages;
- deployment to static hosts.

Tradeoffs:

- requires Node.js and build tooling.

## Option D: React deck with `@revealjs/react`

Use this when you want to write slides as React components.

Best for:

- component-heavy decks;
- product demos;
- charts and data visualizations;
- design-system integration;
- shared UI components;
- decks that are effectively small applications.

Tradeoffs:

- you need React build tooling;
- you must respect reveal.js lifecycle rules, especially initialization, plugin registration, and layout syncing.

---

# 3. Quick Start: Static HTML

The minimum reveal.js deck has this structure:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <title>My reveal.js Deck</title>

    <link rel="stylesheet" href="dist/reveal.css" />
    <link rel="stylesheet" href="dist/theme/black.css" />
  </head>
  <body>
    <div class="reveal">
      <div class="slides">
        <section>
          <h1>Hello reveal.js</h1>
          <p>Use arrow keys to navigate.</p>
        </section>

        <section>
          <h2>Second slide</h2>
          <p>This is a regular HTML slide.</p>
        </section>
      </div>
    </div>

    <script src="dist/reveal.js"></script>
    <script>
      Reveal.initialize({
        hash: true,
        transition: 'slide'
      });
    </script>
  </body>
</html>
```

The required hierarchy is:

```html
<div class="reveal">
  <div class="slides">
    <section>One slide</section>
  </div>
</div>
```

Each direct child `section` of `.slides` is a horizontal slide. Nested `section` elements create vertical stacks.

## Minimal folder layout

```text
my-deck/
  index.html
  dist/
    reveal.css
    reveal.js
    theme/
      black.css
  dist/plugin/
    markdown.js
    highlight.js
    notes.js
```

In a downloaded reveal.js distribution, these files are already present. For a one-off deck, replace the sample content in `index.html` and open it in a browser.

## When you need a local server

Opening `index.html` directly works for many basic decks. Use a local web server when you load external files, use external Markdown, fetch data, use modules, or encounter browser security restrictions.

A quick server:

```bash
npx serve .
```

or:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

---

# 4. Full Local Setup from the reveal.js Repository

Use the full repository setup when you want the official example deck, source files, and development server.

```bash
git clone https://github.com/hakimel/reveal.js.git
cd reveal.js
npm install
npm start
```

Then open:

```text
http://localhost:8000
```

To use another port:

```bash
npm start -- --port=8001
```

This approach is convenient for learning reveal.js from the official demo and source structure. For production app-style decks, installing reveal.js as an npm dependency inside your own project is usually cleaner.

---

# 5. npm/Vite Setup for App Projects

A modern reveal.js project usually looks like a small web app.

## Create a Vite project

```bash
npm create vite@latest my-reveal-deck -- --template vanilla-ts
cd my-reveal-deck
npm install
npm install reveal.js
```

## Example `src/main.ts`

```ts
import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown';
import Highlight from 'reveal.js/plugin/highlight';
import Notes from 'reveal.js/plugin/notes';

import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import 'reveal.js/plugin/highlight/monokai.css';

const deck = new Reveal({
  hash: true,
  slideNumber: true,
  plugins: [Markdown, Highlight, Notes]
});

deck.initialize();
```

## Example `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite reveal.js Deck</title>
  </head>
  <body>
    <div class="reveal">
      <div class="slides">
        <section>
          <h1>Vite + reveal.js</h1>
        </section>
        <section>
          <h2>Modern imports</h2>
          <pre><code class="language-ts">console.log('Hello');</code></pre>
        </section>
      </div>
    </div>

    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Run the deck

```bash
npm run dev
```

## Build for deployment

```bash
npm run build
npm run preview
```

The built files in `dist/` can be deployed to any static host.

---

# 6. React Setup with `@revealjs/react`

reveal.js 6 introduced an official React wrapper: `@revealjs/react`. Use it when you want slides as React components.

## Create a Vite React project

```bash
npm create vite@latest my-react-deck -- --template react-ts
cd my-react-deck
npm install
npm install @revealjs/react reveal.js
```

## `src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Presentation } from './Presentation';

import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Presentation />
  </React.StrictMode>
);
```

## `src/Presentation.tsx`

```tsx
import { Deck, Slide, Stack, Fragment } from '@revealjs/react';

export function Presentation() {
  return (
    <Deck
      config={{
        hash: true,
        slideNumber: true,
        transition: 'slide'
      }}
    >
      <Slide>
        <h1>Hello React reveal.js</h1>
        <p>Slides are React components.</p>
      </Slide>

      <Stack>
        <Slide>
          <h2>Vertical stack</h2>
          <p>Press down.</p>
        </Slide>
        <Slide>
          <h2>Nested slide</h2>
          <p>Press right to continue.</p>
        </Slide>
      </Stack>

      <Slide>
        <h2>Fragments</h2>
        <Fragment as="p">First point</Fragment>
        <Fragment as="p" animation="fade-up">Second point</Fragment>
        <Fragment as="p" animation="highlight-red">Third point</Fragment>
      </Slide>
    </Deck>
  );
}
```

## React primitives

The official wrapper gives you these core pieces:

- `Deck`: the reveal.js presentation instance.
- `Slide`: one slide.
- `Stack`: a vertical group of slides.
- `Fragment`: progressively revealed content.
- `Code`: syntax-highlighted code block.
- `Markdown`: Markdown slide renderer.
- `useReveal()`: access the underlying reveal.js API from components inside the deck.
- `deckRef`: access the reveal.js instance from outside the deck tree.

## React setup rule of thumb

Use `@revealjs/react` for React projects. Do not manually initialize `Reveal.initialize()` inside a React component unless you intentionally choose the legacy/manual route. The official wrapper creates, syncs, and destroys the reveal.js instance for you.

---

# 7. The Mental Model

A reveal.js presentation has three layers:

## 1. Content layer

Slides are HTML sections or React `Slide` components. Content is normal web content: headings, paragraphs, lists, images, code blocks, SVG, canvas, iframes, and components.

## 2. Deck layer

The deck handles slide navigation, scaling, transitions, keyboard input, fragments, URL hashes, speaker view, state, and events.

## 3. Extension layer

Plugins add capabilities like Markdown, syntax highlighting, math, search, speaker notes, and zoom. Custom plugins can add application-specific behavior.

The core idea is: reveal.js owns slide navigation and presentation state; your HTML, CSS, JavaScript, or React components own the content inside slides.

---

# 8. Core HTML Markup

The canonical reveal.js document is:

```html
<div class="reveal">
  <div class="slides">
    <section>Slide 1</section>
    <section>Slide 2</section>
  </div>
</div>
```

A `section` can contain anything valid in HTML:

```html
<section>
  <h2>Architecture</h2>
  <ul>
    <li>Client</li>
    <li>API</li>
    <li>Database</li>
  </ul>
</section>
```

## Slide attributes

Slides are configured with `data-*` attributes:

```html
<section
  data-background-color="#111827"
  data-transition="fade"
  data-auto-animate
>
  <h2>Configured slide</h2>
</section>
```

Common slide-level attributes:

```text
data-background
data-background-color
data-background-image
data-background-video
data-background-iframe
data-background-gradient
data-transition
data-background-transition
data-auto-animate
data-auto-animate-id
data-auto-animate-restart
data-autoslide
data-state
data-visibility
```

## Slide states

Use `data-state` to add a CSS class to the viewport while a slide is active:

```html
<section data-state="warning-mode">
  <h2>High-risk change</h2>
</section>
```

```css
.warning-mode .reveal {
  background: #2a0000;
}
```

You can also listen for a state as an event:

```js
Reveal.on('warning-mode', () => {
  console.log('Entered warning mode');
});
```

---

# 9. Horizontal and Vertical Slides

Top-level slides move horizontally:

```html
<section>Intro</section>
<section>Problem</section>
<section>Solution</section>
```

Nested slides create vertical stacks:

```html
<section>Intro</section>

<section>
  <section>Part 1 overview</section>
  <section>Part 1 detail A</section>
  <section>Part 1 detail B</section>
</section>

<section>Conclusion</section>
```

Navigation behavior:

- Left/right moves between horizontal slides.
- Up/down moves within a vertical stack.
- Right can skip a vertical stack if the audience does not need the optional detail.

## When to use vertical slides

Use vertical slides for:

- optional detail;
- backup slides;
- drill-down explanations;
- live demo fallback slides;
- exercises under one topic;
- appendix material grouped under the relevant topic.

Avoid vertical stacks when the talk should be strictly linear. In that case, use only top-level slides or set `navigationMode: 'linear'`.

## Navigation modes

```js
Reveal.initialize({
  navigationMode: 'default'
});
```

Options:

```text
default: left/right for horizontal, up/down for vertical, space through all
linear: left/right moves through all slides in authoring order
grid: moving between vertical stacks preserves the vertical index
```

---

# 10. Slide Content Authoring

Because slides are HTML, you can use semantic elements:

```html
<section>
  <header>
    <h2>Key Result</h2>
  </header>

  <main>
    <p>The new pipeline reduced median latency by 38%.</p>
  </main>

  <footer>
    <small>Internal benchmark, March 2026</small>
  </footer>
</section>
```

## Good slide content patterns

Use one idea per slide. A reveal.js slide is not a document page; it is a visual state. If a slide has too much information, split it into fragments, vertical detail slides, or a scroll-view companion.

## Headings

Use a meaningful heading on most slides:

```html
<section>
  <h2>Why latency improved</h2>
</section>
```

This helps both human readers and assistive technology.

## Lists

```html
<section>
  <h2>Migration plan</h2>
  <ol>
    <li>Mirror writes</li>
    <li>Backfill historical data</li>
    <li>Switch reads</li>
    <li>Retire legacy path</li>
  </ol>
</section>
```

Use fragments for step-by-step reveal:

```html
<li class="fragment">Mirror writes</li>
<li class="fragment">Backfill historical data</li>
```

## Images

```html
<section>
  <h2>System overview</h2>
  <img src="architecture.svg" alt="Architecture diagram showing client, API, queue, and worker" />
</section>
```

Prefer SVG for diagrams, PNG/WebP for screenshots, and optimized images for large decks.

---

# 11. Markdown Slides

Markdown is convenient for text-heavy decks. Enable the Markdown plugin:

```html
<script src="dist/plugin/markdown.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealMarkdown]
  });
</script>
```

## Inline Markdown slide

```html
<section data-markdown>
  <textarea data-template>
    ## Markdown slide

    - Fast authoring
    - Good for training
    - Supports code blocks
  </textarea>
</section>
```

## Multiple Markdown slides in one block

```html
<section data-markdown>
  <textarea data-template>
    ## Slide 1

    Hello.

    ---

    ## Slide 2

    More content.
  </textarea>
</section>
```

## Markdown with vertical slides

A common convention is:

```markdown
## Horizontal slide

---

## Next horizontal slide

--

## Vertical child
```

Configure separators when needed:

```js
Reveal.initialize({
  markdown: {
    separator: '^\n---\n$',
    verticalSeparator: '^\n--\n$'
  },
  plugins: [RevealMarkdown]
});
```

## External Markdown

```html
<section data-markdown="slides.md" data-separator="^\n---\n$"></section>
```

External Markdown usually requires a local server because browsers restrict file loading from `file://`.

## Markdown attributes

Add attributes to the previous element:

```markdown
- Important point <!-- .element: class="fragment highlight-red" -->
```

Add attributes to the slide:

```markdown
## Warning
<!-- .slide: data-background-color="#2a0000" -->
```

## Markdown in React

The React wrapper includes a `Markdown` component and does not require the core Markdown plugin for that component:

```tsx
import { Deck, Markdown } from '@revealjs/react';

export function Presentation() {
  return (
    <Deck>
      <Markdown>{`
        ## Slide 1

        Hello from Markdown.

        ---

        ## Slide 2
      `}</Markdown>
    </Deck>
  );
}
```

---

# 12. Themes and Visual Styling

A theme is a CSS file that sets typography, colors, backgrounds, spacing, and default element styles.

Classic setup:

```html
<link rel="stylesheet" href="dist/theme/black.css" />
```

npm setup:

```ts
import 'reveal.js/theme/black.css';
```

Common built-in themes include:

```text
black
white
league
beige
night
serif
simple
solarized
moon
dracula
sky
blood
```

## Custom styles

Add your own CSS after the reveal theme:

```html
<link rel="stylesheet" href="dist/theme/black.css" />
<link rel="stylesheet" href="custom.css" />
```

```css
.reveal h1,
.reveal h2 {
  letter-spacing: -0.04em;
}

.reveal .accent {
  color: #7dd3fc;
}

.reveal .muted {
  opacity: 0.65;
}
```

## Styling one slide

```html
<section class="title-slide">
  <h1>Launch Plan</h1>
</section>
```

```css
.reveal .title-slide h1 {
  font-size: 3.5em;
}
```

## CSS variables

Modern reveal.js themes expose many values as CSS custom properties. This lets you customize theme colors without rewriting every rule:

```css
:root {
  --r-main-font: Inter, system-ui, sans-serif;
  --r-heading-font: Inter, system-ui, sans-serif;
  --r-heading-text-transform: none;
  --r-link-color: #38bdf8;
}
```

## React + CSS modules

CSS modules work for your own components:

```tsx
import styles from './MetricCard.module.css';

export function MetricCard() {
  return <div className={styles.card}>42%</div>;
}
```

Use global CSS for reveal-specific selectors such as `.reveal`, `.slides`, `.fragment`, and theme variables.

---

# 13. Presentation Size and Layout

reveal.js presentations have a normal authoring size and are scaled to fit the viewport.

```js
Reveal.initialize({
  width: 960,
  height: 700,
  margin: 0.04,
  minScale: 0.2,
  maxScale: 2.0
});
```

## 16:9 deck

```js
Reveal.initialize({
  width: 1280,
  height: 720
});
```

## Disable vertical centering

Slides are centered by default. Disable it when you want a fixed top-aligned layout:

```js
Reveal.initialize({
  center: false
});
```

## Embedded decks

If a deck is embedded in a page instead of filling the viewport:

```js
Reveal.initialize({
  embedded: true,
  keyboardCondition: 'focused'
});
```

Then size the `.reveal` root:

```css
.reveal.deck-preview {
  width: 640px;
  height: 360px;
}
```

If the container changes size after initialization:

```js
Reveal.layout();
```

## Bring your own layout

For advanced app-style layouts:

```js
Reveal.initialize({
  disableLayout: true
});
```

Use this only if you are prepared to fully control slide dimensions and responsiveness yourself.

## Layout helper: `r-stack`

Stack elements on top of one another:

```html
<div class="r-stack">
  <img class="fragment" src="step-1.svg" alt="Step 1" />
  <img class="fragment" src="step-2.svg" alt="Step 2" />
  <img class="fragment" src="step-3.svg" alt="Step 3" />
</div>
```

## Layout helper: `r-fit-text`

Make text as large as possible without overflowing:

```html
<h1 class="r-fit-text">BIG IDEA</h1>
```

## Layout helper: `r-stretch`

Stretch one direct child to fill remaining vertical space:

```html
<section>
  <h2>Architecture</h2>
  <img class="r-stretch" src="architecture.svg" alt="Architecture diagram" />
  <p>High-level service layout</p>
</section>
```

Only one direct child per slide should use `r-stretch`.

## Layout helper: `r-frame`

Add a frame to an element:

```html
<img class="r-frame" src="screenshot.png" alt="Product screenshot" />
```

---

# 14. Slide Backgrounds

Slide backgrounds fill the entire presentation viewport, outside the normal slide content box.

## Color background

```html
<section data-background-color="#111827">
  <h2>Dark slide</h2>
</section>
```

Shortcut:

```html
<section data-background="#111827">
  <h2>Dark slide</h2>
</section>
```

## Gradient background

```html
<section data-background-gradient="linear-gradient(to bottom, #0f172a, #1e3a8a)">
  <h2>Gradient</h2>
</section>
```

## Image background

```html
<section
  data-background-image="hero.jpg"
  data-background-size="cover"
  data-background-position="center"
  data-background-opacity="0.6"
>
  <h2>Image background</h2>
</section>
```

Useful attributes:

```text
data-background-image
data-background-size
data-background-position
data-background-repeat
data-background-opacity
```

## Video background

```html
<section
  data-background-video="intro.mp4"
  data-background-video-loop
  data-background-video-muted
>
  <h2>Video background</h2>
</section>
```

## Iframe background

```html
<section data-background-iframe="https://example.com/demo">
  <h2>Iframe background</h2>
</section>
```

Make it interactive:

```html
<section
  data-background-iframe="https://example.com/demo"
  data-background-interactive
>
  <h2>Interactive iframe</h2>
</section>
```

## Background transitions

Global:

```js
Reveal.initialize({
  backgroundTransition: 'fade'
});
```

Per slide:

```html
<section data-background-transition="zoom">
  <h2>Zooming background</h2>
</section>
```

---

# 15. Transitions

Transitions control how slides animate when moving from one to another.

Global:

```js
Reveal.initialize({
  transition: 'slide',
  transitionSpeed: 'default'
});
```

Common transition values:

```text
none
fade
slide
convex
concave
zoom
```

Per slide:

```html
<section data-transition="fade">
  <h2>This slide fades</h2>
</section>
```

Directional transitions:

```html
<section data-transition="slide-in fade-out">
  <h2>Slide in, fade out</h2>
</section>
```

Use transitions sparingly. They should support the explanation, not become the presentation.

---

# 16. Fragments

Fragments reveal or transform elements step by step before moving to the next slide.

```html
<section>
  <h2>Plan</h2>
  <p class="fragment">Phase 1: observe</p>
  <p class="fragment">Phase 2: migrate</p>
  <p class="fragment">Phase 3: deprecate</p>
</section>
```

## Fragment styles

```html
<p class="fragment">Fade in</p>
<p class="fragment fade-out">Fade out</p>
<p class="fragment fade-up">Fade up</p>
<p class="fragment fade-left">Fade left</p>
<p class="fragment grow">Grow</p>
<p class="fragment shrink">Shrink</p>
<p class="fragment strike">Strike</p>
<p class="fragment highlight-red">Highlight red</p>
<p class="fragment highlight-blue">Highlight blue</p>
<p class="fragment highlight-green">Highlight green</p>
<p class="fragment current-visible">Visible only for current step</p>
<p class="fragment fade-in-then-out">Fade in, then out</p>
<p class="fragment fade-in-then-semi-out">Fade in, then dim</p>
```

## Fragment order

By default, fragments appear in DOM order. Override with `data-fragment-index`:

```html
<p class="fragment" data-fragment-index="2">Second</p>
<p class="fragment" data-fragment-index="1">First</p>
<p class="fragment" data-fragment-index="3">Third</p>
```

Multiple fragments can share an index to appear together:

```html
<p class="fragment" data-fragment-index="1">A</p>
<p class="fragment" data-fragment-index="1">B</p>
```

## Fragments in React

```tsx
import { Fragment } from '@revealjs/react';

<Fragment as="p">First point</Fragment>
<Fragment as="p" animation="fade-up">Second point</Fragment>
<Fragment as="p" animation="highlight-red" index={2}>Third point</Fragment>
```

Use `asChild` to apply fragment behavior to an existing child:

```tsx
<Fragment asChild>
  <button>Appears as a real button</button>
</Fragment>
```

---

# 17. Auto-Animate

Auto-Animate automatically animates matching elements between adjacent slides.

```html
<section data-auto-animate>
  <h1>Auto-Animate</h1>
</section>

<section data-auto-animate>
  <h1 style="margin-top: 100px; color: red">Auto-Animate</h1>
</section>
```

reveal.js matches elements by text, node type, source attributes for media, DOM order, and explicit `data-id` values.

## Use `data-id` for reliable matching

```html
<section data-auto-animate>
  <div data-id="box" class="box small"></div>
</section>

<section data-auto-animate>
  <div data-id="box" class="box large"></div>
</section>
```

```css
.box {
  background: #38bdf8;
  margin: auto;
}

.box.small {
  width: 120px;
  height: 120px;
}

.box.large {
  width: 420px;
  height: 240px;
}
```

## Global Auto-Animate settings

```js
Reveal.initialize({
  autoAnimateEasing: 'ease-out',
  autoAnimateDuration: 0.8,
  autoAnimateUnmatched: false
});
```

## Per-slide settings

```html
<section
  data-auto-animate
  data-auto-animate-duration="0.5"
  data-auto-animate-easing="ease-in-out"
>
  <h2>Fast animation</h2>
</section>
```

## Grouping Auto-Animate sequences

Use `data-auto-animate-id` to separate adjacent groups:

```html
<section data-auto-animate data-auto-animate-id="a">A1</section>
<section data-auto-animate data-auto-animate-id="a">A2</section>
<section data-auto-animate data-auto-animate-id="b">B1</section>
<section data-auto-animate data-auto-animate-id="b">B2</section>
```

Use `data-auto-animate-restart` to break animation from the previous slide:

```html
<section data-auto-animate data-auto-animate-restart>
  <h2>New animation sequence</h2>
</section>
```

## Auto-Animate in React

```tsx
<Slide autoAnimate>
  <h2>Step</h2>
</Slide>

<Slide autoAnimate>
  <h2 style={{ transform: 'scale(1.3)' }}>Step</h2>
</Slide>
```

For reliable matching:

```tsx
<Slide autoAnimate>
  <div data-id="card" className="card compact">Revenue</div>
</Slide>

<Slide autoAnimate>
  <div data-id="card" className="card expanded">Revenue</div>
</Slide>
```

## Auto-Animate tips

- Prefer class changes over large inline style blocks.
- Use `data-id` when content is dynamic.
- Keep animated elements stable across slides.
- Avoid animating huge DOM subtrees.
- Avoid layout thrash from components that measure themselves while animating.

---

# 18. Code Highlighting

reveal.js uses a highlight plugin for syntax-highlighted code.

## Classic setup

```html
<link rel="stylesheet" href="dist/plugin/highlight/monokai.css" />
<script src="dist/plugin/highlight.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealHighlight]
  });
</script>
```

## npm setup

```ts
import Reveal from 'reveal.js';
import Highlight from 'reveal.js/plugin/highlight';

import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import 'reveal.js/plugin/highlight/monokai.css';

const deck = new Reveal({
  plugins: [Highlight]
});

deck.initialize();
```

## Code block

```html
<pre><code class="language-js">
const message = 'Hello reveal.js';
console.log(message);
</code></pre>
```

## Trim code indentation

```html
<pre><code data-trim class="language-js">
  function greet(name) {
    return `Hello ${name}`;
  }
</code></pre>
```

## Line numbers

```html
<pre><code data-line-numbers class="language-js">
const a = 1;
const b = 2;
const c = a + b;
</code></pre>
```

## Step through highlighted lines

```html
<pre><code data-line-numbers="1|2-3|4" class="language-js">
const a = 1;
const b = 2;
const c = a + b;
console.log(c);
</code></pre>
```

## Line number offset

```html
<pre><code data-line-numbers="10:1-2|3" class="language-js">
function add(a, b) {
  return a + b;
}
</code></pre>
```

## React `Code` component

```tsx
import { Deck, Slide, Code } from '@revealjs/react';
import RevealHighlight from 'reveal.js/plugin/highlight';
import 'reveal.js/plugin/highlight/monokai.css';

export function Presentation() {
  return (
    <Deck plugins={[RevealHighlight]}>
      <Slide>
        <Code language="javascript" lineNumbers="1|2-3">
          {`const a = 1;
const b = 2;
const c = a + b;`}
        </Code>
      </Slide>
    </Deck>
  );
}
```

## Manual highlighting

For dynamic code blocks, disable auto-highlight and call the plugin yourself:

```js
Reveal.initialize({
  highlight: {
    highlightOnLoad: false
  },
  plugins: [RevealHighlight]
}).then(() => {
  const highlight = Reveal.getPlugin('highlight');
  highlight.highlightBlock(document.querySelector('code'));
});
```

---

# 19. Math Typesetting

The math plugin supports KaTeX and MathJax variants.

## Classic KaTeX setup

```html
<script src="dist/plugin/math.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealMath.KaTeX]
  });
</script>
```

## Math slide

```html
<section>
  <h2>The Lorenz Equations</h2>
  \[
  \begin{aligned}
  \dot{x} &= \sigma(y-x) \\
  \dot{y} &= \rho x - y - xz \\
  \dot{z} &= -\beta z + xy
  \end{aligned}
  \]
</section>
```

## Markdown math

```html
<section data-markdown>
  <textarea data-template>
    ## Cost function

    $$ J(\theta) = \frac{1}{2m}\sum_{i=1}^{m}(h_\theta(x_i)-y_i)^2 $$
  </textarea>
</section>
```

## Choose a math renderer

Available plugin variants:

```text
RevealMath.KaTeX
RevealMath.MathJax2
RevealMath.MathJax3
RevealMath.MathJax4
```

Use KaTeX when you want speed and good default rendering. Use MathJax when you need broader TeX/MathML support or MathJax-specific features.

## Fixed version or offline use

For reproducible builds, pin the renderer version or install it locally. For example, with KaTeX:

```js
Reveal.initialize({
  katex: {
    version: '0.16.11'
  },
  plugins: [RevealMath.KaTeX]
});
```

For offline decks:

```bash
npm install katex
```

```js
Reveal.initialize({
  katex: {
    local: 'node_modules/katex'
  },
  plugins: [RevealMath.KaTeX]
});
```

---

# 20. Media, Lazy Loading, Iframes, and Lightboxes

reveal.js includes conveniences for media playback, lazy loading, iframe lifecycle, and full-screen lightbox previews.

## Autoplay media on slide show

```html
<video data-autoplay src="demo.mp4"></video>
```

Global autoplay:

```js
Reveal.initialize({
  autoPlayMedia: true
});
```

Disable globally:

```js
Reveal.initialize({
  autoPlayMedia: false
});
```

Media is normally paused when you leave its slide. Prevent reveal.js from controlling a media element:

```html
<video data-ignore controls src="demo.mp4"></video>
```

## Lazy-load images, video, audio, and iframes

Use `data-src` instead of `src`:

```html
<section>
  <img data-src="large-image.jpg" alt="Large diagram" />

  <video controls>
    <source data-src="demo.webm" type="video/webm" />
    <source data-src="demo.mp4" type="video/mp4" />
  </video>

  <iframe data-src="https://example.com"></iframe>
</section>
```

The number of nearby slides loaded is controlled by `viewDistance`:

```js
Reveal.initialize({
  viewDistance: 3,
  mobileViewDistance: 2
});
```

Lazy-loaded iframes are special: by default they load when the slide becomes visible and unload when hidden. This prevents hidden iframes from playing media in the background.

Preload one iframe:

```html
<iframe data-src="https://example.com" data-preload></iframe>
```

Preload all lazy iframes near the current slide:

```js
Reveal.initialize({
  preloadIframes: true
});
```

## Iframe slide lifecycle messages

Content inside an embedded iframe can listen for visibility messages:

```js
window.addEventListener('message', (event) => {
  if (event.data === 'slide:start') {
    startDemo();
  }

  if (event.data === 'slide:stop') {
    pauseDemo();
  }
});
```

## Lightbox images

```html
<img src="thumbnail.png" data-preview-image="full-size.png" alt="Product screenshot" />
```

If no value is provided, the image source is used:

```html
<img src="diagram.png" data-preview-image alt="Architecture diagram" />
```

## Lightbox videos

```html
<button data-preview-video="demo.mp4">Watch demo</button>
```

## Lightbox links

```html
<a href="https://example.com" data-preview-link>Open preview</a>
```

Iframe link previews only work if the remote site allows iframe embedding.

## Lightbox sizing

```html
<img src="chart.png" data-preview-image data-preview-fit="contain" />
```

Fit modes:

```text
scale-down
contain
cover
```

---

# 21. Links and Navigation Controls

## Link to a slide by ID

```html
<section>
  <a href="#/grand-finale">Go to the finale</a>
</section>

<section id="grand-finale">
  <h2>The end</h2>
</section>
```

## Link by slide index

```html
<a href="#/2">Go to horizontal slide 2</a>
<a href="#/3/2">Go to vertical slide 2 inside horizontal slide 3</a>
```

## Navigation buttons

Add navigation classes inside the `.reveal` container:

```html
<button class="navigate-left">Left</button>
<button class="navigate-right">Right</button>
<button class="navigate-up">Up</button>
<button class="navigate-down">Down</button>
<button class="navigate-prev">Previous</button>
<button class="navigate-next">Next</button>
```

reveal.js adds an `enabled` class when the route is available.

## API navigation

```js
Reveal.left();
Reveal.right();
Reveal.up();
Reveal.down();
Reveal.prev();
Reveal.next();
Reveal.slide(2, 0, 0);
```

## React navigation component

```tsx
import { useReveal } from '@revealjs/react';

export function NextButton() {
  const deck = useReveal();

  return (
    <button onClick={() => deck?.next()}>
      Next
    </button>
  );
}
```

---

# 22. Speaker Notes and Speaker View

Speaker View gives the presenter a separate window with notes, timer, current slide, and next slide preview.

## Enable speaker notes

Classic setup:

```html
<script src="dist/plugin/notes.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealNotes]
  });
</script>
```

npm setup:

```ts
import Notes from 'reveal.js/plugin/notes';

const deck = new Reveal({
  plugins: [Notes]
});
```

React setup:

```tsx
import RevealNotes from 'reveal.js/plugin/notes';

<Deck plugins={[RevealNotes]}>
  {/* slides */}
</Deck>
```

## Add notes in HTML

```html
<section>
  <h2>Launch risks</h2>
  <aside class="notes">
    Mention that the migration can be rolled back at the routing layer.
  </aside>
</section>
```

## Add notes in Markdown

```markdown
## Launch risks

- Data consistency
- Operational load

Notes:
Mention rollback strategy and monitoring dashboard.
```

## Open speaker view

Press `S` while presenting.

## Speaker controls

Speaker View is especially useful for:

- seeing the next slide;
- reading private notes;
- tracking elapsed time;
- presenting from one screen while projecting another.

---

# 23. Slide Numbers, Progress, and Visibility

## Slide numbers

```js
Reveal.initialize({
  slideNumber: true
});
```

Formats:

```js
Reveal.initialize({ slideNumber: 'h.v' }); // horizontal.vertical
Reveal.initialize({ slideNumber: 'h/v' });
Reveal.initialize({ slideNumber: 'c' });   // flattened current slide
Reveal.initialize({ slideNumber: 'c/t' }); // current / total
```

Custom generator:

```js
Reveal.initialize({
  slideNumber: (slide) => {
    const indices = Reveal.getIndices(slide);
    return [`${indices.h + 1}`];
  }
});
```

## Show slide numbers only in some contexts

```js
Reveal.initialize({
  slideNumber: 'c/t',
  showSlideNumber: 'print'
});
```

Values:

```text
all
print
speaker
```

## Progress bar

```js
Reveal.initialize({
  progress: true
});
```

## Hide a slide

```html
<section data-visibility="hidden">
  <h2>Not shown</h2>
</section>
```

Hidden slides are removed from the DOM during initialization.

## Uncounted backup slides

```html
<section>Main slide 1</section>
<section>Main slide 2</section>
<section data-visibility="uncounted">Backup slide</section>
```

Use this for optional slides at the end of a deck so slide numbering and progress do not imply extra main content.

---

# 24. Auto-Slide and Kiosk Mode

Auto-slide advances without user input.

```js
Reveal.initialize({
  autoSlide: 5000,
  loop: true
});
```

This advances every 5 seconds.

## Per-slide timing

```html
<section data-autoslide="2000">
  <p>Shown for 2 seconds</p>
  <p class="fragment" data-autoslide="10000">Shown for 10 seconds</p>
  <p class="fragment">Then 2 seconds again</p>
</section>
```

## Auto-slide controls

By default, users can pause/resume auto-slide. To prevent user pausing:

```js
Reveal.initialize({
  autoSlide: 5000,
  autoSlideStoppable: false
});
```

## Custom auto-slide behavior

By default, auto-slide steps through horizontal and vertical slides. To move only horizontally:

```js
Reveal.configure({
  autoSlideMethod: () => Reveal.right()
});
```

## Auto-slide events

```js
Reveal.on('autoslideresumed', () => {
  console.log('Auto-slide resumed');
});

Reveal.on('autoslidepaused', () => {
  console.log('Auto-slide paused');
});
```

---

# 25. Scroll View

Scroll View lets a presentation behave like a scrollable article. This is useful for sharing decks asynchronously, especially on mobile.

```js
Reveal.initialize({
  view: 'scroll',
  scrollProgress: true
});
```

Or activate through the URL:

```text
?view=scroll
```

## Behavior

Scroll View flattens horizontal and vertical slides into a single linear flow. Fragments, animations, and other features continue to work.

## Mobile activation

Scroll View can activate automatically below a mobile viewport width. Disable automatic activation:

```js
Reveal.initialize({
  scrollActivationWidth: null
});
```

## Scroll progress

```js
Reveal.initialize({
  scrollProgress: 'auto'
});
```

Values:

```text
auto: show while scrolling
true: always show
false: never show
```

## Scroll snapping

```js
Reveal.initialize({
  scrollSnap: 'mandatory'
});
```

Values:

```text
false
proximity
mandatory
```

## Compact scroll layout

```js
Reveal.initialize({
  view: 'scroll',
  scrollLayout: 'compact'
});
```

Use compact layout when you want the shared deck to read more like a page than a series of full-height panels.

---

# 26. Overview, Fullscreen, Touch, and Jump Navigation

## Overview mode

Press `Esc` or `O` to toggle overview mode.

Programmatic control:

```js
Reveal.toggleOverview();
Reveal.toggleOverview(true);
Reveal.toggleOverview(false);
```

Events:

```js
Reveal.on('overviewshown', () => {});
Reveal.on('overviewhidden', () => {});
```

## Fullscreen mode

Press `F` to enter fullscreen. Press `Esc` to exit.

If the deck is embedded, click it first to focus before pressing `F`.

## Touch navigation

Swipe gestures work on touch devices. For content that needs touch interaction or scrolling, prevent slide swiping:

```html
<div data-prevent-swipe>
  <textarea>Swipe should not change slides here.</textarea>
</div>
```

## Jump to slide

Press `G`, type a slide number or slide ID, and press Enter.

Examples:

```text
5       -> slide number 5
6/2     -> horizontal slide 6, vertical slide 2
the-end -> slide with id="the-end"
```

Disable:

```js
Reveal.initialize({
  jumpToSlide: false
});
```

---

# 27. Configuration Reference by Category

You pass configuration to `Reveal.initialize()` or to the React `Deck` `config` prop.

Classic:

```js
Reveal.initialize({
  hash: true,
  transition: 'slide'
});
```

React:

```tsx
<Deck config={{ hash: true, transition: 'slide' }}>
  {/* slides */}
</Deck>
```

## Navigation and controls

```js
Reveal.initialize({
  controls: true,
  controlsTutorial: true,
  controlsLayout: 'bottom-right',
  controlsBackArrows: 'faded',
  progress: true,
  slideNumber: false,
  hash: false,
  history: false,
  keyboard: true,
  overview: true,
  center: true,
  touch: true,
  loop: false,
  rtl: false,
  navigationMode: 'default'
});
```

## Appearance

```js
Reveal.initialize({
  width: 960,
  height: 700,
  margin: 0.04,
  minScale: 0.2,
  maxScale: 2.0,
  transition: 'slide',
  transitionSpeed: 'default',
  backgroundTransition: 'fade',
  display: 'block'
});
```

## Behavior

```js
Reveal.initialize({
  autoSlide: 0,
  autoSlideStoppable: true,
  autoSlideMethod: null,
  defaultTiming: null,
  mouseWheel: false,
  hideInactiveCursor: true,
  hideCursorTime: 5000,
  previewLinks: false
});
```

## View and performance

```js
Reveal.initialize({
  view: 'slide',
  viewDistance: 3,
  mobileViewDistance: 2,
  preloadIframes: null,
  autoPlayMedia: null
});
```

## Scroll View

```js
Reveal.initialize({
  view: 'scroll',
  scrollProgress: 'auto',
  scrollSnap: 'mandatory',
  scrollLayout: 'full',
  scrollActivationWidth: 435
});
```

## PDF export

```js
Reveal.initialize({
  pdfMaxPagesPerSlide: Number.POSITIVE_INFINITY,
  pdfSeparateFragments: true,
  pdfPageHeightOffset: -1,
  showSlideNumber: 'all'
});
```

## Auto-Animate

```js
Reveal.initialize({
  autoAnimate: true,
  autoAnimateMatcher: null,
  autoAnimateEasing: 'ease',
  autoAnimateDuration: 1.0,
  autoAnimateUnmatched: true
});
```

## Embedded decks

```js
Reveal.initialize({
  embedded: true,
  keyboardCondition: 'focused'
});
```

## Reconfigure after initialization

```js
Reveal.configure({
  autoSlide: 5000
});
```

In React, update the `config` prop. The wrapper shallow-compares config and calls `reveal.configure()` when values change.

---

# 28. JavaScript API

The API lets you navigate, inspect state, control modes, and integrate other code.

## Navigation

```js
Reveal.slide(indexh, indexv, indexf);

Reveal.left();
Reveal.right();
Reveal.up();
Reveal.down();
Reveal.prev();
Reveal.next();

Reveal.navigateFragment(indexf);
Reveal.prevFragment();
Reveal.nextFragment();
```

## State and indices

```js
Reveal.getIndices();
Reveal.getProgress();
Reveal.getTotalSlides();
Reveal.getSlidePastCount();
Reveal.getState();
Reveal.setState(state);
```

## Current slide elements

```js
Reveal.getCurrentSlide();
Reveal.getSlide(h, v);
Reveal.getSlides();
```

## Modes

```js
Reveal.isOverview();
Reveal.toggleOverview();

Reveal.isPaused();
Reveal.togglePause();

Reveal.isAutoSliding();
Reveal.toggleAutoSlide();
```

## Layout and sync

```js
Reveal.layout();
Reveal.sync();
Reveal.syncSlide(slideElement);
```

Use `layout()` after container size changes. Use `sync()` after you add, remove, or reorder slides outside reveal.js. Use `syncSlide()` for changes to a single slide.

## Plugins

```js
Reveal.hasPlugin('markdown');
Reveal.getPlugin('markdown');
Reveal.getPlugins();
```

## React API access

Inside the deck tree:

```tsx
import { useReveal } from '@revealjs/react';

function ProgressLogger() {
  const deck = useReveal();

  return (
    <button onClick={() => console.log(deck?.getProgress())}>
      Log progress
    </button>
  );
}
```

Outside the deck tree:

```tsx
import { useRef } from 'react';
import { Deck, Slide } from '@revealjs/react';
import type { RevealApi } from 'reveal.js';

export function Presentation() {
  const deckRef = useRef<RevealApi | null>(null);

  return (
    <>
      <button onClick={() => deckRef.current?.next()}>Next</button>
      <Deck deckRef={deckRef}>
        <Slide>Hello</Slide>
      </Deck>
    </>
  );
}
```

---

# 29. Events

Use events to react to presentation lifecycle and navigation.

```js
Reveal.on('eventname', callback);
Reveal.off('eventname', callback);
```

## Ready

```js
Reveal.on('ready', (event) => {
  console.log(event.currentSlide, event.indexh, event.indexv);
});
```

Equivalent:

```js
Reveal.initialize().then(() => {
  console.log('Ready');
});
```

## Slide changed

```js
Reveal.on('slidechanged', (event) => {
  console.log(event.previousSlide);
  console.log(event.currentSlide);
  console.log(event.indexh, event.indexv);
});
```

## Slide transition end

```js
Reveal.on('slidetransitionend', (event) => {
  console.log('Slide fully visible', event.currentSlide);
});
```

Use this when a library needs to measure visible DOM after transition.

## Resize

```js
Reveal.on('resize', (event) => {
  console.log(event.scale, event.oldScale, event.size);
});
```

## Fragment events

```js
Reveal.on('fragmentshown', (event) => {
  console.log(event.fragment);
});

Reveal.on('fragmenthidden', (event) => {
  console.log(event.fragment);
});
```

## Auto-Animate event

```js
Reveal.on('autoanimate', (event) => {
  console.log(event.fromSlide, event.toSlide);
});
```

## React event props

```tsx
<Deck
  onReady={(deck) => console.log('Ready', deck)}
  onSlideChange={(event) => console.log(event.indexh, event.indexv)}
  onFragmentShown={(event) => console.log(event.fragment)}
>
  {/* slides */}
</Deck>
```

Common React event props include:

```text
onReady
onSync
onSlideSync
onSlideChange
onSlideTransitionEnd
onFragmentShown
onFragmentHidden
onOverviewShown
onOverviewHidden
onPaused
onResumed
```

---

# 30. Keyboard Bindings

Override or disable keyboard behavior with `keyboard`.

```js
Reveal.configure({
  keyboard: {
    27: () => console.log('Escape'),
    13: 'next',
    32: null
  }
});
```

Action types:

```text
Function: run callback
String: call a reveal.js API method
null: disable the key
```

## Add key binding programmatically

```js
Reveal.addKeyBinding(
  { keyCode: 84, key: 'T', description: 'Start timer' },
  () => {
    startTimer();
  }
);
```

Remove it:

```js
Reveal.removeKeyBinding(84);
```

## React keyboard integration

Prefer reveal.js key bindings for deck-level shortcuts. Use React keyboard handlers for component-local interactions.

```tsx
function SearchBox() {
  return (
    <input
      data-prevent-swipe
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
      placeholder="Search"
    />
  );
}
```

If an interactive component uses arrow keys, prevent conflicts by stopping propagation or focusing the component and configuring `keyboardCondition` appropriately in embedded contexts.

---

# 31. Presentation State and Cross-Window Control

## Save and restore state

```js
Reveal.slide(1);

const state = Reveal.getState();

Reveal.slide(3);

Reveal.setState(state);
```

A state object includes enough information to return to the same slide, fragment, pause state, overview state, and related presentation state.

Use cases:

- synchronized presenter/attendee views;
- restoring position after reload;
- analytics checkpoints;
- remote control;
- embedding a deck in an app.

## postMessage API

A parent window can control a reveal.js deck in another window or iframe:

```js
revealWindow.postMessage(
  JSON.stringify({ method: 'slide', args: [2] }),
  '*'
);
```

Enable or disable cross-window API:

```js
Reveal.initialize({
  postMessage: true,
  postMessageEvents: false
});
```

Receive bubbled events from an iframe:

```js
window.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.namespace === 'reveal' && data.eventName === 'slidechanged') {
    console.log(data.state);
  }
});
```

Use a specific target origin instead of `'*'` in production when you control the parent and child origins.

---

# 32. Plugins

Plugins extend reveal.js. Built-in plugins include:

```text
RevealHighlight: syntax-highlighted code
RevealMarkdown: Markdown slide authoring
RevealSearch: search slide content
RevealNotes: speaker view
RevealMath: math equations
RevealZoom: alt/ctrl-click zoom
```

## Classic plugin setup

```html
<script src="dist/plugin/markdown.js"></script>
<script src="dist/plugin/highlight.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealMarkdown, RevealHighlight]
  });
</script>
```

## ES module plugin setup

```html
<script type="module">
  import Reveal from './dist/reveal.mjs';
  import Markdown from './dist/plugin/markdown.mjs';
  import Highlight from './dist/plugin/highlight.mjs';

  Reveal.initialize({
    plugins: [Markdown, Highlight]
  });
</script>
```

## npm plugin setup

```ts
import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown';
import Highlight from 'reveal.js/plugin/highlight';
import Notes from 'reveal.js/plugin/notes';

const deck = new Reveal({
  plugins: [Markdown, Highlight, Notes]
});
```

## React plugin setup

```tsx
import { Deck } from '@revealjs/react';
import RevealHighlight from 'reveal.js/plugin/highlight';
import RevealNotes from 'reveal.js/plugin/notes';

<Deck plugins={[RevealHighlight, RevealNotes]}>
  {/* slides */}
</Deck>
```

React plugin rule: plugins are initialization-only. Keep the plugin array stable and do not expect changing it after mount to re-register plugins.

## Plugin API

```js
Reveal.hasPlugin('highlight');
Reveal.getPlugin('highlight');
Reveal.getPlugins();
```

## Search plugin

```html
<script src="dist/plugin/search.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealSearch]
  });
</script>
```

Press `Ctrl+Shift+F` to search slide content.

## Zoom plugin

```html
<script src="dist/plugin/zoom.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealZoom]
  });
</script>
```

Alt-click to zoom. On Linux, use Ctrl-click.

---

# 33. Writing Custom Plugins

A plugin is an object with an `id`, optional `init`, and optional `destroy`.

```js
const TimerPlugin = {
  id: 'timer',

  init(deck) {
    const startedAt = Date.now();

    const onSlideChanged = () => {
      console.log('Elapsed seconds', Math.round((Date.now() - startedAt) / 1000));
    };

    deck.on('slidechanged', onSlideChanged);

    return {
      getElapsedSeconds() {
        return Math.round((Date.now() - startedAt) / 1000);
      }
    };
  },

  destroy() {
    console.log('Timer plugin destroyed');
  }
};

Reveal.initialize({
  plugins: [TimerPlugin]
});
```

## Factory function pattern

Use a factory when multiple deck instances may exist:

```js
function createTimerPlugin(options = {}) {
  return {
    id: 'timer',
    init(deck) {
      const startedAt = Date.now();

      if (options.logOnReady) {
        console.log('Timer ready');
      }

      return {
        getElapsedSeconds() {
          return Math.round((Date.now() - startedAt) / 1000);
        }
      };
    }
  };
}
```

Register:

```js
Reveal.initialize({
  plugins: [createTimerPlugin({ logOnReady: true })]
});
```

## Async plugin initialization

If `init` returns a Promise, reveal.js waits for it before finishing initialization:

```js
const DataPlugin = {
  id: 'data',
  async init(deck) {
    const response = await fetch('/data.json');
    const data = await response.json();

    return {
      getData() {
        return data;
      }
    };
  }
};
```

## React custom plugin

```tsx
const AnalyticsPlugin = {
  id: 'analytics',
  init(deck) {
    const onSlideChange = (event) => {
      console.log('Slide', event.indexh, event.indexv);
    };

    deck.on('slidechanged', onSlideChange);

    return {
      destroy() {
        deck.off('slidechanged', onSlideChange);
      }
    };
  }
};

<Deck plugins={[AnalyticsPlugin]}>
  {/* slides */}
</Deck>
```

Keep plugin objects stable. Define them outside React render functions or memoize them.

---

# 34. PDF Export and Print Workflows

reveal.js supports browser-based PDF export.

## Export steps

1. Run your deck locally or open the deployed deck.
2. Add `?print-pdf` to the URL.
3. Open the browser print dialog.
4. Choose “Save as PDF”.
5. Use landscape layout.
6. Use no margins.
7. Enable background graphics.
8. Save.

Example:

```text
http://localhost:8000/?print-pdf
```

## PDF config

```js
Reveal.initialize({
  pdfSeparateFragments: true,
  pdfMaxPagesPerSlide: Number.POSITIVE_INFINITY,
  pdfPageHeightOffset: -1,
  showSlideNumber: 'print'
});
```

## Fragment printing

By default, fragments can be printed as separate PDF pages. Turn this off if you want only final slide states:

```js
Reveal.initialize({
  pdfSeparateFragments: false
});
```

## Print-friendly tips

- Test with `?print-pdf` early.
- Avoid videos as essential content in exported PDFs.
- Provide image fallbacks for animations or live demos.
- Use high-resolution images.
- Enable background graphics in print settings.
- Avoid text near slide edges.

## Automated PDF export

For CI workflows, teams often use browser automation tools or dedicated HTML slide export tools. Validate output manually before relying on automation for conference or classroom distribution.

---

# 35. Deployment

A reveal.js deck is usually static assets, so it deploys well to:

- GitHub Pages;
- Netlify;
- Vercel;
- Cloudflare Pages;
- S3 + CloudFront;
- any static file server.

## Deploy a Vite project

```bash
npm run build
```

Deploy the generated `dist/` folder.

## Base path issues

If deploying under a subpath, configure your build tool’s base path.

Vite example:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/my-deck/'
});
```

## URL hashes

Enable `hash: true` for shareable slide URLs:

```js
Reveal.initialize({
  hash: true
});
```

This makes it easier to link to a specific slide.

## Asset checklist

Before publishing:

- build the project;
- preview the production build;
- check fonts, images, videos, and iframes;
- test on projector aspect ratio;
- test on phone if using Scroll View;
- export a PDF backup;
- confirm speaker notes work locally and on the presenting machine.

---

# 36. React Integration Deep Dive

The React wrapper lets you describe reveal.js decks with React components while the wrapper handles initialization, syncing, and cleanup.

## Basic structure

```tsx
import { Deck, Slide, Stack } from '@revealjs/react';

export function Presentation() {
  return (
    <Deck>
      <Slide>Slide 1</Slide>
      <Stack>
        <Slide>Vertical 1</Slide>
        <Slide>Vertical 2</Slide>
      </Stack>
      <Slide>Slide 2</Slide>
    </Deck>
  );
}
```

## Passing config

```tsx
<Deck
  config={{
    width: 1280,
    height: 720,
    hash: true,
    transition: 'fade',
    slideNumber: 'c/t'
  }}
>
  {/* slides */}
</Deck>
```

## Slide props

Many reveal.js slide-level `data-*` features map to props:

```tsx
<Slide
  background="#111827"
  transition="zoom"
  autoAnimate
>
  <h2>Configured slide</h2>
</Slide>
```

Background-related props include:

```text
background
backgroundColor
backgroundImage
backgroundVideo
backgroundVideoLoop
backgroundVideoMuted
backgroundIframe
backgroundGradient
backgroundSize
backgroundPosition
backgroundRepeat
backgroundOpacity
backgroundTransition
```

Auto-Animate props include:

```text
autoAnimate
autoAnimateId
autoAnimateRestart
autoAnimateUnmatched
autoAnimateEasing
autoAnimateDuration
autoAnimateDelay
```

## Fragments

```tsx
<Slide>
  <h2>Step by step</h2>
  <Fragment as="p">One</Fragment>
  <Fragment as="p" animation="fade-up">Two</Fragment>
  <Fragment as="p" animation="highlight-green" index={3}>Three</Fragment>
</Slide>
```

## Code

```tsx
import { Code } from '@revealjs/react';
import RevealHighlight from 'reveal.js/plugin/highlight';
import 'reveal.js/plugin/highlight/monokai.css';

<Deck plugins={[RevealHighlight]}>
  <Slide>
    <Code language="tsx" lineNumbers="1|3-5">
      {`export function Button() {
  return <button>Click</button>;
}`}
    </Code>
  </Slide>
</Deck>
```

## Markdown

```tsx
import { Markdown } from '@revealjs/react';

<Deck>
  <Markdown>{`
    ## Agenda

    - Context
    - Demo
    - Plan

    ---

    ## Demo
  `}</Markdown>
</Deck>
```

External Markdown:

```tsx
<Markdown src="/slides/content.md" />
```

Markdown options:

```tsx
<Markdown options={{ animateLists: true, smartypants: true }}>
  {`
    ## List

    - One
    - Two
    - Three
  `}
</Markdown>
```

## Events

```tsx
<Deck
  onReady={(deck) => console.log('Ready', deck)}
  onSlideChange={(event) => console.log(event.indexh, event.indexv)}
  onFragmentShown={(event) => console.log(event.fragment)}
>
  <Slide>Intro</Slide>
</Deck>
```

## Calling reveal.js from React components

```tsx
import { useReveal } from '@revealjs/react';

function Controls() {
  const deck = useReveal();

  return (
    <div>
      <button onClick={() => deck?.prev()}>Prev</button>
      <button onClick={() => deck?.next()}>Next</button>
      <button onClick={() => deck?.toggleOverview()}>Overview</button>
    </div>
  );
}
```

## Accessing the deck via ref

```tsx
import { useRef } from 'react';
import type { RevealApi } from 'reveal.js';

export function PresentationShell() {
  const deckRef = useRef<RevealApi | null>(null);

  return (
    <>
      <button onClick={() => deckRef.current?.slide(0)}>
        Back to start
      </button>

      <Deck deckRef={deckRef}>
        <Slide>Start</Slide>
      </Deck>
    </>
  );
}
```

## React lifecycle behavior

The wrapper behaves roughly as follows:

- `Deck` creates one reveal.js instance on mount.
- Initialization is async.
- `onReady` fires after initialization resolves.
- `useReveal()` and `deckRef` are available after ready.
- Slide structure changes trigger `reveal.sync()`.
- Slide prop changes can be synced efficiently with `reveal.syncSlide()`.
- Config changes call `reveal.configure()` when the shallow values change.
- Plugins are captured at first mount and are not dynamically re-registered.
- Event listeners are attached and cleaned up automatically.

## React StrictMode

React StrictMode may mount, unmount, and remount components during development. The official wrapper is designed to handle initialization and cleanup, but your own side effects must also clean up correctly.

Good:

```tsx
useEffect(() => {
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}, []);
```

Bad:

```tsx
useEffect(() => {
  window.setInterval(tick, 1000);
}, []);
```

---

# 37. Integrating Other React Components

You can place normal React components inside `Slide`.

```tsx
<Slide>
  <MetricCard label="Conversion" value="12.4%" />
</Slide>
```

The key is to decide whether the component is:

1. Static visual content.
2. Interactive UI.
3. Data-driven visualization.
4. A component that measures the DOM.
5. A component that uses portals/modals.
6. A component that needs keyboard focus.

Each category has different integration concerns.

## Static components

Static components are easiest:

```tsx
function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}
```

```tsx
<Slide>
  <MetricCard label="Revenue growth" value="28%" />
</Slide>
```

## Interactive components

Interactive components should preserve focus and avoid fighting reveal.js keyboard navigation.

```tsx
function DemoForm() {
  return (
    <form
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
      data-prevent-swipe
    >
      <input placeholder="Type here" />
      <button type="submit">Submit</button>
    </form>
  );
}
```

Use `data-prevent-swipe` for scrollable or touch-heavy widgets.

## Chart components

Charts often need to measure their container. Render them when visible or trigger a resize/layout after slide transition.

```tsx
<Deck
  onSlideTransitionEnd={() => {
    window.dispatchEvent(new Event('resize'));
  }}
>
  <Slide>
    <MyResponsiveChart />
  </Slide>
</Deck>
```

If the chart library exposes a resize method, call that instead of dispatching a global resize.

## Components that load data

Keep data fetching inside the component, but consider slide visibility. For heavy data, fetch before the talk or preload near the slide.

```tsx
function DataSlide() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/metrics.json')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return <p>Loading…</p>;

  return <Chart data={data} />;
}
```

For conference talks, avoid relying on live network calls unless the point of the talk is to show live behavior.

## Components with portals

Modal libraries often render outside the deck root using React portals. This can work, but check layering and keyboard behavior.

Tips:

- set high enough `z-index` for modals;
- stop propagation for modal keyboard shortcuts;
- close modals on slide change if appropriate;
- avoid focus traps that prevent exiting the slide deck.

Example:

```tsx
<Deck
  onSlideChange={() => {
    closeAnyOpenDemoModals();
  }}
>
  {/* slides */}
</Deck>
```

## Components with animations

React animation libraries can coexist with reveal.js transitions and fragments. Keep responsibilities clear:

- reveal.js controls slide-to-slide movement;
- fragments control presentation steps;
- React animation controls local component motion.

Example with a local component animation:

```tsx
<Slide>
  <Fragment asChild>
    <AnimatedCallout>Appears as a fragment, then animates internally</AnimatedCallout>
  </Fragment>
</Slide>
```

## Tailwind CSS

Tailwind works well with React reveal.js decks.

```tsx
<Slide>
  <div className="mx-auto max-w-3xl rounded-2xl p-8 shadow-xl">
    <h2 className="text-5xl font-bold tracking-tight">Launch Plan</h2>
    <p className="mt-4 text-2xl opacity-80">Three stages, one rollback path.</p>
  </div>
</Slide>
```

Remember that reveal.js themes also set typography. You may need to override theme styles or use more specific selectors.

## shadcn/ui and component libraries

Component libraries work as normal React components, but check:

- global CSS resets;
- font assumptions;
- modal portal containers;
- keyboard event propagation;
- focus rings and projector visibility;
- dark/light theme interaction with reveal.js theme.

## React state and fragments

Fragments are presentation state, not React state. Avoid coupling business logic to whether a fragment is visible unless you explicitly listen to fragment events.

```tsx
<Deck
  onFragmentShown={(event) => {
    if (event.fragment.matches('[data-start-demo]')) {
      startDemo();
    }
  }}
>
  <Slide>
    <div className="fragment" data-start-demo>
      Start demo
    </div>
  </Slide>
</Deck>
```

## Dynamic slide arrays

You can render slides from data:

```tsx
const topics = [
  { title: 'Problem', body: 'Users wait too long.' },
  { title: 'Solution', body: 'Move work off the request path.' }
];

<Deck>
  {topics.map((topic) => (
    <Slide key={topic.title}>
      <h2>{topic.title}</h2>
      <p>{topic.body}</p>
    </Slide>
  ))}
</Deck>
```

Use stable keys. If you add/remove/reorder slides, the wrapper syncs the deck structure.

## When to call `layout()` or `sync()`

In React with the official wrapper:

- ordinary content changes inside a slide usually do not need `sync()`;
- adding/removing/reordering slides is handled by the wrapper;
- container size changes may need `deck.layout()`;
- third-party visualizations may need their own resize method;
- dynamic changes to slide-level attributes are handled by slide sync.

Manual example:

```tsx
function ResizeDeckButton() {
  const deck = useReveal();

  return (
    <button onClick={() => deck?.layout()}>
      Recalculate layout
    </button>
  );
}
```

---

# 38. Next.js, Remix, Astro, and SSR Caveats

reveal.js depends on browser APIs. Server-side rendering frameworks need client-only boundaries.

## General SSR rules

- Import reveal.js CSS globally or in a client-only route depending on framework rules.
- Render the deck only on the client.
- Avoid accessing `window`, `document`, or reveal.js APIs during server render.
- Use dynamic import with SSR disabled when necessary.

## Next.js App Router pattern

Create a client component:

```tsx
'use client';

import { Deck, Slide } from '@revealjs/react';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';

export default function Presentation() {
  return (
    <Deck config={{ hash: true }}>
      <Slide>
        <h1>Next.js Deck</h1>
      </Slide>
    </Deck>
  );
}
```

If a route still has SSR issues, dynamically import the presentation with SSR disabled:

```tsx
import dynamic from 'next/dynamic';

const Presentation = dynamic(() => import('./Presentation'), {
  ssr: false
});

export default function Page() {
  return <Presentation />;
}
```

## Remix pattern

Render reveal.js only after the component has mounted:

```tsx
import { useEffect, useState } from 'react';

export default function DeckRoute() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <Presentation />;
}
```

## Astro pattern

Use a client directive:

```astro
---
import Presentation from '../components/Presentation.jsx';
---

<Presentation client:only="react" />
```

## CSS in SSR frameworks

Some frameworks restrict global CSS imports to root files. If importing reveal.js CSS inside the presentation component fails, move these imports to the global app entry:

```ts
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
```

---

# 39. Accessibility and Performance

## Accessibility basics

- Use real headings and lists.
- Provide `alt` text for images that convey meaning.
- Use sufficient color contrast.
- Do not rely only on color to communicate status.
- Keep text large enough for projection.
- Avoid rapid motion or flashing.
- Provide a PDF or scroll-view version for review.
- Test keyboard navigation.

## Speaker accessibility

Speaker View is useful, but keep a backup:

- export a PDF;
- keep notes in a separate document;
- test presenter display before the talk;
- avoid essential information existing only in speaker notes.

## Performance basics

- Use `data-src` for large media.
- Compress images.
- Avoid loading heavy iframes before needed.
- Use `viewDistance` and `mobileViewDistance` thoughtfully.
- Avoid huge DOM trees on every slide.
- Avoid dozens of live charts at once.
- Use video backgrounds sparingly.
- Prefer static screenshots for backup slides.

## Heavy React components

For expensive components:

- lazy-load them near the slide;
- render static fallbacks;
- pause timers on slide change;
- unmount when no longer needed if safe;
- avoid continuous animation on hidden slides.

Example:

```tsx
<Deck
  onSlideChange={() => {
    stopExpensiveAnimations();
  }}
>
  {/* slides */}
</Deck>
```

---

# 40. Common Recipes

## Title slide

```html
<section data-background-gradient="linear-gradient(135deg, #0f172a, #1e3a8a)">
  <h1>Building Reliable Systems</h1>
  <p>May 2026</p>
</section>
```

## Agenda with fragments

```html
<section>
  <h2>Agenda</h2>
  <ol>
    <li class="fragment">Context</li>
    <li class="fragment">Architecture</li>
    <li class="fragment">Demo</li>
    <li class="fragment">Rollout plan</li>
  </ol>
</section>
```

## Quote slide

```html
<section>
  <blockquote>
    “Make illegal states unrepresentable.”
  </blockquote>
</section>
```

## Big number slide

```html
<section>
  <h2 class="r-fit-text">38%</h2>
  <p>Reduction in median latency</p>
</section>
```

## Before/after stack

```html
<section>
  <h2>Before and after</h2>
  <div class="r-stack">
    <img class="fragment fade-out" data-fragment-index="0" src="before.png" alt="Before" />
    <img class="fragment current-visible" data-fragment-index="0" src="after.png" alt="After" />
  </div>
</section>
```

## Auto-animated diagram

```html
<section data-auto-animate>
  <h2>Request path</h2>
  <div data-id="api">API</div>
</section>

<section data-auto-animate>
  <h2>Request path</h2>
  <div data-id="api">API</div>
  <div data-id="queue">Queue</div>
</section>
```

## Speaker-note-only reminder

```html
<section>
  <h2>Migration plan</h2>
  <aside class="notes">
    Pause here and ask whether anyone needs the backup slides.
  </aside>
</section>
```

## Search-enabled deck

```html
<script src="dist/plugin/search.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealSearch]
  });
</script>
```

## React chart slide

```tsx
<Slide>
  <h2>Adoption</h2>
  <AdoptionChart data={data} />
</Slide>
```

If the chart mismeasures:

```tsx
<Deck onSlideTransitionEnd={() => window.dispatchEvent(new Event('resize'))}>
  {/* slides */}
</Deck>
```

---

# 41. Troubleshooting

## Slides are not styled

Check that both core CSS and a theme are loaded:

Classic:

```html
<link rel="stylesheet" href="dist/reveal.css" />
<link rel="stylesheet" href="dist/theme/black.css" />
```

npm:

```ts
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
```

## Markdown is not rendered

Check that:

- the Markdown plugin is loaded;
- it is passed in the `plugins` array;
- your slide has `data-markdown`;
- your Markdown is inside `<textarea data-template>` for inline Markdown;
- you are using a local server for external Markdown.

## Code is not highlighted

Check that:

- the highlight plugin is registered;
- a highlight CSS theme is imported;
- the code block uses a language class or detectable language;
- the code exists before highlight runs, or you manually call highlighting for dynamic code.

## Speaker View does not open

Check that:

- the notes plugin is registered;
- popups are not blocked;
- you pressed `S` while the deck has focus.

## Keyboard shortcuts do not work

Check that:

- the deck has browser focus;
- an iframe or input has not captured focus;
- `keyboard` is not disabled;
- embedded decks use a suitable `keyboardCondition`.

## PDF export misses backgrounds

Enable background graphics in the browser print dialog. Use `?print-pdf`, landscape layout, and no margins.

## React deck initializes twice

In development, React StrictMode can mount and unmount components. Use the official wrapper and clean up your own side effects. Do not manually call `Reveal.initialize()` inside components using `@revealjs/react`.

## React component is cut off

Check:

- slide `width` and `height`;
- `center` setting;
- CSS overflow;
- whether reveal.js scaling is shrinking content;
- whether `r-stretch` is used correctly;
- whether the component needs a resize after slide transition.

## Iframe steals keyboard focus

Click outside the iframe or configure focus behavior. For embedded decks, use:

```js
Reveal.initialize({
  keyboardCondition: 'focused'
});
```

For app-controlled iframes, consider overlay controls or explicit focus management.

## Assets work locally but fail after deployment

Check base path and relative URLs. In Vite, configure `base` if deploying under a subpath.

---

# 42. Best Practices Checklist

## Before building

- Choose HTML, Markdown, npm, or React based on deck complexity.
- Pick a 16:9 or 4:3 size early.
- Choose a theme or create a design system.
- Decide whether a PDF handout is required.

## While authoring

- Use one idea per slide.
- Use vertical slides for optional detail.
- Use fragments for pacing, not for hiding too much text.
- Use `data-id` for Auto-Animate reliability.
- Add speaker notes as you write.
- Keep images optimized.
- Use lazy loading for heavy media.
- Keep interactive demos isolated and rehearsed.

## For React decks

- Use `@revealjs/react` instead of manual initialization.
- Keep plugin arrays stable.
- Put reveal config in the `config` prop.
- Use `useReveal()` for deck API access.
- Clean up timers and subscriptions.
- Stop event propagation for inputs and complex widgets.
- Test components after slide transitions.

## Before presenting

- Test on the actual projector or display ratio.
- Test keyboard and presenter view.
- Export a PDF backup.
- Test offline if network is uncertain.
- Confirm videos and iframes load.
- Check font rendering on the presenting machine.
- Practice with speaker notes.

---

# 43. Example Projects

## Example A: Static HTML project

```text
static-deck/
  index.html
  custom.css
  images/
    architecture.svg
  dist/
    reveal.css
    reveal.js
    theme/
      black.css
    plugin/
      markdown.js
      highlight.js
      notes.js
      highlight/
        monokai.css
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Static reveal.js Deck</title>
    <link rel="stylesheet" href="dist/reveal.css" />
    <link rel="stylesheet" href="dist/theme/black.css" />
    <link rel="stylesheet" href="dist/plugin/highlight/monokai.css" />
    <link rel="stylesheet" href="custom.css" />
  </head>
  <body>
    <div class="reveal">
      <div class="slides">
        <section>
          <h1>Static Deck</h1>
        </section>

        <section data-markdown>
          <textarea data-template>
            ## Markdown

            - One
            - Two
          </textarea>
        </section>

        <section>
          <h2>Code</h2>
          <pre><code data-trim data-line-numbers class="language-js">
            const hello = 'world';
            console.log(hello);
          </code></pre>
        </section>
      </div>
    </div>

    <script src="dist/reveal.js"></script>
    <script src="dist/plugin/markdown.js"></script>
    <script src="dist/plugin/highlight.js"></script>
    <script src="dist/plugin/notes.js"></script>
    <script>
      Reveal.initialize({
        hash: true,
        slideNumber: 'c/t',
        plugins: [RevealMarkdown, RevealHighlight, RevealNotes]
      });
    </script>
  </body>
</html>
```

## Example B: Vite TypeScript project

```text
vite-deck/
  index.html
  package.json
  src/
    main.ts
    styles.css
    slides.html
```

`src/main.ts`:

```ts
import Reveal from 'reveal.js';
import Highlight from 'reveal.js/plugin/highlight';
import Notes from 'reveal.js/plugin/notes';

import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import 'reveal.js/plugin/highlight/monokai.css';
import './styles.css';

const deck = new Reveal({
  hash: true,
  width: 1280,
  height: 720,
  plugins: [Highlight, Notes]
});

deck.initialize();
```

## Example C: React project

```text
react-deck/
  index.html
  package.json
  src/
    main.tsx
    Presentation.tsx
    components/
      MetricCard.tsx
      DemoControls.tsx
    styles.css
```

`Presentation.tsx`:

```tsx
import { Deck, Slide, Stack, Fragment, Code, useReveal } from '@revealjs/react';
import RevealHighlight from 'reveal.js/plugin/highlight';
import RevealNotes from 'reveal.js/plugin/notes';
import 'reveal.js/plugin/highlight/monokai.css';

function DemoControls() {
  const deck = useReveal();

  return (
    <div className="controls">
      <button onClick={() => deck?.prev()}>Prev</button>
      <button onClick={() => deck?.next()}>Next</button>
    </div>
  );
}

export function Presentation() {
  return (
    <Deck
      config={{
        hash: true,
        width: 1280,
        height: 720,
        slideNumber: 'c/t'
      }}
      plugins={[RevealHighlight, RevealNotes]}
    >
      <Slide>
        <h1>React Deck</h1>
        <DemoControls />
      </Slide>

      <Stack>
        <Slide>
          <h2>Topic</h2>
        </Slide>
        <Slide>
          <h2>Deep dive</h2>
        </Slide>
      </Stack>

      <Slide>
        <h2>Fragments</h2>
        <Fragment as="p">First</Fragment>
        <Fragment as="p" animation="fade-up">Second</Fragment>
      </Slide>

      <Slide>
        <h2>Code</h2>
        <Code language="tsx" lineNumbers="1|2-4">
          {`function Hello() {
  return <h1>Hello</h1>;
}`}
        </Code>
      </Slide>
    </Deck>
  );
}
```

---

# 44. Migration Notes for reveal.js 6

reveal.js 6 added the official React wrapper and updated build/package conventions.

Important migration points:

- The official React package is `@revealjs/react`.
- Classic file-system plugin paths use `dist/plugin/<name>.js`.
- ES module files use `.mjs` naming in the distribution.
- npm CSS imports no longer use the old `dist/` prefix in the public package API; use imports such as `reveal.js/reveal.css` and `reveal.js/theme/black.css`.
- TypeScript types are bundled with reveal.js; remove older external `@types/reveal.js` usage when migrating.
- reveal.js uses Vite for the development/build workflow in the current major version.

## Migration checklist

1. Update reveal.js and plugins.
2. Fix CSS import paths.
3. Fix plugin script paths.
4. Remove external `@types/reveal.js` if present.
5. Test initialization.
6. Test Markdown, code highlighting, notes, math, and PDF export.
7. Test React decks under development StrictMode and production build.
8. Export a PDF and compare with the old deck.

---

# Closing Guidance

Use reveal.js as a presentation runtime, not just a slide renderer. The most powerful decks combine clear slide structure, careful pacing, reusable styling, and just enough interactivity to make the subject easier to understand.

For most modern projects:

- use plain HTML or Markdown for simple decks;
- use npm/Vite for customized decks;
- use `@revealjs/react` when slides should be components;
- use plugins deliberately;
- test PDF export and presenter view early;
- keep a static fallback for live demos.

