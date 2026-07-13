// ABOUTME: Runs the release-readiness quality gate for the drwn CLI and darwinian package.
// ABOUTME: Combines automated checks and explicit warnings into a single non-mutating verification entrypoint.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type CheckResult = {
  name: string;
  ok: boolean;
  details?: string;
};

type GateReport = {
  ok: boolean;
  checks: CheckResult[];
  warnings: string[];
};

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const testMode = process.env.QUALITY_GATE_TEST_MODE === "1";

async function runCommand(name: string, cmd: string[]) {
  const proc = Bun.spawn(cmd, {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    name,
    ok: exitCode === 0,
    details: exitCode === 0 ? undefined : `${stdout}${stderr}`.trim(),
  } satisfies CheckResult;
}

async function verifyPackageContents() {
  const proc = Bun.spawn(["npm", "pack", "--dry-run", "--json"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return {
      name: "package contents",
      ok: false,
      details: `${stdout}${stderr}`.trim(),
    } satisfies CheckResult;
  }

  const parsed = JSON.parse(stdout) as Array<{ files?: Array<{ path: string }> }>;
  const files = parsed[0]?.files?.map((file) => file.path) ?? [];
  const forbidden = files.filter(
    (file) =>
      file === ".env" ||
      file.startsWith(".ai/") ||
      file.startsWith("test/") ||
      file.startsWith("scripts/"),
  );
  const required = [
    "cli/index.ts",
    "cli/commands/write.ts",
    "cli/commands/mcp/write.ts",
    "registry/config.json",
    "registry/mcp-servers.json",
    "skills/shared/frontend-design/SKILL.md",
  ];
  const removedCommandFiles = [
    "cli/commands/apply.ts",
    "cli/commands/mcp/apply.ts",
    "cli/commands/sync.ts",
    "cli/commands/mcp/sync.ts",
    "cli/commands/skills/sync.ts",
    "sync-mcp.ts",
  ];
  const forbiddenCommands = removedCommandFiles.filter((file) => files.includes(file));
  const missingRequired = required.filter((file) => !files.includes(file));
  const details = [
    ...(forbidden.length > 0 ? [`Forbidden: ${forbidden.join(", ")}`] : []),
    ...(forbiddenCommands.length > 0 ? [`Removed commands: ${forbiddenCommands.join(", ")}`] : []),
    ...(missingRequired.length > 0 ? [`Missing: ${missingRequired.join(", ")}`] : []),
  ];

  return {
    name: "package contents",
    ok: details.length === 0,
    details: details.join("; ") || undefined,
  } satisfies CheckResult;
}

function findHardcodedUserPaths() {
  const targets = [
    "cli",
    "sync-mcp.ts",
    "README.md",
    "registry/mcp-servers.json",
    "registry/config.json",
    "package.json",
    ".ai/knowledges/01_agents-cli-usage-guide.md",
    ".ai/knowledges/02_per-project-config-guide.md",
    ".ai/knowledges/03_npm-skill-bundles-guide.md",
    ".ai/knowledges/04_homebrew-release-checklist.md",
    ".ai/knowledges/05_npm-publishing-analysis-and-manual.md",
  ];
  const matches: string[] = [];

  for (const target of targets) {
    const pathValue = join(repoRoot, target);
    if (!existsSync(pathValue)) {
      continue;
    }
    const stat = Bun.file(pathValue);
    if (target === "cli") {
      for (const file of new Bun.Glob("**/*").scanSync({ cwd: pathValue, absolute: true })) {
        if (!file.endsWith(".ts")) {
          continue;
        }
        const content = readFileSync(file, "utf8");
        if (content.includes("/Users/")) {
          matches.push(file.replace(`${repoRoot}/`, ""));
        }
      }
      continue;
    }

    const content = readFileSync(pathValue, "utf8");
    if (content.includes("/Users/")) {
      matches.push(target);
    }
  }

  return matches;
}

function verifyPackageMetadata() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as Record<string, unknown>;
  const requiredKeys = ["name", "version", "description", "license", "author", "keywords", "bin"] as const;
  const missing = requiredKeys.filter((key) => pkg[key] === undefined);
  const metadataIssues: string[] = [];
  const warnings: string[] = [];

  if (pkg.name !== "darwinian") {
    metadataIssues.push("name must be darwinian");
  }

  if (typeof pkg.bin !== "object" || pkg.bin === null || (pkg.bin as Record<string, string>).drwn !== "cli/index.ts") {
    metadataIssues.push("bin.drwn must point to cli/index.ts");
  }

  if (typeof pkg.scripts !== "object" || pkg.scripts === null || (pkg.scripts as Record<string, string>).drwn !== "bun run cli/index.ts") {
    metadataIssues.push("scripts.drwn must be 'bun run cli/index.ts'");
  }

  if (pkg.repository === undefined) {
    warnings.push("repository metadata unresolved");
  }

  return {
    check: {
      name: "package metadata",
      ok: missing.length === 0 && metadataIssues.length === 0,
      details: [...(missing.length > 0 ? [`Missing: ${missing.join(", ")}`] : []), ...metadataIssues].join("; ") || undefined,
    } satisfies CheckResult,
    warnings,
  };
}

function verifyDocsPresence() {
  const requiredFiles = [
    "README.md",
    "CONTRIBUTING.md",
    "LICENSE",
    ".ai/knowledges/01_agents-cli-usage-guide.md",
    ".ai/knowledges/02_per-project-config-guide.md",
    ".ai/knowledges/03_npm-skill-bundles-guide.md",
    ".ai/knowledges/04_homebrew-release-checklist.md",
    ".ai/knowledges/05_npm-publishing-analysis-and-manual.md",
  ];
  const missing = requiredFiles.filter((file) => !existsSync(join(repoRoot, file)));

  return {
    name: "documentation presence",
    ok: missing.length === 0,
    details: missing.length > 0 ? `Missing: ${missing.join(", ")}` : undefined,
  } satisfies CheckResult;
}

type SourceOverrides = Record<string, string>;

export function verifyStoreExportSecurity(root = repoRoot, overrides: SourceOverrides = {}) {
  const issues: string[] = [];
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
  };
  const publicExportPath = "cli/commands/store/export.ts";
  const publicExportExists = Object.hasOwn(overrides, publicExportPath)
    ? overrides[publicExportPath]!.length > 0
    : existsSync(join(root, publicExportPath));
  const index = source("cli/index.ts");
  const deploy = source("cli/core/worker-deploy.ts");
  const deployTests = source("test/core-worker-deploy.test.ts");

  if (publicExportExists || /StoreExportCommand/.test(index) || /commands\/store\/export/.test(index)) {
    issues.push("public whole-Store export must remain unavailable");
  }
  if (!deploy.includes("function storeExportEntries") || !deploy.includes('new Set<string>(["drwn/store.json"])')) {
    issues.push("remote deploy must retain its scoped Store export allowlist");
  }
  if (/entries\s*:\s*\[\s*["']drwn["']\s*\]/.test(deploy)) {
    issues.push("remote deploy must not archive the whole drwn Store root");
  }
  if (!deployTests.includes("storeExport decodes and seeds a store") || !deployTests.includes("without leaking local schemas")) {
    issues.push("scoped remote deploy export coverage is missing");
  }

  return {
    name: "store export security",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  } satisfies CheckResult;
}

function sourceSlice(content: string, startToken: string, endToken?: string) {
  const start = content.indexOf(startToken);
  if (start === -1) return "";
  const end = endToken ? content.indexOf(endToken, start + startToken.length) : -1;
  return content.slice(start, end === -1 ? undefined : end);
}

export function verifyMachineContract(root = repoRoot, overrides: SourceOverrides = {}): CheckResult {
  const issues: string[] = [];
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    if (!existsSync(absolutePath)) {
      issues.push(`missing machine contract source ${pathValue}`);
      return "";
    }
    return readFileSync(absolutePath, "utf8");
  };
  const requireTokens = (pathValue: string, tokens: string[]) => {
    const content = source(pathValue);
    for (const token of tokens) {
      if (!content.includes(token)) issues.push(`${pathValue} is missing ${token}`);
    }
  };

  requireTokens("cli/core/machine-config.ts", [
    'schema: z.literal("drwn.machine")',
    "schemaVersion: z.literal(1)",
    "capabilities: z.object",
    "profile: profileSchema.nullable()",
    "skills: uniqueIds",
    "mcpServers: uniqueIds",
    "MACHINE_CONFIG_INVALID",
    ".strict()",
  ]);
  requireTokens("cli/core/user-config.ts", [
    "resolveMachineConfigPath",
    "readMachineConfigFile",
    "mergeMachinePolicy(repoConfig, machineConfig)",
  ]);
  requireTokens("cli/core/defaults.ts", [
    "resolveMachineCapabilities",
    "verifyMachineProfilePin",
    "machine.capabilities.skills",
    "machine.capabilities.mcpServers",
  ]);

  const machineReaders = [
    "cli/core/user-config.ts",
    "cli/core/card-store.ts",
    "cli/core/effective-state.ts",
    "cli/core/defaults.ts",
    "cli/core/diagnostics.ts",
  ];
  for (const pathValue of machineReaders) {
    const content = source(pathValue);
    for (const field of ["defaults", "optional", "parallel"] as const) {
      if (new RegExp(`(?:machineConfig|machine|input)\\.${field}\\b`).test(content)) {
        issues.push(`${pathValue} reads prototype machine field ${field}`);
      }
    }
    if (content.includes("resolveUserConfigPath")) {
      issues.push(`${pathValue} reads the prototype machine config path`);
    }
  }

  const defaultsSource = source("cli/core/defaults.ts");
  const activation = sourceSlice(
    defaultsSource,
    "export async function resolveMachineCapabilities",
    "export async function validateDefaultReferences",
  );
  for (const forbidden of [
    "listCuratedSkills",
    "resolveDefaultSkillNames",
    "resolveDefaultMcpNames",
    "config.optional",
    "config.parallel",
  ]) {
    if (activation.includes(forbidden)) issues.push(`machine activation reads ${forbidden}`);
  }
  if (activation.includes("resolveCard(")) {
    issues.push("machine activation performs runtime profile resolution");
  }

  const profileSource = source("cli/core/machine-profiles.ts");
  const offlineVerification = sourceSlice(
    profileSource,
    "export async function verifyMachineProfilePin",
    "export async function initializeMachineCapabilities",
  );
  if (offlineVerification.includes("resolveCard(")) {
    issues.push("pinned profile verification performs a runtime fetch");
  }
  requireTokens("cli/core/machine-profiles.ts", [
    "computeIntegrityFromDir(dir)",
    "Pinned profile bytes are missing",
    "Pinned profile integrity changed",
  ]);

  let profile: Record<string, unknown> | null = null;
  try {
    const registry = JSON.parse(source("registry/machine-profiles.json")) as {
      schema?: string;
      schemaVersion?: number;
      profiles?: Array<Record<string, unknown>>;
    };
    if (registry.schema !== "drwn.machine-profiles" || registry.schemaVersion !== 1 || registry.profiles?.length !== 1) {
      issues.push("machine profile registry must contain exactly one V1 profile");
    }
    profile = registry.profiles?.[0] ?? null;
  } catch {
    issues.push("machine profile registry must be valid JSON");
  }
  if (profile) {
    if (profile.id !== "darwinian-operator") issues.push("Operator profile ID must be darwinian-operator");
    if (profile.name !== "@darwinian/operator") issues.push("Operator Card name must be @darwinian/operator");
    if (profile.version !== "1.0.2") issues.push("Operator version must be 1.0.2");
    if (profile.source !== "git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2") {
      issues.push("Operator profile must use the exact Operator source");
    }
    if (profile.commit !== "6b2998c51b7c736c70c2e522cb8d7b3170e816d8") issues.push("Operator commit pin changed");
    if (profile.treeSha !== "2297dfc30783200a2b6a0da1189d7de20a01f23c") issues.push("Operator tree pin changed");
    if (profile.integrity !== "sha256-284cd3ba4880a60ba93b81c0be0dd15796b27a640ed697fdb1a18fe6b5ff30d9") {
      issues.push("Operator integrity pin changed");
    }
    if (!Array.isArray(profile.skills) || profile.skills.length !== 17) issues.push("Operator profile must expose exactly 17 approved skills");
    if (!Array.isArray(profile.mcpServers) || profile.mcpServers.length !== 0) issues.push("Operator profile must expose zero MCP servers");
  }

  const index = source("cli/index.ts");
  for (const command of ["SkillsCurateCommand", "SkillsUncurateCommand"]) {
    if (index.includes(command)) issues.push(`cli/index.ts registers retired curation command ${command}`);
  }
  for (const pathValue of ["cli/commands/skills/curate.ts", "cli/commands/skills/uncurate.ts"]) {
    if (existsSync(join(root, pathValue))) issues.push(`retired curation command file remains: ${pathValue}`);
  }

  const ownershipTests = source("test/scenarios-root-scope.test.ts");
  for (const [token, label] of [
    ['const foreignMcpTargets = ["claude", "codex", "cursor"] as const', "foreign ownership coverage is missing"],
    ["including dry-run and force", "dry-run/force ownership coverage is missing"],
    ["detects drift only for drwn-owned MCP server entries", "owned MCP drift coverage is missing"],
    ["preserves drifted prior-owned MCP entries for every target", "drifted removal coverage is missing"],
  ] as const) {
    if (!ownershipTests.includes(token)) issues.push(label);
  }
  const skillOwnershipTests = source("test/commands-write-drift.test.ts");
  if (!skillOwnershipTests.includes('for (const variant of ["different", "identical"] as const)')) {
    issues.push("foreign skill ownership coverage is missing");
  }

  const forwardDocPaths = [
    "README.md",
    "docs/cli-quickref.md",
    ".ai/knowledges/01_agents-cli-usage-guide.md",
    ".ai/knowledges/02_per-project-config-guide.md",
    ".ai/knowledges/03_npm-skill-bundles-guide.md",
  ];
  const forwardDocs = forwardDocPaths.map(source).join("\n");
  for (const token of [
    '"schema": "drwn.machine"',
    '"schemaVersion": 1',
    "Recommended Darwinian Operator",
    "@darwinian/operator@1.0.2",
    "drwn library defaults add skill",
    "drwn library defaults add mcp",
    "drwn write --scope machine",
    "MACHINE_PROJECTION_CONFLICT",
    "operator-owned runtime state",
  ]) {
    if (!forwardDocs.includes(token)) issues.push(`machine contract docs are missing ${token}`);
  }
  const staleMachineDocPatterns = [
    /drwn skills (?:curate|uncurate)/,
    /future Task 80/i,
    /"defaults"\s*:/,
    /defaults\.(?:skills|mcpServers)/,
    /curated publication layer/i,
    /machine-wide active MCP defaults live/i,
  ];
  for (const pathValue of forwardDocPaths) {
    const content = source(pathValue);
    if (staleMachineDocPatterns.some((pattern) => pattern.test(content))) {
      issues.push(`prototype machine documentation remains in ${pathValue}`);
    }
  }

  const storeExportSecurity = verifyStoreExportSecurity(root, overrides);
  if (!storeExportSecurity.ok) issues.push(storeExportSecurity.details ?? "whole-Store export security is not enforced");

  return {
    name: "machine capability contract",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  };
}

export function verifyWorkerContract(root = repoRoot, overrides: SourceOverrides = {}): CheckResult {
  const issues: string[] = [];
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    if (!existsSync(absolutePath)) {
      issues.push(`missing contract source ${pathValue}`);
      return "";
    }
    return readFileSync(absolutePath, "utf8");
  };
  const requireTokens = (pathValue: string, tokens: string[]) => {
    const content = source(pathValue);
    for (const token of tokens) {
      if (!content.includes(token)) issues.push(`${pathValue} is missing ${token}`);
    }
  };

  requireTokens("cli/core/project.ts", [
    'schema: "drwn.project-config"',
    "schemaVersion: 1",
    'input.schema !== "drwn.project-config"',
    "input.schemaVersion !== 1",
  ]);
  requireTokens("cli/core/card-lock.ts", [
    'schema: "drwn.project-lock"',
    "schemaVersion: 1",
    'input.schema !== "drwn.project-lock"',
    "input.schemaVersion !== 1",
    'PROJECT_WORKER_MIN_DRWN_VERSION = "0.8.0"',
  ]);
  requireTokens("cli/core/config-local.ts", ["PROJECT_WORKER_MIN_DRWN_VERSION"]);

  const projectReaders = [
    "cli/core/project.ts",
    "cli/core/card-lock.ts",
    "cli/core/worker-project.ts",
    "cli/core/effective-state.ts",
    "cli/core/project-writes.ts",
    "cli/core/config-local.ts",
    "cli/commands/install.ts",
  ];
  for (const pathValue of projectReaders) {
    const content = source(pathValue);
    for (const field of ["activeWorkers", "defaultActiveWorkers", "selectActiveCards", "lockfileVersion"]) {
      if (new RegExp(`\\b${field}\\b`).test(content)) {
        issues.push(`${pathValue} reads prototype project field ${field}`);
      }
    }
  }

  const index = source("cli/index.ts");
  for (const command of [
    "CardApplyCommand",
    "CardAddCommand",
    "CardPinCommand",
    "CardRemoveCommand",
    "CardDetachCommand",
    "CardUpdateCommand",
    "WorkerStackListCommand",
    "WorkerStackUseCommand",
    "WorkerStackClearCommand",
  ]) {
    if (index.includes(command)) issues.push(`cli/index.ts registers retired project command ${command}`);
  }
  for (const pathValue of [
    "cli/commands/card/add.ts",
    "cli/commands/card/apply.ts",
    "cli/commands/card/detach.ts",
    "cli/commands/card/pin.ts",
    "cli/commands/card/remove.ts",
    "cli/commands/card/update.ts",
    "cli/commands/worker/stack/list.ts",
    "cli/commands/worker/stack/use.ts",
    "cli/commands/worker/stack/clear.ts",
  ]) {
    if (existsSync(join(root, pathValue))) issues.push(`retired command file remains: ${pathValue}`);
  }
  for (const pathValue of ["cli/core/migrate-vendor.ts"]) {
    const exists = Object.hasOwn(overrides, pathValue) || existsSync(join(root, pathValue));
    if (exists) issues.push(`prototype migration adapter remains: ${pathValue}`);
  }
  if (/--no-apply|\bnoApply\b/.test(source("cli/commands/install.ts"))) {
    issues.push("install still accepts retired --no-apply");
  }

  const generator = source("cli/core/worker-generator/sync-worker.ts");
  if (!generator.includes("for (const root of selection.installedRoots)")) {
    issues.push("generated Worker sync does not iterate installed roots");
  }
  if (/for\s*\(const card of state\.lockedCards\)/.test(generator)) {
    issues.push("generated Worker sync treats locked member Cards as roots");
  }

  const syncSource = source("cli/core/sync.ts");
  const machineProjection = sourceSlice(
    syncSource,
    "export function planMachineManagedPaths",
    "export interface MachineProjectionConflict",
  );
  const projectEvaluation = source("cli/core/effective-state.ts") + syncSource.replace(machineProjection, "");
  for (const machinePath of ["listCuratedSkills", "resolveCuratedSkillsDir", "claude-only", "codex-only"]) {
    if (projectEvaluation.includes(machinePath)) {
      issues.push(`project evaluation scans machine compatibility source ${machinePath}`);
    }
  }
  requireTokens("cli/core/effective-state.ts", [
    "projectBaseConfig(repoConfig)",
    "projectBaseRegistry(builtInRegistry, projectConfig)",
  ]);

  for (const pathValue of [
    "cli/commands/status.ts",
    "cli/commands/mcp/list.ts",
    "cli/commands/add/mcp.ts",
    "cli/commands/write.ts",
  ]) {
    if (!source(pathValue).includes("buildEffectiveState")) {
      issues.push(`${pathValue} does not consume buildEffectiveState`);
    }
  }
  if (!source("cli/core/diagnostics.ts").includes("buildEffectiveState")) {
    issues.push("doctor/status diagnostics do not consume buildEffectiveState");
  }
  const commandConsumers = [
    "cli/commands/status.ts",
    "cli/commands/doctor.ts",
    "cli/commands/mcp/list.ts",
    "cli/commands/add/mcp.ts",
    "cli/commands/add/skill.ts",
  ].map(source).join("\n");
  for (const alternate of ["loadEffectiveConfig", "mergeProjectConfig", "buildActiveServers"]) {
    if (commandConsumers.includes(alternate)) issues.push(`command consumer rebuilds state with ${alternate}`);
  }
  requireTokens("cli/commands/add/mcp.ts", [
    "inactiveCardServerDefinitions",
    "MCP_DEFINITION_NOT_EFFECTIVE",
  ]);

  const forwardDocPaths = [
    "README.md",
    "INSTALL.md",
    "docs/cli-quickref.md",
    "docs/contracts/project-worker-v1.md",
    "docs/prelaunch-project-reset.md",
    ".ai/knowledges/01_agents-cli-usage-guide.md",
    ".ai/knowledges/02_per-project-config-guide.md",
    ".ai/knowledges/09_cards-manual-test-guide.md",
    ".ai/knowledges/10_drwn-cli-architecture.md",
    ".ai/knowledges/11_card-usage-guide.html",
    ...Array.from(new Bun.Glob("**/*.{md,mdx,html}").scanSync({ cwd: join(root, "docs-docusaurus", "docs") }))
      .map((pathValue) => `docs-docusaurus/docs/${pathValue}`),
  ];
  const staleDocPatterns = [
    /activeWorkers/,
    /drwn worker stack/,
    /active worker stack/i,
    /all installed workers are active/i,
    /drwn card (?:add|apply|remove|pin|update|detach)/,
    /--no-apply/,
    /COMMAND_MOVED/,
    /config\.json\.cards/,
    /"lockfileVersion"/,
    /activeMinds/,
    /active mind stack/i,
    /drwn mind (?:list|use|clear)/,
  ];
  for (const pathValue of forwardDocPaths) {
    const content = source(pathValue);
    if (staleDocPatterns.some((pattern) => pattern.test(content))) {
      issues.push(`prototype documentation remains in ${pathValue}`);
    }
  }

  const pkg = JSON.parse(source("package.json")) as { version?: string };
  if (pkg.version !== "0.8.0") issues.push("package version must be 0.8.0");
  if (!source("cli/core/version.ts").includes('DRWN_VERSION = "0.8.0"')) {
    issues.push("runtime version must be 0.8.0");
  }

  return {
    name: "project Worker contract",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  };
}

