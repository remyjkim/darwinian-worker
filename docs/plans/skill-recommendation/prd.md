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

**6 Context Inputs** (all local file extraction, no APIs):

#### 2.1.1 README Parser
- **Input**: `README.md` file
- **Output**: Extracted summary (title, description, tech stack)
- **Method**: Regex pattern matching on markdown
- **Latency**: <100ms
- **File**: `src/skill-recommendation/extractors/readme-parser.ts`

#### 2.1.2 Language Detector
- **Input**: Repository directory structure
- **Output**: Language breakdown (GitHub-style percentages)
- **Method**: Scan files by extension, calculate percentages
- **Example Output**:
  ```json
  {
    "TypeScript": 75,
    "JavaScript": 15,
    "JSON": 10
  }
  ```
- **Latency**: <200ms (depends on repo size)
- **File**: `src/skill-recommendation/extractors/language-detector.ts`

#### 2.1.3 Runtime Environment Detector
- **Input**: Config files (package.json, pyproject.toml, go.mod, Cargo.toml, Gemfile)
- **Output**: Detected runtimes + package managers
- **Detection**: Check for presence of config files + installed packages
- **Example Output**:
  ```json
  {
    "runtimes": ["Node.js", "TypeScript", "Bun"],
    "packageManagers": ["npm", "bun"]
  }
  ```
- **Latency**: <50ms
- **File**: `src/skill-recommendation/extractors/runtime-detector.ts`

#### 2.1.4 Framework Detector
- **Input**: `package.json` or equivalent dependency files
- **Output**: Detected frameworks (React, Vue, Angular, Express, Django, etc.)
- **Method**: Check dependency list against known framework names
- **Example Output**:
  ```json
  {
    "frameworks": ["React", "Next.js"]
  }
  ```
- **Latency**: <50ms
- **File**: `src/skill-recommendation/extractors/framework-detector.ts`

#### 2.1.5 Dependency Parser
- **Input**: `package.json`, `pyproject.toml`, `Gemfile`, `Cargo.toml`, `go.mod`
- **Output**: List of already-installed packages (to avoid duplicates)
- **Method**: Parse config files, extract package names
- **Example Output**:
  ```json
  {
    "existingPackages": ["react", "jest", "webpack", "typescript", "eslint"]
  }
  ```
- **Latency**: <100ms
- **File**: `src/skill-recommendation/extractors/dependency-parser.ts`

#### 2.1.6 Session Log Extractor (NEW)
- **Input**: Recent Claude Code session logs (`~/.claude/logs/`)
- **Output**: 2-5 distinct themes from recent work (e.g., "React testing", "CLI scripting")
- **Method**:
  1. Read last 5 session logs (JSONL format)
  2. Extract user messages → identify keywords + intent
  3. Extract assistant tool_use patterns → count tool usage
  4. Aggregate into 2-5 themes
- **Example Output**:
  ```json
  {
    "recentSessionThemes": [
      "React component refactoring",
      "E2E test setup",
      "DevOps/Deployment"
    ]
  }
  ```
- **Latency**: <300ms
- **File**: `src/skill-recommendation/extractors/session-log-extractor.ts`

**Updated Context Type**:
```typescript
interface ProjectContext {
  readmeSummary?: string;
  languages: Record<string, number>;        // e.g. { "TypeScript": 75 }
  frameworks?: string[];                     // e.g. ["React", "Next.js"]
  runtimes: string[];                        // e.g. ["Node.js", "Bun"]
  existingPackages: string[];                // e.g. ["react", "jest"]
  recentSessionThemes?: string[];            // e.g. ["React testing", "CLI scripting"]
}
```

**Total Context Extraction Latency**: ~700ms (parallel execution, ~300ms actual)

---

### 2.2 Enhanced Query Generator

**Input**: User query + Full project context (6 extractors)

