# ABOUTME: GATE 2 implementation plan for CL0024 — worker instructions projection (AGENTS.md block, Claude adapter, consent, authoring, diagnostics).
# ABOUTME: Status Blocked pending Review 02: cl0024_review01 returned a no-go; this plan awaits revision against that review's acceptance gate.

# Worker Instructions Projection (I24 · Phase 1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status:** Blocked — Review 01
(`.ai/tasks/cl0024_review01_worker-instructions-projection-execution-readiness.md`)
returned a GATE 2 no-go on 2026-07-22; do not execute until a revision passes Review 02.
**Created:** 2026-07-22 · **Updated:** 2026-07-23

Contracts settled 072326 in the architecture doc that already amend this plan's text:
consent is always explicit (no first-party auto-grant); contribution = explicit
instructions only (bundled-skill fallback retired for the projection path, one
canonical contribution resolver); dual hash domains (content digest vs managed-block
ownership hash); documentation targets `docs-docusaurus/`, not `docs-astro/`; the CI
matrix claim below overstates platform coverage. The full revision lands as Review 02
input.

**References:**
`.ai/analyses/cl0024_worker-instructions-projection_target_architecture.md`,
`.ai/analyses/125_feature_canonical_instructions_projection_decision_analysis.md`,
`.ai/analyses/126_feature_canonical_instructions_architecture_proposal.html`,
`.ai/tasks/cl0024_review01_worker-instructions-projection-execution-readiness.md`,
`darwinian-org/.ai/analyses/08_architect_organization_provisioning_blueprint_target_architecture.md`

**Issue:** #24 (CL Issue Tracker) · **Gate context:** GATE 2 artifact (task plan with TDD
contract) following the GATE 1 architecture set: analyses cl0024 (target architecture,
decisions folded 072226/072326), 125 (decision analysis), 126 (approved report).

**Goal:** Project the composed worker instructions into a consent-gated, drwn-owned
managed block in repository-root `AGENTS.md` (plus the `.claude/CLAUDE.md` import
adapter), close the authoring gap, and make doctor verify delivery — the last hop the
contract has promised since `project-worker-v1.md`.

**Architecture:** Reuse `buildInstructionsArtifact` (the single composer) filtered
through a new per-card instruction-consent class that mirrors hook consent exactly
(lock field, trust flag, digest ack, first-party auto-grant, strict-mode CI failure).
Render the composition into a marker-delimited, hash-sentineled block merged into
`AGENTS.md` via a shared managed-block helper extracted from git-hygiene; write the
one-line Claude adapter when absent. New `"instructions"` projection surface
(project-scope, target-agnostic) rides the existing write-record/cleanup machinery,
with one new cleanup branch for block removal.

**Tech Stack:** Bun + TypeScript, bun:test, Clipanion commands, existing helpers in
`test/helpers.ts` (`scaffoldCliFixture`, `runAgentsCli`, `publishCardWithSkills`,
`installProjectWorkers`).

**Branching (per agreed flow):** implementation branches off the docs-PR branch after
GATE 1 approval; commits are plain conventional commits with no AI attribution.

---

## Testing strategy — the TDD contract (v0.3 GATE 2 requirement)

**Layers**

| Layer | What it proves | Files |
| --- | --- | --- |
| Unit | Managed-block extract/render round-trips; consent validity incl. first-party auto-grant; composer consent filter | `test/core-managed-block.test.ts` (new), `test/core-instruction-consent.test.ts` (new) |
| Integration | AGENTS.md merge preserves user sections; drift throw + `--force`; block cleanup on worker removal; adapter lifecycle; write-record surface rules | `test/commands-write-instructions.test.ts` (new) |
| Command | `card trust --instructions` / `untrust`; `card source set --instructions-*`; `write --apply-claude-adapter` | same file + existing card-command test files |
| Doctor | Block staleness, adapter advisory, Instruction-ID mismatch | `test/core-instructions-drift.test.ts` (new, modeled on `core-mcp-drift.test.ts`) |
| E2E | Publish → install → trust → write → block + adapter on disk; unconsented card excluded with warning; `--strict` fails | extend `test/commands-write-instructions.test.ts` (CLI-spawned, real store) |
| Smoke | Real binary in scratch workspace: full flow + idempotent rewrite byte/mtime check | manual step in Task 14 (commands given) |

