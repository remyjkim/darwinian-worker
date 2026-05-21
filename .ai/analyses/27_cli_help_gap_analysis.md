# `bgng --help` Gap Analysis

Status: analysis report, ready for triage. Findings sourced from a three-pronged audit of `cli/commands/`, the `bgng <cmd> --help` rendering for every registered command, and the `README.md` + `.ai/knowledges/` + `.ai/analyses/` corpus.

Date: 2026-05-20

Related artifacts:
- `cli/index.ts` — single source of registered commands.
- `cli/commands/**` — command class definitions (paths, options, `usage`, `execute()`).
- `cli/commands/base.ts` — `BaseCommand.Usage()` helper that produces the `usage` stanza Clipanion uses to render help.
- `.ai/analyses/21_analyzer_integration.md`, `.ai/analyses/22_analyzer_cli_implementation_plan.md` — designed-but-unimplemented commands (analyzer family).
- `.ai/analyses/25_harness-cards-cli-design.md`, `.ai/analyses/26_harness-cards-target-architecture.md` — designed-but-unimplemented commands (`bgng card`, `bgng store`, `bgng apply`, `bgng update`).
- `.ai/knowledges/01_agents-cli-usage-guide.md`, `README.md` — current operator-facing documentation.

## 1. Executive Summary

`bgng --help` accurately enumerates every command class registered in `cli/index.ts`. There are **no unregistered command files** in `cli/commands/` and **no hidden Clipanion path aliases** (every command exposes exactly one `paths` entry). In that narrow sense, the help index is complete.

The gap is elsewhere. Three distinct classes of mismatch separate `--help` from the CLI's actual implemented behavior:

1. **Threadbare per-command help.** Every one of the 30 registered subcommands uses only the `category` and `description` fields of `usage`. Not a single command populates `usage.details` or `usage.examples`. The consequence: `bgng <cmd> --help` adds at most one line per flag over the top-level summary, and two commands (`skills curate`, `skills uncurate`) add nothing at all.
2. **Implemented behavior the help line elides.** At least ten commands have meaningful behavior — interactive TTY-gated modes, side effects beyond the stated verb, mutually-exclusive flag rules, environment-variable branches, and "already-active"/"already-default" early returns — that the one-line description does not signal. Operators learn these only by reading source or hitting them by accident.
3. **Designed-but-unimplemented surfaces in the docs corpus.** Two major command families are fully designed in `.ai/analyses/` but absent from the CLI: the analyzer family (`analyze`, `login`, `logout`, `whoami`) per analyses 21–22, and the Harness Cards family (`card *`, `store *`, `apply`, `update`) per analyses 25–26. Readers of the docs would reasonably expect these in `--help`.

Plus one minor correctness issue surfaced by the audit: `search mcp` and `search skill` declare a `--project` flag that is never threaded into the underlying `searchMcp` / `searchSkills` calls — an orphaned option that appears in help but does nothing.

The rest of this report enumerates each gap with file/line citations and recommends a remediation order keyed to user-facing leverage.

## 2. Method

Three parallel audits, each independently driven:

- **Source audit.** Read all 30 command files under `cli/commands/`. For each, catalog: `paths`, `usage` fields, declared `Option.*` fields (presence and absence of `description`), `execute()` behavior (interactive branches, env reads, side effects, early returns).
- **Help-render audit.** Run `bun cli/index.ts <cmd> --help` for every registered command. Classify the output as RICH (Details + Examples + per-flag descriptions), PARTIAL, or THIN.
- **Doc-corpus audit.** Read `README.md`, every file in `.ai/knowledges/`, and the most recent files in `.ai/analyses/` (21+). Flag any command, flag, or workflow described as implemented that does not appear in `bgng --help`.

Findings below are anchored to file:line citations from the audits.

## 3. Findings

### 3.1 Universal: every per-command `--help` is threadbare

