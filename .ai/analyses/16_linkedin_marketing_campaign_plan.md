# LinkedIn Marketing Campaign Plan For beginning-harness

## Channel Role

LinkedIn should be the flagship thought-leadership channel for this launch. The strongest audience fit is technical founders, staff engineers, engineering managers, AI tooling builders, and developers who are trying to operationalize AI agents beyond demos.

LinkedIn should not be treated as a pure traffic channel. It should build category understanding:

- What is harness engineering?
- Why does local agent setup drift?
- Why should skills, MCP servers, extensions, defaults, and project overlays be managed as infrastructure?
- Why is `beginning-harness` a pragmatic local control plane rather than another agent framework?

## Platform Constraints

LinkedIn Help states that posts have a 3,000 character limit and that longer content can be published as articles. Source checked on 2026-04-28: https://www.linkedin.com/help/recruiter/answer/a528176

Practical campaign implication:

- Use 900 to 1,800 character founder posts for most content
- Keep the first 2 lines sharp because LinkedIn truncates feed posts
- Use comments for links if testing whether external links suppress reach
- Use one focused CTA per post
- Prefer founder profile first, company page second

## Recommended LinkedIn Cadence

### Launch Week

- Day 1: Founder launch post
- Day 2: Technical "how it works" post
- Day 3: Safety and dry-run post
- Day 4: Extension architecture post
- Day 5: Ask-for-feedback post
- Day 7: Recap and roadmap post

### Month One

- 2 posts per week from founder profile
- 1 technical demo post per week
- 1 community ask or build note per week
- Repost from project/company account only after founder post has traction

## Content Pillars

### Pillar 1: The Harness Problem

Angle:

The more capable models get, the more the surrounding harness determines whether they can work reliably.

Use when:

- Introducing the category
- Connecting to harness engineering discourse
- Explaining why this repo exists

### Pillar 2: Local Config Drift

Angle:

AI agent setups have become a scattered local operations problem: skills here, MCP JSON there, project-specific rules elsewhere.

Use when:

- Making the problem concrete
- Showing before/after workflow
- Speaking to developers who maintain dotfiles

### Pillar 3: Project-Aware Agent Work

Angle:

Every repo should be able to declare the agent capabilities it needs without rewriting global config.

Use when:

- Demonstrating `bgng init`
- Demonstrating `bgng add extension parallel`
- Demonstrating project overlays

### Pillar 4: Safe Write Loop

Angle:

Agent config changes should be inspectable before they mutate local files.

Use when:

- Building trust
- Explaining `bgng status`, `bgng doctor`, and `bgng write --dry-run`
- Addressing skepticism about tools writing to `~/.claude`, `~/.codex`, `~/.cursor`, and `~/.agents`

## Founder-Led Post Drafts

### Draft A: Launch Manifesto

Every serious AI agent setup eventually becomes a harness problem.

The model matters. But the local environment around the model decides whether the agent behaves consistently:

- Which skills does it see?
- Which MCP servers can it call?
- Which project rules apply?
- Which extension setup is active?
- Which generated configs have drifted?

I kept running into the same problem across Codex, Claude Code, Cursor, and local agent tools: the harness was scattered across dotfiles, symlinks, MCP JSON, skill folders, and project notes.

So I built `beginning-harness`.

It is a local meta-harness for AI agent tools: one CLI to manage skills, MCP servers, extensions, user defaults, project overlays, downstream tool configs, and diagnostics.

The command is `bgng`.

The basic loop is intentionally conservative:

```bash
bgng status
bgng skills list
bgng mcp list
bgng write --dry-run
bgng write
```

This is not another coding agent. It is the local harness around the agents you already use.

Repo: https://github.com/remyjkim/beginning-harness

If you are managing AI agent setup through a pile of dotfiles and hand-edited MCP configs, I would like your feedback.

### Draft B: Problem First

I do not think the next wave of AI developer tooling is only about better agents.

It is also about better harnesses.

In practice, the quality of an AI coding session depends on a lot of local state that is not the model:

- instructions and skills
- MCP servers
- CLI tools
- project-specific rules
- generated downstream config
- diagnostics
- safe apply/dry-run loops

Most of that state lives in different places.

One tool reads `~/.claude`.
Another reads `~/.codex`.
Cursor has its own config.
Skills may be symlinked from somewhere else.
MCP servers may be duplicated by hand.
Project-specific overrides are easy to forget.

That is the layer I wanted to make explicit.

`beginning-harness` is my attempt at a local control plane for that layer.

