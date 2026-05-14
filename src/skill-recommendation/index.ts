// ABOUTME: Exposes the public Phase 1 skill recommendation pipeline API.
// ABOUTME: Keeps imports stable for future CLI integration and Phase 2 reranking.

export { DEFAULT_MASTRA_QUERY_CONFIG, PRODUCTION_MASTRA_QUERY_CONFIG, QUERY_GENERATOR_SYSTEM_PROMPT } from "./prompts";
export { coerceQueryList, fallbackQueries, generateQueries } from "./query-generator";
export { parseSkillFinderOutput, findSkills } from "./skill-finder";
export { aggregateSkills } from "./skill-aggregator";
export { createBufferedLogger } from "./logger";
export { OpenRouterMastraTextClient } from "./openrouter-client";
export { recommendSkills, recommendSkillsWithOpenRouter } from "./pipeline";
export type { OpenRouterMastraTextClientOptions } from "./openrouter-client";
export type {
  LogLevel,
  MastraQueryGeneratorConfig,
  MastraTextClient,
  QueryGeneratorInput,
  QueryGeneratorOutput,
  Skill,
  SkillFinderInput,
  SkillFinderOutput,
  SkillRecommendationLogger,
  SkillRecommendationResult,
} from "./types";