**Observation.** `grep -rln "details:" cli/commands/` and `grep -rln "examples:" cli/commands/` both return zero hits. Every command's `BaseCommand.Usage(...)` call passes only `category` and `description`. Two example confirmations:

- `cli/commands/skills/curate.ts:11-14` — `usage` has only `category: "Skills"` and `description: "Curate a shared skill into the ~/.agents publication layer."`
- `cli/commands/init.ts` — same shape; `--guided`, `--non-interactive`, `--minimal`, `--force` each get a one-liner from `Option.Boolean(..., { description })` and nothing else.

**Consequence.** `bgng <cmd> --help` shows: the signature, the one-line description, and (for commands with flags) a one-line label per flag. No worked examples. No default-value notes. No "what to run next." No semantic guidance for jargon like "stealth mode" or "aggregation."

**Worst-case subset.** `skills curate` and `skills uncurate` have **no flags whatsoever** — not even `--json`. Their `--help` output is the signature plus the description and stops. This is also a consistency gap: the rest of the CLI uniformly supports `--json`.

**Highest-leverage targets for richer help** (ranked by likely first-use frequency):

1. `init` — first command a new user runs; four flags whose differences (`--guided` vs auto-detected guided, `--minimal` vs `--non-interactive`) are not derivable from the one-liners.
2. `write` — power-user command; `--mcp-only`, `--skills-only`, `--target` need at minimum a sentence each on what "effective config" means and what targets the CLI knows about.
3. `add extension` — the densest add command (7 flags including positional); the description in `cli/commands/extensions/setup.ts` for `--include-skill` even hard-codes "beads-task-tracking" as the skill name, a tell that the flag means different things per extension.
4. `extensions setup` — 10 flags, most of them Beads-specific (`--stealth`, `--skip-bd-init`, `--skip-bd-setup`). The help has no way to convey that `--install` only applies to `markitdown`, or that `--target` only applies to `beads`.
5. `add skill` / `add mcp` — `--library` is documented as "Only search the local library," but the default (search library + catalogs, in what order?) is left unstated.
6. `doctor` — single `--json` flag, but no explanation of what classes of drift it reports, what exit codes mean, or how it differs from `extensions doctor`.

**Notable detail visible only in per-command help.** `extensions setup --install` is the only flag in the entire CLI whose description mentions a negation form: `"Install the extension CLI prerequisite when supported. Use --no-install to skip installation."` That `--no-install` variant is invisible from `bgng --help`. Similar selective hints appear in `library add mcp --as` ("Register or select…" — dual-purpose) and `library add mcp --replace` (the only `--replace`-style flag anywhere in the CLI).

### 3.2 Behaviors the help line does not advertise

Each item below is a command whose visible description meaningfully under-sells what `execute()` does. File and line references are to `cli/commands/`.

#### `init` — `init.ts:39-96`

Help says: "Create per-project configuration."

What it also does:
- Auto-detects mode from `process.stdin.isTTY` / `process.stdout.isTTY` when no mode flag is passed (lines 41–50). The default in an interactive shell is guided setup; the `--guided` flag is therefore mostly useful to force guided mode in non-TTY contexts.
- In guided mode, runs an interactive flow that asks about Parallel and Beads extensions, and conditionally about MCP setup and `--target` selection (lines 52–96).
- Inspects `.gitignore` for `.agents` exclusion and warns if found (lines 58–63).

`--guided`'s help line ("Force guided interactive project setup.") doesn't convey that it's the default in a TTY.

#### `add mcp` — `add/mcp.ts:41-119`

Help says: "Add an MCP server to the current project."

What it also does:
- If no positional `queryOrName` is given AND stdin+stdout are TTY, prompts interactively to resolve a query (lines 42, with `resolveGuidedQuery()` defined further down).
- If the server is not found in the local library but `--yes` is set, searches the catalog and accepts the match only if it's unambiguous (lines 51–75).
- Detects when the server is already active by global default and returns an "already-active" early exit with `"No project override needed."` (lines 80, 100–108). No project mutation in that branch.

