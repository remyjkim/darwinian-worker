# ABOUTME: Implementation task plan for the mind substrate split (analysis 115): @darwinian/mind-tools (pure substrate) + @darwinian/mind-starter (solo starter), with all downstream re-points across four repos.
# ABOUTME: Grounded in a file-level touchpoint inventory (exact lines quoted in the investigation record); check off tasks as they land; every phase gates on its verification output.

# Task 74 — Mind Substrate Split: Implementation Plan

**Date**: 2026-07-08
**Status**: Ready — pending Remy's go
**References**: [.ai/analyses/115_mind-substrate-split-architecture.md (ratified design), .ai/analyses/113, .ai/analyses/114]

---

## Goal state

Per analysis 115: `@darwinian/mind-tools` (five mind-operating skills + CONVENTIONS.md + canonical `{l4 md, l5 jsonl}` declaration, **zero seeds**) and `@darwinian/mind-starter` (generic `voice` persona + `collaboration` belief + synced skills + same declaration), both `kind: "card"`, in sibling repos under `darwinian-cards/`. All live manifests, scripts, tests, and forward-looking docs re-pointed; "mind card" freed as the class noun; the composition doctrine in 113 §6 and 114 §1. No CLI changes.

## Success criteria

1. Both cards pass the full pipeline in a fixture: manifest validation → source doctor → publish → project apply (lock floor 0.7.0 via memory/seed content) → `write`.
2. Composed persona for a `[mind-tools, <content-card>]` stack contains **only** the content card's fenced sections (pollution gone by construction — asserted in a test).
3. `mind-starter` applied **alone** provisions a complete working mind (persona + belief + layers).
4. Starter's skills are byte-identical to tools' (sync `--check` green) with `skills.upstream` provenance recorded **and each upstream ref actually resolves** (`drwn card source sync @darwinian/mind-starter` clones the mind-tools bare repo, rev-parses `v0.1.0`, and `git archive`s each `skills/<name>` subpath without error — this exercises `parseUpstreamRef` + the remote P1-5 stood up).
5. believer-interview: blueprints re-pointed; its full suite green; README recipe correct.
6. drwn full suite green; docs 113/114 carry the doctrine; l6 analysis forward-refs updated.

## Grounding facts (from the verified inventory)

- The `mind-card` repo is clean at `56e71b5` (HEAD `feat: mind card v0.1.0 …`; **no git remote configured yet** — see P1-5); **no self-references** to the package name `@darwinian/mind-card` exist inside `skills/` (verified: zero hits) — the rename is manifest + README + CONVENTIONS only. Caveat: `CONVENTIONS.md:4` contains the literal token `mind-card` inside the *filename* of an external design-doc pointer (`110_mind-card-target-architecture.md`) — not a package-name ref; leave it untouched.
- **`@darwinian/mind-card` was never published to the real local store** — no deprecation step needed.
- believer's `.env.*.example` files are empty templates — **no minds were provisioned**; no re-provision step, just a doc note.
- **Primary edit-line anchors** for each touchpoint (from the investigation record; the P4/P5 steps cite these as *anchors* — see the "Touchpoint completeness" bullet below for why the lists are not exhaustive, and re-grep each file at edit time): believer blueprints `card.json:8` ×2, `sync-cards-to-drwn.mjs:1-2,22`, `cards-manifest.test.mjs:43`, `sync-cards-to-drwn.test.mjs:112`, README `:51,112,124-135`; drwn smoke test `:11,32,34-35,40,43,47`; 113 `:270,275,304-305,407`; 114 `:101-102`; l6 analysis `:10,64`.
- **Inventory correction**: `core-mind-store-seed.test.ts` fixtures are in-memory `CardMindContent` — they do NOT touch the real card and their persona/beliefs data is load-bearing for seeding coverage. Do **not** delete them; rename the fixture card to a neutral `@team/seeded-mind` so it stops impersonating the published card.
- Sync template: `darwinian-minds-skills/scripts/sync-card-skills.mjs` (delete-then-copy, `--check` diff mode, manifest cross-validation). `darwinian-minds-skills` is a **submodule** at `darwinian-minds/darwinian-minds-skills` (not a sibling repo), and the script is driven by its own `card-map.mjs` — so the starter's `sync-from-tools.mjs` is a **fresh script using the same mechanism** (delete-then-copy + `--check` diff), not a literal reuse of that file.
- **Upstream-ref format (hard constraint — validated against `cli/core/git-ref.ts:48-61` + `card-store.ts:687-698`)**: every `skills.upstream` value must match `git+<url>#<subpath>[@<rev>]`. The `git+` prefix is **required** (else `UPSTREAM_REF_INVALID`); local paths (`file:`, `/`, `./`, `../`, `file://`) are **rejected** (`UPSTREAM_LOCAL_PATH_REJECTED`). The `<subpath>` is a path *inside* the upstream repo (for mind-tools: `skills/mind-read`, `skills/mind-remember`, … — it feeds `git.extractSubpathToDir` at `card-source-sync.ts:149`); `<rev>` is `@`-separated after the subpath. So the starter's refs must be `git+https://github.com/<org>/mind-tools.git#skills/<skill>@v0.1.0`. **Not** `github:<org>/mind-tools#v0.1.0` (that is the *worker-deploy* URL format, a different resolver — it would fail publish). P2-2 reflects this.
- **Remote prerequisite**: the `mind-tools` repo has **no git remote** today. Because `skills.upstream` rejects local paths, mind-tools must be pushed to a reachable remote *before* the starter can publish with valid provenance — see P1-5.
- **Ratification status**: analysis 115 line 8 currently reads *"Draft — for ratification before execution"* and §6 poses five explicit ratification asks (names, the `collaboration`-belief move, repo strategy, migration scope, execution go). Remy's go on this plan constitutes ratification of those asks; record that fact when flipping 115's status in P5-4.
- **Touchpoint completeness (line refs are anchors, not exhaustive)**: the line numbers in P4/P5 pin the *primary* edit per file but several live files carry additional `mind-card` / `@darwinian/mind-card` occurrences. In each file, **replace every occurrence** (grep-anchored), not just the cited lines. Known additions beyond the cited anchors: believer `sync-cards-to-drwn.mjs` `:16,24,75` (**`:24` is the `name: 'mind-card'` constant — load-bearing**, not cosmetic), `cards-manifest.test.mjs:41`, `sync-cards-to-drwn.test.mjs:109`, `believer-worker/card.json:5` (description), README `:48,49,149`; doc 113 `:137,282,310,325`; 114 `:179`.

