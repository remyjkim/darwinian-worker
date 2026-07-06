# ABOUTME: Implementation plan for the @darwinian/operator card migration — skill renames, alias deletion, cards/operator, store and project migration.
# ABOUTME: Executes the approved design in .ai/analyses/89_darwinian-operator-card-migration-design.md as bite-sized, verifiable tasks.

# @darwinian/operator Card Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship darwinian-minds-skills v0.4.0 with the `@darwinian/operator@1.0.0` card and mind-vocabulary skill names, then migrate the local store, the darwinian-cards project, and machine defaults off every "harness"-named artifact.

**Architecture:** All card composition flows from `scripts/card-map.mjs`; renames happen once in the canonical `skills/` tree and `sync:cards` regenerates the card-bundled copies. The repo's validator suite (`validate:skills`, `validate:cards`, `sync:cards --check`, `check:identity`, `check:paths`, `lint:md`, `smoke:cli`) is the test harness: make it fail first where possible, then make it pass. Machine migration uses only drwn CLI surfaces except one approved manual package deletion.

**Tech Stack:** drwn 0.6.0, Node scripts (npm run), git, markdownlint-cli2.

**Repos touched:**
- `/Users/pureicis/dev/darwinian-minds/darwinian-minds-skills` (submodule; remote `remyjkim/darwinian-minds-skills`) — all release work
- `/Users/pureicis/dev/darwinian-minds` (parent) — submodule pointer bump only
- `/Users/pureicis/dev/darwinian-cards` — card swap
- `~/.agents/drwn` — store/library/defaults
- `/Users/pureicis/dev/darwinian-harness-skills` — rescue and delete

**Skill rename map (used throughout):**

| Old | New |
|---|---|
| `inspect-harness` | `inspect-minds` |
| `materialize-harness` | `materialize-minds` |
| `repair-harness` | `repair-minds` |
| `recommend-harness` | `recommend-minds` |
| `support-harness` | `support-minds` |
| `manage-harness-library` | `manage-library` |
| `install-harness-project` | `install-project` |

**The 17 primary skills after rename:** bootstrap-project, apply-mind-card, author-mind-card, install-project, inspect-minds, materialize-minds, manage-library, repair-minds, manage-defaults, recommend-minds, share-mind-card, support-minds, sync-card-skills, import-mcp-from-claude, manage-active-mind-stack, author-mind-content, audit-mind-visibility.

**Sweep exclusions (never touch):** the `harness.minVersion` field in any `card.json` (drwn CLI schema, out of scope); historical docs under the submodule's `.ai/` (they describe past state); `node_modules/`.

**Commit style:** conventional prefixes matching the repo log (`feat:`, `refactor:`, `docs:`, `chore:`). Per darwinian-minds git rules, no AI/LLM mentions in commit messages, no pushes except where a step says push.

---

### Task 1: Release branch

**Files:** none (git only)

**Step 1: Confirm clean state**

Run: `git -C /Users/pureicis/dev/darwinian-minds/darwinian-minds-skills status -sb`
Expected: `## main...origin/main`, no modified files. If dirty, STOP and ask Remy.

**Step 2: Create branch**

```bash
git -C /Users/pureicis/dev/darwinian-minds/darwinian-minds-skills checkout -b refactor/operator-card-migration
```

---

### Task 2: Port sync-card-skills improvements from the stale checkout

The stale checkout `~/dev/darwinian-harness-skills` holds uncommitted SKILL.md
edits (push-after-publish reminder, "Complete update workflow" section,
`share-mind-card` related-skill link) that only exist there.

**Files:**
- Modify: `darwinian-minds-skills/skills/sync-card-skills/SKILL.md`

**Step 1: Export and apply the patch**

```bash
git -C /Users/pureicis/dev/darwinian-harness-skills diff -- skills/sync-card-skills/SKILL.md > /tmp/sync-card-skills.patch
git -C /Users/pureicis/dev/darwinian-minds/darwinian-minds-skills apply --3way /tmp/sync-card-skills.patch
```

Expected: clean apply (histories diverged after a scrub, so `--3way` may fall
back to conflict markers — resolve by taking the added sections verbatim).
The patch adds a step 9 (push reminder), a "Complete update workflow" section,
and `share-mind-card` under Related Skills. Note the patch's Related Skills
context still says `materialize-harness` — fine, Task 4 renames it.

**Step 2: Lint**

Run: `cd /Users/pureicis/dev/darwinian-minds/darwinian-minds-skills && npm run lint:md`
Expected: exit 0. Fix any line-length/heading complaints in the added text.

**Step 3: Commit**

```bash
git add skills/sync-card-skills/SKILL.md
git commit -m "docs: document the full card update loop in sync-card-skills"
```

