// ABOUTME: Resolves approved machine capability profiles once and verifies pinned extracted bytes offline.
// ABOUTME: Filters profile Cards to explicit machine-safe skill and MCP allowlists.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assertValidCardManifest, type CardManifest } from "./card-manifest";
import { resolveCard, writeMachineConfig } from "./card-store";
import { computeIntegrityFromDir } from "./content-manifest";
import { DrwnError } from "./errors";
import { DARWINIAN_OPERATOR_SKILL_IDS, createEmptyMachineConfig, parseMachineConfig, readMachineConfigFile } from "./machine-config";
import { resolveMachineProfilesRegistryPath } from "./paths";
import { resolveExtractedPath, resolveMachineConfigPath } from "./store-paths";
import type { MachineProfilePin } from "./types";

const approvedSkills = new Set<string>(DARWINIAN_OPERATOR_SKILL_IDS);
const uniqueIds = z.array(z.string().min(1)).superRefine((ids, context) => {
  const seen = new Set<string>();
  for (const [index, id] of ids.entries()) {
    if (seen.has(id)) {
      context.addIssue({ code: "custom", path: [index], message: `duplicate capability ID: ${id}` });
    }
    seen.add(id);
  }
});

const descriptorSchema = z.object({
  id: z.literal("darwinian-operator"),
  displayName: z.literal("Recommended Darwinian Operator"),
  source: z.literal("git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2"),
  name: z.literal("@darwinian/operator"),
  version: z.literal("1.0.2"),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  treeSha: z.string().regex(/^[a-f0-9]{40}$/),
  integrity: z.string().regex(/^sha256-[a-f0-9]{64}$/),
  skills: uniqueIds.superRefine((skills, context) => {
    for (const [index, skill] of skills.entries()) {
      if (!approvedSkills.has(skill)) {
        context.addIssue({ code: "custom", path: [index], message: `unapproved Operator skill: ${skill}` });
      }
    }
  }),
  mcpServers: uniqueIds.refine((ids) => ids.length === 0, "the approved Operator profile provides no MCP servers"),
}).strict();

const registrySchema = z.object({
  schema: z.literal("drwn.machine-profiles"),
  schemaVersion: z.literal(1),
  profiles: z.array(descriptorSchema).length(1),
}).strict();

export interface MachineProfileDescriptor extends MachineProfilePin {
  displayName: "Recommended Darwinian Operator";
}

export interface MachineProfileRegistry {
  schema: "drwn.machine-profiles";
  schemaVersion: 1;
  profiles: MachineProfileDescriptor[];
}

function profileInvalid(message: string, cause?: unknown) {
  return new DrwnError("MACHINE_PROFILE_INVALID", message, undefined, cause);
}

function parseDescriptor(value: unknown): MachineProfileDescriptor {
  const parsed = descriptorSchema.safeParse(value);
  if (!parsed.success) {
    throw profileInvalid(`Invalid machine profile descriptor: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`, parsed.error);
  }
  return parsed.data as MachineProfileDescriptor;
}

export async function loadMachineProfileRegistry(repoRoot: string): Promise<MachineProfileRegistry> {
  const path = resolveMachineProfilesRegistryPath(repoRoot);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw profileInvalid(`Cannot read machine profile registry at ${path}`, error);
  }
  const parsed = registrySchema.safeParse(value);
  if (!parsed.success) {
    throw profileInvalid(`Invalid machine profile registry at ${path}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`, parsed.error);
  }
  return parsed.data as MachineProfileRegistry;
}

function validateProfileContents(manifest: CardManifest, descriptor: MachineProfileDescriptor) {
  const cardSkills = new Set(manifest.skills?.include ?? []);
  const cardServers = new Set(Object.keys(manifest.servers ?? {}));
  for (const skill of descriptor.skills) {
    if (!cardSkills.has(skill)) {
      throw profileInvalid(`Profile skill ${skill} is not declared by ${manifest.name}@${manifest.version}`);
    }
  }
  for (const server of descriptor.mcpServers) {
    if (!cardServers.has(server)) {
      throw profileInvalid(`Profile MCP server ${server} is not declared by ${manifest.name}@${manifest.version}`);
    }
  }
}

