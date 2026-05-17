---
title: Skill Recommendation System - PRD
version: 1.1
date: 2026-05-17
status: Phase 1 Complete, Phase 2 Planning (Context-Aware Generation)
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

## Phase 2: Context-Aware Query Generation (PLANNED)

### 2.0 Overview

**Goal**: Enhance Query Generator to understand project context, avoiding duplicate recommendations and improving relevance.

**Key Change**: Query Generator now accepts:
1. User prompt (original)
2. Project context:
   - README/documentation summary
   - Language breakdown (GitHub-style: %)
   - Runtime environment (Node.js, Python, Bun, etc.)
   - Existing skills in the repo (to filter duplicates)

**Impact**: Smarter, context-aware queries instead of generic ones.

---

### 2.1 Context Extraction Pipeline

**New Components to Implement**:

#### 2.1.1 README Parser
- **Input**: Repository root
- **Output**: Extracted summary (title, description, tech stack mentions)
- **Method**: Parse README.md (or package.json description as fallback)
- **Implementation**: Simple regex/markdown parsing or LLM-based summarization
- **File**: `src/skill-recommendation/repo-context/readme-parser.ts`

#### 2.1.2 Language Detector
- **Input**: Repository root
- **Output**: Language breakdown (GitHub-style percentages)
- **Method**:
  - Scan common config files: `package.json`, `pyproject.toml`, `go.mod`, `Gemfile`, `pom.xml`, `cargo.toml`
  - Detect primary language from file extensions (.ts, .py, .go, .rb, etc.)
  - Calculate percentages by line count (or file count as approximation)
- **Output Format**:
  ```json
  {
    "TypeScript": 75,
    "JavaScript": 15,
    "JSON": 10
  }
  ```
- **File**: `src/skill-recommendation/repo-context/language-detector.ts`

#### 2.1.3 Runtime Environment Detector
- **Input**: Repository files (package.json, Dockerfile, .python-version, etc.)
- **Output**: Detected runtime(s)
- **Detection Logic**:
  - Node.js: `package.json`, `node_modules/`, `bun.lockb`
  - Python: `requirements.txt`, `pyproject.toml`, `.python-version`
  - Deno: `deno.json`, `deno.lock`
  - Bun: `bun.lockb`, `bunfig.toml`
  - Go: `go.mod`, `go.sum`
  - Ruby: `Gemfile`, `Gemfile.lock`
  - Rust: `Cargo.toml`, `Cargo.lock`
- **Output Format**:
  ```json
  {
    "runtimes": ["Node.js", "TypeScript", "Bun"],
    "package_managers": ["npm", "bun"]
  }
  ```
- **File**: `src/skill-recommendation/repo-context/runtime-detector.ts`

#### 2.1.4 Existing Skills Inventory
- **Input**: Repository (package.json, pyproject.toml, Gemfile, etc.)
- **Output**: List of already-installed packages/skills
- **Method**:
  - Parse `package.json` → npm dependencies + devDependencies
  - Parse `pyproject.toml` → pip dependencies
  - Parse `Gemfile` → gem dependencies
  - Parse `Cargo.toml` → crate dependencies
  - Parse `go.mod` → go module dependencies
- **Output Format**:
  ```json
  {
    "existing_packages": [
      "react",
      "jest",
      "webpack",
      "typescript",
      "eslint"
    ]
  }
  ```
- **File**: `src/skill-recommendation/repo-context/dependency-parser.ts`

#### 2.1.5 Context Aggregator
- **Input**: All context extractors output
- **Output**: Structured context object
- **File**: `src/skill-recommendation/repo-context/context-aggregator.ts`

**New Type**:
```typescript
interface ProjectContext {
  readmeSummary?: string;
  languages: { [name: string]: number }; // e.g. { "TypeScript": 75 }
  runtimes: string[];
  packageManagers: string[];
  existingPackages: string[];
}
```

---

### 2.2 Updated Query Generator

**Changes to Query Generator**:

**Old Input**:
```typescript
interface QueryGeneratorInput {
  query: string;
}
```

**New Input**:
```typescript
interface QueryGeneratorInput {
  query: string;
  context: ProjectContext; // NEW
}
```

