// ABOUTME: Inspects and diagnoses editable local Mind Card sources.
// ABOUTME: Separates source authoring state from published card consumption state.

import { existsSync } from "node:fs";
import { cp, lstat, readdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { assertValidCardManifest, validateCardManifest, type CardManifest } from "./card-manifest";
import { writeAtomically } from "./fs";
import { findLibraryMcpServer, findLibrarySkill } from "./library";
import { validateMcpLibraryServer } from "./mcp-library";
import { findRepoSkill } from "./skills";
import { assertSafePathPart, assertStoreWritable, resolveCardSourceDir, resolveSourcesRoot } from "./store-paths";
import type { RegistryServer } from "./types";

export interface CardSourceIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  path?: string;
}

export interface CardSourceSkillState {
  name: string;
  path: string;
  hasSkillMd: boolean;
}

export interface CardSourceMcpServerState {
  id: string;
  path: string;
  server: RegistryServer | null;
  error?: string;
}

export interface CardSourceHookState {
  name: string;
  path: string;
  hasPolicyTs: boolean;
}

export interface CardSourcePackageState {
  path: string;
  name?: string;
  version?: string;
  error?: string;
}

export interface CardSourceState {
  name: string;
  sourceDir: string;
  manifestPath: string;
  manifest: CardManifest | null;
  manifestErrors: string[];
  manifestSkills: string[];
  manifestHooks: string[];
  bundledSkills: CardSourceSkillState[];
  bundledHooks: CardSourceHookState[];
  orphanedSkills: string[];
  orphanedHooks: string[];
  missingSkillDirs: string[];
  missingSkillFiles: string[];
  missingHookDirs: string[];
  missingHookFiles: string[];
  packageJson: CardSourcePackageState | null;
  mcpServers: CardSourceMcpServerState[];
  issues: CardSourceIssue[];
  ok: boolean;
}

export interface CardSourceSummary {
  name: string;
  path: string;
  version?: string;
  description?: string;
  ok: boolean;
  issues: CardSourceIssue[];
}

export interface CardSourceDoctorReport {
  ok: boolean;
  sources: CardSourceState[];
  issues: CardSourceIssue[];
}

export interface CardSourceMutationChange {
  action: string;
  path?: string;
  from?: string;
  to?: string;
}

export interface CardSourceSkillMutationResult {
  card: string;
  skill: string;
  dryRun: boolean;
  changes: CardSourceMutationChange[];
}

export interface CardSourceMcpMutationResult {
  card: string;
  serverId: string;
  dryRun: boolean;
  changes: CardSourceMutationChange[];
}

export interface CardSourceHookMutationResult {
  card: string;
  hook: string;
  dryRun: boolean;
  changes: CardSourceMutationChange[];
}

export interface CardSourceManifestChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface CardSourceManifestSetResult {
  card: string;
  dryRun: boolean;
  changes: CardSourceManifestChange[];
}

export interface CardSourceManifestPatch {
  description?: string;
  version?: string;
  license?: string;
  harnessMinVersion?: string;
  stability?: string;
  lastValidatedWith?: string;
  testStatusBadge?: string;
}

