import type { Skill, SkillRecommendationLogger } from "./types";
import { ClaudeApiClient } from "./claude-client";

export async function enrichSkillsWithSummaries(
  skills: Skill[],
  clientOptions?: { apiKey?: string; model?: string },
  logger?: SkillRecommendationLogger,
): Promise<Skill[]> {
  try {
    const client = new ClaudeApiClient(clientOptions);

    // Generate summaries in parallel for all skills
    const summaries = await Promise.all(
      skills.map((skill) =>
        client
          .generateSummary(skill.name, skill.id)
          .catch((error) => {
            logger?.error("Failed to generate skill summary", {
              skillId: skill.id,
              skillName: skill.name,
              error: error instanceof Error ? error.message : String(error),
            });
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
    logger?.error("Failed to initialize Claude client", { error: errorMsg });
    process.stderr.write(
      `⚠️  Warning: Could not generate skill summaries (${errorMsg})\n`
    );
    // Return skills without summaries if client initialization fails
    return skills;
  }
}
