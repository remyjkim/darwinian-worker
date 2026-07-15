# Spine delivery for locally applied cards — design space

Companion to `100_feature_card_instructions_projection_gap_analysis.md`. Explores every
viable mechanism for delivering a card's spine (system-prompt-level identity, policy,
orchestration) to locally materialized agents, and how each interacts with the existing
architecture.

## Reframing the problem

The `instructions` field conflates three delivery contexts that have different consumers:

1. **Main-agent spine** — the active Worker root governs the primary harness conversation.
2. **Subagent spine** — the card is invoked as a subagent capability inside someone else's
   session (the Notion issue's use case).
3. **Service spine** — the card is deployed; the remote runtime consumes the generated
   artifact (works today).

Every option below is a choice along three axes: **delivery strength** (true system prompt >
injected context > pull-on-demand), **scope** (subagent-isolated vs main conversation), and
**who binds it** (sync-time projection vs session-time hook vs invocation-time pull vs a
launcher). No single mechanism covers all three contexts; the design question is which
contexts get first-class support and through what surface.

## Family 1 — Harness-native agent surfaces (subagent spine)

### A. Project `instructions` into `.claude/agents/<name>.md`

Sync reads the existing generated artifact and writes a Claude Code subagent definition
(frontmatter: name, description; body: spine). Managed-content in the write-record, same
ownership semantics as skills projection. True system-prompt strength, per-subagent scope,
invocable via the Agent tool by name.

- Gate on **explicit `instructions` only** — reusing `buildInstructionsArtifact`'s
  aggregated-skills fallback would sprout agent files for every card with skills.
- Claude-target-only; codex/cursor have no subagent surface.
- One spine per card; frontmatter is synthesized, not authored.

### O. Bundled `agents/` content type (parallel to `skills/`, `hooks/`)

Instead of overloading `instructions`, let cards bundle authored agent definitions:
`<card>/agents/<name>.md`, declared via `agents.include`, projected wholesale to
`.claude/agents/`. Most idiomatic extension of the existing content model.

- Multiple subagents per card (a panel card ships its whole bench).
- Author controls frontmatter (description, tools, model) — no synthesis decisions.
- Explicit reviewable artifacts; no magic.
- Does not by itself fix the `instructions` footgun — the field stays deploy-only.

### A+O synthesis (likely best of family)

Author writes `agents/<name>.md` once; local projection copies it to `.claude/agents/`;
the deploy spine references the same file via `instructions: { path: "agents/<name>.md" }`.
`stripYamlFrontmatter` already exists in the generator (used for the skill fallback), so the
deploy artifact can strip the agent frontmatter cleanly. One authored text, two consumers,
no duplication — and `instructions` regains an honest, documented role on regular cards.

### G. Project the whole Worker as a Claude Code plugin

Plugins bundle agents + skills + hooks + commands as one unit; a card closure maps 1:1.
Conceptually clean (card ↔ plugin) but strictly heavier than A/O for the same capability,
claude-only, and adds a packaging layer the write-record model doesn't need. Revisit only if
drwn ever wants harness-native distribution.

## Family 2 — Main-conversation context (active-root spine)

### C. Managed section in memory files (CLAUDE.md / AGENTS.md / .cursor/rules)

Merge the active aggregate `instructions.md` into the harness memory file as a
marker-delimited managed block. Always-on push at memory strength, works on all three
targets (this is the only cross-target push option), and matches the contract line in
`project-worker-v1.md:108` that promises "active aggregate instructions used for projection."

- Requires marker-based ownership in user-owned Markdown — a new managed-fields analogue for
  text files; merge conflicts with hand edits are the failure mode.
- Main scope only; does nothing for subagent invocation.

### D. Session-start hook injection

A generated hook emits the active aggregate spine as `additionalContext` at session start.
The hook pipeline already plumbs `additionalContext` through decision encoding
(`hook-generator/encode-decision.ts`); today's policies are tool-scoped, so this extends the
event surface, not the machinery. No user files touched; artifact read live, so no
sync-to-file drift.

- Injected-context strength (not system prompt); arrives as a message.
- Inherits hook consent friction — which is arguably a feature (see trust, below).

### H. Slash-command / MCP-prompt projection

Project `/worker:<name>` (or an MCP prompt from a small built-in drwn server, which Claude
Code surfaces as a slash command) that front-loads the spine on demand. Deterministic pull —
stronger than skill description-matching, weaker than push. Cheap, target-portable via MCP,
but manual and main-scope.

## Family 3 — Pull conventions (status quo, blessed)

### B. Formalize the spine-skill convention

Scaffold via `card new --spine`, name it (`skills/spine/`), lint that worker cards carry
either explicit instructions or a spine skill, document in author-card. Zero new projection
machinery; works on every target today. Fundamental ceiling: pull, probabilistic trigger,
user-message strength, competes with other skills. The generator's aggregated-skills
fallback already blesses this shape — formalizing costs almost nothing and is compatible
with every other option.

### E. MCP resource exposure

Expose spines as MCP resources for harnesses to read. Weakest guarantee of consumption;
only worth having as a side effect of H's MCP-prompt server, not as the mechanism.

## Family 4 — Runtime binding

### F. drwn as launcher (`drwn worker run <name>`)

Spawn the harness with the spine as the actual system prompt (`claude --append-system-prompt`
/ Agent SDK `systemPrompt`), reading the same generated artifact the deploy runtime uses.
The only route to true system-prompt strength for a *main* agent, and it converges local and
deployed semantics exactly. But it crosses the architecture's load-bearing boundary — drwn
materializes, harnesses run — and takes on per-harness launch surface, interactive/headless
modes, and session lifecycle. This is the long-run convergence horizon, not the fix.

## Cross-cutting constraints

- **Trust.** A push-strength spine from a third-party card is silent prompt injection at the
  highest privilege. Skills are pull and reviewable; a projected system prompt is neither.
  Any Family 1/2 option should gate on consent for untrusted sources, mirroring
  `hookConsent` (`isHookConsentValid`) — spine consent on apply, dropped when the version
  leaves the consented range.
- **Single artifact.** Options A, C, D, H all read the already-canonical generated
  `instructions.md`. Keeping the generator as the sole composer (precedence chain unchanged)
  means every projection is a dumb copy — no second source of truth.
- **Target asymmetry.** Only C is push on all targets. A/O/G are claude-only; D is
  claude+codex. Asymmetry should be declared (targets gating), not accidental.
- **Schema evolution.** If more than one context gains a consumer, the manifest may
  eventually need to declare intended invocation (main vs subagent vs service) rather than
  inferring it. Not needed for any single option below — noted to avoid painting into a
  corner.

## Comparison

| Option | Strength | Scope | Targets | Change size | Key risk |
|---|---|---|---|---|---|
| A instructions→agents file | system prompt | subagent | claude | M | synthesis/gating decisions |
| O bundled agents/ | system prompt | subagent | claude | M | field stays inert without synthesis |
| A+O synthesis | system prompt | subagent + deploy | claude | M | none beyond A/O |
| G plugin projection | system prompt | subagent | claude | L | packaging overkill |
| C memory-file merge | memory context | main | all | M | user-file merge ownership |
| D session-start hook | injected context | main | claude, codex | M | consent friction, weaker strength |
| H slash/MCP prompt | pull (deterministic) | main | claude+ | S | manual invocation |
| B spine-skill formalized | pull (probabilistic) | any | all | S | trigger reliability ceiling |
| E MCP resource | pull (weakest) | any | MCP | S | nothing consumes it |
| F drwn launcher | system prompt | main | any | L | crosses materializer/runtime boundary |
| I deploy-only + docs | — | service | — | XS | local gap remains |

## Recommendation

Layered, matching the three contexts:

1. **Now, regardless of anything else:** B's documentation half + fix the contract line +
   `--instructions` on `card source set`. Removes the footgun.
2. **Subagent spine (the issue's actual pain):** the **A+O synthesis** — bundled `agents/`
   content projected to `.claude/agents/`, with `instructions.path` pointing at the same
   file for deploy. Best strength-to-weight, idiomatic to the content model, kills the
   duplication objection, and gives multi-agent cards for free. Gate behind spine consent
   for untrusted sources.
3. **Main-agent spine:** defer, then pick **D** (hook injection) over C when needed — no
   user-file merge semantics, artifact read live, consent built in. C only if cross-target
   push becomes a hard requirement.
4. **F** stays on the horizon as the convergence play; revisit when local/deployed parity
   becomes a goal rather than an aesthetic.
