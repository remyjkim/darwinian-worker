// ABOUTME: Computes report-only diagnostics for skill symlinks, MCP drift, and generated file expectations.
// ABOUTME: Shared by `drwn doctor` and `drwn status` to keep reporting logic centralized and testable.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evaluateVersionFloor, loadCardLock, type CardLockEntry, type VersionFloorStatus } from "./card-lock";
import type { AmbientCollision } from "./ambient-policy";
import { resolveSkillSource } from "./card-skill-resolver";
import { buildEffectiveState, selectedAmbientCollisions } from "./effective-state";
import { inspectAmbientCapabilities } from "./ambient-capabilities";
import { loadConfig } from "./config";
import { buildActiveServers, claudeMcpServerHashKey, hashClaudeManagedServers, hashCodexManagedServers, mergeClaudeSettingsText, mergeCodexTomlText, mergeCursorConfigText, renderCursorConfig, renderJsonMcpConfig } from "./mcp";
import { hasExplicitSkillDefaults, mergeUserMcpLibrary, validateDefaultReferences } from "./defaults";
import { expandHomePath, resolveToolPaths } from "./paths";
import { resolveHomeDir } from "./home";
import { ALL_TARGET_NAMES, getTargetDescriptor } from "./targets";
import { loadRegistry } from "./registry";
import { loadMcpLibrary } from "./mcp-library";
import {
  buildSkillInventory,
  findStaleManagedEntries,
  listCuratedSkills,
  listRepoSkills,
  listSkillsByScope,
} from "./skills";
import { lstatSafe } from "./fs";
import { resolveProjectRootFromConfigPath, summarizeProjectConfig, isServerToggle } from "./project";
import { loadEffectiveConfig } from "./user-config";
import { getExtension } from "./extensions/registry";
import { getStoreStatus } from "./migration";
import { resolveGlobalWriteRecordPath, resolveStoreGeneratedDir } from "./store-paths";
import { loadWriteRecord, resolveProjectWriteRecordPath, type ManagedPath } from "./write-record";
import { isHookConsentValid } from "./hook-consent";
import { DRWN_VERSION } from "./version";
import type { CanonicalConfig, RegistryServer } from "./types";
import { collectMachineProjectionConflicts } from "./sync";
import { readMachineConfig } from "./card-store";
import { DrwnError } from "./errors";

export interface PlatformCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface DoctorReport {
  brokenSymlinks: string[];
  staleSkillSymlinks: string[];
  mcpDrift: string[];
  machineProjectionConflicts: string[];
  machineCapabilityIssues: string[];
  missingGeneratedFiles: string[];
  hookIssues: string[];
  projectConfigIssues: string[];
  surfaceNotes: string[];
  platformChecks: PlatformCheck[];
  ambientMcpCollisions: AmbientCollision[];
  cards?: DiagnosticsSections["cards"];
  store?: DiagnosticsSections["store"];
  writeRecord?: DiagnosticsSections["writeRecord"];
}

export interface DiagnosticsSections {
  machine: {
    repoRoot: string;
    agentsDir: string;
    homeDir: string;
  };
  project?: {
    configPath: string;
    root: string;
    cardCount: number;
  };
  store: {
    path: string;
    initialized: boolean;
    schemaVersion: number | null;
    cardCount: number;
    sourceCount: number;
    skillBundleCount: number;
    mcpServerCount: number;
    legacyLayoutDetected: boolean;
  };
  writeRecord: {
    path: string;
    present: boolean;
    corrupt: boolean;
    managedPathCount: number;
    lastWriteAt?: string;
    lastWriteHarnessVersion?: string;
  };
  skills: {
    repoCount: number;
    curatedCount: number;
    projectIncludes: string[];
    projectExcludes: string[];
    cardIncludes: Array<{ card: string; skill: string }>;
  };
  mcp: {
    activeServerCount: number;
    projectServers: string[];
    cardServers: Array<{ card: string; server: string }>;
  };
  extensions: {
    projectExtensions: string[];
  };
  cards: {
    configuredRefs: string[];
    lockedVersions: string[];
    warnings: string[];
  };
  versionFloor: VersionFloorStatus;
  targets: {
    enabled: string[];
    projectOverrides: string[];
  };
}

export interface ProjectStatusItem {
  id: string;
  sourceKind: "worker-root" | "card" | "project-overlay" | "local-overlay";
  sourceId: string;
  sourcePath: string;
  target: string;
  health: "installed" | "active" | "declared";
}

