# Task 28: Darwinian Harness Rebrand Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for code-touching tasks where tests are the spec. Do not commit unless explicitly instructed.

**Status**: Ready For T1 Start
**Created**: 2026-05-29
**Updated**: 2026-05-29
**Assigned**: Unassigned
**Priority**: High
**Estimated Effort**: 1 PR (4–7 sessions)
**Dependencies**: `.ai/analyses/40_drwn-cli-usage-guide.md`, prior rebrand `.ai/tasks/10_beginning-harness-rebrand-implementation-plan.md`
**References**: [analyses/40_drwn-cli-usage-guide.md, tasks/10_beginning-harness-rebrand-implementation-plan.md, tasks/27_docusaurus_docs_site_implementation_plan.md, README.md, package.json, cli/index.ts, cli/core/paths.ts, cli/core/store-paths.ts, cli/context.ts, scripts/verify-release-readiness.ts, test/package-readiness.test.ts, test/docs-readiness.test.ts, test/core-migration.test.ts]

---

## Objective

Rebrand the project from `beginning-harness` / `bgng` to `darwinian-harness` / `drwn` as a **hard cut**: no compatibility aliases, no migration scripts, no deprecation window. The old CLI was never published to npm, so no public users exist to migrate. Every public surface (package metadata, CLI binary, store path, error text, documentation) flips to the new naming in one PR.

This is fundamentally different from the previous rebrand (task 10), which intentionally kept `bgng`, `~/.agents/bgng/`, and the `AGENTS_*` env vars stable. This rebrand changes the CLI binary and the store path too.

---

## Architecture

This is a **rename of the public identity**, not a runtime migration. There is no compatibility code path. Specifically:

- **Renamed:** package name, repo URL, CLI binary, local store subdirectory, internal function/constant identifiers that embed the old binary name, narrative product references in docs, the README hero image filename
- **Removed:** `bgng-hx` alias (recently added in commit `e4b7e99`, never load-bearing)
- **Preserved:** the `~/.agents/` top-level directory (multi-tool convention), env vars `AGENTS_REPO_ROOT` / `AGENTS_DIR` / `AGENTS_HOME_DIR`, all command names (`init`, `add`, `search`, `library`, `write`, `scan`, `skills`, `mcp`, `extensions`, `card`, `store`, `status`, `doctor`), all command semantics, all schema names, `sync-mcp.ts`'s filename

No code path is added that knows about the old names. Anyone with a local `~/.agents/bgng/` populated by the pre-rename CLI is expected to manually move it to `~/.agents/drwn/` after install. The "Local migration note" at the end of this plan documents this for Remy and anyone else with a populated old store.

---

## Tech Stack

- **Runtime**: Bun 1.2+
- **Language**: TypeScript with Clipanion 4 CLI framework
- **Package metadata**: npm + bun.lock
- **Verification**: existing `bun test`, `bun run typecheck`, `bun run verify:release` gates
- **No new dependencies introduced by this work**

---

## Success Criteria

### Public identity

- [ ] `package.json.name` is `darwinian-harness`
- [ ] `package.json.bin` contains exactly one entry: `"drwn": "cli/index.ts"`. **`bgng-hx` is removed.** **`bgng` is removed.**
- [ ] `package.json.scripts.drwn` is `"bun run cli/index.ts"`
- [ ] Package metadata URLs (homepage, bugs, repository) point to `https://github.com/remyjkim/darwinian-harness`
- [ ] `package.json.keywords` includes `darwinian-harness`, `drwn`, `harness`, `meta-harness`
- [ ] `package.json.description` mentions `darwinian-harness` (no `beginning-harness`)
- [ ] `package.json.files` references `docs/assets/the-darwinian-harness.png`
- [ ] `bun.lock` workspace name is `darwinian-harness`

### CLI behavior

- [ ] `drwn --help` works from a checkout via `bun run drwn -- --help`
- [ ] `drwn status` runs and reports the local store at `~/.agents/drwn/`
- [ ] No `bgng` command remains anywhere in the codebase
- [ ] CLI help/error output never says `bgng` or `beginning-harness`

### Store path

- [ ] Store resolves to `~/.agents/drwn/` (user) and `<project>/.agents/drwn/config.json` (project)
- [ ] Function `resolveUserBgngDir` is renamed to `resolveUserDrwnDir` (or equivalent) and all callers updated
- [ ] Internal path constants no longer contain the literal `bgng`

### Docs

- [ ] README opens with `# darwinian-harness` and says `The package is darwinian-harness. The command is drwn.`
- [ ] `.ai/knowledges/01_agents-cli-usage-guide.md` content is updated to `drwn` / `darwinian-harness` throughout (filename kept; see Note A below)
- [ ] `.ai/knowledges/04_homebrew-release-checklist.md` references the new package
- [ ] `.ai/knowledges/05_npm-publishing-analysis-and-manual.md` references the new package with the previous name preserved only as historical note where necessary
- [ ] `docs/maintainers/publishing.md` references the new package
- [ ] `.ai/analyses/39_beginning-harness-prd-v2-cards-era.md` content is updated; filename kept (see Note B below)
- [ ] `.ai/analyses/38_bharness-agent-skills.md` content is updated; filename kept
- [ ] `skills/shared/markitdown-document-conversion/SKILL.md` example command uses `drwn`

### Asset

- [ ] `docs/assets/the-beginning-harness.png` is renamed to `docs/assets/the-darwinian-harness.png` (via `git mv`)
- [ ] All references in `package.json`, `README.md`, and tests updated

### Tests and gates

