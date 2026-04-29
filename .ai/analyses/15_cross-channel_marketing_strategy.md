# Cross-Channel Marketing Strategy For beginning-harness

## Purpose

This document defines the launch campaign strategy for `beginning-harness`, the local meta-harness for AI agent tools. The goal is to turn the repo into a clear public project with a founder-led narrative, credible technical positioning, and a repeatable content system across LinkedIn, X, Threads, Instagram, and developer communities.

## Current Launch State

- GitHub repo: `https://github.com/remyjkim/beginning-harness`
- Package name: `beginning-harness`
- CLI command: `bgng`
- Current npm state checked locally on 2026-04-28: `npm view beginning-harness` returns `E404`
- Launch implication: do not publish broad install CTAs until npm is live unless using a repo-clone CTA
- Primary public asset: `the-beginning-harness.png`
- Primary product promise: make the local harness around AI agents explicit, inspectable, reusable, project-aware, and safe to apply

## Positioning

### Core Category

`beginning-harness` should claim the local operator layer of harness engineering.

It is not another coding agent. It is not a hosted agent runtime. It is the local control plane for the messy operational layer around agent tools:

- skills and instructions
- MCP servers and tool definitions
- extensions such as Parallel and Beads
- user defaults
- project overlays
- downstream configs for Codex, Claude Code, Cursor, and `~/.agents`
- diagnostics and dry-run apply flows

### Short Positioning Line

`beginning-harness` is a local meta-harness for AI agent tools.

### Slightly Longer Positioning Line

`beginning-harness` gives developers one local control plane for skills, MCP servers, extensions, defaults, project overlays, downstream tool configs, and diagnostics.

### Founder-Led Narrative

The founder narrative should be pragmatic and concrete:

"The more I used coding agents, the less the bottleneck felt like the model. The bottleneck was the harness around the model: which skills it sees, which tools it can call, which project-specific rules apply, and whether local config has drifted. I built `beginning-harness` to make that layer explicit."

### Strategic Language To Prefer

- "local meta-harness"
- "control plane for local agent configuration"
- "project-aware agent setup"
- "inspect, dry-run, apply"
- "skills, MCP, extensions, defaults, overlays"
- "harness engineering for local developer machines"
- "make the agent environment observable and reusable"

### Language To Avoid

- "the best AI agent"
- "replace Claude/Codex/Cursor"
- "autonomous dev platform"
- "one-click magic"
- "perfect reliability"
- "the only tool you need" in serious technical copy, even though the image can carry that as a visual campaign motif

## Target Audiences

### Primary

Developers already using multiple AI coding tools locally.

Their pain:

- Skills exist in one tool but not another
- MCP server config drifts across Codex, Claude Code, Cursor, and local agent runtimes
- Project-specific setup is hand-edited and forgotten
- Agent behavior is inconsistent across repos
- New tools such as Parallel, Beads, and markdownify are useful but awkward to coordinate

Desired reaction:

"This is exactly the layer I have been managing in dotfiles and random scripts."

### Secondary

Technical founders and engineering leads adopting AI-assisted development across teams.

Their pain:

- Agent setups are not reviewable
- Tool access is not governed
- Project-level agent rules are not explicit
- New local agents create config sprawl

Desired reaction:

"This makes agent setup feel like infrastructure instead of vibes."

### Tertiary

Open-source maintainers building tooling around MCP, skills, agent instructions, and local developer environments.

Desired reaction:

"This could become an integration surface for extensions and shared skill bundles."

## Campaign Thesis

The campaign should not start with "here is a CLI." It should start with the problem:

1. AI agent quality is increasingly determined by the harness around the model.
2. Local harnesses are scattered across skills, MCP configs, dotfiles, extensions, and project-specific notes.
3. `beginning-harness` turns that scattered layer into a local, inspectable, reusable control plane.

## Campaign Concepts

### Concept A: "The Harness Problem"

Best for LinkedIn, X, developer communities.

Hook:

"The agent is not always the thing that is broken. Sometimes your harness is."

Why it works:

- It ties into the emerging harness engineering vocabulary
- It creates a memorable mental model
- It lets the founder explain the product through a real pain

Risks:

- May sound abstract if not grounded quickly in commands and files

Execution rule:

Always follow the conceptual hook with concrete surfaces: skills, MCP servers, project config, `bgng status`, `bgng write --dry-run`, `bgng doctor`.

### Concept B: "From Dotfiles To Control Plane"

Best for LinkedIn, Instagram carousel, README sharing, Dev.to.

Hook:

"My AI agent setup had become a pile of dotfiles. I wanted a control plane."

Why it works:

- Concrete and relatable
- Speaks to developers who already maintain dotfiles
- Makes the repo feel practical

Risks:

- Could sound like yet another dotfiles manager unless "agent harness" is clearly explained

Execution rule:

Show before/after:

- Before: `~/.claude`, `~/.codex`, `~/.cursor`, `~/.agents`, hand-edited MCP JSON
- After: one library, defaults, project overlays, `write --dry-run`, `doctor`

### Concept C: "Project-Level Agent Harnesses"

Best for X, Threads, technical demos.

Hook:

"Every repo should be able to declare what agent capabilities it needs."

Why it works:

- Maps directly to current implementation
- Makes `bgng init`, `bgng add extension parallel`, and `bgng write` easy to demonstrate
- Differentiates from global-only config sync tools

Risks:

- Narrower than the full product

Execution rule:

Use a concrete project flow:

```bash
bgng init
bgng add extension parallel
bgng add skill <name-or-query>
bgng add mcp <server-name>
bgng write --dry-run
bgng write
```