export function verifyAmbientMcpPolicy(root = repoRoot, overrides: SourceOverrides = {}): CheckResult {
  const issues: string[] = [];
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    if (!existsSync(absolutePath)) {
      issues.push(`missing ambient policy source ${pathValue}`);
      return "";
    }
    return readFileSync(absolutePath, "utf8");
  };
  const requireTokens = (pathValue: string, tokens: string[]) => {
    const content = source(pathValue);
    for (const token of tokens) {
      if (!content.includes(token)) issues.push(`${pathValue} is missing ${token}`);
    }
  };

  requireTokens("cli/core/ambient-policy.ts", [
    "AMBIENT_IDENTICAL",
    "CLAUDE_SCOPE_SHADOW",
    "CODEX_PROJECT_AUGMENTS_USER",
    "CODEX_INCOMPATIBLE_TRANSPORTS",
    "CURSOR_PROJECT_MERGES_USER",
    "CURSOR_PROJECT_TRANSPORT_OVERRIDE",
    "classifyAmbientMcpCollisions",
  ]);
  requireTokens("cli/core/effective-state.ts", [
    "inspectAmbientMcpDefinitions",
    "classifyAmbientMcpCollisions",
    "renderMcpServerForTarget",
    "selectedAmbientCollisions",
  ]);
  requireTokens("cli/core/sync.ts", ["assertAmbientMcpPreflight", "ambientCollisions"]);
  requireTokens("cli/commands/write.ts", ["assertAmbientMcpPreflight"]);
  requireTokens("cli/core/diagnostics.ts", [
    'enforcement: "target-native"',
    "state.ambientCollisions",
    "selectedAmbientCollisions(state)",
  ]);
  requireTokens("cli/commands/mcp/list.ts", ["state.ambientCollisions"]);

  const classifierTests = source("test/core-ambient-policy.test.ts");
  if (!classifierTests.includes("user-secret-sentinel") || !classifierTests.includes("project-secret-sentinel")) {
    issues.push("ambient classifier secret redaction coverage is missing");
  }
  const writeTests = source("test/commands-write.test.ts");
  if (!writeTests.includes("fatal selected-target MCP preflight aborts every projection mutation")) {
    issues.push("ambient policy full-command atomicity coverage is missing");
  }
  requireTokens("test/commands-write-codex-conflict.test.ts", [
    "a fatal Codex collision does not block a Claude-only write",
    "Codex fatal transport collisions cannot be bypassed with force",
    "user HTTP plus project stdio",
    "user stdio plus project HTTP",
  ]);
  requireTokens("test/commands-use-worker.test.ts", [
    "fatal ambient collision preserves selected Worker intent without projection mutation",
  ]);
  requireTokens("test/commands-doctor.test.ts", [
    "does not enforce a fatal-shaped collision on a disabled target",
  ]);

  const sync = source("cli/core/sync.ts");
  if (
    sync.includes("detectCodexLayerConflicts") ||
    sync.includes("codexConflicts") ||
    sync.includes("skipped the project-scope entry") ||
    sync.includes("rerun with --force")
  ) {
    issues.push("retired Codex collision path or force bypass remains in cli/core/sync.ts");
  }

  requireTokens("docs/cli-quickref.md", [
    "Target-native ambient MCP collisions",
    "CODEX_INCOMPATIBLE_TRANSPORTS",
  ]);
  requireTokens(".ai/knowledges/02_per-project-config-guide.md", [
    "target-native",
    "CODEX_INCOMPATIBLE_TRANSPORTS",
  ]);

  return {
    name: "ambient MCP policy",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  };
}