---

### Task 3: Port import-mcp-from-claude improvements from the standalone package

The library package `~/.agents/drwn/skills/@remyjkim/drwn-import-mcp-from-claude/1.0.0/import-mcp-from-claude/`
has newer procedural content than the canonical skill (81 diff lines).

**Files:**
- Modify: `darwinian-minds-skills/skills/import-mcp-from-claude/SKILL.md`

**Step 1: Review the full diff**

```bash
diff ~/.agents/drwn/skills/@remyjkim/drwn-import-mcp-from-claude/1.0.0/import-mcp-from-claude/SKILL.md \
  /Users/pureicis/dev/darwinian-minds/darwinian-minds-skills/skills/import-mcp-from-claude/SKILL.md
```

**Step 2: Merge with these rules**

- TAKE from the package: the `claude mcp list`/`claude mcp get` no-`--json`
  workarounds, reading authoritative config (`<project>/.mcp.json`,
  `~/.claude.json`) with a structured JSON parser, the OAuth-token-store
  prohibition, the stdio-spawn trust caveat, and "scope-safe Claude cleanup"
  description wording.
- KEEP from canonical: the `@darwinian/notion` card reference (the package
  still says `@remyjkim/notion-agent` — canonical is newer there) and any
  other cross-references to current card names.

**Step 3: Lint**

Run: `npm run lint:md` — expected exit 0.

**Step 4: Commit**

```bash
git add skills/import-mcp-from-claude/SKILL.md
git commit -m "docs: fold drwn-import-mcp-from-claude 1.0.0 fixes into canonical skill"
```

---

### Task 4: Rename the seven harness skills

**Files:**
- Modify: `scripts/card-map.mjs`
- Rename: the seven `skills/<old-name>/` directories per the rename map
- Modify: every SKILL.md that names an old skill (grep-driven)

**Step 1: Update card-map.mjs first (failing test)**

In `PRIMARY_STABLE_SKILLS`, replace the seven old names with the new names
(keep list order: bootstrap-project, apply-mind-card, author-mind-card,
install-project, inspect-minds, materialize-minds, manage-library,
repair-minds, manage-defaults, recommend-minds, share-mind-card,
support-minds, sync-card-skills, import-mcp-from-claude,
manage-active-mind-stack, author-mind-content, audit-mind-visibility).

**Step 2: Run validators to verify failure**

Run: `npm run validate:skills && npm run sync:cards -- --check`
Expected: FAIL — the map names skills whose directories don't exist yet.

**Step 3: Rename the directories**

```bash
for pair in "inspect-harness inspect-minds" "materialize-harness materialize-minds" \
  "repair-harness repair-minds" "recommend-harness recommend-minds" \
  "support-harness support-minds" "manage-harness-library manage-library" \
  "install-harness-project install-project"; do
  set -- $pair; git mv "skills/$1" "skills/$2"; done
```

**Step 4: Update skill content**

For each renamed skill's SKILL.md: frontmatter `name:`, the `# <title>`
heading, and self-references. Rewrite body prose from harness vocabulary to
Darwinian Minds vocabulary (e.g. "inspecting Darwinian Minds state" already
reads correctly; drop remaining "the harness" phrasings). Do NOT change drwn
command invocations — the CLI has no harness-named commands.

Then sweep cross-references in all other skills:

```bash
grep -rn "inspect-harness\|materialize-harness\|repair-harness\|recommend-harness\|support-harness\|manage-harness-library\|install-harness-project" skills/ README.md CLAUDE.md bundle.json
```

Replace every hit with the new name. Expected after: zero matches.

**Step 5: Regenerate cards and validate**

Run: `npm run sync:cards && npm run validate:skills && npm run lint:md`
Expected: PASS. (`validate:cards` may still complain — card manifests are
Task 6's job; note failures, don't fix here.)

**Step 6: Commit**

```bash
git add -u && git add skills/
git commit -m "refactor: rename harness skills to mind vocabulary"
```

---

### Task 5: Delete the compatibility alias skills

**Files:**
- Delete: `skills/apply-harness-card/`, `skills/author-harness-card/`, `skills/share-harness-card/`
- Modify: `scripts/card-map.mjs` (drop `COMPATIBILITY_ALIAS_SKILLS`)

**Step 1: Remove**

```bash
git rm -r skills/apply-harness-card skills/author-harness-card skills/share-harness-card
```

**Step 2: Update card-map.mjs**

Delete the `COMPATIBILITY_ALIAS_SKILLS` export. Its only consumer is the
`harness-skills` cardMap entry, which Task 6 deletes — if other scripts import
it, update them now (grep: `grep -rn COMPATIBILITY_ALIAS_SKILLS scripts/`).

