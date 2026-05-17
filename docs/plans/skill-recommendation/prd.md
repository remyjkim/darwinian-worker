---
title: Skill Recommendation System - PRD
version: 1.0
date: 2026-05-14
status: Phase 1 Complete, Phase 2 Planning
---

# Skill Recommendation System - PRD

## Executive Summary

The Skill Recommendation System helps developers discover and add appropriate skills (npm packages, tools, patterns) from the global skills.sh registry (91k+ skills) based on natural language queries. It uses AI-powered query expansion and parallel skill finding to provide fast, relevant recommendations.

**Current Status**: Phase 1 (MVP) complete with CLI interface and working end-to-end pipeline.

---

## Phase 1: MVP (✅ COMPLETE)

### 1.1 User Journey

```
User Query
    ↓
[Query Generator] → 3 refined search queries (minimax/OpenRouter)
    ↓
[Skill Finder] → Run `npx skills find` in parallel (5 per query)
    ↓
[Skill Aggregator] → Deduplicate by ID, rank by relevance
    ↓
[Skill Enricher] → Generate 3-5 sentence summaries (gpt-3.5-turbo)
    ↓
[CLI Display] → Show top 5 with summaries + menu
    ↓
[User Selection] → Arrow keys to select, add via `npx skills add`
```

### 1.2 Components Implemented

#### Query Generator
- **Input**: User query (e.g., "react testing")
- **Output**: 3 distinct search queries covering:
  1. Library/package names
  2. Problem-solution wording
  3. Pattern/framework/use cases
- **Model**: minimax-text-01 via OpenRouter
- **Config**: temp=0.2, timeout=5s, deterministic fallback if API fails
- **File**: `src/skill-recommendation/query-generator.ts`

#### Skill Finder
- **Input**: Refined query
- **Output**: Sorted list of skills with relevance scores
- **Implementation**: Wraps `npx skills find <query>` command
- **Parsing**: Handles ANSI color codes, extracts skill ID + install count
- **Fallback**: Returns empty array if command fails
- **File**: `src/skill-recommendation/skill-finder.ts`

#### Skill Aggregator
- **Input**: Skills by query (map from each refined query)
- **Output**: Deduplicated, ranked skill list
- **Algorithm**: 
  - Deduplicates by skill ID
  - Retains highest relevance score per skill
  - Returns top N candidates (default 30)
- **File**: `src/skill-recommendation/skill-aggregator.ts`

#### Skill Enricher
- **Input**: Skill list (typically top 5)
- **Output**: Enriched skills with AI-generated summaries
- **Prompt**: "Generate 3-5 sentence summary of what this skill does, its main purpose, and typical use cases"
- **Model**: gpt-3.5-turbo via OpenRouter
- **Config**: temp=0.2, timeout=5s
- **Parallel**: All summaries generated concurrently
- **File**: `src/skill-recommendation/skill-enricher.ts`

#### Pipeline Orchestrator
- **Input**: User query
- **Output**: Recommendation result with all intermediate data
- **Parallelization**: 
  - Query generation → sequential (feeds into next step)
  - Skill finder calls → parallel across all refined queries
  - Summary generation → parallel across all skills
- **Logging**: Structured JSON logs for all steps
- **File**: `src/skill-recommendation/pipeline.ts`

#### CLI Interface
- **Commands**:
  - `bun run cli/index.ts recommend skill <query>` - Search & display
  - `bun run cli/index.ts add skill <skill-id>` - Direct add
- **UX Features**:
  - Loading spinner during search
  - Arrow key navigation (↑↓) for menu and skill selection
  - Skill summaries displayed below each result
  - Menu options: Add skill, Refine search, Exit
  - Clean output with ANSI colors
- **File**: `cli/index.ts`

### 1.3 APIs & Dependencies

**External APIs**:
- OpenRouter (minimax-text-01, gpt-3.5-turbo)
- skills.sh CLI (npx skills find)

**Environment**:
- `OPENROUTER_API_KEY`: Required for query generation & summaries

**Latency Profile**:
- Search: 3-5 seconds (query generation + skill finding)
- Enrichment: 2-4 seconds (parallel summary generation)
- Total: ~7-10 seconds per search

---

## Phase 2: Optimization & Features (PLANNED)

### 2.1 Generalized 3-Block Pipeline

**Current State (Phase 1)**: Direct pipeline with fixed components
**Goal (Phase 2)**: Generalizable, extensible architecture for future improvements

**The 3-Block Design**:

```
User Query
    ↓
[Block 1: Query Generator]  ← AI expands query with multiple strategies
    ↓ (multiple refined queries)
[Block 2: Skill Finder]     ← npx skills find gets top 5 per query
    ↓ (all matching skills + scores)
[Block 3: Reranker]         ← AI ranks to top 5
    ↓
Recommended Skills
```

