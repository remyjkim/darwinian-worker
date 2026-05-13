# Phase 1 Development Guide — May 13, 2026

Implementation guide for Phase 1 of the skill recommendation pipeline. See `ralph/prd.json` for 14 user stories.

## Implementation Sequence

### Step 1: Types (US-001, US-005)
Create `src/skill-recommendation/types.ts`:
```typescript
export interface QueryGeneratorInput { query: string; }
export interface QueryGeneratorOutput { originalQuery: string; refinedQueries: string[]; }
export interface Skill { id: string; name: string; relevanceScore: number; }
export interface SkillFinderInput { refinedQueries: string[]; }
export interface SkillFinderOutput { originalQuery: string; aggregatedSkills: Skill[]; }
```

### Step 2: Query Generation (US-002, US-003, US-004)

**Prompt (US-002):** `src/skill-recommendation/prompts.ts`
```
Generate EXACTLY 5 queries exploring different search strategies:
1. Library/Package names
2. Problem-solution approach
3. Pattern names
4. Use cases
5. Related tools/alternatives
```

**Implementation (US-003):** `src/skill-recommendation/query-generator.ts`
```typescript
async function generateQueries(input: QueryGeneratorInput): Promise<QueryGeneratorOutput>
```

**Testing (US-004):** Run on 10 diverse sample queries, verify 80%+ have 5 unique angles

### Step 3: Skill Finding (US-006, US-007, US-008)

**Wrapper (US-006):** `src/skill-recommendation/skill-finder.ts`
```typescript
async function findSkills(query: string): Promise<Skill[]>
// Shell out to: npx skills find [query]
```

**Aggregation (US-007):** `src/skill-recommendation/skill-aggregator.ts`
```typescript
function aggregateSkills(skillsByQuery: Map<string, Skill[]>): Skill[]
// Deduplicate by ID, keep highest score, sort descending
```

**Testing (US-008):** Run on Query Generator output, verify 20-30 aggregated skills

### Step 4: Pipeline (US-009, US-010, US-011)

**Pipeline (US-009):** `src/skill-recommendation/pipeline.ts`
```typescript
async function recommendSkills(userQuery: string): Promise<Skill[]>
// 1. generateQueries()
// 2. For each: findSkills()
// 3. aggregateSkills()
// 4. Return top candidates
```

**Error handling (US-010):**
- Query Gen fails → keyword match fallback
- Skill Finder fails → return empty array
- Log all errors with context

**Logging (US-011):**
- DEBUG: refined queries, aggregated list
- INFO: latency
- ERROR: full context

### Step 5: Testing & Evaluation (US-012, US-013, US-014)

**Test set (US-012):** 10 diverse queries (react, logging, testing, auth, database, etc.)

**Evaluation (US-013):** Run pipeline on test set, measure:
- Latency per query (target <2s)
- Candidate count (target 20-30)
- Manual relevance check (target 80%+)

**Results (US-014):** Document Phase 1 findings, Phase 2 readiness assessment

## Files to Create

```
src/skill-recommendation/
├── types.ts
├── prompts.ts
├── query-generator.ts
├── skill-finder.ts
├── skill-aggregator.ts
├── pipeline.ts
└── logger.ts

test/
├── sample-queries.json
├── query-generator-evaluation.ts
├── skill-finder-evaluation.ts
└── pipeline-evaluation.ts
```

## Success Criteria

- [ ] All 14 user stories completed
- [ ] Typecheck passes
- [ ] Query diversity: 80%+ success rate
- [ ] Candidate count: 20-30 per query
- [ ] Latency: <2s end-to-end
- [ ] Relevance: 80%+ manual eval
- [ ] Phase 2 readiness documented

## Timeline

4 days (May 13-16, 2026)