- [ ] `bun test` passes with zero failures
- [ ] `bun run typecheck` passes
- [ ] `bun run verify:release --json` returns `"ok": true` and the package check passes for `darwinian-harness`
- [ ] `npm pack --dry-run --json` shows the tarball named `darwinian-harness-*.tgz`
- [ ] `git diff --check` exits 0

### Sweep

- [ ] `rg --hidden -n "beginning-harness|bgng|BGNG|bgng-hx" -g '!.git' -g '!node_modules' -g '!docs-astro/**' -g '!docs-docusaurus/**' -g '!.ai/tasks/**'` returns **zero matches** outside intentional historical references inside `.ai/knowledges/05_npm-publishing-analysis-and-manual.md` (clearly framed as historical)
- [ ] `.ai/tasks/` is intentionally NOT swept — historical task plans are preserved as written

---

## Decisions Locked Before Implementation

| # | Decision | Source |
|---|---|---|
| D1 | Hard cut. No compatibility aliases. No CLI name aliases. No store-path fallback. | Remy, this conversation |
| D2 | `bgng-hx` is deleted entirely (not renamed to `drwn-hx`). | Remy, this conversation; the alias was never load-bearing |
| D3 | Env vars `AGENTS_REPO_ROOT`, `AGENTS_DIR`, `AGENTS_HOME_DIR` stay. They were always agent-tool-generic, not bgng-specific. | Task 10 precedent + matches `.ai/analyses/40_drwn-cli-usage-guide.md` |
| D4 | `~/.agents/` top-level directory stays (multi-tool convention). Only the `bgng/` subdirectory becomes `drwn/`. | `.ai/analyses/40_drwn-cli-usage-guide.md` |
| D5 | No migration script. Anyone with a populated `~/.agents/bgng/` (i.e. Remy on his dev machine) manually `mv`s it after install. | Remy, this conversation: "hard cut" |
| D6 | Filenames in `.ai/knowledges/` and `.ai/analyses/` stay the same. Content updates only. Filename renames are a separate task to avoid broad link churn in references and prior plans. | Task 10 precedent |
| D7 | Historical `.ai/tasks/*.md` are NOT updated. They are immutable historical records. | Task 10 precedent |
| D8 | The README hero image **is** renamed (`the-beginning-harness.png` → `the-darwinian-harness.png`). The filename is user-visible in the rendered README. | Filename embeds product identity |
| D9 | Tests are updated alongside the source they cover, not strictly tests-first. Each phase commits in a green state. | Larger volume than task 10; per-phase green commits reduce review pain |
| D10 | Git remote retarget and npm publish are explicitly OUT of scope of this PR. They are separate operator actions, gated behind the GitHub repo rename. | Same separation as task 10 |
| D11 | Task 27 (docusaurus site) and this task can be merged in either order. Task 27 already uses post-rebrand naming; this task doesn't touch `docs-docusaurus/`. | Orthogonal scopes |
| D12 | `command` line registrations in Clipanion stay (no command rename). Only `binaryName` / `binaryLabel` change. | `.ai/analyses/40_drwn-cli-usage-guide.md` command list matches current command names |

### Note A: Knowledge doc filename

`.ai/knowledges/01_agents-cli-usage-guide.md` keeps its filename even though `bgng` is gone. The filename is historical; the **content** is what users read. A future cleanup task may rename to `01_drwn-cli-usage-guide.md` once references are mapped.

### Note B: Analysis doc filename

`.ai/analyses/39_beginning-harness-prd-v2-cards-era.md` keeps its filename for the same reason. Content updates only.

---

## Out of Scope

- Git remote retarget (`git remote set-url`)
- npm publish under the new name
- GitHub repository rename (`beginning-harness` → `darwinian-harness` on GitHub itself)
- Cloudflare Pages reconfiguration (covered by task 27 / future deploy task)
- Renaming `.ai/knowledges/*` and `.ai/analyses/*` filenames
- Migration tooling for `~/.agents/bgng/` → `~/.agents/drwn/`
- Updating historical `.ai/tasks/*.md` plans
- Updating `docs-astro/` (deprecated, will be removed later)
- Anything inside `docs-docusaurus/` (task 27)

---

## Evidence Base

Verified during scoping (see investigation report in conversation):

- `beginning-harness`: 374 occurrences, 57 files
- `bgng`: 3,866 occurrences, 127 files
- `~/.agents/bgng/` paths: 489 occurrences
- GitHub URL `remyjkim/beginning-harness`: 44 occurrences across 12 files
- `bgng-hx` alias: 1 occurrence (package.json:5)
- Function `resolveUserBgngDir` and callers: cli/core/paths.ts + 8 downstream callers
- No `BGNG_*` env vars exist in code
- No config keys embed `bgng` or `beginning-harness`
- Skill content with old naming: `skills/shared/markitdown-document-conversion/SKILL.md` (1 occurrence — user-facing example command)
- The pre-written `.ai/analyses/40_drwn-cli-usage-guide.md` already uses the target names throughout and is the canonical reference for the post-rename state

---

## Entry Checks

Run before editing:

```bash
git status --short --branch
bun test
bun run typecheck
bun run verify:release --json
```

Expected:

- working tree is clean or only the in-progress files from the current branch are modified
- `bun test` passes
- `bun run typecheck` passes
- `bun run verify:release --json` returns `"ok": true`

Create a dedicated branch for this work:

```bash
git checkout -b remyjkim/rebrand-darwinian-harness
```

---

## Implementation Strategy

Twelve phases, each ending in a green-test commit. Within a phase, tests and source change together. Use the per-phase verification commands to catch incomplete renames immediately.