## Launch Phases

### Phase 0: Preflight

Do before public launch:

- Confirm GitHub repo is public
- Confirm npm package is published and `npm install -g beginning-harness` works
- Confirm README banner renders on GitHub
- Confirm package README renders on npm
- Confirm `bgng --help`, `bgng status`, `bgng write --dry-run`, and `bgng doctor` work from a clean install
- Add a short GitHub release note if publishing a release
- Pin or feature the repo on the founder GitHub profile if appropriate

If npm is not published yet:

- Use a soft preview campaign
- CTA: "repo is here; npm package coming after release validation"
- Do not tell people to install with npm yet

### Phase 1: Launch Day

Primary objective:

- Drive high-intent developers to the GitHub README
- Start technical discussion around local harness engineering
- Collect issues, extension ideas, and skill/MCP workflows people want

Publishing order:

1. GitHub release or repo announcement
2. LinkedIn founder post
3. X launch thread
4. Threads conversational launch post
5. Instagram carousel or hero-image post
6. Developer community posts only after the GitHub README and npm install path are solid

Reasoning:

- LinkedIn and X create the first public narrative
- Threads and Instagram reuse the story in lighter formats
- Developer communities should not be hit until the project can withstand direct scrutiny

### Phase 2: First Week

Cadence:

- Day 1: launch narrative
- Day 2: demo flow
- Day 3: "what it changes on disk" safety post
- Day 4: extension architecture post
- Day 5: request for MCP/skill/extension examples
- Day 6: founder build note
- Day 7: recap and roadmap

### Phase 3: First Month

Content pillars:

- Harness engineering education
- CLI walkthroughs
- Real project setup examples
- Extension spotlights
- Community requested workflows
- Release notes

Weekly pattern:

- 1 conceptual post
- 1 CLI demo
- 1 community ask
- 1 release or build note

## Cross-Channel Content Matrix

| Message | LinkedIn | X | Threads | Instagram | Developer Communities |
| --- | --- | --- | --- | --- | --- |
| Harness problem | Founder essay | Thread | Short conversational post | Carousel | Dev.to explainer |
| Dotfiles to control plane | Story post | Before/after thread | Casual comparison | Carousel | Reddit/HN comment angle |
| Project overlays | Technical walkthrough | Command thread | Short demo note | Reel script | Docs-first post |
| Extensions | Architecture post | Extension spotlight | Ask for ideas | Carousel slide | GitHub discussion |
| Safety and dry-runs | Trust-building post | CLI snippet | Practical tip | Story sequence | Maintainer answer |

## Launch Assets

### Required

- GitHub README URL
- npm package URL after publish
- Hero image: `the-beginning-harness.png`
- 5 to 7 screenshots or terminal captures:
- `bgng --help`
- `bgng status`
- `bgng write --dry-run`
- `bgng library defaults list`
- `bgng extensions list`
- `bgng extensions status parallel`
- `<project>/.agents/bgng/config.json`

### Optional

- 60 second terminal GIF
- 5-slide carousel showing "before" and "after"
- Short Loom-style walkthrough
- GitHub release notes screenshot

## Measurement

### Primary Metrics

- GitHub stars from high-intent technical accounts
- GitHub issues with real workflow feedback
- npm downloads after publish
- README link clicks
- Post replies with concrete use cases
- Extension requests

### Secondary Metrics

- Likes, reposts, shares
- Profile visits
- Newsletter signups if a newsletter exists
- DMs from engineering teams

### Qualitative Signals

Strong signals:

- "I have this exact dotfiles mess"
- "Does it support X agent/tool?"
- "Can I add my own extension?"
- "How does project config override global config?"
- "Can this manage team defaults?"

Weak signals:

- Generic "cool tool" reactions
- Broad AI hype comments
- Engagement with the hero image but no repo clicks

## Founder Response Playbook

When someone asks "why not just use dotfiles?":

"Dotfiles are good for static files. `beginning-harness` is for the layer where skills, MCP servers, package-backed assets, project overlays, extensions, diagnostics, and downstream generated configs need to be resolved together. I still like dotfiles. I wanted the agent harness layer to become explicit and inspectable."

When someone asks "is this an agent framework?":

"No. It is the local harness around the agent tools you already use. It manages the skills, MCP/tool surfaces, extensions, defaults, project overlays, and generated downstream configs."

When someone asks "does it replace Claude Code/Codex/Cursor?":

"No. It is designed to make those tools easier to operate consistently on the same machine and across projects."

When someone asks "why the name?":

"Because the harness is the beginning of reliable local agent work. The model is not enough; the surrounding tools, skills, rules, and verification loop matter."

When someone asks "what should I try first?":

"Start with `bgng status`, inspect with `bgng skills list` and `bgng mcp list`, then use `bgng write --dry-run` before writing anything."

## Source Notes

Sources checked on 2026-04-28:

- LinkedIn Help notes a 3,000 character post limit and suggests articles for longer content: https://www.linkedin.com/help/recruiter/answer/a528176
- X Help describes typical 280-character posts and Premium longer posts up to 25,000 characters: https://help.x.com/en/using-x/types-of-posts
- Meta announced Threads posts up to 500 characters with links, photos, and videos up to 5 minutes: https://about.fb.com/news/2023/07/introducing-threads-new-app-text-sharing/
- Meta announced Threads text attachments up to 10,000 characters: https://about.fb.com/news/2025/09/attach-text-threads-posts-share-longer-perspectives/
- Sprout Social summarizes Instagram caption constraints as 2,200 characters and truncation around 125 characters: https://sproutsocial.com/insights/social-media-character-counter/
