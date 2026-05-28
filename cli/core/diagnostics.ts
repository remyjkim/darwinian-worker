// ABOUTME: Computes report-only diagnostics for skill symlinks, MCP drift, and generated file expectations.
// ABOUTME: Shared by `bgng doctor` and `bgng status` to keep reporting logic centralized and testable.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadCardLock, type CardLockEntry } from "./card-lock";
import { resolveSkillSource } from "./card-skill-resolver";
import { mergeCardManifestsIntoProjectConfig, resolveProjectCards } from "./card-project";
import { loadConfig } from "./config";
import { buildActiveServers, mergeClaudeSettingsText, mergeCodexTomlText, renderCursorConfig } from "./mcp";
import { mergeUserMcpLibrary, validateDefaultReferences } from "./defaults";
import { expandHomePath, resolveToolPaths } from "./paths";
import { loadRegistry } from "./registry";
import { loadMcpLibrary } from "./mcp-library";
import {
  buildSkillInventory,
  findStaleSymlinks,
  listCuratedSkills,
  listRepoSkills,
  listSkillsByScope,
} from "./skills";
import { lstatSafe } from "./fs";
import { loadProjectConfig, mergeProjectConfig, resolveProjectRootFromConfigPath, summarizeProjectConfig, isServerToggle } from "./project";
import { loadEffectiveConfig } from "./user-config";
import { getExtension } from "./extensions/registry";
import { getStoreStatus } from "./migration";
import { resolveGlobalWriteRecordPath, resolveStoreGeneratedDir } from "./store-paths";
import { loadWriteRecord, resolveProjectWriteRecordPath } from "./write-record";
import type { CanonicalConfig, ProjectConfig, RegistryServer } from "./types";

export interface DoctorReport {
  brokenSymlinks: string[];
  staleSkillSymlinks: string[];
  mcpDrift: string[];
  missingGeneratedFiles: string[];
  projectConfigIssues: string[];
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
  targets: {
    enabled: string[];
    projectOverrides: string[];
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
    const projectConfig = await loadProjectConfig(projectConfigPath);
    const merged = mergeProjectConfig(effectiveConfig, mergedRegistry, projectConfig);
    effectiveConfig = merged.config;
    effectiveRegistry = merged.registry;
    projectSummary = summarizeProjectConfig(projectConfig);
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
    globalDefaultSkillCount: effectiveConfig.defaults?.skills?.length ?? 0,
    globalDefaultMcpServerCount: effectiveConfig.defaults?.mcpServers?.length ?? 0,
    userLibraryMcpServerCount: Object.keys(userMcpLibrary.servers).length,
    project: projectSummary && projectConfigPath
      ? {
          configPath: projectConfigPath,
          ...projectSummary,
        }
      : undefined,
  };
}

async function loadProjectWithCards(agentsDir: string, projectConfigPath?: string | null) {
  if (!projectConfigPath) {
    return {
      projectRoot: null as string | null,
      projectConfig: null as ProjectConfig | null,
      cardLocks: [] as Awaited<ReturnType<typeof resolveProjectCards>>,
      projectWithCards: null as ProjectConfig | null,
    };
  }
  const projectRoot = resolveProjectRootFromConfigPath(projectConfigPath);
  const projectConfig = await loadProjectConfig(projectConfigPath);
  let cardLocks: Awaited<ReturnType<typeof resolveProjectCards>> = [];
  try {
    cardLocks = projectConfig.cards ? await resolveProjectCards(agentsDir, projectConfig.cards) : [];
  } catch {
    cardLocks = [];
  }
  const projectWithCards = mergeCardManifestsIntoProjectConfig(
    projectConfig,
    cardLocks.map((card) => card.manifest),
  );
  return { projectRoot, projectConfig, cardLocks, projectWithCards };
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
  const { projectRoot, projectConfig, cardLocks, projectWithCards } = await loadProjectWithCards(agentsDir, projectConfigPath);
  const baseRegistry = mergeUserMcpLibrary(registry, userMcpLibrary);
  const baseConfig = projectConfigPath ? repoConfig : loadedConfig.config;
  const merged = projectWithCards ? mergeProjectConfig(baseConfig, baseRegistry, projectWithCards) : null;
  const effectiveConfig = merged?.config ?? baseConfig;
  const effectiveRegistry = merged?.registry ?? baseRegistry;
  const activeServers = buildActiveServers(effectiveRegistry, effectiveConfig);
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
      ? { configPath: projectConfigPath, root: projectRoot, cardCount: projectConfig.cards?.length ?? 0 }
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
      projectServers: Object.keys(projectConfig?.servers ?? {}),
      cardServers,
    },
    extensions: {
      projectExtensions: Object.keys(projectConfig?.extensions ?? {}),
    },
    cards: {
      configuredRefs: projectConfig?.cards ?? [],
      lockedVersions: (lock?.cards ?? []).map((card) => `${card.name}@${card.version}`),
      warnings: [],
    },
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
  const { projectConfig, cardLocks, projectWithCards } = await loadProjectWithCards(agentsDir, projectConfigPath);
  const baseRegistry = mergeUserMcpLibrary(registry, userMcpLibrary);
  const loadedConfig = await loadEffectiveConfig(repoConfig, agentsDir);
  const baseConfig = projectConfigPath ? repoConfig : loadedConfig.config;
  const merged = projectWithCards ? mergeProjectConfig(baseConfig, baseRegistry, projectWithCards) : null;
  const effectiveConfig = merged?.config ?? baseConfig;
  const effectiveRegistry = merged?.registry ?? baseRegistry;

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
  const projectServer = projectConfig?.servers && Object.hasOwn(projectConfig.servers, name);
  const registryServer = effectiveRegistry.servers[name];
  if (cardServer || projectServer || registryServer) {
    const active = Object.hasOwn(buildActiveServers(effectiveRegistry, effectiveConfig), name);
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
    ...(await findStaleSymlinks(toolPaths.claudeSkills, desiredClaude)),
    ...(await findStaleSymlinks(toolPaths.codexSkills, desiredCodex)),
  ];
}

