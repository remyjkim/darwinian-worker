# Card `instructions` projection gap — investigation

Issue: Notion #24 "Card instructions field is not consumed by regular card apply (deploy-worker only)"
(`39df1fbef8c2813ebc5ceabd396e9040`). Investigated 2026-07-14 against `main` (0.9.0, `b8d16a4`).

## Verdict

The issue is real, but the mechanism is subtly different from the report. The `instructions`
field IS consumed by every local sync — not just the deploy path — and is faithfully
materialized into a canonical artifact. What is missing is the last hop: **no harness-facing
projection ever reads that artifact**, so for a locally applied, subagent-invoked card the
spine never reaches any surface an agent runtime sees. The field is validated, materialized,
and inert.

## Verified pipeline, stage by stage

1. **Validation** — `cli/core/card-manifest.ts:100` (`validateInstructionsField`): shape-only,
   exactly one of `text` (non-empty string) or `path` (safe relative path). Notably,
   `instructions` is NOT in the `blueprintOnly` gate (`card-manifest.ts:128`), unlike
   `identity` — any plain `kind: "card"` may carry it with no warning.

2. **Apply** — `drwn apply` (`cli/commands/project/apply.ts`) → `writeProjectCards`
   (`cli/core/card-project.ts:99`) writes `config.workers` + lock. Every applied spec becomes
   a Worker root regardless of kind (`cli/core/worker-graph.ts:91-96`). The manifest merge into
   project config (`mergeCardManifestsIntoProjectConfig`, `card-project.ts:47`) carries only
   `skills.include`, `servers`, `extensions`, `targets` — `instructions` does not cross.

3. **Sync/materialization** — `syncWorkers` runs on every project sync (`cli/core/sync.ts:644`),
   not only for deploy. `explicitInstructionsForCard` (`sync-worker.ts:94`) reads
   `manifest.instructions` and writes:
   - `<project>/.agents/drwn/generated/workers/<scope>/<name>/instructions.md` per installed root
     (`sync-worker.ts:283`), and
   - `<project>/.agents/drwn/generated/instructions.md` for the active root (`sync-worker.ts:356`).
   Precedence: explicit `instructions` → blueprint `identity.instructions` → aggregated
   stripped `SKILL.md` bodies. Tests confirm this works for plain cards
   (`test/core-sync-worker.test.ts:79-93`).

4. **Projection (the gap)** — the `claude` target projects three surfaces: skills
   (`.claude/skills/<id>`), MCP config, hooks (`cli/core/sync.ts`, `cli/core/targets.ts`).
   There is no agent/system-prompt surface. Repo-wide, `instructions.md` is written by
   `sync-worker.ts` and read only by tests — no CLI command, no target projection, nothing in
   `drwn-command-bridge`. The contract doc even promises the missing hop:
   `docs/contracts/project-worker-v1.md:108` — "The selected root also produces the active
   aggregate instructions used for projection" — but no projection uses it.

5. **Deploy (where it does work)** — `drwn worker deploy` ships full manifests + frozen store
   bytes to the Deploy API (`cli/core/worker-deploy.ts:281`); materialization runs server-side,
   and the deployed worker runtime consumes the generated instructions as its spine. This is
   the only path where `instructions` has an observable effect.

6. **Authoring surface** — `drwn card source set` (`cli/commands/card/source/set.ts`) supports
   only description/version/license/harness.minVersion/stability/lastValidatedWith/
   testStatusBadge; no `--instructions`. The author-card skill documentation never mentions
   the field at all.

## Origin

Commit `6cda9e8` (2026-07-07, "[feat:worker-instructions] emit canonical instructions
artifact") introduced the field, its validation, and the artifact generation in one change.
The projection consumer was never built. The store side of the pipeline is complete; the
store→harness hop does not exist.

## Root cause

The instructions pipeline was designed store-out: validate → lock → generate canonical
artifact → (consumer reads artifact). The deployed-worker runtime is the only consumer that
ever landed. Local harness projection (the surfaces a subagent-invoked card actually
touches) was never extended to carry the artifact, and the authoring surfaces were never
taught the field exists — leaving a validated, documented-by-contract, silently inert field.

## Assessment of the proposals

**Proposal 1 — consume `instructions` in regular apply.** The artifact already exists at a
canonical path; "consuming" it locally means inventing a new harness projection surface for
spines (e.g. `.claude/agents/<name>.md` for Claude Code, plus codex/cursor equivalents),
with managed-path ownership, write-record, and collision semantics. That is a genuine
architecture addition, not a wiring fix. If projected into a skill instead, it converges
with the spine-skill convention and adds little. `--instructions` on `card source set` is a
small independent improvement either way.

**Proposal 2 — formalize spine-skill, warn on `instructions` for non-worker cards.** Small
and honest, but the warning must be precise: the field is not invalid, it is
deploy-runtime-only. A card can legitimately be both subagent-invoked locally and deployed
remotely; a blanket warning would misfire on deploy-focused cards. The accurate framing is
"instructions is consumed by the worker runtime (deploy); local harness projection does not
read it — bundle a spine skill for subagent use."

**Recommendation.** These are not mutually exclusive; they are short-term and long-term.
Short term, proposal 2's documentation half is unambiguous: document the field's actual
contract in the author-card skill and manifest docs, and correct or scope the
project-worker-v1 contract line that promises projection. Whether to also warn, and whether
the local harness should ever grow a spine projection surface (proposal 1), is an
architecture decision to make together — it hinges on whether subagent-invoked workers are
meant to converge with deployed workers on a single spine mechanism, or whether spine-skills
are the intended local answer.
