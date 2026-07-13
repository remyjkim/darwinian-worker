# ABOUTME: Completion summary for Task 76 — the mind substrate split into @darwinian/mind-tools (pure substrate) + @darwinian/mind-starter (solo quickstart).
# ABOUTME: Records shipped scope across five repos, verification evidence with exact outputs, deviations from the ratified design, residual intentional old-name matches, and deferred operator steps.

# Task 76 — Completion: Mind Substrate Split

**Status**: Completed
**Completed**: 2026-07-09
**Ratified design**: `.ai/analyses/115_mind-substrate-split-architecture.md` (status flipped to Implemented)
**Plan**: `.ai/tasks/76_mind-substrate-split-implementation-plan.md`
**Base**: `darwinian-worker` `52f286b` (`chore(release): v0.7.0`)
**References**: [.ai/analyses/113_mind-card-engineering-guide.html, .ai/analyses/114_drwn-worker-cli-architecture.html, .ai/analyses/115_mind-substrate-split-architecture.md]

---

## Summary

The single `@darwinian/mind-card` reference card — which conflated the mind *substrate* (five skills, CONVENTIONS.md, layer declarations) with *content* (a generic `voice` persona and a `collaboration` belief) — is split into two:

- **`@darwinian/mind-tools`** — the pure substrate. Skills + conventions + the canonical `{l4 md, l5 jsonl}` declaration. **Zero persona, zero beliefs.** Composed by every worker blueprint that wants a mind.
- **`@darwinian/mind-starter`** — the batteries-included solo card. The `voice` persona + `collaboration` belief (moved from the old card) + the five skills synced from mind-tools. Applied **alone** for a five-minute first mind.

The split removes substrate-voice pollution by construction: a composed mind's `persona.md` now contains **only** its content card's fenced sections. "Mind card" is freed as the class noun for any mind-bearing card; neither published card owns the term. No CLI changes — validation, seeding, composition, and checkpoint behave identically.

## What shipped

### Two new card repos (both private, under `curation-labs`)

| | `@darwinian/mind-tools` | `@darwinian/mind-starter` |
|---|---|---|
| **Remote** | `https://github.com/curation-labs/mind-tools.git` | `https://github.com/curation-labs/mind-starter.git` |
| **Tag** | `v0.1.0` (`0ab8e6c536e7`) | `v0.1.0` (`4cc81ffa1af9`) |
| **Main commit** | `0ab8e6c` (`feat(mind-tools): split into the pure mind substrate`) | `4cc81ff` (`feat(mind-starter): batteries-included solo mind card`) |
| **Origin** | The existing `mind-card/` repo **renamed** (skills git history preserved) | New sibling repo |
| **Persona** | none | `voice` (the generic entry, moved verbatim) |
| **Beliefs** | none | `collaboration` (the memory-discipline belief, moved verbatim) |
| **Skills** | canonical home (the five mind-operating skills) | synced copies (byte-identical, provenance in `skills.upstream`) |
| **CONVENTIONS.md** | canonical home + the substrate doctrine (§"Substrate doctrine") | synced copy |
| **Published store path** | `~/.agents/drwn/extracted/fe4c558e2ecd6c0965912123747808d8041cc28a` | `~/.agents/drwn/extracted/f7bd6563ff2155e1a511a5bc078bd67b5d9a8e24` |
| **Integrity** | `sha256-835e65e8…cfaa59f` | `sha256-f6310024…dc3ccf8` |

The starter's `skills.upstream` provenance (validated at publish, resolved at sync):

```jsonc
"upstream": {
  "mind-read":     "git+https://github.com/curation-labs/mind-tools.git#skills/mind-read@v0.1.0",
  "mind-remember": "git+https://github.com/curation-labs/mind-tools.git#skills/mind-remember@v0.1.0",
  "mind-share":    "git+https://github.com/curation-labs/mind-tools.git#skills/mind-share@v0.1.0",
  "mind-forget":   "git+https://github.com/curation-labs/mind-tools.git#skills/mind-forget@v0.1.0",
  "mind-search":   "git+https://github.com/curation-labs/mind-tools.git#skills/mind-search@v0.1.0"
}
```

### Skill sync (`mind-starter/scripts/sync-from-tools.mjs`)

