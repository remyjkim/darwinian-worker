# ABOUTME: Distribution-strategy analysis for drwn meta-skills — skills that wrap drwn workflows themselves.
# ABOUTME: Triggered by the import-mcp-from-claude skill; generalizes to future drwn-internal automation.

# Analysis 68 — Distribution Options for drwn Meta-Skills

**Date**: 2026-06-19
**Updated**: 2026-06-19
**Author**: Claude + Remy
**Status**: Revised — Option C collapses into existing `@darwinian/harness-skills`
**References**: [.ai/analyses/64_darwinian-notion-mcp-target-architecture.md, .ai/analyses/67_drwn-loose-skill-addition-target-architecture.md, .ai/tasks/46_darwinian-notion-mcp-implementation-plan.md, /tmp/import-mcp-staging/import-mcp-from-claude/SKILL.md, cli/commands/library/add/skill.ts, cli/core/card-source.ts]

---

## Executive Summary

We need to decide where the `import-mcp-from-claude` skill lives. Three viable surfaces:

- **A. Local skill library** — register on this machine; available everywhere without a card.
- **B. Bundle into an existing personal card** (e.g. `@remyjkim/personal-harness`).
- **C. Add to the existing `@darwinian/harness-skills` card** at `/Users/pureicis/dev/darwinian-harness-skills/`.

**Revised recommendation (2026-06-19): Option C is the right immediate choice.** The `darwinian-harness-skills` repo already exists and already ships 13 drwn-workflow wrappers (`apply-harness-card`, `manage-harness-library`, `share-harness-card`, etc.). `import-mcp-from-claude` is the same category of skill. Adding it as the 14th skill is the natural fit — no new card, no new distribution decision, identical lifecycle to its siblings.

Original recommendation was Option A (local library), under the assumption that no shared drwn-meta-skills card existed yet. That assumption was wrong: `@darwinian/harness-skills` is that card. Option A remains valid for fast pre-commit iteration, but the destination is C.

**Option B (personal-harness)** is still wrong — conflates personal preferences with shared workflow automation.

---

## Context

### What is a "drwn meta-skill"?

A skill whose body **drives the drwn CLI itself** rather than wrapping a domain like Notion, refineries, or code review. The `import-mcp-from-claude` skill drafted today is the first concrete example. Its job is to move state between Claude Code's MCP config and drwn's library.

Other plausible meta-skills, none yet written:

- `migrate-claude-settings-to-drwn` — port full Claude settings (skills, slash commands, hooks) into drwn-managed equivalents.
- `audit-drwn-drift` — walk every drwn-managed project on the machine, run `drwn doctor`, surface drift in one report.
- `promote-skill-to-card` — take a loose `~/.agents/drwn/library/skills/<name>` entry and bundle it into a card source.
- `cross-tool-mcp-status` — show MCP auth status across Claude / Codex / Cursor for one or all configured servers (eventually subsumed by `drwn status --why <mcp> --tools` once that ships per analysis 64 Phase 2).
- `card-version-bumper` — diff a card source against its previous version, classify the bump (patch/minor/major), set the version, optionally publish.

These share three properties:

1. **Audience is drwn users**, not general Claude/Codex users. Useless without `drwn` installed.
2. **They orchestrate drwn commands** in sequences that the CLI itself doesn't ship today.
3. **They're stable workflows** — not project-specific recipes.

That last property is what makes "distribute them somewhere reusable" the right question.

### Why this is worth deciding now rather than reactively

Skills accumulate. Once we have 4–5 meta-skills scattered across personal cards and the local library, refactoring becomes work. Picking the surface explicitly per-skill costs nothing today; recovering from a wrong default later costs measurable effort (rename, republish, consumer card update).

---

## Investigation: The Three Options

### Option A — Local skill library (machine-wide)

**Mechanics:**

```bash
drwn library add skill /tmp/import-mcp-staging/import-mcp-from-claude
drwn library defaults add skill import-mcp-from-claude
drwn write   # in any project where you want it active
```

Behind the scenes:

