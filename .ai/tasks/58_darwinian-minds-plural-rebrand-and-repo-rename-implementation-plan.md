# Darwinian Minds — Plural Rebrand & Repo Rename Implementation Plan

- **Task:** 58
- **Status:** Draft / Ready for review
- **Date:** 2026-06-28
- **Owner:** Remy
- **Type:** Rebrand + repository rename (in-tree PR + external operator cutover)
- **Predecessors:** Task 10 (`beginning-agents`→`beginning-harness`), Task 28 (`beginning-harness`→`darwinian-harness`), Task 52 (`darwinian-harness`→`darwinian-mind`), Analysis 77 (skills-repo plural naming)

---

## 1. Context & Motivation

The canonical name of the tooling is now **"Darwinian Minds" (`darwinian-minds`, plural)**. The ecosystem is currently split between singular and plural forms:

| Already plural | Still singular |
| --- | --- |
| `dminds` CLI alias | npm package name `darwinian-mind` |
| `darwinian-minds-skills` (skills GitHub repo) | repo URL references `remyjkim/darwinian-mind` |
| `darwinianminds.com` (Astro landing site) | `darwinian-mind/hook-policy` subpath export |
| | `projectName: darwinian-mind` (Docusaurus) |

On top of that, the **GitHub repo was never actually renamed** — `origin` is still `remyjkim/darwinian-harness` (PRIVATE), two names behind the package metadata. Task 52 updated metadata to point at a `remyjkim/darwinian-mind` repo that **does not exist**. So the repo URL references are currently broken/aspirational.

Two facts make now the ideal moment:

1. **The package was never published to npm** (`npm view darwinian-mind` / `darwinian-minds` → not found). No deprecation window, no consumer breakage.
2. **GitHub repo renames auto-redirect.** The skills repo already went `darwinian-harness-skills` → `darwinian-minds-skills` and the old `.gitmodules` URL still resolves. Old clone URLs will keep working after rename.

### Decisions taken (this plan is built on these)

| Decision | Choice |
| --- | --- |
| npm package name | **Rename to `darwinian-minds`** (full alignment; unpublished → no deprecation cost) |
| Scope | **Full plural alignment** — repo + local dir + submodule + docs project names + code import paths + every `darwinian-mind`-singular token under our control; catalog prefix & domains reconciled as coordinated external decisions (§9) |
| Execution model | **Two-phase: in-tree PR → external cutover.** The PR rewrites all references to the post-rename names and merges while the repo is still `darwinian-harness` (relying on GitHub redirect); the operator then renames the GitHub repo, retargets the remote, and renames the local dir |

---

## 2. Goal State

### Target naming table

| Concern | Before | After |
| --- | --- | --- |
| GitHub repo | `remyjkim/darwinian-harness` | `remyjkim/darwinian-minds` |
| Local checkout dir | `~/dev/darwinian-harness` | `~/dev/darwinian-minds` |
| Git remote `origin` | `…/darwinian-harness.git` | `…/darwinian-minds.git` |
| npm package name | `darwinian-mind` | `darwinian-minds` |
| Package subpath export | `darwinian-mind/hook-policy` | `darwinian-minds/hook-policy` |
| Repo URL metadata (homepage/bugs/repository) | `…/darwinian-mind` | `…/darwinian-minds` |
| Docusaurus `projectName` | `darwinian-mind` | `darwinian-minds` |
| Docs site package names | `darwinian-mind-docs` | `darwinian-minds-docs` |
| Embedded submodule dir | `darwinian-harness-skills/` | `darwinian-minds-skills/` |
| `.gitmodules` URL | `…/darwinian-harness-skills.git` | `…/darwinian-minds-skills.git` |
| Skills-repo references in docs | `darwinian-mind-skills` | `darwinian-minds-skills` |

### Explicitly unchanged (keep)

- CLI command **`drwn`** and store path **`~/.agents/drwn/`** — keyed to the binary, not the brand.
- CLI alias **`dminds`** — already plural.
- Env vars **`AGENTS_REPO_ROOT`**, **`AGENTS_DIR`**, **`AGENTS_HOME_DIR`**.
- Card scope **`@darwinian/`**.
- Card terminology **`mind-card`**.

### Coordinated-external decisions (see §9 — recommended position pending final nod)

- Community catalog repo `curation-labs/dm-cards-catalog-v1` and the `dm-`/`dm-card-base` prefixes.
- Docs domain `docs.darwiniantools.com` vs landing `darwinianminds.com`.
- Analyzer service `darwinian-harness-services.pages.dev`.