## Phases

### P1 — `mind-tools` (rename + slim the existing repo)

- [ ] P1-1: `mv /Users/pureicis/dev/darwinian-cards/mind-card /Users/pureicis/dev/darwinian-cards/mind-tools` (repo dir rename; git history intact inside).
- [ ] P1-2: `card.json`: name → `@darwinian/mind-tools`; description → "The mind substrate: agent skills and conventions for operating a worker's BeginningDB mind (read, remember, share, forget, search) plus the canonical memory-layer declaration."; **delete** `persona` and `beliefs` sections; keep skills include, memory decl, `stability: experimental`, version `0.1.0`.
- [ ] P1-3: `git rm -r persona beliefs` (content moves to starter in P2 — copy out first).
- [ ] P1-4: CONVENTIONS.md: append the §3.2 doctrine block (verbatim from 115); README rewrite (substrate framing, compose-never-fork, pointer to starter for quickstart).
- [ ] P1-5: **Create the remote and push** — the starter's `skills.upstream` refs (P2-2) reject local paths, so `mind-tools` must be reachable at a real URL before P2 can publish with valid provenance. `git -C mind-tools remote add origin https://github.com/<org>/mind-tools.git`; `git push -u origin main`; `git tag v0.1.0 && git push origin v0.1.0`. Gate: confirm `git ls-remote origin` resolves before starting P2.

### P2 — `mind-starter` (new sibling repo)