- `library add skill` registers the skill under `~/.agents/drwn/library/skills/import-mcp-from-claude/SKILL.md` (matching the `library add mcp` pattern at `cli/commands/library/add/skill.ts`).
- `library defaults add skill` appends the skill name to `~/.agents/drwn/machine.json`'s `defaults.skills` array.
- `drwn write` materializes a symlink at `<project>/.claude/skills/import-mcp-from-claude` pointing to the library entry. Same in `.codex/skills/`.

**Where the bytes live:** machine-local, single source of truth at `~/.agents/drwn/library/`.

**Audience:** the developer's own machine. Other developers do not get this skill unless they also `library add skill` it on their machines.

**Update lifecycle:**

```bash
# Edit the file in place:
vim ~/.agents/drwn/library/skills/import-mcp-from-claude/SKILL.md
# Or re-add from staging:
drwn library add skill /tmp/import-mcp-staging/import-mcp-from-claude --replace
# No drwn write needed — symlinks already resolve to the (mutated) source.
# Restart Claude Code to pick up the new SKILL.md.
```

No version field, no publish step, no `card update` on consumers.

**Pros:**

- Lowest possible friction. One step to install, no version juggling.
- Edits are immediately live (after the tool restarts) — fast iteration during development.
- Doesn't pollute any card's manifest with a skill that may evolve fast.
- Safe to delete: `drwn library defaults remove skill import-mcp-from-claude` cleanly removes it from machine defaults; the library entry can stay or be deleted.

**Cons:**

- Cannot be shared with teammates without each of them repeating the install.
- No version history. If you want to roll back to an earlier behavior, git is the only option (and the library lives outside any repo by default).
- Doesn't carry an MCP server alongside, so it can't bundle "skill + the drwn MCP entry it depends on" — they'd live in separate surfaces. Not a problem for this skill (it depends only on `drwn` and `claude` CLIs being on PATH), but a constraint for future meta-skills that need bundled MCPs.

**Best for:** the immediate case. Single skill, solo author, fast iteration, no distribution requirement.

### Option B — Bundle into an existing personal card

**Mechanics:**

```bash
drwn card source add-skill @remyjkim/personal-harness import-mcp-from-claude \
    --from /tmp/import-mcp-staging/import-mcp-from-claude
drwn card source set @remyjkim/personal-harness --version <next-patch>
drwn card publish @remyjkim/personal-harness
drwn card push @remyjkim/personal-harness
# In consuming projects:
drwn card update && drwn write
```

Behind the scenes:

- `card source add-skill` copies the staging directory into `~/.agents/drwn/sources/@remyjkim/personal-harness/skills/import-mcp-from-claude/`. Appends the skill to `card.json.skills.include`.
- The personal card gains a new version. Any project that has it applied resolves to the new version on the next `card update` (or a fresh `card apply`).

**Where the bytes live:** inside the personal card source, then in the card store after publish.

**Audience:** anyone who applies `@remyjkim/personal-harness`. Today that's just Remy (per the existing source list), but it's structurally shareable.

**Update lifecycle:** standard card iteration. Edit in source, `card source add-skill --replace`, bump version, republish, push.

**Pros:**

- Versioned, distributable.
- One card to apply gets you "Remy's whole opinionated harness," including this skill.

**Cons:**

- **Conflates concerns.** `@remyjkim/personal-harness` is an opinionated set of skills + MCPs Remy uses personally. `import-mcp-from-claude` is a drwn workflow tool relevant to anyone using drwn — its identity is "drwn meta-skill," not "Remy's preference." Bundling it here ties its lifecycle to unrelated personal-harness decisions (e.g., when Remy adds or removes a personal skill, this meta-skill gets a forced version bump).
- **Hard for others to reuse cleanly.** A teammate who wants `import-mcp-from-claude` but not the rest of Remy's harness can't get it without either applying the whole card or extracting the skill into their own card.
- Forces a card version bump on every meta-skill iteration even if no personal-harness change happened.

**Best for:** almost nothing in this lineup. The right card for this skill is "drwn meta-skills" (Option C), not "Remy's personal harness."

### Option C — Add to the existing `@darwinian/harness-skills` card

**Mechanics:**