---

## 3. Success Criteria

1. `git remote get-url origin` → `https://github.com/remyjkim/darwinian-minds.git`; local dir is `darwinian-minds`.
2. `grep -rIn "darwinian-mind\b" --exclude-dir={node_modules,.git,dist}` returns **only** intentional historical references inside `.ai/` (completion docs of prior tasks) — zero in shipping code, docs, configs, or tests. (Note `\b` so `darwinian-minds` does not match.)
3. `package.json` name is `darwinian-minds`; `homepage`/`bugs`/`repository` point at `remyjkim/darwinian-minds`.
4. `darwinian-minds/hook-policy` resolves; all hook-bundle and card-source tests green; generated hook bundles import the plural subpath.
5. `bun run test` (full suite), typecheck, and `scripts/verify-release-readiness.ts` pass.
6. `.gitmodules` and the embedded submodule resolve to `darwinian-minds-skills` and the working tree populates with `git submodule update --init --recursive`.
7. Docusaurus builds; `editUrl`/footer/issue links resolve to the renamed repo; `lychee` link check passes.
8. A fresh `git clone https://github.com/remyjkim/darwinian-minds.git --recurse-submodules` followed by `bun install && bun run drwn -- status` works end-to-end.

---

## 4. Strategy — alternatives considered

### Option A (chosen): Two-phase — in-tree PR rewrites to post-rename names, then operator cutover

Mirrors the proven Task 28 / Task 52 playbook. The PR is reviewable while the repo keeps its current name; all metadata already targets `darwinian-minds`. After merge, the operator performs the GitHub rename + remote retarget + local `mv` in minutes, and GitHub's redirect covers any URL touched before propagation.

- **Pros:** reviewable diff, no broken intermediate state for collaborators, redirect safety net, matches a playbook that worked three times.
- **Cons:** brief window where in-tree URLs point at a repo name that doesn't exist yet (mitigated entirely by GitHub redirect once the rename happens; before that, the URLs are no more broken than today's already-aspirational `darwinian-mind` URLs).

### Option B (rejected): Cutover-first

Rename the GitHub repo + remote + local dir first, then update references against the live new name.

- **Pros:** references never point at a not-yet-existing repo.
- **Cons:** forces the rename before review; CI/tests on the rename commit transiently assert the old name; loses the clean "spec-as-tests" flip the prior playbook relied on. Rejected.

### Package-name sub-strategy

Because the subpath export `darwinian-mind/hook-policy` is a **published API contract** for card-authored hook bundles, the rename is a hard cut to `darwinian-minds/hook-policy`. This is safe **only because nothing is published yet and no card in any catalog references the old subpath**. The plan verifies this assumption (§8 Phase 0) before proceeding; if any external card references the old subpath, we revisit with a back-compat re-export.

---

## 5. Blast-radius inventory (categorized)

Derived from a full-repo sweep. Counts are approximate; exact edits live in §8.

| Class | Representative files | Action |
| --- | --- | --- |
| **Package metadata** | `package.json` (`name`:2, `homepage`:20, `bugs.url`:22, `repository.url`:26), `exports` map subpath | Rewrite |
| **Code: subpath export** | `cli/core/card-source.ts:452` (`external`), `:778`; `cli/core/hook-generator/emit-mastra-composer.ts:31`; `cli/core/hook-generator/bundle-composer.ts:51`; `cli/core/hook-policy/index.ts:2` (ABOUTME) | Rewrite import string `darwinian-mind/hook-policy` → `darwinian-minds/hook-policy` |
| **Code: name gate** | `scripts/verify-release-readiness.ts:152-153` | `darwinian-mind` → `darwinian-minds` |
| **Tests** | `test/package-readiness.test.ts:41-43`; `test/core-hook-bundle-composer.test.ts`; `test/cli-hook-write-e2e.test.ts`; `test/core-hook-emit-mastra.test.ts`; `test/core-hook-policy-export.test.ts` | Flip expectations first (spec-as-tests) |
| **Repo URLs in docs** | `README.md:22`, `CONTRIBUTING.md:5,8`, `INSTALL.md`, `docs/maintainers/skills-repo-submodule.md`, `docs-docusaurus/README.md:1` | Rewrite clone/issue URLs |
| **Docusaurus config** | `docs-docusaurus/docusaurus.config.ts:17` (projectName), `:43` (editUrl), `:73,96,100` (links) | Rewrite |
| **Docs site package names** | `docs-docusaurus/package.json:2`, `docs-astro/package.json:2`, `docs-astro/wrangler.toml:1,6` | `darwinian-mind-docs` → `darwinian-minds-docs` |
| **Skills-repo doc references** | `docs-docusaurus/docs/guides/use-darwinian-mind-skills.md` (+ filename), `INSTALL.md` | `darwinian-mind-skills` → `darwinian-minds-skills` |
| **Link checker** | `lychee.toml:25` (exclusion regex) | Rewrite |
| **Submodule** | `.gitmodules` (path + url), embedded dir `darwinian-harness-skills/` | Cutover (Phase 3) |
| **Historical `.ai/` docs** | prior task/analysis completion docs | **Leave as-is** (evergreen historical record) |

