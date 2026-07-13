// ABOUTME: Defines the strict deterministic V1 format for portable standalone machine inventory.
// ABOUTME: Canonicalizes manifest and MCP bytes without reading or mutating machine state.

import { createHash } from "node:crypto";
import { z } from "zod";
import { DrwnError } from "./errors";
import { sanitizeMcpServerSecrets } from "./mcp-secret-policy";
import { isStrictSemver } from "./semver-utils";
import type { RegistryServer } from "./types";

export const PORTABLE_INVENTORY_SCHEMA = "drwn.portable-inventory" as const;
export const PORTABLE_INVENTORY_SCHEMA_VERSION = 1 as const;

export const INVENTORY_TRANSFER_LIMITS = Object.freeze({
  maxCompressedBundleBytes: 512 * 1024 * 1024,
  maxPayloadBytes: 2 * 1024 * 1024 * 1024,
  maxRegularFileBytes: 256 * 1024 * 1024,
  maxManifestBytes: 4 * 1024 * 1024,
  maxArchiveMembers: 100_000,
  maxPathDepth: 64,
  maxDecompressionRatio: 200,
});

export type InventoryTransferErrorCode =
  | "INVENTORY_TRANSFER_SCHEMA_INVALID"
  | "INVENTORY_TRANSFER_SCHEMA_UNSUPPORTED"
  | "INVENTORY_TRANSFER_ARTIFACT_INVALID"
  | "INVENTORY_TRANSFER_ARTIFACT_TOO_LARGE"
  | "INVENTORY_TRANSFER_UNSAFE_ENTRY"
  | "INVENTORY_TRANSFER_INTEGRITY_MISMATCH"
  | "INVENTORY_TRANSFER_SECRET_DETECTED"
  | "INVENTORY_TRANSFER_CONFLICT"
  | "INVENTORY_TRANSFER_OUTPUT_EXISTS"
  | "INVENTORY_TRANSFER_BUNDLE_REQUIRED"
  | "INVENTORY_TRANSFER_SOURCE_CHANGED";

export type InventoryDisposition = "missing" | "identical" | "conflicting" | "extra";

export type InventoryTransferReasonCode =
  | "MISSING"
  | "IDENTICAL"
  | "PACKAGE_METADATA_CONFLICT"
  | "MCP_DEFINITION_CONFLICT"
  | "SKILL_ID_OWNERSHIP_CONFLICT"
  | "REPOSITORY_SKILL_CONFLICT"
  | "BUNDLED_MCP_CONFLICT"
  | "EXTRA";

export interface PortableSkillPackageEntry {
  kind: "skill-package";
  packageName: string;
  activeVersion: string;
  exportedSkillIds: string[];
  payloadPath: `payload/${string}`;
  fileCount: number;
  directoryCount: number;
  sizeBytes: number;
  integrity: `sha256-${string}`;
}

export interface PortableMcpEntry {
  kind: "mcp";
  id: string;
  definition: RegistryServer;
  payloadPath: `payload/${string}/record.json`;
  sizeBytes: number;
  integrity: `sha256-${string}`;
}

export type PortableInventoryEntry = PortableSkillPackageEntry | PortableMcpEntry;

export type PortableInventoryEntryInput =
  | Omit<PortableSkillPackageEntry, "payloadPath">
  | Omit<PortableMcpEntry, "payloadPath" | "sizeBytes" | "integrity">;

export interface PortableInventoryManifestV1 {
  schema: typeof PORTABLE_INVENTORY_SCHEMA;
  schemaVersion: typeof PORTABLE_INVENTORY_SCHEMA_VERSION;
  entries: PortableInventoryEntry[];
}

const integritySchema = z.string().regex(/^sha256-[a-f0-9]{64}$/);
const safeIdSchema = z.string().min(1).max(255).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const packageNameSchema = z.string().min(1).max(255).refine(
  (value) => /^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value),
  "invalid package name",
);
const semverSchema = z.string().refine(isStrictSemver, "invalid strict semantic version");
const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const stringMapSchema = z.record(z.string(), z.string());

const registryServerSchema = z.object({
  description: z.string().min(1),
  transport: z.enum(["stdio", "http", "sse", "platform-provided"]),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: stringMapSchema.optional(),
  url: z.string().min(1).optional(),
  headers: stringMapSchema.optional(),
  provider: z.string().min(1).optional(),
  capabilities: z.array(z.string()).optional(),
  notes: z.string().optional(),
  optional: z.boolean(),
  startupTimeoutSec: z.number().positive().finite().optional(),
}).strict().superRefine((value, context) => {
  if (value.transport === "stdio" && !value.command) {
    context.addIssue({ code: "custom", path: ["command"], message: "stdio transport requires command" });
  }
  if ((value.transport === "http" || value.transport === "sse") && !value.url) {
    context.addIssue({ code: "custom", path: ["url"], message: `${value.transport} transport requires url` });
  }
});