```bash
# 1. Author the canonical SKILL.md inside the harness-skills repo.
cp /tmp/import-mcp-staging/import-mcp-from-claude/SKILL.md \
   /Users/pureicis/dev/darwinian-harness-skills/skills/import-mcp-from-claude/SKILL.md
# (or move it directly; either way the source-of-truth file ends up under skills/)

# 2. Update the card manifest to include it.
# Edit cards/harness-skills/card.json -> skills.include array, append "import-mcp-from-claude".

# 3. Sync the canonical copy into the bundled card.
cd /Users/pureicis/dev/darwinian-harness-skills
npm run sync:cards          # syncs skills/<name>/ → cards/harness-skills/skills/<name>/

# 4. Validate.
npm run validate:skills

# 5. Bump card version in cards/harness-skills/card.json (e.g. 0.1.0 → 0.2.0 for minor add).
# 6. Commit and publish per the repo's release process.
```

Behind the scenes: this is the canonical authoring flow for `darwinian-harness-skills`. Confirmed by:

- `package.json:scripts.sync:cards = node scripts/sync-card-skills.mjs` — the documented sync mechanism.
- `cards/harness-skills/card.json:skills.include` lists 12 sibling meta-skills today; appending one is the established pattern.
- README explicitly states: *"After editing canonical skills under `skills/`, refresh the card-bundled copies with: `npm run sync:cards`."*

**Where the bytes live:** canonical source at `darwinian-harness-skills/skills/import-mcp-from-claude/SKILL.md`; bundled copy synced to `cards/harness-skills/skills/import-mcp-from-claude/SKILL.md`.

**Audience:** anyone who applies `@darwinian/harness-skills`. Today that's anyone using drwn who's installed the published card.

**Update lifecycle:** edit canonical, `npm run sync:cards`, bump card version (patch for fixes, minor for added skills, major for breaking changes), commit, publish via existing release process.

**Pros:**

- **No new card to stand up.** Zero new distribution decisions. Zero new GitHub repos. Zero new namespaces to establish.
- **Identical lifecycle to 13 sibling meta-skills.** Whatever release rhythm and validation harness-skills has, this skill inherits.
- **Discoverability.** Anyone browsing `@darwinian/harness-skills` for drwn workflow automation finds it.
- **Coherent identity.** This is precisely what `darwinian-harness-skills` is for: skills wrapping drwn CLI workflows.
- **Future meta-skills** (`audit-drwn-drift`, `promote-skill-to-card`, etc.) naturally land in the same repo without any expansion decision.

**Cons:**

- Slower iteration loop than Option A — every edit needs `sync:cards` + version bump + republish if you want it live in consuming projects. Pre-commit iteration is best done via Option A first, then graduate.
- Locks the skill to the harness-skills release cadence. A bug fix on this skill ships only when the card is next released, alongside whatever else has accumulated.

**Best for:** the canonical home for this skill once it's stable enough to commit.

---

## Comparison Matrix

| Property | A · Library | B · Personal-harness | C · `@darwinian/harness-skills` (existing) |
| --- | --- | --- | --- |
| Install steps | 2 (`library add` + `defaults add`) | 4 (`card source add-skill`, `set`, `publish`, push) | 3 (drop SKILL.md, edit card.json, `npm run sync:cards`) — no new card stood up |
| First-iteration edit-to-live time | seconds (file edit + tool restart) | minutes (card source edit + version bump + republish) | minutes (canonical edit + sync + version bump + republish) |
| Distribution to teammates | manual per machine | applies if they apply the personal card | applies to every consumer of `@darwinian/harness-skills` (already widely consumed) |
| Version history | none (or git outside drwn) | yes (entangled with unrelated changes) | yes (clean, alongside 13 sibling meta-skills) |
| Skill identity / namespace | machine-local | `@remyjkim/personal-harness` | `@darwinian/harness-skills` (already established) |
| Conflates concerns? | no | **yes** — personal vs meta | no |
| New card stood up? | n/a | no (existing) | **no — uses an established card** |
| Discoverability for new users | low | low | high (the canonical drwn-workflow skills bundle) |
| Cleanup cost if abandoned | low (`defaults remove`) | requires card version bump removing skill | requires card version bump removing skill |
| Best when... | iterating pre-commit, fast feedback | (not recommended for this case) | stable enough to commit; canonical home |

