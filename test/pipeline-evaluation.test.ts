// ABOUTME: Runs deterministic end-to-end evaluation for the Phase 1 recommendation pipeline.
// ABOUTME: Checks latency, candidate counts, fallbacks, instrumentation, and output logging.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import sampleQueries from "./sample-queries.json";
import { createBufferedLogger } from "../src/skill-recommendation/logger";
import { recommendSkills } from "../src/skill-recommendation/pipeline";
import type { Skill } from "../src/skill-recommendation/types";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("skill recommendation pipeline", () => {
  test("orchestrates query generation, skill finding, and aggregation", async () => {
    const result = await recommendSkills("frontend testing", {
      skillFinder: async (query) => fixtureSkills(query),
    });

    expect(result.refinedQueries).toHaveLength(5);
    expect(Object.keys(result.skillsByQuery)).toHaveLength(5);
    expect(result.aggregatedSkills).toHaveLength(25);
    expect(result.warnings).toEqual([]);
    expect(result.latencyMs).toBeLessThan(2_000);
  });

  test("handles skill finder exceptions with empty-array fallback and error logs", async () => {
    const logger = createBufferedLogger();
    const result = await recommendSkills("database migration", {
      logger,
      skillFinder: async (query) => {
        if (query.includes("problem solution")) {
          throw new Error("finder unavailable");
        }
        return fixtureSkills(query);
      },
    });

    expect(result.warnings).toHaveLength(1);
    expect(Object.values(result.skillsByQuery).some((skills) => skills.length === 0)).toBe(true);
    expect(logger.entries.some((entry) => entry.level === "error" && entry.message === "Skill finder failed in pipeline")).toBe(
      true,
    );
  });

  test("logs debug candidates, info latency, and writes an output file", async () => {
    const root = await createTempRoot("pipeline-log-");
    tempRoots.push(root);
    const outputDir = join(root, "logs");
    await mkdir(outputDir, { recursive: true });
    const outputFile = join(outputDir, "skill-recommendation.jsonl");
    const logger = createBufferedLogger(outputFile);

    await recommendSkills("agent native tool architecture", {
      logger,
      skillFinder: async (query) => fixtureSkills(query),
    });
    await logger.flush();

    const logText = await readFile(outputFile, "utf8");
    expect(logText).toContain("Pipeline refined queries");
    expect(logText).toContain("Pipeline aggregated candidates");
    expect(logText).toContain("Skill recommendation pipeline completed");
    expect(logger.entries.some((entry) => entry.level === "info" && typeof entry.context?.latencyMs === "number")).toBe(
      true,
    );
  });

  test("end-to-end evaluation meets 80 percent success across 10 sample queries", async () => {
    let successfulQueries = 0;

    for (const sample of sampleQueries) {
      const result = await recommendSkills(sample.query, {
        skillFinder: async (query) => fixtureSkills(query),
      });
      const enoughCandidates = result.aggregatedSkills.length >= 20 && result.aggregatedSkills.length <= 30;
      const relevantCandidates = result.aggregatedSkills.filter((skill) => skill.relevanceScore >= 0.75).length;
      const relevanceRate = relevantCandidates / result.aggregatedSkills.length;
      if (result.latencyMs < 2_000 && enoughCandidates && relevanceRate >= 0.8) {
        successfulQueries += 1;
      }
    }

    expect(successfulQueries / sampleQueries.length).toBeGreaterThanOrEqual(0.8);
  });
});

function fixtureSkills(query: string): Skill[] {
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return Array.from({ length: 5 }, (_, index) => ({
    id: `${slug || "query"}-${index}`,
    name: `${query} skill ${index + 1}`,
    relevanceScore: 0.95 - index * 0.03,
    description: `Candidate ${index + 1} for ${query}`,
  }));
}
