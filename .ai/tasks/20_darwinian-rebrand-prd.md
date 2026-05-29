# PRD: Darwinian Rebrand

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every code-changing task. Do not commit unless explicitly instructed.

## Introduction

Rename the project from `beginning-harness` to `darwinian-harness` and rename the CLI binary from `bgng` to `drwn` (with alias `bgng-hx` → `drwn-hx`). This is a pure identity rename — no runtime behavior changes, no new features, no schema migrations.

**Rename mapping (exhaustive):**

| Old | New |
|-----|-----|
| `beginning-harness` | `darwinian-harness` |
| `beginning` (product name) | `darwinian` |
| `Beginning Harness` | `Darwinian Harness` |
| `bgng` | `drwn` |
| `bgng-hx` | `drwn-hx` |
| GitHub: `remyjkim/beginning-harness` | **unchanged** — repo name stays as-is |

**What must NOT change (runtime contracts preserved):**
- Env vars: `AGENTS_REPO_ROOT`, `AGENTS_HOME_DIR`, `AGENTS_DIR`
- Filesystem config paths: `~/.agents/`, `.agents/bgng/config.json`
- The `.claude/worktrees/` directory — skip entirely, it is an ephemeral artifact

---

## Goals

- All user-visible strings say `drwn` and `darwinian-harness` after the rename
- `bun test` passes with zero failures after all changes
- `bun run verify:release` passes with the new identity
- No broken import paths, no broken test assertions

---

## User Stories

### US-001: Rename package identity in `package.json`

**Description:** As a developer publishing the package, I want `package.json` to carry the `darwinian-harness` identity so that npm and release tooling all reflect the new name.

**Acceptance Criteria:**
- [ ] `name` is `"darwinian-harness"`
- [ ] `bin` keys are `"drwn"` and `"drwn-hx"` (both pointing to `cli/index.ts`)
- [ ] `scripts.drwn` is `"bun run cli/index.ts"` (key renamed from `bgng`)
- [ ] `homepage`, `bugs.url`, `repository.url` all remain pointing to `remyjkim/beginning-harness` (GitHub repo name is unchanged)
- [ ] `files` array entry `docs/assets/the-beginning-harness.png` updated to `docs/assets/the-darwinian-harness.png`
- [ ] `keywords` updated (`"beginning-harness"` → `"darwinian-harness"`, `"bgng"` → `"drwn"`)
- [ ] `bun test` passes

### US-002: Rename the CLI binary label in `cli/index.ts` and `cli/context.ts`

**Description:** As a CLI user, I want all auto-generated help output and error messages to say `drwn` so that every usage instruction is consistent with the new binary name.

**Acceptance Criteria:**
- [ ] `binaryLabel` and `binaryName` in `cli/index.ts` are both `"drwn"`
- [ ] Warning message in `cli/index.ts:123` references `drwn store migrate` and `darwinian-harness checkout`
- [ ] Error message in `cli/context.ts:36` references `drwn` and `darwinian-harness checkout`
- [ ] `bun test` passes

### US-003: Update all user-visible strings in `cli/commands/`

**Description:** As a CLI user, I want every command's help text, usage example, and error message to say `drwn` so that copy-pasting from help output always works.

**Files:** all files under `cli/commands/` (35 files — `add/`, `card/`, `extensions/`, `export/`, `library/`, `mcp/`, `search/`, `skills/`, `store/`, `base.ts`, `doctor.ts`, `init.ts`, `scan.ts`, `status.ts`, `write.ts`)

**Acceptance Criteria:**
- [ ] Every occurrence of `bgng` in user-visible strings replaced with `drwn`
- [ ] Every occurrence of `beginning-harness` in user-visible strings replaced with `darwinian-harness`
- [ ] No import paths changed (these files have no `beginning`/`bgng` in imports)
- [ ] `bun test` passes

### US-004: Update all user-visible strings in `cli/core/`

**Description:** As a CLI user, I want all core-layer output messages and warnings to say `drwn`/`darwinian-harness` so there are no stale references in runtime output.

**Files:** all files under `cli/core/` (22 files — `card-lock.ts`, `card-skill-resolver.ts`, `card-store.ts`, `config.ts`, `diagnostics.ts`, `export/archiver.ts`, `extensions/` (5 files), `interactivity.ts`, `managed-fields.ts`, `mcp.ts`, `migration.ts`, `output.ts`, `paths.ts`, `project-writes.ts`, `project.ts`, `registry.ts`, `skills.ts`, `store-paths.ts`, `sync.ts`, `types.ts`, `user-config.ts`, `write-record.ts`)

