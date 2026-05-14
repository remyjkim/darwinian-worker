# Production Setup: OpenRouter Integration

The skill recommendation pipeline is now wired with a real OpenRouter client for query generation.

## Quick Start

### Environment Setup

Ensure `OPENROUTER_API_KEY` is in your `.env` file:

```bash
OPENROUTER_API_KEY=sk-or-v1-<your-key>
```

### Using the Production Pipeline

```typescript
import { recommendSkillsWithOpenRouter, createBufferedLogger } from "./src/skill-recommendation";

// Simple usage with OpenRouter
const result = await recommendSkillsWithOpenRouter("React state management");

console.log(`Generated ${result.refinedQueries.length} refined queries:`);
result.refinedQueries.forEach((q) => console.log(`  - ${q}`));

console.log(`Found ${result.aggregatedSkills.length} candidate skills`);
console.log(`Latency: ${result.latencyMs}ms`);
```

### With Logging

```typescript
const logger = createBufferedLogger("./logs/skill-recommendation.jsonl");

const result = await recommendSkillsWithOpenRouter("React state management", {
  logger,
});

console.log(`Logged to: ./logs/skill-recommendation.jsonl`);
```

## Implementation Details

### Architecture

- **Query Generator**: Uses OpenRouter's `openai/gpt-3.5-turbo` model
  - System prompt: 5 distinct search strategy generation
  - Temperature: 0.2 (low randomness for consistency)
  - Timeout: 5 seconds
  
- **Skill Finder**: Shells out to `npx skills find <query> --json`
  - Returns top 5 skills per refined query
  - Requires `npx` and `skills` CLI installed
  
- **Aggregator**: Deduplicates by skill ID, retains highest relevance score

### Cost Considerations

- OpenRouter model: `gpt-3.5-turbo` (~$0.0005 per 1K output tokens)
- 5 refined queries per user query
- ~100-200 tokens per API call
- **Estimated cost: ~$0.0005-0.001 per recommendation**

## Testing

### Unit Tests (Fixture-Based, No API Calls)

```bash
npm test -- test/pipeline-evaluation.test.ts
npm test -- test/query-generator-evaluation.test.ts
```

All tests use fixture clients and deterministic fallbacks to avoid API calls.

### Integration Tests (Real OpenRouter Calls)

```bash
bun run scripts/test-openrouter-client.ts          # Test client only
bun run scripts/test-full-pipeline-openrouter.ts   # Full pipeline
```

## Error Handling

If OpenRouter is unavailable:
- Query generation falls back to keyword-based strategy
- Pipeline continues with reduced query diversity
- Logged as ERROR with full context
- Caller is notified via `result.warnings`

## Next Steps (Phase 2)

- [ ] Add reranker block to re-score aggregated candidates
- [ ] Implement caching layer for repeated queries
- [ ] Add rate limiting for production deployments
- [ ] Monitor OpenRouter latency and costs