A fresh script mirroring the **mechanism** of `darwinian-worker-skills/scripts/sync-card-skills.mjs` (delete-then-copy + `--check` drift that exits 1 on drift), copying the local sibling `../mind-tools/skills/` + `CONVENTIONS.md` into the starter. The manifest `skills.upstream` refs are provenance-only and not what this script consumes. Manifest-sanity runs `sync-from-tools.mjs --check` so drift can't publish silently.

### `darwinian-worker` (commit `a80550f`)

- **Smoke test retargeted** (`test/scenarios-mind-card-smoke.test.ts` → `scenarios-mind-cards-smoke.test.ts`, plural): a mind-tools case (asserts apply + lock with **no** persona/beliefs + doctor + publish) and a mind-starter case (asserts apply + lock with voice + collaboration + skills + floor + publish).
- **Pollution regression** (`test/mind-substrate-pollution.test.ts`, 3 tests): a `[tools, content]` stack composes a persona with only the content card's fences; a contrast test proves the split is load-bearing (the pre-split shape WOULD pollute); a seed-tier test confirms `seedMind` writes only the content card's fence.
- **Real-content E2E** (`test/mind-substrate-e2e.test.ts`, 2 tests): provisions via `seedMind` against the **real** card content (loaded via `loadCardMindContent`) on a `FakeBgdb` — starter-alone seeds voice + collaboration + layers; `[tools, content]` seeds only the content voice.
- **Seed fixture neutralized** (`test/core-mind-store-seed.test.ts`): the in-memory fixture card renamed `@darwinian/mind-card` → `@team/seeded-mind` (all 7 references); fixtures keep their persona/beliefs data (load-bearing for coverage).
- **Docs**: 113 re-pointed (8 live refs + substrate doctrine callout added); 114 re-pointed (§1 callout + stack recipe); 115 status → Implemented + §7 implementation record.

### `believer-interview` (commit `bc32225`)

Both worker blueprints (`believer-worker`, `chief-worker`) `composedFrom` re-pointed `@darwinian/mind-card@^0.1.0` → `@darwinian/mind-tools@^0.1.0`. `sync-cards-to-drwn.mjs` (source path + name constant + comments), `cards-manifest.test.mjs`, `sync-cards-to-drwn.test.mjs`, and README (layout, recipes, stack lines, deploy note) follow. `.env.*.example` files confirmed empty — no minds were provisioned, so no re-provision step.

### `l6-mind-collections` (commit `de51bd3`)

Analysis 01 forward-refs re-pointed: the CONVENTIONS.md repo path and the dalio-worker blueprint sketch → `@darwinian/mind-tools`.

## Deviations from the ratified design (115 §7)

1. **Upstream-ref format corrected.** §3.3 sketched the refs as `github:<org>/mind-tools#v0.1.0` — the *worker-deploy* URL format. Publish validation (`cli/core/git-ref.ts:parseUpstreamRef`) requires `git+<url>#<subpath>[@<rev>]` and rejects local paths (`UPSTREAM_LOCAL_PATH_REJECTED`). The implemented form is `git+https://github.com/curation-labs/mind-tools.git#skills/<skill>@v0.1.0` (subpath = in-repo skill dir, feeds `git archive` at `card-source-sync.ts:149`). Discovered during the execution-readiness audit before any code was written; the plan was patched first, then executed.
2. **Starter smoke test does not assert `doctor`.** `card source doctor` runs `checkCardSourceUpstream`, which clones the mind-tools remote (~10s + network) — impractical per-test-run and fragile in CI. The starter case asserts apply + lock + publish (publish validates every upstream ref via `parseUpstreamRef`); upstream *resolution* is covered by the dedicated E2E check. The tools case still asserts doctor (no upstream refs → no clone).
3. **`sync-from-tools.mjs` is fresh, not reused.** The `darwinian-worker-skills/scripts/sync-card-skills.mjs` template is `card-map.mjs`-driven and syncs from the skills repo's own root; the starter needs a single-target copy from its sibling. Same mechanism (delete-then-copy + `--check` drift), different shape.

## Test and Verification Evidence

### Baseline (before any change)

- **drwn**: `1293 pass / 5 skip / 0 fail` across 258 files; mind-card smoke test **runs** (not skipped — `existsSync` guard passes).
- **believer**: `135 pass / 0 fail` across 22 files.

