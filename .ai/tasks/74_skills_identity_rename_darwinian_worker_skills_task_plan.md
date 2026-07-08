# ABOUTME: Execution-ready plan for the deferred R-6 skills half — the full identity rename of the skills submodule from `darwinian-minds-skills` to `darwinian-worker-skills` across both the skills repo (bundle/package/plugin/marketplace identity + the self-blocking check-identity gate + release) and the parent `darwinian-worker` repo (submodule path git-mv, `.gitmodules`, docs, docusaurus route).
# ABOUTME: Grep-driven and idempotent by design — task-72 is actively reshaping the skills card tree, so the plan re-inventories at execution time rather than pinning stale line numbers. Gated on two prerequisites (GitHub repo rename + task-72 landing). Coordinated with `.ai/tasks/71_package_rename_darwinian.md` (R-6).

# Task 74: Skills Identity Rename — `darwinian-minds-skills` → `darwinian-worker-skills`

**Date**: 2026-07-08
**Author**: Claude + Remy
**Status**: Ready to run — **gated** on the two prerequisites in §Gates. Do not start until both are true.
**Parent**: `.ai/tasks/71_package_rename_darwinian.md` (this is the deferred "R-6 skills-identity" half; the R-6 main-repo URL rename already merged as PR #37).
**Decision**: skills id = **`darwinian-worker-skills`** (matches the renamed repo/product). The **plugin name `darwinian` stays** (it is the plugin, not the marketplace). The skills bundle is **not on npm** (verified 404), so there is **no npm publish/deprecate** — only a normal skills-repo release + GitHub-redirect-covered plugin marketplaces.

---

## Why this was deferred (both gates are live, not hypothetical)

1. **The skills repo is not renamed on GitHub.** `remyjkim/darwinian-worker-skills` does not exist yet; `remyjkim/darwinian-minds-skills` still does. Rewriting `.gitmodules`/URLs to a non-existent repo breaks `git submodule update` (no redirect *from* a name never created).
2. **task-72 (mind-card) is actively restructuring the skills tree** — as of writing, the submodule working tree has uncommitted edits to the exact identity files this task rewrites (`bundle.json`, `.claude-plugin/*`, `.codex-plugin/*`, `README.md`, `CLAUDE.md`, `VERSION`, `package.json`) plus card add/deletes (`cards/harness-skills/*` being removed). Running the identity rename on top of that collides head-on.

## Gates — ALL must be true before starting

- [ ] **G1**: `remyjkim/darwinian-minds-skills` renamed to `remyjkim/darwinian-worker-skills` on GitHub (your UI action). Verify: `gh repo view remyjkim/darwinian-worker-skills --json nameWithOwner`.
- [ ] **G2**: the task-72 skills restructure is **committed/landed** (submodule working tree clean, or at least the identity files quiescent). Verify: `git -C <skills> status --short` shows none of `bundle.json`, `package.json`, `.claude-plugin/*`, `.codex-plugin/*`, `check-identity.mjs`, `README.md`, `VERSION`.

If either gate is open, stop — GitHub redirects keep the old name resolving, so there is no urgency.

## The one string transform + one branding decision

- **Mechanical id rename (unambiguous):** `darwinian-minds-skills` → `darwinian-worker-skills` everywhere it is the repo/package/bundle/marketplace **id** or a `remyjkim/…` repo path.
- **Stays put:** the plugin `name: "darwinian"` (in `.claude-plugin/plugin.json` and the `marketplace.json` plugin entry). `/plugin install darwinian@darwinian-minds-skills` becomes `darwinian@darwinian-worker-skills` — the `darwinian@` (plugin) half is unchanged; only the marketplace id after `@` changes.
- **DECISION — brand display strings.** The prose `displayName: "Darwinian Minds Skills"` and the several `description` fields ("… operating **Darwinian Minds** through the drwn CLI", "**Darwinian Minds** agent skills marketplace.") are branding, not ids. Confirm with Remy at execution: rewrite to **"Darwinian Worker(s)"** to match, or leave as legacy brand copy. Default assumption: rewrite to align. (Mirror of the logo-alt decision in R-7.)

## The three landmines

1. **`scripts/check-identity.mjs` self-blocks the rename** (mirror of R-1's release gate). Three assertions hardcode `darwinian-minds-skills` (`pkg.name === …`, `homepage.includes(…)`, `repository.includes(…)`). They **must** change in the same commit as the identity files, or the skills repo's own CI (`ci.yml`) red-lights the rename.
2. **The docusaurus guide file rename is a URL/route change.** `docs-docusaurus/docs/guides/use-darwinian-minds-skills.md` → `use-darwinian-worker-skills.md`. Renaming the file changes its published route; grep for sidebar/`_category_`/internal-link references to the old slug and any redirect config, and update them too.
3. **Submodule path vs. GitHub name vs. bundle id are three separate things.** The GitHub rename (G1) is redirect-covered on its own; the *local submodule path* (`darwinian-minds-skills/` → `darwinian-worker-skills/`) is a `git mv` in the parent repo; the *bundle id* is inside the skills repo. All three are done here, but they are independent edits — don't conflate.

---

## Execution

Run inventories fresh at execution (the tree will differ post-task-72):

```
# In the skills repo:
grep -rn "darwinian-minds-skills" . | grep -vE "/\.git/|node_modules|/\.ai/"
# In the parent repo (main-repo refs only; exclude the submodule tree + .ai history):
grep -rn "darwinian-minds-skills" . | grep -vE "/\.git/|node_modules|/\.ai/|^\./darwinian-minds-skills/"
```

### T-A — Skills repo identity rename (its own branch → PR → release)

Operate inside the skills checkout. WIP branch off its `main`.

1. **Id fields** (`darwinian-minds-skills` → `darwinian-worker-skills`):
   - `package.json` `name` + `repository.url`; `package-lock.json` `name` (both occurrences).
   - `bundle.json` `bundleName` (+ `displayName`/`description` per the branding decision).
   - `.claude-plugin/marketplace.json` `name` + `homepage` + `repository` (+ any `darwinian-minds` keyword; + `description` per branding).
   - `.claude-plugin/plugin.json` `homepage` + `repository` (+ `darwinian-minds` keyword; **keep `name: "darwinian"`**; `description` per branding).
   - `.codex-plugin/plugin.json` `homepage` + `repository` + `websiteURL`.
2. **Self-block gate (same commit):** `scripts/check-identity.mjs` — the 3 assertions → `darwinian-worker-skills`.
3. **Docs/refs inside the repo:** `README.md` (clone URLs, `path/to/darwinian-minds-skills`, `/plugin marketplace add remyjkim/…`, `/plugin install darwinian@…`, `codex plugin marketplace add remyjkim/…`, `npx skills add remyjkim/…`, `drwn skills packages show …`), `MAINTAINERS.md`, `CLAUDE.md` (title + local-path note), `cards/README.md`, and any surviving `cards/**/SKILL.md` `darwinian-minds-skills/…` path mentions (task-72 will have pruned some).
4. **Cosmetic:** `scripts/smoke-cli.mjs` temp-dir prefix.
5. **Release:** bump `VERSION` (0.4.0 → next), commit, PR, merge. Then run the repo's tag/publish flow (`create-tag.yml` / `publish-release.yml`) — **no npm publish involved**; this is the skills-bundle/plugin release.
6. **Exit:** `node scripts/check-identity.mjs` green; `ci.yml` green; the Claude/Codex plugin marketplaces resolve via the renamed GitHub repo (redirect covers the interim).

### T-B — Parent repo submodule rewire (`darwinian-worker` repo, own branch → PR)

Use a clean worktree off `origin/main` (the main checkout carries unrelated uncommitted card-model work — do not share its tree; `package.json`-style contamination risk).

1. **Submodule path rename:**
   ```
   git mv darwinian-minds-skills darwinian-worker-skills
   git config -f .gitmodules submodule.darwinian-minds-skills.path darwinian-worker-skills
   git config -f .gitmodules --rename-section submodule.darwinian-minds-skills submodule.darwinian-worker-skills
   git config -f .gitmodules submodule.darwinian-worker-skills.url https://github.com/remyjkim/darwinian-worker-skills.git
   # sync + reinit so .git/modules and the gitlink agree:
   git submodule sync && git submodule update --init darwinian-worker-skills
   ```
2. **Doc references** (main-repo only, from the fresh inventory): `INSTALL.md`, `CONTRIBUTING.md`, `docs/maintainers/skills-repo-submodule.md` (path + name + the `git rm`/`deinit` examples), `docs/maintainers/docs-cicd.md`, and `docs-docusaurus/docs/guides/use-darwinian-minds-skills.md` — including the **file rename** to `use-darwinian-worker-skills.md` and its route/sidebar refs (landmine 2). Skills-repo URLs (`github:remyjkim/darwinian-minds-skills`, clone URLs) → `darwinian-worker-skills`.
3. **Exit:** `git submodule status` resolves `darwinian-worker-skills`; docusaurus builds; no forward-facing `darwinian-minds-skills` remains (`.ai/` historical trail intentionally left). Merge PR.

### T-C — Advance the submodule pointer

After T-A merges and the skills repo is at its new HEAD, bump the parent gitlink to that commit (same T-B PR if timed together, else a follow-up `[chore:submodule]` commit).

## Ordering

G1 + G2 satisfied → **T-A** (skills repo identity + release) → **T-B** (parent submodule rewire; needs the renamed GitHub repo to exist for `.gitmodules`) → **T-C** (pointer bump to the post-rename skills HEAD). T-A before T-B: the parent's `.gitmodules`/pointer must reference a repo+commit that already exist.

## Verification (whole task)

- `gh repo view remyjkim/darwinian-worker-skills` resolves; old name redirects.
- Skills repo: `node scripts/check-identity.mjs` green; `ci.yml` green; `bundle.json`/`package.json`/marketplace ids all `darwinian-worker-skills`; plugin name still `darwinian`.
- Parent repo: `git submodule status` clean on `darwinian-worker-skills/`; docusaurus builds; `grep -rn darwinian-minds-skills` (forward-facing) empty.
- End-to-end: `drwn library add skill github:remyjkim/darwinian-worker-skills` + `drwn skills packages show darwinian-worker-skills` succeed.