**Block 1: Query Generator**
- **Input:** Original user query + context (languages, repo info)
- **Current Tool:** minimax-text-01 via OpenRouter
- **Output:** 3 refined queries exploring different search angles
- **Example:** "react testing" → ["react-testing-library", "testing React components", "component test patterns"]
- **Future:** Swap to Claude or Mastra for different strategies

**Block 2: Skill Finder**
- **Input:** Refined queries from Block 1
- **Tool:** `npx skills find [query]` (returns top 5 per query)
- **Output:** Aggregated skill list with relevance scores (~25 unique skills)
- **Future:** Replace with embedding-based search if CLI becomes bottleneck

**Block 3: Reranker**
- **Input:** Aggregated skills + original query
- **Tool:** Options: minimax, Cohere AI (free), or cross-encoder
- **Output:** Top 5 re-ranked skills
- **Fallback:** Keyword match + alphabetical sort if any block fails
- **Future:** Use custom ML model or user feedback signals

**Why This Approach**:
| Aspect | Benefit |
|--------|---------|
| **Generalizable** | Easy to swap components (Query Gen, Skill Finder, Reranker) |
| **Exploratory** | Try different query strategies without rewriting the pipeline |
| **Defensible** | Each block has clear input/output; testable independently |
| **Scalable** | Works with any query length/complexity |
| **Cheap** | Reranking is optional; can use free APIs (Cohere) |

**Files to Create**:
- `src/skill-recommendation/skill-reranker.ts` — Reranks top 30 → top 5

---

### 2.2 Caching Layer

**Goal**: Reduce latency for repeated queries by 80%+

**Implementation**:
- Cache query refinements by hash of original query
- Cache skill search results by refined query
- TTL-based expiration (1 hour default)
- Storage: Local file-based (`.skillcache/`)

**Expected Impact**:
- Repeated searches: <1 second
- New queries after cache: ~3 seconds
- Cache hit rate target: 60%+

**Files to Create**:
- `src/skill-recommendation/query-cache.ts`
- `src/skill-recommendation/skill-cache.ts`

---

### 2.3 Rate Limiting & Quotas

**Goal**: Prevent API abuse and manage costs

**Features**:
- Per-user rate limits (requests/hour)
- Per-IP rate limits
- Cost tracking (minimax vs gpt-3.5-turbo budgets)
- Graceful degradation when rate-limited

**Files to Create**:
- `src/skill-recommendation/rate-limiter.ts`

---

### 2.4 Web UI (Phase 2B)

**Goal**: Provide browser-based interface with better UX

**Features**:
- Real-time search results
- Interactive skill cards with links to skills.sh
- One-click skill addition (backend integration)
- Search history & saved skills
- Responsive design

**Stack**:
- Frontend: React (or similar)
- Backend: Express/Node.js
- Database: SQLite (user preferences, history)

**Architecture**:
```
Browser → Express Server → Skill Recommendation Pipeline
                       ↓
                   SQLite (history, saves)
```

---

### 2.5 Feedback Loop & Learning

**Goal**: Improve recommendations over time based on user feedback

**Metrics to Track**:
- Which skills users actually add
- Skill ratings (1-5 stars)
- Query-to-skill relevance feedback

**Learning Approach**:
- Weight popular skills higher in ranking
- Identify successful query → skill patterns
- Use feedback to retrain reranker weights

**Files to Create**:
- `src/skill-recommendation/feedback-collector.ts`
- `src/skill-recommendation/feedback-analytics.ts`

---

## Phase 3: Integration & Distribution (FUTURE)

### 3.1 IDE Extensions
- VS Code extension for inline skill discovery
- JetBrains IDE plugin

### 3.2 CLI Tool Distribution
- Publish to npm as `@bgng/skill-finder`
- Standalone `bgng` CLI tool with skill command

### 3.3 API Service
- REST API for skill recommendations
- GraphQL endpoint option
- Rate-limited public access tier

### 3.4 Analytics
- Track popular queries and skills
- Identify skill discovery patterns
- Public dashboard with trending skills

---

## Current Implementation Details

### Query Expansion Strategy

The system generates 3 search angles per user query:

**Example: "React testing"**
```
1. react-testing-library package  (Library names angle)
2. testing React components approach  (Problem-solution angle)
3. component testing patterns React  (Pattern/use-case angle)
```

These queries explore different semantic angles to maximize skill discovery breadth.

### Relevance Scoring

Skills are scored based on:
1. **Install count** (normalized to 0-1, capped at 1000+)
2. **Query match** (implicit from skill finder ranking)
3. **Deduplication** (retains highest score when same skill appears multiple times)

