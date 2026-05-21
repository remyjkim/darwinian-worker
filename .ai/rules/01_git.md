# ABOUTME: Git workflow rules for the iMinds monorepo
# ABOUTME: Covers commit policies, message prefixes, branch naming, and release-safe practices

# Git Rules

## Commit And Push Policy

1. Do not commit any changes unless explicitly instructed to do so.
2. Do not push any changes unless explicitly instructed to do so.
3. Do not commit any docs in `.ai/` unless explicitly instructed to do so.
4. Do not include any notion of AI/LLM usage in commit messages.
5. If `.ai/` has unstaged or unrelated changes, do not include them unless explicitly asked.

## Commit Message Prefixes

Always prefix commit messages with one tag.

### Recommended Prefixes For iMinds

| Prefix | Use For | Typical Paths |
|---|---|---|
| `[sdk]` | SDK/runtime package changes | `packages/sdk/` |
| `[ui]` | Shared UI package changes | `packages/ui/` |
| `[workers]` | Worker runtime/deploy code | `workers/` |
| `[examples]` | Example apps/demos | `examples/` |
| `[site]` | Website/docs site code | `sites/` |
| `[docs]` | Non-`.ai` docs updates | `docs/`, `README.md` |
| `[db]` | DB schema, migrations, persistence behavior | `packages/sdk/**/db`, `drizzle/`, SQL-related changes |
| `[test]` | Test additions/updates only | `**/*.test.*`, `e2e/` |
| `[refactor]` | Refactor without behavior change | any |
| `[perf]` | Performance-focused changes | any |
| `[build]` | Build config/toolchain changes | root configs, bundling, tsconfig |
| `[ci]` | CI/CD workflow and automation config | repo automation config |
| `[chore]` | Maintenance, dependency/version bumps | lockfiles, package metadata |
| `[revert]` | Revert previous commit(s) | any |
| `[other]` | Anything not covered above | any |

### Legacy Prefix Compatibility

These are still acceptable if already in team habit: `[be]`, `[fe]`, `[doc]`, `[style]`.
Prefer the iMinds-specific prefixes above for new commits.

## Commit Hygiene Rules

1. Keep commits scoped and atomic.
2. Separate formatting-only work from behavior changes.
3. Do not mix unrelated packages/features in one commit unless explicitly asked.
4. Commit generated artifacts only when this repo intentionally tracks them.
5. Before commit, verify staged files with `git diff --staged --name-only`.

## Branch Naming Convention

Use descriptive branch names with stable prefixes:

- `feat/<area>-<short-description>`
- `fix/<area>-<short-description>`
- `refactor/<area>-<short-description>`
- `chore/<area>-<short-description>`
- `release/<target-or-date>`
- `hotfix/<short-description>`

Examples:

- `feat/jobs-scheduling`
- `fix/ui-stream-buffer-overflow`
- `refactor/sdk-job-runner-state`

## Staging Branch Convention (If Used)

When staging branches are needed, use:

- `staging-MMDDYYYY-HHmm`

Example:

- `staging-02262026-1430`

Benefits:

- clear creation timestamp,
- deterministic sorting,
- easier stale-branch cleanup.

## Pull Request And Merge Rules

1. Keep PRs focused on one concern.
2. Include tests for behavior changes.
3. Mention breaking changes explicitly in PR description and commit body.
4. Do not squash unrelated work into a single PR.
5. If a branch includes both code and `.ai` docs, explicitly call that out for reviewer awareness.

## Tagging And Release Notes

For release-impacting changes:

1. Use clear commit subject with correct prefix.
2. Include a concise body describing user-visible impact.
3. Note migration steps when API/contracts change.
4. Prefer one release-focused PR over scattered cherry-picks.

## CI/CD And Automation Notes (iMinds)

At the time of this rule update, this repo does not contain checked-in `.github/workflows/` files.

Implications:

1. Do not assume branch-trigger behavior from another repo.
2. Verify active CI/CD triggers directly in GitHub Actions UI before relying on branch/path rules.
3. If CI workflows are added later, extend this file with concrete trigger tables and path filters.

## Safe Git Command Patterns

Use these patterns by default:

- Inspect: `git status --short --branch`
- Review staged: `git diff --staged`
- Stage precisely: `git add <explicit paths>`
- Commit: `git commit -m \"[prefix] concise subject\"`

Avoid destructive commands unless explicitly requested:

- `git reset --hard`
- `git checkout -- <path>`
- force push on shared branches

## Final Pre-Push Checklist

1. Branch name matches convention.
2. Commit messages use correct prefix.
3. No unintended `.ai/` files are staged.
4. Tests relevant to changed paths have been run.
5. Diff is scoped to requested work only.