**Step 3: Sweep references**

Run: `grep -rn "apply-harness-card\|author-harness-card\|share-harness-card" skills/ scripts/ README.md CLAUDE.md bundle.json`
Remove remaining mentions (README rows, "prefer X" redirect lines in
apply/author/share-mind-card SKILL.md descriptions). Expected after: zero
matches outside `cards/` (Task 6 regenerates those).

**Step 4: Commit**

```bash
git add -u
git commit -m "refactor: remove one-release harness-card alias skills"
```

---

### Task 6: Replace the old cards with cards/operator

**Files:**
- Create: `cards/operator/card.json`, `cards/operator/package.json`
- Delete: `cards/harness-skills/`, `cards/mind-skills/`
- Modify: `scripts/card-map.mjs`

**Step 1: Write the card manifests**

`cards/operator/card.json`:

```json
{
  "name": "@darwinian/operator",
  "version": "1.0.0",
  "description": "Primary Darwinian Minds card: the skills an agent needs to operate minds through drwn — bootstrap, cards, library, defaults, inspection, repair, and support.",
  "skills": {
    "include": [
      "bootstrap-project",
      "apply-mind-card",
      "author-mind-card",
      "install-project",
      "inspect-minds",
      "materialize-minds",
      "manage-library",
      "repair-minds",
      "manage-defaults",
      "recommend-minds",
      "share-mind-card",
      "support-minds",
      "sync-card-skills",
      "import-mcp-from-claude",
      "manage-active-mind-stack",
      "author-mind-content",
      "audit-mind-visibility"
    ]
  },
  "servers": {}
}
```

`cards/operator/package.json`:

```json
{
  "name": "@darwinian/operator",
  "version": "1.0.0",
  "private": true,
  "description": "Primary Darwinian Minds card: the skills an agent needs to operate minds through drwn."
}
```

**Step 2: Update card-map.mjs and delete old card dirs**

Replace the `mind-skills` and `harness-skills` cardMaps entries with one:

```js
  {
    name: "@darwinian/operator",
    slug: "operator",
    cardDir: join(rootDir, "cards", "operator"),
    targetDir: join(rootDir, "cards", "operator", "skills"),
    skills: PRIMARY_STABLE_SKILLS,
  },
```

```bash
git rm -r cards/harness-skills cards/mind-skills
```

**Step 3: Regenerate and validate**

Run: `npm run sync:cards && npm run validate:cards && npm run validate:skills`
Expected: PASS; `cards/operator/skills/` now holds the 17 synced skill copies.

**Step 4: Commit**

```bash
git add cards/operator scripts/card-map.mjs && git add -u
git commit -m "feat: ship @darwinian/operator as the primary card"
```

---

### Task 7: Version bump, docs, and full-sweep validation (v0.4.0)

**Files:**
- Modify: `VERSION`, `package.json`, `bundle.json`, `.claude-plugin/*.json`, `.codex-plugin/plugin.json`, `README.md`, `CLAUDE.md`

**Step 1: Bump versions**

`VERSION` → `0.4.0`; `package.json` `.version` → `0.4.0`; `bundle.json`
`.version` → `0.4.0` and its `skills` array updated to the renamed names
(remove alias entries); `.claude-plugin` marketplace + plugin versions →
`0.4.0`; `.codex-plugin/plugin.json` version → `0.4.0`.

**Step 2: Rewrite docs**

README: skill table rows for the seven renames, delete alias rows, replace
the Reusable Mind Cards section (operator replaces mind-skills +
harness-skills; base-mind and workspace-experimental stay), update the
`file:` example path to `cards/operator`, update the skill count (21 → 18
top-level: 17 primary + organize-workspace). CLAUDE.md: same vocabulary pass.

**Step 3: Final harness sweep**

Run: `grep -rni harness . --include="*.md" --include="*.json" --include="*.mjs" -l | grep -v node_modules | grep -v "^\./\.ai/"`
Expected: only files where the remaining mentions are the `harness.minVersion`
schema field or deliberate historical references. Fix everything else.

**Step 4: Full validator suite**

Run: `npm run validate:cards && npm run validate:skills && npm run sync:cards -- --check && npm run check:identity && npm run check:paths && npm run lint:md && npm run smoke:cli`
Expected: all exit 0. Test output must be pristine.

**Step 5: Commit**

```bash
git add -u && git add .
git commit -m "chore: release 0.4.0 with operator card and mind vocabulary"
```

---

### Task 8: Merge, tag, push, bump submodule — CHECKPOINT, get Remy's go-ahead

**Step 1: Push branch and open PR**