### Summary Generation Prompt

```
Generate a comprehensive 3-5 sentence summary of what the "[skill name]" 
package/skill does, its main purpose, and typical use cases.

Return ONLY the summary sentences, no additional text or formatting.
```

**Model**: gpt-3.5-turbo (cheaper than Claude, similar quality)
**Temperature**: 0.2 (deterministic, focused)

---

## Cost Analysis

### Phase 1 Costs (Monthly Estimate)

**Assumptions**: 100 users, 5 searches/user/month, parallel enrichment

| Component | Cost | Notes |
|-----------|------|-------|
| Query Gen (minimax) | $0.05 | 500 queries × ~0.0001/query |
| Summaries (GPT-3.5) | $0.10 | 2,500 summaries × ~0.00004/summary |
| Skill Finding | Free | Local `npx skills find` |
| **Total** | **$0.15** | Per 500 searches |

**Scaling**: Cost scales linearly with searches, not users.

---

## Success Metrics

### Phase 1 (MVP)
- [ ] E2E pipeline latency < 15 seconds
- [ ] Skill finder completion rate > 95%
- [ ] User can add skill in < 2 minutes
- [ ] CLI arrow navigation smooth (no jank)
- [ ] Error handling graceful (fallbacks work)

### Phase 2
- [ ] Query cache hit rate > 60%
- [ ] Reranker improves top-5 relevance by 20%+
- [ ] Latency with cache < 5 seconds
- [ ] Rate limiting prevents >10 req/min per user

### Phase 3
- [ ] IDE extension installed by >1k developers
- [ ] API service handles >100 req/sec
- [ ] Public dashboard shows 10k+ monthly searches

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **CLI** | TypeScript + Bun runtime |
| **LLM APIs** | OpenRouter (minimax, gpt-3.5-turbo) |
| **Skill Finding** | skills.sh CLI (npx) |
| **Logging** | Structured JSON (JSONL) |
| **Caching** | File-based (Phase 2) |
| **Web** | React + Express (Phase 2) |
| **Database** | SQLite (Phase 2) |

---

## Known Limitations & Trade-offs

### Current (Phase 1)

| Limitation | Reason | Future Solution |
|-----------|--------|-----------------|
| 3 queries max | API cost control | Reranker instead of more queries |
| No caching | MVP simplicity | File-based cache (Phase 2) |
| Sequential fallback | No semantic reranking | Reranker block (Phase 2) |
| CLI only | Fast MVP | Web UI (Phase 2B) |
| No user history | Stateless design | SQLite DB (Phase 2) |

### Design Decisions

1. **OpenRouter over Anthropic**: Unified API, cost savings
2. **Minimax for queries**: Fast, cheap, deterministic at temp=0.2
3. **gpt-3.5-turbo for summaries**: Better quality-to-cost ratio than minimax for natural language
4. **Parallel skill finding**: 3-5s latency instead of 15-25s sequential
5. **CLI over web (Phase 1)**: Faster MVP, easier deployment

---

## File Structure

```
src/skill-recommendation/
├── types.ts                    # Shared interfaces
├── prompts.ts                  # System prompts & configs
├── query-generator.ts          # Query refinement (3 queries)
├── skill-finder.ts             # Wraps `npx skills find`
├── skill-aggregator.ts         # Deduplicates & ranks
├── skill-enricher.ts           # Generates summaries
├── openrouter-client.ts        # OpenRouter API client
├── pipeline.ts                 # Orchestrates all blocks
├── logger.ts                   # Structured logging
└── index.ts                    # Exports public API

cli/
└── index.ts                    # Interactive CLI tool

docs/plans/skill-recommendation/
├── prd.md                      # This file (requirements, phases, roadmap)
├── diagrams.md                 # Visual architecture (Mermaid)
├── PRODUCTION_SETUP.md         # How to run Phase 1 (setup, env vars)
└── phase1-results-may13.md     # Phase 1 evaluation results

test/
├── pipeline-evaluation.test.ts
├── query-generator-evaluation.test.ts
└── skill-finder-evaluation.test.ts
```

---

## How to Run Phase 1

```bash
# Setup
export OPENROUTER_API_KEY=sk-or-v1-...

# Search for skills
bun run cli/index.ts recommend skill react testing

# Direct add
bun run cli/index.ts add skill owner/repo@skill-name

# Run tests
bun test
```

---

## References

- Phase 1 Results: [phase1-results-may13.md](./phase1-results-may13.md)
- Production Setup: [PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md)
- Global Skills Registry: https://skills.sh (91k+ skills)
- OpenRouter Docs: https://openrouter.ai/docs
