import { generateQueries } from "./cli/commands/recommend/query-generator";
import type { MastraTextClient } from "./cli/commands/recommend/types";

const mockLLM: MastraTextClient = {
  async generateText(input) {
    // Simulate real LLM response
    console.log("📝 System Prompt sent to LLM:");
    console.log(input.system);
    console.log("\n📝 User Prompt sent to LLM:");
    console.log(input.prompt);
    console.log("\n✅ LLM returns:\n");
    return JSON.stringify([
      "testing frameworks and test runners",
      "development workflow testing automation",
      "test-driven development patterns practices"
    ]);
  },
};

const result = await generateQueries(
  { query: "test development" },
  { client: mockLLM }
);
console.log("Final refined queries:", JSON.stringify(result.refinedQueries, null, 2));
