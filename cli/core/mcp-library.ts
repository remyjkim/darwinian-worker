// ABOUTME: Stores user-registered reusable MCP server definitions.
// ABOUTME: Keeps MCP inventory separate from global defaults and project activation.

import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveMcpLibraryPath } from "./paths";
import { resolveStoreMcpServerFile, resolveStoreMcpServersDir, resolveStoreMetadataPath } from "./store-paths";
import type { RegistryServer, UserMcpLibrary } from "./types";

export { resolveMcpLibraryPath };

function useStoreLayout(agentsDir: string) {
  return existsSync(resolveStoreMetadataPath(agentsDir));
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
  if (useStoreLayout(agentsDir)) {
    const dir = resolveStoreMcpServersDir(agentsDir);
    if (!existsSync(dir)) {
      return { version: 1, servers: {} };
    }
    const servers: UserMcpLibrary["servers"] = {};
    const entries = await import("node:fs/promises").then(({ readdir }) => readdir(dir, { withFileTypes: true }));
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = entry.name.slice(0, -".json".length);
      const server = JSON.parse(await readFile(join(dir, entry.name), "utf8")) as unknown;
      validateMcpLibraryServer(id, server);
      servers[id] = server;
    }
    return { version: 1, servers };
  }
  const path = resolveMcpLibraryPath(agentsDir);
  if (!existsSync(path)) {
    return { version: 1, servers: {} };
  }
  const parsed = JSON.parse(await readFile(path, "utf8")) as UserMcpLibrary;
  validateMcpLibrary(parsed);
  return parsed;
}

export async function saveMcpLibrary(agentsDir: string, library: UserMcpLibrary) {
  validateMcpLibrary(library);
  if (useStoreLayout(agentsDir)) {
    const dir = resolveStoreMcpServersDir(agentsDir);
    mkdirSync(dir, { recursive: true });
    const { rm } = await import("node:fs/promises");
    if (existsSync(dir)) {
      for (const entry of await import("node:fs/promises").then(({ readdir }) => readdir(dir, { withFileTypes: true }))) {
        if (entry.isFile() && entry.name.endsWith(".json")) {
          await rm(join(dir, entry.name), { force: true });
        }
      }
    }
    for (const [id, server] of Object.entries(library.servers)) {
      const path = resolveStoreMcpServerFile(agentsDir, id);
      mkdirSync(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(server, null, 2)}\n`);
    }
    return dir;
  }
  const path = resolveMcpLibraryPath(agentsDir);
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(library, null, 2)}\n`);
  return path;
}