export interface ProjectStatusV1 {
  schema: "drwn.project-status";
  schemaVersion: 1;
  installedWorkers: ProjectStatusItem[];
  activeWorker: string | null;
  activeCards: ProjectStatusItem[];
  selectionSource: "project" | "local";
  localOverrides: {
    activeWorker: string | null;
    cardReplacements: string[];
    localOnlyRoots: string[];
    sourceOverrides: string[];
  };
  projectOverlays: {
    skills: ProjectStatusItem[];
    mcp: ProjectStatusItem[];
    extensions: ProjectStatusItem[];
    targets: ProjectStatusItem[];
    hookControls: ProjectStatusItem[];
  };
  declaredCapabilities: {
    skills: ProjectStatusItem[];
    mcp: ProjectStatusItem[];
    hooks: ProjectStatusItem[];
  };
  ambientCapabilities: {
    observations: Awaited<ReturnType<typeof inspectAmbientCapabilities>>;
    collisions: AmbientCollision[];
    enforcement: "target-native";
  };
  projection: { current: boolean; issues: string[] };
}

function projectItem(
  id: string,
  sourceKind: ProjectStatusItem["sourceKind"],
  sourceId: string,
  sourcePath: string,
  target: string,
  health: ProjectStatusItem["health"] = "declared",
): ProjectStatusItem {
  return { id, sourceKind, sourceId, sourcePath, target, health };
}

export async function buildProjectStatusV1(options: {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  projectConfigPath?: string | null;
}): Promise<ProjectStatusV1 | null> {
  if (!options.projectConfigPath) return null;
  const projectRoot = resolveProjectRootFromConfigPath(options.projectConfigPath);
  const state = await buildEffectiveState({
    repoRoot: options.repoRoot,
    agentsDir: options.agentsDir,
    homeDir: options.homeDir,
    cwd: projectRoot,
  });
  if (!state.projectConfig || !state.workerSelection) return null;
  const configPath = state.projectConfigPath!;
  const cardByName = new Map(state.lockedCards.map((card) => [card.name, card]));
  const installedWorkers = state.workerSelection.installedRoots.map((root) => {
    const card = cardByName.get(root.name);
    const sourceKind = state.cardLanes[root.name] === "localOverlay" ? "local-overlay" : "worker-root";
    return projectItem(root.name, sourceKind, root.requested, card?.path ?? configPath, "project", "installed");
  });
  const activeCards = state.activeCards.map((card) => {
    const sourceKind = state.cardLanes[card.name] === "localOverlay" ? "local-overlay" : "card";
    return projectItem(
      card.name,
      sourceKind,
      `${card.name}@${card.version}`,
      state.contentRootsByCard[card.name] ?? card.path,
      "project",
      "active",
    );
  });
  const overlayItem = (id: string, target: string) => projectItem(id, "project-overlay", id, configPath, target);
  const projectOverlays = {
    skills: [
      ...(state.projectConfig.skills?.include ?? []).map((id) => overlayItem(id, "skills:include")),
      ...(state.projectConfig.skills?.exclude ?? []).map((id) => overlayItem(id, "skills:exclude")),
    ],
    mcp: Object.keys(state.projectConfig.mcpServers ?? {}).sort().map((id) => overlayItem(id, "mcp")),
    extensions: Object.keys(state.projectConfig.extensions ?? {}).sort().map((id) => overlayItem(id, "extension")),
    targets: Object.keys(state.projectConfig.targets ?? {}).sort().map((id) => overlayItem(id, "target")),
    hookControls: Object.keys(state.projectConfig.hooks ?? {}).sort().map((id) => overlayItem(id, "hooks")),
  };
  const skillItems = state.activeCards.flatMap((card) =>
    card.skills.map((id) => projectItem(
      id,
      "card",
      `${card.name}@${card.version}`,
      state.contentRootsByCard[card.name] ?? card.path,
      "skills",
      "active",
    )),
  );
  for (const id of state.projectConfig.skills?.include ?? []) {
    if (!skillItems.some((entry) => entry.id === id)) skillItems.push(overlayItem(id, "skills"));
  }
  const mcpItems = state.cardServerDefinitions
    .filter((definition) => Object.hasOwn(state.activeServers, definition.serverName))
    .map((definition) => {
      const card = cardByName.get(definition.cardName);
      return projectItem(
        definition.serverName,
        "card",
        `${definition.cardName}@${definition.cardVersion}`,
        card ? (state.contentRootsByCard[card.name] ?? card.path) : configPath,
        "mcp",
        "active",
      );
    });
  for (const id of Object.keys(state.projectConfig.mcpServers ?? {})) {
    if (Object.hasOwn(state.activeServers, id) && !mcpItems.some((entry) => entry.id === id)) {
      mcpItems.push(overlayItem(id, "mcp"));
    }
  }
  const hookItems = state.activeCards.flatMap((card) =>
    card.hooks.map((id) => projectItem(
      id,
      "card",
      `${card.name}@${card.version}`,
      state.contentRootsByCard[card.name] ?? card.path,
      "hooks",
      "active",
    )),
  );
  const ambient = await inspectAmbientCapabilities({
    config: state.repoConfig,
    homeDir: options.homeDir,
    declaredSkillIds: skillItems.map((entry) => entry.id),
    declaredMcpIds: mcpItems.map((entry) => entry.id),
  });
  return {
    schema: "drwn.project-status",
    schemaVersion: 1,
    installedWorkers,
    activeWorker: state.workerSelection.activeWorker,
    activeCards,
    selectionSource: state.workerSelection.selectionSource,
    localOverrides: { ...state.workerSelection.localOverrides },
    projectOverlays,
    declaredCapabilities: { skills: skillItems, mcp: mcpItems, hooks: hookItems },
    ambientCapabilities: {
      observations: ambient,
      collisions: state.ambientCollisions,
      enforcement: "target-native",
    },
    projection: {
      current: existsSync(state.recordPath) && state.overlayWarnings.length === 0,
      issues: [...state.overlayWarnings],
    },
  };
}

