# Skill Recommendation Pipeline — Phase 2 Design

## Problem

Users need a way to discover relevant skills. Current approach works (84% precision in Phase 1), but we need a **generalizable pipeline** that:
- Handles ambiguous queries
- Explores multiple search strategies
- Adapts to future improvements without rewrites

## Solution: 3-Block Pipeline

```
User Query
    ↓
[Block 1: Query Generator]  ← Mastra AI expands query with multiple strategies
    ↓ (multiple refined queries)
[Block 2: Skill Finder]     ← npx skills find gets top 5 per query
    ↓ (all matching skills + scores)
[Block 3: Reranker]         ← Cohere AI ranks to top 5
    ↓
Recommended Skills
```

### Block 1: Query Generator
- **Input:** Original user query + context (languages, repo info)
- **Tool:** Mastra AI (well-prompted to avoid explosion)
- **Output:** Multiple refined queries exploring different search angles
- **Example:** "find react hook" → ["react hooks library", "hooks for react state", "reusable react components", ...]

### Block 2: Skill Finder
- **Input:** Refined queries from Block 1
- **Tool:** `npx skills find [query]` (returns top 5 per query)
- **Output:** Aggregated skill list with relevance scores
- **Example:** 5 queries × 5 results = ~25 unique skills (deduplicated)

### Block 3: Reranker
- **Input:** Aggregated skills + original query
- **Tool:** Cohere AI (free reranking API)
- **Output:** Top 5 most relevant skills
- **Fallback:** Keyword match + alphabetical sort if any block fails

---

## Why This Approach

| Aspect | Benefit |
|--------|---------|
| **Generalizable** | Easy to swap components (Mastra → Claude, Cohere → other ranker) |
| **Exploratory** | Try different query strategies without rewriting the pipeline |
| **Defensible** | Each block has clear input/output; testable independently |
| **Scalable** | Works with any query length/complexity |
| **Cheap** | Cohere reranking is free; Mastra/npx are lightweight |

---

## Timeline

### Phase 1: Query Generation + Skill Finding (Week 1)
- Build query generator with Mastra AI
- Verify: Do 5 queries produce diverse candidate skills?
- Success: 20–30 unique skill candidates from 5 queries

### Phase 2: Reranking (Week 2)
- Integrate Cohere reranker
- Test: Does reranked top 5 beat keyword ranking?
- Compare vs Phase 1 results

### Phase 3: Polish + Deployment (Week 3)
- Error handling & fallbacks
- End-to-end testing
- Ready for production use

---

## Extensibility

This pipeline is designed for future iteration:
- **Swap query generator:** Replace Mastra with Claude if we want different strategies
- **Swap skill finder:** Add Embedding-based search if npx becomes bottleneck
- **Swap reranker:** Try different ranking models (LLM, custom ML, etc.)
- **Add ranking context:** Future versions could factor in user history, popular skills, etc.

---

## Next Steps

1. Design review (this doc)
2. Build Phase 1 (query gen + skill finding)
3. Share learnings + iterate

Questions? Reach out.