**Ordered red→green sequence:** exactly the task order below — every task starts with a
failing test. **Exact commands:** `bun test ./test/<file>.test.ts` per task; full suite
`bun test ./test/`; typecheck `bunx tsc --noEmit`; release gate
`bun run verify:release`. **CI:** the existing CLI CI matrix (Validate + Command bridge
× ubuntu/windows/macos) runs all of the above; no new jobs.

**Non-goals (deliberate, from 124 D5):** machine scope; nested `AGENTS.md`; per-target
instruction variants; the sub-worker workstream (own GATE 1); org-side compilation
(analysis 127); session-start hook injection (B-Q6 shelved).

**Residual risk after this plan:** V1–V3 from 124 §6 stay manual (cursor
non-double-read of `.claude/CLAUDE.md`, opencode AGENTS.md-over-CLAUDE.md preference,
HTML-comment marker ingestion) — one live session each, listed in Task 14; consent-UX
friction is a watch item, mitigated by first-party auto-grant.

---

## Part A — Shared managed-block helper

### Task 1: Extract `managed-block.ts` from git-hygiene (pure refactor)

**Files:**
- Create: `cli/core/managed-block.ts`
- Modify: `cli/core/git-hygiene.ts` (delegate; behavior unchanged)
- Test: `test/core-managed-block.test.ts` (new)

**Step 1 — failing test:**

