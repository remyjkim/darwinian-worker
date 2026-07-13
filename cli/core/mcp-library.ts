// ABOUTME: Stores user-registered reusable MCP server definitions.
// ABOUTME: Keeps MCP inventory separate from global defaults and project activation.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isStringRecord } from "./card-manifest";
import { resolveMcpLibraryPath } from "./paths";
import { writeAtomically } from "./fs";
import { withInventoryLock } from "./inventory-lock";
import { tombstoneInventoryPath } from "./inventory-tombstones";
import { assertStoreWritable, resolveStoreMcpServerFile, resolveStoreMcpServersDir } from "./store-paths";
import type { RegistryServer, UserMcpLibrary } from "./types";

export { resolveMcpLibraryPath };

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
  const servers: UserMcpLibrary["servers"] = {};
  const entries = await import("node:fs/promises").then(({ readdir }) => readdir(dir, { withFileTypes: true }));
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.startsWith(".")) continue;
    const id = entry.name.slice(0, -".json".length);
    const server = JSON.parse(await readFile(join(dir, entry.name), "utf8")) as unknown;
    validateMcpLibraryServer(id, server);
    servers[id] = server;
  }
  return { version: 1, servers };
}

export async function saveMcpLibrary(agentsDir: string, library: UserMcpLibrary) {
  validateMcpLibrary(library);
  return withInventoryLock(agentsDir, async () => {
    assertStoreWritable();
    for (const [id, server] of Object.entries(library.servers)) {
      await writeMcpRecordUnlocked(agentsDir, id, server);
    }
    return resolveStoreMcpServersDir(agentsDir);
  });
}

async function writeMcpRecordUnlocked(agentsDir: string, id: string, server: RegistryServer) {
  validateMcpLibraryServer(id, server);
  const path = resolveStoreMcpServerFile(agentsDir, id);
  await writeAtomically(path, `${JSON.stringify(server, null, 2)}\n`);
  return path;
}

export async function createMcpLibraryRecord(agentsDir: string, id: string, server: RegistryServer) {
  validateMcpLibraryServer(id, server);
  return withInventoryLock(agentsDir, async () => {
    assertStoreWritable();
    const path = resolveStoreMcpServerFile(agentsDir, id);
    if (existsSync(path)) throw new Error(`MCP server "${id}" already exists in standalone inventory.`);
    return { id, path: await writeMcpRecordUnlocked(agentsDir, id, server), action: "added" as const };
  });
}

export async function updateMcpLibraryRecord(agentsDir: string, id: string, server: RegistryServer) {
  validateMcpLibraryServer(id, server);
  return withInventoryLock(agentsDir, async () => {
    assertStoreWritable();
    const path = resolveStoreMcpServerFile(agentsDir, id);
    if (!existsSync(path)) throw new Error(`MCP server "${id}" is not installed in standalone inventory.`);
    return { id, path: await writeMcpRecordUnlocked(agentsDir, id, server), action: "updated" as const };
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