async function resolveMachineProfilePin(options: {
  agentsDir: string;
  repoRoot: string;
  descriptor: MachineProfileDescriptor;
  resolutionRef?: string;
}): Promise<MachineProfilePin> {
  const descriptor = parseDescriptor(options.descriptor);
  let resolved;
  try {
    resolved = await resolveCard(options.agentsDir, options.resolutionRef ?? descriptor.source, {
      allowUntrustedSource: true,
      repoRoot: options.repoRoot,
    });
  } catch (error) {
    throw new DrwnError("MACHINE_PROFILE_NOT_AVAILABLE", `Cannot resolve ${descriptor.displayName}`, undefined, error);
  }

  const mismatches = [
    resolved.name === descriptor.name ? null : `name ${resolved.name}`,
    resolved.version === descriptor.version ? null : `version ${resolved.version}`,
    resolved.git?.commit === descriptor.commit ? null : `commit ${resolved.git?.commit ?? "missing"}`,
    resolved.treeSha === descriptor.treeSha ? null : `tree ${resolved.treeSha ?? "missing"}`,
    resolved.integrity === descriptor.integrity ? null : `integrity ${resolved.integrity}`,
  ].filter((value): value is string => value !== null);
  if (mismatches.length > 0) {
    throw profileInvalid(`Resolved profile does not match its immutable descriptor: ${mismatches.join(", ")}`);
  }
  validateProfileContents(resolved.manifest, descriptor);

  const pin = {
    id: descriptor.id,
    source: descriptor.source,
    name: descriptor.name,
    version: descriptor.version,
    commit: descriptor.commit,
    treeSha: descriptor.treeSha,
    integrity: descriptor.integrity,
    skills: [...descriptor.skills],
    mcpServers: [...descriptor.mcpServers],
  } satisfies MachineProfilePin;
  try {
    parseMachineConfig({
      ...createEmptyMachineConfig(),
      capabilities: { profile: pin, skills: [], mcpServers: [] },
    });
  } catch (error) {
    throw profileInvalid("Resolved profile pin violates the approved machine contract", error);
  }
  return pin;
}

export async function verifyMachineProfilePin(agentsDir: string, pin: MachineProfilePin): Promise<{ dir: string; manifest: CardManifest }> {
  const dir = resolveExtractedPath(agentsDir, pin.treeSha);
  if (!existsSync(dir)) {
    throw new DrwnError("MACHINE_PROFILE_NOT_AVAILABLE", `Pinned profile bytes are missing: ${dir}`);
  }
  let manifest: CardManifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, "card.json"), "utf8")) as CardManifest;
    assertValidCardManifest(manifest);
  } catch (error) {
    throw profileInvalid(`Pinned profile manifest is invalid at ${dir}`, error);
  }
  if (manifest.name !== pin.name || manifest.version !== pin.version) {
    throw profileInvalid(`Pinned profile identity changed at ${dir}`);
  }
  validateProfileContents(manifest, { ...pin, displayName: "Recommended Darwinian Operator" });
  if (await computeIntegrityFromDir(dir) !== pin.integrity) {
    throw profileInvalid(`Pinned profile integrity changed at ${dir}`);
  }
  return { dir, manifest };
}

export async function initializeMachineCapabilities(options: {
  agentsDir: string;
  repoRoot: string;
  guided: boolean;
  promptRecommended?: () => Promise<boolean>;
  descriptor?: MachineProfileDescriptor;
  resolutionRef?: string;
}): Promise<{ created: boolean; selectedProfile: string | null }> {
  const path = resolveMachineConfigPath(options.agentsDir);
  const existing = await readMachineConfigFile(path);
  if (existing) {
    return { created: false, selectedProfile: existing.capabilities.profile?.id ?? null };
  }

  const config = createEmptyMachineConfig();
  if (options.guided) {
    const accepted = await (options.promptRecommended?.() ?? Promise.resolve(true));
    if (accepted) {
      const descriptor = options.descriptor ?? (await loadMachineProfileRegistry(options.repoRoot)).profiles[0]!;
      config.capabilities.profile = await resolveMachineProfilePin({
        agentsDir: options.agentsDir,
        repoRoot: options.repoRoot,
        descriptor,
        resolutionRef: options.resolutionRef,
      });
    }
  }
  await writeMachineConfig(options.agentsDir, config);
  return { created: true, selectedProfile: config.capabilities.profile?.id ?? null };
}