---

## Findings

1. **Option B is the worst fit for this skill specifically.** Personal-harness is for personal preferences; drwn meta-skills are for shared workflow automation. Bundling them couples lifecycles that have no reason to be coupled.

2. **Option C is the canonical destination.** `@darwinian/harness-skills` already exists, already ships 13 sibling drwn-workflow skills, and is exactly what an "import-mcp-from-claude" skill should ship under. No new card or distribution decision needed.

3. **Option A is a pre-commit iteration aid, not a final destination.** While the skill body is being refined (typos, trigger-keyword tuning, output-format adjustments), Option A's `library add skill` → `drwn write` → restart tool loop is faster than the card iteration cycle. Once the skill is stable, graduate to Option C.

4. **Migration A → C is straightforward.** Copy the SKILL.md from `~/.agents/drwn/library/skills/import-mcp-from-claude/` to `darwinian-harness-skills/skills/import-mcp-from-claude/`, append to `cards/harness-skills/card.json` includes, run `npm run sync:cards`, bump version, publish. Optionally remove the library entry with `drwn library defaults remove skill import-mcp-from-claude`.

5. **There is no irrecoverable choice here.** Library and card sources compose; you can have something in the library and later add it to a card without conflict. The card-provided version wins per `card-skill-resolver.ts:31-65`.

6. **A drwn ergonomic gap is exposed here** — see analysis 67. Today, doing Option A on a loose `SKILL.md` file requires wrapping it in a fake npm bundle because `drwn library add skill` only accepts package-backed inputs. Analysis 67 specifies the fix (accept loose SKILL.md / loose skill directory in `library add skill`). Worth implementing if we expect more iteration loops like this one. See *Relationship to analysis 67* below.

---

## Recommendations

### If the skill body is final → go straight to Option C

```bash
# 1. Move the skill into the canonical location.
mv /tmp/import-mcp-staging/import-mcp-from-claude \
   /Users/pureicis/dev/darwinian-harness-skills/skills/import-mcp-from-claude

# 2. Edit cards/harness-skills/card.json to append "import-mcp-from-claude" to skills.include
#    and bump version (likely 0.1.0 → 0.2.0 since this is an additive change).

# 3. Sync, validate, commit, publish.
cd /Users/pureicis/dev/darwinian-harness-skills
npm run sync:cards
npm run validate:skills
git commit -am "feat(skills): add import-mcp-from-claude"
# Then the repo's normal release process (publish to npm marketplace + push to remote).
```

### If you want to iterate before committing → Option A first, then Option C

```bash
# A1. Wrap the staging dir into a fake npm bundle so `library add skill` accepts it
#     (workaround until analysis 67 is implemented):
mkdir /tmp/import-mcp-bundle && cd /tmp/import-mcp-bundle
cat > package.json <<EOF
{ "name": "@local/import-mcp-from-claude", "version": "0.1.0", "private": true, "files": ["skills","bundle.json"] }
EOF
cat > bundle.json <<EOF
{ "schemaVersion": 1, "bundleName": "@local/import-mcp-from-claude", "version": "0.1.0",
  "skills": [{ "name": "import-mcp-from-claude", "scope": "shared", "path": "skills/shared/import-mcp-from-claude" }] }
EOF
mkdir -p skills/shared && cp -r /tmp/import-mcp-staging/import-mcp-from-claude skills/shared/

# A2. Install + activate.
drwn library add skill /tmp/import-mcp-bundle
drwn library defaults add skill import-mcp-from-claude
drwn write       # in a real project

# A3. Iterate on the SKILL.md, re-run `library add skill ... --replace` each time,
#     restart the tool, smoke-test.

# A4. When stable, do the Option C move-and-publish above.
# Then optionally: drwn library defaults remove skill import-mcp-from-claude
```

### Don't pursue Option B