> **Note on `darwinian-mind` (singular) total ≈ 247 occurrences:** the large majority are auto-generated lockfiles and historical `.ai/` docs. Shipping-surface edits are ~20–25 files.

---

## 6. Pre-flight verification (must pass before any edits)

```bash
# Confirm the target name is free and the package is unpublished
gh repo view remyjkim/darwinian-minds  >/dev/null 2>&1 && echo "TAKEN" || echo "FREE"
npm view darwinian-minds version       2>/dev/null || echo "unpublished (good)"

# Confirm no EXTERNAL card references the soon-to-rename subpath
#   (search the community catalog + any local card sources)
grep -rn "darwinian-mind/hook-policy" ~/.agents/drwn/cards ~/.agents/drwn/sources 2>/dev/null || echo "no external subpath consumers"
```

---

## 7. Phase map (overview)

```
PHASE 0  Pre-flight + branch + tests-as-spec          (in-tree, no behavior yet)
PHASE 1  Package identity + subpath export            (package.json, exports)
PHASE 2  Code: hook-policy import path + name gate     (cli/, scripts/)
PHASE 3  Submodule cutover                             (.gitmodules, dir, pointer)
PHASE 4  Docs + site config + link checker             (README, docusaurus, lychee)
PHASE 5  Full verification (tests, typecheck, build, sweep grep)
── PR merges here ──
PHASE 6  EXTERNAL CUTOVER (operator)                   (GitHub rename, remote, local mv, publish)
PHASE 7  Coordinated external decisions                (catalog/domain/service — §9)
```

---

## 8. Detailed phases

### PHASE 0 — Pre-flight, branch, tests-as-spec

```bash
git checkout -b remyjkim/darwinian-minds-rebrand-task-58
```

Flip the assertions FIRST so they encode the target (RED), then implement to GREEN per phase.

`test/package-readiness.test.ts` (≈ lines 41-43):

```diff
- expect(pkg.name).toBe("darwinian-mind");
- expect(pkg.homepage).toBe("https://github.com/remyjkim/darwinian-mind");
- expect(pkg.bugs).toEqual({ url: "https://github.com/remyjkim/darwinian-mind/issues" });
- expect(pkg.repository.url).toBe("git+https://github.com/remyjkim/darwinian-mind.git");
+ expect(pkg.name).toBe("darwinian-minds");
+ expect(pkg.homepage).toBe("https://github.com/remyjkim/darwinian-minds");
+ expect(pkg.bugs).toEqual({ url: "https://github.com/remyjkim/darwinian-minds/issues" });
+ expect(pkg.repository.url).toBe("git+https://github.com/remyjkim/darwinian-minds.git");
```

Hook subpath tests (`core-hook-policy-export`, `core-hook-bundle-composer`, `cli-hook-write-e2e`, `core-hook-emit-mastra`): replace `darwinian-mind/hook-policy` → `darwinian-minds/hook-policy` in expected strings.

Run `bun run test` → expect the flipped tests RED.

### PHASE 1 — Package identity + subpath export

`package.json`:

```diff
-  "name": "darwinian-mind",
+  "name": "darwinian-minds",
...
-  "homepage": "https://github.com/remyjkim/darwinian-mind",
+  "homepage": "https://github.com/remyjkim/darwinian-minds",
-      "url": "https://github.com/remyjkim/darwinian-mind/issues"
+      "url": "https://github.com/remyjkim/darwinian-minds/issues"
-    "url": "git+https://github.com/remyjkim/darwinian-mind.git"
+    "url": "git+https://github.com/remyjkim/darwinian-minds.git"
```