The help line implies a single straight-line behavior; the command is in fact three branches.

#### `add skill` — `add/skill.ts` (per source audit)

Help says: "Add a skill to the current project."

What it also does:
- Same TTY-gated interactive query resolution as `add mcp`.
- If not found locally and `--yes` is set, searches catalog and may install a skill package as a side effect.
- `--all` adds all skills from an installed catalog bundle — surfaces only in the flag's description, not in the command's one-liner.

#### `extensions setup` — `extensions/setup.ts:17-297`

Help says: "Set up one extension."

What it also does (extension-specific branching at lines 67–79):
- `parallel`: pure project config write.
- `markitdown`: calls `executeMarkitdownSetup()`, which can prompt for install approval in a TTY and shell out to `uv` to install the `markitdown` CLI (lines 195–286). `--install` / `--no-install` skip the prompt.
- `beads`: calls `executeBeadsSetupPlan()` (line 130), which checks for the `bd` CLI on PATH and runs external commands (lines 81–156). `--skip-bd-init`, `--skip-bd-setup`, `--stealth`, `--target`, `--include-skill` are all Beads-only.

Two distinct concerns hide here:
1. The single one-liner makes setup look uniform across extensions, but the three branches are very different in their side effects.
2. The flags are not orthogonal across extensions; `--target` is Beads-only, `--install` is Markitdown-only. The help signature suggests they're all generally applicable.

#### `extensions doctor` — `extensions/doctor.ts:24-59`

Help says: "Report extension issues without mutating anything."

What it also does: if `extensionName` is omitted, runs diagnostics across **all** extensions (lines 25, 32–34). The help line implies a single-target inspection; the all-extensions fallback is silent.

#### `mcp list` — `mcp/list.ts:27-70`

Help says: "List harness MCP servers and their current active state."

What it also does:
- Loads and merges the user library into the built-in registry (line 33).
- If a project config exists, merges the project overlay and re-ranks active state (lines 37–41).

Operators reading the help line do not know that the output is project-aware when run inside a configured repo.

#### `library defaults add skill` — `library/defaults/add-skill.ts:31-82`

Help says: "Add a skill to machine-wide defaults."

What it also does:
- Validates that the skill's `scope === "shared"` and rejects others (lines 36–38).
- When not in `--dry-run`, also calls `curateSkill()` as a side effect (line 52). Adding a default implicitly publishes the skill into the curated layer.

The side effect is structurally significant — operators expecting `defaults add skill` to be a pure metadata write get a filesystem side effect too.

#### `library defaults add mcp` — `library/defaults/add-mcp.ts:31-78`

Help says: "Add an MCP server to machine-wide defaults."

What it also does: detects when the server is already a default and returns an "already-default" early exit (lines 44, 55) — same idempotence pattern as `add mcp`, but the help line doesn't tell operators that re-running is safe.

#### `search mcp` / `search skill` — `search/mcp.ts:48-72`, `search/skill.ts`

Help says: "Search local and configured catalog MCP/skill servers."

What it also does: `--library` and `--catalog` are mutually exclusive at runtime (`mcp.ts:57-59`), which is enforced via `UsageError` but not surfaced in the help line.

#### `library add skill` — `library/add/skill.ts:24-50`

Help says: "Add a skill bundle to the local library."

What it also does: wraps `ingestSkillPackage()`, which can also install from a catalog reference. The description is correct but elides the "install from catalog" half of the command's accepted input.

### 3.3 Orphaned flag: `--project` on `search mcp` and `search skill`

Both `cli/commands/search/mcp.ts:48-50` and `cli/commands/search/skill.ts:48-50` declare:

```ts
project = Option.Boolean("--project", false, {
  description: "Use current project context as a ranking hint.",
});
```