### Split-relevant tests (post-change)

```bash
bun test test/scenarios-mind-cards-smoke.test.ts \
          test/core-mind-store-seed.test.ts \
          test/mind-substrate-pollution.test.ts \
          test/mind-substrate-e2e.test.ts
```

Result: **10 pass / 0 fail** (55 expect calls).

### Full drwn suite (post-change)

```bash
bun test
```

Result: **1299 pass / 5 skip / 0 fail** across 260 files (`4839 expect() calls`, ~188s).

Net **+6 tests / +2 files** from baseline (1293 pass / 258 files): the singular smoke test (1 test) was replaced by the plural smoke (2 tests, +1) and augmented with the pollution regression (3 tests, +1 file) and the real-content E2E (2 tests, +1 file) — 1+3+2 = +6 tests, +2 files. The seed test was modified in place (fixture rename, no count change). The 5 skips are the env-gated live-integration tests (real BGDB server, live GitHub catalog, real DPAPI), unchanged from baseline.

One pre-existing flake surfaced on a first run: `quality gate > verify:release script exists and returns exit 0 in test mode` (it re-runs the suite internally and is timing-sensitive). It passed in isolation and on clean retry — not caused by these changes.

### believer suite (post-change)

```bash
cd /Users/pureicis/dev/believer-interview && pnpm test
```

Result: **135 pass / 0 fail** across 22 files (same count as baseline — the re-pointed assertions pass).

### Upstream refs resolve against the real remote

```bash
drwn card source sync @darwinian/mind-starter --json
```

```json
{
  "synced": ["mind-read", "mind-remember", "mind-share", "mind-forget", "mind-search"],
  "stale": [],
  "moved": []
}
```

This clones the mind-tools bare repo, rev-parses `v0.1.0`, and `git archive`s each `skills/<name>` subpath — proving the `git+…#skills/<skill>@v0.1.0` refs are well-formed *and* resolvable end-to-end.

### Skill byte-identity + drift detection

```bash
cd /Users/pureicis/dev/darwinian-cards/mind-starter && node scripts/sync-from-tools.mjs --check
```

```text
✓ Starter skills + CONVENTIONS are in sync with mind-tools.
```

All five skills + CONVENTIONS.md are byte-identical between the two repos (`diff -rq` confirmed per-skill).

### Both cards publish through the real pipeline

```bash
drwn card publish @darwinian/mind-tools     # → Published @darwinian/mind-tools@0.1.0
drwn card publish @darwinian/mind-starter   # → Published @darwinian/mind-starter@0.1.0
```

Publish runs `parseUpstreamRef` on every `skills.upstream` value (the load-bearing format check); both succeed.

## Residual old-name scan

The **package** ref `@darwinian/mind-card` is gone from every authored file (zero hits across mind-tools, mind-starter, believer authored files, and docs 113/114). The bare **token** `mind-card` survives only in intentional places:

- **`CONVENTIONS.md:4`** and **`README.md:38`** (mind-tools) — the token `mind-card` inside the *filename* of external design-doc pointers (`110_mind-card-target-architecture.md`). Not package-name refs; left untouched.
- **`test/mind-substrate-pollution.test.ts:61,70`** — the pre-split regression fixture intentionally names the polluted substrate `@darwinian/mind-card` (the very shape being guarded against).
- **believer `.ai/` docs** (5 files: analyses 02/03/04, tasks 01_*) — historical analysis/planning artifacts, intentionally untouched per the §4 rule ("leave dated analyses as historical record").
- **l6 analysis 01** — `@remyjkim/l6-mind-card` (a **different** card) and the class-noun use of "mind-card" / the external doc filename. All correct to leave.
- **Historical `.ai` docs** (72, 105–112, completion logs) — record what was true when written; untouched per §4.

Representative scan (package ref — expect zero hits):

```bash
grep -rn "@darwinian/mind-card" \
  /Users/pureicis/dev/darwinian-cards/mind-tools/{card.json,README.md,skills,CONVENTIONS.md} \
  /Users/pureicis/dev/believer-interview/{cards,scripts,src,web,README.md} \
  /Users/pureicis/dev/darwinian-minds/.ai/analyses/11{3,4}_*.html
# → exit 1, no matches
```