Order rationale:

- **Phases 1–2** set up the new public identity at the metadata layer. Test gates protecting metadata are updated first.
- **Phases 3–5** rename the runtime core: store paths, then the CLI binary identity, then user-facing copy across all commands.
- **Phases 6–9** sweep documentation and skill content.
- **Phase 10** handles the hero image rename and any other asset moves.
- **Phase 11** is the residual-sweep + final verification.
- **Phase 12** documents follow-ups that explicitly require operator action.

---

## Phase 1: Branch Setup and Snapshot

Goal: clean starting point with a baseline reference.

### Task 1.1: Create branch and confirm clean state

```bash
git checkout -b remyjkim/rebrand-darwinian-harness
git status --short --branch
```

Expected: branch created, working tree shows only the in-progress `.ai/` files from the prior branch (which will be carried into this work) or is clean.

### Task 1.2: Snapshot the baseline grep counts

For later sweep verification, record the starting state:

```bash
rg --hidden -c "beginning-harness" -g '!.git' -g '!node_modules' -g '!docs-astro/**' -g '!docs-docusaurus/**' | awk -F: '{s+=$2} END {print "beginning-harness total:", s}'
rg --hidden -c "\bbgng\b" -g '!.git' -g '!node_modules' -g '!docs-astro/**' -g '!docs-docusaurus/**' | awk -F: '{s+=$2} END {print "bgng total:", s}'
rg --hidden -c "bgng-hx" -g '!.git' -g '!node_modules' | awk -F: '{s+=$2} END {print "bgng-hx total:", s}'
```

Save these numbers (expected approximately 374 / 3866 / 1 per the investigation). They are the target counts to drive to zero outside the historical-exception zones.

No commit yet — this is a scoping snapshot.

---

## Phase 2: Package Metadata and Release Gate

Goal: `package.json`, `bun.lock`, `scripts/verify-release-readiness.ts`, and the corresponding metadata tests align on the new identity.

### Task 2.1: Update metadata test expectations first

**Files:**
- Modify: `test/package-readiness.test.ts`
- Modify: `test/cli-install-mode.test.ts`
- Modify: `test/homebrew-readiness.test.ts`
- Modify: `test/docs-readiness.test.ts`

In `test/package-readiness.test.ts`, change all assertions:

```ts
expect(pkg.name).toBe("darwinian-harness");
expect(pkg.homepage).toBe("https://github.com/remyjkim/darwinian-harness");
expect(pkg.bugs).toEqual({ url: "https://github.com/remyjkim/darwinian-harness/issues" });
expect(pkg.repository).toEqual({
  type: "git",
  url: "git+https://github.com/remyjkim/darwinian-harness.git",
});
expect((pkg.bin as Record<string, string>).drwn).toBe("cli/index.ts");
expect((pkg.bin as Record<string, string>)["bgng-hx"]).toBeUndefined();
expect((pkg.bin as Record<string, string>).bgng).toBeUndefined();
expect((pkg.scripts as Record<string, string>).drwn).toBe("bun run cli/index.ts");
```

In `test/cli-install-mode.test.ts`, replace any `beginning-harness` / `bgng` expectations with `darwinian-harness` / `drwn`.

In `test/homebrew-readiness.test.ts`, replace `beginning-harness` with `darwinian-harness`.

In `test/docs-readiness.test.ts`, replace assertions that match the previous README sentence pattern. The new assertions:

```ts
expect(readme).toContain("local meta-harness");
expect(readme).toContain("The package is `darwinian-harness`. The command is `drwn`.");
expect(usageGuide).toContain("darwinian-harness");
expect(usageGuide).toContain("local harness");
```

Replace any homebrew-checklist assertion that names `beginning-harness` with `darwinian-harness`.

### Task 2.2: Run targeted tests, confirm they fail

```bash
bun test test/package-readiness.test.ts test/cli-install-mode.test.ts test/docs-readiness.test.ts test/homebrew-readiness.test.ts
```

Expected: failures naming the old package metadata. This is the red phase.

### Task 2.3: Update `package.json`

**Files:**
- Modify: `package.json`

Apply these exact changes:

```json
{
  "name": "darwinian-harness",
  "bin": {
    "drwn": "cli/index.ts"
  },
  "description": "Local meta-harness CLI for managing AI agent skills, MCP servers, extensions, defaults, and project overlays.",
  "homepage": "https://github.com/remyjkim/darwinian-harness",
  "bugs": {
    "url": "https://github.com/remyjkim/darwinian-harness/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/remyjkim/darwinian-harness.git"
  },
  "files": [
    "cli",
    "registry",
    "skills",
    "README.md",
    "docs/assets/the-darwinian-harness.png",
    "LICENSE",
    "CONTRIBUTING.md"
  ],
  "keywords": [
    "darwinian-harness",
    "drwn",
    "harness",
    "meta-harness",
    "agents",
    "mcp",
    "skills",
    "cli",
    "configuration"
  ],
  "scripts": {
    "drwn": "bun run cli/index.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "verify:release": "bun run scripts/verify-release-readiness.ts"
  }
}
```

**Explicit deletions:**
- Delete the `"bgng": "cli/index.ts"` entry from `bin`
- Delete the `"bgng-hx": "cli/index.ts"` entry from `bin`
- Delete the `"bgng": "bun run cli/index.ts"` script entry

Keep all other fields (`type: "module"`, `version`, `license`, `author`, `devDependencies`, `dependencies`) unchanged.

