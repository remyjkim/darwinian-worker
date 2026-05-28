// ABOUTME: Applies Harness Card selections to per-project config and lockfiles.
// ABOUTME: Keeps card consumer commands consistent and side-effect-light.

import { dirname } from "node:path";
import { loadCardLock, writeCardLock, type CardLockEntry } from "./card-lock";
import {
  cardNamesEqual,
  formatCardSpec,
  isNewerVersion,
  listCards,
  parseCardRef,
  resolveCard,
} from "./card-store";
import { loadProjectConfig, resolveProjectRootFromConfigPath } from "./project";
import { projectConfigPath, readProjectConfigForWrite, writeProjectConfigForWrite } from "./project-writes";
import type { CardManifest } from "./card-manifest";
import type { ProjectConfig } from "./types";

export interface CardProjectMutation {
  projectConfigPath: string;
  lockPath: string;
  cards: string[];
  locked: CardLockEntry[];
}

export async function resolveProjectCards(agentsDir: string, specs: string[]): Promise<CardLockEntry[]> {
  const resolved = await Promise.all(specs.map((spec) => resolveCard(agentsDir, spec)));
  return resolved
    .map((card) => ({
      name: card.name,
      requested: card.requested,
      version: card.version,
      path: card.dir,
      integrity: card.integrity,
      manifest: card.manifest,
      skills: card.manifest.skills?.include ?? [],
      registry: null as null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function mergeCardManifestsIntoProjectConfig(project: ProjectConfig, manifests: CardManifest[]): ProjectConfig {
  const next: ProjectConfig = JSON.parse(JSON.stringify(project));
  const skillIncludes = new Set<string>();

  for (const manifest of manifests) {
    for (const skill of manifest.skills?.include ?? []) {
      skillIncludes.add(skill);
    }
    if (manifest.servers) {
      next.servers = {
        ...(next.servers ?? {}),
        ...manifest.servers,
      };
    }
    if (manifest.extensions) {
      next.extensions = {
        ...(next.extensions ?? {}),
        ...manifest.extensions,
      };
    }
    if (manifest.targets) {
      next.targets = {
        ...(next.targets ?? {}),
        ...manifest.targets,
      };
    }
  }

  for (const skill of project.skills?.include ?? []) {
    skillIncludes.add(skill);
  }
  if (skillIncludes.size > 0 || project.skills?.exclude) {
    next.skills = {
      include: [...skillIncludes],
      exclude: project.skills?.exclude,
    };
  }
  next.servers = {
    ...Object.assign({}, ...manifests.map((manifest) => manifest.servers ?? {})),
    ...(project.servers ?? {}),
  };
  next.extensions = {
    ...Object.assign({}, ...manifests.map((manifest) => manifest.extensions ?? {})),
    ...(project.extensions ?? {}),
  };
  next.targets = {
    ...Object.assign({}, ...manifests.map((manifest) => manifest.targets ?? {})),
    ...(project.targets ?? {}),
  };
  return next;
}

export async function writeProjectCards(projectRoot: string, agentsDir: string, specs: string[]): Promise<CardProjectMutation> {
  const config = readProjectConfigForWrite(projectRoot);
  config.cards = [...specs];
  const configPath = writeProjectConfigForWrite(projectRoot, config);
  const locked = await resolveProjectCards(agentsDir, config.cards);
  const lockPath = writeCardLock(projectRoot, locked);
  return { projectConfigPath: configPath, lockPath, cards: config.cards, locked };
}

export async function getCurrentProjectCardSpecs(projectRoot: string) {
  const configPath = projectConfigPath(projectRoot);
  const config = await loadProjectConfig(configPath);
  return [...(config.cards ?? [])];
}

export async function applyProjectCardSpecs(projectRoot: string, agentsDir: string, specs: string[]) {
  return await writeProjectCards(projectRoot, agentsDir, specs);
}

export async function addProjectCardSpec(projectRoot: string, agentsDir: string, spec: string) {
  const current = await getCurrentProjectCardSpecs(projectRoot);
  const nextName = parseCardRef(spec).name;
  if (current.some((item) => cardNamesEqual(item, nextName))) {
    throw new Error(`Card already exists in project: ${nextName}`);
  }
  current.push(spec);
  return await writeProjectCards(projectRoot, agentsDir, current);
}

export async function pinProjectCardSpec(projectRoot: string, agentsDir: string, spec: string) {
  const parsed = parseCardRef(spec);
  const current = await getCurrentProjectCardSpecs(projectRoot);
  const next = current.map((item) => (cardNamesEqual(item, parsed.name) ? formatCardSpec(parsed.name, parsed.range) : item));
  if (!next.some((item) => cardNamesEqual(item, parsed.name))) {
    next.push(formatCardSpec(parsed.name, parsed.range));
  }
  return await writeProjectCards(projectRoot, agentsDir, next);
}

export async function removeProjectCard(projectRoot: string, agentsDir: string, refOrName: string) {
  const parsed = parseCardRef(refOrName);
  const current = await getCurrentProjectCardSpecs(projectRoot);
  if (!current.some((item) => cardNamesEqual(item, parsed.name))) {
    throw new Error(`Card is not in project: ${parsed.name}`);
  }
  const next = current.filter((item) => !cardNamesEqual(item, parsed.name));
  return await writeProjectCards(projectRoot, agentsDir, next);
}

export async function detachProjectCards(projectRoot: string, agentsDir: string) {
  return await writeProjectCards(projectRoot, agentsDir, []);
}

export async function updateProjectCardLock(projectRoot: string, agentsDir: string) {
  return await writeProjectCards(projectRoot, agentsDir, await getCurrentProjectCardSpecs(projectRoot));
}

export async function readProjectCardStatus(projectConfigPath: string, agentsDir: string) {
  const projectRoot = resolveProjectRootFromConfigPath(projectConfigPath);
  const config = await loadProjectConfig(projectConfigPath);
  const lock = await loadCardLock(projectRoot);
  const specs = config.cards ?? [];
  const locked = lock?.cards ?? [];
  const outdated = await findOutdatedProjectCards(projectRoot, agentsDir);
  return { projectRoot, specs, locked, outdated };
}

async function highestPublishedVersion(agentsDir: string, name: string) {
  const card = (await listCards(agentsDir)).find((entry) => entry.name === name);
  return card?.versions.at(-1) ?? null;
}

export async function findOutdatedProjectCards(projectRoot: string, agentsDir: string) {
  const mutation = await updateProjectCardLock(projectRoot, agentsDir);
  const outdated: Array<{ name: string; current: string; latest: string }> = [];
  for (const locked of mutation.locked) {
    const latest = await highestPublishedVersion(agentsDir, locked.name);
    if (latest && isNewerVersion(latest, locked.version)) {
      outdated.push({ name: locked.name, current: locked.version, latest });
    }
  }
  return outdated;
}

export function projectRootFromConfigPath(configPath: string) {
  return dirname(dirname(dirname(configPath)));
}
