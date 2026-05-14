// ABOUTME: Stores the Mastra query expansion prompt and default generation settings.
// ABOUTME: Constrains Phase 1 query generation to five deliberate search angles.

import type { MastraQueryGeneratorConfig } from "./types";

export const DEFAULT_MASTRA_QUERY_CONFIG: MastraQueryGeneratorConfig = {
  model: "minimax/minimax-text-01",
  temperature: 0.2,
  maxQueries: 3,
  timeoutMs: 5_000,
};

export const PRODUCTION_MASTRA_QUERY_CONFIG: MastraQueryGeneratorConfig = {
  model: "minimax/minimax-text-01",
  temperature: 0.2,
  maxQueries: 3,
  timeoutMs: 5_000,
};

export const QUERY_GENERATOR_SYSTEM_PROMPT = [
  "You are the Query Generator block in a skill recommendation pipeline.",
  "Generate EXACTLY 3 concise search queries for the user's skill discovery request.",
  "Return JSON only: an array of 3 strings.",
  "Each query must explore a distinct search strategy:",
  "1. Library or package names",
  "2. Problem-solution wording",
  "3. Pattern, framework, or use cases",
  "Prevent query explosion: do not return more than 3 queries, do not include explanations, and keep each query under 12 words.",
].join("\n");