> **Note about `docs/assets/the-darwinian-harness.png`:** the file does not exist yet. The `files` array references it for the post-rename state. Phase 10 performs the asset rename. Between Phase 2 and Phase 10, `npm pack --dry-run` will warn about the missing file. That's acceptable inside this work; the final verification in Phase 11 confirms the file exists.

### Task 2.4: Update `scripts/verify-release-readiness.ts`

**Files:**
- Modify: `scripts/verify-release-readiness.ts`

Update ABOUTME:

```ts
// ABOUTME: Runs the release-readiness quality gate for the drwn CLI and darwinian-harness package.
```

Replace the package-name check:

```ts
if (pkg.name !== "darwinian-harness") {
  metadataIssues.push("name must be darwinian-harness");
}
```

Update any `bin.bgng` check to `bin.drwn`. Update `scripts.bgng` check to `scripts.drwn`. Search the file for any remaining `bgng` / `beginning-harness` literals and replace.

### Task 2.5: Regenerate the lockfile

```bash
bun install
```

Expected: `bun.lock` workspace name updates from `beginning-harness` to `darwinian-harness`. Dependency versions should not change.

### Task 2.6: Verify metadata tests pass

```bash
bun test test/package-readiness.test.ts test/cli-install-mode.test.ts test/homebrew-readiness.test.ts
```

Expected: all pass.

`test/docs-readiness.test.ts` will still fail at this point (README not updated yet). That's resolved in Phase 6.

### Task 2.7: Commit

```bash
git add package.json bun.lock scripts/verify-release-readiness.ts test/package-readiness.test.ts test/cli-install-mode.test.ts test/homebrew-readiness.test.ts test/docs-readiness.test.ts
git commit -m "[rename:pkg] rebrand package metadata to darwinian-harness"
```

---

## Phase 3: Core Path Layer

Goal: the store-path resolution code renames from `Bgng` to `Drwn`, both at the identifier and the filesystem-string level.

### Task 3.1: Update `cli/core/paths.ts`

**Files:**
- Modify: `cli/core/paths.ts`

Changes:

1. **ABOUTME comments**: replace any `bgng` / `beginning-harness` with `drwn` / `darwinian-harness`.
2. **Function rename**: `resolveUserBgngDir` → `resolveUserDrwnDir`. Use the `Edit` tool with `replace_all` only after confirming the identifier is unique to this function — a separate `replace_all` pass for the function name avoids accidentally touching the literal `.agents/bgng` directory string.
3. **Directory string**: any literal `".agents/bgng"` becomes `".agents/drwn"`. Likewise `"bgng/config.json"` → `"drwn/config.json"`, `"bgng/machine.json"` → `"drwn/machine.json"`, `"bgng/card.lock"` → `"drwn/card.lock"`, etc.
4. **Constants**: any exported constant whose name includes `Bgng` is renamed correspondingly (e.g. `BGNG_STORE_SUBDIR` → `DRWN_STORE_SUBDIR`).

Suggested approach for this file: open it fully, do the function/identifier renames in `Edit` with `replace_all`, then a second pass for the literal directory strings.

### Task 3.2: Update `cli/core/store-paths.ts`

**Files:**
- Modify: `cli/core/store-paths.ts`

Same playbook: ABOUTME, identifier renames, directory-string updates.

### Task 3.3: Update `cli/context.ts`

**Files:**
- Modify: `cli/context.ts`

Specific change at the error message (current line 36):

```ts
throw new Error(`No config.json found at ${repoRoot}. Run drwn from a darwinian-harness checkout or set AGENTS_REPO_ROOT.`);
```

Update any imports of `resolveUserBgngDir` to `resolveUserDrwnDir`.

### Task 3.4: Update every downstream caller of the renamed function

The investigation identified ~8 downstream callers across `cli/`. Search and update:

```bash
rg -l "resolveUserBgngDir|BGNG_STORE_SUBDIR" cli/ test/
```

For each match, swap the identifier. After updating, re-run the same `rg` — expected: no matches.

### Task 3.5: Update `cli/core/store-migrate.ts` and `cli/commands/store/migrate.ts` carefully

These files contain explicit logic for "legacy layout detection." Read them in full before editing — their reason for existing was to detect/migrate older `~/.agents/bgng/` structures. After this rebrand, **the only "legacy layout" they detect is the old `bgng/` directory itself** which the new CLI does not migrate (per D5).

Decision for this rebrand: **keep the migrate command shell, but have it report "no migration needed" if it finds only the new layout, and emit a clear message if it finds an old `~/.agents/bgng/` directory:**

```ts
console.log(`Found legacy ~/.agents/bgng/ directory. This rebrand does not migrate it automatically. Run: mv ~/.agents/bgng ~/.agents/drwn`);
```

This is a one-line ergonomic improvement for Remy and any other developer hitting this case. It does not constitute a "migration tool."

### Task 3.6: Update `test/core-migration.test.ts`

**Files:**
- Modify: `test/core-migration.test.ts`

Update fixture paths from `.agents/bgng/` to `.agents/drwn/` for the current-layout assertions. For any "legacy layout" tests, update them to verify the new advisory message from Task 3.5.

### Task 3.7: Verify core paths typecheck and core tests pass

```bash
bun run typecheck
bun test test/core-migration.test.ts
```

Expected: both pass. If typecheck reports unresolved `resolveUserBgngDir` references anywhere, that's an unfound caller — locate and update.

### Task 3.8: Commit

```bash
git add cli/core/paths.ts cli/core/store-paths.ts cli/core/store-migrate.ts cli/context.ts cli/commands/store/migrate.ts test/core-migration.test.ts
# Plus any additional cli/ files touched as downstream callers
git add cli/
git commit -m "[rename:store] rename bgng store path and helpers to drwn"
```

