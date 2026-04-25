---
name: incremental-commits
description: Use when committing multiple changed files - group related changes logically, write human-authored commit messages without AI assistance traces, coordinate with other coworkers
---

# Incremental Commits

## Overview

Commit related changes in logical groups with clear, human-authored messages that explain the change without revealing AI assistance. Coordinate with other coworkers to avoid interleaved commits.

## When to Use

Use when:
- Multiple files have been modified
- Changes span different features or fixes
- Need clean git history for review
- Working with AI assistance but need professional commits
- Multiple coworkers are working on the same repository

**Don't use when:**
- Single atomic change across all files
- Emergency hotfix needing one commit

## Multi-Coworker Coordination

### Before Starting Commits

```bash
# 1. Check recent commit history
git log --oneline -20

# 2. Look for patterns:
#    - Are there commits from other coworkers?
#    - What features/areas are they working on?
#    - Are commits using branch flags?

# 3. Choose your branch flag to avoid conflicts
# If you see: [fix:auth] messages, use different flag like [fix:relay]
```

### Branch-Flag Pattern

Use branch-like flags to identify your work stream:

```bash
# Format: [type:feature] description
git commit -m "[fix:relay] handle missing DATABASE_URL_POOLED gracefully"
git commit -m "[test:relay] add fallback scenario coverage"
git commit -m "[doc:relay] document broadcast vs stream patterns"
```

**Common flags:**
- `[feat:component]` - New feature for specific component
- `[fix:component]` - Bug fix in component
- `[test:component]` - Tests for component
- `[refactor:component]` - Code restructuring in component
- `[doc:component]` - Documentation for component

### Avoiding Interleaved Commits

```bash
# Before committing, check if another coworker just committed
git log --oneline -5

# If you see alternating pattern like:
# abc1234 [fix:auth] validate tokens
# def5678 [feat:ui] add loading state    # Different coworker
# 789abcd [fix:auth] handle refresh      # Back to first coworker

# STOP and either:
# 1. Complete your full set of commits before they continue
# 2. Wait for them to finish their commit series
# 3. Coordinate via chat/comments
```

## Core Pattern

```bash
# 1. Check recent history and choose branch flag
git log --oneline -10
# Decide on your branch flag based on what others are doing

# 2. Check status and group mentally
git status --short

# 3. Stage related files together
git add <related-files>

# 4. Commit with branch flag and human-authored message
git commit -m "[type:component] what changed and why

- First specific change
- Second specific change
- Impact or benefit"

# 5. Repeat for next logical group with same branch flag
```

## Commit Message Guidelines

### Format
```
[type:component] concise summary

- Bullet point for specific change
- Another specific change
- Impact or outcome
```

### Types (always with component)
- `[fix:component]` - Bug fixes in component
- `[feat:component]` - New features in component
- `[test:component]` - Test additions/fixes for component
- `[doc:component]` - Documentation for component
- `[refactor:component]` - Code restructuring in component
- `[chore:component]` - Build/tool changes for component
- `[style:component]` - Formatting only in component

### Language Rules

**Never include:**
- "Generated with", "Created by", "Assisted by"
- AI tool names (Claude, GPT, Copilot)
- Emojis unless explicitly requested
- Time references ("recently", "just", "now")
- Meta-commentary about the commit process

**Always include:**
- What changed (not how you made it)
- Why it matters (impact/benefit)
- Technical details when relevant

## Grouping Strategy

### By Component (single coworker focus)
```bash
# Check who's working on what
git log --oneline -10
# You see: [feat:ui] commits, so you choose api component

# Group 1: Backend fixes
git add src/api/*.ts src/db/*.ts
git commit -m "[fix:api] handle database connection failures

- Add retry logic for transient errors
- Return proper error codes to client
- Log connection issues for monitoring"

# Group 2: API tests
git add test/api/**/*.test.ts
git commit -m "[test:api] add connection failure scenarios

- Test retry mechanism
- Verify error responses
- Check logging output"

# Group 3: API documentation
git add docs/api/*.md
git commit -m "[doc:api] document error handling patterns

- List all error codes
- Explain retry behavior
- Add troubleshooting guide"
```

### By Feature (coordinated work)
```bash
# Check current work streams
git log --oneline -10
# You see: no auth commits recently, safe to use

# Group 1: Core feature implementation
git add src/auth/*.ts src/types/auth.ts
git commit -m "[feat:auth] implement JWT refresh tokens

- Add refresh token generation
- Store tokens securely
- Handle token rotation"

# Group 2: Feature tests
git add test/auth/*.test.ts
git commit -m "[test:auth] add JWT refresh token tests

- Test token generation
- Verify rotation logic
- Check expiry handling"

# Group 3: Documentation
git add docs/auth.md README.md
git commit -m "[doc:auth] document JWT refresh flow

- Explain token lifecycle
- Add API examples
- Include security notes"
```

### By Fix Scope (hotfix scenario)
```bash
# Quick check for active work
git log --oneline -5
# Clear to proceed with relay fixes

# Group 1: Root cause fix
git add src/relay/handler.ts src/relay/validator.ts
git commit -m "[fix:relay] handle missing DATABASE_URL_POOLED

- Add existence check before database operations
- Return empty worker list when unavailable
- Prevent production failures"

# Group 2: Test updates for fix
git add test/relay/*.test.ts
git commit -m "[test:relay] add database fallback tests

- Test missing DATABASE_URL_POOLED scenario
- Verify graceful degradation
- Check error logging"
```