Neither passes `project: this.project` (or any equivalent) into the call to `searchMcp` / `searchSkills`. In `search/mcp.ts:61-68`, the `searchMcp(...)` call site lists `repoRoot`, `agentsDir`, `config`, `query`, `libraryOnly`, `catalogOnly` — and stops. The flag is parsed, validated, then dropped.

This is a real bug or an unfinished feature, not just a documentation gap. It surfaces in `--help` as if it works.

Note: an earlier draft of this audit also flagged `add mcp` as having an orphaned `--project` flag. That was wrong; `add/mcp.ts:25-39` declares only `--library`, `--dry-run`, `--json`, `--yes`. No `--project` flag exists on `add mcp`.

### 3.4 Designed-but-unimplemented command families

Two families are fully designed in `.ai/analyses/` but not registered in `cli/index.ts`. Readers of the docs reasonably expect them in `--help`.

#### Analyzer family — `.ai/analyses/21_analyzer_integration.md`, `.ai/analyses/22_analyzer_cli_implementation_plan.md`

Designed commands:
- `bgng analyze [--path] [--json] [--no-poll]` — discover Claude Code session logs, package into a tarball, upload to analyzer API, poll for completion, render report.
- `bgng login` — device authorization flow via Better Auth (RFC 8628).
- `bgng logout` — revoke session and delete stored credentials.
- `bgng whoami` — GET session identity from API.

Quote from `21_analyzer_integration.md`:

> "Add a `bgng analyze` command that discovers Claude Code session logs, packages them into a tarball, uploads to the session log analyzer API, polls for completion, and renders the analysis report."

Status: none of these appear in `bgng --help`; none of these command class files exist under `cli/commands/`. The plan in `22_analyzer_cli_implementation_plan.md` references reusable building blocks (`cli/core/skill-packages.ts` for tarballing, `cli/core/output.ts` for rendering), so implementation has a clear path; it just hasn't shipped.

#### Harness Cards family — `.ai/analyses/25_harness-cards-cli-design.md`, `.ai/analyses/26_harness-cards-target-architecture.md`

Designed commands (per `26_harness-cards-target-architecture.md §6`):

- Top-level aliases: `bgng apply <ref>`, `bgng update [<name>]`.
- `bgng card *` namespace: `new`, `publish`, `deprecate`, `diff`, `apply`, `add`, `remove`, `update`, `outdated`, `detach`, `list`, `show`, `status`.
- `bgng store *` namespace: `status`, `migrate`, and later (v2) `remote add|remove`, `push`, `pull`.

Status: none registered. None of the command files exist. The architecture document is "handoff-ready" per its frontmatter but still pending implementation.

#### Status of the README versus current `--help`

The README mostly tracks the implemented surface. Two minor items worth noting:

- `scan` is described in `01_agents-cli-usage-guide.md:219-229` as a future non-mutating discovery command. The current `--help` line — `"Placeholder for future non-mutating local harness discovery."` — is honest. No gap.
- The README and `01_agents-cli-usage-guide.md` describe `init`'s four mode flags accurately. The flag descriptions in `--help` are present but spare; see §3.1 for the leverage argument to enrich them.

No README-described command or flag is missing from `--help` other than the analyzer and cards families above.

## 4. Gap Summary Table

| Category | Severity | Count | Examples |
|---|---|---|---|
| Per-command help missing `details` and `examples` | High (universal) | 30 / 30 | every registered command |
| Commands with zero flags including no `--json` | Medium (consistency) | 2 | `skills curate`, `skills uncurate` |
| Behavior under-described in description line | Medium-High | 10+ | `init` (TTY auto-guided), `add mcp` (interactive + catalog + idempotent), `add skill` (catalog install + `--all` semantics), `extensions setup` (per-extension branches), `extensions doctor` (all-extensions fallback), `mcp list` (project-aware merge), `library defaults add skill` (auto-curation side effect), `library defaults add mcp` (idempotent), `search mcp/skill` (mutually-exclusive flags), `library add skill` (catalog install) |
| Orphaned flag (parsed, never used) | Medium (correctness) | 2 occurrences | `search mcp --project`, `search skill --project` |
| Designed-but-unimplemented commands | High (scope) | 17 commands across 2 families | `analyze`, `login`, `logout`, `whoami`; `card *` (13 verbs), `store *`, `apply`, `update` |
| Hidden path aliases | None | 0 | every command has one `paths` entry |
| Unregistered command files | None | 0 | every file under `cli/commands/` is registered in `cli/index.ts` |

