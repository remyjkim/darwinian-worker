# ABOUTME: Proposed complete Library lifecycle and Library-scoped persistence hardening plan.
# ABOUTME: Separates inventory mutation, references, GC, and atomic Library writes from Worker-root migration.

# Task 81: Library Lifecycle and Scoped Persistence Plan

> **For Codex:** Do not execute until Library ownership and force/GC policies are explicitly approved.

**Status**: Proposed; not implementation-authorized

**Goal**: Give standalone skill and MCP inventory symmetric add/update/remove/reference behavior with guarded, per-record persistence.

**Non-goals**: Card-owned bundled capabilities, machine default policy, project Worker mutation, portable Store transfer, and Card/extraction GC.

---

## 0. Approval gates

Approve:

- which records are first-class Library inventory;
- whether built-in registry MCPs are immutable Library entries or discovery-only definitions;
- reference sources that block removal;
- `--force` semantics for unresolved references;
- GC eligibility and retention;
- Library mutation lock granularity and stale-lock policy.

Safe defaults for review: Card-owned bytes are immutable outside Card commands; removal never edits intent; foreign or ambiguous ownership blocks deletion.

---

### Task 1: Define typed records and reference scanner

**Files:**
- Modify: `cli/core/library.ts`
- Create: `cli/core/library-references.ts`
- Modify: `test/commands-library.test.ts`
- Create: `test/core-library-references.test.ts`

References include machine default IDs, explicit project paths, registered projects, Card sources, and locks. Commands accept repeated `--project <path>` because the registry is incomplete. Stale registered paths are warnings.

### Task 2: Add symmetric skill and MCP lifecycle commands

**Files:**
- Create: `cli/commands/library/remove/skill.ts`
- Create: `cli/commands/library/remove/mcp.ts`
- Create: `cli/commands/library/update/skill.ts`
- Create: `cli/commands/library/update/mcp.ts`
- Modify: `cli/index.ts`
- Create: `test/commands-library-lifecycle.test.ts`

Normal removal of an in-use item returns `LIBRARY_ITEM_IN_USE` and writes nothing. If approved, `--force` removes inventory only and leaves references visible and unresolved. No lifecycle command removes Card-owned bundled content.

### Task 3: Guard Library mutations with scoped atomic persistence

**Files:**
- Modify: `cli/core/fs.ts`
- Modify: `cli/core/store-paths.ts`
- Modify: `cli/core/mcp-library.ts`
- Modify: `test/core-mcp-library.test.ts`

Every Library mutation reaches `assertStoreWritable`. Per-record writes validate complete bytes, write a temporary sibling, flush, and rename. MCP persistence never deletes all sibling records before rewriting. Concurrency behavior follows the approved Library lock policy. Machine config, Card-store, credential, and project-state transaction behavior remain outside this task.

Failure-injection tests prove previous bytes survive and no temporary files remain.

### Task 4: Add scoped Library GC

**Files:**
- Create: `cli/commands/library/gc.ts`
- Modify: `cli/index.ts`
- Modify: `test/commands-library-lifecycle.test.ts`

`library gc --dry-run` reports only approved standalone inventory candidates. `--prune` removes records with zero references and never delegates to Card/extracted-tree GC.

### Task 5: Document and verify

**Files:**
- Modify: `README.md`
- Modify: `docs/cli-quickref.md`
- Modify: `.ai/knowledges/01_agents-cli-usage-guide.md`

Verification after approval:

```bash
bun run typecheck
bun test
bun run verify:release --json
```

Completion requires the approval record, failure-injection evidence, reference scan fixtures, and read-only/concurrency tests.
