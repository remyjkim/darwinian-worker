// ABOUTME: Wraps the external `npx skills find` command for recommendation candidates.
// ABOUTME: Normalizes JSON output into scored Skill records with graceful failures.

import type { Skill, SkillRecommendationLogger } from "./types";

export interface FindSkillsOptions {
  command?: string[];
  limit?: number;
  env?: Record<string, string | undefined>;
  cwd?: string;
  logger?: SkillRecommendationLogger;
}

type RawSkillResult = {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  description?: unknown;
  score?: unknown;
  relevanceScore?: unknown;
  relevance?: unknown;
  source?: unknown;
};

export async function findSkills(query: string, options: FindSkillsOptions = {}): Promise<Skill[]> {
  const limit = options.limit ?? 5;
  const baseCommand = options.command ?? ["npx", "skills", "find"];
  const args = [...baseCommand, query];

  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      options.logger?.error("Skill finder command failed", { query, exitCode, stderr: stderr.trim() });
      return [];
    }

    const skills = parseSkillFinderOutput(stdout).slice(0, limit);
    options.logger?.debug("Skill finder candidates", { query, candidates: skills });
    return skills;
  } catch (error) {
    options.logger?.error("Skill finder execution failed", { query, error: formatError(error) });
    return [];
  }
}

export function parseSkillFinderOutput(output: string): Skill[] {
  // Try JSON first
  try {
    const parsed = JSON.parse(output) as unknown;
    const rawResults = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { results?: unknown })?.results)
        ? (parsed as { results: unknown[] }).results
        : [];

    if (rawResults.length > 0) {
      return rawResults
        .map((item) => normalizeSkill(item))
        .filter((item): item is Skill => item !== undefined)
        .sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
  } catch {
    // Fall through to text parsing
  }

  // Strip ANSI color codes and parse text format: "owner/repo@skill 1.2K installs"
  const stripped = output.replace(/\x1b\[[0-9;]*m/g, "");
  const lines = stripped.split("\n");
  const skills: Skill[] = [];
  let url = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // URL line (starts with └)
    if (trimmed.startsWith("└")) {
      url = trimmed.replace(/^└\s*/, "").trim();
      continue;
    }

    // Skill line with install count: "owner/repo@skill 1.2K installs"
    const match = trimmed.match(/^([^\s]+)\s+([\d.]+[KMB]?)\s+installs?$/);
    if (match && match[1] && match[2]) {
      const skillId = match[1];
      const installStr = match[2];
      const installs = parseInstallCount(installStr);
      const relevanceScore = Math.min(1, installs / 1000); // Normalize: 1000+ installs = 1.0

      const nameMatch = skillId.match(/@([^/:]+)$/);
      const name = nameMatch?.[1] ?? skillId;

      skills.push({
        id: skillId,
        name,
        relevanceScore,
        source: url || undefined,
        metadata: { installs, skillId },
      });

      url = "";
    }
  }

  return skills.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function parseInstallCount(str: string): number {
  const num = parseFloat(str);
  if (str.includes("K")) return num * 1000;
  if (str.includes("M")) return num * 1000000;
  if (str.includes("B")) return num * 1000000000;
  return num;
}

function normalizeSkill(item: unknown): Skill | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }

  const raw = item as RawSkillResult;
  const id = asString(raw.id);
  const name = asString(raw.name) ?? asString(raw.title) ?? id;
  if (!id || !name) {
    return undefined;
  }

  return {
    id,
    name,
    relevanceScore: asNumber(raw.relevanceScore) ?? asNumber(raw.score) ?? asNumber(raw.relevance) ?? 0,
    description: asString(raw.description),
    source: asString(raw.source),
    metadata: item as Record<string, unknown>,
  };
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function formatError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
}