It gives you:

- a reusable local skill and MCP library
- machine-wide defaults
- per-project overlays
- extension support for things like Parallel and Beads
- `status`, `doctor`, and `write --dry-run` before mutation

The goal is simple: make the harness inspectable before asking agents to rely on it.

Repo: https://github.com/remyjkim/beginning-harness

### Draft C: Founder Story

I kept making the same mistake with AI coding tools.

Whenever something felt off, I would blame the agent.

But after enough sessions, the pattern was obvious: the problem was often the surrounding harness.

The agent did not know the right project rule.
The MCP config was different in another tool.
The skill existed for one runtime but not another.
A project needed Parallel skills, but only that project.
Generated config had drifted.

None of these are model problems. They are local operations problems.

That led me to build `beginning-harness`.

It treats local agent setup as something you can inspect, version, dry-run, and apply:

```bash
bgng init
bgng add extension parallel
bgng add skill <name-or-query>
bgng add mcp <server-name>
bgng write --dry-run
```

The model still matters.

But if we want agents to become reliable collaborators, the harness around them needs to become first-class infrastructure too.

Repo: https://github.com/remyjkim/beginning-harness

### Draft D: Technical Walkthrough

I built `beginning-harness` around one local workflow:

Inspect first. Mutate later.

The CLI manages the local harness around AI agent tools:

- skills
- MCP servers
- extensions
- user defaults
- project overlays
- generated downstream configs
- diagnostics

The core flow:

```bash
bgng status
bgng doctor
bgng write --dry-run
bgng write
```

For a project-specific setup:

```bash
bgng init
bgng add extension parallel
bgng add skill <name-or-query>
bgng add mcp <server-name>
bgng write --dry-run
```

That creates a project-level harness config under:

```bash
<project>/.agents/bgng/config.json
```

Global defaults live separately under the user harness config, and reusable assets can live in the local library.

The design principle is that a repo should be able to declare what agent capabilities it needs without permanently rewriting the global baseline.

Repo: https://github.com/remyjkim/beginning-harness

I would especially like feedback from people using multiple local agent tools on the same machine.

### Draft E: Feedback Ask

I am opening up `beginning-harness` for feedback.

It is a local meta-harness for AI agent tools. The premise:

If agents are going to become reliable parts of a developer workflow, the local harness around them needs to be explicit.

The first version focuses on:

- syncing skills across local agent tools
- managing MCP servers
- project-specific overlays
- a local skill/MCP library
- extension setup for Parallel and Beads
- dry-run and diagnostic workflows

I am especially interested in feedback on three questions:

1. What local agent config do you currently manage by hand?
2. Which MCP servers or skills should be easier to reuse across projects?
3. What should an "extension" do beyond skills and MCP setup?

Repo: https://github.com/remyjkim/beginning-harness

If you have a messy local agent setup, that is exactly the kind of use case I want to learn from.

## Comment Replies To Prepare

### "Is this for teams or individuals?"

The first release is optimized for individual local development, but the architecture is intentionally moving toward team-reviewable harness config: project overlays, explicit defaults, and extension setup that can live with a repo.

### "Why not just use dotfiles?"

Dotfiles are useful for static config. `beginning-harness` is focused on resolving skills, MCP servers, package-backed assets, user defaults, project overlays, extension config, and generated downstream files together. It can still work alongside dotfiles.

### "Does this manage hosted agents?"

No. It is local-first. The scope is the harness around local developer tools and the config they consume.

## LinkedIn Asset Recommendations

### Post A Asset

Use `the-beginning-harness.png` as a launch visual.

Alt text:

"Green and black retro poster reading 'The Beginning Harness' with the subtitle 'The only harness you'll ever need.'"

### Post B Asset

Carousel:

1. "The agent is not always the thing that is broken."
2. "Sometimes your local harness has drifted."
3. "Skills, MCP servers, extensions, defaults, project overlays."
4. "`bgng status` -> `bgng write --dry-run` -> `bgng write`."
5. "Repo: beginning-harness."

### Post C Asset

Terminal screenshot showing:

```bash
bgng status
bgng write --dry-run
bgng doctor
```

## Success Criteria

Strong LinkedIn launch:

- 10+ comments with real workflow questions
- 3+ concrete extension or MCP requests
- 2+ people asking about team usage or project config
- GitHub stars from developers outside the immediate network
- At least one deeper follow-up conversation about harness engineering

Weak LinkedIn launch:

- Likes without comments
- General AI hype discussion
- Comments about the image only
- No GitHub traffic
