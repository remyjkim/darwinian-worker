# Phase 1 PRD: Skill Recommendation Pipeline — May 13, 2026

## Overview

Build a **generalizable 3-block skill recommendation pipeline** that expands user queries, finds matching skills, and reranks them. Phase 1 focuses on blocks 1 & 2 (query generation + skill finding); Phase 2 adds reranking.

## Problem Statement

Users need to discover relevant skills. Phase 1 achieved 84% precision but was tightly coupled to a specific approach. We need a **modular pipeline** that explores multiple search strategies per query, scales to future improvements, and is testable at each stage.

## Phase 1 Scope

### Block 1: Query Generator
- **Input:** User query string
- **Tool:** Mastra AI with system prompt
- **Output:** 5 refined queries exploring different angles
- **Example:** "find react hook" → ["react hooks library", "hooks for react state management", "reusable react components", "custom react hook patterns", "react hooks package"]

### Block 2: Skill Finder
- **Input:** Refined queries from Block 1
- **Tool:** `npx skills find [query]` (returns top 5 per query)
- **Output:** Aggregated skill list with relevance scores, deduplicated
- **Example:** 5 queries × 5 results = ~25 unique candidate skills

### Block 3: Reranker (Phase 2)
- Deferred to Phase 2 pending Block 1 & 2 validation

## Success Criteria (Phase 1)

✅ Query generation: 5 distinct queries, exploring different angles  
✅ Skill finding: 20–30 aggregated unique skills, scores preserved  
✅ Pipeline testable: Can inspect intermediate outputs  
✅ Latency acceptable: <2s end-to-end  
✅ Extension points clear: Easy to swap components

## Testing & Evaluation

- **Test Set:** 10 diverse sample queries
- **Metrics:**
  - Query diversity: 5 distinct angles per input (80%+ success)
  - Candidate count: 20–30 unique skills
  - Latency: <2s end-to-end
  - Relevance: 80%+ candidates match query intent

## Implementation Plan

1. Query Generator: Write Mastra prompt, implement, test
2. Skill Finder: Implement wrapper, aggregation, test
3. Integration: Wire blocks together, add error handling
4. Evaluation: Run test set, document learnings

## Timeline

- Day 1: Query Generator implementation & testing
- Day 2: Skill Finder implementation & testing
- Day 3: Pipeline integration + error handling
- Day 4: Evaluation & documentation

**Target completion:** May 16, 2026

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Mastra generates bad queries | Test prompt early; iterate if needed |
| npx skills find is unreliable | Have vector embedding fallback ready |
| Too many candidates | Cap candidates; test latency |
| Latency >2s | Profile each block; optimize or simplify |

## Future Extensions

- Block 1: Add repo context (languages, gap analysis)
- Block 2: Backup plan with vector embedding search
- Block 3: Cohere reranking → Agent-based reranking
- General: Performance optimization, caching, analytics