The `exports` map key `./hook-policy` is unchanged; only the package name (and thus the resolvable specifier `darwinian-minds/hook-policy`) changes. Confirm the `exports` block still lists `./hook-policy`.

### PHASE 2 — Code: hook-policy import path + name gate

```bash
# Deterministic, scoped replacement of the subpath specifier in source
grep -rl "darwinian-mind/hook-policy" cli/ scripts/ | while read -r f; do
  sed -i '' 's#darwinian-mind/hook-policy#darwinian-minds/hook-policy#g' "$f"; done
```

Touches: `cli/core/card-source.ts:452,778`, `cli/core/hook-generator/emit-mastra-composer.ts:31`, `cli/core/hook-generator/bundle-composer.ts:51`, `cli/core/hook-policy/index.ts:2` (ABOUTME comment).

`scripts/verify-release-readiness.ts:152-153`:

```diff
-  if (pkg.name !== "darwinian-mind") {
-    metadataIssues.push("name must be darwinian-mind");
+  if (pkg.name !== "darwinian-minds") {
+    metadataIssues.push("name must be darwinian-minds");
```

Run the hook-policy + card-source tests → GREEN.

### PHASE 3 — Submodule cutover

The skills GitHub repo is already `remyjkim/darwinian-minds-skills` (the old URL redirects). Align the embedded submodule:

```bash
# 1. Update .gitmodules
git config -f .gitmodules submodule.darwinian-harness-skills.url \
  https://github.com/remyjkim/darwinian-minds-skills.git

# 2. Rename the submodule path  harness → minds
git mv darwinian-harness-skills darwinian-minds-skills
git config -f .gitmodules --rename-section \
  submodule.darwinian-harness-skills submodule.darwinian-minds-skills
git config -f .gitmodules submodule.darwinian-minds-skills.path darwinian-minds-skills

# 3. Sync + re-init
git submodule sync
git submodule update --init --recursive
```

Resulting `.gitmodules`:

```ini
[submodule "darwinian-minds-skills"]
	path = darwinian-minds-skills
	url = https://github.com/remyjkim/darwinian-minds-skills.git
	shallow = true
```

> **Decision point:** the embedded submodule is currently pinned to the Task-52 branch (`heads/remyjkim/rebrand-darwinian-mind-skills-task-52`, package name `darwinian-mind-skills`, singular). Advance the pointer to the sibling's current `main` (`darwinian-minds-skills` v0.3.0) as part of this phase so the in-tree submodule matches the canonical plural skills repo. Confirm the desired pinned commit with Remy.

Update any hardcoded references to the old submodule dir name (`CONTRIBUTING.md:5`, `docs/maintainers/skills-repo-submodule.md`).

### PHASE 4 — Docs, site config, link checker

Repo-URL rewrites (`darwinian-mind` → `darwinian-minds`) in: `README.md:22`, `CONTRIBUTING.md:8`, `INSTALL.md`, `docs-docusaurus/README.md:1`, `docs/maintainers/skills-repo-submodule.md:9,26,35,49`.

`docs-docusaurus/docusaurus.config.ts`:

```diff
-  projectName: 'darwinian-mind',
+  projectName: 'darwinian-minds',
-  editUrl: 'https://github.com/remyjkim/darwinian-mind/tree/main/docs-docusaurus/',
+  editUrl: 'https://github.com/remyjkim/darwinian-minds/tree/main/docs-docusaurus/',
   // footer + navbar GitHub links (≈ lines 73, 96, 100): darwinian-mind → darwinian-minds
```

Docs-site package names: `docs-docusaurus/package.json:2`, `docs-astro/package.json:2`, `docs-astro/wrangler.toml:1,6` → `darwinian-minds-docs`.

Skills-repo references → plural, including the guide file itself:

```bash
git mv docs-docusaurus/docs/guides/use-darwinian-mind-skills.md \
       docs-docusaurus/docs/guides/use-darwinian-minds-skills.md
# then rewrite darwinian-mind-skills → darwinian-minds-skills inside it (and fix any sidebar/_category refs)
```

`lychee.toml:25` exclusion regex → `darwinian-minds`.

> `docs-astro/` is **deprecated** (`docs-astro/DEPRECATED.md`). Rename its package/wrangler name for consistency but do not invest further; it is not the live docs surface.

### PHASE 5 — Full verification

