# ABOUTME: Proposed target-adapter-specific ambient capability collision policy.
# ABOUTME: Builds on Task 77 diagnostic visibility without imposing a universal write blocker.

# Task 83: Ambient Capability Policy Plan

> **For Codex:** Do not implement write-blocking changes until D2 is approved per target.

**Status**: Proposed; blocked on D2

**Goal**: Classify user-home/project same-ID collisions according to each downstream tool's actual merge semantics and apply only approved enforcement.

**Dependency**: Task 77 provides separate declared and diagnostic ambient state.

---

## 0. D2 decision matrix

For Claude, Codex, and Cursor, approve independently:

- inspected global/project surfaces;
- normalization fields;
- runtime precedence or merge semantics;
- conditions classified as identical, warning, or fatal;
- whether fatal applies only when that target is selected;
- whether `--force` may bypass any category;
- command atomicity when multiple selected targets include one fatal target.

Safe policy until approval: report observations; preserve existing adapter behavior; do not add universal blocking.

Recommended candidate for validation: Codex same-ID global/project definitions with conflicting transport shapes are fatal because deep merge can produce both `command` and `url`. Same-transport differences and Claude/Cursor behavior require evidence before enforcement.

---

### Task 1: Define adapter classification contract

**Files:**
- Modify: `cli/core/ambient-capabilities.ts`
- Create: `cli/core/ambient-policy.ts`
- Create: `test/core-ambient-policy.test.ts`

Proposed result:

```ts
type AmbientDisposition = "identical" | "warning" | "fatal";

interface AmbientCollision {
  target: "claude" | "codex" | "cursor";
  id: string;
  disposition: AmbientDisposition;
  reasonCode: string;
  declaredSource: string;
  ambientSource: string;
}
```

Each adapter owns normalization and reason codes. A generic cross-target equality function cannot declare a collision fatal.

### Task 2: Verify downstream semantics

**Files:**
- Modify: `test/commands-write-codex-conflict.test.ts`
- Create: `test/commands-write-claude-conflict.test.ts`
- Create: `test/commands-write-cursor-conflict.test.ts`

Use renderer/merge fixtures and, where practical, downstream CLI validation to prove the approved matrix. Distinguish same transport with different settings from structurally incompatible transport fields.

No production policy changes until these characterization tests and D2 decisions agree.

### Task 3: Add selected-target preflight

**Files:**
- Modify: `cli/core/sync.ts`
- Modify: `cli/core/mcp.ts`
- Modify: `cli/commands/write.ts`
- Modify: `test/commands-write-codex-conflict.test.ts`
- Modify: `test/commands-write-claude-conflict.test.ts`
- Modify: `test/commands-write-cursor-conflict.test.ts`

Preflight only selected targets. If an approved adapter reports fatal, a multi-target write performs zero mutations across all selected targets. An unselected target can never block `--target`. `--force` follows the explicit D2 matrix and is not borrowed from ownership-drift behavior.

### Task 4: Align status, doctor, and JSON

**Files:**
- Modify: `cli/commands/status.ts`
- Modify: `cli/commands/doctor.ts`
- Modify: `cli/core/diagnostics.ts`
- Modify: `test/commands-status.test.ts`
- Modify: `test/commands-doctor.test.ts`

Human and JSON output show target, both provenances, disposition, reason, and remediation. Authentication or local executable failures remain readiness diagnostics, not definition collisions.

### Task 5: Document and release-gate approved policy

**Files:**
- Modify: `docs/cli-quickref.md`
- Modify: `.ai/knowledges/02_per-project-config-guide.md`
- Modify: `scripts/verify-release-readiness.ts`

Final verification:

```bash
bun run typecheck
bun test
bun run verify:release --json
```

Completion requires the signed D2 matrix and target-specific evidence. Until then Task 77's diagnostic-only behavior remains authoritative.