function issue(code: string, message: string, path?: string): CardSourceIssue {
  return { code, severity: "error", message, path };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function discoverSourceNames(agentsDir: string) {
  const root = resolveSourcesRoot(agentsDir);
  if (!existsSync(root)) {
    return [];
  }
  const names: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || (!entry.isDirectory() && !entry.isSymbolicLink())) {
      continue;
    }
    if (entry.name.startsWith("@")) {
      const scopeDir = join(root, entry.name);
      for (const child of await readdir(scopeDir, { withFileTypes: true })) {
        if (child.name.startsWith(".") || (!child.isDirectory() && !child.isSymbolicLink())) {
          continue;
        }
        names.push(`${entry.name}/${child.name}`);
      }
      continue;
    }
    names.push(entry.name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

async function parseJsonFile(path: string): Promise<{ value: unknown; error?: string }> {
  try {
    return { value: JSON.parse(await readFile(path, "utf8")) };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function assertSafeSkillName(name: string) {
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`Invalid skill name: ${name}`);
  }
}

function assertSafeServerId(id: string) {
  if (!id || id.includes("/") || id.includes("\\") || id === "." || id === "..") {
    throw new Error(`Invalid MCP server id: ${id}`);
  }
}

function assertSafeHookName(name: string) {
  assertSafePathPart(name, "hook policy");
}

async function readSourceManifestForMutation(agentsDir: string, cardName: string) {
  const state = await readCardSourceState(agentsDir, cardName);
  if (!state.manifest) {
    throw new Error(`Card source manifest is invalid: ${cardName}`);
  }
  return { state, manifest: state.manifest };
}

async function writeCardSourceManifest(manifestPath: string, manifest: CardManifest) {
  assertValidCardManifest(manifest);
  await writeAtomically(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function resolveSkillSource(options: {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  skillName: string;
  from?: string;
}) {
  if (options.from) {
    const path = resolve(options.from);
    if (!existsSync(path)) {
      throw new Error(`Skill source path does not exist: ${path}`);
    }
    const stats = await lstat(path);
    if (stats.isFile() && basename(path) === "SKILL.md") {
      return { path: dirname(path) };
    }
    if (stats.isDirectory() && existsSync(join(path, "SKILL.md"))) {
      return { path };
    }
    throw new Error(`Skill source must be a SKILL.md file or a directory containing SKILL.md: ${path}`);
  }
  const repoSkill = await findRepoSkill(options.repoRoot, options.skillName);
  if (repoSkill) {
    return { path: repoSkill.path };
  }
  const librarySkill = await findLibrarySkill(options.repoRoot, options.agentsDir, options.homeDir, options.skillName);
  if (librarySkill) {
    return { path: librarySkill.path };
  }
  throw new Error(`Unknown skill: ${options.skillName}`);
}

async function resolveMcpDefinition(options: {
  repoRoot: string;
  agentsDir: string;
  serverId: string;
  from?: string;
}): Promise<RegistryServer> {
  if (options.from) {
    const path = resolve(options.from);
    const parsed = await parseJsonFile(path);
    if (parsed.error) {
      throw new Error(`MCP source is not valid JSON: ${parsed.error}`);
    }
    const server = parsed.value;
    validateMcpLibraryServer(options.serverId, server);
    return server;
  }
  const server = await findLibraryMcpServer(options.repoRoot, options.serverId, options.agentsDir);
  if (!server) {
    throw new Error(`Unknown MCP server: ${options.serverId}`);
  }
  return server.server;
}

async function listBundledSkills(sourceDir: string): Promise<CardSourceSkillState[]> {
  const skillsDir = join(sourceDir, "skills");
  if (!existsSync(skillsDir)) {
    return [];
  }
  const skills: CardSourceSkillState[] = [];
  for (const entry of await readdir(skillsDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || (!entry.isDirectory() && !entry.isSymbolicLink())) {
      continue;
    }
    const skillPath = join(skillsDir, entry.name);
    skills.push({
      name: entry.name,
      path: skillPath,
      hasSkillMd: existsSync(join(skillPath, "SKILL.md")),
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function listBundledHooks(sourceDir: string): Promise<CardSourceHookState[]> {
  const hooksDir = join(sourceDir, "hooks");
  if (!existsSync(hooksDir)) {
    return [];
  }
  const hooks: CardSourceHookState[] = [];
  for (const entry of await readdir(hooksDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || (!entry.isDirectory() && !entry.isSymbolicLink())) {
      continue;
    }
    const hookPath = join(hooksDir, entry.name);
    hooks.push({
      name: entry.name,
      path: hookPath,
      hasPolicyTs: existsSync(join(hookPath, "policy.ts")),
    });
  }
  return hooks.sort((a, b) => a.name.localeCompare(b.name));
}

async function validatePolicyModule(path: string, issues: CardSourceIssue[]) {
  try {
    const buildConfig = {
      entrypoints: [path],
      target: "node",
      format: "esm",
      write: false,
      external: ["darwinian-mind/hook-policy"],
    } as Parameters<typeof Bun.build>[0] & { write: false };
    const result = await Bun.build(buildConfig);
    if (!result.success) {
      issues.push(issue("invalid_policy_module", `Hook policy module is not valid TypeScript: ${path}`, path));
    }
  } catch {
    issues.push(issue("invalid_policy_module", `Hook policy module is not valid TypeScript: ${path}`, path));
  }
}

async function readPackageJson(sourceDir: string, manifest: CardManifest | null, issues: CardSourceIssue[]) {
  const path = join(sourceDir, "package.json");
  if (!existsSync(path)) {
    return null;
  }
  const parsed = await parseJsonFile(path);
  if (parsed.error || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    issues.push(issue("invalid_package_json", `package.json is not valid JSON: ${parsed.error ?? "expected object"}`, path));
    return { path, error: parsed.error ?? "expected object" };
  }
  const packageJson = parsed.value as { name?: unknown; version?: unknown };
  const state: CardSourcePackageState = {
    path,
    ...(typeof packageJson.name === "string" ? { name: packageJson.name } : {}),
    ...(typeof packageJson.version === "string" ? { version: packageJson.version } : {}),
  };
  if (manifest && state.name !== undefined && state.name !== manifest.name) {
    issues.push(issue("package_name_mismatch", `package.json.name must equal card.json name: ${manifest.name}`, path));
  }
  if (manifest && state.version !== undefined && state.version !== manifest.version) {
    issues.push(issue("package_version_mismatch", `package.json.version must equal card.json version: ${manifest.version}`, path));
  }
  return state;
}

async function readMcpServers(sourceDir: string, manifest: CardManifest | null, issues: CardSourceIssue[]) {
  const dir = join(sourceDir, "mcp-servers");
  if (!existsSync(dir)) {
    return [];
  }
  const servers: CardSourceMcpServerState[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const id = entry.name.slice(0, -".json".length);
    const path = join(dir, entry.name);
    const parsed = await parseJsonFile(path);
    if (parsed.error) {
      const error = `MCP server ${id} is not valid JSON: ${parsed.error}`;
      issues.push(issue("invalid_mcp_json", error, path));
      servers.push({ id, path, server: null, error });
      continue;
    }
    try {
      const server = parsed.value;
      validateMcpLibraryServer(id, server);
      const manifestServer = manifest?.servers?.[id];
      if (manifestServer && canonicalJson(manifestServer) !== canonicalJson(server)) {
        issues.push(issue("mcp_manifest_divergence", `mcp-servers/${id}.json differs from card.json.servers.${id}`, path));
      }
      servers.push({ id, path, server });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(issue("invalid_mcp_server", message, path));
      servers.push({ id, path, server: null, error: message });
    }
  }
  return servers.sort((a, b) => a.id.localeCompare(b.id));
}

export async function readCardSourceState(agentsDir: string, name: string): Promise<CardSourceState> {
  const sourceDir = resolveCardSourceDir(agentsDir, name);
  if (!existsSync(sourceDir)) {
    throw new Error(`Card source not found: ${name}`);
  }

  const issues: CardSourceIssue[] = [];
  const manifestPath = join(sourceDir, "card.json");
  let manifest: CardManifest | null = null;
  const manifestErrors: string[] = [];
  if (!existsSync(manifestPath)) {
    issues.push(issue("missing_card_json", `Card source is missing card.json: ${manifestPath}`, manifestPath));
  } else {
    const parsed = await parseJsonFile(manifestPath);
    if (parsed.error) {
      manifestErrors.push(parsed.error);
      issues.push(issue("invalid_card_json", `card.json is not valid JSON: ${parsed.error}`, manifestPath));
    } else {
      const validation = validateCardManifest(parsed.value);
      if (!validation.ok) {
        manifestErrors.push(...validation.errors);
        issues.push(issue("invalid_card_manifest", validation.errors.join("; "), manifestPath));
      } else {
        const validManifest = parsed.value as CardManifest;
        manifest = validManifest;
        if (manifest.name !== name) {
          issues.push(issue("manifest_name_mismatch", `card.json.name must equal source name: ${name}`, manifestPath));
        }
      }
    }
  }

  const manifestSkills = manifest?.skills?.include ?? [];
  const manifestHooks = manifest?.hooks?.include ?? [];
  const bundledSkills = await listBundledSkills(sourceDir);
  const bundledHooks = await listBundledHooks(sourceDir);
  const bundledNames = new Set(bundledSkills.map((skill) => skill.name));
  const bundledHookNames = new Set(bundledHooks.map((hook) => hook.name));
  const manifestSkillSet = new Set(manifestSkills);
  const manifestHookSet = new Set(manifestHooks);
  const orphanedSkills = bundledSkills.filter((skill) => !manifestSkillSet.has(skill.name)).map((skill) => skill.name);
  const orphanedHooks = bundledHooks.filter((hook) => !manifestHookSet.has(hook.name)).map((hook) => hook.name);
  const missingSkillDirs = manifestSkills.filter((skill) => !bundledNames.has(skill));
  const missingSkillFiles = bundledSkills.filter((skill) => !skill.hasSkillMd).map((skill) => skill.name);
  const missingHookDirs = manifestHooks.filter((hook) => !bundledHookNames.has(hook));
  const missingHookFiles = bundledHooks
    .filter((hook) => manifestHookSet.has(hook.name) && !hook.hasPolicyTs)
    .map((hook) => hook.name);

  for (const skill of orphanedSkills) {
    issues.push(issue("orphaned_skill_dir", `Bundled skill is not declared in card.json skills.include: ${skill}`, join(sourceDir, "skills", skill)));
  }
  for (const skill of missingSkillDirs) {
    issues.push(issue("missing_skill_dir", `card.json skills.include references a missing skill directory: ${skill}`, join(sourceDir, "skills", skill)));
  }
  for (const skill of missingSkillFiles) {
    issues.push(issue("missing_skill_md", `Bundled skill is missing SKILL.md: ${skill}`, join(sourceDir, "skills", skill, "SKILL.md")));
  }
  for (const hook of orphanedHooks) {
    issues.push(issue("orphaned_hook_dir", `Bundled hook is not declared in card.json hooks.include: ${hook}`, join(sourceDir, "hooks", hook)));
  }
  for (const hook of missingHookDirs) {
    issues.push(issue("missing_hook_dir", `card.json hooks.include references a missing hook directory: ${hook}`, join(sourceDir, "hooks", hook)));
  }
  for (const hook of missingHookFiles) {
    issues.push(issue("missing_policy_ts", `Bundled hook is missing policy.ts: ${hook}`, join(sourceDir, "hooks", hook, "policy.ts")));
  }
  for (const hook of bundledHooks) {
    if (manifestHookSet.has(hook.name) && hook.hasPolicyTs) {
      await validatePolicyModule(join(hook.path, "policy.ts"), issues);
    }
  }

  const packageJson = await readPackageJson(sourceDir, manifest, issues);
  const mcpServers = await readMcpServers(sourceDir, manifest, issues);

  return {
    name,
    sourceDir,
    manifestPath,
    manifest,
    manifestErrors,
    manifestSkills,
    manifestHooks,
    bundledSkills,
    bundledHooks,
    orphanedSkills,
    orphanedHooks,
    missingSkillDirs,
    missingSkillFiles,
    missingHookDirs,
    missingHookFiles,
    packageJson,
    mcpServers,
    issues,
    ok: issues.length === 0,
  };
}

export async function listCardSources(agentsDir: string): Promise<CardSourceSummary[]> {
  const names = await discoverSourceNames(agentsDir);
  const states = await Promise.all(names.map((name) => readCardSourceState(agentsDir, name)));
  return states.map((state) => ({
    name: state.name,
    path: state.sourceDir,
    ...(state.manifest?.version ? { version: state.manifest.version } : {}),
    ...(state.manifest?.description ? { description: state.manifest.description } : {}),
    ok: state.ok,
    issues: state.issues,
  }));
}

export async function doctorCardSource(agentsDir: string, name?: string): Promise<CardSourceDoctorReport> {
  const names = name ? [name] : await discoverSourceNames(agentsDir);
  const sources = await Promise.all(names.map((sourceName) => readCardSourceState(agentsDir, sourceName)));
  const issues = sources.flatMap((source) => source.issues);
  return { ok: issues.length === 0, sources, issues };
}

function hookPolicyTemplate(policyName: string) {
  return `// ABOUTME: Tool-call policy for ${policyName}.
// ABOUTME: Replace this stub with your enforcement or observer logic.

import { defineToolPolicy } from "darwinian-mind/hook-policy";

export default defineToolPolicy({
  policyKind: "observer",
  async afterToolCall(event) {
    // event.runtime, event.phase, event.toolName, event.input, event.output, ...
  },
});
`;
}

export async function addCardSourceHook(options: {
  agentsDir: string;
  cardName: string;
  hookName: string;
  dryRun?: boolean;
}): Promise<CardSourceHookMutationResult> {
  assertSafeHookName(options.hookName);
  const dryRun = options.dryRun === true;
  const { state, manifest } = await readSourceManifestForMutation(options.agentsDir, options.cardName);
  const destination = join(state.sourceDir, "hooks", options.hookName);
  const policyPath = join(destination, "policy.ts");
  const include = [...(manifest.hooks?.include ?? [])];
  if (include.includes(options.hookName) || existsSync(destination)) {
    throw new Error(`Hook already exists in card source: ${options.hookName}`);
  }

  const nextManifest: CardManifest = {
    ...manifest,
    hooks: {
      ...(manifest.hooks ?? {}),
      include: [...include, options.hookName],
    },
  };
  const changes: CardSourceMutationChange[] = [
    { action: "add-hook", path: policyPath },
    { action: "update-manifest", path: state.manifestPath },
  ];

  if (!dryRun) {
    assertStoreWritable();
    await writeAtomically(policyPath, hookPolicyTemplate(options.hookName));
    await writeCardSourceManifest(state.manifestPath, nextManifest);
  }

  return { card: options.cardName, hook: options.hookName, dryRun, changes };
}

export async function removeCardSourceHook(options: {
  agentsDir: string;
  cardName: string;
  hookName: string;
  keepFiles?: boolean;
  dryRun?: boolean;
}): Promise<CardSourceHookMutationResult> {
  assertSafeHookName(options.hookName);
  const dryRun = options.dryRun === true;
  const { state, manifest } = await readSourceManifestForMutation(options.agentsDir, options.cardName);
  const destination = join(state.sourceDir, "hooks", options.hookName);
  const include = manifest.hooks?.include ?? [];
  if (!include.includes(options.hookName)) {
    throw new Error(`Hook is not declared in card source: ${options.hookName}`);
  }

  const nextManifest: CardManifest = {
    ...manifest,
    hooks: {
      ...(manifest.hooks ?? {}),
      include: include.filter((hook) => hook !== options.hookName),
    },
  };
  const changes: CardSourceMutationChange[] = [
    ...(options.keepFiles ? [] : [{ action: "remove-hook-files", path: destination }]),
    { action: "update-manifest", path: state.manifestPath },
  ];

  if (!dryRun) {
    assertStoreWritable();
    if (!options.keepFiles) {
      await rm(destination, { recursive: true, force: true });
    }
    await writeCardSourceManifest(state.manifestPath, nextManifest);
  }

  return { card: options.cardName, hook: options.hookName, dryRun, changes };
}

export async function addCardSourceSkill(options: {
  agentsDir: string;
  repoRoot: string;
  homeDir: string;
  cardName: string;
  skillName: string;
  from?: string;
  replace?: boolean;
  dryRun?: boolean;
}): Promise<CardSourceSkillMutationResult> {
  assertSafeSkillName(options.skillName);
  const dryRun = options.dryRun === true;
  const { state, manifest } = await readSourceManifestForMutation(options.agentsDir, options.cardName);
  const source = await resolveSkillSource({
    repoRoot: options.repoRoot,
    agentsDir: options.agentsDir,
    homeDir: options.homeDir,
    skillName: options.skillName,
    from: options.from,
  });
  const destination = join(state.sourceDir, "skills", options.skillName);
  const include = [...(manifest.skills?.include ?? [])];
  const alreadyIncluded = include.includes(options.skillName);
  const destinationExists = existsSync(destination);
  if ((alreadyIncluded || destinationExists) && !options.replace) {
    throw new Error(`Skill already exists in card source: ${options.skillName}. Use --replace to overwrite it.`);
  }

  const nextManifest: CardManifest = {
    ...manifest,
    skills: {
      ...(manifest.skills ?? {}),
      include: alreadyIncluded ? include : [...include, options.skillName],
    },
  };
  const changes: CardSourceMutationChange[] = [
    { action: "copy-skill", from: source.path, to: destination },
    ...(alreadyIncluded ? [] : [{ action: "update-manifest", path: state.manifestPath }]),
  ];

  if (!dryRun) {
    assertStoreWritable();
    await rm(destination, { recursive: true, force: true });
    await cp(source.path, destination, { recursive: true, verbatimSymlinks: false });
    await writeCardSourceManifest(state.manifestPath, nextManifest);
  }

  return { card: options.cardName, skill: options.skillName, dryRun, changes };
}

export async function removeCardSourceSkill(options: {
  agentsDir: string;
  cardName: string;
  skillName: string;
  keepFiles?: boolean;
  dryRun?: boolean;
}): Promise<CardSourceSkillMutationResult> {
  assertSafeSkillName(options.skillName);
  const dryRun = options.dryRun === true;
  const { state, manifest } = await readSourceManifestForMutation(options.agentsDir, options.cardName);
  const destination = join(state.sourceDir, "skills", options.skillName);
  const include = manifest.skills?.include ?? [];
  if (!include.includes(options.skillName) && !existsSync(destination)) {
    throw new Error(`Skill is not present in card source: ${options.skillName}`);
  }
  const nextManifest: CardManifest = {
    ...manifest,
    skills: {
      ...(manifest.skills ?? {}),
      include: include.filter((skill) => skill !== options.skillName),
    },
  };
  const changes: CardSourceMutationChange[] = [
    ...(options.keepFiles ? [] : [{ action: "remove-skill-files", path: destination }]),
    ...(include.includes(options.skillName) ? [{ action: "update-manifest", path: state.manifestPath }] : []),
  ];

  if (!dryRun) {
    assertStoreWritable();
    if (!options.keepFiles) {
      await rm(destination, { recursive: true, force: true });
    }
    await writeCardSourceManifest(state.manifestPath, nextManifest);
  }

  return { card: options.cardName, skill: options.skillName, dryRun, changes };
}

export async function patchCardSourceManifest(options: {
  agentsDir: string;
  cardName: string;
  patch: CardSourceManifestPatch;
  dryRun?: boolean;
}): Promise<CardSourceManifestSetResult> {
  const dryRun = options.dryRun === true;
  const { state, manifest } = await readSourceManifestForMutation(options.agentsDir, options.cardName);
  const nextManifest: CardManifest = {
    ...manifest,
    ...(manifest.harness ? { harness: { ...manifest.harness } } : {}),
  };
  const changes: CardSourceManifestChange[] = [];

  function setField(field: string, oldValue: unknown, newValue: unknown, apply: () => void) {
    if (newValue === undefined) {
      return;
    }
    changes.push({ field, oldValue, newValue });
    apply();
  }

  setField("description", manifest.description ?? "", options.patch.description, () => {
    nextManifest.description = options.patch.description;
  });
  setField("version", manifest.version, options.patch.version, () => {
    nextManifest.version = options.patch.version!;
  });
  setField("license", manifest.license, options.patch.license, () => {
    nextManifest.license = options.patch.license;
  });
  setField("harness.minVersion", manifest.harness?.minVersion, options.patch.harnessMinVersion, () => {
    nextManifest.harness = { ...(nextManifest.harness ?? {}), minVersion: options.patch.harnessMinVersion };
  });
  setField("stability", manifest.stability, options.patch.stability, () => {
    nextManifest.stability = options.patch.stability as CardManifest["stability"];
  });
  setField("lastValidatedWith", manifest.lastValidatedWith, options.patch.lastValidatedWith, () => {
    nextManifest.lastValidatedWith = options.patch.lastValidatedWith;
  });
  setField("testStatusBadge", manifest.testStatusBadge, options.patch.testStatusBadge, () => {
    nextManifest.testStatusBadge = options.patch.testStatusBadge;
  });

  if (changes.length === 0) {
    throw new Error("No manifest fields were provided to update.");
  }
  assertValidCardManifest(nextManifest);

  if (!dryRun) {
    assertStoreWritable();
    await writeCardSourceManifest(state.manifestPath, nextManifest);
  }

  return { card: options.cardName, dryRun, changes };
}

export async function addCardSourceMcp(options: {
  agentsDir: string;
  repoRoot: string;
  cardName: string;
  serverId: string;
  from?: string;
  replace?: boolean;
  dryRun?: boolean;
}): Promise<CardSourceMcpMutationResult> {
  assertSafeServerId(options.serverId);
  const dryRun = options.dryRun === true;
  const { state, manifest } = await readSourceManifestForMutation(options.agentsDir, options.cardName);
  const server = await resolveMcpDefinition({
    repoRoot: options.repoRoot,
    agentsDir: options.agentsDir,
    serverId: options.serverId,
    from: options.from,
  });
  const destination = join(state.sourceDir, "mcp-servers", `${options.serverId}.json`);
  const alreadyDeclared = manifest.servers?.[options.serverId] !== undefined;
  const destinationExists = existsSync(destination);
  if ((alreadyDeclared || destinationExists) && !options.replace) {
    throw new Error(`MCP server already exists in card source: ${options.serverId}. Use --replace to overwrite it.`);
  }

  const nextManifest: CardManifest = {
    ...manifest,
    servers: {
      ...(manifest.servers ?? {}),
      [options.serverId]: server,
    },
  };
  const changes: CardSourceMutationChange[] = [
    { action: "write-mcp-file", path: destination },
    { action: "update-manifest", path: state.manifestPath },
  ];

  if (!dryRun) {
    assertStoreWritable();
    await writeAtomically(destination, `${JSON.stringify(server, null, 2)}\n`);
    await writeCardSourceManifest(state.manifestPath, nextManifest);
  }

  return { card: options.cardName, serverId: options.serverId, dryRun, changes };
}

export async function removeCardSourceMcp(options: {
  agentsDir: string;
  cardName: string;
  serverId: string;
  keepFiles?: boolean;
  dryRun?: boolean;
}): Promise<CardSourceMcpMutationResult> {
  assertSafeServerId(options.serverId);
  const dryRun = options.dryRun === true;
  const { state, manifest } = await readSourceManifestForMutation(options.agentsDir, options.cardName);
  const destination = join(state.sourceDir, "mcp-servers", `${options.serverId}.json`);
  const servers = { ...(manifest.servers ?? {}) };
  const declared = servers[options.serverId] !== undefined;
  if (!declared && !existsSync(destination)) {
    throw new Error(`MCP server is not present in card source: ${options.serverId}`);
  }
  delete servers[options.serverId];
  const nextManifest: CardManifest = { ...manifest, servers };
  const changes: CardSourceMutationChange[] = [
    ...(options.keepFiles ? [] : [{ action: "remove-mcp-file", path: destination }]),
    ...(declared ? [{ action: "update-manifest", path: state.manifestPath }] : []),
  ];

  if (!dryRun) {
    assertStoreWritable();
    if (!options.keepFiles) {
      await rm(destination, { recursive: true, force: true });
    }
    await writeCardSourceManifest(state.manifestPath, nextManifest);
  }

  return { card: options.cardName, serverId: options.serverId, dryRun, changes };
}
