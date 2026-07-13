// ABOUTME: Defines and persists the first supported namespaced machine capability contract.
// ABOUTME: Strictly rejects prototype, unknown, mutable, and unapproved machine state.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { DrwnError } from "./errors";
import { writeAtomically } from "./fs";
import { withInventoryLock, withMachineLock } from "./inventory-lock";
import { resolveMachineConfigPath } from "./store-paths";
import type { MachineConfig } from "./types";

export const DARWINIAN_OPERATOR_SKILL_IDS = [
  "bootstrap-project",
  "apply-mind-card",
  "author-mind-card",
  "install-project",
  "inspect-minds",
  "materialize-minds",
  "manage-library",
  "repair-minds",
  "manage-defaults",
  "recommend-minds",
  "share-mind-card",
  "support-minds",
  "sync-card-skills",
  "import-mcp-from-claude",
  "manage-active-mind-stack",
  "author-mind-content",
  "audit-mind-visibility",
] as const;

const approvedOperatorSkills = new Set<string>(DARWINIAN_OPERATOR_SKILL_IDS);
const capabilityId = z.string().min(1).refine((value) => value.trim() === value, "must not have surrounding whitespace");
const uniqueIds = z.array(capabilityId).superRefine((values, context) => {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      context.addIssue({ code: "custom", path: [index], message: `duplicate capability ID: ${value}` });
    }
    seen.add(value);
  }
});

const targetOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  configPath: z.string().min(1).optional(),
  userMcpPath: z.string().min(1).optional(),
  format: z.enum(["json-merge", "toml-merge", "json-standalone"]).optional(),
  mcpKey: z.string().min(1).optional(),
}).strict();

const targetsSchema = z.object({
  claude: targetOverrideSchema.optional(),
  codex: targetOverrideSchema.optional(),
  cursor: targetOverrideSchema.optional(),
}).strict();

const catalogsSchema = z.object({
  npmSkills: z.object({
    enabled: z.boolean(),
    searchLimit: z.number().int().positive().optional(),
  }).strict().optional(),
  mcp: z.object({
    enabled: z.boolean(),
    sources: z.array(z.union([
      z.object({ type: z.literal("file"), path: z.string().min(1) }).strict(),
      z.object({ type: z.literal("url"), url: z.string().min(1) }).strict(),
    ])).optional(),
  }).strict().optional(),
}).strict();

const analyzerSchema = z.object({
  apiUrl: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  webBaseUrl: z.string().min(1).optional(),
  maxArchiveBytes: z.number().int().positive().optional(),
}).strict();

const trustedSourcesSchema = z.object({
  strict: z.boolean().optional(),
  gitHosts: z.array(z.string().min(1)).optional(),
  gitOwners: z.array(z.string().min(1)).optional(),
  catalogScopes: z.array(z.string().min(1)).optional(),
  refs: z.array(z.string().min(1)).optional(),
}).strict();

const profileSchema = z.object({
  id: z.literal("darwinian-operator"),
  source: z.literal("git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2"),
  name: z.literal("@darwinian/operator"),
  version: z.literal("1.0.2"),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  treeSha: z.string().regex(/^[a-f0-9]{40}$/),
  integrity: z.string().regex(/^sha256-[a-f0-9]{64}$/),
  skills: uniqueIds.superRefine((skills, context) => {
    for (const [index, skill] of skills.entries()) {
      if (!approvedOperatorSkills.has(skill)) {
        context.addIssue({ code: "custom", path: [index], message: `unapproved Operator skill: ${skill}` });
      }
    }
  }),
  mcpServers: uniqueIds.refine((ids) => ids.length === 0, "the approved Operator profile provides no MCP servers"),
}).strict();

const machineConfigSchema = z.object({
  schema: z.literal("drwn.machine"),
  schemaVersion: z.literal(1),
  policy: z.object({
    authoring: z.object({ scope: z.string().min(1).optional() }).strict().optional(),
    targets: targetsSchema.optional(),
    catalogs: catalogsSchema.optional(),
    analyzer: analyzerSchema.optional(),
    trustedSources: trustedSourcesSchema.optional(),
  }).strict(),
  capabilities: z.object({
    profile: profileSchema.nullable(),
    skills: uniqueIds,
    mcpServers: uniqueIds,
  }).strict(),
}).strict();

function invalidMachineConfig(message: string, cause?: unknown): DrwnError {
  return new DrwnError(
    "MACHINE_CONFIG_INVALID",
    message,
    ["Reset ~/.agents/drwn/machine.json and rerun drwn setup; prototype machine formats are not supported."],
    cause,
  );
}

export function createEmptyMachineConfig(): MachineConfig {
  return {
    schema: "drwn.machine",
    schemaVersion: 1,
    policy: {},
    capabilities: { profile: null, skills: [], mcpServers: [] },
  };
}

export function parseMachineConfig(value: unknown, path = "machine.json"): MachineConfig {
  const parsed = machineConfigSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "root"}: ${issue.message}`)
      .join("; ");
    throw invalidMachineConfig(`Invalid machine config at ${path}: ${details}`, parsed.error);
  }
  return parsed.data as MachineConfig;
}

export async function readMachineConfigFile(path: string): Promise<MachineConfig | null> {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return parseMachineConfig(JSON.parse(await readFile(path, "utf8")), path);
  } catch (error) {
    if (error instanceof DrwnError) {
      throw error;
    }
    throw invalidMachineConfig(`Invalid JSON in machine config at ${path}`, error);
  }
}

export async function writeMachineConfigFile(path: string, config: MachineConfig): Promise<void> {
  const validated = parseMachineConfig(config, path);
  await writeAtomically(path, `${JSON.stringify(validated, null, 2)}\n`);
}

export async function initializeMachineConfig(path: string): Promise<{ config: MachineConfig; created: boolean }> {
  const existing = await readMachineConfigFile(path);
  if (existing) {
    return { config: existing, created: false };
  }
  const config = createEmptyMachineConfig();
  await writeMachineConfigFile(path, config);
  return { config, created: true };
}

export async function mutateMachineConfig<T>(
  agentsDir: string,
  prepare: (config: MachineConfig) => { config: MachineConfig; value: T } | Promise<{ config: MachineConfig; value: T }>,
  options: { dryRun?: boolean } = {},
): Promise<T> {
  const path = resolveMachineConfigPath(agentsDir);
  const run = async () => {
    const current = await readMachineConfigFile(path) ?? createEmptyMachineConfig();
    const prepared = await prepare(structuredClone(current));
    const validated = parseMachineConfig(prepared.config, path);
    if (!options.dryRun) await writeMachineConfigFile(path, validated);
    return prepared.value;
  };
  if (options.dryRun) return run();
  return withInventoryLock(agentsDir, () => withMachineLock(agentsDir, run));
}