export async function buildStatusReport(repoRoot: string, agentsDir: string, homeDir: string, projectConfigPath?: string | null) {
  const [config, registry, curatedSkills, repoSkills] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    listCuratedSkills(agentsDir),
    listRepoSkills(repoRoot),
  ]);
  const userMcpLibrary = await loadMcpLibrary(agentsDir);
  const mergedRegistry = mergeUserMcpLibrary(registry, userMcpLibrary);
  const loadedConfig = await loadEffectiveConfig(config, agentsDir);
  let effectiveConfig = loadedConfig.config;
  let effectiveRegistry = mergedRegistry;
  let projectSummary: ReturnType<typeof summarizeProjectConfig> | undefined;

  if (projectConfigPath) {
    const state = await buildEffectiveState({
      repoRoot,
      agentsDir,
      homeDir,
      cwd: resolveProjectRootFromConfigPath(projectConfigPath),
    });
    effectiveConfig = state.effectiveConfig;
    effectiveRegistry = state.effectiveRegistry;
    projectSummary = state.projectConfig ? summarizeProjectConfig(state.projectConfig) : undefined;
  }

  const activeServers = buildActiveServers(effectiveRegistry, effectiveConfig);

  return {
    repoRoot,
    agentsDir,
    homeDir,
    enabledTargets: Object.entries(effectiveConfig.targets)
      .filter(([, target]) => target.enabled)
      .map(([name]) => name),
    curatedSkillCount: curatedSkills.length,
    repoSkillCount: repoSkills.length,
    activeMcpServerCount: Object.keys(activeServers).length,
    globalDefaultSkillCount: loadedConfig.config.defaults?.skills?.length ?? 0,
    globalDefaultMcpServerCount: loadedConfig.config.defaults?.mcpServers?.length ?? 0,
    userLibraryMcpServerCount: Object.keys(userMcpLibrary.servers).length,
    project: projectSummary && projectConfigPath
      ? {
          configPath: projectConfigPath,
          ...projectSummary,
        }
      : undefined,
  };
}

function readWriteRecordStatus(path: string): DiagnosticsSections["writeRecord"] {
  const present = existsSync(path);
  const record = loadWriteRecord(path);
  return {
    path,
    present,
    corrupt: present && record === null,
    managedPathCount: record?.managedPaths.length ?? 0,
    lastWriteAt: record?.lastWriteAt,
    lastWriteHarnessVersion: record?.lastWriteHarnessVersion,
  };
}