```bash
bun run test
bun run typecheck   # or tsc --noEmit, per package.json scripts
bun run scripts/verify-release-readiness.ts
cd docs-docusaurus && bun run build && cd ..
npx lychee --config lychee.toml .   # link check

# Residual sweep — must be empty outside .ai/ history + lockfiles
grep -rIn "darwinian-mind\b" \
  --exclude-dir={node_modules,.git,dist} \
  --exclude=\*.lock --exclude=package-lock.json . \
  | grep -vE "^\./\.ai/"
```

Commit per phase with reviewable messages (prefix per `.ai/rules/01_git.md`, e.g. `[chore]`, `[docs]`, `[build]`). Open PR.

### PHASE 6 — EXTERNAL CUTOVER (operator, post-merge)

> Not part of the PR. Performed by Remy after merge. GitHub redirects keep old URLs working.

```bash
# 1. Rename the GitHub repo (UI or gh)
gh repo rename darwinian-minds --repo remyjkim/darwinian-harness

# 2. Retarget the local remote
git remote set-url origin https://github.com/remyjkim/darwinian-minds.git
git remote -v   # verify

# 3. Rename the local checkout directory
cd .. && mv darwinian-harness darwinian-minds && cd darwinian-minds

# 4. Publish the package under the new name
bun run scripts/verify-release-readiness.ts   # confirm-pass
npm publish    # first publish of darwinian-minds@<version>

# 5. Re-init submodule against the renamed path
git submodule sync && git submodule update --init --recursive
```

Update any local `AGENTS_REPO_ROOT` exports and the sibling skills repo's hardcoded parent path (`/Users/pureicis/dev/darwinian-harness-skills/README.md:157-158`, `CLAUDE.md`) → `…/darwinian-minds`.

### PHASE 7 — Coordinated external decisions

See §9; execute after Remy confirms each position.

---

## 9. Coordinated-external decisions (need Remy's final nod)

These live in **separate repos / DNS** and are not pure `darwinian-mind`-token rewrites. Recommended positions:

| Item | Recommendation | Rationale |
| --- | --- | --- |
| Catalog repo `curation-labs/dm-cards-catalog-v1` and `dm-`/`dm-card-base` prefixes | **Keep `dm-`** | `dm` already abbreviates "Darwinian **M**inds"; it lives in another org and is referenced by external consumers' locks. Renaming churns consumers for no brand gain. |
| Docs domain `docs.darwiniantools.com` | **Keep** | Neutral, established, SEO-bearing; not a singular-`mind` token. |
| Landing domain `darwinianminds.com` (Astro) | **Keep (already plural)** | Already canonical-aligned. |
| Analyzer service `darwinian-harness-services.pages.dev` | **Defer / separate task** | Separate repo + CF project; rename independently if desired. Docs reference it as a literal URL, so no in-tree coupling breaks. |

If Remy wants `dm-` → `dms-` or a domain change, each becomes its own coordinated sub-task with consumer-migration notes (out of scope here).

---

## 10. Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| An external/published card imports `darwinian-mind/hook-policy` | Low (nothing published) | Phase 0 pre-flight grep of catalog + sources; if found, ship a transitional `darwinian-mind` package that re-exports, or a back-compat alias — revisit before Phase 1 |
| GitHub rename breaks an in-flight PR/branch | Low | Redirect covers refs; rename during a quiet window; re-push after `remote set-url` |
| Submodule pointer advanced to a commit that breaks the bundled-card sync | Medium | Pin to a known-good sibling commit; run `drwn write --dry-run` against the embedded card after Phase 3 |
| Stale `darwinian-mind` slips through | Medium | Phase 5 residual sweep is a hard gate; `\b` boundary avoids false-negatives from `darwinian-minds` |
| Local `AGENTS_REPO_ROOT` / sibling hardcoded paths break after `mv` | Medium | Phase 6 step updates them explicitly |

## 11. Rollback

- **Pre-merge:** abandon the branch; nothing external changed.
- **Post-rename:** GitHub keeps the redirect; `gh repo rename darwinian-harness` reverts the name, and `git remote set-url` points back. npm publish is the only irreversible step — do it **last**, only after a green `verify-release-readiness`.

## 12. Out of scope / follow-ups

- npm deprecation of an old package (none was ever published — N/A).
- Renaming the `dm-cards` catalog or any `curation-labs` repo (separate coordinated task).
- DNS changes for docs/landing domains.
- Renaming the analyzer service repo.
- Homebrew/other distribution channels (none exist yet).