## Example Workflow

```bash
# First, check recent activity
git log --oneline -10
# abc1234 [feat:ui] add dashboard widgets
# def5678 [test:ui] test dashboard components
# 789abcd [fix:auth] validate JWT expiry
# ... older commits

# You see UI and auth work, so choose relay component
# Check what you need to commit
git status --short
# M src/relay/handler.ts
# M src/relay/client.ts
# M test/relay.test.ts
# M test/client.test.ts
# M docs/architecture.md
# ?? docs/troubleshooting.md

# Group 1: Core relay fixes
git add src/relay/handler.ts test/relay.test.ts
git commit -m "[fix:relay] handle missing DATABASE_URL_POOLED gracefully

- Add existence check before database operations
- Return empty worker list when unavailable
- Add comprehensive test coverage
- Prevents production failures when DB not configured"

# Group 2: Client improvements (same component flag)
git add src/relay/client.ts test/client.test.ts
git commit -m "[fix:relay] remove unnecessary protocol messages

- Remove auth message on connection
- Remove subscribe for broadcast endpoints
- Simplify to connect-and-listen pattern
- All 51 tests passing"

# Group 3: Documentation (still relay-related)
git add docs/architecture.md docs/troubleshooting.md
git commit -m "[doc:relay] add architecture and troubleshooting guides

- Document broadcast vs stream patterns
- Explain graceful degradation strategy
- Add production configuration examples"

# Check your commits don't interleave
git log --oneline -5
# 234cdef [doc:relay] add architecture and troubleshooting guides
# 345defg [fix:relay] remove unnecessary protocol messages
# 456efgh [fix:relay] handle missing DATABASE_URL_POOLED gracefully
# abc1234 [feat:ui] add dashboard widgets  # Different coworker
# def5678 [test:ui] test dashboard components  # Different coworker
# ✓ Good: Your relay commits are grouped together
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Committing all files at once | Group by component/feature/scope |
| "Updated files" messages | Describe what changed and why |
| Mentioning AI assistance | Focus on the change itself |
| Huge commit bodies | Keep bullets concise, save details for PR |
| Mixing unrelated changes | Split into separate commits |
| Test files separate from code | Commit tests with their implementation |
| No component in commit message | Always use [type:component] format |
| Interleaving with other coworkers | Check git log first, group your commits |
| Using same component as coworker | Choose different component or coordinate |
| Not checking recent commits | Always run git log before starting |

## Review Before Push

```bash
# Review your commits with context
git log --oneline -15

# Should show logical progression WITH consistent component:
# 423abc1 [doc:relay] add troubleshooting guide
# 892def2 [test:relay] add fallback scenario tests
# 134fab3 [fix:relay] handle missing environment variables
# 567ghi4 [feat:ui] dashboard updates      # Different coworker - OK
# 789jkl5 [test:auth] token validation     # Another coworker - OK

# BAD example - interleaved commits:
# 423abc1 [fix:relay] update handler
# 892def2 [feat:ui] add widget         # Different component
# 134fab3 [fix:relay] add tests        # Back to relay - AVOID THIS!

# If you see interleaving, consider:
# 1. Interactive rebase (if not pushed): git rebase -i HEAD~5
# 2. Squashing related commits: git rebase -i HEAD~3
# 3. Coordinating with coworkers before pushing
```

## Multi-Coworker Scenarios

### Scenario 1: Starting Fresh Work
```bash
git log --oneline -10
# See [feat:auth] and [fix:ui] being worked on
# Choose unused component like [feat:scheduler] or [refactor:db]
```

### Scenario 2: Continuing Your Work
```bash
git log --oneline -10
# See your earlier [fix:relay] commits
# Continue with same component flag for consistency
```

### Scenario 3: Collision Detection
```bash
git log --oneline -5
# Oh no! Someone just started [fix:relay] work
# Options:
# 1. Wait for them to finish
# 2. Use sub-component: [fix:relay-client] vs [fix:relay-server]
# 3. Coordinate: "I'll take relay-client, you take relay-server"
```

### Scenario 4: Emergency Hotfix
```bash
# For urgent fixes, use priority flag
git commit -m "[hotfix:relay] critical: prevent data loss

- Emergency fix for production issue
- Bypasses normal coordination
- Must be merged immediately"

# Others will see [hotfix:*] and know to pause
```

## Red Flags

**Stop and reconsider if thinking:**
- "I'll just commit everything together"
- "The message doesn't matter"
- "I should mention this was AI-assisted"
- "Updated various files" is good enough
- "I'll clean up history later"
- "I don't need to check what others are doing"
- "Component flags are optional"
- "A few interleaved commits won't hurt"

**These indicate:** Step back, check git log, coordinate with team, group properly, write clear messages with component flags

## Summary

The branch-flag pattern (`[type:component]`) serves as a lightweight coordination mechanism when multiple coworkers are committing to the same repository. By checking recent commits and choosing non-conflicting components, you maintain a clean, readable git history without the overhead of constant branching and merging.