Personal-harness should not carry generic drwn workflow tools. If you want both your personal opinionated set *and* the meta-skills, apply both cards in the project (Option C ships under `@darwinian/harness-skills`, which composes cleanly with `@remyjkim/personal-harness`).

---

## Open Questions

1. **Card naming**: when we hit the Option C trigger, do we use `@darwinian/drwn-meta-skills`, `@darwinian/harness-helpers`, `@darwinian/drwn-workflows`, or something else? `drwn-meta-skills` is descriptive but jargon-heavy. `harness-helpers` is friendlier but less precise. Worth a 30-second decision when we make it, not now.

2. **Visibility**: `@darwinian/harness-skills` is public-marketplace material; should `drwn-meta-skills` follow the same path or stay private? Probably the same path — they're complementary toolkits.

3. **Cross-tool extension of `import-mcp-from-claude`**: should it cover Codex (`codex mcp list`) and Cursor (config file inspection) in v1, or stay Claude-only and add others as needed? Staying Claude-only is fine for the first release; the skill body already calls out the extension path.

4. **`drwn library promote-skill` ergonomic**: if we end up writing several meta-skills and graduating them to cards, a `drwn library promote-skill <name> --to <card>` helper that copies the library entry into a card source becomes worth ~30 LOC. File when it's actually needed.

5. **Skill description trigger words**: `/import-mcp-from-claude` is verbose. Aliases worth adding via the description's keyword cues: "port my MCP", "import MCP", "move MCP to drwn". Already in the trigger spec — verify they fire reliably during Phase 1 smoke test.

---

## Relationship to Analysis 67 (`drwn-loose-skill-addition-target-architecture`)

Analysis 67 specifies the drwn-side fix for the ergonomic pain that surfaces in Option A above: today, registering a loose `SKILL.md` in the local library requires manually wrapping it in `package.json` + `bundle.json` scaffolding because `drwn library add skill` only accepts npm-package-shaped inputs.

### Is implementing 67 meaningful?

**Yes — but evaluate on its own merits, not as a blocker for this skill.** Three points:

1. **For our immediate case (`import-mcp-from-claude` → harness-skills)**: 67 is not needed. We can drop the SKILL.md directly into the `darwinian-harness-skills` repo and skip the library entirely.

2. **For the pre-commit iteration loop**: 67 removes a real papercut. The Option A workaround above is 12 lines of bash that nobody should have to write. Once 67 lands, that block becomes `drwn library add skill ./SKILL.md`.

3. **For future meta-skills**: every new drwn meta-skill we write will hit the same papercut during its iteration phase. 67's Phase 1 is well-scoped (~3-5 focused days) and has clean acceptance criteria. The synthetic-bundle approach it proposes is the right design — reuses the existing installed-bundle resolution path without adding a new state layer.

### Recommendation on 67

Implement 67 Phase 1 (loose input support for `library add skill` and `card source add-skill --from`) **when** either of these triggers fires:

- We've authored ≥2 meta-skills via the workaround pattern above, and the friction is visible.
- A teammate hits the same workflow and finds it surprising.

If neither has happened, defer. 67 is a quality-of-life improvement, not a load-bearing feature. The current path-around-it (drop directly into harness-skills repo, skip library entirely) works fine for one-off skill additions to existing cards.

The right way to think about it: 67 makes the library a viable scratchpad for SKILL.md iteration. Without 67, the library is a bundle catalog and isn't ergonomic for one-off skill authoring; you skip it. With 67, the library becomes useful as a true "register-and-iterate" surface.

## Appendix — Updated decision tree for future meta-skills

```
Authoring a new drwn meta-skill?
        |
        v
 Is the body stable on first draft, or do you expect iteration?
        |
   +----+----+
  stable    iterate
   |          |
   v          v
 Drop into  Either:
 darwinian- (a) Workaround → library (Option A)
 harness-   (b) Wait for analysis 67
 skills/    Iterate, then graduate to Option C
 skills/    
 (Option C) 
        |
        v
 Sync + version bump + publish.
 First-class member of @darwinian/harness-skills.
```

Every drwn meta-skill's final home is `@darwinian/harness-skills`. Option A exists as an iteration aid only.