export async function buildDiagnosticsSections(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath?: string | null,
): Promise<DiagnosticsSections> {
  const [repoConfig, registry, curatedSkills, repoSkills, store] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    listCuratedSkills(agentsDir),
    listRepoSkills(repoRoot),
    getStoreStatus(agentsDir),
  ]);
  const userMcpLibrary = await loadMcpLibrary(agentsDir);
  const loadedConfig = await loadEffectiveConfig(repoConfig, agentsDir);
  const baseRegistry = mergeUserMcpLibrary(registry, userMcpLibrary);
  const projectState = projectConfigPath
    ? await buildEffectiveState({
        repoRoot,
        agentsDir,
        homeDir,
        cwd: resolveProjectRootFromConfigPath(projectConfigPath),
      })
    : null;
  const projectRoot = projectState?.projectRoot ?? null;
  const projectConfig = projectState?.projectConfig ?? null;
  const cardLocks = projectState?.activeCards ?? [];
  const effectiveConfig = projectState?.effectiveConfig ?? loadedConfig.config;
  const activeServers = projectState?.activeServers ?? buildActiveServers(baseRegistry, effectiveConfig);
  const lock = projectRoot ? await loadCardLock(projectRoot) : null;
  const writeRecordPath = projectRoot ? resolveProjectWriteRecordPath(projectRoot) : resolveGlobalWriteRecordPath(agentsDir);

  const cardIncludes = cardLocks.flatMap((card) =>
    (card.manifest.skills?.include ?? []).map((skill) => ({ card: `${card.name}@${card.version}`, skill })),
  );
  const cardServers = cardLocks.flatMap((card) =>
    Object.keys(card.manifest.servers ?? {}).map((server) => ({ card: `${card.name}@${card.version}`, server })),
  );

  return {
    machine: { repoRoot, agentsDir, homeDir },
    project: projectConfigPath && projectRoot && projectConfig
      ? { configPath: projectConfigPath, root: projectRoot, cardCount: projectConfig.workers.length }
      : undefined,
    store,
    writeRecord: readWriteRecordStatus(writeRecordPath),
    skills: {
      repoCount: repoSkills.length,
      curatedCount: curatedSkills.length,
      projectIncludes: projectConfig?.skills?.include ?? [],
      projectExcludes: projectConfig?.skills?.exclude ?? [],
      cardIncludes,
    },
    mcp: {
      activeServerCount: Object.keys(activeServers).length,
      projectServers: Object.keys(projectConfig?.mcpServers ?? {}),
      cardServers,
    },
    extensions: {
      projectExtensions: Object.keys(projectConfig?.extensions ?? {}),
    },
    cards: {
      configuredRefs: projectConfig?.workers ?? [],
      lockedVersions: (lock?.cards ?? []).map((card) => `${card.name}@${card.version}`),
      warnings: [],
    },
    versionFloor: evaluateVersionFloor(lock?.store?.minDrwnVersion),
    targets: {
      enabled: Object.entries(effectiveConfig.targets)
        .filter(([, target]) => target.enabled)
        .map(([name]) => name),
      projectOverrides: Object.entries(projectConfig?.targets ?? {}).map(([name, override]) =>
        `${name} ${override.enabled ? "enabled" : "disabled"}`,
      ),
    },
  };
}

export interface WhyAnswer {
  ok: boolean;
  message: string;
}

type WhyMatch = { kind: "skill" | "server" | "extension" | "target" | "card"; name: string; message: string };

function splitWhyQuery(query: string) {
  const match = query.match(/^(skill|server|extension|target|card):(.+)$/);
  return match ? { kind: match[1] as WhyMatch["kind"], name: match[2] ?? "" } : { kind: null, name: query };
}

function formatAmbiguous(name: string, matches: WhyMatch[]) {
  return `ambiguous: ${name} matched ${matches.map((match) => `${match.kind}:${match.name}`).join(", ")}\n`;
}

async function collectWhyMatches(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath: string | null | undefined,
  name: string,
) {
  const matches: WhyMatch[] = [];
  const [repoConfig, registry, skillInventory] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    buildSkillInventory(repoRoot, agentsDir, homeDir),
  ]);
  const userMcpLibrary = await loadMcpLibrary(agentsDir);
  const baseRegistry = mergeUserMcpLibrary(registry, userMcpLibrary);
  const loadedConfig = await loadEffectiveConfig(repoConfig, agentsDir);
  const projectState = projectConfigPath
    ? await buildEffectiveState({
        repoRoot,
        agentsDir,
        homeDir,
        cwd: resolveProjectRootFromConfigPath(projectConfigPath),
      })
    : null;
  const projectConfig = projectState?.projectConfig ?? null;
  const cardLocks = projectState?.activeCards ?? [];
  const effectiveConfig = projectState?.effectiveConfig ?? loadedConfig.config;
  const effectiveRegistry = projectState?.effectiveRegistry ?? baseRegistry;
  const activeServers = projectState?.activeServers ?? buildActiveServers(effectiveRegistry, effectiveConfig);

  const cardSkill = cardLocks.find((card) => card.manifest.skills?.include?.includes(name));
  const projectSkill = projectConfig?.skills?.include?.includes(name);
  const inventorySkill = skillInventory.find((skill) => skill.name === name);
  if (cardSkill || projectSkill || inventorySkill) {
    const source = cardSkill
      ? `card ${cardSkill.name}@${cardSkill.version}`
      : projectSkill
        ? "project config"
        : inventorySkill?.curated
          ? "machine curation"
          : "repo or installed skill library";
    matches.push({ kind: "skill", name, message: `skill:${name} is active or available from ${source}.\n` });
  }

  const cardServer = cardLocks.find((card) => Object.hasOwn(card.manifest.servers ?? {}, name));
  const projectServer = projectConfig?.mcpServers && Object.hasOwn(projectConfig.mcpServers, name);
  const registryServer = effectiveRegistry.servers[name];
  if (cardServer || projectServer || registryServer) {
    const active = Object.hasOwn(activeServers, name);
    const source = cardServer
      ? `card ${cardServer.name}@${cardServer.version}`
      : projectServer
        ? "project config"
        : "registry or machine library";
    matches.push({ kind: "server", name, message: `server:${name} is ${active ? "active" : "available"} from ${source}.\n` });
  }

  if ((projectConfig?.extensions && Object.hasOwn(projectConfig.extensions, name)) || getExtension(name)) {
    const source = projectConfig?.extensions && Object.hasOwn(projectConfig.extensions, name) ? "project config" : "extension registry";
    matches.push({ kind: "extension", name, message: `extension:${name} is known from ${source}.\n` });
  }

  if (name === "claude" || name === "codex" || name === "cursor") {
    const override = projectConfig?.targets?.[name];
    const enabled = effectiveConfig.targets[name].enabled;
    matches.push({
      kind: "target",
      name,
      message: `target:${name} is ${enabled ? "enabled" : "disabled"}${override ? " by project config" : " by machine config"}.\n`,
    });
  }

  const card = cardLocks.find((entry) => entry.name === name || `${entry.name}@${entry.version}` === name);
  if (card) {
    matches.push({ kind: "card", name: card.name, message: `card:${card.name} is locked at ${card.version} from ${card.requested}.\n` });
  }

  return matches;
}

