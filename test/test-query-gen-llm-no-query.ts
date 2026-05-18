import { generateQueries } from "./cli/commands/recommend/query-generator";
import type { MastraTextClient } from "./cli/commands/recommend/types";

const mockLLM: MastraTextClient = {
  async generateText(input) {
    console.log("📝 System Prompt sent to LLM:");
    console.log(input.system);
    console.log("\n📝 User Prompt sent to LLM (no query, context-only):");
    console.log(input.prompt);
    console.log("\n✅ LLM returns:\n");
    return JSON.stringify([
      "testing automation tools packages",
      "CLI development automation patterns",
      "project quality assurance frameworks"
    ]);
  },
};

console.log("=== No Query + Project Context ===\n");
const result = await generateQueries(
  {
    query: "",
    context: {
      readmeSummary: "TypeScript CLI harness for skill recommendations",
      languages: { TypeScript: 90, Shell: 10 },
      frameworks: [],
      runtimes: { runtimes: ["Bun", "Node.js"], packageManagers: ["bun"] },
      existingPackages: ["typescript", "bun"],
      recentSessionThemes: ["testing", "CLI", "automation"],
    },
  },
  { client: mockLLM }
);

console.log("Final refined queries:", JSON.stringify(result.refinedQueries, null, 2));
