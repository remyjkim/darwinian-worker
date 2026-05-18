// ABOUTME: Manually exercises the real OpenRouter-backed query generator.
// ABOUTME: Prints only generated queries and non-secret runtime metadata.

import { DEFAULT_MASTRA_QUERY_CONFIG, QUERY_GENERATOR_SYSTEM_PROMPT } from "../cli/commands/recommend/prompts";
import { coerceQueryList } from "../cli/commands/recommend/query-generator";
import { OpenRouterMastraTextClient } from "../cli/commands/recommend/openrouter-client";

const query = process.argv.slice(2).join(" ").trim() || "find react hook";
const model = process.env.OPENROUTER_MODEL ?? "minimax/minimax-m2.5";
const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS ?? 10_000);

const client = new OpenRouterMastraTextClient();
const rawResponse = await client.generateText({
  system: QUERY_GENERATOR_SYSTEM_PROMPT,
  prompt: `User query: ${query}`,
  model,
  temperature: DEFAULT_MASTRA_QUERY_CONFIG.temperature,
  timeoutMs,
});
const refinedQueries = coerceQueryList(rawResponse, query, DEFAULT_MASTRA_QUERY_CONFIG.maxQueries);

console.log(
  JSON.stringify(
    {
      provider: "openrouter",
      model,
      timeoutMs,
      apiKeyPresent: Boolean(process.env.OPENROUTER_API_KEY),
      originalQuery: query,
      rawResponse,
      refinedQueries,
    },
    null,
    2,
  ),
);