**Updated Prompt**:
```
Given the user's query and the project context below, generate 3 distinct search queries:

PROJECT CONTEXT:
- Primary Language(s): {languages}
- Runtime: {runtimes}
- Existing Packages: {existingPackages}
- README Summary: {readmeSummary}

USER QUERY: {query}

Generate 3 refined queries that:
1. Avoid recommending existing packages
2. Are specific to the detected languages/runtimes
3. Consider the project's tech stack and README context

Return ONLY 3 queries as a JSON array, no explanations.
```

**Example**:
```
Project: TypeScript/React app using Jest
Existing: react, jest, typescript, webpack
Query: "testing utilities"

Output:
[
  "react testing library",
  "jest extensions hooks",
  "testing accessibility tools"
]
```

**File**: Update `src/skill-recommendation/query-generator.ts`

---

### 2.3 CLI Updates

**New Command**:
```bash
# Recommend skills with project context
bun run cli/index.ts recommend skill --query "testing" --repo /path/to/project

# Or use current directory as default
bun run cli/index.ts recommend skill --query "testing"  # infers repo = cwd
```

**Flow**:
```
User Query + Repo Path
    ↓
[Context Extractor] → README, languages, runtime, existing packages
    ↓
[Query Generator] → 3 context-aware queries
    ↓
[Skill Finder] → Find skills (parallel, 5 per query)
    ↓
[Skill Aggregator] → Deduplicate + rank
    ↓
[Filter] → Remove already-installed packages
    ↓
[Skill Enricher] → Generate summaries
    ↓
[CLI Display] → Show top 5 with summaries
```

**File**: Update `cli/index.ts`

---

### 2.4 Phase 1 vs Phase 2 Comparison

| Aspect | Phase 1 | Phase 2 |
|--------|---------|---------|
| Query Input | User prompt only | User prompt + project context |
| Query Generator | Static, generic | Context-aware |
| Avoids Duplicates | No | Yes (filters existing) |
| Latency | 7-10s | 7-12s (context extraction adds ~2-3s) |
| Accuracy | ~84% precision | Target: >90% precision |
| Files to Create | 0 | 5+ new context modules |

---

## Phase 3: Optimization & Features (PLANNED - moved from Phase 2)

### 3.1 Generalized 3-Block Pipeline

**Current State (Phase 1)**: Direct pipeline with fixed components
**Goal (Phase 3)**: Generalizable, extensible architecture for future improvements

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

### 3.2 Caching Layer

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

### 3.3 Rate Limiting & Quotas

**Goal**: Prevent API abuse and manage costs

**Features**:
- Per-user rate limits (requests/hour)
- Per-IP rate limits
- Cost tracking (minimax vs gpt-3.5-turbo budgets)
- Graceful degradation when rate-limited

**Files to Create**:
- `src/skill-recommendation/rate-limiter.ts`

---

### 3.4 Web UI (Phase 3B)

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

### 3.5 Feedback Loop & Learning

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

## Phase 4: Integration & Distribution (FUTURE)

### 4.1 IDE Extensions
- VS Code extension for inline skill discovery
- JetBrains IDE plugin

### 4.2 CLI Tool Distribution
- Publish to npm as `@bgng/skill-finder`
- Standalone `bgng` CLI tool with skill command

### 4.3 API Service
- REST API for skill recommendations
- GraphQL endpoint option
- Rate-limited public access tier

### 4.4 Analytics
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

### Phase 2 (Context-Aware)
- [ ] Context extraction latency < 3 seconds
- [ ] Duplicate filtering accuracy > 95%
- [ ] Top 5 relevance improves to >90% precision
- [ ] E2E latency remains < 15 seconds (with context)
- [ ] Language & runtime detection accuracy > 90%
- [ ] Filter removes 80%+ of false positives from Phase 1

### Phase 3 (Optimization)
- [ ] Query cache hit rate > 60%
- [ ] Reranker improves top-5 relevance by 20%+
- [ ] Latency with cache < 5 seconds
- [ ] Rate limiting prevents >10 req/min per user

### Phase 4 (Integration)
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