const skillEntrySchema = z.object({
  kind: z.literal("skill-package"),
  packageName: packageNameSchema,
  activeVersion: semverSchema,
  exportedSkillIds: z.array(safeIdSchema),
  payloadPath: z.string().regex(/^payload\/[0-9]{6}$/),
  fileCount: countSchema,
  directoryCount: countSchema,
  sizeBytes: countSchema,
  integrity: integritySchema,
}).strict();

const mcpEntrySchema = z.object({
  kind: z.literal("mcp"),
  id: safeIdSchema,
  definition: registryServerSchema,
  payloadPath: z.string().regex(/^payload\/[0-9]{6}\/record\.json$/),
  sizeBytes: countSchema,
  integrity: integritySchema,
}).strict();

const manifestSchema = z.object({
  schema: z.literal(PORTABLE_INVENTORY_SCHEMA),
  schemaVersion: z.literal(PORTABLE_INVENTORY_SCHEMA_VERSION),
  entries: z.array(z.discriminatedUnion("kind", [skillEntrySchema, mcpEntrySchema]))
    .max(INVENTORY_TRANSFER_LIMITS.maxArchiveMembers),
}).strict();

function transferError(code: InventoryTransferErrorCode, message: string, cause?: unknown): DrwnError {
  return new DrwnError(code, message, undefined, cause);
}

function schemaInvalid(message: string, cause?: unknown): DrwnError {
  return transferError("INVENTORY_TRANSFER_SCHEMA_INVALID", message, cause);
}