---

## Phase 4: CLI Binary Identity

Goal: Clipanion knows the CLI is `drwn`. `bgng-hx` and `bgng` are gone everywhere.

### Task 4.1: Update `cli/index.ts`

**Files:**
- Modify: `cli/index.ts`

Replace the Clipanion `Cli` instantiation at approximately lines 59–62. Current shape:

```ts
const cli = new Cli({
  binaryLabel: "beginning-harness CLI",
  binaryName: "bgng",
  binaryVersion: pkg.version,
});
```

New shape:

```ts
const cli = new Cli({
  binaryLabel: "darwinian-harness CLI",
  binaryName: "drwn",
  binaryVersion: pkg.version,
});
```

ABOUTME at the top of the file: update both lines to mention `drwn` and `darwinian-harness`.

Search the file for any remaining literals `bgng` or `beginning-harness` (in command descriptions registered here, in error fallbacks, etc.) and update.

### Task 4.2: Update CLI smoke and install-mode tests

**Files:**
- Modify: `test/cli-smoke.test.ts`
- Modify: `test/cli-install-mode.test.ts` (residual updates from Phase 2)

Replace all `bgng` invocations in `Bash` spawn calls with `drwn`. Update expected output strings that include `bgng` to `drwn`.

### Task 4.3: Run CLI smoke

```bash
bun run drwn -- --help
bun run drwn -- status
```

Expected:

- `drwn --help` banner shows `darwinian-harness CLI`, `drwn` as the binary name
- `drwn status` runs and reports a store at `~/.agents/drwn/`
- Neither command output contains the strings `bgng` or `beginning-harness`

```bash
bun test test/cli-smoke.test.ts
```

Expected: passes.

### Task 4.4: Commit

```bash
git add cli/index.ts test/cli-smoke.test.ts test/cli-install-mode.test.ts
git commit -m "[rename:bin] rename cli binary from bgng to drwn"
```

---

## Phase 5: CLI Commands and User-Facing Copy

Goal: every command file under `cli/commands/`, plus all command tests, references `drwn` and `darwinian-harness`. No `bgng` literals remain in any user-facing string emitted by the CLI.

### Task 5.1: Identify the file list

```bash
rg -l "\bbgng\b|beginning-harness" cli/commands/ test/commands-*.test.ts
```

Expected: 80+ command source files and 60+ test files (per investigation). Save this list — you'll work through it systematically.

### Task 5.2: Bulk substitution with care

For each file in the list, do **three targeted substitutions**:

