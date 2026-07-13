// ABOUTME: Maintains the opt-in machine index of drwn-managed project roots.
// ABOUTME: Widens store GC roots once projects.json is present.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { writeAtomically } from "./fs";
import { assertStoreWritable } from "./store-paths";
import { DrwnError } from "./errors";

export interface ProjectsIndex {
  schemaVersion: 1;
  projects: string[];
}

export function resolveProjectsIndexPath(agentsDir: string) {
  return join(agentsDir, "drwn", "projects.json");
}

export async function loadProjectsIndex(agentsDir: string): Promise<ProjectsIndex> {
  const indexPath = resolveProjectsIndexPath(agentsDir);
  if (!existsSync(indexPath)) {
    return { schemaVersion: 1, projects: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    throw new DrwnError("PROJECT_REGISTRY_INVALID", `Invalid project registry JSON: ${indexPath}`, undefined, error);
  }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const projects = record?.projects;
  if (
    !record ||
    Object.keys(record).some((key) => key !== "schemaVersion" && key !== "projects") ||
    record.schemaVersion !== 1 ||
    !Array.isArray(projects) ||
    !projects.every((project) => typeof project === "string" && project.length > 0)
  ) {
    throw new DrwnError("PROJECT_REGISTRY_INVALID", `Invalid project registry contract: ${indexPath}`);
  }
  return { schemaVersion: 1, projects: [...projects] as string[] };
}

export async function writeProjectsIndex(agentsDir: string, index: ProjectsIndex) {
  assertStoreWritable();
  const indexPath = resolveProjectsIndexPath(agentsDir);
  await mkdir(dirname(indexPath), { recursive: true });
  await writeAtomically(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

export async function registerProject(agentsDir: string, projectRoot: string) {
  const normalized = resolve(projectRoot);
  const index = await loadProjectsIndex(agentsDir);
  if (!index.projects.includes(normalized)) {
    index.projects.push(normalized);
    index.projects.sort((a, b) => a.localeCompare(b));
    await writeProjectsIndex(agentsDir, index);
  }
}

export async function unregisterProject(agentsDir: string, projectRoot: string) {
  const normalized = resolve(projectRoot);
  const index = await loadProjectsIndex(agentsDir);
  const next = index.projects.filter((project) => resolve(project) !== normalized);
  if (next.length === index.projects.length) return { removed: false, projectRoot: normalized };
  await writeProjectsIndex(agentsDir, { schemaVersion: 1, projects: next });
  return { removed: true, projectRoot: normalized };
}

export async function listRegisteredProjects(agentsDir: string) {
  return (await loadProjectsIndex(agentsDir)).projects;
}

export async function updateAllRegisteredProjects(options: {
  agentsDir: string;
  homeDir: string;
  repoRoot: string;
  fetch?: boolean;
  dryRun?: boolean;
  onProject?: (projectRoot: string) => void;
}) {
  const projects = await listRegisteredProjects(options.agentsDir);
  const results: Array<{ projectRoot: string; updated: boolean; message: string }> = [];
  const { findOutdatedProjectCards, updateProjectCardLock } = await import("./card-project");
  const { loadCardLock } = await import("./card-lock");
  const { syncRepository } = await import("./sync");
  const git = await import("./git");
  const { resolveCardBareRepoPath } = await import("./store-paths");

  for (const projectRoot of projects) {
    options.onProject?.(projectRoot);
    if (options.fetch) {
      const lock = await loadCardLock(projectRoot);
      for (const entry of lock?.cards ?? []) {
        if (!entry.git?.url) {
          continue;
        }
        await git.fetch(
          resolveCardBareRepoPath(options.agentsDir, entry.name),
          "origin",
          ["refs/heads/*:refs/heads/*", "refs/tags/*:refs/tags/*", "+refs/meta/*:refs/meta/*"],
        );
      }
    }
    const outdated = await findOutdatedProjectCards(projectRoot, options.agentsDir, {
      repoRoot: options.repoRoot,
      cwd: projectRoot,
    });
    if (outdated.length === 0) {
      results.push({ projectRoot, updated: false, message: "Nothing to update." });
      continue;
    }
    if (options.dryRun) {
      results.push({
        projectRoot,
        updated: false,
        message: `Would update: ${outdated.map((entry) => entry.name).join(", ")}`,
      });
      continue;
    }
    await updateProjectCardLock(projectRoot, options.agentsDir, {
      repoRoot: options.repoRoot,
      cwd: projectRoot,
    });
    await syncRepository({
      repoRoot: options.repoRoot,
      agentsDir: options.agentsDir,
      homeDir: options.homeDir,
      cwd: projectRoot,
    });
    results.push({
      projectRoot,
      updated: true,
      message: `Updated: ${outdated.map((entry) => entry.name).join(", ")}`,
    });
  }
  return results;
}
