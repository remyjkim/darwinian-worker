import { recommendSkills } from "./cli/commands/recommend/pipeline";

async function main() {
  console.log("🚀 End-to-End Pipeline Test with Filtering");
  console.log("==========================================\n");

  try {
    // Test query: ask for testing-related skills
    const userQuery = "testing and quality assurance";

    console.log(`📝 User Query: "${userQuery}"\n`);

    console.log("⏳ Running recommendation pipeline...\n");

    const result = await recommendSkills(userQuery, {
      repoPath: process.cwd(),
    });

    console.log("✅ Pipeline completed successfully!\n");

    console.log("📊 Results:");
    console.log("===========");
    console.log(`  • Refined Queries: ${result.refinedQueries.length}`);
    console.log(`    - ${result.refinedQueries.join("\n    - ")}\n`);

    console.log(`  • Skills Found (before filtering): ${Object.values(result.skillsByQuery).flat().length}`);
    console.log(`  • Aggregated Skills (after filtering): ${result.aggregatedSkills.length}`);

    console.log("\n🔍 Context Detected:");
    console.log(`  • Languages: ${Object.keys(result.projectContext.languages).join(", ") || "none"}`);
    console.log(`  • Frameworks: ${result.projectContext.frameworks.join(", ") || "none"}`);
    console.log(`  • Installed Skills: ${result.projectContext.installedSkills.length}`);
    console.log(`  • Installed MCP Servers: ${result.projectContext.installedMcpServers.join(", ") || "none"}`);

    console.log("\n🎯 Top Recommended Skills:");
    result.aggregatedSkills.slice(0, 5).forEach((skill, idx) => {
      console.log(
        `  ${idx + 1}. ${skill.name} (score: ${skill.relevanceScore.toFixed(2)})`,
      );
    });

    console.log("\n⚡ Performance:");
    console.log(`  • Context Extraction: ${result.contextLatencyMs.toFixed(0)}ms`);
    console.log(`  • Total Pipeline: ${result.latencyMs.toFixed(0)}ms`);

    if (result.warnings.length > 0) {
      console.log("\n⚠️  Warnings:");
      result.warnings.forEach((w) => console.log(`  • ${w}`));
    }

    console.log("\n✨ Filtering in Action:");
    console.log(`  ${result.aggregatedSkills.length} new skills recommended`);
    console.log(
      `  (${result.projectContext.installedSkills.length} installed skills filtered out)`,
    );
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
