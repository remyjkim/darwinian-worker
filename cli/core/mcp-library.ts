// ABOUTME: Stores user-registered reusable MCP server definitions.
// ABOUTME: Keeps MCP inventory separate from global defaults and project activation.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { isStringRecord } from "./card-manifest";
import { writeAtomically } from "./fs";
import { DrwnError } from "./errors";
import { withInventoryLock } from "./inventory-lock";
import { tombstoneInventoryPath } from "./inventory-tombstones";
import { sanitizeMcpServerSecrets } from "./mcp-secret-policy";
import { assertStoreWritable, resolveStoreMcpServerFile, resolveStoreMcpServersDir } from "./store-paths";
import type { RegistryServer, UserMcpLibrary } from "./types";

export type McpRecordCommitCheckpoint = "before-record-write" | "after-record-write";

export interface McpRecordMutationOptions {
  reservedIds?: Iterable<string>;
  checkpoint?: (checkpoint: McpRecordCommitCheckpoint) => void | Promise<void>;
}

export function validateMcpLibraryServer(id: string, server: unknown): asserts server is RegistryServer {
  const candidate = server as Partial<RegistryServer> | undefined;
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Invalid MCP server "${id}": expected object`);
  }
  if (!candidate.description || typeof candidate.description !== "string") {
    throw new Error(`Invalid MCP server "${id}": missing description`);
  }
  if (!candidate.transport || typeof candidate.transport !== "string") {
    throw new Error(`Invalid MCP server "${id}": missing transport`);
  }
  if (candidate.transport === "stdio" && (!candidate.command || typeof candidate.command !== "string")) {
    throw new Error(`Invalid MCP server "${id}": stdio transport requires command`);
  }
  if ((candidate.transport === "http" || candidate.transport === "sse") && (!candidate.url || typeof candidate.url !== "string")) {
    throw new Error(`Invalid MCP server "${id}": ${candidate.transport} transport requires url`);
  }
  if (candidate.headers !== undefined && !isStringRecord(candidate.headers)) {
    throw new Error(`Invalid MCP server "${id}": headers must be a string-to-string map`);
  }
  if (typeof candidate.optional !== "boolean") {
    throw new Error(`Invalid MCP server "${id}": missing optional flag`);
  }
}

export function validateMcpLibrary(library: UserMcpLibrary) {
  if (library.version !== 1) {
    throw new Error(`Unsupported MCP library version: ${String(library.version)}`);
  }
  for (const [id, server] of Object.entries(library.servers ?? {})) {
    validateMcpLibraryServer(id, server);
  }
}

export async function loadMcpLibrary(agentsDir: string): Promise<UserMcpLibrary> {
  const dir = resolveStoreMcpServersDir(agentsDir);
  if (!existsSync(dir)) {
    return { version: 1, servers: {} };
  }
  const dirStats = await lstat(dir);
  if (!dirStats.isDirectory() || dirStats.isSymbolicLink()) {
    throw new DrwnError("INVENTORY_MCP_RECORD_INVALID", `Standalone MCP inventory is not a concrete directory: ${dir}`);
  }
  const servers: UserMcpLibrary["servers"] = {};
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
      throw new DrwnError("INVENTORY_MCP_RECORD_INVALID", `Unsupported standalone MCP inventory entry: ${join(dir, entry.name)}`);
    }
    const id = entry.name.slice(0, -".json".length);
    const path = resolveStoreMcpServerFile(agentsDir, id);
    try {
      const server = JSON.parse(await readFile(path, "utf8")) as unknown;
      validateMcpLibraryServer(id, server);
      const sanitized = sanitizeMcpServerSecrets(id, server);
      if (JSON.stringify(sanitized) !== JSON.stringify(server)) {
        throw new Error("record contains a resolved secret value instead of a secret reference");
      }
      servers[id] = server;
    } catch (error) {
      throw new DrwnError("INVENTORY_MCP_RECORD_INVALID", `Invalid standalone MCP record: ${path}`, undefined, error);
    }
  }
  return { version: 1, servers };
}

function stageMcpRecord(id: string, server: RegistryServer) {
  const sanitized = sanitizeMcpServerSecrets(id, server);
  validateMcpLibraryServer(id, sanitized);
  const bytes = `${JSON.stringify(sanitized, null, 2)}\n`;
  return {
    server: sanitized,
    bytes,
    integrity: `sha256-${createHash("sha256").update(bytes).digest("hex")}` as const,
  };
}

function assertMcpIdAvailable(id: string, reservedIds: Set<string>) {
  if (reservedIds.has(id)) {
    throw new Error(`MCP server "${id}" is owned by the immutable bundled registry.`);
  }
}

async function writeMcpRecordUnlocked(agentsDir: string, id: string, bytes: string) {
  const path = resolveStoreMcpServerFile(agentsDir, id);
  await writeAtomically(path, bytes);
  return path;
}

export async function createMcpLibraryRecord(
  agentsDir: string,
  id: string,
  server: RegistryServer,
  options: McpRecordMutationOptions = {},
) {
  const staged = stageMcpRecord(id, server);
  const reservedIds = new Set(options.reservedIds ?? []);
  assertMcpIdAvailable(id, reservedIds);
  return withInventoryLock(agentsDir, async () => {
    assertStoreWritable();
    assertMcpIdAvailable(id, reservedIds);
    const revalidated = stageMcpRecord(id, JSON.parse(staged.bytes) as RegistryServer);
    if (revalidated.integrity !== staged.integrity) {
      throw new Error(`MCP record staging changed before commit: ${id}`);
    }
    const path = resolveStoreMcpServerFile(agentsDir, id);
    if (existsSync(path)) throw new Error(`MCP server "${id}" already exists in standalone inventory.`);
    await options.checkpoint?.("before-record-write");
    const written = await writeMcpRecordUnlocked(agentsDir, id, staged.bytes);
    await options.checkpoint?.("after-record-write");
    return { id, path: written, integrity: staged.integrity, action: "added" as const };
  });
}

export async function updateMcpLibraryRecord(
  agentsDir: string,
  id: string,
  server: RegistryServer,
  options: McpRecordMutationOptions = {},
) {
  const staged = stageMcpRecord(id, server);
  const reservedIds = new Set(options.reservedIds ?? []);
  assertMcpIdAvailable(id, reservedIds);
  return withInventoryLock(agentsDir, async () => {
    assertStoreWritable();
    assertMcpIdAvailable(id, reservedIds);
    const revalidated = stageMcpRecord(id, JSON.parse(staged.bytes) as RegistryServer);
    if (revalidated.integrity !== staged.integrity) {
      throw new Error(`MCP record staging changed before commit: ${id}`);
    }
    const path = resolveStoreMcpServerFile(agentsDir, id);
    if (!existsSync(path)) throw new Error(`MCP server "${id}" is not installed in standalone inventory.`);
    await options.checkpoint?.("before-record-write");
    const written = await writeMcpRecordUnlocked(agentsDir, id, staged.bytes);
    await options.checkpoint?.("after-record-write");
    return { id, path: written, integrity: staged.integrity, action: "updated" as const };
  });
}

export async function removeMcpLibraryRecord(agentsDir: string, id: string) {
  return withInventoryLock(agentsDir, async () => {
    assertStoreWritable();
    const path = resolveStoreMcpServerFile(agentsDir, id);
    if (!existsSync(path)) throw new Error(`MCP server "${id}" is not installed in standalone inventory.`);
    return { id, ...(await tombstoneInventoryPath({ agentsDir, kind: "mcp", sourcePath: path })) };
  });
}