export async function explainStatus(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath?: string | null,
) {
  const sections = await buildDiagnosticsSections(repoRoot, agentsDir, homeDir, projectConfigPath);
  return [
    "Machine",
    `- repo: ${sections.machine.repoRoot}`,
    `- agents: ${sections.machine.agentsDir}`,
    "Store",
    `- path: ${sections.store.path}`,
    `- schema: ${sections.store.schemaVersion ?? "none"}`,
    "Cards",
    `- configured: ${sections.cards.configuredRefs.join(", ") || "none"}`,
    `- locked: ${sections.cards.lockedVersions.join(", ") || "none"}`,
    "Skills",
    `- project includes: ${sections.skills.projectIncludes.join(", ") || "none"}`,
    `- card includes: ${sections.skills.cardIncludes.map((entry) => `${entry.skill} from ${entry.card}`).join(", ") || "none"}`,
    "MCP",
    `- card servers: ${sections.mcp.cardServers.map((entry) => `${entry.server} from ${entry.card}`).join(", ") || "none"}`,
    "Targets",
    `- enabled: ${sections.targets.enabled.join(", ") || "none"}`,
    "Write record",
    `- ${sections.writeRecord.present ? `${sections.writeRecord.managedPathCount} managed paths` : "missing"}`,
  ].join("\n") + "\n";
}

export async function answerWhy(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath: string | null | undefined,
  query: string,
): Promise<WhyAnswer> {
  const parsed = splitWhyQuery(query);
  const matches = await collectWhyMatches(repoRoot, agentsDir, homeDir, projectConfigPath, parsed.name);
  const filtered = parsed.kind ? matches.filter((match) => match.kind === parsed.kind) : matches;
  if (filtered.length === 0) {
    return { ok: false, message: `not found: ${query}\n` };
  }
  if (!parsed.kind && filtered.length > 1) {
    return { ok: false, message: formatAmbiguous(parsed.name, filtered) };
  }
  return { ok: true, message: filtered[0]?.message ?? "" };
}

async function detectBrokenSymlinks(paths: string[]) {
  return paths.filter((pathValue) => lstatSafe(pathValue)?.isSymbolicLink() && !existsSync(pathValue));
}

async function detectStaleSkillSymlinks(
  repoRoot: string,
  agentsDir: string,
  toolRoot: string,
  skillOverrides?: { include?: string[]; exclude?: string[] },
  lockedCards: CardLockEntry[] = [],
) {
  const toolPaths = resolveToolPaths(toolRoot);
  const curated = await listCuratedSkills(agentsDir);
  const scopes = await listSkillsByScope(repoRoot);
  const excluded = new Set(skillOverrides?.exclude ?? []);
  const resolvedSources = await Promise.all(
    (skillOverrides?.include ?? [])
      .filter((name) => !excluded.has(name))
      .map(async (name) => ({
        name,
        source: await resolveSkillSource(name, lockedCards, repoRoot, agentsDir),
      })),
  );
  const desiredClaude = new Set([
    ...curated.map((entry) => entry.name).filter((name) => !excluded.has(name)),
    ...scopes.claudeOnly.map((skill) => skill.name).filter((name) => !excluded.has(name)),
    ...resolvedSources
      .filter((entry) =>
        entry.source.layer === "card" ||
        (entry.source.layer === "user-default" && (entry.source.scope === "shared" || entry.source.scope === "claude-only"))
      )
      .map((entry) => entry.name),
  ]);
  const desiredCodex = new Set([
    ...curated.map((entry) => entry.name).filter((name) => !excluded.has(name)),
    ...scopes.codexOnly.map((skill) => skill.name).filter((name) => !excluded.has(name)),
    ...resolvedSources
      .filter((entry) =>
        entry.source.layer === "card" ||
        (entry.source.layer === "user-default" && (entry.source.scope === "shared" || entry.source.scope === "codex-only"))
      )
      .map((entry) => entry.name),
  ]);

  return [
    ...(await findStaleManagedEntries(toolPaths.claudeSkills, desiredClaude)),
    ...(await findStaleManagedEntries(toolPaths.codexSkills, desiredCodex)),
  ];
}