- [ ] P2-1: `git init darwinian-cards/mind-starter`; move in `persona/voice/PERSONA.md` + `beliefs/collaboration/BELIEF.md` (from P1-3's copies, unchanged content).
- [ ] P2-2: `card.json` (note: `skills.upstream` values use the `git+<url>#<subpath>@<rev>` shape that `parseUpstreamRef` requires — see the grounding-facts constraint; **do not** use the `github:<org>/…#v` worker-deploy URL format, it fails publish):
  ```jsonc
  { "name": "@darwinian/mind-starter", "version": "0.1.0",
    "description": "Batteries-included solo mind card: a generic voice, the memory-discipline belief, and the mind-operating skills — apply alone for a first working mind in minutes.",
    "stability": "experimental",
    "skills": { "include": ["mind-read","mind-remember","mind-share","mind-forget","mind-search"],
                "upstream": { "mind-read":     "git+https://github.com/<org>/mind-tools.git#skills/mind-read@v0.1.0",
                              "mind-remember": "git+https://github.com/<org>/mind-tools.git#skills/mind-remember@v0.1.0",
                              "mind-share":    "git+https://github.com/<org>/mind-tools.git#skills/mind-share@v0.1.0",
                              "mind-forget":   "git+https://github.com/<org>/mind-tools.git#skills/mind-forget@v0.1.0",
                              "mind-search":   "git+https://github.com/<org>/mind-tools.git#skills/mind-search@v0.1.0" } },
    "persona": { "include": ["voice"], "visibility": "internal" },
    "beliefs": { "include": ["collaboration"], "visibility": "internal" },
    "memory": { "l4": { "format": "md" }, "l5": { "format": "jsonl" } } }
  ```
  (`kind` is intentionally omitted — `card-manifest.ts` treats anything not `"blueprint"` as a card, and `worker-deploy.ts:219` materializes it as `kind:"card"`; explicit `kind:"card"` is optional.)
- [ ] P2-3: `scripts/sync-from-tools.mjs` — a fresh script mirroring the **mechanism** of `darwinian-minds-skills/scripts/sync-card-skills.mjs` (delete-then-copy + `--check` diff that exits 1 on drift), copying the **local sibling** `../mind-tools/skills/` + `CONVENTIONS.md` into the starter (the starter has no `card-map.mjs` of its own). The manifest `skills.upstream` refs are provenance-only and not what this script consumes; they record where the synced content came from. Run it once so `skills/` is populated; README (solo quickstart + the never-compose-under-content-cards rule).

### P3 — drwn tests (TDD gate for the split)

- [x] P3-1: RED→GREEN: retarget `test/scenarios-mind-card-smoke.test.ts` → mind-tools (path `:11`, name `:32,40,43,47`; drop persona/beliefs lock assertions `:34-35` — floor assertion stays valid via memory content) and **add** the starter case (path `mind-starter`, asserts persona `voice` + belief `collaboration` + floor + publish). Rename file → `scenarios-mind-cards-smoke.test.ts`. **Deviation**: the starter case asserts apply + lock + publish but **not** doctor — doctor's upstream check clones the private mind-tools remote (~10s + network), which is impractical per-test-run and fragile in CI. Upstream resolution is covered by the dedicated P6 check instead. (The tools case still asserts doctor since mind-tools has no upstream refs — no clone.)
- [ ] P3-2: Add the pollution-regression test: seed a `[tools-shaped, content-shaped]` fixture pair through `seedMind`; assert composed persona contains only the content card's fences (this is criterion 2, cheap at the core tier).
- [ ] P3-3: Neutralize seed-test fixture name (`core-mind-store-seed.test.ts` `@darwinian/mind-card` → `@team/seeded-mind`, all 7 quoted lines) — fixtures keep their persona/beliefs.
- [ ] P3-4: Full drwn suite green.

### P4 — believer-interview re-point

- [ ] P4-1: Re-point **every** `@darwinian/mind-card` / `mind-card` occurrence in the believer repo to `mind-tools` (grep-anchored, not line-limited). Anchors: both blueprints `card.json:8` (composedFrom) and **`believer-worker/card.json:5`** (description); `sync-cards-to-drwn.mjs` `:1-2` (comments), **`:22` (`source` path) and `:24` (the `name: 'mind-card'` constant — load-bearing: path and name must stay consistent or publish wiring breaks)**, plus `:16,75`; `cards-manifest.test.mjs:43` + `:41`; `sync-cards-to-drwn.test.mjs:112` + `:109`.
- [ ] P4-2: README — replace every occurrence (anchors `:51,112,124-135`; also `:48,49,149`) with mind-tools; add a one-line note that pre-split dev minds (if any were provisioned outside the empty templates) should be freshly provisioned.
- [ ] P4-3: `pnpm test` green in believer-interview.

### P5 — docs + doctrine

- [ ] P5-1: 113 — replace every live `@darwinian/mind-card` occurrence (grep-anchored). Anchors: composition example `:270`, §6 doctrine anchor `:275` (the existing no-expansion callout `<div>` opens at `:277` — insert the doctrine block adjacent), publish recipe `:304-305`, references `:407` → substrate + starter entries. Also `:137` (the §1 "reference card" sentence), `:282,:310,:325` (stack recipes).
- [ ] P5-2: 114 — §1 callout: `:101` reference-card sentence → tools/starter split; append the doctrine sentence inside the callout before its closing `</div>` on `:102` (that line is the callout terminator, not a blank append line — edit in place). Also `:179` (stack recipe inside the no-expansion callout).
- [ ] P5-3: l6 analysis 01 (`/Users/pureicis/dev/l6-mind-collections/.ai/analyses/01_mindcard-alignment-assessment-and-migration-strategy.md`) forward-refs (`:10` repo path, `:64` blueprint sketch) → mind-tools.
- [ ] P5-4: 115 status → Implemented (note: it currently reads *"Draft — for ratification before execution"* with five ratification asks in §6; Remy's go on this task plan ratifies them — record that in the status line); note any deviations here per standing rules.

### P6 — end-to-end verification

- [ ] P6-1: Fixture journey (scriptable via the smoke tests + one manual pass): publish tools + starter → **run `drwn card source sync @darwinian/mind-starter` to confirm the `git+…#skills/<skill>@v0.1.0` upstream refs resolve against the remote from P1-5** → apply starter alone → provision against fake/local BGDB → mind has voice + collaboration + layers; apply a `[tools, content]` pair → provision → persona has only content fences.
- [ ] P6-2: Paste verification outputs (drwn suite, believer suite, **`drwn card source sync @darwinian/mind-starter`**, sync `--check`) into the completion note.

## Standing rules

- TDD where tests exist (P3 leads its code); smallest changes; match file styles; historical analyses untouched (the §4 rule from 115).
- Commits at Remy's direction, grouped: tools repo · starter repo · drwn (tests+docs) · believer · l6 doc.
- Deviations from 115 → recorded here, confirmed with Remy.
