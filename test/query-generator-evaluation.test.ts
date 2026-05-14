// ABOUTME: Evaluates query generation against the Phase 1 sample query set.
// ABOUTME: Protects five-query output, distinct angles, fallback, and prompt wiring.

import { describe, expect, test } from "bun:test";
import sampleQueries from "./sample-queries.json";
import { QUERY_GENERATOR_SYSTEM_PROMPT } from "../src/skill-recommendation/prompts";
import { coerceQueryList, fallbackQueries, generateQueries } from "../src/skill-recommendation/query-generator";
import type { MastraTextClient } from "../src/skill-recommendation/types";

describe("query generator", () => {
  test("system prompt constrains Mastra to five distinct strategies", () => {
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("EXACTLY 5");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("Library or package names");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("Problem-solution wording");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("Pattern, framework, or workflow names");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("Concrete use cases");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("Related tools or alternatives");
    expect(QUERY_GENERATOR_SYSTEM_PROMPT).toContain("Prevent query explosion");
  });

  test("calls Mastra-compatible client and returns five refined queries", async () => {
    const calls: Array<{ system: string; prompt: string }> = [];
    const client: MastraTextClient = {
      async generateText(input) {
        calls.push({ system: input.system, prompt: input.prompt });
        return JSON.stringify([
          "react hooks library",
          "react state problem solution",
          "custom hook workflow pattern",
          "reusable component use case",
          "react hooks alternatives tools",
        ]);
      },
    };

    const output = await generateQueries({ query: "find react hook" }, { client });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toBe(QUERY_GENERATOR_SYSTEM_PROMPT);
    expect(calls[0]?.prompt).toContain("find react hook");
    expect(output.refinedQueries).toHaveLength(5);
    expect(new Set(output.refinedQueries.map((query) => query.toLowerCase())).size).toBe(5);
  });

  test("uses fallback queries when Mastra fails", async () => {
    const client: MastraTextClient = {
      async generateText() {
        throw new Error("provider unavailable");
      },
    };

    const output = await generateQueries({ query: "database migrations" }, { client });

    expect(output.refinedQueries).toEqual(fallbackQueries("database migrations"));
  });

  test("coerces fenced JSON responses from real providers", () => {
    const output = coerceQueryList(
      [
        "```json",
        "[",
        '  "React Hook libraries for state management",',
        '  "How to use React Hooks for form handling",',
        '  "Popular React patterns with Hooks",',
        '  "Use cases for React Hooks in web apps",',
        '  "Alternatives to React Hooks for state management"',
        "]",
        "```",
      ].join("\n"),
      "find react hook",
    );

    expect(output).toEqual([
      "React Hook libraries for state management",
      "How to use React Hooks for form handling",
      "Popular React patterns with Hooks",
      "Use cases for React Hooks in web apps",
      "Alternatives to React Hooks for state management",
    ]);
  });

  test("sample set produces five distinct queries for at least 80 percent of cases", async () => {
    let successes = 0;
    for (const sample of sampleQueries) {
      const output = await generateQueries({ query: sample.query });
      const uniqueCount = new Set(output.refinedQueries.map((query) => query.toLowerCase())).size;
      if (output.refinedQueries.length === 5 && uniqueCount === 5) {
        successes += 1;
      }
    }

    expect(successes / sampleQueries.length).toBeGreaterThanOrEqual(0.8);
  });
});