Bare-token scan (the external-doc filenames — intentional):

```bash
grep -rn "mind-card" /Users/pureicis/dev/darwinian-cards/mind-tools/{README.md,CONVENTIONS.md}
# CONVENTIONS.md:4: …110_mind-card-target-architecture.md
# README.md:38:   …110_mind-card-target-architecture.md
```

## Scope boundaries honored

- **No CLI changes.** The split is pure card-land; `validateCardManifest`, `seedMind`, `expandBlueprints` (incl. `BLUEPRINT_RECURSION`), `composePersona`, and checkpoint all behave identically.
- **`@darwinian/mind-card` was never published** to the real store — confirmed via `drwn card list` and `drwn card show @darwinian/mind-card` (`CARD_NOT_FOUND`). No deprecation step was needed.
- **`kind` intentionally omitted** from both card manifests — `card-manifest.ts` treats anything not `"blueprint"` as a card, and `worker-deploy.ts:219` materializes it as `kind:"card"`.
- **Historical analyses untouched** (the §4 rule from 115: update live manifests/code/scripts and forward-looking docs; leave dated analyses as historical record).
- **No unrelated work swept into commits.** The believer and l6 repos had extensive prior uncommitted work (card reorgs, chief-worker feature, web changes); only the files this task touched were staged.

## Commits (5 total, grouped per repo)

| Repo | Commit | Pushed? |
|---|---|---|
| `curation-labs/mind-tools` | `0ab8e6c` `feat(mind-tools): split into the pure mind substrate` | ✅ (needed for upstream refs) |
| `curation-labs/mind-starter` | `4cc81ff` `feat(mind-starter): batteries-included solo mind card` | ✅ (needed for upstream refs) |
| `darwinian-worker` | `a80550f` `test(mind): retarget smoke + guard substrate pollution…` + docs | ✅ `origin/main` via PR #44 |
| `believer-interview` | `bc32225` `feat(cards): re-point worker blueprints to @darwinian/mind-tools` | ⏸ local (per Remy) |
| `l6-mind-collections` | `de51bd3` `docs: re-point alignment assessment to @darwinian/mind-tools` | ⏸ local (per Remy) |

The two card repos and `darwinian-worker` were pushed. The starter's `skills.upstream` refs reject local paths, so mind-tools had to be reachable at a real URL. The believer and l6 commits remain local, ready for review.

## Deferred operator steps

1. **Push the two remaining local commits** (believer-interview and l6-mind-collections) once reviewed.
2. **Re-provision believer/chief dev minds** if any were provisioned outside the empty `.env.*.example` templates (none were — confirmed empty). A rebase won't retarget fences (`card="@darwinian/mind-card"`); a fresh provision is the honest path pre-production.
3. **Bump believer blueprints' `composedFrom`** from `@darwinian/mind-tools@^0.1.0` to a concrete version once a stable cut is made (currently pinned to the experimental `^0.1.0`).
4. **Update the Notion home** minds bullet — it doesn't name the card (confirmed), so no change needed unless the split is called out explicitly.

## Acceptance status

| Criterion (from task 76) | Status |
|---|---|
| Both cards pass full pipeline: manifest → doctor → publish → apply → write (lock floor 0.7.0) | Done (smoke tests; floor `MINDS_MIN_DRWN_VERSION = "0.7.0"` asserted) |
| `[tools, content]` composed persona contains only content card's fences (pollution gone by construction) | Done (pollution test + real-content E2E) |
| `mind-starter` applied alone provisions a complete mind (persona + belief + layers) | Done (real-content E2E: voice + collaboration + l4/l5) |
| Starter skills byte-identical to tools' (sync `--check` green) with `skills.upstream` provenance recorded | Done (`--check` green; all 5 byte-identical; refs resolve via `card source sync`) |
| believer-interview blueprints re-pointed; full suite green; README recipe correct | Done (135 pass / 0 fail; zero `mind-card` in authored files) |
| drwn full suite green; docs 113/114 carry the doctrine; l6 forward-refs updated | Done (1299 pass / 0 fail; doctrine in 113 §6 + 114 §1; l6-01 re-pointed) |
| 115 status → Implemented; deviations recorded | Done (§7 implementation record with 3 deviations) |