async function detectMcpDrift(
  config: CanonicalConfig,
  activeServers: Record<string, RegistryServer>,
  homeDir: string,
  toolRoot: string,
  generatedDir: string,
  scope: "machine" | "project" = "machine",
) {
  const drifts: string[] = [];
  const toolPaths = resolveToolPaths(toolRoot);
  const targetConfigPath = (targetName: string, configuredPath: string) => {
    if (scope === "project") {
      if (targetName === "claude") return toolPaths.claudeSettings;
      if (targetName === "codex") return toolPaths.codexConfig;
      return toolPaths.cursorMcp;
    }
    return expandHomePath(configuredPath, homeDir);
  };

  for (const [targetName, target] of Object.entries(config.targets)) {
    if (!target.enabled) {
      continue;
    }

    const configPath = targetConfigPath(targetName, target.configPath);

    if (targetName === "claude" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = mergeClaudeSettingsText(current, activeServers);
      if (current !== expected) {
        drifts.push(`claude:${configPath}`);
      }
    }

    if (targetName === "codex" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = mergeCodexTomlText(current, activeServers);
      if (current !== expected) {
        drifts.push(`codex:${configPath}`);
      }
    }

    if (targetName === "cursor") {
      const generatedPath = join(generatedDir, "cursor-mcp.json");
      if (existsSync(generatedPath)) {
        const current = readFileSync(generatedPath, "utf8");
        const expected = renderCursorConfig(activeServers);
        if (current !== expected) {
          drifts.push(`cursor:${generatedPath}`);
        }
      }
    }
  }

  return drifts;
}

async function detectMissingGeneratedFiles(config: CanonicalConfig, generatedDir: string) {
  const missing: string[] = [];

  if (config.targets.cursor?.enabled) {
    const generatedPath = join(generatedDir, "cursor-mcp.json");
    if (!existsSync(generatedPath)) {
      missing.push(generatedPath);
    }
  }

  return missing;
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
  const defaultSkillOverrides = config.defaults?.skills ? { include: config.defaults.skills } : undefined;

  const sections = await buildDiagnosticsSections(repoRoot, agentsDir, homeDir);
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
    mcpDrift: await detectMcpDrift(config, activeServers, homeDir, homeDir, generatedDir),
    missingGeneratedFiles: await detectMissingGeneratedFiles(config, generatedDir),
    projectConfigIssues: defaultIssues,
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

  const [repoConfig, builtInRegistry, skillInventory, userMcpLibrary] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    buildSkillInventory(repoRoot, agentsDir, homeDir),
    loadMcpLibrary(agentsDir),
  ]);
  const registry = mergeUserMcpLibrary(builtInRegistry, userMcpLibrary);
  const { config } = await loadEffectiveConfig(repoConfig, agentsDir);
  const { projectRoot, projectConfig: project, cardLocks, projectWithCards } = await loadProjectWithCards(agentsDir, projectConfigPath);
  if (!project || !projectWithCards || !projectRoot) {
    return report;
  }
  const merged = mergeProjectConfig(repoConfig, registry, projectWithCards);
  const activeServers = buildActiveServers(registry, repoConfig);
  const availableSkillNames = new Set([
    ...skillInventory.map((skill) => skill.name),
    ...cardLocks.flatMap((card) => card.skills),
  ]);
  const issues: string[] = [];

  for (const [name, override] of Object.entries(project.servers ?? {})) {
    if (isServerToggle(override)) {
      if (!registry.servers[name]) {
        issues.push(`Unknown server reference: "${name}"`);
        continue;
      }
      const centrallyActive = Boolean(activeServers[name]);
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

  const generatedDir = join(projectRoot, ".agents", "bgng", "generated");
  const scopedReport = {
    ...report,
    staleSkillSymlinks: await detectStaleSkillSymlinks(repoRoot, agentsDir, projectRoot, merged.skills, cardLocks),
    mcpDrift: await detectMcpDrift(
      merged.config,
      buildActiveServers(merged.registry, merged.config),
      homeDir,
      projectRoot,
      generatedDir,
      "project",
    ),
    missingGeneratedFiles: await detectMissingGeneratedFiles(merged.config, generatedDir),
    projectConfigIssues: [...report.projectConfigIssues, ...issues],
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