## 5. Recommendations

These are ordered by user-facing leverage. Each is additive — the recommended work does not require behavior changes, only help-surface enrichment plus the two correctness fixes.

### 5.1 Adopt a `usage.details` + `usage.examples` template

Pick `init` and `add extension` as the first two commands to enrich, because they are the two highest-frequency user-facing entry points and currently the most under-described. For each:

- `usage.details`: 2–4 sentences explaining when to use it, what state it reads, what state it mutates, and what to run next.
- `usage.examples`: at least three `[command, label]` pairs covering the common cases (e.g., for `init`: minimal, guided, force-overwrite).

Once two commands have rich help, propagate the template to the remaining 28. There is no in-repo exemplar to copy from today, so step one is to define the shape.

### 5.2 Fix the orphaned `--project` flag

Two options:
1. Thread `this.project` through to `searchMcp` / `searchSkills` and implement the documented ranking-hint behavior.
2. Remove the flag from both `search mcp` and `search skill` until the feature is implemented.

Pick one. Today's state — a documented flag that silently does nothing — is the worst option.

### 5.3 Surface implementation-significant behavior in the description lines

The leverage cases:

- `init` — clarify that guided mode is the TTY default, that `--minimal` and `--non-interactive` produce the same minimal config, and that the command warns on `.gitignore` shape.
- `add mcp` / `add skill` — note that omitting the positional in a TTY triggers an interactive prompt, that `--yes` enables catalog fallback when there's no local match, and that re-adding an already-active item is a safe no-op.
- `extensions setup` — restructure the help to make per-extension flag applicability obvious. One option: split the flag descriptions to name the applicable extension (e.g., `--target #0 — Beads only. Comma-separated setup targets.`).
- `library defaults add skill` — name the auto-curation side effect (`"Add a skill to machine-wide defaults and curate it into ~/.agents."`).
- `mcp list` — note that the output is project-aware when run inside a project.

These are each 1–2 word edits to existing description strings.

### 5.4 Decide on `skills curate` / `skills uncurate` flag parity

These two commands are the only ones in the CLI without `--json`. Either:
1. Add `--json` for consistency with the rest of the CLI, or
2. Decide they're intentionally output-shaped and document why.

This is small, but inconsistencies erode trust in the help surface.

### 5.5 Don't pre-register the analyzer or cards families

`bgng --help` should reflect what works today. Both analyzer and Harness Cards are designed but unimplemented; surfacing them in `--help` before they work would be a regression. The right move is to keep the help line honest now, and add them to `cli/index.ts` as each family ships. The analysis docs (`21–22`, `25–26`) remain the canonical reference for the planned shape.

## 6. Out-of-Scope Observations

A few items surfaced during the audit that are not help-surface gaps but worth flagging for triage elsewhere:

- The `--include-skill` description in `cli/commands/extensions/setup.ts` hard-codes `"beads-task-tracking"` as the skill name. This will be wrong as soon as a non-Beads extension uses `--include-skill`.
- `library add mcp --as` is documented as "Register or select the MCP server with this id" — the dual-purpose wording suggests a possible future split into two flags or a clearer single-purpose flag.
- The `BaseCommand` in `cli/commands/base.ts` already exposes a `Usage()` helper. Adding `details` and `examples` slots to that helper's signature (with defaults) would prevent future commands from regressing back to threadbare help.
