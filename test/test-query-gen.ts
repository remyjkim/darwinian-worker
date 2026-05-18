import { generateQueries } from "./cli/commands/recommend/query-generator";

// Test 1: With query "test development"
console.log("=== Test 1: Query 'test development' (fallback) ===");
const result1 = await generateQueries({ query: "test development" });
console.log("Original:", result1.originalQuery);
console.log("Refined:", JSON.stringify(result1.refinedQueries, null, 2));

// Test 2: No query (empty)
console.log("\n=== Test 2: No query (empty) ===");
const result2 = await generateQueries({ query: "" });
console.log("Original:", result2.originalQuery);
console.log("Refined:", JSON.stringify(result2.refinedQueries, null, 2));

// Test 3: With project context
console.log("\n=== Test 3: With project context ===");
const result3 = await generateQueries(
  {
    query: "testing",
    context: {
      readmeSummary: "TypeScript CLI tool",
      languages: { TypeScript: 100 },
      frameworks: [],
      runtimes: { runtimes: ["Bun"], packageManagers: ["bun"] },
      existingPackages: ["typescript"],
      recentSessionThemes: ["CLI", "automation"],
    },
  },
);
console.log("Original:", result3.originalQuery);
console.log("Refined:", JSON.stringify(result3.refinedQueries, null, 2));