```ts
// ABOUTME: Pins marker-parameterized managed-block extraction and rendering.
// ABOUTME: The shared idiom for drwn-owned spans inside user-owned files.
import { describe, expect, test } from "bun:test";
import { extractBlock, renderBlock } from "../cli/core/managed-block";

const markers = { start: "<!-- drwn:instructions:start -->", end: "<!-- drwn:instructions:end -->" };

describe("managed-block", () => {
  test("extract returns before/block/after and round-trips through render", () => {
    const doc = `# Mine\n\n${markers.start}\nowned\n${markers.end}\n\n## Also mine\n`;
    const parts = extractBlock(doc.split("\n"), markers);
    expect(parts.block.join("\n")).toContain("owned");
    expect(parts.before.join("\n")).toContain("# Mine");
    expect(parts.after.join("\n")).toContain("## Also mine");
  });

  test("absent markers yield an empty block and full before", () => {
    const parts = extractBlock(["# Mine", ""], markers);
    expect(parts.block).toEqual([]);
    expect(parts.before).toEqual(["# Mine", ""]);
  });

  test("renderBlock wraps content in the markers", () => {
    expect(renderBlock(["body"], markers)).toEqual([markers.start, "body", markers.end]);
  });
});
```

**Step 2:** `bun test ./test/core-managed-block.test.ts` — FAIL (module missing).

**Step 3:** Create `managed-block.ts` by generalizing `extractDrwnBlock`/`renderDrwnBlock`
(`git-hygiene.ts:40-58`): same algorithm, markers passed as `{start, end}`; end-of-block
detection = the end marker (not blank line — note this differs from the gitignore block,
which ends at blank line; parameterize with an `endsAt: "marker" | "blank"` option so
git-hygiene keeps byte-identical behavior via `endsAt: "blank"` + its single marker).

**Step 4:** New test PASS **and** `bun test ./test/core-git-hygiene.test.ts` PASS
(refactor proof). **Step 5:** commit `refactor(core): extract shared managed-block helpers`.

---

## Part B — Instruction consent class (mirrors hook consent)

### Task 2: Lock field + validator

**Files:**
- Modify: `cli/core/card-lock.ts` — `CardLockEntry` gains `instructionConsent?: { consentedAt: string; consentedRange: string }` beside `hookConsent` (`:44-47`); add `validateInstructionConsent` mirroring `validateHookConsent` (`:365-372`) and wire it in the entry parser (`:293,309`).
- Test: locate the card-lock validation suite (`grep -ln "validateHookConsent\|hookConsent" test/*.test.ts`) and add matching cases: valid shape accepted, non-ISO `consentedAt` rejected, round-trip preserved.

TDD steps as Task 1 (failing cases first). Commit
`feat(card): record instruction consent in the lock`.

### Task 3: `isInstructionConsentValid` + first-party auto-grant

**Files:**
- Create: `cli/core/instruction-consent.ts`
- Test: `test/core-instruction-consent.test.ts` (new)

**Behavior (write tests first, one per bullet):**
- A card that contributes no instructions (no `manifest.instructions`, no Blueprint
  `identity.instructions`) is always valid — export
  `cardContributesInstructions(entry)` for reuse by the composer filter and doctor.
- First-party cards are always valid: determine the predicate from `CardOrigin`
  (`card-lock.ts` — read the `origin` union first; first-party = the origin that
  `drwn card publish` records for cards in the local store's sources root,
  `resolveSourcesRoot` in `store-paths.ts`). Pin it with one fixture published via
  `publishCardWithSkills` (its origin IS first-party) and one hand-built lock entry
  with a catalog/git origin.
- Otherwise valid iff `satisfies(entry.version, entry.instructionConsent.consentedRange)`
  — same semver call as `isHookConsentValid` (`hook-consent.ts:7-16`).

Commit `feat(card): validate instruction consent with first-party auto-grant`.

### Task 4: `card trust --instructions` / `untrust`, with digest ack

**Files:**
- Modify: `cli/commands/card/trust.ts` — add `instructions = Option.Boolean("--instructions", false, …)`; require at least one of `--hooks`/`--instructions`; on the instructions path call a new `setInstructionConsent(projectRoot, agentsDir, spec, range)` in `cli/core/card-project.ts` (mirror `setHookConsent` — find it by grep, copy shape).
- Modify: the untrust command (find via `grep -rln "untrust" cli/commands/`) symmetrically.
- Modify: `cli/core/hook-consent-ack.ts` pattern — add `computeInstructionsDigest(card, contentRoot)` hashing the card's instruction contribution (manifest text, or resolved `instructions.path` bytes, plus Blueprint `identity.instructions`), and record the ack with a distinct key prefix. Consent is content-aware, exactly like hooks.
- Test: extend the trust-flow coverage (find via `grep -ln "card.*trust" test/*.test.ts`; `cli-hook-write-e2e.test.ts:56` shows the e2e usage) — trust writes the lock field with default range `^<version>`; `--range` honored; untrust clears; digest ack recorded.

Commit `feat(cli): grant and revoke instruction consent per card`.

---

## Part C — Composition, block, and sync step

### Task 5: Export the composer + consent filter

**Files:**
- Modify: `cli/core/worker-generator/sync-worker.ts` — export `buildInstructionsArtifact`
  (currently module-private; no body changes).
- Create: `cli/core/sync-instructions.ts` (started here, completed in Task 6) with:

```ts
export function composeConsentedInstructions(state: EffectiveState): {
  text: string | null;
  excluded: string[];  // card names skipped for missing consent
}
```

  — filters `state.activeCards` through `isInstructionConsentValid` +
  `cardContributesInstructions` before calling `buildInstructionsArtifact`; returns
  `text: null` when the filtered composition is empty.
- Test (`test/commands-write-instructions.test.ts`, unit-style through the export):
  consented closure composes identically to the generated artifact bytes; an
  unconsented third-party card lands in `excluded` and its text is absent; empty →
  null.

Commit `feat(instructions): compose worker instructions through the consent gate`.

### Task 6: Block render + AGENTS.md merge + adapter

**Files:**
- Modify: `cli/core/sync-instructions.ts`

**Behavior (tests first, integration via `runAgentsCli` in a
`publishCardWithSkills`-style project whose card was published with instructions —
Task 9's authoring flag makes this ergonomic; until then write `card.json` instructions
via the test's source-dir edit, as `cli-hook-write-e2e.test.ts:38-47` does for hooks):**

1. Fresh project → `drwn write` → `AGENTS.md` created containing only the block:
   markers per 124 D1, header comment with `Instruction-ID: <activeWorker>@<version>`
   and `Content-Hash: sha256-…` (hash of the composed text), body = composed bytes.
2. Pre-existing `AGENTS.md` with user sections → block inserted, user bytes preserved
   exactly; rewrite is byte/mtime idempotent.
3. `.claude/CLAUDE.md` absent → written with exactly `@../AGENTS.md\n`, recorded
   managed-content. Present-and-foreign → untouched, warning emitted.
4. Ownership: managed-fields entry `{path: "AGENTS.md", surface: "instructions",
   fields: ["block"], fieldHashes: {block}}`; adapter recorded managed-content with
   surface `"instructions"`.
5. Tampered block + write → drift error naming `--force`; `--force` heals.
6. No active worker / empty composition → no block written; a previously owned block is
   removed (user sections kept) — asserted after Task 8's cleanup branch.

Commit `feat(instructions): project the worker-instructions block into AGENTS.md`.

### Task 7: Write-record surface

**Files:**
- Modify: `cli/core/write-record.ts` — `ProjectionSurface` + `"instructions"`; zod
  `surface` enum; ownership rule: `instructions` → `target === undefined`. The
  machine-scope refinement (`:116`, permits only mcp/skill) already rejects it — add
  the positive assertion to `test/core-write-record-v1.test.ts` (valid project entry;
  invalid with a target; invalid at machine scope).
- Note (verified): `isProjectionOwnershipSelected` needs **no change** — the final
  fallthrough gives instructions full-write-only materialization and retention under
  `--mcp-only`/`--skills-only`/`--target`. Pin that with one row in
  `test/commands-write-partial-ownership.test.ts` (each partial mode preserves
  `AGENTS.md` bytes/mtime and ownership).

Commit `feat(write-record): add the instructions projection surface`.

### Task 8: Pipeline slot + block-aware cleanup

**Files:**
- Modify: `cli/core/sync.ts` — invoke `syncInstructions(state, previousRecord?.managedPaths ?? [])`
  beside `syncWorkers` under the full-write condition
  (`!state.normalized.mcpOnly && !state.normalized.skillsOnly && !state.scopedOptions.target`);
  merge changes/warnings/managedPaths as the other steps do.
- Modify: `cleanupRemovedManagedPaths` (`sync.ts:278+`) — **new branch** (verified gap:
  the managed-fields branch handles only per-server-hash and codex entries; an
  `AGENTS.md` block entry currently falls through silently): for entries with
  `surface === "instructions"` and `kind === "managed-fields"`, load the file, extract
  the block via `managed-block.ts`; if the block hash matches the recorded hash, remove
  the block (delete the file only when nothing but whitespace remains) — else warn
  `preserved user-owned path`.
- Strict mode: when `excluded` is non-empty, push the warning
  (`"Skipping instructions from <card>: missing or out-of-range instruction consent. Run drwn card trust <card> --instructions."`);
  under `drwn write --strict` fail instead (find how `--strict` currently propagates —
  `strictHooks` precedent in `sync-hooks.ts:85-90`; reuse the existing `--strict` flag
  per 124 §5 wording, noting in the PR that it now also covers consent).
- Test: worker removed from config → next write removes the block, keeps user text;
  unconsented card → warning + `--strict` non-zero exit.

Commit `feat(write): materialize and reconcile the AGENTS.md instructions block`.

---

## Part D — Authoring, adapter fix flag, contract docs

### Task 9: `card source set --instructions-text|--instructions-path`

**Files:**
- Modify: `cli/commands/card/source/set.ts` — two new `Option.String` flags, mutually
  exclusive (UsageError when both); text → `instructions: {text}`, path →
  `instructions: {path}` validated relative-safe by the existing
  `validateInstructionsField` (`card-manifest.ts:101-112`) on the next
  publish/validate pass.
- Test: extend the `card source set` coverage (find via
  `grep -ln "source.*set" test/*.test.ts`): each flag round-trips into `card.json`;
  both → usage error; publish of a text-instruction card succeeds and locks.

Commit `feat(card): author instructions from the command line`.

### Task 10: `drwn write --apply-claude-adapter`

**Files:**
- Modify: `cli/commands/write.ts` + `cli/core/sync-instructions.ts`

One deliberate deviation from 124 D2's wording, with reason: doctor is report-only by
stated philosophy (`docs/cli-quickref.md`: "drwn doctor reports issues without fixing
them"), so the explicit fix verb lives on `write` instead. Behavior: with the flag, a
present-but-foreign `.claude/CLAUDE.md` gains the import line inside a drwn marker
block (managed-block helpers, markers `<!-- drwn:claude-adapter:start/end -->`),
recorded as a managed-fields block entry; without the flag behavior is unchanged
(warning only). Removal semantics mirror Task 8. Tests: foreign file untouched by
default; flag applies the marked line preserving user content; cleanup removes only
the marked block.

Commit `feat(write): explicit claude adapter application for foreign files`.

### Task 11: Contract line + user docs + CHANGELOG

**Files:**
- Modify: `docs/contracts/project-worker-v1.md` (~line 108) — the sentence "The
  selected root also produces the active aggregate instructions used for projection"
  becomes a true description: composed worker instructions project as a consent-gated
  managed block in root `AGENTS.md` with a `.claude/CLAUDE.md` import adapter;
  unconsented cards are excluded with a warning.
- Modify: `docs/cli-quickref.md` (Card hooks section gains the instructions-consent
  sibling; write section gains the AGENTS.md surface), `docs-astro` per-project +
  how-apply pages, `CHANGELOG.md` (Unreleased → Added).
- Run the suite (release-readiness "documentation presence" gate rides it).

Commit `docs: describe the worker instructions projection contract`.

---

## Part E — Doctor, verification, closure

### Task 12: Doctor checks + ambient observation

**Files:**
- Modify: `cli/core/diagnostics.ts` — three additions, each test-first in
  `test/core-instructions-drift.test.ts` (copy the `core-mcp-drift.test.ts` fixture
  pattern):
  1. **Block staleness:** recompute `composeConsentedInstructions`; compare to the
     block's `Content-Hash`; report `instructions:<path>` drift.
  2. **Adapter advisory:** `.claude/CLAUDE.md` missing the import (and not
     drwn-marked) → advisory naming `--apply-claude-adapter`.
  3. **Instruction-ID match:** header worker@version ≠ active worker → stale-identity
     finding.
- Modify: `cli/core/ambient-capabilities.ts` — observe root `AGENTS.md`
  (present/absent, drwn block present) so `drwn status` reports delivery state.

Commit `feat(doctor): verify instructions delivery and adapter state`.

### Task 13: E2E + partial/idempotency hardening

**Files:**
- Test: `test/commands-write-instructions.test.ts` — the full ladder in one CLI-spawned
  flow (publish instruction-bearing card → install → write unconsented → trust → write
  → assert block+adapter → rewrite idempotent (bytes+mtime) → tamper→strict-fail→force
  → remove worker → block gone, user text intact). Plus the partial-ownership row from
  Task 7.

Run: `bun test ./test/commands-write-instructions.test.ts` then the full suite +
`bunx tsc --noEmit`. Commit `test(instructions): end-to-end projection coverage`.

### Task 14: Full gates + binary smoke + manual verify items

1. `bun test ./test/` — expect green; `bun run verify:release` — expect 15/15 PASS.
2. Binary smoke (scratch home, pattern from the opencode/cursor cycle):
   `drwn card new` → `card source set --instructions-text "…"` → `card publish` →
   project `drwn add`/`use` → `card trust <card> --instructions` → `drwn write` →
   assert `AGENTS.md` block + `.claude/CLAUDE.md`; re-run write → `shasum` unchanged;
   `opencode debug config` in the workspace boots cleanly with the file present.
3. Manual verify items to schedule (residual risk, 124 §6): V1 cursor-agent session
   (distinct sentinels in AGENTS.md vs .claude/CLAUDE.md — assert no double-read),
   V2 opencode AGENTS.md-over-CLAUDE.md preference live, V3 the "report the active
   Instruction-ID" smoke prompt per harness. Record outcomes on the I24 page.

---

## Execution order & dependencies

1 → (2 → 3 → 4) → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14. Tasks 9–11 can run in
parallel after 8. ~14 tasks, each independently green and committable.
