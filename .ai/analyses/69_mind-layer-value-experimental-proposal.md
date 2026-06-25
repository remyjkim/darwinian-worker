# Mind Layer Value — Experimental Design Proposal

**Date**: 2026-06-19
**Status**: Draft proposal — for discussion before commitment to any experiment
**Author**: Claude + Remy
**Scope**: Experiments designed to isolate the value contribution of each refinery layer (L3 frameworks, L4 reflections, L5 impressions). Not to evaluate whole-mind quality — that is the Q1–Q3 plan (task 68).
**References**:
- `.ai/analyses/65_mind-card-l3-l4-l5-scenarios.md` (15 scenarios + field evidence from 6 minds)
- `.ai/analyses/68_mind-eval-q1-q3-dataset-and-execution-plan.md` (whole-mind eval plan; infrastructure reused)
- Notion: "Mind Evaluation — v2 (Question-First)" (page `378f1fbef8c281e091e6ee9f201ae483`)
- Mind runtime: `/Users/pureicis/dev/mindblown/backend/apps/api/src/lib/minds-manifest.ts`
- Refinery publish pipeline: `/Users/pureicis/dev/mindblown/backend/tools/refinery-publish/src/index.ts`
- Six refineries: `/Users/pureicis/dev/personal-assistant/v1_1/refineries/{dalio,elon-musk,harari,munger,deutsch,taleb}/`

---

## 0. What this is, and what it isn't

The Q1–Q3 plan measures **whole-mind quality**: does the mind sound like the real person, hold positions under pressure, deliver facts honestly. It treats the mind as a black box.

This proposal opens the box. It asks: **what does each layer actually contribute?** A whole-mind evaluation can pass without telling us whether the persona (L1) is doing all the work and the four memory layers are decorative, or whether L3 frameworks are the load-bearing substance and L4 reflections are just stored conclusions, or whether L5 impressions are doing the heavy lifting and L4 syntheses are rarely accessed.

The distinction matters because layer contributions inform what to invest in. If L4 contributes little, the expensive "refinement pipeline" that produces reflections isn't earning its cost. If L3 alone delivers 80% of authenticity, the L5/L6 retrieval machinery is mostly insurance. The current architecture (target arch in analysis 63) treats all four layers as load-bearing; this proposal tests whether that's true.

**Scope boundary**: this proposal does not measure mind quality, novelty, or collaboration. Q1–Q3 measures quality. Q4–Q5 (out of scope for both that plan and this one) measure novelty and emergence. This proposal measures **per-layer marginal value**.

**Methodological signature**: most experiments here are **ablations or chimeras** — modifications to the mounted refinery before agent execution, compared against the full-refinery baseline. The mind runtime supports this with a small change to `refinery-publish/src/index.ts` (build variant tarballs); no architectural changes required.

**Audience**: this is a research-design proposal, not an execution plan. Each experiment is sized for "is it worth running?" not "exactly how to run it." If the team commits to a portfolio, a sibling execution plan (analogous to task 68) follows.

---

## 1. Five design principles

Before listing experiments, the principles that distinguish good per-layer designs from bad ones.

### 1.1 Hold the question constant, vary the substrate

