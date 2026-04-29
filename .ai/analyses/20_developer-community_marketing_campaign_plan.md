# Developer Community Marketing Campaign Plan For beginning-harness

## Channel Role

Developer communities should be used after the GitHub README, npm package, and basic install path are ready. These channels are less forgiving than social feeds. They can produce the highest-quality feedback, but only if the project is concrete, installable, and honest about scope.

Target communities:

- GitHub release and Discussions
- Hacker News
- Reddit developer communities
- Dev.to or personal technical blog
- Product Hunt, only if the package and README are polished enough

## Launch Rule

Do not use developer communities as a teaser channel.

Use them when:

- repo is public
- npm install works, or the post clearly says install is from source
- README has clear quickstart
- known limitations are documented
- issues are enabled
- maintainer can respond for several hours after posting

## Developer Community Positioning

Lead with the concrete project:

`beginning-harness` is a local meta-harness CLI for AI agent tools. It manages skills, MCP servers, extensions, user defaults, project overlays, generated downstream configs, and diagnostics.

Do not over-index on broad harness engineering language unless paired with a concrete example.

## GitHub Release Plan

### Release Title Candidate

`beginning-harness v0.1.0 - local meta-harness for AI agent tools`

### Release Notes Draft

`beginning-harness` is a local meta-harness CLI for managing the operational layer around AI agent tools.

This first public release includes:

- `bgng status`, `bgng doctor`, `bgng write`, and `bgng write --dry-run`
- shared skill inventory and sync
- MCP registry and generated downstream config
- user defaults under `~/.agents/bgng/config.json`
- project overlays under `<project>/.agents/bgng/config.json`
- local skill and MCP library commands
- package-backed skill bundle support
- extension support for Parallel and Beads
- compatibility commands for existing sync flows

Install after npm publish:

```bash
npm install -g beginning-harness
bgng status
bgng write --dry-run
```

From source:

```bash
git clone https://github.com/remyjkim/beginning-harness.git
cd beginning-harness
bun install
bun run bgng -- status
```

The design goal is conservative local operation: inspect, dry-run, then apply.

## Hacker News Plan

### Best Submission Type

Use "Show HN" only after npm publish is complete and the install path has been tested.

### Title Candidates

- `Show HN: beginning-harness - a local control plane for AI agent config`
- `Show HN: beginning-harness - manage skills, MCP servers, and project agent config`
- `Show HN: I built a local meta-harness for AI coding tools`

### Submission URL

Use the GitHub repo URL:

`https://github.com/remyjkim/beginning-harness`

### First Comment Draft

I built `beginning-harness` after running into drift across local AI coding tools.

The problem I wanted to solve was not "build another agent." It was the local harness around the agents I already use:

- skills and instructions
- MCP server definitions
- project-specific overrides
- extension setup
- user defaults
- generated configs for local tools
- diagnostics before mutation

The CLI uses an inspect-first workflow:

```bash
bgng status
bgng doctor
bgng write --dry-run
```

It currently supports skills, MCP, package-backed skill bundles, project overlays, and extensions for Parallel and Beads.

I would especially like feedback on the abstraction boundaries:

- Should extensions own setup actions, diagnostics, and project config together?
- What should the local library model support beyond skills and MCP?
- How should team-shared harness config evolve from a local-first tool?

Known limitation: this is still early and local-first. It is not a hosted agent runtime or a replacement for Codex, Claude Code, Cursor, etc.

## Reddit Plan

### Recommended Subreddits

Use carefully and follow each community's self-promotion rules before posting:

- `r/LocalLLaMA` only if positioning around local agent tooling is relevant and allowed
- `r/programming` only if the post is technical and not promotional
- `r/opensource`
- `r/commandline`
- `r/typescript`
- `r/ClaudeAI` only if clearly framed as local tooling around Claude Code and rules allow it
- `r/cursor` only if community rules allow tooling posts

### Reddit Post Draft A: r/opensource

Title:

`I built beginning-harness, a local meta-harness CLI for AI agent tooling`

Body:

I built `beginning-harness` to manage the local configuration layer around AI agent tools.

The problem: local agent setup tends to drift across skills, MCP server config, project-specific rules, extension setup, and generated downstream config for tools such as Codex, Claude Code, Cursor, and `~/.agents`.

The CLI gives that layer a local control plane:

```bash
bgng status
bgng skills list
bgng mcp list
bgng write --dry-run
bgng doctor
```

It supports:

- skills
- MCP servers
- local library
- user defaults
- project overlays
- package-backed skill bundles
- Parallel and Beads extensions
- dry-run and diagnostic flows

Repo: https://github.com/remyjkim/beginning-harness

