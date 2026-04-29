# Threads Marketing Campaign Plan For beginning-harness

## Channel Role

Threads should be the conversational and human channel for `beginning-harness`. It should be less formal than LinkedIn and less compressed than X. The best use is founder reflection, plain-language explanation, and community questions.

Threads should make the project feel approachable:

- why it exists
- what problem it solves
- what the founder learned building it
- what users should try first
- what workflows people want supported next

## Platform Constraints

Meta announced Threads with posts up to 500 characters, links, photos, and videos up to 5 minutes. Source checked on 2026-04-28: https://about.fb.com/news/2023/07/introducing-threads-new-app-text-sharing/

Meta later announced text attachments up to 10,000 characters. Source checked on 2026-04-28: https://about.fb.com/news/2025/09/attach-text-threads-posts-share-longer-perspectives/

Practical campaign implication:

- Default to 300 to 500 character posts
- Use text attachments for longer founder notes, not every post
- Threads can link out, but posts should still stand alone
- Cross-share high-performing Threads posts to Instagram Stories

## Recommended Threads Cadence

### Launch Week

- Day 1: approachable launch post
- Day 2: "why I built it" post
- Day 3: command snippet post
- Day 4: ask-for-feedback post
- Day 5: extension idea post
- Day 7: recap

### Month One

- 3 posts per week
- 1 build note
- 1 practical command/workflow post
- 1 open question

## Tone

Threads should sound like a founder explaining a tool to smart peers without trying to perform authority.

Use:

- "I kept running into..."
- "The thing I wanted was..."
- "This is the layer I wanted to make explicit..."
- "If your setup looks like this, I want your feedback..."

Avoid:

- dense architecture language without examples
- over-polished launch copy
- aggressive category claims
- "revolutionary" language

## Founder-Led Post Drafts

### Draft A: Simple Launch

I built `beginning-harness` because my local AI agent setup kept turning into scattered config.

Skills in one place. MCP servers in another. Project-specific rules somewhere else. Generated configs drifting quietly.

`beginning-harness` is a local control plane for that harness layer.

Repo: https://github.com/remyjkim/beginning-harness

### Draft B: Human Problem

The more I use coding agents, the more I think the model is only part of the story.

The harness around the model matters a lot:

what tools it can use, what skills it sees, what project rules apply, and whether local config is current.

That is the layer `beginning-harness` is trying to make explicit.

### Draft C: Command First

The core `beginning-harness` loop:

```bash
bgng status
bgng skills list
bgng mcp list
bgng write --dry-run
bgng write
```

I wanted agent config changes to be inspectable before they mutate local files.

### Draft D: Project Overlay

One thing I care about: agent setup should be project-aware.

Some repos need Parallel.
Some need Beads.
Some need different skills or MCP servers.

That should not require rewriting your global setup every time.

So `bgng init` creates a project harness config under `.agents/bgng/config.json`.

### Draft E: Feedback Ask

If you use multiple AI coding tools locally, I would like to know:

What part of your agent setup do you still manage by hand?

Skills?
MCP servers?
Project instructions?
Tool-specific config?
Extension setup?

That is the surface area I am trying to make less chaotic with `beginning-harness`.

### Draft F: Extension Ask

I am starting to think of `beginning-harness` extensions as reusable local capability packs.

An extension can check prerequisites, add skills, enable MCP, write project config, and run diagnostics.

Parallel and Beads are first examples.

What should become an extension next?

### Draft G: Pre-NPM Preview

Preview note: `beginning-harness` is on GitHub, and the npm package should be the clean install path once release validation is done.

Until then, I am mostly looking for feedback on the model:

local library -> user defaults -> project overlays -> safe apply -> diagnostics.

Repo: https://github.com/remyjkim/beginning-harness

## Long Text Attachment Candidate

Title:

Why I built beginning-harness

Body:

I kept noticing that when an AI coding agent behaved poorly, the problem was not always the model.

Sometimes the problem was the harness around it.

The right skill was not available. The MCP server existed in one tool but not another. A project-specific rule lived in a README section the agent did not see. Parallel was useful for one repo but not something I wanted globally enabled. Generated config had drifted.

Those failures felt too operational to keep treating as one-off prompt problems.

So I built `beginning-harness` as a local meta-harness for agent tools.

The goal is not to replace Codex, Claude Code, Cursor, or any other agent. The goal is to make the local environment around those tools explicit:

- reusable skill inventory
- MCP registry
- local library
- user defaults
- project overlays
- extension setup
- dry-run apply
- diagnostics

The simplest flow is:

```bash
bgng status
bgng doctor
bgng write --dry-run
bgng write
```

The project-specific flow is:

```bash
bgng init
bgng add extension parallel
bgng add skill <name-or-query>
bgng add mcp <server-name>
bgng write --dry-run
```

I think this harness layer is going to matter more as local agents become more capable. Better models help, but better models still need clear tools, clear instructions, explicit project context, and safe verification loops.

Repo: https://github.com/remyjkim/beginning-harness

I would like feedback from people who have built their own local agent setup with shell scripts, dotfiles, copied MCP JSON, symlinks, or custom project instructions.

## Threads Reply Templates

### "Is this only for developers?"

The first version is developer-focused because coding agents already have concrete local surfaces: skills, MCP, project config, CLI tools, and generated files. The harness idea is broader, but this repo starts with local dev workflows.

### "How is it different from a prompt library?"

A prompt or skill library is one part of the harness. `beginning-harness` also manages MCP servers, extensions, defaults, project overlays, generated downstream configs, and diagnostics.

### "What should I try first?"

Start with `bgng status`, then `bgng write --dry-run`. The project is designed to inspect before writing.

## Success Criteria

Strong Threads launch:

- Replies with personal workflow stories
- Questions about extension ideas
- Cross-shares to Instagram Stories
- Follow-up conversation about local agent config

Weak Threads launch:

- Likes only
- No repo clicks
- Conversation drifts into generic AI discourse