async function detectMcpDrift(
  config: CanonicalConfig,
  activeServers: Record<string, RegistryServer>,
  homeDir: string,
  toolRoot: string,
  generatedDir: string,
  scope: "machine" | "project" = "machine",
  previousManagedPaths: ManagedPath[] = [],
) {
  const drifts: string[] = [];
  const toolPaths = resolveToolPaths(toolRoot);
  const targetConfigPath = (targetName: string, target: { configPath: string; userMcpPath?: string }) => {
    if (scope === "project") {
      if (targetName === "claude") return toolPaths.claudeMcp;
      if (targetName === "codex") return toolPaths.codexConfig;
      return toolPaths.cursorMcp;
    }
    return expandHomePath(targetName === "claude" ? (target.userMcpPath ?? target.configPath) : target.configPath, homeDir);
  };

  for (const [targetName, target] of Object.entries(config.targets)) {
    if (!target.enabled) {
      continue;
    }

    const configPath = targetConfigPath(targetName, target);

    if (targetName === "claude" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      let expected: string;
      try {
        expected = scope === "project"
          ? renderJsonMcpConfig(activeServers)
          : mergeClaudeSettingsText(current, activeServers, {
              inlineMeta: false,
              mcpServerOwnership: "per-server",
              priorFieldHashes: previousManagedPaths.find(
                (entry): entry is Extract<ManagedPath, { kind: "managed-fields" }> =>
                  entry.path === ".claude.json" && entry.kind === "managed-fields",
              )?.fieldHashes ?? {},
            }).text;
      } catch {
        drifts.push(`claude:${configPath}`);
        continue;
      }
      if (current !== expected) {
        drifts.push(`claude:${configPath}`);
      }
    }

    if (targetName === "codex" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = mergeCodexTomlText(current, activeServers);
      const names = Object.keys(activeServers);
      const currentHashes = hashCodexManagedServers(current, names);
      const expectedHashes = hashCodexManagedServers(expected, names);
      if (names.some((name) => currentHashes[name] !== expectedHashes[name])) {
        drifts.push(`codex:${configPath}`);
      }
    }

    if (targetName === "cursor" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      if (scope === "project") {
        if (current !== renderCursorConfig(activeServers)) {
          drifts.push(`cursor:${configPath}`);
        }
      } else {
        try {
          const previous = previousManagedPaths.find(
            (entry): entry is Extract<ManagedPath, { kind: "managed-fields" }> =>
              entry.path === ".cursor/mcp.json" && entry.kind === "managed-fields",
          );
          const expected = mergeCursorConfigText(current, activeServers, {
            priorFieldHashes: previous?.fieldHashes ?? {},
            preserveRemovedOwnedServers: true,
          });
          const names = Object.keys(activeServers);
          const currentHashes = hashClaudeManagedServers(current, names);
          if (names.some((name) => currentHashes[claudeMcpServerHashKey(name)] !== expected.fieldHashes[claudeMcpServerHashKey(name)])) {
            drifts.push(`cursor:${configPath}`);
          }
        } catch {
          drifts.push(`cursor:${configPath}`);
        }
      }
    }
  }

  return drifts;
}

async function detectMissingGeneratedFiles(_config: CanonicalConfig, _generatedDir: string) {
  // Cursor MCP config is now written directly as managed content, so there is no
  // generated sidecar file that can go missing. Retained for output-shape stability.
  return [] as string[];
}

function detectHookIssues(cards: CardLockEntry[], generatedDir: string) {
  const issues: string[] = [];
  for (const card of cards) {
    if (card.hooks.length > 0 && !isHookConsentValid(card)) {
      issues.push(`Card ${card.name}@${card.version} has hooks without valid consent. Run drwn card trust ${card.name} --hooks.`);
    }
  }

  for (const pathValue of generatedComposerPaths(generatedDir)) {
    if (!existsSync(pathValue)) {
      continue;
    }
    const match = readFileSync(pathValue, "utf8").match(/drwn-version:\s*([^\s]+)/);
    if (match && match[1] !== DRWN_VERSION) {
      issues.push(`composer stale; rerun drwn write: ${pathValue}`);
    }
  }

  return issues;
}

