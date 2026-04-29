# Instagram Marketing Campaign Plan For beginning-harness

## Channel Role

Instagram should be the visual explanation channel. It is not the primary conversion channel for a developer CLI, but it can make the concept memorable and give the launch a stronger identity.

The best Instagram use cases:

- hero image launch post
- carousel explaining the harness problem
- short Reels showing terminal commands
- Stories linking to GitHub if link tools are available
- founder build notes with screenshots

## Platform Constraints

Sprout Social summarizes Instagram captions as having a 2,200 character limit, with truncation around 125 characters. Source checked on 2026-04-28: https://sproutsocial.com/insights/social-media-character-counter/

Practical campaign implication:

- Put the entire hook in the first 100 to 125 characters
- Use carousels for technical explanation
- Use short captions with clear CTAs
- Do not hide the product explanation entirely in the caption
- Make the visual self-contained

## Visual System

### Primary Visual

Use `the-beginning-harness.png` for the launch post.

Alt text:

"Retro green and black poster with bold text reading 'The Beginning Harness' and a subtitle reading 'The only harness you'll ever need.'"

### Carousel Style

Use high-contrast terminal/product visuals:

- black and green palette from the hero image
- terminal snippets
- simple diagrams
- one idea per slide
- minimal text

### Reel Style

Use terminal capture rather than talking-head video first. The audience is technical, and concrete CLI output will carry more credibility.

Recommended 30 to 45 second flow:

1. "My AI agent setup kept drifting."
2. Show scattered paths: `~/.claude`, `~/.codex`, `~/.cursor`, `~/.agents`
3. Run `bgng status`
4. Run `bgng write --dry-run`
5. Show project config: `.agents/bgng/config.json`
6. End with repo URL

## Recommended Instagram Cadence

### Launch Week

- Day 1: hero image post
- Day 2: carousel: "The harness problem"
- Day 4: terminal Reel
- Day 6: Story Q&A: "What agent setup do you manage by hand?"

### Month One

- 1 carousel per week
- 1 terminal Reel every 2 weeks
- Stories after each release or docs update

## Carousel Concepts

### Carousel A: The Harness Problem

Slide 1:

The agent is not always the thing that is broken.

Slide 2:

Sometimes the local harness has drifted.

Slide 3:

Skills live in one place.
MCP servers live in another.
Project rules live somewhere else.

Slide 4:

`beginning-harness` makes that layer explicit.

Slide 5:

Library -> defaults -> project overlay -> dry-run -> apply.

Slide 6:

Try:

```bash
bgng status
bgng write --dry-run
```

Slide 7:

Repo: `github.com/remyjkim/beginning-harness`

### Carousel B: From Dotfiles To Control Plane

Slide 1:

Your AI agent setup should not be a scavenger hunt.

Slide 2:

Before:

`~/.claude`
`~/.codex`
`~/.cursor`
`~/.agents`
copied MCP JSON
random skill folders

Slide 3:

After:

one local harness model

Slide 4:

Skills.
MCP.
Extensions.
Defaults.
Project overlays.
Diagnostics.

Slide 5:

Inspect before changing anything:

```bash
bgng write --dry-run
```

Slide 6:

This is `beginning-harness`.

### Carousel C: Project-Level Harness

Slide 1:

Every repo should be able to declare its own agent harness.

Slide 2:

Start:

```bash
bgng init
```

Slide 3:

Add project capabilities:

```bash
bgng add extension parallel
bgng add skill <name>
bgng add mcp <server>
```

Slide 4:

Preview:

```bash
bgng write --dry-run
```

Slide 5:

Write only when the plan looks right.

Slide 6:

Local agent config should be inspectable.

## Founder-Led Caption Drafts

### Draft A: Hero Launch Caption

The local harness around AI agents should be first-class infrastructure.

I built `beginning-harness` because my AI agent setup kept spreading across skills, MCP configs, dotfiles, project notes, and generated tool config.

The CLI gives that layer a control plane:

```bash
bgng status
bgng doctor
bgng write --dry-run
```

It is not another coding agent. It is the local harness around the agents you already use.

Repo: github.com/remyjkim/beginning-harness

### Draft B: Carousel Caption

The model matters.

But the harness around the model decides a lot:

- which skills are available
- which MCP servers can be called
- which project rules apply
- which extensions are active
- whether generated config has drifted

`beginning-harness` makes that local harness explicit.

Repo: github.com/remyjkim/beginning-harness

### Draft C: Reel Caption

The simplest `beginning-harness` workflow:

```bash
bgng status
bgng write --dry-run
bgng doctor
```

Inspect first. Mutate later.

That principle matters when a CLI can touch local agent config under `~/.claude`, `~/.codex`, `~/.cursor`, and `~/.agents`.

Repo: github.com/remyjkim/beginning-harness

### Draft D: Founder Note Caption

I do not think reliable AI coding workflows come from models alone.

They come from the harness around the model:

instructions, skills, tools, project context, diagnostics, and a safe feedback loop.

`beginning-harness` is my attempt to make that local harness layer explicit for developers.

If your agent setup is currently a mix of dotfiles, copied JSON, and hand-managed skill folders, I would like your feedback.

## Reel Script Candidates

### Reel A: 30 Seconds

Voiceover:

"My AI agent setup became a pile of scattered config. Claude, Codex, Cursor, MCP servers, skills, project-specific rules. So I built `beginning-harness`: a local control plane for the harness around your agent tools. The key loop is simple: `bgng status`, `bgng write --dry-run`, then `bgng write`. Inspect first. Mutate later."

On-screen commands:

```bash
bgng status
bgng skills list
bgng mcp list
bgng write --dry-run
```

### Reel B: 45 Seconds

Voiceover:

"When an AI coding agent fails, I used to blame the model first. But many failures were harness failures. The right skill was missing. MCP config drifted. Project instructions were not applied. An extension was needed for one repo, not globally. `beginning-harness` makes that local layer explicit: library, defaults, project overlays, extensions, diagnostics, and safe apply."

On-screen ending:

`github.com/remyjkim/beginning-harness`

## Story Sequence

Story 1:

"Question for people using AI coding tools locally:"

Story 2:

"What do you still manage by hand?"

Story 3:

"Skills? MCP servers? Project rules? Tool-specific config?"

Story 4:

"I built `beginning-harness` for exactly this layer."

Story 5:

"Repo: github.com/remyjkim/beginning-harness"

## Success Criteria

Strong Instagram launch:

- Saves on carousel posts
- Story replies with workflow examples
- Profile clicks to GitHub link
- Reels completion above baseline
- Developers resharing the carousel to Stories

Weak Instagram launch:

- Likes only
- No profile clicks
- Visual interest without technical follow-through
