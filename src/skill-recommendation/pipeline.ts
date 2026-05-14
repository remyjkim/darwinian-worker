// ABOUTME: Orchestrates query generation, skill finding, aggregation, and instrumentation.
// ABOUTME: Exposes inspectable intermediate outputs for Phase 1 evaluation.

import { aggregateSkills } from "./skill-aggregator";
import { findSkills } from "./skill-finder";
import { generateQueries, type GenerateQueriesOptions } from "./query-generator";
import { OpenRouterMastraTextClient } from "./openrouter-client";
import { PRODUCTION_MASTRA_QUERY_CONFIG } from "./prompts";
import type { Skill, SkillRecommendationLogger, SkillRecommendationResult } from "./types";

export interface RecommendSkillsOptions extends GenerateQueriesOptions {
  skillFinder?: (query: string) => Promise<Skill[]>;
  logger?: SkillRecommendationLogger;
  targetLimit?: number;
}

export async function recommendSkills(
  userQuery: string,
  options: RecommendSkillsOptions = {},
): Promise<SkillRecommendationResult> {
  const startedAt = performance.now();
  const warnings: string[] = [];
  const queryOutput = await generateQueries(
    { query: userQuery },
    { client: options.client, config: options.config, logger: options.logger },
  );
  options.logger?.debug("Pipeline refined queries", {
    originalQuery: queryOutput.originalQuery,
    refinedQueries: queryOutput.refinedQueries,
  });

  const finder = options.skillFinder ?? ((query: string) => findSkills(query, { logger: options.logger }));
  const skillsByQuery: Record<string, Skill[]> = {};

  // Run skill finder calls in parallel for all queries
  const findResults = await Promise.all(
    queryOutput.refinedQueries.map(async (refinedQuery) => {
      try {
        const skills = await finder(refinedQuery);
        return { query: refinedQuery, skills, error: null };
      } catch (error) {
        warnings.push(`Skill finder failed for query: ${refinedQuery}`);
        options.logger?.error("Skill finder failed in pipeline", {
          originalQuery: queryOutput.originalQuery,
          refinedQuery,
          error: formatError(error),
        });
        return { query: refinedQuery, skills: [], error };
      }
    })
  );

  // Build skillsByQuery from results
  for (const result of findResults) {
    skillsByQuery[result.query] = result.skills;
  }

  const aggregatedSkills = aggregateSkills(skillsByQuery, options.targetLimit ?? 30);
  const latencyMs = performance.now() - startedAt;
  options.logger?.debug("Pipeline aggregated candidates", {
    originalQuery: queryOutput.originalQuery,
    candidateCount: aggregatedSkills.length,
    aggregatedSkills,
  });
  options.logger?.info("Skill recommendation pipeline completed", {
    originalQuery: queryOutput.originalQuery,
    latencyMs,
    refinedQueryCount: queryOutput.refinedQueries.length,
    candidateCount: aggregatedSkills.length,
  });

  return {
    originalQuery: queryOutput.originalQuery,
    refinedQueries: queryOutput.refinedQueries,
    skillsByQuery,
    aggregatedSkills,
    latencyMs,
    warnings,
  };
}

function formatError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
}

export async function recommendSkillsWithOpenRouter(
  userQuery: string,
  options?: Omit<RecommendSkillsOptions, "client">,
): Promise<SkillRecommendationResult> {
  const client = new OpenRouterMastraTextClient();
  return recommendSkills(userQuery, {
    ...options,
    client,
    config: options?.config ?? PRODUCTION_MASTRA_QUERY_CONFIG,
  });
}
