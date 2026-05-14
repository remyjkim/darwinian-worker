import type { MastraTextClient, Skill, SkillRecommendationLogger } from "./types";
import { OpenRouterMastraTextClient } from "./openrouter-client";

export async function enrichSkillsWithSummaries(
  skills: Skill[],
  client?: MastraTextClient,
  logger?: SkillRecommendationLogger,
): Promise<Skill[]> {
  try {
    const resolvedClient = client ?? new OpenRouterMastraTextClient();

    // Generate summaries in parallel for all skills using minimax
    const summaries = await Promise.all(
      skills.map((skill) =>
        generateSkillSummary(skill, resolvedClient).catch((error) => {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger?.error("Failed to generate skill summary", {
            skillId: skill.id,
            skillName: skill.name,
            error: errorMsg,
          });
          process.stderr.write(`Error summarizing ${skill.name}: ${errorMsg}\n`);
          return `${skill.name} is a useful package for development.`;
        }),
      ),
    );

    return skills.map((skill, i) => ({
      ...skill,
      metadata: {
        ...skill.metadata,
        summary: summaries[i],
      },
    }));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger?.error("Failed to initialize OpenRouter client", { error: errorMsg });
    process.stderr.write(
      `⚠️  Warning: Could not generate skill summaries (${errorMsg})\n`
    );
    // Return skills without summaries if client initialization fails
    return skills;
  }
}

async function generateSkillSummary(
  skill: Skill,
  client: MastraTextClient,
): Promise<string> {
  const prompt = `Generate a comprehensive 3-5 sentence summary of what the "${skill.name}" package/skill does, its main purpose, and typical use cases.

Return ONLY the summary sentences, no additional text or formatting.`;

  const response = await client.generateText({
    system: "You are a technical documentation expert. Generate clear, informative summaries.",
    prompt,
    model: "openai/gpt-3.5-turbo",
    temperature: 0.2,
    timeoutMs: 5000,
  });

  return response.trim();
}
