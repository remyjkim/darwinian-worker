# Phase 1 Results: Skill Recommendation Pipeline

Date: May 13, 2026

## Summary

Phase 1 is implemented as a modular Query Generator and Skill Finder pipeline under `src/skill-recommendation`.

Implemented blocks:
- Query Generator: expands a user query into exactly five focused search queries.
- Skill Finder: shells out to `npx skills find <query> --json`, normalizes scored results, and returns the top five.
- Aggregator: deduplicates candidates by skill id, keeps the highest relevance score, sorts descending, and caps at 30 candidates.
- Pipeline: exposes inspectable intermediate outputs, fallbacks, warnings, latency, and buffered JSONL logging.

## Evaluation Results

Automated evaluation uses 10 diverse sample queries in `test/sample-queries.json`.

Observed in deterministic tests:
- Query diversity: 10 of 10 samples produced five distinct query variants.
- Candidate count: end-to-end fixture evaluation produced 25 candidates per query.
- Latency: end-to-end fixture evaluation completed under the 2 second target.
- Relevance proxy: 10 of 10 samples met the 80% scored-candidate threshold in deterministic evaluation.
- Error handling: query generation falls back to keyword strategy; skill finder failures produce empty arrays and warnings.
- Instrumentation: debug refined queries, debug aggregated candidates, info latency, and error context are recorded; JSONL output is covered by tests.

## Learnings

- Keeping the Mastra dependency behind a small `MastraTextClient` contract makes the query generator testable without network calls.
- The fallback query generator is useful beyond error handling because it provides deterministic coverage for evaluation and local development.
- `npx skills find` output should remain JSON-first for this pipeline; parser support accepts both top-level arrays and `{ "results": [...] }`.
- Deduplication should happen after score normalization so the aggregator can retain the highest-scoring version of each skill.

## Blockers

- No production Mastra client is wired yet; Phase 1 defines the interface and prompt, while tests use a Mastra-compatible client stub.
- Live `npx skills find` quality and latency still need validation against the published package or installed command in the target runtime.

## Phase 2 Readiness

The pipeline is ready for a reranker block because `recommendSkills()` returns:
- `originalQuery`
- `refinedQueries`
- `skillsByQuery`
- `aggregatedSkills`
- `latencyMs`
- `warnings`

Phase 2 can add a reranker after aggregation without changing the Query Generator or Skill Finder contracts.