```bash
git push -u origin refactor/operator-card-migration
gh pr create --repo remyjkim/darwinian-minds-skills --title "Operator card migration (v0.4.0)" --body "Renames harness skills to mind vocabulary, removes one-release aliases, ships @darwinian/operator@1.0.0. Design: darwinian-minds .ai/analyses/89."
```

**Step 2: After merge, tag**

```bash
git checkout main && git pull
git tag v0.4.0 && git push origin v0.4.0
```

**Step 3: Bump the parent submodule pointer**

```bash
cd /Users/pureicis/dev/darwinian-minds
git add darwinian-minds-skills
git commit -m "chore(submodule): darwinian-minds-skills 0.4.0 operator card"
```

(Explicitly authorized by this plan; do not push the parent unless Remy says so.)

---

### Task 9: Store migration

**Step 1: Stage the new card source and publish**

```bash
cp -R /Users/pureicis/dev/darwinian-minds/darwinian-minds-skills/cards/operator ~/.agents/drwn/sources/@darwinian/operator
drwn card source doctor @darwinian/operator --json   # expect ok: true
drwn card publish @darwinian/operator                 # expect Published @darwinian/operator@1.0.0
drwn card list | grep darwinian                       # expect operator 1.0.0 listed
```

**Step 2: Deprecate the old card**

```bash
drwn card deprecate @darwinian/harness-skills@0.2.0 --message "Renamed to @darwinian/operator"
```

(If the ref format is rejected, check `drwn card deprecate --help` for the
exact `<ref>` shape; do not guess twice.)

**Step 3: Swap cards in darwinian-cards**

```bash
cd /Users/pureicis/dev/darwinian-cards
drwn card remove @darwinian/harness-skills
drwn card add "@darwinian/operator@^1.0.0" --write
```

Expected: card.lock lists operator + fal; generated minds layer symlinks the
17 skills under `@darwinian/operator`; no harness-skills remnants
(`ls .agents/drwn/generated/minds/@darwinian/`).

**Step 4: Remove the superseded source copy**

```bash
rm -rf ~/.agents/drwn/sources/@darwinian/harness-skills
```

(The published, now-deprecated 0.2.0 stays in the store for provenance.)

---

### Task 10: Library bundle and machine defaults

**Step 1: Delete the standalone package (approved in design — no CLI removal exists)**

```bash
rm -rf ~/.agents/drwn/skills/@remyjkim/drwn-import-mcp-from-claude
drwn skills packages list --json   # expect the package gone, no errors
```

If `drwn library list` still shows a dangling `import-mcp-from-claude` entry
afterwards, STOP — surface the registry file involved rather than editing more
store internals.

**Step 2: Add the bundle**

```bash
drwn library add skill /Users/pureicis/dev/darwinian-minds/darwinian-minds-skills --json
drwn skills packages show darwinian-minds-skills --json
```

Expected: bundle 0.4.0 with 18 skills, no collision.

**Step 3: Machine-wide defaults for the 17 primary skills**

```bash
for s in bootstrap-project apply-mind-card author-mind-card install-project \
  inspect-minds materialize-minds manage-library repair-minds manage-defaults \
  recommend-minds share-mind-card support-minds sync-card-skills \
  import-mcp-from-claude manage-active-mind-stack author-mind-content \
  audit-mind-visibility; do drwn library defaults add skill "$s" --json; done
drwn library defaults list --json
```

Expected: all 17 listed as defaults.

---

### Task 11: Remove the stale checkout

**Step 1: Verify nothing else is unrescued**

```bash
git -C /Users/pureicis/dev/darwinian-harness-skills status --porcelain
git -C /Users/pureicis/dev/darwinian-harness-skills stash list
git -C /Users/pureicis/dev/darwinian-harness-skills log --oneline origin/main..HEAD
```

Expected: only the already-ported sync-card-skills edit, empty stash, no
unpushed commits. Anything else: STOP and show Remy.

**Step 2: Delete — CHECKPOINT, confirm with Remy first**

```bash
rm -rf /Users/pureicis/dev/darwinian-harness-skills
```

---

### Task 12: End-to-end verification

- `drwn card list` shows `@darwinian/operator 1.0.0`; harness-skills shows as
  deprecated (or is absent from default listing).
- In `/Users/pureicis/dev/darwinian-cards`: a fresh Claude Code session lists
  the 17 renamed skills (spot-check `inspect-minds`, `materialize-minds`).
- `grep -ri harness ~/.agents/drwn/sources/@darwinian/operator` → no hits.
- `drwn library defaults list` shows the 17 defaults.
- Report results to Remy with any deviations, per
  superpowers:verification-before-completion.