export function comparePortableStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: string[]): boolean {
  return values.every((value, index) => index === 0 || comparePortableStrings(values[index - 1]!, value) < 0);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => comparePortableStrings(left, right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(canonicalValue(value), null, 2)}\n`);
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Integrity(bytes: Uint8Array | string): `sha256-${string}` {
  return `sha256-${sha256Hex(bytes)}`;
}

function parseMcpDefinition(value: unknown, id = "portable MCP"): RegistryServer {
  const parsed = registryServerSchema.safeParse(value);
  if (!parsed.success) {
    throw schemaInvalid(`Invalid ${id} definition: ${z.prettifyError(parsed.error)}`, parsed.error);
  }
  try {
    const sanitized = sanitizeMcpServerSecrets(id, parsed.data as RegistryServer);
    if (new TextDecoder().decode(canonicalJsonBytes(sanitized)) !== new TextDecoder().decode(canonicalJsonBytes(parsed.data))) {
      throw new Error("definition contains a resolved secret value instead of a secret reference");
    }
  } catch (error) {
    throw schemaInvalid(`Invalid ${id} secret reference policy`, error);
  }
  return parsed.data as RegistryServer;
}

export function canonicalMcpDefinitionBytes(value: unknown): Uint8Array {
  return canonicalJsonBytes(parseMcpDefinition(value));
}

export function portablePayloadPath(index: number, kind: PortableInventoryEntry["kind"]): string {
  if (!Number.isSafeInteger(index) || index < 0 || index >= INVENTORY_TRANSFER_LIMITS.maxArchiveMembers) {
    throw schemaInvalid(`Invalid portable payload position: ${String(index)}`);
  }
  const root = `payload/${index.toString().padStart(6, "0")}`;
  return kind === "mcp" ? `${root}/record.json` : root;
}

function validateManifestInvariants(manifest: PortableInventoryManifestV1): PortableInventoryManifestV1 {
  const packageNames = new Set<string>();
  const mcpIds = new Set<string>();
  const skillOwners = new Map<string, string>();
  let seenMcp = false;
  let previousPackage = "";
  let previousMcp = "";
  let totalSize = 0;

  for (const [index, entry] of manifest.entries.entries()) {
    const expectedPath = portablePayloadPath(index, entry.kind);
    if (entry.payloadPath !== expectedPath) {
      throw schemaInvalid(`Entry ${index} payloadPath must be ${expectedPath}`);
    }
    totalSize += entry.sizeBytes;
    if (!Number.isSafeInteger(totalSize) || totalSize > INVENTORY_TRANSFER_LIMITS.maxPayloadBytes) {
      throw schemaInvalid("Portable inventory exceeds the V1 total payload limit");
    }

    if (entry.kind === "skill-package") {
      if (seenMcp) throw schemaInvalid("Skill package entries must precede MCP entries");
      if (previousPackage && comparePortableStrings(previousPackage, entry.packageName) >= 0) {
        throw schemaInvalid(`Skill package entries are not uniquely sorted: ${entry.packageName}`);
      }
      previousPackage = entry.packageName;
      if (packageNames.has(entry.packageName)) throw schemaInvalid(`Duplicate skill package: ${entry.packageName}`);
      packageNames.add(entry.packageName);
      if (!sortedUnique(entry.exportedSkillIds)) {
        throw schemaInvalid(`Exported skill IDs must be sorted and unique: ${entry.packageName}`);
      }
      for (const skillId of entry.exportedSkillIds) {
        const owner = skillOwners.get(skillId);
        if (owner) throw schemaInvalid(`Exported skill ID ${skillId} is owned by both ${owner} and ${entry.packageName}`);
        skillOwners.set(skillId, entry.packageName);
      }
      continue;
    }

    seenMcp = true;
    if (previousMcp && comparePortableStrings(previousMcp, entry.id) >= 0) {
      throw schemaInvalid(`MCP entries are not uniquely sorted: ${entry.id}`);
    }
    previousMcp = entry.id;
    if (mcpIds.has(entry.id)) throw schemaInvalid(`Duplicate MCP record: ${entry.id}`);
    mcpIds.add(entry.id);
    const definition = parseMcpDefinition(entry.definition, `MCP ${entry.id}`);
    const bytes = canonicalJsonBytes(definition);
    if (entry.sizeBytes !== bytes.byteLength || entry.integrity !== sha256Integrity(bytes)) {
      throw schemaInvalid(`MCP ${entry.id} metadata does not match its canonical definition bytes`);
    }
  }
  return manifest;
}

export function parsePortableInventoryManifest(value: unknown): PortableInventoryManifestV1 {
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (("schema" in candidate && candidate.schema !== PORTABLE_INVENTORY_SCHEMA)
      || ("schemaVersion" in candidate && candidate.schemaVersion !== PORTABLE_INVENTORY_SCHEMA_VERSION)) {
      throw transferError(
        "INVENTORY_TRANSFER_SCHEMA_UNSUPPORTED",
        `Unsupported portable inventory schema: ${String(candidate.schema)} V${String(candidate.schemaVersion)}`,
      );
    }
  }
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) {
    throw schemaInvalid(`Invalid portable inventory manifest: ${z.prettifyError(parsed.error)}`, parsed.error);
  }
  return validateManifestInvariants(parsed.data as PortableInventoryManifestV1);
}

export function serializePortableInventoryManifest(value: unknown): Uint8Array {
  return canonicalJsonBytes(parsePortableInventoryManifest(value));
}

export function parsePortableInventoryManifestBytes(bytes: Uint8Array): PortableInventoryManifestV1 {
  if (bytes.byteLength > INVENTORY_TRANSFER_LIMITS.maxManifestBytes) {
    throw transferError("INVENTORY_TRANSFER_ARTIFACT_TOO_LARGE", "Portable inventory manifest exceeds 4 MiB");
  }
  let text: string;
  let value: unknown;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch (error) {
    throw schemaInvalid("Portable inventory manifest is not valid UTF-8 JSON", error);
  }
  const manifest = parsePortableInventoryManifest(value);
  const canonical = serializePortableInventoryManifest(manifest);
  if (!Buffer.from(bytes).equals(Buffer.from(canonical))) {
    throw transferError("INVENTORY_TRANSFER_ARTIFACT_INVALID", "Portable inventory manifest bytes are not canonical");
  }
  return manifest;
}

export function buildPortableInventoryManifest(entries: PortableInventoryEntryInput[]): PortableInventoryManifestV1 {
  const sorted = [...entries].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "skill-package" ? -1 : 1;
    const leftId = left.kind === "skill-package" ? left.packageName : left.id;
    const rightId = right.kind === "skill-package" ? right.packageName : right.id;
    return comparePortableStrings(leftId, rightId);
  });
  const portableEntries: PortableInventoryEntry[] = sorted.map((entry, index) => {
    if (entry.kind === "skill-package") {
      return {
        ...structuredClone(entry),
        exportedSkillIds: [...entry.exportedSkillIds].sort(comparePortableStrings),
        payloadPath: portablePayloadPath(index, entry.kind) as `payload/${string}`,
      };
    }
    const definition = parseMcpDefinition(entry.definition, `MCP ${entry.id}`);
    const bytes = canonicalJsonBytes(definition);
    return {
      kind: "mcp",
      id: entry.id,
      definition,
      payloadPath: portablePayloadPath(index, entry.kind) as `payload/${string}/record.json`,
      sizeBytes: bytes.byteLength,
      integrity: sha256Integrity(bytes),
    };
  });
  return parsePortableInventoryManifest({
    schema: PORTABLE_INVENTORY_SCHEMA,
    schemaVersion: PORTABLE_INVENTORY_SCHEMA_VERSION,
    entries: portableEntries,
  });
}
