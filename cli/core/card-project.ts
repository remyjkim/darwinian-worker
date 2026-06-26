// ABOUTME: Applies Harness Card selections to per-project config and lockfiles.
// ABOUTME: Keeps card consumer commands consistent and side-effect-light.

import { dirname } from "node:path";
import { cardLockPath, loadCardLock, writeCardLock, type CardLockEntry } from "./card-lock";
import {
  cardNamesEqual,
  formatCardSpec,
  isNewerVersion,
  listCards,
  parseCardRef,
  resolveCard,
  type ResolveCardOptions,
} from "./card-store";
import { loadProjectConfig, resolveProjectRootFromConfigPath } from "./project";
import { projectConfigPath, readProjectConfigForWrite, writeProjectConfigForWrite } from "./project-writes";
import type { CardManifest } from "./card-manifest";
import type { ProjectConfig } from "./types";
import { satisfies, validRange } from "./semver-utils";

export interface CardProjectMutation {
  projectConfigPath: string;
  lockPath: string;
  cards: string[];
  locked: CardLockEntry[];
  warnings?: string[];
}

export interface CardTrustMutation {
  lockPath: string;
  card: CardLockEntry;
}

export async function resolveProjectCards(
  agentsDir: string,
  specs: string[],
  options: ResolveCardOptions = {},
): Promise<CardLockEntry[]> {
  const resolved = await Promise.all(specs.map((spec) => resolveCard(agentsDir, spec, options)));
  return resolved
    .map((card) => ({
      name: card.name,
      requested: card.requested,
      version: card.version,
      path: card.dir,
      integrity: card.integrity,
      manifest: card.manifest,
      skills: card.manifest.skills?.include ?? [],
      hooks: card.manifest.hooks?.include ?? [],
      registry: null as null,
      origin: card.origin,
      ...(card.git ? { git: card.git } : {}),
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

export async function writeProjectCards(
  projectRoot: string,
  agentsDir: string,
  specs: string[],
  options: ResolveCardOptions = {},
): Promise<CardProjectMutation> {
  const config = readProjectConfigForWrite(projectRoot);
  const previousLock = await loadCardLock(projectRoot);
  config.cards = [...specs];
  const configPath = writeProjectConfigForWrite(projectRoot, config);
  const resolved = await resolveProjectCards(agentsDir, config.cards, options);
  const warnings: string[] = [];
  const previousByName = new Map((previousLock?.cards ?? []).map((card) => [card.name, card]));
  const locked = resolved.map((card) => {
    const previous = previousByName.get(card.name);
    if (!previous?.hookConsent) {
      return card;
    }
    if (satisfies(card.version, previous.hookConsent.consentedRange, { includePrerelease: true })) {
      return { ...card, hookConsent: previous.hookConsent };
    }
    if (card.hooks.length > 0) {
      warnings.push(
        `${card.name} hook consent dropped: locked ${card.version} is outside consent range ${previous.hookConsent.consentedRange}. Run drwn card trust ${card.name} --hooks to re-consent.`,
      );
    }
    return card;
  });
  const lockPath = await writeCardLock(projectRoot, locked);
  return { projectConfigPath: configPath, lockPath, cards: config.cards, locked, warnings };
}

export async function getCurrentProjectCardSpecs(projectRoot: string) {
  const configPath = projectConfigPath(projectRoot);
  const config = await loadProjectConfig(configPath);
  return [...(config.cards ?? [])];
}

export async function applyProjectCardSpecs(
  projectRoot: string,
  agentsDir: string,
  specs: string[],
  options: ResolveCardOptions = {},
) {
  return await writeProjectCards(projectRoot, agentsDir, specs, options);
}

export async function addProjectCardSpec(
  projectRoot: string,
  agentsDir: string,
  spec: string,
  options: ResolveCardOptions = {},
) {
  const current = await getCurrentProjectCardSpecs(projectRoot);
  const nextName = parseCardRef(spec).name;
  if (current.some((item) => cardNamesEqual(item, nextName))) {
    throw new Error(`Card already exists in project: ${nextName}`);
  }
  current.push(spec);
  return await writeProjectCards(projectRoot, agentsDir, current, options);
}

export async function pinProjectCardSpec(
  projectRoot: string,
  agentsDir: string,
  spec: string,
  options: ResolveCardOptions = {},
) {
  const parsed = parseCardRef(spec);
  const current = await getCurrentProjectCardSpecs(projectRoot);
  const next = current.map((item) => (cardNamesEqual(item, parsed.name) ? formatCardSpec(parsed.name, parsed.range) : item));
  if (!next.some((item) => cardNamesEqual(item, parsed.name))) {
    next.push(formatCardSpec(parsed.name, parsed.range));
  }
  return await writeProjectCards(projectRoot, agentsDir, next, options);
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

export async function updateProjectCardLock(
  projectRoot: string,
  agentsDir: string,
  options: ResolveCardOptions = {},
) {
  return await writeProjectCards(projectRoot, agentsDir, await getCurrentProjectCardSpecs(projectRoot), options);
}

function findLockedCard(cards: CardLockEntry[], cardNameOrRef: string) {
  const name = parseCardRef(cardNameOrRef).name;
  return cards.find((card) => cardNamesEqual(card.name, name)) ?? null;
}

export async function setHookConsent(projectRoot: string, cardNameOrRef: string, range?: string): Promise<CardTrustMutation> {
  const lock = await loadCardLock(projectRoot);
  if (!lock) {
    throw new Error("Card lockfile not found. Run drwn card update first.");
  }
  const target = findLockedCard(lock.cards, cardNameOrRef);
  if (!target) {
    throw new Error(`Card is not in project lockfile: ${parseCardRef(cardNameOrRef).name}`);
  }
  const consentedRange = range ?? `^${target.version}`;
  if (!validRange(consentedRange)) {
    throw new Error(`Invalid hook consent range: ${consentedRange}`);
  }
  const nextCards = lock.cards.map((card) =>
    card === target
      ? {
          ...card,
          hookConsent: {
            consentedAt: new Date().toISOString(),
            consentedRange,
          },
        }
      : card,
  );
  await writeCardLock(projectRoot, nextCards);
  return {
    lockPath: cardLockPath(projectRoot),
    card: nextCards.find((card) => cardNamesEqual(card.name, target.name))!,
  };
}

export async function clearHookConsent(projectRoot: string, cardNameOrRef: string): Promise<CardTrustMutation> {
  const lock = await loadCardLock(projectRoot);
  if (!lock) {
    throw new Error("Card lockfile not found. Run drwn card update first.");
  }
  const target = findLockedCard(lock.cards, cardNameOrRef);
  if (!target) {
    throw new Error(`Card is not in project lockfile: ${parseCardRef(cardNameOrRef).name}`);
  }
  const nextCards = lock.cards.map((card) => {
    if (card !== target) {
      return card;
    }
    const { hookConsent, ...rest } = card;
    void hookConsent;
    return rest;
  });
  await writeCardLock(projectRoot, nextCards);
  return {
    lockPath: cardLockPath(projectRoot),
    card: nextCards.find((card) => cardNamesEqual(card.name, target.name))!,
  };
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

export async function findOutdatedProjectCards(
  projectRoot: string,
  agentsDir: string,
  options: ResolveCardOptions = {},
) {
  const outdated: Array<{ name: string; current: string; latest: string; hookConsentRequiresRegrant?: boolean }> = [];
  const lock = await loadCardLock(projectRoot);
  const currentByName = new Map((lock?.cards ?? []).map((entry) => [entry.name, entry]));
  const resolved = await resolveProjectCards(agentsDir, await getCurrentProjectCardSpecs(projectRoot), options);

  for (const next of resolved) {
    const current = currentByName.get(next.name);
    if (!current) {
      continue;
    }
    if (isNewerVersion(next.version, current.version)) {
      outdated.push({
        name: next.name,
        current: current.version,
        latest: next.version,
        ...(current.hookConsent && current.hooks.length > 0 && !satisfies(next.version, current.hookConsent.consentedRange, { includePrerelease: true })
          ? { hookConsentRequiresRegrant: true }
          : {}),
      });
      continue;
    }

    const latest = await highestPublishedVersion(agentsDir, next.name);
    if (latest && isNewerVersion(latest, next.version)) {
      outdated.push({
        name: next.name,
        current: next.version,
        latest,
        ...(current.hookConsent && current.hooks.length > 0 && !satisfies(latest, current.hookConsent.consentedRange, { includePrerelease: true })
          ? { hookConsentRequiresRegrant: true }
          : {}),
      });
    }
  }
  return outdated;
}

export function projectRootFromConfigPath(configPath: string) {
  return dirname(dirname(dirname(configPath)));
}