function generatedComposerPaths(generatedDir: string) {
  const paths = [
    join(generatedDir, "hooks", "claude", "composer.mjs"),
    join(generatedDir, "hooks", "codex", "composer.mjs"),
    join(generatedDir, "hooks", "mastra", "composer.ts"),
  ];
  const workersDir = join(generatedDir, "workers");
  if (!existsSync(workersDir)) {
    return paths;
  }

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const pathValue = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(pathValue);
        continue;
      }
      if (entry.isFile() && (entry.name === "composer.mjs" || entry.name === "composer.ts")) {
        paths.push(pathValue);
      }
    }
  }

  walk(workersDir);
  return paths;
}

function buildSurfaceNotes(config: { targets: Record<string, { enabled: boolean }> }): string[] {
  const notes: string[] = [];
  for (const name of ALL_TARGET_NAMES) {
    const descriptor = getTargetDescriptor(name);
    if (config.targets[name]?.enabled && descriptor.surfaces.includes("cowork")) {
      notes.push(
        `The ${name} target also serves the Cowork surface; materialized skills, MCP servers, and hooks apply there too. ` +
          `Cowork runs in a workspace-trust VM, so review its trust and snapshot prompts.`,
      );
    }
  }
  return notes;
}

function isExecutableOnPath(command: string): boolean {
  const isWindows = process.platform === "win32";
  const exts = isWindows ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  const dirs = (process.env.PATH ?? "").split(isWindows ? ";" : ":");
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      if (existsSync(join(dir, `${command}${ext}`))) {
        return true;
      }
    }
  }
  return false;
}

function buildPlatformChecks(): PlatformCheck[] {
  const home = resolveHomeDir(process.env);
  const nodeOnPath = isExecutableOnPath("node");
  return [
    { name: "home directory resolves to a non-empty path", ok: home.length > 0, detail: home || "(empty)" },
    {
      name: "node resolvable on PATH (for MCP servers that spawn node)",
      ok: nodeOnPath,
      detail: nodeOnPath ? undefined : "node not found on PATH",
    },
  ];
}

export async function buildDoctorReport(repoRoot: string, agentsDir: string, homeDir: string): Promise<DoctorReport> {
  const toolPaths = resolveToolPaths(homeDir);
  const generatedDir = resolveStoreGeneratedDir(agentsDir);
  const [repoConfig, builtInRegistry, userMcpLibrary, skillInventory] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    loadMcpLibrary(agentsDir),
    buildSkillInventory(repoRoot, agentsDir, homeDir),
  ]);
  const registry = mergeUserMcpLibrary(builtInRegistry, userMcpLibrary);
  const { config } = await loadEffectiveConfig(repoConfig, agentsDir);
  const activeServers = buildActiveServers(registry, config);
  const defaultIssues = await validateDefaultReferences({
    config,
    registry,
    skillNames: new Set(skillInventory.map((skill) => skill.name)),
  });
  const defaultSkillOverrides = hasExplicitSkillDefaults(config) ? { include: config.defaults?.skills ?? [] } : undefined;

  const sections = await buildDiagnosticsSections(repoRoot, agentsDir, homeDir);
  const machineConfig = await readMachineConfig(agentsDir);
  const machineCapabilityIssues = [
    ...machineConfig.capabilities.skills
      .filter((id) => !skillInventory.some((skill) => skill.name === id))
      .map((id) => `Unresolved explicit machine skill: "${id}"`),
    ...machineConfig.capabilities.mcpServers
      .filter((id) => !registry.servers[id] || registry.servers[id]?.transport === "platform-provided")
      .map((id) => `Unresolved explicit machine MCP server: "${id}"`),
  ];
  const machineRecord = loadWriteRecord(resolveGlobalWriteRecordPath(agentsDir));
  let machineProjectionConflicts: string[] = [];
  if (machineCapabilityIssues.length === 0) {
    try {
      const machineState = await buildEffectiveState({
        repoRoot,
        agentsDir,
        homeDir,
        dryRun: true,
        forceMachineScope: true,
        scope: "machine",
      });
      machineProjectionConflicts = collectMachineProjectionConflicts(machineState, machineRecord)
        .map((conflict) => conflict.message);
    } catch (error) {
      if (!(error instanceof DrwnError)) throw error;
      machineCapabilityIssues.push(`${error.code}: ${error.message}`);
    }
  }
  return {
    brokenSymlinks: await detectBrokenSymlinks([
      ...((existsSync(toolPaths.claudeSkills) ? Object.keys(readDirLinks(toolPaths.claudeSkills)) : []) as string[]).map((name) =>
        join(toolPaths.claudeSkills, name),
      ),
      ...((existsSync(toolPaths.codexSkills) ? Object.keys(readDirLinks(toolPaths.codexSkills)) : []) as string[]).map((name) =>
        join(toolPaths.codexSkills, name),
      ),
    ]),
    staleSkillSymlinks: await detectStaleSkillSymlinks(repoRoot, agentsDir, homeDir, defaultSkillOverrides),
    mcpDrift: await detectMcpDrift(
      config,
      activeServers,
      homeDir,
      homeDir,
      generatedDir,
      "machine",
      loadWriteRecord(resolveGlobalWriteRecordPath(agentsDir))?.managedPaths ?? [],
    ),
    machineProjectionConflicts,
    machineCapabilityIssues,
    missingGeneratedFiles: await detectMissingGeneratedFiles(config, generatedDir),
    hookIssues: [],
    projectConfigIssues: defaultIssues,
    surfaceNotes: buildSurfaceNotes(config),
    platformChecks: buildPlatformChecks(),
    ambientMcpCollisions: [],
    cards: sections.cards,
    store: sections.store,
    writeRecord: sections.writeRecord,
  };
}