The classic mistake in ablation studies is varying the question to "match" the layer being tested. If we craft an L3-specific question, then L3 trivially wins. The correct design holds the question constant (drawn from a fixed pool, ideally the Q1 transcript Q&A from task 68's Phase 2) and varies the *substrate* — full mind, mind minus L3, mind minus L4, mind minus L5. This lets us read per-question how much each layer contributed.

### 1.2 Pair every novel experiment with a sanity baseline

Most experiments here include three runs: the variant under test, the full mind (positive control), and B0/B1 from the Q1–Q3 plan (negative control). If a variant scores worse than B1 (role-prompt-only LLM), the experiment is probably broken, not informative.

### 1.3 Layer-strip via tarball mutation, not prompt instruction

A mind told "ignore your L3 framework" doesn't actually ignore it; the framework's content has shaped the model's pretraining and the refinery's mounted content. Real stripping means **rebuilding the refinery tarball without the stripped directory** before mounting. This requires no model surgery, only a `refinery-publish` variant builder.

### 1.4 Distinguish layer presence from layer use

A mind may have all four layers mounted but only read one. Ablation tells you whether removing a layer hurts; it does not tell you whether the present layer is used. The **attribution probes** in §4 are designed to test layer use, not just presence.

### 1.5 Multi-mind beats single-mind for generalization

Most experiments here are designed to run on at least 2–3 minds (Dalio, Harari, Taleb are the strong candidates given their corpus depth — Dalio 8/11/20 files across L3/L4/L5; Harari 9/11/22; Taleb 21/18/47). A finding on Taleb alone is suggestive; a finding consistent across Dalio + Harari + Taleb is informative. Munger and Deutsch can join as confirmation; Musk's refinery is the deepest at L1–L2 but may be uneven at L4/L5.

---

## 2. The design space

Five experiment families, each with a distinct methodological signature.

| Family | What it tests | Method | Cost |
|---|---|---|---|
| **A. Per-layer ablation** | Marginal value of each layer | Strip layer N from refinery tarball; rerun Q1–Q3 subset | Low — reuses Phase 0 + Phase 3 infrastructure |
| **B. Layer-isolation probe** | What can each layer do *alone* | Mount only one layer; force the mind to answer from it | Low — same machinery, different mount config |
| **C. Cross-layer attribution** | Whether layers are actually *used* during inference | Force mind to cite the layer that informed each claim; score against ground-truth | Medium — needs human annotation gold standard |
| **D. Chimera minds** | Whether layers are independent or coupled (does identity live in L3 or L4?) | Build minds with mismatched layers (Dalio L3 + Taleb L4/L5) | Medium — novel; requires careful interpretation |
| **E. Refinement-flow probes** | Whether L5 → L4 → L3 chains actually fire correctly | Inject controlled stimuli; measure layer activation across the chain | High — requires runtime instrumentation |

Families A and B are cheapest and most informative; C, D, E are higher-investment but produce findings not obtainable from ablation alone.

---

## 3. Family A — Per-layer ablation

The classical move. Strip layer N from each refinery; rerun a fixed evaluation; report degradation per layer.

### A.1 Stance-F1 ablation (the headline experiment)

**Question**: How much of the mind's Q1 Stance-F1 score comes from each layer?

**Setup**:
- Use the Q1 Phase 1 dataset from task 68 (post-cutoff stance-labeled Q&A pairs per mind).
- Build five tarball variants per mind:
  - `full` — all layers mounted
  - `no-L3` — strip `03_world_models_frameworks/`
  - `no-L4` — strip `04_reflections_thoughts/`
  - `no-L5` — strip `05_impressions_observations/`
  - `no-L6` — strip `06_raw_data/`
- Plus B0 / B1 from task 68 as floors.

**Measurement**: Stance-F1 per variant per mind. Δ from full = per-layer marginal value.

**Hypotheses to test**:
- **H1a**: Δ(no-L3) > Δ(no-L4) > Δ(no-L5) > Δ(no-L6). L3 is most load-bearing for stance prediction.
- **H1b**: Δ(no-L4) is the biggest drop. Cross-cutting Insight 01 (L4 is the "having an opinion" layer) predicts this.
- **H1c**: Δ(no-L6) is small. L6 is raw text; once L5 impressions are written, the raw fades from direct use.

**Sample size**: 50–80 Q&A pairs per mind × 5 variants × 3 minds = 750–1,200 runs.

**Cost**: ~3,600 LLM calls (~$36) plus sandbox time. Cheapest experiment in this proposal.

**Interpretation gotcha**: if Δ(no-L6) is small, it might mean L6 is genuinely vestigial — OR it might mean GPT-5.4's base training already covers most of L6 content. Run B0 alongside; if B0 ≈ no-L6, the latter explanation holds.

### A.2 Coherence ablation under pressure

**Question**: Which layer keeps the mind from flipping under pressure (Q2 scenario)?

**Setup**:
- Use the Q2 pressure scripts from task 68 (250 pressure turns per mind).
- Same five variants as A.1.
- Measure hard flip rate per variant.

**Hypotheses**:
- **H2a**: Δ(no-L3) is largest. L3 is the layer that holds the line (per Scenario 11).
- **H2b**: Δ(no-L4) is moderate. L4 reflects on prior pressure attempts; without it, the mind has no history of having considered the pressure already.
- **H2c**: Δ(no-L5), Δ(no-L6) are small. Pressure resistance doesn't lean on specific impressions.

This is the most direct test of "L3 is the metabolic layer" (Insight 02) and "L3 threshold gives the mind integrity" (Insight 04).

### A.3 Grounding ablation

**Question**: Does L5/L6 carry grounding, or do L3/L4 reason about facts independently?

**Setup**:
- Use Q3 Half 1 book-QA from task 68.
- Same variants.
- Measure factual accuracy + BM25 grounding rate.

**Hypothesis**:
- **H3a**: Δ(no-L5) and Δ(no-L6) are biggest for grounding. The narrative layers (L3/L4) don't carry receipts.
- **H3b**: Δ(no-L3) is small for factual; L3 doesn't claim facts.

If H3a fails (Δ for stripping L5/L6 is small), L5/L6 may be decorative for grounding — the model is recalling facts from pretraining, not the refinery. This is a finding worth knowing.

### A.4 Knowledge-gap fallback (Scenario 10 instantiated)

**Question**: When L5/L6 have nothing on a domain, does L3 alone produce useful answers?

**Setup**:
- Build a domain-gap question set: 30 questions per mind on domains outside the mind's corpus (e.g., ask Dalio about marine biology; ask Harari about category theory; ask Taleb about ancient Mesopotamian agriculture). Verify each question is genuinely unrepresented in L5/L6 via BM25 retrieval (max score < 0.5).
- Variants: full mind, `no-L5+no-L6` (only L3/L4 mounted), `no-L3+no-L4` (only L5/L6 mounted), B1.
- LLM judge rates each answer on: (a) does it apply a principled framework? (b) does it admit ignorance? (c) does it fabricate?

**Hypotheses**:
- **H4a**: full and `no-L5+no-L6` produce *similar* answers — principled, principled-with-caveats, principled-with-fallback. L3 carries the fallback.
- **H4b**: `no-L3+no-L4` mostly admits ignorance OR fabricates — no framework to fall back on.
- **H4c**: B1 is generic — no domain transfer.

Direct test of "L3 lets the mind handle genuinely novel domains with honest reasoning under known absence" (Insight 02).

### A.5 Cross-source contradiction resolution (Scenario 6 instantiated)

**Question**: Does the mind resolve known internal contradictions consistently across users, or re-derive each time?

**Setup**:
- For each mind, identify 5–10 documented self-contradictions in the source corpus (Dalio 2008 vs 2020 positions; Taleb pre-2007 vs post-2007 attitudes toward Wall Street; etc.).
- Construct prompts: *"You once said X (in [year]). Later you said Y (in [year]). How do you reconcile these?"*
- Variants: full mind, `no-L4`, `no-L5`, B1.
- Measure resolution consistency across 5 independent runs per prompt.

**Hypothesis**:
- **H5a**: full mind produces a *consistent* resolution across runs (a stored L4 synthesis).
- **H5b**: `no-L4` produces *inconsistent* resolutions across runs (re-derived each time).
- **H5c**: variance in resolution across runs is the operationalization of "L4 stores synthesized opinions."

This is one of the cleanest tests of Cross-Cutting Insight 01 (L4 is where the mind has its own synthesized view).

---

## 4. Family B — Layer-isolation probes

Force the mind to answer using only one layer. The opposite move from ablation: instead of "remove and measure damage," it's "keep only this and measure capability."

### B.1 L3-only mode (the "philosopher" variant)

**Setup**:
- Mount refinery as just `01_soul_values/`, `02_principles/`, `03_world_models_frameworks/`. No L4, L5, L6.
- System prompt instruction: *"Answer from your principles and frameworks. Do not invent specific past observations or quotes."*
- Run on the Q1 Phase 1 set + the domain-gap set from A.4.

**What this tests**: the mind's pure interpretive capacity. Can it produce useful, in-voice answers from worldview alone, without grounding?

**Predicted finding**: high stance-F1 on conceptual questions (where the framework determines the answer); low on factual or biographical (where L5/L6 are needed).

**Use case**: this is also a candidate **production mode** — a "fast" mind that doesn't need to mount the full refinery. If quality is acceptable for conceptual conversation, it could ship as a low-latency variant.

### B.2 L4-only mode (the "memoir" variant)

**Setup**:
- Mount only `04_reflections_thoughts/`. No frameworks, no impressions, no raw.
- Run same eval set.

**What this tests**: whether L4 reflections alone produce coherent answers. If they do, L4 is a *complete* representation in itself — frameworks emerged from reflections but are recoverable. If they don't, L4 needs L3 to be intelligible.

**Predicted finding**: low coherence in answers. L4 entries are explicitly framed as tensions (per `_system/cognitive_operations.md`); without L3 lensing, they read as confused.

This is a falsification test of "L4 carries identity." If L4 alone produces a coherent Dalio-feeling answer, identity is at L4. If it doesn't, identity is at L3.

### B.3 L5-only mode (the "scrapbook" variant)

**Setup**:
- Mount only `05_impressions_observations/`. No L3, L4, L6.

**What this tests**: whether the mind can answer using only the navigation/grounding layer. Impressions are claim-shaped but lack the interpretive frame.

**Predicted finding**: answers feel reportorial — "I noticed X, here's a similar case Y" — without synthesis. Like a transcript-summarizer rather than a thinker.

**Surprising hypothesis worth testing**: if L5-only scores nearly as well as full mind on Q1 Stance-F1, then **impressions encode stances and the frameworks above them are decorative for stance prediction**. This would be a major finding.

### B.4 L6-only mode (the "raw" variant)

**Setup**:
- Mount only `06_raw_data/`. No L3, L4, L5.
- This is essentially the "RAG over corpus" variant (B3 baseline from task 68).

This serves a different purpose: it's the **RAG baseline** that the v1 evaluation doc reserved as B3. Comparing full mind to L6-only is the test of whether the refinement pipeline (L5→L4→L3 construction) adds anything over plain retrieval.

**Hypothesis**: full mind beats L6-only by ≥ +0.10 on Stance-F1. If not, the entire refinement pipeline is decorative over raw retrieval.

### B.5 Persona-only mode (style without substance)

**Setup**:
- Mount nothing from the refinery. Use only the persona system prompt (L1 contribution).
- Same as B1 baseline from task 68.

**What this tests**: how much of "sounds like X" is style (persona) vs substance (L3+L4+L5+L6).

Already covered as B1 in the Q1 plan, but worth tracking here as the natural floor of the isolation family.

---

## 5. Family C — Cross-layer attribution

Layer presence is not layer use. A mind with all layers mounted may still answer from only L3 (ignoring L4/L5/L6) or only from L6 (ignoring the refined layers). Attribution probes test what the mind *actually consulted* during inference.

### C.1 Forced-citation probe

**Setup**:
- Modify system prompt to require per-claim layer attribution: *"For each substantive claim in your answer, append [L3], [L4], [L5], or [L6] indicating which layer it came from. If a claim is from pretraining or general knowledge, append [base]."*
- Run on a 100-question set spanning conceptual, opinion, biographical, factual.
- For each (question, layer) pair, score:
  - **Coverage**: did the answer include claims tagged with this layer?
  - **Accuracy**: do the tagged claims actually appear in that layer? (BM25 retrieval over the named layer should return the source.)

**Hypotheses**:
- **H6a**: Conceptual questions show high L3 citation rate.
- **H6b**: Opinion questions show high L4 citation rate.
- **H6c**: Factual questions show high L5/L6 citation rate.
- **H6d**: A non-trivial fraction of claims are tagged [base] — the model is using pretraining, not the refinery. This fraction is a measure of "refinery slip."

**Most interesting finding to look for**: the fraction of claims with **misattributed layers** — the mind claims [L3] but BM25 lookup against `03_world_models_frameworks/` returns nothing relevant. This is a measure of confabulated attribution.

### C.2 Layer-blind vs layer-aware comparison

**Setup**:
- Half the runs use the standard system prompt (no attribution required).
- Half require attribution (as in C.1).
- Measure: does the attribution requirement change answer quality? Does it make answers more grounded (because the mind has to retrieve actual content) or more cautious (because it has to commit to a source)?

**Use case**: if attribution mode preserves quality and increases grounding, it could ship as a production feature — every claim has a citation.

### C.3 Retrieval-trace instrumentation

**Setup**:
- Instrument the CCH sandbox to log every `cat`, `grep`, `ls` issued by the mind during inference (the runtime currently allows shell tools with minimal restriction).
- Aggregate: per turn, which layer directories did the mind read from? How many files? How much total content?

**Hypotheses**:
- **H7a**: Mean reads per turn is approximately 1 each from L3, L4, L5 (the chain fires).
- **H7b**: For conceptual questions, L3 reads dominate; for biographical, L5/L6 dominate.
- **H7c**: Many turns read nothing — the model answers from pretraining and the refinery isn't consulted.

H7c is the most important to track. If the mind frequently skips the refinery, the production system is paying for content it doesn't use.

### C.4 Layer-coverage probe (negative space)

**Setup**:
- Inventory: for each L3 entry, what topics does it cover? Same for L4 and L5.
- Compute coverage gaps per layer: topics covered at L3 but not L4, etc.
- Construct probes targeting gap topics (e.g., a question where the mind has an L3 framework but no L4 reflection).
- Test: does the answer feel "frameworks-but-no-stake" — abstract correct but lacking conviction?

This measures whether L4's *absence* on a topic is detectable in output.

---

## 6. Family D — Chimera minds

Build minds with mismatched layers across the six available minds. The most novel family; produces findings unobtainable any other way.

### D.1 Layer swap (Dalio L3 + Taleb L4/L5)

**Setup**:
- Build a tarball: Dalio's L1, L2, L3 + Taleb's L4, L5, L6.
- Run on Q1 Phase 1 set scoped to economics / probability topics (where both Dalio and Taleb have content).
- Two judging tasks:
  - **Identity attribution**: blind judges (LLM + human spot-check) classify each answer as "more Dalio" or "more Taleb."
  - **Coherence score**: does the answer feel coherent or like multiple personalities?

**Hypotheses**:
- **H8a — Identity in L3**: judges attribute the chimera as "Dalio" (L3 carries identity).
- **H8b — Identity in L4**: judges attribute as "Taleb" (L4 reflections carry identity).
- **H8c — Schizophrenic**: judges find the answer incoherent (layers don't compose).

H8a vs H8b is the central question. The answer determines whether the **framework** or the **wrestling history** carries identity. Either finding has product implications:
- If L3 carries identity, marketing/branding can focus on the framework. The mind is the framework.
- If L4 carries identity, the mind is the biography. Less brandable, more personal.

### D.2 Persona swap

**Setup**:
- Same as D.1 but swap L1 (persona) instead of L3. Taleb's persona + Dalio's L3/L4/L5.
- Hypothesis: identity attribution flips to whoever's persona is mounted. Style is sticky.

If H8a (L3 carries identity) holds in D.1 but D.2 also flips attribution to persona, then **persona overrides L3 for identity attribution under blind judging**. Style is what readers actually notice, even though substance is what they should.

### D.3 Multi-mind L3 amalgam

**Setup**:
- Mount Dalio's L3 + Harari's L3 + Taleb's L3 simultaneously, with Dalio's L4/L5/L6.
- What does the mind do? Pick a framework? Average? Refuse?
- This is partly a stress test for the architectural rule "one mind per session" (current v1 constraint per analysis 63).

This is mostly a curiosity experiment but informs Q5 (Mind collaboration / emergence) downstream.

### D.4 Pre-cutoff vs post-cutoff L4

**Setup**:
- Snapshot Dalio's refinery as of 2026-01-01 vs 2026-06-01 (two months of L4 growth).
- Run identical questions through both.
- Measure: does the answer differ in interpretable ways? Can the difference be traced to specific L4 entries added between the snapshots?

This tests the **time-stamp utility** of L4 (Scenario 12; Cross-cutting Insight 05) and validates that L4 growth produces observable mind change.

---

## 7. Family E — Refinement-flow probes

The hardest family. Tests whether the L5 → L4 → L3 chain actually fires correctly during inference (not just whether layers are present and used). Requires runtime instrumentation and controlled inputs.

### E.1 Counterfactual L5 injection

**Setup**:
- Author a fake L5 impression on a topic the mind has not previously addressed (e.g., a fabricated "Dalio noticed that Argentine peso devaluations preceded political instability by ~6 months" entry).
- Add this entry to a chimera tarball; mount.
- Probe the mind with related questions:
  - Question A: directly about Argentine pesos (tests L5 retrieval).
  - Question B: about a similar emerging-market scenario (tests whether the L5 informs L4-level synthesis).
  - Question C: about Dalio's framework on currency crises generally (tests whether the L5 propagated up to influence L3 application).

**Hypothesis**:
- **H9a**: Question A's answer cites the fake L5 directly.
- **H9b**: Question B's answer uses the fake L5 as an analogy.
- **H9c**: Question C's answer is *unchanged* — single L5 entries shouldn't reshape L3 application.

H9c is the critical falsifier: if a single injected L5 changes the framework's application, the threshold logic (Insight 04) is broken — the mind drifts on every new input.

### E.2 Tension-surfacing probe

**Setup**:
- For each L4 reflection in a mind's refinery, identify a question where the L4 tension *should* surface.
- Example for Dalio's "Determinism vs Agency" L4: question = *"Can a perfect macro model predict the 2024 election outcome?"* (forces the tension between mechanical prediction and political agency).
- Run question through full mind.
- LLM judge: does the answer surface the documented tension, or paper over it?

**Hypotheses**:
- **H10a**: ≥ 50% of tension-targeted questions surface the relevant L4 tension. (Validates that L4 content is actively used.)
- **H10b**: When tension is surfaced, the mind handles it as a tension (not resolution). Per `_system/cognitive_operations.md`: "Do not resolve it."

If H10a fails — most tension-targeted questions get clean answers — L4 content is stored but unread. The refinement pipeline produces L4 entries that no one ever consults.

### E.3 Refinement velocity test

**Setup**:
- Feed the mind 30 new L6 documents (transcripts, articles) over a simulated multi-session sequence.
- Snapshot the refinery after each session.
- Track: how many new L5 impressions get authored? How many propagate to L4? How many cause L3 updates?

**This requires the refinement *operations* to run** — `personal-assistant`'s 26 commands (capture, fast-track-insert, op-up-01-voice-extraction, etc., per drwn-repo task 45). It's a test of the *refinement process*, not the mind at a moment.

**Hypotheses**:
- **H11a**: L5 grows ~linearly with input.
- **H11b**: L4 grows slowly — only when synthesis emerges across L5 entries.
- **H11c**: L3 essentially doesn't change.

This is more an evaluation of the refinement *operations* than the mind, but it's directly relevant to the layered architecture's sustainability claim (Insight 06: the pipeline supports selective forgetting).

### E.4 Retrieval-depth analysis

**Setup**:
- Build 50 questions that require varying retrieval depth:
  - Shallow: answerable from L3 alone (conceptual).
  - Medium: requires L4 (opinion/synthesis).
  - Deep: requires L5 navigation to specific L6 source.
- Measure: which layer the mind *actually* reads (via C.3 instrumentation), and whether depth correlates with question type.

This validates the layered architecture's "deeper questions touch deeper layers" claim.

---

## 8. Recommended portfolio — what to run first

Five experiments, ordered by information-per-cost. Each is sized to deliver a publishable finding on its own.

### Tier 1 — Run first (Weeks 1–4)

**E1: Stance-F1 ablation (A.1)** — the headline ablation. Single experiment, all four `no-LN` variants × 3 minds (Dalio, Harari, Taleb). Reuses Q1 Phase 1 data from task 68. Delivers per-layer marginal value to Stance-F1.

**Why first**: cheapest, most informative, sets a baseline for everything else. Likely 4–5 working days; ~$36 LLM budget.

**E2: Pressure ablation (A.2)** — same five variants, run on Q2 pressure scripts. Tests whether L3 is what holds the line under pressure.

**Why second**: same infrastructure as E1; different score; directly tests Cross-cutting Insight 04 (L3 threshold gives integrity).

### Tier 2 — Run second (Weeks 5–7)

**E3: Forced-citation probe (C.1)** — measures whether layers are actually consulted. Includes the "claim misattribution" gold-standard sub-experiment.

**Why third**: requires human annotation labor (~6 hours per mind for the gold standard). Higher-investment, but produces a finding (refinery utilization rate) that's product-decisive.

**E4: Chimera mind — Dalio L3 + Taleb L4/L5 (D.1)** — tests whether identity lives in L3 or L4.

**Why fourth**: novel, no other experiment substitutes for this. The result (L3 carries identity OR L4 carries identity OR incoherent) has cascading implications for the architecture's design rationale.

### Tier 3 — Run third (Weeks 8–9)

**E5: L3-only and L5-only isolation modes (B.1 + B.3)** — the most interesting isolation modes. Predicts whether a "philosopher" or "scrapbook" variant could ship as production lite.

**Why fifth**: depends on E1 (which provides comparison points). Adds new infrastructure (modified mount config).

**Total cost (Tier 1 + 2 + 3)**: ~$200 LLM budget plus ~30 person-days of work. Comparable to one phase of the Q1–Q3 plan.

### Out-of-portfolio but worth tracking

A few experiments are listed in the design space but not in the recommended portfolio because they're either too high-cost (E.3 refinement velocity — requires the refinement operations to run, which is a separate workstream) or too speculative (E.1 counterfactual L5 injection — interesting but the interpretive ambiguity is high).

These should be revisited after Tier 1–3 land. If E1's ablation results show L4 is the biggest drop, the counterfactual L5 injection becomes higher-priority as the next probe.

---

## 9. Tarball variant builder — the one piece of new infrastructure

Every experiment in Families A, B, D depends on building **variant refinery tarballs**. The current `refinery-publish` pipeline at `/Users/pureicis/dev/mindblown/backend/tools/refinery-publish/src/index.ts` builds one tarball per mind. The change needed:

```ts
// Add a --variant flag with config:
//   --variant=no-L3     → exclude 03_world_models_frameworks/
//   --variant=no-L4     → exclude 04_reflections_thoughts/
//   --variant=L3-only   → include only 01, 02, 03
//   --variant=chimera   → take a JSON spec for per-layer source mind
```

Variant tarballs upload to R2 under different keys (`refineries/{mindId}-{variant}.tar.gz`). The mind invocation API accepts a `refineryVariant` field that picks the tarball.

Implementation: ~1 day. This is the only architectural piece this proposal adds.

---

## 10. Open questions

1. **Does the mind always read the refinery?** Family C.3 (retrieval-trace instrumentation) requires us to know what files the agent actually accesses. Current CCH sandbox shell tools may or may not log this; the instrumentation may need extending. **Action**: spend 0.5 day verifying log granularity before Tier 2.

2. **L4 sparsity in production refineries.** Personal-assistant v1_1 refineries have L4 counts of 9–18. Mindblown production refineries may differ. If L4 is sparse in production, ablation-of-L4 will under-show its value. **Action**: count L4 entries per mind in `/Users/pureicis/dev/mindblown/backend/data/refineries/` before designing experiments.

3. **Whether to run on personal-assistant or production minds.** Personal-assistant v1_1 has richer L4/L5 documentation; mindblown production is the deployed substrate. Running on both adds robustness; on one only is faster. **Recommend**: pilot on personal-assistant (cheaper iteration), confirm on mindblown production before drawing conclusions.

4. **Inter-judge agreement for attribution.** The C.1 forced-citation probe needs a gold standard. Two human annotators per probe gives kappa; one judge is fast but undefendable. **Recommend**: two annotators on a 20-question subset to set baseline; LLM judge with prompt iteration for the rest.

5. **Whether persona is held constant across variants.** When stripping L3, L4, L5, the persona (L1) stays. But is that right? Persona is itself a layer in the refinery (L1 soul_values). If L1 carries identity strongly, the persona-only baseline (B1) is doing most of the work and the layer ablations are detecting only secondary effects. **Recommend**: include `no-persona` as a sixth variant. If it tanks Stance-F1 the hardest, persona dominates and the L3/L4/L5 deltas are smaller than they look.

6. **What does a "successful" finding look like?** If Δ(no-L4) is +0.02 (small), is that "L4 is decorative" or "L4 is important but masked by L3"? Statistical power is the constraint. With 80 Q&A pairs per mind, a +0.05 effect is detectable; +0.02 is noise. **Recommend**: pre-register hypotheses with effect-size thresholds before running.

7. **Confounding with model capability.** GPT-5.4 has a strong pretraining base. If it can "guess" Dalio's stance from the question alone, the ablation deltas are all small — the model is filling in from base knowledge. **Recommend**: include a control where the mind's persona references a *fictional* thinker (no pretraining signal). If the ablation effect is much larger there, the real-mind effects are being attenuated by base knowledge.

---

## 11. Acceptance criteria

A successful experimental portfolio answers, for each layer, the following questions with falsifiable evidence:

- **L3**: Does it carry interpretation? Does its presence enable domain transfer? Does its absence cause pressure flip-rate to spike?
- **L4**: Does it carry synthesized opinion that survives across runs? Does it surface in the right contexts? Is it actually consulted during inference (not just present)?
- **L5**: Does it carry grounding citations? Does it function as the searchable index between L3/L4 abstraction and L6 raw?
- **Cross-layer**: Are the layers independent (chimera works coherently) or coupled (chimera is incoherent)? Where does identity live — L1 persona, L3 framework, L4 reflection?

A successful portfolio also tells us which experiments to abandon as uninformative. For example, if A.4 (knowledge-gap fallback) shows no Δ between full mind and `no-L3+no-L4`, the gap probe isn't sensitive enough to distinguish; the design needs sharper questions.

---

## 12. Relation to the Q1–Q3 plan (task 68)

This proposal **does not replace** Q1–Q3; it complements it. Q1–Q3 asks "is the mind good?" — this asks "where does the goodness come from?"

Concrete integration:
- The transcript Q&A dataset from task 68 Phase 2 is the substrate for ablation runs (A.1, A.2).
- The Q2 pressure scripts (Phase 4) feed A.2.
- The Q3 book-QA (Phase 6) feeds A.3.
- The Phase 0 infrastructure (mind invocation, LLM judge, result aggregation) is reused verbatim.
- The variant tarball builder (§9) is the only new piece.

A natural sequencing: Q1–Q3 runs in weeks 1–8 of the eval window; this proposal's Tier 1 runs in parallel on the same dataset; Tier 2–3 follow in weeks 8–13.

Together they give a complete picture: **the mind is good (Q1–Q3) and the goodness comes from layer X (this proposal)**.

---

## 13. Cross-references

- `.ai/analyses/65_mind-card-l3-l4-l5-scenarios.md` — the 15 scenarios that motivated the design principles in §1
- `.ai/analyses/68_mind-eval-q1-q3-dataset-and-execution-plan.md` — the whole-mind eval plan; infrastructure dependency
- `.ai/analyses/63_drwn-mind-card-target-architecture.md` — the architecture this proposal tests
- `.ai/analyses/62_mind-as-card-substrate-evaluation.md` — the substrate eval that established the layer model
- Notion: "Mind Evaluation — v2 (Question-First)" — locked Q1–Q3 decisions
- Notion: "Remy Mind Card Target Architecture v0.1" — public-facing version of analysis 63
- `/Users/pureicis/dev/mindblown/backend/tools/refinery-publish/src/index.ts` — the variant builder lives here

---

## 14. Notes on creativity and risk

A few of these designs (D.1 chimera, E.1 counterfactual L5 injection, E.4 retrieval-depth) are genuinely novel. They may produce findings that are hard to interpret or that confound multiple variables. **The portfolio is sized assuming Tier 1 + 2 deliver clear findings**; Tier 3 (B.1 + B.3 isolation modes) is the lowest-risk part.

If the team prefers a more conservative portfolio, run just Tier 1 (A.1 + A.2). That alone tells us the per-layer marginal value to Stance-F1 and pressure stability — the two most product-decisive measurements. Tier 2 + 3 produce richer findings but at higher interpretive risk.

The creative-vs-conservative tradeoff is: do we want clean ablation numbers (Tier 1) or do we want to know whether identity lives in L3 or L4 (Tier 2's D.1)? Both have value; the latter is harder to design but cannot be derived from the former.
