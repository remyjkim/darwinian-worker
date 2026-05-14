// ABOUTME: Expands a user skill-discovery query into five focused search variants.
// ABOUTME: Uses a Mastra-compatible text client with deterministic fallback behavior.

import { DEFAULT_MASTRA_QUERY_CONFIG, QUERY_GENERATOR_SYSTEM_PROMPT } from "./prompts";
import type {
  MastraQueryGeneratorConfig,
  MastraTextClient,
  QueryGeneratorInput,
  QueryGeneratorOutput,
  SkillRecommendationLogger,
} from "./types";

const QUERY_COUNT = 5;

export interface GenerateQueriesOptions {
  client?: MastraTextClient;
  config?: Partial<MastraQueryGeneratorConfig>;
  logger?: SkillRecommendationLogger;
}

export async function generateQueries(
  input: QueryGeneratorInput,
  options: GenerateQueriesOptions = {},
): Promise<QueryGeneratorOutput> {
  const originalQuery = normalizeQuery(input.query);
  if (!originalQuery) {
    return { originalQuery: input.query, refinedQueries: fallbackQueries("skill discovery") };
  }

  if (!options.client) {
    return { originalQuery, refinedQueries: fallbackQueries(originalQuery) };
  }

  const config = { ...DEFAULT_MASTRA_QUERY_CONFIG, ...options.config };

  try {
    const response = await options.client.generateText({
      system: QUERY_GENERATOR_SYSTEM_PROMPT,
      prompt: `User query: ${originalQuery}`,
      model: config.model,
      temperature: config.temperature,
      timeoutMs: config.timeoutMs,
    });
    const refinedQueries = coerceQueryList(response, originalQuery, config.maxQueries);
    options.logger?.debug("Generated refined queries", { originalQuery, refinedQueries });
    return { originalQuery, refinedQueries };
  } catch (error) {
    options.logger?.error("Query generation failed; using fallback queries", {
      originalQuery,
      error: formatError(error),
    });
    return { originalQuery, refinedQueries: fallbackQueries(originalQuery) };
  }
}

export function coerceQueryList(response: string, originalQuery: string, maxQueries = QUERY_COUNT): string[] {
  const parsed = parseQueryResponse(response);
  const candidates = parsed.length > 0 ? parsed : response.split(/\r?\n|,/);
  const unique = dedupeQueries(candidates.map(normalizeQuery).filter(Boolean));
  return ensureQueryCount(unique, originalQuery, maxQueries);
}

export function fallbackQueries(query: string): string[] {
  const normalized = normalizeQuery(query) || "skill discovery";
  return [
    `${normalized} library package`,
    `${normalized} problem solution`,
    `${normalized} workflow pattern`,
    `${normalized} use case`,
    `${normalized} alternatives tools`,
  ];
}

function parseQueryResponse(response: string): string[] {
  for (const candidate of responseCandidates(response)) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { queries?: unknown }).queries)) {
        return (parsed as { queries: unknown[] }).queries.filter((item): item is string => typeof item === "string");
      }
    } catch {
      continue;
    }
  }

  return [];
}

function responseCandidates(response: string) {
  const trimmed = response.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  if (fenced) {
    candidates.push(fenced);
  }
  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  }
  return candidates;
}

function normalizeQuery(query: string) {
  return query
    .trim()
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ");
}

function ensureQueryCount(queries: string[], originalQuery: string, maxQueries: number) {
  const target = Math.max(1, Math.min(maxQueries, QUERY_COUNT));
  const merged = dedupeQueries([...queries, ...fallbackQueries(originalQuery)]);
  return merged.slice(0, target);
}

function dedupeQueries(queries: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const query of queries) {
    const key = query.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(query);
    }
  }
  return unique;
}

function formatError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
}
