import type { MastraTextClient, Skill, SkillRecommendationLogger } from "./types";
import { OpenRouterMastraTextClient } from "./openrouter-client";

export async function generateSkillSummary(
  skill: Skill,
  client: MastraTextClient,
  logger?: SkillRecommendationLogger,
): Promise<string> {
  const system = "You are a technical documentation expert.";
  const prompt = `Generate a concise 3-sentence summary of what the following skill/package does.

Skill: ${skill.name}
ID: ${skill.id}
${skill.description ? `Description: ${skill.description}` : ""}

Return ONLY the 3-sentence summary, no additional text or formatting.`;

  try {
    const response = await client.generateText({
      system,
      prompt,
      model: "minimax/minimax-text-01",
      temperature: 0.5,
      timeoutMs: 3000,
    });

    return response.trim();
  } catch (error) {
    logger?.error("Failed to generate skill summary", {
      skillId: skill.id,
      skillName: skill.name,
      error: formatError(error),
    });
    return `${skill.name} is a useful package for development.`;
  }
}

export async function enrichSkillsWithSummaries(
  skills: Skill[],
  client?: MastraTextClient,
  logger?: SkillRecommendationLogger,
): Promise<Skill[]> {
  const resolvedClient = client ?? new OpenRouterMastraTextClient();

  const summaries = await Promise.all(
    skills.map((skill) =>
      generateSkillSummary(skill, resolvedClient, logger).catch(() =>
        `${skill.name} is a useful package for development.`,
      ),
    ),
  );

  return skills.map((skill, i) => ({
    ...skill,
    metadata: {
      ...skill.metadata,
      summary: summaries[i],
    },
  }));
}

function formatError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { message: String(error) };
}