I would appreciate feedback on the model, especially from people already managing local agent config by hand.

### Reddit Post Draft B: r/commandline

Title:

`bgng: a CLI for managing local AI agent skills, MCP servers, and project overlays`

Body:

I built a Bun/TypeScript CLI called `bgng`.

Its job is to manage the local harness around AI agent tools:

- reusable skills
- MCP server definitions
- user defaults
- project-specific overlays
- extensions
- generated downstream config
- diagnostics

The key design principle is that it should be inspectable before it mutates files:

```bash
bgng status
bgng write --dry-run
bgng doctor
```

Project-specific setup looks like:

```bash
bgng init
bgng add extension parallel
bgng add skill <name-or-query>
bgng add mcp <server-name>
```

Repo: https://github.com/remyjkim/beginning-harness

I am looking for feedback on the CLI surface and whether the `library/defaults/project overlay` model is intuitive.

### Reddit Reply Guardrails

If accused of self-promotion:

"Fair push. I am the maintainer, and I am posting because I want technical feedback on the CLI/model. If this is not appropriate for the sub, I am happy to remove it."

If asked why it exists:

"Because local agent setups are increasingly more than one config file. Skills, MCP servers, extensions, user defaults, project overrides, and generated downstream configs need to resolve together."

## Dev.to Or Blog Plan

### Article Title Candidates

- `Harness Engineering For Local AI Agent Tools`
- `From Dotfiles To Harness: Managing Local AI Agent Config`
- `Why I Built beginning-harness`

### Article Outline

1. The problem I kept seeing
2. Why this is a harness problem, not only a model problem
3. What local agent harnesses contain
4. How `beginning-harness` models the layer
5. CLI walkthrough
6. Project overlays
7. Extensions
8. Known limitations
9. What feedback I want

### Opening Draft

The more I used AI coding agents locally, the more I realized that many failures were not model failures.

They were harness failures.

The agent did not have the right skill. MCP config existed in one tool but not another. A project needed different rules from my global defaults. An extension was useful for one repo but not something I wanted globally enabled. Generated config drifted.

That is the layer I built `beginning-harness` to manage.

It is a local meta-harness CLI for AI agent tools: skills, MCP servers, extensions, defaults, project overlays, generated downstream configs, and diagnostics.

### Closing Draft

This is early, and I expect the model to evolve.

The part I feel strongly about is the direction: local agent setup should become explicit infrastructure. It should be inspectable, reusable, project-aware, and safe to apply.

If you have built a personal harness out of shell scripts, dotfiles, MCP JSON, symlinks, or project instructions, I would like your feedback.

Repo: https://github.com/remyjkim/beginning-harness

## Product Hunt Plan

### Recommendation

Do not launch on Product Hunt until:

- npm package is published
- GitHub README has screenshots or GIFs
- there is a short demo video
- first external users have validated the install path
- the project has a clear roadmap

### Tagline Candidates

- `A local meta-harness for AI agent tools`
- `Manage skills, MCP servers, extensions, and project agent config`
- `A local control plane for your AI coding-agent setup`

### Description Draft

`beginning-harness` is a local CLI for managing the harness around AI agent tools: skills, MCP servers, extensions, user defaults, project overlays, generated downstream configs, and diagnostics. It is designed for developers using tools such as Codex, Claude Code, Cursor, and local `~/.agents` workflows who want inspectable, reusable, project-aware agent setup.

### Founder Comment Draft

I built `beginning-harness` because my AI agent setup kept drifting across tools and projects.

The project is not another coding agent. It is the local harness around the agents you already use: skills, MCP servers, extensions, defaults, project overlays, and diagnostics.

The CLI is intentionally conservative:

```bash
bgng status
bgng write --dry-run
bgng doctor
```

I would love feedback from developers who are already using multiple local AI coding tools and managing MCP or skill config by hand.

## Community Launch Sequence

Recommended order:

1. GitHub release
2. Dev.to or personal blog post
3. Hacker News Show HN
4. Reddit posts, one community at a time
5. Product Hunt later, after install path and visuals are stronger

Reasoning:

- GitHub release creates canonical reference
- Blog post provides depth for people who want context
- HN can critique the concrete repo
- Reddit should be handled carefully and community-by-community
- Product Hunt is better after the first wave proves the positioning

## Success Criteria

Strong developer community launch:

- high-quality GitHub issues
- stars from people outside the social graph
- specific critiques of the CLI model
- extension requests
- install path feedback
- pull requests or docs corrections

Weak developer community launch:

- drive-by comments only
- generic AI skepticism without project-specific discussion
- confusion about whether this is an agent framework
- install errors that should have been caught pre-launch
