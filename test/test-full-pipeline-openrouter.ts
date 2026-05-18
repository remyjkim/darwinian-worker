import { recommendSkillsWithOpenRouter, createBufferedLogger } from "../cli/commands/recommend";

async function testFullPipeline() {
  console.log("Testing full skill recommendation pipeline with OpenRouter...\n");

  const logger = createBufferedLogger();

  try {
    console.log("Running: recommendSkillsWithOpenRouter('React state management')\n");
    const result = await recommendSkillsWithOpenRouter("React state management", { logger });

    console.log("═══════════════════════════════════════════════════════════");
    console.log("PIPELINE RESULTS");
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log("Original Query:");
    console.log(`  ${result.originalQuery}\n`);

    console.log("Refined Queries:");
    result.refinedQueries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

    console.log(`\nSkills by Query:`);
    Object.entries(result.skillsByQuery).forEach(([query, skills]) => {
      console.log(`  "${query}": ${skills.length} candidates`);
    });

    console.log(`\nAggregated Candidates (top 10):`);
    result.aggregatedSkills.slice(0, 10).forEach((skill, i) => {
      console.log(`  ${i + 1}. ${skill.name} (${skill.id}) - score: ${skill.relevanceScore.toFixed(2)}`);
    });

    console.log(`\nTotal aggregated: ${result.aggregatedSkills.length}`);
    console.log(`Latency: ${result.latencyMs.toFixed(0)}ms`);
    console.log(`Warnings: ${result.warnings.length > 0 ? result.warnings.join(", ") : "none"}`);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✓ Pipeline executed successfully with OpenRouter!");
    console.log("═══════════════════════════════════════════════════════════");
  } catch (error) {
    console.error("\n✗ Pipeline failed:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testFullPipeline();