**Acceptance Criteria:**
- [ ] Every occurrence of `bgng` in user-visible strings replaced with `drwn`
- [ ] Every occurrence of `beginning-harness` in user-visible strings replaced with `darwinian-harness`
- [ ] `bun test` passes

### US-005: Update release gate script `scripts/verify-release-readiness.ts`

**Description:** As a release engineer, I want the release-readiness script to assert the new identity so that `bun run verify:release` enforces `darwinian-harness` and `drwn` going forward.

**Acceptance Criteria:**
- [ ] Comment header updated
- [ ] `pkg.name !== "beginning-harness"` → `pkg.name !== "darwinian-harness"`
- [ ] Error message string `"name must be beginning-harness"` → `"name must be darwinian-harness"`
- [ ] `pkg.bin.bgng` check → `pkg.bin.drwn`
- [ ] Error message `"bin.bgng must point to cli/index.ts"` → `"bin.drwn must point to cli/index.ts"`
- [ ] `pkg.scripts.bgng` check → `pkg.scripts.drwn`
- [ ] Error message `"scripts.bgng must be 'bun run cli/index.ts'"` → `"scripts.drwn must be 'bun run cli/index.ts'"`
- [ ] `bun run verify:release` passes

### US-006: Update test assertions to match new identity

**Description:** As a developer, I want the test suite to assert the new `darwinian-harness`/`drwn` identity so that `bun test` passes and the suite guards the new name going forward.

**Files (identity-asserting — high risk):**
- `test/package-readiness.test.ts`
- `test/cli-install-mode.test.ts`
- `test/docs-readiness.test.ts`
- `test/homebrew-readiness.test.ts`

**Files (CLI output-asserting — medium risk, all `test/commands-*.test.ts`, `test/core-*.test.ts`, `test/scenarios-*.test.ts`, `test/helpers.ts`, `test/cli-*.test.ts`, `test/sync-mcp.test.ts`, `test/markitdown-skill.test.ts`):**

**Acceptance Criteria:**
- [ ] `pkg.name === "darwinian-harness"` in package-readiness and cli-install-mode tests
- [ ] `pkg.bin.drwn === "cli/index.ts"` and `pkg.scripts.drwn === "bun run cli/index.ts"`
- [ ] GitHub URL assertions (`homepage`, `bugs.url`, `repository.url`) remain `remyjkim/beginning-harness` — do not change these
- [ ] Asset path assertion references `docs/assets/the-darwinian-harness.png`
- [ ] All CLI output assertions match `drwn` (not `bgng`)
- [ ] `bun test` passes with zero failures

### US-007: Update docs site (`docs-astro/`)

**Description:** As a user reading the docs, I want all documentation pages to reference `drwn` and `darwinian-harness` so that instructions are accurate.

**Files:**
- `docs-astro/package.json`
- `docs-astro/astro.config.mjs`
- `docs-astro/src/consts.ts`
- `docs-astro/src/content/docs/01-getting-started.md` through `11-store-and-migration.md` (all 11 pages)

**Acceptance Criteria:**
- [ ] `docs-astro/package.json` `name` is `"darwinian-harness-docs"`
- [ ] `docs-astro/astro.config.mjs` site URL updated (or marked TODO if domain not yet decided)
- [ ] `docs-astro/src/consts.ts` `NAME`, `EMAIL`, description fields updated
- [ ] All 11 doc pages: every `bgng` command example updated to `drwn`, every `beginning-harness` prose reference updated to `darwinian-harness`
- [ ] `bun test` passes

### US-008: Update `README.md` and remaining public docs

**Description:** As a user discovering the project, I want `README.md` and maintainer docs to use the new name so that nothing is stale after the rename.

**Files:**
- `README.md`
- `docs/maintainers/publishing.md`
- `docs/plans/2026-04-28-top-level-registry-design.md`
- `docs/plans/2026-04-28-top-level-registry-layout.md`
- `skills/shared/markitdown-document-conversion/SKILL.md`

**Acceptance Criteria:**
- [ ] `README.md` title, hero image alt text, install instructions, and all command examples updated
- [ ] Image file `docs/assets/the-beginning-harness.png` renamed to `docs/assets/the-darwinian-harness.png` (or reference updated if file rename is deferred)
- [ ] `docs/maintainers/publishing.md` npm commands and package references updated
- [ ] Plan docs and SKILL.md prose updated
- [ ] `bun test` passes (docs-readiness assertions)

### US-009: Deprecate `beginning-harness` on npm pointing to `darwinian-harness`

