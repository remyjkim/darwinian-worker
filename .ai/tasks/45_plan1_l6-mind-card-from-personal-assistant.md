# ABOUTME: Plan for converting 26 personal-assistant Claude Code slash commands into a reusable drwn Harness Card (@remyjkim/l6-mind-card).
# ABOUTME: First planning iteration — captures alternatives considered, conversion rules, and phased execution.

# Task 45 — Plan 1: `@remyjkim/l6-mind-card` from personal-assistant commands

**Status**: Completed
**Created**: 2026-06-13
**Updated**: 2026-06-14
**Assigned**: Remy + Claude
**Priority**: Medium
**Estimated Effort**: 1–2 days (pilot conversion + 24-skill batch + validation)
**Dependencies**: drwn `card source add-skill --from`, drwn `card publish`, drwn `card apply file:`
**References**: [/Users/pureicis/dev/personal-assistant/v1_1/.claude/commands, .ai/knowledges/10_drwn-cli-architecture.md, darwinian-harness-skills/cards/harness-skills/card.json, /Users/pureicis/dev/darwinian-harness-skills/skills/share-harness-card/SKILL.md, cli/commands/card/source/add-skill.ts, cli/core/card-source.ts]

---

## Objective

Produce a single, publishable Harness Card — `@remyjkim/l6-mind-card` — that bundles the 26 personal-assistant operational procedures as drwn skills, applicable via `drwn card apply` to any project that adopts the refinery / work / life knowledge architecture. The card replaces ad-hoc copy-paste of `.claude/commands/*.md` between sibling personal-knowledge projects.

## Target State

- A card source at `~/.agents/drwn/sources/@remyjkim/l6-mind-card/` with `card.json` listing all 26 skills under `skills.include` and one `skills/<name>/SKILL.md` per command.
- `drwn card source doctor @remyjkim/l6-mind-card` reports `ok: true`.
- `drwn card apply file:~/.agents/drwn/sources/@remyjkim/l6-mind-card` in a scratch project followed by `drwn write --dry-run --json` shows 26 skills planned for materialization into `~/.claude/skills/` (or project-local `.claude/skills/`), with no manifest errors.
- Each skill description is specific enough that Claude reliably triggers it when the user says e.g. `/capture`, `/morning`, or describes the operation in prose.

## Success Criteria

- [ ] All 26 commands are converted to valid SKILL.md files (frontmatter has `name` + `description`; body is portable across projects that share the refinery/work/life layout).
- [ ] `card source doctor` is green; no orphaned/missing skills.
- [ ] Card applies cleanly to a fresh empty project; `drwn write --dry-run --json` includes all 26 in the planned skill set.
- [ ] Trigger-quality smoke test: invoking a sample of skills by either slash-style cue (`/morning`) or prose intent ("good morning, what should I focus on today?") lands on the intended SKILL.md, verified by reading the chosen skill in a test session.
- [ ] Card is published to the local store via `drwn card publish @remyjkim/l6-mind-card` (push to git remote is a separate, optional follow-up).

## Alternatives Considered

### Option A — Convert slash commands to skills (CHOSEN)

