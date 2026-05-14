// ABOUTME: Defines stable contracts for the skill recommendation pipeline blocks.
// ABOUTME: Keeps Phase 1 query generation and skill finding swappable.

export interface QueryGeneratorInput {
  query: string;
}

export interface QueryGeneratorOutput {
  originalQuery: string;
  refinedQueries: string[];
}

export interface MastraQueryGeneratorConfig {
  model: string;
  temperature: number;
  maxQueries: number;
  timeoutMs: number;
}

export interface MastraTextClient {
  generateText(input: {
    system: string;
    prompt: string;
    model: string;
    temperature: number;
    timeoutMs: number;
  }): Promise<string>;
}

export interface Skill {
  id: string;
  name: string;
  relevanceScore: number;
  description?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface SkillFinderInput {
  refinedQueries: string[];
}

export interface SkillFinderOutput {
  originalQuery: string;
  aggregatedSkills: Skill[];
}

export interface SkillRecommendationResult {
  originalQuery: string;
  refinedQueries: string[];
  skillsByQuery: Record<string, Skill[]>;
  aggregatedSkills: Skill[];
  latencyMs: number;
  warnings: string[];
}

export type LogLevel = "debug" | "info" | "error";

export interface SkillRecommendationLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