1. `bgng` → `drwn` (word-boundary aware; do NOT touch `.agents/bgng` strings that still need replacing — handled by step 2)
2. `.agents/bgng` → `.agents/drwn` (catches the path strings step 1's word boundary may have missed)
3. `beginning-harness` → `darwinian-harness`

**Recommended tooling:** use `Edit` with `replace_all` per file. Do NOT use a project-wide `sed` script unless you also visually review the diff — there are too many semantic edge cases (e.g. help text that explains what the CLI is, error messages that mention both names) to trust blind substitution.

### Task 5.3: Semantic review of high-impact files

Read these files end-to-end and verify the rewrite reads well, not just lexically:

- `cli/commands/init.ts` — first-run experience text
- `cli/commands/extensions/add.ts` — heavy user-message content
- `cli/commands/export/sessions.ts` — export-flow messaging
- `cli/commands/library/add/skill.ts` — install messaging
- `cli/commands/store/migrate.ts` — already touched in Phase 3; re-verify
- `cli/commands/status/*` — diagnostic output

Watch for sentences that named both `bgng` and `beginning-harness` in series (e.g. "Run bgng from a beginning-harness checkout") — the rebrand should produce "Run drwn from a darwinian-harness checkout."

### Task 5.4: Update command tests

Same sweep across `test/commands-*.test.ts`. For each test:

- Update `Bash` spawn arguments from `bgng` → `drwn`
- Update fixture directory creations from `.agents/bgng` → `.agents/drwn`
- Update expected-output assertions that include `bgng` literals (but be careful with snapshot assertions — re-run after editing source first, then update snapshots to match the new output rather than the other way around)

### Task 5.5: Update test fixture temp-dir prefixes

```bash
rg -l "beginning-harness-" test/
```

For each match (e.g. `test/sync-mcp.test.ts:27` uses temp-dir prefix `"beginning-harness-"`):

```ts
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "darwinian-harness-"));
```

These are cosmetic but should stay consistent.

### Task 5.6: Run the full test suite

```bash
bun test
bun run typecheck
```

Expected: full pass. Investigate any remaining failures — they likely indicate a file in `cli/commands/` or `test/` missed in the sweep.

### Task 5.7: Sweep grep

```bash
rg --hidden -n "\bbgng\b|beginning-harness" cli/ test/ --glob '!**/node_modules/**'
```

Expected: zero matches in `cli/` and `test/`. If matches remain, fix and re-run.

### Task 5.8: Commit

```bash
git add cli/commands/ test/
git commit -m "[rename:cli] sweep cli commands and tests for drwn naming"
```

---

## Phase 6: README and Root Docs

Goal: the README opens with `# darwinian-harness`, says the package and command are `darwinian-harness` / `drwn`, and the docs-readiness test passes.

### Task 6.1: Rewrite README

**Files:**
- Modify: `README.md`

This is the public face of the project. Reads as authoritative when shipped to npm. Heavy semantic rewrite:

1. **Title line:** `# darwinian-harness`
2. **Hero image reference:** `![The Darwinian Harness hero image](./docs/assets/the-darwinian-harness.png)`
3. **Opening paragraph:**
   ```md
   `darwinian-harness` is a local meta-harness for AI agent tools: one CLI to organize skills, MCP servers, extensions, defaults, project overlays, downstream tool configs, and diagnostics.

   Agents are only as reliable as the harness around them. `darwinian-harness` makes that harness explicit, inspectable, reusable, and safe to write into downstream tools.

   The package is `darwinian-harness`. The command is `drwn`.
   ```
4. **Install commands:**
   ```bash
   npm install -g darwinian-harness
   drwn status
   ```
5. **Checkout commands:**
   ```bash
   git clone https://github.com/remyjkim/darwinian-harness.git
   cd darwinian-harness
   bun install
   bun run drwn -- status
   ```
6. **All other `bgng` references:** replace with `drwn`
7. **All other `beginning-harness` references:** replace with `darwinian-harness`
8. **GitHub URL:** every instance of `remyjkim/beginning-harness` becomes `remyjkim/darwinian-harness`

Use `Edit` with `replace_all` for the literal substitutions, then read the full file top-to-bottom and verify the prose still reads sensibly.

### Task 6.2: Update `CONTRIBUTING.md` if needed

Open the file and check whether it references `bgng` or `beginning-harness`. If yes, update; if no, no change.

### Task 6.3: Update `docs/maintainers/publishing.md`

**Files:**
- Modify: `docs/maintainers/publishing.md`

Replace:
- All `bgng` → `drwn`
- All `beginning-harness` → `darwinian-harness`
- All `remyjkim/beginning-harness` → `remyjkim/darwinian-harness`
- Any `npm view beginning-harness` example commands → `npm view darwinian-harness`

Add a short note near the top:

```md
This package is `darwinian-harness` (CLI: `drwn`). Earlier publishing notes referencing `beginning-harness` are historical from the pre-rename phase.
```

### Task 6.4: Verify docs-readiness passes

```bash
bun test test/docs-readiness.test.ts
```

Expected: passes. If it fails, the assertion string in the test does not exactly match the README. Fix the README to match (the test is the spec).

### Task 6.5: Commit

```bash
git add README.md CONTRIBUTING.md docs/maintainers/
git commit -m "[doc:readme] rewrite readme and maintainer docs around darwinian-harness"
```

---

## Phase 7: Knowledge Docs

Goal: `.ai/knowledges/` content reflects the new naming. Filenames are preserved (see Note A).

### Task 7.1: Update `.ai/knowledges/01_agents-cli-usage-guide.md`

**Files:**
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`

This file is ~60+ occurrences of `bgng` per the investigation. Heavy rewrite.

1. Rename "What `bgng` Is" section heading to "What `drwn` Is"
2. Replace product framing:
   ```md
   `drwn` is the operator CLI for `darwinian-harness`.

   `darwinian-harness` is the local meta-harness control plane around the agent tools you already use.
   ```
3. All path references from `.agents/bgng` → `.agents/drwn`
4. All command examples from `bgng <verb>` → `drwn <verb>`
5. All product-name references from `beginning-harness` → `darwinian-harness`

Use `Edit` with `replace_all`, then read top-to-bottom for prose coherence.

### Task 7.2: Update `.ai/knowledges/02_per-project-config-guide.md`

Same playbook: `replace_all` substitutions, prose review.

### Task 7.3: Update `.ai/knowledges/04_homebrew-release-checklist.md`

Same playbook. Specifically:

```md
- current package name: `darwinian-harness`
```

### Task 7.4: Update `.ai/knowledges/05_npm-publishing-analysis-and-manual.md`

This file contains **historical analysis** of the previous publishing attempt(s). Preserve historical references explicitly framed as past events:

> "Earlier notes may refer to `beginning-harness` because that was the package name during the pre-rename phase."

But update current command examples to `darwinian-harness`. Use judgement — when a sentence is in past tense ("we previously published `beginning-harness`"), keep it; when it's a current instruction ("run `npm view beginning-harness`"), update it.

### Task 7.5: Update `.ai/knowledges/README.md`

If it lists files by description, ensure descriptions reflect the new naming.

### Task 7.6: Run docs-readiness test

```bash
bun test test/docs-readiness.test.ts
```

Expected: passes.

### Task 7.7: Commit

```bash
git add .ai/knowledges/
git commit -m "[doc:knowledge] update knowledge docs to drwn and darwinian-harness"
```

---

## Phase 8: Living Analyses

Goal: actively maintained architecture docs in `.ai/analyses/` reflect the new naming. Filenames preserved (see Note B).

### Task 8.1: Identify the living analyses

Per the investigation, these are the actively-referenced docs that need updating:

- `.ai/analyses/38_bharness-agent-skills.md`
- `.ai/analyses/39_beginning-harness-prd-v2-cards-era.md`

Per the investigation, these do NOT need editing (already correct or intentionally historical):

- `.ai/analyses/40_drwn-cli-usage-guide.md` (already uses target names)
- Earlier `.ai/analyses/01_*` through `.ai/analyses/37_*` (historical; preserve as-is)

If during the sweep in Phase 11 other living analyses surface, update them then.

### Task 8.2: Update `.ai/analyses/39_beginning-harness-prd-v2-cards-era.md`

Heavy semantic rewrite. The filename is kept but the content describes the current/future product. Replace:
- `beginning-harness` → `darwinian-harness`
- `bgng` → `drwn`
- `.agents/bgng` → `.agents/drwn`

Preserve historical "what we were called before" context only if it adds clarity; otherwise the doc reads as if the new naming has always been the naming (since the old CLI was never published, this is honest).

### Task 8.3: Update `.ai/analyses/38_bharness-agent-skills.md`

Same playbook.

### Task 8.4: Commit

```bash
git add .ai/analyses/38_bharness-agent-skills.md .ai/analyses/39_beginning-harness-prd-v2-cards-era.md
git commit -m "[doc:analysis] update living analyses for darwinian-harness rebrand"
```

---

## Phase 9: Skills Content

Goal: skills shipped with the repo reference the new CLI name in their examples.

### Task 9.1: Update `skills/shared/markitdown-document-conversion/SKILL.md`

**Files:**
- Modify: `skills/shared/markitdown-document-conversion/SKILL.md`

Per the investigation, this file contains exactly one occurrence (line 22):

```md
... `bgng extensions setup markitdown --install` ...
```

becomes:

```md
... `drwn extensions setup markitdown --install` ...
```

### Task 9.2: Sweep `skills/` for other occurrences

```bash
rg -n "\bbgng\b|beginning-harness" skills/
```

If any other matches surface (the investigation found only the one), update them.

### Task 9.3: Commit

```bash
git add skills/
git commit -m "[doc:skill] update built-in skill examples to drwn"
```

---

## Phase 10: Hero Image Rename

Goal: the README hero image filename matches the new product name.

### Task 10.1: Rename the asset file

```bash
git mv docs/assets/the-beginning-harness.png docs/assets/the-darwinian-harness.png
```

Expected: git records a rename, not a delete+add.

### Task 10.2: Verify all references already point at the new filename

Phase 2 updated `package.json`. Phase 6 updated `README.md`. Verify:

```bash
rg "the-beginning-harness" -g '!.git' -g '!node_modules' -g '!docs-astro/**' -g '!docs-docusaurus/**' -g '!.ai/tasks/**'
```

Expected: zero matches (other than possibly in `.ai/tasks/` historical files, which we don't update).

If any match exists in scope, update it.

### Task 10.3: Verify package readiness

```bash
bun test test/package-readiness.test.ts
bun run verify:release --json
```

Expected: both pass. `verify:release` confirms the hero image is in the published file list.

### Task 10.4: Commit

```bash
git add docs/assets/
git commit -m "[asset:readme] rename hero image to the-darwinian-harness.png"
```

---

## Phase 11: Final Verification

Goal: end-to-end green. The full test suite, typecheck, release gate, and sweep grep all pass.

### Task 11.1: Run full test suite

```bash
bun test
```

Expected: all tests pass, zero failures, zero skips introduced by this work.

### Task 11.2: Run typecheck

```bash
bun run typecheck
```

Expected: exits `0`.

### Task 11.3: Run release readiness

```bash
bun run verify:release --json
```

Expected:
- `"ok": true`
- package metadata check passes for `darwinian-harness`
- no `.ai/` files included in package
- no `test/` files included in package

### Task 11.4: npm pack dry run

```bash
npm pack --dry-run --json
```

Expected:
- tarball name is `darwinian-harness-<version>.tgz`
- includes `cli/index.ts`
- includes `docs/assets/the-darwinian-harness.png`
- excludes `.ai/`, `test/`, `docs-astro/`, `docs-docusaurus/`

### Task 11.5: CLI smoke

```bash
bun run drwn -- --help
bun run drwn -- status
bun run drwn -- status --json
bun run drwn -- write --dry-run
```

Expected:
- all exit `0`
- output uses `drwn` (not `bgng`)
- output uses `darwinian-harness` (not `beginning-harness`)
- store directory references show `~/.agents/drwn/` or `<project>/.agents/drwn/`

### Task 11.6: Residual sweep grep

```bash
rg --hidden -n "\bbgng\b|bgng-hx|beginning-harness|the-beginning-harness" \
  -g '!.git' -g '!node_modules' -g '!docs-astro/**' -g '!docs-docusaurus/**' -g '!.ai/tasks/**'
```

Expected: zero matches in the swept zone.

Acceptable exceptions, **and only these**:
- `.ai/knowledges/05_npm-publishing-analysis-and-manual.md` — if a sentence is explicitly framed as past-tense historical analysis
- `.ai/analyses/14_meta_harness_report.md` — only if a sentence references `beginning-harness` as a historical waypoint

If you find any match outside these explicit exception files, fix it.

### Task 11.7: Verify the `BGNG_*` env var assertion

Confirm no new env vars were introduced. Quick check:

```bash
rg "process\.env\.(BGNG|DRWN|BEGINNING|DARWINIAN)" cli/ test/ scripts/
```

Expected: zero matches (env vars stay `AGENTS_*`).

### Task 11.8: Verify `bgng-hx` removal

```bash
rg "bgng-hx" -g '!.git' -g '!node_modules' -g '!.ai/tasks/**'
```

Expected: zero matches.

### Task 11.9: `git diff --check`

```bash
git diff --check origin/main
```

Expected: exits `0`.

### Task 11.10: Final commit if any fixups were needed

If anything was tweaked during verification, commit:

```bash
git status
# inspect, commit fixups with [fix:rename] subject
```

---

## Phase 12: Operator Follow-ups (Out of Scope of This PR)

These actions are explicitly **not** performed as part of this PR. They are documented here so Remy and any executor know the post-merge sequence.

### Op 1: Move local store on dev machine

For Remy on his own machine:

```bash
mv ~/.agents/bgng ~/.agents/drwn
```

This is a one-time manual action. Any other developer who pre-installed the old CLI does the same.

### Op 2: Retarget git remote

After the GitHub repo is renamed to `darwinian-harness`:

```bash
git remote set-url origin https://github.com/remyjkim/darwinian-harness.git
git remote -v
```

### Op 3: GitHub repository rename

Performed in the GitHub UI. The plan in this PR has already updated all URLs to point at the post-rename location, so the rename itself activates those URLs.

### Op 4: Publish to npm

Only after Op 3 and a final `bun run verify:release --json` confirm-pass on `main`:

```bash
npm view darwinian-harness name version repository --json    # expect E404
bun run verify:release --json
npm pack --dry-run --json
npm publish
```

### Op 5: Cloudflare Pages reconfiguration

The docs-docusaurus deploy targets `darwiniantools.com`, a separate domain from any previous CF project. Operator action in Cloudflare dashboard — not in code. See task 27.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Incomplete `bgng` sweep leaves stale references in unusual files (binary names embedded in JSON metadata, hidden help strings) | Phase 11.6 residual grep is the safety net. The grep targets known historical-exception files explicitly so any new match is a real miss to fix. |
| Test snapshot precision in `test/docs-readiness.test.ts` breaks if README sentence punctuation drifts | The new assertion string is locked in Task 2.1 and the README is rewritten to match in Task 6.1. If the test fails, fix the README — the test is the spec. |
| `resolveUserBgngDir` function rename misses a caller, breaking typecheck silently because the new name doesn't yet exist | Phase 3 runs `bun run typecheck` at the end of the phase. Any unfound caller surfaces as `Cannot find name 'resolveUserBgngDir'`. |
| Local store at `~/.agents/bgng/` is silently abandoned on Remy's machine | Phase 3 Task 3.5 surfaces an explicit message if the old directory is detected. The operator action in Phase 12 Op 1 documents the manual move. |
| `bun.lock` regeneration introduces unrelated dependency drift | Phase 2 Task 2.5 should produce only a workspace-name change. If other diffs appear, inspect and revert anything unrelated before committing. |
| `docs/assets/the-darwinian-harness.png` doesn't exist between Phase 2 and Phase 10, causing `npm pack` warnings during intermediate verification | Acceptable — Phase 10 resolves it. Phase 11.3 is the only verification that requires the asset to exist. |
| `bgng-hx` deletion is in package.json only but some downstream tooling depends on it (CI, install scripts, etc.) | Investigation found `bgng-hx` defined only in package.json with no callers anywhere in the repo. Its removal is safe. |
| Historical `.ai/tasks/*.md` files contain `bgng` and `beginning-harness` references that look like misses | Phase 11.6 explicitly excludes `.ai/tasks/**`. Historical task plans are immutable per D7. |
| Task 27 (docusaurus) and this task conflict | Both already use the post-rebrand naming. They edit disjoint files. Merge order doesn't matter. |
| GitHub URL `https://github.com/remyjkim/darwinian-harness` 404s until the GitHub repo is renamed | Acceptable for the rename window. The README and package metadata land with forward-looking URLs that will resolve once Op 3 happens. |

---

## Testing Strategy

- **Per-phase gating**: each phase ends in a green-test commit. If a phase ends red, do not proceed.
- **Tests-first where the test is the spec**: Phase 2 updates metadata assertions before changing `package.json`, so the green transition is observable.
- **Source+tests together where mechanical**: Phase 5 (bulk command-file sweep) updates source and tests in the same commit. Splitting them would leave hundreds of test failures in an intermediate state.
- **Sweep grep as a residual safety net**: Phase 11.6 catches anything missed in earlier phases.
- **CLI smoke as runtime verification**: Phase 11.5 exercises the actual CLI to catch issues where strings compile fine but the runtime output is wrong.

---

## Final Implementation Checklist

- [ ] Branch `remyjkim/rebrand-darwinian-harness` created.
- [ ] Phase 2: package.json + bun.lock + release gate + metadata tests rebranded.
- [ ] Phase 3: store path code and core tests rebranded.
- [ ] Phase 4: CLI binary identity rebranded; `bgng-hx` removed.
- [ ] Phase 5: 80+ command files and 60+ command tests swept.
- [ ] Phase 6: README and maintainer docs rewritten.
- [ ] Phase 7: living knowledge docs updated.
- [ ] Phase 8: living analyses updated.
- [ ] Phase 9: skill examples updated.
- [ ] Phase 10: hero image renamed.
- [ ] Phase 11: full verification green.
- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run verify:release --json` passes.
- [ ] `npm pack --dry-run --json` produces a `darwinian-harness` tarball.
- [ ] Residual grep returns zero unintended matches.
- [ ] No commit made unless explicitly instructed.

---

## Notes

- This plan is intentionally larger than task 10 because the blast radius is ~3× wider (binary rename + store path rename added on top of the package rename). The per-phase commit cadence keeps individual changes reviewable.
- The execution order **must** be Phase 2 → Phase 3 → Phase 4 → Phase 5 because each phase depends on the green state of the previous. Phases 6 through 10 can be reordered if convenient.
- Phase 12 follow-ups are **operator actions**, not implementation steps. Do not execute them as part of this PR.
- The post-merge `bgng-hx` removal also closes the gap from commit `e4b7e99` which never fully landed as a load-bearing alias.
- After this PR merges and Op 3 (GitHub repo rename) happens, task 27's `editUrl` (`https://github.com/remyjkim/darwinian-harness/tree/main/docs-docusaurus/`) starts resolving.