async function verifySchemaPackageReachable() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const dep = pkg.dependencies?.["drwn-catalog-schema"];

  if (!dep) {
    return {
      name: "schema package coupling",
      ok: false,
      details: "Missing dependency: drwn-catalog-schema",
    } satisfies CheckResult;
  }

  if (dep.startsWith("file:") || dep.startsWith("link:") || dep.startsWith("workspace:")) {
    return {
      name: "schema package coupling",
      ok: true,
      details: `drwn-catalog-schema resolves locally (${dep}); skipping registry check`,
    } satisfies CheckResult;
  }

  const proc = Bun.spawn(["npm", "view", `drwn-catalog-schema@${dep}`, "version"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    name: "schema package coupling",
    ok: exitCode === 0,
    details:
      exitCode === 0
        ? `drwn-catalog-schema@${dep} resolves to ${stdout.trim()}`
        : `drwn-catalog-schema@${dep} not resolvable on npm: ${stderr.trim()}`,
  } satisfies CheckResult;
}

async function main() {
  const checks: CheckResult[] = [];
  const warnings: string[] = [];

  if (testMode) {
    checks.push({ name: "quality gate test mode", ok: true });
  } else {
    checks.push(await runCommand("bun test", ["bun", "run", "test"]));
    checks.push(await runCommand("typecheck", ["bun", "run", "typecheck"]));
  }

  const hardcodedPaths = findHardcodedUserPaths();
  checks.push({
    name: "hardcoded path scan",
    ok: hardcodedPaths.length === 0,
    details: hardcodedPaths.length > 0 ? hardcodedPaths.join(", ") : undefined,
  });

  const packageResult = verifyPackageMetadata();
  checks.push(packageResult.check);
  warnings.push(...packageResult.warnings);

  checks.push(verifyDocsPresence());
  checks.push(verifyWorkerContract());
  checks.push(verifyMachineContract());
  checks.push(verifyAmbientMcpPolicy());
  checks.push(verifyStoreExportSecurity());
  checks.push(await verifySchemaPackageReachable());
  checks.push(await verifyPackageContents());

  const report: GateReport = {
    ok: checks.every((check) => check.ok),
    checks,
    warnings,
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const check of checks) {
      console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}${check.details ? ` - ${check.details}` : ""}`);
    }
    for (const warning of warnings) {
      console.log(`WARN ${warning}`);
    }
  }

  process.exitCode = report.ok ? 0 : 1;
}

if (import.meta.main) await main();