export async function buildDoctorReportWithProject(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath?: string | null,
): Promise<DoctorReport> {
  const report = await buildDoctorReport(repoRoot, agentsDir, homeDir);
  if (!projectConfigPath) {
    return report;
  }

  const [repoConfig, builtInRegistry, skillInventory] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    buildSkillInventory(repoRoot, agentsDir, homeDir),
  ]);
  const state = await buildEffectiveState({
    repoRoot,
    agentsDir,
    homeDir,
    cwd: resolveProjectRootFromConfigPath(projectConfigPath),
  });
  const projectRoot = state.projectRoot;
  const project = state.projectConfig;
  const projectWithCards = state.projectConfigWithCards;
  const cardLocks = state.activeCards;
  if (!project || !projectWithCards || !projectRoot) {
    return report;
  }
  const centrallyActiveServers = buildActiveServers(builtInRegistry, repoConfig);
  const knownServerNames = new Set([
    ...Object.keys(builtInRegistry.servers),
    ...state.cardServerDefinitions.map((definition) => definition.serverName),
  ]);
  const availableSkillNames = new Set([
    ...skillInventory.map((skill) => skill.name),
    ...cardLocks.flatMap((card) => card.skills),
  ]);
  const issues: string[] = [];

  for (const [name, override] of Object.entries(project.mcpServers ?? {})) {
    if (isServerToggle(override)) {
      if (!knownServerNames.has(name)) {
        issues.push(`Unknown server reference: "${name}"`);
        continue;
      }
      const centrallyActive = Boolean(centrallyActiveServers[name]);
      if (centrallyActive === override.enabled) {
        issues.push(`Stale override: server "${name}" is already ${centrallyActive ? "enabled" : "disabled"} centrally`);
      }
    }
  }

  for (const name of [...(projectWithCards.skills?.include ?? []), ...(projectWithCards.skills?.exclude ?? [])]) {
    if (!availableSkillNames.has(name)) {
      issues.push(`Unknown skill reference: "${name}"`);
    }
  }

  for (const name of Object.keys(project.extensions ?? {})) {
    if (!getExtension(name)) {
      issues.push(`Unknown extension reference: "${name}"`);
    }
  }

  for (const [name, override] of Object.entries(project.targets ?? {})) {
    if (repoConfig.targets[name as keyof typeof repoConfig.targets]?.enabled === override.enabled) {
      issues.push(`Stale override: target "${name}" is already ${override.enabled ? "enabled" : "disabled"} centrally`);
    }
  }

  const generatedDir = join(projectRoot, ".agents", "drwn", "generated");
  const scopedReport = {
    ...report,
    staleSkillSymlinks: await detectStaleSkillSymlinks(repoRoot, agentsDir, projectRoot, state.skillSelection, cardLocks),
    mcpDrift: await detectMcpDrift(
      state.effectiveConfig,
      state.activeServers,
      homeDir,
      projectRoot,
      generatedDir,
      "project",
    ),
    missingGeneratedFiles: await detectMissingGeneratedFiles(state.effectiveConfig, generatedDir),
    hookIssues: detectHookIssues(cardLocks, generatedDir),
    projectConfigIssues: [...report.projectConfigIssues, ...issues],
    ambientMcpCollisions: selectedAmbientCollisions(state),
  };
  const sections = await buildDiagnosticsSections(repoRoot, agentsDir, homeDir, projectConfigPath);
  return {
    ...scopedReport,
    cards: {
      ...sections.cards,
      warnings: [
        ...sections.cards.warnings,
        ...cardLocks.filter((card) => card.manifest.skills?.include?.some((skill) => !availableSkillNames.has(skill)))
          .map((card) => `Card ${card.name}@${card.version} references unavailable skills`),
      ],
    },
    store: sections.store,
    writeRecord: sections.writeRecord,
  };
}

function readDirLinks(dirPath: string) {
  const entries: Record<string, true> = {};
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      entries[entry.name] = true;
    }
  }
  return entries;
}