**Updated Prompt**:
```
Given the user's query and comprehensive project context, generate 3 distinct search queries 
that are highly relevant and avoid duplicates.

PROJECT CONTEXT:
- Languages: {languages} (e.g., TypeScript 75%, JavaScript 15%)
- Frameworks: {frameworks} (e.g., React, Next.js)
- Runtime: {runtimes} (e.g., Node.js, Bun)
- Existing Packages: {existingPackages} (MUST AVOID THESE)
- README: {readmeSummary}
- Recent Work: {recentSessionThemes} (e.g., "React testing", "E2E setup")

USER QUERY: {userQuery}

Generate 3 refined search queries that:
1. NEVER recommend existing packages: {existingPackages}
2. Match the detected frameworks & languages
3. Consider recent work themes (user likely working on that area)
4. Provide diverse search angles

Return ONLY 3 queries as JSON array: ["query1", "query2", "query3"]
```

**Example**:
```
Project Context:
  - Languages: TypeScript 75%, JavaScript 25%
  - Frameworks: React, Next.js
  - Runtime: Node.js, Bun
  - Existing: react, jest, typescript, webpack, eslint
  - Recent themes: ["React component testing", "E2E test setup"]

User Query: "testing utilities"

Output:
[
  "React Testing Library advanced patterns",
  "E2E testing frameworks Cypress Playwright",
  "Accessibility testing tools WCAG"
]
```

**Changes**:
- Input now includes all 6 context extractors (parallel execution)
- Prompt explicitly mentions avoiding existing packages
- Leverages recent work themes to suggest relevant skills
- More specific, contextual queries

**File**: Update `src/skill-recommendation/query-generator.ts`

---

### 2.3 CLI Updates

**Command** (unchanged, behavior improved):
```bash
# Recommend skills with full project context (automatic)
bun run cli/index.ts recommend skill "testing utilities"

# Explicit repo path
bun run cli/index.ts recommend skill --query "testing" --repo /path/to/project
```

**Updated Flow** (with context extraction):
```
User Query + Repo Path
    ↓
[Context Extraction] (parallel, ~300ms)
  ├→ README Parser
  ├→ Language Detector
  ├→ Framework Detector
  ├→ Runtime Detector
  ├→ Dependency Parser
  └→ Session Log Extractor
    ↓
[Enhanced Query Generator] → 3 context-aware queries (minimax API)
    ↓
[Skill Finder] → Find skills (parallel, 5 per query)
    ↓
[Skill Aggregator] → Deduplicate + rank
    ↓
[Filter] → Remove already-installed packages
    ↓
[Skill Enricher] → Generate summaries (gpt-3.5-turbo API)
    ↓
[CLI Display] → Show top 5 with summaries
```

**Latency Breakdown**:
- Context extraction: ~300ms (parallel local I/O)
- Query generation: ~2-3s (minimax API call)
- Skill finding: ~3-5s (parallel `npx skills find` calls)
- Skill enrichment: ~2-4s (parallel summary generation)
- **Total**: ~8-12s (vs Phase 1: 7-10s)

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
├── types.ts                              # Shared interfaces
├── prompts.ts                            # System prompts & configs
├── query-generator.ts                    # Enhanced query generation (with context)
├── skill-finder.ts                       # Wraps `npx skills find`
├── skill-aggregator.ts                   # Deduplicates & ranks
├── skill-enricher.ts                     # Generates summaries
├── openrouter-client.ts                  # OpenRouter API client
├── pipeline.ts                           # Orchestrates all blocks
├── logger.ts                             # Structured logging
├── index.ts                              # Exports public API
│
└── extractors/                           # Phase 2: Context extraction (NEW)
    ├── readme-parser.ts                  # Extracts README summary
    ├── language-detector.ts              # Detects language breakdown
    ├── framework-detector.ts             # Detects frameworks (React, Vue, etc.)
    ├── runtime-detector.ts               # Detects runtime (Node.js, Python, etc.)
    ├── dependency-parser.ts              # Parses existing packages
    └── session-log-extractor.ts          # Extracts recent work themes

cli/
└── index.ts                              # Interactive CLI tool

docs/plans/skill-recommendation/
├── prd.md                                # This file (requirements, phases, roadmap)
├── diagrams.md                           # Data flow & architecture diagrams
├── PRODUCTION_SETUP.md                   # Setup & deployment guide
└── phase1-results-may13.md               # Phase 1 evaluation results

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