**Description:** As a user who has `beginning-harness` installed, I want to be notified that the package has moved to `darwinian-harness` so that I know to update my install.

**Acceptance Criteria:**
- [ ] After `darwinian-harness` is published to npm, run `npm deprecate beginning-harness@* "Package renamed to darwinian-harness. Please uninstall beginning-harness and install darwinian-harness instead."`
- [ ] `npm view beginning-harness` shows the deprecation warning
- [ ] `darwinian-harness` is published and resolvable on npm before this step is run

**Note:** This story is a post-publish manual step, not a code change. It must happen after `darwinian-harness` is live on npm.

---

## Functional Requirements

- **FR-1:** `package.json` `name` must be `"darwinian-harness"`.
- **FR-2:** `package.json` `bin` must have keys `"drwn"` and `"drwn-hx"` (the `bgng` and `bgng-hx` keys must be removed).
- **FR-3:** `package.json` `scripts` must have key `"drwn"` (the `bgng` key must be removed).
- **FR-4:** `cli/index.ts` `binaryLabel` and `binaryName` must both be `"drwn"`.
- **FR-5:** Every user-visible string across `cli/commands/` and `cli/core/` must use `drwn` instead of `bgng` and `darwinian-harness` instead of `beginning-harness`.
- **FR-6:** `scripts/verify-release-readiness.ts` must assert `darwinian-harness` and `drwn` (not the old names).
- **FR-7:** All test assertions in `test/` must reflect the new identity; zero test failures after rename.
- **FR-8:** All documentation (README, docs-astro, docs/, skills/) must use the new names in prose and code examples.
- **FR-9:** After `darwinian-harness` is published to npm, `npm deprecate beginning-harness@*` must be run with a message directing users to `darwinian-harness`.

---

## Non-Goals

- **No runtime path migration.** The filesystem paths `~/.agents/`, `.agents/bgng/config.json` and the environment variables `AGENTS_REPO_ROOT`, `AGENTS_HOME_DIR`, `AGENTS_DIR` are **preserved unchanged**. Migrating these is a separate, user-facing breaking change that requires its own plan.
- **No GitHub repository rename.** The GitHub repo stays at `remyjkim/beginning-harness`. All `homepage`, `bugs.url`, and `repository.url` fields in `package.json` continue to point there unchanged.
- **No Homebrew formula update.** Updating the Homebrew tap formula is a post-publish step, not part of this rename.
- **No user-facing migration command.** No `drwn store migrate` or similar command is being added here.
- **No changes to `.claude/worktrees/`.** This directory is an ephemeral git worktree artifact and must be skipped entirely.
- **No changes to `.ai/`.** All files under `.ai/analyses/`, `.ai/tasks/`, and `.ai/knowledges/` are historical product documents and must be left exactly as-is.

---

## Technical Considerations

- **Execution order matters.** `package.json` changes should land first because multiple tests and the release script assert against it. Then the CLI runtime (`cli/index.ts`, `cli/context.ts`), then commands/core, then tests (which must be updated to match the new output), then docs.
- **`bgng-hx` alias.** The secondary bin alias appears only in `package.json:5`. It must become `"drwn-hx"`.
- **Asset rename.** `docs/assets/the-beginning-harness.png` is referenced in `package.json:25` and `test/package-readiness.test.ts:77`. The physical file should be renamed and both references updated together.
- **Global find-and-replace risk.** A naive `sed -i 's/bgng/drwn/g'` would corrupt `.agents/bgng/config.json` path strings in core files. Each substitution must be made with awareness of which occurrences are runtime paths (preserve) vs. user-visible strings (update).
- **Test suite is the source of truth.** Run `bun test` after each user story to catch regressions early rather than fixing all test failures at the end.

---

## Success Metrics

- `bun test` exits 0 with zero failures after all changes.
- `bun run verify:release` exits 0.
- Running `drwn --help` prints `drwn` (not `bgng`) in the usage header.
- `grep -r "beginning-harness\|bgng" --include="*.ts" --include="*.json" cli/ test/ scripts/` returns zero matches (excluding the `.agents/bgng/` path strings in core files and `.claude/worktrees/`). The `.ai/` directory is intentionally excluded from this check.

---

## Open Questions

1. **Domain name.** The docs site URL `thebeginningharness.com` in `docs-astro/astro.config.mjs` — should this become `thedarwinianharness.com` or a different domain? If the domain is not yet decided, update the field to a placeholder and leave a `TODO` comment.
2. **Homebrew.** The Homebrew formula (`test/homebrew-readiness.test.ts` references it) — is there an actual formula file in this repo, or only the readiness test? Confirm before updating.
