# X Marketing Campaign Plan For beginning-harness

## Channel Role

X should be the fastest feedback channel for `beginning-harness`. It is best for concise positioning, technical threads, build-in-public notes, quote-posting related harness engineering discussions, and direct interaction with AI tooling builders.

The strongest X content should be sharper and more compressed than LinkedIn:

- punchy hooks
- concrete command snippets
- short threads
- direct asks
- demo GIFs or screenshots
- opinionated but defensible claims

## Platform Constraints

X Help describes general posts as the normal post type and longer posts as posts beyond the typical 280-character limit. Longer posts can reach up to 25,000 characters for X Premium subscribers. Source checked on 2026-04-28: https://help.x.com/en/using-x/types-of-posts

Practical campaign implication:

- Assume 280 characters for broadly portable posts
- Use threads for launch explanations
- Put any mention that must notify someone in the first 280 characters of a long post
- Prefer short standalone posts over very long X Premium posts for developer launch content

## Recommended X Cadence

### Launch Day

- 1 main launch thread
- 1 single-post "what it is" summary
- 2 reply posts showing commands or screenshots
- Reply actively for the first 2 hours

### Launch Week

- Day 1: main launch thread
- Day 2: before/after dotfiles thread
- Day 3: project overlay command thread
- Day 4: extension spotlight
- Day 5: "what should we support next?" ask
- Day 7: recap thread

## Content Rules

- Make the hook specific.
- Use screenshots or terminal snippets where possible.
- Do not lead with "open-source launch" alone; lead with the problem.
- Avoid generic AI hype.
- When using "harness engineering," immediately define the local surfaces.
- Use one link at the end of the first post or in the final thread post.

## Founder-Led Drafts

### Draft A: Single Launch Post

The more I use AI coding agents, the less the bottleneck feels like the model.

The bottleneck is the local harness around it:
skills, MCP servers, extensions, defaults, project overlays, diagnostics.

I built `beginning-harness` to make that layer explicit.

https://github.com/remyjkim/beginning-harness

### Draft B: Launch Thread

1/7

I built `beginning-harness`.

It is not another coding agent.

It is a local meta-harness for the agent tools you already use: skills, MCP servers, extensions, defaults, project overlays, downstream configs, and diagnostics.

2/7

The problem:

Agent setup drifts.

One tool has one MCP config.
Another has different skills.
A project needs different rules.
An extension is useful in one repo but not globally.
Generated config gets stale.

This is a harness problem.

3/7

The core loop is intentionally boring:

```bash
bgng status
bgng skills list
bgng mcp list
bgng write --dry-run
bgng write
```

Inspect first. Mutate later.

4/7

For project-specific setup:

```bash
bgng init
bgng add extension parallel
bgng add skill <name-or-query>
bgng add mcp <server-name>
bgng write --dry-run
```

Each repo can declare its own harness overlay.

5/7

Current scope:

- Codex / Claude Code / Cursor local config
- skills
- MCP servers
- package-backed skill bundles
- Parallel extension
- Beads extension
- local library and defaults
- `doctor` diagnostics

6/7

The design principle:

Your agent environment should be inspectable, reusable, and project-aware.

Not hidden across random dotfiles and copied JSON.

7/7

Repo:
https://github.com/remyjkim/beginning-harness

I especially want feedback from people using multiple local AI coding tools and maintaining MCP or skill config by hand.

### Draft C: Dotfiles Thread

1/5

My local AI agent setup became a dotfiles problem.

Then it became a symlink problem.

Then it became an MCP JSON problem.

Then it became a project-specific config problem.

That is when I decided it needed to become a harness.

2/5

`beginning-harness` gives that layer a CLI:

```bash
bgng status
bgng doctor
bgng write --dry-run
```

It manages the local environment around agent tools, not the model itself.

3/5

It has separate concepts for:

- local library
- user defaults
- project overlays
- extensions
- downstream generated config

That separation is the main point.

4/5

Example:

One project can opt into Parallel skills.
Another can opt into Beads.
Your global defaults do not have to change.

5/5

Repo:
https://github.com/remyjkim/beginning-harness

Would like feedback from people who have already built their own version of this with shell scripts.

### Draft D: Project Overlay Post

Every repo should be able to declare its own agent harness.

That is why `beginning-harness` has project overlays:

```bash
bgng init
bgng add extension parallel
bgng add skill <name-or-query>
bgng add mcp <server-name>
bgng write --dry-run
```

The result lives under:

```bash
<project>/.agents/bgng/config.json
```

### Draft E: Extension Ask

I am thinking about extensions in `beginning-harness` as capability families.

An extension can include:

- prerequisite checks
- skills
- optional MCP setup
- project config
- diagnostics
- setup commands

Parallel and Beads are first examples.

What local agent workflows should become extensions?

### Draft F: Safety Post

I do not want agent config tools that silently rewrite my machine.

So `beginning-harness` is built around:

```bash
bgng status
bgng doctor
bgng write --dry-run
```

The CLI should tell you what it sees and what it plans to change before touching downstream config.

## Reply Templates

### "What does this actually change on disk?"

It can manage local agent config under `~/.agents`, `~/.claude`, `~/.codex`, `~/.cursor`, and project config under `<project>/.agents/bgng/config.json`. The normal flow is `write --dry-run` first so changes are inspectable.

### "Is this like chezmoi/stow?"

It overlaps with dotfile management only at the file materialization layer. The main model is higher level: skills, MCP servers, extensions, local library, defaults, project overlays, diagnostics, and generated downstream configs.

### "Can I add npm skill packages?"

Yes. The local library can include package-backed skills, and project config can opt into repo-native or installed package-backed skills.

## X-Specific Asset Ideas

- 20 second terminal GIF: `bgng status`, `bgng write --dry-run`, `bgng doctor`
- Screenshot of `<project>/.agents/bgng/config.json`
- Hero image for launch post only
- Before/after diagram:
- Before: scattered config
- After: library -> defaults -> project overlay -> apply

## Suggested Hashtags

Use sparingly:

- `#AI`
- `#MCP`
- `#OpenSource`

Do not overuse hashtags. Developer audiences on X usually respond better to clear technical copy than hashtag stuffing.

## Success Criteria

Strong X launch:

- Replies asking detailed implementation questions
- Quotes from AI tooling builders
- GitHub traffic spike
- Stars from outside first-degree network
- Follow-up discussion on extensions and project-level config

Weak X launch:

- Impressions without clicks
- Generic AI debate
- Replies only about naming or visuals
