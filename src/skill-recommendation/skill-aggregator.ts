// ABOUTME: Aggregates skill finder results across refined queries.
// ABOUTME: Deduplicates by skill id while preserving the strongest relevance score.

import type { Skill } from "./types";

export function aggregateSkills(skillsByQuery: Map<string, Skill[]> | Record<string, Skill[]>, targetLimit = 30): Skill[] {
  const groups = skillsByQuery instanceof Map ? [...skillsByQuery.values()] : Object.values(skillsByQuery);
  const byId = new Map<string, Skill>();

  for (const skills of groups) {
    for (const skill of skills) {
      const existing = byId.get(skill.id);
      if (!existing || skill.relevanceScore > existing.relevanceScore) {
        byId.set(skill.id, skill);
      }
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.id.localeCompare(b.id))
    .slice(0, targetLimit);
}