Rewrite each `.md` into a `SKILL.md` with `name` + an expanded `description`. Body keeps the refinery/work/life vocabulary; `$ARGUMENTS` (Claude Code's slash arg) is replaced with explicit "read the mind/refinery name from the user's message; ask if absent" prose.

- **Pro**: Lives natively in the drwn card system. Gets card.lock provenance, `drwn status --why`, version pins, catalog publication.
- **Pro**: One card = one apply step in any new project.
- **Con**: Invocation shifts from explicit `/capture` to description-matched auto-trigger. Mitigated by including slash forms as keyword cues in the description (e.g. *"Use when the user says /capture or describes capturing raw input into a refinery"*).
- **Con**: Loses `$ARGUMENTS` substitution; each skill body must handle missing args by asking.

### Option B — Skip drwn, ship as a Claude Code plugin or symlink

Distribute the `commands/` directory directly via a Claude Code plugin marketplace or by symlinking from each consuming project.

- **Pro**: Preserves the `/capture dalio` slash UX 1:1, including `$ARGUMENTS`.
- **Con**: Lives outside drwn. No card.lock, no `drwn status --why`, no shared apply path with the other harness skills.
- **Con**: Diverges from the established `@remyjkim/dh-card-base` / `@remyjkim/personal-harness` pattern Remy already uses.

### Option C — Extend drwn to materialize a `commands/` directory in cards

Add a `commands` surface to `card.json` (analogous to `skills.include`), update the manifest validator, the source authoring commands (`card source add-command`, etc.), the lockfile, and the downstream materializer to write into `.claude/commands/`.

- **Pro**: Preserves slash semantics inside the drwn model.
- **Con**: Significant architectural change touching `card-manifest.ts`, `card-source.ts`, `card-install.ts`, `card-lock.ts`, downstream writers, and tests. Out of scope for *this* task; defer until the gap recurs across multiple cards.

**Decision (2026-06-13):** Option A. Remy confirmed the trade-off in chat: convert to skills, accept the invocation-semantic shift, mitigate via keyword-rich descriptions.

## Probe Results (2026-06-14)

Before committing to a 26-skill batch, we ran a single-skill end-to-end probe to verify Option A's load-bearing assumption: that a drwn-materialized skill is actually reachable in Claude Code.

**Setup:**

1. Converted `morning.md` to `SKILL.md` per the recipe below, staged at `/tmp/l6-mind-probe-staging/morning/`.
2. Created `~/.agents/drwn/sources/@remyjkim/l6-mind-probe/` via `drwn card new @remyjkim/l6-mind-probe --no-git`. (Probe-named, not the real card name, so `@remyjkim/l6-mind-card` stays clean.)
3. `drwn card source add-skill @remyjkim/l6-mind-probe morning --from /tmp/l6-mind-probe-staging/morning` → `Added morning`.
4. `drwn card source doctor @remyjkim/l6-mind-probe --json` → `ok: true`, zero issues.
5. Scratch project at `/tmp/l6-mind-test-project/`, `drwn init --non-interactive`.
6. `drwn card apply file:/Users/pureicis/.agents/drwn/sources/@remyjkim/l6-mind-probe` → no trust warnings, no untrusted-source flag needed.
7. `drwn write --dry-run --json` showed `symlink .claude/skills/morning -> ...sources/@remyjkim/l6-mind-probe/skills/morning ← card @remyjkim/l6-mind-probe@1.0.0` with zero warnings.
8. `drwn write` materialized the symlink; SKILL.md readable through it with frontmatter intact.

**Runtime test in Claude Code (scratch project):**

| Invocation | Result |
| --- | --- |
| `/morning` | Skill fired; redirected to `/init-refinery` per the "Assumes" guard. |
| `good morning` | Auto-triggered the same skill; same redirect. |
| `morning sync` | Auto-triggered the same skill; same redirect. |

**What the probe resolves:**

- **Slash invocation works.** `/<skill-name>` reliably fires a drwn-materialized skill in Claude Code. This is the load-bearing assumption — without it, op-* skills with cryptic codes (`/op-down-03-worldview-reappraisal`) would be unreachable. Option A is fully viable.
- **Prose auto-trigger works** when the description includes keyword cues. Validates the description-rewrite rule.
- **"Assumes" guard pattern works.** The skill self-detected missing scaffolding and pointed to `/init-refinery` instead of fabricating refinery data. No card-level README needed; the per-skill guard is sufficient.
- **`file:` ref apply on an unpublished source needs no trust override** — `--allow-untrusted-source` not required for refs into the user's own `~/.agents/drwn/sources/`.
- **Default manifest version is `1.0.0`**, not `0.1.0` as initially assumed. `drwn card new` sets this; doesn't affect anything but worth noting.

**Probe artifacts:** retained at `/tmp/l6-mind-probe-staging/`, `~/.agents/drwn/sources/@remyjkim/l6-mind-probe/`, and `/tmp/l6-mind-test-project/`. Remove during Phase 2 setup if not needed for further reference.

## Approach

A two-phase conversion: **pilot** two representative commands to lock down the conversion recipe, **batch** the remaining 24 once the recipe is reviewed. Plan-doc-first (this document) precedes any file mutation.

### Conversion Recipe (single source of truth)

For each source command at `personal-assistant/v1_1/.claude/commands/<name>.md`:

1. **Compute the skill slug.** Strip `.md`; keep kebab-case as-is. Example: `op-up-01-voice-extraction.md` → `op-up-01-voice-extraction`.

2. **Rewrite frontmatter.** Original:
   ```yaml
   ---
   description: Daily startup — surface priorities, action items, and today's focus across work and life
   ---
   ```
   Becomes:
   ```yaml
   ---
   name: morning
   description: "Use when the user says /morning, 'good morning', 'morning sync', or asks for today's priorities and focus across work and life domains."
   ---
   ```
   Description rules:
   - Start with `Use when …`.
   - Include the original slash form (`/morning`) and 2–3 colloquial paraphrases as keyword cues.
   - Keep it under ~220 chars where possible.
   - No marketing voice; describe the *trigger*, not the procedure.

3. **Handle `$ARGUMENTS` and slash-arg parsing.** Where the source body uses `$ARGUMENTS`:
   - Replace `$ARGUMENTS` with a descriptive placeholder (`<mind>`, `<mind> <epub-path>`, etc.) per the source command's documented invocation form.
   - Add a "Determine arguments" step at the top of the body:

     > **Determine arguments.** When invoked via slash, the user's message is literally `/<command> [args…]`. Parse tokens after the command name as positional arguments in the order documented (e.g., `/capture dalio` → `mind=dalio`; `/capture-epub dalio /path/to/file.epub` → `mind=dalio`, `epub=/path/to/file.epub`). When invoked via prose, read the same arguments from the user's message. If any required argument is missing, ask before proceeding.

   - Leave path templates like `refineries/<mind>/06_raw_data/` intact — these encode the architecture the card assumes.

4. **Add an "Assumes" note** (one-line) immediately under the H1 when the skill depends on the refinery/work/life layout. The skill body MUST check the assumption before doing work and redirect to `/init-refinery` (or whatever bootstrap is appropriate) if the scaffolding is missing — the probe confirmed this pattern works as the bootstrap-on-empty-project guard.

   > **Assumes:** project has `refineries/<mind>/{01_soul_values,…,06_raw_data}/`, `work/_index.md`, `life/_index.md`. If missing, instruct the user to run `/init-refinery` and stop.

5. **Preserve everything else.** Procedure steps, output specs, post-operation notes, formatting — all kept verbatim. Skills are prompts; their content is the value.

6. **Directory-shaped sources (`capture-epub` only).** The source command at `commands/capture-epub/` contains `capture-epub.md` plus a `scripts/` subdirectory. The recipe options:
   - **Inline scripts** into the skill body where short.
   - **Skip from this card** and keep `capture-epub` as a separate slash command (or future Option C surface), if the scripts are essential and don't translate cleanly. Phase 2 decides; document the choice in the completion summary.
   - Do NOT rely on the skill being able to execute scripts at relative paths like `./scripts/…` — at runtime the working directory is the project root, not the skill dir, and the skill has no portable way to know its own resolved location.

### Card Source Authoring Mechanics

Staging directory: `/tmp/l6-mind-staging/<skill>/SKILL.md` (one dir per skill — `add-skill --from` requires a directory containing `SKILL.md`; confirmed at `cli/core/card-source.ts:223,634`).

```bash
# 1. Create empty source
bun run drwn -- card new @remyjkim/l6-mind-card

# 2. For each converted skill (loop):
bun run drwn -- card source add-skill \
  @remyjkim/l6-mind-card <skill-name> \
  --from /tmp/l6-mind-staging/<skill-name>

# 3. Validate
bun run drwn -- card source doctor @remyjkim/l6-mind-card --json

# 4. Apply to scratch project, dry-run write
mkdir -p /tmp/l6-mind-test && cd /tmp/l6-mind-test
bun run drwn -- init --non-interactive
bun run drwn -- card apply file:$HOME/.agents/drwn/sources/@remyjkim/l6-mind-card
bun run drwn -- write --dry-run --json

# 5. Publish to local store
bun run drwn -- card publish @remyjkim/l6-mind-card
```

### Iteration Workflow

During Phase 2/3, expect the conversion recipe to need tweaks when a description fails to trigger or a body needs clarification. Loop:

1. Edit the SKILL.md in staging.
2. `drwn card source add-skill @remyjkim/l6-mind-card <skill> --from <staging> --replace` — overwrites the bundled copy in the source.
3. Re-run `drwn card source doctor`.
4. In the scratch project: `drwn write` re-syncs (no `card apply` needed; the `file:` ref uses `range: "*"`, so the source is re-read each write).
5. Restart the Claude Code session in the scratch project to pick up the updated SKILL.md (Claude loads skills at session start).

No `card.json` version bump is required during iteration — that's reserved for cutting a published release after Phase 5.

## Implementation Plan

### Phase 1: Plan ratification

- [x] Remy reviews this document.
- [x] Confirm card name `@remyjkim/l6-mind-card`.
- [x] Confirm conversion recipe (frontmatter + `$ARGUMENTS` + Assumes note).
- [x] Approve to proceed to Phase 2.

### Phase 1.5: De-risk probe — single-skill end-to-end (COMPLETED 2026-06-14)

- [x] Convert `morning.md` per recipe.
- [x] Build `@remyjkim/l6-mind-probe` source, `doctor` green.
- [x] Apply to scratch project, `drwn write`, verify symlink resolves.
- [x] Open Claude Code in scratch project; confirm `/morning`, "good morning", and "morning sync" all fire the skill.
- [x] Confirm "Assumes" guard redirects to `/init-refinery` on empty project.

See **Probe Results** section above for full findings.

### Phase 2: Pilot conversion (2 skills) on the real card

Per Remy's "carry out the entire task" directive on 2026-06-14, Phases 2 and 3 were merged into a single batch conversion of all 25 skills. The capture-epub decision was made up front before any conversion: **skipped** (see completion summary).

- [x] Create the real card source: `drwn card new @remyjkim/l6-mind-card --no-git`.
- [x] **Decide `capture-epub`** — skipped. It is a TypeScript project with `node_modules`, dependencies on `tsx`/`xml2js`/`epub`, and shell-out execution from `.claude/commands/capture-epub/scripts/epub-extract/src/index.ts`. Inlining ~500 lines of TS into a SKILL.md prompt is unworkable; relative-path execution from `.claude/skills/` would break. Final skill count: **25, not 26.**
- [x] Pilot sign-off step skipped per directive (recipe was probe-validated on `morning`).

### Phase 3: Batch conversion (25 skills total — merged with Phase 2)

Recipe applied to all 25 commands; `capture-epub` excluded. All 25 added via `drwn card source add-skill --from /tmp/l6-mind-staging/<skill>` (one-liner loop). All returns: `Added <name> to @remyjkim/l6-mind-card`.

- [x] `bridge`
- [x] `capture` (Phase 2 pilot 1)
- [x] ~~`capture-epub`~~ — skipped (see Phase 2)
- [x] `fast-track-insert`
- [x] `fast-track-update`
- [x] `init-refinery`
- [x] `morning`
- [x] `op-cross-01-identity-reasoning-fidelity`
- [x] `op-cross-02-model-source-fidelity`
- [x] `op-cross-03-mind-coherence-broadcast`
- [x] `op-down-01-value-propagation`
- [x] `op-down-02-principle-model-audit`
- [x] `op-down-03-worldview-reappraisal`
- [x] `op-down-04-inquiry-direction`
- [x] `op-down-05-source-seeking`
- [x] `op-maint-01-consistency-scan`
- [x] `op-maint-02-reconstruction-fidelity-review`
- [x] `op-up-01-voice-extraction` (Phase 2 pilot 2)
- [x] `op-up-02-dialectical-mapping`
- [x] `op-up-03-worldview-synthesis`
- [x] `op-up-04-commitment-distillation`
- [x] `op-up-05-identity-crystallization`
- [x] `process`
- [x] `scan-for-update-or-insert`
- [x] `user-query-inference`
- [x] `weekly-review`

### Phase 4: Validation

- [x] `drwn card source doctor @remyjkim/l6-mind-card --json` → `ok: true`, zero issues, all 25 skills with `hasSkillMd: true`.
- [x] `card.json.skills.include` confirmed listing 25 entries.
- [x] Card swapped in `/tmp/l6-mind-test-project/`, `drwn write --dry-run --json` returned `warnings: []` with all 25 skills planned for `.claude/skills/<name>` and `.codex/skills/<name>` symlinks.
- [x] `drwn write` materialized 50 symlinks (25 × 2 targets). `morning` symlink resolves to `~/.agents/drwn/sources/@remyjkim/l6-mind-card/skills/morning`.
- [ ] **Runtime trigger smoke test deferred** — Remy authorized "carry out the entire task" so we proceeded on the basis of the probe's runtime validation. Per-skill description-trigger quality can be iterated post-publish via `add-skill --replace` if any specific skill fails to fire on its expected slash/prose cue. Op-* skills with cryptic codes are accepted as slash-only by design (no natural prose trigger).

### Phase 5: Publication

- [x] `drwn card publish @remyjkim/l6-mind-card` → published v1.0.0 at `~/.agents/drwn/extracted/d61c27a634b46191a67df6b13cfcb5b244bb3db7`.
- [x] `gh auth status` — logged in as `remyjkim`, SSH protocol.
- [x] `gh repo view remyjkim/l6-mind-card` 404'd as expected.
- [x] `gh repo create remyjkim/l6-mind-card --private` → `https://github.com/remyjkim/l6-mind-card`, visibility PRIVATE.
- [x] `drwn card remote add @remyjkim/l6-mind-card git@github.com:remyjkim/l6-mind-card.git`.
- [x] `drwn card remote list @remyjkim/l6-mind-card --json` confirmed `origin -> git@github.com:remyjkim/l6-mind-card.git`.
- [x] `drwn card push @remyjkim/l6-mind-card` → `Pushed @remyjkim/l6-mind-card to origin`.
- [x] `git ls-remote` confirmed `refs/heads/main` at `d3fc0c43…` and `refs/tags/v1.0.0` at `2f8cbb94…` (annotated tag → same commit).
- [x] Strong smoke test in isolated `HOME`: `drwn card clone git+git@github.com:remyjkim/l6-mind-card.git#v1.0.0 --json` succeeded; manifest lists all 25 skills. `drwn card validate @remyjkim/l6-mind-card@1.0.0 --json` returned `ok: true` with integrity `sha256-1af9e8ac…`.

## Acceptance Criteria

- [x] 25 SKILL.md files exist under the card source (`capture-epub` skipped), each valid per `card-source.ts:assertValidCardManifest` rules.
- [x] `card.json.skills.include` lists 25 entries; all match directory names.
- [x] `card source doctor` is green.
- [x] Card applies and `drwn write --dry-run` shows planned materialization with zero warnings.
- [ ] Slash-invocation smoke test passes on the 3 sampled skills. **Deferred** — see Phase 4 note.
- [ ] Prose-trigger smoke test passes on the 5 named-trigger skills. **Deferred** — see Phase 4 note.
- [x] This plan doc is updated to **Completed** with a sibling `45_completion_l6-mind-card.md` summarizing what shipped, decisions made during conversion (especially `capture-epub`), op-* skills accepted as slash-only, and any deviation from the recipe.

## Testing Strategy

- **Manifest validity**: `card source doctor` is the contract test.
- **Materialization**: `drwn write --dry-run --json` against a scratch project — checks the card flows through the resolver and downstream writer without runtime errors.
- **Trigger quality**: manual smoke test in a real Claude Code session. Skill-trigger reliability is not deterministic enough to script; sample 3 skills and iterate descriptions if they fail to fire.
- **No automated unit tests** are added to the drwn repo for this task — the work is content authoring on top of existing CLI surfaces, not new CLI behavior. (If the recipe surfaces a bug in `card source add-skill`, that gets its own task.)

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `capture-epub` scripts can't be referenced from a symlinked skill dir | Medium | Recipe rule 6 forces the decision in Phase 2: inline the scripts or skip the skill. No hand-waving. |
| Multi-arg slash invocations parsed wrong (`/capture-epub dalio /path.epub`) | Medium | Recipe rule 3 now spells out positional parsing with explicit examples. Verified during the `capture` pilot in Phase 2. |
| Skill trigger collisions when this card is applied alongside other personal cards in the same project | Low | Skills are description-gated; collisions surface at use-time. Deferred — revisit if it bites. |
| Card too project-specific to be useful across projects | Low | The probe confirmed the per-skill "Assumes" guard handles empty-project gracefully. Naming (`l6-mind-card`) advertises the domain assumption. |

**Resolved by probe (see Probe Results):** description-too-vague → triggers reliably with keyword cues; `$ARGUMENTS` removal degrading op-* skills → slash invocation is the reliable floor; bootstrap-on-empty-project → "Assumes" guard works; trust check on file: refs → no override needed.

## Open Questions

(None remaining. Git remote resolved 2026-06-14: private `remyjkim/l6-mind-card` GitHub repo, driven by the `share-harness-card` skill — see Phase 5.)

## Notes

- Card name `@remyjkim/l6-mind-card` chosen by Remy in the planning chat (2026-06-13). "L6" maps to the raw-data layer in the refinery vocabulary; "mind" maps to the per-mind refinery concept.
- The 12-skill `darwinian-harness-skills` bundle is the structural reference for `card.json` shape and skill directory layout.
- Authoring scope `@remyjkim` is already saved in `~/.agents/drwn/machine.json`, so `drwn card new @remyjkim/l6-mind-card` proceeds without prompts.
- Probe source `@remyjkim/l6-mind-probe` is retained as a working reference until Phase 2 begins; clean up via `rm -rf ~/.agents/drwn/sources/@remyjkim/l6-mind-probe /tmp/l6-mind-probe-staging /tmp/l6-mind-test-project` once it stops being useful (or repurpose `/tmp/l6-mind-test-project` as the Phase 2/3 scratch project after `drwn card apply` swaps in the real card).
