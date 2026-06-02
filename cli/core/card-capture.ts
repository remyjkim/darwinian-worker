// ABOUTME: Captures an existing project's effective harness state as a card source.
// ABOUTME: Provides the Wave 2 authoring entry point shared by core tests and CLI.

import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createCardSource } from "./card-store";
import { type CardManifest } from "./card-manifest";
import { resolveSkillSource } from "./card-skill-resolver";
import { buildEffectiveState } from "./effective-state";
import { writeAtomically } from "./fs";
import type { SyncOptions } from "./types";

export interface CaptureProjectOptions {
  agentsDir: string;
  repoRoot: string;
  homeDir: string;
  projectPath: string;
  name: string;
  scope?: string;
  noGit?: boolean;
}

export interface CaptureProjectResult {
  name: string;
  sourceDir: string;
  manifestPath: string;
  skillCount: number;
  serverCount: number;
  extensionCount: number;
  targetCount: number;
}

function uniqueSelectedSkills(include: string[] = [], exclude: string[] = []) {
  const excluded = new Set(exclude);
  return [...new Set(include)].filter((name) => !excluded.has(name));
}

export async function captureProjectAsCard(options: CaptureProjectOptions): Promise<CaptureProjectResult> {
  const state = await buildEffectiveState({
    repoRoot: options.repoRoot,
    agentsDir: options.agentsDir,
    homeDir: options.homeDir,
    cwd: options.projectPath,
  } satisfies SyncOptions);
  if (!state.projectRoot) {
    throw new Error(`Not a drwn project: ${options.projectPath} (no .agents/drwn/config.json)`);
  }

  const source = await createCardSource({
    agentsDir: options.agentsDir,
    name: options.name,
    scope: options.scope,
    noGit: options.noGit,
  });

  try {
    const skillNames = uniqueSelectedSkills(state.skillSelection?.include, state.skillSelection?.exclude);
    for (const skillName of skillNames) {
      const resolved = await resolveSkillSource(skillName, state.lockedCards, options.repoRoot, options.agentsDir);
      if (resolved.layer === "missing") {
        throw new Error(resolved.reason);
      }
      await cp(resolved.path, join(source.sourceDir, "skills", skillName), {
        recursive: true,
        verbatimSymlinks: false,
      });
    }

    const extensions = state.projectConfigWithCards?.extensions ?? {};
    const targets = state.projectConfigWithCards?.targets ?? {};
    const manifest: CardManifest = {
      name: source.name,
      version: "0.1.0",
      description: state.projectRoot ? `Captured from ${state.projectRoot}` : "Captured project harness",
      ...(skillNames.length > 0 ? { skills: { include: skillNames } } : {}),
      ...(Object.keys(state.activeServers).length > 0 ? { servers: state.activeServers } : {}),
      ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
      ...(Object.keys(targets).length > 0 ? { targets } : {}),
    };
    await writeAtomically(source.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    return {
      name: source.name,
      sourceDir: source.sourceDir,
      manifestPath: source.manifestPath,
      skillCount: skillNames.length,
      serverCount: Object.keys(state.activeServers).length,
      extensionCount: Object.keys(extensions).length,
      targetCount: Object.keys(targets).length,
    };
  } catch (error) {
    await rm(source.sourceDir, { recursive: true, force: true });
    throw error;
  }
}
