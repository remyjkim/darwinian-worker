import type { Skill, SkillRecommendationLogger } from "./types";

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  testing: "Provides utilities for automated testing and test execution",
  security: "Enhances security posture and identifies vulnerabilities",
  performance: "Analyzes and optimizes application performance characteristics",
  deployment: "Facilitates deployment processes and release management",
  documentation: "Generates, maintains, and publishes documentation",
  patterns: "Demonstrates architectural patterns and industry best practices",
  code_quality: "Enforces code standards and identifies code quality issues",
  debugging: "Assists with debugging workflows and problem diagnosis",
  refactoring: "Facilitates code restructuring and architectural improvements",
  internationalization: "Provides support for localization and multi-language applications",
  "build tools": "Streamlines build processes and compilation",
  "package management": "Manages dependencies and package versions",
  database: "Database connectivity and ORM functionality",
  api: "REST API design, GraphQL, and server frameworks",
  state_management: "Manages application state and data flow",
  ui_components: "Pre-built user interface components and libraries",
};

export function generateSkillExplanation(skill: Skill): string {
  // Use existing summary/description if available
  const summary = (skill.metadata?.summary as string) || skill.description;
  if (summary && summary.length > 20) {
    return summary;
  }

  // Extract domain from skill name or metadata
  const nameWords = skill.name.toLowerCase().split(/[-_\s]/);
  const skillId = (skill.metadata?.skillId as string) || skill.id || "";
  const idWords = skillId.toLowerCase().split(/[-_/@]/);
  const allWords = [...nameWords, ...idWords];

  // Find matching domain description
  for (const word of allWords) {
    for (const [domain, description] of Object.entries(DOMAIN_DESCRIPTIONS)) {
      const domainPrefix = domain.split("_")[0] || "";
      if (domain.includes(word) || word.includes(domainPrefix)) {
        return description;
      }
    }
  }

  // Generic fallback
  return `A versatile package for development that enhances project capabilities.`;
}

export function enrichSkillsWithSummaries(
  skills: Skill[],
  _client?: any,
  _logger?: SkillRecommendationLogger,
): Skill[] {
  // Use rule-based explanations instead of API calls
  return skills.map((skill) => ({
    ...skill,
    metadata: {
      ...skill.metadata,
      summary: generateSkillExplanation(skill),
    },
  }));
}
